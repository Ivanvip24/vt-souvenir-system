#!/usr/bin/env python3
"""
Backend Integration for AXKAN Order Generator
==============================================
Sends orders to the VT Souvenir System backend API.

This module provides functions to:
1. Create orders in the backend database
2. Sync orders with Notion via the backend
3. Upload images and get URLs for tracking

Usage:
    from backend_integration import BackendIntegration

    backend = BackendIntegration()
    result = backend.create_order(order_data)
"""

import os
import json
import base64
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class BackendIntegration:
    """Integration with VT Souvenir System Backend"""

    def __init__(self, base_url=None):
        """
        Initialize backend integration.

        Args:
            base_url: Backend API URL. Defaults to environment variable or localhost.
        """
        self.base_url = base_url or os.getenv('BACKEND_URL', 'http://localhost:3000')
        self.timeout = 30

    def _make_request(self, method, endpoint, data=None, json_data=None):
        """Make HTTP request to backend"""
        url = f"{self.base_url}{endpoint}"

        try:
            if method == 'GET':
                response = requests.get(url, params=data, timeout=self.timeout)
            elif method == 'POST':
                response = requests.post(url, json=json_data, timeout=self.timeout)
            elif method == 'PATCH':
                response = requests.patch(url, json=json_data, timeout=self.timeout)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            print(f"Backend request failed: {e}")
            raise

    def health_check(self):
        """Check if backend is running"""
        try:
            result = self._make_request('GET', '/health')
            return result.get('status') == 'ok'
        except Exception:
            return False

    def create_order(self, order_data):
        """
        Create a new order in the backend system.

        Args:
            order_data: Dictionary containing:
                - clientName: str (required)
                - clientPhone: str (required)
                - clientEmail: str (optional)
                - clientAddress: str (optional)
                - clientCity: str (optional)
                - clientState: str (optional)
                - items: list of items (required)
                    - productName: str
                    - quantity: int
                    - unitPrice: float
                    - unitCost: float (optional)
                - totalPrice: float
                - productionCost: float (optional)
                - notes: str (optional)
                - eventType: str (optional)
                - eventDate: str (optional) YYYY-MM-DD format

        Returns:
            dict with success status, orderId, orderNumber, notionPageId
        """
        # Validate required fields
        required = ['clientName', 'clientPhone', 'items']
        for field in required:
            if field not in order_data:
                raise ValueError(f"Missing required field: {field}")

        # Calculate totals if not provided
        if 'totalPrice' not in order_data:
            order_data['totalPrice'] = sum(
                item.get('quantity', 0) * item.get('unitPrice', 0)
                for item in order_data['items']
            )

        result = self._make_request('POST', '/api/orders', json_data=order_data)

        if result.get('success'):
            print(f"Order created: {result.get('data', {}).get('orderNumber')}")
            return result.get('data')
        else:
            raise Exception(result.get('error', 'Unknown error'))

    def get_orders(self, filters=None):
        """
        Get orders from backend with optional filters.

        Args:
            filters: dict with optional keys:
                - status: Order status
                - department: Department filter
                - client: Client name (partial match)
                - from: Start date
                - to: End date

        Returns:
            List of orders
        """
        result = self._make_request('GET', '/api/orders', data=filters)

        if result.get('success'):
            return result.get('data', [])
        else:
            raise Exception(result.get('error', 'Unknown error'))

    def get_order(self, order_id):
        """Get single order by ID"""
        result = self._make_request('GET', f'/api/orders/{order_id}')

        if result.get('success'):
            return result.get('data')
        else:
            raise Exception(result.get('error', 'Unknown error'))

    def update_order_status(self, order_id, status):
        """Update order status"""
        result = self._make_request('PATCH', f'/api/orders/{order_id}/status',
                                   json_data={'status': status})

        if result.get('success'):
            return result.get('data')
        else:
            raise Exception(result.get('error', 'Unknown error'))

    def sync_to_notion(self, order_id):
        """Sync order to Notion"""
        result = self._make_request('POST', f'/api/orders/{order_id}/sync')

        if result.get('success'):
            return result.get('data')
        else:
            raise Exception(result.get('error', 'Unknown error'))


def convert_generator_to_backend_format(order_name, instructions, designs):
    """
    Convert ORDERS_GENERATOR data format to backend API format.

    Args:
        order_name: Name/title of the order
        instructions: Order instructions/notes
        designs: List of design dicts with 'type', 'quantity', 'image_path'

    Returns:
        dict formatted for backend API
    """
    # Map design types to product names (Spanish)
    type_map = {
        'Imanes': 'Imanes Personalizados',
        'Llaveros': 'Llaveros Personalizados',
        'Destapadores': 'Destapadores Personalizados',
        'Portallaves': 'Portallaves Personalizados',
    }

    # Default prices per product type
    default_prices = {
        'Imanes': 25.00,
        'Llaveros': 35.00,
        'Destapadores': 45.00,
        'Portallaves': 55.00,
    }

    default_costs = {
        'Imanes': 8.00,
        'Llaveros': 12.00,
        'Destapadores': 15.00,
        'Portallaves': 18.00,
    }

    # Convert designs to order items
    items = []
    for i, design in enumerate(designs):
        design_type = design.get('type', 'Imanes')
        quantity = design.get('quantity', 0)

        items.append({
            'productName': type_map.get(design_type, design_type),
            'quantity': quantity,
            'unitPrice': default_prices.get(design_type, 25.00),
            'unitCost': default_costs.get(design_type, 8.00),
        })

    # Calculate totals
    total_price = sum(item['quantity'] * item['unitPrice'] for item in items)
    production_cost = sum(item['quantity'] * item['unitCost'] for item in items)

    return {
        'clientName': order_name,  # Use order name as client name initially
        'clientPhone': '0000000000',  # Placeholder - will be updated
        'notes': instructions,
        'items': items,
        'totalPrice': total_price,
        'productionCost': production_cost,
        'status': 'new',
        'department': 'design',
    }


def send_order_to_backend(order_name, instructions, designs, client_info=None):
    """
    Send order from ORDERS_GENERATOR to backend.

    Args:
        order_name: Name of the order
        instructions: Order instructions
        designs: List of design dictionaries
        client_info: Optional dict with client details:
            - name: Client name
            - phone: Client phone (required for real orders)
            - email: Client email
            - address: Client address
            - city: Client city
            - state: Client state

    Returns:
        Backend response with order details
    """
    backend = BackendIntegration()

    # Check backend health
    if not backend.health_check():
        raise ConnectionError("Backend is not available. Make sure it's running.")

    # Convert to backend format
    order_data = convert_generator_to_backend_format(order_name, instructions, designs)

    # Override with client info if provided
    if client_info:
        if 'name' in client_info:
            order_data['clientName'] = client_info['name']
        if 'phone' in client_info:
            order_data['clientPhone'] = client_info['phone']
        if 'email' in client_info:
            order_data['clientEmail'] = client_info['email']
        if 'address' in client_info:
            order_data['clientAddress'] = client_info['address']
        if 'city' in client_info:
            order_data['clientCity'] = client_info['city']
        if 'state' in client_info:
            order_data['clientState'] = client_info['state']

    # Create order
    result = backend.create_order(order_data)

    return result


# CLI for testing
if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Backend Integration CLI')
    parser.add_argument('--test', action='store_true', help='Run health check')
    parser.add_argument('--list', action='store_true', help='List recent orders')
    parser.add_argument('--create', type=str, help='Create test order with given name')

    args = parser.parse_args()

    backend = BackendIntegration()

    if args.test:
        if backend.health_check():
            print("Backend is running and healthy!")
        else:
            print("Backend is not available.")

    elif args.list:
        orders = backend.get_orders()
        print(f"Found {len(orders)} orders:")
        for order in orders[:10]:
            print(f"  - {order.get('orderNumber')}: {order.get('clientName')} (${order.get('totalPrice')})")

    elif args.create:
        # Create test order
        test_designs = [
            {'type': 'Imanes', 'quantity': 100},
            {'type': 'Llaveros', 'quantity': 50},
        ]

        result = send_order_to_backend(
            order_name=args.create,
            instructions="Test order from CLI",
            designs=test_designs,
            client_info={
                'name': 'Test Client',
                'phone': '5551234567',
                'email': 'test@example.com'
            }
        )

        print(f"Order created!")
        print(f"  Order Number: {result.get('orderNumber')}")
        print(f"  Order ID: {result.get('orderId')}")
        if result.get('notionPageId'):
            print(f"  Notion Page: {result.get('notionPageUrl')}")
    else:
        parser.print_help()

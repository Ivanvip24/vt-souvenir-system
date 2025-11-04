# API Reference

Complete API documentation for the Souvenir Management System.

Base URL: `http://localhost:3000`

---

## Authentication

Currently, the API does not require authentication. For production use, consider adding API key authentication.

---

## Health Check

### GET /health

Check if the service is running and database is connected.

**Response:**
```json
{
  "status": "ok",
  "service": "Souvenir Management System",
  "database": "connected",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

## Orders API

### Create Order

**POST** `/api/orders`

Creates a new order in both the local database and Notion.

**Request Body:**
```json
{
  "clientName": "María González",
  "clientPhone": "5512345678",
  "clientAddress": "Av. Juárez 123",
  "clientCity": "Guadalajara",
  "clientState": "Jalisco",
  "totalPrice": 750.00,
  "productionCost": 150.00,
  "items": [
    {
      "productName": "Quinceañera Souvenir",
      "quantity": 50,
      "unitPrice": 10.00,
      "unitCost": 2.00
    }
  ],
  "notes": "Rush order",
  "priority": "high",
  "deliveryDate": "2024-02-15"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderId": 123,
    "orderNumber": "ORD-20240115-1234",
    "notionPageId": "a1b2c3d4e5f67890abcdef1234567890",
    "notionPageUrl": "https://notion.so/..."
  }
}
```

---

### Get Orders

**GET** `/api/orders`

Query orders with optional filters.

**Query Parameters:**
- `status` - Filter by status (new, design, printing, etc.)
- `department` - Filter by department
- `client` - Filter by client name
- `from` - Start date (YYYY-MM-DD)
- `to` - End date (YYYY-MM-DD)

**Example:**
```bash
GET /api/orders?status=printing&from=2024-01-01
```

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 5,
    "data": [
      {
        "notionPageId": "...",
        "orderNumber": "ORD-20240115-1234",
        "clientName": "María González",
        "totalPrice": 750.00,
        "status": "printing"
      }
    ]
  }
}
```

---

### Get Single Order

**GET** `/api/orders/:pageId`

Retrieve a specific order by Notion page ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "notionPageId": "...",
    "orderNumber": "ORD-20240115-1234",
    "clientName": "María González",
    "clientPhone": "5512345678",
    "totalPrice": 750.00,
    "status": "printing",
    "items": [...]
  }
}
```

---

### Update Order Status

**PATCH** `/api/orders/:orderId/status`

Update the status of an order (syncs to Notion).

**Request Body:**
```json
{
  "status": "printing"
}
```

**Valid statuses:**
- `new`
- `design`
- `printing`
- `cutting`
- `counting`
- `shipping`
- `delivered`
- `cancelled`

**Response:**
```json
{
  "success": true,
  "message": "Status updated successfully",
  "data": {
    "orderId": 123,
    "newStatus": "printing"
  }
}
```

---

### Sync Order to Notion

**POST** `/api/orders/:orderId/sync`

Manually sync a local order to Notion.

**Response:**
```json
{
  "success": true,
  "message": "Order synced to Notion successfully",
  "data": {
    "orderId": 123,
    "notionPageId": "...",
    "action": "updated"
  }
}
```

---

### Bulk Sync Orders

**POST** `/api/orders/sync/bulk`

Sync multiple orders to Notion at once.

**Request Body:**
```json
{
  "limit": 100
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk sync completed",
  "data": {
    "total": 50,
    "synced": 48,
    "failed": 2,
    "errors": [...]
  }
}
```

---

## Analytics API

### Get Analytics Summary

**GET** `/api/analytics`

Get comprehensive analytics for a specified period.

**Query Parameters:**
- `period` - Period type (today, yesterday, this_week, last_week, this_month, last_month, this_year)

**Example:**
```bash
GET /api/analytics?period=this_month
```

**Response:**
```json
{
  "success": true,
  "data": {
    "periodType": "this_month",
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "revenue": {
      "orderCount": 25,
      "revenue": 15000.00,
      "costs": 3000.00,
      "profit": 12000.00,
      "profitMargin": 80.00,
      "avgOrderValue": 600.00
    },
    "comparison": {
      "revenueChangePercent": 15.5,
      "profitChangePercent": 18.2,
      "orderCountChange": 5
    },
    "topProducts": [...],
    "topClients": [...],
    "lowMarginOrders": [...],
    "productionMetrics": {...}
  }
}
```

---

### Get Revenue

**GET** `/api/analytics/revenue`

Get revenue data for a specific date range.

**Query Parameters:**
- `startDate` - Start date (YYYY-MM-DD) **required**
- `endDate` - End date (YYYY-MM-DD) **required**

**Example:**
```bash
GET /api/analytics/revenue?startDate=2024-01-01&endDate=2024-01-31
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "orderCount": 25,
    "revenue": 15000.00,
    "costs": 3000.00,
    "profit": 12000.00,
    "profitMargin": 80.00,
    "avgOrderValue": 600.00
  }
}
```

---

### Get Top Products

**GET** `/api/analytics/products/top`

Get best-selling products for a period.

**Query Parameters:**
- `period` - Period type (default: this_month)
- `limit` - Number of products to return (default: 10)

**Example:**
```bash
GET /api/analytics/products/top?period=this_month&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "productName": "Quinceañera Souvenir",
      "timesOrdered": 15,
      "totalQuantity": 750,
      "revenue": 7500.00,
      "cost": 1500.00,
      "profit": 6000.00,
      "profitMargin": 80.00
    }
  ]
}
```

---

### Get Top Clients

**GET** `/api/analytics/clients/top`

Get top clients by revenue for a period.

**Query Parameters:**
- `period` - Period type (default: this_month)
- `limit` - Number of clients to return (default: 10)

**Example:**
```bash
GET /api/analytics/clients/top?period=this_month&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "clientName": "María González",
      "clientPhone": "5512345678",
      "orderCount": 5,
      "totalSpent": 3500.00,
      "totalProfit": 2800.00,
      "avgOrderValue": 700.00,
      "lastOrderDate": "2024-01-15"
    }
  ]
}
```

---

## Reports API

### Send Daily Report

**POST** `/api/reports/daily/send`

Manually trigger daily report generation and email delivery.

**Request Body (optional):**
```json
{
  "date": "2024-01-15"
}
```

If no date provided, uses previous day.

**Response:**
```json
{
  "success": true,
  "message": "Daily report sent successfully",
  "data": {
    "messageId": "...",
    "recipients": "owner@company.com,manager@company.com"
  }
}
```

---

### Send Monthly Report

**POST** `/api/reports/monthly/send`

Manually trigger monthly report generation and email delivery.

**Request Body:**
```json
{
  "year": 2024,
  "month": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Monthly report sent successfully",
  "data": {
    "messageId": "...",
    "recipients": "owner@company.com"
  }
}
```

---

### Get Scheduled Jobs

**GET** `/api/reports/schedule`

Get information about scheduled report jobs.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "daily-report",
      "name": "Daily Report",
      "schedule": "0 8 * * *",
      "description": "Sends daily revenue and order report",
      "nextRun": "Mañana, 15 de enero de 2024, 08:00"
    }
  ]
}
```

---

## Testing API

### Test Email Configuration

**POST** `/api/test/email`

Send a test email to verify email configuration.

**Response:**
```json
{
  "success": true,
  "message": "Email configuration is valid and test email sent"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid parameters)
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

Currently, there is no rate limiting. For production use, consider implementing rate limiting.

---

## Webhooks (Future)

Future versions may support webhooks for:
- Order status changes
- Low margin alerts
- Report generation completion

---

## Examples

### Complete Order Workflow

```bash
# 1. Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Test Client",
    "clientPhone": "5512345678",
    "totalPrice": 500,
    "productionCost": 100,
    "items": [{"productName": "Test", "quantity": 10, "unitPrice": 50, "unitCost": 10}]
  }'

# 2. Get order ID from response
# 3. Update status
curl -X PATCH http://localhost:3000/api/orders/123/status \
  -H "Content-Type: application/json" \
  -d '{"status": "printing"}'

# 4. Check analytics
curl http://localhost:3000/api/analytics?period=today

# 5. Send report
curl -X POST http://localhost:3000/api/reports/daily/send
```

### Analytics Dashboard Workflow

```bash
# Get this month's summary
curl http://localhost:3000/api/analytics?period=this_month

# Get top products
curl http://localhost:3000/api/analytics/products/top?limit=10

# Get top clients
curl http://localhost:3000/api/analytics/clients/top?limit=10

# Get revenue for specific range
curl "http://localhost:3000/api/analytics/revenue?startDate=2024-01-01&endDate=2024-01-31"
```

---

## Integration Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

async function createOrder(orderData) {
  const response = await axios.post('http://localhost:3000/api/orders', orderData);
  return response.data;
}

async function getAnalytics(period = 'this_month') {
  const response = await axios.get(`http://localhost:3000/api/analytics?period=${period}`);
  return response.data;
}
```

### Python

```python
import requests

def create_order(order_data):
    response = requests.post(
        'http://localhost:3000/api/orders',
        json=order_data
    )
    return response.json()

def get_analytics(period='this_month'):
    response = requests.get(
        f'http://localhost:3000/api/analytics?period={period}'
    )
    return response.json()
```

### cURL

```bash
# Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d @order.json

# Get analytics
curl "http://localhost:3000/api/analytics?period=this_month" \
  | jq .
```

---

**For more information, see the main README.md and SETUP_GUIDE.md**

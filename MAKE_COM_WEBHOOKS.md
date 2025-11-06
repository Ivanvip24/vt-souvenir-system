# Make.com Webhook Integration Guide

## Overview

Your backend now has webhook endpoints that Make.com can use to automate business processes. All webhooks are secured with a secret key.

## Setup

### 1. Set Environment Variable

Add to your `.env` file and Render environment variables:

```env
MAKE_WEBHOOK_SECRET=your-secret-key-here-change-this
```

**IMPORTANT**: Change the default secret before deploying to production!

### 2. Webhook Base URL

Once deployed on Render, your webhook base URL will be:
```
https://vt-souvenir-backend.onrender.com/api/webhooks
```

---

## Available Webhook Endpoints

### Authentication

All webhook requests must include the secret in one of two ways:

**Option 1 - Header:**
```
X-Webhook-Secret: your-secret-key-here
```

**Option 2 - Query Parameter:**
```
?secret=your-secret-key-here
```

---

## Webhook Endpoints Reference

### 1. Test Connection

**Purpose:** Verify Make.com can connect to your webhook

**Endpoint:**
```
GET /api/webhooks/test?secret=YOUR_SECRET
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook endpoint is working!",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "server": "Souvenir Management System"
}
```

**Make.com Setup:**
1. Add HTTP module → Make a request
2. URL: `https://vt-souvenir-backend.onrender.com/api/webhooks/test?secret=YOUR_SECRET`
3. Method: GET
4. Run once to verify

---

### 2. Get Pending Orders

**Purpose:** Fetch orders that need follow-up (for event reminders, payment reminders)

**Endpoint:**
```
GET /api/webhooks/pending-orders?secret=YOUR_SECRET&days_until_event=7&status=approved
```

**Query Parameters:**
- `secret` (required): Your webhook secret
- `days_until_event` (optional): Filter orders with events in next X days
- `status` (optional): Filter by order status (pending, approved, in_production, etc.)

**Response:**
```json
{
  "success": true,
  "count": 3,
  "orders": [
    {
      "id": 1,
      "order_number": "VT-2025-001",
      "client_name": "María García",
      "client_phone": "5551234567",
      "client_email": "maria@example.com",
      "event_date": "2025-01-20",
      "total_price": 5000.00,
      "remaining_balance": 2500.00,
      "status": "approved",
      "days_until_event": 5
    }
  ]
}
```

**Make.com Scenario Example - Event Reminders:**
```
Schedule → Every day at 9 AM
  ↓
HTTP: Get Pending Orders (days_until_event=3)
  ↓
Iterator: Loop through each order
  ↓
WhatsApp: Send message
  Template: "Hola {{client_name}}, tu evento es en {{days_until_event}} días.
             Tu pedido {{order_number}} está {{status}}."
```

---

### 3. Get Order Details

**Purpose:** Fetch complete order information by order number or ID

**Endpoint:**
```
GET /api/webhooks/order/VT-2025-001?secret=YOUR_SECRET
GET /api/webhooks/order/123?secret=YOUR_SECRET
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": 1,
    "order_number": "VT-2025-001",
    "client_name": "María García",
    "client_phone": "5551234567",
    "client_email": "maria@example.com",
    "total_price": 5000.00,
    "status": "approved",
    "items": [
      {
        "product_name": "Imanes de MDF",
        "quantity": 100,
        "unit_price": 50.00
      }
    ]
  }
}
```

---

### 4. Get Low Inventory

**Purpose:** Check which materials are running low for supplier automation

**Endpoint:**
```
GET /api/webhooks/low-inventory?secret=YOUR_SECRET
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "materials": [
    {
      "material_name": "Imán circular 5cm",
      "current_quantity": 50,
      "minimum_quantity": 200,
      "shortage_amount": 150,
      "unit_of_measure": "piezas"
    }
  ]
}
```

**Make.com Scenario Example - Auto Supplier Alert:**
```
Schedule → Daily at 8 AM
  ↓
HTTP: Get Low Inventory
  ↓
Filter: Only if count > 0
  ↓
Iterator: Loop materials
  ↓
WhatsApp Business: Send to supplier
  Template: "Necesitamos {{shortage_amount}} {{unit_of_measure}} de {{material_name}}"
```

---

### 5. Get Daily Analytics

**Purpose:** Fetch sales/revenue data for Google Sheets sync

**Endpoint:**
```
GET /api/webhooks/analytics/daily?secret=YOUR_SECRET&date=2025-01-15
```

**Query Parameters:**
- `secret` (required)
- `date` (optional): YYYY-MM-DD format, defaults to today

**Response:**
```json
{
  "success": true,
  "date": "2025-01-15",
  "summary": {
    "order_count": 5,
    "total_revenue": 15000.00,
    "total_cost": 7500.00,
    "total_profit": 7500.00,
    "avg_margin": 50.5
  },
  "top_products": [
    {
      "product_name": "Imanes de MDF",
      "units_sold": 250,
      "revenue": 8000.00
    }
  ],
  "low_margin_orders": [
    {
      "order_number": "VT-2025-002",
      "client_name": "Juan Pérez",
      "profit_margin": 15.2,
      "total_price": 3000.00
    }
  ]
}
```

**Make.com Scenario Example - Daily Google Sheets Update:**
```
Schedule → Every day at 11 PM
  ↓
HTTP: Get Daily Analytics
  ↓
Google Sheets: Add row to "Daily Sales" sheet
  Row data:
    - Date: {{date}}
    - Orders: {{summary.order_count}}
    - Revenue: {{summary.total_revenue}}
    - Profit: {{summary.total_profit}}
    - Margin %: {{summary.avg_margin}}
  ↓
If low_margin_orders.length > 0:
  WhatsApp: Alert admin about low margin orders
```

---

### 6. Update Order Status

**Purpose:** Change order status from Make.com (after WhatsApp confirmation, etc.)

**Endpoint:**
```
POST /api/webhooks/order/123/status?secret=YOUR_SECRET
```

**Request Body:**
```json
{
  "status": "in_production",
  "notes": "Cliente confirmó diseño por WhatsApp"
}
```

**Valid Statuses:**
- `pending`
- `approved`
- `in_production`
- `ready`
- `shipped`
- `delivered`
- `cancelled`

**Response:**
```json
{
  "success": true,
  "order": {
    "id": 123,
    "order_number": "VT-2025-001",
    "status": "in_production"
  }
}
```

**Make.com Scenario Example - WhatsApp Confirmation Flow:**
```
WhatsApp Business: Receive message
  ↓
Text Parser: Extract order number from message
  ↓
Filter: Message contains "aprobado" or "ok"
  ↓
HTTP: POST Update Status
  Body: { "status": "in_production", "notes": "Aprobado por WhatsApp" }
  ↓
WhatsApp: Reply "Gracias! Tu orden está en producción"
```

---

### 7. Filter Orders by Criteria

**Purpose:** Get orders matching specific business needs

**Endpoint:**
```
GET /api/webhooks/orders-filter?secret=YOUR_SECRET&unpaid_balance=true&event_soon=7
```

**Query Parameters:**
- `secret` (required)
- `unpaid_balance` (optional): `true` to get orders with pending payment
- `no_payment_proof` (optional): `true` for orders missing payment proof
- `event_soon` (optional): Number of days until event
- `needs_production` (optional): Orders in pending/approved status

**Response:**
```json
{
  "success": true,
  "count": 2,
  "orders": [
    {
      "id": 5,
      "order_number": "VT-2025-005",
      "client_name": "Ana López",
      "client_phone": "5559876543",
      "remaining_balance": 1500.00,
      "event_date": "2025-01-18",
      "payment_proof_url": null
    }
  ]
}
```

**Make.com Scenario Example - Payment Reminders:**
```
Schedule → Daily at 10 AM
  ↓
HTTP: Get Orders (unpaid_balance=true, event_soon=3)
  ↓
Iterator: Loop orders
  ↓
WhatsApp: Send payment reminder
  Template: "Hola {{client_name}}, tu evento es en {{days}} días.
             Falta pagar ${{remaining_balance}} MXN.
             Envía tu comprobante de pago."
```

---

### 8. Log External Event

**Purpose:** Log events happening outside your system (WhatsApp sent, Instagram inquiry, etc.)

**Endpoint:**
```
POST /api/webhooks/log-event?secret=YOUR_SECRET
```

**Request Body:**
```json
{
  "event_type": "whatsapp_sent",
  "order_id": 123,
  "description": "Recordatorio de pago enviado",
  "metadata": {
    "message_id": "wamid.abc123",
    "recipient": "5551234567"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

---

## 🔥 Top 5 Make.com Scenarios to Build

### 1. WhatsApp Order Updates

**Triggers:**
- Schedule: Every hour, check for orders that changed status
- Webhook: When order status changes in your system

**Actions:**
1. Get order details via webhook
2. Format message based on status
3. Send WhatsApp via WhatsApp Business API
4. Log event via webhook

**Message Templates:**
```
Status: approved → "¡Tu pedido {{order_number}} fue aprobado! Total: ${{total_price}}"
Status: in_production → "Tu pedido está en producción. Fecha estimada: {{event_date}}"
Status: ready → "¡Tu pedido está listo! Puedes recogerlo."
Status: shipped → "Tu pedido fue enviado. Guía: {{tracking_number}}"
```

---

### 2. Daily Sales Dashboard to Google Sheets

**Trigger:** Schedule - Every day at 11 PM

**Actions:**
1. Call `/api/webhooks/analytics/daily`
2. Add row to Google Sheets
3. Update summary charts
4. If revenue < yesterday, send alert to WhatsApp

**Google Sheets Structure:**
```
| Date       | Orders | Revenue  | Profit  | Margin % | Top Product    |
|------------|--------|----------|---------|----------|----------------|
| 2025-01-15 | 5      | 15000.00 | 7500.00 | 50.5%    | Imanes de MDF  |
```

---

### 3. Low Inventory Supplier Alerts

**Trigger:** Schedule - Daily at 8 AM

**Actions:**
1. Call `/api/webhooks/low-inventory`
2. For each low material:
   - Send WhatsApp to supplier
   - Wait for price quote reply
   - Log quote in Google Sheets
   - Notify admin for approval

---

### 4. Instagram DM → Draft Order

**Trigger:** Instagram - New Direct Message

**Actions:**
1. Extract customer name and product from message using AI/text parser
2. Search for existing customer by name
3. Create order draft in Notion or send form link via DM
4. Log inquiry in Google Sheets for tracking

---

### 5. Event Reminder Automation

**Trigger:** Schedule - Every day at 9 AM

**Actions:**
1. Call `/api/webhooks/pending-orders?event_soon=7`
2. For each order:
   - 7 days before: "Tu evento se acerca. ¿Todo ok con el pedido?"
   - 3 days before: "Recordatorio: evento en 3 días. Saldo pendiente: $X"
   - 1 day before: "¡Mañana es tu evento! Confirma horario de entrega."
3. If unpaid balance > 0: Add urgent flag to message

---

## Security Best Practices

1. **Never expose your webhook secret** in client-side code
2. **Use HTTPS only** - Render provides this automatically
3. **Rotate the secret** periodically (update .env and Make.com scenarios)
4. **Monitor webhook logs** in Render dashboard for suspicious activity
5. **Rate limit** Make.com scenarios to avoid overwhelming your server

---

## Testing Webhooks Locally

```bash
# Test from command line
curl "http://localhost:3000/api/webhooks/test?secret=change-this-in-production"

# Get pending orders
curl "http://localhost:3000/api/webhooks/pending-orders?secret=YOUR_SECRET&days_until_event=7"

# Get daily analytics
curl "http://localhost:3000/api/webhooks/analytics/daily?secret=YOUR_SECRET"
```

---

## Render Configuration

### Environment Variables to Set

In Render Dashboard → Your Service → Environment:

```
MAKE_WEBHOOK_SECRET=your-strong-secret-key-here
DATABASE_URL=postgresql://...  (auto-set by Render)
NODE_ENV=production
```

### Deploy

1. Push changes to GitHub
2. Render will auto-deploy
3. Test webhook: `https://vt-souvenir-backend.onrender.com/api/webhooks/test?secret=YOUR_SECRET`
4. If successful, configure Make.com scenarios

---

## Support

- Webhook errors? Check Render logs: Dashboard → Logs tab
- Make.com connection issues? Verify secret matches environment variable
- Need new webhook endpoint? Add to `backend/api/webhook-routes.js`

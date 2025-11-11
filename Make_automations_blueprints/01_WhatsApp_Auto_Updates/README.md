# WhatsApp Auto-Updates Blueprint

**Priority:** ⭐⭐⭐⭐⭐ CRITICAL
**Time to Build:** 30-45 minutes
**Business Impact:** Saves 15 hours/week of manual messaging

---

## Overview

Automatically sends WhatsApp updates to clients based on order status changes, eliminating 90% of manual client communication.

---

## Prerequisites

### Required Make.com Apps:
- ⏰ Schedule (built-in)
- 🌐 HTTP (built-in)
- 💬 WhatsApp Business (requires WhatsApp Business API)
- 🔁 Iterator (built-in)
- 🎯 Router (built-in)

### Required Setup:
1. ✅ WhatsApp Business API account ([Meta Business](https://business.facebook.com/))
2. ✅ Your webhook secret from `.env` file: `MAKE_WEBHOOK_SECRET`
3. ✅ Backend deployed on Render: `https://vt-souvenir-backend.onrender.com`

---

## Scenario Blueprint

### Module 1: Schedule Trigger

**Type:** Schedule
**Settings:**
- Interval: Every 30 minutes
- Start time: 8:00 AM
- End time: 10:00 PM

**Why 30 minutes?** Balances real-time updates with API rate limits

---

### Module 2: Get All Active Orders

**Type:** HTTP - Make a Request
**Method:** GET
**URL:**
```
https://vt-souvenir-backend.onrender.com/api/webhooks/pending-orders?secret={{YOUR_SECRET}}&status=approved,in_production,ready
```

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Parse Response:** Yes

**Sample Response:**
```json
{
  "success": true,
  "count": 5,
  "orders": [
    {
      "id": 123,
      "order_number": "ORD-20251111-1234",
      "client_name": "María García",
      "client_phone": "5551234567",
      "client_email": "maria@example.com",
      "status": "approved",
      "total_price": 5000.00,
      "remaining_balance": 2500.00,
      "event_date": "2025-11-20",
      "days_until_event": 9
    }
  ]
}
```

---

### Module 3: Filter - Only If Orders Exist

**Type:** Filter
**Condition:**
```
{{2.count}} greater than 0
```

**Label:** "Has orders to process"

---

### Module 4: Iterator - Loop Through Orders

**Type:** Iterator
**Array:** `{{2.orders}}`

**This will run the next modules once for each order**

---

### Module 5: Router - Split by Status

**Type:** Router
**Routes:** 4 routes based on order status

#### Route 1: Newly Approved Orders
**Filter:**
```
{{4.status}} equal to "approved"
AND
{{4.days_until_event}} greater than 7
```

**Next Module:** WhatsApp - Send Approval Message

---

#### Route 2: Production Status
**Filter:**
```
{{4.status}} equal to "in_production"
```

**Next Module:** WhatsApp - Send Production Update

---

#### Route 3: Ready for Pickup
**Filter:**
```
{{4.status}} equal to "ready"
AND
{{4.days_until_event}} less than or equal to 3
```

**Next Module:** WhatsApp - Send Ready Message

---

#### Route 4: Urgent - Event Soon + Unpaid
**Filter:**
```
{{4.remaining_balance}} greater than 0
AND
{{4.days_until_event}} less than or equal to 3
```

**Next Module:** WhatsApp - Send Urgent Payment Reminder

---

### Module 6a: WhatsApp - Approval Message

**Type:** WhatsApp Business - Send Template Message
**Phone Number:** `{{4.client_phone}}`
**Template Name:** `order_approved` (create in WhatsApp Business Manager)

**Message Template:**
```
¡Hola {{1}}! 🎉

Tu pedido *{{2}}* ha sido aprobado.

📦 *Resumen:*
• Total: ${{3}} MXN
• Anticipo recibido: ${{4}} MXN
• Saldo restante: ${{5}} MXN

📅 *Fecha de evento:* {{6}}

Iniciaremos la producción pronto. Te mantendremos informado del progreso.

¡Gracias por tu preferencia! 🙏

_VT Anunciando - Souvenirs Personalizados_
```

**Variables to Map:**
1. `{{4.client_name}}`
2. `{{4.order_number}}`
3. `{{4.total_price}}`
4. `{{formatNumber(4.total_price - 4.remaining_balance; 2)}}`
5. `{{4.remaining_balance}}`
6. `{{formatDate(4.event_date; "DD/MM/YYYY")}}`

---

### Module 6b: WhatsApp - Production Update

**Type:** WhatsApp Business - Send Template Message
**Phone Number:** `{{4.client_phone}}`

**Message:**
```
¡Hola {{1}}! 👷‍♂️

Tu pedido *{{2}}* está en producción.

📦 *Detalles:*
• Estado: En proceso de fabricación
• Fecha de evento: {{3}}
• Días restantes: {{4}} días

Estamos trabajando en tus productos. Te avisaremos cuando estén listos.

¿Tienes dudas? ¡Escríbenos! 💬

_VT Anunciando_
```

**Variables:**
1. `{{4.client_name}}`
2. `{{4.order_number}}`
3. `{{formatDate(4.event_date; "DD/MM/YYYY")}}`
4. `{{4.days_until_event}}`

---

### Module 6c: WhatsApp - Ready Message

**Type:** WhatsApp Business - Send Template Message
**Phone Number:** `{{4.client_phone}}`

**Message:**
```
¡Hola {{1}}! ✅

¡Tu pedido *{{2}}* está listo! 🎉

📦 *Puedes recogerlo:*
• Dirección: [TU DIRECCIÓN]
• Horario: Lunes a Viernes 9 AM - 6 PM

⚠️ *Importante:*
Saldo pendiente: ${{3}} MXN
Por favor tráelo al recoger tu pedido.

📅 Tu evento es en {{4}} días.

¡Te esperamos! 🙌

_VT Anunciando_
```

**Variables:**
1. `{{4.client_name}}`
2. `{{4.order_number}}`
3. `{{4.remaining_balance}}`
4. `{{4.days_until_event}}`

---

### Module 6d: WhatsApp - Urgent Payment

**Type:** WhatsApp Business - Send Template Message
**Phone Number:** `{{4.client_phone}}`

**Message:**
```
🚨 URGENTE - {{1}}

Tu evento es en *{{2}} días* y tenemos un saldo pendiente.

📦 *Pedido:* {{3}}
💰 *Saldo a pagar:* ${{4}} MXN

⚠️ *Para poder entregarte tu pedido necesitamos el pago completo.*

Por favor envía tu comprobante de pago lo antes posible.

Métodos de pago:
💳 Transferencia: [DATOS BANCARIOS]
💵 Efectivo: [DIRECCIÓN]

¿Necesitas ayuda? ¡Llámanos! 📞

_VT Anunciando_
```

**Variables:**
1. `{{4.client_name}}`
2. `{{4.days_until_event}}`
3. `{{4.order_number}}`
4. `{{4.remaining_balance}}`

---

### Module 7: Log Message Sent

**Type:** HTTP - Make a Request
**Method:** POST
**URL:**
```
https://vt-souvenir-backend.onrender.com/api/webhooks/log-event?secret={{YOUR_SECRET}}
```

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Body (JSON):**
```json
{
  "event_type": "whatsapp_sent",
  "order_id": {{4.id}},
  "description": "Auto WhatsApp: {{5.route_name}}",
  "metadata": {
    "phone": "{{4.client_phone}}",
    "status": "{{4.status}}",
    "timestamp": "{{now}}"
  }
}
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  [1] Schedule Trigger (Every 30 mins)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  [2] HTTP: Get Pending Orders                               │
│  URL: /api/webhooks/pending-orders?status=approved,...      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  [3] Filter: count > 0?                                     │
└────────────────────┬────────────────────────────────────────┘
                     │ YES
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  [4] Iterator: Loop through orders[]                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  [5] Router: Split by Status & Conditions                   │
├─────────────────────┬───────────────┬──────────┬────────────┤
│ Approved            │ In Production │ Ready    │ Urgent Pay │
└─────┬───────────────┴───────┬───────┴────┬─────┴──────┬─────┘
      │                       │            │            │
      ▼                       ▼            ▼            ▼
┌──────────┐          ┌──────────┐  ┌──────────┐  ┌──────────┐
│ WhatsApp │          │ WhatsApp │  │ WhatsApp │  │ WhatsApp │
│ Approval │          │Production│  │  Ready   │  │  Urgent  │
└─────┬────┘          └─────┬────┘  └─────┬────┘  └─────┬────┘
      │                     │             │             │
      └──────────┬──────────┴─────────────┴─────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  [7] HTTP: Log Event to Database                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Setup Instructions

### Step 1: Create WhatsApp Templates

Go to [Meta Business Suite](https://business.facebook.com/) → WhatsApp Manager → Message Templates

Create 4 templates:
1. `order_approved`
2. `order_in_production`
3. `order_ready`
4. `urgent_payment`

**Each must be approved by Meta (takes 1-2 business days)**

---

### Step 2: Get Your Webhook Secret

From your `.env` file or Render environment variables:
```
MAKE_WEBHOOK_SECRET=your-secret-here
```

---

### Step 3: Build Scenario in Make.com

1. Create new scenario: "WhatsApp Order Updates"
2. Add modules in order following blueprint above
3. Connect each module
4. Map variables as specified
5. Test with sample data

---

### Step 4: Test the Scenario

**Test with a real order:**

1. Go to your admin dashboard
2. Create a test order with status "approved"
3. Use your own phone number as client
4. Run the Make.com scenario manually (right-click → "Run once")
5. Check if you receive WhatsApp message

---

## Troubleshooting

### Issue: No orders returned from webhook
**Solution:** Check that orders exist with status "approved", "in_production", or "ready"

### Issue: WhatsApp not sending
**Solution:** Verify WhatsApp Business API is connected and phone number format is correct (10 digits, no spaces)

### Issue: "Unauthorized" error
**Solution:** Check your `MAKE_WEBHOOK_SECRET` matches the one in Render environment variables

---

## Advanced Customization

### Add More Status Updates

Add additional routes in the Router (Module 5):

**Shipped Status:**
```
Filter: {{4.status}} equal to "shipped"
Message: "Tu pedido está en camino! Guía: {{4.tracking_number}}"
```

**Delivered Status:**
```
Filter: {{4.status}} equal to "delivered"
Message: "¡Pedido entregado! ¿Todo ok? Califícanos: [link]"
```

### Send to Multiple Contacts

After Module 4 (Iterator), add:

```
Iterator 2: Loop through {{4.client_phone}}, {{ADMIN_PHONE}}
WhatsApp: Send to {{5.value}}
```

---

## Maintenance

### Weekly:
- Check scenario execution history for errors
- Review message delivery rates

### Monthly:
- Analyze which status triggers most messages
- Optimize message templates based on client feedback

---

## Cost Estimate

**Make.com Operations:**
- Schedule: 48 runs/day × 30 days = 1,440 ops/month
- HTTP calls: ~5 orders × 48 = 240 ops/month
- WhatsApp: ~240 messages/month
- **Total: ~2,000 operations/month**

**WhatsApp Business API:**
- First 1,000 conversations/month: FREE
- Additional: ~$0.05/conversation

**Estimated monthly cost: $0-10**

---

## Success Metrics

Track these KPIs:
- ✅ Messages sent per day
- ✅ Client response rate
- ✅ Time saved (vs manual messaging)
- ✅ Client satisfaction increase

**Target:** 95% of status updates sent automatically within 30 minutes

---

## Next Steps

Once this is working:
1. ✅ Add Payment Reminders automation (#2)
2. ✅ Integrate with Satisfaction Survey (#7)
3. ✅ Add manual override button in admin dashboard

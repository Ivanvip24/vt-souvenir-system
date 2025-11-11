# Smart Payment Reminder System Blueprint

**Priority:** ⭐⭐⭐⭐⭐ CRITICAL
**Time to Build:** 45-60 minutes
**Business Impact:** Reduces late payments from 40% to <5%, increases cash flow by $2,000/month

---

## Overview

Intelligently sends payment reminders based on event proximity and payment status. Uses escalating urgency levels to ensure payments are collected before event dates.

---

## Prerequisites

### Required Make.com Apps:
- ⏰ Schedule (built-in)
- 🌐 HTTP (built-in)
- 💬 WhatsApp Business
- 📧 Email (built-in or Gmail)
- 🔁 Iterator (built-in)
- 🎯 Router (built-in)
- 🧮 Math Operations (built-in)

### Required Setup:
1. ✅ WhatsApp Business API account
2. ✅ Gmail account for escalation emails
3. ✅ Your webhook secret: `MAKE_WEBHOOK_SECRET`
4. ✅ Backend URL: `https://vt-souvenir-backend.onrender.com`

---

## Scenario Blueprint

### Module 1: Schedule Trigger (3x Daily)

**Type:** Schedule
**Settings:**
- Run at: 9:00 AM, 2:00 PM, 6:00 PM
- Days: Monday - Saturday
- Timezone: America/Mexico_City

**Why 3x daily?** Catches clients at different times without being annoying

---

### Module 2: Get Orders with Unpaid Balance

**Type:** HTTP - Make a Request
**Method:** GET
**URL:**
```
https://vt-souvenir-backend.onrender.com/api/webhooks/orders-filter?secret={{YOUR_SECRET}}&unpaid_balance=true&event_soon=14
```

**Query Parameters Explained:**
- `unpaid_balance=true`: Only orders with remaining balance > 0
- `event_soon=14`: Events in next 14 days (adjust if needed)

**Parse Response:** Yes

**Sample Response:**
```json
{
  "success": true,
  "count": 8,
  "orders": [
    {
      "id": 45,
      "order_number": "ORD-20251111-4567",
      "client_name": "Ana López",
      "client_phone": "5559876543",
      "client_email": "ana@example.com",
      "total_price": 3000.00,
      "deposit_amount": 1500.00,
      "actual_deposit_paid": 1500.00,
      "remaining_balance": 1500.00,
      "event_date": "2025-11-15",
      "days_until_event": 4,
      "status": "in_production",
      "payment_proof_url": "https://..."
    }
  ]
}
```

---

### Module 3: Filter - Has Unpaid Orders

**Type:** Filter
**Condition:**
```
{{2.count}} greater than 0
```

---

### Module 4: Iterator - Loop Orders

**Type:** Iterator
**Array:** `{{2.orders}}`

---

### Module 5: Calculate Urgency Score

**Type:** Set Variable (Tools → Set Variable)

**Variables to Create:**

**1. Days Until Event:**
```javascript
Name: daysUntilEvent
Value: {{4.days_until_event}}
```

**2. Urgency Level:**
```javascript
Name: urgencyLevel
Value: {{if(4.days_until_event >= 7; "low"; if(4.days_until_event >= 3; "medium"; if(4.days_until_event >= 1; "high"; "critical")))}}
```

**3. Message Tone:**
```javascript
Name: tone
Value: {{if(5.urgencyLevel = "low"; "friendly"; if(5.urgencyLevel = "medium"; "reminder"; if(5.urgencyLevel = "high"; "urgent"; "critical")))}}
```

**4. Payment Percentage:**
```javascript
Name: paidPercentage
Value: {{round((4.actual_deposit_paid / 4.total_price) * 100; 0)}}
```

---

### Module 6: Router - Split by Urgency

**Type:** Router
**Routes:** 4 routes based on urgency level

#### Route 1: LOW Urgency (7-14 days)
**Filter:**
```
{{5.urgencyLevel}} equal to "low"
AND
{{current time}} hour equal to 14  (only at 2 PM)
```
**Frequency:** Once per day

---

#### Route 2: MEDIUM Urgency (3-6 days)
**Filter:**
```
{{5.urgencyLevel}} equal to "medium"
AND
({{current time}} hour equal to 9 OR {{current time}} hour equal to 18)
```
**Frequency:** Twice per day (9 AM and 6 PM)

---

#### Route 3: HIGH Urgency (1-2 days)
**Filter:**
```
{{5.urgencyLevel}} equal to "high"
```
**Frequency:** Three times per day (all scheduled times)

---

#### Route 4: CRITICAL (Event today/tomorrow)
**Filter:**
```
{{5.urgencyLevel}} equal to "critical"
AND
{{current time}} hour equal to 9
```
**Special Action:** Send WhatsApp + Email + Create admin task

---

### Module 7a: WhatsApp - LOW Urgency (Friendly)

**Type:** WhatsApp Business - Send Template
**Phone:** `{{4.client_phone}}`

**Message Template:**
```
¡Hola {{1}}! 👋

Recordatorio amigable sobre tu pedido *{{2}}*.

📊 *Resumen de pagos:*
• Total del pedido: ${{3}} MXN
• Ya pagaste: ${{4}} MXN ({{5}}%)
• Falta por pagar: ${{6}} MXN

📅 Tu evento es el {{7}} (en {{8}} días)

No hay prisa aún, pero queremos recordarte que el saldo restante debe pagarse antes de la entrega.

*Métodos de pago:*
💳 Transferencia: [CUENTA BBVA]
💵 Efectivo en tienda

¿Alguna duda? ¡Estamos para ayudarte! 😊

_VT Anunciando_
```

**Variables:**
1. `{{4.client_name}}`
2. `{{4.order_number}}`
3. `{{formatNumber(4.total_price; 2; "."; ",")}}`
4. `{{formatNumber(4.actual_deposit_paid; 2; "."; ",")}}`
5. `{{5.paidPercentage}}`
6. `{{formatNumber(4.remaining_balance; 2; "."; ",")}}`
7. `{{formatDate(4.event_date; "DD [de] MMMM"; "es")}}`
8. `{{4.days_until_event}}`

---

### Module 7b: WhatsApp - MEDIUM Urgency (Reminder)

**Type:** WhatsApp Business - Send Template
**Phone:** `{{4.client_phone}}`

**Message:**
```
Hola {{1}}, ⏰

Tu evento se acerca y queremos asegurarnos de que todo esté listo.

🎯 *Pedido:* {{2}}
📅 *Evento:* {{3}} (¡en {{4}} días!)
💰 *Saldo pendiente:* ${{5}} MXN

⚠️ *Importante:*
Para garantizar la entrega a tiempo, necesitamos que completes el pago.

*Opciones de pago:*
1️⃣ Transferencia bancaria:
   BBVA: [CUENTA]
   CLABE: [CLABE]

2️⃣ Depósito en OXXO/banco
   Tarjeta: [NÚMERO]

3️⃣ Efectivo en nuestra tienda

📸 Una vez pagado, envíanos el comprobante por aquí.

¿Necesitas ayuda? ¡Escríbenos! 💬

_VT Anunciando_
```

**Variables:**
1. `{{4.client_name}}`
2. `{{4.order_number}}`
3. `{{formatDate(4.event_date; "DD [de] MMMM")}}`
4. `{{4.days_until_event}}`
5. `{{formatNumber(4.remaining_balance; 2; "."; ",")}}`

---

### Module 7c: WhatsApp - HIGH Urgency (Urgent)

**Type:** WhatsApp Business - Send Template
**Phone:** `{{4.client_phone}}`

**Message:**
```
🚨 URGENTE - {{1}}

¡Tu evento es en {{2}} DÍAS!

📦 *Pedido:* {{3}}
💰 *SALDO PENDIENTE:* ${{4}} MXN

⚠️ *ACCIÓN REQUERIDA:*
Para poder entregar tu pedido a tiempo, necesitamos el pago completo HOY.

Tu pedido está listo pero no podemos entregarlo sin el pago final.

*PAGA AHORA:*
💳 Transferencia: [CUENTA BBVA]
📸 Envía comprobante inmediatamente

⏰ *FECHA LÍMITE: HOY {{5}}*

Si tienes algún problema, llámanos AHORA:
📞 [TU TELÉFONO]

_VT Anunciando_
```

**Variables:**
1. `{{4.client_name}}`
2. `{{4.days_until_event}}`
3. `{{4.order_number}}`
4. `{{formatNumber(4.remaining_balance; 2; "."; ",")}}`
5. `{{formatDate(now; "HH:mm")}}`

---

### Module 7d: CRITICAL Urgency (Multi-Channel)

**7d1: WhatsApp Message**
```
🔴 CRÍTICO - {{1}}

TU EVENTO ES {{2}}

Pedido: {{3}}
SALDO: ${{4}} MXN

LLAMAR AHORA: [TELÉFONO]

SIN PAGO = SIN ENTREGA

_VT Anunciando_
```

**7d2: Send Email Backup**
**Type:** Gmail - Send Email
**To:** `{{4.client_email}}`
**Subject:** `🚨 URGENTE: Pago Pendiente - Evento {{if(4.days_until_event = 0; "HOY"; "MAÑANA")}}`

**Email Body (HTML):**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .urgent { background: #fee; border: 3px solid #f00; padding: 20px; }
    .amount { font-size: 32px; font-weight: bold; color: #c00; }
  </style>
</head>
<body>
  <div class="urgent">
    <h1>⚠️ ACCIÓN INMEDIATA REQUERIDA</h1>

    <p><strong>Hola {{4.client_name}},</strong></p>

    <p>Tu evento es <strong>{{if(4.days_until_event = 0; "HOY"; "MAÑANA")}}</strong> y tenemos un saldo pendiente.</p>

    <h2>Pedido: {{4.order_number}}</h2>

    <div class="amount">
      Saldo: ${{formatNumber(4.remaining_balance; 2)}} MXN
    </div>

    <h3>🚨 SIN PAGO, NO PODEMOS ENTREGAR TU PEDIDO</h3>

    <p><strong>PAGA INMEDIATAMENTE:</strong></p>
    <ul>
      <li>Transferencia BBVA: [CUENTA]</li>
      <li>CLABE: [CLABE]</li>
      <li>Efectivo: [DIRECCIÓN TIENDA]</li>
    </ul>

    <p><strong>LLÁMANOS AHORA: [TELÉFONO]</strong></p>

    <p>Estamos disponibles para ayudarte.</p>

    <p>VT Anunciando<br>
    [DIRECCIÓN]<br>
    [TELÉFONO]</p>
  </div>
</body>
</html>
```

**7d3: Create Admin Task**
**Type:** HTTP - Make a Request
**Method:** POST
**URL:**
```
https://vt-souvenir-backend.onrender.com/api/webhooks/log-event?secret={{YOUR_SECRET}}
```

**Body:**
```json
{
  "event_type": "urgent_payment_alert",
  "order_id": {{4.id}},
  "description": "CRÍTICO: Evento {{if(4.days_until_event = 0; "HOY"; "MAÑANA")}} - Falta pagar ${{4.remaining_balance}}",
  "metadata": {
    "urgency": "critical",
    "client_phone": "{{4.client_phone}}",
    "client_email": "{{4.client_email}}",
    "action_required": "call_client_immediately"
  }
}
```

---

### Module 8: Log Reminder Sent

**Type:** HTTP - Make a Request
**Method:** POST
**URL:**
```
https://vt-souvenir-backend.onrender.com/api/webhooks/log-event?secret={{YOUR_SECRET}}
```

**Body:**
```json
{
  "event_type": "payment_reminder_sent",
  "order_id": {{4.id}},
  "description": "Payment reminder - {{5.urgencyLevel}} urgency",
  "metadata": {
    "urgency_level": "{{5.urgencyLevel}}",
    "days_until_event": {{4.days_until_event}},
    "remaining_balance": {{4.remaining_balance}},
    "channel": "whatsapp",
    "timestamp": "{{now}}"
  }
}
```

---

## Complete Flow Diagram

```
┌──────────────────────────────────────────────────┐
│  [1] Schedule: 9 AM, 2 PM, 6 PM                  │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [2] HTTP: Get Unpaid Orders (event_soon=14)    │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [3] Filter: count > 0                           │
└──────────────────┬───────────────────────────────┘
                   │ YES
                   ▼
┌──────────────────────────────────────────────────┐
│  [4] Iterator: Loop orders                       │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [5] Set Variables: Calculate urgency            │
│      - daysUntilEvent                            │
│      - urgencyLevel (low/medium/high/critical)   │
│      - tone (friendly/reminder/urgent/critical)  │
│      - paidPercentage                            │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [6] Router: Split by Urgency Level              │
├─────────┬──────────┬──────────┬──────────────────┤
│ LOW     │ MEDIUM   │ HIGH     │ CRITICAL         │
│ 7-14d   │ 3-6d     │ 1-2d     │ Today/Tomorrow   │
└────┬────┴─────┬────┴─────┬────┴──────┬───────────┘
     │          │          │           │
     ▼          ▼          ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐
│WhatsApp │ │WhatsApp │ │WhatsApp │ │ WhatsApp +    │
│Friendly │ │Reminder │ │ Urgent  │ │ Email +       │
│         │ │         │ │         │ │ Admin Alert   │
└────┬────┘ └────┬────┘ └────┬────┘ └──────┬────────┘
     │           │           │              │
     └───────────┴───────────┴──────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│  [8] HTTP: Log Reminder Sent                     │
└──────────────────────────────────────────────────┘
```

---

## Setup Instructions

### Step 1: Configure Schedule

Set up 3 scheduled triggers:
- Morning: 9:00 AM (catches early payers)
- Afternoon: 2:00 PM (lunch break)
- Evening: 6:00 PM (after work)

### Step 2: Create WhatsApp Templates

In Meta Business Manager, create templates:
1. `payment_reminder_low`
2. `payment_reminder_medium`
3. `payment_reminder_high`
4. `payment_reminder_critical`

### Step 3: Configure Banking Details

Replace placeholders with your actual info:
- `[CUENTA BBVA]`: Your bank account number
- `[CLABE]`: Your CLABE number
- `[NÚMERO]`: Debit card for deposits
- `[DIRECCIÓN]`: Store address for cash payments
- `[TELÉFONO]`: Contact phone number

### Step 4: Test Each Urgency Level

Create test orders with different event dates:
- Test 1: Event in 10 days (LOW)
- Test 2: Event in 5 days (MEDIUM)
- Test 3: Event in 2 days (HIGH)
- Test 4: Event tomorrow (CRITICAL)

Run scenario and verify correct message sent for each.

---

## Advanced Features

### A/B Testing Message Effectiveness

Add this after Module 5:

**Module 5A: Random Number Generator**
```javascript
Type: Math - Random Number
Min: 0
Max: 1
```

**Module 6A: Router - Test Variation**
```
Route 1: {{5A.result}} < 0.5 → Version A (current message)
Route 2: {{5A.result}} >= 0.5 → Version B (alternate message)
```

Track conversion rates in Google Sheets to see which messages get faster payments.

---

### Escalation to Phone Call

For CRITICAL urgency, add:

**Module 7d4: Create Google Calendar Event**
```
Type: Google Calendar - Create Event
Title: "LLAMAR URGENTE: {{4.client_name}} - {{4.order_number}}"
Start: {{now}}
Duration: 30 minutes
Description: "Saldo: ${{4.remaining_balance}}, Teléfono: {{4.client_phone}}"
```

This ensures admin calls immediately.

---

### Payment Confirmation Webhook

Add webhook listener for when payment proof uploaded:

**Trigger:** Webhook (listen for payment proof upload)
**Action:**
1. Stop all active reminders for this order
2. Send thank you WhatsApp
3. Update internal log

---

## Troubleshooting

### Issue: Too many messages sent
**Solution:** Add filter to check last reminder time (don't send if sent < 8 hours ago)

### Issue: Wrong urgency level
**Solution:** Verify `days_until_event` calculation in Module 5

### Issue: Client complaints about spam
**Solution:** Add opt-out option in messages, store preference in database

---

## Success Metrics

**Track These KPIs:**
- ✅ Payment reminders sent per day
- ✅ Average time to payment after reminder
- ✅ Percentage of orders paid before event
- ✅ Reduction in last-minute payment issues

**Targets:**
- 90%+ of orders paid 2+ days before event
- <5% critical urgency situations
- Average payment within 24h of medium urgency reminder

---

## Cost Estimate

**Make.com Operations:**
- 3 runs/day × 30 days = 90 schedule ops
- ~8 orders/run × 90 = 720 order checks
- ~200 reminders sent/month
- **Total: ~1,500 operations/month**

**WhatsApp:**
- ~200 conversations/month
- First 1,000 free
- **Cost: $0**

**Total estimated cost: $0-5/month**

---

## ROI Calculation

**Before Automation:**
- Late payments: 40% of orders
- Average order value: $3,000
- Lost revenue from cancellations: ~$5,000/month
- Time spent chasing payments: 10 hours/week

**After Automation:**
- Late payments: <5% of orders
- On-time payment rate: 95%
- Time saved: 10 hours/week
- **Financial impact: +$2,000-5,000/month**

**ROI: Infinite (cost ~$0, gain $2,000+)**

---

## Next Steps

1. ✅ Implement this automation
2. ✅ Monitor for 2 weeks
3. ✅ Adjust urgency thresholds based on payment patterns
4. ✅ Combine with WhatsApp Auto-Updates (#1)
5. ✅ Add payment link integration for instant online payments

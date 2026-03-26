# Sales AI Dashboard Redesign + Daily Digest

**Date:** 2026-03-20
**Status:** Design approved
**Goal:** Add actionable priority list + performance scoreboard to Sales AI dashboard, plus daily WhatsApp digest at 9 AM.

---

## 1. Daily Sales Digest (9 AM WhatsApp)

### WhatsApp text message:
```
📊 *Resumen de Ventas — 20 Mar*

🔴 3 leads fríos (sin respuesta 24h+)
🟡 5 esperando tu respuesta
🟢 2 listos para cerrar

💬 Ayer: 8 pills enviados, 5 respuestas (63%)
💰 Revenue potencial: $12,400

📎 Reporte completo adjunto
```

### PDF report (AXKAN branded, attached):
- Page 1: Priority list — name, last message, hours since reply, suggested action
- Page 2: Coaching scoreboard — pills sent/replied/orders by type
- Summary: what worked, what didn't

### Scheduler:
- 9 AM Mexico City daily (`0 9 * * *`)
- Uses existing `sendWhatsAppMessage` + `sendWhatsAppDocument`
- Data from: `sales_coaching`, `whatsapp_conversations`, `whatsapp_messages`

---

## 2. Dashboard Redesign

### New layout (top to bottom):
1. **Priority List** (NEW)
2. **Performance Scoreboard** (NEW)
3. **Existing charts** (unchanged — word clouds, hourly activity, etc.)

### Priority List

Three groups ordered by urgency:

**🔴 Leads Fríos** — conversations where:
- Last message is outbound (bot/admin sent, client hasn't replied)
- More than 2 hours since last message
- Sorted by hours since last message (most cold first)

**🟢 Listos para Cerrar** — conversations with:
- Active coaching pill of type `ready_to_close`
- OR client mentioned payment, order, quantities recently

**🟡 Esperando Tu Respuesta** — conversations where:
- Last message is inbound (client sent, you haven't replied)
- Sorted by oldest first

Each row shows:
- Client name
- Hours since last message
- Brief context (last message snippet)
- Clickable → opens that conversation

### Performance Scoreboard

**5 KPI cards (top row):**
| Card | Source |
|------|--------|
| 💬 Pills enviados | COUNT where created_at in last 7 days |
| ✅ Seguidos | COUNT where status = 'followed' |
| 📩 Respuestas | COUNT where client_responded = true |
| 📦 Pedidos | COUNT where resulted_in_order = true |
| 💰 Revenue | SUM of order total_price linked to coaching |

**By type breakdown (progress bars):**
- For each coaching_type: total sent, response rate as bar
- Last 7 days

**Trend chart:**
- Weekly response rate over last 4 weeks
- Simple line chart using Chart.js

---

## Backend Changes

### New endpoint: GET `/api/coaching/dashboard`
Returns all data needed for the priority list + scoreboard in one call.

```json
{
  "success": true,
  "priorities": {
    "coldLeads": [
      { "conversationId": 514, "clientName": "Leonardo", "hoursSince": 6, "lastMessage": "50 pzas x diseño", "pillType": "change_technique" }
    ],
    "readyToClose": [...],
    "waitingReply": [...]
  },
  "scoreboard": {
    "totalPills": 45,
    "followed": 30,
    "responses": 20,
    "orders": 5,
    "revenue": 12400,
    "byType": [
      { "type": "cold_lead", "sent": 15, "responded": 10, "rate": 0.67 },
      { "type": "change_technique", "sent": 8, "responded": 4, "rate": 0.50 },
      { "type": "ready_to_close", "sent": 5, "responded": 4, "rate": 0.80 },
      { "type": "missing_info", "sent": 4, "responded": 3, "rate": 0.75 }
    ],
    "weeklyTrend": [
      { "week": "Mar 3-9", "rate": 0.55 },
      { "week": "Mar 10-16", "rate": 0.62 },
      { "week": "Mar 17-23", "rate": 0.68 }
    ]
  }
}
```

### New function in designer-scheduler.js:
`triggerSalesDigest()` — generates WhatsApp text + PDF, sends at 9 AM.

### New PDF generator:
`generateSalesDigestPDF(data)` — AXKAN branded, 2 pages.

---

## Files to Create/Modify

### New Files
1. `backend/services/sales-digest-generator.js` — PDF generation for sales digest
2. (Sales digest scheduler added to existing designer-scheduler.js)

### Modified Files
3. `backend/api/coaching-routes.js` — add `/dashboard` endpoint
4. `backend/services/designer-scheduler.js` — add 9 AM sales digest cron
5. `frontend/admin-dashboard/whatsapp.js` — redesign `renderSalesDashboard()` to add priority list + scoreboard above existing charts

---

## Implementation Order

1. Backend `/dashboard` endpoint (aggregates priorities + scoreboard data)
2. Frontend priority list UI
3. Frontend scoreboard UI
4. Sales digest PDF generator
5. Sales digest scheduler (9 AM) + WhatsApp delivery
6. Test end-to-end

# Sales AI Coaching Pills — Design Doc

**Date:** 2026-03-19
**Status:** Design approved
**Goal:** AI-powered coaching suggestions that appear as clickable pills above the WhatsApp chat input, with performance tracking.

---

## Problem

- No visibility into which conversations need attention
- No suggestions on what to say to cold/stalled leads
- No tracking of whether sales advice actually works
- Ivan manually scans conversations to decide next steps

## Solution

Coaching pills above the chat input bar. One tap fills the message, hit enter to send. Claude Code analyzes conversations in the background every 30 minutes, pushes suggestions to the database. Frontend reads them instantly.

---

## Architecture

```
Claude Code (background loop, every 30 min)
    │
    ├── Fetch active conversations from backend API
    ├── Analyze each with Claude (free, part of subscription)
    ├── Push suggestions to sales_coaching table via API
    │
Frontend (admin dashboard)
    │
    ├── Fetch pills for current conversation from API
    ├── Show pills above chat input
    ├── On click → fill input bar with suggested text
    ├── On send → mark as "followed"
    ├── On dismiss (×) → mark as "ignored"
    │
Backend (tracking)
    │
    ├── Watch for client response after advice followed
    ├── Watch for order creation → link to coaching
    └── Feed stats to weekly report
```

---

## Coaching Types

| Type | Icon | Color | Trigger |
|------|------|-------|---------|
| Cold lead | 🔥 | Orange #f39223 | Client hasn't replied in 2+ hours |
| Change technique | 🔄 | Pink #e72a88 | Price objection, disinterest, repeated "no" |
| Ready to close | ✅ | Green #8ab73b | Buying signals (payment, quantities, "sí quiero") |
| Missing info | ❓ | Cyan #09adc2 | Client asked something unanswered |

Max 3 pills per conversation.

---

## UI: Coaching Pills

Position: horizontal row right above "Escribe un mensaje..." input bar.

```
│ [messages here...]                              │
│                                                  │
├─────────────────────────────────────────────────┤
│ 🔥 "Leo, ¿viste el catálogo?"  ×                │
│ ✅ "¿Te armo la cotización?"   ×                │
├─────────────────────────────────────────────────┤
│ Escribe un mensaje...                    📎  ➤  │
```

- Pills are colored by type (orange/pink/green/cyan border + light bg)
- Tap pill → text fills the input bar, cursor at end
- Edit before sending → still counts as "followed"
- × button dismisses → logged as "ignored"
- Pills scroll horizontally if > 2
- Pill shows short preview (~40 chars), full text on hover
- Small timestamp: "hace 15m"

---

## Database Schema

### New table: `sales_coaching`

```sql
CREATE TABLE sales_coaching (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES whatsapp_conversations(id),
    coaching_type VARCHAR(30) NOT NULL,  -- cold_lead, change_technique, ready_to_close, missing_info
    suggested_message TEXT NOT NULL,
    context TEXT,                         -- why AI suggested this
    status VARCHAR(20) DEFAULT 'pending', -- pending, followed, ignored, expired
    followed_at TIMESTAMP,
    message_sent TEXT,                    -- actual message sent (may differ from suggestion)
    client_responded BOOLEAN,
    client_responded_at TIMESTAMP,
    resulted_in_order BOOLEAN,
    order_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    expired_at TIMESTAMP
);

CREATE INDEX idx_sales_coaching_conversation ON sales_coaching(conversation_id);
CREATE INDEX idx_sales_coaching_status ON sales_coaching(status);
CREATE INDEX idx_sales_coaching_type ON sales_coaching(coaching_type);
```

### New column on whatsapp_conversations:

```sql
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS last_coached_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS coaching_message_count INTEGER DEFAULT 0;
```

`last_coached_at` tracks when the conversation was last analyzed — only re-analyze if new messages arrived since then.
`coaching_message_count` stores how many messages existed at last analysis — compare to current count to detect changes.

---

## Backend API Endpoints

### GET `/api/whatsapp/conversations/:id/coaching`
Returns active (pending) coaching pills for a conversation.

```json
{
  "success": true,
  "pills": [
    {
      "id": 42,
      "type": "cold_lead",
      "message": "Leo, ¿viste el catálogo? Tenemos diseños nuevos para Cancún 🌴",
      "context": "Client hasn't replied in 4 hours after viewing catalog",
      "createdAt": "2026-03-19T18:30:00Z"
    }
  ]
}
```

### POST `/api/whatsapp/coaching/:id/follow`
Mark a coaching pill as followed. Body: `{ messageSent: "actual text sent" }`

### POST `/api/whatsapp/coaching/:id/ignore`
Mark a coaching pill as ignored/dismissed.

### POST `/api/whatsapp/coaching/push`
Endpoint for Claude Code to push coaching suggestions. Auth via admin token.

```json
{
  "suggestions": [
    {
      "conversationId": 459,
      "coachingType": "cold_lead",
      "suggestedMessage": "Leo, ¿viste el catálogo?",
      "context": "No reply in 4 hours"
    }
  ]
}
```

### GET `/api/whatsapp/coaching/stats`
Returns coaching performance metrics for the weekly report.

---

## Claude Code Loop Skill

A `/loop` skill runs every 30 minutes:

1. Fetch all conversations with messages in last 48 hours
2. Compare message count to `coaching_message_count` — skip unchanged ones
3. For each changed conversation:
   - Fetch last 20 messages
   - Analyze: detect cold leads, objections, buying signals, unanswered questions
   - Generate 1-3 suggested messages in casual Mexican Spanish
4. Push suggestions via `POST /api/whatsapp/coaching/push`
5. Expire old suggestions for updated conversations

---

## Tracking Flow

1. **Pill shown** → status: `pending`
2. **User clicks pill** → text fills input bar
3. **User sends message** → status: `followed`, `followed_at` = now, `message_sent` = actual text
4. **Client replies within 24h** → `client_responded = true`, `client_responded_at` = now
5. **Order created for this client** → `resulted_in_order = true`, `order_id` linked
6. **User dismisses pill (×)** → status: `ignored`
7. **New analysis runs** → old pending pills: status: `expired`

Tracking is automatic — backend watches for new messages and orders, updates coaching records.

---

## Response Watcher (Background)

A lightweight check runs when new messages come in (in whatsapp-routes.js webhook):

```javascript
// After storing inbound message, check if there's followed coaching for this conversation
const coaching = await query(`
    SELECT id FROM sales_coaching
    WHERE conversation_id = $1
      AND status = 'followed'
      AND client_responded IS NULL
      AND followed_at > NOW() - INTERVAL '24 hours'
`, [conversationId]);

if (coaching.rows.length > 0) {
    await query(`
        UPDATE sales_coaching
        SET client_responded = true, client_responded_at = NOW()
        WHERE id = $1
    `, [coaching.rows[0].id]);
}
```

---

## Weekly Report Integration

Add to the existing weekly designer report (or create a separate sales report):

- "You followed 12 suggestions this week"
- "8 got client replies (67% response rate)"
- "3 led to orders worth $X"
- "Best performing type: 'Follow-up' (80% response rate)"
- "Worst performing: 'Change technique' (30% response rate)"

---

## Files to Create/Modify

### New Files
1. `backend/migrations/add-sales-coaching.js` — DB schema
2. `backend/api/coaching-routes.js` — API endpoints
3. `.claude/skills/analyze-sales/SKILL.md` — Loop skill for Claude Code

### Modified Files
4. `frontend/admin-dashboard/whatsapp.js` — Add pills UI above input
5. `frontend/admin-dashboard/index.html` — CSS for pills
6. `backend/api/whatsapp-routes.js` — Response watcher hook
7. `backend/api/server.js` — Register coaching routes

---

## Implementation Order

1. Database migration (sales_coaching table + columns)
2. Backend API endpoints (CRUD for coaching)
3. Frontend pills UI (above chat input)
4. Response watcher (in webhook)
5. Claude Code analysis skill
6. Tracking integration
7. Weekly report stats

---

## Success Criteria

- [ ] Pills appear above chat input for conversations with suggestions
- [ ] Clicking a pill fills the input bar with the suggested text
- [ ] Dismissing a pill logs it as ignored
- [ ] Sending a suggested message logs it as followed
- [ ] Client responses after followed advice are automatically tracked
- [ ] Orders linked to coached conversations are tracked
- [ ] Claude Code loop analyzes conversations every 30 min
- [ ] Weekly report includes coaching performance stats

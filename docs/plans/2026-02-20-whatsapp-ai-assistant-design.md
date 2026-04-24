# WhatsApp AI Assistant - Design Document

**Date:** 2026-02-20
**Status:** Approved
**Approach:** Direct Meta WhatsApp Cloud API (Approach A)

## Problem

Client WhatsApp messages requesting orders get forgotten because no one monitors them consistently. There is no automated system to detect purchase intent, respond to inquiries, or surface conversations on the admin dashboard.

## Solution

A full auto-pilot WhatsApp AI assistant that:
- Receives messages via Meta WhatsApp Cloud API webhook
- Responds automatically using Claude AI with AXKAN brand voice
- Detects intent (order, pricing, question, complaint)
- Creates orders through existing `createOrderBothSystems()` flow
- Displays all conversations on admin dashboard with insights

## Architecture

```
Client WhatsApp message
         |
         v
Meta WhatsApp Cloud API
         |
         v  POST /api/whatsapp/webhook
+-------------------------------------+
|  whatsapp-routes.js                  |
|  1. Verify webhook signature         |
|  2. Store message in DB              |
|  3. Load conversation history        |
|  4. Send to Claude with context      |
|  5. Claude decides action            |
|  6. Send reply via Meta API          |
|  7. Store AI reply in DB             |
+-------------------------------------+
         |
         v
Admin Dashboard "WhatsApp" tab
  - Conversation list with previews
  - Intent badges
  - Unread count
  - Full chat view
  - Manual override reply
```

## Database Schema

### whatsapp_conversations
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| wa_id | VARCHAR(50) UNIQUE | WhatsApp phone number |
| client_name | VARCHAR(255) | Profile name from WhatsApp |
| client_id | INTEGER FK clients(id) | Linked existing client |
| status | VARCHAR(30) | active, resolved, order_created |
| intent | VARCHAR(50) | order, pricing, question, complaint, greeting |
| ai_summary | TEXT | Claude's summary of what client wants |
| unread_count | INTEGER | Default 0 |
| last_message_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

### whatsapp_messages
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| conversation_id | INTEGER FK | |
| wa_message_id | VARCHAR(100) UNIQUE | Meta's ID for dedup |
| direction | VARCHAR(10) | inbound, outbound |
| sender | VARCHAR(10) | client, ai, admin |
| message_type | VARCHAR(20) | text, image, audio, document |
| content | TEXT | Message text |
| media_url | TEXT | If image/audio/doc |
| metadata | JSONB | AI analysis, extracted order data |
| created_at | TIMESTAMP | |

## AI Conversation Engine

Claude system prompt includes:
- AXKAN brand voice (friendly Mexican Spanish, short messages)
- Product catalog from DB (names, prices, descriptions)
- Pricing rules and minimum quantities
- Order collection flow: name, product, quantity, event type, delivery date, address
- Access to create orders via tool use

Conversation states:
1. **Greeting** - Warm welcome, ask how to help
2. **Product inquiry** - Share catalog info, pricing
3. **Order collection** - Gather all order fields naturally
4. **Order confirmation** - Summarize and confirm before creating
5. **Order created** - Confirm order number, next steps
6. **Status check** - Query orders table by phone/name
7. **General question** - Answer using knowledge base

## Dashboard UI

New "WhatsApp" tab in admin sidebar:
- Conversation list (sorted by last message, unread first)
- Intent badges with icons
- Click to open full chat view
- Manual reply input (sends as admin, bypasses AI for that message)
- Quick actions: mark resolved, create order manually
- Notification badge on sidebar icon

## Files

### New
- `backend/api/whatsapp-routes.js` - Webhook + Meta API
- `backend/services/whatsapp-ai.js` - Claude conversation engine
- `frontend/admin-dashboard/whatsapp.js` - Dashboard UI

### Modified
- `backend/api/server.js` - Mount whatsapp routes
- `backend/shared/init-database.js` - Add 2 tables
- `frontend/admin-dashboard/index.html` - Add WhatsApp sidebar tab
- `.env` - Add WhatsApp credentials

## Credentials

- Phone Number ID: 689101864297346
- WhatsApp Business Account ID: 812957161059963
- Phone: +52 15633830500
- Access Token: Temporary (24h) - will need System User token for production
- Verify Token: axkan_wa_verify_2026
- Render webhook URL: https://vt-souvenir-backend.onrender.com/api/whatsapp/webhook

## Constraints

- Temporary token expires in 24h (need permanent token for production)
- Meta requires message templates for messages sent after 24h window
- Development mode: can only message numbers added as test numbers
- Rate limits: respect Meta API limits

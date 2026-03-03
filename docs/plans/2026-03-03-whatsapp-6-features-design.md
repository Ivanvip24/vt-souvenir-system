# WhatsApp 6 New Features — Design Document

**Date:** 2026-03-03
**Status:** Approved
**Architecture:** Hybrid (AI-orchestrated conversational features + admin-controlled templates)

---

## Overview

Add 6 features to the existing WhatsApp Business API integration to make customer interactions richer and more useful:

1. **WhatsApp Flows** — 3 multi-screen native forms (order, quote, lead capture)
2. **Template Messages** — Proactive outbound (promotional + payment reminders)
3. **Location Request** — One-tap GPS address collection
4. **Carousel** — Scrollable featured product cards
5. **Reactions** — Emoji reactions on client messages
6. **Product Image Fix** — Add missing `image_url` column to products table

---

## Current State

### Existing Message Types
- Text, Image, Audio, Document (bidirectional)
- Interactive Lists (max 10 rows), Reply Buttons (max 3), CTA URL buttons
- AI-generated `[SEND_*]` blocks: IMAGE, LIST, BUTTONS, DOCUMENT, CREATE_ORDER

### Existing Architecture
- Meta API v22.0 via `metaApiFetch()` wrapper
- AI response parsing via `parseAIResponse()` in `whatsapp-ai.js`
- Chatbot config in `backend/chatbot_whatsapp/*.md`
- DB: `whatsapp_conversations`, `whatsapp_messages` tables
- Admin dashboard: `frontend/admin-dashboard/whatsapp.js`

---

## Feature 1: WhatsApp Flows (3 Flows)

### How Flows Work
- JSON-defined multi-screen forms submitted to Meta's Flows API
- Rendered as native UI inside WhatsApp (text inputs, dropdowns, date pickers)
- On completion, webhook receives `nfm_reply` interactive message with structured data
- Server provides a flow endpoint for dynamic screen data

### Architecture
- **Flow definitions**: JSON files in `backend/whatsapp-flows/`
- **Flow registration**: One-time upload to Meta via `POST /{WABA_ID}/flows`
- **AI trigger**: `[SEND_FLOW]{"flowId": "order_form"}[/SEND_FLOW]`
- **Flow response**: Webhook parses `messages.interactive.type === "nfm_reply"`
- **Flow data endpoint**: `POST /api/whatsapp/flow-endpoint` serves dynamic screen data

### Flow 1: Order Form (5 screens)
```
Screen 1: Product Selection (dropdown from catalog)
Screen 2: Quantity + Customization (number input + text area)
Screen 3: Event Details (event type dropdown + date picker)
Screen 4: Shipping (name + address + city + state fields)
Screen 5: Confirmation (summary + submit)
```
**On submit**: Triggers `executeOrderCreation()` with structured data.

### Flow 2: Quote Request (3 screens)
```
Screen 1: Product (dropdown) + Quantity (number)
Screen 2: Customization details (text area + optional notes)
Screen 3: Contact info (name + phone + city) + submit
```
**On submit**: Stores as lead in DB, AI follows up with quote.

### Flow 3: Lead Capture (2 screens)
```
Screen 1: Name + City + Business type (dropdown: personal/business/event planner/hotel)
Screen 2: Event type + estimated quantity range + preferred contact method + submit
```
**On submit**: Creates/updates client record, AI greets with personalized recommendations.

### Webhook Handling
Parse `nfm_reply` from Meta webhook, extract `response_json`, route based on flow ID stored in metadata.

---

## Feature 2: Template Messages

### Architecture
- **Admin-initiated** (not AI-triggered) — sent from dashboard or API endpoint
- **Pre-approved by Meta** — submit templates, wait for approval (1-24 hours)
- **New DB tables**: `whatsapp_templates`, `whatsapp_broadcasts`
- **Admin endpoints**:
  - `POST /api/whatsapp/templates/:name/send` — single recipient
  - `POST /api/whatsapp/templates/:name/broadcast` — multiple recipients

### Template 1: Seasonal/Promotional
```
Name: axkan_seasonal_promo
Language: es_MX
Category: MARKETING

Header: IMAGE (product photo or seasonal graphic)
Body: "¡Hola {{1}}! {{2}} ¿Te gustaría saber más?"
Footer: "AXKAN — Recuerdos que cuentan historias"
Buttons:
  - Quick Reply: "Sí, cuéntame más"
  - Quick Reply: "No, gracias"
```
Variables: `{{1}}` = client name, `{{2}}` = promo hook

### Template 2: Payment Reminder
```
Name: axkan_payment_reminder
Language: es_MX
Category: UTILITY

Body: "Hola {{1}}, te recordamos que tu pedido #{{2}} por ${{3}} MXN
       tiene un saldo pendiente. Para agilizar tu envío, puedes realizar
       tu pago por transferencia. ¿Necesitas los datos bancarios?"
Buttons:
  - Quick Reply: "Enviar datos bancarios"
  - Quick Reply: "Ya pagué"
  - Quick Reply: "Necesito hablar con alguien"
```
Variables: `{{1}}` = client name, `{{2}}` = order number, `{{3}}` = amount

### Admin Dashboard Addition
New "Templates" tab in WhatsApp admin:
- Template list with approval status badges
- "Send" button → select recipient + fill variables
- "Broadcast" → multi-recipient with variable mapping
- Send history log with delivery/read stats

---

## Feature 3: Location Request

### AI Trigger
```
[REQUEST_LOCATION]{"body": "¿Podrías compartirme tu ubicación para calcular el envío?"}[/REQUEST_LOCATION]
```

### API Payload
```json
{
  "messaging_product": "whatsapp",
  "to": "521XXXXXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "location_request_message",
    "body": { "text": "Para calcular tu envío, ¿podrías compartirme tu ubicación?" },
    "action": { "name": "send_location" }
  }
}
```

### Webhook Handling
Parse `message.type === 'location'` → extract `latitude`, `longitude`, `name`, `address`.
Store in `whatsapp_messages.metadata` as `{ lat, lng, address, locationName }`.

### Order Integration
When AI creates order, auto-populate shipping address from last shared location in conversation.

### Admin Dashboard
Location messages render as mini map preview (Google Maps static image or link).

---

## Feature 4: Carousel (Featured Products)

### AI Trigger
```
[SEND_CAROUSEL]{"products": ["Imanes Personalizados", "Llaveros MDF"]}[/SEND_CAROUSEL]
```

### Architecture
- AI specifies product names → system looks up images, prices, descriptions from products table
- Carousel requires a **pre-approved Meta template** (`axkan_product_carousel`)
- Fallback: if carousel fails or products lack images, send individual image messages

### Template Structure
```
Name: axkan_product_carousel
Language: es_MX
Category: MARKETING

Cards (dynamic, 2-10):
  Header: IMAGE (product photo)
  Body: "{{1}} — ${{2}} MXN c/u\n{{3}}"
  Buttons:
    - Quick Reply: "Quiero este" (payload: order_{product_id})
    - Quick Reply: "Más info" (payload: info_{product_id})
```

### Product Image Fix (Required)
Migration to add `image_url` column to products table:
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
```

---

## Feature 5: Reactions

### AI Trigger
```
[REACT]{"emoji": "👍"}[/REACT]
```
Reacts to the client's last inbound message.

### API Payload
```json
{
  "messaging_product": "whatsapp",
  "to": "521XXXXXXXXXX",
  "type": "reaction",
  "reaction": {
    "message_id": "wamid.xxxxx",
    "emoji": "👍"
  }
}
```

### When AI Uses Reactions
- Client confirms order → 👍
- Client sends positive feedback → ❤️
- Client sends payment proof → ✅
- Client thanks → 🙏

### Admin Dashboard
Admin can click a reaction button on any inbound message to send a reaction.

---

## Database Changes

### New Table: whatsapp_templates
```sql
CREATE TABLE whatsapp_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL,
  language VARCHAR(10) DEFAULT 'es_MX',
  status VARCHAR(50) DEFAULT 'pending',
  meta_template_id VARCHAR(100),
  header_type VARCHAR(20),
  body_text TEXT NOT NULL,
  footer_text TEXT,
  variables JSONB,
  buttons JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### New Table: whatsapp_broadcasts
```sql
CREATE TABLE whatsapp_broadcasts (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES whatsapp_templates(id),
  sent_by VARCHAR(100),
  recipients JSONB NOT NULL,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_read INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Migration: products.image_url
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
```

---

## File Changes Summary

### New Files
- `backend/whatsapp-flows/order-form.json`
- `backend/whatsapp-flows/quote-request.json`
- `backend/whatsapp-flows/lead-capture.json`
- `backend/migrations/0XX-whatsapp-templates.sql`
- `backend/migrations/0XX-products-image-url.sql`
- `backend/services/whatsapp-templates.js` (template send/broadcast logic)
- `backend/services/whatsapp-flows.js` (flow registration/endpoint logic)
- `backend/routes/whatsapp-template-routes.js` (admin API endpoints)

### Modified Files
- `backend/services/whatsapp-api.js` — add `sendWhatsAppFlow()`, `sendWhatsAppLocationRequest()`, `sendWhatsAppCarousel()`, `sendWhatsAppReaction()`
- `backend/services/whatsapp-ai.js` — add parsing for new blocks: `SEND_FLOW`, `REQUEST_LOCATION`, `SEND_CAROUSEL`, `REACT`
- `backend/routes/whatsapp-routes.js` — add `nfm_reply` and `location` webhook handlers, flow endpoint
- `backend/chatbot_whatsapp/media-handling.md` — document new block types with examples
- `frontend/admin-dashboard/whatsapp.js` — templates tab, location preview, reaction button, carousel display
- `server.js` — register new template routes
- `backend/run-migration.js` — add new migrations

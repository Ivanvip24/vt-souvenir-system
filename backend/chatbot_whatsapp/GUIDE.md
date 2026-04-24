# AXKAN WhatsApp AI Chatbot

## How It Works

```
Customer sends WhatsApp message to +52 5639544042
        |
Meta delivers webhook to Render backend
        |
backend/api/whatsapp-routes.js receives it
        |
    +---+---+---+
    |   |   |   |
  text image audio document
    |   |   |   |
    |  Claude  Google   Store in
    | Vision  Speech   Cloudinary
    |   |   |   |
    +---+---+---+
        |
backend/services/whatsapp-ai.js
        |
  Loads system prompt from these config files
  + product catalog from database
        |
  Claude API (claude-sonnet-4-5-20250929)
        |
  Parses response for:
    - [CREATE_ORDER] blocks -> creates real orders
    - [SEND_IMAGE] blocks -> sends product photos
    - Plain text -> sends as WhatsApp reply
        |
Customer receives reply + product images on WhatsApp
Admin sees everything on dashboard
```

## Config Files

Edit any file below to change the chatbot's behavior. Changes take effect on the NEXT message (no restart needed).

| File | What it controls |
|------|-----------------|
| `system-prompt.md` | Who the chatbot IS (identity, brand intro) |
| `brand-voice.md` | HOW it talks (tone, language, emoji limits) |
| `rules.md` | Hard boundaries (never invent products, redirect off-topic) |
| `sales-process.md` | What info to collect from customers, in what order |
| `order-creation.md` | The JSON format for automatic order creation |
| `order-status.md` | How to handle "where's my order?" questions |
| `media-handling.md` | Rules for sending/receiving images and audio |
| `response-examples.md` | Example replies the AI uses as reference |

## Key Files (Code)

| File | Purpose |
|------|---------|
| `services/whatsapp-ai.js` | AI engine: loads config, calls Claude, parses responses |
| `services/whatsapp-media.js` | Media: download from Meta, upload to Cloudinary, transcribe audio |
| `api/whatsapp-routes.js` | Webhook handler + admin API endpoints |
| `frontend/admin-dashboard/whatsapp.js` | Dashboard UI for monitoring conversations |

## Capabilities

| Feature | Status |
|---------|--------|
| Receive text messages | Working |
| Send text replies (AI) | Working |
| Receive images (Claude Vision) | Working |
| Send product images automatically | Working |
| Receive audio (Google Speech-to-Text) | Working (needs GOOGLE_CLOUD_VISION_CREDENTIALS) |
| Receive documents | Working |
| Create orders via conversation | Working |
| Admin manual replies | Working |
| Admin image sending | Working |
| Dashboard with media previews | Working |

## Environment Variables (Render)

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Meta API token (expires hourly with temp tokens!) |
| `WHATSAPP_PHONE_NUMBER_ID` | `1052406394615267` (number +52 5639544042) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `812957161059963` |
| `WHATSAPP_VERIFY_TOKEN` | `axkan_wa_verify_2026` |
| `ANTHROPIC_API_KEY` | Claude API key for AI + Vision |
| `GOOGLE_CLOUD_VISION_CREDENTIALS` | JSON string for Speech-to-Text |
| `CLOUDINARY_CLOUD_NAME` | For media storage |
| `CLOUDINARY_API_KEY` | For media storage |
| `CLOUDINARY_API_SECRET` | For media storage |

## Phone Numbers

| Number | Purpose |
|--------|---------|
| +52 5639544042 | API number (receives customer messages) |
| +52 5538253251 | Main AXKAN WhatsApp (personal use) |

## Quick Tips

- To change the chatbot's personality, edit `brand-voice.md`
- To add new sales rules, edit `sales-process.md`
- To change how orders are created, edit `order-creation.md`
- The product catalog is loaded from the database automatically (not from files)
- Temporary access tokens expire every hour — get a permanent System User token from Meta Business Settings

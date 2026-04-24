# WhatsApp Bot

> The AI-powered sales assistant that talks to clients on WhatsApp, handles inquiries, generates quotes, and creates orders.

## What it does

1. Receives messages from WhatsApp via Meta webhook
2. Loads conversation history (last 30 messages) for context
3. Sends the conversation + AXKAN catalog to Claude/GPT for a response
4. Bot responds with prices, product info, shipping estimates, or creates a quote
5. If client confirms an order, it creates it in the database + Notion
6. If client sends a payment image, it runs through Claude Vision for verification
7. Automatically re-engages silent clients after 23 hours with a value-first message
8. Generates a coaching "pill" for Ivan after each exchange

## How it works

```
Incoming WhatsApp message
    |
    v
whatsapp-routes.js receives webhook
    |
    +--> Checks: is AI enabled for this chat? (global toggle + per-chat)
    +--> Checks: is there an active design assignment? (may silence bot)
    +--> Loads last 30 messages from DB as conversation context
    +--> Injects: AXKAN catalog, pricing tiers, sales learnings
    |
    v
whatsapp-ai.js builds prompt + calls model
    |
    +--> Model: configurable per-chat (Haiku, Sonnet, GPT-4.1-mini, GPT-4.1-nano)
    +--> Default: GPT-4.1-mini (cheapest)
    +--> Max tokens: 400 (short convos) or 800 (8+ messages)
    +--> System prompt: Ivan's voice — short, direct, no lists, no emojis
    |
    v
Response may include special actions:
    +--> GENERATE_QUOTE tag --> quote-generator.js --> PDF + image --> send
    +--> CHECK_SHIPPING tag --> checks zip code against extended zone list
    +--> Payment image detected --> payment-receipt-verifier.js (Claude Vision)
    |
    v
Non-blocking side effects:
    +--> sales-coach.js (Haiku) analyzes and generates coaching pill
    +--> whatsapp-routes.js sets 23h timer, followup-scheduler.js checks every 5min
    +--> sales-learning-engine.js updates learnings if order/correction detected
```

## Key files

| File | Purpose |
|------|---------|
| `backend/services/whatsapp-ai.js` | Core AI logic, prompt building, model selection |
| `backend/services/whatsapp-api.js` | Meta Graph API wrapper, message sending |
| `backend/services/whatsapp-media.js` | Media download/upload, Cloudinary, audio transcription |
| `backend/api/whatsapp-routes.js` | Webhook handler, conversation management |
| `backend/services/quote-generator.js` | Quote PDF + image generation |
| `backend/services/followup-scheduler.js` | 23h re-engagement timer |

## Current state

### What works
1. Bot responds to client messages with AXKAN pricing and product info
2. Generates professional quote PDFs with product images
3. Creates orders from confirmed conversations
4. Per-chat model selector (switch between Haiku/Sonnet/GPT on the fly)
5. Global and per-chat AI kill switch
6. Silences itself when designer is actively chatting with client
7. Audio message transcription (Google Speech-to-Text)
8. Automatic follow-up after 23h of silence
9. Price list PDF sent when client asks for costs
10. Shipping cost estimation when client provides zip code

### What still fails or needs work
1. Close rate is 0.51% (2 orders out of 394 conversations) — very low
2. Bot over-communicates: 85% of messages in failed conversations are from the bot
3. Bot sends messages at 0-3 AM when nobody reads them (automation timing issue)
4. External links to axkan.art/pedidos cause 100% abandonment
5. Coaching system has 0% ROI — 1,426 pills generated, 0 orders from them
6. Conversation velocity is 12.9x too fast in failed convos (20.6 msg/hr vs 1.6 in successful)
7. Sometimes the response tags (GENERATE_QUOTE, etc.) leak into the WhatsApp message

### Future plans
1. Replace external order links with direct payment info in WhatsApp
2. Auto-escalate to Ivan on 6 specific triggers (objections, discounts, flexibility requests)
3. Slow down to max 4 messages/day with 8-hour spacing
4. Increase image/visual sending from 19.8% to 60% of conversations
5. Time-restrict bot to business hours only (no 3 AM messages)
6. A/B test short vs long opening messages

## Cost impact

| Component | Model | Triggers | Est. cost/month |
|-----------|-------|----------|----------------|
| Bot replies | GPT-4.1-mini (default) | Every incoming message | ~$5-15 |
| Bot replies | Claude Haiku (if selected) | Every incoming message | ~$10-20 |
| Bot replies | Claude Sonnet (if selected) | Every incoming message | ~$50-100 |
| Sales coach | Claude Haiku 4.5 | Every incoming message | ~$10-20 |
| Quote generation | None (local PDF) | On demand | $0 |

**Biggest cost lever:** The model selector. Sonnet is 5-10x more expensive than Haiku/GPT-mini. Default is GPT-4.1-mini now (cheapest).

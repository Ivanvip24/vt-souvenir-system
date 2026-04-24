# AXKAN Brain System — Master Map

> Last updated: 2026-04-16
> This is the single source of truth for what the system does. Each section links to a detailed sub-document.

---

## What is this?

A full business automation platform for AXKAN, a custom souvenir brand in Mexico. It replaces manual processes with an AI-powered system that handles sales (via WhatsApp), order management, shipping, payments, analytics, and multi-channel selling — all from one codebase.

**Stack:** Node.js + Express backend, PostgreSQL (cloud), static HTML/JS frontend on Vercel, WhatsApp Cloud API for messaging.

---

## Modules

| Module | What it does | Status | Details |
|--------|-------------|--------|---------|
| [WhatsApp Bot](./modules/whatsapp-bot.md) | AI sales assistant that talks to clients, generates quotes, creates orders | Active | The core revenue driver |
| [Order Management](./modules/order-management.md) | Orders, clients, payments, production tracking | Active | PostgreSQL + Notion sync |
| [Shipping](./modules/shipping.md) | Label generation, tracking, pickup scheduling, notifications | Active | Skydropx + T1 Envios |
| [Payments](./modules/payments.md) | Receipt verification, CEP bank validation, auto-approval | Active | Claude Vision + Banxico |
| [Analytics & Reports](./modules/analytics.md) | Revenue tracking, email reports, sales insights | Active | Local analysis via Claude Code |
| [Designer Portal](./modules/designer-portal.md) | WhatsApp-bridged chat, task assignment, daily reports | Active | Sarahi + Majo |
| [Admin Dashboard](./modules/admin-dashboard.md) | 20+ tabs managing every business operation | Active | Single-page app |
| [Sales Intelligence](./modules/sales-intelligence.md) | Coaching pills, learning engine, conversation analysis | Active | Haiku + local insights |
| [Marketplace](./modules/marketplace.md) | Mercado Libre + Facebook Marketplace listings | Partial | ML OAuth works, FB is bot-based |
| [Landing Pages](./modules/landing-pages.md) | 250+ SEO souvenir pages, product catalog, destination pages | Active | Vercel static |
| [Inventory](./modules/inventory.md) | BOM tracking, material costs, demand forecasting | Partial | Built but lightly used |
| [Pricing Engine](./modules/pricing-engine.md) | Tiered pricing, MOQ rules, cost sheet | Active | Excel + API |
| [Email System](./modules/email-system.md) | Receipts, shipping notifications, daily digests | Active | Resend |
| [Brand Identity](./modules/brand-identity.md) | AXKAN visual system, voice guidelines, decision framework | Reference | `/axkan` skill |
| [AI Assistant](./modules/ai-assistant.md) | Admin-facing Claude assistant for quotes, images, analysis | Active | Multi-model |

---

## Scheduled Jobs (Cron)

These run automatically on the server:

| Job | Schedule | What it does |
|-----|----------|-------------|
| Daily digest email | 8:00 AM (configurable) | Sales summary + priority action list |
| Pickup requests | 5:00 PM Mon-Sat | Sends Skydropx pickup for today's labels |
| Follow-up messages | Checks every 5min, triggers at 23h idle | Re-engages silent WhatsApp clients |
| Designer follow-ups | 6:00 PM daily | Reminds designers of pending tasks |
| Design keepalive | Checks every 30min, sends at 22-24h | Updates clients on design progress |
| Shipping status check | 4x/day Mon-Sat (9AM, 1PM, 5PM, 9PM) | Polls Skydropx, emails when shipped |
| CEP retry | Every 5min | Retries failed bank transfer verifications |
| Facebook Marketplace | 9:00 AM daily | Posts queued designs to FB |
| Sales coaching batch | Every 30min | Generates coaching pills for recent conversations |
| Designer daily report | 7:00 PM | Designer productivity report |
| Nightly sales analysis | Midnight | Pattern analysis across all conversations |
| ~~Sales insights~~ | ~~Every 20min~~ | **REMOVED** — now runs locally via Claude Code |

---

## Data Flow

```
Client sends WhatsApp message
    |
    v
Meta Webhook --> whatsapp-routes.js
    |
    +--> whatsapp-ai.js (Claude/GPT generates response)
    |       +--> If quote requested: quote-generator.js --> PDF --> send
    |       +--> If order confirmed: sync.js --> PostgreSQL + Notion
    |       +--> If payment image: payment-receipt-verifier.js (Claude Vision)
    |
    +--> sales-coach.js (Haiku generates coaching pill, non-blocking)
    |
    +--> followup-scheduler.js (sets 23h re-engagement timer)

Order created
    |
    +--> task-generator.js (creates design/production/shipping tasks)
    +--> Notion sync (creates page in Notion database)
    +--> Email receipt to client
    +--> If payment attached: auto-approve flow

Shipping label generated
    |
    +--> Skydropx API (label PDF)
    +--> shipping-notification-scheduler.js (polls tracking every 4h)
    +--> Email client when IN_TRANSIT
    +--> pickup-scheduler.js (bundles for daily pickup)
```

---

## External Integrations

| Service | Used for | Auth | Cost concern |
|---------|---------|------|-------------|
| Anthropic Claude | Bot replies, receipt analysis, coaching, design analysis | API Key | Main cost driver — see [Cost Management](./modules/cost-management.md) |
| Meta WhatsApp | Messaging, templates, media | Access Token | Free tier (1000 convos/month) |
| Skydropx | Shipping labels, tracking | OAuth2 | Per-label cost |
| Notion | Order database mirror | API Token | Free plan |
| Cloudinary | Image hosting | API Key | Free tier |
| Resend | Email sending | API Key | Free tier (100/day) |
| Google Vision | Receipt OCR | Service Account | Pay per image |
| Google Gemini | Product mockup images | API Key | Free tier |
| Mercado Libre | Product listings | OAuth2 | Commission on sales |
| Banxico CEP | Bank transfer verification | HTTP POST | Free |
| T1 Envios | Alternative shipping | Public API | Free |

---

## Database

PostgreSQL on Render.com. ~40 tables. Key tables:

- `orders` + `order_items` — core business data, auto-calculated profit columns
- `clients` + `client_addresses` — customer info
- `whatsapp_conversations` + `whatsapp_messages` — full chat history
- `sales_coaching` + `sales_learnings` + `sales_insights` — AI analytics
- `design_assignments` + `designer_tasks` — designer workflow
- `shipping_labels` + `pickups` — Skydropx data
- `payment_receipts` + `cep_verifications` — payment tracking
- `employees` + `employee_activity_logs` — internal team

---

## Frontend Pages

| Page | URL pattern | Purpose |
|------|-----------|---------|
| Admin Dashboard | `/admin-dashboard/` | Full business management |
| Employee Dashboard | `/employee-dashboard/` | Limited employee view |
| Landing Page | `/landing/` | Public product catalog |
| Souvenir Pages | `/landing/souvenirs/{city}/` | 250+ SEO landing pages |
| Product Pages | `/landing/productos/{product}/` | Category pages |
| Order Portal | `/pedidos/` | Client-facing order management |
| Shipping Form | `/shipping-form/` | Client address collection |
| Order Tracking | `/order-tracking/` | Public shipment tracking |
| Lead Form | `/lead-form/` | Lead capture |
| Mobile App | `/mobile-app/` | PWA for mobile |
| FAQ | `/faq/` | Frequently asked questions |
| Configurador | `/configurador/` | Product customization tool |

---

## How to Read These Docs

Each module doc follows this structure:

1. **What it does** — plain language, no jargon
2. **How it works** — the workflow step by step
3. **Key files** — where to find the code
4. **Current state** — what works, what doesn't
5. **Future plans** — what we want to build next
6. **Cost impact** — API/service costs if any

When we make changes, update the relevant module doc and bump the date at the top of this file.

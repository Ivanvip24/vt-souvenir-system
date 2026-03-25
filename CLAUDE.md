# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Overview

**VT Souvenir System** is a full-stack production management platform for custom souvenir businesses. It handles order lifecycle, Notion sync, automated analytics, employee dashboards, multi-channel sales (WhatsApp, Facebook Marketplace, Mercado Libre), payment verification, shipping, and AI-powered assistance.

The repository also contains the **AXKAN brand identity system** — a complete brand oracle for the souvenir brand.

## Repository Structure

```
vt-souvenir-system/
├── backend/                          # Node.js/Express API (main application)
│   ├── api/                          # Express routes & server
│   │   ├── server.js                 # Main Express app (~6,100 lines)
│   │   ├── middleware/               # Auth middleware (employee-auth.js)
│   │   └── *-routes.js              # 28 route modules
│   ├── agents/                       # Autonomous agent modules
│   │   ├── notion-agent/             # Notion bidirectional sync
│   │   ├── analytics-agent/          # Revenue calculations & email reports
│   │   ├── inventory/                # BOM, materials, forecasting
│   │   └── alerts/                   # Order status notifications
│   ├── services/                     # 35+ business logic modules
│   ├── shared/                       # Database pool, utils, migrations
│   ├── migrations/                   # 28 SQL/JS schema migrations
│   ├── utils/                        # Google Drive, delivery calc, reference sheets
│   ├── examples/                     # Test scripts & sample data
│   ├── chatbot_whatsapp/             # WhatsApp chatbot logic
│   ├── whatsapp-flows/               # WhatsApp flow definitions
│   ├── assets/                       # Brand assets, fonts, videos
│   ├── catalogs/                     # Generated PDF catalogs
│   ├── order-receipts/               # Generated receipts
│   └── package.json                  # Backend dependencies
├── frontend/                         # 16 frontend applications
│   ├── admin-dashboard/              # Admin PWA (order management, analytics)
│   ├── employee-dashboard/           # Employee portal (role-based views)
│   ├── pedidos/                      # Client-facing order form
│   ├── landing/                      # Marketing site (axkan.art)
│   ├── mobile-app/                   # Mobile-responsive PWA
│   ├── configurador/                 # Product customizer
│   ├── order-tracking/               # Client order status tracking
│   ├── shipping-form/                # Shipping address collection
│   ├── lead-form/                    # Lead capture
│   ├── faq/                          # FAQ page
│   ├── brand-manual-web/             # Brand guidelines site
│   ├── sanity-studio/                # Sanity CMS (React)
│   ├── chrome-extension-whatsapp-crm/# WhatsApp CRM browser extension
│   └── assets/                       # Shared images & fonts
├── AXKAN/                            # Brand identity system
│   ├── axkan-skill-claude-code/      # Claude skill for brand tasks
│   ├── brand-manual/                 # Visual assets (logos, patterns)
│   ├── prompts/                      # AI generation prompts (Instagram, video)
│   └── video-analysis/               # Video content analysis frames
├── Make_automations_blueprints/      # Make.com automation blueprints
│   ├── 01_WhatsApp_Auto_Updates/     # Auto-send order status via WhatsApp
│   ├── 02_Payment_Reminders/         # Automated payment reminders
│   └── 11_Receipt_OCR_Auto_Approve/  # Auto-approve valid payment receipts
├── facebook-marketplace-bot/         # Python/Selenium listing automation
├── docs/                             # Setup guides, API reference, design plans
│   ├── API_REFERENCE.md
│   ├── SETUP_GUIDE.md
│   └── plans/                        # Feature implementation plans
├── render.yaml                       # Render.com deployment config
└── package.json                      # Root-level utilities (csv-parse, heic-convert)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 20, Express 4.18, ES modules |
| **Database** | PostgreSQL (pg 8.11), Supabase-hosted |
| **Frontend** | Vanilla HTML/CSS/JS (static PWAs), Sanity CMS (React) |
| **Deployment** | Render (backend), Vercel (frontend apps) |
| **Email** | Nodemailer, Resend, SendGrid |
| **File Storage** | Cloudinary (images), local fs (PDFs, receipts) |
| **AI** | Anthropic Claude (receipt analysis, chat), OpenAI, Google Gemini |
| **Integrations** | Notion API, WhatsApp Business API, Stripe, Facebook, Mercado Libre, Google Drive |
| **Scheduling** | node-cron (in-process) |

## Essential Commands

```bash
# Clone & setup
git clone --recurse-submodules <repo-url>
cd vt-souvenir-system/backend
npm install
cp .env.example .env              # Edit with your credentials

# Database
npm run init-db                   # Create schema (7+ tables, 4 views) — idempotent
npm run migrate                   # Run pending migrations (28 migration files)

# Development
npm run dev                       # Express server with nodemon auto-reload (port 3000)
npm start                         # Production server

# Testing
npm test                          # Test Notion integration
npm run test-analytics            # Test analytics engine
node examples/create-sample-order.js  # End-to-end order creation

# Demo mode (no database/credentials required)
cd .. && node demo-server.js      # In-memory mock server for API exploration

# Manual API checks
curl http://localhost:3000/health
curl http://localhost:3000/api/analytics?period=today
```

## Architecture

### Four Agent Modules

Agents are **autonomous modules** that expose functions (not microservices). They share the database pool from `shared/database.js`.

1. **Notion Agent** (`backend/agents/notion-agent/`)
   - `index.js` — Notion API CRUD (create/update/query orders)
   - `sync.js` — Bidirectional DB ↔ Notion sync, atomic order creation
   - `config.js` — Property name mappings (must match Notion schema)

2. **Analytics Agent** (`backend/agents/analytics-agent/`)
   - `revenue-calculator.js` — Financial metrics, top products/clients
   - `report-generator.js` — HTML reports via Handlebars templates
   - `email-sender.js` — Nodemailer/Resend dispatch
   - `scheduler.js` — Cron-scheduled daily/weekly/monthly reports

3. **Inventory Agent** (`backend/agents/inventory/`)
   - `bom-manager.js` — Bill of Materials management
   - `material-manager.js` — Material stock tracking
   - `order-integration.js` — Links orders to material consumption
   - `forecasting-engine.js` — Demand forecasting

4. **Alerts Agent** (`backend/agents/alerts/`)
   - `order-alerts.js` — Low-margin alerts, status change notifications

### Services Layer (35+ Modules)

`backend/services/` contains the core business logic:

| Category | Services |
|----------|---------|
| **PDF Generation** | `pdf-generator.js`, `branded-receipt-generator.js`, `catalog-generator.js`, `quote-generator.js` |
| **WhatsApp** | `whatsapp-api.js`, `whatsapp-ai.js`, `whatsapp-templates.js`, `whatsapp-media.js` |
| **Payment** | `payment-receipt-verifier.js`, `receipt-ocr.js`, `claude-receipt-analyzer.js`, `cep-service.js`, `cep-retry-scheduler.js` |
| **Shipping** | `t1-envios-service.js`, `skydropx.js`, `shipping-notification-scheduler.js`, `pickup-scheduler.js` |
| **Marketplace** | `facebook-marketplace.js`, `facebook-scheduler.js`, `mercadolibre.js` |
| **Design** | `design-analyzer.js`, `designer-task-tracker.js`, `designer-scheduler.js`, `designer-report-generator.js` |
| **Sales AI** | `sales-coach.js`, `sales-learning-engine.js`, `sales-digest-generator.js` |
| **Knowledge** | `knowledge-index.js`, `knowledge-ai.js` |
| **Pricing** | `pricing-engine.js` (dynamic tiers, markups) |
| **Notifications** | `push-notification.js` (web push via VAPID) |
| **Media** | `cloudinary-config.js`, `gemini-image.js`, `heic-utils.js` |

### API Routes (28 Route Files)

`backend/api/server.js` is the main Express app. Route modules in `backend/api/`:

| Route File | Auth | Purpose |
|-----------|------|---------|
| `client-routes.js` | None | Client-facing order creation, uploads |
| `admin-routes.js` | JWT | Admin login, user management |
| `employee-routes.js` | Employee JWT | Employee login, dashboards |
| `inventory-routes.js` | JWT | Stock management, BOM |
| `price-routes.js` | JWT | Pricing engine, tiers |
| `discount-routes.js` | JWT | Discount management |
| `shipping-routes.js` | JWT | Labels, tracking, CEP validation |
| `receipt-routes.js` | JWT | Supplier receipt OCR analysis |
| `upload-routes.js` | JWT | File uploads (Cloudinary/local) |
| `quote-routes.js` | JWT | Quote PDF generation |
| `ai-assistant-routes.js` | JWT | Claude chat interface |
| `whatsapp-routes.js` | Webhook | WhatsApp message handling |
| `whatsapp-template-routes.js` | JWT | WhatsApp template management |
| `mercadolibre-routes.js` | JWT | Mercado Libre integration |
| `task-routes.js` | Employee JWT | Task management |
| `gallery-routes.js` | Employee JWT | Design gallery |
| `notes-routes.js` | Employee JWT | Internal notes |
| `designer-routes.js` | Employee JWT | Designer task management |
| `design-portal-routes.js` | JWT | Design portal features |
| `public-design-routes.js` | Internal | Public design submissions |
| `lead-routes.js` | JWT | Lead management |
| `coaching-routes.js` | JWT | Sales coaching |
| `knowledge-routes.js` | JWT | Knowledge base |
| `bom-routes.js` | JWT | Bill of Materials |
| `t1-routes.js` | Sync key | T1 Envios shipping sync |
| `webhook-routes.js` | Webhook secret | Make.com webhooks |

### Authentication

**File:** `backend/api/middleware/employee-auth.js`

- `employeeAuth()` — Requires Bearer JWT token
- `requireRole(...roles)` — Role-based access (manager, staff)
- `requireDepartment(...depts)` — Department access (Design, Production, Counting, Shipping)
- `requireManager()` — Manager-only endpoints
- `optionalAuth()` — Attaches employee data if valid token present
- `generateEmployeeToken(employee)` — Creates 8-hour JWT
- `logActivity()` — Audit logging for employee actions

Admin auth uses separate JWT with `JWT_SECRET` env var.

## Data Flow

### Order Creation (Critical Path)

```
Client → POST /api/orders → createOrderBothSystems()
                              ↓
               ┌──────────────┴──────────────┐
               ↓                             ↓
       PostgreSQL (atomic)           Notion API (via sync.js)
       ├── clients                   └── Notion Database Page
       ├── orders
       ├── order_items
       └── production_tracking
               ↓
       Analytics Agent → Scheduled Reports → Email
       Alerts Agent → Notifications
       Task Generator → Auto-creates design tasks
```

**CORRECT — use the sync module:**
```javascript
import { createOrderBothSystems } from './agents/notion-agent/sync.js';
const result = await createOrderBothSystems({ clientName: "...", items: [...] });
// Creates in DB + Notion atomically, returns both local ID and Notion URL
```

**WRONG — never bypass sync:**
```javascript
await notionAgent.createOrder(data);  // Notion only, DB out of sync
await query('INSERT INTO orders...');  // DB only, Notion out of sync
```

## Database

### Connection Pool

All queries go through the shared pool in `backend/shared/database.js`:

```javascript
import { query, getClient } from '../../shared/database.js';

// Simple query
const result = await query('SELECT * FROM orders WHERE id = $1', [orderId]);

// Transaction (atomic operations)
const client = await getClient();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO orders...');
  await client.query('INSERT INTO order_items...');
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

### Schema

**Core tables:** `clients`, `products`, `orders`, `order_items`, `production_tracking`, `order_notes`, `pricing_config`, `employees`, `inventory`, `shipping_labels`, `payment_verifications`

**Auto-calculated columns** (never insert these directly):
- `orders.profit` — `total_price - total_production_cost`
- `orders.profit_margin` — percentage
- `order_items.line_total`, `line_cost`, `line_profit`

**Analytics views:** `order_summary`, `daily_revenue`, `top_products`, `top_clients`

**Migrations:** 28 files in `backend/migrations/` — run with `npm run migrate`. Cover: employee system, design portal, payment tracking, shipping labels, WhatsApp insights, sales coaching, Facebook/ML integration, and more.

### Notion Property Mapping

The mapping in `notion-agent/config.js` **must match** your Notion database schema exactly.

- Order Number → Title property (required)
- Status → Select: New, Design, Printing, Cutting, Counting, Shipping, Delivered, Cancelled
- Department → Select: Design, Production, Counting, Shipping, Completed

**When modifying Notion schema:**
1. Update `propertyMappings` in `config.js`
2. Update `buildOrderProperties()` in `notion-agent/index.js`
3. Update `parseNotionPage()` to extract new properties

## Frontend Applications

All frontend apps are **static HTML/CSS/JS** (no build step required) except `sanity-studio` (React + Sanity CMS).

- Deployed to **Vercel** (each app has its own deployment)
- PWA support for admin-dashboard and employee-dashboard
- Authentication via localStorage JWT tokens
- API calls to the Render-hosted backend

**Key frontend apps:**
- `admin-dashboard/` — Full order management, analytics, employee management
- `employee-dashboard/` — Role-based views per department
- `pedidos/` — Client order form (axkan-pedidos.vercel.app)
- `landing/` — Marketing site (axkan.art)
- `order-tracking/` — Client-facing order status

## Environment Configuration

Backend requires `.env` in `backend/` (copy from `.env.example`):

```env
# Required — breaks the system if wrong
NOTION_API_TOKEN=secret_xxx       # Must start with "secret_"
NOTION_ORDERS_DATABASE_ID=xxx     # 32-char hex, no dashes
DB_TYPE=postgres                  # "postgres" or "demo"
DATABASE_URL=postgresql://...     # Or individual DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD

# Authentication
JWT_SECRET=xxx                    # For admin/employee JWT signing
ADMIN_USERNAME=xxx
ADMIN_PASSWORD=xxx

# Email (pick one provider)
RESEND_API_KEY=xxx                # Recommended
# OR: EMAIL_SERVICE=gmail, EMAIL_USER=xxx, EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
REPORT_RECIPIENTS=owner@co.com,mgr@co.com

# Scheduled reports (cron format)
DAILY_REPORT_SCHEDULE=0 8 * * *
WEEKLY_REPORT_SCHEDULE=0 9 * * 1
MONTHLY_REPORT_SCHEDULE=0 10 1 * *
COMPANY_TIMEZONE=America/Mexico_City

# Integrations (optional — features degrade gracefully)
ANTHROPIC_API_KEY=xxx             # Claude AI (receipt analysis, chat)
OPENAI_API_KEY=xxx                # OpenAI features
CLOUDINARY_CLOUD_NAME=xxx         # Image uploads
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
STRIPE_SECRET_KEY=xxx             # Payment processing
WHATSAPP_ACCESS_TOKEN=xxx         # WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=xxx
ML_CLIENT_ID=xxx                  # Mercado Libre
ML_CLIENT_SECRET=xxx
FACEBOOK_PAGE_ACCESS_TOKEN=xxx    # Facebook Marketplace
VAPID_PUBLIC_KEY=xxx              # Web push notifications
VAPID_PRIVATE_KEY=xxx
MAKE_WEBHOOK_SECRET=xxx           # Make.com webhook validation
```

## Deployment

### Backend (Render)

Configured in `render.yaml`:
- **Service:** Web, Node.js, Oregon region
- **Build:** `git submodule update --init --recursive && cd backend && npm install`
- **Start:** `cd backend && npm start`
- **Node version:** 20

### Frontend (Vercel)

Each frontend app deploys independently via Vercel. Config in `frontend/vercel.json`.

### CORS

Allowed origins configured in `server.js`: Render frontend, Vercel deployments, custom domains (`axkan.art`, `vtanunciando.com`), Chrome extensions.

## Common Modification Patterns

### Adding a new API endpoint

1. Create route file in `backend/api/` (e.g., `new-feature-routes.js`)
2. Import and mount in `server.js`: `app.use('/api/new-feature', newFeatureRoutes)`
3. Add appropriate auth middleware (`employeeAuth`, `requireRole`, etc.)

### Adding a new service

1. Create file in `backend/services/`
2. Import and use from routes or other services
3. If it needs scheduling, add cron job in the relevant agent's `scheduler.js`

### Adding a database migration

1. Create migration file in `backend/migrations/` following the naming pattern
2. Add the migration to `backend/shared/run-all-migrations.js`
3. Run with `npm run migrate`

### Adding a new Notion property

```javascript
// 1. Add to config.js propertyMappings
// 2. Add to buildOrderProperties() in notion-agent/index.js
// 3. Add to parseNotionPage() for reading back
```

### Adding a new report type

1. Create Handlebars template in `analytics-agent/templates/`
2. Add generator function in `report-generator.js`
3. Add scheduler in `scheduler.js` if automated
4. Add API route for manual triggering

## Error Handling

- Agents use **retry with exponential backoff** for API calls (`shared/utils.js`)
- Notion: 3 requests/second (handled via `sleep(350)` in bulk operations)
- Rate limiting on auth endpoints (5 attempts/15 min)
- Helmet.js for HTTP security headers

## Testing Strategy

**Integration tests** (not unit tests):
- `backend/examples/test-notion.js` — Full round-trip Notion CRUD
- `backend/examples/test-analytics.js` — Database queries + report generation
- `backend/examples/create-sample-order.js` — End-to-end order workflow

**Manual API testing:**
```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d @test-order.json
curl -X POST http://localhost:3000/api/reports/daily/send
```

**Demo mode** (`node demo-server.js`): In-memory mock server, no database or credentials needed. Useful for API exploration and frontend testing.

## AXKAN Brand System

Use `/axkan` skill for ANY brand-related task.

**Key files:**
- `AXKAN/axkan-skill-claude-code/SKILL.md` — Complete brand identity (668 lines)
- `AXKAN/AXKAN-SALES-ASSISTANT-FB-MARKETPLACE.md` — Sales templates
- `AXKAN/brand-manual/` — Visual assets
- `AXKAN/prompts/` — AI generation prompts

**Primary Colors:**
| Color | Hex |
|-------|-----|
| Rosa Mexicano | #e72a88 |
| Verde Selva | #8ab73b |
| Naranja Cálido | #f39223 |
| Turquesa Caribe | #09adc2 |
| Rojo Mexicano | #e52421 |
| Oro Maya (MDF Edge) | #D4A574 |

**Typography:** RL AQVA (titles), Prenton RP Cond (body)

**The AXKAN Test** — Apply to all brand decisions:
1. Does it trigger pride?
2. Is it culturally authentic?
3. Is it premium?
4. Is it accessible?
5. Will it last?

**External Links:**
- Catalog: https://vtanunciando.com
- Orders: https://axkan-pedidos.vercel.app/
- Social: @axkan.mx

## Documentation Reference

```
docs/
├── API_REFERENCE.md                # Complete REST API documentation
├── SETUP_GUIDE.md                  # Step-by-step first-time setup
├── FIXES.md                        # Bug fix log
├── FIXES-local.md                  # Local environment fixes
├── TODO-UI-UX-IMPROVEMENTS.md      # Planned UI/UX work
├── AUTOMATIC-COST-CALCULATIONS.md  # Cost calculation formulas
├── setup/                          # Setup & deployment guides
│   ├── DEPLOYMENT.md               # General deployment instructions
│   ├── RENDER_SETUP.md             # Render.com configuration
│   ├── INVENTORY_SETUP.md          # Inventory system setup
│   ├── SETUP-AUTOMATIC-COSTS.md    # Automatic cost calculation setup
│   └── MAKE_COM_WEBHOOKS.md        # Make.com automation setup
├── features/                       # Feature completion summaries
│   ├── ADMIN_DASHBOARD_COMPLETE.md
│   ├── AUTOMATIC-COSTS-SUMMARY.md
│   ├── CLIENT_ORDER_SYSTEM_PROGRESS.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── INVENTORY_INTEGRATION_COMPLETE.md
│   ├── SECURITY_AND_NOTION_COMPLETE.md
│   └── UPDATES_COMPLETED.md
├── guides/                         # User-facing guides
│   ├── BARCODE_QUICK_START.md      # Barcode scanning quick reference
│   ├── BARCODE_INVOICE_TESTING_GUIDE.md
│   ├── SMART_BARCODE_TESTING.md
│   └── SMART_BARCODE_VISUAL_GUIDE.md
├── plans/                          # Feature design documents (13 files)
├── security-exercise/              # Security audit reports
└── superpowers/                    # WhatsApp CRM extension docs
```

Root-level docs: `README.md` (onboarding), `CLAUDE.md` (AI instructions), `QUICKSTART.md` (5-min setup).

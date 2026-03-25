# VT Souvenir System

Full-stack production management platform for custom souvenir businesses. Handles the complete order lifecycle — from client intake to Notion sync, production tracking, payment verification, shipping, analytics reporting, and multi-channel sales.

## Features

- **Order Management** — Create, track, and manage orders with automatic Notion sync
- **Admin & Employee Dashboards** — Role-based PWA dashboards for managers, designers, and production staff
- **Analytics & Reporting** — Automated daily/weekly/monthly email reports with revenue, profit, and product insights
- **Payment Verification** — Receipt OCR via Claude AI, SPEI/CEP Banxico validation
- **Multi-Channel Sales** — WhatsApp Business API, Facebook Marketplace, Mercado Libre integrations
- **Inventory Management** — Bill of Materials (BOM), material tracking, demand forecasting
- **Shipping** — T1 Envios and Skydropx integration, label generation, tracking notifications
- **AI Assistant** — Claude-powered chat, sales coaching, knowledge base
- **PDF Generation** — Receipts, catalogs, quotes, designer reports with QR codes
- **Push Notifications** — Web push via VAPID for real-time alerts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, Express, ES modules |
| Database | PostgreSQL (Supabase) |
| Frontend | Vanilla HTML/CSS/JS (static PWAs) |
| Deployment | Render (backend), Vercel (frontend) |
| AI | Anthropic Claude, OpenAI, Google Gemini |
| Integrations | Notion, WhatsApp, Stripe, Cloudinary, Facebook, Mercado Libre |

## Quick Start

### Prerequisites

- Node.js v20+
- PostgreSQL database (local or Supabase)
- Notion account with API access

### 1. Clone & Install

```bash
git clone --recurse-submodules https://github.com/ivanvip24/vt-souvenir-system.git
cd vt-souvenir-system/backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see [Environment Variables](#environment-variables) below).

### 3. Initialize Database

```bash
npm run init-db    # Creates schema (tables + views)
npm run migrate    # Run all migrations
```

### 4. Start the Server

```bash
npm run dev        # Development with auto-reload (port 3000)
# or
npm start          # Production mode
```

### 5. Verify

```bash
curl http://localhost:3000/health
```

### Demo Mode (No Database Required)

```bash
cd vt-souvenir-system
node demo-server.js
```

Runs an in-memory mock server — all API endpoints work with temporary data. No PostgreSQL, Notion, or email credentials needed.

## Project Structure

```
vt-souvenir-system/
├── backend/
│   ├── api/
│   │   ├── server.js              # Main Express app
│   │   ├── middleware/            # Auth middleware (JWT + roles)
│   │   └── *-routes.js           # 28 route modules
│   ├── agents/
│   │   ├── notion-agent/          # Notion bidirectional sync
│   │   ├── analytics-agent/       # Revenue calc & scheduled reports
│   │   ├── inventory/             # BOM & material tracking
│   │   └── alerts/                # Order notifications
│   ├── services/                  # 35+ business logic modules
│   ├── shared/                    # Database pool, utilities
│   ├── migrations/                # 28 database migrations
│   └── package.json
├── frontend/
│   ├── admin-dashboard/           # Admin management PWA
│   ├── employee-dashboard/        # Employee portal (role-based)
│   ├── pedidos/                   # Client order form
│   ├── landing/                   # Marketing site
│   ├── order-tracking/            # Client order status
│   ├── mobile-app/                # Mobile PWA
│   ├── configurador/              # Product customizer
│   └── ... (16 apps total)
├── AXKAN/                         # Brand identity system
├── Make_automations_blueprints/   # Make.com automation configs
├── facebook-marketplace-bot/      # Python/Selenium listing bot
├── docs/                          # Setup guides, API docs, plans
├── render.yaml                    # Render deployment config
└── CLAUDE.md                      # AI assistant instructions
```

## Environment Variables

Create `backend/.env` from `backend/.env.example`. Required variables:

```env
# Database (required)
DATABASE_URL=postgresql://user:pass@host:5432/souvenir_management
# Or individual: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
DB_TYPE=postgres

# Notion (required for order sync)
NOTION_API_TOKEN=secret_xxxxx
NOTION_ORDERS_DATABASE_ID=xxxxx

# Authentication (required)
JWT_SECRET=your-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password

# Email (required for reports — pick one)
RESEND_API_KEY=re_xxxxx
# Or: EMAIL_SERVICE=gmail, EMAIL_USER=xxx, EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
REPORT_RECIPIENTS=owner@company.com

# Company
COMPANY_NAME=Your Souvenir Company
COMPANY_TIMEZONE=America/Mexico_City
```

Optional integrations (features degrade gracefully if not set):

```env
ANTHROPIC_API_KEY=         # Claude AI (receipt analysis, chat assistant)
OPENAI_API_KEY=            # OpenAI features
CLOUDINARY_CLOUD_NAME=     # Image uploads
STRIPE_SECRET_KEY=         # Payment processing
WHATSAPP_ACCESS_TOKEN=     # WhatsApp Business API
ML_CLIENT_ID=              # Mercado Libre
FACEBOOK_PAGE_ACCESS_TOKEN=# Facebook Marketplace
VAPID_PUBLIC_KEY=          # Web push notifications
```

## NPM Scripts (backend/)

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node api/server.js` | Production server |
| `npm run dev` | `nodemon api/server.js` | Development with auto-reload |
| `npm test` | `node examples/test-notion.js` | Test Notion integration |
| `npm run test-analytics` | `node examples/test-analytics.js` | Test analytics engine |
| `npm run init-db` | `node shared/init-database.js` | Initialize database schema |
| `npm run migrate` | `node shared/run-migration.js` | Run pending migrations |

## API Overview

Base URL: `http://localhost:3000`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | None | Health check |
| `/api/orders` | POST | JWT | Create order (syncs to DB + Notion) |
| `/api/orders` | GET | JWT | List orders with filters |
| `/api/orders/:id/status` | PATCH | JWT | Update order status |
| `/api/analytics` | GET | JWT | Analytics summary by period |
| `/api/reports/daily/send` | POST | JWT | Trigger daily report email |
| `/api/client/orders` | POST | None | Client-facing order creation |
| `/api/admin/login` | POST | None | Admin authentication |
| `/api/employees/login` | POST | None | Employee authentication |

See `docs/API_REFERENCE.md` for the complete API documentation.

## Notion Setup

1. Create a Notion integration at https://www.notion.so/my-integrations
2. Create an "Orders" database with properties matching `backend/agents/notion-agent/config.js`
3. Share the database with your integration
4. Copy the integration token and database ID to `.env`

Required Notion properties: Order Number (Title), Status (Select), Department (Select), Client Name (Text), Total Price (Number), Production Cost (Number), and more. See `config.js` for the full mapping.

## Deployment

### Backend → Render

Configured in `render.yaml`. Builds with `npm install`, starts with `npm start`, Node.js 20.

### Frontend → Vercel

Each frontend app deploys independently. Static files, no build step required (except `sanity-studio` which uses React).

## Automated Reports

Configured via cron schedules in `.env`:

| Report | Default Schedule | Description |
|--------|-----------------|-------------|
| Daily | 8:00 AM daily | Previous day revenue, top products |
| Weekly | 9:00 AM Mondays | Week's performance summary |
| Monthly | 10:00 AM, 1st of month | Comprehensive analytics with trends |

Reports run in-process via node-cron. HTML templates in `backend/agents/analytics-agent/templates/`.

## Documentation

- `CLAUDE.md` — Complete system architecture for AI assistants
- `docs/SETUP_GUIDE.md` — Detailed first-time setup
- `docs/API_REFERENCE.md` — Full REST API documentation
- `DEPLOYMENT.md` — Deployment instructions
- `RENDER_SETUP.md` — Render.com configuration
- `INVENTORY_SETUP.md` — Inventory system setup
- `MAKE_COM_WEBHOOKS.md` — Make.com automation setup

## License

MIT License

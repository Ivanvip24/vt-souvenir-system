# Admin Dashboard

> Single-page application with 20+ tabs managing every business operation.

## What it does

The central control panel for running the AXKAN business. Everything from viewing orders, managing WhatsApp conversations, generating shipping labels, tracking designers, and viewing analytics — all in one place.

## Tabs

| Tab | File | What it does |
|-----|------|-------------|
| Dashboard | `dashboard.js` | KPI cards, today's revenue, pending actions |
| WhatsApp | `whatsapp.js` | Conversation list, chat view, AI toggle, model selector |
| Orders | (in server.js) | Order list, status management, payment tracking |
| Shipping / Guias | `guias.js` | Label generation, tracking, carrier selection |
| Shipping Analytics | `shipping-analytics.js` | Carrier performance, cost comparison |
| Analytics | `analytics.js` | Revenue charts, trends, period comparison |
| Inventory | `inventory.js` | Stock levels, material costs |
| Prices | `prices.js` | Pricing tiers, cost sheet, BOM |
| Discounts | `discounts.js` | Coupon creation, discount rules |
| Tasks | `tasks.js` | Design/production/shipping tasks |
| Leads | `leads.js` | Lead capture, follow-up tracking |
| Employees | `employees.js` | Employee directory, permissions |
| Employee Stats | `employees-stats.js` | Activity logs, commission tracking |
| AI Assistant | `ai-assistant.js` | Universal Claude assistant (quotes, images, analysis) |
| Marketplace | `marketplace.js` | Mercado Libre + Facebook listings |
| Calendar | `calendar.js` | Deadlines, events, delivery dates |
| Payment Notes | `payment-notes.js` | Payment verification notes |
| Designs Portal | `designs.html` | Designer chat iframe |
| Mobile App | `mobile.js` | Mobile app preview |

## Key files

| File | Purpose |
|------|---------|
| `frontend/admin-dashboard/index.html` | Shell HTML |
| `frontend/admin-dashboard/styles.css` | Full styling (196 KB) |
| `frontend/admin-dashboard/*.js` | One JS file per tab |
| `frontend/admin-dashboard/login.html` | JWT login |
| `frontend/admin-dashboard/service-worker.js` | PWA offline |

## Special features

- **Command palette** (`command-palette.js`) — Cmd+K omnibar for quick navigation
- **Push notifications** — Web push via VAPID keys
- **PWA** — Installable on mobile with service worker
- **Chrome extension** — T1 Envios auto-fill (`t1-autofill.user.js`)

## Current state

### What works
1. All tabs functional and loading data
2. JWT authentication with admin/employee roles
3. Real-time WhatsApp conversation view
4. Responsive design for mobile
5. Command palette for fast navigation

### What still fails or needs work
1. `styles.css` is 196 KB — monolithic, could be split
2. `server.js` is 5400+ lines — route logic should be in separate files
3. Some tabs load slowly with large datasets (no pagination)
4. No dark mode

### Future plans
1. Split large files into modules
2. Add pagination to order/conversation lists
3. Dashboard widgets customization

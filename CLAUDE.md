# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Overview

This is a **dual-agent automation system** for managing custom souvenir production businesses. The system replaces manual Notion data entry and provides automated analytics with email reporting.

The repository also contains the **AXKAN brand identity system** - a complete brand oracle for the souvenir brand including visual identity, voice, sales strategies, and decision frameworks.

### AXKAN Brand System (`AXKAN/`)

Use `/axkan` skill for ANY brand-related task. The skill provides:
- Complete visual identity (colors, typography, logo rules, patterns)
- Brand voice guidelines by channel (B2C, B2B, internal)
- Product pricing and specifications
- Sales scripts and objection handling
- The "AXKAN Test" decision framework

Key files:
- `AXKAN/.claude/skills/axkan/SKILL.md` - Complete brand identity (668 lines)
- `AXKAN/AXKAN-SALES-ASSISTANT-FB-MARKETPLACE.md` - WhatsApp/Marketplace sales templates
- `AXKAN/brand-manual/` - Visual assets (logo system, product examples)
- `AXKAN/prompts/` - AI generation prompts for Instagram/video content

### Two Specialized Agents

1. **Notion Integration Agent** (`backend/agents/notion-agent/`)
   - Auto-creates order pages in Notion with structured data
   - Bidirectional sync: local database ↔ Notion
   - Handles CRUD operations and bulk sync
   - Entry point: `notion-agent/index.js` for API operations, `notion-agent/sync.js` for database integration

2. **Analytics & Reporting Agent** (`backend/agents/analytics-agent/`)
   - Real-time revenue/profit calculations
   - Scheduled email reports (daily/weekly/monthly)
   - HTML report generation with Handlebars templates
   - Entry point: `analytics-agent/index.js`, scheduler runs via `analytics-agent/scheduler.js`

### Data Flow Architecture

```
Client Order → API (/api/orders) → createOrderBothSystems()
                                   ↓
                    ┌──────────────┴──────────────┐
                    ↓                             ↓
            Local PostgreSQL              Notion API (via sync.js)
                    ↓                             ↓
            order_items table            Notion Database Page
            production_tracking          (with all properties)
                    ↓
            Analytics Agent watches orders table
                    ↓
            Scheduled Reports (cron) → Email (nodemailer)
```

## Essential Commands

```bash
# First-time setup
npm install
cp .env.example .env
# Edit .env with Notion token, database ID, email credentials
npm run init-db              # Creates PostgreSQL schema with 7 tables + 4 views

# Development
npm run dev                  # Server with auto-reload (nodemon)
npm start                    # Production server
node demo-server.js          # Demo mode (no database required)

# Testing
npm test                     # Tests Notion integration
npm run test-analytics       # Tests analytics engine
node examples/create-sample-order.js  # Creates example order

# Database
npm run init-db              # Initialize schema (idempotent)
psql -U postgres -d souvenir_management  # Direct database access
```

## Critical Architecture Details

### Agent Communication Pattern

Agents are **autonomous modules** that expose functions, not microservices. They share the database connection pool from `shared/database.js`.

**Creating an order (proper flow):**
```javascript
// CORRECT: Use sync module which coordinates both systems
import { createOrderBothSystems } from './agents/notion-agent/sync.js';

const result = await createOrderBothSystems({
  clientName: "...",
  items: [...],
  // ... order data
});
// This automatically:
// 1. Creates client in DB (or finds existing)
// 2. Creates order + order_items
// 3. Syncs to Notion via notionAgent.createOrder()
// 4. Returns both local ID and Notion page URL
```

**WRONG approach:**
```javascript
// Don't do this - bypasses sync logic
await notionAgent.createOrder(data);  // Notion only
await query('INSERT INTO orders...');  // DB only
```

### Database Schema Key Points

**Generated columns** (don't try to insert these):
- `orders.profit` - Auto-calculated as `total_price - total_production_cost`
- `orders.profit_margin` - Auto-calculated percentage
- `order_items.line_total`, `line_cost`, `line_profit` - Auto-calculated per item

**Important views for analytics:**
- `order_summary` - Pre-joined orders with client info
- `daily_revenue` - Aggregated by date
- `top_products`, `top_clients` - Rankings with totals

**Transaction pattern for orders:**
```javascript
await query('BEGIN');
// 1. Insert/update client
// 2. Insert order
// 3. Insert order_items
// 4. Sync to Notion
await query('COMMIT');  // Only if Notion succeeds
```

### Notion Property Mapping

The mapping in `notion-agent/config.js` **must match** your Notion database schema. Key mappings:

- Order Number → Title property (required)
- Status → Select with values: New, Design, Printing, Cutting, Counting, Shipping, Delivered, Cancelled
- Department → Select with values: Design, Production, Counting, Shipping, Completed
- Profit/Margin → Can be Number or Formula properties in Notion

**When modifying Notion schema:**
1. Update property names in `config.js` → `propertyMappings`
2. Update `buildOrderProperties()` in `notion-agent/index.js` if adding new properties
3. Update `parseNotionPage()` to extract new properties

### Report Generation Flow

Reports use **Handlebars templates** in `analytics-agent/templates/`:

```javascript
// Report generation sequence:
1. scheduler.js triggers via cron (e.g., "0 8 * * *")
2. Calls reportGenerator.generateDailyReport(date)
3. Queries database via revenueCalculator functions
4. Compiles Handlebars template with data
5. emailSender.sendDailyReport(html, date)
6. Saves to reports_history table
```

**Template data structure:**
```javascript
{
  companyName: process.env.COMPANY_NAME,
  revenue: formatCurrency(amount),
  topProducts: [{productName, revenueFormatted, ...}],
  comparison: {revenueChangePercent, ...},
  // Templates expect formatted strings, not raw numbers
}
```

### Environment Configuration Critical Variables

```env
# These break agents if wrong:
NOTION_API_TOKEN          # Must start with "secret_"
NOTION_ORDERS_DATABASE_ID # 32-char hex, no dashes
DB_TYPE=postgres          # "postgres" or "demo" (demo skips DB)

# Cron schedules (minute hour day month weekday):
DAILY_REPORT_SCHEDULE=0 8 * * *    # 8 AM daily
WEEKLY_REPORT_SCHEDULE=0 9 * * 1   # 9 AM Mondays
MONTHLY_REPORT_SCHEDULE=0 10 1 * * # 10 AM, 1st of month

# Email (Gmail requires app password, not account password)
EMAIL_SERVICE=gmail
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # 16-char app password
```

### Common Modification Patterns

**Adding a new Notion property:**
```javascript
// 1. Add to config.js
export const propertyMappings = {
  newField: 'New Field Name',  // Exact Notion property name
  // ...
};

// 2. Add to buildOrderProperties() in notion-agent/index.js
if (orderData.newField) {
  properties[propertyMappings.newField] = {
    rich_text: [{ text: { content: orderData.newField } }]
  };
}

// 3. Add to parseNotionPage() for querying
newField: extractText(props[propertyMappings.newField])
```

**Adding a new report type:**
```javascript
// 1. Create template in analytics-agent/templates/new-report.html
// 2. Add function to report-generator.js:
export async function generateNewReport(params) {
  const data = await revenueCalculator.getRelevantData(params);
  const template = handlebars.compile(templateSource);
  return { html: template(data), type: 'new', ... };
}
// 3. Add scheduler in scheduler.js if automated
// 4. Add API route in api/server.js
```

**Extending analytics with new metric:**
```javascript
// Add to revenue-calculator.js
export async function getNewMetric(startDate, endDate) {
  const result = await query(`
    SELECT ... FROM orders WHERE ...
  `);
  return result.rows.map(/* transform */);
}
// Analytics are pulled together in getAnalyticsSummary()
```

## Database Connection Pooling

All database operations use the shared pool from `shared/database.js`:

```javascript
import { query, getClient } from '../../shared/database.js';

// Simple query
const result = await query('SELECT * FROM orders WHERE id = $1', [orderId]);

// Transaction (when you need atomicity)
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

## Testing Strategy

**Integration tests** (not unit tests):
- `examples/test-notion.js` - Full round-trip: create order → verify in Notion → update → query
- `examples/test-analytics.js` - Queries real database, generates reports (doesn't send email)
- `examples/create-sample-order.js` - End-to-end order creation workflow

**Manual API testing:**
```bash
# Health check
curl http://localhost:3000/health

# Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d @examples/sample-order.json

# Trigger report manually
curl -X POST http://localhost:3000/api/reports/daily/send
```

## Scheduled Jobs Behavior

The scheduler initializes on server start (`api/server.js` → `analyticsAgent.initialize()`):

- Jobs run **in-process** (not separate workers)
- If server restarts, jobs reschedule automatically
- Timezone uses `COMPANY_TIMEZONE` env var (default: America/Mexico_City)
- Jobs log to stdout and save to `reports_history` table

**Debugging scheduled jobs:**
```bash
# List active jobs
curl http://localhost:3000/api/reports/schedule

# Check server logs for cron execution
# Look for: "📊 Running scheduled daily report..."
```

## Error Handling Philosophy

Both agents use **retry with exponential backoff** for API calls:

```javascript
import { retry } from '../../shared/utils.js';

// Notion API calls wrapped in retry (3 attempts, 1s → 2s → 4s delays)
const response = await retry(async () => {
  return await notion.pages.create({...});
});
```

Rate limits:
- Notion: 3 requests/second (handled via `sleep(350)` in bulk operations)
- Email: No rate limiting implemented (Gmail has ~500/day limit)

## Demo Mode vs Full Mode

`demo-server.js` provides a **database-free mode** for testing:
- Uses in-memory array for orders
- All API endpoints work but data is temporary
- Notion/email features return mock responses
- Useful for: API exploration, testing frontend integration, CI/CD

Switch modes:
```bash
node demo-server.js     # Demo mode
npm start               # Full mode (requires PostgreSQL + .env config)
```

## Documentation Files

- `docs/SETUP_GUIDE.md` - Step-by-step first-time setup
- `docs/API_REFERENCE.md` - Complete REST API documentation
- `QUICKSTART.md` - 5-minute setup for demo
- `SYSTEM_ACTIVE.md` - Status file created when demo launches

## AXKAN Quick Reference

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

**The AXKAN Test** - Apply to all brand decisions:
1. Does it trigger pride?
2. Is it culturally authentic?
3. Is it premium?
4. Is it accessible?
5. Will it last?

**External Links:**
- Catalog: https://vtanunciando.com
- Orders: https://axkan-pedidos.vercel.app/
- Social: @axkan.mx

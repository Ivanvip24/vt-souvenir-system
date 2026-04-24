# Order Management

> Creating, tracking, and fulfilling souvenir orders from WhatsApp through delivery.

## What it does

1. Creates orders from WhatsApp conversations or admin dashboard
2. Stores in PostgreSQL with auto-calculated profit/margin columns
3. Syncs to Notion for visual tracking
4. Tracks status through: New > Design > Printing > Cutting > Counting > Shipping > Delivered
5. Auto-generates tasks (design, production, shipping) when status changes
6. Sends receipts and notifications at key milestones

## How it works

```
Order creation (via WhatsApp bot or admin):
    |
    v
sync.js --> createOrderBothSystems()
    |
    +--> BEGIN transaction
    |    +--> Insert/update client
    |    +--> Insert order (profit auto-calculated)
    |    +--> Insert order_items (line totals auto-calculated)
    |    +--> Sync to Notion (creates page with all properties)
    +--> COMMIT
    |
    +--> task-generator.js creates initial tasks
    +--> Email receipt to client (if email on file)
```

## Key files

| File | Purpose |
|------|---------|
| `backend/agents/notion-agent/sync.js` | Dual-write to DB + Notion |
| `backend/agents/notion-agent/index.js` | Notion API operations |
| `backend/agents/notion-agent/config.js` | Notion property mappings |
| `backend/services/task-generator.js` | Auto-creates tasks on status change |
| `backend/api/server.js` | Order CRUD endpoints (in main server) |

## Current state

### What works
1. Full order lifecycle from creation to delivery
2. Auto-calculated profit, margin, line totals (DB generated columns)
3. Notion sync with full property mapping
4. Task auto-generation on status changes
5. Order attachments (designs, proofs, receipts)
6. Sales rep attribution
7. Store pickup vs shipping toggle
8. Multi-payment tracking (deposit + final)

### What still fails or needs work
1. Notion sync sometimes fails silently (retry handles it, but no alert)
2. No bulk order editing from dashboard
3. Order status history isn't tracked (only current status)

### Future plans
1. Order status change audit log
2. Automatic production deadline calculation based on quantity
3. Client-facing order status page with real-time updates

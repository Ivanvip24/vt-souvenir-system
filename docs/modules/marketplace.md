# Marketplace

> Multi-channel selling via Mercado Libre and Facebook Marketplace.

## What it does

1. **Mercado Libre** — OAuth2 integration for Global Selling (list products, sync prices)
2. **Facebook Marketplace** — Bot-based posting (generates CSV, Python script uploads)

## How it works

```
Mercado Libre:
    mercadolibre.js (OAuth2) --> ML API
        +--> Product listing
        +--> Price sync
        +--> Order sync (planned)

Facebook Marketplace:
    facebook-marketplace.js --> Queues designs
        +--> facebook-scheduler.js (9 AM daily)
        +--> Generates CSV with product data
        +--> Python bot reads CSV and posts to FB
```

## Key files

| File | Purpose |
|------|---------|
| `backend/services/mercadolibre.js` | ML OAuth2 + API |
| `backend/services/facebook-marketplace.js` | FB listing queue |
| `backend/services/facebook-scheduler.js` | 9 AM daily posting |
| `backend/api/mercadolibre-routes.js` | ML OAuth callback |

## Current state

### What works
1. Mercado Libre OAuth flow and token refresh
2. Product listing creation on ML
3. Facebook CSV generation from design queue
4. 9 AM scheduled posting

### What still fails or needs work
1. ML order sync not implemented — orders on ML aren't visible in dashboard
2. Facebook bot is fragile — depends on browser automation, breaks on FB UI changes
3. No analytics on marketplace performance
4. Price sync between platforms not automatic

### Future plans
1. ML order sync to unified order system
2. Replace FB bot with official Commerce API (when available)
3. Cross-platform inventory sync
4. Marketplace-specific analytics

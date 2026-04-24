# Shipping

> Label generation, tracking, pickup scheduling, and delivery notifications via Skydropx and T1 Envios.

## What it does

1. Generates shipping labels through Skydropx API
2. Tracks shipments and polls for status updates every 4 hours
3. Emails clients when package is in transit
4. Schedules daily pickups at 5 PM for all pending labels
5. Provides alternative quotes via T1 Envios public API
6. Handles multi-box shipments (different box sizes per product type)

## How it works

```
Admin creates shipping label
    |
    v
shipping-routes.js --> skydropx.js
    |
    +--> Validates address (30 char name, 35 char street limits)
    +--> Gets carrier quotes
    +--> Generates label PDF
    +--> Stores in shipping_labels table
    |
    v
Automated flows:
    +--> pickup-scheduler.js (5 PM daily) --> requests Skydropx pickup
    +--> shipping-notification-scheduler.js (every 4h) --> polls tracking
         +--> If IN_TRANSIT --> emails client notification
```

## Key files

| File | Purpose |
|------|---------|
| `backend/services/skydropx.js` | Skydropx OAuth2 API wrapper |
| `backend/services/t1-envios-service.js` | T1 Envios public API |
| `backend/services/pickup-scheduler.js` | 5 PM daily pickup requests |
| `backend/services/shipping-notification-scheduler.js` | 4h tracking poll + email |
| `backend/api/shipping-routes.js` | Label generation endpoints |
| `backend/api/t1-routes.js` | T1 Envios endpoints |

## Current state

### What works
1. Full Skydropx integration — labels, tracking, pickups
2. T1 Envios as alternative carrier option
3. Automated tracking notifications via email
4. Daily pickup scheduling
5. Multi-box shipment support
6. Chrome extension for T1 form auto-fill

### What still fails or needs work
1. Express often cheaper than standard (44% of destinations) — no smart selection yet
2. Problem destinations for express: Nayarit, BCS, Cozumel (expensive)
3. Skydropx multi-box quotes unreliable — needs 3 retries to get all carriers
4. Rush surcharge (12% on subtotal) decided but NOT implemented yet

### Future plans
1. Smart carrier selection (auto-pick cheapest option)
2. Implement rush order surcharge
3. Shipping analytics submenu under Guias tab
4. Real-time tracking page for clients (currently email-only)

## Cost notes

- **Pieces per box:** imanes=250, llaveros=400, destapadores=200, portallaves=40
- **Production times:** 1-499=3d, 500-1999=4d, 2000+=5d + 2d design + 7d shipping

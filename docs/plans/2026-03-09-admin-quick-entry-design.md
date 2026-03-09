# Admin Quick-Entry Panel Design

**Date:** 2026-03-09
**Problem:** Clients dictate orders on WhatsApp (5-15/week) instead of using the self-serve form. Ivan manually enters each order, wasting 15-30 min per order.
**Solution:** Speed-optimized admin panel for order entry in <60 seconds.

## Scope

- Admin-only (lives in existing admin dashboard)
- PostgreSQL only (no Notion sync)
- Replaces existing 2-step "Crear Nuevo Pedido" modal with a faster single-screen panel

## Design

### Single-Screen Layout

```
┌─────────────────────────────────────────────┐
│  QUICK ORDER ENTRY                     [X]  │
├─────────────────────────────────────────────┤
│                                             │
│  CLIENTE                                    │
│  📱 Teléfono: [________] ← autocomplete     │
│     → Auto-fills: name, email, city, address│
│  👤 Nombre:   [________]                    │
│  📧 Email:    [________] (optional)         │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  PRODUCTOS                                  │
│  🔍 [Search products...        ]            │
│  ┌──────────────────────────────────────┐   │
│  │ Imanes de MDF (Chico)    x200  $2,000│   │
│  │ [−] [qty] [+]              Subtotal  │   │
│  └──────────────────────────────────────┘   │
│  [+ Agregar otro producto]                  │
│                                             │
│  Total: $2,000                              │
│  Anticipo (50%): $1,000                     │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  DETALLES (opcional)                        │
│  Evento: [Ninguno ▼]   Fecha: [__/__/____]  │
│  Envío:  (•) Recoger   ( ) Enviar           │
│  Notas:  [________________________]         │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  [Crear Pedido]  [Crear y Copiar Resumen]   │
│                                             │
└─────────────────────────────────────────────┘
```

### Client Autocomplete

- Type 3+ digits of phone number → dropdown shows matching clients
- Select client → auto-fills name, email, city, address
- New client → just fill name + phone (minimal)
- API: `GET /api/clients/search?phone=555` returns matching clients

### Product Selection

- Searchable dropdown of products from `/api/client/products`
- Show tiered pricing based on quantity
- Auto-calculate line totals and order total
- Support multiple products per order

### Smart Defaults

- Deposit: 50%
- Shipping: Pickup (recoger en tienda)
- Event type: None
- Status: `pending_review`
- Created by: `admin`

### Submit Actions

1. **"Crear Pedido"** — Creates order in PostgreSQL, shows success toast
2. **"Crear y Copiar Resumen"** — Creates order + copies WhatsApp-ready message:

```
Pedido #AX-2026-0847
200 Imanes de MDF (Chico) - $2,000.00
Anticipo (50%): $1,000.00
Entrega estimada: 15 de abril

Haz tu anticipo aquí:
https://axkan-pedidos.vercel.app/pago/AX-2026-0847
```

### Speed Features

- Phone autocomplete for returning clients (zero re-typing)
- Keyboard navigation (Tab between fields, Enter to submit)
- Product search (type to filter)
- One-screen — no steps, no modals within modals
- Instant price calculation

## Technical Decisions

- **No Notion sync** — orders go to PostgreSQL only
- **Uses existing API** — `POST /api/orders` (or a simplified admin variant)
- **New API needed** — `GET /api/clients/search?phone=XXX` for autocomplete
- **Frontend only** — modify `index.html` and `dashboard.js` in admin-dashboard
- **No new dependencies** — uses existing product pricing engine

## Files to Modify

1. `frontend/admin-dashboard/index.html` — Replace create-order modal HTML
2. `frontend/admin-dashboard/dashboard.js` — Replace order creation JS (openCreateOrderModal, submitNewOrder, etc.)
3. `backend/api/server.js` — Add `GET /api/clients/search` endpoint

## Out of Scope

- Notion integration
- WhatsApp API bot (future phase)
- AI extraction from chat messages (future phase)
- Payment processing within this panel

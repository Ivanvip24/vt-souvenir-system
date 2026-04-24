# Frontend — AXKAN Web

Landing pages, admin dashboard, employee dashboard, Chrome extensions, and supporting forms.

## How It Works

Source HTML files use `<!-- @NAV -->`, `<!-- @FOOTER -->` etc. placeholders. `build.js` injects components from `components/` and outputs to `public/`. Vercel serves from `public/`.

## Commands

```bash
node build.js        # Build: inject components into pages → public/
vercel --prod --yes   # Deploy (run from repo root)
```

## Key Directories

| Directory | What |
|-----------|------|
| `components/` | Shared nav, footer, WhatsApp float, analytics snippet |
| `landing/` | Product catalog, souvenir city pages, destination pages |
| `landing/productos/` | Individual product pages |
| `landing/souvenirs/` | City-specific souvenir landing pages |
| `admin-dashboard/` | Order management, shipping, analytics, inventory |
| `employee-dashboard/` | Staff tasks, design portal, daily logs |
| `chrome-extension-t1-sync/` | T1 Envios autofill extension |
| `chrome-extension-whatsapp-crm/` | WhatsApp CRM sidebar extension |
| `pedidos/` | Order form (axkan-pedidos.vercel.app) |
| `shipping-form/` | Shipping address collection form |
| `lead-form/` | Lead capture form |

## Rules

- All new destination/historia pages MUST use `/frontend-design` skill — no generic templates
- Shared CSS: `landing/shared-nav-footer.css`
- `public/` is build output — never edit directly, never commit
- Product pages reference backend API at the URL in admin dashboard config

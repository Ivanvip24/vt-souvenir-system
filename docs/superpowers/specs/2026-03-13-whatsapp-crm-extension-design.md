# WhatsApp Web CRM Chrome Extension — Design Spec

**Date:** 2026-03-13
**Status:** Approved
**Author:** Ivan Valencia + Claude

---

## Overview

A Chrome extension (Manifest V3) that injects a sidebar into WhatsApp Web, giving AXKAN admins instant access to client order data, quick order creation with file uploads, and template messages — all without leaving the chat.

**Users:** Ivan + 1-2 team members
**Target:** WhatsApp Web (`web.whatsapp.com`)

---

## Goals

1. Eliminate context-switching between WhatsApp Web and the admin panel
2. Auto-detect which client you're chatting with via phone number
3. Show order history, status, and details inline
4. Create new orders directly from the sidebar during a conversation
5. Upload design files and payment proof without opening the admin panel
6. Auto-paste template messages into WhatsApp's input box

## Non-Goals

- Auto-sending messages (always paste-only, user hits Enter)
- Replacing the admin panel (complex workflows stay there)
- Shipping label generation
- Analytics or reporting

---

## Architecture

### Extension Components

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Service worker | `background.js` | JWT storage, all API calls, auth state management |
| Content script | `content.js` | Injects into WhatsApp Web, detects phone, renders sidebar |
| Popup | `popup.html`, `popup.js` | Admin login form, connection status, logout |
| Sidebar UI | `sidebar.html`, `sidebar.css` | Sidebar template injected as Shadow DOM |
| Manifest | `manifest.json` | Manifest V3 config, permissions, content script matching |

### Data Flow

```
WhatsApp Web (content.js)
    |
    +-- MutationObserver detects active chat change
    +-- Extracts phone number from chat header
    |
    +-- chrome.runtime.sendMessage --> background.js (service worker)
    |                                     |
    |                                     +-- Holds JWT in chrome.storage.local
    |                                     +-- Makes all API calls (avoids CORS)
    |                                     +-- Returns data to content script
    |
    +-- Renders sidebar (Shadow DOM)
    |     +-- Orders list with expandable details
    |     +-- Quick actions (copy, open admin, templates)
    |     +-- New order form with file uploads
    |     +-- Payment proof upload on existing orders
    |
    +-- Template messages --> injects into WhatsApp input box
```

### Why Shadow DOM

WhatsApp Web has complex CSS. Injecting regular HTML/CSS would cause style conflicts. Shadow DOM creates an isolated sandbox where our sidebar styles don't leak into WhatsApp and vice versa.

### Why All API Calls Go Through background.js

- Content scripts are visible to the host page — a malicious page could intercept tokens
- Service workers are sandboxed and inaccessible to page JavaScript
- Avoids CORS issues (service workers aren't bound by page origin)

---

## Authentication

1. User clicks extension icon -> popup shows login form
2. Credentials POST to `POST /api/admin/login` -> returns JWT
3. JWT stored in `chrome.storage.local` (persists across browser sessions)
4. Content script requests token from background via `chrome.runtime.sendMessage`
5. All API calls include `Authorization: Bearer {token}` header
6. On 401 response -> popup shows "Session expired, log in again"
7. Logout button clears token from storage

---

## Phone Detection

### How It Works

1. `MutationObserver` watches WhatsApp's main chat panel for conversation switches
2. When a new chat opens, the script reads the contact header area
3. Extracts phone numbers matching Mexican patterns (10 digits, optional +52 prefix)
4. Normalizes to clean 10-digit string (strips +52, spaces, dashes, parentheses)
5. Queries backend: `GET /api/clients/search?phone={number}`
6. If client found: fetches full details via `GET /api/clients/{id}`
7. If not found: sidebar shows "New client" state with pre-filled phone

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Saved contact (no visible phone) | Manual phone input field as fallback |
| Group chat | Sidebar collapses/hides |
| Multiple clients with same phone | Shows most recent (API sorts by updated_at DESC) |
| Non-Mexican number | Attempts lookup as-is, likely shows "New client" |

### Caching

Client data cached in memory for the session. Switching back to a previous chat loads from cache instantly. Cache clears on page refresh.

---

## Sidebar UI

### Position & Behavior

- Right side of WhatsApp Web, 320px wide
- Small floating toggle button (AXKAN jaguar icon) on the right edge
- Click toggle to open/close sidebar
- When open, WhatsApp's chat area compresses to make room (no overlap)
- Open/closed state persisted in `chrome.storage.local`

### Layout (Top to Bottom)

| Section | Content |
|---------|---------|
| **Header** | AXKAN logo (small), client name, phone, close button |
| **Orders tab** | Client's orders list. Each card shows: order number, status badge (color-coded), date, total price. Click to expand: line items (product, qty, size), attached design files (thumbnails) |
| **Quick Actions bar** | Icon buttons: Copy order #, Copy tracking #, Open in admin panel, New order |
| **Templates tab** | Pre-built messages with variable substitution. Click to auto-paste into WhatsApp input |
| **New Order form** | Expandable. Pre-filled client info, product dropdown, qty, size, design file upload per item, submit |

### Status Badge Colors

| Status | Color |
|--------|-------|
| New | Blue |
| Design | Purple |
| Printing | Orange |
| Cutting | Yellow |
| Shipping | Teal |
| Delivered | Green |
| Cancelled | Red |

### Visual Style

- Clean, compact, dark-ish theme to match WhatsApp Web's aesthetic
- AXKAN Rosa Mexicano (#e72a88) for toggle button and primary accents
- AXKAN Verde Selva (#8ab73b) for success states
- System fonts for performance (no custom font loading)

---

## Template Messages

### Default Templates

| Name | Message |
|------|---------|
| Order received | "Hola {name}! Tu pedido {orderNumber} ha sido recibido. Te mantendremos informado del avance." |
| Design ready | "Hola {name}! Tu diseno para el pedido {orderNumber} esta listo. Te lo comparto para tu aprobacion." |
| In production | "Hola {name}! Tu pedido {orderNumber} ya esta en produccion. Te avisamos cuando este listo." |
| Order ready | "Hola {name}! Tu pedido {orderNumber} esta listo para envio. El total restante es ${remaining}." |
| Tracking info | "Hola {name}! Tu pedido {orderNumber} ya fue enviado. Tu numero de rastreo es: {tracking} ({carrier})." |
| Payment reminder | "Hola {name}! Te recordamos que tu pedido {orderNumber} tiene un saldo pendiente de ${remaining}." |

### Auto-Paste Mechanism

1. Replace variables with real data from the active order
2. Find WhatsApp's message input box in the DOM
3. Set text content and dispatch `input` event (so WhatsApp registers it)
4. User reviews and hits Enter manually — extension NEVER auto-sends

### Variable Resolution

- `{name}` — client name from lookup
- `{orderNumber}` — selected order's number (e.g., ORD-20260313-1101)
- `{tracking}` — tracking number from shipping labels
- `{carrier}` — carrier name from shipping labels
- `{remaining}` — total price minus deposit paid
- `${total}` — order total price
- `${deposit}` — deposit amount

If a variable can't be resolved (e.g., no tracking yet), the template button is disabled or the variable shows as `[sin rastreo]`.

---

## Quick Order Creation

### Pre-filled Fields (from phone detection)

- Client name
- Client phone
- Client email (if on file)

### User Fills In

- Product (dropdown from `/api/client/products`)
- Quantity (number input)
- Size variant (populated based on selected product)
- Event/occasion (optional text)
- Design file upload (drag-and-drop zone or file picker per item)
- "+ Add item" button for multi-product orders

### Submit Flow

1. Files upload first via `POST /api/client/upload-file` -> returns Google Drive URLs
2. Order creates via `POST /api/orders` with file URLs attached
3. File attachments link via `POST /api/orders/:orderId/items/:itemId/attachment`
4. Success: shows order number, auto-refreshes order list
5. "Share confirmation" button pastes: "Hola {name}! Tu pedido {orderNumber} ha sido registrado. El total es ${total}, con un anticipo de ${deposit}."

### For New Clients

If phone not found in database, the form shows additional fields:
- Full name (required)
- Email (optional)

Client gets created alongside the order (the submit endpoint handles this).

---

## File Uploads

### Two Upload Types

| Type | When | Endpoint | Behavior |
|------|------|----------|----------|
| Design files | During order creation or on existing orders | `POST /api/client/upload-file` -> Google Drive | Drag-and-drop or file picker. Multiple files per item. |
| Payment proof | After order exists | `POST /api/client/orders/:orderId/upload-proof` | Single file. Thumbnail preview before submit. |

### UX Details

- Upload zones only appear when user clicks to upload (not cluttering default view)
- Progress bar during upload
- Green checkmark on completion
- Thumbnail preview after upload (click to open full image in new tab)
- On existing orders: each order card gets two small action buttons — "Upload design" and "Upload proof"

---

## Backend API Endpoints Used

All endpoints already exist. No new backend routes needed.

| Feature | Endpoint | Auth |
|---------|----------|------|
| Login | `POST /api/admin/login` | None (returns JWT) |
| Find client by phone | `GET /api/clients/search?phone=` | JWT |
| Client details + orders | `GET /api/clients/:id` | JWT |
| Order details | `GET /api/orders/:orderId` | JWT |
| Product catalog | `GET /api/client/products` | None |
| Create order | `POST /api/orders` | JWT |
| Upload design file | `POST /api/client/upload-file` | None |
| Upload payment proof | `POST /api/client/orders/:orderId/upload-proof` | None |
| Attach file to order item | `POST /api/orders/:orderId/items/:itemId/attachment` | JWT |

---

## File Structure

```
frontend/chrome-extension-whatsapp-crm/
  manifest.json
  background.js          # Service worker: auth, API calls
  content.js             # WhatsApp Web injection, phone detection, sidebar mount
  sidebar.html           # Sidebar template
  sidebar.css            # Sidebar styles (loaded inside Shadow DOM)
  sidebar.js             # Sidebar logic: rendering, events, templates, orders, uploads
  popup.html             # Login popup
  popup.js               # Login logic
  popup.css              # Login popup styles
  icons/
    icon-16.png
    icon-48.png
    icon-128.png
```

---

## Permissions (manifest.json)

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://web.whatsapp.com/*",
    "https://vt-souvenir-backend.onrender.com/*"
  ],
  "content_scripts": [{
    "matches": ["https://web.whatsapp.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

---

## Out of Scope (v1)

- Custom/editable templates (hardcoded for v1)
- Shipping label generation
- Order status updates from sidebar
- Analytics or dashboards
- Chrome Web Store publishing (sideloaded for now)
- Notification system for new orders

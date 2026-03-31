# Client Multiple Addresses Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow clients to save multiple shipping addresses, pick one when ordering or choosing a carrier, and manage (edit/delete) them from both `/pedidos` and `/seguimiento`.

**Architecture:** New `client_addresses` table with FK to `clients`. Both frontend pages show address cards with radio selection. Shipping routes accept an `addressId` parameter instead of reading from the `clients` table directly. Auto-label addresses as `"{Colonia}, {City}"`.

**Tech Stack:** PostgreSQL migration, Express routes, vanilla JS frontend (no framework)

---

### Task 1: Database Migration — `client_addresses` table

**Files:**
- Create: `backend/migrations/add-client-addresses.js`
- Modify: `backend/shared/run-migration.js` (add migration call ~line 90)
- Modify: `backend/api/server.js` (add startup migration call)

**Step 1: Create migration file**

```javascript
// backend/migrations/add-client-addresses.js
import { query } from '../shared/database.js';

export async function addClientAddresses() {
  console.log('🔄 Running client_addresses migration...');

  await query(`
    CREATE TABLE IF NOT EXISTS client_addresses (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      label VARCHAR(100),
      street VARCHAR(255),
      street_number VARCHAR(50),
      colonia VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      postal VARCHAR(20),
      reference_notes VARCHAR(35),
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_client_addresses_client_id ON client_addresses(client_id);
  `);

  // Migrate existing client addresses into the new table
  await query(`
    INSERT INTO client_addresses (client_id, label, street, street_number, colonia, city, state, postal, reference_notes, is_default)
    SELECT id,
           COALESCE(NULLIF(colonia, ''), city) || ', ' || COALESCE(state, ''),
           street, street_number, colonia, city, state,
           COALESCE(postal, postal_code), reference_notes, true
    FROM clients
    WHERE (postal IS NOT NULL OR postal_code IS NOT NULL)
      AND city IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM client_addresses ca WHERE ca.client_id = clients.id)
  `);

  // Add shipping_address_id to orders table
  await query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_id INTEGER REFERENCES client_addresses(id)
  `);

  console.log('✅ client_addresses migration complete');
}
```

**Step 2: Register migration in run-migration.js**

Add after the last `try/catch` block (~line 90):
```javascript
try {
  const { addClientAddresses } = await import('../migrations/add-client-addresses.js');
  await addClientAddresses();
} catch (e) {
  console.error('❌ Client Addresses migration failed:', e.message);
}
```

**Step 3: Add startup migration in server.js**

Find where other startup migrations run and add the same import+call pattern.

**Step 4: Commit**
```
feat: add client_addresses table with migration from existing data
```

---

### Task 2: Backend CRUD Routes for Client Addresses

**Files:**
- Modify: `backend/api/client-routes.js`

**Step 1: Add address CRUD endpoints**

```javascript
// GET /api/client/addresses — list addresses for a client (by phone+email)
router.get('/addresses', async (req, res) => {
  const { phone, email } = req.query;
  if (!phone || !email) return res.status(400).json({ error: 'phone and email required' });

  const client = await query(
    'SELECT id FROM clients WHERE phone = $1 AND email = $2 LIMIT 1',
    [phone, email]
  );
  if (client.rows.length === 0) return res.json({ addresses: [] });

  const addresses = await query(
    'SELECT * FROM client_addresses WHERE client_id = $1 ORDER BY is_default DESC, last_used_at DESC',
    [client.rows[0].id]
  );
  res.json({ addresses: addresses.rows });
});

// POST /api/client/addresses — create new address
router.post('/addresses', async (req, res) => {
  const { phone, email, street, streetNumber, colonia, city, state, postal, referenceNotes } = req.body;

  // Find or create client
  let clientResult = await query('SELECT id FROM clients WHERE phone = $1 AND email = $2 LIMIT 1', [phone, email]);
  if (clientResult.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
  const clientId = clientResult.rows[0].id;

  // Auto-label
  const label = [colonia || street, city].filter(Boolean).join(', ');

  // If first address, make it default
  const existingCount = await query('SELECT COUNT(*) as c FROM client_addresses WHERE client_id = $1', [clientId]);
  const isDefault = parseInt(existingCount.rows[0].c) === 0;

  const result = await query(`
    INSERT INTO client_addresses (client_id, label, street, street_number, colonia, city, state, postal, reference_notes, is_default)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [clientId, label, street, streetNumber, colonia, city, state, postal, referenceNotes, isDefault]);

  res.json({ success: true, address: result.rows[0] });
});

// PUT /api/client/addresses/:id — update address
router.put('/addresses/:id', async (req, res) => {
  const { id } = req.params;
  const { street, streetNumber, colonia, city, state, postal, referenceNotes } = req.body;
  const label = [colonia || street, city].filter(Boolean).join(', ');

  const result = await query(`
    UPDATE client_addresses SET street=$1, street_number=$2, colonia=$3, city=$4, state=$5, postal=$6, reference_notes=$7, label=$8
    WHERE id = $9 RETURNING *
  `, [street, streetNumber, colonia, city, state, postal, referenceNotes, label, id]);

  if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
  res.json({ success: true, address: result.rows[0] });
});

// DELETE /api/client/addresses/:id — delete address
router.delete('/addresses/:id', async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM client_addresses WHERE id = $1', [id]);
  res.json({ success: true });
});

// POST /api/client/addresses/:id/set-default — set as default
router.post('/addresses/:id/set-default', async (req, res) => {
  const { id } = req.params;
  const addr = await query('SELECT client_id FROM client_addresses WHERE id = $1', [id]);
  if (addr.rows.length === 0) return res.status(404).json({ error: 'Address not found' });

  const clientId = addr.rows[0].client_id;
  await query('UPDATE client_addresses SET is_default = false WHERE client_id = $1', [clientId]);
  await query('UPDATE client_addresses SET is_default = true, last_used_at = NOW() WHERE id = $1', [id]);
  res.json({ success: true });
});
```

**Step 2: Commit**
```
feat: add CRUD routes for client addresses
```

---

### Task 3: Update Shipping Routes to Use `client_addresses`

**Files:**
- Modify: `backend/api/shipping-routes.js` (lines 707-754, 878-903)

**Step 1: Update GET /orders/:orderId/quotes**

Change the query at line 707 to accept optional `?addressId=` query param. If provided, join on `client_addresses` instead of `clients` for the shipping address fields:

```javascript
// If addressId provided, use that address; otherwise fall back to order's shipping_address_id, then client default
let addressRow;
const addressId = req.query.addressId;

if (addressId) {
  const addrResult = await query('SELECT * FROM client_addresses WHERE id = $1', [addressId]);
  addressRow = addrResult.rows[0];
} else if (order.shipping_address_id) {
  const addrResult = await query('SELECT * FROM client_addresses WHERE id = $1', [order.shipping_address_id]);
  addressRow = addrResult.rows[0];
}

// Fall back to client table fields if no address record
const addr = addressRow || order;
const postal = addr.postal || order.postal || order.postal_code;

const destAddress = {
  name: order.client_name,
  phone: order.client_phone,
  email: order.client_email,
  street: addr.street,
  street_number: addr.street_number,
  colonia: addr.colonia,
  city: addr.city,
  state: addr.state,
  zip: postal,
  reference_notes: addr.reference_notes
};
```

**Step 2: Update POST /orders/:orderId/select-rate**

Same pattern — accept `addressId` in body, save it to `orders.shipping_address_id`, use that address for shipment creation.

**Step 3: Commit**
```
feat: shipping routes support addressId from client_addresses
```

---

### Task 4: Frontend — Address Cards Component (shared)

**Files:**
- Create: `frontend/shared/address-cards.js`

This is a reusable module used by both `/pedidos` and `/seguimiento`. It renders address cards, handles add/edit/delete, and emits the selected address ID.

**Key functions:**
- `renderAddressCards(container, addresses, selectedId, callbacks)` — renders card list with radio selection
- `showAddressForm(container, existingAddress, onSave)` — shows inline form for add/edit
- Each card shows: label (bold), full address, reference notes, edit/delete icons
- Selected card has pink border + checkmark
- "+ Nueva dirección" button at the bottom

**Step 1: Create the module**

```javascript
// frontend/shared/address-cards.js
// Renders address selection cards with add/edit/delete
// Usage: renderAddressCards(container, addresses, selectedId, { onSelect, onAdd, onEdit, onDelete })
```

Full implementation includes:
- Card HTML with radio button styling (pink border on selected)
- Edit button → inline form with postal code auto-fill
- Delete button → confirm dialog
- "Nueva dirección" CTA card
- Auto-label display: `"{Colonia}, {City}"` as card title, full address below

**Step 2: Commit**
```
feat: add shared address-cards component for address selection UI
```

---

### Task 5: Frontend — Integrate Address Cards into `/pedidos`

**Files:**
- Modify: `frontend/pedidos/index.html` (step-confirm section ~line 172)
- Modify: `frontend/pedidos/order-form.js` (populateConfirmationData ~line 980)

**Step 1: Add script import in index.html**
```html
<script src="/shared/address-cards.js" defer></script>
```

**Step 2: Update step-confirm section**

Add a `<div id="address-cards-container"></div>` below the client info display (name, phone, email) but replace the address display with the address cards.

**Step 3: Update populateConfirmationData()**

After showing name/phone/email, fetch addresses via `GET /api/client/addresses?phone=X&email=Y` and render them with `renderAddressCards()`. When user selects an address, store `state.client.selectedAddressId`. When they add/edit, call the CRUD endpoints.

**Step 4: Update order submission to include `selectedAddressId`**

Pass `shipping_address_id` in the order submit payload so it gets saved on the order.

**Step 5: Commit**
```
feat: address selection cards on /pedidos confirmation step
```

---

### Task 6: Frontend — Integrate Address Cards into `/seguimiento`

**Files:**
- Modify: `frontend/order-tracking/index.html` (screen-shipping section ~line 144)
- Modify: `frontend/order-tracking/tracking.js` (loadShippingQuotes ~line 670)

**Step 1: Add script import**
```html
<script src="/shared/address-cards.js" defer></script>
```

**Step 2: Add address selection step before carrier quotes**

In `screen-shipping`, add an address picker section above the rates container. Flow becomes:
1. Client clicks "Ver Opciones de Envio"
2. Show address cards (fetched via API)
3. Client picks an address (or adds new one)
4. Click "Continuar" → fetch carrier quotes with `?addressId=X`
5. Show carrier rates as before

**Step 3: Update loadShippingQuotes()**

Before fetching quotes, check if address is selected. Pass `addressId` to the quotes API. Update the shipping destination display with the selected address.

**Step 4: Commit**
```
feat: address selection on /seguimiento before carrier quotes
```

---

### Task 7: Update Client Info Endpoint to Return Addresses

**Files:**
- Modify: `backend/api/client-routes.js` (the `/client/info` POST endpoint)

**Step 1: Include addresses array in the client info response**

After fetching client info, also fetch their addresses:
```javascript
const addresses = await query(
  'SELECT * FROM client_addresses WHERE client_id = $1 ORDER BY is_default DESC, last_used_at DESC',
  [client.id]
);
// Add to response: clientInfo.addresses = addresses.rows
```

**Step 2: Commit**
```
feat: client info endpoint returns saved addresses
```

---

### Task 8: Deploy and Test

**Step 1: Commit all changes**
**Step 2: Push to main**
**Step 3: Deploy frontend to Vercel**
**Step 4: Wait for Render backend auto-deploy**
**Step 5: Test end-to-end:**
- New client on `/pedidos` → fills address → saved to `client_addresses`
- Returning client on `/pedidos` → sees address cards → can add second address
- Client on `/seguimiento` → picks address → carrier quotes use that address
- Edit/delete addresses work
- Orders get `shipping_address_id` saved

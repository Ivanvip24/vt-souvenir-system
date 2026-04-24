# Admin Quick-Entry Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the slow 2-step admin order creation modal with a single-screen, speed-optimized quick-entry panel that includes client phone autocomplete, product search, and a WhatsApp-ready summary copy feature.

**Architecture:** Modify the existing `create-order-modal` HTML and its JS functions in the admin dashboard. Add a `GET /api/clients/search` endpoint to `server.js` for phone autocomplete. Modify `createOrderBothSystems` to optionally skip Notion sync.

**Tech Stack:** Vanilla HTML/CSS/JS (matches existing admin dashboard), Express API endpoint, PostgreSQL queries.

---

### Task 1: Add Client Search API Endpoint

**Files:**
- Modify: `backend/api/server.js` (add new route near line ~400, after the existing orders routes)

**Step 1: Add the endpoint**

Add after the `POST /api/orders` route (around line 400 in server.js). Search for `app.post('/api/orders'` and add the new route after that block ends:

```javascript
// Quick-entry: search clients by phone for autocomplete
app.get('/api/clients/search', async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone || phone.length < 3) {
      return res.json({ success: true, clients: [] });
    }

    const result = await query(`
      SELECT id, name, phone, email, city, state, address
      FROM clients
      WHERE phone LIKE '%' || $1 || '%'
      ORDER BY updated_at DESC
      LIMIT 5
    `, [phone]);

    res.json({ success: true, clients: result.rows });
  } catch (error) {
    console.error('Error searching clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Step 2: Test the endpoint**

```bash
curl "http://localhost:3000/api/clients/search?phone=555"
```
Expected: `{ success: true, clients: [...] }` (may be empty array if no clients match)

**Step 3: Commit**

```bash
git add backend/api/server.js
git commit -m "feat: add GET /api/clients/search endpoint for phone autocomplete"
```

---

### Task 2: Add skipNotion Flag to createOrderBothSystems

**Files:**
- Modify: `backend/agents/notion-agent/sync.js:265-400`

**Step 1: Add skipNotion parameter**

In `sync.js`, modify the `createOrderBothSystems` function signature and the Notion sync section:

At line 265, change:
```javascript
export async function createOrderBothSystems(orderData) {
```
To:
```javascript
export async function createOrderBothSystems(orderData, { skipNotion = false } = {}) {
```

At lines 380-381, wrap the Notion sync in a conditional:
```javascript
    // 5. Sync to Notion (unless explicitly skipped)
    let syncResult = { notionPageId: null, notionPageUrl: null };
    if (!skipNotion) {
      syncResult = await syncOrderToNotion(orderId);
    }
```

**Step 2: Test that existing calls still work**

Existing callers pass no second argument, so `skipNotion` defaults to `false` - no behavior change. Verify the module loads:

```bash
node -e "import('./backend/agents/notion-agent/sync.js').then(m => console.log('OK:', typeof m.createOrderBothSystems))"
```
Expected: `OK: function`

**Step 3: Commit**

```bash
git add backend/agents/notion-agent/sync.js
git commit -m "feat: add skipNotion option to createOrderBothSystems"
```

---

### Task 3: Add Admin Quick-Order API Route

**Files:**
- Modify: `backend/api/server.js` (add route near the `/api/clients/search` route from Task 1)

**Step 1: Add the quick-order endpoint**

Add right after the `/api/clients/search` route:

```javascript
// Quick-entry: create order (DB only, no Notion)
app.post('/api/orders/quick', async (req, res) => {
  try {
    const result = await notionSync.createOrderBothSystems(req.body, { skipNotion: true });

    // Set deposit_amount and approval_status if provided
    if (req.body.depositAmount || req.body.status) {
      const updates = [];
      const params = [];
      let paramIdx = 1;

      if (req.body.depositAmount) {
        updates.push(`deposit_amount = $${paramIdx++}`);
        params.push(req.body.depositAmount);
      }
      if (req.body.status) {
        updates.push(`approval_status = $${paramIdx++}`);
        params.push(req.body.status);
      }

      params.push(result.orderId);
      await query(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params
      );
    }

    // Fetch the created order number for the response
    const orderRow = await query('SELECT order_number FROM orders WHERE id = $1', [result.orderId]);

    res.status(201).json({
      success: true,
      data: {
        orderId: result.orderId,
        orderNumber: orderRow.rows[0]?.order_number || result.orderNumber
      }
    });
  } catch (error) {
    console.error('Error creating quick order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Step 2: Verify server starts**

```bash
npm run dev
```

**Step 3: Commit**

```bash
git add backend/api/server.js
git commit -m "feat: add POST /api/orders/quick endpoint (DB only, no Notion)"
```

---

### Task 4: Replace Create Order Modal HTML

**Files:**
- Modify: `frontend/admin-dashboard/index.html:540-619` (replace entire create-order-modal)

**Step 1: Replace the modal HTML**

Replace lines 540-619 (the entire `<!-- Create Order Modal -->` block including the backdrop) with the new single-screen quick-entry panel. The new HTML uses the same modal pattern but removes the step indicator and combines everything into one screen. Key sections:

1. **Client section** - phone input with autocomplete dropdown, name/email/city/state fields
2. **Products section** - search input + product list (reuses `create-order-products-list` container ID)
3. **Total/deposit display** - reuses `create-order-total` ID + adds `quick-order-deposit`
4. **Optional details** - collapsible `<details>` element with event type, date, shipping, notes
5. **Submit buttons** - "Crear Pedido" and "Crear y Copiar Resumen"

See the design doc at `docs/plans/2026-03-09-admin-quick-entry-design.md` for the wireframe.

HTML element IDs used:
- `quick-order-phone` - phone input with autocomplete
- `client-autocomplete-dropdown` - dropdown results container
- `quick-order-name`, `quick-order-email`, `quick-order-city`, `quick-order-state` - client fields
- `quick-order-product-search` - product filter input
- `create-order-products-list` - product cards container (same ID as before)
- `create-order-total` - total display (same ID as before)
- `quick-order-deposit` - deposit amount display
- `quick-order-event-type`, `quick-order-event-date` - optional event fields
- `quick-order-shipping`, `quick-order-address-section`, `quick-order-address` - shipping toggle
- `quick-order-notes` - notes textarea
- `quick-order-submit`, `quick-order-submit-copy` - action buttons

**Step 2: Verify the HTML renders**

Open admin dashboard, click "Crear Nuevo Pedido" - should show single-screen layout.

**Step 3: Commit**

```bash
git add frontend/admin-dashboard/index.html
git commit -m "feat: replace 2-step order modal with single-screen quick-entry panel"
```

---

### Task 5: Replace Create Order JavaScript Functions

**Files:**
- Modify: `frontend/admin-dashboard/dashboard.js:3930-4255` (replace all create-order JS functions)

**Step 1: Replace the state and all functions**

Replace the block from line 3930 (`let createOrderState`) through line 4255 (`window.submitNewOrder = submitNewOrder;`) with the new quick-entry code.

Functions to REMOVE (replaced):
- `createOrderNextStep` (line 4122)
- `createOrderPrevStep` (line 4148)
- `submitNewOrder` (line 4157)
- `updateCreateOrderStep` (line 4093)

Functions to ADD:
- `searchClientByPhone(phone)` - debounced phone search with autocomplete dropdown
- `selectClient(id, name, phone, email, city, state, address)` - fill form from autocomplete
- `toggleShippingAddress()` - show/hide address fields
- `filterQuickOrderProducts(searchTerm)` - filter product list by name
- `submitQuickOrder(copyToClipboard)` - create order + optionally copy WhatsApp summary

Functions to KEEP (modified):
- `openCreateOrderModal()` - reset new field IDs instead of old ones
- `closeCreateOrderModal()` - same
- `loadProductsForCreateOrder()` - store `allProducts` copy for search filtering
- `renderProductsForCreateOrder()` - add -10/+10 buttons, compact layout
- `updateCreateOrderQuantity()` - same
- `setCreateOrderQuantity()` - same
- `updateCreateOrderTotal()` - also update deposit display

New window exports:
```javascript
window.searchClientByPhone = searchClientByPhone;
window.selectClient = selectClient;
window.toggleShippingAddress = toggleShippingAddress;
window.filterQuickOrderProducts = filterQuickOrderProducts;
window.submitQuickOrder = submitQuickOrder;
```

Remove old window exports:
```javascript
// REMOVE these:
window.createOrderNextStep = ...;
window.createOrderPrevStep = ...;
window.submitNewOrder = ...;
```

**Step 2: Verify old functions are gone**

```bash
grep -n "createOrderNextStep\|createOrderPrevStep\|submitNewOrder\|updateCreateOrderStep" frontend/admin-dashboard/dashboard.js
```
Expected: No matches.

**Step 3: Commit**

```bash
git add frontend/admin-dashboard/dashboard.js
git commit -m "feat: replace 2-step order JS with single-screen quick-entry logic"
```

---

### Task 6: End-to-End Testing

**Files:** None (testing only)

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Test client search API**

```bash
curl "http://localhost:3000/api/clients/search?phone=55"
```
Expected: JSON with client list or empty array.

**Step 3: Test quick order API**

```bash
curl -X POST http://localhost:3000/api/orders/quick \
  -H "Content-Type: application/json" \
  -d '{"clientName":"Test","clientPhone":"5500000000","items":[{"productId":1,"productName":"Test","quantity":50,"unitPrice":8,"unitCost":2}],"totalPrice":400,"productionCost":100,"status":"pending_review","depositAmount":200,"createdBy":"admin"}'
```
Expected: `{ success: true, data: { orderId: ..., orderNumber: ... } }`

**Step 4: Test in browser**

1. Open admin dashboard
2. Click "Crear Nuevo Pedido"
3. Verify single-screen layout appears (no step indicator)
4. Type a phone number (3+ digits) - verify autocomplete dropdown appears
5. Select a client - verify auto-fill of name, email, city, state
6. Type in product search - verify filtering works
7. Set quantity with +1, +10, -10, direct input - verify total + deposit update
8. Click "Crear y Copiar Resumen" - verify order created + text copied to clipboard
9. Paste clipboard content - verify WhatsApp summary format

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: polish quick-entry panel after testing"
```

---

### Summary

| Task | What | Files | Est. |
|------|------|-------|------|
| 1 | Client search API | server.js | 5 min |
| 2 | skipNotion flag | sync.js | 5 min |
| 3 | Quick order API route | server.js | 5 min |
| 4 | New modal HTML | index.html | 10 min |
| 5 | New modal JavaScript | dashboard.js | 15 min |
| 6 | End-to-end testing | - | 10 min |

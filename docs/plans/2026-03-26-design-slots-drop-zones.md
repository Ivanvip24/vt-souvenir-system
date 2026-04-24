# Design Slots Drop Zones — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform D1/D2 design strip pills into interactive image drop zones with red→green state, +/- slot controls, and a "Generate Order" button that runs `generate_axkan.py`.

**Architecture:** Add `design_image_url` column to `design_assignments`. New API endpoints handle slot image upload, add/remove slots, and order generation. Frontend `renderDesignStrip()` becomes a drop-zone strip with drag/drop/click/paste interactions.

**Tech Stack:** Express, PostgreSQL, Cloudinary (existing), multer (existing), child_process (for Python script)

---

### Task 1: Database Migration — Add `design_image_url` Column

**Files:**
- Create: `backend/migrations/add-design-image-url.js`
- Modify: `backend/migrations/run-migrations.js` (add migration call)

**Step 1: Create migration file**

```javascript
// backend/migrations/add-design-image-url.js
import { query } from '../shared/database.js';

export async function addDesignImageUrl() {
  console.log('Adding design_image_url column to design_assignments...');

  await query(`
    ALTER TABLE design_assignments
    ADD COLUMN IF NOT EXISTS design_image_url TEXT
  `);

  console.log('Migration complete: design_image_url column added');
}
```

**Step 2: Add migration to run-migrations.js**

Find the last migration import/call in `backend/migrations/run-migrations.js` and add:

```javascript
import { addDesignImageUrl } from './add-design-image-url.js';
// ... inside the run function, after last migration:
await addDesignImageUrl();
```

**Step 3: Run migration**

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan_brain_system
node backend/migrations/add-design-image-url.js
```

**Step 4: Commit**

```bash
git add backend/migrations/add-design-image-url.js backend/migrations/run-migrations.js
git commit -m "feat: add design_image_url column to design_assignments"
```

---

### Task 2: Backend — Image Upload to Slot Endpoint

**Files:**
- Modify: `backend/api/design-portal-routes.js`

**Step 1: Add `PUT /designs/:id/image` endpoint**

Add after the existing `PUT /designs/:id/status` route (around line 430). This endpoint receives a file upload, sends it to Cloudinary, and saves the URL to the `design_image_url` column.

```javascript
// Upload design image to a slot
router.put('/designs/:id/image', employeeAuth, upload.single('file'), async (req, res) => {
  try {
    const designId = req.params.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Verify this design exists and belongs to this employee (or is manager)
    const check = await query(
      `SELECT id, order_id, design_number, assigned_to FROM design_assignments WHERE id = $1`,
      [designId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Design assignment not found' });
    }

    const design = check.rows[0];
    const isManager = req.employee.role === 'manager' || req.employee.role === 'admin';
    if (!isManager && design.assigned_to !== req.employee.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Upload to Cloudinary
    const b64 = file.buffer.toString('base64');
    const dataUri = `data:${file.mimetype};base64,${b64}`;
    const folder = `design-portal/order-${design.order_id}/slots`;
    const publicId = `D${design.design_number}_${Date.now()}`;

    const uploadResult = await uploadImage(dataUri, folder, publicId);
    const imageUrl = uploadResult.url || uploadResult.secure_url;

    // Save URL to design_assignments
    await query(
      `UPDATE design_assignments SET design_image_url = $1, status = 'aprobado', updated_at = NOW() WHERE id = $2`,
      [imageUrl, designId]
    );

    res.json({ success: true, imageUrl, designId: Number(designId) });
  } catch (error) {
    console.error('Error uploading design image:', error);
    res.status(500).json({ error: 'Failed to upload design image' });
  }
});
```

**Step 2: Update `GET /my-designs` to include `design_image_url`**

Find the SELECT query in the `/my-designs` endpoint (around line 53-99). Add `da.design_image_url` to the SELECT columns list.

**Step 3: Commit**

```bash
git add backend/api/design-portal-routes.js
git commit -m "feat: add PUT /designs/:id/image endpoint for slot uploads"
```

---

### Task 3: Backend — Add/Remove Slot Endpoints

**Files:**
- Modify: `backend/api/design-portal-routes.js`

**Step 1: Add `POST /orders/:orderId/add-slot` endpoint**

```javascript
// Add a design slot to an order
router.post('/orders/:orderId/add-slot', employeeAuth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Get current max design_number and info from existing slots
    const existing = await query(
      `SELECT design_number, total_designs, assigned_to, assigned_by, client_phone, client_name, order_item_id
       FROM design_assignments WHERE order_id = $1 ORDER BY design_number DESC LIMIT 1`,
      [orderId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'No existing design assignments for this order' });
    }

    const last = existing.rows[0];
    const newDesignNumber = last.design_number + 1;
    const newTotalDesigns = last.total_designs + 1;

    // Create new slot
    const result = await query(
      `INSERT INTO design_assignments
        (order_id, order_item_id, design_number, total_designs, assigned_to, assigned_by, client_phone, client_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, design_number`,
      [orderId, last.order_item_id, newDesignNumber, newTotalDesigns,
       last.assigned_to, last.assigned_by || req.employee.id, last.client_phone, last.client_name]
    );

    // Update total_designs on all sibling slots
    await query(
      `UPDATE design_assignments SET total_designs = $1 WHERE order_id = $2`,
      [newTotalDesigns, orderId]
    );

    res.json({
      success: true,
      design: {
        id: result.rows[0].id,
        design_number: result.rows[0].design_number,
        label: 'D' + result.rows[0].design_number,
        status: 'pendiente',
        total_designs: newTotalDesigns
      }
    });
  } catch (error) {
    console.error('Error adding design slot:', error);
    res.status(500).json({ error: 'Failed to add design slot' });
  }
});
```

**Step 2: Add `DELETE /orders/:orderId/remove-slot` endpoint**

```javascript
// Remove the last empty design slot from an order
router.delete('/orders/:orderId/remove-slot', employeeAuth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Get the last slot
    const last = await query(
      `SELECT id, design_number, design_image_url, total_designs
       FROM design_assignments WHERE order_id = $1 ORDER BY design_number DESC LIMIT 1`,
      [orderId]
    );

    if (last.rows.length === 0) {
      return res.status(404).json({ error: 'No design slots found' });
    }

    const slot = last.rows[0];

    // Safety: don't remove if it has an image
    if (slot.design_image_url) {
      return res.status(400).json({ error: 'Cannot remove a slot that has an image uploaded' });
    }

    // Safety: don't remove if it's the only slot
    if (slot.total_designs <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last remaining slot' });
    }

    // Delete the slot
    await query(`DELETE FROM design_assignments WHERE id = $1`, [slot.id]);

    // Update total_designs on remaining slots
    const newTotal = slot.total_designs - 1;
    await query(
      `UPDATE design_assignments SET total_designs = $1 WHERE order_id = $2`,
      [newTotal, orderId]
    );

    res.json({ success: true, removedDesignNumber: slot.design_number, newTotal });
  } catch (error) {
    console.error('Error removing design slot:', error);
    res.status(500).json({ error: 'Failed to remove design slot' });
  }
});
```

**Step 3: Commit**

```bash
git add backend/api/design-portal-routes.js
git commit -m "feat: add/remove design slot endpoints"
```

---

### Task 4: Backend — Generate Order Endpoint

**Files:**
- Modify: `backend/api/design-portal-routes.js`

**Step 1: Add import for child_process at top of file**

```javascript
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
```

**Step 2: Add `POST /generate-order` endpoint**

```javascript
// Generate order — spawns Python script with design data
router.post('/generate-order', employeeAuth, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    // Gather all design slots with images
    const designs = await query(
      `SELECT da.id, da.design_number, da.design_image_url, da.status,
              da.client_name, da.client_phone
       FROM design_assignments da
       WHERE da.order_id = $1
       ORDER BY da.design_number ASC`,
      [orderId]
    );

    if (designs.rows.length === 0) {
      return res.status(404).json({ error: 'No designs found for this order' });
    }

    // Check all slots have images
    const emptySlots = designs.rows.filter(d => !d.design_image_url);
    if (emptySlots.length > 0) {
      return res.status(400).json({
        error: 'Not all design slots have images',
        emptySlots: emptySlots.map(s => 'D' + s.design_number)
      });
    }

    // Get order info
    const orderResult = await query(
      `SELECT id, order_number, client_name FROM orders WHERE id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0] || {};

    // Build payload for Python script
    const payload = {
      order_id: orderId,
      order_number: order.order_number || '',
      client_name: order.client_name || designs.rows[0].client_name || '',
      designs: designs.rows.map(d => ({
        slot: 'D' + d.design_number,
        image_url: d.design_image_url
      }))
    };

    // Write temp JSON file
    const tmpFile = path.join(os.tmpdir(), `axkan-order-${orderId}-${Date.now()}.json`);
    await writeFile(tmpFile, JSON.stringify(payload, null, 2));

    // Spawn Python script
    const pythonPath = '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3';
    const scriptPath = '/Users/ivanvalenciaperez/Desktop/CLAUDE/READY/ORDERS_GENERATOR/generate_axkan.py';
    const scriptDir = '/Users/ivanvalenciaperez/Desktop/CLAUDE/READY/ORDERS_GENERATOR';

    execFile(pythonPath, [scriptPath, tmpFile], { cwd: scriptDir, timeout: 120000 }, async (error, stdout, stderr) => {
      // Cleanup temp file
      try { await unlink(tmpFile); } catch (e) { /* ignore */ }

      if (error) {
        console.error('Python script error:', error.message);
        console.error('stderr:', stderr);
        return res.status(500).json({ error: 'Order generation failed', details: stderr || error.message });
      }

      console.log('Python script output:', stdout);
      res.json({ success: true, output: stdout });
    });

  } catch (error) {
    console.error('Error generating order:', error);
    res.status(500).json({ error: 'Failed to generate order' });
  }
});
```

**Step 3: Commit**

```bash
git add backend/api/design-portal-routes.js
git commit -m "feat: add generate-order endpoint that spawns Python script"
```

---

### Task 5: Frontend — Design Strip Drop Zones CSS

**Files:**
- Modify: `frontend/employee-dashboard/designs.html`

**Step 1: Add new CSS for drop-zone pills, +/- buttons, and generate button**

Add these styles inside the `<style>` tag, after the existing `.strip-pill` styles (around line 479):

```css
/* ======== DROP ZONE PILLS ======== */
.strip-pill.drop-zone {
  position: relative;
  min-width: 44px;
  min-height: 36px;
  border: 2px dashed #e52421;
  background: rgba(229, 36, 33, 0.08);
  color: #e52421;
  cursor: pointer;
  transition: all 0.3s ease;
}

.strip-pill.drop-zone.has-image {
  border: 2px solid #8ab73b;
  background: rgba(138, 183, 59, 0.12);
  color: #8ab73b;
  box-shadow: 0 0 8px rgba(138, 183, 59, 0.4);
  padding: 2px;
}

.strip-pill.drop-zone.dragover {
  border-color: #e72a88;
  background: rgba(231, 42, 136, 0.1);
  box-shadow: 0 0 12px rgba(231, 42, 136, 0.3);
  animation: pulse-border 1s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 8px rgba(231, 42, 136, 0.2); }
  50% { box-shadow: 0 0 16px rgba(231, 42, 136, 0.5); }
}

.strip-pill .slot-thumb {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
}

.strip-pill .slot-check {
  font-size: 10px;
}

.strip-pill .slot-label {
  font-size: 10px;
  font-weight: 700;
}

/* Hidden file input for slot clicks */
.slot-file-input {
  display: none;
}

/* ======== +/- SLOT CONTROLS ======== */
.slot-control-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid #d1d5db;
  background: #fff;
  color: #6b7280;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1;
}

.slot-control-btn:hover {
  border-color: #e72a88;
  color: #e72a88;
  background: rgba(231, 42, 136, 0.05);
}

.slot-control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ======== GENERATE ORDER BUTTON ======== */
.btn-generate-order {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 8px;
  border: none;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  background: #d1d5db;
  color: #9ca3af;
  pointer-events: none;
}

.btn-generate-order.ready {
  background: #e72a88;
  color: #fff;
  pointer-events: auto;
  box-shadow: 0 0 12px rgba(231, 42, 136, 0.4);
  animation: glow-ready 2s ease-in-out infinite;
}

@keyframes glow-ready {
  0%, 100% { box-shadow: 0 0 8px rgba(231, 42, 136, 0.3); }
  50% { box-shadow: 0 0 20px rgba(231, 42, 136, 0.6); }
}

.btn-generate-order.ready:hover {
  background: #d1217a;
  transform: scale(1.03);
}

.btn-generate-order.loading {
  pointer-events: none;
  opacity: 0.7;
}

.btn-generate-order .gen-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**Step 2: Replace the specs button area in the HTML to include generate button**

Find the `.chat-header-actions` div and add the generate button alongside the specs button:

```html
<div class="chat-header-actions">
  <button class="btn-generate-order" id="btn-generate-order" title="Generar Pedido">
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
    <span id="generate-label">Generar</span>
  </button>
  <button class="btn-icon" id="btn-specs" title="Especificaciones">
    <!-- existing SVG -->
  </button>
</div>
```

**Step 3: Commit**

```bash
git add frontend/employee-dashboard/designs.html
git commit -m "feat: add CSS for drop-zone pills, slot controls, and generate button"
```

---

### Task 6: Frontend — Rewrite `renderDesignStrip()` as Drop Zones

**Files:**
- Modify: `frontend/employee-dashboard/designs.js`

**Step 1: Add state for slot images**

Add to the `state` object at the top (line 17-31):

```javascript
slotImages: {}  // { designId: imageUrl }
```

**Step 2: Update `groupDesignsByOrder()` to capture `design_image_url`**

In the `state.orders[oid].designs.push({...})` block (line 345-355), add:

```javascript
design_image_url: d.design_image_url || null,
```

And after pushing, if there's an image URL, save it to state:

```javascript
if (d.design_image_url) {
  state.slotImages[d.id || d.design_id] = d.design_image_url;
}
```

**Step 3: Rewrite `renderDesignStrip()` (replace lines 513-534)**

```javascript
function renderDesignStrip(order) {
  var container = document.getElementById('chat-design-strip');
  container.textContent = '';

  order.designs.forEach(function(d, i) {
    var label = d.label || ('D' + (i + 1));
    var hasImage = !!(d.design_image_url || state.slotImages[d.id]);
    var imgUrl = d.design_image_url || state.slotImages[d.id] || null;

    var pill = createEl('span', 'strip-pill drop-zone' + (hasImage ? ' has-image' : ''));
    pill.dataset.designId = d.id;
    pill.dataset.status = d.status;

    if (hasImage) {
      var thumb = document.createElement('img');
      thumb.className = 'slot-thumb';
      thumb.src = imgUrl;
      thumb.alt = label;
      pill.appendChild(thumb);
      pill.appendChild(createEl('span', 'slot-check', '\u2705'));
      pill.appendChild(createEl('span', 'slot-label', label));
    } else {
      pill.textContent = label;
    }

    // Click to upload
    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', function() {
        if (input.files[0]) uploadDesignToSlot(d.id, input.files[0]);
      });
      input.click();
    });

    // Drag and drop
    pill.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      pill.classList.add('dragover');
    });
    pill.addEventListener('dragleave', function(e) {
      e.preventDefault();
      pill.classList.remove('dragover');
    });
    pill.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      pill.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        uploadDesignToSlot(d.id, e.dataTransfer.files[0]);
      }
    });

    container.appendChild(pill);
  });

  // + button
  var addBtn = createEl('button', 'slot-control-btn', '+');
  addBtn.title = 'Agregar diseno';
  addBtn.addEventListener('click', function() { addDesignSlot(order.order_id); });
  container.appendChild(addBtn);

  // - button
  var removeBtn = createEl('button', 'slot-control-btn', '\u2212');
  removeBtn.title = 'Quitar ultimo diseno';
  var lastDesign = order.designs[order.designs.length - 1];
  if (order.designs.length <= 1 || (lastDesign && (lastDesign.design_image_url || state.slotImages[lastDesign.id]))) {
    removeBtn.disabled = true;
  }
  removeBtn.addEventListener('click', function() { removeDesignSlot(order.order_id); });
  container.appendChild(removeBtn);

  // Update generate button state
  updateGenerateButton(order);
}
```

**Step 4: Commit**

```bash
git add frontend/employee-dashboard/designs.js
git commit -m "feat: renderDesignStrip as interactive drop zones with +/- controls"
```

---

### Task 7: Frontend — Upload, Add/Remove Slot, Generate, and Paste Functions

**Files:**
- Modify: `frontend/employee-dashboard/designs.js`

**Step 1: Add `uploadDesignToSlot()` function**

```javascript
async function uploadDesignToSlot(designId, file) {
  if (!file.type.startsWith('image/')) {
    alert('Solo se permiten imagenes');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('Archivo muy grande. Maximo 10MB.');
    return;
  }

  // Optimistic UI — show local preview immediately
  var reader = new FileReader();
  reader.onload = function(ev) {
    state.slotImages[designId] = ev.target.result;
    var order = state.orders[state.currentOrderId];
    if (order) renderDesignStrip(order);
  };
  reader.readAsDataURL(file);

  try {
    var formData = new FormData();
    formData.append('file', file);

    var response = await fetch(API_BASE + '/design-portal/designs/' + designId + '/image', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + state.token },
      body: formData
    });

    if (!response.ok) throw new Error('Upload failed');

    var data = await response.json();

    // Update with real Cloudinary URL
    state.slotImages[designId] = data.imageUrl;
    var order = state.orders[state.currentOrderId];
    if (order) {
      var d = order.designs.find(function(des) { return des.id == designId; });
      if (d) {
        d.design_image_url = data.imageUrl;
        d.status = 'aprobado';
      }
      renderDesignStrip(order);
      renderOrderList();
    }

  } catch (error) {
    console.error('Error uploading design to slot:', error);
    alert('Error al subir diseno. Intenta de nuevo.');
    delete state.slotImages[designId];
    var order = state.orders[state.currentOrderId];
    if (order) renderDesignStrip(order);
  }
}
```

**Step 2: Add `addDesignSlot()` and `removeDesignSlot()`**

```javascript
async function addDesignSlot(orderId) {
  try {
    var response = await fetch(API_BASE + '/design-portal/orders/' + orderId + '/add-slot', {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      var err = await response.json();
      throw new Error(err.error || 'Failed to add slot');
    }

    var data = await response.json();
    var order = state.orders[orderId];
    if (order && data.design) {
      order.designs.push({
        id: data.design.id,
        label: data.design.label,
        status: data.design.status,
        design_image_url: null
      });
      renderDesignStrip(order);
      renderOrderList();
    }
  } catch (error) {
    console.error('Error adding design slot:', error);
    alert('Error al agregar diseno');
  }
}

async function removeDesignSlot(orderId) {
  try {
    var response = await fetch(API_BASE + '/design-portal/orders/' + orderId + '/remove-slot', {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      var err = await response.json();
      throw new Error(err.error || 'Failed to remove slot');
    }

    var order = state.orders[orderId];
    if (order) {
      order.designs.pop();
      renderDesignStrip(order);
      renderOrderList();
    }
  } catch (error) {
    console.error('Error removing design slot:', error);
    alert('Error al quitar diseno');
  }
}
```

**Step 3: Add `updateGenerateButton()` and `generateOrder()`**

```javascript
function updateGenerateButton(order) {
  var btn = document.getElementById('btn-generate-order');
  if (!btn) return;

  var allFilled = order.designs.length > 0 && order.designs.every(function(d) {
    return d.design_image_url || state.slotImages[d.id];
  });

  btn.classList.toggle('ready', allFilled);
  if (allFilled) {
    btn.onclick = function() { generateOrder(order.order_id); };
  } else {
    btn.onclick = null;
  }
}

async function generateOrder(orderId) {
  var btn = document.getElementById('btn-generate-order');
  var label = document.getElementById('generate-label');
  if (!btn || btn.classList.contains('loading')) return;

  btn.classList.add('loading');
  label.textContent = '';
  var spinner = createEl('span', 'gen-spinner');
  label.parentNode.insertBefore(spinner, label);

  try {
    var response = await fetch(API_BASE + '/design-portal/generate-order', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ orderId: orderId })
    });

    if (!response.ok) {
      var err = await response.json();
      throw new Error(err.error || 'Generation failed');
    }

    var data = await response.json();
    alert('Pedido generado exitosamente!');
    console.log('Generate order output:', data.output);

  } catch (error) {
    console.error('Error generating order:', error);
    alert('Error al generar pedido: ' + error.message);
  } finally {
    btn.classList.remove('loading');
    if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
    label.textContent = 'Generar';
  }
}
```

**Step 4: Add paste handler in `setupUI()` (after the existing drag-drop handlers)**

```javascript
// Paste image to selected design slot
document.addEventListener('paste', function(e) {
  if (!state.currentOrderId) return;
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      var file = items[i].getAsFile();
      // Find the selected design slot, or first empty one
      var order = state.orders[state.currentOrderId];
      if (!order) return;
      var targetDesign = null;
      if (state.currentDesignId) {
        targetDesign = order.designs.find(function(d) { return d.id == state.currentDesignId; });
      }
      if (!targetDesign) {
        targetDesign = order.designs.find(function(d) {
          return !d.design_image_url && !state.slotImages[d.id];
        });
      }
      if (targetDesign) {
        uploadDesignToSlot(targetDesign.id, file);
      } else {
        alert('Todos los slots ya tienen imagen');
      }
      break;
    }
  }
});
```

**Step 5: Commit**

```bash
git add frontend/employee-dashboard/designs.js
git commit -m "feat: upload, add/remove slot, generate order, and paste handlers"
```

---

### Task 8: Update Design Pills in Order List (Left Panel)

**Files:**
- Modify: `frontend/employee-dashboard/designs.js`

**Step 1: Update the pills rendering in `renderOrderList()`**

In the design pills loop (around line 444-451), update the pill color to reflect image status:

```javascript
// Design pills
var pills = createEl('div', 'order-pills');
o.designs.forEach(function(d, i) {
  var pill = createEl('span', 'design-pill', d.label || ('D' + (i + 1)));
  var hasImage = !!(d.design_image_url || state.slotImages[d.id]);
  pill.dataset.status = hasImage ? 'aprobado' : d.status;
  pills.appendChild(pill);
});
item.appendChild(pills);
```

**Step 2: Commit**

```bash
git add frontend/employee-dashboard/designs.js
git commit -m "feat: left panel pills reflect image upload status"
```

---

### Task 9: Integration Testing

**Step 1: Deploy backend changes and run migration**

```bash
# Run migration against production DB
node backend/migrations/add-design-image-url.js

# Test endpoints with curl
# Upload image to slot
curl -X PUT http://localhost:3000/api/design-portal/designs/1/image \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@test-image.png"

# Add slot
curl -X POST http://localhost:3000/api/design-portal/orders/1/add-slot \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"

# Remove slot
curl -X DELETE http://localhost:3000/api/design-portal/orders/1/remove-slot \
  -H "Authorization: Bearer TOKEN"
```

**Step 2: Test in browser**

1. Open designer portal, select an order
2. Drag an image onto D1 pill — verify red→green transition
3. Click D2 pill — verify file picker opens, upload turns green
4. Paste image (Ctrl+V) — verify it fills next empty slot
5. Click + button — verify D3 appears
6. Click - button — verify last empty slot removed
7. Fill all slots — verify "Generar" button lights up rosa mexicano
8. Click "Generar" — verify Python script runs

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: design slots as interactive drop zones with generate order"
```

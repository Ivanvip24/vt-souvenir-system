# Designer Portal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a WhatsApp-bridged designer portal where Sarahi/Majo chat directly with clients about designs, without seeing prices or unrelated order info.

**Architecture:** New `design_assignments` and `design_messages` tables. New API route file `design-portal-routes.js`. New frontend page `frontend/employee-dashboard/designs.html` + `designs.js`. WhatsApp bot routes client replies to designer portal via polling. Designer messages go to client via bot with name prefix.

**Tech Stack:** Express API, PostgreSQL, existing JWT employee auth, existing WhatsApp bot infrastructure, vanilla JS frontend (matching employee-dashboard pattern).

---

### Task 1: Database Migration — New Tables

**Files:**
- Create: `backend/migrations/add-design-portal.js`
- Modify: `backend/migrations/run-migration.js` (add call to new migration)

**Step 1: Create migration file**

```javascript
// backend/migrations/add-design-portal.js
import { query } from '../shared/database.js';

export async function migrate() {
  console.log('Creating design portal tables...');

  // Design assignments — links designer to specific design in an order
  await query(`
    CREATE TABLE IF NOT EXISTS design_assignments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id),
      order_item_id INTEGER REFERENCES order_items(id),
      design_number INTEGER NOT NULL,
      total_designs INTEGER NOT NULL,
      assigned_to INTEGER REFERENCES employees(id),
      assigned_by INTEGER REFERENCES employees(id),
      status VARCHAR(20) DEFAULT 'pendiente'
        CHECK (status IN ('pendiente','en_progreso','en_revision','cambios','aprobado')),
      specs JSONB DEFAULT '{}',
      client_phone VARCHAR(20),
      client_name VARCHAR(100),
      due_date TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Design messages — bridged chat between designer and client
  await query(`
    CREATE TABLE IF NOT EXISTS design_messages (
      id SERIAL PRIMARY KEY,
      design_assignment_id INTEGER REFERENCES design_assignments(id),
      order_id INTEGER REFERENCES orders(id),
      sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('designer','client')),
      sender_id INTEGER,
      sender_name VARCHAR(100),
      message_type VARCHAR(10) DEFAULT 'text' CHECK (message_type IN ('text','image','file')),
      content TEXT,
      wa_message_id VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_design_assignments_assigned_to ON design_assignments(assigned_to)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_design_assignments_status ON design_assignments(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_design_assignments_client_phone ON design_assignments(client_phone)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_design_messages_order_id ON design_messages(order_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_design_messages_assignment_id ON design_messages(design_assignment_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_design_messages_created ON design_messages(created_at)`);

  console.log('✅ Design portal tables created');
}
```

**Step 2: Add migration call to run-migration.js**

Add after existing migration calls:
```javascript
import { migrate as addDesignPortal } from './add-design-portal.js';
// ... at bottom:
await addDesignPortal();
```

**Step 3: Run migration**

```bash
cd backend && node migrations/run-migration.js
```

**Step 4: Commit**
```bash
git add backend/migrations/add-design-portal.js backend/migrations/run-migration.js
git commit -m "feat: add design_assignments and design_messages tables"
```

---

### Task 2: Backend API — Design Portal Routes

**Files:**
- Create: `backend/api/design-portal-routes.js`
- Modify: `backend/api/server.js` (register new routes)

**Step 1: Create the route file**

```javascript
// backend/api/design-portal-routes.js
import { Router } from 'express';
import { query } from '../shared/database.js';
import { employeeAuth, requireRole, requireDepartment } from './middleware/employee-auth.js';

const router = Router();

// All routes require employee auth
router.use(employeeAuth);

// ============================================
// GET /api/design-portal/my-designs
// Designer sees their assigned designs grouped by order
// ============================================
router.get('/my-designs', async (req, res) => {
  try {
    const result = await query(`
      SELECT da.*,
        o.order_number,
        oi.product_name, oi.quantity,
        (SELECT COUNT(*) FROM design_messages dm
         WHERE dm.order_id = da.order_id
         AND dm.sender_type = 'client'
         AND dm.created_at > COALESCE(
           (SELECT MAX(dm2.created_at) FROM design_messages dm2
            WHERE dm2.order_id = da.order_id AND dm2.sender_type = 'designer'
            AND dm2.sender_id = da.assigned_to), da.created_at
         )
        ) as unread_count
      FROM design_assignments da
      LEFT JOIN orders o ON da.order_id = o.id
      LEFT JOIN order_items oi ON da.order_item_id = oi.id
      WHERE da.assigned_to = $1
      ORDER BY
        CASE da.status
          WHEN 'cambios' THEN 1
          WHEN 'en_revision' THEN 2
          WHEN 'en_progreso' THEN 3
          WHEN 'pendiente' THEN 4
          WHEN 'aprobado' THEN 5
        END,
        da.due_date ASC NULLS LAST
    `, [req.employee.id]);

    res.json({ success: true, designs: result.rows });
  } catch (err) {
    console.error('Error fetching designs:', err);
    res.status(500).json({ success: false, error: 'Error loading designs' });
  }
});

// ============================================
// GET /api/design-portal/order/:orderId/designs
// All designs for an order (for the design strip)
// ============================================
router.get('/order/:orderId/designs', async (req, res) => {
  try {
    const result = await query(`
      SELECT da.id, da.design_number, da.status, da.assigned_to,
        oi.product_name, da.specs,
        e.name as designer_name
      FROM design_assignments da
      LEFT JOIN order_items oi ON da.order_item_id = oi.id
      LEFT JOIN employees e ON da.assigned_to = e.id
      WHERE da.order_id = $1
      ORDER BY da.design_number
    `, [req.params.orderId]);

    res.json({ success: true, designs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error loading order designs' });
  }
});

// ============================================
// GET /api/design-portal/designs/:id
// Single design detail with specs
// ============================================
router.get('/designs/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT da.*,
        o.order_number, o.delivery_date,
        oi.product_name, oi.quantity, oi.description as item_description,
        c.name as client_name_full, c.phone as client_phone_full
      FROM design_assignments da
      LEFT JOIN orders o ON da.order_id = o.id
      LEFT JOIN order_items oi ON da.order_item_id = oi.id
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE da.id = $1 AND da.assigned_to = $2
    `, [req.params.id, req.employee.id]);

    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Design not found' });
    res.json({ success: true, design: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error loading design' });
  }
});

// ============================================
// GET /api/design-portal/messages/:orderId
// Chat messages for an order (all designs)
// ============================================
router.get('/messages/:orderId', async (req, res) => {
  try {
    const after = req.query.after || '1970-01-01';
    const result = await query(`
      SELECT dm.*, da.design_number
      FROM design_messages dm
      LEFT JOIN design_assignments da ON dm.design_assignment_id = da.id
      WHERE dm.order_id = $1
      AND dm.created_at > $2
      ORDER BY dm.created_at ASC
    `, [req.params.orderId, after]);

    res.json({ success: true, messages: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error loading messages' });
  }
});

// ============================================
// POST /api/design-portal/messages/send
// Designer sends message → goes to client WhatsApp
// ============================================
router.post('/messages/send', async (req, res) => {
  try {
    const { orderId, designAssignmentId, content, messageType } = req.body;
    if (!orderId || !content) return res.status(400).json({ success: false, error: 'orderId and content required' });

    // Get client phone and designer name
    const assignmentResult = await query(`
      SELECT da.client_phone, e.name as designer_name
      FROM design_assignments da
      JOIN employees e ON da.assigned_to = e.id
      WHERE da.order_id = $1 AND da.assigned_to = $2
      LIMIT 1
    `, [orderId, req.employee.id]);

    if (!assignmentResult.rows.length) return res.status(404).json({ success: false, error: 'Assignment not found' });

    const { client_phone, designer_name } = assignmentResult.rows[0];

    // Save message to DB
    const msgResult = await query(`
      INSERT INTO design_messages (design_assignment_id, order_id, sender_type, sender_id, sender_name, message_type, content)
      VALUES ($1, $2, 'designer', $3, $4, $5, $6)
      RETURNING *
    `, [designAssignmentId, orderId, req.employee.id, designer_name, messageType || 'text', content]);

    // Send via WhatsApp bot
    // Import sendWhatsAppMessage dynamically to avoid circular deps
    try {
      const { sendTextMessage, sendImageMessage } = await import('../services/whatsapp-sender.js');
      const prefixedContent = `*${designer_name}:* ${content}`;

      if (messageType === 'image') {
        await sendImageMessage(client_phone, content, `*${designer_name}:* Diseño`);
      } else {
        await sendTextMessage(client_phone, prefixedContent);
      }
    } catch (waErr) {
      console.error('WhatsApp send failed:', waErr.message);
      // Message saved to DB even if WA fails — can retry
    }

    res.json({ success: true, message: msgResult.rows[0] });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, error: 'Error sending message' });
  }
});

// ============================================
// PUT /api/design-portal/designs/:id/status
// Update design status
// ============================================
router.put('/designs/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pendiente', 'en_progreso', 'en_revision', 'cambios', 'aprobado'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    const completedAt = status === 'aprobado' ? 'NOW()' : 'NULL';
    const result = await query(`
      UPDATE design_assignments
      SET status = $1, completed_at = ${completedAt}, updated_at = NOW()
      WHERE id = $2 AND assigned_to = $3
      RETURNING *
    `, [status, req.params.id, req.employee.id]);

    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Design not found' });
    res.json({ success: true, design: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error updating status' });
  }
});

// ============================================
// POST /api/design-portal/assign (Manager/Admin only)
// Assign designs to designers
// ============================================
router.post('/assign', async (req, res) => {
  try {
    const { orderId, assignments } = req.body;
    // assignments: [{ orderItemId, designNumber, totalDesigns, assignedTo, specs, clientPhone, clientName, dueDate }]
    if (!orderId || !assignments?.length) return res.status(400).json({ success: false, error: 'orderId and assignments required' });

    const results = [];
    for (const a of assignments) {
      const result = await query(`
        INSERT INTO design_assignments (order_id, order_item_id, design_number, total_designs, assigned_to, assigned_by, specs, client_phone, client_name, due_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [orderId, a.orderItemId, a.designNumber, a.totalDesigns, a.assignedTo, req.employee.id, JSON.stringify(a.specs || {}), a.clientPhone, a.clientName, a.dueDate]);
      results.push(result.rows[0]);
    }

    res.json({ success: true, assignments: results });
  } catch (err) {
    console.error('Error assigning designs:', err);
    res.status(500).json({ success: false, error: 'Error assigning designs' });
  }
});

export default router;
```

**Step 2: Register routes in server.js**

Add import at top with other imports:
```javascript
import designPortalRoutes from './design-portal-routes.js';
```

Add route registration after `app.use('/api/tasks', taskRoutes);`:
```javascript
app.use('/api/design-portal', designPortalRoutes);
```

**Step 3: Commit**
```bash
git add backend/api/design-portal-routes.js backend/api/server.js
git commit -m "feat: design portal API routes — assignments, messages, WhatsApp bridge"
```

---

### Task 3: WhatsApp Bot — Route Client Replies to Design Portal

**Files:**
- Modify: `backend/services/whatsapp-ai.js` (~line 480, processIncomingMessage)

**Step 1: Add design message routing at the TOP of processIncomingMessage**

Before the existing AI processing logic, add a check: does this client phone have active design assignments? If yes, save the message to `design_messages` and let the AI continue as normal.

```javascript
// At the top of processIncomingMessage, after the kill switch check:

// Route to design portal if client has active assignments
try {
  const activeDesigns = await query(`
    SELECT da.id, da.order_id, da.assigned_to
    FROM design_assignments da
    WHERE da.client_phone = $1
    AND da.status NOT IN ('aprobado')
    LIMIT 1
  `, [waId]);

  if (activeDesigns.rows.length > 0) {
    const design = activeDesigns.rows[0];
    await query(`
      INSERT INTO design_messages (design_assignment_id, order_id, sender_type, sender_name, message_type, content)
      VALUES ($1, $2, 'client', $3, $4, $5)
    `, [
      design.id,
      design.order_id,
      'Cliente',
      mediaContext?.type === 'image' ? 'image' : 'text',
      mediaContext?.type === 'image' ? (mediaContext.url || messageText) : messageText
    ]);
  }
} catch (designErr) {
  console.error('Design portal routing error:', designErr.message);
  // Non-blocking — continue with normal AI processing
}
```

**Step 2: Commit**
```bash
git add backend/services/whatsapp-ai.js
git commit -m "feat: route incoming WhatsApp messages to design portal"
```

---

### Task 4: Check WhatsApp Sender Exports

**Files:**
- Read: `backend/services/whatsapp-sender.js` or equivalent

**Step 1: Verify sendTextMessage and sendImageMessage exist**

Check what the actual export names are. The design-portal-routes.js imports `sendTextMessage` and `sendImageMessage`. If the actual names differ, update the import in design-portal-routes.js.

```bash
grep -n "export.*function\|export.*async\|module.exports" backend/services/whatsapp-sender.js
```

Adjust the import in `design-portal-routes.js` to match actual export names.

**Step 2: Commit if changes needed**

---

### Task 5: Frontend — Designer Portal Page (HTML + CSS + JS)

**Files:**
- Create: `frontend/employee-dashboard/designs.html`
- Create: `frontend/employee-dashboard/designs.js`

**Step 1: Create designs.html**

Full WhatsApp-style chat interface. Uses /frontend-design skill and /axkan brand guidelines. AXKAN colors, RL AQVA font for titles, WhatsApp-style chat bubbles.

Key elements:
- Topbar with AXKAN logo, designer name, logout
- Left panel: list of assigned orders with design pill strip
- Right panel: WhatsApp-style chat view
- Design pills at top of chat showing D1 ✅ D2 ⏳ D3 🔲 etc.
- Chat bubbles: client (left, #f0f0f0), designer (right, #fff0f6 pink tint)
- Bottom input bar with image upload, text input, "Aplica a" selector, send button
- Specs sidebar (collapsible) showing product, destination, quantity, deadline, notes
- Status dropdown to change design status

Design pills status colors:
- pendiente: #e0e0e0 (gray)
- en_progreso: #f39223 (naranja)
- en_revision: #09adc2 (turquesa)
- cambios: #e52421 (rojo)
- aprobado: #8ab73b (verde)

**Step 2: Create designs.js**

Core logic:
- Auth check (same as dashboard.js pattern)
- API_BASE detection
- `loadMyDesigns()` — fetch GET /api/design-portal/my-designs, render order cards with design pills
- `openDesignChat(orderId, designId)` — load messages, render WhatsApp-style chat
- `pollMessages()` — every 3 seconds, GET /api/design-portal/messages/:orderId?after=lastTimestamp
- `sendMessage(text)` — POST /api/design-portal/messages/send, append to chat
- `uploadImage(file)` — upload to /api/gallery/upload or base64, then send as image message
- `updateDesignStatus(designId, status)` — PUT /api/design-portal/designs/:id/status
- `renderMessage(msg)` — WhatsApp-style bubble with timestamp, sender alignment, image preview

**Step 3: Commit**
```bash
git add frontend/employee-dashboard/designs.html frontend/employee-dashboard/designs.js
git commit -m "feat: designer portal — WhatsApp-style chat with clients"
```

---

### Task 6: Add Navigation Link in Employee Dashboard

**Files:**
- Modify: `frontend/employee-dashboard/index.html` (add sidebar link)
- Modify: `frontend/employee-dashboard/dashboard.js` (add view handler)

OR simply: the designs page is standalone (`designs.html`) with its own navigation, so we just add a link in the sidebar that opens `designs.html`.

**Step 1: Add "Mis Diseños" link in sidebar nav of index.html**

After the "My Tasks" nav item, add:
```html
<a href="designs.html" class="nav-item design-only" data-department="design">
  <span class="nav-icon">🎨</span>
  <span>Mis Diseños</span>
</a>
```

**Step 2: Commit**
```bash
git add frontend/employee-dashboard/index.html
git commit -m "feat: add Mis Diseños nav link for designers"
```

---

### Task 7: Admin — Design Assignment UI

**Files:**
- Modify: `frontend/admin-dashboard/index.html` or create a section in the orders view

**Step 1: Add "Asignar Diseños" button in order detail modal**

When viewing an order in admin, add a button that opens a modal to:
- Set how many designs (1-10)
- For each design: select designer (dropdown of active design employees), add specs/notes
- Submit calls POST /api/design-portal/assign

This is for Ivan to assign work from the admin dashboard.

**Step 2: Commit**
```bash
git add frontend/admin-dashboard/index.html
git commit -m "feat: admin can assign designs to designers from order view"
```

---

### Task 8: Integration Test

**Step 1: Test the full flow manually**

1. Run migration
2. Start server
3. As admin: create a design assignment via API or admin UI
4. As designer: login to designs.html, see the assignment
5. Send a message from designer portal → verify it arrives on client WhatsApp
6. Send reply from client WhatsApp → verify it appears in designer portal chat
7. Change design status → verify it updates

**Step 2: Commit any fixes**

---

## Execution Order

Tasks 1-4 are backend (can be done first).
Task 5 is the big frontend piece.
Task 6-7 are integration touches.
Task 8 is verification.

Total estimated: 6 tasks of real code, ~45 min with parallel agents.

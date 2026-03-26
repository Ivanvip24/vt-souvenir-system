# WhatsApp Designer Task Tracking + AI Reports

**Date:** 2026-03-19
**Status:** Design approved
**Goal:** Track designer work (armados & diseños) via WhatsApp with zero friction, generate AXKAN-branded PDF reports with AI insights.

---

## Problem

- 2 designers (Sarahi, Majo) receive work assignments via WhatsApp group "AXKAN Diseño" or 1-on-1
- Ivan sends an image + short instruction (e.g. "arm iman", "diseño destapadores llaveros")
- No tracking of completion, turnaround time, corrections, or workload balance
- Everything is verbal/informal — zero data, zero visibility

## Solution

A WhatsApp-integrated tracking system that:
1. **Watches** the group chat for assignments (Ivan's messages)
2. **Parses** natural language into structured tasks
3. **Follows up** with designers via DM for completion status
4. **Generates** AXKAN-branded PDF reports (daily + weekly) with AI analysis

---

## Team

| Designer | Phone | WhatsApp |
|----------|-------|----------|
| Sarahi | +52 1 55 1894 2408 | Registered |
| Majo | +52 1 55 3481 1233 | Registered |

**Group:** AXKAN Diseño (`https://chat.whatsapp.com/CRFGcePkmcvKA4nIG0POSf`)

---

## Two Task Types

### Armados (Assembly)
- **Nature:** Binary — done or not done
- **Assignment:** "Sarahi arm 50 imanes Cancún"
- **Tracking:** Bot asks end of day → "¿Ya terminaste?" → sí/no
- **Data captured:** who, what product, quantity, destination, assigned_at, completed_at

### Diseños (Designs)
- **Nature:** Multi-piece, iterative with corrections
- **Assignment:** "Majo diseño destapadores, llaveros, imanes — pedido Oaxaca"
- **Tracking:** Each design piece tracked separately. Designer sends image back = delivered. Ivan sends correction = new round.
- **Data captured:** who, pieces (array), per-piece status, correction_count, correction_notes, images

---

## Database Schema

### New table: `designers`

```sql
CREATE TABLE designers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,  -- WhatsApp number
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### New table: `designer_tasks`

```sql
CREATE TABLE designer_tasks (
    id SERIAL PRIMARY KEY,
    designer_id INTEGER REFERENCES designers(id),
    task_type VARCHAR(20) NOT NULL,          -- 'armado' | 'diseño'
    product_type VARCHAR(100),               -- iman, llavero, destapador, etc.
    destination VARCHAR(200),                -- Cancún, Oaxaca, etc.
    quantity INTEGER,                        -- for armados
    description TEXT,                        -- raw assignment text
    status VARCHAR(20) DEFAULT 'pending',    -- pending | in_progress | done | correction
    assigned_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    source VARCHAR(20) DEFAULT 'group',      -- group | direct | self_reported
    assigned_image_url TEXT,                 -- image Ivan sent with assignment
    order_reference VARCHAR(200),            -- "pedido Oaxaca" if mentioned
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### New table: `design_pieces` (for diseño tasks with multiple pieces)

```sql
CREATE TABLE design_pieces (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES designer_tasks(id) ON DELETE CASCADE,
    piece_name VARCHAR(100) NOT NULL,        -- "destapador", "llavero", etc.
    status VARCHAR(20) DEFAULT 'pending',    -- pending | delivered | correction | approved
    correction_count INTEGER DEFAULT 0,
    delivered_image_url TEXT,                 -- image designer sent back
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### New table: `task_corrections`

```sql
CREATE TABLE task_corrections (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES designer_tasks(id) ON DELETE CASCADE,
    piece_id INTEGER REFERENCES design_pieces(id),
    correction_type VARCHAR(20),             -- text | voice | image | mixed
    correction_notes TEXT,                   -- parsed from message
    correction_image_url TEXT,               -- marked-up image if sent
    created_at TIMESTAMP DEFAULT NOW()
);
```

### New table: `designer_groups`

```sql
CREATE TABLE designer_groups (
    id SERIAL PRIMARY KEY,
    group_name VARCHAR(200) NOT NULL,
    group_jid VARCHAR(100) UNIQUE NOT NULL,  -- WhatsApp group JID
    purpose VARCHAR(50) DEFAULT 'design',    -- design | production
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Views

```sql
-- Daily summary per designer
CREATE VIEW designer_daily_summary AS
SELECT
    d.name,
    dt.task_type,
    DATE(dt.assigned_at) as date,
    COUNT(*) as total_assigned,
    COUNT(*) FILTER (WHERE dt.status = 'done') as completed,
    COUNT(*) FILTER (WHERE dt.status = 'pending') as pending,
    COUNT(*) FILTER (WHERE dt.status = 'correction') as in_correction,
    AVG(EXTRACT(EPOCH FROM (dt.completed_at - dt.assigned_at))/3600)
        FILTER (WHERE dt.completed_at IS NOT NULL) as avg_hours_to_complete
FROM designer_tasks dt
JOIN designers d ON d.id = dt.designer_id
GROUP BY d.name, dt.task_type, DATE(dt.assigned_at);

-- Correction patterns
CREATE VIEW correction_patterns AS
SELECT
    d.name as designer,
    dp.piece_name as product_type,
    COUNT(tc.id) as total_corrections,
    AVG(dp.correction_count) as avg_corrections_per_piece
FROM task_corrections tc
JOIN design_pieces dp ON dp.id = tc.piece_id
JOIN designer_tasks dt ON dt.id = tc.task_id
JOIN designers d ON d.id = dt.designer_id
GROUP BY d.name, dp.piece_name;
```

---

## WhatsApp Bot Integration

### Message Parsing (in `whatsapp-ai.js`)

The bot watches messages in registered groups. When Ivan sends a message, AI parses it:

**Input:** "Sarahi arm 50 imanes Cancún"
**Parsed:**
```json
{
  "type": "assignment",
  "designer": "Sarahi",
  "task_type": "armado",
  "product_type": "imanes",
  "quantity": 50,
  "destination": "Cancún",
  "has_image": true
}
```

**Input:** "Majo diseño destapadores, llaveros, imanes — pedido Oaxaca"
**Parsed:**
```json
{
  "type": "assignment",
  "designer": "Majo",
  "task_type": "diseño",
  "pieces": ["destapadores", "llaveros", "imanes"],
  "order_reference": "pedido Oaxaca",
  "has_image": true
}
```

### Bot Behaviors

1. **On assignment detected:** Create task in DB, confirm in group chat:
   > "✓ Tarea para Sarahi: armar 50 imanes Cancún"

2. **End-of-day check-in** (6 PM via DM to designer):
   > "Sarahi, ¿ya terminaste los imanes Cancún?"
   - "sí" / "ya" / "listo" → marks done
   - "no" / "mañana" → keeps pending
   - number (e.g. "30") → partial progress for armados

3. **Design delivery detected** (designer sends image in group/DM):
   - Bot matches to open diseño task
   - Marks that piece as delivered
   > "✓ Diseño de destapadores recibido"

4. **Correction detected** (Ivan replies to design with feedback):
   - Bot logs correction with notes
   - Increments correction_count on the piece
   - Changes piece status to 'correction'
   > "✓ Corrección registrada para destapadores (ronda 2)"

5. **Manager commands:**
   - `"registra a [nombre] [teléfono]"` → adds designer
   - `"reporte"` → generates and sends today's PDF immediately
   - `"pendientes"` → lists all pending tasks
   - `"status [nombre]"` → shows designer's current tasks

6. **Designer self-reporting:**
   - `"empecé imanes"` → creates self-reported task
   - `"terminé"` → marks most recent pending task as done

---

## PDF Report Generation

### Technology
- HTML template → Puppeteer → PDF
- Same approach as existing purchase order PDFs
- AXKAN branded: jaguar logo, colorful header bar, brand typography

### Daily Report (sent every evening ~7 PM to Ivan's WhatsApp)

**Content:**
- Header: AXKAN logo + "Reporte Diario de Producción" + date
- Summary cards: Total tareas | Completadas | Pendientes | Correcciones
- Table per designer:
  | Tarea | Tipo | Producto | Status |
  |-------|------|----------|--------|
  | Armar imanes Cancún | Armado | Imanes | ✅ Completado |
  | Diseño pedido Oaxaca | Diseño | 3 piezas | ⏳ 2/3 entregadas |
- Overdue alert: tasks pending for > 2 days highlighted in rojo

### Weekly Report (sent every Sunday morning to Ivan's WhatsApp)

**Page 1 — Dashboard:**
- Big numbers: total tasks, completion rate, avg turnaround
- Week-over-week comparison arrows (↑ better, ↓ worse)
- Pie chart: armados vs diseños breakdown

**Page 2 — Per Designer:**
- Sarahi vs Majo side-by-side cards
- Metrics: tasks completed, avg time, correction rate
- Mini bar chart: daily output across the week

**Page 3 — AI Insights:**
- Claude analyzes the week's data and generates 3-5 insights in natural Spanish
- Examples:
  - "Los diseños de llaveros llevan en promedio 2.3 correcciones vs 0.5 para destapadores — considerar una guía de diseño para llaveros"
  - "Sarahi completa armados 40% más rápido que diseños — asignarle más armados podría mejorar el flujo"
  - "3 tareas llevan más de 4 días pendientes — revisar si hubo comunicación verbal no registrada"
  - "Esta semana hubo 15% más correcciones que la anterior — las correcciones se concentran en diseños con 3+ piezas"

### AI Analysis Function

```javascript
async function generateWeeklyInsights(weekData) {
  // Send structured data to Claude API
  const prompt = `Analiza estos datos de producción de la semana y genera 3-5 insights
  accionables en español. Enfócate en patrones, cuellos de botella, y sugerencias
  para mejorar la eficiencia. Sé directo y específico.

  Datos: ${JSON.stringify(weekData)}`;

  // Returns array of insight strings
}
```

---

## Report Scheduling

```javascript
// In a new scheduler or extending existing analytics scheduler
import cron from 'node-cron';

// Daily report — 7 PM Mexico City
cron.schedule('0 19 * * *', generateAndSendDailyReport, {
  timezone: 'America/Mexico_City'
});

// Weekly report — Sunday 9 AM Mexico City
cron.schedule('0 9 * * 0', generateAndSendWeeklyReport, {
  timezone: 'America/Mexico_City'
});
```

---

## Files to Create/Modify

### New Files
1. `backend/migrations/add-designer-tracking.js` — DB schema
2. `backend/services/designer-task-parser.js` — AI message parsing
3. `backend/services/designer-task-tracker.js` — CRUD operations + follow-ups
4. `backend/services/designer-report-generator.js` — PDF generation
5. `backend/templates/daily-designer-report.html` — Handlebars template
6. `backend/templates/weekly-designer-report.html` — Handlebars template
7. `backend/api/designer-routes.js` — API endpoints (optional, for dashboard)

### Modified Files
1. `backend/services/whatsapp-ai.js` — Add group watching + assignment parsing
2. `backend/api/server.js` — Register new routes + scheduler
3. `backend/migrations/run-migration.js` — Add new migration

---

## Implementation Order

1. **Database migration** — create tables + views
2. **Designer registration** — seed Sarahi & Majo
3. **Message parser** — AI-powered assignment detection
4. **Task tracker service** — CRUD + status updates
5. **Bot integration** — wire parser into WhatsApp message handler
6. **Daily PDF report** — template + generation + WhatsApp delivery
7. **Weekly PDF report** — template + AI insights + WhatsApp delivery
8. **Follow-up system** — end-of-day check-ins with designers
9. **Correction tracking** — detect and log design corrections

---

## Success Criteria

- [ ] Ivan assigns work in WhatsApp as usual → task created automatically
- [ ] Bot confirms assignment in chat
- [ ] Designers get end-of-day check-in, reply naturally
- [ ] Corrections are tracked with round count
- [ ] Daily PDF arrives every evening on Ivan's WhatsApp
- [ ] Weekly PDF arrives Sunday morning with AI insights
- [ ] Reports use AXKAN branding (logo, colors, typography)
- [ ] System works for both group and 1-on-1 messages

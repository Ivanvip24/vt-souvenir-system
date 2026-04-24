# WhatsApp Sales Intelligence Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a sales analytics dashboard inside the WhatsApp tab that mines conversation data to find invisible patterns that close deals — word effectiveness, response timing, client profiling, funnel analysis — all measured in percentages and probabilities.

**Architecture:** Backend endpoint `/api/whatsapp/sales-analytics` runs SQL aggregations across `whatsapp_conversations`, `whatsapp_messages`, `orders`, and `clients` tables. Frontend renders a "📊 Sales AI" tab within the WhatsApp view showing metric cards, charts, and pattern tables. Data linked via `conversations.client_id → clients.id ← orders.client_id`.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend, PostgreSQL aggregations, Chart.js for visualizations (already loaded in dashboard).

---

### Task 1: Backend — Sales Analytics Endpoint

**Files:**
- Modify: `backend/api/whatsapp-routes.js` — add new endpoint
- No test files (integration-tested via curl)

**Step 1: Add the analytics endpoint**

Add before the `export default router;` at the end of whatsapp-routes.js:

```javascript
// GET /sales-analytics — Comprehensive sales intelligence data
router.get('/sales-analytics', authMiddleware, async (req, res) => {
  try {
    // 1. Overview metrics
    const overview = await query(`
      SELECT
        COUNT(*) as total_conversations,
        COUNT(CASE WHEN client_id IS NOT NULL THEN 1 END) as linked_to_client,
        COUNT(CASE WHEN intent = 'order_creation' THEN 1 END) as order_conversations
      FROM whatsapp_conversations
    `);

    // 2. Revenue from WhatsApp-linked orders
    const revenue = await query(`
      SELECT
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.total_price), 0) as total_revenue,
        COALESCE(AVG(o.total_price), 0) as avg_order_value,
        COALESCE(SUM(o.profit), 0) as total_profit
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      JOIN whatsapp_conversations wc ON wc.client_id = c.id
    `);

    // 3. Close rate (conversations that led to orders vs total)
    const closeRate = await query(`
      SELECT
        COUNT(DISTINCT wc.id) as total_convs,
        COUNT(DISTINCT CASE WHEN o.id IS NOT NULL THEN wc.id END) as closed_convs
      FROM whatsapp_conversations wc
      LEFT JOIN clients c ON wc.client_id = c.id
      LEFT JOIN orders o ON c.id = o.client_id
    `);

    // 4. Average messages to close (conversations with orders vs without)
    const msgsToClose = await query(`
      SELECT
        CASE WHEN o.id IS NOT NULL THEN 'closed' ELSE 'lost' END as outcome,
        AVG(msg_count) as avg_messages,
        AVG(EXTRACT(EPOCH FROM (last_msg - first_msg)) / 3600) as avg_hours
      FROM (
        SELECT
          wc.id,
          COUNT(m.id) as msg_count,
          MIN(m.created_at) as first_msg,
          MAX(m.created_at) as last_msg
        FROM whatsapp_conversations wc
        JOIN whatsapp_messages m ON m.conversation_id = wc.id
        LEFT JOIN clients c ON wc.client_id = c.id
        LEFT JOIN orders o ON c.id = o.client_id
        GROUP BY wc.id, o.id
      ) sub
      LEFT JOIN clients c2 ON c2.id = (SELECT client_id FROM whatsapp_conversations WHERE id = sub.id)
      LEFT JOIN orders o ON c2.id = o.client_id
      GROUP BY CASE WHEN o.id IS NOT NULL THEN 'closed' ELSE 'lost' END
    `);

    // 5. Intent distribution
    const intents = await query(`
      SELECT intent, COUNT(*) as count
      FROM whatsapp_conversations
      WHERE intent IS NOT NULL AND intent != 'general'
      GROUP BY intent
      ORDER BY count DESC
    `);

    // 6. Response time analysis (avg time between client msg and AI reply)
    const responseTimes = await query(`
      SELECT
        AVG(response_seconds) as avg_response_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_seconds) as median_response_time
      FROM (
        SELECT
          EXTRACT(EPOCH FROM (ai.created_at - client.created_at)) as response_seconds
        FROM whatsapp_messages client
        JOIN LATERAL (
          SELECT created_at FROM whatsapp_messages
          WHERE conversation_id = client.conversation_id
            AND direction = 'outbound'
            AND created_at > client.created_at
          ORDER BY created_at ASC LIMIT 1
        ) ai ON true
        WHERE client.direction = 'inbound'
          AND client.message_type = 'text'
      ) response_pairs
      WHERE response_seconds > 0 AND response_seconds < 86400
    `);

    // 7. Hourly distribution (when do clients message most)
    const hourlyDist = await query(`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Mexico_City') as hour,
        COUNT(*) as message_count,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound
      FROM whatsapp_messages
      GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Mexico_City')
      ORDER BY hour
    `);

    // 8. Top performing AI messages (messages that led to next client response quickly)
    const topPhrases = await query(`
      SELECT
        LEFT(m.content, 100) as phrase,
        COUNT(*) as times_used,
        AVG(EXTRACT(EPOCH FROM (next_msg.created_at - m.created_at))) as avg_response_seconds
      FROM whatsapp_messages m
      JOIN LATERAL (
        SELECT created_at FROM whatsapp_messages
        WHERE conversation_id = m.conversation_id
          AND direction = 'inbound'
          AND created_at > m.created_at
        ORDER BY created_at ASC LIMIT 1
      ) next_msg ON true
      WHERE m.direction = 'outbound' AND m.sender = 'ai'
        AND m.message_type = 'text' AND LENGTH(m.content) > 10
      GROUP BY LEFT(m.content, 100)
      HAVING COUNT(*) >= 2
      ORDER BY avg_response_seconds ASC
      LIMIT 20
    `);

    // 9. Message length analysis (short vs long messages effectiveness)
    const lengthAnalysis = await query(`
      SELECT
        CASE
          WHEN LENGTH(content) < 50 THEN 'corto'
          WHEN LENGTH(content) < 150 THEN 'medio'
          ELSE 'largo'
        END as length_category,
        COUNT(*) as count,
        sender
      FROM whatsapp_messages
      WHERE message_type = 'text' AND content IS NOT NULL
      GROUP BY length_category, sender
      ORDER BY sender, length_category
    `);

    // 10. Daily conversation volume (last 30 days)
    const dailyVolume = await query(`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Mexico_City') as day,
        COUNT(*) as new_conversations
      FROM whatsapp_conversations
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at AT TIME ZONE 'America/Mexico_City')
      ORDER BY day
    `);

    // 11. Sender breakdown
    const senderBreakdown = await query(`
      SELECT sender, COUNT(*) as count
      FROM whatsapp_messages
      GROUP BY sender
    `);

    const ov = overview.rows[0];
    const rev = revenue.rows[0];
    const cr = closeRate.rows[0];

    res.json({
      success: true,
      data: {
        overview: {
          totalConversations: parseInt(ov.total_conversations),
          linkedToClient: parseInt(ov.linked_to_client),
          orderConversations: parseInt(ov.order_conversations),
          closeRate: cr.total_convs > 0 ? ((cr.closed_convs / cr.total_convs) * 100).toFixed(1) : 0
        },
        revenue: {
          totalOrders: parseInt(rev.total_orders),
          totalRevenue: parseFloat(rev.total_revenue),
          avgOrderValue: parseFloat(rev.avg_order_value),
          totalProfit: parseFloat(rev.total_profit)
        },
        messagesToClose: msgsToClose.rows,
        intents: intents.rows,
        responseTimes: {
          avg: responseTimes.rows[0]?.avg_response_time || 0,
          median: responseTimes.rows[0]?.median_response_time || 0
        },
        hourlyDistribution: hourlyDist.rows,
        topPhrases: topPhrases.rows,
        lengthAnalysis: lengthAnalysis.rows,
        dailyVolume: dailyVolume.rows,
        senderBreakdown: senderBreakdown.rows
      }
    });
  } catch (err) {
    console.error('📊 Sales analytics error:', err);
    res.status(500).json({ success: false, error: 'Failed to load analytics' });
  }
});
```

**Step 2: Commit**
```bash
git add backend/api/whatsapp-routes.js
git commit -m "feat: add /whatsapp/sales-analytics endpoint with 11 metric queries"
```

---

### Task 2: Frontend — Sales AI Tab in WhatsApp View

**Files:**
- Modify: `frontend/admin-dashboard/whatsapp.js` — add tab + dashboard rendering

**Step 1: Add "📊 Sales AI" tab to the archive tabs bar**

In `whatsapp.js`, find the archive tabs rendering (around line 2272) and add the Sales AI tab after "Seleccionar".

**Step 2: Add state variable**
```javascript
waState.salesView = false; // true when Sales AI tab is active
```

**Step 3: Add CSS for the sales dashboard**

Inline CSS at the top of whatsapp.js (in the existing style block):
- `.wa-sales-dashboard` — grid layout for metric cards
- `.wa-sales-card` — individual metric card with icon, value, label
- `.wa-sales-big-number` — large percentage/number display
- `.wa-sales-chart` — chart container
- `.wa-sales-phrase-table` — table for top phrases
- `.wa-sales-section` — section headers

**Step 4: Create `renderSalesDashboard()` function**

Fetches `/api/whatsapp/sales-analytics`, renders:

Row 1 — Big KPIs:
- Close Rate (%) — big number with color
- Total Revenue ($) — from WhatsApp orders
- Avg Order Value ($)
- Total Conversations

Row 2 — Funnel:
- Conversations → Linked to Client → Orders Created
- Shows % at each step

Row 3 — Efficiency:
- Avg Messages to Close (won vs lost)
- Avg Response Time
- Message Length effectiveness

Row 4 — Charts:
- Hourly distribution (bar chart — when clients message)
- Daily volume (line chart — last 30 days)
- Intent distribution (doughnut chart)

Row 5 — Top Phrases Table:
- AI phrases that got fastest client responses
- Times used, avg response time

Row 6 — Sender Breakdown:
- AI vs Admin vs Client message percentages

**Step 5: Wire tab click to toggle sales view**

When "📊 Sales AI" tab is clicked:
- Hide conversation list + chat panel
- Show sales dashboard full-width
- Fetch data from endpoint
- Render dashboard

When any other tab is clicked:
- Hide sales dashboard
- Show normal WhatsApp view

**Step 6: Commit**
```bash
git add frontend/admin-dashboard/whatsapp.js
git commit -m "feat: Sales AI dashboard tab with KPIs, charts, and phrase analysis"
```

---

### Task 3: Frontend — Chart Visualizations

**Files:**
- Modify: `frontend/admin-dashboard/whatsapp.js`

**Step 1: Add Chart.js visualizations**

Chart.js is already loaded in index.html. Create these charts:

1. **Hourly Activity Chart** (bar) — 24 bars showing when clients message most
2. **Daily Volume Chart** (line) — last 30 days conversation trend
3. **Intent Distribution** (doughnut) — breakdown of conversation intents
4. **Message Length vs Outcome** (grouped bar) — short/medium/long by sender

**Step 2: Add chart destroy/recreate logic**
Store chart instances in `waState.salesCharts = {}` and destroy before recreating.

**Step 3: Commit**
```bash
git add frontend/admin-dashboard/whatsapp.js
git commit -m "feat: add Chart.js visualizations to Sales AI dashboard"
```

---

### Task 4: Real-Time Recommendations Engine

**Files:**
- Modify: `backend/services/whatsapp-ai.js` — inject recommendations into AI context
- Modify: `backend/api/whatsapp-routes.js` — new endpoint for per-conversation recommendations

**Step 1: Add recommendations endpoint**

```
GET /whatsapp/conversations/:id/recommendations
```

Analyzes:
- Current conversation stage (greeting, inquiry, quoting, closing)
- Client profile (based on message patterns)
- What worked in similar conversations (same intent, similar quantity)
- Optimal next message suggestion

**Step 2: Show recommendations in the Insights panel**

Add a "💡 Recomendaciones" section below the existing insights:
- "Este cliente responde mejor a mensajes cortos (< 50 chars)"
- "Clientes similares cierran 73% del tiempo cuando mencionas envío gratis"
- "Hora óptima para dar seguimiento: 10am-12pm"

**Step 3: Commit**
```bash
git add backend/services/whatsapp-ai.js backend/api/whatsapp-routes.js frontend/admin-dashboard/whatsapp.js
git commit -m "feat: real-time sales recommendations in conversation insights"
```

---

### Task 5: Polish & Performance

**Files:**
- Modify: `frontend/admin-dashboard/whatsapp.js` — loading states, error handling
- Modify: `backend/api/whatsapp-routes.js` — query caching

**Step 1: Add loading skeleton**
Show pulsing placeholder cards while data loads.

**Step 2: Cache analytics on backend**
Cache the heavy analytics query results for 5 minutes (in-memory).

**Step 3: Add refresh button**
Manual "Actualizar" button to force-reload analytics.

**Step 4: Commit**
```bash
git add frontend/admin-dashboard/whatsapp.js backend/api/whatsapp-routes.js
git commit -m "feat: loading states, caching, and refresh for Sales AI dashboard"
```

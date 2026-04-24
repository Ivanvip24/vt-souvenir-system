# Self-Learning Sales Bot — Design Doc

**Date:** 2026-03-21
**Status:** Design approved
**Goal:** Bot analyzes every conversation, learns patterns, detects corrections, and auto-adjusts its behavior with guardrails.

---

## Three Learning Triggers

### 1. Order Created (immediate)
When an order is created (auto or manual):
- Find linked WhatsApp conversation
- Analyze full conversation: what messages led to the sale?
- Compare admin vs AI messages: what did Ivan do differently?
- Store closing pattern insights

### 2. Admin Override (immediate)
When Ivan sends a message (sender: 'admin') within 5 min of the bot (sender: 'ai'):
- Bot's message was wrong/insufficient
- Ivan's message is the correction
- Store as correction insight

### 3. Nightly Batch Analysis (12 AM daily)
Analyze ALL conversations from the past 24 hours:
- Response rate by hour of day
- Response rate by message length
- Response rate by opening style (greeting vs direct)
- Response rate by message type (text, image, document, list)
- Which questions get answers vs silence
- Emoji impact on responses
- Time-to-respond patterns
- Compare successful (order) vs failed conversations
- Cross-reference patterns across hundreds of conversations

---

## Database Schema

### `sales_learnings` table
```sql
CREATE TABLE sales_learnings (
    id SERIAL PRIMARY KEY,
    type VARCHAR(30) NOT NULL,        -- closing_pattern, correction, pattern_insight
    category VARCHAR(30),              -- tone, timing, opening, follow_up, objection, product_knowledge
    insight TEXT NOT NULL,
    evidence TEXT,                      -- data that supports this insight
    source_conversation_id INTEGER,
    source_order_id INTEGER,
    confidence VARCHAR(10) DEFAULT 'medium',  -- high, medium, low
    auto_adjustable BOOLEAN DEFAULT true,     -- can be auto-applied without approval
    applied BOOLEAN DEFAULT false,            -- is it in the system prompt?
    approved BOOLEAN,                         -- null=pending, true=approved, false=rejected
    times_validated INTEGER DEFAULT 0,        -- how many times this pattern held true
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### `bot_adjustments` table (audit trail)
```sql
CREATE TABLE bot_adjustments (
    id SERIAL PRIMARY KEY,
    learning_id INTEGER REFERENCES sales_learnings(id),
    adjustment_type VARCHAR(30),       -- prompt_update, behavior_change
    old_behavior TEXT,
    new_behavior TEXT,
    auto_applied BOOLEAN DEFAULT false,
    approved_by VARCHAR(50),           -- null if auto, 'ivan' if manual
    reverted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Auto vs Approval Guardrails

### Auto-adjustable (no approval needed):
- Message length/tone
- Opening greeting style
- When to send catalog (before/after asking needs)
- When to ask for name vs skip it
- Follow-up timing
- Emoji usage
- When to offer design photos
- Question phrasing

### Needs approval:
- Pricing changes
- Minimum quantity changes
- Delivery time promises
- Any policy change
- Product specification changes

---

## System Prompt Dynamic Sections

The bot's system prompt in `whatsapp-ai.js` gets 3 dynamic sections appended:

```
## PATRONES APRENDIDOS (auto-ajustado):
- Mensajes de 1-2 líneas tienen 40% más respuesta que párrafos
- Enviar catálogo después de preguntar qué necesitan, no antes
- Los martes y jueves a las 10 AM tienen mejor tasa de respuesta
- No insistir con el nombre si el cliente no lo da en el primer mensaje
- Enviar fotos de producto aumenta la tasa de respuesta 35%

## CORRECCIONES DE IVAN:
- Cuando el cliente pregunta por material: responder "MDF cortado con láser"
- Para pedidos de boda: preguntar fecha del evento para dar urgencia

## TÉCNICAS DE CIERRE (de ventas reales):
- Ofrecer fotos de diseños antes de cotizar
- Para tiendas B2B, ir directo a precios y cantidades
- Cuando dicen "déjame pensarlo", dar plazo: "el precio se mantiene esta semana"
```

Max 15 learnings per section (45 total) to keep prompt lean.

---

## Learning Service: `sales-learning-engine.js`

### `learnFromOrder(orderId)`
Called when order is created.
1. Find conversation via client_id
2. Get all messages
3. Separate admin/ai/client messages
4. Send to Claude (Haiku): "This conversation resulted in a sale. Analyze what worked."
5. Store insights in sales_learnings
6. If auto_adjustable, apply immediately

### `detectCorrection(conversationId, adminMessageId)`
Called when admin sends a message.
1. Check if bot sent a message in the last 5 min
2. If yes, this is a correction
3. Send both messages to Claude: "The admin corrected the bot. What should the bot learn?"
4. Store as correction insight
5. Apply immediately (corrections are always auto-adjustable for tone/approach)

### `nightlyPatternAnalysis()`
Cron job at 12 AM.
1. Get all conversations with activity in last 24 hours
2. For each, calculate: message count, response times, message lengths, outcome
3. Aggregate patterns across all conversations
4. Send aggregated stats to Claude: "Here are today's patterns. What should the bot adjust?"
5. Store insights, auto-apply safe ones, queue policy changes for approval

### `buildDynamicPromptSection()`
Called by getSystemPrompt() in whatsapp-ai.js.
1. Query sales_learnings WHERE applied = true
2. Group by type (pattern, correction, closing)
3. Format as text sections
4. Return string to append to system prompt

---

## Files to Create/Modify

### New Files
1. `backend/services/sales-learning-engine.js` — Core learning logic
2. `backend/migrations/add-sales-learnings.js` — DB schema

### Modified Files
3. `backend/services/whatsapp-ai.js` — Add dynamic prompt section from learnings
4. `backend/api/whatsapp-routes.js` — Detect admin overrides
5. `backend/api/server.js` — Register migration
6. `backend/services/designer-scheduler.js` — Add nightly analysis cron

---

## Implementation Order

1. Database migration
2. Learning engine service (3 functions)
3. Dynamic prompt section in whatsapp-ai.js
4. Admin override detection in webhook
5. Order creation hook
6. Nightly batch analysis cron

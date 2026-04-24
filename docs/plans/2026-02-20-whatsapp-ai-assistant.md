# WhatsApp AI Assistant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full auto-pilot WhatsApp AI assistant that receives messages via Meta Cloud API, responds using Claude with AXKAN brand voice, creates orders, and displays conversations on the admin dashboard.

**Architecture:** Meta WhatsApp webhook → Express route → Claude AI engine → Meta reply API. Conversations stored in PostgreSQL (2 new tables). New dashboard tab shows conversations with intent detection. Orders created via existing `createOrderBothSystems()`.

**Tech Stack:** Node.js/Express, Meta WhatsApp Cloud API v22.0, Claude API (@anthropic-ai/sdk), PostgreSQL, Vanilla JS frontend

---

### Task 1: Add WhatsApp Database Tables

**Files:**
- Modify: `backend/shared/init-database.js` (append before the closing backtick of `createTablesSQL` at ~line 278)

**Step 1: Add migration SQL to init-database.js**

Add these tables before the VIEWS section (before line 282 `-- VIEWS FOR COMMON QUERIES`):

```sql
-- =====================================================
-- WHATSAPP CONVERSATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id SERIAL PRIMARY KEY,
  wa_id VARCHAR(50) UNIQUE NOT NULL,
  client_name VARCHAR(255),
  client_id INTEGER REFERENCES clients(id),
  status VARCHAR(30) DEFAULT 'active',
  intent VARCHAR(50),
  ai_summary TEXT,
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_wa_id ON whatsapp_conversations(wa_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON whatsapp_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_client ON whatsapp_conversations(client_id);

-- =====================================================
-- WHATSAPP MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wa_message_id VARCHAR(100) UNIQUE,
  direction VARCHAR(10) NOT NULL,
  sender VARCHAR(10) NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON whatsapp_messages(created_at);
```

**Step 2: Run migration manually to add tables to existing DB**

Run:
```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/vt-souvenir-system/backend
node -e "
import { query } from './shared/database.js';
const sql = \`
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id SERIAL PRIMARY KEY,
  wa_id VARCHAR(50) UNIQUE NOT NULL,
  client_name VARCHAR(255),
  client_id INTEGER REFERENCES clients(id),
  status VARCHAR(30) DEFAULT 'active',
  intent VARCHAR(50),
  ai_summary TEXT,
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_wa_id ON whatsapp_conversations(wa_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON whatsapp_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_client ON whatsapp_conversations(client_id);
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wa_message_id VARCHAR(100) UNIQUE,
  direction VARCHAR(10) NOT NULL,
  sender VARCHAR(10) NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON whatsapp_messages(created_at);
\`;
await query(sql);
console.log('Tables created');
process.exit(0);
"
```
Expected: "Tables created"

**Step 3: Commit**

```bash
git add backend/shared/init-database.js
git commit -m "feat: add whatsapp_conversations and whatsapp_messages tables"
```

---

### Task 2: Add WhatsApp Environment Variables

**Files:**
- Modify: `backend/.env.example` (append section)
- Modify: `backend/.env` (add actual values)

**Step 1: Add to .env.example**

Append to the end of `.env.example`:
```env
# ===================================
# WHATSAPP BUSINESS API CONFIGURATION
# ===================================
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_VERIFY_TOKEN=your_custom_verify_token
WHATSAPP_APP_SECRET=your_app_secret_for_signature_verification
```

**Step 2: Add actual values to .env**

Add to the actual `.env`:
```env
# ===================================
# WHATSAPP BUSINESS API CONFIGURATION
# ===================================
WHATSAPP_ACCESS_TOKEN=EAAIn15EPMJoBQ...  (the full token from Meta)
WHATSAPP_PHONE_NUMBER_ID=689101864297346
WHATSAPP_BUSINESS_ACCOUNT_ID=812957161059963
WHATSAPP_VERIFY_TOKEN=axkan_wa_verify_2026
```

**Step 3: Commit (only .env.example, NOT .env)**

```bash
git add backend/.env.example
git commit -m "feat: add WhatsApp API env vars to .env.example"
```

---

### Task 3: Create WhatsApp AI Conversation Engine

**Files:**
- Create: `backend/services/whatsapp-ai.js`

**Step 1: Create the AI conversation engine**

This file handles:
- Building conversation context from DB history
- Calling Claude with AXKAN brand voice system prompt
- Parsing Claude's response for intent + actions (order creation)
- Fetching product catalog for context

Key functions:
- `processIncomingMessage(conversationId, waId, messageText)` → returns `{ reply, intent, orderData? }`
- `getSystemPrompt()` → builds AXKAN brand voice prompt with product catalog
- `buildConversationHistory(conversationId)` → loads last 20 messages
- `detectAndExecuteAction(aiResponse, conversationId, waId)` → if Claude signals order creation, calls `createOrderBothSystems()`

System prompt must include:
- AXKAN brand voice: friendly, Mexican Spanish, short messages (1-3 sentences max)
- Product catalog from DB: `SELECT name, base_price, description, category FROM products WHERE is_active = true`
- Instruction to collect: client name, product, quantity, event type (optional), delivery date, shipping address
- Tool-use pattern: when all info collected, output a JSON block `{"action":"create_order","data":{...}}` that the engine parses
- Minimum order quantities and pricing tiers if applicable
- Response to status inquiries by querying orders table

**Step 2: Commit**

```bash
git add backend/services/whatsapp-ai.js
git commit -m "feat: add WhatsApp AI conversation engine with AXKAN brand voice"
```

---

### Task 4: Create WhatsApp Routes (Webhook + API)

**Files:**
- Create: `backend/api/whatsapp-routes.js`

**Step 1: Create the webhook and API routes**

This file handles:
1. **GET `/webhook`** - Meta webhook verification (no auth required)
   - Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`
   - Verify token matches `WHATSAPP_VERIFY_TOKEN`
   - Return `hub.challenge` as plain text on success
   - Return 403 on failure

2. **POST `/webhook`** - Receive incoming messages (no auth required)
   - Parse Meta webhook payload: `body.entry[0].changes[0].value`
   - Extract message: `value.messages[0]` (text, image, etc.)
   - Extract sender: `value.contacts[0]` (name, wa_id)
   - Dedup by `wa_message_id` (ignore if already in DB)
   - Get or create conversation in `whatsapp_conversations`
   - Store inbound message in `whatsapp_messages`
   - Call `whatsappAI.processIncomingMessage()` to get AI reply
   - Send reply via Meta Cloud API: `POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages`
   - Store outbound message in `whatsapp_messages`
   - Update conversation: `last_message_at`, `intent`, `unread_count++`
   - Always return 200 to Meta (even on errors, to avoid retries)

3. **GET `/conversations`** - List conversations (auth required)
   - Returns all conversations sorted by `last_message_at DESC`
   - Includes latest message preview
   - Used by dashboard

4. **GET `/conversations/:id/messages`** - Get messages for a conversation (auth required)
   - Returns all messages for conversation sorted by `created_at ASC`
   - Used by dashboard chat view

5. **POST `/conversations/:id/reply`** - Admin manual reply (auth required)
   - Sends message as admin (bypasses AI)
   - Stores with `sender: 'admin'`
   - Sends via Meta API

6. **PUT `/conversations/:id/read`** - Mark conversation as read (auth required)
   - Sets `unread_count = 0`

Helper function for sending WhatsApp messages:
```javascript
async function sendWhatsAppMessage(to, text) {
  const response = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      })
    }
  );
  return response.json();
}
```

**Important:** The GET and POST `/webhook` endpoints must NOT use `authMiddleware` - Meta needs unauthenticated access. All other endpoints use `authMiddleware` from `admin-routes.js`.

**Step 2: Commit**

```bash
git add backend/api/whatsapp-routes.js
git commit -m "feat: add WhatsApp webhook routes and conversation API"
```

---

### Task 5: Mount WhatsApp Routes in Server

**Files:**
- Modify: `backend/api/server.js` (lines ~18 and ~363)

**Step 1: Add import**

After line 30 (`import leadRoutes from './lead-routes.js';`), add:
```javascript
import whatsappRoutes from './whatsapp-routes.js';
```

**Step 2: Mount route**

After line 363 (`app.use('/api/leads', leadRoutes);`), add:
```javascript
app.use('/api/whatsapp', whatsappRoutes);
```

**Step 3: Verify server starts**

Run:
```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/vt-souvenir-system/backend
node -e "import('./api/server.js')" 2>&1 | head -20
```
Expected: Server starts without import errors

**Step 4: Commit**

```bash
git add backend/api/server.js
git commit -m "feat: mount WhatsApp routes on /api/whatsapp"
```

---

### Task 6: Create Dashboard WhatsApp UI Module

**Files:**
- Create: `frontend/admin-dashboard/whatsapp.js`

**Step 1: Create the WhatsApp dashboard module**

This module follows the same pattern as `leads.js`:

State:
```javascript
const whatsappState = {
  conversations: [],
  activeConversation: null,
  messages: [],
  loaded: false,
  pollInterval: null
};
```

Functions:
- `loadWhatsAppConversations()` → `GET /api/whatsapp/conversations`
- `renderConversationList()` → left panel: list of conversations with preview, intent badge, unread badge, timestamp
- `openConversation(id)` → loads messages, renders chat view, marks as read
- `renderMessages(messages)` → right panel: chat bubble UI (client left, ai/admin right)
- `sendAdminReply(conversationId, text)` → `POST /api/whatsapp/conversations/:id/reply`
- `startPolling()` → refresh conversations every 5 seconds
- `stopPolling()` → clear interval when navigating away
- `getIntentBadge(intent)` → returns HTML badge: order=green, pricing=blue, question=yellow, complaint=red

UI layout (split panel):
```
┌──────────────────────────────────────────┐
│ Conversaciones WhatsApp    [🔍 Buscar]   │
├──────────────┬───────────────────────────┤
│ Conv list    │  Chat messages            │
│ - Name       │  [bubble] [bubble]        │
│ - Preview    │  [bubble] [bubble]        │
│ - Intent     │                           │
│ - Time       │  ┌─────────────────────┐  │
│              │  │ Escribe un mensaje  │  │
│              │  └─────────────────────┘  │
├──────────────┴───────────────────────────┤
│ AI Summary: "Cliente quiere 200 imanes..." │
└──────────────────────────────────────────┘
```

Styles: inline in the JS (same pattern as other modules), using AXKAN colors (#e72a88 for accents).

**Step 2: Commit**

```bash
git add frontend/admin-dashboard/whatsapp.js
git commit -m "feat: add WhatsApp conversations UI module for admin dashboard"
```

---

### Task 7: Add WhatsApp Tab to Dashboard Sidebar + Load Script

**Files:**
- Modify: `frontend/admin-dashboard/index.html`

**Step 1: Add sidebar nav item**

After the "Clients" button (line ~210, the `data-view="leads"` button), add:

```html
<button class="nav-item" data-view="whatsapp" tabindex="0">
    <i data-lucide="message-circle" class="nav-icon"></i>
    <span>WhatsApp</span>
    <span class="whatsapp-unread-badge" id="wa-unread-badge" style="display:none;background:#e72a88;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;display:inline-flex;align-items:center;justify-content:center;margin-left:auto;"></span>
</button>
```

**Step 2: Add content container**

Find the main content area where other views have their containers (search for `id="leads-container"` to see the pattern). Add a WhatsApp view container:

```html
<!-- WhatsApp Conversations View -->
<div class="view-content" id="whatsapp-view" style="display:none;">
    <div id="whatsapp-container"></div>
</div>
```

**Step 3: Add script tag**

After `<script src="leads.js"></script>` (around the bottom script tags), add:
```html
<script src="whatsapp.js"></script>
```

**Step 4: Wire up view switching**

In `dashboard.js`, there's a view switching function. Find where `data-view` attributes are handled (search for `showView` or `data-view` click handlers). Ensure the `whatsapp` view triggers `loadWhatsAppConversations()` when activated and `stopPolling()` when deactivated.

This may require adding to the existing switch/if-else in the view handler:
```javascript
case 'whatsapp':
  loadWhatsAppConversations();
  break;
```

**Step 5: Commit**

```bash
git add frontend/admin-dashboard/index.html frontend/admin-dashboard/dashboard.js
git commit -m "feat: add WhatsApp tab to admin dashboard sidebar"
```

---

### Task 8: Test End-to-End Locally

**Step 1: Start the server**

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/vt-souvenir-system/backend
npm run dev
```

**Step 2: Test webhook verification**

```bash
curl "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=axkan_wa_verify_2026&hub.challenge=test123"
```
Expected: `test123` (plain text response)

**Step 3: Test simulated incoming message**

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "contacts": [{"profile": {"name": "Test User"}, "wa_id": "5215512345678"}],
          "messages": [{
            "from": "5215512345678",
            "id": "wamid.test123",
            "timestamp": "1708000000",
            "type": "text",
            "text": {"body": "Hola, me interesan sus imanes"}
          }]
        }
      }]
    }]
  }'
```
Expected: 200 OK, message stored in DB, Claude generates response

**Step 4: Test dashboard API**

```bash
curl http://localhost:3000/api/whatsapp/conversations \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```
Expected: JSON with the test conversation

**Step 5: Test dashboard UI**

Open `http://localhost:3000/admin` in browser, click WhatsApp tab, verify conversation appears.

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during local testing"
```

---

### Task 9: Deploy to Render and Configure Meta Webhook

**Step 1: Push to main (triggers Render deploy)**

```bash
git push origin main
```

Wait for Render deployment to complete (~2-5 min).

**Step 2: Verify webhook endpoint is live**

```bash
curl "https://vt-souvenir-backend.onrender.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=axkan_wa_verify_2026&hub.challenge=alive"
```
Expected: `alive`

**Step 3: Configure webhook in Meta Developer Portal**

1. Go to developers.facebook.com → Make Automation app → WhatsApp → Configuración
2. Under "Webhooks", click "Configurar webhooks" (or "Editar" if already configured)
3. Enter:
   - **URL de devolución de llamada:** `https://vt-souvenir-backend.onrender.com/api/whatsapp/webhook`
   - **Token de verificación:** `axkan_wa_verify_2026`
4. Click "Verificar y guardar"
5. Subscribe to webhook fields: check **messages** (required)

**Step 4: Add WhatsApp env vars on Render**

In the Render dashboard for `vt-souvenir-backend`:
1. Go to Environment → Add the 4 WhatsApp env vars
2. Trigger a manual deploy or wait for it to pick up

**Step 5: Send a test message**

From a phone (must be added as test number in Meta if still in development mode), send a WhatsApp message to +52 15633830500.

Verify:
- Message appears in server logs
- AI responds on WhatsApp
- Conversation appears on admin dashboard

---

### Task 10: Final Polish and Production Token

**Step 1: Generate permanent System User token**

In Meta Business Settings:
1. Go to business.facebook.com → Settings → System Users
2. Create a system user (if not exists)
3. Assign WhatsApp Business assets
4. Generate a permanent token with `whatsapp_business_messaging` permission
5. Replace the temporary token in Render env vars

**Step 2: Test with real message**

Send a real WhatsApp message and verify full flow works.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: WhatsApp AI assistant V1 complete"
```

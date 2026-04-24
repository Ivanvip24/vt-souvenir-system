# AXKAN Ecosystem Overhaul — Master Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the AXKAN Master Playbook (12 Laws, Definition of Done, Blast Radius Containment, Observability) across the entire AXKAN ecosystem — starting with the brain system, then radiating outward.

**Architecture:** Atomic commits. Every change is one concept: one file renamed, one URL extracted, one timeout added. Never batch unrelated changes. Always verify before committing.

**Tech Stack:** Node.js (ES modules), Express, PostgreSQL, WhatsApp Cloud API, Notion API, Resend, various external APIs.

**Methodology:** Change → Verify → Commit → Repeat. If anything breaks, `git revert HEAD` and rethink.

---

## Landscape (22 projects, 3 tiers)

| Tier | Project | Location | What it is |
|------|---------|----------|------------|
| **A - Core** | axkan_brain_system | BETA_PHASE | Backend brain: orders, WhatsApp bot, analytics, shipping, design portal |
| **A - Core** | axkan-website | BETA_PHASE | Next.js 16 marketing site + e-commerce |
| **B - Tools** | facebook-marketplace-bot | BETA_PHASE | Python Selenium FB listing automation |
| **B - Tools** | ORDERS_GENERATOR | BETA_PHASE | PDF + Notion order sheet generator |
| **B - Tools** | PRINTING_PJ | BETA_PHASE | Auto-print + Illustrator dual-save |
| **B - Tools** | SOCIAL_MEDIA | BETA_PHASE | Python social media content studio |
| **B - Tools** | SPELLING_CHECKER | READY | PDF Spanish spell checker with Claude |
| **B - Tools** | PROMPT_ENGENERING | READY | AI image generation + Canva |
| **B - Tools** | ARDUINO | BETA_PHASE | Physical arcade button → order creation |
| **B - Tools** | RESPALDO | BETA_PHASE | macOS backup + Google Drive sync |
| **C - Scripts** | PREPARACION_ARMADO | BETA_PHASE | Illustrator JSX rasterizer |
| **C - Scripts** | ARMADOS | BETA_PHASE | Illustrator trim/assembly scripts |
| **C - Scripts** | SOCIAL_MEDIA_GENERATOR | BETA_PHASE | Email signature + social assets |
| **C - Scripts** | ILLUSTRATOR | BETA_PHASE | Brand asset library (design files) |
| **D - Duplicates** | ORDERS_GENERATOR | READY | 95% duplicate of BETA_PHASE version |
| **D - Duplicates** | SOCIAL_MEDIA_STUDIO | READY | Mirror of all BETA_PHASE projects |
| **D - Empty** | INSTRUCTION_GENERATOR | BETA_PHASE | Empty placeholder |
| **D - Empty** | EDUARDO_INOVATOXIC | BETA_PHASE | Empty/archived |

---

## Phase 0: Emergency — Secrets & Safety (Day 1)

> **WHY FIRST:** Production API keys, banking CLABE, WhatsApp tokens are committed in `.env`. If this repo is ever shared, pushed, or compromised, everything leaks.

### Task 0.1: Verify .env is gitignored

**Files:**
- Check: `backend/.gitignore`
- Check: `.gitignore` (root)

**Steps:**
1. `grep -n "\.env" backend/.gitignore .gitignore`
2. If `.env` is NOT in gitignore, add it
3. Commit: `chore: ensure .env is gitignored`

### Task 0.2: Remove .env from git tracking (if tracked)

**Steps:**
1. `git ls-files backend/.env` — if output shows the file, it's tracked
2. `git rm --cached backend/.env` — remove from tracking WITHOUT deleting file
3. Commit: `security: remove .env from git tracking`
4. Verify: `git ls-files backend/.env` should return empty

### Task 0.3: Create .env.example if missing or outdated

**Steps:**
1. Read current `backend/.env` 
2. Read current `backend/.env.example`
3. Compare — ensure .env.example has every key with placeholder values (never real secrets)
4. Update .env.example with any missing keys
5. Commit: `docs: sync .env.example with all required env vars`

### Task 0.4: Audit for secrets in other files

**Steps:**
1. `grep -rn "secret_\|sk-\|key-\|Bearer \|xoxb-" backend/ --include="*.js" -l`
2. Check each hit — is it reading from env or hardcoded?
3. If hardcoded, extract to .env
4. Commit per file: `security: extract hardcoded secret from <filename>`

---

## Phase 1: Dependencies — Pin Everything (Day 1)

### Task 1.1: Pin all package.json versions

**Files:**
- Modify: `backend/package.json`

**Steps:**
1. Read `backend/package.json`
2. For every dependency, remove `^` and `~` prefixes (e.g., `"^4.18.2"` → `"4.18.2"`)
3. Do the same for devDependencies
4. `cd backend && npm install` — verify nothing breaks
5. `npm start` — verify server starts (Ctrl+C after health check)
6. Commit: `chore: pin all dependency versions (L2)`

### Task 1.2: Verify lock file is committed

**Steps:**
1. `git ls-files backend/package-lock.json`
2. If not tracked: `git add backend/package-lock.json`
3. Commit: `chore: track package-lock.json`

---

## Phase 2: Hardcoded URLs → Environment Variables (Day 1-2)

> One file per commit. Verify server starts after each change.

### Task 2.1: Extract CORS origins to env var

**Files:**
- Modify: `backend/api/server.js` (~lines 90-115)
- Modify: `backend/.env.example`

**Steps:**
1. Read the ALLOWED_ORIGINS array in server.js
2. Add to .env: `ALLOWED_ORIGINS=https://app.axkan.art,https://pedidos.axkan.art,...`
3. Add to .env.example: `ALLOWED_ORIGINS=https://app.axkan.art,https://pedidos.axkan.art`
4. Replace hardcoded array with: `const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);`
5. Keep localhost fallbacks for dev
6. Test: `npm start`, verify CORS still works
7. Commit: `refactor: extract CORS origins to env var (L3)`

### Task 2.2: Extract T1 Envíos URLs

**Files:**
- Modify: `backend/services/t1-envios-service.js` (lines 7-9)
- Modify: `backend/.env.example`

**Steps:**
1. Move `T1_TRACKING_BASE`, `T1_PRODUCTS_BASE`, `T1_STORE_ID` to .env
2. Read from `process.env.*` with current values as defaults
3. Update .env.example
4. Test: verify server starts
5. Commit: `refactor: extract T1 Envíos URLs to env vars (L3)`

### Task 2.3: Extract Banxico CEP URL

**Files:**
- Modify: `backend/services/cep-service.js` (line 13)

**Steps:**
1. `const BASE_URL = process.env.BANXICO_CEP_URL || 'https://www.banxico.org.mx/cep';`
2. Update .env.example
3. Commit: `refactor: extract Banxico CEP URL to env var (L3)`

### Task 2.4: Extract Gemini endpoint

**Files:**
- Modify: `backend/services/gemini-image.js` (line 8)

**Steps:**
1. Extract base URL to env, keep model interpolation
2. Commit: `refactor: extract Gemini API URL to env var (L3)`

### Task 2.5: Extract MercadoLibre URLs

**Files:**
- Modify: `backend/services/mercadolibre.js` (lines 19-20)

**Steps:**
1. Extract ML_API_URL and ML_AUTH_URL to env with current values as defaults
2. Commit: `refactor: extract MercadoLibre URLs to env vars (L3)`

### Task 2.6: Extract Nominatim URL

**Files:**
- Modify: `backend/api/server.js` (~line 5362)

**Steps:**
1. Extract geocoding API base URL to env
2. Commit: `refactor: extract Nominatim URL to env var (L3)`

---

## Phase 3: Timeouts on All External Calls (Day 2-3)

> **Rule:** Every `fetch()` to an external API gets a 30-second timeout via AbortController. One file per commit.

### Task 3.0: Create shared timeout utility

**Files:**
- Create: `backend/shared/fetch-with-timeout.js`

**Steps:**
1. Create utility:
```javascript
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
```
2. Commit: `feat: add fetchWithTimeout utility (circuit breaker L4)`

### Task 3.1: Add timeout to WhatsApp API calls

**Files:**
- Modify: `backend/services/whatsapp-api.js`

**Steps:**
1. Import fetchWithTimeout
2. Replace bare `fetch()` calls with `fetchWithTimeout()`
3. Test: send a test WhatsApp message
4. Commit: `fix: add 30s timeout to WhatsApp API calls`

### Task 3.2: Add timeout to T1 Envíos calls

**Files:** `backend/services/t1-envios-service.js`
- Same pattern. Commit: `fix: add 30s timeout to T1 Envíos API calls`

### Task 3.3: Add timeout to MercadoLibre calls

**Files:** `backend/services/mercadolibre.js`
- Same pattern. Commit: `fix: add 30s timeout to MercadoLibre API calls`

### Task 3.4: Add timeout to Banxico CEP calls

**Files:** `backend/services/cep-service.js`
- Same pattern. Commit: `fix: add 30s timeout to Banxico CEP calls`

### Task 3.5: Add timeout to Nominatim/Sepomex calls

**Files:** `backend/api/server.js` (geocoding section)
- Same pattern. Commit: `fix: add 30s timeout to geocoding API calls`

### Task 3.6: Add timeout to Skydropx calls

**Files:** `backend/services/skydropx.js`
- Same pattern. Commit: `fix: add 30s timeout to Skydropx API calls`

### Task 3.7: Verify Notion SDK has timeout configured

**Steps:**
1. Check if `@notionhq/client` initialization includes timeout option
2. Add if missing: `const notion = new Client({ auth: token, timeoutMs: 30000 })`
3. Commit: `fix: add 30s timeout to Notion client`

---

## Phase 4: Structured Logging (Day 3-4)

### Task 4.0: Create centralized logger

**Files:**
- Create: `backend/shared/logger.js`

**Steps:**
1. Create structured logger:
```javascript
import { createWriteStream } from 'fs';

export function log(level, event, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields
  };
  const line = JSON.stringify(record);
  process.stdout.write(line + '\n');
}

export const logger = {
  info: (event, fields) => log('info', event, fields),
  warn: (event, fields) => log('warn', event, fields),
  error: (event, fields) => log('error', event, fields),
  debug: (event, fields) => log('debug', event, fields),
};
```
2. Commit: `feat: add structured JSON logger (L11)`

### Task 4.1–4.N: Migrate console.log → logger (one file per commit)

**Order of migration (highest traffic first):**
1. `backend/api/server.js` — main request logging
2. `backend/services/whatsapp-api.js` — WhatsApp message logging
3. `backend/services/whatsapp-ai.js` — AI response logging
4. `backend/agents/analytics-agent/email-sender.js` — email logging
5. `backend/services/t1-envios-service.js` — shipping logging
6. `backend/services/cep-service.js` — CEP logging
7. `backend/services/mercadolibre.js` — ML logging
8. `backend/services/designer-scheduler.js` — scheduler logging
9. `backend/services/sales-coach.js` — sales logging
10. `backend/services/sales-insights-engine.js` — insights logging
11. `backend/services/sales-learning-engine.js` — learning logging
12. `backend/shared/database.js` — DB query logging
13. All remaining files with console.log

**Per file pattern:**
1. `import { logger } from '../shared/logger.js';`
2. Replace `console.log(...)` → `logger.info(event, { details })`
3. Replace `console.error(...)` → `logger.error(event, { error: err.message })`
4. Remove emoji prefixes (they don't render in log aggregators)
5. Test: `npm start`, trigger relevant functionality
6. Commit: `refactor: structured logging in <filename> (L11)`

---

## Phase 5: Organize Admin Scripts (Day 4)

### Task 5.1: Move scattered scripts to backend/scripts/

**Steps (one commit per move):**
1. `git mv backend/add-barcodes.js backend/scripts/add-barcodes.js`
2. Commit: `chore: move add-barcodes.js to scripts/ (L12)`
3. Repeat for each of the ~25 scattered scripts:
   - `add-image-url-column.js`
   - `add-products.js`
   - `check-*.js` (5 files)
   - `create-view.js`
   - `fix-*.js` (3 files)
   - `inspect-page.js`
   - `run-inventory-migration.js`
   - `run-migration-*.js`
   - etc.
4. After all moves: verify no imports reference old paths
5. `grep -rn "require.*\./" backend/scripts/` — check for broken relative imports
6. Fix any broken paths
7. Commit: `fix: update relative imports in moved scripts`

### Task 5.2: Create scripts/README.md index

**Steps:**
1. Create a one-line description of each script
2. Commit: `docs: add scripts directory index`

---

## Phase 6: Consolidate Duplicates (Day 5)

### Task 6.1: Archive READY/ORDERS_GENERATOR (duplicate)

**Steps:**
1. Verify BETA_PHASE version is the primary (more recent changes)
2. Create `READY/ORDERS_GENERATOR/ARCHIVED.md` noting it's a duplicate
3. Or: `rm -rf READY/ORDERS_GENERATOR` if user confirms
4. Commit: `chore: archive duplicate ORDERS_GENERATOR`

### Task 6.2: Clarify READY/SOCIAL_MEDIA_STUDIO (mirror)

**Steps:**
1. Check if it's actively used or just a backup
2. Add `ARCHIVED.md` or remove based on user decision
3. Commit: `chore: clarify SOCIAL_MEDIA_STUDIO status`

### Task 6.3: Remove empty projects

**Steps:**
1. Remove INSTRUCTION_GENERATOR (empty)
2. Remove EDUARDO_INOVATOXIC (empty)
3. Commit: `chore: remove empty placeholder directories`

---

## Phase 7: CLAUDE.md for Every Project (Day 5-6)

> The Playbook says: "This is the file Claude reads every time it works in this folder."

### Task 7.1–7.N: Add CLAUDE.md to each project missing one

**Projects needing CLAUDE.md:**
1. `axkan-website/` — Next.js site conventions
2. `facebook-marketplace-bot/` — Python bot conventions
3. `SOCIAL_MEDIA/` — Content studio conventions
4. `ORDERS_GENERATOR/` — PDF generator conventions
5. `PRINTING_PJ/` — Print automation conventions
6. `PROMPT_ENGENERING/` — Image generation conventions
7. `SPELLING_CHECKER/` — Spell checker conventions
8. `ARDUINO/` — Hardware integration conventions
9. `RESPALDO/` — Backup system conventions

**Per project:**
1. Read the project's key files to understand conventions
2. Write CLAUDE.md with: purpose, key files, commands, rules
3. Commit: `docs: add CLAUDE.md to <project-name>`

---

## Phase 8: axkan_brain_system Deep Cleanup (Day 6-10)

> This is the biggest phase. server.js alone is 5400+ lines.

### Task 8.1: Identify route groups in server.js

**Steps:**
1. Read server.js and catalog all route groups
2. Document in a scratch file: which lines = which routes
3. No commit (research only)

### Task 8.2–8.N: Extract route groups to route files (one per commit)

**Pattern:**
1. Cut route group from server.js
2. Create `backend/api/<domain>-routes.js`
3. Import and mount in server.js: `app.use('/api/<domain>', domainRoutes);`
4. Test: `curl` the affected endpoints
5. Commit: `refactor: extract <domain> routes from server.js`

**Expected extractions:**
- Order routes → `order-routes.js` (if not already)
- Client routes → `client-routes.js` (if not already)
- Shipping routes → `shipping-routes.js` (if not already)
- Report routes → `report-routes.js`
- Design portal routes → already in `design-portal-routes.js`
- WhatsApp routes → already in `whatsapp-routes.js`
- Price routes → already in `price-routes.js`
- Analytics routes
- Geocoding routes
- Static file serving config

### Task 8.3: Remove dead code

**Steps:**
1. Search for `// TODO`, `// FIXME`, commented-out code blocks
2. Remove dead code (not commented references — actual dead blocks)
3. One commit per file: `chore: remove dead code from <filename>`

---

## Phase 9: .env Standardization Across Projects (Day 10)

### Task 9.1: Create .env.example for every project that uses env vars

**Projects:**
- facebook-marketplace-bot (Python — needs .env for credentials)
- SOCIAL_MEDIA (if it uses API keys)
- PROMPT_ENGENERING (if it uses API keys)
- axkan-website (Next.js — .env.local)

### Task 9.2: Add .env to .gitignore in every project

---

## Phase 10: Testing Foundation (Day 10-12)

### Task 10.1: Create test infrastructure for axkan_brain_system

**Steps:**
1. Ensure test runner is configured (jest or vitest)
2. Create first smoke test: health endpoint
3. Commit: `test: add health check smoke test`

### Task 10.2: Add integration test for critical path

**Steps:**
1. Test order creation flow (with mock DB)
2. Test WhatsApp webhook handler
3. One commit per test file

---

## Phase 11: Frontend Component System Cleanup (Day 12-14)

### Task 11.1: Audit build.js and component system

### Task 11.2: Ensure all pages use component placeholders correctly

### Task 11.3: Remove orphaned HTML files

---

## Execution Rules (from the Playbook)

1. **One concept per commit.** Renaming a variable is a commit. Extracting a URL is a commit. Never mix.
2. **Verify after every change.** `npm start` must not crash. `curl /health` must return 200.
3. **If something breaks, revert immediately.** `git revert HEAD`. Don't debug on top of a broken state.
4. **If a phase touches more than 3 files at once, stop and re-plan.** Split into smaller tasks.
5. **Commit message format:** `<type>: <what> (<why/playbook-rule>)`
   - `security: remove .env from git tracking`
   - `refactor: extract T1 URLs to env vars (L3)`
   - `fix: add 30s timeout to WhatsApp API (L4)`
   - `chore: move add-barcodes.js to scripts/ (L12)`

---

## Progress Tracking

| Phase | Tasks | Status |
|-------|-------|--------|
| 0 - Secrets & Safety | 4 | NOT STARTED |
| 1 - Pin Dependencies | 2 | NOT STARTED |
| 2 - Hardcoded URLs | 6 | NOT STARTED |
| 3 - Timeouts | 8 | NOT STARTED |
| 4 - Structured Logging | ~15 | NOT STARTED |
| 5 - Organize Scripts | 2 | NOT STARTED |
| 6 - Consolidate Duplicates | 3 | NOT STARTED |
| 7 - CLAUDE.md Everywhere | ~9 | NOT STARTED |
| 8 - server.js Decomposition | ~10 | NOT STARTED |
| 9 - .env Standardization | 2 | NOT STARTED |
| 10 - Testing Foundation | 2 | NOT STARTED |
| 11 - Frontend Cleanup | 3 | NOT STARTED |

**Estimated total commits: ~80-120**
**Estimated total time: 10-14 focused sessions**

---

## What this plan does NOT cover (future phases)

- Database schema migrations or restructuring
- Rewriting WhatsApp AI logic
- New features
- Mobile app
- CI/CD pipeline setup
- Horizontal scaling (requires completing L6 fixes first)
- Performance optimization

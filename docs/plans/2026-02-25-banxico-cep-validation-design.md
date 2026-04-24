# Banxico CEP Transfer Validation Module

**Date:** 2026-02-25
**Status:** Approved
**Approach:** A — Integrated into existing payment verification pipeline

## Problem

When customers pay via SPEI bank transfer, they upload a screenshot. Claude Vision analyzes it and auto-approves if it looks legitimate. But screenshots can be faked. There's no verification that the transfer actually happened in the national banking system.

## Solution

Add a second verification layer that queries Banxico's CEP (Comprobante Electronico de Pago) system directly. After Claude Vision extracts transfer details from the screenshot, we POST those details to `banxico.org.mx/cep/valida.do` to confirm the transfer exists.

## Architecture

### Data Flow

```
Customer uploads screenshot
  → Claude Vision extracts: amount, date, folio (clave_rastreo), source_bank
  → cep-service.validateTransfer() POSTs to Banxico
  → Result stored in cep_verifications table
  → If both Vision + CEP pass → auto-approve, download CEP PDF to Google Drive
  → If Vision passes but CEP fails → mark pending_retry, cron retries later
  → If all retries fail → stays not_found, admin handles manually
```

### New File: `backend/services/cep-service.js`

Standalone module that communicates with Banxico's CEP web application.

**Responsibilities:**
1. Session management — GET to `/cep/` to establish cookies, then POST with session
2. `validateTransfer()` — POSTs to `/cep/valida.do` with transfer parameters
3. Response parsing — Parses HTML response (success page vs error page)
4. `downloadCEP(format)` — GETs `/cep/descarga.do?formato=PDF|XML` for official proof
5. Bank code mapping — Maps human-readable names ("BBVA") to Banxico codes ("40012")

**Function signature:**
```javascript
validateTransfer({
  fecha,          // 'DD-MM-YYYY'
  claveRastreo,   // tracking key from screenshot
  emisor,         // sender bank code (e.g. '40012')
  receptor,       // receiver bank code - defaults to BBVA '40012'
  cuenta,         // beneficiary CLABE - defaults to AXKAN's CLABE
  monto           // amount in pesos (e.g. 500.00)
})
→ { found: true/false, details: {...}, error: null }
```

**Banxico CEP form parameters (from DOM inspection):**
| Parameter | Field | Notes |
|-----------|-------|-------|
| `fecha` | Date | Format: DD-MM-YYYY |
| `tipoCriterio` | Search type | `T` = clave rastreo, `R` = referencia |
| `criterio` | Tracking key or reference | The actual search value |
| `emisor` | Sender bank code | Numeric (e.g. `40012` for BBVA) |
| `receptor` | Receiver bank code | Numeric |
| `cuenta` | Beneficiary account | CLABE, debit card, or phone |
| `monto` | Amount | In pesos with decimals |
| `captcha` | CAPTCHA value | Hardcode `'c'` (not enforced for direct POST) |
| `tipoConsulta` | Query type | `1` for validation |

### Modified File: `backend/services/payment-receipt-verifier.js`

After Vision returns its analysis, if `folio_number` (clave de rastreo) was extracted:

```
Vision result
  ↓ has folio_number?
  ├─ YES → call cep-service.validateTransfer()
  │        ├─ Banxico confirms → AUTO_APPROVE (high confidence)
  │        │   └─ download CEP PDF → upload to Google Drive → store URL
  │        ├─ Banxico not found → insert pending_retry in cep_verifications
  │        │   └─ fall back to Vision-only decision for now
  │        └─ Banxico error → skip CEP, fall back to Vision-only
  └─ NO  → keep current behavior (approve based on Vision alone)
```

CEP validation is additive — never blocks Vision-only approvals, only strengthens or flags.

### New Table: `cep_verifications`

```sql
CREATE TABLE IF NOT EXISTS cep_verifications (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  payment_id INTEGER REFERENCES payments(id),
  clave_rastreo VARCHAR(100),
  fecha_operacion DATE,
  emisor_code VARCHAR(10),
  emisor_name VARCHAR(100),
  receptor_code VARCHAR(10),
  receptor_name VARCHAR(100),
  monto DECIMAL(12, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- status values: 'found', 'not_found', 'error', 'pending_retry'
  banxico_response JSONB,
  cep_pdf_url VARCHAR(500),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cep_verifications_order ON cep_verifications(order_id);
CREATE INDEX idx_cep_verifications_retry ON cep_verifications(status, next_retry_at)
  WHERE status = 'pending_retry';
```

### Retry Queue (via node-cron)

Banxico CEP can take up to 30 minutes to register a transfer after it's processed.

**Schedule:** Runs every 5 minutes
**Query:** `SELECT * FROM cep_verifications WHERE status = 'pending_retry' AND next_retry_at <= NOW()`

**Retry backoff:**
| Attempt | Delay | Total elapsed |
|---------|-------|---------------|
| 1 | 5 min | 5 min |
| 2 | 15 min | 20 min |
| 3 | 30 min | 50 min |
| 4 | 1 hr | 1 hr 50 min |

After 4 failed retries → status set to `not_found`, admin notified.

If found on retry:
1. Update `cep_verifications.status = 'found'`
2. Download CEP PDF → upload to Google Drive → store URL
3. If order is still pending approval → auto-approve it
4. Log to `orders.internal_notes`

### CEP PDF Storage

When Banxico confirms a transfer:
1. Call `GET /cep/descarga.do?formato=PDF` using the same session
2. Upload PDF to Google Drive via existing `uploadToGoogleDrive()` utility
3. Store the Drive URL in `cep_verifications.cep_pdf_url`

This gives official Banxico-signed proof alongside the customer's screenshot.

### Bank Code Mapping

Map from Claude Vision's extracted bank name to Banxico's numeric code:

```javascript
const BANK_CODES = {
  'BBVA': '40012',
  'SANTANDER': '40014',
  'BANAMEX': '40002',
  'BANORTE': '40072',
  'HSBC': '40021',
  'SCOTIABANK': '40044',
  'BANCO AZTECA': '40127',
  'BANREGIO': '40058',
  'STP': '90646',
  'MERCADO PAGO': '90722',
  // ... extend as needed
};
```

### AXKAN Defaults

```javascript
const AXKAN_DEFAULTS = {
  receptor: '40012',           // BBVA
  cuenta: process.env.AXKAN_CLABE,  // From .env
};
```

### Environment Variables

```env
AXKAN_CLABE=012...             # AXKAN's CLABE for receiving payments
AXKAN_BANK_CODE=40012          # BBVA
CEP_RETRY_ENABLED=true         # Enable/disable retry cron
CEP_MAX_RETRIES=4              # Max retry attempts
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Banxico down/timeout | Skip CEP, use Vision-only, log warning |
| Rate limited | Skip CEP, use Vision-only, log warning |
| Vision didn't extract clave | Skip CEP entirely |
| Bank name not mappable | Skip CEP, log unmapped bank name |
| CEP not found (first try) | Insert pending_retry, use Vision-only for now |
| All retries exhausted | Mark not_found, keep Vision's original decision |

### Files Changed

| File | Change |
|------|--------|
| `backend/services/cep-service.js` | **NEW** — Banxico CEP client |
| `backend/services/cep-retry-scheduler.js` | **NEW** — Cron job for retries |
| `backend/services/payment-receipt-verifier.js` | **MODIFIED** — Add CEP step after Vision |
| `backend/shared/init-database.js` | **MODIFIED** — Add cep_verifications table |
| `backend/api/server.js` | **MODIFIED** — Initialize CEP retry scheduler |
| `.env.example` | **MODIFIED** — Add AXKAN_CLABE, AXKAN_BANK_CODE |

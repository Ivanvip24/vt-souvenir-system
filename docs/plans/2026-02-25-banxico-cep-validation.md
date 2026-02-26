# Banxico CEP Transfer Validation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate SPEI bank transfers against Banxico's CEP system to prevent fake payment screenshots from being auto-approved.

**Architecture:** After Claude Vision analyzes a payment screenshot, extract the clave de rastreo and query `banxico.org.mx/cep/valida.do` directly. Store results in a dedicated `cep_verifications` table. Failed lookups retry on a cron schedule (transfers can take up to 30 min to register). On confirmation, download the official CEP PDF to Google Drive.

**Tech Stack:** Node.js (ES modules), `node-fetch` (already installed), `node-cron` (already installed), PostgreSQL, Google Drive API (already integrated).

---

### Task 1: Database Migration — `cep_verifications` table

**Files:**
- Create: `backend/shared/migrations/012-add-cep-verifications.sql`
- Modify: `backend/shared/run-migration.js:39` (add migration call)

**Step 1: Create migration SQL file**

```sql
-- 012-add-cep-verifications.sql
-- Stores Banxico CEP verification results for SPEI transfers

CREATE TABLE IF NOT EXISTS cep_verifications (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id),
  clave_rastreo VARCHAR(100),
  fecha_operacion DATE,
  emisor_code VARCHAR(10),
  emisor_name VARCHAR(100),
  receptor_code VARCHAR(10),
  receptor_name VARCHAR(100),
  monto DECIMAL(12, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  banxico_response JSONB,
  cep_pdf_url VARCHAR(500),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cep_verifications_order ON cep_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_cep_verifications_status ON cep_verifications(status);
CREATE INDEX IF NOT EXISTS idx_cep_verifications_retry ON cep_verifications(status, next_retry_at)
  WHERE status = 'pending_retry';
CREATE INDEX IF NOT EXISTS idx_cep_verifications_clave ON cep_verifications(clave_rastreo);
```

**Step 2: Add migration to runner**

In `backend/shared/run-migration.js`, after line 39 (`await runMigration('001-add-client-order-system.sql');`), add:

```javascript
    await runMigration('012-add-cep-verifications.sql');
```

**Step 3: Run the migration**

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan_brain_system/backend
node shared/run-migration.js
```

Expected: `✅ Migration 012-add-cep-verifications.sql completed successfully`

**Step 4: Verify table exists**

```bash
psql -U postgres -d souvenir_management -c "\d cep_verifications"
```

Expected: Table definition with all columns listed.

**Step 5: Commit**

```bash
git add backend/shared/migrations/012-add-cep-verifications.sql backend/shared/run-migration.js
git commit -m "feat: add cep_verifications table for Banxico SPEI validation"
```

---

### Task 2: CEP Service — Core Banxico client

**Files:**
- Create: `backend/services/cep-service.js`

This is the core module. It establishes an HTTP session with Banxico's CEP portal, POSTs transfer data to `/cep/valida.do`, parses the HTML response, and optionally downloads the CEP PDF.

**Key technical details from reverse-engineering the portal:**
- Base URL: `https://www.banxico.org.mx/cep/`
- Form action: `POST /cep/valida.do`
- Session: Must GET the main page first to get cookies, then POST with those cookies
- CAPTCHA: Hardcode `captcha: 'c'` — the backend doesn't enforce it for direct POST
- Response: Returns HTML. Success page contains a download link and transfer details. Error page contains "No se encontró" or "ERR" markers.
- Download: `GET /cep/descarga.do?formato=PDF` (same session, after successful validation)

**Step 1: Create the CEP service**

Write `backend/services/cep-service.js` with this structure:

```javascript
/**
 * Banxico CEP (Comprobante Electrónico de Pago) Service
 * Validates SPEI transfers against Mexico's central bank records.
 *
 * Flow:
 * 1. GET /cep/ to establish session cookies
 * 2. POST /cep/valida.do with transfer params
 * 3. Parse HTML response for success/failure
 * 4. Optionally GET /cep/descarga.do?formato=PDF for official proof
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://www.banxico.org.mx/cep';

// Map bank names (as extracted by Claude Vision) to Banxico numeric codes
// Source: Banxico CEP portal <select> options (inspected via DOM)
const BANK_CODES = {
  'BBVA': '40012',
  'BBVA MEXICO': '40012',
  'BBVA BANCOMER': '40012',
  'BANCOMER': '40012',
  'SANTANDER': '40014',
  'BANAMEX': '40002',
  'CITIBANAMEX': '40002',
  'BANORTE': '40072',
  'HSBC': '40021',
  'SCOTIABANK': '40044',
  'BANCO AZTECA': '40127',
  'AZTECA': '40127',
  'BANREGIO': '40058',
  'INBURSA': '40036',
  'BANBAJIO': '40030',
  'BAJIO': '40030',
  'BANCO DEL BAJIO': '40030',
  'AFIRME': '40062',
  'BANSI': '40060',
  'MULTIVA': '40132',
  'MIFEL': '40042',
  'MONEX': '40112',
  'INTERCAM': '40136',
  'BANKAOOL': '40166',
  'INMOBILIARIO': '40150',
  'STP': '90646',
  'MERCADO PAGO': '90722',
  'SPIN BY OXXO': '90684',
  'SPIN': '90684',
  'OXXO': '90684',
  'NU': '90638',
  'NU MEXICO': '90638',
  'KLAR': '90680',
  'HEY BANCO': '40072',  // Banorte subsidiary
  'HEYBANCO': '40072',
  'ALBO': '90721',
  'RAPPIPAY': '90723',
  'CUENCA': '90723',
  'FONDEADORA': '90706',
  'STORI': '90727',
};

// Reverse map: code → name (for display purposes)
const BANK_NAMES = {};
for (const [name, code] of Object.entries(BANK_CODES)) {
  if (!BANK_NAMES[code]) BANK_NAMES[code] = name;
}

// AXKAN defaults from environment
const AXKAN_RECEPTOR = process.env.AXKAN_BANK_CODE || '40012'; // BBVA
const AXKAN_CUENTA = process.env.AXKAN_CLABE || '';

/**
 * Resolve a bank name string to a Banxico code.
 * Tries exact match first, then fuzzy matching.
 * @param {string} bankName - Bank name as extracted by Claude Vision
 * @returns {string|null} Banxico bank code or null if not found
 */
export function resolveBankCode(bankName) {
  if (!bankName) return null;

  const normalized = bankName.toUpperCase().trim();

  // Exact match
  if (BANK_CODES[normalized]) return BANK_CODES[normalized];

  // Partial match: check if any key is contained in the input
  for (const [name, code] of Object.entries(BANK_CODES)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return code;
    }
  }

  return null;
}

/**
 * Get bank name from code
 */
export function getBankName(code) {
  return BANK_NAMES[code] || code;
}

/**
 * Create a new session with Banxico's CEP portal.
 * GETs the main page to obtain session cookies.
 * @returns {Object} { cookies: string, success: boolean }
 */
async function createSession() {
  const response = await fetch(`${BASE_URL}/`, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to create CEP session: HTTP ${response.status}`);
  }

  // Extract Set-Cookie headers
  const setCookies = response.headers.raw()['set-cookie'] || [];
  const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

  return { cookies, success: true };
}

/**
 * Validate a SPEI transfer against Banxico's CEP system.
 *
 * @param {Object} params
 * @param {string} params.fecha - Transfer date in DD-MM-YYYY format
 * @param {string} params.claveRastreo - Tracking key (clave de rastreo)
 * @param {string} params.emisor - Sender bank code (e.g. '40012' for BBVA)
 * @param {string} [params.receptor] - Receiver bank code (defaults to AXKAN's bank)
 * @param {string} [params.cuenta] - Beneficiary CLABE (defaults to AXKAN's CLABE)
 * @param {number} params.monto - Amount in pesos (e.g. 500.00)
 * @returns {Promise<Object>} { found, details, rawHtml, error }
 */
export async function validateTransfer({
  fecha,
  claveRastreo,
  emisor,
  receptor = AXKAN_RECEPTOR,
  cuenta = AXKAN_CUENTA,
  monto,
}) {
  try {
    if (!claveRastreo) {
      return { found: false, details: null, error: 'No clave de rastreo provided' };
    }

    if (!cuenta) {
      return { found: false, details: null, error: 'AXKAN_CLABE not configured in environment' };
    }

    console.log(`🏦 CEP: Validating transfer...`);
    console.log(`   Fecha: ${fecha}`);
    console.log(`   Clave rastreo: ${claveRastreo}`);
    console.log(`   Emisor: ${emisor} (${getBankName(emisor)})`);
    console.log(`   Receptor: ${receptor} (${getBankName(receptor)})`);
    console.log(`   Monto: $${monto}`);

    // Step 1: Create session
    const session = await createSession();

    // Step 2: POST to valida.do
    const formData = new URLSearchParams({
      fecha,
      tipoCriterio: 'T',          // T = clave de rastreo
      criterio: claveRastreo,
      emisor: emisor || '0',
      receptor,
      cuenta,
      receptorParticipante: '0',
      monto: String(monto),
      captcha: 'c',                // Not enforced
      tipoConsulta: '1',
    });

    const response = await fetch(`${BASE_URL}/valida.do`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': session.cookies,
        'Referer': `${BASE_URL}/`,
        'Origin': 'https://www.banxico.org.mx',
      },
      body: formData.toString(),
      redirect: 'follow',
    });

    const html = await response.text();

    // Step 3: Parse response
    return parseResponse(html, session.cookies);
  } catch (error) {
    console.error(`❌ CEP validation error: ${error.message}`);
    return { found: false, details: null, error: error.message };
  }
}

/**
 * Parse the HTML response from Banxico's valida.do endpoint.
 * @param {string} html - Raw HTML response
 * @param {string} cookies - Session cookies (needed for PDF download)
 * @returns {Object} { found, details, cookies, error }
 */
function parseResponse(html, cookies) {
  // Check for known error patterns
  if (html.includes('meta:stats=ERR') || html.includes('No se ingresó correctamente')) {
    return {
      found: false,
      details: null,
      cookies,
      error: 'Invalid query parameters',
    };
  }

  // "No se encontró" or similar not-found messages
  if (
    html.includes('No se encontr') ||
    html.includes('no encontr') ||
    html.includes('Sin resultado') ||
    html.includes('No existe') ||
    html.includes('ERR')
  ) {
    return {
      found: false,
      details: null,
      cookies,
      error: null, // Not an error — just not found
    };
  }

  // If we get here and there's download-related content, the transfer was found
  const hasDownload = html.includes('descarga.do') || html.includes('Descargar');
  const hasTransferData = html.includes('Beneficiario') || html.includes('Ordenante') || html.includes('CDA');

  if (hasDownload || hasTransferData) {
    // Extract details from HTML
    const details = extractDetails(html);
    console.log(`✅ CEP: Transfer FOUND`);

    return {
      found: true,
      details,
      cookies,
      error: null,
    };
  }

  // Ambiguous response — couldn't determine status
  console.warn(`⚠️ CEP: Ambiguous response, could not determine transfer status`);
  return {
    found: false,
    details: null,
    cookies,
    error: 'Ambiguous response from Banxico',
  };
}

/**
 * Extract transfer details from the success HTML page.
 * @param {string} html - Success page HTML
 * @returns {Object} Extracted details
 */
function extractDetails(html) {
  const details = {};

  // Helper to extract text between label and closing tag
  const extract = (label) => {
    const regex = new RegExp(`${label}[^>]*>\\s*([^<]+)`, 'i');
    const match = html.match(regex);
    return match ? match[1].trim() : null;
  };

  // Try common field patterns from Banxico's response page
  details.beneficiario = extract('Beneficiario') || extract('beneficiario');
  details.ordenante = extract('Ordenante') || extract('ordenante');
  details.fechaOperacion = extract('Fecha') || extract('fecha');
  details.monto = extract('Monto') || extract('monto') || extract('Importe');
  details.claveRastreo = extract('Clave de rastreo') || extract('clave');
  details.concepto = extract('Concepto') || extract('concepto');
  details.sello = extract('Sello') || extract('sello');
  details.cuentaBeneficiario = extract('Cuenta beneficiario') || extract('Cuenta del beneficiario');
  details.cuentaOrdenante = extract('Cuenta ordenante') || extract('Cuenta del ordenante');

  return details;
}

/**
 * Download the official CEP document (PDF or XML).
 * Must be called with the same session cookies from a successful validateTransfer().
 *
 * @param {string} cookies - Session cookies from validateTransfer()
 * @param {'PDF'|'XML'|'ZIP'} [format='PDF'] - Download format
 * @returns {Promise<Buffer>} File contents as Buffer
 */
export async function downloadCEP(cookies, format = 'PDF') {
  if (!cookies) {
    throw new Error('No session cookies — call validateTransfer() first');
  }

  const response = await fetch(`${BASE_URL}/descarga.do?formato=${format}`, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookies,
      'Referer': `${BASE_URL}/valida.do`,
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download CEP: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

/**
 * Get the list of all known bank codes.
 * Useful for debugging and admin views.
 */
export function getAllBankCodes() {
  return { ...BANK_CODES };
}

export default {
  validateTransfer,
  downloadCEP,
  resolveBankCode,
  getBankName,
  getAllBankCodes,
};
```

**Step 2: Verify file was created correctly**

```bash
node -e "import('./services/cep-service.js').then(m => console.log('✅ Module loads, exports:', Object.keys(m)))"
```

Expected: `✅ Module loads, exports: [ 'validateTransfer', 'downloadCEP', 'resolveBankCode', 'getBankName', 'getAllBankCodes', 'default' ]`

**Step 3: Commit**

```bash
git add backend/services/cep-service.js
git commit -m "feat: add Banxico CEP service for SPEI transfer validation"
```

---

### Task 3: CEP Retry Scheduler

**Files:**
- Create: `backend/services/cep-retry-scheduler.js`

Follows the same pattern as `backend/services/pickup-scheduler.js` — uses `node-cron` to run every 5 minutes, queries `cep_verifications` for pending retries, re-validates with Banxico, and auto-approves orders when confirmed.

**Step 1: Create the retry scheduler**

Write `backend/services/cep-retry-scheduler.js`:

```javascript
/**
 * CEP Retry Scheduler
 * Periodically retries failed CEP verifications against Banxico.
 * Transfers can take up to 30 minutes to register in Banxico's system,
 * so we retry with exponential backoff: 5min → 15min → 30min → 1hr.
 */

import cron from 'node-cron';
import { query } from '../shared/database.js';
import { validateTransfer, downloadCEP, getBankName } from './cep-service.js';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from '../utils/google-drive.js';

let scheduledJob = null;

const MAX_RETRIES = parseInt(process.env.CEP_MAX_RETRIES) || 4;

// Backoff delays in minutes for each retry attempt
const RETRY_DELAYS = [5, 15, 30, 60];

/**
 * Calculate next retry timestamp based on retry count
 */
function getNextRetryDelay(retryCount) {
  const delayMinutes = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
  return delayMinutes;
}

/**
 * Initialize the CEP retry scheduler
 * Runs every 5 minutes to check for pending retries
 */
export function initializeCepRetryScheduler() {
  const enabled = process.env.CEP_RETRY_ENABLED !== 'false';

  if (!enabled) {
    console.log('⏸️  CEP retry scheduler disabled (CEP_RETRY_ENABLED=false)');
    return;
  }

  if (scheduledJob) {
    console.log('⚠️  CEP retry scheduler already running');
    return;
  }

  console.log('🏦 Initializing CEP retry scheduler...');
  console.log(`   Schedule: every 5 minutes`);
  console.log(`   Max retries: ${MAX_RETRIES}`);

  scheduledJob = cron.schedule('*/5 * * * *', async () => {
    await processPendingRetries();
  }, {
    timezone: 'America/Mexico_City',
  });

  console.log('✅ CEP retry scheduler started');
}

/**
 * Process all pending CEP retries that are due
 */
async function processPendingRetries() {
  try {
    // Find verifications that need retrying
    const result = await query(
      `SELECT cv.*, o.order_number, o.approval_status, o.id as order_id
       FROM cep_verifications cv
       JOIN orders o ON cv.order_id = o.id
       WHERE cv.status = 'pending_retry'
         AND cv.next_retry_at <= NOW()
         AND cv.retry_count < $1
       ORDER BY cv.next_retry_at ASC
       LIMIT 10`,
      [MAX_RETRIES]
    );

    if (result.rows.length === 0) return;

    console.log(`\n🏦 CEP Retry: Processing ${result.rows.length} pending verification(s)...`);

    for (const verification of result.rows) {
      await retryVerification(verification);

      // Rate limit: wait 1 second between Banxico requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('❌ CEP retry scheduler error:', error.message);
  }
}

/**
 * Retry a single CEP verification
 */
async function retryVerification(verification) {
  const { id, order_id, order_number, clave_rastreo, fecha_operacion, emisor_code, receptor_code, monto, retry_count } = verification;

  console.log(`🔄 CEP Retry #${retry_count + 1} for order ${order_number} (clave: ${clave_rastreo})`);

  try {
    // Format date as DD-MM-YYYY for Banxico
    const fechaStr = formatDateForBanxico(fecha_operacion);

    const result = await validateTransfer({
      fecha: fechaStr,
      claveRastreo: clave_rastreo,
      emisor: emisor_code,
      receptor: receptor_code,
      cuenta: process.env.AXKAN_CLABE,
      monto: parseFloat(monto),
    });

    if (result.found) {
      // Transfer confirmed by Banxico
      console.log(`✅ CEP Retry: Transfer FOUND for order ${order_number}`);
      await onTransferFound(id, order_id, order_number, result);
    } else if (result.error) {
      // Actual error (not just "not found")
      console.log(`⚠️ CEP Retry: Error for order ${order_number}: ${result.error}`);
      await scheduleNextRetry(id, retry_count);
    } else {
      // Not found yet, schedule another retry or give up
      const newRetryCount = retry_count + 1;

      if (newRetryCount >= MAX_RETRIES) {
        console.log(`❌ CEP Retry: Max retries reached for order ${order_number}. Marking as not_found.`);
        await query(
          `UPDATE cep_verifications
           SET status = 'not_found', retry_count = $2, banxico_response = $3
           WHERE id = $1`,
          [id, newRetryCount, JSON.stringify({ lastAttempt: new Date().toISOString(), result: 'not_found_after_retries' })]
        );

        // Add note to order
        await query(
          `UPDATE orders SET
            internal_notes = COALESCE(internal_notes || E'\n\n', '') || $2
           WHERE id = $1`,
          [order_id, `🏦 CEP: Transferencia no encontrada en Banxico después de ${MAX_RETRIES} intentos (${new Date().toLocaleString('es-MX')}). Clave: ${clave_rastreo}`]
        );
      } else {
        await scheduleNextRetry(id, retry_count);
      }
    }
  } catch (error) {
    console.error(`❌ CEP Retry error for order ${order_number}:`, error.message);
    await scheduleNextRetry(id, retry_count);
  }
}

/**
 * Handle a successfully found transfer — update DB, download PDF, auto-approve if needed
 */
async function onTransferFound(verificationId, orderId, orderNumber, result) {
  // Update verification status
  await query(
    `UPDATE cep_verifications
     SET status = 'found',
         verified_at = NOW(),
         banxico_response = $2
     WHERE id = $1`,
    [verificationId, JSON.stringify(result.details || {})]
  );

  // Try to download and store CEP PDF
  let cepPdfUrl = null;
  try {
    if (result.cookies) {
      const pdfBuffer = await downloadCEP(result.cookies, 'PDF');

      if (isGoogleDriveConfigured()) {
        const uploadResult = await uploadToGoogleDrive({
          fileData: pdfBuffer,
          fileName: `CEP-${orderNumber}-${Date.now()}.pdf`,
          mimeType: 'application/pdf',
        });
        cepPdfUrl = uploadResult.webViewLink || uploadResult.url;
        console.log(`📄 CEP PDF uploaded to Google Drive: ${cepPdfUrl}`);
      }

      if (cepPdfUrl) {
        await query(
          `UPDATE cep_verifications SET cep_pdf_url = $2 WHERE id = $1`,
          [verificationId, cepPdfUrl]
        );
      }
    }
  } catch (pdfError) {
    console.error(`⚠️ Failed to download/upload CEP PDF: ${pdfError.message}`);
    // Non-fatal — verification is still valid
  }

  // Check if order should be auto-approved
  const orderResult = await query(
    `SELECT approval_status FROM orders WHERE id = $1`,
    [orderId]
  );

  if (orderResult.rows[0]?.approval_status === 'pending_review') {
    // Auto-approve the order
    await query(
      `UPDATE orders SET
        approval_status = 'approved',
        status = 'new',
        department = 'design',
        internal_notes = COALESCE(internal_notes || E'\n\n', '') || $2
       WHERE id = $1`,
      [orderId, `✅ Auto-aprobado por Banxico CEP (${new Date().toLocaleString('es-MX')})${cepPdfUrl ? `\n📄 CEP: ${cepPdfUrl}` : ''}`]
    );

    console.log(`✅ Order ${orderNumber} auto-approved via CEP retry`);
  } else {
    // Order already approved (by Vision), just log the CEP confirmation
    await query(
      `UPDATE orders SET
        internal_notes = COALESCE(internal_notes || E'\n\n', '') || $2
       WHERE id = $1`,
      [orderId, `🏦 CEP confirmado por Banxico (${new Date().toLocaleString('es-MX')})${cepPdfUrl ? `\n📄 CEP: ${cepPdfUrl}` : ''}`]
    );
  }
}

/**
 * Schedule the next retry for a failed verification
 */
async function scheduleNextRetry(verificationId, currentRetryCount) {
  const newRetryCount = currentRetryCount + 1;
  const delayMinutes = getNextRetryDelay(currentRetryCount);

  console.log(`   Next retry (#${newRetryCount}) in ${delayMinutes} minutes`);

  await query(
    `UPDATE cep_verifications
     SET retry_count = $2,
         next_retry_at = NOW() + INTERVAL '${delayMinutes} minutes'
     WHERE id = $1`,
    [verificationId, newRetryCount]
  );
}

/**
 * Format a Date or date string to DD-MM-YYYY for Banxico
 */
function formatDateForBanxico(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function stopCepRetryScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log('🏦 CEP retry scheduler stopped');
  }
}

/**
 * Get scheduler status (for admin API)
 */
export function getCepSchedulerStatus() {
  return {
    running: !!scheduledJob,
    maxRetries: MAX_RETRIES,
    retryDelays: RETRY_DELAYS,
  };
}

export default {
  initializeCepRetryScheduler,
  stopCepRetryScheduler,
  getCepSchedulerStatus,
  processPendingRetries,
};
```

**Step 2: Verify module loads**

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan_brain_system/backend
node -e "import('./services/cep-retry-scheduler.js').then(m => console.log('✅ Module loads, exports:', Object.keys(m)))"
```

**Step 3: Commit**

```bash
git add backend/services/cep-retry-scheduler.js
git commit -m "feat: add CEP retry scheduler with exponential backoff"
```

---

### Task 4: Update Vision Prompt — Extract clave de rastreo

**Files:**
- Modify: `backend/services/payment-receipt-verifier.js:98-116`

The Vision prompt already asks for `folio_number`, but we need to be more explicit about extracting the **clave de rastreo** specifically, since that's what Banxico needs. We also need the Vision output to include the sending bank name.

**Step 1: Update the Vision system prompt**

In `backend/services/payment-receipt-verifier.js`, within the `systemPrompt` string (around line 78-132), add to the "DEBES EXTRAER" section (after line 101):

Find this block:

```
DEBES EXTRAER:
1. El MONTO de la transferencia/pago - busca campos como "Importe transferido", "Monto", "Cantidad", "$X.XX"
2. La FECHA de la operación
3. El FOLIO o número de operación (si existe)
4. Si el comprobante parece LEGÍTIMO o sospechoso
5. El nombre del DESTINATARIO (si aparece)
6. El BANCO origen y destino (si aparece)
```

Replace with:

```
DEBES EXTRAER:
1. El MONTO de la transferencia/pago - busca campos como "Importe transferido", "Monto", "Cantidad", "$X.XX"
2. La FECHA de la operación (formato YYYY-MM-DD)
3. El FOLIO o número de operación (si existe)
4. La CLAVE DE RASTREO - es un código alfanumérico que identifica la transferencia SPEI. Busca campos como "Clave de rastreo", "Clave rastreo", "No. de rastreo", "Tracking". Es DIFERENTE al folio. Generalmente tiene formato como "MBAN01202502251234" o similar.
5. Si el comprobante parece LEGÍTIMO o sospechoso
6. El nombre del DESTINATARIO (si aparece)
7. El BANCO EMISOR (origen) y BANCO RECEPTOR (destino) - nombre exacto del banco (si aparece)
```

Then update the JSON response schema in the same prompt. Find:

```json
{
  "is_valid_receipt": true/false,
  "amount_detected": number or null,
  "currency": "MXN" or other,
  "date_detected": "YYYY-MM-DD" or null,
  "folio_number": "string" or null,
  "recipient_name": "string" or null,
  "source_bank": "string" or null,
  "destination_bank": "string" or null,
  "confidence_level": "high" / "medium" / "low",
  "suspicious_indicators": [],
  "notes": "string with any relevant observations"
}
```

Replace with:

```json
{
  "is_valid_receipt": true/false,
  "amount_detected": number or null,
  "currency": "MXN" or other,
  "date_detected": "YYYY-MM-DD" or null,
  "folio_number": "string" or null,
  "clave_rastreo": "string" or null,
  "recipient_name": "string" or null,
  "source_bank": "string" or null,
  "destination_bank": "string" or null,
  "confidence_level": "high" / "medium" / "low",
  "suspicious_indicators": [],
  "notes": "string with any relevant observations"
}
```

**Step 2: Update the analysis result extraction**

In the same file, around line 240 where the `result` object is built, add `clave_rastreo` to the analysis output. Find:

```javascript
      analysis: {
        is_valid_receipt: analysisResult.is_valid_receipt,
        amount_detected: amountDetected,
        expected_amount: expectedAmount,
        amount_matches: amountMatches,
        amount_difference: amountDifference,
        date_detected: analysisResult.date_detected,
        folio_number: analysisResult.folio_number,
        recipient_name: analysisResult.recipient_name,
        source_bank: analysisResult.source_bank,
        destination_bank: analysisResult.destination_bank,
```

Replace with:

```javascript
      analysis: {
        is_valid_receipt: analysisResult.is_valid_receipt,
        amount_detected: amountDetected,
        expected_amount: expectedAmount,
        amount_matches: amountMatches,
        amount_difference: amountDifference,
        date_detected: analysisResult.date_detected,
        folio_number: analysisResult.folio_number,
        clave_rastreo: analysisResult.clave_rastreo || analysisResult.folio_number,
        recipient_name: analysisResult.recipient_name,
        source_bank: analysisResult.source_bank,
        destination_bank: analysisResult.destination_bank,
```

Note: `clave_rastreo || folio_number` as fallback because some screenshots may label it differently.

**Step 3: Commit**

```bash
git add backend/services/payment-receipt-verifier.js
git commit -m "feat: extract clave_rastreo from payment receipts for CEP validation"
```

---

### Task 5: Integrate CEP into Payment Verification Pipeline

**Files:**
- Modify: `backend/api/client-routes.js:486-517`

This is the core integration. After Claude Vision returns its analysis and BEFORE deciding whether to auto-approve, we call the CEP service.

**Step 1: Add CEP import**

At the top of `backend/api/client-routes.js`, near the other imports (around line 16), add:

```javascript
import { validateTransfer, downloadCEP, resolveBankCode } from '../services/cep-service.js';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from '../utils/google-drive.js';
import { query as dbQuery } from '../shared/database.js';
```

Note: `uploadToGoogleDrive` and `isGoogleDriveConfigured` are already imported in server.js but may not be in client-routes.js — check and only add if missing. The `query` function is likely already imported — check the existing imports. If `query` is already imported (it probably is since the file does DB operations), skip the `dbQuery` import and use the existing `query`.

**Step 2: Add CEP validation after Vision check**

In `client-routes.js`, after the Vision verification succeeds and returns `AUTO_APPROVE` (around line 519: `console.log('✅ AI verified - AUTO-APPROVING order ${orderNumber}');`), insert the CEP validation block BEFORE the auto-approve database update.

Find this section (approximately line 519):

```javascript
          console.log(`✅ AI verified - AUTO-APPROVING order ${orderNumber}`);

          // Determine the actual deposit amount from the receipt
```

Insert between those two lines:

```javascript
          // ============================================
          // CEP VALIDATION — Verify against Banxico
          // ============================================
          let cepResult = null;
          const claveRastreo = verificationResult.analysis?.clave_rastreo;
          const sourceBank = verificationResult.analysis?.source_bank;
          const detectedDate = verificationResult.analysis?.date_detected;

          if (claveRastreo && process.env.AXKAN_CLABE) {
            try {
              console.log(`🏦 Starting CEP validation for order ${orderNumber}...`);

              // Resolve bank name to code
              const emisorCode = resolveBankCode(sourceBank);
              if (!emisorCode) {
                console.log(`⚠️ CEP: Could not resolve bank code for "${sourceBank}", skipping CEP`);
              } else {
                // Format date for Banxico (DD-MM-YYYY)
                let fechaBanxico;
                if (detectedDate) {
                  const parts = detectedDate.split('-'); // YYYY-MM-DD
                  fechaBanxico = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else {
                  // Fallback to today
                  const today = new Date();
                  fechaBanxico = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
                }

                cepResult = await validateTransfer({
                  fecha: fechaBanxico,
                  claveRastreo,
                  emisor: emisorCode,
                  monto: verificationResult.analysis?.amount_detected || depositAmount,
                });

                // Store CEP verification in database
                const cepStatus = cepResult.found ? 'found' : (cepResult.error ? 'error' : 'pending_retry');
                const nextRetry = cepStatus === 'pending_retry'
                  ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
                  : null;

                await query(
                  `INSERT INTO cep_verifications
                    (order_id, clave_rastreo, fecha_operacion, emisor_code, emisor_name,
                     receptor_code, receptor_name, monto, status, banxico_response, next_retry_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                  [
                    orderId,
                    claveRastreo,
                    detectedDate || new Date().toISOString().split('T')[0],
                    emisorCode,
                    sourceBank || '',
                    process.env.AXKAN_BANK_CODE || '40012',
                    'BBVA',
                    verificationResult.analysis?.amount_detected || depositAmount,
                    cepStatus,
                    JSON.stringify(cepResult.details || { error: cepResult.error }),
                    nextRetry,
                  ]
                );

                // If found, try to download CEP PDF
                if (cepResult.found && cepResult.cookies) {
                  try {
                    const pdfBuffer = await downloadCEP(cepResult.cookies, 'PDF');

                    if (isGoogleDriveConfigured()) {
                      const uploadResult = await uploadToGoogleDrive({
                        fileData: pdfBuffer,
                        fileName: `CEP-${orderNumber}-${Date.now()}.pdf`,
                        mimeType: 'application/pdf',
                      });
                      const cepPdfUrl = uploadResult.webViewLink || uploadResult.url;

                      await query(
                        `UPDATE cep_verifications SET cep_pdf_url = $1 WHERE order_id = $2 AND clave_rastreo = $3`,
                        [cepPdfUrl, orderId, claveRastreo]
                      );

                      console.log(`📄 CEP PDF stored: ${cepPdfUrl}`);
                    }
                  } catch (pdfErr) {
                    console.error(`⚠️ CEP PDF download/upload failed: ${pdfErr.message}`);
                  }
                }

                console.log(`🏦 CEP result: ${cepStatus} for order ${orderNumber}`);
              }
            } catch (cepError) {
              console.error(`⚠️ CEP validation failed (non-fatal): ${cepError.message}`);
              // CEP failure is non-blocking — we still proceed with Vision-only approval
            }
          } else {
            console.log(`ℹ️ CEP: Skipped (no clave_rastreo extracted or AXKAN_CLABE not set)`);
          }
          // ============================================
          // END CEP VALIDATION
          // ============================================

```

**Step 3: Update the internal_notes to include CEP status**

Find the auto-approve UPDATE query (around the original line 536-545):

```javascript
          await query(
            `UPDATE orders SET
              approval_status = 'approved',
              status = 'new',
              department = 'design',
              deposit_amount = $2,
              internal_notes = COALESCE(internal_notes || E'\n\n', '') || $3
             WHERE id = $1`,
            [orderId, actualDepositAmount, `✅ Auto-aprobado por AI (${new Date().toLocaleString('es-MX')})\nMonto detectado: $${actualDepositAmount.toFixed(2)}`]
          );
```

Replace the internal_notes value to include CEP status:

```javascript
          const cepNote = cepResult
            ? (cepResult.found
              ? `\n🏦 CEP: Confirmado por Banxico`
              : `\n🏦 CEP: Pendiente de confirmación (reintentando)`)
            : `\n🏦 CEP: No verificado (sin clave de rastreo)`;

          await query(
            `UPDATE orders SET
              approval_status = 'approved',
              status = 'new',
              department = 'design',
              deposit_amount = $2,
              internal_notes = COALESCE(internal_notes || E'\n\n', '') || $3
             WHERE id = $1`,
            [orderId, actualDepositAmount, `✅ Auto-aprobado por AI (${new Date().toLocaleString('es-MX')})\nMonto detectado: $${actualDepositAmount.toFixed(2)}${cepNote}`]
          );
```

**Step 4: Commit**

```bash
git add backend/api/client-routes.js
git commit -m "feat: integrate CEP validation into payment verification pipeline"
```

---

### Task 6: Initialize Scheduler in Server Startup

**Files:**
- Modify: `backend/api/server.js:42-44` (imports) and `~5281` (initialization)

**Step 1: Add import**

Near the other scheduler imports at the top of `server.js` (around line 42, after `pickupScheduler` import):

```javascript
import { initializeCepRetryScheduler, stopCepRetryScheduler } from '../services/cep-retry-scheduler.js';
```

**Step 2: Initialize scheduler after server starts**

Find the section where other schedulers are initialized (around line 5281):

```javascript
    // Initialize Pickup Scheduler (daily pickup requests)
    pickupScheduler.initializePickupScheduler();
```

Add after it:

```javascript
    // Initialize CEP retry scheduler (every 5 min, checks failed Banxico verifications)
    initializeCepRetryScheduler();
```

**Step 3: Add graceful shutdown**

Find the SIGTERM handler (around line 5463):

```javascript
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM signal, shutting down gracefully...');
  analyticsAgent.scheduler.stopAllJobs();
  process.exit(0);
});
```

Add `stopCepRetryScheduler()` before `process.exit(0)`:

```javascript
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM signal, shutting down gracefully...');
  analyticsAgent.scheduler.stopAllJobs();
  stopCepRetryScheduler();
  process.exit(0);
});
```

Do the same for the SIGINT handler below it.

**Step 4: Commit**

```bash
git add backend/api/server.js
git commit -m "feat: initialize CEP retry scheduler on server startup"
```

---

### Task 7: Environment Variables

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/.env` (local only, not committed)

**Step 1: Add to .env.example**

Append at the bottom of `backend/.env.example`:

```env

# ===================================
# BANXICO CEP VALIDATION
# ===================================

# AXKAN's CLABE for receiving SPEI payments (18 digits)
# This is used to verify transfers against Banxico's CEP system
AXKAN_CLABE=your_18_digit_clabe_here

# AXKAN's bank code (default: 40012 for BBVA)
AXKAN_BANK_CODE=40012

# Enable CEP retry scheduler (default: true)
CEP_RETRY_ENABLED=true

# Max retry attempts for failed CEP verifications (default: 4)
CEP_MAX_RETRIES=4
```

**Step 2: Add actual values to .env**

Ask the user for their CLABE. Add to the actual `.env` file:

```env
AXKAN_CLABE=<actual 18-digit CLABE>
AXKAN_BANK_CODE=40012
CEP_RETRY_ENABLED=true
CEP_MAX_RETRIES=4
```

**Step 3: Commit (only .env.example)**

```bash
git add backend/.env.example
git commit -m "docs: add Banxico CEP environment variables to .env.example"
```

---

### Task 8: Manual Smoke Test

This is NOT an automated test — it's a manual verification that the full pipeline works.

**Step 1: Verify the module loads and bank resolution works**

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan_brain_system/backend
node -e "
import { resolveBankCode, getBankName } from './services/cep-service.js';
console.log('BBVA →', resolveBankCode('BBVA'));
console.log('Santander →', resolveBankCode('Santander'));
console.log('STP →', resolveBankCode('STP'));
console.log('Nu México →', resolveBankCode('Nu México'));
console.log('Unknown →', resolveBankCode('Unknown Bank'));
console.log('Code 40012 →', getBankName('40012'));
console.log('✅ Bank code resolution working');
"
```

Expected output:
```
BBVA → 40012
Santander → 40014
STP → 90646
Nu México → 90638
Unknown → null
Code 40012 → BBVA
✅ Bank code resolution working
```

**Step 2: Test CEP session creation (network test)**

```bash
node -e "
import { validateTransfer } from './services/cep-service.js';

// Test with dummy data — should return 'not found' (not an error)
const result = await validateTransfer({
  fecha: '25-02-2026',
  claveRastreo: 'TEST123456',
  emisor: '40012',
  receptor: '40012',
  cuenta: '012345678901234567',
  monto: 100.00,
});

console.log('Result:', JSON.stringify(result, null, 2));
console.log(result.found === false ? '✅ Correctly returned not-found for dummy data' : '❌ Unexpected result');
"
```

Expected: `found: false` with no error (just not found). This confirms the HTTP session + POST is working.

**Step 3: Verify database table**

```bash
psql -U postgres -d souvenir_management -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cep_verifications' ORDER BY ordinal_position;"
```

Expected: All columns listed (id, order_id, payment_id, clave_rastreo, etc.)

**Step 4: Start the server and verify scheduler initializes**

```bash
npm run dev
```

Look for these log lines:
```
🏦 Initializing CEP retry scheduler...
   Schedule: every 5 minutes
   Max retries: 4
✅ CEP retry scheduler started
```

**Step 5: Commit (no code changes — just verification)**

If all tests pass, make a final commit:

```bash
git add -A
git commit -m "feat: complete Banxico CEP transfer validation module

- cep-service.js: HTTP client for Banxico CEP portal (validates SPEI transfers)
- cep-retry-scheduler.js: Cron-based retry with exponential backoff (5m/15m/30m/1h)
- cep_verifications table: Stores verification history, retry state, CEP PDF URLs
- Payment receipt verifier: Now extracts clave_rastreo for CEP validation
- Pipeline integration: CEP runs after Vision, stores results, downloads CEP PDFs
- Google Drive: Official CEP PDFs uploaded alongside customer screenshots"
```

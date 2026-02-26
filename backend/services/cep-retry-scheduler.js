/**
 * CEP Retry Scheduler Service
 *
 * Retries failed Banxico CEP (Comprobante Electronico de Pago) verifications.
 * SPEI transfers can take up to 30 minutes to register in Banxico's system,
 * so this scheduler retries pending verifications on an escalating delay schedule.
 *
 * Retry delays: 5 min -> 15 min -> 30 min -> 60 min (configurable via RETRY_DELAYS)
 * Runs every 5 minutes checking for verifications due for retry.
 */

import cron from 'node-cron';
import { query } from '../shared/database.js';
import { validateTransfer, downloadCEP, getBankName } from './cep-service.js';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from '../utils/google-drive.js';

// --- Constants ---
const MAX_RETRIES = parseInt(process.env.CEP_MAX_RETRIES, 10) || 4;
const RETRY_DELAYS = [5, 15, 30, 60]; // minutes between retries

let scheduledJob = null;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get the delay in minutes before the next retry attempt.
 * Uses the RETRY_DELAYS array; if retryCount exceeds the array length,
 * returns the last value in the array.
 *
 * @param {number} retryCount - Current retry count (0-based)
 * @returns {number} Delay in minutes
 */
function getNextRetryDelay(retryCount) {
  if (retryCount >= RETRY_DELAYS.length) {
    return RETRY_DELAYS[RETRY_DELAYS.length - 1];
  }
  return RETRY_DELAYS[retryCount];
}

/**
 * Format a date value into DD-MM-YYYY format for Banxico CEP queries.
 *
 * @param {string|Date} date - Date to format
 * @returns {string} Date in DD-MM-YYYY format
 */
function formatDateForBanxico(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// ============================================================
// Scheduler Lifecycle
// ============================================================

/**
 * Initialize the CEP retry scheduler.
 * Schedules a cron job that runs every 5 minutes to process pending retries.
 * Guards against double initialization.
 */
export function initializeCepRetryScheduler() {
  // Check if explicitly disabled via environment variable
  const retryEnabled = process.env.CEP_RETRY_ENABLED;
  if (retryEnabled === 'false') {
    console.log('CEP retry scheduler disabled via CEP_RETRY_ENABLED=false');
    return;
  }

  // Guard against double initialization
  if (scheduledJob) {
    console.log('CEP retry scheduler already running');
    return;
  }

  console.log('Initializing CEP retry scheduler...');
  console.log(`   Max retries: ${MAX_RETRIES}`);
  console.log(`   Retry delays: ${RETRY_DELAYS.join(', ')} minutes`);
  console.log('   Schedule: every 5 minutes (America/Mexico_City)');

  scheduledJob = cron.schedule('*/5 * * * *', async () => {
    try {
      await processPendingRetries();
    } catch (error) {
      console.error('CEP retry scheduler error:', error.message);
    }
  }, {
    timezone: 'America/Mexico_City'
  });

  console.log('CEP retry scheduler initialized');
}

/**
 * Stop the CEP retry scheduler and release the cron job.
 */
export function stopCepRetryScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log('CEP retry scheduler stopped');
  }
}

/**
 * Get the current status of the CEP retry scheduler.
 *
 * @returns {{ running: boolean, maxRetries: number, retryDelays: number[] }}
 */
export function getCepSchedulerStatus() {
  return {
    running: scheduledJob !== null,
    maxRetries: MAX_RETRIES,
    retryDelays: RETRY_DELAYS
  };
}

// ============================================================
// Retry Processing
// ============================================================

/**
 * Process all pending CEP verification retries that are due.
 * Queries for verifications with status 'pending_retry' whose next_retry_at
 * has passed, limited to MAX_RETRIES attempts, batch size of 10.
 * Waits 1 second between each Banxico request for rate limiting.
 */
export async function processPendingRetries() {
  const result = await query(
    `SELECT cv.*, o.order_number, o.approval_status
     FROM cep_verifications cv
     JOIN orders o ON cv.order_id = o.id
     WHERE cv.status = 'pending_retry'
       AND cv.next_retry_at <= NOW()
       AND cv.retry_count < $1
     ORDER BY cv.next_retry_at ASC
     LIMIT 10`,
    [MAX_RETRIES]
  );

  const pending = result.rows;

  if (!pending || pending.length === 0) {
    return;
  }

  console.log(`CEP retry: processing ${pending.length} pending verification(s)`);

  for (let i = 0; i < pending.length; i++) {
    await retryVerification(pending[i]);

    // Rate limiting: wait 1 second between Banxico requests
    if (i < pending.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Retry a single CEP verification against Banxico.
 *
 * Possible outcomes:
 * - Transfer found  -> mark as found, download PDF, potentially auto-approve order
 * - Error           -> schedule next retry
 * - Not found, retries remaining -> schedule next retry
 * - Not found, no retries left   -> mark as not_found
 *
 * @param {Object} verification - Row from cep_verifications joined with orders
 */
async function retryVerification(verification) {
  const {
    id,
    order_id,
    order_number,
    clave_rastreo,
    fecha_operacion,
    emisor_code,
    receptor_code,
    monto,
    retry_count
  } = verification;

  const newAttempt = retry_count + 1;

  console.log(`CEP retry #${newAttempt}/${MAX_RETRIES} for order ${order_number} (clave: ${clave_rastreo})`);

  try {
    const fecha = formatDateForBanxico(fecha_operacion);

    const result = await validateTransfer({
      fecha,
      claveRastreo: clave_rastreo,
      emisor: emisor_code,
      receptor: receptor_code,
      cuenta: process.env.AXKAN_CLABE,
      monto: parseFloat(monto)
    });

    if (result && result.found) {
      // Transfer found in Banxico
      console.log(`CEP found for order ${order_number} on retry #${newAttempt}`);
      await onTransferFound(id, order_id, order_number, result);
    } else {
      // Transfer not found
      if (newAttempt >= MAX_RETRIES) {
        // Exhausted all retries
        console.log(`CEP not found for order ${order_number} after ${MAX_RETRIES} retries - marking as not_found`);

        await query(
          `UPDATE cep_verifications SET status = 'not_found', retry_count = $2 WHERE id = $1`,
          [id, newAttempt]
        );

        // Add note to order
        await query(
          `UPDATE orders SET
            internal_notes = COALESCE(internal_notes || E'\\n\\n', '') || $2
           WHERE id = $1`,
          [order_id, `CEP no encontrado (${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}): No se pudo verificar la transferencia con clave ${clave_rastreo} despues de ${MAX_RETRIES} intentos. Requiere revision manual.`]
        );
      } else {
        // More retries available
        await scheduleNextRetry(id, retry_count);
      }
    }
  } catch (error) {
    console.error(`CEP retry error for order ${order_number}:`, error.message);
    // On error, schedule another retry if possible
    if (newAttempt < MAX_RETRIES) {
      await scheduleNextRetry(id, retry_count);
    } else {
      // Mark as not_found on final error
      await query(
        `UPDATE cep_verifications SET status = 'not_found', retry_count = $2 WHERE id = $1`,
        [id, newAttempt]
      );
    }
  }
}

/**
 * Handle a successful CEP verification.
 * Updates the verification record, downloads the CEP PDF,
 * optionally uploads to Google Drive, and auto-approves the order
 * if it is still pending review.
 *
 * @param {number} verificationId - ID of the cep_verifications row
 * @param {number} orderId - ID of the associated order
 * @param {string} orderNumber - Human-readable order number
 * @param {Object} result - Result from validateTransfer (contains cookies, data)
 */
async function onTransferFound(verificationId, orderId, orderNumber, result) {
  // Mark verification as found
  await query(
    `UPDATE cep_verifications
     SET status = 'found', verified_at = NOW(), banxico_response = $2
     WHERE id = $1`,
    [verificationId, JSON.stringify(result)]
  );

  // Try to download and store the CEP PDF
  let pdfUrl = null;
  try {
    const pdfBuffer = await downloadCEP(result.cookies, 'PDF');

    if (pdfBuffer && isGoogleDriveConfigured()) {
      const uploadResult = await uploadToGoogleDrive({
        fileData: pdfBuffer,
        fileName: `CEP-${orderNumber}-${Date.now()}.pdf`,
        mimeType: 'application/pdf'
      });

      if (uploadResult && uploadResult.success) {
        pdfUrl = uploadResult.viewUrl || uploadResult.downloadUrl;

        await query(
          `UPDATE cep_verifications SET cep_pdf_url = $2 WHERE id = $1`,
          [verificationId, pdfUrl]
        );

        console.log(`CEP PDF uploaded for order ${orderNumber}: ${pdfUrl}`);
      }
    }
  } catch (pdfError) {
    console.error(`CEP PDF download/upload error for order ${orderNumber}:`, pdfError.message);
    // Non-fatal: verification is still valid even without PDF
  }

  // Check order approval status and potentially auto-approve
  const orderResult = await query(
    `SELECT approval_status FROM orders WHERE id = $1`,
    [orderId]
  );

  if (orderResult.rows.length > 0) {
    const order = orderResult.rows[0];

    if (order.approval_status === 'pending_review') {
      // Auto-approve the order
      const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      const note = `Auto-aprobado por verificacion CEP Banxico (${timestamp}). Clave de rastreo verificada exitosamente.${pdfUrl ? ` CEP: ${pdfUrl}` : ''}`;

      await query(
        `UPDATE orders SET
          approval_status = 'approved',
          status = 'new',
          department = 'design',
          internal_notes = COALESCE(internal_notes || E'\\n\\n', '') || $2
         WHERE id = $1`,
        [orderId, note]
      );

      console.log(`Order ${orderNumber} auto-approved via CEP verification`);
    } else {
      // Order already approved or in another state; just add confirmation note
      const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      const note = `CEP Banxico verificado (${timestamp}). Transferencia confirmada.${pdfUrl ? ` CEP: ${pdfUrl}` : ''}`;

      await query(
        `UPDATE orders SET
          internal_notes = COALESCE(internal_notes || E'\\n\\n', '') || $2
         WHERE id = $1`,
        [orderId, note]
      );

      console.log(`CEP confirmed for already-approved order ${orderNumber}`);
    }
  }
}

/**
 * Schedule the next retry for a verification.
 * Increments the retry count and sets next_retry_at based on the delay schedule.
 *
 * @param {number} verificationId - ID of the cep_verifications row
 * @param {number} currentRetryCount - Current retry count before this attempt
 */
async function scheduleNextRetry(verificationId, currentRetryCount) {
  const newRetryCount = currentRetryCount + 1;
  const delayMinutes = getNextRetryDelay(currentRetryCount);

  await query(
    `UPDATE cep_verifications
     SET retry_count = $2, next_retry_at = NOW() + INTERVAL '${delayMinutes} minutes'
     WHERE id = $1`,
    [verificationId, newRetryCount]
  );

  console.log(`CEP verification ${verificationId} scheduled for retry #${newRetryCount} in ${delayMinutes} minutes`);
}

// ============================================================
// Default Export
// ============================================================

export default {
  initializeCepRetryScheduler,
  stopCepRetryScheduler,
  getCepSchedulerStatus,
  processPendingRetries
};

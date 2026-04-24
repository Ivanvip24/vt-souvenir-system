/**
 * CEP (Comprobante Electronico de Pago) Validation Service
 *
 * HTTP client for Banxico's CEP portal that validates SPEI transfers.
 * Posts to https://www.banxico.org.mx/cep/ to confirm that a payment
 * was actually processed through the SPEI network.
 */

import fetch from 'node-fetch';
import { fetchWithTimeout } from '../shared/fetch-with-timeout.js';
import { log, logError } from '../shared/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_URL = process.env.BANXICO_CEP_URL || 'https://www.banxico.org.mx/cep';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Bank Code Mapping ──────────────────────────────────────────────────────
// Maps bank names (uppercase) to Banxico numeric codes

const BANK_CODES = new Map([
  // Major banks
  ['BBVA', '40012'],
  ['BANCOMER', '40012'],
  ['BBVA BANCOMER', '40012'],
  ['SANTANDER', '40014'],
  ['BANAMEX', '40002'],
  ['CITIBANAMEX', '40002'],
  ['BANORTE', '40072'],
  ['HSBC', '40021'],
  ['SCOTIABANK', '40044'],

  // Mid-size banks
  ['BANCO AZTECA', '40127'],
  ['AZTECA', '40127'],
  ['BANREGIO', '40058'],
  ['INBURSA', '40036'],
  ['BANBAJIO', '40030'],
  ['BAJIO', '40030'],
  ['BANCO DEL BAJIO', '40030'],
  ['AFIRME', '40062'],
  ['MULTIVA', '40132'],
  ['MIFEL', '40042'],

  // Digital / fintech
  ['STP', '90646'],
  ['MERCADO PAGO', '90722'],
  ['SPIN', '90684'],
  ['OXXO', '90684'],
  ['NU', '90638'],
  ['NU MEXICO', '90638'],
  ['KLAR', '90680'],
  ['HEY BANCO', '40072'],
  ['HEYBANCO', '40072'],
  ['ALBO', '90721'],
  ['FONDEADORA', '90706'],
  ['STORI', '90727'],
]);

// ─── Reverse Map (code → first matching name) ──────────────────────────────

const BANK_NAMES = new Map();
for (const [name, code] of BANK_CODES) {
  if (!BANK_NAMES.has(code)) {
    BANK_NAMES.set(code, name);
  }
}

// ─── AXKAN Defaults ─────────────────────────────────────────────────────────

const AXKAN_RECEPTOR = process.env.AXKAN_BANK_CODE || '40012';
const AXKAN_CUENTA = process.env.AXKAN_CLABE || '';

// ─── Bank Resolution ────────────────────────────────────────────────────────

/**
 * Resolve a bank name to its Banxico numeric code.
 * Tries exact match first, then partial/contains match.
 * @param {string} bankName - Bank name (case-insensitive)
 * @returns {string|null} Banxico code or null if not found
 */
function resolveBankCode(bankName) {
  if (!bankName) return null;

  const normalized = bankName.trim().toUpperCase();

  // Exact match
  if (BANK_CODES.has(normalized)) {
    return BANK_CODES.get(normalized);
  }

  // Partial / contains match
  for (const [name, code] of BANK_CODES) {
    if (name.includes(normalized) || normalized.includes(name)) {
      return code;
    }
  }

  return null;
}

/**
 * Get a human-readable bank name from a Banxico code.
 * @param {string} code - Banxico numeric code
 * @returns {string} Bank name or the code itself if unknown
 */
function getBankName(code) {
  if (!code) return code;
  const strCode = String(code);
  return BANK_NAMES.get(strCode) || strCode;
}

// ─── Session Management ─────────────────────────────────────────────────────

/**
 * Create a session with Banxico's CEP portal.
 * GETs the main page to obtain session cookies.
 * @returns {Promise<{cookies: string, success: boolean}>}
 * @private
 */
async function createSession() {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/`, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
      redirect: 'manual',
    });

    // Extract Set-Cookie headers
    const setCookieHeaders = response.headers.raw()['set-cookie'] || [];
    const cookies = setCookieHeaders
      .map(cookie => cookie.split(';')[0])
      .join('; ');

    log('info', 'cep.session.created', { hasCookies: !!cookies });

    return {
      cookies,
      success: true,
    };
  } catch (error) {
    logError('cep.session.error', error);
    return {
      cookies: '',
      success: false,
    };
  }
}

// ─── Response Parsing ───────────────────────────────────────────────────────

/**
 * Extract transaction details from CEP HTML response.
 * @param {string} html - HTML response body
 * @returns {object} Extracted fields
 * @private
 */
function extractDetails(html) {
  const details = {};

  const patterns = {
    beneficiario: /Beneficiario[^<]*<[^>]*>([^<]+)/i,
    ordenante: /Ordenante[^<]*<[^>]*>([^<]+)/i,
    fechaOperacion: /Fecha\s*(?:de\s*)?[Oo]peraci[oó]n[^<]*<[^>]*>([^<]+)/i,
    monto: /Monto[^<]*<[^>]*>([^<]+)/i,
    claveRastreo: /[Cc]lave\s*(?:de\s*)?[Rr]astreo[^<]*<[^>]*>([^<]+)/i,
    concepto: /[Cc]oncepto[^<]*<[^>]*>([^<]+)/i,
    sello: /[Ss]ello[^<]*<[^>]*>([^<]+)/i,
    cuentaBeneficiario: /[Cc]uenta\s*[Bb]eneficiario[^<]*<[^>]*>([^<]+)/i,
    cuentaOrdenante: /[Cc]uenta\s*[Oo]rdenante[^<]*<[^>]*>([^<]+)/i,
  };

  for (const [field, regex] of Object.entries(patterns)) {
    const match = html.match(regex);
    if (match) {
      details[field] = match[1].trim();
    }
  }

  return details;
}

/**
 * Parse the HTML response from Banxico's CEP validation endpoint.
 * @param {string} html - Response HTML
 * @param {string} cookies - Session cookies for potential follow-up requests
 * @returns {object} { found, details, error, cookies }
 * @private
 */
function parseResponse(html, cookies) {
  // Check for explicit error indicators
  if (html.includes('meta:stats=ERR') || html.includes('No se ingresó correctamente')) {
    return {
      found: false,
      details: null,
      error: 'Invalid query parameters',
      cookies,
    };
  }

  // Check for "not found" indicators (not an error, just no match)
  const notFoundPatterns = ['No se encontr', 'no encontr', 'no es posible generar', 'Sin resultado', 'No existe', 'ERR'];
  for (const pattern of notFoundPatterns) {
    if (html.includes(pattern)) {
      return {
        found: false,
        details: null,
        error: null,
        cookies,
      };
    }
  }

  // Check for success indicators (transfer found)
  const successPatterns = ['descarga.do', 'Descargar', 'Beneficiario', 'Ordenante', 'CDA'];
  for (const pattern of successPatterns) {
    if (html.includes(pattern)) {
      const details = extractDetails(html);
      return {
        found: true,
        details,
        error: null,
        cookies,
      };
    }
  }

  // Ambiguous — could not determine result
  return {
    found: false,
    details: null,
    error: 'Ambiguous response from Banxico',
    cookies,
  };
}

// ─── Core Validation ────────────────────────────────────────────────────────

/**
 * Validate a SPEI transfer against Banxico's CEP portal.
 *
 * @param {object} params
 * @param {string} params.fecha - Transfer date in DD/MM/YYYY format
 * @param {string} params.claveRastreo - SPEI tracking key
 * @param {string} [params.emisor] - Sender bank code (Banxico numeric)
 * @param {string} [params.receptor] - Receiver bank code (defaults to AXKAN_RECEPTOR)
 * @param {string} [params.cuenta] - Receiver CLABE (defaults to AXKAN_CUENTA)
 * @param {number|string} [params.monto] - Transfer amount
 * @returns {Promise<{found: boolean, details: object|null, error: string|null, cookies?: string}>}
 */
async function validateTransfer({ fecha, claveRastreo, emisor, receptor, cuenta, monto }) {
  // Apply defaults
  receptor = receptor || AXKAN_RECEPTOR;
  cuenta = cuenta || AXKAN_CUENTA;

  // Validate required fields
  if (!claveRastreo) {
    return {
      found: false,
      details: null,
      error: 'Missing claveRastreo (tracking key)',
    };
  }

  if (!cuenta) {
    return {
      found: false,
      details: null,
      error: 'Missing cuenta (CLABE). Set AXKAN_CLABE env variable or pass cuenta parameter.',
    };
  }

  log('info', 'cep.validate.start', { claveRastreo, fecha, emisor: emisor || '0', receptor, monto });

  try {
    // Step 1: Create session
    const session = await createSession();
    if (!session.success) {
      log('warn', 'cep.validate.no_session');
    }

    // Step 2: POST validation request
    const body = new URLSearchParams({
      fecha: fecha || '',
      tipoCriterio: 'T',
      criterio: claveRastreo,
      emisor: emisor || '0',
      receptor: receptor,
      cuenta: cuenta,
      receptorParticipante: '0',
      monto: String(monto || ''),
      captcha: 'c',
      tipoConsulta: '1',
    });

    log('info', 'cep.validate.post', { url: `${BASE_URL}/valida.do` });

    const response = await fetchWithTimeout(`${BASE_URL}/valida.do`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': session.cookies,
        'Referer': `${BASE_URL}/`,
        'Origin': 'https://www.banxico.org.mx',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    // Step 3: Parse HTML response
    const html = await response.text();
    log('info', 'cep.validate.response', { status: response.status, bodyLength: html.length });

    return parseResponse(html, session.cookies);

  } catch (error) {
    logError('cep.validate.error', error);
    return {
      found: false,
      details: null,
      error: error.message,
    };
  }
}

// ─── CEP Download ───────────────────────────────────────────────────────────

/**
 * Download the CEP document (PDF or XML) after a successful validation.
 * Requires the session cookies from a prior validateTransfer() call.
 *
 * @param {string} cookies - Session cookies from validateTransfer result
 * @param {string} [format='PDF'] - 'PDF' or 'XML'
 * @returns {Promise<Buffer>} File contents as Buffer
 */
async function downloadCEP(cookies, format = 'PDF') {
  log('info', 'cep.download.start', { format });

  const response = await fetchWithTimeout(`${BASE_URL}/descarga.do?formato=${format}`, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookies,
      'Referer': `${BASE_URL}/`,
      'Accept': '*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`CEP download failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Utility Exports ────────────────────────────────────────────────────────

/**
 * Get a copy of all known bank codes.
 * @returns {Map<string, string>} Bank name → Banxico code
 */
function getAllBankCodes() {
  return new Map(BANK_CODES);
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  validateTransfer,
  downloadCEP,
  resolveBankCode,
  getBankName,
  getAllBankCodes,
};

export default {
  validateTransfer,
  downloadCEP,
  resolveBankCode,
  getBankName,
  getAllBankCodes,
};

/**
 * Quote Generation API Routes
 * Endpoints for generating PDF quotes/cotizaciones
 * Integrated with AI Assistant for natural language processing
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from './admin-routes.js';
import {
  parseQuoteRequest,
  generateQuotePDF,
  getQuoteUrl,
  getPricingInfo
} from '../services/quote-generator.js';
import { query } from '../shared/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * POST /api/quotes/generate
 * Generate a quote PDF from structured data
 *
 * Body:
 * {
 *   clientName: string (optional),
 *   clientPhone: string (optional),
 *   clientEmail: string (optional),
 *   items: [{ productName, quantity, unitPrice, subtotal }],
 *   notes: string (optional),
 *   validityDays: number (optional, default 15),
 *   includeShipping: boolean (optional)
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    const { clientName, clientPhone, clientEmail, items, notes, validityDays, includeShipping } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere al menos un producto para generar la cotización'
      });
    }

    console.log(`📝 Generating quote for ${clientName || 'anonymous'} with ${items.length} items`);

    const result = await generateQuotePDF({
      clientName,
      clientPhone,
      clientEmail,
      items,
      notes,
      validityDays: validityDays || 15,
      includeShipping: includeShipping || false
    });

    res.json({
      success: true,
      data: {
        quoteNumber: result.quoteNumber,
        total: result.total,
        subtotal: result.subtotal,
        itemCount: result.itemCount,
        validUntil: result.validUntil,
        pdfUrl: getQuoteUrl(result.filepath),
        filename: result.filename,
        items: result.items,
        invalidItems: result.invalidItems
      }
    });

  } catch (error) {
    console.error('❌ Error generating quote:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al generar la cotización'
    });
  }
});

/**
 * POST /api/quotes/parse
 * Parse natural language quote request into structured items
 *
 * Body:
 * {
 *   text: string - e.g., "50 imanes y 30 llaveros"
 * }
 */
router.post('/parse', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Se requiere texto para analizar'
      });
    }

    console.log(`🔍 Parsing quote request: "${text.substring(0, 50)}..."`);

    const items = parseQuoteRequest(text);

    if (items.length === 0) {
      return res.json({
        success: true,
        data: {
          items: [],
          message: 'No se encontraron productos válidos en el texto. Ejemplos: "50 imanes", "100 llaveros", "30 destapadores"'
        }
      });
    }

    // Calculate totals
    const validItems = items.filter(i => !i.belowMinimum);
    const invalidItems = items.filter(i => i.belowMinimum);
    const subtotal = validItems.reduce((sum, item) => sum + item.subtotal, 0);

    res.json({
      success: true,
      data: {
        items,
        validItems,
        invalidItems,
        subtotal,
        itemCount: items.length
      }
    });

  } catch (error) {
    console.error('❌ Error parsing quote:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al analizar la solicitud'
    });
  }
});

/**
 * POST /api/quotes/generate-from-text
 * Parse natural language AND generate PDF in one call
 *
 * Body:
 * {
 *   text: string - e.g., "Cotización de 50 imanes y 30 llaveros para Juan Pérez"
 *   clientName: string (optional - can be extracted from text),
 *   clientPhone: string (optional),
 *   clientEmail: string (optional),
 *   notes: string (optional),
 *   validityDays: number (optional)
 * }
 */
router.post('/generate-from-text', async (req, res) => {
  try {
    const { text, clientName, clientPhone, clientEmail, notes, validityDays, includeShipping } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Se requiere texto para generar la cotización'
      });
    }

    console.log(`📝 Generating quote from text: "${text.substring(0, 50)}..."`);

    // Parse the text to extract items
    const items = parseQuoteRequest(text);

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron productos válidos en el texto. Ejemplos válidos: "50 imanes", "100 llaveros", "30 destapadores"',
        hint: 'Intenta especificar cantidades y productos como: "50 imanes y 30 llaveros"'
      });
    }

    // Try to extract client name from text if not provided
    let extractedClientName = clientName;
    if (!extractedClientName) {
      // Pattern: "para [Name]" or "cliente [Name]"
      const nameMatch = text.match(/(?:para|cliente|de)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i);
      if (nameMatch) {
        extractedClientName = nameMatch[1];
      }
    }

    // Generate the PDF
    const result = await generateQuotePDF({
      clientName: extractedClientName,
      clientPhone,
      clientEmail,
      items,
      notes,
      validityDays: validityDays || 15,
      includeShipping: includeShipping || false
    });

    res.json({
      success: true,
      data: {
        quoteNumber: result.quoteNumber,
        total: result.total,
        subtotal: result.subtotal,
        itemCount: result.itemCount,
        validUntil: result.validUntil,
        pdfUrl: getQuoteUrl(result.filepath),
        filename: result.filename,
        items: result.items,
        invalidItems: result.invalidItems,
        clientName: extractedClientName
      }
    });

  } catch (error) {
    console.error('❌ Error generating quote from text:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al generar la cotización'
    });
  }
});

/**
 * GET /api/quotes/pricing
 * Get current pricing information for all products
 */
router.get('/pricing', async (req, res) => {
  try {
    const pricing = getPricingInfo();
    res.json({
      success: true,
      data: pricing
    });
  } catch (error) {
    console.error('❌ Error getting pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener precios'
    });
  }
});

/**
 * POST /api/quotes/save
 * Save a generated quote to the database for tracking
 *
 * Body:
 * {
 *   quoteNumber: string,
 *   clientId: number (optional),
 *   clientName: string,
 *   total: number,
 *   items: array,
 *   pdfUrl: string,
 *   validUntil: string
 * }
 */
router.post('/save', async (req, res) => {
  try {
    const { quoteNumber, clientId, clientName, total, items, pdfUrl, validUntil, notes } = req.body;

    // Check if quotes table exists (create if not)
    await query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY,
        quote_number VARCHAR(50) UNIQUE NOT NULL,
        client_id INTEGER REFERENCES clients(id),
        client_name VARCHAR(255),
        total_amount DECIMAL(10,2) NOT NULL,
        items JSONB NOT NULL,
        pdf_url VARCHAR(500),
        valid_until DATE,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        converted_to_order_id INTEGER REFERENCES orders(id)
      )
    `);

    // Insert quote record
    const result = await query(`
      INSERT INTO quotes (quote_number, client_id, client_name, total_amount, items, pdf_url, valid_until, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, quote_number, created_at
    `, [quoteNumber, clientId || null, clientName, total, JSON.stringify(items), pdfUrl, validUntil, notes]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error saving quote:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al guardar la cotización'
    });
  }
});

/**
 * GET /api/quotes/list
 * Get list of recent quotes
 */
router.get('/list', async (req, res) => {
  try {
    const { limit = 20, status } = req.query;

    let sql = `
      SELECT q.*, c.name as client_name_full, c.phone as client_phone
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
    `;

    const params = [];
    if (status) {
      sql += ' WHERE q.status = $1';
      params.push(status);
    }

    sql += ' ORDER BY q.created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    // If table doesn't exist, return empty array
    if (error.code === '42P01') {
      return res.json({
        success: true,
        data: []
      });
    }
    console.error('❌ Error listing quotes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar cotizaciones'
    });
  }
});

export default router;

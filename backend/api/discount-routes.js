/**
 * Discount Routes - Special Clients & Promo Codes API
 * Implements TOTP-style rotating codes for special pricing
 */

import express from 'express';
import crypto from 'crypto';
import { query } from '../shared/database.js';

const router = express.Router();

// ========================================
// TOTP-STYLE CODE GENERATION
// ========================================

// Code validity duration: 1 hour (3600 seconds)
const CODE_DURATION = 3600;

/**
 * Generate a TOTP-style code that changes every hour
 * Uses HMAC-SHA256 with client's secret key
 */
function generateTOTP(secretKey, timeStep = CODE_DURATION) {
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(counter.toString());
  const hash = hmac.digest('hex');

  // Take last 6 characters and convert to uppercase alphanumeric
  const code = hash.slice(-6).toUpperCase();

  // Calculate seconds remaining until next code
  const secondsRemaining = timeStep - (epoch % timeStep);

  // Convert to minutes for display
  const minutesRemaining = Math.floor(secondsRemaining / 60);
  const secondsRemainder = secondsRemaining % 60;

  return {
    code,
    secondsRemaining,
    minutesRemaining,
    secondsRemainder,
    validUntil: epoch + secondsRemaining,
    timeStep
  };
}

/**
 * Verify a TOTP code (check current and previous window for clock skew)
 */
function verifyTOTP(secretKey, inputCode, timeStep = CODE_DURATION) {
  const epoch = Math.floor(Date.now() / 1000);

  // Check current window and one window back (for clock skew)
  for (let i = 0; i <= 1; i++) {
    const counter = Math.floor(epoch / timeStep) - i;
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(counter.toString());
    const hash = hmac.digest('hex');
    const expectedCode = hash.slice(-6).toUpperCase();

    if (inputCode.toUpperCase() === expectedCode) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a random secret key for a new special client
 */
function generateSecretKey() {
  return crypto.randomBytes(32).toString('hex');
}

// ========================================
// DATABASE INITIALIZATION
// ========================================

async function ensureTablesExist() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS special_clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50),
        company VARCHAR(255),
        secret_key VARCHAR(64) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS special_client_prices (
        id SERIAL PRIMARY KEY,
        special_client_id INTEGER REFERENCES special_clients(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        custom_price DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(special_client_id, product_id)
      )
    `);

    // Create index for faster lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_special_clients_email ON special_clients(email)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_special_client_prices_client ON special_client_prices(special_client_id)
    `);

    console.log('✅ Special clients tables initialized');
  } catch (error) {
    console.error('Error creating special clients tables:', error);
  }
}

// Initialize tables on module load
ensureTablesExist();

// ========================================
// ADMIN ENDPOINTS - Special Clients CRUD
// ========================================

/**
 * GET /api/discounts/search-clients
 * Search existing clients (from clients table) for autocomplete
 */
router.get('/search-clients', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ success: true, clients: [] });
    }

    const searchTerm = `%${q}%`;

    const result = await query(`
      SELECT
        id,
        name,
        email,
        phone,
        city,
        state
      FROM clients
      WHERE
        LOWER(name) LIKE LOWER($1)
        OR LOWER(email) LIKE LOWER($1)
        OR phone LIKE $1
      ORDER BY name
      LIMIT 10
    `, [searchTerm]);

    res.json({ success: true, clients: result.rows });
  } catch (error) {
    console.error('Error searching clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/discounts/special-clients
 * List all special clients
 */
router.get('/special-clients', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        sc.id,
        sc.name,
        sc.email,
        sc.phone,
        sc.company,
        sc.is_active,
        sc.created_at,
        COUNT(scp.id) as custom_price_count
      FROM special_clients sc
      LEFT JOIN special_client_prices scp ON sc.id = scp.special_client_id
      GROUP BY sc.id
      ORDER BY sc.name
    `);

    res.json({ success: true, clients: result.rows });
  } catch (error) {
    console.error('Error fetching special clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/discounts/special-clients/:id
 * Get a specific special client with their custom prices
 */
router.get('/special-clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get client info
    const clientResult = await query(`
      SELECT id, name, email, phone, company, secret_key, is_active, created_at
      FROM special_clients
      WHERE id = $1
    `, [id]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const client = clientResult.rows[0];

    // Get ALL products with custom prices if they exist
    const pricesResult = await query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.base_price as normal_price,
        p.category,
        scp.custom_price,
        CASE
          WHEN scp.custom_price IS NOT NULL
          THEN ROUND(((p.base_price - scp.custom_price) / p.base_price * 100)::numeric, 1)
          ELSE NULL
        END as discount_percent
      FROM products p
      LEFT JOIN special_client_prices scp ON p.id = scp.product_id AND scp.special_client_id = $1
      WHERE p.is_active = true
      ORDER BY p.category, p.name
    `, [id]);

    // Generate current TOTP code
    const totp = generateTOTP(client.secret_key);

    res.json({
      success: true,
      client: {
        ...client,
        secret_key: undefined // Don't expose secret key
      },
      allProducts: pricesResult.rows,
      totp
    });
  } catch (error) {
    console.error('Error fetching special client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/discounts/special-clients
 * Create a new special client
 */
router.post('/special-clients', async (req, res) => {
  try {
    const { name, email, phone, company, customPrices } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Nombre y email son requeridos' });
    }

    // Generate unique secret key for TOTP
    const secretKey = generateSecretKey();

    // Insert client
    const clientResult = await query(`
      INSERT INTO special_clients (name, email, phone, company, secret_key)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, email, phone, company, created_at
    `, [name, email, phone || null, company || null, secretKey]);

    const clientId = clientResult.rows[0].id;

    // Insert custom prices if provided
    if (customPrices && Array.isArray(customPrices)) {
      for (const price of customPrices) {
        if (price.productId && price.customPrice) {
          await query(`
            INSERT INTO special_client_prices (special_client_id, product_id, custom_price)
            VALUES ($1, $2, $3)
            ON CONFLICT (special_client_id, product_id)
            DO UPDATE SET custom_price = EXCLUDED.custom_price
          `, [clientId, price.productId, price.customPrice]);
        }
      }
    }

    res.json({
      success: true,
      message: 'Cliente especial creado exitosamente',
      client: clientResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating special client:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ success: false, error: 'Ya existe un cliente con ese email' });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

/**
 * PUT /api/discounts/special-clients/:id
 * Update a special client
 */
router.put('/special-clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company, customPrices, isActive } = req.body;

    // Update client info
    await query(`
      UPDATE special_clients
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          company = $4,
          is_active = COALESCE($5, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [name, email, phone, company, isActive, id]);

    // Update custom prices if provided
    if (customPrices && Array.isArray(customPrices)) {
      // Remove existing prices
      await query('DELETE FROM special_client_prices WHERE special_client_id = $1', [id]);

      // Insert new prices
      for (const price of customPrices) {
        if (price.productId && price.customPrice) {
          await query(`
            INSERT INTO special_client_prices (special_client_id, product_id, custom_price)
            VALUES ($1, $2, $3)
          `, [id, price.productId, price.customPrice]);
        }
      }
    }

    res.json({ success: true, message: 'Cliente actualizado exitosamente' });
  } catch (error) {
    console.error('Error updating special client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/discounts/special-clients/:id
 * Delete a special client
 */
router.delete('/special-clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM special_clients WHERE id = $1', [id]);

    res.json({ success: true, message: 'Cliente eliminado exitosamente' });
  } catch (error) {
    console.error('Error deleting special client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/discounts/special-clients/:id/totp
 * Get current TOTP code for a special client
 */
router.get('/special-clients/:id/totp', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT secret_key FROM special_clients WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const totp = generateTOTP(result.rows[0].secret_key);

    res.json({ success: true, totp });
  } catch (error) {
    console.error('Error generating TOTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// CLIENT-FACING ENDPOINTS - Promo Code Validation
// ========================================

/**
 * POST /api/discounts/validate-code
 * Validate a promo code and return custom prices if valid
 */
router.post('/validate-code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.json({ success: false, valid: false, error: 'Código inválido' });
    }

    // Check all active special clients to find matching code
    const clientsResult = await query(`
      SELECT id, name, email, secret_key
      FROM special_clients
      WHERE is_active = true
    `);

    let matchedClient = null;

    for (const client of clientsResult.rows) {
      if (verifyTOTP(client.secret_key, code)) {
        matchedClient = client;
        break;
      }
    }

    if (!matchedClient) {
      return res.json({ success: false, valid: false, error: 'Código no válido o expirado' });
    }

    // Get custom prices for this client
    const pricesResult = await query(`
      SELECT
        scp.product_id,
        p.name as product_name,
        p.base_price as normal_price,
        scp.custom_price
      FROM special_client_prices scp
      JOIN products p ON scp.product_id = p.id
      WHERE scp.special_client_id = $1
    `, [matchedClient.id]);

    // Convert to a map for easy lookup
    const customPrices = {};
    pricesResult.rows.forEach(row => {
      customPrices[row.product_id] = {
        normalPrice: parseFloat(row.normal_price),
        customPrice: parseFloat(row.custom_price),
        productName: row.product_name
      };
    });

    res.json({
      success: true,
      valid: true,
      clientName: matchedClient.name,
      specialClientId: matchedClient.id,
      customPrices
    });
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

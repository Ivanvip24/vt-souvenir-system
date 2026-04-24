/**
 * Public Design Gallery Routes
 * Handles public gallery browsing, subscriber auth, credit purchases, and downloads.
 * Separate from internal gallery-routes.js (employee-only).
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../shared/database.js';

// Lazy-load Stripe to avoid crashing server if package not available
let Stripe;
try {
  Stripe = (await import('stripe')).default;
} catch (e) {
  console.warn('⚠️ stripe package not installed — credit purchase routes will be limited');
}

const router = express.Router();

// ── Config ──────────────────────────────────────────────
const DESIGN_JWT_SECRET = process.env.DESIGN_JWT_SECRET || process.env.JWT_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_DESIGN_WEBHOOK_SECRET = process.env.STRIPE_DESIGN_WEBHOOK_SECRET;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

if (!DESIGN_JWT_SECRET) {
  console.warn('⚠️ DESIGN_JWT_SECRET not set — subscriber auth will use JWT_SECRET');
}
if (!STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY not set — credit purchase features disabled');
}

// ── Credit Packs ────────────────────────────────────────
const CREDIT_PACKS = {
  pack_10:  { credits: 10,  price_mxn: 99,   label: '10 Créditos' },
  pack_25:  { credits: 25,  price_mxn: 199,  label: '25 Créditos' },
  pack_50:  { credits: 50,  price_mxn: 349,  label: '50 Créditos' },
};

// ── Watermark Helper ────────────────────────────────────

function getWatermarkedUrl(originalUrl) {
  if (!originalUrl) return null;

  const uploadIdx = originalUrl.indexOf('/upload/');
  if (uploadIdx === -1) return originalUrl;

  const before = originalUrl.substring(0, uploadIdx + '/upload/'.length);
  const after = originalUrl.substring(uploadIdx + '/upload/'.length);

  // Chain 1: shrink + blur + degrade quality
  const base = ['w_480', 'q_30', 'e_blur:150'].join(',');

  // Chain 2: big tiled watermark text (hard to AI-remove at 55% opacity)
  const watermark = [
    'l_text:Arial_70_bold:AXKAN.ART',
    'co_rgb:e72a88',
    'o_55',
    'g_center',
    'fl_tiled'
  ].join(',');

  // Chain 3: second diagonal watermark layer for extra protection
  const watermark2 = [
    'l_text:Arial_50_bold:© AXKAN',
    'co_rgb:000000',
    'o_25',
    'g_center',
    'fl_tiled',
    'a_-30'
  ].join(',');

  return `${before}${base}/${watermark}/${watermark2}/${after}`;
}

// ── Subscriber Auth Middleware ───────────────────────────

function subscriberAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No autorizado' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, DESIGN_JWT_SECRET);
    req.subscriber = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }
}

// ════════════════════════════════════════════════════════
// PUBLIC GALLERY (no auth)
// ════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const { category_id, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT g.id, g.name, g.description, g.file_url, g.thumbnail_url,
             g.file_type, g.dimensions, g.tags, g.created_at,
             c.name as category_name, c.color as category_color
      FROM design_gallery g
      LEFT JOIN design_categories c ON g.category_id = c.id
      WHERE g.is_public = true
        AND (g.is_archived = false OR g.is_archived IS NULL)
    `;
    const values = [];
    let paramIndex = 1;

    if (category_id) {
      sql += ` AND g.category_id = $${paramIndex++}`;
      values.push(parseInt(category_id));
    }
    if (search) {
      sql += ` AND (g.name ILIKE $${paramIndex} OR g.description ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY g.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, values);

    const designs = result.rows.map(d => ({
      ...d,
      preview_url: getWatermarkedUrl(d.file_url),
      file_url: undefined,
      thumbnail_url: undefined
    }));

    let countSql = `
      SELECT COUNT(*) FROM design_gallery g
      WHERE g.is_public = true
        AND (g.is_archived = false OR g.is_archived IS NULL)
    `;
    const countValues = [];
    let countIdx = 1;
    if (category_id) {
      countSql += ` AND g.category_id = $${countIdx++}`;
      countValues.push(parseInt(category_id));
    }
    if (search) {
      countSql += ` AND (g.name ILIKE $${countIdx} OR g.description ILIKE $${countIdx})`;
      countValues.push(`%${search}%`);
    }
    const countResult = await query(countSql, countValues);

    res.json({
      success: true,
      designs,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Public gallery error:', error);
    res.status(500).json({ success: false, error: 'Error al cargar diseños' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const result = await query(`
      SELECT c.id, c.name, c.color, c.icon,
             COUNT(g.id) as design_count
      FROM design_categories c
      INNER JOIN design_gallery g ON c.id = g.category_id
        AND g.is_public = true
        AND (g.is_archived = false OR g.is_archived IS NULL)
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `);

    res.json({ success: true, categories: result.rows });
  } catch (error) {
    console.error('Public categories error:', error);
    res.status(500).json({ success: false, error: 'Error al cargar categorías' });
  }
});

// ════════════════════════════════════════════════════════
// SUBSCRIBER AUTH
// ════════════════════════════════════════════════════════

router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    const existing = await query('SELECT id FROM design_subscribers WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Este email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO design_subscribers (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, credits_balance, created_at`,
      [email.toLowerCase(), passwordHash, name || null]
    );

    const subscriber = result.rows[0];
    const token = jwt.sign(
      { id: subscriber.id, email: subscriber.email },
      DESIGN_JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      token,
      subscriber: {
        id: subscriber.id,
        email: subscriber.email,
        name: subscriber.name,
        credits_balance: subscriber.credits_balance
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Error al crear cuenta' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    const result = await query(
      'SELECT id, email, name, password_hash, credits_balance FROM design_subscribers WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const subscriber = result.rows[0];
    const valid = await bcrypt.compare(password, subscriber.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: subscriber.id, email: subscriber.email },
      DESIGN_JWT_SECRET,
      { expiresIn: '30d' }
    );

    await query('UPDATE design_subscribers SET updated_at = NOW() WHERE id = $1', [subscriber.id]);

    res.json({
      success: true,
      token,
      subscriber: {
        id: subscriber.id,
        email: subscriber.email,
        name: subscriber.name,
        credits_balance: subscriber.credits_balance
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
  }
});

router.get('/auth/me', subscriberAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, credits_balance, stripe_customer_id, created_at
       FROM design_subscribers WHERE id = $1`,
      [req.subscriber.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
    }

    const sub = result.rows[0];
    res.json({
      success: true,
      subscriber: {
        id: sub.id,
        email: sub.email,
        name: sub.name,
        credits_balance: sub.credits_balance,
        created_at: sub.created_at
      }
    });

  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ success: false, error: 'Error al obtener perfil' });
  }
});

// ════════════════════════════════════════════════════════
// DOWNLOAD (requires credits)
// ════════════════════════════════════════════════════════

router.get('/:id/download', subscriberAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const subscriberId = req.subscriber.id;

    // Check credit balance
    const balanceResult = await query(
      'SELECT credits_balance FROM design_subscribers WHERE id = $1',
      [subscriberId]
    );
    if (balanceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
    }

    const currentBalance = balanceResult.rows[0].credits_balance;
    if (currentBalance < 1) {
      return res.status(403).json({
        success: false,
        error: 'No tienes créditos. Compra un paquete para descargar.',
        credits_balance: 0
      });
    }

    // Rate limit: 50 downloads/day
    const today = await query(
      `SELECT COUNT(*) FROM design_download_log
       WHERE subscriber_id = $1 AND downloaded_at > NOW() - INTERVAL '1 day'`,
      [subscriberId]
    );
    if (parseInt(today.rows[0].count) >= 50) {
      return res.status(429).json({
        success: false,
        error: 'Límite de descargas alcanzado (50/día). Intenta mañana.'
      });
    }

    // Get the design
    const design = await query(
      `SELECT id, name, file_url, file_type FROM design_gallery
       WHERE id = $1 AND is_public = true AND (is_archived = false OR is_archived IS NULL)`,
      [id]
    );

    if (design.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Diseño no encontrado' });
    }

    // Deduct 1 credit atomically
    const deduct = await query(
      `UPDATE design_subscribers
       SET credits_balance = credits_balance - 1, updated_at = NOW()
       WHERE id = $1 AND credits_balance > 0
       RETURNING credits_balance`,
      [subscriberId]
    );

    if (deduct.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'No tienes créditos. Compra un paquete para descargar.',
        credits_balance: 0
      });
    }

    // Log the download
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await query(
      `INSERT INTO design_download_log (subscriber_id, design_id, ip_address, credits_spent)
       VALUES ($1, $2, $3, 1)`,
      [subscriberId, id, ip]
    );

    // Increment download count
    await query(
      `UPDATE design_gallery SET download_count = COALESCE(download_count, 0) + 1 WHERE id = $1`,
      [id]
    );

    console.log(`📥 Design download: subscriber=${subscriberId}, design=${id}, credits_remaining=${deduct.rows[0].credits_balance}`);

    res.json({
      success: true,
      download_url: design.rows[0].file_url,
      name: design.rows[0].name,
      file_type: design.rows[0].file_type,
      credits_remaining: deduct.rows[0].credits_balance
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Error al descargar' });
  }
});

// ════════════════════════════════════════════════════════
// CREDIT PURCHASES (Stripe one-time payments)
// ════════════════════════════════════════════════════════

/**
 * GET /api/public/designs/credits/packs
 * Returns available credit packs with pricing
 */
router.get('/credits/packs', (req, res) => {
  const packs = Object.entries(CREDIT_PACKS).map(([key, pack]) => ({
    key,
    credits: pack.credits,
    price_mxn: pack.price_mxn,
    label: pack.label,
    per_credit: Math.round((pack.price_mxn / pack.credits) * 100) / 100
  }));

  res.json({ success: true, packs });
});

/**
 * POST /api/public/designs/credits/purchase
 * Creates a Stripe Checkout session for a credit pack purchase
 */
router.post('/credits/purchase', subscriberAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Pagos no configurados aún'
      });
    }

    const { pack_key } = req.body;
    const pack = CREDIT_PACKS[pack_key];

    if (!pack) {
      return res.status(400).json({
        success: false,
        error: 'Paquete no válido. Opciones: ' + Object.keys(CREDIT_PACKS).join(', ')
      });
    }

    const subscriberId = req.subscriber.id;

    // Get or create Stripe customer
    const sub = await query(
      'SELECT email, name, stripe_customer_id FROM design_subscribers WHERE id = $1',
      [subscriberId]
    );
    if (sub.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
    }

    let customerId = sub.rows[0].stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: sub.rows[0].email,
        name: sub.rows[0].name || undefined,
        metadata: { subscriber_id: String(subscriberId) }
      });
      customerId = customer.id;
      await query(
        'UPDATE design_subscribers SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, subscriberId]
      );
    }

    // Create one-time Checkout session
    const origin = req.headers.origin || 'https://axkan.art';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `${pack.label} — AXKAN Diseños`,
            description: `Paquete de ${pack.credits} créditos para descargar diseños originales`
          },
          unit_amount: pack.price_mxn * 100,
        },
        quantity: 1,
      }],
      success_url: `${origin}/diseños?credits=success`,
      cancel_url: `${origin}/diseños?credits=cancelled`,
      metadata: {
        subscriber_id: String(subscriberId),
        pack_key: pack_key,
      },
    });

    // Insert pending purchase record
    await query(
      `INSERT INTO credit_purchases (subscriber_id, credits, amount_mxn, pack_key, stripe_session_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [subscriberId, pack.credits, pack.price_mxn, pack_key, session.id]
    );

    res.json({ success: true, checkout_url: session.url });

  } catch (error) {
    console.error('Credit purchase error:', error);
    res.status(500).json({ success: false, error: 'Error al crear sesión de pago' });
  }
});

/**
 * GET /api/public/designs/credits/history
 * Returns credit purchase history and recent downloads for the subscriber
 */
router.get('/credits/history', subscriberAuth, async (req, res) => {
  try {
    const subscriberId = req.subscriber.id;

    const purchases = await query(
      `SELECT id, credits, amount_mxn, pack_key, status, created_at
       FROM credit_purchases
       WHERE subscriber_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [subscriberId]
    );

    const downloads = await query(
      `SELECT dl.id, dl.downloaded_at, dl.credits_spent,
              g.name as design_name
       FROM design_download_log dl
       LEFT JOIN design_gallery g ON dl.design_id = g.id
       WHERE dl.subscriber_id = $1
       ORDER BY dl.downloaded_at DESC
       LIMIT 20`,
      [subscriberId]
    );

    res.json({
      success: true,
      purchases: purchases.rows,
      downloads: downloads.rows
    });

  } catch (error) {
    console.error('Credits history error:', error);
    res.status(500).json({ success: false, error: 'Error al obtener historial' });
  }
});

// ════════════════════════════════════════════════════════
// STRIPE WEBHOOK (one-time payments)
// ════════════════════════════════════════════════════════

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_DESIGN_WEBHOOK_SECRET) {
    return res.status(503).send('Webhook not configured');
  }

  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_DESIGN_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`🔔 Stripe design webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const subscriberId = session.metadata?.subscriber_id;
        const packKey = session.metadata?.pack_key;

        if (!subscriberId || !packKey) break;

        const pack = CREDIT_PACKS[packKey];
        if (!pack) {
          console.error(`❌ Unknown pack_key in webhook: ${packKey}`);
          break;
        }

        // Idempotency: check if already processed
        const existing = await query(
          `SELECT id FROM credit_purchases WHERE stripe_session_id = $1 AND status = 'completed'`,
          [session.id]
        );
        if (existing.rows.length > 0) {
          console.log(`ℹ️ Credit purchase already processed for session ${session.id}`);
          break;
        }

        // Add credits to subscriber and mark purchase as completed
        await query(
          `UPDATE design_subscribers
           SET credits_balance = credits_balance + $1,
               stripe_customer_id = COALESCE(stripe_customer_id, $2),
               updated_at = NOW()
           WHERE id = $3`,
          [pack.credits, session.customer, subscriberId]
        );

        await query(
          `UPDATE credit_purchases
           SET status = 'completed',
               stripe_payment_intent = $1
           WHERE stripe_session_id = $2`,
          [session.payment_intent, session.id]
        );

        console.log(`✅ ${pack.credits} credits added for subscriber ${subscriberId} (session: ${session.id})`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        // Mark any pending purchases with this payment intent as failed
        await query(
          `UPDATE credit_purchases SET status = 'failed'
           WHERE stripe_payment_intent = $1 AND status = 'pending'`,
          [paymentIntent.id]
        );
        console.log(`⚠️ Payment failed: ${paymentIntent.id}`);
        break;
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }

  res.json({ received: true });
});

export default router;

/**
 * Public Design Gallery Routes
 * Handles public gallery browsing, subscriber auth, Stripe subscriptions, and downloads.
 * Separate from internal gallery-routes.js (employee-only).
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';
import { query } from '../shared/database.js';

const router = express.Router();

// ── Config ──────────────────────────────────────────────
const DESIGN_JWT_SECRET = process.env.DESIGN_JWT_SECRET || process.env.JWT_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_DESIGN_PRICE_ID = process.env.STRIPE_DESIGN_PRICE_ID;
const STRIPE_DESIGN_WEBHOOK_SECRET = process.env.STRIPE_DESIGN_WEBHOOK_SECRET;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

if (!DESIGN_JWT_SECRET) {
  console.warn('⚠️ DESIGN_JWT_SECRET not set — subscriber auth will use JWT_SECRET');
}
if (!STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY not set — subscription features disabled');
}

// ── Watermark Helper ────────────────────────────────────

/**
 * Transform a Cloudinary URL to add watermark overlay.
 * Uses Cloudinary's URL-based transformations — no server processing needed.
 */
function getWatermarkedUrl(originalUrl) {
  if (!originalUrl) return null;

  // Match Cloudinary URL pattern: .../upload/v1234/folder/file.ext
  const uploadIdx = originalUrl.indexOf('/upload/');
  if (uploadIdx === -1) {
    // Not a Cloudinary URL — return as-is (shouldn't happen)
    return originalUrl;
  }

  const before = originalUrl.substring(0, uploadIdx + '/upload/'.length);
  const after = originalUrl.substring(uploadIdx + '/upload/'.length);

  // Cloudinary transformations: resize, lower quality, add watermark text overlay
  const transforms = [
    'w_800',           // Max width 800px
    'q_50',            // 50% quality
    'l_text:Arial_40_bold:AXKAN.ART',  // Text overlay
    'co_rgb:e72a88',   // Rosa Mexicano color
    'o_30',            // 30% opacity
    'g_center',        // Centered
    'fl_tiled'         // Tile across image
  ].join(',');

  return `${before}${transforms}/${after}`;
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

function requireActiveSubscription(req, res, next) {
  if (req.subscriber.subscription_status !== 'active') {
    return res.status(403).json({
      success: false,
      error: 'Se requiere una suscripción activa',
      subscription_status: req.subscriber.subscription_status
    });
  }
  next();
}

// ════════════════════════════════════════════════════════
// PUBLIC GALLERY (no auth)
// ════════════════════════════════════════════════════════

/**
 * GET /api/public/designs
 * Returns public designs with watermarked preview URLs
 */
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

    // Replace URLs with watermarked versions
    const designs = result.rows.map(d => ({
      ...d,
      preview_url: getWatermarkedUrl(d.file_url),
      file_url: undefined,      // Never expose original URL
      thumbnail_url: undefined   // Never expose original thumbnail
    }));

    // Get total count
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

/**
 * GET /api/public/designs/categories
 * Returns categories that have public designs
 */
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

/**
 * POST /api/public/designs/auth/register
 */
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM design_subscribers WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Este email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO design_subscribers (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, subscription_status, created_at`,
      [email.toLowerCase(), passwordHash, name || null]
    );

    const subscriber = result.rows[0];
    const token = jwt.sign(
      {
        id: subscriber.id,
        email: subscriber.email,
        subscription_status: subscriber.subscription_status
      },
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
        subscription_status: subscriber.subscription_status
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Error al crear cuenta' });
  }
});

/**
 * POST /api/public/designs/auth/login
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    const result = await query(
      'SELECT id, email, name, password_hash, subscription_status FROM design_subscribers WHERE email = $1',
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
      {
        id: subscriber.id,
        email: subscriber.email,
        subscription_status: subscriber.subscription_status
      },
      DESIGN_JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Update last login
    await query('UPDATE design_subscribers SET updated_at = NOW() WHERE id = $1', [subscriber.id]);

    res.json({
      success: true,
      token,
      subscriber: {
        id: subscriber.id,
        email: subscriber.email,
        name: subscriber.name,
        subscription_status: subscriber.subscription_status
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
  }
});

/**
 * GET /api/public/designs/auth/me
 * Returns current subscriber profile + fresh subscription status
 */
router.get('/auth/me', subscriberAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, subscription_status, stripe_customer_id,
              stripe_subscription_id, created_at
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
        subscription_status: sub.subscription_status,
        has_stripe: !!sub.stripe_customer_id,
        created_at: sub.created_at
      }
    });

  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ success: false, error: 'Error al obtener perfil' });
  }
});

// ════════════════════════════════════════════════════════
// DOWNLOAD (subscriber + active subscription)
// ════════════════════════════════════════════════════════

/**
 * GET /api/public/designs/:id/download
 * Returns original file URL for active subscribers. Logs download.
 */
router.get('/:id/download', subscriberAuth, requireActiveSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const subscriberId = req.subscriber.id;

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

    // Log the download
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await query(
      `INSERT INTO design_download_log (subscriber_id, design_id, ip_address)
       VALUES ($1, $2, $3)`,
      [subscriberId, id, ip]
    );

    // Increment download count on design_gallery
    await query(
      `UPDATE design_gallery SET download_count = COALESCE(download_count, 0) + 1 WHERE id = $1`,
      [id]
    );

    console.log(`📥 Design download: subscriber=${subscriberId}, design=${id}, ip=${ip}`);

    res.json({
      success: true,
      download_url: design.rows[0].file_url,
      name: design.rows[0].name,
      file_type: design.rows[0].file_type
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Error al descargar' });
  }
});

// ════════════════════════════════════════════════════════
// STRIPE SUBSCRIPTION
// ════════════════════════════════════════════════════════

/**
 * POST /api/public/designs/subscribe
 * Creates a Stripe Checkout session for the subscriber
 */
router.post('/subscribe', subscriberAuth, async (req, res) => {
  try {
    if (!stripe || !STRIPE_DESIGN_PRICE_ID) {
      return res.status(503).json({
        success: false,
        error: 'Suscripciones no configuradas aún'
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

    // Create Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: STRIPE_DESIGN_PRICE_ID, quantity: 1 }],
      success_url: `${req.headers.origin || 'https://axkan.art'}/diseños?subscription=success`,
      cancel_url: `${req.headers.origin || 'https://axkan.art'}/diseños?subscription=cancelled`,
      metadata: { subscriber_id: String(subscriberId) }
    });

    res.json({ success: true, checkout_url: session.url });

  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ success: false, error: 'Error al crear sesión de pago' });
  }
});

/**
 * POST /api/public/designs/portal
 * Creates a Stripe Customer Portal session
 */
router.post('/portal', subscriberAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ success: false, error: 'Stripe no configurado' });
    }

    const sub = await query(
      'SELECT stripe_customer_id FROM design_subscribers WHERE id = $1',
      [req.subscriber.id]
    );

    if (!sub.rows[0]?.stripe_customer_id) {
      return res.status(400).json({ success: false, error: 'No tienes suscripción activa' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.rows[0].stripe_customer_id,
      return_url: `${req.headers.origin || 'https://axkan.art'}/diseños`
    });

    res.json({ success: true, portal_url: session.url });

  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ success: false, error: 'Error al abrir portal' });
  }
});

/**
 * POST /api/public/designs/webhook
 * Stripe webhook handler — must receive raw body (configured in server.js)
 */
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
        const subscriptionId = session.subscription;

        if (subscriberId && subscriptionId) {
          await query(
            `UPDATE design_subscribers
             SET subscription_status = 'active',
                 stripe_subscription_id = $1,
                 stripe_customer_id = COALESCE(stripe_customer_id, $2),
                 updated_at = NOW()
             WHERE id = $3`,
            [subscriptionId, session.customer, subscriberId]
          );
          console.log(`✅ Subscription activated for subscriber ${subscriberId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status === 'active' ? 'active' :
                       subscription.status === 'past_due' ? 'past_due' : 'cancelled';

        await query(
          `UPDATE design_subscribers
           SET subscription_status = $1, updated_at = NOW()
           WHERE stripe_subscription_id = $2`,
          [status, subscription.id]
        );
        console.log(`🔄 Subscription updated: ${subscription.id} → ${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await query(
          `UPDATE design_subscribers
           SET subscription_status = 'cancelled', updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [subscription.id]
        );
        console.log(`❌ Subscription cancelled: ${subscription.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await query(
            `UPDATE design_subscribers
             SET subscription_status = 'past_due', updated_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [invoice.subscription]
          );
          console.log(`⚠️ Payment failed for subscription: ${invoice.subscription}`);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }

  res.json({ received: true });
});

export default router;

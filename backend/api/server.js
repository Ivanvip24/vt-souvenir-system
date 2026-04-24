import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
// Build: 2026-03-04-drag-drop-heic
import { config } from 'dotenv';
import { testConnection, query } from '../shared/database.js';
import * as analyticsAgent from '../agents/analytics-agent/index.js';
import clientRoutes from './client-routes.js';
import inventoryRoutes from './inventory-routes.js';
import adminRoutes, { authMiddleware } from './admin-routes.js';
import priceRoutes from './price-routes.js';
import bomRoutes from './bom-routes.js';
import webhookRoutes from './webhook-routes.js';
import uploadRoutes from './upload-routes.js';
import discountRoutes from './discount-routes.js';
import shippingRoutes from './shipping-routes.js';
import receiptRoutes from './receipt-routes.js';
import aiAssistantRoutes from './ai-assistant-routes.js';
import mercadolibreRoutes from './mercadolibre-routes.js';
import employeeRoutes from './employee-routes.js';
import taskRoutes from './task-routes.js';
import galleryRoutes from './gallery-routes.js';
import notesRoutes from './notes-routes.js';
import knowledgeRoutes from './knowledge-routes.js';
import quoteRoutes from './quote-routes.js';
import leadRoutes from './lead-routes.js';
import whatsappRoutes from './whatsapp-routes.js';
import whatsappTemplateRoutes from './whatsapp-template-routes.js';
import t1Routes from './t1-routes.js';
import coachingRoutes from './coaching-routes.js';
import * as knowledgeIndex from '../services/knowledge-index.js';
import * as knowledgeAI from '../services/knowledge-ai.js';
import { initializeEmailSender } from '../agents/analytics-agent/email-sender.js';
import * as skydropxService from '../services/skydropx.js';
import * as pickupScheduler from '../services/pickup-scheduler.js';
import { initializeCepRetryScheduler, stopCepRetryScheduler } from '../services/cep-retry-scheduler.js';
import { initializeShippingNotificationScheduler, stopShippingNotificationScheduler } from '../services/shipping-notification-scheduler.js';
import publicDesignRoutes from './public-design-routes.js';
import facebookRoutes from './facebook-routes.js';
import * as facebookScheduler from '../services/facebook-scheduler.js';
import { initializeDesignerScheduler, stopDesignerScheduler } from '../services/designer-scheduler.js';
import { initializeFollowupScheduler, stopFollowupScheduler } from '../services/followup-scheduler.js';
import designerTaskRoutes from './designer-routes.js';
import orderRoutes, { reminderRouter as reminderRoutes } from './order-routes.js';
import clientAdminRoutes from './client-admin-routes.js';
import analyticsRoutes from './analytics-routes.js';
import salespersonRoutes from './salesperson-routes.js';
import productionRoutes from './production-routes.js';
import designPortalRoutes from './design-portal-routes.js';
import { generateCatalogPDF, getCatalogUrl } from '../services/catalog-generator.js';
import pushService from '../services/push-notification.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust only the first proxy (Render's reverse proxy) — prevents X-Forwarded-For spoofing
app.set('trust proxy', 1);

// ========================================
// SECURITY MIDDLEWARE
// ========================================

// Helmet - security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP (frontend loads CDN scripts/fonts)
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS - restrict to known origins only
const ALLOWED_ORIGINS = [
  'https://vt-souvenir-frontend.onrender.com',
  'https://axkan-pedidos.vercel.app',
  'https://vtanunciando.com',
  'https://www.vtanunciando.com',
  'https://shipping.t1.com',
  'https://axkan.art',
  'https://www.axkan.art',
  'https://app.axkan.art',
  'https://pedidos.axkan.art',
  'https://mobile-app-mauve-ten.vercel.app',
  'https://client-order-form-v2.vercel.app',
  process.env.FRONTEND_URL,
  ...(process.env.EXTRA_CORS_ORIGINS ? process.env.EXTRA_CORS_ORIGINS.split(',') : [])
].filter(Boolean);

// Allow localhost in development
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:5500', 'http://127.0.0.1:5500');
}

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // Allow Chrome extensions (AXKAN CRM sidebar)
    if (origin && origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    console.warn(`⚠️ CORS blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Sync-Key']
}));

// Rate limiting - global (500 requests per 15 minutes per IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes, intenta más tarde' }
});
app.use('/api/', globalLimiter);

// Strict rate limit on login (5 attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos de login. Espera 15 minutos.' },
  skipSuccessfulRequests: true
});
app.use('/api/admin/login', loginLimiter);
app.use('/api/employees/login', loginLimiter);

// Rate limit on client upload endpoints (10 per 15 minutes per IP)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas subidas, intenta más tarde' }
});
app.use('/api/client/upload', uploadLimiter);

// Rate limit on order submission (5 per 15 minutes per IP)
const orderSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados pedidos, intenta más tarde' }
});
app.use('/api/client/orders/submit', orderSubmitLimiter);

// Rate limit on client info lookups (10 per 15 minutes per IP)
const clientInfoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas consultas, intenta más tarde' }
});
app.use('/api/client/info', clientInfoLimiter);
app.use('/api/client/orders/lookup', clientInfoLimiter);

// Body parsing - reduced limit to prevent memory abuse
// Stripe webhook needs raw body for signature verification — must be BEFORE json parser
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) return res.status(500).send('Stripe not configured');

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(stripeKey);

  let event;
  try {
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('⚠️ Stripe webhook signature failed:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  console.log(`💳 Stripe webhook: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const amountPaid = (session.amount_total || 0) / 100;

    console.log(`✅ Stripe payment completed: Order ${orderId}, $${amountPaid} MXN`);

    if (orderId) {
      try {
        // Mark deposit as paid
        await query(
          `UPDATE orders SET
            deposit_paid = true,
            payment_method = 'stripe',
            stripe_payment_id = $1,
            approval_status = 'approved',
            status = 'in_production'
          WHERE id = $2 AND approval_status != 'approved'`,
          [session.payment_intent || session.id, orderId]
        );

        // Log payment
        await query(
          `INSERT INTO payments (order_id, payment_type, payment_method, status, amount, stripe_payment_intent_id, payment_date)
           VALUES ($1, 'deposit', 'stripe', 'completed', $2, $3, NOW())`,
          [orderId, amountPaid, session.payment_intent || session.id]
        );

        console.log(`✅ Order ${orderId} auto-approved via Stripe payment`);
      } catch (dbErr) {
        console.error('❌ Error updating order from Stripe webhook:', dbErr.message);
      }
    }
  }

  res.json({ received: true });
});

// Skip JSON parsing for design webhook (needs raw body)
app.use((req, res, next) => {
  if (req.path === '/api/public/designs/webhook') return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========================================
// STATIC FILES - Serve PDF Receipts & Payment Proofs
// ========================================
const receiptsPath = path.join(__dirname, '../order-receipts');
app.use('/receipts', authMiddleware, express.static(receiptsPath));
console.log(`📁 Serving order receipts from: ${receiptsPath} (auth protected)`);

const paymentReceiptsPath = path.join(__dirname, '../payment-verification-receipts');
app.use('/payment-receipts', authMiddleware, express.static(paymentReceiptsPath));
console.log(`📁 Serving payment verification receipts from: ${paymentReceiptsPath} (auth protected)`);

// Axkan brand assets (knowledge base images) - uses submodule
const axkanPath = process.env.AXKAN_REPO_PATH || path.join(__dirname, '../assets/axkan');
app.use('/axkan-assets', express.static(axkanPath));
console.log(`📁 Serving Axkan assets from: ${axkanPath}`);

// Quote PDFs
const quotesPath = path.join(__dirname, '../quotes');
if (!fs.existsSync(quotesPath)) {
  fs.mkdirSync(quotesPath, { recursive: true });
}
app.use('/quotes', authMiddleware, express.static(quotesPath));
console.log(`📁 Serving quotes from: ${quotesPath} (auth protected)`);

// Catalog PDFs
const catalogsPath = path.join(__dirname, '../catalogs');
if (!fs.existsSync(catalogsPath)) {
  fs.mkdirSync(catalogsPath, { recursive: true });
}
app.use('/catalogs', express.static(catalogsPath));
console.log(`📁 Serving catalogs from: ${catalogsPath}`);

// WhatsApp-generated quotes (public, no auth — WhatsApp needs direct access)
const whatsappQuotesPath = path.join(__dirname, '../catalogs/quotes');
if (!fs.existsSync(whatsappQuotesPath)) {
  fs.mkdirSync(whatsappQuotesPath, { recursive: true });
}
console.log(`📁 WhatsApp quotes served publicly at: /catalogs/quotes/`);

// Branded Receipt PDFs
const brandedReceiptsPath = path.join(__dirname, '../branded-receipts');
if (!fs.existsSync(brandedReceiptsPath)) {
  fs.mkdirSync(brandedReceiptsPath, { recursive: true });
}
app.use('/branded-receipts', authMiddleware, express.static(brandedReceiptsPath));
console.log(`📁 Serving branded receipts from: ${brandedReceiptsPath} (auth protected)`);

// Shipping Labels PDFs
const labelsPath = path.join(__dirname, '../labels');
if (!fs.existsSync(labelsPath)) {
  fs.mkdirSync(labelsPath, { recursive: true });
}
app.use('/labels', authMiddleware, express.static(labelsPath));
console.log(`📁 Serving labels from: ${labelsPath} (auth protected)`);

// Designer Reports PDFs
const designerReportsPath = path.join(__dirname, '../designer-reports');
if (!fs.existsSync(designerReportsPath)) {
  fs.mkdirSync(designerReportsPath, { recursive: true });
}
app.use('/designer-reports', express.static(designerReportsPath));
console.log(`📁 Serving designer reports from: ${designerReportsPath} (auth protected)`);

// Sales Digests PDFs
const salesDigestsPath = path.join(__dirname, '../sales-digests');
if (!fs.existsSync(salesDigestsPath)) {
  fs.mkdirSync(salesDigestsPath, { recursive: true });
}
app.use('/sales-digests', express.static(salesDigestsPath));
console.log(`📁 Serving sales digests from: ${salesDigestsPath} (public — WhatsApp needs direct access)`);

// ========================================
// HEALTH CHECK
// ========================================

app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();

  res.json({
    status: dbConnected ? 'ok' : 'degraded'
  });
});

// ========================================
// PUBLIC: PRODUCT CATALOG (no auth required)
// ========================================
app.get('/api/catalog', async (req, res) => {
  try {
    const forceRegenerate = req.query.refresh === 'true';
    const result = await generateCatalogPDF({ forceRegenerate });

    if (req.query.download === 'true') {
      return res.download(result.filepath, 'catalogo-axkan.pdf');
    }

    res.json({
      success: true,
      data: {
        pdfUrl: getCatalogUrl(result.filepath),
        filename: result.filename,
        productCount: result.productCount,
        generatedAt: result.generatedAt,
        cached: result.cached || false
      }
    });
  } catch (error) {
    console.error('❌ Error generating catalog:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el catálogo'
    });
  }
});

app.get('/api/catalog/download', async (req, res) => {
  try {
    const result = await generateCatalogPDF();
    res.download(result.filepath, 'catalogo-axkan.pdf');
  } catch (error) {
    console.error('❌ Error downloading catalog:', error);
    res.status(500).json({ success: false, error: 'Error al generar catálogo' });
  }
});

// ========================================
// PUBLIC DESIGN GALLERY (no auth — subscriber auth is internal)
// ========================================
app.use('/api/public/designs', publicDesignRoutes);

// ========================================
// CLIENT-FACING ROUTES
// ========================================
app.use('/api/client', clientRoutes);

// ========================================
// ADMIN AUTHENTICATION ROUTES
// ========================================
app.use('/api/admin', adminRoutes);

// ========================================
// INVENTORY MANAGEMENT ROUTES (auth required)
// ========================================
app.use('/api/inventory', authMiddleware, inventoryRoutes);

// ========================================
// PRICE TRACKING & ANALYTICS ROUTES (auth required)
// ========================================
app.use('/api/prices', authMiddleware, priceRoutes);

// ========================================
// BILL OF MATERIALS ROUTES
// ========================================
app.use('/api/bom', authMiddleware, bomRoutes);

// ========================================
// MAKE.COM WEBHOOK ROUTES
// ========================================
app.use('/api/webhooks', webhookRoutes);

// ========================================
// DISCOUNTS & SPECIAL CLIENTS ROUTES (auth required)
// ========================================
app.use('/api/discounts', authMiddleware, discountRoutes);

// ========================================
// SHIPPING / GUÍAS ROUTES (auth required)
// ========================================
app.use('/api/shipping', authMiddleware, shippingRoutes);

// Public shipping routes for /seguimiento (quotes + rate selection only)
app.use('/api/client/shipping', shippingRoutes);

// ========================================
// FILE UPLOAD ROUTES (Cloudinary) — no auth for client uploads
// ========================================
app.use('/api/client/upload', uploadRoutes);

// ========================================
// SUPPLIER RECEIPT ROUTES (Claude Vision)
// ========================================
app.use('/api/receipts', authMiddleware, receiptRoutes);

// ========================================
// AI ASSISTANT ROUTES (Claude Chat)
// ========================================
app.use('/api/ai-assistant', authMiddleware, aiAssistantRoutes);

// ========================================
// QUOTE GENERATION ROUTES
// ========================================
app.use('/api/quotes', authMiddleware, quoteRoutes);

// ========================================
// MERCADO LIBRE INTEGRATION ROUTES (auth required)
// ========================================
app.use('/api/mercadolibre', authMiddleware, mercadolibreRoutes);

// ========================================
// ORDER ROUTES (CRUD, calendar, items, notes, attachments)
// ========================================
app.use('/api/orders', authMiddleware, orderRoutes);
app.use('/api/reminders', authMiddleware, reminderRoutes);

// ========================================
// CLIENT ADMIN ROUTES (clients DB, payment notes, bulk labels)
// ========================================
app.use('/api', authMiddleware, clientAdminRoutes);

// ========================================
// ANALYTICS, ALERTS, REPORTS, TEST EMAIL
// ========================================
app.use('/api', authMiddleware, analyticsRoutes);

// ========================================
// SALESPEOPLE & COMMISSIONS
// ========================================
app.use('/api', authMiddleware, salespersonRoutes);

// ========================================
// FACEBOOK MARKETPLACE ROUTES
// ========================================
app.use('/api/facebook', authMiddleware, facebookRoutes);

// ========================================
// EMPLOYEE DASHBOARD ROUTES
// ========================================
// Employee login/verify must be public; other employee routes use their own employeeAuth middleware
app.use('/api/employees', (req, res, next) => {
  if (req.path === '/login' || req.path === '/verify') return next();
  return authMiddleware(req, res, next);
}, employeeRoutes);
// These routes use their own employeeAuth middleware — no admin auth needed
app.use('/api/tasks', taskRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/designer-tasks', designerTaskRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/design-portal', designPortalRoutes);
app.use('/api/coaching', coachingRoutes);
// WhatsApp webhook must be public (Meta sends no JWT) — skip auth for /webhook only
app.use('/api/whatsapp', (req, res, next) => {
  if (req.path === '/webhook') return next();
  return authMiddleware(req, res, next);
}, whatsappRoutes);
app.use('/api/whatsapp', authMiddleware, whatsappTemplateRoutes);
// T1 routes — sync endpoint accepts sync key, all others require JWT
app.use('/api/t1', (req, res, next) => {
  if ((req.path === '/sync' || req.path === '/backfill-labels') && req.method === 'POST' && req.headers['x-sync-key'] === 'axkan-t1-sync-2026') {
    return next(); // Skip JWT auth for sync/backfill with valid key
  }
  authMiddleware(req, res, next);
}, t1Routes);

// ========================================
// PUSH NOTIFICATION ENDPOINTS
// ========================================

app.get('/api/push/vapid-public-key', (req, res) => {
  const key = pushService.getVapidPublicKey();
  if (!key) return res.status(503).json({ success: false, error: 'Push not configured' });
  res.json({ success: true, publicKey: key });
});

app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ success: false, error: 'Invalid subscription' });
    }
    await pushService.saveSubscription(subscription, req.headers['user-agent']);
    res.json({ success: true, message: 'Subscribed' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/push/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, error: 'Endpoint required' });
    await pushService.removeSubscription(endpoint);
    res.json({ success: true, message: 'Unsubscribed' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/push/test', authMiddleware, async (req, res) => {
  try {
    const type = req.body.type || 'test';
    let result;
    if (type === 'new_order') {
      result = await pushService.sendToAll('Nuevo Pedido', 'AXK-2407 — María García Fernández — $15,000', { view: 'orders', orderNumber: 'AXK-2407' });
    } else if (type === 'status_change') {
      result = await pushService.sendToAll('Status Actualizado', 'AXK-2404: Printing → Cutting', { view: 'orders', orderNumber: 'AXK-2404' });
    } else if (type === 'approved') {
      result = await pushService.sendToAll('Pedido Aprobado', 'AXK-2403 — Ana Martínez Ruiz listo para producción', { view: 'orders', orderNumber: 'AXK-2403' });
    } else {
      result = await pushService.sendToAll('AXKAN Test', 'Las notificaciones están funcionando', { view: 'home' });
    }
    res.json({ success: true, type, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Quick-entry: search clients by phone for autocomplete
app.get('/api/clients/search', authMiddleware, async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone || phone.length < 3) {
      return res.json({ success: true, clients: [] });
    }

    const result = await query(`
      SELECT id, name, phone, email, city, state, address
      FROM clients
      WHERE phone LIKE '%' || $1 || '%'
      ORDER BY updated_at DESC
      LIMIT 5
    `, [phone]);

    res.json({ success: true, clients: result.rows });
  } catch (error) {
    console.error('Error searching clients:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});
// ========================================
// FRONTEND ROUTES (Redirect to Frontend Service)
// ========================================

// Frontend service URL (static site on Render)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vt-souvenir-frontend.onrender.com';

// Redirect admin routes to frontend service
app.get('/admin', (req, res) => {
  res.redirect(`${FRONTEND_URL}/admin-dashboard/`);
});
app.get('/admin/*', (req, res) => {
  const path = req.params[0] || '';
  res.redirect(`${FRONTEND_URL}/admin-dashboard/${path}`);
});

// Root redirect to admin dashboard
app.get('/', (req, res) => {
  res.redirect(`${FRONTEND_URL}/admin-dashboard/`);
});

// ========================================
// ERROR HANDLER MIDDLEWARE
// ========================================

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// ========================================
// SERVER STARTUP
// ========================================

async function startServer() {
  try {
    console.log('\n🚀 Starting Souvenir Management System...\n');

    // Test database connection
    console.log('📊 Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('⚠️  Warning: Database connection failed. Some features may not work.');
    }

    // Run design subscriptions migration (idempotent — all IF NOT EXISTS)
    if (dbConnected) {
      try {
        await query(`ALTER TABLE design_gallery ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`);
        await query(`CREATE INDEX IF NOT EXISTS idx_design_gallery_public ON design_gallery(is_public)`);
        await query(`
          CREATE TABLE IF NOT EXISTS design_subscribers (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            subscription_status VARCHAR(50) DEFAULT 'free',
            stripe_customer_id VARCHAR(255),
            stripe_subscription_id VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_design_subscribers_email ON design_subscribers(email)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_design_subscribers_stripe ON design_subscribers(stripe_customer_id)`);
        await query(`
          CREATE TABLE IF NOT EXISTS design_download_log (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER REFERENCES design_subscribers(id) ON DELETE SET NULL,
            design_id INTEGER REFERENCES design_gallery(id) ON DELETE SET NULL,
            downloaded_at TIMESTAMPTZ DEFAULT NOW(),
            ip_address VARCHAR(45)
          )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_download_log_subscriber ON design_download_log(subscriber_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_download_log_design ON design_download_log(design_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_download_log_date ON design_download_log(downloaded_at)`);
        // Mark all active designs as public (one-time seed)
        await query(`UPDATE design_gallery SET is_public = true WHERE (is_archived = false OR is_archived IS NULL) AND is_public = false`);
        console.log('✅ Design subscriptions tables ready');

        // Credit system tables (020-design-credits)
        await query(`ALTER TABLE design_subscribers ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0`);
        await query(`
          CREATE TABLE IF NOT EXISTS credit_purchases (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER REFERENCES design_subscribers(id) ON DELETE SET NULL,
            credits INTEGER NOT NULL,
            amount_mxn NUMERIC(10,2) NOT NULL,
            pack_key VARCHAR(50) NOT NULL,
            stripe_session_id VARCHAR(255),
            stripe_payment_intent VARCHAR(255),
            status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_credit_purchases_subscriber ON credit_purchases(subscriber_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_credit_purchases_stripe ON credit_purchases(stripe_session_id)`);
        await query(`ALTER TABLE design_download_log ADD COLUMN IF NOT EXISTS credits_spent INTEGER DEFAULT 1`);
        console.log('✅ Design credits tables ready');
      } catch (e) {
        console.warn('⚠️ Design subscriptions migration skipped:', e.message);
      }
    }

    // Initialize Email Service
    console.log('📧 Initializing email service...');
    const emailInitialized = initializeEmailSender();
    if (emailInitialized) {
      console.log('✅ Email service initialized successfully');
    } else {
      console.error('⚠️  Warning: Email service initialization failed. Emails will not be sent.');
    }

    // Initialize Analytics Agent (includes scheduler)
    await analyticsAgent.initialize();

    // Initialize Pickup Scheduler (daily pickup requests)
    pickupScheduler.initializePickupScheduler();

    // Initialize CEP retry scheduler (every 5 min, checks failed Banxico verifications)
    initializeCepRetryScheduler();

    // Sales Insights Engine — removed API cron (was burning $45+/month on 72 calls/day)
    // Now runs locally via: node backend/scripts/sales-insights-local.js
    // Claude Code analyzes the data instead of the Anthropic API

    // Initialize Push Notification Service
    pushService.initializePushService();

    // Initialize Shipping Notification Scheduler (checks Skydropx for in-transit shipments)
    initializeShippingNotificationScheduler();

    // Initialize Design Keep-Alive Scheduler (prevents 24h WhatsApp window expiry for design chats)
    try {
      const { initializeDesignKeepAlive } = await import('../services/design-keepalive-scheduler.js');
      initializeDesignKeepAlive();
    } catch (dkaErr) {
      console.error('🎨 Design keep-alive scheduler init error:', dkaErr.message);
    }

    // Initialize Facebook Marketplace Scheduler (daily at 9 AM)
    await facebookScheduler.initFacebookScheduler();

    // Run designer tracking migration (creates tables if not exist + seeds designers)
    try {
      const { migrate: migrateDesignerTracking } = await import('../migrations/add-designer-tracking.js');
      await migrateDesignerTracking();
      console.log('✅ Designer tracking tables ready');
    } catch (dtErr) {
      console.warn('⚠️  Designer tracking migration:', dtErr.message);
    }

    // Run sales coaching migration
    try {
      const { migrate: migrateSalesCoaching } = await import('../migrations/add-sales-coaching.js');
      await migrateSalesCoaching();
      console.log('✅ Sales coaching tables ready');
    } catch (scErr) {
      console.warn('⚠️  Sales coaching migration:', scErr.message);
    }

    // Run sales learnings migration (learning engine tables)
    try {
      const { migrate: migrateSalesLearnings } = await import('../migrations/add-sales-learnings.js');
      await migrateSalesLearnings();
      console.log('✅ Sales learnings tables ready');
    } catch (slErr) {
      console.warn('⚠️  Sales learnings migration:', slErr.message);
    }

    // Run sales insights migration (AI insights feed table)
    try {
      const { migrate: migrateSalesInsights } = await import('../migrations/add-sales-insights.js');
      await migrateSalesInsights();
    } catch (siErr) {
      console.warn('⚠️  Sales insights migration:', siErr.message);
    }

    // Run design portal migration (design_assignments + design_messages)
    try {
      const { migrate: migrateDesignPortal } = await import('../migrations/add-design-portal.js');
      await migrateDesignPortal();
      console.log('✅ Design portal tables ready');
    } catch (dpErr) {
      console.warn('⚠️  Design portal migration:', dpErr.message);
    }

    // Initialize Designer Task Tracking Scheduler (follow-ups + reports)
    initializeDesignerScheduler();

    // Run reengagement timer migration + initialize scheduler (23hr client follow-ups)
    try {
      const { migrate: migrateReengagement } = await import('../migrations/add-reengagement-timer.js');
      await migrateReengagement();
    } catch (reErr) {
      console.warn('⚠️  Reengagement migration:', reErr.message);
    }
    initializeFollowupScheduler();

    // Run production tracking logs migration (production_workers + production_daily_logs)
    try {
      const { addProductionTrackingLogs } = await import('../migrations/add-production-tracking-logs.js');
      await addProductionTrackingLogs();
    } catch (ptErr) {
      console.warn('⚠️  Production tracking logs migration:', ptErr.message);
    }

    // Ensure is_store_pickup column exists (for store pickup feature)
    try {
      await query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS is_store_pickup BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Store pickup column ready');
    } catch (err) {
      console.warn('⚠️  Store pickup column migration:', err.message);
    }

    // Build Knowledge Base Index
    console.log('📚 Building knowledge base index...');
    try {
      await knowledgeIndex.buildIndex();
      console.log('✅ Knowledge base indexed successfully');
    } catch (kbError) {
      console.warn('⚠️  Warning: Knowledge base indexing failed:', kbError.message);
    }

    // Run startup migrations
    console.log('🔄 Running startup migrations...');
    try {
      // Allow NULL order_id in shipping_labels (for client-only labels)
      await query(`
        ALTER TABLE shipping_labels
        ALTER COLUMN order_id DROP NOT NULL
      `);
      console.log('   ✅ shipping_labels.order_id is now nullable');
    } catch (migrationError) {
      // Ignore if already nullable or table doesn't exist
      if (!migrationError.message.includes('already')) {
        console.log('   ℹ️  Migration skipped:', migrationError.message.split('\n')[0]);
      }
    }

    // Create salespeople table and sales_rep column for commissions
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS salespeople (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          phone VARCHAR(20),
          email VARCHAR(100),
          commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 6.00,
          is_active BOOLEAN DEFAULT true,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_salespeople_name ON salespeople(name)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_salespeople_active ON salespeople(is_active)`);
      console.log('   ✅ salespeople table ready');
    } catch (spErr) {
      console.log('   ℹ️  salespeople migration:', spErr.message.split('\n')[0]);
    }

    // Add sales_rep and salesperson_id columns to orders
    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_rep VARCHAR(100)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_orders_sales_rep ON orders(sales_rep)`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS salesperson_id INTEGER REFERENCES salespeople(id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_orders_salesperson_id ON orders(salesperson_id)`);
      console.log('   ✅ orders.sales_rep column ready');
    } catch (srErr) {
      console.log('   ℹ️  sales_rep migration:', srErr.message.split('\n')[0]);
    }

    // Insert default salespeople
    try {
      await query(`
        INSERT INTO salespeople (name, commission_rate, notes)
        VALUES
          ('Sarahi', 6.00, 'Vendedora principal'),
          ('Ivan', 0.00, 'Propietario - sin comisión')
        ON CONFLICT (name) DO NOTHING
      `);
      console.log('   ✅ Default salespeople ready');
    } catch (defErr) {
      console.log('   ℹ️  Default salespeople:', defErr.message.split('\n')[0]);
    }

    // Add confirmation_code column to pickups table
    try {
      await query(`ALTER TABLE pickups ADD COLUMN IF NOT EXISTS confirmation_code VARCHAR(100)`);
      console.log('   ✅ pickups.confirmation_code column ready');
    } catch (pcErr) {
      console.log('   ℹ️  pickups confirmation_code migration:', pcErr.message.split('\n')[0]);
    }

    // Create system_settings table for editable config (origin address, etc.)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Seed default origin address if not present
      await query(`
        INSERT INTO system_settings (key, value)
        VALUES ('origin_address', $1::jsonb)
        ON CONFLICT (key) DO NOTHING
      `, [JSON.stringify({
        name: 'VT Anunciando',
        company: 'VT Anunciando',
        street: 'Av. Morelos',
        number: '26',
        neighborhood: 'Artes Graficas',
        city: 'Cuauhtemoc',
        state: 'Ciudad de Mexico',
        zip: '15830',
        phone: '5538253251',
        email: 'valenciaperezivan24@gmail.com',
        reference: 'Interior 3'
      })]);
      console.log('   ✅ system_settings table ready');
    } catch (ssErr) {
      console.log('   ℹ️  system_settings migration:', ssErr.message.split('\n')[0]);
    }

    // Create payment_notes table for payment tracking (multiple cuentas per client)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS payment_notes (
          id SERIAL PRIMARY KEY,
          client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          name VARCHAR(200) DEFAULT '',
          data JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_payment_notes_client_id ON payment_notes(client_id)`);
      // Add name column if table already existed without it
      try {
        await query(`ALTER TABLE payment_notes ADD COLUMN IF NOT EXISTS name VARCHAR(200) DEFAULT ''`);
      } catch (_) {}
      // Drop old UNIQUE constraint if it exists (we now allow multiple per client)
      try {
        await query(`ALTER TABLE payment_notes DROP CONSTRAINT IF EXISTS payment_notes_client_id_key`);
      } catch (_) {}
      console.log('   ✅ payment_notes table ready');
    } catch (pnErr) {
      console.log('   ℹ️  payment_notes migration:', pnErr.message.split('\n')[0]);
    }

    // Load origin address from DB into skydropx service
    try {
      await skydropxService.loadOriginAddress();
    } catch (loadErr) {
      console.log('   ℹ️  Origin address load:', loadErr.message.split('\n')[0]);
    }

    // Load AI Knowledge Content
    console.log('🤖 Loading AI knowledge content...');
    try {
      await knowledgeAI.loadBrandContent();
      console.log('✅ AI knowledge content loaded successfully');
    } catch (aiError) {
      console.warn('⚠️  Warning: AI knowledge loading failed:', aiError.message);
    }

    // Auto-migration: add wholesale_price to products
    try {
      await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10, 2)`);
      const wpCheck = await query(`SELECT COUNT(*) FROM products WHERE wholesale_price IS NULL`);
      if (parseInt(wpCheck.rows[0].count) > 0) {
        await query(`UPDATE products SET base_price = 11.00, wholesale_price = 8.00 WHERE id = 4`);
        await query(`UPDATE products SET base_price = 15.00, wholesale_price = 12.00 WHERE id = 6`);
        await query(`UPDATE products SET base_price = 13.00, wholesale_price = 10.00 WHERE id = 7`);
        await query(`UPDATE products SET base_price = 10.00, wholesale_price = 8.00 WHERE id = 5`);
        await query(`UPDATE products SET base_price = 20.00, wholesale_price = 17.00 WHERE id = 8`);
        await query(`UPDATE products SET base_price = 8.00, wholesale_price = 6.00 WHERE id = 9`);
        await query(`UPDATE products SET base_price = 45.00, wholesale_price = 45.00 WHERE id = 10`);
        await query(`UPDATE products SET wholesale_price = base_price WHERE wholesale_price IS NULL`);
        console.log('✅ Product price tiers migration applied');
      }
    } catch (mErr) {
      console.warn('⚠️  Price tiers migration:', mErr.message);
    }

    // Add destination column to orders (if not exists)
    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS destination VARCHAR(150)`);
      console.log('✅ Destination column ready');
    } catch (mErr) {
      console.warn('⚠️  Destination migration:', mErr.message);
    }

    // Add is_printed tracking to shipping_labels
    try {
      await query(`ALTER TABLE shipping_labels ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false`);
      await query(`ALTER TABLE shipping_labels ADD COLUMN IF NOT EXISTS printed_at TIMESTAMP`);
      console.log('✅ is_printed column ready');
    } catch (mErr) {
      console.warn('⚠️  is_printed migration:', mErr.message);
    }

    // Add "Urgencia" product if not exists
    try {
      const urgCheck = await query("SELECT id FROM products WHERE name = 'Urgencia'");
      if (urgCheck.rows.length === 0) {
        await query(`INSERT INTO products (name, base_price, production_cost, category, is_active, wholesale_price) VALUES ('Urgencia', 1.00, 0, 'SERVICIOS', true, 1.00)`);
        console.log('✅ Urgencia product created');
      }
    } catch (mErr) {
      console.warn('⚠️  Urgencia product:', mErr.message);
    }

    // Run client_addresses migration (multi-address support per client)
    try {
      const { addClientAddresses } = await import('../migrations/add-client-addresses.js');
      await addClientAddresses();
    } catch (caErr) {
      console.warn('⚠️  Client addresses migration:', caErr.message);
    }

    // Start server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📡 API URL: http://localhost:${PORT}`);
      console.log(`💻 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(60) + '\n');

      console.log('📋 Available Endpoints:');
      console.log('  GET  /health');
      console.log('  POST /api/orders');
      console.log('  GET  /api/orders');
      console.log('  GET  /api/orders/:pageId');
      console.log('  PATCH /api/orders/:orderId/status');
      console.log('  POST /api/orders/:orderId/sync');
      console.log('  GET  /api/analytics');
      console.log('  GET  /api/analytics/revenue');
      console.log('  GET  /api/analytics/products/top');
      console.log('  GET  /api/analytics/clients/top');
      console.log('  POST /api/reports/daily/send');
      console.log('  POST /api/reports/monthly/send');
      console.log('  GET  /api/reports/schedule');
      console.log('  POST /api/test/email');
      console.log('  📦 /api/inventory/* (Materials, Alerts, BOM, Forecasting)');
      console.log('  💰 /api/prices/* (Price Tracking, Trends, Margins, Insights)');
      console.log('  🔧 /api/bom/* (Bill of Materials, Components, Cost Calculations)');
      console.log('  🔔 /api/reminders (Calendar Reminders - GET, POST, Complete, Delete)\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM signal, shutting down gracefully...');
  analyticsAgent.scheduler.stopAllJobs();
  stopCepRetryScheduler();
  stopShippingNotificationScheduler();
  stopDesignerScheduler();
  stopFollowupScheduler();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT signal, shutting down gracefully...');
  analyticsAgent.scheduler.stopAllJobs();
  stopCepRetryScheduler();
  stopShippingNotificationScheduler();
  stopDesignerScheduler();
  stopFollowupScheduler();
  process.exit(0);
});

// Start the server
startServer();

export default app;

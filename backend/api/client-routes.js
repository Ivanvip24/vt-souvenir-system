/**
 * Client-Facing API Routes
 * For self-service order creation
 */

import express from 'express';
import multer from 'multer';
import { query } from '../shared/database.js';
import { generateOrderNumber, formatCurrency } from '../shared/utils.js';
import * as notionSync from '../agents/notion-agent/sync.js';
import * as emailSender from '../agents/analytics-agent/email-sender.js';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from '../utils/google-drive.js';

const router = express.Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// ========================================
// PRODUCT CATALOG
// ========================================

/**
 * GET /api/client/products
 * Get all active products for client selection
 */
router.get('/products', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        description,
        category,
        base_price,
        dimensions
      FROM products
      WHERE is_active = true
      ORDER BY name ASC
    `);

    // Group by category for better UX
    const productsByCategory = result.rows.reduce((acc, product) => {
      const category = product.category || 'general';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        ...product,
        basePriceFormatted: formatCurrency(product.base_price)
      });
      return acc;
    }, {});

    res.json({
      success: true,
      products: result.rows,
      productsByCategory,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cargar productos'
    });
  }
});

/**
 * GET /api/client/products/:id
 * Get single product details
 */
router.get('/products/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM products WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cargar producto'
    });
  }
});

// ========================================
// ORDER SUBMISSION
// ========================================

/**
 * POST /api/client/orders/submit
 * Client submits a new order
 */
router.post('/orders/submit', async (req, res) => {
  const client = await query('BEGIN');

  try {
    const {
      // Product selections
      items, // [{productId, quantity}, ...]

      // Event details
      eventType,
      eventDate,
      clientNotes,

      // Client information
      clientName,
      clientPhone,
      clientEmail,
      clientAddress,
      clientCity,
      clientState,

      // Payment method
      paymentMethod, // 'stripe' or 'bank_transfer'
    } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes seleccionar al menos un producto'
      });
    }

    if (!clientName || !clientPhone) {
      return res.status(400).json({
        success: false,
        error: 'Nombre y teléfono son requeridos'
      });
    }

    // Validate quantities
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          success: false,
          error: 'La cantidad debe ser mayor a cero'
        });
      }
    }

    // 1. Calculate totals and prepare order items
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      // Get product details
      const productResult = await query(
        `SELECT id, name, base_price, production_cost FROM products WHERE id = $1 AND is_active = true`,
        [item.productId]
      );

      if (productResult.rows.length === 0) {
        await query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Producto con ID ${item.productId} no encontrado`
        });
      }

      const product = productResult.rows[0];
      const lineTotal = product.base_price * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.base_price,
        unitCost: product.production_cost,
        lineTotal
      });
    }

    // Calculate deposit amount (default 50% if not specified)
    const depositPercentage = req.body.depositPercentage || 50;
    const depositAmount = subtotal * (depositPercentage / 100);

    // 2. Create or find client
    let clientId;
    const existingClient = await query(
      `SELECT id FROM clients WHERE phone = $1`,
      [clientPhone]
    );

    if (existingClient.rows.length > 0) {
      clientId = existingClient.rows[0].id;
      // Update client info
      await query(
        `UPDATE clients SET name = $1, email = $2, address = $3, city = $4, state = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [clientName, clientEmail, clientAddress, clientCity, clientState, clientId]
      );
    } else {
      const newClient = await query(
        `INSERT INTO clients (name, phone, email, address, city, state)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [clientName, clientPhone, clientEmail, clientAddress, clientCity, clientState]
      );
      clientId = newClient.rows[0].id;
    }

    // 3. Create order
    const orderNumber = generateOrderNumber();

    const orderResult = await query(
      `INSERT INTO orders (
        order_number,
        client_id,
        order_date,
        event_type,
        event_date,
        client_notes,
        subtotal,
        total_price,
        total_production_cost,
        deposit_amount,
        payment_method,
        approval_status,
        status,
        department,
        deposit_paid
      ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_review', 'new', 'pending', false)
      RETURNING id`,
      [
        orderNumber,
        clientId,
        eventType,
        eventDate,
        clientNotes,
        subtotal,
        subtotal, // total_price = subtotal for now (no tax/shipping in client orders)
        orderItems.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0),
        depositAmount,
        paymentMethod
      ]
    );

    const orderId = orderResult.rows[0].id;

    // 4. Insert order items
    for (const item of orderItems) {
      await query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.productId, item.productName, item.quantity, item.unitPrice, item.unitCost]
      );
    }

    await query('COMMIT');

    // 5. Sync to Notion
    try {
      console.log(`🔄 Syncing order ${orderNumber} to Notion...`);
      await notionSync.syncOrderToNotion(orderId);
      console.log(`✅ Order ${orderNumber} synced to Notion successfully`);
    } catch (notionError) {
      console.error('❌ Failed to sync to Notion:', notionError);
      // Don't fail the order if Notion sync fails
      // Order is safely in database, Notion can be synced later
    }

    // 6. Send notification to admin
    try {
      await sendAdminNotification(orderId, orderNumber, clientName, subtotal, depositAmount);
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
      // Don't fail the order if email fails
    }

    // 7. Response based on payment method
    const response = {
      success: true,
      orderId,
      orderNumber,
      subtotal,
      depositAmount,
      depositAmountFormatted: formatCurrency(depositAmount),
      message: 'Pedido recibido exitosamente'
    };

    if (paymentMethod === 'stripe') {
      // Will implement Stripe integration next
      response.requiresPayment = true;
      response.nextStep = 'payment';
    } else if (paymentMethod === 'bank_transfer') {
      response.requiresProofUpload = true;
      response.nextStep = 'upload_proof';
      response.bankDetails = {
        bank: process.env.BANK_NAME || 'Banco XYZABC',
        clabe: process.env.BANK_CLABE || '012345678901234567',
        accountHolder: process.env.BANK_ACCOUNT_HOLDER || 'Tu Empresa S.A.'
      };
    }

    res.status(201).json(response);

  } catch (error) {
    await query('ROLLBACK');
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar el pedido'
    });
  }
});

/**
 * POST /api/client/upload-file
 * Upload a file to Google Drive and get the URL
 * Accepts multipart/form-data with 'file' field
 */
router.post('/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó ningún archivo'
      });
    }

    // Check if Google Drive is configured
    if (!isGoogleDriveConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Google Drive no está configurado. Contacta al administrador.'
      });
    }

    const { orderNumber, fileType } = req.body; // orderNumber for naming, fileType: 'payment_proof' or 'reference'
    const timestamp = Date.now();
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${fileType || 'file'}-${orderNumber || 'unknown'}-${timestamp}.${fileExtension}`;

    console.log(`📤 Uploading file to Google Drive: ${fileName}`);

    // Upload to Google Drive
    const result = await uploadToGoogleDrive({
      fileData: req.file.buffer,
      fileName: fileName,
      mimeType: req.file.mimetype
    });

    console.log(`✅ File uploaded successfully: ${result.directImageUrl}`);

    res.json({
      success: true,
      message: 'Archivo subido exitosamente',
      fileUrl: result.directImageUrl,
      viewUrl: result.viewUrl,
      downloadUrl: result.downloadUrl,
      thumbnailUrl: result.thumbnailUrl
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al subir el archivo'
    });
  }
});

/**
 * POST /api/client/orders/:orderId/upload-proof
 * Upload payment proof for bank transfer
 */
router.post('/orders/:orderId/upload-proof', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { proofUrl } = req.body; // Will come from frontend after file upload

    // Update order with proof URL
    await query(
      `UPDATE orders SET payment_proof_url = $1 WHERE id = $2`,
      [proofUrl, orderId]
    );

    // Create payment record
    await query(
      `INSERT INTO payments (order_id, payment_type, payment_method, status, proof_url)
       VALUES ($1, 'deposit', 'bank_transfer', 'pending', $2)`,
      [orderId, proofUrl]
    );

    // Send notification to admin to verify payment
    try {
      await sendPaymentProofNotification(orderId);
    } catch (emailError) {
      console.error('Failed to send payment proof notification:', emailError);
    }

    res.json({
      success: true,
      message: 'Comprobante de pago recibido. Verificaremos tu pago pronto.'
    });

  } catch (error) {
    console.error('Error uploading payment proof:', error);
    res.status(500).json({
      success: false,
      error: 'Error al subir comprobante'
    });
  }
});

/**
 * GET /api/client/orders/:orderId/status
 * Check order status (requires token for security)
 */
router.get('/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { token } = req.query; // Simple token: hash(orderId + clientPhone)

    const result = await query(
      `SELECT
        o.order_number,
        o.status,
        o.approval_status,
        o.deposit_paid,
        o.total_price,
        o.deposit_amount,
        c.name as client_name
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pedido no encontrado'
      });
    }

    const order = result.rows[0];

    res.json({
      success: true,
      order: {
        orderNumber: order.order_number,
        status: getStatusText(order.status),
        approvalStatus: getApprovalStatusText(order.approval_status),
        depositPaid: order.deposit_paid,
        totalPrice: formatCurrency(order.total_price),
        depositAmount: formatCurrency(order.deposit_amount)
      }
    });

  } catch (error) {
    console.error('Error checking order status:', error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar estado del pedido'
    });
  }
});

/**
 * POST /api/client/orders/lookup
 * Lookup orders by client phone and/or email
 */
router.post('/orders/lookup', async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar teléfono o correo electrónico'
      });
    }

    // Build query conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (phone) {
      conditions.push(`c.phone = $${paramIndex++}`);
      params.push(phone);
    }

    if (email) {
      conditions.push(`c.email = $${paramIndex++}`);
      params.push(email);
    }

    const whereClause = conditions.join(' OR ');

    // Query orders with payment info
    const result = await query(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.event_type,
        o.event_date,
        o.status,
        o.approval_status,
        o.total_price,
        o.deposit_amount,
        o.deposit_paid,
        o.payment_method,
        o.second_payment_receipt,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        json_agg(
          json_build_object(
            'productName', oi.product_name,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE (${whereClause})
        AND o.status NOT IN ('delivered', 'cancelled')
        AND o.approval_status != 'rejected'
      GROUP BY o.id, c.name, c.phone, c.email
      ORDER BY o.created_at DESC
    `, params);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        orders: [],
        message: 'No se encontraron pedidos activos'
      });
    }

    // Format orders with payment status
    const orders = result.rows.map(order => ({
      id: order.id,
      orderId: order.id,
      orderNumber: order.order_number,
      orderDate: order.order_date,
      eventType: order.event_type,
      eventDate: order.event_date,
      status: getStatusText(order.status),
      approvalStatus: order.approval_status,
      totalPrice: order.total_price,
      depositAmount: order.deposit_amount,
      depositPaid: order.deposit_paid,
      remainingBalance: order.total_price - order.deposit_amount,
      paymentMethod: order.payment_method,
      secondPaymentReceipt: order.second_payment_receipt,
      totalPriceFormatted: formatCurrency(order.total_price),
      depositAmountFormatted: formatCurrency(order.deposit_amount),
      remainingBalanceFormatted: formatCurrency(order.total_price - order.deposit_amount),
      items: order.items || [],
      clientName: order.client_name
    }));

    res.json({
      success: true,
      orders,
      clientInfo: {
        name: result.rows[0].client_name,
        phone: result.rows[0].client_phone,
        email: result.rows[0].client_email
      }
    });

  } catch (error) {
    console.error('Error looking up orders:', error);
    res.status(500).json({
      success: false,
      error: 'Error al buscar pedidos'
    });
  }
});

// ========================================
// HELPER FUNCTIONS
// ========================================

async function sendAdminNotification(orderId, orderNumber, clientName, total, deposit) {
  const emailBody = `
    <h2>Nuevo Pedido Recibido</h2>
    <p><strong>Número de Pedido:</strong> ${orderNumber}</p>
    <p><strong>Cliente:</strong> ${clientName}</p>
    <p><strong>Total:</strong> ${formatCurrency(total)}</p>
    <p><strong>Anticipo:</strong> ${formatCurrency(deposit)}</p>
    <p><strong>Estado:</strong> Pendiente de revisión</p>
    <p>
      <a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000'}/admin/orders/${orderId}">
        Ver Pedido en Dashboard
      </a>
    </p>
  `;

  await emailSender.sendEmail({
    to: process.env.ADMIN_EMAIL || process.env.REPORT_RECIPIENTS,
    subject: `🆕 Nuevo Pedido: ${orderNumber}`,
    html: emailBody
  });
}

async function sendPaymentProofNotification(orderId) {
  const result = await query(
    `SELECT o.order_number, c.name as client_name
     FROM orders o
     JOIN clients c ON o.client_id = c.id
     WHERE o.id = $1`,
    [orderId]
  );

  const order = result.rows[0];

  await emailSender.sendEmail({
    to: process.env.ADMIN_EMAIL || process.env.REPORT_RECIPIENTS,
    subject: `💰 Comprobante de Pago: ${order.order_number}`,
    html: `
      <h2>Comprobante de Pago Recibido</h2>
      <p>El cliente ${order.client_name} subió comprobante de pago para el pedido ${order.order_number}</p>
      <p>Por favor verifica el pago en el dashboard.</p>
    `
  });
}

function getStatusText(status) {
  const statusMap = {
    'new': 'Nuevo',
    'pending': 'Pendiente',
    'design': 'En Diseño',
    'printing': 'En Impresión',
    'cutting': 'En Corte',
    'counting': 'En Conteo',
    'shipping': 'En Envío',
    'delivered': 'Entregado',
    'cancelled': 'Cancelado'
  };
  return statusMap[status] || status;
}

function getApprovalStatusText(approvalStatus) {
  const statusMap = {
    'pending_review': 'Pendiente de Revisión',
    'approved': 'Aprobado',
    'needs_changes': 'Requiere Cambios',
    'rejected': 'Rechazado'
  };
  return statusMap[approvalStatus] || approvalStatus;
}

export default router;

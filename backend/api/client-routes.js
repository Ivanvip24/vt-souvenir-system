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
import { generateReceipt, getReceiptUrl } from '../services/pdf-generator.js';
import { calculateDeliveryDates } from '../utils/delivery-calculator.js';
import { calculateTieredPrice, MOQ } from '../shared/pricing.js';
import { verifyPaymentReceipt, isConfigured as isAIConfigured } from '../services/payment-receipt-verifier.js';

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
        dimensions,
        image_url,
        display_order
      FROM products
      WHERE is_active = true
      ORDER BY display_order ASC, name ASC
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
      clientAddress, // Legacy full address (will use if street not provided)
      clientStreet, // New: Street name
      clientStreetNumber, // New: Street number
      clientColonia,
      clientCity,
      clientState,
      clientPostal,
      clientReferences,

      // Payment method
      paymentMethod, // 'stripe' or 'bank_transfer'
      paymentProofUrl, // Cloudinary URL for payment receipt
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

    // 1. Calculate totals and prepare order items WITH SERVER-SIDE TIERED PRICING
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

      // SERVER-SIDE TIERED PRICING - This is the SOURCE OF TRUTH
      const pricing = calculateTieredPrice(
        product.name,
        item.quantity,
        product.base_price
      );

      // Validate minimum order quantity
      if (!pricing.isValid) {
        await query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: pricing.error
        });
      }

      // Log if client sent different price (potential manipulation attempt)
      if (item.unitPrice && Math.abs(parseFloat(item.unitPrice) - pricing.unitPrice) > 0.01) {
        console.warn(`⚠️ PRICE MISMATCH DETECTED for ${product.name}:`);
        console.warn(`   Client sent: $${item.unitPrice}`);
        console.warn(`   Server calculated: $${pricing.unitPrice}`);
        console.warn(`   Using server price (secure)`);
      }

      const unitPrice = pricing.unitPrice; // ALWAYS use server-calculated price
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: unitPrice,
        unitCost: product.production_cost,
        lineTotal,
        tierInfo: pricing.tierInfo
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
      // Update client info with new address fields
      await query(
        `UPDATE clients SET
         name = $1,
         email = $2,
         address = $3,
         street = $4,
         street_number = $5,
         colonia = $6,
         city = $7,
         state = $8,
         postal = $9,
         reference_notes = $10,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $11`,
        [
          clientName,
          clientEmail,
          clientAddress || `${clientStreet || ''} ${clientStreetNumber || ''}`.trim(), // Keep full address for compatibility
          clientStreet || clientAddress, // Use street or fallback to full address
          clientStreetNumber || '',
          clientColonia || '',
          clientCity,
          clientState,
          clientPostal || '',
          clientReferences ? clientReferences.substring(0, 35) : '', // Enforce 35 char limit
          clientId
        ]
      );
    } else {
      const newClient = await query(
        `INSERT INTO clients (name, phone, email, address, street, street_number, colonia, city, state, postal, reference_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          clientName,
          clientPhone,
          clientEmail,
          clientAddress || `${clientStreet || ''} ${clientStreetNumber || ''}`.trim(), // Keep full address for compatibility
          clientStreet || clientAddress, // Use street or fallback to full address
          clientStreetNumber || '',
          clientColonia || '',
          clientCity,
          clientState,
          clientPostal || '',
          clientReferences ? clientReferences.substring(0, 35) : '' // Enforce 35 char limit
        ]
      );
      clientId = newClient.rows[0].id;
    }

    // 3. Create order
    const orderNumber = generateOrderNumber();

    // Calculate delivery dates based on order quantity
    const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const deliveryDates = calculateDeliveryDates({
      orderDate: new Date(),
      totalQuantity,
      eventDate: eventDate || null,
      shippingMethod: 'standard'
    });

    console.log(`📅 Delivery dates calculated for ${totalQuantity} items:`);
    console.log(`   Production deadline: ${deliveryDates.productionDeadlineFormatted}`);
    console.log(`   Estimated delivery: ${deliveryDates.estimatedDeliveryFormatted}`);
    if (deliveryDates.isRushOrder) {
      console.log(`   ⚠️ RUSH ORDER - Event date is before estimated delivery!`);
    }

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
        payment_proof_url,
        approval_status,
        status,
        department,
        deposit_paid,
        production_deadline,
        estimated_delivery_date,
        shipping_days
      ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending_review', 'new', 'pending', false, $12, $13, $14)
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
        paymentMethod,
        paymentProofUrl || null,
        deliveryDates.productionDeadline,
        deliveryDates.estimatedDeliveryDate,
        deliveryDates.shippingDays
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

    // 5. Sync to Notion (background - don't block response)
    setImmediate(async () => {
      try {
        console.log(`🔄 Syncing order ${orderNumber} to Notion...`);
        await notionSync.syncOrderToNotion(orderId);
        console.log(`✅ Order ${orderNumber} synced to Notion successfully`);
      } catch (notionError) {
        console.error('❌ Failed to sync to Notion:', notionError);
        // Order is safely in database, Notion can be synced later
      }
    });

    // 6. Send notification to admin (background - don't block response)
    setImmediate(async () => {
      try {
        await sendAdminNotification(orderId, orderNumber, clientName, subtotal, depositAmount);
      } catch (emailError) {
        console.error('Failed to send admin notification:', emailError);
      }
    });

    // 6b. Generate PDF receipt (will be emailed only after admin approval)
    setImmediate(async () => {
      // Generate PDF receipt for admin to review (don't let this block response)
      try {
        console.log(`📄 Generating PDF receipt for order ${orderNumber}...`);

        const remainingBalance = subtotal - depositAmount;

        const pdfPath = await generateReceipt({
          orderNumber,
          clientName,
          clientPhone,
          clientEmail,
          orderDate: new Date(),
          items: orderItems.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal
          })),
          totalPrice: subtotal,
          actualDepositAmount: depositAmount,
          remainingBalance: remainingBalance,
          eventDate: eventDate || null,
          eventType: eventType || null
        });

        console.log(`✅ PDF receipt generated: ${pdfPath}`);

        // Store PDF path in database for admin download
        const pdfUrl = getReceiptUrl(pdfPath);
        await query(
          `UPDATE orders SET receipt_pdf_url = $1 WHERE id = $2`,
          [pdfUrl, orderId]
        );
        console.log(`💾 PDF URL saved to database: ${pdfUrl}`);
        console.log(`ℹ️  Receipt PDF generated but will only be emailed after admin approval`);

      } catch (pdfError) {
        console.error('❌ Failed to generate PDF receipt:', pdfError.message);
      }
    });

    // 6c. AUTOMATIC AI VERIFICATION (background - don't block response)
    // If customer uploaded a payment receipt, verify it automatically with Claude Vision
    if (paymentProofUrl && paymentMethod === 'bank_transfer') {
      setImmediate(async () => {
        try {
          // Wait a bit for the receipt image to be fully uploaded to Cloudinary
          await new Promise(resolve => setTimeout(resolve, 2000));

          if (!isAIConfigured()) {
            console.log('⚠️ AI verification skipped - Anthropic API not configured');
            return;
          }

          console.log(`\n🤖 Starting automatic AI verification for order ${orderNumber}...`);
          console.log(`   Receipt URL: ${paymentProofUrl}`);
          console.log(`   Expected amount: $${depositAmount.toFixed(2)}`);

          // Verify receipt with Claude Vision
          const verificationResult = await verifyPaymentReceipt(
            paymentProofUrl,
            depositAmount,
            orderNumber
          );

          if (!verificationResult.success) {
            console.log(`⚠️ AI verification failed for order ${orderNumber}: ${verificationResult.error}`);
            return;
          }

          console.log(`📊 AI Analysis result: ${verificationResult.recommendation}`);

          // AUTO-APPROVE if verification passed
          if (verificationResult.verified && verificationResult.recommendation === 'AUTO_APPROVE') {
            console.log(`✅ AUTO-APPROVING order ${orderNumber} - Receipt verified by AI`);

            // Update order to approved status
            await query(
              `UPDATE orders SET
                approval_status = 'approved',
                status = 'new',
                department = 'design'
               WHERE id = $1`,
              [orderId]
            );

            // Send confirmation email to client
            try {
              // Get the generated PDF URL
              const pdfResult = await query(
                'SELECT receipt_pdf_url FROM orders WHERE id = $1',
                [orderId]
              );
              const pdfUrl = pdfResult.rows[0]?.receipt_pdf_url;

              if (clientEmail && pdfUrl) {
                const remainingBalance = subtotal - depositAmount;
                await emailSender.sendClientReceiptEmail(
                  clientEmail,
                  clientName,
                  orderNumber,
                  pdfUrl,
                  {
                    totalPrice: subtotal,
                    depositAmount,
                    remainingBalance,
                    items: orderItems.map(item => ({
                      productName: item.productName,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      lineTotal: item.lineTotal
                    })),
                    eventDate,
                    eventType
                  }
                );
                console.log(`📧 Confirmation email sent to ${clientEmail}`);
              }
            } catch (emailError) {
              console.error('❌ Failed to send confirmation email:', emailError.message);
            }

            console.log(`🎉 Order ${orderNumber} automatically approved and client notified!`);

            // Log the AI analysis details
            if (verificationResult.analysis) {
              console.log(`   Amount detected: $${verificationResult.analysis.amount_detected || 'N/A'}`);
              console.log(`   Confidence: ${verificationResult.analysis.confidence_level}`);
              console.log(`   Bank: ${verificationResult.analysis.source_bank || 'N/A'}`);
            }

          } else {
            // Log why it wasn't auto-approved
            console.log(`⏳ Order ${orderNumber} requires manual review`);
            console.log(`   Reason: ${verificationResult.recommendation_reason}`);
          }

        } catch (aiError) {
          console.error('❌ AI verification error:', aiError.message);
          // Order remains in pending_review status - admin can review manually
        }
      });
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
 * POST /api/client/info
 * Get client info by phone - returns saved address even if no active orders
 */
router.post('/info', async (req, res) => {
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
      conditions.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }

    if (email) {
      conditions.push(`email = $${paramIndex++}`);
      params.push(email);
    }

    const whereClause = conditions.join(' OR ');

    // Query client directly from clients table (regardless of order status)
    const result = await query(`
      SELECT
        id,
        name,
        phone,
        email,
        address,
        street,
        street_number,
        colonia,
        city,
        state,
        postal,
        reference_notes
      FROM clients
      WHERE ${whereClause}
      LIMIT 1
    `, params);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        found: false,
        clientInfo: null,
        message: 'Cliente no encontrado'
      });
    }

    const client = result.rows[0];

    res.json({
      success: true,
      found: true,
      clientInfo: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        address: client.address,
        street: client.street,
        streetNumber: client.street_number,
        colonia: client.colonia,
        city: client.city,
        state: client.state,
        postal: client.postal,
        references: client.reference_notes
      }
    });

  } catch (error) {
    console.error('Error looking up client:', error);
    res.status(500).json({
      success: false,
      error: 'Error al buscar cliente'
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

    // Build query conditions for client lookup
    const clientConditions = [];
    const clientParams = [];
    let paramIndex = 1;

    if (phone) {
      clientConditions.push(`phone = $${paramIndex++}`);
      clientParams.push(phone);
    }

    if (email) {
      clientConditions.push(`email = $${paramIndex++}`);
      clientParams.push(email);
    }

    const clientWhereClause = clientConditions.join(' OR ');

    // FIRST: Get client info directly (always returns if client exists)
    const clientResult = await query(`
      SELECT
        id,
        name,
        phone,
        email,
        address,
        street,
        street_number,
        colonia,
        city,
        state,
        postal,
        reference_notes
      FROM clients
      WHERE ${clientWhereClause}
      LIMIT 1
    `, clientParams);

    // If no client found at all
    if (clientResult.rows.length === 0) {
      return res.json({
        success: true,
        orders: [],
        clientInfo: null,
        message: 'No se encontró información del cliente'
      });
    }

    const clientData = clientResult.rows[0];

    // SECOND: Get active orders for this client (with shipping label info)
    const ordersResult = await query(`
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
        o.second_payment_proof_url,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id) as shipping_labels_count,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id AND sl.tracking_number IS NOT NULL) as labels_with_tracking,
        json_agg(
          json_build_object(
            'productName', oi.product_name,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.client_id = $1
        AND (o.archive_status IS NULL OR o.archive_status = 'active')
        AND o.approval_status != 'rejected'
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [clientData.id]);

    // Format orders with payment status
    const orders = ordersResult.rows.map(order => ({
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
      totalPriceFormatted: formatCurrency(order.total_price),
      depositAmountFormatted: formatCurrency(order.deposit_amount),
      remainingBalanceFormatted: formatCurrency(order.total_price - order.deposit_amount),
      items: order.items || [],
      clientName: clientData.name,
      // Shipping fields
      secondPaymentReceipt: order.second_payment_proof_url,
      secondPaymentReceived: !!order.second_payment_proof_url, // Derived from having a receipt URL
      shippingLabelsCount: parseInt(order.shipping_labels_count) || 0,
      labelsWithTracking: parseInt(order.labels_with_tracking) || 0,
      allLabelsGenerated: parseInt(order.shipping_labels_count) > 0 && parseInt(order.labels_with_tracking) === parseInt(order.shipping_labels_count)
    }));

    // ALWAYS return clientInfo, even if no active orders
    res.json({
      success: true,
      orders,
      clientInfo: {
        name: clientData.name,
        phone: clientData.phone,
        email: clientData.email,
        address: clientData.address,
        street: clientData.street,
        streetNumber: clientData.street_number,
        colonia: clientData.colonia,
        city: clientData.city,
        state: clientData.state,
        postal: clientData.postal,
        references: clientData.reference_notes
      },
      message: orders.length === 0 ? 'No hay pedidos activos, pero encontramos tu información guardada' : null
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

/**
 * Trigger Make.com webhook for instant phone notifications
 * Configure MAKE_WEBHOOK_URL in environment variables
 */
async function triggerMakeWebhook(data) {
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log('ℹ️  Make.com webhook not configured (MAKE_WEBHOOK_URL not set)');
    return { success: false, reason: 'webhook_not_configured' };
  }

  try {
    console.log('📲 Triggering Make.com webhook for instant notification...');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        source: 'axkan_pedidos',
        environment: process.env.NODE_ENV || 'development'
      })
    });

    if (response.ok) {
      console.log('✅ Make.com webhook triggered successfully');
      return { success: true };
    } else {
      const errorText = await response.text();
      console.error('❌ Make.com webhook failed:', response.status, errorText);
      return { success: false, error: errorText };
    }
  } catch (error) {
    console.error('❌ Error triggering Make.com webhook:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendAdminNotification(orderId, orderNumber, clientName, total, deposit, orderDetails = {}) {
  try {
    // Fetch complete order details from database
    const orderResult = await query(`
      SELECT
        o.*,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        c.street as client_street,
        c.street_number as client_street_number,
        c.colonia as client_colonia,
        c.city as client_city,
        c.state as client_state,
        c.postal as client_postal,
        c.reference_notes as client_references,
        json_agg(
          json_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'line_total', oi.quantity * oi.unit_price
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id, c.name, c.phone, c.email, c.street, c.street_number, c.colonia, c.city, c.state, c.postal, c.reference_notes
    `, [orderId]);

    const order = orderResult.rows[0];
    const items = order.items || [];

    // Build items table HTML
    const itemsTableRows = items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.line_total)}</td>
      </tr>
    `).join('');

    // Calculate remaining balance
    const remainingBalance = total - deposit;

    // Build full address
    const fullAddress = [
      order.client_street,
      order.client_street_number,
      order.client_colonia,
      order.client_city,
      order.client_state,
      order.client_postal ? `CP ${order.client_postal}` : ''
    ].filter(Boolean).join(', ');

    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 650px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .badge { display: inline-block; background: #FEF3C7; color: #92400E; padding: 6px 14px; border-radius: 20px; font-weight: bold; margin-top: 10px; }
          .content { background: white; padding: 25px; border: 1px solid #E5E7EB; }
          .section { margin: 20px 0; padding: 15px; background: #F9FAFB; border-radius: 8px; }
          .section-title { font-size: 14px; text-transform: uppercase; color: #6B7280; font-weight: bold; margin-bottom: 10px; letter-spacing: 0.5px; }
          .info-row { display: flex; margin: 8px 0; }
          .info-label { font-weight: bold; color: #374151; min-width: 120px; }
          .info-value { color: #111827; }
          .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .items-table th { background: #F3F4F6; padding: 12px 10px; text-align: left; font-size: 13px; text-transform: uppercase; color: #6B7280; }
          .totals { background: #ECFDF5; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #D1FAE5; }
          .total-row:last-child { border-bottom: none; font-size: 18px; font-weight: bold; color: #059669; }
          .payment-info { background: #FEF3C7; padding: 15px; border-radius: 8px; border-left: 4px solid #F59E0B; }
          .cta-button { display: inline-block; background: #059669; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin-top: 20px; }
          .footer { background: #F3F4F6; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6B7280; }
          .receipt-image { max-width: 100%; border-radius: 8px; margin-top: 10px; border: 2px solid #E5E7EB; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛒 Nuevo Pedido Recibido</h1>
            <div class="badge">Pendiente de Revisión</div>
          </div>

          <div class="content">
            <!-- Order Info -->
            <div class="section">
              <div class="section-title">📋 Información del Pedido</div>
              <div class="info-row">
                <span class="info-label">Número:</span>
                <span class="info-value"><strong>${orderNumber}</strong></span>
              </div>
              <div class="info-row">
                <span class="info-label">Fecha:</span>
                <span class="info-value">${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              ${order.event_type ? `
              <div class="info-row">
                <span class="info-label">Tipo de Evento:</span>
                <span class="info-value">${order.event_type}</span>
              </div>
              ` : ''}
              ${order.event_date ? `
              <div class="info-row">
                <span class="info-label">Fecha del Evento:</span>
                <span class="info-value" style="color: #7C3AED; font-weight: bold;">${new Date(order.event_date).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              ` : ''}
            </div>

            <!-- Client Info -->
            <div class="section">
              <div class="section-title">👤 Datos del Cliente</div>
              <div class="info-row">
                <span class="info-label">Nombre:</span>
                <span class="info-value">${order.client_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Teléfono:</span>
                <span class="info-value">${order.client_phone}</span>
              </div>
              ${order.client_email ? `
              <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">${order.client_email}</span>
              </div>
              ` : ''}
              <div class="info-row">
                <span class="info-label">Dirección:</span>
                <span class="info-value">${fullAddress || 'No especificada'}</span>
              </div>
              ${order.client_references ? `
              <div class="info-row">
                <span class="info-label">Referencias:</span>
                <span class="info-value">${order.client_references}</span>
              </div>
              ` : ''}
            </div>

            <!-- Products -->
            <div class="section-title" style="margin-top: 25px;">🎁 Productos</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style="text-align: center;">Cantidad</th>
                  <th style="text-align: right;">Precio Unitario</th>
                  <th style="text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsTableRows}
              </tbody>
            </table>

            <!-- Totals -->
            <div class="totals">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>${formatCurrency(total)}</span>
              </div>
              <div class="total-row">
                <span>Anticipo (${order.deposit_amount ? Math.round((deposit / total) * 100) : 50}%):</span>
                <span>${formatCurrency(deposit)}</span>
              </div>
              <div class="total-row">
                <span>Saldo Restante:</span>
                <span style="color: #B45309;">${formatCurrency(remainingBalance)}</span>
              </div>
              <div class="total-row" style="margin-top: 10px; padding-top: 15px; border-top: 2px solid #059669;">
                <span>TOTAL:</span>
                <span>${formatCurrency(total)}</span>
              </div>
            </div>

            <!-- Payment Method -->
            <div class="payment-info">
              <div class="section-title" style="color: #92400E;">💳 Método de Pago</div>
              <p style="margin: 5px 0;">
                <strong>${order.payment_method === 'stripe' ? '💳 Tarjeta (Stripe)' : '🏦 Transferencia Bancaria'}</strong>
              </p>
              ${order.payment_proof_url ? `
              <p style="margin: 10px 0 5px;">Comprobante adjunto:</p>
              <img src="${order.payment_proof_url}" alt="Comprobante de pago" class="receipt-image" style="max-height: 300px;">
              ` : ''}
            </div>

            ${order.client_notes ? `
            <div class="section" style="background: #FEF3C7;">
              <div class="section-title" style="color: #92400E;">📝 Notas del Cliente</div>
              <p style="margin: 5px 0;">${order.client_notes}</p>
            </div>
            ` : ''}

            <div style="text-align: center;">
              <a href="${process.env.ADMIN_DASHBOARD_URL || 'https://vt-souvenir-backend.onrender.com'}/admin/" class="cta-button">
                Ver en Dashboard →
              </a>
            </div>
          </div>

          <div class="footer">
            <p>Este es un correo automático del sistema AXKAN Pedidos.</p>
            <p>Recibido el ${new Date().toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Prepare attachments (receipt image if available)
    const attachments = [];

    // If there's a payment proof URL and it's a downloadable image, we could attach it
    // For now, the image is embedded in the email via URL

    // Send email to admin
    const adminEmail = 'valenciaperezivan24@gmail.com';

    await emailSender.sendEmail({
      to: adminEmail,
      subject: `🛒 Nuevo Pedido: ${orderNumber} - ${clientName}`,
      html: emailBody,
      attachments
    });

    console.log(`✅ Admin notification email sent to ${adminEmail} for order ${orderNumber}`);

    // Also trigger Make.com webhook for instant phone notifications
    await triggerMakeWebhook({
      type: 'new_order',
      orderNumber,
      clientName,
      clientPhone: order.client_phone,
      total,
      deposit,
      paymentMethod: order.payment_method,
      eventDate: order.event_date,
      eventType: order.event_type,
      itemCount: items.length,
      itemsSummary: items.map(i => `${i.quantity}x ${i.product_name}`).join(', '),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error sending admin notification:', error);
    throw error;
  }
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

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as notionAgent from './agents/notion-agent/index.js';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from './utils/google-drive.js';

config();

const app = express();
const PORT = process.env.PORT || 3000;

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'vtanunciando-secret-key-change-in-production';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'VTAnunciando2025!';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for image uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Acceso denegado. Token no proporcionado.'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Token inválido o expirado.'
      });
    }
    req.user = user;
    next();
  });
}

// Serve static files from frontend
app.use('/order', express.static('../frontend/client-order-form'));
app.use('/admin', express.static('../frontend/admin-dashboard'));

// Redirect /admin/login to login.html
app.get('/admin/login', (req, res) => {
  res.redirect('/admin/login.html');
});

// In-memory data storage for demo
const demoOrders = [];
const demoClients = [];
let orderCounter = 1;
let clientCounter = 1;

// Inventory in-memory storage
const demoMaterials = [
  {
    id: 1,
    barcode: 'MAT-001',
    name: 'MDF Board 1.22x2.44m',
    description: 'Standard MDF board for laser cutting',
    unit_type: 'sheets',
    current_stock: 200,
    reserved_stock: 0,
    available_stock: 200,
    min_stock_level: 30,
    reorder_point: 50,
    supplier_name: 'MDF Supplier SA',
    supplier_lead_time_days: 7,
    cost_per_unit: 250.00,
    stock_status: 'healthy',
    active_alerts_count: 0
  },
  {
    id: 2,
    barcode: 'MAT-002',
    name: 'Circular Black Magnets',
    description: 'Small circular magnets for souvenirs',
    unit_type: 'units',
    current_stock: 10000,
    reserved_stock: 0,
    available_stock: 10000,
    min_stock_level: 2000,
    reorder_point: 3000,
    supplier_name: 'Magnet Wholesale Inc',
    supplier_lead_time_days: 10,
    cost_per_unit: 0.50,
    stock_status: 'healthy',
    active_alerts_count: 0
  },
  {
    id: 3,
    barcode: 'MAT-003',
    name: 'Transparent Protective Backs',
    description: 'Clear protective backing for souvenirs',
    unit_type: 'units',
    current_stock: 8000,
    reserved_stock: 0,
    available_stock: 8000,
    min_stock_level: 1500,
    reorder_point: 2500,
    supplier_name: 'Packaging Solutions Ltd',
    supplier_lead_time_days: 5,
    cost_per_unit: 1.20,
    stock_status: 'healthy',
    active_alerts_count: 0
  },
  {
    id: 4,
    barcode: 'MAT-004',
    name: 'Industrial Glue',
    description: 'Strong adhesive for magnets',
    unit_type: 'bottles',
    current_stock: 20,
    reserved_stock: 0,
    available_stock: 20,
    min_stock_level: 5,
    reorder_point: 8,
    supplier_name: 'Adhesives Depot',
    supplier_lead_time_days: 3,
    cost_per_unit: 150.00,
    stock_status: 'healthy',
    active_alerts_count: 0
  }
];

const demoMaterialTransactions = [];
const demoAlerts = [];
let materialCounter = 5;
let transactionCounter = 1;

// Real products from VT Anunciando
const demoProducts = [
  {
    id: 1,
    name: 'Imanes de MDF',
    description: 'Imanes personalizados de MDF con impresión de alta calidad. Disponibles en tamaño chico y grande.',
    category: 'general',
    base_price: 8.00,
    production_cost: 3.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg?v=1234&width=80',
    is_active: true,
    display_order: 1
  },
  {
    id: 2,
    name: 'Llaveros de MDF',
    description: 'Llaveros personalizados de MDF con diseño a tu gusto. Perfectos para souvenirs.',
    category: 'general',
    base_price: 7.00,
    production_cost: 3.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/mockup-llavero.png?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/mockup-llavero.png?v=1234&width=80',
    is_active: true,
    display_order: 2
  },
  {
    id: 3,
    name: 'Imán 3D MDF 3mm',
    description: 'Imanes 3D de MDF de 3mm de grosor con efecto dimensional. Diseño único y llamativo.',
    category: 'general',
    base_price: 15.00,
    production_cost: 6.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/tamasopo.png?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/tamasopo.png?v=1234&width=80',
    is_active: true,
    display_order: 3
  },
  {
    id: 4,
    name: 'Imán de MDF con Foil',
    description: 'Imanes de MDF con acabado de foil metálico. Elegante y brillante para eventos especiales.',
    category: 'general',
    base_price: 13.00,
    production_cost: 5.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/IMAN-FOIL-MOCKUP---vtweb.png?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/IMAN-FOIL-MOCKUP---vtweb.png?v=1234&width=80',
    is_active: true,
    display_order: 4
  },
  {
    id: 5,
    name: 'Destapador de MDF',
    description: 'Destapadores personalizados de MDF. Funcionales y decorativos para cualquier evento.',
    category: 'general',
    base_price: 17.00,
    production_cost: 7.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/DESTAPADOR---VTWEB.png?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/DESTAPADOR---VTWEB.png?v=1234&width=80',
    is_active: true,
    display_order: 5
  },
  {
    id: 6,
    name: 'Botones Metálicos',
    description: 'Botones metálicos personalizados con impresión de alta resolución. Ideales para eventos.',
    category: 'general',
    base_price: 8.00,
    production_cost: 3.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/fotobotones.png?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/fotobotones.png?v=1234&width=80',
    is_active: true,
    display_order: 6
  },
  {
    id: 7,
    name: 'Portallaves de MDF',
    description: 'Portallaves de MDF para colgar en la pared. Personalizados con tu diseño.',
    category: 'general',
    base_price: 45.00,
    production_cost: 18.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/PORTALLAVES-VTWEB.png?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/PORTALLAVES-VTWEB.png?v=1234&width=80',
    is_active: true,
    display_order: 7
  },
  {
    id: 8,
    name: 'Souvenir Box',
    description: 'Paquete completo de souvenirs personalizados. Innovación y precisión en cada detalle.',
    category: 'general',
    base_price: 2250.00,
    production_cost: 1000.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/final-bundle-vtweb2.png?v=1234',
    thumbnail_url: 'https://vtanunciando.com/cdn/shop/files/final-bundle-vtweb2.png?v=1234&width=80',
    is_active: true,
    display_order: 8
  }
];

console.log('\n' + '='.repeat(60));
console.log('🎯 DEMO MODE - Souvenir Management System');
console.log('='.repeat(60));
console.log('⚠️  Running without database - data is temporary');
console.log('📝 To enable full features, install PostgreSQL');
console.log('='.repeat(60) + '\n');

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'demo',
    service: 'Souvenir Management System',
    message: 'Running in demo mode - install PostgreSQL for full functionality',
    timestamp: new Date().toISOString()
  });
});

// Welcome page
app.get('/', (req, res) => {
  res.json({
    welcome: 'Souvenir Management System API',
    mode: 'DEMO MODE',
    status: 'Running',
    agents: [
      {
        name: 'Notion Integration Agent',
        status: 'Ready (requires Notion token)',
        endpoints: ['/api/orders']
      },
      {
        name: 'Analytics & Reporting Agent',
        status: 'Ready (requires database)',
        endpoints: ['/api/analytics', '/api/reports/*']
      }
    ],
    nextSteps: [
      '1. Install PostgreSQL: brew install postgresql (macOS)',
      '2. Configure .env with your Notion credentials',
      '3. Run: npm run init-db',
      '4. Run: npm start'
    ],
    documentation: {
      setup: 'docs/SETUP_GUIDE.md',
      api: 'docs/API_REFERENCE.md',
      quickstart: 'QUICKSTART.md'
    }
  });
});

// Demo: Create order
app.post('/api/orders', (req, res) => {
  const orderData = req.body;

  const order = {
    id: orderCounter++,
    orderNumber: `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${String(orderCounter).padStart(4, '0')}`,
    ...orderData,
    createdAt: new Date().toISOString(),
    status: orderData.status || 'new',
    notionPageId: 'demo-page-id',
    notionPageUrl: 'https://notion.so/demo-page'
  };

  demoOrders.push(order);

  res.status(201).json({
    success: true,
    mode: 'demo',
    message: 'Order created in memory (temporary)',
    data: order,
    note: 'Install PostgreSQL and configure Notion for real order creation'
  });
});

// Demo: Get orders (Protected - admin only)
app.get('/api/orders', authenticateToken, (req, res) => {
  res.json({
    success: true,
    mode: 'demo',
    count: demoOrders.length,
    data: demoOrders
  });
});

// Demo: Analytics
app.get('/api/analytics', (req, res) => {
  const totalRevenue = demoOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const totalCost = demoOrders.reduce((sum, o) => sum + (o.productionCost || 0), 0);
  const profit = totalRevenue - totalCost;

  res.json({
    success: true,
    mode: 'demo',
    data: {
      periodType: req.query.period || 'demo',
      orderCount: demoOrders.length,
      revenue: totalRevenue,
      costs: totalCost,
      profit: profit,
      profitMargin: totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(2) : 0,
      note: 'Demo data only - install PostgreSQL for full analytics'
    }
  });
});

// ========================================
// CLIENT-FACING ROUTES (for order form)
// ========================================

// Get product catalog
app.get('/api/client/products', (req, res) => {
  // Group products by category
  const productsByCategory = demoProducts.reduce((acc, product) => {
    const category = product.category || 'general';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({
      ...product,
      basePriceFormatted: `$${product.base_price.toFixed(2)}`
    });
    return acc;
  }, {});

  res.json({
    success: true,
    products: demoProducts,
    productsByCategory,
    count: demoProducts.length
  });
});

// Submit new order
app.post('/api/client/orders/submit', (req, res) => {
  try {
    const {
      items,
      eventType,
      eventDate,
      clientNotes,
      clientName,
      clientPhone,
      clientEmail,
      clientAddress,
      clientColonia,
      clientCity,
      clientState,
      clientPostal,
      clientReferences,
      paymentMethod
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

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];

    items.forEach(item => {
      const product = demoProducts.find(p => p.id === item.productId);
      if (product) {
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
    });

    const depositAmount = subtotal * 0.5; // 50% deposit

    // Find or create client
    let client = demoClients.find(c => c.phone === clientPhone);
    if (!client) {
      client = {
        id: clientCounter++,
        phone: clientPhone,
        name: clientName,
        email: clientEmail,
        address: clientAddress,
        colonia: clientColonia,
        city: clientCity,
        state: clientState,
        postal: clientPostal,
        references: clientReferences,
        createdAt: new Date().toISOString()
      };
      demoClients.push(client);
    } else {
      // Update client info if they've changed it
      client.name = clientName;
      client.email = clientEmail;
      client.address = clientAddress;
      client.colonia = clientColonia;
      client.city = clientCity;
      client.state = clientState;
      client.postal = clientPostal;
      client.references = clientReferences;
    }

    // Create order
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${String(orderCounter).padStart(4, '0')}`;
    const order = {
      id: orderCounter++,
      orderNumber,
      clientId: client.id,
      clientName: client.name,
      phone: client.phone,
      email: client.email,
      orderDate: new Date().toISOString().split('T')[0],
      eventType,
      eventDate,
      clientNotes,
      totalPrice: subtotal,
      totalProductionCost: orderItems.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0),
      depositAmount,
      paymentMethod,
      approvalStatus: 'pending_review',
      status: 'new',
      department: 'pending',
      depositPaid: false,
      items: orderItems,
      createdAt: new Date().toISOString()
    };

    demoOrders.push(order);

    console.log(`📦 New order created: ${orderNumber} from ${clientName}`);

    // Response based on payment method
    const response = {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotal,
      depositAmount,
      depositAmountFormatted: `$${depositAmount.toFixed(2)}`,
      message: 'Pedido recibido exitosamente'
    };

    if (paymentMethod === 'stripe') {
      response.requiresPayment = true;
      response.nextStep = 'payment';
    } else if (paymentMethod === 'bank_transfer') {
      response.requiresProofUpload = true;
      response.nextStep = 'upload_proof';
      response.bankDetails = {
        bank: 'BBVA',
        account: '012 180 01571714055 4',
        card: '4152 3138 4049 8567',
        accountHolder: 'Iván Valencia'
      };
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar el pedido'
    });
  }
});

// Upload payment proof
app.post('/api/client/orders/:orderId/upload-proof', async (req, res) => {
  const { orderId } = req.params;
  const { proofUrl } = req.body;

  const order = demoOrders.find(o => o.id === parseInt(orderId));

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Pedido no encontrado'
    });
  }

  try {
    let finalProofUrl = proofUrl;

    // If Google Drive is configured, upload the image there
    if (isGoogleDriveConfigured() && proofUrl) {
      console.log(`📤 Uploading payment proof to Google Drive for ${order.orderNumber}...`);

      // Extract mime type from base64 data URL
      const mimeType = proofUrl.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
      const extension = mimeType.split('/')[1] || 'jpg';
      const fileName = `payment-proof-${order.orderNumber}-${Date.now()}.${extension}`;

      const uploadResult = await uploadToGoogleDrive({
        fileData: proofUrl,
        fileName: fileName,
        mimeType: mimeType
      });

      if (uploadResult.success) {
        finalProofUrl = uploadResult.directImageUrl; // Use the direct image URL for displaying
        order.paymentProofDriveId = uploadResult.fileId;
        order.paymentProofDownloadUrl = uploadResult.downloadUrl;
        console.log(`✅ Payment proof uploaded to Drive: ${fileName}`);
      }
    }

    order.paymentProofUrl = finalProofUrl;
    order.paymentProofUploadedAt = new Date().toISOString();

    console.log(`💰 Payment proof uploaded for order ${order.orderNumber}`);

    res.json({
      success: true,
      message: 'Comprobante de pago recibido. Verificaremos tu pago pronto.',
      proofUrl: finalProofUrl
    });
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    // Still save the base64 URL as fallback
    order.paymentProofUrl = proofUrl;
    order.paymentProofUploadedAt = new Date().toISOString();

    res.json({
      success: true,
      message: 'Comprobante de pago recibido. Verificaremos tu pago pronto.',
      proofUrl: proofUrl
    });
  }
});

// Check order status
app.get('/api/client/orders/:orderId/status', (req, res) => {
  const { orderId } = req.params;

  const order = demoOrders.find(o => o.id === parseInt(orderId));

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Pedido no encontrado'
    });
  }

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

  const approvalStatusMap = {
    'pending_review': 'Pendiente de Revisión',
    'approved': 'Aprobado',
    'needs_changes': 'Requiere Cambios',
    'rejected': 'Rechazado'
  };

  res.json({
    success: true,
    order: {
      orderNumber: order.orderNumber,
      status: statusMap[order.status] || order.status,
      approvalStatus: approvalStatusMap[order.approvalStatus] || order.approvalStatus,
      depositPaid: order.depositPaid,
      totalPrice: `$${order.totalPrice.toFixed(2)}`,
      depositAmount: `$${order.depositAmount.toFixed(2)}`
    }
  });
});

// ========================================
// ADMIN AUTHENTICATION ROUTES
// ========================================

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  // Validate credentials
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Generate JWT token (valid for 24 hours)
    const token = jwt.sign(
      { username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`✅ Admin login successful: ${username}`);

    res.json({
      success: true,
      token,
      expiresIn: '24h',
      user: {
        username,
        role: 'admin'
      }
    });
  } else {
    console.log(`❌ Failed login attempt for: ${username}`);
    res.status(401).json({
      success: false,
      error: 'Usuario o contraseña incorrectos'
    });
  }
});

// Verify token
app.get('/api/admin/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ========================================
// INVENTORY MANAGEMENT ROUTES
// ========================================

// Get all materials
app.get('/api/inventory/materials', authenticateToken, (req, res) => {
  res.json({
    success: true,
    count: demoMaterials.length,
    materials: demoMaterials
  });
});

// Get single material
app.get('/api/inventory/materials/:id', authenticateToken, (req, res) => {
  const material = demoMaterials.find(m => m.id === parseInt(req.params.id));

  if (!material) {
    return res.status(404).json({
      success: false,
      error: 'Material not found'
    });
  }

  res.json({
    success: true,
    material
  });
});

// Create material
app.post('/api/inventory/materials', authenticateToken, (req, res) => {
  const {
    name,
    description,
    unit_type,
    current_stock = 0,
    min_stock_level,
    reorder_point,
    supplier_name,
    supplier_lead_time_days = 7,
    cost_per_unit,
    barcode
  } = req.body;

  // Auto-generate barcode if not provided
  const materialBarcode = barcode || `MAT-${String(materialCounter).padStart(3, '0')}`;

  const newMaterial = {
    id: materialCounter++,
    barcode: materialBarcode,
    name,
    description,
    unit_type,
    current_stock: parseFloat(current_stock),
    reserved_stock: 0,
    available_stock: parseFloat(current_stock),
    min_stock_level: parseFloat(min_stock_level),
    reorder_point: parseFloat(reorder_point),
    supplier_name,
    supplier_lead_time_days,
    cost_per_unit: parseFloat(cost_per_unit),
    stock_status: 'healthy',
    active_alerts_count: 0,
    created_at: new Date().toISOString()
  };

  demoMaterials.push(newMaterial);

  console.log(`✅ Material created: ${name} (${materialBarcode})`);

  res.json({
    success: true,
    material: newMaterial
  });
});

// Record purchase
app.post('/api/inventory/purchases', authenticateToken, (req, res) => {
  const {
    materialId,
    quantity,
    unitCost,
    supplierName,
    purchaseOrderNumber,
    notes
  } = req.body;

  const material = demoMaterials.find(m => m.id === parseInt(materialId));

  if (!material) {
    return res.status(404).json({
      success: false,
      error: 'Material not found'
    });
  }

  const stockBefore = material.current_stock;
  const stockAfter = stockBefore + parseFloat(quantity);
  const totalCost = parseFloat(quantity) * parseFloat(unitCost);

  // Update material stock
  material.current_stock = stockAfter;
  material.available_stock = stockAfter - material.reserved_stock;

  // Update stock status
  if (material.available_stock >= material.reorder_point) {
    material.stock_status = 'healthy';
  } else if (material.available_stock >= material.min_stock_level) {
    material.stock_status = 'low';
  } else if (material.available_stock > 0) {
    material.stock_status = 'critical';
  } else {
    material.stock_status = 'out_of_stock';
  }

  // Record transaction
  const transaction = {
    id: transactionCounter++,
    material_id: material.id,
    material_name: material.name,
    transaction_type: 'purchase',
    quantity: parseFloat(quantity),
    stock_before: stockBefore,
    stock_after: stockAfter,
    unit_cost: parseFloat(unitCost),
    total_cost: totalCost,
    supplier_name: supplierName,
    purchase_order_number: purchaseOrderNumber,
    notes,
    performed_by: req.user.username,
    transaction_date: new Date().toISOString()
  };

  demoMaterialTransactions.push(transaction);

  console.log(`📦 Purchase recorded: ${quantity} ${material.unit_type} of ${material.name}`);

  res.json({
    success: true,
    transaction,
    newStock: stockAfter
  });
});

// Adjust stock
app.post('/api/inventory/adjustments', authenticateToken, (req, res) => {
  const {
    materialId,
    newQuantity,
    reason
  } = req.body;

  const material = demoMaterials.find(m => m.id === parseInt(materialId));

  if (!material) {
    return res.status(404).json({
      success: false,
      error: 'Material not found'
    });
  }

  const stockBefore = material.current_stock;
  const difference = parseFloat(newQuantity) - stockBefore;

  // Update material stock
  material.current_stock = parseFloat(newQuantity);
  material.available_stock = parseFloat(newQuantity) - material.reserved_stock;

  // Update stock status
  if (material.available_stock >= material.reorder_point) {
    material.stock_status = 'healthy';
  } else if (material.available_stock >= material.min_stock_level) {
    material.stock_status = 'low';
  } else if (material.available_stock > 0) {
    material.stock_status = 'critical';
  } else {
    material.stock_status = 'out_of_stock';
  }

  // Record transaction
  const transaction = {
    id: transactionCounter++,
    material_id: material.id,
    material_name: material.name,
    transaction_type: 'adjustment',
    quantity: difference,
    stock_before: stockBefore,
    stock_after: parseFloat(newQuantity),
    notes: reason,
    performed_by: req.user.username,
    transaction_date: new Date().toISOString()
  };

  demoMaterialTransactions.push(transaction);

  console.log(`🔧 Stock adjusted: ${material.name} from ${stockBefore} to ${newQuantity}`);

  res.json({
    success: true,
    adjustment: difference,
    newStock: parseFloat(newQuantity)
  });
});

// Get material transactions
app.get('/api/inventory/materials/:id/transactions', authenticateToken, (req, res) => {
  const materialId = parseInt(req.params.id);
  const limit = parseInt(req.query.limit) || 50;

  const transactions = demoMaterialTransactions
    .filter(t => t.material_id === materialId)
    .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))
    .slice(0, limit);

  res.json({
    success: true,
    count: transactions.length,
    transactions
  });
});

// Get material forecast
app.get('/api/inventory/materials/:id/forecast', authenticateToken, (req, res) => {
  const material = demoMaterials.find(m => m.id === parseInt(req.params.id));

  if (!material) {
    return res.status(404).json({
      success: false,
      error: 'Material not found'
    });
  }

  // Calculate consumption from transactions
  const consumptions = demoMaterialTransactions.filter(
    t => t.material_id === material.id && t.transaction_type === 'consumption'
  );

  const now = new Date();
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const consumption7Days = consumptions
    .filter(t => new Date(t.transaction_date) >= last7Days)
    .reduce((sum, t) => sum + Math.abs(t.quantity), 0);

  const consumption30Days = consumptions
    .filter(t => new Date(t.transaction_date) >= last30Days)
    .reduce((sum, t) => sum + Math.abs(t.quantity), 0);

  const avgDailyConsumption = consumption30Days > 0 ? consumption30Days / 30 : 0;

  let daysOfStock = null;
  let estimatedDepletionDate = null;
  let stockStatus = 'healthy';
  let alertLevel = 'healthy';
  let alertMessage = `🟢 ${material.name} stock is healthy`;
  let recommendedAction = 'No action needed';

  if (avgDailyConsumption > 0) {
    daysOfStock = Math.floor(material.available_stock / avgDailyConsumption);
    estimatedDepletionDate = new Date(now.getTime() + daysOfStock * 24 * 60 * 60 * 1000);

    // Determine status
    if (material.available_stock <= 0) {
      stockStatus = 'out_of_stock';
      alertLevel = 'critical';
      alertMessage = `⚫ OUT OF STOCK: ${material.name} has no available stock`;
      recommendedAction = `URGENT: Order immediately! Reserved: ${material.reserved_stock} ${material.unit_type}`;
    } else if (material.available_stock < material.min_stock_level) {
      stockStatus = 'critical';
      alertLevel = 'critical';
      alertMessage = `🔴 CRITICAL: ${material.name} below minimum stock level`;
      recommendedAction = `Order NOW! Lead time: ${material.supplier_lead_time_days} days. Current: ${material.available_stock}, Min: ${material.min_stock_level}`;
    } else if (daysOfStock < material.supplier_lead_time_days) {
      stockStatus = 'critical';
      alertLevel = 'critical';
      alertMessage = `🔴 CRITICAL: ${material.name} will run out in ${daysOfStock} days`;
      recommendedAction = `Order NOW! Stock will deplete before next delivery (${material.supplier_lead_time_days} day lead time)`;
    } else if (material.available_stock < material.reorder_point) {
      stockStatus = 'low';
      alertLevel = 'warning';
      alertMessage = `🟡 WARNING: ${material.name} below reorder point`;
      const orderByDays = Math.max(0, daysOfStock - material.supplier_lead_time_days);
      recommendedAction = `Order within ${orderByDays} days`;
    } else {
      recommendedAction = `Stock sufficient for ${daysOfStock} days. No action needed.`;
    }
  }

  // Update material status
  material.stock_status = stockStatus;

  res.json({
    success: true,
    forecast: {
      materialId: material.id,
      materialName: material.name,
      unitType: material.unit_type,
      currentStock: material.current_stock,
      reservedStock: material.reserved_stock,
      availableStock: material.available_stock,
      minStockLevel: material.min_stock_level,
      reorderPoint: material.reorder_point,
      consumption: {
        last7Days: consumption7Days,
        last30Days: consumption30Days,
        avgDaily: avgDailyConsumption
      },
      forecast: {
        daysOfAvailableStock: daysOfStock,
        estimatedDepletionDate
      },
      status: {
        stockStatus,
        alertLevel,
        alertMessage,
        recommendedAction
      },
      supplier: {
        leadTimeDays: material.supplier_lead_time_days
      }
    }
  });
});

// Get active alerts
app.get('/api/inventory/alerts', authenticateToken, (req, res) => {
  // Generate alerts based on current material status
  const alerts = demoMaterials
    .filter(m => m.stock_status !== 'healthy')
    .map(m => ({
      id: m.id,
      material_id: m.id,
      material_name: m.name,
      alert_level: m.stock_status === 'out_of_stock' || m.stock_status === 'critical' ? 'critical' : 'warning',
      alert_type: m.stock_status === 'out_of_stock' ? 'out_of_stock' : 'low_stock',
      current_stock: m.current_stock,
      available_stock: m.available_stock,
      min_stock_level: m.min_stock_level,
      reorder_point: m.reorder_point,
      is_active: true,
      created_at: new Date().toISOString()
    }));

  res.json({
    success: true,
    count: alerts.length,
    alerts
  });
});

// Get alert summary
app.get('/api/inventory/alerts/summary', authenticateToken, (req, res) => {
  const critical = demoMaterials.filter(m =>
    m.stock_status === 'out_of_stock' || m.stock_status === 'critical'
  ).length;

  const warning = demoMaterials.filter(m => m.stock_status === 'low').length;

  const healthy = demoMaterials.filter(m => m.stock_status === 'healthy').length;

  res.json({
    success: true,
    summary: {
      critical,
      warning,
      healthy,
      total: critical + warning
    }
  });
});

// ========================================
// BARCODE & INVOICE PROCESSING ROUTES
// ========================================

// Get material by barcode
app.get('/api/inventory/materials/barcode/:barcode', authenticateToken, (req, res) => {
  const barcode = req.params.barcode.toUpperCase();

  console.log(`🔍 Looking up material by barcode: ${barcode}`);

  const material = demoMaterials.find(m => m.barcode === barcode);

  if (!material) {
    return res.status(404).json({
      success: false,
      error: 'Material not found'
    });
  }

  console.log(`✅ Material found: ${material.name}`);

  res.json({
    success: true,
    material
  });
});

// Quick receive (optimized for barcode scanner)
app.post('/api/inventory/quick-receive', authenticateToken, (req, res) => {
  const {
    barcode,
    quantity,
    supplier,
    poNumber,
    unitCost
  } = req.body;

  console.log(`📦 Quick receive: ${barcode} x ${quantity}`);

  const material = demoMaterials.find(m => m.barcode === barcode);

  if (!material) {
    return res.status(404).json({
      success: false,
      error: 'Material not found'
    });
  }

  const stockBefore = material.current_stock;
  const stockAfter = stockBefore + parseFloat(quantity);
  const totalCost = unitCost ? parseFloat(quantity) * parseFloat(unitCost) : 0;

  // Update material stock
  material.current_stock = stockAfter;
  material.available_stock = stockAfter - material.reserved_stock;

  // Update stock status
  if (material.available_stock >= material.reorder_point) {
    material.stock_status = 'healthy';
  } else if (material.available_stock >= material.min_stock_level) {
    material.stock_status = 'low';
  } else if (material.available_stock > 0) {
    material.stock_status = 'critical';
  } else {
    material.stock_status = 'out_of_stock';
  }

  // Record transaction
  const transaction = {
    id: transactionCounter++,
    material_id: material.id,
    material_name: material.name,
    transaction_type: 'purchase',
    quantity: parseFloat(quantity),
    stock_before: stockBefore,
    stock_after: stockAfter,
    unit_cost: unitCost ? parseFloat(unitCost) : material.cost_per_unit,
    total_cost: totalCost || (parseFloat(quantity) * material.cost_per_unit),
    supplier_name: supplier || material.supplier_name,
    purchase_order_number: poNumber,
    notes: 'Quick receive via barcode scanner',
    performed_by: req.user.username,
    transaction_date: new Date().toISOString()
  };

  demoMaterialTransactions.push(transaction);

  console.log(`✅ Quick receive completed: ${material.name} - New stock: ${stockAfter}`);

  res.json({
    success: true,
    material: {
      id: material.id,
      name: material.name,
      barcode: material.barcode,
      unit_type: material.unit_type
    },
    transaction: {
      quantity: parseFloat(quantity),
      stockBefore,
      stockAfter,
      timestamp: transaction.transaction_date
    }
  });
});

// Process invoice image
app.post('/api/inventory/invoices/process', authenticateToken, upload.single('invoice'), async (req, res) => {
  try {
    console.log('📸 Processing invoice image...');

    if (!req.file && !req.body.imageData) {
      return res.status(400).json({
        success: false,
        error: 'No image provided'
      });
    }

    // Get image data (either from file upload or base64)
    let imageData;
    if (req.file) {
      imageData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else {
      imageData = req.body.imageData;
    }

    // Simulate AI processing (in production, this would use Claude's vision API)
    // For demo purposes, we'll extract some mock data
    const extractedData = {
      supplier: 'Demo Supplier Inc.',
      invoiceNumber: `INV-${Date.now()}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      lineItems: [
        {
          description: 'MDF Board 1.22x2.44m',
          quantity: 50,
          unitCost: 245.00,
          total: 12250.00,
          matchedMaterial: demoMaterials.find(m => m.name.includes('MDF')),
          matchConfidence: 0.95
        },
        {
          description: 'Black Magnets - Circular',
          quantity: 5000,
          unitCost: 0.48,
          total: 2400.00,
          matchedMaterial: demoMaterials.find(m => m.name.includes('Magnet')),
          matchConfidence: 0.92
        }
      ],
      total: 14650.00,
      notes: 'Extracted via AI vision processing'
    };

    console.log(`✅ Invoice processed: ${extractedData.lineItems.length} items extracted`);

    res.json({
      success: true,
      extractedData
    });

  } catch (error) {
    console.error('Error processing invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process invoice image'
    });
  }
});

// Approve and record invoice
app.post('/api/inventory/invoices/approve', authenticateToken, (req, res) => {
  try {
    const { invoiceData, lineItems } = req.body;

    console.log(`📋 Approving invoice: ${invoiceData.invoiceNumber}`);

    const transactions = [];
    const errors = [];

    // Process each line item
    lineItems.forEach((item, index) => {
      if (!item.materialId) {
        errors.push(`Line ${index + 1}: No material selected`);
        return;
      }

      const material = demoMaterials.find(m => m.id === parseInt(item.materialId));

      if (!material) {
        errors.push(`Line ${index + 1}: Material not found`);
        return;
      }

      const stockBefore = material.current_stock;
      const stockAfter = stockBefore + parseFloat(item.quantity);
      const totalCost = parseFloat(item.quantity) * parseFloat(item.unitCost);

      // Update material stock
      material.current_stock = stockAfter;
      material.available_stock = stockAfter - material.reserved_stock;

      // Update stock status
      if (material.available_stock >= material.reorder_point) {
        material.stock_status = 'healthy';
      } else if (material.available_stock >= material.min_stock_level) {
        material.stock_status = 'low';
      } else if (material.available_stock > 0) {
        material.stock_status = 'critical';
      } else {
        material.stock_status = 'out_of_stock';
      }

      // Record transaction
      const transaction = {
        id: transactionCounter++,
        material_id: material.id,
        material_name: material.name,
        transaction_type: 'purchase',
        quantity: parseFloat(item.quantity),
        stock_before: stockBefore,
        stock_after: stockAfter,
        unit_cost: parseFloat(item.unitCost),
        total_cost: totalCost,
        supplier_name: invoiceData.supplier,
        purchase_order_number: invoiceData.invoiceNumber,
        notes: `Invoice processing: ${invoiceData.invoiceNumber}`,
        performed_by: req.user.username,
        transaction_date: new Date().toISOString()
      };

      demoMaterialTransactions.push(transaction);
      transactions.push(transaction);

      console.log(`✅ Processed: ${material.name} - Qty: ${item.quantity}`);
    });

    if (errors.length > 0) {
      console.log(`⚠️ Invoice approved with ${errors.length} errors`);
    } else {
      console.log(`✅ Invoice fully approved: ${transactions.length} transactions created`);
    }

    res.json({
      success: true,
      transactionsCreated: transactions.length,
      transactions,
      errors
    });

  } catch (error) {
    console.error('Error approving invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve invoice'
    });
  }
});

// Generate QR code labels
app.get('/api/inventory/labels/generate', authenticateToken, (req, res) => {
  const materialIds = req.query.materials ? req.query.materials.split(',').map(id => parseInt(id)) : null;

  console.log('🏷️ Generating labels...');

  // Filter materials if specific IDs provided
  const materialsToLabel = materialIds
    ? demoMaterials.filter(m => materialIds.includes(m.id))
    : demoMaterials;

  // Generate simple QR code data (in production, use a QR code library)
  const labels = materialsToLabel.map(m => ({
    barcode: m.barcode,
    name: m.name,
    currentStock: m.current_stock,
    unitType: m.unit_type,
    qrData: m.barcode // This would be used by QR code generator
  }));

  // Generate printable HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Material Labels - VT Anunciando</title>
  <style>
    @page { margin: 0.5in; size: letter; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .label-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .label {
      border: 2px solid #333;
      padding: 20px;
      border-radius: 8px;
      page-break-inside: avoid;
      height: 3in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .qr-code {
      width: 150px;
      height: 150px;
      background: white;
      border: 2px solid #ddd;
      margin: 10px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #999;
    }
    .barcode-text {
      font-size: 24px;
      font-weight: bold;
      margin: 10px 0;
      font-family: 'Courier New', monospace;
    }
    .material-name {
      font-size: 16px;
      font-weight: bold;
      margin: 5px 0;
    }
    .stock-info {
      font-size: 14px;
      color: #666;
      margin: 5px 0;
    }
    @media print {
      .no-print { display: none; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px;">
    <h2 style="margin: 0 0 10px 0;">Material Labels</h2>
    <p style="margin: 5px 0;">Generated: ${new Date().toLocaleString()}</p>
    <p style="margin: 5px 0;">Total Labels: ${labels.length}</p>
    <button onclick="window.print()" style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 600;">
      🖨️ Print Labels
    </button>
  </div>

  <div class="label-grid">
    ${labels.map(label => `
      <div class="label">
        <div class="barcode-text">${label.barcode}</div>
        <div class="qr-code" id="qr-${label.barcode}"></div>
        <div class="material-name">${label.name}</div>
        <div class="stock-info">Stock: ${label.currentStock} ${label.unitType}</div>
      </div>
    `).join('')}
  </div>

  <script>
    // Generate QR codes for each label
    ${labels.map(label => `
      QRCode.toCanvas(
        document.getElementById('qr-${label.barcode}'),
        '${label.barcode}',
        { width: 150, margin: 1 },
        function(error) { if (error) console.error(error); }
      );
    `).join('\n')}
  </script>
</body>
</html>
  `;

  console.log(`✅ Generated ${labels.length} labels`);

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Generate smart barcode sheet
app.get('/api/inventory/smart-barcodes/sheet', authenticateToken, (req, res) => {
  console.log('🏷️📊 Generating smart barcode sheet...');

  const quantities = [1, 5, 10, 25, 50, 100, 200, 500, 1000];
  const actions = [
    { code: 'ACTION-CONFIRM', label: 'CONFIRM', description: 'Auto-submit transaction', color: '#10b981' },
    { code: 'ACTION-CLEAR', label: 'CLEAR', description: 'Clear current entry', color: '#f59e0b' },
    { code: 'ACTION-CANCEL', label: 'CANCEL', description: 'Close Quick Receive', color: '#ef4444' }
  ];

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Smart Barcode Sheet - VT Anunciando</title>
  <style>
    @page { margin: 0.5in; size: letter; }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border-radius: 12px;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .header p {
      margin: 5px 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: #f3f4f6;
      border-radius: 8px;
      border-left: 4px solid #6366f1;
    }
    .barcode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .barcode-item {
      border: 3px solid;
      padding: 16px;
      border-radius: 12px;
      text-align: center;
      background: white;
      page-break-inside: avoid;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .barcode-item.quantity {
      border-color: #3b82f6;
    }
    .barcode-item.action {
      border-color: #10b981;
    }
    .qr-container {
      width: 120px;
      height: 120px;
      margin: 10px auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .barcode-label {
      font-size: 18px;
      font-weight: 700;
      margin: 8px 0;
      color: #111827;
    }
    .barcode-code {
      font-size: 11px;
      font-family: 'Courier New', monospace;
      color: #6b7280;
      margin-top: 4px;
    }
    .workflow-guide {
      background: #fef3c7;
      border: 3px solid #f59e0b;
      padding: 24px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .workflow-guide h3 {
      margin: 0 0 16px 0;
      font-size: 20px;
      color: #92400e;
    }
    .workflow-steps {
      display: grid;
      gap: 12px;
    }
    .workflow-step {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: white;
      border-radius: 8px;
      font-weight: 600;
    }
    .step-number {
      width: 32px;
      height: 32px;
      background: #f59e0b;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      flex-shrink: 0;
    }
    .tips-box {
      background: #dbeafe;
      border: 3px solid #3b82f6;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .tips-box h3 {
      margin: 0 0 12px 0;
      font-size: 18px;
      color: #1e40af;
    }
    .tips-box ul {
      margin: 0;
      padding-left: 20px;
    }
    .tips-box li {
      margin-bottom: 8px;
      color: #1e3a8a;
    }
    @media print {
      .no-print { display: none; }
      body { background: white; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
</head>
<body>
  <!-- Print Button -->
  <div class="no-print" style="text-align: center; margin-bottom: 20px;">
    <button onclick="window.print()" style="padding: 12px 32px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 700; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      🖨️ Print Smart Barcode Sheet
    </button>
  </div>

  <!-- Header -->
  <div class="header">
    <h1>🏷️📊 SMART BARCODE SHEET</h1>
    <p>VT Anunciando - Inventory Management System</p>
    <p>Keep this sheet near your barcode scanner for fast inventory operations</p>
    <p style="margin-top: 10px; font-size: 12px;">Generated: ${new Date().toLocaleString('es-MX')}</p>
  </div>

  <!-- Workflow Guide -->
  <div class="workflow-guide">
    <h3>⚡ QUICK WORKFLOW GUIDE</h3>
    <div class="workflow-steps">
      <div class="workflow-step">
        <div class="step-number">1</div>
        <div>Scan material barcode (MAT-XXX)</div>
      </div>
      <div class="workflow-step">
        <div class="step-number">2</div>
        <div>Scan quantity barcode (below)</div>
      </div>
      <div class="workflow-step">
        <div class="step-number">3</div>
        <div>Scan CONFIRM to complete transaction</div>
      </div>
      <div class="workflow-step">
        <div class="step-number">4</div>
        <div>Repeat for next item!</div>
      </div>
    </div>
  </div>

  <!-- Quantity Barcodes -->
  <div class="section">
    <div class="section-title">📊 QUANTITY BARCODES (Scan to enter quantity)</div>
    <div class="barcode-grid">
      ${quantities.map(qty => `
        <div class="barcode-item quantity">
          <div class="barcode-label">${qty}</div>
          <div class="qr-container" id="qr-qty-${qty}"></div>
          <div class="barcode-code">QTY-${qty}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- Action Barcodes -->
  <div class="section">
    <div class="section-title">⚡ ACTION BARCODES (Quick commands)</div>
    <div class="barcode-grid">
      ${actions.map(action => `
        <div class="barcode-item action" style="border-color: ${action.color};">
          <div class="barcode-label" style="color: ${action.color};">${action.label}</div>
          <div class="qr-container" id="qr-${action.code}"></div>
          <div class="barcode-code">${action.code}</div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 8px;">${action.description}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- Tips & Best Practices -->
  <div class="tips-box">
    <h3>💡 TIPS FOR FASTEST SCANNING</h3>
    <ul>
      <li><strong>Keep this sheet visible</strong> - Place it near your scanning station</li>
      <li><strong>Use Quick Receive mode</strong> - Click "⚡ Quick Receive" button in inventory view</li>
      <li><strong>Scanner speed</strong> - Most USB scanners work like a keyboard (instant input)</li>
      <li><strong>Auto-submit</strong> - After scanning quantity, transaction auto-submits in 2 seconds or scan CONFIRM immediately</li>
      <li><strong>Error correction</strong> - Scan CLEAR to reset current entry without closing the modal</li>
      <li><strong>Exit quickly</strong> - Scan CANCEL to close Quick Receive mode</li>
      <li><strong>Common quantities</strong> - Print multiple copies and keep them handy for your most-used quantities</li>
    </ul>
  </div>

  <script>
    // Generate QR codes for quantities
    ${quantities.map(qty => `
      QRCode.toCanvas(
        document.getElementById('qr-qty-${qty}'),
        'QTY-${qty}',
        { width: 120, margin: 1 },
        function(error) { if (error) console.error(error); }
      );
    `).join('\n')}

    // Generate QR codes for actions
    ${actions.map(action => `
      QRCode.toCanvas(
        document.getElementById('qr-${action.code}'),
        '${action.code}',
        { width: 120, margin: 1 },
        function(error) { if (error) console.error(error); }
      );
    `).join('\n')}
  </script>
</body>
</html>
  `;

  console.log('✅ Smart barcode sheet generated');

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ========================================
// REFERENCE SHEET GENERATION (Demo)
// ========================================

// Generate reference sheet PDF (demo - returns simple PDF)
app.post('/api/orders/:orderId/reference-sheet', authenticateToken, async (req, res) => {
  const { orderId } = req.params;
  const order = demoOrders.find(o => o.id === parseInt(orderId));

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  // In demo mode, create a simple text response indicating PDF would be generated
  // For full functionality, use the real server with pdfkit
  console.log(`📋 [DEMO] Generating reference sheet for order ${order.orderNumber}`);

  // Return a simple placeholder message
  // In production, this would return actual PDF binary
  res.json({
    success: true,
    mode: 'demo',
    message: 'En modo demo. Para generar PDFs reales, usa el servidor de produccion.',
    orderNumber: order.orderNumber,
    items: order.items?.length || 0
  });
});

// Save reference sheet (demo)
app.post('/api/orders/:orderId/reference-sheet/save', authenticateToken, (req, res) => {
  const { orderId } = req.params;
  const order = demoOrders.find(o => o.id === parseInt(orderId));

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  console.log(`📋 [DEMO] Saving reference sheet for order ${order.orderNumber}`);

  order.productionSheetUrl = `demo://reference-sheet-${order.orderNumber}`;

  res.json({
    success: true,
    mode: 'demo',
    message: 'Reference sheet saved (demo mode)',
    filename: `Referencia_${order.orderNumber}.pdf`
  });
});

// ========================================
// ADMIN ROUTES (Protected)
// ========================================

// Approve order
app.post('/api/orders/:orderId/approve', authenticateToken, async (req, res) => {
  const { orderId } = req.params;

  const order = demoOrders.find(o => o.id === parseInt(orderId));

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Pedido no encontrado'
    });
  }

  order.approvalStatus = 'approved';
  order.status = 'design'; // Move to design stage
  order.department = 'design';

  console.log(`✅ Order ${order.orderNumber} approved by admin`);

  // Create page in Notion
  try {
    const client = demoClients.find(c => c.id === order.clientId);

    const notionData = {
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      clientName: order.clientName,
      clientPhone: client?.phone || 'N/A',
      clientAddress: client?.address || 'N/A',
      clientCity: client?.city || 'N/A',
      clientState: client?.state || 'N/A',
      products: order.items.map(i => i.productName).join(', '),
      quantities: order.items.map(i => `${i.productName}: ${i.quantity}`).join(', '),
      totalPrice: order.totalPrice,
      productionCost: order.totalProductionCost,
      profit: order.totalPrice - order.totalProductionCost,
      profitMargin: ((order.totalPrice - order.totalProductionCost) / order.totalPrice * 100).toFixed(2),
      status: 'Design',
      department: 'Design',
      deliveryDate: order.eventDate,
      notes: order.clientNotes || ''
    };

    const notionResult = await notionAgent.createOrder(notionData);

    if (notionResult.success) {
      order.notionPageId = notionResult.notionPageId;
      order.notionPageUrl = notionResult.notionPageUrl;
      console.log(`📝 Notion page created: ${notionResult.notionPageUrl}`);
    }
  } catch (error) {
    console.error('⚠️ Failed to create Notion page:', error.message);
    // Don't fail the approval if Notion fails
  }

  res.json({
    success: true,
    message: 'Pedido aprobado exitosamente',
    order
  });
});

// Reject order
app.post('/api/orders/:orderId/reject', authenticateToken, (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;

  const order = demoOrders.find(o => o.id === parseInt(orderId));

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Pedido no encontrado'
    });
  }

  order.approvalStatus = 'rejected';
  order.status = 'cancelled';
  order.rejectionReason = reason;

  console.log(`❌ Order ${order.orderNumber} rejected by admin. Reason: ${reason}`);

  res.json({
    success: true,
    message: 'Pedido rechazado',
    order
  });
});

// Demo: System info
app.get('/api/system/info', (req, res) => {
  res.json({
    system: 'Souvenir Management System',
    version: '1.0.0',
    mode: 'DEMO',
    features: {
      notionIntegration: {
        status: 'Configured but not active',
        required: 'Set NOTION_API_TOKEN and NOTION_ORDERS_DATABASE_ID in .env'
      },
      analytics: {
        status: 'Demo mode',
        required: 'Install PostgreSQL and run npm run init-db'
      },
      emailReports: {
        status: 'Disabled in demo',
        required: 'Configure email settings in .env'
      }
    },
    agents: [
      {
        id: 1,
        name: 'Notion Integration Agent',
        description: 'Auto-create order pages in Notion with bidirectional sync',
        status: 'Ready (needs credentials)'
      },
      {
        id: 4,
        name: 'Analytics & Reporting Agent',
        description: 'Automated revenue analytics and email reports',
        status: 'Demo mode (needs database)'
      }
    ],
    endpoints: {
      health: 'GET /health',
      systemInfo: 'GET /api/system/info',
      createOrder: 'POST /api/orders',
      getOrders: 'GET /api/orders',
      analytics: 'GET /api/analytics',
      documentation: 'GET /'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /api/system/info',
      'POST /api/orders',
      'GET /api/orders',
      'GET /api/analytics',
      'GET /api/client/products',
      'POST /api/client/orders/submit',
      'POST /api/client/orders/:orderId/upload-proof',
      'GET /api/client/orders/:orderId/status'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`✅ DEMO SERVER RUNNING`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`💻 Mode: DEMO (temporary data storage)`);
  console.log('='.repeat(60) + '\n');

  console.log('📋 Try these commands:');
  console.log(`   curl http://localhost:${PORT}/`);
  console.log(`   curl http://localhost:${PORT}/api/system/info`);
  console.log(`   curl http://localhost:${PORT}/health`);
  console.log('\n💡 To enable full features:');
  console.log('   1. Install PostgreSQL');
  console.log('   2. Configure Notion credentials in .env');
  console.log('   3. Run: npm run init-db');
  console.log('   4. Run: npm start (instead of demo-server.js)');
  console.log('='.repeat(60) + '\n');
});

export default app;

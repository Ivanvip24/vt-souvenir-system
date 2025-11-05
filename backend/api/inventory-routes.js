/**
 * INVENTORY API ROUTES
 * Integrated inventory management endpoints for the admin panel
 */

import express from 'express';
import { query } from '../shared/database.js';
import MaterialManager from '../agents/inventory/material-manager.js';
import BOMManager from '../agents/inventory/bom-manager.js';
import ForecastingEngine from '../agents/inventory/forecasting-engine.js';
import OrderIntegration from '../agents/inventory/order-integration.js';
import QRCode from 'qrcode';

const router = express.Router();

// =====================================================
// MATERIALS ENDPOINTS
// =====================================================

router.get('/materials', async (req, res) => {
  try {
    const materials = await MaterialManager.getAllMaterials();
    res.json({ success: true, count: materials.length, materials });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/materials/:id', async (req, res) => {
  try {
    const material = await MaterialManager.getMaterialById(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    res.json({ success: true, material });
  } catch (error) {
    console.error('Error fetching material:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/materials', async (req, res) => {
  try {
    const material = await MaterialManager.createMaterial(req.body);
    res.status(201).json({ success: true, material });
  } catch (error) {
    console.error('Error creating material:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/materials/:id', async (req, res) => {
  try {
    const material = await MaterialManager.updateMaterial(req.params.id, req.body);
    res.json({ success: true, material });
  } catch (error) {
    console.error('Error updating material:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/materials/:id/statistics', async (req, res) => {
  try {
    const stats = await MaterialManager.getMaterialStatistics(req.params.id);
    res.json({ success: true, statistics: stats });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/materials/:id/transactions', async (req, res) => {
  try {
    const { limit, type, startDate, endDate } = req.query;
    const transactions = await MaterialManager.getMaterialTransactions(req.params.id, {
      limit: limit ? parseInt(limit) : 50,
      transactionType: type,
      startDate,
      endDate
    });
    res.json({ success: true, count: transactions.length, transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// MATERIAL TRANSACTIONS
// =====================================================

router.post('/materials/:id/purchase', async (req, res) => {
  try {
    const result = await MaterialManager.recordPurchase({
      materialId: req.params.id,
      ...req.body
    });
    await ForecastingEngine.generateAlertForMaterial(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error recording purchase:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/materials/:id/consume', async (req, res) => {
  try {
    const result = await MaterialManager.recordConsumption({
      materialId: req.params.id,
      ...req.body
    });
    await ForecastingEngine.generateAlertForMaterial(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error recording consumption:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/materials/:id/adjust', async (req, res) => {
  try {
    const result = await MaterialManager.adjustStock({
      materialId: req.params.id,
      ...req.body
    });
    await ForecastingEngine.generateAlertForMaterial(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// =====================================================
// FORECASTING & ALERTS
// =====================================================

router.get('/materials/:id/forecast', async (req, res) => {
  try {
    const forecast = await ForecastingEngine.calculateMaterialForecast(req.params.id);
    res.json({ success: true, forecast });
  } catch (error) {
    console.error('Error calculating forecast:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const { level, materialId } = req.query;
    const alerts = await ForecastingEngine.getActiveAlerts({
      alertLevel: level,
      materialId: materialId ? parseInt(materialId) : undefined
    });
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/alerts/summary', async (req, res) => {
  try {
    const summary = await ForecastingEngine.getAlertSummary();
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error fetching alert summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { acknowledgedBy } = req.body;
    const alert = await ForecastingEngine.acknowledgeAlert(req.params.id, acknowledgedBy);
    res.json({ success: true, alert });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/alerts/generate', async (req, res) => {
  try {
    const alerts = await ForecastingEngine.generateAllAlerts();
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Error generating alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// BILL OF MATERIALS (BOM)
// =====================================================

router.get('/products/:id/bom', async (req, res) => {
  try {
    const bom = await BOMManager.getProductBOM(req.params.id);
    res.json({ success: true, count: bom.length, bom });
  } catch (error) {
    console.error('Error fetching BOM:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/products/:id/bom', async (req, res) => {
  try {
    const bomEntry = await BOMManager.addProductMaterial({
      productId: req.params.id,
      ...req.body
    });
    res.status(201).json({ success: true, bomEntry });
  } catch (error) {
    console.error('Error adding BOM entry:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/materials/:id/products', async (req, res) => {
  try {
    const products = await BOMManager.getProductsUsingMaterial(req.params.id);
    res.json({ success: true, count: products.length, products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// ORDER INTEGRATION
// =====================================================

router.get('/orders/:id/materials', async (req, res) => {
  try {
    const requirements = await BOMManager.calculateOrderMaterialRequirements(req.params.id);
    res.json({ success: true, requirements });
  } catch (error) {
    console.error('Error calculating requirements:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/orders/:id/fulfillment', async (req, res) => {
  try {
    const fulfillment = await BOMManager.checkOrderFulfillment(req.params.id);
    res.json({ success: true, ...fulfillment });
  } catch (error) {
    console.error('Error checking fulfillment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/orders/:id/reserve', async (req, res) => {
  try {
    const result = await BOMManager.reserveMaterialsForOrder(req.params.id);
    await ForecastingEngine.generateAllAlerts();
    res.json(result);
  } catch (error) {
    console.error('Error reserving materials:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/orders/:id/release', async (req, res) => {
  try {
    const result = await BOMManager.releaseMaterialsForOrder(req.params.id);
    await ForecastingEngine.generateAllAlerts();
    res.json(result);
  } catch (error) {
    console.error('Error releasing materials:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/orders/:id/reservations', async (req, res) => {
  try {
    const reservations = await BOMManager.getOrderReservations(req.params.id);
    res.json({ success: true, count: reservations.length, reservations });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/orders/check-impact', async (req, res) => {
  try {
    const { orderItems } = req.body;
    const impact = await ForecastingEngine.checkOrderImpactOnInventory(orderItems);
    res.json({ success: true, impact });
  } catch (error) {
    console.error('Error checking impact:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// =====================================================
// DASHBOARD
// =====================================================

router.get('/dashboard/overview', async (req, res) => {
  try {
    const [materials, alertSummary, pendingOrders] = await Promise.all([
      MaterialManager.getAllMaterials(),
      ForecastingEngine.getAlertSummary(),
      BOMManager.calculatePendingOrdersRequirements()
    ]);

    const totalValue = materials.reduce((sum, m) =>
      sum + (parseFloat(m.current_stock) * parseFloat(m.cost_per_unit || 0)), 0
    );

    const criticalMaterials = materials.filter(m => m.stock_status === 'critical' || m.stock_status === 'out_of_stock');
    const lowMaterials = materials.filter(m => m.stock_status === 'low');

    res.json({
      success: true,
      overview: {
        totals: {
          materials: materials.length,
          totalInventoryValue: Math.round(totalValue * 100) / 100,
          criticalMaterials: criticalMaterials.length,
          lowStockMaterials: lowMaterials.length
        },
        alerts: alertSummary,
        materials: materials,
        pendingOrdersRequirements: pendingOrders,
        criticalMaterials: criticalMaterials.map(m => ({
          id: m.id,
          name: m.name,
          status: m.stock_status,
          availableStock: m.available_stock,
          unitType: m.unit_type
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// BARCODE & LABEL GENERATION ENDPOINTS
// =====================================================

// Generate QR code labels for materials
router.get('/labels/generate', async (req, res) => {
  try {
    const materialIds = req.query.materials ? req.query.materials.split(',').map(id => parseInt(id)) : null;

    console.log('🏷️ Generating labels...');

    // Get materials from database
    let materials;
    if (materialIds) {
      const placeholders = materialIds.map((_, i) => `$${i + 1}`).join(',');
      const result = await query(`SELECT * FROM materials WHERE id IN (${placeholders})`, materialIds);
      materials = result.rows;
    } else {
      const result = await query('SELECT * FROM materials WHERE is_active = true');
      materials = result.rows;
    }

    // Generate QR codes as data URLs (server-side)
    const labels = await Promise.all(materials.map(async (m) => {
      const qrDataURL = await QRCode.toDataURL(m.barcode, {
        width: 150,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return {
        barcode: m.barcode,
        name: m.name,
        currentStock: m.current_stock,
        unitType: m.unit_type,
        qrDataURL: qrDataURL
      };
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
    .qr-code img {
      width: 150px;
      height: 150px;
      margin: 10px 0;
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
        <div class="qr-code">
          <img src="${label.qrDataURL}" alt="${label.barcode}" />
        </div>
        <div class="material-name">${label.name}</div>
        <div class="stock-info">Stock: ${label.currentStock} ${label.unitType}</div>
      </div>
    `).join('')}
  </div>
</body>
</html>
    `;

    console.log(`✅ Generated ${labels.length} labels`);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Error generating labels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// SMART BARCODE SHEET
// =====================================================

router.get('/smart-barcodes/sheet', async (req, res) => {
  try {
    console.log('🏷️📊 Generating smart barcode sheet...');

    const quantities = [1, 5, 10, 25, 50, 100, 200, 500, 1000];
    const actions = [
      { code: 'ACTION-CONFIRM', label: 'CONFIRM', description: 'Auto-submit transaction', color: '#10b981' },
      { code: 'ACTION-CLEAR', label: 'CLEAR', description: 'Clear current entry', color: '#f59e0b' },
      { code: 'ACTION-CANCEL', label: 'CANCEL', description: 'Close Quick Receive', color: '#ef4444' }
    ];

    // Generate QR codes for quantities (server-side)
    const quantityQRs = await Promise.all(quantities.map(async (qty) => {
      const qrDataURL = await QRCode.toDataURL(`QTY-${qty}`, {
        width: 120,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      return { qty, qrDataURL };
    }));

    // Generate QR codes for actions (server-side)
    const actionQRs = await Promise.all(actions.map(async (action) => {
      const qrDataURL = await QRCode.toDataURL(action.code, {
        width: 120,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      return { ...action, qrDataURL };
    }));

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
    .qr-container img {
      width: 120px;
      height: 120px;
      margin: 10px auto;
      display: block;
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
      ${quantityQRs.map(q => `
        <div class="barcode-item quantity">
          <div class="barcode-label">${q.qty}</div>
          <div class="qr-container">
            <img src="${q.qrDataURL}" alt="QTY-${q.qty}" />
          </div>
          <div class="barcode-code">QTY-${q.qty}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- Action Barcodes -->
  <div class="section">
    <div class="section-title">⚡ ACTION BARCODES (Quick commands)</div>
    <div class="barcode-grid">
      ${actionQRs.map(action => `
        <div class="barcode-item action" style="border-color: ${action.color};">
          <div class="barcode-label" style="color: ${action.color};">${action.label}</div>
          <div class="qr-container">
            <img src="${action.qrDataURL}" alt="${action.code}" />
          </div>
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
</body>
</html>
    `;

    console.log('✅ Smart barcode sheet generated');

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error generating smart barcodes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

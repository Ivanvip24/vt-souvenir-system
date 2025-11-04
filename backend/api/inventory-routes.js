/**
 * INVENTORY API ROUTES
 * Integrated inventory management endpoints for the admin panel
 */

import express from 'express';
import MaterialManager from '../agents/inventory/material-manager.js';
import BOMManager from '../agents/inventory/bom-manager.js';
import ForecastingEngine from '../agents/inventory/forecasting-engine.js';
import OrderIntegration from '../agents/inventory/order-integration.js';

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

export default router;

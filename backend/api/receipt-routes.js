/**
 * Receipt Analysis API Routes
 * Handles supplier receipt upload, analysis, and storage
 */

import express from 'express';
import multer from 'multer';
import { query, getClient } from '../shared/database.js';
import { uploadImage } from '../shared/cloudinary-config.js';
import { analyzeReceiptFromBase64, matchItemsToMaterials } from '../services/claude-receipt-analyzer.js';
import { authMiddleware } from './admin-routes.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPG, PNG, GIF, WEBP) o archivos PDF'), false);
    }
  }
});

// Apply authentication to all routes
router.use(authMiddleware);

// =====================================================
// RECEIPT ANALYSIS
// =====================================================

/**
 * POST /api/receipts/analyze
 * Upload and analyze a supplier receipt
 */
router.post('/analyze', upload.single('receipt'), async (req, res) => {
  try {
    // Check if Anthropic API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'El servicio de análisis de recibos no está configurado. Falta la clave API de Anthropic.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se recibió ningún archivo'
      });
    }

    console.log(`📤 Processing receipt: ${req.file.originalname} (${req.file.size} bytes)`);

    // Get existing materials for matching
    const materialsResult = await query(`
      SELECT id, name, sku, supplier_name, cost_per_unit
      FROM raw_materials
      WHERE is_active = true
      ORDER BY name
    `);
    const existingMaterials = materialsResult.rows;

    // Convert file to base64
    const base64Data = req.file.buffer.toString('base64');

    // Determine media type
    let mediaType = 'image/jpeg';
    if (req.file.mimetype.includes('png')) {
      mediaType = 'image/png';
    } else if (req.file.mimetype.includes('gif')) {
      mediaType = 'image/gif';
    } else if (req.file.mimetype.includes('webp')) {
      mediaType = 'image/webp';
    }

    // Analyze receipt with Claude
    const analysisResult = await analyzeReceiptFromBase64(base64Data, mediaType, existingMaterials);

    if (!analysisResult.success) {
      return res.status(400).json({
        success: false,
        error: analysisResult.error || 'Error al analizar el recibo'
      });
    }

    // Match items to existing materials
    const itemsWithMatches = matchItemsToMaterials(
      analysisResult.data.items || [],
      existingMaterials
    );

    // Upload image to Cloudinary for storage
    const dataURI = `data:${req.file.mimetype};base64,${base64Data}`;
    const timestamp = Date.now();
    const publicId = `supplier_receipt_${timestamp}`;

    let cloudinaryResult = null;
    try {
      cloudinaryResult = await uploadImage(dataURI, 'supplier-receipts', publicId);
    } catch (uploadError) {
      console.warn('⚠️ Cloudinary upload failed, continuing without image storage:', uploadError.message);
    }

    res.json({
      success: true,
      data: {
        ...analysisResult.data,
        items: itemsWithMatches,
        imageUrl: cloudinaryResult?.url || null,
        imagePublicId: cloudinaryResult?.publicId || null
      },
      analyzedAt: analysisResult.analyzedAt
    });

  } catch (error) {
    console.error('❌ Receipt analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar el recibo'
    });
  }
});

/**
 * POST /api/receipts/save
 * Save analyzed receipt data to database
 */
router.post('/save', async (req, res) => {
  const client = await getClient();

  try {
    const {
      supplier,
      date,
      items,
      grand_total,
      discount,
      imageUrl,
      imagePublicId,
      notes
    } = req.body;

    await client.query('BEGIN');

    // Insert or update supplier
    let supplierId = null;
    if (supplier?.name) {
      const supplierResult = await client.query(`
        INSERT INTO suppliers (name, address, phone)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO UPDATE SET
          address = COALESCE(EXCLUDED.address, suppliers.address),
          phone = COALESCE(EXCLUDED.phone, suppliers.phone),
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [supplier.name, supplier.address, supplier.phone]);

      supplierId = supplierResult.rows[0].id;
    }

    // Insert receipt record
    const receiptResult = await client.query(`
      INSERT INTO supplier_receipts (
        supplier_id,
        folio,
        receipt_date,
        subtotal,
        discount,
        grand_total,
        image_url,
        image_public_id,
        notes,
        raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      supplierId,
      supplier?.folio,
      date,
      grand_total - (discount || 0),
      discount || 0,
      grand_total,
      imageUrl,
      imagePublicId,
      notes,
      JSON.stringify({ supplier, items })
    ]);

    const receiptId = receiptResult.rows[0].id;

    // Insert receipt items and optionally update material costs
    for (const item of items) {
      // Insert receipt item
      await client.query(`
        INSERT INTO supplier_receipt_items (
          receipt_id,
          raw_material_id,
          quantity,
          description,
          dimensions,
          unit_price,
          total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        receiptId,
        item.matched_material_id || null,
        item.quantity,
        item.description,
        item.dimensions,
        item.unit_price,
        item.total
      ]);

      // If matched to a material and cost changed, update the material
      if (item.matched_material_id && item.unit_price) {
        const materialResult = await client.query(`
          SELECT cost_per_unit FROM raw_materials WHERE id = $1
        `, [item.matched_material_id]);

        if (materialResult.rows.length > 0) {
          const currentCost = parseFloat(materialResult.rows[0].cost_per_unit);
          const newCost = parseFloat(item.unit_price);

          if (Math.abs(currentCost - newCost) > 0.01) {
            // Record cost history
            await client.query(`
              INSERT INTO material_cost_history (
                raw_material_id,
                old_cost,
                new_cost,
                source,
                source_reference
              ) VALUES ($1, $2, $3, 'supplier_receipt', $4)
            `, [item.matched_material_id, currentCost, newCost, receiptId.toString()]);

            // Update material cost
            await client.query(`
              UPDATE raw_materials
              SET cost_per_unit = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [newCost, item.matched_material_id]);
          }
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Recibo guardado exitosamente',
      data: {
        receiptId,
        supplierId,
        itemsCount: items.length
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error saving receipt:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al guardar el recibo'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/receipts
 * Get all receipts with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, supplier_id } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [limit, offset];

    if (supplier_id) {
      whereClause = 'WHERE sr.supplier_id = $3';
      params.push(supplier_id);
    }

    const result = await query(`
      SELECT
        sr.id,
        sr.folio,
        sr.receipt_date,
        sr.grand_total,
        sr.image_url,
        sr.created_at,
        s.name as supplier_name,
        (SELECT COUNT(*) FROM supplier_receipt_items WHERE receipt_id = sr.id) as items_count
      FROM supplier_receipts sr
      LEFT JOIN suppliers s ON sr.supplier_id = s.id
      ${whereClause}
      ORDER BY sr.receipt_date DESC, sr.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM supplier_receipts sr
      ${whereClause ? whereClause.replace('$3', '$1') : ''}
    `, supplier_id ? [supplier_id] : []);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total)
      }
    });

  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/receipts/:id
 * Get single receipt with items
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const receiptResult = await query(`
      SELECT
        sr.*,
        s.name as supplier_name,
        s.address as supplier_address,
        s.phone as supplier_phone
      FROM supplier_receipts sr
      LEFT JOIN suppliers s ON sr.supplier_id = s.id
      WHERE sr.id = $1
    `, [id]);

    if (receiptResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Recibo no encontrado'
      });
    }

    const itemsResult = await query(`
      SELECT
        sri.*,
        rm.name as material_name,
        rm.sku as material_sku
      FROM supplier_receipt_items sri
      LEFT JOIN raw_materials rm ON sri.raw_material_id = rm.id
      WHERE sri.receipt_id = $1
      ORDER BY sri.id
    `, [id]);

    res.json({
      success: true,
      data: {
        ...receiptResult.rows[0],
        items: itemsResult.rows
      }
    });

  } catch (error) {
    console.error('Error fetching receipt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/receipts/suppliers/list
 * Get all suppliers
 */
router.get('/suppliers/list', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        s.*,
        COUNT(sr.id) as receipts_count,
        SUM(sr.grand_total) as total_purchased
      FROM suppliers s
      LEFT JOIN supplier_receipts sr ON s.id = sr.supplier_id
      GROUP BY s.id
      ORDER BY s.name
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/receipts/:id
 * Delete a receipt
 */
router.delete('/:id', async (req, res) => {
  const client = await getClient();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Delete items first
    await client.query('DELETE FROM supplier_receipt_items WHERE receipt_id = $1', [id]);

    // Delete receipt
    const result = await client.query('DELETE FROM supplier_receipts WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Recibo no encontrado'
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Recibo eliminado exitosamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting receipt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

// Error handler for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'El archivo es demasiado grande. Tamaño máximo: 15MB'
      });
    }
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  next();
});

export default router;

/**
 * Design Gallery Routes
 * Handles design file storage, categories, and search
 */

import express from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { query } from '../shared/database.js';
import { uploadImage } from '../shared/cloudinary-config.js';
import { isHeicFile, convertHeicToJpeg } from '../shared/heic-utils.js';
import { analyzeDesign } from '../services/design-analyzer.js';
import {
  employeeAuth,
  requireManager,
  requireDepartment,
  logActivity
} from './middleware/employee-auth.js';
import { log, logError } from '../shared/logger.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const isHeic = file.originalname && /\.heic$/i.test(file.originalname);
    if (allowedTypes.includes(file.mimetype) || isHeic) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPG, PNG, GIF, WEBP, HEIC)'), false);
    }
  }
});

// ========================================
// GALLERY ITEMS
// ========================================

/**
 * GET /api/gallery
 * List designs with filters (excludes archived by default)
 */
router.get('/', employeeAuth, async (req, res) => {
  try {
    const { category_id, storage_type, tags, search, include_archived, limit = 200, offset = 0 } = req.query;

    log('info', 'gallery.gallery-request-limit-category-search');

    let sql = `
      SELECT g.*,
             c.name as category_name,
             c.color as category_color,
             e.name as uploaded_by_name,
             ae.name as archived_by_name
      FROM design_gallery g
      LEFT JOIN design_categories c ON g.category_id = c.id
      LEFT JOIN employees e ON g.uploaded_by = e.id
      LEFT JOIN employees ae ON g.archived_by = ae.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    // By default exclude archived designs
    if (include_archived !== 'true') {
      sql += ` AND (g.is_archived = false OR g.is_archived IS NULL)`;
    }

    if (category_id) {
      sql += ` AND g.category_id = $${paramIndex++}`;
      values.push(parseInt(category_id));
    }
    if (storage_type) {
      sql += ` AND g.storage_type = $${paramIndex++}`;
      values.push(storage_type);
    }
    if (tags) {
      // Search for any matching tag
      sql += ` AND g.tags && $${paramIndex++}`;
      values.push(tags.split(','));
    }
    if (search) {
      // Normalize search: remove spaces for phone numbers, etc.
      const normalizedSearch = search.replace(/\s+/g, '');
      sql += ` AND (g.name ILIKE $${paramIndex} OR g.description ILIKE $${paramIndex} OR REPLACE(g.name, ' ', '') ILIKE $${paramIndex + 1} OR REPLACE(g.description, ' ', '') ILIKE $${paramIndex + 1})`;
      values.push(`%${search}%`, `%${normalizedSearch}%`);
      paramIndex += 2;
    }

    sql += ` ORDER BY g.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, values);

    // Get total count
    let countSql = 'SELECT COUNT(*) FROM design_gallery g WHERE 1=1';
    const countValues = [];
    let countIndex = 1;

    if (include_archived !== 'true') {
      countSql += ` AND (g.is_archived = false OR g.is_archived IS NULL)`;
    }

    if (category_id) {
      countSql += ` AND g.category_id = $${countIndex++}`;
      countValues.push(parseInt(category_id));
    }
    if (storage_type) {
      countSql += ` AND g.storage_type = $${countIndex++}`;
      countValues.push(storage_type);
    }
    if (tags) {
      countSql += ` AND g.tags && $${countIndex++}`;
      countValues.push(tags.split(','));
    }
    if (search) {
      const normalizedSearch = search.replace(/\s+/g, '');
      countSql += ` AND (g.name ILIKE $${countIndex} OR g.description ILIKE $${countIndex} OR REPLACE(g.name, ' ', '') ILIKE $${countIndex + 1} OR REPLACE(g.description, ' ', '') ILIKE $${countIndex + 1})`;
      countValues.push(`%${search}%`, `%${normalizedSearch}%`);
    }

    const countResult = await query(countSql, countValues);

    log('info', 'gallery.gallery-response-returning-designs-total');

    res.json({
      success: true,
      designs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logError('gallery.list-gallery-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar diseños'
    });
  }
});

/**
 * GET /api/gallery/archived
 * List only archived designs
 */
router.get('/archived', employeeAuth, async (req, res) => {
  try {
    const { limit = 200, offset = 0 } = req.query;

    const result = await query(
      `SELECT g.*,
              c.name as category_name,
              c.color as category_color,
              e.name as uploaded_by_name,
              ae.name as archived_by_name
       FROM design_gallery g
       LEFT JOIN design_categories c ON g.category_id = c.id
       LEFT JOIN employees e ON g.uploaded_by = e.id
       LEFT JOIN employees ae ON g.archived_by = ae.id
       WHERE g.is_archived = true
       ORDER BY g.archived_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM design_gallery WHERE is_archived = true'
    );

    res.json({
      success: true,
      designs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logError('gallery.list-archived-gallery-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar diseños archivados'
    });
  }
});

/**
 * GET /api/gallery/search
 * Search designs by tags and name
 */
router.get('/search', employeeAuth, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Búsqueda debe tener al menos 2 caracteres'
      });
    }

    // Normalize search: remove spaces for phone numbers, etc.
    const normalizedQ = q.replace(/\s+/g, '');

    const result = await query(
      `SELECT g.*, c.name as category_name
       FROM design_gallery g
       LEFT JOIN design_categories c ON g.category_id = c.id
       WHERE g.name ILIKE $1
          OR g.description ILIKE $1
          OR $2 = ANY(g.tags)
          OR REPLACE(g.name, ' ', '') ILIKE $3
          OR REPLACE(g.description, ' ', '') ILIKE $3
       ORDER BY g.used_in_orders DESC, g.created_at DESC
       LIMIT $4`,
      [`%${q}%`, q.toLowerCase(), `%${normalizedQ}%`, parseInt(limit)]
    );

    res.json({
      success: true,
      designs: result.rows
    });

  } catch (error) {
    logError('gallery.search-gallery-error', error);
    res.status(500).json({
      success: false,
      error: 'Error en búsqueda'
    });
  }
});

/**
 * GET /api/gallery/:id
 * Get single design
 */
router.get('/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT g.*,
              c.name as category_name,
              c.color as category_color,
              e.name as uploaded_by_name
       FROM design_gallery g
       LEFT JOIN design_categories c ON g.category_id = c.id
       LEFT JOIN employees e ON g.uploaded_by = e.id
       WHERE g.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    res.json({
      success: true,
      design: result.rows[0]
    });

  } catch (error) {
    logError('gallery.get-design-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener diseño'
    });
  }
});

/**
 * POST /api/gallery
 * Create new design entry
 * Note: Actual file upload is handled by upload-routes.js (Cloudinary)
 */
router.post('/', employeeAuth, requireDepartment('design'), async (req, res) => {
  try {
    const {
      name,
      description,
      file_url,
      thumbnail_url,
      storage_type,
      external_id,
      category_id,
      tags,
      file_type,
      file_size,
      dimensions
    } = req.body;

    if (!name || !file_url || !storage_type) {
      return res.status(400).json({
        success: false,
        error: 'Nombre, URL y tipo de almacenamiento son requeridos'
      });
    }

    const validStorageTypes = ['cloudinary', 'google_drive'];
    if (!validStorageTypes.includes(storage_type)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de almacenamiento inválido'
      });
    }

    const result = await query(
      `INSERT INTO design_gallery (
        name, description, file_url, thumbnail_url, storage_type,
        external_id, category_id, tags, file_type, file_size,
        dimensions, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        name,
        description,
        file_url,
        thumbnail_url,
        storage_type,
        external_id,
        category_id,
        tags || [],
        file_type,
        file_size,
        dimensions,
        req.employee.id
      ]
    );

    await logActivity(req.employee.id, 'design_uploaded', 'design_gallery', result.rows[0].id, { name });

    res.status(201).json({
      success: true,
      design: result.rows[0]
    });

  } catch (error) {
    logError('gallery.create-design-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear diseño'
    });
  }
});

/**
 * PUT /api/gallery/:id
 * Update design metadata
 */
router.put('/:id', employeeAuth, requireDepartment('design'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, tags } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (category_id !== undefined) {
      updates.push(`category_id = $${paramIndex++}`);
      values.push(category_id);
    }
    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(tags);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await query(
      `UPDATE design_gallery SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    await logActivity(req.employee.id, 'design_updated', 'design_gallery', parseInt(id), req.body);

    res.json({
      success: true,
      design: result.rows[0]
    });

  } catch (error) {
    logError('gallery.update-design-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar diseño'
    });
  }
});

/**
 * DELETE /api/gallery/:id
 * Delete design
 */
router.delete('/:id', employeeAuth, requireDepartment('design'), async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM design_gallery WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    // Only uploader or manager can delete
    if (req.employee.role !== 'manager' && current.rows[0].uploaded_by !== req.employee.id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para eliminar este diseño'
      });
    }

    await query('DELETE FROM design_gallery WHERE id = $1', [id]);

    await logActivity(req.employee.id, 'design_deleted', 'design_gallery', parseInt(id), {
      name: current.rows[0].name
    });

    res.json({
      success: true,
      message: 'Diseño eliminado correctamente'
    });

  } catch (error) {
    logError('gallery.delete-design-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar diseño'
    });
  }
});

/**
 * POST /api/gallery/:id/use
 * Track design usage in an order
 */
router.post('/:id/use', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE design_gallery
       SET used_in_orders = used_in_orders + 1,
           last_used_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    res.json({
      success: true,
      design: result.rows[0]
    });

  } catch (error) {
    logError('gallery.track-design-use-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar uso'
    });
  }
});

/**
 * POST /api/gallery/:id/download
 * Track download and archive the design
 */
router.post('/:id/download', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get current design
    const current = await query('SELECT * FROM design_gallery WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    // Update download count and archive the design
    const result = await query(
      `UPDATE design_gallery
       SET download_count = COALESCE(download_count, 0) + 1,
           is_archived = true,
           archived_at = CURRENT_TIMESTAMP,
           archived_by = $2
       WHERE id = $1
       RETURNING *`,
      [id, req.employee.id]
    );

    await logActivity(req.employee.id, 'design_downloaded', 'design_gallery', parseInt(id), {
      name: current.rows[0].name,
      file_url: current.rows[0].file_url
    });

    res.json({
      success: true,
      design: result.rows[0],
      message: 'Diseño descargado y archivado'
    });

  } catch (error) {
    logError('gallery.download-design-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al descargar diseño'
    });
  }
});

/**
 * POST /api/gallery/:id/archive
 * Archive a design (without download)
 */
router.post('/:id/archive', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE design_gallery
       SET is_archived = true,
           archived_at = CURRENT_TIMESTAMP,
           archived_by = $2
       WHERE id = $1
       RETURNING *`,
      [id, req.employee.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    await logActivity(req.employee.id, 'design_archived', 'design_gallery', parseInt(id), {
      name: result.rows[0].name
    });

    res.json({
      success: true,
      design: result.rows[0],
      message: 'Diseño archivado'
    });

  } catch (error) {
    logError('gallery.archive-design-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al archivar diseño'
    });
  }
});

/**
 * POST /api/gallery/:id/restore
 * Restore an archived design
 */
router.post('/:id/restore', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE design_gallery
       SET is_archived = false,
           archived_at = NULL,
           archived_by = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    await logActivity(req.employee.id, 'design_restored', 'design_gallery', parseInt(id), {
      name: result.rows[0].name
    });

    res.json({
      success: true,
      design: result.rows[0],
      message: 'Diseño restaurado'
    });

  } catch (error) {
    logError('gallery.restore-design-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al restaurar diseño'
    });
  }
});

/**
 * PATCH /api/gallery/:id/visibility
 * Toggle is_public flag (controls whether design appears in public gallery)
 */
router.patch('/:id/visibility', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_public } = req.body;

    if (typeof is_public !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'is_public debe ser true o false'
      });
    }

    const result = await query(
      `UPDATE design_gallery SET is_public = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id, name, is_public`,
      [is_public, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Diseño no encontrado'
      });
    }

    await logActivity(req.employee.id, 'design_visibility_changed', 'design_gallery', parseInt(id), {
      name: result.rows[0].name,
      is_public
    });

    res.json({
      success: true,
      design: result.rows[0],
      message: is_public ? 'Diseño ahora es público' : 'Diseño ahora es privado'
    });

  } catch (error) {
    logError('gallery.visibility-toggle-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar visibilidad'
    });
  }
});

/**
 * POST /api/gallery/reanalyze
 * Re-run AI analysis on designs with generic names (Product_1, etc.)
 * Updates name and description from AI-generated analysis
 */
router.post('/reanalyze', employeeAuth, requireDepartment('design'), async (req, res) => {
  try {
    // Find designs with generic names
    const result = await query(`
      SELECT id, name, file_url FROM design_gallery
      WHERE name ~ '^Product_[0-9]+$'
         OR name ~ '^[A-Za-z0-9_-]+$' AND LENGTH(name) < 20
         AND file_url IS NOT NULL
      ORDER BY id
    `);

    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'No designs with generic names found', updated: 0 });
    }

    let updated = 0;
    const errors = [];

    for (const design of result.rows) {
      try {
        const analysis = await analyzeDesign(design.file_url);
        if (analysis && analysis.title && analysis.title !== design.name) {
          await query(
            `UPDATE design_gallery SET name = $1, description = COALESCE($2, description) WHERE id = $3`,
            [analysis.title, analysis.description || null, design.id]
          );
          log('info', 'gallery.reanalyzed-design');
          updated++;
        }
      } catch (err) {
        errors.push({ id: design.id, name: design.name, error: err.message });
        log('warn', 'gallery.failed-to-reanalyze-design');
      }
    }

    res.json({
      success: true,
      total_checked: result.rows.length,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    logError('gallery.reanalyze-error', error);
    res.status(500).json({ success: false, error: 'Error al re-analizar diseños' });
  }
});

/**
 * GET /api/gallery/stats
 * Get gallery statistics
 */
router.get('/stats/summary', employeeAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE is_archived = false OR is_archived IS NULL) as active_count,
        COUNT(*) FILTER (WHERE is_archived = true) as archived_count,
        COUNT(*) as total_count,
        COALESCE(SUM(download_count), 0) as total_downloads
      FROM design_gallery
    `);

    res.json({
      success: true,
      stats: result.rows[0]
    });

  } catch (error) {
    logError('gallery.gallery-stats-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

// ========================================
// UPLOAD DESIGN
// ========================================

/**
 * POST /api/gallery/upload
 * Upload a new design to the gallery
 */
router.post('/upload', employeeAuth, upload.single('design'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se recibió ningún archivo'
      });
    }

    const { name, description, category_id, tags } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'El nombre es requerido'
      });
    }

    log('info', 'gallery.uploading-design-bytes');

    // Convert HEIC to JPEG if needed
    let fileBuffer = req.file.buffer;
    let fileMimetype = req.file.mimetype;
    if (isHeicFile(req.file)) {
      log('info', 'gallery.converting-heic-to-jpeg');
      const converted = await convertHeicToJpeg(fileBuffer);
      fileBuffer = converted.buffer;
      fileMimetype = converted.mimetype;
    }

    // Convert buffer to base64 data URI for Cloudinary
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${fileMimetype};base64,${b64}`;

    // Generate custom public ID
    const timestamp = Date.now();
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const publicId = `design_${safeName}_${timestamp}`;

    // Upload to Cloudinary
    const uploadResult = await uploadImage(dataURI, 'design-gallery', publicId);

    // Parse tags if provided as string
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }

    // Save to database
    const result = await query(
      `INSERT INTO design_gallery (
        name, description, file_url, thumbnail_url, storage_type,
        external_id, category_id, tags, file_type, file_size,
        dimensions, uploaded_by
      ) VALUES ($1, $2, $3, $4, 'cloudinary', $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        name,
        description || null,
        uploadResult.url,
        uploadResult.url, // Use same URL for thumbnail
        uploadResult.publicId,
        category_id ? parseInt(category_id) : null,
        parsedTags,
        uploadResult.format,
        uploadResult.bytes || req.file.size,
        uploadResult.width && uploadResult.height ? `${uploadResult.width}x${uploadResult.height}` : null,
        req.employee.id
      ]
    );

    await logActivity(req.employee.id, 'design_uploaded', 'design_gallery', result.rows[0].id, { name });

    log('info', 'gallery.design-uploaded-successfully');

    res.status(201).json({
      success: true,
      design: result.rows[0],
      message: 'Diseño subido correctamente'
    });

  } catch (error) {
    logError('gallery.upload-design-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// BATCH DOWNLOAD (ZIP)
// ========================================

/**
 * POST /api/gallery/download-zip
 * Download multiple designs as a ZIP file
 */
router.post('/download-zip', employeeAuth, async (req, res) => {
  try {
    const { design_ids } = req.body;

    if (!design_ids || !Array.isArray(design_ids) || design_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere una lista de IDs de diseños'
      });
    }

    if (design_ids.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Máximo 50 diseños por descarga'
      });
    }

    log('info', 'gallery.creating-zip-with-designs');

    // Get design info from database
    const placeholders = design_ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await query(
      `SELECT id, name, file_url FROM design_gallery WHERE id IN (${placeholders})`,
      design_ids
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontraron los diseños'
      });
    }

    // Set headers for ZIP download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `disenos_${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 5 } // Medium compression for speed
    });

    archive.on('error', (err) => {
      logError('gallery.archive-error', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error al crear el archivo ZIP'
        });
      }
    });

    // Pipe archive to response
    archive.pipe(res);

    // Download and add each design to the archive
    const fetchPromises = result.rows.map(async (design, index) => {
      try {
        const response = await fetch(design.file_url);
        if (!response.ok) {
          log('warn', 'gallery.could-not-fetch-design');
          return null;
        }

        const buffer = await response.arrayBuffer();
        const extension = design.file_url.split('.').pop().split('?')[0] || 'jpg';
        const safeName = design.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s_-]/g, '').substring(0, 50);
        const fileName = `${String(index + 1).padStart(2, '0')}_${safeName}.${extension}`;

        return { fileName, buffer: Buffer.from(buffer) };
      } catch (err) {
        log('warn', 'gallery.error-fetching-design');
        return null;
      }
    });

    const files = await Promise.all(fetchPromises);

    // Add files to archive
    for (const file of files) {
      if (file) {
        archive.append(file.buffer, { name: file.fileName });
      }
    }

    // Mark designs as downloaded (archive them)
    await query(
      `UPDATE design_gallery
       SET download_count = COALESCE(download_count, 0) + 1,
           is_archived = true,
           archived_at = CURRENT_TIMESTAMP,
           archived_by = $1
       WHERE id = ANY($2)`,
      [req.employee.id, design_ids]
    );

    // Log activity
    await logActivity(req.employee.id, 'designs_batch_download', 'design_gallery', null, {
      count: design_ids.length,
      design_ids
    });

    // Finalize archive
    await archive.finalize();

    log('info', 'gallery.zip-created-with-files');

  } catch (error) {
    logError('gallery.zip-download-error', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Error al crear el archivo ZIP'
      });
    }
  }
});

// ========================================
// BATCH UPLOAD WITH AI ANALYSIS
// ========================================

// Configure multer for multiple files (batch upload up to 100)
const uploadMultiple = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max per file
    files: 100 // Max 100 files at once for batch analysis
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const isHeic = file.originalname && /\.heic$/i.test(file.originalname);
    if (allowedTypes.includes(file.mimetype) || isHeic) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPG, PNG, GIF, WEBP, HEIC)'), false);
    }
  }
});

/**
 * POST /api/gallery/upload-multiple
 * Upload multiple designs with optional AI analysis
 */
router.post('/upload-multiple', employeeAuth, uploadMultiple.array('designs', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se recibieron archivos'
      });
    }

    const { category_id, auto_analyze = 'true' } = req.body;
    const useAI = auto_analyze === 'true';

    log('info', 'gallery.uploading-designs-ai');

    const results = [];
    const errors = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];

      try {
        log('info', 'gallery.processing');

        // Convert HEIC to JPEG if needed
        let fileBuffer = file.buffer;
        let fileMimetype = file.mimetype;
        if (isHeicFile(file)) {
          log('info', 'gallery.converting-heic-to-jpeg');
          const converted = await convertHeicToJpeg(fileBuffer);
          fileBuffer = converted.buffer;
          fileMimetype = converted.mimetype;
        }

        // Convert buffer to base64 data URI for Cloudinary
        const b64 = Buffer.from(fileBuffer).toString('base64');
        const dataURI = `data:${fileMimetype};base64,${b64}`;

        // Generate initial name from filename
        const originalName = file.originalname.replace(/\.[^/.]+$/, ''); // Remove extension
        let designName = originalName;
        let tags = [];
        let description = '';

        // AI Analysis
        if (useAI) {
          try {
            const analysis = await analyzeDesign(null, fileBuffer, fileMimetype);

            if (analysis.success) {
              designName = analysis.title || originalName;
              tags = analysis.tags || [];
              description = analysis.description || '';
            }
          } catch (aiError) {
            log('warn', 'gallery.ai-analysis-failed-for');
            // Continue with original name
          }
        }

        // Upload to Cloudinary
        const timestamp = Date.now();
        const safeName = designName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const publicId = `design_${safeName}_${timestamp}_${i}`;

        const uploadResult = await uploadImage(dataURI, 'design-gallery', publicId);

        // Save to database
        const dbResult = await query(
          `INSERT INTO design_gallery (
            name, description, file_url, thumbnail_url, storage_type,
            external_id, category_id, tags, file_type, file_size,
            dimensions, uploaded_by
          ) VALUES ($1, $2, $3, $4, 'cloudinary', $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [
            designName,
            description || null,
            uploadResult.url,
            uploadResult.url,
            uploadResult.publicId,
            category_id ? parseInt(category_id) : null,
            tags,
            uploadResult.format,
            uploadResult.bytes || file.size,
            uploadResult.width && uploadResult.height ? `${uploadResult.width}x${uploadResult.height}` : null,
            req.employee.id
          ]
        );

        results.push({
          success: true,
          originalName: file.originalname,
          design: dbResult.rows[0],
          aiAnalyzed: useAI
        });

        await logActivity(req.employee.id, 'design_uploaded', 'design_gallery', dbResult.rows[0].id, {
          name: designName,
          aiAnalyzed: useAI
        });

      } catch (fileError) {
        log('error', 'gallery.debug');
        errors.push({
          originalName: file.originalname,
          error: fileError.message
        });
      }
    }

    log('info', 'gallery.batch-upload-complete-success-failed');

    res.status(201).json({
      success: true,
      uploaded: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    logError('gallery.batch-upload-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/gallery/analyze
 * Analyze a single design image with AI
 */
router.post('/analyze', employeeAuth, upload.single('design'), async (req, res) => {
  try {
    let imageBuffer = null;
    let mimeType = 'image/jpeg';
    let imageUrl = null;

    if (req.file) {
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Se requiere una imagen (archivo o URL)'
      });
    }

    log('info', 'gallery.analyzing-design');

    const analysis = await analyzeDesign(imageUrl, imageBuffer, mimeType);

    res.json({
      success: analysis.success,
      title: analysis.title,
      tags: analysis.tags,
      description: analysis.description,
      error: analysis.error
    });

  } catch (error) {
    logError('gallery.analysis-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// CATEGORIES
// ========================================

/**
 * GET /api/gallery/categories
 * List all categories
 */
router.get('/categories/list', employeeAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              COUNT(g.id) as design_count
       FROM design_categories c
       LEFT JOIN design_gallery g ON c.id = g.category_id
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`
    );

    res.json({
      success: true,
      categories: result.rows
    });

  } catch (error) {
    logError('gallery.list-categories-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar categorías'
    });
  }
});

/**
 * POST /api/gallery/categories
 * Create category
 */
router.post('/categories', employeeAuth, requireManager, async (req, res) => {
  try {
    const { name, parent_id, description, color, icon, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Nombre es requerido'
      });
    }

    const result = await query(
      `INSERT INTO design_categories (name, parent_id, description, color, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, parent_id, description, color, icon, sort_order || 0]
    );

    res.status(201).json({
      success: true,
      category: result.rows[0]
    });

  } catch (error) {
    logError('gallery.create-category-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear categoría'
    });
  }
});

/**
 * PUT /api/gallery/categories/:id
 * Update category
 */
router.put('/categories/:id', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, description, color, icon, sort_order } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (parent_id !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      values.push(parent_id);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(color);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(icon);
    }
    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(sort_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    values.push(id);

    const result = await query(
      `UPDATE design_categories SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Categoría no encontrada'
      });
    }

    res.json({
      success: true,
      category: result.rows[0]
    });

  } catch (error) {
    logError('gallery.update-category-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar categoría'
    });
  }
});

/**
 * DELETE /api/gallery/categories/:id
 * Delete category (sets designs to null category)
 */
router.delete('/categories/:id', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;

    // Move designs to no category
    await query(
      'UPDATE design_gallery SET category_id = NULL WHERE category_id = $1',
      [id]
    );

    const result = await query(
      'DELETE FROM design_categories WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Categoría no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Categoría eliminada correctamente'
    });

  } catch (error) {
    logError('gallery.delete-category-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar categoría'
    });
  }
});

// ========================================
// TAGS
// ========================================

/**
 * GET /api/gallery/tags
 * Get all unique tags
 */
router.get('/tags/list', employeeAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT unnest(tags) as tag
       FROM design_gallery
       WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
       ORDER BY tag`
    );

    res.json({
      success: true,
      tags: result.rows.map(r => r.tag)
    });

  } catch (error) {
    logError('gallery.list-tags-error', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar etiquetas'
    });
  }
});

export default router;

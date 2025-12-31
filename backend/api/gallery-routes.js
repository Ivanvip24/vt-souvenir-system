/**
 * Design Gallery Routes
 * Handles design file storage, categories, and search
 */

import express from 'express';
import { query } from '../shared/database.js';
import {
  employeeAuth,
  requireManager,
  requireDepartment,
  logActivity
} from './middleware/employee-auth.js';

const router = express.Router();

// ========================================
// GALLERY ITEMS
// ========================================

/**
 * GET /api/gallery
 * List designs with filters (excludes archived by default)
 */
router.get('/', employeeAuth, async (req, res) => {
  try {
    const { category_id, storage_type, tags, search, include_archived, limit = 50, offset = 0 } = req.query;

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
      sql += ` AND (g.name ILIKE $${paramIndex} OR g.description ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
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
      countSql += ` AND (g.name ILIKE $${countIndex} OR g.description ILIKE $${countIndex})`;
      countValues.push(`%${search}%`);
    }

    const countResult = await query(countSql, countValues);

    res.json({
      success: true,
      designs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('List gallery error:', error);
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
    const { limit = 50, offset = 0 } = req.query;

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
    console.error('List archived gallery error:', error);
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

    const result = await query(
      `SELECT g.*, c.name as category_name
       FROM design_gallery g
       LEFT JOIN design_categories c ON g.category_id = c.id
       WHERE g.name ILIKE $1
          OR g.description ILIKE $1
          OR $2 = ANY(g.tags)
       ORDER BY g.used_in_orders DESC, g.created_at DESC
       LIMIT $3`,
      [`%${q}%`, q.toLowerCase(), parseInt(limit)]
    );

    res.json({
      success: true,
      designs: result.rows
    });

  } catch (error) {
    console.error('Search gallery error:', error);
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
    console.error('Get design error:', error);
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
    console.error('Create design error:', error);
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
    console.error('Update design error:', error);
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
    console.error('Delete design error:', error);
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
    console.error('Track design use error:', error);
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
    console.error('Download design error:', error);
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
    console.error('Archive design error:', error);
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
    console.error('Restore design error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al restaurar diseño'
    });
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
    console.error('Gallery stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
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
    console.error('List categories error:', error);
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
    console.error('Create category error:', error);
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
    console.error('Update category error:', error);
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
    console.error('Delete category error:', error);
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
    console.error('List tags error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar etiquetas'
    });
  }
});

export default router;

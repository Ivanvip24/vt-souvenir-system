/**
 * Notes & Workspaces Routes
 * Notion-like document management
 */

import express from 'express';
import { query } from '../shared/database.js';
import {
  employeeAuth,
  requireManager,
  logActivity
} from './middleware/employee-auth.js';

const router = express.Router();

// ========================================
// WORKSPACES
// ========================================

/**
 * GET /api/notes/workspaces
 * List workspaces accessible to current employee
 */
router.get('/workspaces', employeeAuth, async (req, res) => {
  try {
    let sql = `
      SELECT w.*,
             e.name as owner_name,
             (SELECT COUNT(*) FROM notes n WHERE n.workspace_id = w.id) as note_count
      FROM workspaces w
      LEFT JOIN employees e ON w.owner_id = e.id
      WHERE w.is_archived = false
    `;

    // Filter by visibility
    if (req.employee.role !== 'manager') {
      sql += `
        AND (
          w.visibility = 'all'
          OR w.owner_id = $1
          OR (w.visibility = 'department' AND $2 = ANY(w.allowed_departments))
          OR (w.visibility = 'team')
        )
      `;
    }

    sql += ' ORDER BY w.name';

    const values = req.employee.role !== 'manager'
      ? [req.employee.id, req.employee.department]
      : [];

    const result = await query(sql, values);

    res.json({
      success: true,
      workspaces: result.rows
    });

  } catch (error) {
    console.error('List workspaces error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar espacios de trabajo'
    });
  }
});

/**
 * GET /api/notes/workspaces/:id
 * Get single workspace with its notes
 */
router.get('/workspaces/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT w.*, e.name as owner_name
       FROM workspaces w
       LEFT JOIN employees e ON w.owner_id = e.id
       WHERE w.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Espacio de trabajo no encontrado'
      });
    }

    const workspace = result.rows[0];

    // Check access
    if (req.employee.role !== 'manager') {
      const hasAccess =
        workspace.visibility === 'all' ||
        workspace.owner_id === req.employee.id ||
        (workspace.visibility === 'department' && workspace.allowed_departments?.includes(req.employee.department)) ||
        workspace.visibility === 'team';

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a este espacio de trabajo'
        });
      }
    }

    // Get notes in this workspace
    const notes = await query(
      `SELECT n.id, n.title, n.note_type, n.icon, n.parent_id, n.created_at, n.updated_at,
              e.name as created_by_name
       FROM notes n
       LEFT JOIN employees e ON n.created_by = e.id
       WHERE n.workspace_id = $1
       ORDER BY n.title`,
      [id]
    );

    res.json({
      success: true,
      workspace,
      notes: notes.rows
    });

  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener espacio de trabajo'
    });
  }
});

/**
 * POST /api/notes/workspaces
 * Create workspace
 */
router.post('/workspaces', employeeAuth, async (req, res) => {
  try {
    const { name, description, icon, color, visibility, allowed_departments } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Nombre es requerido'
      });
    }

    // Non-managers can only create team or private workspaces
    let finalVisibility = visibility || 'team';
    if (req.employee.role !== 'manager' && !['team', 'private'].includes(finalVisibility)) {
      finalVisibility = 'team';
    }

    const result = await query(
      `INSERT INTO workspaces (name, description, icon, color, owner_id, visibility, allowed_departments)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, description, icon, color, req.employee.id, finalVisibility, allowed_departments || []]
    );

    await logActivity(req.employee.id, 'workspace_created', 'workspace', result.rows[0].id, { name });

    res.status(201).json({
      success: true,
      workspace: result.rows[0]
    });

  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear espacio de trabajo'
    });
  }
});

/**
 * PUT /api/notes/workspaces/:id
 * Update workspace
 */
router.put('/workspaces/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, visibility, allowed_departments, is_archived } = req.body;

    // Check ownership
    const current = await query('SELECT * FROM workspaces WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Espacio de trabajo no encontrado'
      });
    }

    if (req.employee.role !== 'manager' && current.rows[0].owner_id !== req.employee.id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para editar este espacio de trabajo'
      });
    }

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
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(icon);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(color);
    }
    if (visibility && req.employee.role === 'manager') {
      updates.push(`visibility = $${paramIndex++}`);
      values.push(visibility);
    }
    if (allowed_departments !== undefined && req.employee.role === 'manager') {
      updates.push(`allowed_departments = $${paramIndex++}`);
      values.push(allowed_departments);
    }
    if (is_archived !== undefined) {
      updates.push(`is_archived = $${paramIndex++}`);
      values.push(is_archived);
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
      `UPDATE workspaces SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await logActivity(req.employee.id, 'workspace_updated', 'workspace', parseInt(id), req.body);

    res.json({
      success: true,
      workspace: result.rows[0]
    });

  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar espacio de trabajo'
    });
  }
});

/**
 * DELETE /api/notes/workspaces/:id
 * Delete workspace and all its notes
 */
router.delete('/workspaces/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM workspaces WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Espacio de trabajo no encontrado'
      });
    }

    if (req.employee.role !== 'manager' && current.rows[0].owner_id !== req.employee.id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para eliminar este espacio de trabajo'
      });
    }

    // Notes will be deleted via CASCADE
    await query('DELETE FROM workspaces WHERE id = $1', [id]);

    await logActivity(req.employee.id, 'workspace_deleted', 'workspace', parseInt(id), {
      name: current.rows[0].name
    });

    res.json({
      success: true,
      message: 'Espacio de trabajo eliminado correctamente'
    });

  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar espacio de trabajo'
    });
  }
});

// ========================================
// NOTES
// ========================================

/**
 * GET /api/notes
 * List notes (optionally filtered by workspace)
 */
router.get('/', employeeAuth, async (req, res) => {
  try {
    const { workspace_id, note_type, search, limit = 50 } = req.query;

    let sql = `
      SELECT n.*,
             w.name as workspace_name,
             e.name as created_by_name,
             le.name as last_edited_by_name
      FROM notes n
      LEFT JOIN workspaces w ON n.workspace_id = w.id
      LEFT JOIN employees e ON n.created_by = e.id
      LEFT JOIN employees le ON n.last_edited_by = le.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (workspace_id) {
      sql += ` AND n.workspace_id = $${paramIndex++}`;
      values.push(parseInt(workspace_id));
    }
    if (note_type) {
      sql += ` AND n.note_type = $${paramIndex++}`;
      values.push(note_type);
    }
    if (search) {
      sql += ` AND (n.title ILIKE $${paramIndex} OR n.content ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by access (simplified - check workspace visibility)
    if (req.employee.role !== 'manager') {
      sql += `
        AND (
          n.created_by = $${paramIndex}
          OR n.is_public = true
          OR $${paramIndex + 1} = ANY(n.shared_with)
          OR EXISTS (
            SELECT 1 FROM workspaces w2
            WHERE w2.id = n.workspace_id
            AND (
              w2.visibility = 'all'
              OR w2.owner_id = $${paramIndex}
              OR w2.visibility = 'team'
            )
          )
        )
      `;
      values.push(req.employee.id, req.employee.id);
      paramIndex += 2;
    }

    sql += ` ORDER BY n.updated_at DESC LIMIT $${paramIndex}`;
    values.push(parseInt(limit));

    const result = await query(sql, values);

    res.json({
      success: true,
      notes: result.rows
    });

  } catch (error) {
    console.error('List notes error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar notas'
    });
  }
});

/**
 * GET /api/notes/:id
 * Get single note with full content
 */
router.get('/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT n.*,
              w.name as workspace_name,
              e.name as created_by_name,
              le.name as last_edited_by_name
       FROM notes n
       LEFT JOIN workspaces w ON n.workspace_id = w.id
       LEFT JOIN employees e ON n.created_by = e.id
       LEFT JOIN employees le ON n.last_edited_by = le.id
       WHERE n.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }

    const note = result.rows[0];

    // Check access
    if (req.employee.role !== 'manager') {
      const hasAccess =
        note.created_by === req.employee.id ||
        note.is_public ||
        note.shared_with?.includes(req.employee.id);

      if (!hasAccess) {
        // Check workspace access
        if (note.workspace_id) {
          const workspace = await query('SELECT * FROM workspaces WHERE id = $1', [note.workspace_id]);
          if (workspace.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: 'No tienes acceso a esta nota'
            });
          }
          const ws = workspace.rows[0];
          const wsAccess =
            ws.visibility === 'all' ||
            ws.owner_id === req.employee.id ||
            ws.visibility === 'team';

          if (!wsAccess) {
            return res.status(403).json({
              success: false,
              error: 'No tienes acceso a esta nota'
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            error: 'No tienes acceso a esta nota'
          });
        }
      }
    }

    res.json({
      success: true,
      note
    });

  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener nota'
    });
  }
});

/**
 * POST /api/notes
 * Create new note
 */
router.post('/', employeeAuth, async (req, res) => {
  try {
    const {
      title,
      content,
      content_type,
      workspace_id,
      parent_id,
      note_type,
      icon,
      is_public
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Título es requerido'
      });
    }

    // If workspace_id provided, check access
    if (workspace_id) {
      const workspace = await query('SELECT * FROM workspaces WHERE id = $1', [workspace_id]);
      if (workspace.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Espacio de trabajo no encontrado'
        });
      }
    }

    const result = await query(
      `INSERT INTO notes (
        title, content, content_type, workspace_id, parent_id,
        note_type, icon, is_public, created_by, last_edited_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      RETURNING *`,
      [
        title,
        content || '',
        content_type || 'markdown',
        workspace_id,
        parent_id,
        note_type || 'document',
        icon,
        is_public || false,
        req.employee.id
      ]
    );

    await logActivity(req.employee.id, 'note_created', 'note', result.rows[0].id, { title });

    res.status(201).json({
      success: true,
      note: result.rows[0]
    });

  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear nota'
    });
  }
});

/**
 * PUT /api/notes/:id
 * Update note
 */
router.put('/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, icon, cover_image_url, is_public, shared_with, parent_id, workspace_id } = req.body;

    // Get current note
    const current = await query('SELECT * FROM notes WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }

    const note = current.rows[0];

    // Check permission (creator, shared with, or manager)
    if (req.employee.role !== 'manager' &&
        note.created_by !== req.employee.id &&
        !note.shared_with?.includes(req.employee.id)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para editar esta nota'
      });
    }

    const updates = ['last_edited_by = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [req.employee.id];
    let paramIndex = 2;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(icon);
    }
    if (cover_image_url !== undefined) {
      updates.push(`cover_image_url = $${paramIndex++}`);
      values.push(cover_image_url);
    }
    if (is_public !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      values.push(is_public);
    }
    if (shared_with !== undefined) {
      updates.push(`shared_with = $${paramIndex++}`);
      values.push(shared_with);
    }
    if (parent_id !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      values.push(parent_id);
    }
    if (workspace_id !== undefined) {
      updates.push(`workspace_id = $${paramIndex++}`);
      values.push(workspace_id);
    }

    values.push(id);

    const result = await query(
      `UPDATE notes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    res.json({
      success: true,
      note: result.rows[0]
    });

  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar nota'
    });
  }
});

/**
 * DELETE /api/notes/:id
 * Delete note
 */
router.delete('/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM notes WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }

    const note = current.rows[0];

    // Only creator or manager can delete
    if (req.employee.role !== 'manager' && note.created_by !== req.employee.id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para eliminar esta nota'
      });
    }

    // Delete child notes first
    await query('DELETE FROM notes WHERE parent_id = $1', [id]);
    await query('DELETE FROM notes WHERE id = $1', [id]);

    await logActivity(req.employee.id, 'note_deleted', 'note', parseInt(id), {
      title: note.title
    });

    res.json({
      success: true,
      message: 'Nota eliminada correctamente'
    });

  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar nota'
    });
  }
});

/**
 * POST /api/notes/:id/share
 * Share note with employees
 */
router.post('/:id/share', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { employee_ids } = req.body;

    const current = await query('SELECT * FROM notes WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }

    const note = current.rows[0];

    // Only creator or manager can share
    if (req.employee.role !== 'manager' && note.created_by !== req.employee.id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para compartir esta nota'
      });
    }

    const result = await query(
      `UPDATE notes
       SET shared_with = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [employee_ids || [], id]
    );

    await logActivity(req.employee.id, 'note_shared', 'note', parseInt(id), {
      shared_with: employee_ids
    });

    res.json({
      success: true,
      note: result.rows[0]
    });

  } catch (error) {
    console.error('Share note error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al compartir nota'
    });
  }
});

/**
 * POST /api/notes/:id/duplicate
 * Duplicate a note (as template)
 */
router.post('/:id/duplicate', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, workspace_id } = req.body;

    const current = await query('SELECT * FROM notes WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nota no encontrada'
      });
    }

    const note = current.rows[0];

    const result = await query(
      `INSERT INTO notes (
        title, content, content_type, workspace_id, note_type,
        icon, created_by, last_edited_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      RETURNING *`,
      [
        title || `${note.title} (copia)`,
        note.content,
        note.content_type,
        workspace_id || note.workspace_id,
        'document',
        note.icon,
        req.employee.id
      ]
    );

    await logActivity(req.employee.id, 'note_duplicated', 'note', result.rows[0].id, {
      original_id: parseInt(id)
    });

    res.status(201).json({
      success: true,
      note: result.rows[0]
    });

  } catch (error) {
    console.error('Duplicate note error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al duplicar nota'
    });
  }
});

// ========================================
// TEMPLATES
// ========================================

/**
 * GET /api/notes/templates/list
 * List note templates
 */
router.get('/templates/list', employeeAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT n.*, e.name as created_by_name
       FROM notes n
       LEFT JOIN employees e ON n.created_by = e.id
       WHERE n.note_type = 'template'
       ORDER BY n.title`
    );

    res.json({
      success: true,
      templates: result.rows
    });

  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar plantillas'
    });
  }
});

export default router;

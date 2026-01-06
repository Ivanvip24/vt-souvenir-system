/**
 * Task Management Routes
 * Handles task CRUD, assignments, and queues
 */

import express from 'express';
import { query } from '../shared/database.js';
import {
  employeeAuth,
  requireManager,
  requireDepartment,
  logActivity
} from './middleware/employee-auth.js';
import {
  createManualTask,
  updateTaskStatus,
  assignTask,
  getDepartmentQueue,
  getEmployeeTasks
} from '../services/task-generator.js';

const router = express.Router();

// ========================================
// TASK QUERIES
// ========================================

/**
 * GET /api/tasks
 * List tasks with filters
 */
router.get('/', employeeAuth, async (req, res) => {
  try {
    const { department, status, priority, assigned_to, order_id, limit = 100 } = req.query;

    let sql = `
      SELECT t.*,
             o.order_number,
             c.name as client_name,
             e.name as assigned_to_name,
             ab.name as assigned_by_name
      FROM tasks t
      LEFT JOIN orders o ON t.order_id = o.id
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN employees e ON t.assigned_to = e.id
      LEFT JOIN employees ab ON t.assigned_by = ab.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    // Non-managers can only see their department's tasks
    if (req.employee.role !== 'manager') {
      sql += ` AND t.department = $${paramIndex++}`;
      values.push(req.employee.department);
    } else if (department) {
      sql += ` AND t.department = $${paramIndex++}`;
      values.push(department);
    }

    if (status) {
      sql += ` AND t.status = $${paramIndex++}`;
      values.push(status);
    }
    if (priority) {
      sql += ` AND t.priority = $${paramIndex++}`;
      values.push(priority);
    }
    if (assigned_to) {
      sql += ` AND t.assigned_to = $${paramIndex++}`;
      values.push(parseInt(assigned_to));
    }
    if (order_id) {
      sql += ` AND t.order_id = $${paramIndex++}`;
      values.push(parseInt(order_id));
    }

    sql += `
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
      LIMIT $${paramIndex}
    `;
    values.push(parseInt(limit));

    const result = await query(sql, values);

    res.json({
      success: true,
      tasks: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar tareas'
    });
  }
});

/**
 * GET /api/tasks/my-tasks
 * Get tasks assigned to current employee + unassigned tasks in their department
 */
router.get('/my-tasks', employeeAuth, async (req, res) => {
  try {
    const { include_completed } = req.query;
    const tasks = await getEmployeeTasks(
      req.employee.id,
      include_completed === 'true',
      req.employee.department
    );

    res.json({
      success: true,
      tasks,
      total: tasks.length
    });

  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mis tareas'
    });
  }
});

/**
 * GET /api/tasks/queue/:department
 * Get department task queue
 */
router.get('/queue/:department', employeeAuth, async (req, res) => {
  try {
    const { department } = req.params;

    // Non-managers can only see their own department
    if (req.employee.role !== 'manager' && req.employee.department !== department) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este departamento'
      });
    }

    const tasks = await getDepartmentQueue(department);

    res.json({
      success: true,
      department,
      tasks,
      total: tasks.length
    });

  } catch (error) {
    console.error('Get department queue error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener cola del departamento'
    });
  }
});

/**
 * GET /api/tasks/:id
 * Get single task
 */
router.get('/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*,
              o.order_number,
              o.status as order_status,
              c.name as client_name,
              c.phone as client_phone,
              e.name as assigned_to_name,
              ab.name as assigned_by_name
       FROM tasks t
       LEFT JOIN orders o ON t.order_id = o.id
       LEFT JOIN clients c ON o.client_id = c.id
       LEFT JOIN employees e ON t.assigned_to = e.id
       LEFT JOIN employees ab ON t.assigned_by = ab.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    const task = result.rows[0];

    // Non-managers can only see their department's tasks
    if (req.employee.role !== 'manager' && task.department !== req.employee.department) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tarea'
      });
    }

    res.json({
      success: true,
      task
    });

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener tarea'
    });
  }
});

// ========================================
// TASK CREATION
// ========================================

/**
 * POST /api/tasks
 * Create a new manual task
 */
router.post('/', employeeAuth, async (req, res) => {
  try {
    const { title, description, department, priority, assigned_to, due_date, order_id, estimated_minutes } = req.body;

    if (!title || !department) {
      return res.status(400).json({
        success: false,
        error: 'Título y departamento son requeridos'
      });
    }

    // Non-managers can only create tasks in their department
    if (req.employee.role !== 'manager' && department !== req.employee.department) {
      return res.status(403).json({
        success: false,
        error: 'Solo puedes crear tareas en tu departamento'
      });
    }

    // Only managers can assign tasks to others
    let assignedTo = null;
    if (assigned_to) {
      if (req.employee.role !== 'manager') {
        // Non-managers can only assign to themselves
        if (parseInt(assigned_to) !== req.employee.id) {
          return res.status(403).json({
            success: false,
            error: 'Solo los gerentes pueden asignar tareas a otros'
          });
        }
      }
      assignedTo = parseInt(assigned_to);
    }

    const task = await createManualTask({
      title,
      description,
      department,
      priority: priority || 'normal',
      assignedTo,
      assignedBy: assignedTo ? req.employee.id : null,
      dueDate: due_date,
      orderId: order_id ? parseInt(order_id) : null,
      estimatedMinutes: estimated_minutes ? parseInt(estimated_minutes) : null
    });

    await logActivity(req.employee.id, 'task_created', 'task', task.id, { title, department });

    res.status(201).json({
      success: true,
      task
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear tarea'
    });
  }
});

// ========================================
// TASK UPDATES
// ========================================

/**
 * PUT /api/tasks/:id
 * Update task details
 */
router.put('/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, due_date, estimated_minutes, notes } = req.body;

    // Get current task
    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    const task = current.rows[0];

    // Non-managers can only update tasks in their department
    if (req.employee.role !== 'manager' && task.department !== req.employee.department) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para modificar esta tarea'
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (due_date !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(due_date);
    }
    if (estimated_minutes !== undefined) {
      updates.push(`estimated_minutes = $${paramIndex++}`);
      values.push(estimated_minutes);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
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
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await logActivity(req.employee.id, 'task_updated', 'task', parseInt(id), req.body);

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar tarea'
    });
  }
});

/**
 * PUT /api/tasks/:id/status
 * Update task status
 */
router.put('/:id/status', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actual_minutes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Estado es requerido'
      });
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled', 'blocked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Estado inválido'
      });
    }

    // Get current task
    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    const task = current.rows[0];

    // Non-managers can only update tasks in their department
    if (req.employee.role !== 'manager' && task.department !== req.employee.department) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para modificar esta tarea'
      });
    }

    let sql = `
      UPDATE tasks SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
    `;
    const values = [status];
    let paramIndex = 2;

    if (status === 'in_progress') {
      sql += `, started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`;
    } else if (status === 'completed') {
      sql += `, completed_at = CURRENT_TIMESTAMP`;
      if (actual_minutes) {
        sql += `, actual_minutes = $${paramIndex++}`;
        values.push(parseInt(actual_minutes));
      }
    }

    sql += ` WHERE id = $${paramIndex} RETURNING *`;
    values.push(id);

    const result = await query(sql, values);

    await logActivity(req.employee.id, `task_${status}`, 'task', parseInt(id), {
      previous_status: task.status
    });

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar estado'
    });
  }
});

/**
 * POST /api/tasks/:id/start
 * Start working on a task (set status to in_progress)
 */
router.post('/:id/start', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    const task = current.rows[0];

    // Check department access
    if (req.employee.role !== 'manager' && task.department !== req.employee.department) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tarea'
      });
    }

    // Can only start pending tasks
    if (task.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden iniciar tareas pendientes'
      });
    }

    // Auto-assign to current employee if not assigned
    const updates = [
      'status = $1',
      'started_at = CURRENT_TIMESTAMP',
      'updated_at = CURRENT_TIMESTAMP'
    ];
    const values = ['in_progress'];
    let paramIndex = 2;

    if (!task.assigned_to) {
      updates.push(`assigned_to = $${paramIndex++}`);
      values.push(req.employee.id);
    }

    values.push(id);

    const result = await query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await logActivity(req.employee.id, 'task_started', 'task', parseInt(id));

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    console.error('Start task error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar tarea'
    });
  }
});

/**
 * POST /api/tasks/:id/complete
 * Mark task as completed
 */
router.post('/:id/complete', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { actual_minutes, notes } = req.body;

    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    const task = current.rows[0];

    // Check department access
    if (req.employee.role !== 'manager' && task.department !== req.employee.department) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tarea'
      });
    }

    // Can only complete in_progress or pending tasks
    if (!['pending', 'in_progress'].includes(task.status)) {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden completar tareas pendientes o en progreso'
      });
    }

    const updates = [
      'status = $1',
      'completed_at = CURRENT_TIMESTAMP',
      'updated_at = CURRENT_TIMESTAMP'
    ];
    const values = ['completed'];
    let paramIndex = 2;

    if (actual_minutes) {
      updates.push(`actual_minutes = $${paramIndex++}`);
      values.push(parseInt(actual_minutes));
    }

    if (notes) {
      updates.push(`notes = COALESCE(notes || E'\\n', '') || $${paramIndex++}`);
      values.push(notes);
    }

    // Auto-assign if not assigned
    if (!task.assigned_to) {
      updates.push(`assigned_to = $${paramIndex++}`);
      values.push(req.employee.id);
    }

    values.push(id);

    const result = await query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await logActivity(req.employee.id, 'task_completed', 'task', parseInt(id), {
      actual_minutes
    });

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al completar tarea'
    });
  }
});

/**
 * PUT /api/tasks/:id/assign
 * Assign task to an employee (Manager only)
 */
router.put('/:id/assign', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!assigned_to) {
      return res.status(400).json({
        success: false,
        error: 'Empleado a asignar es requerido'
      });
    }

    // Verify employee exists and is active
    const employee = await query(
      'SELECT id, name, department FROM employees WHERE id = $1 AND is_active = true',
      [assigned_to]
    );

    if (employee.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Empleado no encontrado o inactivo'
      });
    }

    const task = await assignTask(parseInt(id), parseInt(assigned_to), req.employee.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    await logActivity(req.employee.id, 'task_assigned', 'task', parseInt(id), {
      assigned_to: employee.rows[0].name
    });

    res.json({
      success: true,
      task
    });

  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al asignar tarea'
    });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task (Manager only, or creator for manual tasks)
 */
router.delete('/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    const task = current.rows[0];

    // Only managers can delete order tasks
    if (task.task_type === 'order_task' && req.employee.role !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Solo los gerentes pueden eliminar tareas de pedidos'
      });
    }

    // Non-managers can only delete their own manual tasks
    if (req.employee.role !== 'manager') {
      if (task.assigned_by !== req.employee.id && task.assigned_to !== req.employee.id) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permiso para eliminar esta tarea'
        });
      }
    }

    await query('DELETE FROM tasks WHERE id = $1', [id]);

    await logActivity(req.employee.id, 'task_deleted', 'task', parseInt(id), {
      title: task.title
    });

    res.json({
      success: true,
      message: 'Tarea eliminada correctamente'
    });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar tarea'
    });
  }
});

// ========================================
// TASK TEMPLATES (Manager only)
// ========================================

/**
 * GET /api/tasks/templates
 * List task templates
 */
router.get('/templates/list', employeeAuth, requireManager, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM task_templates ORDER BY sort_order, trigger_status'
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

/**
 * POST /api/tasks/templates
 * Create task template
 */
router.post('/templates', employeeAuth, requireManager, async (req, res) => {
  try {
    const { name, description, department, trigger_status, priority, estimated_minutes, sort_order } = req.body;

    if (!name || !department || !trigger_status) {
      return res.status(400).json({
        success: false,
        error: 'Nombre, departamento y estado disparador son requeridos'
      });
    }

    const result = await query(
      `INSERT INTO task_templates (name, description, department, trigger_status, priority, estimated_minutes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, description, department, trigger_status, priority || 'normal', estimated_minutes, sort_order || 0]
    );

    res.status(201).json({
      success: true,
      template: result.rows[0]
    });

  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear plantilla'
    });
  }
});

/**
 * PUT /api/tasks/templates/:id
 * Update task template
 */
router.put('/templates/:id', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, department, trigger_status, priority, estimated_minutes, is_active, sort_order } = req.body;

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
    if (department) {
      updates.push(`department = $${paramIndex++}`);
      values.push(department);
    }
    if (trigger_status) {
      updates.push(`trigger_status = $${paramIndex++}`);
      values.push(trigger_status);
    }
    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (estimated_minutes !== undefined) {
      updates.push(`estimated_minutes = $${paramIndex++}`);
      values.push(estimated_minutes);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
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
      `UPDATE task_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plantilla no encontrada'
      });
    }

    res.json({
      success: true,
      template: result.rows[0]
    });

  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar plantilla'
    });
  }
});

/**
 * DELETE /api/tasks/templates/:id
 * Delete task template
 */
router.delete('/templates/:id', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM task_templates WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plantilla no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Plantilla eliminada correctamente'
    });

  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar plantilla'
    });
  }
});

export default router;

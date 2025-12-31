/**
 * Task Generator Service
 * Automatically generates tasks when order status changes
 */

import { query } from '../shared/database.js';

/**
 * Department mapping for order statuses
 */
const STATUS_DEPARTMENT_MAP = {
  'new': 'design',
  'pending': 'design',
  'approved': 'design',
  'design': 'design',
  'printing': 'production',
  'cutting': 'production',
  'counting': 'production',
  'shipping': 'shipping',
  'delivered': 'shipping'
};

/**
 * Get the department responsible for a given order status
 */
export function getDepartmentForStatus(status) {
  return STATUS_DEPARTMENT_MAP[status] || 'design';
}

/**
 * Generate tasks for an order based on the new status
 * Uses task_templates table to determine which tasks to create
 */
export async function generateTasksForOrder(orderId, newStatus) {
  try {
    // Find templates that match this status trigger
    const templates = await query(
      `SELECT * FROM task_templates
       WHERE trigger_status = $1 AND is_active = true
       ORDER BY sort_order`,
      [newStatus]
    );

    if (templates.rows.length === 0) {
      console.log(`No task templates found for status: ${newStatus}`);
      return [];
    }

    // Get order info for task context
    const orderResult = await query(
      `SELECT o.id, o.order_number, c.name as client_name
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      console.error(`Order not found: ${orderId}`);
      return [];
    }

    const order = orderResult.rows[0];
    const createdTasks = [];

    for (const template of templates.rows) {
      // Check if this task already exists for this order
      const existing = await query(
        `SELECT id FROM tasks
         WHERE order_id = $1
           AND title = $2
           AND task_type = 'order_task'`,
        [orderId, template.name]
      );

      if (existing.rows.length > 0) {
        console.log(`Task already exists: ${template.name} for order ${orderId}`);
        continue;
      }

      // Create the task
      const taskDescription = `${template.description || template.name} - Pedido #${order.order_number} (${order.client_name})`;

      const task = await query(
        `INSERT INTO tasks (
          title, description, task_type, department, priority,
          order_id, estimated_minutes, status
        ) VALUES ($1, $2, 'order_task', $3, $4, $5, $6, 'pending')
        RETURNING *`,
        [
          template.name,
          taskDescription,
          template.department,
          template.priority,
          orderId,
          template.estimated_minutes
        ]
      );

      createdTasks.push(task.rows[0]);
      console.log(`Created task: ${template.name} for order ${orderId}`);
    }

    return createdTasks;

  } catch (error) {
    console.error('Error generating tasks for order:', error);
    throw error;
  }
}

/**
 * Complete pending tasks from previous department when order status changes
 */
export async function completePreviousDepartmentTasks(orderId, oldStatus) {
  try {
    const previousDepartment = getDepartmentForStatus(oldStatus);

    const result = await query(
      `UPDATE tasks
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1
         AND department = $2
         AND status IN ('pending', 'in_progress')
       RETURNING id, title`,
      [orderId, previousDepartment]
    );

    if (result.rows.length > 0) {
      console.log(`Auto-completed ${result.rows.length} tasks for order ${orderId} in department ${previousDepartment}`);
    }

    return result.rows;

  } catch (error) {
    console.error('Error completing previous tasks:', error);
    throw error;
  }
}

/**
 * Main handler for order status changes
 * Called when an order's status is updated
 */
export async function onOrderStatusChange(orderId, oldStatus, newStatus) {
  console.log(`Order ${orderId} status changed: ${oldStatus} → ${newStatus}`);

  try {
    // 1. Complete tasks from the previous department
    const completedTasks = await completePreviousDepartmentTasks(orderId, oldStatus);

    // 2. Generate new tasks for the new status
    const newTasks = await generateTasksForOrder(orderId, newStatus);

    return {
      completedTasks,
      newTasks
    };

  } catch (error) {
    console.error('Error handling order status change:', error);
    throw error;
  }
}

/**
 * Create a manual task (not derived from order)
 */
export async function createManualTask({
  title,
  description,
  department,
  priority = 'normal',
  assignedTo = null,
  assignedBy = null,
  dueDate = null,
  orderId = null,
  estimatedMinutes = null
}) {
  try {
    const result = await query(
      `INSERT INTO tasks (
        title, description, task_type, department, priority,
        assigned_to, assigned_by, due_date, order_id, estimated_minutes
      ) VALUES ($1, $2, 'manual', $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        title,
        description,
        department,
        priority,
        assignedTo,
        assignedBy,
        dueDate,
        orderId,
        estimatedMinutes
      ]
    );

    return result.rows[0];

  } catch (error) {
    console.error('Error creating manual task:', error);
    throw error;
  }
}

/**
 * Get pending tasks for a department
 */
export async function getDepartmentQueue(department) {
  try {
    const result = await query(
      `SELECT * FROM department_task_queue WHERE department = $1`,
      [department]
    );

    return result.rows;

  } catch (error) {
    console.error('Error getting department queue:', error);
    throw error;
  }
}

/**
 * Get tasks assigned to an employee
 */
export async function getEmployeeTasks(employeeId, includeCompleted = false) {
  try {
    let sql = `
      SELECT t.*, o.order_number, c.name as client_name
      FROM tasks t
      LEFT JOIN orders o ON t.order_id = o.id
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE t.assigned_to = $1
    `;

    if (!includeCompleted) {
      sql += ` AND t.status NOT IN ('completed', 'cancelled')`;
    }

    sql += ` ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
      END,
      t.due_date ASC NULLS LAST`;

    const result = await query(sql, [employeeId]);

    return result.rows;

  } catch (error) {
    console.error('Error getting employee tasks:', error);
    throw error;
  }
}

/**
 * Update task status
 */
export async function updateTaskStatus(taskId, status, employeeId = null) {
  try {
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'in_progress') {
      updates.push(`started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`);
    } else if (status === 'completed') {
      updates.push(`completed_at = CURRENT_TIMESTAMP`);
    }

    values.push(taskId);

    const result = await query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];

  } catch (error) {
    console.error('Error updating task status:', error);
    throw error;
  }
}

/**
 * Assign task to employee
 */
export async function assignTask(taskId, assignedTo, assignedBy) {
  try {
    const result = await query(
      `UPDATE tasks
       SET assigned_to = $1, assigned_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [assignedTo, assignedBy, taskId]
    );

    return result.rows[0];

  } catch (error) {
    console.error('Error assigning task:', error);
    throw error;
  }
}

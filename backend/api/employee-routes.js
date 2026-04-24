/**
 * Employee Authentication & Management Routes
 * Handles employee login, profile, and CRUD operations
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../shared/database.js';
import {
  employeeAuth,
  requireManager,
  generateEmployeeToken,
  logActivity
} from './middleware/employee-auth.js';

const router = express.Router();

const SALT_ROUNDS = 10;

// ========================================
// AUTHENTICATION
// ========================================

/**
 * POST /api/employees/login
 * Employee login - returns JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email y contraseña son requeridos'
      });
    }

    // Find employee by email
    const result = await query(
      `SELECT id, email, password_hash, name, role, department, is_active, avatar_url
       FROM employees WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    const employee = result.rows[0];

    // Check if account is active
    if (!employee.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Cuenta desactivada - Contacta al administrador'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, employee.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    // Update last login
    await query(
      'UPDATE employees SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [employee.id]
    );

    // Generate JWT token
    const token = generateEmployeeToken(employee);

    // Log activity
    await logActivity(employee.id, 'login', 'employee', employee.id);

    res.json({
      success: true,
      token,
      employee: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        role: employee.role,
        department: employee.department,
        avatar_url: employee.avatar_url
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar sesión'
    });
  }
});

/**
 * POST /api/employees/logout
 * Employee logout (invalidates session if using session tokens)
 */
router.post('/logout', employeeAuth, async (req, res) => {
  try {
    // Log activity
    await logActivity(req.employee.id, 'logout', 'employee', req.employee.id);

    res.json({
      success: true,
      message: 'Sesión cerrada correctamente'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cerrar sesión'
    });
  }
});

/**
 * GET /api/employees/verify
 * Verify JWT token and return employee data
 */
router.get('/verify', employeeAuth, async (req, res) => {
  res.json({
    success: true,
    employee: {
      id: req.employee.id,
      email: req.employee.email,
      name: req.employee.name,
      role: req.employee.role,
      department: req.employee.department,
      avatar_url: req.employee.avatar_url
    }
  });
});

// ========================================
// PROFILE MANAGEMENT
// ========================================

/**
 * GET /api/employees/me
 * Get current employee's full profile
 */
router.get('/me', employeeAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, role, department, phone, avatar_url,
              last_login, created_at
       FROM employees WHERE id = $1`,
      [req.employee.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Empleado no encontrado'
      });
    }

    res.json({
      success: true,
      employee: result.rows[0]
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener perfil'
    });
  }
});

/**
 * PUT /api/employees/me
 * Update current employee's profile
 */
router.put('/me', employeeAuth, async (req, res) => {
  try {
    const { name, phone, avatar_url } = req.body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.employee.id);

    const result = await query(
      `UPDATE employees SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await logActivity(req.employee.id, 'profile_updated', 'employee', req.employee.id);

    res.json({
      success: true,
      employee: result.rows[0]
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar perfil'
    });
  }
});

/**
 * PUT /api/employees/me/password
 * Change current employee's password
 */
router.put('/me/password', employeeAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña actual y nueva son requeridas'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña debe tener al menos 6 caracteres'
      });
    }

    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM employees WHERE id = $1',
      [req.employee.id]
    );

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña actual incorrecta'
      });
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await query(
      'UPDATE employees SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, req.employee.id]
    );

    await logActivity(req.employee.id, 'password_changed', 'employee', req.employee.id);

    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar contraseña'
    });
  }
});

// ========================================
// EMPLOYEE MANAGEMENT (Manager only)
// ========================================

/**
 * GET /api/employees
 * List all employees (Manager only)
 */
router.get('/', employeeAuth, requireManager, async (req, res) => {
  try {
    const { department, role, active } = req.query;

    let sql = `
      SELECT id, email, name, role, department, phone, avatar_url,
             is_active, last_login, created_at
      FROM employees
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (department) {
      sql += ` AND department = $${paramIndex++}`;
      values.push(department);
    }
    if (role) {
      sql += ` AND role = $${paramIndex++}`;
      values.push(role);
    }
    if (active !== undefined) {
      sql += ` AND is_active = $${paramIndex++}`;
      values.push(active === 'true');
    }

    sql += ' ORDER BY name ASC';

    const result = await query(sql, values);

    res.json({
      success: true,
      employees: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('List employees error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar empleados'
    });
  }
});

/**
 * GET /api/employees/:id
 * Get single employee (Manager only)
 */
router.get('/:id', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, email, name, role, department, phone, avatar_url,
              is_active, last_login, created_at, created_by
       FROM employees WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Empleado no encontrado'
      });
    }

    res.json({
      success: true,
      employee: result.rows[0]
    });

  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener empleado'
    });
  }
});

/**
 * POST /api/employees
 * Create new employee (Manager only)
 */
router.post('/', employeeAuth, requireManager, async (req, res) => {
  try {
    const { email, password, name, role, department, phone } = req.body;

    // Validate required fields
    if (!email || !password || !name || !role || !department) {
      return res.status(400).json({
        success: false,
        error: 'Email, contraseña, nombre, rol y departamento son requeridos'
      });
    }

    // Validate role
    const validRoles = ['design', 'production', 'shipping', 'manager'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Rol inválido'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    // Check if email already exists
    const existing = await query(
      'SELECT id FROM employees WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un empleado con ese email'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create employee
    const result = await query(
      `INSERT INTO employees (email, password_hash, name, role, department, phone, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, role, department, phone, is_active, created_at`,
      [email.toLowerCase().trim(), passwordHash, name, role, department, phone, req.employee.id]
    );

    await logActivity(req.employee.id, 'employee_created', 'employee', result.rows[0].id, {
      name: name,
      role: role,
      department: department
    });

    res.status(201).json({
      success: true,
      employee: result.rows[0]
    });

  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear empleado'
    });
  }
});

/**
 * PUT /api/employees/:id
 * Update employee (Manager only)
 */
router.put('/:id', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, department, phone, is_active } = req.body;

    // Can't modify own role (prevent self-demotion)
    if (parseInt(id) === req.employee.id && role && role !== req.employee.role) {
      return res.status(400).json({
        success: false,
        error: 'No puedes cambiar tu propio rol'
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (role) {
      const validRoles = ['design', 'production', 'shipping', 'manager'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Rol inválido'
        });
      }
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (department) {
      updates.push(`department = $${paramIndex++}`);
      values.push(department);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (is_active !== undefined) {
      // Can't deactivate own account
      if (parseInt(id) === req.employee.id && !is_active) {
        return res.status(400).json({
          success: false,
          error: 'No puedes desactivar tu propia cuenta'
        });
      }
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query(
      `UPDATE employees SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, name, role, department, phone, is_active, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Empleado no encontrado'
      });
    }

    await logActivity(req.employee.id, 'employee_updated', 'employee', parseInt(id), req.body);

    res.json({
      success: true,
      employee: result.rows[0]
    });

  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar empleado'
    });
  }
});

/**
 * PUT /api/employees/:id/password
 * Reset employee password (Manager only)
 */
router.put('/:id/password', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Nueva contraseña es requerida'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const result = await query(
      'UPDATE employees SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
      [passwordHash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Empleado no encontrado'
      });
    }

    await logActivity(req.employee.id, 'password_reset', 'employee', parseInt(id));

    res.json({
      success: true,
      message: 'Contraseña restablecida correctamente'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al restablecer contraseña'
    });
  }
});

/**
 * DELETE /api/employees/:id
 * Deactivate employee (Manager only) - soft delete
 */
router.delete('/:id', employeeAuth, requireManager, async (req, res) => {
  try {
    const { id } = req.params;

    // Can't delete own account
    if (parseInt(id) === req.employee.id) {
      return res.status(400).json({
        success: false,
        error: 'No puedes eliminar tu propia cuenta'
      });
    }

    const result = await query(
      'UPDATE employees SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Empleado no encontrado'
      });
    }

    await logActivity(req.employee.id, 'employee_deactivated', 'employee', parseInt(id), {
      name: result.rows[0].name
    });

    res.json({
      success: true,
      message: 'Empleado desactivado correctamente'
    });

  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al desactivar empleado'
    });
  }
});

// ========================================
// PRODUCTIVITY & STATS
// ========================================

/**
 * GET /api/employees/stats/productivity
 * Get employee productivity stats (Manager only)
 */
router.get('/stats/productivity', employeeAuth, requireManager, async (req, res) => {
  try {
    const result = await query('SELECT * FROM employee_productivity ORDER BY completed_tasks DESC');

    res.json({
      success: true,
      stats: result.rows
    });

  } catch (error) {
    console.error('Get productivity stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

/**
 * GET /api/employees/activity
 * Get recent activity log (Manager only)
 */
router.get('/activity/recent', employeeAuth, requireManager, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const result = await query(
      `SELECT a.*, e.name as employee_name
       FROM activity_log a
       LEFT JOIN employees e ON a.employee_id = e.id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [parseInt(limit)]
    );

    res.json({
      success: true,
      activities: result.rows
    });

  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener actividad'
    });
  }
});

export default router;

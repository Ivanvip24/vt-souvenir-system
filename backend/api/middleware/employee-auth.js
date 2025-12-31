/**
 * Employee Authentication Middleware
 * JWT-based authentication with role and department checks
 */

import jwt from 'jsonwebtoken';
import { query } from '../../shared/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret';

/**
 * Main employee authentication middleware
 * Verifies JWT token and attaches employee data to request
 */
export async function employeeAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado - Token no proporcionado'
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Verify employee still exists and is active
      const result = await query(
        `SELECT id, email, name, role, department, is_active, avatar_url
         FROM employees WHERE id = $1`,
        [decoded.employeeId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Empleado no encontrado'
        });
      }

      const employee = result.rows[0];

      if (!employee.is_active) {
        return res.status(401).json({
          success: false,
          error: 'Cuenta desactivada - Contacta al administrador'
        });
      }

      // Attach employee data to request
      req.employee = employee;
      next();

    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Sesión expirada - Inicia sesión nuevamente'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Token inválido'
      });
    }

  } catch (error) {
    console.error('Employee auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Error de autenticación'
    });
  }
}

/**
 * Role-based access control middleware
 * Use after employeeAuth middleware
 * @param {...string} allowedRoles - Roles that can access the route
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.employee) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado'
      });
    }

    if (!allowedRoles.includes(req.employee.role)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para realizar esta acción'
      });
    }

    next();
  };
}

/**
 * Department-based access control middleware
 * Managers can access all departments
 * @param {...string} allowedDepartments - Departments that can access the route
 */
export function requireDepartment(...allowedDepartments) {
  return (req, res, next) => {
    if (!req.employee) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado'
      });
    }

    // Managers can access all departments
    if (req.employee.role === 'manager') {
      return next();
    }

    if (!allowedDepartments.includes(req.employee.department)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este departamento'
      });
    }

    next();
  };
}

/**
 * Manager-only middleware
 * Shortcut for requireRole('manager')
 */
export function requireManager(req, res, next) {
  if (!req.employee) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado'
    });
  }

  if (req.employee.role !== 'manager') {
    return res.status(403).json({
      success: false,
      error: 'Solo los gerentes pueden realizar esta acción'
    });
  }

  next();
}

/**
 * Optional authentication middleware
 * Attaches employee data if token is valid, but doesn't require it
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      const result = await query(
        `SELECT id, email, name, role, department, is_active, avatar_url
         FROM employees WHERE id = $1 AND is_active = true`,
        [decoded.employeeId]
      );

      if (result.rows.length > 0) {
        req.employee = result.rows[0];
      }

    } catch (jwtError) {
      // Token invalid, but optional - just continue
    }

    next();

  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
}

/**
 * Generate JWT token for employee
 * @param {Object} employee - Employee data from database
 * @param {string} expiresIn - Token expiration (default: 24h)
 * @returns {string} JWT token
 */
export function generateEmployeeToken(employee, expiresIn = '24h') {
  return jwt.sign(
    {
      employeeId: employee.id,
      email: employee.email,
      role: employee.role,
      department: employee.department
    },
    JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Log employee activity
 * @param {number} employeeId - Employee ID
 * @param {string} action - Action performed
 * @param {string} entityType - Type of entity affected
 * @param {number} entityId - ID of entity affected
 * @param {Object} details - Additional details (JSONB)
 */
export async function logActivity(employeeId, action, entityType = null, entityId = null, details = null) {
  try {
    await query(
      `INSERT INTO activity_log (employee_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [employeeId, action, entityType, entityId, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw - activity logging shouldn't break the main operation
  }
}

/**
 * Admin Authentication & Management Routes
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';

const router = express.Router();

// JWT secret from environment (REQUIRED)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  log('error', 'admin.config.missing', { variable: 'JWT_SECRET' });
  // Don't crash - but log loudly
}

// Admin credentials from environment variables (no defaults)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
if (!ADMIN_PASSWORD_HASH) {
  log('error', 'admin.config.missing', { variable: 'ADMIN_PASSWORD_HASH' });
}

// Pre-computed dummy hash for timing-safe comparison on wrong usernames
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';

// ========================================
// AUTHENTICATION
// ========================================

/**
 * POST /api/admin/login
 * Admin login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check server configuration
    if (!ADMIN_USERNAME || !JWT_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'Server not configured'
      });
    }

    const usernameMatch = username === ADMIN_USERNAME;
    let passwordValid = false;

    if (!ADMIN_PASSWORD_HASH) {
      // No password hash configured — reject all logins
      await bcrypt.compare(password || '', DUMMY_HASH);
      passwordValid = false;
    } else {
      // bcrypt hash comparison (timing-safe: always runs bcrypt even on wrong username)
      const hashToCompare = usernameMatch ? ADMIN_PASSWORD_HASH : DUMMY_HASH;
      passwordValid = await bcrypt.compare(password || '', hashToCompare);
      passwordValid = passwordValid && usernameMatch;
    }

    if (passwordValid) {
      // Generate JWT token (7d for mobile PWA convenience)
      const token = jwt.sign(
        { username, role: 'admin', iat: Math.floor(Date.now() / 1000) },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token,
        user: {
          username,
          role: 'admin'
        }
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }
  } catch (error) {
    logError('admin.login.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar sesión'
    });
  }
});

/**
 * GET /api/admin/verify
 * Verify JWT token
 */
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      res.json({
        success: true,
        user: {
          username: decoded.username,
          role: decoded.role
        }
      });
    } catch (jwtError) {
      res.status(401).json({
        success: false,
        error: 'Token inválido o expirado'
      });
    }
  } catch (error) {
    logError('admin.verify.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar token'
    });
  }
});

// ========================================
// MIDDLEWARE FOR PROTECTED ROUTES
// ========================================

export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado'
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Token inválido'
      });
    }
  } catch (error) {
    logError('admin.auth.middleware.error', error);
    res.status(500).json({
      success: false,
      error: 'Error de autenticación'
    });
  }
}

// ========================================
// DATABASE MIGRATIONS (Admin only)
// ========================================

/**
 * POST /api/admin/run-migration
 * Run employee system migration
 */
router.post('/run-migration', authMiddleware, async (req, res) => {
  try {
    log('info', 'admin.migration.start', { migration: 'employee-system' });

    // Create employees table
    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('design', 'production', 'shipping', 'manager')),
        department VARCHAR(50) NOT NULL,
        phone VARCHAR(50),
        avatar_url TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);`);

    // Create workspaces table
    await query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        color VARCHAR(7),
        owner_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        visibility VARCHAR(20) DEFAULT 'team',
        allowed_departments TEXT[],
        is_archived BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create design_categories table
    await query(`
      CREATE TABLE IF NOT EXISTS design_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES design_categories(id) ON DELETE SET NULL,
        description TEXT,
        color VARCHAR(7),
        icon VARCHAR(50),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create tasks table
    await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        task_type VARCHAR(50) NOT NULL,
        department VARCHAR(50) NOT NULL,
        priority VARCHAR(20) DEFAULT 'normal',
        status VARCHAR(50) DEFAULT 'pending',
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
        assigned_to INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        assigned_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        due_date TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        estimated_minutes INTEGER,
        actual_minutes INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);`);

    // Create task_templates table
    await query(`
      CREATE TABLE IF NOT EXISTS task_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        department VARCHAR(50) NOT NULL,
        trigger_status VARCHAR(50) NOT NULL,
        estimated_minutes INTEGER,
        priority VARCHAR(20) DEFAULT 'normal',
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create design_gallery table
    await query(`
      CREATE TABLE IF NOT EXISTS design_gallery (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        file_url TEXT NOT NULL,
        thumbnail_url TEXT,
        storage_type VARCHAR(20) NOT NULL,
        external_id VARCHAR(255),
        category_id INTEGER REFERENCES design_categories(id) ON DELETE SET NULL,
        tags TEXT[],
        file_type VARCHAR(50),
        file_size INTEGER,
        dimensions VARCHAR(50),
        used_in_orders INTEGER DEFAULT 0,
        last_used_at TIMESTAMP,
        uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create notes table
    await query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        content TEXT,
        content_type VARCHAR(20) DEFAULT 'markdown',
        parent_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
        workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
        note_type VARCHAR(50) DEFAULT 'document',
        icon VARCHAR(50),
        cover_image_url TEXT,
        is_public BOOLEAN DEFAULT false,
        shared_with INTEGER[],
        created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        last_edited_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create activity_log table
    await query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default task templates if empty
    const templatesExist = await query('SELECT COUNT(*) FROM task_templates');
    if (parseInt(templatesExist.rows[0].count) === 0) {
      await query(`
        INSERT INTO task_templates (name, description, department, trigger_status, priority, sort_order) VALUES
        ('Crear diseño para pedido', 'Crear el diseño basado en las especificaciones del cliente', 'design', 'approved', 'high', 1),
        ('Revisar y aprobar diseño', 'Obtener aprobación del cliente para el diseño', 'design', 'design', 'normal', 2),
        ('Imprimir pedido', 'Imprimir todos los artículos del pedido', 'production', 'printing', 'high', 3),
        ('Cortar piezas', 'Cortar las piezas impresas según especificaciones', 'production', 'cutting', 'normal', 4),
        ('Contar y verificar piezas', 'Verificar cantidad y calidad de todas las piezas', 'production', 'counting', 'normal', 5),
        ('Preparar envío', 'Empaquetar el pedido para envío', 'shipping', 'shipping', 'high', 6);
      `);
    }

    // Seed default design categories if empty
    const categoriesExist = await query('SELECT COUNT(*) FROM design_categories');
    if (parseInt(categoriesExist.rows[0].count) === 0) {
      await query(`
        INSERT INTO design_categories (name, color, icon, sort_order) VALUES
        ('Llaveros', '#E91E63', '🔑', 1),
        ('Stickers', '#FF9800', '🏷️', 2),
        ('Placas', '#7CB342', '🪧', 3),
        ('Logos', '#00BCD4', '🎨', 4),
        ('Plantillas', '#9C27B0', '📄', 5),
        ('Otros', '#607D8B', '📦', 6);
      `);
    }

    // Seed default workspace if empty
    const workspacesExist = await query('SELECT COUNT(*) FROM workspaces');
    if (parseInt(workspacesExist.rows[0].count) === 0) {
      await query(`
        INSERT INTO workspaces (name, description, icon, visibility) VALUES
        ('General', 'Espacio de trabajo compartido para todo el equipo', '🏢', 'all');
      `);
    }

    log('info', 'admin.migration.complete', { migration: 'employee-system' });

    res.json({
      success: true,
      message: 'Migration completed successfully!'
    });

  } catch (error) {
    logError('admin.migration.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/admin/create-manager
 * Create the first manager account
 */
router.post('/create-manager', authMiddleware, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password and name are required'
      });
    }

    // Check if employees table exists
    const tableExists = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'employees'
      );
    `);

    if (!tableExists.rows[0].exists) {
      return res.status(400).json({
        success: false,
        error: 'Run migration first: POST /api/admin/run-migration'
      });
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM employees WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Employee with this email already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create manager
    const result = await query(
      `INSERT INTO employees (email, password_hash, name, role, department)
       VALUES ($1, $2, $3, 'manager', 'design')
       RETURNING id, email, name, role, department`,
      [email.toLowerCase(), passwordHash, name]
    );

    res.json({
      success: true,
      message: 'Manager account created successfully!',
      employee: result.rows[0]
    });

  } catch (error) {
    logError('admin.create-manager.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/admin/run-gallery-archive-migration
 * Add archive functionality to design_gallery table
 */
router.post('/run-gallery-archive-migration', authMiddleware, async (req, res) => {
  try {
    log('info', 'admin.migration.start', { migration: 'gallery-archive' });

    // Add is_archived column
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
    `);
    log('info', 'admin.migration.column-added', { column: 'is_archived' });

    // Add archived_at timestamp
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    `);
    log('info', 'admin.migration.column-added', { column: 'archived_at' });

    // Add archived_by reference
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES employees(id) ON DELETE SET NULL;
    `);
    log('info', 'admin.migration.column-added', { column: 'archived_by' });

    // Add download_count
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
    `);
    log('info', 'admin.migration.column-added', { column: 'download_count' });

    // Add index for archived status
    await query(`
      CREATE INDEX IF NOT EXISTS idx_design_gallery_archived ON design_gallery(is_archived);
    `);
    log('info', 'admin.migration.index-created', { index: 'idx_design_gallery_archived' });

    res.json({
      success: true,
      message: 'Gallery archive migration completed successfully!',
      columns_added: ['is_archived', 'archived_at', 'archived_by', 'download_count']
    });

  } catch (error) {
    logError('admin.migration.gallery-archive.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// EMPLOYEE MANAGEMENT (Admin only)
// ========================================

const SALT_ROUNDS = 12;

/**
 * GET /api/admin/employees
 * List all employees (Admin only)
 */
router.get('/employees', authMiddleware, async (req, res) => {
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
    logError('admin.employees.list.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar empleados'
    });
  }
});

/**
 * GET /api/admin/employees/:id
 * Get single employee (Admin only)
 */
router.get('/employees/:id', authMiddleware, async (req, res) => {
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
    logError('admin.employees.get.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener empleado'
    });
  }
});

/**
 * POST /api/admin/employees
 * Create new employee (Admin only)
 */
router.post('/employees', authMiddleware, async (req, res) => {
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
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    // Validate password complexity
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe incluir mayúsculas, minúsculas y números'
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
      `INSERT INTO employees (email, password_hash, name, role, department, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, role, department, phone, is_active, created_at`,
      [email.toLowerCase().trim(), passwordHash, name, role, department, phone]
    );

    log('info', 'admin.employees.created', { name, email });

    res.status(201).json({
      success: true,
      employee: result.rows[0]
    });

  } catch (error) {
    logError('admin.employees.create.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear empleado'
    });
  }
});

/**
 * PUT /api/admin/employees/:id
 * Update employee (Admin only)
 */
router.put('/employees/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, department, phone, is_active } = req.body;

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

    log('info', 'admin.employees.updated', { name: result.rows[0].name });

    res.json({
      success: true,
      employee: result.rows[0]
    });

  } catch (error) {
    logError('admin.employees.update.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar empleado'
    });
  }
});

/**
 * PUT /api/admin/employees/:id/password
 * Reset employee password (Admin only)
 */
router.put('/employees/:id/password', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Nueva contraseña es requerida'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe incluir mayúsculas, minúsculas y números'
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const result = await query(
      'UPDATE employees SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name',
      [passwordHash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Empleado no encontrado'
      });
    }

    log('info', 'admin.employees.password-reset', { name: result.rows[0].name });

    res.json({
      success: true,
      message: 'Contraseña restablecida correctamente'
    });

  } catch (error) {
    logError('admin.employees.password-reset.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al restablecer contraseña'
    });
  }
});

/**
 * DELETE /api/admin/employees/:id
 * Deactivate employee (Admin only) - soft delete
 */
router.delete('/employees/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

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

    log('info', 'admin.employees.deactivated', { name: result.rows[0].name });

    res.json({
      success: true,
      message: 'Empleado desactivado correctamente'
    });

  } catch (error) {
    logError('admin.employees.delete.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al desactivar empleado'
    });
  }
});

// ========================================
// TASK MANAGEMENT (Admin only)
// ========================================

/**
 * GET /api/admin/tasks
 * List all tasks with filters (Admin only)
 */
router.get('/tasks', authMiddleware, async (req, res) => {
  try {
    const { department, status, priority, assigned_to, limit = 100 } = req.query;

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

    if (department) {
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
    logError('admin.tasks.list.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar tareas'
    });
  }
});

/**
 * GET /api/admin/tasks/stats
 * Get task statistics (Admin only)
 */
router.get('/tasks/stats', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority
      FROM tasks
    `);

    // Get tasks by department
    const byDept = await query(`
      SELECT department, COUNT(*) as count,
             COUNT(*) FILTER (WHERE status = 'pending') as pending,
             COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress
      FROM tasks
      GROUP BY department
    `);

    res.json({
      success: true,
      stats: result.rows[0],
      byDepartment: byDept.rows
    });

  } catch (error) {
    logError('admin.tasks.stats.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

/**
 * GET /api/admin/tasks/:id
 * Get single task (Admin only)
 */
router.get('/tasks/:id', authMiddleware, async (req, res) => {
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

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    logError('admin.tasks.get.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener tarea'
    });
  }
});

/**
 * POST /api/admin/tasks
 * Create a new task (Admin only)
 */
router.post('/tasks', authMiddleware, async (req, res) => {
  try {
    const { title, description, department, priority, assigned_to, due_date, order_id, estimated_minutes } = req.body;

    if (!title || !department) {
      return res.status(400).json({
        success: false,
        error: 'Título y departamento son requeridos'
      });
    }

    const validDepts = ['design', 'production', 'shipping'];
    if (!validDepts.includes(department)) {
      return res.status(400).json({
        success: false,
        error: 'Departamento inválido'
      });
    }

    const result = await query(
      `INSERT INTO tasks (title, description, department, task_type, priority, assigned_to, assigned_by, due_date, order_id, estimated_minutes)
       VALUES ($1, $2, $3, 'manual', $4, $5, NULL, $6, $7, $8)
       RETURNING *`,
      [
        title,
        description || null,
        department,
        priority || 'normal',
        assigned_to ? parseInt(assigned_to) : null,
        due_date || null,
        order_id ? parseInt(order_id) : null,
        estimated_minutes ? parseInt(estimated_minutes) : null
      ]
    );

    // Get the full task with joins
    const fullTask = await query(
      `SELECT t.*, e.name as assigned_to_name
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.id = $1`,
      [result.rows[0].id]
    );

    log('info', 'admin.tasks.created', { title });

    res.status(201).json({
      success: true,
      task: fullTask.rows[0]
    });

  } catch (error) {
    logError('admin.tasks.create.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear tarea'
    });
  }
});

/**
 * PUT /api/admin/tasks/:id
 * Update task (Admin only)
 */
router.put('/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, department, priority, due_date, estimated_minutes, notes } = req.body;

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
    if (department) {
      updates.push(`department = $${paramIndex++}`);
      values.push(department);
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

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    log('info', 'admin.tasks.updated', { title: result.rows[0].title });

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    logError('admin.tasks.update.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar tarea'
    });
  }
});

/**
 * PUT /api/admin/tasks/:id/status
 * Update task status (Admin only)
 */
router.put('/tasks/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

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

    let sql = `
      UPDATE tasks SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
    `;
    const values = [status];

    if (status === 'in_progress') {
      sql += `, started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`;
    } else if (status === 'completed') {
      sql += `, completed_at = CURRENT_TIMESTAMP`;
    }

    sql += ` WHERE id = $2 RETURNING *`;
    values.push(id);

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    log('info', 'admin.tasks.status-updated', { title: result.rows[0].title, status });

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    logError('admin.tasks.status-update.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar estado'
    });
  }
});

/**
 * PUT /api/admin/tasks/:id/assign
 * Assign task to employee (Admin only)
 */
router.put('/tasks/:id/assign', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    // Verify employee exists and is active (if assigning)
    if (assigned_to) {
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
    }

    const result = await query(
      `UPDATE tasks SET
         assigned_to = $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [assigned_to || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    // Get full task with employee name
    const fullTask = await query(
      `SELECT t.*, e.name as assigned_to_name
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.id = $1`,
      [id]
    );

    log('info', 'admin.tasks.assigned', { title: result.rows[0].title });

    res.json({
      success: true,
      task: fullTask.rows[0]
    });

  } catch (error) {
    logError('admin.tasks.assign.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al asignar tarea'
    });
  }
});

/**
 * DELETE /api/admin/tasks/:id
 * Delete task (Admin only)
 */
router.delete('/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    log('info', 'admin.tasks.deleted', { title: result.rows[0].title });

    res.json({
      success: true,
      message: 'Tarea eliminada correctamente'
    });

  } catch (error) {
    logError('admin.tasks.delete.error', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar tarea'
    });
  }
});

// ========================================
// CLIENT IMPORT FROM CSV
// ========================================

// Mexican states for matching
const MEXICAN_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Coahuila', 'Colima', 'CDMX', 'Ciudad de México', 'Durango', 'Guanajuato',
  'Guerrero', 'Hidalgo', 'Jalisco', 'Estado de México', 'México', 'Michoacán', 'Morelos',
  'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
];

function parseDestination(destination) {
  if (!destination) return { city: null, state: null };
  const clean = destination.trim();
  let foundState = null;
  for (const state of MEXICAN_STATES) {
    if (clean.toLowerCase().includes(state.toLowerCase())) {
      foundState = state;
      break;
    }
  }
  let city = null;
  const parts = clean.split(/[,\/\-]/);
  if (parts.length > 0) {
    city = parts[0].trim();
    if (foundState && city.toLowerCase().includes(foundState.toLowerCase()) && parts.length > 1) {
      city = parts[1].trim();
    }
  }
  if (city) {
    city = city.replace(/\s+/g, ' ').trim().replace(/^(Ciudad de|Cd\.|CD\.?)\s*/i, '');
  }
  return { city, state: foundState };
}

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length > 10) digits = digits.slice(2);
  return digits.slice(-10) || null;
}

/**
 * POST /api/admin/import-clients
 * Import clients from CSV data (Notion delivery form format)
 */
router.post('/import-clients', authMiddleware, async (req, res) => {
  try {
    const { clients } = req.body;

    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return res.status(400).json({ success: false, error: 'No clients data provided' });
    }

    log('info', 'admin.import-clients.start', { count: clients.length });

    let imported = 0;
    let skipped = 0;
    let errors = [];

    for (const record of clients) {
      try {
        const name = record.name?.trim();
        const street = record.street?.trim();
        const colonia = record.colonia?.trim();
        const email = record.email?.trim();
        const postalCode = record.postalCode?.trim();
        const destination = record.destination?.trim();
        const streetNumber = record.streetNumber?.trim();
        const references = record.references?.trim();
        const phone = normalizePhone(record.phone);

        if (!name) {
          skipped++;
          continue;
        }

        const { city, state } = parseDestination(destination);

        const addressParts = [];
        if (street) addressParts.push(street);
        if (streetNumber && streetNumber !== '0') addressParts.push(`#${streetNumber}`);
        if (colonia) addressParts.push(`Col. ${colonia}`);
        const fullAddress = addressParts.join(', ') || null;

        // Check duplicates
        if (phone) {
          const existing = await query('SELECT id, name FROM clients WHERE phone = $1', [phone]);
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }
        }

        const existingByName = await query(
          'SELECT id FROM clients WHERE LOWER(name) = LOWER($1) AND postal = $2',
          [name, postalCode]
        );
        if (existingByName.rows.length > 0) {
          skipped++;
          continue;
        }

        await query(
          `INSERT INTO clients (name, phone, email, address, street, street_number, colonia, city, state, postal, reference_notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            name,
            phone,
            email || null,
            fullAddress,
            street || null,
            (streetNumber && streetNumber !== '0') ? streetNumber : null,
            colonia || null,
            city || null,
            state || null,
            postalCode || null,
            references || null
          ]
        );

        imported++;
      } catch (error) {
        errors.push({ name: record.name, error: (error.message || 'Error desconocido') });
      }
    }

    log('info', 'admin.import-clients.complete', { imported, skipped, errors: errors.length });

    res.json({
      success: true,
      imported,
      skipped,
      errors: errors.length,
      errorDetails: errors.slice(0, 10) // Only return first 10 errors
    });

  } catch (error) {
    logError('admin.import-clients.error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

export default router;

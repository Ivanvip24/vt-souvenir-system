/**
 * Admin Authentication & Management Routes
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../shared/database.js';

const router = express.Router();

// JWT secret from environment or default
const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret';

// Admin credentials from environment variables or defaults
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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

    // Validate credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // Generate JWT token
      const token = jwt.sign(
        { username, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '24h' }
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
    console.error('Login error:', error);
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
    console.error('Token verification error:', error);
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
    console.error('Auth middleware error:', error);
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
    console.log('🔄 Running Employee System migration via API...');

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

    console.log('✅ Migration completed successfully!');

    res.json({
      success: true,
      message: 'Migration completed successfully!'
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
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
    const passwordHash = await bcrypt.hash(password, 10);

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
    console.error('Create manager error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/run-gallery-archive-migration
 * Add archive functionality to design_gallery table
 */
router.post('/run-gallery-archive-migration', authMiddleware, async (req, res) => {
  try {
    console.log('🔄 Running Gallery Archive migration via API...');

    // Add is_archived column
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added is_archived column');

    // Add archived_at timestamp
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    `);
    console.log('✅ Added archived_at column');

    // Add archived_by reference
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES employees(id) ON DELETE SET NULL;
    `);
    console.log('✅ Added archived_by column');

    // Add download_count
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
    `);
    console.log('✅ Added download_count column');

    // Add index for archived status
    await query(`
      CREATE INDEX IF NOT EXISTS idx_design_gallery_archived ON design_gallery(is_archived);
    `);
    console.log('✅ Created index on is_archived');

    res.json({
      success: true,
      message: 'Gallery archive migration completed successfully!',
      columns_added: ['is_archived', 'archived_at', 'archived_by', 'download_count']
    });

  } catch (error) {
    console.error('Gallery archive migration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// EMPLOYEE MANAGEMENT (Admin only)
// ========================================

const SALT_ROUNDS = 10;

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
    console.error('List employees error:', error);
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
    console.error('Get employee error:', error);
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
      `INSERT INTO employees (email, password_hash, name, role, department, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, role, department, phone, is_active, created_at`,
      [email.toLowerCase().trim(), passwordHash, name, role, department, phone]
    );

    console.log(`✅ Employee created by admin: ${name} (${email})`);

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

    console.log(`✅ Employee updated by admin: ${result.rows[0].name}`);

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

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres'
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

    console.log(`✅ Password reset by admin for: ${result.rows[0].name}`);

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

    console.log(`✅ Employee deactivated by admin: ${result.rows[0].name}`);

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

export default router;

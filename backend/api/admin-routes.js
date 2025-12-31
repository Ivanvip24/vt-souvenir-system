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

export default router;

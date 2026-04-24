import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running Employee System migration...');

  try {
    // =====================================================
    // EMPLOYEES TABLE
    // =====================================================
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
    console.log('✅ Created employees table');

    await query(`CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);`);

    // =====================================================
    // WORKSPACES TABLE (must be created before notes)
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        color VARCHAR(7),
        owner_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        visibility VARCHAR(20) DEFAULT 'team' CHECK (visibility IN ('private', 'team', 'department', 'all')),
        allowed_departments TEXT[],
        is_archived BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created workspaces table');

    await query(`CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_workspaces_visibility ON workspaces(visibility);`);

    // =====================================================
    // DESIGN CATEGORIES TABLE (must be created before gallery)
    // =====================================================
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
    console.log('✅ Created design_categories table');

    await query(`CREATE INDEX IF NOT EXISTS idx_design_categories_parent ON design_categories(parent_id);`);

    // =====================================================
    // TASKS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,

        -- Task classification
        task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('order_task', 'manual', 'recurring')),
        department VARCHAR(50) NOT NULL,
        priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'blocked')),

        -- Linked entities
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,

        -- Assignment
        assigned_to INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        assigned_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,

        -- Dates
        due_date TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,

        -- Metadata
        estimated_minutes INTEGER,
        actual_minutes INTEGER,
        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created tasks table');

    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_order_id ON tasks(order_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);`);

    // =====================================================
    // TASK TEMPLATES TABLE
    // =====================================================
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
    console.log('✅ Created task_templates table');

    // =====================================================
    // DESIGN GALLERY TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS design_gallery (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,

        -- Storage
        file_url TEXT NOT NULL,
        thumbnail_url TEXT,
        storage_type VARCHAR(20) NOT NULL CHECK (storage_type IN ('cloudinary', 'google_drive')),
        external_id VARCHAR(255),

        -- Classification
        category_id INTEGER REFERENCES design_categories(id) ON DELETE SET NULL,
        tags TEXT[],

        -- Metadata
        file_type VARCHAR(50),
        file_size INTEGER,
        dimensions VARCHAR(50),

        -- Usage tracking
        used_in_orders INTEGER DEFAULT 0,
        last_used_at TIMESTAMP,

        -- Ownership
        uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created design_gallery table');

    await query(`CREATE INDEX IF NOT EXISTS idx_design_gallery_category ON design_gallery(category_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_gallery_tags ON design_gallery USING GIN(tags);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_gallery_storage ON design_gallery(storage_type);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_gallery_uploaded_by ON design_gallery(uploaded_by);`);

    // =====================================================
    // NOTES TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        content TEXT,
        content_type VARCHAR(20) DEFAULT 'markdown' CHECK (content_type IN ('markdown', 'json')),

        -- Organization
        parent_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
        workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,

        -- Classification
        note_type VARCHAR(50) DEFAULT 'document' CHECK (note_type IN ('document', 'template', 'table', 'database')),
        icon VARCHAR(50),
        cover_image_url TEXT,

        -- Sharing
        is_public BOOLEAN DEFAULT false,
        shared_with INTEGER[],

        -- Metadata
        created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        last_edited_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,

        -- Dates
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created notes table');

    await query(`CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);`);

    // =====================================================
    // EMPLOYEE SESSIONS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS employee_sessions (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created employee_sessions table');

    await query(`CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee ON employee_sessions(employee_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employee_sessions_expires ON employee_sessions(expires_at);`);

    // =====================================================
    // ACTIVITY LOG TABLE
    // =====================================================
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
    console.log('✅ Created activity_log table');

    await query(`CREATE INDEX IF NOT EXISTS idx_activity_log_employee ON activity_log(employee_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);`);

    // =====================================================
    // VIEWS
    // =====================================================

    // Task queue by department
    await query(`
      CREATE OR REPLACE VIEW department_task_queue AS
      SELECT
        t.id,
        t.title,
        t.description,
        t.department,
        t.priority,
        t.status,
        t.due_date,
        t.order_id,
        o.order_number,
        c.name as client_name,
        e.name as assigned_to_name,
        t.created_at
      FROM tasks t
      LEFT JOIN orders o ON t.order_id = o.id
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN employees e ON t.assigned_to = e.id
      WHERE t.status NOT IN ('completed', 'cancelled')
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date ASC NULLS LAST;
    `);
    console.log('✅ Created department_task_queue view');

    // Employee productivity summary
    await query(`
      CREATE OR REPLACE VIEW employee_productivity AS
      SELECT
        e.id,
        e.name,
        e.department,
        e.role,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status IN ('pending', 'in_progress') THEN 1 END) as pending_tasks,
        AVG(t.actual_minutes)::INTEGER as avg_task_duration,
        COUNT(DISTINCT DATE(t.completed_at)) as active_days
      FROM employees e
      LEFT JOIN tasks t ON e.id = t.assigned_to
      WHERE e.is_active = true
      GROUP BY e.id, e.name, e.department, e.role;
    `);
    console.log('✅ Created employee_productivity view');

    // =====================================================
    // SEED DEFAULT TASK TEMPLATES
    // =====================================================
    const templatesExist = await query('SELECT COUNT(*) FROM task_templates');
    if (parseInt(templatesExist.rows[0].count) === 0) {
      await query(`
        INSERT INTO task_templates (name, description, department, trigger_status, priority, sort_order) VALUES
        ('Crear diseño para pedido', 'Crear el diseño basado en las especificaciones del cliente', 'design', 'approved', 'high', 1),
        ('Revisar y aprobar diseño', 'Obtener aprobación del cliente para el diseño', 'design', 'design', 'normal', 2),
        ('Imprimir pedido', 'Imprimir todos los artículos del pedido', 'production', 'printing', 'high', 3),
        ('Cortar piezas', 'Cortar las piezas impresas según especificaciones', 'production', 'cutting', 'normal', 4),
        ('Contar y verificar piezas', 'Verificar cantidad y calidad de todas las piezas', 'production', 'counting', 'normal', 5),
        ('Preparar envío', 'Empaquetar el pedido para envío', 'shipping', 'shipping', 'high', 6),
        ('Generar guía de envío', 'Crear etiqueta de envío con paquetería', 'shipping', 'shipping', 'high', 7);
      `);
      console.log('✅ Seeded default task templates');
    }

    // =====================================================
    // SEED DEFAULT DESIGN CATEGORIES
    // =====================================================
    const categoriesExist = await query('SELECT COUNT(*) FROM design_categories');
    if (parseInt(categoriesExist.rows[0].count) === 0) {
      await query(`
        INSERT INTO design_categories (name, color, icon, sort_order) VALUES
        ('Llaveros', '#E91E63', '🔑', 1),
        ('Stickers', '#FF9800', '🏷️', 2),
        ('Placas', '#7CB342', '🪧', 3),
        ('Logos', '#00BCD4', '🎨', 4),
        ('Plantillas', '#9C27B0', '📄', 5),
        ('Temporada', '#F44336', '🎄', 6),
        ('Otros', '#607D8B', '📦', 7);
      `);
      console.log('✅ Seeded default design categories');
    }

    // =====================================================
    // SEED DEFAULT WORKSPACE
    // =====================================================
    const workspacesExist = await query('SELECT COUNT(*) FROM workspaces');
    if (parseInt(workspacesExist.rows[0].count) === 0) {
      await query(`
        INSERT INTO workspaces (name, description, icon, visibility) VALUES
        ('General', 'Espacio de trabajo compartido para todo el equipo', '🏢', 'all');
      `);
      console.log('✅ Seeded default workspace');
    }

    // Verify tables
    const result = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('employees', 'tasks', 'task_templates', 'design_gallery', 'design_categories', 'notes', 'workspaces', 'employee_sessions', 'activity_log')
      ORDER BY table_name;
    `);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Created tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration();

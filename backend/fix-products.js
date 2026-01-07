import { config } from 'dotenv';
import { query, closePool } from './shared/database.js';

config(); // Load .env file

async function fixProducts() {
  try {
    console.log('🔧 Fixing products table...\n');

    // Add missing columns
    console.log('Adding missing columns...');
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
      ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0
    `);
    console.log('✅ Columns added\n');

    // Clear existing sample products
    await query('DELETE FROM products');

    // Add real VT Anunciando products
    console.log('Adding VT Anunciando products...');
    await query(`
      INSERT INTO products (
        name, description, base_price, production_cost,
        material_cost, labor_cost, category, image_url, thumbnail_url, display_order, is_active
      ) VALUES
      ('Imanes de MDF', 'Imanes personalizados de MDF cortados con láser. Disponibles en tamaño chico y grande.', 8.00, 2.00, 1.50, 0.50, 'Souvenirs', 'https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg', 'https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-4.png', 1, true),
      ('Llaveros de MDF', 'Llaveros personalizados de MDF con diseño único. Ideal para eventos.', 7.00, 1.80, 1.30, 0.50, 'Souvenirs', 'https://vtanunciando.com/cdn/shop/files/mockup-llavero.png', 'https://vtanunciando.com/cdn/shop/files/llavero-keychain-image---vtweb.png', 2, true),
      ('Imán 3D MDF 3mm', 'Imán 3D de MDF de 3mm con efecto de profundidad. Producto premium.', 15.00, 4.50, 3.00, 1.50, 'Souvenirs Premium', 'https://vtanunciando.com/cdn/shop/files/tamasopo.png', 'https://vtanunciando.com/cdn/shop/files/3D-MAGNET---VTWEB.png', 3, true),
      ('Imán de MDF con Foil', 'Imanes de MDF con acabado metálico de foil. Elegante y brillante.', 15.00, 4.50, 3.00, 1.50, 'Souvenirs Premium', 'https://vtanunciando.com/cdn/shop/files/IMAN-FOIL-MOCKUP---vtweb.png', 'https://vtanunciando.com/cdn/shop/files/IMAN-FOIL-MOCKUP---vtweb.png', 4, true),
      ('Destapador de MDF', 'Destapadores personalizados de MDF. Funcional y decorativo.', 17.00, 5.00, 3.50, 1.50, 'Souvenirs', 'https://vtanunciando.com/cdn/shop/files/DESTAPADOR---VTWEB.png', 'https://vtanunciando.com/cdn/shop/files/DESTAPADOR---VTWEB.png', 5, true),
      ('Botones Metálicos', 'Botones metálicos personalizados con pin. Perfectos para eventos.', 8.00, 2.00, 1.40, 0.60, 'Souvenirs', 'https://vtanunciando.com/cdn/shop/files/fotobotones.png', 'https://vtanunciando.com/cdn/shop/files/fotobotones.png', 6, true),
      ('Portallaves de MDF', 'Portallaves de pared de MDF con ganchos metálicos. Decorativo y útil.', 45.00, 15.00, 10.00, 5.00, 'Decoración', 'https://vtanunciando.com/cdn/shop/files/PORTALLAVES-VTWEB.png', 'https://vtanunciando.com/cdn/shop/files/PORTALLAVES-VTWEB2.png', 7, true),
      ('Souvenir Box', 'Paquete completo de souvenirs personalizados para eventos grandes.', 2250.00, 800.00, 550.00, 250.00, 'Paquetes', 'https://vtanunciando.com/cdn/shop/files/final-bundle-vtweb2.png', 'https://vtanunciando.com/cdn/shop/files/mas-grande.png', 8, true)
    `);

    console.log('✅ Products added successfully!\n');

    // Show added products
    const result = await query('SELECT id, name, category, base_price FROM products ORDER BY display_order');
    console.log('📦 Available products:');
    result.rows.forEach(p => {
      console.log(`   ${p.id}. ${p.name} - $${p.base_price} (${p.category})`);
    });

    console.log('\n✨ Done! Refresh the order page to see products.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await closePool();
  }
}

fixProducts();

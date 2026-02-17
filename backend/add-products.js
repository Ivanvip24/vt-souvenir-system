import pg from 'pg';
import { config } from 'dotenv';

const { Pool } = pg;
config();

// Connect to production database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management',
  ssl: { rejectUnauthorized: false }
});

const products = [
  {
    name: 'Imanes de MDF',
    description: 'Imanes personalizados de MDF. Disponibles en diferentes tamaños y cantidades.',
    category: 'magnets',
    base_price: 8.00,
    production_cost: 4.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg?crop=center&height=600&v=1727106231&width=600',
    dimensions: 'Variable según tamaño seleccionado'
  },
  {
    name: 'Llaveros de MDF',
    description: 'Llaveros personalizados de MDF. Ideales para eventos y souvenirs.',
    category: 'keychains',
    base_price: 7.00,
    production_cost: 3.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/mockup-llavero.png?crop=center&height=600&v=1744307278&width=600',
    dimensions: 'Tamaño estándar de llavero'
  },
  {
    name: 'Imán 3D MDF 3mm',
    description: 'Imanes 3D de MDF de 3mm de espesor. Efecto tridimensional único.',
    category: 'magnets',
    base_price: 15.00,
    production_cost: 7.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/tamasopo.png?crop=center&height=600&v=1755714542&width=600',
    dimensions: '3mm de espesor'
  },
  {
    name: 'Imán de MDF con Foil',
    description: 'Imanes de MDF con acabado foil metálico brillante.',
    category: 'magnets',
    base_price: 15.00,
    production_cost: 6.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/IMAN-FOIL-MOCKUP---vtweb.png?crop=center&height=600&v=1744331653&width=600',
    dimensions: 'Con acabado foil'
  },
  {
    name: 'Destapador de MDF',
    description: 'Destapadores personalizados de MDF. Funcionales y decorativos.',
    category: 'bottle_openers',
    base_price: 17.00,
    production_cost: 8.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/DESTAPADOR---VTWEB.png?crop=center&height=600&v=1741044542&width=600',
    dimensions: 'Tamaño estándar'
  },
  {
    name: 'Botones Metálicos',
    description: 'Botones metálicos personalizados con tu diseño.',
    category: 'buttons',
    base_price: 8.00,
    production_cost: 4.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/fotobotones.png?crop=center&height=600&v=1741017071&width=600',
    dimensions: 'Diámetro estándar'
  },
  {
    name: 'Portallaves de MDF',
    description: 'Portallaves de pared de MDF personalizado. Mínimo 20 unidades.',
    category: 'keychains',
    base_price: 45.00,
    production_cost: 22.50,
    image_url: 'https://vtanunciando.com/cdn/shop/files/PORTALLAVES-VTWEB.png?crop=center&height=600&v=1736017105&width=600',
    dimensions: 'Para colgar en pared'
  },
  {
    name: 'Portarretratos de MDF',
    description: 'Portarretratos de MDF con corte láser personalizado. Marco decorativo para fotos con soporte trasero.',
    category: 'photo_frames',
    base_price: 40.00,
    production_cost: 20.00,
    image_url: 'https://res.cloudinary.com/dg1owvdhw/image/upload/v1771364794/products/portarretratos-mdf-axkan.png',
    dimensions: 'Tamaño estándar para foto'
  },
  {
    name: 'Souvenir Box',
    description: 'Paquete completo de souvenirs personalizados. Bundle especial.',
    category: 'bundles',
    base_price: 2250.00,
    production_cost: 1125.00,
    image_url: 'https://vtanunciando.com/cdn/shop/files/final-bundle-vtweb2.png?crop=center&height=600&v=1740866952&width=600',
    dimensions: 'Paquete completo personalizable'
  }
];

async function addProducts() {
  console.log('🔄 Connecting to production database...');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // First, mark all existing products as inactive
    console.log('📝 Deactivating old products...');
    await pool.query('UPDATE products SET is_active = false');
    console.log('✅ Deactivated all existing products');

    // Insert or update products
    console.log('📦 Adding/updating products...');

    for (const product of products) {
      // Try to update existing product by name
      const updateResult = await pool.query(
        `UPDATE products
         SET description = $2, category = $3, base_price = $4, production_cost = $5,
             image_url = $6, dimensions = $7, is_active = true
         WHERE name = $1
         RETURNING id, name`,
        [
          product.name,
          product.description,
          product.category,
          product.base_price,
          product.production_cost,
          product.image_url,
          product.dimensions
        ]
      );

      if (updateResult.rowCount > 0) {
        console.log(`  ✅ Updated: ${updateResult.rows[0].name} (ID: ${updateResult.rows[0].id})`);
      } else {
        // Product doesn't exist, insert it
        const insertResult = await pool.query(
          `INSERT INTO products
           (name, description, category, base_price, production_cost, image_url, dimensions, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           RETURNING id, name`,
          [
            product.name,
            product.description,
            product.category,
            product.base_price,
            product.production_cost,
            product.image_url,
            product.dimensions
          ]
        );
        console.log(`  ✅ Added: ${insertResult.rows[0].name} (ID: ${insertResult.rows[0].id})`);
      }
    }

    console.log('\n🎉 Successfully added all products!');
    console.log(`\n📊 Total products: ${products.length}`);

    // Verify
    const count = await pool.query('SELECT COUNT(*) FROM products WHERE is_active = true');
    console.log(`✅ Verified: ${count.rows[0].count} active products in database`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addProducts();

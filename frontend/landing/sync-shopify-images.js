#!/usr/bin/env node
/**
 * Sync Shopify Images to AXKAN Destination Pages
 *
 * Fetches all product images from vtanunciando.com Shopify store,
 * maps them to destination slugs, and:
 *   1. Writes destination-images.json (hero + gallery per destination)
 *   2. Generates new-destinations.js with entries for destinations
 *      not yet in generate-destinations.js
 *
 * Usage: node sync-shopify-images.js
 */

const fs = require('fs');
const path = require('path');

const SHOPIFY_URL = 'https://vtanunciando.com/collections/catalogo/products.json?limit=250';

// ═══════════════════════════════════════════════════════════
// SLUG GENERATION
// ═══════════════════════════════════════════════════════════

function toSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ═══════════════════════════════════════════════════════════
// MEXICAN GEOGRAPHY — State + Region mapping
// ═══════════════════════════════════════════════════════════

const cityStateMap = {
  // Existing 36 destinations (already in generator)
  'cancun': { state: 'Quintana Roo', region: 'caribe' },
  'cdmx': { state: 'CDMX', region: 'centro' },
  'oaxaca': { state: 'Oaxaca', region: 'sur' },
  'guanajuato': { state: 'Guanajuato', region: 'colonial' },
  'san-miguel-de-allende': { state: 'Guanajuato', region: 'colonial' },
  'guadalajara': { state: 'Jalisco', region: 'norte' },
  'puerto-vallarta': { state: 'Jalisco', region: 'pacifico' },
  'merida': { state: 'Yucatán', region: 'caribe' },
  'los-cabos': { state: 'Baja California Sur', region: 'pacifico' },
  'puebla': { state: 'Puebla', region: 'centro' },
  'huasteca-potosina': { state: 'San Luis Potosí', region: 'centro' },
  'tulum': { state: 'Quintana Roo', region: 'caribe' },
  'playa-del-carmen': { state: 'Quintana Roo', region: 'caribe' },
  'queretaro': { state: 'Querétaro', region: 'centro' },
  'mazatlan': { state: 'Sinaloa', region: 'pacifico' },
  'morelia': { state: 'Michoacán', region: 'colonial' },
  'chiapas': { state: 'Chiapas', region: 'sur' },
  'acapulco': { state: 'Guerrero', region: 'pacifico' },
  'monterrey': { state: 'Nuevo León', region: 'norte' },
  'zacatecas': { state: 'Zacatecas', region: 'colonial' },
  'bacalar': { state: 'Quintana Roo', region: 'caribe' },
  'campeche': { state: 'Campeche', region: 'sur' },
  'chignahuapan': { state: 'Puebla', region: 'centro' },
  'ciudad-mier': { state: 'Tamaulipas', region: 'norte' },
  'comalcalco': { state: 'Tabasco', region: 'sur' },
  'cozumel': { state: 'Quintana Roo', region: 'caribe' },
  'cuetzalan': { state: 'Puebla', region: 'centro' },
  'playa-las-gatas': { state: 'Guerrero', region: 'pacifico' },
  'puerto-escondido': { state: 'Oaxaca', region: 'pacifico' },
  'san-antonio-cuajimoloyas': { state: 'Oaxaca', region: 'sur' },
  'san-felipe': { state: 'Baja California', region: 'pacifico' },
  'san-gabriel': { state: 'Jalisco', region: 'colonial' },
  'toluca': { state: 'Estado de México', region: 'centro' },
  'union-juarez': { state: 'Chiapas', region: 'sur' },
  'zacatlan': { state: 'Puebla', region: 'centro' },
  'cerro-de-san-pedro': { state: 'San Luis Potosí', region: 'centro' },

  // New destinations — Mexican geography mapping
  'acambaro': { state: 'Guanajuato', region: 'colonial' },
  'acayucan': { state: 'Veracruz', region: 'sur' },
  'aguascalientes': { state: 'Aguascalientes', region: 'norte' },
  'ahuatlan': { state: 'Puebla', region: 'centro' },
  'alfajayucan': { state: 'Hidalgo', region: 'centro' },
  'aljocuca': { state: 'Puebla', region: 'centro' },
  'altamirano': { state: 'Guerrero', region: 'sur' },
  'alvarado': { state: 'Veracruz', region: 'sur' },
  'anton-lizardo': { state: 'Veracruz', region: 'sur' },
  'arcelia': { state: 'Guerrero', region: 'sur' },
  'atotonilco': { state: 'Jalisco', region: 'colonial' },
  'axochiapan': { state: 'Morelos', region: 'centro' },
  'ayahualulco': { state: 'Veracruz', region: 'centro' },
  'azoyu': { state: 'Guerrero', region: 'sur' },
  'bachoco': { state: 'Sonora', region: 'norte' },
  'bahia-de-kino': { state: 'Sonora', region: 'pacifico' },
  'binniguenda': { state: 'Oaxaca', region: 'sur' },
  'bodas': { state: 'México', region: 'centro' },
  'calvillo': { state: 'Aguascalientes', region: 'norte' },
  'cancun-2': { state: 'Quintana Roo', region: 'caribe' },
  'catemaco': { state: 'Veracruz', region: 'sur' },
  'cazones': { state: 'Veracruz', region: 'norte' },
  'celaya': { state: 'Guanajuato', region: 'colonial' },
  'chalma': { state: 'Estado de México', region: 'centro' },
  'chapala': { state: 'Jalisco', region: 'colonial' },
  'chiautla-de-tapia': { state: 'Puebla', region: 'centro' },
  'chichen-itza': { state: 'Yucatán', region: 'caribe' },
  'chiconcuac': { state: 'Estado de México', region: 'centro' },
  'chilapa': { state: 'Guerrero', region: 'sur' },
  'chilpancingo': { state: 'Guerrero', region: 'sur' },
  'chimalhuacan': { state: 'Estado de México', region: 'centro' },
  'cholula': { state: 'Puebla', region: 'centro' },
  'ciudad-del-carmen': { state: 'Campeche', region: 'sur' },
  'ciudad-valles': { state: 'San Luis Potosí', region: 'centro' },
  'coatepec': { state: 'Veracruz', region: 'centro' },
  'coatzacoalcos': { state: 'Veracruz', region: 'sur' },
  'colima': { state: 'Colima', region: 'pacifico' },
  'comala': { state: 'Colima', region: 'pacifico' },
  'comitan': { state: 'Chiapas', region: 'sur' },
  'copala': { state: 'Sinaloa', region: 'pacifico' },
  'cordoba': { state: 'Veracruz', region: 'centro' },
  'costa-esmeralda': { state: 'Veracruz', region: 'norte' },
  'coyuca-de-catalan': { state: 'Guerrero', region: 'sur' },
  'cuernavaca': { state: 'Morelos', region: 'centro' },
  'culiacan': { state: 'Sinaloa', region: 'norte' },
  'dolores-hidalgo': { state: 'Guanajuato', region: 'colonial' },
  'durango': { state: 'Durango', region: 'norte' },
  'el-fuerte': { state: 'Sinaloa', region: 'norte' },
  'el-tajin': { state: 'Veracruz', region: 'norte' },
  'ensenada': { state: 'Baja California', region: 'pacifico' },
  'etzatlan': { state: 'Jalisco', region: 'colonial' },
  'fortin-de-las-flores': { state: 'Veracruz', region: 'centro' },
  'guachochi': { state: 'Chihuahua', region: 'norte' },
  'guanajuato-2': { state: 'Guanajuato', region: 'colonial' },
  'guerrero-negro': { state: 'Baja California Sur', region: 'pacifico' },
  'hermosillo': { state: 'Sonora', region: 'norte' },
  'holbox': { state: 'Quintana Roo', region: 'caribe' },
  'huamantla': { state: 'Tlaxcala', region: 'centro' },
  'huatulco': { state: 'Oaxaca', region: 'pacifico' },
  'huauchinango': { state: 'Puebla', region: 'centro' },
  'huejutla': { state: 'Hidalgo', region: 'centro' },
  'iguala': { state: 'Guerrero', region: 'sur' },
  'isla-mujeres': { state: 'Quintana Roo', region: 'caribe' },
  'ixtapa-zihuatanejo': { state: 'Guerrero', region: 'pacifico' },
  'ixtapan-de-la-sal': { state: 'Estado de México', region: 'centro' },
  'izucar-de-matamoros': { state: 'Puebla', region: 'centro' },
  'jalapa': { state: 'Veracruz', region: 'centro' },
  'jalpan': { state: 'Querétaro', region: 'centro' },
  'jerez': { state: 'Zacatecas', region: 'colonial' },
  'jiutepec': { state: 'Morelos', region: 'centro' },
  'jojutla': { state: 'Morelos', region: 'centro' },
  'juchitan': { state: 'Oaxaca', region: 'sur' },
  'la-marquesa': { state: 'Estado de México', region: 'centro' },
  'la-paz': { state: 'Baja California Sur', region: 'pacifico' },
  'lago-de-patzcuaro': { state: 'Michoacán', region: 'colonial' },
  'leon': { state: 'Guanajuato', region: 'colonial' },
  'loreto': { state: 'Baja California Sur', region: 'pacifico' },
  'los-mochis': { state: 'Sinaloa', region: 'norte' },
  'malinalco': { state: 'Estado de México', region: 'centro' },
  'manzanillo': { state: 'Colima', region: 'pacifico' },
  'mapimi': { state: 'Durango', region: 'norte' },
  'metepec': { state: 'Estado de México', region: 'centro' },
  'mexico': { state: 'México', region: 'centro' },
  'minatitlan': { state: 'Veracruz', region: 'sur' },
  'mineral-del-chico': { state: 'Hidalgo', region: 'centro' },
  'mineral-del-monte': { state: 'Hidalgo', region: 'centro' },
  'mitla': { state: 'Oaxaca', region: 'sur' },
  'monte-alban': { state: 'Oaxaca', region: 'sur' },
  'motozintla': { state: 'Chiapas', region: 'sur' },
  'nautla': { state: 'Veracruz', region: 'norte' },
  'nogales': { state: 'Sonora', region: 'norte' },
  'nuevo-laredo': { state: 'Tamaulipas', region: 'norte' },
  'ojo-de-agua': { state: 'Estado de México', region: 'centro' },
  'orizaba': { state: 'Veracruz', region: 'centro' },
  'oxkutzcab': { state: 'Yucatán', region: 'caribe' },
  'pachuca': { state: 'Hidalgo', region: 'centro' },
  'palenque': { state: 'Chiapas', region: 'sur' },
  'papantla': { state: 'Veracruz', region: 'norte' },
  'paraiso': { state: 'Tabasco', region: 'sur' },
  'patzcuaro': { state: 'Michoacán', region: 'colonial' },
  'penjamo': { state: 'Guanajuato', region: 'colonial' },
  'pie-de-la-cuesta': { state: 'Guerrero', region: 'pacifico' },
  'playa-azul': { state: 'Michoacán', region: 'pacifico' },
  'poza-rica': { state: 'Veracruz', region: 'norte' },
  'progreso': { state: 'Yucatán', region: 'caribe' },
  'queretaro-2': { state: 'Querétaro', region: 'centro' },
  'real-de-catorce': { state: 'San Luis Potosí', region: 'norte' },
  'reynosa': { state: 'Tamaulipas', region: 'norte' },
  'rincon-de-guayabitos': { state: 'Nayarit', region: 'pacifico' },
  'riviera-maya': { state: 'Quintana Roo', region: 'caribe' },
  'salamanca': { state: 'Guanajuato', region: 'colonial' },
  'saltillo': { state: 'Coahuila', region: 'norte' },
  'salvatierra': { state: 'Guanajuato', region: 'colonial' },
  'san-andres-tuxtla': { state: 'Veracruz', region: 'sur' },
  'san-blas': { state: 'Nayarit', region: 'pacifico' },
  'san-cristobal-de-las-casas': { state: 'Chiapas', region: 'sur' },
  'san-juan-de-los-lagos': { state: 'Jalisco', region: 'colonial' },
  'san-juan-del-rio': { state: 'Querétaro', region: 'centro' },
  'san-luis-potosi': { state: 'San Luis Potosí', region: 'centro' },
  'san-miguel-regla': { state: 'Hidalgo', region: 'centro' },
  'san-pancho': { state: 'Nayarit', region: 'pacifico' },
  'santa-maria-del-oro': { state: 'Nayarit', region: 'pacifico' },
  'santiago-tuxtla': { state: 'Veracruz', region: 'sur' },
  'sayulita': { state: 'Nayarit', region: 'pacifico' },
  'sian-kaan': { state: 'Quintana Roo', region: 'caribe' },
  'sombrerete': { state: 'Zacatecas', region: 'colonial' },
  'tabasco': { state: 'Tabasco', region: 'sur' },
  'tampico': { state: 'Tamaulipas', region: 'norte' },
  'taxco': { state: 'Guerrero', region: 'sur' },
  'tecolutla': { state: 'Veracruz', region: 'norte' },
  'tehuacan': { state: 'Puebla', region: 'centro' },
  'teotihuacan': { state: 'Estado de México', region: 'centro' },
  'tepotzotlan': { state: 'Estado de México', region: 'centro' },
  'tepoztlan': { state: 'Morelos', region: 'centro' },
  'tequila': { state: 'Jalisco', region: 'colonial' },
  'texcoco': { state: 'Estado de México', region: 'centro' },
  'tierra-blanca': { state: 'Veracruz', region: 'sur' },
  'tijuana': { state: 'Baja California', region: 'pacifico' },
  'tlacotalpan': { state: 'Veracruz', region: 'sur' },
  'tlaquepaque': { state: 'Jalisco', region: 'colonial' },
  'tlaxcala': { state: 'Tlaxcala', region: 'centro' },
  'tlayacapan': { state: 'Morelos', region: 'centro' },
  'todos-santos': { state: 'Baja California Sur', region: 'pacifico' },
  'tula': { state: 'Hidalgo', region: 'centro' },
  'tuxpan': { state: 'Veracruz', region: 'norte' },
  'tuxtla-gutierrez': { state: 'Chiapas', region: 'sur' },
  'uruapan': { state: 'Michoacán', region: 'colonial' },
  'uxmal': { state: 'Yucatán', region: 'caribe' },
  'valladolid': { state: 'Yucatán', region: 'caribe' },
  'valle-de-bravo': { state: 'Estado de México', region: 'centro' },
  'veracruz': { state: 'Veracruz', region: 'sur' },
  'villahermosa': { state: 'Tabasco', region: 'sur' },
  'xalapa': { state: 'Veracruz', region: 'centro' },
  'xcaret': { state: 'Quintana Roo', region: 'caribe' },
  'xilitla': { state: 'San Luis Potosí', region: 'centro' },
  'xochimilco': { state: 'CDMX', region: 'centro' },
  'yuriria': { state: 'Guanajuato', region: 'colonial' },
  'zamora': { state: 'Michoacán', region: 'colonial' },
  'zihuatanejo': { state: 'Guerrero', region: 'pacifico' },
  'zimapan': { state: 'Hidalgo', region: 'centro' },
  'zitacuaro': { state: 'Michoacán', region: 'colonial' },
};

// ═══════════════════════════════════════════════════════════
// EXISTING DESTINATIONS — slugs already in generate-destinations.js
// ═══════════════════════════════════════════════════════════

const existingSlugs = new Set([
  'cancun', 'cdmx', 'oaxaca', 'guanajuato', 'san-miguel-de-allende',
  'guadalajara', 'puerto-vallarta', 'merida', 'los-cabos', 'puebla',
  'huasteca-potosina', 'tulum', 'playa-del-carmen', 'queretaro', 'mazatlan',
  'morelia', 'chiapas', 'acapulco', 'monterrey', 'zacatecas', 'bacalar',
  'campeche', 'chignahuapan', 'ciudad-mier', 'comalcalco', 'cozumel',
  'cuetzalan', 'playa-las-gatas', 'puerto-escondido', 'san-antonio-cuajimoloyas',
  'san-felipe', 'san-gabriel', 'toluca', 'union-juarez', 'zacatlan',
  'cerro-de-san-pedro'
]);

// ═══════════════════════════════════════════════════════════
// SPECIAL SLUG OVERRIDES — handle naming differences
// ═══════════════════════════════════════════════════════════

const slugOverrides = {
  'ciudad-de-mexico-catalogo-vt': 'cdmx',
  'ciudad-de-mexico': 'cdmx',
  'los-cabos-catalogo-vt': 'los-cabos',
  'cabo-san-lucas': 'los-cabos',
  'playa-del-carmen-catalogo-vt': 'playa-del-carmen',
  'san-cristobal': 'san-cristobal-de-las-casas',
  'zacatlan-de-las-manzanas': 'zacatlan',
  'ixtapa': 'ixtapa-zihuatanejo',
  'san-miguel': 'san-miguel-de-allende',
  'huasteca': 'huasteca-potosina',
  'cerro-san-pedro': 'cerro-de-san-pedro',
  'cuajimoloyas': 'san-antonio-cuajimoloyas',
};

// ═══════════════════════════════════════════════════════════
// MAIN SYNC
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('🔄 Fetching products from Shopify...');

  const response = await fetch(SHOPIFY_URL);
  const data = await response.json();
  const products = data.products;

  console.log(`📦 Found ${products.length} products`);

  // Build image mapping
  const imageMapping = {};
  const newDestinations = [];
  let totalImages = 0;

  for (const product of products) {
    // Clean the product title to get destination name
    const rawName = product.title
      .replace(/ - Catálogo VT/i, '')
      .replace(/ - Catalogo VT/i, '')
      .trim();

    // Generate slug
    let slug = toSlug(rawName);

    // Apply overrides
    if (slugOverrides[slug]) {
      slug = slugOverrides[slug];
    }

    // Get all image URLs
    const images = product.images.map(img => img.src);
    if (images.length === 0) continue;

    totalImages += images.length;

    // Build image mapping entry
    imageMapping[slug] = {
      hero: images[0],
      products: images.slice(0, 20) // Limit to 20 images per destination for performance
    };

    // Check if this is a new destination
    if (!existingSlugs.has(slug)) {
      const geo = cityStateMap[slug] || { state: 'México', region: 'centro' };

      newDestinations.push({
        slug,
        name: rawName,
        state: geo.state,
        description: `Souvenirs premium de ${rawName} con corte láser. Imanes, llaveros y portallaves con diseños exclusivos de ${rawName}, ${geo.state}.`,
        longDescription: `${rawName} es un destino con identidad y tradiciones únicas. Nuestros souvenirs capturan la esencia de ${rawName} con diseños exclusivos en MDF con corte láser de precisión. Cada imán, llavero, destapador y portallaves AXKAN de ${rawName} es un recuerdo premium que despierta orgullo y conecta a los visitantes con la belleza de ${geo.state}. Descubre nuestra colección completa de souvenirs de ${rawName}.`,
        keywords: `souvenirs ${rawName.toLowerCase()}, imanes ${rawName.toLowerCase()}, recuerdos ${rawName.toLowerCase()}, llaveros ${rawName.toLowerCase()}, regalos ${rawName.toLowerCase()}, souvenir ${geo.state.toLowerCase()}`,
        relatedDestinations: findRelated(slug, geo),
        image: images[0],
        region: geo.region,
        tags: product.tags || []
      });
    }
  }

  // Write destination-images.json
  const imgPath = path.join(__dirname, 'destination-images.json');
  fs.writeFileSync(imgPath, JSON.stringify(imageMapping, null, 2), 'utf-8');
  console.log(`\n📸 Wrote destination-images.json`);
  console.log(`   ${Object.keys(imageMapping).length} destinations mapped`);
  console.log(`   ${totalImages} total images`);

  // Write new destinations as JS code to insert
  if (newDestinations.length > 0) {
    const newDestsCode = newDestinations.map(d => {
      return `  {
    slug: '${d.slug}',
    name: '${escapeQuote(d.name)}',
    state: '${escapeQuote(d.state)}',
    description: '${escapeQuote(d.description)}',
    longDescription: '${escapeQuote(d.longDescription)}',
    keywords: '${escapeQuote(d.keywords)}',
    relatedDestinations: [${d.relatedDestinations.map(r => `'${r}'`).join(', ')}],
    image: '${d.image}',
    region: '${d.region}'
  }`;
    }).join(',\n');

    const newDestsPath = path.join(__dirname, 'new-destinations-data.js');
    fs.writeFileSync(newDestsPath, `// Auto-generated by sync-shopify-images.js on ${new Date().toISOString().split('T')[0]}
// ${newDestinations.length} new destinations to add to generate-destinations.js
// Copy the array entries below into the destinations array in generate-destinations.js

const newDestinations = [\n${newDestsCode}\n];

module.exports = newDestinations;
`, 'utf-8');

    console.log(`\n🆕 Wrote new-destinations-data.js`);
    console.log(`   ${newDestinations.length} new destinations generated`);
    console.log(`   Destinations: ${newDestinations.map(d => d.name).join(', ')}`);
  } else {
    console.log('\n✅ All Shopify destinations already exist in generator');
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 SYNC SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Shopify products:     ${products.length}`);
  console.log(`  Total images:         ${totalImages}`);
  console.log(`  Destinations mapped:  ${Object.keys(imageMapping).length}`);
  console.log(`  Existing (updated):   ${Object.keys(imageMapping).length - newDestinations.length}`);
  console.log(`  New destinations:     ${newDestinations.length}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('\n📋 Next steps:');
  console.log('  1. Review new-destinations-data.js');
  console.log('  2. Run: node patch-generator.js');
  console.log('  3. Run: node generate-destinations.js');
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function escapeQuote(str) {
  return str.replace(/'/g, "\\'").replace(/\n/g, ' ');
}

function findRelated(slug, geo) {
  // Find 2-3 related destinations from the same region/state
  const related = [];
  const allSlugs = [...existingSlugs];

  // First, try same state
  for (const [s, g] of Object.entries(cityStateMap)) {
    if (s !== slug && g.state === geo.state && allSlugs.includes(s)) {
      related.push(s);
      if (related.length >= 2) break;
    }
  }

  // Then, try same region
  if (related.length < 3) {
    for (const [s, g] of Object.entries(cityStateMap)) {
      if (s !== slug && g.region === geo.region && !related.includes(s) && allSlugs.includes(s)) {
        related.push(s);
        if (related.length >= 3) break;
      }
    }
  }

  // Fallback to popular destinations
  if (related.length < 2) {
    const popular = ['cdmx', 'cancun', 'oaxaca', 'guanajuato', 'guadalajara'];
    for (const p of popular) {
      if (p !== slug && !related.includes(p)) {
        related.push(p);
        if (related.length >= 2) break;
      }
    }
  }

  return related.slice(0, 3);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

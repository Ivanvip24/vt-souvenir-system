#!/usr/bin/env node
/**
 * AXKAN Destination Page Generator
 *
 * Generates individual SEO-optimized HTML pages for each destination.
 * Each page gets its own URL, title, meta tags, and schema markup.
 *
 * Usage: node generate-destinations.js
 * Output: ./souvenirs/{slug}.html for each destination
 *         ./souvenirs/index.html (directory listing)
 *         ./sitemap.xml
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// GALLERY IMAGE MAPPING — loaded from sync-gallery.js output
// ═══════════════════════════════════════════════════════════

const imageMappingPath = path.join(__dirname, 'destination-images.json');
let imageMapping = {};
if (fs.existsSync(imageMappingPath)) {
  imageMapping = JSON.parse(fs.readFileSync(imageMappingPath, 'utf-8'));
  console.log(`📸 Loaded image mapping for ${Object.keys(imageMapping).length} destinations`);
} else {
  console.log('📸 No destination-images.json found — using placeholder images');
}

// ═══════════════════════════════════════════════════════════
// DESTINATION DATA — Add new destinations here
// ═══════════════════════════════════════════════════════════

const destinations = [
  {
    slug: 'cancun',
    name: 'Cancún',
    state: 'Quintana Roo',
    description: 'Souvenirs premium de Cancún con corte láser. Imanes, llaveros y portallaves con diseños del Caribe mexicano, zona hotelera, playas y cultura maya.',
    longDescription: 'Cancún es uno de los destinos turísticos más visitados de México. Nuestros souvenirs capturan la esencia del Caribe mexicano: playas de arena blanca, el azul turquesa del mar, la zona hotelera, ruinas mayas como Tulum y Chichén Itzá, y la vibrante vida nocturna. Cada imán y llavero AXKAN de Cancún es un recuerdo premium con corte láser de precisión.',
    keywords: 'souvenirs cancun, imanes cancun, recuerdos cancun, magnets cancun mexico, llaveros cancun, regalos cancun, souvenir playa del carmen, souvenir riviera maya, recuerdos quintana roo',
    relatedDestinations: ['playa-del-carmen', 'tulum', 'merida'],
    image: '/assets/TEST-03.png',
    region: 'caribe'
  },
  {
    slug: 'cdmx',
    name: 'Ciudad de México',
    state: 'CDMX',
    description: 'Souvenirs premium de la Ciudad de México con corte láser. Imanes y llaveros con diseños del Ángel de la Independencia, Palacio de Bellas Artes, Zócalo y más.',
    longDescription: 'La Ciudad de México es el corazón cultural de todo el país. Nuestros souvenirs representan los íconos más emblemáticos de la capital: el Ángel de la Independencia, el Palacio de Bellas Artes, la Catedral Metropolitana, el Zócalo, Chapultepec, Coyoacán y la arquitectura colonial del Centro Histórico. Cada pieza AXKAN es un tributo a la grandeza de la CDMX.',
    keywords: 'souvenirs cdmx, imanes ciudad de mexico, recuerdos cdmx, souvenirs mexico city, llaveros cdmx, regalos ciudad de mexico, souvenir zocalo, souvenir bellas artes, recuerdos df',
    relatedDestinations: ['teotihuacan', 'puebla', 'guanajuato'],
    image: '/assets/TEST-03.png',
    region: 'centro'
  },
  {
    slug: 'oaxaca',
    name: 'Oaxaca',
    state: 'Oaxaca',
    description: 'Souvenirs premium de Oaxaca con corte láser. Imanes y llaveros con diseños de Monte Albán, Hierve el Agua, alebrijes, mezcal y cultura zapoteca.',
    longDescription: 'Oaxaca es tierra de colores, sabores y tradiciones milenarias. Nuestros souvenirs capturan la magia de esta región: Monte Albán, Hierve el Agua, el árbol del Tule, las cascadas petrificadas, los alebrijes, el mezcal artesanal, la Guelaguetza y la rica cultura zapoteca y mixteca. Cada souvenir AXKAN de Oaxaca es una obra de arte en MDF con corte láser.',
    keywords: 'souvenirs oaxaca, imanes oaxaca, recuerdos oaxaca, magnets oaxaca mexico, llaveros oaxaca, regalos oaxaca, souvenir monte alban, souvenir hierve el agua, recuerdos oaxaca de juarez',
    relatedDestinations: ['huatulco', 'cdmx', 'puebla'],
    image: '/assets/TEST-03.png',
    region: 'sur'
  },
  {
    slug: 'guanajuato',
    name: 'Guanajuato',
    state: 'Guanajuato',
    description: 'Souvenirs premium de Guanajuato con corte láser. Imanes y llaveros con diseños de callejones coloridos, el Callejón del Beso, la Alhóndiga y el Pípila.',
    longDescription: 'Guanajuato es una de las ciudades más coloridas y románticas de México. Nuestros souvenirs representan sus callejones empedrados, el famoso Callejón del Beso, la Alhóndiga de Granaditas, el monumento al Pípila, el Teatro Juárez, las momias de Guanajuato y las casitas de colores que hacen de esta ciudad un tesoro colonial. Cada pieza AXKAN captura esa magia.',
    keywords: 'souvenirs guanajuato, imanes guanajuato, recuerdos guanajuato, llaveros guanajuato, regalos guanajuato, souvenir callejon del beso, souvenir pipila, recuerdos guanajuato capital',
    relatedDestinations: ['san-miguel-de-allende', 'leon', 'cdmx'],
    image: '/assets/TEST-03.png',
    region: 'colonial'
  },
  {
    slug: 'san-miguel-de-allende',
    name: 'San Miguel de Allende',
    state: 'Guanajuato',
    description: 'Souvenirs premium de San Miguel de Allende con corte láser. Imanes y llaveros con la Parroquia de San Miguel Arcángel y calles coloniales.',
    longDescription: 'San Miguel de Allende ha sido nombrada la mejor ciudad del mundo para visitar en múltiples ocasiones. Nuestros souvenirs capturan la icónica Parroquia de San Miguel Arcángel, sus calles empedradas, los coloridos edificios coloniales, el Jardín Principal, las galerías de arte, y esa atmósfera mágica que combina historia, cultura y modernidad. Cada imán AXKAN es un pedacito de San Miguel.',
    keywords: 'souvenirs san miguel de allende, imanes san miguel, recuerdos san miguel de allende, llaveros san miguel, regalos san miguel de allende, souvenir parroquia san miguel, recuerdos guanajuato',
    relatedDestinations: ['guanajuato', 'queretaro', 'cdmx'],
    image: '/assets/TEST-03.png',
    region: 'colonial'
  },
  {
    slug: 'guadalajara',
    name: 'Guadalajara',
    state: 'Jalisco',
    description: 'Souvenirs premium de Guadalajara con corte láser. Imanes y llaveros con diseños de la Catedral, Hospicio Cabañas, mariachi y cultura tapatía.',
    longDescription: 'Guadalajara es la Perla de Occidente, cuna del mariachi y el tequila. Nuestros souvenirs celebran la Catedral de Guadalajara, el Hospicio Cabañas (Patrimonio de la Humanidad), el Teatro Degollado, Tlaquepaque, la Minerva, y toda la riqueza cultural de Jalisco. Cada pieza AXKAN con corte láser es un homenaje a la tradición tapatía.',
    keywords: 'souvenirs guadalajara, imanes guadalajara, recuerdos guadalajara, llaveros guadalajara, regalos guadalajara, souvenir jalisco, souvenir tlaquepaque, recuerdos tapatio',
    relatedDestinations: ['tequila', 'puerto-vallarta', 'cdmx'],
    image: '/assets/TEST-03.png',
    region: 'norte'
  },
  {
    slug: 'puerto-vallarta',
    name: 'Puerto Vallarta',
    state: 'Jalisco',
    description: 'Souvenirs premium de Puerto Vallarta con corte láser. Imanes y llaveros con diseños del malecón, playas del Pacífico y la Sierra Madre.',
    longDescription: 'Puerto Vallarta combina la belleza del Pacífico mexicano con la calidez de un pueblo con encanto. Nuestros souvenirs capturan el icónico malecón, las playas doradas, la zona romántica, la Iglesia de Nuestra Señora de Guadalupe, la Sierra Madre Occidental y los atardeceres que han hecho famoso a este destino. Cada souvenir AXKAN de Vallarta es un recuerdo del paraíso.',
    keywords: 'souvenirs puerto vallarta, imanes puerto vallarta, recuerdos vallarta, llaveros puerto vallarta, regalos vallarta, souvenir bahia de banderas, souvenir malecon vallarta',
    relatedDestinations: ['guadalajara', 'los-cabos', 'mazatlan'],
    image: '/assets/TEST-03.png',
    region: 'pacifico'
  },
  {
    slug: 'merida',
    name: 'Mérida',
    state: 'Yucatán',
    description: 'Souvenirs premium de Mérida con corte láser. Imanes y llaveros con diseños de arquitectura colonial yucateca, cenotes y cultura maya.',
    longDescription: 'Mérida, la Ciudad Blanca, es la puerta de entrada al mundo maya. Nuestros souvenirs representan su hermosa arquitectura colonial, el Paseo de Montejo, la Catedral de San Ildefonso, los cenotes sagrados, Uxmal, y la rica gastronomía yucateca. Cada pieza AXKAN de Mérida conecta al viajero con la profundidad de la cultura maya y colonial.',
    keywords: 'souvenirs merida, imanes merida yucatan, recuerdos merida, llaveros merida, regalos merida yucatan, souvenir chichen itza, souvenir cenotes, recuerdos yucatan',
    relatedDestinations: ['cancun', 'tulum', 'campeche'],
    image: '/assets/TEST-03.png',
    region: 'caribe'
  },
  {
    slug: 'los-cabos',
    name: 'Los Cabos',
    state: 'Baja California Sur',
    description: 'Souvenirs premium de Los Cabos con corte láser. Imanes y llaveros con diseños del Arco de Cabo San Lucas, El Médano y el desierto junto al mar.',
    longDescription: 'Los Cabos es donde el desierto se encuentra con el mar. Nuestros souvenirs capturan el icónico Arco de Cabo San Lucas, la playa El Médano, el corredor turístico, los paisajes de Baja California Sur, y esa fusión única de naturaleza salvaje y lujo. Cada souvenir AXKAN de Los Cabos es un recuerdo del fin de la tierra mexicana.',
    keywords: 'souvenirs los cabos, imanes cabo san lucas, recuerdos los cabos, llaveros cabo, regalos los cabos, souvenir baja california sur, souvenir arco cabo san lucas, recuerdos cabo',
    relatedDestinations: ['la-paz', 'puerto-vallarta', 'mazatlan'],
    image: '/assets/TEST-03.png',
    region: 'pacifico'
  },
  {
    slug: 'puebla',
    name: 'Puebla',
    state: 'Puebla',
    description: 'Souvenirs premium de Puebla con corte láser. Imanes y llaveros con diseños de talavera, la Catedral, Cholula y volcanes.',
    longDescription: 'Puebla es la ciudad de los ángeles, famosa por su talavera, su gastronomía y su historia. Nuestros souvenirs representan la majestuosa Catedral de Puebla, la pirámide de Cholula, los volcanes Popocatépetl e Iztaccíhuatl, la Biblioteca Palafoxiana, y la icónica cerámica de talavera. Cada pieza AXKAN de Puebla es un tributo a la riqueza cultural del centro de México.',
    keywords: 'souvenirs puebla, imanes puebla, recuerdos puebla, llaveros puebla, regalos puebla, souvenir cholula, souvenir talavera, recuerdos puebla de los angeles, souvenir volcanes',
    relatedDestinations: ['cdmx', 'oaxaca', 'tlaxcala'],
    image: '/assets/TEST-03.png',
    region: 'centro'
  },
  {
    slug: 'huasteca-potosina',
    name: 'Huasteca Potosina',
    state: 'San Luis Potosí',
    description: 'Souvenirs premium de la Huasteca Potosina con corte láser. Imanes y llaveros con diseños de cascadas, sótanos, puente de dios y selva.',
    longDescription: 'La Huasteca Potosina es uno de los destinos naturales más impresionantes de México. Nuestros souvenirs capturan la Cascada de Tamul, el Sótano de las Golondrinas, el Puente de Dios, las pozas de agua turquesa, Xilitla y el Jardín Surrealista de Edward James. Cada imán AXKAN de la Huasteca es un recordatorio de la naturaleza más espectacular de México.',
    keywords: 'souvenirs huasteca potosina, imanes huasteca, recuerdos huasteca potosina, llaveros huasteca, regalos huasteca, souvenir tamul, souvenir xilitla, recuerdos san luis potosi',
    relatedDestinations: ['cdmx', 'queretaro', 'tampico'],
    image: '/assets/TEST-03.png',
    region: 'centro'
  },
  {
    slug: 'tulum',
    name: 'Tulum',
    state: 'Quintana Roo',
    description: 'Souvenirs premium de Tulum con corte láser. Imanes y llaveros con diseños de ruinas mayas frente al mar, cenotes y playa caribeña.',
    longDescription: 'Tulum es donde la historia maya se encuentra con el Caribe. Nuestros souvenirs representan las ruinas mayas frente al mar turquesa, los cenotes cristalinos, la zona de playa, la biosfera de Sian Ka\'an, y esa energía única que mezcla lo antiguo con lo moderno. Cada souvenir AXKAN de Tulum captura la magia de este destino icónico.',
    keywords: 'souvenirs tulum, imanes tulum, recuerdos tulum, llaveros tulum, regalos tulum, souvenir ruinas tulum, souvenir cenotes tulum, recuerdos riviera maya, souvenir quintana roo',
    relatedDestinations: ['cancun', 'playa-del-carmen', 'merida'],
    image: '/assets/TEST-03.png',
    region: 'caribe'
  },
  {
    slug: 'playa-del-carmen',
    name: 'Playa del Carmen',
    state: 'Quintana Roo',
    description: 'Souvenirs premium de Playa del Carmen con corte láser. Imanes y llaveros con diseños de la Quinta Avenida, playas caribeñas y Xcaret.',
    longDescription: 'Playa del Carmen es el corazón de la Riviera Maya. Nuestros souvenirs capturan la famosa Quinta Avenida, las playas de arena blanca, los parques ecológicos como Xcaret y Xel-Há, la isla de Cozumel, y la vibrante vida cosmopolita de este destino caribeño. Cada pieza AXKAN de Playa es un recuerdo premium del paraíso.',
    keywords: 'souvenirs playa del carmen, imanes playa del carmen, recuerdos playa del carmen, llaveros playa, regalos riviera maya, souvenir quinta avenida, souvenir xcaret, recuerdos caribe mexicano',
    relatedDestinations: ['cancun', 'tulum', 'cozumel'],
    image: '/assets/TEST-03.png',
    region: 'caribe'
  },
  {
    slug: 'queretaro',
    name: 'Querétaro',
    state: 'Querétaro',
    description: 'Souvenirs premium de Querétaro con corte láser. Imanes y llaveros con diseños del acueducto, Centro Histórico y viñedos.',
    longDescription: 'Querétaro combina historia colonial con modernidad. Nuestros souvenirs representan el icónico Acueducto, el Centro Histórico (Patrimonio de la Humanidad), el Cerro de las Campanas, la ruta del queso y el vino, y la Peña de Bernal. Cada pieza AXKAN de Querétaro celebra una de las ciudades más dinámicas y con mayor calidad de vida de México.',
    keywords: 'souvenirs queretaro, imanes queretaro, recuerdos queretaro, llaveros queretaro, regalos queretaro, souvenir acueducto queretaro, souvenir pena de bernal, recuerdos santiago de queretaro',
    relatedDestinations: ['san-miguel-de-allende', 'cdmx', 'guanajuato'],
    image: '/assets/TEST-03.png',
    region: 'centro'
  },
  {
    slug: 'mazatlan',
    name: 'Mazatlán',
    state: 'Sinaloa',
    description: 'Souvenirs premium de Mazatlán con corte láser. Imanes y llaveros con diseños del malecón, faro, machado y playas del Pacífico.',
    longDescription: 'Mazatlán es la Perla del Pacífico, con el malecón más largo de México. Nuestros souvenirs capturan el Centro Histórico, la Plazuela Machado, el icónico Faro de Mazatlán (el más alto de América), la Zona Dorada, la Isla de la Piedra, y esa mezcla única de tradición sinaloense con destino de playa. Cada souvenir AXKAN de Mazatlán es un pedazo del Pacífico.',
    keywords: 'souvenirs mazatlan, imanes mazatlan, recuerdos mazatlan, llaveros mazatlan, regalos mazatlan, souvenir sinaloa, souvenir malecon mazatlan, recuerdos perla del pacifico',
    relatedDestinations: ['puerto-vallarta', 'los-cabos', 'guadalajara'],
    image: '/assets/TEST-03.png',
    region: 'pacifico'
  },
  {
    slug: 'morelia',
    name: 'Morelia',
    state: 'Michoacán',
    description: 'Souvenirs premium de Morelia con corte láser. Imanes y llaveros con diseños de la Catedral, acueducto y arquitectura colonial michoacana.',
    longDescription: 'Morelia es la capital de Michoacán y una joya del patrimonio colonial mexicano. Nuestros souvenirs representan su majestuosa Catedral, el acueducto, el Centro Histórico (Patrimonio de la Humanidad), las mariposas monarca, Pátzcuaro, Janitzio, y la rica tradición artesanal michoacana. Cada pieza AXKAN de Morelia conecta con la esencia de México profundo.',
    keywords: 'souvenirs morelia, imanes morelia, recuerdos morelia, llaveros morelia, regalos michoacan, souvenir catedral morelia, souvenir patzcuaro, recuerdos michoacan, souvenir mariposa monarca',
    relatedDestinations: ['guanajuato', 'cdmx', 'guadalajara'],
    image: '/assets/TEST-03.png',
    region: 'colonial'
  },
  {
    slug: 'chiapas',
    name: 'Chiapas',
    state: 'Chiapas',
    description: 'Souvenirs premium de Chiapas con corte láser. Imanes y llaveros con diseños del Cañón del Sumidero, San Cristóbal, Palenque y cascadas.',
    longDescription: 'Chiapas es naturaleza y cultura en estado puro. Nuestros souvenirs capturan el Cañón del Sumidero, San Cristóbal de las Casas, las ruinas de Palenque, las Cascadas de Agua Azul, los Lagos de Montebello, la Selva Lacandona, y la rica herencia de los pueblos originarios. Cada souvenir AXKAN de Chiapas es un tributo a la biodiversidad y cultura del sureste mexicano.',
    keywords: 'souvenirs chiapas, imanes chiapas, recuerdos chiapas, llaveros chiapas, regalos chiapas, souvenir san cristobal de las casas, souvenir canon del sumidero, souvenir palenque, recuerdos selva lacandona',
    relatedDestinations: ['oaxaca', 'merida', 'guatemala'],
    image: '/assets/TEST-03.png',
    region: 'sur'
  },
  {
    slug: 'acapulco',
    name: 'Acapulco',
    state: 'Guerrero',
    description: 'Souvenirs premium de Acapulco con corte láser. Imanes y llaveros con diseños de la bahía, clavadistas de La Quebrada y playas del Pacífico.',
    longDescription: 'Acapulco es un clásico de los destinos de playa mexicanos. Nuestros souvenirs representan la icónica bahía, los clavadistas de La Quebrada, la Costera Miguel Alemán, Pie de la Cuesta, el Fuerte de San Diego, y ese espíritu de diversión y aventura que ha definido a Acapulco por décadas. Cada pieza AXKAN captura la energía del puerto guerrerense.',
    keywords: 'souvenirs acapulco, imanes acapulco, recuerdos acapulco, llaveros acapulco, regalos acapulco, souvenir la quebrada, souvenir guerrero, recuerdos acapulco diamante',
    relatedDestinations: ['cdmx', 'oaxaca', 'puerto-vallarta'],
    image: '/assets/TEST-03.png',
    region: 'pacifico'
  },
  {
    slug: 'monterrey',
    name: 'Monterrey',
    state: 'Nuevo León',
    description: 'Souvenirs premium de Monterrey con corte láser. Imanes y llaveros con diseños del Cerro de la Silla, Fundidora, Macroplaza y Sierra Madre.',
    longDescription: 'Monterrey es la capital industrial de México con paisajes naturales impresionantes. Nuestros souvenirs capturan el icónico Cerro de la Silla, el Parque Fundidora, la Macroplaza, el Museo MARCO, la Huasteca, la Cola de Caballo, y esa mezcla de modernidad con naturaleza que hace única a la Sultana del Norte. Cada souvenir AXKAN de Monterrey es un orgullo regio.',
    keywords: 'souvenirs monterrey, imanes monterrey, recuerdos monterrey, llaveros monterrey, regalos monterrey, souvenir cerro de la silla, souvenir nuevo leon, recuerdos sultana del norte',
    relatedDestinations: ['cdmx', 'guadalajara', 'saltillo'],
    image: '/assets/TEST-03.png',
    region: 'norte'
  },
  {
    slug: 'zacatecas',
    name: 'Zacatecas',
    state: 'Zacatecas',
    description: 'Souvenirs premium de Zacatecas con corte láser. Imanes y llaveros con diseños de la Catedral, teleférico, mina El Edén y callejones coloniales.',
    longDescription: 'Zacatecas es una ciudad minera colonial con una riqueza arquitectónica impresionante. Nuestros souvenirs representan la Catedral barroca, el teleférico sobre la ciudad, la Mina El Edén, el Cerro de la Bufa, el acueducto El Cubo, y la famosa callejoneada. Cada pieza AXKAN de Zacatecas celebra uno de los Pueblos Mágicos más espectaculares de México.',
    keywords: 'souvenirs zacatecas, imanes zacatecas, recuerdos zacatecas, llaveros zacatecas, regalos zacatecas, souvenir mina el eden, souvenir teleferico zacatecas, recuerdos bufa',
    relatedDestinations: ['guanajuato', 'san-luis-potosi', 'aguascalientes'],
    image: '/assets/TEST-03.png',
    region: 'colonial'
  }
];

const products = [
  { name: 'Imanes MDF', price: '$8-$15/pieza mayoreo', description: 'Imanes decorativos con corte láser de precisión y acabado brillante UV' },
  { name: 'Llaveros MDF', price: '$7-$10/pieza mayoreo', description: 'Llaveros con argolla reforzada y diseños únicos por destino' },
  { name: 'Portallaves', price: '$34-$40/pieza', description: 'Piezas decorativas para el hogar con diseños emblemáticos' },
  { name: 'Destapadores', price: '$16-$20/pieza mayoreo', description: 'Funcionales y decorativos, con imán trasero y doble remache' }
];

// ═══════════════════════════════════════════════════════════
// APPLY IMAGE MAPPING — Override placeholders with Cloudinary URLs
// ═══════════════════════════════════════════════════════════

for (const dest of destinations) {
  if (imageMapping[dest.slug]) {
    dest.image = imageMapping[dest.slug].hero;
    dest.productImages = imageMapping[dest.slug].products;
  } else {
    // No gallery images for this destination — repeat placeholder across all 4 product slots
    dest.productImages = [dest.image, dest.image, dest.image, dest.image];
  }
}

// ═══════════════════════════════════════════════════════════
// HTML TEMPLATE
// ═══════════════════════════════════════════════════════════

function generatePage(dest) {
  // Handle both relative paths (/assets/...) and full Cloudinary URLs (https://...)
  const ogImage = dest.image.startsWith('http') ? dest.image : `https://axkan.art${dest.image}`;

  const relatedHtml = dest.relatedDestinations
    .map(slug => {
      const related = destinations.find(d => d.slug === slug);
      if (!related) return '';
      return `<a href="/souvenirs/${related.slug}" class="related-card">
                <span class="related-name">${escapeHtml(related.name)}</span>
                <span class="related-state">${escapeHtml(related.state)}</span>
              </a>`;
    })
    .filter(Boolean)
    .join('\n              ');

  const productsHtml = products.map((p, i) => {
    const productImg = (dest.productImages && dest.productImages[i]) || dest.image;
    return `
            <div class="dest-product-card">
              <img src="${productImg}" alt="${escapeHtml(p.name)} souvenir ${escapeHtml(dest.name)} México - Corte láser AXKAN" loading="lazy">
              <h3>${escapeHtml(p.name)} — ${escapeHtml(dest.name)}</h3>
              <p>${escapeHtml(p.description)}</p>
              <span class="dest-product-price">${escapeHtml(p.price)}</span>
            </div>`;
  }).join('\n');

  const allDestsHtml = destinations
    .filter(d => d.slug !== dest.slug)
    .map(d => `<a href="/souvenirs/${d.slug}">${escapeHtml(d.name)}</a>`)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Souvenirs ${escapeHtml(dest.name)} — Imanes, Llaveros y Recuerdos | AXKAN</title>
    <meta name="description" content="${escapeAttr(dest.description)}">
    <meta name="keywords" content="${escapeAttr(dest.keywords)}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <meta name="author" content="AXKAN">
    <link rel="canonical" href="https://axkan.art/souvenirs/${dest.slug}">

    <!-- Open Graph -->
    <meta property="og:title" content="Souvenirs ${escapeAttr(dest.name)} — Imanes y Llaveros Premium | AXKAN">
    <meta property="og:description" content="${escapeAttr(dest.description)}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:type" content="product">
    <meta property="og:url" content="https://axkan.art/souvenirs/${dest.slug}">
    <meta property="og:site_name" content="AXKAN">
    <meta property="og:locale" content="es_MX">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Souvenirs ${escapeAttr(dest.name)} — AXKAN">
    <meta name="twitter:description" content="${escapeAttr(dest.description)}">
    <meta name="twitter:image" content="${ogImage}">

    <!-- Geo -->
    <meta name="geo.region" content="MX">
    <meta name="geo.placename" content="${escapeAttr(dest.name)}, México">
    <link rel="alternate" hreflang="es" href="https://axkan.art/souvenirs/${dest.slug}">

    <link rel="icon" type="image/png" href="/assets/LOGO-01.png">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

    <!-- JSON-LD: Product -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Souvenirs ${escapeJson(dest.name)} - AXKAN",
      "description": "${escapeJson(dest.description)}",
      "brand": {"@type": "Brand", "name": "AXKAN"},
      "image": "${ogImage}",
      "category": "Souvenirs > ${escapeJson(dest.name)}",
      "material": "MDF con corte láser",
      "countryOfOrigin": "México",
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "MXN",
        "lowPrice": "7",
        "highPrice": "120",
        "offerCount": "4",
        "availability": "https://schema.org/InStock"
      }
    }
    </script>

    <!-- JSON-LD: BreadcrumbList -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "AXKAN", "item": "https://axkan.art/"},
        {"@type": "ListItem", "position": 2, "name": "Souvenirs", "item": "https://axkan.art/souvenirs"},
        {"@type": "ListItem", "position": 3, "name": "${escapeJson(dest.name)}", "item": "https://axkan.art/souvenirs/${dest.slug}"}
      ]
    }
    </script>

    <style>
      @font-face {
        font-family: 'RL Aqva';
        src: url('/fonts/rl-aqva-black.otf') format('opentype');
        font-weight: 900;
        font-display: swap;
      }
      @font-face {
        font-family: 'Objektiv';
        src: url('/fonts/objektiv-vf.otf') format('opentype');
        font-weight: 100 900;
        font-display: swap;
      }
      :root {
        --rosa-mexicano: #e72a88;
        --verde-selva: #8ab73b;
        --naranja-calido: #f39223;
        --oro-maya: #D4A574;
        --font-display: 'RL Aqva', 'Fredoka', sans-serif;
        --font-body: 'Objektiv', 'Inter', -apple-system, sans-serif;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: var(--font-body); color: #1f1f1f; background: #fafafa; line-height: 1.6; }
      a { color: var(--rosa-mexicano); text-decoration: none; }
      a:hover { text-decoration: underline; }

      /* Nav */
      .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 5%; background: white; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; }
      .nav-logo { height: 36px; }
      .nav-links { display: flex; gap: 24px; list-style: none; align-items: center; }
      .nav-links a { color: #333; font-weight: 500; font-size: 14px; }
      .nav-cta { background: var(--rosa-mexicano); color: white !important; padding: 8px 20px; border-radius: 24px; }

      /* Breadcrumb */
      .breadcrumb { padding: 12px 5%; font-size: 13px; color: #888; }
      .breadcrumb a { color: #666; }
      .breadcrumb span { margin: 0 6px; }

      /* Hero */
      .dest-hero { padding: 60px 5% 40px; display: flex; gap: 48px; align-items: center; max-width: 1200px; margin: 0 auto; }
      .dest-hero-text { flex: 1; }
      .dest-hero-text h1 { font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.1; margin-bottom: 8px; }
      .dest-hero-text h1 .highlight { color: var(--rosa-mexicano); }
      .dest-state { color: #888; font-size: 14px; margin-bottom: 16px; display: block; }
      .dest-hero-text p { font-size: 16px; color: #555; margin-bottom: 24px; }
      .dest-hero-img { flex: 0 0 320px; }
      .dest-hero-img img { width: 100%; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.1); }
      .btn { display: inline-block; padding: 14px 32px; border-radius: 32px; font-weight: 600; font-size: 15px; transition: transform 0.2s; }
      .btn:hover { transform: translateY(-2px); text-decoration: none; }
      .btn-primary { background: var(--rosa-mexicano); color: white; }
      .btn-secondary { border: 2px solid var(--rosa-mexicano); color: var(--rosa-mexicano); margin-left: 12px; }

      /* Products */
      .dest-products { padding: 60px 5%; max-width: 1200px; margin: 0 auto; }
      .dest-products h2 { font-family: var(--font-display); font-size: 2rem; margin-bottom: 32px; text-align: center; }
      .dest-products-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; }
      .dest-product-card { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); transition: transform 0.3s; }
      .dest-product-card:hover { transform: translateY(-4px); }
      .dest-product-card img { width: 100%; height: 200px; object-fit: cover; }
      .dest-product-card h3 { padding: 16px 16px 8px; font-size: 16px; font-weight: 600; }
      .dest-product-card p { padding: 0 16px; font-size: 14px; color: #666; }
      .dest-product-price { display: block; padding: 12px 16px 16px; font-weight: 700; color: var(--rosa-mexicano); font-size: 15px; }

      /* About section */
      .dest-about { padding: 60px 5%; max-width: 900px; margin: 0 auto; }
      .dest-about h2 { font-family: var(--font-display); font-size: 1.8rem; margin-bottom: 16px; }
      .dest-about p { font-size: 16px; color: #555; margin-bottom: 16px; }

      /* CTA */
      .dest-cta { text-align: center; padding: 60px 5%; background: linear-gradient(135deg, var(--rosa-mexicano), #aa1e6b); color: white; }
      .dest-cta h2 { font-family: var(--font-display); font-size: 2rem; margin-bottom: 12px; }
      .dest-cta p { margin-bottom: 24px; opacity: 0.9; }
      .dest-cta .btn { background: white; color: var(--rosa-mexicano); }

      /* Related */
      .dest-related { padding: 48px 5%; max-width: 1200px; margin: 0 auto; }
      .dest-related h2 { font-family: var(--font-display); font-size: 1.5rem; margin-bottom: 24px; }
      .related-grid { display: flex; gap: 16px; flex-wrap: wrap; }
      .related-card { display: block; background: white; padding: 20px 28px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); transition: transform 0.2s; }
      .related-card:hover { transform: translateY(-3px); text-decoration: none; }
      .related-name { display: block; font-weight: 700; font-size: 16px; color: #1f1f1f; }
      .related-state { font-size: 13px; color: #888; }

      /* All destinations */
      .dest-all { padding: 32px 5% 48px; max-width: 1200px; margin: 0 auto; border-top: 1px solid #eee; }
      .dest-all h3 { font-size: 14px; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
      .dest-all-links { font-size: 14px; line-height: 2; color: #666; }
      .dest-all-links a { color: #555; }

      /* Footer */
      .dest-footer { text-align: center; padding: 24px; font-size: 13px; color: #aaa; border-top: 1px solid #eee; }

      @media (max-width: 768px) {
        .dest-hero { flex-direction: column-reverse; padding: 32px 5% 24px; gap: 24px; }
        .dest-hero-img { flex: none; width: 100%; max-width: 300px; margin: 0 auto; }
        .nav-links { gap: 12px; font-size: 12px; }
        .btn-secondary { margin-left: 0; margin-top: 8px; }
      }
    </style>
</head>
<body>
    <nav class="nav">
      <a href="/"><img src="/assets/LOGO-03.png" alt="AXKAN - Souvenirs Premium de México" class="nav-logo"></a>
      <ul class="nav-links">
        <li><a href="/#productos">Productos</a></li>
        <li><a href="/souvenirs">Destinos</a></li>
        <li><a href="https://vtanunciando.com" target="_blank">Catálogo</a></li>
        <li><a href="https://axkan-pedidos.vercel.app/" class="nav-cta">Hacer Pedido</a></li>
      </ul>
    </nav>

    <div class="breadcrumb">
      <a href="/">AXKAN</a> <span>›</span> <a href="/souvenirs">Souvenirs</a> <span>›</span> ${escapeHtml(dest.name)}
    </div>

    <section class="dest-hero">
      <div class="dest-hero-text">
        <h1>Souvenirs <span class="highlight">${escapeHtml(dest.name)}</span></h1>
        <span class="dest-state">${escapeHtml(dest.state)}, México</span>
        <p>${escapeHtml(dest.description)}</p>
        <a href="https://vtanunciando.com" target="_blank" class="btn btn-primary">Ver Catálogo Completo →</a>
        <a href="https://wa.me/5215538253251?text=${encodeURIComponent('Hola! Me interesan souvenirs de ' + dest.name)}" target="_blank" class="btn btn-secondary">Cotizar por WhatsApp</a>
      </div>
      <div class="dest-hero-img">
        <img src="${dest.image}" alt="Souvenirs ${escapeAttr(dest.name)} México - Imanes llaveros corte láser AXKAN" loading="eager">
      </div>
    </section>

    <section class="dest-products">
      <h2>Productos disponibles para ${escapeHtml(dest.name)}</h2>
      <div class="dest-products-grid">
${productsHtml}
      </div>
    </section>

    <section class="dest-about">
      <h2>Souvenirs de ${escapeHtml(dest.name)}</h2>
      <p>${escapeHtml(dest.longDescription)}</p>
      <p>Todos nuestros productos están disponibles en venta por <strong>mayoreo</strong> (mínimo 100 piezas mixtas) y <strong>menudeo</strong>. Envíos a toda la República Mexicana.</p>
    </section>

    <section class="dest-cta">
      <h2>¿Quieres souvenirs de ${escapeHtml(dest.name)}?</h2>
      <p>Cotiza sin compromiso. Mayoreo desde 100 piezas mixtas.</p>
      <a href="https://wa.me/5215538253251?text=${encodeURIComponent('Hola! Quiero cotizar souvenirs de ' + dest.name)}" target="_blank" class="btn">💬 Cotizar por WhatsApp</a>
    </section>

    <section class="dest-related">
      <h2>Otros destinos populares</h2>
      <div class="related-grid">
              ${relatedHtml}
      </div>
    </section>

    <section class="dest-all">
      <h3>Todos los destinos</h3>
      <div class="dest-all-links">
        ${allDestsHtml}
      </div>
    </section>

    <footer class="dest-footer">
      <p>© 2025 AXKAN. Souvenirs Premium de México. Todos los derechos reservados.</p>
    </footer>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// INDEX PAGE (directory listing)
// ═══════════════════════════════════════════════════════════

function generateIndex() {
  // Pick a representative OG image: first destination with a Cloudinary URL, or fallback
  const firstMapped = destinations.find(d => d.image.startsWith('http'));
  const indexOgImage = firstMapped ? firstMapped.image : 'https://axkan.art/assets/TEST-03.png';

  const cards = destinations.map(d => {
    const allImgs = [d.image, ...d.productImages];
    const uniqueImgs = [...new Set(allImgs)];
    const count = uniqueImgs.length;
    const imgTags = uniqueImgs.map(url =>
      `<img src="${url}" alt="Souvenirs ${escapeAttr(d.name)} México - AXKAN" loading="lazy">`
    ).join('');
    return `
          <a href="/souvenirs/${d.slug}" class="index-card" data-name="${escapeAttr(d.name)}" data-state="${escapeAttr(d.state)}" data-region="${d.region}" data-desc="${escapeAttr(d.description)}">
            <div class="card-carousel" data-count="${count}">
              <div class="card-strip">${imgTags}</div>
            </div>
            <div class="index-card-text">
              <h2>${escapeHtml(d.name)}</h2>
              <span>${escapeHtml(d.state)}</span>
              <p>${escapeHtml(d.description).substring(0, 120)}...</p>
            </div>
          </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Souvenirs por Destino — Imanes y Llaveros de México | AXKAN</title>
    <meta name="description" content="Encuentra souvenirs premium de tu destino favorito en México. Imanes, llaveros, portallaves y destapadores con corte láser de Cancún, CDMX, Oaxaca, Guanajuato, y ${destinations.length}+ destinos turísticos.">
    <meta name="keywords" content="souvenirs mexico por destino, imanes turisticos mexico, recuerdos mexico ciudades, llaveros destinos mexico, magnets mexican cities">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="https://axkan.art/souvenirs">
    <meta property="og:title" content="Souvenirs por Destino — AXKAN">
    <meta property="og:description" content="Souvenirs premium de ${destinations.length}+ destinos turísticos de México. Imanes, llaveros y más con corte láser.">
    <meta property="og:image" content="${indexOgImage}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://axkan.art/souvenirs">
    <meta property="og:site_name" content="AXKAN">
    <meta property="og:locale" content="es_MX">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Souvenirs por Destino — AXKAN">
    <meta name="twitter:description" content="Souvenirs premium de ${destinations.length}+ destinos turísticos de México.">
    <meta name="twitter:image" content="${indexOgImage}">
    <link rel="icon" type="image/png" href="/assets/LOGO-01.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Souvenirs por Destino — AXKAN",
      "description": "Colección de souvenirs premium de destinos turísticos de México",
      "url": "https://axkan.art/souvenirs",
      "numberOfItems": ${destinations.length},
      "hasPart": [${destinations.map(d => `
        {"@type": "WebPage", "name": "Souvenirs ${escapeJson(d.name)}", "url": "https://axkan.art/souvenirs/${d.slug}"}`).join(',')}
      ]
    }
    </script>

    <style>
      @font-face { font-family: 'RL Aqva'; src: url('/fonts/rl-aqva-black.otf') format('opentype'); font-weight: 900; font-display: swap; }
      @font-face { font-family: 'Objektiv'; src: url('/fonts/objektiv-vf.otf') format('opentype'); font-weight: 100 900; font-display: swap; }
      :root { --rosa-mexicano: #e72a88; --verde-selva: #8ab73b; --naranja-calido: #f39223; --turquesa: #09adc2; --font-display: 'RL Aqva', 'Fredoka', sans-serif; --font-body: 'Objektiv', 'Inter', sans-serif; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: var(--font-body); color: #1f1f1f; background: #fafafa; }
      .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 5%; background: white; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; }
      .nav-logo { height: 36px; }
      .nav-links { display: flex; gap: 24px; list-style: none; }
      .nav-links a { color: #333; font-weight: 500; font-size: 14px; text-decoration: none; }
      .nav-cta { background: var(--rosa-mexicano); color: white !important; padding: 8px 20px; border-radius: 24px; }
      .index-header { text-align: center; padding: 60px 5% 24px; }
      .index-header h1 { font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3rem); margin-bottom: 12px; }
      .index-header h1 .hl { color: var(--rosa-mexicano); }
      .index-header p { color: #666; font-size: 16px; max-width: 600px; margin: 0 auto; }

      /* Search & Filters */
      .index-controls { max-width: 700px; margin: 0 auto; padding: 0 5% 8px; }
      .search-wrap { position: relative; margin-bottom: 16px; }
      .search-wrap svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #999; pointer-events: none; }
      .search-input { width: 100%; padding: 14px 16px 14px 48px; border: 2px solid #e0e0e0; border-radius: 12px; font-size: 16px; font-family: var(--font-body); background: white; transition: border-color 0.2s; outline: none; }
      .search-input:focus { border-color: var(--rosa-mexicano); }
      .search-input::placeholder { color: #aaa; }
      .filter-pills { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
      .filter-pill { padding: 8px 18px; border-radius: 24px; border: 2px solid #ddd; background: white; font-size: 14px; font-weight: 600; font-family: var(--font-body); cursor: pointer; transition: all 0.2s; color: #555; }
      .filter-pill:hover { border-color: var(--rosa-mexicano); color: var(--rosa-mexicano); }
      .filter-pill.active { background: var(--rosa-mexicano); border-color: var(--rosa-mexicano); color: white; }
      .index-status { text-align: center; padding: 8px 5% 0; font-size: 14px; color: #999; }

      /* Grid & Cards */
      .index-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; padding: 24px 5% 60px; max-width: 1200px; margin: 0 auto; }
      .index-card { display: block; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); transition: transform 0.3s, opacity 0.3s; text-decoration: none; color: inherit; }
      .index-card:hover { transform: translateY(-4px); }
      .index-card.hidden { display: none; }
      .card-carousel { position: relative; overflow: hidden; aspect-ratio: 1; background: #f5f0eb; }
      .card-strip { display: flex; height: 100%; will-change: transform; }
      .card-strip img { flex: 0 0 100%; width: 100%; height: 100%; object-fit: contain; }
      .index-card-text { padding: 20px; }
      .index-card-text h2 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
      .index-card-text span { font-size: 13px; color: #888; }
      .index-card-text p { font-size: 14px; color: #666; margin-top: 8px; }

      /* No results */
      .no-results { display: none; text-align: center; padding: 48px 5%; }
      .no-results.visible { display: block; }
      .no-results p { font-size: 18px; color: #888; margin-bottom: 8px; }
      .no-results small { font-size: 14px; color: #aaa; }

      .index-footer { text-align: center; padding: 24px; font-size: 13px; color: #aaa; border-top: 1px solid #eee; }

      @media (max-width: 600px) {
        .filter-pills { gap: 6px; }
        .filter-pill { padding: 6px 14px; font-size: 13px; }
        .search-input { font-size: 15px; padding: 12px 12px 12px 44px; }
      }
    </style>
</head>
<body>
    <nav class="nav">
      <a href="/"><img src="/assets/LOGO-03.png" alt="AXKAN" class="nav-logo"></a>
      <ul class="nav-links">
        <li><a href="/#productos">Productos</a></li>
        <li><a href="/souvenirs">Destinos</a></li>
        <li><a href="https://vtanunciando.com" target="_blank">Catálogo</a></li>
        <li><a href="https://axkan-pedidos.vercel.app/" class="nav-cta">Hacer Pedido</a></li>
      </ul>
    </nav>

    <div class="index-header">
      <h1>Souvenirs por <span class="hl">Destino</span></h1>
      <p>Encuentra souvenirs premium de tu destino favorito en México. Imanes, llaveros, portallaves y destapadores con corte láser de precisión.</p>
    </div>

    <div class="index-controls">
      <div class="search-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="search-input" id="searchInput" placeholder="Buscar destino, estado..." autocomplete="off">
      </div>
      <div class="filter-pills" id="filterPills">
        <button class="filter-pill active" data-region="todos">Todos</button>
        <button class="filter-pill" data-region="caribe">Caribe</button>
        <button class="filter-pill" data-region="pacifico">Pac\u00edfico</button>
        <button class="filter-pill" data-region="centro">Centro</button>
        <button class="filter-pill" data-region="colonial">Colonial</button>
        <button class="filter-pill" data-region="sur">Sur</button>
        <button class="filter-pill" data-region="norte">Norte</button>
      </div>
    </div>

    <div class="index-status" id="indexStatus">Mostrando ${destinations.length} de ${destinations.length} destinos</div>

    <div class="index-grid" id="indexGrid">
${cards}
    </div>

    <div class="no-results" id="noResults">
      <p>No se encontraron destinos</p>
      <small>Intenta con otro t\u00e9rmino o selecciona otra regi\u00f3n</small>
    </div>

    <footer class="index-footer">
      <p>\u00a9 2025 AXKAN. Souvenirs Premium de M\u00e9xico. Todos los derechos reservados.</p>
    </footer>

    <script>
    (function() {
      var searchInput = document.getElementById('searchInput');
      var pills = document.querySelectorAll('.filter-pill');
      var cards = document.querySelectorAll('.index-card');
      var statusEl = document.getElementById('indexStatus');
      var noResults = document.getElementById('noResults');
      var total = cards.length;
      var activeRegion = 'todos';

      function normalize(str) {
        return str.toLowerCase()
          .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
          .replace(/[^a-z0-9 ]/g, ' ');
      }

      function filterCards() {
        var query = normalize(searchInput.value);
        var visible = 0;

        cards.forEach(function(card) {
          var name = normalize(card.dataset.name);
          var state = normalize(card.dataset.state);
          var desc = normalize(card.dataset.desc);
          var region = card.dataset.region;

          var matchesRegion = activeRegion === 'todos' || region === activeRegion;
          var matchesSearch = !query || name.indexOf(query) !== -1 || state.indexOf(query) !== -1 || desc.indexOf(query) !== -1;

          if (matchesRegion && matchesSearch) {
            card.classList.remove('hidden');
            visible++;
          } else {
            card.classList.add('hidden');
          }
        });

        statusEl.textContent = 'Mostrando ' + visible + ' de ' + total + ' destinos';
        if (visible === 0) {
          noResults.classList.add('visible');
        } else {
          noResults.classList.remove('visible');
        }
      }

      searchInput.addEventListener('input', filterCards);

      pills.forEach(function(pill) {
        pill.addEventListener('click', function() {
          pills.forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          activeRegion = pill.dataset.region;
          filterCards();
        });
      });
      // Scroll-driven carousel animation
      var carousels = document.querySelectorAll('.card-carousel');
      var ticking = false;
      function animateCarousels() {
        var vh = window.innerHeight;
        for (var i = 0; i < carousels.length; i++) {
          var carousel = carousels[i];
          var count = parseInt(carousel.dataset.count) || 1;
          if (count <= 1) continue;
          var rect = carousel.getBoundingClientRect();
          var progress = (vh - rect.top) / (vh + rect.height);
          progress = Math.max(0, Math.min(1, progress));
          var shift = progress * (count - 1) * 100 / count;
          carousel.querySelector('.card-strip').style.transform = 'translateX(-' + shift + '%)';
        }
      }
      window.addEventListener('scroll', function() {
        if (!ticking) {
          requestAnimationFrame(function() {
            animateCarousels();
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
      animateCarousels();
    })();
    </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// SITEMAP GENERATOR
// ═══════════════════════════════════════════════════════════

function generateSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: 'https://axkan.art/', priority: '1.0', changefreq: 'weekly' },
    { loc: 'https://axkan.art/souvenirs', priority: '0.9', changefreq: 'weekly' },
    ...destinations.map(d => ({
      loc: `https://axkan.art/souvenirs/${d.slug}`,
      priority: '0.8',
      changefreq: 'monthly'
    }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeJson(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

const outDir = path.join(__dirname, 'souvenirs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Generate individual destination pages
for (const dest of destinations) {
  const html = generatePage(dest);
  const filePath = path.join(outDir, `${dest.slug}.html`);
  fs.writeFileSync(filePath, html, 'utf-8');
  console.log(`  ✅ souvenirs/${dest.slug}.html`);
}

// Generate index page
fs.writeFileSync(path.join(outDir, 'index.html'), generateIndex(), 'utf-8');
console.log(`  ✅ souvenirs/index.html`);

// Generate sitemap
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), generateSitemap(), 'utf-8');
console.log(`  ✅ sitemap.xml`);

// Generate robots.txt
const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://axkan.art/sitemap.xml
`;
fs.writeFileSync(path.join(__dirname, 'robots.txt'), robotsTxt, 'utf-8');
console.log(`  ✅ robots.txt`);

console.log(`\n🎉 Generated ${destinations.length} destination pages + index + sitemap + robots.txt`);

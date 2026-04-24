/**
 * AXKAN Global Search — add <script src="/landing/global-search.js" defer></script> to any page
 * Adds search icon to nav + full-screen overlay. Searches products, destinations, pages.
 */
(function() {
  'use strict';

  var DESTINATIONS = ["Acámbaro","Acapulco","Acayucan","Aguascalientes","Ahuatlán","Alfajayucan","Aljocuca","Altamirano","Alvarado","Antón Lizardo","Arcelia","Atlixco","Bacalar","Bahías de Huatulco","Bernal","Cabo San Lucas","Campeche","Cancún","Celaya","CDMX","Chetumal","Chiapa de Corzo","Chichen Itzá","Chignahuapan","Chilpancingo","Cholula","Ciudad del Carmen","Ciudad Juárez","Ciudad Madero","Ciudad Valles","Coatepec","Coatzacoalcos","Colima","Comala","Comitán","Córdoba","Cozumel","Cuatro Ciénegas","Cuernavaca","Cuetzalan","Dolores Hidalgo","Durango","El Meco","El Tajín","Ensenada","Fresnillo","Guadalajara","Guanajuato","Guaymas","Hermosillo","Holbox","Huamantla","Huasteca Potosina","Huatulco","Iguala","Irapuato","Isla Mujeres","Izamal","Jalapa","Jerez","La Paz","Lagos de Moreno","León","Loreto","Los Cabos","Los Mochis","Manzanillo","Mazatlán","Mérida","Metepec","Mineral del Monte","Monterrey","Morelia","Nogales","Nuevo Laredo","Oaxaca","Orizaba","Pachuca","Palenque","Pátzcuaro","Playa del Carmen","Progreso","Puebla","Puerto Escondido","Puerto Vallarta","Querétaro","Reynosa","Riviera Maya","Rosarito","Salamanca","Saltillo","San Cristóbal de las Casas","San Juan del Río","San Luis Potosí","San Miguel de Allende","Sayulita","Tabasco","Tamasopo","Tampico","Taxco","Tecolutla","Tehuacán","Teotihuacán","Tepic","Tepotzotlán","Tepoztlán","Tequila","Tijuana","Tlaquepaque","Tlaxcala","Toluca","Tonalá","Torreón","Tula","Tulancingo","Tulum","Tuxtla Gutiérrez","Uruapan","Valladolid","Valle de Bravo","Veracruz","Villahermosa","Xalapa","Xilitla","Xico","Zacatecas","Zamora","Zihuatanejo","Zinacantán"];

  var PRODUCTS = [
    { name: 'Imanes de MDF', price: 'Desde $8', url: '/pedidos' },
    { name: 'Llaveros de MDF', price: 'Desde $10', url: '/pedidos' },
    { name: 'Destapadores de MDF', price: 'Desde $20', url: '/pedidos' },
    { name: 'Botones Metálicos', price: 'Desde $8', url: '/pedidos' },
    { name: 'Portallaves de MDF', price: '$40', url: '/pedidos' },
    { name: 'Portarretratos de MDF', price: '$40', url: '/pedidos' },
    { name: 'Imán 3D MDF', price: 'Desde $15', url: '/pedidos' },
    { name: 'Imán con Foil', price: 'Desde $15', url: '/pedidos' },
    { name: 'Souvenir Box', price: '$2,250', url: '/pedidos' }
  ];

  var PAGES = [
    { name: 'Catálogo de Productos', url: '/#productos' },
    { name: 'Hacer Pedido', url: '/pedidos' },
    { name: 'Todos los Destinos', url: '/diseños' },
    { name: 'Envío', url: '/#envio' },
    { name: 'Calidad', url: '/#calidad' }
  ];

  function normalize(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  // Find nav
  var nav = document.querySelector('.nav');
  if (!nav) return;

  // Create search button
  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Buscar');
  btn.style.cssText = 'background:none;border:none;cursor:pointer;color:#333;padding:8px;display:flex;align-items:center;margin-left:8px;transition:color 0.2s;';
  btn.onmouseover = function() { btn.style.color = '#e72a88'; };
  btn.onmouseout = function() { btn.style.color = '#333'; };
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '11'); circle.setAttribute('cy', '11'); circle.setAttribute('r', '8');
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '21'); line.setAttribute('y1', '21'); line.setAttribute('x2', '16.65'); line.setAttribute('y2', '16.65');
  svg.appendChild(circle); svg.appendChild(line);
  btn.appendChild(svg);

  // Insert before hamburger or at end of nav
  var hamburger = nav.querySelector('.nav-hamburger') || nav.querySelector('button[aria-label]');
  if (hamburger) nav.insertBefore(btn, hamburger);
  else nav.appendChild(btn);

  // Create overlay
  var overlay = document.createElement('div');
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:9999;align-items:flex-start;justify-content:center;padding-top:10vh;';

  var box = document.createElement('div');
  box.style.cssText = 'background:white;border-radius:20px;width:90%;max-width:560px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;animation:gsSlide 0.25s ease;';

  var inputWrap = document.createElement('div');
  inputWrap.style.cssText = 'display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid #f0f0f0;';

  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Buscar productos, destinos...';
  input.autocomplete = 'off';
  input.style.cssText = 'flex:1;border:none;outline:none;font-size:18px;font-weight:500;';

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText = 'background:none;border:none;font-size:22px;color:#999;cursor:pointer;padding:4px 8px;';

  inputWrap.appendChild(input);
  inputWrap.appendChild(closeBtn);
  box.appendChild(inputWrap);

  var results = document.createElement('div');
  results.style.cssText = 'max-height:60vh;overflow-y:auto;padding:8px 0;';
  box.appendChild(results);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Add animation keyframes
  var styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes gsSlide{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(styleEl);

  function open() { overlay.style.display = 'flex'; input.value = ''; results.textContent = ''; setTimeout(function() { input.focus(); }, 100); }
  function close() { overlay.style.display = 'none'; }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); overlay.style.display === 'none' ? open() : close(); }
    if (e.key === 'Escape' && overlay.style.display !== 'none') close();
  });

  function makeItem(icon, text, sub, url) {
    var a = document.createElement('a');
    a.href = url;
    a.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 20px;text-decoration:none;color:#333;transition:background 0.15s;border-radius:0;';
    a.onmouseover = function() { a.style.background = '#fce4ec'; };
    a.onmouseout = function() { a.style.background = ''; };
    var iconEl = document.createElement('span');
    iconEl.textContent = icon;
    iconEl.style.cssText = 'font-size:18px;width:28px;text-align:center;flex-shrink:0;';
    var textEl = document.createElement('span');
    textEl.textContent = text;
    textEl.style.cssText = 'flex:1;font-size:14px;font-weight:500;';
    a.appendChild(iconEl);
    a.appendChild(textEl);
    if (sub) {
      var subEl = document.createElement('span');
      subEl.textContent = sub;
      subEl.style.cssText = 'font-size:12px;color:#999;';
      a.appendChild(subEl);
    }
    return a;
  }

  function makeGroupTitle(text) {
    var div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;padding:8px 20px 4px;';
    return div;
  }

  input.addEventListener('input', function() {
    var q = normalize(input.value.trim());
    results.textContent = '';
    if (q.length < 2) return;

    var found = false;

    // Products
    var mp = PRODUCTS.filter(function(p) { return normalize(p.name).includes(q); });
    if (mp.length) {
      found = true;
      results.appendChild(makeGroupTitle('Productos'));
      mp.forEach(function(p) { results.appendChild(makeItem('\uD83D\uDCE6', p.name, p.price, p.url)); });
    }

    // Destinations
    var md = DESTINATIONS.filter(function(d) { return normalize(d).includes(q); }).slice(0, 8);
    if (md.length) {
      found = true;
      results.appendChild(makeGroupTitle('Destinos'));
      md.forEach(function(d) {
        var slug = normalize(d).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        results.appendChild(makeItem('\uD83D\uDCCD', d, null, '/souvenirs/' + slug));
      });
    }

    // Pages
    var mpg = PAGES.filter(function(p) { return normalize(p.name).includes(q); });
    if (mpg.length) {
      found = true;
      results.appendChild(makeGroupTitle('Páginas'));
      mpg.forEach(function(p) { results.appendChild(makeItem('\uD83D\uDD17', p.name, null, p.url)); });
    }

    if (!found) {
      var noRes = document.createElement('div');
      noRes.textContent = 'Sin resultados para "' + input.value + '"';
      noRes.style.cssText = 'padding:32px;text-align:center;color:#999;font-size:14px;';
      results.appendChild(noRes);
    }
  });
})();

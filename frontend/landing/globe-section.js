/**
 * AXKAN 3D Globe — Interactive Destination Explorer
 *
 * Three views:
 *  1. 3D rotating globe with destination markers (Three.js)
 *  2. Mexico map with real state boundaries (Canvas 2D + GeoJSON)
 *  3. State detail with destination cards (DOM)
 *
 * Dependencies: Three.js, topojson-client (loaded from CDN before this file)
 * Data: world-atlas countries-110m (CDN), mexico-states.json (local)
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // BRAND COLORS
  // ═══════════════════════════════════════════════════════════
  var COLORS = {
    rosa: '#e72a88',
    verde: '#8ab73b',
    naranja: '#f39223',
    turquesa: '#09adc2',
    dark: '#0a0a1a',
    ocean: '#0a6ec7',
    highlight: '#e72a88',
    marker: '#f39223'
  };

  // ═══════════════════════════════════════════════════════════
  // DESTINATION DATA — All AXKAN locations with coordinates
  // ═══════════════════════════════════════════════════════════
  var DESTINATIONS = [
    { slug: 'cancun', name: 'Cancún', state: 'Quintana Roo', lat: 21.16, lng: -86.85 },
    { slug: 'cdmx', name: 'Ciudad de México', state: 'CDMX', lat: 19.43, lng: -99.13 },
    { slug: 'oaxaca', name: 'Oaxaca', state: 'Oaxaca', lat: 17.07, lng: -96.73 },
    { slug: 'guanajuato', name: 'Guanajuato', state: 'Guanajuato', lat: 21.02, lng: -101.26 },
    { slug: 'san-miguel-de-allende', name: 'San Miguel de Allende', state: 'Guanajuato', lat: 20.91, lng: -100.75 },
    { slug: 'guadalajara', name: 'Guadalajara', state: 'Jalisco', lat: 20.66, lng: -103.35 },
    { slug: 'puerto-vallarta', name: 'Puerto Vallarta', state: 'Jalisco', lat: 20.65, lng: -105.23 },
    { slug: 'merida', name: 'Mérida', state: 'Yucatán', lat: 20.97, lng: -89.59 },
    { slug: 'los-cabos', name: 'Los Cabos', state: 'Baja California Sur', lat: 22.89, lng: -109.92 },
    { slug: 'puebla', name: 'Puebla', state: 'Puebla', lat: 19.04, lng: -98.21 },
    { slug: 'huasteca-potosina', name: 'Huasteca Potosina', state: 'San Luis Potosí', lat: 21.89, lng: -99.09 },
    { slug: 'tulum', name: 'Tulum', state: 'Quintana Roo', lat: 20.21, lng: -87.47 },
    { slug: 'playa-del-carmen', name: 'Playa del Carmen', state: 'Quintana Roo', lat: 20.63, lng: -87.07 },
    { slug: 'queretaro', name: 'Querétaro', state: 'Querétaro', lat: 20.59, lng: -100.39 },
    { slug: 'mazatlan', name: 'Mazatlán', state: 'Sinaloa', lat: 23.25, lng: -106.41 },
    { slug: 'morelia', name: 'Morelia', state: 'Michoacán', lat: 19.71, lng: -101.20 },
    { slug: 'chiapas', name: 'San Cristóbal', state: 'Chiapas', lat: 16.74, lng: -92.64 },
    { slug: 'acapulco', name: 'Acapulco', state: 'Guerrero', lat: 16.85, lng: -99.82 },
    { slug: 'monterrey', name: 'Monterrey', state: 'Nuevo León', lat: 25.69, lng: -100.32 },
    { slug: 'zacatecas', name: 'Zacatecas', state: 'Zacatecas', lat: 22.77, lng: -102.58 },
    { slug: 'bacalar', name: 'Bacalar', state: 'Quintana Roo', lat: 18.68, lng: -88.39 },
    { slug: 'campeche', name: 'Campeche', state: 'Campeche', lat: 19.83, lng: -90.53 },
    { slug: 'chignahuapan', name: 'Chignahuapan', state: 'Puebla', lat: 19.84, lng: -98.03 },
    { slug: 'ciudad-mier', name: 'Ciudad Mier', state: 'Tamaulipas', lat: 26.43, lng: -99.15 },
    { slug: 'comalcalco', name: 'Comalcalco', state: 'Tabasco', lat: 18.29, lng: -93.20 },
    { slug: 'cozumel', name: 'Cozumel', state: 'Quintana Roo', lat: 20.43, lng: -86.92 },
    { slug: 'cuetzalan', name: 'Cuetzalan', state: 'Puebla', lat: 20.03, lng: -97.52 },
    { slug: 'playa-las-gatas', name: 'Playa Las Gatas', state: 'Guerrero', lat: 17.63, lng: -101.55 },
    { slug: 'puerto-escondido', name: 'Puerto Escondido', state: 'Oaxaca', lat: 15.87, lng: -97.08 },
    { slug: 'san-antonio-cuajimoloyas', name: 'San Antonio Cuajimoloyas', state: 'Oaxaca', lat: 17.15, lng: -96.55 },
    { slug: 'san-felipe', name: 'San Felipe', state: 'Baja California', lat: 31.03, lng: -114.84 },
    { slug: 'san-gabriel', name: 'San Gabriel', state: 'Jalisco', lat: 19.70, lng: -103.80 },
    { slug: 'toluca', name: 'Toluca', state: 'Estado de México', lat: 19.28, lng: -99.66 },
    { slug: 'union-juarez', name: 'Unión Juárez', state: 'Chiapas', lat: 15.06, lng: -92.08 },
    { slug: 'zacatlan', name: 'Zacatlán', state: 'Puebla', lat: 19.93, lng: -97.96 },
    { slug: 'cerro-de-san-pedro', name: 'Cerro de San Pedro', state: 'San Luis Potosí', lat: 22.21, lng: -100.80 },
    { slug: 'mindo', name: 'Mindo', state: 'Pichincha', lat: -0.05, lng: -78.77 }
  ];

  // Map GeoJSON state names → our destination state names
  var STATE_NAME_MAP = {
    'México': 'Estado de México',
    'Ciudad de México': 'CDMX'
  };
  function ourStateName(geoName) { return STATE_NAME_MAP[geoName] || geoName; }

  // Image mapping (loaded async)
  var IMAGE_MAP = {};

  // Group destinations by state
  var stateGroups = {};
  DESTINATIONS.forEach(function (d) {
    if (!stateGroups[d.state]) stateGroups[d.state] = [];
    stateGroups[d.state].push(d);
  });

  // State centers for pin labels on Mexico map
  var STATE_CENTERS = {
    'Quintana Roo': { lat: 19.60, lng: -87.43, abbr: 'Q.Roo' },
    'CDMX': { lat: 19.43, lng: -99.13, abbr: 'CDMX' },
    'Oaxaca': { lat: 17.07, lng: -96.73, abbr: 'Oax' },
    'Guanajuato': { lat: 21.02, lng: -101.26, abbr: 'Gto' },
    'Jalisco': { lat: 20.50, lng: -103.80, abbr: 'Jal' },
    'Yucatán': { lat: 20.97, lng: -89.59, abbr: 'Yuc' },
    'Baja California Sur': { lat: 24.14, lng: -110.31, abbr: 'BCS' },
    'Puebla': { lat: 19.30, lng: -97.90, abbr: 'Pue' },
    'San Luis Potosí': { lat: 22.15, lng: -100.98, abbr: 'SLP' },
    'Querétaro': { lat: 20.59, lng: -100.39, abbr: 'Qro' },
    'Sinaloa': { lat: 24.81, lng: -107.39, abbr: 'Sin' },
    'Michoacán': { lat: 19.57, lng: -101.71, abbr: 'Mich' },
    'Chiapas': { lat: 16.50, lng: -92.50, abbr: 'Chis' },
    'Guerrero': { lat: 17.20, lng: -100.50, abbr: 'Gro' },
    'Nuevo León': { lat: 25.59, lng: -99.99, abbr: 'NL' },
    'Zacatecas': { lat: 22.77, lng: -102.58, abbr: 'Zac' },
    'Campeche': { lat: 19.20, lng: -90.53, abbr: 'Camp' },
    'Tamaulipas': { lat: 24.27, lng: -98.84, abbr: 'Tamps' },
    'Tabasco': { lat: 17.84, lng: -92.62, abbr: 'Tab' },
    'Baja California': { lat: 30.50, lng: -115.00, abbr: 'BC' },
    'Estado de México': { lat: 19.35, lng: -99.63, abbr: 'EdoMex' }
  };

  // ═══════════════════════════════════════════════════════════
  // GEO DATA — Loaded async
  // ═══════════════════════════════════════════════════════════
  var worldGeoJSON = null;
  var mexicoGeoJSON = null;

  function loadGeoData() {
    return Promise.all([loadWorldData(), loadMexicoData()]);
  }

  function loadWorldData() {
    if (typeof topojson === 'undefined') return Promise.resolve();
    return fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(function (r) { return r.json(); })
      .then(function (topo) {
        if (topo.objects && topo.objects.countries) {
          worldGeoJSON = topojson.feature(topo, topo.objects.countries);
        }
      })
      .catch(function () { /* world data optional */ });
  }

  function loadMexicoData() {
    return fetch('/mexico-states.json')
      .then(function (r) { return r.json(); })
      .then(function (geo) { mexicoGeoJSON = geo; countryGeoData.mexico = geo; })
      .catch(function () { /* mexico data optional */ });
  }

  // ═══════════════════════════════════════════════════════════
  // GeoJSON DRAWING HELPERS
  // ═══════════════════════════════════════════════════════════

  function lngLatToUV(lng, lat, w, h) {
    return [((lng + 180) / 360) * w, ((90 - lat) / 180) * h];
  }

  function drawGeoJSONFeature(ctx, feature, w, h, opts) {
    var geom = feature.geometry;
    if (!geom) return;
    if (geom.type === 'Polygon') {
      drawPolygonOnCanvas(ctx, geom.coordinates, w, h, opts);
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(function (poly) {
        drawPolygonOnCanvas(ctx, poly, w, h, opts);
      });
    }
  }

  function drawPolygonOnCanvas(ctx, rings, w, h, opts) {
    ctx.beginPath();
    rings.forEach(function (ring) {
      for (var i = 0; i < ring.length; i++) {
        var uv = lngLatToUV(ring[i][0], ring[i][1], w, h);
        if (i === 0) {
          ctx.moveTo(uv[0], uv[1]);
        } else {
          // Skip antimeridian crossings (huge lng jumps create artifact lines)
          var dLng = Math.abs(ring[i][0] - ring[i - 1][0]);
          if (dLng > 100) ctx.moveTo(uv[0], uv[1]);
          else ctx.lineTo(uv[0], uv[1]);
        }
      }
    });
    if (opts.fill) {
      ctx.fillStyle = opts.fill;
      ctx.fill('evenodd');
    }
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = opts.lineWidth || 1;
      ctx.stroke();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // GLOBE RENDERER (Three.js)
  // ═══════════════════════════════════════════════════════════

  var scene, camera, renderer, globe, gridMesh, atmosphereMesh;
  var markerGroup, markerSprites = [];
  var countryPinGroup, countryPins = [];
  var animationFrameId = null;
  // Initial rotation: center on Mexico (lng ~-102°, lat ~23°)
  var targetRotationY = -0.09, currentRotationY = -0.09;
  var targetRotationX = 0.08, currentRotationX = 0.08;
  var mouseDown = false, mouseX = 0, mouseY = 0;
  var dragStartX = 0, dragStartY = 0, isDragging = false;
  var autoRotateSpeed = 0.002;
  var globeContainer = null;
  var raycaster = null, mouseVec = null;

  // Countries where AXKAN has made designs
  var ACTIVE_COUNTRIES = [
    { name: 'México', lat: 23.6, lng: -102.5, view: 'mexico', bbox: [14, -118, 33, -86] },
    { name: 'Ecuador', lat: -1.5, lng: -78.5, view: 'ecuador', bbox: [-5.1, -81.1, 1.5, -75.0] }
  ];

  // ISO 3166 numeric IDs of countries to highlight in pink (besides Mexico which uses its own GeoJSON)
  var HIGHLIGHTED_COUNTRY_IDS = ['218']; // 218 = Ecuador

  // Country map configurations: GeoJSON URL, name property, bounding box, state centers, name mappings
  var COUNTRY_MAP_CONFIGS = {
    mexico: {
      geoURL: '/mexico-states.json',
      nameProp: 'name',
      nameMap: { 'México': 'Estado de México', 'Ciudad de México': 'CDMX' },
      aspect: 0.6,
      projBbox: [14, -118.5, 33, -86.5],
      centers: STATE_CENTERS
    },
    ecuador: {
      geoURL: '/ecuador-provinces.json',
      nameProp: 'name',
      nameMap: {},
      aspect: 0.9,
      projBbox: [-5.1, -81.1, 1.5, -75.0],
      centers: {
        'Pichincha': { lat: -0.18, lng: -78.50, abbr: 'Pic' },
        'Guayas': { lat: -2.19, lng: -79.88, abbr: 'Gua' },
        'Azuay': { lat: -2.90, lng: -79.01, abbr: 'Azu' },
        'Manabí': { lat: -1.05, lng: -80.45, abbr: 'Man' },
        'El Oro': { lat: -3.26, lng: -79.96, abbr: 'ElO' },
        'Esmeraldas': { lat: 0.97, lng: -79.65, abbr: 'Esm' },
        'Imbabura': { lat: 0.35, lng: -78.12, abbr: 'Imb' },
        'Loja': { lat: -3.99, lng: -79.20, abbr: 'Loj' },
        'Tungurahua': { lat: -1.27, lng: -78.62, abbr: 'Tun' },
        'Chimborazo': { lat: -1.66, lng: -78.65, abbr: 'Chi' },
        'Cotopaxi': { lat: -0.68, lng: -78.57, abbr: 'Cot' },
        'Bolívar': { lat: -1.75, lng: -79.05, abbr: 'Bol' },
        'Carchi': { lat: 0.81, lng: -77.72, abbr: 'Car' },
        'Cañar': { lat: -2.56, lng: -78.94, abbr: 'Cañ' },
        'Los Ríos': { lat: -1.60, lng: -79.65, abbr: 'LRi' },
        'Santa Elena': { lat: -2.23, lng: -80.86, abbr: 'StE' },
        'Santo Domingo': { lat: -0.25, lng: -79.17, abbr: 'StD' },
        'Napo': { lat: -0.99, lng: -77.81, abbr: 'Nap' },
        'Pastaza': { lat: -1.49, lng: -77.50, abbr: 'Pas' },
        'Morona Santiago': { lat: -2.31, lng: -78.11, abbr: 'MoS' },
        'Zamora Chinchipe': { lat: -4.07, lng: -78.95, abbr: 'ZCh' },
        'Sucumbíos': { lat: 0.09, lng: -76.89, abbr: 'Suc' },
        'Orellana': { lat: -0.46, lng: -76.99, abbr: 'Ore' },
        'Galápagos': { lat: -0.74, lng: -90.34, abbr: 'Gal' }
      }
    }
  };
  var targetCamZ = 2.8, currentCamZ = 2.8;
  var CAM_MIN = 2.6, CAM_MAX = 3.5;
  var lastTextureScale = 1.0;
  var currentEarthTexture = null;
  var BASE_TEX_W = 4096, BASE_TEX_H = 2048;
  var textureRegenTimer = null;

  function initGlobe() {
    globeContainer = document.getElementById('globe-3d');
    if (!globeContainer || typeof THREE === 'undefined') return;

    var w = globeContainer.offsetWidth;
    var h = globeContainer.offsetHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.z = 2.8;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xfafafa, 1);
    globeContainer.appendChild(renderer.domElement);

    var loading = document.getElementById('globe-loading');
    if (loading) loading.style.display = 'none';

    // Earth texture from GeoJSON — vector data redrawn at any resolution
    currentEarthTexture = createEarthTexture(1);
    var earthTexture = currentEarthTexture;

    var sphereGeo = new THREE.SphereGeometry(1, 64, 64);
    var sphereMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      specular: new THREE.Color(0x222244),
      shininess: 15
    });
    globe = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(globe);

    // Grid wireframe
    var gridGeo = new THREE.SphereGeometry(1.002, 48, 24);
    var gridMat = new THREE.MeshBasicMaterial({
      color: 0xe72a88, wireframe: true, transparent: true, opacity: 0.06
    });
    gridMesh = new THREE.Mesh(gridGeo, gridMat);
    scene.add(gridMesh);

    createAtmosphere();
    createMarkers();
    createCountryPins();

    raycaster = new THREE.Raycaster();
    mouseVec = new THREE.Vector2();

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    var dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 3, 5);
    scene.add(dir);
    var fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-5, 0, 3);
    scene.add(fill);
    var back = new THREE.DirectionalLight(0xe72a88, 0.5);
    back.position.set(-3, -2, -5);
    scene.add(back);

    setupGlobeInteraction();
    animateGlobe();
    window.addEventListener('resize', onGlobeResize);
  }

  function createEarthTexture(scale) {
    scale = scale || 1;
    // Cap at 8192 wide for GPU compatibility
    var w = Math.min(Math.round(BASE_TEX_W * scale), 8192);
    var h = w / 2;
    // Scale factor for line widths / dot radii (relative to 4096 base)
    var s = w / BASE_TEX_W;

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    // Ocean gradient — royal blue water
    var gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0860b0');
    gradient.addColorStop(0.3, '#0a6ec7');
    gradient.addColorStop(0.5, '#0a74d6');
    gradient.addColorStop(0.7, '#0a6ec7');
    gradient.addColorStop(1, '#0860b0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(100, 170, 255, 0.2)';
    ctx.lineWidth = 1 * s;
    for (var i = 0; i < 36; i++) {
      var x = (i / 36) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (var j = 0; j < 18; j++) {
      var y = (j / 18) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // World countries from Natural Earth data
    if (worldGeoJSON) {
      drawWorldCountries(ctx, w, h, s);
    }

    // Mexico states highlighted
    if (mexicoGeoJSON) {
      drawMexicoOnGlobe(ctx, w, h, s);
    }

    // Other highlighted countries (Ecuador, etc.)
    if (worldGeoJSON) {
      drawHighlightedCountries(ctx, w, h, s);
    }

    // Destination dots
    drawDestinationDots(ctx, w, h, s);

    var tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    return tex;
  }

  // Re-render texture at current zoom level for vector-crisp quality
  function regenerateTexture(scale) {
    if (!globe) return;
    var newTex = createEarthTexture(scale);
    globe.material.map = newTex;
    globe.material.needsUpdate = true;
    if (currentEarthTexture) currentEarthTexture.dispose();
    currentEarthTexture = newTex;
    lastTextureScale = scale;
  }

  function drawWorldCountries(ctx, w, h, s) {
    worldGeoJSON.features.forEach(function (feature) {
      drawGeoJSONFeature(ctx, feature, w, h, {
        fill: '#1a5545',
        stroke: '#2a8c6e',
        lineWidth: 1.2 * s
      });
    });
    worldGeoJSON.features.forEach(function (feature) {
      drawGeoJSONFeature(ctx, feature, w, h, {
        fill: 'rgba(42, 140, 110, 0.12)'
      });
    });
  }

  function drawMexicoOnGlobe(ctx, w, h, s) {
    ctx.save();
    ctx.shadowColor = '#e72a88';
    ctx.shadowBlur = 30 * s;
    mexicoGeoJSON.features.forEach(function (feature) {
      drawGeoJSONFeature(ctx, feature, w, h, {
        fill: 'rgba(231, 42, 136, 0.5)',
        stroke: '#ff4da6',
        lineWidth: 2 * s
      });
    });
    ctx.restore();
    mexicoGeoJSON.features.forEach(function (feature) {
      drawGeoJSONFeature(ctx, feature, w, h, {
        stroke: 'rgba(255, 77, 166, 0.5)',
        lineWidth: 0.5 * s
      });
    });
  }

  function drawHighlightedCountries(ctx, w, h, s) {
    if (!worldGeoJSON || !HIGHLIGHTED_COUNTRY_IDS.length) return;
    var highlighted = worldGeoJSON.features.filter(function (f) {
      return HIGHLIGHTED_COUNTRY_IDS.indexOf(f.id) !== -1;
    });
    if (!highlighted.length) return;
    ctx.save();
    ctx.shadowColor = '#e72a88';
    ctx.shadowBlur = 30 * s;
    highlighted.forEach(function (feature) {
      drawGeoJSONFeature(ctx, feature, w, h, {
        fill: 'rgba(231, 42, 136, 0.5)',
        stroke: '#ff4da6',
        lineWidth: 2 * s
      });
    });
    ctx.restore();
    highlighted.forEach(function (feature) {
      drawGeoJSONFeature(ctx, feature, w, h, {
        stroke: 'rgba(255, 77, 166, 0.5)',
        lineWidth: 0.5 * s
      });
    });
  }

  function drawDestinationDots(ctx, w, h, s) {
    DESTINATIONS.forEach(function (d) {
      var uv = lngLatToUV(d.lng, d.lat, w, h);
      var glowR = 12 * s, coreR = 2.5 * s, midR = 4 * s;
      var grad = ctx.createRadialGradient(uv[0], uv[1], 0, uv[0], uv[1], glowR);
      grad.addColorStop(0, 'rgba(243, 146, 35, 0.9)');
      grad.addColorStop(0.4, 'rgba(243, 146, 35, 0.4)');
      grad.addColorStop(1, 'rgba(243, 146, 35, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(243, 146, 35, 0.9)';
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], midR, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function createAtmosphere() {
    var vert = [
      'varying vec3 vNormal;',
      'void main() {',
      '  vNormal = normalize(normalMatrix * normal);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n');
    var frag = [
      'varying vec3 vNormal;',
      'void main() {',
      '  float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);',
      '  gl_FragColor = vec4(0.906, 0.165, 0.533, 1.0) * intensity * 1.2;',
      '}'
    ].join('\n');

    var geo = new THREE.SphereGeometry(1.15, 64, 64);
    var mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });
    atmosphereMesh = new THREE.Mesh(geo, mat);
    scene.add(atmosphereMesh);
  }

  function createMarkers() {
    markerGroup = new THREE.Group();

    var glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    var gctx = glowCanvas.getContext('2d');
    var grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    var glowTexture = new THREE.CanvasTexture(glowCanvas);

    DESTINATIONS.forEach(function (d) {
      var pos = latLngToVector3(d.lat, d.lng, 1.025);
      var mat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: new THREE.Color('#f39223'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.set(0.02, 0.02, 1);
      sprite.userData = d;
      markerGroup.add(sprite);
      markerSprites.push(sprite);
    });

    scene.add(markerGroup);
  }

  function latLngToVector3(lat, lng, radius) {
    var phi = (90 - lat) * (Math.PI / 180);
    var theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -(radius) * Math.sin(phi) * Math.cos(theta),
      (radius) * Math.cos(phi),
      (radius) * Math.sin(phi) * Math.sin(theta)
    );
  }

  function createPinTexture(color) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 180;
    var ctx = c.getContext('2d');
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    // Teardrop body
    ctx.beginPath();
    ctx.moveTo(64, 172);
    ctx.bezierCurveTo(24, 115, 8, 75, 8, 52);
    ctx.arc(64, 52, 56, Math.PI, 0, false);
    ctx.bezierCurveTo(120, 75, 104, 115, 64, 172);
    ctx.closePath();
    ctx.fillStyle = color || '#e72a88';
    ctx.fill();
    // White inner circle
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(64, 52, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // Inner dot
    ctx.beginPath();
    ctx.arc(64, 52, 10, 0, Math.PI * 2);
    ctx.fillStyle = color || '#e72a88';
    ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  function createCountryPins() {
    countryPinGroup = new THREE.Group();
    var pinTex = createPinTexture(COLORS.rosa);
    ACTIVE_COUNTRIES.forEach(function (country) {
      var pos = latLngToVector3(country.lat, country.lng, 1.03);
      var mat = new THREE.SpriteMaterial({
        map: pinTex,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true
      });
      var sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.set(0.06, 0.085, 1);
      sprite.userData = { type: 'country', country: country };
      countryPinGroup.add(sprite);
      countryPins.push(sprite);
    });
    scene.add(countryPinGroup);
  }

  function vector3ToLatLng(localPoint) {
    var r = localPoint.length();
    var lat = 90 - Math.acos(localPoint.y / r) * (180 / Math.PI);
    var theta = Math.atan2(localPoint.z, -localPoint.x);
    var lng = theta * (180 / Math.PI) - 180;
    if (lng < -180) lng += 360;
    return { lat: lat, lng: lng };
  }

  function isPointInCountry(lat, lng, country) {
    if (!country.bbox) return false;
    return lat >= country.bbox[0] && lat <= country.bbox[2] &&
           lng >= country.bbox[1] && lng <= country.bbox[3];
  }

  function onGlobeClick(e) {
    if (isDragging) return;
    if (!raycaster || !camera) return;

    var rect = renderer.domElement.getBoundingClientRect();
    mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);

    // Check country pin intersections first
    var pinHits = raycaster.intersectObjects(countryPins);
    if (pinHits.length > 0) {
      var hit = pinHits[0].object.userData;
      if (hit.country && hit.country.view) {
        showView(hit.country.view);
        return;
      }
    }

    // Check globe surface — convert hit to lat/lng, find country
    var globeHits = raycaster.intersectObject(globe);
    if (globeHits.length > 0) {
      var local = new THREE.Vector3();
      globe.worldToLocal(local.copy(globeHits[0].point));
      var ll = vector3ToLatLng(local);
      for (var i = 0; i < ACTIVE_COUNTRIES.length; i++) {
        if (isPointInCountry(ll.lat, ll.lng, ACTIVE_COUNTRIES[i])) {
          showView(ACTIVE_COUNTRIES[i].view);
          return;
        }
      }
    }
  }

  function setupGlobeInteraction() {
    var canvas = renderer.domElement;
    canvas.addEventListener('mousedown', function (e) {
      mouseDown = true; isDragging = false;
      mouseX = e.clientX; mouseY = e.clientY;
      dragStartX = e.clientX; dragStartY = e.clientY;
    });
    canvas.addEventListener('mousemove', function (e) {
      if (mouseDown) {
        var dx = e.clientX - mouseX, dy = e.clientY - mouseY;
        if (Math.abs(e.clientX - dragStartX) > 4 || Math.abs(e.clientY - dragStartY) > 4) isDragging = true;
        targetRotationY += dx * 0.005;
        targetRotationX += dy * 0.003;
        targetRotationX = Math.max(-0.8, Math.min(0.8, targetRotationX));
        mouseX = e.clientX; mouseY = e.clientY;
      }
      // Hover cursor — check if over a clickable country/pin
      if (raycaster && camera) {
        var rect = canvas.getBoundingClientRect();
        mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouseVec, camera);
        var pinHits = raycaster.intersectObjects(countryPins);
        if (pinHits.length > 0) {
          canvas.style.cursor = 'pointer';
        } else {
          var gHits = raycaster.intersectObject(globe);
          if (gHits.length > 0) {
            var lp = new THREE.Vector3();
            globe.worldToLocal(lp.copy(gHits[0].point));
            var coord = vector3ToLatLng(lp);
            var overCountry = false;
            for (var c = 0; c < ACTIVE_COUNTRIES.length; c++) {
              if (isPointInCountry(coord.lat, coord.lng, ACTIVE_COUNTRIES[c])) { overCountry = true; break; }
            }
            canvas.style.cursor = overCountry ? 'pointer' : 'grab';
          } else {
            canvas.style.cursor = 'grab';
          }
        }
      }
    });
    canvas.addEventListener('mouseup', function (e) {
      if (!isDragging) onGlobeClick(e);
      mouseDown = false;
    });
    canvas.addEventListener('mouseleave', function () { mouseDown = false; });

    // Touch
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        mouseDown = true; isDragging = false;
        mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY;
        dragStartX = mouseX; dragStartY = mouseY;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (!mouseDown || e.touches.length !== 1) return;
      if (Math.abs(e.touches[0].clientX - dragStartX) > 4 || Math.abs(e.touches[0].clientY - dragStartY) > 4) isDragging = true;
      targetRotationY += (e.touches[0].clientX - mouseX) * 0.005;
      targetRotationX += (e.touches[0].clientY - mouseY) * 0.003;
      targetRotationX = Math.max(-0.8, Math.min(0.8, targetRotationX));
      mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (!isDragging && e.changedTouches.length === 1) {
        // Simulate click from touch position
        onGlobeClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
      }
      mouseDown = false;
    }, { passive: true });

    // Wheel zoom — camera distance, only when hovering over the globe
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      targetCamZ += e.deltaY * 0.003;
      targetCamZ = Math.max(CAM_MIN, Math.min(CAM_MAX, targetCamZ));
    }, { passive: false });
  }

  var pulseTime = 0;

  function animateGlobe() {
    animationFrameId = requestAnimationFrame(animateGlobe);
    if (!mouseDown) targetRotationY += autoRotateSpeed;

    currentRotationY += (targetRotationY - currentRotationY) * 0.05;
    currentRotationX += (targetRotationX - currentRotationX) * 0.05;

    // Camera zoom — smooth interpolation, no CSS transform, no clipping
    currentCamZ += (targetCamZ - currentCamZ) * 0.1;
    if (camera) camera.position.z = currentCamZ;

    // Dynamic texture regeneration — sharper when zoomed in
    var zoomScale = CAM_MAX / currentCamZ;  // 1.0 at max distance, ~1.6 at min
    if (Math.abs(zoomScale - lastTextureScale) > 0.15) {
      clearTimeout(textureRegenTimer);
      textureRegenTimer = setTimeout(function () { regenerateTexture(zoomScale); }, 200);
    }

    if (globe) { globe.rotation.y = currentRotationY; globe.rotation.x = currentRotationX; }
    if (gridMesh) { gridMesh.rotation.y = currentRotationY; gridMesh.rotation.x = currentRotationX; }
    if (markerGroup) { markerGroup.rotation.y = currentRotationY; markerGroup.rotation.x = currentRotationX; }
    if (countryPinGroup) { countryPinGroup.rotation.y = currentRotationY; countryPinGroup.rotation.x = currentRotationX; }

    pulseTime += 0.03;
    var ds = 0.02 + Math.sin(pulseTime) * 0.005;
    markerSprites.forEach(function (sprite) { sprite.scale.set(ds, ds, 1); });

    renderer.render(scene, camera);
  }

  function onGlobeResize() {
    if (!globeContainer || !renderer || !camera) return;
    var w = globeContainer.offsetWidth;
    var h = globeContainer.offsetHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ═══════════════════════════════════════════════════════════
  // COUNTRY MAP — Generic state/province boundaries (Canvas 2D)
  // ═══════════════════════════════════════════════════════════

  var mexicoCanvas, mexicoCtx;
  var countryProject = null;
  var hoveredState = null;
  var countryPathCache = [];
  var countryGeoData = {};
  var currentCountryKey = null;
  var countryStateGroups = {};

  // Build per-country state groups from DESTINATIONS using bbox matching
  (function buildCountryGroups() {
    DESTINATIONS.forEach(function (d) {
      for (var i = 0; i < ACTIVE_COUNTRIES.length; i++) {
        if (isPointInCountry(d.lat, d.lng, ACTIVE_COUNTRIES[i])) {
          var key = ACTIVE_COUNTRIES[i].view;
          if (!countryStateGroups[key]) countryStateGroups[key] = {};
          if (!countryStateGroups[key][d.state]) countryStateGroups[key][d.state] = [];
          countryStateGroups[key][d.state].push(d);
          break;
        }
      }
    });
  })();

  function loadCountryGeoData(key) {
    if (countryGeoData[key]) return Promise.resolve(countryGeoData[key]);
    if (key === 'mexico' && mexicoGeoJSON) {
      countryGeoData.mexico = mexicoGeoJSON;
      return Promise.resolve(mexicoGeoJSON);
    }
    var config = COUNTRY_MAP_CONFIGS[key];
    if (!config || !config.geoURL) return Promise.reject('No GeoJSON for ' + key);
    return fetch(config.geoURL)
      .then(function (r) { return r.json(); })
      .then(function (geo) { countryGeoData[key] = geo; return geo; });
  }

  function getRegionName(geoName, key) {
    var config = COUNTRY_MAP_CONFIGS[key];
    if (config && config.nameMap && config.nameMap[geoName]) {
      return config.nameMap[geoName];
    }
    return geoName;
  }

  function initCountryMap(key) {
    mexicoCanvas = document.getElementById('mexico-canvas');
    if (!mexicoCanvas) return;

    currentCountryKey = key;
    var config = COUNTRY_MAP_CONFIGS[key];
    if (!config) return;

    var container = mexicoCanvas.parentElement;
    var isMobile = window.innerWidth <= 600;
    var cw = container.offsetWidth - (isMobile ? 8 : 64);
    var aspect = isMobile ? 0.72 : (config.aspect || 0.6);
    var dpr = window.devicePixelRatio || 1;
    mexicoCanvas.width = cw * dpr;
    mexicoCanvas.height = cw * aspect * dpr;
    mexicoCanvas.style.width = cw + 'px';
    mexicoCanvas.style.height = (cw * aspect) + 'px';
    mexicoCtx = mexicoCanvas.getContext('2d');

    setupCountryProjection(key, mexicoCanvas.width, mexicoCanvas.height);
    buildCountryPathCache(key);
    drawCountryMap();

    mexicoCanvas.onmousemove = onCountryMouseMove;
    mexicoCanvas.onclick = onCountryClick;
    mexicoCanvas.onmouseleave = onCountryMouseLeave;
    mexicoCanvas.ontouchend = function (e) {
      if (e.changedTouches.length === 1) {
        var touch = e.changedTouches[0];
        var rect = mexicoCanvas.getBoundingClientRect();
        var state = getStateAtPosition(touch.clientX - rect.left, touch.clientY - rect.top);
        var groups = countryStateGroups[currentCountryKey] || {};
        if (state && groups[state]) {
          e.preventDefault();
          showStateDetail(state);
        }
      }
    };
  }

  function setupCountryProjection(key, cw, ch) {
    var config = COUNTRY_MAP_CONFIGS[key];
    var bbox = config.projBbox;
    var minLng = bbox[1], maxLng = bbox[3], minLat = bbox[0], maxLat = bbox[2];
    var pad = 0.06;
    var pw = cw * (1 - 2 * pad);
    var ph = ch * (1 - 2 * pad);
    var lngR = maxLng - minLng;
    var latR = maxLat - minLat;
    countryProject = function (lng, lat) {
      return [
        cw * pad + ((lng - minLng) / lngR) * pw,
        ch * pad + ((maxLat - lat) / latR) * ph
      ];
    };
  }

  function buildCountryPathCache(key) {
    countryPathCache = [];
    var geo = countryGeoData[key];
    var config = COUNTRY_MAP_CONFIGS[key];
    if (!geo || !countryProject || !config) return;

    var groups = countryStateGroups[key] || {};

    geo.features.forEach(function (feature) {
      var geoName = feature.properties[config.nameProp || 'name'];
      var name = getRegionName(geoName, key);
      var geom = feature.geometry;
      var coordSets = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

      var polygons = coordSets.map(function (rings) {
        return rings.map(function (ring) {
          return ring.map(function (c) { return countryProject(c[0], c[1]); });
        });
      });

      countryPathCache.push({
        name: name,
        polygons: polygons,
        hasDestinations: !!groups[name]
      });
    });
  }

  function drawCountryMap() {
    if (!mexicoCtx || !currentCountryKey) return;
    var ctx = mexicoCtx;
    var cw = mexicoCanvas.width;
    var ch = mexicoCanvas.height;
    var dpr = window.devicePixelRatio || 1;
    var config = COUNTRY_MAP_CONFIGS[currentCountryKey];
    var groups = countryStateGroups[currentCountryKey] || {};
    var centers = config.centers || {};

    ctx.clearRect(0, 0, cw, ch);

    // Clean light background
    ctx.fillStyle = '#f0eff3';
    ctx.beginPath();
    var bgR = 12 * dpr;
    ctx.moveTo(bgR, 0); ctx.lineTo(cw - bgR, 0);
    ctx.quadraticCurveTo(cw, 0, cw, bgR); ctx.lineTo(cw, ch - bgR);
    ctx.quadraticCurveTo(cw, ch, cw - bgR, ch); ctx.lineTo(bgR, ch);
    ctx.quadraticCurveTo(0, ch, 0, ch - bgR); ctx.lineTo(0, bgR);
    ctx.quadraticCurveTo(0, 0, bgR, 0);
    ctx.fill();

    if (!countryPathCache.length) return;

    var brandColors = [COLORS.rosa, COLORS.turquesa, COLORS.naranja, COLORS.verde];
    var colorIndex = 0;

    // Assign a consistent color to each state-with-destinations
    var stateColorMap = {};
    Object.keys(groups).forEach(function (name) {
      stateColorMap[name] = brandColors[colorIndex % brandColors.length];
      colorIndex++;
    });

    // Draw all state/province polygons — all borders visible
    countryPathCache.forEach(function (state) {
      var isHovered = hoveredState === state.name;
      var hasDest = state.hasDestinations;

      state.polygons.forEach(function (rings) {
        ctx.beginPath();
        rings.forEach(function (ring) {
          for (var i = 0; i < ring.length; i++) {
            if (i === 0) ctx.moveTo(ring[i][0], ring[i][1]);
            else ctx.lineTo(ring[i][0], ring[i][1]);
          }
          ctx.closePath();
        });

        if (hasDest) {
          ctx.fillStyle = isHovered ? 'rgba(231, 42, 136, 0.22)' : 'rgba(231, 42, 136, 0.10)';
          ctx.fill('evenodd');
          ctx.strokeStyle = isHovered ? '#ff6ab5' : COLORS.rosa;
          ctx.lineWidth = (isHovered ? 2.5 : 1.5) * dpr;
          ctx.stroke();
        } else {
          ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)';
          ctx.fill('evenodd');
          ctx.strokeStyle = isHovered ? 'rgba(190,190,200,0.9)' : 'rgba(200,200,210,0.6)';
          ctx.lineWidth = (isHovered ? 1.5 : 1) * dpr;
          ctx.stroke();
        }
      });
    });

    // Draw push-pin markers for states/provinces with destinations
    Object.keys(groups).forEach(function (stateName) {
      var center = centers[stateName];
      if (!center || !countryProject) return;
      var pos = countryProject(center.lng, center.lat);
      var isHovered = hoveredState === stateName;
      var color = stateColorMap[stateName];
      var scale = isHovered ? 1.15 : 1;

      var cx = pos[0], cy = pos[1];
      var mobileScale = (window.innerWidth <= 600) ? 1.4 : 1;
      var needleH = 14 * dpr * scale * mobileScale;
      var ballR = 5 * dpr * scale * mobileScale;

      // Needle
      ctx.save();
      ctx.strokeStyle = 'rgba(80,80,80,0.6)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - needleH);
      ctx.stroke();

      // Ball head shadow
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4 * dpr;
      ctx.shadowOffsetY = 2 * dpr;

      // Ball head
      var headCy = cy - needleH - ballR * 0.3;
      ctx.beginPath();
      ctx.arc(cx, headCy, ballR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // Specular highlight
      ctx.beginPath();
      ctx.arc(cx - ballR * 0.3, headCy - ballR * 0.3, ballR * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();

      // Label
      var labelSize = (window.innerWidth <= 600) ? 11 : 9;
      ctx.fillStyle = isHovered ? '#1f1f1f' : '#555';
      ctx.font = (isHovered ? 'bold ' : '600 ') + (labelSize * dpr) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(center.abbr, cx, cy + 5 * dpr);
    });
  }

  // Ray-casting point-in-polygon
  function pointInRing(px, py, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1];
      var xj = ring[j][0], yj = ring[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInPolygons(px, py, polygons) {
    for (var p = 0; p < polygons.length; p++) {
      var rings = polygons[p];
      if (rings.length > 0 && pointInRing(px, py, rings[0])) {
        var inHole = false;
        for (var h = 1; h < rings.length; h++) {
          if (pointInRing(px, py, rings[h])) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }

  function getStateAtPosition(canvasX, canvasY) {
    var dpr = window.devicePixelRatio || 1;
    var px = canvasX * dpr, py = canvasY * dpr;

    // Prioritize states with destinations
    for (var i = 0; i < countryPathCache.length; i++) {
      if (countryPathCache[i].hasDestinations && pointInPolygons(px, py, countryPathCache[i].polygons)) {
        return countryPathCache[i].name;
      }
    }
    for (var j = 0; j < countryPathCache.length; j++) {
      if (!countryPathCache[j].hasDestinations && pointInPolygons(px, py, countryPathCache[j].polygons)) {
        return countryPathCache[j].name;
      }
    }
    return null;
  }

  function onCountryMouseMove(e) {
    var rect = mexicoCanvas.getBoundingClientRect();
    var state = getStateAtPosition(e.clientX - rect.left, e.clientY - rect.top);

    if (state !== hoveredState) {
      hoveredState = state;
      drawCountryMap();
      mexicoCanvas.style.cursor = state ? 'pointer' : 'default';
    }

    var tip = document.getElementById('mexico-tooltip');
    var groups = countryStateGroups[currentCountryKey] || {};
    if (state && tip) {
      var group = groups[state];
      var h4 = document.createElement('h4');
      h4.textContent = state;
      var p = document.createElement('p');
      if (group) {
        var names = group.map(function (d) { return d.name; }).join(', ');
        p.textContent = group.length + ' destino' + (group.length > 1 ? 's' : '') + ': ' + names;
      } else {
        p.textContent = 'Pr\u00f3ximamente';
      }
      tip.textContent = '';
      tip.appendChild(h4);
      tip.appendChild(p);
      tip.style.left = (e.clientX + 15) + 'px';
      tip.style.top = (e.clientY - 10) + 'px';
      tip.classList.add('visible');
    } else if (tip) {
      tip.classList.remove('visible');
    }
  }

  function onCountryClick(e) {
    var rect = mexicoCanvas.getBoundingClientRect();
    var state = getStateAtPosition(e.clientX - rect.left, e.clientY - rect.top);
    var groups = countryStateGroups[currentCountryKey] || {};
    if (state && groups[state]) {
      showStateDetail(state);
    }
  }

  function onCountryMouseLeave() {
    hoveredState = null;
    drawCountryMap();
    var tip = document.getElementById('mexico-tooltip');
    if (tip) tip.classList.remove('visible');
  }

  // ═══════════════════════════════════════════════════════════
  // STATE DETAIL VIEW
  // ═══════════════════════════════════════════════════════════

  function showStateDetail(stateName) {
    var destinations = stateGroups[stateName];
    if (!destinations) return;

    var nameEl = document.getElementById('state-name');
    var gridEl = document.getElementById('state-destinations');
    if (!nameEl || !gridEl) return;

    nameEl.textContent = stateName;
    gridEl.innerHTML = '';

    destinations.forEach(function (d) {
      var imageUrl = (IMAGE_MAP[d.slug] && IMAGE_MAP[d.slug].hero) || '';

      var card = document.createElement('a');
      card.href = '/souvenirs/' + d.slug;
      card.className = 'destination-card';

      var html = '';
      if (imageUrl) {
        html += '<img class="destination-card-image" src="' + imageUrl + '" alt="Souvenirs ' + d.name + '" loading="lazy">';
      }
      html += '<div class="destination-card-info">';
      html += '<div class="destination-card-name">' + d.name + '</div>';
      html += '<div class="destination-card-state">' + d.state + '</div>';
      html += '</div>';
      card.innerHTML = html;
      gridEl.appendChild(card);
    });

    showView('state');
    var navState = document.getElementById('nav-state');
    if (navState) navState.textContent = stateName;
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  function showView(view) {
    var globeView = document.getElementById('globe-view');
    var countryView = document.getElementById('mexico-view');
    var stateView = document.getElementById('state-view');
    var explorerBtn = document.getElementById('globe-explore-btn');
    var tip = document.getElementById('mexico-tooltip');
    if (tip) tip.classList.remove('visible');

    var isCountryView = !!COUNTRY_MAP_CONFIGS[view];

    if (globeView) {
      if (view === 'globe') { globeView.classList.remove('hidden'); if (explorerBtn) explorerBtn.style.display = ''; }
      else { globeView.classList.add('hidden'); }
    }
    if (countryView) {
      if (isCountryView) {
        countryView.classList.add('active');
        loadCountryGeoData(view).then(function () {
          initCountryMap(view);
        });
      } else { countryView.classList.remove('active'); }
    }
    if (stateView) {
      if (view === 'state') stateView.classList.add('active');
      else stateView.classList.remove('active');
    }

    updateNav(view);
  }

  function updateNav(view) {
    var navGlobe = document.getElementById('nav-globe');
    var navCountry = document.getElementById('nav-country');
    var navState = document.getElementById('nav-state');
    var sep1 = document.getElementById('nav-sep1');
    var sep2 = document.getElementById('nav-sep2');

    var isCountryView = !!COUNTRY_MAP_CONFIGS[view];

    [navGlobe, navCountry, navState].forEach(function (b) { if (b) b.classList.remove('active'); });

    if (view === 'globe') {
      if (navGlobe) navGlobe.classList.add('active');
      if (navCountry) navCountry.classList.add('hidden');
      if (navState) navState.classList.add('hidden');
      if (sep1) sep1.classList.add('hidden');
      if (sep2) sep2.classList.add('hidden');
    } else if (isCountryView) {
      // Find the country display name from ACTIVE_COUNTRIES
      var countryName = view;
      for (var i = 0; i < ACTIVE_COUNTRIES.length; i++) {
        if (ACTIVE_COUNTRIES[i].view === view) { countryName = ACTIVE_COUNTRIES[i].name; break; }
      }
      if (navCountry) { navCountry.classList.remove('hidden'); navCountry.classList.add('active'); navCountry.textContent = countryName; }
      if (navState) navState.classList.add('hidden');
      if (sep1) sep1.classList.remove('hidden');
      if (sep2) sep2.classList.add('hidden');
    } else if (view === 'state') {
      if (navCountry) { navCountry.classList.remove('hidden'); }
      if (navState) { navState.classList.remove('hidden'); navState.classList.add('active'); }
      if (sep1) sep1.classList.remove('hidden');
      if (sep2) sep2.classList.remove('hidden');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ═══════════════════════════════════════════════════════════

  function bindEvents() {
    // Hide old button — navigation is now via clicking countries/pins
    var exploreBtn = document.getElementById('globe-explore-btn');
    if (exploreBtn) exploreBtn.style.display = 'none';

    var navGlobe = document.getElementById('nav-globe');
    if (navGlobe) navGlobe.addEventListener('click', function () { showView('globe'); });

    var navCountry = document.getElementById('nav-country');
    if (navCountry) navCountry.addEventListener('click', function () {
      if (currentCountryKey) showView(currentCountryKey);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init() {
    loadImageMapping();

    // Load geo data first, then initialize globe with real boundaries
    loadGeoData().then(function () {
      initGlobe();
      bindEvents();
    });
  }

  function loadImageMapping() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/destination-images.json', true);
      xhr.onload = function () {
        if (xhr.status === 200) IMAGE_MAP = JSON.parse(xhr.responseText);
      };
      xhr.send();
    } catch (e) { /* silent */ }
  }

  window.globeSection = { init: init, showView: showView };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

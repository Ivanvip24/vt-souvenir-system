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
    ocean: '#0a0f1e',
    highlight: '#e72a88',
    marker: '#09adc2'
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
    { slug: 'cerro-de-san-pedro', name: 'Cerro de San Pedro', state: 'San Luis Potosí', lat: 22.21, lng: -100.80 }
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
      .then(function (geo) { mexicoGeoJSON = geo; })
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
  var targetRotationY = 1.75, currentRotationY = 1.75;
  var targetRotationX = 0.15, currentRotationX = 0.15;
  var mouseDown = false, mouseX = 0, mouseY = 0;
  var dragStartX = 0, dragStartY = 0, isDragging = false;
  var autoRotateSpeed = 0.002;
  var globeContainer = null;
  var raycaster = null, mouseVec = null;

  // Countries where AXKAN has made designs
  var ACTIVE_COUNTRIES = [
    { name: 'México', lat: 23.6, lng: -102.5, view: 'mexico' }
  ];
  var targetScale = 1.0, currentScale = 1.0;
  var SCALE_MIN = 1.0, SCALE_MAX = 1.35;
  var lastAppliedScale = 1.0;
  var lastTextureScale = 1.0;
  var currentEarthTexture = null;
  var BASE_TEX_W = 4096, BASE_TEX_H = 2048;

  function initGlobe() {
    globeContainer = document.getElementById('globe-3d');
    if (!globeContainer || typeof THREE === 'undefined') return;

    var w = globeContainer.offsetWidth;
    var h = globeContainer.offsetHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.z = 2.8;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
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

    // Ocean gradient
    var gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0f2847');
    gradient.addColorStop(0.3, '#112d52');
    gradient.addColorStop(0.5, '#143360');
    gradient.addColorStop(0.7, '#112d52');
    gradient.addColorStop(1, '#0f2847');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(40, 70, 120, 0.3)';
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

  function drawDestinationDots(ctx, w, h, s) {
    DESTINATIONS.forEach(function (d) {
      var uv = lngLatToUV(d.lng, d.lat, w, h);
      var glowR = 24 * s, coreR = 5 * s, midR = 8 * s;
      var grad = ctx.createRadialGradient(uv[0], uv[1], 0, uv[0], uv[1], glowR);
      grad.addColorStop(0, 'rgba(9, 173, 194, 0.9)');
      grad.addColorStop(0.4, 'rgba(9, 173, 194, 0.4)');
      grad.addColorStop(1, 'rgba(9, 173, 194, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(9, 220, 255, 0.9)';
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
        color: new THREE.Color('#00e5ff'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.set(0.08, 0.08, 1);
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
      var pos = latLngToVector3(country.lat, country.lng, 1.18);
      var mat = new THREE.SpriteMaterial({
        map: pinTex,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true
      });
      var sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.set(0.07, 0.10, 1);
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
    // Bounding box check for Mexico
    if (country.name === 'México') {
      return lat >= 14 && lat <= 33 && lng >= -118 && lng <= -86;
    }
    return false;
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

    // Wheel zoom — CSS transform scale, only when hovering over the globe
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      targetScale += e.deltaY * -0.003;
      targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));
    }, { passive: false });
  }

  var pulseTime = 0;

  function animateGlobe() {
    animationFrameId = requestAnimationFrame(animateGlobe);
    if (!mouseDown) targetRotationY += autoRotateSpeed;

    currentRotationY += (targetRotationY - currentRotationY) * 0.05;
    currentRotationX += (targetRotationX - currentRotationX) * 0.05;

    // CSS transform zoom — scales the canvas visually, no clipping
    currentScale += (targetScale - currentScale) * 0.1;
    if (Math.abs(currentScale - lastAppliedScale) > 0.005) {
      renderer.domElement.style.transform = 'scale(' + currentScale.toFixed(3) + ')';
      lastAppliedScale = currentScale;
    }

    // Regenerate earth texture at higher resolution when zoom changes
    // GeoJSON is vector data → redrawn crisp at any resolution (up to 8192x4096)
    if (Math.abs(currentScale - lastTextureScale) > 0.12) {
      regenerateTexture(currentScale);
    }

    if (globe) { globe.rotation.y = currentRotationY; globe.rotation.x = currentRotationX; }
    if (gridMesh) { gridMesh.rotation.y = currentRotationY; gridMesh.rotation.x = currentRotationX; }
    if (markerGroup) { markerGroup.rotation.y = currentRotationY; markerGroup.rotation.x = currentRotationX; }
    if (countryPinGroup) { countryPinGroup.rotation.y = currentRotationY; countryPinGroup.rotation.x = currentRotationX; }

    pulseTime += 0.03;
    var s = 0.035 + Math.sin(pulseTime) * 0.01;
    markerSprites.forEach(function (sprite) { sprite.scale.set(s, s, 1); });

    // Bob country pins up and down
    countryPins.forEach(function (pin, idx) {
      var country = ACTIVE_COUNTRIES[idx];
      if (!country) return;
      var bob = Math.sin(pulseTime * 1.2 + idx) * 0.015;
      var pos = latLngToVector3(country.lat, country.lng, 1.18 + bob);
      pin.position.copy(pos);
    });

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
  // MEXICO MAP — Real GeoJSON state boundaries (Canvas 2D)
  // ═══════════════════════════════════════════════════════════

  var mexicoCanvas, mexicoCtx;
  var mexicoProject = null;
  var hoveredState = null;
  var statePathCache = [];

  function initMexicoMap() {
    mexicoCanvas = document.getElementById('mexico-canvas');
    if (!mexicoCanvas) return;

    var container = mexicoCanvas.parentElement;
    var cw = container.offsetWidth - 64;
    var aspect = 0.6;
    var dpr = window.devicePixelRatio || 1;
    mexicoCanvas.width = cw * dpr;
    mexicoCanvas.height = cw * aspect * dpr;
    mexicoCanvas.style.width = cw + 'px';
    mexicoCanvas.style.height = (cw * aspect) + 'px';
    mexicoCtx = mexicoCanvas.getContext('2d');

    setupMexicoProjection(mexicoCanvas.width, mexicoCanvas.height);
    buildStatePathCache();
    drawMexicoMap();

    mexicoCanvas.addEventListener('mousemove', onMexicoMouseMove);
    mexicoCanvas.addEventListener('click', onMexicoClick);
    mexicoCanvas.addEventListener('mouseleave', function () {
      hoveredState = null;
      drawMexicoMap();
      var tip = document.getElementById('mexico-tooltip');
      if (tip) tip.classList.remove('visible');
    });
    mexicoCanvas.addEventListener('touchend', function (e) {
      if (e.changedTouches.length === 1) {
        var touch = e.changedTouches[0];
        var rect = mexicoCanvas.getBoundingClientRect();
        var state = getStateAtPosition(touch.clientX - rect.left, touch.clientY - rect.top);
        if (state && stateGroups[state]) {
          e.preventDefault();
          showStateDetail(state);
        }
      }
    }, { passive: false });
  }

  function setupMexicoProjection(cw, ch) {
    var minLng = -118.5, maxLng = -86.5, minLat = 14, maxLat = 33;
    var pad = 0.06;
    var pw = cw * (1 - 2 * pad);
    var ph = ch * (1 - 2 * pad);
    var lngR = maxLng - minLng;
    var latR = maxLat - minLat;
    mexicoProject = function (lng, lat) {
      return [
        cw * pad + ((lng - minLng) / lngR) * pw,
        ch * pad + ((maxLat - lat) / latR) * ph
      ];
    };
  }

  function buildStatePathCache() {
    statePathCache = [];
    if (!mexicoGeoJSON || !mexicoProject) return;

    mexicoGeoJSON.features.forEach(function (feature) {
      var geoName = feature.properties.name;
      var name = ourStateName(geoName);
      var geom = feature.geometry;
      var coordSets = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

      var polygons = coordSets.map(function (rings) {
        return rings.map(function (ring) {
          return ring.map(function (c) { return mexicoProject(c[0], c[1]); });
        });
      });

      statePathCache.push({
        name: name,
        polygons: polygons,
        hasDestinations: !!stateGroups[name]
      });
    });
  }

  function drawMexicoMap() {
    if (!mexicoCtx) return;
    var ctx = mexicoCtx;
    var cw = mexicoCanvas.width;
    var ch = mexicoCanvas.height;
    var dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, cw, ch);

    // Subtle background
    var bg = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw * 0.6);
    bg.addColorStop(0, 'rgba(15, 15, 35, 0.3)');
    bg.addColorStop(1, 'rgba(10, 10, 26, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    if (!statePathCache.length) return;

    var brandColors = [COLORS.rosa, COLORS.turquesa, COLORS.naranja, COLORS.verde];
    var colorIndex = 0;

    // Assign a consistent color to each state-with-destinations
    var stateColorMap = {};
    Object.keys(stateGroups).forEach(function (name) {
      stateColorMap[name] = brandColors[colorIndex % brandColors.length];
      colorIndex++;
    });

    // Draw all state polygons
    statePathCache.forEach(function (state) {
      var isHovered = hoveredState === state.name;
      var hasDest = state.hasDestinations;
      var color = stateColorMap[state.name];

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
          // Pink illuminated border + subtle fill
          ctx.fillStyle = isHovered ? 'rgba(231, 42, 136, 0.25)' : 'rgba(231, 42, 136, 0.1)';
          ctx.fill('evenodd');
          ctx.strokeStyle = isHovered ? '#ff6ab5' : COLORS.rosa;
          ctx.lineWidth = (isHovered ? 2.5 : 1.5) * dpr;
          ctx.stroke();
        } else {
          ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
          ctx.fill('evenodd');
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 0.5 * dpr;
          ctx.stroke();
        }
      });
    });

    // Draw map pin markers for states with destinations
    Object.keys(stateGroups).forEach(function (stateName) {
      var center = STATE_CENTERS[stateName];
      if (!center || !mexicoProject) return;
      var pos = mexicoProject(center.lng, center.lat);
      var count = stateGroups[stateName].length;
      var isHovered = hoveredState === stateName;
      var color = stateColorMap[stateName];
      var pinH = (28 + count * 4) * dpr;
      var pinW = pinH * 0.7;
      var scale = isHovered ? 1.2 : 1;
      pinH *= scale; pinW *= scale;
      var cx = pos[0], tipY = pos[1];
      var headY = tipY - pinH;
      var headR = pinW / 2;

      // Shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 6 * dpr;
      ctx.shadowOffsetY = 3 * dpr;

      // Teardrop pin
      ctx.beginPath();
      ctx.moveTo(cx, tipY);
      ctx.bezierCurveTo(cx - pinW * 0.4, tipY - pinH * 0.45, cx - headR, headY + headR * 0.4, cx - headR, headY);
      ctx.arc(cx, headY, headR, Math.PI, 0, false);
      ctx.bezierCurveTo(cx + headR, headY + headR * 0.4, cx + pinW * 0.4, tipY - pinH * 0.45, cx, tipY);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // White inner circle
      var innerR = headR * 0.55;
      ctx.beginPath();
      ctx.arc(cx, headY, innerR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Count number
      ctx.fillStyle = color;
      ctx.font = 'bold ' + Math.round(innerR * 1.2) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(count, cx, headY);

      // State abbreviation label
      ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.7)';
      ctx.font = (isHovered ? 'bold ' : '') + (10 * dpr) + 'px Inter, sans-serif';
      ctx.fillText(center.abbr, cx, tipY + 10 * dpr);
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
    for (var i = 0; i < statePathCache.length; i++) {
      if (statePathCache[i].hasDestinations && pointInPolygons(px, py, statePathCache[i].polygons)) {
        return statePathCache[i].name;
      }
    }
    for (var j = 0; j < statePathCache.length; j++) {
      if (!statePathCache[j].hasDestinations && pointInPolygons(px, py, statePathCache[j].polygons)) {
        return statePathCache[j].name;
      }
    }
    return null;
  }

  function onMexicoMouseMove(e) {
    var rect = mexicoCanvas.getBoundingClientRect();
    var state = getStateAtPosition(e.clientX - rect.left, e.clientY - rect.top);

    if (state !== hoveredState) {
      hoveredState = state;
      drawMexicoMap();
      mexicoCanvas.style.cursor = state ? 'pointer' : 'default';
    }

    var tip = document.getElementById('mexico-tooltip');
    if (state && tip) {
      var group = stateGroups[state];
      if (group) {
        var names = group.map(function (d) { return d.name; }).join(', ');
        tip.innerHTML = '<h4>' + state + '</h4><p>' + group.length + ' destino' + (group.length > 1 ? 's' : '') + ': ' + names + '</p>';
      } else {
        tip.innerHTML = '<h4>' + state + '</h4><p>Pr&oacute;ximamente</p>';
      }
      tip.style.left = (e.clientX + 15) + 'px';
      tip.style.top = (e.clientY - 10) + 'px';
      tip.classList.add('visible');
    } else if (tip) {
      tip.classList.remove('visible');
    }
  }

  function onMexicoClick(e) {
    var rect = mexicoCanvas.getBoundingClientRect();
    var state = getStateAtPosition(e.clientX - rect.left, e.clientY - rect.top);
    if (state && stateGroups[state]) {
      showStateDetail(state);
    }
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
    var mexicoView = document.getElementById('mexico-view');
    var stateView = document.getElementById('state-view');
    var explorerBtn = document.getElementById('globe-explore-btn');
    var tip = document.getElementById('mexico-tooltip');
    if (tip) tip.classList.remove('visible');

    if (globeView) {
      if (view === 'globe') { globeView.classList.remove('hidden'); if (explorerBtn) explorerBtn.style.display = ''; }
      else { globeView.classList.add('hidden'); }
    }
    if (mexicoView) {
      if (view === 'mexico') {
        mexicoView.classList.add('active');
        if (!statePathCache.length) initMexicoMap();
        else {
          var container = mexicoCanvas.parentElement;
          var cw = container.offsetWidth - 64;
          var aspect = 0.6;
          var dpr = window.devicePixelRatio || 1;
          mexicoCanvas.width = cw * dpr;
          mexicoCanvas.height = cw * aspect * dpr;
          mexicoCanvas.style.width = cw + 'px';
          mexicoCanvas.style.height = (cw * aspect) + 'px';
          setupMexicoProjection(mexicoCanvas.width, mexicoCanvas.height);
          buildStatePathCache();
          drawMexicoMap();
        }
      } else { mexicoView.classList.remove('active'); }
    }
    if (stateView) {
      if (view === 'state') stateView.classList.add('active');
      else stateView.classList.remove('active');
    }

    updateNav(view);
  }

  function updateNav(view) {
    var navGlobe = document.getElementById('nav-globe');
    var navMexico = document.getElementById('nav-mexico');
    var navState = document.getElementById('nav-state');
    var sep1 = document.getElementById('nav-sep1');
    var sep2 = document.getElementById('nav-sep2');

    [navGlobe, navMexico, navState].forEach(function (b) { if (b) b.classList.remove('active'); });

    if (view === 'globe') {
      if (navGlobe) navGlobe.classList.add('active');
      if (navMexico) navMexico.classList.add('hidden');
      if (navState) navState.classList.add('hidden');
      if (sep1) sep1.classList.add('hidden');
      if (sep2) sep2.classList.add('hidden');
    } else if (view === 'mexico') {
      if (navMexico) { navMexico.classList.remove('hidden'); navMexico.classList.add('active'); }
      if (navState) navState.classList.add('hidden');
      if (sep1) sep1.classList.remove('hidden');
      if (sep2) sep2.classList.add('hidden');
    } else if (view === 'state') {
      if (navMexico) { navMexico.classList.remove('hidden'); }
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

    var navMexico = document.getElementById('nav-mexico');
    if (navMexico) navMexico.addEventListener('click', function () { showView('mexico'); });
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

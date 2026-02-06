/**
 * AXKAN 3D Globe — Interactive Destination Explorer
 *
 * Three views:
 *  1. 3D rotating globe with destination markers (Three.js)
 *  2. Mexico map with state markers (Canvas 2D)
 *  3. State detail with destination cards (DOM)
 *
 * Dependencies: Three.js (loaded from CDN before this file)
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
    grid: '#1a2a4a',
    land: '#1e3a5a',
    ocean: '#0a0f1e',
    highlight: '#e72a88',
    marker: '#09adc2',
    markerGlow: '#e72a88'
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

  // Image mapping (loaded from page if available)
  var IMAGE_MAP = {};
  try {
    var script = document.querySelector('script[data-destination-images]');
    if (script) IMAGE_MAP = JSON.parse(script.textContent);
  } catch (e) { /* silent */ }

  // Group destinations by state
  var stateGroups = {};
  DESTINATIONS.forEach(function (d) {
    if (!stateGroups[d.state]) stateGroups[d.state] = [];
    stateGroups[d.state].push(d);
  });

  // State center coordinates for Mexico map
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

  // Simplified Mexico outline coordinates [lng, lat]
  var MEXICO_OUTLINE = [
    [-117.1,32.5],[-114.7,32.7],[-111,31.3],[-108.2,31.8],[-106.4,31.8],
    [-104.9,30.6],[-103.3,29.0],[-101.4,29.8],[-100.0,28.2],[-99.0,26.4],
    [-97.1,25.8],[-97.8,22.6],[-97.2,21.5],[-97.3,20.5],[-96.5,19.0],
    [-96.0,18.5],[-94.5,18.3],[-93.5,16.1],[-92.5,15.0],[-92.2,14.5],
    [-91.0,14.8],[-90.5,16.0],[-90.8,17.8],[-88.3,18.5],[-87.5,18.3],
    [-87.1,18.5],[-87.4,20.5],[-87.5,21.6],[-90.4,21.5],[-91.4,18.8],
    [-92.5,16.5],[-93.5,16.1],[-94.8,16.2],[-96.0,15.7],[-97.0,16.1],
    [-99.0,16.5],[-100.5,17.0],[-101.6,18.0],[-103.5,18.3],[-105.2,20.0],
    [-105.7,21.0],[-105.3,22.0],[-106.5,23.5],[-108.0,25.0],[-109.5,26.5],
    [-111.0,27.5],[-112.5,29.0],[-114.5,31.5],[-117.1,32.5]
  ];

  var BAJA_OUTLINE = [
    [-117.1,32.5],[-116.0,32.0],[-115.0,30.5],[-113.5,28.5],[-112.5,26.5],
    [-112.0,24.5],[-110.5,23.3],[-109.5,23.0],[-110.0,24.0],[-110.5,25.0],
    [-112.0,27.0],[-114.0,30.0],[-115.5,32.0],[-117.1,32.5]
  ];

  // ═══════════════════════════════════════════════════════════
  // GLOBE RENDERER (Three.js)
  // ═══════════════════════════════════════════════════════════

  var scene, camera, renderer, globe, gridMesh, atmosphereMesh;
  var markerGroup, markerSprites = [];
  var animationFrameId = null;
  // Initial rotation to face Mexico (lng ~-100 => needs specific Y rotation)
  // On equirectangular texture, Mexico is at U ≈ 0.22 (from left)
  // Three.js sphere is oriented so 0 rotation shows U=0.5 (meridian 0)
  // To show lng -100, we rotate Y by about +1.75 radians
  var targetRotationY = 1.75, currentRotationY = 1.75;
  var targetRotationX = 0.15, currentRotationX = 0.15;
  var isUserDragging = false;
  var mouseDown = false, mouseX = 0, mouseY = 0;
  var autoRotateSpeed = 0.002;
  var globeContainer = null;

  function initGlobe() {
    globeContainer = document.getElementById('globe-3d');
    if (!globeContainer || typeof THREE === 'undefined') return;

    var w = globeContainer.offsetWidth;
    var h = globeContainer.offsetHeight;

    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.z = 2.8;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    globeContainer.appendChild(renderer.domElement);

    // Hide loading placeholder
    var loading = document.getElementById('globe-loading');
    if (loading) loading.style.display = 'none';

    // Create earth texture
    var earthTexture = createEarthTexture();

    // Globe sphere
    var sphereGeo = new THREE.SphereGeometry(1, 64, 64);
    var sphereMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      specular: new THREE.Color(0x222244),
      shininess: 15
    });
    globe = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(globe);

    // Grid wireframe (slightly larger)
    var gridGeo = new THREE.SphereGeometry(1.002, 48, 24);
    var gridMat = new THREE.MeshBasicMaterial({
      color: 0xe72a88,
      wireframe: true,
      transparent: true,
      opacity: 0.06
    });
    gridMesh = new THREE.Mesh(gridGeo, gridMat);
    scene.add(gridMesh);

    // Atmosphere glow
    createAtmosphere();

    // Destination markers
    createMarkers();

    // Lights — bright enough to make continents pop
    var ambient = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambient);
    var directional = new THREE.DirectionalLight(0xffffff, 1.2);
    directional.position.set(5, 3, 5);
    scene.add(directional);
    var fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-5, 0, 3);
    scene.add(fillLight);
    var backLight = new THREE.DirectionalLight(0xe72a88, 0.5);
    backLight.position.set(-3, -2, -5);
    scene.add(backLight);

    // Mouse/touch interaction
    setupGlobeInteraction();

    // Start animation
    animateGlobe();

    // Handle resize
    window.addEventListener('resize', onGlobeResize);
  }

  function createEarthTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    var ctx = canvas.getContext('2d');

    // Ocean — rich deep blue, not too dark
    var gradient = ctx.createLinearGradient(0, 0, 0, 1024);
    gradient.addColorStop(0, '#0f2847');
    gradient.addColorStop(0.3, '#112d52');
    gradient.addColorStop(0.5, '#143360');
    gradient.addColorStop(0.7, '#112d52');
    gradient.addColorStop(1, '#0f2847');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2048, 1024);

    // Grid lines on ocean
    ctx.strokeStyle = 'rgba(40, 70, 120, 0.35)';
    ctx.lineWidth = 0.8;
    for (var i = 0; i < 36; i++) {
      var x = (i / 36) * 2048;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
    }
    for (var j = 0; j < 18; j++) {
      var y = (j / 18) * 1024;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }

    // Draw continents
    drawContinentShapes(ctx, 2048, 1024);

    // Highlight Mexico
    highlightMexicoOnTexture(ctx, 2048, 1024);

    return new THREE.CanvasTexture(canvas);
  }

  function lngLatToUV(lng, lat, w, h) {
    var x = ((lng + 180) / 360) * w;
    var y = ((90 - lat) / 180) * h;
    return [x, y];
  }

  function drawContinentShapes(ctx, w, h) {
    // Simplified continent polygons
    var continents = {
      northAmerica: [
        [-168,72],[-140,70],[-130,55],[-124,48],[-125,40],[-117,33],
        [-105,23],[-97,17],[-87,15],[-83,9],[-80,8],[-82,10],[-87,17],
        [-97,26],[-96,40],[-82,30],[-76,35],[-70,42],[-67,44],[-55,48],
        [-55,52],[-60,60],[-78,62],[-95,70],[-168,72]
      ],
      southAmerica: [
        [-82,10],[-77,2],[-80,-5],[-70,-15],[-60,-25],[-50,-25],[-45,-12],
        [-35,-5],[-35,-10],[-40,-18],[-48,-30],[-55,-35],[-68,-55],
        [-75,-50],[-70,-40],[-65,-35],[-58,-30],[-60,-10],[-68,0],
        [-77,8],[-82,10]
      ],
      europe: [
        [-10,36],[0,43],[5,44],[10,46],[15,55],[12,57],[15,60],[10,63],
        [20,65],[30,70],[45,68],[40,55],[30,47],[27,42],[25,38],[20,36],[10,36],[-10,36]
      ],
      africa: [
        [-18,35],[10,37],[30,32],[37,32],[43,12],[50,12],[40,-5],[35,-25],
        [30,-34],[20,-35],[15,-28],[12,-6],[8,5],[-5,5],[-12,5],
        [-18,15],[-18,35]
      ],
      asia: [
        [30,32],[40,42],[50,40],[55,42],[65,40],[70,45],[80,40],[90,28],
        [100,22],[105,15],[110,20],[120,23],[130,35],[140,40],[145,45],
        [150,60],[170,65],[180,70],[180,50],[150,48],[140,52],[130,48],
        [120,42],[110,35],[105,25],[100,15],[95,10],[80,7],[75,15],
        [70,25],[60,35],[50,42],[45,42],[40,55],[55,70],[70,72],
        [100,75],[170,70],[180,72],[180,70]
      ],
      australia: [
        [113,-12],[130,-12],[137,-15],[145,-15],[150,-25],[153,-28],
        [150,-37],[140,-38],[130,-32],[115,-35],[115,-22],[120,-15],[113,-12]
      ]
    };

    // Bright, visible continents
    Object.keys(continents).forEach(function (key) {
      var pts = continents[key];
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var uv = lngLatToUV(pts[i][0], pts[i][1], w, h);
        if (i === 0) ctx.moveTo(uv[0], uv[1]);
        else ctx.lineTo(uv[0], uv[1]);
      }
      ctx.closePath();
      // Solid bright fill
      ctx.fillStyle = '#2a6e5a';
      ctx.fill();
      // Bright edge
      ctx.strokeStyle = '#3adfb6';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Second pass: inner glow on continents
    Object.keys(continents).forEach(function (key) {
      var pts = continents[key];
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var uv = lngLatToUV(pts[i][0], pts[i][1], w, h);
        if (i === 0) ctx.moveTo(uv[0], uv[1]);
        else ctx.lineTo(uv[0], uv[1]);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(58, 223, 182, 0.15)';
      ctx.fill();
    });
  }

  function highlightMexicoOnTexture(ctx, w, h) {
    // Mexico — BOLD pink highlight that pops
    // Draw glow behind Mexico first
    ctx.shadowColor = '#e72a88';
    ctx.shadowBlur = 20;

    // Mainland fill
    ctx.beginPath();
    for (var i = 0; i < MEXICO_OUTLINE.length; i++) {
      var uv = lngLatToUV(MEXICO_OUTLINE[i][0], MEXICO_OUTLINE[i][1], w, h);
      if (i === 0) ctx.moveTo(uv[0], uv[1]);
      else ctx.lineTo(uv[0], uv[1]);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(231, 42, 136, 0.55)';
    ctx.fill();
    ctx.strokeStyle = '#ff4da6';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Baja fill
    ctx.beginPath();
    for (var j = 0; j < BAJA_OUTLINE.length; j++) {
      var bv = lngLatToUV(BAJA_OUTLINE[j][0], BAJA_OUTLINE[j][1], w, h);
      if (j === 0) ctx.moveTo(bv[0], bv[1]);
      else ctx.lineTo(bv[0], bv[1]);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(231, 42, 136, 0.55)';
    ctx.fill();
    ctx.strokeStyle = '#ff4da6';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Destination dots — BIG and bright
    DESTINATIONS.forEach(function (d) {
      var uv = lngLatToUV(d.lng, d.lat, w, h);
      // Outer glow
      var dotGrad = ctx.createRadialGradient(uv[0], uv[1], 0, uv[0], uv[1], 14);
      dotGrad.addColorStop(0, 'rgba(9, 173, 194, 0.9)');
      dotGrad.addColorStop(0.4, 'rgba(9, 173, 194, 0.4)');
      dotGrad.addColorStop(1, 'rgba(9, 173, 194, 0)');
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], 14, 0, Math.PI * 2);
      ctx.fill();
      // Bright core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], 3, 0, Math.PI * 2);
      ctx.fill();
      // Mid ring
      ctx.fillStyle = 'rgba(9, 220, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(uv[0], uv[1], 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function createAtmosphere() {
    var atmosphereVert = [
      'varying vec3 vNormal;',
      'void main() {',
      '  vNormal = normalize(normalMatrix * normal);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n');

    var atmosphereFrag = [
      'varying vec3 vNormal;',
      'void main() {',
      '  float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);',
      '  gl_FragColor = vec4(0.906, 0.165, 0.533, 1.0) * intensity * 1.2;',
      '}'
    ].join('\n');

    var atmosphereGeo = new THREE.SphereGeometry(1.15, 64, 64);
    var atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVert,
      fragmentShader: atmosphereFrag,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });
    atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphereMesh);
  }

  function createMarkers() {
    markerGroup = new THREE.Group();

    // Create glow texture — bigger and brighter
    var glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    var gctx = glowCanvas.getContext('2d');
    var grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.15, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    var glowTexture = new THREE.CanvasTexture(glowCanvas);

    DESTINATIONS.forEach(function (d) {
      var pos = latLngToVector3(d.lat, d.lng, 1.025);
      var spriteMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: new THREE.Color('#00e5ff'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var sprite = new THREE.Sprite(spriteMat);
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

  function setupGlobeInteraction() {
    var canvas = renderer.domElement;

    canvas.addEventListener('mousedown', function (e) {
      mouseDown = true;
      isUserDragging = false;
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    canvas.addEventListener('mousemove', function (e) {
      if (!mouseDown) return;
      var dx = e.clientX - mouseX;
      var dy = e.clientY - mouseY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isUserDragging = true;
      targetRotationY += dx * 0.005;
      targetRotationX += dy * 0.003;
      targetRotationX = Math.max(-0.8, Math.min(0.8, targetRotationX));
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    canvas.addEventListener('mouseup', function () {
      mouseDown = false;
    });

    canvas.addEventListener('mouseleave', function () {
      mouseDown = false;
    });

    // Touch events
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        mouseDown = true;
        isUserDragging = false;
        mouseX = e.touches[0].clientX;
        mouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (!mouseDown || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - mouseX;
      var dy = e.touches[0].clientY - mouseY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isUserDragging = true;
      targetRotationY += dx * 0.005;
      targetRotationX += dy * 0.003;
      targetRotationX = Math.max(-0.8, Math.min(0.8, targetRotationX));
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', function () {
      mouseDown = false;
    }, { passive: true });
  }

  var pulseTime = 0;

  function animateGlobe() {
    animationFrameId = requestAnimationFrame(animateGlobe);

    // Auto-rotate when not dragging
    if (!mouseDown) {
      targetRotationY += autoRotateSpeed;
    }

    // Smooth interpolation
    currentRotationY += (targetRotationY - currentRotationY) * 0.05;
    currentRotationX += (targetRotationX - currentRotationX) * 0.05;

    if (globe) {
      globe.rotation.y = currentRotationY;
      globe.rotation.x = currentRotationX;
    }
    if (gridMesh) {
      gridMesh.rotation.y = currentRotationY;
      gridMesh.rotation.x = currentRotationX;
    }
    if (markerGroup) {
      markerGroup.rotation.y = currentRotationY;
      markerGroup.rotation.x = currentRotationX;
    }

    // Pulse markers
    pulseTime += 0.03;
    var pulseScale = 0.035 + Math.sin(pulseTime) * 0.01;
    markerSprites.forEach(function (sprite) {
      sprite.scale.set(pulseScale, pulseScale, 1);
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
  // MEXICO MAP (Canvas 2D)
  // ═══════════════════════════════════════════════════════════

  var mexicoCanvas, mexicoCtx;
  var mexicoMapData = null; // projected state positions
  var hoveredState = null;

  function initMexicoMap() {
    mexicoCanvas = document.getElementById('mexico-canvas');
    if (!mexicoCanvas) return;

    var container = mexicoCanvas.parentElement;
    var cw = container.offsetWidth - 64; // padding
    var aspect = 0.65; // Mexico is wider than tall
    mexicoCanvas.width = cw * (window.devicePixelRatio || 1);
    mexicoCanvas.height = cw * aspect * (window.devicePixelRatio || 1);
    mexicoCanvas.style.width = cw + 'px';
    mexicoCanvas.style.height = (cw * aspect) + 'px';
    mexicoCtx = mexicoCanvas.getContext('2d');

    // Project and draw
    mexicoMapData = projectMexicoMap(mexicoCanvas.width, mexicoCanvas.height);
    drawMexicoMap();

    // Interaction
    mexicoCanvas.addEventListener('mousemove', onMexicoMouseMove);
    mexicoCanvas.addEventListener('click', onMexicoClick);
    mexicoCanvas.addEventListener('mouseleave', function () {
      hoveredState = null;
      drawMexicoMap();
      var tip = document.getElementById('mexico-tooltip');
      if (tip) tip.classList.remove('visible');
    });

    // Touch support for mobile
    mexicoCanvas.addEventListener('touchend', function (e) {
      if (e.changedTouches.length === 1) {
        var touch = e.changedTouches[0];
        var rect = mexicoCanvas.getBoundingClientRect();
        var x = touch.clientX - rect.left;
        var y = touch.clientY - rect.top;
        var state = getStateAtPosition(x, y);
        if (state) {
          e.preventDefault();
          showStateDetail(state);
        }
      }
    }, { passive: false });
  }

  function projectMexicoMap(cw, ch) {
    // Mexico bounding box
    var minLng = -118, maxLng = -86;
    var minLat = 14, maxLat = 33;
    var padding = 0.08; // 8% padding

    var w = maxLng - minLng;
    var h = maxLat - minLat;
    var pw = cw * (1 - 2 * padding);
    var ph = ch * (1 - 2 * padding);

    function project(lng, lat) {
      var x = cw * padding + ((lng - minLng) / w) * pw;
      var y = ch * padding + ((maxLat - lat) / h) * ph;
      return [x, y];
    }

    // Project state positions
    var states = {};
    Object.keys(stateGroups).forEach(function (stateName) {
      var center = STATE_CENTERS[stateName];
      if (!center) return;
      var pos = project(center.lng, center.lat);
      states[stateName] = {
        x: pos[0],
        y: pos[1],
        count: stateGroups[stateName].length,
        abbr: center.abbr,
        destinations: stateGroups[stateName]
      };
    });

    // Project outlines
    var outline = MEXICO_OUTLINE.map(function (p) { return project(p[0], p[1]); });
    var baja = BAJA_OUTLINE.map(function (p) { return project(p[0], p[1]); });

    return { states: states, outline: outline, baja: baja, project: project };
  }

  function drawMexicoMap() {
    if (!mexicoCtx || !mexicoMapData) return;
    var ctx = mexicoCtx;
    var cw = mexicoCanvas.width;
    var ch = mexicoCanvas.height;
    var dpr = window.devicePixelRatio || 1;

    // Clear
    ctx.clearRect(0, 0, cw, ch);

    // Background
    var bgGrad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw * 0.6);
    bgGrad.addColorStop(0, 'rgba(15, 15, 35, 0.3)');
    bgGrad.addColorStop(1, 'rgba(10, 10, 26, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    // Draw Mexico outline
    ctx.strokeStyle = 'rgba(231, 42, 136, 0.3)';
    ctx.lineWidth = 2 * dpr;
    ctx.fillStyle = 'rgba(231, 42, 136, 0.05)';

    // Mainland
    ctx.beginPath();
    mexicoMapData.outline.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Baja
    ctx.beginPath();
    mexicoMapData.baja.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw state markers
    var brandColors = [COLORS.rosa, COLORS.turquesa, COLORS.naranja, COLORS.verde];
    var colorIndex = 0;

    Object.keys(mexicoMapData.states).forEach(function (stateName) {
      var state = mexicoMapData.states[stateName];
      var isHovered = hoveredState === stateName;
      var baseRadius = (8 + state.count * 4) * dpr;
      var radius = isHovered ? baseRadius * 1.3 : baseRadius;
      var color = brandColors[colorIndex % brandColors.length];
      colorIndex++;

      // Glow
      var glowGrad = ctx.createRadialGradient(state.x, state.y, 0, state.x, state.y, radius * 2);
      glowGrad.addColorStop(0, color + '40');
      glowGrad.addColorStop(1, color + '00');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(state.x, state.y, radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Main circle
      ctx.fillStyle = isHovered ? color : color + 'CC';
      ctx.beginPath();
      ctx.arc(state.x, state.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = isHovered ? '#ffffff' : color;
      ctx.lineWidth = (isHovered ? 2.5 : 1.5) * dpr;
      ctx.stroke();

      // Count text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + (12 * dpr) + 'px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(state.count, state.x, state.y);

      // State label
      ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.7)';
      ctx.font = (isHovered ? 'bold ' : '') + (10 * dpr) + 'px Inter, sans-serif';
      ctx.fillText(state.abbr, state.x, state.y + radius + 12 * dpr);
    });
  }

  function getStateAtPosition(canvasX, canvasY) {
    if (!mexicoMapData) return null;
    var dpr = window.devicePixelRatio || 1;
    var cx = canvasX * dpr;
    var cy = canvasY * dpr;
    var closest = null;
    var closestDist = Infinity;

    Object.keys(mexicoMapData.states).forEach(function (stateName) {
      var state = mexicoMapData.states[stateName];
      var radius = (8 + state.count * 4) * dpr;
      var hitRadius = radius * 1.8; // generous hit area
      var dx = cx - state.x;
      var dy = cy - state.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitRadius && dist < closestDist) {
        closest = stateName;
        closestDist = dist;
      }
    });

    return closest;
  }

  function onMexicoMouseMove(e) {
    var rect = mexicoCanvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var state = getStateAtPosition(x, y);

    if (state !== hoveredState) {
      hoveredState = state;
      drawMexicoMap();
      mexicoCanvas.style.cursor = state ? 'pointer' : 'default';
    }

    var tip = document.getElementById('mexico-tooltip');
    if (state && tip) {
      var group = stateGroups[state];
      var names = group.map(function (d) { return d.name; }).join(', ');
      tip.innerHTML = '<h4>' + state + '</h4><p>' + group.length + ' destino' + (group.length > 1 ? 's' : '') + ': ' + names + '</p>';
      tip.style.left = (e.clientX + 15) + 'px';
      tip.style.top = (e.clientY - 10) + 'px';
      tip.classList.add('visible');
    } else if (tip) {
      tip.classList.remove('visible');
    }
  }

  function onMexicoClick(e) {
    var rect = mexicoCanvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var state = getStateAtPosition(x, y);
    if (state) {
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
      var imageUrl = '';
      if (IMAGE_MAP[d.slug] && IMAGE_MAP[d.slug].hero) {
        imageUrl = IMAGE_MAP[d.slug].hero;
      }

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

    // Update nav state button
    var navState = document.getElementById('nav-state');
    if (navState) navState.textContent = stateName;
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  var currentView = 'globe';

  function showView(view) {
    currentView = view;

    var globeView = document.getElementById('globe-view');
    var mexicoView = document.getElementById('mexico-view');
    var stateView = document.getElementById('state-view');
    var explorerBtn = document.getElementById('globe-explore-btn');
    var tip = document.getElementById('mexico-tooltip');

    // Hide tooltip
    if (tip) tip.classList.remove('visible');

    // Toggle views
    if (globeView) {
      if (view === 'globe') {
        globeView.classList.remove('hidden');
        if (explorerBtn) explorerBtn.style.display = '';
      } else {
        globeView.classList.add('hidden');
      }
    }
    if (mexicoView) {
      if (view === 'mexico') {
        mexicoView.classList.add('active');
        // Initialize Mexico map if first time
        if (!mexicoMapData) initMexicoMap();
        else {
          // Redraw in case of resize
          var container = mexicoCanvas.parentElement;
          var cw = container.offsetWidth - 64;
          var aspect = 0.65;
          var dpr = window.devicePixelRatio || 1;
          mexicoCanvas.width = cw * dpr;
          mexicoCanvas.height = cw * aspect * dpr;
          mexicoCanvas.style.width = cw + 'px';
          mexicoCanvas.style.height = (cw * aspect) + 'px';
          mexicoMapData = projectMexicoMap(mexicoCanvas.width, mexicoCanvas.height);
          drawMexicoMap();
        }
      } else {
        mexicoView.classList.remove('active');
      }
    }
    if (stateView) {
      if (view === 'state') {
        stateView.classList.add('active');
      } else {
        stateView.classList.remove('active');
      }
    }

    // Update nav buttons
    updateNav(view);
  }

  function updateNav(view) {
    var navGlobe = document.getElementById('nav-globe');
    var navMexico = document.getElementById('nav-mexico');
    var navState = document.getElementById('nav-state');
    var sep1 = document.getElementById('nav-sep1');
    var sep2 = document.getElementById('nav-sep2');

    // Reset all
    [navGlobe, navMexico, navState].forEach(function (btn) {
      if (btn) btn.classList.remove('active');
    });

    if (view === 'globe') {
      if (navGlobe) navGlobe.classList.add('active');
      if (navMexico) navMexico.classList.add('hidden');
      if (navState) navState.classList.add('hidden');
      if (sep1) sep1.classList.add('hidden');
      if (sep2) sep2.classList.add('hidden');
    } else if (view === 'mexico') {
      if (navGlobe) navGlobe.classList.remove('active');
      if (navMexico) { navMexico.classList.remove('hidden'); navMexico.classList.add('active'); }
      if (navState) navState.classList.add('hidden');
      if (sep1) sep1.classList.remove('hidden');
      if (sep2) sep2.classList.add('hidden');
    } else if (view === 'state') {
      if (navGlobe) navGlobe.classList.remove('active');
      if (navMexico) { navMexico.classList.remove('hidden'); navMexico.classList.remove('active'); }
      if (navState) { navState.classList.remove('hidden'); navState.classList.add('active'); }
      if (sep1) sep1.classList.remove('hidden');
      if (sep2) sep2.classList.remove('hidden');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ═══════════════════════════════════════════════════════════

  function bindEvents() {
    // Explore Mexico button
    var exploreBtn = document.getElementById('globe-explore-btn');
    if (exploreBtn) {
      exploreBtn.addEventListener('click', function () {
        showView('mexico');
      });
    }

    // Nav buttons
    var navGlobe = document.getElementById('nav-globe');
    if (navGlobe) {
      navGlobe.addEventListener('click', function () { showView('globe'); });
    }
    var navMexico = document.getElementById('nav-mexico');
    if (navMexico) {
      navMexico.addEventListener('click', function () { showView('mexico'); });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init() {
    // Load destination images data
    loadImageMapping();
    // Initialize Three.js globe
    initGlobe();
    // Bind UI events
    bindEvents();
  }

  function loadImageMapping() {
    // Try to fetch destination images
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/destination-images.json', true);
      xhr.onload = function () {
        if (xhr.status === 200) {
          IMAGE_MAP = JSON.parse(xhr.responseText);
        }
      };
      xhr.send();
    } catch (e) { /* silent */ }
  }

  // Expose for external access
  window.globeSection = {
    init: init,
    showView: showView
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

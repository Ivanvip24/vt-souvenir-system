/**
 * T1 Envíos — Guías Integration Module
 * Hooks into the existing guías view to show T1 shipments alongside Skydropx ones.
 * When "T1" filter is selected, fetches from /api/t1/shipments and renders
 * using the same guia-card UI pattern.
 */

// T1 API URL
var T1_API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api/t1'
  : 'https://vt-souvenir-backend.onrender.com/api/t1';

// T1 shipments data cache
var t1ShipmentsData = [];
var t1ShipmentsLoaded = false;

// T1 carrier style (uses truck icon + teal accent)
var T1_CARRIER_STYLE = { icon: '\u{1F69A}', accent: '#0891b2' };

// ==========================================
// OVERRIDE: filterGuiasByStatus
// Patch the existing filter function to handle 't1' status
// ==========================================

var _originalFilterGuias = window.filterGuiasByStatus;

window.filterGuiasByStatus = function(status) {
  // Toggle T1-specific action buttons
  document.querySelectorAll('.t1-only-btn').forEach(function(btn) {
    btn.classList.toggle('hidden', status !== 't1');
  });

  if (status === 't1') {
    // Custom T1 flow: load from T1 API
    guiasCurrentStatus = 't1';
    document.querySelectorAll('.guias-filter-chip').forEach(function(btn) {
      btn.classList.toggle('guias-filter-chip--active', btn.dataset.status === 't1');
    });
    closeGuiasPanel();
    loadT1Guias();
  } else {
    // Restore default empty state text when leaving T1
    var emptyEl = document.getElementById('guias-empty-state');
    if (emptyEl) {
      var emptyTitle = emptyEl.querySelector('.guias-empty__title');
      var emptyText = emptyEl.querySelector('.guias-empty__text');
      if (emptyTitle) emptyTitle.textContent = 'Sin guias';
      if (emptyText) emptyText.textContent = 'Las guias apareceran cuando se generen envios';
    }
    // Restore pagination visibility
    var paginationEl = document.getElementById('guias-pagination');
    if (paginationEl) paginationEl.style.display = '';
    // Default Skydropx flow
    _originalFilterGuias(status);
  }
};

// ==========================================
// T1 GUÍAS LOADER
// ==========================================

async function loadT1Guias() {
  var listEl = document.getElementById('guias-card-list');
  var emptyEl = document.getElementById('guias-empty-state');
  var paginationEl = document.getElementById('guias-pagination');

  // Show loading
  var skeletons = '';
  for (var i = 0; i < 4; i++) {
    skeletons += '<div class="guia-card-skeleton"><div class="skel-line skel-w60"></div><div class="skel-line skel-w40"></div></div>';
  }
  listEl.innerHTML = skeletons;
  emptyEl.classList.add('hidden');
  if (paginationEl) paginationEl.style.display = 'none';

  try {
    var token = localStorage.getItem('adminToken');
    var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    var resp = await fetch(T1_API_URL + '/shipments?limit=50', { headers: headers });
    var data = await resp.json();

    t1ShipmentsData = data.shipments || [];
    t1ShipmentsLoaded = true;

    // Update count badge
    var countEl = document.getElementById('guias-count-t1');
    if (countEl) countEl.textContent = data.total || t1ShipmentsData.length;

    listEl.textContent = '';

    if (t1ShipmentsData.length === 0) {
      emptyEl.classList.remove('hidden');
      // Customize empty message
      var emptyTitle = emptyEl.querySelector('.guias-empty__title');
      var emptyText = emptyEl.querySelector('.guias-empty__text');
      if (emptyTitle) emptyTitle.textContent = 'Sin envios T1';
      if (emptyText) emptyText.textContent = 'Vincula un tracking de T1 o crea un envio en shipping.t1.com';
      return;
    }

    t1ShipmentsData.forEach(function(shipment) {
      listEl.appendChild(createT1Card(shipment));
    });

  } catch (err) {
    console.error('Error loading T1 guias:', err);
    listEl.textContent = '';
    var errDiv = document.createElement('div');
    errDiv.style.cssText = 'text-align:center;padding:48px 20px;color:var(--danger);';
    errDiv.textContent = 'Error al cargar envios T1: ' + err.message;
    listEl.appendChild(errDiv);
  }
}

// ==========================================
// T1 CARD (matches guia-card pattern)
// ==========================================

function createT1Card(shipment) {
  var status = guiasStatusDefs[shipment.status] || { bg: '#f3f4f6', color: '#374151', label: shipment.status || '?', dot: '#9ca3af' };
  var carrierName = shipment.carrier || 'T1 Envios';
  var carrierStyle = guiasCarrierStyles[carrierName] || T1_CARRIER_STYLE;
  var isSelected = shipment.id === guiasSelectedId;
  var location = [shipment.client_city, shipment.client_state].filter(Boolean).join(', ');
  var clientName = shipment.client_name || (shipment.order_id ? 'Pedido #' + shipment.order_id : 'Sin asignar');

  var card = document.createElement('div');
  card.className = 'guia-card' + (isSelected ? ' guia-card--active' : '');
  card.dataset.guiaId = 't1-' + shipment.id;
  card.onclick = function() { openT1Panel(shipment); };

  // Row 1: carrier | tracking | status
  var row1 = document.createElement('div');
  row1.className = 'guia-card__row1';

  var carrierDiv = document.createElement('div');
  carrierDiv.className = 'guia-card__carrier';

  var carrierIcon = document.createElement('span');
  carrierIcon.className = 'guia-card__carrier-icon';
  carrierIcon.style.background = carrierStyle.accent + '15';
  carrierIcon.style.color = carrierStyle.accent;
  carrierIcon.textContent = carrierStyle.icon;

  var carrierNameEl = document.createElement('span');
  carrierNameEl.className = 'guia-card__carrier-name';
  carrierNameEl.textContent = carrierName;

  carrierDiv.appendChild(carrierIcon);
  carrierDiv.appendChild(carrierNameEl);

  var trackingDiv = document.createElement('div');
  trackingDiv.className = 'guia-card__tracking';
  trackingDiv.textContent = shipment.tracking_number || '\u2014';

  var statusDiv = document.createElement('div');
  statusDiv.className = 'guia-card__status';
  statusDiv.style.background = status.bg;
  statusDiv.style.color = status.color;

  var statusDot = document.createElement('span');
  statusDot.className = 'guia-card__status-dot';
  statusDot.style.background = status.dot;
  statusDiv.appendChild(statusDot);
  statusDiv.appendChild(document.createTextNode(' ' + status.label));

  row1.appendChild(carrierDiv);
  row1.appendChild(trackingDiv);
  row1.appendChild(statusDiv);

  // Row 2: source badge | client · location | date
  var row2 = document.createElement('div');
  row2.className = 'guia-card__row2';

  var sourceSpan = document.createElement('span');
  sourceSpan.className = 'guia-card__service';
  sourceSpan.style.cssText = 'background:#0891b215;color:#0891b2;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:700;';
  sourceSpan.textContent = 'T1';

  var clientSpan = document.createElement('span');
  clientSpan.className = 'guia-card__client';
  clientSpan.textContent = clientName + (location ? ' \u00B7 ' + location : '');

  var dateSpan = document.createElement('span');
  dateSpan.className = 'guia-card__days';
  dateSpan.style.color = 'var(--gray-500)';
  dateSpan.textContent = shipment.created_at ? formatDateGuias(shipment.created_at) : '';

  row2.appendChild(sourceSpan);
  row2.appendChild(clientSpan);
  row2.appendChild(dateSpan);

  card.appendChild(row1);
  card.appendChild(row2);

  return card;
}

// ==========================================
// T1 DETAIL PANEL (reuses guias panel)
// ==========================================

function openT1Panel(shipment) {
  guiasSelectedId = 't1-' + shipment.id;

  // Highlight active card
  document.querySelectorAll('.guia-card').forEach(function(el) {
    el.classList.toggle('guia-card--active', el.dataset.guiaId === guiasSelectedId);
  });

  renderT1Panel(shipment);

  var panel = document.getElementById('guias-detail-panel');
  panel.classList.add('guias-panel--open');

  if (window.innerWidth < 768) {
    document.body.classList.add('guias-panel-mobile-open');
  }
}

function renderT1Panel(shipment) {
  var panel = document.getElementById('guias-panel-content');
  var carrierName = shipment.carrier || 'T1 Envios';
  var carrierStyle = guiasCarrierStyles[carrierName] || T1_CARRIER_STYLE;
  var location = [shipment.client_city, shipment.client_state].filter(Boolean).join(', ');
  var dateStr = formatDateGuias(shipment.created_at);

  panel.textContent = '';

  // Header
  var header = document.createElement('div');
  header.className = 'guias-panel__header';
  header.style.borderColor = carrierStyle.accent;

  var carrierRow = document.createElement('div');
  carrierRow.className = 'guias-panel__carrier';

  var cIcon = document.createElement('span');
  cIcon.className = 'guias-panel__carrier-icon';
  cIcon.style.background = carrierStyle.accent;
  cIcon.style.color = 'white';
  cIcon.textContent = carrierStyle.icon;

  var cInfo = document.createElement('div');
  var cName = document.createElement('div');
  cName.className = 'guias-panel__carrier-name';
  cName.textContent = carrierName;
  var cService = document.createElement('div');
  cService.className = 'guias-panel__carrier-service';
  cService.textContent = 'T1 Envios';
  cInfo.appendChild(cName);
  cInfo.appendChild(cService);
  carrierRow.appendChild(cIcon);
  carrierRow.appendChild(cInfo);
  header.appendChild(carrierRow);
  panel.appendChild(header);

  // Tracking section
  var trackSec = createPanelSection('TRACKING');
  var trackRow = document.createElement('div');
  trackRow.className = 'guias-panel__tracking-row';
  var trackCode = document.createElement('code');
  trackCode.className = 'guias-panel__tracking-code';
  trackCode.textContent = shipment.tracking_number || '\u2014';
  trackRow.appendChild(trackCode);

  if (shipment.tracking_number) {
    var copyBtn = document.createElement('button');
    copyBtn.className = 'guias-panel__copy-btn';
    copyBtn.title = 'Copiar';
    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    copyBtn.onclick = function(e) {
      e.stopPropagation();
      navigator.clipboard.writeText(shipment.tracking_number);
      guiasToast('Tracking copiado');
    };
    trackRow.appendChild(copyBtn);
  }
  trackSec.appendChild(trackRow);

  // T1 tracking link
  if (shipment.tracking_number) {
    var trackLink = document.createElement('a');
    trackLink.className = 'guias-panel__track-link';
    trackLink.href = 'https://t1envios.com/track/t?trackingnumber=' + encodeURIComponent(shipment.tracking_number);
    trackLink.target = '_blank';
    trackLink.rel = 'noopener';
    trackLink.textContent = 'Rastrear en T1 \u2192';
    trackLink.onclick = function(e) { e.stopPropagation(); };
    trackSec.appendChild(trackLink);
  }
  panel.appendChild(trackSec);

  // Client section
  var clientSec = createPanelSection('CLIENTE');
  var clientNameEl = document.createElement('div');
  clientNameEl.className = 'guias-panel__client-name';
  clientNameEl.textContent = shipment.client_name || 'Sin nombre';
  clientSec.appendChild(clientNameEl);
  if (location) {
    var clientLoc = document.createElement('div');
    clientLoc.className = 'guias-panel__client-location';
    clientLoc.textContent = location;
    clientSec.appendChild(clientLoc);
  }
  if (shipment.client_phone) {
    var clientPhone = document.createElement('div');
    clientPhone.className = 'guias-panel__client-location';
    clientPhone.textContent = '\u{1F4F1} ' + shipment.client_phone;
    clientSec.appendChild(clientPhone);
  }
  panel.appendChild(clientSec);

  // Order link (if linked)
  if (shipment.order_id) {
    var orderSec = createPanelSection('ORDEN');
    var orderLink = document.createElement('a');
    orderLink.className = 'guias-panel__order-link';
    orderLink.href = '#';
    orderLink.textContent = shipment.order_number || '#' + shipment.order_id;
    orderLink.onclick = function(e) {
      e.stopPropagation();
      e.preventDefault();
      closeGuiasPanel();
      if (typeof viewOrder === 'function') viewOrder(shipment.order_id);
    };
    orderSec.appendChild(orderLink);
    panel.appendChild(orderSec);
  }

  // Date + Source grid
  var grid = document.createElement('div');
  grid.className = 'guias-panel__grid2';

  var dateCol = document.createElement('div');
  var dateLabel = document.createElement('div');
  dateLabel.className = 'guias-panel__label';
  dateLabel.textContent = 'FECHA';
  var dateVal = document.createElement('div');
  dateVal.className = 'guias-panel__value';
  dateVal.textContent = dateStr;
  dateCol.appendChild(dateLabel);
  dateCol.appendChild(dateVal);

  var sourceCol = document.createElement('div');
  var sourceLabel = document.createElement('div');
  sourceLabel.className = 'guias-panel__label';
  sourceLabel.textContent = 'PLATAFORMA';
  var sourceVal = document.createElement('div');
  sourceVal.className = 'guias-panel__value';
  sourceVal.style.color = '#0891b2';
  sourceVal.style.fontWeight = '700';
  sourceVal.textContent = 'T1 Envios';
  sourceCol.appendChild(sourceLabel);
  sourceCol.appendChild(sourceVal);

  grid.appendChild(dateCol);
  grid.appendChild(sourceCol);
  panel.appendChild(grid);

  // Actions
  var actionsDiv = document.createElement('div');
  actionsDiv.className = 'guias-panel__actions';

  // Open in T1
  var t1Link = document.createElement('a');
  t1Link.className = 'guias-panel__action-btn guias-panel__action-btn--pdf';
  t1Link.href = 'https://shipping.t1.com/?store=208742';
  t1Link.target = '_blank';
  t1Link.rel = 'noopener';
  t1Link.onclick = function(e) { e.stopPropagation(); };
  t1Link.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  t1Link.appendChild(document.createTextNode(' Abrir T1'));
  actionsDiv.appendChild(t1Link);

  // Refresh tracking
  var refreshBtn = document.createElement('button');
  refreshBtn.className = 'guias-panel__action-btn guias-panel__action-btn--refresh';
  refreshBtn.onclick = function(e) {
    e.stopPropagation();
    t1RefreshAndReload();
  };
  refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>';
  refreshBtn.appendChild(document.createTextNode(' Actualizar'));
  actionsDiv.appendChild(refreshBtn);

  panel.appendChild(actionsDiv);
}

// ==========================================
// LINK TRACKING MODAL
// ==========================================

function t1OpenLinkModal(trackingNumber) {
  var modal = document.getElementById('t1-link-modal');
  document.getElementById('t1-link-tracking-number').value = trackingNumber || '';
  document.getElementById('t1-link-tracking-display').value = trackingNumber || '';
  document.getElementById('t1-link-order-id').value = '';
  document.getElementById('t1-link-client-id').value = '';
  document.getElementById('t1-link-carrier').value = '';
  modal.classList.remove('hidden');
}

function t1CloseLinkModal() {
  document.getElementById('t1-link-modal').classList.add('hidden');
}

async function t1LinkTrackingSubmit(event) {
  event.preventDefault();

  var trackingNumber = document.getElementById('t1-link-tracking-display').value.trim();
  var orderId = document.getElementById('t1-link-order-id').value || null;
  var clientId = document.getElementById('t1-link-client-id').value || null;
  var carrier = document.getElementById('t1-link-carrier').value || null;

  if (!trackingNumber) {
    guiasToast('Ingresa un numero de tracking', 'error');
    return;
  }

  try {
    var token = localStorage.getItem('adminToken');
    var resp = await fetch(T1_API_URL + '/tracking/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      body: JSON.stringify({
        trackingNumber: trackingNumber,
        orderId: orderId ? parseInt(orderId) : null,
        clientId: clientId ? parseInt(clientId) : null,
        carrier: carrier
      })
    });

    var data = await resp.json();

    if (data.success) {
      guiasToast('Tracking ' + trackingNumber + ' vinculado');
      t1CloseLinkModal();
      // Reload T1 guías if we're on the T1 tab
      if (guiasCurrentStatus === 't1') {
        loadT1Guias();
      }
    } else {
      guiasToast(data.error || 'Error al vincular', 'error');
    }
  } catch (err) {
    console.error('T1 link error:', err);
    guiasToast('Error de conexion', 'error');
  }
}

// ==========================================
// REFRESH
// ==========================================

async function t1RefreshAndReload() {
  try {
    var token = localStorage.getItem('adminToken');
    await fetch(T1_API_URL + '/tracking/refresh', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
  } catch (e) { /* ignore */ }

  t1ShipmentsLoaded = false;
  if (guiasCurrentStatus === 't1') {
    loadT1Guias();
  }
  guiasToast('Datos T1 actualizados', 'info');
}

// ==========================================
// LOAD T1 COUNT ON INIT
// Fetch count badge even when not on T1 tab
// ==========================================

async function t1LoadCount() {
  try {
    var token = localStorage.getItem('adminToken');
    var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    var resp = await fetch(T1_API_URL + '/shipments?limit=1', { headers: headers });
    var data = await resp.json();
    var countEl = document.getElementById('guias-count-t1');
    if (countEl) countEl.textContent = data.total || 0;
  } catch (e) { /* silent */ }
}

// Patch initGuiasView to also load T1 count
var _originalInitGuias = window.initGuiasView;
window.initGuiasView = function() {
  _originalInitGuias();
  t1LoadCount();
};

// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.t1OpenLinkModal = t1OpenLinkModal;
window.t1CloseLinkModal = t1CloseLinkModal;
window.t1LinkTrackingSubmit = t1LinkTrackingSubmit;
window.t1RefreshAndReload = t1RefreshAndReload;
window.loadT1Guias = loadT1Guias;

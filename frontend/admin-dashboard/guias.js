/**
 * Guias Management Module — Redesigned
 * Card-based list with slide-in detail panel
 */

// State
let guiasData = [];
let guiasCurrentPage = 1;
let guiasTotalPages = 1;
let guiasCurrentStatus = 'all';
let guiasSearchQuery = '';
let guiasSelectedId = null;
let guiasStats = {};
let guiasSelectedForPrint = new Set();
let guiasDateFilter = null;

// API URL
const GUIAS_API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api/shipping'
  : 'https://vt-souvenir-backend.onrender.com/api/shipping';

// Authenticated fetch helper
function guiasFetch(url, opts) {
  opts = opts || {};
  var token = localStorage.getItem('admin_token');
  if (token) {
    opts.headers = Object.assign({ 'Authorization': 'Bearer ' + token }, opts.headers || {});
  }
  return fetch(url, opts);
}

// Carrier visual config
const guiasCarrierStyles = {
  'Estafeta':      { icon: '\u{1F4E6}', accent: '#f59e0b' },
  'Paquetexpress': { icon: '\u{1F69B}', accent: '#10b981' },
  'FedEx':         { icon: '\u2708\uFE0F', accent: '#6366f1' },
  'DHL':           { icon: '\u{1F7E1}', accent: '#ef4444' },
  'UPS':           { icon: '\u{1F4EC}', accent: '#d97706' },
  'Redpack':       { icon: '\u{1F4EE}', accent: '#8b5cf6' },
};

// Status definitions
const guiasStatusDefs = {
  'pending':         { bg: '#fef3c7', color: '#92400e', label: 'Pendiente',  dot: '#f59e0b' },
  'processing':      { bg: '#dbeafe', color: '#1e40af', label: 'Procesando', dot: '#3b82f6' },
  'label_generated': { bg: '#d1fae5', color: '#065f46', label: 'Generada',   dot: '#10b981' },
  'shipped':         { bg: '#e0e7ff', color: '#3730a3', label: 'Enviada',    dot: '#6366f1' },
  'delivered':       { bg: '#bbf7d0', color: '#166534', label: 'Entregada',  dot: '#22c55e' },
  'cancelled':       { bg: '#fee2e2', color: '#991b1b', label: 'Cancelada',  dot: '#ef4444' },
};

/**
 * Toast notification (replaces alert)
 * Note: uses textContent for safe rendering — no HTML injection risk
 */
function guiasToast(message, type) {
  type = type || 'success';
  var existing = document.querySelector('.guias-toast');
  if (existing) existing.remove();

  var colors = {
    success: { bg: '#065f46', border: '#10b981' },
    error:   { bg: '#991b1b', border: '#ef4444' },
    info:    { bg: '#1e40af', border: '#3b82f6' },
  };
  var c = colors[type] || colors.info;

  var toast = document.createElement('div');
  toast.className = 'guias-toast';
  toast.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);' +
    'background:' + c.bg + ';color:white;padding:12px 24px;border-radius:10px;' +
    'font-size:14px;font-weight:600;z-index:10000;opacity:0;' +
    'border-left:4px solid ' + c.border + ';box-shadow:0 8px 24px rgba(0,0,0,0.25);' +
    'transition:all 0.3s cubic-bezier(0.16,1,0.3,1);max-width:400px;text-align:center;';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(function() {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2800);
}

/**
 * Initialize guias view
 */
async function initGuiasView() {
  // Load guías immediately, refresh tracking in background
  loadGuias();
  guiasFetch(GUIAS_API_URL + '/refresh-pending-tracking', { method: 'POST' }).catch(function() {});
}

/**
 * Load guias from API
 */
async function loadGuias(page) {
  page = page || 1;
  guiasCurrentPage = page;

  var listEl = document.getElementById('guias-card-list');
  var emptyEl = document.getElementById('guias-empty-state');

  // Loading skeleton
  var skeletons = '';
  for (var i = 0; i < 6; i++) {
    skeletons += '<div class="guia-card-skeleton"><div class="skel-line skel-w60"></div><div class="skel-line skel-w40"></div></div>';
  }
  listEl.innerHTML = skeletons;
  emptyEl.classList.add('hidden');

  try {
    var params = new URLSearchParams({ page: page, limit: 50 });
    if (guiasCurrentStatus && guiasCurrentStatus !== 'all') params.append('status', guiasCurrentStatus);
    if (guiasSearchQuery) params.append('search', guiasSearchQuery);
    if (guiasDateFilter) {
      params.append('startDate', guiasDateFilter.startDate);
      params.append('endDate', guiasDateFilter.endDate);
    }

    var response = await guiasFetch(GUIAS_API_URL + '/labels?' + params);
    var result = await response.json();

    if (!result.success) throw new Error(result.error || 'Error loading guias');

    guiasData = result.labels;
    guiasTotalPages = result.pagination.totalPages;
    guiasStats = result.stats || {};

    updateGuiasFilterCounts(result.stats);
    renderGuiasList();
    updateGuiasPagination(result.pagination);

    // If panel is open, refresh its data
    if (guiasSelectedId) {
      var fresh = guiasData.find(function(g) { return g.id === guiasSelectedId; });
      if (fresh) renderGuiasPanel(fresh);
    }

  } catch (error) {
    console.error('Error loading guias:', error);
    listEl.textContent = '';
    var errDiv = document.createElement('div');
    errDiv.style.cssText = 'text-align:center;padding:48px 20px;color:var(--danger);';
    errDiv.textContent = 'Error al cargar guias: ' + error.message;
    listEl.appendChild(errDiv);
  }
}

/**
 * Update filter chip counts
 */
function updateGuiasFilterCounts(stats) {
  if (!stats) return;
  var el;
  el = document.getElementById('guias-count-all');
  if (el) el.textContent = stats.total_labels || 0;
  el = document.getElementById('guias-count-generated');
  if (el) el.textContent = stats.generated || 0;
  el = document.getElementById('guias-count-shipped');
  if (el) el.textContent = stats.shipped || 0;
  el = document.getElementById('guias-count-delivered');
  if (el) el.textContent = stats.delivered || 0;
}

/**
 * Render the card-based list
 * Note: All user-generated content (names, cities, etc.) is escaped via textContent
 * in the createGuiaCard helper to prevent XSS.
 */
function renderGuiasList() {
  var listEl = document.getElementById('guias-card-list');
  var emptyEl = document.getElementById('guias-empty-state');

  if (guiasData.length === 0) {
    listEl.textContent = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.textContent = '';

  // Group by tracking number to collapse multilabels
  var groups = {};
  var order = [];
  guiasData.forEach(function(guia) {
    var key = guia.tracking_number || ('solo_' + guia.id);
    if (!groups[key]) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(guia);
  });

  order.forEach(function(key) {
    var group = groups[key];
    if (group.length === 1) {
      // Single label — render normally
      listEl.appendChild(createGuiaCard(group[0]));
    } else {
      // Multilabel — render first as main, add toggle for rest
      var wrapper = document.createElement('div');
      wrapper.className = 'guia-multilabel-group';

      var mainCard = createGuiaCard(group[0]);
      // Add multilabel badge
      var badge = document.createElement('span');
      badge.className = 'guia-multilabel-badge';
      badge.textContent = group.length + ' guias';
      var row1 = mainCard.querySelector('.guia-card__row1');
      if (row1) row1.appendChild(badge);

      // Toggle button
      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'guia-multilabel-toggle';
      toggleBtn.textContent = 'Ver ' + (group.length - 1) + ' mas \u25BC';
      toggleBtn.onclick = function(e) {
        e.stopPropagation();
        var hidden = wrapper.querySelector('.guia-multilabel-children');
        if (hidden.classList.contains('hidden')) {
          hidden.classList.remove('hidden');
          toggleBtn.textContent = 'Ocultar \u25B2';
        } else {
          hidden.classList.add('hidden');
          toggleBtn.textContent = 'Ver ' + (group.length - 1) + ' mas \u25BC';
        }
      };

      // Children container (hidden by default)
      var children = document.createElement('div');
      children.className = 'guia-multilabel-children hidden';
      for (var i = 1; i < group.length; i++) {
        children.appendChild(createGuiaCard(group[i]));
      }

      wrapper.appendChild(mainCard);
      wrapper.appendChild(toggleBtn);
      wrapper.appendChild(children);
      listEl.appendChild(wrapper);
    }
  });
}

/**
 * Create a single guia card element using safe DOM methods
 */
function createGuiaCard(guia) {
  var carrier = guiasCarrierStyles[guia.carrier] || { icon: '\u{1F4E6}', accent: '#6b7280' };
  var status = guiasStatusDefs[guia.status] || { bg: '#f3f4f6', color: '#374151', label: guia.status || '?', dot: '#9ca3af' };
  var isSelected = guia.id === guiasSelectedId;
  var daysNum = guia.delivery_days || 0;
  var daysColor = daysNum <= 2 ? 'var(--success)' : (daysNum >= 7 ? 'var(--danger)' : 'var(--gray-500)');
  var location = [guia.client_city, guia.client_state].filter(Boolean).join(', ');

  var card = document.createElement('div');
  card.className = 'guia-card' + (isSelected ? ' guia-card--active' : '');
  card.dataset.guiaId = guia.id;
  card.onclick = function() { openGuiaPanel(guia.id); };

  // Checkbox for print selection
  if (guia.label_url) {
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'guia-card__checkbox';
    checkbox.checked = guiasSelectedForPrint.has(guia.id);
    checkbox.onclick = function(e) {
      e.stopPropagation();
      if (this.checked) {
        guiasSelectedForPrint.add(guia.id);
      } else {
        guiasSelectedForPrint.delete(guia.id);
      }
      updatePrintToolbar();
    };
    card.appendChild(checkbox);
    card.classList.add('guia-card--selectable');
  }

  // Row 1
  var row1 = document.createElement('div');
  row1.className = 'guia-card__row1';

  var carrierDiv = document.createElement('div');
  carrierDiv.className = 'guia-card__carrier';

  var carrierIcon = document.createElement('span');
  carrierIcon.className = 'guia-card__carrier-icon';
  carrierIcon.style.background = carrier.accent + '15';
  carrierIcon.style.color = carrier.accent;
  carrierIcon.textContent = carrier.icon;

  var carrierName = document.createElement('span');
  carrierName.className = 'guia-card__carrier-name';
  carrierName.textContent = guia.carrier || 'N/A';

  var carrierDate = document.createElement('span');
  carrierDate.className = 'guia-card__carrier-date';
  carrierDate.textContent = guia.created_at ? formatDateGuias(guia.created_at) : '';

  var carrierInfo = document.createElement('div');
  carrierInfo.className = 'guia-card__carrier-info';
  carrierInfo.appendChild(carrierName);
  carrierInfo.appendChild(carrierDate);

  carrierDiv.appendChild(carrierIcon);
  carrierDiv.appendChild(carrierInfo);

  var trackingDiv = document.createElement('div');
  trackingDiv.className = 'guia-card__tracking';
  trackingDiv.textContent = guia.tracking_number || '\u2014';

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

  // Row 2
  var row2 = document.createElement('div');
  row2.className = 'guia-card__row2';

  var serviceSpan = document.createElement('span');
  serviceSpan.className = 'guia-card__service';
  serviceSpan.textContent = guia.service || '';

  var clientSpan = document.createElement('span');
  clientSpan.className = 'guia-card__client';
  clientSpan.textContent = (guia.client_name || 'Sin nombre') + (location ? ' \u00B7 ' + location : '');

  var daysSpan = document.createElement('span');
  daysSpan.className = 'guia-card__days';
  daysSpan.style.color = daysColor;
  daysSpan.textContent = (guia.delivery_days || '?') + 'd';

  row2.appendChild(serviceSpan);
  row2.appendChild(clientSpan);
  row2.appendChild(daysSpan);

  // Row 3 — extra details
  var row3 = document.createElement('div');
  row3.className = 'guia-card__row3';

  var costVal = parseFloat(guia.shipping_cost || guia.t1_shipping_cost || 0);
  if (costVal > 0) {
    var costSpan = document.createElement('span');
    costSpan.className = 'guia-card__cost';
    costSpan.textContent = '$' + costVal.toFixed(2);
    row3.appendChild(costSpan);
  }

  if (guia.weight && parseFloat(guia.weight) > 0) {
    var dimsSpan = document.createElement('span');
    dimsSpan.className = 'guia-card__dims';
    var dimsParts = [parseFloat(guia.weight) + 'kg'];
    if (guia.length && guia.width && guia.height) {
      dimsParts.push(guia.length + '\u00D7' + guia.width + '\u00D7' + guia.height + 'cm');
    }
    dimsSpan.textContent = dimsParts.join(' \u00B7 ');
    row3.appendChild(dimsSpan);
  }

  if (guia.order_number && guia.order_number !== 'Sin pedido') {
    var orderSpan = document.createElement('span');
    orderSpan.className = 'guia-card__order';
    orderSpan.textContent = guia.order_number;
    row3.appendChild(orderSpan);
  }

  if (guia.client_phone) {
    var phoneSpan = document.createElement('span');
    phoneSpan.className = 'guia-card__phone';
    phoneSpan.textContent = guia.client_phone;
    row3.appendChild(phoneSpan);
  }

  card.appendChild(row1);
  card.appendChild(row2);
  if (row3.childNodes.length > 0) {
    card.appendChild(row3);
  }

  return card;
}

/**
 * Open the detail panel for a guia
 */
function openGuiaPanel(guiaId) {
  var guia = guiasData.find(function(g) { return g.id === guiaId; });
  if (!guia) return;

  guiasSelectedId = guiaId;

  // Highlight active card
  document.querySelectorAll('.guia-card').forEach(function(el) {
    el.classList.toggle('guia-card--active', Number(el.dataset.guiaId) === guiaId);
  });

  renderGuiasPanel(guia);

  var panel = document.getElementById('guias-detail-panel');
  panel.classList.add('guias-panel--open');

  // On mobile, prevent body scroll
  if (window.innerWidth < 768) {
    document.body.classList.add('guias-panel-mobile-open');
  }
}

/**
 * Close the detail panel
 */
function closeGuiasPanel() {
  guiasSelectedId = null;
  var panel = document.getElementById('guias-detail-panel');
  panel.classList.remove('guias-panel--open');
  document.body.classList.remove('guias-panel-mobile-open');

  document.querySelectorAll('.guia-card').forEach(function(el) {
    el.classList.remove('guia-card--active');
  });
}

/**
 * Render detail panel content using safe DOM construction
 */
function renderGuiasPanel(guia) {
  var panel = document.getElementById('guias-panel-content');
  var carrier = guiasCarrierStyles[guia.carrier] || { icon: '\u{1F4E6}', accent: '#6b7280' };
  var location = [guia.client_city, guia.client_state].filter(Boolean).join(', ');
  var dateStr = formatDateGuias(guia.created_at);
  var daysNum = guia.delivery_days || 0;
  var daysColor = daysNum <= 2 ? 'var(--success)' : (daysNum >= 7 ? 'var(--danger)' : 'var(--gray-600)');

  panel.textContent = '';

  // --- Header ---
  var header = document.createElement('div');
  header.className = 'guias-panel__header';
  header.style.borderColor = carrier.accent;

  var carrierRow = document.createElement('div');
  carrierRow.className = 'guias-panel__carrier';

  var cIcon = document.createElement('span');
  cIcon.className = 'guias-panel__carrier-icon';
  cIcon.style.background = carrier.accent;
  cIcon.style.color = 'white';
  cIcon.textContent = carrier.icon;

  var cInfo = document.createElement('div');
  var cName = document.createElement('div');
  cName.className = 'guias-panel__carrier-name';
  cName.textContent = guia.carrier || 'N/A';
  var cService = document.createElement('div');
  cService.className = 'guias-panel__carrier-service';
  cService.textContent = guia.service || 'Servicio estandar';
  cInfo.appendChild(cName);
  cInfo.appendChild(cService);

  carrierRow.appendChild(cIcon);
  carrierRow.appendChild(cInfo);
  header.appendChild(carrierRow);
  panel.appendChild(header);

  // --- Tracking section ---
  var trackSec = createPanelSection('TRACKING');
  var trackRow = document.createElement('div');
  trackRow.className = 'guias-panel__tracking-row';
  var trackCode = document.createElement('code');
  trackCode.className = 'guias-panel__tracking-code';
  trackCode.textContent = guia.tracking_number || '\u2014';
  trackRow.appendChild(trackCode);

  if (guia.tracking_number) {
    var copyBtn = document.createElement('button');
    copyBtn.className = 'guias-panel__copy-btn';
    copyBtn.title = 'Copiar';
    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    copyBtn.onclick = function(e) {
      e.stopPropagation();
      navigator.clipboard.writeText(guia.tracking_number);
      guiasToast('Tracking copiado');
    };
    trackRow.appendChild(copyBtn);
  }
  trackSec.appendChild(trackRow);

  if (guia.tracking_url) {
    var trackLink = document.createElement('a');
    trackLink.className = 'guias-panel__track-link';
    trackLink.href = guia.tracking_url;
    trackLink.target = '_blank';
    trackLink.rel = 'noopener';
    trackLink.textContent = 'Rastrear envio \u2192';
    trackLink.onclick = function(e) { e.stopPropagation(); };
    trackSec.appendChild(trackLink);
  }
  panel.appendChild(trackSec);

  // --- Client section ---
  var clientSec = createPanelSection('CLIENTE');
  var clientName = document.createElement('div');
  clientName.className = 'guias-panel__client-name';
  clientName.textContent = guia.client_name || 'Sin nombre';
  clientSec.appendChild(clientName);
  if (location) {
    var clientLoc = document.createElement('div');
    clientLoc.className = 'guias-panel__client-location';
    clientLoc.textContent = location;
    clientSec.appendChild(clientLoc);
  }
  panel.appendChild(clientSec);

  // --- Order section ---
  var orderSec = createPanelSection('ORDEN');
  var orderLink = document.createElement('a');
  orderLink.className = 'guias-panel__order-link';
  orderLink.href = '#';
  orderLink.textContent = guia.order_number || '#' + guia.order_id;
  orderLink.innerHTML = orderLink.textContent + ' <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>';
  orderLink.onclick = function(e) {
    e.stopPropagation();
    e.preventDefault();
    closeGuiasPanel();
    viewOrder(guia.order_id);
  };
  orderSec.appendChild(orderLink);
  panel.appendChild(orderSec);

  // --- Date + Days grid ---
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

  var daysCol = document.createElement('div');
  var daysLabel = document.createElement('div');
  daysLabel.className = 'guias-panel__label';
  daysLabel.textContent = 'DIAS EN TRANSITO';
  var daysVal = document.createElement('div');
  daysVal.className = 'guias-panel__value';
  daysVal.style.color = daysColor;
  daysVal.style.fontWeight = '700';
  daysVal.textContent = (guia.delivery_days || '?') + ' dias';
  daysCol.appendChild(daysLabel);
  daysCol.appendChild(daysVal);

  grid.appendChild(dateCol);
  grid.appendChild(daysCol);
  panel.appendChild(grid);

  // --- Status dropdown ---
  var statusSec = createPanelSection('ESTADO');
  var select = document.createElement('select');
  select.className = 'guias-panel__status-select';
  select.id = 'guias-panel-status';
  select.onclick = function(e) { e.stopPropagation(); };
  select.onchange = function() { handleGuiaPanelStatusChange(guia.id, select.value); };

  Object.keys(guiasStatusDefs).forEach(function(key) {
    var opt = document.createElement('option');
    opt.value = key;
    opt.textContent = guiasStatusDefs[key].label;
    if (key === guia.status) opt.selected = true;
    select.appendChild(opt);
  });
  statusSec.appendChild(select);
  panel.appendChild(statusSec);

  // --- Actions ---
  var actionsDiv = document.createElement('div');
  actionsDiv.className = 'guias-panel__actions';

  if (guia.label_url) {
    var pdfLink = document.createElement('a');
    pdfLink.className = 'guias-panel__action-btn guias-panel__action-btn--pdf';
    pdfLink.href = guia.label_url;
    pdfLink.target = '_blank';
    pdfLink.rel = 'noopener';
    pdfLink.onclick = function(e) { e.stopPropagation(); };
    pdfLink.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    pdfLink.appendChild(document.createTextNode(' Descargar PDF'));
    actionsDiv.appendChild(pdfLink);
  }

  var refreshBtn = document.createElement('button');
  refreshBtn.className = 'guias-panel__action-btn guias-panel__action-btn--refresh';
  refreshBtn.onclick = function(e) { e.stopPropagation(); handleGuiaPanelRefresh(guia.id); };
  refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>';
  refreshBtn.appendChild(document.createTextNode(' Actualizar tracking'));
  actionsDiv.appendChild(refreshBtn);

  panel.appendChild(actionsDiv);
}

/** Helper: create a panel section with label */
function createPanelSection(labelText) {
  var sec = document.createElement('div');
  sec.className = 'guias-panel__section';
  var label = document.createElement('div');
  label.className = 'guias-panel__label';
  label.textContent = labelText;
  sec.appendChild(label);
  return sec;
}

/**
 * Handle status change from panel dropdown
 */
async function handleGuiaPanelStatusChange(guiaId, newStatus) {
  try {
    var response = await guiasFetch(GUIAS_API_URL + '/labels/' + guiaId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    var result = await response.json();
    if (!result.success) throw new Error(result.error || 'Error');
    guiasToast('Estado actualizado');
    loadGuias(guiasCurrentPage);
  } catch (error) {
    guiasToast('Error: ' + error.message, 'error');
  }
}

/**
 * Handle tracking refresh from panel
 */
async function handleGuiaPanelRefresh(guiaId) {
  var btn = document.querySelector('.guias-panel__action-btn--refresh');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  try {
    var response = await guiasFetch(GUIAS_API_URL + '/labels/' + guiaId + '/refresh', { method: 'POST' });
    var result = await response.json();
    if (!result.success) throw new Error(result.error || 'Error');
    guiasToast('Tracking actualizado');
    loadGuias(guiasCurrentPage);
  } catch (error) {
    guiasToast('Error: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

/**
 * Format date for guias
 */
function formatDateGuias(dateStr) {
  if (!dateStr) return 'N/A';
  var date = new Date(dateStr);
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Update pagination
 */
function updateGuiasPagination(pagination) {
  var prevBtn = document.getElementById('guias-prev-page-btn');
  var nextBtn = document.getElementById('guias-next-page-btn');
  var info = document.getElementById('guias-pagination-info');
  if (!prevBtn) return;

  prevBtn.disabled = pagination.page <= 1;
  nextBtn.disabled = pagination.page >= pagination.totalPages;
  info.textContent = pagination.page + ' / ' + pagination.totalPages;
}

function goToGuiasPage(direction) {
  if (direction === 'prev' && guiasCurrentPage > 1) loadGuias(guiasCurrentPage - 1);
  else if (direction === 'next' && guiasCurrentPage < guiasTotalPages) loadGuias(guiasCurrentPage + 1);
}

/**
 * Filter by status
 */
function filterGuiasByStatus(status) {
  guiasCurrentStatus = status;
  document.querySelectorAll('.guias-filter-chip').forEach(function(btn) {
    btn.classList.toggle('guias-filter-chip--active', btn.dataset.status === status);
  });
  closeGuiasPanel();
  loadGuias(1);
}

/**
 * Search handler
 */
var guiasSearchTimeout;
function handleGuiasSearch(query) {
  clearTimeout(guiasSearchTimeout);
  var clearBtn = document.getElementById('guias-search-clear');
  if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';
  guiasSearchTimeout = setTimeout(function() { guiasSearchQuery = query; loadGuias(1); }, 300);
}

function clearGuiasSearch() {
  var input = document.getElementById('guias-search-input');
  if (input) input.value = '';
  var clearBtn = document.getElementById('guias-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  guiasSearchQuery = '';
  loadGuias(1);
}

/**
 * Refresh guias
 */
async function refreshGuias() {
  var btn = document.getElementById('guias-refresh-btn');
  if (btn) { btn.classList.add('guias-spinning'); btn.disabled = true; }

  try {
    var response = await guiasFetch(GUIAS_API_URL + '/refresh-pending-tracking', { method: 'POST' });
    if (response.ok) {
      var data = await response.json();
      if (data.updated > 0) guiasToast(data.updated + ' guias actualizadas', 'info');
    }
  } catch (err) { /* silent */ }

  loadGuias(guiasCurrentPage);
  setTimeout(function() {
    if (btn) { btn.classList.remove('guias-spinning'); btn.disabled = false; }
  }, 600);
}

/**
 * Export to CSV
 */
function exportGuiasCSV() {
  if (guiasData.length === 0) { guiasToast('No hay datos para exportar', 'error'); return; }

  var headers = ['Orden', 'Cliente', 'Tracking', 'Paqueteria', 'Servicio', 'Dias', 'Estado', 'Fecha', 'URL Rastreo', 'URL PDF'];
  var rows = guiasData.map(function(g) {
    return [
      g.order_number || g.order_id, g.client_name || '', g.tracking_number || '',
      g.carrier || '', g.service || '', g.delivery_days || '', g.status || '',
      formatDateGuias(g.created_at), g.tracking_url || '', g.label_url || ''
    ];
  });
  var csv = [headers.join(',')].concat(rows.map(function(r) {
    return r.map(function(v) { return '"' + v + '"'; }).join(',');
  })).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'guias_' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
  guiasToast('CSV descargado');
}

/**
 * Print selection helpers
 */
function toggleSelectAllGuias() {
  var printable = guiasData.filter(function(g) { return g.label_url; });
  var allSelected = printable.length > 0 && printable.every(function(g) { return guiasSelectedForPrint.has(g.id); });

  if (allSelected) {
    guiasSelectedForPrint.clear();
  } else {
    printable.forEach(function(g) { guiasSelectedForPrint.add(g.id); });
  }

  renderGuiasList();
  updatePrintToolbar();
}

function updatePrintToolbar() {
  var count = guiasSelectedForPrint.size;
  var counterEl = document.getElementById('guias-print-count');
  var printBtn = document.getElementById('guias-print-btn');
  var selectAllCb = document.getElementById('guias-select-all');

  if (counterEl) counterEl.textContent = count > 0 ? count + ' seleccionada' + (count > 1 ? 's' : '') : '';
  if (printBtn) printBtn.disabled = count === 0;

  if (selectAllCb) {
    var printable = guiasData.filter(function(g) { return g.label_url; });
    selectAllCb.checked = printable.length > 0 && printable.every(function(g) { return guiasSelectedForPrint.has(g.id); });
    selectAllCb.indeterminate = count > 0 && !selectAllCb.checked;
  }
}

var PRINT_PROXY_URL = 'http://localhost:3001';
var printProxyAvailable = null; // null = unknown, true/false after check

async function checkPrintProxy() {
  try {
    var response = await fetch(PRINT_PROXY_URL + '/health', { signal: AbortSignal.timeout(2000) });
    var data = await response.json();
    printProxyAvailable = data.success === true;
  } catch (_) {
    printProxyAvailable = false;
  }
  return printProxyAvailable;
}

// Check lazily on first print attempt (avoids CORS console errors on load)

async function printSelectedGuias() {
  var ids = Array.from(guiasSelectedForPrint);
  if (ids.length === 0) return;

  var btn = document.getElementById('guias-print-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Imprimiendo...'; }

  try {
    // Check if local print proxy is running
    if (printProxyAvailable === null) await checkPrintProxy();

    if (printProxyAvailable) {
      // Collect label URLs from selected labels
      var urls = [];
      guiasData.forEach(function(g) {
        if (guiasSelectedForPrint.has(g.id) && g.label_url) urls.push(g.label_url);
      });

      if (urls.length === 0) throw new Error('No hay PDFs para imprimir');

      var response = await fetch(PRINT_PROXY_URL + '/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urls })
      });
      var result = await response.json();
    } else {
      // Fallback: try backend endpoint
      var response = await guiasFetch(GUIAS_API_URL + '/labels/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelIds: ids })
      });
      var result = await response.json();
    }

    if (!result.success) throw new Error(result.error || 'Error');

    var msg = result.printed + ' guía' + (result.printed > 1 ? 's' : '') + ' enviada' + (result.printed > 1 ? 's' : '') + ' a imprimir';
    if (result.failed > 0) msg += ' (' + result.failed + ' fallida' + (result.failed > 1 ? 's' : '') + ')';
    guiasToast(msg, result.failed > 0 ? 'error' : 'success');

    guiasSelectedForPrint.clear();
    renderGuiasList();
    updatePrintToolbar();
  } catch (error) {
    if (!printProxyAvailable) {
      guiasToast('Inicia el print proxy: node print-proxy.js', 'error');
    } else {
      guiasToast('Error al imprimir: ' + error.message, 'error');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Imprimir';
    }
  }
}

/**
 * Date quick-filters
 */
function setGuiasDateFilter(preset) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var start, end;

  if (preset === 'today') {
    start = end = today.toISOString().split('T')[0];
  } else if (preset === 'yesterday') {
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    start = end = yesterday.toISOString().split('T')[0];
  } else if (preset === 'week') {
    var weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    start = weekAgo.toISOString().split('T')[0];
    end = today.toISOString().split('T')[0];
  } else if (preset === 'clear') {
    guiasDateFilter = null;
    updateDateFilterChips(null);
    guiasSelectedForPrint.clear();
    loadGuias(1);
    updatePrintToolbar();
    return;
  }

  guiasDateFilter = { startDate: start, endDate: end };
  updateDateFilterChips(preset);
  guiasSelectedForPrint.clear();
  loadGuias(1);
  updatePrintToolbar();
}

function setGuiasCustomDateRange() {
  var startEl = document.getElementById('guias-date-start');
  var endEl = document.getElementById('guias-date-end');
  if (!startEl || !endEl || !startEl.value || !endEl.value) return;

  guiasDateFilter = { startDate: startEl.value, endDate: endEl.value };
  updateDateFilterChips('custom');
  guiasSelectedForPrint.clear();
  loadGuias(1);
  updatePrintToolbar();
}

function updateDateFilterChips(active) {
  document.querySelectorAll('.guias-date-chip').forEach(function(btn) {
    btn.classList.toggle('guias-date-chip--active', btn.dataset.date === active);
  });
  var rangeEl = document.getElementById('guias-date-range');
  if (rangeEl) rangeEl.classList.toggle('hidden', active !== 'custom');
}

// Inject dynamic styles
var guiasStyleSheet = document.createElement('style');
guiasStyleSheet.textContent =
  '@keyframes spin { to { transform: rotate(360deg); } }' +
  '@keyframes guiaSkelPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }' +
  '.guias-spinning svg, .guias-spinning { animation: spin 0.6s linear infinite; }' +
  '.guia-card--selectable { padding-left: 40px; position: relative; }' +
  '.guia-card__checkbox { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; cursor: pointer; accent-color: #e72a88; z-index: 2; }' +
  '.guias-print-toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 8px; margin-bottom: 8px; }' +
  '.guias-select-all-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--gray-600); cursor: pointer; }' +
  '.guias-select-all-label input { width: 18px; height: 18px; accent-color: #e72a88; cursor: pointer; }' +
  '.guias-print-count { font-size: 13px; color: var(--gray-500); flex: 1; }' +
  '.guias-print-btn { display: flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; background: #e72a88; color: white; transition: all 0.15s; }' +
  '.guias-print-btn:disabled { opacity: 0.4; cursor: not-allowed; }' +
  '.guias-print-btn:not(:disabled):hover { background: #c4216f; }' +
  '.guias-date-filters { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }' +
  '.guias-date-chip { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--gray-200); background: white; color: var(--gray-600); cursor: pointer; transition: all 0.15s; }' +
  '.guias-date-chip:hover { border-color: var(--gray-400); }' +
  '.guias-date-chip--active { background: #e72a88; color: white; border-color: #e72a88; }' +
  '.guias-date-chip--clear { border: none; background: none; color: var(--gray-400); font-size: 14px; padding: 4px 6px; }' +
  '.guias-date-range { display: flex; align-items: center; gap: 6px; margin-left: 4px; }' +
  '.guias-date-range input { padding: 3px 6px; border: 1px solid var(--gray-200); border-radius: 6px; font-size: 12px; }' +
  '.guias-date-apply { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #e72a88; color: white; border: none; cursor: pointer; }';
document.head.appendChild(guiasStyleSheet);

// Close panel on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && guiasSelectedId) closeGuiasPanel();
});

// Export functions
window.initGuiasView = initGuiasView;
window.loadGuias = loadGuias;
window.goToGuiasPage = goToGuiasPage;
window.filterGuiasByStatus = filterGuiasByStatus;
window.handleGuiasSearch = handleGuiasSearch;
window.clearGuiasSearch = clearGuiasSearch;
window.refreshGuias = refreshGuias;
window.updateGuiaStatus = handleGuiaPanelStatusChange;
window.refreshGuiaTracking = handleGuiaPanelRefresh;
window.exportGuiasCSV = exportGuiasCSV;
window.openGuiaPanel = openGuiaPanel;
window.closeGuiasPanel = closeGuiasPanel;
window.handleGuiaPanelStatusChange = handleGuiaPanelStatusChange;
window.handleGuiaPanelRefresh = handleGuiaPanelRefresh;
window.toggleSelectAllGuias = toggleSelectAllGuias;
window.updatePrintToolbar = updatePrintToolbar;
window.printSelectedGuias = printSelectedGuias;
window.setGuiasDateFilter = setGuiasDateFilter;
window.setGuiasCustomDateRange = setGuiasCustomDateRange;
window.updateDateFilterChips = updateDateFilterChips;

// ==========================================
// PICKUPS MODAL FUNCTIONALITY
// ==========================================

var pickupsCurrentDate = new Date().toISOString().split('T')[0];
var pickupsInitialized = false;

function initPickupsView() {
  if (pickupsInitialized) {
    loadPickupsForDate(pickupsCurrentDate);
    return;
  }
  var dateInput = document.getElementById('pickups-date-input');
  if (dateInput) dateInput.value = pickupsCurrentDate;
  loadPickupsForDate(pickupsCurrentDate);
  pickupsInitialized = true;
}

function changePickupDate(days) {
  var dateInput = document.getElementById('pickups-date-input');
  var currentDate = new Date(dateInput.value);
  currentDate.setDate(currentDate.getDate() + days);
  dateInput.value = currentDate.toISOString().split('T')[0];
  pickupsCurrentDate = dateInput.value;
  loadPickupsForDate(dateInput.value);
}

async function loadPickupsForDate(date) {
  var loadingEl = document.getElementById('pickups-loading');
  var contentEl = document.getElementById('pickups-content');
  var emptyEl = document.getElementById('pickups-empty');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  emptyEl.classList.add('hidden');

  try {
    var responses = await Promise.all([
      guiasFetch(GUIAS_API_URL + '/pickups/history?date=' + date),
      guiasFetch(GUIAS_API_URL + '/pickups/pending')
    ]);

    var pickupsResult = await responses[0].json();
    var pendingResult = await responses[1].json();

    loadingEl.classList.add('hidden');

    var pickups = pickupsResult.success ? pickupsResult.pickups : [];
    var pendingLabels = pendingResult.success ? pendingResult.pending : [];
    var activePickups = pickups.filter(function(p) { return p.status !== 'cancelled'; });

    document.getElementById('pickups-total-count').textContent = activePickups.length;
    document.getElementById('pickups-pending-count').textContent = pendingLabels.length;
    document.getElementById('pickups-shipments-count').textContent =
      activePickups.reduce(function(sum, p) { return sum + (p.shipment_count || 0); }, 0);

    if (activePickups.length === 0 && pendingLabels.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    contentEl.classList.remove('hidden');

    var tableEl = document.getElementById('pickups-table');
    var scheduledEmptyEl = document.getElementById('pickups-scheduled-empty');

    if (activePickups.length === 0) {
      tableEl.innerHTML = '';
      scheduledEmptyEl.classList.remove('hidden');
    } else {
      scheduledEmptyEl.classList.add('hidden');
      tableEl.innerHTML = activePickups.map(function(p) { return renderPickupRow(p); }).join('');
    }

    var pendingList = document.getElementById('pending-carriers-list');
    var pendingEmptyEl = document.getElementById('pickups-pending-empty');

    if (pendingLabels.length === 0) {
      pendingList.innerHTML = '';
      pendingEmptyEl.classList.remove('hidden');
    } else {
      pendingEmptyEl.classList.add('hidden');
      pendingList.innerHTML = renderPendingLabelsSection(pendingLabels);
    }

  } catch (error) {
    console.error('Error loading pickups:', error);
    loadingEl.classList.add('hidden');
    document.getElementById('pickups-content').classList.remove('hidden');
    document.getElementById('pickups-table').textContent = 'Error al cargar recolecciones: ' + error.message;
  }
}

function renderPickupRow(pickup) {
  var carrier = pickup.carrier || 'Sin Asignar';
  var statusBadge = getPickupStatusBadgeClass(pickup.status);
  var timeFrom = pickup.pickup_time_from || '09:00';
  var timeTo = pickup.pickup_time_to || '18:00';
  var shipments = pickup.shipment_count || 0;
  var isCancelled = pickup.status === 'cancelled';
  var confirmationCode = pickup.confirmation_code || '';
  var isLocal = pickup.pickup_id && pickup.pickup_id.startsWith('local-');
  var pickupDateStr = pickup.pickup_date ? new Date(pickup.pickup_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '';

  return '<div class="pickup-row" data-carrier="' + carrier + '">' +
    '<div class="pickup-row-carrier">' +
      '<span class="pickup-carrier-icon">' + getCarrierIcon(carrier) + '</span>' +
      '<span class="pickup-carrier-name">' + carrier + '</span>' +
    '</div>' +
    '<span class="pickup-row-status" style="background:' + statusBadge.bg + ';color:' + statusBadge.color + ';">' +
      statusBadge.text + (isLocal && pickup.status !== 'confirmed' ? ' (local)' : '') +
    '</span>' +
    '<span class="pickup-row-date">' + pickupDateStr + '</span>' +
    '<span class="pickup-row-time">' + timeFrom + ' - ' + timeTo + '</span>' +
    '<span class="pickup-row-shipments">' + shipments + ' envio' + (shipments !== 1 ? 's' : '') + '</span>' +
    '<div class="pickup-row-confirmation">' +
      (confirmationCode
        ? '<span class="confirmation-code" title="Codigo de confirmacion">' + confirmationCode + '</span>'
        : '<input type="text" class="confirmation-code-input" placeholder="Codigo confirm." data-pickup-id="' + pickup.pickup_id + '" onkeydown="if(event.key===\'Enter\')saveConfirmationCode(\'' + pickup.pickup_id + '\',this.value)" ' + (isCancelled ? 'disabled' : '') + ' />') +
    '</div>' +
    '<div class="pickup-row-actions">' +
      (!confirmationCode && !isCancelled ? '<button class="pickup-confirm-btn" onclick="promptConfirmationCode(\'' + pickup.pickup_id + '\')" title="Confirmar con codigo">\u2713</button>' : '') +
      '<button class="pickup-cancel-btn" onclick="cancelPickup(\'' + pickup.pickup_id + '\')" title="Cancelar recoleccion" ' + (isCancelled ? 'disabled' : '') + '>\u2715</button>' +
    '</div>' +
  '</div>';
}

function getPickupStatusBadgeClass(status) {
  var badges = {
    'pending':   { bg: '#fef3c7', color: '#92400e', text: 'Pendiente' },
    'scheduled': { bg: '#e0e7ff', color: '#3730a3', text: 'Programado' },
    'requested': { bg: '#dbeafe', color: '#1e40af', text: 'Solicitado' },
    'confirmed': { bg: '#d1fae5', color: '#065f46', text: 'Confirmado' },
    'completed': { bg: '#bbf7d0', color: '#166534', text: 'Completado' },
    'cancelled': { bg: '#fee2e2', color: '#991b1b', text: 'Cancelado' }
  };
  return badges[status] || { bg: '#f3f4f6', color: '#374151', text: status || 'Desconocido' };
}

function renderPendingLabelsSection(pendingLabels) {
  var byCarrier = {};
  pendingLabels.forEach(function(label) {
    var carrier = label.carrier || 'Sin Asignar';
    if (!byCarrier[carrier]) byCarrier[carrier] = [];
    byCarrier[carrier].push(label);
  });

  return Object.entries(byCarrier).map(function(entry) {
    var carrier = entry[0];
    var labels = entry[1];
    return '<div class="pending-carrier-group">' +
      '<div class="pending-carrier-header" data-carrier="' + carrier + '">' +
        '<span>' + getCarrierIcon(carrier) + '</span>' +
        '<strong>' + carrier + '</strong>' +
        '<span class="carrier-count">' + labels.length + ' guia' + (labels.length !== 1 ? 's' : '') + '</span>' +
        '<button class="pending-request-btn" onclick="openPickupModal(\'' + carrier + '\')">Solicitar</button>' +
      '</div>' +
      '<div class="pending-labels-list">' +
        labels.map(function(label) {
          return '<div class="pending-label-item">' +
            '<span class="pending-label-order">' + (label.order_number || label.order_id || 'N/A') + '</span>' +
            '<span class="pending-label-tracking">' + (label.tracking_number || 'Sin tracking') + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }).join('');
}

function getCarrierIcon(carrier) {
  var icons = {
    'Estafeta': '\u{1F4E6}',
    'FedEx': '\u2708\uFE0F',
    'Paquetexpress': '\u{1F69B}',
    'DHL': '\u{1F7E1}',
    'UPS': '\u{1F4EC}',
    'Redpack': '\u{1F4EE}'
  };
  return icons[carrier] || '\u{1F4E6}';
}

function formatPickupDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatPickupDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function triggerPendingPickups() {
  if (!confirm('\u00BFSolicitar recolecci\u00F3n para todas las gu\u00EDas pendientes?')) return;
  try {
    var response = await guiasFetch(GUIAS_API_URL + '/pickups/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerAll: true })
    });
    var result = await response.json();
    if (result.success) {
      var summary = (result.results || []).map(function(r) {
        return r.carrier + ': ' + (r.success ? '\u2705' : '\u274C') + ' ' + r.shipment_count + ' guias' + (r.local ? ' (local)' : '') + (r.error ? ' - ' + r.error : '');
      }).join('\n');
      alert('\u2705 Recolecciones procesadas!\n\n' + (summary || 'Sin resultados'));
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert('Error: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function cancelPickup(pickupId) {
  if (!pickupId || !confirm('\u00BFCancelar esta recolecci\u00F3n?')) return;
  try {
    var response = await guiasFetch(GUIAS_API_URL + '/pickups/' + pickupId, { method: 'DELETE' });
    var result = await response.json();
    if (result.success) {
      alert('Recolecci\u00F3n cancelada exitosamente');
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert('Error: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Pickups exports
window.initPickupsView = initPickupsView;
window.changePickupDate = changePickupDate;
window.loadPickupsForDate = loadPickupsForDate;
window.triggerPendingPickups = triggerPendingPickups;
window.cancelPickup = cancelPickup;

// ==========================================
// CARRIER-SPECIFIC PICKUP MODAL
// ==========================================

var carrierConfig = {
  'Estafeta': { icon: '\u{1F4E6}', color: '#f59e0b' },
  'Paquetexpress': { icon: '\u{1F69B}', color: '#10b981' },
  'FedEx': { icon: '\u2708\uFE0F', color: '#3b82f6' },
  'DHL': { icon: '\u{1F7E1}', color: '#ef4444' },
  'UPS': { icon: '\u{1F4EC}', color: '#d97706' },
  'Redpack': { icon: '\u{1F4EE}', color: '#8b5cf6' }
};

var pendingLabelsCache = [];

async function openPickupModal(carrier) {
  var modal = document.getElementById('pickup-request-modal');
  var config = carrierConfig[carrier] || { icon: '\u{1F4E6}', color: '#667eea' };
  document.getElementById('pickup-carrier').value = carrier;
  document.getElementById('pickup-modal-carrier-icon').textContent = config.icon;
  document.getElementById('pickup-modal-carrier-name').textContent = carrier;
  document.getElementById('pickup-modal-title').textContent = 'Solicitar Recolecci\u00F3n - ' + carrier;
  var tomorrow = getNextBusinessDay();
  document.getElementById('pickup-date').value = tomorrow;
  document.getElementById('pickup-date').min = new Date().toISOString().split('T')[0];
  document.getElementById('pickup-time-from').value = '09:00';
  document.getElementById('pickup-time-to').value = '18:00';
  var submitBtn = document.getElementById('pickup-submit-btn');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Solicitar Recoleccion';
  modal.classList.remove('hidden');
  await loadPendingLabelsForCarrier(carrier);
}

function getNextBusinessDay() {
  var date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

async function loadPendingLabelsForCarrier(carrier) {
  var countEl = document.getElementById('pickup-pending-count');
  var listEl = document.getElementById('pickup-pending-list');
  var submitBtn = document.getElementById('pickup-submit-btn');
  countEl.textContent = '...';
  listEl.textContent = 'Cargando...';

  try {
    var response = await guiasFetch(GUIAS_API_URL + '/pickups/pending');
    var result = await response.json();
    if (!result.success) throw new Error(result.error || 'Error loading pending labels');

    var carrierLabels = result.pending.filter(function(label) {
      return label.carrier && label.carrier.toLowerCase() === carrier.toLowerCase();
    });
    pendingLabelsCache = carrierLabels;
    countEl.textContent = carrierLabels.length;

    if (carrierLabels.length === 0) {
      listEl.innerHTML = '<span class="pickup-modal-hint">No hay guias pendientes para esta paqueteria.<br><strong>Puedes programar la recoleccion de todas formas.</strong></span>';
      submitBtn.textContent = 'Programar Recoleccion (sin guias)';
      submitBtn.disabled = false;
    } else {
      var labelsList = carrierLabels.slice(0, 5).map(function(l) {
        return '<div class="pending-label-item">' + (l.order_number || l.order_id) + ' \u2014 ' + (l.tracking_number || 'Sin tracking') + '</div>';
      }).join('');
      var moreCount = carrierLabels.length > 5 ? '<div class="pending-label-item"><strong>+ ' + (carrierLabels.length - 5) + ' mas</strong></div>' : '';
      listEl.innerHTML = labelsList + moreCount;
      submitBtn.textContent = 'Solicitar Recoleccion (' + carrierLabels.length + ' guias)';
    }
  } catch (error) {
    console.error('Error loading pending labels:', error);
    countEl.textContent = '?';
    listEl.textContent = 'Error: ' + error.message;
  }
}

function closePickupModal() {
  document.getElementById('pickup-request-modal').classList.add('hidden');
  pendingLabelsCache = [];
}

async function submitPickupRequest(event) {
  event.preventDefault();
  var carrier = document.getElementById('pickup-carrier').value;
  var pickupDate = document.getElementById('pickup-date').value;
  var timeFrom = document.getElementById('pickup-time-from').value;
  var timeTo = document.getElementById('pickup-time-to').value;
  var submitBtn = document.getElementById('pickup-submit-btn');
  var originalText = submitBtn.textContent;
  submitBtn.textContent = '\u23F3 Solicitando...';
  submitBtn.disabled = true;

  try {
    var requestBody = { carrier: carrier, pickupDate: pickupDate, timeFrom: timeFrom, timeTo: timeTo };
    if (pendingLabelsCache.length > 0) {
      requestBody.shipmentIds = pendingLabelsCache.map(function(l) { return l.shipment_id; });
    }
    var response = await guiasFetch(GUIAS_API_URL + '/pickups/request/carrier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    var result = await response.json();

    if (result.success) {
      var pendingCount = pendingLabelsCache.length;
      var message = '\u2705 Recolecci\u00F3n ' + (result.local ? 'programada' : 'solicitada') + ' exitosamente!\n' +
        'Paqueter\u00EDa: ' + carrier + '\nFecha: ' + pickupDate + '\nHorario: ' + timeFrom + ' - ' + timeTo +
        '\nGu\u00EDas: ' + pendingCount;
      if (result.note) message += '\n\n' + result.note;
      alert(message);
      closePickupModal();
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert('Error: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

async function saveConfirmationCode(pickupId, code) {
  if (!code || !code.trim()) return;
  try {
    var response = await guiasFetch(GUIAS_API_URL + '/pickups/' + encodeURIComponent(pickupId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationCode: code.trim(), status: 'confirmed' })
    });
    var result = await response.json();
    if (result.success) {
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert('Error: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

function promptConfirmationCode(pickupId) {
  var code = prompt('Ingresa el c\u00F3digo de confirmaci\u00F3n de la paqueter\u00EDa\n(ej: AME260204015829, MEXA3562):');
  if (code) saveConfirmationCode(pickupId, code);
}

// Carrier pickup modal exports
window.openPickupModal = openPickupModal;
window.closePickupModal = closePickupModal;
window.submitPickupRequest = submitPickupRequest;
window.saveConfirmationCode = saveConfirmationCode;
window.promptConfirmationCode = promptConfirmationCode;

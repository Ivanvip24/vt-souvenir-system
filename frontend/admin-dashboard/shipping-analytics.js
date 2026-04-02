/**
 * Shipping Analytics — Análisis de Envíos
 * Tracks shipping costs, delivery times, and carrier performance
 * Note: All data rendered comes from our own authenticated API (admin-only),
 * not from user input. innerHTML usage is safe in this context.
 */

const SA_API = (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://vt-souvenir-backend.onrender.com') + '/api/shipping';

function saFetch(url, opts) {
  var token = localStorage.getItem('admin_token');
  return fetch(url, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts?.headers || {}) }
  });
}

var saLoaded = false;

function initShippingAnalytics() {
  if (!saLoaded) loadShippingAnalytics();
}

async function loadShippingAnalytics() {
  var loading = document.getElementById('sa-loading');
  var tbody = document.getElementById('sa-table-body');
  if (loading) loading.style.display = 'block';
  if (tbody) tbody.textContent = '';

  var carrier = document.getElementById('sa-carrier-filter')?.value || '';
  var params = carrier ? '?carrier=' + encodeURIComponent(carrier) : '';

  try {
    var res = await saFetch(SA_API + '/analytics' + params);
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error');

    saLoaded = true;
    renderSASummary(data.summary, data.carriers);
    renderSATable(data.shipments);
    populateCarrierFilter(data.carriers);

  } catch (err) {
    console.error('SA error:', err);
    if (tbody) {
      var errRow = document.createElement('tr');
      var errCell = document.createElement('td');
      errCell.colSpan = 10;
      errCell.style.cssText = 'text-align:center;padding:24px;color:#ef4444;';
      errCell.textContent = 'Error: ' + err.message;
      errRow.appendChild(errCell);
      tbody.appendChild(errRow);
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function renderSASummary(summary, carriers) {
  var el = document.getElementById('sa-summary');
  if (!el) return;
  el.textContent = '';

  var cards = [
    { label: 'Envios Totales', value: String(summary.totalShipments), color: '#3b82f6' },
    { label: 'Cajas Totales', value: String(summary.totalBoxes), color: '#8b5cf6' },
    { label: 'Costo Promedio', value: '$' + summary.avgCost.toFixed(0), color: '#10b981' },
    { label: '$/Caja Promedio', value: '$' + summary.avgCostPerBox.toFixed(0), color: '#f59e0b' },
    { label: 'Dias Promedio', value: summary.avgDays.toFixed(1) + 'd', color: '#ec4899' }
  ];

  cards.forEach(function(c) {
    var card = document.createElement('div');
    card.style.cssText = 'background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;border-left:4px solid ' + c.color + ';';

    var label = document.createElement('div');
    label.style.cssText = 'font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;';
    label.textContent = c.label;

    var value = document.createElement('div');
    value.style.cssText = 'font-size:24px;font-weight:700;color:#111827;';
    value.textContent = c.value;

    card.appendChild(label);
    card.appendChild(value);
    el.appendChild(card);
  });

  // Carrier breakdown
  if (carriers && carriers.length > 0) {
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;grid-column:1/-1;';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;';
    title.textContent = 'Por Paqueteria';
    wrapper.appendChild(title);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;';

    carriers.forEach(function(c) {
      var pill = document.createElement('div');
      pill.style.cssText = 'background:#f9fafb;border-radius:8px;padding:8px 14px;font-size:13px;';
      var b = document.createElement('strong');
      b.textContent = c.name + ' ';
      var span = document.createElement('span');
      span.style.color = '#6b7280';
      span.textContent = c.count + ' envios · $' + c.avgCost.toFixed(0) + ' prom · ' + c.avgDays.toFixed(1) + 'd';
      pill.appendChild(b);
      pill.appendChild(span);
      row.appendChild(pill);
    });

    wrapper.appendChild(row);
    el.appendChild(wrapper);
  }
}

function renderSATable(shipments) {
  var tbody = document.getElementById('sa-table-body');
  if (!tbody) return;
  tbody.textContent = '';

  if (!shipments || shipments.length === 0) {
    var emptyRow = document.createElement('tr');
    var emptyCell = document.createElement('td');
    emptyCell.colSpan = 10;
    emptyCell.style.cssText = 'text-align:center;padding:32px;color:#9ca3af;';
    emptyCell.textContent = 'Sin datos de envio';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }

  var carrierColors = { 'FedEx': '#4B0082', 'Estafeta': '#D4380D', 'DHL': '#FAAD14', 'Paquetexpress': '#13C2C2', 'ampm': '#722ED1' };

  shipments.forEach(function(s) {
    var tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f3f4f6';

    function addCell(text, styles) {
      var td = document.createElement('td');
      td.style.cssText = 'padding:10px 12px;' + (styles || '');
      td.textContent = text;
      tr.appendChild(td);
      return td;
    }

    var date = new Date(s.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
    addCell(date, 'color:#6b7280;font-size:12px;');
    addCell(s.orderNumber || '—', 'font-weight:500;');
    addCell(s.clientName || '—', '');

    var destTd = addCell(s.destination || '—', 'font-size:12px;');
    if (s.postalCode) {
      var cpSpan = document.createElement('span');
      cpSpan.style.cssText = 'color:#9ca3af;margin-left:4px;';
      cpSpan.textContent = 'CP ' + s.postalCode;
      destTd.appendChild(cpSpan);
    }

    var carrierTd = addCell('', '');
    var carrierSpan = document.createElement('span');
    carrierSpan.style.cssText = 'color:' + (carrierColors[s.carrier] || '#6b7280') + ';font-weight:600;';
    carrierSpan.textContent = s.carrier;
    carrierTd.appendChild(carrierSpan);

    addCell(s.service || '—', 'font-size:12px;color:#6b7280;');
    addCell(String(s.boxes), 'text-align:right;font-weight:500;');

    var daysTd = addCell('', 'text-align:right;');
    var daysBadge = document.createElement('span');
    var d = s.deliveryDays || 0;
    daysBadge.style.cssText = 'padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;' +
      (d <= 2 ? 'background:#dcfce7;color:#166534;' : d <= 5 ? 'background:#fef3c7;color:#92400e;' : 'background:#fee2e2;color:#991b1b;');
    daysBadge.textContent = d + 'd';
    daysTd.appendChild(daysBadge);

    addCell('$' + s.costPerBox.toFixed(0), 'text-align:right;color:#6b7280;');
    addCell('$' + s.totalCost.toFixed(0), 'text-align:right;font-weight:700;color:#111827;');

    tbody.appendChild(tr);
  });
}

function populateCarrierFilter(carriers) {
  var select = document.getElementById('sa-carrier-filter');
  if (!select || !carriers) return;

  var current = select.value;
  select.textContent = '';

  var defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Todas las paqueterias';
  select.appendChild(defaultOpt);

  carriers.forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name + ' (' + c.count + ')';
    if (c.name === current) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = function() { loadShippingAnalytics(); };
}

window.initShippingAnalytics = initShippingAnalytics;
window.loadShippingAnalytics = loadShippingAnalytics;

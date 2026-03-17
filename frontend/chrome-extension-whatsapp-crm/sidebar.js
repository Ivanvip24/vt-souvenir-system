/**
 * AXKAN WhatsApp CRM — Sidebar v2
 * Complete sidebar UI with inlined CSS, rendered inside Shadow DOM.
 * Handles: client lookup, orders, templates, new orders, file uploads.
 *
 * Design: Light AXKAN theme — clean, airy, professional
 * White background, Rosa Mexicano accents, generous spacing
 */

// ── Constants ────────────────────────────────────────────

var STATUS_COLORS = {
  pending: '#09adc2', new: '#09adc2',
  design: '#aa1e6b',
  production: '#f39223', printing: '#f39223',
  cutting: '#f4b266',
  counting: '#8b5cf6',
  shipping: '#09adc2', in_transit: '#09adc2',
  delivered: '#8ab73b',
  cancelled: '#e52421'
};
var STATUS_LABELS = {
  pending: 'Nuevo', new: 'Nuevo',
  design: 'Diseno', approved: 'Aprobado',
  production: 'Produccion', printing: 'Impresion',
  cutting: 'Corte', counting: 'Conteo',
  shipping: 'Envio', in_transit: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado'
};
var STATUS_DEFAULT_COLOR = '#6b7280';

var TEMPLATES = [
  { name: 'Pedido recibido', icon: '\u{1F4E6}', msg: 'Hola {name}! Tu pedido {orderNumber} ha sido recibido. Te mantendremos informado del avance. \u2728', requires: ['name', 'orderNumber'] },
  { name: 'Diseno listo', icon: '\u{1F3A8}', msg: 'Hola {name}! Tu diseno para el pedido {orderNumber} esta listo. Te lo comparto para tu aprobacion. \u{1F44D}', requires: ['name', 'orderNumber'] },
  { name: 'En produccion', icon: '\u2699\uFE0F', msg: 'Hola {name}! Tu pedido {orderNumber} ya esta en produccion. Te avisamos cuando este listo. \u{1F525}', requires: ['name', 'orderNumber'] },
  { name: 'Listo para envio', icon: '\u{1F4E6}', msg: 'Hola {name}! Tu pedido {orderNumber} esta listo para envio. El total restante es ${remaining}. \u{1F69A}', requires: ['name', 'orderNumber', 'remaining'] },
  { name: 'Numero de rastreo', icon: '\u{1F4CD}', msg: 'Hola {name}! Tu pedido {orderNumber} ya fue enviado. Tu numero de rastreo es: {tracking} ({carrier}). \u{1F4E8}', requires: ['name', 'orderNumber', 'tracking', 'carrier'] },
  { name: 'Recordatorio de pago', icon: '\u{1F4B3}', msg: 'Hola {name}! Te recordamos que tu pedido {orderNumber} tiene un saldo pendiente de ${remaining}. \u{1F64F}', requires: ['name', 'orderNumber', 'remaining'] }
];

// ── SVG builder: Jaguar silhouette for toggle ────────────

function createJaguarSvg(size) {
  size = size || 20;
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));

  var paths = [
    { tag: 'path', d: 'M12 2C8.5 2 5 4.5 5 8c0 1.5.5 3 1.5 4l-1 3.5L8 14c1.2.7 2.5 1 4 1s2.8-.3 4-1l2.5 1.5-1-3.5c1-1 1.5-2.5 1.5-4 0-3.5-3.5-6-7-6z' },
    { tag: 'circle', cx: '9.5', cy: '7.5', r: '1', fill: 'currentColor' },
    { tag: 'circle', cx: '14.5', cy: '7.5', r: '1', fill: 'currentColor' },
    { tag: 'path', d: 'M10 10.5c.8.7 3.2.7 4 0' },
    { tag: 'path', d: 'M7 4c-1-1-2.5-1.5-3.5-1M17 4c1-1 2.5-1.5 3.5-1' }
  ];

  paths.forEach(function(p) {
    var el = document.createElementNS(ns, p.tag);
    if (p.d) el.setAttribute('d', p.d);
    if (p.cx) el.setAttribute('cx', p.cx);
    if (p.cy) el.setAttribute('cy', p.cy);
    if (p.r) el.setAttribute('r', p.r);
    if (p.fill) el.setAttribute('fill', p.fill);
    svg.appendChild(el);
  });

  return svg;
}

// ── Inlined CSS ──────────────────────────────────────────

var SIDEBAR_CSS = '\
:host { all: initial; --sidebar-w: 300px; --rosa: #e72a88; --verde: #2d8a4e; --naranja: #e68a2e; --cyan: #0891b2; --rojo: #dc2626; --oro: #b08d57; --magenta-deep: #aa1e6b; --bg: #ffffff; --bg-soft: #f7f7f9; --bg-hover: #f0f0f4; --border: #e5e7eb; --border-light: #f0f0f3; --text: #1f2937; --text-dim: #6b7280; --text-muted: #9ca3af; }\
* { margin: 0; padding: 0; box-sizing: border-box; }\
\
.axkan-toggle {\
  position: fixed; top: 50%; right: 0; transform: translateY(-50%);\
  width: 36px; height: 42px; background: var(--rosa); color: white;\
  border: none; border-radius: 10px 0 0 10px; cursor: pointer;\
  font-size: 16px; font-weight: bold; z-index: 2;\
  display: flex; align-items: center; justify-content: center;\
  box-shadow: -2px 0 8px rgba(231,42,136,0.2);\
  transition: right 0.3s cubic-bezier(0.4,0,0.2,1), background 0.2s;\
}\
.axkan-toggle:hover { background: #d1237b; }\
.axkan-toggle.open { right: var(--sidebar-w); }\
\
.sidebar {\
  position: fixed; top: 0; right: 0;\
  width: var(--sidebar-w); height: 100vh;\
  background: var(--bg); color: var(--text);\
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;\
  font-size: 13px;\
  display: flex; flex-direction: column;\
  transform: translateX(100%);\
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);\
  overflow: hidden;\
  border-left: 1px solid var(--border);\
  box-shadow: -2px 0 16px rgba(0,0,0,0.06);\
}\
.sidebar.open { transform: translateX(0); }\
\
.resize-handle {\
  position: absolute; top: 0; left: 0; width: 5px; height: 100%;\
  cursor: col-resize; z-index: 3; background: transparent;\
}\
.resize-handle:hover, .resize-handle.active { background: var(--rosa); opacity: 0.6; }\
\
.sidebar-brand {\
  padding: 14px 16px; display: flex; align-items: center; gap: 10px;\
  background: var(--bg); border-bottom: 1px solid var(--border);\
}\
.brand-mark {\
  width: 30px; height: 30px; background: var(--rosa);\
  border-radius: 8px; display: flex; align-items: center; justify-content: center;\
  flex-shrink: 0;\
}\
.brand-text { flex: 1; min-width: 0; }\
.brand-name {\
  font-size: 13px; font-weight: 700; color: var(--text);\
  letter-spacing: 1.2px; text-transform: uppercase;\
}\
.brand-sub { font-size: 10px; color: var(--text-muted); margin-top: 1px; }\
.close-btn {\
  background: none; border: none; color: var(--text-muted); font-size: 16px;\
  cursor: pointer; padding: 4px; border-radius: 6px; transition: all 0.2s;\
  flex-shrink: 0;\
}\
.close-btn:hover { color: var(--rosa); background: rgba(231,42,136,0.06); }\
\
.client-bar {\
  padding: 12px 16px; background: var(--bg-soft);\
  border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px;\
}\
.client-avatar {\
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;\
  display: flex; align-items: center; justify-content: center;\
  font-size: 13px; font-weight: 700; color: white;\
  background: var(--rosa);\
}\
.client-info { flex: 1; min-width: 0; }\
.client-name {\
  font-size: 13px; font-weight: 600; color: var(--text);\
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\
}\
.client-phone { font-size: 11px; color: var(--text-dim); margin-top: 2px; }\
.client-stats {\
  display: flex; gap: 10px; font-size: 11px; color: var(--text-dim); margin-top: 3px;\
}\
.client-stat { display: flex; align-items: center; gap: 3px; }\
.client-stat-val { color: var(--rosa); font-weight: 600; }\
\
.phone-search {\
  display: flex; gap: 6px; padding: 10px 16px;\
  background: var(--bg); border-bottom: 1px solid var(--border);\
}\
.phone-search input {\
  flex: 1; padding: 8px 12px; background: var(--bg-soft); border: 1px solid var(--border);\
  border-radius: 8px; color: var(--text); font-size: 12px; outline: none;\
  transition: border-color 0.2s;\
}\
.phone-search input::placeholder { color: var(--text-muted); }\
.phone-search input:focus { border-color: var(--rosa); box-shadow: 0 0 0 2px rgba(231,42,136,0.1); }\
.phone-search button {\
  padding: 8px 12px; background: var(--bg-soft); color: var(--text-dim);\
  border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 13px;\
  transition: all 0.2s;\
}\
.phone-search button:hover { background: rgba(231,42,136,0.06); color: var(--rosa); border-color: var(--rosa); }\
\
.tabs {\
  display: flex; background: var(--bg); border-bottom: 1px solid var(--border);\
  padding: 0 8px;\
}\
.tab {\
  flex: 1; padding: 11px 4px 9px; text-align: center; cursor: pointer;\
  color: var(--text-muted); font-size: 11px; font-weight: 600;\
  letter-spacing: 0.3px; text-transform: uppercase;\
  border-bottom: 2px solid transparent; transition: all 0.2s;\
}\
.tab.active { color: var(--rosa); border-bottom-color: var(--rosa); }\
.tab:hover:not(.active) { color: var(--text-dim); }\
.tab-icon { display: block; font-size: 14px; margin-bottom: 2px; }\
\
.content {\
  flex: 1; overflow-y: auto; padding: 12px 14px;\
  scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.12) transparent;\
}\
.content::-webkit-scrollbar { width: 4px; }\
.content::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }\
.content::-webkit-scrollbar-track { background: transparent; }\
\
.order-card {\
  background: var(--bg); border-radius: 10px; padding: 14px;\
  margin-bottom: 8px; cursor: pointer; transition: all 0.2s;\
  border: 1px solid var(--border); position: relative;\
}\
.order-card:hover { border-color: rgba(231,42,136,0.3); box-shadow: 0 2px 8px rgba(231,42,136,0.06); }\
.order-card.expanded { border-color: var(--rosa); box-shadow: 0 2px 12px rgba(231,42,136,0.08); }\
.order-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }\
.order-number { font-weight: 700; color: var(--text); font-size: 13px; }\
.order-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }\
.order-date { font-size: 11px; color: var(--text-muted); }\
.order-total { font-size: 13px; color: var(--verde); font-weight: 700; }\
.order-items-preview { font-size: 11px; color: var(--text-dim); margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\
\
.status-badge {\
  padding: 3px 8px; border-radius: 20px; font-size: 10px;\
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;\
  display: inline-flex; align-items: center; gap: 4px;\
  flex-shrink: 0;\
}\
.status-dot { width: 5px; height: 5px; border-radius: 50%; }\
\
.quick-actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }\
.quick-action {\
  padding: 6px 10px; background: var(--bg-soft); border: 1px solid var(--border);\
  color: var(--text-dim); border-radius: 6px; font-size: 10px; cursor: pointer;\
  transition: all 0.15s; font-weight: 500;\
}\
.quick-action:hover { border-color: var(--rosa); color: var(--rosa); background: rgba(231,42,136,0.04); }\
\
.order-detail { padding: 12px 0 0; border-top: 1px solid var(--border-light); margin-top: 12px; }\
.order-item {\
  padding: 10px; font-size: 12px; background: var(--bg-soft); border-radius: 8px;\
  margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;\
}\
.item-name { font-weight: 600; color: var(--text); font-size: 12px; }\
.item-detail { font-size: 11px; color: var(--text-dim); margin-top: 2px; }\
.item-price { font-size: 12px; color: var(--verde); font-weight: 600; flex-shrink: 0; }\
\
.pay-summary {\
  display: flex; gap: 8px; margin-top: 10px;\
}\
.pay-item {\
  flex: 1; padding: 10px 8px; background: var(--bg-soft); border-radius: 8px;\
  text-align: center; font-size: 10px; color: var(--text-dim);\
}\
.pay-val { display: block; font-size: 13px; margin-top: 3px; font-weight: 700; }\
.pay-item.total .pay-val { color: var(--text); }\
.pay-item.deposit .pay-val { color: var(--cyan); }\
.pay-item.remaining .pay-val { color: var(--naranja); }\
\
.loading, .error-state, .empty-state {\
  text-align: center; padding: 48px 20px; color: var(--text-dim);\
}\
.spinner {\
  display: inline-block; width: 28px; height: 28px;\
  border: 2px solid var(--border); border-top-color: var(--rosa);\
  border-radius: 50%; animation: spin 0.8s linear infinite;\
}\
@keyframes spin { to { transform: rotate(360deg); } }\
.error-state { color: var(--rojo); }\
.retry-btn {\
  margin-top: 12px; padding: 8px 18px; background: var(--bg);\
  color: var(--text-dim); border: 1px solid var(--border);\
  border-radius: 8px; cursor: pointer; font-size: 12px; transition: all 0.2s;\
}\
.retry-btn:hover { border-color: var(--rosa); color: var(--rosa); }\
\
.auth-banner {\
  padding: 24px 20px; background: var(--bg-soft);\
  border-bottom: 1px solid var(--border); display: none;\
}\
.auth-title {\
  font-size: 12px; color: var(--text-dim); margin-bottom: 14px;\
  text-align: center; font-weight: 600; letter-spacing: 0.5px;\
}\
.auth-input {\
  width: 100%; padding: 10px 12px; background: var(--bg); border: 1px solid var(--border);\
  border-radius: 8px; color: var(--text); font-size: 12px; outline: none;\
  margin-bottom: 10px; transition: border-color 0.2s;\
}\
.auth-input::placeholder { color: var(--text-muted); }\
.auth-input:focus { border-color: var(--rosa); box-shadow: 0 0 0 2px rgba(231,42,136,0.08); }\
.auth-btn {\
  width: 100%; padding: 10px; background: var(--rosa); color: white;\
  border: none; border-radius: 8px; font-size: 12px; font-weight: 700;\
  cursor: pointer; letter-spacing: 0.5px; transition: all 0.2s;\
  text-transform: uppercase;\
}\
.auth-btn:hover { background: #d1237b; }\
.auth-btn:disabled { background: var(--text-muted); cursor: not-allowed; }\
.auth-error {\
  font-size: 11px; margin-top: 10px; text-align: center; display: none;\
  color: var(--rojo); padding: 8px; background: rgba(220,38,38,0.06); border-radius: 6px;\
}\
\
.toast {\
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);\
  padding: 10px 18px; border-radius: 10px; font-size: 12px; font-weight: 600;\
  color: white; z-index: 10; transition: opacity 0.3s;\
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);\
}\
.toast.success { background: var(--verde); }\
.toast.error { background: var(--rojo); }\
.toast.info { background: var(--cyan); }\
\
.template-card {\
  background: var(--bg); border-radius: 10px; padding: 12px 14px;\
  margin-bottom: 8px; cursor: pointer; transition: all 0.2s;\
  border: 1px solid var(--border); display: flex; align-items: flex-start; gap: 10px;\
}\
.template-card:hover { border-color: rgba(231,42,136,0.3); box-shadow: 0 1px 6px rgba(231,42,136,0.06); }\
.template-card.disabled { opacity: 0.4; cursor: not-allowed; }\
.template-card.disabled:hover { border-color: var(--border); box-shadow: none; }\
.template-icon {\
  width: 32px; height: 32px; border-radius: 8px; background: var(--bg-soft);\
  display: flex; align-items: center; justify-content: center;\
  font-size: 15px; flex-shrink: 0;\
}\
.template-body { flex: 1; min-width: 0; }\
.template-name { font-weight: 600; color: var(--text); font-size: 12px; }\
.template-preview {\
  font-size: 11px; color: var(--text-dim); margin-top: 3px; line-height: 1.4;\
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;\
  overflow: hidden;\
}\
.template-hint {\
  font-size: 10px; color: var(--text-muted); margin-top: 4px;\
  font-style: italic;\
}\
\
.order-form { padding: 4px 0; }\
.form-group { margin-bottom: 14px; }\
.form-group label {\
  display: block; font-size: 10px; color: var(--text-dim);\
  margin-bottom: 5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;\
}\
.form-group input, .form-group select, .form-group textarea {\
  width: 100%; padding: 10px 12px; background: var(--bg); border: 1px solid var(--border);\
  border-radius: 8px; color: var(--text); font-size: 12px; outline: none;\
  transition: border-color 0.2s;\
}\
.form-group input::placeholder, .form-group textarea::placeholder { color: var(--text-muted); }\
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {\
  border-color: var(--rosa); box-shadow: 0 0 0 2px rgba(231,42,136,0.08);\
}\
.form-group textarea { resize: vertical; min-height: 60px; font-family: inherit; }\
.form-group select { cursor: pointer; background: var(--bg); }\
.submit-btn {\
  width: 100%; padding: 12px; background: var(--rosa); color: white;\
  border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer;\
  margin-top: 12px; letter-spacing: 0.3px; transition: all 0.2s;\
}\
.submit-btn:hover { background: #d1237b; }\
.submit-btn:disabled { background: var(--text-muted); cursor: not-allowed; }\
.add-item-btn {\
  width: 100%; padding: 10px; background: transparent; color: var(--rosa);\
  border: 1px dashed rgba(231,42,136,0.35); border-radius: 8px; font-size: 12px;\
  cursor: pointer; margin-top: 10px; font-weight: 600; transition: all 0.2s;\
}\
.add-item-btn:hover { background: rgba(231,42,136,0.04); border-color: var(--rosa); }\
.item-row {\
  background: var(--bg-soft); border-radius: 10px; padding: 14px;\
  margin-bottom: 10px; border: 1px solid var(--border-light);\
}\
.item-row-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }\
.item-row-label { font-size: 11px; color: var(--rosa); font-weight: 700; letter-spacing: 0.5px; }\
.remove-item {\
  background: none; border: none; color: var(--rojo); cursor: pointer;\
  font-size: 13px; opacity: 0.5; transition: opacity 0.2s;\
}\
.remove-item:hover { opacity: 1; }\
\
.drop-zone {\
  border: 1px dashed var(--border); border-radius: 8px; padding: 16px;\
  text-align: center; color: var(--text-muted); font-size: 11px; cursor: pointer;\
  transition: all 0.2s; margin-top: 8px;\
}\
.drop-zone:hover, .drop-zone.dragover {\
  border-color: var(--rosa); color: var(--rosa); background: rgba(231,42,136,0.03);\
}\
.upload-progress { height: 2px; background: var(--bg-soft); border-radius: 2px; margin-top: 6px; overflow: hidden; }\
.upload-progress .bar { height: 100%; background: var(--verde); border-radius: 2px; width: 0%; transition: width 0.3s; }\
.upload-thumb { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; margin-top: 4px; }\
.upload-row {\
  display: flex; align-items: center; gap: 8px; margin-top: 8px;\
  padding: 8px 10px; background: rgba(45,138,78,0.06); border-radius: 8px;\
}\
.upload-name {\
  font-size: 11px; color: var(--verde); flex: 1; overflow: hidden;\
  text-overflow: ellipsis; white-space: nowrap; font-weight: 500;\
}\
.upload-remove {\
  background: none; border: none; color: var(--rojo); cursor: pointer;\
  font-size: 12px; opacity: 0.5; transition: opacity 0.2s;\
}\
.upload-remove:hover { opacity: 1; }\
\
.section-title {\
  font-size: 10px; font-weight: 700; color: var(--text-muted);\
  text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.8px;\
  display: flex; align-items: center; gap: 8px;\
}\
.section-title::after {\
  content: ""; flex: 1; height: 1px; background: var(--border-light);\
}\
\
.empty-icon { font-size: 36px; margin-bottom: 14px; opacity: 0.3; }\
.empty-text { font-size: 13px; color: var(--text-dim); margin-bottom: 4px; }\
.empty-sub { font-size: 11px; color: var(--text-muted); margin-bottom: 20px; }\
\
.login-placeholder {\
  text-align: center; padding: 48px 20px; color: var(--text-dim);\
}\
.login-placeholder-icon { margin-bottom: 14px; opacity: 0.2; }\
.login-placeholder-text { font-size: 12px; color: var(--text-muted); line-height: 1.6; }\
\
.success-screen { text-align: center; padding: 32px 20px; }\
.success-check {\
  width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 16px;\
  background: var(--verde);\
  display: flex; align-items: center; justify-content: center;\
  font-size: 28px; color: white;\
}\
.success-title { font-size: 16px; font-weight: 700; color: var(--verde); margin-bottom: 4px; }\
.success-order { font-size: 14px; color: var(--text); margin-bottom: 24px; }\
';

// ── Helper: escape HTML for safe rendering ───────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function formatCurrency(val) {
  var n = Number(val);
  if (isNaN(n)) return '$0';
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try { return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return dateStr; }
}

function getInitials(name) {
  if (!name) return 'C';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

// ── Sidebar Object ───────────────────────────────────────

var AxkanSidebar = {
  shadow: null,
  config: null,
  isOpen: false,
  activeTab: 'orders',
  clientData: null,
  ordersData: [],
  expandedOrderId: null,
  expandedOrderDetail: null,
  productsCache: null,
  selectedOrder: null,

  // ── Init ─────────────────────────────────────────────

  init: function(shadowRoot, config) {
    this.shadow = shadowRoot;
    this.config = config;

    var style = document.createElement('style');
    style.textContent = SIDEBAR_CSS;
    shadowRoot.appendChild(style);

    this.container = document.createElement('div');
    shadowRoot.appendChild(this.container);

    // Build toggle button with jaguar SVG
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'axkan-toggle';
    this.toggleBtn.appendChild(createJaguarSvg(20));
    this.toggleBtn.title = 'AXKAN CRM';
    this.container.appendChild(this.toggleBtn);

    // Build sidebar panel
    this.panel = document.createElement('div');
    this.panel.className = 'sidebar';
    this.container.appendChild(this.panel);

    // Resize drag handle
    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'resize-handle';
    this.panel.appendChild(this.resizeHandle);

    // Auth banner + inline login form
    this.authBanner = document.createElement('div');
    this.authBanner.className = 'auth-banner';

    var authTitle = document.createElement('div');
    authTitle.className = 'auth-title';
    authTitle.textContent = 'INICIA SESION';
    this.authBanner.appendChild(authTitle);

    this.authUser = document.createElement('input');
    this.authUser.type = 'text';
    this.authUser.placeholder = 'Usuario';
    this.authUser.className = 'auth-input';
    this.authBanner.appendChild(this.authUser);

    this.authPass = document.createElement('input');
    this.authPass.type = 'password';
    this.authPass.placeholder = 'Contrasena';
    this.authPass.className = 'auth-input';
    this.authBanner.appendChild(this.authPass);

    this.authLoginBtn = document.createElement('button');
    this.authLoginBtn.textContent = 'ENTRAR';
    this.authLoginBtn.className = 'auth-btn';
    this.authBanner.appendChild(this.authLoginBtn);

    this.authError = document.createElement('div');
    this.authError.className = 'auth-error';
    this.authBanner.appendChild(this.authError);

    this.panel.appendChild(this.authBanner);

    // Brand header
    var brandHeader = document.createElement('div');
    brandHeader.className = 'sidebar-brand';

    var brandMark = document.createElement('div');
    brandMark.className = 'brand-mark';
    brandMark.appendChild(createJaguarSvg(18));

    var brandText = document.createElement('div');
    brandText.className = 'brand-text';
    var brandName = document.createElement('div');
    brandName.className = 'brand-name';
    brandName.textContent = 'AXKAN';
    var brandSub = document.createElement('div');
    brandSub.className = 'brand-sub';
    brandSub.textContent = 'CRM WhatsApp';
    brandText.appendChild(brandName);
    brandText.appendChild(brandSub);

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'close-btn';
    this.closeBtn.textContent = '\u2715';

    brandHeader.appendChild(brandMark);
    brandHeader.appendChild(brandText);
    brandHeader.appendChild(this.closeBtn);
    this.panel.appendChild(brandHeader);

    // Client info bar
    this.clientBar = document.createElement('div');
    this.clientBar.className = 'client-bar';
    this.clientBar.style.display = 'none';

    this.clientAvatar = document.createElement('div');
    this.clientAvatar.className = 'client-avatar';
    this.clientAvatar.textContent = 'C';

    var clientInfoDiv = document.createElement('div');
    clientInfoDiv.className = 'client-info';
    this.clientNameEl = document.createElement('div');
    this.clientNameEl.className = 'client-name';
    this.clientPhoneEl = document.createElement('div');
    this.clientPhoneEl.className = 'client-phone';
    this.clientStatsEl = document.createElement('div');
    this.clientStatsEl.className = 'client-stats';
    clientInfoDiv.appendChild(this.clientNameEl);
    clientInfoDiv.appendChild(this.clientPhoneEl);
    clientInfoDiv.appendChild(this.clientStatsEl);

    this.clientBar.appendChild(this.clientAvatar);
    this.clientBar.appendChild(clientInfoDiv);
    this.panel.appendChild(this.clientBar);

    // Phone search
    var searchBar = document.createElement('div');
    searchBar.className = 'phone-search';
    this.phoneInput = document.createElement('input');
    this.phoneInput.type = 'text';
    this.phoneInput.placeholder = 'Buscar por telefono...';
    this.searchBtn = document.createElement('button');
    this.searchBtn.textContent = '\uD83D\uDD0D';
    searchBar.appendChild(this.phoneInput);
    searchBar.appendChild(this.searchBtn);
    this.panel.appendChild(searchBar);

    // Tabs
    var tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs';
    this.tabs = {};
    var tabNames = [
      { key: 'orders', label: 'Pedidos', icon: '\u{1F4CB}' },
      { key: 'templates', label: 'Mensajes', icon: '\u{1F4AC}' },
      { key: 'newOrder', label: '+ Nuevo', icon: '\u2795' }
    ];
    var self = this;
    tabNames.forEach(function(t) {
      var tab = document.createElement('div');
      tab.className = 'tab' + (t.key === 'orders' ? ' active' : '');
      var iconSpan = document.createElement('span');
      iconSpan.className = 'tab-icon';
      iconSpan.textContent = t.icon;
      tab.appendChild(iconSpan);
      tab.appendChild(document.createTextNode(t.label));
      tab.dataset.tab = t.key;
      tab.addEventListener('click', function() {
        Object.values(self.tabs).forEach(function(el) { el.classList.remove('active'); });
        tab.classList.add('active');
        self.activeTab = t.key;
        self.renderActiveTab();
      });
      tabsContainer.appendChild(tab);
      self.tabs[t.key] = tab;
    });
    this.panel.appendChild(tabsContainer);

    // Content area
    this.contentArea = document.createElement('div');
    this.contentArea.className = 'content';
    this.panel.appendChild(this.contentArea);

    // Bind events
    this.toggleBtn.addEventListener('click', function() { self.toggle(); });
    this.closeBtn.addEventListener('click', function() { self.toggle(false); });
    this.searchBtn.addEventListener('click', function() {
      var phone = self.phoneInput.value.replace(/\D/g, '');
      if (phone.length >= 10) self.onPhoneDetected(phone);
    });
    this.phoneInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') self.searchBtn.click();
    });
    this.authLoginBtn.addEventListener('click', function() { self.handleSidebarLogin(); });
    this.authPass.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') self.handleSidebarLogin();
    });

    // Resize drag handler
    (function() {
      var dragging = false;
      self.resizeHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        dragging = true;
        self.resizeHandle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        var newWidth = window.innerWidth - e.clientX;
        if (self.config.onResize) self.config.onResize(newWidth);
      });
      document.addEventListener('mouseup', function() {
        if (!dragging) return;
        dragging = false;
        self.resizeHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      });
    })();

    // Apply initial width from storage
    var initialWidth = this.config.getWidth ? this.config.getWidth() : 300;
    this.setSidebarWidth(initialWidth);

    // Restore sidebar state
    chrome.storage.local.get('sidebarOpen', function(data) {
      if (data.sidebarOpen) self.toggle(true);
    });

    // Check if already logged in
    this.config.sendMessage({ type: 'CHECK_AUTH' }).then(function(res) {
      if (res && res.authenticated) {
        console.log('[AXKAN CRM] Already authenticated');
        self.authBanner.style.display = 'none';
      } else {
        console.log('[AXKAN CRM] Not authenticated — showing login');
        self.showAuthExpired();
      }
    });

    // Pre-load products
    this.loadProducts();

    console.log('[AXKAN CRM] Sidebar initialized');
  },

  // ── Toggle & Resize ─────────────────────────────────

  toggle: function(forceState) {
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    this.toggleBtn.classList.toggle('open', this.isOpen);
    this.config.onToggle(this.isOpen);
  },

  setSidebarWidth: function(w) {
    if (!w || w <= 0) return;
    this.shadow.host.style.setProperty('--sidebar-w', w + 'px');
  },

  // ── Products ─────────────────────────────────────────

  loadProducts: function() {
    var self = this;
    this.config.sendMessage({
      type: 'API_CALL', method: 'GET',
      endpoint: '/api/client/products',
      auth: false
    }).then(function(res) {
      if (res && res.success && res.products) {
        self.productsCache = res.products;
      } else if (res && Array.isArray(res)) {
        self.productsCache = res;
      }
    });
  },

  // ── Client Lookup ────────────────────────────────────

  onPhoneDetected: function(phone) {
    var self = this;
    this._detectedPhone = phone;

    var cached = this.config.getClientCache()[phone];
    if (cached) {
      this.setClientData(cached.client, cached.orders, phone);
      return;
    }

    this.renderLoading();

    var retryCount = 0;
    var maxRetries = 3;

    function doLookup() {
      self.config.sendMessage({
        type: 'API_CALL', method: 'GET',
        endpoint: '/api/clients/search?phone=' + phone
      }).then(function(res) {
        if (!res) {
          if (retryCount < maxRetries) { retryCount++; setTimeout(doLookup, 5000); return; }
          self.renderError('No se pudo conectar al servidor');
          return;
        }
        if (res.authExpired) { self.showAuthExpired(); return; }

        if (res.clients && res.clients.length > 0) {
          var client = res.clients[0];
          self.config.sendMessage({
            type: 'API_CALL', method: 'GET',
            endpoint: '/api/clients/' + client.id
          }).then(function(clientRes) {
            if (clientRes && (clientRes.success || clientRes.client || clientRes.id)) {
              var clientData = clientRes.client || clientRes;
              var orders = clientData.orders || [];
              self.config.setClientCache(phone, { client: clientData, orders: orders });
              self.setClientData(clientData, orders, phone);
            } else {
              self.setNewClient(phone);
            }
          });
        } else {
          self.setNewClient(phone);
        }
      }).catch(function() {
        if (retryCount < maxRetries) { retryCount++; setTimeout(doLookup, 5000); }
        else { self.renderError('No se pudo conectar al servidor'); }
      });
    }

    doLookup();
  },

  setClientData: function(client, orders, phone) {
    this.clientData = client;
    this.clientData._phone = phone || client.phone;
    this.ordersData = orders || [];
    this.expandedOrderId = null;
    this.expandedOrderDetail = null;
    this.selectedOrder = null;

    this.clientBar.style.display = 'flex';
    var name = client.name || 'Cliente';
    this.clientNameEl.textContent = name;
    this.clientPhoneEl.textContent = client.phone || phone || '';
    this.clientAvatar.textContent = getInitials(name);

    // Stats
    this.clientStatsEl.textContent = '';
    var totalOrders = this.ordersData.length;
    var totalRevenue = this.ordersData.reduce(function(sum, o) {
      return sum + Number(o.totalPrice || o.total_price || 0);
    }, 0);
    if (totalOrders) {
      var stat1 = document.createElement('span');
      stat1.className = 'client-stat';
      var val1 = document.createElement('span');
      val1.className = 'client-stat-val';
      val1.textContent = totalOrders;
      stat1.appendChild(val1);
      stat1.appendChild(document.createTextNode(' pedido' + (totalOrders > 1 ? 's' : '')));

      var stat2 = document.createElement('span');
      stat2.className = 'client-stat';
      var val2 = document.createElement('span');
      val2.className = 'client-stat-val';
      val2.textContent = formatCurrency(totalRevenue);
      stat2.appendChild(val2);
      stat2.appendChild(document.createTextNode(' total'));

      this.clientStatsEl.appendChild(stat1);
      this.clientStatsEl.appendChild(stat2);
    }

    this.authBanner.style.display = 'none';
    this.renderActiveTab();
  },

  setNewClient: function(phone) {
    this.clientData = { phone: phone, isNew: true };
    this.ordersData = [];
    this.expandedOrderId = null;
    this.selectedOrder = null;

    this.clientBar.style.display = 'flex';
    this.clientNameEl.textContent = 'Nuevo cliente';
    this.clientPhoneEl.textContent = phone;
    this.clientAvatar.textContent = 'N';
    this.clientStatsEl.textContent = '';

    this.authBanner.style.display = 'none';
    this.renderActiveTab();
  },

  // ── Rendering ────────────────────────────────────────

  renderActiveTab: function() {
    switch (this.activeTab) {
      case 'orders': this.renderOrders(); break;
      case 'templates': this.renderTemplates(); break;
      case 'newOrder': this.renderNewOrderForm(); break;
    }
  },

  renderLoading: function() {
    this.contentArea.textContent = '';
    var div = document.createElement('div');
    div.className = 'loading';
    var spinner = document.createElement('div');
    spinner.className = 'spinner';
    div.appendChild(spinner);
    var text = document.createElement('div');
    text.style.cssText = 'margin-top:12px;font-size:12px;';
    text.textContent = 'Buscando cliente...';
    div.appendChild(text);
    this.contentArea.appendChild(div);
  },

  renderError: function(msg) {
    var self = this;
    this.contentArea.textContent = '';
    var div = document.createElement('div');
    div.className = 'error-state';
    div.appendChild(document.createTextNode(msg));
    var btn = document.createElement('button');
    btn.className = 'retry-btn';
    btn.textContent = 'Reintentar';
    btn.addEventListener('click', function() {
      var phone = (self.clientData && self.clientData._phone) || self._detectedPhone || self.phoneInput.value.replace(/\D/g, '');
      if (phone) self.onPhoneDetected(phone);
    });
    div.appendChild(btn);
    this.contentArea.appendChild(div);
  },

  showAuthExpired: function() {
    this.authBanner.style.display = 'block';
    this.authError.style.display = 'none';
    this.authUser.value = '';
    this.authPass.value = '';
    this.authLoginBtn.disabled = false;
    this.authLoginBtn.textContent = 'ENTRAR';
    this.clientBar.style.display = 'none';
    this.contentArea.textContent = '';
    var div = document.createElement('div');
    div.className = 'login-placeholder';
    var iconDiv = document.createElement('div');
    iconDiv.className = 'login-placeholder-icon';
    iconDiv.appendChild(createJaguarSvg(40));
    var text = document.createElement('div');
    text.className = 'login-placeholder-text';
    text.textContent = 'Inicia sesion para ver pedidos y datos del cliente';
    div.appendChild(iconDiv);
    div.appendChild(text);
    this.contentArea.appendChild(div);
  },

  _loginRetries: 0,

  handleSidebarLogin: function() {
    var self = this;
    var username = this.authUser.value.trim();
    var password = this.authPass.value;

    if (!username || !password) {
      this.authError.textContent = 'Ingresa usuario y contrasena';
      this.authError.style.display = 'block';
      return;
    }

    this.authLoginBtn.disabled = true;
    this.authLoginBtn.textContent = 'CONECTANDO...';
    this.authError.style.display = 'none';
    this._loginRetries = 0;
    this._attemptLogin(username, password);
  },

  _attemptLogin: function(username, password) {
    var self = this;
    console.log('[AXKAN CRM] Login attempt', (this._loginRetries + 1), 'for:', username);

    this.config.sendMessage({ type: 'LOGIN', username: username, password: password }).then(function(res) {
      console.log('[AXKAN CRM] Login response:', JSON.stringify(res));

      if (res && res.success) {
        self.authBanner.style.display = 'none';
        self.showToast('Sesion iniciada');
        var phone = self._detectedPhone || (self.clientData && (self.clientData._phone || self.clientData.phone)) || self.phoneInput.value.replace(/\D/g, '');
        if (phone && phone.length >= 10) {
          console.log('[AXKAN CRM] Login success, re-fetching client for:', phone);
          self.onPhoneDetected(phone);
        }
        return;
      }

      var errorMsg = (res && res.error) || 'Error al iniciar sesion';
      var isServerError = errorMsg.indexOf('500') !== -1 || errorMsg.indexOf('Cannot reach') !== -1 || errorMsg.indexOf('waking') !== -1;

      if (isServerError && self._loginRetries < 3) {
        self._loginRetries++;
        self.authLoginBtn.textContent = 'DESPERTANDO... (' + self._loginRetries + '/3)';
        self.authError.textContent = 'Servidor iniciando, reintentando...';
        self.authError.style.display = 'block';
        self.authError.style.color = 'var(--naranja)';
        setTimeout(function() { self._attemptLogin(username, password); }, 5000);
        return;
      }

      console.error('[AXKAN CRM] Login failed:', errorMsg);
      self.authError.textContent = errorMsg;
      self.authError.style.display = 'block';
      self.authError.style.color = 'var(--rojo)';
      self.authLoginBtn.disabled = false;
      self.authLoginBtn.textContent = 'ENTRAR';
    });
  },

  showToast: function(msg, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    this.panel.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  },

  // ── Orders Tab ───────────────────────────────────────

  renderOrders: function() {
    var self = this;
    this.contentArea.textContent = '';

    if (!this.ordersData || !this.ordersData.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var emptyIcon = document.createElement('div');
      emptyIcon.className = 'empty-icon';
      emptyIcon.textContent = '\u{1F4CB}';
      var emptyText = document.createElement('div');
      emptyText.className = 'empty-text';
      emptyText.textContent = 'Sin pedidos';
      var emptySub = document.createElement('div');
      emptySub.className = 'empty-sub';
      emptySub.textContent = this.clientData && this.clientData.isNew ? 'Cliente nuevo — crea su primer pedido' : 'No hay pedidos registrados';
      var newBtn = document.createElement('button');
      newBtn.className = 'submit-btn';
      newBtn.style.cssText = 'width:auto;padding:10px 24px;';
      newBtn.textContent = 'Crear pedido';
      newBtn.addEventListener('click', function() {
        Object.values(self.tabs).forEach(function(el) { el.classList.remove('active'); });
        self.tabs.newOrder.classList.add('active');
        self.activeTab = 'newOrder';
        self.renderNewOrderForm();
      });
      empty.appendChild(emptyIcon);
      empty.appendChild(emptyText);
      empty.appendChild(emptySub);
      empty.appendChild(newBtn);
      this.contentArea.appendChild(empty);
      return;
    }

    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = this.ordersData.length + ' pedido' + (this.ordersData.length > 1 ? 's' : '');
    this.contentArea.appendChild(title);

    this.ordersData.forEach(function(order) {
      var card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.orderId = order.id;

      var headerRow = document.createElement('div');
      headerRow.className = 'order-header';
      var orderNum = document.createElement('span');
      orderNum.className = 'order-number';
      orderNum.textContent = order.orderNumber || order.order_number || '#' + order.id;
      var badge = document.createElement('span');
      badge.className = 'status-badge';
      var status = (order.status || 'unknown').toLowerCase();
      var badgeColor = STATUS_COLORS[status] || STATUS_DEFAULT_COLOR;
      badge.style.background = badgeColor + '1a';
      badge.style.color = badgeColor;
      var dot = document.createElement('span');
      dot.className = 'status-dot';
      dot.style.background = badgeColor;
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode(STATUS_LABELS[status] || order.status || 'unknown'));
      headerRow.appendChild(orderNum);
      headerRow.appendChild(badge);

      var metaRow = document.createElement('div');
      metaRow.className = 'order-meta';
      var dateSpan = document.createElement('span');
      dateSpan.className = 'order-date';
      dateSpan.textContent = formatDate(order.orderDate || order.order_date);
      var totalSpan = document.createElement('span');
      totalSpan.className = 'order-total';
      totalSpan.textContent = formatCurrency(order.totalPrice || order.total_price);
      metaRow.appendChild(dateSpan);
      metaRow.appendChild(totalSpan);

      card.appendChild(headerRow);
      card.appendChild(metaRow);

      var items = order.items || order.order_items || [];
      if (items.length) {
        var preview = document.createElement('div');
        preview.className = 'order-items-preview';
        preview.textContent = items.map(function(i) {
          return (i.quantity || 0) + 'x ' + (i.productName || i.product_name || 'Producto');
        }).join(' \u2022 ');
        card.appendChild(preview);
      }

      var detailDiv = document.createElement('div');
      detailDiv.className = 'order-detail';
      detailDiv.style.display = 'none';
      card.appendChild(detailDiv);

      card.addEventListener('click', function(e) {
        if (e.target.closest && (e.target.closest('.quick-action') || e.target.closest('.drop-zone') || e.target.closest('input[type="file"]'))) return;
        self.expandOrder(order.id, detailDiv, order, card);
      });

      self.contentArea.appendChild(card);
    });
  },

  // ── Order Expansion ──────────────────────────────────

  expandOrder: function(orderId, detailDiv, orderSummary, card) {
    var self = this;

    if (this.expandedOrderId === orderId) {
      detailDiv.style.display = 'none';
      if (card) card.classList.remove('expanded');
      this.expandedOrderId = null;
      this.selectedOrder = null;
      return;
    }

    if (this.expandedOrderId) {
      var prev = this.contentArea.querySelector('[data-order-id="' + this.expandedOrderId + '"]');
      if (prev) {
        var prevDetail = prev.querySelector('.order-detail');
        if (prevDetail) prevDetail.style.display = 'none';
        prev.classList.remove('expanded');
      }
    }

    this.expandedOrderId = orderId;
    if (card) card.classList.add('expanded');
    detailDiv.style.display = 'block';
    detailDiv.textContent = '';

    var loadingText = document.createElement('div');
    loadingText.style.cssText = 'color:var(--text-dim);font-size:12px;padding:10px 0;text-align:center;';
    loadingText.textContent = 'Cargando detalles...';
    detailDiv.appendChild(loadingText);

    this.config.sendMessage({
      type: 'API_CALL', method: 'GET',
      endpoint: '/api/orders/' + orderId
    }).then(function(res) {
      detailDiv.textContent = '';
      if (!res || res.authExpired) { self.showAuthExpired(); return; }

      var order = res.order || res;
      self.expandedOrderDetail = order;
      self.selectedOrder = order;

      var items = order.items || order.order_items || [];
      if (items.length) {
        var itemsTitle = document.createElement('div');
        itemsTitle.className = 'section-title';
        itemsTitle.textContent = 'Productos';
        detailDiv.appendChild(itemsTitle);

        items.forEach(function(item) {
          var itemDiv = document.createElement('div');
          itemDiv.className = 'order-item';
          var leftDiv = document.createElement('div');
          var nameDiv = document.createElement('div');
          nameDiv.className = 'item-name';
          nameDiv.textContent = item.productName || item.product_name || 'Producto';
          var detDiv = document.createElement('div');
          detDiv.className = 'item-detail';
          detDiv.textContent = 'Cant: ' + (item.quantity || 0);
          if (item.size) detDiv.textContent += ' | ' + item.size;
          leftDiv.appendChild(nameDiv);
          leftDiv.appendChild(detDiv);
          var priceDiv = document.createElement('span');
          priceDiv.className = 'item-price';
          priceDiv.textContent = formatCurrency(item.unitPrice || item.unit_price || item.lineTotal || item.line_total || 0);
          itemDiv.appendChild(leftDiv);
          itemDiv.appendChild(priceDiv);
          detailDiv.appendChild(itemDiv);
        });
      }

      // Payment summary — using DOM methods (no innerHTML)
      var deposit = order.depositAmount || order.deposit_amount || 0;
      var total = order.totalPrice || order.total_price || 0;
      var remaining = total - deposit;
      if (total) {
        var payTitle = document.createElement('div');
        payTitle.className = 'section-title';
        payTitle.style.marginTop = '10px';
        payTitle.textContent = 'Pago';
        detailDiv.appendChild(payTitle);

        var payRow = document.createElement('div');
        payRow.className = 'pay-summary';

        function makePayItem(cls, label, value) {
          var el = document.createElement('div');
          el.className = 'pay-item ' + cls;
          el.appendChild(document.createTextNode(label));
          var valSpan = document.createElement('span');
          valSpan.className = 'pay-val';
          valSpan.textContent = formatCurrency(value);
          el.appendChild(valSpan);
          return el;
        }

        payRow.appendChild(makePayItem('total', 'Total', total));
        payRow.appendChild(makePayItem('deposit', 'Anticipo', deposit));
        payRow.appendChild(makePayItem('remaining', 'Resta', remaining));
        detailDiv.appendChild(payRow);
      }

      var labels = order.shippingLabels || order.shipping_labels || [];
      if (labels.length) {
        var trackTitle = document.createElement('div');
        trackTitle.className = 'section-title';
        trackTitle.style.marginTop = '10px';
        trackTitle.textContent = 'Envio';
        detailDiv.appendChild(trackTitle);
        labels.forEach(function(label) {
          var trackDiv = document.createElement('div');
          trackDiv.style.cssText = 'font-size:12px;color:var(--text);padding:8px 10px;background:var(--bg-soft);border-radius:8px;margin-bottom:4px;';
          trackDiv.textContent = (label.carrier || 'Carrier') + ': ' + (label.tracking || label.tracking_number || 'Sin rastreo');
          detailDiv.appendChild(trackDiv);
        });
      }

      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'quick-actions';
      var orderNumber = order.orderNumber || order.order_number || '#' + orderId;

      var copyOrderBtn = document.createElement('button');
      copyOrderBtn.className = 'quick-action';
      copyOrderBtn.textContent = 'Copiar #';
      copyOrderBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(orderNumber);
        self.showToast('Copiado: ' + orderNumber);
      });
      actionsDiv.appendChild(copyOrderBtn);

      if (labels.length && (labels[0].tracking || labels[0].tracking_number)) {
        var copyTrackBtn = document.createElement('button');
        copyTrackBtn.className = 'quick-action';
        copyTrackBtn.textContent = 'Copiar rastreo';
        copyTrackBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          navigator.clipboard.writeText(labels[0].tracking || labels[0].tracking_number);
          self.showToast('Copiado');
        });
        actionsDiv.appendChild(copyTrackBtn);
      }

      var adminBtn = document.createElement('button');
      adminBtn.className = 'quick-action';
      adminBtn.textContent = 'Abrir en admin';
      adminBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        window.open('https://vt-souvenir-frontend.onrender.com/admin-dashboard/index.html#order-' + orderId, '_blank');
      });
      actionsDiv.appendChild(adminBtn);

      var uploadDesignBtn = document.createElement('button');
      uploadDesignBtn.className = 'quick-action';
      uploadDesignBtn.textContent = 'Subir diseno';
      uploadDesignBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.triggerFileUpload('design', orderId, items[0]);
      });
      actionsDiv.appendChild(uploadDesignBtn);

      var uploadProofBtn = document.createElement('button');
      uploadProofBtn.className = 'quick-action';
      uploadProofBtn.textContent = 'Subir comprobante';
      uploadProofBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.triggerFileUpload('proof', orderId);
      });
      actionsDiv.appendChild(uploadProofBtn);

      detailDiv.appendChild(actionsDiv);
    });
  },

  // ── File Upload ──────────────────────────────────────

  triggerFileUpload: function(type, orderId, item) {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.style.display = 'none';
    this.container.appendChild(input);

    input.addEventListener('change', function() {
      if (!input.files.length) return;
      var file = input.files[0];
      var reader = new FileReader();
      reader.onload = function() {
        var base64 = reader.result.split(',')[1];
        self.showToast('Subiendo archivo...', 'info');

        if (type === 'proof') {
          self.config.sendMessage({
            type: 'UPLOAD_FILE',
            endpoint: '/api/client/upload/payment-receipt',
            fileData: base64, fileName: file.name, mimeType: file.type,
            extraFields: { phone: (self.clientData && self.clientData.phone) || '' }
          }).then(function(res) {
            if (res && (res.success || res.url)) {
              self.config.sendMessage({
                type: 'API_CALL', method: 'POST',
                endpoint: '/api/client/orders/' + orderId + '/upload-proof',
                body: { paymentProofUrl: res.url }
              }).then(function() { self.showToast('Comprobante subido'); });
            } else { self.showToast('Error al subir', 'error'); }
          });
        } else {
          self.config.sendMessage({
            type: 'UPLOAD_FILE',
            endpoint: '/api/client/upload-file',
            fileData: base64, fileName: file.name, mimeType: file.type,
            extraFields: { orderNumber: (self.selectedOrder && (self.selectedOrder.orderNumber || self.selectedOrder.order_number)) || '' }
          }).then(function(res) {
            if (res && (res.success || res.url || res.directUrl)) {
              var fileUrl = res.directUrl || res.url;
              if (item && item.id) {
                self.config.sendMessage({
                  type: 'API_CALL', method: 'POST',
                  endpoint: '/api/orders/' + orderId + '/items/' + item.id + '/attachment',
                  body: { url: fileUrl, name: file.name }
                });
              }
              self.showToast('Diseno subido');
            } else { self.showToast('Error al subir', 'error'); }
          });
        }
      };
      reader.readAsDataURL(file);
      input.remove();
    });

    input.click();
  },

  // ── Templates Tab ────────────────────────────────────

  renderTemplates: function() {
    var self = this;
    this.contentArea.textContent = '';

    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Mensajes rapidos';
    this.contentArea.appendChild(title);

    if (!this.selectedOrder && this.ordersData.length) {
      var hint = document.createElement('div');
      hint.className = 'template-hint';
      hint.style.cssText = 'margin-bottom:12px;padding:10px 12px;background:rgba(8,145,178,0.05);border-radius:8px;border:1px solid rgba(8,145,178,0.12);';
      hint.textContent = 'Haz clic en un pedido primero para usar las plantillas con sus datos.';
      this.contentArea.appendChild(hint);
    }

    var templateData = this.getTemplateData();

    TEMPLATES.forEach(function(tmpl) {
      var card = document.createElement('div');
      card.className = 'template-card';
      var canResolve = self.canResolveTemplate(tmpl, templateData);
      if (!canResolve) card.classList.add('disabled');

      var iconDiv = document.createElement('div');
      iconDiv.className = 'template-icon';
      iconDiv.textContent = tmpl.icon || '\u{1F4AC}';

      var bodyDiv = document.createElement('div');
      bodyDiv.className = 'template-body';
      var nameDiv = document.createElement('div');
      nameDiv.className = 'template-name';
      nameDiv.textContent = tmpl.name;
      var previewDiv = document.createElement('div');
      previewDiv.className = 'template-preview';
      previewDiv.textContent = canResolve ? self.resolveTemplate(tmpl.msg, templateData) : tmpl.msg.replace(/\{(\w+)\}/g, '[sin dato]');
      bodyDiv.appendChild(nameDiv);
      bodyDiv.appendChild(previewDiv);

      card.appendChild(iconDiv);
      card.appendChild(bodyDiv);

      if (canResolve) {
        card.addEventListener('click', function() {
          var resolved = self.resolveTemplate(tmpl.msg, templateData);
          var result = self.config.pasteToWhatsApp(resolved);
          if (result === 'clipboard') { self.showToast('Copiado! Presiona Ctrl+V para pegar', 'info'); }
          else if (result) { self.showToast('Mensaje pegado en el chat'); }
          else { self.showToast('No se encontro el campo de texto', 'error'); }
        });
      }

      self.contentArea.appendChild(card);
    });
  },

  getTemplateData: function() {
    var data = {};
    if (this.clientData) { data.name = this.clientData.name || ''; }
    if (this.selectedOrder) {
      var o = this.selectedOrder;
      data.orderNumber = o.orderNumber || o.order_number || '';
      var total = Number(o.totalPrice || o.total_price || 0);
      var deposit = Number(o.depositAmount || o.deposit_amount || 0);
      data.total = total.toLocaleString('es-MX');
      data.deposit = deposit.toLocaleString('es-MX');
      data.remaining = (total - deposit).toLocaleString('es-MX');
      var labels = o.shippingLabels || o.shipping_labels || [];
      if (labels.length) {
        data.tracking = labels[0].tracking || labels[0].tracking_number || '';
        data.carrier = labels[0].carrier || '';
      }
    } else if (this.ordersData.length) {
      var first = this.ordersData[0];
      data.orderNumber = first.orderNumber || first.order_number || '';
      data.total = Number(first.totalPrice || first.total_price || 0).toLocaleString('es-MX');
    }
    return data;
  },

  canResolveTemplate: function(tmpl, data) {
    return tmpl.requires.every(function(key) { return data[key] && data[key] !== ''; });
  },

  resolveTemplate: function(msg, data) {
    return msg.replace(/\{(\w+)\}/g, function(match, key) { return data[key] || '[sin dato]'; });
  },

  // ── New Order Form ───────────────────────────────────

  renderNewOrderForm: function() {
    var self = this;
    this.contentArea.textContent = '';

    var form = document.createElement('div');
    form.className = 'order-form';
    var isNew = this.clientData && this.clientData.isNew;

    if (isNew) {
      form.appendChild(this.createFormGroup('Nombre del cliente *', 'text', 'clientName', ''));
      form.appendChild(this.createFormGroup('Email', 'email', 'clientEmail', ''));
    } else {
      var clientLabel = document.createElement('div');
      clientLabel.style.cssText = 'font-size:12px;color:var(--verde);margin-bottom:14px;padding:10px 12px;background:rgba(45,138,78,0.06);border-radius:8px;border:1px solid rgba(45,138,78,0.15);font-weight:600;';
      clientLabel.textContent = 'Cliente: ' + ((this.clientData && this.clientData.name) || 'Desconocido');
      form.appendChild(clientLabel);
    }

    var itemsTitle = document.createElement('div');
    itemsTitle.className = 'section-title';
    itemsTitle.textContent = 'Productos';
    form.appendChild(itemsTitle);

    this.itemsContainer = document.createElement('div');
    this.itemsContainer.id = 'itemsContainer';
    form.appendChild(this.itemsContainer);
    this.addItemRow();

    var addBtn = document.createElement('button');
    addBtn.className = 'add-item-btn';
    addBtn.textContent = '+ Agregar producto';
    addBtn.addEventListener('click', function() { self.addItemRow(); });
    form.appendChild(addBtn);

    form.appendChild(this.createFormGroup('Evento / Ocasion', 'text', 'eventType', 'Ej: Boda, XV anos, Corporativo'));

    var notesGroup = document.createElement('div');
    notesGroup.className = 'form-group';
    var notesLabel = document.createElement('label');
    notesLabel.textContent = 'Notas';
    var notesArea = document.createElement('textarea');
    notesArea.id = 'orderNotes';
    notesArea.placeholder = 'Notas adicionales...';
    notesGroup.appendChild(notesLabel);
    notesGroup.appendChild(notesArea);
    form.appendChild(notesGroup);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'submit-btn';
    submitBtn.textContent = 'Crear pedido';
    submitBtn.addEventListener('click', function() { self.submitOrder(submitBtn); });
    form.appendChild(submitBtn);

    this.contentArea.appendChild(form);
  },

  createFormGroup: function(labelText, type, id, placeholder) {
    var group = document.createElement('div');
    group.className = 'form-group';
    var label = document.createElement('label');
    label.textContent = labelText;
    var input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.placeholder = placeholder || '';
    group.appendChild(label);
    group.appendChild(input);
    return group;
  },

  addItemRow: function() {
    var self = this;
    var itemIndex = this.itemsContainer.children.length;
    var row = document.createElement('div');
    row.className = 'item-row';

    var header = document.createElement('div');
    header.className = 'item-row-header';
    var itemLabel = document.createElement('span');
    itemLabel.className = 'item-row-label';
    itemLabel.textContent = 'PRODUCTO ' + (itemIndex + 1);
    header.appendChild(itemLabel);

    if (itemIndex > 0) {
      var removeBtn = document.createElement('button');
      removeBtn.className = 'remove-item';
      removeBtn.textContent = '\u2715';
      removeBtn.addEventListener('click', function() { row.remove(); });
      header.appendChild(removeBtn);
    }
    row.appendChild(header);

    var productGroup = document.createElement('div');
    productGroup.className = 'form-group';
    var productLabel = document.createElement('label');
    productLabel.textContent = 'Producto *';
    var productSelect = document.createElement('select');
    productSelect.className = 'product-select';
    var defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Seleccionar...';
    productSelect.appendChild(defaultOpt);

    if (this.productsCache) {
      this.productsCache.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + ' - ' + formatCurrency(p.base_price || p.basePrice || p.price || 0);
        opt.dataset.name = p.name;
        opt.dataset.price = p.base_price || p.basePrice || p.price || 0;
        productSelect.appendChild(opt);
      });
    }
    productGroup.appendChild(productLabel);
    productGroup.appendChild(productSelect);
    row.appendChild(productGroup);

    var qtyGroup = document.createElement('div');
    qtyGroup.className = 'form-group';
    var qtyLabel = document.createElement('label');
    qtyLabel.textContent = 'Cantidad *';
    var qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty-input';
    qtyInput.min = '1';
    qtyInput.value = '50';
    qtyInput.placeholder = '50';
    qtyGroup.appendChild(qtyLabel);
    qtyGroup.appendChild(qtyInput);
    row.appendChild(qtyGroup);

    var sizeGroup = document.createElement('div');
    sizeGroup.className = 'form-group';
    var sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Tamano';
    var sizeInput = document.createElement('input');
    sizeInput.type = 'text';
    sizeInput.className = 'size-input';
    sizeInput.placeholder = 'Ej: 5x5cm';
    sizeGroup.appendChild(sizeLabel);
    sizeGroup.appendChild(sizeInput);
    row.appendChild(sizeGroup);

    var dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.textContent = 'Arrastra un diseno o haz clic';
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.pdf';
    fileInput.style.display = 'none';
    var uploadRow = document.createElement('div');
    uploadRow.className = 'upload-row';
    uploadRow.style.display = 'none';

    dropZone.addEventListener('click', function() { fileInput.click(); });
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
    fileInput.addEventListener('change', function() {
      if (!fileInput.files.length) return;
      var file = fileInput.files[0];
      dropZone.style.display = 'none';
      uploadRow.style.display = 'flex';
      uploadRow.textContent = '';
      var nameSpan = document.createElement('span');
      nameSpan.className = 'upload-name';
      nameSpan.textContent = file.name;
      var removeFileBtn = document.createElement('button');
      removeFileBtn.className = 'upload-remove';
      removeFileBtn.textContent = '\u2715';
      removeFileBtn.addEventListener('click', function() {
        fileInput.value = '';
        uploadRow.style.display = 'none';
        dropZone.style.display = 'block';
      });
      uploadRow.appendChild(nameSpan);
      uploadRow.appendChild(removeFileBtn);
    });

    row.appendChild(dropZone);
    row.appendChild(fileInput);
    row.appendChild(uploadRow);
    this.itemsContainer.appendChild(row);
  },

  submitOrder: function(submitBtn) {
    var self = this;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando pedido...';

    var isNew = this.clientData && this.clientData.isNew;
    var clientName = isNew ? (this.contentArea.querySelector('#clientName') || {}).value || '' : (this.clientData && this.clientData.name) || '';
    var clientPhone = (this.clientData && (this.clientData.phone || this.clientData._phone)) || '';
    var clientEmail = isNew ? (this.contentArea.querySelector('#clientEmail') || {}).value || '' : (this.clientData && this.clientData.email) || '';

    if (!clientName && isNew) {
      self.showToast('Nombre del cliente requerido', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear pedido';
      return;
    }

    var itemRows = this.itemsContainer.querySelectorAll('.item-row');
    var items = [];
    var fileUploads = [];

    itemRows.forEach(function(row, idx) {
      var select = row.querySelector('.product-select');
      var qty = row.querySelector('.qty-input');
      var size = row.querySelector('.size-input');
      var fileInput = row.querySelector('input[type="file"]');
      if (!select.value) return;
      var selectedOption = select.options[select.selectedIndex];
      items.push({
        productId: Number(select.value),
        productName: selectedOption.dataset.name || '',
        quantity: Number(qty.value) || 50,
        size: size.value || '',
        unitPrice: Number(selectedOption.dataset.price) || 0
      });
      if (fileInput && fileInput.files.length) {
        fileUploads.push({ index: idx, file: fileInput.files[0] });
      }
    });

    if (!items.length) {
      self.showToast('Agrega al menos un producto', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear pedido';
      return;
    }

    var eventType = (this.contentArea.querySelector('#eventType') || {}).value || '';
    var notes = (this.contentArea.querySelector('#orderNotes') || {}).value || '';

    var uploadPromises = fileUploads.map(function(upload) {
      return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function() {
          var base64 = reader.result.split(',')[1];
          self.config.sendMessage({
            type: 'UPLOAD_FILE', endpoint: '/api/client/upload-file',
            fileData: base64, fileName: upload.file.name, mimeType: upload.file.type
          }).then(function(res) {
            resolve({ index: upload.index, url: (res && (res.directUrl || res.url)) || null });
          });
        };
        reader.readAsDataURL(upload.file);
      });
    });

    Promise.all(uploadPromises).then(function(uploadResults) {
      uploadResults.forEach(function(result) {
        if (result.url && items[result.index]) { items[result.index].design = result.url; }
      });

      self.config.sendMessage({
        type: 'API_CALL', method: 'POST', endpoint: '/api/orders',
        body: { clientName: clientName, clientPhone: clientPhone, clientEmail: clientEmail, items: items, eventType: eventType, notes: notes }
      }).then(function(res) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear pedido';

        if (res && (res.success || res.orderId || res.order)) {
          var orderId = res.orderId || (res.order && res.order.id);
          var orderNumber = res.orderNumber || (res.order && res.order.orderNumber) || '#' + orderId;
          var total = res.totalPrice || res.total || (res.order && res.order.totalPrice) || 0;
          var deposit = res.depositAmount || res.deposit || (res.order && res.order.depositAmount) || 0;
          self.showToast('Pedido creado: ' + orderNumber);

          var phone = clientPhone;
          var cache = self.config.getClientCache();
          delete cache[phone];

          var confirmMsg = 'Hola ' + clientName + '! Tu pedido ' + orderNumber +
            ' ha sido registrado. El total es $' + Number(total).toLocaleString('es-MX') +
            ', con un anticipo de $' + Number(deposit).toLocaleString('es-MX') + '. \u2728';

          self.contentArea.textContent = '';
          var successDiv = document.createElement('div');
          successDiv.className = 'success-screen';
          var checkDiv = document.createElement('div');
          checkDiv.className = 'success-check';
          checkDiv.textContent = '\u2713';
          var successTitle = document.createElement('div');
          successTitle.className = 'success-title';
          successTitle.textContent = 'Pedido creado';
          var orderNumText = document.createElement('div');
          orderNumText.className = 'success-order';
          orderNumText.textContent = orderNumber;

          var shareBtn = document.createElement('button');
          shareBtn.className = 'submit-btn';
          shareBtn.style.cssText = 'width:auto;padding:10px 24px;';
          shareBtn.textContent = 'Enviar confirmacion al chat';
          shareBtn.addEventListener('click', function() {
            var result = self.config.pasteToWhatsApp(confirmMsg);
            if (result === 'clipboard') { self.showToast('Copiado! Presiona Ctrl+V', 'info'); }
            else if (result) { self.showToast('Mensaje pegado'); }
          });

          var backBtn = document.createElement('button');
          backBtn.className = 'retry-btn';
          backBtn.style.marginTop = '12px';
          backBtn.textContent = 'Volver a pedidos';
          backBtn.addEventListener('click', function() {
            self.onPhoneDetected(phone);
            Object.values(self.tabs).forEach(function(el) { el.classList.remove('active'); });
            self.tabs.orders.classList.add('active');
            self.activeTab = 'orders';
          });

          successDiv.appendChild(checkDiv);
          successDiv.appendChild(successTitle);
          successDiv.appendChild(orderNumText);
          successDiv.appendChild(shareBtn);
          successDiv.appendChild(document.createElement('br'));
          successDiv.appendChild(backBtn);
          self.contentArea.appendChild(successDiv);
        } else {
          self.showToast((res && res.error) || 'Error al crear pedido', 'error');
        }
      });
    });
  }
};

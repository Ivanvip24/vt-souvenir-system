/**
 * AXKAN WhatsApp CRM — Sidebar
 * Complete sidebar UI with inlined CSS, rendered inside Shadow DOM.
 * Handles: client lookup, orders, templates, new orders, file uploads.
 */

// ── Constants ────────────────────────────────────────────

var STATUS_COLORS = {
  pending: '#3b82f6', new: '#3b82f6',
  design: '#8b5cf6',
  production: '#f97316', printing: '#f97316',
  cutting: '#eab308',
  counting: '#6366f1',
  shipping: '#14b8a6', in_transit: '#14b8a6',
  delivered: '#8ab73b',
  cancelled: '#ef4444'
};
var STATUS_DEFAULT_COLOR = '#6b7280';

var TEMPLATES = [
  { name: 'Pedido recibido', msg: 'Hola {name}! Tu pedido {orderNumber} ha sido recibido. Te mantendremos informado del avance.', requires: ['name', 'orderNumber'] },
  { name: 'Diseno listo', msg: 'Hola {name}! Tu diseno para el pedido {orderNumber} esta listo. Te lo comparto para tu aprobacion.', requires: ['name', 'orderNumber'] },
  { name: 'En produccion', msg: 'Hola {name}! Tu pedido {orderNumber} ya esta en produccion. Te avisamos cuando este listo.', requires: ['name', 'orderNumber'] },
  { name: 'Listo para envio', msg: 'Hola {name}! Tu pedido {orderNumber} esta listo para envio. El total restante es ${remaining}.', requires: ['name', 'orderNumber', 'remaining'] },
  { name: 'Numero de rastreo', msg: 'Hola {name}! Tu pedido {orderNumber} ya fue enviado. Tu numero de rastreo es: {tracking} ({carrier}).', requires: ['name', 'orderNumber', 'tracking', 'carrier'] },
  { name: 'Recordatorio de pago', msg: 'Hola {name}! Te recordamos que tu pedido {orderNumber} tiene un saldo pendiente de ${remaining}.', requires: ['name', 'orderNumber', 'remaining'] }
];

// ── Inlined CSS ──────────────────────────────────────────

var SIDEBAR_CSS = '\
:host { all: initial; }\
* { margin: 0; padding: 0; box-sizing: border-box; }\
\
.axkan-toggle {\
  position: fixed; top: 50%; right: 0; transform: translateY(-50%);\
  width: 40px; height: 40px; background: #e72a88; color: white;\
  border: none; border-radius: 10px 0 0 10px; cursor: pointer;\
  font-size: 18px; font-weight: bold; z-index: 2;\
  display: flex; align-items: center; justify-content: center;\
  box-shadow: -2px 0 8px rgba(0,0,0,0.2);\
  transition: right 0.3s ease;\
}\
.axkan-toggle.open { right: 320px; }\
\
.sidebar {\
  position: fixed; top: 0; right: 0;\
  width: 320px; height: 100vh;\
  background: #1a1a2e; color: #e0e0e0;\
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\
  font-size: 13px;\
  display: flex; flex-direction: column;\
  transform: translateX(100%);\
  transition: transform 0.3s ease;\
  overflow: hidden;\
}\
.sidebar.open { transform: translateX(0); }\
\
.sidebar-header {\
  padding: 14px 16px;\
  background: #16213e;\
  border-bottom: 1px solid #2a2a4a;\
  display: flex; align-items: center; justify-content: space-between;\
}\
.client-info { flex: 1; min-width: 0; }\
.client-name { font-size: 15px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\
.client-phone { font-size: 12px; color: #888; margin-top: 2px; }\
.close-btn {\
  background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 4px;\
}\
.close-btn:hover { color: #fff; }\
\
.phone-search {\
  display: flex; gap: 8px; padding: 8px 12px;\
  background: #16213e; border-bottom: 1px solid #2a2a4a;\
}\
.phone-search input {\
  flex: 1; padding: 8px 10px; background: #1a1a2e; border: 1px solid #333;\
  border-radius: 6px; color: #e0e0e0; font-size: 12px; outline: none;\
}\
.phone-search input:focus { border-color: #e72a88; }\
.phone-search button {\
  padding: 8px 12px; background: #e72a88; color: white; border: none;\
  border-radius: 6px; cursor: pointer; font-size: 12px;\
}\
\
.tabs {\
  display: flex; border-bottom: 1px solid #2a2a4a; background: #16213e;\
}\
.tab {\
  flex: 1; padding: 10px; text-align: center; cursor: pointer;\
  color: #888; font-size: 12px; font-weight: 500;\
  border-bottom: 2px solid transparent; transition: all 0.2s;\
}\
.tab.active { color: #e72a88; border-bottom-color: #e72a88; }\
.tab:hover { color: #ccc; }\
\
.content { flex: 1; overflow-y: auto; padding: 12px; }\
\
.order-card {\
  background: #16213e; border-radius: 8px; padding: 12px;\
  margin-bottom: 8px; cursor: pointer; transition: background 0.2s;\
}\
.order-card:hover { background: #1e2a4a; }\
.order-header { display: flex; justify-content: space-between; align-items: center; }\
.order-number { font-weight: 600; color: #fff; font-size: 13px; }\
.order-date { font-size: 11px; color: #666; }\
.order-total { font-size: 12px; color: #8ab73b; margin-top: 4px; }\
\
.status-badge {\
  padding: 2px 8px; border-radius: 10px; font-size: 10px;\
  font-weight: 600; text-transform: uppercase; color: white; display: inline-block;\
}\
\
.quick-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }\
.quick-action {\
  padding: 6px 10px; background: #2a2a4a; border: none; color: #ccc;\
  border-radius: 6px; font-size: 11px; cursor: pointer;\
}\
.quick-action:hover { background: #3a3a5a; color: #fff; }\
\
.order-detail { padding: 10px 0; border-top: 1px solid #2a2a4a; margin-top: 8px; }\
.order-item { padding: 6px 0; font-size: 12px; color: #ccc; border-bottom: 1px solid #222; }\
.order-item:last-child { border-bottom: none; }\
.item-name { font-weight: 500; color: #fff; }\
.item-detail { font-size: 11px; color: #888; }\
\
.loading, .error-state, .empty-state {\
  text-align: center; padding: 40px 20px; color: #888;\
}\
.spinner { display: inline-block; animation: pulse 1.5s infinite; font-size: 24px; }\
@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }\
.error-state { color: #ef4444; }\
.retry-btn {\
  margin-top: 12px; padding: 8px 16px; background: #333; color: #ccc;\
  border: none; border-radius: 6px; cursor: pointer; font-size: 12px;\
}\
.retry-btn:hover { background: #444; }\
\
.auth-banner {\
  padding: 10px 16px; background: #7f1d1d; color: #fca5a5;\
  font-size: 12px; text-align: center; display: none;\
}\
.auth-banner a { color: #f87171; text-decoration: underline; cursor: pointer; }\
\
.toast {\
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);\
  padding: 10px 18px; border-radius: 8px; font-size: 12px; font-weight: 500;\
  color: white; z-index: 10; transition: opacity 0.3s;\
}\
.toast.success { background: #8ab73b; }\
.toast.error { background: #ef4444; }\
.toast.info { background: #3b82f6; }\
\
.template-card {\
  background: #16213e; border-radius: 8px; padding: 10px 12px;\
  margin-bottom: 6px; cursor: pointer; transition: background 0.2s;\
}\
.template-card:hover { background: #1e2a4a; }\
.template-card.disabled { opacity: 0.4; cursor: not-allowed; }\
.template-name { font-weight: 600; color: #fff; font-size: 12px; }\
.template-preview { font-size: 11px; color: #888; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\
\
.order-form { padding: 4px 0; }\
.form-group { margin-bottom: 10px; }\
.form-group label { display: block; font-size: 11px; color: #888; margin-bottom: 4px; }\
.form-group input, .form-group select, .form-group textarea {\
  width: 100%; padding: 8px 10px; background: #1a1a2e; border: 1px solid #333;\
  border-radius: 6px; color: #e0e0e0; font-size: 12px; outline: none;\
}\
.form-group input:focus, .form-group select:focus { border-color: #e72a88; }\
.form-group textarea { resize: vertical; min-height: 50px; }\
.submit-btn {\
  width: 100%; padding: 10px; background: #e72a88; color: white;\
  border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 8px;\
}\
.submit-btn:hover { background: #c91f73; }\
.submit-btn:disabled { background: #555; cursor: not-allowed; }\
.add-item-btn {\
  width: 100%; padding: 8px; background: transparent; color: #e72a88;\
  border: 1px dashed #e72a88; border-radius: 6px; font-size: 12px; cursor: pointer; margin-top: 6px;\
}\
.add-item-btn:hover { background: rgba(231,42,136,0.1); }\
.item-row { background: #16213e; border-radius: 6px; padding: 10px; margin-bottom: 8px; }\
.item-row-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }\
.remove-item { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; }\
\
.drop-zone {\
  border: 2px dashed #333; border-radius: 8px; padding: 16px;\
  text-align: center; color: #666; font-size: 11px; cursor: pointer;\
  transition: border-color 0.2s; margin-top: 6px;\
}\
.drop-zone:hover, .drop-zone.dragover { border-color: #e72a88; color: #e72a88; }\
.upload-progress { height: 3px; background: #333; border-radius: 2px; margin-top: 6px; overflow: hidden; }\
.upload-progress .bar { height: 100%; background: #8ab73b; border-radius: 2px; width: 0%; transition: width 0.3s; }\
.upload-thumb { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; margin-top: 4px; }\
.upload-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }\
.upload-name { font-size: 11px; color: #8ab73b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\
.upload-remove { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px; }\
\
.section-title { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }\
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

    // Build toggle button
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'axkan-toggle';
    this.toggleBtn.textContent = 'A';
    this.toggleBtn.title = 'AXKAN CRM';
    this.container.appendChild(this.toggleBtn);

    // Build sidebar panel
    this.panel = document.createElement('div');
    this.panel.className = 'sidebar';
    this.container.appendChild(this.panel);

    // Auth banner
    this.authBanner = document.createElement('div');
    this.authBanner.className = 'auth-banner';
    var reloginLink = document.createElement('a');
    reloginLink.textContent = 'Iniciar sesion';
    this.authBanner.appendChild(document.createTextNode('Sesion expirada. '));
    this.authBanner.appendChild(reloginLink);
    this.panel.appendChild(this.authBanner);

    // Header
    var header = document.createElement('div');
    header.className = 'sidebar-header';
    var clientInfo = document.createElement('div');
    clientInfo.className = 'client-info';
    this.clientNameEl = document.createElement('div');
    this.clientNameEl.className = 'client-name';
    this.clientNameEl.textContent = 'AXKAN CRM';
    this.clientPhoneEl = document.createElement('div');
    this.clientPhoneEl.className = 'client-phone';
    this.clientPhoneEl.textContent = 'Selecciona un chat';
    clientInfo.appendChild(this.clientNameEl);
    clientInfo.appendChild(this.clientPhoneEl);
    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'close-btn';
    this.closeBtn.textContent = '\u2715';
    header.appendChild(clientInfo);
    header.appendChild(this.closeBtn);
    this.panel.appendChild(header);

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
      { key: 'orders', label: 'Pedidos' },
      { key: 'templates', label: 'Plantillas' },
      { key: 'newOrder', label: '+ Nuevo' }
    ];
    var self = this;
    tabNames.forEach(function(t) {
      var tab = document.createElement('div');
      tab.className = 'tab' + (t.key === 'orders' ? ' active' : '');
      tab.textContent = t.label;
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
    reloginLink.addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
    });

    // Restore sidebar state
    chrome.storage.local.get('sidebarOpen', function(data) {
      if (data.sidebarOpen) self.toggle(true);
    });

    // Pre-load products
    this.loadProducts();

    console.log('[AXKAN CRM] Sidebar initialized');
  },

  // ── Toggle ───────────────────────────────────────────

  toggle: function(forceState) {
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    this.toggleBtn.classList.toggle('open', this.isOpen);
    this.config.onToggle(this.isOpen);
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

    // Check cache
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
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(doLookup, 5000);
            return;
          }
          self.renderError('No se pudo conectar al servidor');
          return;
        }

        if (res.authExpired) {
          self.showAuthExpired();
          return;
        }

        if (res.clients && res.clients.length > 0) {
          var client = res.clients[0];
          // Fetch full details
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
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(doLookup, 5000);
        } else {
          self.renderError('No se pudo conectar al servidor');
        }
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
    this.clientNameEl.textContent = client.name || 'Cliente';
    this.clientPhoneEl.textContent = client.phone || phone || '';
    this.authBanner.style.display = 'none';
    this.renderActiveTab();
  },

  setNewClient: function(phone) {
    this.clientData = { phone: phone, isNew: true };
    this.ordersData = [];
    this.expandedOrderId = null;
    this.selectedOrder = null;
    this.clientNameEl.textContent = 'Nuevo cliente';
    this.clientPhoneEl.textContent = phone;
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
    var spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.textContent = '\u23F3';
    div.appendChild(spinner);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createTextNode('Buscando cliente...'));
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
      var phone = (self.clientData && self.clientData._phone) || self.phoneInput.value.replace(/\D/g, '');
      if (phone) self.onPhoneDetected(phone);
    });
    div.appendChild(btn);
    this.contentArea.appendChild(div);
  },

  showAuthExpired: function() {
    this.authBanner.style.display = 'block';
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
      empty.appendChild(document.createTextNode('Sin pedidos'));
      empty.appendChild(document.createElement('br'));
      empty.appendChild(document.createElement('br'));
      var newBtn = document.createElement('button');
      newBtn.className = 'submit-btn';
      newBtn.style.width = 'auto';
      newBtn.style.padding = '10px 24px';
      newBtn.textContent = 'Nuevo Pedido';
      newBtn.addEventListener('click', function() {
        Object.values(self.tabs).forEach(function(el) { el.classList.remove('active'); });
        self.tabs.newOrder.classList.add('active');
        self.activeTab = 'newOrder';
        self.renderNewOrderForm();
      });
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

      // Header row
      var headerRow = document.createElement('div');
      headerRow.className = 'order-header';
      var orderNum = document.createElement('span');
      orderNum.className = 'order-number';
      orderNum.textContent = order.orderNumber || order.order_number || '#' + order.id;
      var badge = document.createElement('span');
      badge.className = 'status-badge';
      var status = (order.status || 'unknown').toLowerCase();
      badge.style.background = STATUS_COLORS[status] || STATUS_DEFAULT_COLOR;
      badge.textContent = order.status || 'unknown';
      headerRow.appendChild(orderNum);
      headerRow.appendChild(badge);

      // Info row
      var infoRow = document.createElement('div');
      infoRow.style.cssText = 'display:flex;justify-content:space-between;margin-top:4px;';
      var dateSpan = document.createElement('span');
      dateSpan.className = 'order-date';
      dateSpan.textContent = formatDate(order.orderDate || order.order_date);
      var totalSpan = document.createElement('span');
      totalSpan.className = 'order-total';
      totalSpan.textContent = formatCurrency(order.totalPrice || order.total_price);
      infoRow.appendChild(dateSpan);
      infoRow.appendChild(totalSpan);

      // Detail container (initially hidden)
      var detailDiv = document.createElement('div');
      detailDiv.className = 'order-detail';
      detailDiv.style.display = 'none';

      card.appendChild(headerRow);
      card.appendChild(infoRow);
      card.appendChild(detailDiv);

      card.addEventListener('click', function(e) {
        if (e.target.closest('.quick-action') || e.target.closest('.drop-zone') || e.target.closest('input[type="file"]')) return;
        self.expandOrder(order.id, detailDiv, order);
      });

      self.contentArea.appendChild(card);
    });
  },

  // ── Order Expansion ──────────────────────────────────

  expandOrder: function(orderId, detailDiv, orderSummary) {
    var self = this;

    // Toggle off if already expanded
    if (this.expandedOrderId === orderId) {
      detailDiv.style.display = 'none';
      this.expandedOrderId = null;
      this.selectedOrder = null;
      return;
    }

    // Collapse previous
    if (this.expandedOrderId) {
      var prev = this.contentArea.querySelector('[data-order-id="' + this.expandedOrderId + '"] .order-detail');
      if (prev) prev.style.display = 'none';
    }

    this.expandedOrderId = orderId;
    detailDiv.style.display = 'block';
    detailDiv.textContent = '';

    var loadingText = document.createElement('div');
    loadingText.style.cssText = 'color:#888;font-size:11px;padding:8px 0;';
    loadingText.textContent = 'Cargando detalles...';
    detailDiv.appendChild(loadingText);

    this.config.sendMessage({
      type: 'API_CALL', method: 'GET',
      endpoint: '/api/orders/' + orderId
    }).then(function(res) {
      detailDiv.textContent = '';
      if (!res || res.authExpired) {
        self.showAuthExpired();
        return;
      }

      var order = res.order || res;
      self.expandedOrderDetail = order;
      self.selectedOrder = order;

      // Items
      var items = order.items || order.order_items || [];
      if (items.length) {
        var itemsTitle = document.createElement('div');
        itemsTitle.className = 'section-title';
        itemsTitle.textContent = 'Productos';
        detailDiv.appendChild(itemsTitle);

        items.forEach(function(item) {
          var itemDiv = document.createElement('div');
          itemDiv.className = 'order-item';
          var nameDiv = document.createElement('div');
          nameDiv.className = 'item-name';
          nameDiv.textContent = item.productName || item.product_name || 'Producto';
          var detDiv = document.createElement('div');
          detDiv.className = 'item-detail';
          detDiv.textContent = 'Cant: ' + (item.quantity || 0) +
            ' | ' + formatCurrency(item.unitPrice || item.unit_price || item.lineTotal || item.line_total || 0);
          itemDiv.appendChild(nameDiv);
          itemDiv.appendChild(detDiv);
          detailDiv.appendChild(itemDiv);
        });
      }

      // Payment info
      var deposit = order.depositAmount || order.deposit_amount || 0;
      var total = order.totalPrice || order.total_price || 0;
      var remaining = total - deposit;
      if (total) {
        var payTitle = document.createElement('div');
        payTitle.className = 'section-title';
        payTitle.style.marginTop = '12px';
        payTitle.textContent = 'Pago';
        var payInfo = document.createElement('div');
        payInfo.style.cssText = 'font-size:12px;color:#ccc;';
        payInfo.textContent = 'Total: ' + formatCurrency(total) + ' | Anticipo: ' + formatCurrency(deposit) + ' | Restante: ' + formatCurrency(remaining);
        detailDiv.appendChild(payTitle);
        detailDiv.appendChild(payInfo);
      }

      // Tracking
      var labels = order.shippingLabels || order.shipping_labels || [];
      if (labels.length) {
        var trackTitle = document.createElement('div');
        trackTitle.className = 'section-title';
        trackTitle.style.marginTop = '12px';
        trackTitle.textContent = 'Envio';
        detailDiv.appendChild(trackTitle);
        labels.forEach(function(label) {
          var trackDiv = document.createElement('div');
          trackDiv.style.cssText = 'font-size:12px;color:#ccc;';
          trackDiv.textContent = (label.carrier || 'Carrier') + ': ' + (label.tracking || label.tracking_number || 'Sin rastreo');
          detailDiv.appendChild(trackDiv);
        });
      }

      // Quick actions
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'quick-actions';

      var orderNumber = order.orderNumber || order.order_number || '#' + orderId;

      // Copy order #
      var copyOrderBtn = document.createElement('button');
      copyOrderBtn.className = 'quick-action';
      copyOrderBtn.textContent = 'Copiar #';
      copyOrderBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(orderNumber);
        self.showToast('Copiado: ' + orderNumber);
      });
      actionsDiv.appendChild(copyOrderBtn);

      // Copy tracking
      if (labels.length && (labels[0].tracking || labels[0].tracking_number)) {
        var copyTrackBtn = document.createElement('button');
        copyTrackBtn.className = 'quick-action';
        copyTrackBtn.textContent = 'Copiar rastreo';
        copyTrackBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var trackNum = labels[0].tracking || labels[0].tracking_number;
          navigator.clipboard.writeText(trackNum);
          self.showToast('Copiado: ' + trackNum);
        });
        actionsDiv.appendChild(copyTrackBtn);
      }

      // Open in admin
      var adminBtn = document.createElement('button');
      adminBtn.className = 'quick-action';
      adminBtn.textContent = 'Abrir en admin';
      adminBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        window.open('https://vt-souvenir-frontend.onrender.com/admin-dashboard/index.html#order-' + orderId, '_blank');
      });
      actionsDiv.appendChild(adminBtn);

      // Upload design
      var uploadDesignBtn = document.createElement('button');
      uploadDesignBtn.className = 'quick-action';
      uploadDesignBtn.textContent = 'Subir diseno';
      uploadDesignBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.triggerFileUpload('design', orderId, items[0]);
      });
      actionsDiv.appendChild(uploadDesignBtn);

      // Upload payment proof
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
            fileData: base64,
            fileName: file.name,
            mimeType: file.type,
            extraFields: { phone: (self.clientData && self.clientData.phone) || '' }
          }).then(function(res) {
            if (res && (res.success || res.url)) {
              // Attach proof to order
              self.config.sendMessage({
                type: 'API_CALL', method: 'POST',
                endpoint: '/api/client/orders/' + orderId + '/upload-proof',
                body: { paymentProofUrl: res.url }
              }).then(function() {
                self.showToast('Comprobante subido');
              });
            } else {
              self.showToast('Error al subir', 'error');
            }
          });
        } else {
          // Design file → Google Drive
          self.config.sendMessage({
            type: 'UPLOAD_FILE',
            endpoint: '/api/client/upload-file',
            fileData: base64,
            fileName: file.name,
            mimeType: file.type,
            extraFields: {
              orderNumber: (self.selectedOrder && (self.selectedOrder.orderNumber || self.selectedOrder.order_number)) || ''
            }
          }).then(function(res) {
            if (res && (res.success || res.url || res.directUrl)) {
              var fileUrl = res.directUrl || res.url;
              // Attach to first item if available
              if (item && item.id) {
                self.config.sendMessage({
                  type: 'API_CALL', method: 'POST',
                  endpoint: '/api/orders/' + orderId + '/items/' + item.id + '/attachment',
                  body: { url: fileUrl, name: file.name }
                });
              }
              self.showToast('Diseno subido');
            } else {
              self.showToast('Error al subir', 'error');
            }
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
      hint.style.cssText = 'font-size:11px;color:#888;margin-bottom:12px;';
      hint.textContent = 'Haz clic en un pedido primero para usar las plantillas con sus datos.';
      this.contentArea.appendChild(hint);
    }

    var templateData = this.getTemplateData();

    TEMPLATES.forEach(function(tmpl) {
      var card = document.createElement('div');
      card.className = 'template-card';

      var canResolve = self.canResolveTemplate(tmpl, templateData);
      if (!canResolve) card.classList.add('disabled');

      var nameDiv = document.createElement('div');
      nameDiv.className = 'template-name';
      nameDiv.textContent = tmpl.name;

      var previewDiv = document.createElement('div');
      previewDiv.className = 'template-preview';
      previewDiv.textContent = canResolve ? self.resolveTemplate(tmpl.msg, templateData) : tmpl.msg.replace(/\{(\w+)\}/g, '[sin dato]');

      card.appendChild(nameDiv);
      card.appendChild(previewDiv);

      if (canResolve) {
        card.addEventListener('click', function() {
          var resolved = self.resolveTemplate(tmpl.msg, templateData);
          var result = self.config.pasteToWhatsApp(resolved);
          if (result === 'clipboard') {
            self.showToast('Copiado! Presiona Ctrl+V para pegar', 'info');
          } else if (result) {
            self.showToast('Mensaje pegado en el chat');
          } else {
            self.showToast('No se encontro el campo de texto', 'error');
          }
        });
      }

      self.contentArea.appendChild(card);
    });
  },

  getTemplateData: function() {
    var data = {};
    if (this.clientData) {
      data.name = this.clientData.name || '';
    }
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
      // Use first order as fallback
      var first = this.ordersData[0];
      data.orderNumber = first.orderNumber || first.order_number || '';
      data.total = Number(first.totalPrice || first.total_price || 0).toLocaleString('es-MX');
    }
    return data;
  },

  canResolveTemplate: function(tmpl, data) {
    return tmpl.requires.every(function(key) {
      return data[key] && data[key] !== '';
    });
  },

  resolveTemplate: function(msg, data) {
    return msg.replace(/\{(\w+)\}/g, function(match, key) {
      return data[key] || '[sin dato]';
    });
  },

  // ── New Order Form ───────────────────────────────────

  renderNewOrderForm: function() {
    var self = this;
    this.contentArea.textContent = '';

    var form = document.createElement('div');
    form.className = 'order-form';

    var isNew = this.clientData && this.clientData.isNew;

    // Client name (editable if new)
    if (isNew) {
      form.appendChild(this.createFormGroup('Nombre del cliente *', 'text', 'clientName', ''));
      form.appendChild(this.createFormGroup('Email', 'email', 'clientEmail', ''));
    } else {
      var clientLabel = document.createElement('div');
      clientLabel.style.cssText = 'font-size:12px;color:#8ab73b;margin-bottom:12px;padding:8px;background:#16213e;border-radius:6px;';
      clientLabel.textContent = 'Cliente: ' + ((this.clientData && this.clientData.name) || 'Desconocido');
      form.appendChild(clientLabel);
    }

    // Items container
    var itemsTitle = document.createElement('div');
    itemsTitle.className = 'section-title';
    itemsTitle.textContent = 'Productos';
    form.appendChild(itemsTitle);

    this.itemsContainer = document.createElement('div');
    this.itemsContainer.id = 'itemsContainer';
    form.appendChild(this.itemsContainer);

    // Add first item
    this.addItemRow();

    // Add item button
    var addBtn = document.createElement('button');
    addBtn.className = 'add-item-btn';
    addBtn.textContent = '+ Agregar producto';
    addBtn.addEventListener('click', function() { self.addItemRow(); });
    form.appendChild(addBtn);

    // Event type
    form.appendChild(this.createFormGroup('Evento / Ocasion', 'text', 'eventType', 'Ej: Boda, XV anos, Corporativo'));

    // Notes
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

    // Submit
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
    itemLabel.style.cssText = 'font-size:12px;color:#fff;font-weight:500;';
    itemLabel.textContent = 'Producto ' + (itemIndex + 1);
    header.appendChild(itemLabel);

    if (itemIndex > 0) {
      var removeBtn = document.createElement('button');
      removeBtn.className = 'remove-item';
      removeBtn.textContent = '\u2715';
      removeBtn.addEventListener('click', function() { row.remove(); });
      header.appendChild(removeBtn);
    }
    row.appendChild(header);

    // Product select
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

    // Quantity
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

    // Size
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

    // File upload zone
    var dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.textContent = 'Arrastra un diseno o haz clic para seleccionar';
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
    var clientName = isNew ?
      (this.contentArea.querySelector('#clientName') || {}).value || '' :
      (this.clientData && this.clientData.name) || '';
    var clientPhone = (this.clientData && (this.clientData.phone || this.clientData._phone)) || '';
    var clientEmail = isNew ?
      (this.contentArea.querySelector('#clientEmail') || {}).value || '' :
      (this.clientData && this.clientData.email) || '';

    if (!clientName && isNew) {
      self.showToast('Nombre del cliente requerido', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear pedido';
      return;
    }

    // Collect items
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

    // Upload files first, then create order
    var uploadPromises = fileUploads.map(function(upload) {
      return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function() {
          var base64 = reader.result.split(',')[1];
          self.config.sendMessage({
            type: 'UPLOAD_FILE',
            endpoint: '/api/client/upload-file',
            fileData: base64,
            fileName: upload.file.name,
            mimeType: upload.file.type
          }).then(function(res) {
            resolve({ index: upload.index, url: (res && (res.directUrl || res.url)) || null });
          });
        };
        reader.readAsDataURL(upload.file);
      });
    });

    Promise.all(uploadPromises).then(function(uploadResults) {
      // Attach design URLs to items
      uploadResults.forEach(function(result) {
        if (result.url && items[result.index]) {
          items[result.index].design = result.url;
        }
      });

      var orderData = {
        clientName: clientName,
        clientPhone: clientPhone,
        clientEmail: clientEmail,
        items: items,
        eventType: eventType,
        notes: notes
      };

      self.config.sendMessage({
        type: 'API_CALL', method: 'POST',
        endpoint: '/api/orders',
        body: orderData
      }).then(function(res) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear pedido';

        if (res && (res.success || res.orderId || res.order)) {
          var orderId = res.orderId || (res.order && res.order.id);
          var orderNumber = res.orderNumber || (res.order && res.order.orderNumber) || '#' + orderId;
          var total = res.totalPrice || res.total || (res.order && res.order.totalPrice) || 0;
          var deposit = res.depositAmount || res.deposit || (res.order && res.order.depositAmount) || 0;

          self.showToast('Pedido creado: ' + orderNumber);

          // Invalidate cache
          var phone = clientPhone;
          var cache = self.config.getClientCache();
          delete cache[phone];

          // Offer to share confirmation
          var confirmMsg = 'Hola ' + clientName + '! Tu pedido ' + orderNumber +
            ' ha sido registrado. El total es $' + Number(total).toLocaleString('es-MX') +
            ', con un anticipo de $' + Number(deposit).toLocaleString('es-MX') + '.';

          self.contentArea.textContent = '';
          var successDiv = document.createElement('div');
          successDiv.style.cssText = 'text-align:center;padding:30px 16px;';
          var checkmark = document.createElement('div');
          checkmark.style.cssText = 'font-size:48px;margin-bottom:16px;';
          checkmark.textContent = '\u2705';
          var successText = document.createElement('div');
          successText.style.cssText = 'color:#8ab73b;font-size:16px;font-weight:600;margin-bottom:8px;';
          successText.textContent = 'Pedido creado';
          var orderNumText = document.createElement('div');
          orderNumText.style.cssText = 'color:#fff;font-size:14px;margin-bottom:20px;';
          orderNumText.textContent = orderNumber;

          var shareBtn = document.createElement('button');
          shareBtn.className = 'submit-btn';
          shareBtn.style.width = 'auto';
          shareBtn.style.padding = '10px 24px';
          shareBtn.textContent = 'Enviar confirmacion al chat';
          shareBtn.addEventListener('click', function() {
            var result = self.config.pasteToWhatsApp(confirmMsg);
            if (result === 'clipboard') {
              self.showToast('Copiado! Presiona Ctrl+V', 'info');
            } else if (result) {
              self.showToast('Mensaje pegado');
            }
          });

          var backBtn = document.createElement('button');
          backBtn.className = 'retry-btn';
          backBtn.style.marginTop = '12px';
          backBtn.textContent = 'Volver a pedidos';
          backBtn.addEventListener('click', function() {
            // Re-fetch client data
            self.onPhoneDetected(phone);
            Object.values(self.tabs).forEach(function(el) { el.classList.remove('active'); });
            self.tabs.orders.classList.add('active');
            self.activeTab = 'orders';
          });

          successDiv.appendChild(checkmark);
          successDiv.appendChild(successText);
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

/**
 * Admin Dashboard for VT Anunciando
 * Manages orders, approvals, and status updates
 */

// ==========================================
// CONFIGURATION
// ==========================================

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://vt-souvenir-backend.onrender.com/api';

// ==========================================
// STATE MANAGEMENT
// ==========================================

const state = {
  orders: [],
  filteredOrders: [],
  currentFilter: 'all',
  selectedOrder: null,
  searchQuery: '',
  salespersonFilter: '', // Filter by salesperson name
  selectedOrders: new Set() // Track selected order IDs for bulk operations
};

// ==========================================
// AUTHENTICATION
// ==========================================

function getAuthToken() {
  return localStorage.getItem('admin_token');
}

// Expose globally for other modules (prices.js, inventory.js, etc.)
window.getAuthToken = getAuthToken;

function getAuthHeaders() {
  const token = getAuthToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Expose globally for other modules
window.getAuthHeaders = getAuthHeaders;

window.logout = function() {
  if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
    localStorage.removeItem('admin_token');
    window.location.href = 'login.html';
  }
};

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🎨 Admin Dashboard Initialized');

  // Verify authentication
  const token = getAuthToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  initializeNavigation();
  initializeFilters();
  loadSalespeople(); // Load salespeople dropdown
  loadOrders();
  loadOrderAlerts().then(function() {
    checkStartupAlerts();
  }); // Load alerts widget + show daily popup

  // Auto-refresh every 30 seconds
  setInterval(loadOrders, 30000);
  setInterval(loadOrderAlerts, 60000); // Refresh alerts every minute
});

// ==========================================
// NAVIGATION
// ==========================================

function initializeNavigation() {
  // Main nav items
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);

      // Update active state for main items
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Remove active from sub-items
      document.querySelectorAll('.nav-sub-item').forEach(s => s.classList.remove('active'));
    });
  });

  // Sub nav items (like Calendar under Pedidos)
  const subNavButtons = document.querySelectorAll('.nav-sub-item');
  subNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);

      // Update active state for sub-items
      subNavButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Keep parent active but dimmed
      navButtons.forEach(b => b.classList.remove('active'));
    });
  });
}

function switchView(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Show selected view
  const view = document.getElementById(`${viewName}-view`);
  if (view) {
    view.classList.add('active');
  }

  // Initialize view-specific content
  if (viewName === 'analytics' && typeof initAnalytics === 'function') {
    initAnalytics();
  }

  // Initialize calendar when switching to calendar view
  if (viewName === 'calendar' && typeof initCalendar === 'function') {
    initCalendar();
  }

  // Initialize guias when switching to guias view
  if (viewName === 'guias' && typeof initGuiasView === 'function') {
    initGuiasView();
  }

  // Initialize pickups when switching to pickups view
  if (viewName === 'pickups' && typeof initPickupsView === 'function') {
    initPickupsView();
  }

  // Initialize marketplace when switching to marketplace view
  if (viewName === 'marketplace' && typeof initMarketplaceView === 'function') {
    initMarketplaceView();
  }

  // Initialize comisiones when switching to comisiones view
  if (viewName === 'comisiones' && typeof loadComisionesView === 'function') {
    loadComisionesView();
  }

  // Initialize employees when switching to employees view
  if (viewName === 'employees' && typeof loadEmployees === 'function') {
    loadEmployees();
  }

  // Initialize tasks when switching to tasks view
  if (viewName === 'tasks' && typeof loadTasksData === 'function') {
    loadTasksData();
  }

  // Initialize employee portal - load both employees and tasks
  if (viewName === 'employee-portal') {
    if (typeof loadEmployees === 'function') {
      loadEmployees();
    }
    if (typeof loadTasksData === 'function') {
      loadTasksData();
    }
  }

  // Initialize leads when switching to leads view
  if (viewName === 'leads' && typeof loadLeads === 'function') {
    loadLeads();
  }

  // Initialize WhatsApp conversations when switching to whatsapp view
  if (viewName === 'whatsapp' && typeof loadWhatsAppConversations === 'function') {
    loadWhatsAppConversations();
  } else if (viewName !== 'whatsapp' && typeof stopWhatsAppPolling === 'function') {
    stopWhatsAppPolling();
  }
}

// Switch between tabs in the Employee Portal
function switchPortalTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.portal-tab').forEach(tab => {
    if (tab.dataset.portalTab === tabName) {
      tab.classList.add('active');
      tab.style.background = 'white';
      tab.style.color = '#1f2937';
    } else {
      tab.classList.remove('active');
      tab.style.background = 'transparent';
      tab.style.color = '#6b7280';
    }
  });

  // Show/hide content
  document.getElementById('portal-employees-content').style.display = tabName === 'employees' ? 'block' : 'none';
  document.getElementById('portal-tasks-content').style.display = tabName === 'tasks' ? 'block' : 'none';
}

window.switchPortalTab = switchPortalTab;

// ==========================================
// ORDER ALERTS WIDGET
// ==========================================

let alertsState = {
  data: null,
  rawData: null,
  activeCategory: null, // 'critical', 'warning', 'upcoming'
  isExpanded: false
};

// ==========================================
// ALERT DISMISSAL SYSTEM
// ==========================================

var DISMISSED_ALERTS_KEY = 'dismissedAlerts';
var LAST_POPUP_DATE_KEY = 'lastAlertPopupDate';

function getDismissedAlerts() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_ALERTS_KEY) || '{}');
  } catch (e) { return {}; }
}

function saveDismissedAlerts(dismissed) {
  localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(dismissed));
}

function dismissAlert(orderId, alertType, mode) {
  var dismissed = getDismissedAlerts();
  var key = orderId + '_' + alertType;
  if (mode === 'permanent') {
    dismissed[key] = { type: 'permanent' };
  } else {
    // Snooze for 1 hour
    dismissed[key] = { type: 'snoozed', until: Date.now() + 60 * 60 * 1000 };
  }
  saveDismissedAlerts(dismissed);
}

function cleanupExpiredSnoozes() {
  var dismissed = getDismissedAlerts();
  var now = Date.now();
  var changed = false;
  Object.keys(dismissed).forEach(function(key) {
    if (dismissed[key].type === 'snoozed' && dismissed[key].until <= now) {
      delete dismissed[key];
      changed = true;
    }
  });
  if (changed) saveDismissedAlerts(dismissed);
}

function filterDismissedAlerts(alertsData) {
  if (!alertsData) return alertsData;
  cleanupExpiredSnoozes();
  var dismissed = getDismissedAlerts();

  var filterFn = function(alerts) {
    return (alerts || []).filter(function(a) {
      var key = a.id + '_' + a.alertType;
      var entry = dismissed[key];
      if (!entry) return true;
      if (entry.type === 'permanent') return false;
      if (entry.type === 'snoozed' && entry.until > Date.now()) return false;
      return true;
    });
  };

  var filtered = {
    critical: filterFn(alertsData.critical),
    warning: filterFn(alertsData.warning),
    upcoming: filterFn(alertsData.upcoming)
  };
  filtered.summary = {
    criticalCount: filtered.critical.length,
    warningCount: filtered.warning.length,
    upcomingCount: filtered.upcoming.length,
    totalAlerts: filtered.critical.length + filtered.warning.length + filtered.upcoming.length
  };
  return filtered;
}

function markAllAlertsRead() {
  if (!alertsState.data) return;
  var all = (alertsState.data.critical || [])
    .concat(alertsState.data.warning || [])
    .concat(alertsState.data.upcoming || []);
  all.forEach(function(a) { dismissAlert(a.id, a.alertType, 'permanent'); });
}

async function loadOrderAlerts() {
  try {
    const response = await fetch(`${API_BASE}/alerts`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load alerts');
    }

    const result = await response.json();
    if (result.success) {
      alertsState.rawData = result.data;
      alertsState.data = filterDismissedAlerts(result.data);
      renderAlertsWidget();
      updateNotificationBell();
    }
  } catch (error) {
    console.error('Error loading alerts:', error);
  }
}

function renderAlertsWidget() {
  const widget = document.getElementById('order-alerts-widget');
  if (!widget) return;
  const { data, activeCategory, isExpanded } = alertsState;

  if (!data || data.summary.totalAlerts === 0) {
    widget.innerHTML = `
      <div class="alerts-empty">
        <div class="empty-icon">✅</div>
        <p style="font-weight: 600; margin-bottom: 4px;">¡Todo en orden!</p>
        <p style="font-size: 13px;">No hay alertas pendientes</p>
      </div>
    `;
    return;
  }

  // Build the alerts list for the active category
  let alertsListHtml = '';
  if (activeCategory && data[activeCategory] && data[activeCategory].length > 0) {
    alertsListHtml = `
      <div class="alerts-list ${isExpanded ? '' : 'hidden'}">
        ${data[activeCategory].map(alert => `
          <div class="alert-item ${activeCategory}" onclick="viewOrderFromAlert(${alert.id})">
            <div class="alert-content">
              <div class="alert-title">${alert.alertTitle}</div>
              <div class="alert-meta">
                <strong>${alert.clientName}</strong> • ${formatCurrency(alert.totalPrice)}
                ${alert.alertMessage ? ` • ${alert.alertMessage}` : ''}
              </div>
            </div>
            <span class="alert-order">${alert.orderNumber}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  widget.innerHTML = `
    <div class="alerts-summary">
      <div class="alert-summary-card critical ${activeCategory === 'critical' ? 'active' : ''}"
           onclick="toggleAlertCategory('critical')">
        <div class="count">${data.summary.criticalCount}</div>
        <div class="label">🔴 Críticos</div>
      </div>
      <div class="alert-summary-card warning ${activeCategory === 'warning' ? 'active' : ''}"
           onclick="toggleAlertCategory('warning')">
        <div class="count">${data.summary.warningCount}</div>
        <div class="label">🟡 Advertencias</div>
      </div>
      <div class="alert-summary-card upcoming ${activeCategory === 'upcoming' ? 'active' : ''}"
           onclick="toggleAlertCategory('upcoming')">
        <div class="count">${data.summary.upcomingCount}</div>
        <div class="label">🔵 Próximos</div>
      </div>
    </div>
    ${alertsListHtml}
    ${activeCategory && data[activeCategory] && data[activeCategory].length > 0 ? `
      <button class="alerts-toggle" onclick="toggleAlertsExpand()">
        ${isExpanded ? '▲ Ocultar detalles' : '▼ Ver ' + data[activeCategory].length + ' alertas'}
      </button>
    ` : ''}
  `;
}

window.toggleAlertCategory = function(category) {
  if (alertsState.activeCategory === category) {
    // Toggle off
    alertsState.activeCategory = null;
    alertsState.isExpanded = false;
  } else {
    // Switch category
    alertsState.activeCategory = category;
    alertsState.isExpanded = true;
  }
  renderAlertsWidget();
};

window.toggleAlertsExpand = function() {
  alertsState.isExpanded = !alertsState.isExpanded;
  renderAlertsWidget();
};

window.viewOrderFromAlert = function(orderId) {
  // Find the order and show detail
  const order = state.orders.find(o => Number(o.id) === Number(orderId));
  if (order) {
    showOrderDetail(order);
  } else {
    // If order not in current state, load it
    loadOrderDetail(orderId);
  }
};

async function loadOrderDetail(orderId) {
  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}`, {
      headers: getAuthHeaders()
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        showOrderDetail(result.data);
      }
    }
  } catch (error) {
    console.error('Error loading order detail:', error);
  }
}

// ==========================================
// STARTUP ALERTS MODAL
// ==========================================

function checkStartupAlerts() {
  var today = new Date().toISOString().split('T')[0];
  var lastShown = localStorage.getItem(LAST_POPUP_DATE_KEY);
  if (lastShown === today) return;

  var data = alertsState.data;
  if (!data) return;

  var importantAlerts = (data.critical || []).concat(data.warning || []);
  if (importantAlerts.length === 0) return;

  renderStartupModal(importantAlerts.slice(0, 8));
  document.getElementById('startup-alerts-modal').classList.remove('hidden');
  localStorage.setItem(LAST_POPUP_DATE_KEY, today);
}

function renderStartupModal(alerts) {
  var body = document.getElementById('startup-alerts-body');
  var title = document.getElementById('startup-alerts-title');

  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Buenos dias' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  title.textContent = greeting + ' \u2014 ' + alerts.length + ' alerta(s) importante(s)';

  // Build with safe DOM methods
  var list = document.createElement('div');
  list.className = 'startup-alerts-list';

  alerts.forEach(function(alert) {
    var categoryClass = alert.priority <= 4 ? 'critical' : 'warning';

    var item = document.createElement('div');
    item.className = 'startup-alert-item ' + categoryClass;

    var content = document.createElement('div');
    content.className = 'startup-alert-content';
    content.addEventListener('click', function() {
      viewOrderFromAlert(alert.id);
      closeStartupAlerts();
    });

    var titleEl = document.createElement('div');
    titleEl.className = 'startup-alert-title';
    titleEl.textContent = alert.alertTitle;

    var meta = document.createElement('div');
    meta.className = 'startup-alert-meta';
    meta.textContent = alert.clientName + ' \u2014 ' + alert.orderNumber +
      (alert.daysSinceCreation ? ' \u2014 ' + alert.daysSinceCreation + ' dias' : '');

    var msg = document.createElement('div');
    msg.className = 'startup-alert-message';
    msg.textContent = alert.alertMessage || '';

    content.appendChild(titleEl);
    content.appendChild(meta);
    content.appendChild(msg);

    var actions = document.createElement('div');
    actions.className = 'startup-alert-actions';

    var btnDismiss = document.createElement('button');
    btnDismiss.className = 'btn-dismiss-permanent';
    btnDismiss.title = 'No recordar mas';
    btnDismiss.textContent = '\u2715';
    btnDismiss.addEventListener('click', function(e) {
      e.stopPropagation();
      dismissAlertFromUI(alert.id, alert.alertType, 'permanent', item);
    });

    var btnSnooze = document.createElement('button');
    btnSnooze.className = 'btn-dismiss-snooze';
    btnSnooze.title = 'Recordar despues (1h)';
    btnSnooze.textContent = '\u23F0';
    btnSnooze.addEventListener('click', function(e) {
      e.stopPropagation();
      dismissAlertFromUI(alert.id, alert.alertType, 'snoozed', item);
    });

    actions.appendChild(btnDismiss);
    actions.appendChild(btnSnooze);

    item.appendChild(content);
    item.appendChild(actions);
    list.appendChild(item);
  });

  body.textContent = '';
  body.appendChild(list);
}

function dismissAlertFromUI(orderId, alertType, mode, el) {
  dismissAlert(orderId, alertType, mode);
  if (el) {
    el.style.transition = 'opacity 0.3s, max-height 0.3s';
    el.style.opacity = '0';
    el.style.maxHeight = '0';
    el.style.overflow = 'hidden';
    setTimeout(function() { el.remove(); }, 300);
  }
  alertsState.data = filterDismissedAlerts(alertsState.rawData);
  updateNotificationBell();
  renderAlertsWidget();
}

function closeStartupAlerts() {
  document.getElementById('startup-alerts-modal').classList.add('hidden');
}

window.closeStartupAlerts = closeStartupAlerts;
window.dismissAlertFromUI = dismissAlertFromUI;

// ==========================================
// NOTIFICATION CENTER
// ==========================================

function updateNotificationBell() {
  var badge = document.getElementById('notification-badge');
  if (!badge || !alertsState.data) return;

  var summary = alertsState.data.summary;
  var total = summary.totalAlerts;

  if (total === 0) {
    badge.style.display = 'none';
    return;
  }

  badge.textContent = total > 99 ? '99+' : total;
  badge.style.display = 'flex';

  badge.classList.remove('badge-critical', 'badge-warning', 'badge-info');
  if (summary.criticalCount > 0) {
    badge.classList.add('badge-critical');
  } else if (summary.warningCount > 0) {
    badge.classList.add('badge-warning');
  } else {
    badge.classList.add('badge-info');
  }
}

function toggleNotificationCenter() {
  var panel = document.getElementById('notification-panel');
  var isVisible = !panel.classList.contains('hidden');

  if (isVisible) {
    panel.classList.add('hidden');
    document.removeEventListener('click', closeNotifOnOutsideClick);
  } else {
    renderNotificationPanel();
    panel.classList.remove('hidden');
    setTimeout(function() {
      document.addEventListener('click', closeNotifOnOutsideClick);
    }, 0);
  }
}

function closeNotifOnOutsideClick(e) {
  var wrapper = document.getElementById('notification-bell-wrapper');
  if (!wrapper.contains(e.target)) {
    document.getElementById('notification-panel').classList.add('hidden');
    document.removeEventListener('click', closeNotifOnOutsideClick);
  }
}

function renderNotificationPanel() {
  var data = alertsState.data;
  if (!data) return;

  var summaryEl = document.getElementById('notif-panel-summary');
  var listEl = document.getElementById('notif-panel-list');
  var footerText = document.getElementById('notif-footer-text');

  // Summary cards — safe DOM
  summaryEl.textContent = '';
  var categories = [
    { key: 'critical', label: 'Criticos', count: data.summary.criticalCount },
    { key: 'warning', label: 'Advertencias', count: data.summary.warningCount },
    { key: 'upcoming', label: 'Proximos', count: data.summary.upcomingCount }
  ];
  categories.forEach(function(cat) {
    var card = document.createElement('div');
    card.className = 'notif-summary-card ' + cat.key;
    var countSpan = document.createElement('span');
    countSpan.className = 'count';
    countSpan.textContent = cat.count;
    var labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = cat.label;
    card.appendChild(countSpan);
    card.appendChild(labelSpan);
    summaryEl.appendChild(card);
  });

  // Alert list — safe DOM
  var allAlerts = (data.critical || []).map(function(a) { return Object.assign({}, a, { category: 'critical' }); })
    .concat((data.warning || []).map(function(a) { return Object.assign({}, a, { category: 'warning' }); }))
    .concat((data.upcoming || []).map(function(a) { return Object.assign({}, a, { category: 'upcoming' }); }));

  listEl.textContent = '';

  if (allAlerts.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'notif-empty';
    var emptyIcon = document.createElement('div');
    emptyIcon.style.fontSize = '32px';
    emptyIcon.style.marginBottom = '8px';
    emptyIcon.textContent = '\u2705';
    var emptyText = document.createElement('p');
    emptyText.textContent = 'No hay alertas pendientes';
    empty.appendChild(emptyIcon);
    empty.appendChild(emptyText);
    listEl.appendChild(empty);
  } else {
    allAlerts.forEach(function(alert) {
      var item = document.createElement('div');
      item.className = 'notif-alert-item ' + alert.category;
      item.addEventListener('click', function() {
        viewOrderFromAlert(alert.id);
        toggleNotificationCenter();
      });

      var content = document.createElement('div');
      content.className = 'notif-alert-content';
      var titleEl = document.createElement('div');
      titleEl.className = 'notif-alert-title';
      titleEl.textContent = alert.alertTitle;
      var metaEl = document.createElement('div');
      metaEl.className = 'notif-alert-meta';
      metaEl.textContent = alert.clientName + ' \u2014 ' + alert.orderNumber;
      content.appendChild(titleEl);
      content.appendChild(metaEl);

      var actions = document.createElement('div');
      actions.className = 'notif-alert-actions';
      actions.addEventListener('click', function(e) { e.stopPropagation(); });

      var btnX = document.createElement('button');
      btnX.className = 'btn-dismiss-permanent';
      btnX.title = 'No recordar mas';
      btnX.textContent = '\u2715';
      btnX.addEventListener('click', function() {
        dismissAlertFromUI(alert.id, alert.alertType, 'permanent', item);
        renderNotificationPanel();
      });

      var btnClock = document.createElement('button');
      btnClock.className = 'btn-dismiss-snooze';
      btnClock.title = 'Recordar despues (1h)';
      btnClock.textContent = '\u23F0';
      btnClock.addEventListener('click', function() {
        dismissAlertFromUI(alert.id, alert.alertType, 'snoozed', item);
        renderNotificationPanel();
      });

      actions.appendChild(btnX);
      actions.appendChild(btnClock);

      item.appendChild(content);
      item.appendChild(actions);
      listEl.appendChild(item);
    });
  }

  footerText.textContent = data.summary.totalAlerts + ' alerta(s) activa(s)';
}

function markAllAlertsReadAndRefresh() {
  markAllAlertsRead();
  alertsState.data = filterDismissedAlerts(alertsState.rawData);
  updateNotificationBell();
  renderNotificationPanel();
  renderAlertsWidget();
}

window.toggleNotificationCenter = toggleNotificationCenter;
window.markAllAlertsReadAndRefresh = markAllAlertsReadAndRefresh;
window.openNotificationCenter = function() {
  var panel = document.getElementById('notification-panel');
  if (panel && panel.classList.contains('hidden')) {
    toggleNotificationCenter();
  }
};

// ==========================================
// FILTERS
// ==========================================

function initializeFilters() {
  const filterButtons = document.querySelectorAll('.filter-btn');

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      applyFilter(filter);

      // Update active state
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function applyFilter(filter) {
  state.currentFilter = filter;

  // First apply status filter
  let filtered = state.orders;

  if (filter === 'completed') {
    // Completed = archived orders (completo or cancelado)
    filtered = filtered.filter(order =>
      order.archiveStatus === 'completo' || order.archiveStatus === 'cancelado'
    );
  } else if (filter === 'all') {
    // All = only non-archived orders
    filtered = filtered.filter(order =>
      !order.archiveStatus || order.archiveStatus === 'active'
    );
  } else {
    // Other filters (pending_review, approved) - exclude archived orders
    filtered = filtered.filter(order => {
      const isArchived = order.archiveStatus && order.archiveStatus !== 'active';
      return !isArchived && order.approvalStatus === filter;
    });
  }

  // Then apply search filter if there's a search query
  if (state.searchQuery && state.searchQuery.trim() !== '') {
    const query = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(order => {
      return (
        (order.orderNumber && order.orderNumber.toLowerCase().includes(query)) ||
        (order.clientName && order.clientName.toLowerCase().includes(query)) ||
        (order.clientPhone && order.clientPhone.toString().includes(query)) ||
        (order.status && order.status.toLowerCase().includes(query))
      );
    });
  }

  // Apply salesperson filter if set
  if (state.salespersonFilter && state.salespersonFilter.trim() !== '') {
    const salesperson = state.salespersonFilter.toLowerCase().trim();
    filtered = filtered.filter(order => {
      return order.salesRep && order.salesRep.toLowerCase() === salesperson;
    });
  }

  state.filteredOrders = filtered;
  renderOrders();
}

// ==========================================
// LOAD ORDERS
// ==========================================

async function loadOrders() {
  const loading = document.getElementById('orders-loading');
  const container = document.getElementById('orders-container');
  const emptyState = document.getElementById('empty-state');
  const refreshBtn = document.querySelector('.btn-refresh');

  // Show loading state
  loading.classList.remove('hidden');
  container.innerHTML = '';
  emptyState.classList.add('hidden');
  refreshBtn?.classList.add('refreshing');

  try {
    const response = await fetch(`${API_BASE}/orders`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error al cargar pedidos');
    }

    state.orders = data.data || [];
    applyFilter(state.currentFilter);
    updateStats();

    // Initialize bulk action bar
    createBulkActionBar();

    loading.classList.add('hidden');
    refreshBtn?.classList.remove('refreshing');

    if (state.filteredOrders.length === 0) {
      emptyState.classList.remove('hidden');
    }

  } catch (error) {
    console.error('Error loading orders:', error);
    loading.innerHTML = `
      <p style="color: var(--danger)">
        ⚠️ Error al cargar pedidos. Por favor recarga la página.
      </p>
    `;
    refreshBtn?.classList.remove('refreshing');
  }
}

// ==========================================
// RENDER ORDERS
// ==========================================

function renderOrders() {
  const container = document.getElementById('orders-container');
  const emptyState = document.getElementById('empty-state');

  container.innerHTML = '';

  if (state.filteredOrders.length === 0) {
    emptyState.classList.remove('hidden');
    // Refresh Lucide icons for empty state
    if (window.refreshIcons) window.refreshIcons();
    return;
  }

  emptyState.classList.add('hidden');

  state.filteredOrders.forEach(order => {
    const card = createOrderCard(order);
    container.appendChild(card);
  });

  // Refresh Lucide icons after rendering
  if (window.refreshIcons) window.refreshIcons();
}

function createOrderCard(order) {
  const card = document.createElement('div');
  card.className = 'order-card';

  // Add special styling for archived orders
  const isArchived = order.archiveStatus && order.archiveStatus !== 'active';
  if (isArchived) {
    card.className += ' order-completed';
  }

  card.onclick = () => showOrderDetail(order.id);

  const statusClass = `status-${order.approvalStatus}`;
  const statusText = getStatusText(order.approvalStatus);

  // Format phone for WhatsApp (remove non-digits, add Mexico code if needed)
  const phoneDigits = (order.clientPhone || '').toString().replace(/\D/g, '');
  const whatsappNumber = phoneDigits.length === 10 ? `52${phoneDigits}` : phoneDigits;

  card.innerHTML = `
    <div class="order-header">
      ${!isArchived ? `
        <label class="order-checkbox" onclick="event.stopPropagation();">
          <input type="checkbox"
                 data-order-id="${order.id}"
                 onchange="toggleOrderSelection(${order.id}, this.checked)"
                 ${state.selectedOrders.has(Number(order.id)) ? 'checked' : ''}>
        </label>
      ` : ''}
      <div class="order-title">
        <h3>${order.orderNumber}</h3>
        <span class="status-badge ${statusClass}">${statusText}</span>
        ${order.salesRep ? (() => {
          const repColor = getSalesRepColor(order.salesRep);
          return `<span class="sales-rep-badge" style="background: ${repColor.bg}; color: ${repColor.color}; border-color: ${repColor.border};">${order.salesRep}</span>`;
        })() : ''}
      </div>
      ${!isArchived && order.approvalStatus === 'pending_review' ? `
        <div class="quick-actions">
          <button class="quick-action-btn approve-btn" onclick="event.stopPropagation(); approveOrder(${order.id});" title="Aprobar pedido">
            ✓
          </button>
          <button class="quick-action-btn reject-btn" onclick="event.stopPropagation(); rejectOrder(${order.id});" title="Rechazar pedido">
            ✕
          </button>
        </div>
      ` : ''}
      <div class="order-date-header">
        <span class="date-label">FECHA DEL PEDIDO</span>
        <span class="date-value">${formatDateFull(order.createdAt || order.orderDate)}</span>
      </div>
      ${!isArchived ? `
        <div class="archive-actions">
          <button class="archive-btn complete" onclick="event.stopPropagation(); archiveOrder(${order.id}, 'completo');">
            ✓ Completo
          </button>
          <button class="archive-btn cancel" onclick="event.stopPropagation(); archiveOrder(${order.id}, 'cancelado');">
            ✕ Cancelado
          </button>
        </div>
      ` : `
        <div class="archive-status-badge ${order.archiveStatus}">
          ${order.archiveStatus === 'completo' ? '✓ Completo' : '✕ Cancelado'}
        </div>
      `}
    </div>

    <div class="order-body">
      <div class="order-left">
        <div class="client-info">
          <span class="info-label">CLIENTE</span>
          <span class="info-value">
            ${order.clientName}
            ${order.clientPhone ? `
              <a href="https://wa.me/${whatsappNumber}" target="whatsapp-chat" class="whatsapp-btn-card" onclick="event.stopPropagation();" title="Enviar WhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                </svg>
              </a>
            ` : ''}
          </span>
        </div>
        <div class="order-totals">
          <span class="total-label">TOTAL</span>
          <span class="total-value">${formatCurrency(order.totalPrice)}</span>
          <div class="payment-checkboxes" title="Estado de pagos">
            <span class="payment-check ${order.approvalStatus === 'approved' || order.depositPaid ? 'checked' : ''}" title="Anticipo 50%">
              ${order.approvalStatus === 'approved' || order.depositPaid ? '☑' : '☐'} 1
            </span>
            <span class="payment-check ${order.secondPaymentReceipt && order.status === 'delivered' ? 'checked' : order.secondPaymentReceipt ? 'pending' : ''}" title="Pago final 50%${order.secondPaymentReceipt ? (order.status === 'delivered' ? ' - Confirmado' : ' - Pendiente de revisión') : ''}">
              ${order.secondPaymentReceipt && order.status === 'delivered' ? '☑' : order.secondPaymentReceipt ? '⏳' : '☐'} 2
            </span>
          </div>
        </div>
      </div>

      <div class="order-right">
        ${order.productionDeadline ? `
        <div class="deadline-info">
          <span class="deadline-icon">🏭</span>
          <div>
            <span class="deadline-label">DEADLINE PRODUCCIÓN</span>
            <span class="deadline-value">${formatDate(order.productionDeadline)}</span>
          </div>
        </div>
        ` : ''}
        ${order.estimatedDeliveryDate ? `
        <div class="delivery-info">
          <span class="delivery-label">Entrega estimada</span>
          <span class="delivery-value">${formatDate(order.estimatedDeliveryDate)}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  return card;
}

// Helper function to generate consistent color from name
function getSalesRepColor(name) {
  if (!name) return { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' };

  // Color palette - pastel colors that look good as badges
  const colors = [
    { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' }, // Blue
    { bg: '#f3e8ff', color: '#6b21a8', border: '#c4b5fd' }, // Purple
    { bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' }, // Pink
    { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' }, // Green
    { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' }, // Orange
    { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' }, // Yellow
    { bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' }, // Indigo
    { bg: '#ccfbf1', color: '#115e59', border: '#5eead4' }, // Teal
    { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }, // Red
    { bg: '#f5f5f4', color: '#44403c', border: '#a8a29e' }, // Stone
  ];

  // Generate hash from name to get consistent color
  let hash = 0;
  const normalizedName = name.toLowerCase().trim();
  for (let i = 0; i < normalizedName.length; i++) {
    hash = normalizedName.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Helper function for full date format with time
function formatDateFull(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date)) return 'N/A';

  const dateFormatted = date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const timeFormatted = date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `${dateFormatted} ${timeFormatted}`;
}

// ==========================================
// ORDER DETAIL MODAL
// ==========================================

async function showOrderDetail(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  state.selectedOrder = order;

  const modal = document.getElementById('order-detail-modal');
  const modalBody = document.getElementById('modal-body');
  const modalTitle = document.getElementById('modal-title');

  // Set modal title with PDF download button and status badge
  const statusColors = {
    'pending_review': { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
    'approved': { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
    'needs_changes': { bg: '#fee2e2', color: '#991b1b', border: '#ef4444' },
    'rejected': { bg: '#fee2e2', color: '#991b1b', border: '#ef4444' }
  };
  const statusStyle = statusColors[order.approvalStatus] || statusColors['pending_review'];

  modalTitle.innerHTML = `
    ${order.orderNumber}
    ${order.receiptPdfUrl ? `<a href="${order.receiptPdfUrl}" target="_blank" download style="margin-left: 12px; padding: 6px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">📄 PDF</a>` : ''}
    <span style="margin-left: 12px; padding: 6px 14px; background: ${statusStyle.bg}; color: ${statusStyle.color}; border: 1px solid ${statusStyle.border}; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${getStatusText(order.approvalStatus)}</span>
  `;

  // Calculate profit
  const profit = order.totalPrice - order.totalProductionCost;
  const profitMargin = ((profit / order.totalPrice) * 100).toFixed(1);

  modalBody.innerHTML = `
    <!-- Approval Actions (only show if pending) -->
    ${order.approvalStatus === 'pending_review' ? `
    <div class="detail-section">
      <div class="action-buttons" style="flex-wrap: wrap; gap: 8px;">
        <button class="btn btn-success" style="flex: 1; min-width: 140px;" onclick="approveOrder(${order.id})">
          ✅ Aprobar Pedido
        </button>
        <button class="btn btn-danger" style="flex: 1; min-width: 140px;" onclick="rejectOrder(${order.id})">
          ❌ Rechazar Pedido
        </button>
      </div>
      <p style="font-size: 11px; color: #6b7280; margin-top: 8px; text-align: center;">
        🤖 La verificación de comprobantes es automática. Este pedido requiere revisión manual.
      </p>
    </div>
    ` : ''}

    <!-- Client Information -->
    <div class="detail-section">
      <h3>Información del Cliente</h3>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
        <div style="display: grid; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 24px;">👤</div>
            <div style="flex: 1;">
              <div style="font-size: 12px; color: var(--gray-600); font-weight: 600;">CLIENTE</div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 18px; font-weight: 700; color: var(--gray-900);">${order.clientName}</span>
                ${order.clientPhone ? `
                  <a href="https://wa.me/${order.clientPhone.toString().replace(/\D/g, '').length === 10 ? '52' + order.clientPhone.toString().replace(/\D/g, '') : order.clientPhone.toString().replace(/\D/g, '')}"
                     target="whatsapp-chat"
                     style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: #25D366; border-radius: 50%; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s;"
                     onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(37,211,102,0.4)';"
                     onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
                     title="Enviar WhatsApp a ${order.clientName}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    </svg>
                  </a>
                ` : ''}
              </div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-size: 20px;">📱</div>
                <div>
                  <div style="font-size: 11px; color: var(--gray-600); font-weight: 600;">TELÉFONO</div>
                  <a href="tel:${order.clientPhone || ''}" style="font-size: 15px; font-weight: 600; color: var(--primary); text-decoration: none;">
                    ${order.clientPhone || 'No disponible'}
                  </a>
                </div>
              </div>
              ${order.clientPhone ? `
                <button onclick="copyToClipboard('${order.clientPhone}', 'Teléfono')"
                  style="background: var(--gray-100); border: none; border-radius: 6px; padding: 6px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"
                  onmouseover="this.style.background='var(--primary)'; this.querySelector('svg').style.fill='white';"
                  onmouseout="this.style.background='var(--gray-100)'; this.querySelector('svg').style.fill='var(--gray-600)';"
                  title="Copiar teléfono">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--gray-600)" style="transition: fill 0.2s;">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                </button>
              ` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                <div style="font-size: 20px;">📧</div>
                <div style="min-width: 0; flex: 1;">
                  <div style="font-size: 11px; color: var(--gray-600); font-weight: 600;">EMAIL</div>
                  <a href="mailto:${order.clientEmail || ''}" style="font-size: 15px; font-weight: 600; color: var(--primary); text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${order.clientEmail || 'No disponible'}
                  </a>
                </div>
              </div>
              ${order.clientEmail ? `
                <button onclick="copyToClipboard('${order.clientEmail}', 'Email')"
                  style="background: var(--gray-100); border: none; border-radius: 6px; padding: 6px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;"
                  onmouseover="this.style.background='var(--primary)'; this.querySelector('svg').style.fill='white';"
                  onmouseout="this.style.background='var(--gray-100)'; this.querySelector('svg').style.fill='var(--gray-600)';"
                  title="Copiar email">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--gray-600)" style="transition: fill 0.2s;">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment Proofs - Two Column Layout -->
    <div class="detail-section">
      <h3>💳 Comprobantes de Pago</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <!-- First Payment (Anticipo 50%) -->
        <div>
          <div style="font-size: 12px; font-weight: 700; color: var(--gray-600); margin-bottom: 8px; text-transform: uppercase;">
            Anticipo (50%)
          </div>
          <div id="first-payment-container-${order.id}" style="background: var(--gray-50); padding: 12px; border-radius: 10px; min-height: 180px;">
            ${order.paymentProofUrl ? `
              <div style="text-align: center;">
                <img src="${order.paymentProofUrl}"
                     alt="Comprobante de anticipo"
                     style="max-width: 100%; max-height: 200px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); cursor: pointer;"
                     onclick="window.open('${order.paymentProofUrl}', '_blank')">
                <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: center;">
                  <a href="${order.paymentProofUrl}" target="_blank" style="color: var(--primary); font-size: 12px; font-weight: 600; text-decoration: none;">📥</a>
                  <button onclick="replacePaymentReceipt(${order.id}, 'first')" style="background: none; border: none; color: var(--gray-500); font-size: 12px; cursor: pointer;">🔄</button>
                </div>
              </div>
            ` : `
              <div id="first-payment-upload-${order.id}"
                   style="border: 2px dashed var(--gray-300); border-radius: 8px; padding: 20px 12px; text-align: center; cursor: pointer; min-height: 120px; display: flex; flex-direction: column; justify-content: center;"
                   onclick="document.getElementById('first-payment-input-${order.id}').click()"
                   ondragover="handlePaymentDragOver(event, ${order.id}, 'first')"
                   ondragleave="handlePaymentDragLeave(event, ${order.id}, 'first')"
                   ondrop="handlePaymentDrop(event, ${order.id}, 'first')">
                <div style="font-size: 28px; margin-bottom: 4px;">📤</div>
                <div style="font-size: 12px; font-weight: 600; color: var(--gray-700);">Subir anticipo</div>
                <div style="font-size: 11px; color: var(--gray-500);">Arrastra o clic</div>
              </div>
              <input type="file" id="first-payment-input-${order.id}" accept="image/*,.heic,.HEIC" style="display: none;" onchange="handlePaymentUpload(event, ${order.id}, 'first')">
              <div style="margin-top: 6px; text-align: center;">
                <button onclick="pastePaymentReceipt(${order.id}, 'first')" style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; color: var(--gray-600);">📋 Pegar</button>
              </div>
            `}
          </div>
        </div>

        <!-- Second Payment (Pago Final 50%) -->
        <div>
          <div style="font-size: 12px; font-weight: 700; color: var(--gray-600); margin-bottom: 8px; text-transform: uppercase;">
            Pago Final (50%)
          </div>
          <div id="second-payment-container-${order.id}" style="background: var(--gray-50); padding: 12px; border-radius: 10px; min-height: 180px;">
            ${order.secondPaymentReceipt ? `
              <div style="background: ${order.status === 'delivered' ? '#d1fae5' : '#fef3c7'}; border: 2px solid ${order.status === 'delivered' ? '#059669' : '#fb923c'}; padding: 10px; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 8px;">
                  <img src="${order.secondPaymentReceipt}"
                       alt="Comprobante final"
                       style="max-width: 100%; max-height: 150px; border-radius: 6px; cursor: pointer;"
                       onclick="window.open('${order.secondPaymentReceipt}', '_blank')">
                  <div style="margin-top: 6px; display: flex; gap: 8px; justify-content: center;">
                    <a href="${order.secondPaymentReceipt}" target="_blank" style="color: var(--primary); font-size: 12px; font-weight: 600; text-decoration: none;">📥</a>
                    <button onclick="replacePaymentReceipt(${order.id}, 'second')" style="background: none; border: none; color: var(--gray-500); font-size: 12px; cursor: pointer;">🔄</button>
                  </div>
                </div>
                ${order.status !== 'delivered' ? `
                  <button class="btn btn-success" onclick="confirmSecondPayment(${order.id})" style="width: 100%; padding: 8px; font-size: 12px;">✅ Confirmar Pago</button>
                ` : `
                  <div style="text-align: center; font-size: 12px; font-weight: 700; color: #065f46;">✅ Confirmado</div>
                `}
              </div>
            ` : `
              <div style="margin-bottom: 8px; padding: 8px; background: #fff7ed; border-radius: 6px; text-align: center;">
                <div style="font-size: 11px; color: #9a3412;">Restante: <strong>${formatCurrency(order.totalPrice - order.depositAmount)}</strong></div>
              </div>
              <div id="second-payment-upload-${order.id}"
                   style="border: 2px dashed var(--gray-300); border-radius: 8px; padding: 20px 12px; text-align: center; cursor: pointer; min-height: 100px; display: flex; flex-direction: column; justify-content: center;"
                   onclick="document.getElementById('second-payment-input-${order.id}').click()"
                   ondragover="handlePaymentDragOver(event, ${order.id}, 'second')"
                   ondragleave="handlePaymentDragLeave(event, ${order.id}, 'second')"
                   ondrop="handlePaymentDrop(event, ${order.id}, 'second')">
                <div style="font-size: 28px; margin-bottom: 4px;">📤</div>
                <div style="font-size: 12px; font-weight: 600; color: var(--gray-700);">Subir pago final</div>
                <div style="font-size: 11px; color: var(--gray-500);">Arrastra o clic</div>
              </div>
              <input type="file" id="second-payment-input-${order.id}" accept="image/*,.heic,.HEIC" style="display: none;" onchange="handlePaymentUpload(event, ${order.id}, 'second')">
              <div style="margin-top: 6px; text-align: center;">
                <button onclick="pastePaymentReceipt(${order.id}, 'second')" style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; color: var(--gray-600);">📋 Pegar</button>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>

    <!-- Shipping Information Section - Always visible -->
    <div class="detail-section">
      <h3>🚚 Información de Envío</h3>
      <div style="background: var(--gray-50); padding: 16px; border-radius: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <div style="font-size: 11px; color: var(--gray-500); text-transform: uppercase; margin-bottom: 4px;">Número de Guía</div>
            ${order.trackingNumber ? `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-family: monospace; font-size: 14px; font-weight: 600; color: var(--gray-800);">${order.trackingNumber}</span>
                <button onclick="copyToClipboard('${order.trackingNumber}', 'Número de guía')"
                        style="background: none; border: 1px solid var(--gray-300); border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; color: var(--gray-600);">
                  📋
                </button>
              </div>
            ` : `
              <div style="font-size: 14px; color: var(--gray-400);">Pendiente</div>
            `}
          </div>
          <div>
            <div style="font-size: 11px; color: var(--gray-500); text-transform: uppercase; margin-bottom: 4px;">Paquetería</div>
            ${order.carrier ? `
              <div style="font-size: 14px; color: var(--gray-800);">${order.carrier}${order.shippingService ? ` - ${order.shippingService}` : ''}</div>
            ` : `
              <div style="font-size: 14px; color: var(--gray-400);">Pendiente</div>
            `}
          </div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--gray-200);">
          <div style="font-size: 13px; color: var(--gray-600);">
            ${order.estimatedDeliveryDays ? `
              Tiempo estimado: <strong>${order.estimatedDeliveryDays} días hábiles</strong>
            ` : `
              <span style="color: var(--gray-400);">Tiempo estimado: Pendiente</span>
            `}
          </div>
          ${order.shippingLabelUrl ? `
            <a href="${order.shippingLabelUrl}" target="_blank"
               style="display: inline-flex; align-items: center; gap: 6px; background: var(--gray-100); color: var(--gray-700); padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; border: 1px solid var(--gray-300);">
              📄 Descargar Guía
            </a>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- Order Items / Products Section -->
    <div class="detail-section">
      <h3>📦 Productos del Pedido</h3>

      <!-- Products Summary Table -->
      <div style="background: var(--gray-50); padding: 12px; border-radius: 8px;">
        <table style="width: 100%; font-size: 14px;">
          <tr style="border-bottom: 1px solid var(--gray-200);">
            <th style="text-align: left; padding: 8px 0; color: var(--gray-600);">Producto</th>
            <th style="text-align: center; padding: 8px 0; color: var(--gray-600);">Cantidad</th>
            <th style="text-align: right; padding: 8px 0; color: var(--gray-600);">P. Unit.</th>
            <th style="text-align: right; padding: 8px 0; color: var(--gray-600);">Subtotal</th>
            <th style="text-align: center; padding: 8px 0; color: var(--gray-600); width: 80px;">Acciones</th>
          </tr>
          ${order.items.map(item => `
            <tr>
              <td style="padding: 6px 0;">${item.productName}</td>
              <td style="text-align: center; padding: 6px 0;">${item.quantity} pzas</td>
              <td style="text-align: right; padding: 6px 0;">${formatCurrency(item.unitPrice)}</td>
              <td style="text-align: right; padding: 6px 0; font-weight: 600;">${formatCurrency(item.lineTotal)}</td>
              <td style="text-align: center; padding: 6px 0; white-space: nowrap;">
                <button onclick="openEditProductModal(${order.id}, ${item.id}, '${item.productName.replace(/'/g, "\\'")}', ${item.quantity}, ${item.unitPrice})"
                        style="background: var(--primary); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;"
                        title="Editar">
                  ✏️
                </button>
                <button onclick="deleteOrderItem(${order.id}, ${item.id}, '${item.productName.replace(/'/g, "\\'")}', ${item.quantity}, ${item.unitPrice})"
                        style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 4px;"
                        title="Eliminar">
                  🗑️
                </button>
              </td>
            </tr>
          `).join('')}
          ${(() => {
            // Calculate shipping if not stored (for legacy orders)
            const totalPieces = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            const calculatedShipping = order.isStorePickup ? 0 : (totalPieces >= 300 ? 0 : 210);
            const displayShipping = order.shippingCost > 0 ? order.shippingCost : calculatedShipping;
            const isFreeShipping = order.isStorePickup || displayShipping === 0;

            // Calculate correct total (subtotal + shipping for legacy orders)
            const subtotal = order.items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
            const hasStoredShipping = order.shippingCost > 0 || order.isStorePickup;
            const displayTotal = hasStoredShipping ? order.totalPrice : (subtotal + displayShipping);

            return `
          <tr style="border-top: 1px solid var(--gray-200);">
            <td colspan="4" style="padding: 6px 0; color: var(--gray-600);">
              ${order.isStorePickup ? '🏪 Recoger en tienda' : '🚚 Envío'}
            </td>
            <td style="text-align: right; padding: 6px 0; ${isFreeShipping ? 'color: var(--green);' : ''}">
              ${order.isStorePickup ? 'Gratis' : (isFreeShipping ? '¡Gratis!' : formatCurrency(displayShipping))}
            </td>
          </tr>
          <tr style="border-top: 2px solid var(--gray-300);">
            <td colspan="4" style="padding: 8px 0; font-weight: 700;">Total</td>
            <td style="text-align: right; padding: 8px 0; font-weight: 700; font-size: 16px; color: var(--primary);">${formatCurrency(displayTotal)}</td>
          </tr>`;
          })()}
        </table>

        <!-- Add Product Button -->
        <div style="margin-top: 12px; text-align: center;">
          <button onclick="openAddProductModal(${order.id})"
                  style="background: var(--success); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
            ➕ Agregar Producto
          </button>
        </div>
      </div>
    </div>

    <!-- Order Notes & Attachments Section (Single section for entire order) -->
    <div class="detail-section">
      <h3>📝 Notas y Archivos del Pedido</h3>

      <!-- Internal Notes -->
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">
          Notas internas (solo visible para admin)
        </label>
        <textarea
          id="order-notes-${order.id}"
          placeholder="Agregar notas internas, instrucciones especiales, detalles de diseño..."
          style="width: 100%; min-height: 100px; padding: 12px; border: 2px solid var(--gray-200); border-radius: 8px; font-size: 14px; resize: vertical; font-family: inherit;"
          onchange="updateOrderNotes(${order.id}, this.value)"
        >${order.internalNotes || ''}</textarea>
      </div>

      <!-- Reference Sheet Generation Section -->
      <div style="margin: 16px 0; padding: 16px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; border: 1px solid #f59e0b;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #92400e;">
              📋 Hoja de Referencia para Producción
            </h4>
            <p style="margin: 0; font-size: 12px; color: #a16207;">
              ${order.productionSheetUrl
                ? '✅ Hoja guardada - Haz clic para ver o editar'
                : 'Genera un PDF con los productos y diseños aprobados'}
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${order.productionSheetUrl ? `
              <button onclick="viewSavedReferenceSheet('${order.id}')"
                      style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);">
                <i data-lucide="file-check" style="width: 16px; height: 16px;"></i>
                Ver Hoja
              </button>
              <button onclick="generateReferenceSheet(${order.id}, '${order.orderNumber}')"
                      style="display: inline-flex; align-items: center; gap: 6px; background: white; color: #d97706; border: 2px solid #d97706; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
                Editar/Regenerar
              </button>
            ` : `
              <button onclick="generateReferenceSheet(${order.id}, '${order.orderNumber}')"
                      class="btn-reference-sheet"
                      id="btn-ref-sheet-${order.id}"
                      style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);">
                <i data-lucide="file-plus" style="width: 16px; height: 16px;"></i>
                Crear Hoja de Referencia
              </button>
            `}
          </div>
        </div>
      </div>

      <!-- Attachments Section -->
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">
          📎 Archivos adjuntos del pedido
        </label>

        <!-- Existing Attachments -->
        <div id="order-attachments-${order.id}" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
          ${(() => {
            const attachments = order.orderAttachments || [];
            return attachments.length > 0 ? attachments.map((att, idx) => `
              <div style="position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 2px solid var(--gray-200);">
                <img src="${att.url}" alt="${att.filename || 'Adjunto'}"
                     style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                     onclick="window.open('${att.url}', '_blank')">
                <button onclick="removeOrderAttachment(${order.id}, '${att.url}')"
                        style="position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; background: rgba(239, 68, 68, 0.9); color: white; border: none; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">
                  ×
                </button>
                <!-- Facebook Marketplace Button -->
                <button onclick="queueForFacebook(${order.id}, '${att.url}', '${order.orderNumber} - Diseño ${idx + 1}')"
                        id="fb-btn-${btoa(att.url).substring(0, 10)}"
                        style="position: absolute; bottom: 2px; left: 2px; width: 24px; height: 24px; border-radius: 4px; background: rgba(24, 119, 242, 0.9); color: white; border: none; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;"
                        title="Publicar en Facebook Marketplace">
                  f
                </button>
              </div>
            `).join('') : '<span style="font-size: 13px; color: var(--gray-400);">Sin archivos adjuntos</span>';
          })()}
        </div>

        <!-- Upload Area -->
        <div id="order-upload-${order.id}"
             style="border: 2px dashed var(--gray-300); border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s;"
             onclick="document.getElementById('order-file-input-${order.id}').click()"
             ondragover="handleOrderDragOver(event, ${order.id})"
             ondragleave="handleOrderDragLeave(event, ${order.id})"
             ondrop="handleOrderDrop(event, ${order.id})">
          <div style="font-size: 28px; margin-bottom: 4px;">📤</div>
          <div style="font-size: 14px; color: var(--gray-600);">Arrastra o haz clic para subir archivos</div>
          <div style="font-size: 12px; color: var(--gray-400);">JPG, PNG, HEIC, PDF (máx 10MB)</div>
        </div>
        <input type="file"
               id="order-file-input-${order.id}"
               accept="image/*,.pdf,.heic,.HEIC"
               multiple
               style="display: none;"
               onchange="handleOrderFileUpload(event, ${order.id})">

        <!-- Paste button -->
        <div style="margin-top: 10px; text-align: center;">
          <button onclick="pasteOrderAttachment(${order.id})"
                  style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; color: var(--gray-600);">
            📋 Pegar imagen del portapapeles
          </button>
        </div>
      </div>
    </div>

    <!-- Client Notes (if any) -->
    ${order.clientNotes ? `
      <div class="detail-section">
        <h3>💬 Notas del Cliente</h3>
        <p style="background: var(--gray-50); padding: 16px; border-radius: 10px; line-height: 1.6;">
          ${order.clientNotes}
        </p>
      </div>
    ` : ''}
  `;

  modal.classList.remove('hidden');
}

function closeOrderDetail() {
  document.getElementById('order-detail-modal').classList.add('hidden');
  state.selectedOrder = null;
}

// ==========================================
// ORDER ACTIONS
// ==========================================

// Global variable to track the order being approved
let orderToApprove = null;

async function approveOrder(orderId) {
  // Find the order in state - check both filteredOrders and orders
  let order = state.filteredOrders.find(o => o.id === orderId);

  if (!order) {
    order = state.orders.find(o => o.id === orderId);
  }

  // If still not found, fetch it from the API
  if (!order) {
    console.log('Order not found in state, fetching from API...', orderId);
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (data.success && data.data) {
        order = data.data;
      }
    } catch (error) {
      console.error('Error fetching order:', error);
    }
  }

  if (!order) {
    alert('No se pudo encontrar el pedido. Por favor recarga la página.');
    console.error('Order not found anywhere:', orderId);
    return;
  }

  // Store the order for later use
  orderToApprove = order;

  // Populate the deposit modal with order information
  document.getElementById('deposit-order-number').textContent = order.orderNumber;
  document.getElementById('deposit-client-name').textContent = order.clientName;
  document.getElementById('deposit-total-price').textContent = formatCurrency(order.totalPrice);

  // Pre-fill with expected deposit amount (default to half)
  const suggestedDeposit = order.depositAmount || (order.totalPrice / 2);
  document.getElementById('actual-deposit-amount').value = suggestedDeposit.toFixed(2);

  // Open the deposit modal
  document.getElementById('deposit-confirmation-modal').classList.remove('hidden');
}

function closeDepositModal() {
  document.getElementById('deposit-confirmation-modal').classList.add('hidden');
  document.getElementById('actual-deposit-amount').value = '';
  orderToApprove = null;
}

async function confirmApproveWithDeposit() {
  console.log('🚀 Starting order approval process...');

  const actualDepositAmount = parseFloat(document.getElementById('actual-deposit-amount').value);
  console.log(`💰 Deposit amount entered: $${actualDepositAmount}`);

  // Validation
  if (!actualDepositAmount || actualDepositAmount <= 0) {
    console.error('❌ Invalid deposit amount');
    alert('Por favor ingresa un monto válido para el anticipo');
    return;
  }

  if (!orderToApprove) {
    console.error('❌ No order found in orderToApprove variable');
    alert('Error: No se encontró el pedido');
    return;
  }

  console.log(`📦 Approving order: ${orderToApprove.orderNumber} (ID: ${orderToApprove.id})`);
  console.log(`💵 Total: $${orderToApprove.totalPrice}, Deposit: $${actualDepositAmount}`);

  if (actualDepositAmount > orderToApprove.totalPrice) {
    console.error('❌ Deposit exceeds total price');
    alert('El monto del anticipo no puede ser mayor que el total del pedido');
    return;
  }

  try {
    const endpoint = `${API_BASE}/orders/${orderToApprove.id}/approve`;
    const payload = { actualDepositAmount: actualDepositAmount };

    console.log(`📤 Sending approval request to: ${endpoint}`);
    console.log('📤 Request payload:', payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log(`📥 Response status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log('📥 Response data:', data);

    if (data.success) {
      console.log('✅ Order approved successfully!');
      console.log('📧 PDF receipt should be generated and emailed to customer');
      console.log('📦 Shipping result:', data.shipping);

      closeDepositModal();
      closeOrderDetail();
      loadOrders();

      // Build success message
      let successMsg = '✅ Pedido aprobado exitosamente.\n\n';
      successMsg += '📧 Recibo generado y enviado al cliente.\n\n';
      successMsg += '📦 El cliente podrá seleccionar su método de envío al subir el segundo pago.';

      alert(successMsg);
    } else {
      console.error('❌ Approval failed:', data.error);
      alert('Error: ' + (data.error || 'No se pudo aprobar el pedido'));
    }
  } catch (error) {
    console.error('❌ CRITICAL ERROR approving order:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    alert('Error al aprobar el pedido: ' + error.message);
  }
}

async function rejectOrder(orderId) {
  if (!confirm('¿Estás seguro que deseas rechazar este pedido?')) {
    return;
  }

  const reason = prompt('¿Por qué se rechaza este pedido? (El cliente recibirá este mensaje)');

  if (!reason) return;

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason })
    });

    const data = await response.json();

    if (data.success) {
      closeOrderDetail();
      loadOrders();
    } else {
      alert('Error: ' + (data.error || 'No se pudo rechazar el pedido'));
    }
  } catch (error) {
    console.error('Error rejecting order:', error);
    alert('Error al rechazar el pedido');
  }
}

// ==========================================
// UPDATE STATS
// ==========================================

function updateStats() {
  const pendingCount = state.orders.filter(o => {
    const isArchived = o.archiveStatus && o.archiveStatus !== 'active';
    return !isArchived && o.approvalStatus === 'pending_review';
  }).length;

  const approvedCount = state.orders.filter(o => {
    const isArchived = o.archiveStatus && o.archiveStatus !== 'active';
    return !isArchived && o.approvalStatus === 'approved';
  }).length;

  // Count orders with pending second payment receipts (only non-archived)
  const pendingSecondPayments = state.orders.filter(o => {
    const isArchived = o.archiveStatus && o.archiveStatus !== 'active';
    return !isArchived && o.secondPaymentStatus === 'uploaded' && o.secondPaymentReceipt;
  }).length;

  // Update header stats
  document.getElementById('pending-count').textContent = pendingCount;

  // Show second payment notification badge if there are pending confirmations
  const secondPaymentBadge = document.getElementById('second-payment-badge');
  if (secondPaymentBadge) {
    secondPaymentBadge.textContent = pendingSecondPayments;
    secondPaymentBadge.style.display = pendingSecondPayments > 0 ? 'inline-flex' : 'none';
  }

  // Calculate today's revenue (only non-archived orders)
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = state.orders.filter(o => {
    const isArchived = o.archiveStatus && o.archiveStatus !== 'active';
    const orderDatePart = o.orderDate ? o.orderDate.split('T')[0] : '';
    return !isArchived && orderDatePart === today;
  });
  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  document.getElementById('today-revenue').textContent = formatCurrency(todayRevenue);

  // Calculate stats for filters
  const activeOrdersCount = state.orders.filter(o => !o.archiveStatus || o.archiveStatus === 'active').length;
  const archivedCount = state.orders.filter(o => o.archiveStatus && o.archiveStatus !== 'active').length;

  // Update filter badges
  document.getElementById('all-count').textContent = activeOrdersCount;
  document.getElementById('pending-count-badge').textContent = pendingCount;
  document.getElementById('approved-count').textContent = approvedCount;
  document.getElementById('completed-count').textContent = archivedCount;
}

// ==========================================
// PRODUCTION SHEET UPLOAD FUNCTIONS
// ==========================================

function handleDragOver(event, orderId) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`production-sheet-upload-${orderId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--primary)';
    uploadArea.style.background = 'rgba(233, 30, 99, 0.05)';
  }
}

function handleDragLeave(event, orderId) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`production-sheet-upload-${orderId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--gray-300)';
    uploadArea.style.background = 'transparent';
  }
}

async function handleProductionSheetDrop(event, orderId) {
  event.preventDefault();
  event.stopPropagation();
  handleDragLeave(event, orderId);

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    await uploadProductionSheet(files[0], orderId);
  }
}

async function handleProductionSheetUpload(event, orderId) {
  const file = event.target.files[0];
  if (file) {
    await uploadProductionSheet(file, orderId);
  }
}

async function pasteProductionSheet(orderId) {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      // Check for image types
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File([blob], `production-sheet-${orderId}.png`, { type: imageType });
        await uploadProductionSheet(file, orderId);
        return;
      }
    }
    alert('No se encontró imagen en el portapapeles. Copia una imagen primero.');
  } catch (error) {
    console.error('Error reading clipboard:', error);
    alert('No se pudo acceder al portapapeles. Intenta arrastrando el archivo.');
  }
}

async function uploadProductionSheet(file, orderId) {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  const isHeic = file.name && /\.heic$/i.test(file.name);
  if (!validTypes.includes(file.type) && !isHeic) {
    alert('Tipo de archivo no válido. Solo se aceptan imágenes (JPG, PNG, GIF, WebP, HEIC) y PDF.');
    return;
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('El archivo es demasiado grande. Máximo 10MB.');
    return;
  }

  // Show loading state
  const container = document.getElementById(`production-sheet-container-${orderId}`);
  container.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="spinner" style="margin: 0 auto 16px;"></div>
      <div style="font-size: 14px; color: var(--gray-600);">Subiendo archivo...</div>
    </div>
  `;

  try {
    // Upload via backend (uses server-side Cloudinary credentials)
    const formData = new FormData();
    formData.append('receipt', file);

    const uploadResponse = await fetch(`${API_BASE.replace('/api', '')}/api/client/upload/payment-receipt`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al subir el archivo');
    }

    const uploadData = await uploadResponse.json();
    const fileUrl = uploadData.url;

    // Save URL to backend
    const response = await fetch(`${API_BASE}/orders/${orderId}/production-sheet`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ productionSheetUrl: fileUrl })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al guardar');
    }

    // Update local state
    const orderIndex = state.orders.findIndex(o => o.id == orderId);
    if (orderIndex >= 0) {
      state.orders[orderIndex].productionSheetUrl = fileUrl;
    }

    // Refresh order detail view
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      showOrderDetail(order);
    }

    console.log('✅ Production sheet uploaded:', fileUrl);

  } catch (error) {
    console.error('Error uploading production sheet:', error);
    alert(`Error: ${error.message}`);

    // Restore upload area
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      showOrderDetail(order);
    }
  }
}

async function removeProductionSheet(orderId) {
  if (!confirm('¿Eliminar la hoja de producción?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/production-sheet`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al eliminar');
    }

    // Update local state
    const orderIndex = state.orders.findIndex(o => o.id == orderId);
    if (orderIndex >= 0) {
      state.orders[orderIndex].productionSheetUrl = null;
    }

    // Refresh order detail view
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      showOrderDetail(order);
    }

  } catch (error) {
    console.error('Error removing production sheet:', error);
    alert(`Error: ${error.message}`);
  }
}

// ==========================================
// ORDER ITEM NOTES & ATTACHMENTS FUNCTIONS
// ==========================================

// Debounce timer for auto-saving notes
let notesSaveTimers = {};

async function updateItemNotes(orderId, itemId, notes) {
  // Clear existing timer for this item
  const timerKey = `${orderId}-${itemId}`;
  if (notesSaveTimers[timerKey]) {
    clearTimeout(notesSaveTimers[timerKey]);
  }

  // Debounce: save after 1 second of no typing
  notesSaveTimers[timerKey] = setTimeout(async () => {
    try {
      console.log(`📝 Saving notes for item ${itemId}...`);

      const response = await fetch(`${API_BASE}/orders/${orderId}/items/${itemId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ notes })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al guardar notas');
      }

      // Update local state
      const order = state.orders.find(o => o.id == orderId);
      if (order) {
        const item = order.items.find(i => i.id == itemId);
        if (item) {
          item.notes = notes;
        }
      }

      console.log('✅ Notes saved successfully');

      // Show brief success feedback
      const textarea = document.getElementById(`item-notes-${orderId}-${itemId}`);
      if (textarea) {
        textarea.style.borderColor = '#10b981';
        setTimeout(() => {
          textarea.style.borderColor = 'var(--gray-200)';
        }, 1500);
      }

    } catch (error) {
      console.error('Error saving notes:', error);
      // Show error feedback
      const textarea = document.getElementById(`item-notes-${orderId}-${itemId}`);
      if (textarea) {
        textarea.style.borderColor = '#ef4444';
      }
    }
  }, 1000);
}

function handleItemDragOver(event, orderId, itemId) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`item-upload-${orderId}-${itemId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--primary)';
    uploadArea.style.background = 'rgba(233, 30, 99, 0.05)';
  }
}

function handleItemDragLeave(event, orderId, itemId) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`item-upload-${orderId}-${itemId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--gray-300)';
    uploadArea.style.background = 'transparent';
  }
}

async function handleItemDrop(event, orderId, itemId) {
  event.preventDefault();
  event.stopPropagation();
  handleItemDragLeave(event, orderId, itemId);

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    await uploadItemAttachment(files[0], orderId, itemId);
  }
}

async function handleItemFileUpload(event, orderId, itemId) {
  const file = event.target.files[0];
  if (file) {
    await uploadItemAttachment(file, orderId, itemId);
  }
}

async function pasteItemAttachment(orderId, itemId) {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File([blob], `item-${itemId}-attachment.png`, { type: imageType });
        await uploadItemAttachment(file, orderId, itemId);
        return;
      }
    }
    alert('No se encontró imagen en el portapapeles. Copia una imagen primero.');
  } catch (error) {
    console.error('Error reading clipboard:', error);
    alert('No se pudo acceder al portapapeles. Intenta arrastrando el archivo.');
  }
}

async function uploadItemAttachment(file, orderId, itemId) {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  const isHeic = file.name && /\.heic$/i.test(file.name);
  if (!validTypes.includes(file.type) && !isHeic) {
    alert('Tipo de archivo no válido. Solo se aceptan imágenes (JPG, PNG, GIF, WebP, HEIC) y PDF.');
    return;
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('El archivo es demasiado grande. Máximo 10MB.');
    return;
  }

  // Show loading state in upload area
  const uploadArea = document.getElementById(`item-upload-${orderId}-${itemId}`);
  const originalContent = uploadArea.innerHTML;
  uploadArea.innerHTML = `
    <div class="spinner" style="margin: 0 auto;"></div>
    <div style="font-size: 13px; color: var(--gray-600); margin-top: 8px;">Subiendo...</div>
  `;

  try {
    // Upload file to Cloudinary via backend
    const formData = new FormData();
    formData.append('receipt', file);

    const uploadResponse = await fetch(`${API_BASE.replace('/api', '')}/api/client/upload/payment-receipt`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al subir el archivo');
    }

    const uploadData = await uploadResponse.json();
    const fileUrl = uploadData.url;

    // Save attachment to backend
    const response = await fetch(`${API_BASE}/orders/${orderId}/items/${itemId}/attachment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        url: fileUrl,
        filename: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'pdf'
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al guardar el archivo');
    }

    // Update local state
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      const item = order.items.find(i => i.id == itemId);
      if (item) {
        item.attachments = JSON.stringify(result.attachments);
      }
    }

    // Refresh the order detail view
    showOrderDetail(orderId);

    console.log('✅ Attachment uploaded:', fileUrl);

  } catch (error) {
    console.error('Error uploading attachment:', error);
    alert(`Error: ${error.message}`);
    // Restore original upload area
    uploadArea.innerHTML = originalContent;
  }
}

async function removeItemAttachment(orderId, itemId, url) {
  if (!confirm('¿Eliminar este archivo adjunto?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/items/${itemId}/attachment`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ url })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al eliminar');
    }

    // Update local state
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      const item = order.items.find(i => i.id == itemId);
      if (item) {
        item.attachments = result.attachments.length > 0 ? JSON.stringify(result.attachments) : null;
      }
    }

    // Refresh the order detail view
    showOrderDetail(orderId);

    console.log('✅ Attachment removed');

  } catch (error) {
    console.error('Error removing attachment:', error);
    alert(`Error: ${error.message}`);
  }
}

// ==========================================
// ORDER-LEVEL NOTES & ATTACHMENTS FUNCTIONS
// ==========================================

// Debounce timer for order notes
let orderNotesSaveTimer = null;

async function updateOrderNotes(orderId, notes) {
  // Clear existing timer
  if (orderNotesSaveTimer) {
    clearTimeout(orderNotesSaveTimer);
  }

  // Debounce: save after 1 second of no typing
  orderNotesSaveTimer = setTimeout(async () => {
    try {
      console.log(`📝 Saving order notes for order ${orderId}...`);

      const response = await fetch(`${API_BASE}/orders/${orderId}/notes`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ internalNotes: notes })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al guardar notas');
      }

      // Update local state
      const order = state.orders.find(o => o.id == orderId);
      if (order) {
        order.internalNotes = notes;
      }

      console.log('✅ Order notes saved successfully');

      // Show brief success feedback
      const textarea = document.getElementById(`order-notes-${orderId}`);
      if (textarea) {
        textarea.style.borderColor = '#10b981';
        setTimeout(() => {
          textarea.style.borderColor = 'var(--gray-200)';
        }, 1500);
      }

    } catch (error) {
      console.error('Error saving order notes:', error);
      // Show error feedback
      const textarea = document.getElementById(`order-notes-${orderId}`);
      if (textarea) {
        textarea.style.borderColor = '#ef4444';
      }
    }
  }, 1000);
}

function handleOrderDragOver(event, orderId) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`order-upload-${orderId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--primary)';
    uploadArea.style.background = 'rgba(233, 30, 99, 0.05)';
  }
}

function handleOrderDragLeave(event, orderId) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`order-upload-${orderId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--gray-300)';
    uploadArea.style.background = 'transparent';
  }
}

async function handleOrderDrop(event, orderId) {
  event.preventDefault();
  event.stopPropagation();
  handleOrderDragLeave(event, orderId);

  const files = event.dataTransfer.files;
  for (const file of files) {
    await uploadOrderAttachment(file, orderId);
  }
}

async function handleOrderFileUpload(event, orderId) {
  const files = event.target.files;
  for (const file of files) {
    await uploadOrderAttachment(file, orderId);
  }
}

async function pasteOrderAttachment(orderId) {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File([blob], `order-attachment-${orderId}-${Date.now()}.png`, { type: imageType });
        await uploadOrderAttachment(file, orderId);
        return;
      }
    }
    alert('No se encontró imagen en el portapapeles. Copia una imagen primero.');
  } catch (error) {
    console.error('Error reading clipboard:', error);
    alert('No se pudo acceder al portapapeles. Intenta arrastrando el archivo.');
  }
}

async function uploadOrderAttachment(file, orderId) {
  const uploadArea = document.getElementById(`order-upload-${orderId}`);
  const originalContent = uploadArea.innerHTML;

  try {
    // Show uploading state
    uploadArea.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div style="font-size: 24px; animation: spin 1s linear infinite;">⏳</div>
        <div style="font-size: 13px; color: var(--gray-600); margin-top: 8px;">Subiendo ${file.name}...</div>
      </div>
    `;

    // Upload to Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', `orders/${orderId}/attachments`);

    const uploadResponse = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.authToken}`
      },
      body: formData
    });

    const uploadResult = await uploadResponse.json();

    if (!uploadResult.success) {
      throw new Error(uploadResult.error || 'Error al subir archivo');
    }

    const fileUrl = uploadResult.url;

    // Save attachment to order
    const response = await fetch(`${API_BASE}/orders/${orderId}/attachment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        url: fileUrl,
        filename: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'pdf'
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al guardar el archivo');
    }

    // Update local state
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      order.orderAttachments = result.attachments;
    }

    // Refresh the order detail view
    showOrderDetail(orderId);

    console.log('✅ Order attachment uploaded:', fileUrl);

  } catch (error) {
    console.error('Error uploading order attachment:', error);
    alert(`Error: ${error.message}`);
    // Restore original upload area
    uploadArea.innerHTML = originalContent;
  }
}

async function removeOrderAttachment(orderId, url) {
  if (!confirm('¿Eliminar este archivo adjunto?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/attachment`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ url })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al eliminar');
    }

    // Update local state
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      order.orderAttachments = result.attachments;
    }

    // Refresh the order detail view
    showOrderDetail(orderId);

    console.log('✅ Order attachment removed');

  } catch (error) {
    console.error('Error removing order attachment:', error);
    alert(`Error: ${error.message}`);
  }
}

// ==========================================
// PAYMENT RECEIPT UPLOAD FUNCTIONS
// ==========================================

function handlePaymentDragOver(event, orderId, paymentType) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`${paymentType}-payment-upload-${orderId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--primary)';
    uploadArea.style.background = 'rgba(233, 30, 99, 0.05)';
  }
}

function handlePaymentDragLeave(event, orderId, paymentType) {
  event.preventDefault();
  event.stopPropagation();
  const uploadArea = document.getElementById(`${paymentType}-payment-upload-${orderId}`);
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--gray-300)';
    uploadArea.style.background = 'transparent';
  }
}

async function handlePaymentDrop(event, orderId, paymentType) {
  event.preventDefault();
  event.stopPropagation();
  handlePaymentDragLeave(event, orderId, paymentType);

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    await uploadPaymentReceipt(files[0], orderId, paymentType);
  }
}

async function handlePaymentUpload(event, orderId, paymentType) {
  const file = event.target.files[0];
  if (file) {
    await uploadPaymentReceipt(file, orderId, paymentType);
  }
}

async function pastePaymentReceipt(orderId, paymentType) {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File([blob], `payment-${paymentType}-${orderId}.png`, { type: imageType });
        await uploadPaymentReceipt(file, orderId, paymentType);
        return;
      }
    }
    alert('No se encontró imagen en el portapapeles. Copia una imagen primero.');
  } catch (error) {
    console.error('Error reading clipboard:', error);
    alert('No se pudo acceder al portapapeles. Intenta arrastrando el archivo.');
  }
}

function replacePaymentReceipt(orderId, paymentType) {
  // Show upload interface
  const container = document.getElementById(`${paymentType}-payment-container-${orderId}`);
  if (container) {
    container.innerHTML = `
      <div id="${paymentType}-payment-upload-${orderId}"
           style="border: 2px dashed var(--gray-300); border-radius: 12px; padding: 30px 20px; text-align: center; cursor: pointer;"
           onclick="document.getElementById('${paymentType}-payment-input-${orderId}').click()"
           ondragover="handlePaymentDragOver(event, ${orderId}, '${paymentType}')"
           ondragleave="handlePaymentDragLeave(event, ${orderId}, '${paymentType}')"
           ondrop="handlePaymentDrop(event, ${orderId}, '${paymentType}')">
        <div style="font-size: 36px; margin-bottom: 8px;">📤</div>
        <div style="font-size: 14px; font-weight: 600; color: var(--gray-700); margin-bottom: 4px;">
          Subir nuevo comprobante
        </div>
        <div style="font-size: 12px; color: var(--gray-500);">
          Arrastra o haz clic para seleccionar
        </div>
      </div>
      <input type="file" id="${paymentType}-payment-input-${orderId}" accept="image/*,.heic,.HEIC" style="display: none;"
             onchange="handlePaymentUpload(event, ${orderId}, '${paymentType}')">
      <div style="margin-top: 10px; text-align: center;">
        <button onclick="pastePaymentReceipt(${orderId}, '${paymentType}')"
                style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 8px 16px; border-radius: 6px; font-size: 12px; cursor: pointer; color: var(--gray-600);">
          📋 Pegar del portapapeles
        </button>
        <button onclick="cancelReplacePayment(${orderId})"
                style="background: none; border: 1px solid var(--gray-300); padding: 8px 16px; border-radius: 6px; font-size: 12px; cursor: pointer; color: var(--gray-500); margin-left: 8px;">
          ✕ Cancelar
        </button>
      </div>
    `;
  }
}

function cancelReplacePayment(orderId) {
  // Refresh order detail to restore original view
  const order = state.orders.find(o => o.id == orderId);
  if (order) {
    showOrderDetail(order);
  }
}

async function uploadPaymentReceipt(file, orderId, paymentType) {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('Solo se aceptan imágenes (JPG, PNG, etc.)');
    return;
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('El archivo es demasiado grande. Máximo 10MB.');
    return;
  }

  // Show loading state
  const container = document.getElementById(`${paymentType}-payment-container-${orderId}`);
  container.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="spinner" style="margin: 0 auto 16px;"></div>
      <div style="font-size: 14px; color: var(--gray-600);">Subiendo comprobante...</div>
    </div>
  `;

  try {
    // Upload via backend (uses server-side Cloudinary credentials)
    const formData = new FormData();
    formData.append('receipt', file);

    const uploadResponse = await fetch(`${API_BASE.replace('/api', '')}/api/client/upload/payment-receipt`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al subir el comprobante');
    }

    const uploadData = await uploadResponse.json();
    const imageUrl = uploadData.url;

    // Save URL to backend
    const endpoint = paymentType === 'first'
      ? `${API_BASE}/orders/${orderId}/payment-proof`
      : `${API_BASE}/orders/${orderId}/second-payment`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ paymentProofUrl: imageUrl })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al guardar');
    }

    // Update local state
    const orderIndex = state.orders.findIndex(o => o.id == orderId);
    if (orderIndex >= 0) {
      if (paymentType === 'first') {
        state.orders[orderIndex].paymentProofUrl = imageUrl;
      } else {
        state.orders[orderIndex].secondPaymentReceipt = imageUrl;
        state.orders[orderIndex].secondPaymentStatus = 'uploaded';
      }
    }

    // Refresh order detail view
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      showOrderDetail(order);
    }

    console.log(`✅ ${paymentType} payment receipt uploaded:`, imageUrl);

  } catch (error) {
    console.error('Error uploading payment receipt:', error);
    alert(`Error: ${error.message}`);

    // Restore view
    const order = state.orders.find(o => o.id == orderId);
    if (order) {
      showOrderDetail(order);
    }
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getStatusText(status) {
  const map = {
    'pending_review': 'Pendiente',
    'approved': 'Aprobado',
    'needs_changes': 'Requiere Cambios',
    'rejected': 'Rechazado'
  };
  return map[status] || status;
}

function getProductionStatusText(status) {
  const map = {
    'new': 'Nuevo',
    'pending': 'Pendiente',
    'design': 'En Diseño',
    'printing': 'En Impresión',
    'cutting': 'En Corte',
    'counting': 'En Conteo',
    'shipping': 'En Envío',
    'delivered': 'Entregado',
    'cancelled': 'Cancelado'
  };
  return map[status] || status;
}

function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date)) return 'N/A';

  const dateStr = date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const timeStr = date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return `${dateStr} a las ${timeStr}`;
}

// ==========================================
// SEARCH FUNCTIONALITY
// ==========================================

function handleSearch(query) {
  state.searchQuery = query;

  // Show/hide clear button
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) {
    clearBtn.style.display = query.trim() !== '' ? 'flex' : 'none';
  }

  // Reapply filters with new search query
  applyFilter(state.currentFilter);
}

function clearSearch() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  if (searchInput) {
    searchInput.value = '';
  }

  if (clearBtn) {
    clearBtn.style.display = 'none';
  }

  state.searchQuery = '';
  applyFilter(state.currentFilter);
}

// ==========================================
// CLIENT LOOKUP FUNCTIONALITY
// ==========================================

function openClientLookup() {
  const modal = document.getElementById('client-lookup-modal');
  modal.classList.remove('hidden');
  document.getElementById('lookup-phone').value = '';
  document.getElementById('lookup-email').value = '';
  document.getElementById('lookup-results').classList.add('hidden');
}

function closeClientLookup() {
  const modal = document.getElementById('client-lookup-modal');
  modal.classList.add('hidden');
}

async function lookupClientOrders() {
  const phone = document.getElementById('lookup-phone').value.trim();
  const email = document.getElementById('lookup-email').value.trim();

  if (!phone && !email) {
    alert('Por favor ingrese al menos un teléfono o email');
    return;
  }

  const loadingDiv = document.getElementById('lookup-loading');
  const resultsDiv = document.getElementById('lookup-results');
  const ordersList = document.getElementById('lookup-orders-list');

  // Show loading
  loadingDiv.classList.remove('hidden');
  resultsDiv.classList.add('hidden');

  try {
    const response = await fetch(`${API_BASE}/client/orders/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone, email })
    });

    const data = await response.json();

    if (!data.success) {
      alert(data.error || 'Error al buscar pedidos');
      return;
    }

    // Hide loading
    loadingDiv.classList.add('hidden');

    if (!data.orders || data.orders.length === 0) {
      ordersList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6b7280;">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <p style="font-size: 16px; font-weight: 600;">No se encontraron pedidos activos</p>
          <p style="font-size: 14px; margin-top: 8px;">No hay pedidos en proceso para este cliente</p>
        </div>
      `;
      resultsDiv.classList.remove('hidden');
      return;
    }

    // Display orders
    ordersList.innerHTML = data.orders.map(order => `
      <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div>
            <div style="font-size: 18px; font-weight: 700; color: #111827;">${order.orderNumber}</div>
            <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
              ${new Date(order.orderDate).toLocaleDateString('es-MX')}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span class="badge badge-${getStatusBadgeClass(order.approvalStatus)}" style="font-size: 12px;">
              ${order.approvalStatus}
            </span>
            <span class="badge" style="font-size: 12px; background: #dbeafe; color: #1e40af;">
              ${order.status}
            </span>
          </div>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Total del Pedido:</div>
              <div style="font-size: 20px; font-weight: 700; color: #111827;">${order.totalPriceFormatted}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Anticipo:</div>
              <div style="font-size: 20px; font-weight: 700; color: #059669;">${order.depositAmountFormatted}</div>
              ${order.depositPaid ? '<div style="font-size: 12px; color: #059669;">✓ Pagado</div>' : '<div style="font-size: 12px; color: #dc2626;">⏳ Pendiente</div>'}
            </div>
          </div>

          <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px;">
            <div style="font-size: 12px; color: #92400e; font-weight: 600; margin-bottom: 4px;">Saldo Restante:</div>
            <div style="font-size: 24px; font-weight: 700; color: #b45309;">${order.remainingBalanceFormatted}</div>
            <div style="font-size: 12px; color: #92400e; margin-top: 4px;">
              Este monto debe pagarse antes de la entrega
            </div>
          </div>

          ${order.eventDate ? `
            <div style="margin-top: 12px; padding: 8px; background: #ede9fe; border-radius: 8px;">
              <span style="font-size: 12px; color: #5b21b6; font-weight: 600;">📅 Fecha del Evento:</span>
              <span style="font-size: 14px; color: #5b21b6; font-weight: 700; margin-left: 8px;">
                ${new Date(order.eventDate).toLocaleDateString('es-MX')}
              </span>
            </div>
          ` : ''}
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 12px;">
          <div style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 8px;">Productos:</div>
          ${order.items.map(item => `
            <div style="font-size: 14px; color: #374151; margin-bottom: 4px;">
              • ${item.productName} (${item.quantity} unidades)
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    resultsDiv.classList.remove('hidden');

  } catch (error) {
    console.error('Error looking up orders:', error);
    alert('Error al buscar pedidos. Por favor intente nuevamente.');
  } finally {
    loadingDiv.classList.add('hidden');
  }
}

// ==========================================
// RECEIPT ACTIONS
// ==========================================

/**
 * Download receipt PDF - regenerates on-demand from the server
 * @param {string} receiptUrl - Original URL (used as fallback indicator)
 * @param {string} orderNumber - Order number for filename
 * @param {number} orderId - Order ID for regeneration endpoint
 */
function downloadReceipt(receiptUrl, orderNumber, orderId) {
  // If we have an orderId, use the regeneration endpoint (more reliable)
  if (orderId) {
    try {
      // Use the regeneration endpoint - this always works even after server redeploy
      const downloadUrl = `${API_BASE}/orders/${orderId}/receipt/download`;

      console.log(`📥 Regenerating and downloading receipt for order ${orderNumber} (ID: ${orderId})`);

      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Recibo-${orderNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return;
    } catch (error) {
      console.error('Error with regeneration endpoint, trying fallback:', error);
    }
  }

  // Fallback to original URL if no orderId provided
  if (!receiptUrl) {
    alert('No hay recibo disponible para este pedido');
    return;
  }

  try {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = receiptUrl;
    link.download = `Recibo-${orderNumber}.pdf`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`📥 Downloading receipt for order ${orderNumber} (fallback)`);
  } catch (error) {
    console.error('Error downloading receipt:', error);
    alert('Error al descargar el recibo');
  }
}

/**
 * Share receipt URL by copying to clipboard
 * @param {string} receiptUrl - URL to the receipt PDF
 */
async function shareReceipt(receiptUrl) {
  if (!receiptUrl) {
    alert('No hay recibo disponible para este pedido');
    return;
  }

  try {
    // Get the full URL (in case it's a relative path)
    const fullUrl = receiptUrl.startsWith('http')
      ? receiptUrl
      : `${window.location.origin}${receiptUrl}`;

    // Copy to clipboard
    await navigator.clipboard.writeText(fullUrl);

    alert('✅ Enlace del recibo copiado al portapapeles');
    console.log(`🔗 Receipt URL copied: ${fullUrl}`);
  } catch (error) {
    console.error('Error copying receipt URL:', error);

    // Fallback for browsers that don't support clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = receiptUrl;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      alert('✅ Enlace del recibo copiado al portapapeles');
    } catch (err) {
      alert('No se pudo copiar el enlace. Por favor cópialo manualmente: ' + receiptUrl);
    }

    document.body.removeChild(textArea);
  }
}

function getStatusBadgeClass(status) {
  const statusClasses = {
    'pending_review': 'warning',
    'approved': 'success',
    'rejected': 'danger',
    'needs_changes': 'warning'
  };
  return statusClasses[status] || '';
}

// ==========================================
// SECOND PAYMENT CONFIRMATION
// ==========================================

async function confirmSecondPayment(orderId) {
  if (!confirm('¿Confirmar que el pago final ha sido recibido?\n\nEsto marcará el pedido como "Entregado" y enviará una notificación al cliente.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/confirm-second-payment`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Pago confirmado exitosamente. El cliente ha sido notificado por email.');
      closeOrderDetail();
      loadOrders();
    } else {
      alert('Error: ' + (data.error || 'No se pudo confirmar el pago'));
    }
  } catch (error) {
    console.error('Error confirming second payment:', error);
    alert('Error al confirmar el pago. Por favor intenta nuevamente.');
  }
}

// ==========================================
// ARCHIVE ORDER
// ==========================================

async function archiveOrder(orderId, archiveStatus) {
  const statusText = archiveStatus === 'completo' ? 'completado' : 'cancelado';
  const confirmMessage = archiveStatus === 'completo'
    ? '¿Marcar este pedido como completado?\n\nEl pedido se moverá a la vista de "Completados".'
    : '¿Marcar este pedido como cancelado?\n\nEl pedido se moverá a la vista de "Completados".';

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/archive`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ archiveStatus })
    });

    const data = await response.json();

    if (data.success) {
      alert(`✅ Pedido marcado como ${statusText}.`);
      closeOrderDetail();
      loadOrders();
    } else {
      alert('Error: ' + (data.error || `No se pudo marcar como ${statusText}`));
    }
  } catch (error) {
    console.error('Error archiving order:', error);
    alert(`Error al marcar como ${statusText}. Por favor intenta nuevamente.`);
  }
}

// ==========================================
// MULTI-SELECT FUNCTIONALITY
// ==========================================

/**
 * Toggle selection of an order
 * @param {number} orderId - ID of the order to toggle
 * @param {boolean} checked - Whether the checkbox is checked
 */
function toggleOrderSelection(orderId, checked) {
  // Ensure orderId is always a number for consistent comparison
  const id = Number(orderId);

  if (checked) {
    state.selectedOrders.add(id);
  } else {
    state.selectedOrders.delete(id);
  }

  updateBulkActionBar();
}

/**
 * Select or deselect all visible orders
 * @param {boolean} selectAll - Whether to select all or deselect all
 */
function toggleSelectAll(selectAll) {
  state.selectedOrders.clear();

  if (selectAll) {
    // Select only non-archived orders from filtered list
    state.filteredOrders.forEach(order => {
      const isArchived = order.archiveStatus && order.archiveStatus !== 'active';
      if (!isArchived) {
        state.selectedOrders.add(Number(order.id));
      }
    });
  }

  // Re-render to update checkboxes
  renderOrders();
  updateBulkActionBar();
}

/**
 * Update the bulk action bar visibility and count
 */
function updateBulkActionBar() {
  const actionBar = document.getElementById('bulk-action-bar');
  const selectedCount = document.getElementById('bulk-selected-count');

  if (!actionBar) {
    // Create the bulk action bar if it doesn't exist
    createBulkActionBar();
    return;
  }

  if (state.selectedOrders.size > 0) {
    actionBar.classList.remove('hidden');
    selectedCount.textContent = state.selectedOrders.size;
  } else {
    actionBar.classList.add('hidden');
  }
}

/**
 * Create the bulk action bar UI
 */
function createBulkActionBar() {
  // Check if it already exists
  if (document.getElementById('bulk-action-bar')) {
    updateBulkActionBar();
    return;
  }

  const actionBar = document.createElement('div');
  actionBar.id = 'bulk-action-bar';
  actionBar.className = 'bulk-action-bar hidden';
  actionBar.innerHTML = `
    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <input type="checkbox" id="select-all-checkbox" onchange="toggleSelectAll(this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
        <span style="font-weight: 600; font-size: 15px;">
          <span id="bulk-selected-count">0</span> pedido(s) seleccionado(s)
        </span>
      </div>

      <div style="display: flex; gap: 12px; margin-left: auto;">
        <button onclick="bulkApproveOrders()" class="bulk-action-btn btn-approve" title="Aprobar seleccionados">
          ✓ Aprobar
        </button>
        <button onclick="bulkArchiveOrders('completo')" class="bulk-action-btn btn-complete" title="Marcar como completo">
          ✓ Completo
        </button>
        <button onclick="bulkArchiveOrders('cancelado')" class="bulk-action-btn btn-cancel" title="Marcar como cancelado">
          ✕ Cancelado
        </button>
        <button onclick="clearSelection()" class="bulk-action-btn btn-clear" title="Cancelar selección">
          Cancelar
        </button>
      </div>
    </div>
  `;

  // Insert after the filters bar in the orders view
  const ordersView = document.getElementById('orders-view');
  const filtersBar = ordersView.querySelector('.filters-bar');
  if (filtersBar) {
    filtersBar.insertAdjacentElement('afterend', actionBar);
  } else {
    // Fallback: prepend to orders view
    ordersView.prepend(actionBar);
  }
}

/**
 * Clear all selections
 */
function clearSelection() {
  state.selectedOrders.clear();
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
  }
  renderOrders();
  updateBulkActionBar();
}

/**
 * Bulk approve selected orders
 */
async function bulkApproveOrders() {
  const selectedCount = state.selectedOrders.size;

  if (selectedCount === 0) {
    alert('No hay pedidos seleccionados');
    return;
  }

  // Filter out already approved orders
  const ordersToApprove = Array.from(state.selectedOrders)
    .map(id => state.orders.find(o => Number(o.id) === Number(id)))
    .filter(order => order && order.approvalStatus === 'pending_review');

  if (ordersToApprove.length === 0) {
    alert('Ninguno de los pedidos seleccionados está pendiente de aprobación');
    return;
  }

  if (!confirm(`¿Aprobar ${ordersToApprove.length} pedido(s)?\n\nSe generarán y enviarán recibos a los clientes.`)) {
    return;
  }

  let successCount = 0;
  let failCount = 0;

  // Show progress
  const progressDiv = document.createElement('div');
  progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; min-width: 300px; text-align: center;';
  progressDiv.innerHTML = `
    <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Aprobando pedidos...</div>
    <div style="font-size: 14px; color: #6b7280;">Procesando <span id="bulk-progress">0</span> de ${ordersToApprove.length}</div>
  `;
  document.body.appendChild(progressDiv);

  // Process each order
  for (let i = 0; i < ordersToApprove.length; i++) {
    const order = ordersToApprove[i];
    document.getElementById('bulk-progress').textContent = i + 1;

    try {
      const depositAmount = order.depositAmount || (order.totalPrice / 2);

      const response = await fetch(`${API_BASE}/orders/${order.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actualDepositAmount: depositAmount })
      });

      const data = await response.json();

      if (data.success) {
        successCount++;
      } else {
        failCount++;
        console.error(`Failed to approve order ${order.orderNumber}:`, data.error);
      }
    } catch (error) {
      failCount++;
      console.error(`Error approving order ${order.orderNumber}:`, error);
    }
  }

  // Remove progress dialog
  document.body.removeChild(progressDiv);

  // Show results
  alert(`✅ Completado:\n\n${successCount} pedido(s) aprobado(s)\n${failCount} error(es)`);

  // Refresh and clear selection
  clearSelection();
  loadOrders();
}

/**
 * Bulk archive selected orders
 * @param {string} archiveStatus - 'completo' or 'cancelado'
 */
async function bulkArchiveOrders(archiveStatus) {
  const selectedCount = state.selectedOrders.size;

  if (selectedCount === 0) {
    alert('No hay pedidos seleccionados');
    return;
  }

  const statusText = archiveStatus === 'completo' ? 'completados' : 'cancelados';
  const selectedOrders = Array.from(state.selectedOrders)
    .map(id => state.orders.find(o => Number(o.id) === Number(id)))
    .filter(order => order);

  if (!confirm(`¿Marcar ${selectedOrders.length} pedido(s) como ${statusText}?`)) {
    return;
  }

  let successCount = 0;
  let failCount = 0;

  // Show progress
  const progressDiv = document.createElement('div');
  progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; min-width: 300px; text-align: center;';
  progressDiv.innerHTML = `
    <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Marcando pedidos como ${statusText}...</div>
    <div style="font-size: 14px; color: #6b7280;">Procesando <span id="bulk-progress">0</span> de ${selectedOrders.length}</div>
  `;
  document.body.appendChild(progressDiv);

  // Process each order
  for (let i = 0; i < selectedOrders.length; i++) {
    const order = selectedOrders[i];
    document.getElementById('bulk-progress').textContent = i + 1;

    try {
      const response = await fetch(`${API_BASE}/orders/${order.id}/archive`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ archiveStatus })
      });

      const data = await response.json();

      if (data.success) {
        successCount++;
      } else {
        failCount++;
        console.error(`Failed to archive order ${order.orderNumber}:`, data.error);
      }
    } catch (error) {
      failCount++;
      console.error(`Error archiving order ${order.orderNumber}:`, error);
    }
  }

  // Remove progress dialog
  document.body.removeChild(progressDiv);

  // Show results
  alert(`✅ Completado:\n\n${successCount} pedido(s) marcado(s) como ${statusText}\n${failCount} error(es)`);

  // Refresh and clear selection
  clearSelection();
  loadOrders();
}

/**
 * Copy text to clipboard and show feedback
 */
function copyToClipboard(text, label = 'Texto') {
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    // Show brief feedback
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #10B981;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideUp 0.3s ease;
    `;
    notification.textContent = `${label} copiado`;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

// ==========================================
// FACEBOOK MARKETPLACE FUNCTIONS
// ==========================================

async function queueForFacebook(orderId, imageUrl, title) {
  const btnId = `fb-btn-${btoa(imageUrl).substring(0, 10)}`;
  const btn = document.getElementById(btnId);

  try {
    // Show loading state
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳';
      btn.style.background = 'rgba(107, 114, 128, 0.9)';
    }

    const response = await fetch(`${API_BASE}/facebook/queue`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        orderId,
        imageUrl,
        title
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al encolar para Facebook');
    }

    // Show success state - green checkmark
    if (btn) {
      btn.innerHTML = '✓';
      btn.style.background = 'rgba(34, 197, 94, 0.9)';
      btn.title = 'En cola para Facebook Marketplace';
      btn.disabled = true;
    }

    console.log(`✅ Queued for Facebook: ${title}`);

  } catch (error) {
    console.error('Error queueing for Facebook:', error);

    // Show error state - restore original
    if (btn) {
      btn.innerHTML = 'f';
      btn.style.background = 'rgba(24, 119, 242, 0.9)';
      btn.disabled = false;
    }

    alert(`Error: ${error.message}`);
  }
}

async function checkFacebookStatus(imageUrl) {
  try {
    const response = await fetch(`${API_BASE}/facebook/status?imageUrl=${encodeURIComponent(imageUrl)}`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();
    return result.data || { queued: false, uploaded: false };

  } catch (error) {
    console.error('Error checking Facebook status:', error);
    return { queued: false, uploaded: false };
  }
}

// ========================================
// ORDER ITEM EDIT FUNCTIONS
// ========================================

/**
 * Open modal to edit a product's quantity and size (for magnets)
 */
function openEditProductModal(orderId, itemId, productName, currentQuantity, unitPrice) {
  const modal = document.createElement('div');
  modal.id = 'edit-product-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
  `;

  // Check if product is a magnet (Imanes de MDF) - exclude 3D and Foil variants
  const productLower = productName.toLowerCase();
  const isMagnet = (productLower.includes('iman') || productLower.includes('imán') || productLower.includes('imanes'))
                   && !productLower.includes('3d') && !productLower.includes('foil');

  // Determine current size based on product name first, then unit price
  // Pricing: Chico: $8 (50-999) / $6 (1000+), Mediano: $11 (50-999) / $8 (1000+), Grande: $15 (50-999) / $12 (1000+)
  let currentSize = 'mediano'; // Default to mediano
  if (isMagnet) {
    // Try to detect from product name first
    if (productLower.includes('chico') || productLower.includes('pequeño')) {
      currentSize = 'chico';
    } else if (productLower.includes('grande') || productLower.includes('large')) {
      currentSize = 'grande';
    } else if (productLower.includes('mediano') || productLower.includes('medium')) {
      currentSize = 'mediano';
    } else {
      // Fallback: detect from unit price
      if (unitPrice === 8 || unitPrice === 6) {
        // Could be Chico at low vol ($8) or Chico at high vol ($6), or Mediano at high vol ($8)
        // Check quantity to disambiguate
        currentSize = currentQuantity >= 1000 ? 'mediano' : 'chico';
      } else if (unitPrice === 11) {
        currentSize = 'mediano';
      } else if (unitPrice === 15 || unitPrice === 12) {
        currentSize = 'grande';
      }
    }
  }

  // Size selector HTML (only for magnets)
  const sizeSelector = isMagnet ? `
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Tamaño del Imán</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <label style="flex: 1; min-width: 120px; display: flex; align-items: center; padding: 10px; border: 2px solid ${currentSize === 'chico' ? 'var(--primary)' : 'var(--gray-200)'}; border-radius: 8px; cursor: pointer; background: ${currentSize === 'chico' ? 'rgba(231, 42, 136, 0.05)' : 'white'};">
            <input type="radio" name="magnet-size" value="chico" ${currentSize === 'chico' ? 'checked' : ''} onchange="updateMagnetPrice()" style="margin-right: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Chico</div>
              <div style="font-size: 11px; color: var(--gray-500);">$8 (50-999) · $6 (1000+)</div>
            </div>
          </label>
          <label style="flex: 1; min-width: 120px; display: flex; align-items: center; padding: 10px; border: 2px solid ${currentSize === 'mediano' ? 'var(--primary)' : 'var(--gray-200)'}; border-radius: 8px; cursor: pointer; background: ${currentSize === 'mediano' ? 'rgba(231, 42, 136, 0.05)' : 'white'};">
            <input type="radio" name="magnet-size" value="mediano" ${currentSize === 'mediano' ? 'checked' : ''} onchange="updateMagnetPrice()" style="margin-right: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Mediano</div>
              <div style="font-size: 11px; color: var(--gray-500);">$11 (50-999) · $8 (1000+)</div>
            </div>
          </label>
          <label style="flex: 1; min-width: 120px; display: flex; align-items: center; padding: 10px; border: 2px solid ${currentSize === 'grande' ? 'var(--primary)' : 'var(--gray-200)'}; border-radius: 8px; cursor: pointer; background: ${currentSize === 'grande' ? 'rgba(231, 42, 136, 0.05)' : 'white'};">
            <input type="radio" name="magnet-size" value="grande" ${currentSize === 'grande' ? 'checked' : ''} onchange="updateMagnetPrice()" style="margin-right: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Grande</div>
              <div style="font-size: 11px; color: var(--gray-500);">$15 (50-999) · $12 (1000+)</div>
            </div>
          </label>
        </div>
      </div>
      <div id="price-preview" style="margin-bottom: 16px; padding: 12px; background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 13px; color: var(--gray-600);">Precio unitario:</span>
        <span id="unit-price-display" style="font-size: 18px; font-weight: 700; color: var(--primary);">$${unitPrice.toFixed(2)}</span>
      </div>
  ` : '';

  modal.innerHTML = `
    <div style="background: white; border-radius: 12px; padding: 24px; width: 450px; max-width: 90vw; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; color: var(--gray-800);">✏️ Editar Producto</h3>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Producto</label>
        <div style="padding: 10px; background: var(--gray-100); border-radius: 6px; font-weight: 500;">${productName}</div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Cantidad Actual</label>
        <div style="padding: 10px; background: var(--gray-100); border-radius: 6px;">${currentQuantity} pzas</div>
      </div>

      ${sizeSelector}

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Nueva Cantidad</label>
        <input type="number" id="new-quantity" value="${currentQuantity}" min="1" onchange="updateMagnetPrice()"
               style="width: 100%; padding: 10px; border: 2px solid var(--gray-200); border-radius: 6px; font-size: 14px; box-sizing: border-box;">
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Razon del cambio</label>
        <textarea id="change-reason" placeholder="Ej: Cliente solicito agregar mas piezas..."
                  style="width: 100%; padding: 10px; border: 2px solid var(--gray-200); border-radius: 6px; font-size: 14px; min-height: 60px; resize: vertical; box-sizing: border-box;"></textarea>
      </div>

      <input type="hidden" id="original-unit-price" value="${unitPrice}">
      <input type="hidden" id="is-magnet" value="${isMagnet}">
      <input type="hidden" id="current-unit-price" value="${unitPrice}">

      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button onclick="closeEditProductModal()"
                style="padding: 10px 20px; background: var(--gray-200); border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          Cancelar
        </button>
        <button onclick="saveProductChanges(${orderId}, ${itemId}, '${productName.replace(/'/g, "\\'")}', ${currentQuantity}, ${unitPrice})"
                style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          Guardar Cambios
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('new-quantity').focus();

  // Initial price update for magnets
  if (isMagnet) {
    updateMagnetPrice();
  }
}

/**
 * Update magnet price based on size and quantity selection
 */
function updateMagnetPrice() {
  const isMagnet = document.getElementById('is-magnet')?.value === 'true';
  if (!isMagnet) return;

  const sizeRadio = document.querySelector('input[name="magnet-size"]:checked');
  const quantityInput = document.getElementById('new-quantity');
  const priceDisplay = document.getElementById('unit-price-display');
  const currentPriceInput = document.getElementById('current-unit-price');

  if (!sizeRadio || !quantityInput || !priceDisplay) return;

  const size = sizeRadio.value;
  const quantity = parseInt(quantityInput.value) || 100;

  // Calculate price based on size and quantity
  // Chico: $8 (50-999), $6 (1000+)
  // Mediano: $11 (50-999), $8 (1000+)
  // Grande: $15 (50-999), $12 (1000+)
  let newPrice;
  if (size === 'chico') {
    newPrice = quantity >= 1000 ? 6 : 8;
  } else if (size === 'mediano') {
    newPrice = quantity >= 1000 ? 8 : 11;
  } else {
    // grande
    newPrice = quantity >= 1000 ? 12 : 15;
  }

  priceDisplay.textContent = `$${newPrice.toFixed(2)}`;
  currentPriceInput.value = newPrice;

  // Update radio button styles
  document.querySelectorAll('input[name="magnet-size"]').forEach(radio => {
    const label = radio.closest('label');
    if (radio.checked) {
      label.style.borderColor = 'var(--primary)';
      label.style.background = 'rgba(231, 42, 136, 0.05)';
    } else {
      label.style.borderColor = 'var(--gray-200)';
      label.style.background = 'white';
    }
  });
}

function closeEditProductModal() {
  const modal = document.getElementById('edit-product-modal');
  if (modal) modal.remove();
}

async function saveProductChanges(orderId, itemId, productName, oldQuantity, originalUnitPrice) {
  const newQuantity = parseInt(document.getElementById('new-quantity').value);
  const reason = document.getElementById('change-reason').value.trim();

  // Get the new unit price (may have changed if magnet size was changed)
  const currentPriceInput = document.getElementById('current-unit-price');
  const newUnitPrice = currentPriceInput ? parseFloat(currentPriceInput.value) : originalUnitPrice;

  // Get magnet size if applicable
  const sizeRadio = document.querySelector('input[name="magnet-size"]:checked');
  const newSize = sizeRadio ? sizeRadio.value : null;

  if (!newQuantity || newQuantity < 1) {
    alert('La cantidad debe ser mayor a 0');
    return;
  }

  // Check if anything changed
  const quantityChanged = newQuantity !== oldQuantity;
  const priceChanged = newUnitPrice !== originalUnitPrice;

  if (!quantityChanged && !priceChanged) {
    alert('No se han realizado cambios');
    return;
  }

  if (!reason) {
    alert('Por favor indica la razon del cambio');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/items/${itemId}/modify`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        newQuantity,
        reason,
        oldQuantity,
        productName,
        unitPrice: originalUnitPrice,
        newUnitPrice: newUnitPrice,
        newSize: newSize
      })
    });

    const data = await response.json();

    if (data.success) {
      closeEditProductModal();
      alert('Producto actualizado correctamente. Se ha notificado al cliente.');
      showOrderDetail(orderId);
      loadOrders();
    } else {
      alert('Error: ' + (data.error || 'No se pudo actualizar el producto'));
    }
  } catch (error) {
    console.error('Error updating product:', error);
    alert('Error al actualizar el producto');
  }
}

async function openAddProductModal(orderId) {
  let products = [];
  try {
    const response = await fetch(`${API_BASE}/prices/products`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (data.success) {
      products = data.data || [];
    }
  } catch (error) {
    console.error('Error fetching products:', error);
  }

  const modal = document.createElement('div');
  modal.id = 'add-product-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
  `;

  modal.innerHTML = `
    <div style="background: white; border-radius: 12px; padding: 24px; width: 450px; max-width: 90vw; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; color: var(--gray-800);">➕ Agregar Producto al Pedido</h3>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Seleccionar Producto</label>
        <select id="add-product-select" onchange="updateAddProductPrice()"
                style="width: 100%; padding: 10px; border: 2px solid var(--gray-200); border-radius: 6px; font-size: 14px; box-sizing: border-box;">
          <option value="">-- Selecciona un producto --</option>
          ${products.map(p => `<option value="${p.product_id}" data-price="${p.current_price}" data-name="${p.product_name}">${p.product_name} - ${formatCurrency(p.current_price)}/pza</option>`).join('')}
        </select>
      </div>

      <div id="add-product-size-selector" style="display: none; margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Tamaño del Imán</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <label id="add-size-chico-label" style="flex: 1; min-width: 120px; display: flex; align-items: center; padding: 10px; border: 2px solid var(--gray-200); border-radius: 8px; cursor: pointer; background: white;">
            <input type="radio" name="add-magnet-size" value="chico" onchange="updateAddMagnetPrice()" style="margin-right: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Chico</div>
              <div style="font-size: 11px; color: var(--gray-500);">$8 (50-999) · $6 (1000+)</div>
            </div>
          </label>
          <label id="add-size-mediano-label" style="flex: 1; min-width: 120px; display: flex; align-items: center; padding: 10px; border: 2px solid var(--primary); border-radius: 8px; cursor: pointer; background: rgba(231, 42, 136, 0.05);">
            <input type="radio" name="add-magnet-size" value="mediano" checked onchange="updateAddMagnetPrice()" style="margin-right: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Mediano</div>
              <div style="font-size: 11px; color: var(--gray-500);">$11 (50-999) · $8 (1000+)</div>
            </div>
          </label>
          <label id="add-size-grande-label" style="flex: 1; min-width: 120px; display: flex; align-items: center; padding: 10px; border: 2px solid var(--gray-200); border-radius: 8px; cursor: pointer; background: white;">
            <input type="radio" name="add-magnet-size" value="grande" onchange="updateAddMagnetPrice()" style="margin-right: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 14px;">Grande</div>
              <div style="font-size: 11px; color: var(--gray-500);">$15 (50-999) · $12 (1000+)</div>
            </div>
          </label>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Cantidad</label>
        <input type="number" id="add-product-quantity" value="50" min="1" onchange="updateAddProductTotal(); updateAddMagnetPrice()"
               style="width: 100%; padding: 10px; border: 2px solid var(--gray-200); border-radius: 6px; font-size: 14px; box-sizing: border-box;">
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Precio Unitario</label>
        <input type="number" id="add-product-price" value="0" min="0" step="0.01" onchange="updateAddProductTotal()"
               style="width: 100%; padding: 10px; border: 2px solid var(--gray-200); border-radius: 6px; font-size: 14px; box-sizing: border-box;">
      </div>

      <div style="margin-bottom: 16px; padding: 12px; background: var(--gray-100); border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>Subtotal:</span>
          <span id="add-product-total">$0.00</span>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">Razon para agregar</label>
        <textarea id="add-product-reason" placeholder="Ej: Cliente solicito agregar este producto a su pedido..."
                  style="width: 100%; padding: 10px; border: 2px solid var(--gray-200); border-radius: 6px; font-size: 14px; min-height: 60px; resize: vertical; box-sizing: border-box;"></textarea>
      </div>

      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button onclick="closeAddProductModal()"
                style="padding: 10px 20px; background: var(--gray-200); border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          Cancelar
        </button>
        <button onclick="addNewProduct(${orderId})"
                style="padding: 10px 20px; background: var(--success); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          Agregar Producto
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function updateAddProductPrice() {
  const select = document.getElementById('add-product-select');
  const option = select.options[select.selectedIndex];
  const productName = (option.dataset.name || '').toLowerCase();
  const sizeSelector = document.getElementById('add-product-size-selector');

  // Check if selected product is a magnet (exclude 3D and Foil)
  const isMagnet = (productName.includes('iman') || productName.includes('imán') || productName.includes('imanes'))
                   && !productName.includes('3d') && !productName.includes('foil');

  if (isMagnet && sizeSelector) {
    sizeSelector.style.display = 'block';
    updateAddMagnetPrice();
  } else {
    if (sizeSelector) sizeSelector.style.display = 'none';
    const price = option.dataset.price || 0;
    document.getElementById('add-product-price').value = price;
    updateAddProductTotal();
  }
}

function updateAddProductTotal() {
  const quantity = parseInt(document.getElementById('add-product-quantity').value) || 0;
  const price = parseFloat(document.getElementById('add-product-price').value) || 0;
  const total = quantity * price;
  document.getElementById('add-product-total').textContent = formatCurrency(total);
}

function updateAddMagnetPrice() {
  const sizeSelector = document.getElementById('add-product-size-selector');
  if (!sizeSelector || sizeSelector.style.display === 'none') return;

  const selected = document.querySelector('input[name="add-magnet-size"]:checked');
  if (!selected) return;

  const size = selected.value;
  const quantity = parseInt(document.getElementById('add-product-quantity').value) || 50;
  const highVol = quantity >= 1000;

  const prices = {
    chico: highVol ? 6 : 8,
    mediano: highVol ? 8 : 11,
    grande: highVol ? 12 : 15
  };

  document.getElementById('add-product-price').value = prices[size];

  // Update visual styling on size labels
  ['chico', 'mediano', 'grande'].forEach(s => {
    const label = document.getElementById(`add-size-${s}-label`);
    if (label) {
      label.style.borderColor = s === size ? 'var(--primary)' : 'var(--gray-200)';
      label.style.background = s === size ? 'rgba(231, 42, 136, 0.05)' : 'white';
    }
  });

  updateAddProductTotal();
}

function closeAddProductModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) modal.remove();
}

async function addNewProduct(orderId) {
  const select = document.getElementById('add-product-select');
  const option = select.options[select.selectedIndex];
  const productId = select.value;
  let productName = option.dataset.name;
  const quantity = parseInt(document.getElementById('add-product-quantity').value);
  const unitPrice = parseFloat(document.getElementById('add-product-price').value);
  const reason = document.getElementById('add-product-reason').value.trim();

  // Append size to product name for magnets
  const sizeSelector = document.getElementById('add-product-size-selector');
  if (sizeSelector && sizeSelector.style.display !== 'none') {
    const selected = document.querySelector('input[name="add-magnet-size"]:checked');
    if (selected) {
      const sizeLabels = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' };
      productName = productName + ' ' + sizeLabels[selected.value];
    }
  }

  if (!productId) {
    alert('Por favor selecciona un producto');
    return;
  }

  if (!quantity || quantity < 1) {
    alert('La cantidad debe ser mayor a 0');
    return;
  }

  if (!unitPrice || unitPrice <= 0) {
    alert('El precio debe ser mayor a 0');
    return;
  }

  if (!reason) {
    alert('Por favor indica la razon para agregar el producto');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/items/add`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productId,
        productName,
        quantity,
        unitPrice,
        reason
      })
    });

    const data = await response.json();

    if (data.success) {
      closeAddProductModal();
      alert('Producto agregado correctamente. Se ha notificado al cliente.');
      showOrderDetail(orderId);
      loadOrders();
    } else {
      alert('Error: ' + (data.error || 'No se pudo agregar el producto'));
    }
  } catch (error) {
    console.error('Error adding product:', error);
    alert('Error al agregar el producto');
  }
}

async function deleteOrderItem(orderId, itemId, productName, quantity, unitPrice) {
  const subtotal = (quantity * unitPrice).toFixed(2);
  const confirmed = confirm(
    `¿Eliminar "${productName}" del pedido?\n\n` +
    `Cantidad: ${quantity} pzas\n` +
    `Precio: $${unitPrice.toFixed(2)}/pza\n` +
    `Subtotal: $${subtotal}\n\n` +
    `Esta acción no se puede deshacer.`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/items/${itemId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      alert('Producto eliminado correctamente.');
      showOrderDetail(orderId);
      loadOrders();
    } else {
      alert('Error: ' + (data.error || 'No se pudo eliminar el producto'));
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    alert('Error al eliminar el producto');
  }
}

// Make functions globally accessible for onclick handlers
window.loadOrders = loadOrders;
window.closeOrderDetail = closeOrderDetail;
window.approveOrder = approveOrder;
window.rejectOrder = rejectOrder;
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.openClientLookup = openClientLookup;
window.closeClientLookup = closeClientLookup;
window.lookupClientOrders = lookupClientOrders;
window.closeDepositModal = closeDepositModal;
window.confirmApproveWithDeposit = confirmApproveWithDeposit;
window.downloadReceipt = downloadReceipt;
window.shareReceipt = shareReceipt;
window.confirmSecondPayment = confirmSecondPayment;
window.archiveOrder = archiveOrder;
window.toggleOrderSelection = toggleOrderSelection;
window.toggleSelectAll = toggleSelectAll;
window.clearSelection = clearSelection;
window.bulkApproveOrders = bulkApproveOrders;
window.bulkArchiveOrders = bulkArchiveOrders;
window.copyToClipboard = copyToClipboard;
window.queueForFacebook = queueForFacebook;
window.openEditProductModal = openEditProductModal;
window.closeEditProductModal = closeEditProductModal;
window.saveProductChanges = saveProductChanges;
window.updateMagnetPrice = updateMagnetPrice;
window.openAddProductModal = openAddProductModal;
window.closeAddProductModal = closeAddProductModal;
window.addNewProduct = addNewProduct;
window.updateAddProductPrice = updateAddProductPrice;
window.updateAddProductTotal = updateAddProductTotal;
window.updateAddMagnetPrice = updateAddMagnetPrice;
window.deleteOrderItem = deleteOrderItem;

// ==========================================
// CREATE ORDER MODAL
// ==========================================

let createOrderState = {
  currentStep: 1,
  products: [],
  selectedProducts: {} // productId -> quantity
};

/**
 * Open the create order modal
 */
async function openCreateOrderModal() {
  // Reset state
  createOrderState = {
    currentStep: 1,
    products: [],
    selectedProducts: {}
  };

  // Reset form fields
  document.getElementById('new-order-client-name').value = '';
  document.getElementById('new-order-client-phone').value = '';
  document.getElementById('new-order-client-email').value = '';
  document.getElementById('new-order-client-city').value = '';
  document.getElementById('new-order-client-address').value = '';

  // Reset steps
  updateCreateOrderStep(1);

  // Load products for step 2
  await loadProductsForCreateOrder();

  // Show modal
  document.getElementById('create-order-modal').classList.remove('hidden');

  // Re-initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Close the create order modal
 */
function closeCreateOrderModal() {
  document.getElementById('create-order-modal').classList.add('hidden');
}

/**
 * Load products for the create order form
 */
async function loadProductsForCreateOrder() {
  const container = document.getElementById('create-order-products-list');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Cargando productos...</p></div>';

  try {
    const response = await fetch(`${API_BASE}/client/products`);
    const data = await response.json();

    if (data.success && data.products) {
      createOrderState.products = data.products;
      renderProductsForCreateOrder();
    } else {
      container.innerHTML = '<p style="text-align: center; color: #6b7280;">No se pudieron cargar los productos</p>';
    }
  } catch (error) {
    console.error('Error loading products:', error);
    container.innerHTML = '<p style="text-align: center; color: #ef4444;">Error al cargar productos</p>';
  }
}

/**
 * Render products in the create order form
 */
function renderProductsForCreateOrder() {
  const container = document.getElementById('create-order-products-list');

  if (!createOrderState.products.length) {
    container.innerHTML = '<p style="text-align: center; color: #6b7280;">No hay productos disponibles</p>';
    return;
  }

  container.innerHTML = createOrderState.products.map(product => {
    const quantity = createOrderState.selectedProducts[product.id] || 0;
    // Handle different field names and ensure it's a number
    const price = parseFloat(product.base_price || product.basePrice || product.price || 0);
    const subtotal = quantity * price;

    return `
      <div class="create-order-product-card ${quantity > 0 ? 'selected' : ''}" data-product-id="${product.id}">
        <div style="display: flex; gap: 12px; align-items: center;">
          <img src="${product.thumbnail_url || product.image_url || product.thumbnailUrl || product.imageUrl || ''}" alt="${product.name}"
               style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; background: #f3f4f6;"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 font-size=%2240%22 text-anchor=%22middle%22 dy=%22.3em%22>📦</text></svg>'">
          <div style="flex: 1;">
            <h4 style="margin: 0 0 4px 0; font-weight: 600; color: #111827;">${product.name}</h4>
            <p style="margin: 0; font-size: 14px; color: #6b7280;">$${price.toFixed(2)} c/u</p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="updateCreateOrderQuantity(${product.id}, -1)" class="qty-btn" ${quantity === 0 ? 'disabled' : ''}>−</button>
            <input type="number" value="${quantity}" min="0"
                   onchange="setCreateOrderQuantity(${product.id}, this.value)"
                   style="width: 60px; text-align: center; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-weight: 600;">
            <button onclick="updateCreateOrderQuantity(${product.id}, 1)" class="qty-btn">+</button>
          </div>
        </div>
        ${quantity > 0 ? `<div style="text-align: right; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;"><span style="font-weight: 600; color: #166534;">Subtotal: $${subtotal.toFixed(2)}</span></div>` : ''}
      </div>
    `;
  }).join('');

  updateCreateOrderTotal();
}

/**
 * Update product quantity
 */
function updateCreateOrderQuantity(productId, delta) {
  const current = createOrderState.selectedProducts[productId] || 0;
  const newQty = Math.max(0, current + delta);

  if (newQty === 0) {
    delete createOrderState.selectedProducts[productId];
  } else {
    createOrderState.selectedProducts[productId] = newQty;
  }

  renderProductsForCreateOrder();
}

/**
 * Set product quantity directly
 */
function setCreateOrderQuantity(productId, value) {
  const qty = parseInt(value) || 0;

  if (qty <= 0) {
    delete createOrderState.selectedProducts[productId];
  } else {
    createOrderState.selectedProducts[productId] = qty;
  }

  renderProductsForCreateOrder();
}

/**
 * Update order total display
 */
function updateCreateOrderTotal() {
  let total = 0;

  for (const [productId, quantity] of Object.entries(createOrderState.selectedProducts)) {
    const product = createOrderState.products.find(p => p.id === parseInt(productId));
    if (product) {
      const price = parseFloat(product.base_price || product.basePrice || product.price || 0);
      total += price * quantity;
    }
  }

  document.getElementById('create-order-total').textContent = `$${total.toFixed(2)}`;
}

/**
 * Update step indicator and visibility
 */
function updateCreateOrderStep(step) {
  createOrderState.currentStep = step;

  // Update step indicators
  document.querySelectorAll('.create-order-steps .step').forEach((el, idx) => {
    if (idx + 1 <= step) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Show/hide step content
  for (let i = 1; i <= 2; i++) {
    const stepEl = document.getElementById(`create-order-step-${i}`);
    if (stepEl) {
      stepEl.classList.toggle('hidden', i !== step);
    }
  }

  // Update buttons
  document.getElementById('create-order-prev-btn').style.display = step > 1 ? 'block' : 'none';
  document.getElementById('create-order-next-btn').style.display = step < 2 ? 'block' : 'none';
  document.getElementById('create-order-submit-btn').style.display = step === 2 ? 'block' : 'none';
}

/**
 * Go to next step
 */
function createOrderNextStep() {
  // Validate current step
  if (createOrderState.currentStep === 1) {
    const name = document.getElementById('new-order-client-name').value.trim();
    const phone = document.getElementById('new-order-client-phone').value.trim();

    if (!name) {
      alert('Por favor ingresa el nombre del cliente');
      document.getElementById('new-order-client-name').focus();
      return;
    }
    if (!phone) {
      alert('Por favor ingresa el teléfono del cliente');
      document.getElementById('new-order-client-phone').focus();
      return;
    }
  }

  if (createOrderState.currentStep < 2) {
    updateCreateOrderStep(createOrderState.currentStep + 1);
  }
}

/**
 * Go to previous step
 */
function createOrderPrevStep() {
  if (createOrderState.currentStep > 1) {
    updateCreateOrderStep(createOrderState.currentStep - 1);
  }
}

/**
 * Submit the new order
 */
async function submitNewOrder() {
  // Validate products are selected
  if (Object.keys(createOrderState.selectedProducts).length === 0) {
    alert('Por favor selecciona al menos un producto');
    return;
  }

  // Gather form data
  const clientName = document.getElementById('new-order-client-name').value.trim();
  const clientPhone = document.getElementById('new-order-client-phone').value.trim();
  const clientEmail = document.getElementById('new-order-client-email').value.trim();
  const clientCity = document.getElementById('new-order-client-city').value.trim();
  const clientAddress = document.getElementById('new-order-client-address').value.trim();

  // Build items array
  const items = [];
  let totalPrice = 0;
  let totalCost = 0;

  for (const [productId, quantity] of Object.entries(createOrderState.selectedProducts)) {
    const product = createOrderState.products.find(p => p.id === parseInt(productId));
    if (product) {
      const unitPrice = parseFloat(product.base_price || product.basePrice || product.price || 0);
      const unitCost = parseFloat(product.production_cost || product.productionCost || product.cost || 0);
      const lineTotal = unitPrice * quantity;
      const lineCost = unitCost * quantity;
      totalPrice += lineTotal;
      totalCost += lineCost;

      items.push({
        productId: product.id,
        productName: product.name,
        quantity: quantity,
        unitPrice: unitPrice,
        unitCost: unitCost,
        lineTotal: lineTotal,
        lineCost: lineCost
      });
    }
  }

  // Build order payload
  const orderData = {
    clientName,
    clientPhone,
    clientEmail: clientEmail || null,
    clientCity: clientCity || null,
    clientAddress: clientAddress || null,
    items,
    totalPrice,
    productionCost: totalCost,
    status: 'pending_review',
    depositAmount: Math.ceil(totalPrice * 0.5),
    createdBy: 'admin'
  };

  // Submit button state
  const submitBtn = document.getElementById('create-order-submit-btn');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-sm"></span> Creando...';

  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (result.success || response.ok) {
      closeCreateOrderModal();

      // Show success message
      alert(`✅ Pedido creado exitosamente!\n\nNúmero: ${result.data?.orderNumber || 'Generado'}\nCliente: ${clientName}\nTotal: $${totalPrice.toFixed(2)}`);

      // Reload orders list
      loadOrders();
    } else {
      alert('Error al crear el pedido: ' + (result.message || 'Error desconocido'));
    }
  } catch (error) {
    console.error('Error creating order:', error);
    alert('Error de conexión al crear el pedido');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// Export create order functions
window.openCreateOrderModal = openCreateOrderModal;
window.closeCreateOrderModal = closeCreateOrderModal;
window.updateCreateOrderQuantity = updateCreateOrderQuantity;
window.setCreateOrderQuantity = setCreateOrderQuantity;
window.createOrderNextStep = createOrderNextStep;
window.createOrderPrevStep = createOrderPrevStep;
window.submitNewOrder = submitNewOrder;

// ==========================================
// REFERENCE SHEET GENERATION (AXKAN ORDEN DE COMPRA)
// ==========================================

// AXKAN brand colors
const AXKAN_COLORS = ['#E91E63', '#7CB342', '#FF9800', '#00BCD4', '#F44336'];

// Reference sheet modal state
const refSheetState = {
  orderId: null,
  orderNumber: null,
  orderName: '',
  instructions: '',
  numDesigns: 0,
  selectedSlot: null,
  designs: {} // { slotIndex: { type: '', quantity: 0, imageData: null } }
};

/**
 * Open the reference sheet generator modal
 */
function generateReferenceSheet(orderId, orderNumber) {
  refSheetState.orderId = orderId;
  refSheetState.orderNumber = orderNumber;
  refSheetState.orderName = orderNumber || '';
  refSheetState.instructions = '';
  refSheetState.numDesigns = 0;
  refSheetState.selectedSlot = null;
  refSheetState.designs = {};

  // Pre-fill order name
  document.getElementById('ref-sheet-order-name').value = refSheetState.orderName;
  document.getElementById('ref-sheet-instructions').value = '';
  document.getElementById('ref-sheet-custom-num').value = '';
  document.getElementById('ref-sheet-selected-num').textContent = 'Seleccionado: -';

  // Reset button highlights
  document.querySelectorAll('.num-designs-btn').forEach(btn => {
    btn.style.opacity = '1';
    btn.style.transform = 'scale(1)';
  });

  // Show step 1, hide step 2
  document.getElementById('ref-sheet-step-1').classList.remove('hidden');
  document.getElementById('ref-sheet-step-2').classList.add('hidden');

  // Show modal
  document.getElementById('reference-sheet-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Setup paste listener
  document.addEventListener('paste', handleRefSheetPaste);
}

/**
 * Close the reference sheet modal
 */
function closeRefSheetModal() {
  document.getElementById('reference-sheet-modal').classList.add('hidden');
  document.body.style.overflow = '';
  document.removeEventListener('paste', handleRefSheetPaste);
}

/**
 * Select number of designs
 */
function selectNumDesigns(num) {
  num = parseInt(num);
  if (isNaN(num) || num < 1) return;

  refSheetState.numDesigns = num;
  document.getElementById('ref-sheet-selected-num').textContent = `Seleccionado: ${num} diseños`;

  // Highlight selected button
  document.querySelectorAll('.num-designs-btn').forEach(btn => {
    const btnNum = parseInt(btn.dataset.num);
    if (btnNum === num) {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    } else {
      btn.style.opacity = '0.6';
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
    }
  });
}

/**
 * Go to step 1
 */
function goToRefSheetStep1() {
  document.getElementById('ref-sheet-step-1').classList.remove('hidden');
  document.getElementById('ref-sheet-step-2').classList.add('hidden');
}

/**
 * Go to step 2 and render design slots
 */
function goToRefSheetStep2() {
  refSheetState.orderName = document.getElementById('ref-sheet-order-name').value.trim();
  refSheetState.instructions = document.getElementById('ref-sheet-instructions').value.trim();

  if (!refSheetState.orderName) {
    alert('Por favor ingresa el nombre del pedido');
    document.getElementById('ref-sheet-order-name').focus();
    return;
  }

  if (refSheetState.numDesigns < 1) {
    alert('Por favor selecciona el número de diseños');
    return;
  }

  // Render design slots
  renderDesignSlots();

  // Show step 2, hide step 1
  document.getElementById('ref-sheet-step-1').classList.add('hidden');
  document.getElementById('ref-sheet-step-2').classList.remove('hidden');
}

/**
 * Render design slots grid
 */
function renderDesignSlots() {
  const grid = document.getElementById('ref-sheet-designs-grid');
  grid.innerHTML = '';

  for (let i = 0; i < refSheetState.numDesigns; i++) {
    const color = AXKAN_COLORS[i % 5];
    const design = refSheetState.designs[i] || { type: '', quantity: 0, imageData: null };

    const slot = document.createElement('div');
    slot.className = 'ref-sheet-slot';
    slot.dataset.index = i;
    slot.style.cssText = `
      border: 2px solid ${color};
      border-radius: 8px;
      background: white;
      padding: 8px;
      cursor: pointer;
      transition: all 0.2s;
    `;

    slot.innerHTML = `
      <!-- Tipo header -->
      <div style="background: ${color}; color: white; padding: 6px 8px; margin: -8px -8px 8px -8px; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: 600; font-size: 11px;">Tipo:</span>
        <input type="text" class="ref-slot-type" data-index="${i}" placeholder="Ej: Llavero"
               value="${design.type}"
               onclick="event.stopPropagation()"
               style="flex: 1; padding: 4px 8px; border: none; border-radius: 4px; font-size: 11px; background: rgba(255,255,255,0.9);">
      </div>

      <!-- Image area -->
      <div class="ref-slot-image-area" data-index="${i}"
           onclick="selectRefSheetSlot(${i})"
           style="height: 100px; border: 1px dashed #ccc; border-radius: 6px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; background: #f9f9f9; overflow: hidden;">
        ${design.imageData
          ? `<img src="${design.imageData}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`
          : `<div style="text-align: center; color: #999; font-size: 11px;">
               <div style="font-size: 24px; margin-bottom: 4px;">📷</div>
               Clic + Ctrl/Cmd+V<br>para pegar
             </div>`
        }
      </div>

      <!-- Quantity -->
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
        <span style="font-weight: 600; font-size: 11px; color: #333;">Requeridos:</span>
        <input type="number" class="ref-slot-qty" data-index="${i}" min="0" placeholder="0"
               value="${design.quantity || ''}"
               onclick="event.stopPropagation()"
               style="flex: 1; padding: 6px; border: 1px solid ${color}; border-radius: 4px; font-size: 12px; background: #f5f5f5;">
      </div>

      <!-- Browse button -->
      <button onclick="browseRefSheetImage(${i}); event.stopPropagation();"
              style="width: 100%; padding: 6px; background: ${color}; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
        📁 Examinar
      </button>

      <!-- Hidden file input -->
      <input type="file" id="ref-file-${i}" accept="image/*,.heic,.HEIC" style="display: none;"
             onchange="handleRefSheetFileSelect(${i}, event)">
    `;

    grid.appendChild(slot);
  }
}

/**
 * Select a slot for pasting
 */
function selectRefSheetSlot(index) {
  refSheetState.selectedSlot = index;

  // Visual feedback
  document.querySelectorAll('.ref-sheet-slot').forEach((slot, i) => {
    if (i === index) {
      slot.style.boxShadow = '0 0 0 3px #E91E63';
      slot.style.transform = 'scale(1.02)';
    } else {
      slot.style.boxShadow = 'none';
      slot.style.transform = 'scale(1)';
    }
  });
}

/**
 * Handle paste event
 */
function handleRefSheetPaste(event) {
  if (refSheetState.selectedSlot === null) {
    // Try to find if we're focused on an image area
    return;
  }

  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault();
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (e) => {
        addImageToSlot(refSheetState.selectedSlot, e.target.result);
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
}

/**
 * Browse for image file
 */
function browseRefSheetImage(index) {
  document.getElementById(`ref-file-${index}`).click();
}

/**
 * Handle file selection
 */
function handleRefSheetFileSelect(index, event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    addImageToSlot(index, e.target.result);
  };
  reader.readAsDataURL(file);
}

/**
 * Add image to a slot
 */
function addImageToSlot(index, imageData) {
  if (!refSheetState.designs[index]) {
    refSheetState.designs[index] = { type: '', quantity: 0, imageData: null };
  }
  refSheetState.designs[index].imageData = imageData;

  // Update the image area
  const imageArea = document.querySelector(`.ref-slot-image-area[data-index="${index}"]`);
  if (imageArea) {
    imageArea.innerHTML = `<img src="${imageData}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
    imageArea.style.background = '#fff';
  }

  // Visual feedback
  const slot = document.querySelector(`.ref-sheet-slot[data-index="${index}"]`);
  if (slot) {
    slot.style.background = '#f0fff4';
    setTimeout(() => {
      slot.style.background = 'white';
    }, 500);
  }
}

/**
 * Collect form data and generate PDF
 */
async function generateRefSheetPDF() {
  // Collect all data from inputs
  document.querySelectorAll('.ref-slot-type').forEach(input => {
    const idx = parseInt(input.dataset.index);
    if (!refSheetState.designs[idx]) {
      refSheetState.designs[idx] = { type: '', quantity: 0, imageData: null };
    }
    refSheetState.designs[idx].type = input.value.trim();
  });

  document.querySelectorAll('.ref-slot-qty').forEach(input => {
    const idx = parseInt(input.dataset.index);
    if (!refSheetState.designs[idx]) {
      refSheetState.designs[idx] = { type: '', quantity: 0, imageData: null };
    }
    refSheetState.designs[idx].quantity = parseInt(input.value) || 0;
  });

  // Build payload
  const payload = {
    orderName: refSheetState.orderName,
    instructions: refSheetState.instructions,
    numDesigns: refSheetState.numDesigns,
    orderId: refSheetState.orderId, // Include orderId to save to order
    designs: []
  };

  for (let i = 0; i < refSheetState.numDesigns; i++) {
    const design = refSheetState.designs[i] || { type: '', quantity: 0, imageData: null };
    payload.designs.push({
      type: design.type,
      quantity: design.quantity,
      imageData: design.imageData
    });
  }

  // Show loading
  const btn = document.getElementById('ref-sheet-generate-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> Generando...';

  try {
    // Call API
    const response = await fetch(`${API_BASE}/orders/reference-sheet/generate`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error al generar PDF');
    }

    // Download PDF
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${refSheetState.orderName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    // Success - show different message if saved to order
    if (refSheetState.orderId) {
      btn.innerHTML = '✓ Guardado y Descargado';
    } else {
      btn.innerHTML = '✓ Descargado';
    }
    btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

    setTimeout(async () => {
      closeRefSheetModal();
      btn.innerHTML = originalText;
      btn.style.background = '';
      btn.disabled = false;

      // Refresh orders if we saved to an order
      if (refSheetState.orderId) {
        await loadOrders();
      }
    }, 1500);

  } catch (error) {
    console.error('Error generating reference sheet:', error);
    alert('Error al generar la hoja de referencia: ' + error.message);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/**
 * View a saved reference sheet by fetching it from the server
 */
async function viewSavedReferenceSheet(orderId) {
  try {
    // Fetch the order to get the production sheet URL
    const response = await fetch(`${API_BASE}/orders/${orderId}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('No se pudo obtener el pedido');
    }

    const data = await response.json();
    const order = data.order || data;

    if (!order.productionSheetUrl) {
      alert('Este pedido no tiene hoja de referencia guardada');
      return;
    }

    // Open the PDF
    const url = order.productionSheetUrl;
    if (url.startsWith('data:application/pdf')) {
      const byteString = atob(url.split(',')[1]);
      const mimeString = url.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } else {
      window.open(url, '_blank');
    }
  } catch (error) {
    console.error('Error viewing reference sheet:', error);
    alert('Error al cargar la hoja de referencia: ' + error.message);
  }
}

/**
 * View a reference sheet from a direct URL
 */
function viewReferenceSheet(url) {
  if (url.startsWith('data:application/pdf')) {
    const byteString = atob(url.split(',')[1]);
    const mimeString = url.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } else {
    window.open(url, '_blank');
  }
}

// Export reference sheet functions
window.generateReferenceSheet = generateReferenceSheet;
window.closeRefSheetModal = closeRefSheetModal;
window.selectNumDesigns = selectNumDesigns;
window.goToRefSheetStep1 = goToRefSheetStep1;
window.goToRefSheetStep2 = goToRefSheetStep2;
window.selectRefSheetSlot = selectRefSheetSlot;
window.browseRefSheetImage = browseRefSheetImage;
window.handleRefSheetFileSelect = handleRefSheetFileSelect;
window.generateRefSheetPDF = generateRefSheetPDF;
window.viewReferenceSheet = viewReferenceSheet;
window.viewSavedReferenceSheet = viewSavedReferenceSheet;

// ==========================================
// SALESPEOPLE & COMMISSIONS SYSTEM
// ==========================================

/**
 * Load salespeople into the filter dropdown
 */
async function loadSalespeople() {
  try {
    const response = await fetch(`${API_BASE}/salespeople`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      console.error('Failed to load salespeople');
      return;
    }

    const data = await response.json();
    const salespeople = data.data || data.salespeople || [];

    const dropdown = document.getElementById('salesperson-filter');
    if (!dropdown) return;

    // Keep the first option "Todos los vendedores"
    dropdown.innerHTML = '<option value="">👤 Todos los vendedores</option>';

    // Add each salesperson
    salespeople.forEach(sp => {
      if (sp.is_active) {
        const option = document.createElement('option');
        option.value = sp.name;
        option.textContent = `👤 ${sp.name}`;
        dropdown.appendChild(option);
      }
    });

    console.log(`📋 Loaded ${salespeople.length} salespeople`);
  } catch (error) {
    console.error('Error loading salespeople:', error);
  }
}

/**
 * Filter orders by salesperson
 */
function filterBySalesperson(salespersonName) {
  state.salespersonFilter = salespersonName;
  applyFilter(state.currentFilter);
}

/**
 * Load commissions data into the inline comisiones view.
 * Note: All rendered content comes from our own backend API (trusted source),
 * not from user input, so DOM injection via innerHTML is safe here.
 */
// Comisiones period state
let comisionesPeriod = 'week';

function setComisionesPeriod(period) {
  comisionesPeriod = period;
  // Update active button
  document.querySelectorAll('.comisiones-period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  // Show/hide custom date inputs
  const customDates = document.getElementById('comisiones-custom-dates');
  if (customDates) {
    customDates.style.display = period === 'custom' ? 'flex' : 'none';
  }
  // If not custom, reload immediately
  if (period !== 'custom') {
    loadComisionesView();
  }
}

function getComisionesDateRange() {
  const now = new Date();
  let start = null;
  let end = null;

  switch (comisionesPeriod) {
    case 'week': {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday as start of week
      start = new Date(now);
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'half': {
      start = new Date(now);
      start.setMonth(now.getMonth() - 6);
      start.setDate(1);
      break;
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom': {
      const startInput = document.getElementById('comisiones-start-date');
      const endInput = document.getElementById('comisiones-end-date');
      if (startInput && startInput.value) start = new Date(startInput.value + 'T00:00:00');
      if (endInput && endInput.value) end = new Date(endInput.value + 'T23:59:59');
      break;
    }
    case 'all':
    default:
      // No date filter
      break;
  }

  // Update period label
  const label = document.getElementById('comisiones-period-label');
  if (label) {
    if (start && end) {
      label.textContent = `${start.toLocaleDateString('es-MX')} — ${end.toLocaleDateString('es-MX')}`;
    } else if (start) {
      label.textContent = `Desde ${start.toLocaleDateString('es-MX')}`;
    } else {
      label.textContent = 'Todos los periodos';
    }
  }

  return {
    start_date: start ? start.toISOString().split('T')[0] : null,
    end_date: end ? end.toISOString().split('T')[0] : null
  };
}

async function loadComisionesView() {
  const loadingEl = document.getElementById('comisiones-loading');
  const summaryEl = document.getElementById('comisiones-summary-cards');
  const tableEl = document.getElementById('comisiones-table-container');
  const monthlyEl = document.getElementById('comisiones-monthly-container');
  const emptyEl = document.getElementById('comisiones-empty');

  // Show loading
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (summaryEl) summaryEl.textContent = '';
  if (tableEl) tableEl.textContent = '';
  if (monthlyEl) monthlyEl.textContent = '';

  try {
    // Build query params from selected period
    const { start_date, end_date } = getComisionesDateRange();
    const params = new URLSearchParams();
    if (start_date) params.set('start_date', start_date);
    if (end_date) params.set('end_date', end_date);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const [commissionsRes, monthlyRes] = await Promise.all([
      fetch(`${API_BASE}/commissions${qs}`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/commissions/monthly${qs}`, { headers: getAuthHeaders() })
    ]);

    const commissionsData = await commissionsRes.json();
    const monthlyData = await monthlyRes.json();

    const commissions = commissionsData.data?.salespeople || commissionsData.commissions || [];
    const monthlyCommissions = monthlyData.data || monthlyData.commissions || [];

    if (loadingEl) loadingEl.classList.add('hidden');

    if (commissions.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    // Calculate totals
    const totalSales = commissions.reduce((sum, c) => sum + parseFloat(c.total_sales || 0), 0);
    const totalCommissions = commissions.reduce((sum, c) => sum + parseFloat(c.total_commission || 0), 0);
    const approvedCommissions = commissions.reduce((sum, c) => sum + parseFloat(c.approved_commission || 0), 0);

    // Build summary cards using DOM API
    if (summaryEl) {
      summaryEl.textContent = '';
      const cards = [
        { label: 'Ventas Totales', value: formatCurrency(totalSales), color: '' },
        { label: 'Comisiones Totales', value: formatCurrency(totalCommissions), color: '#e72a88' },
        { label: 'Comisiones Aprobadas', value: formatCurrency(approvedCommissions), color: '#16a34a' }
      ];
      cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'stat-card';
        const lbl = document.createElement('div');
        lbl.className = 'stat-label';
        lbl.textContent = card.label;
        const val = document.createElement('div');
        val.className = 'stat-value';
        val.textContent = card.value;
        if (card.color) val.style.color = card.color;
        div.appendChild(lbl);
        div.appendChild(val);
        summaryEl.appendChild(div);
      });
    }

    // Build salespeople table using DOM API
    if (tableEl) {
      tableEl.textContent = '';

      const heading = document.createElement('h3');
      heading.style.cssText = 'margin:0 0 16px;font-size:16px;font-weight:600;';
      heading.textContent = 'Desglose por Vendedor';
      tableEl.appendChild(heading);

      const wrapper = document.createElement('div');
      wrapper.style.overflowX = 'auto';

      const table = document.createElement('table');
      table.className = 'data-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Vendedor', 'Tasa', 'Pedidos', 'Ventas', 'Comision', 'Acciones'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      commissions.forEach(c => {
        const tr = document.createElement('tr');

        // Vendedor
        const tdName = document.createElement('td');
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'display:inline-flex;align-items:center;gap:8px;';
        const avatar = document.createElement('span');
        avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;background:#f3e8ff;color:#7c3aed;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;';
        avatar.textContent = (c.salesperson_name || 'N').charAt(0).toUpperCase();
        nameSpan.appendChild(avatar);
        nameSpan.appendChild(document.createTextNode(c.salesperson_name || 'Sin asignar'));
        tdName.appendChild(nameSpan);
        tr.appendChild(tdName);

        // Tasa
        const tdRate = document.createElement('td');
        const rateBadge = document.createElement('span');
        rateBadge.style.cssText = 'background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:12px;font-weight:600;font-size:13px;';
        rateBadge.textContent = parseFloat(c.commission_rate || 0).toFixed(1) + '%';
        tdRate.appendChild(rateBadge);
        tr.appendChild(tdRate);

        // Pedidos
        const tdOrders = document.createElement('td');
        tdOrders.textContent = c.total_orders || 0;
        tr.appendChild(tdOrders);

        // Ventas
        const tdSales = document.createElement('td');
        tdSales.textContent = formatCurrency(parseFloat(c.total_sales || 0));
        tr.appendChild(tdSales);

        // Comision
        const tdComm = document.createElement('td');
        tdComm.style.cssText = 'font-weight:600;color:#e72a88;';
        tdComm.textContent = formatCurrency(parseFloat(c.total_commission || 0));
        tr.appendChild(tdComm);

        // Acciones
        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.textContent = 'Ver pedidos';
        btn.addEventListener('click', () => viewSalespersonOrders(c.salesperson_name));
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrapper.appendChild(table);
      tableEl.appendChild(wrapper);
    }

    // Build monthly breakdown using DOM API
    if (monthlyEl && monthlyCommissions.length > 0) {
      monthlyEl.textContent = '';

      const heading = document.createElement('h3');
      heading.style.cssText = 'margin:24px 0 16px;font-size:16px;font-weight:600;';
      heading.textContent = 'Comisiones Mensuales (Aprobadas)';
      monthlyEl.appendChild(heading);

      const wrapper = document.createElement('div');
      wrapper.style.overflowX = 'auto';

      const table = document.createElement('table');
      table.className = 'data-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Mes', 'Vendedor', 'Pedidos', 'Ventas', 'Comision'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      monthlyCommissions.slice(0, 10).forEach(c => {
        const tr = document.createElement('tr');

        const tdMonth = document.createElement('td');
        const monthBadge = document.createElement('span');
        monthBadge.style.cssText = 'background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:12px;font-size:13px;font-weight:600;';
        monthBadge.textContent = c.month_display || c.month;
        tdMonth.appendChild(monthBadge);
        tr.appendChild(tdMonth);

        const tdName = document.createElement('td');
        tdName.textContent = c.salesperson_name;
        tr.appendChild(tdName);

        const tdOrders = document.createElement('td');
        tdOrders.textContent = c.orders_count || 0;
        tr.appendChild(tdOrders);

        const tdSales = document.createElement('td');
        tdSales.textContent = formatCurrency(parseFloat(c.sales || 0));
        tr.appendChild(tdSales);

        const tdComm = document.createElement('td');
        tdComm.style.cssText = 'font-weight:600;color:#e72a88;';
        tdComm.textContent = formatCurrency(parseFloat(c.commission || 0));
        tr.appendChild(tdComm);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrapper.appendChild(table);
      monthlyEl.appendChild(wrapper);
    }

  } catch (error) {
    console.error('Error loading commissions:', error);
    if (loadingEl) loadingEl.classList.add('hidden');
    if (tableEl) {
      tableEl.textContent = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'empty-state';
      const errIcon = document.createElement('span');
      errIcon.className = 'empty-icon';
      errIcon.textContent = '\u26A0\uFE0F';
      const errH3 = document.createElement('h3');
      errH3.textContent = 'Error al cargar comisiones';
      const errP = document.createElement('p');
      errP.textContent = error.message;
      errDiv.appendChild(errIcon);
      errDiv.appendChild(errH3);
      errDiv.appendChild(errP);
      tableEl.appendChild(errDiv);
    }
  }
}

/**
 * Legacy modal function - redirects to inline view
 */
function showCommissionsModal() {
  switchView('comisiones');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-sub-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('.nav-sub-item[data-view="comisiones"]');
  if (btn) btn.classList.add('active');
}

/**
 * View orders for a specific salesperson in a modal popup
 */
async function viewSalespersonOrders(salespersonName) {
  // Build date params from current period
  const { start_date, end_date } = getComisionesDateRange();
  const params = new URLSearchParams();
  if (start_date) params.set('start_date', start_date);
  if (end_date) params.set('end_date', end_date);
  const qs = params.toString() ? `?${params.toString()}` : '';

  // Remove existing modal if any
  const existing = document.getElementById('salesperson-orders-modal');
  if (existing) existing.remove();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'salesperson-orders-modal';
  modal.className = 'modal';
  modal.style.zIndex = '1100';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', () => modal.remove());

  const content = document.createElement('div');
  content.className = 'modal-content';
  content.style.maxWidth = '700px';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h2');
  title.style.fontSize = '18px';
  title.textContent = `Pedidos Completados — ${salespersonName}`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => modal.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body - loading state
  const body = document.createElement('div');
  body.className = 'modal-body';
  body.style.padding = '16px 24px';
  const spinner = document.createElement('div');
  spinner.style.cssText = 'text-align:center;padding:32px;color:#9ca3af;';
  spinner.textContent = 'Cargando pedidos...';
  body.appendChild(spinner);

  content.appendChild(header);
  content.appendChild(body);
  modal.appendChild(backdrop);
  modal.appendChild(content);
  document.body.appendChild(modal);

  try {
    const res = await fetch(`${API_BASE}/commissions/${encodeURIComponent(salespersonName)}/orders${qs}`, { headers: getAuthHeaders() });
    const data = await res.json();
    const orders = data.data || [];

    body.textContent = '';

    if (orders.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:32px;color:#9ca3af;';
      empty.textContent = 'No hay pedidos completados en este periodo.';
      body.appendChild(empty);
      return;
    }

    // Orders table
    const wrapper = document.createElement('div');
    wrapper.style.overflowX = 'auto';
    const table = document.createElement('table');
    table.className = 'data-table';
    table.style.fontSize = '13px';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['# Pedido', 'Cliente', 'Fecha', 'Total', 'Comisión'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.padding = '10px 12px';
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let totalSales = 0;
    let totalCommission = 0;

    orders.forEach(order => {
      const price = parseFloat(order.total_price || 0);
      const comm = parseFloat(order.commission || 0);
      totalSales += price;
      totalCommission += comm;

      const tr = document.createElement('tr');

      const tdOrder = document.createElement('td');
      tdOrder.style.cssText = 'padding:10px 12px;font-weight:600;';
      tdOrder.textContent = order.order_number || `#${order.id}`;
      tr.appendChild(tdOrder);

      const tdClient = document.createElement('td');
      tdClient.style.padding = '10px 12px';
      tdClient.textContent = order.client_name || '—';
      tr.appendChild(tdClient);

      const tdDate = document.createElement('td');
      tdDate.style.cssText = 'padding:10px 12px;color:#6b7280;';
      tdDate.textContent = new Date(order.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      tr.appendChild(tdDate);

      const tdTotal = document.createElement('td');
      tdTotal.style.padding = '10px 12px';
      tdTotal.textContent = formatCurrency(price);
      tr.appendChild(tdTotal);

      const tdComm = document.createElement('td');
      tdComm.style.cssText = 'padding:10px 12px;color:#e72a88;font-weight:600;';
      tdComm.textContent = formatCurrency(comm);
      tr.appendChild(tdComm);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    body.appendChild(wrapper);

    // Footer totals
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-top:2px solid #f3f4f6;';

    const countLabel = document.createElement('span');
    countLabel.style.cssText = 'font-size:13px;color:#6b7280;';
    countLabel.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''} completado${orders.length !== 1 ? 's' : ''}`;

    const totalsDiv = document.createElement('div');
    totalsDiv.style.cssText = 'display:flex;gap:24px;align-items:center;';

    const salesTotal = document.createElement('div');
    salesTotal.style.textAlign = 'right';
    const salesLabel = document.createElement('div');
    salesLabel.style.cssText = 'font-size:11px;color:#9ca3af;text-transform:uppercase;';
    salesLabel.textContent = 'Ventas';
    const salesValue = document.createElement('div');
    salesValue.style.cssText = 'font-size:16px;font-weight:700;';
    salesValue.textContent = formatCurrency(totalSales);
    salesTotal.appendChild(salesLabel);
    salesTotal.appendChild(salesValue);

    const commTotal = document.createElement('div');
    commTotal.style.textAlign = 'right';
    const commLabel = document.createElement('div');
    commLabel.style.cssText = 'font-size:11px;color:#9ca3af;text-transform:uppercase;';
    commLabel.textContent = 'Comisión';
    const commValue = document.createElement('div');
    commValue.style.cssText = 'font-size:16px;font-weight:700;color:#e72a88;';
    commValue.textContent = formatCurrency(totalCommission);
    commTotal.appendChild(commLabel);
    commTotal.appendChild(commValue);

    totalsDiv.appendChild(salesTotal);
    totalsDiv.appendChild(commTotal);
    footer.appendChild(countLabel);
    footer.appendChild(totalsDiv);
    content.appendChild(footer);

  } catch (error) {
    body.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'text-align:center;padding:32px;color:#ef4444;';
    errDiv.textContent = 'Error al cargar pedidos: ' + error.message;
    body.appendChild(errDiv);
  }
}

/**
 * Format currency helper
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount || 0);
}

// Export salespeople functions
window.loadSalespeople = loadSalespeople;
window.filterBySalesperson = filterBySalesperson;
window.showCommissionsModal = showCommissionsModal;
window.loadComisionesView = loadComisionesView;
window.viewSalespersonOrders = viewSalespersonOrders;
window.setComisionesPeriod = setComisionesPeriod;

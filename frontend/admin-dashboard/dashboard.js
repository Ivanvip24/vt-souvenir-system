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
  loadOrders();
  loadOrderAlerts(); // Load alerts widget

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
  activeCategory: null, // 'critical', 'warning', 'upcoming'
  isExpanded: false
};

async function loadOrderAlerts() {
  const widget = document.getElementById('order-alerts-widget');
  if (!widget) return;

  try {
    const response = await fetch(`${API_BASE}/alerts`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load alerts');
    }

    const result = await response.json();
    if (result.success) {
      alertsState.data = result.data;
      renderAlertsWidget();
    }
  } catch (error) {
    console.error('Error loading alerts:', error);
    widget.innerHTML = ''; // Hide widget on error
  }
}

function renderAlertsWidget() {
  const widget = document.getElementById('order-alerts-widget');
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
    return;
  }

  emptyState.classList.add('hidden');

  state.filteredOrders.forEach(order => {
    const card = createOrderCard(order);
    container.appendChild(card);
  });
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
              <input type="file" id="first-payment-input-${order.id}" accept="image/*" style="display: none;" onchange="handlePaymentUpload(event, ${order.id}, 'first')">
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
              <input type="file" id="second-payment-input-${order.id}" accept="image/*" style="display: none;" onchange="handlePaymentUpload(event, ${order.id}, 'second')">
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
          </tr>
          ${order.items.map(item => `
            <tr>
              <td style="padding: 6px 0;">${item.productName}</td>
              <td style="text-align: center; padding: 6px 0;">${item.quantity} pzas</td>
              <td style="text-align: right; padding: 6px 0;">${formatCurrency(item.unitPrice)}</td>
              <td style="text-align: right; padding: 6px 0; font-weight: 600;">${formatCurrency(item.lineTotal)}</td>
            </tr>
          `).join('')}
          <tr style="border-top: 2px solid var(--gray-300);">
            <td colspan="3" style="padding: 8px 0; font-weight: 700;">Total</td>
            <td style="text-align: right; padding: 8px 0; font-weight: 700; font-size: 16px; color: var(--primary);">${formatCurrency(order.totalPrice)}</td>
          </tr>
        </table>
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
          <div style="font-size: 12px; color: var(--gray-400);">JPG, PNG, PDF (máx 10MB)</div>
        </div>
        <input type="file"
               id="order-file-input-${order.id}"
               accept="image/*,.pdf"
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
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!validTypes.includes(file.type)) {
    alert('Tipo de archivo no válido. Solo se aceptan imágenes (JPG, PNG, GIF, WebP) y PDF.');
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
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!validTypes.includes(file.type)) {
    alert('Tipo de archivo no válido. Solo se aceptan imágenes (JPG, PNG, GIF, WebP) y PDF.');
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
      <input type="file" id="${paymentType}-payment-input-${orderId}" accept="image/*" style="display: none;"
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

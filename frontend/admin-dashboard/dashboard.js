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
}

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
        <span class="date-label">Fecha del pedido</span>
        <span class="date-value">${formatDateFull(order.orderDate)}</span>
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
              <a href="https://wa.me/${whatsappNumber}" target="_blank" class="whatsapp-btn-card" onclick="event.stopPropagation();" title="Enviar WhatsApp">
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

// Helper function for full date format
function formatDateFull(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date)) return 'N/A';
  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
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

  modalTitle.textContent = order.orderNumber;

  // Calculate profit
  const profit = order.totalPrice - order.totalProductionCost;
  const profitMargin = ((profit / order.totalPrice) * 100).toFixed(1);

  modalBody.innerHTML = `
    <!-- Status & Approval Actions -->
    <div class="detail-section">
      <h3>Estado del Pedido</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Estado de Aprobación</span>
          <span class="detail-value">
            <span class="status-badge status-${order.approvalStatus}">
              ${getStatusText(order.approvalStatus)}
            </span>
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Estado de Producción</span>
          <span class="detail-value">${getProductionStatusText(order.status)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Departamento</span>
          <span class="detail-value">${order.department}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Anticipo Pagado</span>
          <span class="detail-value">${order.depositPaid ? '✅ Sí' : '⏳ Pendiente'}</span>
        </div>
      </div>

      ${order.approvalStatus === 'pending_review' ? `
        <div class="action-buttons" style="flex-wrap: wrap; gap: 8px;">
          <button class="btn btn-success" style="flex: 1; min-width: 140px;" onclick="approveOrder(${order.id})">
            ✅ Aprobar
          </button>
          <button class="btn btn-danger" style="flex: 1; min-width: 140px;" onclick="rejectOrder(${order.id})">
            ❌ Rechazar
          </button>
        </div>
        <p style="font-size: 11px; color: #6b7280; margin-top: 8px; text-align: center;">
          🤖 La verificación de comprobantes es automática. Este pedido requiere revisión manual.
        </p>
      ` : ''}

      ${order.approvalStatus === 'approved' && order.receiptPdfUrl ? `
        <div class="action-buttons" style="margin-top: 16px;">
          <button class="btn btn-primary" onclick="downloadReceipt('${order.receiptPdfUrl}', '${order.orderNumber}', ${order.id})" style="display: flex; align-items: center; gap: 8px; justify-content: center;">
            <span style="font-size: 20px;">📥</span>
            <span>Descargar Recibo</span>
          </button>
          <button class="btn btn-secondary" onclick="shareReceipt('${order.receiptPdfUrl}')" style="display: flex; align-items: center; gap: 8px; justify-content: center;">
            <span style="font-size: 20px;">🔗</span>
            <span>Compartir Enlace</span>
          </button>
        </div>
      ` : ''}
    </div>

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
                     target="_blank"
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
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Fecha del Evento</span>
          <span class="detail-value">${formatDate(order.eventDate)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Método de Pago</span>
          <span class="detail-value">${order.paymentMethod === 'bank_transfer' ? 'Transferencia Bancaria' : 'Tarjeta'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Pedido Creado</span>
          <span class="detail-value">${formatDateTime(order.createdAt || order.orderDate)}</span>
        </div>
      </div>
    </div>

    <!-- Delivery Dates Section -->
    ${order.productionDeadline || order.estimatedDeliveryDate ? `
    <div class="detail-section">
      <h3>📅 Fechas de Entrega</h3>
      <div style="background: linear-gradient(135deg, #f3e8ff 0%, #e0e7ff 100%); padding: 20px; border-radius: 12px; margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          ${order.productionDeadline ? `
          <div style="background: white; padding: 16px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="font-size: 24px;">🏭</span>
              <div>
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Deadline Producción</div>
                <div style="font-size: 18px; font-weight: 700; color: #7c3aed;">${formatDate(order.productionDeadline)}</div>
              </div>
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              Fecha límite para terminar la producción
            </div>
          </div>
          ` : ''}
          ${order.estimatedDeliveryDate ? `
          <div style="background: white; padding: 16px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="font-size: 24px;">📦</span>
              <div>
                <div style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Entrega Estimada</div>
                <div style="font-size: 18px; font-weight: 700; color: #059669;">${formatDate(order.estimatedDeliveryDate)}</div>
              </div>
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              Llegada estimada al cliente (${order.shippingDays || 5} días de envío)
            </div>
          </div>
          ` : ''}
        </div>

        ${order.eventDate && order.estimatedDeliveryDate ? `
        ${(() => {
          const eventDate = new Date(order.eventDate);
          const deliveryDate = new Date(order.estimatedDeliveryDate);
          const daysBuffer = Math.ceil((eventDate - deliveryDate) / (1000 * 60 * 60 * 24));

          if (daysBuffer < 0) {
            return `
              <div style="background: #fee2e2; border: 2px solid #ef4444; padding: 14px; border-radius: 8px; margin-top: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 24px;">⚠️</span>
                  <div>
                    <div style="font-size: 14px; font-weight: 700; color: #dc2626;">CRÍTICO: Entrega después del evento</div>
                    <div style="font-size: 13px; color: #b91c1c;">La entrega estimada es ${Math.abs(daysBuffer)} día(s) DESPUÉS del evento. Se requiere acelerar producción.</div>
                  </div>
                </div>
              </div>
            `;
          } else if (daysBuffer < 2) {
            return `
              <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 14px; border-radius: 8px; margin-top: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 24px;">⚡</span>
                  <div>
                    <div style="font-size: 14px; font-weight: 700; color: #b45309;">URGENTE: Margen muy ajustado</div>
                    <div style="font-size: 13px; color: #92400e;">Solo ${daysBuffer} día(s) de margen antes del evento. Priorizar este pedido.</div>
                  </div>
                </div>
              </div>
            `;
          } else if (daysBuffer < 5) {
            return `
              <div style="background: #dbeafe; border: 2px solid #3b82f6; padding: 14px; border-radius: 8px; margin-top: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 24px;">📅</span>
                  <div>
                    <div style="font-size: 14px; font-weight: 700; color: #1d4ed8;">Precaución: Margen limitado</div>
                    <div style="font-size: 13px; color: #1e40af;">${daysBuffer} días de margen antes del evento. Mantener seguimiento.</div>
                  </div>
                </div>
              </div>
            `;
          } else {
            return `
              <div style="background: #d1fae5; border: 2px solid #10b981; padding: 14px; border-radius: 8px; margin-top: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 24px;">✅</span>
                  <div>
                    <div style="font-size: 14px; font-weight: 700; color: #059669;">Tiempo suficiente</div>
                    <div style="font-size: 13px; color: #047857;">${daysBuffer} días de margen antes del evento.</div>
                  </div>
                </div>
              </div>
            `;
          }
        })()}
        ` : ''}
      </div>
    </div>
    ` : ''}

    <!-- Order Items -->
    <div class="detail-section">
      <h3>📦 Productos del Pedido</h3>
      <div id="order-items-container-${order.id}" style="display: flex; flex-direction: column; gap: 16px;">
        ${order.items.map((item, index) => {
          const attachments = item.attachments ? (typeof item.attachments === 'string' ? JSON.parse(item.attachments) : item.attachments) : [];
          return `
          <div class="product-item-card" style="background: white; border: 2px solid var(--gray-200); border-radius: 12px; overflow: hidden;">
            <!-- Product Header -->
            <div style="background: linear-gradient(135deg, var(--primary) 0%, #9c27b0 100%); padding: 16px; color: white;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 18px; font-weight: 700;">${item.productName}</div>
                  <div style="font-size: 14px; opacity: 0.9;">Cantidad: ${item.quantity} pzas</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 14px; opacity: 0.8;">Total</div>
                  <div style="font-size: 20px; font-weight: 700;">${formatCurrency(item.lineTotal)}</div>
                </div>
              </div>
            </div>

            <!-- Product Details -->
            <div style="padding: 16px;">
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
                <div style="background: var(--gray-50); padding: 10px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 11px; color: var(--gray-500); text-transform: uppercase;">Precio Unit.</div>
                  <div style="font-size: 15px; font-weight: 600; color: var(--gray-800);">${formatCurrency(item.unitPrice)}</div>
                </div>
                <div style="background: var(--gray-50); padding: 10px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 11px; color: var(--gray-500); text-transform: uppercase;">Costo Unit.</div>
                  <div style="font-size: 15px; font-weight: 600; color: var(--gray-800);">${formatCurrency(item.unitCost || 0)}</div>
                </div>
                <div style="background: #d1fae5; padding: 10px; border-radius: 8px; text-align: center;">
                  <div style="font-size: 11px; color: #065f46; text-transform: uppercase;">Ganancia</div>
                  <div style="font-size: 15px; font-weight: 600; color: #059669;">${formatCurrency(item.lineProfit || 0)}</div>
                </div>
              </div>

              <!-- Notes Section -->
              <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">
                  📝 Notas del producto
                </label>
                <textarea
                  id="item-notes-${order.id}-${item.id}"
                  placeholder="Agregar notas, instrucciones especiales, detalles de diseño..."
                  style="width: 100%; min-height: 80px; padding: 12px; border: 2px solid var(--gray-200); border-radius: 8px; font-size: 14px; resize: vertical; font-family: inherit;"
                  onchange="updateItemNotes(${order.id}, ${item.id}, this.value)"
                >${item.notes || ''}</textarea>
              </div>

              <!-- Attachments Section -->
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px;">
                  📎 Archivos adjuntos
                </label>

                <!-- Existing Attachments -->
                <div id="item-attachments-${order.id}-${item.id}" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                  ${attachments.length > 0 ? attachments.map(att => `
                    <div style="position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 2px solid var(--gray-200);">
                      <img src="${att.url}" alt="${att.filename || 'Adjunto'}"
                           style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                           onclick="window.open('${att.url}', '_blank')">
                      <button onclick="removeItemAttachment(${order.id}, ${item.id}, '${att.url}')"
                              style="position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; background: rgba(239, 68, 68, 0.9); color: white; border: none; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;">
                        ×
                      </button>
                    </div>
                  `).join('') : '<span style="font-size: 13px; color: var(--gray-400);">Sin archivos adjuntos</span>'}
                </div>

                <!-- Upload Area -->
                <div id="item-upload-${order.id}-${item.id}"
                     style="border: 2px dashed var(--gray-300); border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; transition: all 0.2s;"
                     onclick="document.getElementById('item-file-input-${order.id}-${item.id}').click()"
                     ondragover="handleItemDragOver(event, ${order.id}, ${item.id})"
                     ondragleave="handleItemDragLeave(event, ${order.id}, ${item.id})"
                     ondrop="handleItemDrop(event, ${order.id}, ${item.id})">
                  <div style="font-size: 24px; margin-bottom: 4px;">📤</div>
                  <div style="font-size: 13px; color: var(--gray-600);">Arrastra o haz clic para subir</div>
                  <div style="font-size: 11px; color: var(--gray-400);">JPG, PNG, PDF (máx 10MB)</div>
                </div>
                <input type="file"
                       id="item-file-input-${order.id}-${item.id}"
                       accept="image/*,.pdf"
                       style="display: none;"
                       onchange="handleItemFileUpload(event, ${order.id}, ${item.id})">

                <!-- Paste button -->
                <div style="margin-top: 8px; text-align: center;">
                  <button onclick="pasteItemAttachment(${order.id}, ${item.id})"
                          style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; color: var(--gray-600);">
                    📋 Pegar del portapapeles
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        }).join('')}
      </div>

      <!-- Summary Table -->
      <div style="margin-top: 16px; background: var(--gray-50); padding: 12px; border-radius: 8px;">
        <table style="width: 100%; font-size: 14px;">
          <tr style="border-bottom: 1px solid var(--gray-200);">
            <th style="text-align: left; padding: 8px 0; color: var(--gray-600);">Producto</th>
            <th style="text-align: center; padding: 8px 0; color: var(--gray-600);">Cantidad</th>
            <th style="text-align: right; padding: 8px 0; color: var(--gray-600);">Subtotal</th>
          </tr>
          ${order.items.map(item => `
            <tr>
              <td style="padding: 6px 0;">${item.productName}</td>
              <td style="text-align: center; padding: 6px 0;">${item.quantity}</td>
              <td style="text-align: right; padding: 6px 0; font-weight: 600;">${formatCurrency(item.lineTotal)}</td>
            </tr>
          `).join('')}
          <tr style="border-top: 2px solid var(--gray-300);">
            <td colspan="2" style="padding: 8px 0; font-weight: 700;">Total</td>
            <td style="text-align: right; padding: 8px 0; font-weight: 700; font-size: 16px; color: var(--primary);">${formatCurrency(order.totalPrice)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Financial Summary -->
    <div class="detail-section">
      <h3>Resumen Financiero</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Total del Pedido</span>
          <span class="detail-value highlight">${formatCurrency(order.totalPrice)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Costo de Producción</span>
          <span class="detail-value">${formatCurrency(order.totalProductionCost)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Ganancia</span>
          <span class="detail-value" style="color: var(--success)">${formatCurrency(profit)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Margen de Ganancia</span>
          <span class="detail-value" style="color: var(--success)">${profitMargin}%</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Anticipo (50%)</span>
          <span class="detail-value">${formatCurrency(order.depositAmount)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Restante</span>
          <span class="detail-value">${formatCurrency(order.totalPrice - order.depositAmount)}</span>
        </div>
      </div>
    </div>

    <!-- Payment Proof (First Deposit) -->
    <div class="detail-section">
      <h3>💳 Comprobante de Anticipo (50%)</h3>
      <div id="first-payment-container-${order.id}" style="background: var(--gray-50); padding: 16px; border-radius: 12px;">
        ${order.paymentProofUrl ? `
          <div style="text-align: center;">
            <img src="${order.paymentProofUrl}"
                 alt="Comprobante de pago"
                 style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer;"
                 onclick="window.open('${order.paymentProofUrl}', '_blank')">
            <div style="margin-top: 12px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
              <a href="${order.paymentProofUrl}"
                 target="_blank"
                 style="color: var(--primary); font-size: 14px; font-weight: 600; text-decoration: none;">
                📥 Descargar
              </a>
              <button onclick="replacePaymentReceipt(${order.id}, 'first')"
                      style="background: none; border: none; color: var(--gray-500); font-size: 14px; cursor: pointer;">
                🔄 Reemplazar
              </button>
            </div>
          </div>
        ` : `
          <div id="first-payment-upload-${order.id}"
               style="border: 2px dashed var(--gray-300); border-radius: 12px; padding: 30px 20px; text-align: center; cursor: pointer;"
               onclick="document.getElementById('first-payment-input-${order.id}').click()"
               ondragover="handlePaymentDragOver(event, ${order.id}, 'first')"
               ondragleave="handlePaymentDragLeave(event, ${order.id}, 'first')"
               ondrop="handlePaymentDrop(event, ${order.id}, 'first')">
            <div style="font-size: 36px; margin-bottom: 8px;">📤</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--gray-700); margin-bottom: 4px;">
              Subir comprobante de anticipo
            </div>
            <div style="font-size: 12px; color: var(--gray-500);">
              Arrastra o haz clic para seleccionar
            </div>
          </div>
          <input type="file" id="first-payment-input-${order.id}" accept="image/*" style="display: none;"
                 onchange="handlePaymentUpload(event, ${order.id}, 'first')">
          <div style="margin-top: 10px; text-align: center;">
            <button onclick="pastePaymentReceipt(${order.id}, 'first')"
                    style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 8px 16px; border-radius: 6px; font-size: 12px; cursor: pointer; color: var(--gray-600);">
              📋 Pegar del portapapeles
            </button>
          </div>
        `}
      </div>
    </div>

    <!-- Second Payment Receipt -->
    <div class="detail-section">
      <h3>💰 Comprobante de Pago Final (50%)</h3>
      <div id="second-payment-container-${order.id}" style="background: var(--gray-50); padding: 16px; border-radius: 12px;">
        ${order.secondPaymentReceipt ? `
          <div style="background: #fef3c7; border: 2px solid #fb923c; padding: 16px; border-radius: 12px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <span style="font-size: 28px;">💳</span>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: #92400e;">Pago Final Recibido</div>
                <div style="font-size: 12px; color: #92400e;">
                  ${order.secondPaymentDate ? `Subido: ${formatDate(order.secondPaymentDate)}` : ''}
                </div>
              </div>
            </div>

            <div style="background: white; padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 12px;">
              <img src="${order.secondPaymentReceipt}"
                   alt="Comprobante de pago final"
                   style="max-width: 100%; max-height: 350px; border-radius: 8px; cursor: pointer;"
                   onclick="window.open('${order.secondPaymentReceipt}', '_blank')">
              <div style="margin-top: 10px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <a href="${order.secondPaymentReceipt}"
                   target="_blank"
                   style="color: var(--primary); font-size: 13px; font-weight: 600; text-decoration: none;">
                  📥 Descargar
                </a>
                <button onclick="replacePaymentReceipt(${order.id}, 'second')"
                        style="background: none; border: none; color: var(--gray-500); font-size: 13px; cursor: pointer;">
                  🔄 Reemplazar
                </button>
              </div>
            </div>

            ${order.secondPaymentStatus === 'uploaded' ? `
              <div style="background: #fff; border: 2px solid #059669; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <div style="font-size: 13px; font-weight: 600; color: #065f46; margin-bottom: 4px;">
                  ⚠️ Este pago requiere confirmación
                </div>
                <div style="font-size: 12px; color: #065f46;">
                  Revisa el comprobante y confirma que el pago se ha completado.
                </div>
              </div>
              <button class="btn btn-success" onclick="confirmSecondPayment(${order.id})" style="width: 100%; padding: 12px; font-size: 14px;">
                ✅ Confirmar Pago y Completar Pedido
              </button>
            ` : order.secondPaymentStatus === 'confirmed' ? `
              <div style="background: #d1fae5; border: 2px solid #059669; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 18px; margin-bottom: 4px;">✅</div>
                <div style="font-size: 14px; font-weight: 700; color: #065f46;">Pago Confirmado</div>
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="margin-bottom: 12px; padding: 12px; background: #fff7ed; border-radius: 8px; text-align: center;">
            <div style="font-size: 13px; color: #9a3412;">
              Saldo restante: <strong>${formatCurrency(order.totalPrice - order.depositAmount)}</strong>
            </div>
          </div>
          <div id="second-payment-upload-${order.id}"
               style="border: 2px dashed var(--gray-300); border-radius: 12px; padding: 30px 20px; text-align: center; cursor: pointer;"
               onclick="document.getElementById('second-payment-input-${order.id}').click()"
               ondragover="handlePaymentDragOver(event, ${order.id}, 'second')"
               ondragleave="handlePaymentDragLeave(event, ${order.id}, 'second')"
               ondrop="handlePaymentDrop(event, ${order.id}, 'second')">
            <div style="font-size: 36px; margin-bottom: 8px;">📤</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--gray-700); margin-bottom: 4px;">
              Subir comprobante de pago final
            </div>
            <div style="font-size: 12px; color: var(--gray-500);">
              Arrastra o haz clic para seleccionar
            </div>
          </div>
          <input type="file" id="second-payment-input-${order.id}" accept="image/*" style="display: none;"
                 onchange="handlePaymentUpload(event, ${order.id}, 'second')">
          <div style="margin-top: 10px; text-align: center;">
            <button onclick="pastePaymentReceipt(${order.id}, 'second')"
                    style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 8px 16px; border-radius: 6px; font-size: 12px; cursor: pointer; color: var(--gray-600);">
              📋 Pegar del portapapeles
            </button>
          </div>
        `}
      </div>
    </div>

    <!-- PDF Receipt Download -->
    ${order.receiptPdfUrl ? `
      <div class="detail-section">
        <h3>📄 Recibo PDF</h3>
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; color: white;">
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
            <div style="font-size: 48px;">📄</div>
            <div style="flex: 1;">
              <div style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">Recibo del Pedido</div>
              <div style="font-size: 13px; opacity: 0.9;">
                Generado automáticamente al crear el pedido
              </div>
            </div>
          </div>
          <a href="${order.receiptPdfUrl}"
             target="_blank"
             download
             style="display: block; background: white; color: #667eea; padding: 14px; border-radius: 8px; text-align: center; font-weight: 700; font-size: 15px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
            📥 Descargar Recibo PDF
          </a>
        </div>
      </div>
    ` : ''}

    <!-- Production Sheet Section -->
    <div class="detail-section">
      <h3>🖼️ Hoja de Producción</h3>
      <div id="production-sheet-container-${order.id}" style="background: var(--gray-50); border-radius: 12px; padding: 20px;">
        ${order.productionSheetUrl ? `
          <!-- Show existing production sheet -->
          <div style="margin-bottom: 16px;">
            ${order.productionSheetUrl.toLowerCase().endsWith('.pdf') ? `
              <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 20px; border-radius: 12px; color: white; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                  <div style="font-size: 48px;">📋</div>
                  <div style="flex: 1;">
                    <div style="font-size: 16px; font-weight: 700;">Hoja de Producción (PDF)</div>
                    <div style="font-size: 13px; opacity: 0.9;">Archivo subido</div>
                  </div>
                </div>
              </div>
              <a href="${order.productionSheetUrl}" target="_blank"
                 style="display: block; background: var(--primary); color: white; padding: 14px; border-radius: 8px; text-align: center; font-weight: 600; text-decoration: none;">
                📥 Ver/Descargar PDF
              </a>
            ` : `
              <img src="${order.productionSheetUrl}"
                   alt="Hoja de Producción"
                   style="width: 100%; max-height: 500px; object-fit: contain; border-radius: 8px; cursor: pointer; border: 2px solid var(--gray-200);"
                   onclick="window.open('${order.productionSheetUrl}', '_blank')">
            `}
          </div>
          <button onclick="removeProductionSheet(${order.id})"
                  style="width: 100%; padding: 10px; background: var(--gray-200); color: var(--gray-600); border: none; border-radius: 8px; font-size: 13px; cursor: pointer;">
            🗑️ Eliminar y subir otra
          </button>
        ` : `
          <!-- Upload area -->
          <div id="production-sheet-upload-${order.id}"
               style="border: 2px dashed var(--gray-300); border-radius: 12px; padding: 40px 20px; text-align: center; cursor: pointer; transition: all 0.2s;"
               onclick="document.getElementById('production-sheet-input-${order.id}').click()"
               ondragover="handleDragOver(event, ${order.id})"
               ondragleave="handleDragLeave(event, ${order.id})"
               ondrop="handleProductionSheetDrop(event, ${order.id})">
            <div style="font-size: 48px; margin-bottom: 12px;">📤</div>
            <div style="font-size: 15px; font-weight: 600; color: var(--gray-700); margin-bottom: 8px;">
              Arrastra o haz clic para subir
            </div>
            <div style="font-size: 13px; color: var(--gray-500); margin-bottom: 16px;">
              Acepta imágenes (JPG, PNG) y PDF
            </div>
            <div style="display: inline-block; background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Seleccionar archivo
            </div>
          </div>
          <input type="file"
                 id="production-sheet-input-${order.id}"
                 accept="image/*,.pdf"
                 style="display: none;"
                 onchange="handleProductionSheetUpload(event, ${order.id})">

          <!-- Paste from clipboard -->
          <div style="margin-top: 12px; text-align: center;">
            <button onclick="pasteProductionSheet(${order.id})"
                    style="background: var(--gray-100); border: 1px solid var(--gray-300); padding: 10px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; color: var(--gray-600);">
              📋 Pegar desde portapapeles (Ctrl+V)
            </button>
          </div>
        `}
      </div>
    </div>

    <!-- Order Notes -->
    ${order.clientNotes ? `
      <div class="detail-section">
        <h3>Notas del Cliente</h3>
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

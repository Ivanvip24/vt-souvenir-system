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
    window.location.href = '/admin/login';
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
    window.location.href = '/admin/login';
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
  const navButtons = document.querySelectorAll('.nav-item');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);

      // Update active state
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function switchView(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Show selected view
  document.getElementById(`${viewName}-view`).classList.add('active');
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
    card.style.opacity = '0.75';
    card.style.background = '#f9fafb';
  }

  card.onclick = () => showOrderDetail(order.id);

  const statusClass = `status-${order.approvalStatus}`;
  const statusText = getStatusText(order.approvalStatus);

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
        ${order.archiveStatus === 'completo' ? `
          <span style="background: #10b981; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 8px;">
            ✓ Completo
          </span>
        ` : order.archiveStatus === 'cancelado' ? `
          <span style="background: #ef4444; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 8px;">
            ✕ Cancelado
          </span>
        ` : ''}
        ${order.secondPaymentStatus === 'uploaded' && order.secondPaymentReceipt && !isArchived ? `
          <span style="background: #fb923c; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 8px;">
            💳 Pago Final Pendiente
          </span>
        ` : ''}
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
      ` : !isArchived && order.approvalStatus === 'approved' && order.receiptPdfUrl ? `
        <div class="quick-actions">
          <button class="quick-action-btn receipt-btn" onclick="event.stopPropagation(); downloadReceipt('${order.receiptPdfUrl}', '${order.orderNumber}', ${order.id});" title="Descargar recibo">
            📥
          </button>
          <button class="quick-action-btn receipt-btn" onclick="event.stopPropagation(); shareReceipt('${order.receiptPdfUrl}');" title="Compartir enlace">
            🔗
          </button>
        </div>
      ` : ''}
      ${!isArchived ? `
        <div style="display: flex; gap: 6px; margin-left: auto;">
          <button style="background: #10b981; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1); white-space: nowrap;" onclick="event.stopPropagation(); archiveOrder(${order.id}, 'completo');" onmouseover="this.style.background='#059669'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)';" onmouseout="this.style.background='#10b981'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)';" title="Marcar como completo">
            ✓ Completo
          </button>
          <button style="background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1); white-space: nowrap;" onclick="event.stopPropagation(); archiveOrder(${order.id}, 'cancelado');" onmouseover="this.style.background='#dc2626'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)';" onmouseout="this.style.background='#ef4444'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)';" title="Marcar como cancelado">
            ✕ Cancelado
          </button>
        </div>
      ` : ''}
    </div>

    <div class="order-meta">
      <div class="meta-item">
        <span class="meta-label">Cliente</span>
        <span class="meta-value">${order.clientName}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Fecha del Pedido</span>
        <span class="meta-value">${formatDate(order.orderDate)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Hora de Creación</span>
        <span class="meta-value">${formatTime(order.createdAt || order.orderDate)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Fecha del Evento</span>
        <span class="meta-value">${formatDate(order.eventDate)}</span>
      </div>
      ${order.productionDeadline ? `
      <div class="meta-item">
        <span class="meta-label">🏭 Deadline Producción</span>
        <span class="meta-value" style="color: #7c3aed; font-weight: 600;">${formatDate(order.productionDeadline)}</span>
      </div>
      ` : ''}
      ${order.estimatedDeliveryDate ? `
      <div class="meta-item">
        <span class="meta-label">📦 Entrega Estimada</span>
        <span class="meta-value" style="color: #059669; font-weight: 600;">${formatDate(order.estimatedDeliveryDate)}</span>
      </div>
      ` : ''}
      <div class="meta-item">
        <span class="meta-label">Total</span>
        <span class="meta-value highlight">${formatCurrency(order.totalPrice)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Anticipo</span>
        <span class="meta-value">${formatCurrency(order.depositAmount)} ${order.depositPaid ? '✅' : '⏳'}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Productos</span>
        <span class="meta-value">${order.items.length} item(s)</span>
      </div>
    </div>
  `;

  return card;
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
        <div class="action-buttons">
          <button class="btn btn-success" onclick="approveOrder(${order.id})">
            ✅ Aprobar Pedido
          </button>
          <button class="btn btn-danger" onclick="rejectOrder(${order.id})">
            ❌ Rechazar Pedido
          </button>
        </div>
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
            <div>
              <div style="font-size: 12px; color: var(--gray-600); font-weight: 600;">CLIENTE</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--gray-900);">${order.clientName}</div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="font-size: 20px;">📱</div>
              <div>
                <div style="font-size: 11px; color: var(--gray-600); font-weight: 600;">TELÉFONO</div>
                <a href="tel:${order.clientPhone || ''}" style="font-size: 15px; font-weight: 600; color: var(--primary); text-decoration: none;">
                  ${order.clientPhone || 'No disponible'}
                </a>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="font-size: 20px;">📧</div>
              <div>
                <div style="font-size: 11px; color: var(--gray-600); font-weight: 600;">EMAIL</div>
                <a href="mailto:${order.clientEmail || ''}" style="font-size: 15px; font-weight: 600; color: var(--primary); text-decoration: none; overflow: hidden; text-overflow: ellipsis;">
                  ${order.clientEmail || 'No disponible'}
                </a>
              </div>
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
      <h3>Productos</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio Unit.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map(item => `
            <tr>
              <td>${item.productName}</td>
              <td>${item.quantity}</td>
              <td>${formatCurrency(item.unitPrice)}</td>
              <td><strong>${formatCurrency(item.lineTotal)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
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

    <!-- Payment Proof -->
    ${order.paymentMethod === 'bank_transfer' && order.paymentProofUrl ? `
      <div class="detail-section">
        <h3>Comprobante de Pago (Anticipo)</h3>
        <div style="background: var(--gray-50); padding: 16px; border-radius: 12px; text-align: center;">
          <img src="${order.paymentProofUrl}"
               alt="Comprobante de pago"
               style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="margin-top: 12px;">
            <a href="${order.paymentProofUrl}"
               target="_blank"
               style="color: var(--primary); font-size: 14px; font-weight: 600; text-decoration: none;">
              📥 Descargar Comprobante
            </a>
          </div>
        </div>
      </div>
    ` : order.paymentMethod === 'bank_transfer' ? `
      <div class="detail-section">
        <h3>Comprobante de Pago (Anticipo)</h3>
        <div style="background: #fff3cd; padding: 16px; border-radius: 12px; color: #856404;">
          ⏳ Pendiente de subir comprobante
        </div>
      </div>
    ` : ''}

    <!-- Second Payment Receipt -->
    ${order.secondPaymentReceipt ? `
      <div class="detail-section">
        <h3>Comprobante de Pago Final</h3>
        <div style="background: #fef3c7; border: 2px solid #fb923c; padding: 20px; border-radius: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <span style="font-size: 32px;">💳</span>
            <div>
              <div style="font-size: 16px; font-weight: 700; color: #92400e;">Pago Final Recibido</div>
              <div style="font-size: 13px; color: #92400e; margin-top: 4px;">
                ${order.secondPaymentDate ? `Subido: ${formatDate(order.secondPaymentDate)}` : ''}
              </div>
            </div>
          </div>

          <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 16px;">
            <img src="${order.secondPaymentReceipt}"
                 alt="Comprobante de pago final"
                 style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
                 onclick="window.open('${order.secondPaymentReceipt}', '_blank')">
            <div style="margin-top: 12px;">
              <a href="${order.secondPaymentReceipt}"
                 target="_blank"
                 style="color: var(--primary); font-size: 14px; font-weight: 600; text-decoration: none;">
                📥 Descargar Comprobante
              </a>
            </div>
          </div>

          ${order.secondPaymentStatus === 'uploaded' ? `
            <div style="background: #fff; border: 2px solid #059669; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <div style="font-size: 14px; font-weight: 600; color: #065f46; margin-bottom: 8px;">
                ⚠️ Este pago requiere confirmación
              </div>
              <div style="font-size: 13px; color: #065f46;">
                Revisa el comprobante y confirma que el pago se ha completado correctamente.
              </div>
            </div>
            <button class="btn btn-success" onclick="confirmSecondPayment(${order.id})" style="width: 100%; padding: 14px; font-size: 16px;">
              ✅ Confirmar Pago y Completar Pedido
            </button>
          ` : order.secondPaymentStatus === 'confirmed' ? `
            <div style="background: #d1fae5; border: 2px solid #059669; padding: 16px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; margin-bottom: 8px;">✅</div>
              <div style="font-size: 15px; font-weight: 700; color: #065f46;">
                Pago Confirmado
              </div>
              <div style="font-size: 13px; color: #065f46; margin-top: 4px;">
                El cliente ha sido notificado por email
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : order.approvalStatus === 'approved' && parseFloat(order.totalPrice - order.depositAmount) > 0 ? `
      <div class="detail-section">
        <h3>Comprobante de Pago Final</h3>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 12px; text-align: center; color: #6b7280;">
          <div style="font-size: 32px; margin-bottom: 12px;">⏳</div>
          <div style="font-size: 15px; font-weight: 600;">Esperando comprobante del cliente</div>
          <div style="font-size: 13px; margin-top: 8px;">
            Saldo restante: ${formatCurrency(order.totalPrice - order.depositAmount)}
          </div>
        </div>
      </div>
    ` : ''}

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

      closeDepositModal();
      closeOrderDetail();
      loadOrders();
      alert('✅ Pedido aprobado exitosamente. Se ha generado y enviado el recibo al cliente.');
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

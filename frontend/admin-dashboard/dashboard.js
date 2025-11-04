/**
 * Admin Dashboard for VT Anunciando
 * Manages orders, approvals, and status updates
 */

// ==========================================
// CONFIGURATION
// ==========================================

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// ==========================================
// STATE MANAGEMENT
// ==========================================

const state = {
  orders: [],
  filteredOrders: [],
  currentFilter: 'all',
  selectedOrder: null
};

// ==========================================
// AUTHENTICATION
// ==========================================

function getAuthToken() {
  return localStorage.getItem('admin_token');
}

function getAuthHeaders() {
  const token = getAuthToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

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

  // Auto-refresh every 30 seconds
  setInterval(loadOrders, 30000);
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

  if (filter === 'all') {
    state.filteredOrders = state.orders;
  } else {
    state.filteredOrders = state.orders.filter(
      order => order.approvalStatus === filter
    );
  }

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
  card.onclick = () => showOrderDetail(order.id);

  const statusClass = `status-${order.approvalStatus}`;
  const statusText = getStatusText(order.approvalStatus);

  card.innerHTML = `
    <div class="order-header">
      <div class="order-title">
        <h3>${order.orderNumber}</h3>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
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
        <span class="meta-label">Fecha de Entrega</span>
        <span class="meta-value">${formatDate(order.eventDate)}</span>
      </div>
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
                <a href="tel:${order.phone || ''}" style="font-size: 15px; font-weight: 600; color: var(--primary); text-decoration: none;">
                  ${order.phone || 'No disponible'}
                </a>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="font-size: 20px;">📧</div>
              <div>
                <div style="font-size: 11px; color: var(--gray-600); font-weight: 600;">EMAIL</div>
                <a href="mailto:${order.email || ''}" style="font-size: 15px; font-weight: 600; color: var(--primary); text-decoration: none; overflow: hidden; text-overflow: ellipsis;">
                  ${order.email || 'No disponible'}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Fecha de Entrega</span>
          <span class="detail-value">${formatDate(order.eventDate)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Método de Pago</span>
          <span class="detail-value">${order.paymentMethod === 'bank_transfer' ? 'Transferencia Bancaria' : 'Tarjeta'}</span>
        </div>
      </div>
    </div>

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
        <h3>Comprobante de Pago</h3>
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
        <h3>Comprobante de Pago</h3>
        <div style="background: #fff3cd; padding: 16px; border-radius: 12px; color: #856404;">
          ⏳ Pendiente de subir comprobante
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

async function approveOrder(orderId) {
  if (!confirm('¿Aprobar este pedido? El cliente será notificado.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Pedido aprobado exitosamente');
      closeOrderDetail();
      loadOrders();
    } else {
      alert('Error: ' + (data.error || 'No se pudo aprobar el pedido'));
    }
  } catch (error) {
    console.error('Error approving order:', error);
    alert('Error al aprobar el pedido');
  }
}

async function rejectOrder(orderId) {
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
      alert('✅ Pedido rechazado');
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
  const pendingCount = state.orders.filter(o => o.approvalStatus === 'pending_review').length;
  const approvedCount = state.orders.filter(o => o.approvalStatus === 'approved').length;

  // Update header stats
  document.getElementById('pending-count').textContent = pendingCount;

  // Calculate today's revenue
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = state.orders.filter(o => o.orderDate === today);
  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  document.getElementById('today-revenue').textContent = formatCurrency(todayRevenue);

  // Update filter badges
  document.getElementById('all-count').textContent = state.orders.length;
  document.getElementById('pending-count-badge').textContent = pendingCount;
  document.getElementById('approved-count').textContent = approvedCount;
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

// Make functions globally accessible for onclick handlers
window.loadOrders = loadOrders;
window.closeOrderDetail = closeOrderDetail;
window.approveOrder = approveOrder;
window.rejectOrder = rejectOrder;

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
  searchQuery: ''
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
          <button class="quick-action-btn receipt-btn" onclick="event.stopPropagation(); downloadReceipt('${order.receiptPdfUrl}', '${order.orderNumber}');" title="Descargar recibo">
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

      ${order.approvalStatus === 'approved' && order.receiptPdfUrl ? `
        <div class="action-buttons" style="margin-top: 16px;">
          <button class="btn btn-primary" onclick="downloadReceipt('${order.receiptPdfUrl}', '${order.orderNumber}')" style="display: flex; align-items: center; gap: 8px; justify-content: center;">
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
 * Download receipt PDF
 * @param {string} receiptUrl - URL to the receipt PDF
 * @param {string} orderNumber - Order number for filename
 */
function downloadReceipt(receiptUrl, orderNumber) {
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

    console.log(`📥 Downloading receipt for order ${orderNumber}`);
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

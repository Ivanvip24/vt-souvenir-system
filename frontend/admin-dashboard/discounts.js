/**
 * Discounts Management - Special Clients & TOTP Promo Codes
 * Admin dashboard functionality for managing special clients
 */

// ==========================================
// STATE
// ==========================================

const discountState = {
  specialClients: [],
  products: [],
  currentClient: null,
  totpInterval: null
};

// ==========================================
// API CALLS
// ==========================================

async function loadSpecialClients() {
  const loading = document.getElementById('special-clients-loading');
  const list = document.getElementById('special-clients-list');
  const empty = document.getElementById('special-clients-empty');

  if (loading) loading.classList.remove('hidden');
  if (list) list.innerHTML = '';
  if (empty) empty.classList.add('hidden');

  try {
    const response = await fetch(`${API_BASE}/discounts/special-clients`);
    const data = await response.json();

    if (data.success) {
      discountState.specialClients = data.clients;
      renderSpecialClientsList();
    } else {
      console.error('Error loading special clients:', data.error);
    }
  } catch (error) {
    console.error('Error loading special clients:', error);
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

async function loadProductsForPricing() {
  try {
    const response = await fetch(`${API_BASE}/inventory/products`);
    const data = await response.json();

    if (data.success) {
      discountState.products = data.products;
    }
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

// ==========================================
// RENDER FUNCTIONS
// ==========================================

function renderSpecialClientsList() {
  const list = document.getElementById('special-clients-list');
  const empty = document.getElementById('special-clients-empty');

  if (!list) return;

  if (discountState.specialClients.length === 0) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  list.innerHTML = discountState.specialClients.map(client => `
    <div class="special-client-card" onclick="openSpecialClientDetail(${client.id})">
      <div class="client-card-header">
        <div class="client-avatar">${getInitials(client.name)}</div>
        <div class="client-info">
          <h3 class="client-name">${client.name}</h3>
          ${client.company ? `<span class="client-company">${client.company}</span>` : ''}
        </div>
        <span class="client-status ${client.is_active ? 'active' : 'inactive'}">
          ${client.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div class="client-card-body">
        <div class="client-detail">
          <span class="detail-icon">📧</span>
          <span>${client.email}</span>
        </div>
        ${client.phone ? `
          <div class="client-detail">
            <span class="detail-icon">📱</span>
            <span>${client.phone}</span>
          </div>
        ` : ''}
        <div class="client-detail">
          <span class="detail-icon">🏷️</span>
          <span>${client.custom_price_count} precios personalizados</span>
        </div>
      </div>
    </div>
  `).join('');
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ==========================================
// MODAL FUNCTIONS - ADD/EDIT CLIENT
// ==========================================

async function openAddSpecialClientModal() {
  // Load products if not loaded
  if (discountState.products.length === 0) {
    await loadProductsForPricing();
  }

  document.getElementById('special-client-modal-title').textContent = 'Agregar Cliente Especial';
  document.getElementById('edit-special-client-id').value = '';
  document.getElementById('special-client-name').value = '';
  document.getElementById('special-client-email').value = '';
  document.getElementById('special-client-phone').value = '';
  document.getElementById('special-client-company').value = '';

  renderCustomPricesInputs({});

  document.getElementById('special-client-modal').classList.remove('hidden');
}

async function editSpecialClient(clientId) {
  // Load products if not loaded
  if (discountState.products.length === 0) {
    await loadProductsForPricing();
  }

  try {
    const response = await fetch(`${API_BASE}/discounts/special-clients/${clientId}`);
    const data = await response.json();

    if (!data.success) {
      alert('Error cargando cliente: ' + data.error);
      return;
    }

    const client = data.client;
    const customPrices = {};
    data.customPrices.forEach(p => {
      customPrices[p.product_id] = p.custom_price;
    });

    document.getElementById('special-client-modal-title').textContent = 'Editar Cliente Especial';
    document.getElementById('edit-special-client-id').value = client.id;
    document.getElementById('special-client-name').value = client.name;
    document.getElementById('special-client-email').value = client.email;
    document.getElementById('special-client-phone').value = client.phone || '';
    document.getElementById('special-client-company').value = client.company || '';

    renderCustomPricesInputs(customPrices);

    document.getElementById('special-client-modal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading client for edit:', error);
    alert('Error cargando cliente');
  }
}

function renderCustomPricesInputs(existingPrices = {}) {
  const container = document.getElementById('custom-prices-container');
  if (!container) return;

  container.innerHTML = discountState.products.map(product => {
    const existingPrice = existingPrices[product.id];
    return `
      <div class="custom-price-row">
        <div class="product-info">
          <span class="product-name">${product.name}</span>
          <span class="product-normal-price">Normal: $${parseFloat(product.base_price).toFixed(2)}</span>
        </div>
        <div class="price-input-group">
          <span class="currency-symbol">$</span>
          <input type="number"
                 id="price-${product.id}"
                 class="price-input"
                 placeholder="${parseFloat(product.base_price).toFixed(2)}"
                 value="${existingPrice ? parseFloat(existingPrice).toFixed(2) : ''}"
                 step="0.01"
                 min="0">
        </div>
      </div>
    `;
  }).join('');
}

function closeSpecialClientModal() {
  document.getElementById('special-client-modal').classList.add('hidden');
}

async function saveSpecialClient() {
  const clientId = document.getElementById('edit-special-client-id').value;
  const name = document.getElementById('special-client-name').value.trim();
  const email = document.getElementById('special-client-email').value.trim();
  const phone = document.getElementById('special-client-phone').value.trim();
  const company = document.getElementById('special-client-company').value.trim();

  if (!name || !email) {
    alert('Nombre y email son requeridos');
    return;
  }

  // Collect custom prices
  const customPrices = [];
  discountState.products.forEach(product => {
    const input = document.getElementById(`price-${product.id}`);
    if (input && input.value) {
      customPrices.push({
        productId: product.id,
        customPrice: parseFloat(input.value)
      });
    }
  });

  const payload = { name, email, phone, company, customPrices };

  try {
    let response;
    if (clientId) {
      // Update existing
      response = await fetch(`${API_BASE}/discounts/special-clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // Create new
      response = await fetch(`${API_BASE}/discounts/special-clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await response.json();

    if (data.success) {
      closeSpecialClientModal();
      loadSpecialClients();

      // If we were viewing detail, refresh it
      if (discountState.currentClient && discountState.currentClient.id == clientId) {
        openSpecialClientDetail(clientId);
      }
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error saving client:', error);
    alert('Error guardando cliente');
  }
}

// ==========================================
// DETAIL MODAL - VIEW CLIENT & TOTP
// ==========================================

async function openSpecialClientDetail(clientId) {
  try {
    const response = await fetch(`${API_BASE}/discounts/special-clients/${clientId}`);
    const data = await response.json();

    if (!data.success) {
      alert('Error: ' + data.error);
      return;
    }

    discountState.currentClient = { ...data.client, id: clientId };

    // Populate detail modal
    document.getElementById('detail-client-name').textContent = data.client.name;
    document.getElementById('detail-client-email').textContent = data.client.email;
    document.getElementById('detail-client-phone').textContent = data.client.phone || '-';
    document.getElementById('detail-client-company').textContent = data.client.company || '-';

    // Render prices table
    const pricesTable = document.getElementById('detail-prices-table');
    if (data.customPrices.length > 0) {
      pricesTable.innerHTML = data.customPrices.map(price => `
        <tr>
          <td>${price.product_name}</td>
          <td>$${parseFloat(price.normal_price).toFixed(2)}</td>
          <td class="special-price">$${parseFloat(price.custom_price).toFixed(2)}</td>
          <td class="discount-badge">${price.discount_percent}%</td>
        </tr>
      `).join('');
    } else {
      pricesTable.innerHTML = '<tr><td colspan="4" class="no-prices">No hay precios personalizados</td></tr>';
    }

    // Start TOTP display
    updateTotpDisplay(data.totp);
    startTotpRefresh(clientId);

    document.getElementById('special-client-detail-modal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading client detail:', error);
    alert('Error cargando detalles del cliente');
  }
}

function closeSpecialClientDetailModal() {
  document.getElementById('special-client-detail-modal').classList.add('hidden');
  stopTotpRefresh();
  discountState.currentClient = null;
}

function updateTotpDisplay(totp) {
  document.getElementById('totp-code').textContent = totp.code;
  document.getElementById('totp-countdown').textContent = `${totp.secondsRemaining}s`;

  // Update timer bar
  const timerBar = document.getElementById('totp-timer-bar');
  const percentage = (totp.secondsRemaining / 30) * 100;
  timerBar.style.width = `${percentage}%`;

  // Color based on time remaining
  if (totp.secondsRemaining <= 5) {
    timerBar.style.background = '#ef4444';
  } else if (totp.secondsRemaining <= 10) {
    timerBar.style.background = '#f59e0b';
  } else {
    timerBar.style.background = 'linear-gradient(90deg, #E91E63, #FF9800)';
  }
}

function startTotpRefresh(clientId) {
  stopTotpRefresh(); // Clear any existing interval

  discountState.totpInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE}/discounts/special-clients/${clientId}/totp`);
      const data = await response.json();

      if (data.success) {
        updateTotpDisplay(data.totp);
      }
    } catch (error) {
      console.error('Error refreshing TOTP:', error);
    }
  }, 1000); // Update every second for smooth countdown
}

function stopTotpRefresh() {
  if (discountState.totpInterval) {
    clearInterval(discountState.totpInterval);
    discountState.totpInterval = null;
  }
}

function copyTotpCode() {
  const code = document.getElementById('totp-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    // Brief visual feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copiado!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  });
}

async function deleteSpecialClient() {
  if (!discountState.currentClient) return;

  if (!confirm(`¿Estás seguro de eliminar a ${discountState.currentClient.name}? Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/discounts/special-clients/${discountState.currentClient.id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      closeSpecialClientDetailModal();
      loadSpecialClients();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error deleting client:', error);
    alert('Error eliminando cliente');
  }
}

function editSpecialClientFromDetail() {
  if (!discountState.currentClient) return;

  closeSpecialClientDetailModal();
  editSpecialClient(discountState.currentClient.id);
}

// ==========================================
// INITIALIZATION
// ==========================================

// Load when discounts view is shown
document.addEventListener('DOMContentLoaded', () => {
  // Watch for view changes
  const discountsView = document.getElementById('discounts-view');
  if (discountsView) {
    // Use MutationObserver to detect when view becomes visible
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (discountsView.classList.contains('active')) {
            loadSpecialClients();
          }
        }
      });
    });

    observer.observe(discountsView, { attributes: true });
  }
});

// Make functions globally available
window.openAddSpecialClientModal = openAddSpecialClientModal;
window.closeSpecialClientModal = closeSpecialClientModal;
window.saveSpecialClient = saveSpecialClient;
window.openSpecialClientDetail = openSpecialClientDetail;
window.closeSpecialClientDetailModal = closeSpecialClientDetailModal;
window.copyTotpCode = copyTotpCode;
window.deleteSpecialClient = deleteSpecialClient;
window.editSpecialClientFromDetail = editSpecialClientFromDetail;
window.editSpecialClient = editSpecialClient;

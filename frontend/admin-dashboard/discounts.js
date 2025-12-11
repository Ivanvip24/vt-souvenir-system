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
  currentProducts: [],
  totpInterval: null,
  searchTimeout: null,
  clientSuggestions: []
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

async function searchExistingClients(query) {
  if (!query || query.length < 2) {
    hideClientSuggestions();
    return;
  }

  try {
    console.log('Searching clients for:', query);
    const response = await fetch(`${API_BASE}/discounts/search-clients?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    console.log('Search results:', data);

    if (data.success && data.clients.length > 0) {
      showClientSuggestions(data.clients);
    } else {
      hideClientSuggestions();
    }
  } catch (error) {
    console.error('Error searching clients:', error);
    hideClientSuggestions();
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
// CLIENT SEARCH AUTOCOMPLETE
// ==========================================

function showClientSuggestions(clients) {
  let dropdown = document.getElementById('client-suggestions-dropdown');

  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'client-suggestions-dropdown';
    dropdown.className = 'client-suggestions-dropdown';
    const nameInput = document.getElementById('special-client-name');
    nameInput.parentElement.appendChild(dropdown);
  }

  // Store clients in state for lookup
  discountState.clientSuggestions = clients;

  dropdown.innerHTML = clients.map((client, index) => `
    <div class="suggestion-item" onclick="selectClientSuggestionByIndex(${index})">
      <div class="suggestion-name">${escapeHtml(client.name)}</div>
      <div class="suggestion-details">
        ${client.email ? `<span>📧 ${escapeHtml(client.email)}</span>` : ''}
        ${client.phone ? `<span>📱 ${escapeHtml(client.phone)}</span>` : ''}
      </div>
    </div>
  `).join('');

  dropdown.style.display = 'block';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function selectClientSuggestionByIndex(index) {
  const client = discountState.clientSuggestions[index];
  if (client) {
    selectClientSuggestion(client);
  }
}

function hideClientSuggestions() {
  const dropdown = document.getElementById('client-suggestions-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
  }
}

function selectClientSuggestion(client) {
  document.getElementById('special-client-name').value = client.name;
  document.getElementById('special-client-email').value = client.email || '';
  document.getElementById('special-client-phone').value = client.phone || '';
  hideClientSuggestions();
}

function handleClientNameInput(event) {
  const query = event.target.value;

  if (discountState.searchTimeout) {
    clearTimeout(discountState.searchTimeout);
  }

  discountState.searchTimeout = setTimeout(() => {
    searchExistingClients(query);
  }, 300);
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

  // Add input listener for autocomplete
  const nameInput = document.getElementById('special-client-name');
  nameInput.removeEventListener('input', handleClientNameInput);
  nameInput.addEventListener('input', handleClientNameInput);

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
    if (data.allProducts) {
      data.allProducts.forEach(p => {
        if (p.custom_price) {
          customPrices[p.product_id] = p.custom_price;
        }
      });
    }

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
  hideClientSuggestions();
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
    discountState.currentProducts = data.allProducts || [];

    // Populate detail modal
    document.getElementById('detail-client-name').textContent = data.client.name;
    document.getElementById('detail-client-email').textContent = data.client.email;
    document.getElementById('detail-client-phone').textContent = data.client.phone || '-';
    document.getElementById('detail-client-company').textContent = data.client.company || '-';

    // Render ALL products table with prices
    renderDetailPricesTable(data.allProducts || []);

    // Start TOTP display
    updateTotpDisplay(data.totp);
    startTotpRefresh(clientId);

    document.getElementById('special-client-detail-modal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading client detail:', error);
    alert('Error cargando detalles del cliente');
  }
}

function renderDetailPricesTable(products) {
  const pricesTable = document.getElementById('detail-prices-table');

  if (!products || products.length === 0) {
    pricesTable.innerHTML = '<tr><td colspan="5" class="no-prices">No hay productos disponibles</td></tr>';
    return;
  }

  pricesTable.innerHTML = products.map(product => {
    const hasCustomPrice = product.custom_price !== null;
    const normalPrice = parseFloat(product.normal_price);
    const customPrice = hasCustomPrice ? parseFloat(product.custom_price) : null;
    const discount = hasCustomPrice ? product.discount_percent : null;

    return `
      <tr class="${hasCustomPrice ? 'has-discount' : ''}">
        <td>
          <div class="product-name-cell">${product.product_name}</div>
          ${product.category ? `<small class="product-category">${product.category}</small>` : ''}
        </td>
        <td>$${normalPrice.toFixed(2)}</td>
        <td class="${hasCustomPrice ? 'special-price' : 'no-special'}">
          ${hasCustomPrice ? `$${customPrice.toFixed(2)}` : '<span class="price-normal">Normal</span>'}
        </td>
        <td class="${hasCustomPrice ? 'discount-badge' : ''}">
          ${hasCustomPrice ? `${discount}%` : '-'}
        </td>
        <td>
          <button class="btn-edit-price" onclick="editSinglePrice(${product.product_id}, ${normalPrice}, ${customPrice || 'null'})">
            ✏️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function editSinglePrice(productId, normalPrice, currentCustomPrice) {
  const newPrice = prompt(
    `Precio especial para este producto\nPrecio normal: $${normalPrice.toFixed(2)}\n\nDeja vacío para usar precio normal:`,
    currentCustomPrice ? currentCustomPrice.toFixed(2) : ''
  );

  if (newPrice === null) return; // Cancelled

  const customPrice = newPrice.trim() ? parseFloat(newPrice) : null;

  // Update price via API
  updateSinglePrice(productId, customPrice);
}

async function updateSinglePrice(productId, customPrice) {
  if (!discountState.currentClient) return;

  try {
    // Get current custom prices from state
    const customPrices = [];

    discountState.currentProducts.forEach(p => {
      if (p.product_id === productId) {
        if (customPrice !== null) {
          customPrices.push({ productId: p.product_id, customPrice: customPrice });
        }
      } else if (p.custom_price !== null) {
        customPrices.push({ productId: p.product_id, customPrice: parseFloat(p.custom_price) });
      }
    });

    const response = await fetch(`${API_BASE}/discounts/special-clients/${discountState.currentClient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customPrices })
    });

    const data = await response.json();

    if (data.success) {
      // Refresh the detail view
      openSpecialClientDetail(discountState.currentClient.id);
      loadSpecialClients(); // Refresh list too
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error updating price:', error);
    alert('Error actualizando precio');
  }
}

function closeSpecialClientDetailModal() {
  document.getElementById('special-client-detail-modal').classList.add('hidden');
  stopTotpRefresh();
  discountState.currentClient = null;
  discountState.currentProducts = [];
}

function updateTotpDisplay(totp) {
  document.getElementById('totp-code').textContent = totp.code;

  // Format time remaining (minutes:seconds for 1 hour codes)
  const mins = totp.minutesRemaining || Math.floor(totp.secondsRemaining / 60);
  const secs = totp.secondsRemainder !== undefined ? totp.secondsRemainder : (totp.secondsRemaining % 60);
  document.getElementById('totp-countdown').textContent = `${mins}m ${secs}s`;

  // Update timer bar (based on 1 hour = 3600 seconds)
  const timerBar = document.getElementById('totp-timer-bar');
  const timeStep = totp.timeStep || 3600;
  const percentage = (totp.secondsRemaining / timeStep) * 100;
  timerBar.style.width = `${percentage}%`;

  // Color based on time remaining (adjusted for 1 hour)
  if (totp.secondsRemaining <= 300) { // 5 minutes
    timerBar.style.background = '#ef4444';
  } else if (totp.secondsRemaining <= 600) { // 10 minutes
    timerBar.style.background = '#f59e0b';
  } else {
    timerBar.style.background = 'linear-gradient(90deg, #E91E63, #FF9800)';
  }
}

function startTotpRefresh(clientId) {
  stopTotpRefresh(); // Clear any existing interval

  // Refresh every 10 seconds (no need for every second with 1 hour codes)
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
  }, 10000);
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

  // Close suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group') || e.target.id !== 'special-client-name') {
      hideClientSuggestions();
    }
  });
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
window.selectClientSuggestion = selectClientSuggestion;
window.selectClientSuggestionByIndex = selectClientSuggestionByIndex;
window.editSinglePrice = editSinglePrice;

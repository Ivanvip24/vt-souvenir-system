/**
 * Shipping / Clients Database Module
 * Clean card-based view for client addresses
 */

// ==========================================
// STATE
// ==========================================

const shippingState = {
  clients: [],
  filteredClients: [],
  filters: {
    cities: [],
    states: []
  },
  activeFilters: {
    city: null,
    state: null
  },
  quickFilter: 'all', // 'all' | 'withAddress' | 'withoutAddress' | 'recent'
  searchQuery: '',
  sort: 'recent', // 'recent' | 'alpha'
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 50,
  stats: {
    total_clients: 0,
    with_address: 0,
    unique_cities: 0,
    recent_count: 0
  }
};

// ==========================================
// UTILITIES
// ==========================================

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }

  const colors = {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6'
  };

  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-weight: 600;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const shippingNavBtn = document.querySelector('[data-view="shipping"]');
  if (shippingNavBtn) {
    shippingNavBtn.addEventListener('click', () => {
      loadShippingData();
    });
  }
});

// ==========================================
// DATA LOADING
// ==========================================

async function loadShippingData() {
  const loading = document.getElementById('shipping-loading');
  const cardsContainer = document.getElementById('shipping-cards-container');
  const emptyState = document.getElementById('shipping-empty-state');

  if (loading) loading.classList.remove('hidden');
  if (cardsContainer) cardsContainer.style.display = 'none';
  if (emptyState) emptyState.classList.add('hidden');

  try {
    const params = new URLSearchParams({
      page: shippingState.currentPage,
      limit: shippingState.itemsPerPage,
      sort: shippingState.sort
    });

    if (shippingState.searchQuery) {
      // Strip accents for accent-insensitive search
      const normalized = stripAccents(shippingState.searchQuery).toLowerCase();
      params.append('search', normalized);
    }
    if (shippingState.activeFilters.city) {
      params.append('city', shippingState.activeFilters.city);
    }
    if (shippingState.activeFilters.state) {
      params.append('state', shippingState.activeFilters.state);
    }

    // Quick filter → backend params
    if (shippingState.quickFilter === 'withAddress') {
      params.append('hasAddress', 'true');
    } else if (shippingState.quickFilter === 'withoutAddress') {
      params.append('hasAddress', 'false');
    } else if (shippingState.quickFilter === 'recent') {
      params.append('recent', 'true');
    }

    const response = await fetch(`${API_BASE}/clients?${params}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch clients');

    const result = await response.json();

    if (result.success) {
      shippingState.clients = result.data;
      shippingState.filteredClients = result.data;
      shippingState.filters = result.filters;
      shippingState.stats = result.stats;
      shippingState.currentPage = result.pagination.page;
      shippingState.totalPages = result.pagination.totalPages;

      renderQuickFilterCounts();
      renderShippingTable();
      renderPagination();
      renderActiveFilters();

      if (result.data.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (cardsContainer) cardsContainer.style.display = 'none';
      } else {
        if (cardsContainer) cardsContainer.style.display = 'grid';
      }
    }
  } catch (error) {
    console.error('Error loading shipping data:', error);
    showNotification('Error al cargar clientes', 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

// ==========================================
// RENDERING
// ==========================================

function renderQuickFilterCounts() {
  const stats = shippingState.stats;
  const total = parseInt(stats.total_clients) || 0;
  const withAddr = parseInt(stats.with_address) || 0;
  const without = total - withAddr;
  const recent = parseInt(stats.recent_count) || 0;

  const countAll = document.getElementById('filter-count-all');
  const countWith = document.getElementById('filter-count-with');
  const countWithout = document.getElementById('filter-count-without');
  const countRecent = document.getElementById('filter-count-recent');

  if (countAll) countAll.textContent = total;
  if (countWith) countWith.textContent = withAddr;
  if (countWithout) countWithout.textContent = without;
  if (countRecent) countRecent.textContent = recent;
}

function renderShippingTable() {
  const container = document.getElementById('shipping-cards-container');
  if (!container) return;

  // No frontend sorting — backend handles order via sort param
  const clients = shippingState.filteredClients;

  container.innerHTML = clients.map(client => {
    const hasFullAddress = client.street && client.city && client.state && (client.postal_code || client.postal);
    const location = [client.city, client.state].filter(Boolean).join(', ') || 'Sin ubicacion';
    const postal = client.postal_code || client.postal || '';
    const phone = client.phone || '';

    return `
      <div class="address-card ${hasFullAddress ? 'complete' : 'incomplete'}" onclick="showClientDetailPopup(${client.id})">
        <div class="address-card-header">
          <span class="address-card-name">${escapeHtml(client.name)}</span>
          ${hasFullAddress
            ? '<span class="address-status complete">&#10003;</span>'
            : '<span class="address-status incomplete">!</span>'
          }
        </div>
        ${phone ? `<div class="address-card-phone">${escapeHtml(phone)}</div>` : ''}
        <div class="address-card-location">
          ${escapeHtml(location)}${postal ? ` &middot; CP ${escapeHtml(postal)}` : ''}
        </div>
        ${client.order_count > 0
          ? `<div class="address-card-orders">${client.order_count} pedido${client.order_count > 1 ? 's' : ''}</div>`
          : ''
        }
      </div>
    `;
  }).join('');
}

/**
 * Show client detail popup
 */
async function showClientDetailPopup(clientId) {
  try {
    const response = await fetch(`${API_BASE}/clients/${clientId}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch client');

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    const client = result.data;
    const hasFullAddress = client.street && client.city && client.state && (client.postal || client.postal_code);
    const postal = client.postal || client.postal_code || '';

    // Build address display
    let addressHtml = '';
    if (client.street || client.address) {
      const parts = [];
      if (client.street) {
        parts.push(client.street + (client.street_number ? ` #${client.street_number}` : ''));
      } else if (client.address) {
        parts.push(client.address);
      }
      if (client.colonia) parts.push(`Col. ${client.colonia}`);
      if (client.city) parts.push(client.city);
      if (client.state) parts.push(client.state);
      if (postal) parts.push(`CP ${postal}`);
      addressHtml = parts.join('<br>');
    } else {
      addressHtml = '<span style="color: #f59e0b;">Sin direccion registrada</span>';
    }

    // Remove existing popup
    const existing = document.getElementById('client-detail-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'client-detail-popup';
    popup.className = 'client-popup-overlay';
    popup.onclick = (e) => { if (e.target === popup) popup.remove(); };

    popup.innerHTML = `
      <div class="client-popup-content">
        <div class="client-popup-header">
          <h3>${escapeHtml(client.name)}</h3>
          <button class="client-popup-close" onclick="document.getElementById('client-detail-popup').remove()">&times;</button>
        </div>

        <div class="client-popup-body">
          <div class="client-popup-section">
            <h4>Direccion</h4>
            <div class="client-popup-address">${addressHtml}</div>
          </div>

          <div class="client-popup-section">
            <h4>Contacto</h4>
            <div class="client-popup-info-grid">
              ${client.phone ? `
                <div class="client-popup-info-item">
                  <div class="client-popup-info-label">Telefono</div>
                  <div class="client-popup-info-value">
                    ${escapeHtml(client.phone)}
                    <a href="https://wa.me/52${client.phone.replace(/\D/g, '')}" target="_blank" style="margin-left: 8px; color: #25D366;">WhatsApp</a>
                  </div>
                </div>
              ` : ''}
              ${client.email ? `
                <div class="client-popup-info-item">
                  <div class="client-popup-info-label">Email</div>
                  <div class="client-popup-info-value">
                    <a href="mailto:${escapeHtml(client.email)}">${escapeHtml(client.email)}</a>
                  </div>
                </div>
              ` : ''}
              ${client.reference_notes ? `
                <div class="client-popup-info-item full-width">
                  <div class="client-popup-info-label">Referencias</div>
                  <div class="client-popup-info-value">${escapeHtml(client.reference_notes)}</div>
                </div>
              ` : ''}
            </div>
          </div>

          ${client.orders && client.orders.length > 0 ? `
            <div class="client-popup-section">
              <h4>Pedidos (${client.orders.length})</h4>
              <div class="client-popup-orders">
                ${client.orders.slice(0, 5).map(o => `
                  <div class="client-popup-order" onclick="navigateToOrder('${o.orderNumber}')">
                    <span class="client-popup-order-number">${o.orderNumber}</span>
                    <span class="client-popup-order-date">$${parseFloat(o.totalPrice || 0).toLocaleString('es-MX')}</span>
                  </div>
                `).join('')}
                ${client.orders.length > 5 ? `<div class="client-popup-no-orders">+ ${client.orders.length - 5} mas</div>` : ''}
              </div>
            </div>
          ` : `
            <div class="client-popup-section">
              <h4>Pedidos</h4>
              <div class="client-popup-no-orders">Sin pedidos registrados</div>
            </div>
          `}
        </div>

        <div class="client-popup-footer">
          <button class="client-popup-btn danger" onclick="deleteClient(${client.id}, '${escapeHtml(client.name).replace(/'/g, "\\'")}')">
            Eliminar
          </button>
          <button class="client-popup-btn secondary" onclick="document.getElementById('client-detail-popup').remove()">
            Cerrar
          </button>
          <button class="client-popup-btn primary" onclick="document.getElementById('client-detail-popup').remove(); editClient(${client.id})">
            Editar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

  } catch (error) {
    console.error('Error loading client details:', error);
    showNotification('Error al cargar detalles', 'error');
  }
}

window.showClientDetailPopup = showClientDetailPopup;

function renderPagination() {
  const paginationInfo = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');

  if (paginationInfo) {
    paginationInfo.textContent = `Pagina ${shippingState.currentPage} de ${shippingState.totalPages}`;
  }

  if (prevBtn) {
    prevBtn.disabled = shippingState.currentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled = shippingState.currentPage >= shippingState.totalPages;
  }
}

function renderActiveFilters() {
  const container = document.getElementById('active-filters');
  if (!container) return;

  const filters = [];

  if (shippingState.activeFilters.city) {
    filters.push(`
      <span class="active-filter-tag">
        Ciudad: ${escapeHtml(shippingState.activeFilters.city)}
        <button onclick="removeShippingFilter('city')" class="remove-filter">&times;</button>
      </span>
    `);
  }

  if (shippingState.activeFilters.state) {
    filters.push(`
      <span class="active-filter-tag">
        Estado: ${escapeHtml(shippingState.activeFilters.state)}
        <button onclick="removeShippingFilter('state')" class="remove-filter">&times;</button>
      </span>
    `);
  }

  container.innerHTML = filters.join('');
}

// ==========================================
// QUICK FILTERS
// ==========================================

function setQuickFilter(filter) {
  shippingState.quickFilter = filter;
  shippingState.currentPage = 1;

  // Update active tab UI
  document.querySelectorAll('.quick-filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  loadShippingData();
}

// ==========================================
// SORT TOGGLE
// ==========================================

function setShippingSort(sortType) {
  shippingState.sort = sortType;
  shippingState.currentPage = 1;

  // Update button UI
  const recentBtn = document.getElementById('sort-recent-btn');
  const alphaBtn = document.getElementById('sort-alpha-btn');
  if (recentBtn) recentBtn.classList.toggle('active', sortType === 'recent');
  if (alphaBtn) alphaBtn.classList.toggle('active', sortType === 'alpha');

  loadShippingData();
}

// ==========================================
// SEARCH & FILTERS
// ==========================================

function handleShippingSearch(value) {
  shippingState.searchQuery = value;
  shippingState.currentPage = 1;

  const clearBtn = document.getElementById('shipping-search-clear');
  if (clearBtn) {
    clearBtn.style.display = value ? 'block' : 'none';
  }

  clearTimeout(window.shippingSearchTimeout);
  window.shippingSearchTimeout = setTimeout(() => {
    loadShippingData();
  }, 300);
}

function clearShippingSearch() {
  const input = document.getElementById('shipping-search-input');
  if (input) input.value = '';
  shippingState.searchQuery = '';
  shippingState.currentPage = 1;

  const clearBtn = document.getElementById('shipping-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';

  loadShippingData();
}

function toggleFilterDropdown(filterType) {
  const dropdown = document.getElementById('filter-dropdown');
  const content = document.getElementById('filter-dropdown-content');

  if (!dropdown || !content) return;

  if (!dropdown.classList.contains('hidden') && dropdown.dataset.filterType === filterType) {
    dropdown.classList.add('hidden');
    return;
  }

  dropdown.dataset.filterType = filterType;
  dropdown.classList.remove('hidden');

  let html = '';

  if (filterType === 'city') {
    html = `
      <div class="filter-header">Filtrar por Ciudad</div>
      <div class="filter-options">
        ${shippingState.filters.cities.map(city => `
          <label class="filter-option">
            <input type="radio" name="city-filter" value="${escapeHtml(city)}"
              ${shippingState.activeFilters.city === city ? 'checked' : ''}
              onchange="applyShippingFilter('city', '${escapeHtml(city)}')"
            >
            ${escapeHtml(city)}
          </label>
        `).join('')}
      </div>
      <button class="filter-clear-btn" onclick="removeShippingFilter('city')">Limpiar filtro</button>
    `;
  } else if (filterType === 'state') {
    html = `
      <div class="filter-header">Filtrar por Estado</div>
      <div class="filter-options">
        ${shippingState.filters.states.map(state => `
          <label class="filter-option">
            <input type="radio" name="state-filter" value="${escapeHtml(state)}"
              ${shippingState.activeFilters.state === state ? 'checked' : ''}
              onchange="applyShippingFilter('state', '${escapeHtml(state)}')"
            >
            ${escapeHtml(state)}
          </label>
        `).join('')}
      </div>
      <button class="filter-clear-btn" onclick="removeShippingFilter('state')">Limpiar filtro</button>
    `;
  }

  content.innerHTML = html;
}

function applyShippingFilter(filterType, value) {
  shippingState.activeFilters[filterType] = value;
  shippingState.currentPage = 1;

  const dropdown = document.getElementById('filter-dropdown');
  if (dropdown) dropdown.classList.add('hidden');

  renderActiveFilters();
  loadShippingData();
}

function removeShippingFilter(filterType) {
  shippingState.activeFilters[filterType] = null;
  shippingState.currentPage = 1;

  const dropdown = document.getElementById('filter-dropdown');
  if (dropdown) dropdown.classList.add('hidden');

  renderActiveFilters();
  loadShippingData();
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('filter-dropdown');
  const filterChips = document.getElementById('filter-chips');

  if (dropdown && !dropdown.contains(e.target) && filterChips && !filterChips.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// ==========================================
// PAGINATION
// ==========================================

function goToShippingPage(direction) {
  if (direction === 'prev' && shippingState.currentPage > 1) {
    shippingState.currentPage--;
    loadShippingData();
  } else if (direction === 'next' && shippingState.currentPage < shippingState.totalPages) {
    shippingState.currentPage++;
    loadShippingData();
  }
}

// ==========================================
// CLIENT CRUD
// ==========================================

function showAddClientModal() {
  const modal = document.getElementById('client-modal');
  const form = document.getElementById('client-form');
  const title = document.getElementById('client-modal-title');

  if (!modal || !form) return;

  form.reset();
  document.getElementById('client_id').value = '';

  if (title) title.textContent = 'Agregar Cliente';

  modal.classList.remove('hidden');
}

async function editClient(clientId) {
  try {
    const response = await fetch(`${API_BASE}/clients/${clientId}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch client');

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    const client = result.data;
    const modal = document.getElementById('client-modal');
    const title = document.getElementById('client-modal-title');

    if (!modal) {
      console.error('Client modal not found');
      showNotification('Error: Modal no encontrado', 'error');
      return;
    }

    document.getElementById('client_id').value = client.id;
    document.getElementById('client_name').value = client.name || '';
    document.getElementById('client_phone').value = client.phone || '';
    document.getElementById('client_email').value = client.email || '';
    document.getElementById('client_street').value = client.street || '';
    document.getElementById('client_street_number').value = client.street_number || '';
    document.getElementById('client_colonia').value = client.colonia || '';
    document.getElementById('client_city').value = client.city || '';
    document.getElementById('client_state').value = client.state || '';
    document.getElementById('client_postal_code').value = client.postal_code || client.postal || '';
    document.getElementById('client_reference_notes').value = client.reference_notes || '';

    if (title) title.textContent = 'Editar Cliente';

    modal.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading client:', error);
    showNotification('Error al cargar cliente', 'error');
  }
}

async function saveClient(event) {
  event.preventDefault();

  const clientId = document.getElementById('client_id').value;

  const data = {
    name: document.getElementById('client_name').value,
    phone: document.getElementById('client_phone').value || null,
    email: document.getElementById('client_email').value || null,
    street: document.getElementById('client_street').value || null,
    street_number: document.getElementById('client_street_number').value || null,
    colonia: document.getElementById('client_colonia').value || null,
    city: document.getElementById('client_city').value || null,
    state: document.getElementById('client_state').value || null,
    postal_code: document.getElementById('client_postal_code').value || null,
    reference_notes: document.getElementById('client_reference_notes').value || null
  };

  try {
    const url = clientId ? `${API_BASE}/clients/${clientId}` : `${API_BASE}/clients`;
    const method = clientId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to save client');

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    showNotification(clientId ? 'Cliente actualizado' : 'Cliente creado', 'success');
    closeClientModal();
    loadShippingData();
  } catch (error) {
    console.error('Error saving client:', error);
    showNotification('Error al guardar cliente', 'error');
  }
}

function closeClientModal() {
  const modal = document.getElementById('client-modal');
  if (modal) modal.classList.add('hidden');
}

async function viewClientOrders(clientId) {
  try {
    const response = await fetch(`${API_BASE}/clients/${clientId}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch client');

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    const client = result.data;
    const orders = client.orders || [];

    if (orders.length === 0) {
      showNotification(`${client.name} no tiene pedidos`, 'info');
      return;
    }

    const ordersList = orders.map(o =>
      `${o.orderNumber} - $${parseFloat(o.totalPrice || 0).toFixed(2)} - ${o.status}`
    ).join('\n');

    alert(`Pedidos de ${client.name}:\n\n${ordersList}`);
  } catch (error) {
    console.error('Error viewing orders:', error);
    showNotification('Error al cargar pedidos', 'error');
  }
}

// ==========================================
// EXPORT
// ==========================================

function exportClientsCSV() {
  const clients = shippingState.filteredClients;

  if (clients.length === 0) {
    showNotification('No hay clientes para exportar', 'warning');
    return;
  }

  const headers = ['Nombre', 'Telefono', 'Email', 'Calle', 'Num. Ext', 'Colonia', 'Ciudad', 'Estado', 'C.P.', 'Pedidos'];
  const rows = clients.map(c => [
    c.name || '',
    c.phone || '',
    c.email || '',
    c.street || '',
    c.street_number || '',
    c.colonia || '',
    c.city || '',
    c.state || '',
    c.postal_code || '',
    c.order_count || 0
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showNotification('CSV exportado correctamente', 'success');
}

// ==========================================
// CSV IMPORT
// ==========================================

let pendingImportClients = [];

function triggerImportCSV() {
  document.getElementById('csv-import-input').click();
}

async function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  event.target.value = '';

  showNotification('Leyendo archivo CSV...', 'info');

  try {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      showNotification('El archivo CSV esta vacio o no tiene datos', 'error');
      return;
    }

    const headers = parseCSVLine(lines[0]);

    const headerMap = {
      'Nombre Completo': 'name',
      'Calle': 'street',
      'Colonia': 'colonia',
      'Colonia ': 'colonia',
      'Correo electrónico / Mail': 'email',
      'Código Postal': 'postalCode',
      'Nombre del destino': 'destination',
      'Nombre del destino ': 'destination',
      'Número exterior': 'streetNumber',
      'Número exterior ': 'streetNumber',
      'Referencias': 'references',
      'Teléfono': 'phone',
      'Teléfono ': 'phone'
    };

    const clients = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const client = {};
      headers.forEach((header, index) => {
        const key = headerMap[header] || header.toLowerCase().replace(/\s+/g, '_');
        client[key] = values[index] || '';
      });

      if (client.name && client.name.trim()) {
        clients.push(client);
      }
    }

    if (clients.length === 0) {
      showNotification('No se encontraron clientes validos en el CSV', 'error');
      return;
    }

    pendingImportClients = clients;
    showImportConfirmModal(clients);

  } catch (error) {
    console.error('CSV parse error:', error);
    showNotification('Error al leer el archivo CSV', 'error');
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function showImportConfirmModal(clients) {
  const existing = document.getElementById('import-confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'import-confirm-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>Importar Clientes</h3>
        <button class="modal-close" onclick="closeImportModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 24px; font-weight: 700; color: #16a34a;">${clients.length}</div>
          <div style="color: #15803d;">clientes encontrados en el CSV</div>
        </div>

        <div style="margin-bottom: 16px;">
          <strong>Vista previa (primeros 5):</strong>
        </div>

        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <thead style="background: #f9fafb; position: sticky; top: 0;">
              <tr>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Nombre</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Telefono</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Ciudad</th>
              </tr>
            </thead>
            <tbody>
              ${clients.slice(0, 5).map(c => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(c.name || '')}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(c.phone || '')}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(c.destination || '')}</td>
                </tr>
              `).join('')}
              ${clients.length > 5 ? `
                <tr>
                  <td colspan="3" style="padding: 8px; text-align: center; color: #6b7280;">
                    ... y ${clients.length - 5} mas
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e;">
          <strong>Nota:</strong> Los clientes duplicados (mismo telefono o nombre+CP) seran omitidos automaticamente.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeImportModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="executeClientImport()">
          Importar ${clients.length} Clientes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  if (!document.getElementById('import-modal-styles')) {
    const styles = document.createElement('style');
    styles.id = 'import-modal-styles';
    styles.textContent = `
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      .modal-content {
        background: white;
        border-radius: 12px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,0.3);
      }
      .modal-header {
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .modal-header h3 {
        margin: 0;
        font-size: 18px;
      }
      .modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6b7280;
      }
      .modal-body {
        padding: 20px;
        overflow-y: auto;
      }
      .modal-footer {
        padding: 16px 20px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        background: #f9fafb;
      }
    `;
    document.head.appendChild(styles);
  }
}

function closeImportModal() {
  const modal = document.getElementById('import-confirm-modal');
  if (modal) modal.remove();
  pendingImportClients = [];
}

async function executeClientImport() {
  if (pendingImportClients.length === 0) return;

  const modal = document.getElementById('import-confirm-modal');
  const importBtn = modal?.querySelector('.btn-primary');

  if (importBtn) {
    importBtn.disabled = true;
    importBtn.innerHTML = 'Importando...';
  }

  try {
    const token = localStorage.getItem('admin_token');

    const batchSize = 50;
    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (let i = 0; i < pendingImportClients.length; i += batchSize) {
      const batch = pendingImportClients.slice(i, i + batchSize);

      const response = await fetch(`${API_BASE}/admin/import-clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clients: batch })
      });

      const result = await response.json();

      if (result.success) {
        totalImported += result.imported;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
      } else {
        throw new Error(result.error || 'Import failed');
      }

      if (importBtn) {
        const progress = Math.round((i + batch.length) / pendingImportClients.length * 100);
        importBtn.innerHTML = `${progress}%...`;
      }
    }

    closeImportModal();

    showNotification(
      `Importados: ${totalImported} | Omitidos: ${totalSkipped} | Errores: ${totalErrors}`,
      totalErrors > 0 ? 'warning' : 'success'
    );

    loadShippingData();

  } catch (error) {
    console.error('Import error:', error);
    showNotification('Error al importar: ' + error.message, 'error');

    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = `Importar ${pendingImportClients.length} Clientes`;
    }
  }
}

// ==========================================
// DELETE CLIENT
// ==========================================

async function deleteClient(clientId, clientName) {
  const confirmed = confirm(`Estas seguro que deseas eliminar a "${clientName}"?\n\nEsta accion no se puede deshacer.`);

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE}/clients/${clientId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Failed to delete client');
    }

    const popup = document.getElementById('client-detail-popup');
    if (popup) popup.remove();

    showNotification('Cliente eliminado correctamente', 'success');
    loadShippingData();

  } catch (error) {
    console.error('Error deleting client:', error);
    showNotification('Error al eliminar cliente: ' + error.message, 'error');
  }
}

// Export functions globally
window.triggerImportCSV = triggerImportCSV;
window.handleCSVImport = handleCSVImport;
window.closeImportModal = closeImportModal;
window.executeClientImport = executeClientImport;
window.editClient = editClient;
window.deleteClient = deleteClient;
window.showClientDetailPopup = showClientDetailPopup;
window.closeClientModal = closeClientModal;
window.saveClient = saveClient;
window.setQuickFilter = setQuickFilter;
window.setShippingSort = setShippingSort;

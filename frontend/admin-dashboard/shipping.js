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
  autoCompleteRan: false, // Only run auto-complete once per session
  viewMode: 'cards', // 'cards' | 'list'
  selectMode: false, // Whether multi-select mode is active
  selectedIds: new Set(), // Set of selected client IDs
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

/**
 * Copy text to clipboard and show visual feedback
 */
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(err => {
    console.error('Copy failed:', err);
    showNotification('Error al copiar', 'error');
  });
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
      renderPagination();
      renderActiveFilters();

      const listContainer = document.getElementById('shipping-list-container');

      if (result.data.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (cardsContainer) cardsContainer.style.display = 'none';
        if (listContainer) listContainer.style.display = 'none';
      } else if (shippingState.viewMode === 'list') {
        if (cardsContainer) cardsContainer.style.display = 'none';
        if (listContainer) listContainer.style.display = '';
        renderShippingList();
      } else {
        if (cardsContainer) cardsContainer.style.display = 'grid';
        if (listContainer) listContainer.style.display = 'none';
        renderShippingTable();
      }

      // Auto-complete missing fields from postal codes on first load
      if (!shippingState.autoCompleteRan) {
        shippingState.autoCompleteRan = true;
        silentAutoComplete();
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

function getMissingFields(client) {
  const missing = [];
  if (!client.phone) missing.push('Tel');
  if (!client.street) missing.push('Calle');
  if (!client.colonia) missing.push('Colonia');
  if (!client.city) missing.push('Ciudad');
  if (!client.state) missing.push('Estado');
  const postalVal = client.postal_code || client.postal || '';
  if (!postalVal) missing.push('CP');
  return missing;
}

function renderShippingTable() {
  const container = document.getElementById('shipping-cards-container');
  if (!container) return;

  const clients = shippingState.filteredClients;
  const inSelect = shippingState.selectMode;

  container.innerHTML = clients.map(client => {
    const hasFullAddress = client.street && client.city && client.state && (client.postal_code || client.postal);
    const location = [client.city, client.state].filter(Boolean).join(', ') || 'Sin ubicacion';
    const postal = client.postal_code || client.postal || '';
    const phone = client.phone || '';
    const missing = hasFullAddress ? [] : getMissingFields(client);
    const isSelected = shippingState.selectedIds.has(client.id);

    return `
      <div class="address-card ${hasFullAddress ? 'complete' : 'incomplete'}${isSelected ? ' selected' : ''}"
           onclick="${inSelect ? `toggleSelectClient(${client.id})` : `showClientDetailPopup(${client.id})`}">
        ${inSelect ? `
          <div class="address-card-checkbox">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectClient(${client.id})" />
          </div>
        ` : ''}
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
        ${missing.length > 0
          ? `<div class="address-card-missing">Falta: ${missing.join(', ')}</div>`
          : ''
        }
        ${client.order_count > 0
          ? `<div class="address-card-orders">${client.order_count} pedido${client.order_count > 1 ? 's' : ''}</div>`
          : ''
        }
      </div>
    `;
  }).join('');
}

function renderShippingList() {
  const body = document.getElementById('shipping-list-body');
  if (!body) return;

  const clients = shippingState.filteredClients;
  const inSelect = shippingState.selectMode;

  // Show/hide select column
  const selectCol = document.getElementById('list-select-col');
  if (selectCol) selectCol.style.display = inSelect ? '' : 'none';

  body.innerHTML = clients.map(client => {
    const location = [client.city, client.state].filter(Boolean).join(', ') || '';
    const postal = client.postal_code || client.postal || '';
    const street = client.street || '';
    const streetNum = client.street_number ? ` #${client.street_number}` : '';
    const isSelected = shippingState.selectedIds.has(client.id);

    return `
      <tr class="${isSelected ? 'selected' : ''}" onclick="${inSelect ? `toggleSelectClient(${client.id})` : `showClientDetailPopup(${client.id})`}">
        ${inSelect ? `
          <td class="col-checkbox">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectClient(${client.id})" />
          </td>
        ` : ''}
        <td class="col-name"><strong>${escapeHtml(client.name)}</strong></td>
        <td class="col-location">${escapeHtml(location)}</td>
        <td class="col-email">${client.email ? `<a href="mailto:${escapeHtml(client.email)}" onclick="event.stopPropagation()">${escapeHtml(client.email)}</a>` : ''}</td>
        <td class="col-phone">${escapeHtml(client.phone || '')}</td>
        <td class="col-street">${escapeHtml(street + streetNum)}</td>
        <td class="col-colonia">${escapeHtml(client.colonia || '')}</td>
        <td class="col-cp">${escapeHtml(postal)}</td>
      </tr>
    `;
  }).join('');
}

function setShippingView(mode) {
  shippingState.viewMode = mode;

  const cardsBtn = document.getElementById('view-cards-btn');
  const listBtn = document.getElementById('view-list-btn');
  if (cardsBtn) cardsBtn.classList.toggle('active', mode === 'cards');
  if (listBtn) listBtn.classList.toggle('active', mode === 'list');

  const cardsContainer = document.getElementById('shipping-cards-container');
  const listContainer = document.getElementById('shipping-list-container');

  if (mode === 'cards') {
    if (cardsContainer) cardsContainer.style.display = 'grid';
    if (listContainer) listContainer.style.display = 'none';
    renderShippingTable();
  } else {
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (listContainer) listContainer.style.display = '';
    renderShippingList();
  }
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

    // Build address display and plain text version for copying
    let addressHtml = '';
    let addressPlain = '';
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
      addressPlain = parts.join(', ');
    } else {
      addressHtml = '<span style="color: #f59e0b;">Sin direccion registrada</span>';
      addressPlain = '';
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
          <h3>${escapeHtml(client.name)} <span class="client-id-badge">#${client.id}</span></h3>
          <button class="client-popup-close" onclick="document.getElementById('client-detail-popup').remove()">&times;</button>
        </div>

        <div class="client-popup-body">
          <div class="client-popup-section">
            <h4>Direccion ${addressPlain ? `<button class="copy-btn" onclick="copyToClipboard('${addressPlain.replace(/'/g, "\\'")}', this)" title="Copiar dirección">📋</button>` : ''}</h4>
            <div class="client-popup-address">${addressHtml}</div>
          </div>

          <div class="client-popup-section">
            <h4>Contacto</h4>
            <div class="client-popup-info-grid">
              ${client.phone ? `
                <div class="client-popup-info-item">
                  <div class="client-popup-info-label">Telefono <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(client.phone)}', this)" title="Copiar teléfono">📋</button></div>
                  <div class="client-popup-info-value">
                    ${escapeHtml(client.phone)}
                    <a href="https://wa.me/52${client.phone.replace(/\D/g, '')}" target="_blank" style="margin-left: 8px; color: #25D366;">WhatsApp</a>
                  </div>
                </div>
              ` : ''}
              ${client.email ? `
                <div class="client-popup-info-item">
                  <div class="client-popup-info-label">Email <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(client.email)}', this)" title="Copiar email">📋</button></div>
                  <div class="client-popup-info-value">
                    <a href="mailto:${escapeHtml(client.email)}">${escapeHtml(client.email)}</a>
                  </div>
                </div>
              ` : ''}
              ${client.reference_notes ? `
                <div class="client-popup-info-item full-width">
                  <div class="client-popup-info-label">Referencias <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(client.reference_notes).replace(/'/g, "\\'")}', this)" title="Copiar referencias">📋</button></div>
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
          ${hasFullAddress ? `
          <button class="client-popup-btn shipping" onclick="showShippingQuoteModal(${client.id}, '${escapeHtml(client.name).replace(/'/g, "\\'")}', '${escapeHtml(client.city || '')}', '${escapeHtml(client.state || '')}', '${postal}')">
            📦 Generar Guías
          </button>
          ` : ''}
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

// ==========================================
// SELECT / MULTI-SELECT
// ==========================================

function toggleSelectMode() {
  shippingState.selectMode = !shippingState.selectMode;
  shippingState.selectedIds.clear();

  const btn = document.getElementById('select-mode-btn');
  if (btn) {
    btn.classList.toggle('active', shippingState.selectMode);
    btn.innerHTML = shippingState.selectMode ? '✕ Cancelar' : '☑ Seleccionar';
  }

  // Show/hide list view select column
  const listSelectCol = document.getElementById('list-select-col');
  if (listSelectCol) listSelectCol.style.display = shippingState.selectMode ? '' : 'none';

  updateBulkActionBar();

  if (shippingState.viewMode === 'list') {
    renderShippingList();
  } else {
    renderShippingTable();
  }
}

function toggleSelectClient(clientId) {
  if (shippingState.selectedIds.has(clientId)) {
    shippingState.selectedIds.delete(clientId);
  } else {
    shippingState.selectedIds.add(clientId);
  }

  // Update just the clicked card without full re-render
  const cards = document.querySelectorAll('.address-card');
  cards.forEach(card => {
    const checkbox = card.querySelector('input[type="checkbox"]');
    if (checkbox) {
      const onclickStr = card.getAttribute('onclick') || '';
      const match = onclickStr.match(/toggleSelectClient\((\d+)\)/);
      if (match && parseInt(match[1]) === clientId) {
        const isNowSelected = shippingState.selectedIds.has(clientId);
        card.classList.toggle('selected', isNowSelected);
        checkbox.checked = isNowSelected;
      }
    }
  });

  updateSelectAllCheckbox();
  updateBulkActionBar();
}

function toggleSelectAll() {
  const allOnPage = shippingState.filteredClients.map(c => c.id);
  const allSelected = allOnPage.every(id => shippingState.selectedIds.has(id));

  if (allSelected) {
    allOnPage.forEach(id => shippingState.selectedIds.delete(id));
  } else {
    allOnPage.forEach(id => shippingState.selectedIds.add(id));
  }

  updateSelectAllCheckbox();
  updateBulkActionBar();

  if (shippingState.viewMode === 'list') {
    renderShippingList();
  } else {
    renderShippingTable();
  }
}

function updateSelectAllCheckbox() {
  const allOnPage = shippingState.filteredClients.map(c => c.id);
  const selectedCount = allOnPage.filter(id => shippingState.selectedIds.has(id)).length;
  const isAll = selectedCount === allOnPage.length && allOnPage.length > 0;
  const isPartial = selectedCount > 0 && selectedCount < allOnPage.length;

  // Sync both checkboxes (bulk bar + list header)
  ['select-all-checkbox', 'list-select-all-checkbox'].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) {
      cb.checked = isAll;
      cb.indeterminate = isPartial;
    }
  });
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulk-action-bar');
  if (!bar) return;

  const count = shippingState.selectedIds.size;

  if (shippingState.selectMode && count > 0) {
    bar.classList.remove('hidden');
    const countEl = document.getElementById('bulk-selected-count');
    if (countEl) countEl.textContent = `${count} cliente${count > 1 ? 's' : ''}`;
  } else {
    bar.classList.add('hidden');
  }
}

function getSelectedClients() {
  return shippingState.filteredClients.filter(c => shippingState.selectedIds.has(c.id));
}

// ---- Bulk Actions ----

function bulkExportCSV() {
  const selected = getSelectedClients();
  if (selected.length === 0) return;

  const headers = ['Nombre', 'Telefono', 'Email', 'Calle', 'Num. Ext', 'Colonia', 'Ciudad', 'Estado', 'C.P.', 'Referencias'];
  const rows = selected.map(c => [
    c.name || '',
    c.phone || '',
    c.email || '',
    c.street || '',
    c.street_number || '',
    c.colonia || '',
    c.city || '',
    c.state || '',
    c.postal_code || c.postal || '',
    c.reference_notes || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `clientes_seleccionados_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showNotification(`${selected.length} clientes exportados a CSV`, 'success');
}

async function bulkDelete() {
  const selected = getSelectedClients();
  if (selected.length === 0) return;

  const names = selected.slice(0, 3).map(c => c.name).join(', ');
  const extra = selected.length > 3 ? ` y ${selected.length - 3} mas` : '';
  const confirmed = confirm(`Eliminar ${selected.length} cliente${selected.length > 1 ? 's' : ''}?\n\n${names}${extra}\n\nEsta accion no se puede deshacer.`);

  if (!confirmed) return;

  let deleted = 0;
  let errors = 0;

  for (const client of selected) {
    try {
      const response = await fetch(`${API_BASE}/clients/${client.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (response.ok) deleted++;
      else errors++;
    } catch (e) {
      errors++;
    }
  }

  shippingState.selectedIds.clear();
  updateBulkActionBar();

  if (errors > 0) {
    showNotification(`${deleted} eliminados, ${errors} errores`, 'warning');
  } else {
    showNotification(`${deleted} clientes eliminados`, 'success');
  }

  loadShippingData();
}

async function bulkGenerateLabels() {
  const selected = getSelectedClients();
  if (selected.length === 0) return;

  // Filter to only clients with complete addresses
  const withAddress = selected.filter(c => c.street && c.city && c.state && (c.postal_code || c.postal));

  if (withAddress.length === 0) {
    showNotification('Ninguno de los clientes seleccionados tiene direccion completa', 'warning');
    return;
  }

  if (withAddress.length < selected.length) {
    const skip = selected.length - withAddress.length;
    showNotification(`${skip} cliente${skip > 1 ? 's' : ''} sin direccion completa - se omitiran`, 'info');
  }

  // Generate labels PDF for selected clients
  try {
    const response = await fetch(`${API_BASE}/shipping/labels/bulk`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ clientIds: withAddress.map(c => c.id) })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al generar etiquetas');
    }

    const result = await response.json();

    if (result.success && result.pdfUrl) {
      window.open(result.pdfUrl, '_blank');
      showNotification(`Etiquetas generadas para ${withAddress.length} clientes`, 'success');
    } else {
      throw new Error(result.error || 'Error desconocido');
    }
  } catch (error) {
    console.error('Bulk labels error:', error);
    showNotification('Error al generar etiquetas: ' + error.message, 'error');
  }
}

// ==========================================
// AUTO-COMPLETE ADDRESSES
// ==========================================

/**
 * Silently auto-complete missing city/state/colonia from postal codes.
 * Runs in background on first tab load - no UI interruption.
 */
async function silentAutoComplete() {
  try {
    const response = await fetch(`${API_BASE}/clients/autocomplete-addresses`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!response.ok) return;

    const result = await response.json();

    if (result.success && result.updated > 0) {
      console.log(`Auto-completed ${result.updated} clients from postal codes`);
      // Silently reload data to reflect updates
      loadShippingData();
    }
  } catch (error) {
    console.error('Silent auto-complete error:', error);
  }
}

async function autoCompleteAddresses() {
  const btn = document.getElementById('autocomplete-btn');
  if (!btn) return;

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Completando...';

  try {
    const response = await fetch(`${API_BASE}/clients/autocomplete-addresses`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to auto-complete');

    const result = await response.json();

    if (result.success) {
      if (result.updated > 0) {
        showNotification(`${result.updated} clientes actualizados con datos de CP`, 'success');
        loadShippingData();
      } else {
        showNotification('No hay clientes para auto-completar', 'info');
      }
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Auto-complete error:', error);
    showNotification('Error al auto-completar: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ==========================================
// SHIPPING QUOTE MODAL
// ==========================================

let shippingQuoteState = {
  clientId: null,
  clientName: '',
  packagesCount: 1,
  quotationId: null,
  rates: [],
  selectedRate: null
};

/**
 * Show shipping quote modal for a client
 */
function showShippingQuoteModal(clientId, clientName, city, state, postal) {
  // Reset state
  shippingQuoteState = {
    clientId,
    clientName,
    city,
    state,
    postal,
    packagesCount: 1,
    quotationId: null,
    rates: [],
    selectedRate: null
  };

  // Remove existing modal
  const existing = document.getElementById('shipping-quote-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'shipping-quote-modal';
  modal.className = 'shipping-quote-overlay';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="shipping-quote-content">
      <div class="shipping-quote-header">
        <h3>📦 Generar Guías</h3>
        <button class="shipping-quote-close" onclick="document.getElementById('shipping-quote-modal').remove()">&times;</button>
      </div>

      <div class="shipping-quote-body">
        <div class="shipping-quote-client-info">
          <div class="shipping-quote-client-name">${escapeHtml(clientName)}</div>
          <div class="shipping-quote-client-location">📍 ${escapeHtml(city || '')}, ${escapeHtml(state || '')} CP ${escapeHtml(postal || '')}</div>
        </div>

        <div class="shipping-quote-input-section">
          <label>¿Cuántas cajas enviarás?</label>
          <div class="shipping-quote-counter">
            <button type="button" class="counter-btn minus" onclick="updatePackagesCount(-1)">−</button>
            <input type="number" id="packages-count-input" value="1" min="1" max="20" onchange="updatePackagesCountInput(this.value)">
            <button type="button" class="counter-btn plus" onclick="updatePackagesCount(1)">+</button>
          </div>
        </div>

        <button class="shipping-quote-btn primary" id="quote-btn" onclick="fetchShippingQuotesUI()">
          🔍 Cotizar Envío
        </button>

        <div id="shipping-rates-container" class="shipping-rates-container hidden">
          <div class="shipping-rates-header">Opciones de envío:</div>
          <div id="shipping-rates-list" class="shipping-rates-list"></div>
        </div>

        <div id="shipping-generate-section" class="shipping-generate-section hidden">
          <button class="shipping-quote-btn success" id="generate-btn" onclick="generateClientLabelUI()">
            ✅ Generar Guía
          </button>
        </div>

        <div id="shipping-result-section" class="shipping-result-section hidden">
          <div class="shipping-result-success">
            <span class="shipping-result-icon">✅</span>
            <span class="shipping-result-text">¡Guía generada exitosamente!</span>
          </div>
          <div id="shipping-result-details" class="shipping-result-details"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

/**
 * Update packages count
 */
function updatePackagesCount(delta) {
  const input = document.getElementById('packages-count-input');
  let newVal = parseInt(input.value) + delta;
  newVal = Math.max(1, Math.min(20, newVal));
  input.value = newVal;
  shippingQuoteState.packagesCount = newVal;

  // Clear previous quotes when count changes
  clearQuoteResults();
}

function updatePackagesCountInput(value) {
  let newVal = parseInt(value) || 1;
  newVal = Math.max(1, Math.min(20, newVal));
  document.getElementById('packages-count-input').value = newVal;
  shippingQuoteState.packagesCount = newVal;
  clearQuoteResults();
}

function clearQuoteResults() {
  document.getElementById('shipping-rates-container')?.classList.add('hidden');
  document.getElementById('shipping-generate-section')?.classList.add('hidden');
  shippingQuoteState.rates = [];
  shippingQuoteState.selectedRate = null;
}

/**
 * Fetch shipping quotes from API
 */
async function fetchShippingQuotesUI() {
  const btn = document.getElementById('quote-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Cotizando...';
  btn.disabled = true;

  try {
    const { clientId, packagesCount } = shippingQuoteState;

    const response = await fetch(`${API_BASE}/shipping/clients/${clientId}/quotes?packagesCount=${packagesCount}`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al obtener cotizaciones');
    }

    shippingQuoteState.quotationId = result.quotation_id;
    shippingQuoteState.rates = result.rates;

    // Render rates
    renderShippingRates(result.rates);

  } catch (error) {
    console.error('Error fetching quotes:', error);
    showNotification(error.message || 'Error al cotizar', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/**
 * Render shipping rates in the modal
 */
function renderShippingRates(rates) {
  const container = document.getElementById('shipping-rates-container');
  const list = document.getElementById('shipping-rates-list');

  if (!rates || rates.length === 0) {
    list.innerHTML = '<div class="no-rates">No hay opciones disponibles para este destino</div>';
    container.classList.remove('hidden');
    return;
  }

  list.innerHTML = rates.map((rate, index) => `
    <div class="carrier-option ${index === 0 ? 'cheapest' : ''}"
         onclick="selectShippingRate(${index})"
         data-rate-index="${index}">
      <div class="carrier-option-main">
        <div class="carrier-name">${escapeHtml(rate.carrier)}</div>
        <div class="carrier-service">${escapeHtml(rate.service)}</div>
      </div>
      <div class="carrier-option-details">
        <div class="carrier-price">${rate.priceFormatted}</div>
        <div class="carrier-days">${rate.daysText}</div>
      </div>
      ${index === 0 ? '<span class="cheapest-badge">Más económico</span>' : ''}
    </div>
  `).join('');

  container.classList.remove('hidden');
}

/**
 * Select a shipping rate
 */
function selectShippingRate(index) {
  const rate = shippingQuoteState.rates[index];
  shippingQuoteState.selectedRate = rate;

  // Update UI
  document.querySelectorAll('.carrier-option').forEach(el => el.classList.remove('selected'));
  document.querySelector(`[data-rate-index="${index}"]`)?.classList.add('selected');

  // Show generate button
  document.getElementById('shipping-generate-section')?.classList.remove('hidden');
}

/**
 * Generate shipping label
 */
async function generateClientLabelUI() {
  const btn = document.getElementById('generate-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Generando...';
  btn.disabled = true;

  try {
    const { clientId, packagesCount, quotationId, selectedRate } = shippingQuoteState;

    if (!selectedRate) {
      throw new Error('Selecciona una opción de envío');
    }

    const response = await fetch(`${API_BASE}/shipping/clients/${clientId}/generate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        labelsCount: packagesCount,
        quotationId: quotationId,
        rateId: selectedRate.rate_id,
        selectedRate: {
          rate_id: selectedRate.rate_id,
          carrier: selectedRate.carrier,
          service: selectedRate.service,
          total_price: selectedRate.price,
          days: selectedRate.days
        }
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al generar guía');
    }

    // Show success
    showShippingResult(result);

  } catch (error) {
    console.error('Error generating label:', error);
    showNotification(error.message || 'Error al generar guía', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/**
 * Show shipping generation result
 */
function showShippingResult(result) {
  // Hide quote sections
  document.querySelector('.shipping-quote-input-section')?.classList.add('hidden');
  document.getElementById('quote-btn')?.classList.add('hidden');
  document.getElementById('shipping-rates-container')?.classList.add('hidden');
  document.getElementById('shipping-generate-section')?.classList.add('hidden');

  // Show result section
  const resultSection = document.getElementById('shipping-result-section');
  const resultDetails = document.getElementById('shipping-result-details');

  const labels = result.labels || [];
  const firstLabel = labels[0] || {};

  resultDetails.innerHTML = `
    <div class="result-detail">
      <span class="result-label">Paquetería:</span>
      <span class="result-value">${escapeHtml(firstLabel.carrier || '')} - ${escapeHtml(firstLabel.service || '')}</span>
    </div>
    <div class="result-detail">
      <span class="result-label">Guías generadas:</span>
      <span class="result-value">${labels.length}</span>
    </div>
    ${firstLabel.tracking_number ? `
    <div class="result-detail">
      <span class="result-label">Rastreo:</span>
      <span class="result-value">${escapeHtml(firstLabel.tracking_number)}</span>
    </div>
    ` : ''}
    <div class="result-detail">
      <span class="result-label">Tiempo de entrega:</span>
      <span class="result-value">${firstLabel.delivery_days || '?'} día(s)</span>
    </div>
    ${firstLabel.label_url ? `
    <a href="${firstLabel.label_url}" target="_blank" class="shipping-quote-btn primary" style="margin-top: 16px; display: inline-block; text-decoration: none;">
      🏷️ Descargar Etiqueta
    </a>
    ` : '<p style="margin-top: 16px; color: #f59e0b;">La etiqueta estará disponible en unos momentos.</p>'}
  `;

  resultSection.classList.remove('hidden');

  showNotification('¡Guía generada exitosamente!', 'success');
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
window.autoCompleteAddresses = autoCompleteAddresses;
window.toggleSelectMode = toggleSelectMode;
window.toggleSelectClient = toggleSelectClient;
window.toggleSelectAll = toggleSelectAll;
window.bulkExportCSV = bulkExportCSV;
window.bulkDelete = bulkDelete;
window.bulkGenerateLabels = bulkGenerateLabels;
window.setShippingView = setShippingView;
window.showShippingQuoteModal = showShippingQuoteModal;
window.updatePackagesCount = updatePackagesCount;
window.updatePackagesCountInput = updatePackagesCountInput;
window.fetchShippingQuotesUI = fetchShippingQuotesUI;
window.selectShippingRate = selectShippingRate;
window.generateClientLabelUI = generateClientLabelUI;
window.copyToClipboard = copyToClipboard;

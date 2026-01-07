/**
 * Shipping / Clients Database Module
 * Notion-like database view for client addresses
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
    state: null,
    hasAddress: null
  },
  searchQuery: '',
  sortColumn: 'name',
  sortDirection: 'asc',
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 50,
  stats: {
    total_clients: 0,
    with_address: 0,
    unique_cities: 0
  }
};

// ==========================================
// INITIALIZATION
// ==========================================

// Load shipping data when view is activated
document.addEventListener('DOMContentLoaded', () => {
  // Listen for navigation to shipping view
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
  const tableContainer = document.querySelector('.shipping-table-container');
  const emptyState = document.getElementById('shipping-empty-state');

  if (loading) loading.classList.remove('hidden');
  if (tableContainer) tableContainer.style.display = 'none';
  if (emptyState) emptyState.classList.add('hidden');

  try {
    const params = new URLSearchParams({
      page: shippingState.currentPage,
      limit: shippingState.itemsPerPage
    });

    if (shippingState.searchQuery) {
      params.append('search', shippingState.searchQuery);
    }
    if (shippingState.activeFilters.city) {
      params.append('city', shippingState.activeFilters.city);
    }
    if (shippingState.activeFilters.state) {
      params.append('state', shippingState.activeFilters.state);
    }
    if (shippingState.activeFilters.hasAddress !== null) {
      params.append('hasAddress', shippingState.activeFilters.hasAddress);
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

      renderShippingStats();
      renderShippingTable();
      renderPagination();

      if (result.data.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (tableContainer) tableContainer.style.display = 'none';
      } else {
        if (tableContainer) tableContainer.style.display = 'block';
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

function renderShippingStats() {
  const totalEl = document.getElementById('total-clients');
  const withAddressEl = document.getElementById('clients-with-address');
  const citiesEl = document.getElementById('unique-cities');

  if (totalEl) totalEl.textContent = shippingState.stats.total_clients || 0;
  if (withAddressEl) withAddressEl.textContent = shippingState.stats.with_address || 0;
  if (citiesEl) citiesEl.textContent = shippingState.stats.unique_cities || 0;
}

function renderShippingTable() {
  const tbody = document.getElementById('shipping-table-body');
  if (!tbody) return;

  // Sort clients
  const sorted = [...shippingState.filteredClients].sort((a, b) => {
    let aVal = a[shippingState.sortColumn] || '';
    let bVal = b[shippingState.sortColumn] || '';

    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();

    if (aVal < bVal) return shippingState.sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return shippingState.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(client => `
    <tr data-id="${client.id}">
      <td class="cell-name">
        <div class="client-name-cell">
          <span class="client-name">${escapeHtml(client.name)}</span>
          ${client.order_count > 0 ? `<span class="order-badge">${client.order_count} pedidos</span>` : ''}
        </div>
      </td>
      <td class="cell-phone">
        ${client.phone ? `
          <div class="phone-cell">
            <span>${escapeHtml(client.phone)}</span>
            <a href="https://wa.me/52${client.phone.replace(/\D/g, '')}" target="whatsapp-chat" class="whatsapp-btn" title="WhatsApp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              </svg>
            </a>
          </div>
        ` : '<span class="empty-cell">—</span>'}
      </td>
      <td class="cell-email">
        ${client.email ? `<a href="mailto:${escapeHtml(client.email)}" class="email-link">${escapeHtml(client.email)}</a>` : '<span class="empty-cell">—</span>'}
      </td>
      <td class="cell-address">
        ${client.address ? `<span class="address-text">${escapeHtml(client.address)}</span>` : '<span class="empty-cell">Sin dirección</span>'}
      </td>
      <td class="cell-city">
        ${client.city ? `<span class="city-tag">${escapeHtml(client.city)}</span>` : '<span class="empty-cell">—</span>'}
      </td>
      <td class="cell-state">
        ${client.state ? escapeHtml(client.state) : '<span class="empty-cell">—</span>'}
      </td>
      <td class="cell-actions">
        <button class="action-btn edit-btn" onclick="editClient(${client.id})" title="Editar">
          ✏️
        </button>
        <button class="action-btn view-btn" onclick="viewClientOrders(${client.id})" title="Ver pedidos">
          📦
        </button>
      </td>
    </tr>
  `).join('');

  // Update sort icons
  updateSortIcons();
}

function renderPagination() {
  const paginationInfo = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');

  if (paginationInfo) {
    paginationInfo.textContent = `Página ${shippingState.currentPage} de ${shippingState.totalPages}`;
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
        <button onclick="removeShippingFilter('city')" class="remove-filter">×</button>
      </span>
    `);
  }

  if (shippingState.activeFilters.state) {
    filters.push(`
      <span class="active-filter-tag">
        Estado: ${escapeHtml(shippingState.activeFilters.state)}
        <button onclick="removeShippingFilter('state')" class="remove-filter">×</button>
      </span>
    `);
  }

  if (shippingState.activeFilters.hasAddress !== null) {
    filters.push(`
      <span class="active-filter-tag">
        ${shippingState.activeFilters.hasAddress === 'true' ? 'Con dirección' : 'Sin dirección'}
        <button onclick="removeShippingFilter('hasAddress')" class="remove-filter">×</button>
      </span>
    `);
  }

  container.innerHTML = filters.join('');
}

// ==========================================
// SEARCH & FILTERS
// ==========================================

function handleShippingSearch(value) {
  shippingState.searchQuery = value;
  shippingState.currentPage = 1;

  // Show/hide clear button
  const clearBtn = document.getElementById('shipping-search-clear');
  if (clearBtn) {
    clearBtn.style.display = value ? 'block' : 'none';
  }

  // Debounce search
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

  // If already showing same filter, close it
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
  } else if (filterType === 'hasAddress') {
    html = `
      <div class="filter-header">Filtrar por Dirección</div>
      <div class="filter-options">
        <label class="filter-option">
          <input type="radio" name="address-filter" value="true"
            ${shippingState.activeFilters.hasAddress === 'true' ? 'checked' : ''}
            onchange="applyShippingFilter('hasAddress', 'true')"
          >
          Con dirección
        </label>
        <label class="filter-option">
          <input type="radio" name="address-filter" value="false"
            ${shippingState.activeFilters.hasAddress === 'false' ? 'checked' : ''}
            onchange="applyShippingFilter('hasAddress', 'false')"
          >
          Sin dirección
        </label>
      </div>
      <button class="filter-clear-btn" onclick="removeShippingFilter('hasAddress')">Limpiar filtro</button>
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
// SORTING
// ==========================================

function sortShippingTable(column) {
  if (shippingState.sortColumn === column) {
    shippingState.sortDirection = shippingState.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    shippingState.sortColumn = column;
    shippingState.sortDirection = 'asc';
  }

  renderShippingTable();
}

function updateSortIcons() {
  document.querySelectorAll('.sort-icon').forEach(icon => {
    const col = icon.dataset.col;
    if (col === shippingState.sortColumn) {
      icon.textContent = shippingState.sortDirection === 'asc' ? '▲' : '▼';
      icon.classList.add('active');
    } else {
      icon.textContent = '';
      icon.classList.remove('active');
    }
  });
}

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

  // Reset form
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

    if (!modal) return;

    // Populate form
    document.getElementById('client_id').value = client.id;
    document.getElementById('client_name').value = client.name || '';
    document.getElementById('client_phone').value = client.phone || '';
    document.getElementById('client_email').value = client.email || '';
    document.getElementById('client_address').value = client.address || '';
    document.getElementById('client_city').value = client.city || '';
    document.getElementById('client_state').value = client.state || '';
    document.getElementById('client_postal_code').value = client.postal_code || '';

    if (title) title.textContent = 'Editar Cliente';

    modal.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading client:', error);
    showNotification('Error al cargar cliente', 'error');
  }
}

async function saveClient(event) {
  event.preventDefault();

  const form = event.target;
  const clientId = document.getElementById('client_id').value;

  const data = {
    name: document.getElementById('client_name').value,
    phone: document.getElementById('client_phone').value || null,
    email: document.getElementById('client_email').value || null,
    address: document.getElementById('client_address').value || null,
    city: document.getElementById('client_city').value || null,
    state: document.getElementById('client_state').value || null,
    postal_code: document.getElementById('client_postal_code').value || null
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
  // This could open a modal or navigate to orders filtered by client
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

    // Show a simple alert with orders list (can be enhanced to a modal)
    const ordersList = orders.map(o =>
      `• ${o.orderNumber} - $${parseFloat(o.totalPrice || 0).toFixed(2)} - ${o.status}`
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

  const headers = ['Nombre', 'Teléfono', 'Email', 'Dirección', 'Ciudad', 'Estado', 'C.P.', 'Pedidos'];
  const rows = clients.map(c => [
    c.name || '',
    c.phone || '',
    c.email || '',
    c.address || '',
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
// UTILITIES
// ==========================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  // Use existing notification system if available
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }

  // Simple fallback
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
// CSV IMPORT
// ==========================================

let pendingImportClients = [];

/**
 * Trigger file input for CSV import
 */
function triggerImportCSV() {
  document.getElementById('csv-import-input').click();
}

/**
 * Handle CSV file selection and parse
 */
async function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset input so same file can be selected again
  event.target.value = '';

  showNotification('Leyendo archivo CSV...', 'info');

  try {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      showNotification('El archivo CSV está vacío o no tiene datos', 'error');
      return;
    }

    // Parse header row
    const headers = parseCSVLine(lines[0]);

    // Map headers to our expected format (Notion delivery form)
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

    // Parse data rows
    const clients = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const client = {};
      headers.forEach((header, index) => {
        const key = headerMap[header] || header.toLowerCase().replace(/\s+/g, '_');
        client[key] = values[index] || '';
      });

      // Only add if has a name
      if (client.name && client.name.trim()) {
        clients.push(client);
      }
    }

    if (clients.length === 0) {
      showNotification('No se encontraron clientes válidos en el CSV', 'error');
      return;
    }

    pendingImportClients = clients;
    showImportConfirmModal(clients);

  } catch (error) {
    console.error('CSV parse error:', error);
    showNotification('Error al leer el archivo CSV', 'error');
  }
}

/**
 * Parse a CSV line handling quoted values
 */
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

/**
 * Show import confirmation modal
 */
function showImportConfirmModal(clients) {
  // Remove existing modal if any
  const existing = document.getElementById('import-confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'import-confirm-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>📤 Importar Clientes</h3>
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
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Teléfono</th>
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
                    ... y ${clients.length - 5} más
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e;">
          <strong>Nota:</strong> Los clientes duplicados (mismo teléfono o nombre+CP) serán omitidos automáticamente.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeImportModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="executeClientImport()">
          🚀 Importar ${clients.length} Clientes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add styles if not exists
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

/**
 * Close import modal
 */
function closeImportModal() {
  const modal = document.getElementById('import-confirm-modal');
  if (modal) modal.remove();
  pendingImportClients = [];
}

/**
 * Execute the import via API
 */
async function executeClientImport() {
  if (pendingImportClients.length === 0) return;

  const modal = document.getElementById('import-confirm-modal');
  const importBtn = modal?.querySelector('.btn-primary');

  if (importBtn) {
    importBtn.disabled = true;
    importBtn.innerHTML = '⏳ Importando...';
  }

  try {
    const token = localStorage.getItem('admin_token');

    // Send in batches
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

      // Update progress
      if (importBtn) {
        const progress = Math.round((i + batch.length) / pendingImportClients.length * 100);
        importBtn.innerHTML = `⏳ ${progress}%...`;
      }
    }

    closeImportModal();

    // Show results
    showNotification(
      `✅ Importados: ${totalImported} | Omitidos: ${totalSkipped} | Errores: ${totalErrors}`,
      totalErrors > 0 ? 'warning' : 'success'
    );

    // Refresh the clients list
    loadShippingData();

  } catch (error) {
    console.error('Import error:', error);
    showNotification('Error al importar: ' + error.message, 'error');

    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = `🚀 Importar ${pendingImportClients.length} Clientes`;
    }
  }
}

// Export functions globally
window.triggerImportCSV = triggerImportCSV;
window.handleCSVImport = handleCSVImport;
window.closeImportModal = closeImportModal;
window.executeClientImport = executeClientImport;

/**
 * Guías Management Module
 * Handles shipping labels/guías display and management
 */

// State
let guiasData = [];
let guiasCurrentPage = 1;
let guiasTotalPages = 1;
let guiasCurrentStatus = 'all';
let guiasSearchQuery = '';

// API URL
const GUIAS_API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api/shipping'
  : 'https://vt-souvenir-backend.onrender.com/api/shipping';

/**
 * Initialize guías view
 */
function initGuiasView() {
  loadGuias();
}

/**
 * Load guías from API
 */
async function loadGuias(page = 1) {
  guiasCurrentPage = page;

  const tableBody = document.getElementById('guias-table-body');
  tableBody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; padding: 40px; color: #6b7280;">
        <div style="display: inline-block; width: 24px; height: 24px; border: 3px solid #e5e7eb; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 8px;">Cargando guías...</div>
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      page: page,
      limit: 50
    });

    if (guiasCurrentStatus && guiasCurrentStatus !== 'all') {
      params.append('status', guiasCurrentStatus);
    }

    if (guiasSearchQuery) {
      params.append('search', guiasSearchQuery);
    }

    const response = await fetch(`${GUIAS_API_URL}/labels?${params}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading guías');
    }

    guiasData = result.labels;
    guiasTotalPages = result.pagination.totalPages;

    // Update stats
    updateGuiasStats(result.stats);

    // Render table
    renderGuiasTable();

    // Update pagination
    updateGuiasPagination(result.pagination);

  } catch (error) {
    console.error('Error loading guías:', error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: #dc2626;">
          Error al cargar guías: ${error.message}
        </td>
      </tr>
    `;
  }
}

/**
 * Update stats display
 */
function updateGuiasStats(stats) {
  document.getElementById('guias-total').textContent = stats.total_labels || 0;
  document.getElementById('guias-generated').textContent = stats.generated || 0;
  document.getElementById('guias-shipped').textContent = stats.shipped || 0;
  document.getElementById('guias-delivered').textContent = stats.delivered || 0;
}

/**
 * Render guías table
 */
function renderGuiasTable() {
  const tableBody = document.getElementById('guias-table-body');
  const emptyState = document.getElementById('guias-empty-state');
  const tableContainer = document.querySelector('#guias-view .shipping-table-container');

  if (guiasData.length === 0) {
    tableContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  tableContainer.classList.remove('hidden');
  emptyState.classList.add('hidden');

  tableBody.innerHTML = guiasData.map(guia => `
    <tr>
      <td>
        <a href="#" onclick="viewOrder(${guia.order_id}); return false;" style="color: #667eea; font-weight: 600;">
          ${guia.order_number || `#${guia.order_id}`}
        </a>
      </td>
      <td>
        <div style="font-weight: 500;">${guia.client_name || 'Sin nombre'}</div>
        <div style="font-size: 12px; color: #6b7280;">${guia.client_city || ''}, ${guia.client_state || ''}</div>
      </td>
      <td>
        ${guia.tracking_number ? `
          <div style="font-family: monospace; font-size: 13px; font-weight: 600; color: #1f2937;">
            ${guia.tracking_number}
          </div>
          ${guia.tracking_url ? `
            <a href="${guia.tracking_url}" target="_blank" rel="noopener" style="font-size: 11px; color: #667eea;">
              🔍 Rastrear
            </a>
          ` : ''}
        ` : `
          <span style="font-size: 12px; color: #f59e0b; font-style: italic;">Pendiente</span>
        `}
      </td>
      <td>
        <div style="font-weight: 500;">${guia.carrier || 'N/A'}</div>
        <div style="font-size: 12px; color: #6b7280;">${guia.service || ''}</div>
      </td>
      <td>
        <span style="font-weight: 600; color: ${guia.delivery_days <= 2 ? '#059669' : '#6b7280'};">
          ${guia.delivery_days || '?'} días
        </span>
      </td>
      <td>
        ${getStatusBadge(guia.status)}
      </td>
      <td>
        <div style="font-size: 13px;">${formatDate(guia.created_at)}</div>
      </td>
      <td>
        <div style="display: flex; gap: 8px;">
          ${guia.label_url ? `
            <a href="${guia.label_url}" target="_blank" rel="noopener"
               style="padding: 6px 10px; background: #f3f4f6; border-radius: 6px; font-size: 12px; color: #374151; text-decoration: none;">
              📄 PDF
            </a>
          ` : ''}
          <button onclick="updateGuiaStatus(${guia.id})"
                  style="padding: 6px 10px; background: #dbeafe; border: none; border-radius: 6px; font-size: 12px; color: #1e40af; cursor: pointer;">
            ✏️ Estado
          </button>
          <button onclick="refreshGuiaTracking(${guia.id})"
                  style="padding: 6px 10px; background: #dcfce7; border: none; border-radius: 6px; font-size: 12px; color: #166534; cursor: pointer;">
            🔄
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
  const badges = {
    'pending': { bg: '#fef3c7', color: '#92400e', text: '⏳ Pendiente' },
    'processing': { bg: '#dbeafe', color: '#1e40af', text: '⚙️ Procesando' },
    'label_generated': { bg: '#d1fae5', color: '#065f46', text: '📄 Generada' },
    'shipped': { bg: '#c7d2fe', color: '#3730a3', text: '🚚 Enviada' },
    'delivered': { bg: '#bbf7d0', color: '#166534', text: '✅ Entregada' },
    'cancelled': { bg: '#fee2e2', color: '#991b1b', text: '❌ Cancelada' }
  };

  const badge = badges[status] || { bg: '#f3f4f6', color: '#374151', text: status };

  return `<span style="display: inline-block; padding: 4px 10px; background: ${badge.bg}; color: ${badge.color}; font-size: 12px; font-weight: 600; border-radius: 12px;">${badge.text}</span>`;
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Update pagination
 */
function updateGuiasPagination(pagination) {
  const prevBtn = document.getElementById('guias-prev-page-btn');
  const nextBtn = document.getElementById('guias-next-page-btn');
  const info = document.getElementById('guias-pagination-info');

  prevBtn.disabled = pagination.page <= 1;
  nextBtn.disabled = pagination.page >= pagination.totalPages;

  info.textContent = `Página ${pagination.page} de ${pagination.totalPages}`;
}

/**
 * Go to page
 */
function goToGuiasPage(direction) {
  if (direction === 'prev' && guiasCurrentPage > 1) {
    loadGuias(guiasCurrentPage - 1);
  } else if (direction === 'next' && guiasCurrentPage < guiasTotalPages) {
    loadGuias(guiasCurrentPage + 1);
  }
}

/**
 * Filter by status
 */
function filterGuiasByStatus(status) {
  guiasCurrentStatus = status;

  // Update active button
  document.querySelectorAll('.guias-status-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });

  loadGuias(1);
}

/**
 * Search handler
 */
let guiasSearchTimeout;
function handleGuiasSearch(query) {
  clearTimeout(guiasSearchTimeout);

  const clearBtn = document.getElementById('guias-search-clear');
  clearBtn.style.display = query ? 'block' : 'none';

  guiasSearchTimeout = setTimeout(() => {
    guiasSearchQuery = query;
    loadGuias(1);
  }, 300);
}

/**
 * Clear search
 */
function clearGuiasSearch() {
  document.getElementById('guias-search-input').value = '';
  document.getElementById('guias-search-clear').style.display = 'none';
  guiasSearchQuery = '';
  loadGuias(1);
}

/**
 * Refresh guías
 */
function refreshGuias() {
  loadGuias(guiasCurrentPage);
}

/**
 * Update guía status
 */
async function updateGuiaStatus(guiaId) {
  const newStatus = prompt(
    'Selecciona el nuevo estado:\n\n' +
    '1. pending - Pendiente\n' +
    '2. processing - Procesando\n' +
    '3. label_generated - Generada\n' +
    '4. shipped - Enviada\n' +
    '5. delivered - Entregada\n' +
    '6. cancelled - Cancelada\n\n' +
    'Ingresa el número o nombre del estado:'
  );

  if (!newStatus) return;

  const statusMap = {
    '1': 'pending',
    '2': 'processing',
    '3': 'label_generated',
    '4': 'shipped',
    '5': 'delivered',
    '6': 'cancelled'
  };

  const status = statusMap[newStatus] || newStatus.toLowerCase();

  try {
    const response = await fetch(`${GUIAS_API_URL}/labels/${guiaId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error updating status');
    }

    alert('Estado actualizado exitosamente');
    loadGuias(guiasCurrentPage);

  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * Refresh tracking info from Skydropx
 */
async function refreshGuiaTracking(guiaId) {
  try {
    const response = await fetch(`${GUIAS_API_URL}/labels/${guiaId}/refresh`, {
      method: 'POST'
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error refreshing tracking');
    }

    alert('Información actualizada');
    loadGuias(guiasCurrentPage);

  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * Export to CSV
 */
function exportGuiasCSV() {
  if (guiasData.length === 0) {
    alert('No hay datos para exportar');
    return;
  }

  const headers = ['Orden', 'Cliente', 'Tracking', 'Paquetería', 'Servicio', 'Días', 'Estado', 'Fecha', 'URL Rastreo', 'URL PDF'];
  const rows = guiasData.map(g => [
    g.order_number || g.order_id,
    g.client_name || '',
    g.tracking_number || '',
    g.carrier || '',
    g.service || '',
    g.delivery_days || '',
    g.status || '',
    formatDate(g.created_at),
    g.tracking_url || '',
    g.label_url || ''
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `guias_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

// CSS for spin animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .filter-chip.active {
    background: #667eea !important;
    color: white !important;
  }
`;
document.head.appendChild(styleSheet);

// Export functions
window.initGuiasView = initGuiasView;
window.loadGuias = loadGuias;
window.goToGuiasPage = goToGuiasPage;
window.filterGuiasByStatus = filterGuiasByStatus;
window.handleGuiasSearch = handleGuiasSearch;
window.clearGuiasSearch = clearGuiasSearch;
window.refreshGuias = refreshGuias;
window.updateGuiaStatus = updateGuiaStatus;
window.refreshGuiaTracking = refreshGuiaTracking;
window.exportGuiasCSV = exportGuiasCSV;

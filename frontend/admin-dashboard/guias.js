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
async function initGuiasView() {
  // Auto-refresh stuck "processing" labels from Skydropx on view load
  try {
    await fetch(`${GUIAS_API_URL}/refresh-pending-tracking`, { method: 'POST' });
  } catch (err) {
    // Silently continue - the main load will still work
  }
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
        <div style="font-size: 13px;">${formatDateGuias(guia.created_at)}</div>
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
 * Format date for guias
 */
function formatDateGuias(dateStr) {
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
async function refreshGuias() {
  const btn = document.querySelector('#guias-view .btn-refresh, [onclick="refreshGuias()"]');
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '🔄 Actualizando pendientes...';
  }

  try {
    // First, refresh any stuck "processing" labels from Skydropx
    const response = await fetch(`${API_BASE}/api/shipping/refresh-pending-tracking`, {
      method: 'POST'
    });
    if (response.ok) {
      const data = await response.json();
      if (data.updated > 0) {
        console.log(`✅ ${data.updated} etiquetas actualizadas desde Skydropx`);
      }
    }
  } catch (err) {
    console.warn('Could not refresh pending tracking:', err);
  }

  // Then reload the guías list
  if (btn) {
    btn.textContent = originalText;
    btn.disabled = false;
  }
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
    formatDateGuias(g.created_at),
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

// ==========================================
// PICKUPS MODAL FUNCTIONALITY
// ==========================================

let pickupsCurrentDate = new Date().toISOString().split('T')[0];
let pickupsInitialized = false;

/**
 * Initialize pickups view
 */
function initPickupsView() {
  if (pickupsInitialized) {
    // Just refresh data
    loadPickupsForDate(pickupsCurrentDate);
    return;
  }

  // Set today's date
  const dateInput = document.getElementById('pickups-date-input');
  if (dateInput) {
    dateInput.value = pickupsCurrentDate;
  }

  // Load pickups data
  loadPickupsForDate(pickupsCurrentDate);
  pickupsInitialized = true;
}

/**
 * Change pickup date by days
 */
function changePickupDate(days) {
  const dateInput = document.getElementById('pickups-date-input');
  const currentDate = new Date(dateInput.value);
  currentDate.setDate(currentDate.getDate() + days);
  dateInput.value = currentDate.toISOString().split('T')[0];
  pickupsCurrentDate = dateInput.value;
  loadPickupsForDate(dateInput.value);
}

/**
 * Load pickups for specific date
 */
async function loadPickupsForDate(date) {
  const loadingEl = document.getElementById('pickups-loading');
  const contentEl = document.getElementById('pickups-content');
  const emptyEl = document.getElementById('pickups-empty');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  emptyEl.classList.add('hidden');

  try {
    const [pickupsResponse, pendingResponse] = await Promise.all([
      fetch(`${GUIAS_API_URL}/pickups/history?date=${date}`),
      fetch(`${GUIAS_API_URL}/pickups/pending`)
    ]);

    const pickupsResult = await pickupsResponse.json();
    const pendingResult = await pendingResponse.json();

    loadingEl.classList.add('hidden');

    const pickups = pickupsResult.success ? pickupsResult.pickups : [];
    const pendingLabels = pendingResult.success ? pendingResult.pending : [];

    // Show all active pickups (not cancelled), sorted by date descending
    const activePickups = pickups.filter(p => p.status !== 'cancelled');

    // Update summary pills
    document.getElementById('pickups-total-count').textContent = activePickups.length;
    document.getElementById('pickups-pending-count').textContent = pendingLabels.length;
    document.getElementById('pickups-shipments-count').textContent =
      activePickups.reduce((sum, p) => sum + (p.shipment_count || 0), 0);

    // If nothing at all
    if (activePickups.length === 0 && pendingLabels.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    contentEl.classList.remove('hidden');

    // --- Section A: Scheduled Pickups ---
    const tableEl = document.getElementById('pickups-table');
    const scheduledEmptyEl = document.getElementById('pickups-scheduled-empty');

    if (activePickups.length === 0) {
      tableEl.innerHTML = '';
      scheduledEmptyEl.classList.remove('hidden');
    } else {
      scheduledEmptyEl.classList.add('hidden');
      tableEl.innerHTML = activePickups.map(pickup => renderPickupRow(pickup)).join('');
    }

    // --- Section B: Pending Labels by Carrier ---
    const pendingContainer = document.getElementById('pickups-pending');
    const pendingList = document.getElementById('pending-carriers-list');
    const pendingEmptyEl = document.getElementById('pickups-pending-empty');

    if (pendingLabels.length === 0) {
      pendingList.innerHTML = '';
      pendingEmptyEl.classList.remove('hidden');
    } else {
      pendingEmptyEl.classList.add('hidden');
      pendingList.innerHTML = renderPendingLabelsSection(pendingLabels);
    }

  } catch (error) {
    console.error('Error loading pickups:', error);
    loadingEl.classList.add('hidden');
    const contentEl2 = document.getElementById('pickups-content');
    contentEl2.classList.remove('hidden');
    document.getElementById('pickups-table').innerHTML = `
      <div class="pickups-section-empty" style="color: #dc2626;">
        Error al cargar recolecciones: ${error.message}
      </div>
    `;
  }
}

/**
 * Render a single pickup as a compact row
 */
function renderPickupRow(pickup) {
  const carrier = pickup.carrier || 'Sin Asignar';
  const statusBadge = getPickupStatusBadgeClass(pickup.status);
  const timeFrom = pickup.pickup_time_from || '09:00';
  const timeTo = pickup.pickup_time_to || '18:00';
  const shipments = pickup.shipment_count || 0;
  const isCancelled = pickup.status === 'cancelled';
  const confirmationCode = pickup.confirmation_code || '';
  const isLocal = pickup.pickup_id && pickup.pickup_id.startsWith('local-');
  const pickupDateStr = pickup.pickup_date ? new Date(pickup.pickup_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '';

  return `
    <div class="pickup-row" data-carrier="${carrier}">
      <div class="pickup-row-carrier">
        <span class="pickup-carrier-icon">${getCarrierIcon(carrier)}</span>
        <span class="pickup-carrier-name">${carrier}</span>
      </div>
      <span class="pickup-row-status" style="background: ${statusBadge.bg}; color: ${statusBadge.color};">
        ${statusBadge.text}${isLocal && pickup.status !== 'confirmed' ? ' (local)' : ''}
      </span>
      <span class="pickup-row-date">${pickupDateStr}</span>
      <span class="pickup-row-time">${timeFrom} - ${timeTo}</span>
      <span class="pickup-row-shipments">${shipments} envio${shipments !== 1 ? 's' : ''}</span>
      <div class="pickup-row-confirmation">
        ${confirmationCode
          ? `<span class="confirmation-code" title="Codigo de confirmacion">${confirmationCode}</span>`
          : `<input type="text" class="confirmation-code-input"
                   placeholder="Codigo confirm."
                   data-pickup-id="${pickup.pickup_id}"
                   onkeydown="if(event.key==='Enter')saveConfirmationCode('${pickup.pickup_id}',this.value)"
                   ${isCancelled ? 'disabled' : ''} />`
        }
      </div>
      <div class="pickup-row-actions">
        ${!confirmationCode && !isCancelled ? `
          <button class="pickup-confirm-btn"
                  onclick="promptConfirmationCode('${pickup.pickup_id}')"
                  title="Confirmar con codigo">
            ✓
          </button>
        ` : ''}
        <button class="pickup-cancel-btn" onclick="cancelPickup('${pickup.pickup_id}')"
                title="Cancelar recoleccion" ${isCancelled ? 'disabled' : ''}>
          ✕
        </button>
      </div>
    </div>
  `;
}

/**
 * Get pickup status badge styles
 */
function getPickupStatusBadgeClass(status) {
  const badges = {
    'pending':   { bg: '#fef3c7', color: '#92400e', text: 'Pendiente' },
    'scheduled': { bg: '#e0e7ff', color: '#3730a3', text: 'Programado' },
    'requested': { bg: '#dbeafe', color: '#1e40af', text: 'Solicitado' },
    'confirmed': { bg: '#d1fae5', color: '#065f46', text: 'Confirmado' },
    'completed': { bg: '#bbf7d0', color: '#166534', text: 'Completado' },
    'cancelled': { bg: '#fee2e2', color: '#991b1b', text: 'Cancelado' }
  };
  return badges[status] || { bg: '#f3f4f6', color: '#374151', text: status || 'Desconocido' };
}

/**
 * Render pending labels grouped by carrier
 */
function renderPendingLabelsSection(pendingLabels) {
  // Group by carrier
  const byCarrier = {};
  pendingLabels.forEach(label => {
    const carrier = label.carrier || 'Sin Asignar';
    if (!byCarrier[carrier]) byCarrier[carrier] = [];
    byCarrier[carrier].push(label);
  });

  return Object.entries(byCarrier).map(([carrier, labels]) => `
    <div class="pending-carrier-group">
      <div class="pending-carrier-header" data-carrier="${carrier}">
        <span>${getCarrierIcon(carrier)}</span>
        <strong>${carrier}</strong>
        <span class="carrier-count">${labels.length} guia${labels.length !== 1 ? 's' : ''}</span>
        <button class="pending-request-btn" onclick="openPickupModal('${carrier}')">
          Solicitar
        </button>
      </div>
      <div class="pending-labels-list">
        ${labels.map(label => `
          <div class="pending-label-item">
            <span class="pending-label-order">${label.order_number || label.order_id || 'N/A'}</span>
            <span class="pending-label-tracking">${label.tracking_number || 'Sin tracking'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

/**
 * Get carrier icon
 */
function getCarrierIcon(carrier) {
  const icons = {
    'Estafeta': '📦',
    'FedEx': '✈️',
    'Paquetexpress': '🚛',
    'DHL': '🟡',
    'UPS': '📬',
    'Redpack': '📮'
  };
  return icons[carrier] || '📦';
}

/**
 * Format pickup date
 */
function formatPickupDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}

/**
 * Format pickup datetime
 */
function formatPickupDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Trigger pickups for all pending labels
 */
async function triggerPendingPickups() {
  if (!confirm('¿Solicitar recolección para todas las guías pendientes?')) {
    return;
  }

  try {
    const response = await fetch(`${GUIAS_API_URL}/pickups/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerAll: true })
    });

    const result = await response.json();

    if (result.success) {
      const summary = (result.results || []).map(r =>
        `${r.carrier}: ${r.success ? '✅' : '❌'} ${r.shipment_count} guias${r.local ? ' (local)' : ''}${r.error ? ' - ' + r.error : ''}`
      ).join('\n');
      alert(`✅ Recolecciones procesadas!\n\n${summary || 'Sin resultados'}`);
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert('Error: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * Cancel a pickup
 */
async function cancelPickup(pickupId) {
  if (!pickupId || !confirm('¿Cancelar esta recolección?')) {
    return;
  }

  try {
    const response = await fetch(`${GUIAS_API_URL}/pickups/${pickupId}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      alert('Recolección cancelada exitosamente');
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert('Error: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

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

// ==========================================
// CARRIER-SPECIFIC PICKUP MODAL
// ==========================================

const carrierConfig = {
  'Estafeta': { icon: '📦', color: '#f59e0b' },
  'Paquetexpress': { icon: '🚛', color: '#10b981' },
  'FedEx': { icon: '✈️', color: '#3b82f6' },
  'DHL': { icon: '🟡', color: '#ef4444' },
  'UPS': { icon: '📬', color: '#d97706' },
  'Redpack': { icon: '📮', color: '#8b5cf6' }
};

let pendingLabelsCache = [];

/**
 * Open pickup modal for specific carrier
 */
async function openPickupModal(carrier) {
  const modal = document.getElementById('pickup-request-modal');
  const config = carrierConfig[carrier] || { icon: '📦', color: '#667eea' };

  // Set carrier info
  document.getElementById('pickup-carrier').value = carrier;
  document.getElementById('pickup-modal-carrier-icon').textContent = config.icon;
  document.getElementById('pickup-modal-carrier-name').textContent = carrier;
  document.getElementById('pickup-modal-title').textContent = `Solicitar Recolección - ${carrier}`;

  // Set default date (next business day)
  const tomorrow = getNextBusinessDay();
  document.getElementById('pickup-date').value = tomorrow;
  document.getElementById('pickup-date').min = new Date().toISOString().split('T')[0];

  // Reset time fields
  document.getElementById('pickup-time-from').value = '09:00';
  document.getElementById('pickup-time-to').value = '18:00';

  // Reset submit button state
  const submitBtn = document.getElementById('pickup-submit-btn');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Solicitar Recoleccion';

  // Show modal first
  modal.classList.remove('hidden');

  // Load pending labels for this carrier
  await loadPendingLabelsForCarrier(carrier);
}

/**
 * Get next business day (skip weekends)
 */
function getNextBusinessDay() {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  // Skip Saturday (6) and Sunday (0)
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString().split('T')[0];
}

/**
 * Load pending labels for specific carrier
 */
async function loadPendingLabelsForCarrier(carrier) {
  const countEl = document.getElementById('pickup-pending-count');
  const listEl = document.getElementById('pickup-pending-list');
  const submitBtn = document.getElementById('pickup-submit-btn');

  countEl.textContent = '...';
  listEl.innerHTML = '<span class="pickup-modal-hint">Cargando...</span>';

  try {
    const response = await fetch(`${GUIAS_API_URL}/pickups/pending`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading pending labels');
    }

    // Filter by carrier
    const carrierLabels = result.pending.filter(label =>
      label.carrier && label.carrier.toLowerCase() === carrier.toLowerCase()
    );

    pendingLabelsCache = carrierLabels;

    // Update count
    countEl.textContent = carrierLabels.length;

    // Update list
    if (carrierLabels.length === 0) {
      listEl.innerHTML = '<span class="pickup-modal-hint">No hay guias pendientes para esta paqueteria.<br><strong>Puedes programar la recoleccion de todas formas.</strong></span>';
      submitBtn.textContent = 'Programar Recoleccion (sin guias)';
      submitBtn.disabled = false;
    } else {
      const labelsList = carrierLabels.slice(0, 5).map(l =>
        `<div class="pending-label-item">${l.order_number || l.order_id} — ${l.tracking_number || 'Sin tracking'}</div>`
      ).join('');

      const moreCount = carrierLabels.length > 5 ? `<div class="pending-label-item"><strong>+ ${carrierLabels.length - 5} mas</strong></div>` : '';

      listEl.innerHTML = labelsList + moreCount;
      submitBtn.textContent = `Solicitar Recoleccion (${carrierLabels.length} guias)`;
    }

  } catch (error) {
    console.error('Error loading pending labels:', error);
    countEl.textContent = '?';
    listEl.innerHTML = `<span class="pickup-modal-hint" style="color: #dc2626;">Error: ${error.message}</span>`;
  }
}

/**
 * Close pickup modal
 */
function closePickupModal() {
  const modal = document.getElementById('pickup-request-modal');
  modal.classList.add('hidden');
  pendingLabelsCache = [];
}

/**
 * Submit pickup request
 */
async function submitPickupRequest(event) {
  event.preventDefault();

  const carrier = document.getElementById('pickup-carrier').value;
  const pickupDate = document.getElementById('pickup-date').value;
  const timeFrom = document.getElementById('pickup-time-from').value;
  const timeTo = document.getElementById('pickup-time-to').value;

  const submitBtn = document.getElementById('pickup-submit-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = '⏳ Solicitando...';
  submitBtn.disabled = true;

  try {
    // Build request body
    const requestBody = {
      carrier: carrier,
      pickupDate: pickupDate,
      timeFrom: timeFrom,
      timeTo: timeTo
    };

    // If there are pending labels for this carrier, include them
    if (pendingLabelsCache.length > 0) {
      requestBody.shipmentIds = pendingLabelsCache.map(l => l.shipment_id);
    }

    const response = await fetch(`${GUIAS_API_URL}/pickups/request/carrier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    if (result.success) {
      // Show success message
      const pendingCount = pendingLabelsCache.length;
      const isLocal = result.local;
      const note = result.note;

      let message = `✅ ¡Recolección ${isLocal ? 'programada' : 'solicitada'} exitosamente!\n\n` +
        `📦 Paquetería: ${carrier}\n` +
        `📅 Fecha: ${pickupDate}\n` +
        `🕐 Horario: ${timeFrom} - ${timeTo}\n` +
        `📋 Guías incluidas: ${pendingCount}\n` +
        `🎫 Pickup ID: ${result.pickup_id || 'N/A'}`;

      if (isLocal) {
        message += `\n\n📝 Guardado localmente`;
      }
      if (note) {
        message += `\n\n⚠️ ${note}`;
      }

      alert(message);

      closePickupModal();

      // Refresh pickups view
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert(`❌ Error: ${result.error || 'Error desconocido'}`);
    }

  } catch (error) {
    console.error('Error requesting pickup:', error);
    alert(`❌ Error: ${error.message}`);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Save confirmation code for a pickup
 */
async function saveConfirmationCode(pickupId, code) {
  if (!code || !code.trim()) return;

  try {
    const response = await fetch(`${GUIAS_API_URL}/pickups/${encodeURIComponent(pickupId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmationCode: code.trim(),
        status: 'confirmed'
      })
    });

    const result = await response.json();

    if (result.success) {
      // Refresh the view
      loadPickupsForDate(document.getElementById('pickups-date-input').value);
    } else {
      alert('Error: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * Prompt for confirmation code input
 */
function promptConfirmationCode(pickupId) {
  const code = prompt('Ingresa el código de confirmación de la paquetería\n(ej: AME260204015829, MEXA3562):');
  if (code) {
    saveConfirmationCode(pickupId, code);
  }
}

// Pickups exports
window.initPickupsView = initPickupsView;
window.changePickupDate = changePickupDate;
window.loadPickupsForDate = loadPickupsForDate;
window.triggerPendingPickups = triggerPendingPickups;
window.cancelPickup = cancelPickup;

// Carrier pickup modal exports
window.openPickupModal = openPickupModal;
window.closePickupModal = closePickupModal;
window.submitPickupRequest = submitPickupRequest;
window.saveConfirmationCode = saveConfirmationCode;
window.promptConfirmationCode = promptConfirmationCode;

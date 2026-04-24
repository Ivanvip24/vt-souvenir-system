/**
 * MERCADO LIBRE MARKETPLACE MODULE
 * Frontend logic for ML Global Selling integration
 */

// Toast notification helper
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.getElementById('ml-toast');
  if (existingToast) existingToast.remove();

  const colors = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#6366f1'
  };

  const toast = document.createElement('div');
  toast.id = 'ml-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 16px 24px;
    background: ${colors[type] || colors.info};
    color: white;
    border-radius: 8px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

const mlState = {
  isConnected: false,
  products: [],
  listings: [],
  selectedProducts: new Set(),
  activeSite: 'all',
  stats: null,
  sites: {
    MLM: { name: 'Mexico', flag: '🇲🇽', currency: 'MXN' },
    MLB: { name: 'Brazil', flag: '🇧🇷', currency: 'BRL' },
    MLC: { name: 'Chile', flag: '🇨🇱', currency: 'CLP' },
    MCO: { name: 'Colombia', flag: '🇨🇴', currency: 'COP' }
  }
};

// Load marketplace when view is activated
const originalSwitchViewML = window.switchView;
window.switchView = function(viewName) {
  originalSwitchViewML(viewName);

  if (viewName === 'marketplace') {
    initMarketplaceView();
  }
};

// ==========================================
// INITIALIZATION
// ==========================================

async function initMarketplaceView() {
  await checkMLConnection();

  if (mlState.isConnected) {
    document.getElementById('ml-connect-panel').classList.add('hidden');
    document.getElementById('ml-dashboard').classList.remove('hidden');
    await loadMLProducts();
  } else {
    document.getElementById('ml-connect-panel').classList.remove('hidden');
    document.getElementById('ml-dashboard').classList.add('hidden');
  }

  updateConnectionBadge();
}

// ==========================================
// CONNECTION MANAGEMENT
// ==========================================

async function checkMLConnection() {
  try {
    const response = await fetch(`${API_BASE}/mercadolibre/auth/status`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();

    mlState.isConnected = data.connected;
    mlState.stats = data.stats;

    return data.connected;
  } catch (error) {
    console.error('Error checking ML connection:', error);
    mlState.isConnected = false;
    return false;
  }
}

function updateConnectionBadge() {
  const badge = document.getElementById('ml-connection-badge');
  if (mlState.isConnected) {
    badge.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #dcfce7; color: #166534; border-radius: 20px; font-size: 13px; font-weight: 600;">
        <span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%;"></span>
        Conectado
      </span>
    `;
  } else {
    badge.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fee2e2; color: #991b1b; border-radius: 20px; font-size: 13px; font-weight: 600;">
        <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span>
        Desconectado
      </span>
    `;
  }
}

async function connectMercadoLibre() {
  try {
    const response = await fetch(`${API_BASE}/mercadolibre/auth/connect`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();

    if (data.authUrl) {
      // Open ML auth in new window
      window.open(data.authUrl, '_blank', 'width=600,height=700');

      // Show instructions
      showToast('Se abrio la ventana de autorizacion. Completa el proceso en Mercado Libre.', 'info');

      // Poll for connection status
      const pollInterval = setInterval(async () => {
        const connected = await checkMLConnection();
        if (connected) {
          clearInterval(pollInterval);
          initMarketplaceView();
          showToast('Cuenta de Mercado Libre conectada exitosamente!', 'success');
        }
      }, 3000);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(pollInterval), 300000);
    }
  } catch (error) {
    console.error('Error connecting ML:', error);
    showToast('Error al conectar con Mercado Libre', 'error');
  }
}

async function disconnectMercadoLibre() {
  if (!confirm('Deseas desconectar tu cuenta de Mercado Libre? Tus publicaciones no seran afectadas.')) {
    return;
  }

  try {
    await fetch(`${API_BASE}/mercadolibre/auth/disconnect`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    mlState.isConnected = false;
    initMarketplaceView();
    showToast('Cuenta desconectada', 'success');
  } catch (error) {
    console.error('Error disconnecting:', error);
    showToast('Error al desconectar', 'error');
  }
}

// ==========================================
// PRODUCT LOADING & DISPLAY
// ==========================================

async function loadMLProducts() {
  const loading = document.getElementById('ml-loading');
  const container = document.getElementById('ml-products-body');

  loading.classList.remove('hidden');
  container.innerHTML = '';

  try {
    const [productsRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/mercadolibre/products`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/mercadolibre/stats`, { headers: getAuthHeaders() })
    ]);

    const productsData = await productsRes.json();
    const statsData = await statsRes.json();

    mlState.products = productsData.products || [];
    mlState.stats = statsData.stats;

    renderMLStats();
    renderMLProductsTable();

    loading.classList.add('hidden');

    if (mlState.products.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">
            No hay productos activos en tu catalogo
          </td>
        </tr>
      `;
    }

  } catch (error) {
    console.error('Error loading ML products:', error);
    loading.innerHTML = `
      <p style="color: var(--danger)">Error al cargar productos. ${error.message}</p>
    `;
  }
}

function renderMLStats() {
  const container = document.getElementById('ml-stats-grid');
  const stats = mlState.stats || {};

  container.innerHTML = `
    <div class="stat-card">
      <div style="font-size: 28px;">📦</div>
      <div>
        <div style="font-size: 24px; font-weight: 700; color: #111827;">${stats.total_listings || 0}</div>
        <div style="font-size: 12px; color: #6b7280;">Publicaciones</div>
      </div>
    </div>
    <div class="stat-card">
      <div style="font-size: 28px;">✅</div>
      <div>
        <div style="font-size: 24px; font-weight: 700; color: #22c55e;">${stats.active_listings || 0}</div>
        <div style="font-size: 12px; color: #6b7280;">Activas</div>
      </div>
    </div>
    <div class="stat-card">
      <div style="font-size: 28px;">🛒</div>
      <div>
        <div style="font-size: 24px; font-weight: 700; color: #6366f1;">${stats.total_sold || 0}</div>
        <div style="font-size: 12px; color: #6b7280;">Vendidos</div>
      </div>
    </div>
    <div class="stat-card">
      <div style="font-size: 28px;">🌎</div>
      <div>
        <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${stats.sites_used || 0}</div>
        <div style="font-size: 12px; color: #6b7280;">Paises</div>
      </div>
    </div>
  `;
}

function renderMLProductsTable() {
  const container = document.getElementById('ml-products-body');
  container.innerHTML = '';

  const filteredProducts = mlState.activeSite === 'all'
    ? mlState.products
    : mlState.products.filter(p => {
        const listings = p.ml_listings || [];
        return listings.some(l => l.site_id === mlState.activeSite);
      });

  filteredProducts.forEach(product => {
    const row = createProductRow(product);
    container.appendChild(row);
  });

  updateBulkSelection();
}

function createProductRow(product) {
  const row = document.createElement('tr');
  const listings = product.ml_listings || [];
  const activeListings = listings.filter(l => l.status === 'active');

  const listingBadges = listings.map(l => {
    const site = mlState.sites[l.site_id] || { flag: '🌐', name: l.site_id };
    const statusColor = l.status === 'active' ? '#22c55e' : l.status === 'paused' ? '#f59e0b' : '#6b7280';
    return `
      <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: ${statusColor}20; color: ${statusColor}; border-radius: 10px; font-size: 11px; margin: 2px;">
        ${site.flag} ${l.site_id}
      </span>
    `;
  }).join('');

  const priceUsd = listings.length > 0 ? listings[0].price_usd : null;

  row.innerHTML = `
    <td style="padding: 12px;">
      <input type="checkbox" class="ml-product-checkbox" data-product-id="${product.id}"
        onchange="toggleProductSelection(${product.id})"
        ${mlState.selectedProducts.has(product.id) ? 'checked' : ''} />
    </td>
    <td style="padding: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">` : '<div style="width: 48px; height: 48px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center;">📦</div>'}
        <div>
          <div style="font-weight: 600; color: #111827;">${product.name}</div>
          <div style="font-size: 12px; color: #6b7280;">${product.category || 'Sin categoria'}</div>
        </div>
      </div>
    </td>
    <td style="padding: 12px; font-weight: 600;">$${parseFloat(product.base_price).toFixed(2)} MXN</td>
    <td style="padding: 12px; font-weight: 600; color: #059669;">${priceUsd ? `$${parseFloat(priceUsd).toFixed(2)} USD` : '-'}</td>
    <td style="padding: 12px;">
      ${listings.length > 0 ? listingBadges : '<span style="color: #9ca3af;">No publicado</span>'}
    </td>
    <td style="padding: 12px; text-align: center;">${activeListings.length > 0 ? '100' : '-'}</td>
    <td style="padding: 12px;">
      <div style="display: flex; gap: 8px;">
        ${listings.length === 0 ? `
          <button onclick="openPublishModal(${product.id})" class="btn btn-primary btn-sm" title="Publicar">
            🚀
          </button>
        ` : `
          <button onclick="openListingsModal(${product.id})" class="btn btn-secondary btn-sm" title="Ver publicaciones">
            👁️
          </button>
        `}
      </div>
    </td>
  `;

  return row;
}

// ==========================================
// SITE FILTERING
// ==========================================

function filterBySite(siteId) {
  mlState.activeSite = siteId;

  // Update tab styles
  document.querySelectorAll('.site-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.site === siteId) {
      tab.classList.add('active');
    }
  });

  renderMLProductsTable();
}

// ==========================================
// PRODUCT SELECTION
// ==========================================

function toggleProductSelection(productId) {
  if (mlState.selectedProducts.has(productId)) {
    mlState.selectedProducts.delete(productId);
  } else {
    mlState.selectedProducts.add(productId);
  }
  updateBulkSelection();
}

function toggleSelectAll() {
  const checkbox = document.getElementById('ml-select-all');
  const visibleProducts = mlState.activeSite === 'all'
    ? mlState.products
    : mlState.products.filter(p => (p.ml_listings || []).some(l => l.site_id === mlState.activeSite));

  if (checkbox.checked) {
    visibleProducts.forEach(p => mlState.selectedProducts.add(p.id));
  } else {
    visibleProducts.forEach(p => mlState.selectedProducts.delete(p.id));
  }

  renderMLProductsTable();
}

function updateBulkSelection() {
  const bulkBar = document.getElementById('ml-bulk-actions');
  const countSpan = document.getElementById('ml-selected-count');

  if (mlState.selectedProducts.size > 0) {
    bulkBar.classList.remove('hidden');
    countSpan.textContent = `${mlState.selectedProducts.size} seleccionado${mlState.selectedProducts.size > 1 ? 's' : ''}`;
  } else {
    bulkBar.classList.add('hidden');
  }
}

// ==========================================
// PUBLISH MODAL
// ==========================================

function openPublishModal(productId) {
  const product = mlState.products.find(p => p.id === productId);
  if (!product) return;

  // Calculate suggested USD price (30% markup from MXN)
  const mxnToUsd = 0.058;
  const suggestedPrice = (parseFloat(product.base_price) * mxnToUsd * 1.3).toFixed(2);

  const modalContent = `
    <div style="padding: 20px;">
      <h3 style="margin: 0 0 20px 0; font-size: 20px;">🚀 Publicar en Mercado Libre</h3>

      <div style="display: flex; align-items: center; gap: 12px; padding: 16px; background: #f9fafb; border-radius: 12px; margin-bottom: 20px;">
        ${product.image_url ? `<img src="${product.image_url}" style="width: 64px; height: 64px; object-fit: cover; border-radius: 8px;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 16px;">${product.name}</div>
          <div style="color: #6b7280;">$${parseFloat(product.base_price).toFixed(2)} MXN</div>
        </div>
      </div>

      <form id="publish-form" onsubmit="submitPublish(event, ${productId})">
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px;">Titulo de la publicacion</label>
          <input type="text" id="publish-title" value="${product.name}" required
            style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px;">Precio USD</label>
          <input type="number" id="publish-price" value="${suggestedPrice}" step="0.01" required
            style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Precio sugerido con 30% markup</div>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px;">Cantidad disponible</label>
          <input type="number" id="publish-quantity" value="100" min="1" required
            style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px;">Paises (selecciona al menos uno)</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${Object.entries(mlState.sites).map(([code, site]) => `
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: #f9fafb; border-radius: 8px; cursor: pointer;">
                <input type="checkbox" name="sites" value="${code}" checked>
                <span>${site.flag} ${site.name}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button type="button" onclick="closeModal()" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary">🚀 Publicar</button>
        </div>
      </form>
    </div>
  `;

  showModal(modalContent);
}

async function submitPublish(event, productId) {
  event.preventDefault();

  const form = event.target;
  const title = document.getElementById('publish-title').value;
  const priceUsd = parseFloat(document.getElementById('publish-price').value);
  const quantity = parseInt(document.getElementById('publish-quantity').value);
  const siteCheckboxes = form.querySelectorAll('input[name="sites"]:checked');
  const siteIds = Array.from(siteCheckboxes).map(cb => cb.value);

  if (siteIds.length === 0) {
    showToast('Selecciona al menos un pais', 'error');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '⏳ Publicando...';

  try {
    const response = await fetch(`${API_BASE}/mercadolibre/products/${productId}/publish`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ siteIds, priceUsd, title, quantity })
    });

    const data = await response.json();

    if (data.success) {
      closeModal();
      showToast(`Publicado en ${data.results.filter(r => r.success).length} paises!`, 'success');
      loadMLProducts();
    } else {
      showToast(data.error || 'Error al publicar', 'error');
    }
  } catch (error) {
    console.error('Error publishing:', error);
    showToast('Error al publicar: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '🚀 Publicar';
  }
}

// ==========================================
// BULK OPERATIONS
// ==========================================

async function bulkPublishSelected() {
  const productIds = Array.from(mlState.selectedProducts);

  if (productIds.length === 0) {
    showToast('Selecciona al menos un producto', 'error');
    return;
  }

  // Show site selection modal
  const modalContent = `
    <div style="padding: 20px;">
      <h3 style="margin: 0 0 20px 0; font-size: 20px;">🚀 Publicacion Masiva</h3>
      <p style="color: #6b7280; margin-bottom: 20px;">${productIds.length} producto(s) seleccionado(s)</p>

      <form id="bulk-publish-form" onsubmit="submitBulkPublish(event)">
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px;">Cantidad por producto</label>
          <input type="number" id="bulk-quantity" value="100" min="1" required
            style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px;">
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px;">Paises</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${Object.entries(mlState.sites).map(([code, site]) => `
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: #f9fafb; border-radius: 8px; cursor: pointer;">
                <input type="checkbox" name="sites" value="${code}" checked>
                <span>${site.flag} ${site.name}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button type="button" onclick="closeModal()" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary">🚀 Publicar ${productIds.length} Productos</button>
        </div>
      </form>
    </div>
  `;

  showModal(modalContent);
}

async function submitBulkPublish(event) {
  event.preventDefault();

  const form = event.target;
  const quantity = parseInt(document.getElementById('bulk-quantity').value);
  const siteCheckboxes = form.querySelectorAll('input[name="sites"]:checked');
  const siteIds = Array.from(siteCheckboxes).map(cb => cb.value);
  const productIds = Array.from(mlState.selectedProducts);

  if (siteIds.length === 0) {
    showToast('Selecciona al menos un pais', 'error');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '⏳ Publicando...';

  try {
    const response = await fetch(`${API_BASE}/mercadolibre/products/bulk-publish`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productIds,
        siteIds,
        options: { quantity }
      })
    });

    const data = await response.json();

    closeModal();
    showToast(`${data.summary.successful}/${data.summary.total} publicaciones exitosas`, data.summary.failed > 0 ? 'warning' : 'success');

    mlState.selectedProducts.clear();
    loadMLProducts();

  } catch (error) {
    console.error('Error bulk publishing:', error);
    showToast('Error: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function bulkSyncInventory() {
  const productIds = Array.from(mlState.selectedProducts);

  if (productIds.length === 0) {
    showToast('Selecciona al menos un producto', 'error');
    return;
  }

  if (!confirm(`Sincronizar inventario de ${productIds.length} producto(s) con Mercado Libre?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/mercadolibre/inventory/sync`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productIds })
    });

    const data = await response.json();
    showToast(`Sincronizados: ${data.synced}, Errores: ${data.errors}`, data.errors > 0 ? 'warning' : 'success');
    loadMLProducts();

  } catch (error) {
    console.error('Error syncing inventory:', error);
    showToast('Error al sincronizar: ' + error.message, 'error');
  }
}

// ==========================================
// LISTINGS MODAL
// ==========================================

function openListingsModal(productId) {
  const product = mlState.products.find(p => p.id === productId);
  if (!product) return;

  const listings = product.ml_listings || [];

  const modalContent = `
    <div style="padding: 20px;">
      <h3 style="margin: 0 0 20px 0; font-size: 20px;">📋 Publicaciones de ${product.name}</h3>

      ${listings.length === 0 ? `
        <p style="color: #6b7280; text-align: center; padding: 40px;">No hay publicaciones</p>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${listings.map(listing => {
            const site = mlState.sites[listing.site_id] || { flag: '🌐', name: listing.site_id };
            const statusColor = listing.status === 'active' ? '#22c55e' : listing.status === 'paused' ? '#f59e0b' : '#6b7280';

            return `
              <div style="padding: 16px; background: #f9fafb; border-radius: 12px; border-left: 4px solid ${statusColor};">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div>
                    <div style="font-size: 20px; margin-bottom: 4px;">${site.flag} ${site.name}</div>
                    <div style="font-size: 14px; color: #6b7280;">ID: ${listing.ml_item_id || 'Pendiente'}</div>
                    <div style="font-weight: 600; color: #059669; margin-top: 8px;">$${parseFloat(listing.price_usd).toFixed(2)} USD</div>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                    <span style="padding: 4px 12px; background: ${statusColor}20; color: ${statusColor}; border-radius: 20px; font-size: 12px; font-weight: 600;">
                      ${listing.status}
                    </span>
                    ${listing.permalink ? `
                      <a href="${listing.permalink}" target="_blank" style="color: #6366f1; font-size: 12px;">Ver en ML ↗</a>
                    ` : ''}
                  </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                  ${listing.status === 'active' ? `
                    <button onclick="pauseListingAction(${listing.id})" class="btn btn-sm" style="background: #f59e0b; color: white;">⏸️ Pausar</button>
                  ` : listing.status === 'paused' ? `
                    <button onclick="activateListingAction(${listing.id})" class="btn btn-sm" style="background: #22c55e; color: white;">▶️ Activar</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}

      <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
        <button onclick="closeModal()" class="btn btn-secondary">Cerrar</button>
      </div>
    </div>
  `;

  showModal(modalContent);
}

async function pauseListingAction(listingId) {
  try {
    await fetch(`${API_BASE}/mercadolibre/listings/${listingId}/pause`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    showToast('Publicacion pausada', 'success');
    closeModal();
    loadMLProducts();
  } catch (error) {
    showToast('Error al pausar', 'error');
  }
}

async function activateListingAction(listingId) {
  try {
    await fetch(`${API_BASE}/mercadolibre/listings/${listingId}/activate`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    showToast('Publicacion activada', 'success');
    closeModal();
    loadMLProducts();
  } catch (error) {
    showToast('Error al activar', 'error');
  }
}

// ==========================================
// MODAL HELPERS
// ==========================================

function showModal(content) {
  let modal = document.getElementById('ml-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ml-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background: white; border-radius: 16px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
      ${content}
    </div>
  `;
  modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('ml-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Check for OAuth callback on page load
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('ml_connected') === 'true') {
    showToast('Cuenta de Mercado Libre conectada!', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('ml_error')) {
    showToast('Error al conectar: ' + params.get('ml_error'), 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

// Export functions for global access
window.initMarketplaceView = initMarketplaceView;
window.connectMercadoLibre = connectMercadoLibre;
window.disconnectMercadoLibre = disconnectMercadoLibre;
window.filterBySite = filterBySite;
window.toggleSelectAll = toggleSelectAll;
window.toggleProductSelection = toggleProductSelection;
window.openPublishModal = openPublishModal;
window.openListingsModal = openListingsModal;
window.bulkPublishSelected = bulkPublishSelected;
window.bulkSyncInventory = bulkSyncInventory;
window.pauseListingAction = pauseListingAction;
window.activateListingAction = activateListingAction;
window.submitPublish = submitPublish;
window.submitBulkPublish = submitBulkPublish;
window.closeModal = closeModal;

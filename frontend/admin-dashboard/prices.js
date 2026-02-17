/**
 * Prices & Margins Module
 * Handles price tracking, analytics, trends, and insights
 */

// ==========================================
// STATE MANAGEMENT
// ==========================================

const priceState = {
  currentPeriod: 30,
  currentTab: 'overview',
  dashboardData: null,
  products: [],
  trends: [],
  insights: []
};

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('💰 Prices module initialized');

  // Check if prices view becomes active
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.classList.contains('active') && mutation.target.id === 'prices-view') {
        if (!priceState.dashboardData) {
          loadPriceDashboard(priceState.currentPeriod);
        }
      }
    });
  });

  const pricesView = document.getElementById('prices-view');
  if (pricesView) {
    observer.observe(pricesView, { attributes: true, attributeFilter: ['class'] });
  }
});

// ==========================================
// MAIN DASHBOARD LOADING
// ==========================================

window.loadPriceDashboard = async function(period = 30) {
  priceState.currentPeriod = period;

  const loading = document.getElementById('prices-loading');
  const emptyState = document.getElementById('prices-empty-state');

  loading.classList.remove('hidden');
  emptyState.classList.add('hidden');

  try {
    const response = await fetch(`${API_BASE}/prices/dashboard?period=${period}`, {
      headers: getAuthHeaders()
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      throw new Error('Token inválido - sesión expirada');
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading price dashboard');
    }

    priceState.dashboardData = result.data || {};

    // Defensive checks for all data properties
    renderSummaryCards(result.data?.summary || {});
    renderAlerts(result.data?.marginAlerts || []);
    renderPriceTopProductsTable(result.data?.topProducts || []);

    loading.classList.add('hidden');

  } catch (error) {
    console.error('Error loading price dashboard:', error);

    // Check if it's an auth error and redirect to login
    if (error.message.includes('Token') || error.message.includes('401') || error.message.includes('Unauthorized')) {
      loading.innerHTML = `
        <p style="color: var(--danger)">
          ⚠️ Sesión expirada. <a href="login.html" style="color: var(--primary);">Iniciar sesión de nuevo</a>
        </p>
      `;
      return;
    }

    loading.innerHTML = `
      <p style="color: var(--danger)">
        ⚠️ Error al cargar el dashboard de precios: ${error.message}
      </p>
    `;
  }
};

// ==========================================
// RENDER SUMMARY CARDS
// ==========================================

function renderSummaryCards(summary) {
  const container = document.getElementById('price-summary-cards');

  if (!container) return;

  const totalProducts = summary?.total_products || 0;
  const avgMargin = parseFloat(summary?.avg_profit_margin || 0).toFixed(1);

  container.innerHTML = `
    <div class="stat-card-large">
      <div class="stat-icon">📦</div>
      <div>
        <div class="stat-label">Total Productos</div>
        <div class="stat-value">${totalProducts}</div>
      </div>
    </div>

    <div class="stat-card-large">
      <div class="stat-icon">💰</div>
      <div>
        <div class="stat-label">Margen Promedio</div>
        <div class="stat-value">${avgMargin}%</div>
      </div>
    </div>
  `;
}

// ==========================================
// RENDER ALERTS
// ==========================================

function renderAlerts(marginAlerts) {
  const container = document.getElementById('price-alerts');

  if (!container) return;

  if (!marginAlerts || !Array.isArray(marginAlerts) || marginAlerts.length === 0) {
    container.innerHTML = '';
    return;
  }

  const criticalProducts = marginAlerts.filter(p => p && parseFloat(p.margin_pct || 0) < 10);
  const warningProducts = marginAlerts.filter(p => p && parseFloat(p.margin_pct || 0) >= 10 && parseFloat(p.margin_pct || 0) < 20);

  let html = '<div style="display: flex; gap: 16px; flex-wrap: wrap;">';

  if (criticalProducts.length > 0) {
    html += `
      <div class="alert alert-danger" style="flex: 1; min-width: 300px;">
        <strong>🚨 ${criticalProducts.length} Producto(s) con Margen Crítico (&lt;10%)</strong>
        <div style="margin-top: 8px; font-size: 13px;">
          ${criticalProducts.slice(0, 3).map(p =>
            `${p.name}: ${parseFloat(p.margin_pct).toFixed(1)}%`
          ).join(' • ')}
          ${criticalProducts.length > 3 ? ` y ${criticalProducts.length - 3} más` : ''}
        </div>
      </div>
    `;
  }

  if (warningProducts.length > 0) {
    html += `
      <div class="alert alert-warning" style="flex: 1; min-width: 300px;">
        <strong>⚠️ ${warningProducts.length} Producto(s) con Margen Bajo (10-20%)</strong>
        <div style="margin-top: 8px; font-size: 13px;">
          ${warningProducts.slice(0, 3).map(p =>
            `${p.name}: ${parseFloat(p.margin_pct).toFixed(1)}%`
          ).join(' • ')}
          ${warningProducts.length > 3 ? ` y ${warningProducts.length - 3} más` : ''}
        </div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// ==========================================
// RENDER CHARTS (Simple ASCII-style for now)
// ==========================================

function renderOverviewCharts(trends) {
  if (!trends || trends.length === 0) {
    document.getElementById('revenue-trend-chart').innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 40px;">No hay datos disponibles</p>';
    document.getElementById('margin-trend-chart').innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 40px;">No hay datos disponibles</p>';
    return;
  }

  renderRevenueTrendChart(trends);
  renderMarginTrendChart(trends);
}

function renderRevenueTrendChart(trends) {
  const container = document.getElementById('revenue-trend-chart');

  // Simple table-based chart
  const maxRevenue = Math.max(...trends.map(t => parseFloat(t.revenue || 0)));

  let html = '<div style="padding: 12px;">';

  trends.slice(-10).forEach((trend, idx) => {
    const revenue = parseFloat(trend.revenue || 0);
    const percentage = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0;
    const date = new Date(trend.date);
    const dateStr = date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });

    html += `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
          <span style="color: #6b7280;">${dateStr}</span>
          <span style="font-weight: 700; color: #059669;">${formatCurrency(revenue)}</span>
        </div>
        <div style="background: #e5e7eb; border-radius: 4px; overflow: hidden; height: 20px;">
          <div style="background: linear-gradient(90deg, #10b981, #059669); width: ${percentage}%; height: 100%; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderMarginTrendChart(trends) {
  const container = document.getElementById('margin-trend-chart');

  let html = '<div style="padding: 12px;">';

  trends.slice(-10).forEach((trend, idx) => {
    const margin = parseFloat(trend.avg_margin || 0);
    const date = new Date(trend.date);
    const dateStr = date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });

    // Color based on margin health
    let color = '#10b981'; // green
    if (margin < 20) color = '#f59e0b'; // yellow
    if (margin < 10) color = '#ef4444'; // red

    html += `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
          <span style="color: #6b7280;">${dateStr}</span>
          <span style="font-weight: 700; color: ${color};">${margin.toFixed(1)}%</span>
        </div>
        <div style="background: #e5e7eb; border-radius: 4px; overflow: hidden; height: 20px;">
          <div style="background: ${color}; width: ${Math.min(margin, 100)}%; height: 100%; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ==========================================
// RENDER TOP PRODUCTS TABLE (for Prices view)
// ==========================================

function renderPriceTopProductsTable(products) {
  const container = document.getElementById('top-products-table');

  if (!container) return;

  if (!products || !Array.isArray(products) || products.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No hay datos disponibles</p>';
    return;
  }

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Precio</th>
          <th>Costo</th>
          <th>Margen</th>
        </tr>
      </thead>
      <tbody>
  `;

  products.forEach(product => {
    const margin = parseFloat(product.margin_pct || 0);
    const marginColor = margin >= 20 ? '#059669' : margin >= 10 ? '#f59e0b' : '#ef4444';

    html += `
      <tr style="cursor: pointer; transition: background 0.2s;"
          onmouseover="this.style.background='#f9fafb'"
          onmouseout="this.style.background=''"
          onclick="showProductDetail(${product.product_id || product.id})">
        <td><strong>${product.name}</strong></td>
        <td>${formatCurrency(product.base_price)}</td>
        <td>${formatCurrency(product.production_cost)}</td>
        <td style="color: ${marginColor}; font-weight: 700;">${margin.toFixed(1)}%</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// ==========================================
// TAB SWITCHING
// ==========================================

window.switchPriceTab = async function(tabName) {
  priceState.currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.price-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.price-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`price-tab-${tabName}`).classList.add('active');

  // Load tab-specific data (old switch - most functionality moved to overview tab)
  // This switch is kept for backwards compatibility but can be removed
};

// ==========================================
// LOAD PRODUCTS PRICING
// ==========================================

async function loadProductsPricing() {
  try {
    const response = await fetch(`${API_BASE}/prices/products`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading products pricing');
    }

    priceState.products = result.data;
    renderProductsPricingTable(result.data);

  } catch (error) {
    console.error('Error loading products pricing:', error);
    document.getElementById('products-pricing-table').innerHTML = `
      <p style="color: var(--danger); text-align: center; padding: 20px;">
        ⚠️ Error: ${error.message}
      </p>
    `;
  }
}

function renderProductsPricingTable(products) {
  const container = document.getElementById('products-pricing-table');

  if (!products || products.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No hay productos disponibles</p>';
    return;
  }

  let html = `
    <div style="overflow-x: auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Precio Actual</th>
            <th>Costo Actual</th>
            <th>Margen Actual</th>
            <th>Prom. 30d</th>
            <th>Cambios 30d</th>
            <th>Vendidos 30d</th>
            <th>Ganancia 30d</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
  `;

  products.forEach(product => {
    const margin = parseFloat(product.current_margin_pct || 0);
    const marginColor = margin >= 20 ? '#059669' : margin >= 10 ? '#f59e0b' : '#ef4444';

    html += `
      <tr>
        <td><strong>${product.product_name}</strong></td>
        <td>${formatCurrency(product.current_price)}</td>
        <td>${formatCurrency(product.current_cost)}</td>
        <td style="color: ${marginColor}; font-weight: 700;">${margin.toFixed(1)}%</td>
        <td>${product.avg_price_30d ? formatCurrency(product.avg_price_30d) : 'N/A'}</td>
        <td>${product.price_changes_30d || 0}</td>
        <td>${product.units_sold_30d || 0}</td>
        <td style="color: #059669; font-weight: 700;">${formatCurrency(product.total_profit_30d || 0)}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-small" onclick="editProductPrice(${product.product_id})" style="font-size: 12px; padding: 6px 12px; background: #f59e0b;">
              ✏️ Editar
            </button>
            <button class="btn-small" onclick="viewProductHistory(${product.product_id})" style="font-size: 12px; padding: 6px 12px;">
              📊 Historial
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

// ==========================================
// VIEW PRODUCT HISTORY
// ==========================================

window.viewProductHistory = async function(productId) {
  try {
    const response = await fetch(`${API_BASE}/prices/products/${productId}/history`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading product history');
    }

    showProductHistoryModal(result.data, productId);

  } catch (error) {
    console.error('Error loading product history:', error);
    alert(`Error: ${error.message}`);
  }
};

function showProductHistoryModal(history, productId) {
  // Find product name
  const product = priceState.products.find(p => p.product_id === productId);
  const productName = product ? product.product_name : `Producto #${productId}`;

  let html = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;" onclick="this.remove()">
      <div style="background: white; border-radius: 16px; padding: 32px; max-width: 900px; width: 90%; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation()">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2 style="margin: 0;">📊 Historial de Precios: ${productName}</h2>
          <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 32px; cursor: pointer; color: #6b7280;">×</button>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Precio Base</th>
              <th>Costo Producción</th>
              <th>Costo Material</th>
              <th>Costo Mano de Obra</th>
              <th>Margen</th>
              <th>Razón</th>
            </tr>
          </thead>
          <tbody>
  `;

  history.forEach(entry => {
    const margin = parseFloat(entry.profit_margin || 0);
    const marginColor = margin >= 20 ? '#059669' : margin >= 10 ? '#f59e0b' : '#ef4444';

    html += `
      <tr>
        <td>${formatDatePrices(entry.effective_date)}</td>
        <td>${formatCurrency(entry.base_price)}</td>
        <td>${formatCurrency(entry.production_cost)}</td>
        <td>${entry.material_cost ? formatCurrency(entry.material_cost) : 'N/A'}</td>
        <td>${entry.labor_cost ? formatCurrency(entry.labor_cost) : 'N/A'}</td>
        <td style="color: ${marginColor}; font-weight: 700;">${margin.toFixed(1)}%</td>
        <td><small>${entry.change_reason || 'N/A'}</small></td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
}

// ==========================================
// LOAD PRICE TRENDS (DISABLED - Tab removed)
// ==========================================

// Trends tab has been removed from the UI
/*
async function loadPriceTrends() {
  try {
    const response = await fetch(`${API_BASE}/prices/trends?months=6`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading price trends');
    }

    priceState.trends = result.data;
    renderPriceHistoryChart(result.data);

  } catch (error) {
    console.error('Error loading price trends:', error);
    document.getElementById('price-history-chart').innerHTML = `
      <p style="color: var(--danger); text-align: center; padding: 40px;">
        ⚠️ Error: ${error.message}
      </p>
    `;
  }
}

function renderPriceHistoryChart(trends) {
  const container = document.getElementById('price-history-chart');

  if (!trends || trends.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 40px;">No hay datos de tendencias disponibles</p>';
    return;
  }

  // Group by product
  const productTrends = {};
  trends.forEach(trend => {
    if (!productTrends[trend.product_name]) {
      productTrends[trend.product_name] = [];
    }
    productTrends[trend.product_name].push(trend);
  });

  let html = '<div style="padding: 20px;">';

  Object.keys(productTrends).slice(0, 5).forEach(productName => {
    const productData = productTrends[productName].sort((a, b) =>
      new Date(a.month) - new Date(b.month)
    );

    html += `
      <div style="margin-bottom: 32px; padding-bottom: 32px; border-bottom: 1px solid #e5e7eb;">
        <h4 style="margin: 0 0 16px 0;">${productName}</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
    `;

    // Price trend
    const maxPrice = Math.max(...productData.map(d => parseFloat(d.avg_price || 0)));
    html += '<div><strong style="font-size: 12px; color: #6b7280;">PRECIO PROMEDIO</strong>';
    productData.forEach(data => {
      const price = parseFloat(data.avg_price || 0);
      const percentage = maxPrice > 0 ? (price / maxPrice) * 100 : 0;

      html += `
        <div style="margin: 8px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
            <span>${data.month_label}</span>
            <span style="font-weight: 700;">${formatCurrency(price)}</span>
          </div>
          <div style="background: #e5e7eb; border-radius: 2px; height: 12px; overflow: hidden;">
            <div style="background: #3b82f6; width: ${percentage}%; height: 100%;"></div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    // Margin trend
    html += '<div><strong style="font-size: 12px; color: #6b7280;">MARGEN PROMEDIO</strong>';
    productData.forEach(data => {
      const margin = parseFloat(data.avg_margin || 0);
      const color = margin >= 20 ? '#10b981' : margin >= 10 ? '#f59e0b' : '#ef4444';

      html += `
        <div style="margin: 8px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
            <span>${data.month_label}</span>
            <span style="font-weight: 700; color: ${color};">${margin.toFixed(1)}%</span>
          </div>
          <div style="background: #e5e7eb; border-radius: 2px; height: 12px; overflow: hidden;">
            <div style="background: ${color}; width: ${Math.min(margin, 100)}%; height: 100%;"></div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    html += '</div></div>';
  });

  html += '</div>';
  container.innerHTML = html;
}
*/

// ==========================================
// LOAD PRICING INSIGHTS (DISABLED - Tab removed)
// ==========================================

// Insights tab has been removed from the UI
/*
async function loadPricingInsights() {
  try {
    const response = await fetch(`${API_BASE}/prices/insights`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading pricing insights');
    }

    priceState.insights = result.data;
    renderInsights(result.data);

  } catch (error) {
    console.error('Error loading pricing insights:', error);
    document.getElementById('pricing-insights-container').innerHTML = `
      <p style="color: var(--danger); text-align: center; padding: 20px;">
        ⚠️ Error: ${error.message}
      </p>
    `;
  }
}

function renderInsights(insights) {
  const container = document.getElementById('pricing-insights-container');

  if (!insights || insights.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 64px; margin-bottom: 16px;">💡</div>
        <h3 style="color: #6b7280;">No hay insights disponibles</h3>
        <p style="color: #9ca3af;">Los insights aparecerán aquí cuando el sistema detecte oportunidades o problemas</p>
      </div>
    `;
    return;
  }

  let html = '<div style="display: grid; gap: 16px;">';

  insights.forEach(insight => {
    const severityConfig = {
      critical: { icon: '🚨', color: '#ef4444', bg: '#fee2e2', label: 'CRÍTICO' },
      warning: { icon: '⚠️', color: '#f59e0b', bg: '#fef3c7', label: 'ADVERTENCIA' },
      info: { icon: '💡', color: '#3b82f6', bg: '#dbeafe', label: 'INFO' }
    };

    const config = severityConfig[insight.severity] || severityConfig.info;

    html += `
      <div style="background: ${config.bg}; border-left: 4px solid ${config.color}; border-radius: 8px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 32px;">${config.icon}</span>
            <div>
              <div style="display: inline-block; background: ${config.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-bottom: 8px;">
                ${config.label}
              </div>
              <h4 style="margin: 0; color: ${config.color};">${insight.title}</h4>
              ${insight.product_name ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">Producto: ${insight.product_name}</p>` : ''}
            </div>
          </div>
          <button onclick="dismissInsight(${insight.id})" style="background: rgba(0,0,0,0.1); border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">
            Descartar
          </button>
        </div>

        <p style="margin: 0 0 12px 0; color: #374151;">${insight.description || 'Sin descripción'}</p>

        ${insight.current_value || insight.recommended_value ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.1);">
            ${insight.current_value ? `
              <div>
                <div style="font-size: 11px; color: #6b7280; font-weight: 600;">VALOR ACTUAL</div>
                <div style="font-size: 18px; font-weight: 700; color: ${config.color};">${formatCurrency(insight.current_value)}</div>
              </div>
            ` : ''}
            ${insight.recommended_value ? `
              <div>
                <div style="font-size: 11px; color: #6b7280; font-weight: 600;">RECOMENDADO</div>
                <div style="font-size: 18px; font-weight: 700; color: #10b981;">${formatCurrency(insight.recommended_value)}</div>
              </div>
            ` : ''}
            ${insight.potential_impact ? `
              <div>
                <div style="font-size: 11px; color: #6b7280; font-weight: 600;">IMPACTO POTENCIAL</div>
                <div style="font-size: 18px; font-weight: 700; color: ${parseFloat(insight.potential_impact) >= 0 ? '#10b981' : '#ef4444'};">
                  ${formatCurrency(insight.potential_impact)}
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ==========================================
// DISMISS INSIGHT
// ==========================================

window.dismissInsight = async function(insightId) {
  if (!confirm('¿Descartar este insight?')) return;

  try {
    const response = await fetch(`${API_BASE}/prices/insights/${insightId}/dismiss`, {
      method: 'PUT',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error dismissing insight');
    }

    // Reload insights
    await loadPricingInsights();
    alert('✅ Insight descartado');

  } catch (error) {
    console.error('Error dismissing insight:', error);
    alert(`Error: ${error.message}`);
  }
};
*/

// ==========================================
// EDIT PRODUCT PRICE
// ==========================================

window.editProductPrice = async function(productId) {
  // Try to find product in state first
  let product = priceState.products.find(p => p.product_id === productId);

  // If not in state, fetch from API
  if (!product) {
    try {
      const response = await fetch(`${API_BASE}/prices/products`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        priceState.products = result.data;
        product = result.data.find(p => p.product_id === productId);
      }
    } catch (error) {
      console.error('Error fetching product:', error);
    }
  }

  if (!product) {
    alert('Producto no encontrado');
    return;
  }

  let html = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;" onclick="this.remove()">
      <div style="background: white; border-radius: 16px; padding: 32px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation()">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2 style="margin: 0;">✏️ Editar Precios: ${product.product_name}</h2>
          <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 32px; cursor: pointer; color: #6b7280;">×</button>
        </div>

        <form id="edit-price-form" onsubmit="saveProductPrice(event, ${productId})">
          <div style="display: grid; gap: 20px;">
            <!-- Current Values Display -->
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280;">VALORES ACTUALES</h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                <div>
                  <strong>Precio:</strong> ${formatCurrency(product.current_price)}
                </div>
                <div>
                  <strong>Costo:</strong> ${formatCurrency(product.current_cost)}
                </div>
                <div style="grid-column: span 2;">
                  <strong>Margen:</strong> <span style="color: ${parseFloat(product.current_margin_pct) >= 20 ? '#059669' : '#f59e0b'}; font-weight: 700;">${parseFloat(product.current_margin_pct).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <!-- Price Inputs -->
            <div>
              <label style="display: block; margin-bottom: 8px; font-weight: 600;">Precio Base *</label>
              <input
                type="number"
                name="base_price"
                step="0.01"
                min="0"
                value="${product.current_price}"
                required
                oninput="calculateNewMargin()"
                style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px;"
              />
            </div>

            <div>
              <label style="display: block; margin-bottom: 8px; font-weight: 600;">Costo de Producción *</label>
              <input
                type="number"
                name="production_cost"
                step="0.01"
                min="0"
                value="${product.current_cost}"
                required
                oninput="calculateNewMargin()"
                style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px;"
              />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Costo de Material</label>
                <input
                  type="number"
                  name="material_cost"
                  step="0.01"
                  min="0"
                  value="${product.current_cost * 0.7 || 0}"
                  style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px;"
                />
              </div>
              <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Costo de Mano de Obra</label>
                <input
                  type="number"
                  name="labor_cost"
                  step="0.01"
                  min="0"
                  value="${product.current_cost * 0.3 || 0}"
                  style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px;"
                />
              </div>
            </div>

            <!-- New Margin Display -->
            <div id="new-margin-display" style="background: #dbeafe; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #1e40af;">NUEVO MARGEN</h3>
              <div style="font-size: 24px; font-weight: 700; color: #1e40af;" id="new-margin-value">
                ${parseFloat(product.current_margin_pct).toFixed(1)}%
              </div>
            </div>

            <!-- Reason for Change -->
            <div>
              <label style="display: block; margin-bottom: 8px; font-weight: 600;">Razón del Cambio *</label>
              <textarea
                name="change_reason"
                rows="3"
                required
                placeholder="Ej: Aumento de costo de materiales, ajuste de mercado, etc."
                style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; resize: vertical;"
              ></textarea>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 12px; margin-top: 8px;">
              <button type="submit" class="btn btn-primary" style="flex: 1; padding: 14px; font-size: 16px; font-weight: 600;">
                💾 Guardar Cambios
              </button>
              <button type="button" onclick="this.closest('div[style*=fixed]').remove()" class="btn" style="flex: 1; background: #e5e7eb; color: #374151; padding: 14px; font-size: 16px; font-weight: 600;">
                Cancelar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  // Add script for margin calculation
  const script = document.createElement('script');
  script.textContent = `
    window.calculateNewMargin = function() {
      const form = document.getElementById('edit-price-form');
      const basePrice = parseFloat(form.base_price.value) || 0;
      const prodCost = parseFloat(form.production_cost.value) || 0;

      const margin = basePrice > 0 ? ((basePrice - prodCost) / basePrice * 100) : 0;
      const marginDisplay = document.getElementById('new-margin-value');
      const marginContainer = document.getElementById('new-margin-display');

      marginDisplay.textContent = margin.toFixed(1) + '%';

      // Update color based on margin
      if (margin >= 20) {
        marginContainer.style.background = '#d1fae5';
        marginContainer.style.borderLeftColor = '#10b981';
        marginDisplay.style.color = '#065f46';
      } else if (margin >= 10) {
        marginContainer.style.background = '#fef3c7';
        marginContainer.style.borderLeftColor = '#f59e0b';
        marginDisplay.style.color = '#78350f';
      } else {
        marginContainer.style.background = '#fee2e2';
        marginContainer.style.borderLeftColor = '#ef4444';
        marginDisplay.style.color = '#7f1d1d';
      }
    };
  `;
  document.body.appendChild(script);
};

// ==========================================
// SAVE PRODUCT PRICE
// ==========================================

window.saveProductPrice = async function(event, productId) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  const data = {
    base_price: parseFloat(formData.get('base_price')),
    production_cost: parseFloat(formData.get('production_cost')),
    material_cost: parseFloat(formData.get('material_cost')) || null,
    labor_cost: parseFloat(formData.get('labor_cost')) || null,
    overhead_cost: 0,
    change_reason: formData.get('change_reason')
  };

  // Validation
  if (data.base_price < 0 || data.production_cost < 0) {
    alert('Los precios no pueden ser negativos');
    return;
  }

  if (!data.change_reason || data.change_reason.trim() === '') {
    alert('Por favor indica la razón del cambio');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/prices/products/${productId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al actualizar el precio');
    }

    // Close modal
    document.querySelector('div[style*="position: fixed"]').remove();

    // Show success message
    alert('✅ Precio actualizado exitosamente');

    // Reload products data
    await loadProductsPricing();

    // Also reload dashboard if on overview tab
    if (priceState.currentTab === 'overview') {
      await loadPriceDashboard(priceState.currentPeriod);
    }

  } catch (error) {
    console.error('Error saving price:', error);
    alert(`Error: ${error.message}`);
  }
};

// ==========================================
// REFRESH TRENDS
// ==========================================

window.refreshPriceTrends = function() {
  loadPriceDashboard(priceState.currentPeriod);
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatDatePrices(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Make functions globally accessible
// window.loadPricingInsights = loadPricingInsights; // Commented out - function removed

// ==========================================
// BOM (BILL OF MATERIALS) FUNCTIONALITY
// ==========================================

// BOM State
const bomState = {
  materials: [],
  selectedProductId: null,
  components: [],
  selectedMaterial: null
};

// Load BOM tab data when switched to
window.switchPriceTab = async function(tabName) {
  priceState.currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.price-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.price-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`price-tab-${tabName}`).classList.add('active');

  // Load tab-specific data
  switch(tabName) {
    case 'bom':
      await loadBOMTab();
      break;
  }
};

// ==========================================
// LOAD BOM TAB
// ==========================================

async function loadBOMTab() {
  await loadRawMaterials();
}

// ==========================================
// LOAD RAW MATERIALS
// ==========================================

async function loadRawMaterials() {
  try {
    const response = await fetch(`${API_BASE}/bom/materials`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading materials');
    }

    bomState.materials = result.data;
    renderRawMaterialsList(result.data);

  } catch (error) {
    console.error('Error loading raw materials:', error);
    document.getElementById('raw-materials-list').innerHTML = `
      <p style="color: var(--danger); padding: 12px;"">Error: ${error.message}</p>
    `;
  }
}

function renderRawMaterialsList(materials) {
  const container = document.getElementById('raw-materials-list');

  if (!materials || materials.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af; padding: 12px;">No hay materiales disponibles</p>';
    return;
  }

  let html = '<div style="display: grid; gap: 8px;">';

  materials.forEach(material => {
    const stockLow = parseFloat(material.current_stock) < parseFloat(material.min_stock_level);

    html += `
      <div style="padding: 12px; border: 2px solid ${stockLow ? '#fca5a5' : '#e5e7eb'}; border-radius: 8px; transition: all 0.2s;"
           onmouseover="this.style.borderColor='#3b82f6'"
           onmouseout="this.style.borderColor='${stockLow ? '#fca5a5' : '#e5e7eb'}'">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1; cursor: pointer;" onclick="editMaterial(${material.id})">
            <strong style="display: block; margin-bottom: 4px;">${material.name}</strong>
            <div style="font-size: 12px; color: #6b7280;">
              <span>${material.unit_label || material.unit_type}</span>
              ${material.sku ? ` • SKU: ${material.sku}` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: start; gap: 12px;">
            <div style="text-align: right; cursor: pointer;" onclick="editMaterial(${material.id})">
              <div style="font-weight: 700; color: #059669; margin-bottom: 4px;">
                ${formatCurrency(material.cost_per_unit)}/${material.unit_label || 'unidad'}
              </div>
              ${stockLow ? `
                <div style="font-size: 11px; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; display: inline-block;">
                  ⚠️ Stock bajo
                </div>
              ` : ''}
            </div>
            <button onclick="event.stopPropagation(); deleteMaterial(${material.id}, '${material.name.replace(/'/g, "\\'")}')"
                    style="background: #fee2e2; border: none; border-radius: 6px; padding: 8px 10px; cursor: pointer; color: #dc2626; font-size: 14px; transition: all 0.2s;"
                    onmouseover="this.style.background='#ef4444'; this.style.color='white';"
                    onmouseout="this.style.background='#fee2e2'; this.style.color='#dc2626';"
                    title="Eliminar material">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ==========================================
// LOAD MATERIAL USAGE STATS (DISABLED - UI section removed)
// ==========================================

// Material usage stats section has been removed from UI
// Component information is now available in product detail modal
/*
async function loadMaterialUsageStats() {
  try {
    const response = await fetch(`${API_BASE}/bom/material-usage`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading material usage');
    }

    renderMaterialUsageStats(result.data);

  } catch (error) {
    console.error('Error loading material usage:', error);
    document.getElementById('material-usage-stats').innerHTML = `
      <p style="color: var(--danger); padding: 12px;">Error: ${error.message}</p>
    `;
  }
}

function renderMaterialUsageStats(stats) {
  const container = document.getElementById('material-usage-stats');

  if (!stats || stats.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af; padding: 12px;">No hay datos de uso disponibles</p>';
    return;
  }

  let html = '<div style="display: grid; gap: 12px;">';

  stats.slice(0, 5).forEach(stat => {
    html += `
      <div style="padding: 12px; background: #f9fafb; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <strong style="font-size: 14px;">${stat.material_name}</strong>
          <span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">
            ${stat.products_using_count} productos
          </span>
        </div>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
          ${stat.products_using || 'Sin uso'}
        </div>
        <div style="font-size: 12px; color: #059669; font-weight: 700;">
          Valor en uso: ${formatCurrency(stat.total_value_in_use || 0)}
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}
*/

// ==========================================
// LOAD PRODUCT SELECTOR FOR BOM (DISABLED - UI section removed)
// ==========================================

// Product component management is now in product detail modal
/*
async function loadProductSelectorForBOM() {
  try {
    const response = await fetch(`${API_BASE}/client/products`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading products');
    }

    const selector = document.getElementById('bom-product-selector');
    selector.innerHTML = '<option value="">-- Seleccionar producto --</option>';

    // The API returns 'products' not 'data'
    const products = result.products || [];

    products.forEach(product => {
      const option = document.createElement('option');
      option.value = product.id;
      option.textContent = product.name;
      selector.appendChild(option);
    });

  } catch (error) {
    console.error('Error loading products for BOM:', error);
  }
}

// ==========================================
// LOAD PRODUCT COMPONENTS (DISABLED - UI section removed)
// ==========================================

// OLD FUNCTION - Component management moved to product detail modal
/*
window.loadProductComponents = async function(productId) {
  if (!productId) {
    document.getElementById('product-components-container').innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔧</span>
        <p>Selecciona un producto para ver sus componentes</p>
      </div>
    `;
    document.getElementById('cost-breakdown-section').style.display = 'none';
    return;
  }

  bomState.selectedProductId = productId;

  try {
    const [componentsRes, costBreakdownRes] = await Promise.all([
      fetch(`${API_BASE}/bom/products/${productId}/components`, {
        headers: getAuthHeaders()
      }),
      fetch(`${API_BASE}/bom/products/${productId}/cost-breakdown`, {
        headers: getAuthHeaders()
      })
    ]);

    const componentsResult = await componentsRes.json();
    const costResult = await costBreakdownRes.json();

    if (!componentsResult.success) {
      throw new Error(componentsResult.error || 'Error loading components');
    }

    bomState.components = componentsResult.data;
    renderProductComponents(componentsResult.data, productId);

    if (costResult.success) {
      renderCostBreakdown(costResult.data);
    }

  } catch (error) {
    console.error('Error loading product components:', error);
    document.getElementById('product-components-container').innerHTML = `
      <p style="color: var(--danger); text-align: center; padding: 20px;">Error: ${error.message}</p>
    `;
  }
};

function renderProductComponents(components, productId) {
  const container = document.getElementById('product-components-container');

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h4 style="margin: 0;">Componentes (${components.length})</h4>
      <button class="btn btn-primary btn-small" onclick="openAddComponentModal(${productId})">
        + Agregar Componente
      </button>
    </div>
  `;

  if (!components || components.length === 0) {
    html += '<p style="color: #9ca3af; text-align: center; padding: 20px;">Este producto no tiene componentes definidos</p>';
  } else {
    html += `
      <table class="data-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Cantidad</th>
            <th>Unidad</th>
            <th>Dimensiones</th>
            <th>Desperdicio</th>
            <th>Costo</th>
            <th>Costo con Desperdicio</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;

    components.forEach(comp => {
      html += `
        <tr>
          <td><strong>${comp.material_name}</strong><br><small style="color: #6b7280;">${comp.material_sku || ''}</small></td>
          <td>${parseFloat(comp.quantity_needed).toFixed(4)}</td>
          <td>${comp.unit_label || comp.unit_type}</td>
          <td>
            ${comp.piece_width && comp.piece_height
              ? `${comp.piece_width} x ${comp.piece_height} cm`
              : 'N/A'
            }
          </td>
          <td>${parseFloat(comp.waste_percentage).toFixed(1)}%</td>
          <td>${formatCurrency(comp.component_cost)}</td>
          <td style="font-weight: 700; color: #059669;">${formatCurrency(comp.component_cost_with_waste)}</td>
          <td>
            <button class="btn-small" onclick="editComponent(${comp.id}, ${productId})" style="font-size: 11px; padding: 4px 8px;">
              ✏️
            </button>
            <button class="btn-small" onclick="deleteComponent(${comp.id}, ${productId})" style="font-size: 11px; padding: 4px 8px; background: #ef4444;">
              🗑️
            </button>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;
  }

  container.innerHTML = html;
}

function renderCostBreakdown(data) {
  const section = document.getElementById('cost-breakdown-section');
  const container = document.getElementById('cost-breakdown-content');

  section.style.display = 'block';

  const summary = data.summary;
  const marginColor = summary.margin_pct >= 20 ? '#10b981' : summary.margin_pct >= 10 ? '#f59e0b' : '#ef4444';

  let html = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="padding: 16px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <div style="font-size: 12px; color: #1e40af; margin-bottom: 4px;">MATERIALES</div>
        <div style="font-size: 20px; font-weight: 700; color: #1e40af;">${formatCurrency(summary.materials_cost)}</div>
      </div>
      <div style="padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
        <div style="font-size: 12px; color: #78350f; margin-bottom: 4px;">MANO DE OBRA</div>
        <div style="font-size: 20px; font-weight: 700; color: #78350f;">${formatCurrency(summary.labor_cost)}</div>
      </div>
      <div style="padding: 16px; background: #e0e7ff; border-radius: 8px; border-left: 4px solid #6366f1;">
        <div style="font-size: 12px; color: #3730a3; margin-bottom: 4px;">COSTO TOTAL</div>
        <div style="font-size: 20px; font-weight: 700; color: #3730a3;">${formatCurrency(summary.total_calculated_cost)}</div>
      </div>
      <div style="padding: 16px; background: ${marginColor === '#10b981' ? '#d1fae5' : marginColor === '#f59e0b' ? '#fef3c7' : '#fee2e2'}; border-radius: 8px; border-left: 4px solid ${marginColor};">
        <div style="font-size: 12px; color: #065f46; margin-bottom: 4px;">MARGEN</div>
        <div style="font-size: 20px; font-weight: 700; color: ${marginColor};">${summary.margin_pct.toFixed(1)}%</div>
        <div style="font-size: 12px; color: #065f46; margin-top: 4px;">Ganancia: ${formatCurrency(summary.profit)}</div>
      </div>
    </div>
  `;

  if (data.components && data.components.length > 0) {
    html += `
      <h4 style="margin: 0 0 12px 0;">Desglose Detallado</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Cantidad</th>
            <th>Costo/Unidad</th>
            <th>Desperdicio</th>
            <th>Costo Base</th>
            <th>Costo Desperdicio</th>
            <th>Costo Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.components.forEach(comp => {
      html += `
        <tr>
          <td><strong>${comp.material_name}</strong></td>
          <td>${parseFloat(comp.quantity_needed).toFixed(4)} ${comp.unit_label}</td>
          <td>${formatCurrency(comp.cost_per_unit)}</td>
          <td>${parseFloat(comp.waste_percentage).toFixed(1)}%</td>
          <td>${formatCurrency(comp.cost)}</td>
          <td style="color: #f59e0b;">${formatCurrency(comp.waste_cost)}</td>
          <td style="font-weight: 700; color: #059669;">${formatCurrency(comp.total_cost)}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
        <tfoot>
          <tr style="background: #f9fafb; font-weight: 700;">
            <td colspan="6" style="text-align: right;">TOTAL MATERIALES:</td>
            <td style="color: #059669;">${formatCurrency(summary.materials_cost)}</td>
          </tr>
          <tr style="background: #f9fafb; font-weight: 700;">
            <td colspan="6" style="text-align: right;">MANO DE OBRA:</td>
            <td style="color: #f59e0b;">${formatCurrency(summary.labor_cost)}</td>
          </tr>
          <tr style="background: #f3f4f6; font-weight: 700; font-size: 16px;">
            <td colspan="6" style="text-align: right;">COSTO TOTAL CALCULADO:</td>
            <td style="color: #3b82f6;">${formatCurrency(summary.total_calculated_cost)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  container.innerHTML = html;
}
*/

// ==========================================
// MATERIAL MODAL FUNCTIONS
// ==========================================

window.openAddMaterialModal = function() {
  document.getElementById('material-modal-title').textContent = 'Agregar Material';
  document.getElementById('material-form').reset();
  document.getElementById('material_id').value = '';
  document.getElementById('add-material-modal').classList.remove('hidden');
};

window.closeAddMaterialModal = function() {
  document.getElementById('add-material-modal').classList.add('hidden');
};

window.editMaterial = async function(materialId) {
  try {
    const response = await fetch(`${API_BASE}/bom/materials/${materialId}`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error loading material');
    }

    const material = result.data;

    // Populate form
    document.getElementById('material-modal-title').textContent = 'Editar Material';
    document.getElementById('material_id').value = material.id;
    document.getElementById('material_name').value = material.name || '';
    document.getElementById('material_sku').value = material.sku || '';
    document.getElementById('material_description').value = material.description || '';
    document.getElementById('material_unit_type').value = material.unit_type || '';
    document.getElementById('material_unit_label').value = material.unit_label || '';
    document.getElementById('material_cost_per_unit').value = material.cost_per_unit || '';
    document.getElementById('material_purchase_unit_size').value = material.purchase_unit_size || '';
    document.getElementById('material_purchase_unit_cost').value = material.purchase_unit_cost || '';
    document.getElementById('material_sheet_width').value = material.sheet_width || '';
    document.getElementById('material_sheet_height').value = material.sheet_height || '';
    document.getElementById('material_supplier_name').value = material.supplier_name || '';
    document.getElementById('material_supplier_code').value = material.supplier_product_code || '';
    document.getElementById('material_current_stock').value = material.current_stock || 0;
    document.getElementById('material_min_stock').value = material.min_stock_level || '';

    // Show/hide area fields
    if (material.unit_type === 'area') {
      document.getElementById('area-fields').style.display = 'block';
    }

    document.getElementById('add-material-modal').classList.remove('hidden');

  } catch (error) {
    console.error('Error loading material:', error);
    alert(`Error: ${error.message}`);
  }
};

window.handleUnitTypeChange = function(unitType) {
  const areaFields = document.getElementById('area-fields');
  if (unitType === 'area') {
    areaFields.style.display = 'block';
  } else {
    areaFields.style.display = 'none';
  }
};

window.saveMaterial = async function(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const materialId = formData.get('material_id');

  const data = {
    name: formData.get('name'),
    description: formData.get('description') || null,
    sku: formData.get('sku') || null,
    unit_type: formData.get('unit_type'),
    unit_label: formData.get('unit_label') || null,
    cost_per_unit: parseFloat(formData.get('cost_per_unit')),
    purchase_unit_size: parseFloat(formData.get('purchase_unit_size')) || null,
    purchase_unit_cost: parseFloat(formData.get('purchase_unit_cost')) || null,
    sheet_width: parseFloat(formData.get('sheet_width')) || null,
    sheet_height: parseFloat(formData.get('sheet_height')) || null,
    supplier_name: formData.get('supplier_name') || null,
    supplier_product_code: formData.get('supplier_product_code') || null,
    current_stock: parseFloat(formData.get('current_stock')) || 0,
    min_stock_level: parseFloat(formData.get('min_stock_level')) || null
  };

  try {
    const url = materialId
      ? `${API_BASE}/bom/materials/${materialId}`
      : `${API_BASE}/bom/materials`;

    const response = await fetch(url, {
      method: materialId ? 'PUT' : 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error saving material');
    }

    closeAddMaterialModal();
    alert(`✅ Material ${materialId ? 'actualizado' : 'creado'} exitosamente`);
    await loadRawMaterials();

  } catch (error) {
    console.error('Error saving material:', error);
    alert(`Error: ${error.message}`);
  }
};

/**
 * Delete a raw material
 * @param {number} materialId - ID of the material to delete
 * @param {string} materialName - Name of the material for confirmation
 */
window.deleteMaterial = async function(materialId, materialName) {
  if (!confirm(`¿Eliminar el material "${materialName}"?\n\n⚠️ Esta acción no se puede deshacer.\n\nNota: Si el material está siendo usado por algún producto, no se podrá eliminar.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/bom/materials/${materialId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al eliminar material');
    }

    alert('✅ Material eliminado exitosamente');
    await loadRawMaterials();

  } catch (error) {
    console.error('Error deleting material:', error);
    alert(`Error: ${error.message}`);
  }
};

// ==========================================
// COMPONENT MODAL FUNCTIONS
// ==========================================

// ==========================================
// OLD COMPONENT MODAL FUNCTIONS (DISABLED)
// ==========================================
// These functions were for the old BOM tab component management UI
// Component management is now integrated into the product detail modal
/*
window.openAddComponentModal = async function(productId) {
  bomState.selectedProductId = productId;
  document.getElementById('component_product_id').value = productId;
  document.getElementById('component_id').value = '';
  document.getElementById('component-form').reset();

  // Load materials into selector
  const selector = document.getElementById('component_material_id');
  selector.innerHTML = '<option value="">-- Seleccionar material --</option>';

  bomState.materials.forEach(material => {
    const option = document.createElement('option');
    option.value = material.id;
    option.textContent = `${material.name} (${material.unit_label || material.unit_type})`;
    option.dataset.unitType = material.unit_type;
    option.dataset.unitLabel = material.unit_label || material.unit_type;
    option.dataset.costPerUnit = material.cost_per_unit;
    option.dataset.sheetWidth = material.sheet_width || '';
    option.dataset.sheetHeight = material.sheet_height || '';
    selector.appendChild(option);
  });

  document.getElementById('add-component-modal').classList.remove('hidden');
};

window.closeAddComponentModal = function() {
  document.getElementById('add-component-modal').classList.add('hidden');
};

window.handleMaterialSelection = function(materialId) {
  const selector = document.getElementById('component_material_id');
  const selectedOption = selector.options[selector.selectedIndex];

  if (!materialId || !selectedOption) {
    document.getElementById('component-area-fields').style.display = 'none';
    document.getElementById('unit-hint').textContent = '';
    return;
  }

  const unitType = selectedOption.dataset.unitType;
  const unitLabel = selectedOption.dataset.unitLabel;

  bomState.selectedMaterial = {
    id: materialId,
    unitType: unitType,
    unitLabel: unitLabel,
    costPerUnit: parseFloat(selectedOption.dataset.costPerUnit),
    sheetWidth: parseFloat(selectedOption.dataset.sheetWidth) || null,
    sheetHeight: parseFloat(selectedOption.dataset.sheetHeight) || null
  };

  document.getElementById('unit-hint').textContent = `Unidad: ${unitLabel}`;

  if (unitType === 'area') {
    document.getElementById('component-area-fields').style.display = 'block';
  } else {
    document.getElementById('component-area-fields').style.display = 'none';
  }
};

window.calculateAreaCost = function() {
  if (!bomState.selectedMaterial || bomState.selectedMaterial.unitType !== 'area') {
    return;
  }

  const pieceWidth = parseFloat(document.getElementById('component_piece_width').value) || 0;
  const pieceHeight = parseFloat(document.getElementById('component_piece_height').value) || 0;

  if (pieceWidth > 0 && pieceHeight > 0) {
    const area = pieceWidth * pieceHeight;
    const cost = area * bomState.selectedMaterial.costPerUnit;

    document.getElementById('area-cost-preview').innerHTML = `
      <strong>Área calculada:</strong> ${area.toFixed(2)} cm²<br>
      <strong>Costo estimado:</strong> ${formatCurrency(cost)}
    `;

    // Auto-fill quantity
    document.getElementById('component_quantity').value = area.toFixed(4);
  }
};

window.saveComponent = async function(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const productId = formData.get('product_id');
  const componentId = formData.get('component_id');

  const data = {
    raw_material_id: parseInt(formData.get('raw_material_id')),
    quantity_needed: parseFloat(formData.get('quantity_needed')),
    unit_type: bomState.selectedMaterial.unitType,
    piece_width: parseFloat(formData.get('piece_width')) || null,
    piece_height: parseFloat(formData.get('piece_height')) || null,
    waste_percentage: parseFloat(formData.get('waste_percentage')) || 5.0,
    notes: formData.get('notes') || null
  };

  try {
    const url = componentId
      ? `${API_BASE}/bom/products/${productId}/components/${componentId}`
      : `${API_BASE}/bom/products/${productId}/components`;

    const response = await fetch(url, {
      method: componentId ? 'PUT' : 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error saving component');
    }

    closeAddComponentModal();
    alert(`✅ Componente ${componentId ? 'actualizado' : 'agregado'} exitosamente`);
    await loadProductComponents(productId);

  } catch (error) {
    console.error('Error saving component:', error);
    alert(`Error: ${error.message}`);
  }
};

window.editComponent = async function(componentId, productId) {
  // For now, just open the modal - full edit functionality would require loading component data
  alert('Función de edición en desarrollo. Por ahora, elimina y vuelve a crear el componente.');
};

window.deleteComponent = async function(componentId, productId) {
  if (!confirm('¿Eliminar este componente?')) return;

  try {
    const response = await fetch(`${API_BASE}/bom/products/${productId}/components/${componentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error deleting component');
    }

    alert('✅ Componente eliminado exitosamente');
    await loadProductComponents(productId);

  } catch (error) {
    console.error('Error deleting component:', error);
    alert(`Error: ${error.message}`);
  }
};
*/

// ==========================================
// PRODUCT DETAIL MODAL
// ==========================================

window.showProductDetail = async function(productId) {
  const modal = document.getElementById('product-detail-modal');
  const title = document.getElementById('product-detail-title');
  const body = document.getElementById('product-detail-body');

  // Show loading state
  title.textContent = 'Cargando...';
  body.innerHTML = '<div style="text-align: center; padding: 40px;"><div style="font-size: 48px;">⏳</div><p>Cargando detalles del producto...</p></div>';
  modal.classList.remove('hidden');

  try {
    // Fetch product details and price history
    const [productRes, historyRes, componentsRes, costBreakdownRes] = await Promise.all([
      fetch(`${API_BASE}/client/products/${productId}`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/prices/products/${productId}/history`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/bom/products/${productId}/components`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/bom/products/${productId}/cost-breakdown`, { headers: getAuthHeaders() })
    ]);

    const productResult = await productRes.json();
    const historyResult = await historyRes.json();
    const componentsResult = await componentsRes.json();
    const costBreakdownResult = await costBreakdownRes.json();

    if (!productResult.success) {
      throw new Error(productResult.error || 'Error loading product');
    }

    const product = productResult.product;
    title.textContent = `📦 ${product.name}`;

    // Calculate current margin
    const price = parseFloat(product.base_price);
    const cost = parseFloat(product.production_cost);
    const margin = price > 0 ? ((price - cost) / price * 100) : 0;
    const marginColor = margin >= 20 ? '#10b981' : margin >= 10 ? '#f59e0b' : '#ef4444';

    // Build components section
    let componentsHTML = '';
    if (componentsResult.success) {
      componentsHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="margin: 0;">🔧 Componentes (BOM)</h4>
            <button class="btn btn-primary" onclick="showAddComponentForm(${productId})" style="padding: 6px 12px; font-size: 13px;">
              ➕ Agregar Componente
            </button>
          </div>
      `;

      if (componentsResult.data.length > 0) {
        componentsHTML += `
          <table class="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Cantidad</th>
                <th>Unidad</th>
                <th>Desperdicio</th>
                <th>Costo</th>
                <th>Con Desperdicio</th>
                <th style="width: 80px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
        `;

        componentsResult.data.forEach(comp => {
          componentsHTML += `
            <tr>
              <td><strong>${comp.material_name}</strong><br><small style="color: #6b7280;">${comp.material_sku || ''}</small></td>
              <td>${parseFloat(comp.quantity_needed).toFixed(4)}</td>
              <td>${comp.unit_label || comp.unit_type}</td>
              <td>${parseFloat(comp.waste_percentage || 0).toFixed(1)}%</td>
              <td>${formatCurrency(comp.component_cost)}</td>
              <td style="font-weight: 700; color: #059669;">${formatCurrency(comp.component_cost_with_waste)}</td>
              <td style="text-align: center;">
                <button class="icon-btn" onclick="deleteProductComponent(${productId}, ${comp.id}, '${comp.material_name}')" title="Eliminar componente" style="color: #ef4444;">
                  🗑️
                </button>
              </td>
            </tr>
          `;
        });

        componentsHTML += `
            </tbody>
          </table>
        `;
      } else {
        componentsHTML += `
          <div style="padding: 32px; text-align: center; background: #f9fafb; border-radius: 8px; border: 2px dashed #d1d5db;">
            <div style="font-size: 48px; margin-bottom: 12px;">📦</div>
            <p style="color: #6b7280; margin: 0;">No hay componentes configurados</p>
            <p style="color: #9ca3af; font-size: 13px; margin: 8px 0 0 0;">Agrega componentes para calcular el costo automáticamente</p>
          </div>
        `;
      }

      componentsHTML += `</div>`;
    }

    // Build price history section
    let historyHTML = '';
    if (historyResult.success && historyResult.data.length > 0) {
      historyHTML = `
        <div>
          <h4 style="margin: 0 0 12px 0;">📊 Historial de Precios (últimos cambios)</h4>
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Precio</th>
                <th>Costo</th>
                <th>Margen</th>
                <th>Razón</th>
              </tr>
            </thead>
            <tbody>
      `;

      historyResult.data.slice(0, 5).forEach(entry => {
        const histMargin = parseFloat(entry.profit_margin || 0);
        const histMarginColor = histMargin >= 20 ? '#059669' : histMargin >= 10 ? '#f59e0b' : '#ef4444';
        historyHTML += `
          <tr>
            <td>${formatDatePrices(entry.effective_date)}</td>
            <td>${formatCurrency(entry.base_price)}</td>
            <td>${formatCurrency(entry.production_cost)}</td>
            <td style="color: ${histMarginColor}; font-weight: 700;">${histMargin.toFixed(1)}%</td>
            <td><small>${entry.change_reason || 'N/A'}</small></td>
          </tr>
        `;
      });

      historyHTML += `
            </tbody>
          </table>
        </div>
      `;
    }

    // Build full HTML
    const html = `
      <div style="display: grid; gap: 24px;">
        <!-- Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div style="padding: 16px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <div style="font-size: 12px; color: #1e40af; margin-bottom: 4px;">PRECIO BASE</div>
            <div style="font-size: 24px; font-weight: 700; color: #1e40af;">${formatCurrency(price)}</div>
          </div>
          <div style="padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <div style="font-size: 12px; color: #78350f; margin-bottom: 4px;">COSTO DE PRODUCCIÓN</div>
            <div style="font-size: 24px; font-weight: 700; color: #78350f;">${formatCurrency(cost)}</div>
          </div>
          <div style="padding: 16px; background: ${margin >= 20 ? '#d1fae5' : margin >= 10 ? '#fef3c7' : '#fee2e2'}; border-radius: 8px; border-left: 4px solid ${marginColor};">
            <div style="font-size: 12px; color: #065f46; margin-bottom: 4px;">MARGEN</div>
            <div style="font-size: 24px; font-weight: 700; color: ${marginColor};">${margin.toFixed(1)}%</div>
            <div style="font-size: 12px; color: #065f46; margin-top: 4px;">Ganancia: ${formatCurrency(price - cost)}</div>
          </div>
        </div>

        ${product.description ? `
          <div>
            <h4 style="margin: 0 0 8px 0;">📝 Descripción</h4>
            <p style="margin: 0; color: #6b7280;">${product.description}</p>
          </div>
        ` : ''}

        ${componentsHTML}

        ${costBreakdownResult.success ? `
          <div>
            <h4 style="margin: 0 0 12px 0;">💰 Desglose de Costos</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 16px; background: #f9fafb; border-radius: 8px;">
              <div>
                <div style="font-size: 11px; color: #6b7280;">MATERIALES</div>
                <div style="font-size: 18px; font-weight: 700; color: #3b82f6;">${formatCurrency(costBreakdownResult.data.summary.materials_cost)}</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #6b7280;">MANO DE OBRA</div>
                <div style="font-size: 18px; font-weight: 700; color: #f59e0b;">${formatCurrency(costBreakdownResult.data.summary.labor_cost)}</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #6b7280;">TOTAL</div>
                <div style="font-size: 18px; font-weight: 700; color: #059669;">${formatCurrency(costBreakdownResult.data.summary.total_calculated_cost)}</div>
              </div>
            </div>
          </div>
        ` : ''}

        ${historyHTML}

        <div style="display: flex; gap: 12px; padding-top: 16px; border-top: 2px solid #e5e7eb;">
          <button class="btn btn-primary" onclick="editProductPrice(${productId}); closeProductDetailModal();" style="flex: 1;">
            ✏️ Editar Precios
          </button>
          <button class="btn" onclick="closeProductDetailModal()" style="flex: 1; background: #e5e7eb; color: #374151;">
            Cerrar
          </button>
        </div>
      </div>
    `;

    body.innerHTML = html;

  } catch (error) {
    console.error('Error loading product details:', error);
    body.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <h3 style="color: #ef4444;">Error al cargar los detalles</h3>
        <p style="color: #6b7280;">${error.message}</p>
        <button class="btn" onclick="closeProductDetailModal()" style="margin-top: 20px;">Cerrar</button>
      </div>
    `;
  }
};

window.closeProductDetailModal = function() {
  document.getElementById('product-detail-modal').classList.add('hidden');
};

// ==========================================
// BOM COMPONENT MANAGEMENT
// ==========================================

/**
 * Show a temporary notification message
 */
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${bgColor};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000;
    font-weight: 600;
    animation: slideIn 0.3s ease-out;
  `;

  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Delete a component from product BOM
 */
window.deleteProductComponent = async function(productId, componentId, materialName) {
  if (!confirm(`¿Eliminar "${materialName}" de los componentes?\n\nEsto actualizará el costo del producto automáticamente.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/bom/products/${productId}/components/${componentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (result.success) {
      showNotification('✅ Componente eliminado correctamente', 'success');
      // Reload the product detail modal
      showProductDetail(productId);
    } else {
      throw new Error(result.error || 'Error al eliminar componente');
    }
  } catch (error) {
    console.error('Error deleting component:', error);
    alert(`Error: ${error.message}`);
  }
};

/**
 * Show form to add a new component
 */
window.showAddComponentForm = async function(productId) {
  try {
    // Fetch available raw materials
    const response = await fetch(`${API_BASE}/bom/materials`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Error al cargar materiales');
    }

    const materials = result.data;

    if (materials.length === 0) {
      alert('No hay materiales disponibles. Por favor, crea materias primas primero en la sección de BOM.');
      return;
    }

    // Create modal HTML
    const modalHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; align-items: center; justify-content: center;" id="add-component-modal" onclick="if(event.target === this) this.remove()">
        <div style="background: white; border-radius: 16px; padding: 32px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation()">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h3 style="margin: 0;">➕ Agregar Componente</h3>
            <button onclick="document.getElementById('add-component-modal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
          </div>

          <form id="add-component-form" onsubmit="submitAddComponent(event, ${productId}); return false;">
            <div style="display: grid; gap: 16px;">

              <!-- Material Selection -->
              <div>
                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151;">
                  Material <span style="color: #ef4444;">*</span>
                </label>
                <select name="raw_material_id" required style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;" onchange="updateUnitType(this)">
                  <option value="">Selecciona un material...</option>
                  ${materials.map(m => `
                    <option value="${m.id}" data-unit-type="${m.unit_type}" data-unit-label="${m.unit_label || m.unit_type}">
                      ${m.name} - ${formatCurrency(m.cost_per_unit)}/${m.unit_label || m.unit_type}
                    </option>
                  `).join('')}
                </select>
              </div>

              <!-- Quantity -->
              <div>
                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151;">
                  Cantidad Necesaria <span style="color: #ef4444;">*</span>
                </label>
                <input type="number" name="quantity_needed" step="0.0001" min="0.0001" required
                  style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;"
                  placeholder="Ej: 64 (para 64 cm²)" />
                <small id="unit-hint" style="color: #6b7280; display: block; margin-top: 4px;">Unidad: --</small>
              </div>

              <!-- Dimensions (for area-based materials) -->
              <div id="dimensions-section" style="display: none; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151;">Ancho (cm)</label>
                  <input type="number" name="piece_width" step="0.01" min="0"
                    style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;"
                    placeholder="Ej: 8.00" />
                </div>
                <div>
                  <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151;">Alto (cm)</label>
                  <input type="number" name="piece_height" step="0.01" min="0"
                    style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;"
                    placeholder="Ej: 8.00" />
                </div>
              </div>

              <!-- Waste Percentage -->
              <div>
                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151;">
                  Porcentaje de Desperdicio (%)
                </label>
                <input type="number" name="waste_percentage" step="0.1" min="0" max="100" value="5.0"
                  style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;"
                  placeholder="Ej: 5.0" />
                <small style="color: #6b7280; display: block; margin-top: 4px;">
                  Normalmente 1-5% para piezas, 5-10% para corte de hojas
                </small>
              </div>

              <!-- Notes -->
              <div>
                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151;">
                  Notas
                </label>
                <textarea name="notes" rows="2"
                  style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; resize: vertical;"
                  placeholder="Ej: 1 pieza por producto, cortado de 8x8cm"></textarea>
              </div>

              <!-- Action Buttons -->
              <div style="display: flex; gap: 12px; margin-top: 8px;">
                <button type="submit" class="btn btn-primary" style="flex: 1;">
                  ✅ Agregar Componente
                </button>
                <button type="button" class="btn" onclick="document.getElementById('add-component-modal').remove()"
                  style="flex: 1; background: #e5e7eb; color: #374151;">
                  Cancelar
                </button>
              </div>

            </div>
          </form>
        </div>
      </div>
    `;

    // Insert modal into page
    document.body.insertAdjacentHTML('beforeend', modalHTML);

  } catch (error) {
    console.error('Error showing add component form:', error);
    alert(`Error: ${error.message}`);
  }
};

/**
 * Update unit type hint when material is selected
 */
window.updateUnitType = function(selectElement) {
  const selectedOption = selectElement.options[selectElement.selectedIndex];
  const unitType = selectedOption.getAttribute('data-unit-type');
  const unitLabel = selectedOption.getAttribute('data-unit-label');
  const dimensionsSection = document.getElementById('dimensions-section');
  const unitHint = document.getElementById('unit-hint');

  if (unitType === 'area') {
    dimensionsSection.style.display = 'grid';
    unitHint.textContent = `Unidad: ${unitLabel || 'cm²'} (ingresa el área total o usa dimensiones)`;
  } else {
    dimensionsSection.style.display = 'none';
    unitHint.textContent = `Unidad: ${unitLabel || unitType}`;
  }
};

/**
 * Submit add component form
 */
window.submitAddComponent = async function(event, productId) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  const data = {
    raw_material_id: parseInt(formData.get('raw_material_id')),
    quantity_needed: parseFloat(formData.get('quantity_needed')),
    unit_type: form.querySelector('[name="raw_material_id"]').selectedOptions[0].getAttribute('data-unit-type'),
    piece_width: formData.get('piece_width') ? parseFloat(formData.get('piece_width')) : null,
    piece_height: formData.get('piece_height') ? parseFloat(formData.get('piece_height')) : null,
    waste_percentage: parseFloat(formData.get('waste_percentage')) || 5.0,
    notes: formData.get('notes') || ''
  };

  try {
    const response = await fetch(`${API_BASE}/bom/products/${productId}/components`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      showNotification('✅ Componente agregado correctamente', 'success');
      // Close the modal
      document.getElementById('add-component-modal').remove();
      // Reload the product detail modal
      showProductDetail(productId);
    } else {
      throw new Error(result.error || 'Error al agregar componente');
    }
  } catch (error) {
    console.error('Error adding component:', error);
    alert(`Error: ${error.message}`);
  }
};

// ==========================================
// SUPPLIER RECEIPTS - CLAUDE VISION ANALYSIS
// ==========================================

// State for receipt handling
const receiptState = {
  selectedFile: null,
  analyzedData: null,
  imageUrl: null,
  imagePublicId: null
};

/**
 * Open the receipt upload modal
 */
window.openReceiptUploadModal = function() {
  // Reset state
  receiptState.selectedFile = null;
  receiptState.analyzedData = null;
  receiptState.imageUrl = null;

  // Reset UI
  document.getElementById('receipt-file-input').value = '';
  document.getElementById('receipt-preview').style.display = 'none';
  document.getElementById('receipt-analysis-status').style.display = 'none';
  document.getElementById('receipt-analyze-btn').disabled = true;

  // Show modal
  document.getElementById('receipt-upload-modal').classList.remove('hidden');
};

/**
 * Close the receipt upload modal
 */
window.closeReceiptUploadModal = function() {
  document.getElementById('receipt-upload-modal').classList.add('hidden');
  receiptState.selectedFile = null;
};

/**
 * Close the receipt review modal
 */
window.closeReceiptReviewModal = function() {
  document.getElementById('receipt-review-modal').classList.add('hidden');
};

/**
 * Handle file selection for receipt upload
 */
window.handleReceiptFileSelect = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file size (15MB max)
  if (file.size > 15 * 1024 * 1024) {
    alert('El archivo es demasiado grande. Maximo 15MB.');
    return;
  }

  // Validate file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  const isHeic = file.name && /\.heic$/i.test(file.name);
  if (!validTypes.includes(file.type) && !isHeic) {
    alert('Tipo de archivo no valido. Use JPG, PNG, GIF, WEBP, HEIC o PDF.');
    return;
  }

  receiptState.selectedFile = file;

  // Show preview for images
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('receipt-preview-img').src = e.target.result;
      document.getElementById('receipt-file-name').textContent = file.name;
      document.getElementById('receipt-preview').style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    // For PDFs, just show the filename
    document.getElementById('receipt-preview-img').src = '';
    document.getElementById('receipt-preview-img').style.display = 'none';
    document.getElementById('receipt-file-name').textContent = `📄 ${file.name}`;
    document.getElementById('receipt-preview').style.display = 'block';
  }

  // Enable analyze button
  document.getElementById('receipt-analyze-btn').disabled = false;
};

/**
 * Analyze the uploaded receipt using Claude Vision API
 */
window.analyzeReceipt = async function() {
  if (!receiptState.selectedFile) {
    alert('Por favor selecciona un archivo primero.');
    return;
  }

  const analyzeBtn = document.getElementById('receipt-analyze-btn');
  const statusDiv = document.getElementById('receipt-analysis-status');

  try {
    // Show loading state
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analizando...';
    statusDiv.style.display = 'block';

    // Create form data
    const formData = new FormData();
    formData.append('receipt', receiptState.selectedFile);

    // Send to API - Note: Don't set Content-Type for FormData, browser sets it automatically
    const token = localStorage.getItem('admin_token');
    const response = await fetch(`${API_BASE}/receipts/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Do NOT set Content-Type here - browser will set multipart/form-data with boundary
      },
      body: formData
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al analizar el recibo');
    }

    // Store the analyzed data
    receiptState.analyzedData = result.data;
    receiptState.imageUrl = result.data.imageUrl;
    receiptState.imagePublicId = result.data.imagePublicId;

    console.log('📋 Receipt analyzed:', result.data);

    // Close upload modal and show review modal
    closeReceiptUploadModal();
    showReceiptReviewModal(result.data);

  } catch (error) {
    console.error('Error analyzing receipt:', error);
    alert(`Error: ${error.message}`);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analizar Recibo';
    statusDiv.style.display = 'none';
  }
};

/**
 * Show the receipt review modal with extracted data
 */
function showReceiptReviewModal(data) {
  const body = document.getElementById('receipt-review-body');

  // Build items table rows
  const itemsRows = (data.items || []).map((item, index) => {
    const matchOptions = (item.suggested_matches || []).map(m =>
      `<option value="${m.material_id}">${m.material_name} (${m.score}% match)</option>`
    ).join('');

    return `
      <tr data-index="${index}">
        <td style="padding: 12px;">${item.quantity}</td>
        <td style="padding: 12px;">
          <div>${item.description}</div>
          ${item.dimensions ? `<small style="color: #6b7280;">Dimensiones: ${item.dimensions}</small>` : ''}
        </td>
        <td style="padding: 12px; text-align: right;">$${(parseFloat(item.unit_price) || 0).toFixed(2)}</td>
        <td style="padding: 12px; text-align: right;">$${(parseFloat(item.total) || 0).toFixed(2)}</td>
        <td style="padding: 12px;">
          <select id="material-match-${index}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
            <option value="">-- Seleccionar material --</option>
            ${matchOptions}
          </select>
        </td>
      </tr>
    `;
  }).join('');

  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <!-- Left: Receipt Image -->
      <div>
        ${receiptState.imageUrl ?
          `<img src="${receiptState.imageUrl}" alt="Receipt" style="width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;">` :
          `<div style="background: #f3f4f6; padding: 40px; text-align: center; border-radius: 8px;">
            <div style="font-size: 48px; margin-bottom: 12px;">🧾</div>
            <p style="margin: 0; color: #6b7280;">Vista previa no disponible</p>
          </div>`
        }
      </div>

      <!-- Right: Extracted Data -->
      <div>
        <!-- Supplier Info -->
        <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h4 style="margin: 0 0 12px 0; color: #166534;">🏪 Proveedor</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Nombre</label>
              <input type="text" id="review-supplier-name" value="${data.supplier?.name || ''}"
                style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Folio</label>
              <input type="text" id="review-folio" value="${data.supplier?.folio || ''}"
                style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Telefono</label>
              <input type="text" id="review-supplier-phone" value="${data.supplier?.phone || ''}"
                style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Fecha</label>
              <input type="date" id="review-date" value="${data.date || ''}"
                style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
            </div>
          </div>
        </div>

        <!-- Items Table -->
        <div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 12px 0;">📦 Articulos (${data.items?.length || 0})</h4>
          <div style="overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead style="background: #f9fafb;">
                <tr>
                  <th style="padding: 12px; text-align: left; font-weight: 600;">Cant.</th>
                  <th style="padding: 12px; text-align: left; font-weight: 600;">Descripcion</th>
                  <th style="padding: 12px; text-align: right; font-weight: 600;">P. Unit.</th>
                  <th style="padding: 12px; text-align: right; font-weight: 600;">Total</th>
                  <th style="padding: 12px; text-align: left; font-weight: 600;">Vincular Material</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows || '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #6b7280;">No se encontraron articulos</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Totals -->
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Subtotal:</span>
            <span>$${((parseFloat(data.grand_total) || 0) - (parseFloat(data.discount) || 0)).toFixed(2)}</span>
          </div>
          ${data.discount ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #dc2626;">
              <span>Descuento:</span>
              <span>-$${(parseFloat(data.discount) || 0).toFixed(2)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <span>Total:</span>
            <span>$${(parseFloat(data.grand_total) || 0).toFixed(2)}</span>
          </div>
        </div>

        <!-- Confidence Indicator -->
        <div style="margin-top: 16px; padding: 12px; border-radius: 8px; ${
          data.confidence === 'high' ? 'background: #dcfce7; color: #166534;' :
          data.confidence === 'medium' ? 'background: #fef3c7; color: #92400e;' :
          'background: #fee2e2; color: #991b1b;'
        }">
          <strong>Confianza del analisis:</strong>
          ${data.confidence === 'high' ? '✅ Alta' : data.confidence === 'medium' ? '⚠️ Media' : '❌ Baja'}
          ${data.notes ? `<p style="margin: 8px 0 0 0; font-size: 14px;">${data.notes}</p>` : ''}
        </div>
      </div>
    </div>
  `;

  document.getElementById('receipt-review-modal').classList.remove('hidden');
}

/**
 * Save the reviewed receipt to the database
 */
window.saveReceipt = async function() {
  const saveBtn = document.getElementById('receipt-save-btn');

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    // Collect the data from the form
    const data = receiptState.analyzedData;

    // Update supplier info from form
    data.supplier = {
      name: document.getElementById('review-supplier-name').value,
      folio: document.getElementById('review-folio').value,
      phone: document.getElementById('review-supplier-phone').value,
      address: data.supplier?.address
    };
    data.date = document.getElementById('review-date').value;

    // Update material matches from dropdowns
    data.items = (data.items || []).map((item, index) => {
      const select = document.getElementById(`material-match-${index}`);
      if (select && select.value) {
        item.matched_material_id = parseInt(select.value);
      }
      return item;
    });

    // Add image info
    data.imageUrl = receiptState.imageUrl;
    data.imagePublicId = receiptState.imagePublicId;

    // Send to API
    const response = await fetch(`${API_BASE}/receipts/save`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al guardar el recibo');
    }

    // Success
    showNotification('✅ Recibo guardado exitosamente', 'success');
    closeReceiptReviewModal();

    // Reload receipts list
    loadReceiptsList();

  } catch (error) {
    console.error('Error saving receipt:', error);
    alert(`Error: ${error.message}`);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar Recibo';
  }
};

/**
 * Load the list of saved receipts
 */
window.loadReceiptsList = async function() {
  const listEl = document.getElementById('receipts-list');
  const loadingEl = document.getElementById('receipts-loading');
  const emptyEl = document.getElementById('receipts-empty');

  try {
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    listEl.innerHTML = '';

    const response = await fetch(`${API_BASE}/receipts`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al cargar recibos');
    }

    loadingEl.classList.add('hidden');

    if (!result.data || result.data.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    // Render receipts
    listEl.innerHTML = result.data.map(receipt => `
      <div class="receipt-card" style="display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 12px; cursor: pointer;" onclick="viewReceipt(${receipt.id})">
        ${receipt.image_url ?
          `<img src="${receipt.image_url}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">` :
          `<div style="width: 60px; height: 60px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🧾</div>`
        }
        <div style="flex: 1;">
          <div style="font-weight: 600;">${receipt.supplier_name || 'Proveedor desconocido'}</div>
          <div style="font-size: 14px; color: #6b7280;">
            ${receipt.folio ? `Folio: ${receipt.folio} • ` : ''}
            ${receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString('es-MX') : 'Sin fecha'}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600; font-size: 18px;">$${(receipt.grand_total || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</div>
          <div style="font-size: 12px; color: #6b7280;">${receipt.items_count || 0} articulos</div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading receipts:', error);
    loadingEl.classList.add('hidden');
    listEl.innerHTML = `<p style="color: #dc2626; text-align: center;">Error: ${error.message}</p>`;
  }
};

/**
 * View a specific receipt
 */
window.viewReceipt = async function(receiptId) {
  try {
    const response = await fetch(`${API_BASE}/receipts/${receiptId}`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al cargar recibo');
    }

    // Show the receipt in the review modal (read-only mode)
    const data = result.data;

    // Transform data to match review modal format
    // Parse numeric values in items to ensure they're numbers
    const parsedItems = (data.items || []).map(item => ({
      ...item,
      quantity: parseFloat(item.quantity) || 0,
      unit_price: parseFloat(item.unit_price) || 0,
      total: parseFloat(item.total) || 0
    }));

    const viewData = {
      supplier: {
        name: data.supplier_name,
        folio: data.folio,
        phone: data.supplier_phone,
        address: data.supplier_address
      },
      date: data.receipt_date,
      items: parsedItems,
      grand_total: parseFloat(data.grand_total) || 0,
      discount: parseFloat(data.discount) || 0,
      notes: data.notes,
      confidence: 'high' // Already saved, so high confidence
    };

    receiptState.imageUrl = data.image_url;
    receiptState.analyzedData = viewData;

    showReceiptReviewModal(viewData);

    // Change button to "Cerrar" since it's already saved
    document.getElementById('receipt-save-btn').textContent = 'Cerrar';
    document.getElementById('receipt-save-btn').onclick = closeReceiptReviewModal;

  } catch (error) {
    console.error('Error viewing receipt:', error);
    alert(`Error: ${error.message}`);
  }
};

/**
 * Load suppliers list
 */
window.loadSuppliersList = async function() {
  const listEl = document.getElementById('suppliers-list');

  try {
    const response = await fetch(`${API_BASE}/receipts/suppliers/list`, {
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al cargar proveedores');
    }

    if (!result.data || result.data.length === 0) {
      listEl.innerHTML = '<p style="color: #6b7280; text-align: center;">No hay proveedores registrados</p>';
      return;
    }

    listEl.innerHTML = result.data.map(supplier => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border-bottom: 1px solid #f3f4f6;">
        <div>
          <div style="font-weight: 600;">${supplier.name}</div>
          <div style="font-size: 14px; color: #6b7280;">
            ${supplier.phone || 'Sin telefono'} • ${supplier.receipts_count || 0} recibos
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600;">$${(supplier.total_purchased || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</div>
          <div style="font-size: 12px; color: #6b7280;">Total compras</div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading suppliers:', error);
    listEl.innerHTML = `<p style="color: #dc2626; text-align: center;">Error: ${error.message}</p>`;
  }
};

// Extend switchPriceTab to handle receipts tab
const originalSwitchPriceTab = window.switchPriceTab;
window.switchPriceTab = function(tabName) {
  // Call original function if it exists
  if (typeof originalSwitchPriceTab === 'function') {
    originalSwitchPriceTab(tabName);
  }

  // Update state
  priceState.currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.price-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.price-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `price-tab-${tabName}`);
  });

  // Load data for receipts tab
  if (tabName === 'receipts') {
    loadReceiptsList();
    loadSuppliersList();
  }
};

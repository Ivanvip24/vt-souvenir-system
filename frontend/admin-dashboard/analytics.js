// Analytics Dashboard - Full Implementation
// Uses Chart.js for visualizations

// Chart.js instances (for cleanup)
let revenueChart = null;
let productsPieChart = null;
let statusPieChart = null;
let cityBarChart = null;

// Analytics state
const analyticsState = {
  data: null,
  dateRange: {
    start: null,
    end: null
  },
  isLoading: false
};

/**
 * Initialize the Analytics Dashboard
 */
async function initAnalytics() {
  console.log('📊 Initializing Analytics Dashboard...');

  // Set default date range (last 30 days)
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  analyticsState.dateRange.start = start.toISOString().split('T')[0];
  analyticsState.dateRange.end = end.toISOString().split('T')[0];

  // Set date inputs
  const startInput = document.getElementById('analytics-start-date');
  const endInput = document.getElementById('analytics-end-date');
  if (startInput) startInput.value = analyticsState.dateRange.start;
  if (endInput) endInput.value = analyticsState.dateRange.end;

  // Load data
  await loadAnalyticsData();
}

/**
 * Load analytics data from API
 */
async function loadAnalyticsData() {
  if (analyticsState.isLoading) return;

  analyticsState.isLoading = true;
  showAnalyticsLoading(true);

  try {
    const { start, end } = analyticsState.dateRange;
    const url = `${API_BASE}/analytics/dashboard?startDate=${start}&endDate=${end}`;

    console.log('📊 Fetching analytics from:', url);

    const response = await fetch(url, { headers: getAuthHeaders() });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to load analytics');
    }

    analyticsState.data = result.data;
    console.log('📊 Analytics data loaded:', analyticsState.data);

    // Render all components
    renderAnalyticsSummary();
    renderRevenueChart();
    renderProductsPieChart();
    renderStatusPieChart();
    renderTopProductsTable();
    renderTopClientsTable();
    renderCityChart();

  } catch (error) {
    console.error('❌ Error loading analytics:', error);
    showAnalyticsError(error.message);
  } finally {
    analyticsState.isLoading = false;
    showAnalyticsLoading(false);
  }
}

/**
 * Show/hide loading state
 */
function showAnalyticsLoading(show) {
  const loading = document.getElementById('analytics-loading');
  const content = document.getElementById('analytics-content');

  if (loading) loading.classList.toggle('hidden', !show);
  if (content) content.classList.toggle('hidden', show);
}

/**
 * Show error message
 */
function showAnalyticsError(message) {
  const content = document.getElementById('analytics-content');
  if (content) {
    content.innerHTML = `
      <div class="analytics-error">
        <span class="error-icon">⚠️</span>
        <h3>Error al cargar analíticas</h3>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="loadAnalyticsData()">Reintentar</button>
      </div>
    `;
    content.classList.remove('hidden');
  }
}

/**
 * Render summary cards with KPIs
 */
function renderAnalyticsSummary() {
  const { summary } = analyticsState.data;
  const container = document.getElementById('analytics-summary-cards');

  if (!container) return;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getChangeClass = (value) => {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  };

  container.innerHTML = `
    <div class="summary-card primary">
      <div class="card-icon">💰</div>
      <div class="card-content">
        <span class="card-label">Ingresos Totales</span>
        <span class="card-value">${formatCurrency(summary.totalRevenue)}</span>
        <span class="card-change ${getChangeClass(summary.revenueChange)}">
          ${formatPercent(summary.revenueChange)} vs período anterior
        </span>
      </div>
    </div>

    <div class="summary-card success">
      <div class="card-icon">📈</div>
      <div class="card-content">
        <span class="card-label">Ganancia Neta</span>
        <span class="card-value">${formatCurrency(summary.totalProfit)}</span>
        <span class="card-change neutral">
          Margen: ${summary.avgProfitMargin.toFixed(1)}%
        </span>
      </div>
    </div>

    <div class="summary-card info">
      <div class="card-icon">📦</div>
      <div class="card-content">
        <span class="card-label">Total Pedidos</span>
        <span class="card-value">${summary.totalOrders}</span>
        <span class="card-change ${getChangeClass(summary.ordersChange)}">
          ${formatPercent(summary.ordersChange)} vs período anterior
        </span>
      </div>
    </div>

    <div class="summary-card warning">
      <div class="card-icon">🛒</div>
      <div class="card-content">
        <span class="card-label">Ticket Promedio</span>
        <span class="card-value">${formatCurrency(summary.avgOrderValue)}</span>
        <span class="card-change neutral">
          Por pedido
        </span>
      </div>
    </div>
  `;
}

/**
 * Render revenue line chart
 */
function renderRevenueChart() {
  const { dailyRevenue } = analyticsState.data;
  const canvas = document.getElementById('revenue-chart');

  if (!canvas || !dailyRevenue.length) return;

  // Destroy existing chart
  if (revenueChart) {
    revenueChart.destroy();
  }

  const ctx = canvas.getContext('2d');

  // Format dates and prepare data
  const labels = dailyRevenue.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  });

  const revenueData = dailyRevenue.map(d => d.revenue);
  const profitData = dailyRevenue.map(d => d.profit);

  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Ingresos',
          data: revenueData,
          borderColor: '#e91e63',
          backgroundColor: 'rgba(233, 30, 99, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#e91e63'
        },
        {
          label: 'Ganancia',
          data: profitData,
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#4caf50'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: $${context.raw.toLocaleString('es-MX')}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString('es-MX');
            }
          },
          grid: {
            color: 'rgba(0,0,0,0.05)'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

/**
 * Render products breakdown pie chart
 */
function renderProductsPieChart() {
  const { productBreakdown } = analyticsState.data;
  const canvas = document.getElementById('products-pie-chart');

  if (!canvas || !productBreakdown.length) return;

  if (productsPieChart) {
    productsPieChart.destroy();
  }

  const ctx = canvas.getContext('2d');

  const colors = [
    '#e91e63', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#00bcd4'
  ];

  productsPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: productBreakdown.map(p => p.category),
      datasets: [{
        data: productBreakdown.map(p => p.revenue),
        backgroundColor: colors.slice(0, productBreakdown.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            usePointStyle: true,
            padding: 15,
            generateLabels: function(chart) {
              const data = chart.data;
              const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
              return data.labels.map((label, i) => ({
                text: `${label} (${((data.datasets[0].data[i] / total) * 100).toFixed(0)}%)`,
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `$${value.toLocaleString('es-MX')} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Render order status pie chart
 */
function renderStatusPieChart() {
  const { ordersByStatus } = analyticsState.data;
  const canvas = document.getElementById('status-pie-chart');

  if (!canvas || !ordersByStatus.length) return;

  if (statusPieChart) {
    statusPieChart.destroy();
  }

  const ctx = canvas.getContext('2d');

  const statusColors = {
    'Pendientes': '#ff9800',
    'En Producción': '#2196f3',
    'Entregados': '#4caf50',
    'Cancelados': '#f44336',
    'Otros': '#9e9e9e'
  };

  statusPieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ordersByStatus.map(s => s.status),
      datasets: [{
        data: ordersByStatus.map(s => s.count),
        backgroundColor: ordersByStatus.map(s => statusColors[s.status] || '#9e9e9e'),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            usePointStyle: true,
            padding: 15
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.raw / total) * 100).toFixed(1);
              return `${context.raw} pedidos (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Render top products table
 */
function renderTopProductsTable() {
  const { topProducts } = analyticsState.data;
  const container = document.getElementById('top-products-list');

  if (!container) return;

  if (!topProducts.length) {
    container.innerHTML = '<p class="no-data">No hay datos de productos para este período</p>';
    return;
  }

  const maxRevenue = Math.max(...topProducts.map(p => p.revenue));

  container.innerHTML = topProducts.map((product, index) => {
    const barWidth = (product.revenue / maxRevenue) * 100;
    return `
      <div class="product-row">
        <div class="product-rank">${index + 1}</div>
        <div class="product-info">
          <div class="product-name">${product.productName}</div>
          <div class="product-stats">
            <span>${product.quantity.toLocaleString()} pzas</span>
            <span>•</span>
            <span>${product.orderCount} pedidos</span>
          </div>
          <div class="product-bar">
            <div class="bar-fill" style="width: ${barWidth}%"></div>
          </div>
        </div>
        <div class="product-revenue">$${product.revenue.toLocaleString('es-MX')}</div>
      </div>
    `;
  }).join('');
}

/**
 * Render top clients table
 */
function renderTopClientsTable() {
  const { topClients } = analyticsState.data;
  const container = document.getElementById('top-clients-list');

  if (!container) return;

  if (!topClients.length) {
    container.innerHTML = '<p class="no-data">No hay datos de clientes para este período</p>';
    return;
  }

  container.innerHTML = topClients.map((client, index) => `
    <div class="client-row">
      <div class="client-rank">${index + 1}</div>
      <div class="client-info">
        <div class="client-name">${client.clientName}</div>
        <div class="client-location">${client.city || 'Sin ciudad'}</div>
      </div>
      <div class="client-stats">
        <div class="client-orders">${client.orderCount} pedidos</div>
        <div class="client-spent">$${client.totalSpent.toLocaleString('es-MX')}</div>
      </div>
    </div>
  `).join('');
}

/**
 * Render revenue by city horizontal bar chart
 */
function renderCityChart() {
  const { revenueByCity } = analyticsState.data;
  const canvas = document.getElementById('city-chart');

  if (!canvas || !revenueByCity.length) return;

  if (cityBarChart) {
    cityBarChart.destroy();
  }

  const ctx = canvas.getContext('2d');

  cityBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: revenueByCity.map(c => c.city),
      datasets: [{
        label: 'Ingresos por Ciudad',
        data: revenueByCity.map(c => c.revenue),
        backgroundColor: 'rgba(233, 30, 99, 0.8)',
        borderColor: '#e91e63',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const city = revenueByCity[context.dataIndex];
              return [
                `Ingresos: $${context.raw.toLocaleString('es-MX')}`,
                `Pedidos: ${city.orderCount}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + (value / 1000).toFixed(0) + 'k';
            }
          },
          grid: {
            color: 'rgba(0,0,0,0.05)'
          }
        },
        y: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

/**
 * Handle date range change
 */
function handleDateRangeChange() {
  const startInput = document.getElementById('analytics-start-date');
  const endInput = document.getElementById('analytics-end-date');

  if (startInput && endInput) {
    analyticsState.dateRange.start = startInput.value;
    analyticsState.dateRange.end = endInput.value;

    if (analyticsState.dateRange.start && analyticsState.dateRange.end) {
      loadAnalyticsData();
    }
  }
}

/**
 * Set quick date range (7, 30, 90 days)
 */
function setQuickDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  analyticsState.dateRange.start = start.toISOString().split('T')[0];
  analyticsState.dateRange.end = end.toISOString().split('T')[0];

  // Update inputs
  const startInput = document.getElementById('analytics-start-date');
  const endInput = document.getElementById('analytics-end-date');
  if (startInput) startInput.value = analyticsState.dateRange.start;
  if (endInput) endInput.value = analyticsState.dateRange.end;

  // Update active button
  document.querySelectorAll('.quick-range-btn').forEach(btn => {
    btn.classList.remove('active');
    if (parseInt(btn.dataset.days) === days) {
      btn.classList.add('active');
    }
  });

  loadAnalyticsData();
}

/**
 * Export analytics data to CSV
 */
function exportAnalyticsCSV() {
  if (!analyticsState.data) {
    alert('No hay datos para exportar');
    return;
  }

  const { summary, topProducts, topClients, productBreakdown } = analyticsState.data;
  const { start, end } = analyticsState.dateRange;

  let csv = 'Reporte de Analíticas AXKAN\n';
  csv += `Período: ${start} a ${end}\n\n`;

  // Summary
  csv += 'RESUMEN\n';
  csv += `Ingresos Totales,$${summary.totalRevenue}\n`;
  csv += `Ganancia Neta,$${summary.totalProfit}\n`;
  csv += `Total Pedidos,${summary.totalOrders}\n`;
  csv += `Ticket Promedio,$${summary.avgOrderValue.toFixed(2)}\n`;
  csv += `Margen Promedio,${summary.avgProfitMargin.toFixed(1)}%\n\n`;

  // Top Products
  csv += 'TOP PRODUCTOS\n';
  csv += 'Producto,Cantidad,Ingresos,Pedidos\n';
  topProducts.forEach(p => {
    csv += `"${p.productName}",${p.quantity},$${p.revenue},${p.orderCount}\n`;
  });
  csv += '\n';

  // Top Clients
  csv += 'TOP CLIENTES\n';
  csv += 'Cliente,Ciudad,Pedidos,Total Gastado\n';
  topClients.forEach(c => {
    csv += `"${c.clientName}","${c.city || 'N/A'}",${c.orderCount},$${c.totalSpent}\n`;
  });
  csv += '\n';

  // Product Breakdown
  csv += 'DESGLOSE POR CATEGORÍA\n';
  csv += 'Categoría,Cantidad,Ingresos\n';
  productBreakdown.forEach(p => {
    csv += `"${p.category}",${p.quantity},$${p.revenue}\n`;
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `analytics_${start}_${end}.csv`;
  link.click();
}

// Make functions globally available
window.initAnalytics = initAnalytics;
window.loadAnalyticsData = loadAnalyticsData;
window.handleDateRangeChange = handleDateRangeChange;
window.setQuickDateRange = setQuickDateRange;
window.exportAnalyticsCSV = exportAnalyticsCSV;

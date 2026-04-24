/**
 * Employees Production Stats Module
 * Dashboard view for production tracking: KPIs, per-worker cards, weekly chart, daily log form
 */

// Iman-equivalent conversion rates (must match backend)
const EMP_IMAN_EQ = {
  imanes_medianos: 1.0,
  destapadores: 1.0,
  llaveros: 1.43,
  imanes_3d: 2.5,
  portallaves: 1.5,
  portaretratos: 1.5
};

const EMP_WORKER_COLORS = ['#e72a88', '#09adc2', '#8ab73b', '#f39223', '#e52421'];

const EMP_PRODUCT_LABELS = {
  imanes_medianos: 'Imanes',
  llaveros: 'Llaveros',
  destapadores: 'Destapadores',
  imanes_3d: '3D',
  portallaves: 'Portallaves',
  portaretratos: 'Portaretratos'
};

const EMP_PRODUCT_COLORS = {
  imanes_medianos: '#e72a88',
  llaveros: '#09adc2',
  destapadores: '#8ab73b',
  imanes_3d: '#f39223',
  portallaves: '#e52421',
  portaretratos: '#7c3aed'
};

let empWeeklyChartInstance = null;

/**
 * Main entry — called by switchView('employees-stats')
 */
async function loadEmployeesStats() {
  const periodSelect = document.getElementById('emp-stats-period');
  const period = periodSelect ? periodSelect.value : '30';

  try {
    const [statsRes, chartRes] = await Promise.all([
      fetch(`${API_BASE}/production/stats?days=${period}`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/production/weekly-chart?weeks=8`, { headers: getAuthHeaders() })
    ]);

    const statsData = await statsRes.json();
    const chartData = await chartRes.json();

    if (statsData.success) {
      renderEmpSummaryCards(statsData.workers || [], statsData.dailyTotals || []);
      renderEmpWorkerCards(statsData.workers || []);
      renderRecentLogs(statsData.dailyTotals || []);
    }

    if (chartData.success) {
      renderEmpWeeklyChart(chartData.data || []);
    }
  } catch (err) {
    console.error('Error loading employee stats:', err);
  }

  loadEmpDailyLogForm();
}

/**
 * Render 4 KPI summary cards
 */
function renderEmpSummaryCards(workers, dailyTotals) {
  const container = document.getElementById('emp-summary-cards');
  if (!container) return;
  container.textContent = '';

  const totalPieces = workers.reduce((s, w) => s + (Number(w.total_pieces) || 0), 0);
  const totalImanEq = workers.reduce((s, w) => s + (Number(w.iman_equivalents) || 0), 0);
  const uniqueDays = dailyTotals.length || 1;
  const avgDaily = Math.round(totalPieces / uniqueDays);
  const topWorker = workers.length
    ? workers.reduce((best, w) => (Number(w.total_pieces) || 0) > (Number(best.total_pieces) || 0) ? w : best, workers[0])
    : null;

  const cards = [
    { icon: '\uD83D\uDCE6', value: totalPieces.toLocaleString('es-MX'), label: 'Total Piezas' },
    { icon: '\u2696\uFE0F', value: totalImanEq.toLocaleString('es-MX', { maximumFractionDigits: 0 }), label: 'Iman-Equivalentes' },
    { icon: '\uD83D\uDCC8', value: avgDaily.toLocaleString('es-MX'), label: 'Promedio Diario' },
    { icon: '\uD83C\uDFC6', value: topWorker ? (topWorker.nickname || topWorker.name) : 'Sin datos', label: topWorker ? (Number(topWorker.total_pieces) || 0).toLocaleString('es-MX') + ' piezas' : 'Top Empleada' }
  ];

  cards.forEach(function (c) {
    var card = document.createElement('div');
    card.className = 'stat-card';

    var iconDiv = document.createElement('div');
    iconDiv.className = 'stat-icon';
    iconDiv.textContent = c.icon;

    var content = document.createElement('div');
    content.className = 'stat-content';

    var val = document.createElement('div');
    val.className = 'stat-value';
    val.textContent = c.value;

    var lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = c.label;

    content.appendChild(val);
    content.appendChild(lbl);
    card.appendChild(iconDiv);
    card.appendChild(content);
    container.appendChild(card);
  });
}

/**
 * Render per-worker cards
 */
function renderEmpWorkerCards(workers) {
  var container = document.getElementById('emp-worker-cards');
  if (!container) return;
  container.textContent = '';

  if (!workers.length) {
    var empty = document.createElement('p');
    empty.textContent = 'Sin datos de empleados';
    empty.style.cssText = 'color:#6b7280;text-align:center;padding:24px;';
    container.appendChild(empty);
    return;
  }

  workers.forEach(function (w, idx) {
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);';

    // Header: avatar + name
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:14px;';

    var avatar = document.createElement('div');
    var color = EMP_WORKER_COLORS[idx % EMP_WORKER_COLORS.length];
    avatar.style.cssText = 'width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;background:' + color + ';';
    avatar.textContent = (w.name || '?')[0].toUpperCase();

    var nameBlock = document.createElement('div');
    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-weight:600;color:#1f2937;';
    nameEl.textContent = w.nickname || w.name;
    nameBlock.appendChild(nameEl);

    if (w.weekly_pay) {
      var pay = document.createElement('div');
      pay.style.cssText = 'font-size:12px;color:#9ca3af;';
      pay.textContent = '$' + Number(w.weekly_pay).toLocaleString('es-MX') + '/sem';
      nameBlock.appendChild(pay);
    }

    header.appendChild(avatar);
    header.appendChild(nameBlock);
    card.appendChild(header);

    // Product pills
    var pillsRow = document.createElement('div');
    pillsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;';

    var productKeys = Object.keys(EMP_PRODUCT_LABELS);
    productKeys.forEach(function (key) {
      var apiKey = 'total_' + key;
      var count = Number(w[apiKey]) || 0;
      if (count === 0) return;

      var pill = document.createElement('span');
      pill.style.cssText = 'display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:' + EMP_PRODUCT_COLORS[key] + ';';
      pill.textContent = EMP_PRODUCT_LABELS[key] + ': ' + count.toLocaleString('es-MX');
      pillsRow.appendChild(pill);
    });
    card.appendChild(pillsRow);

    // Bottom stats
    var bottom = document.createElement('div');
    bottom.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid #f3f4f6;';

    var totalEl = document.createElement('div');
    totalEl.style.cssText = 'font-weight:700;font-size:18px;color:#1f2937;';
    totalEl.textContent = (Number(w.total_pieces) || 0).toLocaleString('es-MX') + ' pzs';

    var eqEl = document.createElement('div');
    eqEl.style.cssText = 'font-weight:700;font-size:14px;color:#e72a88;';
    eqEl.textContent = (Number(w.iman_equivalents) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' iman-eq';

    bottom.appendChild(totalEl);
    bottom.appendChild(eqEl);
    card.appendChild(bottom);

    // Days worked + avg
    var daysWorked = Number(w.days_logged) || 0;
    var avgPerDay = daysWorked > 0 ? Math.round((Number(w.total_pieces) || 0) / daysWorked) : 0;

    var meta = document.createElement('div');
    meta.style.cssText = 'font-size:12px;color:#9ca3af;margin-top:8px;';
    meta.textContent = daysWorked + ' dias trabajados \u00B7 ' + avgPerDay.toLocaleString('es-MX') + ' pzs/dia';
    card.appendChild(meta);

    container.appendChild(card);
  });
}

/**
 * Render stacked bar chart (weekly production by worker)
 */
function renderEmpWeeklyChart(chartData) {
  var canvas = document.getElementById('emp-weekly-chart');
  if (!canvas) return;

  if (empWeeklyChartInstance) {
    empWeeklyChartInstance.destroy();
    empWeeklyChartInstance = null;
  }

  if (!chartData.length) return;

  // Collect unique weeks and worker names
  var weeksSet = {};
  var workersSet = {};
  chartData.forEach(function (row) {
    weeksSet[row.week_start] = true;
    workersSet[row.name] = true;
  });

  var weeks = Object.keys(weeksSet).sort();
  var workerNames = Object.keys(workersSet);

  // Build lookup
  var lookup = {};
  chartData.forEach(function (row) {
    lookup[row.name + '|' + row.week_start] = Number(row.total_pieces) || 0;
  });

  var labels = weeks.map(function (ws) {
    // ws may be ISO "2026-04-06T00:00:00.000Z" or plain "2026-04-06"
    var dateStr = String(ws).slice(0, 10);
    var parts = dateStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  });

  var datasets = workerNames.map(function (name, idx) {
    return {
      label: name,
      data: weeks.map(function (ws) { return lookup[name + '|' + ws] || 0; }),
      backgroundColor: EMP_WORKER_COLORS[idx % EMP_WORKER_COLORS.length],
      borderRadius: 4,
      maxBarThickness: 80
    };
  });

  var ctx = canvas.getContext('2d');
  empWeeklyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          title: { display: true, text: 'Piezas' },
          beginAtZero: true
        }
      }
    }
  });
}

/**
 * Load daily log form for a given date
 */
async function loadEmpDailyLogForm() {
  var dateInput = document.getElementById('emp-log-date');
  if (!dateInput) return;

  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  var selectedDate = dateInput.value;

  var formContainer = document.getElementById('emp-daily-log-form');
  if (!formContainer) return;
  formContainer.textContent = '';

  try {
    var [workersRes, logsRes] = await Promise.all([
      fetch(API_BASE + '/production/workers', { headers: getAuthHeaders() }),
      fetch(API_BASE + '/production/daily-logs?date=' + selectedDate, { headers: getAuthHeaders() })
    ]);

    var workersData = await workersRes.json();
    var logsData = await logsRes.json();

    if (!workersData.success) return;

    var workers = (workersData.workers || []).filter(function (w) { return w.is_active; });
    var existingLogs = {};
    if (logsData.success && logsData.logs) {
      logsData.logs.forEach(function (log) { existingLogs[log.worker_id] = log; });
    }

    var fields = ['imanes_medianos', 'llaveros', 'destapadores', 'imanes_3d', 'portallaves', 'portaretratos'];

    // Header row
    var headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:grid;grid-template-columns:140px repeat(6,60px) 70px;gap:6px;align-items:center;padding:8px 0;border-bottom:2px solid #e5e7eb;margin-bottom:4px;';

    var nameHeader = document.createElement('div');
    nameHeader.style.cssText = 'font-weight:600;font-size:12px;color:#6b7280;';
    nameHeader.textContent = 'Empleado';
    headerRow.appendChild(nameHeader);

    fields.forEach(function (f) {
      var th = document.createElement('div');
      th.style.cssText = 'font-weight:600;font-size:10px;color:#6b7280;text-align:center;';
      th.textContent = EMP_PRODUCT_LABELS[f] || f;
      headerRow.appendChild(th);
    });

    var saveHeader = document.createElement('div');
    saveHeader.style.cssText = 'font-size:10px;color:#6b7280;text-align:center;';
    saveHeader.textContent = '';
    headerRow.appendChild(saveHeader);
    formContainer.appendChild(headerRow);

    // Worker rows
    workers.forEach(function (w) {
      var existing = existingLogs[w.id] || {};
      var row = document.createElement('div');
      row.id = 'emp-log-row-' + w.id;
      row.style.cssText = 'display:grid;grid-template-columns:140px repeat(6,60px) 70px;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;transition:background .3s;';

      var nameCell = document.createElement('div');
      nameCell.style.cssText = 'font-weight:600;font-size:13px;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameCell.textContent = w.nickname || w.name;
      row.appendChild(nameCell);

      fields.forEach(function (f) {
        var input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.id = 'emp-log-' + w.id + '-' + f;
        input.value = existing[f] != null ? existing[f] : '';
        input.placeholder = '0';
        input.style.cssText = 'width:56px;padding:4px;border:1px solid #d1d5db;border-radius:6px;text-align:center;font-size:13px;';
        row.appendChild(input);
      });

      var saveBtn = document.createElement('button');
      saveBtn.className = 'btn';
      saveBtn.style.cssText = 'padding:4px 10px;font-size:12px;background:#e72a88;color:#fff;border:none;border-radius:6px;cursor:pointer;';
      saveBtn.textContent = 'Guardar';
      saveBtn.addEventListener('click', function () { saveEmpDailyLog(w.id); });
      row.appendChild(saveBtn);

      formContainer.appendChild(row);
    });

  } catch (err) {
    console.error('Error loading daily log form:', err);
  }
}

/**
 * Save a daily log for a specific worker
 */
async function saveEmpDailyLog(workerId) {
  var dateInput = document.getElementById('emp-log-date');
  var logDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

  var fields = ['imanes_medianos', 'llaveros', 'destapadores', 'imanes_3d', 'portallaves', 'portaretratos'];
  var body = { worker_id: workerId, log_date: logDate };

  fields.forEach(function (f) {
    var el = document.getElementById('emp-log-' + workerId + '-' + f);
    body[f] = el ? (parseInt(el.value, 10) || 0) : 0;
  });

  var row = document.getElementById('emp-log-row-' + workerId);

  try {
    var res = await fetch(API_BASE + '/production/daily-log', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify(body)
    });

    var data = await res.json();
    if (data.success) {
      // Green flash
      if (row) {
        row.style.background = '#d1fae5';
        setTimeout(function () { row.style.background = ''; }, 1200);
      }
      // Reload stats in background
      loadEmployeesStats();
    } else {
      if (typeof showToast === 'function') {
        showToast(data.error || 'Error al guardar', 'error');
      } else {
        alert(data.error || 'Error al guardar');
      }
    }
  } catch (err) {
    console.error('Save daily log error:', err);
    if (typeof showToast === 'function') {
      showToast('Error de conexion', 'error');
    }
  }
}

/**
 * Render recent logs table from dailyTotals
 */
function renderRecentLogs(dailyTotals) {
  var tbody = document.getElementById('emp-recent-logs-body');
  if (!tbody) return;
  tbody.textContent = '';

  if (!dailyTotals.length) {
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = 9;
    td.style.cssText = 'text-align:center;padding:24px;color:#6b7280;';
    td.textContent = 'Sin registros';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  var dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

  dailyTotals.forEach(function (day) {
    var tr = document.createElement('tr');

    // Date column
    var dateTd = document.createElement('td');
    dateTd.style.cssText = 'padding:10px 12px;font-weight:600;white-space:nowrap;';
    var d = new Date(day.log_date + 'T12:00:00');
    dateTd.textContent = dayNames[d.getDay()] + ' ' + d.getDate() + ' ' + d.toLocaleDateString('es-MX', { month: 'short' });
    tr.appendChild(dateTd);

    // Worker column
    var workerTd = document.createElement('td');
    workerTd.style.cssText = 'padding:10px 12px;color:#6b7280;';
    workerTd.textContent = 'Equipo';
    tr.appendChild(workerTd);

    // Product columns
    var productFields = ['imanes_medianos', 'llaveros', 'destapadores', 'imanes_3d', 'portallaves', 'portaretratos'];
    var imanEqTotal = 0;

    productFields.forEach(function (key) {
      var td = document.createElement('td');
      td.style.cssText = 'padding:10px 8px;text-align:right;';
      var val = Number(day[key]) || 0;
      td.textContent = val.toLocaleString('es-MX');
      imanEqTotal += val * (EMP_IMAN_EQ[key] || 0);
      tr.appendChild(td);
    });

    // Total pieces
    var totalTd = document.createElement('td');
    totalTd.style.cssText = 'padding:10px 8px;text-align:right;font-weight:700;';
    totalTd.textContent = (Number(day.total_pieces) || 0).toLocaleString('es-MX');
    tr.appendChild(totalTd);

    // Iman-eq
    var eqTd = document.createElement('td');
    eqTd.style.cssText = 'padding:10px 8px;text-align:right;font-weight:700;color:#e72a88;';
    eqTd.textContent = Math.round(imanEqTotal).toLocaleString('es-MX');
    tr.appendChild(eqTd);

    tbody.appendChild(tr);
  });
}

// Expose functions globally
window.loadEmployeesStats = loadEmployeesStats;
window.loadEmpDailyLogForm = loadEmpDailyLogForm;
window.saveEmpDailyLog = saveEmpDailyLog;

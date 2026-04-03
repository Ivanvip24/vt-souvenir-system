/**
 * Designer Tracking Module
 * Manager-only view for tracking designer tasks (armado/diseño),
 * viewing stats, assigning new tasks, and triggering reports.
 *
 * Note: All data rendered via innerHTML comes exclusively from our own
 * backend API (designer names, task metadata). No user-submitted HTML
 * is rendered unescaped.
 */

// ── State ──────────────────────────────────────────
const dtState = {
  designers: [],
  tasks: [],
  filters: { designer_id: '', status: '', task_type: '' },
  loaded: false,
  formTaskType: 'armado'
};

// ── Daily Log State ───────────────────────────────
const dlState = {
  designerId: null,
  designs: 0,
  armados: 0,
  corrections: 0,
  details: [],   // [{type: 'designs'|'armados'|'corrections', source: 'Pedido #123'}]
  loaded: false
};

// ── Init / Load ────────────────────────────────────

async function loadDesignerTracking() {
  // Load designers into filter + form dropdowns on first visit
  if (!dtState.loaded) {
    dtState.loaded = true;
    initDTEventListeners();
    await loadDesignersList();
  }
  // Always refresh data
  await Promise.all([loadDTStats(), loadDTTasks()]);
}

async function loadDesignersList() {
  try {
    const data = await apiGet('/designer-tasks/designers');
    if (data.success) {
      dtState.designers = data.designers;
      const formSelect = document.getElementById('dt-form-designer');
      for (const d of data.designers) {
        const opt2 = new Option(d.name, d.name);
        formSelect.appendChild(opt2);
      }
    }
  } catch (err) {
    console.error('Error loading designers:', err);
  }
}

// ── Stats Cards ────────────────────────────────────

async function loadDTStats() {
  try {
    const data = await apiGet('/designer-tasks/stats');
    if (!data.success) return;

    // Render designer cards
    renderDesignerCards(data.designers);
  } catch (err) {
    console.error('Error loading DT stats:', err);
  }
}

function renderDesignerCards(designers) {
  const container = document.getElementById('dt-designers-row');
  if (!designers || designers.length === 0) {
    container.textContent = '';
    return;
  }

  // Build DOM safely from trusted backend data
  container.textContent = '';
  designers.forEach((d, i) => {
    const total = parseInt(d.total_tasks) || 0;
    const completed = parseInt(d.completed) || 0;
    const active = parseInt(d.active) || 0;
    const correction = parseInt(d.in_correction) || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const avgH = d.avg_hours != null ? parseFloat(d.avg_hours).toFixed(1) + 'h' : '-';
    const initial = d.name.charAt(0).toUpperCase();

    const accents = ['var(--primary)', 'var(--turquoise)', 'var(--green)', 'var(--orange)'];
    const accent = accents[i % accents.length];

    const card = document.createElement('div');
    card.className = 'dt-designer-card';
    card.style.setProperty('--accent', accent);

    // Header
    const header = document.createElement('div');
    header.className = 'dt-designer-header';

    const avatar = document.createElement('div');
    avatar.className = 'dt-designer-avatar';
    avatar.style.background = accent;
    avatar.textContent = initial;

    const info = document.createElement('div');
    info.className = 'dt-designer-info';
    const h4 = document.createElement('h4');
    h4.textContent = d.name;
    const subtitle = document.createElement('span');
    subtitle.className = 'dt-designer-subtitle';
    subtitle.textContent = `${active} activa${active !== 1 ? 's' : ''} \u00B7 ${correction} correc.`;
    info.appendChild(h4);
    info.appendChild(subtitle);

    const pctEl = document.createElement('div');
    pctEl.className = 'dt-designer-pct';
    pctEl.style.color = accent;
    pctEl.textContent = pct + '%';

    header.appendChild(avatar);
    header.appendChild(info);
    header.appendChild(pctEl);

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'dt-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'dt-progress-fill';
    progressFill.style.width = pct + '%';
    progressFill.style.background = accent;
    progressBar.appendChild(progressFill);

    // Metrics
    const metrics = document.createElement('div');
    metrics.className = 'dt-designer-metrics';
    const metricData = [
      { value: completed, label: 'Hechas' },
      { value: total, label: 'Total' },
      { value: avgH, label: 'Promedio' }
    ];
    for (const m of metricData) {
      const metric = document.createElement('div');
      metric.className = 'dt-metric';
      const val = document.createElement('span');
      val.className = 'dt-metric-value';
      val.textContent = m.value;
      const lbl = document.createElement('span');
      lbl.className = 'dt-metric-label';
      lbl.textContent = m.label;
      metric.appendChild(val);
      metric.appendChild(lbl);
      metrics.appendChild(metric);
    }

    card.style.cursor = 'pointer';
    card.addEventListener('click', () => openDTDesignerModal(d));

    card.appendChild(header);
    card.appendChild(progressBar);
    card.appendChild(metrics);
    container.appendChild(card);
  });
}

// ── Task List ──────────────────────────────────────

async function loadDTTasks() {
  const loading = document.getElementById('dt-loading');
  const listEl = document.getElementById('dt-tasks-list');
  const emptyEl = document.getElementById('dt-empty');

  loading.classList.remove('hidden');
  listEl.textContent = '';
  emptyEl.classList.add('hidden');

  try {
    const params = new URLSearchParams();
    if (dtState.filters.designer_id) params.set('designer_id', dtState.filters.designer_id);
    if (dtState.filters.status) params.set('status', dtState.filters.status);
    if (dtState.filters.task_type) params.set('task_type', dtState.filters.task_type);
    params.set('limit', '100');

    const data = await apiGet(`/designer-tasks/all?${params}`);
    loading.classList.add('hidden');

    if (!data.success || !data.tasks.length) {
      emptyEl.classList.remove('hidden');
      return;
    }

    dtState.tasks = data.tasks;
    renderDTTasks(data.tasks);
  } catch (err) {
    loading.classList.add('hidden');
    console.error('Error loading DT tasks:', err);
  }
}

function renderDTTasks(tasks) {
  const listEl = document.getElementById('dt-tasks-list');
  listEl.textContent = '';

  // Table header
  const headerEl = document.createElement('div');
  headerEl.className = 'dt-table-header';
  const headerCols = [
    { cls: 'dt-col-designer', text: 'Diseñadora' },
    { cls: 'dt-col-type', text: 'Tipo' },
    { cls: 'dt-col-product', text: 'Producto' },
    { cls: 'dt-col-dest', text: 'Destino' },
    { cls: 'dt-col-qty', text: 'Cant/Piezas' },
    { cls: 'dt-col-date', text: 'Asignada' },
    { cls: 'dt-col-status', text: 'Estado' },
    { cls: 'dt-col-actions', text: 'Acciones' }
  ];
  for (const col of headerCols) {
    const span = document.createElement('span');
    span.className = col.cls;
    span.textContent = col.text;
    headerEl.appendChild(span);
  }
  listEl.appendChild(headerEl);

  const statusLabels = {
    pending: 'Pendiente', in_progress: 'En Progreso',
    done: 'Completado', correction: 'Corrección'
  };

  for (const t of tasks) {
    const row = document.createElement('div');
    row.className = 'dt-table-row';

    const assignedDate = new Date(t.assigned_at);
    const isOverdue = ['pending', 'in_progress'].includes(t.status) &&
      (Date.now() - assignedDate.getTime()) > 2 * 24 * 60 * 60 * 1000;
    if (isOverdue) row.classList.add('dt-row-overdue');

    // Designer
    const designerCol = document.createElement('span');
    designerCol.className = 'dt-col-designer';
    const dot = document.createElement('span');
    dot.className = 'dt-designer-dot';
    dot.style.background = getDesignerColor(t.designer_name);
    designerCol.appendChild(dot);
    designerCol.appendChild(document.createTextNode(t.designer_name));

    // Type
    const typeCol = document.createElement('span');
    typeCol.className = 'dt-col-type';
    const typeBadge = document.createElement('span');
    typeBadge.className = `dt-type-badge ${t.task_type === 'armado' ? 'dt-type-armado' : 'dt-type-diseno'}`;
    typeBadge.textContent = t.task_type === 'armado' ? 'Armado' : 'Diseño';
    typeCol.appendChild(typeBadge);

    // Product
    const productCol = document.createElement('span');
    productCol.className = 'dt-col-product';
    productCol.textContent = t.product_type || t.description || '-';

    // Destination
    const destCol = document.createElement('span');
    destCol.className = 'dt-col-dest';
    destCol.textContent = t.destination || '-';

    // Quantity/pieces
    const qtyCol = document.createElement('span');
    qtyCol.className = 'dt-col-qty';
    const pieceCount = parseInt(t.piece_count) || 0;
    const piecesDone = parseInt(t.pieces_done) || 0;
    const corrections = parseInt(t.total_corrections) || 0;
    let qtyText = '-';
    if (t.quantity) qtyText = String(t.quantity);
    else if (pieceCount > 0) qtyText = `${piecesDone}/${pieceCount}`;
    qtyCol.textContent = qtyText;
    if (corrections > 0) {
      const corrSpan = document.createElement('span');
      corrSpan.className = 'dt-correction-count';
      corrSpan.textContent = ` ${corrections}x`;
      qtyCol.appendChild(corrSpan);
    }

    // Date
    const dateCol = document.createElement('span');
    dateCol.className = 'dt-col-date';
    dateCol.title = assignedDate.toLocaleString('es-MX');
    dateCol.textContent = formatTimeAgo(assignedDate);
    if (isOverdue) {
      const badge = document.createElement('span');
      badge.className = 'dt-overdue-badge';
      badge.textContent = ' !';
      dateCol.appendChild(badge);
    }

    // Status
    const statusCol = document.createElement('span');
    statusCol.className = 'dt-col-status';
    const statusBadge = document.createElement('span');
    statusBadge.className = `dt-status-badge dt-status-${t.status}`;
    statusBadge.textContent = statusLabels[t.status] || t.status;
    statusCol.appendChild(statusBadge);

    // Actions
    const actionsCol = document.createElement('span');
    actionsCol.className = 'dt-col-actions';
    if (t.status !== 'done') {
      const completeBtn = document.createElement('button');
      completeBtn.className = 'dt-action-btn dt-action-complete';
      completeBtn.title = 'Completar';
      completeBtn.textContent = '\u2713';
      completeBtn.addEventListener('click', () => dtCompleteTask(t.id));
      actionsCol.appendChild(completeBtn);

      if (t.task_type === 'diseño') {
        const corrBtn = document.createElement('button');
        corrBtn.className = 'dt-action-btn dt-action-correction';
        corrBtn.title = 'Corrección';
        corrBtn.textContent = '\u21BB';
        corrBtn.addEventListener('click', () => dtMarkCorrection(t.id));
        actionsCol.appendChild(corrBtn);
      }
    }

    row.appendChild(designerCol);
    row.appendChild(typeCol);
    row.appendChild(productCol);
    row.appendChild(destCol);
    row.appendChild(qtyCol);
    row.appendChild(dateCol);
    row.appendChild(statusCol);
    row.appendChild(actionsCol);
    listEl.appendChild(row);
  }
}

// ── Actions ────────────────────────────────────────

async function dtCompleteTask(taskId) {
  try {
    const data = await apiPost(`/designer-tasks/${taskId}/complete`, {});
    if (data.success) {
      showToast('Tarea completada', 'success');
      await Promise.all([loadDTStats(), loadDTTasks()]);
    } else {
      showToast(data.error || 'Error al completar', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

async function dtMarkCorrection(taskId) {
  const notes = prompt('Notas de corrección (opcional):');
  if (notes === null) return;
  try {
    const data = await apiPost(`/designer-tasks/${taskId}/correction`, { notes });
    if (data.success) {
      showToast('Corrección registrada', 'success');
      await Promise.all([loadDTStats(), loadDTTasks()]);
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// ── New Task Modal ─────────────────────────────────

function openDTModal() {
  document.getElementById('dt-new-task-modal').classList.remove('hidden');
}

function closeDTModal() {
  document.getElementById('dt-new-task-modal').classList.add('hidden');
  document.getElementById('dt-form-designer').value = '';
  document.getElementById('dt-form-product').value = '';
  document.getElementById('dt-form-qty').value = '';
  document.getElementById('dt-form-pieces').value = '';
  document.getElementById('dt-form-destination').value = '';
  document.getElementById('dt-form-reference').value = '';
}

async function dtSubmitNewTask() {
  const designerName = document.getElementById('dt-form-designer').value;
  const taskType = dtState.formTaskType;
  const productType = document.getElementById('dt-form-product').value.trim();
  const destination = document.getElementById('dt-form-destination').value.trim();
  const orderReference = document.getElementById('dt-form-reference').value.trim();

  if (!designerName) { showToast('Selecciona una diseñadora', 'error'); return; }
  if (!productType) { showToast('Indica el tipo de producto', 'error'); return; }

  const body = { designerName, taskType, productType, destination, orderReference };

  if (taskType === 'armado') {
    const qty = parseInt(document.getElementById('dt-form-qty').value);
    if (qty > 0) body.quantity = qty;
  } else {
    const piecesStr = document.getElementById('dt-form-pieces').value.trim();
    if (piecesStr) body.pieces = piecesStr.split(',').map(p => p.trim()).filter(Boolean);
  }

  const submitBtn = document.getElementById('dt-form-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Asignando...';

  try {
    const data = await apiPost('/designer-tasks/create', body);
    if (data.success) {
      showToast(`Tarea asignada a ${data.task.designer_name}`, 'success');
      closeDTModal();
      await Promise.all([loadDTStats(), loadDTTasks()]);
    } else {
      showToast(data.error || 'Error al crear tarea', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Asignar';
  }
}

// ── Reports ────────────────────────────────────────

async function dtTriggerReport(type) {
  const btn = document.getElementById(`dt-report-${type}-btn`);
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = 'Generando...';

  try {
    const data = await apiPost(`/designer-tasks/report/${type}`, {});
    if (data.success) {
      showToast(`Reporte ${type} generado${data.delivered ? ' y enviado' : ''}`, 'success');
    } else {
      showToast(data.error || 'Error al generar reporte', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// ── Event Listeners ────────────────────────────────

function initDTEventListeners() {
  document.getElementById('dt-refresh-btn').addEventListener('click', () => loadDesignerTracking());
  document.getElementById('dt-new-task-btn').addEventListener('click', openDTModal);


  document.querySelectorAll('.dt-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dt-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dtState.formTaskType = btn.dataset.type;
      const isArmado = btn.dataset.type === 'armado';
      document.getElementById('dt-form-qty-group').classList.toggle('hidden', !isArmado);
      document.getElementById('dt-form-pieces-group').classList.toggle('hidden', isArmado);
    });
  });

  document.getElementById('dt-form-submit').addEventListener('click', dtSubmitNewTask);
}

// ── Helpers ────────────────────────────────────────

function formatTimeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function getDesignerColor(name) {
  const colors = ['var(--primary)', 'var(--turquoise)', 'var(--green)', 'var(--orange)'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── Daily Activity Log ────────────────────────────

async function initDailyLog() {
  if (dlState.loaded) return;
  dlState.loaded = true;

  // Set today's date
  const dateEl = document.getElementById('dl-date');
  if (dateEl) {
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // Find this employee's designer ID by matching name
  try {
    const data = await apiGet('/designer-tasks/designers');
    if (data.success && data.designers.length > 0) {
      const empName = window.state?.employee?.name?.toLowerCase() || '';
      const empEmail = window.state?.employee?.email?.toLowerCase() || '';
      // Match designer by name inclusion, or by first name, or known nicknames
      const nicknames = { 'majo': ['maría josé', 'maria jose'], 'sarahi': ['sarahí', 'sarahi'] };
      const match = data.designers.find(d => {
        const dName = d.name.toLowerCase();
        if (empName.includes(dName)) return true;
        // Check if designer nickname maps to employee name
        const aliases = nicknames[dName] || [];
        return aliases.some(alias => empName.includes(alias));
      });
      if (match) {
        dlState.designerId = match.id;
        await dlLoadToday();
      } else {
        // Not a designer — hide the log section
        const section = document.getElementById('daily-log-section');
        if (section) section.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error initializing daily log:', err);
  }
}

async function dlLoadToday() {
  if (!dlState.designerId) return;
  try {
    const data = await apiGet(`/designer-tasks/daily-log/${dlState.designerId}`);
    if (data.success && data.log) {
      dlState.designs = data.log.designs_completed || 0;
      dlState.armados = data.log.armados_completed || 0;
      dlState.corrections = data.log.corrections_made || 0;
      dlState.details = data.log.details || [];
      document.getElementById('dl-designs').textContent = dlState.designs;
      document.getElementById('dl-armados').textContent = dlState.armados;
      document.getElementById('dl-corrections').textContent = dlState.corrections;
      if (data.log.notes) document.getElementById('dl-notes').value = data.log.notes;
      dlRenderDetails();
    }
  } catch (err) {
    console.error('Error loading today log:', err);
  }
}

function dlAdjust(type, delta) {
  const key = type; // designs, armados, corrections
  if (delta > 0) {
    // Show source prompt on increment
    dlShowSourcePrompt(type);
  } else {
    // On decrement, remove last item of this type and decrease counter
    if (dlState[key] <= 0) return;
    dlState[key] = Math.max(0, dlState[key] + delta);
    // Remove last detail of this type
    const idx = dlState.details.map(d => d.type).lastIndexOf(type);
    if (idx !== -1) dlState.details.splice(idx, 1);
    document.getElementById('dl-' + type).textContent = dlState[key];
    dlRenderDetails();
    dlSave();
  }
}

const DL_TYPE_LABELS = { designs: 'Diseño', armados: 'Armado', corrections: 'Corrección' };

function dlShowSourcePrompt(type) {
  // Create or reuse the source prompt modal
  let modal = document.getElementById('dl-source-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dl-source-modal';
    modal.className = 'dl-source-overlay';
    document.body.appendChild(modal);
  }

  const label = DL_TYPE_LABELS[type] || type;

  modal.innerHTML = `
    <div class="dl-source-backdrop" onclick="dlCloseSourcePrompt()"></div>
    <div class="dl-source-box">
      <div class="dl-source-title-row">
        <span class="dl-source-title">+ </span>
        <button class="dl-qty-btn" onclick="dlQtyAdjust(-1)">−</button>
        <input type="number" id="dl-source-qty" class="dl-source-qty" value="1" min="1" max="99">
        <button class="dl-qty-btn" onclick="dlQtyAdjust(1)">+</button>
        <span class="dl-source-title"> ${label}</span>
      </div>
      <div class="dl-source-subtitle">¿De dónde es?</div>
      <input type="text" id="dl-source-input" class="dl-source-input" placeholder="Ej: Pedido #142, Cliente Ana, Inventario..." autofocus>
      <div class="dl-source-actions">
        <button class="btn btn-secondary btn-sm" onclick="dlCloseSourcePrompt()">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="dlConfirmSource('${type}')">Agregar</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  setTimeout(() => {
    const input = document.getElementById('dl-source-input');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') dlConfirmSource(type);
        if (e.key === 'Escape') dlCloseSourcePrompt();
      });
    }
  }, 50);
}

function dlConfirmSource(type) {
  const input = document.getElementById('dl-source-input');
  const qtyInput = document.getElementById('dl-source-qty');
  const source = input ? input.value.trim() : '';
  const qty = Math.max(1, Math.min(99, parseInt(qtyInput?.value) || 1));

  if (!source) {
    input.style.border = '2px solid #e72a88';
    input.placeholder = 'Escribe de dónde es...';
    input.focus();
    return;
  }

  const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  dlState[type] = (dlState[type] || 0) + qty;
  for (let i = 0; i < qty; i++) {
    dlState.details.push({ type, source: qty > 1 ? source + ' (' + (i + 1) + '/' + qty + ')' : source, time });
  }
  document.getElementById('dl-' + type).textContent = dlState[type];
  dlRenderDetails();
  dlCloseSourcePrompt();
  dlSave();
}

function dlQtyAdjust(delta) {
  const input = document.getElementById('dl-source-qty');
  if (!input) return;
  const val = Math.max(1, Math.min(99, (parseInt(input.value) || 1) + delta));
  input.value = val;
}

function dlCloseSourcePrompt() {
  const modal = document.getElementById('dl-source-modal');
  if (modal) modal.classList.add('hidden');
}

function dlShowDayDetail(panel, log, dateKey) {
  panel.classList.remove('hidden');
  panel.textContent = '';

  const dateStr = new Date(dateKey + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const header = document.createElement('div');
  header.className = 'dl-detail-header';
  const title = document.createElement('strong');
  title.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  header.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'dl-detail-close';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', function() { panel.classList.add('hidden'); });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Summary row
  const summary = document.createElement('div');
  summary.className = 'dl-detail-summary';
  var items = [
    { label: 'Diseños', value: log.designs_completed, cls: 'design' },
    { label: 'Armados', value: log.armados_completed, cls: 'armado' },
    { label: 'Correcciones', value: log.corrections_made, cls: 'correction' }
  ];
  items.forEach(function(item) {
    var chip = document.createElement('span');
    chip.className = 'dl-detail-chip ' + item.cls;
    chip.textContent = item.value + ' ' + item.label;
    summary.appendChild(chip);
  });
  panel.appendChild(summary);

  // Notes
  if (log.notes) {
    var notesEl = document.createElement('div');
    notesEl.className = 'dl-detail-notes';
    notesEl.textContent = log.notes;
    panel.appendChild(notesEl);
  }

  // Details list (individual items with sources)
  var details = log.details || [];
  if (details.length > 0) {
    var listTitle = document.createElement('div');
    listTitle.className = 'dl-detail-list-title';
    listTitle.textContent = 'Detalle:';
    panel.appendChild(listTitle);

    var list = document.createElement('div');
    list.className = 'dl-detail-list';
    details.forEach(function(d) {
      var row = document.createElement('div');
      row.className = 'dl-detail-item';
      var badge = document.createElement('span');
      badge.className = 'dl-detail-badge ' + (d.type === 'designs' ? 'design' : d.type === 'armados' ? 'armado' : 'correction');
      badge.textContent = d.type === 'designs' ? 'D' : d.type === 'armados' ? 'A' : 'C';
      row.appendChild(badge);
      var src = document.createElement('span');
      src.className = 'dl-detail-source';
      src.textContent = d.source;
      row.appendChild(src);
      if (d.time) {
        var time = document.createElement('span');
        time.className = 'dl-detail-time';
        time.textContent = d.time;
        row.appendChild(time);
      }
      list.appendChild(row);
    });
    panel.appendChild(list);
  }
}

window.dlQtyAdjust = dlQtyAdjust;

function dlRenderDetails() {
  const types = ['designs', 'armados', 'corrections'];
  for (const type of types) {
    let list = document.getElementById('dl-details-' + type);
    if (!list) {
      // Create the details list container after the counter
      const counter = document.getElementById('dl-' + type);
      if (!counter) continue;
      const counterDiv = counter.closest('.dl-counter');
      if (!counterDiv) continue;
      list = document.createElement('div');
      list.id = 'dl-details-' + type;
      list.className = 'dl-details-list';
      counterDiv.appendChild(list);
    }

    const items = dlState.details.filter(d => d.type === type);
    if (items.length === 0) {
      list.innerHTML = '';
      continue;
    }

    list.innerHTML = items.map((item, i) => `
      <div class="dl-detail-item">
        <span class="dl-detail-source">${escapeHtmlDL(item.source)}</span>
        <span class="dl-detail-time">${item.time || ''}</span>
        <button class="dl-detail-remove" onclick="dlRemoveDetail('${type}', ${i})" title="Quitar">&times;</button>
      </div>
    `).join('');
  }
}

function dlRemoveDetail(type, index) {
  // Find the nth item of this type in details array
  let count = 0;
  for (let i = 0; i < dlState.details.length; i++) {
    if (dlState.details[i].type === type) {
      if (count === index) {
        dlState.details.splice(i, 1);
        break;
      }
      count++;
    }
  }
  dlState[type] = Math.max(0, dlState[type] - 1);
  document.getElementById('dl-' + type).textContent = dlState[type];
  dlRenderDetails();
}

function escapeHtmlDL(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function dlSave() {
  if (!dlState.designerId) {
    showToast('No se encontr\u00F3 tu perfil de dise\u00F1adora', 'error');
    return;
  }

  const btn = document.getElementById('dl-save-btn');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const data = await apiPost('/designer-tasks/daily-log', {
      designerId: dlState.designerId,
      designs_completed: dlState.designs,
      armados_completed: dlState.armados,
      corrections_made: dlState.corrections,
      notes: document.getElementById('dl-notes').value.trim() || null,
      details: dlState.details
    });

    if (data.success) {
      const msg = document.getElementById('dl-saved-msg');
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2500);
      showToast('Registro guardado', 'success');
    } else {
      showToast(data.error || 'Error al guardar', 'error');
    }
  } catch (err) {
    showToast('Error de conexi\u00F3n', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Registro';
  }
}

// Make daily log functions global
window.dlAdjust = dlAdjust;
window.dlSave = dlSave;
window.dlShowSourcePrompt = dlShowSourcePrompt;
window.dlConfirmSource = dlConfirmSource;
window.dlCloseSourcePrompt = dlCloseSourcePrompt;
window.dlRemoveDetail = dlRemoveDetail;

// ── Designer Detail Modal ─────────────────────────
// Note: All data rendered comes from our own backend API (designer names,
// task metadata, status enums). No user-submitted HTML is rendered.

async function openDTDesignerModal(designer) {
  const modal = document.getElementById('dt-designer-modal');
  const avatar = document.getElementById('dt-modal-avatar');
  const nameEl = document.getElementById('dt-modal-name');
  const subtitleEl = document.getElementById('dt-modal-subtitle');
  const statsEl = document.getElementById('dt-modal-stats');
  const tasksEl = document.getElementById('dt-modal-tasks');

  const total = parseInt(designer.total_tasks) || 0;
  const completed = parseInt(designer.completed) || 0;
  const active = parseInt(designer.active) || 0;
  const correction = parseInt(designer.in_correction) || 0;
  const avgH = designer.avg_hours != null ? parseFloat(designer.avg_hours).toFixed(1) + 'h' : '-';
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const accent = getDesignerColor(designer.name);
  avatar.textContent = designer.name.charAt(0).toUpperCase();
  avatar.style.background = accent;
  nameEl.textContent = designer.name;
  subtitleEl.textContent = `${active} activa${active !== 1 ? 's' : ''} \u00B7 ${correction} correcci\u00F3n${correction !== 1 ? 'es' : ''}`;

  // Build stat cards via DOM
  statsEl.textContent = '';
  const statItems = [
    { value: completed, label: 'Hechas', cls: 'done' },
    { value: active, label: 'Activas', cls: 'active' },
    { value: correction, label: 'Correcciones', cls: 'correction' },
    { value: total, label: 'Total', cls: 'total' },
    { value: pct + '%', label: 'Completado', cls: 'pct' },
    { value: avgH, label: 'Promedio', cls: 'avg' }
  ];
  for (const s of statItems) {
    const div = document.createElement('div');
    div.className = 'dt-modal-stat dt-modal-stat-' + s.cls;
    const val = document.createElement('span');
    val.className = 'dt-modal-stat-value';
    val.textContent = s.value;
    const lbl = document.createElement('span');
    lbl.className = 'dt-modal-stat-label';
    lbl.textContent = s.label;
    div.appendChild(val);
    div.appendChild(lbl);
    statsEl.appendChild(div);
  }

  // Show modal with loading state
  tasksEl.textContent = 'Cargando tareas...';
  modal.classList.remove('hidden');

  try {
    const data = await apiGet(`/designer-tasks/all?designer_id=${designer.id}&limit=50`);
    tasksEl.textContent = '';

    if (!data.success || !data.tasks.length) {
      tasksEl.textContent = 'Sin tareas asignadas';
      return;
    }

    const statusLabels = {
      pending: 'Pendiente', in_progress: 'En Progreso',
      done: 'Completado', correction: 'Correcci\u00F3n'
    };
    const statusIcons = {
      pending: '\u23F3', in_progress: '\uD83D\uDD04', done: '\u2705', correction: '\uD83D\uDD01'
    };

    // Task cards hidden — calendar view is the primary display
    const tasksToggle = document.createElement('button');
    tasksToggle.className = 'btn btn-secondary btn-sm';
    tasksToggle.textContent = 'Ver tareas asignadas (' + data.tasks.length + ')';
    const tasksContainer = document.createElement('div');
    tasksContainer.style.display = 'none';
    tasksToggle.addEventListener('click', function() {
      var showing = tasksContainer.style.display !== 'none';
      tasksContainer.style.display = showing ? 'none' : 'block';
      tasksToggle.textContent = showing ? 'Ver tareas asignadas (' + data.tasks.length + ')' : 'Ocultar tareas';
    });
    tasksEl.appendChild(tasksToggle);
    tasksEl.appendChild(tasksContainer);

    for (const t of data.tasks) {
      const card = document.createElement('div');
      card.className = 'dt-modal-task-card dt-modal-task-' + t.status;

      const assignedDate = new Date(t.assigned_at);
      const isOverdue = ['pending', 'in_progress'].includes(t.status) &&
        (Date.now() - assignedDate.getTime()) > 2 * 24 * 60 * 60 * 1000;

      const pieceCount = parseInt(t.piece_count) || 0;
      const piecesDone = parseInt(t.pieces_done) || 0;
      const corrections = parseInt(t.total_corrections) || 0;

      // Top row: icon + product info + type badge
      const topRow = document.createElement('div');
      topRow.className = 'dt-modal-task-top';

      const icon = document.createElement('span');
      icon.className = 'dt-modal-task-icon';
      icon.textContent = statusIcons[t.status] || '';

      const info = document.createElement('div');
      info.className = 'dt-modal-task-info';
      const product = document.createElement('span');
      product.className = 'dt-modal-task-product';
      product.textContent = t.product_type || '-';
      const dest = document.createElement('span');
      dest.className = 'dt-modal-task-dest';
      dest.textContent = t.destination || '';
      info.appendChild(product);
      info.appendChild(dest);

      const typeBadge = document.createElement('span');
      typeBadge.className = 'dt-type-badge ' + (t.task_type === 'armado' ? 'dt-type-armado' : 'dt-type-diseno');
      typeBadge.textContent = t.task_type === 'armado' ? 'Armado' : 'Dise\u00F1o';

      topRow.appendChild(icon);
      topRow.appendChild(info);
      topRow.appendChild(typeBadge);

      // Bottom row: status + qty + corrections + date + ref
      const bottomRow = document.createElement('div');
      bottomRow.className = 'dt-modal-task-bottom';

      const statusBadge = document.createElement('span');
      statusBadge.className = 'dt-status-badge dt-status-' + t.status;
      statusBadge.textContent = statusLabels[t.status] || t.status;
      bottomRow.appendChild(statusBadge);

      if (t.quantity) {
        const qty = document.createElement('span');
        qty.className = 'dt-modal-task-qty';
        qty.textContent = t.quantity + ' pzas';
        bottomRow.appendChild(qty);
      } else if (pieceCount > 0) {
        const qty = document.createElement('span');
        qty.className = 'dt-modal-task-qty';
        qty.textContent = piecesDone + '/' + pieceCount + ' piezas';
        bottomRow.appendChild(qty);
      }

      if (corrections > 0) {
        const corrSpan = document.createElement('span');
        corrSpan.className = 'dt-correction-count';
        corrSpan.textContent = corrections + ' correcci\u00F3n' + (corrections > 1 ? 'es' : '');
        bottomRow.appendChild(corrSpan);
      }

      const dateSpan = document.createElement('span');
      dateSpan.className = 'dt-modal-task-date';
      dateSpan.textContent = formatTimeAgo(assignedDate) + (isOverdue ? ' \u26A0\uFE0F' : '');
      bottomRow.appendChild(dateSpan);

      if (t.order_reference) {
        const ref = document.createElement('span');
        ref.className = 'dt-modal-task-ref';
        ref.textContent = t.order_reference;
        bottomRow.appendChild(ref);
      }

      card.appendChild(topRow);
      card.appendChild(bottomRow);

      // Action buttons for non-completed tasks
      if (t.status !== 'done') {
        const actions = document.createElement('div');
        actions.className = 'dt-modal-task-actions';

        const completeBtn = document.createElement('button');
        completeBtn.className = 'dt-action-btn dt-action-complete';
        completeBtn.textContent = '\u2713 Completar';
        completeBtn.addEventListener('click', async () => {
          await dtCompleteTask(t.id);
          openDTDesignerModal(designer);
        });
        actions.appendChild(completeBtn);

        if (t.task_type === 'dise\u00F1o') {
          const corrBtn = document.createElement('button');
          corrBtn.className = 'dt-action-btn dt-action-correction';
          corrBtn.textContent = '\u21BB Correcci\u00F3n';
          corrBtn.addEventListener('click', async () => {
            await dtMarkCorrection(t.id);
            openDTDesignerModal(designer);
          });
          actions.appendChild(corrBtn);
        }

        card.appendChild(actions);
      }

      tasksContainer.appendChild(card);
    }
    // Load daily logs history
    const historySection = document.createElement('div');
    historySection.className = 'dl-history-section';

    const histTitle = document.createElement('div');
    histTitle.className = 'dl-history-title';
    histTitle.textContent = 'Registro Diario (30 d\u00EDas)';
    historySection.appendChild(histTitle);

    try {
      const logsData = await apiGet(`/designer-tasks/daily-logs/${designer.id}?days=30`);
      if (logsData.success && logsData.logs.length > 0) {
        // Averages
        const avg = logsData.averages;
        const avgRow = document.createElement('div');
        avgRow.className = 'dl-averages';
        const avgItems = [
          { label: 'Dise\u00F1os/d\u00EDa', value: avg.avg_designs || '0' },
          { label: 'Armados/d\u00EDa', value: avg.avg_armados || '0' },
          { label: 'Correc./d\u00EDa', value: avg.avg_corrections || '0' },
          { label: 'D\u00EDas registrados', value: avg.days_logged || '0' }
        ];
        for (const a of avgItems) {
          const pill = document.createElement('span');
          pill.className = 'dl-avg-pill';
          const strong = document.createElement('strong');
          strong.textContent = a.value;
          pill.appendChild(strong);
          pill.appendChild(document.createTextNode(' ' + a.label));
          avgRow.appendChild(pill);
        }
        historySection.appendChild(avgRow);

        // Calendar grid
        const logsByDate = {};
        for (const log of logsData.logs) {
          const key = log.log_date.split('T')[0];
          logsByDate[key] = log;
        }

        const today = new Date();
        const calGrid = document.createElement('div');
        calGrid.className = 'dl-calendar';

        // Day headers
        const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        for (const dn of dayNames) {
          const dh = document.createElement('div');
          dh.className = 'dl-cal-header';
          dh.textContent = dn;
          calGrid.appendChild(dh);
        }

        // Build 30-day calendar starting from first day of the visible range
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
        // Align to Monday
        const startDay = startDate.getDay();
        const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
        startDate.setDate(startDate.getDate() + mondayOffset);

        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + (7 - (today.getDay() === 0 ? 7 : today.getDay())));

        const detailPanel = document.createElement('div');
        detailPanel.className = 'dl-cal-detail hidden';

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateKey = d.toISOString().split('T')[0];
          const log = logsByDate[dateKey];
          const isToday = dateKey === today.toISOString().split('T')[0];
          const isFuture = d > today;
          const isInRange = d >= new Date(today.getTime() - 29 * 86400000);

          const cell = document.createElement('div');
          cell.className = 'dl-cal-day' + (isToday ? ' today' : '') + (isFuture ? ' future' : '') + (!isInRange ? ' out-range' : '') + (log ? ' has-data' : '');

          const dayNum = document.createElement('div');
          dayNum.className = 'dl-cal-day-num';
          dayNum.textContent = d.getDate();
          cell.appendChild(dayNum);

          if (log && !isFuture) {
            const total = log.designs_completed + log.armados_completed + log.corrections_made;
            if (total > 0) {
              const dots = document.createElement('div');
              dots.className = 'dl-cal-dots';
              if (log.designs_completed > 0) {
                const dot = document.createElement('span');
                dot.className = 'dl-cal-dot design';
                dot.textContent = log.designs_completed;
                dots.appendChild(dot);
              }
              if (log.armados_completed > 0) {
                const dot = document.createElement('span');
                dot.className = 'dl-cal-dot armado';
                dot.textContent = log.armados_completed;
                dots.appendChild(dot);
              }
              if (log.corrections_made > 0) {
                const dot = document.createElement('span');
                dot.className = 'dl-cal-dot correction';
                dot.textContent = log.corrections_made;
                dots.appendChild(dot);
              }
              cell.appendChild(dots);
            }
            cell.addEventListener('click', function() {
              dlShowDayDetail(detailPanel, log, dateKey);
            });
            cell.style.cursor = 'pointer';
          }

          calGrid.appendChild(cell);
        }

        historySection.appendChild(calGrid);
        historySection.appendChild(detailPanel);
      } else {
        const empty = document.createElement('div');
        empty.className = 'dt-modal-empty';
        empty.textContent = 'Sin registros diarios a\u00FAn';
        historySection.appendChild(empty);
      }
    } catch (logErr) {
      console.error('Error loading daily logs:', logErr);
    }

    tasksEl.appendChild(historySection);

  } catch (err) {
    tasksEl.textContent = 'Error cargando tareas';
    console.error('Error loading designer tasks for modal:', err);
  }
}

function closeDTDesignerModal() {
  document.getElementById('dt-designer-modal').classList.add('hidden');
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('dt-designer-modal');
  if (e.target === modal) closeDTDesignerModal();
});

function showToast(message, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type || 'info'}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// ARMADO AI - Renderer (Frontend Logic) — Web Version
// ============================================================

const dropZone = document.getElementById('dropZone');
const dropContent = document.getElementById('dropContent');
const dropPreview = document.getElementById('dropPreview');
const previewImg = document.getElementById('previewImg');
const fileName = document.getElementById('fileName');
const clearFile = document.getElementById('clearFile');
const commandInput = document.getElementById('commandInput');
const sendBtn = document.getElementById('sendBtn');
const goBtn = document.getElementById('goBtn');
const statusMessages = document.getElementById('statusMessages');
const resultCard = document.getElementById('resultCard');
const countInput = document.getElementById('countInput');

let currentFilePath = null;
let isProcessing = false;
let selectedProduct = 'IMANES';
let selectedSize = 'Mediano';

// Product defaults
const PRODUCT_DEFAULTS = {
  IMANES: { Mini: 42, Mediano: 20, Grande: 12 },
  LLAVEROS: 35,
  DESTAPADOR: null,
  PORTALLAVES: 4,
  LIBRETA: 16,
};

const PRODUCT_ICONS = {
  IMANES: '\u25CF',
  LLAVEROS: '\u25B2',
  DESTAPADOR: '\u25A0',
  LIBRETA: '\u2B1F',
  PORTALLAVES: '\u2B22',
};

// ============================================================
// DRAG & DROP
// ============================================================

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

dropZone.addEventListener('click', (e) => {
  if (currentFilePath) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ai,.png,.jpg,.jpeg';
  input.onchange = (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  };
  input.click();
});

clearFile.addEventListener('click', (e) => {
  e.stopPropagation();
  clearCurrentFile();
});

async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ai', 'png', 'jpg', 'jpeg'].includes(ext)) {
    showToast('Formato no soportado. Usa .ai, .png o .jpg', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    currentFilePath = data.filePath;
    fileName.textContent = file.name;

    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      previewImg.src = URL.createObjectURL(file);
    } else {
      previewImg.src = '';
      previewImg.style.background = 'var(--surface-2)';
    }

    dropContent.style.display = 'none';
    dropPreview.style.display = 'flex';
    dropZone.classList.add('has-file');
    updateGoButton();
    showToast(`${file.name} cargado`, 'success', 2000);
  } catch (err) {
    showToast('Error al cargar: ' + err.message, 'error');
  }
}

function clearCurrentFile() {
  currentFilePath = null;
  dropContent.style.display = '';
  dropPreview.style.display = 'none';
  dropZone.classList.remove('has-file');
  previewImg.src = '';
  updateGoButton();
}

// Paste from clipboard
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (blob) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dataUrl: reader.result }),
            });
            const data = await res.json();
            if (data.filePath) {
              currentFilePath = data.filePath;
              fileName.textContent = 'Imagen pegada';
              previewImg.src = reader.result;
              dropContent.style.display = 'none';
              dropPreview.style.display = 'flex';
              dropZone.classList.add('has-file');
              updateGoButton();
              showToast('Imagen pegada', 'success', 2000);
            }
          } catch (err) {
            showToast('Error al pegar: ' + err.message, 'error');
          }
        };
        reader.readAsDataURL(blob);
      }
      return;
    }
  }
});

// ============================================================
// PRODUCT & SIZE SELECTORS
// ============================================================

document.getElementById('productSelector').addEventListener('click', (e) => {
  const btn = e.target.closest('.sel-btn');
  if (!btn) return;
  document.querySelectorAll('#productSelector .sel-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedProduct = btn.dataset.value;
  updateSizeVisibility();
  updateCountDefaults();
  updateGoButton();
});

document.getElementById('sizeSelector').addEventListener('click', (e) => {
  const btn = e.target.closest('.sel-btn');
  if (!btn) return;
  document.querySelectorAll('#sizeSelector .sel-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedSize = btn.dataset.value;
  updateCountDefaults();
});

function updateSizeVisibility() {
  const sizeGroup = document.getElementById('sizeGroup');
  const countPresets = document.getElementById('countPresets');
  if (selectedProduct === 'IMANES') {
    sizeGroup.style.display = '';
    countPresets.style.display = '';
  } else {
    sizeGroup.style.display = 'none';
    countPresets.style.display = 'none';
  }
}

function updateCountDefaults() {
  const defaults = PRODUCT_DEFAULTS[selectedProduct];
  if (typeof defaults === 'number') {
    countInput.value = defaults;
  } else if (defaults && defaults[selectedSize]) {
    countInput.value = defaults[selectedSize];
    // Update preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.count) === defaults[selectedSize]);
    });
  }
}

// Count controls
document.getElementById('countDown').addEventListener('click', () => {
  countInput.value = Math.max(1, parseInt(countInput.value) - 1);
});

document.getElementById('countUp').addEventListener('click', () => {
  countInput.value = Math.min(100, parseInt(countInput.value) + 1);
});

// Count presets
document.getElementById('countPresets')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  countInput.value = btn.dataset.count;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
});

// Advanced toggle
document.getElementById('toggleAdvanced').addEventListener('click', () => {
  const adv = document.getElementById('advancedInput');
  adv.style.display = adv.style.display === 'none' ? '' : 'none';
});

// ============================================================
// GO BUTTON + COMMAND INPUT
// ============================================================

function updateGoButton() {
  goBtn.disabled = !currentFilePath || isProcessing;
}

goBtn.addEventListener('click', () => {
  if (goBtn.disabled) return;
  const count = parseInt(countInput.value) || 20;
  const command = `${count} ${selectedProduct.toLowerCase()} ${selectedProduct === 'IMANES' ? selectedSize.toLowerCase() : ''}`.trim();
  runProcess(command);
});

commandInput.addEventListener('input', () => {
  sendBtn.disabled = !commandInput.value.trim().length || isProcessing;
});

commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !sendBtn.disabled) runProcess(commandInput.value.trim());
});

sendBtn.addEventListener('click', () => {
  if (!sendBtn.disabled) runProcess(commandInput.value.trim());
});

// Retry button
document.getElementById('retryBtn')?.addEventListener('click', () => {
  if (isProcessing || !currentFilePath) return;
  const count = parseInt(countInput.value) || 20;
  const command = `${count} ${selectedProduct.toLowerCase()} ${selectedProduct === 'IMANES' ? selectedSize.toLowerCase() : ''}`.trim();
  runProcess(command);
});

// ============================================================
// PROCESS
// ============================================================

async function runProcess(command) {
  if (!command || !currentFilePath) return;

  isProcessing = true;
  goBtn.disabled = true;
  goBtn.classList.add('loading');
  sendBtn.disabled = true;
  resultCard.style.display = 'none';

  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  progressBar.style.display = '';
  progressFill.style.width = '0%';

  statusMessages.innerHTML = '';
  addStatusMessage(`Comando: "${command}"`, 'info');

  const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const sse = new EventSource('/api/status/' + requestId);
  let step = 0;
  const totalSteps = 10;

  sse.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'done') { sse.close(); return; }
    if (data.message === 'Connected') return;
    addStatusMessage(data.message, data.type || 'info');
    step++;
    progressFill.style.width = Math.min((step / totalSteps) * 100, 95) + '%';
  };

  try {
    const res = await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: currentFilePath, command, requestId }),
    });
    const result = await res.json();

    if (result.error) {
      addStatusMessage(result.message, 'error');
      showToast(result.message, 'error', 10000);
    } else {
      progressFill.style.width = '100%';
      addStatusMessage('Armado completo!', 'success');
      showResult(result.data);
      showToast(
        `${result.data.total} ${result.data.product} | ${result.data.pieceWidth} x ${result.data.pieceHeight} cm`,
        'success', 8000
      );
    }
  } catch (err) {
    addStatusMessage(err.message || 'Error de conexion', 'error');
    showToast(err.message || 'Error', 'error');
  }

  sse.close();
  isProcessing = false;
  goBtn.disabled = false;
  goBtn.classList.remove('loading');
  progressBar.style.display = 'none';
  updateGoButton();
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(text, type = 'info', duration = 4000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { info: '\u2139\uFE0F', working: '\u2699\uFE0F', success: '\u2705', error: '\u274C', warning: '\u26A0\uFE0F' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-text">${escapeHtml(text)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);
  if (duration > 0) {
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, duration);
  }
  while (container.children.length > 5) container.children[0].remove();
}

// ============================================================
// STATUS MESSAGES
// ============================================================

function addStatusMessage(text, type = 'info') {
  const msg = document.createElement('div');
  msg.className = `status-msg ${type}`;
  msg.innerHTML = `<span class="dot"></span><span class="text">${escapeHtml(text)}</span>`;
  statusMessages.appendChild(msg);
  const area = document.getElementById('statusArea');
  area.scrollTop = area.scrollHeight;

  if (type === 'working') showToast(text, 'working', 3000);
  else if (type === 'error') showToast(text, 'error', 8000);
  else if (type === 'warning') showToast(text, 'warning', 6000);
}

// ============================================================
// RESULT DISPLAY
// ============================================================

function showResult(data) {
  resultCard.style.display = '';
  document.getElementById('resultIcon').textContent = PRODUCT_ICONS[data.product] || '\u25CF';
  document.getElementById('resultCount').textContent = data.total;
  document.getElementById('resultProduct').textContent = data.product;
  document.getElementById('resultSize').textContent = `${data.pieceWidth} \u00D7 ${data.pieceHeight} cm`;
  document.getElementById('resultPattern').textContent = data.pattern;
  document.getElementById('resultUtil').textContent = `${data.utilization}%`;

  // Badge for Pathfinder-verified
  const badge = document.getElementById('resultBadge');
  if (data.pattern && data.pattern.includes('Pathfinder')) {
    badge.textContent = 'PF';
    badge.title = 'Pathfinder verificado';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ============================================================
// UTILS
// ============================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

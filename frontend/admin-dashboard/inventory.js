/**
 * INVENTORY MANAGEMENT MODULE
 * Frontend logic for material inventory management
 */

const inventoryState = {
  materials: [],
  alerts: [],
  selectedMaterial: null,
  quickReceiveSession: []
};

// Load inventory when Products tab is activated
const originalSwitchView = window.switchView;
window.switchView = function(viewName) {
  originalSwitchView(viewName);

  if (viewName === 'products') {
    loadInventory();
  }
};

// ==========================================
// LOAD INVENTORY
// ==========================================

async function loadInventory() {
  const loading = document.getElementById('inventory-loading');
  const container = document.getElementById('materials-container');
  const emptyState = document.getElementById('inventory-empty-state');

  loading.classList.remove('hidden');
  container.innerHTML = '';
  emptyState.classList.add('hidden');

  try {
    const [materialsRes, alertsRes] = await Promise.all([
      fetch(`${API_BASE}/inventory/materials`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/inventory/alerts/summary`, { headers: getAuthHeaders() })
    ]);

    const materialsData = await materialsRes.json();
    const alertsData = await alertsRes.json();

    if (!materialsData.success) throw new Error(materialsData.error);

    inventoryState.materials = materialsData.materials || [];
    inventoryState.alerts = alertsData.success ? alertsData.summary : {};

    renderMaterialsView();
    renderAlertSummary();

    loading.classList.add('hidden');

    if (inventoryState.materials.length === 0) {
      emptyState.classList.remove('hidden');
    }

  } catch (error) {
    console.error('Error loading inventory:', error);
    loading.innerHTML = `
      <p style="color: var(--danger)">
        ⚠️ Error al cargar inventario. ${error.message}
      </p>
    `;
  }
}

// ==========================================
// RENDER ALERT SUMMARY
// ==========================================

function renderAlertSummary() {
  const container = document.getElementById('alert-summary');
  const alerts = inventoryState.alerts;

  container.innerHTML = `
    <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 20px; border-radius: 16px; color: white;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.9; margin-bottom: 4px;">Críticos</div>
      <div style="font-size: 32px; font-weight: 700;">${alerts.critical || 0}</div>
    </div>
    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; border-radius: 16px; color: white;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.9; margin-bottom: 4px;">Advertencias</div>
      <div style="font-size: 32px; font-weight: 700;">${alerts.warning || 0}</div>
    </div>
    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 20px; border-radius: 16px; color: white;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.9; margin-bottom: 4px;">Saludables</div>
      <div style="font-size: 32px; font-weight: 700;">${inventoryState.materials.length - (alerts.critical || 0) - (alerts.warning || 0)}</div>
    </div>
    <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 20px; border-radius: 16px; color: white;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.9; margin-bottom: 4px;">Total Materiales</div>
      <div style="font-size: 32px; font-weight: 700;">${inventoryState.materials.length}</div>
    </div>
  `;
}

// ==========================================
// RENDER MATERIALS
// ==========================================

function renderMaterialsView() {
  const container = document.getElementById('materials-container');
  container.innerHTML = '';

  inventoryState.materials.forEach(material => {
    const card = createMaterialCard(material);
    container.appendChild(card);
  });
}

function createMaterialCard(material) {
  const card = document.createElement('div');
  card.className = 'material-card';
  card.onclick = () => showMaterialDetail(material.id);

  const statusIcon = getStatusIcon(material.stock_status);
  const statusColor = getStatusColor(material.stock_status);
  const percentage = material.reorder_point > 0
    ? Math.round((material.available_stock / material.reorder_point) * 100)
    : 100;

  card.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s; border: 2px solid ${statusColor}20;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseout="this.style.transform=''; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)'">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">${material.name}</h3>
        </div>
        <div style="font-size: 28px;">${statusIcon}</div>
      </div>

      <!-- Stock Bar -->
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 12px; font-weight: 600; color: #6b7280;">DISPONIBLE</span>
          <span style="font-size: 20px; font-weight: 700; color: ${statusColor};">${parseFloat(material.available_stock).toLocaleString()} ${material.unit_type}</span>
        </div>
        <div style="height: 8px; background: #f3f4f6; border-radius: 10px; overflow: hidden;">
          <div style="width: ${Math.min(percentage, 100)}%; height: 100%; background: ${statusColor}; transition: width 0.3s;"></div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="background: #f9fafb; padding: 12px; border-radius: 10px;">
          <div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">TOTAL</div>
          <div style="font-size: 16px; font-weight: 700; color: #111827;">${parseFloat(material.current_stock).toLocaleString()}</div>
        </div>
        <div style="background: #f9fafb; padding: 12px; border-radius: 10px;">
          <div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">RESERVADO</div>
          <div style="font-size: 16px; font-weight: 700; color: #111827;">${parseFloat(material.reserved_stock).toLocaleString()}</div>
        </div>
      </div>

      <!-- Alert Badge -->
      ${material.active_alerts_count > 0 ? `
        <div style="margin-top: 12px; padding: 10px; background: ${statusColor}15; border-radius: 8px; border: 2px solid ${statusColor}30;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">⚠️</span>
            <span style="font-size: 13px; font-weight: 600; color: ${statusColor};">${material.active_alerts_count} ${material.active_alerts_count === 1 ? 'alerta activa' : 'alertas activas'}</span>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  return card;
}

function getStatusIcon(status) {
  const icons = {
    'out_of_stock': '⚫',
    'critical': '🔴',
    'low': '🟡',
    'healthy': '🟢'
  };
  return icons[status] || '⚪';
}

function getStatusColor(status) {
  const colors = {
    'out_of_stock': '#000000',
    'critical': '#ef4444',
    'low': '#f59e0b',
    'healthy': '#10b981'
  };
  return colors[status] || '#9ca3af';
}

// ==========================================
// MATERIAL DETAIL MODAL
// ==========================================

async function showMaterialDetail(materialId) {
  const material = inventoryState.materials.find(m => m.id === materialId);
  if (!material) return;

  inventoryState.selectedMaterial = material;

  const modal = document.getElementById('material-detail-modal');
  const modalBody = document.getElementById('material-modal-body');
  const modalTitle = document.getElementById('material-modal-title');

  modalTitle.textContent = material.name;

  // Load forecast and statistics
  modalBody.innerHTML = '<div style="text-align: center; padding: 40px;">Cargando detalles...</div>';

  try {
    const [forecastRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/inventory/materials/${materialId}/forecast`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/inventory/materials/${materialId}/statistics`, { headers: getAuthHeaders() })
    ]);

    const forecastData = await forecastRes.json();
    const statsData = await statsRes.json();

    const forecast = forecastData.forecast;
    const stats = statsData.statistics;

    modalBody.innerHTML = `
      <!-- Quick Actions -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px;">
        <button onclick="showPurchaseModal(${materialId})" class="btn btn-success">📦 Registrar Compra</button>
        <button onclick="showAdjustModal(${materialId})" class="btn">⚙️ Ajustar Stock</button>
      </div>

      <!-- Current Status -->
      <div style="background: linear-gradient(135deg, ${getStatusColor(material.stock_status)}, ${getStatusColor(material.stock_status)}dd); padding: 24px; border-radius: 16px; color: white; margin-bottom: 24px;">
        <div style="font-size: 14px; font-weight: 600; opacity: 0.9; margin-bottom: 8px;">ESTADO ACTUAL</div>
        <div style="font-size: 32px; font-weight: 700; margin-bottom: 4px;">${forecast.status.alertLevel.toUpperCase()}</div>
        <div style="font-size: 14px; opacity: 0.95;">${forecast.status.alertMessage}</div>
      </div>

      <!-- Stock Info -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div style="background: #f9fafb; padding: 16px; border-radius: 12px;">
          <div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">STOCK TOTAL</div>
          <div style="font-size: 24px; font-weight: 700; color: #111827;">${forecast.currentStock.toLocaleString()}</div>
          <div style="font-size: 12px; color: #6b7280;">${material.unit_type}</div>
        </div>
        <div style="background: #fef3c7; padding: 16px; border-radius: 12px;">
          <div style="font-size: 11px; color: #92400e; font-weight: 600; margin-bottom: 4px;">RESERVADO</div>
          <div style="font-size: 24px; font-weight: 700; color: #92400e;">${forecast.reservedStock.toLocaleString()}</div>
          <div style="font-size: 12px; color: #92400e;">${material.unit_type}</div>
        </div>
        <div style="background: #d1fae5; padding: 16px; border-radius: 12px;">
          <div style="font-size: 11px; color: #065f46; font-weight: 600; margin-bottom: 4px;">DISPONIBLE</div>
          <div style="font-size: 24px; font-weight: 700; color: #065f46;">${forecast.availableStock.toLocaleString()}</div>
          <div style="font-size: 12px; color: #065f46;">${material.unit_type}</div>
        </div>
      </div>

      <!-- Forecast -->
      <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700;">📊 Pronóstico</h3>
        <div style="display: grid; gap: 12px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #4b5563; font-weight: 500;">Consumo promedio diario:</span>
            <span style="font-weight: 700;">${forecast.consumption.avgDaily.toFixed(2)} ${material.unit_type}/día</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #4b5563; font-weight: 500;">Días de stock disponible:</span>
            <span style="font-weight: 700; color: ${forecast.forecast.daysOfAvailableStock < 15 ? '#ef4444' : '#10b981'};">${forecast.forecast.daysOfAvailableStock || 'N/A'} días</span>
          </div>
          ${forecast.forecast.estimatedDepletionDate ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #4b5563; font-weight: 500;">Fecha estimada de agotamiento:</span>
              <span style="font-weight: 700;">${new Date(forecast.forecast.estimatedDepletionDate).toLocaleDateString('es-MX')}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Action Recommendation -->
      <div style="background: #fef2f2; border: 2px solid #fecaca; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
        <div style="display: flex; gap: 12px;">
          <div style="font-size: 24px;">💡</div>
          <div>
            <div style="font-weight: 700; color: #991b1b; margin-bottom: 4px;">Acción Recomendada</div>
            <div style="color: #7f1d1d;">${forecast.status.recommendedAction}</div>
          </div>
        </div>
      </div>

      <!-- Supplier Info -->
      ${material.supplier_name ? `
        <div style="background: #f3f4f6; padding: 16px; border-radius: 12px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700;">🏢 Información del Proveedor</h3>
          <div style="display: grid; gap: 8px;">
            <div><span style="color: #6b7280;">Proveedor:</span> <strong>${material.supplier_name}</strong></div>
            <div><span style="color: #6b7280;">Tiempo de entrega:</span> <strong>${material.supplier_lead_time_days} días</strong></div>
            ${material.cost_per_unit ? `<div><span style="color: #6b7280;">Costo por unidad:</span> <strong>$${parseFloat(material.cost_per_unit).toFixed(2)}</strong></div>` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Consumption Stats -->
      <div style="background: #f9fafb; padding: 16px; border-radius: 12px;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700;">📈 Estadísticas de Consumo</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">ÚLTIMOS 7 DÍAS</div>
            <div style="font-size: 18px; font-weight: 700;">${forecast.consumption.last7Days.toFixed(0)} ${material.unit_type}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">ÚLTIMOS 30 DÍAS</div>
            <div style="font-size: 18px; font-weight: 700;">${forecast.consumption.last30Days.toFixed(0)} ${material.unit_type}</div>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading material details:', error);
    modalBody.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 40px;">Error al cargar detalles: ${error.message}</p>`;
  }
}

function closeMaterialDetail() {
  document.getElementById('material-detail-modal').classList.add('hidden');
  inventoryState.selectedMaterial = null;
}

// ==========================================
// ADD MATERIAL MODAL
// ==========================================

function showAddMaterialModal() {
  document.getElementById('add-material-modal').classList.remove('hidden');
  document.getElementById('material-form').reset();
}

function closeAddMaterialModal() {
  document.getElementById('add-material-modal').classList.add('hidden');
}

async function handleMaterialSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const data = {
    name: formData.get('name'),
    description: formData.get('description'),
    unitType: formData.get('unitType'),
    currentStock: parseFloat(formData.get('currentStock')),
    minStockLevel: parseFloat(formData.get('minStockLevel')),
    reorderPoint: parseFloat(formData.get('reorderPoint')),
    supplierName: formData.get('supplierName'),
    supplierLeadTimeDays: parseInt(formData.get('supplierLeadTimeDays')) || 7,
    costPerUnit: parseFloat(formData.get('costPerUnit')) || 0
  };

  try {
    const response = await fetch(`${API_BASE}/inventory/materials`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      alert('✅ Material agregado exitosamente');
      closeAddMaterialModal();
      loadInventory();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    console.error('Error adding material:', error);
    alert('Error al agregar material');
  }
}

// ==========================================
// PURCHASE MODAL
// ==========================================

function showPurchaseModal(materialId) {
  const material = inventoryState.materials.find(m => m.id === materialId);
  if (!material) return;

  const purchaseHTML = `
    <div style="background: white; padding: 20px; border-radius: 12px;">
      <h3 style="margin: 0 0 16px 0;">📦 Registrar Compra - ${material.name}</h3>
      <form id="purchase-form" onsubmit="handlePurchaseSubmit(event, ${materialId})">
        <div style="display: grid; gap: 16px;">
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Cantidad *</label>
            <input type="number" name="quantity" required min="0" step="0.01" placeholder="${material.unit_type}" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Costo por Unidad *</label>
            <input type="number" name="unitCost" required min="0" step="0.01" placeholder="$0.00" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Proveedor</label>
            <input type="text" name="supplierName" value="${material.supplier_name || ''}" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Notas</label>
            <textarea name="notes" rows="2" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px;"></textarea>
          </div>
          <button type="submit" class="btn btn-success" style="width: 100%;">Guardar Compra</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('material-modal-body').innerHTML = purchaseHTML;
}

async function handlePurchaseSubmit(event, materialId) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const data = {
    materialId: materialId,
    quantity: parseFloat(formData.get('quantity')),
    unitCost: parseFloat(formData.get('unitCost')),
    supplierName: formData.get('supplierName'),
    notes: formData.get('notes')
  };

  try {
    const response = await fetch(`${API_BASE}/inventory/purchases`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Compra registrada. Nuevo stock: ${result.newStock}`);
      closeMaterialDetail();
      loadInventory();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    console.error('Error recording purchase:', error);
    alert('Error al registrar compra');
  }
}

// ==========================================
// ADJUST STOCK MODAL
// ==========================================

function showAdjustModal(materialId) {
  const material = inventoryState.materials.find(m => m.id === materialId);
  if (!material) return;

  const adjustHTML = `
    <div style="background: white; padding: 20px; border-radius: 12px;">
      <h3 style="margin: 0 0 16px 0;">⚙️ Ajustar Stock - ${material.name}</h3>
      <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
        <strong>Stock actual:</strong> ${material.current_stock} ${material.unit_type}
      </div>
      <form id="adjust-form" onsubmit="handleAdjustSubmit(event, ${materialId})">
        <div style="display: grid; gap: 16px;">
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Nuevo Stock *</label>
            <input type="number" name="newQuantity" required min="0" step="0.01" value="${material.current_stock}" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Razón del Ajuste *</label>
            <textarea name="reason" required rows="3" placeholder="ej: Conteo físico de inventario" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px;"></textarea>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Guardar Ajuste</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('material-modal-body').innerHTML = adjustHTML;
}

async function handleAdjustSubmit(event, materialId) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const data = {
    materialId: materialId,
    newQuantity: parseFloat(formData.get('newQuantity')),
    reason: formData.get('reason')
  };

  try {
    const response = await fetch(`${API_BASE}/inventory/adjustments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Stock ajustado. Nuevo stock: ${result.newStock}`);
      closeMaterialDetail();
      loadInventory();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    console.error('Error adjusting stock:', error);
    alert('Error al ajustar stock');
  }
}

// ==========================================
// INVOICE UPLOAD MODAL
// ==========================================

function showInvoiceUploadModal() {
  document.getElementById('invoice-upload-modal').classList.remove('hidden');
}

function closeInvoiceUploadModal() {
  document.getElementById('invoice-upload-modal').classList.add('hidden');
  document.getElementById('invoice-preview').innerHTML = '';
  document.getElementById('invoice-file-input').value = '';
}

function handleInvoiceFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('invoice-preview');
    preview.innerHTML = `
      <img src="${e.target.result}" style="max-width: 100%; max-height: 400px; border-radius: 8px;">
    `;
    document.getElementById('invoice-upload-btn').disabled = false;
  };
  reader.readAsDataURL(file);
}

async function handleInvoiceUpload() {
  const fileInput = document.getElementById('invoice-file-input');
  const file = fileInput.files[0];

  if (!file) {
    alert('Please select an invoice image first');
    return;
  }

  const uploadBtn = document.getElementById('invoice-upload-btn');
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Processing...';

  try {
    const reader = new FileReader();
    reader.onload = async function(e) {
      const imageData = e.target.result;

      const response = await fetch(`${API_BASE}/inventory/invoices/process`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ imageData })
      });

      const result = await response.json();

      if (result.success) {
        showInvoiceReviewModal(result.extractedData);
        closeInvoiceUploadModal();
      } else {
        alert('Error: ' + result.error);
      }

      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Process Invoice';
    };
    reader.readAsDataURL(file);

  } catch (error) {
    console.error('Error uploading invoice:', error);
    alert('Failed to process invoice');
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Process Invoice';
  }
}

function showInvoiceReviewModal(extractedData) {
  const modal = document.getElementById('invoice-review-modal');
  const body = document.getElementById('invoice-review-body');

  let html = `
    <div style="background: #f0f9ff; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px 0;">Invoice Details</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div><strong>Supplier:</strong> ${extractedData.supplier}</div>
        <div><strong>Invoice #:</strong> ${extractedData.invoiceNumber}</div>
        <div><strong>Date:</strong> ${extractedData.invoiceDate}</div>
        <div><strong>Total:</strong> $${extractedData.total.toFixed(2)}</div>
      </div>
    </div>

    <h3 style="margin: 20px 0 12px 0;">Line Items</h3>
    <div id="invoice-line-items">
  `;

  extractedData.lineItems.forEach((item, index) => {
    html += `
      <div style="background: white; border: 2px solid #e5e7eb; padding: 16px; border-radius: 12px; margin-bottom: 12px;">
        <div style="display: grid; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <strong>${item.description}</strong>
              ${item.matchedMaterial ? `
                <div style="color: #10b981; font-size: 12px; margin-top: 4px;">
                  Matched: ${item.matchedMaterial.name} (${Math.round(item.matchConfidence * 100)}% confidence)
                </div>
              ` : `
                <div style="color: #f59e0b; font-size: 12px; margin-top: 4px;">
                  No match found - select material manually
                </div>
              `}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Material</label>
              <select id="material-select-${index}" style="width: 100%; padding: 8px; border: 2px solid #e5e7eb; border-radius: 6px;">
                <option value="">Select Material</option>
                ${inventoryState.materials.map(m => `
                  <option value="${m.id}" ${item.matchedMaterial && item.matchedMaterial.id === m.id ? 'selected' : ''}>
                    ${m.name} (${m.barcode})
                  </option>
                `).join('')}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Quantity</label>
              <input type="number" id="quantity-${index}" value="${item.quantity}" step="0.01" style="width: 100%; padding: 8px; border: 2px solid #e5e7eb; border-radius: 6px;">
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;">Unit Cost</label>
              <input type="number" id="unit-cost-${index}" value="${item.unitCost}" step="0.01" style="width: 100%; padding: 8px; border: 2px solid #e5e7eb; border-radius: 6px;">
            </div>
          </div>

          <div style="text-align: right; font-weight: 600;">
            Total: $<span id="line-total-${index}">${item.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;
  });

  html += `
    </div>
    <div style="margin-top: 20px; display: flex; gap: 12px;">
      <button onclick="approveInvoice()" class="btn btn-success" style="flex: 1;">Approve & Record All</button>
      <button onclick="closeInvoiceReviewModal()" class="btn" style="flex: 1;">Cancel</button>
    </div>
  `;

  body.innerHTML = html;

  // Store extracted data for approval
  window.currentInvoiceData = extractedData;

  modal.classList.remove('hidden');
}

function closeInvoiceReviewModal() {
  document.getElementById('invoice-review-modal').classList.add('hidden');
  window.currentInvoiceData = null;
}

async function approveInvoice() {
  const extractedData = window.currentInvoiceData;
  if (!extractedData) return;

  const lineItems = extractedData.lineItems.map((item, index) => ({
    materialId: document.getElementById(`material-select-${index}`).value,
    quantity: parseFloat(document.getElementById(`quantity-${index}`).value),
    unitCost: parseFloat(document.getElementById(`unit-cost-${index}`).value)
  }));

  // Validate
  const invalid = lineItems.some(item => !item.materialId || !item.quantity || !item.unitCost);
  if (invalid) {
    alert('Please select a material for all line items');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/inventory/invoices/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        invoiceData: extractedData,
        lineItems
      })
    });

    const result = await response.json();

    if (result.success) {
      alert(`Invoice approved! ${result.transactionsCreated} transactions recorded.`);
      closeInvoiceReviewModal();
      loadInventory();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    console.error('Error approving invoice:', error);
    alert('Failed to approve invoice');
  }
}

// ==========================================
// PRINT LABELS
// ==========================================

function showPrintLabelsModal() {
  const modal = document.getElementById('print-labels-modal');
  const body = document.getElementById('print-labels-body');

  let html = `
    <div style="margin-bottom: 20px;">
      <p>Select materials to print labels for:</p>
    </div>
    <div style="max-height: 400px; overflow-y: auto; margin-bottom: 20px;">
  `;

  inventoryState.materials.forEach(material => {
    html += `
      <label style="display: block; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px; cursor: pointer;">
        <input type="checkbox" class="label-material-checkbox" value="${material.id}" checked style="margin-right: 8px;">
        <strong>${material.name}</strong> (${material.barcode})
      </label>
    `;
  });

  html += `
    </div>
    <div style="display: flex; gap: 12px;">
      <button onclick="generateLabels()" class="btn btn-primary" style="flex: 1;">Generate Labels</button>
      <button onclick="closePrintLabelsModal()" class="btn" style="flex: 1;">Cancel</button>
    </div>
  `;

  body.innerHTML = html;
  modal.classList.remove('hidden');
}

function closePrintLabelsModal() {
  document.getElementById('print-labels-modal').classList.add('hidden');
}

function generateLabels() {
  const checkboxes = document.querySelectorAll('.label-material-checkbox:checked');
  const materialIds = Array.from(checkboxes).map(cb => cb.value);

  if (materialIds.length === 0) {
    alert('Please select at least one material');
    return;
  }

  const token = localStorage.getItem('admin_token');
  const url = `${API_BASE}/inventory/labels/generate?materials=${materialIds.join(',')}`;

  // Open in new window
  window.open(url + `&token=${token}`, '_blank');

  closePrintLabelsModal();
}

// ==========================================
// QUICK RECEIVE MODE
// ==========================================

function showQuickReceiveModal() {
  inventoryState.quickReceiveSession = [];
  const modal = document.getElementById('quick-receive-modal');
  modal.classList.remove('hidden');

  // Focus on barcode input
  setTimeout(() => {
    document.getElementById('quick-barcode-input').focus();
  }, 100);

  updateQuickReceiveDisplay();
}

function closeQuickReceiveModal() {
  document.getElementById('quick-receive-modal').classList.add('hidden');
  inventoryState.quickReceiveSession = [];
}

async function handleQuickReceiveScan(event) {
  if (event.key === 'Enter') {
    event.preventDefault();

    const input = event.target.value.trim().toUpperCase();
    if (!input) return;

    console.log('Scanned barcode:', input);

    // Check if it's a quantity barcode (QTY-XX)
    if (input.startsWith('QTY-')) {
      const quantity = input.replace('QTY-', '');
      const quantityNum = parseFloat(quantity);

      if (isNaN(quantityNum) || quantityNum <= 0) {
        showQuickReceiveMessage('Invalid quantity barcode', 'error');
        event.target.value = '';
        return;
      }

      // Auto-fill quantity
      document.getElementById('quick-quantity-input').value = quantityNum;
      showQuickReceiveMessage(`Quantity set to ${quantityNum}`, 'success');

      // Clear barcode input and refocus
      event.target.value = '';

      // If material is selected, trigger auto-submit after 2 seconds
      if (window.currentQuickReceiveMaterial) {
        // Clear any existing timer
        if (window.quickReceiveAutoSubmitTimer) {
          clearTimeout(window.quickReceiveAutoSubmitTimer);
        }

        // Set new timer
        window.quickReceiveAutoSubmitTimer = setTimeout(() => {
          handleQuickReceiveSubmit();
        }, 2000);

        document.getElementById('quick-barcode-input').focus();
      } else {
        // No material selected yet, wait for material scan
        event.target.focus();
      }
      return;
    }

    // Check if it's an action barcode
    if (input.startsWith('ACTION-')) {
      const action = input.replace('ACTION-', '');

      if (action === 'CONFIRM') {
        // Auto-submit the form
        await handleQuickReceiveSubmit();
      } else if (action === 'CLEAR') {
        // Clear current selection
        clearQuickReceiveForm();
        showQuickReceiveMessage('Form cleared', 'info');
      } else if (action === 'CANCEL') {
        // Close modal
        closeQuickReceiveModal();
      }

      event.target.value = '';
      return;
    }

    // It's a material barcode - look it up
    const barcode = input;

    try {
      const response = await fetch(`${API_BASE}/inventory/materials/barcode/${barcode}`, {
        headers: getAuthHeaders()
      });

      const result = await response.json();

      if (result.success) {
        // Show material found, focus on quantity
        document.getElementById('quick-material-info').innerHTML = `
          <div style="background: #d1fae5; padding: 16px; border-radius: 12px; border: 2px solid #10b981;">
            <div style="font-size: 18px; font-weight: 700; color: #065f46; margin-bottom: 8px;">
              ${result.material.name}
            </div>
            <div style="color: #065f46;">
              Barcode: ${result.material.barcode} | Current Stock: ${result.material.current_stock} ${result.material.unit_type}
            </div>
          </div>
        `;

        // Store current material
        window.currentQuickReceiveMaterial = result.material;

        // Focus on quantity input
        document.getElementById('quick-quantity-input').focus();
        document.getElementById('quick-quantity-input').select();
      } else {
        document.getElementById('quick-material-info').innerHTML = `
          <div style="background: #fee2e2; padding: 16px; border-radius: 12px; border: 2px solid #ef4444; color: #991b1b;">
            Material not found: ${barcode}
          </div>
        `;
        event.target.value = '';
      }
    } catch (error) {
      console.error('Error looking up material:', error);
      document.getElementById('quick-material-info').innerHTML = `
        <div style="background: #fee2e2; padding: 16px; border-radius: 12px; border: 2px solid #ef4444; color: #991b1b;">
          Error looking up material
        </div>
      `;
      event.target.value = '';
    }
  }
}

function showQuickReceiveMessage(message, type = 'info') {
  const colors = {
    success: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
  };

  const color = colors[type] || colors.info;

  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${color.bg};
    border: 2px solid ${color.border};
    color: ${color.text};
    padding: 16px 24px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease-out;
  `;
  messageDiv.textContent = message;

  document.body.appendChild(messageDiv);

  setTimeout(() => {
    messageDiv.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => messageDiv.remove(), 300);
  }, 2000);
}

function clearQuickReceiveForm() {
  document.getElementById('quick-barcode-input').value = '';
  document.getElementById('quick-quantity-input').value = '';
  document.getElementById('quick-material-info').innerHTML = '';
  window.currentQuickReceiveMaterial = null;

  // Clear any auto-submit timer
  if (window.quickReceiveAutoSubmitTimer) {
    clearTimeout(window.quickReceiveAutoSubmitTimer);
    window.quickReceiveAutoSubmitTimer = null;
  }

  document.getElementById('quick-barcode-input').focus();
}

async function handleQuickReceiveQuantity(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    await handleQuickReceiveSubmit();
  }
}

async function handleQuickReceiveSubmit() {
  const quantity = parseFloat(document.getElementById('quick-quantity-input').value);
  if (!quantity || quantity <= 0) {
    showQuickReceiveMessage('Please enter a valid quantity', 'error');
    return;
  }

  const material = window.currentQuickReceiveMaterial;
  if (!material) {
    showQuickReceiveMessage('No material selected', 'error');
    return;
  }

  // Clear any auto-submit timer
  if (window.quickReceiveAutoSubmitTimer) {
    clearTimeout(window.quickReceiveAutoSubmitTimer);
    window.quickReceiveAutoSubmitTimer = null;
  }

  // Record the receive
  try {
    const response = await fetch(`${API_BASE}/inventory/quick-receive`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        barcode: material.barcode,
        quantity: quantity
      })
    });

    const result = await response.json();

    if (result.success) {
      // Add to session
      inventoryState.quickReceiveSession.unshift({
        material: result.material,
        transaction: result.transaction
      });

      // Keep only last 10
      if (inventoryState.quickReceiveSession.length > 10) {
        inventoryState.quickReceiveSession.pop();
      }

      updateQuickReceiveDisplay();
      showQuickReceiveMessage(`Received: ${quantity} ${material.unit_type} of ${material.name}`, 'success');

      // Clear and refocus on barcode input
      clearQuickReceiveForm();
    } else {
      showQuickReceiveMessage('Error: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error recording quick receive:', error);
    showQuickReceiveMessage('Failed to record receive', 'error');
  }
}

function updateQuickReceiveDisplay() {
  const container = document.getElementById('quick-receive-history');

  if (inventoryState.quickReceiveSession.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #9ca3af; padding: 40px;">
        No items received yet in this session
      </div>
    `;
    return;
  }

  let html = '<div style="display: grid; gap: 12px;">';

  inventoryState.quickReceiveSession.forEach(item => {
    html += `
      <div style="background: white; padding: 16px; border-radius: 12px; border: 2px solid #e5e7eb;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; font-size: 18px; margin-bottom: 4px;">${item.material.name}</div>
            <div style="color: #6b7280; font-size: 14px;">${item.material.barcode}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 24px; font-weight: 700; color: #10b981;">+${item.transaction.quantity}</div>
            <div style="font-size: 12px; color: #6b7280;">${item.material.unit_type}</div>
          </div>
        </div>
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          Stock: ${item.transaction.stockBefore} → ${item.transaction.stockAfter}
        </div>
      </div>
    `;
  });

  html += '</div>';

  container.innerHTML = html;
}

// ==========================================
// PRINT SMART BARCODES
// ==========================================

function printSmartBarcodes() {
  const token = localStorage.getItem('admin_token');
  const url = `${API_BASE}/inventory/smart-barcodes/sheet`;

  // Open in new window
  window.open(url, '_blank');

  console.log('Opening smart barcode sheet...');
}

// Make functions globally accessible
window.loadInventory = loadInventory;
window.showMaterialDetail = showMaterialDetail;
window.closeMaterialDetail = closeMaterialDetail;
window.showAddMaterialModal = showAddMaterialModal;
window.closeAddMaterialModal = closeAddMaterialModal;
window.handleMaterialSubmit = handleMaterialSubmit;
window.showPurchaseModal = showPurchaseModal;
window.handlePurchaseSubmit = handlePurchaseSubmit;
window.showAdjustModal = showAdjustModal;
window.handleAdjustSubmit = handleAdjustSubmit;
window.showInvoiceUploadModal = showInvoiceUploadModal;
window.closeInvoiceUploadModal = closeInvoiceUploadModal;
window.handleInvoiceFileSelect = handleInvoiceFileSelect;
window.handleInvoiceUpload = handleInvoiceUpload;
window.showInvoiceReviewModal = showInvoiceReviewModal;
window.closeInvoiceReviewModal = closeInvoiceReviewModal;
window.approveInvoice = approveInvoice;
window.showPrintLabelsModal = showPrintLabelsModal;
window.closePrintLabelsModal = closePrintLabelsModal;
window.generateLabels = generateLabels;
window.showQuickReceiveModal = showQuickReceiveModal;
window.closeQuickReceiveModal = closeQuickReceiveModal;
window.handleQuickReceiveScan = handleQuickReceiveScan;
window.handleQuickReceiveQuantity = handleQuickReceiveQuantity;
window.printSmartBarcodes = printSmartBarcodes;
window.handleQuickReceiveSubmit = handleQuickReceiveSubmit;
window.clearQuickReceiveForm = clearQuickReceiveForm;

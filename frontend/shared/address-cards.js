/**
 * Shared Address Cards Component
 * Renders address selection cards with add/edit/delete functionality.
 * Compatible with /pedidos and /seguimiento pages.
 *
 * All user-provided strings are set via textContent (never innerHTML)
 * to prevent XSS.
 */

// ==========================================
// INJECT STYLES (once)
// ==========================================
(function injectAddressCardStyles() {
  if (document.getElementById('address-cards-styles')) return;
  const style = document.createElement('style');
  style.id = 'address-cards-styles';
  style.textContent = `
    .address-cards-grid {
      display: grid;
      gap: 12px;
    }

    .address-card {
      position: relative;
      background: #fff;
      border: 1px solid #e5e5ea;
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
      user-select: none;
    }

    .address-card:hover {
      border-color: #ccc;
    }

    .address-card--selected {
      border: 2px solid #E72A88;
      background: #FDF2F8;
      padding: 15px; /* compensate for thicker border */
    }

    .address-card--selected:hover {
      border-color: #E72A88;
    }

    .address-card--new {
      border: 2px dashed #d1d5db;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80px;
      color: #999;
      font-size: 15px;
      font-weight: 500;
      padding: 15px;
    }

    .address-card--new:hover {
      border-color: #E72A88;
      color: #E72A88;
    }

    .address-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .address-card-label {
      font-size: 15px;
      font-weight: 600;
      color: var(--gray-900, #1a1a1a);
    }

    .address-card-actions {
      display: flex;
      gap: 4px;
    }

    .address-card-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 4px 6px;
      border-radius: 6px;
      line-height: 1;
      opacity: 0.6;
      transition: opacity 0.15s, background 0.15s;
    }

    .address-card-btn:hover {
      opacity: 1;
      background: rgba(0,0,0,0.05);
    }

    .address-card-body {
      font-size: 13px;
      color: var(--gray-600, #666);
      margin-top: 4px;
      line-height: 1.4;
    }

    .address-card-ref {
      font-size: 12px;
      color: var(--gray-500, #999);
      margin-top: 4px;
    }

    .address-card-badge {
      display: inline-block;
      background: #E8F5E9;
      color: #4CAF50;
      font-size: 11px;
      font-weight: 600;
      border-radius: 8px;
      padding: 2px 8px;
      margin-top: 8px;
    }

    .address-card-check {
      position: absolute;
      top: -6px;
      left: -6px;
      width: 22px;
      height: 22px;
      background: #E72A88;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }

    /* ---- Address Form Styles ---- */
    .address-form-overlay {
      background: #fff;
      border: 1px solid #e5e5ea;
      border-radius: 12px;
      padding: 20px;
      margin-top: 8px;
    }

    .address-form-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 16px 0;
      color: var(--gray-900, #1a1a1a);
    }

    .address-form-grid {
      display: grid;
      gap: 14px;
    }

    .address-form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .address-form-field label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--gray-500, #888);
      margin-bottom: 6px;
      letter-spacing: 0.3px;
    }

    .address-form-field input,
    .address-form-field textarea,
    .address-form-field select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      font-size: 14px;
      font-family: inherit;
      color: var(--gray-900, #1a1a1a);
      background: var(--gray-50, #f9fafb);
      box-sizing: border-box;
      transition: border-color 0.15s;
      outline: none;
    }

    .address-form-field input:focus,
    .address-form-field textarea:focus,
    .address-form-field select:focus {
      border-color: #E72A88;
    }

    .address-form-field textarea {
      resize: vertical;
      min-height: 60px;
    }

    .address-form-field select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 16px;
      padding-right: 32px;
    }

    .address-form-actions {
      display: flex;
      gap: 10px;
      margin-top: 4px;
    }

    .address-form-btn {
      flex: 1;
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      border: none;
      transition: background 0.15s, opacity 0.15s;
    }

    .address-form-btn--save {
      background: #E72A88;
      color: #fff;
    }

    .address-form-btn--save:hover {
      background: #d1206f;
    }

    .address-form-btn--save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .address-form-btn--cancel {
      background: var(--gray-50, #f3f4f6);
      color: var(--gray-600, #555);
      border: 1px solid #e0e0e0;
    }

    .address-form-btn--cancel:hover {
      background: #eee;
    }

    .address-form-loading {
      font-size: 12px;
      color: var(--gray-500, #888);
      margin-top: 2px;
    }

    @media (max-width: 480px) {
      .address-form-row {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
})();


// ==========================================
// SEPOMEX API
// ==========================================

async function fetchPostalData(cp) {
  if (!cp || cp.length !== 5 || !/^\d{5}$/.test(cp)) return null;
  try {
    var res = await fetch('https://api.zippopotam.us/mx/' + encodeURIComponent(cp));
    if (!res.ok) return null;
    var data = await res.json();
    if (!data || !data.places || data.places.length === 0) return null;
    // Transform zippopotam format to expected { estado, municipio, colonias[] }
    return {
      estado: data.places[0].state || '',
      municipio: data.places[0].state || '',
      colonias: data.places.map(function(p) { return p['place name']; })
    };
  } catch (e) {
    console.warn('Postal lookup failed:', e);
    return null;
  }
}


// ==========================================
// RENDER ADDRESS CARDS
// ==========================================

/**
 * Renders address selection cards into a container.
 * @param {HTMLElement} container - DOM element to render into
 * @param {Array} addresses - Array of address objects
 * @param {string|number|null} selectedId - Currently selected address ID
 * @param {Object} callbacks - { onSelect, onAdd, onEdit, onDelete, onSetDefault }
 */
function renderAddressCards(container, addresses, selectedId, callbacks) {
  const grid = document.createElement('div');
  grid.className = 'address-cards-grid';

  addresses.forEach(function(addr) {
    var isSelected = selectedId != null && String(addr.id) === String(selectedId);
    var card = document.createElement('div');
    card.className = 'address-card' + (isSelected ? ' address-card--selected' : '');
    card.dataset.addressId = addr.id;

    var label = addr.label || [addr.colonia, addr.city].filter(Boolean).join(', ') || 'Direccion';
    var fullAddress = [
      [addr.street, addr.street_number || addr.streetNumber].filter(Boolean).join(' '),
      addr.colonia,
      [addr.city, addr.state].filter(Boolean).join(', '),
      (addr.postal_code || addr.postal) ? ('CP ' + (addr.postal_code || addr.postal)) : ''
    ].filter(Boolean).join(', ');

    var refText = addr.references || addr.reference_notes || '';
    var isDefault = addr.is_default || addr.isDefault;

    // Build card using safe DOM methods (textContent only)

    if (isSelected) {
      var check = document.createElement('span');
      check.className = 'address-card-check';
      check.textContent = '\u2713';
      card.appendChild(check);
    }

    // Header row
    var header = document.createElement('div');
    header.className = 'address-card-header';

    var labelSpan = document.createElement('span');
    labelSpan.className = 'address-card-label';
    labelSpan.textContent = label;
    header.appendChild(labelSpan);

    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'address-card-actions';

    var editBtn = document.createElement('button');
    editBtn.className = 'address-card-btn address-card-btn-edit';
    editBtn.title = 'Editar';
    editBtn.textContent = '\u270F\uFE0F';
    actionsDiv.appendChild(editBtn);

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'address-card-btn address-card-btn-delete';
    deleteBtn.title = 'Eliminar';
    deleteBtn.textContent = '\uD83D\uDDD1\uFE0F';
    actionsDiv.appendChild(deleteBtn);

    header.appendChild(actionsDiv);
    card.appendChild(header);

    // Body
    var bodyDiv = document.createElement('div');
    bodyDiv.className = 'address-card-body';
    bodyDiv.textContent = fullAddress;
    card.appendChild(bodyDiv);

    // Reference notes
    if (refText) {
      var refDiv = document.createElement('div');
      refDiv.className = 'address-card-ref';
      refDiv.textContent = 'Ref: ' + refText;
      card.appendChild(refDiv);
    }

    // Default badge
    if (isDefault) {
      var badge = document.createElement('span');
      badge.className = 'address-card-badge';
      badge.textContent = 'Principal';
      card.appendChild(badge);
    }

    // Event: card click = select
    card.addEventListener('click', function(e) {
      if (e.target.closest('.address-card-btn')) return;
      if (callbacks.onSelect) callbacks.onSelect(addr.id);
    });

    // Event: edit
    editBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (callbacks.onEdit) callbacks.onEdit(addr);
    });

    // Event: delete
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (callbacks.onDelete) callbacks.onDelete(addr.id);
    });

    grid.appendChild(card);
  });

  // "+ Nueva direccion" card
  var newCard = document.createElement('div');
  newCard.className = 'address-card address-card--new';
  newCard.textContent = '+ Nueva direcci\u00F3n';
  newCard.addEventListener('click', function() {
    if (callbacks.onAdd) callbacks.onAdd();
  });
  grid.appendChild(newCard);

  // Replace container contents
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(grid);
}


// ==========================================
// ADDRESS FORM (add/edit inline)
// ==========================================

/**
 * Shows an inline address form for adding or editing.
 * @param {HTMLElement} container - DOM element to render form into
 * @param {Object|null} existingAddress - Address to edit (null = new)
 * @param {Function} onSave - Called with form data object on save
 * @param {Function} onCancel - Called when user cancels
 */
function showAddressForm(container, existingAddress, onSave, onCancel) {
  var isEdit = !!existingAddress;
  var addr = existingAddress || {};

  var form = document.createElement('div');
  form.className = 'address-form-overlay';
  form.setAttribute('autocomplete', 'off');

  // Title
  var titleEl = document.createElement('div');
  titleEl.className = 'address-form-title';
  titleEl.textContent = isEdit ? 'Editar Direcci\u00F3n' : 'Nueva Direcci\u00F3n';
  form.appendChild(titleEl);

  var formGrid = document.createElement('div');
  formGrid.className = 'address-form-grid';

  // Helper: create a form field with label + input
  function makeField(labelText, tagName, id, placeholder, value, opts) {
    var wrapper = document.createElement('div');
    wrapper.className = 'address-form-field';

    var lbl = document.createElement('label');
    lbl.setAttribute('for', id);
    lbl.textContent = labelText;
    wrapper.appendChild(lbl);

    var input;
    if (tagName === 'textarea') {
      input = document.createElement('textarea');
      input.textContent = value || '';
    } else if (tagName === 'select') {
      input = document.createElement('select');
      var defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = 'Selecciona colonia';
      input.appendChild(defOpt);
      if (value) {
        var opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        opt.selected = true;
        input.appendChild(opt);
      }
    } else {
      input = document.createElement('input');
      input.type = (opts && opts.type) || 'text';
      input.value = value || '';
    }

    input.id = id;
    input.autocomplete = 'off';
    input.setAttribute('autocomplete', 'off');
    if (placeholder) input.placeholder = placeholder;
    if (opts) {
      if (opts.maxlength) input.maxLength = opts.maxlength;
      if (opts.inputmode) input.inputMode = opts.inputmode;
      if (opts.pattern) input.pattern = opts.pattern;
    }
    wrapper.appendChild(input);
    return { wrapper: wrapper, input: input };
  }

  // --- Label field ---
  var labelF = makeField('Etiqueta (opcional)', 'input', 'addr-label', 'Ej: Casa, Oficina, Tienda', addr.label || '');
  formGrid.appendChild(labelF.wrapper);

  // --- Postal code ---
  var postalF = makeField('C\u00F3digo Postal *', 'input', 'addr-postal', 'Ej: 06600', addr.postal_code || addr.postal || '', { maxlength: 5, inputmode: 'numeric', pattern: '[0-9]*' });
  var statusEl = document.createElement('div');
  statusEl.id = 'addr-postal-status';
  statusEl.className = 'address-form-loading';
  postalF.wrapper.appendChild(statusEl);
  formGrid.appendChild(postalF.wrapper);
  var postalInput = postalF.input;

  // --- Street + Number row ---
  var row1 = document.createElement('div');
  row1.className = 'address-form-row';
  var streetF = makeField('Calle *', 'input', 'addr-street', 'Nombre de la calle', addr.street || '');
  var numberF = makeField('N\u00FAmero *', 'input', 'addr-number', 'N\u00FAm. ext / int', addr.street_number || addr.streetNumber || '');
  row1.appendChild(streetF.wrapper);
  row1.appendChild(numberF.wrapper);
  formGrid.appendChild(row1);

  // --- Colonia (select) ---
  var coloniaF = makeField('Colonia *', 'select', 'addr-colonia', '', addr.colonia || '');
  formGrid.appendChild(coloniaF.wrapper);
  var coloniaSelect = coloniaF.input;

  // --- City + State row ---
  var row2 = document.createElement('div');
  row2.className = 'address-form-row';
  var cityF = makeField('Ciudad *', 'input', 'addr-city', 'Ciudad / Municipio', addr.city || '');
  var stateF = makeField('Estado *', 'input', 'addr-state', 'Estado', addr.state || '');
  row2.appendChild(cityF.wrapper);
  row2.appendChild(stateF.wrapper);
  formGrid.appendChild(row2);
  var cityInput = cityF.input;
  var stateInput = stateF.input;

  // --- References ---
  var refF = makeField('Referencias', 'textarea', 'addr-references', 'Ej: Entre calle X y calle Y, edificio azul', addr.references || addr.reference_notes || '');
  formGrid.appendChild(refF.wrapper);

  // --- Default checkbox ---
  var checkWrapper = document.createElement('div');
  checkWrapper.className = 'address-form-field';
  checkWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'addr-default';
  checkbox.checked = !!(addr.is_default || addr.isDefault);
  checkbox.style.width = 'auto';
  checkWrapper.appendChild(checkbox);

  var checkLbl = document.createElement('label');
  checkLbl.setAttribute('for', 'addr-default');
  checkLbl.style.cssText = 'margin-bottom: 0; text-transform: none; font-size: 13px; color: var(--gray-600, #666);';
  checkLbl.textContent = 'Marcar como direcci\u00F3n principal';
  checkWrapper.appendChild(checkLbl);
  formGrid.appendChild(checkWrapper);

  // --- Action buttons ---
  var actionsDiv = document.createElement('div');
  actionsDiv.className = 'address-form-actions';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'address-form-btn address-form-btn--cancel';
  cancelBtn.textContent = 'Cancelar';
  actionsDiv.appendChild(cancelBtn);

  var saveBtn = document.createElement('button');
  saveBtn.className = 'address-form-btn address-form-btn--save';
  saveBtn.textContent = isEdit ? 'Guardar Cambios' : 'Agregar Direcci\u00F3n';
  actionsDiv.appendChild(saveBtn);

  formGrid.appendChild(actionsDiv);
  form.appendChild(formGrid);

  // Mount
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(form);

  // --- Wire up postal code auto-fill ---
  var postalDebounce = null;

  postalInput.addEventListener('input', function() {
    var cp = postalInput.value.replace(/\D/g, '');
    postalInput.value = cp;
    clearTimeout(postalDebounce);
    if (cp.length === 5) {
      statusEl.textContent = 'Buscando...';
      postalDebounce = setTimeout(async function() {
        var data = await fetchPostalData(cp);
        if (data && data.estado) {
          stateInput.value = data.estado;
          cityInput.value = data.municipio || '';
          // Rebuild colonia dropdown
          while (coloniaSelect.firstChild) coloniaSelect.removeChild(coloniaSelect.firstChild);
          var defOpt = document.createElement('option');
          defOpt.value = '';
          defOpt.textContent = 'Selecciona colonia';
          coloniaSelect.appendChild(defOpt);

          if (data.colonias && data.colonias.length > 0) {
            data.colonias.forEach(function(c) {
              var opt = document.createElement('option');
              opt.value = c;
              opt.textContent = c;
              coloniaSelect.appendChild(opt);
            });
            // If editing, try to re-select the existing colonia
            if (addr.colonia) {
              coloniaSelect.value = addr.colonia;
            }
            // Auto-select if only one option
            if (data.colonias.length === 1) {
              coloniaSelect.value = data.colonias[0];
            }
          }
          statusEl.textContent = '';
        } else {
          statusEl.textContent = 'CP no encontrado';
        }
      }, 300);
    } else {
      statusEl.textContent = '';
    }
  });

  // If editing with existing postal code, trigger lookup
  if (addr.postal_code || addr.postal) {
    postalInput.dispatchEvent(new Event('input'));
  }

  // --- Cancel handler ---
  cancelBtn.addEventListener('click', function() {
    if (onCancel) onCancel();
  });

  // --- Save handler ---
  saveBtn.addEventListener('click', function() {
    var street = streetF.input.value.trim();
    var number = numberF.input.value.trim();
    var colonia = coloniaSelect.value;
    var city = cityInput.value.trim();
    var st = stateInput.value.trim();
    var postal = postalInput.value.trim();

    // Validate required fields
    if (!street || !number || !colonia || !city || !st || !postal) {
      alert('Por favor completa todos los campos obligatorios (*)');
      return;
    }

    var formData = {
      label: labelF.input.value.trim() || [colonia, city].filter(Boolean).join(', '),
      street: street,
      street_number: number,
      colonia: colonia,
      city: city,
      state: st,
      postal_code: postal,
      references: refF.input.value.trim(),
      is_default: checkbox.checked
    };

    // Preserve id when editing
    if (isEdit && addr.id) {
      formData.id = addr.id;
    }

    if (onSave) onSave(formData);
  });
}


// ==========================================
// EXPORTS (global for non-module usage)
// ==========================================

window.AddressCards = {
  render: renderAddressCards,
  showForm: showAddressForm
};

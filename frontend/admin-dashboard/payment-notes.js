// Payment Notes Module for Admin Dashboard
// Embeds a mini payment tracker in the client detail popup
// Safe DOM methods only — no innerHTML with user data

(function () {
  'use strict';

  // Resolve API base from global or derive like dashboard.js
  function getApiBase() {
    if (window.API_BASE) return window.API_BASE;
    return window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://vt-souvenir-backend.onrender.com/api';
  }

  // ==========================================
  // BRAND COLORS
  // ==========================================
  const COLORS = {
    rosa: '#e72a88',
    turquesa: '#09adc2',
    verde: '#8ab73b',
    naranja: '#f39223',
    rojo: '#e52421',
    bg: '#1a1a2e',
    card: '#16213e',
    cardLight: '#1e2d4a',
    text: '#e0e0e0',
    textMuted: '#8892a4',
    border: '#2a3a5c',
    inputBg: '#0f1729',
  };

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const noteStates = {};

  function getState(clientId) {
    if (!noteStates[clientId]) {
      noteStates[clientId] = {
        products: [],
        payments: [],
        notes: '',
        loaded: false,
        saving: false,
      };
    }
    return noteStates[clientId];
  }

  // ==========================================
  // API HELPERS
  // ==========================================
  function authHeaders() {
    const token = typeof window.getAuthToken === 'function'
      ? window.getAuthToken()
      : localStorage.getItem('admin_token');
    return {
      Authorization: 'Bearer ' + (token || ''),
      'Content-Type': 'application/json',
    };
  }

  async function loadPaymentNote(clientId) {
    const state = getState(clientId);
    try {
      const res = await fetch(getApiBase() + '/payment-notes/' + clientId, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.success && json.data && json.data.data) {
        const d = typeof json.data.data === 'string'
          ? JSON.parse(json.data.data)
          : json.data.data;
        state.products = Array.isArray(d.products) ? d.products : [];
        state.payments = Array.isArray(d.payments) ? d.payments : [];
        state.notes = d.notes || '';
      }
      state.loaded = true;
    } catch (err) {
      console.error('payment-notes: load error', err);
      state.loaded = true;
    }
  }

  let saveTimers = {};

  function debouncedSave(clientId) {
    clearTimeout(saveTimers[clientId]);
    saveTimers[clientId] = setTimeout(function () {
      savePaymentNote(clientId);
    }, 600);
  }

  async function savePaymentNote(clientId) {
    const state = getState(clientId);
    if (state.saving) return;
    state.saving = true;
    try {
      const payload = {
        products: state.products,
        payments: state.payments,
        notes: state.notes,
      };
      await fetch(getApiBase() + '/payment-notes/' + clientId, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ data: payload }),
      });
    } catch (err) {
      console.error('payment-notes: save error', err);
    } finally {
      state.saving = false;
    }
  }

  // ==========================================
  // PAYMENT ALLOCATION
  // ==========================================
  function allocatePayments(state) {
    var totalPaid = 0;
    for (var i = 0; i < state.payments.length; i++) {
      totalPaid += parseFloat(state.payments[i].amount) || 0;
    }

    var remaining = totalPaid;
    for (var p = 0; p < state.products.length; p++) {
      var prod = state.products[p];
      var subtotal = (parseFloat(prod.qty) || 0) * (parseFloat(prod.piecePrice) || 0);
      if (remaining >= subtotal) {
        prod.amountPaid = subtotal;
        prod.status = 'pagado';
        remaining -= subtotal;
      } else if (remaining > 0) {
        prod.amountPaid = Math.round(remaining * 100) / 100;
        prod.status = 'parcial';
        remaining = 0;
      } else {
        prod.amountPaid = 0;
        prod.status = 'pendiente';
      }
    }
    return totalPaid;
  }

  // ==========================================
  // UTILITY
  // ==========================================
  function currency(n) {
    return '$' + (parseFloat(n) || 0).toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (key === 'style' && typeof attrs[key] === 'object') {
          Object.assign(node.style, attrs[key]);
        } else if (key.indexOf('on') === 0) {
          node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
        } else if (key === 'className') {
          node.className = attrs[key];
        } else {
          node.setAttribute(key, attrs[key]);
        }
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      for (var i = 0; i < children.length; i++) {
        if (children[i] == null) continue;
        if (typeof children[i] === 'string' || typeof children[i] === 'number') {
          node.appendChild(document.createTextNode(String(children[i])));
        } else {
          node.appendChild(children[i]);
        }
      }
    }
    return node;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // ==========================================
  // INJECT STYLES (once)
  // ==========================================
  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    var css = `
      .pn-wrap {
        background: ${COLORS.card};
        border: 1px solid ${COLORS.border};
        border-radius: 12px;
        padding: 16px;
        margin-top: 8px;
        font-size: 13px;
        color: ${COLORS.text};
      }
      .pn-section-title {
        font-size: 14px;
        font-weight: 700;
        color: ${COLORS.turquesa};
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pn-table-wrap {
        overflow-x: auto;
        margin-bottom: 16px;
        border-radius: 8px;
        border: 1px solid ${COLORS.border};
      }
      .pn-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .pn-table th {
        background: linear-gradient(135deg, ${COLORS.turquesa}, #106c7f);
        color: #fff;
        padding: 8px 10px;
        text-align: left;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
      }
      .pn-table th:last-child,
      .pn-table td:last-child {
        text-align: center;
      }
      .pn-table td {
        padding: 7px 10px;
        border-bottom: 1px solid ${COLORS.border};
        vertical-align: middle;
      }
      .pn-table tr:nth-child(even) {
        background: ${COLORS.cardLight};
      }
      .pn-table tr:hover {
        background: rgba(9, 173, 194, 0.08);
      }
      .pn-editable {
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background 0.15s;
        min-width: 40px;
        display: inline-block;
      }
      .pn-editable:hover {
        background: rgba(9, 173, 194, 0.15);
      }
      .pn-edit-input {
        background: ${COLORS.inputBg};
        color: ${COLORS.text};
        border: 1px solid ${COLORS.turquesa};
        border-radius: 4px;
        padding: 3px 6px;
        font-size: 12px;
        width: 80px;
        outline: none;
      }
      .pn-edit-input:focus {
        box-shadow: 0 0 0 2px rgba(9, 173, 194, 0.3);
      }
      .pn-model-name {
        cursor: pointer;
        color: ${COLORS.turquesa};
        font-weight: 600;
        text-decoration: underline;
        text-decoration-style: dotted;
      }
      .pn-model-name:hover {
        color: #5dd8e8;
      }
      .pn-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .pn-badge-pagado { background: ${COLORS.verde}; color: #fff; }
      .pn-badge-parcial { background: ${COLORS.naranja}; color: #fff; }
      .pn-badge-pendiente { background: ${COLORS.rojo}; color: #fff; }
      .pn-btn {
        border: none;
        border-radius: 8px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
        color: #fff;
      }
      .pn-btn:hover { opacity: 0.85; }
      .pn-btn:active { transform: scale(0.97); }
      .pn-btn-turquesa { background: linear-gradient(135deg, ${COLORS.turquesa}, #106c7f); }
      .pn-btn-rosa { background: linear-gradient(135deg, ${COLORS.rosa}, #b91d6e); }
      .pn-btn-verde { background: linear-gradient(135deg, ${COLORS.verde}, #6a9a2f); }
      .pn-btn-rojo { background: linear-gradient(135deg, ${COLORS.rojo}, #c01e1b); }
      .pn-btn-sm {
        padding: 3px 10px;
        font-size: 11px;
        border-radius: 6px;
      }
      .pn-remove-btn {
        background: none;
        border: none;
        color: ${COLORS.rojo};
        cursor: pointer;
        font-size: 16px;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background 0.15s;
        line-height: 1;
      }
      .pn-remove-btn:hover { background: rgba(229, 36, 33, 0.15); }
      .pn-payment-list {
        list-style: none;
        padding: 0;
        margin: 0 0 10px;
      }
      .pn-payment-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: ${COLORS.cardLight};
        border-radius: 8px;
        margin-bottom: 6px;
        border: 1px solid ${COLORS.border};
        flex-wrap: wrap;
      }
      .pn-payment-item label {
        font-size: 11px;
        color: ${COLORS.textMuted};
        min-width: 40px;
      }
      .pn-summary {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-top: 12px;
        padding: 12px;
        background: ${COLORS.bg};
        border-radius: 10px;
        border: 1px solid ${COLORS.border};
      }
      .pn-summary-item {
        text-align: center;
        flex: 1;
        min-width: 100px;
      }
      .pn-summary-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: ${COLORS.textMuted};
        margin-bottom: 4px;
      }
      .pn-summary-value {
        font-size: 18px;
        font-weight: 800;
      }
      .pn-notes-textarea {
        width: 100%;
        min-height: 60px;
        background: ${COLORS.inputBg};
        color: ${COLORS.text};
        border: 1px solid ${COLORS.border};
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
        font-family: inherit;
        resize: vertical;
        outline: none;
      }
      .pn-notes-textarea:focus {
        border-color: ${COLORS.turquesa};
        box-shadow: 0 0 0 2px rgba(9, 173, 194, 0.2);
      }
      .pn-submodels-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pnFadeIn 0.15s ease;
      }
      .pn-submodels-popup {
        background: ${COLORS.card};
        border: 1px solid ${COLORS.border};
        border-radius: 14px;
        padding: 20px;
        width: 360px;
        max-width: 90vw;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      }
      .pn-submodel-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .pn-submodel-input {
        flex: 1;
        background: ${COLORS.inputBg};
        color: ${COLORS.text};
        border: 1px solid ${COLORS.border};
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 12px;
        outline: none;
      }
      .pn-submodel-input:focus {
        border-color: ${COLORS.turquesa};
      }
      .pn-empty-state {
        text-align: center;
        padding: 24px;
        color: ${COLORS.textMuted};
        font-size: 13px;
      }
      .pn-row-actions {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .pn-flex {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .pn-mt { margin-top: 12px; }
      .pn-mb { margin-bottom: 12px; }
      @keyframes pnFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ==========================================
  // EDITABLE CELL
  // ==========================================
  function makeEditableCell(value, onCommit, opts) {
    opts = opts || {};
    var isNumeric = opts.numeric !== false;
    var isCurrency = opts.currency === true;
    var displayText = isCurrency ? currency(value) : String(value);

    var span = el('span', { className: 'pn-editable', title: 'Click para editar' }, [displayText]);

    span.addEventListener('click', function () {
      var input = el('input', {
        type: isNumeric ? 'number' : 'text',
        className: 'pn-edit-input',
        value: String(value),
        style: { width: opts.width || '80px' },
      });
      if (isNumeric) {
        input.setAttribute('step', 'any');
        input.setAttribute('min', '0');
      }

      span.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        var newVal = isNumeric ? parseFloat(input.value) || 0 : input.value;
        var newDisplay = isCurrency ? currency(newVal) : String(newVal);
        var newSpan = el('span', { className: 'pn-editable', title: 'Click para editar' }, [newDisplay]);
        newSpan.addEventListener('click', span._clickHandler);
        input.replaceWith(newSpan);
        // Reassign so future edits work
        span = newSpan;
        span._clickHandler = arguments.callee;
        onCommit(newVal);
      }

      // Store for reassignment
      span._clickHandler = function () {
        var inp = el('input', {
          type: isNumeric ? 'number' : 'text',
          className: 'pn-edit-input',
          value: String(isNumeric ? (parseFloat(span.textContent.replace(/[$,]/g, '')) || 0) : span.textContent),
          style: { width: opts.width || '80px' },
        });
        if (isNumeric) {
          inp.setAttribute('step', 'any');
          inp.setAttribute('min', '0');
        }
        span.replaceWith(inp);
        inp.focus();
        inp.select();
        inp.addEventListener('blur', function () {
          var nv = isNumeric ? parseFloat(inp.value) || 0 : inp.value;
          var nd = isCurrency ? currency(nv) : String(nv);
          var ns = el('span', { className: 'pn-editable', title: 'Click para editar' }, [nd]);
          ns.addEventListener('click', span._clickHandler);
          inp.replaceWith(ns);
          span = ns;
          onCommit(nv);
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') inp.blur();
          if (e.key === 'Escape') {
            inp.replaceWith(span);
          }
        });
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
          input.replaceWith(span);
        }
      });
    });

    return span;
  }

  // ==========================================
  // SUBMODELS POPUP
  // ==========================================
  function showSubmodelsPopup(clientId, productIndex) {
    var state = getState(clientId);
    var prod = state.products[productIndex];
    if (!prod) return;
    if (!Array.isArray(prod.submodels)) prod.submodels = [];

    var overlay = el('div', { className: 'pn-submodels-overlay' });
    var popup = el('div', { className: 'pn-submodels-popup' });

    var title = el('div', { className: 'pn-section-title' }, [
      'Submodelos de: ' + prod.name,
    ]);
    popup.appendChild(title);

    var listContainer = el('div');
    popup.appendChild(listContainer);

    function renderSubmodelList() {
      listContainer.textContent = '';
      if (prod.submodels.length === 0) {
        listContainer.appendChild(
          el('div', { className: 'pn-empty-state' }, ['Sin submodelos. Agrega uno abajo.'])
        );
      }
      prod.submodels.forEach(function (sub, si) {
        var row = el('div', { className: 'pn-submodel-row' });

        var nameInput = el('input', {
          className: 'pn-submodel-input',
          value: sub.name || '',
          placeholder: 'Nombre del submodelo',
        });
        nameInput.addEventListener('input', function () {
          prod.submodels[si].name = nameInput.value;
          debouncedSave(clientId);
        });

        var qtyInput = el('input', {
          className: 'pn-submodel-input',
          type: 'number',
          value: String(sub.qty || 0),
          placeholder: 'Cant.',
          style: { width: '70px', flex: '0 0 70px' },
        });
        qtyInput.setAttribute('min', '0');
        qtyInput.addEventListener('input', function () {
          prod.submodels[si].qty = parseInt(qtyInput.value) || 0;
          debouncedSave(clientId);
        });

        var removeBtn = el('button', {
          className: 'pn-remove-btn',
          title: 'Eliminar submodelo',
        }, ['\u00D7']);
        removeBtn.addEventListener('click', function () {
          prod.submodels.splice(si, 1);
          debouncedSave(clientId);
          renderSubmodelList();
        });

        row.appendChild(nameInput);
        row.appendChild(qtyInput);
        row.appendChild(removeBtn);
        listContainer.appendChild(row);
      });
    }

    renderSubmodelList();

    var addBtn = el('button', { className: 'pn-btn pn-btn-turquesa pn-btn-sm pn-mt' }, ['+ Submodelo']);
    addBtn.addEventListener('click', function () {
      prod.submodels.push({ name: '', qty: 0 });
      debouncedSave(clientId);
      renderSubmodelList();
    });
    popup.appendChild(addBtn);

    var closeBtn = el('button', {
      className: 'pn-btn pn-btn-rosa pn-mt',
      style: { marginLeft: '8px' },
    }, ['Cerrar']);
    closeBtn.addEventListener('click', function () {
      overlay.remove();
      // Re-render main table to reflect any submodel changes
      var container = document.getElementById('payment-notes-container-' + clientId);
      if (container) renderPaymentNotes(clientId, container);
    });
    popup.appendChild(closeBtn);

    overlay.appendChild(popup);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.remove();
        var container = document.getElementById('payment-notes-container-' + clientId);
        if (container) renderPaymentNotes(clientId, container);
      }
    });
    document.body.appendChild(overlay);
  }

  // ==========================================
  // STATUS BADGE
  // ==========================================
  function statusBadge(prod) {
    var subtotal = (parseFloat(prod.qty) || 0) * (parseFloat(prod.piecePrice) || 0);
    var paid = parseFloat(prod.amountPaid) || 0;
    var status = prod.status || 'pendiente';

    if (status === 'pagado') {
      return el('span', { className: 'pn-badge pn-badge-pagado' }, ['Pagado']);
    }
    if (status === 'parcial') {
      var resta = subtotal - paid;
      var wrapper = el('span', { style: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } });
      wrapper.appendChild(el('span', { className: 'pn-badge pn-badge-parcial' }, ['Parcial']));
      wrapper.appendChild(
        el('span', {
          style: { fontSize: '9px', color: COLORS.naranja, whiteSpace: 'nowrap' },
        }, ['Abono: ' + currency(paid)])
      );
      wrapper.appendChild(
        el('span', {
          style: { fontSize: '9px', color: COLORS.rojo, whiteSpace: 'nowrap' },
        }, ['Resta: ' + currency(resta)])
      );
      return wrapper;
    }
    // pendiente
    return el('span', { className: 'pn-badge pn-badge-pendiente' }, ['Pendiente']);
  }

  // ==========================================
  // RENDER PRODUCTS TABLE
  // ==========================================
  function renderProductsTable(clientId, state) {
    var wrapper = el('div', { className: 'pn-table-wrap' });
    var table = el('table', { className: 'pn-table' });

    // Header
    var thead = el('thead');
    var headerRow = el('tr');
    var headers = ['', 'Modelos', 'Num. Modelos', 'Num. Piezas Total', 'Precio Pieza', 'Subtotal', 'Estado'];
    headers.forEach(function (h) {
      headerRow.appendChild(el('th', null, [h]));
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    var tbody = el('tbody');

    if (state.products.length === 0) {
      var emptyRow = el('tr');
      var emptyCell = el('td', {
        colspan: '7',
        style: { textAlign: 'center', padding: '20px', color: COLORS.textMuted },
      }, ['Sin productos. Agrega uno para comenzar.']);
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }

    state.products.forEach(function (prod, idx) {
      var row = el('tr');

      // Remove button
      var removeCell = el('td');
      var removeBtn = el('button', { className: 'pn-remove-btn', title: 'Eliminar producto' }, ['\u00D7']);
      removeBtn.addEventListener('click', function () {
        state.products.splice(idx, 1);
        allocatePayments(state);
        debouncedSave(clientId);
        var container = document.getElementById('payment-notes-container-' + clientId);
        if (container) renderPaymentNotes(clientId, container);
      });
      removeCell.appendChild(removeBtn);
      row.appendChild(removeCell);

      // Model name (clickable for submodels)
      var nameCell = el('td');
      var nameSpan = el('span', { className: 'pn-model-name' });
      var subCount = Array.isArray(prod.submodels) ? prod.submodels.length : 0;
      nameSpan.textContent = (prod.name || 'Sin nombre') + (subCount > 0 ? ' (' + subCount + ')' : '');
      nameSpan.title = 'Click para ver/editar submodelos';
      nameSpan.addEventListener('click', function () {
        showSubmodelsPopup(clientId, idx);
      });

      // Inline rename on double-click
      nameSpan.addEventListener('dblclick', function () {
        var input = el('input', {
          className: 'pn-edit-input',
          type: 'text',
          value: prod.name || '',
          style: { width: '120px' },
        });
        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        function commitName() {
          prod.name = input.value || 'Sin nombre';
          debouncedSave(clientId);
          var container = document.getElementById('payment-notes-container-' + clientId);
          if (container) renderPaymentNotes(clientId, container);
        }

        input.addEventListener('blur', commitName);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') input.blur();
        });
      });

      nameCell.appendChild(nameSpan);
      row.appendChild(nameCell);

      // Num. Modelos (number of submodels)
      var numModelsCell = el('td');
      numModelsCell.appendChild(
        makeEditableCell(subCount > 0 ? subCount : (prod.numModels || 0), function (val) {
          prod.numModels = val;
          debouncedSave(clientId);
        }, { width: '60px' })
      );
      row.appendChild(numModelsCell);

      // Num. Piezas Total (qty)
      var qtyCell = el('td');
      qtyCell.appendChild(
        makeEditableCell(prod.qty || 0, function (val) {
          prod.qty = val;
          allocatePayments(state);
          debouncedSave(clientId);
          var container = document.getElementById('payment-notes-container-' + clientId);
          if (container) renderPaymentNotes(clientId, container);
        }, { width: '60px' })
      );
      row.appendChild(qtyCell);

      // Precio Pieza
      var priceCell = el('td');
      priceCell.appendChild(
        makeEditableCell(prod.piecePrice || 0, function (val) {
          prod.piecePrice = val;
          allocatePayments(state);
          debouncedSave(clientId);
          var container = document.getElementById('payment-notes-container-' + clientId);
          if (container) renderPaymentNotes(clientId, container);
        }, { currency: true, width: '80px' })
      );
      row.appendChild(priceCell);

      // Subtotal (computed)
      var subtotal = (parseFloat(prod.qty) || 0) * (parseFloat(prod.piecePrice) || 0);
      var subtotalCell = el('td', {
        style: { fontWeight: '700', color: COLORS.text },
      }, [currency(subtotal)]);
      row.appendChild(subtotalCell);

      // Estado
      var statusCell = el('td');
      statusCell.appendChild(statusBadge(prod));
      row.appendChild(statusCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  // ==========================================
  // RENDER PAYMENTS SECTION
  // ==========================================
  function renderPaymentsSection(clientId, state) {
    var section = el('div', { className: 'pn-mb' });

    var titleRow = el('div', {
      className: 'pn-section-title',
      style: { justifyContent: 'space-between' },
    });
    titleRow.appendChild(el('span', null, ['Pagos']));

    var addPayBtn = el('button', { className: 'pn-btn pn-btn-verde pn-btn-sm' }, ['+ Pago']);
    addPayBtn.addEventListener('click', function () {
      state.payments.push({
        date: todayStr(),
        amount: 0,
        method: 'Transferencia',
      });
      allocatePayments(state);
      debouncedSave(clientId);
      var container = document.getElementById('payment-notes-container-' + clientId);
      if (container) renderPaymentNotes(clientId, container);
    });
    titleRow.appendChild(addPayBtn);
    section.appendChild(titleRow);

    if (state.payments.length === 0) {
      section.appendChild(
        el('div', { className: 'pn-empty-state', style: { padding: '12px' } }, [
          'Sin pagos registrados.',
        ])
      );
      return section;
    }

    var list = el('ul', { className: 'pn-payment-list' });

    state.payments.forEach(function (pay, pi) {
      var item = el('li', { className: 'pn-payment-item' });

      // Date
      var dateLabel = el('label', null, ['Fecha:']);
      var dateInput = el('input', {
        type: 'date',
        className: 'pn-edit-input',
        value: pay.date || todayStr(),
        style: { width: '130px' },
      });
      dateInput.addEventListener('change', function () {
        pay.date = dateInput.value;
        debouncedSave(clientId);
      });

      // Amount
      var amountLabel = el('label', null, ['Monto:']);
      var amountInput = el('input', {
        type: 'number',
        className: 'pn-edit-input',
        value: String(pay.amount || 0),
        style: { width: '100px' },
      });
      amountInput.setAttribute('step', 'any');
      amountInput.setAttribute('min', '0');
      amountInput.addEventListener('change', function () {
        pay.amount = parseFloat(amountInput.value) || 0;
        allocatePayments(state);
        debouncedSave(clientId);
        var container = document.getElementById('payment-notes-container-' + clientId);
        if (container) renderPaymentNotes(clientId, container);
      });

      // Method
      var methodLabel = el('label', null, ['Metodo:']);
      var methodSelect = el('select', {
        className: 'pn-edit-input',
        style: { width: '120px' },
      });
      var methods = ['Transferencia', 'Efectivo', 'Deposito', 'Tarjeta', 'Otro'];
      methods.forEach(function (m) {
        var opt = el('option', { value: m }, [m]);
        if (pay.method === m) opt.selected = true;
        methodSelect.appendChild(opt);
      });
      methodSelect.addEventListener('change', function () {
        pay.method = methodSelect.value;
        debouncedSave(clientId);
      });

      // Remove
      var removeBtn = el('button', {
        className: 'pn-remove-btn',
        title: 'Eliminar pago',
      }, ['\u00D7']);
      removeBtn.addEventListener('click', function () {
        state.payments.splice(pi, 1);
        allocatePayments(state);
        debouncedSave(clientId);
        var container = document.getElementById('payment-notes-container-' + clientId);
        if (container) renderPaymentNotes(clientId, container);
      });

      item.appendChild(dateLabel);
      item.appendChild(dateInput);
      item.appendChild(amountLabel);
      item.appendChild(amountInput);
      item.appendChild(methodLabel);
      item.appendChild(methodSelect);
      item.appendChild(removeBtn);
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  // ==========================================
  // RENDER SUMMARY
  // ==========================================
  function renderSummary(state) {
    var grandTotal = 0;
    state.products.forEach(function (p) {
      grandTotal += (parseFloat(p.qty) || 0) * (parseFloat(p.piecePrice) || 0);
    });

    var totalPaid = 0;
    state.payments.forEach(function (pay) {
      totalPaid += parseFloat(pay.amount) || 0;
    });

    var pending = grandTotal - totalPaid;

    var summary = el('div', { className: 'pn-summary' });

    // Total
    var totalItem = el('div', { className: 'pn-summary-item' });
    totalItem.appendChild(el('div', { className: 'pn-summary-label' }, ['Total']));
    totalItem.appendChild(
      el('div', { className: 'pn-summary-value', style: { color: COLORS.turquesa } }, [currency(grandTotal)])
    );
    summary.appendChild(totalItem);

    // Pagado
    var paidItem = el('div', { className: 'pn-summary-item' });
    paidItem.appendChild(el('div', { className: 'pn-summary-label' }, ['Pagado']));
    paidItem.appendChild(
      el('div', { className: 'pn-summary-value', style: { color: COLORS.verde } }, [currency(totalPaid)])
    );
    summary.appendChild(paidItem);

    // Pendiente
    var pendingItem = el('div', { className: 'pn-summary-item' });
    pendingItem.appendChild(el('div', { className: 'pn-summary-label' }, ['Pendiente']));
    pendingItem.appendChild(
      el('div', {
        className: 'pn-summary-value',
        style: { color: pending > 0 ? COLORS.rojo : COLORS.verde },
      }, [currency(Math.max(pending, 0))])
    );
    summary.appendChild(pendingItem);

    return summary;
  }

  // ==========================================
  // RENDER NOTES TEXTAREA
  // ==========================================
  function renderNotesSection(clientId, state) {
    var section = el('div', { className: 'pn-mt' });
    section.appendChild(
      el('div', { className: 'pn-section-title' }, ['Notas'])
    );

    var textarea = el('textarea', {
      className: 'pn-notes-textarea',
      placeholder: 'Notas adicionales sobre este pedido...',
    });
    textarea.value = state.notes || '';
    textarea.addEventListener('input', function () {
      state.notes = textarea.value;
      debouncedSave(clientId);
    });

    section.appendChild(textarea);
    return section;
  }

  // ==========================================
  // MAIN RENDER
  // ==========================================
  function renderPaymentNotes(clientId, container) {
    injectStyles();

    var state = getState(clientId);
    allocatePayments(state);

    container.textContent = '';

    var wrap = el('div', { className: 'pn-wrap' });

    // Header with add product button
    var headerRow = el('div', {
      className: 'pn-section-title',
      style: { justifyContent: 'space-between', marginBottom: '12px' },
    });
    headerRow.appendChild(el('span', null, ['Productos']));

    var addProdBtn = el('button', { className: 'pn-btn pn-btn-turquesa pn-btn-sm' }, ['+ Producto']);
    addProdBtn.addEventListener('click', function () {
      state.products.push({
        name: 'Nuevo producto',
        qty: 0,
        piecePrice: 0,
        numModels: 0,
        submodels: [],
        status: 'pendiente',
        amountPaid: 0,
      });
      allocatePayments(state);
      debouncedSave(clientId);
      renderPaymentNotes(clientId, container);
    });
    headerRow.appendChild(addProdBtn);
    wrap.appendChild(headerRow);

    // Products table
    wrap.appendChild(renderProductsTable(clientId, state));

    // Payments
    wrap.appendChild(renderPaymentsSection(clientId, state));

    // Summary
    wrap.appendChild(renderSummary(state));

    // Notes
    wrap.appendChild(renderNotesSection(clientId, state));

    container.appendChild(wrap);
  }

  // ==========================================
  // GLOBAL: togglePaymentNotes
  // ==========================================
  window.togglePaymentNotes = async function (clientId) {
    injectStyles();

    var container = document.getElementById('payment-notes-container-' + clientId);
    if (!container) {
      console.warn('payment-notes: container not found for client', clientId);
      return;
    }

    // Toggle visibility
    if (container.style.display !== 'none' && container.children.length > 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    // Show loading indicator
    container.textContent = '';
    var loadingDiv = el('div', {
      style: {
        textAlign: 'center',
        padding: '20px',
        color: COLORS.turquesa,
        fontSize: '13px',
      },
    }, ['Cargando notas de pago...']);
    container.appendChild(loadingDiv);

    // Load data if not already loaded
    var state = getState(clientId);
    if (!state.loaded) {
      await loadPaymentNote(clientId);
    }

    // Render
    renderPaymentNotes(clientId, container);
  };

  // ==========================================
  // GLOBAL: openPaymentNotesForClient
  // ==========================================
  window.openPaymentNotesForClient = async function (clientId) {
    // If the client detail popup is open and has the container, just toggle it open
    var container = document.getElementById('payment-notes-container-' + clientId);

    if (!container) {
      // Try to open the client popup first (if showClientDetailPopup exists)
      if (typeof window.showClientDetailPopup === 'function') {
        await window.showClientDetailPopup(clientId);
        // Wait for DOM to update
        await new Promise(function (r) { setTimeout(r, 300); });
        container = document.getElementById('payment-notes-container-' + clientId);
      }
    }

    if (!container) {
      console.warn('payment-notes: could not find/create container for client', clientId);
      return;
    }

    // Ensure it is visible and loaded
    container.style.display = 'block';

    var state = getState(clientId);
    if (!state.loaded) {
      await loadPaymentNote(clientId);
    }

    renderPaymentNotes(clientId, container);

    // Scroll into view
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
})();

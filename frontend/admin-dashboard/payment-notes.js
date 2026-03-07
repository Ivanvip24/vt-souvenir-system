// Cuentas List Module for Admin Dashboard
// Shows a list of cuentas (payment tracking accounts) in the client detail popup
// Clicking a cuenta opens the full-page tracker (cuenta.html)
// Safe DOM methods only — no innerHTML with user data

(function () {
  'use strict';

  function getApiBase() {
    if (window.API_BASE) return window.API_BASE;
    return window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://vt-souvenir-backend.onrender.com/api';
  }

  function authHeaders() {
    var token = typeof window.getAuthToken === 'function'
      ? window.getAuthToken()
      : localStorage.getItem('admin_token');
    return {
      Authorization: 'Bearer ' + (token || ''),
      'Content-Type': 'application/json',
    };
  }

  // ==========================================
  // HELPERS
  // ==========================================
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          Object.keys(attrs[k]).forEach(function (s) {
            node.style[s] = attrs[k][s];
          });
        } else if (k === 'className') {
          node.className = attrs[k];
        } else if (k.indexOf('on') === 0) {
          node.addEventListener(k.substring(2).toLowerCase(), attrs[k]);
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (typeof c === 'string') {
          node.appendChild(document.createTextNode(c));
        } else if (c) {
          node.appendChild(c);
        }
      });
    }
    return node;
  }

  function formatMoney(n) {
    return '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ==========================================
  // COMPUTE CUENTA SUMMARY FROM JSONB DATA
  // ==========================================
  function computeSummary(data) {
    var d = typeof data === 'string' ? JSON.parse(data) : (data || {});
    var products = Array.isArray(d.products) ? d.products : [];
    var payments = Array.isArray(d.payments) ? d.payments : [];

    var total = 0;
    products.forEach(function (p) {
      if (Array.isArray(p.submodels) && p.submodels.length > 0) {
        p.submodels.forEach(function (s) {
          total += (Number(s.pieces) || 0) * (Number(s.piecePrice) || 0);
        });
      } else {
        total += (Number(p.price) || 0) * (Number(p.piecePrice) || 0);
      }
    });

    var paid = 0;
    payments.forEach(function (pay) {
      paid += Number(pay.amount) || 0;
    });

    var pending = total - paid;
    var productCount = products.length;

    var statusLabel = 'Sin datos';
    var statusColor = '#8892a4';
    if (total > 0) {
      if (pending <= 0) {
        statusLabel = 'Pagado';
        statusColor = '#22c55e';
      } else if (paid > 0) {
        statusLabel = 'Parcial';
        statusColor = '#f59e0b';
      } else {
        statusLabel = 'Pendiente';
        statusColor = '#ef4444';
      }
    }

    return { total: total, paid: paid, pending: pending, productCount: productCount, statusLabel: statusLabel, statusColor: statusColor };
  }

  // ==========================================
  // FETCH CUENTAS LIST
  // ==========================================
  async function fetchCuentas(clientId) {
    try {
      var res = await fetch(getApiBase() + '/payment-notes/client/' + clientId, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      return json.success ? (json.data || []) : [];
    } catch (err) {
      console.error('cuentas: fetch error', err);
      return [];
    }
  }

  // ==========================================
  // CREATE NEW CUENTA
  // ==========================================
  async function createCuenta(clientId) {
    try {
      var res = await fetch(getApiBase() + '/payment-notes', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ clientId: clientId, name: 'Cuenta nueva', data: {} }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
      return null;
    } catch (err) {
      console.error('cuentas: create error', err);
      return null;
    }
  }

  // ==========================================
  // DELETE CUENTA
  // ==========================================
  async function deleteCuenta(cuentaId, clientId, container) {
    if (!confirm('¿Eliminar esta cuenta? Esta acción no se puede deshacer.')) return;
    try {
      await fetch(getApiBase() + '/payment-notes/cuenta/' + cuentaId, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      // Re-render the list
      await renderCuentasList(clientId, container);
    } catch (err) {
      console.error('cuentas: delete error', err);
    }
  }

  // ==========================================
  // RENDER CUENTAS LIST
  // ==========================================
  async function renderCuentasList(clientId, container) {
    container.textContent = '';

    var cuentas = await fetchCuentas(clientId);

    if (cuentas.length === 0) {
      var emptyMsg = el('div', {
        style: {
          textAlign: 'center',
          padding: '16px',
          color: '#8892a4',
          fontSize: '13px',
        },
      }, ['Sin cuentas registradas. Crea una para comenzar.']);
      container.appendChild(emptyMsg);
      return;
    }

    // Render each cuenta as a card
    cuentas.forEach(function (cuenta) {
      var summary = computeSummary(cuenta.data);
      var cuentaName = cuenta.name || 'Cuenta #' + cuenta.id;

      var card = el('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          marginBottom: '6px',
          background: '#16213e',
          border: '1px solid #2a3a5c',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        },
      });

      // Hover effect
      card.addEventListener('mouseenter', function () { card.style.borderColor = '#09adc2'; });
      card.addEventListener('mouseleave', function () { card.style.borderColor = '#2a3a5c'; });

      // Left side: name + date
      var leftDiv = el('div', { style: { flex: '1', minWidth: '0' } });

      var nameEl = el('div', {
        style: {
          fontWeight: '600',
          fontSize: '13px',
          color: '#e0e0e0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      }, [cuentaName]);

      var dateEl = el('div', {
        style: { fontSize: '11px', color: '#8892a4', marginTop: '2px' },
      }, [formatDate(cuenta.created_at) + (summary.productCount > 0 ? ' · ' + summary.productCount + ' producto' + (summary.productCount > 1 ? 's' : '') : '')]);

      leftDiv.appendChild(nameEl);
      leftDiv.appendChild(dateEl);

      // Middle: amounts
      var midDiv = el('div', {
        style: {
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          marginLeft: '12px',
          marginRight: '12px',
          flexShrink: '0',
        },
      });

      var totalEl = el('div', { style: { textAlign: 'right' } }, [
        el('div', { style: { fontSize: '11px', color: '#8892a4' } }, ['Total']),
        el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#e0e0e0', fontFamily: "'JetBrains Mono', monospace" } }, [formatMoney(summary.total)]),
      ]);

      var pendingEl = el('div', { style: { textAlign: 'right' } }, [
        el('div', { style: { fontSize: '11px', color: '#8892a4' } }, ['Pendiente']),
        el('div', { style: { fontSize: '13px', fontWeight: '600', color: summary.statusColor, fontFamily: "'JetBrains Mono', monospace" } }, [formatMoney(summary.pending > 0 ? summary.pending : 0)]),
      ]);

      midDiv.appendChild(totalEl);
      midDiv.appendChild(pendingEl);

      // Status badge
      var badge = el('span', {
        style: {
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '600',
          color: summary.statusColor,
          background: summary.statusColor + '1a',
          border: '1px solid ' + summary.statusColor + '33',
          flexShrink: '0',
        },
      }, [summary.statusLabel]);

      // Delete button
      var deleteBtn = el('button', {
        style: {
          background: 'none',
          border: 'none',
          color: '#8892a4',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '4px 6px',
          marginLeft: '8px',
          borderRadius: '4px',
          flexShrink: '0',
        },
        title: 'Eliminar cuenta',
        onClick: function (e) {
          e.stopPropagation();
          deleteCuenta(cuenta.id, clientId, container);
        },
      }, ['✕']);
      deleteBtn.addEventListener('mouseenter', function () { deleteBtn.style.color = '#e52421'; });
      deleteBtn.addEventListener('mouseleave', function () { deleteBtn.style.color = '#8892a4'; });

      card.appendChild(leftDiv);
      card.appendChild(midDiv);
      card.appendChild(badge);
      card.appendChild(deleteBtn);

      // Click card → open full page
      card.addEventListener('click', function () {
        window.open('cuenta.html?clientId=' + clientId + '&cuentaId=' + cuenta.id, '_blank');
      });

      container.appendChild(card);
    });
  }

  // ==========================================
  // GLOBAL: togglePaymentNotes (list mode)
  // ==========================================
  window.togglePaymentNotes = async function (clientId) {
    var container = document.getElementById('payment-notes-container-' + clientId);
    if (!container) return;

    // If clicking "+ Nueva Cuenta" → create and open directly
    var cuenta = await createCuenta(clientId);
    if (cuenta) {
      window.open('cuenta.html?clientId=' + clientId + '&cuentaId=' + cuenta.id, '_blank');
    }

    // Also refresh the list if container is visible
    if (container.style.display !== 'none') {
      await renderCuentasList(clientId, container);
    }
  };

  // ==========================================
  // GLOBAL: openPaymentNotesForClient
  // ==========================================
  window.openPaymentNotesForClient = async function (clientId) {
    var container = document.getElementById('payment-notes-container-' + clientId);

    if (!container) {
      if (typeof window.showClientDetailPopup === 'function') {
        await window.showClientDetailPopup(clientId);
        await new Promise(function (r) { setTimeout(r, 300); });
        container = document.getElementById('payment-notes-container-' + clientId);
      }
    }

    if (!container) {
      console.warn('cuentas: could not find container for client', clientId);
      return;
    }

    // Show and render the list
    container.style.display = 'block';
    await renderCuentasList(clientId, container);
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
})();

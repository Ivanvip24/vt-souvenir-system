/**
 * Leads / Clients Module
 * Displays cuestionario form responses in the admin dashboard
 */

// ==========================================
// STATE
// ==========================================

const leadsState = {
  leads: [],
  loaded: false
};

// ==========================================
// DATA
// ==========================================

async function loadLeads() {
  const container = document.getElementById('leads-container');
  if (!container) return;

  container.innerHTML = '<p style="color:#888;padding:40px;text-align:center;">Cargando leads...</p>';

  try {
    const res = await fetch(`${API_BASE}/leads`, { headers: getAuthHeaders() });
    const json = await res.json();

    if (json.success) {
      leadsState.leads = json.data || [];
      leadsState.loaded = true;
      renderLeads();
    } else {
      container.innerHTML = '<p style="color:#e74c3c;padding:40px;text-align:center;">Error cargando leads</p>';
    }
  } catch (err) {
    console.error('Error loading leads:', err);
    container.innerHTML = '<p style="color:#e74c3c;padding:40px;text-align:center;">Error de conexion</p>';
  }
}

// ==========================================
// RENDER
// ==========================================

function renderLeads() {
  const container = document.getElementById('leads-container');
  const countEl = document.getElementById('leads-count');
  if (!container) return;

  const leads = leadsState.leads;

  if (countEl) {
    countEl.textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''}`;
  }

  if (leads.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#888;">
        <i data-lucide="users" style="width:48px;height:48px;margin-bottom:16px;opacity:0.3;"></i>
        <p style="font-size:16px;margin-bottom:8px;">No hay leads todavia</p>
        <p style="font-size:13px;">Los leads apareceran aqui cuando alguien llene el cuestionario en axkan.art</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  let html = `
    <div style="overflow-x:auto;">
      <table class="data-table" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">Nombre</th>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">Empresa</th>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">Email</th>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">WhatsApp</th>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">Productos</th>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">Cantidad</th>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">Timeline</th>
            <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;">Fecha</th>
            <th style="text-align:center;padding:12px 16px;border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;color:#888;"></th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const lead of leads) {
    const date = lead.created_at ? new Date(lead.created_at).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric'
    }) : '-';

    html += `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:12px 16px;font-weight:500;">${esc(lead.name)}</td>
        <td style="padding:12px 16px;color:#555;">${esc(lead.company)}</td>
        <td style="padding:12px 16px;"><a href="mailto:${esc(lead.email)}" style="color:#e72a88;text-decoration:none;">${esc(lead.email)}</a></td>
        <td style="padding:12px 16px;"><a href="https://wa.me/${(lead.whatsapp || '').replace(/\D/g, '')}" target="_blank" style="color:#25d366;text-decoration:none;">${esc(lead.whatsapp)}</a></td>
        <td style="padding:12px 16px;font-size:13px;color:#555;">${esc(lead.products)}</td>
        <td style="padding:12px 16px;color:#555;">${esc(lead.quantity)}</td>
        <td style="padding:12px 16px;color:#555;">${esc(lead.timeline)}</td>
        <td style="padding:12px 16px;color:#888;font-size:13px;white-space:nowrap;">${date}</td>
        <td style="padding:12px 16px;text-align:center;">
          <button onclick="deleteLead(${lead.id})" style="background:none;border:none;cursor:pointer;color:#ccc;padding:4px;" title="Eliminar">
            <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
          </button>
        </td>
      </tr>
    `;
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function esc(text) {
  if (!text) return '-';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================================
// ACTIONS
// ==========================================

async function deleteLead(id) {
  if (!confirm('Eliminar este lead?')) return;

  try {
    const res = await fetch(`${API_BASE}/leads/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const json = await res.json();
    if (json.success) {
      leadsState.leads = leadsState.leads.filter(l => l.id !== id);
      renderLeads();
    }
  } catch (err) {
    console.error('Error deleting lead:', err);
  }
}

// ==========================================
// EXPOSE GLOBALLY
// ==========================================

window.loadLeads = loadLeads;
window.deleteLead = deleteLead;

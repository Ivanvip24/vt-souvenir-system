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
      <tr style="border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background 0.15s;" onclick="showLeadDetail(${lead.id})" onmouseenter="this.style.background='#faf5f8'" onmouseleave="this.style.background=''">
        <td style="padding:12px 16px;font-weight:500;">${esc(lead.name)}</td>
        <td style="padding:12px 16px;color:#555;">${esc(lead.company)}</td>
        <td style="padding:12px 16px;"><span style="color:#e72a88;">${esc(lead.email)}</span></td>
        <td style="padding:12px 16px;"><span style="color:#25d366;">${esc(lead.whatsapp)}</span></td>
        <td style="padding:12px 16px;font-size:13px;color:#555;">${esc(lead.products)}</td>
        <td style="padding:12px 16px;color:#555;">${esc(lead.quantity)}</td>
        <td style="padding:12px 16px;color:#555;">${esc(lead.timeline)}</td>
        <td style="padding:12px 16px;color:#888;font-size:13px;white-space:nowrap;">${date}</td>
        <td style="padding:12px 16px;text-align:center;">
          <button onclick="event.stopPropagation();deleteLead(${lead.id})" style="background:none;border:none;cursor:pointer;color:#ccc;padding:4px;" title="Eliminar">
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
// LEAD DETAIL CARD
// ==========================================

function showLeadDetail(id) {
  const lead = leadsState.leads.find(l => l.id === id);
  if (!lead) return;

  const date = lead.created_at ? new Date(lead.created_at).toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }) : '-';

  const timeAgo = lead.created_at ? getTimeAgo(new Date(lead.created_at)) : '';
  const whatsappClean = (lead.whatsapp || '').replace(/\D/g, '');
  const productTags = (lead.products || '').split(',').map(p => p.trim()).filter(Boolean);

  // Remove existing overlay
  const existing = document.getElementById('lead-detail-overlay');
  if (existing) existing.remove();

  // Build overlay using DOM APIs (all data is escaped via esc() or textContent)
  const overlay = document.createElement('div');
  overlay.id = 'lead-detail-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);';
  backdrop.addEventListener('click', closeLeadDetail);
  overlay.appendChild(backdrop);

  // Card container
  const card = document.createElement('div');
  card.style.cssText = 'position:relative;z-index:1;background:#fff;border-radius:16px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);overflow:hidden;animation:leadCardIn 0.2s ease-out;';

  // === HEADER ===
  const header = document.createElement('div');
  header.style.cssText = 'background:linear-gradient(135deg,#e72a88 0%,#f39223 100%);padding:28px 24px 20px;color:#fff;position:relative;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00D7';
  closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  closeBtn.addEventListener('click', closeLeadDetail);
  header.appendChild(closeBtn);

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:4px;';
  nameEl.textContent = lead.name || '-';
  header.appendChild(nameEl);

  if (lead.company) {
    const companyEl = document.createElement('div');
    companyEl.style.cssText = 'font-size:14px;opacity:0.9;';
    companyEl.textContent = lead.company;
    header.appendChild(companyEl);
  }

  const timeEl = document.createElement('div');
  timeEl.style.cssText = 'font-size:12px;opacity:0.75;margin-top:8px;';
  timeEl.textContent = timeAgo;
  header.appendChild(timeEl);

  card.appendChild(header);

  // === BODY ===
  const body = document.createElement('div');
  body.style.cssText = 'padding:24px;';

  // Contact section
  const contactSection = document.createElement('div');
  contactSection.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-bottom:20px;';

  if (lead.email) {
    const emailRow = createContactRow('\u2709', '#fdf2f8', 'Email', lead.email, 'mailto:' + lead.email, '#e72a88');
    contactSection.appendChild(emailRow);
  }
  if (lead.whatsapp) {
    const waRow = createContactRow('\uD83D\uDCF1', '#f0fdf4', 'WhatsApp', lead.whatsapp, 'https://wa.me/' + whatsappClean, '#25d366');
    contactSection.appendChild(waRow);
  }
  body.appendChild(contactSection);

  // Divider
  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:#f0f0f0;margin-bottom:20px;';
  body.appendChild(divider);

  // Products
  const productsLabel = document.createElement('div');
  productsLabel.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;';
  productsLabel.textContent = 'Productos de interes';
  body.appendChild(productsLabel);

  const tagsContainer = document.createElement('div');
  tagsContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;';
  if (productTags.length > 0) {
    productTags.forEach(p => {
      const tag = document.createElement('span');
      tag.style.cssText = 'display:inline-block;padding:4px 12px;background:#fdf2f8;color:#e72a88;border-radius:20px;font-size:13px;font-weight:500;';
      tag.textContent = p;
      tagsContainer.appendChild(tag);
    });
  } else {
    const noTag = document.createElement('span');
    noTag.style.cssText = 'color:#aaa;font-size:13px;';
    noTag.textContent = '-';
    tagsContainer.appendChild(noTag);
  }
  body.appendChild(tagsContainer);

  // Quantity & Timeline grid
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;';
  grid.appendChild(createStatBox('Cantidad', lead.quantity || '-'));
  grid.appendChild(createStatBox('Timeline', lead.timeline || '-'));
  body.appendChild(grid);

  // Source
  if (lead.source) {
    const srcLabel = document.createElement('div');
    srcLabel.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;';
    srcLabel.textContent = 'Fuente';
    body.appendChild(srcLabel);

    const srcVal = document.createElement('div');
    srcVal.style.cssText = 'font-size:13px;color:#555;margin-bottom:16px;';
    srcVal.textContent = lead.source;
    body.appendChild(srcVal);
  }

  // Date
  const dateEl = document.createElement('div');
  dateEl.style.cssText = 'font-size:12px;color:#aaa;text-align:center;margin-top:8px;';
  dateEl.textContent = date;
  body.appendChild(dateEl);

  card.appendChild(body);

  // === FOOTER ACTIONS ===
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:12px 24px 20px;display:flex;gap:8px;';

  if (lead.whatsapp) {
    const waBtn = document.createElement('a');
    waBtn.href = 'https://wa.me/' + whatsappClean;
    waBtn.target = '_blank';
    waBtn.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:#25d366;color:#fff;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;';
    waBtn.textContent = '\uD83D\uDCAC WhatsApp';
    footer.appendChild(waBtn);
  }

  if (lead.email) {
    const emailBtn = document.createElement('a');
    emailBtn.href = 'mailto:' + lead.email;
    emailBtn.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:#e72a88;color:#fff;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;';
    emailBtn.textContent = '\u2709 Email';
    footer.appendChild(emailBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.style.cssText = 'padding:10px 14px;background:#fef2f2;color:#ef4444;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;';
  deleteBtn.textContent = '\uD83D\uDDD1';
  deleteBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    closeLeadDetail();
    deleteLead(lead.id);
  });
  footer.appendChild(deleteBtn);

  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeLeadDetail();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function createContactRow(icon, bgColor, label, value, href, linkColor) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:12px;';

  const iconBox = document.createElement('div');
  iconBox.style.cssText = 'width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + bgColor + ';';
  iconBox.textContent = icon;
  row.appendChild(iconBox);

  const info = document.createElement('div');
  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;';
  labelEl.textContent = label;
  info.appendChild(labelEl);

  const link = document.createElement('a');
  link.href = href;
  if (href.startsWith('https://')) link.target = '_blank';
  link.style.cssText = 'color:' + linkColor + ';text-decoration:none;font-size:14px;font-weight:500;';
  link.textContent = value;
  info.appendChild(link);

  row.appendChild(info);
  return row;
}

function createStatBox(label, value) {
  const box = document.createElement('div');
  box.style.cssText = 'background:#f9fafb;border-radius:10px;padding:12px 16px;';

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;';
  labelEl.textContent = label;
  box.appendChild(labelEl);

  const valEl = document.createElement('div');
  valEl.style.cssText = 'font-size:18px;font-weight:700;color:#1a1a1a;margin-top:2px;';
  valEl.textContent = value;
  box.appendChild(valEl);

  return box;
}

function closeLeadDetail() {
  const overlay = document.getElementById('lead-detail-overlay');
  if (overlay) overlay.remove();
}

function getTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Justo ahora';
  if (mins < 60) return 'Hace ' + mins + ' min';
  if (hrs < 24) return 'Hace ' + hrs + 'h';
  if (days === 1) return 'Ayer';
  if (days < 7) return 'Hace ' + days + ' dias';
  if (days < 30) return 'Hace ' + Math.floor(days / 7) + ' semanas';
  return 'Hace ' + Math.floor(days / 30) + ' meses';
}

// ==========================================
// EXPOSE GLOBALLY
// ==========================================

window.loadLeads = loadLeads;
window.deleteLead = deleteLead;
window.showLeadDetail = showLeadDetail;
window.closeLeadDetail = closeLeadDetail;

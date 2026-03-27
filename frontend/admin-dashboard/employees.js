/**
 * Employee Management Module
 * Handles CRUD operations for employee accounts
 */

let allEmployees = [];
let filteredEmployees = [];

// Role and Department mappings
const ROLE_LABELS = {
  design: 'Diseñador',
  production: 'Producción',
  shipping: 'Envíos',
  manager: 'Gerente'
};

const DEPT_LABELS = {
  design: 'Diseño',
  production: 'Producción',
  shipping: 'Envíos',
  management: 'Gerencia'
};

/**
 * Load all employees from API
 */
async function loadEmployees() {
  try {
    const response = await fetch(`${API_BASE}/admin/employees`, {
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      allEmployees = data.employees;
      filteredEmployees = [...allEmployees];
      renderEmployeesTable();
      updateEmployeeStats();
    } else {
      showToast(data.error || 'Error al cargar empleados', 'error');
    }
  } catch (error) {
    console.error('Load employees error:', error);
    showToast('Error de conexión', 'error');
  }
}

/**
 * Update employee statistics
 */
function updateEmployeeStats() {
  const total = allEmployees.length;
  const active = allEmployees.filter(e => e.is_active).length;
  const inactive = total - active;
  const managers = allEmployees.filter(e => e.role === 'manager').length;

  document.getElementById('total-employees-count').textContent = total;
  document.getElementById('active-employees-count').textContent = active;
  document.getElementById('inactive-employees-count').textContent = inactive;
  document.getElementById('manager-count').textContent = managers;
}

/**
 * Render the employees table
 */
function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');

  if (filteredEmployees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">
          No se encontraron empleados
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredEmployees.map(emp => `
    <tr style="border-bottom: 1px solid #e5e7eb; cursor: pointer;" onclick="openEmployeeDetailModal(${emp.id})" class="employee-row-hover">
      <td style="padding: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: ${getAvatarColor(emp.role)}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
            ${getInitials(emp.name)}
          </div>
          <div>
            <div style="font-weight: 600; color: #1f2937;">${escapeHtml(emp.name)}</div>
            ${emp.phone ? `<div style="font-size: 12px; color: #6b7280;">${escapeHtml(emp.phone)}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="padding: 16px; color: #4b5563;">${escapeHtml(emp.email)}</td>
      <td style="padding: 16px;">
        <span class="role-badge role-${emp.role}">${ROLE_LABELS[emp.role] || emp.role}</span>
      </td>
      <td style="padding: 16px; text-align: center;">
        <span class="status-badge ${emp.is_active ? 'status-active' : 'status-inactive'}">
          ${emp.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td style="padding: 16px; color: #6b7280; font-size: 13px;">
        ${emp.last_login ? formatDateRelative(emp.last_login) : 'Nunca'}
      </td>
      <td style="padding: 16px; text-align: center;" onclick="event.stopPropagation()">
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button onclick="openEditEmployeeModal(${emp.id})" class="btn-icon" title="Editar">
            ✏️
          </button>
          <button onclick="openResetPasswordModal(${emp.id}, '${escapeHtml(emp.name)}')" class="btn-icon" title="Restablecer contraseña">
            🔑
          </button>
          ${emp.is_active
            ? `<button onclick="toggleEmployeeStatus(${emp.id}, false)" class="btn-icon" title="Desactivar">⏸️</button>`
            : `<button onclick="toggleEmployeeStatus(${emp.id}, true)" class="btn-icon" title="Activar">▶️</button>`
          }
          <button onclick="deleteEmployee(${emp.id}, '${escapeHtml(emp.name)}')" class="btn-icon btn-icon-danger" title="Eliminar">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Get avatar background color based on role
 */
function getAvatarColor(role) {
  const colors = {
    manager: '#e72a88',
    design: '#8ab73b',
    production: '#f39223',
    shipping: '#09adc2'
  };
  return colors[role] || '#6b7280';
}

/**
 * Get initials from name
 */
function getInitials(name) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Format date for display (relative time for employees)
 */
function formatDateRelative(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  // Less than 24 hours
  if (diff < 86400000) {
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `Hace ${days} día${days > 1 ? 's' : ''}`;
  }

  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/**
 * Filter employees based on filters
 */
function filterEmployees() {
  const role = document.getElementById('employee-role-filter').value;
  const status = document.getElementById('employee-status-filter').value;

  filteredEmployees = allEmployees.filter(emp => {
    if (role && emp.role !== role) return false;
    if (status !== '' && emp.is_active !== (status === 'true')) return false;
    return true;
  });

  renderEmployeesTable();
}

/**
 * Search employees by name or email
 */
function searchEmployees() {
  const query = document.getElementById('employee-search').value.toLowerCase().trim();

  if (!query) {
    filterEmployees();
    return;
  }

  filteredEmployees = allEmployees.filter(emp => {
    return emp.name.toLowerCase().includes(query) ||
           emp.email.toLowerCase().includes(query);
  });

  renderEmployeesTable();
}

/**
 * Open modal to add new employee
 */
function openAddEmployeeModal() {
  document.getElementById('employee-modal-title').textContent = 'Agregar Empleado';
  document.getElementById('employee-form').reset();
  document.getElementById('employee-id').value = '';
  document.getElementById('employee-email').disabled = false;
  document.getElementById('employee-password').required = true;
  document.getElementById('status-group').style.display = 'none';
  document.getElementById('password-group').querySelector('.form-hint').style.display = 'none';
  document.getElementById('employee-modal').classList.remove('hidden');
}

/**
 * Open modal to edit employee
 */
async function openEditEmployeeModal(employeeId) {
  const employee = allEmployees.find(e => e.id === employeeId);
  if (!employee) return;

  document.getElementById('employee-modal-title').textContent = 'Editar Empleado';
  document.getElementById('employee-id').value = employee.id;
  document.getElementById('employee-name').value = employee.name;
  document.getElementById('employee-email').value = employee.email;
  document.getElementById('employee-email').disabled = true;
  document.getElementById('employee-password').value = '';
  document.getElementById('employee-password').required = false;
  document.getElementById('employee-role').value = employee.role;
  document.getElementById('employee-department').value = employee.department;
  document.getElementById('employee-phone').value = employee.phone || '';
  document.getElementById('employee-active').checked = employee.is_active;
  document.getElementById('status-group').style.display = 'block';
  document.getElementById('password-group').querySelector('.form-hint').style.display = 'block';
  document.getElementById('employee-modal').classList.remove('hidden');
}

/**
 * Close employee modal
 */
function closeEmployeeModal() {
  document.getElementById('employee-modal').classList.add('hidden');
}

/**
 * Save employee (create or update)
 */
async function saveEmployee(event) {
  event.preventDefault();

  const employeeId = document.getElementById('employee-id').value;
  const isEdit = !!employeeId;

  const employeeData = {
    name: document.getElementById('employee-name').value.trim(),
    email: document.getElementById('employee-email').value.trim(),
    role: document.getElementById('employee-role').value,
    department: document.getElementById('employee-department').value,
    phone: document.getElementById('employee-phone').value.trim() || null
  };

  // Add password only if provided
  const password = document.getElementById('employee-password').value;
  if (password) {
    if (password.length < 8) {
      showToast('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      showToast('La contraseña debe incluir mayúsculas, minúsculas y números', 'error');
      return;
    }
    employeeData.password = password;
  } else if (!isEdit) {
    showToast('La contraseña es requerida', 'error');
    return;
  }

  // Add is_active for edits
  if (isEdit) {
    employeeData.is_active = document.getElementById('employee-active').checked;
  }

  try {
    const url = isEdit
      ? `${API_BASE}/admin/employees/${employeeId}`
      : `${API_BASE}/admin/employees`;

    const method = isEdit ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(employeeData)
    });

    const data = await response.json();

    if (data.success) {
      showToast(isEdit ? 'Empleado actualizado' : 'Empleado creado', 'success');
      closeEmployeeModal();
      loadEmployees();
    } else {
      showToast(data.error || 'Error al guardar', 'error');
    }
  } catch (error) {
    console.error('Save employee error:', error);
    showToast('Error de conexión', 'error');
  }
}

/**
 * Toggle employee active status
 */
async function toggleEmployeeStatus(employeeId, active) {
  const action = active ? 'activar' : 'desactivar';

  if (!confirm(`¿Estás seguro de ${action} este empleado?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/employees/${employeeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ is_active: active })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Empleado ${active ? 'activado' : 'desactivado'}`, 'success');
      loadEmployees();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (error) {
    console.error('Toggle status error:', error);
    showToast('Error de conexión', 'error');
  }
}

/**
 * Open reset password modal
 */
function openResetPasswordModal(employeeId, employeeName) {
  document.getElementById('reset-password-employee-id').value = employeeId;
  document.getElementById('reset-password-employee-name').textContent = `Restablecer contraseña para: ${employeeName}`;
  document.getElementById('reset-password-form').reset();
  document.getElementById('reset-password-modal').classList.remove('hidden');
}

/**
 * Close reset password modal
 */
function closeResetPasswordModal() {
  document.getElementById('reset-password-modal').classList.add('hidden');
}

/**
 * Reset employee password
 */
async function resetEmployeePassword(event) {
  event.preventDefault();

  const employeeId = document.getElementById('reset-password-employee-id').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword !== confirmPassword) {
    showToast('Las contraseñas no coinciden', 'error');
    return;
  }

  if (newPassword.length < 8) {
    showToast('La contraseña debe tener al menos 8 caracteres', 'error');
    return;
  }

  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    showToast('La contraseña debe incluir mayúsculas, minúsculas y números', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/employees/${employeeId}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ newPassword })
    });

    const data = await response.json();

    if (data.success) {
      showToast('Contraseña restablecida correctamente', 'success');
      closeResetPasswordModal();
    } else {
      showToast(data.error || 'Error al restablecer contraseña', 'error');
    }
  } catch (error) {
    console.error('Reset password error:', error);
    showToast('Error de conexión', 'error');
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Open employee detail popup (click on row)
 */
function openEmployeeDetailModal(employeeId) {
  const emp = allEmployees.find(e => e.id === employeeId);
  if (!emp) return;

  const createdDate = emp.created_at
    ? new Date(emp.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  const lastLogin = emp.last_login
    ? new Date(emp.last_login).toLocaleString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Nunca';

  let modal = document.getElementById('employee-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'employee-detail-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeEmployeeDetailModal()"></div>
    <div class="modal-content" style="max-width: 520px;">
      <div class="modal-header">
        <h3 style="margin: 0;">Detalle del Empleado</h3>
        <button class="btn-close" onclick="closeEmployeeDetailModal()">&times;</button>
      </div>
      <div class="modal-body" style="padding: 24px;">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: ${getAvatarColor(emp.role)}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 22px;">
            ${getInitials(emp.name)}
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 700; color: #1f2937;">${escapeHtml(emp.name)}</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
              <span class="role-badge role-${emp.role}">${ROLE_LABELS[emp.role] || emp.role}</span>
              <span class="status-badge ${emp.is_active ? 'status-active' : 'status-inactive'}">${emp.is_active ? 'Activo' : 'Inactivo'}</span>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px;">Email</div>
            <div style="color: #374151; font-size: 14px; word-break: break-all;">${escapeHtml(emp.email)}</div>
          </div>
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px;">Teléfono</div>
            <div style="color: #374151; font-size: 14px;">${emp.phone ? escapeHtml(emp.phone) : '—'}</div>
          </div>
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px;">Último acceso</div>
            <div style="color: #374151; font-size: 14px;">${lastLogin}</div>
          </div>
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px;">Fecha de registro</div>
            <div style="color: #374151; font-size: 14px;">${createdDate}</div>
          </div>
          ${emp.department ? `
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px;">Departamento</div>
            <div style="color: #374151; font-size: 14px;">${DEPT_LABELS[emp.department] || emp.department}</div>
          </div>` : ''}
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px;">ID</div>
            <div style="color: #374151; font-size: 14px;">${emp.id}</div>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
        <button class="btn btn-secondary" onclick="closeEmployeeDetailModal(); openEditEmployeeModal(${emp.id});">✏️ Editar</button>
        <button class="btn btn-secondary" onclick="closeEmployeeDetailModal(); openResetPasswordModal(${emp.id}, '${escapeHtml(emp.name)}');">🔑 Contraseña</button>
        ${emp.is_active
          ? `<button class="btn btn-secondary" onclick="closeEmployeeDetailModal(); toggleEmployeeStatus(${emp.id}, false);">⏸️ Desactivar</button>`
          : `<button class="btn btn-secondary" onclick="closeEmployeeDetailModal(); toggleEmployeeStatus(${emp.id}, true);">▶️ Activar</button>`
        }
        <button class="btn btn-danger" onclick="closeEmployeeDetailModal(); deleteEmployee(${emp.id}, '${escapeHtml(emp.name)}');">🗑️ Eliminar</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

/**
 * Close employee detail modal
 */
function closeEmployeeDetailModal() {
  const modal = document.getElementById('employee-detail-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Delete (soft-delete) an employee
 */
async function deleteEmployee(employeeId, employeeName) {
  if (!confirm(`¿Estás seguro de ELIMINAR a ${employeeName}? Esta acción desactivará su cuenta permanentemente.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/employees/${employeeId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      showToast(`${employeeName} eliminado correctamente`, 'success');
      loadEmployees();
    } else {
      showToast(data.error || 'Error al eliminar empleado', 'error');
    }
  } catch (error) {
    console.error('Delete employee error:', error);
    showToast('Error de conexión', 'error');
  }
}

// Export functions globally
window.loadEmployees = loadEmployees;
window.filterEmployees = filterEmployees;
window.searchEmployees = searchEmployees;
window.openAddEmployeeModal = openAddEmployeeModal;
window.openEditEmployeeModal = openEditEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.saveEmployee = saveEmployee;
window.toggleEmployeeStatus = toggleEmployeeStatus;
window.openResetPasswordModal = openResetPasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.resetEmployeePassword = resetEmployeePassword;
window.openEmployeeDetailModal = openEmployeeDetailModal;
window.closeEmployeeDetailModal = closeEmployeeDetailModal;
window.deleteEmployee = deleteEmployee;

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
    const response = await fetch(`${API_BASE}/employees`, {
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
        <td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">
          No se encontraron empleados
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredEmployees.map(emp => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
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
      <td style="padding: 16px; color: #4b5563;">${DEPT_LABELS[emp.department] || emp.department}</td>
      <td style="padding: 16px; text-align: center;">
        <span class="status-badge ${emp.is_active ? 'status-active' : 'status-inactive'}">
          ${emp.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td style="padding: 16px; color: #6b7280; font-size: 13px;">
        ${emp.last_login ? formatDate(emp.last_login) : 'Nunca'}
      </td>
      <td style="padding: 16px; text-align: center;">
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
 * Format date for display
 */
function formatDate(dateString) {
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
  const dept = document.getElementById('employee-dept-filter').value;
  const role = document.getElementById('employee-role-filter').value;
  const status = document.getElementById('employee-status-filter').value;

  filteredEmployees = allEmployees.filter(emp => {
    if (dept && emp.department !== dept) return false;
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
    if (password.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres', 'error');
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
      ? `${API_BASE}/employees/${employeeId}`
      : `${API_BASE}/employees`;

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
    const response = await fetch(`${API_BASE}/employees/${employeeId}`, {
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

  if (newPassword.length < 6) {
    showToast('La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/employees/${employeeId}/password`, {
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

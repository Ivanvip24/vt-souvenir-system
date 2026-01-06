/**
 * Task Management Module for Admin Dashboard
 * Handles CRUD operations for tasks
 */

let allTasks = [];
let filteredTasks = [];
let taskEmployees = [];

// Labels for display
const DEPT_LABELS = {
  design: 'Diseno',
  production: 'Produccion',
  shipping: 'Envios'
};

const STATUS_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En Progreso',
  completed: 'Completada',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada'
};

const PRIORITY_LABELS = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja'
};

const PRIORITY_COLORS = {
  urgent: '#dc2626',
  high: '#f97316',
  normal: '#3b82f6',
  low: '#9ca3af'
};

const STATUS_COLORS = {
  pending: '#fbbf24',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  blocked: '#dc2626',
  cancelled: '#6b7280'
};

/**
 * Load tasks data from API
 */
async function loadTasksData() {
  try {
    // Load tasks
    const params = new URLSearchParams();
    const dept = document.getElementById('task-dept-filter')?.value;
    const status = document.getElementById('task-status-filter')?.value;
    const priority = document.getElementById('task-priority-filter')?.value;
    const employee = document.getElementById('task-employee-filter')?.value;

    if (dept) params.append('department', dept);
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    if (employee) params.append('assigned_to', employee);

    const response = await fetch(`${API_BASE}/admin/tasks?${params.toString()}`, {
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      allTasks = data.tasks;
      filteredTasks = [...allTasks];
      renderTasksTable();
    } else {
      showToast(data.error || 'Error al cargar tareas', 'error');
    }

    // Load stats
    await loadTaskStats();

    // Load employees for filters and dropdowns
    await loadTaskEmployees();

  } catch (error) {
    console.error('Load tasks error:', error);
    showToast('Error de conexion', 'error');
  }
}

/**
 * Load task statistics
 */
async function loadTaskStats() {
  try {
    const response = await fetch(`${API_BASE}/admin/tasks/stats`, {
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      const stats = data.stats;
      document.getElementById('total-tasks-count').textContent = stats.total || 0;
      document.getElementById('pending-tasks-count').textContent = stats.pending || 0;
      document.getElementById('inprogress-tasks-count').textContent = stats.in_progress || 0;
      document.getElementById('completed-tasks-count').textContent = stats.completed || 0;
      document.getElementById('blocked-tasks-count').textContent = stats.blocked || 0;
    }
  } catch (error) {
    console.error('Load task stats error:', error);
  }
}

/**
 * Load employees for dropdowns
 */
async function loadTaskEmployees() {
  try {
    const response = await fetch(`${API_BASE}/admin/employees?active=true`, {
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      taskEmployees = data.employees;
      populateEmployeeDropdowns();
    }
  } catch (error) {
    console.error('Load employees error:', error);
  }
}

/**
 * Populate employee dropdowns
 */
function populateEmployeeDropdowns() {
  // Filter dropdown
  const filterSelect = document.getElementById('task-employee-filter');
  if (filterSelect) {
    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todos los empleados</option>';
    taskEmployees.forEach(emp => {
      filterSelect.innerHTML += `<option value="${emp.id}">${escapeHtml(emp.name)} (${DEPT_LABELS[emp.department] || emp.department})</option>`;
    });
    filterSelect.value = currentValue;
  }

  // Assignment dropdown in modal
  const assignSelect = document.getElementById('task-assigned-to');
  if (assignSelect) {
    const currentValue = assignSelect.value;
    assignSelect.innerHTML = '<option value="">Sin asignar</option>';
    taskEmployees.forEach(emp => {
      assignSelect.innerHTML += `<option value="${emp.id}">${escapeHtml(emp.name)} (${DEPT_LABELS[emp.department] || emp.department})</option>`;
    });
    assignSelect.value = currentValue;
  }
}

/**
 * Render tasks table
 */
function renderTasksTable() {
  const tbody = document.getElementById('tasks-table-body');
  const emptyState = document.getElementById('tasks-empty-state');
  const tableContainer = tbody?.closest('.table-container');

  if (!tbody) return;

  if (filteredTasks.length === 0) {
    tbody.innerHTML = '';
    if (tableContainer) tableContainer.style.display = 'none';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (tableContainer) tableContainer.style.display = '';
  if (emptyState) emptyState.classList.add('hidden');

  tbody.innerHTML = filteredTasks.map(task => `
    <tr style="border-bottom: 1px solid #e5e7eb; cursor: pointer;" onclick="openTaskDetailModal(${task.id})">
      <td style="padding: 16px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="width: 4px; height: 40px; border-radius: 2px; background: ${PRIORITY_COLORS[task.priority] || '#9ca3af'};"></div>
          <div>
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${escapeHtml(task.title)}</div>
            ${task.order_number ? `<div style="font-size: 12px; color: #6b7280;">Pedido #${task.order_number}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="padding: 16px;">
        <span class="dept-badge dept-${task.department}">${DEPT_LABELS[task.department] || task.department}</span>
      </td>
      <td style="padding: 16px; color: #4b5563;">
        ${task.assigned_to_name ? escapeHtml(task.assigned_to_name) : '<span style="color: #9ca3af;">Sin asignar</span>'}
      </td>
      <td style="padding: 16px; text-align: center;">
        <span class="priority-badge priority-${task.priority}">${PRIORITY_LABELS[task.priority] || task.priority}</span>
      </td>
      <td style="padding: 16px; text-align: center;">
        <span class="status-badge status-${task.status}">${STATUS_LABELS[task.status] || task.status}</span>
      </td>
      <td style="padding: 16px; color: #6b7280; font-size: 13px;">
        ${task.due_date ? formatTaskDate(task.due_date) : '-'}
      </td>
      <td style="padding: 16px; text-align: center;" onclick="event.stopPropagation();">
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button onclick="openEditTaskModal(${task.id})" class="btn-icon" title="Editar">
            ✏️
          </button>
          <button onclick="quickChangeStatus(${task.id})" class="btn-icon" title="Cambiar estado">
            🔄
          </button>
          <button onclick="deleteTask(${task.id})" class="btn-icon" title="Eliminar">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Format task date for display
 */
function formatTaskDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date - now;

  // Check if overdue
  if (diff < 0) {
    return `<span style="color: #dc2626; font-weight: 500;">Vencida</span>`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    return `<span style="color: #f97316; font-weight: 500;">Hoy</span>`;
  }

  // Less than 48 hours
  if (diff < 172800000) {
    return `<span style="color: #f97316;">Manana</span>`;
  }

  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/**
 * Filter tasks based on filter selections
 */
function filterTasksList() {
  loadTasksData();
}

/**
 * Open modal to create new task
 */
function openCreateTaskModal() {
  document.getElementById('task-modal-title').textContent = 'Nueva Tarea';
  document.getElementById('task-form').reset();
  document.getElementById('task-id').value = '';
  document.getElementById('task-priority').value = 'normal';
  populateEmployeeDropdowns();
  document.getElementById('task-modal').classList.remove('hidden');
}

/**
 * Open modal to edit task
 */
async function openEditTaskModal(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) {
    // Fetch task if not in memory
    try {
      const response = await fetch(`${API_BASE}/admin/tasks/${taskId}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (!data.success) {
        showToast('Tarea no encontrada', 'error');
        return;
      }
      fillTaskForm(data.task);
    } catch (error) {
      showToast('Error al cargar tarea', 'error');
      return;
    }
  } else {
    fillTaskForm(task);
  }

  document.getElementById('task-modal-title').textContent = 'Editar Tarea';
  document.getElementById('task-modal').classList.remove('hidden');
}

/**
 * Fill task form with data
 */
function fillTaskForm(task) {
  populateEmployeeDropdowns();
  document.getElementById('task-id').value = task.id;
  document.getElementById('task-title').value = task.title || '';
  document.getElementById('task-description').value = task.description || '';
  document.getElementById('task-department').value = task.department || '';
  document.getElementById('task-priority').value = task.priority || 'normal';
  document.getElementById('task-assigned-to').value = task.assigned_to || '';
  document.getElementById('task-estimated-minutes').value = task.estimated_minutes || '';

  if (task.due_date) {
    const date = new Date(task.due_date);
    document.getElementById('task-due-date').value = date.toISOString().slice(0, 16);
  } else {
    document.getElementById('task-due-date').value = '';
  }
}

/**
 * Close task modal
 */
function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
}

/**
 * Save task (create or update)
 */
async function saveTask(event) {
  event.preventDefault();

  const taskId = document.getElementById('task-id').value;
  const isEdit = !!taskId;

  const taskData = {
    title: document.getElementById('task-title').value.trim(),
    description: document.getElementById('task-description').value.trim() || null,
    department: document.getElementById('task-department').value,
    priority: document.getElementById('task-priority').value,
    assigned_to: document.getElementById('task-assigned-to').value || null,
    due_date: document.getElementById('task-due-date').value || null,
    estimated_minutes: document.getElementById('task-estimated-minutes').value || null
  };

  if (!taskData.title || !taskData.department) {
    showToast('Titulo y departamento son requeridos', 'error');
    return;
  }

  try {
    const url = isEdit
      ? `${API_BASE}/admin/tasks/${taskId}`
      : `${API_BASE}/admin/tasks`;

    const method = isEdit ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(taskData)
    });

    const data = await response.json();

    if (data.success) {
      showToast(isEdit ? 'Tarea actualizada' : 'Tarea creada', 'success');
      closeTaskModal();
      loadTasksData();
    } else {
      showToast(data.error || 'Error al guardar', 'error');
    }
  } catch (error) {
    console.error('Save task error:', error);
    showToast('Error de conexion', 'error');
  }
}

/**
 * Open task detail modal
 */
async function openTaskDetailModal(taskId) {
  let task = allTasks.find(t => t.id === taskId);

  if (!task) {
    try {
      const response = await fetch(`${API_BASE}/admin/tasks/${taskId}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (!data.success) {
        showToast('Tarea no encontrada', 'error');
        return;
      }
      task = data.task;
    } catch (error) {
      showToast('Error al cargar tarea', 'error');
      return;
    }
  }

  document.getElementById('task-detail-title').textContent = task.title;

  const body = document.getElementById('task-detail-body');
  body.innerHTML = `
    <div style="display: grid; gap: 20px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Departamento</label>
          <p style="font-weight: 500; margin: 4px 0;">${DEPT_LABELS[task.department] || task.department}</p>
        </div>
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Estado</label>
          <p style="margin: 4px 0;"><span class="status-badge status-${task.status}">${STATUS_LABELS[task.status] || task.status}</span></p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Prioridad</label>
          <p style="margin: 4px 0;"><span class="priority-badge priority-${task.priority}">${PRIORITY_LABELS[task.priority] || task.priority}</span></p>
        </div>
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Asignado a</label>
          <p style="font-weight: 500; margin: 4px 0;">${task.assigned_to_name || 'Sin asignar'}</p>
        </div>
      </div>

      ${task.description ? `
      <div>
        <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Descripcion</label>
        <p style="margin: 4px 0; color: #4b5563;">${escapeHtml(task.description)}</p>
      </div>
      ` : ''}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Fecha limite</label>
          <p style="margin: 4px 0;">${task.due_date ? new Date(task.due_date).toLocaleString('es-MX') : '-'}</p>
        </div>
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Tiempo estimado</label>
          <p style="margin: 4px 0;">${task.estimated_minutes ? `${task.estimated_minutes} min` : '-'}</p>
        </div>
      </div>

      ${task.order_number ? `
      <div>
        <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Pedido relacionado</label>
        <p style="margin: 4px 0; font-weight: 500;">#${task.order_number} - ${task.client_name || ''}</p>
      </div>
      ` : ''}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Creada</label>
          <p style="margin: 4px 0; font-size: 13px;">${new Date(task.created_at).toLocaleString('es-MX')}</p>
        </div>
        ${task.completed_at ? `
        <div>
          <label style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Completada</label>
          <p style="margin: 4px 0; font-size: 13px;">${new Date(task.completed_at).toLocaleString('es-MX')}</p>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // Update edit button
  document.getElementById('edit-task-btn').onclick = () => {
    closeTaskDetailModal();
    openEditTaskModal(task.id);
  };

  document.getElementById('task-detail-modal').classList.remove('hidden');
}

/**
 * Close task detail modal
 */
function closeTaskDetailModal() {
  document.getElementById('task-detail-modal').classList.add('hidden');
}

/**
 * Quick change task status
 */
async function quickChangeStatus(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  const statuses = ['pending', 'in_progress', 'completed', 'blocked'];
  const currentIndex = statuses.indexOf(task.status);
  const nextStatus = statuses[(currentIndex + 1) % statuses.length];

  try {
    const response = await fetch(`${API_BASE}/admin/tasks/${taskId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ status: nextStatus })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Estado cambiado a: ${STATUS_LABELS[nextStatus]}`, 'success');
      loadTasksData();
    } else {
      showToast(data.error || 'Error al cambiar estado', 'error');
    }
  } catch (error) {
    console.error('Change status error:', error);
    showToast('Error de conexion', 'error');
  }
}

/**
 * Delete task
 */
async function deleteTask(taskId) {
  if (!confirm('¿Estas seguro de eliminar esta tarea?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (data.success) {
      showToast('Tarea eliminada', 'success');
      loadTasksData();
    } else {
      showToast(data.error || 'Error al eliminar', 'error');
    }
  } catch (error) {
    console.error('Delete task error:', error);
    showToast('Error de conexion', 'error');
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
window.loadTasksData = loadTasksData;
window.filterTasksList = filterTasksList;
window.openCreateTaskModal = openCreateTaskModal;
window.openEditTaskModal = openEditTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.openTaskDetailModal = openTaskDetailModal;
window.closeTaskDetailModal = closeTaskDetailModal;
window.quickChangeStatus = quickChangeStatus;
window.deleteTask = deleteTask;

/**
 * Employee Dashboard - Main JavaScript
 * Handles authentication, navigation, and core functionality
 */

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://vt-souvenir-backend.onrender.com/api';

// Global state
const state = {
    employee: null,
    token: null,
    currentView: 'my-tasks',
    employees: [] // For manager task assignment
};

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('employee_token');
    const employeeData = localStorage.getItem('employee_data');

    if (!token || !employeeData) {
        window.location.href = 'login.html';
        return;
    }

    state.token = token;
    state.employee = JSON.parse(employeeData);

    // Verify token is still valid
    verifyAuth();

    // Setup UI based on role
    setupRoleUI();

    // Setup navigation
    setupNavigation();

    // Setup logout
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Load initial data
    loadMyTasks();

    // Auto-refresh every 30 seconds
    setInterval(() => {
        if (state.currentView === 'my-tasks') {
            loadMyTasks();
        } else if (state.currentView === 'department-queue') {
            loadDepartmentQueue();
        }
    }, 30000);
});

async function verifyAuth() {
    try {
        const response = await fetch(`${API_BASE}/employees/verify`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            logout();
            return;
        }

        const data = await response.json();
        state.employee = data.employee;
        localStorage.setItem('employee_data', JSON.stringify(data.employee));
        updateEmployeeInfo();

    } catch (error) {
        console.error('Auth verification failed:', error);
        logout();
    }
}

function setupRoleUI() {
    // Add role class to body
    document.body.classList.add(`role-${state.employee.role}`);

    // Update employee info display
    updateEmployeeInfo();

    // Update department name (if element exists)
    const deptNameEl = document.getElementById('dept-name');
    if (deptNameEl) {
        deptNameEl.textContent = getDepartmentName(state.employee.department);
    }

    // Load employees list if manager (for task assignment)
    if (state.employee.role === 'manager') {
        loadEmployeesList();
    }
}

function updateEmployeeInfo() {
    document.getElementById('employee-name').textContent = state.employee.name;
    document.getElementById('employee-role').textContent = getRoleName(state.employee.role);

    // Update profile view
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) {
        profileAvatar.innerHTML = `<span>${state.employee.name.charAt(0).toUpperCase()}</span>`;
    }
    document.getElementById('profile-name').textContent = state.employee.name;
    document.getElementById('profile-email').textContent = state.employee.email;
    document.getElementById('profile-role').textContent = getRoleName(state.employee.role);
    document.getElementById('profile-dept').textContent = getDepartmentName(state.employee.department);
    document.getElementById('profile-name-input').value = state.employee.name;
}

function setupNavigation() {
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    state.currentView = viewName;

    // Update nav buttons
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`${viewName}-view`);
    if (view) view.classList.add('active');

    // Load data for the view
    switch (viewName) {
        case 'my-tasks':
            loadMyTasks();
            break;
        case 'department-queue':
            loadDepartmentQueue();
            break;
        case 'gallery':
            if (typeof loadGallery === 'function') loadGallery();
            break;
        case 'notes':
            if (typeof loadWorkspaces === 'function') loadWorkspaces();
            break;
        case 'knowledge':
            if (typeof loadKnowledge === 'function') loadKnowledge();
            break;
        case 'employees':
            loadEmployeesView();
            break;
        case 'all-tasks':
            loadAllTasks();
            break;
        case 'profile':
            loadProfile();
            break;
    }
}

// ========================================
// API HELPERS
// ========================================

function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
    };
}

async function apiGet(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: getAuthHeaders()
    });
    return response.json();
}

async function apiPost(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiPut(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiDelete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    return response.json();
}

// ========================================
// TASK LOADING
// ========================================

async function loadMyTasks() {
    const loading = document.getElementById('my-tasks-loading');
    const empty = document.getElementById('my-tasks-empty');
    const list = document.getElementById('my-tasks-list');

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    list.innerHTML = '';

    try {
        const data = await apiGet('/tasks/my-tasks');

        loading.classList.add('hidden');

        if (!data.success || data.tasks.length === 0) {
            empty.classList.remove('hidden');
            document.getElementById('my-task-count').textContent = '0';
            return;
        }

        document.getElementById('my-task-count').textContent = data.tasks.filter(t => t.status !== 'completed').length;
        renderTaskList(list, data.tasks);

    } catch (error) {
        console.error('Error loading tasks:', error);
        loading.classList.add('hidden');
        showToast('Error al cargar tareas', 'error');
    }
}

async function loadDepartmentQueue() {
    const loading = document.getElementById('dept-tasks-loading');
    const empty = document.getElementById('dept-tasks-empty');
    const list = document.getElementById('dept-tasks-list');

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    list.innerHTML = '';

    try {
        const data = await apiGet(`/tasks/queue/${state.employee.department}`);

        loading.classList.add('hidden');

        if (!data.success || data.tasks.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        renderTaskList(list, data.tasks, true);

    } catch (error) {
        console.error('Error loading department queue:', error);
        loading.classList.add('hidden');
        showToast('Error al cargar cola', 'error');
    }
}

async function loadAllTasks() {
    const loading = document.getElementById('all-tasks-loading');
    const list = document.getElementById('all-tasks-list');

    loading.classList.remove('hidden');
    list.innerHTML = '';

    try {
        const data = await apiGet('/tasks');

        loading.classList.add('hidden');
        renderTaskList(list, data.tasks || []);

    } catch (error) {
        console.error('Error loading all tasks:', error);
        loading.classList.add('hidden');
    }
}

function renderTaskList(container, tasks, showAssigned = false) {
    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.onclick = () => openTaskModal(task);

        card.innerHTML = `
            <div class="task-priority ${task.priority}"></div>
            <div class="task-info">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    ${task.order_number ? `<span>Pedido #${task.order_number}</span>` : ''}
                    ${task.due_date ? `<span>Vence: ${formatDate(task.due_date)}</span>` : ''}
                    ${showAssigned && task.assigned_to_name ? `<span>Asignado: ${task.assigned_to_name}</span>` : ''}
                </div>
            </div>
            <span class="task-status ${task.status}">${getStatusName(task.status)}</span>
            <div class="task-actions">
                ${task.status === 'pending' ? `
                    <button class="task-action-btn start" onclick="event.stopPropagation(); startTask(${task.id})">Iniciar</button>
                ` : ''}
                ${task.status === 'in_progress' ? `
                    <button class="task-action-btn complete" onclick="event.stopPropagation(); completeTask(${task.id})">Completar</button>
                ` : ''}
            </div>
        `;

        container.appendChild(card);
    });
}

// ========================================
// TASK ACTIONS
// ========================================

async function startTask(taskId) {
    try {
        const data = await apiPost(`/tasks/${taskId}/start`, {});

        if (data.success) {
            showToast('Tarea iniciada');
            loadMyTasks();
        } else {
            showToast(data.error || 'Error al iniciar tarea', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

async function completeTask(taskId) {
    try {
        const data = await apiPost(`/tasks/${taskId}/complete`, {});

        if (data.success) {
            showToast('Tarea completada', 'success');
            loadMyTasks();
        } else {
            showToast(data.error || 'Error al completar tarea', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

async function completeTaskDirectly(taskId) {
    try {
        // First start the task
        const startData = await apiPost(`/tasks/${taskId}/start`, {});
        if (!startData.success) {
            showToast(startData.error || 'Error al iniciar tarea', 'error');
            return;
        }

        // Then complete it
        const completeData = await apiPost(`/tasks/${taskId}/complete`, {});
        if (completeData.success) {
            showToast('Tarea completada', 'success');
            loadMyTasks();
        } else {
            showToast(completeData.error || 'Error al completar tarea', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

function openTaskModal(task) {
    const modal = document.getElementById('task-modal');
    const title = document.getElementById('task-modal-title');
    const body = document.getElementById('task-modal-body');
    const footer = document.getElementById('task-modal-footer');

    title.textContent = task.title;

    body.innerHTML = `
        <div class="task-detail">
            <p><strong>Estado:</strong> <span class="task-status ${task.status}">${getStatusName(task.status)}</span></p>
            <p><strong>Prioridad:</strong> ${getPriorityName(task.priority)}</p>
            <p><strong>Departamento:</strong> ${getDepartmentName(task.department)}</p>
            ${task.order_number ? `<p><strong>Pedido:</strong> #${task.order_number}</p>` : ''}
            ${task.client_name ? `<p><strong>Cliente:</strong> ${task.client_name}</p>` : ''}
            ${task.due_date ? `<p><strong>Fecha límite:</strong> ${formatDate(task.due_date)}</p>` : ''}
            ${task.description ? `<p><strong>Descripción:</strong><br>${escapeHtml(task.description)}</p>` : ''}
            ${task.notes ? `<p><strong>Notas:</strong><br>${escapeHtml(task.notes)}</p>` : ''}
        </div>
    `;

    footer.innerHTML = '';

    if (task.status === 'pending') {
        // Start button
        const startBtn = document.createElement('button');
        startBtn.className = 'btn btn-primary';
        startBtn.textContent = 'Iniciar Tarea';
        startBtn.onclick = async () => {
            await startTask(task.id);
            closeModal('task-modal');
        };
        footer.appendChild(startBtn);

        // Complete button (skip start step)
        const completeBtn = document.createElement('button');
        completeBtn.className = 'btn btn-success';
        completeBtn.textContent = 'Marcar Completada';
        completeBtn.onclick = async () => {
            await completeTaskDirectly(task.id);
            closeModal('task-modal');
        };
        footer.appendChild(completeBtn);
    } else if (task.status === 'in_progress') {
        const completeBtn = document.createElement('button');
        completeBtn.className = 'btn btn-success';
        completeBtn.textContent = 'Completar Tarea';
        completeBtn.onclick = async () => {
            await completeTask(task.id);
            closeModal('task-modal');
        };
        footer.appendChild(completeBtn);
    }

    modal.classList.remove('hidden');
}

// ========================================
// EMPLOYEES (Manager Only)
// ========================================

async function loadEmployeesList() {
    try {
        const data = await apiGet('/employees?active=true');
        if (data.success) {
            state.employees = data.employees;
            populateEmployeeSelect();
        }
    } catch (error) {
        console.error('Error loading employees:', error);
    }
}

function populateEmployeeSelect() {
    const select = document.getElementById('task-assign-to');
    if (!select) return;

    select.innerHTML = '<option value="">Sin asignar</option>';
    state.employees.forEach(emp => {
        select.innerHTML += `<option value="${emp.id}">${emp.name} (${getDepartmentName(emp.department)})</option>`;
    });
}

async function loadEmployeesView() {
    const loading = document.getElementById('employees-loading');
    const list = document.getElementById('employees-list');

    loading.classList.remove('hidden');
    list.innerHTML = '';

    try {
        const data = await apiGet('/employees');

        loading.classList.add('hidden');

        if (!data.success || data.employees.length === 0) {
            list.innerHTML = '<p>No hay empleados registrados</p>';
            return;
        }

        data.employees.forEach(emp => {
            const card = document.createElement('div');
            card.className = 'employee-card';
            card.innerHTML = `
                <div class="employee-avatar">${emp.name.charAt(0).toUpperCase()}</div>
                <div class="employee-details">
                    <h4>${escapeHtml(emp.name)}</h4>
                    <p class="employee-email">${emp.email}</p>
                    <span class="role-badge">${getRoleName(emp.role)}</span>
                    <span class="dept-badge">${getDepartmentName(emp.department)}</span>
                </div>
            `;
            list.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading employees:', error);
        loading.classList.add('hidden');
    }
}

// ========================================
// PROFILE
// ========================================

async function loadProfile() {
    try {
        const data = await apiGet('/employees/me');
        if (data.success) {
            state.employee = data.employee;
            updateEmployeeInfo();
            document.getElementById('profile-phone-input').value = data.employee.phone || '';
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Setup profile form
document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('profile-name-input').value;
    const phone = document.getElementById('profile-phone-input').value;

    try {
        const data = await apiPut('/employees/me', { name, phone });

        if (data.success) {
            state.employee = data.employee;
            localStorage.setItem('employee_data', JSON.stringify(data.employee));
            updateEmployeeInfo();
            showToast('Perfil actualizado', 'success');
        } else {
            showToast(data.error || 'Error al actualizar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
});

// Setup password form
document.getElementById('password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }

    try {
        const data = await apiPut('/employees/me/password', { currentPassword, newPassword });

        if (data.success) {
            showToast('Contraseña actualizada', 'success');
            document.getElementById('password-form').reset();
        } else {
            showToast(data.error || 'Error al cambiar contraseña', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
});

// ========================================
// NEW TASK MODAL
// ========================================

document.getElementById('new-task-btn')?.addEventListener('click', () => {
    document.getElementById('new-task-form').reset();
    document.getElementById('new-task-modal').classList.remove('hidden');
});

document.getElementById('create-task-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-description').value;
    const priority = document.getElementById('task-priority').value;
    const dueDate = document.getElementById('task-due-date').value;
    const assignTo = document.getElementById('task-assign-to')?.value;

    if (!title) {
        showToast('El título es requerido', 'error');
        return;
    }

    try {
        const data = await apiPost('/tasks', {
            title,
            description,
            department: state.employee.department,
            priority,
            due_date: dueDate || null,
            assigned_to: assignTo || null
        });

        if (data.success) {
            showToast('Tarea creada', 'success');
            closeModal('new-task-modal');
            loadMyTasks();
        } else {
            showToast(data.error || 'Error al crear tarea', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
});

// ========================================
// NEW EMPLOYEE MODAL (Manager only)
// ========================================

document.getElementById('new-employee-btn')?.addEventListener('click', () => {
    document.getElementById('new-employee-form').reset();
    document.getElementById('new-employee-modal').classList.remove('hidden');
});

document.getElementById('create-employee-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('emp-name').value;
    const email = document.getElementById('emp-email').value;
    const password = document.getElementById('emp-password').value;
    const role = document.getElementById('emp-role').value;
    const department = document.getElementById('emp-department').value;
    const phone = document.getElementById('emp-phone').value;

    if (!name || !email || !password || !role || !department) {
        showToast('Completa todos los campos requeridos', 'error');
        return;
    }

    try {
        const data = await apiPost('/employees', {
            name, email, password, role, department, phone
        });

        if (data.success) {
            showToast('Empleado creado', 'success');
            closeModal('new-employee-modal');
            loadEmployeesView();
            loadEmployeesList();
        } else {
            showToast(data.error || 'Error al crear empleado', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
});

// ========================================
// HELPERS
// ========================================

function logout() {
    if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
        localStorage.removeItem('employee_token');
        localStorage.removeItem('employee_data');
        window.location.href = 'login.html';
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function getRoleName(role) {
    const names = {
        'design': 'Diseño',
        'production': 'Producción',
        'shipping': 'Envíos',
        'manager': 'Gerente'
    };
    return names[role] || role;
}

function getDepartmentName(dept) {
    const names = {
        'design': 'Diseño',
        'production': 'Producción',
        'shipping': 'Envíos'
    };
    return names[dept] || dept;
}

function getStatusName(status) {
    const names = {
        'pending': 'Pendiente',
        'in_progress': 'En Progreso',
        'completed': 'Completada',
        'cancelled': 'Cancelada',
        'blocked': 'Bloqueada'
    };
    return names[status] || status;
}

function getPriorityName(priority) {
    const names = {
        'low': 'Baja',
        'normal': 'Normal',
        'high': 'Alta',
        'urgent': 'Urgente'
    };
    return names[priority] || priority;
}

// Close modal on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
        backdrop.closest('.modal').classList.add('hidden');
    });
});

// Make functions globally available
window.startTask = startTask;
window.completeTask = completeTask;
window.completeTaskDirectly = completeTaskDirectly;
window.closeModal = closeModal;
window.showToast = showToast;
window.state = state;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.getAuthHeaders = getAuthHeaders;
window.escapeHtml = escapeHtml;
window.formatDate = formatDate;

/**
 * Tasks Module - Additional task functionality
 */

// Task filter handling
document.querySelectorAll('.task-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const status = btn.dataset.status;

        // Update active state
        btn.closest('.task-filters').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Filter tasks
        filterTasks(status);
    });
});

function filterTasks(status) {
    const cards = document.querySelectorAll('#my-tasks-list .task-card');

    cards.forEach(card => {
        if (status === 'all') {
            card.style.display = '';
        } else {
            const cardStatus = card.querySelector('.task-status').classList[1];
            card.style.display = cardStatus === status ? '' : 'none';
        }
    });
}

// All tasks filters (manager)
document.getElementById('all-tasks-dept-filter')?.addEventListener('change', loadFilteredAllTasks);
document.getElementById('all-tasks-status-filter')?.addEventListener('change', loadFilteredAllTasks);

async function loadFilteredAllTasks() {
    const dept = document.getElementById('all-tasks-dept-filter').value;
    const status = document.getElementById('all-tasks-status-filter').value;

    const list = document.getElementById('all-tasks-list');
    list.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
        let url = '/tasks?';
        if (dept) url += `department=${dept}&`;
        if (status) url += `status=${status}&`;

        const data = await apiGet(url);

        list.innerHTML = '';

        if (!data.success || !data.tasks.length) {
            list.innerHTML = '<p class="empty-state">No hay tareas con estos filtros</p>';
            return;
        }

        data.tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'task-card';
            card.onclick = () => openTaskModal(task);

            card.innerHTML = `
                <div class="task-priority ${task.priority}"></div>
                <div class="task-info">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        <span>${getDepartmentName(task.department)}</span>
                        ${task.order_number ? `<span>Pedido #${task.order_number}</span>` : ''}
                        ${task.assigned_to_name ? `<span>${task.assigned_to_name}</span>` : '<span>Sin asignar</span>'}
                    </div>
                </div>
                <span class="task-status ${task.status}">${getStatusName(task.status)}</span>
            `;

            list.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading filtered tasks:', error);
        list.innerHTML = '<p class="empty-state">Error al cargar tareas</p>';
    }
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

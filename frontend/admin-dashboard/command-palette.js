/**
 * Command Palette (⌘K) - Quick actions and search
 * Professional command palette for power users
 */

// =====================================================
// COMMAND PALETTE STATE
// =====================================================

let commandPaletteOpen = false;
let selectedCommandIndex = 0;

// =====================================================
// KEYBOARD SHORTCUT (⌘K / Ctrl+K)
// =====================================================

document.addEventListener('keydown', (e) => {
    // Open command palette with ⌘K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
    }

    // Close with Escape
    if (e.key === 'Escape' && commandPaletteOpen) {
        closeCommandPalette();
    }
});

// =====================================================
// OPEN / CLOSE
// =====================================================

function openCommandPalette() {
    const palette = document.getElementById('command-palette');
    const input = document.getElementById('command-palette-input');

    if (palette) {
        palette.classList.remove('hidden');
        commandPaletteOpen = true;
        document.body.style.overflow = 'hidden';

        // Focus input
        setTimeout(() => {
            if (input) {
                input.value = '';
                input.focus();
            }
            // Reset to default commands
            resetCommandResults();
            // Refresh icons for the palette
            if (window.refreshIcons) window.refreshIcons();
        }, 50);
    }
}

function closeCommandPalette() {
    const palette = document.getElementById('command-palette');

    if (palette) {
        palette.classList.add('hidden');
        commandPaletteOpen = false;
        document.body.style.overflow = '';
        selectedCommandIndex = 0;
    }
}

// =====================================================
// COMMAND SEARCH & FILTERING
// =====================================================

const commands = [
    // Quick Actions
    { id: 'new-quote', section: 'actions', icon: 'file-text', text: 'Nueva cotización', hint: '/quote', keywords: ['cotizacion', 'quote', 'precio'] },
    { id: 'pending-orders', section: 'actions', icon: 'clock', text: 'Ver pedidos pendientes', hint: '/pending', keywords: ['pendiente', 'pending', 'orden'] },
    { id: 'analytics', section: 'actions', icon: 'bar-chart-3', text: 'Abrir Dashboard', hint: '/dashboard', keywords: ['analytics', 'estadisticas', 'graficos'] },
    { id: 'create-label', section: 'actions', icon: 'tag', text: 'Crear guía de envío', hint: '/ship', keywords: ['guia', 'envio', 'shipping', 'etiqueta'] },
    { id: 'refresh-orders', section: 'actions', icon: 'refresh-cw', text: 'Actualizar pedidos', hint: '/refresh', keywords: ['actualizar', 'reload'] },

    // Navigation
    { id: 'nav-orders', section: 'navigation', icon: 'clipboard-list', text: 'Ir a Pedidos', keywords: ['pedidos', 'orders'] },
    { id: 'nav-calendar', section: 'navigation', icon: 'calendar', text: 'Ir a Calendario', keywords: ['calendario', 'calendar', 'fecha'] },
    { id: 'nav-inventory', section: 'navigation', icon: 'package', text: 'Ir a Inventario', keywords: ['inventario', 'productos', 'stock'] },
    { id: 'nav-finances', section: 'navigation', icon: 'wallet', text: 'Ir a Finanzas', keywords: ['finanzas', 'precios', 'dinero'] },
    { id: 'nav-shipping', section: 'navigation', icon: 'truck', text: 'Ir a Logística', keywords: ['logistica', 'envios', 'shipping'] },
    { id: 'nav-marketplace', section: 'navigation', icon: 'globe', text: 'Ir a Marketplace', keywords: ['marketplace', 'mercadolibre'] },
    { id: 'nav-settings', section: 'navigation', icon: 'settings', text: 'Ir a Configuración', keywords: ['config', 'empleados', 'settings'] },

    // AI
    { id: 'ask-ai', section: 'ai', icon: 'message-circle', text: 'Preguntar al asistente AI', keywords: ['ai', 'asistente', 'pregunta', 'help'] },
];

function handleCommandSearch(query) {
    const resultsContainer = document.getElementById('command-palette-results');
    if (!resultsContainer) return;

    const q = query.toLowerCase().trim();

    // If empty, show default commands
    if (!q) {
        resetCommandResults();
        return;
    }

    // Check if it's a slash command
    if (q.startsWith('/')) {
        const slashCommand = q.substring(1);
        handleSlashCommand(slashCommand, resultsContainer);
        return;
    }

    // Filter commands
    const filtered = commands.filter(cmd => {
        const searchText = `${cmd.text} ${cmd.hint || ''} ${cmd.keywords.join(' ')}`.toLowerCase();
        return searchText.includes(q);
    });

    // Check if it looks like an order number
    const isOrderSearch = /^(vt-?)?\d+$/i.test(q);

    // Render results
    let html = '';

    if (isOrderSearch) {
        html += `
            <div class="command-section">
                <div class="command-section-title">Buscar Pedido</div>
                <div class="command-item command-search" data-action="search-order" data-query="${q}" onclick="executeCommand('search-order', '${q}')">
                    <i data-lucide="search" class="command-icon"></i>
                    <span class="command-text">Buscar pedido "${q.toUpperCase()}"</span>
                </div>
            </div>
        `;
    }

    if (filtered.length > 0) {
        const actionCmds = filtered.filter(c => c.section === 'actions');
        const navCmds = filtered.filter(c => c.section === 'navigation');
        const aiCmds = filtered.filter(c => c.section === 'ai');

        if (actionCmds.length > 0) {
            html += `<div class="command-section"><div class="command-section-title">Acciones</div>`;
            actionCmds.forEach(cmd => {
                html += renderCommandItem(cmd);
            });
            html += `</div>`;
        }

        if (navCmds.length > 0) {
            html += `<div class="command-section"><div class="command-section-title">Navegación</div>`;
            navCmds.forEach(cmd => {
                html += renderCommandItem(cmd);
            });
            html += `</div>`;
        }

        if (aiCmds.length > 0) {
            html += `<div class="command-section command-ai-section"><div class="command-section-title"><i data-lucide="sparkles" class="ai-sparkle"></i> AI</div>`;
            aiCmds.forEach(cmd => {
                html += renderCommandItem(cmd);
            });
            html += `</div>`;
        }
    }

    // Always show AI option for non-command queries
    if (!isOrderSearch && q.length > 2) {
        html += `
            <div class="command-section command-ai-section">
                <div class="command-section-title"><i data-lucide="sparkles" class="ai-sparkle"></i> Preguntar a AI</div>
                <div class="command-item command-ai" data-action="ask-ai-query" data-query="${q}" onclick="executeCommand('ask-ai-query', '${q}')">
                    <i data-lucide="message-circle" class="command-icon"></i>
                    <span class="command-text">Preguntar: "${q}"</span>
                </div>
            </div>
        `;
    }

    if (!html) {
        html = `
            <div class="command-empty">
                <i data-lucide="search-x" class="command-empty-icon"></i>
                <p>No se encontraron comandos</p>
            </div>
        `;
    }

    resultsContainer.innerHTML = html;
    selectedCommandIndex = 0;
    updateSelectedCommand();
    if (window.refreshIcons) window.refreshIcons();
}

function handleSlashCommand(cmd, container) {
    const slashCommands = {
        'quote': { action: 'new-quote', text: 'Crear nueva cotización' },
        'cotiza': { action: 'new-quote', text: 'Crear nueva cotización' },
        'pending': { action: 'pending-orders', text: 'Ver pedidos pendientes' },
        'pendientes': { action: 'pending-orders', text: 'Ver pedidos pendientes' },
        'dashboard': { action: 'analytics', text: 'Abrir Dashboard' },
        'analytics': { action: 'analytics', text: 'Abrir Dashboard' },
        'ship': { action: 'create-label', text: 'Crear guía de envío' },
        'envio': { action: 'create-label', text: 'Crear guía de envío' },
        'refresh': { action: 'refresh-orders', text: 'Actualizar pedidos' },
        'orders': { action: 'nav-orders', text: 'Ir a Pedidos' },
        'pedidos': { action: 'nav-orders', text: 'Ir a Pedidos' },
        'inventory': { action: 'nav-inventory', text: 'Ir a Inventario' },
        'inventario': { action: 'nav-inventory', text: 'Ir a Inventario' },
    };

    const matched = Object.entries(slashCommands).filter(([key]) => key.startsWith(cmd));

    if (matched.length > 0) {
        let html = `<div class="command-section"><div class="command-section-title">Comandos</div>`;
        matched.forEach(([key, val]) => {
            html += `
                <div class="command-item" data-action="${val.action}" onclick="executeCommand('${val.action}')">
                    <i data-lucide="terminal" class="command-icon"></i>
                    <span class="command-text">${val.text}</span>
                    <span class="command-hint">/${key}</span>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;
    } else {
        container.innerHTML = `
            <div class="command-empty">
                <i data-lucide="terminal" class="command-empty-icon"></i>
                <p>Comando "/${cmd}" no reconocido</p>
            </div>
        `;
    }

    if (window.refreshIcons) window.refreshIcons();
}

function renderCommandItem(cmd) {
    return `
        <div class="command-item ${cmd.section === 'ai' ? 'command-ai' : ''}" data-action="${cmd.id}" onclick="executeCommand('${cmd.id}')">
            <i data-lucide="${cmd.icon}" class="command-icon"></i>
            <span class="command-text">${cmd.text}</span>
            ${cmd.hint ? `<span class="command-hint">${cmd.hint}</span>` : ''}
        </div>
    `;
}

function resetCommandResults() {
    const container = document.getElementById('command-palette-results');
    if (!container) return;

    container.innerHTML = `
        <div class="command-section">
            <div class="command-section-title">Acciones Rápidas</div>
            <div class="command-item" data-action="new-quote" onclick="executeCommand('new-quote')">
                <i data-lucide="file-text" class="command-icon"></i>
                <span class="command-text">Nueva cotización</span>
                <span class="command-hint">/quote</span>
            </div>
            <div class="command-item" data-action="pending-orders" onclick="executeCommand('pending-orders')">
                <i data-lucide="clock" class="command-icon"></i>
                <span class="command-text">Ver pedidos pendientes</span>
                <span class="command-hint">/pending</span>
            </div>
            <div class="command-item" data-action="analytics" onclick="executeCommand('analytics')">
                <i data-lucide="bar-chart-3" class="command-icon"></i>
                <span class="command-text">Abrir Dashboard</span>
                <span class="command-hint">/dashboard</span>
            </div>
            <div class="command-item" data-action="create-label" onclick="executeCommand('create-label')">
                <i data-lucide="tag" class="command-icon"></i>
                <span class="command-text">Crear guía de envío</span>
                <span class="command-hint">/ship</span>
            </div>
        </div>
        <div class="command-section">
            <div class="command-section-title">Navegación</div>
            <div class="command-item" data-action="nav-orders" onclick="executeCommand('nav-orders')">
                <i data-lucide="clipboard-list" class="command-icon"></i>
                <span class="command-text">Ir a Pedidos</span>
            </div>
            <div class="command-item" data-action="nav-inventory" onclick="executeCommand('nav-inventory')">
                <i data-lucide="package" class="command-icon"></i>
                <span class="command-text">Ir a Inventario</span>
            </div>
            <div class="command-item" data-action="nav-shipping" onclick="executeCommand('nav-shipping')">
                <i data-lucide="truck" class="command-icon"></i>
                <span class="command-text">Ir a Logística</span>
            </div>
        </div>
        <div class="command-section command-ai-section">
            <div class="command-section-title">
                <i data-lucide="sparkles" class="ai-sparkle"></i> Preguntar a AI
            </div>
            <div class="command-item command-ai" data-action="ask-ai" onclick="executeCommand('ask-ai')">
                <i data-lucide="message-circle" class="command-icon"></i>
                <span class="command-text">Hacer pregunta al asistente...</span>
            </div>
        </div>
    `;

    if (window.refreshIcons) window.refreshIcons();
}

// =====================================================
// KEYBOARD NAVIGATION IN PALETTE
// =====================================================

function handleCommandPaletteKey(e) {
    const items = document.querySelectorAll('#command-palette-results .command-item');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedCommandIndex = Math.min(selectedCommandIndex + 1, items.length - 1);
        updateSelectedCommand();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedCommandIndex = Math.max(selectedCommandIndex - 1, 0);
        updateSelectedCommand();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = items[selectedCommandIndex];
        if (selected) {
            const action = selected.dataset.action;
            const query = selected.dataset.query;
            executeCommand(action, query);
        }
    }
}

function updateSelectedCommand() {
    const items = document.querySelectorAll('#command-palette-results .command-item');
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === selectedCommandIndex);
    });

    // Scroll into view
    const selected = items[selectedCommandIndex];
    if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
    }
}

// =====================================================
// EXECUTE COMMANDS
// =====================================================

function executeCommand(action, data) {
    closeCommandPalette();

    switch (action) {
        // Quick Actions
        case 'new-quote':
            if (typeof openAiChatModal === 'function') {
                openAiChatModal();
                setTimeout(() => {
                    const input = document.getElementById('ai-chat-input');
                    if (input) {
                        input.value = 'Cotiza ';
                        input.focus();
                    }
                }, 100);
            }
            break;

        case 'pending-orders':
            switchView('orders');
            setTimeout(() => {
                const pendingBtn = document.querySelector('[data-filter="pending_review"]');
                if (pendingBtn) pendingBtn.click();
            }, 100);
            break;

        case 'analytics':
            switchView('analytics');
            break;

        case 'create-label':
            if (typeof openAiChatModal === 'function') {
                openAiChatModal();
                setTimeout(() => {
                    const input = document.getElementById('ai-chat-input');
                    if (input) {
                        input.value = 'Crea guías de envío para ';
                        input.focus();
                    }
                }, 100);
            }
            break;

        case 'refresh-orders':
            if (typeof loadOrders === 'function') {
                loadOrders();
            }
            break;

        // Navigation
        case 'nav-orders':
            switchView('orders');
            break;
        case 'nav-calendar':
            switchView('calendar');
            break;
        case 'nav-inventory':
            switchView('products');
            break;
        case 'nav-finances':
            switchView('prices');
            break;
        case 'nav-shipping':
            switchView('shipping');
            break;
        case 'nav-marketplace':
            switchView('marketplace');
            break;
        case 'nav-settings':
            switchView('employee-portal');
            break;

        // AI
        case 'ask-ai':
            if (typeof openAiChatModal === 'function') {
                openAiChatModal();
            }
            break;

        case 'ask-ai-query':
            if (typeof openAiChatModal === 'function') {
                openAiChatModal();
                setTimeout(() => {
                    const input = document.getElementById('ai-chat-input');
                    if (input && data) {
                        input.value = data;
                        if (typeof sendAiMessage === 'function') {
                            sendAiMessage();
                        }
                    }
                }, 100);
            }
            break;

        // Search
        case 'search-order':
            switchView('orders');
            setTimeout(() => {
                const searchInput = document.getElementById('search-input');
                if (searchInput && data) {
                    searchInput.value = data;
                    if (typeof handleSearch === 'function') {
                        handleSearch(data);
                    }
                }
            }, 100);
            break;

        default:
            console.log('Unknown command:', action);
    }
}

// =====================================================
// MOBILE MENU TOGGLE
// =====================================================

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
        document.body.classList.toggle('mobile-menu-open');
    }
}

// Close mobile menu when clicking a nav item
document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') || e.target.closest('.nav-sub-item')) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            document.body.classList.remove('mobile-menu-open');
        }
    }
});

// =====================================================
// PROACTIVE AI ALERTS
// =====================================================

async function loadAIAlerts() {
    const widget = document.getElementById('ai-alerts-widget');
    if (!widget) return;

    try {
        // Get order statistics for smart alerts
        const response = await fetch(`${API_BASE}/orders`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) return;

        const data = await response.json();
        const orders = data.orders || [];

        // Calculate alerts
        const alerts = [];

        // Pending orders alert
        const pendingOrders = orders.filter(o =>
            o.approval_status === 'pending_review' || o.status === 'pending'
        );
        if (pendingOrders.length > 0) {
            alerts.push({
                type: 'warning',
                icon: 'clock',
                title: `${pendingOrders.length} pedido${pendingOrders.length > 1 ? 's' : ''} pendiente${pendingOrders.length > 1 ? 's' : ''}`,
                action: () => {
                    const btn = document.querySelector('[data-filter="pending_review"]');
                    if (btn) btn.click();
                }
            });
        }

        // Orders needing final payment
        const needsFinalPayment = orders.filter(o =>
            o.deposit_amount > 0 && !o.second_payment_amount && o.status !== 'cancelled'
        );
        if (needsFinalPayment.length > 0) {
            alerts.push({
                type: 'info',
                icon: 'credit-card',
                title: `${needsFinalPayment.length} pedido${needsFinalPayment.length > 1 ? 's' : ''} pendiente${needsFinalPayment.length > 1 ? 's' : ''} de pago final`,
                action: null
            });
        }

        // Production deadlines today
        const today = new Date().toISOString().split('T')[0];
        const dueToday = orders.filter(o =>
            o.production_deadline && o.production_deadline.split('T')[0] === today
        );
        if (dueToday.length > 0) {
            alerts.push({
                type: 'danger',
                icon: 'alert-triangle',
                title: `${dueToday.length} pedido${dueToday.length > 1 ? 's' : ''} con entrega HOY`,
                action: () => switchView('calendar')
            });
        }

        // Render alerts
        if (alerts.length > 0) {
            widget.innerHTML = `
                <div class="ai-alerts-container">
                    ${alerts.map(alert => `
                        <div class="ai-alert ai-alert-${alert.type}" ${alert.action ? 'onclick="' + alert.action.toString().replace(/"/g, "'") + '"' : ''} style="${alert.action ? 'cursor: pointer;' : ''}">
                            <i data-lucide="${alert.icon}" class="alert-icon"></i>
                            <span class="alert-text">${alert.title}</span>
                            ${alert.action ? '<i data-lucide="chevron-right" class="alert-arrow"></i>' : ''}
                        </div>
                    `).join('')}
                </div>
            `;
            widget.classList.add('has-alerts');
        } else {
            widget.innerHTML = '';
            widget.classList.remove('has-alerts');
        }

        if (window.refreshIcons) window.refreshIcons();

    } catch (error) {
        console.error('Error loading AI alerts:', error);
    }
}

// Load alerts on init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadAIAlerts, 1000);
});

// =====================================================
// BULK ORDER ACTIONS
// =====================================================

function updateBulkActionsBar() {
    const bar = document.getElementById('bulk-actions-bar');
    const countEl = document.getElementById('selected-count');

    if (!bar || !countEl || !window.state) return;

    const selectedCount = window.state.selectedOrders?.size || 0;

    if (selectedCount > 0) {
        bar.classList.remove('hidden');
        countEl.textContent = selectedCount;
    } else {
        bar.classList.add('hidden');
    }
}

async function bulkApproveOrders() {
    if (!window.state?.selectedOrders?.size) return;

    const orderIds = Array.from(window.state.selectedOrders);

    if (!confirm(`¿Aprobar ${orderIds.length} pedido(s)?`)) return;

    for (const id of orderIds) {
        try {
            await fetch(`${API_BASE}/orders/${id}/approve`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
        } catch (e) {
            console.error('Error approving order:', id, e);
        }
    }

    clearSelection();
    if (typeof loadOrders === 'function') loadOrders();
}

async function bulkMarkInProgress() {
    if (!window.state?.selectedOrders?.size) return;

    const orderIds = Array.from(window.state.selectedOrders);

    if (!confirm(`¿Marcar ${orderIds.length} pedido(s) como "En Proceso"?`)) return;

    for (const id of orderIds) {
        try {
            await fetch(`${API_BASE}/orders/${id}/status`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ status: 'in_progress' })
            });
        } catch (e) {
            console.error('Error updating order:', id, e);
        }
    }

    clearSelection();
    if (typeof loadOrders === 'function') loadOrders();
}

async function bulkMarkCompleted() {
    if (!window.state?.selectedOrders?.size) return;

    const orderIds = Array.from(window.state.selectedOrders);

    if (!confirm(`¿Marcar ${orderIds.length} pedido(s) como "Completado"?`)) return;

    for (const id of orderIds) {
        try {
            await fetch(`${API_BASE}/orders/${id}/status`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ status: 'completed' })
            });
        } catch (e) {
            console.error('Error updating order:', id, e);
        }
    }

    clearSelection();
    if (typeof loadOrders === 'function') loadOrders();
}

function clearSelection() {
    if (window.state?.selectedOrders) {
        window.state.selectedOrders.clear();
    }

    // Uncheck all checkboxes
    document.querySelectorAll('.order-select-checkbox').forEach(cb => {
        cb.checked = false;
    });

    updateBulkActionsBar();
}

// Export for global access
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.executeCommand = executeCommand;
window.handleCommandPaletteKey = handleCommandPaletteKey;
window.handleCommandSearch = handleCommandSearch;
window.toggleMobileMenu = toggleMobileMenu;
window.updateBulkActionsBar = updateBulkActionsBar;
window.bulkApproveOrders = bulkApproveOrders;
window.bulkMarkInProgress = bulkMarkInProgress;
window.bulkMarkCompleted = bulkMarkCompleted;
window.clearSelection = clearSelection;
window.loadAIAlerts = loadAIAlerts;

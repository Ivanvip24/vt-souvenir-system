/**
 * AXKAN Design Portal — Designer Chat Interface
 * WhatsApp-style communication with clients about assigned designs
 *
 * NOTE: All user-provided content (names, messages, etc.) is escaped
 * via escapeHtml() before being inserted into the DOM.
 */

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://vt-souvenir-backend.onrender.com/api';

// ============================================
// STATE
// ============================================

var state = {
    employee: null,
    token: null,
    designs: [],       // raw designs from API
    orders: {},        // grouped by order_id: { order info, designs[] }
    currentOrderId: null,
    currentDesignId: null,
    messages: [],
    lastMessageTime: null,
    pollInterval: null,
    windowPollInterval: null,
    pendingFile: null,  // { file, dataUrl }
    searchQuery: '',
    windowStatus: {},  // { orderId: { hoursRemaining, urgency, ... } }
    slotImages: {},    // { designId: imageUrl }
    selectedSlotId: null  // currently selected design slot
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    var token = localStorage.getItem('employee_token');
    var employeeData = localStorage.getItem('employee_data');

    if (!token || !employeeData) {
        window.location.href = 'login.html';
        return;
    }

    state.token = token;
    state.employee = JSON.parse(employeeData);

    verifyAuth();
    setupUI();
    loadMyDesigns();
});

async function verifyAuth() {
    try {
        var response = await fetch(API_BASE + '/employees/verify', {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            logout();
            return;
        }

        var data = await response.json();
        state.employee = data.employee;
        localStorage.setItem('employee_data', JSON.stringify(data.employee));
        document.getElementById('designer-name').textContent = state.employee.name;

    } catch (error) {
        console.error('Auth verification failed:', error);
        logout();
    }
}

function getAuthHeaders() {
    return {
        'Authorization': 'Bearer ' + state.token,
        'Content-Type': 'application/json'
    };
}

function logout() {
    localStorage.removeItem('employee_token');
    localStorage.removeItem('employee_data');
    window.location.href = 'login.html';
}

// ============================================
// UI SETUP
// ============================================

function setupUI() {
    document.getElementById('designer-name').textContent = state.employee.name;

    document.getElementById('logout-btn').addEventListener('click', function() {
        if (confirm('Cerrar sesion?')) logout();
    });

    document.getElementById('search-box').addEventListener('input', function(e) {
        state.searchQuery = e.target.value.toLowerCase().trim();
        renderOrderList();
    });

    document.getElementById('btn-send').addEventListener('click', sendMessage);

    var textarea = document.getElementById('chat-input');
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    textarea.addEventListener('input', autoResizeTextarea);

    document.getElementById('btn-attach').addEventListener('click', function() {
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    document.getElementById('btn-remove-upload').addEventListener('click', clearPendingFile);

    // Drag and drop on chat area
    var chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            chatMessages.style.background = 'rgba(231,42,136,0.05)';
            chatMessages.style.outline = '2px dashed #e72a88';
        });
        chatMessages.addEventListener('dragleave', function(e) {
            e.preventDefault();
            chatMessages.style.background = '';
            chatMessages.style.outline = '';
        });
        chatMessages.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            chatMessages.style.background = '';
            chatMessages.style.outline = '';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleDroppedFile(e.dataTransfer.files[0]);
            }
        });
    }

    document.getElementById('btn-specs').addEventListener('click', toggleSpecs);

    document.getElementById('btn-back').addEventListener('click', showOrderList);

    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.getElementById('lightbox').addEventListener('click', function(e) {
        if (e.target === e.currentTarget) closeLightbox();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeLightbox();
    });

    // Paste image to selected design slot
    // Paste image to selected design slot
    document.addEventListener('paste', function(e) {
        if (!state.currentOrderId) return;
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;

        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                var file = items[i].getAsFile();
                var order = state.orders[state.currentOrderId];
                if (!order) return;

                // Use selected slot first
                var targetDesign = null;
                if (state.selectedSlotId) {
                    targetDesign = order.designs.find(function(d) { return d.id == state.selectedSlotId; });
                }
                // Fallback to first empty slot
                if (!targetDesign) {
                    targetDesign = order.designs.find(function(d) {
                        return !d.design_image_url && !state.slotImages[d.id];
                    });
                }
                if (targetDesign) {
                    uploadDesignToSlot(targetDesign.id, file);
                } else {
                    alert('Todos los slots ya tienen imagen');
                }
                break;
            }
        }
    });

    // Refresh window status every 60 seconds for live timer countdown
    state.windowPollInterval = setInterval(async function() {
        await loadWindowStatus();
        // Update badges without full re-render
        document.querySelectorAll('.order-item').forEach(function(el) {
            var oid = el.dataset.orderId;
            var windowInfo = state.windowStatus[oid];
            var oldBadge = el.querySelector('.window-badge');
            if (windowInfo && oldBadge) {
                oldBadge.textContent = formatWindowTimer(windowInfo.hoursRemaining);
                oldBadge.className = 'window-badge ' + getWindowBadgeClass(windowInfo.urgency);
            }
        });
    }, 60000);
}

function autoResizeTextarea() {
    var el = document.getElementById('chat-input');
    el.style.height = '24px';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ============================================
// SAFE DOM HELPERS
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function createEl(tag, className, textContent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined) el.textContent = textContent;
    return el;
}

// Build a message bubble DOM node safely (no innerHTML with user data)
function buildMessageNode(msg) {
    var isDesigner = msg.sender_type === 'designer' || msg.sender_type === 'employee';
    var side = isDesigner ? 'designer' : 'client';
    var senderName = isDesigner ? (state.employee.name || 'Yo') : (msg.sender_name || 'Cliente');
    var time = formatTime(msg.created_at || msg.timestamp);
    var designTag = msg.design_label || msg.design_tag || '';

    var wrapper = createEl('div', 'message-wrapper ' + side);
    var bubble = createEl('div', 'bubble');

    // Sender
    var senderEl = createEl('div', 'bubble-sender', senderName);
    bubble.appendChild(senderEl);

    // Content
    if (msg.message_type === 'image' || msg.type === 'image') {
        var imgSrc = msg.image_url || msg.media_url || msg.content;
        var img = document.createElement('img');
        img.className = 'bubble-image';
        img.src = imgSrc;
        img.alt = 'Imagen';
        img.loading = 'lazy';
        img.addEventListener('click', function() { openLightbox(imgSrc); });
        bubble.appendChild(img);
        if (msg.caption) {
            var cap = createEl('div', 'bubble-text', msg.caption);
            bubble.appendChild(cap);
        }
    } else {
        var textEl = createEl('div', 'bubble-text', msg.content || msg.text || '');
        textEl.style.whiteSpace = 'pre-wrap';
        bubble.appendChild(textEl);
    }

    // Meta line
    var meta = createEl('div', 'bubble-meta');
    if (designTag) {
        var tag = createEl('span', 'bubble-design-tag', designTag);
        meta.appendChild(tag);
    }
    var timeEl = createEl('span', 'bubble-time', time);
    meta.appendChild(timeEl);
    bubble.appendChild(meta);

    wrapper.appendChild(bubble);
    return wrapper;
}

function buildDateSeparatorNode(timestamp) {
    var label = getDateLabel(timestamp);
    var div = createEl('div', 'date-separator');
    var span = createEl('span', '', label);
    div.appendChild(span);
    return div;
}

// ============================================
// API: LOAD DESIGNS
// ============================================

async function loadMyDesigns() {
    try {
        var response = await fetch(API_BASE + '/design-portal/my-designs', {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            throw new Error('Failed to load designs');
        }

        var data = await response.json();
        state.designs = data.designs || data || [];

        groupDesignsByOrder();
        await loadWindowStatus();
        renderOrderList();

    } catch (error) {
        console.error('Error loading designs:', error);
        var container = document.getElementById('order-list');
        container.textContent = '';
        var errDiv = createEl('div', 'order-empty');
        var errP = createEl('p', '', 'Error al cargar pedidos');
        errDiv.appendChild(errP);
        container.appendChild(errDiv);
    }
}

async function loadWindowStatus() {
    try {
        var response = await fetch(API_BASE + '/design-portal/window-status', {
            headers: getAuthHeaders()
        });
        if (!response.ok) return;
        var data = await response.json();
        state.windowStatus = {};
        (data.windows || []).forEach(function(w) {
            // Key by order_id — use the most urgent window per order
            var existing = state.windowStatus[w.orderId];
            if (!existing || w.hoursRemaining < existing.hoursRemaining) {
                state.windowStatus[w.orderId] = w;
            }
        });
    } catch (err) {
        console.error('Error loading window status:', err);
    }
}

function formatWindowTimer(hours) {
    if (hours <= 0) return 'Expirado';
    if (hours >= 1) return Math.floor(hours) + 'h';
    return Math.round(hours * 60) + 'min';
}

function getWindowBadgeClass(urgency) {
    switch (urgency) {
        case 'safe': return 'window-badge--safe';
        case 'warning': return 'window-badge--warning';
        case 'urgent': return 'window-badge--urgent';
        case 'critical': return 'window-badge--critical';
        default: return 'window-badge--expired';
    }
}

function groupDesignsByOrder() {
    state.orders = {};

    state.designs.forEach(function(d) {
        var oid = d.order_id;
        if (!state.orders[oid]) {
            state.orders[oid] = {
                order_id: oid,
                order_number: d.order_number || ('#' + oid),
                client_name: d.client_name || 'Cliente',
                due_date: d.due_date || d.deadline,
                product_type: d.product_type,
                destination: d.destination,
                quantity: d.quantity,
                notes: d.notes || d.design_notes,
                has_unread: false,
                designs: []
            };
        }
        state.orders[oid].designs.push({
            id: d.id || d.design_id,
            label: d.label || ('D' + (state.orders[oid].designs.length + 1)),
            status: d.status || 'pendiente',
            product_type: d.product_type,
            destination: d.destination,
            quantity: d.quantity,
            notes: d.notes || d.design_notes,
            deadline: d.deadline || d.due_date,
            designer_name: d.designer_name,
            design_image_url: d.design_image_url || null,
        });

        if (d.design_image_url) {
            state.slotImages[d.id || d.design_id] = d.design_image_url;
        }

        if (d.has_unread_client_messages) {
            state.orders[oid].has_unread = true;
        }
    });
}

// ============================================
// RENDER: ORDER LIST (Left Panel) — safe DOM
// ============================================

function renderOrderList() {
    var container = document.getElementById('order-list');
    container.textContent = '';
    var orderKeys = Object.keys(state.orders);

    if (orderKeys.length === 0) {
        var empty = createEl('div', 'order-empty');
        var p = createEl('p', '', 'No tienes disenos asignados');
        empty.appendChild(p);
        container.appendChild(empty);
        return;
    }

    var filtered = orderKeys.filter(function(oid) {
        if (!state.searchQuery) return true;
        var o = state.orders[oid];
        return (
            (o.client_name || '').toLowerCase().includes(state.searchQuery) ||
            (o.order_number || '').toLowerCase().includes(state.searchQuery)
        );
    });

    if (filtered.length === 0) {
        var noRes = createEl('div', 'order-empty');
        noRes.appendChild(createEl('p', '', 'Sin resultados'));
        container.appendChild(noRes);
        return;
    }

    // Sort: unread first
    filtered.sort(function(a, b) {
        var oA = state.orders[a];
        var oB = state.orders[b];
        if (oA.has_unread !== oB.has_unread) return oA.has_unread ? -1 : 1;
        return 0;
    });

    filtered.forEach(function(oid) {
        var o = state.orders[oid];
        var isActive = state.currentOrderId == oid;
        var dueStr = o.due_date ? formatShortDate(o.due_date) : '';

        var item = createEl('div', 'order-item' + (isActive ? ' active' : '') + (o.has_unread ? ' has-unread' : ''));
        item.dataset.orderId = oid;
        item.addEventListener('click', function() { selectOrder(Number(oid)); });

        // Unread dot
        item.appendChild(createEl('div', 'unread-dot'));

        // Top row
        var top = createEl('div', 'order-item-top');
        top.appendChild(createEl('span', 'order-client-name', o.client_name));

        // WhatsApp 24h window timer badge
        var windowInfo = state.windowStatus[oid];
        if (windowInfo) {
            var badge = createEl('span', 'window-badge ' + getWindowBadgeClass(windowInfo.urgency),
                formatWindowTimer(windowInfo.hoursRemaining));
            badge.title = windowInfo.urgency === 'expired'
                ? 'Ventana WhatsApp expirada — el cliente debe escribir primero'
                : 'Tiempo restante de ventana WhatsApp: ' + windowInfo.hoursRemaining + 'h';
            top.appendChild(badge);
        } else {
            top.appendChild(createEl('span', 'order-date', dueStr));
        }
        item.appendChild(top);

        // Order number + designer names for managers
        var orderInfo = o.order_number;
        var isManager = state.employee && (state.employee.role === 'manager' || state.employee.role === 'admin');
        if (isManager && o.designs.length > 0) {
            var names = [];
            o.designs.forEach(function(d) { if (d.designer_name && names.indexOf(d.designer_name) === -1) names.push(d.designer_name); });
            if (names.length > 0) orderInfo += ' · ' + names.join(', ');
        }
        item.appendChild(createEl('div', 'order-number', orderInfo));

        // Design pills
        var pills = createEl('div', 'order-pills');
        o.designs.forEach(function(d, i) {
            var pill = createEl('span', 'design-pill', d.label || ('D' + (i + 1)));
            var hasImage = !!(d.design_image_url || state.slotImages[d.id]);
            pill.dataset.status = hasImage ? 'aprobado' : d.status;
            pills.appendChild(pill);
        });
        item.appendChild(pills);

        container.appendChild(item);
    });
}

// ============================================
// SELECT ORDER
// ============================================

function selectOrder(orderId) {
    state.currentOrderId = orderId;
    state.currentDesignId = null;
    state.messages = [];
    state.lastMessageTime = null;

    if (state.pollInterval) {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
    }

    if (state.orders[orderId]) {
        state.orders[orderId].has_unread = false;
    }

    renderOrderList();
    showChatView(orderId);
    loadMessages(orderId);
    startPolling();

    document.getElementById('panel-left').classList.add('hidden-mobile');
}

function showChatView(orderId) {
    var order = state.orders[orderId];
    if (!order) return;

    document.getElementById('empty-state').style.display = 'none';
    var chatView = document.getElementById('chat-view');
    chatView.style.display = 'flex';

    document.getElementById('chat-avatar').textContent = (order.client_name || 'C').charAt(0).toUpperCase();
    document.getElementById('chat-client-name').textContent = order.client_name;
    document.getElementById('chat-client-sub').textContent = 'Pedido ' + order.order_number +
        (order.designs.length > 0 ? ' — ' + order.designs.length + ' diseno(s)' : '');

    renderDesignStrip(order);
    updateDesignTagSelect(order);
    renderSpecs(order);

    // Clear messages area (loading state)
    var msgContainer = document.getElementById('chat-messages');
    msgContainer.textContent = '';
    var loader = createEl('div', 'loading-spinner');
    loader.appendChild(createEl('div', 'spinner'));
    msgContainer.appendChild(loader);

    document.getElementById('chat-input').value = '';
    clearPendingFile();
    autoResizeTextarea();
}

function selectDesignSlot(designId, order) {
    state.selectedSlotId = designId;
    renderDesignStrip(order);
}

function uploadToSelectedSlot(file) {
    if (!state.selectedSlotId) {
        alert('Selecciona un slot primero');
        return;
    }
    uploadDesignToSlot(state.selectedSlotId, file);
}

function renderDesignStrip(order) {
    var container = document.getElementById('chat-design-strip');
    container.textContent = '';

    // Auto-select first empty slot if none selected
    if (!state.selectedSlotId) {
        var firstEmpty = order.designs.find(function(d) {
            return !d.design_image_url && !state.slotImages[d.id];
        });
        if (firstEmpty) state.selectedSlotId = firstEmpty.id;
        else if (order.designs.length > 0) state.selectedSlotId = order.designs[0].id;
    }

    order.designs.forEach(function(d, i) {
        var label = d.label || ('D' + (i + 1));
        var hasImage = !!(d.design_image_url || state.slotImages[d.id]);
        var imgUrl = d.design_image_url || state.slotImages[d.id] || null;
        var isSelected = state.selectedSlotId == d.id;

        var pill = createEl('span', 'strip-pill drop-zone' + (hasImage ? ' has-image' : '') + (isSelected ? ' selected' : ''));
        pill.dataset.designId = d.id;
        pill.dataset.status = d.status;

        if (hasImage) {
            var thumb = document.createElement('img');
            thumb.className = 'slot-thumb';
            thumb.src = imgUrl;
            thumb.alt = label;
            pill.appendChild(thumb);
            pill.appendChild(createEl('span', 'slot-check', '\u2705'));
            pill.appendChild(createEl('span', 'slot-label', label));
        } else {
            pill.textContent = label;
        }

        // Click to SELECT this slot (not upload immediately)
        pill.addEventListener('click', function(e) {
            e.stopPropagation();
            selectDesignSlot(d.id, order);
        });

        // Double-click to open file picker for this slot
        pill.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            state.selectedSlotId = d.id;
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.addEventListener('change', function() {
                if (input.files[0]) uploadDesignToSlot(d.id, input.files[0]);
            });
            input.click();
        });

        // Drag and drop onto any slot
        pill.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            pill.classList.add('dragover');
        });
        pill.addEventListener('dragleave', function(e) {
            e.preventDefault();
            pill.classList.remove('dragover');
        });
        pill.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            pill.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                uploadDesignToSlot(d.id, e.dataTransfer.files[0]);
            }
        });

        container.appendChild(pill);
    });

    // Upload button — uploads to selected slot
    var uploadBtn = createEl('button', 'slot-control-btn', '\u2B06');
    uploadBtn.title = 'Subir imagen al slot seleccionado';
    uploadBtn.addEventListener('click', function() {
        if (!state.selectedSlotId) { alert('Selecciona un slot primero'); return; }
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', function() {
            if (input.files[0]) uploadDesignToSlot(state.selectedSlotId, input.files[0]);
        });
        input.click();
    });
    container.appendChild(uploadBtn);

    // + button
    var addBtn = createEl('button', 'slot-control-btn', '+');
    addBtn.title = 'Agregar diseno';
    addBtn.addEventListener('click', function() { addDesignSlot(order.order_id); });
    container.appendChild(addBtn);

    // - button — removes selected slot if empty, or last empty slot
    var removeBtn = createEl('button', 'slot-control-btn', '\u2212');
    removeBtn.title = 'Quitar slot vacio';
    if (order.designs.length <= 1) {
        removeBtn.disabled = true;
    }
    removeBtn.addEventListener('click', function() { removeDesignSlot(order.order_id); });
    container.appendChild(removeBtn);

    // Update generate button state
    updateGenerateButton(order);
}

function updateDesignTagSelect(order) {
    var select = document.getElementById('design-tag-select');
    select.textContent = '';
    var allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'Todos';
    select.appendChild(allOpt);

    order.designs.forEach(function(d, i) {
        var opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label || ('D' + (i + 1));
        select.appendChild(opt);
    });
}

function selectDesign(designId) {
    if (state.currentDesignId == designId) {
        state.currentDesignId = null;
    } else {
        state.currentDesignId = designId;
    }

    var order = state.orders[state.currentOrderId];
    if (order) renderDesignStrip(order);
    renderSpecs(order);
    document.getElementById('design-tag-select').value = state.currentDesignId || '';
}

function renderSpecs(order) {
    if (!order) return;
    var container = document.getElementById('specs-content');
    container.textContent = '';

    var design = state.currentDesignId
        ? order.designs.find(function(d) { return d.id == state.currentDesignId; })
        : order.designs[0];

    if (!design && order.designs.length === 0) {
        container.appendChild(createEl('p', '', 'Sin especificaciones'));
        container.lastChild.style.color = '#9ca3af';
        container.lastChild.style.fontSize = '13px';
        return;
    }

    var d = design || order.designs[0];
    var statusLabels = {
        pendiente: 'Pendiente',
        en_progreso: 'En Progreso',
        en_revision: 'En Revision',
        cambios: 'Cambios',
        aprobado: 'Aprobado'
    };

    // Product
    var s1 = createEl('div', 'spec-item');
    s1.appendChild(createEl('label', '', 'Producto'));
    s1.appendChild(createEl('span', '', d.product_type || order.product_type || '\u2014'));
    container.appendChild(s1);

    // Destination
    var s2 = createEl('div', 'spec-item');
    s2.appendChild(createEl('label', '', 'Destino'));
    s2.appendChild(createEl('span', '', d.destination || order.destination || '\u2014'));
    container.appendChild(s2);

    // Quantity
    var s3 = createEl('div', 'spec-item');
    s3.appendChild(createEl('label', '', 'Cantidad'));
    s3.appendChild(createEl('span', '', String(d.quantity || order.quantity || '\u2014')));
    container.appendChild(s3);

    // Deadline
    var s4 = createEl('div', 'spec-item');
    s4.appendChild(createEl('label', '', 'Fecha limite'));
    s4.appendChild(createEl('span', '', d.deadline ? formatShortDate(d.deadline) : '\u2014'));
    container.appendChild(s4);

    // Notes (full width)
    var s5 = createEl('div', 'spec-item full-width');
    s5.appendChild(createEl('label', '', 'Notas'));
    s5.appendChild(createEl('span', '', d.notes || order.notes || 'Sin notas'));
    container.appendChild(s5);

    // Status select
    var s6 = createEl('div', 'spec-item');
    s6.appendChild(createEl('label', '', 'Estado'));
    var sel = document.createElement('select');
    sel.className = 'status-select';
    Object.keys(statusLabels).forEach(function(val) {
        var opt = document.createElement('option');
        opt.value = val;
        opt.textContent = statusLabels[val];
        if (d.status === val) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', function() { updateStatus(d.id, sel.value); });
    s6.appendChild(sel);
    container.appendChild(s6);
}

function toggleSpecs() {
    var panel = document.getElementById('specs-panel');
    var btn = document.getElementById('btn-specs');
    panel.classList.toggle('open');
    btn.classList.toggle('active');
}

// ============================================
// API: MESSAGES
// ============================================

async function loadMessages(orderId) {
    try {
        var response = await fetch(API_BASE + '/design-portal/messages/' + orderId, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load messages');

        var data = await response.json();
        state.messages = data.messages || data || [];

        if (state.messages.length > 0) {
            state.lastMessageTime = state.messages[state.messages.length - 1].created_at ||
                                    state.messages[state.messages.length - 1].timestamp;
        }

        renderMessages();
        scrollToBottom(false);

    } catch (error) {
        console.error('Error loading messages:', error);
        var container = document.getElementById('chat-messages');
        container.textContent = '';
        var sep = buildDateSeparatorNode(null);
        sep.querySelector('span').textContent = 'Error al cargar mensajes';
        container.appendChild(sep);
    }
}

function startPolling() {
    if (state.pollInterval) clearInterval(state.pollInterval);

    state.pollInterval = setInterval(async function() {
        if (!state.currentOrderId) return;

        try {
            var url = API_BASE + '/design-portal/messages/' + state.currentOrderId;
            if (state.lastMessageTime) {
                url += '?after=' + encodeURIComponent(state.lastMessageTime);
            }

            var response = await fetch(url, { headers: getAuthHeaders() });
            if (!response.ok) return;

            var data = await response.json();
            var newMsgs = data.messages || data || [];

            if (newMsgs.length > 0) {
                var existingIds = {};
                state.messages.forEach(function(m) { existingIds[m.id] = true; });
                var truly = newMsgs.filter(function(m) { return !existingIds[m.id]; });

                if (truly.length > 0) {
                    state.messages = state.messages.concat(truly);
                    state.lastMessageTime = truly[truly.length - 1].created_at ||
                                            truly[truly.length - 1].timestamp;
                    appendMessages(truly);
                    scrollToBottom(true);

                    if (document.hidden) {
                        var clientMsg = truly.find(function(m) { return m.sender_type === 'client'; });
                        if (clientMsg) notifyNewMessage(clientMsg);
                    }
                }
            }
        } catch (err) {
            // Silent fail for polling
        }
    }, 3000);
}

// ============================================
// RENDER: MESSAGES — safe DOM
// ============================================

function renderMessages() {
    var container = document.getElementById('chat-messages');
    container.textContent = '';

    if (state.messages.length === 0) {
        container.appendChild(buildDateSeparatorNode(null));
        container.querySelector('.date-separator span').textContent = 'Inicio de la conversacion';
        return;
    }

    var lastDate = null;

    state.messages.forEach(function(msg) {
        var msgDate = getDateString(msg.created_at || msg.timestamp);

        if (msgDate !== lastDate) {
            container.appendChild(buildDateSeparatorNode(msg.created_at || msg.timestamp));
            lastDate = msgDate;
        }

        container.appendChild(buildMessageNode(msg));
    });
}

function appendMessages(msgs) {
    var container = document.getElementById('chat-messages');
    var lastDate = null;

    // Determine last date from existing messages
    var existingMsgs = state.messages.slice(0, state.messages.length - msgs.length);
    if (existingMsgs.length > 0) {
        lastDate = getDateString(existingMsgs[existingMsgs.length - 1].created_at ||
                                 existingMsgs[existingMsgs.length - 1].timestamp);
    }

    msgs.forEach(function(msg) {
        var msgDate = getDateString(msg.created_at || msg.timestamp);
        if (msgDate !== lastDate) {
            container.appendChild(buildDateSeparatorNode(msg.created_at || msg.timestamp));
            lastDate = msgDate;
        }
        container.appendChild(buildMessageNode(msg));
    });
}

// ============================================
// SEND MESSAGE
// ============================================

async function sendMessage() {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    var designTagSelect = document.getElementById('design-tag-select');
    var designId = designTagSelect.value || null;

    if (!text && !state.pendingFile) return;
    if (!state.currentOrderId) return;

    var btn = document.getElementById('btn-send');
    btn.disabled = true;

    try {
        if (state.pendingFile) {
            await sendImageMessage(text, designId);
        } else {
            await sendTextMessage(text, designId);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        var container = document.getElementById('chat-messages');
        var errSep = buildDateSeparatorNode(null);
        var errSpan = errSep.querySelector('span');
        errSpan.textContent = 'Error al enviar. Intenta de nuevo.';
        errSpan.style.color = '#e52421';
        container.appendChild(errSep);
        scrollToBottom(true);
    } finally {
        btn.disabled = false;
    }
}

async function sendTextMessage(text, designId) {
    var tempMsg = {
        id: 'temp-' + Date.now(),
        content: text,
        sender_type: 'designer',
        sender_name: state.employee.name,
        created_at: new Date().toISOString(),
        design_id: designId,
        design_label: getDesignLabelById(designId),
        message_type: 'text'
    };

    state.messages.push(tempMsg);
    appendMessages([tempMsg]);
    scrollToBottom(true);

    document.getElementById('chat-input').value = '';
    autoResizeTextarea();

    var response = await fetch(API_BASE + '/design-portal/messages/send', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            orderId: state.currentOrderId,
            designAssignmentId: designId,
            content: text,
            messageType: 'text'
        })
    });

    if (!response.ok) throw new Error('Send failed');

    var data = await response.json();
    if (data.message && data.message.id) {
        var idx = state.messages.findIndex(function(m) { return m.id === tempMsg.id; });
        if (idx !== -1) {
            state.messages[idx].id = data.message.id;
            state.lastMessageTime = data.message.created_at || state.lastMessageTime;
        }
    }
}

async function sendImageMessage(caption, designId) {
    var file = state.pendingFile.file;

    var tempMsg = {
        id: 'temp-' + Date.now(),
        content: state.pendingFile.dataUrl,
        caption: caption || '',
        sender_type: 'designer',
        sender_name: state.employee.name,
        created_at: new Date().toISOString(),
        design_id: designId,
        design_label: getDesignLabelById(designId),
        message_type: 'image',
        image_url: state.pendingFile.dataUrl
    };

    state.messages.push(tempMsg);
    appendMessages([tempMsg]);
    scrollToBottom(true);

    document.getElementById('chat-input').value = '';
    clearPendingFile();
    autoResizeTextarea();

    var formData = new FormData();
    formData.append('orderId', state.currentOrderId);
    if (designId) formData.append('designAssignmentId', designId);
    if (caption) formData.append('caption', caption);
    formData.append('file', file);

    var response = await fetch(API_BASE + '/design-portal/messages/upload', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + state.token
        },
        body: formData
    });

    if (!response.ok) throw new Error('Image upload failed');

    var data = await response.json();
    if (data.message && data.message.id) {
        var idx = state.messages.findIndex(function(m) { return m.id === tempMsg.id; });
        if (idx !== -1) {
            state.messages[idx].id = data.message.id;
            if (data.message.image_url) {
                state.messages[idx].image_url = data.message.image_url;
            }
            state.lastMessageTime = data.message.created_at || state.lastMessageTime;
        }
    }
}

function getDesignLabelById(designId) {
    if (!designId || !state.currentOrderId) return '';
    var order = state.orders[state.currentOrderId];
    if (!order) return '';
    var d = order.designs.find(function(des) { return des.id == designId; });
    return d ? (d.label || 'D?') : '';
}

// ============================================
// FILE HANDLING
// ============================================

function handleFileSelect(e) {
    var file = e.target.files[0];
    if (!file) return;
    processFileForUpload(file);
    e.target.value = '';
}

function handleDroppedFile(file) {
    if (!file) return;
    processFileForUpload(file);
}

function processFileForUpload(file) {
    if (file.size > 10 * 1024 * 1024) {
        alert('El archivo es muy grande. Máximo 10MB.');
        return;
    }

    var reader = new FileReader();
    reader.onload = function(ev) {
        state.pendingFile = { file: file, dataUrl: ev.target.result };
        var isImage = file.type.startsWith('image/');
        showUploadPreview(file.name, isImage ? ev.target.result : null);
    };
    reader.readAsDataURL(file);
}

function showUploadPreview(name, dataUrl) {
    var thumb = document.getElementById('upload-thumb');
    if (dataUrl) {
        thumb.src = dataUrl;
        thumb.style.display = 'block';
    } else {
        thumb.style.display = 'none';
        thumb.src = '';
    }
    document.getElementById('upload-name').textContent = name;
    document.getElementById('upload-preview').classList.add('show');
}

function clearPendingFile() {
    state.pendingFile = null;
    document.getElementById('upload-preview').classList.remove('show');
    document.getElementById('upload-thumb').src = '';
    document.getElementById('upload-name').textContent = '';
}

// ============================================
// STATUS UPDATE
// ============================================

async function updateStatus(designId, newStatus) {
    try {
        var response = await fetch(API_BASE + '/design-portal/designs/' + designId + '/status', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) throw new Error('Status update failed');

        var order = state.orders[state.currentOrderId];
        if (order) {
            var d = order.designs.find(function(des) { return des.id == designId; });
            if (d) d.status = newStatus;

            renderDesignStrip(order);
            renderOrderList();
        }

    } catch (error) {
        console.error('Error updating status:', error);
        alert('Error al actualizar estado');
        if (state.currentOrderId) {
            var order2 = state.orders[state.currentOrderId];
            if (order2) renderSpecs(order2);
        }
    }
}

// ============================================
// LIGHTBOX
// ============================================

function openLightbox(src) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.body.style.overflow = '';
}

// ============================================
// MOBILE NAVIGATION
// ============================================

function showOrderList() {
    document.getElementById('panel-left').classList.remove('hidden-mobile');
    state.currentOrderId = null;

    if (state.pollInterval) {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
    }

    document.getElementById('chat-view').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
}

// ============================================
// NOTIFICATIONS
// ============================================

function notifyNewMessage(msg) {
    if ('Notification' in window && Notification.permission === 'granted') {
        var n = new Notification('AXKAN Diseno', {
            body: (msg.sender_name || 'Cliente') + ': ' + (msg.content || 'Nueva imagen'),
            icon: '../assets/images/LOGO-01.png',
            tag: 'design-msg-' + msg.id
        });
        n.onclick = function() { window.focus(); n.close(); };
    }

    // Subtle notification sound
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.08;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
        // Audio not available
    }
}

// Request notification permission on first user interaction
document.addEventListener('click', function requestNotifPerm() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    document.removeEventListener('click', requestNotifPerm);
}, { once: true });

// ============================================
// UTILITIES
// ============================================

function scrollToBottom(smooth) {
    var el = document.getElementById('chat-messages');
    if (!el) return;
    setTimeout(function() {
        el.scrollTo({
            top: el.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }, 50);
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatShortDate(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var diff = Math.floor((now - d) / 86400000);

    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7) return d.toLocaleDateString('es-MX', { weekday: 'short' });
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function getDateString(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
}

function getDateLabel(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.floor((today - msgDay) / 86400000);

    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ============================================
// DESIGN SLOT INTERACTIONS
// ============================================

async function uploadDesignToSlot(designId, file) {
    if (!file.type.startsWith('image/')) {
        alert('Solo se permiten imagenes');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        alert('Archivo muy grande. Maximo 10MB.');
        return;
    }

    // Optimistic UI — show local preview immediately
    var reader = new FileReader();
    reader.onload = function(ev) {
        state.slotImages[designId] = ev.target.result;
        var order = state.orders[state.currentOrderId];
        if (order) renderDesignStrip(order);
    };
    reader.readAsDataURL(file);

    try {
        var formData = new FormData();
        formData.append('file', file);

        var response = await fetch(API_BASE + '/design-portal/designs/' + designId + '/image', {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + state.token },
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        var data = await response.json();

        // Update with real Cloudinary URL
        state.slotImages[designId] = data.imageUrl;
        var order = state.orders[state.currentOrderId];
        if (order) {
            var d = order.designs.find(function(des) { return des.id == designId; });
            if (d) {
                d.design_image_url = data.imageUrl;
                d.status = 'aprobado';
            }
            renderDesignStrip(order);
            renderOrderList();
        }

    } catch (error) {
        console.error('Error uploading design to slot:', error);
        alert('Error al subir diseno. Intenta de nuevo.');
        delete state.slotImages[designId];
        var order2 = state.orders[state.currentOrderId];
        if (order2) renderDesignStrip(order2);
    }
}

async function addDesignSlot(orderId) {
    try {
        var response = await fetch(API_BASE + '/design-portal/orders/' + orderId + '/add-slot', {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            var err = await response.json();
            throw new Error(err.error || 'Failed to add slot');
        }

        var data = await response.json();
        var order = state.orders[orderId];
        if (order && data.design) {
            order.designs.push({
                id: data.design.id,
                label: data.design.label,
                status: data.design.status,
                design_image_url: null
            });
            renderDesignStrip(order);
            renderOrderList();
        }
    } catch (error) {
        console.error('Error adding design slot:', error);
        alert('Error al agregar diseno');
    }
}

async function removeDesignSlot(orderId) {
    try {
        var response = await fetch(API_BASE + '/design-portal/orders/' + orderId + '/remove-slot', {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            var err = await response.json();
            throw new Error(err.error || 'Failed to remove slot');
        }

        var order = state.orders[orderId];
        if (order) {
            order.designs.pop();
            renderDesignStrip(order);
            renderOrderList();
        }
    } catch (error) {
        console.error('Error removing design slot:', error);
        alert('Error al quitar diseno');
    }
}

function updateGenerateButton(order) {
    var btn = document.getElementById('btn-generate-order');
    if (!btn) return;

    var allFilled = order.designs.length > 0 && order.designs.every(function(d) {
        return d.design_image_url || state.slotImages[d.id];
    });

    btn.classList.toggle('ready', allFilled);
    if (allFilled) {
        btn.onclick = function() { generateOrder(order.order_id); };
    } else {
        btn.onclick = null;
    }

    // Show/hide complete button
    var completeBtn = document.getElementById('btn-complete-order');
    if (!completeBtn) return;

    var allApproved = order.designs.length > 0 && order.designs.every(function(d) {
        return d.status === 'aprobado' && d.design_image_url;
    });

    var alreadyCompleted = order.order_status && order.order_status !== 'new' && order.order_status !== 'design' && order.order_status !== 'whatsapp_draft';

    if (alreadyCompleted) {
        completeBtn.classList.add('visible', 'done');
        document.getElementById('complete-label').textContent = 'Enviado a producción';
        completeBtn.onclick = null;
    } else if (allApproved) {
        completeBtn.classList.add('visible');
        completeBtn.classList.remove('done');
        completeBtn.onclick = function() { completeOrder(order.order_id); };
    } else {
        completeBtn.classList.remove('visible', 'done');
        completeBtn.onclick = null;
    }
}

async function completeOrder(orderId) {
    var btn = document.getElementById('btn-complete-order');
    var label = document.getElementById('complete-label');
    if (!btn || btn.classList.contains('loading')) return;

    if (!confirm('¿Marcar todos los diseños como completados y notificar al cliente por WhatsApp?')) return;

    btn.classList.add('loading');
    var originalText = label.textContent;
    label.textContent = 'Enviando...';

    try {
        var response = await fetch(API_BASE + '/design-portal/complete-order', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ orderId: orderId })
        });

        if (!response.ok) {
            var err = await response.json();
            throw new Error(err.error || 'Failed to complete order');
        }

        var data = await response.json();

        btn.classList.add('done');
        label.textContent = 'Enviado a producción';
        btn.onclick = null;

        var msg = '✅ Pedido ' + (data.orderNumber || '') + ' marcado como completado.';
        if (data.whatsappSent) {
            msg += '\n📱 Cliente notificado por WhatsApp.';
        } else {
            msg += '\n⚠️ No se pudo notificar al cliente por WhatsApp.';
        }
        alert(msg);

    } catch (error) {
        console.error('Error completing order:', error);
        alert('Error: ' + error.message);
        label.textContent = originalText;
    } finally {
        btn.classList.remove('loading');
    }
}

var ORDER_PROXY_URL = 'http://localhost:3002';

async function generateOrder(orderId) {
    var btn = document.getElementById('btn-generate-order');
    var label = document.getElementById('generate-label');
    if (!btn || btn.classList.contains('loading')) return;

    btn.classList.add('loading');
    var originalText = label.textContent;
    label.textContent = '';
    var spinner = createEl('span', 'gen-spinner');
    btn.insertBefore(spinner, label);

    try {
        // Get order data from backend
        var response = await fetch(API_BASE + '/design-portal/generate-order', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ orderId: orderId })
        });

        if (!response.ok) {
            var err = await response.json();
            throw new Error(err.error || 'Generation failed');
        }

        var data = await response.json();
        var payload = data.payload;

        // Try local order proxy first (generates PDF via Python script)
        var proxyAvailable = false;
        try {
            var healthCheck = await fetch(ORDER_PROXY_URL + '/health', { signal: AbortSignal.timeout(2000) });
            if (healthCheck.ok) {
                var healthData = await healthCheck.json();
                proxyAvailable = healthData.status === 'ok';
            }
        } catch (_) {}

        if (proxyAvailable) {
            label.textContent = 'Generando PDF...';
            var pdfResponse = await fetch(ORDER_PROXY_URL + '/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            var pdfResult = await pdfResponse.json();

            if (pdfResult.success && pdfResult.pdfPath) {
                alert('PDF generado!\n\n' + pdfResult.pdfPath);
            } else {
                throw new Error(pdfResult.error || 'PDF generation failed');
            }
        } else {
            // Fallback: download JSON
            var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'order-' + (payload.order_number || orderId) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert('Order proxy no detectado. JSON descargado.\nEjecuta: node order-proxy.js');
        }

    } catch (error) {
        console.error('Error generating order:', error);
        alert('Error al generar pedido: ' + error.message);
    } finally {
        btn.classList.remove('loading');
        if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
        label.textContent = originalText;
    }
}

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', function() {
    if (state.pollInterval) clearInterval(state.pollInterval);
});

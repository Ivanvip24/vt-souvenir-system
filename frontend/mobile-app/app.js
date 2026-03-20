/* ============================================
   AXKAN COMMAND — Mobile Dashboard App
   ============================================ */

const API = 'https://vt-souvenir-backend.onrender.com/api';
const TOKEN_KEY = 'admin_token';

// ── State ──
let allOrders = [];
let allTasks = [];
let alertsData = null;
let analyticsData = null;
let taskStats = null;
let currentFilter = 'all';
let currentTaskFilter = 'all';
let refreshTimer = null;
let aiMessages = [];
let aiSessionId = 'mobile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
let aiIsTyping = false;
let aiInitialized = false;

// WhatsApp state
let waConversations = [];
let waCurrentConv = null;
let waCurrentMessages = [];
let waSending = false;
let waPollingTimer = null;
let waSearchTerm = '';
let waLabels = [];
let waTemplates = [];

const AI_CHIPS = [
    { label: 'Revenue hoy', msg: '¿Cuánto vendimos hoy?' },
    { label: 'Pendientes', msg: '¿Cuántos pedidos están pendientes?' },
    { label: 'Top productos', msg: '¿Cuáles son los productos más vendidos?' },
    { label: 'En producción', msg: '¿Qué pedidos están en producción?' },
    { label: 'Top clientes', msg: '¿Quiénes son los mejores clientes?' },
    { label: 'Tareas urgentes', msg: '¿Hay tareas urgentes o bloqueadas?' },
];

// ── Status color map ──
const STATUS_COLORS = {
    'New': { bg: '#e72a88', cls: 'new', label: 'Nuevo' },
    'Design': { bg: '#09adc2', cls: 'production', label: 'Diseño' },
    'Printing': { bg: '#8ab73b', cls: 'approved', label: 'Impresión' },
    'Cutting': { bg: '#f39223', cls: 'pending', label: 'Corte' },
    'Counting': { bg: '#D4A574', cls: 'pending', label: 'Conteo' },
    'Shipping': { bg: '#a482c8', cls: 'shipped', label: 'Envío' },
    'Delivered': { bg: '#8ab73b', cls: 'delivered', label: 'Entregado' },
    'Cancelled': { bg: '#e52421', cls: 'cancelled', label: 'Cancelado' },
};

const APPROVAL_MAP = {
    'pending_review': { cls: 'pending', label: 'Pendiente' },
    'approved': { cls: 'approved', label: 'Aprobado' },
    'needs_changes': { cls: 'pending', label: 'Cambios' },
    'rejected': { cls: 'cancelled', label: 'Rechazado' },
};

// ── Utility ──
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function formatMoney(n) {
    if (n == null || isNaN(n)) return '$0';
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    const day = date.getDate();
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return day + ' ' + months[date.getMonth()];
}

function getHeaders() {
    return {
        'Authorization': 'Bearer ' + localStorage.getItem(TOKEN_KEY),
        'Content-Type': 'application/json'
    };
}

async function apiFetch(path, opts) {
    const res = await fetch(API + path, Object.assign({ headers: getHeaders() }, opts || {}));
    if (res.status === 401 || res.status === 403) {
        logout();
        throw new Error('Unauthorized');
    }
    return res.json();
}

// ── Safe text helper — all dynamic content goes through this ──
function safeText(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ── Safe DOM builder — creates elements without innerHTML ──
function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
        Object.keys(attrs).forEach(function(key) {
            if (key === 'className') node.className = attrs[key];
            else if (key === 'textContent') node.textContent = attrs[key];
            else if (key === 'style' && typeof attrs[key] === 'object') {
                Object.assign(node.style, attrs[key]);
            } else if (key.startsWith('on') && typeof attrs[key] === 'function') {
                node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
            } else if (key.startsWith('data-')) {
                node.setAttribute(key, attrs[key]);
            } else {
                node.setAttribute(key, attrs[key]);
            }
        });
    }
    if (children) {
        if (!Array.isArray(children)) children = [children];
        children.forEach(function(child) {
            if (child == null) return;
            if (typeof child === 'string') {
                node.appendChild(document.createTextNode(child));
            } else {
                node.appendChild(child);
            }
        });
    }
    return node;
}

// ── Auth ──
async function checkAuth() {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) return showLogin();
    try {
        var data = await apiFetch('/admin/verify');
        if (data.success) showApp();
        else showLogin();
    } catch(e) {
        showLogin();
    }
}

function showLogin() {
    $('#login-screen').classList.add('active');
    $('#app-screen').classList.remove('active');
    stopRefresh();
}

function showApp() {
    $('#login-screen').classList.remove('active');
    $('#app-screen').classList.add('active');
    loadAllData();
    startRefresh();
    initPushNotifications();
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    allOrders = [];
    allTasks = [];
    showLogin();
}

async function handleLogin(e) {
    e.preventDefault();
    var btn = $('#login-btn');
    var errEl = $('#login-error');
    btn.classList.add('loading');
    errEl.textContent = '';

    try {
        var res = await fetch(API + '/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: $('#username').value.trim(),
                password: $('#password').value
            })
        });
        var data = await res.json();
        if (data.success && data.token) {
            localStorage.setItem(TOKEN_KEY, data.token);
            showApp();
        } else {
            errEl.textContent = data.message || 'Credenciales incorrectas';
        }
    } catch(e) {
        errEl.textContent = 'Error de conexión';
    } finally {
        btn.classList.remove('loading');
    }
}

// ── Data Loading ──
async function loadAllData() {
    updateConnectionStatus(true);
    try {
        var results = await Promise.allSettled([
            apiFetch('/orders'),
            apiFetch('/alerts'),
            apiFetch('/analytics/dashboard?startDate=' + getTodayISO() + '&endDate=' + getTodayISO()),
            apiFetch('/admin/tasks?limit=100'),
            apiFetch('/admin/tasks/stats'),
            apiFetch('/whatsapp/conversations'),
            apiFetch('/whatsapp/labels'),
            apiFetch('/whatsapp/templates'),
        ]);

        if (results[0].status === 'fulfilled' && results[0].value.success) {
            allOrders = results[0].value.data || [];
        }
        if (results[1].status === 'fulfilled' && results[1].value.success) {
            alertsData = results[1].value.data;
        }
        if (results[2].status === 'fulfilled' && results[2].value.success) {
            analyticsData = results[2].value.data;
        }
        if (results[3].status === 'fulfilled' && results[3].value.success) {
            allTasks = results[3].value.tasks || [];
        }
        if (results[4].status === 'fulfilled' && results[4].value.success) {
            taskStats = results[4].value;
        }
        if (results[5].status === 'fulfilled' && results[5].value.success) {
            waConversations = results[5].value.data || [];
        }
        if (results[6].status === 'fulfilled' && results[6].value.success) {
            waLabels = results[6].value.data || [];
        }
        if (results[7].status === 'fulfilled') {
            waTemplates = results[7].value.templates || [];
        }

        renderHome();
        renderOrders();
        renderWhatsApp();
        renderTasks();
        updateWaBadge();
    } catch(e) {
        updateConnectionStatus(false);
    }
}

function getTodayISO() {
    return new Date().toISOString().split('T')[0];
}

function updateConnectionStatus(online) {
    var dot = $('#connection-dot');
    dot.classList.toggle('online', online);
    dot.classList.toggle('offline', !online);
}

// ── Auto Refresh ──
function startRefresh() {
    stopRefresh();
    refreshTimer = setInterval(function() { loadAllData(); }, 30000);
}

function stopRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

// ── Render: Home ──
function renderHome() {
    // Stats
    var pending = allOrders.filter(function(o) { return o.approvalStatus === 'pending_review'; }).length;
    var inProgress = allOrders.filter(function(o) { return ['Design','Printing','Cutting','Counting'].indexOf(o.status) >= 0; }).length;
    var today = getTodayISO();
    var completedToday = allOrders.filter(function(o) { return o.status === 'Delivered' && o.deliveryDate && o.deliveryDate.startsWith(today); }).length;

    animateNumber($('#stat-pending'), pending);
    animateNumber($('#stat-progress'), inProgress);
    animateNumber($('#stat-completed'), completedToday);

    // Alerts
    if (alertsData && alertsData.summary && alertsData.summary.totalAlerts > 0) {
        var s = alertsData.summary;
        var parts = [];
        if (s.criticalCount > 0) parts.push(s.criticalCount + ' críticas');
        if (s.warningCount > 0) parts.push(s.warningCount + ' avisos');
        if (s.upcomingCount > 0) parts.push(s.upcomingCount + ' próximos');
        $('#alerts-text').textContent = parts.join(' · ');
        $('#alerts-banner').classList.remove('hidden');
    } else {
        $('#alerts-banner').classList.add('hidden');
    }

    // Pipeline bar
    renderPipelineBar();

    // Revenue
    if (analyticsData && analyticsData.summary) {
        var sum = analyticsData.summary;
        $('#revenue-total').textContent = formatMoney(sum.totalRevenue);
        $('#revenue-profit').textContent = formatMoney(sum.totalProfit);
        $('#revenue-orders').textContent = sum.totalOrders || 0;
    }

    // Recent orders (last 5) — built with safe DOM
    var recent = allOrders.slice().sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 5);
    var recentContainer = $('#recent-orders');
    recentContainer.replaceChildren();
    if (recent.length === 0) {
        recentContainer.appendChild(el('p', { className: 'empty-state' }, [
            el('span', { style: { color: 'var(--muted)' }, textContent: 'Sin pedidos recientes' })
        ]));
    } else {
        recent.forEach(function(o) {
            recentContainer.appendChild(buildOrderCard(o, 0));
        });
    }
}

function animateNumber(elem, target) {
    var current = parseInt(elem.textContent) || 0;
    if (current === target) { elem.textContent = target; return; }
    var diff = target - current;
    var steps = Math.min(Math.abs(diff), 20);
    var stepTime = 300 / steps;
    var i = 0;
    var timer = setInterval(function() {
        i++;
        elem.textContent = Math.round(current + (diff * (i / steps)));
        if (i >= steps) {
            elem.textContent = target;
            clearInterval(timer);
        }
    }, stepTime);
}

function renderPipelineBar() {
    var statusOrder = ['New', 'Design', 'Printing', 'Cutting', 'Counting', 'Shipping', 'Delivered'];
    var counts = {};
    var total = 0;

    allOrders.forEach(function(o) {
        if (o.status && o.status !== 'Cancelled' && o.archiveStatus !== 'cancelado') {
            counts[o.status] = (counts[o.status] || 0) + 1;
            total++;
        }
    });

    var barEl = $('#pipeline-bar');
    var legendEl = $('#pipeline-legend');
    barEl.replaceChildren();
    legendEl.replaceChildren();

    if (total === 0) {
        barEl.appendChild(el('div', { className: 'pipeline-empty', textContent: 'Sin pedidos activos' }));
        return;
    }

    statusOrder.forEach(function(status) {
        var count = counts[status] || 0;
        if (count === 0) return;
        var pct = (count / total * 100);
        var info = STATUS_COLORS[status] || { bg: '#555', label: status };

        var seg = el('div', { className: 'pipeline-segment', title: info.label + ': ' + count }, [
            el('span', { textContent: String(count) })
        ]);
        seg.style.flex = String(pct);
        seg.style.background = info.bg;
        barEl.appendChild(seg);

        var dot = el('div', { className: 'legend-dot' });
        dot.style.background = info.bg;
        legendEl.appendChild(el('div', { className: 'legend-item' }, [dot, info.label]));
    });
}

// ── Build Order Card (safe DOM) ──
function buildOrderCard(order, index) {
    var statusInfo = STATUS_COLORS[order.status] || { cls: 'new', label: order.status || 'N/A' };
    var approvalInfo = APPROVAL_MAP[order.approvalStatus];
    var badge = approvalInfo || statusInfo;

    var card = el('div', { className: 'order-card', 'data-id': String(order.id) }, [
        el('div', { className: 'order-card-top' }, [
            el('span', { className: 'order-number', textContent: '#' + (order.orderNumber || order.id) }),
            el('span', { className: 'status-badge ' + badge.cls, textContent: badge.label })
        ]),
        el('div', { className: 'order-client', textContent: order.clientName || 'Sin nombre' }),
        el('div', { className: 'order-card-bottom' }, [
            el('span', { className: 'order-amount', textContent: formatMoney(order.totalPrice) }),
            el('span', { className: 'order-date', textContent: formatDate(order.createdAt) })
        ])
    ]);
    if (index != null) {
        card.style.animationDelay = (index * 0.04) + 's';
    }

    // Swipeable wrapper for pending_review orders
    if (order.approvalStatus === 'pending_review') {
        var wrapper = el('div', { className: 'swipe-wrapper' });

        // Reveal backgrounds
        var approveReveal = el('div', { className: 'swipe-reveal approve' }, [
            el('svg', {}),
            el('span', { className: 'swipe-label', textContent: 'APROBAR →' })
        ]);
        approveReveal.querySelector('svg').outerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

        var rejectReveal = el('div', { className: 'swipe-reveal reject' }, [
            el('span', { className: 'swipe-label', textContent: '← RECHAZAR' }),
            el('svg', {})
        ]);
        rejectReveal.querySelector('svg').outerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

        wrapper.appendChild(approveReveal);
        wrapper.appendChild(rejectReveal);
        wrapper.appendChild(card);

        initSwipeGesture(wrapper, card, order);
        return wrapper;
    }

    card.addEventListener('click', function() {
        var o = allOrders.find(function(x) { return String(x.id) === String(order.id); });
        if (o) showOrderDetail(o);
    });
    return card;
}

// ── Swipe Gesture for Order Cards (two-stage) ──
// Stage 1: Swipe reveals the action (APROBAR / RECHAZAR)
// Stage 2: Keep swiping past confirm threshold to execute
function initSwipeGesture(wrapper, card, order) {
    var startX = 0, startY = 0, currentX = 0;
    var isDragging = false, isHorizontal = null;
    var REVEAL = 70;     // px — shows the action label
    var CONFIRM = 160;   // px — triggers the action
    var MAX_SWIPE = 220;

    var approveEl = wrapper.querySelector('.swipe-reveal.approve');
    var rejectEl = wrapper.querySelector('.swipe-reveal.reject');
    var approveLbl = approveEl.querySelector('.swipe-label');
    var rejectLbl = rejectEl.querySelector('.swipe-label');

    card.addEventListener('touchstart', function(e) {
        var touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        currentX = 0;
        isDragging = true;
        isHorizontal = null;
        card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        var touch = e.touches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;

        if (isHorizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            isHorizontal = Math.abs(dx) > Math.abs(dy);
        }
        if (!isHorizontal) return;

        e.preventDefault();
        currentX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, dx));
        card.style.transform = 'translateX(' + currentX + 'px)';

        var absx = Math.abs(currentX);
        var pctReveal = Math.min(1, absx / REVEAL);
        var pastConfirm = absx >= CONFIRM;

        if (currentX > 0) {
            approveEl.style.opacity = pctReveal;
            rejectEl.style.opacity = 0;
            if (approveLbl) approveLbl.textContent = pastConfirm ? 'SOLTAR PARA APROBAR' : 'APROBAR →';
            approveEl.classList.toggle('ready', pastConfirm);
        } else if (currentX < 0) {
            rejectEl.style.opacity = pctReveal;
            approveEl.style.opacity = 0;
            if (rejectLbl) rejectLbl.textContent = pastConfirm ? 'SOLTAR PARA RECHAZAR' : '← RECHAZAR';
            rejectEl.classList.toggle('ready', pastConfirm);
        }
    }, { passive: false });

    card.addEventListener('touchend', function() {
        if (!isDragging) return;
        isDragging = false;

        card.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s';
        var absx = Math.abs(currentX);

        if (isHorizontal && absx >= CONFIRM) {
            // Stage 2 reached — execute action
            var direction = currentX > 0 ? 1 : -1;
            card.style.transform = 'translateX(' + (direction * 350) + 'px)';
            card.style.opacity = '0';
            wrapper.style.transition = 'height 0.3s 0.15s, margin 0.3s 0.15s, opacity 0.2s 0.15s';
            wrapper.style.overflow = 'hidden';

            setTimeout(function() {
                wrapper.style.height = '0px';
                wrapper.style.marginBottom = '0px';
                wrapper.style.opacity = '0';
            }, 100);

            setTimeout(function() {
                if (direction > 0) {
                    handleApproveOrder(order);
                } else {
                    handleRejectOrder(order);
                }
            }, 350);
        } else {
            // Snap back
            card.style.transform = 'translateX(0)';
            approveEl.style.opacity = 0;
            rejectEl.style.opacity = 0;
            approveEl.classList.remove('ready');
            rejectEl.classList.remove('ready');
            if (approveLbl) approveLbl.textContent = 'APROBAR →';
            if (rejectLbl) rejectLbl.textContent = '← RECHAZAR';
        }

        // Tap to open detail (no horizontal movement)
        if (isHorizontal === false || (isHorizontal === null && absx < 5)) {
            var o = allOrders.find(function(x) { return String(x.id) === String(order.id); });
            if (o) showOrderDetail(o);
        }
    }, { passive: true });
}

// ── Render: Orders ──
function renderOrders() {
    var search = ($('#order-search') ? $('#order-search').value : '').toLowerCase();
    var filtered = allOrders.slice();

    // Filter by status
    if (currentFilter !== 'all') {
        if (currentFilter === 'pending_review') {
            filtered = filtered.filter(function(o) { return o.approvalStatus === 'pending_review'; });
        } else if (currentFilter === 'approved') {
            filtered = filtered.filter(function(o) { return o.approvalStatus === 'approved' && ['Shipping','Delivered'].indexOf(o.status) < 0; });
        } else if (currentFilter === 'production') {
            filtered = filtered.filter(function(o) { return ['Design','Printing','Cutting','Counting'].indexOf(o.status) >= 0; });
        } else if (currentFilter === 'shipped') {
            filtered = filtered.filter(function(o) { return o.status === 'Shipping'; });
        } else if (currentFilter === 'delivered') {
            filtered = filtered.filter(function(o) { return o.status === 'Delivered'; });
        }
    }

    // Search
    if (search) {
        filtered = filtered.filter(function(o) {
            return (o.clientName || '').toLowerCase().indexOf(search) >= 0 ||
                   (o.orderNumber || '').toLowerCase().indexOf(search) >= 0;
        });
    }

    // Sort newest first
    filtered.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var list = $('#orders-list');
    var empty = $('#orders-empty');

    list.replaceChildren();

    if (filtered.length === 0) {
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        filtered.forEach(function(o, i) {
            list.appendChild(buildOrderCard(o, i));
        });
    }
}

// ── Order Detail (safe DOM) ──
function showOrderDetail(order) {
    var sheet = $('#order-detail');
    $('#detail-order-num').textContent = '#' + (order.orderNumber || order.id);

    var statusInfo = STATUS_COLORS[order.status] || { cls: 'new', label: order.status };
    var approvalInfo = APPROVAL_MAP[order.approvalStatus] || { cls: 'pending', label: order.approvalStatus };

    var content = $('#detail-content');
    content.replaceChildren();

    // Status badges section
    content.appendChild(buildDetailSection('Estado', [
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
            el('span', { className: 'status-badge ' + (statusInfo.cls || 'new'), textContent: statusInfo.label }),
            el('span', { className: 'status-badge ' + (approvalInfo.cls || 'pending'), textContent: approvalInfo.label })
        ])
    ]));

    // ── Approve / Reject Actions ──
    if (order.approvalStatus === 'pending_review') {
        var approveBtn = el('button', { className: 'action-btn approve' }, [
            el('svg', {}),
            el('span', { textContent: 'Aprobar' })
        ]);
        // SVG for approve button
        approveBtn.querySelector('svg').outerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
        approveBtn.addEventListener('click', function() { handleApproveOrder(order); });

        var rejectBtn = el('button', { className: 'action-btn reject' }, [
            el('svg', {}),
            el('span', { textContent: 'Rechazar' })
        ]);
        rejectBtn.querySelector('svg').outerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        rejectBtn.addEventListener('click', function() { handleRejectOrder(order); });

        content.appendChild(el('div', { className: 'action-bar' }, [approveBtn, rejectBtn]));
    }

    // Client section
    content.appendChild(buildDetailSection('Cliente', [
        buildDetailRow('Nombre', order.clientName || '—'),
        buildDetailRow('Teléfono', order.clientPhone || '—'),
        buildDetailRow('Ciudad', order.clientCity || '—'),
        buildDetailRow('Estado', order.clientState || '—'),
    ]));

    // ── Payment Section ──
    var depositStatus = order.depositPaid ? 'Pagado' : 'Pendiente';
    var depositCls = order.depositPaid ? 'approved' : 'pending';
    var remaining = Math.max(0, (Number(order.totalPrice) || 0) - (Number(order.depositAmount) || 0));

    var paymentRows = [
        el('div', { className: 'detail-row' }, [
            el('span', { className: 'detail-key', textContent: 'Anticipo' }),
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                el('span', { className: 'detail-value', textContent: formatMoney(order.depositAmount) }),
                el('span', { className: 'status-badge ' + depositCls, textContent: depositStatus })
            ])
        ]),
        buildDetailRow('Restante', formatMoney(remaining)),
    ];

    // Payment proof link
    if (order.paymentProofUrl) {
        var proofLink = el('a', {
            className: 'payment-proof-link',
            href: order.paymentProofUrl,
            target: '_blank',
            textContent: 'Ver comprobante anticipo'
        });
        paymentRows.push(el('div', { className: 'detail-row' }, [
            el('span', { className: 'detail-key', textContent: 'Comprobante' }),
            proofLink
        ]));
    }

    // Second payment proof
    if (order.secondPaymentProofUrl) {
        var proof2Link = el('a', {
            className: 'payment-proof-link',
            href: order.secondPaymentProofUrl,
            target: '_blank',
            textContent: 'Ver comprobante final'
        });
        paymentRows.push(el('div', { className: 'detail-row' }, [
            el('span', { className: 'detail-key', textContent: '2do Pago' }),
            proof2Link
        ]));
    }

    // Confirm second payment button (if order approved but not delivered and has second proof)
    if (order.approvalStatus === 'approved' && order.status !== 'Delivered' && order.secondPaymentProofUrl) {
        var confirmBtn = el('button', { className: 'action-btn approve full-width' }, [
            el('span', { textContent: 'Confirmar 2do Pago' })
        ]);
        confirmBtn.addEventListener('click', function() { handleConfirmSecondPayment(order); });
        paymentRows.push(confirmBtn);
    }

    content.appendChild(buildDetailSection('Pagos', paymentRows));

    // Financial section
    var totalVal = el('span', { className: 'detail-value', textContent: formatMoney(order.totalPrice) });
    totalVal.style.fontSize = '16px';
    totalVal.style.fontWeight = '700';
    var profitVal = el('span', { className: 'detail-value', textContent: formatMoney(order.profit) });
    profitVal.style.color = 'var(--verde)';

    content.appendChild(buildDetailSection('Financiero', [
        el('div', { className: 'detail-row' }, [el('span', { className: 'detail-key', textContent: 'Total' }), totalVal]),
        buildDetailRow('Costo Prod.', formatMoney(order.productionCost)),
        el('div', { className: 'detail-row' }, [el('span', { className: 'detail-key', textContent: 'Utilidad' }), profitVal]),
    ]));

    // Items
    if (order.items && order.items.length > 0) {
        var itemChildren = [];
        order.items.forEach(function(item) {
            itemChildren.push(el('div', { className: 'detail-item-card' }, [
                el('div', { className: 'detail-item-name', textContent: item.productName || 'Producto' }),
                el('div', { className: 'detail-item-meta' }, [
                    el('span', { textContent: item.quantity + ' pzas × ' + formatMoney(item.unitPrice) }),
                    el('span', { style: { fontWeight: '600' }, textContent: formatMoney(item.lineTotal) })
                ])
            ]));
        });
        content.appendChild(buildDetailSection('Productos (' + order.items.length + ')', itemChildren));
    }

    // Shipping
    if (order.trackingNumber || order.carrier) {
        var shippingRows = [];
        if (order.carrier) shippingRows.push(buildDetailRow('Paquetería', order.carrier));
        if (order.trackingNumber) shippingRows.push(buildDetailRow('Guía', order.trackingNumber));
        if (order.shippingCost) shippingRows.push(buildDetailRow('Costo', formatMoney(order.shippingCost)));
        content.appendChild(buildDetailSection('Envío', shippingRows));
    }

    // Dates
    var dateRows = [buildDetailRow('Creado', formatDate(order.createdAt))];
    if (order.eventDate) dateRows.push(buildDetailRow('Evento', formatDate(order.eventDate)));
    if (order.productionDeadline) dateRows.push(buildDetailRow('Deadline', formatDate(order.productionDeadline)));
    if (order.deliveryDate) dateRows.push(buildDetailRow('Entrega', formatDate(order.deliveryDate)));
    content.appendChild(buildDetailSection('Fechas', dateRows));

    // Notes
    if (order.notes || order.internalNotes) {
        var noteChildren = [];
        if (order.notes) {
            var np = el('p', { textContent: order.notes });
            np.style.fontSize = '13px';
            np.style.color = 'var(--text-secondary)';
            np.style.marginBottom = '8px';
            noteChildren.push(np);
        }
        if (order.internalNotes) {
            var ip = el('p', { textContent: order.internalNotes });
            ip.style.fontSize = '13px';
            ip.style.color = 'var(--muted)';
            ip.style.fontStyle = 'italic';
            noteChildren.push(ip);
        }
        content.appendChild(buildDetailSection('Notas', noteChildren));
    }

    sheet.classList.add('active');
}

// ── Approve/Reject Handlers ──
async function handleApproveOrder(order) {
    var depositAmount = Number(order.depositAmount) || (Number(order.totalPrice) * 0.5);
    if (!confirm('¿Aprobar pedido #' + (order.orderNumber || order.id) + '?\nAnticipo: ' + formatMoney(depositAmount))) return;

    try {
        var resp = await apiFetch('/orders/' + order.id + '/approve', {
            method: 'POST',
            body: JSON.stringify({ actualDepositAmount: depositAmount })
        });
        if (resp.success) {
            order.approvalStatus = 'approved';
            order.status = 'in_production';
            order.depositPaid = true;
            showOrderDetail(order);
            loadAllData();
            showToast('Pedido aprobado');
        } else {
            showToast(resp.message || 'Error al aprobar', true);
        }
    } catch(e) {
        showToast('Error de conexión', true);
    }
}

async function handleRejectOrder(order) {
    var reason = prompt('Razón del rechazo (opcional):');
    if (reason === null) return; // cancelled

    try {
        var resp = await apiFetch('/orders/' + order.id + '/reject', {
            method: 'POST',
            body: JSON.stringify({ reason: reason || '' })
        });
        if (resp.success) {
            order.approvalStatus = 'rejected';
            order.status = 'Cancelled';
            showOrderDetail(order);
            loadAllData();
            showToast('Pedido rechazado');
        } else {
            showToast(resp.message || 'Error al rechazar', true);
        }
    } catch(e) {
        showToast('Error de conexión', true);
    }
}

async function handleConfirmSecondPayment(order) {
    if (!confirm('¿Confirmar segundo pago de #' + (order.orderNumber || order.id) + '?')) return;

    try {
        var resp = await apiFetch('/orders/' + order.id + '/confirm-second-payment', { method: 'POST' });
        if (resp.success) {
            order.status = 'Delivered';
            showOrderDetail(order);
            loadAllData();
            showToast('Pago confirmado — pedido completado');
        } else {
            showToast(resp.message || 'Error', true);
        }
    } catch(e) {
        showToast('Error de conexión', true);
    }
}

// ── Toast notification ──
function showToast(msg, isError) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = el('div', { className: 'toast' + (isError ? ' error' : '') }, [
        el('span', { textContent: msg })
    ]);
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('visible'); }, 10);
    setTimeout(function() {
        toast.classList.remove('visible');
        setTimeout(function() { toast.remove(); }, 300);
    }, 2500);
}

function buildDetailSection(title, children) {
    return el('div', { className: 'detail-section' }, [
        el('div', { className: 'detail-section-title', textContent: title })
    ].concat(children || []));
}

function buildDetailRow(key, value) {
    return el('div', { className: 'detail-row' }, [
        el('span', { className: 'detail-key', textContent: key }),
        el('span', { className: 'detail-value', textContent: value })
    ]);
}

function hideOrderDetail() {
    $('#order-detail').classList.remove('active');
}

// ── Render: WhatsApp ──
function renderWhatsApp() {
    var listEl = $('#wa-conversations');
    var emptyEl = $('#wa-empty');
    listEl.replaceChildren();

    var filtered = waConversations.slice();

    // Search filter
    if (waSearchTerm) {
        var s = waSearchTerm.toLowerCase();
        filtered = filtered.filter(function(c) {
            return (c.client_name || '').toLowerCase().indexOf(s) >= 0 ||
                   (c.wa_id || '').indexOf(s) >= 0;
        });
    }

    // Sort: pinned first, then by last_message_at desc
    filtered.sort(function(a, b) {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at);
    });

    if (filtered.length === 0) {
        emptyEl.classList.remove('hidden');
    } else {
        emptyEl.classList.add('hidden');
        filtered.forEach(function(conv) {
            listEl.appendChild(buildConvCard(conv));
        });
    }
}

function buildConvCard(conv) {
    var unread = conv.unread_count || 0;
    var lastMsg = conv.last_message || '';
    var lastTime = conv.last_message_at ? formatTimeAgo(conv.last_message_at) : '';

    // Truncate last message
    if (lastMsg.length > 60) lastMsg = lastMsg.substring(0, 60) + '...';

    var nameEl = el('span', { className: 'wa-conv-name', textContent: conv.client_name || conv.wa_id || 'Desconocido' });

    var topRow = el('div', { className: 'wa-conv-top' }, [
        nameEl,
        el('span', { className: 'wa-conv-time' + (unread > 0 ? ' unread' : ''), textContent: lastTime })
    ]);

    var bottomChildren = [
        el('span', { className: 'wa-conv-preview', textContent: lastMsg || 'Sin mensajes' })
    ];

    if (unread > 0) {
        bottomChildren.push(el('span', { className: 'wa-conv-badge', textContent: String(unread > 99 ? '99+' : unread) }));
    }

    var bottomRow = el('div', { className: 'wa-conv-bottom' }, bottomChildren);

    var indicators = [];
    if (conv.is_pinned) {
        var pin = el('span', { className: 'wa-conv-pin' });
        pin.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>';
        indicators.push(pin);
    }
    if (!conv.ai_enabled) {
        indicators.push(el('span', { className: 'wa-conv-ai-off', textContent: 'AI OFF' }));
    }

    var card = el('div', { className: 'wa-conv-card' + (unread > 0 ? ' has-unread' : '') }, [
        el('div', { className: 'wa-conv-avatar', textContent: getInitials(conv.client_name || conv.wa_id || '?') }),
        el('div', { className: 'wa-conv-body' }, [
            topRow,
            bottomRow,
            indicators.length > 0 ? el('div', { className: 'wa-conv-indicators' }, indicators) : null
        ].filter(Boolean))
    ]);

    card.addEventListener('click', function() {
        openWaChat(conv);
    });

    return card;
}

function getInitials(name) {
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function formatTimeAgo(dateStr) {
    var d = new Date(dateStr);
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    var diffHr = Math.floor(diffMs / 3600000);
    var diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return diffMin + 'min';
    if (diffHr < 24) return diffHr + 'h';
    if (diffDay < 7) return diffDay + 'd';
    return formatDate(dateStr);
}

function updateWaBadge() {
    var total = 0;
    waConversations.forEach(function(c) { total += (c.unread_count || 0); });
    var badge = $('#wa-tab-badge');
    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ── WhatsApp Chat View ──
async function openWaChat(conv) {
    waCurrentConv = conv;
    $('#wa-chat-name').textContent = conv.client_name || conv.wa_id || 'Desconocido';
    $('#wa-chat-status').textContent = conv.ai_enabled ? 'AI activo' : 'AI pausado';
    updateAiToggleBtn(conv.ai_enabled);

    // Show chat sheet
    $('#wa-chat').classList.add('active');

    // Show loading
    var msgContainer = $('#wa-messages');
    msgContainer.replaceChildren();
    msgContainer.appendChild(el('div', { className: 'wa-loading' }, [
        el('span'), el('span'), el('span')
    ]));

    // Load messages
    try {
        var resp = await apiFetch('/whatsapp/conversations/' + conv.id + '/messages');
        if (resp.success) {
            waCurrentMessages = resp.data || [];
            renderWaMessages();

            // Mark as read
            if (conv.unread_count > 0) {
                conv.unread_count = 0;
                apiFetch('/whatsapp/conversations/' + conv.id + '/read', { method: 'PUT' });
                updateWaBadge();
                renderWhatsApp();
            }
        }
    } catch(e) {
        msgContainer.replaceChildren();
        msgContainer.appendChild(el('div', { className: 'wa-error', textContent: 'Error al cargar mensajes' }));
    }

    // Start polling for new messages
    startWaPolling();
}

function closeWaChat() {
    $('#wa-chat').classList.remove('active');
    waCurrentConv = null;
    waCurrentMessages = [];
    stopWaPolling();
}

function startWaPolling() {
    stopWaPolling();
    waPollingTimer = setInterval(async function() {
        if (!waCurrentConv) return;
        try {
            var resp = await apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/messages');
            if (resp.success && resp.data) {
                var newCount = resp.data.length;
                var oldCount = waCurrentMessages.length;
                if (newCount !== oldCount) {
                    waCurrentMessages = resp.data;
                    renderWaMessages();
                    // Mark as read
                    apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/read', { method: 'PUT' });
                }
            }
        } catch(e) { /* silent */ }
    }, 5000);
}

function stopWaPolling() {
    if (waPollingTimer) {
        clearInterval(waPollingTimer);
        waPollingTimer = null;
    }
}

function renderWaMessages() {
    var container = $('#wa-messages');
    container.replaceChildren();

    if (waCurrentMessages.length === 0) {
        container.appendChild(el('div', { className: 'wa-no-messages', textContent: 'Sin mensajes aún' }));
        return;
    }

    var lastDate = '';
    waCurrentMessages.forEach(function(msg) {
        // Date separator
        var msgDate = msg.created_at ? new Date(msg.created_at).toLocaleDateString('es-MX') : '';
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            container.appendChild(el('div', { className: 'wa-date-sep' }, [
                el('span', { textContent: formatDateLabel(msg.created_at) })
            ]));
        }

        var isOutbound = msg.direction === 'outbound';
        var bubbleCls = 'wa-bubble ' + (isOutbound ? 'outbound' : 'inbound');

        // Sender tag for outbound
        var senderTag = null;
        if (isOutbound && msg.sender === 'ai') {
            senderTag = el('span', { className: 'wa-sender-tag ai', textContent: 'AI' });
        } else if (isOutbound && msg.sender === 'admin') {
            senderTag = el('span', { className: 'wa-sender-tag admin', textContent: 'Admin' });
        }

        var bubbleChildren = [];
        if (senderTag) bubbleChildren.push(senderTag);

        // Media content
        if (msg.message_type === 'image' && msg.media_url) {
            var img = el('img', { className: 'wa-bubble-img', src: msg.media_url, alt: 'Imagen' });
            img.addEventListener('click', function() { window.open(msg.media_url, '_blank'); });
            bubbleChildren.push(img);
        }

        if (msg.message_type === 'audio') {
            var audioUrl = msg.media_url || (msg.metadata && msg.metadata.cloudinaryUrl) || '';
            if (audioUrl) {
                var audioEl = document.createElement('audio');
                audioEl.controls = true;
                audioEl.preload = 'none';
                audioEl.className = 'wa-audio-player';
                var source = document.createElement('source');
                source.src = audioUrl;
                source.type = 'audio/ogg';
                audioEl.appendChild(source);
                var source2 = document.createElement('source');
                source2.src = audioUrl;
                source2.type = 'audio/mpeg';
                audioEl.appendChild(source2);
                bubbleChildren.push(audioEl);
            }
            if (msg.metadata && msg.metadata.transcription) {
                bubbleChildren.push(el('span', { className: 'wa-audio-tag', textContent: '📝 ' + msg.metadata.transcription }));
            }
        }

        if (msg.message_type === 'location' && msg.metadata) {
            bubbleChildren.push(el('span', { className: 'wa-location-tag', textContent: '📍 ' + (msg.metadata.name || msg.metadata.address || 'Ubicación') }));
        }

        if (msg.message_type === 'document') {
            bubbleChildren.push(el('span', { className: 'wa-doc-tag', textContent: '📄 Documento' }));
        }

        if (msg.message_type === 'sticker') {
            if (msg.media_url) {
                bubbleChildren.push(el('img', { className: 'wa-bubble-sticker', src: msg.media_url, alt: 'Sticker' }));
            } else {
                bubbleChildren.push(el('span', { textContent: '🏷️ Sticker' }));
            }
        }

        // Text content
        if (msg.content) {
            bubbleChildren.push(el('span', { className: 'wa-bubble-text', textContent: msg.content }));
        }

        // Time
        var time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
        bubbleChildren.push(el('span', { className: 'wa-bubble-time', textContent: time }));

        container.appendChild(el('div', { className: bubbleCls }, bubbleChildren));
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function formatDateLabel(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var now = new Date();
    var diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function sendWaReply() {
    if (waSending || !waCurrentConv) return;
    var input = $('#wa-reply-input');
    var text = input.value.trim();
    if (!text) return;

    waSending = true;
    $('#wa-send-btn').disabled = true;
    input.value = '';

    // Optimistic add
    var tempMsg = {
        id: 'temp_' + Date.now(),
        direction: 'outbound',
        sender: 'admin',
        message_type: 'text',
        content: text,
        created_at: new Date().toISOString()
    };
    waCurrentMessages.push(tempMsg);
    renderWaMessages();

    try {
        var resp = await apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/reply', {
            method: 'POST',
            body: JSON.stringify({ message: text })
        });
        if (!resp.success) {
            // Remove temp message on failure
            waCurrentMessages = waCurrentMessages.filter(function(m) { return m.id !== tempMsg.id; });
            renderWaMessages();
            alert('Error al enviar: ' + (resp.error || 'desconocido'));
        }
    } catch(e) {
        waCurrentMessages = waCurrentMessages.filter(function(m) { return m.id !== tempMsg.id; });
        renderWaMessages();
    }

    waSending = false;
    $('#wa-send-btn').disabled = false;
    input.focus();
}

function updateAiToggleBtn(enabled) {
    var btn = $('#wa-ai-toggle');
    btn.classList.toggle('active', enabled);
    btn.title = enabled ? 'AI activo — click para pausar' : 'AI pausado — click para activar';
    $('#wa-chat-status').textContent = enabled ? 'AI activo' : 'AI pausado';
}

async function toggleWaAi() {
    if (!waCurrentConv) return;
    var newVal = !waCurrentConv.ai_enabled;
    updateAiToggleBtn(newVal);
    waCurrentConv.ai_enabled = newVal;

    try {
        await apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/settings', {
            method: 'PATCH',
            body: JSON.stringify({ ai_enabled: newVal })
        });
    } catch(e) {
        waCurrentConv.ai_enabled = !newVal;
        updateAiToggleBtn(!newVal);
    }
}

// ── WhatsApp: Pin / Archive ──
async function toggleWaPin() {
    if (!waCurrentConv) return;
    var newVal = !waCurrentConv.is_pinned;
    try {
        var resp = await apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/pin', {
            method: 'PATCH',
            body: JSON.stringify({ is_pinned: newVal })
        });
        if (resp.success) {
            waCurrentConv.is_pinned = newVal;
            showToast(newVal ? 'Fijado' : 'Desfijado');
            renderWhatsApp();
        }
    } catch(e) { showToast('Error', true); }
}

async function toggleWaArchive() {
    if (!waCurrentConv) return;
    var newVal = !waCurrentConv.is_archived;
    try {
        var resp = await apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/archive', {
            method: 'PATCH',
            body: JSON.stringify({ is_archived: newVal })
        });
        if (resp.success) {
            waCurrentConv.is_archived = newVal;
            showToast(newVal ? 'Archivado' : 'Desarchivado');
            if (newVal) closeWaChat(); // go back to list
            renderWhatsApp();
        }
    } catch(e) { showToast('Error', true); }
}

// ── WhatsApp: Labels ──
function showWaLabelPicker() {
    if (!waCurrentConv) return;
    var overlay = document.querySelector('.wa-label-overlay');
    if (overlay) { overlay.remove(); return; }

    var convLabels = (waCurrentConv.labels || []).map(function(l) { return l.id || l; });

    overlay = el('div', { className: 'wa-label-overlay' });
    var panel = el('div', { className: 'wa-label-panel' });

    panel.appendChild(el('div', { className: 'wa-label-panel-title', textContent: 'Etiquetas' }));

    if (waLabels.length === 0) {
        panel.appendChild(el('p', { style: { fontSize: '13px', color: 'var(--muted)', padding: '12px' }, textContent: 'Sin etiquetas. Crea una desde el dashboard.' }));
    } else {
        waLabels.forEach(function(label) {
            var isActive = convLabels.indexOf(label.id) >= 0;
            var dot = el('div', { className: 'wa-label-dot' });
            dot.style.background = label.color || '#999';

            var row = el('div', { className: 'wa-label-row' + (isActive ? ' active' : '') }, [
                dot,
                el('span', { textContent: label.name }),
                isActive ? el('span', { className: 'wa-label-check', textContent: '✓' }) : null
            ].filter(Boolean));

            row.addEventListener('click', function() {
                toggleWaLabel(label.id, !isActive);
                overlay.remove();
            });
            panel.appendChild(row);
        });
    }

    var closeBtn = el('button', { className: 'wa-label-close', textContent: 'Cerrar' });
    closeBtn.addEventListener('click', function() { overlay.remove(); });
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

async function toggleWaLabel(labelId, add) {
    if (!waCurrentConv) return;
    try {
        if (add) {
            await apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/labels/' + labelId, { method: 'POST' });
            if (!waCurrentConv.labels) waCurrentConv.labels = [];
            waCurrentConv.labels.push({ id: labelId });
            showToast('Etiqueta agregada');
        } else {
            await apiFetch('/whatsapp/conversations/' + waCurrentConv.id + '/labels/' + labelId, { method: 'DELETE' });
            waCurrentConv.labels = (waCurrentConv.labels || []).filter(function(l) { return (l.id || l) !== labelId; });
            showToast('Etiqueta removida');
        }
        renderWhatsApp();
    } catch(e) { showToast('Error', true); }
}

// ── WhatsApp: Quick Reply Templates ──
function showWaTemplates() {
    if (!waCurrentConv) return;
    var overlay = document.querySelector('.wa-tpl-overlay');
    if (overlay) { overlay.remove(); return; }

    overlay = el('div', { className: 'wa-label-overlay' });
    var panel = el('div', { className: 'wa-label-panel' });

    panel.appendChild(el('div', { className: 'wa-label-panel-title', textContent: 'Respuestas Rápidas' }));

    // Built-in quick replies
    var quickReplies = [
        { name: 'Saludo', text: '¡Hola! Gracias por contactarnos. ¿En qué te puedo ayudar?' },
        { name: 'Precios', text: 'Con gusto te paso los precios. ¿Qué tipo de producto te interesa y cuántas piezas necesitas?' },
        { name: 'Pago recibido', text: '¡Listo! Ya recibimos tu pago. Te mantengo al tanto del avance.' },
        { name: 'En producción', text: 'Tu pedido ya está en producción. Te aviso cuando esté listo para envío.' },
        { name: 'Enviado', text: '¡Tu pedido va en camino! Te paso la guía de rastreo en un momento.' },
    ];

    // Add backend templates
    waTemplates.forEach(function(tpl) {
        quickReplies.push({ name: tpl.name, text: tpl.body || tpl.body_text || '' });
    });

    quickReplies.forEach(function(qr) {
        var row = el('div', { className: 'wa-tpl-row' }, [
            el('span', { className: 'wa-tpl-name', textContent: qr.name }),
            el('span', { className: 'wa-tpl-preview', textContent: qr.text.substring(0, 50) + (qr.text.length > 50 ? '...' : '') })
        ]);
        row.addEventListener('click', function() {
            $('#wa-reply-input').value = qr.text;
            $('#wa-reply-input').focus();
            overlay.remove();
        });
        panel.appendChild(row);
    });

    var closeBtn = el('button', { className: 'wa-label-close', textContent: 'Cerrar' });
    closeBtn.addEventListener('click', function() { overlay.remove(); });
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// ── Render: Tasks ──
function renderTasks() {
    // Stats
    var statsEl = $('#task-stats');
    statsEl.replaceChildren();

    if (taskStats && taskStats.stats) {
        var s = taskStats.stats;
        var statItems = [
            { num: s.urgent || 0, label: 'Urgentes' },
            { num: s.in_progress || 0, label: 'En proceso' },
            { num: s.pending || 0, label: 'Pendientes' },
            { num: s.blocked || 0, label: 'Bloqueados' },
        ];
        statItems.forEach(function(item) {
            statsEl.appendChild(el('div', { className: 'task-stat-mini' }, [
                el('div', { className: 'task-stat-num', textContent: String(item.num) }),
                el('div', { className: 'task-stat-label', textContent: item.label })
            ]));
        });
    }

    // Task list
    var filtered = allTasks.slice();
    if (currentTaskFilter !== 'all') {
        filtered = filtered.filter(function(t) { return t.status === currentTaskFilter; });
    }

    var priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    filtered.sort(function(a, b) {
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });

    var listEl = $('#tasks-list');
    var emptyEl = $('#tasks-empty');
    listEl.replaceChildren();

    if (filtered.length === 0) {
        emptyEl.classList.remove('hidden');
    } else {
        emptyEl.classList.add('hidden');
        filtered.forEach(function(t, i) {
            listEl.appendChild(buildTaskCard(t, i));
        });
    }
}

function buildTaskCard(task, index) {
    var statusLabels = {
        pending: 'Pendiente', in_progress: 'En Proceso', completed: 'Completado',
        blocked: 'Bloqueado', cancelled: 'Cancelado'
    };

    var statusCls = task.status === 'in_progress' ? 'production' :
                    task.status === 'completed' ? 'delivered' :
                    task.status === 'blocked' ? 'cancelled' : 'pending';

    var metaItems = [
        el('span', { className: 'task-meta-item' }, [
            el('span', { className: 'status-badge ' + statusCls, textContent: statusLabels[task.status] || task.status })
        ])
    ];

    if (task.department) metaItems.push(el('span', { className: 'task-meta-item', textContent: task.department }));
    if (task.assigned_to_name) metaItems.push(el('span', { className: 'task-meta-item', textContent: '→ ' + task.assigned_to_name }));
    if (task.order_number) metaItems.push(el('span', { className: 'task-meta-item', textContent: '#' + task.order_number }));
    if (task.due_date) metaItems.push(el('span', { className: 'task-meta-item', textContent: '⏱ ' + formatDate(task.due_date) }));

    // Style the status badge smaller
    if (metaItems[0]) {
        var badge = metaItems[0].querySelector('.status-badge');
        if (badge) {
            badge.style.fontSize = '9px';
            badge.style.padding = '2px 6px';
        }
    }

    var card = el('div', { className: 'task-card' }, [
        el('div', { className: 'task-card-top' }, [
            el('span', { className: 'task-title', textContent: task.title || '' }),
            el('span', { className: 'task-priority ' + (task.priority || 'normal'), textContent: (task.priority || 'normal').toUpperCase() })
        ]),
        el('div', { className: 'task-meta' }, metaItems)
    ]);
    card.style.animationDelay = (index * 0.04) + 's';
    return card;
}

// ── Navigation ──
function switchView(viewName) {
    $$('.view').forEach(function(v) { v.classList.remove('active'); });
    $$('.tab').forEach(function(t) { t.classList.remove('active'); });
    $('#view-' + viewName).classList.add('active');
    $('.tab[data-view="' + viewName + '"]').classList.add('active');
    hideOrderDetail();
    if (viewName === 'ai') renderAIChat();
    if (viewName === 'whatsapp') {
        renderWhatsApp();
        closeWaChat();
    } else {
        stopWaPolling();
    }
}

// ── Event Binding ──
// ── Push Notifications ──

async function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    try {
        var reg = await navigator.serviceWorker.ready;

        // Check if already subscribed
        var existing = await reg.pushManager.getSubscription();
        if (existing) return; // Already subscribed

        // Fetch VAPID public key from backend
        var keyResp = await apiFetch('/push/vapid-public-key');
        if (!keyResp.success || !keyResp.publicKey) return;

        // Request permission
        var permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Subscribe
        var sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyResp.publicKey)
        });

        // Send subscription to backend
        await fetch(API + '/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON() })
        });

        console.log('Push notifications enabled');
    } catch(err) {
        console.error('Push setup failed:', err);
    }
}

function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// ── AI Chat ──

function renderAIChat() {
    if (aiInitialized) return;
    aiInitialized = true;

    var container = $('#ai-chat-messages');
    // Welcome message — static SVG icon (no user data)
    var welcomeIcon = el('div', { className: 'ai-welcome-icon' });
    welcomeIcon.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--rosa)" stroke-width="2"><path d="M12 2a7 7 0 0 0-7 7c0 2.9 1.8 5.4 4.3 6.5l.7.3V18h4v-2.2l.7-.3C18.2 14.4 19 11.9 19 9a7 7 0 0 0-7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>';

    var welcome = el('div', { className: 'ai-welcome' }, [
        welcomeIcon,
        el('h3', {}, ['AXKAN AI']),
        el('p', {}, ['Pregúntame sobre pedidos, ventas, clientes o la marca.'])
    ]);
    container.appendChild(welcome);

    // Render chips
    var chipsContainer = $('#ai-chips');
    AI_CHIPS.forEach(function(chip) {
        var btn = el('button', { className: 'ai-chip' }, [chip.label]);
        btn.addEventListener('click', function() {
            if (!aiIsTyping) sendAIMessage(chip.msg);
        });
        chipsContainer.appendChild(btn);
    });
}

function appendAIMessage(role, content) {
    var container = $('#ai-chat-messages');
    var msgEl = el('div', { className: 'ai-msg ' + role });

    if (role === 'assistant' || role === 'error') {
        // Parse simple markdown-like formatting
        var lines = content.split('\n');
        lines.forEach(function(line, i) {
            if (i > 0) msgEl.appendChild(document.createElement('br'));
            // Bold text between **
            var parts = line.split(/\*\*(.*?)\*\*/g);
            parts.forEach(function(part, j) {
                if (j % 2 === 1) {
                    msgEl.appendChild(el('strong', {}, [safeText(part)]));
                } else {
                    msgEl.appendChild(document.createTextNode(safeText(part)));
                }
            });
        });
    } else {
        msgEl.appendChild(document.createTextNode(safeText(content)));
    }

    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
    return msgEl;
}

function showAITyping() {
    var container = $('#ai-chat-messages');
    var typing = el('div', { className: 'ai-typing', id: 'ai-typing-indicator' }, [
        el('span'), el('span'), el('span')
    ]);
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
}

function hideAITyping() {
    var indicator = $('#ai-typing-indicator');
    if (indicator) indicator.remove();
}

async function sendAIMessage(text) {
    if (aiIsTyping || !text.trim()) return;

    // Remove welcome message on first send
    var welcome = document.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    // Add user message
    appendAIMessage('user', text);
    aiMessages.push({ role: 'user', content: text });

    // Show typing
    aiIsTyping = true;
    $('#ai-send-btn').disabled = true;
    showAITyping();

    try {
        var response = await apiFetch('/ai-assistant/mobile-chat', {
            method: 'POST',
            body: JSON.stringify({
                message: text,
                sessionId: aiSessionId,
                history: aiMessages.slice(-10)
            })
        });

        hideAITyping();

        if (response.success && response.data) {
            // Show tool tags if tools were used
            var msgText = response.data.message;
            appendAIMessage('assistant', msgText);
            aiMessages.push({ role: 'assistant', content: msgText });
        } else {
            appendAIMessage('error', response.error || 'Error al procesar la consulta');
        }
    } catch (e) {
        hideAITyping();
        appendAIMessage('error', 'Error de conexión. Intenta de nuevo.');
    }

    aiIsTyping = false;
    $('#ai-send-btn').disabled = false;
}

// ── Init ──

function init() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(function(reg) {
            console.log('SW registered:', reg.scope);
        }).catch(function(err) {
            console.error('SW registration failed:', err);
        });
    }

    // Login
    $('#login-form').addEventListener('submit', handleLogin);

    // Tabs
    $$('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() { switchView(tab.dataset.view); });
    });

    // Order filters
    $$('#status-filters .chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            $$('#status-filters .chip').forEach(function(c) { c.classList.remove('active'); });
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            renderOrders();
        });
    });

    // Task filters
    $$('#task-filters .chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            $$('#task-filters .chip').forEach(function(c) { c.classList.remove('active'); });
            chip.classList.add('active');
            currentTaskFilter = chip.dataset.filter;
            renderTasks();
        });
    });

    // Search
    var searchDebounce;
    $('#order-search').addEventListener('input', function() {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function() { renderOrders(); }, 200);
    });

    // Detail back
    $('#detail-back').addEventListener('click', hideOrderDetail);

    // Refresh
    $('#refresh-btn').addEventListener('click', function() {
        $('#refresh-btn').classList.add('spinning');
        loadAllData().finally(function() {
            setTimeout(function() { $('#refresh-btn').classList.remove('spinning'); }, 600);
        });
    });

    // Logout
    $('#logout-btn').addEventListener('click', logout);

    // AI chat
    $('#ai-send-btn').addEventListener('click', function() {
        var text = $('#ai-input').value.trim();
        if (text && !aiIsTyping) {
            sendAIMessage(text);
            $('#ai-input').value = '';
        }
    });
    $('#ai-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            var text = this.value.trim();
            if (text && !aiIsTyping) {
                sendAIMessage(text);
                this.value = '';
            }
        }
    });

    // WhatsApp
    $('#wa-chat-back').addEventListener('click', closeWaChat);
    $('#wa-send-btn').addEventListener('click', sendWaReply);
    $('#wa-reply-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendWaReply();
    });
    $('#wa-ai-toggle').addEventListener('click', toggleWaAi);
    $('#wa-pin-btn').addEventListener('click', toggleWaPin);
    $('#wa-archive-btn').addEventListener('click', toggleWaArchive);
    $('#wa-label-btn').addEventListener('click', showWaLabelPicker);
    $('#wa-tpl-btn').addEventListener('click', showWaTemplates);
    var waSearchDebounce;
    $('#wa-search').addEventListener('input', function() {
        clearTimeout(waSearchDebounce);
        waSearchDebounce = setTimeout(function() {
            waSearchTerm = $('#wa-search').value.trim();
            renderWhatsApp();
        }, 200);
    });

    // Online/offline
    window.addEventListener('online', function() { updateConnectionStatus(true); });
    window.addEventListener('offline', function() { updateConnectionStatus(false); });

    // Start
    checkAuth();
}

document.addEventListener('DOMContentLoaded', init);

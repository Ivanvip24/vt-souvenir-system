/**
 * AI Assistant - Universal Business Knowledge Chatbot
 * Powered by Claude API
 */

// Session management
let aiSessionId = localStorage.getItem('ai_session_id') || generateSessionId();
localStorage.setItem('ai_session_id', aiSessionId);

// Track mini chart instances for cleanup
let miniChartInstances = [];

// Current action data for confirmation modal
let currentAction = null;

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// =====================================================
// MODAL CONTROLS
// =====================================================

function openAiChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // Focus on chat input
        setTimeout(() => {
            const input = document.getElementById('ai-chat-input');
            if (input) input.focus();
        }, 100);
    }
}

function closeAiChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

function openAiChat(question) {
    openAiChatModal();
    if (question && question.trim()) {
        // Set the question in the chat input
        const input = document.getElementById('ai-chat-input');
        if (input) {
            input.value = question;
        }
        // Clear the header input
        const headerInput = document.getElementById('ai-assistant-input');
        if (headerInput) {
            headerInput.value = '';
        }
        // Send the message
        sendAiMessage();
    }
}

function sendAiQuestion(question) {
    const input = document.getElementById('ai-chat-input');
    if (input) {
        input.value = question;
    }
    sendAiMessage();
}

function clearAiChat() {
    // Generate new session ID to clear history on backend
    aiSessionId = generateSessionId();
    localStorage.setItem('ai_session_id', aiSessionId);

    // Destroy any existing mini charts
    miniChartInstances.forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    miniChartInstances = [];

    // Clear chat messages UI
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="ai-message assistant">
                <div class="ai-message-avatar">🤖</div>
                <div class="ai-message-content">
                    <p>¡Hola! Soy tu asistente de AXKAN. Puedo ayudarte con:</p>
                    <div class="ai-suggestions">
                        <button class="ai-suggestion-btn" onclick="sendAiQuestion('¿Cuántos pedidos tenemos pendientes?')">
                            📋 Pedidos pendientes
                        </button>
                        <button class="ai-suggestion-btn" onclick="sendAiQuestion('¿Cuál fue el ingreso de este mes?')">
                            💰 Ingresos del mes
                        </button>
                        <button class="ai-suggestion-btn" onclick="sendAiQuestion('¿Cuáles son los productos más vendidos?')">
                            🏆 Productos top
                        </button>
                        <button class="ai-suggestion-btn" onclick="sendAiQuestion('¿Qué clientes tienen pedidos en producción?')">
                            🏭 En producción
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

// =====================================================
// MESSAGE HANDLING
// =====================================================

async function sendAiMessage() {
    const input = document.getElementById('ai-chat-input');
    const message = input?.value?.trim();

    if (!message) return;

    // Clear input
    input.value = '';

    // Add user message to chat
    addMessageToChat('user', message);

    // Show typing indicator
    showTypingIndicator();

    // Disable send button
    const sendBtn = document.getElementById('ai-send-btn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="ai-loading-dots">...</span>';
    }

    try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE}/ai-assistant/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                message: message,
                sessionId: aiSessionId
            })
        });

        const data = await response.json();

        // Remove typing indicator
        removeTypingIndicator();

        if (data.success) {
            // Add assistant message
            addMessageToChat('assistant', data.data.message, data.data);

            // Handle any action from the AI
            if (data.data.action) {
                handleAiAction(data.data.action);
            }
        } else {
            addMessageToChat('assistant', `Lo siento, hubo un error: ${data.error}`, { error: true });
        }
    } catch (error) {
        console.error('AI Assistant error:', error);
        removeTypingIndicator();
        addMessageToChat('assistant', 'Lo siento, no pude conectar con el servidor. Por favor intenta de nuevo.', { error: true });
    } finally {
        // Re-enable send button
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span>Enviar</span><span class="ai-send-icon">↗</span>';
        }
    }
}

function addMessageToChat(role, content, data = {}) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}`;

    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="ai-message-content user-message">
                <p>${escapeHtml(content)}</p>
            </div>
            <div class="ai-message-avatar user-avatar">👤</div>
        `;
    } else {
        // Parse markdown-like formatting (unless already HTML)
        const formattedContent = data.isHtml ? content : formatAiResponse(content);

        let extraContent = '';

        // Add mini chart if chart data available
        if (data.chartData) {
            const chartId = 'ai-mini-chart-' + Date.now();
            extraContent += `
                <div class="ai-mini-chart-container">
                    <div class="ai-mini-chart-title">${data.chartData.title || 'Gráfico'}</div>
                    <canvas id="${chartId}" class="ai-mini-chart"></canvas>
                </div>
            `;
            // Schedule chart rendering after DOM update
            setTimeout(() => renderMiniChart(chartId, data.chartData), 50);
        }

        // Add quick stats if available
        if (data.quickStats && Object.keys(data.quickStats).length > 0) {
            extraContent += '<div class="ai-quick-stats">';
            for (const [key, value] of Object.entries(data.quickStats)) {
                extraContent += `
                    <div class="ai-stat-card">
                        <span class="ai-stat-value">${value}</span>
                        <span class="ai-stat-label">${key}</span>
                    </div>
                `;
            }
            extraContent += '</div>';
        }

        // Add detected section navigation buttons (keep modal open)
        if (data.detectedSections && data.detectedSections.length > 0) {
            extraContent += '<div class="ai-section-links">';
            data.detectedSections.forEach(section => {
                extraContent += `
                    <button class="ai-section-btn" onclick="navigateToSection('${section.tab}')">
                        ${section.icon} Ver ${section.name}
                    </button>
                `;
            });
            extraContent += '</div>';
        }

        messageDiv.innerHTML = `
            <div class="ai-message-avatar">🤖</div>
            <div class="ai-message-content ${data.error ? 'error-message' : ''}">
                ${formattedContent}
                ${extraContent}
            </div>
        `;
    }

    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message assistant typing-indicator';
    typingDiv.id = 'ai-typing-indicator';
    typingDiv.innerHTML = `
        <div class="ai-message-avatar">🤖</div>
        <div class="ai-message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// =====================================================
// MINI CHART RENDERING
// =====================================================

function renderMiniChart(canvasId, chartData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn('Mini chart canvas not found:', canvasId);
        return;
    }

    // Make sure Chart.js is available
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not available for mini chart');
        return;
    }

    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
        type: chartData.type || 'bar',
        data: {
            labels: chartData.labels || [],
            datasets: [{
                label: chartData.title || 'Datos',
                data: chartData.data || [],
                backgroundColor: chartData.backgroundColor || '#3b82f6',
                borderColor: chartData.borderColor || '#2563eb',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '$' + context.parsed.y.toLocaleString('es-MX', { minimumFractionDigits: 0 });
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { size: 10 },
                        callback: function(value) {
                            if (value >= 1000) {
                                return '$' + (value / 1000).toFixed(0) + 'k';
                            }
                            return '$' + value;
                        }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: { size: 10 }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    // Track for cleanup
    miniChartInstances.push(chart);
}

// =====================================================
// FORMATTING HELPERS
// =====================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatAiResponse(content) {
    // Convert markdown-like syntax to HTML
    let formatted = escapeHtml(content);

    // Bold: **text**
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Bullet points: - item or • item
    formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)+/gs, '<ul>$&</ul>');

    // Numbers: $1,234.56
    formatted = formatted.replace(/\$[\d,]+(\.\d{2})?/g, '<span class="ai-money">$&</span>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return `<p>${formatted}</p>`;
}

// =====================================================
// AI ACTION HANDLING
// =====================================================

/**
 * Handle AI action response
 */
function handleAiAction(action) {
    if (!action) return;

    console.log('🎯 Processing AI action:', action.type);
    currentAction = action;

    if (action.type === 'create_shipping_labels') {
        showShippingLabelModal(action);
    } else if (action.type === 'search_client') {
        // Show client selection in chat
        showClientSelection(action.data.clients, action.data.searchTerm);
    } else if (action.type === 'view_order') {
        // Navigate to order detail
        if (action.data.order) {
            closeAiChatModal();
            showOrderDetail(action.data.order.id);
        }
    } else if (action.type === 'generate_quote') {
        // Show quote result in chat
        showQuoteResult(action.data);
    }
}

/**
 * Show quote generation result in chat
 */
function showQuoteResult(data) {
    if (!data) return;

    let html = '';

    if (data.success) {
        // Format total as currency
        const totalFormatted = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(data.total);

        html = `
            <div class="ai-quote-result">
                <div class="ai-quote-header">
                    <span class="ai-quote-icon">📄</span>
                    <div>
                        <div class="ai-quote-title">Cotización Generada</div>
                        <div class="ai-quote-number">${data.quoteNumber}</div>
                    </div>
                </div>

                <div class="ai-quote-details">
                    ${data.clientName ? `<div class="ai-quote-client">👤 ${escapeHtml(data.clientName)}</div>` : ''}

                    <div class="ai-quote-items">
                        ${(data.items || []).map(item => `
                            <div class="ai-quote-item ${item.isSpecialPrice ? 'special-price' : ''}">
                                <span class="ai-quote-item-name">${item.isSpecialPrice ? '★ ' : ''}${escapeHtml(item.productName || 'Producto')}</span>
                                <span class="ai-quote-item-qty">${(item.quantity || 0).toLocaleString('es-MX')} pzas</span>
                                <span class="ai-quote-item-price">$${(item.unitPrice || 0).toFixed(2)}/u</span>
                                <span class="ai-quote-item-subtotal">$${(item.subtotal || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                            </div>
                        `).join('')}
                    </div>

                    ${data.invalidItems && data.invalidItems.length > 0 ? `
                        <div class="ai-quote-warnings">
                            <div class="ai-quote-warning-title">⚠️ Productos por debajo del mínimo:</div>
                            ${data.invalidItems.map(item => `
                                <div class="ai-quote-warning-item">
                                    ${escapeHtml(item.productName || 'Producto')}: ${item.quantity || 0} pzas (mín. ${item.minimumRequired || 50})
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <div class="ai-quote-total">
                        <span>TOTAL:</span>
                        <span class="ai-quote-total-amount">${totalFormatted}</span>
                    </div>

                    <div class="ai-quote-validity">
                        📅 Válida hasta: ${data.validUntil}
                    </div>
                </div>

                <div class="ai-quote-actions">
                    <a href="${data.pdfUrl}" target="_blank" class="ai-quote-download-btn">
                        📥 Descargar PDF
                    </a>
                    <button onclick="copyQuoteLink('${data.pdfUrl}')" class="ai-quote-copy-btn">
                        📋 Copiar enlace
                    </button>
                </div>
            </div>
        `;
    } else {
        html = `
            <div class="ai-quote-error">
                <span class="ai-quote-error-icon">❌</span>
                <span>${escapeHtml(data.error || 'Error al generar la cotización')}</span>
            </div>
        `;
    }

    addMessageToChat('assistant', html, { isHtml: true });
}

/**
 * Copy quote link to clipboard
 */
function copyQuoteLink(url) {
    const fullUrl = window.location.origin + url;
    navigator.clipboard.writeText(fullUrl).then(() => {
        // Show brief success message
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copiado!';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Error copying link:', err);
        alert('Error al copiar el enlace');
    });
}

// Export quote functions globally
window.showQuoteResult = showQuoteResult;
window.copyQuoteLink = copyQuoteLink;

/**
 * Show shipping label creation modal
 */
function showShippingLabelModal(action) {
    const data = action.data;

    // Check if we have enough data
    if (data.clientNotFound) {
        let errorHtml = `<p>🔍 No encontré resultados exactos para "<strong>${data.searchTerm}</strong>".</p>`;
        errorHtml += `<p style="font-size: 14px; color: #6b7280; margin-top: 8px;">Prueba buscar de otra forma:</p>`;
        errorHtml += `<ul style="font-size: 14px; color: #6b7280; margin-top: 4px;">`;
        errorHtml += `<li>Solo el nombre: "María García"</li>`;
        errorHtml += `<li>Nombre y ciudad: "María Guadalajara"</li>`;
        errorHtml += `<li>Número de teléfono</li>`;
        errorHtml += `<li>Número de pedido: "VT-0045"</li>`;
        errorHtml += `</ul>`;
        addMessageToChat('assistant', errorHtml, { isHtml: true, error: true });
        return;
    }

    if (data.needsClientSelection && data.clientMatches) {
        showClientSelection(data.clientMatches, 'Encontré varios clientes posibles:');
        return;
    }

    // Build modal content
    const client = data.client;
    const order = data.order || data.suggestedOrder;
    const labelsCount = data.labelsCount || 1;
    const searchTerm = data.searchTerm || '';

    let modalHtml = `
        <div id="ai-action-modal" class="ai-action-modal" onclick="closeAiActionModal(event)">
            <div class="ai-action-modal-content" onclick="event.stopPropagation()">
                <div class="ai-action-modal-header">
                    <h3>📦 Crear Guías de Envío</h3>
                    <button onclick="closeAiActionModal()" class="ai-action-close">&times;</button>
                </div>
                <div class="ai-action-modal-body">
    `;

    // If no client found, show search box
    if (!client) {
        modalHtml += `
            <div class="ai-action-section">
                <label>Buscar Cliente</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="ai-client-search" class="ai-action-input"
                           placeholder="Nombre, teléfono o ciudad..."
                           value="${searchTerm}"
                           onkeypress="if(event.key==='Enter') searchClientsForModal()">
                    <button onclick="searchClientsForModal()" class="ai-action-btn primary" style="white-space: nowrap;">
                        🔍 Buscar
                    </button>
                </div>
                <div id="ai-client-search-results" class="ai-client-search-results"></div>
            </div>
        `;
    }

    // Client info (if found)
    if (client) {
        const hasAddress = client.street && client.city && client.state && (client.postal || client.postal_code);
        const postalCode = client.postal || client.postal_code || '';
        modalHtml += `
            <div class="ai-action-section">
                <label>Cliente</label>
                <div class="ai-action-info-box">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <strong>${client.name}</strong>
                            ${client.city ? `<div style="font-size: 13px; color: #059669; margin-top: 2px;">📍 ${client.city}${client.state ? ', ' + client.state : ''}</div>` : ''}
                        </div>
                        ${client.phone ? `<div style="font-size: 13px; color: #6b7280;">📱 ${client.phone}</div>` : ''}
                    </div>
                </div>
            </div>

            <div class="ai-action-section">
                <label>Dirección de envío</label>
                <div class="ai-action-info-box ${!hasAddress ? 'warning' : ''}">
                    ${hasAddress ? `
                        ${client.street} ${client.street_number || ''}<br>
                        ${client.colonia ? `Col. ${client.colonia}<br>` : ''}
                        ${client.city}, ${client.state} ${postalCode ? 'CP ' + postalCode : ''}
                    ` : `
                        <span style="color: #f59e0b;">⚠️ Dirección incompleta - verifica en la sección de Envíos</span>
                    `}
                </div>
            </div>
        `;
    }

    // Order selection
    if (order) {
        modalHtml += `
            <div class="ai-action-section">
                <label>Pedido</label>
                <div class="ai-action-info-box">
                    <strong>${order.order_number}</strong>
                    <span style="float: right; color: ${order.approval_status === 'approved' ? '#059669' : '#f59e0b'};">
                        ${order.approval_status === 'approved' ? '✅ Aprobado' : '⏳ ' + order.approval_status}
                    </span>
                    <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">
                        ${order.total_pieces || '?'} piezas • $${parseFloat(order.total_price).toLocaleString('es-MX', {minimumFractionDigits: 2})}
                    </div>
                    ${parseInt(order.labels_count) > 0 ? `
                        <div style="color: #f59e0b; font-size: 13px; margin-top: 4px;">
                            ⚠️ Ya tiene ${order.labels_count} guía(s) generada(s)
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    } else if (data.recentOrders && data.recentOrders.length > 0) {
        // Show order dropdown
        modalHtml += `
            <div class="ai-action-section">
                <label>Seleccionar Pedido</label>
                <select id="ai-action-order-select" class="ai-action-select">
                    <option value="">-- Selecciona un pedido --</option>
                    ${data.recentOrders.map(o => `
                        <option value="${o.id}"
                            data-order-number="${o.order_number}"
                            data-labels="${o.labels_count || 0}"
                            ${o.approval_status !== 'approved' ? 'disabled' : ''}>
                            ${o.order_number} - ${o.total_pieces || '?'} pzas - $${parseFloat(o.total_price).toLocaleString('es-MX')}
                            ${o.approval_status !== 'approved' ? '(No aprobado)' : ''}
                            ${parseInt(o.labels_count) > 0 ? '(Ya tiene guías)' : ''}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    // Labels count with auto-calculation display
    const calculatedBoxes = data.calculatedBoxes || labelsCount;
    const boxBreakdown = data.boxBreakdown || [];

    modalHtml += `
        <div class="ai-action-section">
            <label>NÚMERO DE GUÍAS (CAJAS)</label>
            <input type="number" id="ai-action-labels-count" class="ai-action-input"
                   value="${calculatedBoxes}" min="1" max="50" style="font-size: 24px; font-weight: bold; text-align: center;">
            ${boxBreakdown.length > 0 ? `
                <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px; margin-top: 10px;">
                    <div style="font-weight: 600; color: #166534; margin-bottom: 8px;">
                        📦 Cálculo automático: ${calculatedBoxes} caja(s)
                    </div>
                    <div style="font-size: 13px; color: #15803d;">
                        ${boxBreakdown.map(item => `
                            <div style="display: flex; justify-content: space-between; margin: 4px 0;">
                                <span>${item.product}</span>
                                <span><strong>${item.quantity}</strong> pzas ÷ ${item.piecesPerBox}/caja = <strong>${item.boxes}</strong> caja(s)</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : `
                <div class="ai-action-hint">Se creará 1 multiguía con múltiples paquetes (cada caja con su etiqueta)</div>
            `}
        </div>
    `;

    // Action buttons - allow creating labels for client even without order
    const hasAddress = client && client.city && client.state && (client.postal || client.postal_code);
    const hasValidOrder = order && parseInt(order.labels_count || 0) === 0 && order.approval_status === 'approved';
    const canCreateWithOrder = client && hasValidOrder;
    const canCreateWithoutOrder = client && hasAddress && !order;

    let buttonText = '🚀 Generar Guías';
    let buttonDisabled = '';
    let buttonTitle = '';

    if (canCreateWithOrder) {
        // Has client and valid order
        buttonDisabled = '';
    } else if (canCreateWithoutOrder || (client && hasAddress)) {
        // Has client with address but no order - can still create
        buttonText = '📦 Crear Guías (Sin pedido)';
        buttonDisabled = '';
    } else if (client && !hasAddress) {
        buttonDisabled = 'disabled';
        buttonTitle = 'title="El cliente no tiene dirección completa"';
    } else {
        buttonDisabled = 'disabled';
        buttonTitle = 'title="Selecciona un cliente"';
    }

    // Rates selection section (hidden initially, shown after getting quotes)
    modalHtml += `
            <div id="ai-rates-section" class="ai-action-section" style="display: none;">
                <label>OPCIONES DE ENVÍO</label>
                <div id="ai-rates-container" class="ai-rates-container">
                    <!-- Rates will be loaded here -->
                </div>
            </div>
    `;

    modalHtml += `
                </div>
                <div class="ai-action-modal-footer">
                    <button onclick="closeAiActionModal()" class="ai-action-btn secondary">Cancelar</button>
                    <button id="ai-quote-btn" onclick="getShippingQuotes()" class="ai-action-btn primary"
                            ${buttonDisabled} ${buttonTitle}>
                        💰 Cotizar Envío
                    </button>
                    <button id="ai-create-btn" onclick="executeCreateShippingLabels()" class="ai-action-btn primary"
                            style="display: none;" disabled>
                        📦 Crear Guías
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Show client selection in chat with detailed info
 */
function showClientSelection(clients, title) {
    let html = `<p>${title}</p><div class="ai-client-selection">`;
    clients.forEach(client => {
        // Build location string
        const locationParts = [];
        if (client.colonia) locationParts.push(client.colonia);
        if (client.city) locationParts.push(client.city);
        if (client.state) locationParts.push(client.state);
        const location = locationParts.join(', ') || 'Sin ubicación';

        html += `
            <button class="ai-client-btn" onclick="selectClientForAction(${client.id}, '${escapeHtml(client.name).replace(/'/g, "\\'")}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div>
                        <strong>${escapeHtml(client.name)}</strong>
                        <div style="font-size: 12px; color: #059669; margin-top: 2px;">
                            📍 ${escapeHtml(location)}
                        </div>
                    </div>
                    <div style="text-align: right; font-size: 11px; color: #6b7280;">
                        ${client.phone ? `📱 ${client.phone}<br>` : ''}
                        ${client.order_count || 0} pedido${client.order_count !== 1 ? 's' : ''}
                    </div>
                </div>
            </button>
        `;
    });
    html += '</div>';
    addMessageToChat('assistant', html, { isHtml: true });
}

/**
 * Select client and continue action
 * Directly uses the selected client data without re-querying AI
 */
async function selectClientForAction(clientId, clientName) {
    if (!currentAction) {
        console.error('No current action to process');
        return;
    }

    // Find the selected client from the matches
    const selectedClient = currentAction.data?.clientMatches?.find(c => c.id === clientId);

    if (selectedClient) {
        // Update the action with the selected client
        currentAction.data.client = selectedClient;
        currentAction.data.needsClientSelection = false;
        currentAction.data.clientMatches = null;

        // Show the modal directly with the selected client
        addMessageToChat('assistant', `✅ Cliente seleccionado: <strong>${selectedClient.name}</strong> (${selectedClient.city || 'Sin ciudad'})`, { isHtml: true });

        // Show the shipping label modal with the client data
        showShippingLabelModal(currentAction);
    } else {
        // Fallback: fetch client data from API
        try {
            const token = localStorage.getItem('admin_token');
            const response = await fetch(`${API_BASE}/clients/${clientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            if (result.success && result.data) {
                currentAction.data.client = result.data;
                currentAction.data.needsClientSelection = false;

                addMessageToChat('assistant', `✅ Cliente seleccionado: <strong>${result.data.name}</strong>`, { isHtml: true });
                showShippingLabelModal(currentAction);
            } else {
                addMessageToChat('assistant', `❌ No se pudo cargar el cliente. Intenta de nuevo.`, { error: true });
            }
        } catch (error) {
            console.error('Error fetching client:', error);
            addMessageToChat('assistant', `❌ Error al cargar cliente: ${error.message}`, { error: true });
        }
    }
}

// Store selected quote data
let selectedQuoteData = null;

/**
 * Get shipping quotes and display options
 */
async function getShippingQuotes() {
    const labelsCount = parseInt(document.getElementById('ai-action-labels-count')?.value || 1);
    let clientId = currentAction?.data?.client?.id;

    if (!clientId) {
        alert('No se encontró el cliente');
        return;
    }

    // Show loading state
    const quoteBtn = document.getElementById('ai-quote-btn');
    const originalText = quoteBtn.innerHTML;
    quoteBtn.innerHTML = '⏳ Cotizando...';
    quoteBtn.disabled = true;

    try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE}/shipping/clients/${clientId}/quotes?packagesCount=${labelsCount}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error obteniendo cotizaciones');
        }

        // Store quote data
        selectedQuoteData = {
            quotationId: result.quotation_id,
            packagesCount: result.packagesCount || labelsCount,
            rates: result.rates,
            selectedRate: null
        };

        // Show rates section
        const ratesSection = document.getElementById('ai-rates-section');
        const ratesContainer = document.getElementById('ai-rates-container');
        const pkgCount = result.packagesCount || labelsCount;

        let ratesHtml = '';
        result.rates.forEach((rate, index) => {
            const priceBreakdown = pkgCount > 1
                ? `<div class="ai-rate-breakdown">${pkgCount} cajas (${rate.pricePerPackageFormatted}/caja)</div>`
                : '';
            const estimatedNote = rate.isEstimated
                ? '<div class="ai-rate-estimated">* Precio estimado</div>'
                : '';
            ratesHtml += `
                <div class="ai-rate-option ${index === 0 ? 'recommended' : ''} ${rate.isEstimated ? 'estimated' : ''}"
                     onclick="selectShippingRate(${index})"
                     data-rate-index="${index}">
                    <div class="ai-rate-header">
                        <span class="ai-rate-carrier">${rate.carrier}</span>
                        ${index === 0 ? '<span class="ai-rate-badge">Más económico</span>' : ''}
                    </div>
                    <div class="ai-rate-service">${rate.service}</div>
                    <div class="ai-rate-details">
                        <div>
                            <span class="ai-rate-price">${rate.priceFormatted}</span>
                            ${priceBreakdown}
                            ${estimatedNote}
                        </div>
                        <span class="ai-rate-days">📅 ${rate.daysText}</span>
                    </div>
                </div>
            `;
        });

        ratesContainer.innerHTML = ratesHtml;
        ratesSection.style.display = 'block';

        // Hide quote button, show create button (disabled until rate selected)
        quoteBtn.style.display = 'none';
        document.getElementById('ai-create-btn').style.display = 'inline-flex';

    } catch (error) {
        console.error('Error getting quotes:', error);
        alert(`Error al cotizar: ${error.message}`);
        quoteBtn.innerHTML = originalText;
        quoteBtn.disabled = false;
    }
}

/**
 * Select a shipping rate
 */
function selectShippingRate(index) {
    if (!selectedQuoteData || !selectedQuoteData.rates[index]) return;

    // Update selection visually
    document.querySelectorAll('.ai-rate-option').forEach(el => el.classList.remove('selected'));
    document.querySelector(`[data-rate-index="${index}"]`).classList.add('selected');

    // Store selected rate
    selectedQuoteData.selectedRate = selectedQuoteData.rates[index];

    // Enable create button
    const createBtn = document.getElementById('ai-create-btn');
    createBtn.disabled = false;
    createBtn.innerHTML = `📦 Crear Guías (${selectedQuoteData.selectedRate.priceFormatted})`;
}

/**
 * Close action modal
 */
function closeAiActionModal(event) {
    if (event && event.target.id !== 'ai-action-modal') return;
    const modal = document.getElementById('ai-action-modal');
    if (modal) {
        modal.remove();
    }
    currentAction = null;
    selectedQuoteData = null;
}

/**
 * Execute shipping label creation
 * Supports both order-based and client-only (no order) labels
 */
async function executeCreateShippingLabels() {
    const labelsCount = parseInt(document.getElementById('ai-action-labels-count')?.value || 1);
    const orderSelect = document.getElementById('ai-action-order-select');

    let orderId;
    let orderNumber;
    let clientId;
    let clientName;

    // Check if we have an order
    if (orderSelect && orderSelect.value) {
        orderId = orderSelect.value;
        orderNumber = orderSelect.options[orderSelect.selectedIndex]?.dataset?.orderNumber;
    } else if (currentAction?.data?.order) {
        orderId = currentAction.data.order.id;
        orderNumber = currentAction.data.order.order_number;
    } else if (currentAction?.data?.suggestedOrder) {
        orderId = currentAction.data.suggestedOrder.id;
        orderNumber = currentAction.data.suggestedOrder.order_number;
    }

    // Get client info (for client-only labels)
    if (currentAction?.data?.client) {
        clientId = currentAction.data.client.id;
        clientName = currentAction.data.client.name;
    }

    // Determine which endpoint to use
    const useClientEndpoint = !orderId && clientId;

    if (!orderId && !clientId) {
        alert('Por favor selecciona un cliente o pedido');
        return;
    }

    // Verify rate is selected for client endpoint
    if (useClientEndpoint && (!selectedQuoteData || !selectedQuoteData.selectedRate)) {
        alert('Por favor selecciona una opción de envío');
        return;
    }

    // Store quote data before closing modal (which clears it)
    const quoteData = selectedQuoteData ? { ...selectedQuoteData } : null;

    // Close modal and show progress in chat
    closeAiActionModal();

    const carrierInfo = quoteData?.selectedRate ? ` con ${quoteData.selectedRate.carrier}` : '';
    const progressMessage = orderId
        ? `⏳ Generando ${labelsCount} guía(s) para el pedido ${orderNumber}${carrierInfo}...`
        : `⏳ Generando ${labelsCount} guía(s) para ${clientName}${carrierInfo}...`;
    addMessageToChat('assistant', progressMessage);

    try {
        const token = localStorage.getItem('admin_token');

        // Use different endpoint based on whether we have an order
        const endpoint = useClientEndpoint
            ? `${API_BASE}/shipping/clients/${clientId}/generate`
            : `${API_BASE}/shipping/orders/${orderId}/generate`;

        // Build request body with selected rate if available
        const requestBody = {
            labelsCount,
            notes: useClientEndpoint ? `Guía generada desde AI Assistant` : undefined
        };

        // Include selected rate data if available
        if (quoteData && quoteData.selectedRate) {
            // Use the quotation_id from the specific rate (may differ for estimated rates)
            requestBody.quotationId = quoteData.selectedRate.quotation_id || quoteData.quotationId;
            requestBody.rateId = quoteData.selectedRate.rate_id;
            requestBody.selectedRate = quoteData.selectedRate;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (result.success) {
            const labelWord = labelsCount === 1 ? 'guía' : 'guías';
            let successHtml = `<p>✅ <strong>¡${labelsCount} ${labelWord} generada(s) exitosamente!</strong></p>`;

            if (useClientEndpoint) {
                successHtml += `<p style="font-size: 13px; color: #059669;">📍 Para: ${result.client?.name || clientName} (${result.client?.city || 'N/A'})</p>`;
            }

            successHtml += '<div class="ai-shipping-results">';

            result.labels.forEach((label, i) => {
                successHtml += `
                    <div class="ai-shipping-label-card">
                        <div class="ai-label-header">
                            <span class="ai-label-number">Caja ${i + 1}</span>
                            <span class="ai-label-carrier">${label.carrier}</span>
                        </div>
                        <div class="ai-label-tracking">
                            <strong>Tracking:</strong> ${label.tracking_number || 'Procesando...'}
                        </div>
                        ${label.label_url ? `
                            <a href="${label.label_url}" target="_blank" class="ai-label-download">
                                📄 Descargar PDF
                            </a>
                        ` : ''}
                    </div>
                `;
            });

            successHtml += '</div>';
            addMessageToChat('assistant', successHtml, { isHtml: true, isSuccess: true });

            // Refresh the guias view if visible
            if (typeof loadGuias === 'function') {
                loadGuias();
            }
        } else {
            addMessageToChat('assistant', `❌ Error: ${result.error}`, { error: true });
        }
    } catch (error) {
        console.error('Error creating shipping labels:', error);
        addMessageToChat('assistant', `❌ Error de conexión: ${error.message}`, { error: true });
    }
}

// =====================================================
// NAVIGATION (keeps modal open)
// =====================================================

function navigateToSection(section) {
    console.log('🔗 Navigating to section:', section);

    // Use the dashboard's switchView function if available
    if (typeof switchView === 'function') {
        switchView(section);

        // Also update the nav button active state
        const navButtons = document.querySelectorAll('.nav-item, .nav-sub-item');
        navButtons.forEach(btn => btn.classList.remove('active'));
        const targetBtn = document.querySelector(`[data-view="${section}"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    } else {
        // Fallback: click on nav button directly
        const navBtn = document.querySelector(`[data-view="${section}"]`);
        if (navBtn) {
            navBtn.click();
        } else {
            console.warn('Could not find navigation for section:', section);
        }
    }
    // Note: Modal stays open - user can see the section changed behind it
}

// =====================================================
// KEYBOARD SHORTCUTS
// =====================================================

document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K to open AI assistant
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openAiChatModal();
    }

    // Escape to close modal
    if (e.key === 'Escape') {
        const modal = document.getElementById('ai-chat-modal');
        if (modal && !modal.classList.contains('hidden')) {
            closeAiChatModal();
        }
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🤖 AI Assistant initialized with action support');
});

/**
 * Search clients from within the modal
 */
async function searchClientsForModal() {
    const searchInput = document.getElementById('ai-client-search');
    const resultsDiv = document.getElementById('ai-client-search-results');
    const searchTerm = searchInput?.value?.trim();

    if (!searchTerm || searchTerm.length < 2) {
        resultsDiv.innerHTML = '<p style="color: #6b7280; font-size: 13px;">Escribe al menos 2 caracteres</p>';
        return;
    }

    resultsDiv.innerHTML = '<p style="color: #6b7280;">Buscando...</p>';

    try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE}/clients?search=${encodeURIComponent(searchTerm)}&limit=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
            let html = '';
            result.data.forEach(client => {
                const location = [client.city, client.state].filter(Boolean).join(', ') || 'Sin ubicación';
                const hasAddress = client.city && client.state && (client.postal || client.postal_code);
                html += `
                    <div class="ai-client-result ${!hasAddress ? 'no-address' : ''}"
                         onclick="selectClientInModal(${client.id})">
                        <div class="ai-client-result-name">${client.name}</div>
                        <div class="ai-client-result-info">
                            📍 ${location}
                            ${client.phone ? ` • 📱 ${client.phone}` : ''}
                            ${!hasAddress ? '<span style="color: #f59e0b;"> ⚠️ Dirección incompleta</span>' : ''}
                        </div>
                    </div>
                `;
            });
            resultsDiv.innerHTML = html;
        } else {
            resultsDiv.innerHTML = '<p style="color: #ef4444;">No se encontraron clientes</p>';
        }
    } catch (error) {
        console.error('Error searching clients:', error);
        resultsDiv.innerHTML = '<p style="color: #ef4444;">Error al buscar</p>';
    }
}

/**
 * Select a client from search results in modal
 */
async function selectClientInModal(clientId) {
    try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE}/clients/${clientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success && result.data) {
            const client = result.data;

            // Update currentAction with selected client
            if (currentAction) {
                currentAction.data.client = client;
            }

            // Close current modal and reopen with client data
            const labelsCount = document.getElementById('ai-action-labels-count')?.value || 1;
            closeAiActionModal();

            // Create new action with client
            const newAction = {
                type: 'create_shipping_labels',
                data: {
                    client: client,
                    labelsCount: parseInt(labelsCount)
                }
            };
            currentAction = newAction;
            showShippingLabelModal(newAction);
        }
    } catch (error) {
        console.error('Error selecting client:', error);
        alert('Error al seleccionar cliente');
    }
}

// Export action functions globally
window.handleAiAction = handleAiAction;
window.showShippingLabelModal = showShippingLabelModal;
window.closeAiActionModal = closeAiActionModal;
window.executeCreateShippingLabels = executeCreateShippingLabels;
window.selectClientForAction = selectClientForAction;
window.searchClientsForModal = searchClientsForModal;
window.selectClientInModal = selectClientInModal;
window.getShippingQuotes = getShippingQuotes;
window.selectShippingRate = selectShippingRate;

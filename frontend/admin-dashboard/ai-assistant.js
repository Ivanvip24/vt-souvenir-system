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

// Pending images for next message (array of {base64, mediaType, preview})
let aiPendingImages = [];

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
// IMAGE HANDLING
// =====================================================

function handleAiImageSelect(event) {
    var files = event.target.files;
    if (!files || files.length === 0) return;
    for (var i = 0; i < files.length; i++) {
        processImageFile(files[i]);
    }
    event.target.value = '';
}

function processImageFile(file) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
        showNotification('La imagen es muy grande (máx 10MB)', 'error');
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        var dataUrl = e.target.result;
        var base64 = dataUrl.split(',')[1];
        var mediaType = file.type || 'image/png';
        aiPendingImages.push({ base64: base64, mediaType: mediaType, preview: dataUrl });
        renderImagePreviews();
    };
    reader.readAsDataURL(file);
}

function renderImagePreviews() {
    var bar = document.getElementById('ai-image-preview-bar');
    if (!bar) return;
    bar.textContent = '';
    if (aiPendingImages.length === 0) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    aiPendingImages.forEach(function(img, i) {
        var item = document.createElement('div');
        item.className = 'ai-image-preview-item';

        var imgEl = document.createElement('img');
        imgEl.src = img.preview;
        imgEl.alt = 'Preview';
        item.appendChild(imgEl);

        var removeBtn = document.createElement('button');
        removeBtn.className = 'ai-image-preview-remove';
        removeBtn.textContent = '\u2715';
        removeBtn.addEventListener('click', function() { removeAiPendingImage(i); });
        item.appendChild(removeBtn);

        bar.appendChild(item);
    });
}

function removeAiPendingImage(index) {
    aiPendingImages.splice(index, 1);
    renderImagePreviews();
}

// Paste handler for images
document.addEventListener('DOMContentLoaded', function() {
    var chatInput = document.getElementById('ai-chat-input');
    if (chatInput) {
        chatInput.addEventListener('paste', function(e) {
            var items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (var k = 0; k < items.length; k++) {
                if (items[k].type.startsWith('image/')) {
                    e.preventDefault();
                    var file = items[k].getAsFile();
                    if (file) processImageFile(file);
                }
            }
        });
    }
});

// =====================================================
// MESSAGE HANDLING
// =====================================================

async function sendAiMessage() {
    const input = document.getElementById('ai-chat-input');
    const message = input?.value?.trim();

    if (!message && aiPendingImages.length === 0) return;

    // Capture images before clearing
    const imagesToSend = aiPendingImages.slice();
    aiPendingImages = [];
    renderImagePreviews();

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Add user message to chat (with image previews)
    addMessageToChat('user', message || '(imagen)', { images: imagesToSend });

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

        // Build request body with images
        const requestBody = {
            message: message || '',
            sessionId: aiSessionId
        };
        if (imagesToSend.length > 0) {
            requestBody.images = imagesToSend.map(function(img) {
                return { base64: img.base64, mediaType: img.mediaType };
            });
        }

        const response = await fetch(`${API_BASE}/ai-assistant/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // Remove typing indicator
        removeTypingIndicator();

        if (data.success) {
            // Add assistant message
            addMessageToChat('assistant', data.data.message, data.data);

            // Handle any action from the AI
            console.log('🔍 DEBUG: Full response data:', JSON.stringify(data.data, null, 2));
            console.log('🔍 DEBUG: Action received:', data.data.action);
            if (data.data.action) {
                console.log('🎯 DEBUG: Calling handleAiAction with:', data.data.action);
                handleAiAction(data.data.action);
            } else {
                console.log('⚠️ DEBUG: No action in response');
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
        var userContent = document.createElement('div');
        userContent.className = 'ai-message-content user-message';

        // Show image thumbnails if present
        if (data.images && data.images.length > 0) {
            var imagesDiv = document.createElement('div');
            imagesDiv.className = 'ai-msg-images';
            data.images.forEach(function(img) {
                var thumb = document.createElement('img');
                thumb.src = img.preview || ('data:' + img.mediaType + ';base64,' + img.base64);
                thumb.alt = 'Imagen adjunta';
                thumb.addEventListener('click', function() { window.open(thumb.src, '_blank'); });
                imagesDiv.appendChild(thumb);
            });
            userContent.appendChild(imagesDiv);
        }

        var textP = document.createElement('p');
        textP.textContent = content;
        userContent.appendChild(textP);

        var avatarDiv = document.createElement('div');
        avatarDiv.className = 'ai-message-avatar user-avatar';
        avatarDiv.textContent = '\uD83D\uDC64';

        messageDiv.appendChild(userContent);
        messageDiv.appendChild(avatarDiv);
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
    } else if (action.type === 'calculate_price') {
        showPriceCalculation(action.data);
    } else if (action.type === 'generate_quote') {
        // Show quote result in chat
        showQuoteResult(action.data);
    } else if (action.type === 'generate_multiple_quotes') {
        // Show multiple quotes for comparison
        showMultipleQuotesResult(action.data);
    } else if (action.type === 'start_order_creation') {
        // Start interactive order creation wizard
        console.log('🛒 DEBUG: start_order_creation detected, calling wizard with:', action.data);
        startOrderCreationWizard(action.data);
    } else if (action.type === 'generate_catalog') {
        // Show catalog download in chat
        showCatalogResult(action.data);
    } else {
        console.log('⚠️ DEBUG: Unknown action type:', action.type);
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

                    ${data.shipping && data.shipping > 0 ? `
                        <div class="ai-quote-shipping">
                            <span>🚚 Envío:</span>
                            <span>$${data.shipping.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                        </div>
                    ` : ''}

                    ${data.freeShipping ? `
                        <div class="ai-quote-free-shipping">
                            ✓ ¡Envío GRATIS incluido! (${data.totalPieces?.toLocaleString('es-MX') || ''} piezas)
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
                    <button onclick="copyQuoteImage(this, '${data.pdfUrl}')" class="ai-quote-copy-btn">
                        📷 Copiar Imagen
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
 * Show price calculation result in chat
 */
function showPriceCalculation(data) {
    if (!data) return;

    let html = '';

    if (data.error) {
        html = `
            <div class="ai-quote-result" style="border-left: 3px solid #f39223;">
                <div class="ai-quote-header">
                    <span class="ai-quote-icon">⚠️</span>
                    <div>
                        <div class="ai-quote-title">Cálculo de Precio</div>
                        <div class="ai-quote-number">${escapeHtml(data.error)}</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        const scenarioLabels = {
            'below_moq': '📦 Pedido Especial (bajo mínimo)',
            'standard': '📊 Precio Estándar',
            'high_volume': '🏭 Volumen Alto'
        };

        const scenarioColors = {
            'below_moq': '#f39223',
            'standard': '#8ab73b',
            'high_volume': '#09adc2'
        };

        const color = scenarioColors[data.scenario] || '#8ab73b';

        html = `
            <div class="ai-quote-result" style="border-left: 3px solid ${color};">
                <div class="ai-quote-header">
                    <span class="ai-quote-icon">🧮</span>
                    <div>
                        <div class="ai-quote-title">${scenarioLabels[data.scenario] || 'Cálculo de Precio'}</div>
                        <div class="ai-quote-number">${escapeHtml(data.productName)} — ${data.quantity.toLocaleString('es-MX')} pzas</div>
                    </div>
                </div>

                <div class="ai-quote-details">
                    <div class="ai-quote-items" style="font-family: monospace; font-size: 0.85em;">
                        ${(data.breakdown || []).map(line => {
                            if (line === '---') {
                                return '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0;">';
                            }
                            const isHighlight = line.includes('Precio final') || line.includes('Total pedido');
                            return `<div style="${isHighlight ? 'font-weight: bold; color: ' + color + ';' : ''} padding: 2px 0;">${escapeHtml(line)}</div>`;
                        }).join('')}
                    </div>

                    <div class="ai-quote-total">
                        <span>PRECIO/PZA:</span>
                        <span class="ai-quote-total-amount" style="color: ${color};">$${data.finalPrice?.toFixed(2) || '0.00'}</span>
                    </div>

                    <div class="ai-quote-total" style="font-size: 0.9em; opacity: 0.8;">
                        <span>TOTAL PEDIDO:</span>
                        <span>$${data.orderTotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0.00'}</span>
                    </div>

                    ${data.margin ? `
                        <div style="text-align: center; margin-top: 8px; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 0.85em;">
                            Margen: ${data.margin}% · Costo: $${data.totalCostPerPiece?.toFixed(2)}/pza
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Append to last assistant message
    const messages = document.querySelectorAll('.ai-chat-message.assistant');
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const contentDiv = lastMessage.querySelector('.ai-chat-message-content');
        if (contentDiv) {
            contentDiv.insertAdjacentHTML('beforeend', html);
        }
    }
}

/**
 * Show catalog generation result in chat
 */
function showCatalogResult(data) {
    if (!data) return;

    let html = '';

    if (data.success) {
        html = `
            <div class="ai-quote-result">
                <div class="ai-quote-header">
                    <span class="ai-quote-icon">📋</span>
                    <div>
                        <div class="ai-quote-title">Catálogo de Productos AXKAN</div>
                        <div class="ai-quote-number">${data.productCount} productos</div>
                    </div>
                </div>

                <div class="ai-quote-details">
                    <div class="ai-quote-client">Incluye todos los precios actualizados y precios de mayoreo</div>

                    <div class="ai-quote-validity">
                        📅 Generado: ${new Date(data.generatedAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>

                <div class="ai-quote-actions">
                    <a href="${data.pdfUrl}" target="_blank" class="ai-quote-download-btn">
                        📥 Descargar Catálogo PDF
                    </a>
                    <button onclick="copyQuoteImage(this, '${data.pdfUrl}')" class="ai-quote-copy-btn">
                        📷 Copiar Imagen
                    </button>
                </div>
            </div>
        `;
    } else {
        html = `
            <div class="ai-quote-error">
                <span class="ai-quote-error-icon">❌</span>
                <span>${escapeHtml(data.error || 'Error al generar el catálogo')}</span>
            </div>
        `;
    }

    addMessageToChat('assistant', html, { isHtml: true });
}

/**
 * Show multiple quotes comparison result in chat
 */
function showMultipleQuotesResult(data) {
    if (!data || !data.quotes || data.quotes.length === 0) {
        addMessageToChat('assistant', '<div class="ai-quote-error">❌ No se generaron cotizaciones</div>', { isHtml: true });
        return;
    }

    const formatCurrency = (amount) => new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
    }).format(amount);

    // Build comparison cards for each quote
    const quoteCards = data.quotes.map((quote, index) => {
        if (!quote.success) {
            return `
                <div class="ai-quote-card ai-quote-card-error">
                    <div class="ai-quote-card-label">${escapeHtml(quote.label || `Opción ${index + 1}`)}</div>
                    <div class="ai-quote-error-msg">❌ ${escapeHtml(quote.error || 'Error')}</div>
                </div>
            `;
        }

        return `
            <div class="ai-quote-card">
                <div class="ai-quote-card-label">${escapeHtml(quote.label || `Opción ${index + 1}`)}</div>
                <div class="ai-quote-card-number">${quote.quoteNumber}</div>

                <div class="ai-quote-card-items">
                    ${(quote.items || []).map(item => `
                        <div class="ai-quote-card-item">
                            <span>${escapeHtml(item.productName || 'Producto')}</span>
                            <span>${(item.quantity || 0).toLocaleString('es-MX')} pzas × $${(item.unitPrice || 0).toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>

                ${quote.shipping && quote.shipping > 0 ? `
                    <div class="ai-quote-card-shipping">🚚 Envío: ${formatCurrency(quote.shipping)}</div>
                ` : ''}

                ${quote.freeShipping ? `
                    <div class="ai-quote-card-free-shipping">✓ Envío GRATIS</div>
                ` : ''}

                <div class="ai-quote-card-total">
                    <span>TOTAL:</span>
                    <span class="ai-quote-card-total-amount">${formatCurrency(quote.total)}</span>
                </div>

                <div class="ai-quote-card-actions">
                    <a href="${quote.pdfUrl}" target="_blank" class="ai-quote-card-download">📥 PDF</a>
                    <button onclick="copyQuoteImage(this, '${quote.pdfUrl}')" class="ai-quote-card-copy">📷 Imagen</button>
                </div>
            </div>
        `;
    }).join('');

    const html = `
        <div class="ai-multiple-quotes">
            <div class="ai-multiple-quotes-header">
                <span class="ai-quote-icon">📊</span>
                <span>Comparación de Cotizaciones</span>
            </div>
            ${data.clientName ? `<div class="ai-multiple-quotes-client">👤 ${escapeHtml(data.clientName)}</div>` : ''}
            <div class="ai-quote-cards-container">
                ${quoteCards}
            </div>
        </div>
    `;

    addMessageToChat('assistant', html, { isHtml: true });
}

/**
 * Copy the PDF quote as an image to clipboard using pdf.js.
 * Fetches the PDF, renders page 1 to a canvas at 2x scale, then copies as PNG.
 * The btn.textContent assignments use only hardcoded UI labels (no user input).
 * innerHTML is used solely to restore the original static emoji+text content.
 */
function copyQuoteImage(btn, pdfUrl) {
    if (!pdfUrl) return;

    var originalText = btn.innerHTML;
    btn.textContent = '\u23F3 Capturando...';
    btn.disabled = true;

    // Resolve relative URLs to the backend
    var fullUrl = pdfUrl;
    if (pdfUrl.startsWith('/')) {
        var backendUrl = (typeof API_BASE !== 'undefined' ? API_BASE.replace('/api', '') : 'https://vt-souvenir-backend.onrender.com');
        fullUrl = backendUrl + pdfUrl;
    }

    // Fetch PDF with auth token
    var token = localStorage.getItem('adminToken');
    fetch(fullUrl, {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    })
    .then(function(resp) {
        if (!resp.ok) throw new Error('PDF fetch failed: ' + resp.status);
        return resp.arrayBuffer();
    })
    .then(function(arrayBuffer) {
        return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    })
    .then(function(pdf) {
        return pdf.getPage(1);
    })
    .then(function(page) {
        var scale = 2;
        var viewport = page.getViewport({ scale: scale });
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        var ctx = canvas.getContext('2d');

        return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function() {
            return canvas;
        });
    })
    .then(function(canvas) {
        canvas.toBlob(function(blob) {
            if (!blob) {
                btn.textContent = '\u274C Error';
                btn.disabled = false;
                setTimeout(function() { btn.innerHTML = originalText; }, 2000);
                return;
            }
            navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]).then(function() {
                btn.textContent = '\u2705 Imagen copiada!';
                btn.disabled = false;
                setTimeout(function() { btn.innerHTML = originalText; }, 2000);
            }).catch(function(err) {
                console.error('Clipboard write failed:', err);
                // Fallback: download the image
                var link = document.createElement('a');
                link.download = 'cotizacion-axkan.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                btn.textContent = '\uD83D\uDCE5 Descargada';
                btn.disabled = false;
                setTimeout(function() { btn.innerHTML = originalText; }, 2000);
            });
        }, 'image/png');
    })
    .catch(function(err) {
        console.error('Error capturing PDF as image:', err);
        btn.textContent = '\u274C Error';
        btn.disabled = false;
        setTimeout(function() { btn.innerHTML = originalText; }, 2000);
    });
}

// Export quote functions globally
window.showQuoteResult = showQuoteResult;
window.showMultipleQuotesResult = showMultipleQuotesResult;
window.copyQuoteImage = copyQuoteImage;

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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label style="margin-bottom: 0;">Cliente</label>
                    <button onclick="changeShippingClient()" class="ai-change-client-btn">
                        ✏️ Cambiar
                    </button>
                </div>
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
    // If user explicitly specified labels (e.g., "son 4 cajas"), use their value
    // Otherwise use calculated boxes from order, or fall back to AI-parsed labelsCount
    const calculatedBoxes = data.userSpecifiedLabels ? labelsCount : (data.calculatedBoxes || labelsCount);
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
 * Change client - go back to client search
 */
function changeShippingClient() {
    if (!currentAction) return;

    // Clear the client from current action
    currentAction.data.client = null;
    currentAction.data.order = null;
    currentAction.data.suggestedOrder = null;
    currentAction.data.recentOrders = null;
    selectedQuoteData = null;

    // Remove current modal
    const modal = document.getElementById('ai-action-modal');
    if (modal) {
        modal.remove();
    }

    // Re-show modal with search box (no client)
    showShippingLabelModal(currentAction);

    // Focus on search input
    setTimeout(() => {
        const searchInput = document.getElementById('ai-client-search');
        if (searchInput) searchInput.focus();
    }, 100);
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

// =====================================================
// ORDER CREATION WIZARD
// =====================================================

// Store wizard state
let orderWizardState = {
    products: [],
    clientName: '',
    clientPhone: '',
    eventDate: '',
    deliveryMethod: 'pickup',
    salesRep: '',
    depositAmount: 0,
    notes: '',
    currentStep: 1
};

/**
 * Start the order creation wizard
 */
function startOrderCreationWizard(data) {
    console.log('🛒 Starting order creation wizard:', data);
    console.log('🛒 DEBUG: Products received:', data?.products);

    if (!data || !data.products || data.products.length === 0) {
        console.error('❌ ERROR: No products provided to wizard');
        alert('Error: No se recibieron productos para el pedido');
        return;
    }

    // Initialize wizard state with products from AI
    orderWizardState = {
        products: data.products || [],
        clientName: '',
        clientPhone: '',
        eventDate: '',
        deliveryMethod: 'pickup',
        salesRep: '',
        depositAmount: 0,
        notes: '',
        currentStep: 1
    };

    // Calculate initial total
    const total = orderWizardState.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
    const suggestedDeposit = Math.ceil(total * 0.5);
    orderWizardState.depositAmount = suggestedDeposit;

    // Show first step
    showOrderWizardStep1();
}

/**
 * Step 1: Show product summary and ask for client name
 */
function showOrderWizardStep1() {
    const products = orderWizardState.products;
    const total = products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);

    const modalHTML = `
        <div id="order-wizard-modal" class="modal-overlay" onclick="if(event.target === this) closeOrderWizard()">
            <div class="modal-content order-wizard-modal">
                <div class="wizard-header">
                    <h2>🛒 Crear Nuevo Pedido</h2>
                    <div class="wizard-steps">
                        <span class="wizard-step active">1</span>
                        <span class="wizard-step-line"></span>
                        <span class="wizard-step">2</span>
                        <span class="wizard-step-line"></span>
                        <span class="wizard-step">3</span>
                        <span class="wizard-step-line"></span>
                        <span class="wizard-step">4</span>
                    </div>
                    <button onclick="closeOrderWizard()" class="modal-close">&times;</button>
                </div>

                <div class="wizard-body">
                    <div class="wizard-product-summary">
                        <h3>📦 Resumen del Pedido</h3>
                        ${products.map(p => `
                            <div class="wizard-product-item">
                                <span class="product-name">${escapeHtml(p.name)}</span>
                                <span class="product-qty">${p.quantity.toLocaleString('es-MX')} pzas</span>
                                <span class="product-price">$${p.unitPrice.toFixed(2)}/u</span>
                                <span class="product-subtotal">$${(p.quantity * p.unitPrice).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                            </div>
                        `).join('')}
                        <div class="wizard-total">
                            <span>Total:</span>
                            <span class="total-amount">$${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>

                    <div class="wizard-form-section">
                        <h3>👤 Información del Cliente</h3>
                        <div class="wizard-form-group">
                            <label for="wizard-client-name">Nombre del Cliente *</label>
                            <input type="text" id="wizard-client-name" placeholder="Ej: María García"
                                   value="${escapeHtml(orderWizardState.clientName)}" autofocus>
                        </div>
                        <div class="wizard-form-group">
                            <label for="wizard-client-phone">Teléfono *</label>
                            <input type="tel" id="wizard-client-phone" placeholder="Ej: 3312345678"
                                   value="${escapeHtml(orderWizardState.clientPhone)}">
                        </div>
                    </div>
                </div>

                <div class="wizard-footer">
                    <button onclick="closeOrderWizard()" class="wizard-btn wizard-btn-secondary">Cancelar</button>
                    <button onclick="orderWizardNext(1)" class="wizard-btn wizard-btn-primary">
                        Siguiente →
                    </button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('order-wizard-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Step 2: Delivery details
 */
function showOrderWizardStep2() {
    const modal = document.querySelector('#order-wizard-modal .wizard-body');
    const steps = document.querySelectorAll('#order-wizard-modal .wizard-step');
    steps.forEach((s, i) => s.classList.toggle('active', i <= 1));

    modal.innerHTML = `
        <div class="wizard-form-section">
            <h3>🚚 Detalles de Entrega</h3>

            <div class="wizard-form-group">
                <label>Método de Entrega *</label>
                <div class="wizard-radio-group">
                    <label class="wizard-radio ${orderWizardState.deliveryMethod === 'pickup' ? 'selected' : ''}">
                        <input type="radio" name="delivery-method" value="pickup"
                               ${orderWizardState.deliveryMethod === 'pickup' ? 'checked' : ''}
                               onchange="updateDeliveryMethod('pickup')">
                        <span class="radio-icon">🏪</span>
                        <span>Recoger en tienda</span>
                    </label>
                    <label class="wizard-radio ${orderWizardState.deliveryMethod === 'shipping' ? 'selected' : ''}">
                        <input type="radio" name="delivery-method" value="shipping"
                               ${orderWizardState.deliveryMethod === 'shipping' ? 'checked' : ''}
                               onchange="updateDeliveryMethod('shipping')">
                        <span class="radio-icon">📦</span>
                        <span>Envío</span>
                    </label>
                </div>
            </div>

            <div class="wizard-form-group">
                <label for="wizard-event-date">Fecha del Evento (opcional)</label>
                <input type="date" id="wizard-event-date" value="${orderWizardState.eventDate}">
            </div>
        </div>
    `;

    orderWizardState.currentStep = 2;
}

/**
 * Step 3: Sales rep and deposit
 */
async function showOrderWizardStep3() {
    const modal = document.querySelector('#order-wizard-modal .wizard-body');
    const steps = document.querySelectorAll('#order-wizard-modal .wizard-step');
    steps.forEach((s, i) => s.classList.toggle('active', i <= 2));

    // Fetch salespeople for dropdown
    let salespeopleOptions = '<option value="">Sin vendedor asignado</option>';
    try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE}/salespeople`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.salespeople) {
            salespeopleOptions += data.salespeople
                .filter(sp => sp.is_active)
                .map(sp => `<option value="${escapeHtml(sp.name)}" ${orderWizardState.salesRep === sp.name ? 'selected' : ''}>${escapeHtml(sp.name)}</option>`)
                .join('');
        }
    } catch (e) {
        console.error('Error loading salespeople:', e);
    }

    const total = orderWizardState.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);

    modal.innerHTML = `
        <div class="wizard-form-section">
            <h3>💰 Vendedor y Anticipo</h3>

            <div class="wizard-form-group">
                <label for="wizard-sales-rep">Vendedor</label>
                <select id="wizard-sales-rep">
                    ${salespeopleOptions}
                </select>
            </div>

            <div class="wizard-form-group">
                <label for="wizard-deposit">Anticipo (50% sugerido)</label>
                <div class="wizard-deposit-input">
                    <span class="currency-prefix">$</span>
                    <input type="number" id="wizard-deposit" value="${orderWizardState.depositAmount}" min="0" max="${total}">
                    <button type="button" class="wizard-deposit-preset" onclick="setDepositPercent(50)">50%</button>
                    <button type="button" class="wizard-deposit-preset" onclick="setDepositPercent(100)">100%</button>
                </div>
                <div class="wizard-deposit-info">
                    Total del pedido: $${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                </div>
            </div>

            <div class="wizard-form-group">
                <label for="wizard-notes">Notas adicionales</label>
                <textarea id="wizard-notes" rows="3" placeholder="Instrucciones especiales, detalles del diseño, etc.">${escapeHtml(orderWizardState.notes)}</textarea>
            </div>
        </div>
    `;

    orderWizardState.currentStep = 3;
}

/**
 * Step 4: Confirm and create
 */
function showOrderWizardStep4() {
    const modal = document.querySelector('#order-wizard-modal .wizard-body');
    const steps = document.querySelectorAll('#order-wizard-modal .wizard-step');
    steps.forEach((s, i) => s.classList.toggle('active', i <= 3));

    const products = orderWizardState.products;
    const total = products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
    const remaining = total - orderWizardState.depositAmount;

    modal.innerHTML = `
        <div class="wizard-confirmation">
            <h3>✅ Confirmar Pedido</h3>

            <div class="wizard-confirm-section">
                <div class="confirm-label">Cliente:</div>
                <div class="confirm-value">${escapeHtml(orderWizardState.clientName)} - ${escapeHtml(orderWizardState.clientPhone)}</div>
            </div>

            <div class="wizard-confirm-section">
                <div class="confirm-label">Productos:</div>
                ${products.map(p => `
                    <div class="confirm-product">
                        ${escapeHtml(p.name)} × ${p.quantity.toLocaleString('es-MX')} @ $${p.unitPrice.toFixed(2)} = $${(p.quantity * p.unitPrice).toLocaleString('es-MX', {minimumFractionDigits: 2})}
                    </div>
                `).join('')}
            </div>

            <div class="wizard-confirm-section">
                <div class="confirm-label">Entrega:</div>
                <div class="confirm-value">${orderWizardState.deliveryMethod === 'pickup' ? '🏪 Recoger en tienda' : '📦 Envío'}</div>
            </div>

            ${orderWizardState.eventDate ? `
                <div class="wizard-confirm-section">
                    <div class="confirm-label">Fecha del Evento:</div>
                    <div class="confirm-value">📅 ${new Date(orderWizardState.eventDate).toLocaleDateString('es-MX')}</div>
                </div>
            ` : ''}

            ${orderWizardState.salesRep ? `
                <div class="wizard-confirm-section">
                    <div class="confirm-label">Vendedor:</div>
                    <div class="confirm-value">👤 ${escapeHtml(orderWizardState.salesRep)}</div>
                </div>
            ` : ''}

            <div class="wizard-confirm-totals">
                <div class="confirm-total-row">
                    <span>Total del Pedido:</span>
                    <span class="total-amount">$${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="confirm-total-row highlight">
                    <span>Anticipo:</span>
                    <span class="deposit-amount">$${orderWizardState.depositAmount.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="confirm-total-row">
                    <span>Saldo Restante:</span>
                    <span class="remaining-amount">$${remaining.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                </div>
            </div>

            ${orderWizardState.notes ? `
                <div class="wizard-confirm-section">
                    <div class="confirm-label">Notas:</div>
                    <div class="confirm-value">${escapeHtml(orderWizardState.notes)}</div>
                </div>
            ` : ''}
        </div>
    `;

    // Update footer buttons
    const footer = document.querySelector('#order-wizard-modal .wizard-footer');
    footer.innerHTML = `
        <button onclick="orderWizardBack()" class="wizard-btn wizard-btn-secondary">← Atrás</button>
        <button onclick="executeOrderCreation()" class="wizard-btn wizard-btn-success" id="create-order-btn">
            ✓ Crear Pedido
        </button>
    `;

    orderWizardState.currentStep = 4;
}

/**
 * Navigate to next step
 */
function orderWizardNext(fromStep) {
    if (fromStep === 1) {
        // Validate step 1
        const clientName = document.getElementById('wizard-client-name')?.value.trim();
        const clientPhone = document.getElementById('wizard-client-phone')?.value.trim();

        if (!clientName) {
            alert('Por favor ingresa el nombre del cliente');
            return;
        }
        if (!clientPhone) {
            alert('Por favor ingresa el teléfono del cliente');
            return;
        }

        orderWizardState.clientName = clientName;
        orderWizardState.clientPhone = clientPhone;
        showOrderWizardStep2();

        // Update footer
        const footer = document.querySelector('#order-wizard-modal .wizard-footer');
        footer.innerHTML = `
            <button onclick="orderWizardBack()" class="wizard-btn wizard-btn-secondary">← Atrás</button>
            <button onclick="orderWizardNext(2)" class="wizard-btn wizard-btn-primary">Siguiente →</button>
        `;
    } else if (fromStep === 2) {
        // Save step 2 data
        orderWizardState.eventDate = document.getElementById('wizard-event-date')?.value || '';
        showOrderWizardStep3();

        // Update footer
        const footer = document.querySelector('#order-wizard-modal .wizard-footer');
        footer.innerHTML = `
            <button onclick="orderWizardBack()" class="wizard-btn wizard-btn-secondary">← Atrás</button>
            <button onclick="orderWizardNext(3)" class="wizard-btn wizard-btn-primary">Siguiente →</button>
        `;
    } else if (fromStep === 3) {
        // Save step 3 data
        orderWizardState.salesRep = document.getElementById('wizard-sales-rep')?.value || '';
        orderWizardState.depositAmount = parseFloat(document.getElementById('wizard-deposit')?.value) || 0;
        orderWizardState.notes = document.getElementById('wizard-notes')?.value || '';
        showOrderWizardStep4();
    }
}

/**
 * Navigate back
 */
function orderWizardBack() {
    const currentStep = orderWizardState.currentStep;

    if (currentStep === 2) {
        showOrderWizardStep1();
    } else if (currentStep === 3) {
        showOrderWizardStep2();
        const footer = document.querySelector('#order-wizard-modal .wizard-footer');
        footer.innerHTML = `
            <button onclick="orderWizardBack()" class="wizard-btn wizard-btn-secondary">← Atrás</button>
            <button onclick="orderWizardNext(2)" class="wizard-btn wizard-btn-primary">Siguiente →</button>
        `;
    } else if (currentStep === 4) {
        showOrderWizardStep3();
        const footer = document.querySelector('#order-wizard-modal .wizard-footer');
        footer.innerHTML = `
            <button onclick="orderWizardBack()" class="wizard-btn wizard-btn-secondary">← Atrás</button>
            <button onclick="orderWizardNext(3)" class="wizard-btn wizard-btn-primary">Siguiente →</button>
        `;
    }
}

/**
 * Update delivery method radio selection
 */
function updateDeliveryMethod(method) {
    orderWizardState.deliveryMethod = method;
    document.querySelectorAll('.wizard-radio').forEach(r => {
        r.classList.toggle('selected', r.querySelector('input').value === method);
    });
}

/**
 * Set deposit percentage
 */
function setDepositPercent(percent) {
    const total = orderWizardState.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
    const deposit = Math.ceil(total * (percent / 100));
    document.getElementById('wizard-deposit').value = deposit;
}

/**
 * Close the wizard
 */
function closeOrderWizard() {
    const modal = document.getElementById('order-wizard-modal');
    if (modal) modal.remove();
}

/**
 * Execute the order creation
 */
async function executeOrderCreation() {
    const btn = document.getElementById('create-order-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Creando...';
    }

    try {
        const token = localStorage.getItem('admin_token');
        const total = orderWizardState.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);

        // Prepare order data
        const orderData = {
            clientName: orderWizardState.clientName,
            clientPhone: orderWizardState.clientPhone,
            items: orderWizardState.products.map(p => ({
                productName: p.name,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
                productionCost: p.productionCost || p.unitPrice * 0.4
            })),
            totalPrice: total,
            depositAmount: orderWizardState.depositAmount,
            depositPaid: orderWizardState.depositAmount > 0,
            deliveryMethod: orderWizardState.deliveryMethod,
            salesRep: orderWizardState.salesRep || null,
            eventDate: orderWizardState.eventDate || null,
            notes: orderWizardState.notes || null,
            status: 'Nuevo',
            approvalStatus: 'pending_review'
        };

        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
            // Close wizard
            closeOrderWizard();

            // Show success message in chat
            const messagesContainer = document.getElementById('ai-chat-messages');
            if (messagesContainer) {
                const successHTML = `
                    <div class="ai-message assistant">
                        <div class="ai-message-avatar">🤖</div>
                        <div class="ai-message-content">
                            <div class="ai-order-created">
                                <div class="order-created-header">
                                    <span class="order-created-icon">✅</span>
                                    <div>
                                        <div class="order-created-title">¡Pedido Creado!</div>
                                        <div class="order-created-number">${result.data?.orderNumber || 'Nuevo Pedido'}</div>
                                    </div>
                                </div>
                                <div class="order-created-details">
                                    <p><strong>Cliente:</strong> ${escapeHtml(orderWizardState.clientName)}</p>
                                    <p><strong>Total:</strong> $${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                                    <p><strong>Anticipo:</strong> $${orderWizardState.depositAmount.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                                </div>
                                <button onclick="closeAiChatModal(); if(typeof loadOrders === 'function') loadOrders();" class="order-created-btn">
                                    Ver en Pedidos →
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                messagesContainer.insertAdjacentHTML('beforeend', successHTML);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

            // Refresh orders list if function exists
            if (typeof loadOrders === 'function') {
                loadOrders();
            }
        } else {
            throw new Error(result.error || 'Error al crear el pedido');
        }
    } catch (error) {
        console.error('Error creating order:', error);
        alert('Error al crear el pedido: ' + error.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '✓ Crear Pedido';
        }
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

// Export order wizard functions
window.startOrderCreationWizard = startOrderCreationWizard;
window.closeOrderWizard = closeOrderWizard;
window.orderWizardNext = orderWizardNext;
window.orderWizardBack = orderWizardBack;
window.updateDeliveryMethod = updateDeliveryMethod;
window.setDepositPercent = setDepositPercent;
window.executeOrderCreation = executeOrderCreation;

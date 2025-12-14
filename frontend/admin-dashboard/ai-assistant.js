/**
 * AI Assistant - Universal Business Knowledge Chatbot
 * Powered by Claude API
 */

// Session management
let aiSessionId = localStorage.getItem('ai_session_id') || generateSessionId();
localStorage.setItem('ai_session_id', aiSessionId);

// Track mini chart instances for cleanup
let miniChartInstances = [];

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
        // Parse markdown-like formatting
        const formattedContent = formatAiResponse(content);

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
// NAVIGATION (keeps modal open)
// =====================================================

function navigateToSection(section) {
    // Use existing navigation function if available
    if (typeof showView === 'function') {
        showView(section);
    } else {
        // Fallback: click on nav button
        const navBtn = document.querySelector(`[data-view="${section}"]`);
        if (navBtn) {
            navBtn.click();
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
    console.log('🤖 AI Assistant initialized');
});

/**
 * AI Assistant - Universal Business Knowledge Chatbot
 * Powered by Claude API
 */

// Session management
let aiSessionId = localStorage.getItem('ai_session_id') || generateSessionId();
localStorage.setItem('ai_session_id', aiSessionId);

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

        // Add quick stats if available
        if (data.quickStats && Object.keys(data.quickStats).length > 0) {
            extraContent += '<div class="ai-quick-stats">';
            for (const [key, value] of Object.entries(data.quickStats)) {
                const label = formatStatLabel(key);
                extraContent += `
                    <div class="ai-stat-card">
                        <span class="ai-stat-value">${formatStatValue(key, value)}</span>
                        <span class="ai-stat-label">${label}</span>
                    </div>
                `;
            }
            extraContent += '</div>';
        }

        // Add suggested section link if available
        if (data.suggestedSection && data.suggestedSection !== 'none') {
            const sectionInfo = getSectionInfo(data.suggestedSection);
            if (sectionInfo) {
                extraContent += `
                    <div class="ai-section-link">
                        <button class="ai-section-btn" onclick="navigateToSection('${data.suggestedSection}'); closeAiChatModal();">
                            ${sectionInfo.icon} Ver ${sectionInfo.name}
                        </button>
                    </div>
                `;
            }
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

function formatStatLabel(key) {
    const labels = {
        totalRevenue: 'Ingresos',
        totalOrders: 'Pedidos',
        pendingOrders: 'Pendientes',
        inProduction: 'En Producción',
        avgOrderValue: 'Promedio',
        totalClients: 'Clientes',
        topProduct: 'Top Producto'
    };
    return labels[key] || key;
}

function formatStatValue(key, value) {
    if (key.includes('Revenue') || key.includes('Value') || key.includes('total')) {
        if (typeof value === 'number') {
            return '$' + value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }
    }
    return value;
}

function getSectionInfo(section) {
    const sections = {
        'orders': { name: 'Pedidos', icon: '📋' },
        'analytics': { name: 'Analíticas', icon: '📊' },
        'products': { name: 'Productos', icon: '🛍️' },
        'prices': { name: 'Precios', icon: '💰' },
        'shipping': { name: 'Envíos', icon: '📦' },
        'calendar': { name: 'Calendario', icon: '📅' },
        'discounts': { name: 'Descuentos', icon: '🏷️' }
    };
    return sections[section];
}

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

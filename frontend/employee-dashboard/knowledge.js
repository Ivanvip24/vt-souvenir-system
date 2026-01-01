/**
 * AI-Powered Knowledge Base Module
 * Chat with Axkan brand knowledge using Claude API
 */

const knowledgeState = {
  conversationId: null,
  messages: [],
  isLoading: false,
  currentView: 'chat' // 'chat' or 'images'
};

// ========================================
// CHAT INTERFACE
// ========================================

async function sendKnowledgeMessage() {
  const input = document.getElementById('knowledge-input');
  const message = input.value.trim();

  if (!message || knowledgeState.isLoading) return;

  // Clear input
  input.value = '';

  // Add user message to UI
  addMessageToUI('user', message);

  // Show loading indicator
  knowledgeState.isLoading = true;
  showTypingIndicator();

  try {
    const response = await fetch(`${API_BASE}/knowledge/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: knowledgeState.conversationId,
        message: message
      })
    });

    const data = await response.json();
    hideTypingIndicator();
    knowledgeState.isLoading = false;

    if (data.success) {
      // Update conversation ID if new
      if (data.conversationId) {
        knowledgeState.conversationId = data.conversationId;
      }

      // Add AI response to UI
      addMessageToUI('assistant', data.answer);

      // Save to state
      knowledgeState.messages.push(
        { role: 'user', content: message },
        { role: 'assistant', content: data.answer }
      );
    } else {
      addMessageToUI('error', data.error || 'Error al procesar el mensaje');
    }

  } catch (error) {
    console.error('Chat error:', error);
    hideTypingIndicator();
    knowledgeState.isLoading = false;
    addMessageToUI('error', 'Error de conexión. Intenta de nuevo.');
  }
}

async function askQuickQuestion(question) {
  // For quick questions without conversation context
  const input = document.getElementById('knowledge-input');
  input.value = question;
  sendKnowledgeMessage();
}

function addMessageToUI(role, content) {
  const messagesContainer = document.getElementById('knowledge-messages');
  if (!messagesContainer) return;

  const messageEl = document.createElement('div');
  messageEl.className = `knowledge-message knowledge-message-${role}`;

  const userIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const botIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2z"/><circle cx="8" cy="14" r="1.5"/><circle cx="16" cy="14" r="1.5"/><path d="M9 18h6"/></svg>`;
  const errorIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  if (role === 'user') {
    messageEl.innerHTML = `
      <div class="message-avatar">${userIcon}</div>
      <div class="message-content">
        <div class="message-text">${escapeHtml(content)}</div>
      </div>
    `;
  } else if (role === 'assistant') {
    messageEl.innerHTML = `
      <div class="message-avatar">${botIcon}</div>
      <div class="message-content">
        <div class="message-text">${formatAIResponse(content)}</div>
      </div>
    `;
  } else if (role === 'error') {
    messageEl.innerHTML = `
      <div class="message-avatar">${errorIcon}</div>
      <div class="message-content message-error">
        <div class="message-text">${escapeHtml(content)}</div>
      </div>
    `;
  }

  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
  const messagesContainer = document.getElementById('knowledge-messages');
  if (!messagesContainer) return;

  const botIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2z"/><circle cx="8" cy="14" r="1.5"/><circle cx="16" cy="14" r="1.5"/><path d="M9 18h6"/></svg>`;

  const indicator = document.createElement('div');
  indicator.className = 'knowledge-message knowledge-message-assistant typing-indicator';
  indicator.id = 'typing-indicator';
  indicator.innerHTML = `
    <div class="message-avatar">${botIcon}</div>
    <div class="message-content">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesContainer.appendChild(indicator);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

function formatAIResponse(text) {
  // Format markdown-like content
  let html = escapeHtml(text)
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // HEX colors - add color preview
    .replace(/(#[0-9A-Fa-f]{6})/g, '<span class="color-preview" style="background-color:$1"></span><code>$1</code>')
    // Line breaks
    .replace(/\n/g, '<br>');

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function clearKnowledgeConversation() {
  knowledgeState.conversationId = null;
  knowledgeState.messages = [];

  let messagesContainer = document.getElementById('knowledge-messages');

  // Fallback: create chat section if it doesn't exist (for old HTML)
  if (!messagesContainer) {
    console.log('Creating chat section dynamically...');
    const chatSection = document.getElementById('knowledge-chat-section') ||
                        document.getElementById('knowledge-search-section');

    if (chatSection) {
      chatSection.id = 'knowledge-chat-section';
      chatSection.className = 'knowledge-chat-section';
      chatSection.innerHTML = `
        <div id="knowledge-messages" class="knowledge-messages"></div>
        <div class="knowledge-input-area">
          <button id="knowledge-new-chat" class="btn-icon" title="Nueva conversación">🔄</button>
          <div class="knowledge-input-wrapper">
            <input type="text" id="knowledge-input" class="knowledge-input"
                   placeholder="Pregunta sobre colores, tipografía, precios, ventas...">
            <button id="knowledge-send-btn" class="btn-send">➤</button>
          </div>
        </div>
      `;
      messagesContainer = document.getElementById('knowledge-messages');
      // Re-init event listeners for new elements
      initKnowledgeEventListeners();
      knowledgeInitialized = false;
      initKnowledgeEventListeners();
    }
  }

  if (!messagesContainer) {
    console.error('Could not find or create knowledge-messages container');
    return;
  }

  messagesContainer.innerHTML = `
    <div class="knowledge-welcome">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: #e72a88; margin-bottom: 16px;">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <h3>Asistente de Marca AXKAN</h3>
      <p>Preguntame sobre colores, tipografia, productos, precios o cualquier aspecto de la marca.</p>
      <div class="quick-questions">
        <button onclick="askQuickQuestion('Cuales son los colores principales de la marca?')">Colores de marca</button>
        <button onclick="askQuickQuestion('Cual es la tipografia de AXKAN?')">Tipografia</button>
        <button onclick="askQuickQuestion('Cuales son los precios de los imanes?')">Precios</button>
        <button onclick="askQuickQuestion('Dame un guion de venta para Facebook')">Guion de ventas</button>
      </div>
    </div>
  `;
  console.log('Welcome message rendered');
}

// ========================================
// IMAGE BROWSER
// ========================================

async function loadKnowledgeImages() {
  const container = document.getElementById('knowledge-images-browser');

  container.innerHTML = '<div class="knowledge-loading"><span class="spinner"></span> Cargando imágenes...</div>';

  try {
    const response = await fetch(`${API_BASE}/knowledge/images`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();

    if (!data.success || !data.images || data.images.length === 0) {
      container.innerHTML = `
        <div class="knowledge-empty">
          <span class="empty-icon">🖼️</span>
          <p>No hay imágenes disponibles</p>
        </div>
      `;
      return;
    }

    // Group by category
    const grouped = {};
    data.images.forEach(img => {
      const cat = img.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(img);
    });

    container.innerHTML = Object.entries(grouped).map(([cat, images]) => `
      <div class="knowledge-image-category">
        <h4>${cat === 'brand-manual' ? '📋 Manual de Marca' : '🎬 Frames de Video'}</h4>
        <div class="knowledge-images-grid">
          ${images.map(img => `
            <div class="knowledge-image-item" onclick="openKnowledgeImageModal('${img.path}', '${escapeHtml(img.description)}')">
              <img src="${API_BASE.replace('/api', '')}/axkan-assets/${img.path}" alt="${escapeHtml(img.description)}" loading="lazy">
              <div class="knowledge-image-info">
                <span class="knowledge-image-name">${escapeHtml(img.filename)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Load images error:', error);
    container.innerHTML = `
      <div class="knowledge-empty">
        <span class="empty-icon">⚠️</span>
        <p>Error al cargar imágenes</p>
      </div>
    `;
  }
}

function openKnowledgeImageModal(imagePath, description) {
  const baseUrl = API_BASE.replace('/api', '');
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'knowledge-image-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeKnowledgeImageModal()"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3>${escapeHtml(description)}</h3>
        <button class="btn-close" onclick="closeKnowledgeImageModal()">&times;</button>
      </div>
      <div class="modal-body" style="text-align: center; padding: 0; background: #1a1a2e;">
        <img src="${baseUrl}/axkan-assets/${imagePath}" alt="${escapeHtml(description)}"
             style="max-width: 100%; max-height: 70vh;">
      </div>
      <div class="modal-footer">
        <a href="${baseUrl}/axkan-assets/${imagePath}" download class="btn btn-primary">
          ⬇️ Descargar
        </a>
        <button class="btn btn-secondary" onclick="closeKnowledgeImageModal()">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeKnowledgeImageModal() {
  const modal = document.getElementById('knowledge-image-modal');
  if (modal) modal.remove();
}

// ========================================
// VIEW SWITCHING
// ========================================

function switchKnowledgeView(view) {
  knowledgeState.currentView = view;

  // Update tab buttons
  document.querySelectorAll('#knowledge-view .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Show/hide sections
  const chatSection = document.getElementById('knowledge-chat-section');
  const imagesSection = document.getElementById('knowledge-images-section');

  if (chatSection) chatSection.classList.toggle('hidden', view !== 'chat');
  if (imagesSection) imagesSection.classList.toggle('hidden', view !== 'images');

  if (view === 'images') {
    loadKnowledgeImages();
  }
}

// ========================================
// INITIALIZATION
// ========================================

let knowledgeInitialized = false;

function initKnowledgeEventListeners() {
  if (knowledgeInitialized) return;

  // Chat input - send on Enter
  const input = document.getElementById('knowledge-input');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendKnowledgeMessage();
      }
    });
  }

  // Send button
  const sendBtn = document.getElementById('knowledge-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', sendKnowledgeMessage);
  }

  // New chat button
  const newChatBtn = document.getElementById('knowledge-new-chat');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', clearKnowledgeConversation);
  }

  // View toggle buttons - updated for new HTML structure
  const tabContainer = document.querySelector('#knowledge-view .tabs-row');
  if (tabContainer) {
    tabContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (btn && btn.dataset.view) {
        tabContainer.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        switchKnowledgeView(btn.dataset.view);
      }
    });
  }

  knowledgeInitialized = true;
  console.log('Knowledge AI event listeners initialized');
}

async function loadKnowledge() {
  console.log('Loading AI knowledge view...');

  // Initialize event listeners
  initKnowledgeEventListeners();

  // Reset to chat view
  switchKnowledgeView('chat');

  // Show welcome screen
  clearKnowledgeConversation();

  // Check AI status
  try {
    const response = await fetch(`${API_BASE}/knowledge/ai/stats`);
    const data = await response.json();
    console.log('AI Knowledge stats:', data);

    if (data.success && data.stats) {
      const statsEl = document.getElementById('knowledge-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <span>${data.stats.documentsLoaded} docs</span>
          <span>${Math.round(data.stats.totalChars / 1000)}K chars</span>
          <span class="${data.stats.apiConfigured ? 'status-ok' : 'status-error'}">
            ${data.stats.apiConfigured ? '✅ API' : '❌ API'}
          </span>
        `;
      }
    }
  } catch (e) {
    console.warn('Could not load AI knowledge stats:', e);
  }
}

// Helper to get auth headers (if employee is logged in)
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('employeeToken');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Initialize when DOM is ready (backup)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initKnowledgeEventListeners);
} else {
  initKnowledgeEventListeners();
}

// Make functions globally available
window.loadKnowledge = loadKnowledge;
window.sendKnowledgeMessage = sendKnowledgeMessage;
window.askQuickQuestion = askQuickQuestion;
window.clearKnowledgeConversation = clearKnowledgeConversation;
window.switchKnowledgeView = switchKnowledgeView;
window.openKnowledgeImageModal = openKnowledgeImageModal;
window.closeKnowledgeImageModal = closeKnowledgeImageModal;

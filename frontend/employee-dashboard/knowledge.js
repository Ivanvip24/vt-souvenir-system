/**
 * Knowledge Base Module
 * Search and browse Axkan brand content
 */

const knowledgeState = {
  results: [],
  images: [],
  currentCategory: null,
  currentView: 'search', // 'search' or 'images'
  selectedDocument: null,
  searchQuery: ''
};

// Categories with display names
const KNOWLEDGE_CATEGORIES = {
  'brand-identity': { name: 'Identidad de Marca', icon: '🎨' },
  'sales': { name: 'Ventas', icon: '💰' },
  'visual-assets': { name: 'Recursos Visuales', icon: '🖼️' },
  'overview': { name: 'General', icon: '📋' },
  'general': { name: 'General', icon: '📄' }
};

// ========================================
// SEARCH
// ========================================

let knowledgeSearchTimeout;

async function searchKnowledge(query) {
  if (!query || query.length < 2) {
    clearKnowledgeResults();
    return;
  }

  const loading = document.getElementById('knowledge-loading');
  const resultsContainer = document.getElementById('knowledge-results');

  loading.classList.remove('hidden');
  resultsContainer.innerHTML = '';

  try {
    let url = `/knowledge/search?q=${encodeURIComponent(query)}&limit=20`;
    if (knowledgeState.currentCategory) {
      url += `&category=${knowledgeState.currentCategory}`;
    }

    const data = await apiGet(url);

    loading.classList.add('hidden');

    if (!data.success) {
      showToast(data.error || 'Error en búsqueda', 'error');
      return;
    }

    knowledgeState.results = data.results;
    knowledgeState.images = data.images;
    knowledgeState.searchQuery = query;

    renderKnowledgeResults();
    renderKnowledgeImageResults();

    // Show result count
    const countEl = document.getElementById('knowledge-result-count');
    countEl.textContent = `${data.totalResults} resultados${data.totalImages ? `, ${data.totalImages} imágenes` : ''}`;
    countEl.classList.remove('hidden');

  } catch (error) {
    console.error('Knowledge search error:', error);
    loading.classList.add('hidden');
    showToast('Error de conexión', 'error');
  }
}

function clearKnowledgeResults() {
  knowledgeState.results = [];
  knowledgeState.images = [];
  knowledgeState.searchQuery = '';
  document.getElementById('knowledge-results').innerHTML = '';
  document.getElementById('knowledge-images-results').innerHTML = '';
  document.getElementById('knowledge-result-count').classList.add('hidden');
}

function escapeHtmlKnowledge(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderKnowledgeResults() {
  const container = document.getElementById('knowledge-results');

  if (knowledgeState.results.length === 0) {
    container.innerHTML = `
      <div class="knowledge-empty">
        <span class="empty-icon">🔍</span>
        <p>No se encontraron resultados</p>
      </div>
    `;
    return;
  }

  // Group results by document
  const grouped = {};
  knowledgeState.results.forEach(result => {
    if (!grouped[result.documentId]) {
      grouped[result.documentId] = {
        id: result.documentId,
        title: result.documentTitle,
        category: result.category,
        filename: result.filename,
        sections: []
      };
    }
    grouped[result.documentId].sections.push(result);
  });

  container.innerHTML = Object.values(grouped).map(doc => `
    <div class="knowledge-document">
      <div class="knowledge-doc-header" onclick="toggleKnowledgeDocSections('${doc.id}')">
        <div class="knowledge-doc-info">
          <span class="knowledge-doc-category">${KNOWLEDGE_CATEGORIES[doc.category]?.icon || '📄'} ${KNOWLEDGE_CATEGORIES[doc.category]?.name || doc.category}</span>
          <h4>${escapeHtmlKnowledge(doc.title)}</h4>
        </div>
        <span class="knowledge-doc-toggle" id="toggle-${doc.id}">▼</span>
      </div>
      <div class="knowledge-doc-sections" id="sections-${doc.id}">
        ${doc.sections.map(section => `
          <div class="knowledge-result" onclick="viewKnowledgeSection('${doc.id}', ${section.startLine})">
            <div class="knowledge-result-heading">
              ${'#'.repeat(section.sectionLevel)} ${escapeHtmlKnowledge(section.sectionHeading)}
            </div>
            <div class="knowledge-result-snippet">${highlightKnowledgeQuery(escapeHtmlKnowledge(section.snippet), knowledgeState.searchQuery)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderKnowledgeImageResults() {
  const container = document.getElementById('knowledge-images-results');

  if (knowledgeState.images.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="knowledge-images-header">
      <h4>🖼️ Imágenes relacionadas</h4>
    </div>
    <div class="knowledge-images-grid">
      ${knowledgeState.images.map(img => `
        <div class="knowledge-image-item" onclick="openKnowledgeImageModal('${img.path}', '${escapeHtmlKnowledge(img.description)}')">
          <img src="/axkan-assets/${img.path}" alt="${escapeHtmlKnowledge(img.description)}" loading="lazy">
          <div class="knowledge-image-info">
            <span class="knowledge-image-name">${escapeHtmlKnowledge(img.filename)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function highlightKnowledgeQuery(text, query) {
  if (!query) return text;
  const words = query.split(/\s+/).filter(w => w.length > 1);
  let result = text;
  words.forEach(word => {
    const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  });
  return result;
}

function toggleKnowledgeDocSections(docId) {
  const sections = document.getElementById(`sections-${docId}`);
  const toggle = document.getElementById(`toggle-${docId}`);
  sections.classList.toggle('expanded');
  toggle.textContent = sections.classList.contains('expanded') ? '▲' : '▼';
}

// ========================================
// DOCUMENT VIEWER
// ========================================

async function viewKnowledgeSection(documentId, startLine) {
  try {
    const data = await apiGet(`/knowledge/document/${documentId}`);

    if (!data.success) {
      showToast(data.error || 'Error al cargar documento', 'error');
      return;
    }

    openKnowledgeDocumentModal(data.document, startLine);

  } catch (error) {
    console.error('Load document error:', error);
    showToast('Error de conexión', 'error');
  }
}

function openKnowledgeDocumentModal(doc, scrollToLine = null) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'knowledge-doc-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeKnowledgeDocModal()"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <div>
          <span class="knowledge-doc-category">${KNOWLEDGE_CATEGORIES[doc.category]?.icon || '📄'} ${KNOWLEDGE_CATEGORIES[doc.category]?.name || doc.category}</span>
          <h3>${escapeHtmlKnowledge(doc.title)}</h3>
        </div>
        <button class="btn-close" onclick="closeKnowledgeDocModal()">&times;</button>
      </div>
      <div class="modal-body knowledge-document-content" id="doc-content-view">
        ${renderKnowledgeMarkdown(doc.fullContent)}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Scroll to relevant section if specified
  if (scrollToLine) {
    setTimeout(() => {
      const content = document.getElementById('doc-content-view');
      if (content) {
        const scrollPos = Math.max(0, (scrollToLine - 5) * 24);
        content.scrollTop = scrollPos;
      }
    }, 100);
  }
}

function closeKnowledgeDocModal() {
  const modal = document.getElementById('knowledge-doc-modal');
  if (modal) modal.remove();
}

function renderKnowledgeMarkdown(content) {
  // Simple markdown rendering
  let html = content
    // Code blocks (before other processing)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Lists (basic)
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

  // Wrap consecutive li elements in ul
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs (simple approach)
  html = html.split('\n\n').map(block => {
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<pre') || block.startsWith('<hr')) {
      return block;
    }
    return `<p>${block}</p>`;
  }).join('\n');

  return html;
}

// ========================================
// IMAGE BROWSER
// ========================================

async function loadKnowledgeImages() {
  const container = document.getElementById('knowledge-images-browser');
  const loading = document.getElementById('knowledge-images-loading');

  loading.classList.remove('hidden');
  container.innerHTML = '';

  try {
    const data = await apiGet('/knowledge/images');

    loading.classList.add('hidden');

    if (!data.success || data.images.length === 0) {
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
            <div class="knowledge-image-item" onclick="openKnowledgeImageModal('${img.path}', '${escapeHtmlKnowledge(img.description)}')">
              <img src="/axkan-assets/${img.path}" alt="${escapeHtmlKnowledge(img.description)}" loading="lazy">
              <div class="knowledge-image-info">
                <span class="knowledge-image-name">${escapeHtmlKnowledge(img.filename)}</span>
                <span class="knowledge-image-desc">${escapeHtmlKnowledge(img.description)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Load images error:', error);
    loading.classList.add('hidden');
    showToast('Error al cargar imágenes', 'error');
  }
}

function openKnowledgeImageModal(imagePath, description) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'knowledge-image-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeKnowledgeImageModal()"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3>${escapeHtmlKnowledge(description)}</h3>
        <button class="btn-close" onclick="closeKnowledgeImageModal()">&times;</button>
      </div>
      <div class="modal-body" style="text-align: center; padding: 0; background: #f5f5f5;">
        <img src="/axkan-assets/${imagePath}" alt="${escapeHtmlKnowledge(description)}"
             style="max-width: 100%; max-height: 70vh; border-radius: 0;">
      </div>
      <div class="modal-footer">
        <a href="/axkan-assets/${imagePath}" download class="btn btn-primary">
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

  document.querySelectorAll('.knowledge-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  document.getElementById('knowledge-search-section').classList.toggle('hidden', view !== 'search');
  document.getElementById('knowledge-images-section').classList.toggle('hidden', view !== 'images');

  if (view === 'images') {
    loadKnowledgeImages();
  }
}

// ========================================
// INITIALIZATION
// ========================================

async function loadKnowledge() {
  // Reset to search view
  switchKnowledgeView('search');

  // Clear previous search
  const searchInput = document.getElementById('knowledge-search');
  if (searchInput) {
    searchInput.value = '';
  }
  clearKnowledgeResults();

  // Load stats
  try {
    const data = await apiGet('/knowledge/stats');
    if (data.success) {
      const statsEl = document.getElementById('knowledge-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <span>${data.stats.documentCount} documentos</span>
          <span>${data.stats.imageCount} imágenes</span>
          <span>${data.stats.totalSections} secciones</span>
        `;
      }
    }
  } catch (e) {
    console.warn('Could not load knowledge stats');
  }
}

// ========================================
// EVENT LISTENERS
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  // Search input with debounce
  const searchInput = document.getElementById('knowledge-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(knowledgeSearchTimeout);
      knowledgeSearchTimeout = setTimeout(() => {
        searchKnowledge(e.target.value.trim());
      }, 300);
    });

    // Also handle Enter key
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(knowledgeSearchTimeout);
        searchKnowledge(e.target.value.trim());
      }
    });
  }

  // View toggle buttons
  document.querySelectorAll('.knowledge-view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchKnowledgeView(btn.dataset.view));
  });

  // Category filter buttons
  document.querySelectorAll('.knowledge-category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      knowledgeState.currentCategory = btn.dataset.category || null;
      document.querySelectorAll('.knowledge-category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Re-search if there's a query
      if (knowledgeState.searchQuery) {
        searchKnowledge(knowledgeState.searchQuery);
      }
    });
  });
});

// Make functions globally available for onclick handlers
window.loadKnowledge = loadKnowledge;
window.searchKnowledge = searchKnowledge;
window.viewKnowledgeSection = viewKnowledgeSection;
window.toggleKnowledgeDocSections = toggleKnowledgeDocSections;
window.openKnowledgeImageModal = openKnowledgeImageModal;
window.closeKnowledgeImageModal = closeKnowledgeImageModal;
window.closeKnowledgeDocModal = closeKnowledgeDocModal;
window.switchKnowledgeView = switchKnowledgeView;

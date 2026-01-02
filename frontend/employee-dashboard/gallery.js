/**
 * Gallery Module - Design file management with download/archive functionality
 */

const galleryState = {
    designs: [],
    archivedDesigns: [],
    categories: [],
    currentCategory: null,
    currentTab: 'active', // 'active' or 'archived'
    designList: [], // Designs added to the list for batch download
    recoveryList: [], // Designs added to the list for batch recovery
    searchQuery: ''
};

// ========================================
// GALLERY LOADING
// ========================================

async function loadGallery() {
    const loading = document.getElementById('gallery-loading');
    const empty = document.getElementById('gallery-empty');
    const grid = document.getElementById('gallery-grid');
    const archivedSection = document.getElementById('archived-section');

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    grid.innerHTML = '';

    try {
        // Load categories first
        await loadCategories();

        // Load stats for counts
        await loadGalleryStats();

        if (galleryState.currentTab === 'active') {
            // Load active designs
            await loadActiveDesigns();
            archivedSection.classList.add('hidden');
            grid.style.display = '';
        } else {
            // Load archived designs
            await loadArchivedDesigns();
            grid.style.display = 'none';
            archivedSection.classList.remove('hidden');
        }

        loading.classList.add('hidden');

    } catch (error) {
        console.error('Error loading gallery:', error);
        loading.classList.add('hidden');
        showToast('Error al cargar galería', 'error');
    }
}

async function loadActiveDesigns() {
    const empty = document.getElementById('gallery-empty');
    const grid = document.getElementById('gallery-grid');

    let url = '/gallery';
    const params = new URLSearchParams();

    if (galleryState.currentCategory) {
        params.append('category_id', galleryState.currentCategory);
    }
    if (galleryState.searchQuery) {
        params.append('search', galleryState.searchQuery);
    }

    if (params.toString()) {
        url += '?' + params.toString();
    }

    const data = await apiGet(url);

    if (!data.success || data.designs.length === 0) {
        empty.classList.remove('hidden');
        grid.innerHTML = '';
        return;
    }

    empty.classList.add('hidden');
    galleryState.designs = data.designs;
    renderGalleryGrid(grid, galleryState.designs, false);
}

async function loadArchivedDesigns() {
    const archivedGrid = document.getElementById('archived-grid');

    const data = await apiGet('/gallery/archived');

    if (!data.success || data.designs.length === 0) {
        archivedGrid.innerHTML = '<div class="empty-state"><span class="empty-icon">📦</span><h3>Sin archivos</h3><p>No hay diseños archivados</p></div>';
        return;
    }

    galleryState.archivedDesigns = data.designs;
    renderGalleryGrid(archivedGrid, galleryState.archivedDesigns, true);
}

async function loadGalleryStats() {
    try {
        const data = await apiGet('/gallery/stats/summary');
        if (data.success) {
            document.getElementById('active-count').textContent = data.stats.active_count || 0;
            document.getElementById('archived-count').textContent = data.stats.archived_count || 0;
        }
    } catch (error) {
        console.error('Error loading gallery stats:', error);
    }
}

async function loadCategories() {
    try {
        const data = await apiGet('/gallery/categories/list');

        if (data.success) {
            galleryState.categories = data.categories;
            populateCategoryFilter();
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function populateCategoryFilter() {
    const select = document.getElementById('category-filter');
    select.innerHTML = '<option value="">Todas las categorías</option>';

    galleryState.categories.forEach(cat => {
        select.innerHTML += `<option value="${cat.id}">${cat.icon || ''} ${cat.name} (${cat.design_count})</option>`;
    });
}

// ========================================
// GALLERY RENDERING
// ========================================

function renderGalleryGrid(container, designs, isArchived = false) {
    container.innerHTML = '';

    designs.forEach(design => {
        const isInDownloadList = galleryState.designList.some(d => d.id === design.id);
        const isInRecoveryList = galleryState.recoveryList.some(d => d.id === design.id);

        const item = document.createElement('div');
        item.className = `gallery-item${design.is_archived ? ' archived' : ''}`;
        item.dataset.id = design.id;

        let actionsHTML = '';
        if (isArchived || design.is_archived) {
            // Archived design - show recovery buttons
            actionsHTML = `
            <div class="gallery-item-actions">
                <button class="gallery-action-btn recover" onclick="event.stopPropagation(); recoverDesign(${design.id})" title="Recuperar">
                    🔄 Recuperar
                </button>
                <button class="gallery-action-btn add-to-recovery${isInRecoveryList ? ' added' : ''}" onclick="event.stopPropagation(); toggleRecoveryList(${design.id})" title="${isInRecoveryList ? 'Quitar de lista' : 'Agregar a lista'}">
                    ${isInRecoveryList ? '✓' : '+'} Lista
                </button>
            </div>
            `;
        } else {
            // Active design - show download buttons
            actionsHTML = `
            <div class="gallery-item-actions">
                <button class="gallery-action-btn download" onclick="event.stopPropagation(); downloadDesign(${design.id})" title="Descargar">
                    ⬇️ Descargar
                </button>
                <button class="gallery-action-btn add-to-list${isInDownloadList ? ' added' : ''}" onclick="event.stopPropagation(); toggleDesignList(${design.id})" title="${isInDownloadList ? 'Quitar de lista' : 'Agregar a lista'}">
                    ${isInDownloadList ? '✓' : '+'} Lista
                </button>
            </div>
            `;
        }

        item.innerHTML = `
            <img class="gallery-thumb" src="${design.thumbnail_url || design.file_url}" alt="${escapeHtml(design.name)}" loading="lazy">
            ${actionsHTML}
            <div class="gallery-info">
                <div class="gallery-name">${escapeHtml(design.name)}</div>
                <div class="gallery-category">${design.category_name || 'Sin categoría'}</div>
            </div>
        `;

        item.addEventListener('click', () => openDesignModal(design));
        container.appendChild(item);
    });
}

// ========================================
// DESIGN ACTIONS
// ========================================

async function downloadDesign(designId) {
    const design = galleryState.designs.find(d => d.id === designId);
    if (!design) return;

    try {
        showToast('Descargando...', 'info');

        // Fetch the image as a blob to force download (works with cross-origin URLs)
        const response = await fetch(design.file_url);
        const blob = await response.blob();

        // Create a blob URL and trigger download
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;

        // Get file extension from URL or default to jpg
        const extension = design.file_url.split('.').pop().split('?')[0] || 'jpg';
        link.download = `${design.name || 'design'}.${extension}`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob URL
        window.URL.revokeObjectURL(blobUrl);

        // Mark as downloaded in backend (archives it)
        const data = await apiPost(`/gallery/${designId}/download`, {});

        if (data.success) {
            showToast('Diseño descargado y archivado', 'success');

            // Remove from active designs and add to archived
            galleryState.designs = galleryState.designs.filter(d => d.id !== designId);

            // Re-render and update counts
            const grid = document.getElementById('gallery-grid');
            renderGalleryGrid(grid, galleryState.designs, false);
            await loadGalleryStats();

            // Also remove from design list if it was there
            removeFromDesignList(designId);
        }
    } catch (error) {
        console.error('Error downloading design:', error);
        showToast('Error al descargar diseño', 'error');
    }
}

async function restoreDesign(designId) {
    try {
        const data = await apiPost(`/gallery/${designId}/restore`, {});

        if (data.success) {
            showToast('Diseño restaurado', 'success');
            loadGallery();
        } else {
            showToast(data.error || 'Error al restaurar', 'error');
        }
    } catch (error) {
        console.error('Error restoring design:', error);
        showToast('Error al restaurar diseño', 'error');
    }
}

// Recover design (alias for restore with better UX)
async function recoverDesign(designId) {
    try {
        showToast('Recuperando diseño...', 'info');
        const data = await apiPost(`/gallery/${designId}/restore`, {});

        if (data.success) {
            showToast('Diseño recuperado', 'success');

            // Remove from archived designs
            galleryState.archivedDesigns = galleryState.archivedDesigns.filter(d => d.id !== designId);

            // Re-render archived grid and update counts
            const archivedGrid = document.getElementById('archived-grid');
            if (archivedGrid) {
                renderGalleryGrid(archivedGrid, galleryState.archivedDesigns, true);
            }
            await loadGalleryStats();

            // Also remove from recovery list if it was there
            removeFromRecoveryList(designId);
        } else {
            showToast(data.error || 'Error al recuperar', 'error');
        }
    } catch (error) {
        console.error('Error recovering design:', error);
        showToast('Error al recuperar diseño', 'error');
    }
}

// ========================================
// RECOVERY LIST (Batch recovery functionality)
// ========================================

function toggleRecoveryList(designId) {
    const design = galleryState.archivedDesigns.find(d => d.id === designId);
    if (!design) return;

    const existingIndex = galleryState.recoveryList.findIndex(d => d.id === designId);
    const panel = document.getElementById('recovery-list-panel');

    if (existingIndex >= 0) {
        galleryState.recoveryList.splice(existingIndex, 1);
        showToast('Removido de la lista de recuperación');
    } else {
        galleryState.recoveryList.push(design);
        showToast('Agregado a la lista de recuperación', 'success');

        // Auto-open panel when first item is added
        if (galleryState.recoveryList.length === 1 && panel) {
            panel.classList.add('open');
        }
    }

    updateRecoveryListUI();

    // Re-render to update button states
    const archivedGrid = document.getElementById('archived-grid');
    if (archivedGrid) {
        renderGalleryGrid(archivedGrid, galleryState.archivedDesigns, true);
    }
}

function removeFromRecoveryList(designId) {
    galleryState.recoveryList = galleryState.recoveryList.filter(d => d.id !== designId);
    updateRecoveryListUI();
}

function updateRecoveryListUI() {
    const panel = document.getElementById('recovery-list-panel');
    const content = document.getElementById('recovery-list-content');
    const toggle = document.getElementById('recovery-list-toggle');
    const badge = document.getElementById('recovery-list-badge');

    if (!panel || !content || !toggle || !badge) return;

    const count = galleryState.recoveryList.length;
    badge.textContent = count;

    // Show/hide the FAB toggle button
    if (count > 0) {
        toggle.classList.remove('hidden');
    } else {
        toggle.classList.add('hidden');
        panel.classList.remove('open');
    }

    if (count === 0) {
        content.innerHTML = `
            <div class="design-list-empty">
                <span style="font-size: 48px;">🔄</span>
                <p>Agrega diseños para recuperar</p>
            </div>
        `;
        return;
    }

    content.innerHTML = galleryState.recoveryList.map(design => `
        <div class="design-list-item" data-id="${design.id}">
            <img src="${design.thumbnail_url || design.file_url}" alt="${escapeHtml(design.name)}">
            <div class="design-list-item-info">
                <div class="design-list-item-name">${escapeHtml(design.name)}</div>
                <div class="design-list-item-category">${design.category_name || 'Sin categoría'}</div>
            </div>
            <button class="design-list-item-remove" onclick="removeFromRecoveryList(${design.id})">✕</button>
        </div>
    `).join('');
}

function clearRecoveryList() {
    galleryState.recoveryList = [];
    updateRecoveryListUI();

    // Re-render to update button states
    const archivedGrid = document.getElementById('archived-grid');
    if (archivedGrid) {
        renderGalleryGrid(archivedGrid, galleryState.archivedDesigns, true);
    }

    // Close panel
    const panel = document.getElementById('recovery-list-panel');
    if (panel) panel.classList.remove('open');
}

async function recoverAllDesigns() {
    if (galleryState.recoveryList.length === 0) {
        showToast('La lista está vacía', 'error');
        return;
    }

    showToast(`Recuperando ${galleryState.recoveryList.length} diseños...`);

    // Recover each design with a small delay
    for (const design of [...galleryState.recoveryList]) {
        await recoverDesign(design.id);
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    clearRecoveryList();
    showToast('Todos los diseños recuperados', 'success');
}

function toggleRecoveryListPanel() {
    const panel = document.getElementById('recovery-list-panel');
    if (panel) panel.classList.toggle('open');
}

// ========================================
// DESIGN LIST (Batch download functionality)
// ========================================

function toggleDesignList(designId) {
    const design = galleryState.designs.find(d => d.id === designId);
    if (!design) return;

    const existingIndex = galleryState.designList.findIndex(d => d.id === designId);
    const panel = document.getElementById('design-list-panel');

    if (existingIndex >= 0) {
        galleryState.designList.splice(existingIndex, 1);
        showToast('Removido de la lista');
    } else {
        galleryState.designList.push(design);
        showToast('Agregado a la lista', 'success');

        // Auto-open panel when first item is added
        if (galleryState.designList.length === 1) {
            panel.classList.add('open');
        }
    }

    updateDesignListUI();

    // Re-render to update button states
    const grid = document.getElementById('gallery-grid');
    renderGalleryGrid(grid, galleryState.designs, false);
}

function removeFromDesignList(designId) {
    galleryState.designList = galleryState.designList.filter(d => d.id !== designId);
    updateDesignListUI();
}

function updateDesignListUI() {
    const panel = document.getElementById('design-list-panel');
    const content = document.getElementById('design-list-content');
    const toggle = document.getElementById('design-list-toggle');
    const badge = document.getElementById('design-list-badge');
    const count = galleryState.designList.length;

    badge.textContent = count;

    // Show/hide the FAB toggle button
    if (count > 0) {
        toggle.classList.remove('hidden');
    } else {
        toggle.classList.add('hidden');
        // Close panel if it's open and list is empty
        panel.classList.remove('open');
    }

    if (count === 0) {
        content.innerHTML = `
            <div class="design-list-empty">
                <span style="font-size: 48px;">📋</span>
                <p>Agrega diseños a tu lista</p>
            </div>
        `;
        return;
    }

    content.innerHTML = galleryState.designList.map(design => `
        <div class="design-list-item" data-id="${design.id}">
            <img src="${design.thumbnail_url || design.file_url}" alt="${escapeHtml(design.name)}">
            <div class="design-list-item-info">
                <div class="design-list-item-name">${escapeHtml(design.name)}</div>
                <div class="design-list-item-category">${design.category_name || 'Sin categoría'}</div>
            </div>
            <button class="design-list-item-remove" onclick="removeFromDesignList(${design.id})">✕</button>
        </div>
    `).join('');
}

function clearDesignList() {
    galleryState.designList = [];
    updateDesignListUI();

    // Re-render to update button states
    const grid = document.getElementById('gallery-grid');
    renderGalleryGrid(grid, galleryState.designs, false);

    // Close panel
    document.getElementById('design-list-panel').classList.remove('open');
}

async function downloadAllDesigns() {
    if (galleryState.designList.length === 0) {
        showToast('La lista está vacía', 'error');
        return;
    }

    showToast(`Descargando ${galleryState.designList.length} diseños...`);

    // Download each design with a small delay
    for (const design of [...galleryState.designList]) {
        await downloadDesign(design.id);
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between downloads
    }

    clearDesignList();
    showToast('Todos los diseños descargados', 'success');
}

function toggleDesignListPanel() {
    const panel = document.getElementById('design-list-panel');
    panel.classList.toggle('open');
}

// ========================================
// DESIGN MODAL
// ========================================

function openDesignModal(design) {
    const isArchived = design.is_archived;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h3>${escapeHtml(design.name)}</h3>
                <button class="btn-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="text-align: center;">
                <img src="${design.file_url}" alt="${escapeHtml(design.name)}" style="max-width: 100%; max-height: 50vh; border-radius: 8px;">
                <div style="margin-top: 16px; text-align: left;">
                    <p><strong>Categoría:</strong> ${design.category_name || 'Sin categoría'}</p>
                    ${design.description ? `<p><strong>Descripción:</strong> ${escapeHtml(design.description)}</p>` : ''}
                    ${design.tags?.length ? `<p><strong>Etiquetas:</strong> ${design.tags.join(', ')}</p>` : ''}
                    <p><strong>Subido por:</strong> ${design.uploaded_by_name || 'Desconocido'}</p>
                    <p><strong>Fecha:</strong> ${formatDate(design.created_at)}</p>
                    ${isArchived ? `<p><strong>Archivado:</strong> ${formatDate(design.archived_at)} por ${design.archived_by_name || 'Desconocido'}</p>` : ''}
                    ${design.download_count ? `<p><strong>Descargas:</strong> ${design.download_count}</p>` : ''}
                </div>
            </div>
            <div class="modal-footer">
                ${isArchived ? `
                    <button class="btn btn-secondary" onclick="restoreDesign(${design.id}); this.closest('.modal').remove();">
                        🔄 Restaurar
                    </button>
                ` : `
                    <button class="btn btn-secondary" onclick="toggleDesignList(${design.id}); this.closest('.modal').remove();">
                        📋 ${galleryState.designList.some(d => d.id === design.id) ? 'Quitar de Lista' : 'Agregar a Lista'}
                    </button>
                    <button class="btn btn-primary" onclick="downloadDesign(${design.id}); this.closest('.modal').remove();">
                        ⬇️ Descargar
                    </button>
                `}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ========================================
// EVENT LISTENERS
// ========================================

let galleryInitialized = false;

function initGalleryEventListeners() {
    if (galleryInitialized) return;

    // Tab switching - use selector that matches the HTML structure
    document.querySelectorAll('#gallery-view .tab-btn[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#gallery-view .tab-btn[data-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            galleryState.currentTab = tab.dataset.tab;
            loadGallery();
        });
    });

    // Category filter
    document.getElementById('category-filter')?.addEventListener('change', (e) => {
        galleryState.currentCategory = e.target.value || null;
        loadGallery();
    });

    // Search with debounce
    let searchTimeout;
    document.getElementById('gallery-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            galleryState.searchQuery = e.target.value.trim();

            // Only search if we're on the active tab
            if (galleryState.currentTab === 'active') {
                loadGallery();
            }
        }, 300);
    });

    // Design list panel toggle
    document.getElementById('design-list-toggle')?.addEventListener('click', toggleDesignListPanel);
    document.getElementById('close-design-list')?.addEventListener('click', () => {
        document.getElementById('design-list-panel').classList.remove('open');
    });

    // Design list actions
    document.getElementById('clear-design-list')?.addEventListener('click', clearDesignList);
    document.getElementById('download-all-designs')?.addEventListener('click', downloadAllDesigns);

    // Upload button opens modal
    document.getElementById('upload-design-btn')?.addEventListener('click', openUploadModal);

    // Dropzone click
    document.getElementById('upload-dropzone')?.addEventListener('click', () => {
        document.getElementById('design-file').click();
    });

    // File input change
    document.getElementById('design-file')?.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // Change image button
    document.getElementById('change-image-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('design-file').click();
    });

    // Drag and drop
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            handleFileSelect(file);
        });
    }

    // Name input for submit button validation
    document.getElementById('design-name')?.addEventListener('input', updateSubmitButton);

    // Submit button
    document.getElementById('submit-design-btn')?.addEventListener('click', submitDesign);

    // Recovery list panel toggle
    document.getElementById('recovery-list-toggle')?.addEventListener('click', toggleRecoveryListPanel);
    document.getElementById('close-recovery-list')?.addEventListener('click', () => {
        document.getElementById('recovery-list-panel').classList.remove('open');
    });

    // Recovery list actions
    document.getElementById('clear-recovery-list')?.addEventListener('click', clearRecoveryList);
    document.getElementById('recover-all-designs')?.addEventListener('click', recoverAllDesigns);

    galleryInitialized = true;
    console.log('Gallery event listeners initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGalleryEventListeners);
} else {
    initGalleryEventListeners();
}

// ========================================
// UPLOAD FUNCTIONALITY
// ========================================

let selectedFile = null;

function openUploadModal() {
    console.log('openUploadModal called');

    const modal = document.getElementById('upload-design-modal');
    if (!modal) {
        console.error('Upload modal not found!');
        showToast('Error: Modal no encontrado', 'error');
        return;
    }

    // Reset form
    const form = document.getElementById('upload-design-form');
    if (form) form.reset();
    selectedFile = null;

    // Reset preview
    const preview = document.getElementById('upload-preview');
    const content = document.querySelector('.dropzone-content');
    if (preview) preview.classList.add('hidden');
    if (content) content.classList.remove('hidden');

    // Disable submit button
    const submitBtn = document.getElementById('submit-design-btn');
    if (submitBtn) submitBtn.disabled = true;

    // Populate categories
    const categorySelect = document.getElementById('design-category');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="">Sin categoría</option>';
        galleryState.categories.forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.id}">${cat.icon || ''} ${cat.name}</option>`;
        });
    }

    // Show modal
    modal.classList.remove('hidden');
    console.log('Upload modal should now be visible');
}

function handleFileSelect(file) {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Solo se permiten imágenes (JPG, PNG, GIF, WEBP)', 'error');
        return;
    }

    // Validate file size (15MB)
    if (file.size > 15 * 1024 * 1024) {
        showToast('La imagen es muy grande. Máximo 15MB', 'error');
        return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-image').src = e.target.result;
        document.getElementById('upload-preview').classList.remove('hidden');
        document.querySelector('.dropzone-content').classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // Enable submit button
    updateSubmitButton();
}

function updateSubmitButton() {
    const nameInput = document.getElementById('design-name');
    const submitBtn = document.getElementById('submit-design-btn');
    submitBtn.disabled = !selectedFile || !nameInput.value.trim();
}

async function submitDesign() {
    if (!selectedFile) {
        showToast('Selecciona una imagen', 'error');
        return;
    }

    const name = document.getElementById('design-name').value.trim();
    if (!name) {
        showToast('Ingresa un nombre para el diseño', 'error');
        return;
    }

    const submitBtn = document.getElementById('submit-design-btn');
    const btnText = document.getElementById('upload-btn-text');
    const btnLoading = document.getElementById('upload-btn-loading');

    // Show loading state
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('design', selectedFile);
        formData.append('name', name);
        formData.append('category_id', document.getElementById('design-category').value);
        formData.append('tags', document.getElementById('design-tags').value);
        formData.append('description', document.getElementById('design-description').value);

        const response = await fetch(`${API_BASE}/gallery/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showToast('Diseño subido correctamente', 'success');
            closeModal('upload-design-modal');
            loadGallery(); // Refresh gallery
        } else {
            showToast(data.error || 'Error al subir el diseño', 'error');
        }

    } catch (error) {
        console.error('Upload error:', error);
        showToast('Error al subir el diseño', 'error');
    } finally {
        // Reset loading state
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
}

// Event listeners are initialized in initGalleryEventListeners()

// Make functions globally available
window.loadGallery = loadGallery;
window.downloadDesign = downloadDesign;
window.restoreDesign = restoreDesign;
window.recoverDesign = recoverDesign;
window.toggleDesignList = toggleDesignList;
window.removeFromDesignList = removeFromDesignList;
window.clearDesignList = clearDesignList;
window.downloadAllDesigns = downloadAllDesigns;
window.toggleRecoveryList = toggleRecoveryList;
window.removeFromRecoveryList = removeFromRecoveryList;
window.clearRecoveryList = clearRecoveryList;
window.recoverAllDesigns = recoverAllDesigns;
window.openUploadModal = openUploadModal;

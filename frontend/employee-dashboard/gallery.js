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
            // Active design - show download buttons and Facebook button
            actionsHTML = `
            <div class="gallery-item-actions">
                <button class="gallery-action-btn download" onclick="event.stopPropagation(); downloadDesign(${design.id})" title="Descargar">
                    ⬇️ Descargar
                </button>
                <button class="gallery-action-btn add-to-list${isInDownloadList ? ' added' : ''}" onclick="event.stopPropagation(); toggleDesignList(${design.id})" title="${isInDownloadList ? 'Quitar de lista' : 'Agregar a lista'}">
                    ${isInDownloadList ? '✓' : '+'} Lista
                </button>
                <button class="gallery-action-btn facebook"
                        id="fb-gallery-${design.id}"
                        onclick="event.stopPropagation(); queueDesignForFacebook(${design.id})"
                        title="Facebook Marketplace">
                    f
                </button>
            </div>
            `;
        }

        // Show first 3 tags as preview
        const tagsPreview = design.tags?.length
            ? design.tags.slice(0, 3).map(t => `<span class="gallery-tag">${escapeHtml(t)}</span>`).join('') +
              (design.tags.length > 3 ? `<span class="gallery-tag more">+${design.tags.length - 3}</span>` : '')
            : '';

        item.innerHTML = `
            <img class="gallery-thumb" src="${design.thumbnail_url || design.file_url}" alt="${escapeHtml(design.name)}" loading="lazy">
            ${actionsHTML}
            <div class="gallery-info">
                <div class="gallery-name">${escapeHtml(design.name)}</div>
                <div class="gallery-category">${design.category_name || 'Sin categoría'}</div>
                ${tagsPreview ? `<div class="gallery-tags-preview">${tagsPreview}</div>` : ''}
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

    const downloadBtn = document.getElementById('download-all-designs');
    const originalText = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '⏳ Creando ZIP...';
    downloadBtn.disabled = true;

    try {
        showToast(`Preparando ZIP con ${galleryState.designList.length} diseños...`, 'info');

        const designIds = galleryState.designList.map(d => d.id);

        const response = await fetch(`${API_BASE}/gallery/download-zip`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ design_ids: designIds })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al descargar');
        }

        // Get the blob and create download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Get filename from header or generate one
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'disenos.zip';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?(.+)"?/);
            if (match) filename = match[1];
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // Update UI - remove designs from active list
        for (const design of galleryState.designList) {
            galleryState.designs = galleryState.designs.filter(d => d.id !== design.id);
        }

        clearDesignList();
        await loadGalleryStats();

        // Re-render grid
        const grid = document.getElementById('gallery-grid');
        renderGalleryGrid(grid, galleryState.designs, false);

        showToast(`ZIP descargado con ${designIds.length} diseños`, 'success');

    } catch (error) {
        console.error('ZIP download error:', error);
        showToast(error.message || 'Error al descargar ZIP', 'error');
    } finally {
        downloadBtn.innerHTML = originalText;
        downloadBtn.disabled = false;
    }
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

    // Create tags HTML
    const tagsHTML = design.tags?.length
        ? design.tags.map(tag => `<span class="design-tag">${escapeHtml(tag)}</span>`).join('')
        : '<span class="no-tags">Sin etiquetas</span>';

    const modal = document.createElement('div');
    modal.className = 'modal design-detail-modal';
    modal.id = `design-modal-${design.id}`;
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
        <div class="modal-content modal-xl">
            <div class="modal-header">
                <h3 id="design-modal-title-${design.id}">${escapeHtml(design.name)}</h3>
                <div class="modal-header-actions">
                    <button class="btn btn-icon btn-edit" onclick="toggleEditMode(${design.id})" title="Editar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
            </div>
            <div class="modal-body design-detail-body">
                <div class="design-detail-layout">
                    <!-- Left: Image -->
                    <div class="design-image-container">
                        <img src="${design.file_url}" alt="${escapeHtml(design.name)}" class="design-full-image">
                    </div>

                    <!-- Right: Info -->
                    <div class="design-info-panel">
                        <!-- View Mode -->
                        <div class="design-info-view" id="design-view-${design.id}">
                            <div class="info-section">
                                <label>Nombre</label>
                                <p class="info-value">${escapeHtml(design.name)}</p>
                            </div>

                            <div class="info-section">
                                <label>Categoria</label>
                                <p class="info-value">${design.category_name || 'Sin categoría'}</p>
                            </div>

                            <div class="info-section">
                                <label>Etiquetas</label>
                                <div class="tags-container">${tagsHTML}</div>
                            </div>

                            <div class="info-section">
                                <label>Descripcion</label>
                                <p class="info-value description-text">${design.description ? escapeHtml(design.description) : 'Sin descripción'}</p>
                            </div>

                            <div class="info-divider"></div>

                            <div class="info-meta">
                                <div class="meta-item">
                                    <span class="meta-label">Subido por</span>
                                    <span class="meta-value">${design.uploaded_by_name || 'Desconocido'}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Fecha</span>
                                    <span class="meta-value">${formatDate(design.created_at)}</span>
                                </div>
                                ${design.download_count ? `
                                <div class="meta-item">
                                    <span class="meta-label">Descargas</span>
                                    <span class="meta-value">${design.download_count}</span>
                                </div>
                                ` : ''}
                                ${isArchived ? `
                                <div class="meta-item">
                                    <span class="meta-label">Archivado</span>
                                    <span class="meta-value">${formatDate(design.archived_at)}</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Edit Mode (hidden by default) -->
                        <div class="design-info-edit hidden" id="design-edit-${design.id}">
                            <div class="form-group">
                                <label for="edit-name-${design.id}">Nombre</label>
                                <input type="text" id="edit-name-${design.id}" class="form-control" value="${escapeHtml(design.name)}">
                            </div>

                            <div class="form-group">
                                <label for="edit-category-${design.id}">Categoria</label>
                                <select id="edit-category-${design.id}" class="form-control select-input">
                                    <option value="">Sin categoría</option>
                                    ${galleryState.categories.map(cat =>
                                        `<option value="${cat.id}" ${design.category_id == cat.id ? 'selected' : ''}>${cat.icon || ''} ${cat.name}</option>`
                                    ).join('')}
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="edit-tags-${design.id}">Etiquetas (separadas por coma)</label>
                                <input type="text" id="edit-tags-${design.id}" class="form-control" value="${design.tags?.join(', ') || ''}" placeholder="Tortuga, Playa, Tropical...">
                            </div>

                            <div class="form-group">
                                <label for="edit-description-${design.id}">Descripcion</label>
                                <textarea id="edit-description-${design.id}" class="form-control" rows="3" placeholder="Descripción del diseño...">${design.description || ''}</textarea>
                            </div>

                            <div class="edit-actions">
                                <button class="btn btn-secondary" onclick="toggleEditMode(${design.id})">Cancelar</button>
                                <button class="btn btn-primary" onclick="saveDesignChanges(${design.id})">
                                    <span id="save-text-${design.id}">Guardar Cambios</span>
                                    <span id="save-loading-${design.id}" class="hidden">Guardando...</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                ${isArchived ? `
                    <button class="btn btn-success" onclick="restoreDesign(${design.id}); this.closest('.modal').remove();">
                        🔄 Restaurar a Galeria
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

// Toggle between view and edit mode in design modal
function toggleEditMode(designId) {
    const viewSection = document.getElementById(`design-view-${designId}`);
    const editSection = document.getElementById(`design-edit-${designId}`);
    const editBtn = document.querySelector(`#design-modal-${designId} .btn-edit`);

    if (viewSection && editSection) {
        const isEditing = !editSection.classList.contains('hidden');

        if (isEditing) {
            // Switch to view mode
            viewSection.classList.remove('hidden');
            editSection.classList.add('hidden');
            editBtn.classList.remove('active');
        } else {
            // Switch to edit mode
            viewSection.classList.add('hidden');
            editSection.classList.remove('hidden');
            editBtn.classList.add('active');
        }
    }
}

// Save design changes
async function saveDesignChanges(designId) {
    const nameInput = document.getElementById(`edit-name-${designId}`);
    const categoryInput = document.getElementById(`edit-category-${designId}`);
    const tagsInput = document.getElementById(`edit-tags-${designId}`);
    const descriptionInput = document.getElementById(`edit-description-${designId}`);
    const saveText = document.getElementById(`save-text-${designId}`);
    const saveLoading = document.getElementById(`save-loading-${designId}`);

    const name = nameInput.value.trim();
    if (!name) {
        showToast('El nombre es requerido', 'error');
        return;
    }

    // Parse tags
    const tags = tagsInput.value
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

    // Show loading
    saveText.classList.add('hidden');
    saveLoading.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE}/gallery/${designId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                name,
                category_id: categoryInput.value || null,
                tags,
                description: descriptionInput.value.trim() || null
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Diseño actualizado', 'success');

            // Update the design in our local state
            const designIndex = galleryState.designs.findIndex(d => d.id === designId);
            if (designIndex >= 0) {
                galleryState.designs[designIndex] = {
                    ...galleryState.designs[designIndex],
                    ...data.design
                };
            }

            // Close modal and refresh
            document.getElementById(`design-modal-${designId}`)?.remove();

            // Re-render gallery
            const grid = document.getElementById('gallery-grid');
            if (grid) {
                renderGalleryGrid(grid, galleryState.designs, false);
            }
        } else {
            showToast(data.error || 'Error al actualizar', 'error');
        }
    } catch (error) {
        console.error('Save design error:', error);
        showToast('Error al guardar cambios', 'error');
    } finally {
        saveText.classList.remove('hidden');
        saveLoading.classList.add('hidden');
    }
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

    // File input change - support multiple files
    document.getElementById('design-file')?.addEventListener('change', (e) => {
        if (e.target.files.length > 1) {
            handleFilesSelect(Array.from(e.target.files));
        } else {
            handleFileSelect(e.target.files[0]);
        }
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
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 1) {
                handleFilesSelect(files);
            } else {
                handleFileSelect(files[0]);
            }
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
let selectedFiles = []; // For batch upload
let uploadMode = 'single'; // 'single' or 'batch'

function openUploadModal() {
    console.log('openUploadModal called');

    const modal = document.getElementById('upload-design-modal');
    if (!modal) {
        console.error('Upload modal not found!');
        showToast('Error: Modal no encontrado', 'error');
        return;
    }

    // Reset form and state
    const form = document.getElementById('upload-design-form');
    if (form) form.reset();
    selectedFile = null;
    selectedFiles = [];
    uploadMode = 'single';

    // Reset preview
    const preview = document.getElementById('upload-preview');
    const content = document.querySelector('.dropzone-content');
    if (preview) preview.classList.add('hidden');
    if (content) content.classList.remove('hidden');

    // Hide batch preview if exists
    const batchPreview = document.getElementById('batch-preview');
    if (batchPreview) batchPreview.classList.add('hidden');

    // Reset file input to allow multiple
    const fileInput = document.getElementById('design-file');
    if (fileInput) fileInput.setAttribute('multiple', 'true');

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

    // Update placeholder text for multiple files
    const placeholder = document.getElementById('upload-placeholder');
    if (placeholder) {
        placeholder.innerHTML = `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p>Arrastra imagenes aqui o <strong>haz clic</strong> para seleccionar</p>
            <small>Claude IA analizara y extraera titulo, etiquetas y descripcion automaticamente</small>
        `;
    }

    // Always show AI info, hide single upload fields
    showSingleUploadFields(false);

    // Show modal
    modal.classList.remove('hidden');
    console.log('Upload modal should now be visible');
}

function handleFileSelect(file) {
    // Handle single file from the old interface
    if (file && !file.length) {
        handleFilesSelect([file]);
        return;
    }
    if (file && file.length) {
        handleFilesSelect(Array.from(file));
    }
}

function handleFilesSelect(files) {
    if (!files || files.length === 0) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const validFiles = [];
    const errors = [];

    for (const file of files) {
        const isHeic = file.name && /\.heic$/i.test(file.name);
        if (!allowedTypes.includes(file.type) && !isHeic) {
            errors.push(`${file.name}: tipo no permitido`);
            continue;
        }
        if (file.size > 15 * 1024 * 1024) {
            errors.push(`${file.name}: muy grande (max 15MB)`);
            continue;
        }
        validFiles.push(file);
    }

    if (errors.length > 0) {
        showToast(`Algunos archivos no son válidos:\n${errors.join('\n')}`, 'error');
    }

    if (validFiles.length === 0) {
        showToast('No se seleccionaron archivos válidos', 'error');
        return;
    }

    // All uploads now use AI analysis - always batch mode
    uploadMode = 'batch';
    selectedFile = null;
    selectedFiles = validFiles;

    // Hide single preview, show batch preview
    const uploadPreview = document.getElementById('upload-preview');
    const uploadPlaceholder = document.getElementById('upload-placeholder');

    if (uploadPreview) uploadPreview.classList.add('hidden');
    if (uploadPlaceholder) uploadPlaceholder.classList.add('hidden');

    // Show or create batch preview
    let batchPreview = document.getElementById('batch-preview');
    if (!batchPreview) {
        batchPreview = document.createElement('div');
        batchPreview.id = 'batch-preview';
        batchPreview.className = 'batch-preview';
        document.getElementById('upload-dropzone').appendChild(batchPreview);
    }

    // Create thumbnails grid
    const fileText = validFiles.length === 1 ? '1 imagen seleccionada' : `${validFiles.length} imagenes seleccionadas`;
    const sizeWarning = validFiles.length > 50 ? '<span style="color: #f59e0b; font-size: 11px; display: block;">Lotes grandes pueden tomar varios minutos</span>' : '';
    batchPreview.innerHTML = `
        <div class="batch-info">
            <strong>${fileText}</strong>
            ${sizeWarning}
            <button type="button" class="btn btn-sm btn-secondary" onclick="clearBatchSelection()">Cambiar</button>
        </div>
        <div class="batch-thumbnails" id="batch-thumbnails"></div>
        <div id="batch-progress" class="batch-progress hidden"></div>
    `;
    batchPreview.classList.remove('hidden');

    const thumbsContainer = document.getElementById('batch-thumbnails');

    // Add thumbnails (max 12 shown for larger batches)
    const showCount = Math.min(validFiles.length, 12);
    for (let i = 0; i < showCount; i++) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const thumb = document.createElement('div');
            thumb.className = 'batch-thumb';
            thumb.innerHTML = `<img src="${e.target.result}" alt="Preview ${i + 1}">`;
            thumbsContainer.appendChild(thumb);
        };
        reader.readAsDataURL(validFiles[i]);
    }

    if (validFiles.length > 12) {
        setTimeout(() => {
            const more = document.createElement('div');
            more.className = 'batch-thumb batch-more';
            more.innerHTML = `+${validFiles.length - 12}`;
            thumbsContainer.appendChild(more);
        }, 100);
    }

    // Hide single file fields - AI will fill everything
    showSingleUploadFields(false);

    // Enable submit button
    updateSubmitButton();
}

function showSingleUploadFields(show) {
    const singleFields = document.querySelectorAll('.single-upload-field');
    singleFields.forEach(field => {
        field.style.display = show ? '' : 'none';
    });

    // Show AI info for batch
    const aiInfo = document.getElementById('ai-batch-info');
    if (aiInfo) {
        aiInfo.style.display = show ? 'none' : '';
    }
}

function clearBatchSelection() {
    selectedFiles = [];
    selectedFile = null;
    uploadMode = 'batch';

    const batchPreview = document.getElementById('batch-preview');
    if (batchPreview) batchPreview.classList.add('hidden');

    const uploadPreview = document.getElementById('upload-preview');
    const uploadPlaceholder = document.getElementById('upload-placeholder');

    if (uploadPreview) uploadPreview.classList.add('hidden');
    if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');

    showSingleUploadFields(false);
    updateSubmitButton();
}

function updateSubmitButton() {
    const submitBtn = document.getElementById('submit-design-btn');
    const btnText = document.getElementById('upload-btn-text');

    if (selectedFiles.length > 0) {
        // Files selected - enable AI analysis
        submitBtn.disabled = false;
        const count = selectedFiles.length;
        if (btnText) {
            btnText.textContent = count === 1
                ? 'Analizar diseño con IA'
                : `Analizar ${count} diseños con IA`;
        }
    } else {
        submitBtn.disabled = true;
        if (btnText) btnText.textContent = 'Analizar con IA';
    }
}

async function submitDesign() {
    // All uploads now use AI analysis
    if (selectedFiles.length === 0) {
        showToast('Selecciona al menos una imagen', 'error');
        return;
    }

    await submitBatchDesigns();
}

async function submitBatchDesigns() {
    const submitBtn = document.getElementById('submit-design-btn');
    const btnText = document.getElementById('upload-btn-text');
    const btnLoading = document.getElementById('upload-btn-loading');
    const batchProgress = document.getElementById('batch-progress');

    // Show loading state with progress
    submitBtn.disabled = true;
    btnText.classList.add('hidden');

    const fileCount = selectedFiles.length;
    const estimatedTime = fileCount > 50 ? ' (esto puede tomar varios minutos)' : '';
    btnLoading.textContent = `Subiendo ${fileCount} diseños...`;
    btnLoading.classList.remove('hidden');

    // Show progress bar for large batches
    if (batchProgress && fileCount > 10) {
        batchProgress.classList.remove('hidden');
        batchProgress.innerHTML = `
            <div class="progress-bar-container">
                <div class="progress-bar" id="upload-progress-bar" style="width: 0%"></div>
            </div>
            <div class="progress-text" id="upload-progress-text">Preparando archivos...</div>
        `;
    }

    const updateProgress = (stage, percent) => {
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = stage;
        btnLoading.textContent = stage;
    };

    try {
        const formData = new FormData();

        // Add all files with progress update
        updateProgress(`Preparando ${fileCount} archivos...`, 5);
        for (let i = 0; i < selectedFiles.length; i++) {
            formData.append('designs', selectedFiles[i]);
            if (i % 10 === 0) {
                updateProgress(`Preparando archivos... (${i + 1}/${fileCount})`, 5 + (i / fileCount * 15));
            }
        }

        // Add category if selected
        const categoryId = document.getElementById('design-category').value;
        if (categoryId) {
            formData.append('category_id', categoryId);
        }

        // Enable AI analysis
        formData.append('auto_analyze', 'true');

        updateProgress(`Subiendo ${fileCount} diseños al servidor...`, 20);
        showToast(`Subiendo ${fileCount} diseños para análisis con IA...${estimatedTime}`, 'info');

        // Use XMLHttpRequest for upload progress tracking
        const response = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const uploadPercent = 20 + (e.loaded / e.total * 30);
                    updateProgress(`Subiendo... ${Math.round(e.loaded / e.total * 100)}%`, uploadPercent);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    try {
                        reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'));
                    } catch {
                        reject(new Error('Upload failed'));
                    }
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

            xhr.open('POST', `${API_BASE}/gallery/upload-multiple`);
            xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);

            updateProgress(`Analizando diseños con IA...`, 50);
            xhr.send(formData);
        });

        updateProgress(`Procesamiento completo`, 100);

        if (response.success) {
            const message = `${response.uploaded} diseños subidos correctamente` +
                (response.failed > 0 ? ` (${response.failed} fallaron)` : '');
            showToast(message, response.failed > 0 ? 'warning' : 'success');

            // Show details of uploaded designs
            if (response.results && response.results.length > 0) {
                console.log('Uploaded designs:', response.results.map(r => ({
                    name: r.design.name,
                    tags: r.design.tags
                })));
            }

            closeModal('upload-design-modal');
            loadGallery(); // Refresh gallery
        } else {
            showToast(response.error || 'Error al subir los diseños', 'error');
        }

    } catch (error) {
        console.error('Batch upload error:', error);
        showToast('Error al subir los diseños: ' + error.message, 'error');
    } finally {
        // Reset loading state
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
        btnLoading.textContent = 'Subiendo...';
        if (batchProgress) {
            batchProgress.classList.add('hidden');
        }
    }
}

// Event listeners are initialized in initGalleryEventListeners()

// ========================================
// FACEBOOK MARKETPLACE FUNCTIONS
// ========================================

async function queueDesignForFacebook(designId) {
    const design = galleryState.designs.find(d => d.id === designId);
    if (!design) {
        showToast('Diseño no encontrado', 'error');
        return;
    }

    const btn = document.getElementById(`fb-gallery-${designId}`);

    try {
        // Show loading state
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳';
            btn.classList.add('loading');
        }

        const response = await fetch(`${API_BASE}/facebook/queue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                orderId: null, // Gallery designs don't have order IDs
                imageUrl: design.file_url,
                title: design.name || `Diseño ${designId}`
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al encolar para Facebook');
        }

        // Show success state
        if (btn) {
            btn.innerHTML = '✓';
            btn.classList.remove('loading');
            btn.classList.add('queued');
            btn.title = 'En cola para Facebook Marketplace';
            btn.disabled = true;
        }

        showToast('Diseño agregado a Facebook Marketplace', 'success');
        console.log(`✅ Queued for Facebook: ${design.name}`);

    } catch (error) {
        console.error('Error queueing for Facebook:', error);

        // Restore button
        if (btn) {
            btn.innerHTML = 'f';
            btn.classList.remove('loading');
            btn.disabled = false;
        }

        showToast(`Error: ${error.message}`, 'error');
    }
}

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
window.clearBatchSelection = clearBatchSelection;
window.handleFilesSelect = handleFilesSelect;
window.toggleEditMode = toggleEditMode;
window.saveDesignChanges = saveDesignChanges;
window.openDesignModal = openDesignModal;
window.queueDesignForFacebook = queueDesignForFacebook;

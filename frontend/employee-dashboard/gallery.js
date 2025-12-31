/**
 * Gallery Module - Design file management
 */

const galleryState = {
    designs: [],
    categories: [],
    currentCategory: null
};

async function loadGallery() {
    const loading = document.getElementById('gallery-loading');
    const empty = document.getElementById('gallery-empty');
    const grid = document.getElementById('gallery-grid');

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    grid.innerHTML = '';

    try {
        // Load categories first
        await loadCategories();

        // Load designs
        let url = '/gallery';
        if (galleryState.currentCategory) {
            url += `?category_id=${galleryState.currentCategory}`;
        }

        const data = await apiGet(url);

        loading.classList.add('hidden');

        if (!data.success || data.designs.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        galleryState.designs = data.designs;
        renderGalleryGrid();

    } catch (error) {
        console.error('Error loading gallery:', error);
        loading.classList.add('hidden');
        showToast('Error al cargar galería', 'error');
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

function renderGalleryGrid() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';

    galleryState.designs.forEach(design => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.onclick = () => openDesignModal(design);

        item.innerHTML = `
            <img class="gallery-thumb" src="${design.thumbnail_url || design.file_url}" alt="${escapeHtml(design.name)}" loading="lazy">
            <div class="gallery-info">
                <div class="gallery-name">${escapeHtml(design.name)}</div>
                <div class="gallery-category">${design.category_name || 'Sin categoría'}</div>
            </div>
        `;

        grid.appendChild(item);
    });
}

function openDesignModal(design) {
    // Simple image viewer
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
                <img src="${design.file_url}" alt="${escapeHtml(design.name)}" style="max-width: 100%; max-height: 60vh;">
                <div style="margin-top: 16px; text-align: left;">
                    <p><strong>Categoría:</strong> ${design.category_name || 'Sin categoría'}</p>
                    ${design.description ? `<p><strong>Descripción:</strong> ${escapeHtml(design.description)}</p>` : ''}
                    ${design.tags?.length ? `<p><strong>Etiquetas:</strong> ${design.tags.join(', ')}</p>` : ''}
                    <p><strong>Subido por:</strong> ${design.uploaded_by_name || 'Desconocido'}</p>
                    <p><strong>Fecha:</strong> ${formatDate(design.created_at)}</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Category filter
document.getElementById('category-filter')?.addEventListener('change', (e) => {
    galleryState.currentCategory = e.target.value || null;
    loadGallery();
});

// Search
let searchTimeout;
document.getElementById('gallery-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.gallery-item');

        items.forEach(item => {
            const name = item.querySelector('.gallery-name').textContent.toLowerCase();
            item.style.display = name.includes(query) ? '' : 'none';
        });
    }, 300);
});

// Upload button (for design role)
document.getElementById('upload-design-btn')?.addEventListener('click', () => {
    // For now, show a simple alert - full upload would need Cloudinary integration
    showToast('Funcionalidad de subida próximamente', 'info');
});

// Make loadGallery available globally
window.loadGallery = loadGallery;

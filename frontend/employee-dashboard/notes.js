/**
 * Notes Module - Notion-like document management
 */

const notesState = {
    workspaces: [],
    currentWorkspace: null,
    notes: [],
    currentNote: null
};

async function loadWorkspaces() {
    try {
        const data = await apiGet('/notes/workspaces');

        if (data.success) {
            notesState.workspaces = data.workspaces;
            renderWorkspacesList();

            // Load first workspace by default
            if (data.workspaces.length > 0 && !notesState.currentWorkspace) {
                selectWorkspace(data.workspaces[0].id);
            }
        }
    } catch (error) {
        console.error('Error loading workspaces:', error);
        showToast('Error al cargar espacios de trabajo', 'error');
    }
}

function renderWorkspacesList() {
    const list = document.getElementById('workspaces-list');
    list.innerHTML = '';

    notesState.workspaces.forEach(ws => {
        const item = document.createElement('div');
        item.className = `workspace-item ${notesState.currentWorkspace === ws.id ? 'active' : ''}`;
        item.onclick = () => selectWorkspace(ws.id);

        item.innerHTML = `
            <span>${ws.icon || '📁'}</span>
            <span>${escapeHtml(ws.name)}</span>
        `;

        list.appendChild(item);
    });
}

async function selectWorkspace(workspaceId) {
    notesState.currentWorkspace = workspaceId;
    renderWorkspacesList();
    await loadNotes(workspaceId);
}

async function loadNotes(workspaceId) {
    const loading = document.getElementById('notes-loading');
    const empty = document.getElementById('notes-empty');
    const list = document.getElementById('notes-list');

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    list.innerHTML = '';

    try {
        const data = await apiGet(`/notes?workspace_id=${workspaceId}`);

        loading.classList.add('hidden');

        if (!data.success || data.notes.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        notesState.notes = data.notes;
        renderNotesList();

    } catch (error) {
        console.error('Error loading notes:', error);
        loading.classList.add('hidden');
        showToast('Error al cargar documentos', 'error');
    }
}

function renderNotesList() {
    const list = document.getElementById('notes-list');
    list.innerHTML = '';

    notesState.notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.onclick = () => openNoteEditor(note);

        const preview = note.content ? note.content.substring(0, 100) + '...' : 'Sin contenido';

        card.innerHTML = `
            <div class="note-title">
                <span>${note.icon || '📄'}</span>
                ${escapeHtml(note.title)}
            </div>
            <div class="note-preview">${escapeHtml(preview)}</div>
        `;

        list.appendChild(card);
    });
}

function openNoteEditor(note = null) {
    const modal = document.getElementById('note-modal');
    const titleInput = document.getElementById('note-title-input');
    const contentInput = document.getElementById('note-content');
    const saveBtn = document.getElementById('save-note-btn');

    if (note) {
        notesState.currentNote = note;
        titleInput.value = note.title;
        contentInput.value = note.content || '';
    } else {
        notesState.currentNote = null;
        titleInput.value = '';
        contentInput.value = '';
    }

    modal.classList.remove('hidden');
    titleInput.focus();
}

async function saveNote() {
    const title = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-content').value;

    if (!title) {
        showToast('El título es requerido', 'error');
        return;
    }

    try {
        let data;

        if (notesState.currentNote) {
            // Update existing note
            data = await apiPut(`/notes/${notesState.currentNote.id}`, { title, content });
        } else {
            // Create new note
            data = await apiPost('/notes', {
                title,
                content,
                workspace_id: notesState.currentWorkspace
            });
        }

        if (data.success) {
            showToast(notesState.currentNote ? 'Documento actualizado' : 'Documento creado', 'success');
            closeModal('note-modal');
            loadNotes(notesState.currentWorkspace);
        } else {
            showToast(data.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// New note button
document.getElementById('new-note-btn')?.addEventListener('click', () => {
    if (!notesState.currentWorkspace) {
        showToast('Selecciona un espacio de trabajo primero', 'error');
        return;
    }
    openNoteEditor();
});

// Save note button
document.getElementById('save-note-btn')?.addEventListener('click', saveNote);

// New workspace button
document.getElementById('new-workspace-btn')?.addEventListener('click', async () => {
    const name = prompt('Nombre del nuevo espacio de trabajo:');
    if (!name) return;

    try {
        const data = await apiPost('/notes/workspaces', { name, icon: '📁' });

        if (data.success) {
            showToast('Espacio de trabajo creado', 'success');
            loadWorkspaces();
        } else {
            showToast(data.error || 'Error al crear', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
});

// Auto-save on content change (debounced)
let autoSaveTimeout;
document.getElementById('note-content')?.addEventListener('input', () => {
    if (!notesState.currentNote) return;

    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        const content = document.getElementById('note-content').value;
        try {
            await apiPut(`/notes/${notesState.currentNote.id}`, { content });
            // Subtle save indicator
            console.log('Auto-saved');
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }, 2000);
});

// Make loadWorkspaces available globally
window.loadWorkspaces = loadWorkspaces;

/**
 * AXKAN Shipping Address Form
 * Multi-step form with postal code auto-fill and returning client detection
 */

// ==========================================
// CONFIGURATION
// ==========================================

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api/client'
  : 'https://vt-souvenir-backend.onrender.com/api/client';

let currentStep = 1;
let isSubmitting = false;
let lastPostalCode = '';

// ==========================================
// STEP NAVIGATION
// ==========================================

function goToStep(step) {
    const goingBack = step < currentStep;

    // Validate current step before advancing
    if (step > currentStep) {
        if (currentStep === 1 && !validateStep1()) return;
        if (currentStep === 2 && !validateStep2()) return;
    }

    // If going to step 3, submit the form
    if (step === 3 && currentStep === 2) {
        submitForm();
        return;
    }

    // Transition steps
    const currentEl = document.getElementById(`step-${currentStep}`);
    const nextEl = document.getElementById(`step-${step}`);

    if (currentEl) currentEl.classList.remove('active');

    if (nextEl) {
        nextEl.classList.remove('slide-reverse');
        if (goingBack) nextEl.classList.add('slide-reverse');
        nextEl.classList.add('active');
    }

    // Update progress
    updateProgress(step);
    currentStep = step;

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // If step 2, auto-trigger postal lookup if already filled
    if (step === 2) {
        const postalInput = document.getElementById('input-postal');
        if (postalInput && postalInput.value.length === 5) {
            handlePostalCodeLookup();
        }
    }
}

function updateProgress(step) {
    // Update fill bar
    const fill = document.getElementById('progress-fill');
    const widths = { 1: '33%', 2: '66%', 3: '100%' };
    fill.style.width = widths[step] || '33%';

    // Update step dots
    document.querySelectorAll('.progress-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s === step) el.classList.add('active');
        if (s < step) el.classList.add('completed');
    });
}

// ==========================================
// VALIDATION
// ==========================================

function validateStep1() {
    let valid = true;

    const destination = document.getElementById('input-destination').value.trim();
    const name = document.getElementById('input-name').value.trim();
    const phone = document.getElementById('input-phone').value.trim();
    const email = document.getElementById('input-email').value.trim();

    clearErrors();

    if (!destination || destination.length < 2) {
        showError('destination', 'Ingresa el nombre del destino de tus imanes');
        valid = false;
    }

    if (!name || name.length < 2) {
        showError('name', 'Ingresa tu nombre completo');
        valid = false;
    }

    if (!phone || !/^\d{10}$/.test(phone)) {
        showError('phone', 'Ingresa un telefono de 10 digitos');
        valid = false;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('email', 'Ingresa un correo electronico valido');
        valid = false;
    }

    return valid;
}

function validateStep2() {
    let valid = true;
    clearErrors();

    const postal = document.getElementById('input-postal').value.trim();
    const state = document.getElementById('input-state').value.trim();
    const city = document.getElementById('input-city').value.trim();
    const colonia = getColoniaValue();
    const street = document.getElementById('input-street').value.trim();
    const number = document.getElementById('input-number').value.trim();

    if (!postal || !/^\d{5}$/.test(postal)) {
        showError('postal', 'Codigo postal de 5 digitos');
        valid = false;
    }

    if (!state) {
        showFieldBorder('input-state', true);
        valid = false;
    }

    if (!city) {
        showFieldBorder('input-city', true);
        valid = false;
    }

    if (!colonia) {
        showFieldBorder('input-colonia', true);
        valid = false;
    }

    if (!street) {
        showFieldBorder('input-street', true);
        valid = false;
    }

    if (!number) {
        showFieldBorder('input-number', true);
        valid = false;
    }

    if (!valid) {
        // Find first error field and focus it
        const errorField = document.querySelector('input.error, select.error');
        if (errorField) errorField.focus();
    }

    return valid;
}

function showError(field, message) {
    const errorEl = document.getElementById(`error-${field}`);
    const inputEl = document.getElementById(`input-${field}`);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('visible');
    }
    if (inputEl) {
        inputEl.classList.add('error');
        inputEl.focus();
    }
}

function showFieldBorder(inputId, isError) {
    const el = document.getElementById(inputId);
    if (el) {
        if (isError) {
            el.classList.add('error');
        } else {
            el.classList.remove('error');
        }
    }
}

function clearErrors() {
    document.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    document.querySelectorAll('input.error, select.error').forEach(el => {
        el.classList.remove('error');
    });
}

// ==========================================
// POSTAL CODE AUTO-FILL
// ==========================================

async function handlePostalCodeLookup() {
    const postalInput = document.getElementById('input-postal');
    const postal = postalInput.value.trim();
    const cityInput = document.getElementById('input-city');
    const stateInput = document.getElementById('input-state');
    const loadingEl = document.getElementById('postal-loading');
    const hintEl = document.getElementById('postal-hint');

    // Reset if postal changed
    if (postal !== lastPostalCode) {
        if (stateInput.classList.contains('autofilled')) {
            stateInput.value = '';
            stateInput.classList.remove('autofilled');
        }
        if (cityInput.classList.contains('autofilled')) {
            cityInput.value = '';
            cityInput.classList.remove('autofilled');
        }
        resetColoniaToInput();
    }

    lastPostalCode = postal;

    if (postal.length !== 5 || !/^\d{5}$/.test(postal)) {
        return;
    }

    // Show loading
    loadingEl.style.display = 'flex';
    hintEl.style.display = 'none';
    postalInput.style.borderColor = '#f59e0b';

    try {
        const response = await fetch(`https://api.zippopotam.us/mx/${postal}`);

        if (!response.ok) {
            throw new Error('Codigo postal no encontrado');
        }

        const data = await response.json();

        if (data && data.places && data.places.length > 0) {
            const place = data.places[0];

            // Auto-fill state
            if (place.state) {
                stateInput.value = place.state;
                stateInput.classList.add('autofilled');
                animateField(stateInput);
            }

            // Auto-fill city
            if (place.state) {
                cityInput.value = place.state;
                cityInput.classList.add('autofilled');
                animateField(cityInput);
            }

            // Handle colonia
            const colonias = data.places.map(p => p['place name']);

            if (colonias.length === 1) {
                const coloniaInput = document.getElementById('input-colonia');
                if (coloniaInput) {
                    coloniaInput.value = colonias[0];
                    coloniaInput.classList.add('autofilled');
                    animateField(coloniaInput);
                }
            } else if (colonias.length > 1) {
                createColoniaDropdown(colonias);
            }

            // Success indicator
            postalInput.style.borderColor = '#10b981';
            setTimeout(() => { postalInput.style.borderColor = ''; }, 2000);
        }
    } catch (error) {
        postalInput.style.borderColor = '';
    } finally {
        loadingEl.style.display = 'none';
        hintEl.style.display = 'block';
    }
}

function animateField(el) {
    el.style.transition = 'background-color 0.3s ease';
    el.style.backgroundColor = '#d1fae5';
    setTimeout(() => {
        el.style.backgroundColor = '';
    }, 1500);
}

function createColoniaDropdown(colonias) {
    const container = document.getElementById('colonia-container');
    const select = document.createElement('select');
    select.id = 'input-colonia';
    select.className = 'autofilled';
    select.required = true;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `Selecciona tu colonia (${colonias.length} opciones)`;
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    colonias.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    });

    container.innerHTML = '';
    container.appendChild(select);
    animateField(select);
}

function resetColoniaToInput() {
    const container = document.getElementById('colonia-container');
    if (container) {
        container.innerHTML = '<input type="text" id="input-colonia" placeholder="Se llena automaticamente" required>';
    }
}

function getColoniaValue() {
    const el = document.getElementById('input-colonia');
    if (!el) return '';
    return el.value.trim();
}

// ==========================================
// RETURNING CLIENT DETECTION
// ==========================================

async function checkReturningClient(phone) {
    if (!phone || phone.length !== 10) return;

    try {
        const response = await fetch(`${API_BASE}/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });

        const data = await response.json();

        if (data.success && data.found && data.clientInfo) {
            const info = data.clientInfo;

            // Show returning banner
            const banner = document.getElementById('returning-banner');
            const nameEl = document.getElementById('returning-name');
            nameEl.textContent = `Hola de nuevo, ${info.name}!`;
            banner.style.display = 'flex';

            // Pre-fill fields
            if (info.name) document.getElementById('input-name').value = info.name;
            if (info.email) document.getElementById('input-email').value = info.email;

            // Pre-fill address if available
            if (info.postal) document.getElementById('input-postal').value = info.postal;
            if (info.state) {
                document.getElementById('input-state').value = info.state;
                document.getElementById('input-state').classList.add('autofilled');
            }
            if (info.city) {
                document.getElementById('input-city').value = info.city;
                document.getElementById('input-city').classList.add('autofilled');
            }
            if (info.colonia) {
                document.getElementById('input-colonia').value = info.colonia;
                document.getElementById('input-colonia').classList.add('autofilled');
            }
            if (info.street) document.getElementById('input-street').value = info.street;
            if (info.streetNumber) document.getElementById('input-number').value = info.streetNumber;
            if (info.references) document.getElementById('input-references').value = info.references;

            lastPostalCode = info.postal || '';
        }
    } catch (e) {
        // Silent fail - client can fill manually
    }
}

// ==========================================
// FORM SUBMISSION
// ==========================================

async function submitForm() {
    if (isSubmitting) return;
    isSubmitting = true;

    // Show step 3 with loading
    const currentEl = document.getElementById(`step-${currentStep}`);
    if (currentEl) currentEl.classList.remove('active');

    const step3 = document.getElementById('step-3');
    step3.classList.add('active');
    updateProgress(3);
    currentStep = 3;

    document.getElementById('submit-loading').style.display = 'block';
    document.getElementById('submit-success').style.display = 'none';
    document.getElementById('submit-error').style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Collect data
    const formData = {
        destinationName: document.getElementById('input-destination').value.trim(),
        clientName: document.getElementById('input-name').value.trim(),
        clientPhone: document.getElementById('input-phone').value.trim(),
        clientEmail: document.getElementById('input-email').value.trim(),
        clientPostal: document.getElementById('input-postal').value.trim(),
        clientState: document.getElementById('input-state').value.trim(),
        clientCity: document.getElementById('input-city').value.trim(),
        clientColonia: getColoniaValue(),
        clientStreet: document.getElementById('input-street').value.trim(),
        clientStreetNumber: document.getElementById('input-number').value.trim(),
        clientReferences: document.getElementById('input-references').value.trim(),
    };

    try {
        const response = await fetch(`${API_BASE}/address/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Error al guardar los datos');
        }

        // Show success
        document.getElementById('submit-loading').style.display = 'none';
        document.getElementById('submit-success').style.display = 'block';

        // Build summary
        buildSummary(formData);

        // Confetti!
        launchConfetti();

    } catch (error) {
        document.getElementById('submit-loading').style.display = 'none';
        document.getElementById('submit-error').style.display = 'block';
        document.getElementById('error-message').textContent = error.message || 'No pudimos guardar tus datos. Intenta de nuevo.';
    } finally {
        isSubmitting = false;
    }
}

function buildSummary(data) {
    const card = document.getElementById('summary-card');
    const address = [data.clientStreet, data.clientStreetNumber].filter(Boolean).join(' ');
    const location = [data.clientColonia, data.clientCity, data.clientState].filter(Boolean).join(', ');

    card.innerHTML = `
        <div class="summary-row">
            <span class="summary-label">Destino</span>
            <span class="summary-value">${data.destinationName}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Nombre</span>
            <span class="summary-value">${data.clientName}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Telefono</span>
            <span class="summary-value">${data.clientPhone}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Email</span>
            <span class="summary-value">${data.clientEmail}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Direccion</span>
            <span class="summary-value">${address}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Ubicacion</span>
            <span class="summary-value">${location}, CP ${data.clientPostal}</span>
        </div>
        ${data.clientReferences ? `
        <div class="summary-row">
            <span class="summary-label">Referencias</span>
            <span class="summary-value">${data.clientReferences}</span>
        </div>
        ` : ''}
    `;
}

// ==========================================
// CONFETTI
// ==========================================

function launchConfetti() {
    const colors = ['#e72a88', '#8ab73b', '#f39223', '#09adc2', '#e52421', '#f4b266'];
    const container = document.body;

    for (let i = 0; i < 50; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.top = '-10px';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.width = (Math.random() * 8 + 6) + 'px';
        piece.style.height = (Math.random() * 8 + 6) + 'px';
        piece.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
        piece.style.animationDelay = (Math.random() * 0.5) + 's';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';

        container.appendChild(piece);

        // Clean up after animation
        setTimeout(() => piece.remove(), 3000);
    }
}

// ==========================================
// DEBOUNCE UTILITY
// ==========================================

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Postal code auto-lookup
    const postalInput = document.getElementById('input-postal');
    if (postalInput) {
        postalInput.addEventListener('input', debounce(handlePostalCodeLookup, 500));
    }

    // Phone-based returning client detection
    const phoneInput = document.getElementById('input-phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', debounce(() => {
            const phone = phoneInput.value.trim();
            if (phone.length === 10 && /^\d{10}$/.test(phone)) {
                checkReturningClient(phone);
            }
        }, 600));

        // Only allow digits
        phoneInput.addEventListener('input', () => {
            phoneInput.value = phoneInput.value.replace(/\D/g, '');
        });
    }

    // Postal code - only allow digits
    if (postalInput) {
        postalInput.addEventListener('input', () => {
            postalInput.value = postalInput.value.replace(/\D/g, '');
        });
    }

    // Clear error state on input
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('focus', () => {
            input.classList.remove('error');
            const errorEl = input.closest('.form-group')?.querySelector('.field-error');
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.classList.remove('visible');
            }
        });
    });

    // Allow Enter key to advance steps
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const activeStep = document.querySelector('.step.active');
            if (!activeStep) return;

            const stepId = activeStep.id;
            if (stepId === 'step-1') {
                e.preventDefault();
                goToStep(2);
            } else if (stepId === 'step-2') {
                // Only submit if focused on a button or last field
                const focused = document.activeElement;
                if (focused && focused.id === 'input-references') {
                    e.preventDefault();
                    goToStep(3);
                }
            }
        }
    });

    // Check URL params for pre-fill (e.g., ?phone=5512345678)
    const params = new URLSearchParams(window.location.search);
    const prePhone = params.get('phone') || params.get('tel');
    if (prePhone && /^\d{10}$/.test(prePhone)) {
        document.getElementById('input-phone').value = prePhone;
        checkReturningClient(prePhone);
    }
});

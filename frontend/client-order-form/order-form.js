/**
 * Client Order Form - Mobile-First with Phone-Based Account System
 * Connects to backend API at /api/client/*
 */

// ==========================================
// CONFIGURATION
// ==========================================

// Use same domain for API calls (works on both localhost and Render)
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api/client'
  : 'https://vt-souvenir-backend.onrender.com/api/client';

const STORAGE_KEY = 'souvenir_client_data';

// ==========================================
// STATE MANAGEMENT
// ==========================================

const state = {
  currentStep: 1,
  maxSteps: 5,
  client: {
    phone: '',
    name: '',
    email: '',
    address: '', // Legacy field (for backward compatibility)
    street: '', // New: Street name
    streetNumber: '', // New: Street number
    colonia: '',
    city: '',
    state: '',
    postal: '',
    references: '',
    isReturning: false
  },
  products: [],
  cart: {}, // { productId: { product, quantity } }
  order: {
    clientNotes: ''
  },
  payment: {
    method: 'stripe',
    proofFile: null
  },
  totals: {
    subtotal: 0,
    deposit: 0
  }
};

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🎨 Souvenir Order Form Initialized');
  initializeEventListeners();
  showStep(1);
});

function initializeEventListeners() {
  // Step 1: Phone Login
  document.getElementById('continue-phone').addEventListener('click', handlePhoneSubmit);
  document.getElementById('phone').addEventListener('input', formatPhoneInput);

  // Auto-fill feature DISABLED - Only check on Continue button click
  // document.getElementById('phone').addEventListener('input', debounce(handlePhoneAutofill, 500));

  // Step 1.5: Confirm Data
  const confirmBtn = document.getElementById('confirm-data-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirmData);
  }

  // Step 2: Client Info
  document.getElementById('continue-info').addEventListener('click', handleInfoSubmit);

  // Add character counter for references field
  const referencesField = document.getElementById('client-references');
  const referencesCounter = document.getElementById('references-counter');
  if (referencesField && referencesCounter) {
    referencesField.addEventListener('input', () => {
      const length = referencesField.value.length;
      referencesCounter.textContent = `Máximo 35 caracteres (${length}/35)`;
      if (length >= 35) {
        referencesCounter.style.color = '#dc2626';
      } else {
        referencesCounter.style.color = '#6b7280';
      }
    });
  }

  // Step 3: Products (loaded dynamically)
  document.getElementById('continue-products').addEventListener('click', handleProductsSubmit);

  // Step 4: Payment
  document.getElementById('submit-order').addEventListener('click', handleOrderSubmit);
  document.getElementById('stripe-pay-btn').addEventListener('click', handleStripePayment);
  document.querySelectorAll('input[name="payment"]').forEach(radio => {
    radio.addEventListener('change', handlePaymentMethodChange);
  });
  setupFileUpload('proof-upload-area', 'payment-proof', 'proof-preview', handleProofUpload);

  // Back buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => goBack());
  });
}

// ==========================================
// STEP NAVIGATION
// ==========================================

function showStep(stepNumber) {
  state.currentStep = stepNumber;

  // Hide all steps
  document.querySelectorAll('.step').forEach(step => {
    step.classList.remove('active');
  });

  // Show current step
  const stepMap = {
    1: 'step-login',
    1.5: 'step-confirm',
    2: 'step-info',
    3: 'step-products',
    4: 'step-payment',
    5: 'step-success'
  };

  const currentStepEl = document.getElementById(stepMap[stepNumber]);
  if (currentStepEl) {
    currentStepEl.classList.add('active');
  }

  // Special actions per step
  if (stepNumber === 1.5) {
    populateConfirmationData();
  } else if (stepNumber === 3) {
    loadProducts();
  } else if (stepNumber === 4) {
    populatePaymentSummary();
  }
}

function goBack() {
  if (state.currentStep > 1) {
    showStep(state.currentStep - 1);
  }
}

// ==========================================
// AUTO-FILL FEATURE
// ==========================================

// Debounce utility to avoid too many API calls
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// Handle phone number auto-fill
async function handlePhoneAutofill(e) {
  const phone = e.target.value.replace(/\D/g, '');

  // Only trigger lookup if we have a complete 10-digit phone number
  if (phone.length !== 10) {
    hideAutofillMessage();
    return;
  }

  // Show loading indicator
  showAutofillLoading();

  try {
    const response = await fetch(`${API_BASE}/orders/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone })
    });

    const data = await response.json();

    if (!data.success) {
      // Client not found - this is okay, they're a new customer
      hideAutofillMessage();
      return;
    }

    // Check if client info exists
    if (data.clientInfo && data.clientInfo.name) {
      // Auto-populate state with client info
      state.client.name = data.clientInfo.name || '';
      state.client.email = data.clientInfo.email || '';
      state.client.address = data.clientInfo.address || '';
      state.client.street = data.clientInfo.street || data.clientInfo.address || '';
      state.client.streetNumber = data.clientInfo.streetNumber || '';
      state.client.colonia = data.clientInfo.colonia || '';
      state.client.city = data.clientInfo.city || '';
      state.client.state = data.clientInfo.state || '';
      state.client.postal = data.clientInfo.postal || '';
      state.client.references = data.clientInfo.references || '';
      state.client.phone = phone;

      // Auto-fill the email field on the login screen
      const emailInput = document.getElementById('login-email');
      if (emailInput && state.client.email) {
        emailInput.value = state.client.email;
      }

      // Show welcome back message
      showAutofillSuccess(data.clientInfo.name);
    } else {
      // No client info available
      hideAutofillMessage();
    }

  } catch (error) {
    console.error('Error during auto-fill lookup:', error);
    hideAutofillMessage();
  }
}

// Show loading state during lookup
function showAutofillLoading() {
  let messageDiv = document.getElementById('autofill-message');

  if (!messageDiv) {
    messageDiv = document.createElement('div');
    messageDiv.id = 'autofill-message';
    messageDiv.style.cssText = `
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      animation: fadeIn 0.3s ease-in;
    `;
    const phoneGroup = document.getElementById('phone').closest('.form-group');
    phoneGroup.parentNode.insertBefore(messageDiv, phoneGroup.nextSibling);
  }

  messageDiv.style.background = '#dbeafe';
  messageDiv.style.border = '1px solid #3b82f6';
  messageDiv.style.color = '#1e40af';
  messageDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <div class="spinner-small" style="width: 16px; height: 16px; border: 2px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      <span>Buscando tu información...</span>
    </div>
  `;
}

// Show success message when client is found
function showAutofillSuccess(clientName) {
  let messageDiv = document.getElementById('autofill-message');

  if (!messageDiv) {
    messageDiv = document.createElement('div');
    messageDiv.id = 'autofill-message';
    messageDiv.style.cssText = `
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      animation: fadeIn 0.3s ease-in;
    `;
    const phoneGroup = document.getElementById('phone').closest('.form-group');
    phoneGroup.parentNode.insertBefore(messageDiv, phoneGroup.nextSibling);
  }

  messageDiv.style.background = '#d1fae5';
  messageDiv.style.border = '1px solid #10b981';
  messageDiv.style.color = '#065f46';
  messageDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 18px;">👋</span>
      <div>
        <strong>Bienvenido de nuevo, ${clientName}!</strong><br>
        <span style="font-size: 13px;">Tu información ha sido pre-llenada. Puedes editarla si es necesario.</span>
      </div>
    </div>
  `;
}

// Hide the auto-fill message
function hideAutofillMessage() {
  const messageDiv = document.getElementById('autofill-message');
  if (messageDiv) {
    messageDiv.remove();
  }
}

// ==========================================
// STEP 1: PHONE LOGIN
// ==========================================

function formatPhoneInput(e) {
  // Remove non-digits
  let value = e.target.value.replace(/\D/g, '');
  e.target.value = value;
}

async function handlePhoneSubmit() {
  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('login-email');
  const phone = phoneInput.value.trim();
  const email = emailInput.value.trim();

  // Validation
  if (phone.length !== 10) {
    alert('Por favor ingresa un número de teléfono válido de 10 dígitos');
    phoneInput.focus();
    return;
  }

  if (!email || !email.includes('@')) {
    alert('Por favor ingresa un correo electrónico válido');
    emailInput.focus();
    return;
  }

  state.client.phone = phone;
  state.client.email = email;

  // Show loading indicator
  const continueBtn = document.getElementById('continue-phone');
  const originalText = continueBtn.textContent;
  continueBtn.disabled = true;
  continueBtn.innerHTML = '<span class="spinner"></span> Verificando...';

  try {
    // Check database for existing client
    const response = await fetch(`${API_BASE}/orders/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone })
    });

    const data = await response.json();

    if (data.success && data.clientInfo && data.clientInfo.name) {
      // Client found in database! Pre-fill their information
      state.client.name = data.clientInfo.name || '';
      state.client.email = data.clientInfo.email || email; // Use provided email if DB doesn't have one
      state.client.address = data.clientInfo.address || '';
      state.client.street = data.clientInfo.street || data.clientInfo.address || '';
      state.client.streetNumber = data.clientInfo.streetNumber || '';
      state.client.colonia = data.clientInfo.colonia || '';
      state.client.city = data.clientInfo.city || '';
      state.client.state = data.clientInfo.state || '';
      state.client.postal = data.clientInfo.postal || '';
      state.client.references = data.clientInfo.references || '';
      state.client.phone = phone;
      state.client.isReturning = true;

      // Show welcome message
      showAutofillSuccess(data.clientInfo.name);

      // Delay a bit so user can see the welcome message, then show confirmation step
      setTimeout(() => {
        hideAutofillMessage();
        showStep(1.5); // Show confirmation step
      }, 1500);

      continueBtn.disabled = false;
      continueBtn.textContent = originalText;
      return;
    }

    // Check localStorage as fallback (match both phone AND email)
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.phone === phone && parsed.email === email) {
          // Returning client from local storage
          state.client = { ...parsed, isReturning: true };
          showAutofillSuccess(parsed.name);

          setTimeout(() => {
            hideAutofillMessage();
            showStep(1.5); // Show confirmation step
          }, 1500);

          continueBtn.disabled = false;
          continueBtn.textContent = originalText;
          return;
        }
      } catch (e) {
        console.error('Error parsing saved data:', e);
      }
    }

    // New client - go directly to info step
    continueBtn.disabled = false;
    continueBtn.textContent = originalText;
    showStep(2);

  } catch (error) {
    console.error('Error during client lookup:', error);
    // On error, just proceed to info step
    continueBtn.disabled = false;
    continueBtn.textContent = originalText;
    showStep(2);
  }
}

function populateConfirmationData() {
  const container = document.getElementById('confirm-data-display');

  const fullAddress = [
    `${state.client.street} ${state.client.streetNumber}`.trim() || state.client.address,
    state.client.colonia,
    `${state.client.city}, ${state.client.state}`,
    `CP ${state.client.postal}`
  ].filter(Boolean).join(', ');

  container.innerHTML = `
    <div style="display: grid; gap: 16px;">
      <div>
        <div style="font-size: 12px; color: var(--gray-600); font-weight: 600; margin-bottom: 4px;">NOMBRE COMPLETO</div>
        <div style="font-size: 16px; font-weight: 500;">${state.client.name || 'No disponible'}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--gray-600); font-weight: 600; margin-bottom: 4px;">TELÉFONO</div>
        <div style="font-size: 16px; font-weight: 500;">${state.client.phone || 'No disponible'}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--gray-600); font-weight: 600; margin-bottom: 4px;">CORREO ELECTRÓNICO</div>
        <div style="font-size: 16px; font-weight: 500;">${state.client.email || 'No disponible'}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--gray-600); font-weight: 600; margin-bottom: 4px;">DIRECCIÓN COMPLETA DE ENTREGA</div>
        <div style="font-size: 16px; font-weight: 500; line-height: 1.5;">${fullAddress || 'No disponible'}</div>
      </div>
      ${state.client.references ? `
        <div>
          <div style="font-size: 12px; color: var(--gray-600); font-weight: 600; margin-bottom: 4px;">REFERENCIAS</div>
          <div style="font-size: 14px; font-weight: 400; color: var(--gray-700);">${state.client.references}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function handleConfirmData() {
  // Client confirmed data is correct, proceed to products
  showStep(3);
}

window.editClientData = function() {
  // Pre-fill the form with existing data so they can edit
  prefillClientInfo();
  // Go to info step
  showStep(2);
  // Update help text to indicate they're editing
  document.getElementById('info-help-text').textContent = 'Modifica la información que necesites actualizar';
};

function showReturningClientMessage(name) {
  const message = document.getElementById('returning-client-message');
  const nameDisplay = document.getElementById('client-name-display');
  nameDisplay.textContent = name;
  message.classList.remove('hidden');
}

function prefillClientInfo() {
  document.getElementById('client-name').value = state.client.name || '';
  document.getElementById('client-email').value = state.client.email || '';
  document.getElementById('client-street').value = state.client.street || '';
  document.getElementById('client-street-number').value = state.client.streetNumber || '';
  // Update hidden address field for compatibility
  document.getElementById('client-address').value = state.client.address || `${state.client.street || ''} ${state.client.streetNumber || ''}`.trim();
  document.getElementById('client-colonia').value = state.client.colonia || '';
  document.getElementById('client-city').value = state.client.city || '';
  document.getElementById('client-state').value = state.client.state || '';
  document.getElementById('client-postal').value = state.client.postal || '';
  document.getElementById('client-references').value = state.client.references || '';

  // Update character counter for references
  const referencesCounter = document.getElementById('references-counter');
  if (referencesCounter) {
    const length = (state.client.references || '').length;
    referencesCounter.textContent = `Máximo 35 caracteres (${length}/35)`;
  }
}

// ==========================================
// STEP 2: CLIENT INFO
// ==========================================

function handleInfoSubmit() {
  const name = document.getElementById('client-name').value.trim();
  const email = document.getElementById('client-email').value.trim();
  const street = document.getElementById('client-street').value.trim();
  const streetNumber = document.getElementById('client-street-number').value.trim();
  const address = `${street} ${streetNumber}`.trim(); // Combined for backward compatibility
  const colonia = document.getElementById('client-colonia').value.trim();
  const city = document.getElementById('client-city').value.trim();
  const stateVal = document.getElementById('client-state').value.trim();
  const postal = document.getElementById('client-postal').value.trim();
  const references = document.getElementById('client-references').value.trim();

  // Validation
  if (!name) {
    alert('Por favor ingresa tu nombre completo');
    document.getElementById('client-name').focus();
    return;
  }

  if (!street) {
    alert('Por favor ingresa el nombre de la calle');
    document.getElementById('client-street').focus();
    return;
  }

  if (!streetNumber) {
    alert('Por favor ingresa el número de la calle');
    document.getElementById('client-street-number').focus();
    return;
  }

  if (!colonia) {
    alert('Por favor ingresa la colonia');
    document.getElementById('client-colonia').focus();
    return;
  }

  if (!city || !stateVal) {
    alert('Por favor completa ciudad y estado');
    return;
  }

  if (!postal || postal.length !== 5) {
    alert('Por favor ingresa un código postal válido de 5 dígitos');
    document.getElementById('client-postal').focus();
    return;
  }

  // Save to state
  state.client.name = name;
  state.client.email = email;
  state.client.address = address; // Combined for compatibility
  state.client.street = street;
  state.client.streetNumber = streetNumber;
  state.client.colonia = colonia;
  state.client.city = city;
  state.client.state = stateVal;
  state.client.postal = postal;
  state.client.references = references;

  // Save to localStorage for future visits
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.client));

  // Move to products
  showStep(3);
}

// ==========================================
// STEP 3: PRODUCT SELECTION
// ==========================================

async function loadProducts() {
  const container = document.getElementById('products-container');
  const loading = document.getElementById('products-loading');

  loading.classList.remove('hidden');
  container.innerHTML = '';

  try {
    const response = await fetch(`${API_BASE}/products`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error al cargar productos');
    }

    state.products = data.products;
    renderProducts(data.products);

    loading.classList.add('hidden');
  } catch (error) {
    console.error('Error loading products:', error);
    loading.innerHTML = `
      <p style="color: var(--danger)">
        ⚠️ Error al cargar productos. Por favor recarga la página.
      </p>
    `;
  }
}

function renderProducts(products) {
  const container = document.getElementById('products-container');

  if (products.length === 0) {
    container.innerHTML = '<p class="text-center">No hay productos disponibles</p>';
    return;
  }

  products.forEach(product => {
    const card = createProductCard(product);
    container.appendChild(card);
  });
}

function createProductCard(product) {
  const div = document.createElement('div');
  div.className = 'product-card';
  div.dataset.productId = product.id;

  const quantity = state.cart[product.id]?.quantity || 0;
  const price = parseFloat(product.base_price);
  const subtotal = price * quantity;

  div.innerHTML = `
    <div class="product-header">
      <img src="${product.image_url || 'https://via.placeholder.com/80'}"
           alt="${product.name}"
           class="product-image">
      <div class="product-info">
        <div class="product-category">${getCategoryLabel(product.category)}</div>
        <h3>${product.name}</h3>
        <div class="product-price">
          $${price.toFixed(2)} <span>por unidad</span>
        </div>
      </div>
    </div>

    ${product.description ? `<p style="font-size: 14px; color: var(--gray-600); margin-bottom: 12px;">${product.description}</p>` : ''}

    <div class="product-quantity">
      <label>Cantidad:</label>
      <div class="quantity-controls">
        <button type="button" class="quantity-btn" onclick="changeQuantity(${product.id}, -1)">−</button>
        <input type="number"
               class="quantity-input"
               id="qty-${product.id}"
               value="${quantity}"
               min="0"
               onchange="handleQuantityChange(${product.id}, this.value)">
        <button type="button" class="quantity-btn" onclick="changeQuantity(${product.id}, 1)">+</button>
      </div>
    </div>

    <div class="product-subtotal ${quantity > 0 ? '' : 'hidden'}" id="subtotal-${product.id}">
      <span>Subtotal:</span>
      <strong>$${subtotal.toFixed(2)}</strong>
    </div>
  `;

  return div;
}

function getCategoryLabel(category) {
  const labels = {
    'quinceañera': 'QUINCEAÑERA',
    'wedding': 'BODA',
    'birthday': 'CUMPLEAÑOS',
    'baptism': 'BAUTIZO',
    'corporate': 'CORPORATIVO',
    'general': 'GENERAL'
  };
  return labels[category] || category.toUpperCase();
}

window.changeQuantity = function(productId, delta) {
  const input = document.getElementById(`qty-${productId}`);
  const newValue = Math.max(0, parseInt(input.value || 0) + delta);
  input.value = newValue;
  handleQuantityChange(productId, newValue);
};

window.handleQuantityChange = function(productId, value) {
  const quantity = Math.max(0, parseInt(value) || 0);
  const product = state.products.find(p => p.id === productId);

  if (!product) return;

  // Update cart
  if (quantity > 0) {
    state.cart[productId] = { product, quantity };
  } else {
    delete state.cart[productId];
  }

  // Update UI
  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  const subtotalEl = document.getElementById(`subtotal-${productId}`);
  const subtotal = parseFloat(product.base_price) * quantity;

  if (quantity > 0) {
    card.classList.add('selected');
    subtotalEl.classList.remove('hidden');
    subtotalEl.querySelector('strong').textContent = `$${subtotal.toFixed(2)}`;
  } else {
    card.classList.remove('selected');
    subtotalEl.classList.add('hidden');
  }

  // Update totals
  updateOrderTotals();
};

function updateOrderTotals() {
  let subtotal = 0;

  Object.values(state.cart).forEach(({ product, quantity }) => {
    subtotal += parseFloat(product.base_price) * quantity;
  });

  const deposit = subtotal * 0.5; // 50% deposit

  state.totals.subtotal = subtotal;
  state.totals.deposit = deposit;

  // Update UI
  document.getElementById('order-total').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('deposit-amount').textContent = `$${deposit.toFixed(2)}`;
  document.getElementById('total-mini').textContent = `$${subtotal.toFixed(2)}`;

  // Enable/disable continue button
  const continueBtn = document.getElementById('continue-products');
  continueBtn.disabled = Object.keys(state.cart).length === 0;
}

function handleProductsSubmit() {
  if (Object.keys(state.cart).length === 0) {
    alert('Por favor selecciona al menos un producto');
    return;
  }

  showStep(4); // Go directly to payment
}

// ==========================================
// FILE UPLOAD HANDLING (for payment proof)
// ==========================================

function setupFileUpload(areaId, inputId, previewId, handler) {
  const area = document.getElementById(areaId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);

  area.addEventListener('click', () => input.click());

  input.addEventListener('change', (e) => {
    handler(e.target.files, preview);
  });
}

async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  // Skip compression for PDFs or already small files (< 200KB)
  if (file.type === 'application/pdf' || file.size < 200000) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            console.log(`📦 Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB`);
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleProofUpload(files, previewEl) {
  if (files.length === 0) return;

  const file = files[0];
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf'];

  if (!validTypes.includes(file.type)) {
    alert('Solo se permiten imágenes (JPG, PNG, GIF, WEBP) o PDF');
    return;
  }

  // Check file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    alert('El archivo es demasiado grande. Tamaño máximo: 10MB');
    return;
  }

  // Show preview first
  const reader = new FileReader();
  reader.onload = (e) => {
    state.payment.proofFile = {
      file,
      dataUrl: e.target.result,
      uploading: true
    };
    renderFilePreview(previewEl, [state.payment.proofFile], 'proof');
  };
  reader.readAsDataURL(file);

  // Upload to Cloudinary with compression
  try {
    // Compress image before upload
    console.log('⏳ Compressing image...');
    const compressedFile = await compressImage(file);

    const formData = new FormData();
    formData.append('receipt', compressedFile);

    console.log('⏳ Uploading to Cloudinary...');
    const response = await fetch(`${API_BASE}/upload/payment-receipt`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      // Update state with uploaded URL
      state.payment.proofFile = {
        file,
        dataUrl: data.url,
        cloudinaryUrl: data.url,
        publicId: data.publicId,
        uploading: false,
        uploaded: true
      };
      console.log('✅ Receipt uploaded successfully:', data.url);

      // Update preview with success indicator
      renderFilePreview(previewEl, [state.payment.proofFile], 'proof');
    } else {
      throw new Error(data.error || 'Error al subir el archivo');
    }
  } catch (error) {
    console.error('❌ Upload error:', error);

    // More detailed error message
    let errorMessage = 'Error al subir el comprobante de pago.\n\n';

    if (error.message.includes('Failed to fetch')) {
      errorMessage += 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
    } else if (error.message.includes('cloud_name') || error.message.includes('api_key')) {
      errorMessage += 'Error de configuración del servidor. Por favor contacta al administrador.';
    } else if (error.message.includes('timeout')) {
      errorMessage += 'La carga tardó demasiado. Intenta con una imagen más pequeña.';
    } else {
      errorMessage += `Detalles: ${error.message}`;
    }

    errorMessage += '\n\n¿Deseas intentar de nuevo?';

    if (confirm(errorMessage)) {
      // Let them try again - don't clear the file
      console.log('User will retry upload');
    } else {
      // Clear the failed upload only if they don't want to retry
      state.payment.proofFile = null;
      previewEl.innerHTML = '';
    }
  }
}

function renderFilePreview(container, files, type) {
  container.innerHTML = '';

  files.forEach((fileData, index) => {
    const item = document.createElement('div');
    item.className = 'file-preview-item';

    const img = document.createElement('img');
    img.src = fileData.dataUrl;
    img.alt = 'Preview';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = () => removeFile(type, index);

    item.appendChild(img);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

function removeFile(type, index) {
  if (type === 'proof') {
    state.payment.proofFile = null;
    document.getElementById('proof-preview').innerHTML = '';
  }
}

// ==========================================
// STEP 4: PAYMENT
// ==========================================

function populatePaymentSummary() {
  document.getElementById('payment-total').textContent = `$${state.totals.subtotal.toFixed(2)}`;
  document.getElementById('payment-deposit').textContent = `$${state.totals.deposit.toFixed(2)}`;
  document.getElementById('bank-amount').textContent = `$${state.totals.deposit.toFixed(2)}`;
  document.getElementById('card-amount').textContent = `$${state.totals.deposit.toFixed(2)}`;
}

function handlePaymentMethodChange(e) {
  state.payment.method = e.target.value;

  const bankDetails = document.getElementById('bank-details');
  const stripeLink = document.getElementById('stripe-payment-link');
  const submitBtn = document.getElementById('submit-order');

  if (e.target.value === 'bank_transfer') {
    bankDetails.classList.remove('hidden');
    stripeLink.style.display = 'none';
    submitBtn.style.display = 'block';
  } else {
    bankDetails.classList.add('hidden');
    stripeLink.style.display = 'block';
    submitBtn.style.display = 'none';
  }
}

async function handleStripePayment() {
  // Get notes from payment step
  const clientNotes = document.getElementById('client-notes').value.trim();
  state.order.clientNotes = clientNotes;

  // First, submit the order to our backend
  const submitBtn = document.getElementById('stripe-pay-btn');
  const originalText = submitBtn.innerHTML;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-small"></span> Creando pedido...';

  try {
    // Prepare order data
    const orderData = {
      // Products
      items: Object.values(state.cart).map(({ product, quantity }) => ({
        productId: product.id,
        quantity
      })),

      // Client notes
      clientNotes: state.order.clientNotes,

      // Client info
      clientName: state.client.name,
      clientPhone: state.client.phone,
      clientEmail: state.client.email,
      clientAddress: state.client.address, // Legacy field
      clientStreet: state.client.street,
      clientStreetNumber: state.client.streetNumber,
      clientColonia: state.client.colonia,
      clientCity: state.client.city,
      clientState: state.client.state,
      clientPostal: state.client.postal,
      clientReferences: state.client.references,

      // Payment
      paymentMethod: 'stripe'
    };

    console.log('Submitting order:', orderData);

    // Submit order
    const response = await fetch(`${API_BASE}/orders/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al procesar el pedido');
    }

    console.log('Order created:', result);

    // Open Stripe payment link in new tab
    window.open('https://buy.stripe.com/00gcPP1GscTObJufYY', '_blank');

    // Show success message
    alert('¡Pedido creado! Se ha abierto la página de pago de Stripe. Por favor completa tu pago y regresa aquí.');

    // Show success screen
    showSuccessScreen(result.orderNumber);

  } catch (error) {
    console.error('Error submitting order:', error);
    alert(`Error: ${error.message}`);

    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

async function handleOrderSubmit() {
  const submitBtn = document.getElementById('submit-order');
  const submitText = document.getElementById('submit-text');
  const submitLoader = document.getElementById('submit-loader');

  // Validate bank transfer has proof AND it's uploaded to Cloudinary
  if (state.payment.method === 'bank_transfer') {
    if (!state.payment.proofFile || !state.payment.proofFile.cloudinaryUrl) {
      alert('Por favor sube el comprobante de pago y espera a que se complete la carga');
      return;
    }
  }

  // Get notes from payment step
  const clientNotes = document.getElementById('client-notes').value.trim();
  state.order.clientNotes = clientNotes;

  // Disable button
  submitBtn.disabled = true;
  submitText.classList.add('hidden');
  submitLoader.classList.remove('hidden');

  try {
    // Prepare order data
    const orderData = {
      // Products
      items: Object.values(state.cart).map(({ product, quantity }) => ({
        productId: product.id,
        quantity
      })),

      // Client notes
      clientNotes: state.order.clientNotes,

      // Client info
      clientName: state.client.name,
      clientPhone: state.client.phone,
      clientEmail: state.client.email,
      clientAddress: state.client.address, // Legacy field
      clientStreet: state.client.street,
      clientStreetNumber: state.client.streetNumber,
      clientColonia: state.client.colonia,
      clientCity: state.client.city,
      clientState: state.client.state,
      clientPostal: state.client.postal,
      clientReferences: state.client.references,

      // Payment
      paymentMethod: state.payment.method,
      paymentProofUrl: state.payment.proofFile?.cloudinaryUrl || null
    };

    console.log('Submitting order:', orderData);

    // Submit order
    const response = await fetch(`${API_BASE}/orders/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al procesar el pedido');
    }

    console.log('Order created:', result);

    // Handle payment flow
    if (result.requiresPayment) {
      // Stripe payment (TODO: Implement Stripe integration)
      alert('Integración con Stripe en desarrollo. Por favor usa transferencia bancaria por ahora.');
      submitBtn.disabled = false;
      submitText.classList.remove('hidden');
      submitLoader.classList.add('hidden');
      return;
    }

    // Show success (payment proof was already included in order submission)
    showSuccessScreen(result.orderNumber);

  } catch (error) {
    console.error('Error submitting order:', error);
    alert(`Error: ${error.message}`);

    // Re-enable button
    submitBtn.disabled = false;
    submitText.classList.remove('hidden');
    submitLoader.classList.add('hidden');
  }
}

async function uploadPaymentProof(orderId) {
  if (!state.payment.proofFile || !state.payment.proofFile.cloudinaryUrl) return;

  // Use the Cloudinary URL from the already-uploaded receipt
  const proofUrl = state.payment.proofFile.cloudinaryUrl;

  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}/upload-proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ proofUrl })
    });

    const result = await response.json();

    if (!result.success) {
      console.error('Failed to upload proof:', result.error);
    }
  } catch (error) {
    console.error('Error uploading proof:', error);
  }
}

// ==========================================
// STEP 6: SUCCESS
// ==========================================

function showSuccessScreen(orderNumber) {
  document.getElementById('success-order-number').textContent = orderNumber;
  showStep(5);

  // Clear cart for next order
  state.cart = {};
  state.order.clientNotes = '';
  state.payment.proofFile = null;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// ==========================================
// CLIENT ORDER LOOKUP FUNCTIONALITY
// ==========================================

// Open the client lookup modal
window.openClientLookup = function() {
  const modal = document.getElementById('client-lookup-modal');
  modal.style.display = 'block';
  document.getElementById('lookup-phone').value = '';
  document.getElementById('lookup-email').value = '';
  document.getElementById('lookup-results').style.display = 'none';
};

// Close the client lookup modal
window.closeClientLookup = function() {
  const modal = document.getElementById('client-lookup-modal');
  modal.style.display = 'none';
};

// Lookup client orders by phone/email
window.lookupClientOrders = async function() {
  const phone = document.getElementById('lookup-phone').value.trim();
  const email = document.getElementById('lookup-email').value.trim();

  if (!phone && !email) {
    alert('Por favor ingrese al menos un teléfono o email');
    return;
  }

  const loadingDiv = document.getElementById('lookup-loading');
  const resultsDiv = document.getElementById('lookup-results');
  const ordersList = document.getElementById('lookup-orders-list');

  // Show loading
  loadingDiv.style.display = 'block';
  resultsDiv.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/orders/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone, email })
    });

    const data = await response.json();

    // Hide loading
    loadingDiv.style.display = 'none';

    if (!data.success) {
      alert(data.error || 'Error al buscar pedidos');
      return;
    }

    if (!data.orders || data.orders.length === 0) {
      ordersList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6b7280;">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <p style="font-size: 16px; font-weight: 600;">No se encontraron pedidos activos</p>
          <p style="font-size: 14px; margin-top: 8px;">No hay pedidos en proceso para este cliente</p>
        </div>
      `;
      resultsDiv.style.display = 'block';
      return;
    }

    // Display orders with prominent remaining balance
    ordersList.innerHTML = data.orders.map(order => `
      <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div>
            <div style="font-size: 18px; font-weight: 700; color: #111827;">${order.orderNumber}</div>
            <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
              ${new Date(order.orderDate).toLocaleDateString('es-MX')}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span style="font-size: 12px; padding: 4px 8px; border-radius: 4px; ${getStatusBadgeStyle(order.approvalStatus)}">
              ${order.approvalStatus}
            </span>
            <span style="font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #dbeafe; color: #1e40af;">
              ${order.status}
            </span>
          </div>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Total del Pedido:</div>
              <div style="font-size: 20px; font-weight: 700; color: #111827;">${order.totalPriceFormatted}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Anticipo:</div>
              <div style="font-size: 20px; font-weight: 700; color: #059669;">${order.depositAmountFormatted}</div>
              ${order.depositPaid ? '<div style="font-size: 12px; color: #059669;">✓ Pagado</div>' : '<div style="font-size: 12px; color: #dc2626;">⏳ Pendiente</div>'}
            </div>
          </div>

          <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px;">
            <div style="font-size: 12px; color: #92400e; font-weight: 600; margin-bottom: 4px;">Saldo Restante:</div>
            <div style="font-size: 24px; font-weight: 700; color: #b45309;">${order.remainingBalanceFormatted}</div>
            <div style="font-size: 12px; color: #92400e; margin-top: 4px;">
              Este monto debe pagarse antes de la entrega
            </div>

            ${order.approvalStatus === 'approved' && parseFloat(order.remainingBalance) > 0 && !order.secondPaymentReceipt ? `
              <div style="margin-top: 12px; border-top: 1px solid #fbbf24; padding-top: 12px;" id="second-payment-section-${order.id}">
                <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 8px;">
                  💳 Sube tu comprobante de pago final
                </div>
                <input type="file"
                       id="second-payment-upload-${order.id}"
                       accept="image/*"
                       style="display: none;"
                       onchange="handleSecondPaymentSelect(${order.id}, this.files[0])">
                <div id="upload-preview-${order.id}" style="margin-bottom: 8px;"></div>
                <div id="upload-buttons-${order.id}">
                  <button
                    onclick="document.getElementById('second-payment-upload-${order.id}').click()"
                    style="width: 100%; padding: 12px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                    📸 Seleccionar Comprobante de Pago
                  </button>
                </div>
              </div>
            ` : order.secondPaymentReceipt ? `
              <div style="margin-top: 12px; padding: 12px; background: #d1fae5; border: 1px solid #059669; border-radius: 8px;">
                <div style="font-size: 13px; font-weight: 600; color: #065f46; margin-bottom: 8px; text-align: center;">
                  ✅ Segundo recibo de pago enviado
                </div>
                <div style="font-size: 12px; color: #047857; margin-bottom: 8px; text-align: center;">
                  Estamos verificando tu pago
                </div>
                <div style="background: white; padding: 8px; border-radius: 6px; text-align: center;">
                  <img src="${order.secondPaymentReceipt}"
                       alt="Comprobante de pago final"
                       style="max-width: 100%; max-height: 200px; border-radius: 4px; cursor: pointer;"
                       onclick="window.open('${order.secondPaymentReceipt}', '_blank')">
                  <div style="font-size: 11px; color: #059669; margin-top: 4px;">
                    Click para ver en tamaño completo
                  </div>
                </div>
              </div>
            ` : ''}
          </div>

          ${order.eventDate ? `
            <div style="margin-top: 12px; padding: 8px; background: #ede9fe; border-radius: 8px;">
              <span style="font-size: 12px; color: #5b21b6; font-weight: 600;">📅 Fecha del Evento:</span>
              <span style="font-size: 14px; color: #5b21b6; font-weight: 700; margin-left: 8px;">
                ${new Date(order.eventDate).toLocaleDateString('es-MX')}
              </span>
            </div>
          ` : ''}
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 12px;">
          <div style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 8px;">Productos:</div>
          ${order.items.map(item => `
            <div style="font-size: 14px; color: #374151; margin-bottom: 4px;">
              • ${item.productName} (${item.quantity} unidades)
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    resultsDiv.style.display = 'block';

  } catch (error) {
    console.error('Error looking up orders:', error);
    alert('Error al buscar pedidos. Por favor intente nuevamente.');
    loadingDiv.style.display = 'none';
  }
};

// Helper function to get badge styling
function getStatusBadgeStyle(status) {
  const styles = {
    'pending_review': 'background: #fef3c7; color: #92400e;',
    'approved': 'background: #d1fae5; color: #065f46;',
    'rejected': 'background: #fee2e2; color: #991b1b;',
    'needs_changes': 'background: #fef3c7; color: #92400e;'
  };
  return styles[status] || 'background: #f3f4f6; color: #374151;';
}

// Global variable to store selected file temporarily
let selectedSecondPaymentFiles = {};

// Handle second payment file selection (preview first, don't upload yet)
window.handleSecondPaymentSelect = async function(orderId, file) {
  if (!file) return;

  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    alert('Solo se permiten imágenes (JPG, PNG, GIF, WEBP)');
    return;
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    alert('El archivo es demasiado grande. Tamaño máximo: 10MB');
    return;
  }

  // Store file temporarily
  selectedSecondPaymentFiles[orderId] = file;

  // Show preview
  const previewDiv = document.getElementById(`upload-preview-${orderId}`);
  const reader = new FileReader();
  reader.onload = (e) => {
    previewDiv.innerHTML = `
      <div style="background: white; border: 2px solid #059669; border-radius: 8px; padding: 8px; margin-bottom: 8px;">
        <img src="${e.target.result}"
             alt="Preview"
             style="width: 100%; max-height: 200px; object-fit: contain; border-radius: 4px;">
      </div>
    `;
  };
  reader.readAsDataURL(file);

  // Show confirmation buttons
  const buttonsDiv = document.getElementById(`upload-buttons-${orderId}`);
  buttonsDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <button
        onclick="resetSecondPaymentUpload(${orderId})"
        style="padding: 12px; background: #6b7280; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
        🔄 Escoger Otra Imagen
      </button>
      <button
        onclick="confirmSecondPaymentUpload(${orderId})"
        style="padding: 12px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
        ✅ Enviar Recibo
      </button>
    </div>
  `;
};

// Reset second payment upload (user wants to pick a different image)
window.resetSecondPaymentUpload = function(orderId) {
  // Clear stored file
  delete selectedSecondPaymentFiles[orderId];

  // Clear preview
  const previewDiv = document.getElementById(`upload-preview-${orderId}`);
  previewDiv.innerHTML = '';

  // Reset buttons
  const buttonsDiv = document.getElementById(`upload-buttons-${orderId}`);
  buttonsDiv.innerHTML = `
    <button
      onclick="document.getElementById('second-payment-upload-${orderId}').click()"
      style="width: 100%; padding: 12px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
      📸 Seleccionar Comprobante de Pago
    </button>
  `;

  // Reset file input
  document.getElementById(`second-payment-upload-${orderId}`).value = '';
};

// Confirm and upload second payment receipt
window.confirmSecondPaymentUpload = async function(orderId) {
  const file = selectedSecondPaymentFiles[orderId];
  if (!file) {
    alert('No hay archivo seleccionado');
    return;
  }

  const previewDiv = document.getElementById(`upload-preview-${orderId}`);
  const buttonsDiv = document.getElementById(`upload-buttons-${orderId}`);

  // Disable buttons during upload
  buttonsDiv.innerHTML = `
    <div style="padding: 12px; background: #dbeafe; border-radius: 8px; text-align: center; font-size: 13px; color: #1e40af;">
      <div style="font-weight: 600; margin-bottom: 4px;">⏳ Comprimiendo imagen...</div>
      <div style="font-size: 11px;">Por favor espera</div>
    </div>
  `;

  try {
    // Compress image before upload
    const compressedFile = await compressImage(file);
    console.log(`📦 Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB`);

    buttonsDiv.innerHTML = `
      <div style="padding: 12px; background: #dbeafe; border-radius: 8px; text-align: center; font-size: 13px; color: #1e40af;">
        <div style="font-weight: 600; margin-bottom: 4px;">⏳ Subiendo a Cloudinary...</div>
        <div style="font-size: 11px;">Por favor espera</div>
      </div>
    `;

    // Upload to Cloudinary first
    const formData = new FormData();
    formData.append('receipt', compressedFile);

    const uploadResponse = await fetch(`${API_BASE}/upload/payment-receipt`, {
      method: 'POST',
      body: formData
    });

    const uploadData = await uploadResponse.json();

    if (!uploadData.success) {
      throw new Error(uploadData.error || 'Error al subir el archivo');
    }

    console.log('✅ Receipt uploaded to Cloudinary:', uploadData.url);

    buttonsDiv.innerHTML = `
      <div style="padding: 12px; background: #dbeafe; border-radius: 8px; text-align: center; font-size: 13px; color: #1e40af;">
        <div style="font-weight: 600; margin-bottom: 4px;">⏳ Guardando comprobante...</div>
        <div style="font-size: 11px;">Por favor espera</div>
      </div>
    `;

    // Send Cloudinary URL to API
    const apiUrl = window.location.hostname === 'localhost'
      ? `http://localhost:3000/api/orders/${orderId}/second-payment`
      : `https://vt-souvenir-backend.onrender.com/api/orders/${orderId}/second-payment`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentProofUrl: uploadData.url })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al guardar el comprobante');
    }

    console.log('✅ Second payment proof saved successfully');

    // Show success and update UI to show "Segundo recibo enviado"
    const sectionDiv = document.getElementById(`second-payment-section-${orderId}`);
    sectionDiv.innerHTML = `
      <div style="padding: 12px; background: #d1fae5; border: 1px solid #059669; border-radius: 8px;">
        <div style="font-size: 13px; font-weight: 600; color: #065f46; margin-bottom: 8px; text-align: center;">
          ✅ Segundo recibo de pago enviado
        </div>
        <div style="font-size: 12px; color: #047857; margin-bottom: 8px; text-align: center;">
          Estamos verificando tu pago
        </div>
        <div style="background: white; padding: 8px; border-radius: 6px; text-align: center;">
          <img src="${uploadData.url}"
               alt="Comprobante de pago final"
               style="max-width: 100%; max-height: 200px; border-radius: 4px; cursor: pointer;"
               onclick="window.open('${uploadData.url}', '_blank')">
          <div style="font-size: 11px; color: #059669; margin-top: 4px;">
            Click para ver en tamaño completo
          </div>
        </div>
      </div>
    `;

    // Clear stored file
    delete selectedSecondPaymentFiles[orderId];

  } catch (error) {
    console.error('❌ Error uploading second payment:', error);
    buttonsDiv.innerHTML = `
      <div style="padding: 8px; background: #fee2e2; border-radius: 6px; text-align: center; font-size: 13px; color: #991b1b; margin-bottom: 8px;">
        ❌ Error: ${error.message}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button
          onclick="resetSecondPaymentUpload(${orderId})"
          style="padding: 12px; background: #6b7280; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
          🔄 Intentar Otra Vez
        </button>
        <button
          onclick="confirmSecondPaymentUpload(${orderId})"
          style="padding: 12px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
          ✅ Reintentar Envío
        </button>
      </div>
    `;
  }
};

// Attach event listener to the lookup button
document.addEventListener('DOMContentLoaded', function() {
  const lookupBtn = document.getElementById('btn-lookup-orders');
  if (lookupBtn) {
    lookupBtn.addEventListener('click', window.openClientLookup);
  }
});

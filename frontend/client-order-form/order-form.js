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
  : '/api/client';

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
    address: '',
    city: '',
    state: '',
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
    state.client.address,
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
  document.getElementById('client-address').value = state.client.address || '';
  document.getElementById('client-colonia').value = state.client.colonia || '';
  document.getElementById('client-city').value = state.client.city || '';
  document.getElementById('client-state').value = state.client.state || '';
  document.getElementById('client-postal').value = state.client.postal || '';
  document.getElementById('client-references').value = state.client.references || '';
}

// ==========================================
// STEP 2: CLIENT INFO
// ==========================================

function handleInfoSubmit() {
  const name = document.getElementById('client-name').value.trim();
  const email = document.getElementById('client-email').value.trim();
  const address = document.getElementById('client-address').value.trim();
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

  if (!address) {
    alert('Por favor ingresa la calle y número');
    document.getElementById('client-address').focus();
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
  state.client.address = address;
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

function handleProofUpload(files, previewEl) {
  if (files.length === 0) return;

  const file = files[0];
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

  if (!validTypes.includes(file.type)) {
    alert('Solo se permiten imágenes (JPG, PNG) o PDF');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    state.payment.proofFile = {
      file,
      dataUrl: e.target.result
    };
    renderFilePreview(previewEl, [state.payment.proofFile], 'proof');
  };
  reader.readAsDataURL(file);
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
      clientAddress: state.client.address,
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

  // Validate bank transfer has proof
  if (state.payment.method === 'bank_transfer' && !state.payment.proofFile) {
    alert('Por favor sube el comprobante de pago');
    return;
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
      clientAddress: state.client.address,
      clientColonia: state.client.colonia,
      clientCity: state.client.city,
      clientState: state.client.state,
      clientPostal: state.client.postal,
      clientReferences: state.client.references,

      // Payment
      paymentMethod: state.payment.method
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
    } else if (result.requiresProofUpload) {
      // Upload payment proof
      await uploadPaymentProof(result.orderId);
    }

    // Show success
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
  if (!state.payment.proofFile) return;

  // In production, upload to Cloudinary/S3 first to get URL
  // For now, we'll use a placeholder URL
  const proofUrl = 'https://placeholder-proof-url.com/proof.jpg';

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
              <div style="margin-top: 12px; border-top: 1px solid #fbbf24; padding-top: 12px;">
                <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 8px;">
                  💳 Sube tu comprobante de pago final
                </div>
                <input type="file"
                       id="second-payment-upload-${order.id}"
                       accept="image/*"
                       style="display: none;"
                       onchange="handleSecondPaymentUpload(${order.id}, this.files[0])">
                <div id="upload-status-${order.id}" style="margin-bottom: 8px;"></div>
                <button
                  onclick="document.getElementById('second-payment-upload-${order.id}').click()"
                  style="width: 100%; padding: 12px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                  📸 Subir Comprobante de Pago
                </button>
              </div>
            ` : order.secondPaymentReceipt ? `
              <div style="margin-top: 12px; padding: 10px; background: #d1fae5; border: 1px solid #059669; border-radius: 8px; text-align: center;">
                <div style="font-size: 13px; font-weight: 600; color: #065f46;">
                  ✅ Comprobante de pago recibido
                </div>
                <div style="font-size: 12px; color: #047857; margin-top: 4px;">
                  Estamos verificando tu pago
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

// Handle second payment upload
window.handleSecondPaymentUpload = async function(orderId, file) {
  if (!file) return;

  const statusDiv = document.getElementById(`upload-status-${orderId}`);

  // Show loading
  statusDiv.innerHTML = `
    <div style="padding: 8px; background: #dbeafe; border-radius: 6px; text-align: center; font-size: 13px; color: #1e40af;">
      ⏳ Subiendo comprobante...
    </div>
  `;

  try {
    // Convert file to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Upload to API
    const response = await fetch(`${API_BASE}/../orders/${orderId}/second-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentProof: base64 })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al subir el comprobante');
    }

    // Show success
    statusDiv.innerHTML = `
      <div style="padding: 8px; background: #d1fae5; border-radius: 6px; text-align: center; font-size: 13px; color: #065f46;">
        ✅ ¡Comprobante recibido! Verificaremos tu pago pronto.
      </div>
    `;

    // Refresh the order list after 2 seconds
    setTimeout(() => {
      window.lookupClientOrders();
    }, 2000);

  } catch (error) {
    console.error('Error uploading second payment:', error);
    statusDiv.innerHTML = `
      <div style="padding: 8px; background: #fee2e2; border-radius: 6px; text-align: center; font-size: 13px; color: #991b1b;">
        ❌ Error: ${error.message}
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

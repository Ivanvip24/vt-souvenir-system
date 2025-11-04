/**
 * Client Order Form - Mobile-First with Phone-Based Account System
 * Connects to backend API at /api/client/*
 */

// ==========================================
// CONFIGURATION
// ==========================================

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api/client'
  : '/api/client';

const STORAGE_KEY = 'souvenir_client_data';

// ==========================================
// STATE MANAGEMENT
// ==========================================

const state = {
  currentStep: 1,
  maxSteps: 6,
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
    eventType: '',
    eventDate: '',
    clientNotes: '',
    referenceImages: []
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

  // Step 1.5: Confirm Data
  const confirmBtn = document.getElementById('confirm-data-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirmData);
  }

  // Step 2: Client Info
  document.getElementById('continue-info').addEventListener('click', handleInfoSubmit);

  // Step 3: Products (loaded dynamically)
  document.getElementById('continue-products').addEventListener('click', handleProductsSubmit);

  // Step 4: Event Details
  document.getElementById('continue-event').addEventListener('click', handleEventSubmit);
  setupFileUpload('file-upload-area', 'reference-images', 'file-preview', handleReferenceUpload);

  // Step 5: Payment
  document.getElementById('submit-order').addEventListener('click', handleOrderSubmit);
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
    4: 'step-event',
    5: 'step-payment',
    6: 'step-success'
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
  } else if (stepNumber === 5) {
    populatePaymentSummary();
  }
}

function goBack() {
  if (state.currentStep > 1) {
    showStep(state.currentStep - 1);
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

  // Check if returning client (match both phone AND email)
  const savedData = localStorage.getItem(STORAGE_KEY);
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (parsed.phone === phone && parsed.email === email) {
        // Returning client! Show confirmation step
        state.client = { ...parsed, isReturning: true };
        showStep(1.5); // Show confirmation step
        return;
      }
    } catch (e) {
      console.error('Error parsing saved data:', e);
    }
  }

  // New client - go to info step
  showStep(2);
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
  const subtotal = product.base_price * quantity;

  div.innerHTML = `
    <div class="product-header">
      <img src="${product.image_url || 'https://via.placeholder.com/80'}"
           alt="${product.name}"
           class="product-image">
      <div class="product-info">
        <div class="product-category">${getCategoryLabel(product.category)}</div>
        <h3>${product.name}</h3>
        <div class="product-price">
          $${product.base_price.toFixed(2)} <span>por unidad</span>
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
  const subtotal = product.base_price * quantity;

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
    subtotal += product.base_price * quantity;
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

  showStep(4);
}

// ==========================================
// STEP 4: EVENT DETAILS
// ==========================================

function handleEventSubmit() {
  const eventDate = document.getElementById('event-date').value;
  const clientNotes = document.getElementById('client-notes').value.trim();

  // Validation - date is now optional
  if (eventDate) {
    // Only validate if a date was provided
    const selectedDate = new Date(eventDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      alert('La fecha no puede ser en el pasado');
      document.getElementById('event-date').focus();
      return;
    }
  }

  // Save to state
  state.order.eventType = 'general'; // Default since we removed the field
  state.order.eventDate = eventDate || null; // null if not provided
  state.order.clientNotes = clientNotes;

  showStep(5);
}

// ==========================================
// FILE UPLOAD HANDLING
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

function handleReferenceUpload(files, previewEl) {
  const maxFiles = 5;
  const currentFiles = state.order.referenceImages.length;

  if (currentFiles + files.length > maxFiles) {
    alert(`Máximo ${maxFiles} imágenes permitidas`);
    return;
  }

  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) {
      alert(`${file.name} no es una imagen válida`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      state.order.referenceImages.push({
        file,
        dataUrl: e.target.result
      });
      renderFilePreview(previewEl, state.order.referenceImages, 'reference');
    };
    reader.readAsDataURL(file);
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
  if (type === 'reference') {
    state.order.referenceImages.splice(index, 1);
    renderFilePreview(
      document.getElementById('file-preview'),
      state.order.referenceImages,
      'reference'
    );
  } else if (type === 'proof') {
    state.payment.proofFile = null;
    document.getElementById('proof-preview').innerHTML = '';
  }
}

// ==========================================
// STEP 5: PAYMENT
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
  if (e.target.value === 'bank_transfer') {
    bankDetails.classList.remove('hidden');
  } else {
    bankDetails.classList.add('hidden');
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

      // Event details
      eventType: state.order.eventType,
      eventDate: state.order.eventDate,
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
  showStep(6);

  // Clear cart for next order
  state.cart = {};
  state.order.referenceImages = [];
  state.payment.proofFile = null;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

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
// PRICING TIERS CONFIGURATION
// ==========================================

// Define pricing tiers for products based on quantity ranges
// Each product can have multiple tiers: { min: quantity, price: unit_price }
//
// PRICING RULES:
// 1. Most products require a MINIMUM of 100 pieces (MOQ = Minimum Order Quantity)
// 2. Portallaves de MDF: Lower minimum of only 20 pieces
// 3. Souvenir Box: No minimum, can order from 1 piece
// 4. Price changes at 1000+ pieces for bulk discount
const PRICING_TIERS = {
  // Match by product name (case-insensitive partial match)
  'imanes de mdf chico': [
    { min: 100, max: 999, price: 11.00 },
    { min: 1000, max: Infinity, price: 8.00 }
  ],
  'imanes de mdf grande': [
    { min: 100, max: 999, price: 15.00 },
    { min: 1000, max: Infinity, price: 12.00 }
  ],
  'llaveros de mdf': [
    { min: 100, max: 999, price: 10.00 },
    { min: 1000, max: Infinity, price: 8.00 }
  ],
  'imán 3d mdf': [
    { min: 100, max: 999, price: 15.00 },
    { min: 1000, max: Infinity, price: 12.00 }
  ],
  'imán de mdf con foil': [
    { min: 100, max: 999, price: 15.00 },
    { min: 1000, max: Infinity, price: 12.00 }
  ],
  'destapador de mdf': [
    { min: 100, max: 999, price: 20.00 },
    { min: 1000, max: Infinity, price: 17.00 }
  ],
  'botones metálicos': [
    { min: 100, max: 999, price: 8.00 },
    { min: 1000, max: Infinity, price: 6.00 }
  ],
  'portallaves de mdf': [
    { min: 20, max: Infinity, price: 45.00 }
  ],
  'souvenir box': [
    { min: 1, max: Infinity, price: 2250.00 }
  ]
};

/**
 * Get the appropriate price for a product based on quantity
 * Checks for promo code custom prices first, then falls back to tiered pricing
 * @param {Object} product - The product object
 * @param {number} quantity - The quantity ordered
 * @returns {Object} { price: number, tierInfo: string, savings: number, isPromoPrice: boolean }
 */
function getTieredPrice(product, quantity) {
  // Check if promo code is applied and has custom price for this product
  if (state.promo.applied && state.promo.customPrices[product.id]) {
    const promoPrice = state.promo.customPrices[product.id].customPrice;
    const normalPrice = state.promo.customPrices[product.id].normalPrice;
    const savings = (normalPrice - promoPrice) * quantity;

    return {
      price: promoPrice,
      tierInfo: `🏷️ Precio especial: $${promoPrice.toFixed(2)} c/u`,
      savings: savings > 0 ? savings : 0,
      isPromoPrice: true
    };
  }

  // Find matching pricing tier
  const productNameLower = product.name.toLowerCase();
  let tiers = null;

  // Find tiers by partial name match
  for (const [key, tierArray] of Object.entries(PRICING_TIERS)) {
    if (productNameLower.includes(key) || key.includes(productNameLower)) {
      tiers = tierArray;
      break;
    }
  }

  // If no tiers found, use base price
  if (!tiers) {
    return {
      price: parseFloat(product.base_price),
      tierInfo: null,
      savings: 0,
      isPromoPrice: false
    };
  }

  // Find the applicable tier for this quantity
  const applicableTier = tiers.find(tier =>
    quantity >= tier.min && quantity <= tier.max
  );

  if (!applicableTier) {
    // Use base price if quantity doesn't match any tier
    return {
      price: parseFloat(product.base_price),
      tierInfo: `Mínimo ${tiers[0].min} piezas para precio mayorista`,
      savings: 0,
      isPromoPrice: false
    };
  }

  // Calculate savings compared to base price
  const basePrice = parseFloat(product.base_price);
  const tierPrice = applicableTier.price;
  const savings = (basePrice - tierPrice) * quantity;

  // Format tier info
  let tierInfo = '';
  if (applicableTier.max === Infinity) {
    tierInfo = `${applicableTier.min}+ piezas: $${tierPrice.toFixed(2)} c/u`;
  } else {
    tierInfo = `${applicableTier.min}-${applicableTier.max} piezas: $${tierPrice.toFixed(2)} c/u`;
  }

  // Find next tier for incentive message
  const nextTier = tiers.find(t => t.min > quantity);
  if (nextTier && nextTier.price < tierPrice) {
    tierInfo += ` • Siguiente descuento en ${nextTier.min} piezas`;
  }

  return {
    price: tierPrice,
    tierInfo: tierInfo,
    savings: savings > 0 ? savings : 0,
    isPromoPrice: false
  };
}

// ==========================================
// INLINE ERROR HELPERS (#3)
// ==========================================

/**
 * Show inline error message for a field
 * @param {string} fieldId - The input field ID
 * @param {string} message - Error message to display
 */
function showFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}-error`);

  if (input) {
    input.classList.add('error');
  }

  if (errorEl) {
    errorEl.textContent = message;
  }
}

/**
 * Clear inline error message for a field
 * @param {string} fieldId - The input field ID
 */
function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}-error`);

  if (input) {
    input.classList.remove('error');
  }

  if (errorEl) {
    errorEl.textContent = '';
  }
}

/**
 * Clear all field errors in a step
 */
function clearAllErrors() {
  document.querySelectorAll('.input-error').forEach(el => el.textContent = '');
  document.querySelectorAll('input.error, textarea.error').forEach(el => el.classList.remove('error'));
}

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
    proofFile: null,
    uploadCooldownInterval: null // Track countdown timer
  },
  // Promo code state for special clients
  promo: {
    applied: false,
    code: null,
    clientName: null,
    specialClientId: null,
    customPrices: {} // { productId: { normalPrice, customPrice } }
  },
  totals: {
    subtotal: 0,
    shipping: 0,
    total: 0,
    deposit: 0,
    totalPieces: 0
  }
};

// Shipping configuration
const SHIPPING_CONFIG = {
  freeShippingThreshold: 300, // Free shipping at 300+ pieces
  shippingCost: 210 // $210 MXN shipping fee under threshold
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

  // #10: Product search/filter
  const searchInput = document.getElementById('product-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleProductSearch, 300));
  }

  // Auto-fill feature DISABLED - Only check on Continue button click
  // document.getElementById('phone').addEventListener('input', debounce(handlePhoneAutofill, 500));

  // Step 1.5: Confirm Data
  const confirmBtn = document.getElementById('confirm-data-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirmData);
  }

  // Step 2: Client Info
  document.getElementById('continue-info').addEventListener('click', handleInfoSubmit);

  // Postal code auto-fill for Mexico
  const postalInput = document.getElementById('client-postal');
  if (postalInput) {
    postalInput.addEventListener('input', debounce(handlePostalCodeLookup, 500));
  }

  // Add character counter for references field (#9: increased to 150)
  const referencesField = document.getElementById('client-references');
  const referencesCounter = document.getElementById('references-counter');
  if (referencesField && referencesCounter) {
    referencesField.addEventListener('input', () => {
      const length = referencesField.value.length;
      referencesCounter.textContent = `${length}/150 caracteres`;
      if (length >= 140) {
        referencesCounter.style.color = '#dc2626';
      } else {
        referencesCounter.style.color = '#4b5563';
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
  } else if (stepNumber === 2) {
    // Always pre-fill client info (email from step 1 needs to be synced to hidden field)
    prefillClientInfo();
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

  // Clear previous errors
  clearFieldError('phone');
  clearFieldError('login-email');

  // Validation with inline errors (#3)
  let hasErrors = false;

  if (phone.length !== 10 || !/^\d{10}$/.test(phone)) {
    showFieldError('phone', 'Ingresa un número válido de 10 dígitos, sin espacios');
    phoneInput.focus();
    hasErrors = true;
  }

  if (!email || !email.includes('@')) {
    showFieldError('login-email', 'Ingresa un correo electrónico válido');
    if (!hasErrors) emailInput.focus();
    hasErrors = true;
  }

  if (hasErrors) return;

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

// Track last postal code to detect changes
let lastPostalCode = '';

/**
 * Auto-fill city, state, and colonia from Mexican postal code
 * Uses the free Zippopotam.us API (works for Mexico)
 */
async function handlePostalCodeLookup() {
  const postalInput = document.getElementById('client-postal');
  const postal = postalInput.value.trim();

  const cityInput = document.getElementById('client-city');
  const stateInput = document.getElementById('client-state');
  const coloniaContainer = document.getElementById('colonia-container');

  // If postal code changed or was cleared, reset the auto-filled fields
  if (postal !== lastPostalCode) {
    // Clear previous auto-filled values
    if (stateInput.classList.contains('autofilled')) {
      stateInput.value = '';
      stateInput.classList.remove('autofilled');
    }
    if (cityInput.classList.contains('autofilled')) {
      cityInput.value = '';
      cityInput.classList.remove('autofilled');
    }

    // Reset colonia to input field
    resetColoniaToInput();
  }

  lastPostalCode = postal;

  // Only lookup when we have exactly 5 digits
  if (postal.length !== 5 || !/^\d{5}$/.test(postal)) {
    return;
  }

  // Show loading state
  postalInput.style.borderColor = '#f59e0b';

  try {
    // Use the free Zippopotam.us API for Mexico
    const response = await fetch(`https://api.zippopotam.us/mx/${postal}`);

    if (!response.ok) {
      throw new Error('Código postal no encontrado');
    }

    const data = await response.json();

    if (data && data.places && data.places.length > 0) {
      const place = data.places[0];

      // Auto-fill state
      if (place.state) {
        stateInput.value = place.state;
        stateInput.classList.add('autofilled');
        highlightField(stateInput);
      }

      // Auto-fill city (use state for Mexico since the API structure)
      if (place.state) {
        cityInput.value = place.state;
        cityInput.classList.add('autofilled');
        highlightField(cityInput);
      }

      // Handle colonia - single or multiple
      const colonias = data.places.map(p => p['place name']);

      if (colonias.length === 1) {
        // Single colonia - just fill the input
        const coloniaInput = document.getElementById('client-colonia');
        if (coloniaInput) {
          coloniaInput.value = colonias[0];
          coloniaInput.classList.add('autofilled');
          highlightField(coloniaInput);
        }
      } else if (colonias.length > 1) {
        // Multiple colonias - create dropdown
        createColoniaDropdown(colonias);
      }

      // Visual feedback - success
      postalInput.style.borderColor = '#10b981';
      setTimeout(() => {
        postalInput.style.borderColor = '';
      }, 2000);

      console.log('✅ Código postal encontrado:', colonias.length, 'colonias');
    }

  } catch (error) {
    console.log('Postal code lookup failed, user can fill manually:', error.message);
    // Silent fail - user can fill manually
    postalInput.style.borderColor = '';
  }
}

/**
 * Create a dropdown select for multiple colonias
 */
function createColoniaDropdown(colonias) {
  const container = document.getElementById('colonia-container');
  if (!container) return;

  // Create select element
  const select = document.createElement('select');
  select.id = 'client-colonia';
  select.required = true;
  select.className = 'colonia-select autofilled';

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = `Selecciona tu colonia (${colonias.length} opciones)`;
  select.appendChild(defaultOption);

  // Add colonia options
  colonias.forEach(colonia => {
    const option = document.createElement('option');
    option.value = colonia;
    option.textContent = colonia;
    select.appendChild(option);
  });

  // Replace input with select
  container.innerHTML = '';
  container.appendChild(select);

  // Highlight the dropdown
  highlightField(select);
}

/**
 * Reset colonia back to input field
 */
function resetColoniaToInput() {
  const container = document.getElementById('colonia-container');
  if (!container) return;

  // Check if it's already an input
  const existingInput = container.querySelector('input#client-colonia');
  if (existingInput) {
    existingInput.value = '';
    existingInput.classList.remove('autofilled');
    return;
  }

  // Create input element
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'client-colonia';
  input.placeholder = 'Se llenará automáticamente';
  input.required = true;

  // Replace select with input
  container.innerHTML = '';
  container.appendChild(input);
}

/**
 * Highlight a field briefly to show it was auto-filled
 * Note: The .autofilled CSS class handles styling for both light/dark modes
 * No inline styles needed - this prevents the bright flash in dark mode
 */
function highlightField(element) {
  // The .autofilled class already provides visual feedback
  // No additional inline styles needed
}

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

  // Clear all errors first
  clearAllErrors();

  // Validation with inline errors (#3)
  let hasErrors = false;
  let firstErrorField = null;

  if (!name) {
    showFieldError('client-name', 'Ingresa tu nombre completo');
    firstErrorField = firstErrorField || 'client-name';
    hasErrors = true;
  }

  if (!street) {
    showFieldError('client-street', 'Ingresa el nombre de la calle');
    firstErrorField = firstErrorField || 'client-street';
    hasErrors = true;
  }

  if (!streetNumber) {
    showFieldError('client-street-number', 'Ingresa el número');
    firstErrorField = firstErrorField || 'client-street-number';
    hasErrors = true;
  }

  if (!colonia) {
    showFieldError('client-colonia', 'Ingresa la colonia');
    firstErrorField = firstErrorField || 'client-colonia';
    hasErrors = true;
  }

  if (!city) {
    showFieldError('client-city', 'Ingresa la ciudad');
    firstErrorField = firstErrorField || 'client-city';
    hasErrors = true;
  }

  if (!stateVal) {
    showFieldError('client-state', 'Ingresa el estado');
    firstErrorField = firstErrorField || 'client-state';
    hasErrors = true;
  }

  if (!postal || postal.length !== 5 || !/^\d{5}$/.test(postal)) {
    showFieldError('client-postal', 'Código postal de 5 dígitos');
    firstErrorField = firstErrorField || 'client-postal';
    hasErrors = true;
  }

  if (hasErrors) {
    if (firstErrorField) {
      document.getElementById(firstErrorField).focus();
    }
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

    // Filter out "Imán de MDF con Foil" from the products list
    const filteredProducts = data.products.filter(product =>
      product.name !== 'Imán de MDF con Foil'
    );

    state.products = filteredProducts;
    renderProducts(filteredProducts);

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
    container.innerHTML = '<p class="text-center" style="padding: 40px 20px; color: var(--gray-600);">No hay productos disponibles</p>';
    return;
  }

  container.innerHTML = '';
  products.forEach(product => {
    const card = createProductCard(product);
    container.appendChild(card);
  });
}

// #10: Product search/filter functionality
function handleProductSearch(e) {
  const searchTerm = e.target.value.toLowerCase().trim();
  const container = document.getElementById('products-container');

  if (!searchTerm) {
    // Show all products
    renderProducts(state.products);
    return;
  }

  // Filter products by name or category
  const filteredProducts = state.products.filter(product => {
    const nameMatch = product.name.toLowerCase().includes(searchTerm);
    const categoryMatch = product.category && product.category.toLowerCase().includes(searchTerm);
    return nameMatch || categoryMatch;
  });

  if (filteredProducts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--gray-600);">
        <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
        <p style="font-size: 16px; font-weight: 600;">No se encontraron productos</p>
        <p style="font-size: 14px; margin-top: 8px;">Intenta con otro término de búsqueda</p>
      </div>
    `;
    return;
  }

  renderProducts(filteredProducts);
}

function createProductCard(product) {
  const div = document.createElement('div');
  div.className = 'product-card';
  div.dataset.productId = product.id;
  div.style.position = 'relative'; // For MOQ badge positioning

  const quantity = state.cart[product.id]?.quantity || 0;
  const basePrice = parseFloat(product.base_price);

  // Get tiered pricing - show Tier 1 price (minimum quantity) when no items in cart
  const productNameLower = product.name.toLowerCase();
  let defaultQuantity = 1;
  let moq = 100; // Default MOQ

  // Find the minimum quantity for this product to show the wholesale price
  for (const [key, tierArray] of Object.entries(PRICING_TIERS)) {
    if (productNameLower.includes(key) || key.includes(productNameLower)) {
      defaultQuantity = tierArray[0].min; // Use minimum of first tier
      moq = tierArray[0].min;
      break;
    }
  }

  const { price, tierInfo, savings } = getTieredPrice(product, quantity > 0 ? quantity : defaultQuantity);
  const subtotal = price * quantity;

  // #11: MOQ badge text
  const moqBadgeText = moq === 1 ? 'Sin mínimo' : `Mín. ${moq} pzas`;

  div.innerHTML = `
    <!-- #11: MOQ Badge -->
    <div class="product-moq-badge">${moqBadgeText}</div>

    <div class="product-header">
      <img src="${product.image_url || 'https://via.placeholder.com/80'}"
           alt="${product.name}"
           class="product-image">
      <div class="product-info">
        <div class="product-category">${getCategoryLabel(product.category)}</div>
        <h3 class="product-name">${product.name}</h3>
        <div class="product-price">
          $${price.toFixed(2)} <span>por unidad</span>
        </div>
      </div>
    </div>

    ${product.description ? `<p style="font-size: 14px; color: var(--gray-600); margin-bottom: 12px;">${product.description}</p>` : ''}

    <!-- Tier Information -->
    <div class="tier-info" id="tier-${product.id}">
      ${tierInfo ? `
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">💰</span>
          <span>${tierInfo}</span>
        </div>
      ` : ''}
    </div>

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
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>Subtotal:</span>
        <strong>$${subtotal.toFixed(2)}</strong>
      </div>
      ${savings > 0 ? `
        <div style="font-size: 12px; color: #059669; margin-top: 4px;">
          ✓ Ahorras $${savings.toFixed(2)}
        </div>
      ` : ''}
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

  // Check minimum order quantity (MOQ)
  const productNameLower = product.name.toLowerCase();
  let moq = 0; // Default no minimum

  for (const [key, tierArray] of Object.entries(PRICING_TIERS)) {
    if (productNameLower.includes(key) || key.includes(productNameLower)) {
      moq = tierArray[0].min;
      break;
    }
  }

  // If quantity is between 1 and MOQ-1, show warning and don't add to cart
  if (quantity > 0 && quantity < moq) {
    const input = document.getElementById(`qty-${productId}`);
    const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    const tierInfoEl = document.getElementById(`tier-${productId}`);

    // Show MOQ warning
    if (tierInfoEl) {
      tierInfoEl.innerHTML = `
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">⚠️</span>
          <span>Mínimo ${moq} piezas para este producto</span>
        </div>
      `;
    }

    // Don't add to cart
    delete state.cart[productId];
    const subtotalEl = document.getElementById(`subtotal-${productId}`);
    if (subtotalEl) {
      subtotalEl.classList.add('hidden');
    }
    card.classList.remove('selected');
    updateOrderTotals();
    return;
  }

  // Update cart
  if (quantity > 0) {
    state.cart[productId] = { product, quantity };
  } else {
    delete state.cart[productId];
  }

  // Get tiered pricing for new quantity
  const { price, tierInfo, savings } = getTieredPrice(product, quantity > 0 ? quantity : moq || 1);
  const subtotal = price * quantity;

  // Update UI
  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  const subtotalEl = document.getElementById(`subtotal-${productId}`);
  const tierInfoEl = document.getElementById(`tier-${productId}`);
  const priceEl = card.querySelector('.product-price');

  // Update price display
  if (priceEl) {
    priceEl.innerHTML = `$${price.toFixed(2)} <span>por unidad</span>`;
  }

  // Update tier info
  if (tierInfoEl) {
    tierInfoEl.innerHTML = tierInfo ? `
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">💰</span>
        <span>${tierInfo}</span>
      </div>
    ` : '';
  }

  // Update subtotal
  if (quantity > 0) {
    card.classList.add('selected');
    subtotalEl.classList.remove('hidden');
    subtotalEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>Subtotal:</span>
        <strong>$${subtotal.toFixed(2)}</strong>
      </div>
      ${savings > 0 ? `
        <div style="font-size: 12px; color: #059669; margin-top: 4px;">
          ✓ Ahorras $${savings.toFixed(2)}
        </div>
      ` : ''}
    `;
  } else {
    card.classList.remove('selected');
    subtotalEl.classList.add('hidden');
  }

  // Update totals
  updateOrderTotals();
};

function updateOrderTotals() {
  let subtotal = 0;
  let totalPieces = 0;

  Object.values(state.cart).forEach(({ product, quantity }) => {
    // Use tiered pricing for each product
    const { price } = getTieredPrice(product, quantity);
    subtotal += price * quantity;
    totalPieces += quantity;
  });

  // Calculate shipping: FREE if >= 300 pieces, otherwise $210
  const shipping = totalPieces >= SHIPPING_CONFIG.freeShippingThreshold ? 0 : SHIPPING_CONFIG.shippingCost;
  const total = subtotal + shipping;
  const deposit = total * 0.5; // 50% deposit of total (including shipping)

  state.totals.subtotal = subtotal;
  state.totals.shipping = shipping;
  state.totals.total = total;
  state.totals.deposit = deposit;
  state.totals.totalPieces = totalPieces;

  // Update UI - sticky footer
  document.getElementById('order-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('order-total').textContent = `$${total.toFixed(2)}`;
  document.getElementById('deposit-amount').textContent = `$${deposit.toFixed(2)}`;
  document.getElementById('total-mini').textContent = `$${total.toFixed(2)}`;

  // Update footer shipping display
  const footerShipping = document.getElementById('footer-shipping');
  if (footerShipping) {
    if (shipping === 0) {
      footerShipping.innerHTML = `<span style="color: #10b981;">¡GRATIS!</span>`;
    } else {
      footerShipping.textContent = `$${shipping.toFixed(2)}`;
    }
  }

  // Update shipping indicator (progress message)
  const shippingIndicator = document.getElementById('shipping-indicator');
  if (shippingIndicator) {
    if (totalPieces === 0) {
      shippingIndicator.innerHTML = '';
    } else if (shipping === 0) {
      shippingIndicator.innerHTML = `<span style="color: #10b981; font-weight: 600;">🎉 ¡Envío GRATIS incluido!</span>`;
    } else {
      const piecesNeeded = SHIPPING_CONFIG.freeShippingThreshold - totalPieces;
      shippingIndicator.innerHTML = `<span style="color: #f59e0b;">💡 ¡Agrega ${piecesNeeded} piezas más para envío gratis!</span>`;
    }
  }

  // Enable/disable continue button
  const continueBtn = document.getElementById('continue-products');
  continueBtn.disabled = Object.keys(state.cart).length === 0;
}

function handleProductsSubmit() {
  if (Object.keys(state.cart).length === 0) {
    alert('Por favor selecciona al menos un producto');
    return;
  }

  // Populate order summary before showing payment step
  populateOrderSummary();

  showStep(4); // Go directly to payment
}

/**
 * Populate the order summary in the payment step
 */
function populateOrderSummary() {
  const summaryContainer = document.getElementById('order-items-summary');
  summaryContainer.innerHTML = '';

  let subtotal = 0;
  let totalPieces = 0;

  // Generate HTML for each item in cart
  Object.values(state.cart).forEach(({ product, quantity }) => {
    const { price } = getTieredPrice(product, quantity);
    const lineTotal = price * quantity;
    subtotal += lineTotal;
    totalPieces += quantity;

    const itemRow = document.createElement('div');
    itemRow.className = 'order-item-row';
    itemRow.innerHTML = `
      <div class="order-item-info">
        <div class="order-item-name">${product.name}</div>
        <div class="order-item-details">
          ${quantity} unidades × $${price.toFixed(2)}
        </div>
      </div>
      <div class="order-item-price">
        $${lineTotal.toFixed(2)}
      </div>
    `;
    summaryContainer.appendChild(itemRow);
  });

  // Calculate shipping
  const shipping = totalPieces >= SHIPPING_CONFIG.freeShippingThreshold ? 0 : SHIPPING_CONFIG.shippingCost;
  const total = subtotal + shipping;
  const deposit = total * 0.5;

  // Update subtotal display
  document.getElementById('summary-subtotal').textContent = `$${subtotal.toFixed(2)}`;

  // Update shipping display
  const shippingEl = document.getElementById('summary-shipping');
  if (shippingEl) {
    if (shipping === 0) {
      shippingEl.innerHTML = `<span style="color: #10b981; font-weight: 600;">¡GRATIS!</span>`;
    } else {
      shippingEl.textContent = `$${shipping.toFixed(2)}`;
    }
  }

  // Update total display
  const totalEl = document.getElementById('summary-total');
  if (totalEl) {
    totalEl.textContent = `$${total.toFixed(2)}`;
  }

  document.getElementById('summary-deposit').textContent = `$${deposit.toFixed(2)}`;
  document.getElementById('summary-total-pay').textContent = `$${deposit.toFixed(2)}`;
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

  // Disable submit button while uploading
  const submitBtn = document.getElementById('submit-order');
  const originalButtonState = submitBtn.disabled;
  submitBtn.disabled = true;
  submitBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)'; // Orange = uploading
  submitBtn.style.opacity = '0.7';
  submitBtn.style.cursor = 'not-allowed';

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

      // Start 3-second cooldown before allowing submission
      let countdown = 3;
      submitBtn.disabled = true;

      // GRAY button during countdown - very obvious visual feedback
      submitBtn.style.background = 'linear-gradient(135deg, #9ca3af, #6b7280)';
      submitBtn.style.opacity = '0.8';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.style.transform = 'scale(0.98)';

      // Get button text elements
      const submitText = document.getElementById('submit-text');
      const originalButtonText = submitText ? submitText.textContent : submitBtn.textContent;

      // Show countdown message
      const showCountdown = () => {
        if (submitText) {
          submitText.textContent = `⏳ Recibo subido. Espera ${countdown}s para continuar...`;
        } else {
          submitBtn.textContent = `⏳ Recibo subido. Espera ${countdown}s...`;
        }
      };

      showCountdown();

      // Countdown timer - store in state so it can be cleared if file is removed
      state.payment.uploadCooldownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          showCountdown();
        } else {
          clearInterval(state.payment.uploadCooldownInterval);
          state.payment.uploadCooldownInterval = null;

          // Re-enable submit button after cooldown - GREEN and ready!
          submitBtn.disabled = false;
          submitBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          submitBtn.style.opacity = '1';
          submitBtn.style.cursor = 'pointer';
          submitBtn.style.transform = 'scale(1)';

          // Restore original button text
          if (submitText) {
            submitText.textContent = originalButtonText;
          } else {
            submitBtn.textContent = originalButtonText;
          }

          console.log('✅ Cooldown complete - submit button enabled');
        }
      }, 1000);
    } else {
      throw new Error(data.error || 'Error al subir el archivo');
    }
  } catch (error) {
    console.error('❌ Upload error:', error);

    // Clear countdown timer if it exists
    if (state.payment.uploadCooldownInterval) {
      clearInterval(state.payment.uploadCooldownInterval);
      state.payment.uploadCooldownInterval = null;
    }

    // Re-enable submit button on error (they'll need to retry upload)
    submitBtn.disabled = false;
    submitBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    submitBtn.style.opacity = '1';
    submitBtn.style.cursor = 'pointer';
    submitBtn.style.transform = 'scale(1)';

    // Restore button text
    const submitText = document.getElementById('submit-text');
    if (submitText) {
      submitText.textContent = 'Enviar Pedido';
    } else {
      submitBtn.textContent = 'Enviar Pedido';
    }

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

    // Mark upload as failed
    if (state.payment.proofFile) {
      state.payment.proofFile.uploading = false;
      state.payment.proofFile.uploaded = false;
      state.payment.proofFile.error = error.message;
    }

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

    // Add upload status indicator
    if (fileData.uploading) {
      item.style.opacity = '0.6';
      item.style.position = 'relative';
    }

    const img = document.createElement('img');
    img.src = fileData.dataUrl;
    img.alt = 'Preview';

    // Add status overlay
    if (fileData.uploading) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600; border-radius: 8px;';
      overlay.innerHTML = '⏳ Subiendo...';
      item.appendChild(overlay);
    } else if (fileData.uploaded) {
      const checkmark = document.createElement('div');
      checkmark.style.cssText = 'position: absolute; top: 8px; right: 8px; background: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);';
      checkmark.innerHTML = '✓';
      item.appendChild(checkmark);
    } else if (fileData.error) {
      const errorIcon = document.createElement('div');
      errorIcon.style.cssText = 'position: absolute; top: 8px; right: 8px; background: #ef4444; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);';
      errorIcon.innerHTML = '!';
      item.appendChild(errorIcon);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = () => removeFile(type, index);
    // Don't allow removal while uploading
    if (fileData.uploading) {
      removeBtn.style.display = 'none';
    }

    item.appendChild(img);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

function removeFile(type, index) {
  if (type === 'proof') {
    state.payment.proofFile = null;
    document.getElementById('proof-preview').innerHTML = '';

    // Clear countdown timer if it's running
    if (state.payment.uploadCooldownInterval) {
      clearInterval(state.payment.uploadCooldownInterval);
      state.payment.uploadCooldownInterval = null;
      console.log('⏹️ Cooldown timer cancelled - file removed');
    }

    // Re-enable submit button and restore text
    const submitBtn = document.getElementById('submit-order');
    const submitText = document.getElementById('submit-text');

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';

      // Restore original button text
      if (submitText) {
        submitText.textContent = 'Enviar Pedido';
      } else {
        submitBtn.textContent = 'Enviar Pedido';
      }
    }
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
      // Products with tiered pricing
      items: Object.values(state.cart).map(({ product, quantity }) => {
        const { price } = getTieredPrice(product, quantity);
        return {
          productId: product.id,
          quantity,
          unitPrice: price // Send the tiered price to backend
        };
      }),

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
    // Order is saved, open Stripe for payment in new tab
    window.open('https://buy.stripe.com/00gcPP1GscTObJufYY', '_blank');

    // Show success screen since order is already created
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
    // Check if file is still uploading
    if (state.payment.proofFile && state.payment.proofFile.uploading) {
      alert('⏳ El comprobante de pago aún se está subiendo. Por favor espera a que se complete la carga.');
      return;
    }

    // Check if file was uploaded successfully
    if (!state.payment.proofFile || !state.payment.proofFile.cloudinaryUrl || !state.payment.proofFile.uploaded) {
      alert('❌ Por favor sube el comprobante de pago y espera a que se complete la carga antes de enviar tu pedido.');
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
      // Products with tiered pricing
      items: Object.values(state.cart).map(({ product, quantity }) => {
        const { price } = getTieredPrice(product, quantity);
        return {
          productId: product.id,
          quantity,
          unitPrice: price // Send the tiered price to backend
        };
      }),

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

  // #17: Show email confirmation notice
  const emailNotice = document.getElementById('email-confirmation-notice');
  const successEmail = document.getElementById('success-email');
  if (emailNotice && successEmail && state.client.email) {
    successEmail.textContent = state.client.email;
    emailNotice.style.display = 'block';
  } else if (emailNotice) {
    emailNotice.style.display = 'none';
  }

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
              <!-- STEP 1: Select Shipping Method -->
              <div style="margin-top: 12px; border-top: 1px solid #fbbf24; padding-top: 12px;" id="shipping-selection-section-${order.id}">
                <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 8px;">
                  🚚 Paso 1: Selecciona tu método de envío
                </div>
                <div id="shipping-options-${order.id}" style="margin-bottom: 12px;">
                  <button
                    onclick="loadShippingOptions(${order.id})"
                    style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                    📦 Ver Opciones de Envío
                  </button>
                </div>
              </div>

              <!-- STEP 2: Upload Payment Receipt (shown after shipping selection) -->
              <div style="margin-top: 12px; padding-top: 12px; display: none;" id="second-payment-section-${order.id}">
                <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 8px;">
                  💳 Paso 2: Sube tu comprobante de pago final
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
                ${order.secondPaymentReceived ? `
                  <div style="font-size: 12px; color: #047857; margin-bottom: 8px; text-align: center;">
                    ✓ Pago verificado
                  </div>
                ` : `
                  <div style="font-size: 12px; color: #047857; margin-bottom: 8px; text-align: center;">
                    Estamos verificando tu pago
                  </div>
                `}
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

          <!-- Shipping Section - Only show tracking info after second payment is uploaded -->
          ${order.secondPaymentReceipt && order.shippingLabelsCount > 0 ? `
            <div id="shipping-info-${order.id}" style="margin-top: 12px; padding: 16px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); border-radius: 12px;">
              <div style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 12px; text-align: center;">
                🚚 Información de Envío
              </div>
              <div id="shipping-labels-${order.id}" style="background: white; border-radius: 8px; padding: 12px;">
                <div style="text-align: center; color: #666; font-size: 12px;">
                  Cargando información de envío...
                </div>
              </div>
            </div>
            <script>loadShippingLabels(${order.id})</script>
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

    // Now generate the shipping label with client's selected rate
    buttonsDiv.innerHTML = `
      <div style="padding: 12px; background: #dbeafe; border-radius: 8px; text-align: center; font-size: 13px; color: #1e40af;">
        <div style="font-weight: 600; margin-bottom: 4px;">🚚 Generando guía de envío...</div>
        <div style="font-size: 11px;">Por favor espera</div>
      </div>
    `;

    // Generate shipping label
    const labelResult = await generateLabelAfterPayment(orderId);

    // Show success and update UI
    const sectionDiv = document.getElementById(`second-payment-section-${orderId}`);

    if (labelResult.success) {
      sectionDiv.innerHTML = `
        <div style="padding: 12px; background: #d1fae5; border: 1px solid #059669; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-size: 13px; font-weight: 600; color: #065f46; margin-bottom: 8px; text-align: center;">
            ✅ Pago recibido
          </div>
          <div style="background: white; padding: 8px; border-radius: 6px; text-align: center;">
            <img src="${uploadData.url}"
                 alt="Comprobante de pago final"
                 style="max-width: 100%; max-height: 150px; border-radius: 4px; cursor: pointer;"
                 onclick="window.open('${uploadData.url}', '_blank')">
          </div>
        </div>
        <!-- Shipping Info - Simplified: Only tracking number and arrival time -->
        <div style="padding: 16px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); border-radius: 12px;">
          <div style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 12px; text-align: center;">
            🚚 Información de Envío
          </div>
          <div style="background: white; border-radius: 8px; padding: 16px;">
            ${labelResult.label.tracking_number ? `
              <div style="text-align: center; margin-bottom: 16px;">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">Número de Guía:</div>
                <div style="font-family: monospace; font-size: 20px; font-weight: 700; color: #1f2937; background: #f3f4f6; padding: 12px 16px; border-radius: 8px; letter-spacing: 2px;">
                  ${labelResult.label.tracking_number}
                </div>
              </div>
              <div style="text-align: center; padding: 12px; background: #ecfdf5; border-radius: 8px;">
                <div style="font-size: 12px; color: #059669; margin-bottom: 4px;">Tiempo estimado de entrega:</div>
                <div style="font-size: 18px; font-weight: 700; color: #047857;">
                  ${labelResult.label.delivery_days || '3-5'} días hábiles
                </div>
              </div>
            ` : `
              <div style="text-align: center; padding: 16px;">
                <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
                <div style="font-size: 14px; color: #6b7280;">
                  Generando número de guía...
                </div>
              </div>
            `}
          </div>
        </div>
      `;

      // Poll for tracking number if not available yet
      if (!labelResult.label.tracking_number) {
        pollForTrackingNumber(orderId);
      }
    } else {
      // Label generation failed, but payment was received
      sectionDiv.innerHTML = `
        <div style="padding: 12px; background: #d1fae5; border: 1px solid #059669; border-radius: 8px;">
          <div style="font-size: 13px; font-weight: 600; color: #065f46; margin-bottom: 8px; text-align: center;">
            ✅ Segundo recibo de pago enviado
          </div>
          <div style="font-size: 12px; color: #047857; margin-bottom: 8px; text-align: center;">
            Estamos procesando tu envío
          </div>
          <div style="background: white; padding: 8px; border-radius: 6px; text-align: center;">
            <img src="${uploadData.url}"
                 alt="Comprobante de pago final"
                 style="max-width: 100%; max-height: 200px; border-radius: 4px; cursor: pointer;"
                 onclick="window.open('${uploadData.url}', '_blank')">
          </div>
        </div>
        <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px; text-align: center; font-size: 12px; color: #92400e;">
          ⚠️ La guía se generará pronto. Te notificaremos cuando esté lista.
        </div>
      `;
    }

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

/**
 * Copy text to clipboard and show visual feedback
 * @param {string} text - The text to copy
 * @param {HTMLElement} button - The button element that was clicked
 */
window.copyToClipboard = async function(text, button) {
  try {
    // Use the modern Clipboard API
    await navigator.clipboard.writeText(text);

    // Visual feedback - change button appearance
    const originalContent = button.innerHTML;
    button.innerHTML = '✓';
    button.classList.add('copied');

    // Reset button after 2 seconds
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.classList.remove('copied');
    }, 2000);

  } catch (error) {
    console.error('Failed to copy:', error);

    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand('copy');
      const originalContent = button.innerHTML;
      button.innerHTML = '✓';
      button.classList.add('copied');

      setTimeout(() => {
        button.innerHTML = originalContent;
        button.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textArea);
  }
};


// ==========================================
// PROMO CODE FUNCTIONS
// ==========================================

/**
 * Apply a promo code and load custom prices
 */
async function applyPromoCode() {
  const codeInput = document.getElementById("promo-code-input");
  const messageEl = document.getElementById("promo-code-message");
  const applyBtn = document.getElementById("apply-promo-btn");

  const code = codeInput.value.trim().toUpperCase();

  if (!code || code.length !== 6) {
    messageEl.textContent = "Ingresa un código de 6 caracteres";
    messageEl.className = "promo-message error";
    return;
  }

  // Show loading state
  applyBtn.disabled = true;
  applyBtn.textContent = "...";
  messageEl.textContent = "";

  try {
    const response = await fetch(`${API_BASE.replace("/client", "")}/discounts/validate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    const data = await response.json();

    if (data.success && data.valid) {
      // Apply promo code
      state.promo.applied = true;
      state.promo.code = code;
      state.promo.clientName = data.clientName;
      state.promo.specialClientId = data.specialClientId;
      state.promo.customPrices = data.customPrices;

      // Update UI
      showPromoAppliedBanner(data.clientName);

      // Recalculate prices for items already in cart
      updateOrderTotals();

      // Re-render products to show new prices
      renderProducts(state.products);

      messageEl.textContent = "";
    } else {
      messageEl.textContent = data.error || "Código no válido o expirado";
      messageEl.className = "promo-message error";
    }
  } catch (error) {
    console.error("Error validating promo code:", error);
    messageEl.textContent = "Error validando código";
    messageEl.className = "promo-message error";
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = "Aplicar";
  }
}

/**
 * Remove applied promo code
 */
function removePromoCode() {
  state.promo.applied = false;
  state.promo.code = null;
  state.promo.clientName = null;
  state.promo.specialClientId = null;
  state.promo.customPrices = {};

  // Reset UI
  document.getElementById("promo-code-input").value = "";
  document.getElementById("promo-code-container").style.display = "";
  document.getElementById("promo-applied-banner").style.display = "none";
  document.getElementById("promo-code-message").textContent = "";

  // Recalculate prices
  updateOrderTotals();

  // Re-render products with normal prices
  renderProducts(state.products);
}

/**
 * Show the "promo applied" banner and hide input
 */
function showPromoAppliedBanner(clientName) {
  document.getElementById("promo-code-container").style.display = "none";
  document.getElementById("promo-applied-banner").style.display = "flex";
  document.getElementById("promo-client-name").textContent = clientName;
}

// Make functions globally available
window.applyPromoCode = applyPromoCode;
window.removePromoCode = removePromoCode;

// ==========================================
// SHIPPING FUNCTIONS
// ==========================================

/**
 * Generate shipping label for an order
 * Called when user clicks "Crear Envío" button
 */
window.generateShippingLabel = async function(orderId) {
  const btn = document.getElementById(`generate-shipping-btn-${orderId}`);
  const section = document.getElementById(`shipping-section-${orderId}`);

  // Show loading state
  btn.disabled = true;
  btn.innerHTML = `
    <span style="display: inline-block; width: 16px; height: 16px; border: 2px solid #667eea; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></span>
    Generando guía...
  `;

  try {
    // Call API to generate shipping label
    const apiUrl = window.location.hostname === 'localhost'
      ? `http://localhost:3000/api/shipping/orders/${orderId}/generate`
      : `https://vt-souvenir-backend.onrender.com/api/shipping/orders/${orderId}/generate`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ labelsCount: 1 })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al generar la guía');
    }

    // Success! Replace the button section with the shipping info
    section.outerHTML = `
      <div id="shipping-info-${orderId}" style="margin-top: 12px; padding: 16px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); border-radius: 12px;">
        <div style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 12px; text-align: center;">
          ✅ ¡Guía de Envío Generada!
        </div>
        <div style="background: white; border-radius: 8px; padding: 12px;">
          ${result.labels.map(label => `
            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; color: #6b7280; font-weight: 600;">📦 ${label.carrier}</span>
                <span style="font-size: 12px; color: #059669; font-weight: 600;">🚚 ${label.delivery_days || '3-5'} días</span>
              </div>
              ${label.tracking_number ? `
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Número de Rastreo:</div>
                <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #1f2937; background: #f3f4f6; padding: 8px 12px; border-radius: 6px; text-align: center; letter-spacing: 1px;">
                  ${label.tracking_number}
                </div>
              ` : `
                <div style="font-size: 12px; color: #f59e0b; font-style: italic; text-align: center;">
                  ⏳ El número de rastreo se está generando...
                </div>
              `}
              ${label.tracking_url ? `
                <a href="${label.tracking_url}" target="_blank" rel="noopener noreferrer"
                   style="display: block; margin-top: 12px; padding: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; text-align: center; font-weight: 600; font-size: 13px;">
                  🔍 Rastrear Envío
                </a>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Start polling for tracking number if not available yet
    if (result.labels.some(l => !l.tracking_number)) {
      pollForTrackingNumber(orderId);
    }

  } catch (error) {
    console.error('Error generating shipping label:', error);

    // Show error state
    btn.disabled = false;
    btn.innerHTML = '🚚 Crear Envío';

    // Show error message
    alert(`Error: ${error.message}\n\nPor favor intenta de nuevo o contacta soporte.`);
  }
};

/**
 * Load existing shipping labels for an order
 * Called when the order already has labels generated
 */
window.loadShippingLabels = async function(orderId) {
  const container = document.getElementById(`shipping-labels-${orderId}`);
  if (!container) return;

  try {
    const apiUrl = window.location.hostname === 'localhost'
      ? `http://localhost:3000/api/shipping/orders/${orderId}/labels`
      : `https://vt-souvenir-backend.onrender.com/api/shipping/orders/${orderId}/labels`;

    const response = await fetch(apiUrl);
    const result = await response.json();

    if (!result.success || !result.labels.length) {
      container.innerHTML = `
        <div style="text-align: center; color: #dc2626; font-size: 12px;">
          No se encontraron guías
        </div>
      `;
      return;
    }

    // Simplified display: Only tracking number and estimated arrival
    container.innerHTML = result.labels.map(label => `
      <div style="padding: 12px;">
        ${label.tracking_number ? `
          <div style="text-align: center; margin-bottom: 12px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">Número de Guía:</div>
            <div style="font-family: monospace; font-size: 18px; font-weight: 700; color: #1f2937; background: #f3f4f6; padding: 10px 14px; border-radius: 8px; letter-spacing: 2px;">
              ${label.tracking_number}
            </div>
          </div>
          <div style="text-align: center; padding: 10px; background: #ecfdf5; border-radius: 8px;">
            <div style="font-size: 11px; color: #059669; margin-bottom: 4px;">Tiempo estimado de entrega:</div>
            <div style="font-size: 16px; font-weight: 700; color: #047857;">
              ${label.delivery_days || '3-5'} días hábiles
            </div>
          </div>
        ` : `
          <div style="text-align: center; padding: 12px;">
            <div style="font-size: 20px; margin-bottom: 8px;">⏳</div>
            <div style="font-size: 13px; color: #6b7280;">
              Generando número de guía...
            </div>
          </div>
        `}
      </div>
    `).join('');

    // Poll for tracking if any label is missing it
    if (result.labels.some(l => !l.tracking_number)) {
      pollForTrackingNumber(orderId);
    }

  } catch (error) {
    console.error('Error loading shipping labels:', error);
    container.innerHTML = `
      <div style="text-align: center; color: #dc2626; font-size: 12px;">
        Error al cargar información de envío
      </div>
    `;
  }
};

/**
 * Poll for tracking number updates
 */
async function pollForTrackingNumber(orderId, attempts = 0) {
  if (attempts >= 10) return; // Max 10 attempts (30 seconds)

  setTimeout(async () => {
    try {
      const apiUrl = window.location.hostname === 'localhost'
        ? `http://localhost:3000/api/shipping/orders/${orderId}/labels`
        : `https://vt-souvenir-backend.onrender.com/api/shipping/orders/${orderId}/labels`;

      const response = await fetch(apiUrl);
      const result = await response.json();

      if (result.success && result.labels.length > 0) {
        const allHaveTracking = result.labels.every(l => l.tracking_number);
        if (allHaveTracking) {
          // Refresh the display
          loadShippingLabels(orderId);
          return;
        }
      }

      // Keep polling
      pollForTrackingNumber(orderId, attempts + 1);

    } catch (error) {
      console.error('Poll error:', error);
    }
  }, 3000); // Poll every 3 seconds
}

// Add CSS animation for spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// ==========================================
// SHIPPING SELECTION FUNCTIONS
// ==========================================

// Store selected shipping rate per order
let selectedShippingRates = {};

/**
 * Load shipping options for an order
 */
window.loadShippingOptions = async function(orderId) {
  const container = document.getElementById(`shipping-options-${orderId}`);

  // Show loading state
  container.innerHTML = `
    <div style="padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: center;">
      <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #667eea; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 8px; font-size: 13px; color: #6b7280;">Cargando opciones de envío...</div>
    </div>
  `;

  try {
    const apiUrl = window.location.hostname === 'localhost'
      ? `http://localhost:3000/api/shipping/orders/${orderId}/quotes`
      : `https://vt-souvenir-backend.onrender.com/api/shipping/orders/${orderId}/quotes`;

    const response = await fetch(apiUrl);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo cotizaciones');
    }

    if (!result.rates || result.rates.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px; background: #fee2e2; border-radius: 8px; text-align: center; color: #991b1b;">
          <div style="font-size: 24px; margin-bottom: 8px;">😕</div>
          <div style="font-weight: 600;">No hay opciones de envío disponibles</div>
          <div style="font-size: 12px; margin-top: 4px;">Por favor contacta a soporte</div>
        </div>
      `;
      return;
    }

    // Store quotation_id for later
    selectedShippingRates[orderId] = { quotation_id: result.quotation_id };

    // Render shipping options
    container.innerHTML = `
      <div style="background: white; border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
          <div style="font-weight: 600; font-size: 14px;">📦 Opciones de Envío a ${result.destination.city}, ${result.destination.state}</div>
          <div style="font-size: 11px; opacity: 0.9; margin-top: 2px;">CP: ${result.destination.postal}</div>
        </div>
        <div style="padding: 8px;">
          ${result.rates.map((rate, index) => `
            <label
              style="display: flex; align-items: center; padding: 12px; margin: 4px 0; border: 2px solid #e5e7eb; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
              class="shipping-option"
              onclick="selectShippingRate(${orderId}, '${rate.rate_id}', '${rate.carrier}', '${rate.service}', ${rate.price}, ${rate.days})"
              id="shipping-option-${orderId}-${index}">
              <input type="radio" name="shipping-${orderId}" style="margin-right: 12px; width: 18px; height: 18px;">
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-weight: 600; color: #111827;">${rate.carrier}</span>
                    ${rate.isCheapest ? '<span style="margin-left: 6px; font-size: 10px; padding: 2px 6px; background: #d1fae5; color: #065f46; border-radius: 4px;">💰 MÁS ECONÓMICO</span>' : ''}
                    ${rate.isFastest && !rate.isCheapest ? '<span style="margin-left: 6px; font-size: 10px; padding: 2px 6px; background: #dbeafe; color: #1e40af; border-radius: 4px;">⚡ MÁS RÁPIDO</span>' : ''}
                  </div>
                  <span style="font-weight: 700; color: #059669; font-size: 16px;">${rate.priceFormatted}</span>
                </div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                  ${rate.service} • 📅 ${rate.daysText} estimados
                </div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
      <div id="shipping-confirm-${orderId}" style="display: none; margin-top: 8px;">
        <button
          onclick="confirmShippingSelection(${orderId})"
          style="width: 100%; padding: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
          ✅ Confirmar Método de Envío
        </button>
      </div>
    `;

  } catch (error) {
    console.error('Error loading shipping options:', error);
    container.innerHTML = `
      <div style="padding: 16px; background: #fee2e2; border-radius: 8px; text-align: center; color: #991b1b;">
        <div style="font-weight: 600;">Error: ${error.message}</div>
        <button
          onclick="loadShippingOptions(${orderId})"
          style="margin-top: 8px; padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer;">
          Reintentar
        </button>
      </div>
    `;
  }
};

/**
 * Select a shipping rate (visual selection)
 */
window.selectShippingRate = function(orderId, rateId, carrier, service, price, days) {
  // Store selection
  selectedShippingRates[orderId] = {
    ...selectedShippingRates[orderId],
    rate_id: rateId,
    carrier: carrier,
    service: service,
    price: price,
    days: days
  };

  // Update visual selection
  const options = document.querySelectorAll(`label[id^="shipping-option-${orderId}-"]`);
  options.forEach(opt => {
    opt.style.borderColor = '#e5e7eb';
    opt.style.background = 'white';
  });

  // Find and highlight selected option
  const selectedOption = Array.from(options).find(opt =>
    opt.querySelector('input[type="radio"]') &&
    opt.innerHTML.includes(carrier) &&
    opt.innerHTML.includes(service)
  );
  if (selectedOption) {
    selectedOption.style.borderColor = '#10b981';
    selectedOption.style.background = '#ecfdf5';
    selectedOption.querySelector('input[type="radio"]').checked = true;
  }

  // Show confirm button
  document.getElementById(`shipping-confirm-${orderId}`).style.display = 'block';
};

/**
 * Confirm shipping selection and save to backend
 */
window.confirmShippingSelection = async function(orderId) {
  const selection = selectedShippingRates[orderId];

  if (!selection || !selection.rate_id) {
    alert('Por favor selecciona un método de envío');
    return;
  }

  const confirmBtn = document.querySelector(`#shipping-confirm-${orderId} button`);
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></span> Guardando...';

  try {
    const apiUrl = window.location.hostname === 'localhost'
      ? `http://localhost:3000/api/shipping/orders/${orderId}/select-rate`
      : `https://vt-souvenir-backend.onrender.com/api/shipping/orders/${orderId}/select-rate`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quotation_id: selection.quotation_id,
        rate_id: selection.rate_id,
        carrier: selection.carrier,
        service: selection.service,
        price: selection.price,
        days: selection.days
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error guardando selección');
    }

    // Success! Show confirmation and enable payment upload
    const shippingSection = document.getElementById(`shipping-selection-section-${orderId}`);
    shippingSection.innerHTML = `
      <div style="padding: 12px; background: #d1fae5; border: 1px solid #10b981; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">✅</span>
          <div>
            <div style="font-weight: 600; color: #065f46;">Envío seleccionado</div>
            <div style="font-size: 12px; color: #047857;">${selection.carrier} - ${selection.service}</div>
            <div style="font-size: 12px; color: #047857;">$${selection.price.toFixed(2)} MXN • ${selection.days} días</div>
          </div>
        </div>
      </div>
    `;

    // Show the payment upload section
    const paymentSection = document.getElementById(`second-payment-section-${orderId}`);
    paymentSection.style.display = 'block';
    paymentSection.style.borderTop = '1px solid #fbbf24';

  } catch (error) {
    console.error('Error confirming shipping:', error);
    alert(`Error: ${error.message}`);
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '✅ Confirmar Método de Envío';
  }
};

/**
 * Generate shipping label after second payment is uploaded
 * Called after successful second payment upload
 */
window.generateLabelAfterPayment = async function(orderId) {
  try {
    const apiUrl = window.location.hostname === 'localhost'
      ? `http://localhost:3000/api/shipping/orders/${orderId}/generate-selected`
      : `https://vt-souvenir-backend.onrender.com/api/shipping/orders/${orderId}/generate-selected`;

    console.log(`📦 Generating label for order ${orderId} after second payment...`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ Label generated:', result.label);
    } else {
      console.error('❌ Label generation failed:', result.error);
    }

    return result;

  } catch (error) {
    console.error('Error generating label:', error);
    return { success: false, error: error.message };
  }
};


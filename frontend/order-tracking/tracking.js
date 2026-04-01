(function() {
    'use strict';

    // ── Config ──────────────────────────────────────────────
    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api'
        : 'https://vt-souvenir-backend.onrender.com/api';

    const CLIENT_API = API_BASE + '/client';
    const SHIPPING_API = API_BASE + '/client/shipping';

    // ── State ───────────────────────────────────────────────
    const state = {
        activeTab: 'phone-email',
        orders: [],
        clientInfo: null,
        currentOrderId: null,
        shippingQuotationId: null,
        selectedRateId: null,
        selectedRateData: null,
        selectedAddressId: null,
        clientAddresses: [],
        uploadedFile: null,
        uploadedUrl: null
    };

    // ── DOM Refs ─────────────────────────────────────────────
    const $ = function(id) { return document.getElementById(id); };

    const screens = {
        lookup: $('screen-lookup'),
        results: $('screen-results'),
        shipping: $('screen-shipping')
    };

    // ── Safe HTML helper ─────────────────────────────────────
    // All user-provided strings pass through escapeHtml before
    // being placed in markup. Structural HTML is hardcoded.
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Init ─────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        // Tab switching
        document.querySelectorAll('.lookup-tab').forEach(function(tab) {
            tab.addEventListener('click', function() { switchTab(tab.dataset.tab); });
        });

        // Lookup button
        $('btn-lookup').addEventListener('click', handleLookup);

        // Back buttons
        $('btn-back-results').addEventListener('click', function() { navigateTo('lookup'); });
        $('btn-back-shipping').addEventListener('click', function() { navigateTo('results'); });

        // Confirm shipping
        $('btn-confirm-shipping').addEventListener('click', handleConfirmShipping);

        // Continue to rates (after address selection)
        $('btn-continue-to-rates').addEventListener('click', handleContinueToRates);

        // Enter key to submit
        document.querySelectorAll('.field-input').forEach(function(input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') handleLookup();
            });
        });

        // Phone input formatting (digits only)
        var phoneEl = $('lookup-phone');
        if (phoneEl) phoneEl.addEventListener('input', function() {
            phoneEl.value = phoneEl.value.replace(/\D/g, '').slice(0, 10);
        });
    }

    // ── Tab Switching ────────────────────────────────────────
    function switchTab(tabId) {
        state.activeTab = tabId;
        document.querySelectorAll('.lookup-tab').forEach(function(t) {
            t.classList.toggle('active', t.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(function(c) {
            c.classList.remove('active');
        });
        $('content-' + tabId).classList.add('active');
        hideError();
    }

    // ── Screen Navigation ────────────────────────────────────
    function navigateTo(screenName) {
        var current = document.querySelector('.screen.active');
        if (current) {
            current.classList.add('exiting');
            current.classList.remove('active');
        }

        setTimeout(function() {
            if (current) current.classList.remove('exiting');
            var next = screens[screenName];
            next.classList.add('entering');

            requestAnimationFrame(function() {
                next.classList.add('active');
                next.classList.remove('entering');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }, 350);
    }

    // ── Error Display ────────────────────────────────────────
    function showError(msg) {
        var el = $('lookup-error');
        el.textContent = msg;
        el.classList.add('visible');
    }

    function hideError() {
        var el = $('lookup-error');
        el.textContent = '';
        el.classList.remove('visible');
    }

    // ── Toast Notifications ──────────────────────────────────
    function showToast(message, type) {
        var toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.className = 'toast toast--' + type;
        toast.textContent = message;

        requestAnimationFrame(function() {
            toast.classList.add('visible');
        });

        setTimeout(function() {
            toast.classList.remove('visible');
        }, 3000);
    }

    // ── Lookup Handler ───────────────────────────────────────
    async function handleLookup() {
        hideError();

        var phone, email, orderNumber;

        if (state.activeTab === 'phone-email') {
            phone = $('lookup-phone').value.trim();
            email = $('lookup-email').value.trim();

            if (!phone || phone.length !== 10) {
                showError('Ingresa un telefono valido de 10 digitos');
                return;
            }
            if (!email || !email.includes('@')) {
                showError('Ingresa un correo electronico valido');
                return;
            }
        } else {
            orderNumber = $('lookup-order-number').value.trim().toUpperCase();

            if (!orderNumber) {
                showError('Ingresa tu numero de pedido');
                return;
            }
        }

        // Show loading
        $('btn-lookup').style.display = 'none';
        $('lookup-loading').style.display = 'block';

        try {
            var body = orderNumber
                ? { orderNumber: orderNumber }
                : { phone: phone, email: email };

            var res = await fetch(CLIENT_API + '/orders/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            var data = await res.json();

            if (!data.success || !data.orders || data.orders.length === 0) {
                showError(orderNumber
                    ? 'No se encontro el pedido ' + orderNumber
                    : 'No se encontraron pedidos con esos datos');
                $('btn-lookup').style.display = 'flex';
                $('lookup-loading').style.display = 'none';
                return;
            }

            var orders = data.orders;
            state.orders = orders;
            state.clientInfo = data.clientInfo;

            renderResults();
            navigateTo('results');

        } catch (err) {
            showError('Error de conexion. Intenta de nuevo.');
            console.error('Lookup error:', err);
        }

        $('btn-lookup').style.display = 'flex';
        $('lookup-loading').style.display = 'none';
    }

    // ── Render Results ───────────────────────────────────────
    function renderResults() {
        // Welcome message
        var welcome = $('results-welcome');
        var name = state.clientInfo ? state.clientInfo.name : '';
        var firstName = name ? name.split(' ')[0] : '';
        var count = state.orders.length;

        // Build welcome safely using DOM
        welcome.textContent = '';
        var h2 = document.createElement('h2');
        h2.textContent = firstName ? ('Hola, ' + firstName) : 'Pedidos Encontrados';
        welcome.appendChild(h2);

        if (firstName) {
            var p = document.createElement('p');
            p.textContent = count + ' pedido' + (count > 1 ? 's' : '') + ' encontrado' + (count > 1 ? 's' : '');
            welcome.appendChild(p);
        }

        // Render order cards
        var container = $('orders-container');
        container.textContent = '';

        if (state.orders.length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            var icon = document.createElement('div');
            icon.className = 'empty-state-icon';
            icon.textContent = '📦';
            var title = document.createElement('h3');
            title.textContent = 'No hay pedidos activos';
            var desc = document.createElement('p');
            desc.textContent = 'No encontramos pedidos con esos datos';
            var link = document.createElement('a');
            link.href = 'https://axkan.art/pedidos';
            link.className = 'btn-new-order';
            link.textContent = 'Hacer un Pedido';
            emptyDiv.appendChild(icon);
            emptyDiv.appendChild(title);
            emptyDiv.appendChild(desc);
            emptyDiv.appendChild(link);
            container.appendChild(emptyDiv);
            return;
        }

        state.orders.forEach(function(order, i) {
            var card = buildOrderCardDOM(order);
            card.style.setProperty('--delay', (i * 0.1) + 's');
            container.appendChild(card);
        });
    }

    // ── Build Order Card using DOM methods ────────────────────
    function buildOrderCardDOM(order) {
        var card = document.createElement('div');
        card.className = 'order-card';

        // Header row
        var header = document.createElement('div');
        header.className = 'order-card-header';

        var headerLeft = document.createElement('div');
        var orderNum = document.createElement('div');
        orderNum.className = 'order-number';
        orderNum.textContent = order.orderNumber || ('#' + order.orderId);
        var orderDate = document.createElement('div');
        orderDate.className = 'order-date';
        orderDate.textContent = formatDate(order.orderDate);
        headerLeft.appendChild(orderNum);
        headerLeft.appendChild(orderDate);

        var badge = createStatusBadge(order);

        header.appendChild(headerLeft);
        header.appendChild(badge);
        card.appendChild(header);

        // Items list
        if (order.items && order.items.length > 0) {
            var ul = document.createElement('ul');
            ul.className = 'order-items';
            order.items.forEach(function(item) {
                var li = document.createElement('li');
                li.className = 'order-item';
                var nameSpan = document.createElement('span');
                nameSpan.className = 'order-item-name';
                nameSpan.textContent = item.productName;
                var qtySpan = document.createElement('span');
                qtySpan.className = 'order-item-qty';
                qtySpan.textContent = 'x' + item.quantity;
                li.appendChild(nameSpan);
                li.appendChild(qtySpan);
                ul.appendChild(li);
            });
            card.appendChild(ul);
        }

        // Totals
        var totals = document.createElement('div');
        totals.className = 'order-totals';

        appendTotalRow(totals, 'Total:', order.totalPriceFormatted || formatCurrency(order.totalPrice));
        appendTotalRow(totals, 'Anticipo (50%):', order.depositAmountFormatted || formatCurrency(order.depositAmount));

        if (order.depositPaid) {
            appendTotalRow(totals, 'Anticipo:', 'Pagado', 'paid');
        }
        card.appendChild(totals);

        // Payment + Upload flow when there's remaining balance
        if (order.remainingBalance > 0 && !order.secondPaymentReceived) {
            // Prominent balance banner
            var balanceBanner = document.createElement('div');
            balanceBanner.className = 'balance-banner';
            var bannerLabel = document.createElement('span');
            bannerLabel.className = 'balance-banner-label';
            bannerLabel.textContent = 'Saldo pendiente';
            var bannerAmount = document.createElement('span');
            bannerAmount.className = 'balance-banner-amount';
            bannerAmount.textContent = order.remainingBalanceFormatted || formatCurrency(order.remainingBalance);
            balanceBanner.appendChild(bannerLabel);
            balanceBanner.appendChild(bannerAmount);
            card.appendChild(balanceBanner);

            // Step 1: Payment methods
            var paymentSection = createPaymentInfoSection(order);
            card.appendChild(paymentSection);

            // Step 2: Upload receipt (always show when there's balance)
            var uploadSection = createUploadSection(order.orderId);
            card.appendChild(uploadSection);

            // Step 3: Choose carrier (hidden until receipt uploaded, only for non-pickup)
            if (!order.isStorePickup && !order.allLabelsGenerated) {
                var shippingStep = document.createElement('div');
                shippingStep.className = 'order-action';
                shippingStep.id = 'shipping-step-' + order.orderId;
                shippingStep.style.display = 'none';

                var shipStepHeader = document.createElement('div');
                shipStepHeader.className = 'step-header';
                var shipStepNum = document.createElement('span');
                shipStepNum.className = 'step-number';
                shipStepNum.textContent = '3';
                var shipStepTitle = document.createElement('span');
                shipStepTitle.className = 'step-title';
                shipStepTitle.textContent = 'Elige tu paqueteria';
                shipStepHeader.appendChild(shipStepNum);
                shipStepHeader.appendChild(shipStepTitle);
                shippingStep.appendChild(shipStepHeader);

                var shippingBtn = document.createElement('button');
                shippingBtn.className = 'btn-shipping';
                shippingBtn.style.marginTop = '12px';
                shippingBtn.textContent = '🚚 Ver Opciones de Envio';
                shippingBtn.addEventListener('click', function() {
                    state.currentOrderId = order.orderId;
                    loadShippingQuotes(order.orderId);
                });
                shippingStep.appendChild(shippingBtn);
                card.appendChild(shippingStep);
            }
        }

        // Show if second payment already received
        if (order.secondPaymentReceived) {
            var successDiv = document.createElement('div');
            successDiv.className = 'payment-complete-banner';
            successDiv.textContent = '✅ Pago completo — Comprobante recibido';
            card.appendChild(successDiv);

            // Show Step 3 shipping if payment done but no label yet
            if (!order.isStorePickup && !order.allLabelsGenerated) {
                var shippingStep = document.createElement('div');
                shippingStep.className = 'order-action';

                var shipStepHeader = document.createElement('div');
                shipStepHeader.className = 'step-header';
                var shipStepNum = document.createElement('span');
                shipStepNum.className = 'step-number';
                shipStepNum.textContent = '3';
                var shipStepTitle = document.createElement('span');
                shipStepTitle.className = 'step-title';
                shipStepTitle.textContent = 'Elige tu paqueteria';
                shipStepHeader.appendChild(shipStepNum);
                shipStepHeader.appendChild(shipStepTitle);
                shippingStep.appendChild(shipStepHeader);

                var shippingBtn = document.createElement('button');
                shippingBtn.className = 'btn-shipping';
                shippingBtn.style.marginTop = '12px';
                shippingBtn.textContent = '🚚 Ver Opciones de Envio';
                shippingBtn.addEventListener('click', function() {
                    state.currentOrderId = order.orderId;
                    loadShippingQuotes(order.orderId);
                });
                shippingStep.appendChild(shippingBtn);
                card.appendChild(shippingStep);
            }
        }

        // Store pickup badge
        if (order.isStorePickup) {
            var pickupDiv = document.createElement('div');
            pickupDiv.className = 'pickup-badge';
            pickupDiv.textContent = '🏪 Recoger en tienda';
            card.appendChild(pickupDiv);
        }

        // Show tracking info if shipped
        if (order.labelsWithTracking > 0) {
            var trackDiv = document.createElement('div');
            trackDiv.className = 'tracking-info';
            var trackIcon = document.createElement('span');
            trackIcon.textContent = '🚚';
            var trackText = document.createElement('div');
            trackText.className = 'tracking-info-text';
            var trackLabel = document.createElement('div');
            trackLabel.className = 'tracking-info-label';
            trackLabel.textContent = 'Tu pedido esta en camino';
            var trackNumber = document.createElement('div');
            trackNumber.className = 'tracking-info-number';
            trackNumber.textContent = order.labelsWithTracking + ' guia' + (order.labelsWithTracking > 1 ? 's' : '') + ' generada' + (order.labelsWithTracking > 1 ? 's' : '');
            trackText.appendChild(trackLabel);
            trackText.appendChild(trackNumber);
            trackDiv.appendChild(trackIcon);
            trackDiv.appendChild(trackText);
            card.appendChild(trackDiv);
        }

        return card;
    }

    function appendTotalRow(parent, label, value, extraClass) {
        var row = document.createElement('div');
        row.className = 'order-total-row' + (extraClass ? ' ' + extraClass : '');
        var labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        var valueSpan = document.createElement('span');
        valueSpan.textContent = value;
        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        parent.appendChild(row);
    }

    function createStatusBadge(order) {
        var statusMap = {
            'new': { cssClass: 'new', text: 'Nuevo', icon: '🔵' },
            'pending': { cssClass: 'pending', text: 'Pendiente', icon: '⏳' },
            'design': { cssClass: 'design', text: 'En Diseno', icon: '🎨' },
            'in_production': { cssClass: 'production', text: 'En Produccion', icon: '⚙️' },
            'printing': { cssClass: 'production', text: 'Imprimiendo', icon: '🖨' },
            'cutting': { cssClass: 'production', text: 'Cortando', icon: '✂️' },
            'counting': { cssClass: 'production', text: 'Contando', icon: '📊' },
            'ready': { cssClass: 'approved', text: 'Listo', icon: '✅' },
            'shipping': { cssClass: 'shipping', text: 'En Envio', icon: '🚚' },
            'delivered': { cssClass: 'delivered', text: 'Entregado', icon: '✅' },
            'cancelled': { cssClass: 'cancelled', text: 'Cancelado', icon: '❌' }
        };

        var approvalMap = {
            'pending_review': { cssClass: 'pending', text: 'En Revision', icon: '🔍' },
            'approved': { cssClass: 'approved', text: 'Aprobado', icon: '✅' },
            'needs_changes': { cssClass: 'production', text: 'Requiere Cambios', icon: '⚠️' },
            'rejected': { cssClass: 'cancelled', text: 'Rechazado', icon: '❌' }
        };

        var info;
        if (order.approvalStatus && order.approvalStatus !== 'approved') {
            info = approvalMap[order.approvalStatus] || { cssClass: 'pending', text: order.approvalStatus, icon: '⏳' };
        } else {
            info = statusMap[order.status] || { cssClass: 'pending', text: order.status || 'Pendiente', icon: '⏳' };
        }

        var span = document.createElement('span');
        span.className = 'status-badge status-badge--' + info.cssClass;
        span.textContent = info.icon + ' ' + info.text;
        return span;
    }

    function createUploadSection(orderId) {
        var section = document.createElement('div');
        section.className = 'order-action';

        // Step header
        var stepHeader = document.createElement('div');
        stepHeader.className = 'step-header';
        var stepNum = document.createElement('span');
        stepNum.className = 'step-number';
        stepNum.textContent = '2';
        var stepTitle = document.createElement('span');
        stepTitle.className = 'step-title';
        stepTitle.textContent = 'Sube tu comprobante';
        stepHeader.appendChild(stepNum);
        stepHeader.appendChild(stepTitle);
        section.appendChild(stepHeader);

        var uploadArea = document.createElement('div');
        uploadArea.className = 'upload-area';

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*,application/pdf';
        fileInput.style.display = 'none';

        var areaIcon = document.createElement('div');
        areaIcon.className = 'upload-area-icon';
        areaIcon.textContent = '📄';

        var areaText = document.createElement('div');
        areaText.className = 'upload-area-text';
        areaText.textContent = 'Toca para subir comprobante';

        var areaHint = document.createElement('div');
        areaHint.className = 'upload-area-hint';
        areaHint.textContent = 'Imagen o PDF, max 10MB';

        uploadArea.appendChild(fileInput);
        uploadArea.appendChild(areaIcon);
        uploadArea.appendChild(areaText);
        uploadArea.appendChild(areaHint);

        uploadArea.addEventListener('click', function() { fileInput.click(); });

        var resultDiv = document.createElement('div');
        resultDiv.className = 'upload-result';

        fileInput.addEventListener('change', function(e) {
            handleFileSelect(e, orderId, resultDiv, uploadArea);
        });

        section.appendChild(uploadArea);
        section.appendChild(resultDiv);

        return section;
    }

    // ── File Upload ──────────────────────────────────────────
    function handleFileSelect(e, orderId, resultDiv, uploadArea) {
        var file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            showToast('El archivo es muy grande (max 10MB)', 'error');
            return;
        }

        // Clear previous result
        resultDiv.textContent = '';

        // Show preview
        var preview = document.createElement('div');
        preview.className = 'upload-preview';

        if (file.type.startsWith('image/')) {
            var img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.alt = 'Preview';
            preview.appendChild(img);
        } else {
            var pdfIcon = document.createElement('div');
            pdfIcon.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:24px;background:var(--bg-subtle);border-radius:8px';
            pdfIcon.textContent = '📄';
            preview.appendChild(pdfIcon);
        }

        var info = document.createElement('div');
        info.className = 'upload-preview-info';
        var nameEl = document.createElement('div');
        nameEl.className = 'upload-preview-name';
        nameEl.textContent = file.name;
        var sizeEl = document.createElement('div');
        sizeEl.className = 'upload-preview-size';
        sizeEl.textContent = formatFileSize(file.size);
        info.appendChild(nameEl);
        info.appendChild(sizeEl);
        preview.appendChild(info);

        resultDiv.appendChild(preview);

        var submitBtn = document.createElement('button');
        submitBtn.className = 'btn-upload-submit';
        submitBtn.textContent = 'Subir Comprobante';
        submitBtn.addEventListener('click', function() {
            uploadReceipt(orderId, file, submitBtn, resultDiv, uploadArea);
        });
        resultDiv.appendChild(submitBtn);
    }

    async function uploadReceipt(orderId, file, btn, resultDiv, uploadArea) {
        btn.disabled = true;
        btn.textContent = 'Subiendo...';

        try {
            // Step 1: Upload file to Cloudinary via backend
            var formData = new FormData();
            formData.append('receipt', file);
            formData.append('phone', (state.clientInfo && state.clientInfo.phone) || '0000000000');

            var uploadRes = await fetch(CLIENT_API + '/upload/payment-receipt', {
                method: 'POST',
                body: formData
            });

            var uploadData = await uploadRes.json();

            if (!uploadData.success) {
                throw new Error(uploadData.error || 'Error al subir archivo');
            }

            // Step 2: Link receipt to order (uses public client route)
            var linkUrl = CLIENT_API + '/orders/' + orderId + '/second-payment';

            var linkRes = await fetch(linkUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiptUrl: uploadData.url,
                    publicId: uploadData.publicId
                })
            });

            var linkData = await linkRes.json();

            if (!linkData.success) {
                throw new Error(linkData.error || 'Error al registrar pago');
            }

            // Success
            resultDiv.textContent = '';
            var successMsg = document.createElement('div');
            successMsg.className = 'upload-success';
            successMsg.textContent = '✅ Comprobante subido exitosamente';
            resultDiv.appendChild(successMsg);

            // Hide upload area
            if (uploadArea) uploadArea.style.display = 'none';

            // Reveal Step 3: Shipping selection
            var shippingStep = document.getElementById('shipping-step-' + orderId);
            if (shippingStep) {
                shippingStep.style.display = '';
                shippingStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            showToast('Comprobante enviado correctamente', 'success');

        } catch (err) {
            console.error('Upload error:', err);
            showToast(err.message || 'Error al subir comprobante', 'error');
            btn.disabled = false;
            btn.textContent = 'Subir Comprobante';
        }
    }

    // ── Shipping Quotes ──────────────────────────────────────
    async function loadShippingQuotes(orderId, attempt) {
        attempt = attempt || 1;
        var MAX_ATTEMPTS = 3;

        navigateTo('shipping');

        // Reset address selection state
        state.selectedAddressId = null;
        state.selectedRateId = null;
        state.selectedRateData = null;

        // Show default destination from client info
        if (state.clientInfo) {
            var ci = state.clientInfo;
            $('shipping-destination').textContent = 'Envio a ' + [ci.city, ci.state].filter(Boolean).join(', ');
        }

        // Hide everything initially
        $('shipping-loading').style.display = 'none';
        $('shipping-rates-container').textContent = '';
        $('btn-confirm-shipping').style.display = 'none';
        $('address-selection-container').style.display = 'none';
        $('btn-continue-to-rates').style.display = 'none';
        $('btn-continue-to-rates').disabled = true;

        // Step 1: Try to fetch client addresses
        try {
            var addressRes = await fetch(API_BASE + '/client/addresses?phone=' + encodeURIComponent(state.clientInfo.phone) + '&email=' + encodeURIComponent(state.clientInfo.email));
            var addressData = await addressRes.json();

            if (addressData.addresses && addressData.addresses.length > 0) {
                state.clientAddresses = addressData.addresses;

                // Show address selection step
                $('address-selection-container').style.display = 'block';

                var addressContainer = $('address-cards-shipping');
                var defaultAddr = addressData.addresses.find(function(a) { return a.is_default; });
                var defaultId = defaultAddr ? defaultAddr.id : null;

                renderAddressCardsShipping(addressContainer, addressData.addresses, defaultId, orderId);

                // If there's a default, pre-select it
                if (defaultAddr) {
                    state.selectedAddressId = defaultAddr.id;
                    $('shipping-destination').textContent = 'Envio a ' + [defaultAddr.city, defaultAddr.state].filter(Boolean).join(', ');
                    $('btn-continue-to-rates').style.display = 'block';
                    $('btn-continue-to-rates').disabled = false;
                }

                return; // Wait for user to click "Continue"
            }
        } catch (err) {
            console.error('Address fetch error (non-blocking):', err);
        }

        // No saved addresses — skip address selection, use client's profile address
        // Go straight to shipping quotes
        state.clientAddresses = [];
        $('address-selection-container').style.display = 'none';
        fetchShippingQuotes(orderId, 1);
    }

    function findAddressById(id) {
        for (var i = 0; i < state.clientAddresses.length; i++) {
            if (String(state.clientAddresses[i].id) === String(id)) return state.clientAddresses[i];
        }
        return null;
    }

    function buildAddressCallbacks(orderId) {
        return {
            onSelect: function(addrId) {
                state.selectedAddressId = addrId;
                var addr = findAddressById(addrId);
                if (addr) {
                    $('shipping-destination').textContent = 'Envio a ' + [addr.city, addr.state].filter(Boolean).join(', ');
                }
                $('btn-continue-to-rates').style.display = 'block';
                $('btn-continue-to-rates').disabled = false;
                // Re-render cards to update visual selection
                var addressContainer = $('address-cards-shipping');
                renderAddressCardsShipping(addressContainer, state.clientAddresses, addrId, orderId);
            },
            onAdd: function() {
                var addressContainer = $('address-cards-shipping');
                showAddressForm(addressContainer, null, async function(formData) {
                    // Map form field names to API field names
                    var payload = {
                        phone: state.clientInfo.phone,
                        email: state.clientInfo.email,
                        street: formData.street,
                        streetNumber: formData.street_number,
                        colonia: formData.colonia,
                        city: formData.city,
                        state: formData.state,
                        postal: formData.postal_code,
                        referenceNotes: formData.references
                    };
                    var res = await fetch(API_BASE + '/client/addresses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    var result = await res.json();
                    if (result.success) {
                        await refreshAddressCards(orderId);
                    }
                }, function() {
                    // onCancel — re-render cards
                    refreshAddressCards(orderId);
                });
            },
            onEdit: function(addr) {
                var addressContainer = $('address-cards-shipping');
                showAddressForm(addressContainer, addr, async function(formData) {
                    var payload = {
                        street: formData.street,
                        streetNumber: formData.street_number,
                        colonia: formData.colonia,
                        city: formData.city,
                        state: formData.state,
                        postal: formData.postal_code,
                        referenceNotes: formData.references
                    };
                    var res = await fetch(API_BASE + '/client/addresses/' + (formData.id || addr.id), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    var result = await res.json();
                    if (result.success) {
                        await refreshAddressCards(orderId);
                    }
                }, function() {
                    refreshAddressCards(orderId);
                });
            },
            onDelete: async function(addrId) {
                if (!confirm('¿Eliminar esta dirección?')) return;
                var res = await fetch(API_BASE + '/client/addresses/' + addrId, { method: 'DELETE' });
                var result = await res.json();
                if (result.success) {
                    if (String(state.selectedAddressId) === String(addrId)) {
                        state.selectedAddressId = null;
                        $('btn-continue-to-rates').disabled = true;
                    }
                    await refreshAddressCards(orderId);
                }
            }
        };
    }

    function renderAddressCardsShipping(container, addresses, selectedId, orderId) {
        if (typeof window.AddressCards !== 'undefined') {
            window.AddressCards.render(container, addresses, selectedId, buildAddressCallbacks(orderId));
        } else if (typeof window.renderAddressCards === 'function') {
            window.renderAddressCards(container, addresses, selectedId, buildAddressCallbacks(orderId));
        }
    }

    async function refreshAddressCards(orderId) {
        try {
            var addressRes = await fetch(API_BASE + '/client/addresses?phone=' + encodeURIComponent(state.clientInfo.phone) + '&email=' + encodeURIComponent(state.clientInfo.email));
            var addressData = await addressRes.json();
            state.clientAddresses = addressData.addresses || [];

            var addressContainer = $('address-cards-shipping');
            renderAddressCardsShipping(addressContainer, state.clientAddresses, state.selectedAddressId, orderId);
        } catch (err) {
            console.error('Refresh addresses error:', err);
        }
    }

    function handleContinueToRates() {
        if (!state.selectedAddressId) return;

        // Hide address selection, show loading
        $('address-selection-container').style.display = 'none';

        // Fetch quotes with selected address
        fetchShippingQuotes(state.currentOrderId, 1);
    }

    async function fetchShippingQuotes(orderId, attempt) {
        attempt = attempt || 1;
        var MAX_ATTEMPTS = 3;

        $('shipping-loading').style.display = 'block';
        $('shipping-rates-container').textContent = '';
        $('btn-confirm-shipping').style.display = 'none';

        if (attempt > 1) {
            var retryMsg = document.createElement('p');
            retryMsg.style.cssText = 'text-align:center;color:var(--text-muted);font-size:0.85rem;margin-top:8px;';
            retryMsg.textContent = 'Cargando mas opciones... (intento ' + attempt + '/' + MAX_ATTEMPTS + ')';
            $('shipping-rates-container').appendChild(retryMsg);
        }

        try {
            var quotesUrl = SHIPPING_API + '/orders/' + orderId + '/quotes';
            if (state.selectedAddressId) {
                quotesUrl += '?addressId=' + state.selectedAddressId;
            }

            var res = await fetch(quotesUrl);
            var data = await res.json();

            if (!data.success || !data.rates || data.rates.length === 0) {
                // Auto-retry if no rates and we have attempts left
                if (attempt < MAX_ATTEMPTS) {
                    await new Promise(function(r) { setTimeout(r, 2000); });
                    return fetchShippingQuotes(orderId, attempt + 1);
                }

                var emptyDiv = document.createElement('div');
                emptyDiv.className = 'empty-state';
                var eIcon = document.createElement('div');
                eIcon.className = 'empty-state-icon';
                eIcon.textContent = '🚚';
                var eTitle = document.createElement('h3');
                eTitle.textContent = 'Sin opciones disponibles';
                var eDesc = document.createElement('p');
                eDesc.textContent = data.error || 'No hay opciones de envio disponibles en este momento';
                emptyDiv.appendChild(eIcon);
                emptyDiv.appendChild(eTitle);
                emptyDiv.appendChild(eDesc);

                var retryBtn = document.createElement('button');
                retryBtn.className = 'btn-shipping';
                retryBtn.style.marginTop = '16px';
                retryBtn.textContent = '🔄 Intentar de nuevo';
                retryBtn.addEventListener('click', function() {
                    fetchShippingQuotes(orderId, 1);
                });
                emptyDiv.appendChild(retryBtn);

                $('shipping-rates-container').textContent = '';
                $('shipping-rates-container').appendChild(emptyDiv);
                $('shipping-loading').style.display = 'none';
                return;
            }

            // If we got few rates, auto-retry for more (Skydropx sometimes returns partial)
            if (data.rates.length < 3 && attempt < MAX_ATTEMPTS) {
                await new Promise(function(r) { setTimeout(r, 2000); });
                return fetchShippingQuotes(orderId, attempt + 1);
            }

            state.shippingQuotationId = data.quotation_id;

            $('shipping-rates-container').textContent = '';
            renderShippingRates(data.rates, data.previousSelection);

        } catch (err) {
            console.error('Shipping quotes error:', err);

            // Auto-retry on network error
            if (attempt < MAX_ATTEMPTS) {
                await new Promise(function(r) { setTimeout(r, 2000); });
                return fetchShippingQuotes(orderId, attempt + 1);
            }

            var errDiv = document.createElement('div');
            errDiv.className = 'empty-state';
            var errIcon = document.createElement('div');
            errIcon.className = 'empty-state-icon';
            errIcon.textContent = '⚠️';
            var errTitle = document.createElement('h3');
            errTitle.textContent = 'Error de conexion';
            var errDesc = document.createElement('p');
            errDesc.textContent = 'No pudimos cargar las opciones de envio.';
            errDiv.appendChild(errIcon);
            errDiv.appendChild(errTitle);
            errDiv.appendChild(errDesc);

            var retryBtn = document.createElement('button');
            retryBtn.className = 'btn-shipping';
            retryBtn.style.marginTop = '16px';
            retryBtn.textContent = '🔄 Intentar de nuevo';
            retryBtn.addEventListener('click', function() {
                fetchShippingQuotes(orderId, 1);
            });
            errDiv.appendChild(retryBtn);

            $('shipping-rates-container').textContent = '';
            $('shipping-rates-container').appendChild(errDiv);
        }

        $('shipping-loading').style.display = 'none';
    }

    function renderShippingRates(rates, previousSelection) {
        var container = $('shipping-rates-container');
        container.textContent = '';

        rates.forEach(function(rate, i) {
            var card = document.createElement('div');
            card.className = 'shipping-rate-card';
            card.dataset.rateId = rate.rate_id;
            card.style.animationDelay = (i * 0.08) + 's';

            // Check if previously selected
            var isPrevious = previousSelection && previousSelection.rate_id === rate.rate_id;
            if (isPrevious) {
                card.classList.add('selected');
                state.selectedRateId = rate.rate_id;
                state.selectedRateData = rate;
            }

            var radio = document.createElement('div');
            radio.className = 'shipping-rate-radio';

            var info = document.createElement('div');
            info.className = 'shipping-rate-info';
            var carrier = document.createElement('div');
            carrier.className = 'shipping-rate-carrier';
            carrier.textContent = rate.carrier;
            var service = document.createElement('div');
            service.className = 'shipping-rate-service';
            service.textContent = rate.service || '';
            info.appendChild(carrier);
            info.appendChild(service);

            var meta = document.createElement('div');
            meta.className = 'shipping-rate-meta';
            var days = document.createElement('div');
            days.className = 'shipping-rate-days';
            days.textContent = rate.daysText || (rate.days + ' dias');
            meta.appendChild(days);

            if (rate.isCheapest) {
                var cheapBadge = document.createElement('div');
                cheapBadge.className = 'shipping-rate-badge cheapest';
                cheapBadge.textContent = 'Mas economico';
                meta.appendChild(cheapBadge);
            }
            if (rate.isFastest) {
                var fastBadge = document.createElement('div');
                fastBadge.className = 'shipping-rate-badge fastest';
                fastBadge.textContent = 'Mas rapido';
                meta.appendChild(fastBadge);
            }

            card.appendChild(radio);
            card.appendChild(info);
            card.appendChild(meta);

            card.addEventListener('click', function() { selectShippingRate(rate); });
            container.appendChild(card);
        });

        // Show confirm button
        $('btn-confirm-shipping').style.display = 'block';
        $('btn-confirm-shipping').disabled = !state.selectedRateId;
    }

    function selectShippingRate(rate) {
        state.selectedRateId = rate.rate_id;
        state.selectedRateData = rate;

        document.querySelectorAll('.shipping-rate-card').forEach(function(c) {
            c.classList.toggle('selected', c.dataset.rateId === rate.rate_id);
        });

        $('btn-confirm-shipping').disabled = false;
    }

    async function handleConfirmShipping() {
        if (!state.selectedRateId || !state.selectedRateData) return;

        var btn = $('btn-confirm-shipping');
        btn.style.display = 'none';
        $('shipping-confirm-loading').style.display = 'block';

        try {
            var res = await fetch(SHIPPING_API + '/orders/' + state.currentOrderId + '/select-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quotation_id: state.shippingQuotationId,
                    rate_id: state.selectedRateData.rate_id,
                    carrier: state.selectedRateData.carrier,
                    service: state.selectedRateData.service,
                    price: state.selectedRateData.price,
                    days: state.selectedRateData.days,
                    addressId: state.selectedAddressId || undefined
                })
            });

            var data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Error al confirmar envio');
            }

            // Show completion screen with label info
            $('shipping-confirm-loading').style.display = 'none';
            $('shipping-rates-container').textContent = '';
            $('btn-confirm-shipping').style.display = 'none';
            $('shipping-loading').style.display = 'none';

            var completion = document.createElement('div');
            completion.style.cssText = 'text-align:center;padding:24px 0;';

            var checkIcon = document.createElement('div');
            checkIcon.style.cssText = 'font-size:48px;margin-bottom:12px;';
            checkIcon.textContent = '✅';
            completion.appendChild(checkIcon);

            var title = document.createElement('h2');
            title.style.cssText = 'font-size:1.3rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;';
            title.textContent = '¡Envio Confirmado!';
            completion.appendChild(title);

            var subtitle = document.createElement('p');
            subtitle.style.cssText = 'color:var(--text-muted);font-size:0.9rem;margin-bottom:20px;';
            subtitle.textContent = data.labelsCount > 1
                ? data.labelsCount + ' guias generadas (' + data.labelsCount + ' paquetes)'
                : 'Tu guia ha sido generada exitosamente';
            completion.appendChild(subtitle);

            if (data.label) {
                var card = document.createElement('div');
                card.style.cssText = 'background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-md);padding:20px;text-align:left;margin-bottom:16px;';

                var carrierLine = document.createElement('div');
                carrierLine.style.cssText = 'font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:4px;';
                carrierLine.textContent = (data.label.carrier || '') + ' — ' + (data.label.service || '');
                card.appendChild(carrierLine);

                if (data.label.delivery_days) {
                    var daysLine = document.createElement('div');
                    daysLine.style.cssText = 'font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;';
                    daysLine.textContent = 'Entrega estimada: ' + data.label.delivery_days + ' dia' + (data.label.delivery_days > 1 ? 's' : '');
                    card.appendChild(daysLine);
                }

                if (data.label.tracking_number) {
                    var trackRow = document.createElement('div');
                    trackRow.style.cssText = 'background:var(--bg-subtle);border-radius:8px;padding:12px;margin-bottom:8px;';

                    var trackLabel = document.createElement('div');
                    trackLabel.style.cssText = 'font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;';
                    trackLabel.textContent = 'Numero de guia';
                    trackRow.appendChild(trackLabel);

                    var trackNumRow = document.createElement('div');
                    trackNumRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

                    var trackNum = document.createElement('div');
                    trackNum.style.cssText = 'font-size:1.1rem;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums;letter-spacing:0.03em;flex:1;';
                    trackNum.textContent = data.label.tracking_number;
                    trackNumRow.appendChild(trackNum);

                    var copyBtn = document.createElement('button');
                    copyBtn.type = 'button';
                    copyBtn.style.cssText = 'padding:6px 12px;background:var(--bg-muted);border:1px solid var(--border-medium);border-radius:6px;font-size:0.78rem;font-weight:600;color:var(--text-muted);cursor:pointer;';
                    copyBtn.textContent = 'Copiar';
                    copyBtn.addEventListener('click', function() {
                        navigator.clipboard.writeText(data.label.tracking_number).then(function() {
                            copyBtn.textContent = '✓ Copiado';
                            setTimeout(function() { copyBtn.textContent = 'Copiar'; }, 1500);
                        });
                    });
                    trackNumRow.appendChild(copyBtn);

                    trackRow.appendChild(trackNumRow);
                    card.appendChild(trackRow);
                } else {
                    // Tracking not ready yet
                    var pendingRow = document.createElement('div');
                    pendingRow.style.cssText = 'background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;margin-bottom:8px;';

                    var pendingIcon = document.createElement('div');
                    pendingIcon.style.cssText = 'font-size:0.85rem;color:#b45309;font-weight:500;';
                    pendingIcon.textContent = '⏳ Tu numero de guia esta siendo generado. Regresa en unos minutos para ver tu numero de rastreo.';
                    pendingRow.appendChild(pendingIcon);
                    card.appendChild(pendingRow);
                }

                if (data.label.tracking_url) {
                    var trackBtn = document.createElement('a');
                    trackBtn.href = data.label.tracking_url;
                    trackBtn.target = '_blank';
                    trackBtn.rel = 'noopener noreferrer';
                    trackBtn.style.cssText = 'display:block;text-align:center;padding:12px;background:var(--turquesa);color:white;border-radius:var(--radius-sm);font-weight:600;font-size:0.9rem;text-decoration:none;margin-top:12px;';
                    trackBtn.textContent = '📦 Rastrear mi Paquete';
                    card.appendChild(trackBtn);
                }

                completion.appendChild(card);
            }

            var backBtn = document.createElement('button');
            backBtn.style.cssText = 'padding:12px 24px;background:transparent;border:1.5px solid var(--border-medium);border-radius:var(--radius-full);color:var(--text-secondary);font-weight:600;font-size:0.9rem;cursor:pointer;';
            backBtn.textContent = '← Volver a mis pedidos';
            backBtn.addEventListener('click', function() {
                navigateTo('results');
                refreshOrders();
            });
            completion.appendChild(backBtn);

            $('shipping-rates-container').appendChild(completion);
            return;

        } catch (err) {
            console.error('Confirm shipping error:', err);
            showToast(err.message || 'Error al confirmar envio', 'error');
            btn.style.display = 'block';
        }

        $('shipping-confirm-loading').style.display = 'none';
    }

    async function refreshOrders() {
        if (!state.clientInfo) return;

        try {
            var res = await fetch(CLIENT_API + '/orders/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: state.clientInfo.phone,
                    email: state.clientInfo.email
                })
            });

            var data = await res.json();

            if (data.success && data.orders) {
                state.orders = data.orders;
                state.clientInfo = data.clientInfo || state.clientInfo;
                renderResults();
            }
        } catch (err) {
            console.error('Refresh error:', err);
        }
    }

    // ── Payment Info Section ────────────────────────────────────
    function createPaymentInfoSection(order) {
        var section = document.createElement('div');
        section.className = 'payment-info';

        // Step header
        var stepHeader = document.createElement('div');
        stepHeader.className = 'step-header';
        var stepNum = document.createElement('span');
        stepNum.className = 'step-number';
        stepNum.textContent = '1';
        var stepTitle = document.createElement('span');
        stepTitle.className = 'step-title';
        stepTitle.textContent = 'Realiza tu pago';
        stepHeader.appendChild(stepNum);
        stepHeader.appendChild(stepTitle);
        section.appendChild(stepHeader);

        // Payment method toggle buttons
        var toggleRow = document.createElement('div');
        toggleRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

        var bankToggle = document.createElement('button');
        bankToggle.type = 'button';
        bankToggle.className = 'payment-toggle active';
        bankToggle.textContent = '🏦 Transferencia';

        var cardToggle = document.createElement('button');
        cardToggle.type = 'button';
        cardToggle.className = 'payment-toggle';
        cardToggle.textContent = '💳 Tarjeta';

        toggleRow.appendChild(bankToggle);
        toggleRow.appendChild(cardToggle);
        section.appendChild(toggleRow);

        // Bank Transfer details (visible by default)
        var bankDetails = document.createElement('div');
        bankDetails.className = 'payment-method';
        bankDetails.style.marginTop = '12px';

        appendPaymentDetail(bankDetails, 'Banco', 'BBVA', null);
        appendPaymentDetail(bankDetails, 'CLABE', '012 180 01571714055 4', '012180015717140554');
        appendPaymentDetail(bankDetails, 'Tarjeta', '4152 3138 4049 8567', '4152313840498567');
        appendPaymentDetail(bankDetails, 'A nombre de', 'Ivan Valencia', null);

        section.appendChild(bankDetails);

        // Card Payment (Stripe) — hidden by default
        var cardDetails = document.createElement('div');
        cardDetails.style.cssText = 'display:none;margin-top:12px;';

        var depositAmount = order.remainingBalance || (order.totalPrice ? order.totalPrice / 2 : 0);

        var stripeBtn = document.createElement('button');
        stripeBtn.type = 'button';
        stripeBtn.className = 'btn-stripe-pay';
        stripeBtn.insertAdjacentHTML('afterbegin',
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>' +
            '<line x1="1" y1="10" x2="23" y2="10"/></svg> '
        );
        stripeBtn.appendChild(document.createTextNode('Pagar $' + depositAmount.toLocaleString('es-MX', {minimumFractionDigits: 2}) + ' con Tarjeta'));
        stripeBtn.addEventListener('click', async function() {
            stripeBtn.disabled = true;
            stripeBtn.textContent = 'Redirigiendo a Stripe...';
            try {
                var res = await fetch(CLIENT_API + '/stripe-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: order.orderId,
                        amount: depositAmount,
                        clientName: state.clientInfo ? state.clientInfo.name : '',
                        clientEmail: state.clientInfo ? state.clientInfo.email : ''
                    })
                });
                var data = await res.json();
                if (data.success && data.url) {
                    window.location.href = data.url;
                } else {
                    throw new Error(data.error || 'Error al crear pago');
                }
            } catch (err) {
                showToast(err.message || 'Error al conectar con Stripe', 'error');
                stripeBtn.disabled = false;
                stripeBtn.textContent = 'Pagar $' + depositAmount.toLocaleString('es-MX', {minimumFractionDigits: 2}) + ' con Tarjeta';
            }
        });
        cardDetails.appendChild(stripeBtn);

        var stripeNote = document.createElement('p');
        stripeNote.style.cssText = 'font-size:0.78rem;color:var(--text-muted);text-align:center;margin-top:8px;';
        stripeNote.textContent = 'Pago seguro procesado por Stripe — ' + formatCurrency(depositAmount);
        cardDetails.appendChild(stripeNote);

        section.appendChild(cardDetails);

        // Toggle logic
        bankToggle.addEventListener('click', function() {
            bankToggle.classList.add('active');
            cardToggle.classList.remove('active');
            bankDetails.style.display = 'block';
            cardDetails.style.display = 'none';
        });
        cardToggle.addEventListener('click', function() {
            cardToggle.classList.add('active');
            bankToggle.classList.remove('active');
            cardDetails.style.display = 'block';
            bankDetails.style.display = 'none';
        });

        return section;
    }

    function appendPaymentDetail(parent, label, displayValue, copyValue) {
        var row = document.createElement('div');
        row.className = 'payment-detail-row';

        var labelEl = document.createElement('span');
        labelEl.className = 'payment-detail-label';
        labelEl.textContent = label;

        var valueEl = document.createElement('span');
        valueEl.className = 'payment-detail-value';
        valueEl.textContent = displayValue;

        row.appendChild(labelEl);
        row.appendChild(valueEl);

        if (copyValue) {
            var copyBtn = document.createElement('button');
            copyBtn.className = 'btn-copy-detail';
            copyBtn.title = 'Copiar ' + label;
            copyBtn.textContent = 'Copiar';
            copyBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                navigator.clipboard.writeText(copyValue).then(function() {
                    copyBtn.textContent = 'Copiado';
                    copyBtn.classList.add('copied');
                    setTimeout(function() {
                        copyBtn.textContent = 'Copiar';
                        copyBtn.classList.remove('copied');
                    }, 1500);
                    showToast(label + ' copiado al portapapeles', 'success');
                });
            });
            row.appendChild(copyBtn);
        }

        parent.appendChild(row);
    }

    // ── Helpers ───────────────────────────────────────────────

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            var d = new Date(dateStr);
            return d.toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    }

    function formatCurrency(amount) {
        if (amount == null) return '$0.00';
        return '$' + Number(amount).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

})();

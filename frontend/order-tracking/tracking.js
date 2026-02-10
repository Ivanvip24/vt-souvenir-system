(function() {
    'use strict';

    // ── Config ──────────────────────────────────────────────
    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api'
        : 'https://vt-souvenir-backend.onrender.com/api';

    const CLIENT_API = API_BASE + '/client';
    const SHIPPING_API = API_BASE + '/shipping';

    // ── State ───────────────────────────────────────────────
    const state = {
        activeTab: 'phone-email',
        orders: [],
        clientInfo: null,
        currentOrderId: null,
        shippingQuotationId: null,
        selectedRateId: null,
        selectedRateData: null,
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
        if (order.remainingBalance > 0) {
            appendTotalRow(totals, 'Saldo pendiente:', order.remainingBalanceFormatted || formatCurrency(order.remainingBalance), 'highlight');
        }
        card.appendChild(totals);

        // Action: Upload second receipt
        if (order.approvalStatus === 'approved' && order.remainingBalance > 0 && !order.secondPaymentReceived) {
            var uploadSection = createUploadSection(order.orderId);
            card.appendChild(uploadSection);
        }

        // Show if second payment already received
        if (order.secondPaymentReceived) {
            var successDiv = document.createElement('div');
            successDiv.className = 'upload-success';
            successDiv.textContent = '✅ Segundo comprobante recibido';
            card.appendChild(successDiv);
        }

        // Action: Shipping
        if (order.isStorePickup) {
            var pickupDiv = document.createElement('div');
            pickupDiv.className = 'pickup-badge';
            pickupDiv.textContent = '🏪 Recoger en tienda';
            card.appendChild(pickupDiv);
        } else if (order.approvalStatus === 'approved' && !order.allLabelsGenerated) {
            var shippingBtn = document.createElement('button');
            shippingBtn.className = 'btn-shipping';
            shippingBtn.dataset.orderId = order.orderId;
            shippingBtn.textContent = '🚚 Ver Opciones de Envio';
            shippingBtn.addEventListener('click', function() {
                state.currentOrderId = order.orderId;
                loadShippingQuotes(order.orderId);
            });
            card.appendChild(shippingBtn);
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
            'printing': { cssClass: 'production', text: 'Imprimiendo', icon: '🖨' },
            'cutting': { cssClass: 'production', text: 'Cortando', icon: '✂️' },
            'counting': { cssClass: 'production', text: 'Contando', icon: '📊' },
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

        var title = document.createElement('div');
        title.className = 'order-action-title';
        title.textContent = '📤 Subir Segundo Comprobante';
        section.appendChild(title);

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
            pdfIcon.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:24px;background:rgba(255,255,255,0.06);border-radius:8px';
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

            var uploadRes = await fetch(CLIENT_API + '/upload/payment-receipt', {
                method: 'POST',
                body: formData
            });

            var uploadData = await uploadRes.json();

            if (!uploadData.success) {
                throw new Error(uploadData.error || 'Error al subir archivo');
            }

            // Step 2: Link receipt to order
            var linkUrl = window.location.hostname === 'localhost'
                ? 'http://localhost:3000/api/orders/' + orderId + '/second-payment'
                : 'https://vt-souvenir-backend.onrender.com/api/orders/' + orderId + '/second-payment';

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

            showToast('Comprobante enviado correctamente', 'success');

        } catch (err) {
            console.error('Upload error:', err);
            showToast(err.message || 'Error al subir comprobante', 'error');
            btn.disabled = false;
            btn.textContent = 'Subir Comprobante';
        }
    }

    // ── Shipping Quotes ──────────────────────────────────────
    async function loadShippingQuotes(orderId) {
        navigateTo('shipping');

        // Show destination
        if (state.clientInfo) {
            var ci = state.clientInfo;
            $('shipping-destination').textContent = 'Envio a ' + [ci.city, ci.state].filter(Boolean).join(', ');
        }

        $('shipping-loading').style.display = 'block';
        $('shipping-rates-container').textContent = '';
        $('btn-confirm-shipping').style.display = 'none';

        try {
            var res = await fetch(SHIPPING_API + '/orders/' + orderId + '/quotes');
            var data = await res.json();

            if (!data.success || !data.rates || data.rates.length === 0) {
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
                $('shipping-rates-container').appendChild(emptyDiv);
                $('shipping-loading').style.display = 'none';
                return;
            }

            state.shippingQuotationId = data.quotation_id;

            renderShippingRates(data.rates, data.previousSelection);

        } catch (err) {
            console.error('Shipping quotes error:', err);
            var errDiv = document.createElement('div');
            errDiv.className = 'empty-state';
            var errIcon = document.createElement('div');
            errIcon.className = 'empty-state-icon';
            errIcon.textContent = '⚠️';
            var errTitle = document.createElement('h3');
            errTitle.textContent = 'Error de conexion';
            var errDesc = document.createElement('p');
            errDesc.textContent = 'No pudimos cargar las opciones de envio. Intenta de nuevo.';
            errDiv.appendChild(errIcon);
            errDiv.appendChild(errTitle);
            errDiv.appendChild(errDesc);
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
                    days: state.selectedRateData.days
                })
            });

            var data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Error al seleccionar envio');
            }

            showToast('Envio seleccionado: ' + state.selectedRateData.carrier, 'success');

            // Go back to results and refresh
            navigateTo('results');

            // Re-lookup to refresh data
            setTimeout(function() { refreshOrders(); }, 500);

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

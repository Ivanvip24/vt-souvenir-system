/* ═══════════════════════════════════════════════════════════
   AXKAN Lead Capture Form — Logic & Animations
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ═══════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════

    // Google Apps Script Web App URL — Replace with your deployed URL
    const GOOGLE_SCRIPT_URL = '';

    // WhatsApp number (with country code, no +)
    const WHATSAPP_NUMBER = '5215538253251';

    // ═══════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════

    const state = {
        currentScreen: 'hero',
        formData: {
            name: '',
            whatsapp: '',
            email: '',
            products: [],
            company: '',
            quantity: '',
            timeline: ''
        }
    };

    // ═══════════════════════════════════════
    // DOM REFS
    // ═══════════════════════════════════════

    const screens = {
        hero: document.getElementById('screen-hero'),
        contact: document.getElementById('screen-contact'),
        project: document.getElementById('screen-project'),
        loading: document.getElementById('screen-loading'),
        success: document.getElementById('screen-success'),
        error: document.getElementById('screen-error')
    };

    const progressBar = document.getElementById('topbar-progress');
    const progressRingFill = document.getElementById('progress-ring-fill');
    const progressText = document.getElementById('progress-text');
    const footer = document.getElementById('form-footer');

    // ═══════════════════════════════════════
    // PARTICLES BACKGROUND
    // ═══════════════════════════════════════

    function initParticles() {
        const canvas = document.getElementById('particles');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let particles = [];
        let animFrame;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function createParticle() {
            const colors = [
                'rgba(231, 42, 136, 0.3)',
                'rgba(9, 173, 194, 0.25)',
                'rgba(243, 146, 35, 0.2)',
                'rgba(138, 183, 59, 0.2)',
                'rgba(255, 255, 255, 0.15)'
            ];

            return {
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.5,
                speedX: (Math.random() - 0.5) * 0.3,
                speedY: (Math.random() - 0.5) * 0.3,
                color: colors[Math.floor(Math.random() * colors.length)],
                opacity: Math.random() * 0.5 + 0.1,
                pulse: Math.random() * Math.PI * 2
            };
        }

        function init() {
            resize();
            const count = Math.min(60, Math.floor(canvas.width * canvas.height / 15000));
            particles = Array.from({ length: count }, createParticle);
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                p.pulse += 0.01;

                // Wrap around
                if (p.x < -10) p.x = canvas.width + 10;
                if (p.x > canvas.width + 10) p.x = -10;
                if (p.y < -10) p.y = canvas.height + 10;
                if (p.y > canvas.height + 10) p.y = -10;

                const currentOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color.replace(/[\d.]+\)$/, currentOpacity + ')');
                ctx.fill();
            });

            // Draw faint connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 * (1 - dist / 120)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            animFrame = requestAnimationFrame(draw);
        }

        init();
        draw();

        window.addEventListener('resize', () => {
            resize();
        });
    }

    // ═══════════════════════════════════════
    // SCREEN TRANSITIONS
    // ═══════════════════════════════════════

    function navigateTo(screenName) {
        const current = screens[state.currentScreen];
        const next = screens[screenName];

        if (!current || !next || state.currentScreen === screenName) return;

        // Exit current
        current.classList.add('exiting');
        current.classList.remove('active');

        // After exit animation
        setTimeout(() => {
            current.classList.remove('exiting');
            current.style.display = 'none';

            // Enter new
            next.style.display = '';
            next.classList.add('entering');

            // Force reflow
            void next.offsetHeight;

            next.classList.remove('entering');
            next.classList.add('active');

            state.currentScreen = screenName;
            updateProgress();
            animateFieldsIn(next);

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 400);
    }

    function updateProgress() {
        const screenOrder = ['hero', 'contact', 'project', 'loading', 'success', 'error'];
        const idx = screenOrder.indexOf(state.currentScreen);

        // Show progress ring on form screens
        const showProgress = idx >= 1 && idx <= 2;
        progressBar.classList.toggle('visible', showProgress);
        footer.style.display = (idx >= 3) ? 'none' : '';

        if (!showProgress) return;

        // Calculate percentage based on filled fields
        const fields = [
            state.formData.name,
            state.formData.whatsapp,
            state.formData.email,
            state.formData.products.length > 0,
            state.formData.quantity,
            state.formData.timeline
        ];

        const filled = fields.filter(Boolean).length;
        const pct = Math.round((filled / fields.length) * 100);

        // Update ring (circumference = 2 * PI * 16 ≈ 100.53)
        const circumference = 100.53;
        const offset = circumference - (circumference * pct / 100);
        progressRingFill.style.strokeDashoffset = offset;
        progressText.textContent = pct + '%';
    }

    function animateFieldsIn(screen) {
        const fields = screen.querySelectorAll('.field-group');
        fields.forEach((field, i) => {
            field.classList.remove('visible');
            setTimeout(() => {
                field.classList.add('visible');
            }, 100 + i * 80);
        });
    }

    // ═══════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════

    function validateField(id, value) {
        const errorEl = document.getElementById('error-' + id);
        if (!errorEl) return true;

        let error = '';

        switch (id) {
            case 'name':
                if (!value.trim()) error = 'Por favor escribe tu nombre';
                else if (value.trim().length < 2) error = 'Nombre muy corto';
                break;
            case 'whatsapp':
                const digits = value.replace(/\D/g, '');
                if (!digits) error = 'Por favor escribe tu número';
                else if (digits.length < 10) error = 'Necesitamos 10 dígitos';
                break;
            case 'email':
                if (!value.trim()) error = 'Por favor escribe tu email';
                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) error = 'Email no válido';
                break;
            case 'product':
                if (state.formData.products.length === 0) error = 'Selecciona al menos un producto';
                break;
            case 'quantity':
                if (!state.formData.quantity) error = 'Selecciona una cantidad aproximada';
                break;
            case 'timeline':
                if (!state.formData.timeline) error = 'Selecciona cuándo los necesitas';
                break;
        }

        errorEl.textContent = error;
        errorEl.classList.toggle('visible', !!error);

        // Mark input as valid/invalid
        const input = document.getElementById('input-' + id);
        if (input) {
            input.classList.remove('valid', 'invalid');
            if (error) input.classList.add('invalid');
            else if (value.trim()) input.classList.add('valid');
        }

        return !error;
    }

    function validateContactScreen() {
        const v1 = validateField('name', state.formData.name);
        const v2 = validateField('whatsapp', state.formData.whatsapp);
        const v3 = validateField('email', state.formData.email);
        return v1 && v2 && v3;
    }

    function validateProjectScreen() {
        const v1 = validateField('product', '');
        const v2 = validateField('quantity', state.formData.quantity);
        const v3 = validateField('timeline', state.formData.timeline);
        return v1 && v2 && v3;
    }

    // ═══════════════════════════════════════
    // FORM SUBMISSION
    // ═══════════════════════════════════════

    async function submitForm() {
        navigateTo('loading');

        const payload = {
            timestamp: new Date().toISOString(),
            name: state.formData.name.trim(),
            whatsapp: '+52' + state.formData.whatsapp.replace(/\D/g, ''),
            email: state.formData.email.trim(),
            products: state.formData.products.join(', '),
            company: state.formData.company.trim(),
            quantity: state.formData.quantity,
            timeline: state.formData.timeline,
            source: getUTMParams()
        };

        // Build WhatsApp message
        const waMessage = buildWhatsAppMessage(payload);
        const waURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMessage)}`;

        // Set WhatsApp link
        const btnWA = document.getElementById('btn-whatsapp');
        if (btnWA) btnWA.href = waURL;

        // Try to send to Google Apps Script
        if (GOOGLE_SCRIPT_URL) {
            try {
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                // no-cors means we can't read the response, but the request was sent
            } catch (e) {
                console.warn('Google Script submission failed:', e);
                // Don't show error to user — WhatsApp still works as fallback
            }
        }

        // Short delay for UX (show the loading screen briefly)
        await new Promise(r => setTimeout(r, 1200));

        navigateTo('success');

        // Trigger confetti
        setTimeout(launchConfetti, 300);
    }

    function buildWhatsAppMessage(data) {
        let msg = `Hola! Me interesa cotizar souvenirs AXKAN.\n\n`;
        msg += `*Datos de contacto:*\n`;
        msg += `Nombre: ${data.name}\n`;
        msg += `WhatsApp: ${data.whatsapp}\n`;
        msg += `Email: ${data.email}\n`;

        if (data.company) {
            msg += `Negocio/Evento: ${data.company}\n`;
        }

        msg += `\n*Detalles del proyecto:*\n`;
        msg += `Productos: ${data.products}\n`;
        msg += `Cantidad: ${data.quantity}\n`;
        msg += `Plazo: ${data.timeline}\n`;

        if (data.source) {
            msg += `\n(Fuente: ${data.source})`;
        }

        return msg;
    }

    function getUTMParams() {
        const params = new URLSearchParams(window.location.search);
        const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']
            .map(k => params.get(k))
            .filter(Boolean)
            .join(' / ');
        return utm || 'directo';
    }

    // ═══════════════════════════════════════
    // CONFETTI CELEBRATION
    // ═══════════════════════════════════════

    function launchConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#e72a88', '#8ab73b', '#f39223', '#09adc2', '#e52421', '#D4A574', '#ffffff'];
        const confetti = [];

        for (let i = 0; i < 120; i++) {
            confetti.push({
                x: canvas.width / 2 + (Math.random() - 0.5) * 200,
                y: canvas.height / 2,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 16,
                vy: Math.random() * -18 - 4,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10,
                gravity: 0.25 + Math.random() * 0.1,
                opacity: 1,
                shape: Math.random() > 0.5 ? 'rect' : 'circle'
            });
        }

        let frame = 0;
        const maxFrames = 180;

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            frame++;

            confetti.forEach(c => {
                c.x += c.vx;
                c.vy += c.gravity;
                c.y += c.vy;
                c.vx *= 0.99;
                c.rotation += c.rotSpeed;
                c.opacity = Math.max(0, 1 - frame / maxFrames);

                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate((c.rotation * Math.PI) / 180);
                ctx.globalAlpha = c.opacity;
                ctx.fillStyle = c.color;

                if (c.shape === 'rect') {
                    ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, c.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            });

            if (frame < maxFrames) {
                requestAnimationFrame(animate);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }

        animate();
    }

    // ═══════════════════════════════════════
    // EVENT HANDLERS
    // ═══════════════════════════════════════

    function initEvents() {
        // Hero → Contact
        document.getElementById('btn-start').addEventListener('click', () => {
            navigateTo('contact');
        });

        // Contact → Hero (back)
        document.getElementById('btn-back-contact').addEventListener('click', () => {
            navigateTo('hero');
        });

        // Contact → Project
        document.getElementById('btn-next-contact').addEventListener('click', () => {
            syncInputs();
            if (validateContactScreen()) {
                navigateTo('project');
            }
        });

        // Project → Contact (back)
        document.getElementById('btn-back-project').addEventListener('click', () => {
            navigateTo('contact');
        });

        // Submit
        document.getElementById('btn-submit').addEventListener('click', () => {
            syncInputs();
            if (validateProjectScreen()) {
                submitForm();
            }
        });

        // Retry
        document.getElementById('btn-retry').addEventListener('click', () => {
            navigateTo('project');
        });

        // Input syncing
        document.getElementById('input-name').addEventListener('input', function () {
            state.formData.name = this.value;
            if (this.classList.contains('invalid')) validateField('name', this.value);
            updateProgress();
        });

        document.getElementById('input-whatsapp').addEventListener('input', function () {
            // Auto-format phone number
            let digits = this.value.replace(/\D/g, '');
            if (digits.length > 10) digits = digits.slice(0, 10);

            let formatted = '';
            if (digits.length > 0) formatted = digits.slice(0, 2);
            if (digits.length > 2) formatted += ' ' + digits.slice(2, 6);
            if (digits.length > 6) formatted += ' ' + digits.slice(6, 10);

            this.value = formatted;
            state.formData.whatsapp = digits;
            if (this.classList.contains('invalid')) validateField('whatsapp', digits);
            updateProgress();
        });

        document.getElementById('input-email').addEventListener('input', function () {
            state.formData.email = this.value;
            if (this.classList.contains('invalid')) validateField('email', this.value);
            updateProgress();
        });

        document.getElementById('input-company').addEventListener('input', function () {
            state.formData.company = this.value;
        });

        // Product cards (multi-select)
        document.querySelectorAll('#product-grid .product-card').forEach(card => {
            card.addEventListener('click', function () {
                const value = this.dataset.value;
                const idx = state.formData.products.indexOf(value);

                if (idx === -1) {
                    state.formData.products.push(value);
                    this.classList.add('selected');
                    // Satisfying pop animation
                    this.style.transform = 'scale(0.92)';
                    setTimeout(() => {
                        this.style.transform = '';
                    }, 150);
                } else {
                    state.formData.products.splice(idx, 1);
                    this.classList.remove('selected');
                }

                // Clear error if products selected
                const errorEl = document.getElementById('error-product');
                if (state.formData.products.length > 0 && errorEl) {
                    errorEl.classList.remove('visible');
                }
                updateProgress();
            });
        });

        // Quantity chips (single select)
        document.querySelectorAll('#quantity-grid .chip').forEach(chip => {
            chip.addEventListener('click', function () {
                document.querySelectorAll('#quantity-grid .chip').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                state.formData.quantity = this.dataset.value;

                // Pop animation
                this.style.transform = 'scale(0.93)';
                setTimeout(() => { this.style.transform = ''; }, 150);

                const errorEl = document.getElementById('error-quantity');
                if (errorEl) errorEl.classList.remove('visible');
                updateProgress();
            });
        });

        // Timeline chips (single select)
        document.querySelectorAll('#timeline-grid .chip').forEach(chip => {
            chip.addEventListener('click', function () {
                document.querySelectorAll('#timeline-grid .chip').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                state.formData.timeline = this.dataset.value;

                // Pop animation
                this.style.transform = 'scale(0.93)';
                setTimeout(() => { this.style.transform = ''; }, 150);

                const errorEl = document.getElementById('error-timeline');
                if (errorEl) errorEl.classList.remove('visible');
                updateProgress();
            });
        });

        // Enter key to advance
        document.querySelectorAll('.field-input').forEach(input => {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // Focus next input or click next button
                    const fieldGroup = this.closest('.field-group');
                    const nextField = fieldGroup.nextElementSibling;

                    if (nextField && nextField.classList.contains('field-group')) {
                        const nextInput = nextField.querySelector('.field-input');
                        if (nextInput) nextInput.focus();
                    } else {
                        // Click the next/submit button
                        const screen = this.closest('.screen');
                        const btn = screen.querySelector('.btn-next, .btn-submit');
                        if (btn) btn.click();
                    }
                }
            });
        });
    }

    function syncInputs() {
        state.formData.name = document.getElementById('input-name').value;
        state.formData.whatsapp = document.getElementById('input-whatsapp').value.replace(/\D/g, '');
        state.formData.email = document.getElementById('input-email').value;
        state.formData.company = document.getElementById('input-company').value;
    }

    // ═══════════════════════════════════════
    // KEYBOARD SHORTCUT: ESC to go back
    // ═══════════════════════════════════════

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (state.currentScreen === 'contact') navigateTo('hero');
            else if (state.currentScreen === 'project') navigateTo('contact');
        }
    });

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════

    function init() {
        initParticles();
        initEvents();

        // Show hero screen
        screens.hero.classList.add('active');

        // Hide non-hero screens initially
        Object.entries(screens).forEach(([name, el]) => {
            if (name !== 'hero') el.style.display = 'none';
        });
    }

    // Start when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

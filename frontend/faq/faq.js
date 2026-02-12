/* ═══════════════════════════════════════════════════════════
   AXKAN FAQ — Tabs, Accordions, and Search
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

    // ── Tab Navigation ──────────────────────────────────
    const tabs = $$('.tab');
    const contents = $$('.tab-content');

    function switchTab(tabName) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        contents.forEach(c => {
            const isTarget = c.id === `tab-${tabName}`;
            c.classList.toggle('active', isTarget);
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (searchInput.value.trim()) return; // tabs disabled during search
            switchTab(tab.dataset.tab);
        });
    });

    // ── FAQ Category Accordions ─────────────────────────
    $$('.category-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const cat = toggle.closest('.faq-category');
            cat.classList.toggle('open');
        });
    });

    // ── FAQ Item Accordions ─────────────────────────────
    $$('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const item = question.closest('.faq-item');
            item.classList.toggle('open');
        });
    });

    // ── Search ──────────────────────────────────────────
    const searchInput = $('#search-input');
    const searchClear = $('#search-clear');
    const resultsCount = $('#search-results-count');
    const appEl = $('.app');
    let debounceTimer = null;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(performSearch, 250);
        searchClear.classList.toggle('visible', searchInput.value.length > 0);
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.remove('visible');
        clearSearch();
        searchInput.focus();
    });

    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();

        if (!query) {
            clearSearch();
            return;
        }

        // Enter search mode
        appEl.classList.add('search-mode');

        const words = query.split(/\s+/).filter(w => w.length > 1);
        let totalMatches = 0;

        // Search through all searchable elements
        // Timeline steps
        $$('.timeline-step').forEach(step => {
            const searchText = (step.dataset.searchText || '') + ' ' +
                (step.textContent || '').toLowerCase();
            const matches = words.some(w => searchText.includes(w));
            step.classList.toggle('search-hidden', !matches);
            if (matches) totalMatches++;
        });

        // FAQ categories and items
        $$('.faq-category').forEach(cat => {
            let catHasMatch = false;
            const items = $$('.faq-item', cat);

            items.forEach(item => {
                const searchText = (item.dataset.searchText || '') + ' ' +
                    (item.textContent || '').toLowerCase();
                const matches = words.some(w => searchText.includes(w));
                item.classList.toggle('search-hidden', !matches);
                if (matches) {
                    catHasMatch = true;
                    item.classList.add('open');
                    totalMatches++;
                }
            });

            cat.classList.toggle('search-hidden', !catHasMatch);
            if (catHasMatch) cat.classList.add('open');
        });

        // Legal cards
        $$('.legal-card').forEach(card => {
            const searchText = (card.dataset.searchText || '') + ' ' +
                (card.textContent || '').toLowerCase();
            const matches = words.some(w => searchText.includes(w));
            card.classList.toggle('search-hidden', !matches);
            if (matches) totalMatches++;
        });

        // Disclaimer blocks
        $$('.disclaimer-block').forEach(block => {
            const searchText = (block.dataset.searchText || '') + ' ' +
                (block.textContent || '').toLowerCase();
            const matches = words.some(w => searchText.includes(w));
            block.classList.toggle('search-hidden', !matches);
            if (matches) totalMatches++;
        });

        // Hide entire sections that have no visible items
        contents.forEach(section => {
            const hasVisible = $(
                '.timeline-step:not(.search-hidden), .faq-category:not(.search-hidden), .legal-card:not(.search-hidden), .disclaimer-block:not(.search-hidden)',
                section
            );
            section.classList.toggle('search-hidden', !hasVisible);
        });

        // Update count
        if (totalMatches === 0) {
            resultsCount.textContent = 'No encontramos resultados. Intenta con otras palabras.';
        } else {
            resultsCount.textContent = `${totalMatches} resultado${totalMatches === 1 ? '' : 's'} encontrado${totalMatches === 1 ? '' : 's'}`;
        }
    }

    function clearSearch() {
        appEl.classList.remove('search-mode');
        resultsCount.textContent = '';

        // Remove all search-hidden classes
        $$('.search-hidden').forEach(el => el.classList.remove('search-hidden'));

        // Close FAQ items that were opened by search
        $$('.faq-item.open').forEach(item => item.classList.remove('open'));
        $$('.faq-category.open').forEach(cat => cat.classList.remove('open'));
    }

    // ── Keyboard shortcut: focus search with / ──────────
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            searchClear.classList.remove('visible');
            clearSearch();
            searchInput.blur();
        }
    });

    // ── URL hash navigation ─────────────────────────────
    function handleHash() {
        const hash = window.location.hash.replace('#', '');
        if (hash && ['proceso', 'faq', 'terminos', 'disclaimer'].includes(hash)) {
            switchTab(hash);
        }
    }

    window.addEventListener('hashchange', handleHash);
    handleHash();

})();

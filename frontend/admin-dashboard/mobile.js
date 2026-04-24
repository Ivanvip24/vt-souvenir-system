/* ==========================================
   AXKAN ADMIN - MOBILE INTERACTIONS
   Bottom nav, more sheet, pull-to-refresh
   Only activates at max-width: 768px
   ========================================== */

(function() {
    'use strict';

    const MOBILE_BREAKPOINT = 768;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

    // ==========================================
    // BOTTOM TAB NAVIGATION
    // ==========================================

    function initMobileNav() {
        const bottomNav = document.getElementById('mobile-bottom-nav');
        if (!bottomNav) return;

        // Show bottom nav
        bottomNav.style.display = 'flex';

        // Tab click handlers
        bottomNav.querySelectorAll('.bottom-tab[data-mobile-view]').forEach(tab => {
            tab.addEventListener('click', function() {
                const view = this.dataset.mobileView;

                // Use existing switchView
                if (typeof switchView === 'function') {
                    switchView(view);
                }

                // Update active states
                updateBottomTabState(view);

                // Close more sheet if open
                closeMobileMoreSheet();

                // Scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        // "More" button
        const moreBtn = document.getElementById('mobile-more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function() {
                toggleMobileMoreSheet();
            });
        }

        // More sheet items
        document.querySelectorAll('.more-sheet-item[data-mobile-view]').forEach(item => {
            item.addEventListener('click', function() {
                const view = this.dataset.mobileView;

                if (typeof switchView === 'function') {
                    switchView(view);
                }

                // Highlight "More" tab since the view is from the more sheet
                updateBottomTabState(null, true);

                closeMobileMoreSheet();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        // Sync with existing nav clicks (in case sidebar items are used)
        document.addEventListener('click', function(e) {
            const navItem = e.target.closest('.nav-item[data-view], .nav-sub-item[data-view]');
            if (navItem) {
                const view = navItem.dataset.view;
                updateBottomTabState(view);
            }
        });

        // Update pending badge
        updatePendingBadge();
    }

    function updateBottomTabState(viewName, isMoreView) {
        const bottomNav = document.getElementById('mobile-bottom-nav');
        if (!bottomNav) return;

        bottomNav.querySelectorAll('.bottom-tab').forEach(t => t.classList.remove('active'));

        if (isMoreView) {
            const moreBtn = document.getElementById('mobile-more-btn');
            if (moreBtn) moreBtn.classList.add('active');
            return;
        }

        // Find matching tab
        const tab = bottomNav.querySelector(`.bottom-tab[data-mobile-view="${viewName}"]`);
        if (tab) {
            tab.classList.add('active');
        } else {
            // View is in "more" section
            const moreBtn = document.getElementById('mobile-more-btn');
            if (moreBtn) moreBtn.classList.add('active');
        }
    }

    function updatePendingBadge() {
        const badge = document.getElementById('mobile-pending-badge');
        const countEl = document.getElementById('pending-count');
        if (badge && countEl) {
            const count = parseInt(countEl.textContent) || 0;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // Observe pending count changes
    const pendingObserver = new MutationObserver(updatePendingBadge);
    const pendingEl = document.getElementById('pending-count');
    if (pendingEl) {
        pendingObserver.observe(pendingEl, { childList: true, characterData: true, subtree: true });
    }

    // ==========================================
    // MORE SHEET
    // ==========================================

    function toggleMobileMoreSheet() {
        const sheet = document.getElementById('mobile-more-sheet');
        if (!sheet) return;

        if (sheet.classList.contains('hidden')) {
            sheet.classList.remove('hidden');
            document.body.classList.add('more-sheet-open');
        } else {
            closeMobileMoreSheet();
        }
    }

    function closeMobileMoreSheet() {
        const sheet = document.getElementById('mobile-more-sheet');
        if (sheet) {
            sheet.classList.add('hidden');
            document.body.classList.remove('more-sheet-open');
        }
    }

    // Make closeMobileMoreSheet globally accessible
    window.closeMobileMoreSheet = closeMobileMoreSheet;

    // ==========================================
    // PULL TO REFRESH
    // ==========================================

    function initPullToRefresh() {
        const contentArea = document.querySelector('.content-area');
        if (!contentArea) return;

        // Create indicator using safe DOM methods
        const indicator = document.createElement('div');
        indicator.className = 'pull-refresh-indicator';

        const spinner = document.createElement('div');
        spinner.className = 'pull-refresh-spinner';
        indicator.appendChild(spinner);

        const label = document.createElement('span');
        label.textContent = 'Suelta para actualizar';
        indicator.appendChild(label);

        contentArea.insertBefore(indicator, contentArea.firstChild);

        let startY = 0;
        let pulling = false;
        let refreshing = false;

        contentArea.addEventListener('touchstart', function(e) {
            if (refreshing) return;
            if (window.scrollY === 0 && contentArea.scrollTop === 0) {
                startY = e.touches[0].clientY;
                pulling = true;
            }
        }, { passive: true });

        contentArea.addEventListener('touchmove', function(e) {
            if (!pulling || refreshing) return;
            const delta = e.touches[0].clientY - startY;
            if (delta > 0 && delta < 150) {
                const height = Math.min(delta * 0.5, 60);
                indicator.style.height = height + 'px';
                indicator.style.opacity = Math.min(height / 40, 1);

                if (height >= 50) {
                    label.textContent = 'Suelta para actualizar';
                } else {
                    label.textContent = 'Desliza para actualizar';
                }
            }
        }, { passive: true });

        contentArea.addEventListener('touchend', function() {
            if (!pulling || refreshing) return;
            pulling = false;

            const h = parseInt(indicator.style.height) || 0;
            if (h >= 50) {
                refreshing = true;
                indicator.classList.add('refreshing');
                label.textContent = 'Actualizando...';
                indicator.style.height = '50px';

                // Trigger refresh based on active view
                triggerRefresh();

                setTimeout(function() {
                    indicator.classList.remove('refreshing');
                    indicator.style.height = '0px';
                    indicator.style.opacity = '0';
                    refreshing = false;
                }, 2000);
            } else {
                indicator.style.height = '0px';
                indicator.style.opacity = '0';
            }
        });
    }

    function triggerRefresh() {
        // Find active view and refresh its data
        const activeView = document.querySelector('.view.active');
        if (!activeView) return;

        const viewId = activeView.id;

        if (viewId === 'orders-view' && typeof loadOrders === 'function') {
            loadOrders();
        } else if (viewId === 'calendar-view' && typeof initCalendar === 'function') {
            initCalendar();
        } else if (viewId === 'analytics-view' && typeof initAnalytics === 'function') {
            initAnalytics();
        } else if (viewId === 'shipping-view' && typeof loadShippingClients === 'function') {
            loadShippingClients();
        } else if (viewId === 'products-view' && typeof loadProducts === 'function') {
            loadProducts();
        } else if (viewId === 'leads-view' && typeof loadLeads === 'function') {
            loadLeads();
        }
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    function initMobile() {
        if (!mq.matches) return;

        initMobileNav();
        initPullToRefresh();

        // Refresh lucide icons for bottom nav
        if (typeof lucide !== 'undefined') {
            setTimeout(function() {
                lucide.createIcons();
            }, 100);
        }
    }

    function destroyMobile() {
        // Remove pull-to-refresh indicator
        const indicator = document.querySelector('.pull-refresh-indicator');
        if (indicator) indicator.remove();

        // Hide bottom nav
        const bottomNav = document.getElementById('mobile-bottom-nav');
        if (bottomNav) bottomNav.style.display = 'none';
    }

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobile);
    } else {
        initMobile();
    }

    // Handle resize between mobile/desktop
    mq.addEventListener('change', function(e) {
        if (e.matches) {
            initMobile();
        } else {
            destroyMobile();
        }
    });

})();

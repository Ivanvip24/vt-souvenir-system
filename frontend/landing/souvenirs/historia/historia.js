/**
 * AXKAN Historia - Destination Landing Page Interactions
 * Mobile-first, touch-optimized, performance-focused
 */

(function() {
  'use strict';

  // ============================================
  // INITIALIZATION
  // ============================================
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Mark hero as loaded for initial animation
    setTimeout(() => {
      document.querySelector('.hero')?.classList.add('loaded');
    }, 100);

    // Initialize all modules
    initRevealAnimations();
    initCounterAnimations();
    initGalleryScroll();
    initParallax();
    initSmoothScroll();

    console.log('🏛️ AXKAN Historia initialized');
  }


  // ============================================
  // REVEAL ANIMATIONS (Scroll-triggered)
  // ============================================
  function initRevealAnimations() {
    const reveals = document.querySelectorAll('.reveal');

    if (!reveals.length) return;

    const observerOptions = {
      root: null,
      rootMargin: '-50px 0px',
      threshold: 0.15
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Optionally unobserve after revealing
          // observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    reveals.forEach(el => observer.observe(el));
  }


  // ============================================
  // COUNTER ANIMATIONS
  // ============================================
  function initCounterAnimations() {
    const counters = document.querySelectorAll('[data-target]');

    if (!counters.length) return;

    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.target, 10);

          if (!el.dataset.animated) {
            animateCounter(el, target);
            el.dataset.animated = 'true';
          }
        }
      });
    }, observerOptions);

    counters.forEach(el => observer.observe(el));
  }

  function animateCounter(element, target, duration = 1500) {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * easeOut);

      element.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = target;
        // Add a little bounce effect
        element.style.transform = 'scale(1.1)';
        setTimeout(() => {
          element.style.transform = 'scale(1)';
        }, 150);
      }
    }

    requestAnimationFrame(update);
  }


  // ============================================
  // GALLERY SCROLL (Touch-optimized)
  // ============================================
  function initGalleryScroll() {
    const track = document.querySelector('.gallery-track');
    const progressBar = document.querySelector('.progress-bar');

    if (!track) return;

    // Update progress bar on scroll
    track.addEventListener('scroll', () => {
      const scrollWidth = track.scrollWidth - track.clientWidth;
      const scrollLeft = track.scrollLeft;
      const progress = scrollWidth > 0 ? (scrollLeft / scrollWidth) * 100 : 0;

      if (progressBar) {
        progressBar.style.setProperty('--progress', `${progress}%`);
        const bar = progressBar.querySelector('::after') || progressBar;
        // Update the pseudo-element via CSS custom property
        progressBar.style.cssText = `--progress-width: ${Math.max(20, progress)}%`;
      }
    });

    // Add CSS for dynamic progress
    const style = document.createElement('style');
    style.textContent = `
      .progress-bar::after {
        width: var(--progress-width, 20%);
      }
    `;
    document.head.appendChild(style);

    // Optional: Add touch momentum scrolling enhancement
    let isDown = false;
    let startX;
    let scrollLeft;

    // Mouse drag for desktop testing
    track.addEventListener('mousedown', (e) => {
      isDown = true;
      track.style.cursor = 'grabbing';
      startX = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
    });

    track.addEventListener('mouseleave', () => {
      isDown = false;
      track.style.cursor = 'grab';
    });

    track.addEventListener('mouseup', () => {
      isDown = false;
      track.style.cursor = 'grab';
    });

    track.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.5;
      track.scrollLeft = scrollLeft - walk;
    });

    // Set initial cursor
    track.style.cursor = 'grab';
  }


  // ============================================
  // PARALLAX EFFECT
  // ============================================
  function initParallax() {
    const hero = document.querySelector('.hero-bg');
    const heroImg = document.querySelector('.hero-img');

    if (!hero || !heroImg) return;

    // Only apply parallax on larger screens
    if (window.innerWidth < 768) return;

    let ticking = false;

    function updateParallax() {
      const scrollY = window.scrollY;
      const heroHeight = hero.offsetHeight;

      if (scrollY < heroHeight) {
        const parallaxOffset = scrollY * 0.4;
        heroImg.style.transform = `scale(1.1) translateY(${parallaxOffset}px)`;
      }

      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
  }


  // ============================================
  // SMOOTH SCROLL
  // ============================================
  function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');

        if (href === '#') return;

        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();

          const headerOffset = 0;
          const elementPosition = target.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      });
    });
  }


  // ============================================
  // LAZY LOADING ENHANCEMENT
  // ============================================
  // Native lazy loading is used via HTML attribute
  // This adds a fade-in effect when images load

  document.querySelectorAll('img[loading="lazy"]').forEach(img => {
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.5s ease';

    if (img.complete) {
      img.style.opacity = '1';
    } else {
      img.addEventListener('load', () => {
        img.style.opacity = '1';
      });
    }
  });


  // ============================================
  // PRODUCTS CAROUSEL (Touch)
  // ============================================
  const productsCarousel = document.querySelector('.products-carousel');
  if (productsCarousel) {
    let isDown = false;
    let startX;
    let scrollLeft;

    productsCarousel.addEventListener('mousedown', (e) => {
      isDown = true;
      productsCarousel.style.cursor = 'grabbing';
      startX = e.pageX - productsCarousel.offsetLeft;
      scrollLeft = productsCarousel.scrollLeft;
    });

    productsCarousel.addEventListener('mouseleave', () => {
      isDown = false;
      productsCarousel.style.cursor = 'grab';
    });

    productsCarousel.addEventListener('mouseup', () => {
      isDown = false;
      productsCarousel.style.cursor = 'grab';
    });

    productsCarousel.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - productsCarousel.offsetLeft;
      const walk = (x - startX) * 1.5;
      productsCarousel.scrollLeft = scrollLeft - walk;
    });

    productsCarousel.style.cursor = 'grab';
  }


  // ============================================
  // SCROLL INDICATOR HIDE
  // ============================================
  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 100) {
        scrollIndicator.style.opacity = '0';
        scrollIndicator.style.pointerEvents = 'none';
      } else {
        scrollIndicator.style.opacity = '1';
        scrollIndicator.style.pointerEvents = 'auto';
      }
    }, { passive: true });
  }


  // ============================================
  // PERFORMANCE: Reduce animations when tab not visible
  // ============================================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.body.classList.add('reduce-motion');
    } else {
      document.body.classList.remove('reduce-motion');
    }
  });

})();

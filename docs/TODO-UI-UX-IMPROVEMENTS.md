# AXKAN UI/UX Improvement Roadmap

## Priority Legend
- 🔴 Critical (Immediate)
- 🟡 Moderate (Short-term)
- 🟢 Enhancement (Medium-term)

---

## ADMIN DASHBOARD

### 🔴 Critical Issues

- [ ] **Mobile Responsiveness - BROKEN**
  - Fixed 240px sidebar breaks on mobile
  - Add responsive breakpoints for tablet/phone
  - Implement hamburger menu for sidebar toggle
  - File: `frontend/admin-dashboard/styles.css`

- [ ] **Information Overload in Header**
  - Too many stat cards + AI search cluttered
  - Make "Pedidos Pendientes" more prominent
  - Move "Pagos Finales" to alert banner below header

- [ ] **Missing Loading States**
  - Add skeleton loaders instead of basic spinner
  - Improve perceived performance

- [ ] **Accessibility Issues**
  - Add `aria-label` to all buttons
  - Fix color contrast on gradient buttons (WCAG)
  - Don't rely on color alone for status badges

### 🟡 Moderate Improvements

- [ ] **Order Cards Enhancement**
  - Add colored left border per status
  - Progressive disclosure (expand for details)
  - Quick actions on hover (WhatsApp, Approve, View)

- [ ] **Search UX Improvements**
  - Show "No results" state with suggestions
  - Add recent searches dropdown
  - Add keyboard shortcut hint (⌘K)

- [ ] **AI Assistant Polish**
  - Add placeholder examples: "¿Cuánto vendí esta semana?"
  - Add conversation history
  - Make capabilities clearer

- [ ] **Calendar View**
  - Add drag-and-drop order rescheduling
  - Show order details on hover
  - Color-code by urgency, not just capacity

---

## CLIENT ORDER FORM

### 🔴 Critical Issues

- [ ] **Form Abandonment Risk - Step 2**
  - Too many fields in one screen
  - Break into micro-steps or progressive disclosure
  - Step 2a: Postal Code (auto-fills)
  - Step 2b: Confirm + add street/number

- [ ] **No Real-time Validation**
  - Add inline validation as user types
  - Show ✓ when valid, ✗ with error message
  - File: `frontend/client-order-form/order-form.js`

- [ ] **Promo Code UX**
  - Add loading state during "Aplicar"
  - Better error feedback
  - Visual confirmation when applied

- [ ] **Payment Step Friction**
  - Add copy-to-clipboard for bank account numbers
  - Add QR code for mobile banking apps
  - Clarify receipt upload flow

### 🟡 Moderate Improvements

- [ ] **Product Selection (Step 3)**
  - Add product images/thumbnails
  - Add "Popular" or "Best Seller" badges
  - Larger quantity selector for mobile
  - Category tabs for large catalogs

- [ ] **Trust Signals Missing**
  - Add testimonials or reviews section
  - Add "X people ordered this week" social proof
  - Security badges near payment
  - Visible return policy

- [ ] **Sticky Header Improvements**
  - Add item count alongside total
  - Keep "Continuar" button always visible
  - Add scroll-to-top button

- [ ] **Success/Confirmation Page**
  - Add order timeline expectations
  - WhatsApp share button
  - Clear next steps messaging

---

## CONVERSION OPTIMIZATION

### High Impact / Low Effort
| Change | Expected Impact |
|--------|-----------------|
| Copy-to-clipboard for bank account | +5% payment completion |
| Real-time form validation | -15% form errors |
| Trust badges on payment step | +8% conversion |
| Loading skeleton animations | +12% perceived speed |

### High Impact / Medium Effort
| Change | Expected Impact |
|--------|-----------------|
| Mobile-responsive admin dashboard | Access for 50%+ mobile users |
| Progressive form disclosure | -25% abandonment |
| Order status email/SMS notifications | +30% customer satisfaction |
| Quick-view order modal | -40% admin task time |

---

## TECHNICAL RECOMMENDATIONS

### Performance
- [ ] Lazy load product images
- [ ] Cache postal code lookups
- [ ] Minify CSS/JS for production

### Security
- [ ] Add CSP headers for XSS protection
- [ ] Rate limit API endpoints
- [ ] Sanitize all user inputs server-side

### Accessibility (WCAG 2.1)
- [ ] Add `aria-live` regions for dynamic content
- [ ] Ensure 4.5:1 color contrast ratios
- [ ] Add focus indicators for keyboard navigation
- [ ] Screen reader announcements for form errors

---

## IMPLEMENTATION ORDER

### Week 1 - Critical Fixes
1. Mobile responsiveness for admin dashboard
2. Copy-to-clipboard for bank account details
3. Real-time form validation with visual feedback

### Week 2 - User Experience
4. Loading skeletons instead of spinners
5. Payment step QR code option
6. Trust signals and security badges

### Week 3-4 - Polish
7. Progressive form disclosure
8. Order status notifications (email/SMS)
9. Product image gallery in order form

---

*Created: December 2024*
*Last Updated: December 2024*

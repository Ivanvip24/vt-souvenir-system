# Order Form Multi-Variant Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the product selection step so clients can order multiple sizes of the same product, with category tabs and a sticky cart bar.

**Architecture:** Replace single-size-per-product cart with composite keys (productId__variantKey). Product cards render all variant rows inline. Category tabs filter the grid. Sticky bottom bar shows running total with expandable drawer.

**Tech Stack:** Vanilla JS (no frameworks), inline CSS, existing AXKAN brand system (Rosa Mexicano #e72a88, RL AQVA titles).

**Design doc:** docs/plans/2026-03-18-order-form-multi-variant-redesign.md

**AXKAN Brand Rules:**
- Primary: #e72a88 (Rosa Mexicano) for CTAs, active states, prices
- Titles: RL AQVA font
- Body: system sans-serif (DM Sans fallback)
- 60/30/10 color rule: white backgrounds, pink accents, green for success states
- Dark cart bar: #1a1216 gradient (premium feel)

---

## 8 Tasks — Estimated 45-60 min total

### Task 1: Define Variant Configuration System
Replace MAGNET_SIZES with flexible PRODUCT_VARIANTS in order-form.js (lines 35-60).
Update state object to remove magnetSizes, change cart key structure to productId__variantKey.

### Task 2: Rebuild Product Card Rendering
Replace createProductCard function (lines 1383-1504). New version renders variant rows per product. Products without variants get single row. Uses safe DOM creation methods.

### Task 3: Rewrite Quantity Handlers
Delete selectMagnetSize (lines 1522-1588) and handleQuantityChange (lines 1597-1719). New handlers: handleVariantQty for +/- buttons, handleVariantQtyInput for direct input, updateCartItem for cart state, updateProductCardState for UI.

### Task 4: Add Category Tabs
Add category tabs HTML before products-container in index.html. Add CSS. Add JS for buildCategoryTabs and filterCategory. Dynamic categories from product.category field.

### Task 5: Build Sticky Cart Bar + Drawer
Replace existing sticky-footer with cart bar + drawer in index.html. Add CSS for bar (fixed bottom, dark gradient), overlay, and drawer (slide-up, white, rounded). Add JS for updateStickyBar, toggleCartDrawer, renderCartDrawer.

### Task 6: Add Variant Row CSS
Add all CSS for variant rows, quantity inputs, product card headers, subtotals, tier warnings. Mobile responsive rules. AXKAN brand colors throughout.

### Task 7: Update Order Submission
Update items array mapping (lines 2409-2417) to use new cart structure with variantLabel in product names. Update continue button logic.

### Task 8: Clean Up + Test
Remove all MAGNET_SIZES references, old selectMagnetSize, old handleQuantityChange, old .size-btn CSS. Manual test checklist for all flows.

---

See the full design document for detailed code: docs/plans/2026-03-18-order-form-multi-variant-redesign.md

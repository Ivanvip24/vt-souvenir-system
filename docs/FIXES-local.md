# FIXES - Pending Issues Log

This document tracks bugs and issues that need to be fixed. When starting a new session, check this file to continue where we left off.

---

## Last Updated: December 6, 2025

---

## 🔴 PENDING FIXES

### 1. Multi-select bulk operations not working
**Date Reported:** December 6, 2025
**Status:** 🔴 Not Fixed
**Priority:** High

**Description:**
The multi-select option in the admin dashboard orders view is not working properly. When trying to select multiple orders to mark them as completed, it shows a confirmation dialog saying "¿Marcar 0 pedido(s) como completados?" even when orders are selected.

**Screenshot:**
![Multi-select showing 0 orders](https://i.imgur.com/placeholder.png)
*Dialog shows "¿Marcar 0 pedido(s) como completados?" when orders should be selected*

**Expected Behavior:**
- User should be able to check multiple order checkboxes
- The bulk action bar should show the correct count of selected orders
- Clicking "Completo" should mark all selected orders as completed

**Location:**
- `frontend/admin-dashboard/dashboard.js` - bulk selection logic
- `frontend/admin-dashboard/index.html` - order checkboxes

**Notes:**
- The `state.selectedOrders` Set might not be getting populated when checkboxes are clicked
- Need to verify checkbox click handlers are properly connected

---

## ✅ COMPLETED FIXES

*(Move items here once fixed)*

---

## 📝 HOW TO USE THIS FILE

1. **Starting a new session?** Ask: "Where were we left off?" or "What were we working on?"
2. **Found a new bug?** Add it to the PENDING FIXES section with date, description, and screenshots if available
3. **Fixed something?** Move it to COMPLETED FIXES with the fix date and commit hash

---

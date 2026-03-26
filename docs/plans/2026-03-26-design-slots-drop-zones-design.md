# Design Slots as Interactive Drop Zones

**Date:** 2026-03-26
**Status:** Approved

## Summary

Transform the D1, D2... design strip pills in the designer portal from passive status indicators into interactive image drop zones. When a design image is uploaded to a slot, it turns from red to green. A "Generate Order" button runs `generate_axkan.py` when all slots are filled. Designers can add/remove slots with +/- buttons.

## Design Slot States

Each slot pill has 3 visual states:

- **Empty (red)** — no design uploaded. Dashed border, red glow, shows "D1" label
- **Filled (green)** — image uploaded to Cloudinary. Green glow, small thumbnail, checkmark
- **Dragover (hover)** — pulsing border animation inviting the drop

## Interaction Methods

- **Drag & drop** an image file directly onto a D1/D2 pill
- **Click** a slot to open file picker
- **Paste** (Ctrl+V) assigns to the currently selected slot

## +/- Slot Controls

Buttons at the end of the strip: `[D1] [D2] [+] [-]`

- **+** creates a new `design_assignment` row via API with next `design_number`
- **-** removes the last empty slot only (won't delete slots with images)
- Use case: client changes mind mid-conversation ("actually I want 3 designs not 2")

## Generate Order Button

- Replaces the clipboard icon in the chat header (right side)
- **Disabled** (grayed out) until all slots have images
- **Enabled** with rosa mexicano (`#e72a88`) glow when all slots are green
- Calls `POST /api/design-portal/generate-order`
- Backend spawns `python3 generate_axkan.py` with order data as JSON

### Data passed to Python script

```json
{
  "order_id": 123,
  "order_number": "WA-20260320-75KR",
  "client_name": "Ivan TEST",
  "designs": [
    { "slot": "D1", "image_url": "https://res.cloudinary.com/..." },
    { "slot": "D2", "image_url": "https://res.cloudinary.com/..." }
  ]
}
```

## Database Changes

- Add `design_image_url TEXT` column to `design_assignments` table

## New API Endpoints

1. `PUT /design-portal/designs/:id/image` — saves Cloudinary URL to slot after upload
2. `POST /design-portal/orders/:orderId/add-slot` — creates new design_assignment row
3. `DELETE /design-portal/orders/:orderId/remove-slot` — removes last empty slot
4. `POST /design-portal/generate-order` — gathers design URLs, spawns Python script

## Frontend Changes (designs.js)

- `renderDesignStrip()` — pills become drop zones with drag/drop/click handlers
- `uploadDesignToSlot(designId, file)` — uploads to Cloudinary, saves URL, turns pill green
- `addDesignSlot()` / `removeDesignSlot()` — +/- button handlers
- `generateOrder()` — calls API, shows loading state
- Paste handler routes to currently selected slot

## Image Storage

- Images uploaded to Cloudinary (existing infrastructure)
- URL stored in `design_assignments.design_image_url`
- Persistent across sessions, visible to managers

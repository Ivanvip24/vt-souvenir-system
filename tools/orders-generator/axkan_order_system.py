#!/usr/bin/env python3
"""
AXKAN Order System - Integrated AI Order Processing

One-click system that:
1. Accepts order image (paste or upload)
2. Automatically detects grid layout and crops individual designs
3. Saves cropped images
4. Generates PDF with all data pre-filled

Usage:
    python axkan_order_system.py

The system will:
- Open GUI to paste/upload order image
- Detect how many designs are in the image
- Crop each design automatically
- Ask for order name and quantities
- Generate PDF with AXKAN branding
"""

import os
import sys
import subprocess
import json
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, filedialog, simpledialog
from PIL import Image as PILImage, ImageGrab, ImageTk, ImageDraw, ImageFont

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfform
import yaml


# AXKAN Brand Colors
AXKAN_COLORS = {
    'pink': '#E91E63',
    'green': '#7CB342',
    'orange': '#FF9800',
    'cyan': '#00BCD4',
    'red': '#F44336',
    'dark': '#333333',
    'light': '#F5F5F5',
    'white': '#FFFFFF'
}


class OrderImageAnalyzer:
    """Analyzes order images and extracts design cells"""

    def __init__(self, image):
        self.image = image
        self.width, self.height = image.size

    def detect_grid_layout(self):
        """
        Detect the grid layout by analyzing whitespace gaps between content regions.
        Returns (rows, cols) tuple.
        """
        # Convert to grayscale for analysis
        gray = self.image.convert('L')

        # Detect grid by finding whitespace gaps (bright regions) between content (dark regions)
        cols, rows = self._detect_by_regularity(gray)

        # Validate detected grid
        if cols >= 1 and rows >= 1 and cols <= 6 and rows <= 6:
            return (rows, cols)

        # Fallback to aspect ratio method if detection fails
        return self._fallback_aspect_ratio_detection()

    def _detect_by_regularity(self, gray_image):
        """
        Detect grid by finding whitespace gaps between content regions.
        Looks for consistent vertical and horizontal white/light strips.
        """
        height = gray_image.height
        width = gray_image.width

        # For columns: compute average brightness of each vertical strip
        col_brightness = []
        sample_step = max(1, height // 50)
        for x in range(width):
            total = sum(gray_image.getpixel((x, y)) for y in range(0, height, sample_step))
            avg = total / (height // sample_step)
            col_brightness.append(avg)

        # For rows: compute average brightness of each horizontal strip
        row_brightness = []
        sample_step_x = max(1, width // 50)
        for y in range(height):
            total = sum(gray_image.getpixel((x, y)) for x in range(0, width, sample_step_x))
            avg = total / (width // sample_step_x)
            row_brightness.append(avg)

        # Find whitespace gaps - regions that are significantly brighter (whiter)
        cols = self._count_regions_by_brightness(col_brightness, width)
        rows = self._count_regions_by_brightness(row_brightness, height)

        return cols, rows

    def _count_regions_by_brightness(self, brightness, total_size):
        """Count content regions by finding whitespace gaps"""
        if not brightness or total_size < 10:
            return 1

        # Light smoothing to reduce noise, but preserve structure
        window = max(3, total_size // 200)
        smoothed = self._smooth_profile(brightness, window)

        # Find max brightness (white = ~255)
        max_brightness = max(smoothed)
        min_brightness = min(smoothed)
        brightness_range = max_brightness - min_brightness

        if brightness_range < 20:
            # Very uniform image, can't detect gaps
            return 1

        # Whitespace threshold: must be very close to max brightness (pure white)
        # Use 90% of the way from min to max
        whitespace_threshold = min_brightness + brightness_range * 0.90

        # Content threshold: anything not pure white counts as content
        # Use 85% of the way from min to max (very lenient to catch light-colored content like yellow)
        content_threshold = min_brightness + brightness_range * 0.85

        # Minimum gap size to count as a divider (at least 0.5% of total size)
        min_gap_size = max(2, total_size // 200)

        # Minimum content size (at least 5% of total size)
        min_content_size = total_size // 20

        # Find gaps (consecutive whitespace regions)
        gaps = []
        in_gap = False
        gap_start = 0

        for i, b in enumerate(smoothed):
            if b >= whitespace_threshold:
                if not in_gap:
                    gap_start = i
                    in_gap = True
            else:
                if in_gap and i - gap_start >= min_gap_size:
                    gaps.append((gap_start, i))
                in_gap = False

        # Also check for gap at the end
        if in_gap and len(smoothed) - gap_start >= min_gap_size:
            gaps.append((gap_start, len(smoothed)))

        # Filter gaps that are at the edges (not between content)
        # Keep only interior gaps that separate content regions
        interior_gaps = []

        for gap_start_pos, gap_end_pos in gaps:
            # Skip gaps at the very beginning or end
            if gap_start_pos < min_gap_size:
                continue
            if gap_end_pos > total_size - min_gap_size:
                continue

            # Check if there's content before and after
            has_content_before = any(
                smoothed[i] < content_threshold
                for i in range(max(0, gap_start_pos - min_content_size), gap_start_pos)
            )
            has_content_after = any(
                smoothed[i] < content_threshold
                for i in range(gap_end_pos, min(len(smoothed), gap_end_pos + min_content_size))
            )

            if has_content_before and has_content_after:
                interior_gaps.append((gap_start_pos, gap_end_pos))

        # Number of content regions = number of interior gaps + 1
        num_regions = len(interior_gaps) + 1

        # Sanity check
        return max(1, min(8, num_regions))

    def _smooth_profile(self, profile, window=5):
        """Apply simple moving average smoothing"""
        if window < 1:
            window = 1
        smoothed = []
        half_w = window // 2
        for i in range(len(profile)):
            start = max(0, i - half_w)
            end = min(len(profile), i + half_w + 1)
            avg = sum(profile[start:end]) / (end - start)
            smoothed.append(avg)
        return smoothed

    def _fallback_aspect_ratio_detection(self):
        """Fallback detection based on aspect ratio"""
        aspect = self.width / self.height

        if aspect > 1.8:
            return (1, 3)
        elif aspect > 1.3:
            return (2, 3)
        elif aspect > 0.9:
            if self.width > 1000:
                return (3, 3)
            else:
                return (2, 2)
        else:
            return (3, 2)

    def crop_designs(self, rows, cols, padding_top_pct=0.12, padding_bottom_pct=0.08):
        """
        Crop individual designs from the grid.

        Args:
            rows: Number of rows in grid
            cols: Number of columns in grid
            padding_top_pct: Percentage of cell height to skip from top (for "Tipo:" label)
            padding_bottom_pct: Percentage of cell height to skip from bottom (for "Requeridos:")

        Returns:
            List of cropped PIL Images
        """
        cell_width = self.width // cols
        cell_height = self.height // rows

        designs = []

        for row in range(rows):
            for col in range(cols):
                # Calculate cell boundaries
                x1 = col * cell_width
                y1 = row * cell_height
                x2 = x1 + cell_width
                y2 = y1 + cell_height

                # Add padding to skip text areas
                padding_top = int(cell_height * padding_top_pct)
                padding_bottom = int(cell_height * padding_bottom_pct)
                margin = 10

                # Crop the design area (excluding labels)
                crop_x1 = x1 + margin
                crop_y1 = y1 + padding_top
                crop_x2 = x2 - margin
                crop_y2 = y2 - padding_bottom

                design_img = self.image.crop((crop_x1, crop_y1, crop_x2, crop_y2))
                designs.append({
                    'image': design_img,
                    'row': row,
                    'col': col,
                    'index': row * cols + col
                })

        return designs


class IntegratedOrderGUI:
    """
    Integrated GUI for the complete order workflow:
    1. Paste/upload order image
    2. Preview and confirm grid detection
    3. Enter order details
    4. Generate PDF
    """

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("AXKAN - Order System")
        self.root.geometry("1000x800")
        self.root.configure(bg=AXKAN_COLORS['light'])

        self.order_image = None
        self.cropped_designs = []
        self.grid_rows = 2
        self.grid_cols = 3

        self.setup_ui()

    def setup_ui(self):
        """Setup the main UI"""
        # Header
        header = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], height=80)
        header.pack(fill=tk.X)
        header.pack_propagate(False)

        # AXKAN Logo
        logo_frame = tk.Frame(header, bg=AXKAN_COLORS['dark'])
        logo_frame.pack(pady=15)

        letters = [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                   ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                   ('N', AXKAN_COLORS['red'])]

        for letter, color in letters:
            lbl = tk.Label(logo_frame, text=letter, font=("Impact", 36, "bold"),
                          fg=color, bg=AXKAN_COLORS['dark'])
            lbl.pack(side=tk.LEFT, padx=0)  # Close together

        subtitle = tk.Label(header, text="Order System",
                           font=("Helvetica", 12),
                           fg="white", bg=AXKAN_COLORS['dark'])
        subtitle.pack()

        # Main content area - will switch between steps
        self.content_frame = tk.Frame(self.root, bg=AXKAN_COLORS['light'])
        self.content_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        # Start with Step 1: Upload image
        self.show_step1_upload()

        # Bind paste shortcut
        self.root.bind('<Command-v>', lambda e: self.paste_image())
        self.root.bind('<Control-v>', lambda e: self.paste_image())

    def clear_content(self):
        """Clear the content frame"""
        for widget in self.content_frame.winfo_children():
            widget.destroy()

    def show_step1_upload(self):
        """Step 1: Upload or paste order image"""
        self.clear_content()

        # Instructions
        title = tk.Label(self.content_frame,
            text="Step 1: Load Order Image",
            font=("Helvetica", 18, "bold"),
            bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'])
        title.pack(pady=10)

        instr = tk.Label(self.content_frame,
            text="Paste an order image (Cmd+V) or browse for a file.\n"
                 "The image should show designs in a grid layout with types and quantities.",
            font=("Helvetica", 11),
            bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'])
        instr.pack(pady=5)

        # Preview area
        preview_frame = tk.Frame(self.content_frame, bg="white",
                                relief=tk.SUNKEN, borderwidth=2)
        preview_frame.pack(fill=tk.BOTH, expand=True, pady=10)

        self.preview_label = tk.Label(preview_frame,
            text="[No image loaded]\n\nPaste with Cmd+V (or Ctrl+V)\nor click 'Browse File'",
            font=("Helvetica", 16),
            bg="white", fg="gray")
        self.preview_label.pack(fill=tk.BOTH, expand=True)

        # Buttons
        btn_frame = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        btn_frame.pack(pady=10)

        paste_btn = tk.Button(btn_frame, text="Paste from Clipboard (Cmd+V)",
                             command=self.paste_image,
                             font=("Helvetica", 12, "bold"),
                             bg=AXKAN_COLORS['green'], fg="white",
                             padx=20, pady=10)
        paste_btn.pack(side=tk.LEFT, padx=10)

        browse_btn = tk.Button(btn_frame, text="Browse File",
                              command=self.browse_image,
                              font=("Helvetica", 12),
                              bg=AXKAN_COLORS['cyan'], fg="white",
                              padx=20, pady=10)
        browse_btn.pack(side=tk.LEFT, padx=10)

        self.next_btn = tk.Button(btn_frame, text="Next →",
                                 command=self.show_step2_grid,
                                 font=("Helvetica", 12, "bold"),
                                 bg=AXKAN_COLORS['pink'], fg="white",
                                 padx=20, pady=10,
                                 state=tk.DISABLED)
        self.next_btn.pack(side=tk.RIGHT, padx=10)

    def paste_image(self):
        """Paste image from clipboard"""
        try:
            img = ImageGrab.grabclipboard()

            if img is None:
                messagebox.showwarning("No Image", "No image in clipboard")
                return

            if isinstance(img, list) and len(img) > 0:
                try:
                    if isinstance(img[0], str) and os.path.exists(img[0]):
                        img = PILImage.open(img[0])
                    else:
                        messagebox.showwarning("Invalid", "Could not load from clipboard")
                        return
                except:
                    return

            if isinstance(img, PILImage.Image):
                self.load_image(img)

        except Exception as e:
            messagebox.showerror("Error", f"Could not paste: {e}")

    def browse_image(self):
        """Browse for image file"""
        file_path = filedialog.askopenfilename(
            title="Select Order Image",
            filetypes=[("Image files", "*.png *.jpg *.jpeg *.gif *.bmp *.webp"),
                      ("All files", "*.*")]
        )

        if file_path:
            try:
                img = PILImage.open(file_path)
                self.load_image(img)
            except Exception as e:
                messagebox.showerror("Error", f"Could not load: {e}")

    def load_image(self, img):
        """Load and display the order image"""
        self.order_image = img

        # Auto-detect grid
        analyzer = OrderImageAnalyzer(img)
        self.grid_rows, self.grid_cols = analyzer.detect_grid_layout()

        # Show preview
        preview = img.copy()
        preview.thumbnail((800, 500))

        photo = ImageTk.PhotoImage(preview)
        self.preview_label.config(image=photo, text="")
        self.preview_label.image = photo

        # Enable next button
        self.next_btn.config(state=tk.NORMAL)

        # Show detection info
        messagebox.showinfo("Image Loaded",
            f"Image loaded: {img.width}x{img.height}\n\n"
            f"Detected layout: {self.grid_rows} rows × {self.grid_cols} columns\n"
            f"Total designs: {self.grid_rows * self.grid_cols}\n\n"
            f"Click 'Next' to adjust if needed.")

    def show_step2_grid(self):
        """Step 2: Confirm/adjust grid and crop designs"""
        self.clear_content()

        title = tk.Label(self.content_frame,
            text="Step 2: Confirm Grid Layout",
            font=("Helvetica", 18, "bold"),
            bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'])
        title.pack(pady=10)

        # Grid adjustment
        grid_frame = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        grid_frame.pack(pady=10)

        tk.Label(grid_frame, text="Rows:", font=("Helvetica", 12),
                bg=AXKAN_COLORS['light']).pack(side=tk.LEFT, padx=5)

        self.rows_var = tk.IntVar(value=self.grid_rows)
        rows_spin = tk.Spinbox(grid_frame, from_=1, to=6, width=5,
                               textvariable=self.rows_var, font=("Helvetica", 12))
        rows_spin.pack(side=tk.LEFT, padx=5)

        tk.Label(grid_frame, text="Columns:", font=("Helvetica", 12),
                bg=AXKAN_COLORS['light']).pack(side=tk.LEFT, padx=15)

        self.cols_var = tk.IntVar(value=self.grid_cols)
        cols_spin = tk.Spinbox(grid_frame, from_=1, to=6, width=5,
                               textvariable=self.cols_var, font=("Helvetica", 12))
        cols_spin.pack(side=tk.LEFT, padx=5)

        preview_btn = tk.Button(grid_frame, text="Preview Crop",
                               command=self.preview_crop,
                               font=("Helvetica", 11),
                               bg=AXKAN_COLORS['orange'], fg="white")
        preview_btn.pack(side=tk.LEFT, padx=20)

        # Preview area for cropped designs
        self.crop_preview_frame = tk.Frame(self.content_frame, bg="white")
        self.crop_preview_frame.pack(fill=tk.BOTH, expand=True, pady=10)

        # Initial preview
        self.preview_crop()

        # Buttons
        btn_frame = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        btn_frame.pack(pady=10)

        back_btn = tk.Button(btn_frame, text="← Back",
                            command=self.show_step1_upload,
                            font=("Helvetica", 12),
                            padx=20, pady=10)
        back_btn.pack(side=tk.LEFT, padx=10)

        next_btn = tk.Button(btn_frame, text="Next: Enter Details →",
                            command=self.show_step3_details,
                            font=("Helvetica", 12, "bold"),
                            bg=AXKAN_COLORS['pink'], fg="white",
                            padx=20, pady=10)
        next_btn.pack(side=tk.RIGHT, padx=10)

    def preview_crop(self):
        """Preview the cropped designs"""
        # Clear preview
        for widget in self.crop_preview_frame.winfo_children():
            widget.destroy()

        rows = self.rows_var.get()
        cols = self.cols_var.get()

        # Crop designs
        analyzer = OrderImageAnalyzer(self.order_image)
        self.cropped_designs = analyzer.crop_designs(rows, cols)

        # Show previews in a grid
        canvas = tk.Canvas(self.crop_preview_frame, bg="white")
        scrollbar = tk.Scrollbar(self.crop_preview_frame, orient="horizontal",
                                command=canvas.xview)
        scrollable = tk.Frame(canvas, bg="white")

        scrollable.bind("<Configure>",
                       lambda e: canvas.configure(scrollregion=canvas.bbox("all")))

        canvas.create_window((0, 0), window=scrollable, anchor="nw")
        canvas.configure(xscrollcommand=scrollbar.set)

        canvas.pack(side="top", fill="both", expand=True)
        scrollbar.pack(side="bottom", fill="x")

        # Display each cropped design
        self.design_photos = []  # Keep references
        for i, design in enumerate(self.cropped_designs):
            frame = tk.Frame(scrollable, bg="white", relief=tk.RAISED, borderwidth=2)
            frame.pack(side=tk.LEFT, padx=5, pady=5)

            # Thumbnail
            thumb = design['image'].copy()
            thumb.thumbnail((150, 150))
            photo = ImageTk.PhotoImage(thumb)
            self.design_photos.append(photo)

            img_label = tk.Label(frame, image=photo, bg="white")
            img_label.pack(pady=5)

            num_label = tk.Label(frame, text=f"Design {i+1}",
                                font=("Helvetica", 10, "bold"),
                                bg="white")
            num_label.pack()

        # Update grid vars
        self.grid_rows = rows
        self.grid_cols = cols

    def show_step3_details(self):
        """Step 3: Enter order details and types/quantities"""
        self.clear_content()

        title = tk.Label(self.content_frame,
            text="Step 3: Enter Order Details",
            font=("Helvetica", 18, "bold"),
            bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'])
        title.pack(pady=10)

        # Order name
        name_frame = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        name_frame.pack(fill=tk.X, pady=5)

        tk.Label(name_frame, text="Order Name:", font=("Helvetica", 12, "bold"),
                bg=AXKAN_COLORS['light']).pack(side=tk.LEFT)

        self.order_name_entry = tk.Entry(name_frame, font=("Helvetica", 12), width=40)
        self.order_name_entry.pack(side=tk.LEFT, padx=10)

        # Instructions
        instr_frame = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        instr_frame.pack(fill=tk.X, pady=5)

        tk.Label(instr_frame, text="Instructions:", font=("Helvetica", 12, "bold"),
                bg=AXKAN_COLORS['light']).pack(side=tk.LEFT)

        self.instructions_entry = tk.Entry(instr_frame, font=("Helvetica", 12), width=40)
        self.instructions_entry.pack(side=tk.LEFT, padx=10)

        # Quick fill buttons
        quick_frame = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        quick_frame.pack(fill=tk.X, pady=10)

        tk.Label(quick_frame, text="Quick fill all quantities:",
                font=("Helvetica", 11), bg=AXKAN_COLORS['light']).pack(side=tk.LEFT)

        for qty in [50, 100, 200]:
            btn = tk.Button(quick_frame, text=str(qty),
                           command=lambda q=qty: self.fill_all_quantities(q),
                           font=("Helvetica", 10, "bold"),
                           bg=AXKAN_COLORS['cyan'], fg="white", width=5)
            btn.pack(side=tk.LEFT, padx=5)

        # Design details (scrollable)
        details_container = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        details_container.pack(fill=tk.BOTH, expand=True, pady=10)

        canvas = tk.Canvas(details_container, bg=AXKAN_COLORS['light'])
        scrollbar = tk.Scrollbar(details_container, orient="vertical", command=canvas.yview)
        self.details_frame = tk.Frame(canvas, bg=AXKAN_COLORS['light'])

        self.details_frame.bind("<Configure>",
                               lambda e: canvas.configure(scrollregion=canvas.bbox("all")))

        canvas.create_window((0, 0), window=self.details_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Create entries for each design
        self.type_entries = {}
        self.qty_entries = {}
        self.design_photos = []

        product_types = ["Imanes", "Llaveros", "Destapadores", "Portallaves", "Imanes chicos"]

        cols = 3
        for i, design in enumerate(self.cropped_designs):
            row = i // cols
            col = i % cols

            frame = tk.Frame(self.details_frame, bg="white",
                           relief=tk.RAISED, borderwidth=2, padx=10, pady=10)
            frame.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")

            # Color accent
            color_idx = i % 5
            accent_colors = [AXKAN_COLORS['pink'], AXKAN_COLORS['green'],
                           AXKAN_COLORS['orange'], AXKAN_COLORS['cyan'],
                           AXKAN_COLORS['red']]

            header = tk.Label(frame, text=f"Design {i+1}",
                            font=("Helvetica", 10, "bold"),
                            bg=accent_colors[color_idx], fg="white")
            header.pack(fill=tk.X)

            # Thumbnail
            thumb = design['image'].copy()
            thumb.thumbnail((120, 100))
            photo = ImageTk.PhotoImage(thumb)
            self.design_photos.append(photo)

            img_label = tk.Label(frame, image=photo, bg="white")
            img_label.pack(pady=5)

            # Type dropdown
            type_frame = tk.Frame(frame, bg="white")
            type_frame.pack(fill=tk.X)
            tk.Label(type_frame, text="Tipo:", font=("Helvetica", 9),
                    bg="white").pack(side=tk.LEFT)

            type_var = tk.StringVar(value=product_types[0])
            type_menu = tk.OptionMenu(type_frame, type_var, *product_types)
            type_menu.config(width=12)
            type_menu.pack(side=tk.LEFT, padx=5)
            self.type_entries[i] = type_var

            # Quantity
            qty_frame = tk.Frame(frame, bg="white")
            qty_frame.pack(fill=tk.X)
            tk.Label(qty_frame, text="Cantidad:", font=("Helvetica", 9),
                    bg="white").pack(side=tk.LEFT)

            qty_entry = tk.Entry(qty_frame, font=("Helvetica", 10), width=8)
            qty_entry.pack(side=tk.LEFT, padx=5)
            self.qty_entries[i] = qty_entry

        # Buttons
        btn_frame = tk.Frame(self.content_frame, bg=AXKAN_COLORS['light'])
        btn_frame.pack(pady=10)

        back_btn = tk.Button(btn_frame, text="← Back",
                            command=self.show_step2_grid,
                            font=("Helvetica", 12),
                            padx=20, pady=10)
        back_btn.pack(side=tk.LEFT, padx=10)

        generate_btn = tk.Button(btn_frame, text="Generate PDF",
                                command=self.generate_pdf,
                                font=("Helvetica", 14, "bold"),
                                bg=AXKAN_COLORS['pink'], fg="white",
                                padx=30, pady=15)
        generate_btn.pack(side=tk.RIGHT, padx=10)

    def fill_all_quantities(self, qty):
        """Fill all quantity entries with the same value"""
        for entry in self.qty_entries.values():
            entry.delete(0, tk.END)
            entry.insert(0, str(qty))

    def generate_pdf(self):
        """Generate the PDF with all data"""
        order_name = self.order_name_entry.get().strip()
        if not order_name:
            messagebox.showwarning("Missing", "Please enter an order name")
            return

        instructions = self.instructions_entry.get().strip()

        # Save cropped images
        temp_dir = Path("temp_images")
        temp_dir.mkdir(exist_ok=True)

        designs = []
        for i, design in enumerate(self.cropped_designs):
            # Save image
            img_path = temp_dir / f"design_{i}.jpg"

            # Convert to RGB if needed
            img = design['image']
            if img.mode == 'RGBA':
                bg = PILImage.new('RGB', img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[3])
                img = bg
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            img.save(str(img_path), "JPEG", quality=90)

            # Get type and quantity
            tipo = self.type_entries[i].get()
            try:
                qty = int(self.qty_entries[i].get())
            except:
                qty = 0

            designs.append({
                'type': tipo,
                'quantity': qty,
                'image_path': str(img_path)
            })

        # Generate PDF
        try:
            generator = AxkanPDFGenerator()
            output_path = generator.generate_pdf(order_name, instructions, designs)

            messagebox.showinfo("Success",
                f"PDF Generated!\n\nSaved to:\n{output_path}")

            # Open PDF
            self.open_file(output_path)

            # Ask to create another
            if messagebox.askyesno("Continue?", "Create another order?"):
                self.order_image = None
                self.cropped_designs = []
                self.show_step1_upload()
            else:
                self.root.quit()
                self.root.destroy()

        except Exception as e:
            messagebox.showerror("Error", f"Failed to generate PDF:\n{e}")

    def open_file(self, filepath):
        """Open file with system default"""
        try:
            if sys.platform == 'darwin':
                subprocess.run(['open', filepath])
            elif sys.platform == 'win32':
                os.startfile(filepath)
            else:
                subprocess.run(['xdg-open', filepath])
        except:
            pass

    def run(self):
        """Run the application"""
        self.root.mainloop()


class AxkanPDFGenerator:
    """PDF generator with AXKAN branding"""

    def __init__(self):
        self.load_config()

    def load_config(self):
        """Load config"""
        config_path = Path(__file__).parent / 'config.yaml'
        with open(config_path, 'r', encoding='utf-8') as f:
            self.config = yaml.safe_load(f)

        self.page_width, self.page_height = A4
        self.margin = self.config['layout']['margin'] * mm

    def generate_pdf(self, order_name, instructions, designs):
        """Generate PDF with designs"""
        output_dir = Path(self.config['output_path']).expanduser()
        output_dir.mkdir(parents=True, exist_ok=True)

        safe_name = "".join(c if c.isalnum() or c in ' -_' else '-' for c in order_name)
        output_path = output_dir / f"{safe_name}.pdf"

        c = canvas.Canvas(str(output_path), pagesize=(self.page_width, self.page_height))

        self._draw_header(c, order_name, instructions, len(designs))
        self._draw_designs(c, designs)

        c.save()
        return str(output_path)

    def _draw_header(self, c, order_name, instructions, num_designs):
        """Draw header with AXKAN branding"""
        pink = colors.HexColor(AXKAN_COLORS['pink'])
        green = colors.HexColor(AXKAN_COLORS['green'])
        orange = colors.HexColor(AXKAN_COLORS['orange'])
        cyan = colors.HexColor(AXKAN_COLORS['cyan'])
        red = colors.HexColor(AXKAN_COLORS['red'])
        dark = colors.HexColor(AXKAN_COLORS['dark'])
        light = colors.HexColor(AXKAN_COLORS['light'])

        # AXKAN logo
        axkan = [('A', pink), ('X', green), ('K', orange), ('A', cyan), ('N', red)]
        x = self.margin
        c.setFont("Helvetica-Bold", 36)
        for letter, color in axkan:
            c.setFillColor(color)
            c.drawString(x, self.page_height - 50, letter)
            x += 28

        # Title
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(self.page_width / 2, self.page_height - 50, "ORDEN DE COMPRA")

        # Order info
        y = self.page_height - 90
        c.setFillColor(colors.white)
        c.setStrokeColor(pink)
        c.setLineWidth(2)
        c.roundRect(self.margin, y - 25, self.page_width - 2*self.margin, 25, 5, fill=True, stroke=True)

        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 10)
        info = f"Order: {order_name} | Designs: {num_designs} | Date: {datetime.now().strftime('%Y-%m-%d')}"
        c.drawString(self.margin + 10, y - 17, info)

        # Instructions
        if instructions:
            y -= 35
            c.setFont("Helvetica-Bold", 10)
            c.drawString(self.margin, y, "Instructions:")
            c.setFillColor(light)
            c.setStrokeColor(cyan)
            c.roundRect(self.margin + 80, y - 20, self.page_width - 2*self.margin - 80, 25, 3, fill=True, stroke=True)
            c.setFillColor(colors.black)
            c.setFont("Helvetica", 10)
            c.drawString(self.margin + 85, y - 10, instructions)

        # CAJAS TOTALES
        y -= 50
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(self.margin, y + 5, "CAJAS TOTALES:")

        c.setFillColor(light)
        c.setStrokeColor(orange)
        c.setLineWidth(3)
        c.roundRect(self.margin + 130, y - 15, 150, 35, 5, fill=True, stroke=True)

        form = c.acroForm
        form.textfield(name="cajas_totales", x=self.margin + 130, y=y - 15,
                      width=150, height=35, borderWidth=0,
                      fontSize=16, fontName='Helvetica-Bold')

        # Rainbow separator
        y -= 30
        segment_width = (self.page_width - 2*self.margin) / 5
        for i, color in enumerate([pink, green, orange, cyan, red]):
            c.setStrokeColor(color)
            c.setLineWidth(3)
            c.line(self.margin + i*segment_width, y,
                   self.margin + (i+1)*segment_width, y)

    def _draw_designs(self, c, designs):
        """Draw design grid with pagination (max 9 per page)"""
        num = len(designs)
        cols = 3
        max_per_page = 9

        available_width = self.page_width - 2*self.margin
        available_height = self.page_height - self.margin - 230

        spacing = 10

        accent_colors = [
            colors.HexColor(AXKAN_COLORS['pink']),
            colors.HexColor(AXKAN_COLORS['green']),
            colors.HexColor(AXKAN_COLORS['orange']),
            colors.HexColor(AXKAN_COLORS['cyan']),
            colors.HexColor(AXKAN_COLORS['red'])
        ]

        items_drawn = 0

        for i, design in enumerate(designs):
            # New page when needed
            if items_drawn > 0 and items_drawn % max_per_page == 0:
                c.showPage()

            # Calculate layout for current page
            if items_drawn % max_per_page == 0:
                remaining = num - items_drawn
                items_on_page = min(remaining, max_per_page)
                rows_on_page = (items_on_page + cols - 1) // cols

                cell_width = (available_width - (cols-1)*spacing) / cols
                cell_height = (available_height - (rows_on_page-1)*spacing) / rows_on_page
                cell_height = max(cell_height, 180)

                start_x = self.margin
                if items_drawn == 0:
                    start_y = self.page_height - 230
                else:
                    start_y = self.page_height - self.margin

                current_x = start_x
                current_y = start_y
                items_in_row = 0

            page_idx = items_drawn % max_per_page
            row = page_idx // cols
            col = page_idx % cols

            x = start_x + col * (cell_width + spacing)
            y = start_y - row * (cell_height + spacing)

            accent = accent_colors[i % 5]

            # Cell border
            c.setStrokeColor(accent)
            c.setLineWidth(2)
            c.rect(x, y - cell_height, cell_width, cell_height)

            # Type header
            c.setFillColor(accent)
            c.rect(x, y - 18, cell_width, 18, fill=True, stroke=False)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x + 5, y - 13, f"Tipo: {design.get('type', '')}")

            # Image - use boundary-based positioning
            img_path = design.get('image_path')
            if img_path and os.path.exists(img_path):
                try:
                    img = PILImage.open(img_path)
                    iw, ih = img.size

                    top_of_image_zone = y - 20
                    bottom_of_image_zone = y - cell_height + 50

                    max_w = cell_width - 10
                    max_h = top_of_image_zone - bottom_of_image_zone

                    scale = min(max_w/iw, max_h/ih)
                    dw, dh = iw*scale, ih*scale

                    ix = x + (cell_width - dw) / 2
                    iy = bottom_of_image_zone + (max_h - dh) / 2

                    c.drawImage(img_path, ix, iy, width=dw, height=dh,
                               preserveAspectRatio=True, mask='auto')
                except:
                    pass

            # Quantity
            dark = colors.HexColor(AXKAN_COLORS['dark'])
            light = colors.HexColor(AXKAN_COLORS['light'])

            qty_y = y - cell_height + 40
            c.setFillColor(dark)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x + 5, qty_y, "Requeridos:")

            c.setFillColor(light)
            c.setStrokeColor(accent)
            c.setLineWidth(1)
            c.rect(x + 60, qty_y - 12, cell_width - 70, 15, fill=True, stroke=True)

            c.setFillColor(colors.black)
            c.setFont("Helvetica", 10)
            c.drawString(x + 65, qty_y - 8, str(design.get('quantity', '')))

            # Contados field
            cnt_y = qty_y - 20
            c.setFillColor(dark)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x + 5, cnt_y, "Contados:")

            c.setFillColor(light)
            c.rect(x + 60, cnt_y - 12, cell_width - 70, 15, fill=True, stroke=True)

            form = c.acroForm
            form.textfield(name=f"contados_{i}", x=x + 60, y=cnt_y - 12,
                          width=cell_width - 70, height=15, borderWidth=0,
                          fontSize=10, fontName='Helvetica')

            items_drawn += 1


def main():
    print("=" * 60)
    print("AXKAN - Integrated Order System")
    print("=" * 60)
    print()
    print("This system will:")
    print("  1. Accept order image (paste or upload)")
    print("  2. Automatically crop individual designs")
    print("  3. Let you enter types and quantities")
    print("  4. Generate PDF with AXKAN branding")
    print()

    app = IntegratedOrderGUI()
    app.run()


if __name__ == '__main__':
    main()

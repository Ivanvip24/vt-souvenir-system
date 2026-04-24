#!/usr/bin/env python3
"""
AXKAN PDF Reference Sheet Generator
Generates styled PDFs with Axkan branding for souvenir orders

Features:
- Colorful Axkan branding (pink, green, orange, cyan, red)
- Interactive GUI for order details
- Image copy-paste support
- Editable PDF form fields
- Auto-generated from AI-extracted order data

Usage:
    python generate_axkan.py                    # Interactive GUI mode
    python generate_axkan.py --auto <json>      # Auto-generate from JSON data
"""

import os
import subprocess
import sys
import json
import argparse
import tkinter as tk
from tkinter import simpledialog, messagebox, filedialog
from datetime import datetime
from pathlib import Path
import io

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfform
from PIL import Image as PILImage, ImageGrab
import yaml


# AXKAN Brand Colors
AXKAN_COLORS = {
    'pink': '#E91E63',      # A
    'green': '#7CB342',     # X
    'orange': '#FF9800',    # K
    'cyan': '#00BCD4',      # A
    'red': '#F44336',       # N
    'dark': '#333333',
    'light': '#F5F5F5',
    'white': '#FFFFFF'
}


class ImageEditorGUI:
    """GUI for adding images to order slots with copy-paste support"""

    def __init__(self, num_designs, order_name, prefilled_data=None):
        """
        Initialize the image editor

        Args:
            num_designs: Number of design slots to show
            order_name: Name of the order
            prefilled_data: Optional dict with pre-filled data for each slot
                           {slot_num: {'type': str, 'quantity': int, 'image_path': str}}
        """
        self.num_designs = num_designs
        self.order_name = order_name
        self.prefilled_data = prefilled_data or {}
        self.images = {}
        self.image_paths = {}
        self.slot_types = {}      # {slot_num: type_string}
        self.slot_quantities = {} # {slot_num: quantity}
        self.selected_slot = None

        self.root = tk.Tk()
        self.root.title(f"AXKAN - {order_name}")
        self.root.geometry("950x750")
        self.root.configure(bg=AXKAN_COLORS['light'])

        self.setup_ui()

    def setup_ui(self):
        """Setup the user interface with Axkan branding"""
        # Header with AXKAN logo
        header = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], height=70)
        header.pack(fill=tk.X)
        header.pack_propagate(False)

        # AXKAN text logo
        logo_frame = tk.Frame(header, bg=AXKAN_COLORS['dark'])
        logo_frame.pack(pady=10)

        letters = [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                   ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                   ('N', AXKAN_COLORS['red'])]

        for letter, color in letters:
            lbl = tk.Label(logo_frame, text=letter, font=("Arial Black", 24, "bold"),
                          fg=color, bg=AXKAN_COLORS['dark'])
            lbl.pack(side=tk.LEFT)

        # Order info
        info_label = tk.Label(header, text=f"Order: {self.order_name}",
                             font=("Helvetica", 11),
                             fg="white", bg=AXKAN_COLORS['dark'])
        info_label.pack()

        # Instructions
        instr = tk.Label(self.root,
            text="Click a slot and press Cmd+V (or Ctrl+V) to paste, or click 'Browse' to select a file",
            font=("Helvetica", 10),
            bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'])
        instr.pack(pady=5)

        # Scrollable canvas for slots
        canvas_frame = tk.Frame(self.root, bg=AXKAN_COLORS['light'])
        canvas_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.canvas = tk.Canvas(canvas_frame, bg=AXKAN_COLORS['light'])
        scrollbar = tk.Scrollbar(canvas_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas, bg=AXKAN_COLORS['light'])

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )

        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Create slots
        self.slot_frames = {}
        self.slot_labels = {}
        self.type_entries = {}
        self.qty_entries = {}

        cols = 3
        for i in range(self.num_designs):
            row = i // cols
            col = i % cols
            self.create_slot(i, row, col)

        # Bottom buttons
        button_frame = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], pady=10)
        button_frame.pack(fill=tk.X)

        generate_btn = tk.Button(button_frame, text="Generate PDF",
                                command=self.generate_pdf,
                                font=("Helvetica", 12, "bold"),
                                bg=AXKAN_COLORS['pink'], fg="white",
                                padx=20, pady=10)
        generate_btn.pack(side=tk.RIGHT, padx=10)

        cancel_btn = tk.Button(button_frame, text="Cancel",
                              command=self.cancel,
                              font=("Helvetica", 12),
                              padx=20, pady=10)
        cancel_btn.pack(side=tk.RIGHT, padx=10)

        # Bind keyboard shortcuts
        self.root.bind('<Command-v>', self.paste_image)
        self.root.bind('<Command-V>', self.paste_image)
        self.root.bind('<Control-v>', self.paste_image)
        self.root.bind('<Control-V>', self.paste_image)
        self.root.bind_all('<Command-v>', self.paste_image)
        self.root.bind_all('<Command-V>', self.paste_image)
        self.root.bind_all('<Control-v>', self.paste_image)
        self.root.bind_all('<Control-V>', self.paste_image)

    def create_slot(self, slot_num, row, col):
        """Create a single image slot with type and quantity fields"""
        frame = tk.Frame(self.scrollable_frame,
                        relief=tk.RAISED, borderwidth=2,
                        bg="white", padx=8, pady=8)
        frame.grid(row=row, column=col, padx=8, pady=8, sticky="nsew")

        # Slot number label with Axkan color
        color_idx = slot_num % 5
        slot_colors = [AXKAN_COLORS['pink'], AXKAN_COLORS['green'],
                       AXKAN_COLORS['orange'], AXKAN_COLORS['cyan'], AXKAN_COLORS['red']]

        title = tk.Label(frame, text=f"Design {slot_num + 1}",
                        font=("Helvetica", 10, "bold"),
                        bg=slot_colors[color_idx], fg="white", pady=4)
        title.pack(fill=tk.X)

        # Type input
        type_frame = tk.Frame(frame, bg="white")
        type_frame.pack(fill=tk.X, pady=2)

        tk.Label(type_frame, text="Tipo:", font=("Helvetica", 9, "bold"),
                bg="white").pack(side=tk.LEFT)

        type_entry = tk.Entry(type_frame, font=("Helvetica", 9), width=15)
        type_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=3)
        self.type_entries[slot_num] = type_entry

        # Pre-fill type if available
        if slot_num in self.prefilled_data and 'type' in self.prefilled_data[slot_num]:
            type_entry.insert(0, self.prefilled_data[slot_num]['type'])

        # Quantity input
        qty_frame = tk.Frame(frame, bg="white")
        qty_frame.pack(fill=tk.X, pady=2)

        tk.Label(qty_frame, text="Requeridos:", font=("Helvetica", 9, "bold"),
                bg="white").pack(side=tk.LEFT)

        qty_entry = tk.Entry(qty_frame, font=("Helvetica", 9), width=8)
        qty_entry.pack(side=tk.LEFT, padx=3)
        self.qty_entries[slot_num] = qty_entry

        # Pre-fill quantity if available
        if slot_num in self.prefilled_data and 'quantity' in self.prefilled_data[slot_num]:
            qty_entry.insert(0, str(self.prefilled_data[slot_num]['quantity']))

        # Image preview area
        img_label = tk.Label(frame, text="[No image]\nClick & Cmd+V",
                           width=18, height=6,
                           relief=tk.SUNKEN, bg="#f8f8f8",
                           cursor="hand2")
        img_label.pack(pady=5)
        img_label.bind("<Button-1>", lambda e, s=slot_num: self.select_slot(s))

        # Buttons
        btn_frame = tk.Frame(frame, bg="white")
        btn_frame.pack(fill=tk.X)

        paste_btn = tk.Button(btn_frame, text="Paste (Cmd+V)",
                             command=lambda s=slot_num: self.paste_to_slot(s),
                             bg="#ccffcc", font=("Helvetica", 8))
        paste_btn.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=1)

        browse_btn = tk.Button(btn_frame, text="Browse",
                              command=lambda s=slot_num: self.browse_image(s),
                              bg=AXKAN_COLORS['light'], font=("Helvetica", 8))
        browse_btn.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=1)

        self.slot_frames[slot_num] = frame
        self.slot_labels[slot_num] = img_label

        # Load pre-filled image if available
        if slot_num in self.prefilled_data and 'image_path' in self.prefilled_data[slot_num]:
            img_path = self.prefilled_data[slot_num]['image_path']
            if os.path.exists(img_path):
                try:
                    img = PILImage.open(img_path)
                    self.add_image_to_slot(slot_num, img)
                except Exception:
                    pass

    def select_slot(self, slot_num):
        """Select a slot for pasting"""
        for frame in self.slot_frames.values():
            frame.config(bg="white", highlightbackground="white")

        self.selected_slot = slot_num
        self.slot_frames[slot_num].config(bg="#FFFFCC", highlightbackground=AXKAN_COLORS['pink'],
                                         highlightthickness=3)

    def get_clipboard_image(self):
        """Get image from clipboard"""
        try:
            img = ImageGrab.grabclipboard()
            if img and isinstance(img, PILImage.Image):
                return img

            if isinstance(img, list) and len(img) > 0:
                try:
                    first_item = img[0]
                    if isinstance(first_item, str) and os.path.exists(first_item):
                        return PILImage.open(first_item)
                except Exception:
                    pass

        except Exception as e:
            print(f"Clipboard access failed: {e}")

        return None

    def paste_to_slot(self, slot_num):
        """Paste image to specific slot"""
        self.select_slot(slot_num)
        self.paste_image()

    def paste_image(self, event=None):
        """Paste image from clipboard"""
        if self.selected_slot is None:
            messagebox.showwarning("No slot selected",
                                  "Please click on a slot first, then press Cmd+V")
            return

        try:
            img = self.get_clipboard_image()

            if img is None:
                messagebox.showerror("No image in clipboard",
                                   "Please copy an image first (Cmd+C)\n\n"
                                   "Or use the 'Browse' button to select a file.")
                return

            self.add_image_to_slot(self.selected_slot, img)

        except Exception as e:
            messagebox.showerror("Error", f"Could not paste image:\n{e}")

    def browse_image(self, slot_num):
        """Browse for an image file"""
        file_path = filedialog.askopenfilename(
            title=f"Select image for Design {slot_num + 1}",
            filetypes=[
                ("Image files", "*.png *.jpg *.jpeg *.gif *.bmp *.webp"),
                ("All files", "*.*")
            ]
        )

        if file_path:
            try:
                img = PILImage.open(file_path)
                self.add_image_to_slot(slot_num, img)
            except Exception as e:
                messagebox.showerror("Error", f"Could not load image:\n{e}")

    def add_image_to_slot(self, slot_num, img):
        """Add an image to a slot"""
        # Compress large images
        if img.width > 2000 or img.height > 2000:
            img.thumbnail((2000, 2000), PILImage.Resampling.LANCZOS)

        # Convert to RGB if necessary
        if img.mode == 'RGBA':
            background = PILImage.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')

        # Save temp file
        temp_dir = Path("temp_images")
        temp_dir.mkdir(exist_ok=True)

        temp_path = temp_dir / f"slot_{slot_num}.jpg"
        img.save(str(temp_path), "JPEG", quality=85, optimize=True)

        self.image_paths[slot_num] = str(temp_path)

        # Update preview
        img_copy = img.copy()
        img_copy.thumbnail((130, 100))

        from PIL import ImageTk
        photo = ImageTk.PhotoImage(img_copy)

        self.slot_labels[slot_num].config(image=photo, text="")
        self.slot_labels[slot_num].image = photo

        # Visual feedback
        self.slot_frames[slot_num].config(bg="#ccffcc")

    def generate_pdf(self):
        """Collect data and generate PDF"""
        # Collect type and quantity data from entries
        for slot_num in range(self.num_designs):
            type_val = self.type_entries[slot_num].get().strip()
            qty_val = self.qty_entries[slot_num].get().strip()

            self.slot_types[slot_num] = type_val
            try:
                self.slot_quantities[slot_num] = int(qty_val) if qty_val else 0
            except ValueError:
                self.slot_quantities[slot_num] = 0

        self.result = "generate"
        self.root.quit()
        self.root.destroy()

    def cancel(self):
        """Cancel and exit"""
        self.result = "cancel"
        self.root.quit()
        self.root.destroy()

    def run(self):
        """Run the GUI and return collected data"""
        self.result = None
        self.root.mainloop()

        if self.result == "generate":
            return {
                'image_paths': self.image_paths,
                'types': self.slot_types,
                'quantities': self.slot_quantities
            }
        else:
            return None


class UnifiedOrderDialog:
    """Unified dialog for order name, instructions, and number of designs"""

    def __init__(self):
        self.result = None
        self.root = None

    def show(self):
        """Show the unified dialog and return results"""
        self.root = tk.Tk()
        self.root.title("AXKAN - New Order")

        window_width = 500
        window_height = 420
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        self.root.geometry(f"{window_width}x{window_height}+{x}+{y}")

        main_frame = tk.Frame(self.root, bg="white", padx=20, pady=15)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Header with AXKAN logo
        header = tk.Frame(main_frame, bg=AXKAN_COLORS['dark'], pady=10)
        header.pack(fill=tk.X, pady=(0, 15))

        logo_frame = tk.Frame(header, bg=AXKAN_COLORS['dark'])
        logo_frame.pack()

        letters = [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                   ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                   ('N', AXKAN_COLORS['red'])]

        for letter, color in letters:
            lbl = tk.Label(logo_frame, text=letter, font=("Arial Black", 20, "bold"),
                          fg=color, bg=AXKAN_COLORS['dark'])
            lbl.pack(side=tk.LEFT)

        # Order Name
        name_frame = tk.Frame(main_frame, bg="white")
        name_frame.pack(fill=tk.X, pady=5)

        tk.Label(name_frame, text="Order Name:",
                font=("Helvetica", 11, "bold"),
                bg="white", fg=AXKAN_COLORS['dark']).pack(anchor="w")

        self.name_entry = tk.Entry(name_frame, font=("Helvetica", 12),
                                   relief=tk.SOLID, borderwidth=1)
        self.name_entry.pack(fill=tk.X, pady=(3, 0), ipady=5)
        self.name_entry.focus_set()

        # Instructions
        instr_frame = tk.Frame(main_frame, bg="white")
        instr_frame.pack(fill=tk.X, pady=10)

        tk.Label(instr_frame, text="Instructions (optional):",
                font=("Helvetica", 11, "bold"),
                bg="white", fg=AXKAN_COLORS['dark']).pack(anchor="w")

        tk.Label(instr_frame, text="e.g., '100 pzas of each design'",
                font=("Helvetica", 9, "italic"),
                bg="white", fg="gray").pack(anchor="w")

        self.instr_entry = tk.Entry(instr_frame, font=("Helvetica", 12),
                                    relief=tk.SOLID, borderwidth=1)
        self.instr_entry.pack(fill=tk.X, pady=(3, 0), ipady=5)

        # Number of Designs
        designs_frame = tk.Frame(main_frame, bg="white")
        designs_frame.pack(fill=tk.X, pady=10)

        tk.Label(designs_frame, text="Number of Designs:",
                font=("Helvetica", 11, "bold"),
                bg="white", fg=AXKAN_COLORS['dark']).pack(anchor="w", pady=(0, 5))

        quick_frame = tk.Frame(designs_frame, bg="white")
        quick_frame.pack(fill=tk.X)

        self.selected_designs = tk.IntVar()
        self.selected_designs.set(0)

        common_values = [3, 5, 6, 9]
        btn_colors = [AXKAN_COLORS['pink'], AXKAN_COLORS['green'],
                      AXKAN_COLORS['orange'], AXKAN_COLORS['cyan']]

        for i, value in enumerate(common_values):
            btn = tk.Button(quick_frame, text=str(value),
                          command=lambda v=value: self.select_design_count(v),
                          width=6, height=2, font=("Helvetica", 14, "bold"),
                          bg=btn_colors[i], fg="white")
            btn.pack(side=tk.LEFT, padx=5)

        tk.Label(quick_frame, text="Other:", font=("Helvetica", 10),
                bg="white").pack(side=tk.LEFT, padx=(15, 5))

        self.custom_entry = tk.Entry(quick_frame, width=6, font=("Helvetica", 12),
                                     relief=tk.SOLID, borderwidth=1)
        self.custom_entry.pack(side=tk.LEFT, ipady=3)
        self.custom_entry.bind('<KeyRelease>', self.on_custom_change)

        self.selected_label = tk.Label(designs_frame, text="Selected: -",
                                       font=("Helvetica", 10),
                                       bg="white", fg=AXKAN_COLORS['pink'])
        self.selected_label.pack(anchor="w", pady=(8, 0))

        # Buttons
        button_frame = tk.Frame(main_frame, bg="white")
        button_frame.pack(fill=tk.X, pady=(20, 0))

        cancel_btn = tk.Button(button_frame, text="Cancel",
                              command=self.cancel,
                              font=("Helvetica", 12),
                              width=12, height=2)
        cancel_btn.pack(side=tk.LEFT)

        create_btn = tk.Button(button_frame, text="Continue",
                              command=self.submit,
                              font=("Helvetica", 12, "bold"),
                              bg=AXKAN_COLORS['pink'], fg="white",
                              width=15, height=2)
        create_btn.pack(side=tk.RIGHT)

        self.root.bind('<Return>', lambda e: self.submit())
        self.root.bind('<Escape>', lambda e: self.cancel())

        self.root.mainloop()
        return self.result

    def select_design_count(self, value):
        """Select a design count"""
        self.selected_designs.set(value)
        self.custom_entry.delete(0, tk.END)
        self.selected_label.config(text=f"Selected: {value} designs")

    def on_custom_change(self, event):
        """Handle custom entry change"""
        try:
            value = int(self.custom_entry.get())
            if value > 0:
                self.selected_designs.set(value)
                self.selected_label.config(text=f"Selected: {value} designs")
        except ValueError:
            pass

    def submit(self):
        """Submit the form"""
        order_name = self.name_entry.get().strip()
        instructions = self.instr_entry.get().strip()
        num_designs = self.selected_designs.get()

        if not order_name:
            messagebox.showwarning("Missing Information", "Please enter an order name.")
            self.name_entry.focus_set()
            return

        if num_designs <= 0:
            messagebox.showwarning("Missing Information", "Please select the number of designs.")
            return

        self.result = {
            'order_name': order_name,
            'instructions': instructions,
            'num_designs': num_designs
        }
        self.root.quit()
        self.root.destroy()

    def cancel(self):
        """Cancel the dialog"""
        self.result = None
        self.root.quit()
        self.root.destroy()


class AxkanPDFGenerator:
    """PDF generator with Axkan branding"""

    def __init__(self):
        self.load_config()

    def load_config(self):
        """Load configuration"""
        config_path = Path(__file__).parent / 'config.yaml'
        with open(config_path, 'r', encoding='utf-8') as f:
            self.config = yaml.safe_load(f)

        if self.config['layout']['page_size'] == 'A4':
            self.page_width, self.page_height = A4

        self.margin = self.config['layout']['margin'] * mm
        self.columns = self.config['layout']['columns']

    def ask_order_details(self):
        """Show dialog for order details"""
        dialog = UnifiedOrderDialog()
        return dialog.show()

    def generate_pdf(self, order_name, instructions, num_designs, slot_data=None):
        """
        Generate PDF with Axkan branding

        Args:
            order_name: Name of the order
            instructions: Order instructions
            num_designs: Number of designs
            slot_data: Optional dict with:
                - image_paths: {slot_num: path}
                - types: {slot_num: type_string}
                - quantities: {slot_num: quantity}
        """
        output_dir = Path(self.config['output_path']).expanduser()

        try:
            output_dir.mkdir(parents=True, exist_ok=True)
            test_file = output_dir / ".write_test"
            try:
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                raise PermissionError(f"Cannot write to: {output_dir}\nError: {e}")
        except PermissionError:
            raise
        except Exception as e:
            raise Exception(f"Cannot access output directory: {output_dir}\n{e}")

        safe_order_name = order_name.replace('/', '-').replace('\\', '-').replace(':', '-')
        safe_order_name = safe_order_name.replace('*', '-').replace('?', '-').replace('"', '-')
        safe_order_name = safe_order_name.replace('<', '-').replace('>', '-').replace('|', '-')

        output_filename = f"{safe_order_name}.pdf"
        output_path = output_dir / output_filename

        # Create items list
        items = []
        for i in range(num_designs):
            item = {
                'name': f"Design {i+1}",
                'type': "",
                'quantity': 0,
                'image_path': None
            }

            if slot_data:
                if 'image_paths' in slot_data and i in slot_data['image_paths']:
                    item['image_path'] = slot_data['image_paths'][i]
                if 'types' in slot_data and i in slot_data['types']:
                    item['type'] = slot_data['types'][i]
                if 'quantities' in slot_data and i in slot_data['quantities']:
                    item['quantity'] = slot_data['quantities'][i]

            items.append(item)

        # Create PDF
        c = canvas.Canvas(str(output_path), pagesize=(self.page_width, self.page_height))

        self._draw_header(c, order_name, instructions, num_designs)
        self._draw_items_grid(c, items)

        c.save()

        return str(output_path)

    def _draw_header(self, c, order_name, instructions, num_designs):
        """Draw PDF header with Axkan branding"""
        # Colors
        pink = colors.HexColor(AXKAN_COLORS['pink'])
        green = colors.HexColor(AXKAN_COLORS['green'])
        orange = colors.HexColor(AXKAN_COLORS['orange'])
        cyan = colors.HexColor(AXKAN_COLORS['cyan'])
        red = colors.HexColor(AXKAN_COLORS['red'])
        dark = colors.HexColor(AXKAN_COLORS['dark'])
        light = colors.HexColor(AXKAN_COLORS['light'])

        # Draw AXKAN text logo
        axkan_letters = [('A', pink), ('X', green), ('K', orange), ('A', cyan), ('N', red)]
        x = self.margin
        c.setFont("Helvetica-Bold", 36)
        for letter, color in axkan_letters:
            c.setFillColor(color)
            c.drawString(x, self.page_height - 50, letter)
            x += 30

        # Try to draw axkan logo image if available
        logo_path = Path(__file__).parent / 'axkan_logo.png'
        if logo_path.exists():
            try:
                c.drawImage(str(logo_path), self.margin,
                           self.page_height - 65,
                           width=150, height=50,
                           preserveAspectRatio=True, mask='auto')
            except:
                pass

        # Title
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(self.page_width / 2, self.page_height - 50, "ORDEN DE COMPRA")

        # Order info box
        y_pos = self.page_height - 95
        c.setFillColor(colors.white)
        c.setStrokeColor(pink)
        c.setLineWidth(2)
        c.roundRect(self.margin, y_pos - 25, self.page_width - 2 * self.margin, 25, 5, fill=True, stroke=True)

        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 10)
        order_info = f"Order: {order_name} | Designs: {num_designs} | Date: {datetime.now().strftime('%Y-%m-%d')}"
        c.drawString(self.margin + 10, y_pos - 17, order_info)

        # Instructions
        y_pos -= 35
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(self.margin, y_pos, "Instructions:")

        c.setFillColor(light)
        c.setStrokeColor(cyan)
        c.setLineWidth(2)
        box_x = self.margin + 80
        box_width = self.page_width - 2 * self.margin - 80
        c.roundRect(box_x, y_pos - 25, box_width, 30, 3, fill=True, stroke=True)

        c.setFillColor(colors.black)
        c.setFont("Helvetica", 10)
        if instructions:
            c.drawString(box_x + 5, y_pos - 10, instructions)

        # CAJAS TOTALES
        y_pos -= 50
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(self.margin, y_pos + 5, "CAJAS TOTALES:")

        c.setFillColor(light)
        c.setStrokeColor(orange)
        c.setLineWidth(3)
        cajas_x = self.margin + 130
        c.roundRect(cajas_x, y_pos - 15, 150, 35, 5, fill=True, stroke=True)

        form = c.acroForm
        form.textfield(
            name="cajas_totales",
            x=cajas_x,
            y=y_pos - 15,
            width=150,
            height=35,
            borderWidth=0,
            textColor=colors.black,
            fontSize=16,
            fontName='Helvetica-Bold'
        )

        # Separator line with gradient effect (3 colored segments)
        y_pos -= 30
        segment_width = (self.page_width - 2 * self.margin) / 5
        segment_colors = [pink, green, orange, cyan, red]
        c.setLineWidth(3)
        for i, seg_color in enumerate(segment_colors):
            c.setStrokeColor(seg_color)
            c.line(self.margin + i * segment_width, y_pos - 5,
                   self.margin + (i + 1) * segment_width, y_pos - 5)

    def _draw_items_grid(self, c, items):
        """Draw grid of items with dynamic sizing"""
        num_items = len(items)
        columns = 3
        max_per_page = 9

        available_width = self.page_width - 2 * self.margin
        available_height = self.page_height - self.margin - 230

        items_on_page = min(num_items, max_per_page)
        rows_on_page = (items_on_page + columns - 1) // columns

        spacing = 10
        cell_width = (available_width - (columns - 1) * spacing) / columns
        cell_height = (available_height - (rows_on_page - 1) * spacing) / rows_on_page

        cell_width = max(cell_width, 150)
        cell_height = max(cell_height, 180)

        padding = self.config['cell']['padding']

        total_grid_width = cell_width * columns + spacing * (columns - 1)
        total_grid_height = cell_height * rows_on_page + spacing * (rows_on_page - 1)

        start_x = (self.page_width - total_grid_width) / 2
        start_y = self.page_height - 230 - (available_height - total_grid_height) / 2

        current_x = start_x
        current_y = start_y
        items_in_row = 0
        items_drawn = 0

        for idx, item in enumerate(items):
            if items_drawn > 0 and items_drawn % max_per_page == 0:
                c.showPage()

                remaining_items = num_items - items_drawn
                items_on_page = min(remaining_items, max_per_page)
                rows_on_page = (items_on_page + columns - 1) // columns

                cell_height = (available_height - (rows_on_page - 1) * spacing) / rows_on_page
                cell_height = max(cell_height, 180)

                total_grid_height = cell_height * rows_on_page + spacing * (rows_on_page - 1)
                start_y = self.page_height - self.margin - (available_height - total_grid_height) / 2

                current_x = start_x
                current_y = start_y
                items_in_row = 0

            # Draw cell border with colored accent
            color_idx = idx % 5
            accent_colors = [
                colors.HexColor(AXKAN_COLORS['pink']),
                colors.HexColor(AXKAN_COLORS['green']),
                colors.HexColor(AXKAN_COLORS['orange']),
                colors.HexColor(AXKAN_COLORS['cyan']),
                colors.HexColor(AXKAN_COLORS['red'])
            ]

            c.setStrokeColor(accent_colors[color_idx])
            c.setLineWidth(2)
            c.rect(current_x, current_y - cell_height, cell_width, cell_height)

            self._draw_item_cell(c, item, current_x, current_y, cell_width, cell_height, padding, accent_colors[color_idx])

            items_in_row += 1
            items_drawn += 1

            if items_in_row >= columns:
                current_y -= (cell_height + spacing)
                current_x = start_x
                items_in_row = 0
            else:
                current_x += (cell_width + spacing)

    def _draw_item_cell(self, c, item, x, y, width, height, padding, accent_color):
        """Draw a single item cell with Axkan styling"""
        dark = colors.HexColor(AXKAN_COLORS['dark'])
        light = colors.HexColor(AXKAN_COLORS['light'])

        # Type label bar
        c.setFillColor(accent_color)
        c.rect(x, y - padding - 18, width, 18, fill=True, stroke=False)

        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + padding, y - padding - 12, "Tipo:")

        # Type value - editable field
        type_x = x + padding + 30
        type_width = width - 2*padding - 30
        c.setFillColor(light)
        c.rect(type_x, y - padding - 16, type_width, 14, fill=True, stroke=False)

        form = c.acroForm
        form.textfield(
            name=f"type_{id(item)}",
            x=type_x,
            y=y - padding - 16,
            width=type_width,
            height=14,
            borderWidth=0,
            textColor=colors.black,
            fontSize=9,
            fontName='Helvetica',
            value=item.get('type', '')
        )

        # Image
        if item.get('image_path') and os.path.exists(item['image_path']):
            self._draw_image(c, item['image_path'], x, y, width, height, padding)
        else:
            image_y_center = y - padding - 30 - (height - 110) / 2
            c.setFillColor(colors.lightgrey)
            c.setFont("Helvetica", 10)
            c.drawCentredString(x + width/2, image_y_center, "[Image placeholder]")

            c.setStrokeColor(colors.grey)
            c.setLineWidth(0.5)
            image_box_height = height - 110
            c.rect(x + 10, y - padding - 30 - image_box_height, width - 20, image_box_height)

        # Quantity
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 9)
        qty_y = y - height + padding + 45
        c.drawString(x + padding, qty_y - 2, "Requeridos:")

        c.setFillColor(light)
        c.setStrokeColor(accent_color)
        c.setLineWidth(1)
        qty_x = x + padding + 55
        qty_width = width - 2*padding - 55
        c.rect(qty_x, qty_y - 15, qty_width, 15, fill=True, stroke=True)

        form.textfield(
            name=f"quantity_{id(item)}",
            x=qty_x,
            y=qty_y - 15,
            width=qty_width,
            height=15,
            borderWidth=0,
            textColor=colors.black,
            fontSize=10,
            fontName='Helvetica',
            value=str(item.get('quantity', ''))
        )

        # Contados field
        if self.config['form_fields']['enable_editable']:
            field_y = qty_y - 25

            c.setFillColor(dark)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x + padding, field_y - 2, "Contados:")

            c.setFillColor(light)
            c.setStrokeColor(accent_color)
            c.setLineWidth(1)
            counted_x = x + padding + 55
            counted_width = width - 2*padding - 55
            c.rect(counted_x, field_y - 15, counted_width, 15, fill=True, stroke=True)

            form.textfield(
                name=f"counted_{id(item)}",
                x=counted_x,
                y=field_y - 15,
                width=counted_width,
                height=15,
                borderWidth=0,
                textColor=colors.black,
                fontSize=10,
                fontName='Helvetica'
            )

    def _draw_image(self, c, image_path, x, y, cell_width, cell_height, padding):
        """Draw image centered in cell between TIPO bar and Requeridos field"""
        try:
            img = PILImage.open(image_path)
            img_width, img_height = img.size

            # Image zone boundaries (absolute y coordinates)
            top_of_image_zone = y - padding - 20  # below TIPO bar
            bottom_of_image_zone = y - cell_height + padding + 50  # above Requeridos+Contados

            available_width = cell_width - 10
            available_height = top_of_image_zone - bottom_of_image_zone

            scale_width = available_width / img_width
            scale_height = available_height / img_height
            scale = min(scale_width, scale_height)

            display_width = img_width * scale
            display_height = img_height * scale

            # Center image in the available zone
            image_x = x + (cell_width - display_width) / 2
            image_y = bottom_of_image_zone + (available_height - display_height) / 2

            c.drawImage(image_path, image_x, image_y,
                       width=display_width, height=display_height,
                       preserveAspectRatio=True, mask='auto')
        except Exception as e:
            print(f"Warning: Could not load image {image_path}: {e}")
            c.setFont("Helvetica", 10)
            c.setFillColor(colors.lightgrey)
            c.drawCentredString(x + cell_width/2, y - cell_height/2, "[Image not found]")


def open_file(filepath):
    """Open a file with the default system application"""
    try:
        if sys.platform == 'darwin':
            subprocess.run(['open', filepath], check=True)
        elif sys.platform == 'win32':
            os.startfile(filepath)
        else:
            subprocess.run(['xdg-open', filepath], check=True)
        return True
    except Exception as e:
        print(f"Could not auto-open file: {e}")
        return False


def generate_from_json(json_data):
    """Generate PDF from JSON data (used by Claude Code)"""
    generator = AxkanPDFGenerator()

    order_name = json_data.get('order_name', 'Untitled Order')
    instructions = json_data.get('instructions', '')
    designs = json_data.get('designs', [])

    num_designs = len(designs)

    # Prepare slot data
    slot_data = {
        'image_paths': {},
        'types': {},
        'quantities': {}
    }

    for i, design in enumerate(designs):
        if 'type' in design:
            slot_data['types'][i] = design['type']
        if 'quantity' in design:
            slot_data['quantities'][i] = design['quantity']
        if 'image_path' in design:
            slot_data['image_paths'][i] = design['image_path']

    output_path = generator.generate_pdf(order_name, instructions, num_designs, slot_data)

    return output_path


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='AXKAN PDF Reference Sheet Generator')
    parser.add_argument('--auto', type=str, help='Path to JSON file with order data for auto-generation')

    args = parser.parse_args()

    print("=" * 60)
    print("AXKAN - PDF Reference Sheet Generator")
    print("=" * 60)
    print()

    if args.auto:
        # Auto-generate from JSON
        print(f"Auto-generating from: {args.auto}")
        with open(args.auto, 'r') as f:
            json_data = json.load(f)
        output_path = generate_from_json(json_data)
        print(f"\nPDF generated: {output_path}")
        open_file(output_path)
        return

    try:
        generator = AxkanPDFGenerator()

        print("Opening order details dialog...")
        order_details = generator.ask_order_details()

        if not order_details:
            print("Cancelled by user. Exiting.")
            return

        order_name = order_details['order_name']
        instructions = order_details['instructions']
        num_designs = order_details['num_designs']

        print(f"Order name: {order_name}")
        if instructions:
            print(f"Instructions: {instructions}")
        print(f"Number of designs: {num_designs}")

        print("\nOpening image editor...")
        editor = ImageEditorGUI(num_designs, order_name)
        slot_data = editor.run()

        if slot_data is None:
            print("Cancelled by user.")
            return

        print("Generating PDF...")
        output_path = generator.generate_pdf(order_name, instructions, num_designs, slot_data)

        print()
        print("=" * 60)
        print("[SUCCESS] PDF Generated!")
        print("=" * 60)
        print(f"File: {output_path}")

        print("\nOpening PDF...")
        if open_file(output_path):
            print("PDF opened successfully!")

        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo(
            "Success",
            f"PDF generated and opened!\n\nSaved to:\n{output_path}"
        )
        root.destroy()

    except Exception as e:
        print(f"ERROR: {e}")
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", f"An error occurred:\n{e}")
        root.destroy()


if __name__ == '__main__':
    main()

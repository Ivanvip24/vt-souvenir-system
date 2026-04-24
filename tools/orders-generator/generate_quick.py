#!/usr/bin/env python3
"""
Quick PDF Reference Sheet Generator
Prompts for order name and generates PDF from sample_order.xlsx template
"""

import os
import subprocess
import sys
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


class ImageEditorGUI:
    """GUI for adding images to order slots with copy-paste support"""

    def __init__(self, num_designs, order_name):
        self.num_designs = num_designs
        self.order_name = order_name
        self.images = {}  # {slot_number: PIL Image object}
        self.image_paths = {}  # {slot_number: temp file path}
        self.selected_slot = None

        self.root = tk.Tk()
        self.root.title(f"Add Images - {order_name}")
        self.root.geometry("900x700")

        self.setup_ui()

    def setup_ui(self):
        """Setup the user interface"""
        # Top instructions
        header = tk.Label(self.root,
                         text=f"Order: {self.order_name} | Add images to each slot\n"
                              "Click a slot and press Cmd+V (or Ctrl+V) to paste, or click 'Browse' to select a file",
                         font=("Helvetica", 11, "bold"),
                         bg="#1B4F72", fg="white", pady=15)
        header.pack(fill=tk.X)

        # Scrollable canvas for slots
        canvas_frame = tk.Frame(self.root)
        canvas_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.canvas = tk.Canvas(canvas_frame, bg="white")
        scrollbar = tk.Scrollbar(canvas_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas, bg="white")

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
        self.slot_buttons = {}

        cols = 3
        for i in range(self.num_designs):
            row = i // cols
            col = i % cols

            self.create_slot(i, row, col)

        # Bottom buttons
        button_frame = tk.Frame(self.root, bg="#EBF5FB", pady=10)
        button_frame.pack(fill=tk.X)

        generate_btn = tk.Button(button_frame, text="Generate PDF",
                                command=self.generate_pdf,
                                font=("Helvetica", 12, "bold"),
                                bg="#2E86C1", fg="white",
                                padx=20, pady=10)
        generate_btn.pack(side=tk.RIGHT, padx=10)

        cancel_btn = tk.Button(button_frame, text="Cancel",
                              command=self.cancel,
                              font=("Helvetica", 12),
                              padx=20, pady=10)
        cancel_btn.pack(side=tk.RIGHT, padx=10)

        # Bind Cmd+V (macOS) and Ctrl+V (Windows) globally
        self.root.bind('<Command-v>', self.paste_image)
        self.root.bind('<Command-V>', self.paste_image)
        self.root.bind('<Control-v>', self.paste_image)
        self.root.bind('<Control-V>', self.paste_image)
        self.root.bind_all('<Command-v>', self.paste_image)
        self.root.bind_all('<Command-V>', self.paste_image)
        self.root.bind_all('<Control-v>', self.paste_image)
        self.root.bind_all('<Control-V>', self.paste_image)

    def create_slot(self, slot_num, row, col):
        """Create a single image slot"""
        frame = tk.Frame(self.scrollable_frame,
                        relief=tk.RAISED, borderwidth=2,
                        bg="white", padx=10, pady=10)
        frame.grid(row=row, column=col, padx=10, pady=10, sticky="nsew")

        # Slot number label
        title = tk.Label(frame, text=f"Design {slot_num + 1}",
                        font=("Helvetica", 10, "bold"),
                        bg="#2E86C1", fg="white", pady=5)
        title.pack(fill=tk.X)

        # Image preview area
        img_label = tk.Label(frame, text="[No image]\nClick here & Cmd+V to paste",
                           width=20, height=8,
                           relief=tk.SUNKEN, bg="#f0f0f0",
                           cursor="hand2")
        img_label.pack(pady=5)
        img_label.bind("<Button-1>", lambda e, s=slot_num: self.select_slot(s))

        # Paste button (alternative to Cmd+V)
        paste_btn = tk.Button(frame, text="Paste from Clipboard (Cmd+V)",
                             command=lambda s=slot_num: self.paste_to_slot(s),
                             bg="#ccffcc", font=("Helvetica", 9, "bold"))
        paste_btn.pack(pady=2, fill=tk.X)

        # Browse button
        browse_btn = tk.Button(frame, text="Browse File",
                              command=lambda s=slot_num: self.browse_image(s),
                              bg="#EBF5FB")
        browse_btn.pack(pady=2)

        # Remove button
        remove_btn = tk.Button(frame, text="Remove Image",
                              command=lambda s=slot_num: self.remove_image(s),
                              bg="#ffcccc")
        remove_btn.pack(pady=2)

        self.slot_frames[slot_num] = frame
        self.slot_labels[slot_num] = img_label

    def select_slot(self, slot_num):
        """Select a slot for pasting"""
        # Deselect all
        for frame in self.slot_frames.values():
            frame.config(bg="white", highlightbackground="white")

        # Select this one
        self.selected_slot = slot_num
        self.slot_frames[slot_num].config(bg="#FFFFCC", highlightbackground="#2E86C1",
                                         highlightthickness=3)

    def get_clipboard_image(self):
        """Get image from clipboard - macOS compatible"""
        try:
            # PIL ImageGrab works natively on macOS
            img = ImageGrab.grabclipboard()
            if img and isinstance(img, PILImage.Image):
                return img

            # On macOS, clipboard might contain file paths to images
            if isinstance(img, list) and len(img) > 0:
                # Try to open the first file if it's an image
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
        """Paste image to specific slot (called by button)"""
        self.select_slot(slot_num)
        self.paste_image()

    def paste_image(self, event=None):
        """Paste image from clipboard"""
        if self.selected_slot is None:
            messagebox.showwarning("No slot selected",
                                  "Please click on a slot first, then press Cmd+V (or Ctrl+V)")
            return

        try:
            # Try to get image from clipboard
            img = self.get_clipboard_image()

            if img is None:
                messagebox.showerror("No image in clipboard",
                                   "Please copy an image first (Cmd+C or Ctrl+C)\n\n"
                                   "Or use the 'Browse File' button to select an image.")
                return

            self.add_image_to_slot(self.selected_slot, img)

        except Exception as e:
            messagebox.showerror("Error", f"Could not paste image:\n{e}\n\n"
                               "Try using the 'Browse File' button instead.")

    def browse_image(self, slot_num):
        """Browse for an image file"""
        file_path = filedialog.askopenfilename(
            title=f"Select image for Design {slot_num + 1}",
            filetypes=[
                ("Image files", "*.png *.jpg *.jpeg *.gif *.bmp"),
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
        """Add an image to a slot with memory optimization and compression"""
        original_size = img.width * img.height * 4  # Approximate original size in bytes

        # Compress large images more aggressively
        # For very large images (>4000px), resize to 1500px max
        # For large images (>2000px), resize to 2000px max
        if img.width > 4000 or img.height > 4000:
            max_size = 1500
            print(f"  Compressing very large image for Design {slot_num + 1} ({img.width}x{img.height} -> max {max_size}px)")
            img.thumbnail((max_size, max_size), PILImage.Resampling.LANCZOS)
        elif img.width > 2000 or img.height > 2000:
            max_size = 2000
            print(f"  Optimizing large image for Design {slot_num + 1} ({img.width}x{img.height} -> max {max_size}px)")
            img.thumbnail((max_size, max_size), PILImage.Resampling.LANCZOS)

        # Convert to RGB if necessary (removes alpha channel to reduce size)
        if img.mode == 'RGBA':
            # Create white background
            background = PILImage.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])  # Use alpha channel as mask
            img = background
        elif img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')

        # Save temp file with compression
        temp_dir = Path("temp_images")
        temp_dir.mkdir(exist_ok=True)

        # Use JPEG for better compression (smaller file sizes)
        # Quality 85 provides good balance between size and quality
        temp_path = temp_dir / f"slot_{slot_num}.jpg"
        img.save(str(temp_path), "JPEG", quality=85, optimize=True)

        # Check file size and compress more if needed (>2MB)
        file_size = temp_path.stat().st_size
        if file_size > 2 * 1024 * 1024:  # > 2MB
            print(f"  Further compressing Design {slot_num + 1} ({file_size / 1024 / 1024:.1f}MB -> reducing quality)")
            img.save(str(temp_path), "JPEG", quality=70, optimize=True)
            file_size = temp_path.stat().st_size

        print(f"  Design {slot_num + 1}: {img.width}x{img.height}, {file_size / 1024:.0f}KB")

        # Store path only (not the image object to save memory)
        self.image_paths[slot_num] = str(temp_path)

        # Update preview with thumbnail
        img_copy = img.copy()
        img_copy.thumbnail((150, 150))

        # Convert to PhotoImage
        from PIL import ImageTk
        photo = ImageTk.PhotoImage(img_copy)

        self.slot_labels[slot_num].config(image=photo, text="")
        self.slot_labels[slot_num].image = photo  # Keep reference

        # Change background to show it has image
        self.slot_frames[slot_num].config(bg="#ccffcc")

        # Clear the full-size image from memory
        del img
        del img_copy

    def remove_image(self, slot_num):
        """Remove image from a slot"""
        if slot_num in self.image_paths:
            # Delete temp file
            try:
                temp_path = Path(self.image_paths[slot_num])
                if temp_path.exists():
                    temp_path.unlink()
            except Exception:
                pass

            del self.image_paths[slot_num]

            self.slot_labels[slot_num].config(image="",
                                             text="[No image]\nClick here & Cmd+V to paste")
            self.slot_frames[slot_num].config(bg="white")

    def generate_pdf(self):
        """Generate PDF with images"""
        self.result = "generate"
        self.root.quit()
        self.root.destroy()

    def cancel(self):
        """Cancel and exit"""
        self.result = "cancel"
        self.root.quit()
        self.root.destroy()

    def run(self):
        """Run the GUI and return image paths"""
        self.result = None
        self.root.mainloop()

        if self.result == "generate":
            return self.image_paths
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
        self.root.title("PDF Generator - New Order")

        # Center the window
        window_width = 500
        window_height = 400
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        self.root.geometry(f"{window_width}x{window_height}+{x}+{y}")

        # Colors
        navy_blue = "#1B4F72"
        bright_blue = "#2E86C1"
        light_blue = "#EBF5FB"

        # Main container
        main_frame = tk.Frame(self.root, bg="white", padx=20, pady=15)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Header
        header = tk.Label(main_frame, text="NEW ORDER",
                         font=("Helvetica", 16, "bold"),
                         bg=navy_blue, fg="white", pady=10)
        header.pack(fill=tk.X, pady=(0, 15))

        # === Order Name Section ===
        name_frame = tk.Frame(main_frame, bg="white")
        name_frame.pack(fill=tk.X, pady=5)

        name_label = tk.Label(name_frame, text="Order Name:",
                             font=("Helvetica", 11, "bold"),
                             bg="white", fg=navy_blue)
        name_label.pack(anchor="w")

        self.name_entry = tk.Entry(name_frame, font=("Helvetica", 12),
                                   relief=tk.SOLID, borderwidth=1)
        self.name_entry.pack(fill=tk.X, pady=(3, 0), ipady=5)
        self.name_entry.focus_set()

        # === Instructions Section ===
        instr_frame = tk.Frame(main_frame, bg="white")
        instr_frame.pack(fill=tk.X, pady=10)

        instr_label = tk.Label(instr_frame, text="Instructions (optional):",
                              font=("Helvetica", 11, "bold"),
                              bg="white", fg=navy_blue)
        instr_label.pack(anchor="w")

        instr_hint = tk.Label(instr_frame, text="e.g., '100 pzas of each design'",
                             font=("Helvetica", 9, "italic"),
                             bg="white", fg="gray")
        instr_hint.pack(anchor="w")

        self.instr_entry = tk.Entry(instr_frame, font=("Helvetica", 12),
                                    relief=tk.SOLID, borderwidth=1)
        self.instr_entry.pack(fill=tk.X, pady=(3, 0), ipady=5)

        # === Number of Designs Section ===
        designs_frame = tk.Frame(main_frame, bg="white")
        designs_frame.pack(fill=tk.X, pady=10)

        designs_label = tk.Label(designs_frame, text="Number of Designs:",
                                font=("Helvetica", 11, "bold"),
                                bg="white", fg=navy_blue)
        designs_label.pack(anchor="w", pady=(0, 5))

        # Quick buttons frame
        quick_frame = tk.Frame(designs_frame, bg="white")
        quick_frame.pack(fill=tk.X)

        self.selected_designs = tk.IntVar()
        self.selected_designs.set(0)

        # Quick selection buttons
        common_values = [3, 5, 6, 9]
        for value in common_values:
            btn = tk.Button(quick_frame, text=str(value),
                          command=lambda v=value: self.select_design_count(v),
                          width=6, height=2, font=("Helvetica", 14, "bold"),
                          bg=light_blue, activebackground=bright_blue)
            btn.pack(side=tk.LEFT, padx=5)

        # Custom entry
        other_label = tk.Label(quick_frame, text="Other:",
                              font=("Helvetica", 10), bg="white")
        other_label.pack(side=tk.LEFT, padx=(15, 5))

        self.custom_entry = tk.Entry(quick_frame, width=6, font=("Helvetica", 12),
                                     relief=tk.SOLID, borderwidth=1)
        self.custom_entry.pack(side=tk.LEFT, ipady=3)
        self.custom_entry.bind('<KeyRelease>', self.on_custom_change)

        # Selected display
        self.selected_label = tk.Label(designs_frame, text="Selected: -",
                                       font=("Helvetica", 10),
                                       bg="white", fg=bright_blue)
        self.selected_label.pack(anchor="w", pady=(8, 0))

        # === Buttons Section ===
        button_frame = tk.Frame(main_frame, bg="white")
        button_frame.pack(fill=tk.X, pady=(20, 0))

        cancel_btn = tk.Button(button_frame, text="Cancel",
                              command=self.cancel,
                              font=("Helvetica", 12),
                              width=12, height=2)
        cancel_btn.pack(side=tk.LEFT)

        create_btn = tk.Button(button_frame, text="Continue →",
                              command=self.submit,
                              font=("Helvetica", 12, "bold"),
                              bg=bright_blue, fg="white",
                              activebackground=navy_blue, activeforeground="white",
                              width=15, height=2)
        create_btn.pack(side=tk.RIGHT)

        # Bind Enter key
        self.root.bind('<Return>', lambda e: self.submit())
        self.root.bind('<Escape>', lambda e: self.cancel())

        self.root.mainloop()
        return self.result

    def select_design_count(self, value):
        """Select a design count from quick buttons"""
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

        # Validation
        if not order_name:
            messagebox.showwarning("Missing Information",
                                  "Please enter an order name.")
            self.name_entry.focus_set()
            return

        if num_designs <= 0:
            messagebox.showwarning("Missing Information",
                                  "Please select the number of designs.")
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


class QuickPDFGenerator:
    """Quick PDF generator with dialog prompt"""

    def __init__(self):
        self.load_config()

    def load_config(self):
        """Load configuration"""
        with open('config.yaml', 'r', encoding='utf-8') as f:
            self.config = yaml.safe_load(f)

        # Set up page dimensions
        if self.config['layout']['page_size'] == 'A4':
            self.page_width, self.page_height = A4

        self.margin = self.config['layout']['margin'] * mm
        self.columns = self.config['layout']['columns']

    def ask_order_details(self):
        """Show unified dialog for all order details"""
        dialog = UnifiedOrderDialog()
        return dialog.show()

    def ask_order_name(self):
        """Show dialog to ask for order name (legacy method)"""
        root = tk.Tk()
        root.withdraw()  # Hide main window

        # Center the dialog
        root.update_idletasks()

        order_name = simpledialog.askstring(
            "PDF Generator - Order Name",
            "Enter the order name/number:",
            parent=root
        )

        root.destroy()
        return order_name

    def ask_instructions(self):
        """Show dialog to ask for instructions (legacy method)"""
        root = tk.Tk()
        root.withdraw()  # Hide main window

        instructions = simpledialog.askstring(
            "PDF Generator - Instructions",
            "Enter instructions (optional):\n(e.g., '100 pzas of each design')",
            parent=root
        )

        root.destroy()
        return instructions if instructions else ""

    def ask_number_of_designs(self):
        """Show dialog with buttons to select number of designs (legacy method)"""
        root = tk.Tk()
        root.title("PDF Generator - Number of Designs")

        # Center the window
        window_width = 400
        window_height = 200
        screen_width = root.winfo_screenwidth()
        screen_height = root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        root.geometry(f"{window_width}x{window_height}+{x}+{y}")

        selected_value = tk.IntVar()
        selected_value.set(0)

        # Label
        label = tk.Label(root, text="How many designs does this order have?",
                        font=("Helvetica", 12))
        label.pack(pady=20)

        # Frame for buttons
        button_frame = tk.Frame(root)
        button_frame.pack(pady=10)

        def select_and_close(value):
            selected_value.set(value)
            root.quit()
            root.destroy()

        # Create buttons for common values
        common_values = [3, 5, 6]
        for i, value in enumerate(common_values):
            btn = tk.Button(button_frame, text=str(value),
                          command=lambda v=value: select_and_close(v),
                          width=10, height=2, font=("Helvetica", 14))
            btn.grid(row=0, column=i, padx=10)

        # Custom input option
        custom_frame = tk.Frame(root)
        custom_frame.pack(pady=10)

        custom_label = tk.Label(custom_frame, text="Other:", font=("Helvetica", 10))
        custom_label.pack(side=tk.LEFT, padx=5)

        custom_entry = tk.Entry(custom_frame, width=10, font=("Helvetica", 10))
        custom_entry.pack(side=tk.LEFT, padx=5)

        def custom_submit():
            try:
                value = int(custom_entry.get())
                if value > 0:
                    select_and_close(value)
            except ValueError:
                pass

        custom_btn = tk.Button(custom_frame, text="OK", command=custom_submit,
                             font=("Helvetica", 10))
        custom_btn.pack(side=tk.LEFT, padx=5)

        root.mainloop()
        return selected_value.get() if selected_value.get() > 0 else None

    def read_template_excel(self, excel_path='sample_order.xlsx'):
        """Read order data from Excel template"""
        if not os.path.exists(excel_path):
            raise FileNotFoundError(f"Template file not found: {excel_path}")

        wb = load_workbook(excel_path)
        sheet = wb.active

        order_data = {
            'order_number': '',
            'client_name': '',
            'items': []
        }

        # Read items starting from row 5
        for row in range(5, sheet.max_row + 1):
            product_name = sheet.cell(row, 1).value
            product_type = sheet.cell(row, 2).value
            quantity = sheet.cell(row, 3).value
            image_path = sheet.cell(row, 4).value

            if not product_name:
                continue

            order_data['items'].append({
                'name': str(product_name),
                'type': str(product_type),
                'quantity': int(quantity) if quantity else 0,
                'image_path': str(image_path) if image_path else None
            })

        return order_data

    def generate_pdf(self, order_name, instructions, num_designs, image_paths=None):
        """Generate PDF with the given order name, instructions, and number of designs"""

        # Create output directory - expand macOS paths like ~/Desktop
        output_dir = Path(self.config['output_path']).expanduser()

        # Check if output directory is accessible
        try:
            output_dir.mkdir(parents=True, exist_ok=True)

            # Test write access by creating a temporary file
            test_file = output_dir / ".write_test"
            try:
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                raise PermissionError(f"Cannot write to output directory: {output_dir}\nError: {e}")

        except PermissionError:
            raise
        except Exception as e:
            # If network path fails, try to provide helpful error message
            error_msg = f"Cannot access output directory: {output_dir}\n"
            if str(output_dir).startswith('\\\\') or str(output_dir).startswith('//'):
                error_msg += "This appears to be a network path. Please check:\n"
                error_msg += "  1. Network connection is active\n"
                error_msg += "  2. Network drive is mounted\n"
                error_msg += "  3. You have permission to write to this location\n"
            error_msg += f"\nOriginal error: {e}"
            raise Exception(error_msg)

        # Sanitize order name for filename (replace invalid characters)
        safe_order_name = order_name.replace('/', '-').replace('\\', '-').replace(':', '-').replace('*', '-').replace('?', '-').replace('"', '-').replace('<', '-').replace('>', '-').replace('|', '-')

        # Create filename with sanitized order name
        output_filename = f"{safe_order_name}.pdf"
        output_path = output_dir / output_filename

        # Create slots for designs with images if provided
        items = []
        for i in range(num_designs):
            img_path = None
            if image_paths and i in image_paths:
                img_path = image_paths[i]

            items.append({
                'name': f"Design {i+1}",
                'type': "",
                'quantity': 0,
                'image_path': img_path
            })

        # Create PDF
        c = canvas.Canvas(str(output_path), pagesize=(self.page_width, self.page_height))

        # Draw header with instructions
        self._draw_header(c, order_name, instructions, num_designs)

        # Draw grid with items
        self._draw_items_grid(c, items)

        # Save PDF
        c.save()

        return str(output_path)

    def _draw_header(self, c, order_name, instructions, num_designs):
        """Draw PDF header with instructions and logos"""
        # Navy blue and blue colors
        navy_blue = colors.HexColor('#1B4F72')  # Dark navy blue
        bright_blue = colors.HexColor('#2E86C1')  # Bright blue

        # Add VT logo (only vt1.png - the VT letters)
        logo_height = 60
        try:
            # Try to load vt1.png (VT symbol)
            if os.path.exists('vt1.png'):
                c.drawImage('vt1.png', self.margin,
                           self.page_height - 75,
                           width=70, height=logo_height,
                           preserveAspectRatio=True, mask='auto')
        except:
            pass

        # Title
        c.setFillColor(navy_blue)
        c.setFont("Helvetica-Bold", 20)
        c.drawCentredString(self.page_width / 2, self.page_height - 50, "ORDEN DE COMPRA")

        # Order info box (white background)
        y_pos = self.page_height - 100
        c.setFillColor(colors.white)
        c.setStrokeColor(navy_blue)
        c.setLineWidth(2)
        info_box_height = 25
        c.roundRect(self.margin, y_pos - info_box_height,
                   self.page_width - 2 * self.margin, info_box_height,
                   5, fill=True, stroke=True)

        # Order info text
        c.setFillColor(navy_blue)
        c.setFont("Helvetica-Bold", self.config['fonts']['body_size'])
        order_info = f"Order: {order_name} | Designs: {num_designs} | Date: {datetime.now().strftime('%Y-%m-%d')}"
        c.drawString(self.margin + 10, y_pos - 17, order_info)

        # Instructions field
        y_pos -= 35
        c.setFillColor(navy_blue)
        c.setFont("Helvetica-Bold", self.config['fonts']['body_size'])
        c.drawString(self.margin, y_pos, "Instructions:")

        # Draw instructions box with blue border
        c.setFont("Helvetica", self.config['fonts']['body_size'])
        box_x = self.margin + 80
        box_width = self.page_width - 2 * self.margin - 80
        box_height = 30

        # Colored border
        c.setStrokeColor(bright_blue)
        c.setFillColor(colors.HexColor('#EBF5FB'))  # Light blue background
        c.setLineWidth(2)
        c.roundRect(box_x, y_pos - box_height + 5, box_width, box_height, 3, fill=True, stroke=True)

        # Draw instructions text
        c.setFillColor(colors.black)
        if instructions:
            c.drawString(box_x + 5, y_pos - 10, instructions)

        y_pos -= box_height

        # CAJAS TOTALES field - very visible
        y_pos -= 40
        c.setFillColor(navy_blue)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(self.margin, y_pos + 5, "CAJAS TOTALES:")

        # Draw large box for total boxes with bright blue border
        cajas_box_x = self.margin + 120
        cajas_box_width = 150
        cajas_box_height = 35

        c.setStrokeColor(bright_blue)
        c.setFillColor(colors.HexColor('#EBF5FB'))
        c.setLineWidth(3)
        c.roundRect(cajas_box_x, y_pos - 15, cajas_box_width, cajas_box_height, 5, fill=True, stroke=True)

        # Add editable field for total boxes
        form = c.acroForm
        form.textfield(
            name="cajas_totales",
            x=cajas_box_x,
            y=y_pos - 15,
            width=cajas_box_width,
            height=cajas_box_height,
            borderWidth=0,
            textColor=colors.black,
            fontSize=16,
            fontName='Helvetica-Bold'
        )

        y_pos -= 25

        # Draw separator line with blue color
        c.setStrokeColor(bright_blue)
        c.setLineWidth(3)
        c.line(self.margin, y_pos - 5, self.page_width - self.margin, y_pos - 5)

    def _draw_items_grid(self, c, items):
        """Draw grid of items with dynamic sizing"""
        num_items = len(items)
        columns = 3  # Always 3 columns
        max_per_page = 9  # Maximum 3 rows x 3 columns

        # Calculate available space
        available_width = self.page_width - 2 * self.margin
        available_height = self.page_height - self.margin - 230  # Account for header with CAJAS TOTALES

        # Calculate number of items on first page
        items_on_page = min(num_items, max_per_page)
        rows_on_page = (items_on_page + columns - 1) // columns  # Ceiling division

        # Dynamic cell sizing with spacing
        spacing = 10  # Spacing between cells
        cell_width = (available_width - (columns - 1) * spacing) / columns
        cell_height = (available_height - (rows_on_page - 1) * spacing) / rows_on_page

        # Ensure minimum size
        cell_width = max(cell_width, 150)
        cell_height = max(cell_height, 180)

        padding = self.config['cell']['padding']

        # Center the grid
        total_grid_width = cell_width * columns + spacing * (columns - 1)
        total_grid_height = cell_height * rows_on_page + spacing * (rows_on_page - 1)

        start_x = (self.page_width - total_grid_width) / 2
        start_y = self.page_height - 230 - (available_height - total_grid_height) / 2

        current_x = start_x
        current_y = start_y
        items_in_row = 0
        items_drawn = 0

        for item in items:
            # Check if we need a new page
            if items_drawn > 0 and items_drawn % max_per_page == 0:
                c.showPage()

                # Recalculate for remaining items
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

            # Draw cell border
            c.setStrokeColor(colors.black)
            c.setLineWidth(1)
            c.rect(current_x, current_y - cell_height, cell_width, cell_height)

            # Draw item content
            self._draw_item_cell(c, item, current_x, current_y, cell_width, cell_height, padding)

            # Move to next position
            items_in_row += 1
            items_drawn += 1

            if items_in_row >= columns:
                current_y -= (cell_height + spacing)
                current_x = start_x
                items_in_row = 0
            else:
                current_x += (cell_width + spacing)

    def _draw_item_cell(self, c, item, x, y, width, height, padding):
        """Draw a single item cell"""
        navy_blue = colors.HexColor('#1B4F72')
        bright_blue = colors.HexColor('#2E86C1')
        light_blue = colors.HexColor('#EBF5FB')

        # Type label with blue background bar - make it editable
        c.setFillColor(bright_blue)
        c.rect(x, y - padding - 18, width, 18, fill=True, stroke=False)

        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + padding, y - padding - 12, "Tipo:")

        # Editable Type field
        type_field_x = x + padding + 30
        type_field_width = width - 2*padding - 30
        c.setFillColor(light_blue)
        c.rect(type_field_x, y - padding - 16, type_field_width, 14, fill=True, stroke=False)

        form = c.acroForm
        form.textfield(
            name=f"type_{id(item)}",
            x=type_field_x,
            y=y - padding - 16,
            width=type_field_width,
            height=14,
            borderWidth=0,
            textColor=colors.black,
            fontSize=9,
            fontName='Helvetica'
        )

        # Image area - draw image if exists, otherwise show placeholder
        if item.get('image_path') and os.path.exists(item['image_path']):
            self._draw_image(c, item['image_path'], x, y, width, height, padding)
        else:
            # Show placeholder
            image_y_center = y - padding - 30 - (height - 110) / 2
            c.setFillColor(colors.lightgrey)
            c.setFont("Helvetica", 10)
            c.drawCentredString(x + width/2, image_y_center, "[Image placeholder]")

            # Draw a light grey box for image area
            c.setStrokeColor(colors.grey)
            c.setLineWidth(0.5)
            image_box_height = height - 110
            c.rect(x + 10, y - padding - 30 - image_box_height, width - 20, image_box_height, stroke=True, fill=False)

        # Quantity ordered with blue accent - make it editable
        c.setFillColor(navy_blue)
        c.setFont("Helvetica-Bold", 9)
        qty_y = y - height + padding + 45
        c.drawString(x + padding, qty_y - 2, "Requeridos:")

        # Editable quantity field
        c.setFillColor(light_blue)
        c.setStrokeColor(bright_blue)
        c.setLineWidth(1)
        qty_field_x = x + padding + 55
        qty_field_width = width - 2*padding - 55
        c.rect(qty_field_x, qty_y - 15, qty_field_width, 15, fill=True, stroke=True)

        form = c.acroForm
        form.textfield(
            name=f"quantity_{id(item)}",
            x=qty_field_x,
            y=qty_y - 15,
            width=qty_field_width,
            height=15,
            borderWidth=0,
            textColor=colors.black,
            fontSize=10,
            fontName='Helvetica'
        )

        # Editable fields with blue labels
        if self.config['form_fields']['enable_editable']:
            field_y = qty_y - 25

            # Counted
            c.setFillColor(navy_blue)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x + padding, field_y - 2, "Contados:")

            # Draw light blue background for field
            c.setFillColor(light_blue)
            c.setStrokeColor(bright_blue)
            c.setLineWidth(1)
            counted_field_x = x + padding + 55
            counted_field_width = width - 2*padding - 55
            c.rect(counted_field_x, field_y - 15, counted_field_width, 15, fill=True, stroke=True)

            # Add text field
            form = c.acroForm
            form.textfield(
                name=f"counted_{id(item)}",
                x=counted_field_x,
                y=field_y - 15,
                width=counted_field_width,
                height=15,
                borderWidth=0,
                textColor=colors.black,
                fontSize=10,
                fontName='Helvetica'
            )

    def _draw_image(self, c, image_path, x, y, cell_width, cell_height, padding):
        """Draw image centered and auto-sized in cell"""
        try:
            img = PILImage.open(image_path)
            img_width, img_height = img.size

            # Calculate available space for image (excluding header and footer areas)
            available_width = cell_width - 6  # 3px padding on each side
            available_height = cell_height - 65  # Space for tipo, requeridos, contados fields

            # Calculate scale to fit image within available space while maintaining aspect ratio
            scale_width = available_width / img_width
            scale_height = available_height / img_height
            scale = min(scale_width, scale_height)

            display_width = img_width * scale
            display_height = img_height * scale

            # Center the image horizontally and vertically in the available space
            image_x = x + (cell_width - display_width) / 2
            image_y = y - padding - 30 - available_height/2 - display_height/2

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
        if sys.platform == 'darwin':  # macOS
            subprocess.run(['open', filepath], check=True)
        elif sys.platform == 'win32':  # Windows
            os.startfile(filepath)
        else:  # Linux
            subprocess.run(['xdg-open', filepath], check=True)
        return True
    except Exception as e:
        print(f"Could not auto-open file: {e}")
        return False


def main():
    """Main entry point"""
    print("=" * 60)
    print("Quick PDF Reference Sheet Generator")
    print("=" * 60)
    print()

    try:
        # Initialize generator
        generator = QuickPDFGenerator()

        # Show unified dialog for all order details
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

        # Open image editor GUI
        print("\nOpening image editor...")
        print("You can now:")
        print("  - Click on a slot and press Cmd+V (or Ctrl+V) to paste an image from clipboard")
        print("  - Click 'Browse File' to select an image from your computer")
        print("  - Click 'Generate PDF' when done")
        print()

        editor = ImageEditorGUI(num_designs, order_name)
        image_paths = editor.run()

        if image_paths is None:
            print("Cancelled by user.")
            return

        # Generate PDF
        print("Generating PDF...")
        output_path = generator.generate_pdf(order_name, instructions, num_designs, image_paths)

        print()
        print("=" * 60)
        print("[SUCCESS] PDF Generated!")
        print("=" * 60)
        print(f"File: {output_path}")
        print()

        # Auto-open the PDF
        print("Opening PDF...")
        if open_file(output_path):
            print("PDF opened successfully!")
        else:
            print("Could not auto-open PDF. Please open it manually.")
            print("You can now:")
            print("  1. Open the PDF in Adobe Reader")
            print("  2. Fill in the editable fields")
            print("  3. Save the completed PDF")

        print()

        # Show success dialog
        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo(
            "Success",
            f"PDF generated and opened!\n\nSaved to:\n{output_path}"
        )
        root.destroy()

    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        print("Please make sure sample_order.xlsx exists in the current folder.")
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", str(e))
        root.destroy()

    except Exception as e:
        print(f"ERROR: {e}")
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", f"An error occurred:\n{e}")
        root.destroy()


if __name__ == '__main__':
    main()

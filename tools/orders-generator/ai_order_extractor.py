#!/usr/bin/env python3
"""
AI Order Extractor - Upload/paste order images for Claude Code analysis

This script provides a GUI to:
1. Upload or paste an order image (like a grid of designs with types and quantities)
2. Save the image for Claude Code to analyze
3. Launch Claude Code for automatic order extraction and PDF generation

Usage:
    python ai_order_extractor.py

Then in Claude Code, say: "Process the pending order image"
"""

import os
import sys
import subprocess
import json
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, filedialog
from PIL import Image as PILImage, ImageGrab, ImageTk


class OrderImageExtractor:
    """GUI for uploading/pasting order images for AI analysis"""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("AXKAN - AI Order Extractor")
        self.root.geometry("800x600")

        # Axkan brand colors
        self.colors = {
            'pink': '#E91E63',
            'green': '#7CB342',
            'orange': '#FF9800',
            'cyan': '#00BCD4',
            'red': '#F44336',
            'dark': '#333333',
            'light': '#F5F5F5'
        }

        self.root.configure(bg=self.colors['light'])

        self.current_image = None
        self.image_path = None

        self.setup_ui()

    def setup_ui(self):
        """Setup the user interface with Axkan branding"""

        # Header with AXKAN branding
        header_frame = tk.Frame(self.root, bg=self.colors['dark'], height=80)
        header_frame.pack(fill=tk.X)
        header_frame.pack_propagate(False)

        # AXKAN text logo with colors
        logo_frame = tk.Frame(header_frame, bg=self.colors['dark'])
        logo_frame.pack(pady=15)

        letters = [('A', self.colors['pink']), ('X', self.colors['green']),
                   ('K', self.colors['orange']), ('A', self.colors['cyan']),
                   ('N', self.colors['red'])]

        for letter, color in letters:
            lbl = tk.Label(logo_frame, text=letter, font=("Arial Black", 32, "bold"),
                          fg=color, bg=self.colors['dark'])
            lbl.pack(side=tk.LEFT)

        # Subtitle
        subtitle = tk.Label(header_frame, text="AI Order Extractor",
                           font=("Helvetica", 12),
                           fg="white", bg=self.colors['dark'])
        subtitle.pack()

        # Instructions
        instr_frame = tk.Frame(self.root, bg=self.colors['light'], pady=10)
        instr_frame.pack(fill=tk.X)

        instructions = tk.Label(instr_frame,
            text="Paste an order image (Cmd+V) or browse for a file.\n"
                 "The image should show designs with their types (Tipo) and quantities (Requeridos).",
            font=("Helvetica", 11),
            bg=self.colors['light'], fg=self.colors['dark'])
        instructions.pack()

        # Image preview area
        preview_frame = tk.Frame(self.root, bg="white", relief=tk.SUNKEN, borderwidth=2)
        preview_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        self.preview_label = tk.Label(preview_frame,
            text="[No image loaded]\n\nPaste with Cmd+V (or Ctrl+V)\nor click 'Browse File'",
            font=("Helvetica", 14),
            bg="white", fg="gray")
        self.preview_label.pack(fill=tk.BOTH, expand=True)

        # Buttons frame
        button_frame = tk.Frame(self.root, bg=self.colors['light'], pady=15)
        button_frame.pack(fill=tk.X)

        # Paste button
        paste_btn = tk.Button(button_frame, text="Paste from Clipboard (Cmd+V)",
                             command=self.paste_image,
                             font=("Helvetica", 12, "bold"),
                             bg=self.colors['green'], fg="white",
                             padx=20, pady=10)
        paste_btn.pack(side=tk.LEFT, padx=10)

        # Browse button
        browse_btn = tk.Button(button_frame, text="Browse File",
                              command=self.browse_image,
                              font=("Helvetica", 12),
                              bg=self.colors['cyan'], fg="white",
                              padx=20, pady=10)
        browse_btn.pack(side=tk.LEFT, padx=10)

        # Clear button
        clear_btn = tk.Button(button_frame, text="Clear",
                             command=self.clear_image,
                             font=("Helvetica", 12),
                             padx=20, pady=10)
        clear_btn.pack(side=tk.LEFT, padx=10)

        # Spacer
        spacer = tk.Frame(button_frame, bg=self.colors['light'])
        spacer.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # ACCEPT button (prominent)
        self.accept_btn = tk.Button(button_frame,
            text="ACCEPT & Process with Claude Code",
            command=self.accept_order,
            font=("Helvetica", 14, "bold"),
            bg=self.colors['pink'], fg="white",
            padx=30, pady=15,
            state=tk.DISABLED)
        self.accept_btn.pack(side=tk.RIGHT, padx=10)

        # Status bar
        self.status_var = tk.StringVar()
        self.status_var.set("Ready - paste or browse an order image")
        status_bar = tk.Label(self.root, textvariable=self.status_var,
                             font=("Helvetica", 10),
                             bg=self.colors['dark'], fg="white",
                             anchor="w", padx=10, pady=5)
        status_bar.pack(fill=tk.X, side=tk.BOTTOM)

        # Bind keyboard shortcuts
        self.root.bind('<Command-v>', lambda e: self.paste_image())
        self.root.bind('<Command-V>', lambda e: self.paste_image())
        self.root.bind('<Control-v>', lambda e: self.paste_image())
        self.root.bind('<Control-V>', lambda e: self.paste_image())

    def paste_image(self):
        """Paste image from clipboard"""
        try:
            img = ImageGrab.grabclipboard()

            if img is None:
                messagebox.showwarning("No Image",
                    "No image found in clipboard.\n\n"
                    "Please copy an image first (Cmd+C or Ctrl+C)")
                return

            if isinstance(img, list) and len(img) > 0:
                # File paths from clipboard
                try:
                    first_item = img[0]
                    if isinstance(first_item, str) and os.path.exists(first_item):
                        img = PILImage.open(first_item)
                    else:
                        messagebox.showwarning("Invalid", "Could not load image from clipboard")
                        return
                except Exception:
                    messagebox.showwarning("Error", "Could not load image from clipboard")
                    return

            if isinstance(img, PILImage.Image):
                self.load_image(img)
                self.status_var.set(f"Image pasted: {img.width}x{img.height} pixels")
            else:
                messagebox.showwarning("Invalid", "Clipboard does not contain a valid image")

        except Exception as e:
            messagebox.showerror("Error", f"Could not paste image:\n{e}")

    def browse_image(self):
        """Browse for an image file"""
        file_path = filedialog.askopenfilename(
            title="Select Order Image",
            filetypes=[
                ("Image files", "*.png *.jpg *.jpeg *.gif *.bmp *.webp"),
                ("All files", "*.*")
            ]
        )

        if file_path:
            try:
                img = PILImage.open(file_path)
                self.load_image(img)
                self.status_var.set(f"Image loaded: {file_path}")
            except Exception as e:
                messagebox.showerror("Error", f"Could not load image:\n{e}")

    def load_image(self, img):
        """Load and display image"""
        self.current_image = img

        # Create thumbnail for preview
        preview_img = img.copy()
        preview_img.thumbnail((700, 400))

        photo = ImageTk.PhotoImage(preview_img)
        self.preview_label.config(image=photo, text="")
        self.preview_label.image = photo  # Keep reference

        # Enable accept button
        self.accept_btn.config(state=tk.NORMAL)

    def clear_image(self):
        """Clear the current image"""
        self.current_image = None
        self.image_path = None
        self.preview_label.config(
            image="",
            text="[No image loaded]\n\nPaste with Cmd+V (or Ctrl+V)\nor click 'Browse File'"
        )
        self.accept_btn.config(state=tk.DISABLED)
        self.status_var.set("Ready - paste or browse an order image")

    def accept_order(self):
        """Accept the order and trigger Claude Code processing"""
        if self.current_image is None:
            messagebox.showwarning("No Image", "Please load an image first")
            return

        # Create pending orders directory
        pending_dir = Path("pending_orders")
        pending_dir.mkdir(exist_ok=True)

        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        image_filename = f"order_{timestamp}.png"
        image_path = pending_dir / image_filename

        # Save image
        self.current_image.save(str(image_path), "PNG")

        # Create metadata file for Claude Code to read
        metadata = {
            "timestamp": timestamp,
            "image_path": str(image_path.absolute()),
            "status": "pending",
            "created_at": datetime.now().isoformat()
        }

        metadata_path = pending_dir / f"order_{timestamp}.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        self.status_var.set(f"Order saved! Image: {image_path}")

        # Show success dialog with instructions
        result = messagebox.askquestion(
            "Order Saved!",
            f"Order image saved to:\n{image_path}\n\n"
            "Would you like to open Claude Code now?\n\n"
            "In Claude Code, say:\n"
            "'Process the pending order image'\n\n"
            "Click 'Yes' to open Claude Code, or 'No' to continue manually."
        )

        if result == 'yes':
            self.launch_claude_code(image_path)

        # Reset for next order
        self.clear_image()

    def launch_claude_code(self, image_path):
        """Launch Claude Code CLI"""
        try:
            # Try to open Claude Code with the prompt
            # This will open the terminal with claude command
            prompt = f"Process the pending order image at: {image_path}"

            if sys.platform == 'darwin':  # macOS
                # Open Terminal with claude command
                script = f'''
                tell application "Terminal"
                    activate
                    do script "cd '{os.getcwd()}' && echo 'Order image ready at: {image_path}' && echo 'Please tell Claude Code to process it.'"
                end tell
                '''
                subprocess.run(['osascript', '-e', script])

            elif sys.platform == 'win32':  # Windows
                subprocess.Popen(['cmd', '/c', 'start', 'cmd', '/k',
                    f'echo Order image ready at: {image_path} && echo Please tell Claude Code to process it.'])
            else:
                print(f"Order image ready at: {image_path}")
                print("Please tell Claude Code to process it.")

            messagebox.showinfo("Claude Code",
                f"Terminal opened!\n\n"
                f"Run 'claude' and tell it:\n"
                f"'Process the pending order at {image_path}'")

        except Exception as e:
            messagebox.showwarning("Manual Processing",
                f"Could not launch Claude Code automatically.\n\n"
                f"Please open Claude Code manually and say:\n"
                f"'Process the pending order image at:\n{image_path}'")

    def run(self):
        """Run the application"""
        self.root.mainloop()


def main():
    """Main entry point"""
    print("=" * 60)
    print("AXKAN - AI Order Extractor")
    print("=" * 60)
    print()
    print("This tool allows you to:")
    print("  1. Paste or browse an order image")
    print("  2. Accept to save it for Claude Code processing")
    print("  3. Claude Code will analyze and generate the PDF")
    print()

    app = OrderImageExtractor()
    app.run()


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
AXKAN Order System - PDF Generator
==================================
Complete order processing system with:
- AXKAN branding (colorful theme)
- TWO input modes:
  1. Manual: Paste individual design images
  2. Auto: Paste order image -> Auto-crop
- PDF generation for printing

Usage:
    python notion_quick.py
"""

import os
import sys
import subprocess
import json
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, filedialog, ttk
import shutil

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfform
from PIL import Image as PILImage, ImageGrab, ImageTk


# ============================================================================
# OUTPUT PATH - Change this to set where PDFs are saved
# ============================================================================
OUTPUT_PATH = "/Volumes/TRABAJOS/2026/ORDERS/IVAN"

# ============================================================================
# BACKUP PATH - Local fallback when network is unavailable
# ============================================================================
BACKUP_PATH = Path.home() / "Documents" / "AXKAN_Orders_Backup"
PENDING_ORDERS_PATH = BACKUP_PATH / "pending_orders"


# ============================================================================
# CONNECTION CHECKER - Verify network is available before starting
# ============================================================================
class ConnectionChecker:
    """Check network connection and manage order recovery"""

    @staticmethod
    def is_output_path_available():
        """Check if the output path is accessible"""
        try:
            output_dir = Path(OUTPUT_PATH)
            # Check if path exists
            if not output_dir.exists():
                # Try to create it (will fail if network not mounted)
                output_dir.mkdir(parents=True, exist_ok=True)
            # Try to write a test file
            test_file = output_dir / ".connection_test"
            test_file.write_text("test")
            test_file.unlink()  # Delete test file
            return True
        except Exception as e:
            print(f"[Connection] Output path not available: {e}")
            return False

    @staticmethod
    def get_backup_path():
        """Get or create backup directory"""
        BACKUP_PATH.mkdir(parents=True, exist_ok=True)
        PENDING_ORDERS_PATH.mkdir(parents=True, exist_ok=True)
        return BACKUP_PATH

    @staticmethod
    def save_pending_order(order_name, instructions, designs, image_paths=None):
        """
        Save order data locally for recovery if network fails.
        Returns the path to the saved order file.
        """
        ConnectionChecker.get_backup_path()

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(c if c.isalnum() or c in ' -_' else '-' for c in order_name)
        order_folder = PENDING_ORDERS_PATH / f"{safe_name}_{timestamp}"
        order_folder.mkdir(parents=True, exist_ok=True)

        # Save images to backup folder
        images_folder = order_folder / "images"
        images_folder.mkdir(exist_ok=True)

        saved_designs = []
        for i, design in enumerate(designs):
            saved_design = dict(design)
            img_path = design.get('image_path')
            if img_path and os.path.exists(img_path):
                # Copy image to backup folder
                new_img_path = images_folder / f"design_{i}.jpg"
                shutil.copy2(img_path, new_img_path)
                saved_design['image_path'] = str(new_img_path)
            saved_designs.append(saved_design)

        # Save order data as JSON
        order_data = {
            'order_name': order_name,
            'instructions': instructions,
            'designs': saved_designs,
            'timestamp': timestamp,
            'original_output_path': OUTPUT_PATH
        }

        order_file = order_folder / "order_data.json"
        with open(order_file, 'w', encoding='utf-8') as f:
            json.dump(order_data, f, indent=2, ensure_ascii=False)

        print(f"[Backup] Order saved to: {order_folder}")
        return str(order_folder)

    @staticmethod
    def load_pending_order(order_folder):
        """Load a pending order from backup"""
        order_file = Path(order_folder) / "order_data.json"
        if order_file.exists():
            with open(order_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None

    @staticmethod
    def get_pending_orders():
        """Get list of pending orders that failed to save"""
        if not PENDING_ORDERS_PATH.exists():
            return []

        pending = []
        for folder in PENDING_ORDERS_PATH.iterdir():
            if folder.is_dir():
                order_file = folder / "order_data.json"
                if order_file.exists():
                    try:
                        with open(order_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            pending.append({
                                'folder': str(folder),
                                'name': data.get('order_name', 'Unknown'),
                                'timestamp': data.get('timestamp', ''),
                                'designs_count': len(data.get('designs', []))
                            })
                    except:
                        pass

        # Sort by timestamp, newest first
        pending.sort(key=lambda x: x['timestamp'], reverse=True)
        return pending

    @staticmethod
    def delete_pending_order(order_folder):
        """Delete a pending order after successful save"""
        try:
            shutil.rmtree(order_folder)
            print(f"[Backup] Deleted pending order: {order_folder}")
            return True
        except Exception as e:
            print(f"[Backup] Failed to delete: {e}")
            return False


# ============================================================================
# AXKAN BRAND COLORS - Modern UI Palette
# ============================================================================
AXKAN_COLORS = {
    # Primary brand colors
    'pink': '#E91E63',
    'green': '#4CAF50',
    'orange': '#FF9800',
    'cyan': '#00BCD4',
    'red': '#F44336',

    # Soft pastel versions (for card backgrounds)
    'pink_soft': '#FCE4EC',
    'green_soft': '#E8F5E9',
    'orange_soft': '#FFF3E0',
    'cyan_soft': '#E0F7FA',
    'red_soft': '#FFEBEE',

    # Neutrals
    'dark': '#1A1A2E',
    'dark_secondary': '#16213E',
    'gray': '#6B7280',
    'gray_light': '#9CA3AF',
    'light': '#F8FAFC',
    'white': '#FFFFFF',
    'card_bg': '#FFFFFF',
    'shadow': '#000000',

    # Status colors
    'success': '#10B981',
    'success_soft': '#D1FAE5',
    'warning': '#F59E0B',
    'warning_soft': '#FEF3C7',
    'error': '#EF4444',
    'error_soft': '#FEE2E2',
}

# Modern UI Constants
UI_CORNER_RADIUS = 20
UI_CARD_PADDING = 20
UI_SHADOW_COLOR = '#00000015'


# ============================================================================
# ORDER IMAGE ANALYZER - For auto-crop mode (Improved grid detection)
# ============================================================================
class OrderImageAnalyzer:
    """Analyzes order images and extracts design cells"""

    def __init__(self, image):
        self.image = image
        self.width, self.height = image.size

    def _detect_by_text_labels(self, gray_image):
        """
        Detect grid by finding repeating text label patterns (like "Tipo:").
        Order documents typically have labels at consistent positions in each cell.
        """
        height = gray_image.height
        width = gray_image.width

        row_signatures = []
        sample_step_x = max(1, width // 100)

        for y in range(height):
            samples = [gray_image.getpixel((x, y)) for x in range(0, width, sample_step_x)]
            avg_brightness = sum(samples) / len(samples) if samples else 128
            variance = sum((s - avg_brightness) ** 2 for s in samples) / len(samples) if samples else 0
            row_signatures.append((avg_brightness, variance))

        brightness_changes = []
        for i in range(1, len(row_signatures)):
            change = abs(row_signatures[i][0] - row_signatures[i-1][0])
            brightness_changes.append(change)

        threshold = max(brightness_changes) * 0.3 if brightness_changes else 10

        change_positions = []
        for i, change in enumerate(brightness_changes):
            if change > threshold:
                change_positions.append(i)

        if len(change_positions) < 2:
            return (1, 1)

        clusters = []
        current_cluster = [change_positions[0]]
        for pos in change_positions[1:]:
            if pos - current_cluster[-1] < height // 20:
                current_cluster.append(pos)
            else:
                clusters.append(sum(current_cluster) // len(current_cluster))
                current_cluster = [pos]
        clusters.append(sum(current_cluster) // len(current_cluster))

        if len(clusters) >= 2:
            spacings = [clusters[i+1] - clusters[i] for i in range(len(clusters)-1)]
            avg_spacing = sum(spacings) / len(spacings)

            if avg_spacing > 0:
                estimated_rows = int(round(height / avg_spacing))
                if estimated_rows >= 2 and estimated_rows <= 8:
                    cols = self._detect_columns_by_symmetry(gray_image)
                    if cols >= 2:
                        return (estimated_rows, cols)

        return (1, 1)

    def _detect_columns_by_symmetry(self, gray_image):
        """Detect columns by finding vertical symmetry in brightness"""
        width = gray_image.width
        height = gray_image.height

        col_brightness = []
        sample_step = max(1, height // 50)
        for x in range(width):
            total = sum(gray_image.getpixel((x, y)) for y in range(0, height, sample_step))
            col_brightness.append(total / (height // sample_step))

        smoothed = self._smooth_profile(col_brightness, window=width // 100)

        best_cols = 1
        best_score = float('inf')

        for num_cols in range(2, 7):
            col_width = width // num_cols
            if col_width < 50:
                continue

            patterns = []
            for c in range(num_cols):
                start = c * col_width
                end = start + col_width
                pattern = smoothed[start:end]
                patterns.append(pattern)

            if patterns:
                min_len = min(len(p) for p in patterns)
                total_variance = 0
                for i in range(min_len):
                    values = [p[i] for p in patterns]
                    mean = sum(values) / len(values)
                    var = sum((v - mean) ** 2 for v in values) / len(values)
                    total_variance += var

                avg_variance = total_variance / min_len
                if avg_variance < best_score:
                    best_score = avg_variance
                    best_cols = num_cols

        return best_cols

    def _detect_by_brightness_stripes(self, gray_image):
        """Detect grid by analyzing periodic brightness patterns."""
        height = gray_image.height
        width = gray_image.width

        row_profile = []
        sample_step_x = max(1, width // 50)
        for y in range(height):
            total = sum(gray_image.getpixel((x, y)) for x in range(0, width, sample_step_x))
            row_profile.append(total / (width // sample_step_x))

        col_profile = []
        sample_step_y = max(1, height // 50)
        for x in range(width):
            total = sum(gray_image.getpixel((x, y)) for y in range(0, height, sample_step_y))
            col_profile.append(total / (height // sample_step_y))

        rows = self._find_periodicity(row_profile, height)
        cols = self._find_periodicity(col_profile, width)

        return (rows, cols)

    def _find_periodicity(self, profile, total_size):
        """Find the number of repeating units in a brightness profile using autocorrelation"""
        if len(profile) < 20:
            return 1

        mean = sum(profile) / len(profile)
        normalized = [p - mean for p in profile]

        best_cells = 1
        best_correlation = 0

        for num_cells in range(2, 8):
            period = len(profile) // num_cells
            if period < 20:
                continue

            correlation = 0
            count = 0
            for i in range(len(profile) - period):
                correlation += normalized[i] * normalized[i + period]
                count += 1

            if count > 0:
                correlation /= count

            if correlation > best_correlation:
                best_correlation = correlation
                best_cells = num_cells

        if best_correlation > 0:
            return best_cells
        return 1

    def detect_grid_layout(self):
        """Detect the grid layout using multiple methods. Returns (rows, cols) tuple."""
        gray = self.image.convert('L')

        rows1, cols1 = self._detect_by_text_labels(gray)
        if rows1 >= 2 and cols1 >= 2:
            print(f"[Grid] Text label method: {rows1}x{cols1}")
            return (rows1, cols1)

        rows2, cols2 = self._detect_by_brightness_stripes(gray)
        if rows2 >= 2 and cols2 >= 2:
            print(f"[Grid] Brightness stripe method: {rows2}x{cols2}")
            return (rows2, cols2)

        cols3, rows3 = self._detect_grid_lines(gray)
        if cols3 >= 2 and rows3 >= 2 and cols3 <= 6 and rows3 <= 8:
            print(f"[Grid] Edge method: {rows3}x{cols3}")
            return (rows3, cols3)

        result = self._fallback_aspect_ratio_detection()
        print(f"[Grid] Aspect ratio fallback: {result}")
        return result

    def _detect_grid_lines(self, gray_image):
        """Detect grid by finding vertical and horizontal lines using edge detection."""
        width = gray_image.width
        height = gray_image.height

        v_edges = []
        for x in range(1, width - 1):
            edge_strength = 0
            sample_step = max(1, height // 40)
            for y in range(0, height, sample_step):
                left = gray_image.getpixel((x - 1, y))
                right = gray_image.getpixel((x + 1, y))
                edge_strength += abs(right - left)
            v_edges.append(edge_strength)

        h_edges = []
        for y in range(1, height - 1):
            edge_strength = 0
            sample_step = max(1, width // 40)
            for x in range(0, width, sample_step):
                top = gray_image.getpixel((x, y - 1))
                bottom = gray_image.getpixel((x, y + 1))
                edge_strength += abs(bottom - top)
            h_edges.append(edge_strength)

        cols = self._find_grid_lines_from_edges(v_edges, width)
        rows = self._find_grid_lines_from_edges(h_edges, height)

        return cols, rows

    def _find_grid_lines_from_edges(self, edges, total_size):
        """Find evenly-spaced grid lines from edge strength profile"""
        if not edges or total_size < 10:
            return 1

        smoothed = self._smooth_profile(edges, window=max(5, total_size // 50))

        max_edge = max(smoothed)
        if max_edge < 100:
            return 1

        edge_threshold = max_edge * 0.4
        margin = total_size // 15

        above_threshold = []
        in_peak = False
        peak_start = 0
        peak_max = 0
        peak_max_pos = 0

        for i, val in enumerate(smoothed):
            if val >= edge_threshold:
                if not in_peak:
                    in_peak = True
                    peak_start = i
                    peak_max = val
                    peak_max_pos = i
                elif val > peak_max:
                    peak_max = val
                    peak_max_pos = i
            else:
                if in_peak:
                    above_threshold.append(peak_max_pos)
                    in_peak = False

        if in_peak:
            above_threshold.append(peak_max_pos)

        interior_peaks = [p for p in above_threshold if margin < p < total_size - margin]

        if len(interior_peaks) == 0:
            return 1

        best_cells = 1
        best_score = float('inf')

        for num_cells in range(2, 8):
            expected_spacing = total_size / num_cells
            expected_lines = []
            for i in range(1, num_cells):
                expected_lines.append(int(i * expected_spacing))

            if len(expected_lines) == 0:
                continue

            total_error = 0
            matched = 0
            for exp_pos in expected_lines:
                min_dist = float('inf')
                for peak in interior_peaks:
                    dist = abs(peak - exp_pos)
                    if dist < min_dist:
                        min_dist = dist
                if min_dist < expected_spacing * 0.15:
                    matched += 1
                    total_error += min_dist
                else:
                    total_error += expected_spacing

            if matched > 0:
                score = total_error / matched
                score = score / (matched / len(expected_lines))

                if score < best_score and matched >= len(expected_lines) * 0.6:
                    best_score = score
                    best_cells = num_cells

        return best_cells

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
        cell_width = self.width // cols
        cell_height = self.height // rows
        designs = []
        for row in range(rows):
            for col in range(cols):
                x1, y1 = col * cell_width, row * cell_height
                padding_top = int(cell_height * padding_top_pct)
                padding_bottom = int(cell_height * padding_bottom_pct)
                margin = 10
                design_img = self.image.crop((
                    x1 + margin, y1 + padding_top,
                    x1 + cell_width - margin, y1 + cell_height - padding_bottom
                ))
                designs.append({'image': design_img, 'index': row * cols + col})
        return designs


# ============================================================================
# IMAGE EDITOR GUI - For manual paste mode
# ============================================================================
class ImageEditorGUI:
    """GUI for adding images to order slots with copy-paste support"""

    def __init__(self, num_designs, order_name):
        self.num_designs = num_designs
        self.order_name = order_name
        self.image_paths = {}
        self.selected_slot = None

        self.root = tk.Tk()
        self.root.title(f"AXKAN - {order_name}")
        self.root.geometry("900x700")
        self.root.configure(bg=AXKAN_COLORS['light'])

        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after(100, lambda: self.root.attributes('-topmost', False))
        self.root.focus_force()
        if sys.platform == 'darwin':
            os.system('''/usr/bin/osascript -e 'tell app "Finder" to set frontmost of process "Python" to true' ''')

        self.setup_ui()

    def setup_ui(self):
        header = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], height=70)
        header.pack(fill=tk.X)
        header.pack_propagate(False)

        logo_frame = tk.Frame(header, bg=AXKAN_COLORS['dark'])
        logo_frame.pack(pady=10)

        for letter, color in [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                               ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                               ('N', AXKAN_COLORS['red'])]:
            tk.Label(logo_frame, text=letter, font=("Impact", 28, "bold"),
                    fg=color, bg=AXKAN_COLORS['dark']).pack(side=tk.LEFT)

        tk.Label(header, text=f"Order: {self.order_name} | Click slot + Cmd+V to paste",
                font=("Helvetica", 10), fg="white", bg=AXKAN_COLORS['dark']).pack()

        canvas_frame = tk.Frame(self.root, bg=AXKAN_COLORS['light'])
        canvas_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.canvas = tk.Canvas(canvas_frame, bg=AXKAN_COLORS['light'])
        scrollbar = tk.Scrollbar(canvas_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas, bg=AXKAN_COLORS['light'])

        self.scrollable_frame.bind("<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.slot_frames = {}
        self.slot_labels = {}
        cols = 3
        accent_colors = [AXKAN_COLORS['pink'], AXKAN_COLORS['green'],
                        AXKAN_COLORS['orange'], AXKAN_COLORS['cyan'], AXKAN_COLORS['red']]

        for i in range(self.num_designs):
            row, col = i // cols, i % cols
            frame = tk.Frame(self.scrollable_frame, relief=tk.RAISED, borderwidth=2,
                           bg="white", padx=10, pady=10)
            frame.grid(row=row, column=col, padx=10, pady=10, sticky="nsew")

            tk.Label(frame, text=f"Design {i + 1}", font=("Helvetica", 10, "bold"),
                    bg=accent_colors[i % 5], fg="white", pady=4).pack(fill=tk.X)

            img_label = tk.Label(frame, text="[No image]\nClick + Cmd+V",
                               width=18, height=6, relief=tk.SUNKEN, bg="#f0f0f0", cursor="hand2")
            img_label.pack(pady=5)
            img_label.bind("<Button-1>", lambda e, s=i: self.select_slot(s))

            btn_frame = tk.Frame(frame, bg="white")
            btn_frame.pack(fill=tk.X)
            tk.Button(btn_frame, text="Paste", command=lambda s=i: self.paste_to_slot(s),
                     bg="#ccffcc", font=("Helvetica", 8)).pack(side=tk.LEFT, expand=True, fill=tk.X)
            tk.Button(btn_frame, text="Browse", command=lambda s=i: self.browse_image(s),
                     bg=AXKAN_COLORS['light'], font=("Helvetica", 8)).pack(side=tk.LEFT, expand=True, fill=tk.X)

            self.slot_frames[i] = frame
            self.slot_labels[i] = img_label

        btn_frame = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], pady=10)
        btn_frame.pack(fill=tk.X)

        tk.Button(btn_frame, text="<- Main Menu", command=self.go_to_main_menu,
                 font=("Helvetica", 12), padx=15, pady=10).pack(side=tk.LEFT, padx=10)
        tk.Button(btn_frame, text="Generate PDF", command=self.generate,
                 font=("Helvetica", 12, "bold"), highlightbackground=AXKAN_COLORS['pink'],
                 padx=20, pady=10).pack(side=tk.RIGHT, padx=10)
        tk.Button(btn_frame, text="Cancel", command=self.cancel,
                 font=("Helvetica", 12), padx=20, pady=10).pack(side=tk.RIGHT, padx=10)

        for key in ['<Command-v>', '<Command-V>', '<Control-v>', '<Control-V>']:
            self.root.bind(key, self.paste_image)
            self.root.bind_all(key, self.paste_image)

    def select_slot(self, slot_num):
        for frame in self.slot_frames.values():
            frame.config(bg="white")
        self.selected_slot = slot_num
        self.slot_frames[slot_num].config(bg="#FFFFCC")

    def paste_to_slot(self, slot_num):
        self.select_slot(slot_num)
        self.paste_image()

    def paste_image(self, event=None):
        if self.selected_slot is None:
            messagebox.showwarning("No slot", "Click a slot first, then Cmd+V")
            return
        try:
            img = ImageGrab.grabclipboard()
            if isinstance(img, list) and img:
                img = PILImage.open(img[0]) if os.path.exists(img[0]) else None
            if isinstance(img, PILImage.Image):
                self.add_image_to_slot(self.selected_slot, img)
            else:
                messagebox.showwarning("No image", "No image in clipboard")
        except Exception as e:
            messagebox.showerror("Error", f"Could not paste: {e}")

    def browse_image(self, slot_num):
        file_path = filedialog.askopenfilename(
            filetypes=[("Images", "*.png *.jpg *.jpeg *.gif *.bmp *.webp")])
        if file_path:
            try:
                self.add_image_to_slot(slot_num, PILImage.open(file_path))
            except Exception as e:
                messagebox.showerror("Error", f"Could not load: {e}")

    def add_image_to_slot(self, slot_num, img):
        if img.width > 2000 or img.height > 2000:
            img.thumbnail((2000, 2000), PILImage.Resampling.LANCZOS)
        if img.mode == 'RGBA':
            bg = PILImage.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        temp_dir = Path("temp_images")
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / f"slot_{slot_num}.jpg"
        img.save(str(temp_path), "JPEG", quality=85, optimize=True)
        self.image_paths[slot_num] = str(temp_path)

        thumb = img.copy()
        thumb.thumbnail((130, 100))
        photo = ImageTk.PhotoImage(thumb)
        self.slot_labels[slot_num].config(image=photo, text="")
        self.slot_labels[slot_num].image = photo
        self.slot_frames[slot_num].config(bg="#ccffcc")

    def generate(self):
        self.result = "generate"
        self.root.quit()
        self.root.destroy()

    def cancel(self):
        self.result = "cancel"
        self.root.quit()
        self.root.destroy()

    def go_to_main_menu(self):
        """Return to main menu"""
        self.result = "main_menu"
        self.root.quit()
        self.root.destroy()

    def run(self):
        self.result = None
        self.root.mainloop()
        if self.result == "main_menu":
            return "main_menu"
        return self.image_paths if self.result == "generate" else None


# ============================================================================
# UNIFIED ORDER DIALOG - For manual mode (Modern Design)
# ============================================================================
class UnifiedOrderDialog:
    """Modern dialog for order name, instructions, and number of designs"""

    def __init__(self):
        self.result = None
        self.selected_btn = None

    def show(self):
        self.root = tk.Tk()
        self.root.title("AXKAN")
        self.root.geometry("480x580")
        self.root.configure(bg=AXKAN_COLORS['white'])
        self.root.resizable(False, False)

        x = (self.root.winfo_screenwidth() - 480) // 2
        y = (self.root.winfo_screenheight() - 580) // 2
        self.root.geometry(f"480x580+{x}+{y}")

        main = tk.Frame(self.root, bg=AXKAN_COLORS['white'], padx=25, pady=25)
        main.pack(fill=tk.BOTH, expand=True)

        # ====== HEADER ======
        header = tk.Frame(main, bg=AXKAN_COLORS['white'])
        header.pack(fill=tk.X, pady=(0, 25))

        # Back button
        back_btn = tk.Button(header, text="← Back", font=("SF Pro Display", 12),
                            command=self.go_to_main_menu, bg=AXKAN_COLORS['white'],
                            fg=AXKAN_COLORS['gray'], relief=tk.FLAT, cursor="hand2",
                            borderwidth=0, activebackground=AXKAN_COLORS['white'])
        back_btn.pack(side=tk.LEFT)

        tk.Label(header, text="New Order", font=("SF Pro Display", 18, "bold"),
                fg=AXKAN_COLORS['dark'], bg=AXKAN_COLORS['white']).pack(side=tk.LEFT, padx=(15, 0))

        # ====== ORDER NAME INPUT ======
        tk.Label(main, text="Order Name", font=("SF Pro Display", 13, "bold"),
                bg=AXKAN_COLORS['white'], fg=AXKAN_COLORS['dark']).pack(anchor="w", pady=(0, 8))

        name_frame = tk.Frame(main, bg=AXKAN_COLORS['light'], padx=15, pady=12)
        name_frame.pack(fill=tk.X, pady=(0, 20))

        self.name_entry = tk.Entry(name_frame, font=("SF Pro Display", 14),
                                  bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'],
                                  relief=tk.FLAT, borderwidth=0)
        self.name_entry.pack(fill=tk.X)
        self.name_entry.insert(0, "")
        self.name_entry.focus_set()

        # Placeholder behavior
        self.name_entry.insert(0, "e.g., Puerto Vallarta - Delfines")
        self.name_entry.config(fg=AXKAN_COLORS['gray_light'])
        self.name_entry.bind('<FocusIn>', lambda e: self._clear_placeholder(self.name_entry, "e.g., Puerto Vallarta - Delfines"))
        self.name_entry.bind('<FocusOut>', lambda e: self._add_placeholder(self.name_entry, "e.g., Puerto Vallarta - Delfines"))

        # ====== INSTRUCTIONS INPUT ======
        tk.Label(main, text="Instructions (optional)", font=("SF Pro Display", 13, "bold"),
                bg=AXKAN_COLORS['white'], fg=AXKAN_COLORS['dark']).pack(anchor="w", pady=(0, 8))

        instr_frame = tk.Frame(main, bg=AXKAN_COLORS['light'], padx=15, pady=12)
        instr_frame.pack(fill=tk.X, pady=(0, 25))

        self.instr_entry = tk.Entry(instr_frame, font=("SF Pro Display", 14),
                                   bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'],
                                   relief=tk.FLAT, borderwidth=0)
        self.instr_entry.pack(fill=tk.X)
        self.instr_entry.insert(0, "e.g., 50 pieces each")
        self.instr_entry.config(fg=AXKAN_COLORS['gray_light'])
        self.instr_entry.bind('<FocusIn>', lambda e: self._clear_placeholder(self.instr_entry, "e.g., 50 pieces each"))
        self.instr_entry.bind('<FocusOut>', lambda e: self._add_placeholder(self.instr_entry, "e.g., 50 pieces each"))

        # ====== NUMBER OF DESIGNS ======
        tk.Label(main, text="Number of designs", font=("SF Pro Display", 13, "bold"),
                bg=AXKAN_COLORS['white'], fg=AXKAN_COLORS['dark']).pack(anchor="w", pady=(0, 12))

        self.selected_designs = tk.IntVar(value=0)

        # Quick select buttons
        quick = tk.Frame(main, bg=AXKAN_COLORS['white'])
        quick.pack(fill=tk.X, pady=(0, 10))

        self.design_buttons = {}
        colors = [AXKAN_COLORS['pink'], AXKAN_COLORS['green'],
                 AXKAN_COLORS['orange'], AXKAN_COLORS['cyan']]
        soft_colors = [AXKAN_COLORS['pink_soft'], AXKAN_COLORS['green_soft'],
                      AXKAN_COLORS['orange_soft'], AXKAN_COLORS['cyan_soft']]

        for i, val in enumerate([3, 5, 6, 9]):
            btn_frame = tk.Frame(quick, bg=soft_colors[i], padx=2, pady=2)
            btn_frame.pack(side=tk.LEFT, padx=(0, 10))

            btn = tk.Button(btn_frame, text=str(val),
                           command=lambda v=val, c=colors[i], sc=soft_colors[i]: self.select_count(v, c, sc),
                           font=("SF Pro Display", 16, "bold"),
                           bg=soft_colors[i], fg=colors[i],
                           relief=tk.FLAT, borderwidth=0,
                           width=4, height=2, cursor="hand2",
                           activebackground=colors[i], activeforeground="white")
            btn.pack()
            self.design_buttons[val] = (btn, colors[i], soft_colors[i])

        # Custom input
        custom_frame = tk.Frame(quick, bg=AXKAN_COLORS['white'])
        custom_frame.pack(side=tk.LEFT, padx=(10, 0))

        tk.Label(custom_frame, text="Other", font=("SF Pro Display", 11),
                bg=AXKAN_COLORS['white'], fg=AXKAN_COLORS['gray']).pack(anchor="w")

        custom_input = tk.Frame(custom_frame, bg=AXKAN_COLORS['light'], padx=10, pady=8)
        custom_input.pack()

        self.custom_entry = tk.Entry(custom_input, width=5, font=("SF Pro Display", 14),
                                    bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'],
                                    relief=tk.FLAT, borderwidth=0, justify="center")
        self.custom_entry.pack()
        self.custom_entry.bind('<KeyRelease>', self.on_custom)

        # Selection indicator
        self.selected_label = tk.Label(main, text="",
                                       font=("SF Pro Display", 12),
                                       bg=AXKAN_COLORS['white'], fg=AXKAN_COLORS['success'])
        self.selected_label.pack(anchor="w", pady=(10, 0))

        # ====== CONTINUE BUTTON ======
        btn_container = tk.Frame(main, bg=AXKAN_COLORS['white'])
        btn_container.pack(fill=tk.X, pady=(30, 0))

        continue_btn = tk.Button(btn_container, text="Continue",
                                command=self.submit,
                                font=("SF Pro Display", 15, "bold"),
                                bg=AXKAN_COLORS['pink'], fg="white",
                                relief=tk.FLAT, borderwidth=0,
                                padx=40, pady=15, cursor="hand2",
                                activebackground=AXKAN_COLORS['pink'],
                                activeforeground="white")
        continue_btn.pack(fill=tk.X)

        self.root.bind('<Return>', lambda e: self.submit())
        self.root.bind('<Escape>', lambda e: self.go_to_main_menu())
        self.root.mainloop()
        return self.result

    def _clear_placeholder(self, entry, placeholder):
        if entry.get() == placeholder:
            entry.delete(0, tk.END)
            entry.config(fg=AXKAN_COLORS['dark'])

    def _add_placeholder(self, entry, placeholder):
        if not entry.get():
            entry.insert(0, placeholder)
            entry.config(fg=AXKAN_COLORS['gray_light'])

    def select_count(self, val, color, soft_color):
        self.selected_designs.set(val)
        self.custom_entry.delete(0, tk.END)
        self.selected_label.config(text=f"✓ {val} designs selected", fg=color)

        # Reset all buttons
        for v, (btn, c, sc) in self.design_buttons.items():
            btn.config(bg=sc, fg=c)

        # Highlight selected
        btn, c, sc = self.design_buttons[val]
        btn.config(bg=c, fg="white")

    def on_custom(self, event):
        try:
            val = int(self.custom_entry.get())
            if val > 0:
                self.selected_designs.set(val)
                self.selected_label.config(text=f"✓ {val} designs selected",
                                          fg=AXKAN_COLORS['success'])
                # Reset all buttons
                for v, (btn, c, sc) in self.design_buttons.items():
                    btn.config(bg=sc, fg=c)
        except:
            pass

    def submit(self):
        name = self.name_entry.get().strip()
        if name in ["", "e.g., Puerto Vallarta - Delfines"]:
            messagebox.showwarning("Missing", "Please enter order name")
            return
        if self.selected_designs.get() <= 0:
            messagebox.showwarning("Missing", "Please select number of designs")
            return

        instr = self.instr_entry.get().strip()
        if instr == "e.g., 50 pieces each":
            instr = ""

        self.result = {
            'order_name': name,
            'instructions': instr,
            'num_designs': self.selected_designs.get()
        }
        self.root.quit()
        self.root.destroy()

    def go_to_main_menu(self):
        """Return to main menu"""
        self.result = "main_menu"
        self.root.quit()
        self.root.destroy()


# ============================================================================
# PROGRESS WINDOW (Modern Design)
# ============================================================================
class ProgressWindow:
    def __init__(self, title="Processing", total_steps=100):
        self.root = tk.Tk()
        self.root.title(title)
        self.root.geometry("420x200")
        self.root.configure(bg=AXKAN_COLORS['white'])
        self.root.resizable(False, False)
        x = (self.root.winfo_screenwidth() - 420) // 2
        y = (self.root.winfo_screenheight() - 200) // 2
        self.root.geometry(f"420x200+{x}+{y}")
        self.root.attributes('-topmost', True)
        self.root.overrideredirect(False)

        main = tk.Frame(self.root, padx=30, pady=25, bg=AXKAN_COLORS['white'])
        main.pack(fill=tk.BOTH, expand=True)

        # Mini AXKAN logo
        logo = tk.Frame(main, bg=AXKAN_COLORS['white'])
        logo.pack(pady=(0, 15))
        for letter, color in [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                               ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                               ('N', AXKAN_COLORS['red'])]:
            tk.Label(logo, text=letter, font=("SF Pro Display", 24, "bold"),
                    fg=color, bg=AXKAN_COLORS['white']).pack(side=tk.LEFT)

        self.status_label = tk.Label(main, text="Starting...", font=("SF Pro Display", 13),
                                     fg=AXKAN_COLORS['dark'], bg=AXKAN_COLORS['white'])
        self.status_label.pack(pady=(0, 15))

        # Custom progress bar using canvas
        self.progress_canvas = tk.Canvas(main, width=360, height=8,
                                        bg=AXKAN_COLORS['light'], highlightthickness=0)
        self.progress_canvas.pack(pady=(0, 10))
        self.progress_bar = self.progress_canvas.create_rectangle(0, 0, 0, 8,
                                                                  fill=AXKAN_COLORS['pink'],
                                                                  outline="")

        self.pct_label = tk.Label(main, text="0%", font=("SF Pro Display", 12, "bold"),
                                  fg=AXKAN_COLORS['gray'], bg=AXKAN_COLORS['white'])
        self.pct_label.pack()
        self.total = total_steps
        self.current = 0
        self.root.update()

    def update(self, step=None, status=None):
        if step is not None:
            self.current = step
            pct = step / self.total
            bar_width = int(360 * pct)
            self.progress_canvas.coords(self.progress_bar, 0, 0, bar_width, 8)

            # Change color based on progress
            if pct < 0.5:
                color = AXKAN_COLORS['pink']
            elif pct < 0.8:
                color = AXKAN_COLORS['orange']
            else:
                color = AXKAN_COLORS['success']
            self.progress_canvas.itemconfig(self.progress_bar, fill=color)

            self.pct_label.config(text=f"{int(pct*100)}%")
        if status:
            self.status_label.config(text=status)
        self.root.update()

    def close(self):
        try:
            self.root.destroy()
        except:
            pass


# ============================================================================
# AXKAN PDF GENERATOR
# ============================================================================
class AxkanPDFGenerator:
    def __init__(self):
        self.page_width, self.page_height = A4
        self.margin = 20 * mm  # 20mm margin

    def generate_pdf(self, order_name, instructions, designs):
        output_dir = Path(OUTPUT_PATH).expanduser()
        output_dir.mkdir(parents=True, exist_ok=True)
        safe_name = "".join(c if c.isalnum() or c in ' -_' else '-' for c in order_name)
        output_path = output_dir / f"{safe_name}.pdf"

        c = canvas.Canvas(str(output_path), pagesize=(self.page_width, self.page_height))
        self._draw_header(c, order_name, instructions, len(designs))
        self._draw_designs(c, designs)
        c.save()
        return str(output_path)

    def _draw_header(self, c, order_name, instructions, num):
        pink, green, orange, cyan, red = [colors.HexColor(AXKAN_COLORS[k]) for k in ['pink','green','orange','cyan','red']]
        dark, light = colors.HexColor(AXKAN_COLORS['dark']), colors.HexColor(AXKAN_COLORS['light'])

        x = self.margin
        c.setFont("Helvetica-Bold", 36)
        for letter, color in [('A',pink),('X',green),('K',orange),('A',cyan),('N',red)]:
            c.setFillColor(color)
            c.drawString(x, self.page_height - 50, letter)
            x += 28

        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(self.page_width/2, self.page_height - 50, "ORDEN DE COMPRA")

        y = self.page_height - 90
        c.setFillColor(colors.white)
        c.setStrokeColor(pink)
        c.setLineWidth(2)
        c.roundRect(self.margin, y-25, self.page_width-2*self.margin, 25, 5, fill=True, stroke=True)
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(self.margin+10, y-17, f"Order: {order_name} | Designs: {num} | {datetime.now().strftime('%Y-%m-%d')}")

        if instructions:
            y -= 35
            c.drawString(self.margin, y, "Instructions:")
            c.setFillColor(light)
            c.setStrokeColor(cyan)
            c.roundRect(self.margin+80, y-20, self.page_width-2*self.margin-80, 25, 3, fill=True, stroke=True)
            c.setFillColor(colors.black)
            c.setFont("Helvetica", 10)
            c.drawString(self.margin+85, y-10, instructions)

        y -= 50
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(self.margin, y+5, "CAJAS TOTALES:")
        c.setFillColor(light)
        c.setStrokeColor(orange)
        c.setLineWidth(3)
        c.roundRect(self.margin+130, y-15, 150, 35, 5, fill=True, stroke=True)
        c.acroForm.textfield(name="cajas_totales", x=self.margin+130, y=y-15, width=150, height=35,
                            borderWidth=0, fontSize=16, fontName='Helvetica-Bold')

        y -= 30
        sw = (self.page_width - 2*self.margin) / 5
        for i, col in enumerate([pink,green,orange,cyan,red]):
            c.setStrokeColor(col)
            c.setLineWidth(3)
            c.line(self.margin+i*sw, y, self.margin+(i+1)*sw, y)

    def _draw_designs(self, c, designs):
        cols, num = 3, len(designs)
        rows = (num + cols - 1) // cols
        aw = self.page_width - 2*self.margin
        ah = self.page_height - self.margin - 230
        sp = 10
        cw = (aw - (cols-1)*sp) / cols
        ch = min((ah - (rows-1)*sp) / rows, 200)

        accent = [colors.HexColor(AXKAN_COLORS[k]) for k in ['pink','green','orange','cyan','red']]
        dark, light = colors.HexColor(AXKAN_COLORS['dark']), colors.HexColor(AXKAN_COLORS['light'])

        for i, d in enumerate(designs):
            row, col = i // cols, i % cols
            x = self.margin + col * (cw + sp)
            y = self.page_height - 230 - row * (ch + sp)
            ac = accent[i % 5]

            c.setStrokeColor(ac)
            c.setLineWidth(2)
            c.rect(x, y-ch, cw, ch)

            c.setFillColor(ac)
            c.rect(x, y-18, cw, 18, fill=True, stroke=False)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x+5, y-13, "Tipo:")
            c.acroForm.textfield(name=f"tipo_{i}", x=x+35, y=y-16, width=cw-45, height=14,
                                value=d.get('type',''), borderWidth=0, fontSize=9,
                                fontName='Helvetica-Bold', textColor=colors.white,
                                fillColor=ac, borderColor=ac)

            img_path = d.get('image_path')
            if img_path and os.path.exists(img_path):
                try:
                    img = PILImage.open(img_path)
                    iw, ih = img.size
                    mw, mh = cw-10, ch-80
                    scale = min(mw/iw, mh/ih)
                    dw, dh = iw*scale, ih*scale
                    c.drawImage(img_path, x+(cw-dw)/2, y-25-dh-(mh-dh)/2, width=dw, height=dh,
                               preserveAspectRatio=True, mask='auto')
                except:
                    pass

            qy = y - ch + 40
            c.setFillColor(dark)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x+5, qy, "Requeridos:")
            c.setFillColor(light)
            c.setStrokeColor(ac)
            c.setLineWidth(1)
            c.rect(x+60, qy-12, cw-70, 15, fill=True, stroke=True)
            c.setFillColor(colors.black)
            c.setFont("Helvetica", 10)
            c.drawString(x+65, qy-8, str(d.get('quantity','')))

            cy = qy - 20
            c.setFillColor(dark)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x+5, cy, "Contados:")
            c.setFillColor(light)
            c.rect(x+60, cy-12, cw-70, 15, fill=True, stroke=True)
            c.acroForm.textfield(name=f"contados_{i}", x=x+60, y=cy-12, width=cw-70, height=15,
                                borderWidth=0, fontSize=10, fontName='Helvetica')


# ============================================================================
# MODERN UI HELPER - Rounded rectangle drawing
# ============================================================================
class ModernUI:
    """Helper class for creating modern UI elements"""

    @staticmethod
    def create_rounded_frame(parent, bg_color, corner_radius=20, padding=20):
        """Create a frame with rounded appearance using canvas"""
        frame = tk.Frame(parent, bg=parent.cget('bg'))
        return frame

    @staticmethod
    def create_pill_button(parent, text, command, bg_color, fg_color="white",
                          font_size=12, padx=25, pady=12, bold=True):
        """Create a modern pill-shaped button"""
        font_weight = "bold" if bold else "normal"
        btn = tk.Button(
            parent,
            text=text,
            command=command,
            font=("SF Pro Display", font_size, font_weight),
            bg=bg_color,
            fg=fg_color,
            activebackground=bg_color,
            activeforeground=fg_color,
            relief=tk.FLAT,
            borderwidth=0,
            padx=padx,
            pady=pady,
            cursor="hand2"
        )
        return btn

    @staticmethod
    def create_card(parent, bg_color="#FFFFFF", highlight_color=None):
        """Create a modern card frame"""
        card = tk.Frame(
            parent,
            bg=bg_color,
            relief=tk.FLAT,
            borderwidth=0,
            padx=20,
            pady=18
        )
        return card


# ============================================================================
# MAIN APPLICATION - Choose Mode (Modern Design)
# ============================================================================
class MainApplication:
    """Main application with modern card-based UI"""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("AXKAN")
        self.root.geometry("480x720")
        self.root.configure(bg=AXKAN_COLORS['white'])
        self.root.resizable(False, False)

        x = (self.root.winfo_screenwidth() - 480) // 2
        y = (self.root.winfo_screenheight() - 720) // 2
        self.root.geometry(f"480x720+{x}+{y}")

        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after(100, lambda: self.root.attributes('-topmost', False))
        self.root.focus_force()
        if sys.platform == 'darwin':
            os.system('''/usr/bin/osascript -e 'tell app "Finder" to set frontmost of process "Python" to true' ''')

        # Check connection status
        self.connection_ok = ConnectionChecker.is_output_path_available()
        self.pending_orders = ConnectionChecker.get_pending_orders()

        self.setup_ui()

    def setup_ui(self):
        # Main container with white background
        main_container = tk.Frame(self.root, bg=AXKAN_COLORS['white'])
        main_container.pack(fill=tk.BOTH, expand=True)

        # ====== HEADER SECTION ======
        header = tk.Frame(main_container, bg=AXKAN_COLORS['white'], height=140)
        header.pack(fill=tk.X, padx=25, pady=(30, 0))
        header.pack_propagate(False)

        # AXKAN Logo - Large and colorful
        logo_frame = tk.Frame(header, bg=AXKAN_COLORS['white'])
        logo_frame.pack(anchor="w")

        for letter, color in [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                               ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                               ('N', AXKAN_COLORS['red'])]:
            tk.Label(logo_frame, text=letter, font=("SF Pro Display", 52, "bold"),
                    fg=color, bg=AXKAN_COLORS['white']).pack(side=tk.LEFT)

        # Subtitle
        tk.Label(header, text="Order System",
                font=("SF Pro Display", 16), fg=AXKAN_COLORS['gray'],
                bg=AXKAN_COLORS['white']).pack(anchor="w", pady=(5, 0))

        # ====== CONNECTION STATUS - Pill Style ======
        status_container = tk.Frame(main_container, bg=AXKAN_COLORS['white'])
        status_container.pack(fill=tk.X, padx=25, pady=(20, 0))

        if self.connection_ok:
            status_pill = tk.Frame(status_container, bg=AXKAN_COLORS['success_soft'],
                                  padx=16, pady=10)
            status_pill.pack(fill=tk.X)

            status_inner = tk.Frame(status_pill, bg=AXKAN_COLORS['success_soft'])
            status_inner.pack(fill=tk.X)

            tk.Label(status_inner, text="●", font=("SF Pro Display", 12),
                    fg=AXKAN_COLORS['success'], bg=AXKAN_COLORS['success_soft']).pack(side=tk.LEFT)
            tk.Label(status_inner, text=" Connected", font=("SF Pro Display", 13, "bold"),
                    fg=AXKAN_COLORS['success'], bg=AXKAN_COLORS['success_soft']).pack(side=tk.LEFT)
            tk.Label(status_inner, text=" — Network ready", font=("SF Pro Display", 12),
                    fg=AXKAN_COLORS['gray'], bg=AXKAN_COLORS['success_soft']).pack(side=tk.LEFT)

            # Refresh button
            refresh_btn = tk.Button(status_inner, text="⟳", font=("SF Pro Display", 14),
                                   command=self.refresh_connection, bg=AXKAN_COLORS['success_soft'],
                                   fg=AXKAN_COLORS['success'], relief=tk.FLAT, cursor="hand2",
                                   borderwidth=0, activebackground=AXKAN_COLORS['success_soft'])
            refresh_btn.pack(side=tk.RIGHT)
        else:
            status_pill = tk.Frame(status_container, bg=AXKAN_COLORS['error_soft'],
                                  padx=16, pady=10)
            status_pill.pack(fill=tk.X)

            status_inner = tk.Frame(status_pill, bg=AXKAN_COLORS['error_soft'])
            status_inner.pack(fill=tk.X)

            tk.Label(status_inner, text="●", font=("SF Pro Display", 12),
                    fg=AXKAN_COLORS['error'], bg=AXKAN_COLORS['error_soft']).pack(side=tk.LEFT)
            tk.Label(status_inner, text=" Offline", font=("SF Pro Display", 13, "bold"),
                    fg=AXKAN_COLORS['error'], bg=AXKAN_COLORS['error_soft']).pack(side=tk.LEFT)
            tk.Label(status_inner, text=" — Saves locally", font=("SF Pro Display", 12),
                    fg=AXKAN_COLORS['gray'], bg=AXKAN_COLORS['error_soft']).pack(side=tk.LEFT)

            refresh_btn = tk.Button(status_inner, text="⟳", font=("SF Pro Display", 14),
                                   command=self.refresh_connection, bg=AXKAN_COLORS['error_soft'],
                                   fg=AXKAN_COLORS['error'], relief=tk.FLAT, cursor="hand2",
                                   borderwidth=0, activebackground=AXKAN_COLORS['error_soft'])
            refresh_btn.pack(side=tk.RIGHT)

        # ====== PENDING ORDERS CARD ======
        if self.pending_orders:
            pending_container = tk.Frame(main_container, bg=AXKAN_COLORS['white'])
            pending_container.pack(fill=tk.X, padx=25, pady=(15, 0))

            pending_card = tk.Frame(pending_container, bg=AXKAN_COLORS['warning_soft'],
                                   padx=16, pady=14)
            pending_card.pack(fill=tk.X)

            # Header row
            pending_header = tk.Frame(pending_card, bg=AXKAN_COLORS['warning_soft'])
            pending_header.pack(fill=tk.X)

            tk.Label(pending_header, text=f"📦 {len(self.pending_orders)} pending",
                    font=("SF Pro Display", 13, "bold"), fg=AXKAN_COLORS['dark'],
                    bg=AXKAN_COLORS['warning_soft']).pack(side=tk.LEFT)

            retry_btn = ModernUI.create_pill_button(
                pending_header, "Retry All", self.retry_pending_orders,
                bg_color=AXKAN_COLORS['warning'], fg_color="white",
                font_size=11, padx=14, pady=6
            )
            retry_btn.pack(side=tk.RIGHT)

            # Order list
            for order in self.pending_orders[:2]:
                tk.Label(pending_card, text=f"• {order['name']}",
                        font=("SF Pro Display", 11), fg=AXKAN_COLORS['gray'],
                        bg=AXKAN_COLORS['warning_soft'], anchor="w").pack(fill=tk.X, pady=(5, 0))

        # ====== MODE SELECTION SECTION ======
        modes_label = tk.Label(main_container, text="Choose mode",
                              font=("SF Pro Display", 18, "bold"), fg=AXKAN_COLORS['dark'],
                              bg=AXKAN_COLORS['white'])
        modes_label.pack(anchor="w", padx=25, pady=(25, 15))

        # Cards container
        cards_container = tk.Frame(main_container, bg=AXKAN_COLORS['white'])
        cards_container.pack(fill=tk.X, padx=25)

        # ====== MANUAL MODE CARD ======
        manual_card = tk.Frame(cards_container, bg=AXKAN_COLORS['pink_soft'],
                              padx=20, pady=20, cursor="hand2")
        manual_card.pack(fill=tk.X, pady=(0, 12))

        # Make entire card clickable
        manual_card.bind("<Button-1>", lambda e: self.start_manual_mode())

        # Icon and title row
        manual_header = tk.Frame(manual_card, bg=AXKAN_COLORS['pink_soft'])
        manual_header.pack(fill=tk.X)
        manual_header.bind("<Button-1>", lambda e: self.start_manual_mode())

        tk.Label(manual_header, text="🖼", font=("SF Pro Display", 28),
                bg=AXKAN_COLORS['pink_soft']).pack(side=tk.LEFT)

        manual_text = tk.Frame(manual_header, bg=AXKAN_COLORS['pink_soft'])
        manual_text.pack(side=tk.LEFT, padx=(12, 0))
        manual_text.bind("<Button-1>", lambda e: self.start_manual_mode())

        title1 = tk.Label(manual_text, text="Manual Mode", font=("SF Pro Display", 16, "bold"),
                fg=AXKAN_COLORS['pink'], bg=AXKAN_COLORS['pink_soft'])
        title1.pack(anchor="w")
        title1.bind("<Button-1>", lambda e: self.start_manual_mode())

        desc1 = tk.Label(manual_text, text="Paste images one by one",
                font=("SF Pro Display", 12), fg=AXKAN_COLORS['gray'],
                bg=AXKAN_COLORS['pink_soft'])
        desc1.pack(anchor="w")
        desc1.bind("<Button-1>", lambda e: self.start_manual_mode())

        arrow1 = tk.Label(manual_header, text="→", font=("SF Pro Display", 20),
                fg=AXKAN_COLORS['pink'], bg=AXKAN_COLORS['pink_soft'])
        arrow1.pack(side=tk.RIGHT)
        arrow1.bind("<Button-1>", lambda e: self.start_manual_mode())

        # ====== AUTO-CROP MODE CARD ======
        auto_card = tk.Frame(cards_container, bg=AXKAN_COLORS['green_soft'],
                            padx=20, pady=20, cursor="hand2")
        auto_card.pack(fill=tk.X, pady=(0, 12))

        auto_card.bind("<Button-1>", lambda e: self.start_autocrop_mode())

        # Icon and title row
        auto_header = tk.Frame(auto_card, bg=AXKAN_COLORS['green_soft'])
        auto_header.pack(fill=tk.X)
        auto_header.bind("<Button-1>", lambda e: self.start_autocrop_mode())

        tk.Label(auto_header, text="✂️", font=("SF Pro Display", 28),
                bg=AXKAN_COLORS['green_soft']).pack(side=tk.LEFT)

        auto_text = tk.Frame(auto_header, bg=AXKAN_COLORS['green_soft'])
        auto_text.pack(side=tk.LEFT, padx=(12, 0))
        auto_text.bind("<Button-1>", lambda e: self.start_autocrop_mode())

        title2 = tk.Label(auto_text, text="Auto-Crop", font=("SF Pro Display", 16, "bold"),
                fg=AXKAN_COLORS['green'], bg=AXKAN_COLORS['green_soft'])
        title2.pack(anchor="w")
        title2.bind("<Button-1>", lambda e: self.start_autocrop_mode())

        desc2 = tk.Label(auto_text, text="Smart grid detection",
                font=("SF Pro Display", 12), fg=AXKAN_COLORS['gray'],
                bg=AXKAN_COLORS['green_soft'])
        desc2.pack(anchor="w")
        desc2.bind("<Button-1>", lambda e: self.start_autocrop_mode())

        # Badge
        badge = tk.Label(auto_header, text="⚡ Fast", font=("SF Pro Display", 10, "bold"),
                        fg=AXKAN_COLORS['green'], bg=AXKAN_COLORS['white'],
                        padx=8, pady=3)
        badge.pack(side=tk.RIGHT, padx=(0, 10))

        arrow2 = tk.Label(auto_header, text="→", font=("SF Pro Display", 20),
                fg=AXKAN_COLORS['green'], bg=AXKAN_COLORS['green_soft'])
        arrow2.pack(side=tk.RIGHT)
        arrow2.bind("<Button-1>", lambda e: self.start_autocrop_mode())

        # ====== FOOTER ======
        footer = tk.Frame(main_container, bg=AXKAN_COLORS['white'])
        footer.pack(side=tk.BOTTOM, fill=tk.X, pady=20)

        tk.Label(footer, text="PDF Generator v2.0",
                font=("SF Pro Display", 11), fg=AXKAN_COLORS['gray_light'],
                bg=AXKAN_COLORS['white']).pack()

    def refresh_connection(self):
        """Re-check the connection status"""
        self.connection_ok = ConnectionChecker.is_output_path_available()
        self.pending_orders = ConnectionChecker.get_pending_orders()
        # Rebuild UI
        for widget in self.root.winfo_children():
            widget.destroy()
        self.setup_ui()
        if self.connection_ok:
            messagebox.showinfo("Connected", "Network connection is now available!")
        else:
            messagebox.showwarning("Still Offline", "Network path still not available.\n\nMake sure the server is connected.")

    def retry_pending_orders(self):
        """Retry submitting all pending orders"""
        if not ConnectionChecker.is_output_path_available():
            messagebox.showerror("No Connection",
                "Cannot retry - network path is still not available.\n\n"
                "Please connect to the network first and click 'Check Connection'.")
            return

        success_count = 0
        fail_count = 0

        for order in self.pending_orders:
            try:
                data = ConnectionChecker.load_pending_order(order['folder'])
                if data:
                    pdf_gen = AxkanPDFGenerator()
                    pdf_path = pdf_gen.generate_pdf(
                        data['order_name'],
                        data['instructions'],
                        data['designs']
                    )
                    # Delete the pending order after success
                    ConnectionChecker.delete_pending_order(order['folder'])
                    success_count += 1
                    print(f"[Retry] Successfully saved: {data['order_name']}")
            except Exception as e:
                fail_count += 1
                print(f"[Retry] Failed: {order['name']} - {e}")

        # Refresh the UI
        self.pending_orders = ConnectionChecker.get_pending_orders()
        for widget in self.root.winfo_children():
            widget.destroy()
        self.setup_ui()

        if success_count > 0 and fail_count == 0:
            messagebox.showinfo("Success!", f"All {success_count} pending order(s) have been saved!")
        elif success_count > 0:
            messagebox.showwarning("Partial Success",
                f"Saved {success_count} order(s), but {fail_count} failed.\n\nFailed orders remain in pending list.")
        else:
            messagebox.showerror("Failed", "Could not save any pending orders.")

    def start_manual_mode(self):
        self.root.destroy()
        run_manual_mode()

    def start_autocrop_mode(self):
        self.root.destroy()
        run_autocrop_mode()

    def run(self):
        self.root.mainloop()


# ============================================================================
# MANUAL MODE - Original workflow
# ============================================================================
def run_manual_mode():
    """Original workflow: manual image paste"""
    print("\n" + "="*60)
    print("AXKAN - Manual Mode")
    print("="*60)

    dialog = UnifiedOrderDialog()
    details = dialog.show()
    if details == "main_menu":
        app = MainApplication()
        app.run()
        return
    if not details:
        print("Cancelled.")
        return

    order_name = details['order_name']
    instructions = details['instructions']
    num_designs = details['num_designs']

    print(f"Order: {order_name}, Designs: {num_designs}")

    editor = ImageEditorGUI(num_designs, order_name)
    image_paths = editor.run()
    if image_paths == "main_menu":
        app = MainApplication()
        app.run()
        return
    if image_paths is None:
        print("Cancelled.")
        return

    designs = []
    for i in range(num_designs):
        designs.append({
            'type': '',
            'quantity': 0,
            'image_path': image_paths.get(i)
        })

    generate_output(order_name, instructions, designs)


# ============================================================================
# AUTO-CROP MODE - New workflow
# ============================================================================
class AutoCropGUI:
    """GUI for auto-crop workflow"""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("AXKAN - Auto-Crop Mode")
        self.root.geometry("1000x800")
        self.root.configure(bg=AXKAN_COLORS['light'])

        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after(100, lambda: self.root.attributes('-topmost', False))
        self.root.focus_force()
        if sys.platform == 'darwin':
            os.system('''/usr/bin/osascript -e 'tell app "Finder" to set frontmost of process "Python" to true' ''')

        self.order_image = None
        self.cropped_designs = []
        self.grid_rows = 2
        self.grid_cols = 3

        self.setup_step1()

        self.root.bind('<Command-v>', lambda e: self.paste_image())
        self.root.bind('<Control-v>', lambda e: self.paste_image())

    def clear(self):
        for w in self.root.winfo_children():
            w.destroy()

    def setup_step1(self):
        """Step 1: Paste order image"""
        self.clear()

        header = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], height=80)
        header.pack(fill=tk.X)
        header.pack_propagate(False)
        logo = tk.Frame(header, bg=AXKAN_COLORS['dark'])
        logo.pack(pady=15)
        for letter, color in [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                               ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                               ('N', AXKAN_COLORS['red'])]:
            tk.Label(logo, text=letter, font=("Impact", 32, "bold"),
                    fg=color, bg=AXKAN_COLORS['dark']).pack(side=tk.LEFT)
        tk.Label(header, text="Auto-Crop Mode - Step 1: Load Order Image",
                font=("Helvetica", 11), fg="white", bg=AXKAN_COLORS['dark']).pack()

        content = tk.Frame(self.root, bg=AXKAN_COLORS['light'])
        content.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        tk.Label(content, text="Paste order image (Cmd+V) or browse",
                font=("Helvetica", 12), bg=AXKAN_COLORS['light']).pack(pady=10)

        preview = tk.Frame(content, bg="white", relief=tk.SUNKEN, borderwidth=2)
        preview.pack(fill=tk.BOTH, expand=True, pady=10)
        self.preview_label = tk.Label(preview, text="[No image]\n\nPaste with Cmd+V",
                                     font=("Helvetica", 16), bg="white", fg="gray")
        self.preview_label.pack(fill=tk.BOTH, expand=True)

        btns = tk.Frame(content, bg=AXKAN_COLORS['light'])
        btns.pack(pady=10)
        tk.Button(btns, text="<- Main Menu", command=self.go_to_main_menu,
                 font=("Helvetica", 12), padx=15, pady=10).pack(side=tk.LEFT, padx=10)
        tk.Button(btns, text="Paste (Cmd+V)", command=self.paste_image,
                 font=("Helvetica", 12, "bold"), highlightbackground=AXKAN_COLORS['green'],
                 padx=20, pady=10).pack(side=tk.LEFT, padx=10)
        tk.Button(btns, text="Browse", command=self.browse_image,
                 font=("Helvetica", 12), highlightbackground=AXKAN_COLORS['cyan'],
                 padx=20, pady=10).pack(side=tk.LEFT, padx=10)
        self.next_btn = tk.Button(btns, text="Next ->", command=self.setup_step2,
                                 font=("Helvetica", 12, "bold"), highlightbackground=AXKAN_COLORS['pink'],
                                 padx=20, pady=10, state=tk.DISABLED)
        self.next_btn.pack(side=tk.RIGHT, padx=10)

    def go_to_main_menu(self):
        """Return to main menu"""
        self.root.destroy()
        app = MainApplication()
        app.run()

    def paste_image(self):
        try:
            img = ImageGrab.grabclipboard()
            if isinstance(img, list) and img:
                img = PILImage.open(img[0]) if os.path.exists(img[0]) else None
            if isinstance(img, PILImage.Image):
                self.load_image(img)
            else:
                messagebox.showwarning("No Image", "No image in clipboard")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def browse_image(self):
        path = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg")])
        if path:
            self.load_image(PILImage.open(path))

    def load_image(self, img):
        self.order_image = img
        analyzer = OrderImageAnalyzer(img)
        self.grid_rows, self.grid_cols = analyzer.detect_grid_layout()

        preview = img.copy()
        preview.thumbnail((800, 500))
        photo = ImageTk.PhotoImage(preview)
        self.preview_label.config(image=photo, text="")
        self.preview_label.image = photo
        self.next_btn.config(state=tk.NORMAL)

        pending = Path("pending_analysis")
        pending.mkdir(exist_ok=True)
        self.order_image.save(str(pending / "order_image.png"), "PNG")

        messagebox.showinfo("Loaded", f"Detected: {self.grid_rows}x{self.grid_cols} grid")

    def setup_step2(self):
        """Step 2: Confirm grid and preview crops"""
        self.clear()

        header = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], height=80)
        header.pack(fill=tk.X)
        header.pack_propagate(False)
        logo = tk.Frame(header, bg=AXKAN_COLORS['dark'])
        logo.pack(pady=15)
        for letter, color in [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                               ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                               ('N', AXKAN_COLORS['red'])]:
            tk.Label(logo, text=letter, font=("Impact", 32, "bold"),
                    fg=color, bg=AXKAN_COLORS['dark']).pack(side=tk.LEFT)
        tk.Label(header, text="Step 2: Confirm Grid Layout",
                font=("Helvetica", 11), fg="white", bg=AXKAN_COLORS['dark']).pack()

        content = tk.Frame(self.root, bg=AXKAN_COLORS['light'])
        content.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        grid_frame = tk.Frame(content, bg=AXKAN_COLORS['light'])
        grid_frame.pack(pady=10)
        tk.Label(grid_frame, text="Rows:", bg=AXKAN_COLORS['light']).pack(side=tk.LEFT)
        self.rows_var = tk.IntVar(value=self.grid_rows)
        tk.Spinbox(grid_frame, from_=1, to=6, width=5, textvariable=self.rows_var).pack(side=tk.LEFT, padx=5)
        tk.Label(grid_frame, text="Cols:", bg=AXKAN_COLORS['light']).pack(side=tk.LEFT, padx=(15, 0))
        self.cols_var = tk.IntVar(value=self.grid_cols)
        tk.Spinbox(grid_frame, from_=1, to=6, width=5, textvariable=self.cols_var).pack(side=tk.LEFT, padx=5)
        tk.Button(grid_frame, text="Preview", command=self.preview_crop,
                 highlightbackground=AXKAN_COLORS['orange']).pack(side=tk.LEFT, padx=20)

        self.crop_frame = tk.Frame(content, bg="white")
        self.crop_frame.pack(fill=tk.BOTH, expand=True, pady=10)
        self.preview_crop()

        btns = tk.Frame(content, bg=AXKAN_COLORS['light'])
        btns.pack(pady=10)
        tk.Button(btns, text="<- Back", command=self.setup_step1,
                 font=("Helvetica", 12), padx=20, pady=10).pack(side=tk.LEFT, padx=10)
        tk.Button(btns, text="Next: Enter Details ->", command=self.setup_step3,
                 font=("Helvetica", 12, "bold"), highlightbackground=AXKAN_COLORS['pink'],
                 padx=20, pady=10).pack(side=tk.RIGHT, padx=10)

    def preview_crop(self):
        for w in self.crop_frame.winfo_children():
            w.destroy()

        analyzer = OrderImageAnalyzer(self.order_image)
        self.cropped_designs = analyzer.crop_designs(self.rows_var.get(), self.cols_var.get())
        self.grid_rows, self.grid_cols = self.rows_var.get(), self.cols_var.get()

        canvas = tk.Canvas(self.crop_frame, bg="white")
        scrollbar = tk.Scrollbar(self.crop_frame, orient="horizontal", command=canvas.xview)
        scrollable = tk.Frame(canvas, bg="white")
        scrollable.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scrollable, anchor="nw")
        canvas.configure(xscrollcommand=scrollbar.set)
        canvas.pack(side="top", fill="both", expand=True)
        scrollbar.pack(side="bottom", fill="x")

        self.crop_photos = []
        for i, d in enumerate(self.cropped_designs):
            f = tk.Frame(scrollable, bg="white", relief=tk.RAISED, borderwidth=2)
            f.pack(side=tk.LEFT, padx=5, pady=5)
            thumb = d['image'].copy()
            thumb.thumbnail((150, 150))
            photo = ImageTk.PhotoImage(thumb)
            self.crop_photos.append(photo)
            tk.Label(f, image=photo, bg="white").pack(pady=5)
            tk.Label(f, text=f"Design {i+1}", font=("Helvetica", 10, "bold"), bg="white").pack()

    def setup_step3(self):
        """Step 3: Enter details"""
        self.clear()

        header = tk.Frame(self.root, bg=AXKAN_COLORS['dark'], height=80)
        header.pack(fill=tk.X)
        header.pack_propagate(False)
        logo = tk.Frame(header, bg=AXKAN_COLORS['dark'])
        logo.pack(pady=15)
        for letter, color in [('A', AXKAN_COLORS['pink']), ('X', AXKAN_COLORS['green']),
                               ('K', AXKAN_COLORS['orange']), ('A', AXKAN_COLORS['cyan']),
                               ('N', AXKAN_COLORS['red'])]:
            tk.Label(logo, text=letter, font=("Impact", 32, "bold"),
                    fg=color, bg=AXKAN_COLORS['dark']).pack(side=tk.LEFT)
        tk.Label(header, text="Step 3: Enter Order Details",
                font=("Helvetica", 11), fg="white", bg=AXKAN_COLORS['dark']).pack()

        content = tk.Frame(self.root, bg=AXKAN_COLORS['light'])
        content.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        row1 = tk.Frame(content, bg=AXKAN_COLORS['light'])
        row1.pack(fill=tk.X, pady=5)
        tk.Label(row1, text="Order Name:", font=("Helvetica", 11, "bold"),
                bg=AXKAN_COLORS['light']).pack(side=tk.LEFT)
        self.name_entry = tk.Entry(row1, font=("Helvetica", 12), width=40)
        self.name_entry.pack(side=tk.LEFT, padx=10)

        row2 = tk.Frame(content, bg=AXKAN_COLORS['light'])
        row2.pack(fill=tk.X, pady=5)
        tk.Label(row2, text="Instructions:", font=("Helvetica", 11, "bold"),
                bg=AXKAN_COLORS['light']).pack(side=tk.LEFT)
        self.instr_entry = tk.Entry(row2, font=("Helvetica", 12), width=40)
        self.instr_entry.pack(side=tk.LEFT, padx=10)

        row3 = tk.Frame(content, bg=AXKAN_COLORS['light'])
        row3.pack(fill=tk.X, pady=5)
        tk.Label(row3, text="Quick fill all:", bg=AXKAN_COLORS['light']).pack(side=tk.LEFT)
        for q in [50, 100, 200]:
            tk.Button(row3, text=str(q), command=lambda v=q: self.fill_qty(v),
                     highlightbackground=AXKAN_COLORS['cyan'], width=5).pack(side=tk.LEFT, padx=3)

        details_container = tk.Frame(content, bg=AXKAN_COLORS['light'])
        details_container.pack(fill=tk.BOTH, expand=True, pady=10)

        canvas = tk.Canvas(details_container, bg=AXKAN_COLORS['light'])
        scrollbar = tk.Scrollbar(details_container, orient="vertical", command=canvas.yview)
        self.details_frame = tk.Frame(canvas, bg=AXKAN_COLORS['light'])
        self.details_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.details_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.type_vars = {}
        self.qty_entries = {}
        self.detail_photos = []
        types = ["Imanes", "Llaveros", "Destapadores", "Portallaves"]
        colors_list = [AXKAN_COLORS['pink'], AXKAN_COLORS['green'], AXKAN_COLORS['orange'],
                      AXKAN_COLORS['cyan'], AXKAN_COLORS['red']]

        cols = 3
        for i, d in enumerate(self.cropped_designs):
            row, col = i // cols, i % cols
            f = tk.Frame(self.details_frame, bg="white", relief=tk.RAISED, borderwidth=2, padx=8, pady=8)
            f.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")

            tk.Label(f, text=f"Design {i+1}", font=("Helvetica", 9, "bold"),
                    bg=colors_list[i % 5], fg="white").pack(fill=tk.X)

            thumb = d['image'].copy()
            thumb.thumbnail((100, 80))
            photo = ImageTk.PhotoImage(thumb)
            self.detail_photos.append(photo)
            tk.Label(f, image=photo, bg="white").pack(pady=3)

            tf = tk.Frame(f, bg="white")
            tf.pack(fill=tk.X)
            tk.Label(tf, text="Tipo:", font=("Helvetica", 8), bg="white").pack(side=tk.LEFT)
            tv = tk.StringVar(value=types[0])
            tk.OptionMenu(tf, tv, *types).pack(side=tk.LEFT)
            self.type_vars[i] = tv

            qf = tk.Frame(f, bg="white")
            qf.pack(fill=tk.X)
            tk.Label(qf, text="Cant:", font=("Helvetica", 8), bg="white").pack(side=tk.LEFT)
            qe = tk.Entry(qf, font=("Helvetica", 9), width=6)
            qe.pack(side=tk.LEFT)
            self.qty_entries[i] = qe

        btns = tk.Frame(content, bg=AXKAN_COLORS['light'])
        btns.pack(pady=10)
        tk.Button(btns, text="<- Back", command=self.setup_step2,
                 font=("Helvetica", 12), padx=20, pady=10).pack(side=tk.LEFT, padx=10)
        tk.Button(btns, text="Generate PDF", command=self.generate,
                 font=("Helvetica", 14, "bold"), highlightbackground=AXKAN_COLORS['pink'],
                 padx=30, pady=15).pack(side=tk.RIGHT, padx=10)

    def fill_qty(self, val):
        for e in self.qty_entries.values():
            e.delete(0, tk.END)
            e.insert(0, str(val))

    def generate(self):
        name = self.name_entry.get().strip()
        if not name:
            messagebox.showwarning("Missing", "Enter order name")
            return

        instr = self.instr_entry.get().strip()

        temp = Path("temp_images")
        temp.mkdir(exist_ok=True)

        designs = []
        for i, d in enumerate(self.cropped_designs):
            img = d['image']
            if img.mode == 'RGBA':
                bg = PILImage.new('RGB', img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[3])
                img = bg
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            path = temp / f"design_{i}.jpg"
            img.save(str(path), "JPEG", quality=90)

            try:
                qty = int(self.qty_entries[i].get())
            except:
                qty = 0

            designs.append({
                'type': self.type_vars[i].get(),
                'quantity': qty,
                'image_path': str(path)
            })

        self.root.destroy()
        generate_output(name, instr, designs)

    def run(self):
        self.root.mainloop()


def run_autocrop_mode():
    """Auto-crop workflow"""
    print("\n" + "="*60)
    print("AXKAN - Auto-Crop Mode")
    print("="*60)
    gui = AutoCropGUI()
    gui.run()


# ============================================================================
# GENERATE OUTPUT - PDF only (with connection handling and retry)
# ============================================================================
def generate_output(order_name, instructions, designs, pending_folder=None):
    """
    Generate PDF with automatic backup and retry support.

    Args:
        order_name: Name of the order
        instructions: Order instructions
        designs: List of design dictionaries
        pending_folder: If retrying, the folder path to delete on success
    """
    num = len(designs)
    total_steps = 3
    progress = ProgressWindow("Creating Order", total_steps)

    pdf_path = None
    backup_folder = None

    try:
        # Step 1: Check connection
        progress.update(1, "Checking connection...")
        connection_ok = ConnectionChecker.is_output_path_available()

        if not connection_ok:
            progress.close()
            # Save order locally for later
            backup_folder = ConnectionChecker.save_pending_order(order_name, instructions, designs)

            result = messagebox.askquestion("No Connection",
                f"Network path is not available!\n\n"
                f"Your order '{order_name}' has been saved locally.\n"
                f"Backup location:\n{backup_folder}\n\n"
                f"Would you like to save a local copy of the PDF?",
                icon='warning')

            if result == 'yes':
                # Generate PDF to local backup folder
                try:
                    local_pdf_gen = AxkanPDFGenerator()
                    # Temporarily change output path
                    original_output = OUTPUT_PATH
                    local_pdf_path = Path(backup_folder) / f"{order_name}.pdf"

                    # Generate directly to backup folder
                    c = canvas.Canvas(str(local_pdf_path), pagesize=(local_pdf_gen.page_width, local_pdf_gen.page_height))
                    local_pdf_gen._draw_header(c, order_name, instructions, len(designs))
                    local_pdf_gen._draw_designs(c, designs)
                    c.save()

                    messagebox.showinfo("Local Copy Saved",
                        f"Local PDF saved to:\n{local_pdf_path}\n\n"
                        f"When you're connected again, open the app to retry saving to the network.")
                    open_file(str(local_pdf_path))
                except Exception as e:
                    messagebox.showwarning("Local Save Failed",
                        f"Could not create local PDF: {e}\n\n"
                        f"Your order data is still saved for retry.")
            else:
                messagebox.showinfo("Order Saved",
                    f"Your order has been saved locally.\n\n"
                    f"When you're connected again, open the app and click 'Retry All Now' to submit pending orders.")

            return

        # Step 2: Generate PDF to network
        progress.update(2, "Generating PDF...")
        pdf_gen = AxkanPDFGenerator()
        pdf_path = pdf_gen.generate_pdf(order_name, instructions, designs)
        progress.update(3, "PDF created!")

        progress.close()

        # If this was a retry, delete the pending order
        if pending_folder:
            ConnectionChecker.delete_pending_order(pending_folder)

        msg = f"PDF saved to:\n{pdf_path}"
        messagebox.showinfo("Success!", msg)

        if pdf_path:
            open_file(pdf_path)

    except Exception as e:
        progress.close()

        # Save order locally for recovery
        if not backup_folder:
            backup_folder = ConnectionChecker.save_pending_order(order_name, instructions, designs)

        # Show retry dialog
        show_retry_dialog(order_name, instructions, designs, backup_folder, str(e))


def show_retry_dialog(order_name, instructions, designs, backup_folder, error_msg):
    """Show a modern dialog to retry saving the order"""
    root = tk.Tk()
    root.title("AXKAN")
    root.geometry("450x420")
    root.configure(bg=AXKAN_COLORS['white'])
    root.resizable(False, False)

    x = (root.winfo_screenwidth() - 450) // 2
    y = (root.winfo_screenheight() - 420) // 2
    root.geometry(f"450x420+{x}+{y}")

    root.lift()
    root.attributes('-topmost', True)

    main = tk.Frame(root, bg=AXKAN_COLORS['white'], padx=30, pady=30)
    main.pack(fill=tk.BOTH, expand=True)

    # Error icon
    error_icon = tk.Label(main, text="⚠️", font=("SF Pro Display", 48),
                         bg=AXKAN_COLORS['white'])
    error_icon.pack(pady=(0, 15))

    # Title
    tk.Label(main, text="Save Failed", font=("SF Pro Display", 22, "bold"),
            bg=AXKAN_COLORS['white'], fg=AXKAN_COLORS['dark']).pack(pady=(0, 5))

    tk.Label(main, text=f"Could not save '{order_name}'",
            font=("SF Pro Display", 13), bg=AXKAN_COLORS['white'],
            fg=AXKAN_COLORS['gray']).pack(pady=(0, 15))

    # Error details card
    error_card = tk.Frame(main, bg=AXKAN_COLORS['error_soft'], padx=15, pady=12)
    error_card.pack(fill=tk.X, pady=(0, 15))
    tk.Label(error_card, text=f"{error_msg[:80]}..." if len(error_msg) > 80 else error_msg,
            font=("SF Pro Display", 11), bg=AXKAN_COLORS['error_soft'],
            fg=AXKAN_COLORS['error'], wraplength=380).pack()

    # Success backup info
    backup_card = tk.Frame(main, bg=AXKAN_COLORS['success_soft'], padx=15, pady=12)
    backup_card.pack(fill=tk.X, pady=(0, 20))

    tk.Label(backup_card, text="✓ Order saved locally",
            font=("SF Pro Display", 12, "bold"), bg=AXKAN_COLORS['success_soft'],
            fg=AXKAN_COLORS['success']).pack(anchor="w")
    tk.Label(backup_card, text="You can retry later from the main menu",
            font=("SF Pro Display", 11), bg=AXKAN_COLORS['success_soft'],
            fg=AXKAN_COLORS['gray']).pack(anchor="w")

    # Buttons
    btn_frame = tk.Frame(main, bg=AXKAN_COLORS['white'])
    btn_frame.pack(fill=tk.X, pady=(10, 0))

    def retry_now():
        root.destroy()
        if ConnectionChecker.is_output_path_available():
            generate_output(order_name, instructions, designs, pending_folder=backup_folder)
        else:
            messagebox.showerror("Still Offline",
                "Network is still not available.\n\n"
                "Your order is saved locally. Try again later.")

    def save_local():
        root.destroy()
        try:
            local_path = Path.home() / "Documents" / f"{order_name}.pdf"
            local_gen = AxkanPDFGenerator()
            c = canvas.Canvas(str(local_path), pagesize=(local_gen.page_width, local_gen.page_height))
            local_gen._draw_header(c, order_name, instructions, len(designs))
            local_gen._draw_designs(c, designs)
            c.save()
            messagebox.showinfo("Saved", f"PDF saved to:\n{local_path}")
            open_file(str(local_path))
        except Exception as e:
            messagebox.showerror("Error", f"Could not save: {e}")

    def close_dialog():
        root.destroy()

    # Retry button (primary)
    retry_btn = tk.Button(btn_frame, text="Retry Now", command=retry_now,
                         font=("SF Pro Display", 14, "bold"),
                         bg=AXKAN_COLORS['success'], fg="white",
                         relief=tk.FLAT, borderwidth=0, cursor="hand2",
                         padx=25, pady=12,
                         activebackground=AXKAN_COLORS['success'],
                         activeforeground="white")
    retry_btn.pack(fill=tk.X, pady=(0, 10))

    # Secondary buttons row
    secondary_frame = tk.Frame(btn_frame, bg=AXKAN_COLORS['white'])
    secondary_frame.pack(fill=tk.X)

    save_btn = tk.Button(secondary_frame, text="Save Local Copy", command=save_local,
                        font=("SF Pro Display", 12),
                        bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['dark'],
                        relief=tk.FLAT, borderwidth=0, cursor="hand2",
                        padx=20, pady=10,
                        activebackground=AXKAN_COLORS['light'])
    save_btn.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 5))

    close_btn = tk.Button(secondary_frame, text="Close", command=close_dialog,
                         font=("SF Pro Display", 12),
                         bg=AXKAN_COLORS['light'], fg=AXKAN_COLORS['gray'],
                         relief=tk.FLAT, borderwidth=0, cursor="hand2",
                         padx=20, pady=10,
                         activebackground=AXKAN_COLORS['light'])
    close_btn.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(5, 0))

    root.mainloop()


def open_file(path):
    try:
        if sys.platform == 'darwin':
            subprocess.run(['open', path])
        elif sys.platform == 'win32':
            os.startfile(path)
        else:
            subprocess.run(['xdg-open', path])
    except:
        pass


# ============================================================================
# MAIN
# ============================================================================
def main():
    print("="*60)
    print("AXKAN - Order System (PDF Generator)")
    print("="*60)
    app = MainApplication()
    app.run()


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Quick PDF Reference Sheet Generator
Opens dialog to ask for order name, then generates PDF directly
"""

import os
import tkinter as tk
from tkinter import simpledialog, messagebox
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfform
from PIL import Image as PILImage
import yaml


def load_config():
    """Load configuration"""
    with open('config.yaml', 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def ask_order_name():
    """Show dialog to ask for order name"""
    root = tk.Tk()
    root.withdraw()  # Hide main window

    order_name = simpledialog.askstring(
        "Order Name",
        "Enter the order name/number:",
        parent=root
    )

    root.destroy()
    return order_name


def generate_blank_pdf(order_name, config):
    """Generate a blank PDF template with the given order name"""

    # Create output directory
    output_dir = Path(config['output_path'])
    output_dir.mkdir(parents=True, exist_ok=True)

    # Create filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_filename = f"{order_name}_{timestamp}.pdf"
    output_path = output_dir / output_filename

    # PDF setup
    page_width, page_height = A4
    margin = config['layout']['margin'] * mm

    # Create PDF
    c = canvas.Canvas(str(output_path), pagesize=(page_width, page_height))

    # Draw header
    c.setFont("Helvetica-Bold", config['fonts']['title_size'])
    c.drawString(
#!/usr/bin/env python3
"""Create a test PDF with 33cm × 48cm page and 30cm × 39cm content rectangle"""

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
except ImportError:
    print("Installing reportlab...")
    import subprocess
    subprocess.check_call(['pip3', 'install', 'reportlab'])
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm

# Create test PDF with correct ADHESIVE paper size
output_path = "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2/tools/printing/test_33x48_with_30x39_rect.pdf"

# Define page size: 33cm x 48cm (ADHESIVE paper)
page_width = 33 * cm
page_height = 48 * cm

c = canvas.Canvas(output_path, pagesize=(page_width, page_height))

# Draw the 30cm x 39cm target rectangle (centered on page)
# Center it: (33-30)/2 = 1.5cm margin on each side, (48-39)/2 = 4.5cm top/bottom
rect_x = 1.5 * cm
rect_y = 4.5 * cm
rect_width = 30 * cm
rect_height = 39 * cm

# Draw the CRITICAL 30cm x 39cm rectangle
c.setStrokeColorRGB(1, 0, 0)  # Red border - THIS MUST BE EXACTLY 30cm x 39cm
c.setLineWidth(3)
c.rect(rect_x, rect_y, rect_width, rect_height)

# Draw page border to show full paper size
c.setStrokeColorRGB(0, 0, 1)  # Blue border for page
c.setLineWidth(1)
c.rect(0.2*cm, 0.2*cm, 32.6*cm, 47.6*cm)

# Add text
c.setFont("Helvetica-Bold", 24)
c.drawString(5*cm, 42*cm, "TEST PDF - ADHESIVE PAPER")

c.setFont("Helvetica", 14)
c.drawString(5*cm, 39.5*cm, "Page size: 33cm x 48cm (blue border)")
c.setStrokeColorRGB(1, 0, 0)
c.setFillColorRGB(1, 0, 0)
c.drawString(5*cm, 37.5*cm, "RED RECTANGLE: 30cm x 39cm (CRITICAL)")
c.setFillColorRGB(0, 0, 0)
c.drawString(5*cm, 35.5*cm, "This red rectangle MUST print at exactly 30cm x 39cm")
c.drawString(5*cm, 33.5*cm, "Currently prints at ~29.9cm x 38.9cm (needs correction)")

# Add measurement markers on the 30x39 rectangle
c.setFont("Helvetica", 10)
c.setFillColorRGB(1, 0, 0)

# Horizontal markers (30cm width)
for i in range(0, 31, 5):
    x = rect_x + i*cm
    c.drawString(x, rect_y - 0.5*cm, f"{i}cm")
    c.line(x, rect_y, x, rect_y - 0.3*cm)

# Vertical markers (39cm height)
for i in range(0, 40, 5):
    y = rect_y + i*cm
    c.drawString(rect_x - 1*cm, y, f"{i}cm")
    c.line(rect_x, y, rect_x - 0.3*cm, y)

# Add corner markers
c.setFillColorRGB(1, 0, 0)
c.circle(rect_x, rect_y, 0.2*cm, fill=1)  # Bottom-left
c.circle(rect_x + rect_width, rect_y, 0.2*cm, fill=1)  # Bottom-right
c.circle(rect_x, rect_y + rect_height, 0.2*cm, fill=1)  # Top-left
c.circle(rect_x + rect_width, rect_y + rect_height, 0.2*cm, fill=1)  # Top-right

c.save()
print(f"Test PDF created: {output_path}")
print(f"Page size: 33cm × 48cm")
print(f"Critical rectangle: 30cm × 39cm (RED)")
print(f"Measure the RED rectangle after printing to verify it's exactly 30cm × 39cm")

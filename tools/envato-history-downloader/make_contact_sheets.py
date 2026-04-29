#!/usr/bin/env python3
"""Build labeled contact-sheet grids of thumbnails for batch image classification.

Why: when an LLM classifier reads images one-at-a-time, it hits a cumulative
image-context dimension limit around ~80 reads. Tiling 72 thumbs onto a
single sheet collapses that into 1 read per sheet — orders of magnitude faster
and dodges the limit entirely.

Sheet dimensions are deliberately under 2000x2000 (per Anthropic's many-image
dimension cap). Each cell carries the leading 4-digit filename ID printed
underneath so the classifier can write `{id} {label}` lines per thumb.

Usage:
    python3 make_contact_sheets.py <input_dir> [thumbs_dir] [grids_dir]

Defaults:
    thumbs_dir = <input_dir>/_thumbs
    grids_dir  = <input_dir>/_grids
"""
import sys
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# Grid layout chosen to keep sheets under 2000x2000 px
COLS = 8
ROWS = 9
CELL = 175
LABEL_H = 22
PAD = 4
SHEET_W = COLS * CELL + (COLS + 1) * PAD          # 1436
SHEET_H = ROWS * (CELL + LABEL_H) + (ROWS + 1) * PAD  # 1813


def make_thumbs(src_dir: Path, thumbs_dir: Path):
    thumbs_dir.mkdir(exist_ok=True)
    src_files = sorted(src_dir.glob("*.jpg"))
    print(f"Generating {len(src_files)} thumbnails (256px) in {thumbs_dir}...")
    for f in src_files:
        out = thumbs_dir / f.name
        if out.exists():
            continue
        subprocess.run(
            ["sips", "-Z", "256", "-s", "format", "jpeg", "-s", "formatOptions", "60",
             str(f), "--out", str(out)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    print(f"  thumbnails ready: {len(list(thumbs_dir.glob('*.jpg')))}")


def make_grids(thumbs_dir: Path, grids_dir: Path):
    grids_dir.mkdir(exist_ok=True)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 14)
    except Exception:
        font = ImageFont.load_default()

    files = sorted(thumbs_dir.glob("*.jpg"))
    print(f"\nBuilding contact sheets ({COLS}x{ROWS} = {COLS*ROWS} thumbs/sheet) "
          f"from {len(files)} files...")

    sheet_idx = 0
    for batch_start in range(0, len(files), COLS * ROWS):
        sheet_idx += 1
        batch = files[batch_start:batch_start + COLS * ROWS]
        sheet = Image.new("RGB", (SHEET_W, SHEET_H), (250, 250, 250))
        draw = ImageDraw.Draw(sheet)
        for i, f in enumerate(batch):
            col = i % COLS
            row = i // COLS
            x = PAD + col * (CELL + PAD)
            y = PAD + row * (CELL + LABEL_H + PAD)
            try:
                im = Image.open(f).convert("RGB")
                im.thumbnail((CELL, CELL), Image.LANCZOS)
                ox = x + (CELL - im.width) // 2
                oy = y + (CELL - im.height) // 2
                sheet.paste(im, (ox, oy))
            except Exception:
                draw.rectangle([x, y, x + CELL, y + CELL], fill=(220, 220, 220))
                draw.text((x + 4, y + 4), "ERR", fill="red", font=font)
            label = f.name.split("_", 1)[0]
            draw.rectangle([x, y + CELL, x + CELL, y + CELL + LABEL_H], fill=(40, 40, 40))
            draw.text((x + 6, y + CELL + 4), label, fill="white", font=font)
        out = grids_dir / f"sheet_{sheet_idx:02d}.jpg"
        sheet.save(out, "JPEG", quality=80)
        print(f"  {out.name}: {len(batch)} thumbs")

    print(f"\nWrote {sheet_idx} sheets to {grids_dir}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src_dir = Path(sys.argv[1]).expanduser().resolve()
    thumbs_dir = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) > 2 else src_dir / "_thumbs"
    grids_dir = Path(sys.argv[3]).expanduser().resolve() if len(sys.argv) > 3 else src_dir / "_grids"

    if not src_dir.is_dir():
        print(f"ERR: input dir not found: {src_dir}")
        sys.exit(1)

    make_thumbs(src_dir, thumbs_dir)
    make_grids(thumbs_dir, grids_dir)


if __name__ == "__main__":
    main()

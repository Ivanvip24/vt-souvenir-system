#!/usr/bin/env python3
"""
AXKAN Content Studio — Flask Backend
=====================================
Serves all API endpoints for the AXKAN Studio frontend.

Usage:
    source studio/venv/bin/activate
    python studio/app.py

Requires: Flask, flask-cors, google-generativeai (optional)
Environment: GEMINI_API_KEY (optional — works without it via template fallbacks)
"""

import io
import os
import json
import uuid
import shutil
import random
import zipfile
import base64
import textwrap
import webbrowser
import subprocess
import time
import threading
from pathlib import Path
from datetime import datetime
from urllib.parse import quote

import re
import tempfile

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder=str(Path(__file__).resolve().parent), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB max upload
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
SESSIONS_DIR = BASE_DIR / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)
TMP_REF_DIR = BASE_DIR / "tmp-ref"
TMP_REF_DIR.mkdir(exist_ok=True)
ABORT_FILE = Path(tempfile.gettempdir()) / "axkan-abort-automation"
STUDIO_PORT = 8080

# Ensure claude CLI is findable in subprocess calls
_extra_paths = [
    os.path.expanduser("~/.npm-global/bin"),
    os.path.expanduser("~/.local/bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
]
for p in _extra_paths:
    if p not in os.environ.get("PATH", ""):
        os.environ["PATH"] = p + ":" + os.environ.get("PATH", "")

# In-memory session store
sessions: dict = {}

# Active automation tracking for abort
_active_automation = None
_active_claude_proc = None


def _kill_automation():
    """Kill all running automation (AppleScript, Claude CLI, clipboard helpers)."""
    global _active_automation, _active_claude_proc

    # 1. Create sentinel file (checked by AppleScript abort loops)
    try:
        ABORT_FILE.write_text("abort")
    except Exception:
        pass

    # 2. Kill tracked Claude CLI process
    if _active_claude_proc:
        try:
            _active_claude_proc.kill()
        except Exception:
            pass
        _active_claude_proc = None

    # 3. Kill osascript and System Events
    for cmd in [
        "killall -9 osascript 2>/dev/null || true",
        'killall -9 "System Events" 2>/dev/null || true',
        "pkill -9 -f clipboard_image 2>/dev/null || true",
    ]:
        try:
            subprocess.run(cmd, shell=True, timeout=5)
        except Exception:
            pass

    _active_automation = None
    print("[!] ABORT: Killed all automation")

    # Notification
    try:
        subprocess.Popen([
            "osascript", "-e",
            'display notification "All automation stopped" with title "ABORTED"',
        ])
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Gemini setup (optional)
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
genai = None
gemini_model = None

if GEMINI_API_KEY:
    try:
        import google.generativeai as _genai
        _genai.configure(api_key=GEMINI_API_KEY)
        genai = _genai
        gemini_model = _genai.GenerativeModel("gemini-2.0-flash")
        print("[AXKAN Studio] Gemini API configured OK")
    except Exception as e:
        print(f"[AXKAN Studio] Gemini setup failed: {e}")
        genai = None
else:
    print("[AXKAN Studio] No GEMINI_API_KEY — using template fallbacks")


# ---------------------------------------------------------------------------
# AXKAN Brand constants
# ---------------------------------------------------------------------------
AXKAN_COLORS = {
    "rosa": "#E72A88",
    "turquesa": "#09ADC2",
    "naranja": "#F39223",
    "verde": "#8AB73B",
}
ACCENT_CYCLE = list(AXKAN_COLORS.values())


# (Legacy product specs removed — system now generates social media content, not product designs)

# Slide role templates per content type
CAROUSEL_ROLES = [
    ("Portada / Hook", "SCROLL-STOPPER cover — the most striking, bold, high-contrast image of the sequence. Must create instant curiosity and demand the swipe. This slide alone determines if people engage."),
    ("Detalle Close-up", "Extreme close-up revealing textures, details, or patterns. Rewards the swipe with intimate visual detail you couldn't see on the cover."),
    ("Contexto / Lifestyle", "Lifestyle context shot — the subject in its real-world environment. Feels authentic, aspirational, lived-in. Shows the human side."),
    ("Perspectiva Diferente", "A completely different angle, mood, or visual treatment of the same subject — visual surprise that justifies continuing to swipe."),
    ("Behind the Scenes", "Behind-the-scenes, process, or making-of angle — adds depth, story, and authenticity. Shows what most people don't get to see."),
    ("Icónico / Cultural", "The iconic or cultural angle — connects emotionally to place, tradition, or identity. Triggers nostalgia, pride, or wanderlust."),
    ("Panorámica / Colección", "Wide shot, collection view, or overhead flat lay — shows the full picture, variety, or scale. Provides visual breathing room."),
    ("Cierre / CTA", "Final slide with maximum visual energy — bold, satisfying, conclusive. Must feel like the perfect ending that triggers saves and shares."),
]

REEL_ROLES = [
    ("Hook / Apertura", "ATTENTION GRAB in under 1 second — dramatic zoom, reveal, or unexpected angle. Must make viewers stop scrolling instantly. High energy, high contrast."),
    ("Reveal", "The main reveal — cinematic drama, dramatic lighting, the 'wow' moment that delivers on the hook's promise."),
    ("Detalle", "Intimate close-up — texture, color depth, fine details. ASMR-level visual satisfaction."),
    ("Lifestyle", "Real-world context — someone experiencing, using, or interacting with the subject. Authentic, aspirational, relatable."),
    ("Variante", "Different angle, mood, or variation — quick visual shift that keeps attention and shows range."),
    ("Cierre / CTA", "High-energy closing — bold visual conclusion, satisfying ending. Triggers replay, save, and share."),
]

DESTINATIONS_LANDMARKS = {
    "cancun": ["playa turquesa", "zona hotelera", "ruinas de Tulum", "El Meco", "Isla Mujeres"],
    "cdmx": ["Palacio de Bellas Artes", "Ángel de la Independencia", "Zócalo", "Chapultepec", "Coyoacán"],
    "oaxaca": ["Monte Albán", "Hierve el Agua", "alebrijes", "mercado Benito Juárez", "iglesia de Santo Domingo"],
    "guadalajara": ["Catedral", "Hospicio Cabañas", "mariachis", "Tlaquepaque", "Lago de Chapala"],
    "playa del carmen": ["Quinta Avenida", "cenotes", "arrecife", "Xcaret", "Cozumel"],
    "los cabos": ["El Arco", "playa del Amor", "desierto y mar", "ballenas", "atardecer dorado"],
    "merida": ["catedral", "Paseo de Montejo", "haciendas", "Uxmal", "Chichén Itzá"],
    "puerto vallarta": ["Malecón", "Los Arcos", "Sierra Madre", "bahía de Banderas", "zona romántica"],
    "san miguel de allende": ["Parroquia", "calles empedradas", "globos de Cantoya", "arte callejero", "atardecer colonial"],
}


def _get_landmarks(destination: str) -> list[str]:
    key = destination.lower().strip()
    for k, v in DESTINATIONS_LANDMARKS.items():
        if k in key or key in k:
            return v
    return [
        f"iconic landmark of {destination}",
        f"colorful street scene in {destination}",
        f"traditional market in {destination}",
        f"sunset view of {destination}",
        f"local flora and fauna of {destination}",
    ]


# ---------------------------------------------------------------------------
# Helper: get or create session
# ---------------------------------------------------------------------------
def get_session(session_id: str | None = None) -> tuple[str, dict]:
    if session_id and session_id in sessions:
        return session_id, sessions[session_id]
    sid = session_id or uuid.uuid4().hex[:12]
    sess = {
        "id": sid,
        "destination": "",
        "content_type": "carousel",
        "prompts": [],
        "uploaded_files": [],
        "clean_files": [],
        "overlay_specs": [],
        "created": datetime.now().isoformat(),
    }
    sessions[sid] = sess
    (SESSIONS_DIR / sid).mkdir(parents=True, exist_ok=True)
    return sid, sess


# ---------------------------------------------------------------------------
# 1. POST /api/prompts/generate
# ---------------------------------------------------------------------------
@app.route("/api/prompts/generate", methods=["POST"])
def prompts_generate():
    data = request.json or {}
    destination = data.get("destination", "México")
    slides = int(data.get("slides", 6))
    content_type = data.get("content_type", "carousel")
    theme = data.get("theme", "")
    # Support both single reference_image and array reference_images
    reference_images = data.get("reference_images", [])
    if not reference_images:
        single = data.get("reference_image")
        if single:
            reference_images = [single]

    is_reel = content_type in ("reel", "living")
    is_video = is_reel

    print(f"\n[PROMPTS] === Generate request: dest={destination}, slides={slides}, type={content_type}, theme={theme[:50] if theme else ''}, ref_images={len(reference_images)} ===")

    sid, sess = get_session()
    sess["destination"] = destination
    sess["content_type"] = content_type

    landmarks = _get_landmarks(destination)

    # Use Claude CLI (analyzes reference image, generates quality prompts)
    try:
        prompts = _generate_prompts_claude(
            destination, slides, content_type,
            theme, reference_images, is_reel, landmarks,
        )
        if prompts and len(prompts) > 0:
            sess["prompts"] = prompts
            return jsonify({
                "success": True,
                "session_id": sid,
                "prompts": prompts,
                "destination": destination,
                "total_slides": len(prompts),
                "is_reel": is_reel,
            })
    except Exception as e:
        import traceback
        print(f"[Claude CLI error] {e} — falling back to templates")
        traceback.print_exc()

    # Template fallback (only if Claude CLI fails)
    print("[PROMPTS] WARNING: Using TEMPLATE fallback — Claude CLI failed or returned empty")
    prompts = _generate_prompts_template(
        destination, slides, content_type,
        theme, is_reel, landmarks,
    )
    sess["prompts"] = prompts
    return jsonify({
        "success": True,
        "session_id": sid,
        "prompts": prompts,
        "destination": destination,
        "total_slides": len(prompts),
        "is_reel": is_reel,
    })


def _generate_prompts_claude(
    destination, slides, content_type,
    theme, reference_images, is_reel, landmarks,
):
    """Use Claude CLI to generate prompts — one per slide, ALL IN PARALLEL."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    role_list = REEL_ROLES if is_reel else CAROUSEL_ROLES

    # Build reference image analysis block
    ref_analysis_block = ""
    if reference_images:
        ref_count = len(reference_images)
        ref_analysis_block = f"""
REFERENCE IMAGE{"S" if ref_count > 1 else ""} ({ref_count} provided):
Use the Read tool to read {"each" if ref_count > 1 else "the"} reference image file{"s" if ref_count > 1 else ""} in the working directory.

After reading, extract:
A) ART STYLE: line style, shading, proportions, color approach, rendering technique, overall aesthetic
B) COMPOSITION: layout, background, supporting elements, decorative details
C) CHARACTER/SUBJECT: identity, clothing, expressions, accessories

Then generate a prompt that REPLICATES the exact visual style from the reference.
Be hyper-specific about the style. Do NOT change the art style or use generic descriptions.
"""

    # Content-type-specific best practices
    content_type_block = ""
    if content_type == "carousel":
        content_type_block = """
INSTAGRAM CAROUSEL BEST PRACTICES:
- This is ONE slide in a swipeable carousel sequence
- SLIDE 1 must stop the scroll in 0.5s — bold, high-contrast, curiosity gap
- Visual consistency: same palette, style, and visual language across all slides
- High contrast, vivid saturated colors — 2x better feed performance
- Clean, uncluttered — one hero element per slide
- Each slide must reveal something NEW to justify the swipe
- Saveable designs (carousels get 22% more saves than single posts)
- Last slide: strong visual energy for CTA
- Format: 4:5 vertical (1080x1350px)
"""
    elif content_type == "living":
        content_type_block = """
INSTAGRAM VIDEO CAROUSEL (ANIMATED) BEST PRACTICES:
- This image becomes a 3-5 second video clip in a swipeable video carousel
- Video carousels get 2-3x more reach than static (Instagram prioritizes video)
- Design for MOTION: include depth layers (foreground, subject, background) for parallax
- Slow, intentional camera movement: push-ins, gentle pans, parallax shifts
- One dominant motion direction per slide — no chaotic movement
- First frame must work as static thumbnail (most see it paused)
- Must work on mute — text overlays carry the message
- Uniform color grading across all clips
- Seamless transitions: match exit frame to next slide's entry frame
- Format: 9:16 vertical (1080x1920px) — 3-5 sec per clip
"""
    elif content_type == "post":
        content_type_block = """
INSTAGRAM SINGLE POST BEST PRACTICES:
- ONE shot to stop the scroll and earn the save
- Single strong focal point — one subject, one message, one visual anchor
- High contrast between subject and background is the #1 scroll-stop factor
- Warm tones (amber, terracotta, coral) outperform cool tones
- Monochromatic or two-tone palettes read faster than multi-color
- Dark backgrounds with bright subjects ("light in tunnel" effect)
- Human faces with direct eye contact increase dwell time 2-3x
- Foreground/background depth separation (blur, contrast, scale)
- Full-bleed, no visible margins
- Subtle grain/texture for premium feel — saturated but not neon
- Save triggers: actionable value, bold stats, reference-worthy design
- Format: 4:5 vertical (1080x1350px)
"""
    elif content_type == "pitch":
        content_type_block = """
B2B PITCH DECK BEST PRACTICES:
- This is a professional PDF pitch page. Build trust and drive conversion.
- 60-70% whitespace — cluttered = amateur
- 2 fonts max + 3 brand colors + 1 accent
- One key stat per page, displayed large (48pt+)
- Real photography over stock; mockups in context build credibility
- Icons over bullet points
- Lead with THEIR ROI, not your features
- Page roles: Cover > Problem > Solution > Social Proof > Pricing > CTA
- Under 500 total words across all pages
- End with exactly ONE clear CTA
- Format: A4 landscape (16:9)
"""
    elif is_reel:
        content_type_block = """
INSTAGRAM REEL/VIDEO BEST PRACTICES:
- This image becomes a video clip. Design for MOTION and CINEMA.
- Hook in under 1 second — dramatic angle, extreme close-up, or unexpected reveal
- Cinematic lighting: dramatic shadows, rim light, golden hour, studio
- Depth of field: sharp subject, soft background (bokeh)
- Rich color grading: warm for lifestyle, cool for modern, vivid for energy
- Depth layers (foreground, subject, background) for parallax animation
- Dynamic angles: overhead flat lay, 45-degree hero, extreme macro, sweeping wide
- Pattern interrupt: unexpected visual that breaks the scroll
- Visual satisfaction: oddly satisfying details, symmetry, smooth transitions
- Emotional trigger: nostalgia, pride, wanderlust, aspiration
- Format: 9:16 vertical (1080x1920px)
"""

    # Save reference images to a shared temp dir
    tmp_dir = tempfile.mkdtemp(prefix="claude-prompts-")
    saved_ref_paths = []
    if reference_images:
        for idx, ref_img in enumerate(reference_images[:3]):
            if ref_img and ref_img.startswith("data:"):
                m = re.match(r"^data:image/([^;]+);base64,(.+)$", ref_img, re.DOTALL)
                if m:
                    ext = "jpg" if m.group(1) == "jpeg" else m.group(1)
                    img_path = os.path.join(tmp_dir, f"reference_{idx+1}.{ext}")
                    with open(img_path, "wb") as f:
                        f.write(base64.b64decode(m.group(2)))
                    saved_ref_paths.append(img_path)

    has_refs = len(saved_ref_paths) > 0

    # --- Generate ONE slide per thread ---
    def generate_single_slide(slide_num):
        """Generate a single slide prompt via Claude CLI."""
        idx = (slide_num - 1) % len(role_list)
        role_name, role_desc = role_list[idx]

        # All other slides context (so Claude knows the full sequence)
        other_roles = "\n".join(
            f"    Slide {i+1}: {name} — {desc}"
            for i, (name, desc) in enumerate(role_list[:slides])
            if i != (slide_num - 1)
        )

        system = textwrap.dedent(f"""\
            You are a world-class prompt engineer and creative director for AXKAN brand social media content.
            You create PROFESSIONAL, VIRAL-QUALITY image prompts for Instagram.

            AXKAN BRAND IDENTITY — ALL content must reflect this visual identity:
            - Brand: AXKAN — premium Mexican cultural brand.
            - Color palette: Rosa Mexicano #E72A88 (primary), Turquesa Caribe #09ADC2, Naranja Calido #F39223, Verde Selva #8AB73B, Rojo #E52421
            - Color rule: 60% white/neutral, 30% Rosa Mexicano, 10% accent colors
            - Typography feel: Bold, chunky, impactful headlines. Clean condensed body text.
            - Visual style: Premium, culturally authentic, vibrant but NOT neon. Saturated rich tones.
            - Embraces: Pre-Hispanic symbolism, regional authenticity, sophisticated palettes
            - Rejects: Stereotypes (sombreros/mustaches), neon gaudy colors, cheap tourist aesthetics
            - Pattern elements: Tropical flowers, spiral motifs (caracol), tropical leaves, Mayan grecas
            - Mood: Adventurous, fresh, passionate, colorful, vibrant — like a piña on a hot day.

            AXKAN PRODUCT REALITY — CRITICAL, read carefully:
            - AXKAN products are FLAT laser-cut MDF souvenirs with PRINTED illustrations
            - They are FLAT pieces of wood (2-3mm thin) with vivid colorful prints on the surface
            - They are NOT 3D, NOT clay, NOT ceramic, NOT handmade, NOT hand-painted
            - They look like colorful illustrated stickers or fridge magnets — organic custom silhouette shapes
            - NO visible wood border or MDF edge in the design — the illustration goes edge to edge
            - The design IS the shape — like a die-cut sticker where the illustration defines the contour
            - Think: bold colorful illustrated flat magnets with destination names in chunky colorful letters
            - When showing products: vivid flat illustrated pieces, NOT 3D relief, NOT wood-framed

            MANDATORY TEXT LANGUAGE:
            - ALL text that appears ON images, slides, or videos MUST be in SPANISH 100%
            - Headlines, subheadlines, CTAs, destination names — everything in SPANISH
            - Never put English text on any visual. Spanish only.

            PEOPLE & REALISM:
            - When people appear in images, they MUST look hyperrealistic — real skin texture, real lighting
            - No cartoon people, no illustrated people, no AI-looking uncanny faces
            - Professional photography quality for all human elements

            You are creating SOCIAL MEDIA CONTENT — images posted on Instagram as {content_type}s.
            The content MUST look and feel like AXKAN brand — premium, culturally rich, Rosa Mexicano accented.

            Topic/Subject: {destination}
            {'Theme/mood: ' + theme if theme else ''}
            Content type: {content_type} ({'video clips' if is_reel else 'static images'})
            Local context: {', '.join(landmarks)}
{content_type_block}
{ref_analysis_block}
            YOUR TASK: Generate exactly ONE prompt for SLIDE {slide_num} of {slides}.

            YOUR SLIDE ROLE: {role_name} — {role_desc}

            The full carousel sequence (for context, so your slide fits the story):
{other_roles}

            The prompt must be a vivid, NATURAL LANGUAGE description (80-150 words).
            Professional photography/editorial quality — specify camera angle, lighting, color mood, composition.
            Any text visible in the image MUST be in SPANISH.
            {'Also generate a short voiceover "speech" (1-2 sentences in Spanish, casual and engaging).' if is_reel else ''}

            Respond with ONLY valid JSON, no markdown fences, no explanation:
            {{
                "slide_number": {slide_num},
                "slide_name": "{role_name}",
                "prompt_text": "the vivid prompt in English (but any TEXT VISIBLE IN THE IMAGE must be written in SPANISH within the prompt)...",
                {"\"speech\": \"narracion en espanol...\"," if is_reel else ""}
                "estimated_time": "~30s"
            }}
        """)

        user_msg = (
            f"Generate 1 professional {content_type} image prompt for SLIDE {slide_num}: {role_name}. "
            f"Topic: {destination}."
        )
        if theme:
            user_msg += f" Theme: {theme}."

        if has_refs:
            paths_str = "\n".join(f"  - {p}" for p in saved_ref_paths)
            user_msg += (
                f"\n\nRead ALL reference images at:\n{paths_str}\n"
                f"Analyze the style deeply and generate a prompt that MATCHES this visual style."
            )

        # Write to per-slide temp files
        slide_dir = os.path.join(tmp_dir, f"slide_{slide_num}")
        os.makedirs(slide_dir, exist_ok=True)
        sys_file = os.path.join(slide_dir, "system.txt")
        with open(sys_file, "w") as f:
            f.write(system)

        max_turns = "3" if has_refs else "1"
        cmd = [
            "claude", "-p",
            "--system-prompt-file", sys_file,
            "--max-turns", max_turns,
        ]
        if has_refs:
            cmd.extend(["--allowedTools", "Read,Glob"])

        print(f"  [Slide {slide_num}] Starting generation...")
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, cwd=tmp_dir,
        )
        try:
            stdout, stderr = proc.communicate(input=user_msg, timeout=90)
        except subprocess.TimeoutExpired:
            proc.kill()
            raise ValueError(f"Slide {slide_num} timed out")

        output = stdout.strip()
        if not output or len(output) < 20:
            raise ValueError(f"Slide {slide_num} empty output")

        # Extract JSON object from output
        text = output
        if "```json" in text:
            text = text.split("```json", 1)[1]
            if "```" in text:
                text = text.split("```", 1)[0]
            text = text.strip()
        elif "```" in text:
            parts = text.split("```")
            if len(parts) >= 3:
                text = parts[1].strip()

        # Find JSON object { ... }
        brace_start = text.find("{")
        if brace_start >= 0:
            brace_end = text.rfind("}")
            if brace_end > brace_start:
                text = text[brace_start:brace_end + 1]

        result = json.loads(text)
        result["slide_number"] = slide_num
        result.setdefault("slide_name", role_name)
        result.setdefault("estimated_time", "~30s")
        if is_reel:
            result.setdefault("speech", "")
        else:
            result["speech"] = ""

        print(f"  [Slide {slide_num}] Done ✓")
        return result

    # Fire ALL slides in parallel
    print(f"[Claude Prompts] Generating {slides} prompts in PARALLEL for {destination}...")
    prompts = [None] * slides
    with ThreadPoolExecutor(max_workers=slides) as executor:
        futures = {
            executor.submit(generate_single_slide, i + 1): i
            for i in range(slides)
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                prompts[idx] = future.result()
            except Exception as e:
                print(f"  [Slide {idx+1}] FAILED: {e}")
                # Use role info for a minimal fallback
                role_name, role_desc = role_list[idx % len(role_list)]
                prompts[idx] = {
                    "slide_number": idx + 1,
                    "slide_name": role_name,
                    "prompt_text": f"Professional {content_type} image of {destination}. {role_desc}. {theme or ''}. Professional photography, vivid colors, 4:5 vertical.",
                    "speech": "",
                    "estimated_time": "~30s",
                }

    # Cleanup
    try:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass

    print(f"[Claude Prompts] All {slides} slides complete ✓")
    return prompts


def _generate_prompts_gemini(
    destination, slides, content_type,
    theme, reference_image, is_reel, landmarks,
):
    role_list = REEL_ROLES if is_reel else CAROUSEL_ROLES
    system_prompt = textwrap.dedent(f"""\
        You are a world-class creative director specializing in social media content.
        You create professional, viral-quality images for Instagram.

        Topic/Subject: {destination}
        Local context/elements: {', '.join(landmarks)}
        Content type: {content_type} ({'video clips' if is_reel else 'static images'})
        {'Theme/mood: ' + theme if theme else ''}

        Generate exactly {slides} detailed image-generation prompts for professional social media content.
        Each prompt must be 3-5 sentences describing the exact visual for an AI image generator.
        Include lighting, composition, color mood, camera angle, and atmosphere.
        DO NOT create product designs, souvenirs, or merchandise. Create real social media photography/graphics.
        {'Also generate a short voiceover/narration "speech" (1-2 sentences in Spanish) for each slide.' if is_reel else ''}

        Respond ONLY with valid JSON — an array of objects:
        [{{
            "slide_number": 1,
            "slide_name": "name",
            "prompt_text": "detailed prompt...",
            {"\"speech\": \"narration text...\"," if is_reel else ""}
            "estimated_time": "~30s"
        }}]
    """)

    resp = gemini_model.generate_content(system_prompt)
    text = resp.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    prompts = json.loads(text)

    # Normalize
    for i, p in enumerate(prompts):
        p.setdefault("slide_number", i + 1)
        p.setdefault("slide_name", f"Slide {i+1}")
        p.setdefault("estimated_time", "~30s")
        if is_reel:
            p.setdefault("speech", "")
        else:
            p["speech"] = ""
    return prompts[:slides]


def _generate_prompts_template(
    destination, slides, content_type,
    theme, is_reel, landmarks,
):
    role_list = REEL_ROLES if is_reel else CAROUSEL_ROLES
    prompts = []

    color_moods = [
        "warm golden hour tones with deep shadows",
        "cool blue and teal tones with crisp contrast",
        "vibrant saturated colors with high energy",
        "earthy warm tones with rich terracotta accents",
        "moody dramatic lighting with pops of vivid color",
        "bright and airy with soft pastel accents",
        "rich jewel tones — emerald, ruby, sapphire",
        "sunset palette — coral, amber, magenta, gold",
    ]
    composition_angles = [
        "centered hero composition with shallow depth of field",
        "dramatic low-angle perspective with sky in background",
        "overhead flat-lay arrangement on textured surface",
        "three-quarter angle with natural bokeh background",
        "extreme close-up macro detail shot with soft focus edges",
        "wide establishing shot with environmental storytelling",
        "dynamic diagonal composition with leading lines",
        "symmetrical frontal view with dramatic lighting",
    ]
    settings = [
        "rustic wooden table with warm ambient light",
        "colorful Mexican street with painted walls",
        "lush tropical garden with dappled sunlight",
        "modern minimalist surface with dramatic shadows",
        "bustling market with vibrant textiles and produce",
        "beach at golden hour with warm sand",
        "colonial architecture with cobblestone details",
        "cozy interior with natural window light",
    ]
    visual_elements = [
        "marigolds, candles, and warm textures",
        "tropical flowers, palm fronds, and natural light",
        "ocean waves, sand patterns, and sea glass",
        "cacti, succulents, and desert light",
        "architectural details, wrought iron, and stone textures",
        "street food, fresh produce, and clay pottery",
        "monarch butterflies, agave plants, and wildflowers",
        "textiles, embroidery patterns, and handcrafted objects",
    ]

    speeches_casual = [
        f"¡Mira lo increíble que es {destination}! Esto tienes que vivirlo.",
        f"¿Ya conoces {destination}? Es un lugar que te roba el corazón.",
        f"Los colores de {destination} son otro nivel. ¡Mira estos detalles!",
        f"Cada rincón de {destination} cuenta una historia diferente.",
        f"{destination} tiene una energía única. ¿Ya lo sentiste?",
        f"De {destination} para el mundo — pura magia mexicana.",
        f"Tu próximo viaje tiene que ser a {destination}. Así se ve.",
        f"¡Esto es {destination}! Desliza para ver más.",
    ]

    for i in range(slides):
        idx = i % len(role_list)
        role_name, role_desc = role_list[idx]
        landmark = landmarks[i % len(landmarks)]
        color_mood = color_moods[i % len(color_moods)]
        angle = composition_angles[i % len(composition_angles)]
        setting = settings[i % len(settings)]
        elements = visual_elements[i % len(visual_elements)]

        theme_line = f" Theme: {theme}." if theme else ""

        prompt_text = (
            f"Professional Instagram {content_type} image of {destination}. "
            f"This slide is the {role_name}: {role_desc}. "
            f"Composition: {angle}, set in {setting}. "
            f"Visual elements include {landmark}, {elements}. "
            f"Color mood: {color_mood}. "
            f"Professional photography quality — crisp, well-lit, editorial feel. "
            f"4:5 vertical format optimized for Instagram feed.{theme_line}"
        )

        speech = ""
        if is_reel:
            speech = speeches_casual[i % len(speeches_casual)]

        prompts.append({
            "slide_number": i + 1,
            "slide_name": role_name,
            "prompt_text": prompt_text,
            "speech": speech,
            "estimated_time": "~30s" if is_reel else "~45s",
        })

    return prompts


# ---------------------------------------------------------------------------
# ENVATO AUTOMATION (embedded — no external server needed)
# AppleScript → Chrome for Envato ImageGen and VideoGen.
# ---------------------------------------------------------------------------


def _enhance_prompt_for_video(raw_prompt, speech=""):
    """Use local claude CLI to enhance a raw user prompt into a cinematic video prompt."""
    system = (
        "You are a video prompt engineer for Envato Video Gen. "
        "Take the user's rough idea and rewrite it as a single, detailed, cinematic video generation prompt. "
        "Include: camera movement, lighting, mood, composition, timing, and visual style. "
        "Keep it under 300 words. Output ONLY the enhanced prompt, nothing else. "
        "Style: warm, bold, premium feel. Professional social media quality."
    )
    user_msg = raw_prompt
    if speech:
        user_msg += f"\n\nThe video should have this voiceover: {speech}"

    try:
        result = subprocess.run(
            ["claude", "-p", user_msg, "--system-prompt", system, "--max-turns", "1"],
            capture_output=True, text=True, timeout=60,
        )
        enhanced = result.stdout.strip()
        if enhanced and len(enhanced) > 50:
            return enhanced
    except Exception as e:
        print(f"[WARN] claude CLI failed: {e}")

    return raw_prompt


def _generate_character_video_prompt(character_description, dialogue, destination=""):
    """Use Claude CLI to generate a rich, cinematic character animation prompt."""
    system = (
        "You are a world-class animation prompt engineer for Envato Video Gen AI. "
        "You create EXTREMELY DETAILED character animation prompts with professional-grade "
        "animation directives. Your prompts are cinematic, precise, and produce stunning results.\n\n"
        "RULES:\n"
        "- Output ONLY the video prompt, nothing else. No explanations, no labels.\n"
        "- Write in a single flowing paragraph (no bullets, no numbered lists).\n"
        "- Include ALL of the following in every prompt:\n"
        "  1. STARTING POSE: Describe the character's exact starting position based on the reference image\n"
        "  2. ANIMATION PHYSICS: squash & stretch, anticipation, follow-through, overlapping action\n"
        "  3. SECONDARY MOTION: constant micro-movements (breathing, blinking, subtle sway)\n"
        "  4. CHARACTER-SPECIFIC PHYSICS: appendage physics (tails, ears, hair, gills, wings) with "
        "     pendulum/spring dynamics\n"
        "  5. TIMED ACTIONS: specific movements synchronized to the dialogue beats\n"
        "  6. FACIAL EXPRESSIONS: eye movements, blinks, mouth sync, emotion transitions\n"
        "  7. DIALOGUE INTEGRATION: embed the FULL dialogue in Spanish within the prompt using "
        "     DIALOGO: {\"text here\"} format. State: EL PERSONAJE SIEMPRE HABLA EN ESPANOL.\n"
        "  8. ENDING POSE: final expression and position\n"
        "  9. TECHNICAL: 24fps, 8-10 seconds, pure white infinite background, soft contact shadow\n"
        "- The prompt should be 150-250 words.\n"
        "- ALWAYS write the dialogue in Spanish exactly as provided.\n"
    )

    user_msg = (
        f"CHARACTER: {character_description}\n"
        f"DIALOGUE (Spanish): {dialogue}\n"
    )
    if destination:
        user_msg += f"DESTINATION: {destination}\n"
    user_msg += (
        "\nGenerate a single, rich, cinematic animation prompt for this character speaking "
        "this dialogue. Include animation physics, gesture timing, and the full dialogue embedded."
    )

    try:
        result = subprocess.run(
            ["claude", "-p", user_msg, "--system-prompt", system, "--max-turns", "1"],
            capture_output=True, text=True, timeout=90,
        )
        enhanced = result.stdout.strip()
        if enhanced and len(enhanced) > 80:
            print(f"[Character Prompt] Claude generated {len(enhanced)} chars")
            return enhanced
    except Exception as e:
        print(f"[WARN] Claude CLI failed for character prompt: {e}")

    # Fallback: build a reasonable prompt manually
    dest_phrase = f" en {destination}" if destination else ""
    return (
        f"Partiendo de la imagen de referencia donde el personaje ({character_description}) "
        f"esta de pie sobre fondo blanco puro infinito, animar al personaje con calidad "
        f"cinematografica profesional a 24fps durante 8-10 segundos aplicando fisica de animacion "
        f"de alta gama con squash & stretch, anticipacion, follow-through y overlapping action. "
        f"El personaje hace gestos expresivos con sus manos mientras habla, mueve la cabeza "
        f"con energia, parpadea naturalmente. EL PERSONAJE SIEMPRE HABLA EN ESPANOL. "
        f'DIALOGO: {{"{dialogue}"}}, '
        f"termina con una sonrisa amplia y pose orgullosa. "
        f"Sombra de contacto suave en el suelo blanco puro."
    )


def _sanitize_prompt(text):
    """Strip non-ASCII and banned words for safe AppleScript clipboard paste."""
    if not text:
        return text
    t = text
    # Unicode punctuation → ASCII
    for chars, rep in [
        ("\u2022\u2023\u25E6\u2043\u2219", "-"),
        ("\u2013\u2014\u2015", "-"),
        ("\u2018\u2019\u201A", "'"),
        ("\u201C\u201D\u201E", '"'),
    ]:
        for c in chars:
            t = t.replace(c, rep)
    t = t.replace("\u2026", "...").replace("\u00A0", " ").replace("\u00D7", "x")
    # Accented → ASCII
    replacements = {
        "áàâäã": "a", "ÁÀÂÄÃ": "A", "éèêë": "e", "ÉÈÊË": "E",
        "íìîï": "i", "ÍÌÎÏ": "I", "óòôöõ": "o", "ÓÒÔÖÕ": "O",
        "úùûü": "u", "ÚÙÛÜ": "U", "ñ": "n", "Ñ": "N", "ç": "c", "Ç": "C",
    }
    for chars, rep in replacements.items():
        for c in chars:
            t = t.replace(c, rep)
    # Strip remaining non-ASCII
    t = re.sub(r"[^\x00-\x7F]", "", t)
    # Banned words
    for word in ["punta", "sexo", "necked"]:
        t = re.sub(rf"\b{word}\b", "", t, flags=re.IGNORECASE)
    t = re.sub(r"  +", " ", t).strip()
    return t


def _sanitize_video_prompt(text):
    """Sanitize for video prompts — preserve accents, fix AXKAN terms."""
    if not text:
        return text
    t = text
    for chars, rep in [
        ("\u2022\u2023\u25E6\u2043\u2219", "-"),
        ("\u2013\u2014\u2015", "-"),
        ("\u2018\u2019\u201A", "'"),
        ("\u201C\u201D\u201E", '"'),
    ]:
        for c in chars:
            t = t.replace(c, rep)
    t = t.replace("\u2026", "...").replace("\u00A0", " ")
    t = re.sub(r"\biman\b", "imán", t, flags=re.IGNORECASE)
    t = re.sub(r"\baxkan\b", "axkán", t, flags=re.IGNORECASE)
    for word in ["punta", "sexo", "necked"]:
        t = re.sub(rf"\b{word}\b", "", t, flags=re.IGNORECASE)
    t = re.sub(r"  +", " ", t).strip()
    return t


def _write_ref_images(reference_images):
    """Decode base64 data URLs → write to tmp-ref/, return list of filenames."""
    # Clean old files
    for f in os.listdir(str(TMP_REF_DIR)):
        try:
            os.unlink(str(TMP_REF_DIR / f))
        except OSError:
            pass
    written = []
    for i, data_url in enumerate(reference_images[:3]):
        if not data_url or not data_url.startswith("data:"):
            continue
        m = re.match(r"^data:image/([^;]+);base64,(.+)$", data_url, re.DOTALL)
        if not m:
            continue
        ext = "jpg" if m.group(1) == "jpeg" else m.group(1)
        raw = base64.b64decode(m.group(2))
        if len(raw) > 20 * 1024 * 1024:
            continue
        fname = f"img-{i}.{ext}"
        (TMP_REF_DIR / fname).write_bytes(raw)
        written.append(fname)
    return written


def _generate_ref_upload_js(filenames):
    """Generate JS code for reference image upload on Envato ImageGen."""
    urls = [f"http://localhost:{STUDIO_PORT}/tmp-ref/{f}" for f in filenames]
    urls_json = json.dumps(urls)
    return f"""
window.__refUploadDone = false;
(async function() {{
  function sleep(ms){{ return new Promise(function(r){{ setTimeout(r, ms); }}); }}
  function findDropzone(){{
    var all = document.querySelectorAll('div, label, section, form');
    var best = null, bestArea = 0;
    for(var i=0;i<all.length;i++){{
      var el = all[i];
      var t = (el.textContent || '');
      if(t.length > 200) continue;
      if(/Sube hasta|Arrastra y suelta|Upload up to|Drag and drop/i.test(t)){{
        var r = el.getBoundingClientRect();
        var area = r.width * r.height;
        if(area > bestArea && area < 500000){{ best = el; bestArea = area; }}
      }}
    }}
    return best;
  }}
  function closeModal(){{
    var closeBtn = document.querySelector('[aria-label*="close" i], [aria-label*="cerrar" i]');
    if(closeBtn){{ try{{ closeBtn.click(); return; }}catch(e){{}} }}
    ['keydown','keyup'].forEach(function(et){{
      document.dispatchEvent(new KeyboardEvent(et, {{ key:'Escape', code:'Escape', keyCode:27, which:27, bubbles:true }}));
    }});
  }}
  try {{
    var anchor = window.__promptEl
      || document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"],[contenteditable=""],div[role=textbox],[role=textbox]')
      || document.querySelector('input[type=text]');
    if (anchor) {{
      var container = anchor.closest('form') || anchor.parentElement;
      for (var up = 0; up < 8 && container && container.querySelectorAll('button').length < 2; up++) {{
        container = container.parentElement;
      }}
      if (container) {{
        var btns = container.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {{
          var b = btns[i];
          var r = b.getBoundingClientRect();
          var txt = (b.textContent || '').trim();
          if (/gener/i.test(txt)) continue;
          if (/estilo|variaciones|cuadrado|vertical|horizontal|style|portrait|landscape|square/i.test(txt)) continue;
          if (r.width < 18 || r.height < 18 || r.width > 90 || r.height > 90) continue;
          var aria = (b.getAttribute('aria-label') || '').toLowerCase();
          if (txt.length <= 2 || /referenc|imagen|image|add|upload|sub/i.test(aria)) {{
            b.click();
            break;
          }}
        }}
      }}
    }}
    await sleep(700);
    var urls = {urls_json};
    var blobs = await Promise.all(urls.map(function(u) {{
      return fetch(u).then(function(r) {{ return r.ok ? r.blob() : null; }}).catch(function() {{ return null; }});
    }}));
    var files = [];
    blobs.forEach(function(blob, idx) {{
      if (!blob) return;
      var ext = (blob.type && blob.type.split('/')[1]) || 'png';
      files.push(new File([blob], 'ref' + idx + '.' + ext, {{ type: blob.type || 'image/png' }}));
    }});
    if (files.length === 0) {{ closeModal(); window.__refUploadDone = true; return; }}
    var dt = new DataTransfer();
    files.forEach(function(f){{ dt.items.add(f); }});
    var inputs = document.querySelectorAll('input[type=file]');
    if (inputs.length > 0) {{
      var fileInput = inputs[inputs.length - 1];
      try {{
        var desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files');
        if (desc && desc.set) desc.set.call(fileInput, dt.files);
        else fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
        fileInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }} catch(e) {{}}
    }}
    var dz = findDropzone();
    if (dz) {{
      try {{
        ['dragenter','dragover','drop'].forEach(function(t) {{
          var ev = new DragEvent(t, {{ bubbles: true, cancelable: true, composed: true }});
          try {{ Object.defineProperty(ev, 'dataTransfer', {{ value: dt }}); }} catch(e2) {{}}
          dz.dispatchEvent(ev);
        }});
      }} catch(e) {{}}
    }}
    await sleep(1200);
    closeModal();
    await sleep(200);
  }} catch(e) {{}}
  window.__refUploadDone = true;
}})();
"""


def _run_applescript(script, timeout=30):
    """Run AppleScript via osascript in background (fire-and-forget)."""
    global _active_automation

    # Clear stale abort file
    try:
        ABORT_FILE.unlink(missing_ok=True)
    except Exception:
        pass

    tmp = tempfile.mkdtemp(prefix="envato-")
    script_file = os.path.join(tmp, "automate.scpt")
    with open(script_file, "w") as f:
        f.write(script)

    def _run():
        global _active_automation
        try:
            proc = subprocess.Popen(
                ["osascript", script_file],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            _active_automation = proc
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            print("[WARN] AppleScript timed out")
            try:
                proc.kill()
            except Exception:
                pass
        except Exception as e:
            print(f"[WARN] AppleScript error: {e}")
        finally:
            _active_automation = None
            try:
                shutil.rmtree(tmp, ignore_errors=True)
            except Exception:
                pass

    threading.Thread(target=_run, daemon=True).start()


def _build_imagegen_applescript(prompt_file, aspect, ref_js_file=None):
    """Build AppleScript for a single Envato ImageGen tab — optimized for speed."""
    ref_section = ""
    if ref_js_file:
        ref_section = f"""
  set refJS to do shell script "cat " & quoted form of "{ref_js_file}"
  execute active tab of front window javascript refJS
  repeat 40 times
    set isDone to (execute active tab of front window javascript "window.__refUploadDone ? 'yes' : 'no'")
    if isDone is "yes" then exit repeat
    delay 0.1
  end repeat"""

    return f'''
tell application "Google Chrome"
  activate
  tell front window to make new tab with properties {{URL:"https://app.envato.com/image-gen"}}
  -- Fast page load poll
  repeat 30 times
    if not (loading of active tab of front window) then exit repeat
    delay 0.1
  end repeat
  -- Fast input poll
  repeat 20 times
    if (execute active tab of front window javascript "(document.querySelector('textarea')||document.querySelector('[contenteditable]')||document.querySelector('input[type=text]'))?'1':'0'") is "1" then exit repeat
    delay 0.1
  end repeat
  -- Focus input
  execute active tab of front window javascript "(function(){{var el=document.querySelector('textarea')||document.querySelector('[contenteditable=\\"true\\"]')||document.querySelector('input[type=text]');if(el){{el.focus();el.click();window.__promptEl=el;}}}})();"
  delay 0.15
end tell
-- Paste prompt via clipboard
do shell script "cat " & quoted form of "{prompt_file}" & " | pbcopy"
tell application "System Events" to keystroke "v" using command down
delay 0.4
tell application "Google Chrome"
{ref_section}
  -- Select aspect + click Generate in one JS block
  execute active tab of front window javascript "
    (function(){{
      var map={{'square':['square','cuadrado'],'portrait':['portrait','vertical','retrato'],'landscape':['landscape','horizontal','paisaje']}};
      var targets=map['{aspect}'.toLowerCase()]||['{aspect}'.toLowerCase()];
      var items=document.querySelectorAll('li,label,button,div[role=option],[role=menuitem],span');
      for(var i=0;i<items.length;i++){{var t=(items[i].textContent||'').trim().toLowerCase();if(t.length>0&&t.length<20){{for(var k=0;k<targets.length;k++){{if(t===targets[k]){{items[i].click();break;}}}}}}}}
      setTimeout(function(){{
        var items2=document.querySelectorAll('li,label,button,div[role=option],[role=menuitem],span');
        for(var i=0;i<items2.length;i++){{var t=(items2[i].textContent||'').trim().toLowerCase();if(t.length>0&&t.length<20){{for(var k=0;k<targets.length;k++){{if(t===targets[k]){{items2[i].click();break;}}}}}}}}
      }},300);
      setTimeout(function(){{
        var btns=document.querySelectorAll('button');
        for(var i=0;i<btns.length;i++){{var t=(btns[i].textContent||'').trim().toLowerCase();if(t==='generate'||t==='generar'){{if(!btns[i].disabled)btns[i].click();break;}}}}
      }},600);
    }})();
  "
end tell
return "done"
'''


# ---------------------------------------------------------------------------
# Serve tmp-ref files and debug endpoint
# ---------------------------------------------------------------------------
@app.route("/tmp-ref/<path:filename>")
def serve_tmp_ref(filename):
    resp = send_from_directory(str(TMP_REF_DIR), filename)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/envato-debug")
def envato_debug():
    step = request.args.get("step", "?")
    status = request.args.get("status", "?")
    print(f"[ENVATO-DEBUG] step={step} status={status}")
    return "ok"


@app.route("/api/abort", methods=["POST", "GET"])
def abort_automation():
    _kill_automation()
    if request.method == "GET":
        return (
            '<html><head><meta http-equiv="refresh" content="2;url=/"></head>'
            '<body style="background:#e72a88;color:white;font-family:sans-serif;'
            'display:flex;align-items:center;justify-content:center;height:100vh;'
            'font-size:32px;font-weight:bold;">ABORTED</body></html>'
        )
    return jsonify({"success": True, "killed": True})


# ---------------------------------------------------------------------------
# Gemini Automation (AppleScript → Chrome → gemini.google.com)
# ---------------------------------------------------------------------------
def _build_gemini_applescript_single(prompt_file):
    """Build AppleScript for a single Gemini image generation tab."""
    return f'''
tell application "Google Chrome"
  activate
  tell front window to make new tab with properties {{URL:"https://gemini.google.com/app"}}
  repeat 40 times
    if not (loading of active tab of front window) then exit repeat
    delay 0.15
  end repeat
  repeat 30 times
    if (execute active tab of front window javascript "document.querySelector('div[contenteditable=true][role=textbox]')?'1':'0'") is "1" then exit repeat
    delay 0.15
  end repeat
  delay 0.3
  -- Activate Image Mode
  execute active tab of front window javascript "var chips=document.querySelectorAll('button,a,div[role=button]');for(var c of chips){{if(c.textContent.includes('Create image')){{c.click();break;}}}} 'ok'"
  delay 0.6
  execute active tab of front window javascript "var el=document.querySelector('div[contenteditable=true][role=textbox]');if(el){{el.focus();el.click();}} 'ok'"
end tell
do shell script "cat " & quoted form of "{prompt_file}" & " | pbcopy"
tell application "System Events" to keystroke "v" using command down
delay 0.8
tell application "System Events"
  key code 36
end tell
return "done"
'''


@app.route("/api/gemini/send", methods=["POST"])
def gemini_send():
    data = request.get_json() or {}
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    tmp = tempfile.mkdtemp(prefix="gemini-")
    prompt_file = os.path.join(tmp, "prompt.txt")
    with open(prompt_file, "w") as f:
        f.write(_sanitize_prompt(prompt))

    script = _build_gemini_applescript_single(prompt_file)
    _run_applescript(script, timeout=30)

    print(f"[Gemini] Sending: prompt={len(prompt)} chars")
    return jsonify({"success": True, "message": "Sending to Gemini..."})


@app.route("/api/gemini/send-all", methods=["POST"])
def gemini_send_all():
    data = request.get_json() or {}
    prompts = data.get("prompts", [])
    if not prompts:
        return jsonify({"error": "No prompts provided"}), 400

    tmp = tempfile.mkdtemp(prefix="gemini-bulk-")
    prompt_files = []
    for i, p in enumerate(prompts):
        pf = os.path.join(tmp, f"prompt-{i}.txt")
        with open(pf, "w") as f:
            f.write(_sanitize_prompt(p))
        prompt_files.append(pf)

    tab_count = len(prompts)
    batch_size = 10

    script = '''
tell application "Google Chrome"
  activate
  set w to front window
end tell
'''
    for batch_start in range(0, tab_count, batch_size):
        batch_end = min(batch_start + batch_size, tab_count)
        bs = batch_end - batch_start

        script += f'\ntell application "Google Chrome"\n  set w to front window\n'
        for _ in range(bs):
            script += '  tell w to make new tab with properties {URL:"https://gemini.google.com/app"}\n'
        script += f"""
  set tabTotal to count of tabs of w
  repeat 50 times
    set allDone to true
    repeat with i from (tabTotal - {bs - 1}) to tabTotal
      if (loading of tab i of w) then set allDone to false
    end repeat
    if allDone then exit repeat
    delay 0.15
  end repeat
  delay 0.5
end tell
"""

        for i in range(batch_start, batch_end):
            idx_in_batch = i - batch_start
            pf = prompt_files[i]
            script += f"""
tell application "Google Chrome"
  set w to front window
  set tabTotal to count of tabs of w
  set active tab index of w to (tabTotal - {bs - 1 - idx_in_batch})
  repeat 20 times
    if (execute active tab of w javascript "document.querySelector('div[contenteditable=true][role=textbox]')?'1':'0'") is "1" then exit repeat
    delay 0.1
  end repeat
  execute active tab of w javascript "var chips=document.querySelectorAll('button,a,div[role=button]');for(var c of chips){{if(c.textContent.includes('Create image')){{c.click();break;}}}} 'ok'"
  delay 0.6
  execute active tab of w javascript "var el=document.querySelector('div[contenteditable=true][role=textbox]');if(el){{el.focus();el.click();}} 'ok'"
end tell
do shell script "cat " & quoted form of "{pf}" & " | pbcopy"
tell application "System Events" to keystroke "v" using command down
delay 0.8
tell application "System Events"
  key code 36
end tell
delay 0.3
"""

    script += '\nreturn "done"\n'
    _run_applescript(script, timeout=tab_count * 15)

    print(f"[Gemini Bulk] Sending: {tab_count} prompts")
    return jsonify({"success": True, "message": f"Opening {tab_count} Gemini tabs...", "count": tab_count})


# ---------------------------------------------------------------------------
# 2. POST /api/envato/send  (single image prompt → Envato ImageGen)
# ---------------------------------------------------------------------------
@app.route("/api/envato/send", methods=["POST"])
def envato_send():
    data = request.get_json() or {}
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    aspect_ratio = data.get("aspectRatio", "1:1")
    aspect_map = {"1:2": "Portrait", "2:1": "Landscape"}
    aspect = aspect_map.get(aspect_ratio, "Square")

    reference_images = data.get("referenceImages", [])
    ref_filenames = _write_ref_images(reference_images) if reference_images else []

    tmp = tempfile.mkdtemp(prefix="envato-")
    prompt_file = os.path.join(tmp, "prompt.txt")
    with open(prompt_file, "w") as f:
        f.write(_sanitize_prompt(prompt))

    ref_js_file = None
    if ref_filenames:
        ref_js_file = os.path.join(tmp, "ref-upload.js")
        with open(ref_js_file, "w") as f:
            f.write(_generate_ref_upload_js(ref_filenames))

    script = _build_imagegen_applescript(prompt_file, aspect, ref_js_file)
    _run_applescript(script, timeout=30)

    print(f"[Envato] Sending: prompt={len(prompt)} chars, aspect={aspect}, refs={len(ref_filenames)}")
    return jsonify({"success": True, "message": "Sending to Envato..."})


# ---------------------------------------------------------------------------
# 3. POST /api/envato/send-video  (single video prompt → Envato VideoGen)
# ---------------------------------------------------------------------------
@app.route("/api/envato/send-video", methods=["POST"])
def envato_send_video():
    data = request.get_json() or {}
    raw_prompt = data.get("prompt", "")
    speech = data.get("speech", "")
    if not raw_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    # Prompts are already generated by Claude — send directly, no re-enhancement
    combined = raw_prompt
    if speech and speech.strip():
        combined = f"{raw_prompt}\n\nVoiceover (Spanish): {speech}"

    prompt_b64 = base64.b64encode(_sanitize_video_prompt(combined).encode()).decode()

    reference_images = data.get("referenceImages", [])
    ref_filenames = _write_ref_images(reference_images) if reference_images else []

    # For VideoGen: click Start Frame → Upload an image → JS fetch+file input
    start_frame_section = ""
    if ref_filenames:
        ref_url = f"http://localhost:{STUDIO_PORT}/tmp-ref/{ref_filenames[0]}"
        start_frame_section = f"""
  -- Click "Start Frame" box
  execute tab myTab of w javascript "
    (function(){{
      var all = document.querySelectorAll('div');
      for (var i = 0; i < all.length; i++) {{
        var t = all[i].textContent.trim();
        if ((t === 'Start Frame(optional)' || t === 'Start Frame') && all[i].getBoundingClientRect().width >= 50) {{
          all[i].click(); return 'clicked';
        }}
      }}
      return 'not found';
    }})();
  "
  delay 1
  -- Click "Upload an image"
  execute tab myTab of w javascript "
    (function(){{
      var all = document.querySelectorAll('div, span');
      for (var i = 0; i < all.length; i++) {{
        var t = all[i].textContent.trim();
        if (t === 'Upload an image' || t === 'Upload animage') {{
          all[i].click(); return 'clicked';
        }}
      }}
      return 'not found';
    }})();
  "
  delay 1
  -- Upload image via JS fetch + file input (same method that worked in testing)
  execute tab myTab of w javascript "
    (async function(){{
      try {{
        var resp = await fetch('{ref_url}');
        var blob = await resp.blob();
        var file = new File([blob], 'start-frame.png', {{type: 'image/png'}});
        var dt = new DataTransfer();
        dt.items.add(file);
        var fi = document.querySelector('input[type=file]');
        if (!fi) return 'no file input';
        fi.files = dt.files;
        fi.dispatchEvent(new Event('change', {{bubbles:true}}));
        fi.dispatchEvent(new Event('input', {{bubbles:true}}));
        return 'uploaded';
      }} catch(e) {{ return 'error: ' + e.message; }}
    }})();
  "
  delay 2.5"""

    script = f'''
tell application "Google Chrome"
  set w to front window
  tell w to make new tab with properties {{URL:"https://labs.envato.com/video-gen"}}
  set myTab to (count of tabs of w)
  repeat 40 times
    if not (loading of tab myTab of w) then exit repeat
    delay 0.1
  end repeat
  delay 1.5

  -- STEP 1: Click textarea to focus it (this reveals the Start Frame / upload buttons)
  execute tab myTab of w javascript "
    var ta = document.querySelector('textarea');
    if(ta){{ ta.focus(); ta.click(); }}
    'focused';
  "
  delay 0.5

  -- STEP 2: Upload Start Frame image (click Start Frame button, then upload)
{start_frame_section}

  -- STEP 3: Select 9:16 aspect ratio
  execute tab myTab of w javascript "
    (function(){{
      var btns = document.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){{
        var t = btns[i].textContent.trim();
        if((t==='16:9' || t==='9:16' || t==='1:1') && btns[i].getBoundingClientRect().height>=40){{
          btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
          break;
        }}
      }}
      setTimeout(function(){{
        var all = document.querySelectorAll('button');
        for(var j=0;j<all.length;j++){{
          if(all[j].textContent.trim()==='9:16'){{
            all[j].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
            break;
          }}
        }}
      }}, 300);
    }})();
  "
  delay 0.5

  -- STEP 4: Settings — enable Sound + Speech
  execute tab myTab of w javascript "
    (function(){{
      var btns = document.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){{
        var r = btns[i].getBoundingClientRect();
        var t = btns[i].textContent.trim();
        if(t===''&&!btns[i].disabled&&r.width>=40&&r.width<=60&&r.height>=40&&r.height<=60&&btns[i].querySelector('svg')){{
          btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
          break;
        }}
      }}
      setTimeout(function(){{
        var all = document.querySelectorAll('button');
        for(var j=0;j<all.length;j++){{
          if(all[j].textContent.trim()==='Sound'&&!all[j].disabled){{
            all[j].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));break;
          }}
        }}
      }}, 400);
      setTimeout(function(){{
        var all = document.querySelectorAll('button');
        for(var j=0;j<all.length;j++){{
          if(all[j].textContent.trim()==='Speech'&&!all[j].disabled){{
            all[j].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));break;
          }}
        }}
      }}, 700);
      setTimeout(function(){{
        document.body.dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
      }}, 1000);
    }})();
  "
  delay 1.5
  -- Close dropdown
  execute tab myTab of w javascript "document.dispatchEvent(new KeyboardEvent('keydown',{{key:'Escape',code:'Escape',keyCode:27,bubbles:true}}));document.body.click();'ok';"
  delay 0.3

  -- STEP 5: Set prompt text
  execute tab myTab of w javascript "
    (function(){{
      var ta = document.querySelector('textarea');
      if(!ta) return 'no textarea';
      var decoded = new TextDecoder().decode(Uint8Array.from(atob('{prompt_b64}'), function(c){{return c.charCodeAt(0);}}));
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, decoded);
      ta.dispatchEvent(new Event('input', {{bubbles:true}}));
      ta.dispatchEvent(new Event('change', {{bubbles:true}}));
      return 'prompt set';
    }})();
  "
  delay 0.5

  -- STEP 6: Click Generate
  execute tab myTab of w javascript "
    (function(){{
      var btns = document.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){{
        if(btns[i].textContent.trim().toLowerCase().includes('generate')){{
          btns[i].disabled = false;
          btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
          return 'clicked';
        }}
      }}
      return 'not found';
    }})();
  "
end tell
return "done"
'''
    _run_applescript(script, timeout=45)
    print(f"[Envato Video] Sending: prompt={len(combined)} chars, refs={len(ref_filenames)}")
    return jsonify({"success": True, "message": "Sending to Envato Video Gen..."})


# ---------------------------------------------------------------------------
# 4. POST /api/envato/send-all  (bulk image prompts → Envato ImageGen)
# ---------------------------------------------------------------------------
@app.route("/api/envato/send-all", methods=["POST"])
def envato_send_all():
    data = request.get_json() or {}
    prompts = data.get("prompts", [])
    if not prompts:
        return jsonify({"error": "No prompts provided"}), 400

    aspect_ratios = data.get("aspectRatios", [])
    aspect_map = {"1:2": "Portrait", "2:1": "Landscape"}

    def map_aspect(r):
        return aspect_map.get(r, "Square")

    aspects = [map_aspect(r) for r in aspect_ratios] if aspect_ratios else ["Square"] * len(prompts)

    reference_images = data.get("referenceImages", [])
    ref_filenames = _write_ref_images(reference_images) if reference_images else []

    tmp = tempfile.mkdtemp(prefix="envato-bulk-")
    prompt_files = []
    for i, p in enumerate(prompts):
        pf = os.path.join(tmp, f"prompt-{i}.txt")
        with open(pf, "w") as f:
            f.write(_sanitize_prompt(p))
        prompt_files.append(pf)

    ref_js_file = ""
    bulk_ref_section = ""
    if ref_filenames:
        ref_js_file = os.path.join(tmp, "ref-upload.js")
        with open(ref_js_file, "w") as f:
            f.write(_generate_ref_upload_js(ref_filenames))
        bulk_ref_section = f"""
  -- Upload reference images
  set refJS to do shell script "cat " & quoted form of "{ref_js_file}"
  execute active tab of w javascript refJS
  repeat 60 times
    set isDone to (execute active tab of w javascript "window.__refUploadDone ? 'yes' : 'no'")
    if isDone is "yes" then exit repeat
    delay 0.1
  end repeat"""

    tab_count = len(prompts)
    batch_size = 10

    script = '''
tell application "Google Chrome"
  activate
  set w to front window
end tell
'''
    for batch_start in range(0, tab_count, batch_size):
        batch_end = min(batch_start + batch_size, tab_count)
        bs = batch_end - batch_start

        script += f'\ntell application "Google Chrome"\n  set w to front window\n'
        for _ in range(bs):
            script += '  tell w to make new tab with properties {URL:"https://app.envato.com/image-gen"}\n'
        script += f"""
  set tabTotal to count of tabs of w
  repeat 60 times
    set allDone to true
    repeat with i from (tabTotal - {bs - 1}) to tabTotal
      if (loading of tab i of w) then set allDone to false
    end repeat
    if allDone then exit repeat
    delay 0.1
  end repeat
  delay 0.3
end tell
"""
        for i in range(batch_start, batch_end):
            idx_in_batch = i - batch_start
            pf = prompt_files[i]
            asp = aspects[i] if i < len(aspects) else "Square"

            script += f"""
tell application "Google Chrome"
  set w to front window
  set tabTotal to count of tabs of w
  set active tab index of w to (tabTotal - {bs - 1 - idx_in_batch})
  repeat 40 times
    set inputReady to (execute active tab of w javascript "(document.querySelector('textarea')||document.querySelector('[contenteditable=\\"true\\"],[contenteditable=\\"\\"],div[role=textbox],[role=textbox]')||document.querySelector('input[type=text]'))?'1':'0'")
    if inputReady is "1" then exit repeat
    delay 0.15
  end repeat
  execute active tab of w javascript "window.__promptFocused=0;(function(){{try{{var el=document.querySelector('textarea');if(!el)el=document.querySelector('[contenteditable=\\"true\\"],[contenteditable=\\"\\"],div[role=textbox],[role=textbox]');if(!el)el=document.querySelector('input[type=text]');if(!el){{window.__promptFocused=1;return;}}window.__promptEl=el;el.scrollIntoView({{block:'center'}});el.focus();el.click();window.__promptFocused=1;}}catch(e){{window.__promptFocused=1;}}}})();"
  repeat 20 times
    set isFocused to (execute active tab of w javascript "window.__promptFocused?'yes':'no'")
    if isFocused is "yes" then exit repeat
    delay 0.1
  end repeat
  delay 0.3
end tell
do shell script "cat " & quoted form of "{pf}" & " | pbcopy"
tell application "System Events" to keystroke "v" using command down
delay 0.3
tell application "Google Chrome"
  execute active tab of w javascript "(function(){{var el=document.querySelector('textarea')||document.querySelector('[contenteditable=\\"true\\"],[contenteditable=\\"\\"],div[role=textbox]')||document.querySelector('input[type=text]');if(el){{el.dispatchEvent(new Event('input',{{bubbles:true}}));el.dispatchEvent(new Event('change',{{bubbles:true}}));}}}})();"
{bulk_ref_section}
  delay 0.3
  execute active tab of w javascript "(function(){{var map={{'square':['square','cuadrado'],'portrait':['portrait','vertical','retrato'],'landscape':['landscape','horizontal','paisaje']}};var targets=map['{asp}'.toLowerCase()]||['{asp}'.toLowerCase()];function clickMatch(){{var items=document.querySelectorAll('li,label,button,div[role=option],[role=menuitem],span');for(var i=0;i<items.length;i++){{var t=(items[i].textContent||'').trim().toLowerCase();if(t.length===0||t.length>20)continue;for(var k=0;k<targets.length;k++){{if(t===targets[k]){{items[i].click();return true;}}}}}}return false;}}if(clickMatch())return'ok';return'nf';}})();"
  delay 0.4
  execute active tab of w javascript "(function(){{var map={{'square':['square','cuadrado'],'portrait':['portrait','vertical','retrato'],'landscape':['landscape','horizontal','paisaje']}};var targets=map['{asp}'.toLowerCase()]||['{asp}'.toLowerCase()];var items=document.querySelectorAll('li,label,button,div[role=option],[role=menuitem],span');for(var i=0;i<items.length;i++){{var t=(items[i].textContent||'').trim().toLowerCase();if(t.length===0||t.length>20)continue;for(var k=0;k<targets.length;k++){{if(t===targets[k]){{items[i].click();return'ok';}}}}}}return'skip';}})();"
  delay 0.3
  set genResult to "not-found"
  repeat 20 times
    set genResult to (execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{var t=(btns[i].textContent||'').trim().toLowerCase();if(t==='generate'||t==='generar'){{if(btns[i].disabled)return'disabled';btns[i].click();return'clicked';}}}}return'not-found';}})();")
    if genResult is "clicked" then exit repeat
    delay 0.2
  end repeat
end tell
delay 0.2
"""

    script += '\nreturn "done"\n'

    _run_applescript(script, timeout=tab_count * 15)
    print(f"[Envato Bulk] Sending: {tab_count} prompts, refs={len(ref_filenames)}")
    return jsonify({"success": True, "message": f"Opening {tab_count} Envato tabs...", "count": tab_count})


# ---------------------------------------------------------------------------
# 5. POST /api/envato/send-all-video  (bulk video prompts → Envato VideoGen)
# ---------------------------------------------------------------------------
@app.route("/api/envato/send-all-video", methods=["POST"])
def envato_send_all_video():
    data = request.get_json() or {}
    prompts = data.get("prompts", [])
    if not prompts:
        return jsonify({"error": "No prompts provided"}), 400

    speeches = data.get("speeches", [])
    if not speeches:
        speeches = [""] * len(prompts)

    reference_images = data.get("referenceImages", [])

    tmp = tempfile.mkdtemp(prefix="envato-video-bulk-")
    prompt_files = []
    ref_img_paths = []
    for i, p in enumerate(prompts):
        sp = speeches[i] if i < len(speeches) else ""
        combined = f"{p}\n\nVoiceover (Spanish): {sp}" if sp and sp.strip() else p
        pf = os.path.join(tmp, f"prompt-{i}.txt")
        with open(pf, "w") as f:
            f.write(_sanitize_video_prompt(combined))
        prompt_files.append(pf)

        # Save per-slide reference image (Start Frame)
        ref_path = None
        if i < len(reference_images) and reference_images[i]:
            ref_data = reference_images[i]
            if ref_data and ref_data.startswith("data:"):
                m = re.match(r"^data:image/([^;]+);base64,(.+)$", ref_data, re.DOTALL)
                if m:
                    ext = "jpg" if m.group(1) == "jpeg" else m.group(1)
                    ref_path = os.path.join(tmp, f"ref-{i}.{ext}")
                    with open(ref_path, "wb") as f:
                        f.write(base64.b64decode(m.group(2)))
        ref_img_paths.append(ref_path)

    tab_count = len(prompts)

    script = f'''
tell application "Google Chrome"
  activate
  set w to front window
'''
    for _ in range(tab_count):
        script += '  tell w to make new tab with properties {URL:"https://labs.envato.com/video-gen"}\n'
    script += f"""
  set tabTotal to count of tabs of w
  repeat 80 times
    set allDone to true
    repeat with i from (tabTotal - {tab_count - 1}) to tabTotal
      if (loading of tab i of w) then set allDone to false
    end repeat
    if allDone then exit repeat
    delay 0.15
  end repeat
  delay 2.0
end tell
"""

    for i in range(tab_count):
        pf = prompt_files[i]
        ref_path = ref_img_paths[i] if i < len(ref_img_paths) else None

        # Build Start Frame upload: click Start Frame → Upload an image → JS fetch+file
        start_frame_section = ""
        if ref_path:
            # Copy ref to tmp-ref for HTTP serving
            ref_fname = os.path.basename(ref_path)
            served_path = str(TMP_REF_DIR / f"vid-ref-{i}.png")
            try:
                shutil.copy2(ref_path, served_path)
            except Exception:
                pass
            ref_url = f"http://localhost:{STUDIO_PORT}/tmp-ref/vid-ref-{i}.png"
            start_frame_section = f"""
  -- Click "Start Frame" box
  execute active tab of w javascript "
    (function(){{
      var all = document.querySelectorAll('div');
      for (var i = 0; i < all.length; i++) {{
        var t = all[i].textContent.trim();
        if ((t === 'Start Frame(optional)' || t === 'Start Frame') && all[i].getBoundingClientRect().width >= 50) {{
          all[i].click(); return 'clicked';
        }}
      }}
      return 'not found';
    }})();
  "
  delay 1
  -- Click "Upload an image"
  execute active tab of w javascript "
    (function(){{
      var all = document.querySelectorAll('div, span');
      for (var i = 0; i < all.length; i++) {{
        var t = all[i].textContent.trim();
        if (t === 'Upload an image' || t === 'Upload animage') {{
          all[i].click(); return 'clicked';
        }}
      }}
      return 'not found';
    }})();
  "
  delay 1
  -- Upload via JS fetch + file input
  execute active tab of w javascript "
    (async function(){{
      try {{
        var resp = await fetch('{ref_url}');
        var blob = await resp.blob();
        var file = new File([blob], 'start-frame.png', {{type: 'image/png'}});
        var dt = new DataTransfer();
        dt.items.add(file);
        var fi = document.querySelector('input[type=file]');
        if (!fi) return 'no file input';
        fi.files = dt.files;
        fi.dispatchEvent(new Event('change', {{bubbles:true}}));
        fi.dispatchEvent(new Event('input', {{bubbles:true}}));
        return 'uploaded';
      }} catch(e) {{ return 'error: ' + e.message; }}
    }})();
  "
  delay 2.5"""

        script += f"""
tell application "Google Chrome"
  set w to front window
  set tabTotal to count of tabs of w
  set active tab index of w to (tabTotal - {tab_count - 1 - i})
  repeat 40 times
    set inputReady to (execute active tab of w javascript "document.querySelector('textarea') ? '1' : '0'")
    if inputReady is "1" then exit repeat
    delay 0.2
  end repeat
  delay 0.3
  -- Focus textarea first
  execute active tab of w javascript "var ta=document.querySelector('textarea');if(ta){{ta.focus();ta.click();}} 'ok';"
  delay 0.3
{start_frame_section}
  -- Select 9:16
  execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{var t=btns[i].textContent.trim();var r=btns[i].getBoundingClientRect();if((t==='16:9'||t==='9:16'||t==='1:1')&&r.height>=40&&r.height<=60){{btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));break;}}}}}})();"
  delay 0.4
  execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{if(btns[i].textContent.trim()==='9:16'){{btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));break;}}}}}})();"
  delay 0.4
  -- Settings: Sound + Speech
  execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{var r=btns[i].getBoundingClientRect();var t=btns[i].textContent.trim();if(t===''&&!btns[i].disabled&&r.width>=40&&r.width<=60&&r.height>=40&&r.height<=60&&btns[i].querySelector('svg')){{btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));break;}}}}}})();"
  delay 0.4
  execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{if(btns[i].textContent.trim()==='Sound'&&!btns[i].disabled){{btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));break;}}}}}})();"
  delay 0.4
  execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{if(btns[i].textContent.trim()==='Speech'&&!btns[i].disabled){{btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));break;}}}}}})();"
  delay 0.3
  execute active tab of w javascript "document.body.dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));'ok';"
  delay 0.3
  execute active tab of w javascript "var ta=document.querySelector('textarea');if(ta){{ta.focus();ta.select();}} 'ok';"
end tell
do shell script "cat " & quoted form of "{pf}" & " | pbcopy"
tell application "System Events" to keystroke "v" using command down
delay 1.5
tell application "Google Chrome"
  set w to front window
  execute active tab of w javascript "(function(){{var ta=document.querySelector('textarea');if(!ta)return'no textarea';var nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;nativeSetter.call(ta,ta.value);ta.dispatchEvent(new Event('input',{{bubbles:true}}));ta.dispatchEvent(new Event('change',{{bubbles:true}}));return'ok';}})();"
  delay 0.5
  execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{if(btns[i].textContent.trim().toLowerCase().includes('generate')){{btns[i].disabled=false;btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));return'clicked';}}}}return'not found';}})();"
end tell
delay 0.5
"""

    script += '\nreturn "done"\n'
    _run_applescript(script, timeout=120)
    print(f"[Envato Video Bulk] Sending: {tab_count} videos")
    return jsonify({"success": True, "message": f"Opening {tab_count} Envato Video tabs...", "count": tab_count})


# ---------------------------------------------------------------------------
# 6. POST /api/envato/bulk-image-to-video
# ---------------------------------------------------------------------------
@app.route("/api/envato/bulk-image-to-video", methods=["POST"])
def envato_bulk_image_to_video():
    data = request.get_json() or {}
    clips = data.get("clips", [])
    if not clips:
        return jsonify({"error": "No clips provided"}), 400

    reference_images = data.get("referenceImages", [])
    ref_filenames = _write_ref_images(reference_images) if reference_images else []

    clip_count = len(clips)
    tmp = tempfile.mkdtemp(prefix="envato-img2vid-")

    img_prompt_files = []
    vid_prompt_files = []
    for i, c in enumerate(clips):
        img_pf = os.path.join(tmp, f"img_prompt_{i}.txt")
        with open(img_pf, "w") as f:
            f.write(_sanitize_prompt(c.get("imagePrompt", "")))
        img_prompt_files.append(img_pf)

        vid_text = c.get("videoPrompt", c.get("imagePrompt", ""))
        sp = c.get("speech", "")
        combined = f"{vid_text}\n\nVoiceover (Spanish): {sp}" if sp and sp.strip() else vid_text
        vid_pf = os.path.join(tmp, f"vid_prompt_{i}.txt")
        with open(vid_pf, "w") as f:
            f.write(_sanitize_video_prompt(combined))
        vid_prompt_files.append(vid_pf)

    ref_section = ""
    if ref_filenames:
        ref_js_path = str(TMP_REF_DIR / "ref-upload.js")
        with open(ref_js_path, "w") as f:
            f.write(_generate_ref_upload_js(ref_filenames))
        ref_section = f"""
  execute tab myTab of w javascript "fetch('http://localhost:{STUDIO_PORT}/tmp-ref/ref-upload.js').then(r=>r.text()).then(js=>eval(js)).catch(e=>{{ window.__refUploadDone=true; }});"
  repeat 30 times
    set isDone to (execute tab myTab of w javascript "window.__refUploadDone ? 'yes' : 'no'")
    if isDone is "yes" then exit repeat
    delay 0.5
  end repeat
  delay 0.5"""

    # Phase A: Open all ImageGen tabs
    script = f'''
tell application "Google Chrome"
  if (count of windows) is 0 then
    make new window
    delay 1.0
  end if
  set w to front window
'''
    for _ in range(clip_count):
        script += '  tell w to make new tab with properties {URL:"https://app.envato.com/image-gen"}\n'
    script += f"""
  set tabTotal to count of tabs of w
  set firstTab to (tabTotal - {clip_count - 1})
  repeat 60 times
    set allDone to true
    repeat with i from firstTab to tabTotal
      if (loading of tab i of w) then set allDone to false
    end repeat
    if allDone then exit repeat
    delay 0.15
  end repeat
  delay 1.5
end tell
"""

    # Phase B: Set prompt, refs, aspect, generate on each tab
    for i in range(clip_count):
        ipf = img_prompt_files[i]
        script += f"""
tell application "Google Chrome"
  set w to front window
  set tabTotal to count of tabs of w
  set myTab to (tabTotal - {clip_count - 1 - i})
  set active tab index of w to myTab
  repeat 40 times
    set inputReady to (execute active tab of w javascript "(document.querySelector('textarea')||document.querySelector('[contenteditable=\\"true\\"],[contenteditable=\\"\\"],div[role=textbox],[role=textbox]')||document.querySelector('input[type=text]'))?'1':'0'")
    if inputReady is "1" then exit repeat
    delay 0.15
  end repeat
  execute active tab of w javascript "window.__promptFocused=0;(function(){{try{{var el=document.querySelector('textarea');if(!el)el=document.querySelector('[contenteditable=\\"true\\"],[contenteditable=\\"\\"],div[role=textbox],[role=textbox]');if(!el)el=document.querySelector('input[type=text]');if(!el){{window.__promptFocused=1;return;}}window.__promptEl=el;el.scrollIntoView({{block:'center'}});el.focus();el.click();window.__promptFocused=1;}}catch(e){{window.__promptFocused=1;}}}})();"
  repeat 20 times
    set isFocused to (execute active tab of w javascript "window.__promptFocused?'yes':'no'")
    if isFocused is "yes" then exit repeat
    delay 0.1
  end repeat
  delay 0.3
end tell
do shell script "cat " & quoted form of "{ipf}" & " | pbcopy"
tell application "System Events" to keystroke "v" using command down
delay 0.3
tell application "Google Chrome"
  set w to front window
  execute active tab of w javascript "(function(){{var el=document.querySelector('textarea')||document.querySelector('[contenteditable=\\"true\\"],[contenteditable=\\"\\"],div[role=textbox]')||document.querySelector('input[type=text]');if(el){{el.dispatchEvent(new Event('input',{{bubbles:true}}));el.dispatchEvent(new Event('change',{{bubbles:true}}));}}}})();"
{ref_section}
  delay 0.3
  -- Select Portrait
  execute active tab of w javascript "(function(){{var map={{'portrait':['portrait','vertical','retrato']}};var targets=map['portrait'];function clickMatch(){{var items=document.querySelectorAll('li,label,button,div[role=option],[role=menuitem],span');for(var i=0;i<items.length;i++){{var t=(items[i].textContent||'').trim().toLowerCase();if(t.length===0||t.length>20)continue;for(var k=0;k<targets.length;k++){{if(t===targets[k]){{items[i].click();return true;}}}}}}return false;}}if(clickMatch())return'ok';return'nf';}})();"
  delay 0.4
  execute active tab of w javascript "(function(){{var targets=['portrait','vertical','retrato'];var items=document.querySelectorAll('li,label,button,div[role=option],[role=menuitem],span');for(var i=0;i<items.length;i++){{var t=(items[i].textContent||'').trim().toLowerCase();if(t.length===0||t.length>20)continue;for(var k=0;k<targets.length;k++){{if(t===targets[k]){{items[i].click();return'ok';}}}}}}return'skip';}})();"
  delay 0.3
  set genResult to "not-found"
  repeat 20 times
    set genResult to (execute active tab of w javascript "(function(){{var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){{var t=(btns[i].textContent||'').trim().toLowerCase();if(t==='generate'||t==='generar'){{if(btns[i].disabled)return'disabled';btns[i].click();return'clicked';}}}}return'not-found';}})();")
    if genResult is "clicked" then exit repeat
    delay 0.2
  end repeat
end tell
delay 0.5
"""

    script += '\nreturn "done"\n'
    _run_applescript(script, timeout=clip_count * 20)
    print(f"[Envato Img→Vid] Sending: {clip_count} clips, refs={len(ref_filenames)}")
    return jsonify({"success": True, "message": f"Processing {clip_count} image-to-video clips...", "count": clip_count})


# ---------------------------------------------------------------------------
# 7. POST /api/character/generate  (Character Speaking: image + video)
# ---------------------------------------------------------------------------
@app.route("/api/character/generate", methods=["POST"])
def character_generate():
    """Two-phase character speaking flow:
    Phase 1: Send character image prompt to Envato ImageGen
    Phase 2: Use Claude CLI to generate rich animation prompt, send to Envato VideoGen
    """
    data = request.get_json() or {}
    character_desc = data.get("character", "")
    dialogue = data.get("dialogue", "")
    destination = data.get("destination", "")
    reference_images = data.get("referenceImages", [])

    if not character_desc:
        return jsonify({"error": "No character description provided"}), 400
    if not dialogue:
        return jsonify({"error": "No dialogue provided"}), 400

    # Write reference images
    ref_filenames = _write_ref_images(reference_images) if reference_images else []

    # --- Phase 1: Send character image to Envato ImageGen ---
    image_prompt = (
        f"{character_desc}. 3D character standing on pure white infinite background, "
        f"front-facing, full body visible, cute expressive pose, "
        f"AXKAN brand style Rosa Mexicano #E72A88 and Turquesa #09ADC2. "
        f"{('Destination: ' + destination + '. ') if destination else ''}"
        f"9:16 portrait format, clean white background, high quality 3D render, "
        f"vibrant colors, professional character design suitable for animation."
    )

    tmp = tempfile.mkdtemp(prefix="envato-char-")
    img_prompt_file = os.path.join(tmp, "img_prompt.txt")
    with open(img_prompt_file, "w") as f:
        f.write(_sanitize_prompt(image_prompt))

    ref_js_file = None
    if ref_filenames:
        ref_js_file = os.path.join(tmp, "ref-upload.js")
        with open(ref_js_file, "w") as f:
            f.write(_generate_ref_upload_js(ref_filenames))

    img_script = _build_imagegen_applescript(img_prompt_file, "Portrait", ref_js_file)
    _run_applescript(img_script, timeout=30)
    print(f"[Character] Phase 1: Image sent to Envato ImageGen")

    # --- Phase 2: Generate rich video prompt via Claude CLI, then send to VideoGen ---
    def _phase2():
        # Give a moment for Phase 1 to start
        time.sleep(2)

        video_prompt = _generate_character_video_prompt(character_desc, dialogue, destination)
        print(f"[Character] Phase 2: Video prompt generated ({len(video_prompt)} chars)")

        # Build VideoGen AppleScript
        combined = video_prompt
        prompt_b64 = base64.b64encode(
            _sanitize_video_prompt(combined).encode()
        ).decode()

        ref_section = ""
        if ref_filenames:
            ref_js_path = str(TMP_REF_DIR / "ref-upload.js")
            with open(ref_js_path, "w") as f:
                f.write(_generate_ref_upload_js(ref_filenames))
            ref_section = f"""
  execute tab myTab of w javascript "fetch('http://localhost:{STUDIO_PORT}/tmp-ref/ref-upload.js').then(r=>r.text()).then(js=>eval(js)).catch(e=>{{ window.__refUploadDone=true; }});"
  repeat 30 times
    set isDone to (execute tab myTab of w javascript "window.__refUploadDone ? 'yes' : 'no'")
    if isDone is "yes" then exit repeat
    delay 0.5
  end repeat
  delay 0.5"""

        vid_script = f'''
tell application "Google Chrome"
  set w to front window
  tell w to make new tab with properties {{URL:"https://labs.envato.com/video-gen"}}
  set myTab to (count of tabs of w)
  repeat 60 times
    if not (loading of tab myTab of w) then exit repeat
    delay 0.15
  end repeat
  delay 2.5
  -- Select 9:16
  execute tab myTab of w javascript "
    (function(){{
      var btns = document.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){{
        var t = btns[i].textContent.trim();
        if((t==='16:9' || t==='9:16' || t==='1:1') && btns[i].getBoundingClientRect().height>=40){{
          btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
          break;
        }}
      }}
      setTimeout(function(){{
        var all = document.querySelectorAll('button');
        for(var j=0;j<all.length;j++){{
          if(all[j].textContent.trim()==='9:16'){{
            all[j].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
            break;
          }}
        }}
      }}, 300);
    }})();
  "
  delay 1.0
  -- Settings: Sound + Speech
  execute tab myTab of w javascript "
    (function(){{
      var btns = document.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){{
        var r = btns[i].getBoundingClientRect();
        var t = btns[i].textContent.trim();
        if(t===''&&!btns[i].disabled&&r.width>=40&&r.width<=60&&r.height>=40&&r.height<=60&&btns[i].querySelector('svg')){{
          btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
          break;
        }}
      }}
      setTimeout(function(){{
        var all = document.querySelectorAll('button');
        for(var j=0;j<all.length;j++){{
          if(all[j].textContent.trim()==='Sound'&&!all[j].disabled){{
            all[j].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
            break;
          }}
        }}
      }}, 400);
      setTimeout(function(){{
        var all = document.querySelectorAll('button');
        for(var j=0;j<all.length;j++){{
          if(all[j].textContent.trim()==='Speech'&&!all[j].disabled){{
            all[j].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
            break;
          }}
        }}
      }}, 800);
      setTimeout(function(){{
        document.body.dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
      }}, 1100);
    }})();
  "
  delay 1.5
{ref_section}
  -- Set prompt via JS
  execute tab myTab of w javascript "
    (function(){{
      var ta = document.querySelector('textarea');
      if(!ta) return 'no textarea';
      var decoded = new TextDecoder().decode(Uint8Array.from(atob('{prompt_b64}'), function(c){{return c.charCodeAt(0);}}));
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, decoded);
      ta.dispatchEvent(new Event('input', {{bubbles:true}}));
      ta.dispatchEvent(new Event('change', {{bubbles:true}}));
      return 'prompt set';
    }})();
  "
  delay 0.8
  -- Click Generate
  execute tab myTab of w javascript "
    (function(){{
      var btns = document.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){{
        if(btns[i].textContent.trim().toLowerCase().includes('generate')){{
          btns[i].disabled = false;
          btns[i].dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}}));
          return 'clicked';
        }}
      }}
      return 'not found';
    }})();
  "
end tell
return "done"
'''
        _run_applescript(vid_script, timeout=45)
        print(f"[Character] Phase 2: Video prompt sent to Envato VideoGen")

    threading.Thread(target=_phase2, daemon=True).start()

    return jsonify({
        "success": True,
        "message": "Phase 1: Image sent to Envato. Phase 2: Generating video prompt with Claude...",
    })


# ---------------------------------------------------------------------------
# 8. POST /api/video-prompts/generate
# Claude CLI analyzes uploaded first-frame images and generates video prompts
# ---------------------------------------------------------------------------
@app.route("/api/video-prompts/generate", methods=["POST"])
def video_prompts_generate():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    destination = data.get("destination", "")
    content_type = data.get("content_type", "living")
    theme = data.get("theme", "")
    original_prompts = data.get("original_prompts", [])

    # Get uploaded images from session
    sid, sess = get_session(session_id)
    upload_dir = SESSIONS_DIR / sid / "uploads"
    clean_dir = SESSIONS_DIR / sid / "clean"

    # Find images (prefer clean, fallback to uploads)
    img_dir = clean_dir if clean_dir.exists() else upload_dir
    image_files = []
    if img_dir.exists():
        for f in sorted(img_dir.iterdir()):
            if f.is_file() and f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                image_files.append(str(f))

    if not image_files:
        return jsonify({"error": "No images found in session"}), 400

    # Build context from original prompts
    slides_context = ""
    if original_prompts:
        slides_context = "\n".join(
            f"  Slide {i+1} ({p.get('slide_name', '')}): {p.get('prompt_text', '')[:100]}..."
            + (f"\n    Speech: {p['speech']}" if p.get('speech') else "")
            for i, p in enumerate(original_prompts)
        )

    system = textwrap.dedent(f"""\
        You are a world-class video animation prompt engineer for Envato Video Gen AI.
        You create EXTREMELY DETAILED cinematic video animation prompts.

        CONTEXT:
        - Style: professional social media content, premium quality.
        - Destination: {destination}
        - Content type: {content_type}
        {'- Theme: ' + theme if theme else ''}
        - You have {len(image_files)} first-frame images to analyze.

        ORIGINAL SLIDE PROMPTS (for context/story):
{slides_context}

        TASK: Read each image file, then generate EXACTLY {len(image_files)} video animation prompts — ONE per image. NOT MORE.
        You have {len(image_files)} images, output EXACTLY {len(image_files)} JSON objects.
        All prompts together must tell a COHERENT STORY — a narrative arc across all clips.

        FOR EACH VIDEO PROMPT INCLUDE:
        1. STARTING POSE: Describe exact starting position from the image
        2. ANIMATION PHYSICS: squash & stretch, anticipation, follow-through
        3. SECONDARY MOTION: breathing, blinking, subtle sway, micro-movements
        4. CAMERA MOVEMENT: pan, zoom, dolly, tracking shots
        5. TIMED ACTIONS: specific movements and transitions
        6. MOOD & LIGHTING: atmosphere changes, color shifts
        7. If speech exists, embed dialogue: DIALOGO: {{"text"}}
        8. TECHNICAL: 24fps, 5-8 seconds, smooth transitions

        Each video prompt: 100-200 words, vivid natural language.
        slide_name in SPANISH. speech in SPANISH.

        CRITICAL: Output EXACTLY {len(image_files)} objects in the JSON array. One per image. No more, no less.

        OUTPUT FORMAT — ONLY valid JSON, no markdown fences:
        [{{
            "slide_name": "nombre en espanol",
            "video_prompt": "detailed cinematic animation prompt in English...",
            "speech": "voiceover en espanol si aplica",
            "estimated_time": "~5s"
        }}]
    """)

    # Write system prompt to file
    tmp_dir = tempfile.mkdtemp(prefix="claude-vidprompts-")
    sys_prompt_file = os.path.join(tmp_dir, "system_prompt.txt")
    with open(sys_prompt_file, "w") as f:
        f.write(system)

    # Build user message with absolute image paths
    img_list = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(image_files))
    user_msg = (
        f"Read these {len(image_files)} first-frame images and generate video animation prompts:\n"
        f"{img_list}\n\n"
        f"Analyze each image deeply — extract the subject, style, composition, colors. "
        f"Then create a video prompt that animates that specific image with cinematic quality. "
        f"All clips together should tell a coherent story about {destination}."
    )

    cmd = [
        "claude", "-p",
        "--system-prompt-file", sys_prompt_file,
        "--max-turns", "8",
        "--allowedTools", "Read,Glob",
    ]

    global _active_claude_proc
    print(f"[Video Prompts] Generating for {len(image_files)} images...")
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=tmp_dir,
    )
    _active_claude_proc = proc
    try:
        stdout, stderr = proc.communicate(input=user_msg, timeout=180)
    except subprocess.TimeoutExpired:
        proc.kill()
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return jsonify({"error": "Claude CLI timed out"}), 500
    finally:
        _active_claude_proc = None

    print(f"[Video Prompts] RC={proc.returncode}, stdout={len(stdout)} chars")
    shutil.rmtree(tmp_dir, ignore_errors=True)

    output = stdout.strip()
    if not output or output.startswith("Error:"):
        return jsonify({"error": f"Claude failed: {output[:200]}"}), 500

    # Extract JSON
    text = output
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1].strip()
    if not text.startswith("["):
        start = text.find("[")
        end = text.rfind("]")
        if start >= 0 and end > start:
            text = text[start:end + 1]

    try:
        video_prompts = json.loads(text)
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON parse error: {e}. Output: {output[:200]}"}), 500

    print(f"[Video Prompts] Got {len(video_prompts)} video prompts")
    return jsonify({
        "success": True,
        "video_prompts": video_prompts,
    })


# ---------------------------------------------------------------------------
# 9. POST /api/gemini/generate-images
# ---------------------------------------------------------------------------
@app.route("/api/gemini/generate-images", methods=["POST"])
def gemini_generate_images():
    data = request.json or {}
    session_id = data.get("session_id")
    prompts = data.get("prompts", [])
    reference_image = data.get("reference_image")
    aspect_ratio = data.get("aspect_ratio", "4:5 vertical (1080x1350)")

    sid, sess = get_session(session_id)

    images = []
    errors = []

    # Try Gemini image generation
    if genai and GEMINI_API_KEY:
        try:
            imagen_model = genai.ImageGenerationModel("imagen-3.0-generate-002")
            for p in prompts:
                try:
                    result = imagen_model.generate_images(
                        prompt=p["prompt_text"],
                        number_of_images=1,
                    )
                    if result.images:
                        img_data = result.images[0]._image_bytes
                        filename = f"slide_{p['slide_number']}.png"
                        img_path = SESSIONS_DIR / sid / filename
                        img_path.write_bytes(img_data)
                        images.append({
                            "slide_number": p["slide_number"],
                            "filename": filename,
                            "url": f"/sessions/{sid}/{filename}",
                        })
                    else:
                        errors.append({"slide_number": p["slide_number"], "error": "No image returned"})
                except Exception as e:
                    errors.append({"slide_number": p["slide_number"], "error": str(e)})
        except Exception as e:
            print(f"[Imagen error] {e} — using SVG placeholders")
            images, errors = _generate_placeholder_images(sid, prompts)
    else:
        images, errors = _generate_placeholder_images(sid, prompts)

    return jsonify({
        "success": True,
        "session_id": sid,
        "images": images,
        "errors": errors,
    })


def _generate_placeholder_images(sid: str, prompts: list) -> tuple[list, list]:
    """Generate colored SVG placeholder images with slide info."""
    images = []
    errors = []
    for p in prompts:
        slide_num = p.get("slide_number", 1)
        slide_name = p.get("slide_name", f"Slide {slide_num}")
        color = ACCENT_CYCLE[(slide_num - 1) % len(ACCENT_CYCLE)]

        svg = textwrap.dedent(f"""\
            <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
              <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:{color};stop-opacity:1"/>
                  <stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1"/>
                </linearGradient>
              </defs>
              <rect width="1080" height="1350" fill="url(#bg)"/>
              <text x="540" y="600" text-anchor="middle" font-family="Arial,Helvetica,sans-serif"
                    font-size="120" font-weight="bold" fill="white" opacity="0.9">Slide {slide_num}</text>
              <text x="540" y="720" text-anchor="middle" font-family="Arial,Helvetica,sans-serif"
                    font-size="48" fill="white" opacity="0.7">{_svg_escape(slide_name)}</text>
              <text x="540" y="820" text-anchor="middle" font-family="Arial,Helvetica,sans-serif"
                    font-size="36" fill="white" opacity="0.4">AXKAN Studio — Placeholder</text>
            </svg>""")

        svg_b64 = base64.b64encode(svg.encode("utf-8")).decode("utf-8")
        data_url = f"data:image/svg+xml;base64,{svg_b64}"

        # Also save to disk
        filename = f"slide_{slide_num}.svg"
        img_path = SESSIONS_DIR / sid
        img_path.mkdir(parents=True, exist_ok=True)
        (img_path / filename).write_text(svg, encoding="utf-8")

        images.append({
            "slide_number": slide_num,
            "filename": filename,
            "url": data_url,
        })
    return images, errors


def _svg_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ---------------------------------------------------------------------------
# 10. POST /api/images/upload
# ---------------------------------------------------------------------------
@app.route("/api/images/upload", methods=["POST"])
def images_upload():
    session_id = request.form.get("session_id")
    sid, sess = get_session(session_id)

    upload_dir = SESSIONS_DIR / sid / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    files_info = []
    for f in request.files.getlist("files"):
        file_id = uuid.uuid4().hex[:8]
        ext = Path(f.filename).suffix or ".png"
        filename = f"{file_id}{ext}"
        save_path = upload_dir / filename
        f.save(str(save_path))
        files_info.append({
            "id": file_id,
            "filename": filename,
            "original_name": f.filename,
            "path": f"/sessions/{sid}/uploads/{filename}",
        })

    sess["uploaded_files"] = files_info
    return jsonify({
        "success": True,
        "session_id": sid,
        "files": files_info,
    })


# ---------------------------------------------------------------------------
# 11. POST /api/watermark/remove
# ---------------------------------------------------------------------------
@app.route("/api/watermark/remove", methods=["POST"])
def watermark_remove():
    data = request.json or {}
    session_id = data.get("session_id")
    sid, sess = get_session(session_id)

    upload_dir = SESSIONS_DIR / sid / "uploads"
    clean_dir = SESSIONS_DIR / sid / "clean"
    clean_dir.mkdir(parents=True, exist_ok=True)

    files_out = []
    if upload_dir.exists():
        for src in sorted(upload_dir.iterdir()):
            if src.is_file():
                dst = clean_dir / src.name
                shutil.copy2(str(src), str(dst))
                files_out.append({
                    "filename": src.name,
                    "path": f"/sessions/{sid}/clean/{src.name}",
                })

    sess["clean_files"] = files_out
    return jsonify({"success": True, "files": files_out})


# ---------------------------------------------------------------------------
# 12. POST /api/overlays/specs
# ---------------------------------------------------------------------------
@app.route("/api/overlays/specs", methods=["POST"])
def overlays_specs():
    data = request.json or {}
    session_id = data.get("session_id")
    sid, sess = get_session(session_id)
    destination = sess.get("destination", "México")
    prompts = sess.get("prompts", [])

    # Try Gemini
    if gemini_model and prompts:
        try:
            return jsonify({
                "success": True,
                "specs": _overlay_specs_gemini(destination, prompts),
            })
        except Exception as e:
            print(f"[Overlay specs Gemini error] {e}")

    # Template fallback
    specs = _overlay_specs_template(destination, prompts)
    sess["overlay_specs"] = specs
    return jsonify({"success": True, "specs": specs})


def _overlay_specs_gemini(destination, prompts):
    slides_desc = "\n".join(
        f"- Slide {p['slide_number']}: {p.get('slide_name', '')} — {p.get('prompt_text', '')[:120]}"
        for p in prompts
    )
    system_prompt = textwrap.dedent(f"""\
        You are a social media copywriter creating viral Instagram content.
        Destination: {destination}
        Slides:
        {slides_desc}

        For each slide generate overlay text specs. Respond ONLY with valid JSON array:
        [{{
            "slide_name": "name",
            "role": "hero|detail|lifestyle|variant|cta",
            "headline": "short bold headline (3-5 words, Spanish)",
            "subheadline": "supporting text (5-10 words, Spanish)",
            "cta": "call to action (2-4 words, Spanish)",
            "bg_color": "#hexcolor",
            "tags": ["#tag1", "#tag2"]
        }}]
    """)
    resp = gemini_model.generate_content(system_prompt)
    text = resp.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    return json.loads(text)


def _overlay_specs_template(destination, prompts):
    dest = destination.upper()
    headlines = [
        f"¡Vive {dest}!",
        f"Arte de {dest}",
        f"Llévate {dest}",
        f"Colores de {dest}",
        f"Recuerdo de {dest}",
        f"Hecho en {dest}",
        f"Explora {dest}",
        f"¡{dest} te espera!",
    ]
    subheadlines = [
        "Momentos que inspiran",
        "Cultura y color en cada detalle",
        "Esto tienes que vivirlo",
        "Descubre lo mejor del destino",
        "Arte que viaja contigo",
        "Tradición y estilo moderno",
        "Un pedacito de México para ti",
        "Desliza para ver más",
    ]
    ctas = [
        "¡Compra ahora!",
        "Descubre más →",
        "Añade a tu colección",
        "Link en bio 🔗",
        "¡Nuevo diseño!",
        "Visita la tienda",
        "Envío a todo México",
        "¡No te lo pierdas!",
    ]
    roles = ["hero", "detail", "lifestyle", "variant", "process", "landmark", "collection", "cta"]
    tags_pool = [
        f"#{destination.replace(' ', '')}", "#Mexico", "#Travel",
        "#MexicoMagico", "#Explore", "#Wanderlust", "#ContentCreator",
        "#Instagram", "#ViralContent", "#Trending",
    ]

    specs = []
    n = len(prompts) if prompts else 6
    for i in range(n):
        slide_name = prompts[i].get("slide_name", f"Slide {i+1}") if i < len(prompts) else f"Slide {i+1}"
        specs.append({
            "slide_name": slide_name,
            "role": roles[i % len(roles)],
            "headline": headlines[i % len(headlines)],
            "subheadline": subheadlines[i % len(subheadlines)],
            "cta": ctas[i % len(ctas)],
            "bg_color": ACCENT_CYCLE[i % len(ACCENT_CYCLE)],
            "tags": random.sample(tags_pool, min(4, len(tags_pool))),
        })
    return specs


# ---------------------------------------------------------------------------
# 13. POST /api/overlays/ai-variation
# ---------------------------------------------------------------------------
@app.route("/api/overlays/ai-variation", methods=["POST"])
def overlays_ai_variation():
    data = request.json or {}
    session_id = data.get("session_id")
    slide_index = int(data.get("slide_index", 0))
    sid, sess = get_session(session_id)
    destination = sess.get("destination", "México")

    # Try Gemini
    if gemini_model:
        try:
            prompt = (
                f"Generate ONE creative Instagram overlay text variation for a slide about "
                f"{destination}. Professional social media content. "
                f"Respond ONLY with JSON: {{\"headline\": \"...\", \"subheadline\": \"...\", \"cta\": \"...\"}}"
                f" All text in Spanish. Headline: 3-5 words, bold. Subheadline: 5-10 words. CTA: 2-4 words."
            )
            resp = gemini_model.generate_content(prompt)
            text = resp.text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()
            texts = json.loads(text)
            return jsonify({"success": True, "texts": texts})
        except Exception as e:
            print(f"[AI variation error] {e}")

    # Template fallback with randomized variety
    dest = destination.upper()
    variations = [
        {"headline": f"Descubre {dest}", "subheadline": "Momentos que inspiran", "cta": "Desliza →"},
        {"headline": f"Magia de {dest}", "subheadline": "Cultura en cada detalle", "cta": "Link en bio"},
        {"headline": f"¡Puro {dest}!", "subheadline": "Esto tienes que vivirlo", "cta": "Guarda este post"},
        {"headline": f"Explora {dest}", "subheadline": "Lo mejor del destino en tu feed", "cta": "Comparte"},
        {"headline": f"Vibes de {dest}", "subheadline": "Color, tradición y estilo", "cta": "Descubre más"},
        {"headline": f"Tesoro de {dest}", "subheadline": "México como nunca lo viste", "cta": "Síguenos →"},
    ]
    pick = variations[(slide_index + random.randint(0, 3)) % len(variations)]
    return jsonify({"success": True, "texts": pick})


# ---------------------------------------------------------------------------
# 14. POST /api/overlays/preview
# ---------------------------------------------------------------------------
@app.route("/api/overlays/preview", methods=["POST"])
def overlays_preview():
    return jsonify({"success": True, "message": "Preview generated"})


# ---------------------------------------------------------------------------
# 15. POST /api/overlays/apply-all
# ---------------------------------------------------------------------------
@app.route("/api/overlays/apply-all", methods=["POST"])
def overlays_apply_all():
    data = request.json or {}
    session_id = data.get("session_id")
    sid, sess = get_session(session_id)

    # Return existing clean files if any
    files = sess.get("clean_files", sess.get("uploaded_files", []))
    return jsonify({"success": True, "files": files})


# ---------------------------------------------------------------------------
# 16. POST /api/caption/generate
# ---------------------------------------------------------------------------
@app.route("/api/caption/generate", methods=["POST"])
def caption_generate():
    data = request.json or {}
    session_id = data.get("session_id")
    tone = data.get("tone", "casual")
    destination = data.get("destination", "México")

    sid, sess = get_session(session_id)
    content_type = sess.get("content_type", "carousel")

    # Try Gemini
    if gemini_model:
        try:
            prompt = (
                f"Write a viral Instagram caption for a {content_type} about {destination}. "
                f"Tone: {tone}. Style: engaging, authentic, scroll-stopping. "
                f"Include emojis. Write in Spanish with some English hashtags. "
                f"Respond ONLY with JSON: {{\"caption\": \"...\", \"hashtags\": [\"#tag1\", ...]}}"
                f" Caption: 3-5 lines. Hashtags: 15-20 relevant tags."
            )
            resp = gemini_model.generate_content(prompt)
            text = resp.text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()
            result = json.loads(text)
            return jsonify({"success": True, **result})
        except Exception as e:
            print(f"[Caption Gemini error] {e}")

    # Template fallback
    caption, hashtags = _caption_template(destination, tone)
    return jsonify({"success": True, "caption": caption, "hashtags": hashtags})


def _caption_template(destination, tone):
    dest = destination
    dest_tag = destination.replace(" ", "")

    tone_intros = {
        "casual": f"✨ ¡{dest} en todo su esplendor! ✨",
        "professional": f"Descubre lo mejor de {dest}.",
        "fun": f"🎉🇲🇽 ¡{dest} como nunca lo habías visto! 🔥",
        "inspirational": f"Cada destino tiene una historia. Esta es la de {dest}. 🌎",
    }
    tone_bodies = {
        "casual": (
            f"{dest} tiene esa energía que se siente desde la primera foto. "
            f"Colores vibrantes, cultura increíble y momentos que no te puedes perder. "
            f"Desliza para ver más 👀"
        ),
        "professional": (
            f"{dest} combina tradición y modernidad como pocos lugares. "
            f"Cada rincón es una experiencia visual que merece ser compartida. "
            f"Contenido original, calidad premium."
        ),
        "fun": (
            f"¡{dest} tiene MÁS color que tu feed completo! 🌈 "
            f"Desliza, guarda y comparte porque esto se tiene que ver. "
            f"¡Tag a alguien que necesita ver esto! 🙌"
        ),
        "inspirational": (
            f"Los colores de {dest}, su cultura, su energía — todo capturado "
            f"en momentos que te transportan. Hay lugares que cambian tu perspectiva. "
            f"Este es uno de ellos. ✈️"
        ),
    }
    tone_ctas = {
        "casual": "¡Guarda este post para tu próximo viaje! 📌",
        "professional": "Síguenos para más contenido de calidad.",
        "fun": "¡Comparte con alguien que necesita ver esto! 🏃‍♂️💨",
        "inspirational": "Descubre más → link en bio 🔗",
    }

    intro = tone_intros.get(tone, tone_intros["casual"])
    body = tone_bodies.get(tone, tone_bodies["casual"])
    cta = tone_ctas.get(tone, tone_ctas["casual"])
    caption = f"{intro}\n\n{body}\n\n{cta}"

    hashtags = [
        f"#{dest_tag}", "#Mexico", "#Travel",
        "#MexicoMagico", "#Explore", "#ContentCreator",
        "#Instagram", "#ViralContent", "#Trending",
        "#Wanderlust", f"#Visit{dest_tag}", "#TravelMexico",
        "#InstaTravel", "#Photography", "#CreativeContent",
        "#VisualStory", "#ExploreMexico", "#TravelGram",
        "#Discover", "#ContentStudio",
    ]
    return caption, hashtags


# ---------------------------------------------------------------------------
# 17. GET /api/publish/status
# ---------------------------------------------------------------------------
@app.route("/api/publish/status", methods=["GET"])
def publish_status():
    return jsonify({"configured": False})


# ---------------------------------------------------------------------------
# 18. POST /api/publish/execute
# ---------------------------------------------------------------------------
@app.route("/api/publish/execute", methods=["POST"])
def publish_execute():
    return jsonify({
        "success": True,
        "message": "Publish executed (stub — Instagram API not configured)",
    })


# ---------------------------------------------------------------------------
# 19. POST /api/download/zip
# ---------------------------------------------------------------------------
@app.route("/api/download/zip", methods=["POST"])
def download_zip():
    data = request.json or {}
    session_id = data.get("session_id")
    if not session_id or session_id not in sessions:
        return jsonify({"success": False, "error": "Session not found"}), 404

    sess_dir = SESSIONS_DIR / session_id
    if not sess_dir.exists():
        return jsonify({"success": False, "error": "Session directory not found"}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(str(sess_dir)):
            for fname in files:
                fpath = Path(root) / fname
                arcname = str(fpath.relative_to(sess_dir))
                zf.write(str(fpath), arcname)

    buf.seek(0)
    dest = sessions[session_id].get("destination", "content")
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"axkan_{dest}_{session_id}.zip",
    )


# ---------------------------------------------------------------------------
# Static file serving for session assets
# ---------------------------------------------------------------------------
@app.route("/sessions/<path:filepath>")
def serve_session_file(filepath):
    return send_file(str(SESSIONS_DIR / filepath))


@app.route("/")
def serve_index():
    return send_file(str(BASE_DIR / "index.html"))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("  AXKAN Content Studio — Backend")
    print(f"  http://localhost:8080")
    print(f"  Gemini API: {'ENABLED' if gemini_model else 'DISABLED (template mode)'}")
    print(f"  Sessions dir: {SESSIONS_DIR}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=8080, debug=False, threaded=True)

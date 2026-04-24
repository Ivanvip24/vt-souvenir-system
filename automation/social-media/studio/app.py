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
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from datetime import datetime
from urllib.parse import quote

import re
import tempfile

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from PIL import Image

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder=str(Path(__file__).resolve().parent), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # 500MB max upload (supports multi-image batches from phones)
CORS(app)


@app.errorhandler(RequestEntityTooLarge)
@app.errorhandler(413)
def _handle_too_large(e):
    limit_mb = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return jsonify({
        "success": False,
        "error": f"Upload too large. Limit is {limit_mb}MB. Try uploading fewer images at once, or use smaller files.",
    }), 413

BASE_DIR = Path(__file__).resolve().parent
SESSIONS_DIR = BASE_DIR / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)
TMP_REF_DIR = BASE_DIR / "tmp-ref"
TMP_REF_DIR.mkdir(exist_ok=True)
ABORT_FILE = Path(tempfile.gettempdir()) / "axkan-abort-automation"
STUDIO_PORT = 8080

# Floating DUMP button — injected alongside the blocker. Scans the page on click and
# POSTs a DOM snapshot to the studio at /api/test/receive-dump, which stores it in
# memory so the test harness can display it without needing Accessibility/keystroke permissions.
DUMP_BTN_JS = (
    "if(!document.getElementById('axkan-dump-btn')){"
    "var db=document.createElement('div');"
    "db.id='axkan-dump-btn';"
    "db.style.cssText='position:fixed;bottom:20px;left:20px;z-index:99999;padding:14px 24px;"
    "background:#09adc2;color:white;border-radius:12px;font-size:14px;font-weight:bold;"
    "font-family:sans-serif;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);"
    "transition:all 0.2s;user-select:none;';"
    "db.textContent='AXKAN: DUMP';"
    "db.onclick=function(){"
    "db.textContent='...dumping...';"
    "var out=[];"
    "var els=document.querySelectorAll('div,span,button,a,svg,path');"
    "for(var i=0;i<els.length;i++){"
    "var e=els[i];"
    "var r=e.getBoundingClientRect();"
    "if(r.width<20||r.height<20||r.width>500||r.height>500)continue;"
    "var tx=(e.textContent||'').trim();"
    "if(tx.length>40)continue;"
    "var aria=(e.getAttribute&&e.getAttribute('aria-label'))||'';"
    "var role=(e.getAttribute&&e.getAttribute('role'))||'';"
    "var cls=(typeof e.className==='string'?e.className:'')||'';"
    "if(cls.length>80)cls=cls.substring(0,80);"
    "out.push({tag:e.tagName,w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.left),y:Math.round(r.top),text:tx.substring(0,30),aria:aria.substring(0,40),role:role,cls:cls});"
    "}"
    "fetch('http://localhost:8080/api/test/receive-dump',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:window.location.href,elements:out.slice(0,400),title:document.title})}).then(function(r){return r.json();}).then(function(j){db.textContent='DUMPED '+j.count+' els';setTimeout(function(){db.textContent='AXKAN: DUMP';},2000);}).catch(function(e){db.textContent='ERR: '+e.message.substring(0,15);setTimeout(function(){db.textContent='AXKAN: DUMP';},3000);});"
    "};"
    "document.body.appendChild(db);}"
)

# Blocker button JS — injected into every Envato tab
BLOCKER_JS = (
    "if(!document.getElementById('axkan-block-btn')){"
    "var d=document.createElement('div');"
    "d.id='axkan-block-btn';"
    "d.style.cssText='position:fixed;bottom:20px;right:20px;z-index:99999;padding:14px 24px;"
    "background:#8ab73b;color:white;border-radius:12px;font-size:14px;font-weight:bold;"
    "font-family:sans-serif;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);"
    "transition:all 0.2s;user-select:none;';"
    "d.textContent='AXKAN: ACTIVO';"
    "d.onclick=function(){window.__axkanBlocked=!window.__axkanBlocked;"
    "d.textContent=window.__axkanBlocked?'AXKAN: BLOQUEADO':'AXKAN: ACTIVO';"
    "d.style.background=window.__axkanBlocked?'#e72a88':'#8ab73b';};"
    "document.body.appendChild(d);}"
)


def _inject_blocker_applescript(tab_ref):
    """Return AppleScript lines to inject the blocker button into a tab."""
    return f'  execute {tab_ref} javascript "{BLOCKER_JS}"\n'


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

# Progress tracking for prompt generation
_gen_progress = {"total": 0, "done": 0, "phase": "idle"}  # phase: idle, analyzing, generating, complete


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

# ── Carousel Loop (content_type='living') — each clip is its own self-contained 3-8s loop.
# Unlike REEL_ROLES (which form a linear story), every loop clip must stand alone and
# return to its starting frame. Roles describe the VISUAL hook of the loop, not a narrative position.
LOOP_ROLES = [
    ("Portada / Hook", "SCROLL-STOPPER cover loop. Start frame = end frame. Middle: explosive reveal (particles, confetti, 3D rotation, elements flying out and snapping back)."),
    ("Detalle Close-up", "Intimate loop around the product detail. Start frame = end frame. Middle: zoom through micro-texture, focus racking, light rays caressing the surface, then smooth return."),
    ("Contexto Lifestyle", "Lifestyle-context loop. Start frame = end frame. Middle: gentle parallax, atmospheric particles, a hand entering and exiting frame holding the product."),
    ("Perspectiva", "Alternate-angle loop. Start frame = end frame. Middle: 3D orbit reveal, dramatic tilt-shift, or a mirror/reflection trick that resolves back to the original composition."),
    ("Detalle Cultural", "Culturally-rich loop. Start frame = end frame. Middle: pattern/texture traveling across the surface, Mayan grecas animating, color shifts triggered by light."),
    ("Colección", "Wide collection loop. Start frame = end frame. Middle: objects dance out of formation, rearrange, then snap back into the original layout. Satisfying symmetry."),
]

# ── Personaje Hablando (content_type='character') — ONE character portrait prompt.
# User generates 3 Envato variations of this single prompt, picks their favorite,
# then Phase 2 writes the motion + speech prompts. So Phase 1 here is PORTRAIT-focused,
# not multi-slide narrative. Only the first role is typically used.
CHARACTER_ROLES = [
    ("Retrato de Personaje",
     "Studio-quality 9:16 vertical portrait of ONE person ready to speak to camera. "
     "Looking directly at lens, relaxed neutral expression (resting mouth, soft eyes — "
     "NOT smiling, NOT mouth-open). Framed from chest up with generous headroom for "
     "on-screen text. Environment and lighting must feel premium editorial — soft key "
     "light, subtle rim, shallow depth of field, realistic skin texture with pores and "
     "micro-imperfections. The character's identity (clothing, ethnicity, setting) "
     "should align with the product's cultural context (Mexican/AXKAN brand). This "
     "image WILL be used as the first frame of a talking-head video, so the pose and "
     "expression must be animation-ready — not locked into a fixed emotion."),
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
# Progress polling endpoint
@app.route("/api/progress")
def get_progress():
    total = _gen_progress["total"]
    done = _gen_progress["done"]
    phase = _gen_progress["phase"]
    pct = 0
    if phase == "analyzing":
        pct = 10  # Phase 0 = first 10%
    elif phase == "generating" and total > 0:
        pct = 10 + int((done / total) * 90)  # 10-100%
    elif phase == "complete":
        pct = 100
    return jsonify({"total": total, "done": done, "phase": phase, "percent": pct})


# 0. POST /api/chat — AI Chat Assistant
# ---------------------------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    message = data.get("message", "")
    images = data.get("images", [])
    history = data.get("history", [])

    if not message:
        return jsonify({"error": "No message"}), 400

    # Build system prompt
    system_prompt = (
        "You are the AXKAN Content Studio AI assistant — a creative director that helps plan social media content.\n"
        "AXKAN: premium Mexican souvenir brand. Colors: Rosa Mexicano #E72A88, Turquesa #09ADC2, Naranja #F39223, Verde #8AB73B.\n"
        "Products: flat laser-cut MDF souvenirs (magnets, keychains, key holders) with vivid printed illustrations.\n\n"
        "YOUR JOB:\n"
        "1. Understand what the user wants to create\n"
        "2. ENHANCE their idea — add creative details, suggest compositions, lighting, angles, moods\n"
        "3. Ask 1-2 smart clarifying questions that will improve the final result\n"
        "4. If the project involves a model/person or specific visual style, ASK for reference images\n"
        "   Say something like: '¿Tienes fotos de referencia de la modelo o del estilo que buscas? Adjúntalas con el 📎'\n"
        "5. When you have enough info, output a ready config with an ENHANCED theme description\n\n"
        "ENHANCE INSTRUCTIONS — THIS IS YOUR MOST IMPORTANT JOB:\n"
        "- The user gives you a RAW idea. Your job is to TRANSFORM it into a PROFESSIONAL creative brief.\n"
        "- The 'theme' field in the config is NOT a copy of what the user said — it's YOUR enhanced version.\n"
        "- REWRITE their idea as a detailed creative director's brief with:\n"
        "  * Specific camera movements (dolly, arc, push-in, tracking)\n"
        "  * Lighting setup (golden hour, rim light, direction, color temperature)\n"
        "  * Character details (clothing description enriched, pose, expression, body language)\n"
        "  * Atmosphere and mood (emotional tone, energy level, pacing)\n"
        "  * For videos: clip-by-clip structure with what happens in each clip\n"
        "  * For videos with dialogue: write the ACTUAL Spanish dialogue for each clip\n"
        "  * Background/environment details the user didn't specify\n"
        "- The theme should read like a professional production brief, NOT like the user's casual message\n"
        "- Example: User says 'la modelo en un café hablando de souvenirs'\n"
        "  Theme becomes: 'Clip 1: Extreme close-up, golden hour café, modelo con blusa Rosa Mexicano speaks\n"
        "  to camera with knowing expression. Warm amber lighting from window right. She says: ¿Sabes qué es\n"
        "  lo peor de vender souvenirs? Clip 2: Medium shot revealing café interior...'\n"
        "- Include AXKAN brand elements naturally (Rosa Mexicano accents, cultural pride, premium feel)\n\n"
        "WHEN TO ASK FOR REFERENCE IMAGES:\n"
        "- If user mentions a model/person → ask for reference photos of them\n"
        "- If user describes a specific visual style → ask for examples\n"
        "- If user wants product shots → ask for photos of the actual products\n"
        "- Say it naturally: '¿Me puedes compartir fotos de referencia? Así el resultado será mucho más preciso'\n\n"
        "RESPOND WITH ONLY VALID JSON (no markdown fences, no backticks):\n"
        '{"message": "response in Spanish casual Mexican tone", "suggestions": ["detailed useful suggestion 1","suggestion 2","suggestion 3"], "ready": false, "config": null}\n\n'
        "When ready (after enhancing the instructions):\n"
        '{"message": "¡Perfecto! Tu proyecto va a quedar increíble...", "suggestions": [], "ready": true, '
        '"config": {"content_type": "carousel|reel|post|character|living", "destination": "place", '
        '"slides": 6, "theme": "YOUR REWRITTEN PROFESSIONAL CREATIVE BRIEF — not a copy of user words. Include clip-by-clip structure for videos, specific camera/lighting/mood details, actual Spanish dialogue lines, clothing/styling specifics, environment details. This must read like a production document.", "is_video": false}}\n\n'
        "Rules:\n"
        "- ALWAYS respond in Spanish (casual Mexican tone, friendly)\n"
        "- Max 2-3 questions before being ready\n"
        "- Every suggestion must be USEFUL and SPECIFIC to improve the final result\n"
        "- Concise messages — short paragraphs, not essays\n"
        "- Proactively suggest creative ideas the user didn't think of\n"
        "- When the user says 'continuar' or 'generar con lo que tengo': summarize what you understood,\n"
        "  confirm key details (type, slides/clips count, destination, style), and if anything essential\n"
        "  is missing, ask ONLY that in a quick natural way before outputting ready:true\n"
        "- For videos: always confirm how many clips they want (each clip ~8 seconds)\n"
        "- The 'slides' field in config works for both image slides AND video clips\n"
        "- If user uploads images, analyze them and incorporate findings into the plan\n"
        "- SPELLING RULES in all dialogue/speech: AXKAN → AXKÁN, souvenirs → suvenirs, imanes → imánes\n"
        "- NEVER use the words 'punta' or 'sexo' anywhere\n"
        "- Write dialogue phonetically clear for AI voice generation"
    )

    # Build conversation text from history + current message
    conversation_parts = []
    for entry in history:
        role = entry.get("role", "user")
        text = entry.get("content", entry.get("text", ""))
        if role == "user":
            conversation_parts.append(f"User: {text}")
        else:
            conversation_parts.append(f"Assistant: {text}")

    # Handle images — save to temp dir if provided
    tmp_dir = None
    saved_image_paths = []
    if images:
        tmp_dir = tempfile.mkdtemp(prefix="axkan-chat-")
        for idx, img_data in enumerate(images[:3]):
            if img_data and img_data.startswith("data:"):
                m = re.match(r"^data:image/([^;]+);base64,(.+)$", img_data, re.DOTALL)
                if m:
                    ext = "jpg" if m.group(1) == "jpeg" else m.group(1)
                    img_path = os.path.join(tmp_dir, f"chat_image_{idx+1}.{ext}")
                    with open(img_path, "wb") as f:
                        f.write(base64.b64decode(m.group(2)))
                    saved_image_paths.append(img_path)

    # Build user message
    user_msg = ""
    if saved_image_paths:
        user_msg += "I've uploaded images. Read them:\n" + "\n".join(f"  {p}" for p in saved_image_paths) + "\n\n"
    user_msg += f"User: {message}"
    if conversation_parts:
        user_msg = "\n".join(conversation_parts) + f"\nUser: {message}"
        if saved_image_paths:
            user_msg = "I've uploaded images. Read them:\n" + "\n".join(f"  {p}" for p in saved_image_paths) + "\n\n" + user_msg

    # Write system prompt to temp file
    sys_dir = tempfile.mkdtemp(prefix="axkan-chat-sys-")
    sys_file = os.path.join(sys_dir, "system.txt")
    with open(sys_file, "w") as f:
        f.write(system_prompt)

    # Build claude CLI command — use Haiku for fast chat responses
    cmd = ["claude", "-p", "--system-prompt-file", sys_file, "--model", "haiku"]
    if saved_image_paths:
        cmd += ["--max-turns", "2", "--allowedTools", "Read"]
    else:
        cmd += ["--max-turns", "1"]

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, cwd=tmp_dir or sys_dir,
        )
        stdout, stderr = proc.communicate(input=user_msg, timeout=60)
    except subprocess.TimeoutExpired:
        proc.kill()
        return jsonify({"error": "AI timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if not stdout or not stdout.strip():
        return jsonify({"error": "Empty AI response", "stderr": stderr[:500] if stderr else ""}), 500

    # Parse JSON from output (strip markdown fences if present)
    raw = stdout.strip()
    # Remove markdown code fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    # Find JSON object
    brace_start = raw.find("{")
    brace_end = raw.rfind("}")
    if brace_start != -1 and brace_end != -1:
        json_str = raw[brace_start:brace_end + 1]
        try:
            result = json.loads(json_str)
            return jsonify(result)
        except json.JSONDecodeError:
            pass

    # Fallback: return raw as message
    return jsonify({"message": raw, "suggestions": [], "ready": False, "config": None})


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

    # "reel" = generic video, "living" = carousel-loop, "character" = personaje-hablando.
    # All three are VIDEO flows — they need speech fields and reel-style prompts.
    # Leaving "character" out of this set made personaje-hablando Phase 1 prompts
    # come out as static-carousel copy (no speech, no cinematic clip-by-clip).
    is_reel = content_type in ("reel", "living", "character")
    is_video = is_reel
    # Allow the client to force is_video via payload (handles edge cases where
    # the backend's content_type → flow mapping might drift).
    if data.get("is_video") is True:
        is_video = True
        is_reel = True

    print(f"\n[PROMPTS] === Generate request: dest={destination}, slides={slides}, type={content_type}, theme={theme[:50] if theme else ''}, ref_images={len(reference_images)} ===")

    # Use the client's session_id so prompts land in the same session as
    # the uploaded files (Bug: prompts_generate previously ignored it).
    sid, sess = get_session(data.get("session_id"))
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

    # Pick the role list appropriate to the sub-type:
    #   'character' → CHARACTER_ROLES  (personaje-hablando: portrait prompts)
    #   'living'    → LOOP_ROLES       (carousel-loop: self-contained loop clips)
    #   'reel' / other video → REEL_ROLES  (linear story — hook → reveal → CTA)
    #   image flows → CAROUSEL_ROLES   (Instagram 8-slide sequence)
    if content_type == "character":
        role_list = CHARACTER_ROLES
    elif content_type == "living":
        role_list = LOOP_ROLES
    elif is_reel:
        role_list = REEL_ROLES
    else:
        role_list = CAROUSEL_ROLES

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

NO TEXT IN VIDEO FRAMES:
- DO NOT include any text, words, headlines, or typography in any video frame
- Only pure visual animation — motion, transitions, camera movement
- Animated stickers or graphic elements OK, but NO readable text
- Text overlays added in post-production

QUALITY: Professional television / high studio level — Pixar, Apple commercial quality.
Every frame flawless, cinematic color grading, premium feel.
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
    elif content_type == "character":
        content_type_block = """
CHARACTER / MODEL FOR VIDEO — BEST PRACTICES:

IF THE CHARACTER IS A REAL PERSON / MODEL:
- HYPERREALISTIC is mandatory — the person must look indistinguishable from a real smartphone photo
- Skin must show REAL TEXTURE: visible pores on nose and cheeks, natural redness/flush on cheekbones,
  slight uneven tone, T-zone shine, peach fuzz visible in side lighting. NEVER airbrushed, smoothed,
  porcelain, or filtered. Skin should look like it would feel textured to the touch.
- Under-eye area must be bright and healthy — NO dark circles, NO hollowing, NO tired look
- Hair must show real texture: individual strands visible, flyaways, baby hairs, natural shine but
  never salon-perfect or blown-out
- Hands: natural with visible knuckle wrinkles, proper anatomy (exactly 5 fingers per hand, 3 joints each)
- Eyes must track naturally — both eyes same direction, natural pupil size, dual-tone iris detail
- Expression must be NATURAL: mid-laugh, warm smile reaching the eyes, or subtle pleased expression.
  Never a dead neutral stare. Include micro-actions: tucking hair, adjusting angle, glancing away then back.
- ANTI-AI AESTHETIC: Image should look like a smartphone capture, NOT a professional photoshoot.
  Include slight imperfections: motion blur on hair, slightly off-center framing, mixed color temperature,
  visible grain/noise, natural shadow under chin. NO softbox catch lights, NO magazine color grading.
- Camera: smartphone front-facing (iPhone selfie cam), 24mm wide-angle, slight barrel distortion,
  auto-exposure, medium depth of field. Looks like a frame from a casual video, NOT a photoshoot.

IF THE CHARACTER IS ANIMATED / ILLUSTRATED / 3D:
- Full body visible, front-facing or 3/4 angle, expressive pose
- Clean white or simple gradient background — the character is the hero
- Bold, vivid, saturated colors — must pop on a phone screen
- Clean precise edges — no blur, no artifacts
- Expressive face with clear eyes and mouth — designed for lip sync and emotion
- Professional character design quality — Pixar/Disney concept sheet level

CLOTHING — MANDATORY FOR BOTH:
- NEVER a plain all-white outfit — that looks cheap and generic
- Outfit MUST match the scene, context, destination, or theme:
  * Tropical/beach: colorful casual, sundress, linen, sandals
  * Urban/city: stylish fitted streetwear, modern Mexican fashion
  * Traditional/cultural: embroidered blouse, huipil, rebozo, regional dress
  * Market/street: high-waist jeans + fitted graphic tee, tote bag
  * Professional: fitted blazer, tailored trousers
  * Night out: form-fitting top, midi skirt, heeled sandals
- Clothing must have color, pattern, personality — it tells a story
- Clothing must show the character's silhouette, never shapeless or oversized

CRITICAL — NO TEXT IN THE IMAGE:
- DO NOT include any text, words, headlines, or typography in the image prompt
- No speech bubbles, no captions, no destination names, no brand names
- The image must be PURE VISUAL — only the character and scene, zero text
- Text will be added later as video overlays, NOT baked into the generated image

ANATOMICAL INTEGRITY:
- Exactly two hands, ten fingers, proper joint articulation
- Both eyes tracking same direction, consistent iris size
- No floating objects — everything in contact with hand or surface
- Hair obeys gravity, clothing consistent, body proportions fixed
- If ANY anatomical error appears, the generation has FAILED

FORMAT: 9:16 vertical (1080x1920px)
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

CRITICAL — NO TEXT IN VIDEO FRAMES:
- DO NOT include any text, words, headlines, captions, or typography in any video frame
- No titles, no subtitles, no brand names, no destination names baked into the image
- Only pure visual animation — motion, transitions, camera movement, visual effects
- Animated stickers or graphic elements are OK, but NO readable text
- Text overlays will be added in post-production, NOT generated in the video

QUALITY STANDARD — PROFESSIONAL TELEVISION / HIGH STUDIO LEVEL:
- Every frame must look like it was produced by a top-tier animation or production studio
- Pixar, Apple commercial, Netflix intro level quality
- Flawless motion, smooth transitions, zero artifacts
- Cinematic color grading, professional lighting setups
- Premium feel in every single frame — no cheap or amateur look
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

    # --- Phase 0: Pre-analyze reference images (one call, shared across all slides) ---
    ref_analysis_text = ""
    _gen_progress["total"] = slides
    _gen_progress["done"] = 0
    _gen_progress["phase"] = "idle"

    if has_refs:
        _gen_progress["phase"] = "analyzing"
        print(f"[Claude Prompts] Phase 0: Analyzing {len(saved_ref_paths)} reference images...")
        analysis_system = (
            "You are a visual analysis expert. Read the reference image(s) and output a CONCISE but SPECIFIC analysis. "
            "Cover: art style, color palette, subject description, composition, background, mood. "
            "Be specific enough to reproduce the style. Under 500 words. Output ONLY the analysis, no JSON."
        )
        analysis_user = "Read and analyze:\n" + "\n".join(f"  {p}" for p in saved_ref_paths)
        analysis_dir = os.path.join(tmp_dir, "analysis")
        os.makedirs(analysis_dir, exist_ok=True)
        sys_file_a = os.path.join(analysis_dir, "system.txt")
        with open(sys_file_a, "w") as f:
            f.write(analysis_system)
        try:
            proc = subprocess.Popen(
                ["claude", "-p", "--system-prompt-file", sys_file_a, "--max-turns", "2", "--allowedTools", "Read"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, cwd=tmp_dir,
            )
            stdout, stderr = proc.communicate(input=analysis_user, timeout=45)
            if stdout and len(stdout.strip()) > 50:
                ref_analysis_text = stdout.strip()
                print(f"[Claude Prompts] Phase 0: Done ({len(ref_analysis_text)} chars)")
            else:
                print(f"[Claude Prompts] Phase 0: Too short, fallback to per-slide reads")
        except Exception as e:
            print(f"[Claude Prompts] Phase 0: Failed ({e}), fallback to per-slide reads")

    # If pre-analysis succeeded, slides don't need to read images (fast single-turn)
    has_pre_analysis = len(ref_analysis_text) > 100

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

            PEOPLE & REALISM — CRITICAL WHEN ANY PERSON APPEARS:
            - HYPERREALISTIC skin is MANDATORY — NEVER porcelain, smooth, airbrushed, or flawless
            - Skin MUST show: visible pores on nose and cheeks, natural redness/flush on cheekbones,
              slight uneven tone, T-zone shine, peach fuzz visible in side lighting, natural imperfections
            - Include in the prompt: "real human skin texture with visible pores, natural redness on
              cheekbones, slight T-zone shine, imperfect and lived-in, never airbrushed or smoothed"
            - Under-eye area: bright and healthy, NO dark circles
            - Hair: individual strands visible, flyaways, baby hairs, natural texture — never salon-perfect
            - Hands: natural knuckle wrinkles, visible texture — never smooth porcelain
            - The person should look like a real smartphone photo, NOT a retouched magazine cover
            - No AI-looking uncanny faces, no cartoon people, no illustrated people

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

            {"The prompt must be an EXTREMELY DETAILED natural language description (300-500 words). Include: exact skin texture details (pores, redness, imperfections), precise clothing description (fabric, color, fit, pattern), exact camera setup (lens mm, aperture, distance), lighting (direction, color temperature, shadows), environment details (surfaces, objects, atmosphere), character pose and expression (micro-details: which way eyes look, mouth position, hand placement), anti-AI imperfections (grain, motion blur, off-center framing). The more specific and detailed, the more accurate the result." if content_type == "character" else "The prompt must be a HIGHLY DETAILED natural language description (150-300 words). Include: specific camera lens and aperture (e.g. 35mm f/2.8), exact lighting setup (direction, color temperature, shadow quality), material textures (fabric weave, surface finish, skin detail), environment specifics (surfaces, objects, depth layers), color grading (warm/cool, saturation level, contrast). More detail = more realistic output."}
            Professional photography/editorial quality — specify camera angle, lighting, color mood, composition.
            Any text visible in the image MUST be in SPANISH.

            PHOTOREALISM KEYWORDS — ALWAYS end every prompt_text with these exact words:
            "ultra-high resolution, 4K, sharp focus, high frequency detail, photorealistic, RAW photo,
            high dynamic range, crisp fine detail on hair strands and fabric texture, no AI smoothing,
            no plastic skin, natural film grain"
            {'''DIALOGUE / SPEECH RULES FOR VIDEO (CRITICAL):
            Generate a "speech" field with 1-2 sentences in Mexican Spanish.
            This speech will be embedded into the video prompt using Veo 3 dialogue format.

            VEO 3 SPANISH DIALOGUE FORMAT — the prompt_text MUST include dialogue like this:
            "The character says in a clear Mexican Spanish accent: '¿Texto en español aquí?'"

            RULES:
            - Write the SCENE DESCRIPTION in English
            - Write the DIALOGUE in Spanish, inside quotation marks
            - ALWAYS specify "in a Mexican Spanish accent" or "speaking Mexican Spanish"
            - Keep dialogue SHORT (under 15 words) — long sentences sound unnatural
            - The speech field contains the raw Spanish text
            - The prompt_text must embed the dialogue using: says in Mexican Spanish: "texto"
            - Add "(no subtitles)" at the end of the prompt to prevent text overlays

            PRONUNCIATION & SPELLING RULES FOR DIALOGUE:
            - AXKAN must ALWAYS be written as "AXKÁN" (with accent on A)
            - souvenirs must be written as "suvenirs" (phonetic spelling for correct pronunciation)
            - imanes must be written as "imánes" (accent on a)
            - Words with accents must emphasize the accented syllable clearly
            - NEVER include the words "punta" or "sexo" in any dialogue
            - Write dialogue phonetically clear — every syllable must be pronounceable
            - Avoid complex compound words that AI might slur together
            - Prefer short punchy phrases over long flowing sentences
            ''' if is_reel else ''}

            Respond with ONLY valid JSON, no markdown fences, no explanation:
            {{
                "slide_number": {slide_num},
                "slide_name": "{role_name}",
                "prompt_text": "scene description in English... The character says in a clear Mexican Spanish accent: 'dialogo en español' (no subtitles)...",
                {"\"speech\": \"dialogo en español puro...\"," if is_reel else ""}
                "estimated_time": "~30s"
            }}
        """)

        user_msg = (
            f"Generate 1 professional {content_type} image prompt for SLIDE {slide_num}: {role_name}. "
            f"Topic: {destination}."
        )
        if theme:
            user_msg += f" Theme: {theme}."

        if has_pre_analysis:
            # Use pre-analyzed text (fast — no image reads needed)
            user_msg += (
                f"\n\nREFERENCE IMAGE ANALYSIS (pre-analyzed):\n{ref_analysis_text}\n\n"
                f"Generate a prompt that MATCHES this visual style precisely."
            )
        elif has_refs:
            # Fallback: read images directly (slower)
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

        # If pre-analysis done, single turn (no tools needed). Otherwise multi-turn with Read.
        if has_pre_analysis:
            max_turns = "1"
            cmd = ["claude", "-p", "--system-prompt-file", sys_file, "--max-turns", "1"]
        elif has_refs:
            max_turns = "3"
            cmd = ["claude", "-p", "--system-prompt-file", sys_file, "--max-turns", "3", "--allowedTools", "Read,Glob"]
        else:
            max_turns = "1"
            cmd = ["claude", "-p", "--system-prompt-file", sys_file, "--max-turns", "1"]

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
    _gen_progress["phase"] = "generating"
    _gen_progress["done"] = 0
    print(f"[Claude Prompts] Generating {slides} prompts in PARALLEL for {destination}...")
    prompts = [None] * slides
    with ThreadPoolExecutor(max_workers=slides) as executor:
        futures = {
            executor.submit(generate_single_slide, i + 1): i
            for i in range(slides)
        }
        for future in as_completed(futures):
            idx = futures[future]
            _gen_progress["done"] += 1
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

    _gen_progress["phase"] = "complete"
    print(f"[Claude Prompts] All {slides} slides complete ✓")
    return prompts


def _generate_prompts_gemini(
    destination, slides, content_type,
    theme, reference_image, is_reel, landmarks,
):
    if content_type == "character":
        role_list = CHARACTER_ROLES
    elif content_type == "living":
        role_list = LOOP_ROLES
    elif is_reel:
        role_list = REEL_ROLES
    else:
        role_list = CAROUSEL_ROLES
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
        {'Also generate a "speech" field (1-2 sentences in Mexican Spanish). In the prompt_text, embed dialogue as: The character says in a clear Mexican Spanish accent: "texto" (no subtitles)' if is_reel else ''}

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
    if content_type == "character":
        role_list = CHARACTER_ROLES
    elif content_type == "living":
        role_list = LOOP_ROLES
    elif is_reel:
        role_list = REEL_ROLES
    else:
        role_list = CAROUSEL_ROLES
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
        user_msg += f'\n\nThe character speaks in a clear Mexican Spanish accent: "{speech}" (no subtitles)'

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
        "     Embed dialogue using Veo 3 format: The character says in a clear Mexican Spanish accent: \"texto en español\"\n"
        "     ALL dialogue MUST be in Mexican Spanish. Specify accent: 'Mexican Spanish accent'.\n"
        "     Keep dialogue under 15 words per clip. Add '(no subtitles)' at end of prompt.\n"
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
        f'The character says in a clear Mexican Spanish accent: "{dialogue}" (no subtitles). '
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
    # Word corrections
    t = re.sub(r"\baxkan\b", "AXKAN", t, flags=re.IGNORECASE)
    t = re.sub(r"\bsouvenirs?\b", "suvenirs", t, flags=re.IGNORECASE)
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
    t = re.sub(r"\bimanes\b", "imánes", t, flags=re.IGNORECASE)
    t = re.sub(r"\baxkan\b", "AXKÁN", t, flags=re.IGNORECASE)
    t = re.sub(r"\bsouvenirs?\b", "suvenirs", t, flags=re.IGNORECASE)
    for word in ["punta", "sexo", "necked"]:
        t = re.sub(rf"\b{word}\b", "", t, flags=re.IGNORECASE)
    t = re.sub(r"  +", " ", t).strip()
    return t


def _resize_image_for_envato(src_path: str, dst_path: str, max_px: int = 1200):
    """Resize an image so its longest side is max_px. Saves as JPEG for smaller size."""
    try:
        img = Image.open(src_path)
        if img.mode == "RGBA":
            img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_px:
            ratio = max_px / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        img.save(dst_path, "JPEG", quality=85)
    except Exception as e:
        print(f"[WARN] Image resize failed: {e}, using original")
        shutil.copy2(src_path, dst_path)


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
    """Reference-image upload JS for Envato ImageGen (validated 2026-04-21).

    Flow (discovered via live DOM inspection):
      1. Click <button aria-label="Imágenes de referencia"> to OPEN the dialog
      2. Wait for <input type="file" accept="image/jpeg,image/png,image/webp">
      3. Use native HTMLInputElement.prototype.files setter + dispatch 'change'
         (programmatic fi.files = dt.files is silently ignored by React)
      4. Wait for the uploaded file to appear as a tile
         (button[aria-label="Seleccionar imagen como referencia"])
      5. Click the FIRST tile — most recent upload — to commit as active reference
      6. Click the same toggle button AGAIN to CLOSE the dialog
    """
    urls = [f"http://localhost:{STUDIO_PORT}/tmp-ref/{f}" for f in filenames]
    urls_json = json.dumps(urls)
    return f"""
window.__refUploadDone = false;
window.__refUploadStatus = 'starting';
(async function() {{
  function sleep(ms){{ return new Promise(function(r){{ setTimeout(r, ms); }}); }}
  function findToggleButton(){{
    return Array.from(document.querySelectorAll('button')).find(function(b){{
      return b.getAttribute('aria-label') === 'Imágenes de referencia';
    }}) || null;
  }}
  try {{
    var urls = {urls_json};
    if (!urls || urls.length === 0) {{
      window.__refUploadStatus = 'no_urls';
      window.__refUploadDone = true;
      return;
    }}

    // --- Step 1: Open dialog ---
    var toggle = findToggleButton();
    if (!toggle) {{ window.__refUploadStatus = 'no_toggle'; window.__refUploadDone = true; return; }}
    toggle.click();
    // Wait for file input to mount
    var fi = null;
    for (var i = 0; i < 40; i++) {{
      await sleep(100);
      fi = document.querySelector('[role=dialog] input[type=file]');
      if (fi) break;
    }}
    if (!fi) {{ window.__refUploadStatus = 'no_file_input'; window.__refUploadDone = true; return; }}

    // --- Step 2: Fetch images as blobs ---
    window.__refUploadStatus = 'fetching';
    var blobs = await Promise.all(urls.map(function(u) {{
      return fetch(u).then(function(r) {{ return r.ok ? r.blob() : null; }}).catch(function() {{ return null; }});
    }}));
    var files = [];
    blobs.forEach(function(blob, idx) {{
      if (!blob) return;
      var ext = (blob.type && blob.type.split('/')[1]) || 'png';
      if (ext === 'jpeg') ext = 'jpg';
      files.push(new File([blob], 'axkan-ref-' + idx + '.' + ext, {{ type: blob.type || 'image/png' }}));
    }});
    if (files.length === 0) {{
      window.__refUploadStatus = 'no_blobs';
      toggle.click();  // close dialog
      window.__refUploadDone = true;
      return;
    }}

    // --- Step 3: Upload via native setter ---
    window.__refUploadStatus = 'uploading';
    var dt = new DataTransfer();
    files.forEach(function(f){{ dt.items.add(f); }});
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files').set;
    setter.call(fi, dt.files);
    fi.dispatchEvent(new Event('change', {{ bubbles: true }}));

    // --- Step 4: Wait for Envato to process the upload into a tile ---
    // Tile count starts at some number (existing "Recientes"); after upload it
    // grows by files.length. We need the first tile to be our new upload.
    // Poll until new tile appears and its image src is an envatousercontent URL.
    await sleep(1500);
    var tiles = [];
    for (var j = 0; j < 80; j++) {{
      await sleep(250);
      tiles = Array.from(document.querySelectorAll(
        '[role=dialog] button[aria-label=\"Seleccionar imagen como referencia\"]'
      ));
      if (tiles.length > 0) {{
        var firstImg = tiles[0].querySelector('img');
        if (firstImg && /envatousercontent|user-uploads/.test(firstImg.src || '')) break;
      }}
    }}
    if (tiles.length === 0) {{
      window.__refUploadStatus = 'no_tiles_after_upload';
      toggle.click();
      window.__refUploadDone = true;
      return;
    }}

    // --- Step 5: Click the first N tiles (our uploads) to commit as references ---
    // Envato allows up to 3 references. Click up to files.length tiles.
    var toClick = Math.min(files.length, tiles.length, 3);
    for (var k = 0; k < toClick; k++) {{
      tiles[k].click();
      await sleep(250);
    }}

    // --- Step 6: Close the dialog by toggling the button again ---
    await sleep(400);
    var toggleNow = findToggleButton();
    if (toggleNow) toggleNow.click();
    await sleep(250);

    window.__refUploadStatus = 'done';
  }} catch(e) {{
    window.__refUploadStatus = 'err:' + (e && e.message ? e.message : String(e));
  }}
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
        # Ref upload polls for up to 30s — dialog mount + Envato CDN upload
        # + tile render can take 15-25s for multiple images.
        ref_section = f"""
  set refJS to do shell script "cat " & quoted form of "{ref_js_file}"
  execute active tab of front window javascript refJS
  repeat 300 times
    set isDone to (execute active tab of front window javascript "window.__refUploadDone ? 'yes' : 'no'")
    if isDone is "yes" then exit repeat
    delay 0.1
  end repeat
  delay 0.3"""

    # Envato ImageGen (as of 2026-04-21) DOM:
    #   - Prompt:      <div role="textbox" contenteditable="true">
    #   - Hidden sync: <input name="prompt"> (React auto-mirrors on execCommand insertText)
    #   - Upload:      <button aria-label="Imágenes de referencia"> opens a
    #                  dialog with <input type="file" accept="image/jpeg,image/png,image/webp" multiple>
    #   - Ref tiles:   <button aria-label="Seleccionar imagen como referencia">
    #                  — click to commit a recent upload as an active reference.
    #   - Aspect:      <button role="combobox"> with text "Vertical"/"Horizontal"/"Cuadrado"
    #   - Generate:    <button> with text "Generar" — two exist in DOM, only the
    #                  visible one (rect.width > 0) is real.
    with open(prompt_file, 'r') as _pf:
        prompt_js = (
            _pf.read()
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "")
        )

    # Path to ref_js_file becomes a shell-read; ref_section handles the whole
    # image-upload dance if we have reference files to add.
    return f'''
tell application "Google Chrome"
  activate
  tell front window to make new tab with properties {{URL:"https://app.envato.com/image-gen"}}
  -- Page load poll
  repeat 40 times
    if not (loading of active tab of front window) then exit repeat
    delay 0.15
  end repeat
  -- Poll for the real prompt contenteditable (role=textbox)
  repeat 40 times
    if (execute active tab of front window javascript "document.querySelector('[contenteditable=\\"true\\"][role=\\"textbox\\"]')?'1':'0'") is "1" then exit repeat
    delay 0.15
  end repeat
  -- Inject AXKAN blocker + dump buttons
  execute active tab of front window javascript "{BLOCKER_JS}"
  execute active tab of front window javascript "{DUMP_BTN_JS}"
  delay 0.3
{ref_section}
  -- Insert prompt AFTER references are committed. Earlier we inserted the
  -- prompt before the ref flow, but Envato's ref-dialog open/close cycle
  -- resets focus on the contenteditable and wipes our pre-inserted text.
  -- Inserting last guarantees the prompt is the final input before Generate.
  execute active tab of front window javascript "(function(){{var el=document.querySelector('[contenteditable=\\"true\\"][role=\\"textbox\\"]');if(!el){{window.__axkanInserted='no_el';return;}}el.focus();el.click();var sel=window.getSelection();sel.removeAllRanges();var range=document.createRange();range.selectNodeContents(el);sel.addRange(range);document.execCommand('delete',false);document.execCommand('insertText',false,'{prompt_js}');el.dispatchEvent(new InputEvent('input',{{bubbles:true,inputType:'insertText'}}));window.__axkanInserted='ok';}})();"
  -- Wait for hidden mirror to sync
  repeat 20 times
    if (execute active tab of front window javascript "(document.querySelector('input[name=\\"prompt\\"]')||{{}}).value?'1':'0'") is "1" then exit repeat
    delay 0.1
  end repeat
  delay 0.3
  -- Set aspect ratio via combobox
  execute active tab of front window javascript "
    (function(){{
      var map={{'square':'Cuadrado','portrait':'Vertical','landscape':'Horizontal'}};
      var target=map['{aspect}'.toLowerCase()]||'Vertical';
      var boxes=Array.from(document.querySelectorAll('[role=combobox]'));
      var aspectBox=null;
      for(var i=0;i<boxes.length;i++){{
        var t=(boxes[i].textContent||'').trim();
        if(t==='Vertical'||t==='Horizontal'||t==='Cuadrado'){{aspectBox=boxes[i];break;}}
      }}
      if(!aspectBox||aspectBox.textContent.trim()===target) return;
      aspectBox.click();
      setTimeout(function(){{
        var btns=Array.from(document.querySelectorAll('button'));
        for(var j=0;j<btns.length;j++){{
          if((btns[j].textContent||'').trim()===target){{btns[j].click();return;}}
        }}
      }},200);
    }})();
  "
  delay 0.6
  -- Click Generate. Filter to VISIBLE button only — two exist in the DOM,
  -- one is a phantom at 0x0. Retry up to 10s while disabled.
  execute active tab of front window javascript "
    (function(){{
      var attempts=0;
      var tryClick=function(){{
        var btns=Array.from(document.querySelectorAll('button'));
        for(var i=0;i<btns.length;i++){{
          var t=(btns[i].textContent||'').trim();
          if(t==='Generar'||t==='Generate'){{
            var r=btns[i].getBoundingClientRect();
            if(r.width>0 && r.height>0 && !btns[i].disabled){{
              btns[i].click();
              window.__axkanGenerated='ok';
              return;
            }}
          }}
        }}
        attempts++;
        if(attempts<40) setTimeout(tryClick,250);
        else window.__axkanGenerated='timeout';
      }};
      tryClick();
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
# Envato Queue Watchdog — auto-retry failed video generations
# ---------------------------------------------------------------------------
_watchdog_running = False
_watchdog_stop = False

def _envato_watchdog_loop():
    """Background thread: scans all Envato video-gen tabs for 'Queue Full' screen
    and auto-clicks 'Try Again' + 'Generate' without stealing focus."""
    global _watchdog_running, _watchdog_stop
    _watchdog_running = True
    print("[Watchdog] Started — monitoring Envato tabs for queue errors...")

    js_check_and_retry = """
(function(){
  // Inject floating toggle button if not present
  if (!document.getElementById('axkan-block-btn')) {
    var d = document.createElement('div');
    d.id = 'axkan-block-btn';
    d.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:14px 24px;background:#8ab73b;color:white;border-radius:12px;font-size:14px;font-weight:bold;font-family:sans-serif;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:all 0.2s;user-select:none;';
    d.textContent = 'AXKAN: ACTIVO';
    d.onclick = function(){ window.__axkanBlocked = !window.__axkanBlocked; d.textContent = window.__axkanBlocked ? 'AXKAN: BLOQUEADO' : 'AXKAN: ACTIVO'; d.style.background = window.__axkanBlocked ? '#e72a88' : '#8ab73b'; };
    document.body.appendChild(d);
  } else {
    var d = document.getElementById('axkan-block-btn');
    d.textContent = window.__axkanBlocked ? 'AXKAN: BLOQUEADO' : 'AXKAN: ACTIVO';
    d.style.background = window.__axkanBlocked ? '#e72a88' : '#8ab73b';
  }
  // Inject floating DUMP button (bottom-left) if not present — lets us snapshot the DOM without Chrome focus
  if (!document.getElementById('axkan-dump-btn')) {
    var db = document.createElement('div');
    db.id = 'axkan-dump-btn';
    db.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:99999;padding:14px 24px;background:#09adc2;color:white;border-radius:12px;font-size:14px;font-weight:bold;font-family:sans-serif;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:all 0.2s;user-select:none;';
    db.textContent = 'AXKAN: DUMP';
    db.onclick = function(){
      db.textContent = '...dumping...';
      var out = [];
      var els = document.querySelectorAll('div,span,button,a,svg,path');
      for (var i = 0; i < els.length; i++) {
        var e = els[i]; var r = e.getBoundingClientRect();
        if (r.width < 20 || r.height < 20 || r.width > 500 || r.height > 500) continue;
        var tx = (e.textContent || '').trim();
        if (tx.length > 40) continue;
        var aria = (e.getAttribute && e.getAttribute('aria-label')) || '';
        var role = (e.getAttribute && e.getAttribute('role')) || '';
        var cls = (typeof e.className === 'string' ? e.className : '') || '';
        if (cls.length > 80) cls = cls.substring(0, 80);
        out.push({tag: e.tagName, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), text: tx.substring(0, 30), aria: aria.substring(0, 40), role: role, cls: cls});
      }
      fetch('http://localhost:8080/api/test/receive-dump', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: window.location.href, elements: out.slice(0, 400), title: document.title})})
        .then(function(r){return r.json();})
        .then(function(j){db.textContent = 'DUMPED ' + j.count + ' els'; setTimeout(function(){db.textContent = 'AXKAN: DUMP';}, 2000);})
        .catch(function(e){db.textContent = 'ERR: ' + e.message.substring(0, 15); setTimeout(function(){db.textContent = 'AXKAN: DUMP';}, 3000);});
    };
    document.body.appendChild(db);
  }
  // Skip blocked tabs
  if (window.__axkanBlocked) return 'BLOCKED';
  var results = [];
  // Check if this is a Queue Full page
  var h1s = document.querySelectorAll('h1, h2, h3');
  var isQueueFull = false;
  for (var i = 0; i < h1s.length; i++) {
    if (h1s[i].textContent.includes('Queue Full') || h1s[i].textContent.includes('Cola llena')) {
      isQueueFull = true; break;
    }
  }
  if (isQueueFull) {
    // Click "Try Again" button
    var btns = document.querySelectorAll('button, a');
    for (var j = 0; j < btns.length; j++) {
      var t = btns[j].textContent.trim().toLowerCase();
      if (t === 'try again' || t === 'intentar de nuevo' || t === 'reintentar') {
        btns[j].click();
        return 'RETRY_CLICKED';
      }
    }
    return 'QUEUE_FULL_NO_BUTTON';
  }
  // Check if Generate button exists and is enabled (page reloaded after Try Again)
  var genBtns = document.querySelectorAll('button');
  for (var k = 0; k < genBtns.length; k++) {
    var gt = genBtns[k].textContent.trim().toLowerCase();
    if ((gt === 'generate' || gt === 'generar' || gt.includes('generate')) && !genBtns[k].disabled) {
      // Check if there's a prompt in the textarea
      var ta = document.querySelector('textarea');
      if (ta && ta.value.length > 20) {
        genBtns[k].click();
        return 'GENERATE_CLICKED';
      }
    }
  }
  return 'OK';
})();
"""

    while not _watchdog_stop:
        try:
            # Get all video-gen tabs via AppleScript (no focus steal)
            script = '''
tell application "Google Chrome"
  set results to {}
  repeat with w in windows
    set tabCount to count of tabs of w
    repeat with i from 1 to tabCount
      set u to URL of tab i of w
      if u contains "video-gen" then
        try
          set r to (execute tab i of w javascript "''' + js_check_and_retry.replace('"', '\\"').replace('\n', '\\n') + '''")
          set end of results to ("tab" & i & ":" & r)
        end try
      end if
    end repeat
  end repeat
  return results as text
end tell
'''
            proc = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True, text=True, timeout=10,
            )
            output = proc.stdout.strip()
            if "RETRY_CLICKED" in output:
                print(f"[Watchdog] Queue Full detected — clicked Try Again")
            if "GENERATE_CLICKED" in output:
                print(f"[Watchdog] Re-submitted generation after retry")
        except Exception as e:
            pass  # Silent fail — don't spam logs

        # Check every 10 seconds
        for _ in range(10):
            if _watchdog_stop:
                break
            time.sleep(1)

    _watchdog_running = False
    print("[Watchdog] Stopped")


@app.route("/api/watchdog/start", methods=["POST"])
def watchdog_start():
    global _watchdog_stop
    if _watchdog_running:
        return jsonify({"success": True, "message": "Already running"})
    _watchdog_stop = False
    threading.Thread(target=_envato_watchdog_loop, daemon=True).start()
    return jsonify({"success": True, "message": "Watchdog started"})


@app.route("/api/watchdog/stop", methods=["POST"])
def watchdog_stop():
    global _watchdog_stop
    _watchdog_stop = True
    return jsonify({"success": True, "message": "Watchdog stopping..."})


@app.route("/api/watchdog/status")
def watchdog_status():
    return jsonify({"running": _watchdog_running})


@app.route("/api/watchdog/block-tab", methods=["POST"])
def watchdog_block_tab():
    """Block the current active Envato tab from watchdog automation."""
    data = request.get_json() or {}
    tab_index = data.get("tab_index")  # optional specific tab
    action = data.get("action", "block")  # "block" or "unblock"
    flag_value = "true" if action == "block" else "false"

    script = f'''
tell application "Google Chrome"
  set w to front window
  {"set targetTab to tab " + str(tab_index) + " of w" if tab_index else "set targetTab to active tab of w"}
  set u to URL of targetTab
  if u contains "envato" or u contains "video-gen" or u contains "image-gen" then
    execute targetTab javascript "window.__axkanBlocked = {flag_value}; '{action}ed'"
    return "{action}ed: " & u
  else
    return "not an Envato tab"
  end if
end tell
'''
    try:
        proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=5)
        result = proc.stdout.strip()
        print(f"[Watchdog] Tab {action}: {result}")
        return jsonify({"success": True, "result": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/watchdog/block-all", methods=["POST"])
def watchdog_block_all():
    """Block/unblock ALL Envato tabs."""
    data = request.get_json() or {}
    action = data.get("action", "block")
    flag_value = "true" if action == "block" else "false"

    script = f'''
tell application "Google Chrome"
  set count to 0
  repeat with w in windows
    repeat with i from 1 to (count of tabs of w)
      set u to URL of tab i of w
      if u contains "envato" or u contains "video-gen" or u contains "image-gen" then
        execute tab i of w javascript "window.__axkanBlocked = {flag_value};"
        set count to count + 1
      end if
    end repeat
  end repeat
  return count & " tabs {action}ed"
end tell
'''
    try:
        proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=10)
        result = proc.stdout.strip()
        print(f"[Watchdog] All tabs {action}: {result}")
        return jsonify({"success": True, "result": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# Auto-start watchdog on server boot
threading.Thread(target=_envato_watchdog_loop, daemon=True).start()


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
    reference_images = data.get("referenceImages", [])

    # Write ref images to the tmp-ref/ server directory and build public URLs
    # the in-tab JS will fetch. Unique per-send filenames prevent parallel
    # sends from clobbering each other.
    ref_urls = []
    if reference_images:
        # Use a unique prefix per send so parallel calls don't overwrite each
        # other's tmp-ref/ files. _write_ref_images currently wipes the dir;
        # we instead write our own unique files for this send only.
        send_id = uuid.uuid4().hex[:8]
        for i, data_url in enumerate(reference_images[:3]):
            if not data_url:
                continue
            # If the frontend accidentally sends a server path instead of a
            # data URL, resolve it to the on-disk file so refs aren't silently
            # dropped.
            if not data_url.startswith("data:"):
                if data_url.startswith("/sessions/"):
                    local_path = STUDIO_DIR / data_url.lstrip("/")
                    if local_path.is_file():
                        fname = f"ig-{send_id}-{i}{local_path.suffix}"
                        shutil.copy2(str(local_path), str(TMP_REF_DIR / fname))
                        ref_urls.append(f"http://localhost:{STUDIO_PORT}/tmp-ref/{fname}")
                        print(f"[Envato ImageGen] ref {i}: resolved server path → {fname}")
                    else:
                        print(f"[Envato ImageGen] ref {i}: server path not found: {local_path}")
                else:
                    print(f"[Envato ImageGen] ref {i}: skipped non-data-url: {data_url[:80]}")
                continue
            m = re.match(r"^data:image/([^;]+);base64,(.+)$", data_url, re.DOTALL)
            if not m:
                continue
            ext = "jpg" if m.group(1) == "jpeg" else m.group(1)
            raw = base64.b64decode(m.group(2))
            if len(raw) > 20 * 1024 * 1024:
                continue
            fname = f"ig-{send_id}-{i}.{ext}"
            (TMP_REF_DIR / fname).write_bytes(raw)
            ref_urls.append(f"http://localhost:{STUDIO_PORT}/tmp-ref/{fname}")

    sanitized_prompt = _sanitize_prompt(prompt)
    print(f"[Envato ImageGen] send: prompt={len(sanitized_prompt)} chars, aspect={aspect_ratio}, refs={len(ref_urls)}")

    # Run in a daemon thread — each call gets its own (window_id, tab_id) via
    # _osa_open_tab so parallel sends run cleanly on separate tabs.
    threading.Thread(
        target=_run_envato_imagegen_v2,
        args=(sanitized_prompt, ref_urls, aspect_ratio),
        daemon=True,
    ).start()

    return jsonify({"success": True, "message": "Sending to Envato ImageGen..."})


# ---------------------------------------------------------------------------
# Envato VideoGen v2 — step-by-step Python orchestrator.
#
# Why this exists: the earlier version embedded the entire multi-step UI sequence in a
# single `tell application "Google Chrome" ... end tell` block. In that mode,
# Chrome's `execute javascript` (which dispatches through the remote AppleEvent bridge)
# doesn't reliably await async functions — the upload JS returned 'no_input' because its
# querySelector ran against a DOM snapshot taken before React had populated the file input.
# A standalone bash v6 test that spawns one `osascript -e '...'` per step worked end-to-end,
# so this helper reproduces that pattern: each step is its own osascript subprocess with
# Python sleeps between them. Slower per step (~300ms spawn overhead) but observable and
# correct.
# ---------------------------------------------------------------------------

_ENVATO_VIDEOGEN_URL = "https://app.envato.com/video-gen"
_ENVATO_IMAGEGEN_URL = "https://app.envato.com/image-gen"


def _osa_js(js_source: str, tab_ref: tuple | None = None, timeout: float = 8.0) -> str:
    """Run a snippet of JS in an Envato video-gen tab via a fresh osascript subprocess.

    Returns the string the JS evaluated to (AppleScript's `execute javascript`
    stringifies the return value). Empty string on not-found / error so callers
    can treat every outcome as a plain string comparison.

    If tab_ref is a (window_id, tab_id) tuple, target that specific tab (via Chrome's
    stable id properties). This lets parallel/sequential bulk jobs each operate on
    their own tab without clashing. If tab_ref is None, fall back to the first tab
    matching _ENVATO_VIDEOGEN_URL.
    """
    # Escape backslashes first, then double quotes for the AppleScript string literal.
    js_escaped = js_source.replace("\\", "\\\\").replace('"', '\\"')
    if tab_ref is not None:
        window_id, tab_id = tab_ref
        # NB: AppleScript parses large numeric literals like 1783885217 as real numbers,
        # so `id of t is 1783885217` never matches an integer id. Coerce both sides with
        # `as integer` (which handles both the stored real and the literal) to compare
        # numerically. `=` works fine once types match.
        applescript = (
            'tell application "Google Chrome"\n'
            "  repeat with w in windows\n"
            f'    if (id of w as integer) = ({window_id} as integer) then\n'
            "      repeat with t in tabs of w\n"
            f'        if (id of t as integer) = ({tab_id} as integer) then\n'
            f'          return (execute t javascript "{js_escaped}")\n'
            "        end if\n"
            "      end repeat\n"
            "    end if\n"
            "  end repeat\n"
            '  return "NO_TAB"\n'
            "end tell\n"
        )
    else:
        applescript = (
            'tell application "Google Chrome"\n'
            "  repeat with w in windows\n"
            "    repeat with t in tabs of w\n"
            f'      if URL of t is "{_ENVATO_VIDEOGEN_URL}" then\n'
            f'        return (execute t javascript "{js_escaped}")\n'
            "      end if\n"
            "    end repeat\n"
            "  end repeat\n"
            '  return "NO_TAB"\n'
            "end tell\n"
        )
    try:
        proc = subprocess.run(
            ["osascript", "-e", applescript],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return (proc.stdout or "").strip()
    except subprocess.TimeoutExpired:
        return ""
    except Exception as e:
        print(f"[Envato V2] osa_js error: {e}")
        return ""


def _osa_open_tab(url: str = None) -> tuple | None:
    """Open a fresh Envato tab and return its (window_id, tab_id) reference.

    Chrome's id properties on windows and tabs are stable for the lifetime of that
    tab — we bind subsequent _osa_js calls to this pair so each bulk job is
    isolated to its own tab. Parallel sends cannot trip over each other because
    each has its own tab id.
    """
    target_url = url or _ENVATO_VIDEOGEN_URL
    applescript = (
        'tell application "Google Chrome"\n'
        "  activate\n"
        f'  set newTab to make new tab at end of tabs of front window with properties {{URL:"{target_url}"}}\n'
        '  return (id of front window as text) & "," & (id of newTab as text)\n'
        "end tell\n"
    )
    try:
        proc = subprocess.run(
            ["osascript", "-e", applescript],
            capture_output=True,
            text=True,
            timeout=6,
        )
        out = (proc.stdout or "").strip()
        if "," in out:
            window_id, tab_id = out.split(",", 1)
            return (int(window_id), int(tab_id))
    except Exception as e:
        print(f"[Envato] open_tab error: {e}")
    return None


def _poll_until(condition_js: str, expected: str, max_polls: int, interval: float = 0.3,
                on_retry_interval: int = 0, retry_js: str = "",
                tab_ref: tuple | None = None) -> bool:
    """Poll condition_js until its result equals `expected` (string compare), up to max_polls.

    If on_retry_interval > 0 and retry_js is set, also runs retry_js every N polls.
    Returns True on success, False on timeout. Each poll runs in its own osascript.
    """
    for i in range(1, max_polls + 1):
        r = _osa_js(condition_js, tab_ref=tab_ref)
        if r == expected:
            return True
        if on_retry_interval and retry_js and i % on_retry_interval == 0:
            _osa_js(retry_js, tab_ref=tab_ref)
        time.sleep(interval)
    return False


def _run_envato_videogen_v2(prompt_text: str, ref_url: str, is_loop: bool) -> None:
    """Orchestrate the new Envato video-gen flow step-by-step.

    Sequence (validated by test harness):
      1. Open fresh tab, wait for the contenteditable prompt div.
      2. PHASE 1 — images: click Fotograma inicial, wait file input, upload; then End
         Frame same way if loop (with retry-click at poll 10 / 20, that UI state
         needs a nudge when React hasn't fully re-rendered after start-frame thumb).
      3. PHASE 2 — prompt: execCommand('insertText') into the contenteditable so React
         syncs the hidden form input.
      4. PHASE 3 — audio: open the audio combobox, click the 'Con audio' option. The
         audio listbox coexists with the aspect one, so match by option text.
      5. PHASE 4 — generar: wait for button enabled, click it.
    """
    start_time = time.time()

    def log(msg: str) -> None:
        print(f"[Envato V2 +{int((time.time()-start_time)*1000)}ms] {msg}")

    # ---- Step 1: open tab + wait page ready ----
    log("open tab")
    tab_ref = _osa_open_tab()
    if tab_ref is None:
        log("failed to open tab — aborting")
        return
    log(f"tab_ref={tab_ref}")

    if not _poll_until(
        condition_js="document.querySelector('[role=textbox][contenteditable=true]')?'y':'n'",
        expected="y",
        max_polls=30,
        interval=0.2,
        tab_ref=tab_ref,
    ):
        log("page never became ready — aborting")
        return
    log("page ready")

    # Inject debug UI overlays
    _osa_js(BLOCKER_JS, tab_ref=tab_ref)
    _osa_js(DUMP_BTN_JS, tab_ref=tab_ref)

    # ---- Step 2a: Start Frame (if image provided) ----
    if ref_url:
        log("click Fotograma inicial")
        _osa_js(
            "(function(){var b=document.querySelectorAll('button');"
            "for(var i=0;i<b.length;i++)if(b[i].textContent.trim()==='Fotograma inicial'){b[i].click();return 'clicked';}"
            "return 'nf';})();",
            tab_ref=tab_ref,
        )

        # Let the dialog mount fully (not just poll for file input; Envato wires onChange slightly later)
        time.sleep(2)

        if not _poll_until(
            condition_js="document.querySelector('input[type=file]')?'y':'n'",
            expected="y",
            max_polls=15,
            interval=0.2,
            tab_ref=tab_ref,
        ):
            log("start-frame file input never appeared — aborting")
            return

        log("upload start frame")
        upload_js = (
            "(async function(){try{"
            f"var resp=await fetch('{ref_url}');"
            "var blob=await resp.blob();"
            "var file=new File([blob],'start.jpg',{type:'image/jpeg'});"
            "var dt=new DataTransfer();dt.items.add(file);"
            "var fis=document.querySelectorAll('input[type=file]');"
            "if(!fis.length){window.__axkanUpload='no_input';return;}"
            "var fi=fis[fis.length-1];"
            "var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'files').set;"
            "s.call(fi,dt.files);"
            "fi.dispatchEvent(new Event('change',{bubbles:true}));"
            "window.__axkanUpload='ok';"
            "}catch(e){window.__axkanUpload='err:'+e.message;}})();"
            "window.__axkanUpload='pending';"
        )
        _osa_js(upload_js, tab_ref=tab_ref)

        # Wait for the flag the async function sets on window
        if not _poll_until(
            condition_js="window.__axkanUpload||'pending'",
            expected="ok",
            max_polls=15,
            interval=0.3,
            tab_ref=tab_ref,
        ):
            # Capture status for debugging
            status = _osa_js("window.__axkanUpload||'pending'", tab_ref=tab_ref)
            log(f"start-frame upload flag: {status!r} — continuing anyway")

        # Wait for dialog to close and thumb blob to appear
        _poll_until(
            condition_js=(
                "(function(){var d=document.querySelector('[role=dialog]');"
                "var b=document.querySelectorAll('img[src^=\"blob:\"]');"
                "var n=0;for(var i=0;i<b.length;i++)if(b[i].naturalWidth>100)n++;"
                "return (!d && n>=1)?'y':'n';})();"
            ),
            expected="y",
            max_polls=30,
            interval=0.3,
            tab_ref=tab_ref,
        )
        log("start frame done")

        # ---- Step 2b: End Frame (loop mode) ----
        if is_loop:
            # Envato disables the "Fotograma final" button until the start frame
            # is fully processed.  Wait for it to become enabled before clicking.
            log("wait for Fotograma final button to be enabled")
            btn_enabled = _poll_until(
                condition_js=(
                    "(function(){var b=document.querySelectorAll('button');"
                    "for(var i=0;i<b.length;i++)if(b[i].textContent.trim()==='Fotograma final')"
                    "{return b[i].disabled?'disabled':'enabled';}"
                    "return 'nf';})();"
                ),
                expected="enabled",
                max_polls=40,
                interval=0.5,
                tab_ref=tab_ref,
            )
            if not btn_enabled:
                log("Fotograma final button never enabled — skipping end frame")
            else:
                log("click Fotograma final")
                click_final_js = (
                    "(function(){var b=document.querySelectorAll('button');"
                    "for(var i=0;i<b.length;i++)if(b[i].textContent.trim()==='Fotograma final'"
                    " && !b[i].disabled){b[i].click();return 'clicked';}"
                    "return 'nf';})();"
                )
                _osa_js(click_final_js, tab_ref=tab_ref)

                # Wait for the dialog with title "Fotograma Final" AND a file input.
                # Retry the click every 10 polls in case React swallowed the first one.
                end_dialog_ready = _poll_until(
                    condition_js=(
                        "(function(){var d=document.querySelector('[role=dialog]');"
                        "if(!d)return 'no';var fi=d.querySelector('input[type=file]');"
                        "return (d.textContent||'').indexOf('Fotograma Final')>=0 && fi ? 'y':'n';})();"
                    ),
                    expected="y",
                    max_polls=30,
                    interval=0.3,
                    on_retry_interval=10,
                    retry_js=click_final_js,
                    tab_ref=tab_ref,
                )

                if end_dialog_ready:
                    # Settle before firing upload (same reason as start frame)
                    time.sleep(1)

                    log("upload end frame")
                    end_upload_js = (
                        "(async function(){try{"
                        f"var resp=await fetch('{ref_url}');"
                        "var blob=await resp.blob();"
                        "var file=new File([blob],'end.jpg',{type:'image/jpeg'});"
                        "var dt=new DataTransfer();dt.items.add(file);"
                        "var fis=document.querySelectorAll('input[type=file]');"
                        "if(!fis.length){window.__axkanUpload='no_input';return;}"
                        "var fi=fis[fis.length-1];"
                        "var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'files').set;"
                        "s.call(fi,dt.files);"
                        "fi.dispatchEvent(new Event('change',{bubbles:true}));"
                        "window.__axkanUpload='ok';"
                        "}catch(e){window.__axkanUpload='err:'+e.message;}})();"
                        "window.__axkanUpload='pending';"
                    )
                    _osa_js(end_upload_js, tab_ref=tab_ref)

                    _poll_until(
                        condition_js="window.__axkanUpload||'pending'",
                        expected="ok",
                        max_polls=15,
                        interval=0.3,
                        tab_ref=tab_ref,
                    )
                    # Wait for 2 blob thumbs (both frames)
                    _poll_until(
                        condition_js=(
                            "(function(){var b=document.querySelectorAll('img[src^=\"blob:\"]');"
                            "var n=0;for(var i=0;i<b.length;i++)if(b[i].naturalWidth>100)n++;"
                            "return n>=2?'y':'n';})();"
                        ),
                        expected="y",
                        max_polls=30,
                        interval=0.3,
                        tab_ref=tab_ref,
                    )
                    log("end frame done")
                else:
                    log("end-frame dialog never opened — skipping end frame")

    # ---- Step 3: Prompt ----
    log("paste prompt")
    prompt_b64 = base64.b64encode(prompt_text.encode("utf-8")).decode()
    _osa_js(
        "(function(){var p=document.querySelector('[role=textbox][contenteditable=true]');"
        "if(!p)return 'no';p.focus();"
        f"var t=new TextDecoder().decode(Uint8Array.from(atob('{prompt_b64}'),function(c){{return c.charCodeAt(0);}}));"
        "document.execCommand('insertText',false,t);return 'ok';})();",
        tab_ref=tab_ref,
    )
    time.sleep(0.3)

    # ---- Step 4: Audio — ensure 'Con audio' ----
    log("set audio = Con audio")
    _osa_js(
        "(function(){var cbs=document.querySelectorAll('button[role=combobox]');"
        "for(var i=0;i<cbs.length;i++){var t=cbs[i].textContent.trim();"
        "if(t==='Sin audio'){cbs[i].click();return 'opened';}"
        "if(t==='Con audio')return 'already';}return 'nf';})();",
        tab_ref=tab_ref,
    )
    # Wait for audio listbox's 'Con audio' option to exist, then click it
    _poll_until(
        condition_js=(
            "(function(){var lbs=document.querySelectorAll('[role=listbox]');"
            "for(var i=0;i<lbs.length;i++){var o=lbs[i].querySelectorAll('button');"
            "for(var j=0;j<o.length;j++)if(o[j].textContent.trim()==='Con audio')return 'y';}"
            "return 'n';})();"
        ),
        expected="y",
        max_polls=10,
        interval=0.15,
        tab_ref=tab_ref,
    )
    _osa_js(
        "(function(){var lbs=document.querySelectorAll('[role=listbox]');"
        "for(var i=0;i<lbs.length;i++){var o=lbs[i].querySelectorAll('button');"
        "for(var j=0;j<o.length;j++)if(o[j].textContent.trim()==='Con audio'){o[j].click();return 'ok';}}"
        "return 'nf';})();",
        tab_ref=tab_ref,
    )
    time.sleep(0.3)

    # ---- Step 5: Generar ----
    log("wait for Generar to be enabled")
    if _poll_until(
        condition_js=(
            "(function(){var b=document.querySelectorAll('button');"
            "for(var i=0;i<b.length;i++)if(b[i].textContent.trim()==='Generar')"
            "return b[i].disabled?'n':'y';return 'nf';})();"
        ),
        expected="y",
        max_polls=20,
        interval=0.2,
        tab_ref=tab_ref,
    ):
        log("click Generar")
        _osa_js(
            "(function(){var b=document.querySelectorAll('button');"
            "for(var i=0;i<b.length;i++)if(b[i].textContent.trim()==='Generar'){b[i].click();return 'clicked';}"
            "return 'nf';})();",
            tab_ref=tab_ref,
        )
    else:
        log("Generar never became enabled — leaving tab for user")

    log("DONE")


# ---------------------------------------------------------------------------
# Envato ImageGen v2 — step-by-step Python orchestrator.
#
# Mirrors _run_envato_videogen_v2. Each step is its own osascript subprocess
# bound to a specific (window_id, tab_id), so parallel sends cannot trip over
# each other via Chrome's global "active tab of front window".
#
# Validated flow (2026-04-22):
#   1. Open tab, wait for [contenteditable=true][role=textbox] to mount.
#   2. If reference images: click "Imágenes de referencia" toggle, wait for
#      [role=dialog] input[type=file], upload via native setter, wait for
#      tile with envatousercontent URL, click first tile(s) to commit,
#      click toggle again to close dialog.
#   3. Insert prompt via execCommand('insertText') — MUST be after refs.
#      Dialog open/close blurs the contenteditable and wipes pre-inserted text.
#   4. Set aspect ratio via combobox → option button.
#   5. Click the VISIBLE "Generar" button (two exist in DOM — filter by rect).
# ---------------------------------------------------------------------------
def _run_envato_imagegen_v2(prompt_text: str, ref_urls: list, aspect_ratio: str) -> None:
    """Orchestrate the validated Envato ImageGen flow step-by-step.

    aspect_ratio: one of "1:1" / "1:2" / "2:1" (maps to square / portrait / landscape).
    ref_urls: list of HTTP URLs for reference images (served by Flask /tmp-ref/).
    """
    start_time = time.time()

    def log(msg: str) -> None:
        print(f"[ImageGen V2 +{int((time.time()-start_time)*1000)}ms] {msg}")

    aspect_map = {"1:1": "Cuadrado", "1:2": "Vertical", "2:1": "Horizontal"}
    target_aspect_label = aspect_map.get(aspect_ratio, "Vertical")

    # ---- Step 1: open tab + wait page ready ----
    log(f"open tab, aspect={target_aspect_label}, refs={len(ref_urls)}")
    tab_ref = _osa_open_tab(_ENVATO_IMAGEGEN_URL)
    if tab_ref is None:
        log("failed to open tab — aborting")
        return
    log(f"tab_ref={tab_ref}")

    if not _poll_until(
        condition_js="document.querySelector('[contenteditable=\"true\"][role=\"textbox\"]')?'y':'n'",
        expected="y",
        max_polls=40,
        interval=0.2,
        tab_ref=tab_ref,
    ):
        log("contenteditable never appeared — aborting")
        return
    log("page ready")

    _osa_js(BLOCKER_JS, tab_ref=tab_ref)
    _osa_js(DUMP_BTN_JS, tab_ref=tab_ref)

    # ---- Step 2: Reference images (if any) ----
    if ref_urls:
        log("click Imágenes de referencia toggle")
        toggle_js = (
            "(function(){var b=Array.from(document.querySelectorAll('button'))"
            ".find(function(x){return x.getAttribute('aria-label')==='Imágenes de referencia';});"
            "if(!b)return 'nf';b.click();return 'ok';})();"
        )
        _osa_js(toggle_js, tab_ref=tab_ref)

        # Dialog mounts its file input
        if not _poll_until(
            condition_js="document.querySelector('[role=dialog] input[type=file]')?'y':'n'",
            expected="y",
            max_polls=40,
            interval=0.1,
            tab_ref=tab_ref,
        ):
            log("ref dialog file input never appeared — skipping refs")
        else:
            log(f"upload {len(ref_urls)} ref images")
            urls_json = json.dumps(ref_urls)
            upload_js = (
                "window.__axkanRefUp='pending';"
                "(async function(){try{"
                f"var urls={urls_json};"
                "var files=[];"
                "for(var i=0;i<urls.length;i++){"
                "  var r=await fetch(urls[i]);if(!r.ok)continue;"
                "  var b=await r.blob();"
                "  var ext=(b.type.split('/')[1]||'png').replace('jpeg','jpg');"
                "  files.push(new File([b],'axkan-ref-'+i+'.'+ext,{type:b.type||'image/png'}));"
                "}"
                "if(!files.length){window.__axkanRefUp='no_blobs';return;}"
                "var dt=new DataTransfer();files.forEach(function(f){dt.items.add(f);});"
                "var fi=document.querySelector('[role=dialog] input[type=file]');"
                "if(!fi){window.__axkanRefUp='no_input';return;}"
                "var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'files').set;"
                "s.call(fi,dt.files);"
                "fi.dispatchEvent(new Event('change',{bubbles:true}));"
                "window.__axkanRefUp='uploaded';"
                "window.__axkanRefCount=files.length;"
                "}catch(e){window.__axkanRefUp='err:'+e.message;}})();"
            )
            _osa_js(upload_js, tab_ref=tab_ref)

            if not _poll_until(
                condition_js="window.__axkanRefUp||''",
                expected="uploaded",
                max_polls=30,
                interval=0.3,
                tab_ref=tab_ref,
            ):
                status = _osa_js("window.__axkanRefUp||''", tab_ref=tab_ref)
                log(f"ref upload status: {status!r} — continuing")

            # Wait for tiles to show envatousercontent URL (Envato CDN resize)
            log("wait for tiles with CDN URLs")
            _poll_until(
                condition_js=(
                    "(function(){var t=document.querySelectorAll('[role=dialog] "
                    "button[aria-label=\"Seleccionar imagen como referencia\"]');"
                    "if(!t.length)return 'n';var img=t[0].querySelector('img');"
                    "return (img && /envatousercontent|user-uploads/.test(img.src||''))?'y':'n';})();"
                ),
                expected="y",
                max_polls=80,
                interval=0.3,
                tab_ref=tab_ref,
            )

            # Click the first N tiles (most recent uploads)
            log("click tiles to commit as references")
            n = min(len(ref_urls), 3)
            click_tiles_js = (
                f"(function(){{var t=document.querySelectorAll('[role=dialog] "
                f"button[aria-label=\"Seleccionar imagen como referencia\"]');"
                f"var n=Math.min(t.length,{n});"
                f"var i=0;var tick=function(){{if(i>=n){{window.__axkanTiles='done';return;}}"
                f"t[i].click();i++;setTimeout(tick,250);}};tick();}})();"
            )
            _osa_js(click_tiles_js, tab_ref=tab_ref)
            _poll_until(
                condition_js="window.__axkanTiles||''",
                expected="done",
                max_polls=20,
                interval=0.2,
                tab_ref=tab_ref,
            )

            # Close dialog by clicking toggle again
            log("close ref dialog")
            _osa_js(toggle_js, tab_ref=tab_ref)
            time.sleep(0.5)

    # ---- Step 3: Insert prompt (AFTER refs — dialog blur wipes pre-inserted text) ----
    log("insert prompt")
    prompt_b64 = base64.b64encode(prompt_text.encode("utf-8")).decode()
    insert_js = (
        "(function(){var el=document.querySelector('[contenteditable=\"true\"][role=\"textbox\"]');"
        "if(!el){window.__axkanInserted='no_el';return;}el.focus();el.click();"
        "var sel=window.getSelection();sel.removeAllRanges();"
        "var range=document.createRange();range.selectNodeContents(el);sel.addRange(range);"
        "document.execCommand('delete',false);"
        f"var t=new TextDecoder().decode(Uint8Array.from(atob('{prompt_b64}'),function(c){{return c.charCodeAt(0);}}));"
        "document.execCommand('insertText',false,t);"
        "el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));"
        "window.__axkanInserted='ok';})();"
    )
    _osa_js(insert_js, tab_ref=tab_ref)

    # Wait for hidden mirror to sync
    _poll_until(
        condition_js="(document.querySelector('input[name=\"prompt\"]')||{}).value?'y':'n'",
        expected="y",
        max_polls=20,
        interval=0.1,
        tab_ref=tab_ref,
    )
    time.sleep(0.3)

    # ---- Step 4: Set aspect ratio ----
    log(f"set aspect to {target_aspect_label}")
    aspect_js = (
        "(function(){"
        f"var target='{target_aspect_label}';"
        "var boxes=Array.from(document.querySelectorAll('[role=combobox]'));"
        "var aspectBox=null;"
        "for(var i=0;i<boxes.length;i++){"
        "  var t=(boxes[i].textContent||'').trim();"
        "  if(t==='Vertical'||t==='Horizontal'||t==='Cuadrado'){aspectBox=boxes[i];break;}"
        "}"
        "if(!aspectBox||aspectBox.textContent.trim()===target)return 'same';"
        "aspectBox.click();"
        "setTimeout(function(){"
        "  var btns=Array.from(document.querySelectorAll('button'));"
        "  for(var j=0;j<btns.length;j++){"
        "    if((btns[j].textContent||'').trim()===target){btns[j].click();return;}"
        "  }"
        "},200);return 'clicked';})();"
    )
    _osa_js(aspect_js, tab_ref=tab_ref)
    time.sleep(0.6)

    # ---- Step 5: Click VISIBLE Generate button ----
    log("click Generate (visible only)")
    generate_js = (
        "(function(){var btns=Array.from(document.querySelectorAll('button'));"
        "for(var i=0;i<btns.length;i++){"
        "  var t=(btns[i].textContent||'').trim();"
        "  if(t==='Generar'||t==='Generate'){"
        "    var r=btns[i].getBoundingClientRect();"
        "    if(r.width>0 && r.height>0 && !btns[i].disabled){btns[i].click();return 'clicked';}"
        "  }"
        "}return 'nf';})();"
    )
    # Retry up to 10s in case Generate is still disabled (ref upload finalizing)
    _poll_until(
        condition_js=generate_js,
        expected="clicked",
        max_polls=40,
        interval=0.25,
        tab_ref=tab_ref,
    )
    log("DONE")


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

    # Embed Spanish dialogue directly in the prompt using Veo 3 format
    combined = raw_prompt
    if speech and speech.strip():
        # If prompt doesn't already contain the Spanish dialogue, append it in Veo 3 format
        if speech.strip() not in raw_prompt:
            combined = f"{raw_prompt}\n\nThe character speaks in a clear Mexican Spanish accent: \"{speech.strip()}\" (no subtitles)"

    prompt_b64 = base64.b64encode(_sanitize_video_prompt(combined).encode()).decode()

    # Support both old dataUrl refs and new server-side imagePath
    reference_images = data.get("referenceImages", [])
    image_path = data.get("imagePath")  # server-side path like /sessions/abc/uploads/img.png
    ref_filenames = []
    if image_path:
        # Copy from sessions dir to tmp-ref, resized for Envato
        src = SESSIONS_DIR.parent / image_path.lstrip("/")
        if src.exists():
            fname = "vid-frame-0.jpg"
            _resize_image_for_envato(str(src), str(TMP_REF_DIR / fname))
            ref_filenames = [fname]
    elif reference_images:
        ref_filenames = _write_ref_images(reference_images)

    # Check if loop mode (same image for both Start Frame + End Frame)
    is_loop = data.get("loop", False)

    ref_url = ""
    if ref_filenames:
        ref_url = f"http://localhost:{STUDIO_PORT}/tmp-ref/{ref_filenames[0]}"

    sanitized_prompt = _sanitize_video_prompt(combined)

    # Fire the automation in a background thread so the HTTP response returns fast.
    def _run():
        try:
            _run_envato_videogen_v2(
                prompt_text=sanitized_prompt,
                ref_url=ref_url,
                is_loop=is_loop,
            )
        except Exception as e:
            print(f"[Envato Video] automation error: {e}")

    threading.Thread(target=_run, daemon=True).start()
    print(f"[Envato Video] New flow (v2): prompt={len(combined)} chars, refs={len(ref_filenames)}, loop={is_loop}")
    return jsonify({"success": True, "message": "Sending to Envato Video Gen (new app.envato.com flow)..."})


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
    """Bulk video-gen: one Envato tab per prompt, driven through the v2 per-step helper.

    Runs tabs sequentially (not in parallel) because the v2 helper binds to a single
    app.envato.com/video-gen tab at a time — each run opens a new one, does its work,
    and moves on. Sequential is safer than parallel tabs anyway (Envato queue limits).
    """
    data = request.get_json() or {}
    prompts = data.get("prompts", [])
    if not prompts:
        return jsonify({"error": "No prompts provided"}), 400

    is_loop = data.get("loop", False)
    speeches = data.get("speeches", [])
    if not speeches:
        speeches = [""] * len(prompts)

    reference_images = data.get("referenceImages", [])
    image_paths = data.get("imagePaths", [])

    # For each prompt, stage the frame image under tmp-ref/vid-ref-{i}.jpg so it can be
    # served over HTTP to Envato's tab. Build a list of (prompt_text, ref_url) pairs.
    jobs = []
    for i, p in enumerate(prompts):
        sp = speeches[i] if i < len(speeches) else ""
        combined = p
        if sp and sp.strip() and sp.strip() not in p:
            combined = f"{p}\n\nThe character speaks in a clear Mexican Spanish accent: \"{sp.strip()}\" (no subtitles)"
        prompt_text = _sanitize_video_prompt(combined)

        # Resolve the per-slide frame image
        ref_url = ""
        if i < len(image_paths) and image_paths[i]:
            src = SESSIONS_DIR.parent / image_paths[i].lstrip("/")
            if src.exists():
                dst = TMP_REF_DIR / f"vid-ref-{i}.jpg"
                _resize_image_for_envato(str(src), str(dst))
                ref_url = f"http://localhost:{STUDIO_PORT}/tmp-ref/vid-ref-{i}.jpg"
        elif i < len(reference_images) and reference_images[i]:
            ref_data = reference_images[i]
            if ref_data and ref_data.startswith("data:"):
                m = re.match(r"^data:image/([^;]+);base64,(.+)$", ref_data, re.DOTALL)
                if m:
                    ext = "jpg" if m.group(1) == "jpeg" else m.group(1)
                    dst = TMP_REF_DIR / f"vid-ref-{i}.{ext}"
                    dst.write_bytes(base64.b64decode(m.group(2)))
                    ref_url = f"http://localhost:{STUDIO_PORT}/tmp-ref/{dst.name}"
        jobs.append((prompt_text, ref_url))

    def _run_all():
        for idx, (pt, ru) in enumerate(jobs, start=1):
            print(f"[Envato Video Bulk] job {idx}/{len(jobs)}: prompt={len(pt)}ch ref={'yes' if ru else 'no'}")
            try:
                _run_envato_videogen_v2(prompt_text=pt, ref_url=ru, is_loop=is_loop)
            except Exception as e:
                print(f"[Envato Video Bulk] job {idx} error: {e}")
            # Small breather between tabs so Envato doesn't rate-limit
            time.sleep(2)

    threading.Thread(target=_run_all, daemon=True).start()
    print(f"[Envato Video Bulk] queued {len(jobs)} videos, loop={is_loop}")
    return jsonify({"success": True, "message": f"Opening {len(jobs)} Envato Video tabs...", "count": len(jobs)})


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
        combined = f"{vid_text}\n\nThe character speaks in a clear Mexican Spanish accent: \"{sp.strip()}\" (no subtitles)" if sp and sp.strip() else vid_text
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
    # Uses the v2 Python orchestrator (see _run_envato_videogen_v2). The character flow
    # has exactly one reference image (the character photo), so we pass it as the Start Frame
    # with loop=False (character speaking isn't a seamless loop — it has a dialogue arc).
    def _phase2():
        # Give a moment for Phase 1 to start
        time.sleep(2)

        video_prompt = _generate_character_video_prompt(character_desc, dialogue, destination)
        print(f"[Character] Phase 2: Video prompt generated ({len(video_prompt)} chars)")

        # Stage the first reference image as a Start Frame for the character animation
        ref_url = ""
        if ref_filenames:
            src = TMP_REF_DIR / ref_filenames[0]
            if src.exists():
                dst = TMP_REF_DIR / "vid-char-frame.jpg"
                _resize_image_for_envato(str(src), str(dst))
                ref_url = f"http://localhost:{STUDIO_PORT}/tmp-ref/vid-char-frame.jpg"

        try:
            _run_envato_videogen_v2(
                prompt_text=_sanitize_video_prompt(video_prompt),
                ref_url=ref_url,
                is_loop=False,
            )
            print(f"[Character] Phase 2: Video prompt sent to Envato VideoGen")
        except Exception as e:
            print(f"[Character] Phase 2 error: {e}")

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
    video_clip_count = int(data.get("video_clip_count", 0))
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
        - The user wants {video_clip_count or len(image_files)} video clips total.

        ORIGINAL SLIDE PROMPTS (for context/story):
{slides_context}

        TASK: Read the image file(s), then generate EXACTLY {video_clip_count or len(image_files)} video animation prompts.
        Output EXACTLY {video_clip_count or len(image_files)} JSON objects.

        {"LOOP VIDEO STRUCTURE — THIS IS CRITICAL:" if content_type == "living" else "STORY STRUCTURE — THIS IS CRITICAL:"}
        {"Each image is an INDEPENDENT video. Each image gets its OWN unique loop animation." if content_type == "living" else ""}
        {"The SAME IMAGE is used as BOTH the Start Frame AND End Frame for each video." if content_type == "living" else ""}
        {"The animation MUST start from the exact image composition and RETURN to the exact same composition by the end." if content_type == "living" else ""}
        {"In the MIDDLE, create MIND-BLOWING, extremely attention-grabbing animations:" if content_type == "living" else ""}
        {"- Objects flying out, rotating, exploding, morphing, floating in 3D space" if content_type == "living" else ""}
        {"- Dramatic camera movements (orbit, zoom, dolly, crane shots)" if content_type == "living" else ""}
        {"- Particles, confetti, light rays, energy bursts, sparkles" if content_type == "living" else ""}
        {"- Elements separating, dancing, interacting with each other in wild ways" if content_type == "living" else ""}
        {"- Then SMOOTHLY reverse everything back to the original position" if content_type == "living" else ""}
        {"- The last frame MUST match the first frame EXACTLY for a perfect seamless loop" if content_type == "living" else ""}
        {"EVERY animation must be DIFFERENT and UNIQUE — no two videos should have the same type of movement." if content_type == "living" else ""}
        {'''ALL clips together MUST tell ONE COHERENT STORY — a narrative arc with:
        - Clip 1: HOOK — grab attention, introduce the character/scene, create curiosity
        - Middle clips: DEVELOP the story — reveal, explore, build tension or interest
        - Last clip: PAYOFF — deliver the emotional resolution, satisfying conclusion
        Whether it's 1 clip or 6, the content must feel like a complete narrative.
        Each clip extends the previous one — they are SEQUENTIAL SCENES of the same story.''' if content_type != "living" else ""}
        The first uploaded image is the visual starting point (first frame of clip 1).

        {'''FOR EACH VIDEO PROMPT INCLUDE (CHARACTER / TALKING HEAD):
        1. CHARACTER START: Exact pose and expression from the image — resting mouth, soft gaze, natural posture
        2. LIP SYNC: The character speaks the SPEECH below in clear Mexican Spanish. Mouth shapes realistic,
           not exaggerated cartoon. Micro pauses between phrases. Breathing between sentences.
        3. FACIAL MICRO-EXPRESSION: Natural eye blinks every 2-4s, subtle brow movement, warm eye contact with lens
        4. HEAD / BODY: Gentle micro head tilts tied to speech rhythm, natural shoulder settle, NO over-acting
        5. EYE CONTACT: Direct to lens throughout — this is a talking-head to camera
        6. BREATHING: Visible chest rise/fall tied to speech pace
        7. CAMERA: Locked, static shot (slight natural sway allowed). NO zooms, NO pans — the speech carries the clip.
        8. AUDIO: Speech is REQUIRED. Embed using Veo 3 format:
           The character says in a clear Mexican Spanish accent: "texto en español" (no subtitles)
        9. DURATION: 3-8s per clip, enough for ~1 sentence.
        ''' if content_type == "character" else '''FOR EACH VIDEO PROMPT INCLUDE:
        1. STARTING POSE: Describe exact starting position from the image
        2. ANIMATION PHYSICS: squash & stretch, anticipation, follow-through
        3. SECONDARY MOTION: breathing, blinking, subtle sway, micro-movements
        4. CAMERA MOVEMENT: pan, zoom, dolly, tracking shots
        5. TIMED ACTIONS: specific movements and transitions
        6. MOOD & LIGHTING: atmosphere changes, color shifts
        7. If speech exists, embed it in the video_prompt using Veo 3 format:
           The character says in a clear Mexican Spanish accent: "texto en español" (no subtitles)
        8. TECHNICAL: 24fps, 5-8 seconds, smooth transitions
        '''}

        Each video prompt: 100-200 words, vivid natural language.
        slide_name in SPANISH. speech {'ALWAYS non-empty' if content_type == 'character' else 'populated only if the flow uses dialogue'} in Mexican Spanish.
        ALL dialogue MUST be in Mexican Spanish — specify "Mexican Spanish accent" explicitly.

        CRITICAL: Output EXACTLY {video_clip_count or len(image_files)} objects in the JSON array. No more, no less.

        OUTPUT FORMAT — ONLY valid JSON, no markdown fences:
        [{{
            "slide_name": "nombre en espanol",
            "video_prompt": "cinematic prompt in English... The character says in a clear Mexican Spanish accent: 'dialogo en español' (no subtitles)",
            "speech": "dialogo en español puro",
            "estimated_time": "~5s"
        }}]
    """)

    # --- Phase 0: Pre-analyze ALL images in one call (shared across parallel generations) ---
    tmp_dir = tempfile.mkdtemp(prefix="claude-vidprompts-")
    image_analyses = {}  # idx → text analysis

    print(f"[Video Prompts] Phase 0: Analyzing {len(image_files)} images in one call...")
    analysis_system = (
        "You are a visual analysis expert. Read ALL the images and output a SEPARATE analysis for each one. "
        "For each image, describe: subject, style, color palette, composition, objects, text visible, background, mood. "
        "Be specific enough to reproduce each image's content. Format:\n"
        "IMAGE 1:\n[analysis]\n\nIMAGE 2:\n[analysis]\n\netc."
    )
    analysis_user = "Read and analyze each image separately:\n" + "\n".join(f"  {i+1}. {p}" for i, p in enumerate(image_files))
    analysis_dir = os.path.join(tmp_dir, "analysis")
    os.makedirs(analysis_dir, exist_ok=True)
    sys_file_a = os.path.join(analysis_dir, "system.txt")
    with open(sys_file_a, "w") as f:
        f.write(analysis_system)
    try:
        proc = subprocess.Popen(
            ["claude", "-p", "--system-prompt-file", sys_file_a, "--max-turns", "2", "--allowedTools", "Read"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, cwd=tmp_dir,
        )
        stdout, _ = proc.communicate(input=analysis_user, timeout=60)
        if stdout and len(stdout.strip()) > 50:
            full_analysis = stdout.strip()
            # Split by IMAGE N: markers
            for i in range(len(image_files)):
                marker = f"IMAGE {i+1}:"
                next_marker = f"IMAGE {i+2}:"
                if marker in full_analysis:
                    start = full_analysis.index(marker) + len(marker)
                    end = full_analysis.index(next_marker) if next_marker in full_analysis else len(full_analysis)
                    image_analyses[i] = full_analysis[start:end].strip()
            # If markers didn't work, use the whole thing for all
            if not image_analyses:
                for i in range(len(image_files)):
                    image_analyses[i] = full_analysis
            print(f"[Video Prompts] Phase 0: Done — {len(image_analyses)} analyses")
        else:
            print(f"[Video Prompts] Phase 0: Too short, falling back to per-image reads")
    except Exception as e:
        print(f"[Video Prompts] Phase 0: Failed ({e}), falling back to per-image reads")

    has_pre_analysis = len(image_analyses) > 0

    def generate_single_video_prompt(img_idx):
        """Generate one video prompt for one image via Claude CLI."""
        img_path = image_files[img_idx]
        slide_dir = os.path.join(tmp_dir, f"vid_{img_idx}")
        os.makedirs(slide_dir, exist_ok=True)
        sys_file = os.path.join(slide_dir, "system.txt")
        with open(sys_file, "w") as f:
            f.write(system)

        if has_pre_analysis and img_idx in image_analyses:
            # Fast single-turn — no image read needed
            user_msg = (
                f"Generate ONE video animation prompt based on this image analysis:\n\n"
                f"IMAGE ANALYSIS:\n{image_analyses[img_idx]}\n\n"
                f"Create a cinematic video prompt that animates this image. Topic: {destination}."
            )
            cmd = ["claude", "-p", "--system-prompt-file", sys_file, "--max-turns", "1"]
        else:
            # Fallback — read image directly
            user_msg = (
                f"Read this image and generate ONE video animation prompt:\n"
                f"  {img_path}\n\n"
                f"Analyze the image deeply — extract the subject, style, composition, colors. "
                f"Then create a video prompt that animates this specific image with cinematic quality. "
                f"Topic: {destination}."
            )
            cmd = ["claude", "-p", "--system-prompt-file", sys_file, "--max-turns", "3", "--allowedTools", "Read"]

        print(f"  [Video {img_idx+1}] Starting generation {'(fast)' if has_pre_analysis else '(with read)'}...")
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, cwd=tmp_dir,
        )
        try:
            stdout, stderr = proc.communicate(input=user_msg, timeout=90)
        except subprocess.TimeoutExpired:
            proc.kill()
            raise ValueError(f"Video {img_idx+1} timed out")

        output = stdout.strip()
        if not output or len(output) < 20:
            raise ValueError(f"Video {img_idx+1} empty output")

        # Extract JSON object
        text = output
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            parts = text.split("```")
            if len(parts) >= 3:
                text = parts[1].strip()

        # Try to parse as array first, then as object
        if text.strip().startswith("["):
            arr = json.loads(text)
            result = arr[0] if arr else {}
        else:
            brace_start = text.find("{")
            brace_end = text.rfind("}")
            if brace_start >= 0 and brace_end > brace_start:
                text = text[brace_start:brace_end + 1]
            result = json.loads(text)

        result.setdefault("slide_name", f"Video {img_idx+1}")
        result.setdefault("video_prompt", "")
        result.setdefault("speech", "")
        result.setdefault("estimated_time", "~5s")
        print(f"  [Video {img_idx+1}] Done ✓")
        return result

    num_videos = video_clip_count or len(image_files)
    print(f"[Video Prompts] Generating {num_videos} prompts in PARALLEL...")
    video_prompts = [None] * num_videos

    with ThreadPoolExecutor(max_workers=num_videos) as executor:
        futures = {
            executor.submit(generate_single_video_prompt, i): i
            for i in range(num_videos)
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                video_prompts[idx] = future.result()
            except Exception as e:
                print(f"  [Video {idx+1}] FAILED: {e}")
                video_prompts[idx] = {
                    "slide_name": f"Video {idx+1} (error)",
                    "video_prompt": f"Error generating prompt: {e}",
                    "speech": "",
                    "estimated_time": "~5s",
                }

    shutil.rmtree(tmp_dir, ignore_errors=True)
    video_prompts = [vp for vp in video_prompts if vp is not None]
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
# 10b. POST /api/images/upload-generated
# For the two-phase video pipeline. After the user has run Phase 1 image prompts
# through Envato ImageGen and downloaded their preferred variations, they upload
# those here. We save to sessions/<sid>/clean/ (NOT /uploads/) because
# video_prompts_generate prefers /clean/ and we want Claude's Phase 2 analysis
# to run against the CURATED images, not the original reference images.
#
# Accepts an optional session_id so Phase 2 state stays grouped with Phase 1.
# If omitted, creates a new session.
# ---------------------------------------------------------------------------
@app.route("/api/images/upload-generated", methods=["POST"])
def images_upload_generated():
    session_id = request.form.get("session_id")
    sid, sess = get_session(session_id)

    clean_dir = SESSIONS_DIR / sid / "clean"
    clean_dir.mkdir(parents=True, exist_ok=True)

    files_info = []
    for f in request.files.getlist("files"):
        file_id = uuid.uuid4().hex[:8]
        ext = Path(f.filename).suffix.lower() or ".png"
        # Normalize common variants so Claude's file-type check doesn't miss them.
        if ext in (".jpeg",):
            ext = ".jpg"
        filename = f"gen-{file_id}{ext}"
        save_path = clean_dir / filename
        f.save(str(save_path))
        files_info.append({
            "id": file_id,
            "filename": filename,
            "original_name": f.filename,
            "path": f"/sessions/{sid}/clean/{filename}",
        })

    # Mark these in session state so downstream introspection can tell
    # "curated" apart from "reference" uploads.
    sess["generated_files"] = files_info
    print(f"[UploadGenerated] session={sid} saved={len(files_info)} files to /clean/")
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


@app.route("/v2")
def serve_index_v2():
    """Desktop-first redesigned studio UI (work in progress). The old UI stays at /"""
    resp = send_file(str(BASE_DIR / "index_v2.html"))
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


@app.route("/v2/diag")
def serve_diag():
    """Diagnostic page: tests localStorage persistence across refresh."""
    return """<!DOCTYPE html><html><head><title>AXKAN Persistence Test</title></head><body>
<h2>AXKAN Persistence Diagnostic</h2>
<pre id="out">loading...</pre>
<script>
var LS_KEY = 'axkan.studio.state.v2';
var raw = localStorage.getItem(LS_KEY);
var el = document.getElementById('out');
if (!raw) {
  el.textContent = 'localStorage is EMPTY — no saved state found.\\nKey: ' + LS_KEY;
} else {
  try {
    var d = JSON.parse(raw);
    el.textContent = JSON.stringify({
      currentScreen: d.currentScreen,
      contentType: d.contentType,
      subType: d.subType,
      destination: d.destination,
      theme: d.theme,
      phase: d.phase,
      sessionId: d.sessionId,
      filePaths: (d.filePaths||[]).length,
      imagePrompts: (d.imagePrompts||[]).length,
      videoPrompts: (d.videoPrompts||[]).length,
      generatedPaths: (d.generatedPaths||[]).length,
      prompts: (d.prompts||[]).length,
      flowStamp: d.flowStamp,
      totalKeys: Object.keys(d).length,
      rawSize: raw.length + ' chars',
    }, null, 2);
  } catch(e) {
    el.textContent = 'PARSE ERROR: ' + e.message + '\\nRaw: ' + raw.substring(0,200);
  }
}
</script></body></html>""", 200, {"Content-Type": "text/html", "Cache-Control": "no-store"}


@app.route("/index_v2_bundle.js")
def serve_index_v2_bundle():
    """Bundled JS for the v2 studio. Scripts extracted from the HTML into an
    external file because Chrome's HTML parser was inconsistently skipping
    the inline <script> blocks; external src is reliable."""
    resp = send_file(str(BASE_DIR / "index_v2_bundle.js"))
    resp.headers["Content-Type"] = "application/javascript; charset=utf-8"
    return resp


# ---------------------------------------------------------------------------
# Test harness endpoints (served at /test)
# ---------------------------------------------------------------------------
@app.route("/test")
def serve_test_page():
    return send_file(str(BASE_DIR / "test_envato.html"))


_INSPECT_JS = r"""
(function(){
  function size(el){var r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};}
  var out = {};
  var p = document.querySelector('textarea') || document.querySelector('[contenteditable=true]') || document.querySelector('[role=textbox]');
  var val = p ? (p.value || p.textContent || p.innerText || '') : '';
  out.prompt_chars = val.length;
  out.prompt_sample = val.substring(0, 100);
  // File inputs
  var fis = document.querySelectorAll('input[type=file]');
  out.file_inputs = {count: fis.length, details: []};
  for (var i = 0; i < fis.length; i++) {
    var s = size(fis[i]);
    out.file_inputs.details.push({files: fis[i].files.length, w: s.w, h: s.h, accept: fis[i].accept || '-'});
  }
  // Frame cards
  out.frames = [];
  var spans = document.querySelectorAll('span');
  var seen = {};
  for (var i = 0; i < spans.length; i++) {
    var t = spans[i].textContent.trim();
    if ((t === 'Start Frame' || t === 'End Frame' || t === 'Start Frame(optional)' || t === 'End Frame(optional)') && !seen[t]) {
      seen[t] = 1;
      var card = spans[i].closest('div');
      // Walk up 6 parents max
      for (var u = 0; u < 6 && card && card.parentElement; u++) {
        var r = card.getBoundingClientRect();
        if (r.width > 100 && r.height > 100) break;
        card = card.parentElement;
      }
      var hasThumb = false, thumbSize = '';
      if (card) {
        var imgs = card.querySelectorAll('img');
        for (var j = 0; j < imgs.length; j++) {
          if (imgs[j].naturalWidth > 50 && imgs[j].naturalHeight > 50) {
            hasThumb = true;
            thumbSize = imgs[j].naturalWidth + 'x' + imgs[j].naturalHeight;
            break;
          }
        }
      }
      out.frames.push({label: t, has_thumb: hasThumb, thumb_size: thumbSize});
    }
  }
  // Preview images (blob/data URLs, real size)
  var blobs = document.querySelectorAll('img[src^="blob:"], img[src^="data:"]');
  var samples = [];
  var bigCount = 0;
  for (var i = 0; i < blobs.length; i++) {
    if (blobs[i].naturalWidth > 100) {
      bigCount++;
      if (samples.length < 5) samples.push(blobs[i].naturalWidth + 'x' + blobs[i].naturalHeight + ' ' + blobs[i].src.substring(0, 50));
    }
  }
  out.preview_imgs = {big_count: bigCount, samples: samples};
  // Visible modal-relevant buttons
  var texts = ['Upload an image', 'Upload animage', 'Cancel', 'Generate', 'X', '✕', 'Sound', 'Speech'];
  var buttons = document.querySelectorAll('div, span, button');
  var seenB = {};
  var mb = [];
  for (var i = 0; i < buttons.length; i++) {
    var t = buttons[i].textContent.trim();
    if (texts.indexOf(t) >= 0) {
      var r = buttons[i].getBoundingClientRect();
      if (r.width > 20 && r.height > 20) {
        var key = t + '@' + Math.round(r.width) + 'x' + Math.round(r.height);
        if (!seenB[key]) {
          seenB[key] = 1;
          mb.push(t + ' (' + Math.round(r.width) + 'x' + Math.round(r.height) + ')');
        }
      }
    }
  }
  out.modal_buttons = mb;
  return JSON.stringify(out);
})();
"""


@app.route("/api/test/inspect-envato")
def test_inspect_envato():
    """Run inspection JS in the active Envato tab and return structured data."""
    # Build AppleScript that runs our inspection JS on the video-gen or image-gen tab
    js_escaped = _INSPECT_JS.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    script = (
        'tell application "Google Chrome"\n'
        '  repeat with w in windows\n'
        '    repeat with t in tabs of w\n'
        '      set u to URL of t\n'
        '      if u contains "video-gen" or u contains "image-gen" then\n'
        f'        set r to (execute t javascript "{js_escaped}")\n'
        '        return u & "||" & r\n'
        '      end if\n'
        '    end repeat\n'
        '  end repeat\n'
        '  return ""\n'
        'end tell\n'
    )
    try:
        proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=10)
        raw = (proc.stdout or "").strip()
        if not raw:
            return jsonify({"success": False, "error": "No Envato tab open"})
        if "||" not in raw:
            return jsonify({"success": False, "error": f"Unexpected output: {raw[:200]}"})
        url, payload = raw.split("||", 1)
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as e:
            return jsonify({"success": False, "error": f"JS result not JSON: {payload[:200]}"})
        data["success"] = True
        data["url"] = url
        return jsonify(data)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# In-memory store for DOM dumps posted from the floating DUMP button in Envato tabs
_last_dom_dump = {"received_at": None, "data": None}


@app.route("/api/test/receive-dump", methods=["POST", "OPTIONS"])
def test_receive_dump():
    """Receive a DOM snapshot POSTed from the floating DUMP button in an Envato tab."""
    if request.method == "OPTIONS":
        resp = jsonify({"ok": True})
    else:
        data = request.get_json(silent=True) or {}
        _last_dom_dump["received_at"] = datetime.utcnow().isoformat() + "Z"
        _last_dom_dump["data"] = data
        print(f"[DumpRecv] {_last_dom_dump['received_at']} url={data.get('url','?')} elements={len(data.get('elements',[]))}")
        resp = jsonify({"ok": True, "count": len(data.get("elements", []))})
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/test/get-last-dump")
def test_get_last_dump():
    if not _last_dom_dump["data"]:
        return jsonify({"success": False, "error": "no dump received yet"})
    return jsonify({"success": True, "received_at": _last_dom_dump["received_at"], **_last_dom_dump["data"]})


@app.route("/api/test/dump-modal-dom")
def test_dump_modal_dom():
    """Dump info about clickable elements visible on the page — find X button candidates."""
    # Keep JS simple — no regex, no complex escaping. Find every visible element with short text.
    simple_js = (
        "JSON.stringify((function(){"
        "var out=[];"
        "var els=document.querySelectorAll('div,span,button,a,svg,path');"
        "for(var i=0;i<els.length;i++){"
        "var e=els[i];"
        "var r=e.getBoundingClientRect();"
        "if(r.width<20||r.height<20||r.width>500||r.height>500)continue;"
        "var tx=(e.textContent||'').trim();"
        "if(tx.length>40)continue;"
        "var aria=(e.getAttribute&&e.getAttribute('aria-label'))||'';"
        "var role=(e.getAttribute&&e.getAttribute('role'))||'';"
        "var cls=(typeof e.className==='string'?e.className:'')||'';"
        "if(cls.length>60)cls=cls.substring(0,60);"
        "out.push({tag:e.tagName,w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.left),y:Math.round(r.top),text:tx.substring(0,30),aria:aria.substring(0,30),role:role,cls:cls});"
        "}"
        "return out.slice(0,300);"
        "})());"
    )
    js_escaped = simple_js.replace('"', '\\"')
    script = (
        'tell application "Google Chrome"\n'
        '  repeat with w in windows\n'
        '    repeat with t in tabs of w\n'
        '      set u to URL of t\n'
        '      if u contains "video-gen" or u contains "image-gen" then\n'
        f'        return (execute t javascript "{js_escaped}")\n'
        '      end if\n'
        '    end repeat\n'
        '  end repeat\n'
        '  return ""\n'
        'end tell\n'
    )
    try:
        proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=10)
        raw = (proc.stdout or "").strip()
        if not raw or raw == "missing value":
            return jsonify({"success": False, "error": "no Envato tab or JS returned nothing"})
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            return jsonify({"success": False, "error": f"bad JSON: {str(e)[:80]}", "raw": raw[:500]})
        # Filter the noise: keep only candidates likely to be X / Upload / Generate or modal buttons
        interesting = []
        upload_els = []
        x_candidates = []
        for d in data:
            tx = d.get("text", "")
            aria = d.get("aria", "").lower()
            tag = d.get("tag", "")
            # Likely upload button
            if tx == "Upload an image" or tx == "Upload animage":
                upload_els.append(d)
            # Likely close/X button
            if tx in ("X", "x", "×", "✕", "") and ("close" in aria or "cancel" in aria or tag in ("SVG", "PATH")):
                x_candidates.append(d)
            # Short text that's not "Generate" — near any upload element
            if tx and len(tx) <= 5 and tx != "Generate":
                interesting.append(d)
        return jsonify({
            "success": True,
            "upload_elements": upload_els,
            "x_candidates": x_candidates,
            "short_text_elements": interesting[:30],
            "total_scanned": len(data),
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/test/close-envato-tabs", methods=["POST"])
def test_close_envato_tabs():
    script = (
        'tell application "Google Chrome"\n'
        '  set closedCount to 0\n'
        '  repeat with w in windows\n'
        '    set tabsToClose to {}\n'
        '    repeat with t in tabs of w\n'
        '      set u to URL of t\n'
        '      if u contains "video-gen" or u contains "image-gen" or u contains "labs.envato" then\n'
        '        set end of tabsToClose to t\n'
        '      end if\n'
        '    end repeat\n'
        '    repeat with t in tabsToClose\n'
        '      close t\n'
        '      set closedCount to closedCount + 1\n'
        '    end repeat\n'
        '  end repeat\n'
        '  return closedCount\n'
        'end tell\n'
    )
    try:
        proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=10)
        n = int((proc.stdout or "0").strip() or "0")
        return jsonify({"success": True, "closed": n})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


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

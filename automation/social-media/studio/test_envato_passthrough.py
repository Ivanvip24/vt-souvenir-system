#!/usr/bin/env python3
"""
Loop test — simulates the UI's Envato button clicks and verifies
text + images flow through correctly into what the AppleScript will hand to Chrome.

Per-endpoint expectations (derived from reading app.py):

  1. /api/envato/send             → writes ALL refs to tmp-ref/img-{0..N}.{ext}
  2. /api/envato/send-video       → writes ONE resized frame to tmp-ref/vid-frame-0.jpg
                                     (from referenceImages[0], used as Start Frame)
  3. /api/envato/send-all         → writes ALL refs to tmp-ref/img-{0..N}.{ext}
                                     (shared across all prompts as reference)
  4. /api/envato/send-all-video   → writes PER-SLIDE frames to a temp dir
                                     (envato-video-bulk-*/ref-{i}.{ext}, one per prompt)
                                     NOT written to tmp-ref/
  5. /api/envato/bulk-image-to-video → writes ALL refs to tmp-ref/img-{0..N}.{ext}
                                     (shared reference context for image generation)

Each iteration uses unique image bytes so we can verify SHA256 match.
Also verifies HTTP-served URLs match (this is what the AppleScript hands Chrome).

Usage:
    source venv/bin/activate
    # Studio must be already running:  python app.py &
    python test_envato_passthrough.py [-n 3]
"""

import argparse
import base64
import glob
import hashlib
import io
import os
import random
import sys
import tempfile
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw

BASE = "http://localhost:8080"
TMP_REF = Path(__file__).resolve().parent / "tmp-ref"


def make_test_image(seed, size=(256, 256)):
    rng = random.Random(seed)
    img = Image.new("RGB", size, color=(rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255)))
    draw = ImageDraw.Draw(img)
    for _ in range(5):
        x0, y0 = rng.randint(0, size[0]), rng.randint(0, size[1])
        x1, y1 = rng.randint(0, size[0]), rng.randint(0, size[1])
        color = (rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255))
        draw.rectangle([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], fill=color)
    draw.text((10, 10), f"test-{seed}", fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def png_to_data_url(png_bytes):
    return f"data:image/png;base64,{base64.b64encode(png_bytes).decode()}"


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def wait_for_tmp_ref(expected_names, timeout=3.0, poll=0.1):
    """Poll tmp-ref/ until expected files appear (Flask + AppleScript thread write them async)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        present = {p.name for p in TMP_REF.iterdir() if p.is_file()}
        if all(name in present for name in expected_names):
            return True
        time.sleep(poll)
    return False


def clear_tmp_ref():
    """Wipe tmp-ref/ before each test so we can tell what the endpoint wrote."""
    TMP_REF.mkdir(exist_ok=True)
    for f in TMP_REF.iterdir():
        try:
            f.unlink()
        except Exception:
            pass


def assert_url_matches(filename, expected_bytes, label):
    """Fetch http://localhost:8080/tmp-ref/FILENAME and assert bytes match."""
    url = f"{BASE}/tmp-ref/{filename}"
    r = requests.get(url, timeout=5)
    assert r.status_code == 200, f"[{label}] {url} → HTTP {r.status_code}"
    assert sha256(r.content) == sha256(expected_bytes), (
        f"[{label}] {url} served wrong bytes "
        f"(got sha={sha256(r.content)[:10]}, expected={sha256(expected_bytes)[:10]})"
    )


def abort():
    try:
        requests.post(f"{BASE}/api/abort", timeout=3)
    except Exception:
        pass


def check_server_running():
    try:
        return requests.get(f"{BASE}/", timeout=3).status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Endpoint-specific tests
# ---------------------------------------------------------------------------

def test_send(iteration, num_refs):
    """/api/envato/send — writes ALL refs to tmp-ref/img-{i}.png."""
    clear_tmp_ref()
    prompt = f"[iter-{iteration}] AXKAN Tulum cover shot, rosa mexicano accent"
    imgs = [make_test_image(f"send-{iteration}-{i}") for i in range(num_refs)]
    refs = [png_to_data_url(b) for b in imgs]

    r = requests.post(
        f"{BASE}/api/envato/send",
        json={"prompt": prompt, "aspectRatio": "1:2", "referenceImages": refs},
        timeout=15,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    assert r.json().get("success") is True, f"Response: {r.json()}"

    # Expect img-0.png, img-1.png, ... in tmp-ref/
    expected_names = [f"img-{i}.png" for i in range(num_refs)]
    assert wait_for_tmp_ref(expected_names, timeout=3), (
        f"tmp-ref/ missing expected files. Got: {[p.name for p in TMP_REF.iterdir()]}"
    )
    for i, expected_bytes in enumerate(imgs):
        fname = f"img-{i}.png"
        on_disk = (TMP_REF / fname).read_bytes()
        assert sha256(on_disk) == sha256(expected_bytes), (
            f"send iter={iteration}: {fname} on-disk sha mismatch"
        )
        assert_url_matches(fname, expected_bytes, label=f"send iter={iteration}")
    return {"refs_written": num_refs, "prompt_len": len(prompt)}


def test_send_video(iteration):
    """/api/envato/send-video — writes ONE resized frame to tmp-ref/vid-frame-0.jpg (from refs[0]) OR no file if no refs."""
    clear_tmp_ref()
    prompt = f"[iter-{iteration}] Character speaking about AXKAN"
    speech = f"Iteración {iteration}, dialog text."
    first_img = make_test_image(f"video-{iteration}-0")
    # send-video uses referenceImages the same way — _write_ref_images → img-0.png
    refs = [png_to_data_url(first_img)]

    r = requests.post(
        f"{BASE}/api/envato/send-video",
        json={"prompt": prompt, "speech": speech, "referenceImages": refs},
        timeout=15,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    assert r.json().get("success") is True, f"Response: {r.json()}"

    # Without imagePath (server-side), it falls through to _write_ref_images → img-0.png
    expected_names = ["img-0.png"]
    assert wait_for_tmp_ref(expected_names, timeout=3), (
        f"tmp-ref/ missing expected files. Got: {[p.name for p in TMP_REF.iterdir()]}"
    )
    on_disk = (TMP_REF / "img-0.png").read_bytes()
    assert sha256(on_disk) == sha256(first_img), "send-video: img-0.png bytes mismatch"
    assert_url_matches("img-0.png", first_img, label=f"send-video iter={iteration}")
    return {"refs_written": 1, "prompt_len": len(prompt), "speech_len": len(speech)}


def test_send_all(iteration, num_prompts, num_refs):
    """/api/envato/send-all — writes ALL refs to tmp-ref/img-{i}.png (shared across prompts)."""
    clear_tmp_ref()
    prompts = [f"[iter-{iteration}-p{i}] Slide {i}" for i in range(num_prompts)]
    imgs = [make_test_image(f"all-{iteration}-{i}") for i in range(num_refs)]
    refs = [png_to_data_url(b) for b in imgs]

    r = requests.post(
        f"{BASE}/api/envato/send-all",
        json={"prompts": prompts, "aspectRatios": ["1:2"] * num_prompts, "referenceImages": refs},
        timeout=20,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    assert r.json().get("success") is True, f"Response: {r.json()}"

    expected_names = [f"img-{i}.png" for i in range(num_refs)]
    assert wait_for_tmp_ref(expected_names, timeout=3), (
        f"tmp-ref/ missing expected files. Got: {[p.name for p in TMP_REF.iterdir()]}"
    )
    for i, expected_bytes in enumerate(imgs):
        on_disk = (TMP_REF / f"img-{i}.png").read_bytes()
        assert sha256(on_disk) == sha256(expected_bytes), f"send-all: img-{i}.png bytes mismatch"
        assert_url_matches(f"img-{i}.png", expected_bytes, label=f"send-all iter={iteration}")
    return {"prompts": num_prompts, "refs_written": num_refs}


def test_send_all_video(iteration, num_prompts):
    """/api/envato/send-all-video — writes PER-SLIDE frames to envato-video-bulk-*/ref-{i}.ext."""
    # This endpoint uses its own tempfile.mkdtemp, NOT tmp-ref/
    clear_tmp_ref()
    prompts = [f"[iter-{iteration}-p{i}] Video clip {i}" for i in range(num_prompts)]
    speeches = [f"Diálogo {i}" for i in range(num_prompts)]
    # One ref image per prompt (1:1 mapping — Start Frame per slide)
    imgs = [make_test_image(f"allvid-{iteration}-{i}") for i in range(num_prompts)]
    refs = [png_to_data_url(b) for b in imgs]

    # Snapshot temp dirs before call
    tmp_dirs_before = set(glob.glob(os.path.join(tempfile.gettempdir(), "envato-video-bulk-*")))

    r = requests.post(
        f"{BASE}/api/envato/send-all-video",
        json={"prompts": prompts, "speeches": speeches, "referenceImages": refs},
        timeout=20,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    assert r.json().get("success") is True, f"Response: {r.json()}"

    # Give Flask + AppleScript thread time to write temp files before it may clean up
    time.sleep(0.4)

    # Find the new temp dir
    tmp_dirs_after = set(glob.glob(os.path.join(tempfile.gettempdir(), "envato-video-bulk-*")))
    new_dirs = tmp_dirs_after - tmp_dirs_before
    assert new_dirs, f"No new envato-video-bulk-* dir found after call"
    new_dir = Path(sorted(new_dirs)[-1])

    # Expect ref-0.png, ref-1.png, ...
    verified = 0
    for i, expected_bytes in enumerate(imgs):
        # Files may be png or jpg (depends on whether resize happened)
        candidates = list(new_dir.glob(f"ref-{i}.*"))
        assert candidates, f"send-all-video: no ref-{i}.* in {new_dir}"
        # For dataUrl path, the endpoint writes raw bytes (no resize), so bytes match
        on_disk = candidates[0].read_bytes()
        assert sha256(on_disk) == sha256(expected_bytes), (
            f"send-all-video: {candidates[0].name} sha mismatch "
            f"(got {sha256(on_disk)[:10]}, expected {sha256(expected_bytes)[:10]})"
        )
        verified += 1
    # Also verify each prompt.txt was written
    for i, expected_prompt in enumerate(prompts):
        pf = new_dir / f"prompt-{i}.txt"
        assert pf.exists(), f"send-all-video: missing {pf.name}"
        text = pf.read_text()
        # Prompt text should appear in the file (speech is appended to it)
        # _sanitize_video_prompt may strip accents, so check a safe substring
        marker = f"iter-{iteration}-p{i}"
        assert marker in text, f"send-all-video: {pf.name} missing marker '{marker}'. Contents: {text[:120]}"
    return {"prompts": num_prompts, "refs_written": verified, "temp_dir": new_dir.name}


def test_bulk_image_to_video(iteration, num_clips, num_refs):
    """/api/envato/bulk-image-to-video — writes shared refs to tmp-ref/img-{i}.png."""
    clear_tmp_ref()
    clips = [
        {
            "imagePrompt": f"[iter-{iteration}-c{i}] gen image",
            "videoPrompt": f"[iter-{iteration}-c{i}] animate",
            "speech": f"Clip {i} diálogo",
        }
        for i in range(num_clips)
    ]
    imgs = [make_test_image(f"i2v-{iteration}-{i}") for i in range(num_refs)]
    refs = [png_to_data_url(b) for b in imgs]

    r = requests.post(
        f"{BASE}/api/envato/bulk-image-to-video",
        json={"clips": clips, "referenceImages": refs},
        timeout=20,
    )
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    assert r.json().get("success") is True, f"Response: {r.json()}"

    expected_names = [f"img-{i}.png" for i in range(num_refs)]
    assert wait_for_tmp_ref(expected_names, timeout=3), (
        f"tmp-ref/ missing expected files. Got: {[p.name for p in TMP_REF.iterdir()]}"
    )
    for i, expected_bytes in enumerate(imgs):
        on_disk = (TMP_REF / f"img-{i}.png").read_bytes()
        assert sha256(on_disk) == sha256(expected_bytes), f"bulk-i2v: img-{i}.png bytes mismatch"
        assert_url_matches(f"img-{i}.png", expected_bytes, label=f"bulk-i2v iter={iteration}")
    return {"clips": num_clips, "refs_written": num_refs}


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run_loop(iterations):
    if not check_server_running():
        print(f"[FAIL] Studio not reachable at {BASE}. Run `python app.py` first.")
        sys.exit(1)
    print(f"Studio reachable at {BASE}")
    print(f"Running {iterations} iterations × 5 endpoints = {iterations * 5} total calls\n")

    results, failures = [], []
    start = time.time()
    for i in range(1, iterations + 1):
        num_refs = (i % 3) + 1
        num_prompts = (i % 3) + 2
        num_clips = (i % 2) + 1
        print(f"--- Iteration {i}/{iterations} (refs={num_refs}, prompts={num_prompts}, clips={num_clips}) ---")

        tests = [
            ("send",               test_send,               (i, num_refs)),
            ("send-video",         test_send_video,         (i,)),
            ("send-all",           test_send_all,           (i, num_prompts, num_refs)),
            ("send-all-video",     test_send_all_video,     (i, num_prompts)),
            ("bulk-image-to-video",test_bulk_image_to_video,(i, num_clips, num_refs)),
        ]
        for label, fn, args in tests:
            abort()
            time.sleep(0.15)
            try:
                res = fn(*args)
                print(f"  [OK]   {label}: {res}")
                results.append((label, res))
            except AssertionError as e:
                print(f"  [FAIL] {label}: {e}")
                failures.append((i, label, str(e)))
            except Exception as e:
                print(f"  [ERR]  {label}: {type(e).__name__}: {e}")
                failures.append((i, label, f"{type(e).__name__}: {e}"))
        print()

    abort()
    elapsed = time.time() - start
    total = len(results) + len(failures)
    print("=" * 60)
    print(f"  Loop test complete in {elapsed:.1f}s")
    print(f"  Passed: {len(results)}/{total}")
    print(f"  Failed: {len(failures)}/{total}")
    print("=" * 60)
    if failures:
        print("\nFAILURES:")
        for it, label, msg in failures:
            print(f"  iter {it} {label}: {msg}")
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--iterations", "-n", type=int, default=3)
    args = ap.parse_args()
    run_loop(args.iterations)

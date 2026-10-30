"""Prompt Studio's generation settings: the bar above its media panel.

The bar's values live in the node's hidden `gen_state` widget (JSON). This
module turns them into what the node's bundle carries: the diffusion model's
file name, sampler, scheduler, steps and seed for the sampler side of the
graph, and the width / height / length the video is made at.

Resolution follows PlagueKind's Unified Resize Image
(https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes, MIT): the same scale
modes, aspect presets, divisible-by snapping with the aspect kept, and the
same linear-light cover-and-centre-crop resize, applied here to the keyframes
so they arrive at exactly the size the latent is made at.

The seed follows rgthree's Seed node: -1 is "random each time", -2 / -3 are
"last seed plus / minus one". The frontend swaps those for a real seed when
the prompt is queued (promptstudio's gensettings.js); a prompt queued some
other way (the API, a script) gets a random one here, with a warning.
"""

import json
import math
import random

SCALE_MODES = ("Longer Side", "Shorter Side", "Total Pixels (MP)")

# Unified Resize's presets, in its order (core's ResolutionSelector's), less
# its "Auto (Input Image)" — Auto is a separate switch on the bar.
ASPECT_RATIOS = {
    "1:1 (Square)": (1.0, 1.0),
    "2:3 (Portrait Photo)": (2.0, 3.0),
    "3:2 (Photo)": (3.0, 2.0),
    "3:4 (Portrait Standard)": (3.0, 4.0),
    "4:3 (Standard)": (4.0, 3.0),
    "9:16 (Portrait Widescreen)": (9.0, 16.0),
    "16:9 (Widescreen)": (16.0, 9.0),
    "21:9 (Ultrawide)": (21.0, 9.0),
}

# The latent's own step (EmptyMiniMaxH3LatentAV takes width/height in 32s).
DIVISIBLE_BY = 32

SEED_RANDOM, SEED_INCREMENT, SEED_DECREMENT = -1, -2, -3
SPECIAL_SEEDS = (SEED_RANDOM, SEED_INCREMENT, SEED_DECREMENT)
SEED_MAX = 1125899906842624          # rgthree's range

DEFAULTS = {
    "model": "",
    "sampler": "euler",
    "scheduler": "simple",
    "steps": 20,
    "seed": SEED_RANDOM,
    "scale_mode": "Longer Side",
    "aspect": "16:9 (Widescreen)",
    "long_side": 1344,
    "short_side": 768,
    "megapixels": 1.0,
    "auto": False,
}

# Which picture Auto takes its aspect from, per mode; T2VA and Reference
# have no keyframe, so Auto does nothing there.
AUTO_SOURCE = {"I2VA": "first_frame", "FL2VA": "first_frame", "L2VA": "last_frame"}

# The bundle, in output order (PlagueKind's Bundle Out hands input_N to
# output_N). The first seven are the node's outputs from before 3.6.0, in
# their old order, so an older workflow's links move across slot for slot.
BUNDLE_NAMES = (
    "model", "prompt", "references", "first_frame", "last_frame",
    "ref2va_needed", "mods",
    "width", "height", "length",
    "model_name", "sampler", "scheduler", "steps", "seed",
)


def parse(gen_state):
    """gen_state with every key present and in range; bad values fall back
    to the defaults rather than failing the run."""
    try:
        raw = json.loads(gen_state or "{}")
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    st = dict(DEFAULTS)
    for key, default in DEFAULTS.items():
        val = raw.get(key, default)
        try:
            if isinstance(default, bool):
                val = bool(val)
            elif isinstance(default, int):
                val = int(val)
            elif isinstance(default, float):
                val = float(val)
            else:
                val = str(val) if val is not None else default
        except (TypeError, ValueError):
            val = default
        st[key] = val
    if st["scale_mode"] not in SCALE_MODES:
        st["scale_mode"] = DEFAULTS["scale_mode"]
    if st["aspect"] not in ASPECT_RATIOS:
        st["aspect"] = DEFAULTS["aspect"]
    st["steps"] = max(1, min(10000, st["steps"]))
    st["long_side"] = max(DIVISIBLE_BY, min(16384, st["long_side"]))
    st["short_side"] = max(DIVISIBLE_BY, min(16384, st["short_side"]))
    st["megapixels"] = max(0.01, min(100.0, st["megapixels"]))
    if st["seed"] not in SPECIAL_SEEDS:
        st["seed"] = max(0, min(SEED_MAX, st["seed"]))
    return st


def snap_length(seconds):
    """Frames at 24 fps, snapped up to H3's 17k+5 grid — promptbuilder.js's
    snapLength, which the editor's duration hint shows."""
    try:
        seconds = float(seconds)
    except (TypeError, ValueError):
        seconds = 0.0
    frames = max(5, int(round(seconds * 24)))
    frames += (5 - (frames % 17) + 17) % 17
    return frames


def duration_of(builder_state):
    try:
        val = json.loads(builder_state or "{}").get("duration", 5)
        val = float(val)
        return val if val > 0 else 5.0
    except Exception:
        return 5.0


# ---- Unified Resize Image's sizing (PlagueKind, MIT) --------------------------

def _safe_dim(v):
    return max(1, int(round(v)))


def resolve_size(mode, w, h, st):
    """Target size for an aspect of w:h (Unified Resize's resolve_size)."""
    w = max(1.0, float(w))
    h = max(1.0, float(h))
    if mode == "Longer Side":
        scale = float(st["long_side"]) / max(w, h)
        return _safe_dim(w * scale), _safe_dim(h * scale)
    if mode == "Shorter Side":
        scale = float(st["short_side"]) / min(w, h)
        return _safe_dim(w * scale), _safe_dim(h * scale)
    aspect = w / h
    area = float(st["megapixels"]) * 1_000_000.0
    nw = max(1, int(round(math.sqrt(area * aspect))))
    nh = max(1, int(round(area / nw)))
    return nw, nh


def _snap(v, div):
    return max(div, (max(1, int(v)) // div) * div)


def apply_divisible(w, h, div=DIVISIBLE_BY):
    """Snap to `div`, keeping the aspect (Unified Resize's apply_divisible
    with maintain_aspect on): the longer side snaps, the other follows it."""
    w, h = max(1, int(w)), max(1, int(h))
    aspect = w / h
    if w >= h:
        w = _snap(w, div)
        h = _snap(max(1, int(round(w / aspect))), div)
    else:
        h = _snap(h, div)
        w = _snap(max(1, int(round(h * aspect))), div)
    return w, h


def resolution(st, mode, pictures):
    """(width, height, where the aspect came from). `pictures` maps
    first_frame / last_frame to the keyframe tensors ([1, H, W, 3]) being
    sent, for Auto."""
    aspect = ASPECT_RATIOS[st["aspect"]]
    source = st["aspect"]
    if st["auto"]:
        key = AUTO_SOURCE.get(mode)
        pic = pictures.get(key) if key else None
        if pic is not None:
            aspect = (float(pic.shape[2]), float(pic.shape[1]))
            source = f"Auto ({key}, {pic.shape[2]}x{pic.shape[1]})"
    w, h = resolve_size(st["scale_mode"], aspect[0], aspect[1], st)
    w, h = apply_divisible(w, h)
    return w, h, source


def _srgb_to_linear(x):
    import torch
    x = x.clamp(0.0, 1.0)
    return torch.where(x <= 0.04045, x / 12.92,
                       ((x.clamp(min=0.04045) + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(x):
    import torch
    x = x.clamp(0.0, 1.0)
    return torch.where(x <= 0.0031308, x * 12.92,
                       1.055 * x.clamp(min=0.0031308) ** (1.0 / 2.4) - 0.055)


def cover_resize(image, width, height, method="bicubic"):
    """[B, H, W, 3] scaled to cover width x height, then centre-cropped to
    it, resampled in linear light (Unified Resize with crop "center")."""
    import comfy.utils
    if image is None:
        return None
    if image.shape[1] == height and image.shape[2] == width:
        return image
    x = _srgb_to_linear(image.movedim(-1, 1))
    oh, ow = x.shape[2], x.shape[3]
    scale = max(width / ow, height / oh)
    sw, sh = max(width, int(round(ow * scale))), max(height, int(round(oh * scale)))
    x = comfy.utils.common_upscale(x, sw, sh, method, False)
    top, left = max(0, (sh - height) // 2), max(0, (sw - width) // 2)
    x = x[:, :, top:top + height, left:left + width]
    return _linear_to_srgb(x).movedim(1, -1).contiguous()


def run_seed(st, label="Studio"):
    """The seed to send. A special value only reaches here when the prompt
    didn't come through the frontend, which swaps it on queue."""
    seed = st["seed"]
    if seed in SPECIAL_SEEDS:
        new = random.randint(0, SEED_MAX)
        print(f"[MiniMaxH3 {label}] seed {seed} is a 'random/increment/decrement' "
              f"setting the browser normally replaces on queue; this prompt "
              f"didn't come through it, so a random seed was used: {new}")
        return new
    return seed

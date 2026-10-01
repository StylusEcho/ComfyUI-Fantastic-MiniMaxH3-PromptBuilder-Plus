"""Mask helpers for Prompt Studio's Mask for editing panel.

This pack registers no Object Mask node of its own. Auto Mask queues the
original pack's (MiniMaxH3FantasticObjectMask), which runs SAM 3.1 and saves
each layer's result in its input/minimax_h3/masks. What stays here is what
this pack's own /mask_compose route needs: combining the layers into the
clip's mask, and reading and saving masks. The notes below describe the
whole mask format, both packs' halves of it.

Dots can go on several frames. Each marked frame is segmented from its own
dots (and the typed name, which picks the match under them) and tracked
forward to the next marked frame; the first is also tracked back to the
start, since core's tracker only starts from a first-frame mask. So a mask
that drifts is fixed by adding a dot where it goes wrong. With a name only,
the tracker looks for it on every frame. A run can replace a layer's mask,
add to it or subtract from it.

The mask editor builds a clip's mask from a stack of layers, bottom first,
each adding to or cutting from the ones below it: SAM results (Auto Mask),
keyframed ellipses, rectangles and polygons, and brush strokes.
compose_layers() draws them into the one mask the edit uses. The shape
keyframing (normalised shapes, per-shape keys, Shown/Hidden keys) follows
BISAM20's Animated Mask Editor, https://github.com/BISAM20/ComfyUI-AnimatedMaskEditor
(MIT License, Copyright (c) 2026 Bishoy Samaan).

Masks are stored one bit per pixel (np.packbits along the width); older
one-byte masks still read.

The editor's mask mode passes its trim. Only the trimmed span is decoded and
masked; the mask is stored against the source frame (no crop, no mirror) with
the frame it starts at, and the loader applies the item's crop and mirror
when it sends the clip, so a later reframe still lines up. A small sprite of
it is saved alongside for the editor's and the loader card's overlay.
"""

import json
import math
import os
import uuid

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw

import folder_paths

from . import media_io

# Combined masks live apart from upstream's input/minimax_h3/masks: each
# pack's Clean up only sees its own nodes, so a shared folder would let the
# original pack's delete masks Prompt Studio still uses. Auto Mask results
# arrive in UPSTREAM_SUBFOLDER and are copied here when a mask is combined.
SUBFOLDER = "minimax_h3_plus/masks"
UPSTREAM_SUBFOLDER = "minimax_h3/masks"
DECODE_CAP = 1008          # SAM 3 works at 1008 px; decoding larger only costs memory
SPRITE_W = 320             # the overlay the editor and loader card draw: one small tile per frame
SPRITE_MAX = 600           # longer masks keep every Nth frame


def _stem(annotated):
    name = os.path.basename(str(annotated).split(" [")[0])
    stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in os.path.splitext(name)[0])
    return stem[:60] or "clip"


def _pixels(spec, width, height):
    """Normalised {"x", "y"} points -> [(x, y)] pixel positions."""
    return [(round(float(p["x"]) * (width - 1)), round(float(p["y"]) * (height - 1)))
            for p in spec or [] if isinstance(p, dict) and "x" in p and "y" in p]


def _points(pixels):
    """Pixel positions -> core's point-prompt JSON."""
    return json.dumps([{"x": x, "y": y} for x, y in pixels]) if pixels else None


def _clicked(found, pos, neg):
    """The text detections the clicks pick out: those under a green dot and
    under no red one, joined. None when the clicks miss every detection."""
    hits = [m for m in found if any(m[y, x] > 0 for x, y in pos) and not any(m[y, x] > 0 for x, y in neg)]
    return (torch.stack(hits).amax(dim=0) > 0).float()[None] if hits else None


def _track(sam3, model, frames, **kw):
    track = sam3.SAM3_VideoTrack.execute(images=frames, model=model, **kw).result[0]
    return sam3.SAM3_TrackToMask.execute(track_data=track, object_indices="").result[0]


def _save_sprite(masks, folder, stem):
    """The mask as one small PNG of tiles, one per frame, white with the mask
    as alpha. The editor and the loader card draw the tile for the frame on
    screen, so the overlay follows scrubbing exactly. Returns its layout."""
    n, h, w = masks.shape
    tw, th = SPRITE_W, max(1, round(h * SPRITE_W / w))
    step = -(-n // SPRITE_MAX)
    picks = masks[::step]
    cols = max(1, int(np.ceil(np.sqrt(picks.shape[0]))))
    rows = -(-picks.shape[0] // cols)
    # "area" keeps a thin edge visible at thumbnail size instead of dropping it
    small = torch.cat([F.interpolate(picks[i:i + 32, None].float(), size=(th, tw), mode="area")[:, 0] > 0.2
                       for i in range(0, picks.shape[0], 32)]).to(torch.uint8) * 255
    alpha = np.zeros((rows * th, cols * tw), dtype=np.uint8)
    for i in range(small.shape[0]):
        r, c = divmod(i, cols)
        alpha[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = small[i].numpy()
    name = f"{stem}.png"
    Image.fromarray(np.stack([np.full_like(alpha, 255), alpha], axis=-1), "LA").save(
        os.path.join(folder, name), optimize=True)
    return {"file": f"{SUBFOLDER}/{name} [input]", "tw": tw, "th": th, "cols": cols,
            "count": int(small.shape[0]), "step": int(step)}


def _keyframes(spec, first, n, w, h):
    """[(frame, positive, negative)] from the panel's points, sorted, one per
    frame. Takes {"frames": [{time, positive, negative}, ...]} or the older
    single {time, positive, negative}. A frame needs a green dot to seed."""
    frames = spec.get("frames") if isinstance(spec.get("frames"), list) else [spec]
    keys = {}
    for f in frames:
        if not isinstance(f, dict):
            continue
        pos, neg = _pixels(f.get("positive"), w, h), _pixels(f.get("negative"), w, h)
        if pos:
            k = min(n - 1, max(0, round(float(f.get("time") or 0) * media_io.FPS) - first))
            keys[k] = (pos, neg)
    return [(k, *keys[k]) for k in sorted(keys)]


def _seed(sam3, model, cond, frame, pos, neg, threshold):
    """A mask on one frame from its dots: with a name, the matches under the
    green dots; otherwise SAM's own segment of the clicked point."""
    if cond is not None:
        # A click alone is ambiguous (a jacket, or the person wearing it).
        # With a name too, SAM finds every match and the clicks choose.
        found = sam3.SAM3_Detect.execute(model=model, image=frame, conditioning=cond, threshold=threshold,
                                         refine_iterations=2, individual_masks=True).result[0]
        seed = _clicked(found.cpu(), pos, neg)
        if seed is not None:
            return seed, True
    # One refine pass only: later passes see the mask without the clicks and
    # tend to grow it to the whole object.
    seed = sam3.SAM3_Detect.execute(model=model, image=frame, positive_coords=_points(pos),
                                    negative_coords=_points(neg), threshold=threshold,
                                    refine_iterations=1, individual_masks=False).result[0]
    return seed, False


def pack(masks):
    """bool [n, h, w] -> uint8 [n, h, ceil(w/8)], one bit per pixel."""
    return torch.from_numpy(np.packbits(masks.numpy(), axis=-1))


def read_mask(annotated):
    """(metadata, bool [n, h, w]) for a saved mask, packed or older one-byte."""
    from safetensors import safe_open
    path = media_io.resolve(annotated)
    if not os.path.isfile(path):
        raise ValueError(f"The clip's mask file is missing ({str(annotated).split(' [')[0]}). Mask the clip "
                         "again, or clear its mask in the Media Loader.")
    with safe_open(path, framework="pt") as fh:
        meta = fh.metadata() or {}
        stored = fh.get_tensor("mask")
    if meta.get("format") == "packed1":
        w = int(meta["width"])
        return meta, torch.from_numpy(np.unpackbits(stored.numpy(), axis=-1, count=w).view(bool))
    return meta, stored > 0


def save_mask(masks, source, first, how):
    """Write bool [n, h, w] as a packed mask plus its overlay sprite; the info
    the panel keeps on the clip."""
    from safetensors.torch import save_file
    n, _h, w = masks.shape
    hit = int(masks.flatten(1).any(dim=1).sum())
    if not hit:
        raise ValueError("The mask is empty on every frame.")
    folder = os.path.join(folder_paths.get_input_directory(), SUBFOLDER)
    os.makedirs(folder, exist_ok=True)
    tag = f"{_stem(source)}_{uuid.uuid4().hex[:8]}"
    name = f"{tag}.safetensors"
    save_file({"mask": pack(masks).contiguous()}, os.path.join(folder, name),
              metadata={"format": "packed1", "width": str(w), "fps": str(media_io.FPS),
                        "start_frame": str(first), "source": os.path.basename(str(source).split(" [")[0])})
    sprite = _save_sprite(masks, folder, tag)
    sprite["start"] = first
    return {"file": f"{SUBFOLDER}/{name} [input]", "frames": n, "hit": hit,
            "share": round(np.count_nonzero(masks.numpy()) / masks.numel(), 4), "how": how, "sprite": sprite}


def _aligned(base, first, n, h, w):
    """A saved mask on this run's frames and size: frames it doesn't cover are empty."""
    meta, bm = read_mask(base)
    if tuple(bm.shape[1:]) != (h, w):
        bm = F.interpolate(bm[:, None].float(), size=(h, w), mode="nearest")[:, 0] > 0.5
    idx = torch.arange(first - int(meta.get("start_frame", 0)), first - int(meta.get("start_frame", 0)) + n)
    inside = (idx >= 0) & (idx < bm.shape[0])
    out = torch.zeros(n, h, w, dtype=torch.bool)
    out[inside] = bm[idx[inside]]
    return out


def _stamp(stroke, h, w):
    """One brush stroke as bool [h, w]: disks along its path."""
    r = max(1.0, float(stroke.get("r", 0.02)) * h)
    pts = [(float(p["x"]) * (w - 1), float(p["y"]) * (h - 1)) for p in stroke.get("points") or []
           if isinstance(p, dict) and "x" in p and "y" in p]
    out = np.zeros((h, w), dtype=bool)
    if not pts:
        return out
    path = [pts[0]]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        steps = max(1, int(math.hypot(x1 - x0, y1 - y0) / max(1.0, r / 2)))
        path += [(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps) for t in range(1, steps + 1)]
    for x, y in path:
        x0, x1 = max(0, int(x - r)), min(w, int(x + r) + 1)
        y0, y1 = max(0, int(y - r)), min(h, int(y + r) + 1)
        if x0 >= x1 or y0 >= y1:
            continue
        yy, xx = np.ogrid[y0:y1, x0:x1]
        out[y0:y1, x0:x1] |= (xx - x) ** 2 + (yy - y) ** 2 <= r * r
    return out


SHAPES = ("ellipse", "rect", "poly")
MOTIONS = ("smooth", "linear", "ease")


def _keys(layer):
    """A shape layer's keys, sorted by time, one per time."""
    out = []
    for k in sorted((k for k in layer.get("keys") or [] if isinstance(k, dict)), key=lambda k: float(k["t"])):
        if out and abs(float(k["t"]) - float(out[-1]["t"])) < 1e-6:
            out[-1] = k
        else:
            out.append(k)
    if layer.get("kind") == "poly" and out:
        count = len(out[0].get("pts") or [])
        if count < 3 or any(len(k.get("pts") or []) != count for k in out):
            raise ValueError(f"The polygon layer '{layer.get('name')}' has keys with different point counts.")
    return out


def _curve(keys, t, get, motion):
    """get(key) at time t between keys: held before the first and after the
    last. smooth = a curve through every key (Catmull-Rom tangents, spaced by
    time), linear = straight between keys, ease = slowing into and out of
    each key. The editor's preview (medialoader.js) computes the same."""
    if t <= float(keys[0]["t"]):
        return get(keys[0])
    if t >= float(keys[-1]["t"]):
        return get(keys[-1])
    i = max(j for j in range(len(keys) - 1) if float(keys[j]["t"]) <= t)
    a, b = keys[i], keys[i + 1]
    ta, tb = float(a["t"]), float(b["t"])
    u = (t - ta) / (tb - ta)
    va, vb = get(a), get(b)
    if motion == "linear":
        return va + (vb - va) * u
    if motion == "ease":
        return va + (vb - va) * u * u * (3 - 2 * u)
    p0 = keys[i - 1] if i > 0 else a
    p3 = keys[i + 2] if i + 2 < len(keys) else b
    m1 = (vb - get(p0)) / (tb - float(p0["t"])) * (tb - ta)
    m2 = (get(p3) - va) / (float(p3["t"]) - ta) * (tb - ta)
    u2, u3 = u * u, u * u * u
    return (2 * u3 - 3 * u2 + 1) * va + (u3 - 2 * u2 + u) * m1 + (3 * u2 - 2 * u3) * vb + (u3 - u2) * m2


def shape_at(layer, t):
    """A shape layer at time t in seconds, or None where it's hidden (the last
    key at or before t is Hidden; before the first key, the first key says).
    Ellipse and rectangle: centre x, y and full w, h as fractions of the
    frame, rot in degrees. Polygon: pts as fractions, rot about the centre of
    their bounding box (a point added on an edge doesn't move it)."""
    keys = _keys(layer)
    if not keys:
        return None
    cur = keys[0]
    for k in keys:
        if float(k["t"]) <= t + 1e-6:
            cur = k
    if cur.get("off"):
        return None
    motion = layer.get("motion") if layer.get("motion") in MOTIONS else "smooth"
    val = lambda get: float(_curve(keys, t, get, motion))
    rot = val(lambda k: float(k.get("rot") or 0))
    if layer.get("kind") == "poly":
        return {"pts": [(val(lambda k, i=i: float(k["pts"][i][0])), val(lambda k, i=i: float(k["pts"][i][1])))
                        for i in range(len(keys[0]["pts"]))], "rot": rot}
    return {name: val(lambda k, name=name: float(k[name])) for name in ("x", "y", "w", "h")} | {"rot": rot}


def _outline(kind, s, w, h):
    """A shape's outline in pixels of a w x h frame, rotated about its centre."""
    if kind == "poly":
        pts = [(x * w, y * h) for x, y in s["pts"]]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    else:
        cx, cy, rx, ry = s["x"] * w, s["y"] * h, abs(s["w"]) * w / 2, abs(s["h"]) * h / 2
        if kind == "ellipse":
            pts = [(cx + rx * math.cos(a), cy + ry * math.sin(a)) for a in (2 * math.pi * i / 96 for i in range(96))]
        else:
            pts = [(cx - rx, cy - ry), (cx + rx, cy - ry), (cx + rx, cy + ry), (cx - rx, cy + ry)]
    c, sn = math.cos(math.radians(s["rot"])), math.sin(math.radians(s["rot"]))
    return [(cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c) for x, y in pts]


def _layer_frames(layer, first, n, h, w):
    """One layer as bool [n, h, w] over the clip's frames first .. first + n - 1
    at media_io.FPS, or None when it has nothing to draw yet."""
    kind = layer.get("kind")
    if kind == "auto":
        return _aligned(layer["result"], first, n, h, w) if layer.get("result") else None
    out = torch.zeros(n, h, w, dtype=torch.bool)
    if kind == "brush":
        # a stroke reaches its frame, from there to the end, or the whole clip
        for stroke in layer.get("strokes") or []:
            k = round(float(stroke.get("time") or 0) * media_io.FPS) - first
            reach = stroke.get("reach")
            if reach not in ("forward", "all") and not 0 <= k < n:
                continue
            span = slice(max(0, k), n) if reach == "forward" else slice(0, n) if reach == "all" else slice(k, k + 1)
            stamp = torch.from_numpy(_stamp(stroke, h, w))
            if stroke.get("erase"):
                out[span] &= ~stamp
            else:
                out[span] |= stamp
        return out
    if kind not in SHAPES:
        raise ValueError(f"Unknown mask layer kind {kind!r}.")
    if not _keys(layer):
        return None
    for f in range(n):
        s = shape_at(layer, (first + f) / media_io.FPS)
        if s is not None:
            img = Image.new("1", (w, h), 0)
            ImageDraw.Draw(img).polygon(_outline(kind, s, w, h), fill=1)
            out[f] = torch.from_numpy(np.array(img, dtype=bool))
    return out


def compose_layers(clip, layers, start=0.0, end=0.0):
    """The editor's layers as one mask over the kept range (`end` 0 = to the
    end of the clip), saved like a masking run's (packed, with its sprite):
    shown layers applied in stack order, bottom first, each adding to or
    cutting from those below it. SAM results are at the size masking decodes to, so the rest is
    drawn at that size too. Only the kept range: a long source file masked
    whole ran to tens of GB."""
    info = media_io.probe(clip)
    if not info["width"] or not info["duration"]:
        raise ValueError("Couldn't read the clip's size and length.")
    w, h = media_io._scaled_size(info["width"], info["height"], DECODE_CAP) or (info["width"], info["height"])
    first = round(float(start or 0) * media_io.FPS)
    last = round(min(float(end or 0) or info["duration"], info["duration"]) * media_io.FPS)
    n = max(1, last - first + 1)
    out = torch.zeros(n, h, w, dtype=torch.bool)
    names = []
    for layer in layers:
        if not isinstance(layer, dict) or layer.get("visible") is False:
            continue
        m = _layer_frames(layer, first, n, h, w)
        if m is None:
            continue
        if layer.get("mode") == "cut":
            out &= m.logical_not_()
        else:
            out |= m
        names.append(str(layer.get("name") or layer.get("kind")))
    if not out.any():
        raise ValueError("The layers don't mask anything on the kept frames.")
    return save_mask(out, clip, first, "layers: " + ", ".join(names))


def load_mask(annotated, n, start=None, mirror=False, crop=None):
    """A saved mask cut and framed the way the Media Loader sends its clip: the
    trim's `n` frames, mirrored then cropped. It stays at the resolution it was
    saved at; callers bring it to the size they work at. Frames it doesn't
    cover (the trim was widened after masking) come out empty, so they are
    kept as filmed. Returns [n, h, w] float."""
    meta, stored = read_mask(annotated)
    at = round(float(start or 0) * media_io.FPS) - int(meta.get("start_frame", 0))
    idx = torch.arange(at, at + n)
    inside = (idx >= 0) & (idx < stored.shape[0])
    m = torch.zeros(n, *stored.shape[1:])
    m[inside] = stored[idx[inside]].float()
    if not bool(inside.all()):
        print(f"[MiniMaxH3 mask] the mask covers {int(inside.sum())} of the {n} frames sent; the rest "
              "stay as filmed. Mask the clip again to cover the new trim.")
    return media_io._apply_crop(media_io._apply_mirror(m[..., None], mirror), crop)[..., 0]



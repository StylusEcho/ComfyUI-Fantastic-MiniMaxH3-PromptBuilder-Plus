"""Subject masking for the media panel's pictures (Plus only).

A picture can carry a subject mask (Auto mask with SAM 3.1 through the
original pack's Object Mask, corrected with the brush; see `item["subject"]`
in web/medialoader.js). When the picture goes out as a <Picture N> reference,
Reference mode only, its background is blurred around the subject and/or it
is cropped to the subject. The file on disk is never changed, and a picture
sent as a keyframe is left alone.

The blur and its helpers follow upstream's video_edit.blur_outside (the
RefMod Create tab's Blur background); crop_rect is the same sum as the
editor's subjectCropRect, so the dashed box there is what's sent.
"""

import math

import torch
import torch.nn.functional as F

CHUNK = 16


def active(item):
    """Masked, and set to do something with it. Mirrors subjectActive() in
    the frontend."""
    spec = item.get("subject") if isinstance(item, dict) else None
    if not isinstance(spec, dict) or item.get("kind") != "picture":
        return False
    masked = bool(spec.get("found") and spec.get("mask")) or bool(spec.get("strokes"))
    return masked and (float(spec.get("blur") or 0) > 0 or (bool(spec.get("crop")) and _box(spec) is not None))


def _box(spec):
    """The box around what's masked, the file's way round, or None."""
    if spec.get("strokes"):
        return spec.get("brushBox") or None
    return spec.get("bbox") if spec.get("found") else None


def _turn_rect(r, rotate, mirror):
    """A box in the file's own frame, turned clockwise and then mirrored, as
    load_image turns the picture (turnRect in the frontend)."""
    x, y, w, h = (float(r.get(k, 0.0)) for k in ("x", "y", "w", "h"))
    for _ in range(((int(rotate or 0) % 360) + 360) % 360 // 90):
        x, y, w, h = 1.0 - y - h, x, h, w
    if mirror:
        x = 1.0 - x - w
    return x, y, w, h


def crop_rect(item):
    """The crop to the subject on the picture as shown: its box enlarged by
    the margin around its centre and slid to stay inside. None when crop to
    subject is off or nothing is masked."""
    spec = item.get("subject") or {}
    box = _box(spec)
    if not spec.get("crop") or not box:
        return None
    x, y, w, h = _turn_rect(box, item.get("rotate") or 0, bool(item.get("mirror")))
    m = min(4.0, max(1.0, float(spec.get("margin") or 1.75)))
    cw, ch = min(1.0, w * m), min(1.0, h * m)
    cx = min(1.0 - cw, max(0.0, x + w / 2 - cw / 2))
    cy = min(1.0 - ch, max(0.0, y + h / 2 - ch / 2))
    return {"x": cx, "y": cy, "w": cw, "h": ch}


def _device():
    try:
        import comfy.model_management as mm
        return mm.get_torch_device()
    except Exception:
        return torch.device("cpu")


def _separable(fn, x, px):
    k = 2 * px + 1
    x = fn(x, (1, k), stride=1, padding=(0, px))
    return fn(x, (k, 1), stride=1, padding=(px, 0))


def _avg(x, k, stride, padding):
    return F.avg_pool2d(x, k, stride=stride, padding=padding, count_include_pad=False)


def gaussian_blur(f, sigma):
    """[n, 3, h, w] through an exact separable Gaussian of `sigma` pixels; the
    edges are extended rather than darkened."""
    r = max(1, math.ceil(3 * sigma))
    k = torch.exp(-0.5 * (torch.arange(-r, r + 1, device=f.device, dtype=torch.float32) / sigma) ** 2)
    k = (k / k.sum()).repeat(3, 1, 1, 1)
    f = F.conv2d(F.pad(f, (r, r, 0, 0), mode="replicate"), k.view(3, 1, 1, -1), groups=3)
    return F.conv2d(F.pad(f, (0, 0, r, r), mode="replicate"), k.view(3, 1, -1, 1), groups=3)


def blur_outside(frames, keep, radius, grow, edge):
    """`frames` [n, h, w, 3] with everything but the subject blurred by a
    Gaussian of `radius` pixels. `keep` [n or 1, h, w] is the subject at the
    frames' size; it is widened by `grow` pixels so hair and edges stay
    sharp, and its edge softened over `edge` pixels so the blur fades in."""
    n = frames.shape[0]
    dev = _device()
    out = torch.empty_like(frames)
    for i in range(0, n, CHUNK):
        m = (keep[i:i + CHUNK] if keep.shape[0] > 1 else keep).to(dev, torch.float32)[:, None]
        if grow > 0:
            m = _separable(F.max_pool2d, m, grow)
        if edge > 0:
            m = _separable(_avg, m, edge)
        f = frames[i:i + CHUNK].to(dev, torch.float32).movedim(-1, 1)
        out[i:i + CHUNK] = torch.lerp(gaussian_blur(f, radius), f, m.clamp(0, 1)).movedim(1, -1).to(out.device, out.dtype)
    return out


def apply(image, item, crop):
    """A picture already loaded for sending (turned, mirrored, cropped to
    `crop`, size-capped) with its background blurred around the subject.
    Unchanged when the blur is off."""
    spec = item.get("subject") or {}
    radius = float(spec.get("blur") or 0)
    if radius <= 0:
        return image
    from .object_mask import subject_mask
    size = spec.get("size") if isinstance(spec.get("size"), (list, tuple)) and all(spec.get("size") or []) else None
    if not spec.get("mask") and not size:
        size = (image.shape[2], image.shape[1])
    keep = subject_mask(spec, 1, mirror=bool(item.get("mirror")), crop=crop,
                        rotate=item.get("rotate") or 0, size=size)
    keep = F.interpolate(keep[:, None].float(), size=tuple(image.shape[1:3]), mode="bilinear",
                         align_corners=False)[:, 0]
    return blur_outside(image, keep, radius, int(spec.get("grow") or 0), int(spec.get("edge") or 0))

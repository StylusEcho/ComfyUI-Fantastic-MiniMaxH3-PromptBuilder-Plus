"""MiniMax H3 Prompt Studio
A guided prompt-composition and reference-media node for the open-weight
MiniMax H3 model (FL2VA family: T2VA / I2VA / FL2VA / L2VA, and Ref2VA
full-reference mode).

Outputs the final prompt STRING plus the mode-gated reference bundle and the
first two loaded pictures, so a plain graph needs nothing else wired in.
"""

import json

from . import media_io

PICTURES = 9
VIDEOS = 3
VIDEO_AUDIOS = 3
AUDIOS = 3


# What each mode can actually consume. Base modes have no reference slots at
# all — their pictures are the native node's first_frame / last_frame.
MODE_LIMITS = {
    "T2VA": {"picture": 0, "video": 0, "video_audio": 0, "audio": 0},
    "I2VA": {"picture": 1, "video": 0, "video_audio": 0, "audio": 0},
    "FL2VA": {"picture": 2, "video": 0, "video_audio": 0, "audio": 0},
    "L2VA": {"picture": 1, "video": 0, "video_audio": 0, "audio": 0},
    "REF": {"picture": PICTURES, "video": VIDEOS,
            "video_audio": VIDEO_AUDIOS, "audio": AUDIOS},
}


def _split_name(name):
    """'video_audio_2' -> ('video_audio', 2)"""
    group, _, num = name.rpartition("_")
    try:
        return group, int(num)
    except ValueError:
        return group, 0


def _mode_of(builder_state):
    try:
        mode = json.loads(builder_state or "{}").get("mode")
    except Exception:
        mode = None
    return mode if mode in MODE_LIMITS else "REF"


def _usable(name, mode):
    group, index = _split_name(name)
    return index <= MODE_LIMITS.get(mode, MODE_LIMITS["REF"]).get(group, 0)


def _linked_inputs(prompt, unique_id):
    """Names of a node's inputs that are actually connected."""
    try:
        inputs = prompt[str(unique_id)]["inputs"]
    except Exception:
        return None
    return {
        name
        for name, val in inputs.items()
        if isinstance(val, list) and len(val) == 2
    }


def _iter_links(value):
    """Yield every [node_id, slot] link inside an input value.

    Plain inputs hold a bare link, but Autogrow inputs (as used by the
    native MiniMax H3 reference node) hold a dict of links, one per grown
    slot — so the scan has to recurse or those consumers are invisible.
    """
    if isinstance(value, list):
        if (len(value) == 2
                and isinstance(value[0], (str, int))
                and isinstance(value[1], int)
                and not isinstance(value[1], bool)):
            yield value
        else:
            for item in value:
                yield from _iter_links(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _iter_links(item)


# Bundle key <-> slot-name group, in the native node's presentation order.
_BUNDLE_GROUPS = (
    ("pictures", "picture", PICTURES),
    ("videos", "video", VIDEOS),
    ("video_audios", "video_audio", VIDEO_AUDIOS),
    ("audios", "audio", AUDIOS),
)


def gate_bundle(bundle, mode, label="PromptStudio"):
    """Blank out media the chosen mode can't send.

    Base modes take their pictures as the native node's first/last frame and
    carry no references at all, so anything they can't use is dropped here
    rather than surprising the model. Withholding is always printed, never
    silent.
    """
    out, withheld = {}, []
    for key, group, cap in _BUNDLE_GROUPS:
        kept = []
        for index, value in enumerate(list(bundle.get(key) or [])[:cap]):
            name = f"{group}_{index + 1}"
            if value is not None and not _usable(name, mode):
                withheld.append(name)
                value = None
            kept.append(value)
        out[key] = kept
    if withheld:
        print(
            f"[MiniMaxH3 {label}] mode {mode}: {', '.join(withheld)} loaded "
            "but not sent — this mode doesn't use them. Switch mode in "
            "the editor (and Save) to send them."
        )
    return out, withheld


def _partition(items):
    """Split items into the four native groups, preserving list order.

    A video's split audio goes to the paired group (its <Audio N> is
    emitted just before its <Video N>) or to the standalone group,
    depending on the item's audio_mode.
    """
    pictures, videos, video_audios, audios = [], [], [], []
    for item in items:
        # Items switched off in the loader are kept in the list but never
        # reach the model, so the tag numbering closes up around them.
        if isinstance(item, dict) and item.get("enabled") is False:
            continue
        kind = item.get("kind")
        if kind == "picture":
            pictures.append(item)
        elif kind == "video":
            mode = item.get("audio_mode", "paired")
            has_audio = bool(item.get("has_audio"))
            videos.append(item)
            if has_audio and mode == "paired":
                video_audios.append(item)
            else:
                video_audios.append(None)
            if has_audio and mode == "standalone":
                audios.append(item)
        elif kind == "audio":
            audios.append(item)
    return pictures, videos, video_audios, audios


def _trim_span(item):
    """(start, end) seconds from an item's trim, ignoring non-positive values."""
    t = item.get("trim") if isinstance(item, dict) else None
    if not isinstance(t, dict):
        return None, None

    def num(v):
        try:
            v = float(v)
            return v if v > 0 else None
        except (TypeError, ValueError):
            return None

    return num(t.get("start")), num(t.get("end"))


def _brief_audio(a):
    if a is None:
        return "None"
    if not (isinstance(a, dict) and "waveform" in a):
        return f"unexpected type {type(a).__name__}"
    try:
        w = a["waveform"]
        rms = float((w ** 2).mean() ** 0.5)
        return f"{list(w.shape)}@{a['sample_rate']}Hz rms={rms:.4f}"
    except Exception as exc:
        return f"unreadable ({exc})"


def build_bundle(media_state="[]", label="Studio"):
    """Decode a media-panel state string into an H3_REFS bundle."""
    try:
        items = json.loads(media_state or "[]")
    except Exception:
        items = []
    if not isinstance(items, list):
        items = []

    pictures, videos, video_audios, audios = _partition(items)

    pic_t = [media_io.load_image(i["file"], crop=i.get("crop"),
                                 mirror=bool(i.get("mirror")),
                                 rotate=i.get("rotate") or 0,
                                 resize=i.get("resize") or 0)
             for i in pictures[:PICTURES]]
    vid_t = [media_io.load_video_frames(i["file"], start=_trim_span(i)[0],
             end=_trim_span(i)[1], crop=i.get("crop"),
             mirror=bool(i.get("mirror")),
             resize=i.get("resize"))
             for i in videos[:VIDEOS]]
    vaud_t = [
        media_io.extract_audio(i["file"], start=_trim_span(i)[0],
                               end=_trim_span(i)[1]) if i else None
        for i in video_audios[:VIDEO_AUDIOS]
    ]
    aud_t = []
    for i in audios[:AUDIOS]:
        if i.get("kind") == "video":
            aud_t.append(media_io.extract_audio(i["file"],
                start=_trim_span(i)[0], end=_trim_span(i)[1]))
        else:
            aud_t.append(media_io.load_audio(i["file"],
                start=_trim_span(i)[0], end=_trim_span(i)[1]))

    print(f"[MiniMaxH3 {label}] {len(items)} item(s) in state -> "
          f"{len(pic_t)} picture(s), {len(vid_t)} video(s), "
          f"{sum(1 for x in vaud_t if x is not None)} soundtrack(s), "
          f"{len(aud_t)} standalone audio")
    for i, a in enumerate(vaud_t):
        if a is not None:
            print(f"[MiniMaxH3 {label}]   video_audio_{i+1}: {_brief_audio(a)}")
    for i, a in enumerate(aud_t):
        print(f"[MiniMaxH3 {label}]   audio_{i+1}: {_brief_audio(a)}")

    return {
        "pictures": pic_t,
        "videos": vid_t,
        "video_audios": vaud_t,
        "audios": aud_t,
        "items": items,
    }


def validate_media_state(media_state="[]"):
    """Panel-state check: readable, a list, within H3's item caps."""
    try:
        items = json.loads(media_state or "[]")
    except Exception:
        return "Media state is corrupt; clear the node and re-add media."
    if not isinstance(items, list):
        return "Media state is corrupt; clear the node and re-add media."
    pics = sum(1 for i in items if i.get("kind") == "picture")
    vids = sum(1 for i in items if i.get("kind") == "video")
    if pics > PICTURES:
        return f"{pics} pictures loaded; H3 accepts {PICTURES}."
    if vids > VIDEOS:
        return f"{vids} videos loaded; H3 accepts {VIDEOS}."
    return True


def _pad(seq, n):
    return list(seq or []) + [None] * (n - len(seq or []))


class MiniMaxH3PromptStudio:
    """Prompt Builder and Media Loader in one node.

    Same two panels, no wiring between them: the prompt editor and the media
    panel share this node's own state, so the tags the editor offers are the
    tags the bundle will carry. Deliberately input-less — reference media
    comes from the panel, not from upstream slots.

    Emits the prompt, the mode-gated bundle, and the first two pictures on
    their own IMAGE outputs, so a plain I2VA / L2VA / FL2VA graph needs nothing
    else.
    """

    CATEGORY = "conditioning/video_models"
    DESCRIPTION = (
        "MiniMax H3 prompt writing and reference media in a single node. "
        "Click 'Edit Prompt' to open the guided editor, and load media in the "
        "panel below it. Outputs the MODEL for the mode being used, the final "
        "prompt STRING, an H3_REFS bundle holding only what the chosen mode "
        "can actually send, the first two loaded pictures as IMAGEs for "
        "first_frame / last_frame, and a ref2va_needed BOOLEAN that is true "
        "in full-reference mode."
    )

    # model leads, matching the order the chain is actually wired in: the
    # checkpoint reaches the sampler first, then the prompt and its media.
    #
    # Slots are positional in a saved workflow, so moving it here shifts every
    # other output down one and any graph built before this release will come
    # back mis-wired — prompt landing where model belongs, and so on. That is a
    # deliberate one-off, taken in the same breaking release that dropped the
    # standalone nodes rather than spent as a second break later. Anything
    # added from here on gets appended last, as references and the pictures
    # originally were.
    RETURN_TYPES = ("MODEL", "STRING", "H3_REFS", "IMAGE", "IMAGE", "BOOLEAN")
    RETURN_NAMES = ("model", "prompt", "references", "picture_1", "picture_2",
                    "ref2va_needed")
    # model carries whichever checkpoint the saved mode runs on — ref2va in
    # full-reference mode, fl2va everywhere else — so both can stay wired and
    # the mode picks between them.
    # ref2va_needed is True only in full-reference mode — the one mode whose
    # prompt has to go to MiniMaxH3ReferenceToVideo rather than ImageToVideo.
    # Wire it into a switch to pick the branch from the editor's mode instead
    # of rewiring by hand.
    # picture_1 / picture_2 are the first two loaded pictures on their own, so
    # I2VA / L2VA / FL2VA reach first_frame and last_frame on
    # MiniMaxH3ImageToVideo with no splitter in between — those modes never
    # use more than two.
    FUNCTION = "build"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Written by the editor UI; single-line for the same reason as
                # the Prompt Builder's (see its INPUT_TYPES).
                "prompt_text": ("STRING", {"multiline": False, "default": ""}),
                # Serialized editor state (JSON). Hidden in the UI.
                "builder_state": ("STRING", {"multiline": False, "default": "{}"}),
                # JSON list of media items, written by the node's panel.
                "media_state": ("STRING", {"multiline": False, "default": "[]"}),
            },
            # Wire both checkpoints once and let the mode pick. Lazy, so the
            # one this mode isn't using is never pulled into memory — loading
            # two H3 checkpoints to run on one would be a real cost.
            "optional": {
                "fl2va_model": ("MODEL", {"lazy": True}),
                "ref2va_model": ("MODEL", {"lazy": True}),
            },
            "hidden": {"prompt": "PROMPT", "unique_id": "UNIQUE_ID"},
        }

    # Which checkpoint a mode runs on: only full-reference uses ref2va, every
    # other mode is the fl2va family.
    @staticmethod
    def _model_input(mode):
        return "ref2va_model" if mode == "REF" else "fl2va_model"

    def check_lazy_status(self, prompt_text="", builder_state="{}",
                          media_state="[]", fl2va_model=None,
                          ref2va_model=None, prompt=None, unique_id=None,
                          **kwargs):
        """Pull only the checkpoint this mode actually runs on."""
        want = self._model_input(_mode_of(builder_state))
        have = ref2va_model if want == "ref2va_model" else fl2va_model
        if have is not None:
            return []
        # Asking for an input nothing is wired into would stall the prompt, so
        # check the graph first.
        linked = _linked_inputs(prompt, unique_id)
        return [want] if (linked is None or want in linked) else []

    @classmethod
    def IS_CHANGED(cls, prompt_text="", builder_state="{}", media_state="[]", **kwargs):
        # Media decoding is driven entirely by widget state, so cache on all
        # three: without media_state here a re-added clip would be ignored.
        return f"{prompt_text}\x00{builder_state}\x00{media_state}"

    @classmethod
    def VALIDATE_INPUTS(cls, media_state="[]", **kwargs):
        return validate_media_state(media_state)

    def build(self, prompt_text="", builder_state="{}", media_state="[]",
              fl2va_model=None, ref2va_model=None,
              prompt=None, unique_id=None):
        mode = _mode_of(builder_state)
        bundle = build_bundle(media_state, label="Studio")
        gated, _ = gate_bundle(bundle, mode, label="Studio")
        gated["items"] = bundle.get("items", [])
        sent = sum(
            1
            for key, _group, _cap in _BUNDLE_GROUPS
            for value in gated.get(key) or []
            if value is not None
        )
        # Taken from the gated bundle, not the raw one, so these obey the same
        # mode rule as the rest: T2VA sends no pictures and I2VA / L2VA only
        # one, so the spare output holds nothing rather than quietly leaking a
        # frame the mode drops.
        keyframes = _pad(gated.get("pictures"), 2)[:2]
        tail = f"{sent} reference(s) on the bundle" if sent else \
            "prompt only, no references"
        named = [f"picture_{i + 1}" for i, v in enumerate(keyframes)
                 if v is not None]
        print(f"[MiniMaxH3 Studio] mode={mode} -> {tail}"
              f"{', ' + ' + '.join(named) + ' on their own outputs' if named else ''}")

        want = self._model_input(mode)
        model = ref2va_model if want == "ref2va_model" else fl2va_model
        if model is None:
            # Say so rather than passing nothing on quietly: an empty model
            # output fails far downstream, where the cause isn't obvious.
            print(f"[MiniMaxH3 Studio] mode {mode} runs on {want}, but that "
                  "input is empty — the model output carries nothing.")
        else:
            print(f"[MiniMaxH3 Studio] mode {mode} -> passing {want} through.")
        return (model, prompt_text.strip(), gated, *keyframes, mode == "REF")


NODE_CLASS_MAPPINGS = {
    "MiniMaxH3PromptStudio": MiniMaxH3PromptStudio,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiniMaxH3PromptStudio": "MiniMax H3 Prompt Studio",
}

"""Prompt Studio settings recalled from a generated video (Plus only).

ComfyUI's video savers write the run into the container: SaveVideo puts the
executed graph ("prompt") and the workflow into its metadata as JSON, and
VideoHelperSuite puts both into a "comment" JSON. Every Prompt Studio node in
that run carries its own state as named inputs: builder_state (mode and
prompts), media_state (the media it had loaded), stack_state (its RefMods
picks) and prompt_text (the prompt it sent). This reads them back so the node
the video is dropped on can take them over (see videoimport in
web/promptstudio.js).

The executed graph is preferred: it is exactly what ran, keyed by input name.
The workflow is the fallback for a file that only kept that, read by widget
position and checked by shape.
"""

import json
import os

from . import media_io

STUDIO = "MiniMaxH3PromptStudio"
STATE_INPUTS = ("prompt_text", "builder_state", "media_state", "stack_state", "gen_state")
PREVIEW_CHARS = 240


def container_metadata(path):
    """The container's own metadata as a lower-cased dict (PyAV, which every
    ComfyUI install has)."""
    import av

    with av.open(path) as c:
        meta = dict(c.metadata or {})
        for s in c.streams:          # some muxers keep tags on the stream instead
            for k, v in (s.metadata or {}).items():
                meta.setdefault(k, v)
    return {str(k).lower(): v for k, v in meta.items()}


def _json(v):
    if isinstance(v, (dict, list)):
        return v
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        return json.loads(v)
    except ValueError:
        return None


def run_of(meta):
    """(prompt, workflow) from the metadata, either may be None."""
    prompt, workflow = _json(meta.get("prompt")), _json(meta.get("workflow"))
    comment = _json(meta.get("comment"))
    if isinstance(comment, dict):
        prompt = prompt or _json(comment.get("prompt"))
        workflow = workflow or _json(comment.get("workflow"))
    return (prompt if isinstance(prompt, dict) else None,
            workflow if isinstance(workflow, dict) else None)


def _workflow_nodes(workflow):
    if not workflow:
        return []
    nodes = list(workflow.get("nodes") or [])
    for sub in (workflow.get("definitions") or {}).get("subgraphs") or []:
        nodes += list(sub.get("nodes") or [])
    return nodes


def _from_widgets(values):
    """The four state inputs from a workflow node's widgets_values: the first
    run of four strings shaped like them (text, builder JSON with a version,
    media JSON list, stack JSON object)."""
    if not isinstance(values, list):
        return None
    for i in range(len(values) - 3):
        text, builder, media, stack = values[i:i + 4]
        b, m, s = _json(builder), _json(media), _json(stack)
        if isinstance(text, str) and isinstance(b, dict) and b.get("version") \
                and isinstance(m, list) and isinstance(s, dict):
            out = dict(zip(STATE_INPUTS, (text, builder, media, stack)))
            # gen_state (3.6.0+) follows; older workflows end at stack_state.
            gen = values[i + 4] if i + 4 < len(values) else None
            if isinstance(gen, str) and isinstance(_json(gen), dict):
                out["gen_state"] = gen
            return out
    return None


def _exists(annotated):
    try:
        return os.path.isfile(media_io.resolve(annotated))
    except Exception:
        return False


def _summary(node_id, title, state):
    builder = _json(state.get("builder_state")) or {}
    media = _json(state.get("media_state")) or []
    stack = _json(state.get("stack_state")) or {}
    mode = builder.get("mode") or "T2VA"
    ref = builder.get("ref") or {}
    text = ("\n".join(v for v in (ref.get("styleLine"), ref.get("detail")) if (v or "").strip())
            if mode == "REF" else (builder.get("imd") or "")).strip() or (state.get("prompt_text") or "").strip()
    items = []
    for it in media if isinstance(media, list) else []:
        if not isinstance(it, dict):
            continue
        items.append({"name": it.get("name") or os.path.basename(str(it.get("file") or "")),
                      "kind": it.get("kind"), "enabled": it.get("enabled") is not False,
                      "exists": _exists(str(it.get("file") or ""))})
    picks = [p for p in (stack.get("picks") or []) if isinstance(p, dict)] if isinstance(stack, dict) else []
    return {
        "id": str(node_id), "title": title or "Prompt Studio", "mode": mode,
        "preview": text[:PREVIEW_CHARS] + ("…" if len(text) > PREVIEW_CHARS else ""),
        "media": items, "refmods": len(picks),
        "gen": _json(state.get("gen_state")) if isinstance(_json(state.get("gen_state")), dict) else None,
        "state": {k: state.get(k) for k in STATE_INPUTS if isinstance(state.get(k), str)},
    }


def studios_in(meta):
    """Every Prompt Studio's saved state in a video's metadata, summarised for
    the dialog, with the raw state strings to apply. Returns
    {"studios": [...], "source": "prompt"|"workflow"|None, "reason": str}."""
    prompt, workflow = run_of(meta)
    if not prompt and not workflow:
        return {"studios": [], "source": None,
                "reason": "This video carries no ComfyUI workflow: it wasn't saved by ComfyUI, "
                          "or its metadata was stripped (re-encoding and most sharing sites do that)."}
    titles = {str(n.get("id")): n.get("title") for n in _workflow_nodes(workflow) if isinstance(n, dict)}
    found, source = [], None
    for nid, node in (prompt or {}).items():
        if isinstance(node, dict) and node.get("class_type") == STUDIO:
            inputs = node.get("inputs") or {}
            state = {k: inputs.get(k) for k in STATE_INPUTS if isinstance(inputs.get(k), str)}
            if state.get("builder_state") or state.get("media_state"):
                found.append(_summary(nid, titles.get(str(nid)), state))
    if found:
        source = "prompt"
    else:
        for n in _workflow_nodes(workflow):
            if isinstance(n, dict) and n.get("type") == STUDIO:
                state = _from_widgets(n.get("widgets_values"))
                if state:
                    found.append(_summary(n.get("id"), n.get("title"), state))
        source = "workflow" if found else None
    found.sort(key=lambda s: (len(s["id"]), s["id"]))
    return {"studios": found, "source": source,
            "reason": "" if found else "This video's workflow has no Prompt Studio node."}

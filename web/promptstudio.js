/* MiniMax H3 Prompt Studio — frontend
 * The Prompt Builder's editor and the Media Loader's panel on a single node.
 *
 * Nothing is reimplemented here: both halves are imported and mounted onto one
 * node type. Because the media panel writes this node's own `media_state`, the
 * editor's tag list reads that widget directly (see mediaSource in
 * promptbuilder.js) and the tags it offers are exactly the tags the bundle
 * will carry — no wiring in between to get out of step.
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  LoaderPanel, applyCanvasSizing, applyTextScale, loadScalePrefs,
  PANEL_H, NODE_W, postApi,
} from "./medialoader.js";
import {
  openEditor, openQuickEdit, updateSummary, promptFields, hideWidget, el,
  injectCSS, restoreDraftFlag, toast,
} from "./promptbuilder.js";
import { StackPanel, readStack, openStackModal, refreshStackLabels } from "./refmodstack.js";

// Logged at module scope: if this line is missing from the console the file
// never loaded (or one of its imports threw), which is a very different fault
// from the extension loading and then failing on a particular node.
console.log("[MiniMaxH3 PromptStudio] module loaded");

const STUDIO_NAME = "MiniMaxH3PromptStudio";
const SUMMARY_H = 52;   // two clamped preview lines + padding (the default rows)
// The bar expanded into the three prompt fields. Sized to reclaim roughly
// what the media panel's old "T2VA sends the prompt only" notice used to
// cost, now that the panel collapses to just its toolbar in this state —
// see medialoader.js's mode-shaped layout branch.
const EDITOR_H = 340;
/* The stack is the node's last widget, so without this it sits hard against
   the bottom edge while being inset left and right. Reported as part of the
   widget's height but not given to the element, so it reads as a margin
   underneath. fitPanel()/minSize() measure the overhead rather than assuming
   it, so both pick this up on their own. */
const BOTTOM_GAP = 8;
/* The pair's floor: the panel at its own minimum with the collapsed prompt
   bar under it. One number now, because they are one widget — which is the
   point of the change. The media panel and the prompt bar used to be two DOM
   widgets whose heights had to be kept in step by hand, and the arithmetic
   was wrong in one direction: switching to T2VA's "Used" layout collapsed the
   panel ELEMENT to its toolbar but left the WIDGET still reserving its full
   height, so the node kept a few hundred pixels of empty space between the
   toolbar and the prompt fields. Two heights, one of them stale. They are one
   element now and the browser does the split, so there is no second number to
   fall out of step. */
const STACK_H = PANEL_H + SUMMARY_H;
const BAR_TITLE = "Quick-edit the prompt \u2014 the scroll opens the full editor";

/** Show the media panel or the RefMods grid in the node's panel area. Both
 *  stay mounted — hiding keeps each one's scroll position, open menus aside,
 *  and an edit in the RefMods window lands in a panel that already exists.
 *  The one now showing is redrawn, so its ◈ reads the current state. */
function showTab(node, tab) {
  const refmods = tab === "refmods" && !!node._mmrPanel;
  node._mmh3Tab = refmods ? "refmods" : "media";
  node.properties = node.properties || {};
  node.properties.mmh3_tab = node._mmh3Tab;
  if (node._mmlPanel) {
    node._mmlPanel.root.hidden = refmods;
    if (!refmods) node._mmlPanel.render();
  }
  if (node._mmrPanel) {
    node._mmrPanel.root.hidden = !refmods;
    if (refmods) node._mmrPanel.render();
  }
  refreshBar(node);
}

/** The ◈ that leads both panels' toolbars and swaps one for the other. Built
 *  fresh on each redraw, so its count and state never go stale. It sits
 *  inside the toolbars rather than above them: the media panel's toolbar is
 *  the one part of it T2VA's "Used" layout keeps, so the button stays. */
function swapButton(node, btnClass) {
  const onRefmods = node._mmh3Tab === "refmods";
  const n = refmodCount(node);
  return el("button", {
    class: `${btnClass} mmh3p-swapbtn` + (onRefmods ? " on" : ""),
    title: onRefmods ? "Back to this node's media"
      : `Show this node's RefMods in place of its media${n ? ` (${n} picked)` : ""}`,
    "aria-pressed": onRefmods ? "true" : "false",
    onclick: (e) => { e.stopPropagation(); showTab(node, onRefmods ? "media" : "refmods"); },
  }, "\u25c8", n ? el("span", { class: "mmh3p-swapcount" }, String(n)) : null);
}

/** RefMods picked on this node, shown on the ◈ so they're visible from the
 *  media side too. */
function refmodCount(node) {
  try { return readStack(node).picks.filter((p) => p && p.on !== false).length; }
  catch (e) { return 0; }
}

/** After the picks change: redraw the media panel's ◈ (the RefMods panel
 *  redraws itself). Skipped while the media panel is hidden — showTab()
 *  redraws it on the way back. */
function refreshTabCount(node) {
  if (node._mmlPanel && !node._mmlPanel.root.hidden) node._mmlPanel.render();
}

/** In T2VA there is no reference media, so the mode-shaped loader steps aside
 *  and the prompt bar takes the room instead — the three fields inline, using
 *  the same block the quick-edit window mounts. Anything else keeps the bar.
 *
 *  Saves as you type rather than on a button, since there is nothing to
 *  dismiss; the save is the full editor's own, so this cannot diverge. */
function refreshBar(node) {
  const bar = node._mmh3Summary;
  if (!bar) return;
  const sh = node._mmlPanel?.shape?.();
  // Not on the RefMods tab: that grid wants the room the fields would take.
  const expand = !!sh && sh.pictures === 0 && node._mmh3Tab !== "refmods";

  if (!expand) {
    if (node._mmh3Expanded) {
      node._mmh3Expanded = false;
      bar.classList.remove("mmh3p-summary-open");
      bar.style.cursor = "pointer";
      bar.title = BAR_TITLE;
    }
    updateSummary(node);
    return;
  }

  // Rebuilt only on the way in, so typing doesn't tear down the field the
  // caret is in every keystroke.
  if (node._mmh3Expanded) return;
  node._mmh3Expanded = true;
  const fields = promptFields(node);
  let timer = null;
  fields.root.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => fields.save(), 300);
  });
  bar.classList.add("mmh3p-summary-open");
  // The inline style outranks the open bar's cursor:default, and the bar's
  // tooltip promises a quick editor this state doesn't open.
  bar.style.cursor = "";
  bar.title = "";
  bar.replaceChildren(fields.root);
}

/* ---- a video dropped on the prompt bar ----------------------------------
   Asks whether to add the video to the node's media, or to import the Prompt
   Studio settings it was made with: ComfyUI saves the run into the video, and
   each Prompt Studio in it carries its mode and prompts (builder_state), the
   media it had loaded (media_state) and its RefMods picks (stack_state).
   video_meta.py reads them out; this applies them to the node, with Undo. */

const VIDEO_RE = /\.(mp4|mov|mkv|webm|avi|m4v|mpg|mpeg)$/i;
// The media panel's other kinds (web_api.py's IMAGE_EXT / AUDIO_EXT).
const OTHER_MEDIA_RE = /\.(png|jpe?g|webp|bmp|gif|tiff?|wav|mp3|flac|ogg|m4a|aac|opus)$/i;
const ASSET_MIME = "application/x-comfy-asset-info";   // ComfyUI's assets/queue panel

const isVideoFile = (f) => f.type.startsWith("video/") || VIDEO_RE.test(f.name);
const isOtherMedia = (f) => !isVideoFile(f) && (/^(image|audio)\//.test(f.type) || OTHER_MEDIA_RE.test(f.name));

/** Could this drag be media? Only types are readable while dragging: a file
 *  whose type is a picture, video or audio (or unknown, as .mkv often is), or
 *  one of ComfyUI's own asset cards; each is checked properly on drop. */
function mightBeMedia(dt) {
  if (!dt) return false;
  if ([...(dt.types || [])].includes(ASSET_MIME)) return true;
  return [...(dt.items || [])].some((i) => i.kind === "file" && (!i.type || /^(image|video|audio)\//.test(i.type)));
}

/** A file ComfyUI already has, dragged from its assets or queue panel (an
 *  asset card, or a plain /view link): its info and annotated path. */
function droppedAsset(dt) {
  let info = null;
  try { info = JSON.parse(dt.getData(ASSET_MIME) || "null"); } catch (e) { info = null; }
  if (!info?.filename) {
    try {
      const u = new URL((dt.getData("text/uri-list") || "").split("\n")[0].trim(), location.href);
      if (/\/view$/.test(u.pathname) && u.searchParams.get("filename")) {
        info = { filename: u.searchParams.get("filename"), subfolder: u.searchParams.get("subfolder") || "",
          type: u.searchParams.get("type") || "output" };
      }
    } catch (e) { /* not a link */ }
  }
  if (!info?.filename) return null;
  return { info, name: info.display_name || info.filename,
    ref: `${info.subfolder ? `${info.subfolder}/` : ""}${info.filename} [${info.type || "output"}]` };
}

async function readVideoSettings(src) {
  let resp;
  if (src.file) {
    const body = new FormData();
    body.append("file", src.file, src.file.name);
    resp = await postApi("/minimax_h3_plus/video_studio_meta", { body });
  } else {
    resp = await postApi("/minimax_h3_plus/video_studio_meta", {
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: src.ref }) });
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `couldn't read the video (${resp.status})`);
  return data;
}

/** The dropped media as a File, for the media panel's own add(): the file
 *  itself, or one ComfyUI has, fetched. */
async function mediaFile(src) {
  if (src.file) return src.file;
  const q = new URLSearchParams({ filename: src.info.filename, subfolder: src.info.subfolder || "",
    type: src.info.type || "output" });
  const resp = await api.fetchApi(`/view?${q}`);
  if (!resp.ok) throw new Error(`couldn't fetch ${src.name} (${resp.status})`);
  const blob = await resp.blob();
  return new File([blob], src.info.filename, { type: blob.type || "" });
}

/** Put a video's Prompt Studio settings on this node: its prompts (mode,
 *  fields, the prompt it sent), its media (minus files no longer on disk) and
 *  its RefMods picks, as chosen. Undo restores all four values. */
function applyVideoSettings(node, studio, pick, srcName) {
  const w = (name) => node.widgets?.find((x) => x.name === name);
  const names = ["prompt_text", "builder_state", "media_state", "stack_state"];
  const before = Object.fromEntries(names.map((n) => [n, w(n)?.value]));
  const st = studio.state || {};
  let dropped = [];
  if (pick.prompt) {
    if (w("builder_state") && st.builder_state) w("builder_state").value = st.builder_state;
    if (w("prompt_text") && typeof st.prompt_text === "string") w("prompt_text").value = st.prompt_text;
  }
  if (pick.media && w("media_state") && st.media_state) {
    let items = [];
    try { items = JSON.parse(st.media_state); } catch (e) { items = []; }
    const objs = (Array.isArray(items) ? items : []).filter((it) => it && typeof it === "object");
    // studio.media lists the same objects in the same order, with whether each
    // file is still on disk. A missing one would stop the next run, so it's left out.
    const keep = objs.filter((it, i) => studio.media?.[i]?.exists !== false);
    dropped = objs.filter((it, i) => studio.media?.[i]?.exists === false).map((it) => it.name || it.file);
    w("media_state").value = JSON.stringify(keep);
  }
  if (pick.refmods && w("stack_state") && st.stack_state) w("stack_state").value = st.stack_state;
  refreshNode(node);
  const what = [pick.prompt && "prompts", pick.media && "media", pick.refmods && "RefMods"].filter(Boolean).join(", ");
  const msg = `Imported ${what} from ${srcName}` +
    (dropped.length ? ` — left out ${dropped.length} file${dropped.length > 1 ? "s" : ""} no longer in input: ${dropped.join(", ")}` : "") + ".";
  // say() only records the line; the panel shows it on its next draw.
  node._mmlPanel?.say?.(msg, dropped.length > 0, { label: "Undo", fn: () => {
    for (const n of names) if (w(n) && before[n] !== undefined) w(n).value = before[n];
    refreshNode(node);
    node._mmlPanel?.say?.(`Undid the import from ${srcName}.`);
    node._mmlPanel?.render?.();
  } });
  node._mmlPanel?.render?.();
  toast(msg, dropped.length ? 6000 : 2500);
}

/** Redraw everything that reads the four state widgets. */
function refreshNode(node) {
  try {
    if (node._mmlPanel) { node._mmlPanel.items = node._mmlPanel.read(); node._mmlPanel.render(); }
    node._mmrPanel?.reload?.();
    // The bar's inline T2VA fields are built once on the way in; rebuild them.
    if (node._mmh3Expanded && node._mmh3Summary) {
      node._mmh3Expanded = false;
      node._mmh3Summary.classList.remove("mmh3p-summary-open");
    }
    node._mmlOnCommit?.();
    updateSummary(node);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
  } catch (e) {
    console.error("[MiniMaxH3 PromptStudio] refresh after import failed:", e);
  }
}

/** The dialog: add the video to the media, or import the settings it carries. */
function openVideoDropDialog(node, src) {
  injectCSS();
  document.querySelector(".mmh3p-vimp-overlay")?.remove();
  const close = () => { overlay.remove(); window.removeEventListener("keydown", esc, true); };
  const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const body = el("div", { class: "mmh3p-vimp-body" },
    el("div", { class: "mmh3p-vimp-note" }, "Reading the video's Prompt Studio settings…"));
  const addBtn = el("button", { class: "mmh3p-btn",
    title: "Add this video to the node's media, as a reference",
    onclick: async () => {
      close();
      try { await node._mmlPanel?.add([await mediaFile(src)]); }
      catch (e) { toast(`Couldn't add ${src.name}: ${e.message}`, 6000); }
    } }, "➕ Add to media");
  const importBtn = el("button", { class: "mmh3p-btn primary", disabled: true,
    title: "Replace this node's prompts and media with the ones the video was made with" },
    "⇩ Import settings");
  const overlay = el("div", { class: "mmh3p-overlay mmh3p-vimp-overlay",
    onmousedown: (e) => { if (e.target === overlay) close(); } },
    el("div", { class: "mmh3p-vimp" },
      el("div", { class: "mmh3p-head" },
        el("div", { class: "mmh3p-title" }, "Video dropped", el("small", {}, src.name)),
        el("button", { class: "mmh3p-x", onclick: close }, "✕")),
      body,
      el("div", { class: "mmh3p-foot" },
        el("span", { class: "stats" }),
        el("button", { class: "mmh3p-btn", onclick: close }, "Cancel"), addBtn, importBtn)));
  window.addEventListener("keydown", esc, true);
  document.body.append(overlay);

  readVideoSettings(src).then((data) => {
    const studios = data.studios || [];
    if (!studios.length) {
      body.replaceChildren(el("div", { class: "mmh3p-vimp-note warn" },
        data.reason || "No Prompt Studio settings found in this video."),
        el("div", { class: "mmh3p-vimp-note" }, "You can still add it to the media."));
      importBtn.title = "Nothing to import";
      return;
    }
    let cur = studios[0];
    const pick = { prompt: true, media: true, refmods: true };
    const detail = el("div", { class: "mmh3p-vimp-detail" });
    const check = (key, label, hint) => el("label", { class: "mmh3p-vimp-check", title: hint },
      el("input", { type: "checkbox", checked: pick[key], onchange: (e) => { pick[key] = e.target.checked; sync(); } }), label);
    const paint = () => {
      const missing = cur.media.filter((m) => !m.exists);
      // replaceChildren() would write a skipped (null) entry as "null".
      detail.replaceChildren(...[
        el("div", { class: "mmh3p-vimp-row" }, el("b", {}, "Mode "), cur.mode === "REF" ? "Reference" : cur.mode),
        el("div", { class: "mmh3p-vimp-prev" }, cur.preview || el("i", {}, "(no prompt text)")),
        el("div", { class: "mmh3p-vimp-row" }, el("b", {}, `Media (${cur.media.length}) `),
          cur.media.length ? cur.media.map((m, i) => el("span", { class: "mmh3p-vimp-file" + (m.exists ? "" : " missing") + (m.enabled ? "" : " off"),
            title: m.exists ? (m.enabled ? "" : "switched off") : "no longer in ComfyUI's input folder — left out" },
            m.name || `item ${i + 1}`)) : el("i", {}, "none")),
        missing.length ? el("div", { class: "mmh3p-vimp-note warn" },
          `${missing.length} file${missing.length > 1 ? "s are" : " is"} no longer in ComfyUI's input folder and will be left out; ` +
          "tags after it renumber.") : null,
        cur.refmods ? el("div", { class: "mmh3p-vimp-row" }, el("b", {}, "RefMods "), `${cur.refmods} picked`) : null,
        el("div", { class: "mmh3p-vimp-checks" },
          check("prompt", "Prompts", "Mode, every prompt field, and the prompt it sent"),
          check("media", "Media", "The media it had loaded"),
          cur.refmods ? check("refmods", "RefMods", "Its RefMods picks") : null),
        el("div", { class: "mmh3p-vimp-note" },
          "Import replaces what's ticked on this node; Undo is in its media panel afterwards.")].filter(Boolean));
      sync();
    };
    const sync = () => {
      const any = pick.prompt || pick.media || (pick.refmods && cur.refmods > 0);
      importBtn.disabled = !any;
    };
    importBtn.onclick = () => {
      if (node._mmh3Editor?.overlay?.isConnected || node._mmh3Quick?.isConnected) {
        toast("Close the Prompt Builder or Quick edit first — it would write its own copy back over the import", 6000);
        return;
      }
      close();
      applyVideoSettings(node, cur, { ...pick, refmods: pick.refmods && cur.refmods > 0 }, src.name);
    };
    body.replaceChildren(...[
      studios.length > 1 ? el("label", { class: "mmh3p-vimp-row" }, el("b", {}, "From "),
        el("select", { onchange: (e) => { cur = studios[+e.target.value]; paint(); } },
          studios.map((s, i) => el("option", { value: String(i) }, `${s.title} (#${s.id}, ${s.mode})`)))) : null,
      detail].filter(Boolean));
    paint();
  }).catch((e) => {
    body.replaceChildren(el("div", { class: "mmh3p-vimp-note warn" }, `Couldn't read the video: ${e.message}`));
  });
}

/** Make the prompt bar a drop target for media, like the media panel above
 *  it: pictures and audio are added to the media as they would be there; a
 *  video asks first, since it may carry the settings it was made with. */
function mediaDropTarget(node, bar) {
  bar.addEventListener("dragover", (e) => {
    if (!mightBeMedia(e.dataTransfer)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    bar.classList.add("mmh3p-vdrop");
  });
  bar.addEventListener("dragleave", (e) => {
    if (!bar.contains(e.relatedTarget)) bar.classList.remove("mmh3p-vdrop");
  });
  bar.addEventListener("drop", async (e) => {
    const dt = e.dataTransfer;
    if (!mightBeMedia(dt)) return;
    // Ours: preventDefault also tells ComfyUI's own drop handler to stand
    // down, or it would load a dropped file's workflow over the whole graph.
    e.preventDefault(); e.stopPropagation();
    bar.classList.remove("mmh3p-vdrop");
    const files = [...(dt.files || [])];
    const videos = files.filter(isVideoFile), others = files.filter(isOtherMedia);
    const asset = files.length ? null : droppedAsset(dt);
    if (!videos.length && !others.length && !asset) {
      toast("Drop pictures, videos or audio here", 4500);
      return;
    }
    try {
      // The media panel's own add(): same checks, upload and messages as a drop there.
      if (asset && !VIDEO_RE.test(asset.info.filename)) {
        if (!OTHER_MEDIA_RE.test(asset.info.filename)) { toast(`${asset.name} isn't a picture, video or audio`, 4500); return; }
        await node._mmlPanel?.add([await mediaFile(asset)]);
        return;
      }
      // One video at a time can be asked about; any further ones are just added.
      const extra = [...others, ...videos.slice(1)];
      if (extra.length) await node._mmlPanel?.add(extra);
    } catch (err) {
      toast(`Couldn't add that: ${err.message}`, 6000);
      return;
    }
    const video = asset || (videos[0] && { file: videos[0], name: videos[0].name });
    if (video) openVideoDropDialog(node, video);
  });
}

/** The panel widget's current height, read back off the widget rather than
 *  kept in a cache that could drift out of step with it. */
function panelHeight(widget) {
  try {
    const h = widget.computeSize()[1];
    return Number.isFinite(h) ? h : STACK_H;
  } catch (e) { return STACK_H; }
}

/** The node's real floor: every widget at its minimum, panel included.
 *
 *  This has to measure with the panel pinned to PANEL_H. Growing the panel
 *  sets its computedHeight, which is what the renderer sums to size the node
 *  — so measuring while it is grown reports the *current* height as the
 *  minimum and the node can then only ever get taller. Both fields are
 *  overridden for the measurement and restored straight after.
 *
 *  `base` is the stock computeSize captured at registration; calling it
 *  rather than node.computeSize avoids recursing into our own override. */
function minSize(node, base) {
  const widget = node.widgets?.find((w) => w.name === "mml_panel");
  const heldSize = widget?.computeSize;
  const heldHeight = widget?.computedHeight;
  try {
    if (widget) {
      widget.computeSize = () => [NODE_W, STACK_H];
      widget.computedHeight = STACK_H;
    }
    const out = base ? base.call(node) : null;
    const w = Math.max(NODE_W, out?.[0] || 0);
    const h = Number.isFinite(out?.[1]) ? out[1] : STACK_H;
    return [w, h];
  } catch (e) {
    return [NODE_W, STACK_H];
  } finally {
    if (widget) {
      if (heldSize) widget.computeSize = heldSize;
      if (heldHeight !== undefined) widget.computedHeight = heldHeight;
    }
  }
}

/** Hand the media panel every pixel the node isn't spending on its buttons and
 *  summary, so dragging the node taller grows the media grid instead of
 *  leaving a gap under it.
 *
 *  The overhead is measured rather than assumed — minSize() reports the node
 *  at its floor, so subtracting the panel's own floor leaves exactly what the
 *  other widgets occupy, and that stays right if the widget set changes.
 *  Canvas-only, since Vue owns layout in Nodes 2.0, so every step has to be
 *  harmless when it doesn't apply. */
function fitPanel(node, base) {
  const widget = node.widgets?.find((w) => w.name === "mml_panel");
  if (!widget || !node._mmh3Stack) return;
  const overhead = minSize(node, base)[1] - STACK_H;
  const height = Math.max(STACK_H, Math.round((node.size?.[1] || 0) - overhead));
  if (!Number.isFinite(height) || height === panelHeight(widget)) return;

  widget.computedHeight = height;
  widget.computeSize = () => [NODE_W, height];
  // One box for the pair; the flex rules inside it decide the split. There is
  // deliberately no shape branch here any more: when the panel collapses in
  // T2VA it stops being flexible and the bar becomes flexible instead, so the
  // reclaimed room goes to the bar without either height being computed here.
  node._mmh3Stack.style.height = `${height}px`;
  node._mmh3Stack.style.minHeight = `${height}px`;
}

app.registerExtension({
  name: "MiniMaxH3Plus.PromptStudio",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== STUDIO_NAME) return;
    console.log("[MiniMaxH3 PromptStudio] extension registered");

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);

      // No widget buttons on the node. The prompt bar's scroll opens the
      // editor and the media panel is right here, so the rule about plain
      // widgets having to precede DOM widgets no longer binds either.
      try {
        injectCSS();
        hideWidget(this, "prompt_text");
        hideWidget(this, "builder_state");
        hideWidget(this, "media_state");
        hideWidget(this, "stack_state");
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] could not hide the state "
          + "widgets; they stay visible but still work:", e);
      }

      // Media panel first: the prompt bar reads as a summary of what is above
      // it rather than a header floating over an empty node.
      try {
        // Media and prompt share this node, so a change to the inventory has
        // to redraw the summary's count. LoaderPanel.commit calls this, and
        // so does anything else that can change the panel's shape (a mode
        // switch, the Used/All toggle).
        //
        // fitPanel() belongs here too, not just in onResize/onConfigure: a
        // shape change alone (no drag, no reload) can change how tall the
        // panel wants to be — collapsing into T2VA's toolbar-only view, or
        // growing back out of it — and nothing else re-measures it against
        // whatever height the node was last resized to. Without this, the
        // on-node interface was left showing a panel stuck at its own
        // default/last-fit size, with a gap or an overflow against the
        // node's actual frame, until an unrelated resize or reload happened
        // to trigger a re-fit.
        this._mmlOnCommit = () => {
          refreshBar(this);
          fitPanel(this, baseComputeSize);
        };
        // Read by the full-size media loader window (medialoader.js) for its
        // own "open the Prompt Builder" button — a hook rather than an
        // import, since medialoader.js has no dependency on promptbuilder.js.
        this._mmh3OpenEditor = () => openEditor(this);
        // The media panel's toolbar asks for this when it draws (see
        // drawPanel in medialoader.js); set before the panel is built.
        this._mmh3SwapButton = () => (this._mmrPanel ? swapButton(this, "mmlp-btn") : null);

        this._mmlPanel = new LoaderPanel(this);
        // The prompt bar mounts flush beneath this panel, so the two square
        // off the edge they share and read as a single surface.
        this._mmlPanel.root.classList.add("mmlp-joinbelow");

        // The prompt bar: preview, audio marks and the mode button, with the
        // scroll at its left opening the full editor.
        const summary = el("div", {
          class: "mmh3p-summary mmh3p-joinabove",
          title: BAR_TITLE,
          // A floor, not a fixed height: the flex rules decide how tall the
          // bar actually is, and setting `height` here is what used to go
          // stale. This only stops the collapsed bar shrinking below the two
          // preview lines it is meant to show.
          // The floor follows the ⚙'s "Prompt bar rows" (--mmh3-barrows) and
          // the text size: rows × the 1.5 line height, plus the bar's padding
          // and border. At two rows and 100% that is the old 52px.
          style: { cursor: "pointer",
            minHeight: `calc(var(--mmh3-barrows, 2) * 1.5em + ${SUMMARY_H - 33}px)` },
          // Not while the bar holds the fields themselves (T2VA's Used
          // layout): there a click is for typing, and it bubbled up here and
          // opened Quick edit over the field you had just clicked into.
          onclick: () => { if (!this._mmh3Expanded) openQuickEdit(this); },
        });
        this._mmh3Summary = summary;
        mediaDropTarget(this, summary);

        // ONE widget for the pair, not one each. They were two, and their
        // heights had to be reconciled by hand every time the layout changed
        // — which is exactly what went wrong: T2VA's "Used" layout collapsed
        // the panel's element but left its widget reserving the old height,
        // stranding a few hundred pixels of dead space between the toolbar
        // and the fields. Inside this stack the split is a flex rule, so the
        // browser keeps them adjacent by construction and there is no second
        // height to go stale.
        // The RefMods tab: the same panel a RefMod Stack node carries, holding
        // this node's own picks in its stack_state widget. `_mmrPanel` is the
        // name the rest of the pack already reloads after an edit elsewhere
        // (the RefMods window, a draft's snapshot being applied).
        let stackRoot = null;
        try {
          // The node's ⚙ too, so its text size is reachable from either view.
          // Text itself needs no wiring: .mmh3p-nodestack maps the RefMods
          // grid's and the prompt bar's --mmh3-fs onto the media panel's
          // --mml-fs (promptbuilder.js CSS), so all three follow one setting.
          this._mmrPanel = new StackPanel(this, { embedded: true,
            swap: () => swapButton(this, "mmrp-btn"),
            settings: () => this._mmlPanel.scaleControl() });
          this._mmrOnCommit = () => refreshTabCount(this);
          // For the full-size media loader's ◈ RefMods button: this node's
          // RefMods docked beside it (see openLoaderModal). A hook rather
          // than an import, since medialoader.js can't import refmodstack.js.
          this._mmrOpenDocked = (host, onUndock) => openStackModal(this, { host,
            onClose: () => { refreshTabCount(this); onUndock?.(); } });
          stackRoot = this._mmrPanel.root;
        } catch (e) {
          // RefMods are optional on top of the core node; losing the tab
          // must not take the media panel and the prompt bar with it.
          console.error("[MiniMaxH3 PromptStudio] RefMods tab failed:", e);
          this._mmrPanel = null;
        }
        this._mmh3Stack = el("div", { class: "mmh3p-nodestack" },
          this._mmlPanel.root, stackRoot, summary);
        // hideInPanel: the side panel's Parameters tab would otherwise draw
        // the panel as a legacy widget, and that sets widget.width to the
        // side panel's width; the canvas sizes a DOM widget from
        // `widget.width ?? node.width`, so the panel stayed squished at
        // ~260px until a reload. Older frontends ignore the option, so the
        // width is also pinned to "follow the node" whatever writes to it.
        const widget = this.addDOMWidget("mml_panel", "div",
          this._mmh3Stack, { serialize: false, hideInPanel: true });
        Object.defineProperty(widget, "width", {
          configurable: true, get: () => undefined, set: () => {} });
        applyCanvasSizing(this, widget, NODE_W, STACK_H);
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] on-node panel failed; "
          + "right-click a slot, or open the loader window, instead:", e);
      }

      setTimeout(() => {
        try { showTab(this, this.properties?.mmh3_tab); }
        catch (e) { /* cosmetic */ }
        try { refreshBar(this); } catch (e) { /* cosmetic */ }
        try { restoreDraftFlag(this); } catch (e) { /* cosmetic */ }
      }, 0);
      return r;
    };

    // Report the floor honestly and let the renderer do the clamping. Editing
    // the size inside onResize instead fights the drag: the pointer and the
    // node disagree about where the edge is, and the node slides along with
    // the cursor once you push past the minimum width.
    const baseComputeSize = nodeType.prototype.computeSize;
    nodeType.prototype.computeSize = function () {
      return minSize(this, baseComputeSize);
    };

    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function () {
      const r = onResize?.apply(this, arguments);
      fitPanel(this, baseComputeSize);
      return r;
    };

    // The RefMods panel listens on the window for presses outside it, and
    // registers itself so other panels can refresh it; both go with the node.
    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      try { this._mmrPanel?.destroy(); } catch (e) { /* nothing to undo */ }
      return onRemoved?.apply(this, arguments);
    };

    // RefMods are numbered after the media the Text Encode is fed, so a
    // rewire of this node's references or mods can move every stack's labels
    // (upstream does the same from its Prompt Builder).
    const onConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const r = onConnectionsChange?.apply(this, arguments);
      setTimeout(() => { try { refreshStackLabels(); } catch (e) { /* cosmetic */ } }, 0);
      return r;
    };

    const onDblClick = nodeType.prototype.onDblClick;
    nodeType.prototype.onDblClick = function () {
      openEditor(this);
      return onDblClick?.apply(this, arguments) ?? true;
    };

    // A reload restores the widgets after onNodeCreated ran, so both halves
    // re-read their state once the values are actually in place.
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      setTimeout(() => {
        if (this._mmlPanel) {
          this._mmlPanel.items = this._mmlPanel.read();
          this._mmlPanel.render();
        }
        applyCanvasSizing(this, this.widgets?.find((w) => w.name === "mml_panel"),
          NODE_W, STACK_H);
        // Re-apply the stored text scale. It saves fine, but nothing read it
        // back on workflow load, so a node came back at its serialised size
        // with the panel inside it rebuilt at 100%. Text only — this node's
        // own height comes from fitPanel() below, not from the scale pref.
        try { applyTextScale(this._mmlPanel, loadScalePrefs().text); }
        catch (e) { /* the panel's own CSS keeps it readable */ }
        // The widget values are in now: the RefMods tab re-reads its picks.
        try { this._mmrPanel?.reload(); showTab(this, this.properties?.mmh3_tab); }
        catch (e) { /* cosmetic */ }
        // A saved node restores its own height, so re-fit after that lands.
        fitPanel(this, baseComputeSize);
        refreshBar(this);
        restoreDraftFlag(this);
      }, 0);
      return r;
    };
  },
});

/* Before 3.0.0 this pack registered its own copies of the original pack's
   RefMod and masked-editing nodes. It registers only Prompt Studio now, so a
   workflow saved with one of those copies would open with missing nodes.
   Each is renamed to the original pack's node it was copied from — the same
   inputs, outputs and widget order, so links and values carry over — when
   that pack is installed. Left alone otherwise, so the missing-nodes dialog
   still names something real to install. */
const LEGACY_TYPES = {
  MiniMaxH3StudioRefModStack: "MiniMaxH3RefModStack",
  MiniMaxH3StudioRefModTextEncode: "MiniMaxH3FantasticRefModTextEncode",
  MiniMaxH3StudioRefModApply: "MiniMaxH3FantasticRefModApply",
  MiniMaxH3StudioRefModCreate: "MiniMaxH3FantasticRefModCreate",
  MiniMaxH3StudioRefModInspect: "MiniMaxH3FantasticRefModInspect",
  MiniMaxH3StudioRefModEdit: "MiniMaxH3FantasticRefModEdit",
  MiniMaxH3StudioRefModStoreFrames: "MiniMaxH3FantasticRefModStoreFrames",
  MiniMaxH3StudioVideoEditLatent: "MiniMaxH3FantasticVideoEditLatent",
  MiniMaxH3StudioEditComposite: "MiniMaxH3FantasticEditComposite",
  MiniMaxH3StudioObjectMask: "MiniMaxH3FantasticObjectMask",
};

/** Rename legacy node types in a workflow (and its subgraphs) in place; the
 *  set of old types renamed. Exported for the tests. */
export function remapLegacyTypes(graphData, registered) {
  const moved = new Set();
  const graphs = [graphData, ...(graphData?.definitions?.subgraphs || [])];
  for (const g of graphs) {
    for (const n of g?.nodes || []) {
      const from = n?.type, to = LEGACY_TYPES[from];
      if (!to || !registered?.[to]) continue;
      n.type = to;
      if (n.properties?.["Node name for S&R"] === from) n.properties["Node name for S&R"] = to;
      moved.add(from);
    }
  }
  return moved;
}

app.registerExtension({
  name: "MiniMaxH3Plus.LegacyNodeTypes",
  beforeConfigureGraph(graphData, missingNodeTypes) {
    try {
      const moved = remapLegacyTypes(graphData, globalThis.LiteGraph?.registered_node_types);
      if (!moved.size) return;
      // Already counted as missing before this hook ran: take them back out.
      if (Array.isArray(missingNodeTypes)) {
        for (let i = missingNodeTypes.length - 1; i >= 0; i--) {
          const m = missingNodeTypes[i];
          if (moved.has(typeof m === "string" ? m : m?.type)) missingNodeTypes.splice(i, 1);
        }
      }
      console.log(`[MiniMaxH3 PromptStudio] opened ${[...moved].join(", ")} as the original pack's ` +
        "nodes; this pack no longer installs its own copies.");
    } catch (e) {
      console.error("[MiniMaxH3 PromptStudio] couldn't remap older node types:", e);
    }
  },
});

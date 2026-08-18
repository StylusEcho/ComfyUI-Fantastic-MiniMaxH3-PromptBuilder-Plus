/* MiniMax H3 Prompt Builder editor — shared frontend module
 * The modal template editor and node summary, mounted onto MiniMax H3 Prompt
 * Studio (see promptstudio.js). Not a node registration of its own.
 * Formats follow MiniMax's official prompt-writing guides shipped with the
 * open-weight release (VIDEO_PROMPT_WRITING_GUIDE_base_en / _ref_en).
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { LOADER_NAME, computeTags, viewURL as loaderViewURL,
  safeCanvasFocus, openLoaderModal, isOn, TrimModal,
  fileCount, MODE_CAPACITY } from "./medialoader.js";

// Private drag type: marks a drag as "reorder the rail" so a drop on another
// card moves media, while a drop on a textarea still inserts the tag.
const RAIL_MIME = "application/x-mmh3p-rail";

/* ------------------------------------------------------------------ */
/* Reference data straight from the guides                             */
/* ------------------------------------------------------------------ */

// What each mode actually sends once saved — mirrors MODE_LIMITS in nodes.py.
// Reference tags the editor knows how to chip: <Picture 1>, <Video 2>,
// <Audio 3>, <Subject 1>.
const TAG_RE = /<(?:Picture|Video|Audio|Subject) \d+>/g;

/* One pass over a field paints three things: dialogue blocks, reference tags
   and speaker IDs. Dialogue is matched first so tags inside a spoken line
   aren't chipped out of it. */
const PAINT_RE = new RegExp([
  "<d>[\\s\\S]*?<\\/d>",                      // a spoken line
  // a cut marker, with its timestamp when one follows
  "\\[Shot \\d+\\](?:\\s+at\\s+\\d{1,2}:\\d{2}(?:\\.\\d{1,3})?)?",
  "<(?:Picture|Video|Audio|Subject) \\d+>",     // a reference tag
  "\\(S\\d+(?:\\s*,\\s*S\\d+)*\\)",           // (S1) or (S1,S2)
].join("|"), "g");

const LANG_RE = /^(\s*\[[^\]\n]+\])/;

const MODE_SENDS = {
  T2VA: "Sends: prompt only \u2014 no reference media leaves the node in this mode.",
  I2VA: "Sends: prompt + picture 1 (first frame). All other media is withheld.",
  L2VA: "Sends: prompt + picture 1 (last frame). All other media is withheld.",
  FL2VA: "Sends: prompt + pictures 1\u20132 (first & last frame). All other media is withheld.",
  REF: "Sends: prompt + every enabled reference.",
};

const MODES = [
  { id: "T2VA", label: "T2VA", hint: "Text → video+audio" },
  { id: "I2VA", label: "I2VA", hint: "First frame → video" },
  { id: "FL2VA", label: "FL2VA", hint: "First + last frame" },
  { id: "L2VA", label: "L2VA", hint: "Last frame → video" },
  { id: "REF", label: "Reference", hint: "Full-reference (ref2va)" },
];

const CAMERA_MOVES = [
  ["Zoom In", "The camera zooms in"],
  ["Zoom Out", "The camera zooms out"],
  ["Push In", "The camera pushes in"],
  ["Pull Out", "The camera pulls out"],
  ["Pan Left", "The camera pans left"],
  ["Pan Right", "The camera pans right"],
  ["Truck Left", "The camera trucks left"],
  ["Truck Right", "The camera trucks right"],
  ["Tilt Up", "The camera tilts up"],
  ["Tilt Down", "The camera tilts down"],
  ["Pedestal Up", "The camera pedestals up"],
  ["Pedestal Down", "The camera pedestals down"],
  ["Arc Shot", "The camera arcs around the subject"],
  ["Tracking Shot", "The camera tracks the moving subject"],
  ["Static Shot", "The camera holds a static shot"],
  ["Shake Slightly", "The camera shakes slightly"],
  ["Shake Strongly", "The camera shakes strongly"],
  ["POV", "The shot holds the subject's point of view"],
  ["Roll Clockwise", "The camera rolls clockwise"],
  ["Roll Counterclockwise", "The camera rolls counterclockwise"],
];

const STYLES = [
  "Cinematic", "live-action", "2D-animated", "3D CG",
  "claymation", "watercolor", "vintage film",
];

const LANGS = [
  "English", "Chinese", "Japanese", "Korean", "French", "German",
  "Italian", "Spanish", "Portuguese", "Russian", "Arabic",
];

const TASK_TYPES = [
  "keyframe completion", "reference generation", "video editing",
  "video continuation", "audio reuse", "audio reference",
];

const VISUAL_MARKERS = [
  "fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference",
];
const AUDIO_MARKERS = ["fully_copy", "partially_copy", "reference", "weak_reference"];


/* Picture reference roles (guide §2.2.2 / §2.3 / §2.4.1).
   A standalone <Picture N> line is for a picture playing a role in its own
   right — a frame anchor, a layout, a look. A picture that just shows what a
   character looks like belongs cited inside that subject's line instead, so
   there is deliberately no "identity" chip here. */
const PICTURE_ROLES = [
  {
    id: "first", label: "First frame",
    title: "The image is the opening frame of a shot",
    marker: "fully_preserved", task: "keyframe completion",
    text: (c) => `<Picture ${c.n}> is the first frame of [Shot ${c.shot}], ` +
      "showing ",
    note: (c) => `it is used as the opening frame of [Shot ${c.shot}] exactly as given.`,
    context: (c) => `[Shot ${c.shot}] first frame`,
  },
  {
    id: "last", label: "Last frame",
    title: "The image is the closing frame of a shot",
    marker: "fully_preserved", task: "keyframe completion",
    text: (c) => `<Picture ${c.n}> is the last frame of [Shot ${c.shot}], ` +
      "showing ",
    note: (c) => `it is used as the closing frame of [Shot ${c.shot}] exactly as given.`,
    context: (c) => `[Shot ${c.shot}] last frame`,
  },
  {
    id: "composition", label: "Composition",
    title: "Framing, layout and camera position are echoed; content is not copied",
    marker: "weak_reference", task: "reference generation",
    text: (c) => `<Picture ${c.n}> is a composition reference for [Shot ${c.shot}] ` +
      "\u2014 its framing, subject placement and camera height are echoed; " +
      "its own content is not reproduced.",
    note: () => "only the framing and layout are echoed; its subjects and " +
      "setting are not reproduced.",
    context: (c) => `[Shot ${c.shot}] framing`,
  },
  {
    id: "style", label: "Look / style",
    title: "Palette, grade and lighting character are echoed",
    marker: "weak_reference", task: "reference generation",
    text: (c) => `<Picture ${c.n}> is a look reference \u2014 its palette, ` +
      "contrast and lighting character guide the grade of the target video; " +
      "its subjects and layout are not used.",
    note: () => "only its palette, contrast and lighting character carry over.",
    context: () => "look and grade",
  },
  {
    id: "setting", label: "Setting",
    title: "The location or environment the shot takes place in",
    marker: "partially_preserved", task: "reference generation",
    text: (c) => `<Picture ${c.n}> is the setting reference \u2014 the target ` +
      "video takes place in this location, seen from other angles as the " +
      "camera moves.",
    note: () => "the location is kept; framing and viewpoint change with the " +
      "camera.",
    context: () => "location",
  },
  {
    id: "attribute", label: "Attribute \u2192 subject",
    title: "A garment, hairstyle or marking from this picture is worn by a subject",
    marker: "attribute_transfer", task: "reference generation", needsSubject: true,
    text: (c) => `<Picture ${c.n}> supplies the ` +
      `\u2039describe the garment / hairstyle / marking\u203a worn by ${c.subj}; ` +
      "nothing else from this picture is used.",
    note: (c) => `the named attribute is transferred to ${c.subj}, whose own ` +
      "identity is unchanged.",
    context: (c) => `attribute for ${c.subj}`,
  },
  {
    id: "storyboard", label: "Storyboard",
    title: "A panel showing a beat the shot should hit, not an exact frame",
    marker: "weak_reference", task: "reference generation",
    text: (c) => `<Picture ${c.n}> is a storyboard panel for [Shot ${c.shot}] ` +
      "\u2014 it shows the beat to hit, not an exact frame to reproduce.",
    note: (c) => `it guides the staging of [Shot ${c.shot}] without being ` +
      "reproduced as a frame.",
    context: (c) => `[Shot ${c.shot}] staging`,
  },
];

/* Audio reference roles (guide §2.2.4 / §2.4.2 / §2.3).
   Each role knows how to phrase the definition, which retention marker it
   implies, and which summary task type it belongs to. */
const AUDIO_ROLES = [
  {
    id: "timbre", label: "Voice timbre \u2192 subject",
    title: "Reference a speaker's voice timbre and delivery for a defined subject",
    marker: "reference", task: "audio reference", needsSubject: true,
    text: (c) => `<Audio ${c.n}> is the voice-timbre reference for ${c.subj} (${c.sx}), ` +
      "guiding delivery and speaking rate without copying the original signal.",
    note: (c) => `its vocal timbre guides the dialogue delivery of ${c.subj} ` +
      "without copying the original signal.",
  },
  {
    id: "vidtrack", label: "Video's synced track",
    title: "The enabled synchronized audio track of a reference video",
    marker: "partially_copy", task: "audio reuse", needsVideo: true,
    text: (c) => `<Audio ${c.n}> is the synchronized audio track of ${c.vid} ` +
      "and is reused in the target video.",
    note: (c) => `the audio layers carried over from ${c.vid} remain audible in ` +
      "the target video.",
  },
  {
    id: "fullcopy", label: "Full 1:1 reuse",
    title: "The complete source audio becomes the target video's complete final track",
    marker: "fully_copy", task: "audio reuse",
    text: (c) => `<Audio ${c.n}> is reused in full as the target video's complete ` +
      "final audio track.",
    note: (c) => `<Audio ${c.n}> is reused 1:1 as the target video's complete final ` +
      "audio track.",
  },
  {
    id: "music", label: "Music style",
    title: "Reference a background-music style for the audience-only score",
    marker: "reference", task: "audio reference",
    text: (c) => `<Audio ${c.n}> is the background-music style reference for the ` +
      "target video's audience-only score.",
    note: () => "only its instrumentation, tempo, and rhythmic feel guide the new " +
      "score; the signal is not copied.",
  },
  {
    id: "lines", label: "Dialogue / lyrics",
    title: "Reuse the spoken or sung content from the source audio",
    marker: "partially_copy", task: "audio reuse",
    text: (c) => `<Audio ${c.n}> provides the spoken content reused verbatim in the ` +
      "target video, preserving its original wording and language.",
    note: () => "its dialogue content is carried into the target video verbatim.",
  },
  {
    id: "sfx", label: "Sound effects",
    title: "Reference the sound-effect texture only",
    marker: "reference", task: "audio reference",
    text: (c) => `<Audio ${c.n}> is the sound-effect texture reference for the ` +
      "target video's physical action sounds.",
    note: () => "only its sound-effect texture is referenced; the signal is not copied.",
  },
  {
    id: "beat", label: "Beat / continuity",
    title: "Reference beat, rhythm, or audio continuity",
    marker: "reference", task: "audio reference",
    text: (c) => `<Audio ${c.n}> is the beat and rhythm reference guiding the target ` +
      "video's pacing and audio continuity.",
    note: () => "only its beat, rhythm, and continuity guide the target video's pacing.",
  },
];

/* What each mode can actually consume, and what each slot means there.
   Base modes have no reference slots at all — their pictures are the native
   node's first_frame / last_frame. Reference mode takes up to 9 images,
   3 videos, and 3 audios, capped at 12 files in total. */

/* Roles a definition line states outright. Used to seed a sensible marker and
   an example note — never to overwrite anything the user has written, since a
   definition constrains the marker but does not determine it. */
const ROLE_HINTS = [
  { re: /voice[- ]timbre|voice reference|timbre reference/i, marker: "reference",
    note: "its vocal timbre guides the delivery without copying the original signal." },
  { re: /music[- ]style|background-music style|score reference/i, marker: "reference",
    note: "only its instrumentation, tempo, and dynamics guide the new score." },
  { re: /synchroni[sz]ed audio track|soundtrack of/i, marker: "partially_copy",
    note: "the audio layers carried over from that video remain audible." },
  { re: /reused in full|1:1|complete final audio track/i, marker: "fully_copy",
    note: "reused as the target video's complete final audio track." },
  { re: /beat and rhythm|audio continuity/i, marker: "reference",
    note: "only its beat and rhythm guide the target video's pacing." },
  { re: /sound-effect texture/i, marker: "reference",
    note: "only its sound-effect texture is referenced; the signal is not copied." },
  { re: /storyboard/i, marker: "weak_reference",
    note: "its viewpoint, subject placement, and shot order are followed." },
  { re: /first frame|last frame|keyframe/i, marker: "fully_preserved",
    note: "the frame is reproduced exactly at that point in the target video." },
  { re: /source video for the target video edit|edited version/i,
    marker: "partially_preserved",
    note: "the source structure is retained where the edit does not change it." },
];

function roleHint(text) {
  return ROLE_HINTS.find((h) => h.re.test(text || "")) || null;
}

/** The definition line that defines this label, if there is one. */
function definitionFor(state, label) {
  const line = (state.ref?.subjectDefs || [])
    .find((d) => !d.off && (d.text || "").trim().startsWith(label));
  return line ? line.text : "";
}

const TAG_CLASS = { Subject: "subj", Picture: "pic", Video: "vid", Audio: "aud" };

/* ------------------------------------------------------------------ */
/* Small DOM helpers                                                   */
/* ------------------------------------------------------------------ */

/* Editor preferences. Kept in localStorage so they follow the person rather
   than the workflow — they're about how the window behaves, not about any
   particular prompt. */
const PREF_KEY = "mmh3.editorPrefs";
const PREF_DEFAULTS = {
  closeOnBackdrop: true, warnUnsaved: true,
  // Window and text scale, 100%-300%. A 4K monitor makes the default window
  // small; these are per user, so they follow you into every workflow.
  windowScale: 1.0, textScale: 1.0,
};
const SCALE_MIN = 1.0;
const SCALE_MAX = 3.0;          // window
const TEXT_SCALE_MAX = 2.0;     // type gets unwieldy past this

function clampScale(v, max = SCALE_MAX) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.0;
  return Math.min(max, Math.max(SCALE_MIN, Math.round(n * 100) / 100));
}

function loadPrefs() {
  try {
    const v = { ...PREF_DEFAULTS,
      ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") };
    v.windowScale = clampScale(v.windowScale);
    v.textScale = clampScale(v.textScale, TEXT_SCALE_MAX);
    return v;
  } catch (e) {
    return { ...PREF_DEFAULTS };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
  catch (e) { /* private mode: the session's choice still applies */ }
}

/** Turn a failed request into something actionable.
 *
 *  ComfyUI answers unknown POST paths with 405 rather than 404, because its
 *  catch-all frontend route matches the path but only for GET. In practice
 *  that always means the Python side hasn't been reloaded. */
function routeError(resp, fallback) {
  if (resp && (resp.status === 405 || resp.status === 404)) {
    return "ComfyUI hasn't loaded this feature's routes yet \u2014 restart " +
           "ComfyUI (a browser refresh isn't enough) and try again.";
  }
  return fallback || `request failed (${resp?.status})`;
}

/** Copy text, working outside a secure context.
 *
 *  navigator.clipboard only exists on https or localhost. ComfyUI started
 *  with --listen is usually reached over plain http at a LAN address, where
 *  the API is simply absent — the old call short-circuited on `?.` and then
 *  threw on `.then`, so copying failed silently. execCommand is deprecated
 *  but still the only thing that works there. */
async function copyText(text) {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* fall through to the textarea route */
  }
  try {
    const holder = document.createElement("textarea");
    holder.value = text;
    holder.setAttribute("readonly", "");
    Object.assign(holder.style, {
      position: "fixed", top: "0", left: "-9999px", opacity: "0",
    });
    document.body.append(holder);
    const prev = document.activeElement;
    holder.select();
    holder.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    holder.remove();
    try { prev?.focus?.(); } catch (e) { /* focus is best effort */ }
    return ok;
  } catch (e) {
    return false;
  }
}

export function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function")
      e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in e) {
      // Some DOM properties are read-only (input.list, input.form, ...);
      // assigning throws in strict mode, so fall back to the attribute.
      try { e[k] = v; } catch (err) { e.setAttribute(k, v); }
    }
    else e.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ */
/* Duration snapping: H3 length grid is 17k+5 frames @ 24fps           */
/* ------------------------------------------------------------------ */

function snapLength(seconds) {
  let L = Math.max(5, Math.round((Number(seconds) || 0) * 24));
  L += (5 - (L % 17) + 17) % 17;
  return L;
}
function snappedSeconds(seconds) {
  return snapLength(seconds) / 24;
}
function fmtSS(seconds) {
  return (Math.round(seconds * 100) / 100).toFixed(2);
}

/* Seconds → strict guide format MM:SS.mmm */
function fmtTimestamp(sec) {
  let mm = Math.floor(sec / 60);
  let rest = sec - mm * 60;
  let ss = Math.floor(rest);
  let mmm = Math.round((rest - ss) * 1000);
  if (mmm === 1000) { mmm = 0; ss += 1; }
  if (ss === 60) { ss = 0; mm += 1; }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.` +
    String(mmm).padStart(3, "0");
}

/* Smallest 17k+5 length strictly longer than a cut at `sec`. */
function minLengthAfter(sec) {
  let L = snapLength(sec);
  if (L <= Math.round(sec * 24)) L += 17;
  return L;
}

/* ------------------------------------------------------------------ */
/* Default editor state                                                */
/* ------------------------------------------------------------------ */

function defaultState() {
  return {
    version: 1,
    mode: "T2VA",
    // Sections switched off: kept in the editor, left out of the prompt.
    off: {},
    duration: 5,
    p2Shot: 1,       // FL2VA: shot index of Picture 2
    lastShot: 1,     // L2VA: shot index of Picture 1 (final shot)
    imd: "",
    soundscape: "",
    music: "N/A",
    ref: {
      subjectDefs: [],           // [{ text }]
      summaryTypes: ["reference generation"],
      summaryText: "",
      retention: [],             // [{ label, context, marker, note }]
      styleLine: "",
      detail: "",
      soundscape: "",
      music: "N/A",
    },
  };
}

function loadState(node) {
  const w = node.widgets?.find((w) => w.name === "builder_state");
  try {
    const s = JSON.parse(w?.value || "{}");
    if (s && s.version) {
      const d = defaultState();
      return { ...d, ...s, ref: { ...d.ref, ...(s.ref || {}) } };
    }
  } catch (e) { /* fall through */ }
  return defaultState();
}

/* ------------------------------------------------------------------ */
/* Connected reference slots → tag chips with live previews            */
/* ------------------------------------------------------------------ */

function parseAnnotatedPath(v) {
  let type = "input";
  let name = String(v || "");
  const m = name.match(/^(.*)\s\[(input|output|temp)\]$/);
  if (m) { name = m[1]; type = m[2]; }
  let subfolder = "";
  const slash = name.lastIndexOf("/");
  if (slash >= 0) { subfolder = name.slice(0, slash); name = name.slice(slash + 1); }
  return { name, subfolder, type };
}

function viewURL(v) {
  const { name, subfolder, type } = parseAnnotatedPath(v);
  return api.apiURL(
    `/view?filename=${encodeURIComponent(name)}` +
    `&subfolder=${encodeURIComponent(subfolder)}&type=${type}`
  );
}

function originNode(node, slotIndex) {
  let n = node.getInputNode?.(slotIndex);
  let guard = 0;
  while (n && /reroute/i.test(n.type || "") && guard++ < 16) {
    const nn = n.getInputNode?.(0);
    if (!nn) break;
    n = nn;
  }
  return n || null;
}

function widgetValue(n, names) {
  if (!n?.widgets) return null;
  for (const name of names) {
    const w = n.widgets.find((w) => w.name === name);
    if (w && typeof w.value === "string" && w.value) return w.value;
  }
  return null;
}

/** Connected reference slots, with the tag numbers H3 will actually assign.
 *
 * Native ref2va presentation order (comfy_extras/nodes_minimax_h3.py):
 *   images, then videos — each video's paired soundtrack emitting its
 *   <Audio j> immediately BEFORE its <Video k> — then standalone audio.
 * Ordinals are 1-based per type and follow connection order, not slot
 * index, so gaps in the slots close up.
 */
/** The media-panel state backing this node's tags, and where it came from.
 *
 * The Prompt Studio owns its panel outright, so its own `media_state` widget
 * is the source. The Prompt Builder has no panel and reads the state off the
 * Media Loader wired into its `references` input. Either way the inventory is
 * a widget on the graph, so the tags H3 will assign can be computed without a
 * round trip to the server. */
function mediaSource(node) {
  const own = node.widgets?.find((w) => w.name === "media_state");
  if (own) return { raw: own.value, label: "Media", owner: node };
  const idx = (node.inputs || []).findIndex((i) => i.name === "references");
  if (idx < 0 || node.inputs[idx].link == null) return null;
  const loader = originNode(node, idx);
  if (!loader || loader.type !== LOADER_NAME) return null;
  return {
    raw: loader.widgets?.find((w) => w.name === "media_state")?.value,
    label: "Media Loader",
    owner: loader,
  };
}

function slotsFromBundle(node) {
  const src = mediaSource(node);
  if (!src) return null;
  // Prefer the owning panel's live objects over a fresh parse: editing a clip
  // or reordering from the rail has to mutate the same items the panel holds,
  // or the change is written over the moment the panel next commits.
  const panel = src.owner?._mmlPanel || null;
  let items = Array.isArray(panel?.items) ? panel.items : null;
  if (!items) {
    try {
      items = JSON.parse(src.raw || "[]");
    } catch (e) { return null; }
  }
  if (!Array.isArray(items)) return null;
  items = items.filter(isOn);      // switched-off media never reaches the model

  const { tags, extra } = computeTags(items);
  const out = [];
  const push = (tag, kind, item, note, previewKind) => {
    const n = +(tag.match(/(\d+)>/) || [])[1];
    const slot = {
      tag, kind, idx: n, cls: TAG_CLASS[kind], note,
      slotName: `loader:${item.name}`,
      source: `${src.label} \u2022 ${item.name}`,
      preview: { type: previewKind, url: loaderViewURL(item.file) },
      // The live item and the panel that owns it, so the rail can offer the
      // same per-clip tools the node tile does.
      item, panel,
    };
    out.push(slot);
    return slot;
  };
  items.filter((i) => i.kind === "picture")
    .forEach((i) => push(tags.get(i), "Picture", i, null, "img"));
  items.filter((i) => i.kind === "video").forEach((i) => {
    // A paired soundtrack is the same underlying item as its video, and H3
    // receives its <Audio n> first. On screen the video reads better first, so
    // the two are pushed video-then-audio and flagged as a joined pair. Only
    // the display order changes \u2014 `tag` still carries the numbering H3 was
    // given, so nothing downstream sees a different sequence.
    const paired = extra.has(i) && (i.audio_mode || "off") === "paired";
    const vid = push(tags.get(i), "Video", i, null, "video");
    if (paired) {
      const aud = push(extra.get(i), "Audio", i,
        `soundtrack of ${tags.get(i)}`, "audio");
      vid.joinRight = true;
      aud.joinLeft = true;
    }
  });
  items.forEach((i) => {
    if (i.kind === "audio") push(tags.get(i), "Audio", i, "standalone", "audio");
    else if (i.kind === "video" && i.audio_mode === "standalone" && extra.has(i))
      push(extra.get(i), "Audio", i, "split from " + tags.get(i), "audio");
  });
  out.bundled = true;
  out.own = src.label === "Media";   // this node's own panel, not a wired loader
  return out;
}

function getRefSlots(node) {
  const bundled = slotsFromBundle(node);
  if (bundled) return bundled;
  const group = (re) => {
    const arr = [];
    (node.inputs || []).forEach((inp, i) => {
      const m = inp.name?.match(re);
      if (m && inp.link != null) arr.push({ idx: +m[1], input: i });
    });
    return arr.sort((a, b) => a.idx - b.idx);
  };
  const pics = group(/^picture_(\d+)$/);
  const vids = group(/^video_(\d+)$/);
  const vauds = group(/^video_audio_(\d+)$/);
  const auds = group(/^audio_(\d+)$/);

  const mk = (kind, num, g, slotName, note) => {
    const origin = originNode(node, g.input);
    let preview = null;
    if (origin) {
      const t = (origin.type || "").toLowerCase();
      if (kind === "Picture") {
        const v = widgetValue(origin, ["image", "file"]);
        if (v) preview = { type: "img", url: viewURL(v) };
      } else if (kind === "Video") {
        const v = widgetValue(origin, ["file", "video"]);
        if (v && (t.includes("video") || t.includes("vhs")))
          preview = { type: "video", url: viewURL(v) };
      } else {
        const v = widgetValue(origin, ["audio", "file"]);
        if (v) preview = { type: "audio", url: viewURL(v) };
      }
    }
    return {
      tag: `<${kind} ${num}>`, kind, idx: num, slotName, note,
      cls: TAG_CLASS[kind], preview,
      source: origin?.title || origin?.type || "connected",
    };
  };

  const out = [];
  pics.forEach((g, i) => out.push(mk("Picture", i + 1, g, `picture_${g.idx}`)));

  let audioN = 0;
  const pending = [];
  vids.forEach((g, i) => {
    const vNum = i + 1;
    // A soundtrack pairs with the same-numbered video slot and is labelled first.
    const track = vauds.find((a) => a.idx === g.idx);
    if (track) {
      audioN += 1;
      pending.push(mk("Audio", audioN, track, `video_audio_${track.idx}`,
        `soundtrack of <Video ${vNum}>`));
    }
    pending.push(mk("Video", vNum, g, `video_${g.idx}`));
  });
  out.push(...pending);

  auds.forEach((g) => {
    audioN += 1;
    out.push(mk("Audio", audioN, g, `audio_${g.idx}`, "standalone"));
  });

  // Soundtracks wired without their video never reach the model.
  vauds.forEach((a) => {
    if (!vids.some((v) => v.idx === a.idx))
      out.push({ tag: null, kind: "Audio", idx: null,
        slotName: `video_audio_${a.idx}`, orphan: a.idx, cls: "aud",
        preview: null, source: "" });
  });

  return out;
}

/* ------------------------------------------------------------------ */
/* Prompt generation (formats verbatim from the guides)                */
/* ------------------------------------------------------------------ */

/** Sections the model tolerates being absent. The description and summary
 *  always ship — without them there is no prompt. */
const OPTIONAL_SECTIONS = ["subject_definitions", "retention_analysis",
                           "overall_soundscape", "non_diegetic_music"];

function sectionOn(state, name) {
  return !(state.off && state.off[name]);
}

function genBase(state) {
  const S = fmtSS(snappedSeconds(state.duration));
  let head = "";
  if (state.mode === "I2VA") {
    head = "For the target video, at 0.00 seconds into the target video, " +
      "<Picture 1> (from [Shot 1]) is fully referenced.";
  } else if (state.mode === "FL2VA") {
    head = "How the reference pictures align with the target video — " +
      "Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; " +
      `Picture 2 (from Shot ${state.p2Shot || 1}) aligns with the ${S}-second mark of the target video.`;
  } else if (state.mode === "L2VA") {
    head = "How the reference pictures align with the target video — " +
      `<Picture 1> (from [Shot ${state.lastShot || 1}]) aligns with the ${S}-second mark of the target video.`;
  }
  const parts = [`integrated_multimodal_description: ${state.imd.trim()}`];
  if (sectionOn(state, "overall_soundscape"))
    parts.push(`overall_soundscape: ${state.soundscape.trim()}`);
  if (sectionOn(state, "non_diegetic_music"))
    parts.push(`non_diegetic_music: ${state.music.trim() || "N/A"}`);
  const body = parts.join("\n\n");
  return head ? head + "\n\n" + body : body;
}

function genRef(state) {
  const r = state.ref;
  const defs = r.subjectDefs
    .filter((d) => !d.off)
    .map((d) => d.text.trim()).filter(Boolean).join("\n");
  const types = TASK_TYPES.filter((t) => r.summaryTypes.includes(t)).join(" + ");
  const summary = `[${types || "reference generation"}] ${r.summaryText.trim()}`;
  const retention = r.retention
    .filter((row) => row.label && !row.off)
    .map((row) => {
      const ctx = row.context?.trim() ? ` (${row.context.trim()})` : "";
      return `${row.label}${ctx}: ${row.marker} - ${row.note.trim()}`;
    })
    .join("\n");
  const detail = [r.styleLine.trim(), r.detail.trim()].filter(Boolean).join("\n");
  const on = (name) => sectionOn(state, name);
  const blocks = [];
  if (on("subject_definitions"))
    blocks.push(`subject_definitions:\n${defs}`);
  blocks.push(`summary:\n${summary}`);
  if (on("retention_analysis"))
    blocks.push(`retention_analysis:\n${retention}`);
  blocks.push(`detailed_description:\n${detail}`);
  if (on("overall_soundscape"))
    blocks.push(`overall_soundscape:\n${r.soundscape.trim()}`);
  if (on("non_diegetic_music"))
    blocks.push(`non_diegetic_music:\n${r.music.trim() || "N/A"}`);
  return blocks.join("\n\n");
}

function generate(state) {
  return state.mode === "REF" ? genRef(state) : genBase(state);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function tsToMs(mm, ss, mmm) {
  return (parseInt(mm, 10) * 60 + parseInt(ss, 10)) * 1000 + parseInt(mmm, 10);
}

function validate(state, slots) {
  const issues = [];
  const err = (m) => issues.push({ level: "error", msg: m });
  const warn = (m) => issues.push({ level: "warn", msg: m });
  const info = (m) => issues.push({ level: "info", msg: m });

  /* --- connected inputs vs. what this mode can use ------------------ */
  const cap = MODE_CAPACITY[state.mode];
  const orphans = slots.filter((s) => s.orphan != null);
  const live = slots.filter((s) => s.tag);
  const byKind = { Picture: [], Video: [], Audio: [] };
  live.forEach((s) => byKind[s.kind]?.push(s));
  const slotName = (s) => s.slotName;

  orphans.forEach((s) => {
    err(
      `${s.slotName} is connected but video_${s.orphan} is not — a soundtrack ` +
      "only reaches the model paired with its same-numbered video, so this " +
      "audio is dropped and gets no <Audio> tag."
    );
  });

  if (state.mode === "REF") {
    const total = live.length;
    if (cap.total && total > cap.total) {
      err(
        `${total} reference files are connected — the documented limit is ` +
        `${cap.total}. Disconnect ${total - cap.total} yourself: the node will ` +
        "not guess which to drop, and the tag numbering depends on what stays wired."
      );
    }
    if (!total)
      info(slots.bundled
        ? "No reference media loaded yet — add some in the panel on the node, "
          + "or with the + tile above."
        : "No reference media is mirrored on this node yet.");
  } else {
    // Base modes: pictures are keyframes, and there are no video/audio slots.
    const used = byKind.Picture.filter((s) => s.idx <= cap.Picture);
    const extraPics = byKind.Picture.filter((s) => s.idx > cap.Picture);
    const roleList = Object.entries(cap.roles)
      .map(([tag, role]) => `<${tag}> (${role})`).join(" and ");

    if (cap.Picture === 0 && byKind.Picture.length) {
      warn(
        `${state.mode} takes no reference image — ` +
        `${byKind.Picture.map(slotName).join(", ")} will be ignored.`
      );
    } else if (extraPics.length) {
      warn(
        `${state.mode} uses ${cap.Picture === 1 ? "one reference image" : "two reference images"}: ` +
        `${roleList}. ${extraPics.map(slotName).join(", ")} ` +
        `${extraPics.length > 1 ? "are" : "is"} connected but will be ignored.`
      );
    } else if (used.length && cap.Picture) {
      info(`${state.mode} uses ${roleList}.`);
    }

    const av = [...byKind.Video, ...byKind.Audio];
    if (av.length) {
      warn(
        `${state.mode} has no reference video or audio slots — ` +
        `${av.map(slotName).join(", ")} ` +
        `${av.length > 1 ? "are" : "is"} connected but will be ignored. ` +
        "Switch to Reference mode to use them."
      );
    }
  }

  const body = state.mode === "REF"
    ? [state.ref.styleLine, state.ref.detail].join("\n")
    : state.imd;
  const full = generate(state);

  // Shot structure
  if (!/\[Shot 1\]/.test(body)) warn("Body has no [Shot 1] opening.");
  if (/\[Shot 1\]\s*At \d{2}:\d{2}\.\d{3}/.test(body))
    warn("[Shot 1] must not carry a timestamp (guide §4.2).");
  const stamps = [...body.matchAll(/\[Shot (\d+)\](?:\s*At (\d{2}):(\d{2})\.(\d{3}))?/g)];
  let lastMs = -1, lastShot = 0;
  const hasDuration = state.mode === "FL2VA" || state.mode === "L2VA";
  const durMs = snappedSeconds(state.duration) * 1000;
  for (const m of stamps) {
    const n = parseInt(m[1], 10);
    if (n !== lastShot + 1) warn(`Shot numbering jumps from ${lastShot} to ${n}.`);
    lastShot = n;
    if (n > 1) {
      if (!m[2]) warn(`[Shot ${n}] is missing its "At MM:SS.mmm," cut time.`);
      else {
        const ms = tsToMs(m[2], m[3], m[4]);
        if (ms <= lastMs) warn(`[Shot ${n}] cut time is not strictly increasing.`);
        if (hasDuration && ms >= durMs)
          warn(`[Shot ${n}] cut time exceeds the ${fmtSS(durMs / 1000)}s end time.`);
        lastMs = ms;
      }
    }
  }
  if (state.mode === "FL2VA" && lastShot > 1)
    info("FL2VA generally favors a single shot for clean interpolation (guide §3.2).");

  // Dialogue blocks
  const dOpen = (body.match(/<d>/g) || []).length;
  const dClose = (body.match(/<\/d>/g) || []).length;
  if (dOpen !== dClose) warn(`Unbalanced <d> tags (${dOpen} open / ${dClose} close).`);
  for (const m of body.matchAll(/<d>(.*?)<\/d>/gs)) {
    if (!/^\s*\[[A-Za-z]+\]/.test(m[1]))
      warn(`A <d> block is missing its [Language] tag: "${m[1].slice(0, 32)}…"`);
  }

  // Reference tag cross-checks
  const cited = new Set([...full.matchAll(/<(Picture|Video|Audio) (\d+)>/g)]
    .map((m) => `<${m[1]} ${m[2]}>`));
  const uncited = live.filter((s) => {
    const usable = state.mode === "REF" ||
      (s.kind === "Picture" && s.idx <= cap.Picture);
    return usable && !cited.has(s.tag);
  }).map((s) => s.tag);
  if (uncited.length === 1) {
    warn(`${uncited[0]} is connected but never cited in the prompt.`);
  } else if (uncited.length) {
    warn(`${uncited.length} connected references are never cited in the prompt: ` +
      uncited.join(", ") + ".");
  }
  const connected = new Set(live.map((s) => s.tag));
  for (const t of cited) {
    const [, kind, num] = t.match(/<(\w+) (\d+)>/);
    if (cap[kind] === 0) {
      warn(`${t} is cited, but ${state.mode} has no ${kind.toLowerCase()} reference to bind it to.`);
    } else if (+num > cap[kind]) {
      warn(`${t} is cited, but ${state.mode} only uses ${kind} 1${cap[kind] > 1 ? `\u2013${cap[kind]}` : ""}.`);
    } else if (!connected.has(t)) {
      if (slots.bundled)
        warn(`${t} is cited but no such reference is loaded.`);
      else
        info(`${t} is cited but not mirrored on this node (fine if wired only to the native node).`);
    }
  }

  if (state.mode === "REF") {
    // Switched-off lines aren't in the prompt, so they don't count as
    // defined and can't be missing a retention entry.
    const liveDefs = state.ref.subjectDefs.filter((d) => !d.off);
    const liveRet = state.ref.retention.filter((r) => !r.off);
    const defText = liveDefs.map((d) => d.text).join("\n");
    const subjects = new Set([...defText.matchAll(/<Subject (\d+)>/g)].map((m) => m[1]));
    const retLabels = new Set(liveRet.map((r) => r.label));
    for (const n of subjects) {
      if (![...retLabels].some((l) => l === `<Subject ${n}>`))
        warn(`<Subject ${n}> has no retention_analysis entry.`);
    }
    // The guide requires the marker to sit inside the role the definition
    // already states, so a plain contradiction is worth flagging.
    liveRet.forEach((row) => {
      const def = definitionFor(state, row.label);
      if (!def || !row.marker) return;
      const copies = /\breused\b|\bcopied\b|\bcopy\b|1:1/i.test(def);
      const refsOnly = /without copying|\breference\b|only its/i.test(def);
      const copyMarker = ["fully_copy", "partially_copy"].includes(row.marker);
      if (copies && !refsOnly && row.marker === "reference")
        warn(`${row.label} is defined as reused or copied, but its retention ` +
          "marker says reference \u2014 one of the two is wrong.");
      if (refsOnly && !copies && copyMarker)
        warn(`${row.label} is defined as a reference only, but its retention ` +
          `marker says ${row.marker} \u2014 one of the two is wrong.`);
    });

    const wc = state.ref.detail.trim() ? state.ref.detail.trim().split(/\s+/).length : 0;
    if (wc && (wc < 350 || wc > 500))
      info(`detailed_description is ${wc} words (guide suggests 350–500 for generation tasks).`);
    if (!state.ref.styleLine.trim())
      info("No style opening before [Shot 1] (guide §5.2 expects 1–2 style sentences).");
    if (!state.ref.summaryText.trim()) warn("summary text is empty.");
  } else {
    if ((state.mode === "I2VA" || state.mode === "FL2VA" || state.mode === "L2VA") &&
        !/<?Picture 1>?/.test(full))
      warn("Keyframe modes should anchor the description to Picture 1.");
    if (!state.soundscape.trim())
      warn("overall_soundscape is empty (use it unless the user wants total silence).");
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
.mmh3p-overlay{position:fixed;inset:0;z-index:10000;background:rgba(8,10,14,.62);
  display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;
  --mmh3p-mw:min(1240px,95vw);
  --mmh3p-mh:min(1290px,92vh);}
/* The pixel cap, not the viewport one, is what usually decides this modal's
   height — 92vh only bites on a short screen. Raising the cap by half is what
   makes the editor use more of a tall screen. */
/* border-box so the rendered height really is --mmh3p-mh. */
.mmh3p-modal{box-sizing:border-box;width:var(--mmh3p-mw);height:var(--mmh3p-mh);
  display:flex;flex-direction:column;
  background:#191c22;color:#d7dbe2;border:1px solid #303642;border-radius:10px;
  box-shadow:0 24px 64px rgba(0,0,0,.55);overflow:hidden;}
.mmh3p-head{display:flex;align-items:center;gap:14px;padding:10px 16px;
  border-bottom:1px solid #2a2f3a;background:#1e222a;}
.mmh3p-title{font-weight:600;font-size:calc(14px * var(--mmh3-fs, 1));letter-spacing:.02em;}
.mmh3p-title small{color:#8a93a3;font-weight:400;margin-left:8px;}
.mmh3p-modesends{padding:4px 14px;font-size:calc(10px * var(--mmh3-fs, 1));color:#7d8698;
  background:#171a20;border-bottom:1px solid #23272f;}
.mmh3p-modesends.gated{color:#e0a94c;}
.mmh3p-modes{display:flex;gap:2px;background:#12151b;border:1px solid #2a2f3a;
  border-radius:7px;padding:2px;}
/* Guide leads the right-hand group, so it carries the auto margin that used to
   sit on the mode selector — otherwise the gap opens between the two and Guide
   reads as part of the left-hand group instead. */
.mmh3p-guidebtn{margin-left:auto;}
/* Pushes an item, and everything after it, to the right of a flex header. */
.mmh3p-pushright{margin-left:auto;}
/* ...which only holds if the close button stops claiming the slack too: with
   two auto margins the free space splits between them and the pair ends up
   apart rather than together. */
.mmh3p-head .mmh3p-pushright ~ .mmh3p-x{margin-left:0;}
.mmh3p-modes button{background:none;border:0;color:#9aa3b2;padding:5px 12px;border-radius:5px;
  cursor:pointer;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-modes button.on{background:#2f3947;color:#fff;}
.mmh3p-x{background:none;border:0;color:#8a93a3;font-size:calc(18px * var(--mmh3-fs, 1));cursor:pointer;padding:2px 8px;}
/* Close always sits at the far right, as every other window does. */
.mmh3p-head .mmh3p-x{margin-left:auto;}
.mmh3p-x:hover{color:#fff;}
.mmh3p-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 440px;min-height:0;
  transition:grid-template-columns .16s ease;}
/* Sidebar view: a media column at the left edge. .mmh3p-rail is always in the
   DOM so the grid's track count only changes with the class, never with what
   happens to be rendered. */
.mmh3p-rail{display:none;}
/* 164px = the 130px card + the rail's 16px padding and 1px border, plus ~17px
   of slack for a classic scrollbar. Sized to the card rather than the other way
   round, so the column carries no dead width; the slack is what stops a
   platform with non-overlay scrollbars clipping the card once the list scrolls. */
.mmh3p-body.sidebar{grid-template-columns:164px minmax(0,1fr) 440px;}
.mmh3p-body.sidebar .mmh3p-rail{display:flex;flex-direction:column;gap:6px;
  min-height:0;overflow-y:auto;padding:10px 8px;background:#15181e;
  border-right:1px solid #2a2f3a;}
.mmh3p-railhead{flex:0 0 auto;font-size:calc(10px * var(--mmh3-fs, 1));text-transform:uppercase;
  letter-spacing:.08em;color:#8a93a3;}
/* In the sidebar the column's own gap spaces this; inline it is a block, so it
   needs the gap spelled out. */
.mmh3p-chipbar>.mmh3p-railhead{margin-bottom:6px;}
/* One column: the same cards, stacked. A joined video+audio pair meets
   top-to-bottom here, so the squared corners move to the horizontal edges. */
/* Centred, not stretched: the cards keep the same 128px they have inline, so a
   thumbnail is the same size whichever view you are in. */
.mmh3p-body.sidebar .mmh3p-rail .mmh3p-chips{flex-direction:column;flex-wrap:nowrap;
  max-height:none;overflow:visible;align-items:center;}
.mmh3p-body.sidebar .mmh3p-rail .mmh3p-card.joinR{margin-right:0;margin-bottom:-6px;
  border-radius:7px 7px 0 0;}
.mmh3p-body.sidebar .mmh3p-rail .mmh3p-card.joinL{border-left-width:1px;
  border-top-width:0;border-radius:0 0 7px 7px;}
@media (max-width:980px){.mmh3p-body{grid-template-columns:1fr;}}

.mmh3p-card{position:relative;width:128px;flex:0 0 auto;border:1px solid #2e3440;
  border-radius:7px;overflow:hidden;background:#12151b;cursor:pointer;
  user-select:none;}
.mmh3p-card:hover{border-color:#59637a;}
.mmh3p-card.pic{border-color:#6d5527;} .mmh3p-card.vid{border-color:#255c6b;}
.mmh3p-card.aud{border-color:#4c3d6e;}
.mmh3p-card .mmh3p-thumb{width:100%;height:80px;object-fit:cover;display:block;
  background:#0d1015;}
/* #41: the window onto a cropped reference. The media inside is oversized and
   offset so the kept rect fills this box. */
.mmh3p-cropwrap{position:relative;width:100%;height:80px;overflow:hidden;
  background:#0d1015;}
.mmh3p-cropwrap .mmh3p-cropped{position:absolute;height:auto;}
/* #42: the hover preview keeps the whole frame and outlines what is kept, so
   you can see what was dropped as well as what is left. */
.mmh3p-peekcrop{position:relative;display:block;margin:0 auto;line-height:0;}
.mmh3p-peekmark{position:absolute;border:1px solid rgba(76,195,224,.9);
  box-shadow:0 0 0 4000px rgba(8,10,14,.55);pointer-events:none;}
.mmh3p-wave{background:#0d1015;}
.mmh3p-cardbar{display:flex;align-items:center;gap:3px;padding:2px 4px;}
.mmh3p-tagname{font-family:ui-monospace,monospace;font-size:calc(9px * var(--mmh3-fs, 1));}
.mmh3p-tagname.pic{color:#e0a94c;} .mmh3p-tagname.vid{color:#4cc3e0;}
.mmh3p-tagname.aud{color:#b48ce8;} .mmh3p-tagname.subj{color:#7ec87e;}
/* Badged into the card's top-right corner, over the thumbnail. The dark pill
   and shadow are what keep a single digit legible against a bright frame;
   pointer-events:none so the corner is still part of the card's click target
   (clicking a card inserts its tag). */
.mmh3p-cite{position:absolute;top:3px;right:3px;z-index:2;pointer-events:none;
  min-width:14px;box-sizing:border-box;padding:1px 4px;border-radius:8px;
  text-align:center;font-size:calc(9px * var(--mmh3-fs, 1));line-height:1.35;
  font-family:ui-monospace,monospace;color:#c4cad5;
  background:rgba(10,12,16,.78);box-shadow:0 0 0 1px rgba(0,0,0,.45);}
.mmh3p-cite.zero{color:#e0a94c;}
.mmh3p-cite.off{color:#8b93a2;}
.mmh3p-card.unusable{opacity:.34;cursor:not-allowed;border-color:#2a2f3a !important;}
.mmh3p-card.unusable:hover{opacity:.5;border-color:#3a4252 !important;}
.mmh3p-card.unusable .mmh3p-tagname{color:#6b7484 !important;}
.mmh3p-cardnote{display:block;font-size:calc(8px * var(--mmh3-fs, 1));color:#8a7ab0;padding:0 4px 3px;}
/* max-content so the frame takes the picture's rendered width: a portrait
   shot capped by max-height makes a narrow box, a landscape one a wide box,
   instead of every image letterboxing inside one fixed width. */
.mmh3p-peek{position:fixed;z-index:10002;box-sizing:border-box;width:max-content;
  min-width:240px;max-width:540px;background:#1e222a;
  border:1px solid #3a4252;border-radius:9px;overflow:hidden;
  box-shadow:0 12px 32px rgba(0,0,0,.5);}
/* auto on both axes with a cap on each: the image keeps its own proportions
   and the box above shrinks to whatever width that leaves. */
.mmh3p-peekmedia{display:block;margin:0 auto;width:auto;height:auto;
  max-width:540px;max-height:70vh;background:#0d1015;}
.mmh3p-peekmeta{padding:6px 8px;}
.mmh3p-peekrow{display:flex;align-items:center;gap:6px;}
.mmh3p-peekcite{margin-left:auto;font-size:calc(9px * var(--mmh3-fs, 1));color:#7a8393;}
.mmh3p-peekcite.zero{color:#e0a94c;}
.mmh3p-peeksrc{font-size:calc(9px * var(--mmh3-fs, 1));color:#6b7484;margin:2px 0 6px;max-width:520px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
/* No top padding: the sticky media bar owns that space, so it can pin flush
   to the top of the scroll area with nothing able to scroll past it — the top
   gap is the bar's own 16px instead, which is why it matches the sides here.
   Bottom is 16px to match too. */
.mmh3p-form{overflow-y:auto;padding:0 16px 16px;min-width:0;
  display:flex;flex-direction:column;}
/* Sections keep their natural height; the one marked grow takes the slack, so
   the audio sections after it sit at the bottom of the form instead of
   floating under a short description box. When the content is genuinely
   taller than the form, min-height stops the growing box collapsing and the
   form scrolls as before. */
.mmh3p-form>*{flex:0 0 auto;}
.mmh3p-sec.mmh3p-grow{flex:1 1 auto;display:flex;flex-direction:column;
  min-height:220px;}
.mmh3p-sec.mmh3p-grow textarea{flex:1 1 auto;min-height:140px;}
.mmh3p-side{border-left:1px solid #2a2f3a;display:flex;flex-direction:column;min-height:0;background:#15181e;}
.mmh3p-sec{margin-bottom:16px;}
/* The form is a flex column, so margins don't collapse: the last section's own
   16px would stack onto the form's padding and make the bottom gap twice the
   sides. Drop it so the pane's four edges match. */
.mmh3p-form>:last-child{margin-bottom:0;}
.mmh3p-form>.mmh3p-audiopair:last-child>.mmh3p-sec{margin-bottom:0;}
.mmh3p-rowpow{cursor:pointer;font-size:calc(11px * var(--mmh3-fs, 1));color:#3f4855;user-select:none;
  flex-shrink:0;line-height:1;text-align:center;}
.mmh3p-defrow .mmh3p-rowpow{align-self:flex-start;margin-top:11px;}
.mmh3p-rowpow.on{color:#6fbf73;}
.mmh3p-rowpow:hover{filter:brightness(1.35);}
.mmh3p-defrow.off textarea, .mmh3p-retrow.off select, .mmh3p-retrow.off input{
  opacity:.4;text-decoration:line-through;}
.mmh3p-secpow{cursor:pointer;font-size:calc(11px * var(--mmh3-fs, 1));margin-right:6px;color:#3f4855;
  user-select:none;vertical-align:baseline;}
.mmh3p-secpow.on{color:#6fbf73;}
.mmh3p-secpow:hover{filter:brightness(1.35);}
.mmh3p-sec>label.off{opacity:.45;text-decoration:line-through;}
.mmh3p-sec>label.off ~ *{opacity:.45;}
.mmh3p-sec>label{display:block;font-size:calc(11px * var(--mmh3-fs, 1));text-transform:uppercase;letter-spacing:.08em;
  color:#8a93a3;margin-bottom:5px;}
/* A heading carrying its own controls: they sit against the right edge, clear
   of the field below. min-height keeps a header with buttons the same height
   as one without, so sections in a row still line up. */
.mmh3p-sec>label.act{display:flex;align-items:center;gap:8px;}
.mmh3p-secact{margin-left:auto;display:flex;align-items:center;gap:5px;
  flex:0 0 auto;text-transform:none;letter-spacing:normal;}
/* Header-sized: the standard .mmh3p-btn padding is built for a footer row and
   makes the heading much taller than the ones without buttons. Written as a
   descendant selector so it outranks .mmh3p-btn regardless of which is
   declared later in this sheet. */
.mmh3p-secact .mmh3p-btn{padding:1px 7px;font-size:calc(10px * var(--mmh3-fs, 1));line-height:1.5;}
/* .off strikes the heading through — that must not carry into its buttons. */
.mmh3p-sec>label.off .mmh3p-secact{text-decoration:none;}
.mmh3p-sec .hint{font-size:calc(11px * var(--mmh3-fs, 1));color:#6b7484;margin-top:4px;line-height:1.4;}
.mmh3p-form textarea,.mmh3p-form input[type=text],.mmh3p-form input[type=number],.mmh3p-form select{
  width:100%;box-sizing:border-box;background:#12151b;color:#dde2ea;border:1px solid #2e3440;
  border-radius:6px;padding:7px 9px;font-size:calc(13px * var(--mmh3-fs, 1));font-family:inherit;}
.mmh3p-form textarea{resize:vertical;line-height:1.5;}
.mmh3p-form textarea:focus,.mmh3p-form input:focus,.mmh3p-form select:focus{
  outline:none;border-color:#4a5568;}
.mmh3p-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.mmh3p-clearbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  background:#2b2320;border:1px solid #7a4a3a;border-radius:7px;padding:8px 10px;
  margin-bottom:10px;font-size:calc(12px * var(--mmh3-fs, 1));color:#e8c4b4;}
.mmh3p-clearnote{font-size:calc(11px * var(--mmh3-fs, 1));color:#a08878;}
/* The buttons live in their own nowrap group pinned right, so a narrow
   window wraps the MESSAGE instead of stranding one button on a new line
   at the far left. */
.mmh3p-clearactions{display:flex;gap:8px;flex-wrap:nowrap;margin-left:auto;
  flex-shrink:0;}
.mmh3p-clearmsg{flex:1 1 220px;min-width:0;}
.mmh3p-prefwrap{position:relative;display:inline-block;}
.mmh3p-x.on{color:#dde2ea;}
/* Fixed type inside the settings menu: scaling it would make the control
   that undoes a large text size unreadable. */
.mmh3p-prefmenu{--mmh3-fs:1;position:absolute;right:0;top:100%;margin-top:6px;
  z-index:20;display:none;width:292px;background:#1e222a;border:1px solid #3a4252;
  border-radius:9px;padding:8px;box-shadow:0 16px 40px rgba(0,0,0,.55);}
.mmh3p-prefmenu.on{display:block;}
.mmh3p-scalerow{display:flex;align-items:center;gap:8px;padding:5px 6px;}
.mmh3p-scalelabel{font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;
  width:80px;flex:0 0 auto;white-space:nowrap;}
.mmh3p-scalerange{flex:1;min-width:0;}
.mmh3p-scaleval{font-size:calc(10px * var(--mmh3-fs, 1));color:#d7dbe2;
  font-family:ui-monospace,monospace;width:58px;text-align:right;flex:0 0 auto;
  background:#12151b;border:1px solid #2e3440;border-radius:5px;padding:2px 4px;}
.mmh3p-scaleval:focus{outline:none;border-color:#4a5568;}
.mmh3p-scalepct{font-size:calc(10px * var(--mmh3-fs, 1));color:#6b7484;
  flex:0 0 auto;margin-left:-2px;}
.mmh3p-scalefoot{display:flex;gap:6px;justify-content:flex-end;padding:2px 6px 0;}
.mmh3p-prefsep{height:1px;background:#2e3440;margin:6px 4px;}
.mmh3p-prefversion{border-top:1px solid #2e3440;margin-top:6px;padding:7px 6px 2px;
  font-size:calc(9px * var(--mmh3-fs, 1));color:#6b7484;
  font-family:ui-monospace,monospace;}
.mmh3p-prefitem{display:flex;gap:8px;align-items:flex-start;padding:6px;
  border-radius:6px;cursor:pointer;}
.mmh3p-prefitem:hover{background:#242a34;}
.mmh3p-prefitem input{margin-top:2px;flex-shrink:0;}
.mmh3p-preflabel{display:block;font-size:calc(12px * var(--mmh3-fs, 1));color:#d7dbe2;}
.mmh3p-prefhint{display:block;font-size:calc(10px * var(--mmh3-fs, 1));color:#6b7484;line-height:1.35;
  margin-top:2px;}
.mmh3p-btn.mmh3p-danger{border-color:#5c3a3a;color:#e08585;}
.mmh3p-btn.mmh3p-danger:hover{background:#3a2626;color:#f0a0a0;}
/* Full-bleed: negative side margins cancel the form's padding, so the bar's
   background covers the gutters too. Text used to scroll visibly through
   them and through the strip above the bar. */
.mmh3p-dialogrow{margin-top:6px;}
/* nowrap matters: with wrapping allowed, flexbox breaks the line before it
   shrinks anything, so a long phrase name pushed the buttons onto a second
   row instead of narrowing the picker. */
/* Compound selector so this beats .mmh3p-tools, which sets flex-wrap:wrap
   later in the sheet at the same specificity. */
.mmh3p-tools.mmh3p-phraserow{margin-top:6px;flex-wrap:nowrap;}
.mmh3p-phrasewarn{font-size:calc(12px * var(--mmh3-fs, 1));color:#e8b46a;}
.mmh3p-phrasepeek{position:fixed;z-index:10005;max-width:420px;
  box-sizing:border-box;background:#1e222a;
  border:1px solid #3a4252;border-radius:9px;padding:8px 10px;
  box-shadow:0 16px 40px rgba(0,0,0,.55);pointer-events:none;}
.mmh3p-phrasepeekhead{display:flex;gap:8px;align-items:baseline;
  margin-bottom:5px;}
.mmh3p-phrasepeekhead span:first-child{font-size:calc(11px * var(--mmh3-fs, 1));color:#d7dbe2;
  font-weight:600;}
.mmh3p-phrasepeekcat{font-size:calc(9px * var(--mmh3-fs, 1));color:#6b7484;text-transform:uppercase;
  letter-spacing:.06em;}
.mmh3p-phrasepeektext{font-size:calc(12px * var(--mmh3-fs, 1));color:#a9b2c2;line-height:1.5;
  white-space:pre-wrap;max-height:220px;overflow:hidden;}
.mmh3p-ctxmenu{position:fixed;z-index:10006;min-width:190px;background:#1e222a;
  border:1px solid #3a4252;border-radius:8px;padding:4px;
  box-shadow:0 16px 40px rgba(0,0,0,.55);}
.mmh3p-ctxitem{padding:7px 10px;border-radius:6px;font-size:calc(12px * var(--mmh3-fs, 1));color:#d7dbe2;
  cursor:pointer;white-space:nowrap;}
.mmh3p-ctxitem:hover{background:#2a313d;}
.mmh3p-phraseover{z-index:10004;display:flex;align-items:center;
  justify-content:center;}
.mmh3p-phrasemodal{width:min(520px,92vw);background:#191c22;
  border:1px solid #303642;border-radius:10px;overflow:hidden;
  box-shadow:0 24px 64px rgba(0,0,0,.55);}
.mmh3p-phrasebody{padding:12px 14px;display:flex;flex-direction:column;gap:6px;}
.mmh3p-phrasebody label{font-size:calc(11px * var(--mmh3-fs, 1));text-transform:uppercase;
  letter-spacing:.08em;color:#8a93a3;}
.mmh3p-phrasetext{width:100%;box-sizing:border-box;background:#12151b;
  color:#dde2ea;border:1px solid #2e3440;border-radius:6px;padding:7px 9px;
  font-size:calc(13px * var(--mmh3-fs, 1));font-family:inherit;line-height:1.6;resize:vertical;}
.mmh3p-phrasetext:focus{outline:none;border-color:#4a5568;}
.mmh3p-phrasefoot{display:flex;align-items:center;gap:8px;padding:10px 14px;
  border-top:1px solid #2a2f3a;background:#1b1f27;}
.mmh3p-phrasecat{flex:0 1 150px;min-width:70px;}
/* The phrase names are the long ones, so this picker absorbs whatever room
   is left rather than truncating at a fixed width. */
.mmh3p-phrasesel{flex:1 1 120px;min-width:0;max-width:none;}
.mmh3p-toolspace{flex:0 0 8px;}
.mmh3p-toolgrow{flex:1 1 auto;}
.mmh3p-phraserow .mmh3p-btn,.mmh3p-phraserow .mmh3p-toollabel{flex:0 0 auto;
  white-space:nowrap;}
.mmh3p-toollabel{font-size:calc(10px * var(--mmh3-fs, 1));text-transform:uppercase;letter-spacing:.07em;
  color:#7d8698;align-self:center;}
.mmh3p-toolsep{width:1px;height:18px;background:#2e3440;align-self:center;}
.mmh3p-btn.ghost{opacity:.7;border-style:dashed;}
.mmh3p-chipbar{position:sticky;top:0;z-index:5;background:#191c22;
  padding:16px 16px 10px;margin:0 -16px 14px;
  border-bottom:1px solid #242a34;}
/* Wraps instead of scrolling sideways: a second row is easier to scan than a
   strip you have to drag through, and every reference stays reachable for a
   drag. Caps at roughly three rows before scrolling vertically. */
.mmh3p-chips{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:3px;
  align-items:flex-start;align-content:flex-start;
  max-height:min(46vh,380px);overflow-y:auto;overflow-x:hidden;}
.mmh3p-chips::-webkit-scrollbar{width:6px;height:6px;}
.mmh3p-chips::-webkit-scrollbar-thumb{background:#2e3440;border-radius:3px;}
.mmh3p-card.mmh3p-dropinto{outline:2px solid #6f86b8;outline-offset:1px;}
/* A video and its split soundtrack read as one unit: the pair closes the 6px
   rail gap with a negative margin and squares only the two corners that meet,
   so the teal border sits flush against the purple one. */
.mmh3p-card.joinR{border-top-right-radius:0;border-bottom-right-radius:0;
  margin-right:-6px;}
.mmh3p-card.joinL{border-top-left-radius:0;border-bottom-left-radius:0;
  border-left-width:0;}
.mmh3p-card.mmh3p-drop{display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:3px;align-self:stretch;min-height:97px;
  border-style:dashed;
  border-color:#2b313d;background:#141820;color:#5c6472;cursor:pointer;}
.mmh3p-card.mmh3p-drop:hover{border-color:#59637a;color:#8a93a3;}
.mmh3p-card.mmh3p-drop.hot{border-color:#6f86b8;background:#1b2230;color:#9db4dc;}
.mmh3p-dropplus{font-size:calc(18px * var(--mmh3-fs, 1));line-height:1;}
.mmh3p-dropkinds{font-size:calc(9px * var(--mmh3-fs, 1));text-transform:uppercase;letter-spacing:.06em;}
/* Sits at the right-hand end of the card's bottom bar, matching where the
   node's tiles put the same control. */
/* auto, not a fixed gap: the citation badge used to sit between the tag name
   and these and carried the auto margin. It moved to the card's corner in #14,
   so the tools have to claim the slack themselves or they bunch up against
   the tag name. */
.mmh3p-cardtools{display:flex;align-items:center;gap:6px;margin-left:auto;
  flex:0 0 auto;}
.mmh3p-cardtool{cursor:pointer;font-size:calc(11px * var(--mmh3-fs, 1));line-height:1;color:#5a6373;
  user-select:none;}
.mmh3p-cardtool:hover{color:#c9cfda;}
.mmh3p-cardtool.on{color:#e0a94c;}
.mmh3p-rmtool:hover{color:#e05a5a;}
/* The two audio sections sit side by side at the foot of the form. */
.mmh3p-audiopair{display:flex;gap:14px;align-items:flex-start;}
.mmh3p-audiopair>.mmh3p-sec{flex:1 1 0;min-width:0;margin-bottom:16px;}
@media (max-width:900px){.mmh3p-audiopair{flex-direction:column;gap:0;}}
.mmh3p-chip{display:inline-flex;align-items:center;gap:6px;border-radius:14px;cursor:pointer;
  border:1px solid #363d4a;background:#20242d;color:#c9cfda;font-size:calc(12px * var(--mmh3-fs, 1));
  padding:3px 10px;user-select:none;}
.mmh3p-chip:hover{border-color:#59637a;background:#262c38;}
.mmh3p-chip img,.mmh3p-chip video{width:22px;height:22px;object-fit:cover;border-radius:4px;}
.mmh3p-chip.pic{border-color:#8a6a2c;} .mmh3p-chip.pic b{color:#e0a94c;}
.mmh3p-chip.vid{border-color:#2c6f81;} .mmh3p-chip.vid b{color:#4cc3e0;}
.mmh3p-chip.aud{border-color:#5d4a86;} .mmh3p-chip.aud b{color:#b48ce8;}
.mmh3p-chip.subj{border-color:#3e6b3e;} .mmh3p-chip.subj b{color:#7ec87e;}
.mmh3p-chip b{font-weight:600;}
.mmh3p-chipnote{font-size:calc(9px * var(--mmh3-fs, 1));font-style:normal;opacity:.75;letter-spacing:.02em;
  border-left:1px solid #4a4260;padding-left:5px;margin-left:1px;}
.mmh3p-subjrow{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}
.mmh3p-tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;}
.mmh3p-tools select{width:auto;background:#12151b;color:#c9cfda;border:1px solid #2e3440;
  border-radius:6px;padding:4px 6px;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-tools input[type=number]{width:84px;background:#12151b;color:#c9cfda;
  border:1px solid #2e3440;border-radius:6px;padding:4px 6px;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-tools input[type=number]:focus{outline:none;border-color:#4a5568;}
.mmh3p-btn{background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;border-radius:6px;
  padding:5px 12px;font-size:calc(12px * var(--mmh3-fs, 1));cursor:pointer;}
.mmh3p-btn:hover{background:#333b4d;}
.mmh3p-btn.primary{background:#3f5a86;border-color:#4d6ea6;color:#fff;}
.mmh3p-btn.primary:hover{background:#48679a;}
.mmh3p-btn.ghost{background:none;border-color:transparent;color:#8a93a3;}
.mmh3p-btn.ghost:hover{color:#e05a5a;}
.mmh3p-defrow{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;}
.mmh3p-defrow textarea{flex:1;min-height:38px;}
.mmh3p-minitags{display:flex;gap:4px;flex-wrap:wrap;margin:-2px 0 8px 2px;min-height:14px;}
.mmh3p-minitag{font-size:calc(10px * var(--mmh3-fs, 1));border-radius:8px;padding:1px 7px;background:#20242d;border:1px solid #363d4a;}
.mmh3p-minitag.pic{color:#e0a94c;border-color:#8a6a2c;}
.mmh3p-minitag.vid{color:#4cc3e0;border-color:#2c6f81;}
.mmh3p-minitag.aud{color:#b48ce8;border-color:#5d4a86;}
.mmh3p-minitag.subj{color:#7ec87e;border-color:#3e6b3e;}
.mmh3p-roles{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:-4px 0 10px 2px;}
.mmh3p-rolelabel{font-size:calc(10px * var(--mmh3-fs, 1));text-transform:uppercase;letter-spacing:.07em;
  color:#6b7484;margin-right:2px;}
.mmh3p-rolechip{font-size:calc(11px * var(--mmh3-fs, 1));border-radius:10px;padding:2px 9px;cursor:pointer;
  background:#1d2029;border:1px solid #3a3050;color:#a99ac4;user-select:none;}
.mmh3p-rolechip:hover{border-color:#5d4a86;color:#c9b9e6;background:#241f33;}
.mmh3p-rolechip.on{background:#3a2f56;border-color:#7d63b8;color:#e2d6f8;}
.mmh3p-ttypes{display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:6px;}
.mmh3p-ttypes label{display:flex;gap:5px;align-items:center;font-size:calc(12px * var(--mmh3-fs, 1));color:#c9cfda;
  text-transform:none;letter-spacing:0;cursor:pointer;}
.mmh3p-retrow{display:grid;grid-template-columns:14px auto 1fr auto 26px;gap:6px;
  margin-bottom:6px;align-items:center;}
.mmh3p-retrow input,.mmh3p-retrow select{font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-retnote{grid-column:1/-1;margin-top:-2px;}
.mmh3p-preview{flex:1;overflow:auto;margin:0;padding:12px 14px;font:12px/1.55 ui-monospace,
  SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#c4cad5;}
/* Unscoped: paintTags() output appears in the editor's preview and in the
   node's prompt bar, and a tag has to read the same colour in both. */
.mmh3p-t-pic{color:#e0a94c;} .mmh3p-t-vid{color:#4cc3e0;}
.mmh3p-t-aud{color:#b48ce8;} .mmh3p-t-subj{color:#7ec87e;}
.mmh3p-t-shot{color:#7ea7d8;font-weight:600;}
.mmh3p-t-d{color:#d8c07e;}
/* Hues picked from what the tag palette wasn't already using: coral for the
   language bracket, pink for a speaker, and grey for N/A — which marks a
   section as deliberately empty, so it should read as absent, not as content. */
.mmh3p-t-lang{color:#e8846a;}
.mmh3p-t-spk{color:#e58fbf;font-weight:600;}
.mmh3p-t-na{color:#6b7484;font-style:italic;}
.mmh3p-issues{max-height:180px;overflow:auto;border-top:1px solid #2a2f3a;padding:8px 14px;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-issues .error{color:#f07070;margin:3px 0;font-weight:500;}
.mmh3p-issues .warn{color:#e0a94c;margin:3px 0;}
.mmh3p-issues .info{color:#8a93a3;margin:3px 0;}
.mmh3p-issues .ok{color:#7ec87e;}
.mmh3p-foot{display:flex;gap:8px;align-items:center;padding:10px 14px;border-top:1px solid #2a2f3a;}
.mmh3p-foot .stats{font-size:calc(11px * var(--mmh3-fs, 1));color:#6b7484;margin-right:auto;}
.mmh3p-summary{width:100%;box-sizing:border-box;background:#181b21;border:1px solid #2b303b;
  border-radius:6px;padding:6px 9px;font-size:calc(11px * var(--mmh3-fs, 1));line-height:1.5;color:#9aa3b2;
  overflow:hidden;cursor:default;display:flex;align-items:center;gap:9px;}
.mmh3p-summary b{color:#d7dbe2;}
/* Joined to the media panel above it (see .mmlp-joinbelow): square off the
   shared edge and take the panel's background and border colour, so the pair
   reads as one surface. The top border stays on as the divider. */
.mmh3p-summary.mmh3p-joinabove{border-top-left-radius:0;border-top-right-radius:0;
  border-bottom-left-radius:8px;border-bottom-right-radius:8px;
  background:#191c22;border-color:#2a2f3a;}
/* Two lines of the prompt, clamped. pre-line keeps the prompt's own breaks, so
   a short opening line spends line two on the next one instead of padding. */
.mmh3p-sumtext{flex:1 1 auto;min-width:0;white-space:pre-line;overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  max-height:calc(2 * 1.5em);}
.mmh3p-sumtext.empty{font-style:italic;color:#6b7484;}
/* Matches .mmh3p-modebtn at the bar's other end, so the two read as a pair. */
.mmh3p-sumbtn{flex:0 0 auto;align-self:center;display:inline-flex;align-items:center;
  gap:5px;background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;border-radius:6px;
  padding:4px 9px;font-size:calc(11px * var(--mmh3-fs, 1));font-family:inherit;cursor:pointer;white-space:nowrap;}
.mmh3p-sumbtn:hover{background:#333b4d;border-color:#59637a;}
.mmh3p-summark{flex:0 0 auto;align-self:center;font-size:calc(12px * var(--mmh3-fs, 1));line-height:1;
  opacity:.85;user-select:none;}
/* Quick edit: smaller than the full builder, same chrome. */
.mmh3p-quickmodal{box-sizing:border-box;width:min(900px,92vw);height:min(780px,88vh);
  display:flex;flex-direction:column;background:#191c22;color:#d7dbe2;
  border:1px solid #303642;border-radius:10px;overflow:hidden;
  box-shadow:0 24px 64px rgba(0,0,0,.55);}
.mmh3p-quickbody{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 18px;}
.mmh3p-quick{display:flex;flex-direction:column;min-height:100%;}
/* #46: keyframes on the left, fields on the right. */
.mmh3p-quickwrap{display:flex;gap:12px;align-items:stretch;min-height:100%;}
.mmh3p-quickwrap>.mmh3p-quick{flex:1 1 auto;min-width:0;}
.mmh3p-quickpics{flex:0 0 auto;width:132px;display:flex;flex-direction:column;gap:8px;}
.mmh3p-quickpic{border:1px solid #2e3440;border-radius:7px;overflow:hidden;
  background:#12151b;}
.mmh3p-quickpic .mmh3p-thumb{width:100%;height:80px;object-fit:cover;display:block;
  background:#0d1015;}
.mmh3p-quickpic .mmh3p-tagname{display:block;padding:3px 5px;}
.mmh3p-quick>*{flex:0 0 auto;}
.mmh3p-quick .mmh3p-sec.mmh3p-grow{flex:1 1 auto;display:flex;flex-direction:column;
  min-height:200px;}
.mmh3p-quick .mmh3p-sec.mmh3p-grow textarea{flex:1 1 auto;min-height:120px;}
.mmh3p-quick textarea{width:100%;box-sizing:border-box;background:#12151b;
  color:#dde2ea;border:1px solid #2e3440;border-radius:6px;padding:7px 9px;
  font-size:calc(13px * var(--mmh3-fs, 1));font-family:inherit;resize:vertical;line-height:1.5;}
.mmh3p-quick textarea:focus{outline:none;border-color:#4a5568;}
.mmh3p-quick label{display:block;font-size:calc(11px * var(--mmh3-fs, 1));text-transform:uppercase;
  letter-spacing:.08em;color:#8a93a3;margin-bottom:5px;}
/* The node's bar expanded into those fields: it stops being a one-line summary
   and becomes a small scrolling editor. */
.mmh3p-summary.mmh3p-summary-open{display:block;overflow-y:auto;padding:8px 10px;
  cursor:default;}
.mmh3p-summary.mmh3p-summary-open label{margin:6px 0 3px;}
.mmh3p-modebtn{flex:0 0 auto;align-self:center;display:inline-flex;align-items:center;gap:5px;
  background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;border-radius:6px;
  padding:4px 9px;font-size:calc(11px * var(--mmh3-fs, 1));font-family:inherit;cursor:pointer;white-space:nowrap;}
.mmh3p-modebtn:hover{background:#333b4d;border-color:#59637a;}
.mmh3p-modebtn.warn{border-color:#7a3a3a;color:#f0a0a0;}
.mmh3p-modebtn.warn b{color:#f0a0a0;}
.mmh3p-modecaret{font-size:calc(9px * var(--mmh3-fs, 1));color:#8a93a3;}
.mmh3p-modemenu{position:fixed;z-index:10050;background:#1e222a;border:1px solid #3a4252;
  border-radius:8px;padding:4px;min-width:200px;box-shadow:0 12px 32px rgba(0,0,0,.5);
  font-family:system-ui,sans-serif;}
.mmh3p-modeitem{display:flex;align-items:baseline;gap:7px;padding:6px 8px;border-radius:6px;
  cursor:pointer;font-size:calc(11px * var(--mmh3-fs, 1));color:#c9cfda;}
.mmh3p-modeitem:hover{background:#2a3140;}
.mmh3p-modeitem.on{background:#28313f;}
.mmh3p-modeitem.on b{color:#8fb3ff;}
.mmh3p-modehint{color:#6b7484;font-size:calc(10px * var(--mmh3-fs, 1));}
.mmh3p-libmodal{box-sizing:border-box;width:min(1240px,95vw);height:min(1290px,92vh);display:flex;
  flex-direction:column;background:#191c22;color:#d7dbe2;border:1px solid #303642;
  border-radius:10px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.55);}
.mmh3p-libbar{display:flex;gap:6px;align-items:center;padding:8px 12px;
  border-bottom:1px solid #2a2f3a;background:#1b1f27;}
.mmh3p-libbar input{flex:1;min-width:0;background:#12151b;color:#dde2ea;
  border:1px solid #2e3440;border-radius:6px;padding:5px 9px;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-libbar select{background:#12151b;color:#c9cfda;border:1px solid #2e3440;
  border-radius:6px;padding:5px 7px;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-libbar input:focus,.mmh3p-libbar select:focus{outline:none;border-color:#4a5568;}
.mmh3p-btn.on{background:#3a2f56;border-color:#7d63b8;color:#e2d6f8;}
.mmh3p-liblist{flex:1;overflow:auto;padding:6px 8px;}
.mmh3p-saveform{background:#1d222b;border:1px solid #3a4252;border-radius:8px;
  padding:8px;margin-bottom:8px;}
.mmh3p-saverow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.mmh3p-savecat{background:#12151b;color:#d7dbe2;border:1px solid #2e3440;
  border-radius:7px;padding:6px 8px;font-size:calc(12px * var(--mmh3-fs, 1));max-width:190px;}
.mmh3p-savecat:focus{outline:none;border-color:#4a5568;}
.mmh3p-saverow input[type=text]{flex:1;min-width:130px;background:#12151b;
  color:#dde2ea;border:1px solid #2e3440;border-radius:6px;padding:5px 9px;
  font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-saverow input[type=text]:focus{outline:none;border-color:#4a5568;}
.mmh3p-savefav{display:flex;align-items:center;gap:4px;font-size:calc(11px * var(--mmh3-fs, 1));
  color:#8a93a3;white-space:nowrap;cursor:pointer;}
.mmh3p-saveerr{display:block;font-size:calc(11px * var(--mmh3-fs, 1));color:#f07070;margin-top:5px;}
.mmh3p-saveerr:empty{display:none;}
.mmh3p-librow.confirm{background:#241f2b;border-left:2px solid #7d63b8;}
.mmh3p-librow{display:flex;align-items:center;gap:8px;padding:7px 8px;
  border-bottom:1px solid #23272f;}
.mmh3p-librow:hover{background:#1d222b;}
.mmh3p-star{background:none;border:0;color:#5c6472;font-size:calc(15px * var(--mmh3-fs, 1));cursor:pointer;
  padding:0 2px;line-height:1;}
.mmh3p-star.on{color:#e0a94c;}
.mmh3p-star:hover{color:#e0a94c;}
.mmh3p-libmain{flex:1;min-width:0;}
.mmh3p-libtop{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.mmh3p-libname{font-size:calc(13px * var(--mmh3-fs, 1));color:#dde2ea;}
.mmh3p-libmode{font-size:calc(9px * var(--mmh3-fs, 1));text-transform:uppercase;letter-spacing:.06em;
  border:1px solid #2b3a52;color:#7ea7d8;border-radius:8px;padding:0 6px;}
.mmh3p-libcat{font-size:calc(9px * var(--mmh3-fs, 1));border:1px solid #3e5240;color:#7ec87e;border-radius:8px;
  padding:0 6px;cursor:pointer;}
.mmh3p-libcat:hover{border-color:#7ec87e;background:#1e2a1e;}
.mmh3p-libcat.none{border-color:#333a45;color:#5c6472;}
.mmh3p-libcat.none:hover{border-color:#59637a;color:#8a93a3;background:none;}
.mmh3p-catlbl{font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;white-space:nowrap;}
.mmh3p-libage{margin-left:auto;font-size:calc(10px * var(--mmh3-fs, 1));color:#5c6472;}
.mmh3p-libprev{font-size:calc(11px * var(--mmh3-fs, 1));color:#6b7484;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;margin-top:2px;font-family:ui-monospace,monospace;}
.mmh3p-libacts{display:flex;gap:5px;flex-shrink:0;}
.mmh3p-libempty{padding:26px 12px;text-align:center;color:#6b7484;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-toast.bad{background:#3a2020;border-color:#7a3a3a;color:#f0c0c0;
  max-width:min(560px,90vw);}
.mmh3p-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10001;
  background:#2b3140;color:#fff;border:1px solid #4a5568;border-radius:8px;
  padding:8px 16px;font-size:calc(13px * var(--mmh3-fs, 1));}

/* Reference chips. The mirror div sits under a textarea whose own text is
   transparent, so the browser keeps selection/undo/IME while the tags get
   styled. Every metric below is copied from .mmh3p-form textarea — any
   difference and the chips drift off the words as lines wrap. This block is
   last, and uses .mmh3p-chiptext, so it wins over the generic form rules. */
/* The wrapper carries the field's frame; the textarea inside is invisible
   except for its caret and selection. */
.mmh3p-chipwrap{position:relative;display:block;background:#12151b;
  border:1px solid #2e3440;border-radius:6px;}
.mmh3p-chipwrap:focus-within{border-color:#4a5568;}
/* Those two sections put the field in a flex row beside an N/A button; the
   wrapper has to claim the space the bare textarea used to. */
.mmh3p-row .mmh3p-chipwrap{flex:1;min-width:0;}
.mmh3p-chipmirror,
.mmh3p-chipwrap textarea.mmh3p-chiptext{
  width:100%;box-sizing:border-box;border:1px solid transparent;
  border-radius:6px;padding:7px 9px;font-size:calc(13px * var(--mmh3-fs, 1));font-family:inherit;
  line-height:1.7;letter-spacing:normal;white-space:pre-wrap;
  overflow-wrap:break-word;word-break:normal;tab-size:4;}
.mmh3p-chipmirror{position:absolute;inset:0;overflow:hidden;pointer-events:none;
  color:#dde2ea;background:transparent;z-index:1;}
.mmh3p-chipwrap textarea.mmh3p-chiptext{position:relative;display:block;
  background:transparent;color:transparent;caret-color:#dde2ea;
  resize:vertical;z-index:0;}
.mmh3p-chipwrap textarea.mmh3p-chiptext:focus{outline:none;}
.mmh3p-chipwrap textarea.mmh3p-chiptext::selection{
  background:rgba(96,140,210,.38);color:transparent;}
.mmh3p-chipwrap textarea.mmh3p-chiptext::placeholder{color:#5c6472;}
/* Layout-neutral by construction. The mirror only lines up with the textarea
   if a chip advances the text exactly as its bare glyphs would, so there is
   no padding, no margin and no border here — the breathing room is an OUTER
   box-shadow spread, which paints beyond the box without occupying space.
   Anything that changes the advance shifts wrap points, and the error
   compounds line after line. */
.mmh3p-reftag{border-radius:3px;background:rgba(224,169,76,.18);color:#e0a94c;
  box-shadow:0 0 0 2px rgba(224,169,76,.18), inset 0 0 0 1px rgba(224,169,76,.45);
  -webkit-box-decoration-break:clone;box-decoration-break:clone;}
.mmh3p-reftag.vid{background:rgba(76,195,224,.18);color:#4cc3e0;
  box-shadow:0 0 0 2px rgba(76,195,224,.18), inset 0 0 0 1px rgba(76,195,224,.45);}
.mmh3p-reftag.aud{background:rgba(180,140,232,.18);color:#b48ce8;
  box-shadow:0 0 0 2px rgba(180,140,232,.18), inset 0 0 0 1px rgba(180,140,232,.45);}
.mmh3p-reftag.subj{background:rgba(111,191,115,.18);color:#6fbf73;
  box-shadow:0 0 0 2px rgba(111,191,115,.18), inset 0 0 0 1px rgba(111,191,115,.45);}
.mmh3p-reftag.unknown{background:rgba(240,112,112,.16);color:#f07070;
  box-shadow:0 0 0 2px rgba(240,112,112,.16), inset 0 0 0 1px rgba(240,112,112,.5);}
.mmh3p-reftag.spk{background:rgba(126,167,216,.16);color:#7ea7d8;
  box-shadow:0 0 0 2px rgba(126,167,216,.16), inset 0 0 0 1px rgba(126,167,216,.4);}
/* Cut markers are the loudest thing in a prompt, so they're the only SOLID
   chip: every other tag is a translucent tint. The weight does the work, which
   also means the hue doesn't have to compete with audio's violet or the red
   that means "undefined tag". */
.mmh3p-reftag.shot{background:#a34b7d;color:#ffe9f4;font-weight:700;
  box-shadow:0 0 0 2px #a34b7d, inset 0 0 0 1px rgba(255,255,255,.18);}
/* Spoken lines. The band shows how much of a paragraph is actually speech;
   the markers dim because they're syntax, not words the model will say.
   box-decoration-break keeps the band intact when a line wraps. */
.mmh3p-dblock{background:rgba(126,167,216,.10);border-radius:3px;
  box-shadow:0 0 0 2px rgba(126,167,216,.10),
             inset 0 0 0 1px rgba(126,167,216,.28);
  -webkit-box-decoration-break:clone;box-decoration-break:clone;}
.mmh3p-dmark{color:#5f7899;}
.mmh3p-dlang{color:#9dc0e4;background:rgba(126,167,216,.16);border-radius:3px;
  box-shadow:0 0 0 1px rgba(126,167,216,.16);}
.mmh3p-dtext{color:#e8eef6;}
.mmh3p-chippeek{position:fixed;z-index:10003;width:220px;background:#1e222a;
  border:1px solid #3a4252;border-radius:9px;overflow:hidden;
  box-shadow:0 16px 40px rgba(0,0,0,.55);pointer-events:none;}
.mmh3p-chippeekmedia{width:100%;max-height:150px;object-fit:contain;display:block;
  background:#000;}
.mmh3p-chippeekcap{display:flex;align-items:center;gap:6px;padding:5px 8px;
  font-size:calc(9px * var(--mmh3-fs, 1));color:#6b7484;}
.mmh3p-chippeekcap span:last-child{overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.mmh3p-chippeekcap.col{flex-direction:column;align-items:flex-start;gap:4px;}
.mmh3p-chippeekcap.col span:last-child{overflow:visible;white-space:normal;}
.mmh3p-chiprow{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;}
.mmh3p-chiplabel{font-size:calc(9px * var(--mmh3-fs, 1));color:#6b7484;min-width:26px;}
.mmh3p-chipspk{font-size:calc(9px * var(--mmh3-fs, 1));color:#7ea7d8;font-family:ui-monospace,monospace;}
.mmh3p-chiptags{display:flex;flex-wrap:wrap;gap:3px;}
.mmh3p-chiptags .mmh3p-tagname{font-size:calc(9px * var(--mmh3-fs, 1));}
.mmh3p-chipnone{color:#6b7484;font-style:italic;}
`;

let cssInjected = false;
export function injectCSS() {
  if (cssInjected) return;
  document.head.append(el("style", { textContent: CSS }));
  cssInjected = true;
}

function toast(msg, ms = 1800) {
  const t = el("div", { class: "mmh3p-toast" }, msg);
  if (ms > 4000) t.classList.add("bad");
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

/* ------------------------------------------------------------------ */
/* Prompt library                                                      */
/* ------------------------------------------------------------------ */

async function libApi(path, body) {
  const opts = body
    ? { method: "POST", body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" } }
    : {};
  const resp = await api.fetchApi("/minimax_h3_plus/prompts" + path, opts);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `request failed (${resp.status})`);
  return data;
}

function ago(ts) {
  if (!ts) return "";
  const secs = Math.max(0, Date.now() / 1000 - ts);
  const steps = [[86400 * 365, "y"], [86400 * 30, "mo"], [86400, "d"],
                 [3600, "h"], [60, "m"]];
  for (const [size, unit] of steps)
    if (secs >= size) return `${Math.floor(secs / size)}${unit} ago`;
  return "just now";
}

/** Browse, filter, and load saved prompts. `onLoad` receives the saved state. */
class Library {
  constructor(editor) {
    this.editor = editor;
    this.entries = [];
    this.categories = [];
    this.query = "";
    this.category = "";
    this.favesOnly = false;
    this.saveOpen = false;
    this.catEdit = false;     // renaming the selected category
    this.rowCat = null;       // id of the entry whose category is being set
    this.pending = null;      // { id, action: "load" | "delete" }
    this.formId = `mmh3cat${Math.random().toString(36).slice(2, 8)}`;
    injectCSS();
    this.build();
    document.body.append(this.overlay);
    this.applyScale();
    this.refresh();
  }

  build() {
    this.listEl = el("div", { class: "mmh3p-liblist" });
    this.searchEl = el("input", {
      type: "text", placeholder: "Search prompts",
      oninput: (e) => { this.query = e.target.value.toLowerCase(); this.paint(); },
    });
    this.catEl = el("select", {
      onchange: (e) => { this.category = e.target.value; this.paint(); },
    });
    this.favEl = el("button", { class: "mmh3p-btn",
      title: "Show favourites only",
      onclick: () => { this.favesOnly = !this.favesOnly; this.paint(); } },
      "\u2605 Favourites");

    this.catBtn = el("button", { class: "mmh3p-btn",
      title: "Rename or clear the selected category",
      onclick: () => {
        if (!this.category) { toast("Pick a category to manage first"); return; }
        this.catEdit = !this.catEdit;
        this.paint();
      } }, "\u270e");

    // Same reasoning as the editor: a stray click shouldn't discard a
    // half-filled save form. Use \u2715, Cancel or Escape.
    this.overlay = el("div", { class: "mmh3p-overlay mmh3p-libover" },
      el("div", { class: "mmh3p-libmodal" },
        el("div", { class: "mmh3p-head" },
          el("div", { class: "mmh3p-title" }, "Prompt library"),
          el("button", { class: "mmh3p-btn",
            onclick: () => { this.saveOpen = !this.saveOpen; this.paint(); } },
            "Save current prompt"),
          el("button", { class: "mmh3p-x", onclick: () => this.close() }, "\u2715")),
        el("div", { class: "mmh3p-libbar" },
          this.searchEl, this.catEl, this.catBtn, this.favEl),
        this.listEl));

    this.escHandler = (e) => { if (e.key === "Escape") this.close(); };
    window.addEventListener("keydown", this.escHandler);
  }

  close() {
    window.removeEventListener("keydown", this.escHandler);
    this.overlay.remove();
  }

  async refresh() {
    try {
      const data = await libApi("");
      this.entries = data.prompts || [];
      this.categories = data.categories || [];
    } catch (err) {
      this.entries = [];
      this.listEl.replaceChildren(
        el("div", { class: "mmh3p-libempty" },
          `Library unavailable: ${err.message}. Restart ComfyUI if you just updated.`));
      return;
    }
    this.catEl.replaceChildren(
      el("option", { value: "" }, "All categories"),
      ...this.categories.map((c) =>
        el("option", { value: c, selected: c === this.category }, c)));
    this.paint();
  }

  visible() {
    return this.entries.filter((e) => {
      if (this.favesOnly && !e.favorite) return false;
      if (this.category && e.category !== this.category) return false;
      if (!this.query) return true;
      return [e.name, e.category, e.mode, e.preview].join(" ")
        .toLowerCase().includes(this.query);
    });
  }

  saveForm() {
    const ed = this.editor;
    const name = el("input", { type: "text", placeholder: "Prompt name",
      value: ed.libraryName || `${ed.state.mode} prompt` });
    // Existing categories as a list, so saving into one is a pick rather
    // than retyping it exactly; "(new category…)" reveals a text field.
    const known = [...this.categories];
    const current = ed.libraryCategory || "";
    if (current && !known.includes(current)) known.unshift(current);
    const catNew = el("input", { type: "text", placeholder: "New category name",
      style: { display: "none" } });
    const category = el("select", { class: "mmh3p-savecat",
      onchange: () => {
        const isNew = category.value === "\u0000new";
        catNew.style.display = isNew ? "" : "none";
        if (isNew) setTimeout(() => catNew.focus(), 0);
      } },
      el("option", { value: "" }, "No category"),
      known.map((c) => el("option",
        { value: c, selected: c === current }, c)),
      el("option", { value: "\u0000new" }, "(new category\u2026)"));
    const categoryValue = () =>
      (category.value === "\u0000new" ? catNew.value : category.value).trim();
    const fav = el("input", { type: "checkbox" });
    const err = el("span", { class: "mmh3p-saveerr" });

    const commit = async () => {
      const value = name.value.trim();
      if (!value) { err.textContent = "Give it a name first."; name.focus(); return; }
      try {
        const res = await libApi("/save", {
          name: value,
          rename_from: ed.libraryId,
          category: categoryValue(),
          favorite: fav.checked,
          mode: ed.state.mode,
          refs: ed.slots.filter((s) => s.tag).length,
          prompt: generate(ed.state),
          state: ed.state,
        });
        ed.libraryId = res.id;
        ed.libraryName = res.name;
        ed.libraryCategory = categoryValue();
        this.saveOpen = false;
        toast(`Saved "${res.name}"`);
        this.refresh();
      } catch (e2) { err.textContent = e2.message; }
    };
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    catNew.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    setTimeout(() => { name.focus(); name.select(); }, 0);

    return el("div", { class: "mmh3p-saveform" },
      el("div", { class: "mmh3p-saverow" },
        name, category, catNew,
        el("label", { class: "mmh3p-savefav" }, fav, "favourite"),
        el("button", { class: "mmh3p-btn primary", onclick: commit }, "Save"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.saveOpen = false; this.paint(); } }, "Cancel")),
      err);
  }

  confirmRow(entry, action) {
    const isDelete = action === "delete";
    return el("div", { class: "mmh3p-librow confirm" },
      el("div", { class: "mmh3p-libmain" },
        el("div", { class: "mmh3p-libtop" },
          el("span", { class: "mmh3p-libname" },
            isDelete
              ? `Delete "${entry.name}"?`
              : `Replace the editor with "${entry.name}"?`)),
        el("div", { class: "mmh3p-libprev" },
          isDelete
            ? "This removes the saved prompt. It cannot be undone."
            : "Your unsaved changes in the editor will be lost.")),
      el("div", { class: "mmh3p-libacts" },
        el("button", { class: "mmh3p-btn primary",
          onclick: () => isDelete ? this.remove(entry) : this.load(entry) },
          isDelete ? "Delete" : "Load"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.pending = null; this.paint(); } }, "Cancel")));
  }

  categoryForm() {
    const input = el("input", { type: "text", value: this.category,
      placeholder: "New category name" });
    const count = this.entries.filter((e) => e.category === this.category).length;
    const err = el("span", { class: "mmh3p-saveerr" });

    const apply = async (target) => {
      try {
        const res = await libApi("/category", { from: this.category, to: target });
        toast(target
          ? `Moved ${res.changed} prompt${res.changed === 1 ? "" : "s"} to "${target}"`
          : `Cleared the category on ${res.changed} prompt${res.changed === 1 ? "" : "s"}`);
        this.category = target;
        this.catEdit = false;
        this.refresh();
      } catch (e2) { err.textContent = e2.message; }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") apply(input.value.trim());
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);

    return el("div", { class: "mmh3p-saveform" },
      el("div", { class: "mmh3p-saverow" },
        el("span", { class: "mmh3p-catlbl" },
          `"${this.category}" \u2014 ${count} prompt${count === 1 ? "" : "s"}`),
        input,
        el("button", { class: "mmh3p-btn primary",
          onclick: () => apply(input.value.trim()) }, "Rename"),
        el("button", { class: "mmh3p-btn ghost",
          title: "Remove this category from its prompts (they are kept)",
          onclick: () => apply("") }, "Clear"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.catEdit = false; this.paint(); } }, "Cancel")),
      err);
  }

  rowCategoryForm(entry) {
    const input = el("input", { type: "text", value: entry.category || "",
      list: this.formId, placeholder: "Category (blank to clear)" });
    const apply = async () => {
      try {
        const res = await libApi("/meta",
          { id: entry.id, category: input.value.trim() });
        entry.category = res.category;
        this.rowCat = null;
        this.refresh();
      } catch (e2) { toast(e2.message); }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return el("div", { class: "mmh3p-librow confirm" },
      el("div", { class: "mmh3p-libmain" },
        el("div", { class: "mmh3p-libtop" },
          el("span", { class: "mmh3p-libname" }, entry.name)),
        el("div", { class: "mmh3p-saverow", style: { marginTop: "4px" } },
          input,
          el("datalist", { id: this.formId },
            this.categories.map((c) => el("option", { value: c }))))),
      el("div", { class: "mmh3p-libacts" },
        el("button", { class: "mmh3p-btn primary", onclick: apply }, "Set"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.rowCat = null; this.paint(); } }, "Cancel")));
  }

  paint() {
    this.favEl.classList.toggle("on", this.favesOnly);
    const rows = this.visible();
    const kids = [];
    if (this.saveOpen) kids.push(this.saveForm());
    if (this.catEdit && this.category) kids.push(this.categoryForm());
    if (!rows.length) {
      kids.push(el("div", { class: "mmh3p-libempty" },
        this.entries.length
          ? "Nothing matches those filters."
          : "No saved prompts yet \u2014 use 'Save current prompt'."));
      this.listEl.replaceChildren(...kids);
      return;
    }
    kids.push(...rows.map((e) => this.rowCat === e.id
      ? this.rowCategoryForm(e)
      : this.pending?.id === e.id
      ? this.confirmRow(e, this.pending.action)
      : el("div", { class: "mmh3p-librow" },
      el("button", {
        class: "mmh3p-star" + (e.favorite ? " on" : ""),
        title: e.favorite ? "Remove from favourites" : "Add to favourites",
        onclick: async () => {
          try {
            await libApi("/meta", { id: e.id, favorite: !e.favorite });
            e.favorite = !e.favorite;
            this.paint();
          } catch (err) { toast(err.message); }
        } }, e.favorite ? "\u2605" : "\u2606"),
      el("div", { class: "mmh3p-libmain" },
        el("div", { class: "mmh3p-libtop" },
          el("span", { class: "mmh3p-libname" }, e.name),
          e.mode ? el("span", { class: "mmh3p-libmode" },
            e.mode === "REF" ? "reference" : e.mode) : null,
          el("span", { class: "mmh3p-libcat" + (e.category ? "" : " none"),
          title: "Change this prompt's category",
          onclick: () => { this.rowCat = e.id; this.paint(); } },
          e.category || "+ category"),
          el("span", { class: "mmh3p-libage" }, ago(e.updated))),
        el("div", { class: "mmh3p-libprev" }, e.preview || "(empty)")),
      el("div", { class: "mmh3p-libacts" },
        el("button", { class: "mmh3p-btn primary",
          onclick: () => this.askLoad(e) }, "Load"),
        el("button", { class: "mmh3p-btn ghost", title: "Delete",
          onclick: () => { this.pending = { id: e.id, action: "delete" };
            this.paint(); } }, "\u2715")))));
    this.listEl.replaceChildren(...kids);
  }

  askLoad(entry) {
    // Only worth confirming if there is something to lose.
    if (generate(this.editor.state).trim()) {
      this.pending = { id: entry.id, action: "load" };
      this.paint();
    } else this.load(entry);
  }

  async load(entry) {
    this.pending = null;
    try {
      const data = await libApi("/load", { id: entry.id });
      const base = defaultState();
      const next = { ...base, ...(data.state || {}),
        ref: { ...base.ref, ...((data.state || {}).ref || {}) } };
      this.editor.state = next;
      this.editor.libraryId = entry.id;
      this.editor.libraryName = entry.name;
      this.editor.libraryCategory = data.category || "";
      this.editor.render();
      toast(`Loaded "${entry.name}"`);
      this.close();
    } catch (err) { toast(`Load failed: ${err.message}`); }
  }

  async remove(entry) {
    this.pending = null;
    try {
      await libApi("/delete", { id: entry.id });
      this.entries = this.entries.filter((x) => x !== entry);
      this.paint();
    } catch (err) { toast(`Delete failed: ${err.message}`); }
  }

}

/* ------------------------------------------------------------------ */
/* Modal editor                                                        */
/* ------------------------------------------------------------------ */

class Editor {
  constructor(node) {
    this.node = node;
    this.state = loadState(node);
    this.slots = getRefSlots(node);
    this.lastFocus = null;
    this.sidebar = !!node._mmh3Sidebar;
    this.libraryId = null;
    this.libraryName = "";
    this.libraryCategory = "";
    this.clearPending = false;
    this.closePending = false;
    this.prefs = loadPrefs();
    this.prefsOpen = false;
    // What the node currently holds, to tell "edited" from "just looked".
    this.openedWith = JSON.stringify(this.state);
    injectCSS();
    this.build();
    this.render();
    document.body.append(this.overlay);
    this.applyScale();
  }

  /* ---------- insertion ---------- */
  /* opts.newline: start the insert on its own line (for block-level items
     like shot headers), collapsing any trailing whitespace first. */
  insert(text, opts = {}) {
    const t = this.lastFocus;
    if (!t || !t.isConnected) { toast("Click into a text field first"); return; }
    const start = t.selectionStart ?? t.value.length;
    const end = t.selectionEnd ?? start;
    let before = t.value.slice(0, start);
    let pad;
    // opts.newline is for [Shot N] and nothing else. A line break anywhere
    // else reads to the model as a cut, which silently splits the clip.
    if (opts.newline) {
      before = before.replace(/\s+$/, "");
      pad = before ? "\n" : "";
    } else if (/^[,;]/.test(text)) {
      pad = "";                     // the snippet supplies its own separator
    } else {
      pad = before && !/[\s(\u2014]$/.test(before) ? " " : "";
    }
    const after = t.value.slice(end);
    t.value = before + pad + text + after;
    const base = before.length + pad.length;
    const dPos = text.indexOf("</d>");
    t.selectionStart = t.selectionEnd = dPos >= 0 ? base + dPos : base + text.length;
    t.focus();
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* ---------- skeleton ---------- */
  build() {
    this.formEl = el("div", { class: "mmh3p-form" });
    // Left-edge column for the sidebar view. Always present so the grid's
    // column count is stable; empty and hidden unless the view is on.
    this.railEl = el("div", { class: "mmh3p-rail" });
    this.previewEl = el("pre", { class: "mmh3p-preview" });
    this.issuesEl = el("div", { class: "mmh3p-issues" });
    this.statsEl = el("span", { class: "stats" });

    this.modeBar = el("div", { class: "mmh3p-modes" },
      MODES.map((m) => el("button", {
        title: m.hint,
        onclick: () => { this.state.mode = m.id; this.render(); },
      }, m.label)));
    this.modeSends = el("div", { class: "mmh3p-modesends" });

    const copyBtn = el("button", { class: "mmh3p-btn", onclick: async () => {
      // Always the live editor state — saving to the node is not a
      // prerequisite for copying what you've written.
      const text = generate(this.state);
      const ok = await copyText(text);
      // toast's second argument is a duration; >4000 also styles it as a
      // warning, which is what a failure should look like.
      if (ok) toast("Prompt copied");
      else toast("Couldn't reach the clipboard \u2014 select the preview on " +
                 "the right and copy manually", 6000);
    }}, "Copy prompt");
    const cancelBtn = el("button", { class: "mmh3p-btn",
      onclick: () => this.requestClose() }, "Cancel");
    const saveBtn = el("button", { class: "mmh3p-btn primary", onclick: () => this.save() },
      "Save to node");

    const guideBtn = el("button", { class: "mmh3p-btn mmh3p-guidebtn",
      title: "Open the bundled MiniMax H3 Video Prompt Writing Guide (PDF)",
      onclick: () => window.open(
        new URL("./Video_Prompt_Writing_Guide.pdf", import.meta.url).href,
        "_blank") }, "\ud83d\udcd6 Guide");

    this.overlay = el("div", { class: "mmh3p-overlay",
      onmousedown: (e) => {
        if (e.target !== this.overlay) return;
        if (this.prefsOpen) { this.togglePrefs(false); return; }
        // Off by preference, this does nothing; on, it still goes through
        // the unsaved-changes check rather than closing outright.
        if (this.prefs.closeOnBackdrop) this.requestClose();
      } },
      el("div", { class: "mmh3p-modal" },
        el("div", { class: "mmh3p-head" },
          el("div", { class: "mmh3p-title" }, "Fantastic H3 Prompt Builder",
            el("small", {}, "guide-conformant output")),
          el("button", { class: "mmh3p-btn",
            title: "Browse saved prompts",
            onclick: () => new Library(this) }, "\u2630 Library"),
          el("button", { class: "mmh3p-btn",
            title: "Clear every field and start over",
            onclick: () => { this.clearPending = !this.clearPending; this.render(); } },
            "Clear"),
          el("button", { class: "mmh3p-btn" + (this.sidebar ? " primary" : ""),
            title: "Show reference media as a column down the left edge",
            onclick: () => {
              this.sidebar = !this.sidebar;
              try { this.node._mmh3Sidebar = this.sidebar; } catch (e) { /* not fatal */ }
              this.overlay.querySelector(".mmh3p-body")
                .classList.toggle("sidebar", this.sidebar);
              this.railEl.replaceChildren();
              this.closePeek();
              this.render();
            } }, "\u25e7 Sidebar"),
          guideBtn,
          this.modeBar,
          this.prefsButton(),
          el("button", { class: "mmh3p-x",
            onclick: () => this.requestClose() }, "\u2715"),
        ),
        this.modeSends,
        el("div", { class: "mmh3p-body" },
          this.railEl,
          this.formEl,
          el("div", { class: "mmh3p-side" },
            this.previewEl, this.issuesEl,
            el("div", { class: "mmh3p-foot" }, this.statsEl, copyBtn, cancelBtn, saveBtn),
          ),
        ),
      ),
    );

    this.formEl.addEventListener("focusin", (e) => {
      if (e.target.matches("textarea, input[type=text]") &&
          !e.target.dataset.noinsert) this.lastFocus = e.target;
    });
    this.overlay.addEventListener("mousedown", (e) => {
      if (this.prefsOpen && !e.target.closest(".mmh3p-prefwrap")) {
        this.togglePrefs(false);
      }
      if (this._ctxMenu && !e.target.closest(".mmh3p-ctxmenu")) this.closeCtx();
    });

    // Right-click on a selection offers to save it. The browser's own menu
    // is only replaced when there IS a selection in one of our fields, and
    // Copy is included so nothing is taken away.
    this.formEl.addEventListener("contextmenu", (e) => {
      const box = e.target;
      if (!box || typeof box.value !== "string") return;
      const a = box.selectionStart ?? 0;
      const b = box.selectionEnd ?? 0;
      if (b <= a) return;                       // no selection: native menu
      e.preventDefault();
      this.openCtx(e.clientX, e.clientY, box.value.slice(a, b));
    });
    this.formEl.addEventListener("input", () => this.updatePreview());
    // Dropping a rail card onto a textarea inserts the tag where it lands.
    this.formEl.addEventListener("drop", (e) => {
      const t = e.target;
      if (!t.matches?.("textarea, input[type=text]")) return;
      setTimeout(() => {
        this.lastFocus = t;
        this.updatePreview();
      }, 0);
    });
    this.escHandler = (e) => { if (e.key === "Escape") this.close(); };
    window.addEventListener("keydown", this.escHandler);
  }

  clearAll() {
    const mode = this.state.mode;          // you're still working in this mode
    this.state = defaultState();
    this.state.mode = mode;
    // Forget the library entry too, so the next save creates a new prompt
    // rather than quietly renaming the one that was loaded.
    this.libraryId = null;
    this.libraryName = "";
    this.libraryCategory = "";
    this.clearPending = false;
    this.render();
    toast("Prompt cleared \u2014 nothing saved to the node yet");
  }

  clearStrip() {
    return el("div", { class: "mmh3p-clearbar" },
      el("span", { class: "mmh3p-clearmsg" },
        `Clear every field and start a new ${this.state.mode} prompt?`),
      el("span", { class: "mmh3p-clearnote" },
        "The node keeps its current prompt until you save."),
      el("div", { class: "mmh3p-clearactions" },
        el("button", { class: "mmh3p-btn primary",
          onclick: () => this.clearAll() }, "Clear"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.clearPending = false; this.render(); } },
          "Cancel")));
  }

  /** True when the editor holds something the node hasn't been given. */
  isDirty() {
    try { return JSON.stringify(this.state) !== this.openedWith; }
    catch (e) { return false; }
  }

  /** Close, but ask first if there's unsaved work. */
  requestClose() {
    if (!this.prefs.warnUnsaved || !this.isDirty()) { this.close(); return; }
    this.closePending = true;
    this.render();
  }

  prefsButton() {
    const pct = (v) => `${Math.round(v * 100)}%`;
    // Deliberately not live: resizing the window moves this menu with it, so
    // the slider would slide out from under the pointer mid-drag.
    const pending = { windowScale: this.prefs.windowScale,
                      textScale: this.prefs.textScale };
    const inputs = {};
    const outs = {};
    const dirty = () => scaleApply.classList.toggle("primary",
      pending.windowScale !== this.prefs.windowScale ||
      pending.textScale !== this.prefs.textScale);

    const maxFor = (key) => key === "textScale" ? TEXT_SCALE_MAX : SCALE_MAX;

    const slider = (key, label) => {
      const out = el("input", { type: "number", class: "mmh3p-scaleval",
        min: String(Math.round(SCALE_MIN * 100)),
        max: String(Math.round(maxFor(key) * 100)), step: "5",
        value: String(Math.round(pending[key] * 100)),
        onchange: (e) => {
          pending[key] = clampScale(Number(e.target.value) / 100, maxFor(key));
          const shown = Math.round(pending[key] * 100);
          e.target.value = String(shown);
          input.value = String(shown);
          dirty();
        },
        onkeydown: (e) => { if (e.key === "Enter") { e.stopPropagation();
          e.target.blur(); } } });
      const input = el("input", { type: "range", class: "mmh3p-scalerange",
        min: String(Math.round(SCALE_MIN * 100)),
        max: String(Math.round(maxFor(key) * 100)), step: "5",
        value: String(Math.round(pending[key] * 100)),
        oninput: (e) => {
          pending[key] = clampScale(Number(e.target.value) / 100, maxFor(key));
          out.value = String(Math.round(pending[key] * 100));
          dirty();
        } });
      inputs[key] = input;
      outs[key] = out;
      return el("label", { class: "mmh3p-scalerow" },
        el("span", { class: "mmh3p-scalelabel" }, label), input, out,
        el("span", { class: "mmh3p-scalepct" }, "%"));
    };
    const setScale = (w, t) => {
      this.prefs.windowScale = w;
      this.prefs.textScale = t;
      pending.windowScale = w; pending.textScale = t;
      inputs.windowScale.value = String(Math.round(w * 100));
      inputs.textScale.value = String(Math.round(t * 100));
      outs.windowScale.value = String(Math.round(w * 100));
      outs.textScale.value = String(Math.round(t * 100));
      savePrefs(this.prefs);
      this.applyScale();
      scaleApply.classList.remove("primary");
    };
    const scaleApply = el("button", { class: "mmh3p-btn",
      onclick: () => setScale(pending.windowScale, pending.textScale) }, "Apply");
    const scaleReset = el("button", { class: "mmh3p-btn",
      onclick: () => setScale(1, 1) }, "Reset");

    const item = (key, label, hint) => {
      const box = el("input", { type: "checkbox", checked: !!this.prefs[key],
        onchange: (e) => {
          this.prefs[key] = e.target.checked;
          savePrefs(this.prefs);
        } });
      return el("label", { class: "mmh3p-prefitem" }, box,
        el("span", {}, el("span", { class: "mmh3p-preflabel" }, label),
          el("span", { class: "mmh3p-prefhint" }, hint)));
    };
    // Shown so a bug report can name the exact build rather than a version
    // number that may have covered several.
    const version = el("div", { class: "mmh3p-prefversion" }, "version \u2026");
    api.fetchApi("/minimax_h3_plus/capabilities")
      .then((r) => r.json())
      .then((c) => { version.textContent = `Fantastic H3 \u2014 v${c.version || "?"}`; })
      .catch(() => { version.textContent = "version unavailable"; });

    const menu = el("div", { class: "mmh3p-prefmenu" },
      slider("windowScale", "Window size"),
      slider("textScale", "Text size"),
      el("div", { class: "mmh3p-scalefoot" }, scaleReset, scaleApply),
      el("div", { class: "mmh3p-prefsep" }),
      item("closeOnBackdrop", "Click outside to close",
           "Off means only \u2715, Cancel and Escape close the window."),
      item("warnUnsaved", "Warn about unsaved changes",
           "Off means \u2715, Cancel and Escape discard your edits silently."),
      version);
    this.prefsMenu = menu;
    this.prefsCog = el("button", { class: "mmh3p-x", title: "Editor settings",
      onclick: (e) => { e.stopPropagation(); this.togglePrefs(); } }, "\u2699");
    return el("span", { class: "mmh3p-prefwrap" }, this.prefsCog, menu);
  }

  /** Window scale changes the modal's box; text scale zooms its contents. */
  applyScale() {
    const modal = this.overlay?.querySelector(".mmh3p-modal");
    if (!modal) return;
    const w = clampScale(this.prefs.windowScale);
    const t = clampScale(this.prefs.textScale, TEXT_SCALE_MAX);
    modal.style.width = `min(${Math.round(1240 * w)}px, 95vw)`;
    modal.style.height = `min(${Math.round(860 * w)}px, 92vh)`;
    // Font size only. zoom scaled the layout as well, which changed how much
    // fitted rather than how readable it was.
    document.documentElement.style.setProperty("--mmh3-fs", String(t));
  }

  togglePrefs(force) {
    this.prefsOpen = force === undefined ? !this.prefsOpen : force;
    this.prefsMenu?.classList.toggle("on", this.prefsOpen);
    this.prefsCog?.classList.toggle("on", this.prefsOpen);
  }

  closeStrip() {
    return el("div", { class: "mmh3p-clearbar" },
      el("span", { class: "mmh3p-clearmsg" },
        "You have changes the node hasn't been given."),
      el("span", { class: "mmh3p-clearnote" },
        "Discarding keeps the node's last saved prompt."),
      el("div", { class: "mmh3p-clearactions" },
        el("button", { class: "mmh3p-btn primary",
          onclick: () => this.save() }, "Save to node"),
        el("button", { class: "mmh3p-btn mmh3p-danger",
          onclick: () => { this.state = JSON.parse(this.openedWith);
            this.closePending = false; this.close(); } }, "Discard"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.closePending = false; this.render(); } },
          "Keep editing")));
  }

  close() {
    this.closePeek();
    this.closeCtx();
    this.hidePhrasePeek();
    window.removeEventListener("keydown", this.escHandler);
    // Nothing is carried over. Closing without saving discards the edits —
    // which is what Cancel says on the tin. Keeping a draft here made the
    // editor look like it autosaved: reopening showed the changes back even
    // though the node still held the old prompt, and with the unsaved-changes
    // warning switched off there was no moment where you chose either way.
    this.node._mmh3Draft = null;
    this.overlay.remove();
  }

  save() {
    const pw = this.node.widgets?.find((w) => w.name === "prompt_text");
    const sw = this.node.widgets?.find((w) => w.name === "builder_state");
    if (pw) pw.value = generate(this.state);
    if (sw) sw.value = JSON.stringify(this.state);
    this.node._mmh3Draft = null;
    this.closePending = false;
    this.openedWith = JSON.stringify(this.state);
    updateSummary(this.node);
    try {
      this.node.setDirtyCanvas?.(true, true);
      app.graph.setDirtyCanvas(true, true);
    } catch (e) { /* Vue redraws itself */ }
    toast("Saved to node");
    this.close();
  }

  /* ---------- shared UI pieces ---------- */

  ta(obj, key, rows, placeholder) {
    const box = el("textarea", {
      rows, placeholder,
      value: obj[key] ?? "",
      oninput: (e) => { obj[key] = e.target.value; },
    });
    return this.chipField(box);
  }

  /* --- reference tags as chips ------------------------------------- */

  /** Wrap a textarea so <Picture 1> and friends read as chips.
   *
   *  A textarea can't contain elements, so a mirror div renders the same
   *  text underneath with the tags wrapped in spans. The textarea keeps its
   *  own text transparent, which leaves selection, undo, IME and paste
   *  exactly as the browser implements them — a contenteditable rewrite
   *  would put all of that on us. */
  chipField(box) {
    const mirror = el("div", { class: "mmh3p-chipmirror", "aria-hidden": "true" });
    // Order matters: the mirror is painted ON TOP of the textarea so the
    // selection band (drawn by the textarea) sits behind the glyphs instead
    // of covering them. It's click-through, so the textarea still gets every
    // pointer event.
    const wrap = el("div", { class: "mmh3p-chipwrap" }, box, mirror);
    box.classList.add("mmh3p-chiptext");

    const paint = () => {
      const text = box.value || "";
      mirror.replaceChildren();
      let last = 0;
      PAINT_RE.lastIndex = 0;
      let m;
      while ((m = PAINT_RE.exec(text)) !== null) {
        if (m.index > last)
          mirror.append(document.createTextNode(text.slice(last, m.index)));
        mirror.append(...this.paintToken(m[0]));
        last = m.index + m[0].length;
      }
      // The trailing newline keeps the mirror's last line height in step with
      // the textarea's when the text ends mid-line.
      mirror.append(document.createTextNode(text.slice(last) + "\n"));
      syncBox();
    };

    /* A textarea that overflows grows a scrollbar, which narrows its text
       column. The mirror has overflow:hidden and keeps full width, so without
       this its lines wrap later than the real ones and the gap widens down
       the field — the caret drifting further from the glyphs the more you
       write. Platforms differ (macOS overlays them, Linux and Windows often
       don't), so measure rather than assume. */
    const syncBox = () => {
      const bw = box.offsetWidth - box.clientWidth
        - (parseFloat(getComputedStyle(box).borderLeftWidth) || 0)
        - (parseFloat(getComputedStyle(box).borderRightWidth) || 0);
      const gutter = Math.max(0, Math.round(bw));
      const want = `${9 + gutter}px`;
      if (mirror.style.paddingRight !== want) mirror.style.paddingRight = want;
      mirror.scrollTop = box.scrollTop;
      mirror.scrollLeft = box.scrollLeft;
    };

    box.addEventListener("input", paint);
    box.addEventListener("scroll", syncBox);
    // Dragging the resize grip can add or remove the scrollbar.
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(syncBox).observe(box);
    }
    // Hover a chip for its thumbnail. The mirror can't take pointer events
    // (it sits under the textarea), so hit-test the chip boxes directly.
    box.addEventListener("mousemove", (e) => this.chipHover(e, mirror));
    box.addEventListener("mouseleave", () => this.chipLeave());

    this._chipFields = this._chipFields || [];
    this._chipFields.push(paint);
    paint();
    return wrap;
  }

  /** Render one matched token as the spans the mirror shows. */
  paintToken(tok) {
    if (tok.startsWith("<d>")) {
      const inner = tok.slice(3, -4);
      const kids = [el("span", { class: "mmh3p-dmark" }, "<d>")];
      const lang = inner.match(LANG_RE);
      const body = lang ? inner.slice(lang[0].length) : inner;
      if (lang) kids.push(el("span", { class: "mmh3p-dlang" }, lang[1]));
      kids.push(el("span", { class: "mmh3p-dtext" }, body));
      kids.push(el("span", { class: "mmh3p-dmark" }, "</d>"));
      return [el("span", { class: "mmh3p-dblock" }, ...kids)];
    }
    if (tok.startsWith("[Shot")) {
      return [el("span", { class: "mmh3p-reftag shot" }, tok)];
    }
    if (tok.startsWith("(")) {
      return [el("span", { class: "mmh3p-reftag spk", dataset: { tag: tok } }, tok)];
    }
    let cls;
    if (tok.startsWith("<Subject")) {
      cls = this.subjectInfo(tok) ? "subj" : "unknown";
    } else {
      const slot = this.slotFor(tok);
      cls = slot ? (slot.cls || "pic") : "unknown";
    }
    return [el("span", { class: "mmh3p-reftag " + cls, dataset: { tag: tok } }, tok)];
  }

  /** What a <Subject N> chip should show: the first picture its definition
   *  cites, plus every media tag that line mentions. */
  subjectInfo(tag) {
    const defs = this.state?.ref?.subjectDefs || [];
    const line = defs.find((d) => !d.off &&
      (d.text || "").trim().startsWith(tag));
    if (!line) return null;
    const tags = [...new Set((line.text.match(TAG_RE) || [])
      .filter((t) => t !== tag))];

    // A voice reference is usually declared the other way round — the audio's
    // own line names the subject ("<Audio 1> is the voice-timbre reference
    // for <Subject 1> (S1)") — so the attachment has to be read from every
    // other definition that mentions this subject, not just its own.
    const voices = [], speakers = [];
    for (const d of defs) {
      if (d === line || d.off) continue;
      const text = d.text || "";
      if (!text.includes(tag)) continue;
      for (const t of text.match(TAG_RE) || [])
        if (t.startsWith("<Audio") && !tags.includes(t) && !voices.includes(t))
          voices.push(t);
      for (const m of text.matchAll(/\((S\d+(?:\s*,\s*S\d+)*)\)/g))
        if (!speakers.includes(m[0])) speakers.push(m[0]);
    }
    for (const m of (line.text || "").matchAll(/\((S\d+(?:\s*,\s*S\d+)*)\)/g))
      if (!speakers.includes(m[0])) speakers.push(m[0]);

    const slot = tags.map((t) => this.slotFor(t))
      .find((sl) => sl && sl.preview?.url && sl.preview.type === "img")
      || tags.map((t) => this.slotFor(t)).find((sl) => sl && sl.preview?.url);
    return { slot, tags, voices, speakers, line };
  }

  slotFor(tag) {
    if (!this._slotMap || this._slotMapAt !== this.slots)
      this._slotMap = new Map((this.slots || []).map((s) => [s.tag, s]));
    this._slotMapAt = this.slots;
    return this._slotMap.get(tag);
  }

  chipHover(e, mirror) {
    let hit = null;
    for (const chip of mirror.querySelectorAll(".mmh3p-reftag")) {
      const r = chip.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top && e.clientY <= r.bottom) { hit = chip; break; }
    }
    if (!hit) { this.chipLeave(); return; }
    if (this._chipOpenFor === hit.dataset.tag) return;
    this.chipLeave();
    const tag = hit.dataset.tag;
    let slot = null, subject = null;
    if (tag.startsWith("<Subject")) {
      subject = this.subjectInfo(tag);
      if (!subject) return;                  // undefined subject: nothing to show
      slot = subject.slot;
    } else {
      slot = this.slotFor(tag);
      if (!slot || !slot.preview?.url) return;
    }
    this._chipOpenFor = tag;
    this._chipTimer = setTimeout(
      () => this.openChipPeek(hit, slot, tag, subject), 180);
  }

  chipLeave() {
    clearTimeout(this._chipTimer);
    this._chipOpenFor = null;
    if (this._chipPeek) { this._chipPeek.remove(); this._chipPeek = null; }
  }

  /** Small thumbnail beside the chip. Deliberately not interactive: it must
   *  never steal the pointer while you're typing. */
  openChipPeek(chip, slot, tag, subject) {
    const media = !slot ? null
      : slot.preview.type === "video"
      ? el("video", { src: slot.preview.url, muted: true, loop: true,
          autoplay: true, class: "mmh3p-chippeekmedia" })
      : slot.preview.type === "audio"
        ? this.mediaThumb(slot, true)
        : el("img", { src: slot.preview.url, class: "mmh3p-chippeekmedia" });
    const tagRow = (label, list) => list.length
      ? el("span", { class: "mmh3p-chiprow" },
          el("span", { class: "mmh3p-chiplabel" }, label),
          el("span", { class: "mmh3p-chiptags" },
            list.map((t) => {
              const sl = this.slotFor(t);
              return el("span", {
                class: `mmh3p-tagname ${sl ? (sl.cls || "pic") : "unknown"}`,
              }, t);
            })))
      : null;
    const caption = subject
      ? el("div", { class: "mmh3p-chippeekcap col" },
          el("span", { class: "mmh3p-chiprow" },
            el("span", { class: "mmh3p-tagname subj" }, tag),
            subject.speakers.length
              ? el("span", { class: "mmh3p-chipspk" }, subject.speakers.join(" "))
              : null),
          tagRow("cites", subject.tags),
          tagRow("voice", subject.voices),
          (!subject.tags.length && !subject.voices.length)
            ? el("span", { class: "mmh3p-chipnone" }, "no media attached")
            : null)
      : el("div", { class: "mmh3p-chippeekcap" },
          el("span", { class: `mmh3p-tagname ${slot.cls}` }, slot.tag),
          el("span", {}, slot.source || ""));
    const box = el("div", { class: "mmh3p-chippeek" }, media, caption);
    const r = chip.getBoundingClientRect();
    box.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
    box.style.top = `${r.bottom + 6}px`;
    document.body.append(box);
    // Flip above the chip when there's no room below.
    const bb = box.getBoundingClientRect();
    if (bb.bottom > window.innerHeight - 8)
      box.style.top = `${Math.max(8, r.top - bb.height - 6)}px`;
    this._chipPeek = box;
  }


  /* Waveforms make audio identifiable at a glance; a generic mic icon does not.
     Decoded once per URL and cached for the session. */
  static waveCache = new Map();

  drawWave(canvas, url) {
    const cached = Editor.waveCache.get(url);
    const paint = (peaks) => {
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#b48ce8";
      const n = peaks.length;
      for (let x = 0; x < w; x++) {
        const v = peaks[Math.floor((x / w) * n)] || 0;
        const bar = Math.max(1, v * (h - 2));
        ctx.fillRect(x, (h - bar) / 2, 1, bar);
      }
    };
    if (cached) { if (cached.then) cached.then(paint).catch(() => {}); else paint(cached); return; }
    const job = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => new (window.AudioContext || window.webkitAudioContext)()
        .decodeAudioData(buf))
      .then((audio) => {
        const data = audio.getChannelData(0);
        const buckets = 160, step = Math.floor(data.length / buckets) || 1;
        const peaks = [];
        for (let i = 0; i < buckets; i++) {
          let peak = 0;
          for (let j = 0; j < step; j += 8) {
            const v = Math.abs(data[i * step + j] || 0);
            if (v > peak) peak = v;
          }
          peaks.push(peak);
        }
        Editor.waveCache.set(url, peaks);
        return peaks;
      });
    Editor.waveCache.set(url, job);
    job.then(paint).catch(() => Editor.waveCache.delete(url));
  }

  /** Whether the current mode can use this reference at all. */
  usable(slot) {
    const cap = MODE_CAPACITY[this.state.mode] || {};
    return (cap[slot.kind] || 0) >= slot.idx;
  }

  modeNote(slot) {
    const cap = MODE_CAPACITY[this.state.mode] || {};
    const limit = cap[slot.kind] || 0;
    if (limit === 0)
      return `${this.state.mode} has no ${slot.kind.toLowerCase()} references — ` +
        "this is not sent to the model.";
    return `${this.state.mode} uses only ${slot.kind} 1` +
      (limit > 1 ? `\u2013${limit}` : "") + " — this is not sent to the model.";
  }

  citationCount(tag) {
    if (this._citeText == null) this._citeText = generate(this.state);
    const esc = tag.replace(/[<>]/g, (c) => "\\" + c);
    return (this._citeText.match(new RegExp(esc, "g")) || []).length;
  }

  /** The thumbnail for a reference, reused across renders.
   *
   *  render() rebuilds the whole form, so a fresh <video> per render meant the
   *  clip reloaded and blinked every time anything redrew — switching a section
   *  off being the obvious one. Handing back the *same* element instead makes
   *  the rebuild a DOM move, which browsers do not treat as a new load, so the
   *  frame on screen survives. Keyed on what the element actually shows, so a
   *  clip that changes file still gets a new one. */
  mediaThumb(s, big) {
    const type = s.preview?.type || "none";
    // Cards only. The `big` variants are built on hover for the peek panels,
    // which are never rebuilt by render() and so never flash — and two peeks
    // can be open at once, where sharing one element would move it out of the
    // first. Fall back to the tag when there is no URL, or two previewless
    // slots would share one canvas.
    const key = big ? null : `${type}|${s.preview?.url || s.tag}`;
    this._thumbs = this._thumbs || new Map();
    const cached = key && this._thumbs.get(key);
    if (cached) return cached;

    let node;
    if (type === "img") {
      node = el("img", { class: "mmh3p-thumb", src: s.preview.url });
    } else if (type === "video") {
      node = el("video", { class: "mmh3p-thumb", src: s.preview.url, muted: true,
        loop: true, preload: "metadata",
        onmouseenter: (e) => e.target.play().catch(() => {}),
        onmouseleave: (e) => e.target.pause() });
    } else {
      // Drawing-buffer size, kept in step with .mmh3p-card / .mmh3p-peek in the
      // stylesheet so the waveform isn't drawn at the wrong resolution and
      // stretched by the browser.
      node = el("canvas", { class: "mmh3p-thumb mmh3p-wave",
        width: big ? 495 : 124, height: big ? 135 : 80 });
      if (s.preview?.url) setTimeout(() => this.drawWave(node, s.preview.url), 0);
    }
    // A cropped reference shows its kept region on the card, so the chip
    // matches what the model will actually receive.
    node = cropFrame(node, s.item?.crop);
    if (key) this._thumbs.set(key, node);
    return node;
  }

  /* --- hover peek ------------------------------------------------- */

  peekFor(card, s) {
    let timer = null;
    const open = () => {
      this.closePeek();
      const box = el("div", { class: "mmh3p-peek" });
      const media = s.preview?.type === "video"
        ? el("video", { src: s.preview.url, controls: true, autoplay: true,
            muted: true, loop: true, class: "mmh3p-peekmedia" })
        : s.preview?.type === "audio"
          ? el("div", {}, this.mediaThumb(s, true),
              el("audio", { src: s.preview.url, controls: true,
                style: { width: "100%", height: "28px" } }))
          : el("img", { src: s.preview?.url, class: "mmh3p-peekmedia" });
      const cites = this.citationCount(s.tag);
      box.append(peekCrop(media, s.item?.crop),
        el("div", { class: "mmh3p-peekmeta" },
          el("div", { class: "mmh3p-peekrow" },
            el("span", { class: `mmh3p-tagname ${s.cls}` }, s.tag),
            el("span", { class: "mmh3p-peekcite" + (cites ? "" : " zero") },
              cites ? `cited ${cites}\u00d7` : "not cited")),
          el("div", { class: "mmh3p-peeksrc" },
            s.source + (s.note ? ` \u2022 ${s.note.replace(/[<>]/g, "")}` : ""))));

      const r = card.getBoundingClientRect();
      // Beside the thumbnail in the sidebar view, below it otherwise. Both
      // clamp to the viewport: .mmh3p-peek is up to 540px wide.
      if (this.sidebar) {
        box.style.left = `${Math.max(0, Math.min(r.right + 8, window.innerWidth - 550))}px`;
        box.style.top = `${Math.max(4, Math.min(r.top,
          window.innerHeight - box.offsetHeight - 8))}px`;
      } else {
        box.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - 550))}px`;
        box.style.top = `${r.bottom + 6}px`;
      }
      box.addEventListener("mouseenter", () => clearTimeout(this._peekClose));
      box.addEventListener("mouseleave", () => this.closePeek());
      document.body.append(box);
      this._peek = box;
    };
    card.addEventListener("mouseenter", () => {
      clearTimeout(this._peekClose);
      timer = setTimeout(open, 250);
    });
    card.addEventListener("mouseleave", () => {
      clearTimeout(timer);
      this._peekClose = setTimeout(() => this.closePeek(), 220);
    });
  }

  closePeek() {
    if (this._peek) { this._peek.remove(); this._peek = null; }
  }

  /* --- pinning ----------------------------------------------------- */

  /** The tag the caret currently sits inside, if any. */
  /* --- the rail ---------------------------------------------------- */

  /** The panel backing this editor's media, if there is one. */
  ownerPanel() {
    return this.slots.find((s) => s.panel)?.panel
      || mediaSource(this.node)?.owner?._mmlPanel
      || null;
  }

  /** What the current mode could still take, by kind. Mirrors the node's empty
   *  slots: an offer to add media only where the mode can actually use it. */
  roomLeft(panel) {
    const cap = MODE_CAPACITY[this.state.mode] || {};
    const held = { Picture: 0, Video: 0, Audio: 0 };
    for (const it of panel.items || []) {
      if (!isOn(it)) continue;
      if (it.kind === "picture") held.Picture += 1;
      else if (it.kind === "video") held.Video += 1;
      else if (it.kind === "audio") held.Audio += 1;
    }
    const kinds = [];
    for (const [label, kind] of [["Picture", "picture"], ["Video", "video"],
                                 ["Audio", "audio"]]) {
      // Both gates have to agree: the mode's own ceiling, and the loader's
      // real capacity check (which also counts split soundtracks).
      if ((cap[label] || 0) > held[label] && !panel.capacityError(kind, "x"))
        kinds.push(kind);
    }
    if (cap.total && fileCount(panel.items) >= cap.total) return [];
    return kinds;
  }

  /** Dashed tile at the end of the rail: click, drop or right-click-paste to
   *  add media without leaving the editor. Delegates every path to the panel,
   *  so uploads and budget refusals behave exactly as they do on the node. */
  dropTile() {
    const panel = this.ownerPanel();
    if (!panel) return null;
    const kinds = this.roomLeft(panel);
    if (!kinds.length) return null;

    const after = () => { this.slots = getRefSlots(this.node); this.render(); };
    const tile = el("div", {
      class: "mmh3p-card mmh3p-drop",
      title: `Add ${kinds.join(" / ")} \u2014 click to browse, drop a file, `
        + `or right-click to paste`,
      onclick: () => panel.picker.click(),
      oncontextmenu: (e) => panel.slotMenu(e, null),
    }, el("span", { class: "mmh3p-dropplus" }, "+"),
       el("span", { class: "mmh3p-dropkinds" }, kinds.join(" / ")));

    tile.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      tile.classList.add("hot");
    });
    tile.addEventListener("dragleave", () => tile.classList.remove("hot"));
    tile.addEventListener("drop", async (e) => {
      tile.classList.remove("hot");
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault(); e.stopPropagation();
      await panel.add([...e.dataTransfer.files]);
      after();
    });
    // The panel commits on its own (paste, upload), so mirror the result back
    // into the editor. Wrapped once per panel — re-wrapping every render would
    // nest the calls — and pointed at whichever editor is currently open.
    if (!panel._mmh3Hooked) {
      panel._mmh3Hooked = true;
      const base = panel.commit.bind(panel);
      panel.commit = () => { base(); panel._mmh3Refresh?.(); };
    }
    panel._mmh3Refresh = () => { if (this.overlay?.isConnected) after(); };
    return tile;
  }

  refChips() {
    const live = this.slots.filter((s) => s.tag);
    const tile = this.dropTile();
    if (!live.length) {
      return [tile, el("span", { class: "hint" },
        "No reference media on this node yet \u2014 add some in the panel on the "
        + "node, or with the + tile here.")].filter(Boolean);
    }
    const cards = live.map((s) => {
      const ok = this.usable(s);
      const cites = ok ? this.citationCount(s.tag) : 0;
      const card = el("div", {
        class: `mmh3p-card ${s.cls}` + (ok ? "" : " unusable")
          + (s.joinRight ? " joinR" : "") + (s.joinLeft ? " joinL" : ""),
        draggable: ok,
        title: ok ? `${s.tag} \u2022 ${s.source}` : this.modeNote(s),
        onclick: () => ok ? this.insert(s.tag) : toast(this.modeNote(s), 3200),
        ondragstart: (e) => {
          if (!ok) { e.preventDefault(); return; }
          e.dataTransfer.setData("text/plain", s.tag);
          // A private type so a drop on another card is read as a reorder,
          // while a drop on a textarea still inserts the tag.
          if (s.item) e.dataTransfer.setData(RAIL_MIME, s.tag);
          e.dataTransfer.effectAllowed = "copyMove";
          this.closePeek();
        },
      },
        this.mediaThumb(s),
        // Top-right of the card, over the thumbnail: the count is a property of
        // the reference rather than of the tag name it used to sit beside, and
        // the corner keeps it readable as the bar fills with tools.
        ok
          ? el("span", { class: "mmh3p-cite" + (cites ? "" : " zero"),
              title: cites ? `cited ${cites}\u00d7 in the prompt` : "not cited yet" },
              cites || "\u2013")
          : el("span", { class: "mmh3p-cite off", title: this.modeNote(s) },
              "\u2298"),
        el("div", { class: "mmh3p-cardbar" },
          el("span", { class: `mmh3p-tagname ${s.cls}` }, `${s.kind} ${s.idx}`),
          this.cardTools(s)),
        s.note && s.note !== "standalone"
          ? el("span", { class: "mmh3p-cardnote" },
              "\u266a\u2192V" + (s.note.match(/\d+/) || [""])[0])
          : null);
      if (s.item && s.panel) this.railReorder(card, s);
      if (ok) this.peekFor(card, s);
      return card;
    });
    // Trailing "+" tile. dropTile() returns null once the mode has no room
    // left \u2014 roomLeft() gates on the mode's own per-kind ceiling, the loader's
    // capacity check and the total \u2014 so it shows only when it is relevant.
    return tile ? [...cards, tile] : cards;
  }

  /** The node tile's own per-clip controls, on the editor's rail: the trim /
   *  crop editor and the on/off switch. Only for media this editor can reach
   *  live \u2014 media wired in through the individual inputs has no item behind
   *  it to edit. */
  cardTools(s) {
    const after = () => {
      // The panel owns the state; re-read it so the rail, the pins and the
      // validation all reflect the edit.
      this.slots = getRefSlots(this.node);
      this.render();
    };
    const tools = [];

    if (s.item && s.panel && !s.joinRight) {
      const still = s.item.kind === "picture";
      tools.push(el("span", {
        class: "mmh3p-cardtool" + (s.item.trim || s.item.crop || s.item.rotate
          || s.item.mirror || s.item.resize ? " on" : ""),
        title: still ? "Crop, rotate or mirror this picture"
                     : "Trim this clip, or crop the frame",
        onclick: (e) => {
          e.stopPropagation();
          this.closePeek();
          const modal = new TrimModal(s.panel, s.item);
          // Every exit runs through close(), so wrapping the instance's copy
          // catches Apply, Cancel and Escape alike.
          const shut = modal.close.bind(modal);
          modal.close = () => { shut(); after(); };
        },
      }, still ? "\u25a3" : "\u2702"));

      tools.push(el("span", {
        class: "mmh3p-cardtool mmh3p-rmtool",
        title: `Remove ${s.item.name} from the node`,
        onclick: (e) => {
          e.stopPropagation();
          this.closePeek();
          s.panel.remove(s.item);
          after();
        },
      }, "\u2715"));
    }

    return tools.length ? el("div", { class: "mmh3p-cardtools" }, ...tools) : null;
  }

  /** Drag one rail card onto another to reorder the underlying media. */
  railReorder(card, s) {
    card.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes(RAIL_MIME)) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("mmh3p-dropinto");
    });
    card.addEventListener("dragleave", () => card.classList.remove("mmh3p-dropinto"));
    card.addEventListener("drop", (e) => {
      card.classList.remove("mmh3p-dropinto");
      if (!e.dataTransfer.types.includes(RAIL_MIME)) return;
      e.preventDefault(); e.stopPropagation();
      const tag = e.dataTransfer.getData(RAIL_MIME);
      const from = this.slots.find((x) => x.tag === tag);
      if (!from?.item || from.item === s.item) return;
      const items = s.panel.items;
      s.panel.move(items.indexOf(from.item), items.indexOf(s.item));
      this.slots = getRefSlots(this.node);
      this.render();
    });
  }

  /** The "(style)" dropdown: picking one inserts it at the caret and resets.
   *  Shared by the toolbar and, in REF, the style-opening heading. */
  styleSelect() {
    const sel = el("select", {},
      [el("option", { value: "" }, "(style)"),
        ...STYLES.map((s) => el("option", { value: s }, s))]);
    sel.addEventListener("change", () => {
      if (sel.value) { this.insert(sel.value + ", "); sel.value = ""; }
    });
    // Fitted after its own handler, which resets the value — registering first
    // would measure the style just picked, then miss the reset back to "(style)".
    autoFitSelect(sel);
    return sel;
  }

  toolBar(extraChips = []) {
    const camMove = autoFitSelect(el("select", {},
      CAMERA_MOVES.map(([k]) => el("option", { value: k }, k))));
    const camAmp = autoFitSelect(el("select", {},
      ["(amplitude)", "with small amplitude", "with large amplitude"]
        .map((v, i) => el("option", { value: i ? v : "" }, v))));
    const camSpd = autoFitSelect(el("select", {},
      ["(speed)", "at slow speed", "at fast speed"]
        .map((v, i) => el("option", { value: i ? v : "" }, v))));
    const camBtn = el("button", { class: "mmh3p-btn", onclick: () => {
      const base = CAMERA_MOVES.find(([k]) => k === camMove.value)[1];
      this.insert([base, camAmp.value, camSpd.value].filter(Boolean).join(" "));
    }}, "+ Camera");

    const lang = el("select", {}, LANGS.map((l) => el("option", { value: l }, l)));

    const timeIn = el("input", {
      type: "number", min: "0", max: "900", step: "0.1", value: "3.0",
      title: "Cut time in seconds \u2014 scroll or use the arrows to step by 0.1s",
      dataset: { noinsert: "1" }, style: { width: "84px" },
    });
    // Let the wheel step the value without scrolling the form behind it.
    timeIn.addEventListener("wheel", (e) => {
      if (document.activeElement !== timeIn) return;
      e.preventDefault();
      const v = parseFloat(timeIn.value) || 0;
      const next = Math.max(0, Math.round((v + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10);
      timeIn.value = next.toFixed(1);
    }, { passive: false });

    const shotBtn = el("button", { class: "mmh3p-btn",
      title: "Insert the next [Shot N]. Shots after the first use the cut time " +
        "from the stepper, formatted as At MM:SS.mmm",
      onclick: () => {
        const field = this.lastFocus;
        const t = field?.value || "";
        const n = Math.max(0, ...[...t.matchAll(/\[Shot (\d+)\]/g)].map((m) => +m[1])) + 1;
        // "appears in ..." fields want a bare shot label, not a cut scaffold.
        if (field?.dataset?.shotlist) {
          const sep = t.trim() && !/[\s,]$/.test(t.slice(0, field.selectionStart ?? t.length))
            ? ", " : "";
          this.insert(`${sep}[Shot ${n}]`);
          return;
        }
        if (n === 1) { this.insert("[Shot 1] ", { newline: true }); return; }
        const sec = parseFloat(timeIn.value);
        if (!isFinite(sec) || sec <= 0) {
          toast("Set a cut time above 0 first");
          timeIn.focus();
          return;
        }
        this.insert(`[Shot ${n}] At ${fmtTimestamp(sec)}, the shot cuts to `,
          { newline: true });
        // Advance the stepper past the cut just placed, ready for the next one.
        timeIn.value = (Math.round((sec + 3) * 10) / 10).toFixed(1);
      } }, "+ Shot");
    timeIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); shotBtn.click(); }
    });

    // REF puts this in its style-opening heading instead, where the wording it
    // writes actually belongs; every other mode has no such section, so the
    // toolbar keeps it.
    const styleSel = this.state.mode === "REF" ? null : this.styleSelect();

    const chips = el("div", { class: "mmh3p-chips" }, this.refChips());
    if (this.sidebar) {
      // Same strip, different column: it stacks into one column by CSS, so
      // the cards, their drag-reorder and their tools all carry over.
      this.railEl.replaceChildren(
        el("div", { class: "mmh3p-railhead" }, "media"), chips);
    }
    return el("div", { class: "mmh3p-chipbar" },
      // The sidebar labels its column "media"; the inline strip gets the same
      // heading so the section is named either way round.
      this.sidebar ? null : el("div", { class: "mmh3p-railhead" }, "media"),
      this.sidebar ? null : chips,
      extraChips.length
        ? el("div", { class: "mmh3p-subjrow" }, extraChips) : null,
      el("div", { class: "mmh3p-tools" },
        timeIn, shotBtn, camMove, camAmp, camSpd, camBtn, styleSel),
      this.dialogueRow(lang),
      this.phraseRow());
  }

  /* --- phrases: reusable fragments, saved server-side ---------------- */

  async loadPhrases() {
    this.phraseRouteMissing = false;
    try {
      const resp = await api.fetchApi("/minimax_h3_plus/phrases");
      if (!resp.ok) {
        this.phraseRouteMissing = resp.status === 404 || resp.status === 405;
        throw new Error("unavailable");
      }
      const data = await resp.json();
      this.phrases = Array.isArray(data.phrases) ? data.phrases : [];
      this.phraseCats = data.categories || [];
    } catch (e) {
      this.phrases = [];
      this.phraseCats = [];
    }
    this.drawPhrases();
  }

  /** Category picker, phrase picker, insert, and add/remove. */
  phraseRow() {
    this.phrases = this.phrases || [];
    this.phraseCats = this.phraseCats || [];
    this.phraseCatEl = el("select", { class: "mmh3p-phrasecat",
      title: "Filter phrases by category",
      onchange: () => { this.phraseCat = this.phraseCatEl.value;
        this.drawPhrases(); } });
    this.phraseEl = el("select", { class: "mmh3p-phrasesel",
      onchange: () => this.showPhrasePeek(),
      onmouseenter: () => this.showPhrasePeek(),
      onmouseleave: () => this.hidePhrasePeek(),
      // Opening the list would leave the popover floating over it.
      onmousedown: () => this.hidePhrasePeek(),
      onblur: () => this.hidePhrasePeek() });
    this.phraseBar = el("div", { class: "mmh3p-tools mmh3p-phraserow" });
    this.drawPhraseBar();
    this.drawPhrases();
    this.loadPhrases();
    return this.phraseBar;
  }

  /** The row in its normal state, or asking to confirm a delete. Confirming
   *  inline keeps it with the rest of the pack — no browser dialogs. */
  drawPhraseBar() {
    if (!this.phraseBar) return;
    if (this.phraseConfirm) {
      const p = this.phraseConfirm;
      this.phraseBar.replaceChildren(
        el("span", { class: "mmh3p-toollabel" }, "Phrases:"),
        el("span", { class: "mmh3p-phrasewarn" }, `Delete \u201c${p.name}\u201d?`),
        // The normal row relies on the picker to take up the slack; this one
        // has no flexible control, so it needs a growing spacer of its own.
        el("span", { class: "mmh3p-toolgrow" }),
        el("button", { class: "mmh3p-btn mmh3p-danger",
          onclick: () => this.confirmDeletePhrase() }, "Delete"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.phraseConfirm = null; this.drawPhraseBar(); } },
          "Cancel"));
      return;
    }
    this.phraseBar.replaceChildren(
      el("span", { class: "mmh3p-toollabel" }, "Phrases:"),
      this.phraseCatEl, this.phraseEl,
      el("button", { class: "mmh3p-btn",
        title: "Insert the selected phrase at the caret",
        onclick: () => this.insertPhrase() }, "+ Phrase"),
      el("span", { class: "mmh3p-toolspace" }),
      el("button", { class: "mmh3p-btn",
        title: "Save the selected text as a phrase",
        onclick: () => this.newPhrase() }, "+ New"),
      el("button", { class: "mmh3p-btn mmh3p-danger",
        title: "Delete the selected phrase",
        onclick: () => this.deletePhrase() }, "Delete"));
  }

  drawPhrases() {
    if (!this.phraseCatEl) return;
    this.hidePhrasePeek();
    if (this.phraseConfirm) return;      // the row is asking something
    const cats = this.phraseCats || [];
    const cat = this.phraseCat || "";
    this.phraseCatEl.replaceChildren(
      el("option", { value: "", selected: cat === "" }, "all categories"),
      ...cats.map((c) => el("option", { value: c, selected: c === cat }, c)));
    const list = (this.phrases || [])
      .filter((p) => !cat || (p.category || "") === cat);
    this.phraseEl.replaceChildren(
      ...(list.length
        ? list.map((p) => el("option",
            { value: p.id, title: p.text.slice(0, 300) }, p.name))
        : [el("option", { value: "" }, this.phraseRouteMissing
            ? "restart ComfyUI to use phrases"
            : "no phrases saved")]));
    const empty = list.length === 0;
    this.phraseEl.disabled = empty;
    [...(this.phraseBar?.querySelectorAll("button") || [])].forEach((b) => {
      if (b.textContent === "+ Phrase" || b.textContent === "Delete") {
        b.disabled = empty;
      }
    });
  }

  /** Show the whole phrase on hover — the picker only has room for its name,
   *  and the text is the part you actually need to check before inserting. */
  showPhrasePeek() {
    this.hidePhrasePeek();
    const p = this.selectedPhrase();
    if (!p || !p.text) return;
    const box = el("div", { class: "mmh3p-phrasepeek" },
      el("div", { class: "mmh3p-phrasepeekhead" },
        el("span", {}, p.name),
        p.category ? el("span", { class: "mmh3p-phrasepeekcat" }, p.category) : null),
      el("div", { class: "mmh3p-phrasepeektext" }, p.text));
    document.body.append(box);
    const r = this.phraseEl.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - b.width - 8))}px`;
    // Prefer above the picker, since the rows below it are the editor body.
    box.style.top = r.top - b.height - 6 >= 8
      ? `${r.top - b.height - 6}px`
      : `${r.bottom + 6}px`;
    this._phrasePeek = box;
  }

  hidePhrasePeek() {
    this._phrasePeek?.remove();
    this._phrasePeek = null;
  }

  selectedPhrase() {
    const id = this.phraseEl?.value;
    return (this.phrases || []).find((p) => p.id === id) || null;
  }

  insertPhrase() {
    const p = this.selectedPhrase();
    if (!p) return;
    // A phrase saved from a multi-line selection would otherwise carry cuts
    // into the description, since the model reads a line break as a new shot.
    const flat = p.text.replace(/\s*\n+\s*/g, " ").trim();
    this.insert(flat);
    if (flat !== p.text.trim()) {
      toast("Line breaks in that phrase were flattened \u2014 they read as " +
            "shot cuts", 4500);
    }
  }

  closeCtx() {
    this._ctxMenu?.remove();
    this._ctxMenu = null;
  }

  openCtx(x, y, text) {
    this.closeCtx();
    const item = (label, fn) => el("div", { class: "mmh3p-ctxitem",
      onclick: () => { this.closeCtx(); fn(); } }, label);
    const menu = el("div", { class: "mmh3p-ctxmenu" },
      item("Save selection as phrase\u2026", () => this.phraseDialog(text)),
      item("Copy", async () => {
        const ok = await copyText(text);
        if (!ok) toast("Couldn't reach the clipboard", 4000);
      }));
    document.body.append(menu);
    // Keep it on screen when the click lands near an edge.
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
    this._ctxMenu = menu;
  }

  /** Text currently selected in a field of this editor, if any. */
  selectedText() {
    const box = document.activeElement && this.overlay.contains(document.activeElement)
      ? document.activeElement : this.lastFocus;
    if (!box || typeof box.value !== "string") return "";
    const a = box.selectionStart ?? 0;
    const b = box.selectionEnd ?? 0;
    return b > a ? box.value.slice(a, b) : "";
  }

  newPhrase() {
    this.phraseDialog(this.selectedText());
  }

  /** Compose a phrase. Opens prefilled from a selection, or empty and focused
   *  so there's always somewhere to type — reaching for the whole field when
   *  nothing was selected surprised people. */
  phraseDialog(initial) {
    const text = el("textarea", { rows: 5, class: "mmh3p-phrasetext",
      placeholder: "The wording to save\u2026" });
    text.value = initial || "";
    const name = el("input", { type: "text", placeholder: "Name",
      value: (initial || "").trim().slice(0, 40) });

    const known = [...(this.phraseCats || [])];
    const catNew = el("input", { type: "text", placeholder: "New category name",
      style: { display: "none" } });
    const cat = el("select", { class: "mmh3p-savecat",
      onchange: () => {
        const isNew = cat.value === "\u0000new";
        catNew.style.display = isNew ? "" : "none";
        if (isNew) setTimeout(() => catNew.focus(), 0);
      } },
      el("option", { value: "" }, "No category"),
      known.map((c) => el("option",
        { value: c, selected: c === this.phraseCat }, c)),
      el("option", { value: "\u0000new" }, "(new category\u2026)"));

    const close = () => {
      window.removeEventListener("keydown", onKey);
      overlay.remove();
    };
    const commit = () => {
      const body = text.value.trim();
      if (!body) { text.focus(); toast("The phrase is empty", 3000); return; }
      if (!name.value.trim()) { name.focus(); toast("Give it a name", 3000); return; }
      this.savePhrase({
        name: name.value.trim(),
        category: (cat.value === "\u0000new" ? catNew.value : cat.value).trim(),
        text: body,
      });
      close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
    };
    window.addEventListener("keydown", onKey);

    const overlay = el("div", { class: "mmh3p-overlay mmh3p-phraseover" },
      el("div", { class: "mmh3p-phrasemodal" },
        el("div", { class: "mmh3p-head" },
          el("div", { class: "mmh3p-title" }, "Save a phrase"),
          el("button", { class: "mmh3p-x", onclick: close }, "\u2715")),
        el("div", { class: "mmh3p-phrasebody" },
          el("label", {}, "Phrase"), text,
          el("div", { class: "mmh3p-saverow" }, name, cat, catNew)),
        el("div", { class: "mmh3p-phrasefoot" },
          el("span", { class: "mmh3p-clearnote" },
            "Ctrl+Enter saves \u00b7 Esc closes"),
          el("div", { class: "mmh3p-clearactions" },
            el("button", { class: "mmh3p-btn primary", onclick: commit }, "Save"),
            el("button", { class: "mmh3p-btn", onclick: close }, "Cancel")))));
    document.body.append(overlay);
    (initial ? name : text).focus();
  }

  async savePhrase(entry) {
    if (!entry.name) { toast("Give the phrase a name", 3500); return; }
    try {
      const resp = await api.fetchApi("/minimax_h3_plus/phrases/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || routeError(resp, "save failed"));
      this.phraseCat = entry.category || this.phraseCat;
      await this.loadPhrases();
      toast(`Saved "${entry.name}"`);
    } catch (e) {
      toast(`Couldn't save the phrase: ${e.message}`, 5000);
    }
  }

  deletePhrase() {
    const p = this.selectedPhrase();
    if (!p) return;
    this.hidePhrasePeek();
    this.phraseConfirm = p;
    this.drawPhraseBar();
  }

  async confirmDeletePhrase() {
    const p = this.phraseConfirm;
    this.phraseConfirm = null;
    this.drawPhraseBar();
    if (!p) return;
    try {
      const resp = await api.fetchApi("/minimax_h3_plus/phrases/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || routeError(resp, "delete failed"));
      await this.loadPhrases();
      toast(`Deleted "${p.name}"`);
    } catch (e) {
      toast(`Couldn't delete the phrase: ${e.message}`, 5000);
    }
  }

  /** Speaker IDs already used in the prompt, in numeric order. */
  usedSpeakers() {
    const text = JSON.stringify(this.state || {});
    const found = new Set();
    for (const m of text.matchAll(/\((S\d+(?:\s*,\s*S\d+)*)\)/g)) {
      for (const id of m[1].split(",")) found.add(id.trim());
    }
    return [...found].sort((a, b) => (+a.slice(1)) - (+b.slice(1)));
  }

  /** Dialogue controls: language, one button per speaker already in use plus
   *  the next unused ID, a voiceover toggle, and the two continuity markers.
   *  Speaker IDs follow the target video's speaking order, so offering a
   *  fixed S1-S4 would invent numbers the prompt has no use for. */
  dialogueRow(lang) {
    const used = this.usedSpeakers();
    const next = `S${used.length ? Math.max(...used.map((s) => +s.slice(1))) + 1 : 1}`;

    const vo = el("button", {
      class: "mmh3p-btn" + (this.voiceover ? " primary" : ""),
      title: "Off-screen voiceover. While on, inserted lines use the guide's " +
             "exact phrasing and append the lips-closed clause, which is " +
             "required on every voiceover line.",
      onclick: () => { this.voiceover = !this.voiceover; this.render(); },
    }, "\u{1F399} voiceover");

    const line = (id) => {
      const said = this.voiceover
        ? `(${id}) says in an off-screen voiceover: `
        : `(${id}) says: `;
      const tail = this.voiceover
        ? " while their lips remain completely closed."
        : "";
      // Deliberately NOT on its own line: the model reads a line break as a
      // shot boundary, so only [Shot N] may introduce one. Dialogue joins the
      // description it belongs to.
      return `${said}<d>[${lang.value}] </d>${tail}`;
    };

    const spkBtn = (id, isNew) => el("button", {
      class: "mmh3p-btn" + (isNew ? " ghost" : ""),
      title: isNew
        ? `Add ${id} \u2014 the next speaker in the video's speaking order`
        : `Insert a line for ${id}`,
      onclick: () => this.insert(line(id)),
    }, isNew ? `+ (${id})` : `(${id})`);

    const pair = used.length >= 2
      ? el("button", { class: "mmh3p-btn",
          title: "Two speakers vocalising together",
          onclick: () => this.insert(line(`${used[0]},${used[1]}`)) },
          `(${used[0]},${used[1]})`)
      : null;

    return el("div", { class: "mmh3p-tools mmh3p-dialogrow" },
      el("span", { class: "mmh3p-toollabel" }, "Dialogue:"),
      lang,
      ...used.map((id) => spkBtn(id, false)),
      spkBtn(next, true),
      pair,
      vo,
      el("span", { class: "mmh3p-toolsep" }),
      el("button", { class: "mmh3p-btn",
        title: "A line crossing a cut. Use it twice \u2014 once at the end of " +
               "the pre-cut half, once at the start of the post-cut half \u2014 " +
               "and say the audio continues.",
        onclick: () => this.insert("<scenetrans>") }, "\u2933 scenetrans"),
      el("button", { class: "mmh3p-btn",
        title: "Speech truncated by the end of the video",
        onclick: () => this.insert("<cutoff>") }, "\u2301 cutoff"));
  }

  durationRow() {
    const frames = snapLength(this.state.duration);
    const hint = el("span", { class: "hint" },
      `snaps to ${fmtSS(frames / 24)} s \u2022 ${frames} frames (17k+5 grid @ 24fps) \u2014 ` +
      "use this value for the native node's length");
    const input = el("input", {
      type: "number", min: "0.2", max: "15", step: "0.1", style: { width: "90px" },
      value: this.state.duration,
      oninput: (e) => {
        this.state.duration = parseFloat(e.target.value) || 5;
        const f = snapLength(this.state.duration);
        hint.textContent =
          `snaps to ${fmtSS(f / 24)} s \u2022 ${f} frames (17k+5 grid @ 24fps) \u2014 ` +
          "use this value for the native node's length";
      },
    });
    return el("div", { class: "mmh3p-sec" },
      el("label", {}, "Video end time (s) \u2192 becomes S.SS in the instruction line"),
      el("div", { class: "mmh3p-row" }, input, hint));
  }

  naButton(obj, key) {
    return el("button", { class: "mmh3p-btn mmh3p-secbtn",
      title: `Mark ${key === "music" ? "non_diegetic_music" : "overall_soundscape"} `
        + "as deliberately empty",
      onclick: (e) => {
        const box = e.target.closest(".mmh3p-sec").querySelector("textarea");
        if (box) {
          box.value = "N/A";
          // Let the field's own handlers run: they update the state and
          // repaint the chip mirror. Assigning .value fires nothing.
          box.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          obj[key] = "N/A";
        }
        this.updatePreview();
      } }, "N/A");
  }

  /* ---------- mode renderers ---------- */

  render() {
    this._citeText = null;
    const scroll = this.formEl.scrollTop;
    [...this.modeBar.children].forEach((b, i) =>
      b.classList.toggle("on", MODES[i].id === this.state.mode));
    this._slotMap = null;                 // slots may have changed
    (this._chipFields || []).forEach((paint) => { try { paint(); } catch (e) {} });
    this.modeSends.textContent = MODE_SENDS[this.state.mode] || "";
    this.modeSends.classList.toggle("gated", this.state.mode !== "REF");
    this.formEl.replaceChildren();
    this.slots = getRefSlots(this.node);
    if (this.state.mode === "REF") this.renderRef();
    else this.renderBase();
    if (this.closePending) {
      this.formEl.prepend(this.closeStrip());
      this.formEl.scrollTop = 0;
    } else if (this.clearPending) {
      this.formEl.prepend(this.clearStrip());
      this.formEl.scrollTop = 0;
    } else this.formEl.scrollTop = scroll;
    this.updatePreview();
  }

  renderBase() {
    this._paintSubjChips = null;
    const s = this.state;
    const f = this.formEl;
    f.append(this.toolBar());

    const modeHints = {
      T2VA: "No instruction line. Build the complete audiovisual timeline from text.",
      I2VA: "Fixed instruction line is auto-generated. <Picture 1> is the actual first frame of [Shot 1] — anchor, then develop forward.",
      FL2VA: "Instruction line auto-generated from duration. Describe the motion path from Picture 1 to Picture 2; favors a single shot.",
      L2VA: "Instruction line auto-generated. Infer a plausible earlier state, then converge onto <Picture 1> in the final shot.",
    };
    f.append(el("div", { class: "mmh3p-sec" },
      el("span", { class: "hint" }, modeHints[s.mode])));

    if (s.mode === "FL2VA" || s.mode === "L2VA") f.append(this.durationRow());

    if (s.mode === "FL2VA") {
      f.append(el("div", { class: "mmh3p-sec" },
        el("label", {}, "Picture 2 belongs to Shot"),
        el("input", { type: "number", min: "1", step: "1", style: { width: "80px" },
          value: s.p2Shot,
          oninput: (e) => { s.p2Shot = parseInt(e.target.value, 10) || 1; } })));
    }
    if (s.mode === "L2VA") {
      f.append(el("div", { class: "mmh3p-sec" },
        el("label", {}, "Final shot index N (Picture 1 lands here)"),
        el("input", { type: "number", min: "1", step: "1", style: { width: "80px" },
          value: s.lastShot,
          oninput: (e) => { s.lastShot = parseInt(e.target.value, 10) || 1; } })));
    }

    const structures = {
      T2VA: "style + composition \u2192 actions \u2192 cuts \u2192 dialogue/diegetic sound",
      I2VA: "first-frame anchor \u2192 action onset \u2192 continuous development \u2192 result or reaction",
      FL2VA: "first-frame state \u2192 observable intermediate changes \u2192 narrowing differences \u2192 last-frame state",
      L2VA: "plausible preceding state \u2192 action/transition path \u2192 gradual convergence \u2192 last-frame landing",
    };
    f.append(el("div", { class: "mmh3p-sec mmh3p-grow" },
      el("label", {}, "integrated_multimodal_description"),
      this.ta(s, "imd", 12,
        `[Shot 1] Live-action, cinematic, ...\nRecommended: ${structures[s.mode]}`),
      el("span", { class: "hint" },
        "Open [Shot 1] with the overall style and initial composition. Later shots: " +
        "\"[Shot N] At MM:SS.mmm, the shot cuts to ...\". Write camera moves as natural sentences.")));

    const soundTa = this.ta(s, "soundscape", 3,
      "1\u20134 sentences: ambience, physical action sounds, non-verbal human sounds.");
    const musicTa = this.ta(s, "music", 3,
      "1\u20133 sentences: instrumentation, tempo, rhythm, dynamics. No abstract mood words.");
    f.append(el("div", { class: "mmh3p-audiopair" },
      el("div", { class: "mmh3p-sec" },
        this.secLabel("overall_soundscape", null, this.naButton(s, "soundscape")),
        soundTa),
      el("div", { class: "mmh3p-sec" },
        this.secLabel("non_diegetic_music", null, this.naButton(s, "music")),
        musicTa)));
    linkHeights(soundTa, musicTa);
  }

  renderRef() {
    const r = this.state.ref;
    const f = this.formEl;

    const nextTagN = (kind) => {
      const inDefs = r.subjectDefs.flatMap((d) =>
        [...d.text.matchAll(new RegExp(`<${kind} (\\d+)>`, "g"))].map((m) => +m[1]));
      // Prefer the lowest connected slot that isn't defined yet.
      const connected = this.slots
        .filter((s) => s.kind === kind && s.tag).map((s) => s.idx);
      const free = connected.find((n) => !inDefs.includes(n));
      return free ?? Math.max(0, ...inDefs, ...connected) + 1;
    };
    const nextSubjectN = () => nextTagN("Subject");

    const subjChips = () => {
      const defText = r.subjectDefs.map((d) => d.text).join("\n");
      const ns = [...new Set([...defText.matchAll(/<Subject (\d+)>/g)].map((m) => m[1]))];
      return ns.map((n) => el("span", {
        class: "mmh3p-chip subj", title: `Insert <Subject ${n}>`,
        onclick: () => this.insert(`<Subject ${n}>`),
      }, el("b", {}, `Subject ${n}`)));
    };
    const subjChipWrap = el("span", { style: { display: "contents" } });
    this._paintSubjChips = () => subjChipWrap.replaceChildren(...subjChips());
    this._paintSubjChips();
    f.append(this.toolBar([subjChipWrap]));

    /* subject_definitions -------------------------------------------- */
    const defsWrap = el("div");

    // Next unused speaker ID, based on IDs already bound in the definitions.
    const nextSpeakerId = () => {
      const used = new Set([...r.subjectDefs.map((d) => d.text).join("\n")
        .matchAll(/\(S(\d+)\)/g)].map((m) => +m[1]));
      let i = 1;
      while (used.has(i)) i++;
      return `S${i}`;
    };
    const firstTag = (kind, fallback) => {
      const inDefs = r.subjectDefs.map((d) => d.text).join("\n")
        .match(new RegExp(`<${kind} (\\d+)>`));
      if (inDefs) return `<${kind} ${inDefs[1]}>`;
      const slot = this.slots.find((s) => s.kind === kind && s.tag);
      return slot ? slot.tag : fallback;
    };

    // Applying a role rewrites the definition line and keeps
    // retention_analysis and the summary task types consistent with it.
    const applyAudioRole = (d, n, role) => {
      const ctx = {
        n,
        subj: firstTag("Subject", "<Subject 1>"),
        vid: firstTag("Video", "<Video 1>"),
        sx: (d.text.match(/\(S\d+\)/) || [nextSpeakerId()])[0].replace(/[()]/g, ""),
      };
      d.text = role.text(ctx);
      d.role = role.id;

      const label = `<Audio ${n}>`;
      let row = r.retention.find((x) => x.label === label);
      if (!row) { row = { label, context: "", marker: "", note: "" }; r.retention.push(row); }
      row.marker = role.marker;
      row.note = role.note(ctx);

      if (!r.summaryTypes.includes(role.task)) r.summaryTypes.push(role.task);
      this.render();
    };

    const applyPictureRole = (d, n, role) => {
      const ctx = { n, subj: firstTag("Subject", "<Subject 1>"), shot: 1 };
      d.text = role.text(ctx);
      d.role = role.id;

      const label = `<Picture ${n}>`;
      let row = r.retention.find((x) => x.label === label);
      if (!row) { row = { label, context: "", marker: "", note: "" }; r.retention.push(row); }
      row.marker = role.marker;
      row.note = role.note(ctx);
      if (!row.context) row.context = role.context(ctx);

      if (!r.summaryTypes.includes(role.task)) r.summaryTypes.push(role.task);
      this.render();
    };

    const drawDefs = () => {
      defsWrap.replaceChildren();
      r.subjectDefs.forEach((d, i) => {
        const mini = el("div", { class: "mmh3p-minitags" });
        const roleRow = el("div", { class: "mmh3p-roles" });
        const paintMini = () => {
          mini.replaceChildren(
            ...[...d.text.matchAll(/<(Subject|Picture|Video|Audio) (\d+)>/g)]
              .map((m) => el("span",
                { class: `mmh3p-minitag ${TAG_CLASS[m[1]]}` }, `${m[1]} ${m[2]}`)));
          // Lines get one-click role presets for the tag they define.
          const am = d.text.match(/<Audio (\d+)>/);
          const pm = d.text.trim().match(/^<Picture (\d+)>/);
          roleRow.replaceChildren();
          if (pm && !am) {
            const n = pm[1];
            roleRow.append(el("span", { class: "mmh3p-rolelabel" }, "role:"));
            PICTURE_ROLES.forEach((role) => {
              roleRow.append(el("span", {
                class: "mmh3p-rolechip" + (d.role === role.id ? " on" : ""),
                title: role.title + ` \u2014 sets ${role.marker} + ${role.task}`,
                onclick: () => applyPictureRole(d, n, role),
              }, role.label));
            });
          }
          if (am) {
            const n = am[1];
            roleRow.append(el("span", { class: "mmh3p-rolelabel" }, "role:"));
            AUDIO_ROLES.forEach((role) => {
              roleRow.append(el("span", {
                class: "mmh3p-rolechip" + (d.role === role.id ? " on" : ""),
                title: role.title + ` \u2014 sets ${role.marker} + ${role.task}`,
                onclick: () => applyAudioRole(d, n, role),
              }, role.label));
            });
          }
        };
        const ta = el("textarea", { rows: 2, value: d.text,
          placeholder: "<Subject 1> is the ... in <Picture 1>, with ...",
          oninput: (e) => { d.text = e.target.value; d.role = null; paintMini(); } });
        paintMini();
        const row = el("div", { class: "mmh3p-defrow" + (d.off ? " off" : "") },
          this.rowPower(d, drawDefs), ta,
          el("button", { class: "mmh3p-btn ghost", title: "Remove line",
            onclick: () => { r.subjectDefs.splice(i, 1); drawDefs(); this.updatePreview(); },
          }, "\u2715"));
        defsWrap.append(row, mini, roleRow);
      });
    };
    drawDefs();
    const addDef = (seed) => {
      r.subjectDefs.push({ text: seed });
      drawDefs();
      const t = defsWrap.querySelector(".mmh3p-defrow:last-of-type textarea");
      if (t) { t.focus(); t.selectionStart = t.selectionEnd = t.value.length; this.lastFocus = t; }
      this.updatePreview();
    };
    f.append(el("div", { class: "mmh3p-sec" },
      this.secLabel("subject_definitions"),
      defsWrap,
      el("div", { class: "mmh3p-tools" },
        el("button", { class: "mmh3p-btn",
          onclick: () => addDef(`<Subject ${nextTagN("Subject")}> is `) }, "+ Subject"),
        el("button", { class: "mmh3p-btn",
          onclick: () => addDef(`<Picture ${nextTagN("Picture")}> is `) }, "+ Picture line"),
        el("button", { class: "mmh3p-btn",
          onclick: () => addDef(`<Video ${nextTagN("Video")}> is `) }, "+ Video line"),
        el("button", { class: "mmh3p-btn",
          onclick: () => addDef(`<Audio ${nextTagN("Audio")}> is `) }, "+ Audio line")),
      el("span", { class: "hint" },
        "One line per tracked item. Focus a line, then click media chips above to assign " +
        "references to that subject. Audio lines show role chips underneath \u2014 pick one " +
        "and the definition, its retention marker, and the summary task type are filled in " +
        "for you. Standalone <Picture N> lines are only for concrete frame anchors or " +
        "storyboards; otherwise cite the picture inside the subject.")));

    /* summary --------------------------------------------------------- */
    f.append(el("div", { class: "mmh3p-sec" },
      el("label", {}, "summary"),
      el("div", { class: "mmh3p-ttypes" }, TASK_TYPES.map((t) =>
        el("label", {},
          el("input", { type: "checkbox", checked: r.summaryTypes.includes(t),
            onchange: (e) => {
              r.summaryTypes = e.target.checked
                ? [...r.summaryTypes, t]
                : r.summaryTypes.filter((x) => x !== t);
              this.updatePreview();
            } }), t))),
      this.ta(r, "summaryText", 3,
        "One short paragraph. Use the defined labels; for video editing start with " +
        "\"The target video is an edited version of <Video 1>.\""),
      el("span", { class: "hint" },
        "The bracketed prefix is assembled from the checkboxes, joined with \" + \".")));

    /* retention_analysis ---------------------------------------------- */
    const retWrap = el("div");
    // The item a definition line actually defines: the tag it opens with.
    // Pictures merely cited inside a subject are that subject's evidence, not
    // separate labels, so they never earn their own retention line.
    const definedLabels = () => {
      const seen = [];
      r.subjectDefs.forEach((d) => {
        const m = (d.text || "").match(/^\s*<(Subject|Picture|Video|Audio) (\d+)>/);
        if (!m) return;
        const tag = `<${m[1]} ${m[2]}>`;
        if (!seen.includes(tag)) seen.push(tag);
      });
      return seen;
    };

    const knownLabels = () => {
      const defText = r.subjectDefs.map((d) => d.text).join("\n");
      const found = new Set(
        [...defText.matchAll(/<(Subject|Picture|Video|Audio) (\d+)>/g)]
          .map((m) => `<${m[1]} ${m[2]}>`));
      this.slots.forEach((s) => { if (s.tag) found.add(s.tag); });
      return [...found].sort((a, b) => {
        const order = ["Subject", "Picture", "Video", "Audio"];
        const [, ka, na] = a.match(/<(\w+) (\d+)>/);
        const [, kb, nb] = b.match(/<(\w+) (\d+)>/);
        return ka === kb ? na - nb : order.indexOf(ka) - order.indexOf(kb);
      });
    };
    const drawRet = () => {
      retWrap.replaceChildren();
      r.retention.forEach((row, i) => {
        const markers = row.label?.startsWith("<Audio") ? AUDIO_MARKERS : VISUAL_MARKERS;
        if (!markers.includes(row.marker)) row.marker = markers[0];
        retWrap.append(el("div", { class: "mmh3p-retrow" + (row.off ? " off" : "") },
          this.rowPower(row, drawRet),
          autoFitSelect(el("select", {
            onchange: (e) => { row.label = e.target.value; drawRet(); this.updatePreview(); } },
            knownLabels().map((l) =>
              el("option", { value: l, selected: l === row.label }, l)))),
          el("input", { type: "text", value: row.context,
            dataset: { shotlist: "1" },
            placeholder: "appears in [Shot 1], [Shot 2]  \u2014 or leave empty",
            oninput: (e) => { row.context = e.target.value; } }),
          autoFitSelect(el("select", {
            onchange: (e) => { row.marker = e.target.value; this.updatePreview(); } },
            markers.map((m) => el("option", { value: m, selected: m === row.marker }, m)))),
          el("button", { class: "mmh3p-btn ghost",
            onclick: () => { r.retention.splice(i, 1); drawRet(); this.updatePreview(); } },
            "\u2715"),
          el("input", { class: "mmh3p-retnote", type: "text", value: row.note,
            placeholder: (() => {
              const hint = roleHint(definitionFor(this.state, row.label));
              return hint ? `e.g. ${hint.note}`
                : "what exactly is retained / transferred / referenced";
            })(),
            oninput: (e) => { row.note = e.target.value; } }),
        ));
      });
    };
    drawRet();
    const addEntryBtn = el("button", { class: "mmh3p-btn", onclick: () => {
          const labels = knownLabels();
          if (!labels.length) { toast("Define a subject or connect media first"); return; }
          const used = new Set(r.retention.map((x) => x.label));
          const next = labels.find((l) => !used.has(l)) || labels[0];
          const hint = roleHint(definitionFor(this.state, next));
          r.retention.push({ label: next, context: "",
            marker: hint?.marker
              || (next.startsWith("<Audio") ? "reference" : "fully_preserved"),
            // When the definition states the role outright, write the matching
            // note rather than only hinting at it — the role chips already do.
            note: hint ? hint.note : "" });
          drawRet(); this.updatePreview();
        } }, "+ Entry");
    const autoFillBtn = el("button", { class: "mmh3p-btn",
          title: "One entry per item defined above \u2014 not per picture cited " +
            "inside a subject",
          onclick: () => {
            const labels = definedLabels();
            if (!labels.length) {
              toast("Define a subject or standalone reference first", 3000);
              return;
            }
            const used = new Set(r.retention.map((x) => x.label));
            let added = 0;
            labels.forEach((l) => {
              if (used.has(l)) return;
              const hint = roleHint(definitionFor(this.state, l));
              r.retention.push({ label: l, context: "",
                marker: hint?.marker
                  || (l.startsWith("<Audio") ? "reference" : "fully_preserved"),
                note: hint ? hint.note : "" });
              added += 1;
            });
            drawRet(); this.updatePreview();
            if (!added) toast("Every defined label already has an entry", 2600);
          } }, "Auto-fill from labels");
    f.append(el("div", { class: "mmh3p-sec" },
      this.secLabel("retention_analysis", null, addEntryBtn, autoFillBtn),
      retWrap,
      el("span", { class: "hint" },
        "Visual labels: fully_preserved / partially_preserved / attribute_transfer / " +
        "weak_reference. Audio labels: fully_copy / partially_copy / reference / weak_reference.")));

    /* detailed_description --------------------------------------------- */
    const wcSpan = el("span", { class: "hint" });
    const paintWc = () => {
      const wc = r.detail.trim() ? r.detail.trim().split(/\s+/).length : 0;
      wcSpan.textContent = `${wc} words \u2014 generation tasks normally 350\u2013500. ` +
        "First appearance of each <Subject N>: describe its referenced traits, frame " +
        "position, and current action.";
    };
    paintWc();
    const detTa = this.ta(r, "detail", 14,
      "[Shot 1] A medium shot establishes <Subject 1>, ...\n[Shot 2] At 00:03.000, the shot cuts to ...");
    detTa.addEventListener("input", paintWc);
    f.append(el("div", { class: "mmh3p-sec" },
      el("label", { class: "act" },
        "detailed_description \u2014 style opening (before [Shot 1])",
        el("span", { class: "mmh3p-secact" }, this.styleSelect())),
      this.ta(r, "styleLine", 2,
        "The target video is in a realistic multi-camera sitcom style with warm indoor lighting.")));
    f.append(el("div", { class: "mmh3p-sec mmh3p-grow" },
      el("label", {}, "detailed_description \u2014 shots"),
      detTa, wcSpan));

    /* audio sections ---------------------------------------------------- */
    const refSoundTa = this.ta(r, "soundscape", 3,
      "Ambience + physical sounds. If copying ambience: \"The copied ambience layer " +
      "from <Audio 1> continues throughout the target video.\"");
    const refMusicTa = this.ta(r, "music", 3,
      "Audience-only score. If reused: \"<Audio 2> is directly reused as the complete " +
      "audience-only score.\"");
    f.append(el("div", { class: "mmh3p-audiopair" },
      el("div", { class: "mmh3p-sec" },
        this.secLabel("overall_soundscape", null, this.naButton(r, "soundscape")),
        refSoundTa),
      el("div", { class: "mmh3p-sec" },
        this.secLabel("non_diegetic_music", null, this.naButton(r, "music")),
        refMusicTa)));
    linkHeights(refSoundTa, refMusicTa);
  }

  /* ---------- preview + validation ---------- */

  /** Small on/off switch for a single line. Off keeps the row in the editor
   *  but leaves it out of the prompt — for when the media it describes is
   *  temporarily unplugged. */
  rowPower(obj, redraw) {
    const dot = el("span", {
      class: "mmh3p-rowpow" + (obj.off ? "" : " on"),
      title: obj.off ? "Left out of the prompt \u2014 click to include"
                     : "Included \u2014 click to leave out of the prompt",
      onclick: () => {
        obj.off = !obj.off;
        redraw();
        this.updatePreview();
      },
    }, obj.off ? "\u25cb" : "\u25c9");
    return dot;
  }

  /** Section heading with an on/off switch. Off keeps the text but stops the
   *  section reaching the prompt — handy while media comes and goes. */
  /** A section heading. `actions` are laid out against the right edge of the
   *  header, which is where a section's own controls belong once there are
   *  any — beside the field they act on, they compete with it for width. */
  secLabel(name, text, ...actions) {
    const state = this.state;
    state.off = state.off || {};
    const on = !state.off[name];
    const dot = el("span", {
      class: "mmh3p-secpow" + (on ? " on" : ""),
      title: on ? "Included \u2014 click to leave it out of the prompt"
                : "Left out of the prompt \u2014 click to include it again",
      onclick: () => {
        if (state.off[name]) delete state.off[name];
        else state.off[name] = true;
        this.render();
        this.updatePreview();
      },
    }, on ? "\u25c9" : "\u25cb");
    const act = actions.filter(Boolean);
    return el("label", { class: (on ? "" : "off") + (act.length ? " act" : "") },
      dot, text || name,
      act.length ? el("span", { class: "mmh3p-secact" }, ...act) : null);
  }

  updatePreview() {
    this._paintSubjChips?.();
    const text = generate(this.state);
    this._citeText = text;
    // Order matters. The language bracket runs before [Shot N] and excludes it
    // by lookahead, so the two can't claim each other's text; every pattern
    // after the first excludes < and > so none can match inside a span this
    // chain has already inserted.
    this.previewEl.innerHTML = paintTags(text);

    const rank = { error: 0, warn: 1, info: 2 };
    const icon = { error: "\u26d4 ", warn: "\u26a0 ", info: "\u2139 " };
    const issues = validate(this.state, this.slots)
      .sort((a, b) => rank[a.level] - rank[b.level]);
    this.issuesEl.replaceChildren(...(issues.length
      ? issues.map((i) => el("div", { class: i.level }, icon[i.level] + i.msg))
      : [el("div", { class: "ok" }, "\u2713 No issues found")]));

    let stats = `${text.length} chars`;
    if (this.state.mode === "FL2VA" || this.state.mode === "L2VA") {
      const frames = snapLength(this.state.duration);
      stats += ` \u2022 length ${frames} (${fmtSS(frames / 24)}s)`;
    } else {
      const cuts = [...text.matchAll(/At (\d{2}):(\d{2})\.(\d{3})/g)];
      if (cuts.length) {
        const last = cuts[cuts.length - 1];
        const sec = tsToMs(last[1], last[2], last[3]) / 1000;
        const L = minLengthAfter(sec);
        stats += ` \u2022 last cut ${fmtTimestamp(sec)} \u2192 length \u2265 ${L} (${fmtSS(L / 24)}s)`;
      }
    }
    this.statsEl.textContent = stats;
  }
}

/* ------------------------------------------------------------------ */
/* Node integration                                                    */
/* ------------------------------------------------------------------ */

export function hideWidget(node, name) {
  const w = node.widgets?.find((w) => w.name === name);
  if (!w) return;
  w.hidden = true;                       // respected by the new frontend
  w.computeSize = () => [0, -4];         // legacy layout fallback
  w.type = "hidden";
  if (w.inputEl) w.inputEl.style.display = "none";
  if (w.element) w.element.style.display = "none";
}

export function openEditor(node) {
  try {
    new Editor(node);
  } catch (err) {
    console.error("[MiniMaxH3 PromptBuilder] failed to open editor:", err);
    toast(`Couldn't open the editor: ${err?.message || err}. ` +
      "See the browser console (F12) for details.", 8000);
  }
}

/* ---------- on-node mode button + dropdown ---------------------------- */

/** Keep the two audio boxes the same height: dragging either one's resize
 *  grip resizes the other, so the pair stays level. Watches the rendered
 *  height rather than the drag itself, which also covers a height set any
 *  other way. The guard stops the two observers ping-ponging. */
/* ---------- quick edit: the three fields, mountable anywhere ------------ */

/** The fields a prompt is really made of, as a block that can be mounted in a
 *  window or straight onto the node. Both mounts write back through the one
 *  `save`, which does exactly what the full editor's Save does, so the two
 *  surfaces cannot end up disagreeing about the node's state. */
export function promptFields(node) {
  const state = loadState(node);
  const isRef = state.mode === "REF";
  if (isRef && !state.ref) state.ref = {};
  const target = isRef ? state.ref : state;

  const root = el("div", { class: "mmh3p-quick" });

  /** The pictures this mode actually sends as keyframes, shown beside the
   *  fields so you can see what you are writing against. Reference mode has no
   *  keyframes and T2VA no pictures, so both get nothing and the fields take
   *  the full width. */
  const keyframes = () => {
    if (isRef) return null;
    const cap = MODE_CAPACITY[state.mode]?.Picture || 0;
    if (!cap) return null;
    let pics;
    try {
      pics = getRefSlots(node).filter((sl) => sl.kind === "Picture").slice(0, cap);
    } catch (e) { return null; }
    if (!pics.length) return null;
    return el("div", { class: "mmh3p-quickpics" },
      ...pics.map((sl) => el("div", { class: "mmh3p-quickpic" },
        cropFrame(el("img", { class: "mmh3p-thumb", src: sl.preview?.url }),
          sl.item?.crop),
        el("span", { class: `mmh3p-tagname ${sl.cls}` }, sl.tag))));
  };
  const field = (label, obj, key, rows, placeholder, cls) => {
    const t = el("textarea", {
      rows, placeholder, value: obj[key] ?? "",
      oninput: (e) => { obj[key] = e.target.value; },
    });
    root.append(el("div", { class: "mmh3p-sec" + (cls ? ` ${cls}` : "") },
      el("label", {}, label), t));
    return t;
  };

  if (isRef) {
    // Reference mode writes detailed_description instead: its style opening
    // and its shots, the two halves the generator joins.
    field("detailed_description — style opening", target, "styleLine", 2,
      "The target video is in a realistic multi-camera sitcom style…");
    field("detailed_description — shots", target, "detail", 10,
      "[Shot 1] A medium shot establishes <Subject 1>, …", "mmh3p-grow");
  } else {
    field("integrated_multimodal_description", state, "imd", 10,
      "[Shot 1] Live-action, cinematic, …", "mmh3p-grow");
  }

  const pair = el("div", { class: "mmh3p-audiopair" });
  const audioBox = (label, key, placeholder) => {
    const t = el("textarea", {
      rows: 3, placeholder, value: target[key] ?? "",
      oninput: (e) => { target[key] = e.target.value; },
    });
    // Same N/A the full editor puts in these headings, so a section can be
    // marked deliberately empty without leaving the quick window. Writing
    // through the field and firing `input` keeps the one save path: the
    // textarea's own handler is what updates the state.
    const na = el("button", {
      class: "mmh3p-btn",
      title: `Mark ${label} as deliberately empty`,
      onclick: () => {
        t.value = "N/A";
        t.dispatchEvent(new Event("input", { bubbles: true }));
      },
    }, "N/A");
    pair.append(el("div", { class: "mmh3p-sec" },
      el("label", { class: "act" }, label,
        el("span", { class: "mmh3p-secact" }, na)),
      t));
    return t;
  };
  const soundTa = audioBox("overall_soundscape", "soundscape",
    "Ambience, physical action sounds, non-verbal human sounds.");
  const musicTa = audioBox("non_diegetic_music", "music",
    "Instrumentation, tempo, rhythm, dynamics. No abstract mood words.");
  root.append(pair);
  linkHeights(soundTa, musicTa);

  const save = () => {
    const pw = node.widgets?.find((w) => w.name === "prompt_text");
    const sw = node.widgets?.find((w) => w.name === "builder_state");
    if (pw) pw.value = generate(state);
    if (sw) sw.value = JSON.stringify(state);
    updateSummary(node);
    try {
      node.setDirtyCanvas?.(true, true);
      app.graph.setDirtyCanvas(true, true);
    } catch (e) { /* Vue redraws itself */ }
  };
  // Wrapped so the keyframe column can sit beside the fields without changing
  // any of the .mmh3p-quick rules the fields themselves rely on.
  const pics = keyframes();
  const shell = pics ? el("div", { class: "mmh3p-quickwrap" }, pics, root) : root;
  return { root: shell, save, state };
}

/** The quick-edit window, opened by clicking the node's prompt bar. The bar's
 *  scroll still opens the full builder, so both routes stay available. */
export function openQuickEdit(node) {
  injectCSS();
  const fields = promptFields(node);
  const mode = fields.state.mode;
  const close = () => {
    overlay.remove();
    window.removeEventListener("keydown", esc);
  };
  const esc = (e) => { if (e.key === "Escape") close(); };
  const overlay = el("div", {
    class: "mmh3p-overlay",
    onmousedown: (e) => { if (e.target === overlay) close(); },
  },
    el("div", { class: "mmh3p-quickmodal" },
      el("div", { class: "mmh3p-head" },
        el("div", { class: "mmh3p-title" }, "Quick edit",
          el("small", {}, mode === "REF" ? "Full-reference" : mode)),
        el("button", { class: "mmh3p-btn mmh3p-pushright",
          title: "Open the full Prompt Builder, keeping what you have typed",
          // Save first: the full editor reads the node's widgets, so without
          // this everything typed here since opening was dropped on the way.
          onclick: () => { fields.save(); close(); openEditor(node); } },
          "📜 Prompt Builder"),
        el("button", { class: "mmh3p-x", onclick: close }, "✕")),
      el("div", { class: "mmh3p-quickbody" }, fields.root),
      el("div", { class: "mmh3p-foot" },
        el("span", { class: "stats" },
          "Writes the same fields the full editor does"),
        el("button", { class: "mmh3p-btn", onclick: close }, "Cancel"),
        el("button", { class: "mmh3p-btn primary", onclick: () => {
          fields.save(); toast("Saved to node"); close();
        } }, "Save to node"))));
  window.addEventListener("keydown", esc);
  document.body.append(overlay);
  setTimeout(() => fields.root.querySelector("textarea")?.focus(), 0);
  return overlay;
}

/* A <select> lays itself out against its WIDEST option, not the one on show, so
   a "Zoom In" box was as wide as "Roll Counterclockwise". These size it to the
   option actually displayed and re-fit on change. One shared probe span does
   the measuring: it copies the select's own font so the figure is real rather
   than estimated. */
let _selProbe = null;

function fitSelect(sel) {
  if (!sel?.options?.length) return;
  try {
    const cs = getComputedStyle(sel);
    if (!cs.font) return;                 // not in the document yet
    if (!_selProbe) {
      _selProbe = el("span", { style: {
        position: "absolute", top: "-9999px", left: "-9999px",
        visibility: "hidden", whiteSpace: "pre" } });
      document.body.append(_selProbe);
    }
    _selProbe.style.font = cs.font;
    _selProbe.style.letterSpacing = cs.letterSpacing;
    _selProbe.textContent = sel.options[sel.selectedIndex]?.text ?? "";
    const text = _selProbe.getBoundingClientRect().width;
    // Its own padding and borders, plus room for the native dropdown arrow.
    const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
      + SELECT_ARROW;
    sel.style.width = `${Math.ceil(text + chrome)}px`;
  } catch (e) { /* leave it at its natural width */ }
}

const SELECT_ARROW = 22;

/** Fit now and on every change. Measuring needs the element in the document,
 *  so the first pass waits for a frame. */
function autoFitSelect(sel) {
  if (!sel) return sel;
  sel.addEventListener("change", () => fitSelect(sel));
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fitSelect(sel));
  else setTimeout(() => fitSelect(sel), 0);
  return sel;
}

/** Colour the H3 tokens in a block of prompt text, as HTML.
 *
 *  Shared by the editor's preview and the node's prompt bar so the two can
 *  never drift apart on what counts as a tag. Order matters: the language
 *  bracket runs before [Shot N] and excludes it by lookahead, so the two can't
 *  claim each other's text, and every pattern after the first excludes < and >
 *  so none can match inside a span this chain has already inserted. The input
 *  is escaped first, so the only markup in the result is ours. */
/** Wrap a thumbnail so only `crop` shows, scaled to fill the tile.
 *
 *  The media is blown up to 1/w by 1/h of the window and shifted so the kept
 *  rect lands on it, which is the same mapping the decoder applies — so the
 *  card shows what the model receives. Returns the node untouched when there
 *  is no crop, so uncropped media keeps the plain element the cache holds. */
function cropFrame(node, crop) {
  if (!crop) return node;
  const w = crop.w || 1, h = crop.h || 1;
  if (w >= 0.999 && h >= 0.999) return node;
  node.classList.add("mmh3p-cropped");
  Object.assign(node.style, {
    width: `${100 / w}%`, height: `${100 / h}%`,
    left: `${-(crop.x || 0) * 100 / w}%`, top: `${-(crop.y || 0) * 100 / h}%`,
  });
  return el("div", { class: "mmh3p-cropwrap" }, node);
}

/** The hover preview keeps the whole frame and draws the kept rect over it,
 *  dimming everything outside — the same reading the crop editor gives, so you
 *  can see what was dropped as well as what is left. The overlay is a wrapper
 *  around the media, not a change to it, so the media element is untouched. */
function peekCrop(media, crop) {
  if (!crop) return media;
  const w = crop.w || 1, h = crop.h || 1;
  if (w >= 0.999 && h >= 0.999) return media;
  return el("div", { class: "mmh3p-peekcrop" }, media,
    el("div", { class: "mmh3p-peekmark", style: {
      left: `${(crop.x || 0) * 100}%`, top: `${(crop.y || 0) * 100}%`,
      width: `${w * 100}%`, height: `${h * 100}%`,
    } }));
}

function paintTags(text) {
  return escapeHtml(text)
    .replace(/&lt;(Subject|Picture|Video|Audio) (\d+)&gt;/g,
      (m, k, n) => `<span class="mmh3p-t-${TAG_CLASS[k]}">&lt;${k} ${n}&gt;</span>`)
    .replace(/\[(?!Shot\b)([^\]\n<>]{1,24})\]/g,
      '<span class="mmh3p-t-lang">[$1]</span>')
    .replace(/\[Shot (\d+)\]/g, '<span class="mmh3p-t-shot">[Shot $1]</span>')
    .replace(/&lt;(\/?d|scenetrans|cutoff)&gt;/g, '<span class="mmh3p-t-d">&lt;$1&gt;</span>')
    .replace(/\((S\d+)\)/g, '<span class="mmh3p-t-spk">($1)</span>')
    .replace(/\bN\/A\b/g, '<span class="mmh3p-t-na">N/A</span>');
}

function linkHeights(a, b) {
  if (typeof ResizeObserver !== "function" || !a || !b) return;
  // ta() now returns a .mmh3p-chipwrap div, not the bare textarea — the wrap
  // has no CSS height of its own (block content sizes it), so a height set
  // on the wrap wouldn't reach the textarea inside. Sync the textareas.
  a = a.querySelector?.("textarea") || a;
  b = b.querySelector?.("textarea") || b;
  let syncing = false;
  const pair = (from, to) => new ResizeObserver(() => {
    if (syncing) return;
    const h = from.getBoundingClientRect().height;
    if (!h || Math.abs(h - to.getBoundingClientRect().height) < 1) return;
    syncing = true;
    to.style.height = `${h}px`;
    requestAnimationFrame(() => { syncing = false; });
  });
  pair(a, b).observe(a);
  pair(b, a).observe(b);
}

let _modeMenu = null;

function closeModeMenu() {
  _modeMenu?.remove();
  _modeMenu = null;
  window.removeEventListener("mousedown", modeMenuOutside, true);
  window.removeEventListener("keydown", modeMenuEsc, true);
}
function modeMenuOutside(e) {
  if (_modeMenu && !_modeMenu.contains(e.target)) closeModeMenu();
}
function modeMenuEsc(e) {
  if (e.key === "Escape") { e.stopPropagation(); closeModeMenu(); }
}

/** Switch mode straight from the node, without opening the editor. */
function setMode(node, mode) {
  const sw = node.widgets?.find((w) => w.name === "builder_state");
  if (!sw) return;
  const state = loadState(node);
  if (state.mode === mode) return;
  state.mode = mode;
  sw.value = JSON.stringify(state);

  // Rewrite the prompt only when there is one. Regenerating an untouched node
  // would swap "empty" for a skeleton the user never asked for, and the empty
  // state is what the summary uses to tell them to open the editor.
  const pw = node.widgets?.find((w) => w.name === "prompt_text");
  if (pw && (pw.value || "").trim()) pw.value = generate(state);

  updateSummary(node);
  // A mode change can also change the media panel's shape, and with it whether
  // the node's prompt bar expands; the node's hook knows, this function does not.
  try { node._mmlPanel?.render?.(); node._mmlOnCommit?.(); } catch (e) { /* cosmetic */ }
  try {
    node.setDirtyCanvas?.(true, true);
    app.graph.setDirtyCanvas(true, true);
  } catch (e) { /* Vue redraws itself */ }
}

/** Mode list, anchored to the button. Lives on document.body so the summary's
 *  own overflow:hidden can't clip it \u2014 the same approach as the hover peek. */
function openModeMenu(node, btn) {
  closeModeMenu();
  const current = loadState(node).mode;
  const menu = el("div", { class: "mmh3p-modemenu" },
    ...MODES.map((m) => el("div", {
      class: "mmh3p-modeitem" + (m.id === current ? " on" : ""),
      onmousedown: (e) => e.stopPropagation(),   // outside-click closer
      onclick: (e) => {
        e.stopPropagation();
        closeModeMenu();
        setMode(node, m.id);
      },
    }, el("b", {}, m.label), el("span", { class: "mmh3p-modehint" }, m.hint))));

  document.body.append(menu);
  _modeMenu = menu;

  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth || 200;
  const h = menu.offsetHeight || 0;
  // Prefer below the button; flip above when there isn't room.
  const top = (r.bottom + h + 6 > window.innerHeight && r.top - h - 6 > 0)
    ? r.top - h - 6 : r.bottom + 6;
  menu.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
  menu.style.top = `${Math.max(4, top)}px`;

  // Deferred: the click that opened the menu is still travelling.
  setTimeout(() => {
    window.addEventListener("mousedown", modeMenuOutside, true);
    window.addEventListener("keydown", modeMenuEsc, true);
  }, 0);
}

export function updateSummary(node) {
  if (!node._mmh3Summary) return;
  const state = loadState(node);
  // The description the mode is actually built around, not the whole assembled
  // prompt: reference mode writes detailed_description (its style opening plus
  // the shots), every other mode writes integrated_multimodal_description.
  const text = (state.mode === "REF"
    ? [state.ref?.styleLine, state.ref?.detail].filter((v) => (v || "").trim())
        .join("\n")
    : state.imd || "").trim();
  const allSlots = getRefSlots(node);
  const refs = allSlots.filter((s) => s.tag).length;
  const orphans = allSlots.filter((s) => s.orphan != null).length;
  const cap = MODE_CAPACITY[state.mode] || {};
  const over = state.mode === "REF" && cap.total && refs > cap.total;

  // Left: two lines of the prompt itself. textContent, not innerHTML \u2014 the
  // prompt is user text and must never be parsed as markup. CSS clamps it.
  const preview = el("div", { class: "mmh3p-sumtext" + (text ? "" : " empty") });
  // 300 chars is well past what two clamped lines can show at this width, so
  // the node isn't carrying a whole prompt it will never display. Painted with
  // the editor's own chain, so a tag reads the same colour in both places.
  if (text) {
    preview.innerHTML =
      paintTags(text.slice(0, 300)) + (text.length > 300 ? "\u2026" : "");
  } else {
    preview.textContent = "empty \u2014 click to open the editor";
  }

  // Everything the old single line used to spell out, kept as a tooltip so
  // the two-line preview doesn't lose it.
  const detail = [
    state.mode === "REF" ? "Full-reference" : state.mode,
    (state.mode === "FL2VA" || state.mode === "L2VA")
      ? `${fmtSS(snapLength(state.duration) / 24)}s (${snapLength(state.duration)}f)` : "",
    refs ? `${refs} ref${refs > 1 ? "s" : ""}`
      + `${allSlots.bundled && !allSlots.own ? " (loader)" : ""}` : "",
    over ? `over the ${cap.total} limit` : "",
    orphans ? `${orphans} unpaired soundtrack${orphans > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(" \u2022 ");

  const btn = el("button", {
    class: "mmh3p-modebtn" + (over || orphans ? " warn" : ""),
    title: `${detail}\nClick to change mode`,
    onmousedown: (e) => e.stopPropagation(),
    onclick: (e) => {
      e.stopPropagation();          // don't fall through to "open the editor"
      e.preventDefault();
      if (_modeMenu) { closeModeMenu(); return; }
      openModeMenu(node, btn);
    },
  }, el("b", {}, MODES.find((m) => m.id === state.mode)?.label || state.mode),
     el("span", { class: "mmh3p-modecaret" }, "\u25be"));

  // A labelled button, not a bare icon: clicking the strip opens the *quick*
  // editor, so the way through to the full one has to say what it is.
  const scroll = el("button", {
    class: "mmh3p-sumbtn",
    title: "Open the full Prompt Builder",
    onmousedown: (e) => e.stopPropagation(),
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); openEditor(node); },
  }, "\u{1F4DC} Prompt Builder");

  // Audio indicators, to the left of the mode button. "N/A" is how a section
  // is written when it deliberately carries nothing, so it must not light the
  // icon — nor should a section switched off, which never reaches the model.
  const audioFields = state.mode === "REF" ? (state.ref || {}) : state;
  const filled = (key, section) => {
    const v = (audioFields[key] || "").trim();
    return !!v && !/^n\/?a$/i.test(v) && sectionOn(state, section);
  };
  const marks = [];
  if (filled("soundscape", "overall_soundscape"))
    marks.push(el("span", { class: "mmh3p-summark", title: "overall_soundscape has content" }, "\u{1F50A}"));
  if (filled("music", "non_diegetic_music"))
    marks.push(el("span", { class: "mmh3p-summark", title: "non_diegetic_music has content" }, "\u{1F3B5}"));

  node._mmh3Summary.title = `${detail}\nClick to open the editor`;
  node._mmh3Summary.replaceChildren(scroll, preview, ...marks, btn);
}

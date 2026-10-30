/* MiniMax H3 Prompt Studio — the generation-settings bar
 *
 * Two rows above the node's media panel, written to its hidden `gen_state`
 * widget (gen_settings.py reads it):
 *   1. diffusion model (its file name only — Load Diffusion Model loads it),
 *      sampler, scheduler, steps, seed, and presets of the first four;
 *   2. scale mode, aspect ratio, the size for the mode, Auto (take the
 *      aspect from the keyframe), and the video length.
 *
 * The size works like PlagueKind's Unified Resize Image; the seed like
 * rgthree's Seed node (-1 random each time, -2 / -3 last seed plus / minus
 * one, swapped for a real seed when the prompt is queued). Everything the
 * node makes travels on its one BUNDLE output, which PlagueKind's Bundle Out
 * unpacks; this file also names Bundle Out's slots after what's on them, and
 * moves a workflow saved with the node's older outputs onto one.
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { el, setDuration, toast } from "./promptbuilder.js";
import { BUNDLE_OUT, STUDIO_BUNDLE } from "./medialoader.js";
import { refreshStackLabels } from "./refmodstack.js";

const STUDIO_NAME = "MiniMaxH3PromptStudio";

/** The bundle, in Bundle Out's output order (gen_settings.BUNDLE_NAMES). */
export const BUNDLE_NAMES = STUDIO_BUNDLE;
// What the old outputs carried that the bundle doesn't: the checkpoint. The
// node passes on only the diffusion model's file name now (model_name).
const DROPPED_OUTPUTS = ["model"];
const DROPPED_INPUTS = ["fl2va_model", "ref2va_model"];

const SCALE_MODES = [
  ["Longer Side", "Long side"],
  ["Shorter Side", "Short side"],
  ["Total Pixels (MP)", "Megapixels"],
];
const ASPECTS = {
  "1:1 (Square)": [1, 1],
  "2:3 (Portrait Photo)": [2, 3],
  "3:2 (Photo)": [3, 2],
  "3:4 (Portrait Standard)": [3, 4],
  "4:3 (Standard)": [4, 3],
  "9:16 (Portrait Widescreen)": [9, 16],
  "16:9 (Widescreen)": [16, 9],
  "21:9 (Ultrawide)": [21, 9],
};
const DIV = 32;
// What Auto reads per mode (nodes.py's AUTO_SOURCE); T2VA and Reference
// have no keyframe, so Auto does nothing there.
const AUTO_SOURCE = { I2VA: "Picture 1", FL2VA: "Picture 1 (first frame)", L2VA: "the last frame" };

const SEED_RANDOM = -1, SEED_INC = -2, SEED_DEC = -3;
const SPECIAL = [SEED_RANDOM, SEED_INC, SEED_DEC];
const SEED_MAX = 1125899906842624;      // rgthree's range
const SEED_SHOWN = { [SEED_RANDOM]: "random", [SEED_INC]: "+1 each", [SEED_DEC]: "−1 each" };

export const GEN_DEFAULTS = {
  model: "", sampler: "euler", scheduler: "simple", steps: 20, seed: SEED_RANDOM,
  scale_mode: "Longer Side", aspect: "16:9 (Widescreen)",
  long_side: 1344, short_side: 768, megapixels: 1.0, auto: false,
  length_unit: "frames",      // the bundle's length: "frames" or "seconds"
};
const PRESET_KEYS = ["model", "sampler", "scheduler", "steps"];
const PRESET_FILE = "minimax_h3_plus/gen_presets.json";

const widget = (node, name) => node.widgets?.find((w) => w.name === name);

export function readGen(node) {
  let raw = {};
  try { raw = JSON.parse(widget(node, "gen_state")?.value || "{}") || {}; } catch (e) { raw = {}; }
  return { ...GEN_DEFAULTS, ...(typeof raw === "object" && !Array.isArray(raw) ? raw : {}) };
}

function writeGen(node, patch) {
  const w = widget(node, "gen_state");
  const next = { ...readGen(node), ...patch };
  if (w) w.value = JSON.stringify(next);
  try { node.setDirtyCanvas?.(true, true); } catch (e) { /* Vue redraws itself */ }
  return next;
}

function builderState(node) {
  try { return JSON.parse(widget(node, "builder_state")?.value || "{}") || {}; } catch (e) { return {}; }
}

/** promptbuilder.js's snapLength: frames at 24 fps on the 17k+5 grid. */
function snapLength(seconds) {
  let L = Math.max(5, Math.round((Number(seconds) || 0) * 24));
  L += (5 - (L % 17) + 17) % 17;
  return L;
}

/* ---- size: Unified Resize Image's arithmetic (gen_settings.py) ------------ */

function resolveSize(st, w, h) {
  w = Math.max(1, w); h = Math.max(1, h);
  const dim = (v) => Math.max(1, Math.round(v));
  if (st.scale_mode === "Longer Side") { const k = st.long_side / Math.max(w, h); return [dim(w * k), dim(h * k)]; }
  if (st.scale_mode === "Shorter Side") { const k = st.short_side / Math.min(w, h); return [dim(w * k), dim(h * k)]; }
  const area = st.megapixels * 1e6, nw = Math.max(1, Math.round(Math.sqrt(area * (w / h))));
  return [nw, Math.max(1, Math.round(area / nw))];
}

function applyDivisible(w, h) {
  const snap = (v) => Math.max(DIV, Math.floor(Math.max(1, Math.trunc(v)) / DIV) * DIV);
  const aspect = w / h;
  if (w >= h) { w = snap(w); h = snap(Math.max(1, Math.round(w / aspect))); }
  else { h = snap(h); w = snap(Math.max(1, Math.round(h * aspect))); }
  return [w, h];
}

/** The keyframe Auto reads in this mode, as the media panel holds it: the
 *  first switched-on picture (I2VA / FL2VA's Picture 1, L2VA's only one,
 *  which is its last frame). Its size as sent: turned, then cropped. */
function autoPicture(node, mode) {
  if (!AUTO_SOURCE[mode]) return null;
  const items = node._mmlPanel?.items || [];
  const pic = items.find((i) => i?.kind === "picture" && i.enabled !== false);
  if (!pic) return null;
  const w = (pic.width || 0) * (pic.crop?.w ?? 1), h = (pic.height || 0) * (pic.crop?.h ?? 1);
  return w && h ? { w, h, name: pic.name || pic.file } : { w: 0, h: 0, name: pic.name || pic.file };
}

/** [width, height, note] the node will make, as gen_settings.resolution(). */
export function genResolution(node, st = readGen(node)) {
  const mode = builderState(node).mode || "T2VA";
  let [aw, ah] = ASPECTS[st.aspect] || ASPECTS[GEN_DEFAULTS.aspect];
  let note = st.aspect;
  if (st.auto) {
    const pic = autoPicture(node, mode);
    if (pic?.w) { aw = pic.w; ah = pic.h; note = `Auto: ${pic.name}`; }
    else if (pic) note = "Auto: the picture's size is read when it runs";
    else note = AUTO_SOURCE[mode] ? `Auto: no picture loaded, so ${st.aspect}` : `Auto does nothing in ${mode === "REF" ? "Reference" : mode}`;
  }
  const [w, h] = applyDivisible(...resolveSize(st, aw, ah));
  return [w, h, note];
}

/* ---- choices from ComfyUI ------------------------------------------------- */

let _choices = null;
function comboOf(spec) {
  if (Array.isArray(spec?.[0])) return spec[0];
  if (spec?.[0] === "COMBO" && Array.isArray(spec?.[1]?.options)) return spec[1].options;
  return [];
}
/** Diffusion models, samplers and schedulers, from the nodes that take them.
 *  Cached; `fresh` re-reads (a model added since the page loaded). */
function choices(fresh = false) {
  if (_choices && !fresh) return _choices;
  const get = async (cls) => {
    try { const r = await api.fetchApi(`/object_info/${cls}`); return r.ok ? (await r.json())[cls] : null; }
    catch (e) { return null; }
  };
  _choices = Promise.all([get("UNETLoader"), get("KSampler")]).then(([unet, ks]) => ({
    models: comboOf(unet?.input?.required?.unet_name),
    samplers: comboOf(ks?.input?.required?.sampler_name),
    schedulers: comboOf(ks?.input?.required?.scheduler),
  }));
  return _choices;
}

/* ---- presets: the model, sampler, scheduler and steps, per user ---------- */

let _presets = null;
async function loadPresets(fresh = false) {
  if (_presets && !fresh) return _presets;
  try {
    const r = await api.getUserData(PRESET_FILE);
    const data = r.ok ? await r.json() : {};
    _presets = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (e) { _presets = _presets || {}; }
  return _presets;
}
async function savePresets(all) {
  _presets = all;
  await api.storeUserData(PRESET_FILE, all, { overwrite: true, stringify: true, throwOnError: true });
  for (const bar of BARS) bar.paintPresets();
}

/* ---- the bar --------------------------------------------------------------- */

const BARS = new Set();

/** The bar's height at 100% text size, margin included: the node's floor
 *  (promptstudio.js's STACK_H) counts it. At a larger text size the media
 *  panel under it gives up the difference. */
export const GEN_H = 64;

// Sized off --mmh3-fs, which .mmh3p-nodestack maps to the node ⚙'s text size.
const CSS = `
.mmh3p-genbar{flex:0 0 auto;box-sizing:border-box;margin-bottom:4px;padding:5px 7px;
  display:flex;flex-direction:column;gap:4px;background:#191c22;border:1px solid #2a2f3a;border-radius:8px;
  font-family:system-ui,sans-serif;font-size:calc(11px * var(--mmh3-fs, 1));color:#9aa3b2;}
.mmh3p-genrow{display:flex;align-items:center;gap:5px;min-width:0;height:calc(22px * var(--mmh3-fs, 1));}
.mmh3p-genbar select,.mmh3p-genbar input,.mmh3p-gen-btn{box-sizing:border-box;height:100%;min-width:0;
  background:#12151b;color:#dde2ea;border:1px solid #2f3542;border-radius:5px;font:inherit;padding:0 4px;}
.mmh3p-genbar select:disabled{opacity:.45;}
.mmh3p-genbar select:focus,.mmh3p-genbar input:focus{outline:none;border-color:#5b8def;}
/* The model takes whatever row 1 has spare; the other dropdowns are as wide
   as the value they show (fitSelect), and give way only if a row runs out. */
.mmh3p-gen-model{flex:1 1 0;}
.mmh3p-gen-fit{flex:0 1 auto;padding-right:0;}
.mmh3p-gen-lab{display:flex;align-items:center;gap:3px;height:100%;flex:0 0 auto;white-space:nowrap;}
.mmh3p-gen-num{width:calc(48px * var(--mmh3-fs, 1));text-align:right;}
/* Two digits, no spinner (the arrows alone took a third digit's room). */
.mmh3p-gen-steps{width:calc(2ch + 10px);text-align:center;padding:0 2px;appearance:textfield;-moz-appearance:textfield;}
.mmh3p-gen-steps::-webkit-inner-spin-button,.mmh3p-gen-steps::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
.mmh3p-gen-seed{width:calc(70px * var(--mmh3-fs, 1));}
.mmh3p-gen-seed.special{color:#e0a94c;text-align:center;}
.mmh3p-gen-target{width:calc(54px * var(--mmh3-fs, 1));}
.mmh3p-gen-len{width:calc(42px * var(--mmh3-fs, 1));}
.mmh3p-gen-unit{color:#6b7484;}
/* px / MP in a fixed box, so switching between them moves nothing after it. */
.mmh3p-gen-tunit{display:inline-block;width:1.6em;flex:0 0 auto;}
.mmh3p-gen-btn{cursor:pointer;padding:0 6px;flex:0 0 auto;}
.mmh3p-gen-btn:hover{border-color:#4a5262;}
.mmh3p-gen-auto.on{background:#20324f;border-color:#5b8def;color:#cfe0ff;}
.mmh3p-gen-auto.on.idle{background:#1e232c;border-color:#3a4150;color:#7d8696;}
.mmh3p-gen-size{margin-left:auto;flex:0 0 auto;color:#d7dbe2;font-weight:600;white-space:nowrap;cursor:help;
  font-variant-numeric:tabular-nums;}
.mmh3p-gen-menu{position:fixed;z-index:10000;background:#1b1f27;border:1px solid #333a48;border-radius:8px;
  padding:4px;box-shadow:0 12px 32px rgba(0,0,0,.5);font:12px system-ui,sans-serif;color:#d7dbe2;min-width:200px;}
.mmh3p-gen-mi{padding:5px 9px;border-radius:5px;cursor:pointer;white-space:nowrap;}
.mmh3p-gen-mi:hover{background:#2a3140;}
.mmh3p-gen-mi.off{opacity:.4;cursor:default;background:none;}`;

function injectGenCSS() {
  if (document.getElementById("mmh3p-gen-css")) return;
  document.head.append(el("style", { id: "mmh3p-gen-css" }, CSS));
}

/** Size a dropdown to the option it shows rather than its longest one, in
 *  ems so it follows the text size; the rest is the arrow and padding. */
let _measure = null;
function fitSelect(sel, { widest = false } = {}) {
  _measure = _measure || document.createElement("canvas").getContext("2d");
  _measure.font = "100px system-ui, sans-serif";
  // `widest`: as wide as its longest option, so picking another moves nothing.
  const texts = widest ? [...sel.options].map((o) => o.textContent) : [sel.options[sel.selectedIndex]?.textContent || ""];
  const em = Math.max(...texts.map((t) => _measure.measureText(t).width)) / 100;
  sel.style.width = `calc(${em.toFixed(3)}em + 2.6em)`;
}

const select = (cls, title, opts, onchange) => el("select", { class: cls, title, onchange,
  onpointerdown: (e) => e.stopPropagation() }, ...opts);
const option = (value, label = value) => el("option", { value }, label);

/** Put `value` in a select, adding it (marked missing) if it isn't offered —
 *  a model saved in a workflow from another machine stays visible. */
function setSelect(sel, value, list, missing = "not found") {
  const want = String(value ?? "");
  if (!list.includes(want) && want) {
    sel.replaceChildren(option(want, `${want} (${missing})`), ...list.map((v) => option(v)));
  } else if (sel.options.length !== list.length || [...sel.options].some((o, i) => o.value !== list[i])) {
    sel.replaceChildren(...list.map((v) => option(v)));
  }
  sel.value = want;
}

export class GenBar {
  constructor(node) {
    injectGenCSS();
    this.node = node;
    this.lists = { models: [], samplers: [], schedulers: [] };
    const stop = (e) => e.stopPropagation();
    const num = (cls, title, attrs, onchange) => el("input", { class: `mmh3p-gen-num ${cls}`, type: "number",
      title, ...attrs, onchange, onpointerdown: stop, onkeydown: (e) => { if (e.key === "Enter") e.target.blur(); } });

    this.model = select("mmh3p-gen-model", "Diffusion model — its file name goes on the bundle (model_name) "
      + "for a Load Diffusion Model node; Prompt Studio loads nothing itself",
    [], (e) => this.set({ model: e.target.value }));
    this.model.addEventListener("focus", () => this.loadChoices(true));
    this.sampler = select("mmh3p-gen-fit mmh3p-gen-sampler", "Sampler", [], (e) => this.set({ sampler: e.target.value }));
    this.scheduler = select("mmh3p-gen-fit mmh3p-gen-sched", "Scheduler", [], (e) => this.set({ scheduler: e.target.value }));
    this.steps = num("mmh3p-gen-steps", "Steps", { min: "1", max: "10000", step: "1" },
      (e) => this.set({ steps: Math.max(1, Math.min(10000, Math.round(+e.target.value || GEN_DEFAULTS.steps))) }));
    this.seed = el("input", { class: "mmh3p-gen-num mmh3p-gen-seed", type: "text", inputmode: "numeric",
      onpointerdown: stop,
      onfocus: (e) => { e.target.value = String(readGen(this.node).seed); e.target.select(); },
      onblur: (e) => this.setSeedText(e.target.value),
      onkeydown: (e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { e.target.value = String(readGen(this.node).seed); e.target.blur(); } } });
    this.seedBtn = el("button", { class: "mmh3p-gen-btn mmh3p-gen-seedbtn", title: "Seed options",
      onpointerdown: stop, onclick: (e) => { e.stopPropagation(); this.seedMenu(); } }, "🎲");
    this.preset = select("mmh3p-gen-fit mmh3p-gen-preset", "Presets: the model, sampler, scheduler and steps together", [],
      (e) => this.pickPreset(e.target.value));
    this.preset.addEventListener("focus", () => loadPresets(true).then(() => this.paintPresets()));

    this.scale = select("mmh3p-gen-fit mmh3p-gen-scale", "Scale mode (as Unified Resize Image)",
      SCALE_MODES.map(([v, l]) => option(v, l)), (e) => this.set({ scale_mode: e.target.value }));
    this.aspect = select("mmh3p-gen-fit mmh3p-gen-aspect", "Aspect ratio",
      Object.keys(ASPECTS).map((v) => option(v)), (e) => this.set({ aspect: e.target.value }));
    this.target = num("mmh3p-gen-target", "", {}, (e) => this.setTarget(e.target.value));
    this.targetUnit = el("span", { class: "mmh3p-gen-unit mmh3p-gen-tunit" });
    this.auto = el("button", { class: "mmh3p-gen-btn mmh3p-gen-auto", onpointerdown: stop,
      onclick: (e) => { e.stopPropagation(); this.set({ auto: !readGen(this.node).auto }); } }, "Auto");
    this.length = num("mmh3p-gen-len", "Video length in seconds — the Prompt Builder's duration; "
      + "the bundle's length is it in frames, snapped to H3's 17k+5 grid at 24 fps",
    { min: "0.2", max: "15", step: "0.1" }, (e) => { setDuration(this.node, e.target.value); this.paint(); });
    // The length the bundle carries, and the switch for its unit.
    this.lengthUnit = el("span", { class: "mmh3p-gen-unit" }, "s");
    this.frames = el("button", { class: "mmh3p-gen-btn mmh3p-gen-frames", onpointerdown: stop,
      onclick: (e) => { e.stopPropagation();
        this.set({ length_unit: readGen(this.node).length_unit === "seconds" ? "frames" : "seconds" }); } });
    this.size = el("span", { class: "mmh3p-gen-size" });

    const lab = (text, ...kids) => el("label", { class: "mmh3p-gen-lab", onpointerdown: stop }, el("span", {}, text), ...kids);
    this.root = el("div", { class: "mmh3p-genbar", onpointerdown: stop },
      el("div", { class: "mmh3p-genrow" },
        this.model, this.sampler, this.scheduler,
        lab("steps", this.steps),
        lab("seed", this.seed, this.seedBtn)),
      el("div", { class: "mmh3p-genrow" },
        this.auto,
        el("span", { class: "mmh3p-gen-lab" }, this.target, this.targetUnit),
        this.scale, this.aspect,
        lab("length", this.length, this.lengthUnit, this.frames),
        this.size,
        this.preset));
    BARS.add(this);
    this.loadChoices();
    loadPresets().then(() => this.paintPresets());
    this.paint();
  }

  destroy() { BARS.delete(this); document.querySelector(".mmh3p-gen-menu")?.remove(); }

  async loadChoices(fresh = false) {
    this.lists = await choices(fresh);
    // A fresh node takes the first model there is, rather than an empty name.
    const st = readGen(this.node);
    if (!st.model && this.lists.models.length) writeGen(this.node, { model: this.lists.models[0] });
    this.paint();
  }

  set(patch) { writeGen(this.node, patch); this.paint(); }

  setTarget(v) {
    const st = readGen(this.node), n = Number(v);
    if (st.scale_mode === "Total Pixels (MP)") this.set({ megapixels: Math.max(0.01, Math.min(100, n || GEN_DEFAULTS.megapixels)) });
    else {
      const px = Math.max(DIV, Math.min(16384, Math.round(n || 0) || GEN_DEFAULTS.long_side));
      this.set(st.scale_mode === "Longer Side" ? { long_side: px } : { short_side: px });
    }
  }

  setSeedText(text) {
    const t = String(text).trim().toLowerCase();
    const named = { random: SEED_RANDOM, "+1 each": SEED_INC, "−1 each": SEED_DEC, "-1 each": SEED_DEC };
    let v = t in named ? named[t] : Number(t);
    if (!Number.isFinite(v)) v = readGen(this.node).seed;
    v = Math.round(v);
    if (!SPECIAL.includes(v)) v = Math.max(0, Math.min(SEED_MAX, v));
    this.set({ seed: v });
  }

  /** rgthree's three seed buttons, plus its increment / decrement values,
   *  as one menu. */
  seedMenu() {
    document.querySelector(".mmh3p-gen-menu")?.remove();
    const last = this.node._mmh3LastSeed;
    const cur = readGen(this.node).seed;
    const item = (label, title, fn, disabled = false) => el("div", { class: "mmh3p-gen-mi" + (disabled ? " off" : ""), title,
      onmousedown: (e) => e.stopPropagation(),
      onclick: (e) => { e.stopPropagation(); if (disabled) return; close(); fn(); } }, label);
    const menu = el("div", { class: "mmh3p-gen-menu" },
      item("🎲 Randomize each time", "Seed -1: a new random seed every time the prompt is queued",
        () => this.set({ seed: SEED_RANDOM })),
      item("🎲 New fixed random", "Pick a random seed now and keep it",
        () => this.set({ seed: randomSeed() })),
      item(last != null ? `♻️ ${last}` : "♻️ (Use last queued seed)",
        "Keep the seed the last queued prompt used", () => this.set({ seed: last }), last == null || last === cur),
      item("➕ Increment each time", "Seed -2: the last queued seed plus one, each time",
        () => this.set({ seed: SEED_INC })),
      item("➖ Decrement each time", "Seed -3: the last queued seed minus one, each time",
        () => this.set({ seed: SEED_DEC })));
    const close = () => { menu.remove(); window.removeEventListener("mousedown", outside, true); window.removeEventListener("keydown", esc, true); };
    const outside = (e) => { if (!menu.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.body.append(menu);
    const r = this.seedBtn.getBoundingClientRect();
    const w = menu.offsetWidth || 220, h = menu.offsetHeight || 0;
    menu.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
    menu.style.top = `${r.bottom + h + 6 > window.innerHeight ? Math.max(4, r.top - h - 6) : r.bottom + 6}px`;
    window.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", esc, true);
  }

  matchingPreset(st = readGen(this.node)) {
    return Object.entries(_presets || {}).find(([, p]) => PRESET_KEYS.every((k) => String(p?.[k]) === String(st[k])))?.[0] || null;
  }

  paintPresets() {
    const all = _presets || {}, names = Object.keys(all).sort((a, b) => a.localeCompare(b));
    const on = this.matchingPreset();
    this.preset.replaceChildren(
      option("", on ? on : "Preset…"),
      ...names.map((n) => option(`p:${n}`, `${n === on ? "✓ " : ""}${n}`)),
      el("option", { value: "", disabled: true }, "──────"),
      option("save", "💾 Save current as…"),
      ...(on ? [option("del", `🗑 Delete “${on}”`)] : []));
    this.preset.value = "";
    fitSelect(this.preset);
    this.preset.title = (on ? `Preset: ${on}\n` : "") + "Presets: the model, sampler, scheduler and steps together";
  }

  async pickPreset(v) {
    this.preset.value = "";
    try {
      const all = { ...(await loadPresets()) };
      if (v.startsWith("p:")) {
        const p = all[v.slice(2)];
        if (p) this.set(Object.fromEntries(PRESET_KEYS.filter((k) => p[k] != null).map((k) => [k, k === "steps" ? +p[k] : p[k]])));
      } else if (v === "save") {
        const st = readGen(this.node);
        const name = (window.prompt("Save the model, sampler, scheduler and steps as:",
          this.matchingPreset(st) || `${String(st.model).replace(/\.[^.]+$/, "") || "preset"} ${st.sampler}/${st.scheduler} ${st.steps}`) || "").trim();
        if (!name) { this.paintPresets(); return; }
        if (all[name] && !window.confirm(`Replace the preset “${name}”?`)) { this.paintPresets(); return; }
        all[name] = Object.fromEntries(PRESET_KEYS.map((k) => [k, st[k]]));
        await savePresets(all);
        toast(`Saved preset “${name}”`);
      } else if (v === "del") {
        const name = this.matchingPreset();
        if (name && window.confirm(`Delete the preset “${name}”?`)) {
          delete all[name];
          await savePresets(all);
          toast(`Deleted preset “${name}”`);
        }
      }
    } catch (e) {
      toast(`Presets: ${e.message || e}`, 6000);
    }
    this.paintPresets();
  }

  /** Redraw from the widgets: after any change here, a mode switch or media
   *  change (the node's commit hook), a reload or an import. */
  paint() {
    const st = readGen(this.node);
    const { models, samplers, schedulers } = this.lists;
    setSelect(this.model, st.model, models, models.length ? "not in diffusion_models" : "no diffusion models found");
    setSelect(this.sampler, st.sampler, samplers.length ? samplers : [st.sampler]);
    setSelect(this.scheduler, st.scheduler, schedulers.length ? schedulers : [st.scheduler]);
    if (document.activeElement !== this.steps) this.steps.value = String(st.steps);
    if (document.activeElement !== this.seed) this.seed.value = SEED_SHOWN[st.seed] ?? String(st.seed);
    this.seed.title = (SPECIAL.includes(st.seed)
      ? `Seed ${st.seed}: ${{ [SEED_RANDOM]: "a random seed", [SEED_INC]: "the last seed plus one", [SEED_DEC]: "the last seed minus one" }[st.seed]} each time the prompt is queued`
      : `Seed ${st.seed}`) + (this.node._mmh3LastSeed != null ? `\nLast queued: ${this.node._mmh3LastSeed}` : "")
      + "\nType a number, or use 🎲 for random / increment / decrement";
    this.seed.classList.toggle("special", SPECIAL.includes(st.seed));
    this.scale.value = st.scale_mode;
    this.aspect.value = st.aspect;
    for (const sel of [this.sampler, this.scheduler, this.aspect]) fitSelect(sel);
    // Fixed at its widest: Long side / Short side / Megapixels mustn't shift the row.
    fitSelect(this.scale, { widest: true });
    const mp = st.scale_mode === "Total Pixels (MP)";
    if (document.activeElement !== this.target) {
      this.target.value = String(mp ? st.megapixels : st.scale_mode === "Longer Side" ? st.long_side : st.short_side);
    }
    Object.assign(this.target, mp ? { min: "0.01", max: "100", step: "0.01" } : { min: String(DIV), max: "16384", step: String(DIV) });
    this.target.title = mp ? "Total pixels, in megapixels" : `${st.scale_mode === "Longer Side" ? "Longer" : "Shorter"} side, in pixels (snapped to ${DIV}s)`;
    this.targetUnit.textContent = mp ? "MP" : "px";

    const mode = builderState(this.node).mode || "T2VA";
    const pic = st.auto ? autoPicture(this.node, mode) : null;
    const autoUsed = st.auto && !!pic;
    this.auto.classList.toggle("on", !!st.auto);
    this.auto.classList.toggle("idle", !!st.auto && !AUTO_SOURCE[mode]);
    this.auto.setAttribute("aria-pressed", st.auto ? "true" : "false");
    this.auto.title = "Auto: take the aspect ratio from the input picture — I2VA and FL2VA use Picture 1 "
      + "(the first frame), L2VA the last frame; T2VA and Reference use the aspect ratio picked here."
      + (st.auto ? `\nNow: ${AUTO_SOURCE[mode] ? (pic ? `${AUTO_SOURCE[mode]}` : "no picture loaded, so the picked ratio") : `does nothing in ${mode === "REF" ? "Reference" : mode}`}` : "");
    this.aspect.disabled = autoUsed;
    this.aspect.title = autoUsed ? `Aspect ratio — Auto is taking it from ${AUTO_SOURCE[mode]}` : "Aspect ratio";

    const dur = Number(builderState(this.node).duration) || 5;
    if (document.activeElement !== this.length) this.length.value = String(dur);
    const frames = snapLength(dur);
    const secs = frames / 24;
    const inSecs = st.length_unit === "seconds";
    this.frames.textContent = inSecs ? `${+secs.toFixed(2)}s` : `${frames}f`;
    this.frames.title = `The bundle's length: ${inSecs ? `${+secs.toFixed(4)} seconds` : `${frames} frames`} `
      + `(${frames} frames on H3's 17k+5 grid at 24 fps = ${secs.toFixed(2)} s).\n`
      + `Click to send it in ${inSecs ? "frames" : "seconds"} instead.`;
    const [w, h, note] = genResolution(this.node, st);
    this.size.textContent = `${w}×${h}`;
    this.size.title = `The video is made at ${w} × ${h} (${note}), ${frames} frames (${(frames / 24).toFixed(2)} s at 24 fps).`
      + (AUTO_SOURCE[mode] ? `\nThe keyframe${mode === "FL2VA" ? "s are" : " is"} scaled to cover it and centre-cropped.` : "");
  }
}

function randomSeed() {
  return Math.floor(Math.random() * (SEED_MAX + 1));
}

/* ---- the seed, swapped on queue (rgthree's Seed node does the same) -------- */

/** The canvas node an execution id names; ids inside subgraphs are
 *  "outer:inner[:...]". */
function nodeForExecId(id) {
  let graph = app.graph, node = null;
  for (const part of String(id).split(":")) {
    if (!graph) return null;
    node = graph.getNodeById?.(Number(part)) ?? graph.getNodeById?.(part) ?? null;
    graph = node?.subgraph;
  }
  return node;
}

function seedToUse(special, last) {
  if (last != null && !SPECIAL.includes(last)) {
    if (special === SEED_INC) return Math.min(SEED_MAX, last + 1);
    if (special === SEED_DEC) return Math.max(0, last - 1);
  }
  return randomSeed();
}

/** Swap every Prompt Studio's special seed for a real one in a prompt about to
 *  be queued — in the prompt that runs and in the workflow saved with it, so
 *  the video's metadata records the seed actually used. The node's own value
 *  stays as it was (random stays random). Exported for the tests. */
export function applySeeds(data) {
  const out = data?.output;
  if (!out) return;
  for (const [id, n] of Object.entries(out)) {
    if (n?.class_type !== STUDIO_NAME || typeof n.inputs?.gen_state !== "string") continue;
    let st;
    try { st = JSON.parse(n.inputs.gen_state || "{}") || {}; } catch (e) { continue; }
    const node = nodeForExecId(id);
    const seed = Number(st.seed ?? GEN_DEFAULTS.seed);
    const used = SPECIAL.includes(seed) ? seedToUse(seed, node?._mmh3LastSeed) : seed;
    if (used !== seed) {
      const before = n.inputs.gen_state;
      n.inputs.gen_state = JSON.stringify({ ...st, seed: used });
      // The saved workflow: the matching node's gen_state value, wherever it is.
      const wfIds = String(id).split(":");
      const wanted = wfIds[wfIds.length - 1];
      const graphs = [data.workflow, ...(data.workflow?.definitions?.subgraphs || [])];
      for (const g of graphs) {
        for (const wn of g?.nodes || []) {
          if (String(wn?.id) !== wanted || wn.type !== STUDIO_NAME || !Array.isArray(wn.widgets_values)) continue;
          const i = wn.widgets_values.indexOf(before);
          if (i >= 0) wn.widgets_values[i] = n.inputs.gen_state;
        }
      }
    }
    if (node) {
      node._mmh3LastSeed = used;
      node._mmh3GenBar?.paint();
    }
  }
}

let _hooked = false;
function hookQueue() {
  if (_hooked || typeof api.queuePrompt !== "function") return;
  _hooked = true;
  const queuePrompt = api.queuePrompt;
  api.queuePrompt = async function (number, data, ...rest) {
    try { applySeeds(data); } catch (e) { console.error("[MiniMaxH3 PromptStudio] seed swap failed:", e); }
    return queuePrompt.call(this, number, data, ...rest);
  };
}

/* ---- PlagueKind's Bundle Out, fed by Prompt Studio ------------------------- */

/** Prompt Studio feeding this Bundle Out, if it is. */
function studioUpstream(bo) {
  try {
    const n = bo._getUpstreamIn?.();
    return n?.comfyClass === STUDIO_NAME || n?.type === STUDIO_NAME ? n : null;
  } catch (e) { return null; }
}

/** Bundle Out labels its outputs from the node feeding it, by reading that
 *  node's inputs — which says nothing about what Prompt Studio's bundle
 *  holds. When Studio feeds it, it shows all fifteen, named. */
function adoptBundleOut(bo) {
  if (bo._mmh3Adopted || typeof bo._syncOutputs !== "function") return;
  bo._mmh3Adopted = true;
  const sync = bo._syncOutputs;
  bo._syncOutputs = function (...args) {
    const studio = studioUpstream(this);
    if (studio) {
      this._peerMinSlots = Math.max(this._peerMinSlots || 1, BUNDLE_NAMES.length);
      while (this.outputs.length < BUNDLE_NAMES.length) this.addOutput(`output_${this.outputs.length + 1}`, "*");
    } else if (this._mmh3Fed) {
      // Unplugged from Studio: let it shrink back as it normally would.
      this._peerMinSlots = 1;
    }
    this._mmh3Fed = !!studio;
    // Text Encodes are fed from here now, so a rewire can renumber RefMods.
    if (studio) setTimeout(() => { try { refreshStackLabels(); } catch (e) { /* cosmetic */ } }, 0);
    const r = sync.apply(this, args);
    if (studio) {
      // Nothing past the bundle's end: there's no input_16.
      while (this.outputs.length > BUNDLE_NAMES.length && !this.outputs[this.outputs.length - 1].links?.length) {
        this.removeOutput(this.outputs.length - 1);
      }
      this.outputs.forEach((o, i) => { if (BUNDLE_NAMES[i]) o.label = BUNDLE_NAMES[i]; });
      this.setSize?.(this.computeSize());
    }
    return r;
  };
}

/* ---- workflows saved with the node's older outputs ------------------------- */

const linkTuple = (l) => Array.isArray(l);
const linkField = (l, k) => linkTuple(l) ? l[{ id: 0, origin_id: 1, origin_slot: 2, target_id: 3, target_slot: 4, type: 5 }[k]] : l?.[k];
function setLinkField(l, k, v) {
  if (linkTuple(l)) l[{ id: 0, origin_id: 1, origin_slot: 2, target_id: 3, target_slot: 4, type: 5 }[k]] = v;
  else l[k] = v;
}

/** Take link `id` out of a saved graph: from its list, the input it ends at
 *  and the output it leaves. */
function dropLink(g, id) {
  const at = (g.links || []).findIndex((l) => Number(linkField(l, "id")) === Number(id));
  if (at < 0) return;
  const l = g.links[at];
  g.links.splice(at, 1);
  const node = (nid) => (g.nodes || []).find((n) => String(n?.id) === String(nid));
  const to = node(linkField(l, "target_id"))?.inputs?.[linkField(l, "target_slot")];
  if (to && Number(to.link) === Number(id)) to.link = null;
  const from = node(linkField(l, "origin_id"))?.outputs?.[linkField(l, "origin_slot")];
  if (Array.isArray(from?.links)) from.links = from.links.filter((x) => Number(x) !== Number(id));
}

/** Bring each Prompt Studio saved before 3.6.0 up to its current shape,
 *  working on the saved JSON before it loads so every link lands where it
 *  was meant to:
 *   - its fl2va_model / ref2va_model inputs go, with their links, and any
 *     link into an input after them follows it to its new position;
 *   - its outputs become the one bundle, with a PlagueKind Bundle Out beside
 *     it taking over their links by name (the old `model` output's links are
 *     dropped: there's no checkpoint on the bundle).
 *  Returns how many nodes changed. Exported for the tests. */
export function migrateOutputs(graphData) {
  if (!graphData) return 0;
  const graphs = [graphData, ...(graphData.definitions?.subgraphs || [])];
  let maxNode = 0, maxLink = 0;
  for (const g of graphs) {
    for (const n of g?.nodes || []) maxNode = Math.max(maxNode, Number(n?.id) || 0);
    for (const l of g?.links || []) maxLink = Math.max(maxLink, Number(linkField(l, "id")) || 0);
  }
  maxNode = Math.max(maxNode, Number(graphData.last_node_id) || 0, Number(graphData.state?.lastNodeId) || 0);
  maxLink = Math.max(maxLink, Number(graphData.last_link_id) || 0, Number(graphData.state?.lastLinkId) || 0);

  let moved = 0;
  for (const g of graphs) {
    for (const studio of [...(g?.nodes || [])]) {
      if (studio?.type !== STUDIO_NAME) continue;
      let changed = false;
      const byId = () => new Map((g.links || []).map((l) => [Number(linkField(l, "id")), l]));

      // The checkpoint inputs.
      if (Array.isArray(studio.inputs) && studio.inputs.some((x) => DROPPED_INPUTS.includes(x?.name))) {
        for (const x of studio.inputs) if (DROPPED_INPUTS.includes(x?.name) && x.link != null) dropLink(g, x.link);
        studio.inputs = studio.inputs.filter((x) => !DROPPED_INPUTS.includes(x?.name));
        const links = byId();
        studio.inputs.forEach((x, i) => { const l = x?.link != null ? links.get(Number(x.link)) : null; if (l) setLinkField(l, "target_slot", i); });
        changed = true;
      }

      // The outputs.
      if (Array.isArray(studio.outputs) && !(studio.outputs.length === 1 && studio.outputs[0]?.type === "BUNDLE")) {
        const old = studio.outputs;
        for (const [i, o] of old.entries()) {
          if (DROPPED_OUTPUTS.includes(o?.name) || (!o?.name && i === 0)) for (const id of [...(o?.links || [])]) dropLink(g, id);
        }
        // By name; an output from an older naming keeps its position, less the
        // model that led them.
        const used = old.map((o, i) => {
          const named = STUDIO_BUNDLE.indexOf(o?.name);
          const slot = DROPPED_OUTPUTS.includes(o?.name) ? -1 : named >= 0 ? named : i - 1;
          return { slot, links: (o?.links || []).filter((id) => id != null) };
        }).filter((u) => u.slot >= 0 && u.links.length);
        studio.outputs = [{ name: "bundle", type: "BUNDLE", links: [], slot_index: 0 }];
        changed = true;
        if (used.length) {
          const boId = ++maxNode, feed = ++maxLink;
          const last = Math.max(...used.map((u) => u.slot));
          const outputs = [];
          for (let i = 0; i <= last; i++) {
            outputs.push({ name: `output_${i + 1}`, label: STUDIO_BUNDLE[i] || `output_${i + 1}`, type: "*",
              links: used.filter((u) => u.slot === i).flatMap((u) => u.links), slot_index: i });
          }
          const links = byId();
          for (const u of used) {
            for (const id of u.links) {
              const l = links.get(Number(id));
              if (!l) continue;
              setLinkField(l, "origin_id", boId);
              setLinkField(l, "origin_slot", u.slot);
              setLinkField(l, "type", "*");
            }
          }
          // In the format this graph already uses: [id, from, slot, to, slot,
          // type] in a classic workflow, objects in subgraphs and the newer schema.
          g.links.push(!g.links.length || linkTuple(g.links[0])
            ? [feed, studio.id, 0, boId, 0, "BUNDLE"]
            : { id: feed, origin_id: studio.id, origin_slot: 0, target_id: boId, target_slot: 0, type: "BUNDLE" });
          studio.outputs[0].links = [feed];
          const pos = Array.isArray(studio.pos) ? studio.pos : [studio.pos?.[0] || 0, studio.pos?.[1] || 0];
          const size = Array.isArray(studio.size) ? studio.size : [594, 600];
          g.nodes.push({
            id: boId, type: BUNDLE_OUT,
            pos: [pos[0] + size[0] + 40, pos[1]], size: [180, 30 + outputs.length * 20],
            flags: {}, order: (Number(studio.order) || 0) + 1, mode: 0,
            inputs: [{ name: "bundle", type: "BUNDLE", link: feed }],
            outputs, properties: { "Node name for S&R": BUNDLE_OUT }, widgets_values: [],
          });
        }
      }
      if (changed) moved++;
    }
  }
  if (moved) {
    if ("last_node_id" in graphData) graphData.last_node_id = maxNode;
    if ("last_link_id" in graphData) graphData.last_link_id = maxLink;
    if (graphData.state && typeof graphData.state === "object") {
      graphData.state.lastNodeId = maxNode;
      graphData.state.lastLinkId = maxLink;
    }
  }
  return moved;
}

const bundleOutInstalled = () => !!globalThis.LiteGraph?.registered_node_types?.[BUNDLE_OUT];

let _warned = false;
function warnNoBundleOut() {
  if (_warned || bundleOutInstalled()) return;
  _warned = true;
  toast("Prompt Studio sends everything on one bundle, unpacked by PlagueKind's Bundle Out node — "
    + "install ComfyUI-PlagueKind-Nodes (github.com/PlagueKind/ComfyUI-PlagueKind-Nodes) to use it.", 9000);
}

/** Right-click on Prompt Studio: a Bundle Out beside it, wired to its bundle. */
export function addBundleOut(node) {
  if (!bundleOutInstalled()) { _warned = false; warnNoBundleOut(); return null; }
  const bo = globalThis.LiteGraph.createNode(BUNDLE_OUT);
  if (!bo) return null;
  bo.pos = [node.pos[0] + node.size[0] + 40, node.pos[1]];
  (node.graph || app.graph).add(bo);
  node.connect(0, bo, 0);
  setTimeout(() => { try { bo._syncOutputs?.(); } catch (e) { /* cosmetic */ } }, 0);
  return bo;
}

app.registerExtension({
  name: "MiniMaxH3Plus.GenSettings",
  setup() { hookQueue(); },
  nodeCreated(node) {
    if (node?.comfyClass === BUNDLE_OUT || node?.type === BUNDLE_OUT) adoptBundleOut(node);
    if (node?.comfyClass === STUDIO_NAME) setTimeout(warnNoBundleOut, 1500);
  },
  beforeConfigureGraph(graphData, missingNodeTypes) {
    try {
      const n = migrateOutputs(graphData);
      if (!n) return;
      console.log(`[MiniMaxH3 PromptStudio] ${n} Prompt Studio node(s) saved before 3.6.0 now send one `
        + "bundle (links moved onto a Bundle Out beside each); their model inputs and output are gone.");
      if (!bundleOutInstalled() && Array.isArray(missingNodeTypes) && !missingNodeTypes.includes(BUNDLE_OUT)) {
        missingNodeTypes.push(BUNDLE_OUT);
      }
      setTimeout(() => toast(`Prompt Studio now sends one bundle: ${n > 1 ? "each" : "its"} older outputs moved onto `
        + "a Bundle Out beside it. Its model inputs and output are gone \u2014 load the model with Load Diffusion "
        + "Model, fed by the bundle's model_name.", 9000), 500);
    } catch (e) {
      console.error("[MiniMaxH3 PromptStudio] couldn't move the older outputs onto a Bundle Out:", e);
    }
  },
});

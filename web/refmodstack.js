/* MiniMax H3 RefMod Stack — frontend
 * On-node panel listing the picked RefMods with a weight per channel, a
 * thumbnail library to pick from, and a readout of the labels
 * H3 RefMod Text Encode will assign. The pure helpers (weights, labels)
 * are exported so the Prompt Builder shows the same numbers.
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyCanvasSizing, postApi, STUDIO_NAME, viewURL, openCropEditor } from "./medialoader.js";

export const STACK_NAME = "MiniMaxH3StudioRefModStack";
// The RefMod Stack types this builder recognises when walking a mods chain
// (see modsChain() in promptbuilder.js) — this pack's own, and the original
// Adudeguyman pack's `MiniMaxH3RefModStack`. The two packs are meant to sit
// side by side, so a stack a workflow already made with either family is
// adopted rather than getting a second, parallel stack of the other's type.
// STACK_NAME alone (not this set) is what gets created when neither is
// found: creating a node needs one concrete type, recognising one doesn't.
export const STACK_NAMES = new Set([STACK_NAME, "MiniMaxH3RefModStack"]);
// Every Text Encode whose bundle this builder can drive and label from:
// this pack's own, the original Adudeguyman pack's, and
// ComfyUI-MiniMaxH3Mod's `MiniMaxH3RefModTextEncode` — all three number and
// label a bundle the same way.
export const ENCODE_NAMES = new Set(["MiniMaxH3StudioRefModTextEncode",
  "MiniMaxH3FantasticRefModTextEncode", "MiniMaxH3RefModTextEncode"]);
export const MAX_WEIGHT = 10;
export const MAX_COPIES = 10;
export const KIND = {
  image: { label: "Picture", cls: "pic", short: "IMG" },
  video: { label: "Video", cls: "vid", short: "VID" },
  audio: { label: "Audio", cls: "aud", short: "AUD" },
};
const NODE_W = 560;
const PANEL_H = 430;

/* ---------------------------------------------------------------- utils */

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k in e && k !== "list") { try { e[k] = v; } catch (_) { e.setAttribute(k, v); } }
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

/** replaceChildren that flattens arrays and drops null/false, like el(). */
function setChildren(parent, ...kids) {
  parent.replaceChildren(...kids.flat(Infinity).filter((c) => c != null && c !== false)
    .map((c) => c.nodeType ? c : document.createTextNode(String(c))));
}

export function previewURL(name) {
  return api.apiURL(`/minimax_h3_plus/refmods/preview?name=${encodeURIComponent(name)}`);
}

function toast(msg, ms = 2200) {
  const t = el("div", { class: "mmrp-toast" }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, ms);
}

const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ----------------------------------------------------- pure helpers */

/** 2.7 -> [1, 1, 0.7]: whole units are full copies, the rest a softer one. */
export function expandWeight(w) {
  w = clamp(Number(w) || 0, 0, MAX_WEIGHT);
  if (w <= 0) return [];
  const whole = Math.floor(w + 1e-9);
  const rem = +(w - whole).toFixed(4);
  const out = Array(whole).fill(1);
  if (rem > 1e-6) out.push(rem);
  return out;
}

export function channelStrengths(ch) {
  if (!ch || typeof ch !== "object") return [];
  if (ch.mode === "sc") {
    const s = clamp(Number(ch.s) || 0, 0, 1);
    const c = clamp(Math.round(Number(ch.c) || 1), 1, MAX_COPIES);
    return s > 0 ? Array(c).fill(s) : [];
  }
  return expandWeight(ch.w ?? 1);
}

export function readStack(node) {
  const w = node?.widgets?.find((x) => x.name === "stack_state");
  let state = null;
  try { state = JSON.parse(w?.value || "{}"); } catch (e) { state = null; }
  if (Array.isArray(state)) state = { picks: state };
  if (!state || typeof state !== "object") state = {};
  return { picks: Array.isArray(state.picks) ? state.picks : [],
           budget: Math.max(0, parseInt(state.budget, 10) || 0) };
}

/** Bundle entries in send order: for each pick that is on, its look then
 *  its voice, each channel expanded to its strengths. */
export function deriveEntries(picks) {
  const out = [];
  for (const p of picks || []) {
    if (!p || p.on === false) continue;
    for (const key of ["visual", "audio"]) {
      const ch = p[key];
      if (!ch || !ch.file) continue;
      const strengths = channelStrengths(ch);
      out.push({ uid: p.uid, key, name: p.label || p.name, file: ch.file,
        kind: ch.kind || (key === "audio" ? "audio" : "image"),
        tokens: ch.tokens || 0, preview: p.preview || null,
        strengths, on: strengths.length > 0 });
    }
  }
  return out;
}

/** Number the entries the way Text Encode does: one counter per kind, in
 *  bundle order, every copy numbered. */
export function labelGroups(entries) {
  const count = { image: 0, video: 0, audio: 0 };
  return entries.map((e) => {
    const k = count[e.kind] == null ? "image" : e.kind;
    const nums = e.strengths.map(() => ++count[k]);
    return { ...e, kind: k, nums };
  });
}

export const tagOf = (kind, n) => `<${KIND[kind].label} ${n}>`;

export function rangeText(g) {
  if (!g.nums.length) return "";
  const a = g.nums[0], b = g.nums[g.nums.length - 1];
  return a === b ? tagOf(g.kind, a) : `<${KIND[g.kind].label} ${a}–${b}>`;
}

function readout(g, ch) {
  if (!g.strengths.length) return "0 · skipped";
  const n = g.strengths.length;
  const ent = `${n} ${n === 1 ? "entry" : "entries"}`;
  const tok = `${fmt(n * g.tokens)} tok`;
  if (ch.mode === "sc") return `${Number(ch.s).toFixed(2)} × ${n} · ${ent} · ${tok}`;
  if (n === 1) return `${g.strengths[0].toFixed(2)} · ${ent} · ${tok}`;
  const whole = g.strengths.filter((x) => x === 1).length;
  const rem = g.strengths.find((x) => x < 1);
  return `×${whole}${rem ? ` + ${rem.toFixed(2)}` : ""} · ${ent} · ${tok}`;
}

/* ------------------------------------------------------------- CSS */

const CSS = `
.mmrp-panel{font-family:system-ui,sans-serif;color:#d7dbe2;font-size:calc(12px * var(--mmh3-fs, 1));
  display:flex;flex-direction:column;gap:7px;height:100%;min-height:0;box-sizing:border-box;padding:6px 8px 8px;}
.mmrp-panel *{box-sizing:border-box;}
.mmrp-btn{background:#2b3140;border:1px solid #3a4252;color:#d7dbe2;border-radius:6px;
  padding:4px 10px;font-size:calc(11px * var(--mmh3-fs, 1));cursor:pointer;white-space:nowrap;font-family:inherit;}
.mmrp-btn:hover{background:#343b4c;}
.mmrp-btn.primary{background:#3f5a86;border-color:#4d6ea6;color:#fff;}
.mmrp-btn.primary:hover{background:#48679a;}
.mmrp-btn:disabled{opacity:.45;cursor:default;}
.mmrp-toolbar{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
.mmrp-count{margin-left:auto;font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;font-variant-numeric:tabular-nums;}
.mmrp-stack{display:flex;flex-direction:column;gap:5px;flex:1 1 auto;min-height:0;overflow:auto;}
.mmrp-row{display:grid;grid-template-columns:16px 44px minmax(0,1fr) auto;gap:7px;align-items:start;
  background:#191c22;border:1px solid #303642;border-radius:7px;padding:5px 7px 5px 3px;}
.mmrp-row.off{opacity:.45;}
.mmrp-row.dragging{outline:1px dashed #4d6ea6;}
.mmrp-row.drop-before{box-shadow:0 -2px 0 #4d6ea6;}
.mmrp-row.missing{border-color:#7a4a3a;}
.mmrp-grip{border:0;background:none;color:#6b7484;cursor:grab;padding:2px 0;font-size:calc(13px * var(--mmh3-fs, 1));
  line-height:1;align-self:center;font-family:inherit;}
.mmrp-thumb{width:44px;height:44px;border-radius:5px;background:#101217;object-fit:cover;display:flex;
  align-items:center;justify-content:center;font-family:ui-monospace,monospace;font-size:calc(9px * var(--mmh3-fs, 1));
  font-weight:600;color:#6b7484;overflow:hidden;}
.mmrp-main{min-width:0;display:flex;flex-direction:column;gap:3px;}
.mmrp-title{display:flex;align-items:baseline;gap:8px;min-width:0;}
.mmrp-name{font-weight:600;font-size:calc(12px * var(--mmh3-fs, 1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mmrp-path{font-family:ui-monospace,monospace;font-size:calc(9.5px * var(--mmh3-fs, 1));color:#6b7484;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
.mmrp-warn{color:#e3a64a;font-size:calc(10px * var(--mmh3-fs, 1));}
.mmrp-chan{display:grid;grid-template-columns:32px auto minmax(0,1fr);gap:5px;align-items:center;}
.mmrp-kind{font-family:ui-monospace,monospace;font-weight:600;font-size:calc(9px * var(--mmh3-fs, 1));letter-spacing:.05em;
  text-align:center;border-radius:4px;padding:2px 0;border:1px solid;}
.mmrp-kind.pic{color:#e0a94c;border-color:#8a6a2c;} .mmrp-kind.vid{color:#4cc3e0;border-color:#2c6f81;}
.mmrp-kind.aud{color:#b48ce8;border-color:#5d4a86;}
.mmrp-mode{display:inline-flex;border:1px solid #3a4252;border-radius:5px;overflow:hidden;}
.mmrp-mode button{border:0;background:#12151b;color:#8a93a3;font-size:calc(10px * var(--mmh3-fs, 1));padding:2px 6px;
  cursor:pointer;font-family:inherit;}
.mmrp-mode button.on{background:#2b3140;color:#d7dbe2;}
.mmrp-ctl{display:flex;align-items:center;gap:5px;min-width:0;}
.mmrp-ctl input[type=range]{flex:1;min-width:50px;accent-color:#4d6ea6;margin:0;}
.mmrp-num{width:56px;background:#12151b;border:1px solid #3a4252;border-radius:5px;padding:2px 5px;
  font-size:calc(11px * var(--mmh3-fs, 1));font-variant-numeric:tabular-nums;color:#d7dbe2;font-family:inherit;}
.mmrp-num.sm{width:54px;}
.mmrp-dim{color:#6b7484;}
.mmrp-meta{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:3px 10px;align-items:baseline;
  font-size:calc(10px * var(--mmh3-fs, 1));color:#8a93a3;font-variant-numeric:tabular-nums;}
.mmrp-tag{font-family:ui-monospace,monospace;}
.mmrp-tag.pic{color:#e0a94c;} .mmrp-tag.vid{color:#4cc3e0;} .mmrp-tag.aud{color:#b48ce8;}
.mmrp-side{display:flex;flex-direction:column;align-items:center;gap:5px;}
.mmrp-sw{position:relative;width:28px;height:16px;display:inline-block;cursor:pointer;}
.mmrp-sw input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer;}
.mmrp-sw span{position:absolute;inset:0;background:#2a2f3a;border:1px solid #3a4252;border-radius:9px;}
.mmrp-sw span::after{content:"";position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#8a93a3;
  transition:transform .15s;}
.mmrp-sw input:checked+span{background:#34507d;border-color:#4d6ea6;}
.mmrp-sw input:checked+span::after{transform:translateX(12px);background:#e9eef7;}
.mmrp-x{border:0;background:none;color:#6b7484;cursor:pointer;font-size:calc(15px * var(--mmh3-fs, 1));line-height:1;padding:0 3px;}
.mmrp-x:hover{color:#e07a6a;}
.mmrp-empty{border:1px dashed #3a4252;border-radius:7px;padding:14px;text-align:center;color:#8a93a3;}
.mmrp-foot{display:grid;grid-template-columns:1fr auto;gap:5px 12px;border-top:1px solid #303642;padding-top:6px;
  align-items:start;flex:0 0 auto;}
.mmrp-total{font-size:calc(11px * var(--mmh3-fs, 1));font-variant-numeric:tabular-nums;}
.mmrp-total b{font-weight:600;}
.mmrp-budget{display:flex;align-items:center;gap:5px;font-size:calc(10px * var(--mmh3-fs, 1));color:#8a93a3;}
.mmrp-budget .mmrp-num{width:72px;}
.mmrp-over{grid-column:1/-1;color:#e3a64a;font-size:calc(11px * var(--mmh3-fs, 1));}
.mmrp-labels{grid-column:1/-1;background:#12151b;border:1px solid #23272f;border-radius:6px;padding:5px 8px;
  font-family:ui-monospace,monospace;font-size:calc(10.5px * var(--mmh3-fs, 1));line-height:1.55;color:#8a93a3;
  max-height:84px;overflow:auto;}
.mmrp-labels .lh{font-family:system-ui,sans-serif;font-weight:600;font-size:calc(9px * var(--mmh3-fs, 1));
  letter-spacing:.07em;text-transform:uppercase;color:#6b7484;margin-bottom:2px;}
.mmrp-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(12px);opacity:0;pointer-events:none;
  background:#232a38;border:1px solid #4d6ea6;color:#d7dbe2;font:calc(12px * var(--mmh3-fs, 1)) system-ui,sans-serif;
  padding:7px 14px;border-radius:7px;transition:opacity .2s,transform .2s;z-index:10200;}
.mmrp-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}

/* library */
.mmrp-overlay{position:fixed;inset:0;z-index:10050;background:rgba(8,10,14,.62);display:flex;align-items:center;
  justify-content:center;font-family:system-ui,sans-serif;color:#d7dbe2;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmrp-overlay *{box-sizing:border-box;}
.mmrp-modal{width:min(1100px,95vw);height:min(760px,92vh);display:flex;flex-direction:column;background:#191c22;
  border:1px solid #303642;border-radius:10px;box-shadow:0 24px 64px rgba(0,0,0,.55);overflow:hidden;}
.mmrp-head{display:flex;align-items:center;gap:10px;padding:9px 13px;background:#1e222a;border-bottom:1px solid #2a2f3a;}
.mmrp-head strong{font-size:calc(13.5px * var(--mmh3-fs, 1));font-weight:600;}
.mmrp-head small{color:#8a93a3;font-size:calc(11px * var(--mmh3-fs, 1));}
.mmrp-grow{flex:1;}
.mmrp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 13px;border-bottom:1px solid #23272f;background:#171a20;}
.mmrp-search{flex:1 1 200px;background:#12151b;border:1px solid #3a4252;border-radius:6px;padding:4px 9px;
  font-size:calc(12px * var(--mmh3-fs, 1));color:#d7dbe2;font-family:inherit;}
.mmrp-seg{display:inline-flex;border:1px solid #3a4252;border-radius:6px;overflow:hidden;}
.mmrp-seg button{border:0;border-right:1px solid #3a4252;background:#12151b;color:#8a93a3;padding:3px 9px;
  font-size:calc(11px * var(--mmh3-fs, 1));cursor:pointer;font-family:inherit;}
.mmrp-seg button:last-child{border-right:0;}
.mmrp-seg button.on{background:#2b3140;color:#d7dbe2;}
.mmrp-sel{background:#12151b;border:1px solid #3a4252;border-radius:6px;padding:3px 6px;
  font-size:calc(11px * var(--mmh3-fs, 1));color:#d7dbe2;font-family:inherit;}
.mmrp-body{display:grid;grid-template-columns:180px minmax(0,1fr);flex:1;min-height:0;}
.mmrp-folders{border-right:1px solid #23272f;padding:8px 6px;display:flex;flex-direction:column;gap:1px;background:#16191e;
  overflow:auto;}
.mmrp-fh{font-weight:600;font-size:calc(9px * var(--mmh3-fs, 1));letter-spacing:.07em;text-transform:uppercase;color:#6b7484;padding:4px 8px 6px;}
.mmrp-folders button{display:flex;justify-content:space-between;gap:6px;border:0;background:none;color:#8a93a3;text-align:left;
  padding:4px 8px;border-radius:5px;font-size:calc(11.5px * var(--mmh3-fs, 1));cursor:pointer;font-family:inherit;}
.mmrp-folders button:hover{background:#1f232b;}
.mmrp-folders button.on{background:#232a38;color:#d7dbe2;}
.mmrp-folders button span:last-child{font-variant-numeric:tabular-nums;color:#6b7484;}
.mmrp-roots{font-family:ui-monospace,monospace;font-size:calc(9.5px * var(--mmh3-fs, 1));color:#6b7484;padding:10px 8px 0;
  border-top:1px solid #23272f;margin-top:8px;overflow-wrap:anywhere;}
.mmrp-grid{padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));grid-auto-rows:max-content;gap:9px;align-content:start;overflow:auto;}
.mmrp-card{display:flex;flex-direction:column;background:#1d2027;border:1px solid #303642;border-radius:8px;overflow:hidden;}
.mmrp-card.instack{border-color:#4d6ea6;}
.mmrp-cthumb{width:100%;height:120px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:#101217;
  color:#6b7484;font-family:ui-monospace,monospace;font-size:calc(11px * var(--mmh3-fs, 1));font-weight:600;overflow:hidden;}
.mmrp-cthumb img{width:100%;height:100%;object-fit:cover;display:block;}
.mmrp-cbody{padding:7px 8px 8px;display:flex;flex-direction:column;gap:5px;flex:0 0 auto;}
.mmrp-cname{font-weight:600;font-size:calc(12px * var(--mmh3-fs, 1));display:flex;gap:6px;align-items:baseline;min-width:0;}
.mmrp-cname span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mmrp-cfolder{font-family:ui-monospace,monospace;font-size:calc(9.5px * var(--mmh3-fs, 1));color:#6b7484;margin-left:auto;flex:0 0 auto;}
.mmrp-badges{display:flex;flex-wrap:wrap;gap:4px;}
.mmrp-b{font-family:ui-monospace,monospace;font-size:calc(9.5px * var(--mmh3-fs, 1));border:1px solid #3a4252;border-radius:4px;
  padding:0 5px;color:#8a93a3;font-variant-numeric:tabular-nums;}
.mmrp-b.pic{color:#e0a94c;border-color:#8a6a2c;} .mmrp-b.vid{color:#4cc3e0;border-color:#2c6f81;} .mmrp-b.aud{color:#b48ce8;border-color:#5d4a86;}
.mmrp-b.pair{color:#d7dbe2;} .mmrp-b.warn{color:#e3a64a;border-color:#7a5a2c;}
.mmrp-cdesc{font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;line-height:1.4;flex:1;}
.mmrp-cfiles{font-family:ui-monospace,monospace;font-size:calc(9.5px * var(--mmh3-fs, 1));color:#6b7484;overflow-wrap:anywhere;}
.mmrp-status{grid-column:1/-1;color:#8a93a3;padding:24px;text-align:center;}
.mmrp-status.err{color:#e07a6a;}
/* library: tabs, inspector, create */
.mmrp-tabs{display:inline-flex;border:1px solid #3a4252;border-radius:6px;overflow:hidden;margin-left:8px;}
.mmrp-tab{border:0;border-right:1px solid #3a4252;background:#12151b;color:#8a93a3;padding:3px 11px;
  font-size:calc(11px * var(--mmh3-fs, 1));cursor:pointer;font-family:inherit;}
.mmrp-tab:last-child{border-right:0;} .mmrp-tab.on{background:#2b3140;color:#d7dbe2;}
.mmrp-pane{display:flex;flex-direction:column;flex:1;min-height:0;}
.mmrp-pane[hidden]{display:none;}
.mmrp-body.withinspector{grid-template-columns:180px minmax(0,1fr) 300px;}
.mmrp-card.selected{border-color:#7fa3dd;box-shadow:0 0 0 1px #7fa3dd inset;}
.mmrp-card.new{border-color:#3fb2a8;}
.mmrp-card{cursor:pointer;}
.mmrp-cactions{display:flex;gap:5px;}
.mmrp-cactions .mmrp-btn{flex:1 1 0;min-width:0;text-align:center;padding:4px 6px;overflow:hidden;text-overflow:ellipsis;}
.mmrp-inspector{border-left:1px solid #23272f;background:#16191e;padding:10px;display:flex;flex-direction:column;gap:8px;overflow:auto;}
/* An explicit display beats the hidden attribute, so hide it by hand — or a
   deselected panel wraps into the grid's next row under the folder list. */
.mmrp-inspector[hidden]{display:none;}
.mmrp-inspector>*{flex:0 0 auto;}
.mmrp-ithumb{width:100%;height:150px;flex:0 0 auto;background:#101217;border-radius:6px;display:flex;align-items:center;justify-content:center;
  color:#6b7484;font-family:ui-monospace,monospace;font-size:calc(11px * var(--mmh3-fs, 1));overflow:hidden;}
.mmrp-ithumb img{width:100%;height:100%;object-fit:contain;display:block;}
.mmrp-iactions{display:flex;gap:6px;flex-wrap:wrap;} .mmrp-iactions .mmrp-btn{flex:1;}
.mmrp-btn.danger{border-color:#7a4a3a;color:#e0a090;} .mmrp-btn.danger:hover{background:#3a2622;}
.mmrp-ilabel{display:flex;flex-direction:column;gap:3px;font-size:calc(10px * var(--mmh3-fs, 1));letter-spacing:.05em;
  text-transform:uppercase;color:#6b7484;font-weight:600;}
.mmrp-ilabel input,.mmrp-ilabel select,.mmrp-ilabel textarea{text-transform:none;letter-spacing:0;font-weight:400;width:100%;flex:0 0 auto;}
.mmrp-srcmain .mmrp-search,.mmrp-inspector .mmrp-search{flex:0 0 auto;}
.mmrp-ta{background:#12151b;border:1px solid #3a4252;border-radius:6px;padding:4px 8px;color:#d7dbe2;font-family:inherit;
  font-size:calc(12px * var(--mmh3-fs, 1));resize:vertical;}
.mmrp-idetails{display:flex;flex-direction:column;gap:4px;font-size:calc(10.5px * var(--mmh3-fs, 1));color:#8a93a3;
  border-top:1px solid #23272f;padding-top:8px;}
.mmrp-irow{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;} .mmrp-irow>span:first-child{color:#6b7484;}
.mmrp-irow .mmrp-cfiles{white-space:pre-wrap;}
.mmrp-isection{display:flex;flex-direction:column;gap:6px;border-top:1px solid #23272f;padding-top:8px;}
.mmrp-isection .mmrp-seg{align-self:flex-start;}
.mmrp-isection .mmrp-btn{align-self:flex-start;}
.mmrp-isection input[type=range]{flex:1;accent-color:#4d6ea6;margin:0;}
.mmrp-isection .mmrp-inline{width:100%;}
.mmrp-isub{font-size:calc(10.5px * var(--mmh3-fs, 1));}
.mmrp-istored{display:flex;flex-direction:column;gap:6px;}
.mmrp-iframes{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:5px;}
.mmrp-iframe{position:relative;aspect-ratio:1;background:#101217;border-radius:5px;overflow:hidden;cursor:zoom-in;}
.mmrp-iframe img{width:100%;height:100%;object-fit:contain;display:block;}
.mmrp-iframe span{position:absolute;left:3px;bottom:2px;font-size:calc(9px * var(--mmh3-fs, 1));color:#d7dbe2;
  background:rgba(8,10,14,.7);border-radius:3px;padding:0 4px;}
.mmrp-iframe.new{outline:1px dashed #6b8fd6;}
.mmrp-iframe .mmrp-ftools{position:absolute;right:2px;top:2px;display:none;gap:2px;}
.mmrp-iframe:hover .mmrp-ftools,.mmrp-iframe:focus-within .mmrp-ftools{display:flex;}
.mmrp-ftools button{background:rgba(8,10,14,.8);color:#d7dbe2;border:1px solid #3a4252;border-radius:3px;
  width:18px;height:18px;line-height:16px;padding:0;font-size:calc(11px * var(--mmh3-fs, 1));cursor:pointer;}
.mmrp-ftools button:hover{background:#343b4c;} .mmrp-ftools button.x:hover{background:#5a2a24;color:#fff;}
.mmrp-iframe.drag{opacity:.4;} .mmrp-iframe.over{outline:2px solid #6b8fd6;}
.mmrp-iclip{width:100%;border-radius:6px;background:#101217;display:block;}
.mmrp-iaudio{width:100%;height:30px;}
.mmrp-err{color:#e07a6a;font-size:calc(11px * var(--mmh3-fs, 1));}
.mmrp-istatus{font-size:calc(11px * var(--mmh3-fs, 1));color:#8fcf8f;min-height:16px;} .mmrp-istatus.err{color:#e07a6a;}
.mmrp-inline{display:inline-flex;align-items:center;gap:6px;font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;}
.mmrp-cbar{display:flex;align-items:center;gap:10px;padding:8px 13px;border-bottom:1px solid #23272f;background:#171a20;}
.mmrp-createbody{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px;padding:10px 13px;flex:1;min-height:0;overflow:auto;}
.mmrp-ccol{display:flex;flex-direction:column;gap:8px;min-width:0;}
.mmrp-drop{border:1px dashed #3a4252;border-radius:8px;padding:18px;text-align:center;color:#8a93a3;cursor:pointer;}
.mmrp-drop.over{border-color:#4d6ea6;background:#1b2130;color:#d7dbe2;}
.mmrp-modal{position:relative;}
.mmrp-stackmodal{width:min(720px,94vw);height:min(640px,90vh);display:flex;flex-direction:column;background:#191c22;
  border:1px solid #303642;border-radius:10px;box-shadow:0 24px 64px rgba(0,0,0,.55);overflow:hidden;}
.mmrp-stackbody{flex:1;min-height:0;display:flex;flex-direction:column;}
.mmrp-stackbody .mmrp-panel{flex:1;height:auto;padding:10px 12px 12px;}
.mmrp-modal.dropping::after{content:"Drop to add to Create";position:absolute;inset:6px;z-index:5;pointer-events:none;
  display:flex;align-items:center;justify-content:center;border:2px dashed #4d6ea6;border-radius:8px;
  background:rgba(27,33,48,.82);color:#d7dbe2;font-size:calc(15px * var(--mmh3-fs, 1));font-weight:600;}
.mmrp-sources{display:flex;flex-direction:column;gap:6px;}
.mmrp-src{display:grid;grid-template-columns:14px auto 160px minmax(0,1fr) auto;gap:10px;align-items:start;background:#191c22;
  border:1px solid #303642;border-radius:7px;padding:7px 8px;}
.mmrp-src.off{opacity:.5;} .mmrp-src>input{margin-top:5px;}
.mmrp-srcleft{display:flex;flex-direction:column;gap:5px;align-items:stretch;}
.mmrp-srcleft .mmrp-kind{align-self:flex-start;padding:2px 8px;}
.mmrp-sprev{position:relative;width:160px;height:100px;background:#101217;border-radius:6px;overflow:hidden;display:flex;
  flex-direction:column;align-items:center;justify-content:center;gap:4px;}
.mmrp-sprev img,.mmrp-sprev video{width:100%;height:100%;object-fit:contain;display:block;}
.mmrp-sprev canvas{width:100%;height:56px;display:block;}
.mmrp-sprev canvas[width="320"]{height:100%;}
.mmrp-sprev audio{width:100%;height:26px;}
.mmrp-sprevtag{position:absolute;right:5px;bottom:4px;font-size:calc(9px * var(--mmh3-fs, 1));color:#d7dbe2;
  background:rgba(8,10,14,.7);border-radius:4px;padding:1px 5px;pointer-events:none;}
.mmrp-srcmain{display:flex;flex-direction:column;gap:4px;min-width:0;}
.mmrp-form{display:flex;flex-direction:column;gap:8px;background:#191c22;border:1px solid #303642;border-radius:8px;padding:10px;}
.mmrp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.mmrp-note{display:flex;flex-direction:column;gap:6px;background:#12151b;border:1px solid #23272f;border-radius:6px;
  padding:7px 9px;font-size:calc(11px * var(--mmh3-fs, 1));line-height:1.45;color:#8a93a3;}
.mmrp-noterow{opacity:.55;} .mmrp-noterow.on{opacity:1;color:#c3c9d3;}
.mmrp-notehead{display:flex;justify-content:space-between;gap:8px;margin-bottom:1px;}
.mmrp-notehead b{font-weight:600;color:#d7dbe2;} .mmrp-notehead i{font-style:normal;color:#8a93a3;} .mmrp-notehead span{font-variant-numeric:tabular-nums;color:#7fa3dd;}
.mmrp-notefoot{border-top:1px solid #23272f;padding-top:6px;font-size:calc(10.5px * var(--mmh3-fs, 1));color:#6b7484;}
.mmrp-grid2 .mmrp-num{width:100%;}
.mmrp-crow{display:flex;gap:6px;} .mmrp-crow .mmrp-btn{flex:1;padding:7px 10px;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmrp-srcbar{display:flex;flex-direction:column;gap:7px;}
.mmrp-srcbar .mmrp-seg{align-self:flex-start;}
.mmrp-srchint{font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;line-height:1.45;}
.mmrp-numhint{display:block;font-size:calc(10px * var(--mmh3-fs, 1));margin-top:2px;}
.mmrp-srchint.warn,.mmrp-fitcap.warn{color:#e3a64a;}
.mmrp-fitcap{font-size:calc(10.5px * var(--mmh3-fs, 1));color:#8a93a3;}
.mmrp-srcacts{display:flex;gap:6px;margin-top:2px;}
.mmrp-srcacts .mmrp-btn{padding:2px 9px;}
.mmrp-src .mmrp-grip{align-self:center;}
.mmrp-src.dragging{outline:1px dashed #4d6ea6;}
.mmrp-src.drop-before{box-shadow:0 -2px 0 #4d6ea6;}
.mmrp-srctitle{display:flex;align-items:center;gap:8px;min-width:0;}
.mmrp-srctitle b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mmrp-framechip{font-size:calc(9.5px * var(--mmh3-fs, 1));border:1px solid #4d6ea6;color:#b9cdef;border-radius:10px;padding:0 7px;flex:0 1 auto;line-height:1.5;}
.mmrp-srctitle{flex-wrap:wrap;}
.mmrp-sprev{cursor:zoom-in;}
.mmrp-peekbig{position:fixed;z-index:10070;background:#1e222a;border:1px solid #3a4252;border-radius:10px;padding:6px;
  box-shadow:0 18px 48px rgba(0,0,0,.6);pointer-events:none;display:flex;flex-direction:column;gap:5px;
  font-family:system-ui,sans-serif;}
.mmrp-peekstage{width:440px;height:330px;max-width:60vw;max-height:60vh;background:#101217;border-radius:6px;overflow:hidden;
  display:flex;align-items:center;justify-content:center;}
.mmrp-peekcanvas,.mmrp-peekvideo{width:100%;height:100%;object-fit:contain;display:block;}
.mmrp-peekcap{font-size:calc(11px * var(--mmh3-fs, 1));color:#c3c9d3;padding:0 2px;max-width:440px;}
.mmrp-budgetline{font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;line-height:1.45;font-variant-numeric:tabular-nums;}
.mmrp-budgetline.over{color:#e3a64a;}
.mmrp-jobs{display:flex;flex-direction:column;gap:6px;}
.mmrp-job{background:#191c22;border:1px solid #303642;border-radius:7px;padding:6px 9px;font-size:calc(11px * var(--mmh3-fs, 1));}
.mmrp-job.done{border-color:#2e6b5f;} .mmrp-job.error{border-color:#7a4a3a;} .mmrp-job.error .mmrp-dim{color:#e07a6a;}
.mmrp-jobhead{display:flex;justify-content:space-between;gap:8px;}
.mmrp-bar2{height:4px;background:#12151b;border-radius:2px;margin-top:5px;overflow:hidden;}
.mmrp-bar2>div{height:100%;background:#4d6ea6;transition:width .2s;}
`;

function injectCSS() {
  if (document.getElementById("mmrp-css")) return;
  document.head.append(el("style", { id: "mmrp-css", textContent: CSS }));
}

/* ------------------------------------------------------ the panel */

class StackPanel {
  constructor(node) {
    this.node = node;
    this.state = readStack(node);
    this.state.picks.forEach((p) => { if (p.uid == null) p.uid = ++StackPanel.seq; });
    StackPanel.seq = Math.max(StackPanel.seq, ...this.state.picks.map((p) => +p.uid || 0));
    injectCSS();
    this.root = el("div", { class: "mmrp-panel" });
    this.dragUid = null;
    this.render();
  }

  widget() { return this.node.widgets?.find((w) => w.name === "stack_state"); }

  write() {
    const w = this.widget();
    if (w) w.value = JSON.stringify(this.state);
    try { this.node.setDirtyCanvas?.(true, true); app.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* Vue */ }
  }

  reload() {
    this.state = readStack(this.node);
    this.state.picks.forEach((p) => { if (p.uid == null) p.uid = ++StackPanel.seq; });
    this.render();
  }

  /** Add a library item. Both channels start at weight 1. */
  add(item) {
    const chan = (c) => c ? { file: c.file, kind: c.kind, tokens: c.tokens || 0,
      seconds: c.seconds, mode: "weight", w: 1, s: 1, c: 1,
      embedded_audio_ignored: !!c.embedded_audio_ignored } : undefined;
    const p = { uid: ++StackPanel.seq, name: item.name, label: item.label || item.name,
      on: true, preview: item.preview || null };
    if (item.visual) p.visual = chan(item.visual);
    if (item.audio) p.audio = chan(item.audio);
    this.state.picks.push(p);
    this.write(); this.render();
    toast(`Added ${p.label} to the stack`);
  }

  /** Re-sync cached kinds, costs and previews with a fresh library scan. */
  refreshFrom(items) {
    const byFile = new Map();
    for (const it of items) for (const k of ["visual", "audio"]) if (it[k]) byFile.set(it[k].file, { it, ch: it[k] });
    for (const p of this.state.picks) {
      p.missing = [];
      for (const k of ["visual", "audio"]) {
        const ch = p[k]; if (!ch) continue;
        const hit = byFile.get(ch.file);
        if (!hit) { p.missing.push(ch.file); continue; }
        ch.kind = hit.ch.kind; ch.tokens = hit.ch.tokens || 0; ch.seconds = hit.ch.seconds;
        ch.embedded_audio_ignored = !!hit.ch.embedded_audio_ignored;
        p.preview = hit.it.preview || null;
      }
      if (!p.missing.length) delete p.missing;
    }
    this.write(); this.render();
  }

  groups() { return labelGroups(deriveEntries(this.state.picks)); }

  render() {
    const { picks, budget } = this.state;
    const groups = this.groups();
    const rows = picks.length ? picks.map((p) => this.row(p, groups)) :
      [el("div", { class: "mmrp-empty" }, "No RefMods yet. Use Browse library… to add some.")];

    const entries = groups.reduce((n, g) => n + g.strengths.length, 0);
    const tokens = groups.reduce((n, g) => n + g.strengths.length * g.tokens, 0);
    const live = groups.filter((g) => g.nums.length);
    const foot = el("div", { class: "mmrp-foot" },
      el("div", { class: "mmrp-total" }, "Bundle: ", el("b", {}, String(entries)),
        ` ${entries === 1 ? "entry" : "entries"} · `, el("b", {}, fmt(tokens)), " tokens"),
      el("label", { class: "mmrp-budget" }, "max_total_tokens",
        el("input", { class: "mmrp-num", type: "number", min: 0, step: 256, value: budget,
          oninput: (e) => { this.state.budget = Math.max(0, parseInt(e.target.value, 10) || 0);
            this.write(); this.renderFootOnly(); } }),
        el("span", {}, "0 = no limit")),
      budget > 0 && tokens > budget
        ? el("div", { class: "mmrp-over" },
            `⚠ ${fmt(tokens)} tokens is over the ${fmt(budget)} limit — the queue will refuse this bundle.`)
        : null,
      el("div", { class: "mmrp-labels" },
        el("div", { class: "lh" }, "Labels Text Encode will assign"),
        live.length ? live.map((g) => el("div", {},
          el("span", { class: `mmrp-tag ${KIND[g.kind].cls}` }, rangeText(g)), ` = ${g.name}`,
          g.key === "audio" && picks.find((p) => p.uid === g.uid)?.visual ? " (voice)" : "",
          g.nums.length > 1 ? el("span", { class: "mmrp-dim" },
            ` · ${g.nums.length - 1} ${g.nums.length === 2 ? "copy" : "copies"}`) : null))
        : el("div", { class: "mmrp-dim" }, "Nothing is being sent.")));

    // A re-render swaps the whole list, which would throw a scrolled panel
    // back to the top and drop focus from the control being used — so put
    // both back where they were.
    const scrolled = [this.root.querySelector(".mmrp-stack"), this.root, this.root.parentElement]
      .map((n) => [n, n ? n.scrollTop : 0]);
    const focused = document.activeElement, focusRow = focused && focused.closest ? focused.closest(".mmrp-row") : null;
    const focusKey = focusRow && this.root.contains(focusRow) ? {
      uid: focusRow.dataset.uid, ch: focused.closest(".mmrp-chan")?.querySelector(".mmrp-meta")?.dataset.ch || "",
      sel: `${focused.tagName.toLowerCase()}${focused.className ? "." + String(focused.className).trim().split(/\s+/).join(".") : ""}` +
        (focused.type ? `[type="${focused.type}"]` : ""),
      title: focused.title || "" } : null;

    setChildren(this.root,
      el("div", { class: "mmrp-toolbar" },
        el("button", { class: "mmrp-btn primary", onclick: () => openLibrary(this) }, "Browse library…"),
        el("button", { class: "mmrp-btn", title: "Make a RefMod from a picture, clip or voice",
          onclick: () => openLibrary(this, { tab: "create" }) }, "Create…"),
        el("button", { class: "mmrp-btn", onclick: () => this.refresh() }, "Refresh"),
        el("span", { class: "mmrp-count" }, `${picks.length} pick${picks.length === 1 ? "" : "s"}`)),
      el("div", { class: "mmrp-stack" }, rows),
      foot);
    this.footEl = foot;

    const list = this.root.querySelector(".mmrp-stack");
    for (const [node, top] of scrolled) {
      const target = node === scrolled[0][0] ? list : node;
      if (target && top) target.scrollTop = top;
    }
    if (focusKey) {
      const row = this.root.querySelector(`.mmrp-row[data-uid="${focusKey.uid}"]`);
      const scope = focusKey.ch ? row?.querySelector(`.mmrp-meta[data-ch="${focusKey.ch}"]`)?.closest(".mmrp-chan") : row;
      let again = null;
      try {
        const cands = scope ? [...scope.querySelectorAll(focusKey.sel)] : [];
        again = cands.find((c) => (c.title || "") === focusKey.title) || cands[0] || null;
      } catch (e) { again = null; }
      if (again) again.focus({ preventScroll: true });
    }
  }

  renderFootOnly() { this.render(); }

  row(p, groups) {
    const chans = [];
    for (const key of ["visual", "audio"]) {
      if (!p[key]) continue;
      const g = groups.find((x) => x.uid === p.uid && x.key === key);
      chans.push(this.channel(p, key, g));
    }
    const path = [p.visual?.file, p.audio?.file].filter(Boolean)
      .map((f) => f.split("/").pop()).join(" + ");
    const folder = (p.name || "").includes("/") ? p.name.slice(0, p.name.lastIndexOf("/")) + "/" : "";
    const thumb = p.preview
      ? el("img", { class: "mmrp-thumb", src: previewURL(p.preview), alt: "" })
      : el("div", { class: "mmrp-thumb" }, KIND[p.visual?.kind || "audio"]?.short || "REF");
    const row = el("div", { class: "mmrp-row" + (p.on === false ? " off" : "") + (p.missing ? " missing" : ""),
      dataset: { uid: String(p.uid) } },
      el("button", { class: "mmrp-grip", draggable: true, title: "Drag to reorder (or arrow keys)",
        onkeydown: (e) => this.keyMove(e, p) }, "⠇"),
      thumb,
      el("div", { class: "mmrp-main" },
        el("div", { class: "mmrp-title" },
          el("span", { class: "mmrp-name" }, p.label || p.name),
          el("span", { class: "mmrp-path", title: `${folder}${path}` }, `${folder}${path}`)),
        p.missing ? el("div", { class: "mmrp-warn" }, `⚠ Not found on disk: ${p.missing.join(", ")}`) : null,
        chans),
      el("div", { class: "mmrp-side" },
        el("label", { class: "mmrp-sw", title: "On / off" },
          el("input", { type: "checkbox", checked: p.on !== false,
            onchange: (e) => { p.on = e.target.checked; this.write(); this.render(); } }),
          el("span")),
        el("button", { class: "mmrp-x", title: "Remove", onclick: () => {
          this.state.picks = this.state.picks.filter((x) => x !== p); this.write(); this.render();
        } }, "×")));
    row.addEventListener("dragstart", (e) => {
      if (!e.target.closest(".mmrp-grip")) { e.preventDefault(); return; }
      this.dragUid = p.uid; row.classList.add("dragging");
      try { e.dataTransfer.setData("text/plain", String(p.uid)); e.dataTransfer.effectAllowed = "move"; } catch (_) {}
    });
    row.addEventListener("dragover", (e) => {
      if (this.dragUid == null || this.dragUid === p.uid) return;
      e.preventDefault(); row.classList.add("drop-before");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (this.dragUid == null || this.dragUid === p.uid) return;
      const from = this.state.picks.findIndex((x) => x.uid === this.dragUid);
      const moved = this.state.picks.splice(from, 1)[0];
      const to = this.state.picks.findIndex((x) => x === p);
      this.state.picks.splice(to, 0, moved);
      this.dragUid = null; this.write(); this.render();
    });
    row.addEventListener("dragend", () => { this.dragUid = null; this.render(); });
    return row;
  }

  keyMove(e, p) {
    if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const i = this.state.picks.indexOf(p), j = i + (e.key === "ArrowUp" ? -1 : 1);
    if (j < 0 || j >= this.state.picks.length) return;
    [this.state.picks[i], this.state.picks[j]] = [this.state.picks[j], this.state.picks[i]];
    this.write(); this.render();
    this.root.querySelector(`.mmrp-row[data-uid="${p.uid}"] .mmrp-grip`)?.focus();
  }

  channel(p, key, g) {
    const ch = p[key];
    const k = KIND[ch.kind] || KIND.image;
    const upd = () => { this.write(); this.render(); };
    let ctl;
    if (ch.mode === "sc") {
      ctl = el("span", { class: "mmrp-ctl" },
        el("input", { class: "mmrp-num sm", type: "number", min: 0, max: 1, step: 0.05,
          value: Number(ch.s ?? 1).toFixed(2), title: "Strength",
          onchange: (e) => { ch.s = clamp(parseFloat(e.target.value) || 0, 0, 1); upd(); } }),
        el("span", { class: "mmrp-dim" }, "×"),
        el("input", { class: "mmrp-num sm", type: "number", min: 1, max: MAX_COPIES, step: 1,
          value: ch.c ?? 1, title: "Copies",
          onchange: (e) => { ch.c = clamp(Math.round(parseFloat(e.target.value) || 1), 1, MAX_COPIES); upd(); } }),
        el("span", { class: "mmrp-dim" }, "copies"));
    } else {
      const num = el("input", { class: "mmrp-num", type: "number", min: 0, max: MAX_WEIGHT, step: 0.05,
        value: Number(ch.w ?? 1).toFixed(2), title: "Weight: up to 1 is strength, above 1 adds copies" });
      const range = el("input", { type: "range", min: 0, max: MAX_WEIGHT, step: 0.05, value: ch.w ?? 1 });
      const set = (v, commit) => {
        ch.w = clamp(parseFloat(v) || 0, 0, MAX_WEIGHT);
        num.value = ch.w.toFixed(2); range.value = ch.w;
        this.write();
        if (commit) this.render(); else this.paintMeta(p, key);
      };
      range.addEventListener("input", (e) => set(e.target.value, false));
      range.addEventListener("change", (e) => set(e.target.value, true));
      num.addEventListener("change", (e) => set(e.target.value, true));
      ctl = el("span", { class: "mmrp-ctl" }, range, num);
    }
    const meta = el("div", { class: "mmrp-meta", dataset: { uid: String(p.uid), ch: key } });
    const wrap = el("div", { class: "mmrp-chan" },
      el("span", { class: `mmrp-kind ${k.cls}` }, key === "audio" ? "AUD" : k.short),
      el("span", { class: "mmrp-mode" },
        el("button", { class: ch.mode !== "sc" ? "on" : "", title: "One weight: up to 1 is strength, above 1 adds copies",
          onclick: () => { if (ch.mode === "sc") { ch.w = +((ch.s ?? 1) * (ch.c ?? 1)).toFixed(2); ch.mode = "weight"; upd(); } } }, "Weight"),
        el("button", { class: ch.mode === "sc" ? "on" : "", title: "Strength × copies",
          onclick: () => { if (ch.mode !== "sc") {
            const e2 = expandWeight(ch.w ?? 1); ch.s = e2.length ? Math.min(1, e2[0]) : 1; ch.c = Math.max(1, e2.length);
            ch.mode = "sc"; upd(); } } }, "S × C")),
      ctl, meta);
    this.fillMeta(meta, p, key, g);
    return wrap;
  }

  fillMeta(meta, p, key, g) {
    const ch = p[key];
    const on = p.on !== false;
    setChildren(meta,
      el("span", {}, !on ? "row off · sends nothing" : readout(g, ch)),
      g && g.nums.length ? el("span", { class: `mmrp-tag ${KIND[g.kind].cls}` }, rangeText(g)) : null,
      ch.embedded_audio_ignored
        ? el("span", { class: "mmrp-warn", title: "This file carries audio inside the visual file (fork format). ComfyUI-MiniMaxH3Mod reads only the visual latent." },
            "embedded audio ignored")
        : null);
  }

  /** Live slider drag: refresh readouts and labels without a full re-render
   *  (which would drop the slider mid-drag). */
  paintMeta(p, key) {
    const groups = this.groups();
    this.root.querySelectorAll(".mmrp-meta").forEach((m) => {
      const pp = this.state.picks.find((x) => String(x.uid) === m.dataset.uid);
      if (!pp) return;
      const g = groups.find((x) => x.uid === pp.uid && x.key === m.dataset.ch);
      this.fillMeta(m, pp, m.dataset.ch, g);
    });
  }

  async refresh() {
    try {
      const resp = await api.fetchApi("/minimax_h3_plus/refmods", { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      this.refreshFrom(data.items || []);
      toast(`Rescanned · ${(data.items || []).length} RefMods on disk`);
    } catch (e) {
      toast(`Couldn't rescan RefMods: ${e.message}`, 5000);
    }
  }
}
StackPanel.seq = 0;

/* ---------------------------------------------------------- library */

const CREATE_NAME = "MiniMaxH3StudioRefModCreate";
const CONCEPTS = ["generic", "identity", "pose_motion", "clothing", "background",
  "voice", "singing", "music_style", "sound_fx", "ambience", "style"];
const SETTINGS_KEY = "mmrp-create-settings";
const NAME_BAD = /[^A-Za-z0-9._ +()\-]+/g;
const cleanName = (t) => String(t || "").replace(NAME_BAD, "_").replace(/^[ ._]+|[ ._]+$/g, "").slice(0, 120);
const stem = (f) => cleanName(String(f || "").split("/").pop().replace(/\.[^.]+$/, ""));

const SETTING_RANGES = { ref_resolution: [256, 2048], grid: [2, 64], latent_frames: [1, 1024],
  refinement_steps: [0, 5000], max_tokens: [0, 1048576], audio_max_seconds: [0.5, 600] };
/** A numeric setting kept inside its range; anything unusable becomes the default. */
function clampSetting(key, value, fallback) {
  const r = SETTING_RANGES[key];
  const v = Number(value);
  if (!r || !Number.isFinite(v)) return fallback;
  return Math.min(r[1], Math.max(r[0], v));
}
function loadSettings() {
  const d = { mode: "Compressed Reference", ref_resolution: 1024, grid: 16, latent_frames: 22,
    refinement_steps: 500, max_tokens: 5120, audio_max_seconds: 30, concept_type: "generic",
    subfolder: "", write_preview: true, videoVae: "", audioVae: "", combine: true };
  let st = d;
  try { st = { ...d, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")) }; } catch (e) { st = d; }
  // Settings saved by 1.7.0 carry its Clip frames default of 16, which on
  // H3's real frame grid is cut to 5 and stores only 2 frames. Move that one
  // value to the new default once; a number the user chose is left alone.
  if (!(st.v >= 2)) { if (st.latent_frames === 16) st.latent_frames = 22; st.v = 2; }
  for (const k of Object.keys(SETTING_RANGES)) st[k] = clampSetting(k, st[k], d[k]);
  return st;
}
function saveSettings(st) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(st)); } catch (e) { /* private mode */ } }

/** Media Loader items -> Create sources. Anything the loader can hold. */
function sourcesFromItems(items, origin) {
  return (Array.isArray(items) ? items : []).filter((it) => it && it.file && it.kind).map((it) => ({
    rec: { ...it }, origin, name: stem(it.name || it.file), use: it.enabled !== false,
    voice: it.kind === "audio" || (it.kind === "video" && !!it.has_audio && (it.audio_mode || "paired") !== "off"),
  }));
}

/** Every Media Loader in the graph, for the "pull from" control. */
function loadersInGraph() {
  try {
    return (app.graph?._nodes || []).filter((n) => n.type === "MiniMaxH3MediaLoader").map((n) => {
      let items = [];
      try { items = JSON.parse(n.widgets?.find((w) => w.name === "media_state")?.value || "[]"); } catch (e) { items = []; }
      return { node: n, title: n.title || "Media Loader", items: Array.isArray(items) ? items : [] };
    });
  } catch (e) { return []; }
}

const waveCache = new Map();
/** Peaks of an audio file drawn as bars; cached per URL, like the editor's. */
function drawWave(canvas, url) {
  const paint = (peaks) => {
    const w = canvas.width, h = canvas.height, ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#b48ce8";
    for (let x = 0; x < w; x++) {
      const v = peaks[Math.floor((x / w) * peaks.length)] || 0;
      const bar = Math.max(1, v * (h - 2));
      ctx.fillRect(x, (h - bar) / 2, 1, bar);
    }
  };
  const cached = waveCache.get(url);
  if (cached) { if (cached.then) cached.then(paint).catch(() => {}); else paint(cached); return; }
  const job = fetch(url).then((r) => r.arrayBuffer())
    .then((buf) => new (window.AudioContext || window.webkitAudioContext)().decodeAudioData(buf))
    .then((audio) => {
      const data = audio.getChannelData(0), buckets = 160, step = Math.floor(data.length / buckets) || 1, peaks = [];
      for (let i = 0; i < buckets; i++) {
        let peak = 0;
        for (let j = 0; j < step; j += 8) { const v = Math.abs(data[i * step + j] || 0); if (v > peak) peak = v; }
        peaks.push(peak);
      }
      waveCache.set(url, peaks); return peaks;
    });
  waveCache.set(url, job);
  job.then(paint).catch(() => waveCache.delete(url));
}

/* Per-frame token cost of a still under each mode, from the same rules the
 * encoder applies: scale the short edge down to `res` (never up), round to
 * /32, lift to a 320 px floor, then the VAE's 16x downsample and the DiT's
 * 2x2 patch. So Full = (H/32)*(W/32); Compressed is the pooled grid. */
/** Python's round(): halves go to the even neighbour. */
const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 || (d === 0.5 && f % 2) ? f + 1 : f; };
function stillSize(w, h, res) {
  let s = Math.min(1, res / Math.min(w, h));
  let tw = Math.max(32, pyRound(w * s / 32) * 32), th = Math.max(32, pyRound(h * s / 32) * 32);
  if (Math.min(tw, th) < 320) {
    s = 320 / Math.min(tw, th);
    tw = Math.max(320, pyRound(tw * s / 32) * 32); th = Math.max(320, pyRound(th * s / 32) * 32);
  }
  return [tw, th];
}
function fullTokens(w, h, res) {
  const [tw, th] = stillSize(w, h, res);
  return (th / 32) * (tw / 32);
}
function compressedTokens(w, h, res, grid) {
  const aspect = h / w, even = (v) => Math.max(2, pyRound(v / 2) * 2);
  const [gh, gw] = aspect >= 1 ? [grid, grid / aspect] : [grid * aspect, grid];
  return (even(gh) / 2) * (even(gw) / 2);
}

/* ---- stack fit preview --------------------------------------------------
 * In a stack every frame takes the first source's shape. Full cover-crops
 * the others to it (edges cut off); Compressed pools them to the same grid
 * (squeezed, nothing cut). These draw exactly that, from the picture the
 * encoder will get: the loader's turn, mirror and crop applied first. */

const frameCache = new Map();
/** A drawable for a picture, or for a clip's frame at its trim start. */
function loadDrawable(rec) {
  const key = `${rec.file}|${rec.kind === "video" ? (Number(rec.trim?.start) || 0) : ""}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const job = new Promise((resolve, reject) => {
    if (rec.kind === "picture") {
      const im = new Image();
      im.onload = () => resolve(im); im.onerror = reject; im.src = viewURL(rec.file);
    } else {
      const v = document.createElement("video");
      v.muted = true; v.preload = "auto"; v.playsInline = true;
      v.onloadeddata = () => { try { v.currentTime = (Number(rec.trim?.start) || 0) + 0.01; } catch (_) { resolve(v); } };
      v.onseeked = () => resolve(v); v.onerror = reject; v.src = viewURL(rec.file);
    }
  });
  frameCache.set(key, job);
  job.catch(() => frameCache.delete(key));
  return job;
}

/** The encoder's view of a source, as a canvas: turned, mirrored, cropped. */
function effectiveCanvas(src, rec, cap = 480) {
  const sw = src.naturalWidth || src.videoWidth, sh = src.naturalHeight || src.videoHeight;
  const turn = ((parseInt(rec.rotate, 10) || 0) % 360 + 360) % 360;
  const k = Math.min(1, cap / Math.max(sw, sh));
  const w = sw * k, h = sh * k;
  const rw = turn % 180 ? h : w, rh = turn % 180 ? w : h;
  const turned = document.createElement("canvas");
  turned.width = Math.max(1, Math.round(rw)); turned.height = Math.max(1, Math.round(rh));
  const g = turned.getContext("2d");
  g.translate(turned.width / 2, turned.height / 2);
  if (rec.mirror) g.scale(-1, 1);
  g.rotate((turn * Math.PI) / 180);
  g.drawImage(src, -w / 2, -h / 2, w, h);
  const c = rec.crop;
  if (!c) return turned;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(turned.width * (c.w || 1)));
  out.height = Math.max(1, Math.round(turned.height * (c.h || 1)));
  out.getContext("2d").drawImage(turned, (c.x || 0) * turned.width, (c.y || 0) * turned.height,
    out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** How a source fits the stack's frame: what share is cut (Full) or how
 *  much it is squeezed (Compressed), along which axis. */
function fitOf(aspect, target) {
  if (!target) return null;
  const A = target.aspect;
  if (target.mode === "full") {
    return aspect > A ? { kind: "trim", axis: "width", keep: A / aspect }
                      : { kind: "trim", axis: "height", keep: aspect / A };
  }
  return aspect > A ? { kind: "squeeze", axis: "width", keep: A / aspect }
                    : { kind: "squeeze", axis: "height", keep: aspect / A };
}
function fitCaption(fit) {
  if (!fit || fit.keep > 0.97) return "Fits the frame";
  const pct = Math.round((1 - fit.keep) * 100);
  return fit.kind === "trim" ? `Edges trimmed: ${pct}% of the ${fit.axis}`
                             : `Squeezed: ${Math.round(fit.keep * 100)}% of its ${fit.axis}`;
}

/** Draw a source onto a canvas of any size. With a stack target the
 *  picture is shown as the stack will use it (Full: trimmed parts shaded;
 *  Compressed: squeezed); without one, or for the first photo, it is shown
 *  whole. Always the encoder's view: turn, mirror and crop applied. */
function drawFit(cv, rec, target, isFirst) {
  return loadDrawable(rec).then((src) => {
    const img = effectiveCanvas(src, rec, Math.max(cv.width, cv.height));
    const g = cv.getContext("2d"), W = cv.width, H = cv.height, lw = Math.max(2, W / 160);
    g.fillStyle = "#101217"; g.fillRect(0, 0, W, H);
    const aspect = img.width / img.height;
    const fitBox = (a) => { const s = Math.min(W / a, H); const bw = s * a, bh = s; return [(W - bw) / 2, (H - bh) / 2, bw, bh]; };
    const outline = (x, y, w, h) => {
      g.save(); g.strokeStyle = "#7fa3dd"; g.lineWidth = lw; g.setLineDash([lw * 3, lw * 2]);
      g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); g.restore();
    };
    if (isFirst || !target) {
      const [x, y, w, h] = fitBox(aspect);
      g.drawImage(img, x, y, w, h);
      if (isFirst && target) outline(x, y, w, h);
      return;
    }
    const fit = fitOf(aspect, target);
    if (target.mode === "full") {
      const [x, y, w, h] = fitBox(aspect);
      g.drawImage(img, x, y, w, h);
      const kw = fit.axis === "width" ? w * fit.keep : w, kh = fit.axis === "height" ? h * fit.keep : h;
      const kx = x + (w - kw) / 2, ky = y + (h - kh) / 2;
      g.fillStyle = "rgba(8,10,14,.72)";
      if (fit.axis === "width") { g.fillRect(x, y, kx - x, h); g.fillRect(kx + kw, y, x + w - (kx + kw), h); }
      else { g.fillRect(x, y, w, ky - y); g.fillRect(x, ky + kh, w, y + h - (ky + kh)); }
      outline(kx, ky, kw, kh);
    } else {
      const [x, y, w, h] = fitBox(target.aspect);
      g.drawImage(img, x, y, w, h);
      outline(x, y, w, h);
    }
  }).catch(() => {
    const g = cv.getContext("2d"); g.fillStyle = "#6b7484"; g.font = `${Math.round(cv.width / 14)}px ui-monospace,monospace`;
    g.textAlign = "center"; g.fillText("no preview", cv.width / 2, cv.height / 2);
  });
}

/* ---- hover pop-up: a larger look at a tile ------------------------------ */
let peekEl = null, peekTimer = null;
function hidePeek() {
  clearTimeout(peekTimer); peekTimer = null;
  if (peekEl) { peekEl.querySelectorAll("video").forEach((v) => v.pause()); peekEl.remove(); peekEl = null; }
}
/** Show `fill(box)` in a pop-up beside `tile` after a short hover. */
function attachPeek(tile, fill, caption) {
  tile.addEventListener("mouseenter", () => {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      hidePeek();
      const box = el("div", { class: "mmrp-peekbig" });
      const stage = el("div", { class: "mmrp-peekstage" });
      box.append(stage);
      const cap = typeof caption === "function" ? caption() : caption;
      if (cap) box.append(el("div", { class: "mmrp-peekcap" }, cap));
      fill(stage);
      document.body.append(box);
      const r = tile.getBoundingClientRect(), b = box.getBoundingClientRect();
      const gap = 12;
      let left = r.right + gap;
      if (left + b.width > window.innerWidth - 8) left = r.left - gap - b.width;
      left = Math.max(8, left);
      const top = Math.max(8, Math.min(r.top + r.height / 2 - b.height / 2, window.innerHeight - b.height - 8));
      box.style.left = `${left}px`; box.style.top = `${top}px`;
      peekEl = box;
    }, 220);
  });
  tile.addEventListener("mouseleave", hidePeek);
  tile.addEventListener("mousedown", hidePeek);
}
const PEEK_W = 880, PEEK_H = 660;          // canvas backing; shown at half size

/** Tile for a stacked source, with a larger pop-up on hover. */
function fitPreview(rec, target, isFirst, caption) {
  const box = el("div", { class: "mmrp-sprev" });
  const cv = el("canvas", { width: 320, height: 200 });
  box.append(cv);
  drawFit(cv, rec, target, isFirst);
  attachPeek(box, (stage) => {
    const big = el("canvas", { width: PEEK_W, height: PEEK_H, class: "mmrp-peekcanvas" });
    stage.append(big); drawFit(big, rec, target, isFirst);
  }, caption);
  return box;
}

/** What a Create source looks like: the whole picture, a clip's frame at
 *  its trim start, or the waveform. Pictures and clips open a larger
 *  pop-up on hover (a clip plays there, from its trim). */
function sourcePreview(rec, caption) {
  const url = viewURL(rec.file);
  const box = el("div", { class: "mmrp-sprev" });
  if (rec.kind === "picture") {
    const cv = el("canvas", { width: 320, height: 200 });
    box.append(cv); drawFit(cv, rec, null, false);
    attachPeek(box, (stage) => {
      const big = el("canvas", { width: PEEK_W, height: PEEK_H, class: "mmrp-peekcanvas" });
      stage.append(big); drawFit(big, rec, null, false);
    }, caption);
  } else if (rec.kind === "video") {
    const start = Number(rec.trim?.start) || 0, end = rec.trim?.end != null ? Number(rec.trim.end) : null;
    const v = el("video", { src: url, muted: true, preload: "metadata", playsInline: true,
      onloadedmetadata: (e) => { try { e.target.currentTime = start + 0.01; } catch (_) {} } });
    box.append(v, el("span", { class: "mmrp-sprevtag" }, "▶ hover"));
    attachPeek(box, (stage) => {
      const big = el("video", { src: url, muted: true, autoplay: true, loop: end == null, playsInline: true, class: "mmrp-peekvideo",
        onloadedmetadata: (e) => { try { e.target.currentTime = start; } catch (_) {} },
        ontimeupdate: (e) => { if (end != null && e.target.currentTime >= end) { e.target.currentTime = start; e.target.play().catch(() => {}); } } });
      stage.append(big);
    }, caption);
  } else {
    const cv = el("canvas", { width: 220, height: 56 });
    box.append(cv, el("audio", { src: url, controls: true, preload: "none" }));
    setTimeout(() => drawWave(cv, url), 0);
  }
  return box;
}

/**
 * The RefMod library: curate what is on disk, create new ones.
 * `panel` is the stack panel that opened it (null when opened from a loader
 * or the canvas); `opts.sources` seeds the Create tab, `opts.tab` picks the
 * tab to open on.
 */
export function openLibrary(panel, opts = {}) {
  injectCSS();
  let items = [], roots = [], packInstalled = true;
  const view = { folder: "all", kind: "all", q: "", sort: "name", tab: opts.tab || "library", selected: null };
  const st = loadSettings();
  const sources = sourcesFromItems(opts.sources || [], opts.origin || "Media Loader");
  const highlight = new Set();
  let vaes = [];
  const jobs = [];               // { prompt_id, names, status, msg, progress }

  /* ---- chrome */
  const tabBtn = (id, label) => el("button", { class: "mmrp-tab" + (view.tab === id ? " on" : ""),
    onclick: () => { view.tab = id; paintTabs(); } }, label);
  const tabs = el("div", { class: "mmrp-tabs" });
  const summary = el("small", {}, "Loading…");
  const close = () => { window.removeEventListener("keydown", onKey); unhook(); hidePeek(); overlay.remove(); };
  const onKey = (e) => {
    if (e.key !== "Escape" || document.querySelector(".mmlp-tmover")) return;   // the crop editor handles its own
    e.stopPropagation(); close();
  };
  window.addEventListener("keydown", onKey);
  const libraryPane = el("div", { class: "mmrp-pane" });
  const createPane = el("div", { class: "mmrp-pane" });
  const overlay = el("div", { class: "mmrp-overlay", onmousedown: (e) => { if (e.target === overlay) close(); } },
    el("div", { class: "mmrp-modal", role: "dialog", "aria-label": "RefMod library" },
      el("div", { class: "mmrp-head" }, el("strong", {}, "RefMod library"), summary, tabs, el("span", { class: "mmrp-grow" }),
        el("button", { class: "mmrp-btn", onclick: () => load(true) }, "Refresh"),
        el("button", { class: "mmrp-btn", onclick: close }, "Close")),
      libraryPane, createPane));
  document.body.append(overlay);
  overlay.addEventListener("scroll", hidePeek, true);

  // Files dropped anywhere on the dialog, or on the dimmed page around it,
  // go to the Create tab. Taking the event here also stops the browser from
  // opening the file and ComfyUI from reading a PNG as a workflow.
  const modal = overlay.firstChild;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  let dragDepth = 0;
  const setDropping = (on) => modal.classList.toggle("dropping", on);
  overlay.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    if (++dragDepth === 1) setDropping(true);
  });
  overlay.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  });
  overlay.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    e.stopPropagation();
    if (--dragDepth <= 0) { dragDepth = 0; setDropping(false); }
  });
  overlay.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    dragDepth = 0; setDropping(false);
    const list = [...(e.dataTransfer?.files || [])];
    if (!list.length) return;
    if (view.tab !== "create") { view.tab = "create"; paintTabs(); }
    addFiles(list);
  });
  function paintTabs() {
    setChildren(tabs, tabBtn("library", "Library"),
      tabBtn("create", editing ? `Editing ${editing.it.label}` : `Create${sources.length ? ` (${sources.length})` : ""}`));
    libraryPane.hidden = view.tab !== "library";
    createPane.hidden = view.tab !== "create";
    if (view.tab === "create") paintCreate();
  }

  /* ---- library tab */
  const search = el("input", { class: "mmrp-search", type: "search",
    placeholder: "Search names, folders and descriptions", "aria-label": "Search RefMods",
    oninput: (e) => { view.q = e.target.value; drawGrid(); } });
  const seg = el("div", { class: "mmrp-seg", role: "group" },
    [["all", "All"], ["image", "Image"], ["video", "Video"], ["audio", "Audio"]].map(([k, t]) =>
      el("button", { class: k === "all" ? "on" : "", onclick: (e) => {
        view.kind = k; seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target)); drawGrid();
      } }, t)));
  const sort = el("select", { class: "mmrp-sel", onchange: (e) => { view.sort = e.target.value; drawGrid(); } },
    el("option", { value: "name" }, "Name"), el("option", { value: "tokens" }, "Token cost"),
    el("option", { value: "folder" }, "Folder"), el("option", { value: "new" }, "Newest"));
  const folders = el("nav", { class: "mmrp-folders", "aria-label": "Folders" });
  const grid = el("div", { class: "mmrp-grid" }, el("div", { class: "mmrp-status" }, "Scanning RefMod folders…"));
  const inspector = el("aside", { class: "mmrp-inspector", hidden: true });
  const body = el("div", { class: "mmrp-body" }, folders, grid, inspector);
  setChildren(libraryPane, el("div", { class: "mmrp-bar" }, search, seg, sort), body);

  const kindsOf = (it) => [it.visual?.kind, it.audio && "audio"].filter(Boolean);
  const tokensOf = (it) => (it.visual?.tokens || 0) + (it.audio?.tokens || 0);
  const files = (it) => [it.visual?.file, it.audio?.file].filter(Boolean);
  const filesShort = (it) => files(it).map((f) => f.split("/").pop()).join(" + ");
  const byName = (name) => items.find((i) => i.name === name);

  function drawFolders() {
    const counts = {};
    items.forEach((it) => { counts[it.folder] = (counts[it.folder] || 0) + 1; });
    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    setChildren(folders,
      el("div", { class: "mmrp-fh" }, "Folders"),
      [["all", items.length], ...names.map((n) => [n, counts[n]])].map(([n, c]) =>
        el("button", { class: view.folder === n ? "on" : "", onclick: () => { view.folder = n; drawFolders(); drawGrid(); } },
          el("span", {}, n === "all" ? "All RefMods" : (n || "(root)")), el("span", {}, String(c)))),
      el("div", { class: "mmrp-roots" }, roots.length ? roots.map((r) => el("div", {}, r)) : "no RefMod folders registered"));
    const pairs = items.filter((it) => it.paired).length;
    summary.textContent = `${items.length} RefMods · ${pairs} pair${pairs === 1 ? "" : "s"}`;
  }

  function drawGrid() {
    const q = view.q.trim().toLowerCase();
    let list = items.filter((it) => (view.folder === "all" || it.folder === view.folder)
      && (view.kind === "all" || kindsOf(it).includes(view.kind))
      && (!q || [it.label, it.name, it.folder, it.desc, filesShort(it)].join(" ").toLowerCase().includes(q)));
    list.sort((a, b) => view.sort === "tokens" ? tokensOf(a) - tokensOf(b)
      : view.sort === "folder" ? (a.folder + a.label).localeCompare(b.folder + b.label)
      : view.sort === "new" ? (b.mtime || 0) - (a.mtime || 0) : a.label.localeCompare(b.label));
    if (!list.length) {
      setChildren(grid, el("div", { class: "mmrp-status" }, items.length
        ? `No RefMods match “${view.q}”${view.folder === "all" ? "" : ` in ${view.folder}`}.`
        : "No RefMods yet. Use the Create tab to make one from a picture, clip or voice."));
      return;
    }
    setChildren(grid, list.map((it) => card(it)));
  }

  function card(it) {
    const inStack = panel ? panel.state.picks.filter((p) => p.name === it.name).length : 0;
    const b = [];
    if (it.visual) b.push(el("span", { class: `mmrp-b ${KIND[it.visual.kind]?.cls || "pic"}` }, `${it.visual.kind} · ${fmt(it.visual.tokens)} tok`));
    if (it.audio) b.push(el("span", { class: "mmrp-b aud" }, `audio ${Number(it.audio.seconds || 0).toFixed(1)} s · ${fmt(it.audio.tokens)} tok`));
    if (it.audio && Number(it.audio.seconds || 0) < 0.5) b.push(el("span", { class: "mmrp-b warn",
      title: "This voice is shorter than half a second — effectively silent. Recreate it and check the audio's trim." }, "voice empty"));
    if (it.paired) b.push(el("span", { class: "mmrp-b pair" }, "pair"));
    if (it.bundle) b.push(el("span", { class: "mmrp-b pair", title: "A single-file bundle made by ComfyUI-MiniMaxH3Mod. " +
      "Its first look and first voice are used here; it can be inspected but not edited in this library." },
      `bundle · ${it.bundle} member${it.bundle === 1 ? "" : "s"}`));
    if (it.visual) b.push(el("span", { class: "mmrp-b",
      title: it.visual.mode === "encode"
        ? "Full: keeps the most detail. Heavier to use."
        : "Compressed: keeps the overall look, not the fine detail. Lighter to use." },
      `${it.visual.mode === "encode" ? "full" : "compressed"} ${it.visual.t > 1 ? `${it.visual.t} fr · ` : ""}${it.visual.h}×${it.visual.w}`));
    if (it.visual?.embedded_audio_ignored) b.push(el("span", { class: "mmrp-b warn",
      title: "Audio stored inside the visual file (fork format) is ignored." }, "embedded audio ignored"));
    const thumb = it.preview
      ? el("img", { src: previewURL(it.preview) + `&v=${it.mtime || 0}`, alt: "", loading: "lazy" })
      : `${KIND[it.visual?.kind || "audio"]?.short || "REF"} · no preview image`;
    const actions = [el("button", { class: "mmrp-btn", onclick: (e) => { e.stopPropagation(); select(it.name); } }, "Details")];
    if (panel) actions.push(el("button", { class: "mmrp-btn primary", onclick: (e) => { e.stopPropagation(); panel.add(it); drawGrid(); },
      title: inStack ? "Already in the stack — adds another copy" : "Add to the stack" },
      inStack ? "✓ Add again" : "Add"));
    return el("article", { class: "mmrp-card" + (inStack ? " instack" : "") + (view.selected === it.name ? " selected" : "") + (highlight.has(it.name) ? " new" : ""),
      onclick: () => select(it.name) },
      el("div", { class: "mmrp-cthumb" }, thumb),
      el("div", { class: "mmrp-cbody" },
        el("div", { class: "mmrp-cname" }, el("span", { title: it.name }, it.label), el("span", { class: "mmrp-cfolder" }, it.folder)),
        el("div", { class: "mmrp-badges" }, b),
        el("div", { class: "mmrp-cdesc" }, it.desc || ""),
        el("div", { class: "mmrp-cfiles" }, filesShort(it)),
        el("div", { class: "mmrp-cactions" }, actions)));
  }

  function select(name) {
    view.selected = name == null || view.selected === name ? null : name;
    body.classList.toggle("withinspector", !!view.selected);
    inspector.hidden = !view.selected;
    drawGrid();
    if (view.selected) paintInspector();
  }

  /* ---- inspector: rename / move / describe / preview / delete */
  function paintInspector() {
    const it = byName(view.selected);
    if (!it) { inspector.hidden = true; body.classList.remove("withinspector"); return; }
    const nameIn = el("input", { class: "mmrp-search", value: it.label, "aria-label": "Name" });
    const folderIn = el("input", { class: "mmrp-search", value: it.folder, placeholder: "(root)", "aria-label": "Folder" });
    const descIn = el("textarea", { class: "mmrp-ta", rows: 3, "aria-label": "Description" }, it.desc || "");
    const conceptIn = el("select", { class: "mmrp-sel" }, CONCEPTS.map((c) => el("option", { value: c, selected: c === it.concept }, c)));
    const status = el("div", { class: "mmrp-istatus" });
    const say = (m, err) => { status.textContent = m; status.classList.toggle("err", !!err); };
    const chanRow = (label, c) => c ? el("div", { class: "mmrp-irow" }, el("span", {}, label),
      el("span", {}, [c.kind, c.kind === "audio" ? `${Number(c.seconds || 0).toFixed(1)} s` : `${c.t > 1 ? `${c.t} fr · ` : ""}${c.h}×${c.w}`,
        `${fmt(c.tokens)} tok`, c.mode === "encode" ? "full" : c.mode ? "compressed" : "", c.pool ? `pool ${c.pool}` : "",
        c.steps ? `${c.steps} steps` : "", c.source_shape ? `from ${c.source_shape}` : ""].filter(Boolean).join(" · "))) : null;
    const pvInput = el("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: async (e) => {
      const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
      const fd = new FormData(); fd.append("stem", it.preview || it.name); fd.append("file", f);
      try {
        const r = await postApi("/minimax_h3_plus/refmods/set_preview", { body: fd });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        say("Preview replaced."); await load(true);
      } catch (err) { say(`Couldn't set the preview: ${err.message}`, true); }
    } });
    let confirmDel = false;
    const delBtn = el("button", { class: "mmrp-btn danger", onclick: async () => {
      if (!confirmDel) { confirmDel = true; delBtn.textContent = `Really delete ${files(it).length} file${files(it).length === 1 ? "" : "s"}?`; return; }
      try {
        const r = await postApi("/minimax_h3_plus/refmods/delete", { headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: files(it), preview: it.preview }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        toast(`Deleted ${it.label}`);
        // Close the details panel along with the selection: clearing the
        // selection alone left the panel up, still asking to confirm.
        select(null);
        await load(true);
        if (panel) panel.refresh();
      } catch (err) { say(`Couldn't delete: ${err.message}`, true); confirmDel = false; delBtn.textContent = "Delete"; }
    } }, "Delete");
    const saveBtn = el("button", { class: "mmrp-btn primary", onclick: async () => {
      const newName = cleanName(nameIn.value), newFolder = folderIn.value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      if (!newName) { say("Give it a name.", true); return; }
      const target = newFolder ? `${newFolder}/${newName}` : newName;
      try {
        let renamed = false;
        if ((descIn.value || "") !== (it.desc || "") || conceptIn.value !== it.concept) {
          const r = await postApi("/minimax_h3_plus/refmods/meta", { headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: files(it), description: descIn.value, concept_type: conceptIn.value }) });
          const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        }
        if (target !== it.name) {
          const r = await postApi("/minimax_h3_plus/refmods/rename", { headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: files(it), preview: it.preview, new_name: target }) });
          const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          renamed = true;
          if (panel) panel.state.picks.forEach((p) => {
            if (p.name !== it.name) return;
            p.name = target; p.label = newName;
            for (const k of ["visual", "audio"]) {
              if (!p[k]) continue;
              // a bundle member is "<file>#<index>": the file part moved
              const [base, idx] = String(p[k].file).split("#");
              if (d.moved[base]) p[k].file = d.moved[base] + (idx != null ? `#${idx}` : "");
            }
          });
        }
        say("Saved."); toast(`Saved ${newName}`);
        view.selected = renamed ? target : it.name;
        await load(true);
        if (panel) { panel.write(); panel.refresh(); }
      } catch (err) { say(`Couldn't save: ${err.message}`, true); }
    } }, "Save changes");
    setChildren(inspector,
      el("div", { class: "mmrp-ithumb" }, it.preview
        ? el("img", { src: previewURL(it.preview) + `&v=${it.mtime || 0}`, alt: "" })
        : el("span", {}, `${KIND[it.visual?.kind || "audio"]?.short || "REF"} · no preview`)),
      el("div", { class: "mmrp-iactions" },
        el("button", { class: "mmrp-btn", onclick: () => pvInput.click() }, it.preview ? "Replace preview" : "Add preview"), pvInput,
        panel ? el("button", { class: "mmrp-btn", onclick: () => { panel.add(it); drawGrid(); } }, "Add to stack") : null),
      el("label", { class: "mmrp-ilabel" }, "Name", nameIn),
      el("label", { class: "mmrp-ilabel" }, "Folder", folderIn),
      el("label", { class: "mmrp-ilabel" }, "Description", descIn),
      el("label", { class: "mmrp-ilabel" }, "Concept", conceptIn),
      el("div", { class: "mmrp-idetails" }, chanRow("Look", it.visual), chanRow("Voice", it.audio),
        el("div", { class: "mmrp-irow" }, el("span", {}, "Files"), el("span", { class: "mmrp-cfiles" }, files(it).join("\n")))),
      storedSection(it),
      el("div", { class: "mmrp-iactions" }, saveBtn, delBtn),
      status);
  }

  /* ---- inspect: decode what's stored, through the queue */
  const INSPECT_NAME = "MiniMaxH3StudioRefModInspect";
  const inspectJobs = new Map();          // prompt_id -> { name, images, audio, done }
  const inspectResults = new Map();       // item name -> last finished job
  const inspectView = new Map();          // item name -> "frames" | "video"
  const EDIT_NAME = "MiniMaxH3StudioRefModEdit";
  let inspectStrength = 1;
  const tempURL = (f) => api.apiURL(`/view?filename=${encodeURIComponent(f.filename)}` +
    `&subfolder=${encodeURIComponent(f.subfolder || "")}&type=${f.type || "temp"}`);
  const tempRef = (f) => `${f.subfolder ? f.subfolder + "/" : ""}${f.filename} [${f.type || "temp"}]`;
  const guessVae = (key, re) => st[key] || vaes.find((v) => re.test(v)) || "";

  function storedSection(it) {
    const box = el("div", { class: "mmrp-istored" });
    box.dataset.item = it.name;
    const clip = it.visual && it.visual.t > 1;
    if (!inspectView.has(it.name)) inspectView.set(it.name, it.visual?.source === "video" ? "video" : "frames");
    const seg = clip ? el("div", { class: "mmrp-seg", role: "group", "aria-label": "How to show the frames" },
      [["frames", "Each frame"], ["video", "As a clip"]].map(([v, t]) => el("button", {
        class: inspectView.get(it.name) === v ? "on" : "",
        title: v === "frames" ? "Every stored frame on its own — right for a stack of photos"
                              : "The frames played together — right for a clip",
        onclick: (e) => { inspectView.set(it.name, v); seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); } }, t))) : null;
    const sval = el("span", { class: "mmrp-dim" }, inspectStrength.toFixed(2));
    const slider = el("input", { type: "range", min: 0, max: 1, step: 0.05, value: inspectStrength,
      oninput: (e) => { inspectStrength = +e.target.value; sval.textContent = inspectStrength.toFixed(2); } });
    const btn = el("button", { class: "mmrp-btn", onclick: () => queueInspect(it, { box, btn }) }, "Show what's stored");
    const last = inspectResults.get(it.name);
    if (last) paintStored(box, last);
    return el("div", { class: "mmrp-isection" },
      el("div", { class: "mmrp-fh" }, "What's stored"),
      el("div", { class: "mmrp-dim mmrp-isub" }, "Decodes the RefMod so you can see what the model is given."),
      seg,
      el("label", { class: "mmrp-inline", title: "Preview at a lower weight: the same softening a weight below 1 applies" },
        "Strength", slider, sval),
      btn, box,
      it.bundle
        ? el("div", { class: "mmrp-dim mmrp-isub" }, "A single-file bundle from ComfyUI-MiniMaxH3Mod: usable and inspectable here, " +
            "but edit it with that pack (or save its members as standalone files there first).")
        : el("div", { class: "mmrp-iactions" },
            el("button", { class: "mmrp-btn primary", title: "Drop, reorder or add frames and change the voice on the Create tab",
              onclick: () => startEdit(it) }, "Edit frames & voice…")));
  }

  /** Decode a RefMod through the queue. `opts.forEdit` asks for full-strength
   *  frames to seed the Create tab's edit mode; otherwise the Details panel's
   *  view and strength are used and the result lands in its box. */
  async function queueInspect(it, opts = {}) {
    const { box, btn, forEdit } = opts;
    const videoVae = it.visual ? guessVae("videoVae", /minimax.*video|h3.*video/i) : "";
    const audioVae = it.audio ? guessVae("audioVae", /minimax.*audio|h3.*audio/i) : "";
    const fail = (msg) => { if (box) setChildren(box, el("div", { class: "mmrp-dim" }, msg)); else toast(msg, 5000); };
    if ((it.visual && !videoVae) || (it.audio && !audioVae)) { fail("Choose the H3 VAEs on the Create tab first."); return false; }
    const prompt = {}; let id = 1;
    const vid = videoVae ? String(id++) : null, aid = audioVae ? String(id++) : null;
    if (vid) prompt[vid] = { class_type: "VAELoader", inputs: { vae_name: videoVae } };
    if (aid) prompt[aid] = { class_type: "VAELoader", inputs: { vae_name: audioVae } };
    const base = forEdit ? { view: "frames", strength: 1, audio_seconds: 600 }
      : { view: inspectView.get(it.name) || "frames", strength: inspectStrength, audio_seconds: 30 };
    if (it.visual) prompt[String(id++)] = { class_type: INSPECT_NAME, inputs: { ...base, file: it.visual.file, vae: [vid, 0] } };
    if (it.audio) prompt[String(id++)] = { class_type: INSPECT_NAME, inputs: { ...base, file: it.audio.file, audio_vae: [aid, 0] } };
    if (btn) btn.disabled = true;
    if (box) setChildren(box, el("div", { class: "mmrp-dim" }, "Decoding… (in the queue)"));
    try {
      const r = await api.fetchApi("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client_id: api.clientId }) });
      const d = await r.json();
      if (!r.ok || d.error) {
        const errs = Object.values(d.node_errors || {}).flatMap((n) => (n.errors || []).map((e) => e.message || e.details || ""));
        throw new Error((d.error && (d.error.message || d.error)) + (errs.length ? ": " + errs.join("; ") : ""));
      }
      inspectJobs.set(d.prompt_id, { name: it.name, images: [], audio: [], strength: base.strength, view: base.view, forEdit: !!forEdit });
      hook(); watchJob(d.prompt_id);
      return true;
    } catch (err) {
      fail(`Couldn't queue: ${err.message}`);
      return false;
    } finally { if (btn) btn.disabled = false; }
  }

  function paintStored(box, job) {
    const kids = [];
    const imgs = job.images || [];
    if (imgs.length === 1 && /\.webp$/i.test(imgs[0].filename)) {
      kids.push(el("img", { class: "mmrp-iclip", src: tempURL(imgs[0]), alt: "" }));
    } else if (imgs.length) {
      kids.push(el("div", { class: "mmrp-iframes" }, imgs.map((f, i) => {
        const tile = el("div", { class: "mmrp-iframe" }, el("img", { src: tempURL(f), alt: "" }), el("span", {}, String(i + 1)));
        attachPeek(tile, (stage) => stage.append(el("img", { class: "mmrp-peekcanvas", src: tempURL(f), alt: "" })),
          `Frame ${i + 1} of ${imgs.length}` + (job.strength < 1 ? ` · at strength ${job.strength.toFixed(2)}` : ""));
        return tile;
      })));
    }
    (job.audio || []).forEach((f) => kids.push(el("audio", { class: "mmrp-iaudio", controls: true, src: tempURL(f) })));
    if (job.strength < 1) kids.push(el("div", { class: "mmrp-dim" }, `Shown at strength ${job.strength.toFixed(2)}.`));
    if (!kids.length) kids.push(el("div", { class: "mmrp-dim" }, "Nothing came back."));
    setChildren(box, kids);
  }
  function inspectEvent(kind, e) {
    const job = inspectJobs.get(e.detail?.prompt_id);
    if (!job) return false;
    if (kind === "executed") {
      const out = e.detail?.output || {};
      job.images.push(...(out.images || [])); job.audio.push(...(out.audio || []));
    } else if (kind === "success" || kind === "error") {
      finishJob(e.detail.prompt_id, kind === "success", e.detail?.exception_message);
    }
    return true;
  }
  /** The live connection can drop a job's events (a reconnect mid-run); the history
   *  route has the same answer, so poll it until the job is accounted for.
   *  Covers decode jobs and the Create tab's create/edit jobs alike. */
  function watchJob(pid) {
    const started = Date.now();
    const pending = () => inspectJobs.has(pid) || jobs.some((j) => j.prompt_id === pid && j.status !== "done" && j.status !== "error");
    const tick = async () => {
      if (!pending() || Date.now() - started > 30 * 60 * 1000) return;
      try {
        const h = await (await api.fetchApi(`/history/${pid}`)).json();
        const entry = h && h[pid];
        if (entry && entry.status && entry.status.completed !== undefined) {
          const ok = entry.status.status_str === "success";
          const errMsg = (entry.status.messages || []).map((m) => m[0] === "execution_error" ? m[1]?.exception_message : "").find(Boolean);
          if (inspectJobs.has(pid)) finishJob(pid, ok, errMsg, entry.outputs);
          else {
            const j = jobs.find((x) => x.prompt_id === pid);
            if (j && !j.saved.length) for (const o of Object.values(entry.outputs || {})) j.saved.push(...(o.refmod_saved || []));
            onEvt[ok ? "execution_success" : "execution_error"]({ detail: { prompt_id: pid, exception_message: errMsg } });
          }
          return;
        }
      } catch (e) { /* server away: try again */ }
      setTimeout(tick, 4000);
    };
    setTimeout(tick, 4000);
  }
  function finishJob(pid, ok, errMsg, outputs) {
    const job = inspectJobs.get(pid);
    if (!job) return;
    inspectJobs.delete(pid);
    if (outputs && !job.images.length && !job.audio.length) {
      for (const o of Object.values(outputs)) { job.images.push(...(o.images || [])); job.audio.push(...(o.audio || [])); }
    }
    const box = [...document.querySelectorAll(".mmrp-istored")].find((b) => b.dataset.item === job.name);
    if (!ok) {
      if (box) setChildren(box, el("div", { class: "mmrp-err" }, errMsg || "Decoding failed."));
      if (job.forEdit && editing && editing.name === job.name) { editing.decodeError = errMsg || "Decoding failed."; if (view.tab === "create") paintCreate(); }
      return;
    }
    if (job.forEdit) {
      if (editing && editing.name === job.name) { seedStored(job); if (view.tab === "create") paintCreate(); }
      if (box && !inspectResults.has(job.name)) { inspectResults.set(job.name, job); paintStored(box, job); }
      return;
    }
    inspectResults.set(job.name, job);
    if (box) paintStored(box, job);
  }

  /* ---- edit mode: a saved RefMod's frames pulled into the Create tab.
   *      Stored frames are sources like any other (reorder, untick, drop),
   *      new pictures encode to the file's own shape, and Save runs the
   *      Edit node — kept frames are copied, never re-encoded. */
  let editing = null;      // { name, it, visual, audio, decoded, decodeError, copy, copyName }
  const isStored = (x) => x.stored != null || x.storedVoice;

  /** Stored frame indices that were encoded together from one clip, as runs.
   *  A saved file lists one "frames x height x width" entry per source in
   *  order; an entry with more than one frame was a clip. When the entries
   *  don't add up to the file's frames (an older or edited file), a file
   *  whose source was a video is treated as one clip. */
  function clipRuns(visual) {
    if (!visual || !(visual.t > 1)) return [];
    const counts = String(visual.source_shape || "").split("+")
      .map((e) => parseInt(e.trim().split("x")[0], 10)).filter((n) => n > 0);
    if (counts.length && counts.reduce((a, b) => a + b, 0) === visual.t) {
      const runs = []; let at = 0;
      for (const n of counts) {
        if (n > 1) runs.push(Array.from({ length: n }, (_, k) => at + k));
        at += n;
      }
      return runs;
    }
    return visual.source === "video" ? [Array.from({ length: visual.t }, (_, k) => k)] : [];
  }

  /** True when the frames of a clip no longer sit together, whole and in
   *  their original order, in what Save would write. */
  function clipBroken() {
    if (!editing?.clipRuns?.length) return false;
    const order = editPlan().order;
    return editing.clipRuns.some((run) => {
      const at = order.indexOf(run[0]);
      return at < 0 || run.some((idx, k) => order[at + k] !== idx);
    });
  }

  function startEdit(it) {
    if (!it.visual && !it.audio) return;
    if (editing) cancelEdit(false);
    editing = { name: it.name, it, visual: it.visual, audio: it.audio, decoded: false, decodeError: "",
      copy: false, copyName: `${it.label} copy` };
    // The file's own shape, in pixels: what new pictures are fitted to.
    let w = (it.visual?.w || 0) * 16, h = (it.visual?.h || 0) * 16;
    const first = String(it.visual?.source_shape || "").split("+")[0].trim().split("x");
    if (it.visual && it.visual.mode !== "encode" && first.length === 3) { h = (+first[1] || 0) * 16; w = (+first[2] || 0) * 16; }
    editing.px = [Math.max(16, w), Math.max(16, h)];
    editing.clipRuns = clipRuns(it.visual);
    const inClip = new Set(editing.clipRuns.flat());
    const stored = [];
    for (let i = 0; i < (it.visual?.t || 0); i++) {
      stored.push({ stored: i, name: `Frame ${i + 1}`, origin: "stored", use: true, clip: inClip.has(i),
        rec: { kind: "picture", file: "" }, dim: { w: editing.px[0], h: editing.px[1], turned: true } });
    }
    if (it.audio) stored.push({ storedVoice: true, name: "Voice", origin: "stored", use: true, voice: true,
      rec: { kind: "audio", file: "" }, dim: { w: 0, h: 0, dur: it.audio.seconds || 0, turned: true } });
    sources.unshift(...stored);
    // Thumbnails come from a decode; reuse one that shows every frame plain.
    const last = inspectResults.get(it.name);
    if (last && last.strength >= 1 && last.view === "frames" && (last.images || []).length === (it.visual?.t || 0)
        && (!it.audio || (last.audio || []).length)) seedStored(last);
    else queueInspect(it, { forEdit: true });
    view.tab = "create"; paintTabs();
  }
  function seedStored(job) {
    const imgs = job.images || [], aud = job.audio || [];
    for (const x of sources) {
      if (x.stored != null && imgs[x.stored] && !(imgs.length === 1 && /\.webp$/i.test(imgs[0].filename))) x.rec.file = tempRef(imgs[x.stored]);
      if (x.storedVoice && aud[0]) x.rec.file = tempRef(aud[0]);
    }
    editing.decoded = true;
  }
  function cancelEdit(repaint = true) {
    editing = null;
    for (let i = sources.length - 1; i >= 0; i--) if (isStored(sources[i])) sources.splice(i, 1);
    if (repaint) paintTabs();
  }
  /** Library name the copy will get (same folder as the original). */
  function copyTarget() {
    const nm = cleanName(editing?.copyName || "");
    if (!nm) return "";
    return editing.it.folder ? `${editing.it.folder}/${nm}` : nm;
  }
  /** What Save would send, or null when nothing changed. */
  function editPlan() {
    if (!editing) return null;
    const u = used();
    const looks = u.filter(isLook);
    const adds = looks.filter((x) => !isStored(x));
    const order = looks.map((x) => (isStored(x) ? x.stored : `a${adds.indexOf(x)}`));
    const same = !adds.length && order.length === (editing.visual?.t || 0) && order.every((v, i) => v === i);
    const newVoice = u.find((x) => x.voice && !isStored(x)) || null;
    const storedVoiceKept = u.some((x) => x.storedVoice);
    let voice = "";
    if (newVoice) voice = "new";
    else if (editing.audio && !storedVoiceKept) voice = "remove";
    return { order, adds, same, voice, newVoice, changed: !same || !!voice, looks: looks.length };
  }

  /* ---- create tab */
  const dropIn = el("input", { type: "file", multiple: true, accept: "image/*,video/*,audio/*", style: { display: "none" },
    onchange: (e) => { addFiles([...e.target.files]); e.target.value = ""; } });
  const srcBar = el("div", { class: "mmrp-srcbar" });
  const sourceList = el("div", { class: "mmrp-sources" });
  const jobsEl = el("div", { class: "mmrp-jobs" });
  const form = el("div", { class: "mmrp-form" });
  const budgetEl = el("div", { class: "mmrp-budgetline" });
  const createBtn = el("button", { class: "mmrp-btn primary", onclick: () => submit() }, "Create");
  const pullSel = el("select", { class: "mmrp-sel", "aria-label": "Pull from a Media Loader" });
  // Click target only: drops are taken by the whole dialog (see below).
  const drop = el("div", { class: "mmrp-drop", onclick: () => dropIn.click() },
    "Drop pictures, clips or audio anywhere here, or click to choose", dropIn);
  setChildren(createPane,
    el("div", { class: "mmrp-cbar" },
      el("span", { class: "mmrp-fh" }, "Sources"),
      el("span", { class: "mmrp-grow" }),
      el("label", { class: "mmrp-inline" }, "From loader", pullSel),
      el("button", { class: "mmrp-btn", onclick: () => pull() }, "Pull")),
    el("div", { class: "mmrp-createbody" },
      el("div", { class: "mmrp-ccol" }, drop, srcBar, sourceList),
      el("div", { class: "mmrp-ccol" }, form, el("div", { class: "mmrp-crow" }, createBtn), budgetEl, jobsEl)));

  // One RefMod from everything (a stack) is the default; one per source is
  // for turning a batch of unrelated items into separate references.
  let combine = st.combine !== false;
  let stackName = "";
  const isLook = (s) => s.rec.kind === "picture" || s.rec.kind === "video";
  const used = () => sources.filter((x) => x.use);
  const defaultStackName = () => {
    const fromLoader = sources.find((x) => x.origin && x.origin !== "upload");
    return cleanName(fromLoader ? fromLoader.origin : (used()[0]?.name || "")) || "refmod";
  };

  async function addFiles(list) {
    for (const f of list) {
      const fd = new FormData(); fd.append("file", f);
      try {
        const r = await postApi("/minimax_h3_plus/upload", { body: fd });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        const rec = { file: d.file, kind: d.kind, name: d.name, has_audio: !!d.has_audio, audio_mode: "paired",
          duration: d.duration, width: d.width, height: d.height };
        sources.push(...sourcesFromItems([rec], "upload"));
      } catch (err) { toast(`Couldn't upload ${f.name}: ${err.message}`, 5000); }
    }
    paintTabs();
  }
  function pull() {
    const L = loadersInGraph()[+pullSel.value];
    if (!L) { toast("No Media Loader in this workflow"); return; }
    const before = sources.length;
    for (const x of sourcesFromItems(L.items, L.title)) if (!sources.some((y) => y.rec.file === x.rec.file)) sources.push(x);
    toast(`Pulled ${sources.length - before} item${sources.length - before === 1 ? "" : "s"} from ${L.title}`);
    paintTabs();
  }

  /* ---- sizes: from the record when the loader knows them, else read off
   *      the file in the browser. Needed for the token estimate. */
  function probe(x) {
    if (x.dim || x.probing) return;
    const r = x.rec, done = (d) => { x.dim = d; x.probing = false; schedulePaint(); };
    if (r.width && r.height && (r.kind !== "video" || r.duration)) {
      // A Media Loader record's size already describes the turned picture.
      x.dim = { w: +r.width, h: +r.height, dur: +r.duration || 0, turned: true }; return;
    }
    x.probing = true;
    if (r.kind === "picture") {
      const im = new Image(); im.onload = () => done({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => { x.probing = false; }; im.src = viewURL(r.file);
    } else if (r.kind === "video") {
      const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
      // The loader's own duration wins: the browser's includes the audio
      // track, which can run a little longer than the picture.
      v.onloadedmetadata = () => done({ w: v.videoWidth, h: v.videoHeight, dur: +r.duration || v.duration || 0 });
      v.onerror = () => { x.probing = false; }; v.src = viewURL(r.file);
    } else { x.probing = false; }
  }
  /** Repaint the Create tab once a size arrives: the trim captions, stack
   *  previews and shape note all depend on it, not just the token line.
   *  Several probes finishing together make one repaint, and a repaint
   *  waits while you're typing in one of the tab's fields so it never
   *  steals the caret (re-checked on a timer: a focus-loss event isn't
   *  always delivered, e.g. when the window itself isn't focused). */
  let paintQueued = false;
  function schedulePaint() {
    paintBudget();
    if (paintQueued) return;
    paintQueued = true;
    const run = () => {
      if (!paintQueued) return;                 // a full repaint already ran
      const a = document.activeElement;
      if (a && a.isConnected && createPane.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox") {
        setTimeout(run, 250);                   // look again once you've moved on
        return;
      }
      paintQueued = false;
      if (view.tab === "create") paintCreate();
    };
    // A timer rather than requestAnimationFrame: browsers pause the latter
    // in background tabs, and a size can land while you're elsewhere.
    setTimeout(run, 30);
  }
  /** Size of the picture after its quarter turns, before any crop. */
  function turnedDims(x) {
    const turn = ((parseInt(x.rec.rotate, 10) || 0) % 360 + 360) % 360;
    return !x.dim.turned && (turn === 90 || turn === 270) ? [x.dim.h, x.dim.w] : [x.dim.w, x.dim.h];
  }
  /** Width and height the encoder will see: crop and quarter turns applied. */
  function effDims(x) {
    if (!x.dim) return null;
    let [w, h] = turnedDims(x);
    w *= x.rec.crop?.w || 1; h *= x.rec.crop?.h || 1;
    return [Math.max(1, w), Math.max(1, h)];
  }
  /** H3's video VAE works in chunks of 17 frames: it stores 2 latent frames
   *  for the first chunk and 5 more per chunk after that, so a clip is cut to
   *  5, 22, 39, 56… source frames (fewer than 5 are taken as they are). */
  const h3Take = (n) => (n <= 1 ? 1 : n < 5 ? n : n - ((n - 5) % 17));
  const h3Stored = (n) => (n <= 1 ? 1 : 5 * Math.ceil(n / 17) - 3);
  /** Source frames a clip has after its trim, or null while unknown. */
  function clipFrames(x) {
    if (!x.dim?.dur) return null;
    const t0 = Number(x.rec.trim?.start) || 0;
    const t1 = x.rec.trim?.end != null ? Number(x.rec.trim.end) : x.dim.dur;
    return Math.max(1, Math.round(Math.max(0, t1 - t0) * 24) + (x.rec.trim ? 1 : 0));
  }
  /** Latent frames one source contributes, or null while its length is unknown. */
  function framesOf(x) {
    if (x.rec.kind === "picture") return 1;
    const n = clipFrames(x);
    return n == null ? null : h3Stored(h3Take(Math.min(st.latent_frames, n)));
  }
  /** "22 frames from the start → 7 stored" for the Clip frames setting. */
  const clipFramesHint = () => {
    const take = h3Take(st.latent_frames), stored = h3Stored(take);
    return `${take} frame${take === 1 ? "" : "s"} from the clip's start \u2192 ${stored} stored` +
      (take !== st.latent_frames ? ` (H3 encodes whole chunks: ${st.latent_frames} is cut to ${take})` : "");
  };
  /** Full or Compressed: the setting, or the file's own mode while editing. */
  const fullMode = () => (editing ? editing.visual?.mode === "encode" : st.mode === "Full Reference");
  /** Token estimate for a set of look sources saved as one RefMod. */
  function estimate(list) {
    const looks = list.filter(isLook);
    if (!looks.length) return { tokens: 0, frames: 0, known: true };
    if (editing) {
      // Every frame costs what the file's frames cost; new ones take its shape.
      const per = editing.visual && editing.visual.t ? editing.visual.tokens / editing.visual.t : 0;
      let frames = 0, known = true;
      for (const x of looks) { const f = isStored(x) ? 1 : framesOf(x); if (f == null) known = false; else frames += f; }
      return { tokens: Math.round(per * frames), frames, known };
    }
    const first = effDims(looks[0]);
    let tokens = 0, frames = 0, known = !!first;
    const full = st.mode === "Full Reference";
    for (const x of looks) {
      const f = framesOf(x), d = effDims(x);
      if (f == null || !d || !first) { known = false; continue; }
      // In a stack every frame takes the first source's shape.
      const [w, h] = looks.length > 1 ? first : d;
      tokens += f * (full ? fullTokens(w, h, st.ref_resolution) : compressedTokens(w, h, st.ref_resolution, st.grid));
      frames += f;
    }
    return { tokens, frames, known };
  }
  const limitText = () => (st.max_tokens > 0 ? `limit ${fmt(st.max_tokens)}` : "no limit");

  /** The shape every frame of the stack takes, or null when nothing is
   *  being stacked (one per source, or a single picture or clip). Full:
   *  the first source's canvas at the chosen resolution. Compressed: the
   *  pooled grid anchored on its proportions. */
  function stackTarget() {
    if (editing) {
      if (!editing.visual || !used().some((x) => isLook(x) && !isStored(x))) return null;
      const [w, h] = editing.px;
      return { mode: fullMode() ? "full" : "compressed", aspect: w / h, first: null, lock: editing.px };
    }
    if (!combine) return null;
    const looks = used().filter(isLook);
    if (looks.length < 2) return null;
    const d = effDims(looks[0]);
    if (!d) return null;
    const [w0, h0] = d;
    if (st.mode === "Full Reference") {
      const sc = Math.min(1, st.ref_resolution / Math.min(w0, h0));
      const tw = Math.max(32, pyRound(w0 * sc / 32) * 32), th = Math.max(32, pyRound(h0 * sc / 32) * 32);
      return { mode: "full", aspect: tw / th, first: looks[0] };
    }
    // Compressed pools every frame to one grid shaped like the first photo,
    // so the others are measured against that photo's own proportions.
    return { mode: "compressed", aspect: w0 / h0, first: looks[0] };
  }

  /** The line under Create: what will be made and what it costs. Blocks the
   *  button when something is over the limit — nothing is ever trimmed. */
  let blocked = false;
  function paintBudget() {
    const u = used();
    blocked = false;
    let line, cls = "";
    if (editing) {
      const plan = editPlan(), e = estimate(u), t = editing.visual?.t || 0;
      const voiceNote = plan.voice === "new" ? " · new voice" : plan.voice === "remove" ? " · voice removed" : "";
      const copyTo = editing.copy ? copyTarget() : null;
      if (editing.decodeError) { cls = "over"; line = `Couldn't decode the stored frames: ${editing.decodeError}`; }
      else if (editing.copy && !copyTo) { blocked = true; cls = "over"; line = "Give the copy a name."; }
      else if (editing.copy && byName(copyTo)) { blocked = true; cls = "over"; line = `"${copyTo}" already exists — pick another name.`; }
      else if (!plan.changed && !editing.copy) line = `${t} frame${t === 1 ? "" : "s"} · ${fmt(editing.visual?.tokens || 0)} tokens · nothing changed yet`;
      else if (editing.visual && !plan.looks) { blocked = true; cls = "over"; line = "That would leave no frames — delete the RefMod instead."; }
      else if (!e.known) line = `${t} → ${e.frames}+ frames${voiceNote} · working out the size…`;
      else if (st.max_tokens > 0 && e.tokens > st.max_tokens) {
        blocked = true; cls = "over";
        line = `About ${fmt(e.tokens)} tokens — over the ${fmt(st.max_tokens)} limit. Raise the limit or untick some frames.`;
      } else line = `${t} → ${e.frames} frame${e.frames === 1 ? "" : "s"}${voiceNote} · about ${fmt(e.tokens)} tokens (${limitText()})` +
        (editing.copy ? ` · saved as "${copyTo}"` : "");
      budgetEl.className = "mmrp-budgetline " + cls;
      budgetEl.textContent = (cls ? "⚠ " : "") + line;
      createBtn.disabled = blocked || (!plan.changed && !editing.copy) || !!editing.decodeError;
      createBtn.textContent = blocked ? "Can't save" : editing.copy ? "Save as a copy" : plan.changed ? "Save changes" : "No changes";
      return;
    }
    if (!u.length) { line = ""; }
    else if (combine) {
      const e = estimate(u), looks = u.filter(isLook).length;
      const voice = u.some((x) => x.voice) ? " + voice" : "";
      if (!looks) line = "One voice RefMod";
      else if (!e.known) line = `One RefMod · ${looks} source${looks === 1 ? "" : "s"}${voice} · working out the size…`;
      else if (st.max_tokens > 0 && e.tokens > st.max_tokens) {
        blocked = true; cls = "over";
        line = `About ${fmt(e.tokens)} tokens — over the ${fmt(st.max_tokens)} limit. Raise the limit, lower the ` +
          "resolution or clip frames, use Compressed, or untick some sources.";
      } else line = `One RefMod · ${e.frames} frame${e.frames === 1 ? "" : "s"}${voice} · about ${fmt(e.tokens)} tokens (${limitText()})`;
    } else {
      const each = u.map((x) => ({ x, e: estimate([x]) }));
      const over = each.filter(({ e }) => e.known && st.max_tokens > 0 && e.tokens > st.max_tokens);
      const biggest = Math.max(0, ...each.filter(({ e }) => e.known).map(({ e }) => e.tokens));
      if (over.length) {
        blocked = true; cls = "over";
        line = `${over.length === 1 ? "One source is" : `${over.length} sources are`} over the ${fmt(st.max_tokens)} limit: ` +
          over.map(({ x }) => x.name).join(", ") + ". Raise the limit, lower the resolution or clip frames, or untick them.";
      } else line = `${u.length} RefMod${u.length === 1 ? "" : "s"} · largest about ${fmt(biggest)} tokens (${limitText()})`;
    }
    budgetEl.className = "mmrp-budgetline " + cls;
    budgetEl.textContent = (cls ? "⚠ " : "") + line;
    const n = u.length;
    createBtn.disabled = !n || blocked;
    createBtn.textContent = blocked ? "Over the token limit"
      : !n ? "Create" : combine ? "Create 1 RefMod" : `Create ${n} RefMod${n === 1 ? "" : "s"}`;
  }

  let noteEl = null;
  /** Full vs Compressed in plain words, with each one's token cost at the
   *  current settings: for the first picture or clip in the list, else a
   *  1024 px square. The basis is in the figure's hover text, not on screen. */
  function modeNote() {
    const full = st.mode === "Full Reference";
    const first = used().find((x) => isLook(x) && effDims(x));
    let [w, h] = first ? effDims(first) : [1024, 1024];
    const what = first ? `${first.name} (${Math.round(w)}×${Math.round(h)})` : "a 1024 px square picture";
    const ft = fullTokens(w, h, st.ref_resolution), ct = compressedTokens(w, h, st.ref_resolution, st.grid);
    const basis = `For ${what} at the current settings`;
    const row = (on, title, tag, cost, body) => el("div", { class: "mmrp-noterow" + (on ? " on" : "") },
      el("div", { class: "mmrp-notehead" },
        el("span", {}, el("b", {}, title), el("i", {}, ` · ${tag}`)),
        el("span", { title: basis }, `${fmt(cost)} tokens / frame`)),
      el("div", {}, body));
    noteEl = el("div", { class: "mmrp-note" },
      row(full, "Full", "more detail, slower", ft,
        "Keeps as much of the picture as possible. Use it when the details matter: a face, a particular " +
        "character, a product, or text that needs to stay readable."),
      row(!full, "Compressed", "lighter, faster", ct,
        "Keeps the overall look (colours, layout, shapes and style) but not the fine details. Good for a " +
        "setting, a style or a mood, or when you want to use lots of references at once."),
      el("div", { class: "mmrp-notefoot" }, "Not sure? Make one of each and try them with the same prompt."));
    return noteEl;
  }

  function paintSrcBar() {
    if (editing) {
      const v = editing.visual, [pw, ph] = editing.px;
      const shape = v ? `${v.mode === "encode" ? "Full" : "Compressed"} · ${pw}×${ph}` : "voice only";
      setChildren(srcBar,
        el("div", { class: "mmrp-cbar" },
          el("span", { class: "mmrp-fh" }, `Editing ${editing.it.label}`),
          el("span", { class: "mmrp-dim" }, shape),
          el("span", { class: "mmrp-grow" }),
          el("button", { class: "mmrp-btn", onclick: () => cancelEdit() }, "Cancel")),
        el("div", { class: "mmrp-cbar" },
          el("label", { class: "mmrp-inline", title: "Leave the original as it is and write the result as a new RefMod" },
            el("input", { type: "checkbox", checked: editing.copy,
              onchange: (e) => { editing.copy = e.target.checked; paintCreate(); } }), "Save as a copy"),
          editing.copy ? el("input", { class: "mmrp-search", value: editing.copyName, "aria-label": "Name for the copy",
            placeholder: "name for the copy", style: { flex: "1 1 160px" },
            onchange: (e) => { editing.copyName = cleanName(e.target.value); e.target.value = editing.copyName; paintBudget(); } }) : null,
          editing.copy && editing.it.folder ? el("span", { class: "mmrp-dim" }, `in ${editing.it.folder}/`) : null),
        el("div", { class: "mmrp-srchint" },
          "The stored frames are listed first. Untick or remove the ones you don't want, drag to reorder, and drop new " +
          "pictures or clips in to add them — they're encoded to this file's size and shape (" +
          (fullMode() ? "edges trimmed" : "squeezed") + " to fit). Frames you keep are copied as they are, never re-encoded." +
          (editing.audio ? " Adding an audio file, or ticking a clip's soundtrack, replaces the voice; untick the stored voice to remove it."
                         : " Add an audio file, or tick a clip's soundtrack, to give it a voice.")),
        editing.clipRuns.length
          ? el("div", { class: "mmrp-srchint" + (clipBroken() ? " warn" : "") },
              clipBroken()
                ? "Some frames from a video clip have been removed, reordered or split up. The frames " +
                  "you keep are still copied exactly, but they no longer play as the motion they were " +
                  "made from, which can make results drift. To change a clip, re-trim it and create " +
                  "the RefMod again."
                : "Frames marked \u201cpart of a clip\u201d were encoded together from a video. Keep them " +
                  "together and in order; removing or reordering them can break up the motion.")
          : null,
        !editing.decoded && !editing.decodeError ? el("div", { class: "mmrp-srchint" }, "Decoding the stored frames for their thumbnails…") : null);
      return;
    }
    const looks = used().filter(isLook).length;
    const seg = el("div", { class: "mmrp-seg", role: "group", "aria-label": "How many RefMods" },
      el("button", { class: combine ? "on" : "", onclick: () => { combine = true; st.combine = true; saveSettings(st); paintCreate(); } },
        "One RefMod from all"),
      el("button", { class: combine ? "" : "on", onclick: () => { combine = false; st.combine = false; saveSettings(st); paintCreate(); } },
        "One per source"));
    const kids = [seg];
    if (combine) {
      kids.push(el("label", { class: "mmrp-ilabel" }, "Name",
        el("input", { class: "mmrp-search", value: stackName || defaultStackName(), "aria-label": "RefMod name",
          onchange: (e) => { stackName = cleanName(e.target.value); e.target.value = stackName || defaultStackName(); } })));
      if (looks > 1) {
        const full = st.mode === "Full Reference";
        kids.push(el("div", { class: "mmrp-srchint" },
          `The ${looks} pictures and clips become one reference, one frame each. They all take the first one's ` +
          `shape, and the others ${full ? "have their edges trimmed" : "are squeezed"} to fit, so put your ` +
          "best-framed photo first. Drag to reorder. In prompts it's cited as one video, like <Video 1>."));
        const t = stackTarget();
        if (t) {
          const bad = used().filter((x) => isLook(x) && x !== t.first && effDims(x))
            .filter((x) => { const [w, h] = effDims(x); return fitOf(w / h, t).keep < 0.8; }).length;
          if (bad) kids.push(el("div", { class: "mmrp-srchint warn" },
            `${bad === 1 ? "1 photo is" : `${bad} photos are`} a very different shape from the first and will be ` +
            `${full ? "trimmed" : "squeezed"} noticeably — see the previews.`));
        }
      }
    }
    setChildren(srcBar, kids);
  }

  function paintCreate() {
    paintQueued = false;                        // this repaint covers any pending one
    const loaders = loadersInGraph();
    setChildren(pullSel, loaders.length ? loaders.map((L, i) => el("option", { value: i }, `${L.title} (${L.items.length})`))
      : el("option", { value: "" }, "no Media Loader in graph"));
    sources.forEach(probe);
    paintSrcBar();
    const firstLook = editing ? null : used().find(isLook);
    const target = stackTarget();
    setChildren(sourceList, sources.length ? sources.map((x, i) => sourceRow(x, i, x === firstLook, target))
      : el("div", { class: "mmrp-status" }, "Nothing to encode yet."));
    const num = (key, label, min, max, step, title, hint) => {
      const sub = hint ? el("span", { class: "mmrp-dim mmrp-numhint" }, hint()) : null;
      return el("label", { class: "mmrp-ilabel", title }, label,
        el("input", { class: "mmrp-num", type: "number", min, max, step, value: st[key],
          onchange: (e) => { st[key] = clampSetting(key, e.target.value, st[key]); e.target.value = st[key]; saveSettings(st);
            if (key === "ref_resolution" || key === "grid") noteEl?.replaceWith(modeNote());
            if (sub) sub.textContent = hint();
            if (key === "latent_frames") paintCreate(); else paintBudget(); } }),
        sub);
    };
    const vaeSel = (key, label, guess) => {
      if (!st[key] && vaes.length) st[key] = vaes.find((v) => guess.test(v)) || "";
      return el("label", { class: "mmrp-ilabel" }, label,
        el("select", { class: "mmrp-sel", onchange: (e) => { st[key] = e.target.value; saveSettings(st); } },
          el("option", { value: "" }, "(choose)"), vaes.map((v) => el("option", { value: v, selected: v === st[key] }, v))));
    };
    const needVoice = used().some((x) => x.voice && !isStored(x)), needLook = used().some((x) => isLook(x) && !isStored(x));
    if (editing) {
      setChildren(form,
        el("div", { class: "mmrp-fh" }, "Settings"),
        el("div", { class: "mmrp-grid2" },
          num("max_tokens", "Max tokens", 0, 1048576, 256, "Refuses to save anything bigger than this. 0 = no limit."),
          num("latent_frames", "Clip frames", 1, 1024, 1, "Frames taken from the start of each added clip, after its trim.", clipFramesHint),
          num("audio_max_seconds", "Voice seconds", 0.5, 600, 0.5, "Seconds of a new voice kept from the start.")),
        el("div", { class: "mmrp-fh", style: { marginTop: "8px" } }, "Models"),
        needLook ? vaeSel("videoVae", "H3 video VAE", /minimax.*video|h3.*video/i) : null,
        needVoice ? vaeSel("audioVae", "H3 audio VAE", /minimax.*audio|h3.*audio/i) : null,
        !needLook && !needVoice ? el("div", { class: "mmrp-dim" }, "Keeping and reordering needs no model.") : null,
        el("div", { class: "mmrp-dim", style: { fontSize: "calc(10.5px * var(--mmh3-fs, 1))" } },
          "Runs through the queue like any workflow; watch progress here or in the queue panel."));
      paintBudget(); paintJobs();
      return;
    }
    setChildren(form,
      el("div", { class: "mmrp-fh" }, "Settings"),
      el("label", { class: "mmrp-ilabel" }, "Folder", el("input", { class: "mmrp-search", value: st.subfolder, placeholder: "(root)",
        onchange: (e) => { st.subfolder = e.target.value.trim(); saveSettings(st); } })),
      el("label", { class: "mmrp-ilabel" }, "Mode", el("select", { class: "mmrp-sel", onchange: (e) => { st.mode = e.target.value; saveSettings(st); paintCreate(); } },
        ["Full Reference", "Compressed Reference"].map((m) => el("option", { value: m, selected: st.mode === m }, m)))),
      modeNote(),
      el("div", { class: "mmrp-grid2" },
        num("ref_resolution", "Resolution (short edge)", 256, 2048, 32, "Pictures are scaled down to this before encoding, never up."),
        num("max_tokens", "Max tokens", 0, 1048576, 256, "Refuses to create anything bigger than this. 0 = no limit."),
        st.mode === "Compressed Reference" ? num("grid", "Grid (long edge)", 2, 64, 2, "How small Compressed goes. 16 is up to 64 tokens per frame.") : null,
        st.mode === "Compressed Reference" ? num("refinement_steps", "Refinement steps", 0, 5000, 50, "How long Compressed is tuned toward the full picture.") : null,
        num("latent_frames", "Clip frames", 1, 1024, 1, "Frames taken from the start of each clip, after its trim. Trim the clip to the moment you want first.", clipFramesHint),
        num("audio_max_seconds", "Voice seconds", 0.5, 600, 0.5, "Seconds of voice kept from the start.")),
      el("label", { class: "mmrp-ilabel" }, "Concept", el("select", { class: "mmrp-sel", onchange: (e) => { st.concept_type = e.target.value; saveSettings(st); } },
        CONCEPTS.map((c) => el("option", { value: c, selected: c === st.concept_type }, c)))),
      el("label", { class: "mmrp-inline" }, el("input", { type: "checkbox", checked: st.write_preview,
        onchange: (e) => { st.write_preview = e.target.checked; saveSettings(st); } }), "Save a preview image beside each file"),
      el("div", { class: "mmrp-fh", style: { marginTop: "8px" } }, "Models"),
      needLook || !needVoice ? vaeSel("videoVae", "H3 video VAE", /minimax.*video|h3.*video/i) : null,
      needVoice ? vaeSel("audioVae", "H3 audio VAE", /minimax.*audio|h3.*audio/i) : null,
      el("div", { class: "mmrp-dim", style: { fontSize: "calc(10.5px * var(--mmh3-fs, 1))" } },
        "Runs through the queue like any workflow; watch progress here or in the queue panel."));
    paintBudget();
    paintJobs();
  }

  /** Crop, turn or trim a source here without touching its Media Loader.
   *  In a stack, the other photos open locked to the first one's shape, so
   *  you choose which part is kept instead of taking the centre. */
  function cropButton(x, setsFrame, target) {
    const lock = target && !setsFrame && x.use ? (target.lock || (target.first && effDims(target.first))) : null;
    const ratio = lock ? lock[0] / lock[1] : 0;
    const label = lock ? "Crop to fit…" : (x.rec.kind === "video" ? "Crop / trim…" : "Crop…");
    return el("button", { class: "mmrp-btn", title: lock
        ? "Choose which part of this photo is kept. The box is locked to the first photo's shape."
        : "Crop, rotate or mirror this source for the RefMod (the Media Loader is left as it is).",
      onclick: () => {
        // The editor sizes its crop box from the record, and expects the
        // turned size there.
        if (x.dim) { const [w, h] = turnedDims(x); x.rec.width = Math.round(w); x.rec.height = Math.round(h); }
        if (x.dim?.dur && !x.rec.duration) x.rec.duration = x.dim.dur;
        hidePeek();
        openCropEditor(x.rec, {
          aspect: ratio || undefined,
          aspectLabel: lock ? `first photo (${Math.round(lock[0])}×${Math.round(lock[1])})` : undefined,
          say: (m) => toast(m, 4000),
          onApply: () => { x.dim = null; x.probing = false; paintCreate(); },
        });
      } }, label);
  }

  let dragSrc = null;
  function moveSource(from, to) {
    if (from === to || from < 0 || to < 0 || from >= sources.length || to >= sources.length) return;
    const [m] = sources.splice(from, 1); sources.splice(to, 0, m); paintCreate();
  }
  function sourceRow(x, i, setsFrame, target) {
    const k = x.rec.kind === "picture" ? "image" : x.rec.kind;
    const bits = [];
    const d = isStored(x) ? null : effDims(x);
    if (d) bits.push(`${Math.round(d[0])}×${Math.round(d[1])}`);
    if (x.stored != null) bits.push(x.clip ? "kept as stored \u00b7 part of a clip" : "kept as stored");
    if (x.dim?.dur || x.rec.duration) bits.push(`${Number(x.dim?.dur || x.rec.duration).toFixed(1)} s`);
    if (x.rec.trim && (x.rec.trim.start || x.rec.trim.end)) bits.push(`trim ${Number(x.rec.trim.start || 0).toFixed(1)}–${x.rec.trim.end != null ? Number(x.rec.trim.end).toFixed(1) : "end"} s`);
    if (x.rec.crop) bits.push("cropped");
    const f = isLook(x) && x.use ? framesOf(x) : null;
    const row = el("div", { class: "mmrp-src" + (x.use ? "" : " off") + (dragSrc === i ? " dragging" : "") },
      el("button", { class: "mmrp-grip", draggable: true, title: "Drag to reorder (or arrow keys)",
        onkeydown: (e) => { if (e.key === "ArrowUp") { e.preventDefault(); moveSource(i, i - 1); }
          if (e.key === "ArrowDown") { e.preventDefault(); moveSource(i, i + 1); } } }, "⠇"),
      el("input", { type: "checkbox", checked: x.use, "aria-label": "Use this source", onchange: (e) => { x.use = e.target.checked; paintCreate(); } }),
      el("div", { class: "mmrp-srcleft" },
        isStored(x) && !x.rec.file
          ? el("div", { class: "mmrp-sprev" }, el("span", { class: "mmrp-dim" }, editing?.decodeError ? "no preview" : "decoding…"))
          : target && x.use && isLook(x) && !isStored(x)
          ? fitPreview(x.rec, target, setsFrame, () => `${x.name} · ` + (setsFrame ? "sets dataset size and aspect ratio"
              : effDims(x) ? fitCaption(fitOf(effDims(x)[0] / effDims(x)[1], target)).toLowerCase() : ""))
          : sourcePreview(x.rec, x.name),
        el("span", { class: `mmrp-kind ${KIND[k]?.cls || "pic"}` }, isStored(x) ? "STORED" : (KIND[k]?.short || "REF"))),
      el("div", { class: "mmrp-srcmain" },
        combine || editing
          ? el("div", { class: "mmrp-srctitle" }, el("b", {}, x.name),
              combine && setsFrame && used().filter(isLook).length > 1 ? el("span", { class: "mmrp-framechip",
                title: "Every photo in this RefMod is made this size and shape (portrait, landscape or square). " +
                  (st.mode === "Full Reference" ? "The others have their edges trimmed to match." : "The others are squeezed to match.") },
                "Sets dataset size and aspect ratio") : null)
          : el("input", { class: "mmrp-search", value: x.name, "aria-label": "RefMod name", onchange: (e) => { x.name = cleanName(e.target.value); e.target.value = x.name; } }),
        el("div", { class: "mmrp-dim" }, [x.origin, ...bits].filter(Boolean).join(" · ")),
        f != null ? el("div", { class: "mmrp-dim" }, x.rec.kind === "video"
          ? (() => { const n = clipFrames(x), take = h3Take(Math.min(st.latent_frames, n));
              return `first ${take} of ${n} frames \u2192 ${f} stored frame${f === 1 ? "" : "s"}`; })()
          : `${f} frame${f === 1 ? "" : "s"}`) : null,
        target && x.use && isLook(x) && !isStored(x) && !setsFrame && effDims(x) ? (() => {
          const [w, h] = effDims(x), fit = fitOf(w / h, target);
          return el("div", { class: "mmrp-fitcap" + (fit.keep < 0.8 ? " warn" : "") }, fitCaption(fit));
        })() : null,
        (x.rec.kind === "video" && x.rec.has_audio) ? el("label", { class: "mmrp-inline" },
          el("input", { type: "checkbox", checked: x.voice, onchange: (e) => { x.voice = e.target.checked; paintCreate(); } }), "include its soundtrack as a voice") : null,
        isLook(x) && !isStored(x) ? el("div", { class: "mmrp-srcacts" }, cropButton(x, setsFrame, target)) : null),
      el("button", { class: "mmrp-x", title: isStored(x) ? "Drop this from the RefMod" : "Remove from the list",
        onclick: () => { sources.splice(i, 1); paintTabs(); } }, "×"));
    row.addEventListener("dragstart", (e) => {
      if (!e.target.closest?.(".mmrp-grip")) { e.preventDefault(); return; }
      dragSrc = i; row.classList.add("dragging");
      try { e.dataTransfer.setData("text/x-mmr-src", String(i)); e.dataTransfer.effectAllowed = "move"; } catch (_) {}
    });
    row.addEventListener("dragover", (e) => {
      if (dragSrc == null || dragSrc === i) return;
      e.preventDefault(); row.classList.add("drop-before");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before"));
    row.addEventListener("drop", (e) => {
      if (dragSrc == null) return;
      e.preventDefault(); e.stopPropagation();
      const from = dragSrc; dragSrc = null; moveSource(from, i);
    });
    row.addEventListener("dragend", () => { if (dragSrc != null) { dragSrc = null; paintCreate(); } });
    return row;
  }

  /* ---- submit through the queue */
  async function submit() {
    if (editing) return submitEditPlan();
    const use = used();
    if (!use.length) return;
    paintBudget();
    if (blocked) { toast("Over the token limit — see the note under Create", 5000); return; }
    const needLook = use.some(isLook), needVoice = use.some((x) => x.voice);
    if (needLook && !st.videoVae) { toast("Choose the H3 video VAE first", 4000); return; }
    if (needVoice && !st.audioVae) { toast("Choose the H3 audio VAE first", 4000); return; }
    // Create's resolution decides size, so a loader's size cap doesn't ride along.
    const recOf = (x) => { const r = { ...x.rec }; delete r.resize; if (r.kind === "video") r.audio_mode = x.voice ? "paired" : "off"; return r; };
    const groups = combine
      ? [{ name: stackName || defaultStackName(), members: use }]
      : use.map((x) => ({ name: x.name, members: [x] }));
    const names = groups.map((g) => g.name);
    if (names.some((n) => !n)) { toast("Every RefMod needs a name", 4000); return; }
    if (new Set(names).size !== names.length) { toast("Two sources have the same name", 4000); return; }
    const prompt = {}; let id = 1;
    const vid = needLook ? String(id++) : null;
    if (vid) prompt[vid] = { class_type: "VAELoader", inputs: { vae_name: st.videoVae } };
    const aid = needVoice ? String(id++) : null;
    if (aid) prompt[aid] = { class_type: "VAELoader", inputs: { vae_name: st.audioVae } };
    for (const g of groups) {
      const inputs = { name: g.name, subfolder: st.subfolder || "", mode: st.mode, ref_resolution: st.ref_resolution,
        grid: st.grid, latent_frames: st.latent_frames, refinement_steps: st.refinement_steps, max_tokens: st.max_tokens,
        audio_max_seconds: st.audio_max_seconds, concept_type: st.concept_type, description: "",
        write_preview: !!st.write_preview, source: JSON.stringify(g.members.map(recOf)) };
      if (vid && g.members.some(isLook)) inputs.vae = [vid, 0];
      if (aid && g.members.some((x) => x.voice)) inputs.audio_vae = [aid, 0];
      prompt[String(id++)] = { class_type: CREATE_NAME, inputs };
    }
    createBtn.disabled = true;
    try {
      // Core's own queue route: no pack token involved, and ComfyUI manages
      // the VAEs' memory as for any workflow.
      const r = await api.fetchApi("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client_id: api.clientId }) });
      const d = await r.json();
      if (!r.ok || d.error) {
        const errs = Object.values(d.node_errors || {}).flatMap((n) => (n.errors || []).map((e) => e.message || e.details || ""));
        throw new Error((d.error && (d.error.message || d.error)) + (errs.length ? ": " + errs.join("; ") : ""));
      }
      jobs.unshift({ prompt_id: d.prompt_id, names, status: "queued", msg: `#${d.number} in the queue`, progress: 0, saved: [] });
      hook(); watchJob(d.prompt_id); paintJobs();
      toast(`Queued ${names.length === 1 ? names[0] : `${names.length} RefMods`}`);
    } catch (err) {
      toast(`Couldn't queue: ${err.message}`, 6000);
    } finally { paintBudget(); }
  }

  /** Save an edit: one Edit node run with the frame order, the additions
   *  and the voice change; the library rescans and reselects the file. */
  async function submitEditPlan() {
    const plan = editPlan();
    paintBudget();
    if (!plan || (!plan.changed && !editing.copy) || blocked) return;
    const saveAs = editing.copy ? copyTarget() : "";
    const needLook = plan.adds.length > 0, needVoice = plan.voice === "new";
    if (needLook && !st.videoVae) { toast("Choose the H3 video VAE first", 4000); return; }
    if (needVoice && !st.audioVae) { toast("Choose the H3 audio VAE first", 4000); return; }
    const recOf = (x) => { const r = { ...x.rec }; delete r.resize; if (r.kind === "video") r.audio_mode = x.voice ? "paired" : "off"; return r; };
    const prompt = {}; let id = 1;
    const vid = needLook ? String(id++) : null;
    if (vid) prompt[vid] = { class_type: "VAELoader", inputs: { vae_name: st.videoVae } };
    const aid = needVoice ? String(id++) : null;
    if (aid) prompt[aid] = { class_type: "VAELoader", inputs: { vae_name: st.audioVae } };
    const file = (editing.visual || editing.audio).file;
    const inputs = { file, frames: editing.visual && !plan.same ? JSON.stringify(plan.order) : "",
      add: JSON.stringify(plan.adds.map(recOf)), latent_frames: st.latent_frames, audio_max_seconds: st.audio_max_seconds,
      voice: plan.voice === "new" ? JSON.stringify(recOf(plan.newVoice)) : plan.voice, save_as: saveAs };
    if (vid) inputs.vae = [vid, 0];
    if (aid) inputs.audio_vae = [aid, 0];
    prompt[String(id++)] = { class_type: EDIT_NAME, inputs };
    if (needVoice) {
      const dur = plan.newVoice.dim?.dur || plan.newVoice.rec.duration || 0, cap = st.audio_max_seconds;
      if (dur > cap + 0.05) toast(`Keeping the first ${cap} s of the ${dur.toFixed(1)} s voice — "Voice seconds" sets the limit`, 6000);
    }
    createBtn.disabled = true;
    try {
      const r = await api.fetchApi("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client_id: api.clientId }) });
      const d = await r.json();
      if (!r.ok || d.error) {
        const errs = Object.values(d.node_errors || {}).flatMap((n) => (n.errors || []).map((e) => e.message || e.details || ""));
        throw new Error((d.error && (d.error.message || d.error)) + (errs.length ? ": " + errs.join("; ") : ""));
      }
      const usedNew = used().filter((x) => !isStored(x));
      jobs.unshift({ prompt_id: d.prompt_id, names: [saveAs || editing.it.label], status: "queued", msg: `#${d.number} in the queue`,
        progress: 0, saved: [], edit: editing.name, show: saveAs || editing.name, consumed: usedNew });
      hook(); watchJob(d.prompt_id); paintJobs();
      toast(saveAs ? `Queued a copy as ${saveAs}` : `Queued the changes to ${editing.it.label}`);
    } catch (err) {
      toast(`Couldn't queue: ${err.message}`, 6000);
    } finally { paintBudget(); }
  }

  let hooked = false;
  const onEvt = {
    executing: (e) => { const j = jobs.find((x) => x.prompt_id === e.detail?.prompt_id); if (j && e.detail?.node) { j.status = "running"; j.msg = "encoding…"; paintJobs(); } },
    progress: (e) => { const j = jobs.find((x) => x.prompt_id === e.detail?.prompt_id); if (j && e.detail?.max) { j.progress = e.detail.value / e.detail.max; paintJobs(); } },
    executed: (e) => { if (inspectEvent("executed", e)) return; const j = jobs.find((x) => x.prompt_id === e.detail?.prompt_id); const saved = e.detail?.output?.refmod_saved; if (j && saved) { j.saved.push(...saved); paintJobs(); } },
    execution_error: (e) => { if (inspectEvent("error", e)) return; const j = jobs.find((x) => x.prompt_id === e.detail?.prompt_id); if (j) { j.status = "error"; j.msg = e.detail?.exception_message || "failed"; paintJobs(); } },
    execution_success: async (e) => {
      if (inspectEvent("success", e)) return;
      const j = jobs.find((x) => x.prompt_id === e.detail?.prompt_id); if (!j) return;
      j.status = "done"; j.msg = `saved ${j.saved.length} file${j.saved.length === 1 ? "" : "s"}`; j.progress = 1; paintJobs();
      if (j.edit) {
        // The file changed: forget its old decode, leave edit mode, show it.
        inspectResults.delete(j.edit);
        if (editing && editing.name === j.edit) cancelEdit(false);
        for (const x of j.consumed || []) { const k = sources.indexOf(x); if (k >= 0) sources.splice(k, 1); }
        await load(true);
        if (panel) panel.refresh();
        toast(`Saved ${j.names.join(", ")}`);
        highlight.add(j.show);
        view.tab = "library"; paintTabs(); drawGrid();
        if (view.selected !== j.show) select(j.show);
        return;
      }
      j.saved.forEach((f) => highlight.add(f.replace(/\.(safetensors|png)$/, "").replace(/_(visual|audio)$/, "")));
      await load(true);
      toast(`Created ${j.names.join(", ")}`);
      sources.splice(0, sources.length, ...sources.filter((s) => !s.use));
      view.tab = "library"; view.sort = "new"; sort.value = "new"; paintTabs(); drawGrid();
    },
  };
  function hook() { if (hooked) return; hooked = true; for (const [k, f] of Object.entries(onEvt)) api.addEventListener(k, f); }
  function unhook() { if (!hooked) return; hooked = false; for (const [k, f] of Object.entries(onEvt)) api.removeEventListener(k, f); }
  function paintJobs() {
    setChildren(jobsEl, jobs.slice(0, 6).map((j) => el("div", { class: `mmrp-job ${j.status}` },
      el("div", { class: "mmrp-jobhead" }, el("span", {}, j.names.join(", ")), el("span", { class: "mmrp-dim" }, j.msg)),
      j.status === "running" ? el("div", { class: "mmrp-bar2" }, el("div", { style: { width: `${Math.round(j.progress * 100)}%` } })) : null)));
  }

  /* ---- data */
  async function load(rescan) {
    try {
      const [resp, vr] = await Promise.all([
        api.fetchApi("/minimax_h3_plus/refmods", { cache: "no-store" }),
        vaes.length ? null : api.fetchApi("/models/vae").catch(() => null)]);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      items = data.items || []; roots = data.roots || []; packInstalled = data.pack_installed !== false;
      if (vr && vr.ok) { try { const v = await vr.json(); vaes = Array.isArray(v) ? v : []; } catch (e) { vaes = []; } }
      drawFolders(); drawGrid();
      if (view.selected) { if (byName(view.selected)) paintInspector(); else select(null); }
      if (rescan && panel) panel.refreshFrom(items);
    } catch (e) {
      setChildren(grid, el("div", { class: "mmrp-status err" }, `Couldn't read the RefMod library: ${e.message}`));
      summary.textContent = "";
    }
  }
  paintTabs();
  load(false).then(() => { if (view.tab === "create") paintCreate(); });
  if (view.tab === "library") search.focus();
}

/* ------------------------------------------------- stack in a window */

/** Open a RefMod Stack's panel in a window over the canvas — the Prompt
 *  Builder's RefMods button. Edits go straight to the node; its on-canvas
 *  panel catches up when the window closes. */
export function openStackModal(node, { onClose } = {}) {
  injectCSS();
  const panel = new StackPanel(node);
  const close = () => {
    window.removeEventListener("keydown", esc);
    overlay.remove();
    node._mmrPanel?.reload();
    try { onClose?.(); } catch (e) { console.error("[Fantastic H3 RefMod Stack] close callback failed:", e); }
  };
  const esc = (e) => {
    if (e.key !== "Escape") return;
    // The library or the crop editor, opened from here, closes first.
    if (document.querySelector(".mmlp-tmover") || document.querySelector(".mmrp-overlay:not(.mmrp-stackover)")) return;
    close();
  };
  const overlay = el("div", { class: "mmrp-overlay mmrp-stackover",
    onmousedown: (e) => { if (e.target === overlay) close(); } },
    el("div", { class: "mmrp-stackmodal", role: "dialog", "aria-label": "RefMod Stack" },
      el("div", { class: "mmrp-head" },
        el("strong", {}, "RefMod Stack"),
        el("small", {}, node.title && node.title !== "Fantastic H3 RefMod Stack" ? node.title : ""),
        el("span", { class: "mmrp-grow" }),
        el("button", { class: "mmrp-btn", onclick: close }, "Close")),
      el("div", { class: "mmrp-stackbody" }, panel.root)));
  window.addEventListener("keydown", esc);
  document.body.append(overlay);
  return panel;
}

/* -------------------------------------------------------- register */

app.registerExtension({
  name: "MiniMaxH3Plus.RefModLibraryFromLoader",
  beforeRegisterNodeDef(nodeType, nodeData) {
    // Upstream hangs this off its standalone Media Loader. This pack has no
    // such node — the panel is part of Prompt Studio — so the media to send
    // to the library sits on the Studio node's own `media_state` widget.
    if (nodeData.name !== STUDIO_NAME) return;
    // A menu entry rather than a widget: the node's panel owns its layout,
    // and the library is the one place RefMods get made.
    const prev = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      const r = prev?.apply(this, arguments);
      let items = [];
      try { items = JSON.parse(this.widgets?.find((w) => w.name === "media_state")?.value || "[]"); } catch (e) { items = []; }
      options.push({ content: `RefMod library (send ${Array.isArray(items) ? items.length : 0} media)`,
        callback: () => openLibrary(null, { sources: items, origin: this.title || "Prompt Studio", tab: items.length ? "create" : "library" }) });
      return r;
    };
  },
});

app.registerExtension({
  name: "MiniMaxH3Plus.RefModStack",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== STACK_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      try {
        const w = this.widgets?.find((x) => x.name === "stack_state");
        if (w) { w.hidden = true; w.type = "hidden"; w.computeSize = () => [0, -4]; }
        this._mmrPanel = new StackPanel(this);
        const widget = this.addDOMWidget("mmr_panel", "div", this._mmrPanel.root, { serialize: false });
        this._mmrWidget = widget;
        applyCanvasSizing(this, widget, NODE_W, PANEL_H);
      } catch (err) {
        console.error("[Fantastic H3 RefMod Stack] setup failed:", err);
        try { this.addWidget("button", "⚠ UI failed — click", null, () => {
          alert("Fantastic H3 RefMod Stack could not build its interface.\n\n" + err);
        }); } catch (e2) { /* nothing more to do */ }
      }
      return r;
    };

    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      try {
        const min = this.computeSize();
        size[0] = Math.max(NODE_W, size[0]);
        size[1] = Math.max(min[1], size[1]);
      } catch (e) { /* leave it */ }
      return onResize?.apply(this, arguments);
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      // The saved size is applied after onNodeCreated sized the node, so a
      // workflow saved with a shorter node would draw the panel past its
      // bottom edge. Grow back to the panel's minimum.
      applyCanvasSizing(this, this._mmrWidget, NODE_W, PANEL_H);
      setTimeout(() => this._mmrPanel?.reload(), 0);
      return r;
    };
  },
});

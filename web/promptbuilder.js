/* MiniMax H3 Prompt Builder editor — shared frontend module
 * The modal template editor and node summary, mounted onto MiniMax H3 Prompt
 * Studio (see promptstudio.js). Not a node registration of its own.
 * Formats follow MiniMax's official prompt-writing guides shipped with the
 * open-weight release (VIDEO_PROMPT_WRITING_GUIDE_base_en / _ref_en).
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { LOADER_NAME, STUDIO_NAME, computeTags, viewURL as loaderViewURL,
  safeCanvasFocus, openLoaderModal, isOn, TrimModal,
  fileCount, MODE_CAPACITY, hasCrop, TAG_COLORS, TAG_VARS,
  raiseIfOpen, RAISE_CSS, postApi, outputTargets, setterOf, linkNodes,
  keepNameChars,
} from "./medialoader.js";
import { STACK_NAME, STACK_NAMES, ENCODE_NAMES, readStack, deriveEntries, labelGroups,
  rangeText as refmodRange, previewURL as refmodPreviewURL, KIND as REFMOD_KIND,
  openStackModal } from "./refmodstack.js";

// The node this editor is mounted on. Upstream names its own builder here;
// in this pack the prompt and the media panel are the one Prompt Studio node,
// so that is what a mods chain has to recognise as "a builder to step
// through" (see modsChain).
const NODE_NAME = STUDIO_NAME;

// Private drag type: marks a drag as "reorder the rail" so a drop on another
// card moves media, while a drop on a textarea still inserts the tag.
const RAIL_MIME = "application/x-mmh3p-rail";

/* Delivery tags — community findings, not from MiniMax's published guide.
 * They go INSIDE a <d> block to shape performance. Kept in one table so the
 * picker, the hover preview and section 6.1 of the bundled guide can never
 * drift apart; if you edit this list, edit the guide's table to match.
 *
 * `wrap: true` marks a tag that surrounds text rather than standing alone:
 * inserting one wraps the selection, or drops the caret between the halves. */
const DELIVERY_TAGS = [
  { group: "Pauses and breath", tag: "<pause>", what: "Short pause",
    ex: "Okay, so. <pause> This is just me talking." },
  { group: "Pauses and breath", tag: "<long pause>", what: "Longer pause",
    ex: "I mean\u2026 <long pause> I don't even know." },
  { group: "Pauses and breath", tag: "<breath>", what: "Breathing sound",
    ex: "And then\u2026 <breath> it just happened." },
  { group: "Pauses and breath", tag: "<inhale>", what: "In breath",
    ex: "<inhale> Alright, let's do this." },
  { group: "Pauses and breath", tag: "<exhale>", what: "Out breath",
    ex: "<exhale> Fine. Have it your way." },
  { group: "Pauses and breath", tag: "<catches breath>", what: "Out of breath",
    ex: "Wait\u2026 <catches breath> hold on a sec." },
  { group: "Pauses and breath", tag: "<deep breath>", what: "Calming down",
    ex: "<deep breath> Okay. I can do this." },

  { group: "Delivery and emphasis", tag: "<i>", what: "Emphasize 1\u20134 words",
    ex: "I was <i>not</i> expecting that.", wrap: true },
  { group: "Delivery and emphasis", tag: "<whisper>", what: "Whisper delivery",
    ex: "<whisper> Don't tell anyone this.</whisper>", wrap: true },
  { group: "Delivery and emphasis", tag: "<softer>", what: "Quieter delivery",
    ex: "<softer> I don't think I can say it." },
  { group: "Delivery and emphasis", tag: "<humming>", what: "Humming a tune",
    ex: "<humming> da-da-da-beautiful-day.</humming>", wrap: true },
  { group: "Delivery and emphasis", tag: "<stutter>", what: "Stutters the words",
    ex: "<stutter> I ca can't believe that." },
  { group: "Delivery and emphasis", tag: "<uh>", what: "Filler / hesitation",
    ex: "So, like\u2026 <uh> what was I saying?" },

  { group: "Non-verbal sounds", tag: "<laughs>", what: "Laughing",
    ex: "That's\u2026 <laughs> that's actually funny." },
  { group: "Non-verbal sounds", tag: "<chuckle>", what: "Small laugh",
    ex: "<chuckle> You're not serious." },
  { group: "Non-verbal sounds", tag: "<sighs>", what: "Sigh",
    ex: "<sighs> I really tried." },
  { group: "Non-verbal sounds", tag: "<gasp>", what: "Sharp intake",
    ex: "<gasp> Oh my God." },
  { group: "Non-verbal sounds", tag: "<coughs>", what: "Cough",
    ex: "<coughs> Sorry, one sec." },
  { group: "Non-verbal sounds", tag: "<clears throat>", what: "Throat clear",
    ex: "<clears throat> So anyway\u2026" },
  { group: "Non-verbal sounds", tag: "<sniff>", what: "Sniffing",
    ex: "<sniff> It's just\u2026 really sad." },
  { group: "Non-verbal sounds", tag: "<mhm>", what: "Agreement sound",
    ex: "Yeah, <mhm> exactly." },
  { group: "Non-verbal sounds", tag: "<phew>", what: "Relief",
    ex: "<phew> That was close." },
];

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
/* The character that turns a subject's name into shorthand (!Bob). It's a
   per-user editor preference, picked from symbols that mean nothing else in
   an H3 prompt, so the patterns below are rebuilt when it changes. */
const NAME_PREFIXES = ["!", "@", "#", "$", "%", "&", "*", "~", "+", "=", "^"];
let NAME_PREFIX = "!";
const reEsc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let PAINT_RE, NAME_TOKEN_RE, NAME_SPLIT_RE;
function setNamePrefix(ch) {
  NAME_PREFIX = NAME_PREFIXES.includes(ch) ? ch : "!";
  const p = reEsc(NAME_PREFIX);
  PAINT_RE = new RegExp([
    "<d>[\\s\\S]*?<\\/d>",                      // a spoken line
    // a cut marker, with its timestamp when one follows
    "\\[Shot \\d+\\](?:\\s+at\\s+\\d{1,2}:\\d{2}(?:\\.\\d{1,3})?)?",
    "<(?:Picture|Video|Audio|Subject) \\d+>",     // a reference tag
    "\\(S\\d+(?:\\s*,\\s*S\\d+)*\\)",           // (S1) or (S1,S2)
    `${p}[A-Za-z][\\w-]*`,                        // !Name shorthand for a named subject
  ].join("|"), "g");
  NAME_TOKEN_RE = new RegExp(`${p}([A-Za-z][\\w-]*)`, "g");
  NAME_SPLIT_RE = new RegExp(`(${p}[A-Za-z][\\w-]*)`);
}
setNamePrefix("!");

/** Named subjects from the switched-on definition lines that carry a name,
 *  keyed by the lower-cased name so !bob, !Bob and !BOB all find "Bob":
 *  { bob: { tag: "<Subject 1>", name: "Bob" } }. */
function subjectNames(state) {
  const out = {};
  for (const d of state?.ref?.subjectDefs || []) {
    if (d.off) continue;
    const name = (d.name || "").trim();
    const m = (d.text || "").trim().match(/^<Subject (\d+)>/);
    const key = name.toLowerCase();
    if (name && m && /^[A-Za-z][\w-]*$/.test(name) && !(key in out)) out[key] = { tag: `<Subject ${m[1]}>`, name };
  }
  return out;
}
const lookupName = (names, raw) => names[String(raw || "").toLowerCase()];

/** A description saved with a RefMod or typed in a voice box, as one line
 *  (a break reads as a shot cut) with no trailing full stop. */
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/[\s.]+$/, "");
/** "low, husky voice" -> "a low, husky voice"; kept as typed with an article. */
const withArticle = (t) => (/^(a|an|the)\s/i.test(t) ? t : (/^[aeiou]/i.test(t) ? "an " : "a ") + t);
/** "a low, husky voice" -> "low, husky voice", for "in the … referenced from". */
const noArticle = (t) => t.replace(/^(a|an|the)\s+/i, "");
/** A voice-timbre line ties a speaker ID to a subject: "<Audio 1> is the
 *  voice-timbre reference for <Subject 1> (S1), …". Singing lines don't
 *  count. Returns { audio, subj, sx } or null. */
function voiceBinding(text) {
  const t = String(text || "");
  const a = t.match(/^\s*<Audio (\d+)>/);
  const s = t.match(/\((S\d+)\)/);
  if (!a || !s || /singing/i.test(t)) return null;
  const subj = t.match(/<Subject \d+>/);
  return { audio: `<Audio ${a[1]}>`, subj: subj ? subj[0] : null, sx: s[1] };
}

/* Right-click a tag: the tags a text holds, and how to rewrite them. */

/** Reference tags, !Name shorthand and speaker IDs in a text, in order. */
function tagTokens(text) {
  const t = String(text || ""), out = [];
  for (const m of t.matchAll(/<(?:Subject|Picture|Video|Audio) \d+>/g))
    out.push({ tok: m[0], start: m.index, end: m.index + m[0].length });
  for (const m of t.matchAll(NAME_TOKEN_RE))
    out.push({ tok: m[0], start: m.index, end: m.index + m[0].length });
  for (const m of t.matchAll(/\(S\d+(?:\s*,\s*S\d+)*\)/g))
    out.push({ tok: m[0], start: m.index, end: m.index + m[0].length });
  return out.sort((a, b) => a.start - b.start);
}
const isSpk = (tok) => tok.startsWith("(");
const spkIds = (tok) => tok.match(/S\d+/g) || [];
/** "(S2,S1)" from ids, in number order; "" when none are left. */
const spkTok = (ids) => {
  const sorted = [...new Set(ids)].sort((a, b) => +a.slice(1) - +b.slice(1));
  return sorted.length ? `(${sorted.join(",")})` : "";
};
/** Same tag: exact for labels, any case for names (!ann is !Ann), the same
 *  IDs for speakers whatever the spacing. */
const sameTok = (a, b) => {
  if (isSpk(a) || isSpk(b)) return isSpk(a) && isSpk(b) && spkTok(spkIds(a)) === spkTok(spkIds(b));
  return (a.startsWith("<") || b.startsWith("<")) ? a === b : a.toLowerCase() === b.toLowerCase();
};
/** Copies of a tag. A single speaker ID also counts inside group tags. */
const countTok = (text, tok) => {
  if (isSpk(tok) && spkIds(tok).length === 1)
    return tagTokens(text).filter((t) => isSpk(t.tok) && spkIds(t.tok).includes(spkIds(tok)[0])).length;
  return tagTokens(text).filter((t) => sameTok(t.tok, tok)).length;
};
const tagClass = (tok) => (tok.startsWith("<") ? tok.match(/^<(\w+)/)[1] : isSpk(tok) ? "Speaker" : "Name");
const TAG_CLASS_LABEL = { Picture: "picture", Video: "video", Audio: "audio", Subject: "subject",
  Name: "subject name", Speaker: "speaker ID" };

/** Close the gaps removed tags leave behind. "!" is left alone: it starts
 *  a name, and pulling it onto the previous word would break the name. */
const tidyGaps = (t) => t.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;:?)])/g, "$1")
  .replace(/\(\s*\)/g, "").replace(/^[ \t]+|[ \t]+$/gm, "");

/** Replace every copy of tok with target (remove it when target is null).
 *  With swap, copies of target become `back` (tok as the prompt spells it). */
function rewriteTokens(text, tok, target, swap, back = tok, ctx = null) {
  let out = "", last = 0;
  // One speaker ID is rewritten wherever it appears, group tags included:
  // swapping S1 and S2 turns "(S1,S2)" into "(S2,S1)", removing S2 leaves "(S1)".
  const byId = isSpk(tok) && spkIds(tok).length === 1 && (target == null || (isSpk(target) && spkIds(target).length === 1));
  const from = byId ? spkIds(tok)[0] : null, to = byId && target != null ? spkIds(target)[0] : null;
  if (byId && ctx) {
    // A line from a speaker button — "!Ann (S1), in the low voice referenced
    // from <Audio 1>, says:" — belongs to its speaker as a whole. When the ID
    // changes hands, the name and voice clause follow the new speaker's voice
    // line; removing the ID drops the clause and keeps the name. Only wording
    // that matches the old speaker's voice line is touched.
    const P = reEsc(ctx.prefix);
    const re = new RegExp(`(?:${P}([A-Za-z][\\w-]*) )?\\((S\\d+)\\)(, in the [^<\\n]+? referenced from (<Audio \\d+>),)?`, "g");
    text = text.replace(re, (m, name, id, clause, audio) => {
      const Y = id === from ? to : (swap && id === to ? from : undefined);
      if (Y === undefined) return m;
      const bx = ctx.bindings[id] || null, by = Y ? ctx.bindings[Y] || null : null;
      let who = name ? `${ctx.prefix}${name} ` : "";
      if (Y && name && bx?.name && name.toLowerCase() === bx.name.toLowerCase())
        who = by?.name ? `${ctx.prefix}${by.name} ` : "";
      let how = clause || "";
      if (clause && bx?.audio && audio === bx.audio)
        how = Y && by?.voice && by?.audio ? `, in the ${noArticle(by.voice)} referenced from ${by.audio},` : "";
      return who + (Y ? `(${Y})` : "") + how;
    });
  }
  for (const t of tagTokens(text)) {
    let rep = null;
    if (byId && isSpk(t.tok)) {
      const ids = spkIds(t.tok);
      if (ctx && ids.length === 1) continue;           // handled with its line above
      if (!ids.includes(from) && !(swap && to && ids.includes(to))) continue;
      rep = spkTok(ids.map((id) => id === from ? to : (swap && id === to ? from : id)).filter(Boolean));
    } else if (sameTok(t.tok, tok)) rep = target ?? "";
    else if (swap && target != null && sameTok(t.tok, target)) rep = back;
    if (rep === null) continue;
    out += text.slice(last, t.start) + rep;
    last = t.end;
  }
  out += text.slice(last);
  return target == null ? tidyGaps(out) : out;
}

/** A single removed tag takes one neighbouring space with it. */
function tidyRange(text, start, end) {
  const before = text[start - 1], after = text[end];
  if (before === " " && (after === undefined || after === " " || after === "\n" || /[,.;:?)]/.test(after)))
    return { start: start - 1, end };
  if (after === " " && (start === 0 || before === "\n" || before === "("))
    return { start, end: end + 1 };
  return { start, end };
}

/** Show a name suggestion in a chip field's mirror, at a text offset. A
 *  partly typed !name is painted as its own chip, so the suggestion goes
 *  after that chip rather than inside it. */
function insertGhost(root, pos, text) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0, node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (seen + len >= pos) {
      const off = pos - seen;
      const ghost = el("span", { class: "mmh3p-ghost" }, text);
      const parent = node.parentNode;
      if (off === len && parent !== root && parent.classList?.contains("mmh3p-reftag")) { parent.after(ghost); return; }
      parent.insertBefore(ghost, node.splitText(off));
      return;
    }
    seen += len;
  }
}

/** Edit a field through the browser so Ctrl+Z undoes it, falling back to
 *  setting the value. Either way the field's own input handler runs. */
function editField(box, start, end, text) {
  const v = box.value, want = v.slice(0, start) + text + v.slice(end);
  box.focus();
  box.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand(text ? "insertText" : "delete", false, text); } catch (e) { ok = false; }
  if (!ok || box.value !== want) {
    box.value = want;
    box.setSelectionRange(start + text.length, start + text.length);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/** Turn every !Name into "<Subject N> Name" — or just "Name" inside a
 *  spoken <d> line, where a label would be read aloud. The name is written
 *  as it was defined, whatever case was typed. Unknown names are left as
 *  typed so the warning can point at them. */
function expandNames(text, names) {
  if (!text || !Object.keys(names).length) return text;
  const parts = String(text).split(/(<d>[\s\S]*?<\/d>)/);
  return parts.map((part, i) => part.replace(NAME_TOKEN_RE, (m, raw) => {
    const hit = lookupName(names, raw);
    return hit ? (i % 2 ? hit.name : `${hit.tag} ${hit.name}`) : m;
  })).join("");
}

const LANG_RE = /^(\s*\[[^\]\n]+\])/;
/* Every delivery tag, opening or closing, as one alternation — for picking
 * them out of a <d> line so the mirror and the picker's example can colour
 * them. Longer names first so "<long pause>" isn't cut to "<pause>". */
const DELIVERY_RE = new RegExp("(<\\/?(?:" + [...new Set(DELIVERY_TAGS.map((t) => t.tag.slice(1, -1)))]
  .sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")>)", "g");

/** Text with its delivery tags wrapped as .mmh3p-dtag spans, and any !Name
 *  shorthand as a subject tag (it becomes the bare name in a spoken line). */
function deliverySpans(text, names = null) {
  // split() with a capture group alternates text, tag, text… — the parity
  // is what says which is which, so empties are dropped only afterwards.
  return String(text).split(DELIVERY_RE)
    .flatMap((part, i) => {
      if (i % 2) return [el("span", { class: "mmh3p-dtag" }, part)];
      if (!names) return [part];
      return part.split(NAME_SPLIT_RE).map((p, j) => {
        if (!(j % 2)) return p;
        const hit = lookupName(names, p.slice(1));
        return el("span", { class: "mmh3p-reftag " + (hit ? "subj" : "unknown"), dataset: { tag: p },
          title: hit ? `just \u201c${hit.name}\u201d when spoken` : "No subject has this name" }, p);
      });
    })
    .filter((part) => part !== "");
}

/* --- reference tags as chips ------------------------------------------ */
/* Shared by the full editor and the quick prompt editors (the popup and the
   T2VA inline mount), so a tag reads the same colour wherever it's typed —
   the full editor also layers hover-preview thumbnails on top via its own
   chipHover()/chipLeave(), which these deliberately don't know about. */

/** Render one matched token as the spans the chip mirror shows.
 *  `slotFor`/`subjectInfo` resolve a reference tag to what it points at —
 *  omit either to treat every tag of that kind as unresolved ("unknown").
 *  `names` is the subject-name map (see subjectNames): it resolves !Name
 *  shorthand, and paints the names inside a spoken <d> line. Omit it and a
 *  !Name paints as unknown, which is right for a surface that has no state
 *  to resolve against. */
function paintToken(tok, { slotFor, subjectInfo, names = null } = {}) {
  if (tok.startsWith("<d>")) {
    const inner = tok.slice(3, -4);
    const kids = [el("span", { class: "mmh3p-dmark" }, "<d>")];
    const lang = inner.match(LANG_RE);
    const body = lang ? inner.slice(lang[0].length) : inner;
    if (lang) kids.push(el("span", { class: "mmh3p-dlang" }, lang[1]));
    kids.push(el("span", { class: "mmh3p-dtext" }, ...deliverySpans(body, names)));
    kids.push(el("span", { class: "mmh3p-dmark" }, "</d>"));
    return [el("span", { class: "mmh3p-dblock" }, ...kids)];
  }
  if (tok.startsWith("[Shot")) {
    return [el("span", { class: "mmh3p-reftag shot" }, tok)];
  }
  if (tok.startsWith("(")) {
    return [el("span", { class: "mmh3p-reftag spk", dataset: { tag: tok } }, tok)];
  }
  if (tok.startsWith(NAME_PREFIX) && !tok.startsWith("<")) {
    const hit = names ? lookupName(names, tok.slice(1)) : null;
    return [el("span", { class: "mmh3p-reftag " + (hit ? "subj" : "unknown"), dataset: { tag: tok },
      title: hit ? `${hit.tag} ${hit.name} in the prompt` : "No subject has this name" }, tok)];
  }
  let cls;
  if (tok.startsWith("<Subject")) {
    cls = subjectInfo?.(tok) ? "subj" : "unknown";
  } else {
    const slot = slotFor?.(tok);
    cls = slot ? (slot.cls || "pic") : "unknown";
  }
  return [el("span", { class: "mmh3p-reftag " + cls, dataset: { tag: tok } }, tok)];
}

/** The definition line for a subject tag, or null if it has none.
 *
 *  Shared, because the two editors used to disagree about it: the quick
 *  editor never resolved subjects at all, so paintToken() fell through to
 *  "unknown" — the red that means "this tag names media that isn't loaded" —
 *  and the same <Subject 1> was green in one window and red in the other. */
function subjectLine(state, tag) {
  return (state?.ref?.subjectDefs || []).find(
    (d) => !d.off && (d.text || "").trim().startsWith(tag)) || null;
}

/** A subject name to finish: the caret sits right after "!cas" and a
 *  switched-on subject is named castle_with_moat. First match
 *  alphabetically when several start the same way.
 *
 *  Module level, like subjectLine(), so every field that offers completion
 *  offers the same one — the full editor, the quick editor and the subject
 *  definition rows all pass this to chipField(). */
function nameSuggestionFor(box, state) {
  if (box._ghostOff || document.activeElement !== box) return null;
  const pos = box.selectionStart;
  if (pos == null || pos !== box.selectionEnd) return null;
  const v = box.value || "";
  if (/[\w-]/.test(v[pos] || "")) return null;          // mid-word: nothing to finish
  const m = v.slice(0, pos).match(new RegExp(`(?:^|[^\\w])${reEsc(NAME_PREFIX)}([A-Za-z][\\w-]*)$`));
  if (!m) return null;
  const typed = m[1], low = typed.toLowerCase();
  const hits = Object.values(subjectNames(state)).map((n) => n.name)
    .filter((n) => n.length > typed.length && n.toLowerCase().startsWith(low))
    .sort((a, b) => a.localeCompare(b));
  return hits.length ? { pos, typed: typed.length, name: hits[0] } : null;
}

/** Wrap a textarea so <Picture 1> and friends read as chips.
 *
 *  A textarea can't contain elements, so a mirror div renders the same
 *  text underneath with the tags wrapped in spans. The textarea keeps its
 *  own text transparent, which leaves selection, undo, IME and paste
 *  exactly as the browser implements them — a contenteditable rewrite
 *  would put all of that on us.
 *
 *  Returns `{ wrap, paint }`: `wrap` is what to mount in place of the bare
 *  textarea, `paint` lets the caller force a repaint (the full editor calls
 *  it after a mode switch, when slotFor's answers can change under it).
 *
 *  `names()` returns the subject-name map for resolving !Name shorthand (see
 *  paintToken) — a callback rather than a value, because a definition edited
 *  while the field is open changes it under us. `nameSuggestion(box)`
 *  enables Tab-to-complete: return `{ pos, typed, name }` for the name being
 *  typed at the caret, or null. Both are optional, so a surface with no
 *  subject state to resolve against simply doesn't offer them. */
function chipField(box, opts = {}) {
  const { slotFor, subjectInfo, names = null, nameSuggestion = null,
          highlightTags = true, onHover, onLeave } = opts;
  const mirror = el("div", { class: "mmh3p-chipmirror", "aria-hidden": "true" });
  // Order matters: the mirror is painted ON TOP of the textarea so the
  // selection band (drawn by the textarea) sits behind the glyphs instead
  // of covering them. It's click-through, so the textarea still gets every
  // pointer event.
  const wrap = el("div", { class: "mmh3p-chipwrap" }, box, mirror);
  if (!highlightTags) wrap.classList.add("plain");
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
      mirror.append(...paintToken(m[0], { slotFor, subjectInfo, names: names?.() }));
      last = m.index + m[0].length;
    }
    // The trailing newline keeps the mirror's last line height in step with
    // the textarea's when the text ends mid-line.
    mirror.append(document.createTextNode(text.slice(last) + "\n"));
    // Typing a subject's name: the rest of it, greyed after the caret.
    if (nameSuggestion) {
      const g = box._ghost = nameSuggestion(box);
      box._ghostKey = g ? `${g.pos}|${g.name}` : "";
      if (g) insertGhost(mirror, g.pos, g.name.slice(g.typed));
    }
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

  if (nameSuggestion) box.addEventListener("input", () => { box._ghostOff = false; });
  box.addEventListener("input", paint);
  box.addEventListener("scroll", syncBox);
  if (nameSuggestion) {
    // The suggestion follows the caret, and Tab takes it.
    const caretMoved = () => {
      const g = nameSuggestion(box);
      if ((g ? `${g.pos}|${g.name}` : "") !== (box._ghostKey || "")) paint();
    };
    ["keyup", "click", "focus"].forEach((ev) => box.addEventListener(ev, caretMoved));
    box.addEventListener("blur", () => { if (box._ghostKey) paint(); });
    box.addEventListener("keydown", (e) => {
      const g = box._ghost;
      if (!g) return;
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        editField(box, g.pos - g.typed, g.pos, g.name);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();            // hides the suggestion, not the editor
        box._ghostOff = true;
        paint();
      }
    });
  }
  // Dragging the resize grip can add or remove the scrollbar.
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(syncBox).observe(box);
  }
  // Hover a chip for its thumbnail — optional, since only the full editor
  // has anywhere to show one.
  if (onHover) box.addEventListener("mousemove", (e) => onHover(e, mirror));
  if (onLeave) box.addEventListener("mouseleave", onLeave);

  paint();
  return { wrap, paint };
}

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

/* What a RefMod's saved concept says about it, in the guide's own wording.
   `subject` lines open with <Subject N>; the others are standalone reference
   lines. Concept names are the library's (refmods.CONCEPT_TYPES). */
const REFMOD_CONCEPTS = {
  identity: { subject: true, marker: "fully_preserved", task: "reference generation",
    text: (c) => `${c.subj} is the person in ${c.tag}.`,
    note: (c) => `${c.subj}'s identity and appearance from ${c.tag} are retained. Face, facial features, body type.` },
  clothing: { subject: true, marker: "attribute_transfer", task: "reference generation",
    text: (c) => `${c.subj} is the outfit in ${c.tag}.`,
    note: (c) => `the garments, colours and fit of ${c.subj} from ${c.tag} are transferred.` },
  background: { subject: true, marker: "fully_preserved", task: "reference generation",
    text: (c) => `${c.subj} is the environment in ${c.tag}.`,
    note: (c) => `the layout, surfaces and lighting of ${c.subj} from ${c.tag} are retained.` },
  style: { subject: false, marker: "attribute_transfer", task: "reference generation",
    text: (c) => `${c.tag} is the visual-style reference; its palette, lighting and rendering look guide the target video.`,
    note: (c) => `its colour palette, lighting and rendering style are transferred; its content is not reproduced.` },
  pose_motion: { subject: false, marker: "attribute_transfer", task: "reference generation",
    text: (c) => `${c.tag} is the pose and motion reference; its movement and timing guide the target video.`,
    note: (c) => `its poses and motion timing are transferred; its subject is not reproduced.` },
  voice: { audio: true, marker: "reference", task: "audio reference",
    text: (c) => `${c.tag} is the voice-timbre reference for ${c.subj} (${c.sx}), guiding delivery and speaking rate without copying the original signal.`,
    note: (c) => `its vocal timbre guides the dialogue delivery of ${c.subj} without copying the original signal.`,
    speaker: (c) => `${c.subj} is the speaker heard in ${c.tag}.` },
  singing: { audio: true, marker: "reference", task: "audio reference",
    text: (c) => `${c.tag} is the singing-voice timbre reference for ${c.subj} (${c.sx}), guiding vocal tone without copying the original signal.`,
    note: (c) => `its singing timbre guides the vocal delivery of ${c.subj} without copying the original signal.`,
    speaker: (c) => `${c.subj} is the singer heard in ${c.tag}.` },
  music_style: { audio: true, marker: "reference", task: "audio reference",
    text: (c) => `${c.tag} is the background-music style reference for the target video's audience-only score.`,
    note: () => "only its instrumentation, tempo, and rhythmic feel guide the new score; the signal is not copied." },
  sound_fx: { audio: true, marker: "reference", task: "audio reference",
    text: (c) => `${c.tag} is the sound-effect texture reference for the target video's physical action sounds.`,
    note: () => "only its sound-effect texture is referenced; the signal is not copied." },
  ambience: { audio: true, marker: "reference", task: "audio reference",
    text: (c) => `${c.tag} is the ambience reference for the target video's background sound.`,
    note: () => "only its ambient texture is referenced; the signal is not copied." },
};
const VISUAL_CONCEPTS = ["identity", "clothing", "background", "style", "pose_motion"];
const AUDIO_CONCEPTS = ["voice", "singing", "music_style", "sound_fx", "ambience"];
const CONCEPT_LABEL = { identity: "a person / character", clothing: "an outfit", background: "a place / setting",
  style: "a visual style", pose_motion: "a pose or motion", voice: "a speaking voice", singing: "a singing voice",
  music_style: "a music style", sound_fx: "sound effects", ambience: "ambience" };

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
  // Closing writes the prompt to the node instead of asking about it. Off by
  // default: the node holding something you didn't deliberately put there is
  // a bigger surprise than being asked.
  saveOnClose: false,
  // Window and text scale, 100%-300%. A 4K monitor makes the default window
  // small; these are per user, so they follow you into every workflow.
  windowScale: 1.0, textScale: 1.0,
  // Chips can be switched off for a plain text field. The mirror still
  // renders (invisibly), so hover previews keep working.
  highlightTags: true,
  // The media rail moved into a left-edge sidebar by default; this is the
  // opt-out back to the original strip-across-the-top layout.
  classicLayout: false,
  // Take the full height of the screen, less a margin top and bottom. With
  // this on, the window-size slider only governs width — the height is the
  // viewport's to decide.
  tallWindow: false,
  // Set by clicking the checks header rather than from the settings menu,
  // so it is stored but deliberately not listed there.
  issuesCollapsed: false,
  // Hovering a tag in a text field opens the small panel at the cursor by
  // default. On, it opens that tag's media card preview in the strip
  // instead, which is bigger and sits away from what you are typing.
  railPeek: false,
  // Hide the standing help captions under the sections, moving each one to
  // its section's hover tooltip. Live readouts (word count, snapped
  // duration) and the empty-state line are marked .keep and stay put —
  // they report state rather than explain the field.
  hideHints: false,
  // Media card size in the strip, independent of window and text scale so
  // the thumbnails can be made bigger without enlarging everything else.
  chipScale: 1.0,
  // Quick-edit window, set from its own settings button. The window scales
  // its 900x585 base; the picture scale moves the split between the keyframe
  // pane and the fields beside it.
  quickScale: 1.0,
  // Prompt library display, set from that window's own settings button
  // rather than the editor's.
  libFullPrompt: false,
  // How many preview lines each library row shows.
  libPreviewRows: 1,
  // The character before a subject's name that makes it shorthand (!Bob).
  namePrefix: "!",
};
// Breathing room left above and below the editor when tallWindow is on.
const TALL_MARGIN_VH = 4;
const SCALE_MIN = 1.0;
const SCALE_MAX = 3.0;          // window
const TEXT_SCALE_MAX = 2.0;     // type gets unwieldy past this
// Cards past double width stop being thumbnails and start crowding the form.
const CHIP_SCALE_MAX = 2.0;
// The keyframe pane's share of the quick editor. Past 2x the fields floor
// takes over anyway, so there is nothing above it left to give — and below
// 40% the previews stop being readable.

/** `min` is a parameter because not every scale floors at 100%: the window
 *  and text scales only ever grow (shrinking them below the design size is
 *  what the window's own dimensions are for), but the keyframe pane's share
 *  is genuinely two-way — turning it *down* to give the fields more room is
 *  the useful direction, and the shared SCALE_MIN made that unreachable. */
function clampScale(v, max = SCALE_MAX, min = SCALE_MIN) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.0;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function loadPrefs() {
  try {
    const v = { ...PREF_DEFAULTS,
      ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") };
    v.windowScale = clampScale(v.windowScale);
    v.chipScale = clampScale(v.chipScale, CHIP_SCALE_MAX);
    v.quickScale = clampScale(v.quickScale);
    v.libPreviewRows = Math.max(1, Math.min(6,
      Math.round(Number(v.libPreviewRows) || 1)));
    v.textScale = clampScale(v.textScale, TEXT_SCALE_MAX);
    if (!NAME_PREFIXES.includes(v.namePrefix)) v.namePrefix = "!";
    return v;
  } catch (e) {
    return { ...PREF_DEFAULTS };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
  catch (e) { /* private mode: the session's choice still applies */ }
}
// Apply the saved name prefix as soon as the script loads, so a prompt
// generated before any editor opens uses it too.
setNamePrefix(loadPrefs().namePrefix);

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

/** Kind icons as inline SVG.
 *
 *  Not glyphs: ▦ ▶ ♪ depend on whatever font the browser resolves for
 *  system-ui, and on Linux that chain frequently has no coverage for the
 *  Geometric Shapes block — the icons simply vanish or become tofu. SVG
 *  renders identically everywhere, scales with font-size through the `em`
 *  sizing, and takes its colour from currentColor. */
const KIND_SVG = {
  picture:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="5.5" cy="6" r="1.3" fill="currentColor"/>' +
    '<path d="M3 12l3.2-3.6 2.3 2.4 2.1-2.3L13 12z" fill="currentColor"/>',
  video:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M6.3 5.6l4.5 2.4-4.5 2.4z" fill="currentColor"/>',
  audio:
    '<path d="M2 9.5V6.5M5 11.5v-7M8 13V3M11 11.5v-7M14 9.5V6.5" ' +
    'fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round"/>',
};

function kindIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "mmh3p-kindicon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = KIND_SVG[kind] || "";
  return svg;
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

/** Merge a stored state over the current defaults.
 *
 *  Every state that comes from outside this session must pass through here,
 *  not just the node's widget: a state missing a field the renderer reads
 *  throws mid-render, which aborts the form build and leaves a half-drawn
 *  panel — no chips, no rail, and no error the user can see. Drafts come
 *  from disk and are exactly that kind of outside state. */
function normaliseState(s) {
  if (!s || !s.version) return defaultState();
  const d = defaultState();
  return { ...d, ...s, ref: { ...d.ref, ...(s.ref || {}) } };
}

function loadState(node) {
  const w = node.widgets?.find((w) => w.name === "builder_state");
  try {
    return normaliseState(JSON.parse(w?.value || "{}"));
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

/** The node behind an input, looked through reroutes and KJNodes' Get/Set
 *  pairs (a Get node stands in for whatever feeds its Set node). */
function originNode(node, slotIndex) {
  let n = node.getInputNode?.(slotIndex);
  let guard = 0;
  while (n && guard++ < 16) {
    let up = null;
    if (/reroute/i.test(n.type || "")) up = n.getInputNode?.(0);
    else if (n.type === "GetNode") up = setterOf(n)?.getInputNode?.(0);
    else break;
    if (!up) break;
    n = up;
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

/** Pure half of slotsFromBundle: compute the slots from an items array,
 *  regardless of where it came from — this node's own panel, a wired loader,
 *  or a draft's stored media snapshot. Tag numbering must match nodes.py
 *  exactly either way, which is why draft mode goes through the same code.
 *
 *  `panel` is the LoaderPanel that owns these items, if any, so the rail can
 *  offer the same per-clip tools the node tile does; a draft's snapshot has
 *  no live panel and passes null. */
function slotsFromItems(rawItems, sourceLabel, panel = null, own = false) {
  if (!Array.isArray(rawItems)) return null;
  const items = rawItems.filter(isOn);   // switched-off media never reaches the model

  const { tags, extra } = computeTags(items);
  const out = [];
  const push = (tag, kind, item, note, previewKind) => {
    const n = +(tag.match(/(\d+)>/) || [])[1];
    const slot = {
      tag, kind, idx: n, cls: TAG_CLASS[kind], note,
      slotName: `loader:${item.name}`,
      source: `${sourceLabel} \u2022 ${item.name}`,
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
    const paired = extra.has(i) && (i.audio_mode || "paired") === "paired";
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
  out.own = own;                     // this node's own panel, not a wired loader
  return out;
}

/** The live items array behind this node's tags, or null if there is none.
 *
 *  Prefers the owning panel's live objects over a fresh parse of the widget:
 *  editing a clip or reordering from the rail has to mutate the same items
 *  the panel holds, or the change is written over the moment the panel next
 *  commits. */
function loaderItems(node) {
  const src = mediaSource(node);
  if (!src) return null;
  const items = src.owner?._mmlPanel?.items;
  if (Array.isArray(items)) return items;
  try {
    const parsed = JSON.parse(src.raw || "[]");
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) { return null; }
}

function slotsFromBundle(node) {
  // The panel keeps its inventory in a widget, so the tags it will produce
  // can be read straight off the graph without a round trip.
  const src = mediaSource(node);
  if (!src) return null;
  const items = loaderItems(node);
  if (!items) return null;
  return slotsFromItems(items, src.label, src.owner?._mmlPanel || null,
    src.label === "Media");
}

/** Walk a mods chain upstream from `head`. RefMod Stacks — this pack's own
 *  or the original Adudeguyman pack's, see STACK_NAMES — are collected in
 *  bundle order; Prompt Builders are stepped through (their mods output is
 *  the bundle they were given). Anything else heads the chain with entries
 *  we cannot see, so the result is marked partial. */
function modsChain(head) {
  const chain = [];
  let partial = false, n = head, guard = 0;
  while (n && guard++ < 32) {
    if (!STACK_NAMES.has(n.type) && n.type !== NODE_NAME) { partial = true; break; }
    if (STACK_NAMES.has(n.type)) chain.unshift(n);
    const up = (n.inputs || []).findIndex((i) => i.name === "mods");
    if (up < 0 || n.inputs[up].link == null) break;
    n = originNode(n, up);
  }
  return { chain, partial };
}

/** The "prompt" output's slot index. Upstream's own Prompt Builder has it at
 *  slot 0 (its first output), which is why the RefMod-chain code below was
 *  written against a bare `0` — but this fork's Prompt Studio moved `model`
 *  to slot 0 at 2.0.0, well before RefMods existed, so a literal `0` here
 *  would target Prompt Studio's MODEL output instead. Finding it by name
 *  keeps this correct on either node shape. */
function promptOutIdx(node) {
  return (node.outputs || []).findIndex((o) => o.name === "prompt");
}

/** Where this builder's RefMods come from: its own mods input when that is
 *  wired, otherwise the mods input of a RefMod Text Encode its prompt feeds
 *  (the older wiring, still honoured). */
function refmodSource(node) {
  const own = (node.inputs || []).findIndex((i) => i.name === "mods");
  if (own >= 0 && node.inputs[own].link != null)
    return { head: originNode(node, own), direct: true };
  const enc = outputTargets(node, promptOutIdx(node)).find((n) => ENCODE_NAMES.has(n?.type));
  if (!enc) return { head: null, why: "encode" };
  const mi = (enc.inputs || []).findIndex((i) => i.name === "mods");
  if (mi < 0 || enc.inputs[mi].link == null) return { head: null, why: "mods" };
  return { head: originNode(enc, mi), direct: false };
}

/** True when this builder's RefMods reach a Text Encode: its mods output is
 *  wired somewhere, or a Text Encode its prompt feeds has mods of its own. */
function refmodsReachEncode(node) {
  const out = (node.outputs || []).findIndex((o) => o.name === "mods");
  if (out >= 0 && outputTargets(node, out).length) return true;
  return outputTargets(node, promptOutIdx(node)).some((enc) => ENCODE_NAMES.has(enc?.type) &&
    (enc.inputs || []).some((i) => i.name === "mods" && i.link != null));
}

/** The RefMod Text Encodes this builder drives, through its prompt or mods output. */
function encodersOf(node) {
  const seen = new Set(), out = [];
  const promptOut = promptOutIdx(node);
  const modsOut = (node.outputs || []).findIndex((o) => o.name === "mods");
  for (const slot of modsOut >= 0 ? [promptOut, modsOut] : [promptOut]) {
    for (const n of outputTargets(node, slot)) {
      if (ENCODE_NAMES.has(n?.type) && !seen.has(n)) { seen.add(n); out.push(n); }
    }
  }
  return out;
}

/** Where the Text Encode's media comes from: "builder" (this node's
 *  references output), "loader" (the same Media Loader, wired straight in),
 *  "other" (a source this builder can't see), or null (no media sent). */
function mediaReach(node) {
  const refIn = (node.inputs || []).findIndex((i) => i.name === "references");
  const loader = refIn >= 0 && node.inputs[refIn].link != null ? originNode(node, refIn) : null;
  let found = null;
  for (const enc of encodersOf(node)) {
    const ri = (enc.inputs || []).findIndex((i) => i.name === "references");
    if (ri < 0 || enc.inputs[ri].link == null) continue;
    const src = originNode(enc, ri);
    if (src === node) return "builder";
    if (loader && src === loader) return "loader";
    found = found || "other";
  }
  return found;
}

/** The mode the node's Python side gates media by: the saved mode, or REF
 *  (everything passes) when nothing has been saved yet — nodes.py's rule,
 *  which differs from the editor's own T2VA starting point. */
function gateMode(node) {
  try {
    const mode = JSON.parse(node.widgets?.find((w) => w.name === "builder_state")?.value || "{}").mode;
    return MODE_CAPACITY[mode] ? mode : "REF";
  } catch (e) { return "REF"; }
}

/** Media slots as the builder's own outputs would carry them: everything a
 *  connected Media Loader holds, else what is wired to the picture_/video_/
 *  audio_ inputs. */
function mediaSlots(node) {
  return slotsFromBundle(node) || directSlots(node);
}

/** Reference slots when this prompt uses RefMods.
 *
 * RefMod Text Encode (ours, the original Adudeguyman pack's, or
 * ComfyUI-MiniMaxH3Mod's) labels its bundle
 * itself: one counter per kind, in bundle order, every copy numbered. Find
 * the stacks (see refmodSource) and reproduce that numbering. A non-stack
 * loader at the head of the chain contributes entries we cannot see, so the
 * result is marked partial and the numbers are best-effort.
 */
function refmodSlots(node, opts = {}) {
  const src = refmodSource(node);
  if (!src.head) return null;
  const { chain, partial } = modsChain(src.head);
  if (!chain.length) return null;
  // A draft can stand in for what the nearest stack holds (its own picks, or
  // the ones frozen when it started) and for the loader's media.
  const nearest = chain[chain.length - 1];
  const picksOf = (st) => (st === nearest && opts.picks ? opts.picks : readStack(st).picks);
  const sourceLabel = opts.picks ? (opts.picksLabel || "Draft RefMods") : "RefMod Stack";
  const media = opts.media ? slotsFromItems(opts.media, opts.mediaLabel || "Media Loader") : mediaSlots(node);

  // Loader media the Text Encode also receives is labelled first, one
  // counter per kind — the RefMods' numbers move up behind it.
  const reach = mediaReach(node);
  const out = [];
  const offset = { Picture: 0, Video: 0, Audio: 0 };
  if (reach === "builder" || reach === "loader") {
    const cap = reach === "builder" ? MODE_CAPACITY[gateMode(node)] : MODE_CAPACITY.REF;
    for (const m of media || []) {
      // The builder withholds what its mode doesn't use; a loader wired
      // straight in sends everything. Orphan soundtracks reach neither.
      if (!m.tag || m.idx > (cap[m.kind] ?? 0)) continue;
      out.push(m);
      offset[m.kind] = Math.max(offset[m.kind], m.idx);
    }
  }
  const allPicks = chain.flatMap((st) => picksOf(st));
  const pickByUid = new Map(allPicks.map((p) => [p.uid, p]));
  const groups = labelGroups(chain.flatMap((st) => deriveEntries(picksOf(st))));
  const copyTags = new Set();
  const firstRefmod = out.length;
  for (const g of groups) {
    if (!g.nums.length) continue;
    const kind = REFMOD_KIND[g.kind].label;
    g.nums = g.nums.map((num) => num + offset[kind]);
    const tags = g.nums.map((num) => `<${kind} ${num}>`);
    tags.slice(1).forEach((t) => copyTags.add(t));
    out.push({
      tag: tags[0], kind, idx: g.nums[0], cls: TAG_CLASS[kind],
      note: g.key === "audio" ? "voice" : null,
      copies: tags.slice(1), range: refmodRange(g),
      slotName: `refmod:${g.file}`,
      source: `${sourceLabel} \u2022 ${g.name}`,
      preview: g.preview ? { type: "img", url: refmodPreviewURL(g.preview) } : null,
      refmod: { uid: g.uid, name: g.name, role: g.key === "audio" ? "voice" : "look",
        weight: weightText(pickByUid.get(g.uid)?.[g.key]), tokens: g.tokens * g.nums.length,
        draft: !!opts.picks },
    });
  }
  // A RefMod's look and voice name each other in the hover card.
  for (const sl of out.slice(firstRefmod)) {
    const other = out.slice(firstRefmod).find((o) => o !== sl && o.refmod.uid === sl.refmod.uid);
    if (other) sl.refmod.pair = { role: other.refmod.role, tag: other.tag };
  }
  out.refmod = true;
  out.partial = partial || reach === "other";
  out.copyTags = copyTags;
  out.unsent = !!src.direct && !refmodsReachEncode(node);
  out.media = reach;
  out.mediaUnsent = !reach && (media || []).some((m) => m.tag);
  return out;
}

/** A stack channel's weight the way its row shows it. */
function weightText(ch) {
  if (!ch) return "";
  if (ch.mode === "sc") return `strength ${Number(ch.s ?? 1).toFixed(2)} \u00d7 ${ch.c ?? 1}`;
  return `weight ${Number(ch.w ?? 1).toFixed(2).replace(/\.?0+$/, "")}`;
}

/** The RefMod Stack this prompt's references come from (the one nearest the
 *  builder), or null with a reason: "encode", "mods" or "other". */
function refmodStackFor(node) {
  const src = refmodSource(node);
  if (!src.head) return { stack: null, why: src.why };
  const { chain } = modsChain(src.head);
  return chain.length ? { stack: chain[chain.length - 1] } : { stack: null, why: "other" };
}

function getRefSlots(node, opts = {}) {
  const viaRefmod = refmodSlots(node, opts);
  if (viaRefmod) return viaRefmod;
  if (opts.media) return slotsFromItems(opts.media, opts.mediaLabel || "Media Loader");
  const bundled = slotsFromBundle(node);
  if (bundled) return bundled;
  return directSlots(node);
}

/** Slots from the picture_/video_/audio_ inputs, numbered as the native
 *  Reference to Video node numbers them. */
function directSlots(node) {
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
  const names = subjectNames(state);
  const ex = (t) => expandNames(t, names);
  const defs = r.subjectDefs
    .filter((d) => !d.off)
    .map((d) => {
      let line = d.text.trim();
      const name = (d.name || "").trim();
      // The name rides on the definition so the model ties it to the label.
      if (line && name && /^<Subject \d+>/.test(line))
        line = line.replace(/\.?\s*$/, "") + `. Their name is ${name}.`;
      // A voice description rides on its voice line, after the drafted wording.
      const voice = oneLine(d.voice);
      if (line && voice && voiceBinding(line))
        line = line.replace(/\.?\s*$/, "") + `. It is ${withArticle(voice)}.`;
      return line;
    }).filter(Boolean).join("\n");
  const types = TASK_TYPES.filter((t) => r.summaryTypes.includes(t)).join(" + ");
  const summary = `[${types || "reference generation"}] ${ex(r.summaryText.trim())}`;
  const retention = r.retention
    .filter((row) => row.label && !row.off)
    .map((row) => {
      const ctx = row.context?.trim() ? ` (${row.context.trim()})` : "";
      return `${row.label}${ctx}: ${row.marker} - ${ex(row.note.trim())}`;
    })
    .join("\n");
  const detail = [ex(r.styleLine.trim()), ex(r.detail.trim())].filter(Boolean).join("\n");
  const on = (name) => sectionOn(state, name);
  const blocks = [];
  if (on("subject_definitions"))
    blocks.push(`subject_definitions:\n${defs}`);
  blocks.push(`summary:\n${summary}`);
  if (on("retention_analysis"))
    blocks.push(`retention_analysis:\n${retention}`);
  blocks.push(`detailed_description:\n${detail}`);
  if (on("overall_soundscape"))
    blocks.push(`overall_soundscape:\n${ex(r.soundscape.trim())}`);
  if (on("non_diegetic_music"))
    blocks.push(`non_diegetic_music:\n${ex(r.music.trim()) || "N/A"}`);
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

  if (slots.refmod) {
    // The prompt feeds H3 RefMod Text Encode, which labels whatever the
    // stack sends regardless of mode — none of the per-mode capacity rules
    // below apply. What matters is that the numbers line up.
    if (slots.unsent)
      warn("RefMods are wired into this node, but its mods output isn't connected " +
        "to RefMod Text Encode \u2014 wire mods into the Text Encode's mods input, " +
        "or the model won't see them.");
    if (slots.mediaUnsent)
      warn("This node's media isn't sent to RefMod Text Encode \u2014 wire its " +
        "references output into the Text Encode's references input, or the model " +
        "won't see those pictures and clips.");
    if (slots.media === "other")
      info("The Text Encode's references input comes from somewhere this node can't " +
        "see, so its media is numbered first and the labels shown here may be shifted.");
    else if (slots.partial)
      info("A loader that isn't a RefMod Stack heads this chain, so its entries " +
        "are numbered first and the labels shown here may be shifted.");
  } else if (state.mode === "REF") {
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
    const usable = slots.refmod || state.mode === "REF" ||
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
  const copyTags = slots.copyTags || new Set();
  for (const t of cited) {
    const [, kind, num] = t.match(/<(\w+) (\d+)>/);
    if (slots.refmod) {
      if (copyTags.has(t)) {
        const owner = live.find((s) => s.copies?.includes(t));
        info(`${t} is a copy of ${owner?.tag || "another label"} (${owner?.source || "RefMod Stack"}); citing ${owner?.tag || "the first label"} is enough.`);
      } else if (!connected.has(t)) {
        if (slots.partial)
          info(`${t} is cited but no RefMod Stack in the chain provides it — the upstream loader may.`);
        else
          warn(`${t} is cited but the RefMod Stack does not provide it. Check the stack's order and weights.`);
      }
    } else if (cap[kind] === 0) {
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
    // !Name shorthand: every one used must belong to a named, switched-on subject.
    const names = subjectNames(state);
    const r = state.ref;
    const used = new Set([...[r.summaryText, r.styleLine, r.detail, r.soundscape, r.music,
      ...liveRet.map((x) => x.note)].join("\n").matchAll(NAME_TOKEN_RE)].map((m) => m[1]));
    for (const nm of used) {
      if (!lookupName(names, nm)) warn(`${NAME_PREFIX}${nm} is used, but no switched-on subject definition has the name "${nm}" \u2014 ` +
        "give a subject that name, or write it out.");
    }
    liveDefs.forEach((d) => {
      const nm = (d.name || "").trim();
      if (nm && !/^[A-Za-z][\w-]*$/.test(nm))
        warn(`Subject name "${nm}" can't be used as a ${NAME_PREFIX}tag \u2014 letters, digits, - and _ only, no spaces.`);
      else if (nm && !/^<Subject \d+>/.test((d.text || "").trim()))
        warn(`The name "${nm}" is on a line that doesn't start with <Subject N>, so it isn't used.`);
    });
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
${TAG_VARS}
${RAISE_CSS}
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
.mmh3p-head{display:flex;align-items:center;gap:var(--mmh3-headgap);
  padding:10px 16px;border-bottom:1px solid #2a2f3a;background:#1e222a;
  --mmh3-headgap:14px;}
/* One height for every control here, regardless of which of several
   differently-padded button styles it happens to use — .mmh3p-btn, .mmh3p-x
   and the mode switcher's own buttons each disagreed by a couple of px. */
/* Scales with the text, and centres it. A fixed 26px is what pushed labels
   off-centre once the text size was raised: the glyphs outgrew a box that
   stayed put, so they sat low and clipped rather than staying centred. */
.mmh3p-head button{height:calc(26px * var(--mmh3-fs, 1));box-sizing:border-box;
  display:inline-flex;align-items:center;justify-content:center;}
/* Belt and braces for #30: no button label may wrap out of its own box at a
   larger text size, whichever of the pack's button styles it wears. */
.mmh3p-modal button,.mmh3p-quickmodal button,.mmh3p-summary button{
  white-space:nowrap;display:inline-flex;align-items:center;
  justify-content:center;}
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
/* Settings and close are ONE control group at the right-hand end of every
   window that has a header — the editor, the library and the quick editor
   all share this rule, and the media loader mirrors it in its own sheet.
   The settings wrapper claims the header's slack... */
.mmh3p-head .mmh3p-prefwrap{margin-left:auto;}
/* ...but ONLY if it is the first thing in the header to do so. Two auto
   margins split the free space between them instead of pooling it, so every
   later claimer has to stand down: the quick editor's header carries a
   .mmh3p-pushright Prompt Builder button, and while the settings wrapper
   also claimed the slack the two ended up 278px apart with the space
   halved between them — settings and close correctly paired, but marooned
   from the button they belong beside. */
.mmh3p-head .mmh3p-pushright ~ .mmh3p-prefwrap{margin-left:0;}
/* Same rule for the close button, which is last and so never claims. */
.mmh3p-head .mmh3p-pushright ~ .mmh3p-x,
.mmh3p-head .mmh3p-prefwrap ~ .mmh3p-x{margin-left:0;}
/* ...and where settings sits directly before it, the gap between those two
   closes so they read as one group. This MUST stay after the rules above:
   it ties with them on specificity, so source order is what decides it —
   the quick editor's header has a .mmh3p-pushright button as well, and
   while this rule sat earlier that tie silently reopened the gap there
   while the editor and library looked correct. Derived from the gap rather
   than repeating 14px, so changing the gap can't reopen it either. */
.mmh3p-head .mmh3p-prefwrap+.mmh3p-x{margin-left:calc(-1 * var(--mmh3-headgap));}
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
/* --mmh3-railw: the card at the current chip scale, plus the rail's 16px
   padding and 1px border, plus ~17px of slack for a classic scrollbar --
   164px at the default 1x chip scale. Sized to the card rather than the other
   round, so the column carries no dead width; the slack is what stops a
   platform with non-overlay scrollbars clipping the card once the list
   scrolls. A custom property because both the grid track below and the rail
   element's own width (further down) have to agree on it exactly, or the
   track and its content disagree about how wide the column is. */
.mmh3p-body.sidebar{--mmh3-railw:calc(128px * var(--mmh3-chip, 1) + 36px);
  grid-template-columns:var(--mmh3-railw) minmax(0,1fr) 440px;}
/* Top padding matches .mmh3p-chipbar's own (16px, below) so the "media"
   heading starts at the same Y coordinate whichever view you toggle into —
   otherwise it visibly jumps a few px on every toggle. */
.mmh3p-body.sidebar .mmh3p-rail{display:flex;flex-direction:column;gap:6px;
  min-height:0;overflow-y:auto;padding:16px 8px 10px;background:#15181e;
  border-right:1px solid #2a2f3a;
  /* Matches --mmh3-railw exactly (the grid track above) — border-box, since
     --mmh3-railw already counts this padding and border; content-box would
     add them again on top, so the rendered rail would come out wider than
     the track and force the track to grow past its own declared size
     (a fixed-length grid track still yields to an item's automatic minimum
     size, which is border-box by default). */
  flex:0 0 auto;box-sizing:border-box;width:var(--mmh3-railw);}
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
  max-height:none;overflow:visible;align-items:center;justify-content:flex-start;}
/* align-self:stretch on the + tile is for the inline strip, where it matches
   the row's height. In this column it overrides the centring above and makes
   the tile span the whole rail, leaving it wider than the cards under it. */
.mmh3p-body.sidebar .mmh3p-rail .mmh3p-card.mmh3p-drop{align-self:center;
  width:calc(128px * var(--mmh3-chip, 1));}
.mmh3p-body.sidebar .mmh3p-rail .mmh3p-card.joinR{margin-right:0;margin-bottom:-6px;
  border-radius:7px 7px 0 0;}
.mmh3p-body.sidebar .mmh3p-rail .mmh3p-card.joinL{border-left-width:1px;
  border-top-width:0;border-radius:0 0 7px 7px;}
@media (max-width:980px){.mmh3p-body{grid-template-columns:1fr;}}

/* --mmh3-chip scales the cards on their own, so the strip can be made
   easier to read without enlarging the rest of the editor with it. */
.mmh3p-card{position:relative;width:calc(128px * var(--mmh3-chip, 1));
  flex:0 0 auto;border:1px solid #2e3440;
  border-radius:7px;overflow:hidden;background:#12151b;cursor:pointer;
  user-select:none;}
.mmh3p-card:hover{border-color:#59637a;}
.mmh3p-card.pic{border-color:#6d5527;} .mmh3p-card.vid{border-color:#255c6b;}
.mmh3p-card.aud{border-color:#4c3d6e;}
.mmh3p-card .mmh3p-thumb{width:100%;height:calc(80px * var(--mmh3-chip, 1));
  object-fit:cover;display:block;background:#0d1015;}
/* #41: the window onto a cropped reference. The media inside is oversized and
   offset so the kept rect fills this box. */
.mmh3p-cropwrap{position:relative;width:100%;
  height:calc(80px * var(--mmh3-chip, 1));overflow:hidden;
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
.mmh3p-tagname.pic{color:var(--mmh3-tag-pic, #e0a94c);} .mmh3p-tagname.vid{color:var(--mmh3-tag-vid, #4cc3e0);}
.mmh3p-tagname.aud{color:var(--mmh3-tag-aud, #b48ce8);} .mmh3p-tagname.subj{color:var(--mmh3-tag-subj, #7ec87e);}
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
.mmh3p-card.refmod{position:relative;}
.mmh3p-cardbadge{position:absolute;top:2px;left:2px;background:rgba(8,10,14,.82);color:#e692c8;
  border:1px solid #7a4d6b;border-radius:4px;font-size:calc(9px * var(--mmh3-fs, 1));line-height:1.3;
  padding:0 3px;pointer-events:none;}
.mmh3p-cardvoice{position:absolute;top:22px;right:4px;color:#b48ce8;font-size:calc(12px * var(--mmh3-fs, 1));
  text-shadow:0 0 3px #000,0 0 2px #000;pointer-events:none;}
.mmh3p-cardgroup{display:flex;flex-direction:column;gap:3px;flex:0 0 auto;}
.mmh3p-cardgroupcards{display:flex;gap:6px;}
.mmh3p-cardstrip{box-sizing:border-box;width:0;min-width:100%;font-size:calc(9px * var(--mmh3-fs, 1));
  color:#8a93a3;border:1px solid #2e3440;border-radius:4px;padding:0 5px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.mmh3p-cardgroup.refmod .mmh3p-cardstrip{color:#e692c8;border-color:#7a4d6b;background:rgba(230,146,200,.10);}
.mmh3p-peekrefmod{display:flex;justify-content:space-between;gap:6px;font-size:calc(10px * var(--mmh3-fs, 1));
  color:#e692c8;margin-bottom:3px;}
.mmh3p-peekrefmod span:last-child{color:#8a93a3;}
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
  display:flex;flex-direction:column;
  /* Named so the audio pair above can ask this column's width rather than
     the viewport's. inline-size only: the height still comes from the flex
     layout, and this column's own width never depends on its contents. */
  container:mmh3p-fields / inline-size;}
/* Sections keep their natural height; the one marked grow takes the slack, so
   the audio sections after it sit at the bottom of the form instead of
   floating under a short description box. When the content is genuinely
   taller than the form, min-height stops the growing box collapsing and the
   form scrolls as before. */
.mmh3p-form>*{flex:0 0 auto;}
.mmh3p-sec.mmh3p-grow{flex:1 1 auto;display:flex;flex-direction:column;
  min-height:220px;}
.mmh3p-sec.mmh3p-grow textarea{flex:1 1 auto;min-height:140px;}
/* Only the textarea (with its own explicit floor above) may give up height
   under pressure — its label and trailing hint must never be squeezed
   below their real rendered size, or the flex-shrink algorithm silently
   overflows them past this section's box and onto whatever follows it. */
.mmh3p-sec.mmh3p-grow>label,.mmh3p-sec.mmh3p-grow>.hint{flex-shrink:0;}
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
/* Wraps rather than overflows. The container query above is sized for the
   default text; at a larger --mmh3-fs the label outgrows any fixed px
   threshold, so the button drops below the heading instead of spilling out
   of the section. min-width:0 lets the heading itself shrink first. */
.mmh3p-sec>label.act{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  min-width:0;}
.mmh3p-secact{margin-left:auto;display:flex;align-items:center;gap:5px;
  flex:0 0 auto;text-transform:none;letter-spacing:normal;}
/* Header-sized: the standard .mmh3p-btn padding is built for a footer row and
   makes the heading much taller than the ones without buttons. Written as a
   descendant selector so it outranks .mmh3p-btn regardless of which is
   declared later in this sheet. Padding and line-height only — the text
   itself stays the one button size the rest of the pack uses. */
.mmh3p-secact .mmh3p-btn{padding:1px 7px;line-height:1.5;}
/* .off strikes the heading through — that must not carry into its buttons. */
.mmh3p-sec>label.off .mmh3p-secact{text-decoration:none;}
.mmh3p-sec .hint{font-size:calc(11px * var(--mmh3-fs, 1));color:#6b7484;margin-top:4px;line-height:1.4;}
/* Help captions off: each one moves to its section's tooltip (applyHints()).
   .keep marks the spans that report live state rather than explain a field —
   word count, the snapped duration, the empty-media line — and those stay. */
.mmh3p-nohints .mmh3p-form .hint:not(.keep){display:none;}
.mmh3p-form textarea,.mmh3p-form input[type=text],.mmh3p-form input[type=number],.mmh3p-form select{
.mmh3p-refmodnone{font-size:calc(10.5px * var(--mmh3-fs, 1));color:#6b7484;font-style:italic;align-self:center;}
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
.mmh3p-prefselect select{flex:0 0 auto;margin-top:1px;}
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
.mmh3p-phrasepeekhead span:first-child{font-size:calc(11px * var(--mmh3-fs, 1));color:#e692c8;
  font-weight:600;}
.mmh3p-phrasepeekcat{font-size:calc(9px * var(--mmh3-fs, 1));color:#6b7484;text-transform:uppercase;
  letter-spacing:.06em;}
.mmh3p-phrasepeektext{font-size:calc(12px * var(--mmh3-fs, 1));color:#a9b2c2;line-height:1.5;
  white-space:pre-wrap;max-height:220px;overflow:hidden;}
.mmh3p-tagpeekwhat{margin-top:5px;font-size:calc(11px * var(--mmh3-fs, 1));color:#6b7484;line-height:1.45;}
.mmh3p-ctxmenu{position:fixed;z-index:10006;min-width:190px;background:#1e222a;
  border:1px solid #3a4252;border-radius:8px;padding:4px;
  box-shadow:0 16px 40px rgba(0,0,0,.55);}
.mmh3p-ctxitem{padding:7px 10px;border-radius:6px;font-size:calc(12px * var(--mmh3-fs, 1));color:#d7dbe2;
  cursor:pointer;white-space:nowrap;}
.mmh3p-ctxitem:hover{background:#2a313d;}
.mmh3p-tagpick{position:absolute;z-index:10006;width:350px;background:#1b1f27;border:1px solid #3a4252;border-radius:9px;
  padding:9px;box-shadow:0 12px 32px rgba(0,0,0,.5);color:#d7dbe2;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-tagpickhead{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.mmh3p-tagpicktag{font-family:ui-monospace,monospace;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-tagpickgrow{flex:1;}
.mmh3p-tagpickrow{display:flex;align-items:center;gap:6px;margin-bottom:7px;}
.mmh3p-tagpicklbl{width:56px;flex:0 0 auto;color:#8a93a3;font-size:calc(10.5px * var(--mmh3-fs, 1));}
.mmh3p-tagseg{display:inline-flex;border:1px solid #3a4252;border-radius:6px;overflow:hidden;}
.mmh3p-tagseg button{background:#12151b;border:0;border-right:1px solid #3a4252;color:#8a93a3;padding:3px 8px;
  font-size:calc(11px * var(--mmh3-fs, 1));cursor:pointer;font-family:inherit;}
.mmh3p-tagseg button:last-child{border-right:0;}
.mmh3p-tagseg button.on{background:#2b3140;color:#d7dbe2;}
.mmh3p-tagseg button:disabled{opacity:.4;cursor:default;}
.mmh3p-tagpickgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px;
  max-height:250px;overflow:auto;}
.mmh3p-tagpickopt{display:flex;flex-direction:column;gap:3px;min-width:0;text-align:left;background:#12151b;
  border:1px solid #2e3440;border-radius:7px;padding:5px;cursor:pointer;color:#d7dbe2;font-family:inherit;}
.mmh3p-tagpickopt:hover{border-color:#6f86b8;background:#1b2230;}
.mmh3p-tagpickthumb{position:relative;height:48px;border-radius:5px;overflow:hidden;background:#0d1015;display:flex;align-items:center;
  justify-content:center;color:#6b7484;font-weight:600;font-size:calc(11px * var(--mmh3-fs, 1));}
.mmh3p-tagpickthumb .mmh3p-thumb{width:100%;height:100%;object-fit:cover;display:block;border-radius:0;}
.mmh3p-tagpicknm{font-family:ui-monospace,monospace;font-size:calc(10.5px * var(--mmh3-fs, 1));white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.mmh3p-tagpickun{position:absolute;left:3px;top:3px;padding:0 4px;border-radius:4px;background:rgba(18,21,27,.85);
  border:1px solid rgba(224,169,76,.55);color:#e0a94c;font-family:system-ui,sans-serif;font-weight:500;
  font-size:calc(9px * var(--mmh3-fs, 1));line-height:1.4;}
.mmh3p-tagpicksub{color:#6b7484;font-size:calc(10px * var(--mmh3-fs, 1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mmh3p-tagpickfoot{display:flex;align-items:center;gap:8px;border-top:1px solid #2a2f3a;padding-top:8px;}
.mmh3p-tagpicknote{color:#8a93a3;font-size:calc(10.5px * var(--mmh3-fs, 1));}
.mmh3p-tagpicknone{color:#8a93a3;padding:4px 2px 10px;font-size:calc(11px * var(--mmh3-fs, 1));}
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
  align-items:flex-start;align-content:flex-start;justify-content:flex-start;
  max-height:min(46vh,380px);overflow-y:auto;overflow-x:hidden;}
/* The "no reference media yet" line. It sits directly in the chip strip, not
   inside a .mmh3p-sec, so the .mmh3p-sec .hint rule never reached it and it
   fell back to the browser's default size — the one piece of text in the
   editor that ignored the text-size setting. Matched to that rule. */
.mmh3p-chips>.hint{flex:1 1 100%;min-width:0;
  font-size:calc(11px * var(--mmh3-fs, 1));color:#6b7484;line-height:1.4;
  text-align:center;}
.mmh3p-body.sidebar .mmh3p-rail .mmh3p-chips>.hint{text-align:left;}
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
/* Three rows, the outer two equal: that puts the + on the tile's exact
   vertical centre (rows 1 and 3 balance around it) and leaves the kinds label
   centred in the space between the + and the bottom edge. Stacking the two as
   one centred flex group instead, as before, put neither where it belongs —
   the pair straddled the middle and the label sat just under the +. */
.mmh3p-card.mmh3p-drop{display:grid;grid-template-rows:1fr auto 1fr;
  justify-items:center;align-items:center;gap:0;
  align-self:stretch;min-height:97px;
  border-style:dashed;
  border-color:#2b313d;background:#141820;color:#5c6472;cursor:pointer;}
.mmh3p-card.mmh3p-drop>.mmh3p-dropplus{grid-row:2;}
.mmh3p-card.mmh3p-drop>.mmh3p-dropkinds{grid-row:3;}
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
/* Stacks when the column holding it is narrow. This asked the *viewport*
   before (@media max-width:900px), which is a different question entirely:
   the fields column can be narrow inside a wide window — the quick editor's
   keyframe pane takes a share of the width, and the full editor's form sits
   beside a sidebar — and the pair then stayed side by side and overflowed
   its own column. Both hosts declare themselves containers below. */
/* 400px is measured, not guessed: the pair's label rows start overflowing
   their sections just under 380px at the default text size. */
@container mmh3p-fields (max-width: 400px){
  .mmh3p-audiopair{flex-direction:column;gap:0;}
}
.mmh3p-chip{display:inline-flex;align-items:center;gap:6px;border-radius:14px;cursor:pointer;
  border:1px solid #363d4a;background:#20242d;color:#c9cfda;font-size:calc(12px * var(--mmh3-fs, 1));
  padding:3px 10px;user-select:none;}
.mmh3p-chip:hover{border-color:#59637a;background:#262c38;}
.mmh3p-chip img,.mmh3p-chip video{width:22px;height:22px;object-fit:cover;border-radius:4px;}
.mmh3p-chip.pic{border-color:#8a6a2c;} .mmh3p-chip.pic b{color:var(--mmh3-tag-pic, #e0a94c);}
.mmh3p-chip.vid{border-color:#2c6f81;} .mmh3p-chip.vid b{color:var(--mmh3-tag-vid, #4cc3e0);}
.mmh3p-chip.aud{border-color:#5d4a86;} .mmh3p-chip.aud b{color:var(--mmh3-tag-aud, #b48ce8);}
.mmh3p-chip.subj{border-color:#3e6b3e;} .mmh3p-chip.subj b{color:var(--mmh3-tag-subj, #7ec87e);}
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
  padding:5px 12px;font-size:calc(12px * var(--mmh3-fs, 1));cursor:pointer;
  /* A label must never wrap inside its own button: at a larger text size
     that pushed a second line out past the button's own bounds. */
  white-space:nowrap;}
.mmh3p-btn:hover{background:#333b4d;}
.mmh3p-btn.primary{background:#3f5a86;border-color:#4d6ea6;color:#fff;}
.mmh3p-btn.off,.mmh3p-btn:disabled{background:#22262e;border-color:#2e3440;
  color:#5c6472;cursor:not-allowed;}
.mmh3p-btn.off:hover,.mmh3p-btn:disabled:hover{background:#22262e;}
.mmh3p-btn.primary:hover{background:#48679a;}
.mmh3p-btn.ghost{background:none;border-color:transparent;color:#8a93a3;}
.mmh3p-btn.ghost:hover{color:#e05a5a;}
/* Row delete. Framed, unlike .ghost, so it reads as a button sitting in the
   row rather than a loose glyph — .ghost drops the border entirely, which is
   right for a footer but leaves this one unbounded next to bordered fields. */
.mmh3p-btn.rowx{background:#20242d;border-color:#3a4252;color:#8a93a3;
  padding:3px 8px;line-height:1;}
.mmh3p-btn.rowx:hover{background:#3a2020;border-color:#7a3a3a;color:#f0a0a0;}
.mmh3p-defrow{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;}
.mmh3p-defrow textarea{flex:1;min-height:38px;}
.mmh3p-form .mmh3p-defrow textarea{flex:1 1 auto;min-width:0;}
.mmh3p-form .mmh3p-defrow input[type=text].mmh3p-defname{width:110px;flex:0 0 110px;min-width:0;align-self:flex-start;}
.mmh3p-form .mmh3p-defrow input[type=text].mmh3p-defname[hidden]{display:none;}
.mmh3p-form .mmh3p-defrow input[type=text].mmh3p-defname.mmh3p-defvoice{width:190px;flex:0 0 190px;}
.mmh3p-spksplit{display:inline-flex;}
.mmh3p-spksplit .mmh3p-spkmain{border-top-right-radius:0;border-bottom-right-radius:0;}
.mmh3p-spksplit .mmh3p-spkarrow{border-top-left-radius:0;border-bottom-left-radius:0;border-left:0;padding-left:5px;padding-right:5px;}
.mmh3p-spkmenu{position:absolute;z-index:10006;min-width:300px;max-width:480px;background:#1b1f27;border:1px solid #3a4252;
  border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.45);}
.mmh3p-spkitem{display:block;width:100%;text-align:left;background:none;border:0;border-radius:6px;padding:7px 9px;
  color:#d7dbe2;cursor:pointer;font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-spkitem:hover{background:#262c36;}
.mmh3p-spkitem small{display:block;margin-top:3px;color:#8e97a6;font-family:ui-monospace,monospace;
  font-size:calc(11px * var(--mmh3-fs, 1));white-space:normal;}
.mmh3p-spkitem.off{cursor:default;opacity:.6;}
.mmh3p-spkitem.off:hover{background:none;}
.mmh3p-chipname{color:#a9b2c2;font-size:calc(10px * var(--mmh3-fs, 1));}
.mmh3p-minitags{display:flex;gap:4px;flex-wrap:wrap;margin:-2px 0 8px 2px;min-height:14px;}
.mmh3p-minitag{font-size:calc(10px * var(--mmh3-fs, 1));border-radius:8px;padding:1px 7px;background:#20242d;border:1px solid #363d4a;}
.mmh3p-minitag.pic{color:var(--mmh3-tag-pic, #e0a94c);border-color:#8a6a2c;}
.mmh3p-minitag.vid{color:var(--mmh3-tag-vid, #4cc3e0);border-color:#2c6f81;}
.mmh3p-minitag.aud{color:var(--mmh3-tag-aud, #b48ce8);border-color:#5d4a86;}
.mmh3p-minitag.subj{color:var(--mmh3-tag-subj, #7ec87e);border-color:#3e6b3e;}
.mmh3p-roles{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:-4px 0 10px 2px;}
.mmh3p-rolelabel{font-size:calc(10px * var(--mmh3-fs, 1));text-transform:uppercase;letter-spacing:.07em;
.mmh3p-btn.danger{border-color:#7a4a3a;color:#e0a090;}
.mmh3p-btn.danger:hover{background:#3a2622;}
.mmh3p-conceptover{position:fixed;inset:0;z-index:10007;background:rgba(8,10,14,.55);display:flex;
  align-items:center;justify-content:center;}
.mmh3p-conceptbox{width:min(440px,92vw);background:#1e222a;border:1px solid #3a4252;border-radius:10px;
  padding:14px 16px;display:flex;flex-direction:column;gap:9px;color:#d7dbe2;
  box-shadow:0 24px 64px rgba(0,0,0,.55);font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-concepthead{font-weight:600;font-size:calc(14px * var(--mmh3-fs, 1));}
.mmh3p-conceptrow{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.mmh3p-conceptrow span{color:#e692c8;}
.mmh3p-conceptrow small{color:#8a93a3;}
.mmh3p-conceptrow select{flex:0 1 220px;}
.mmh3p-conceptbtns{display:flex;justify-content:flex-end;gap:6px;margin-top:4px;}
.mmh3p-conceptbox .mmh3p-dim{color:#8a93a3;font-size:calc(11px * var(--mmh3-fs, 1));}
.mmh3p-conceptbox .mmh3p-inline{display:flex;align-items:center;gap:6px;color:#a9b2c2;}
  color:#6b7484;margin-right:2px;}
.mmh3p-rolechip{font-size:calc(11px * var(--mmh3-fs, 1));border-radius:10px;padding:2px 9px;cursor:pointer;
  background:#1d2029;border:1px solid #3a3050;color:#a99ac4;user-select:none;}
.mmh3p-rolechip:hover{border-color:#5d4a86;color:#c9b9e6;background:#241f33;}
.mmh3p-rolechip.on{background:#3a2f56;border-color:#7d63b8;color:#e2d6f8;}
.mmh3p-ttypes{display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:6px;}
.mmh3p-ttypes label{display:flex;gap:5px;align-items:center;font-size:calc(12px * var(--mmh3-fs, 1));color:#c9cfda;
  text-transform:none;letter-spacing:0;cursor:pointer;}
/* Each entry is its own boxed card: these rows wrap onto two lines (the note
   spans the full width underneath), so without a frame it was hard to see
   where one entry ended and the next began. */
.mmh3p-retrow{display:grid;grid-template-columns:14px auto 1fr auto auto;gap:6px;
  margin-bottom:8px;align-items:center;
  background:#161a21;border:1px solid #2b313d;border-radius:7px;padding:7px 8px;}
.mmh3p-retrow.off{opacity:.55;}
.mmh3p-retrow input,.mmh3p-retrow select{font-size:calc(12px * var(--mmh3-fs, 1));}
.mmh3p-retnote{grid-column:1/-1;margin-top:-2px;}
.mmh3p-preview{flex:1;overflow:auto;margin:0;padding:12px 14px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:calc(12px * var(--mmh3-fs, 1));line-height:1.55;
  white-space:pre-wrap;word-break:break-word;color:#c4cad5;}
/* Unscoped: paintTags() output appears in the editor's preview and in the
   node's prompt bar, and a tag has to read the same colour in both.

   These track the .mmh3p-reftag chips the input fields paint (further down),
   token for token. They used to drift: Subject was a different green, <d> and
   the language bracket had hues of their own, and [Shot N] and (S1) were
   outright swapped — the preview drew a shot blue and a speaker pink while
   the fields drew a shot pink and a speaker blue. The chips are the reference
   now, since that is where the writing actually happens. */
.mmh3p-t-pic{color:var(--mmh3-tag-pic, #e0a94c);} .mmh3p-t-vid{color:var(--mmh3-tag-vid, #4cc3e0);}
.mmh3p-t-aud{color:var(--mmh3-tag-aud, #b48ce8);} .mmh3p-t-subj{color:var(--mmh3-tag-subj, #7ec87e);}
/* Solid, like its chip: a cut marker is the loudest thing in a prompt. Bold
   is safe here — unlike in a field, nothing has to line up under this text. */
.mmh3p-t-shot{color:var(--mmh3-tag-shotink, #ffe9f4);background:var(--mmh3-tag-shot, #a34b7d);border-radius:3px;
  font-weight:600;-webkit-box-decoration-break:clone;box-decoration-break:clone;}
.mmh3p-t-d{color:#5f7899;}
.mmh3p-t-lang{color:#9dc0e4;background:rgba(126,167,216,.16);border-radius:3px;}
.mmh3p-t-spk{color:var(--mmh3-tag-spk, #7ea7d8);font-weight:600;}
/* A tag naming media that isn't loaded, matching .mmh3p-reftag.unknown. The
   preview could not show this at all before — it is a pure string pass with
   no idea what is loaded — so a typo'd tag looked correct right up until the
   prompt ran. */
.mmh3p-t-unknown{color:var(--mmh3-tag-unknown, #f07070);background:color-mix(in srgb, var(--mmh3-tag-unknown) 16%, transparent);border-radius:3px;}
/* N/A marks a section as deliberately empty, so it reads as absent rather
   than as content. No chip equivalent: the fields never paint it. */
.mmh3p-t-na{color:#6b7484;font-style:italic;}
.mmh3p-issuebox{flex:0 0 auto;border-top:1px solid #2a2f3a;display:flex;
  flex-direction:column;min-height:0;}
.mmh3p-issuehead{display:flex;align-items:center;gap:7px;width:100%;
  box-sizing:border-box;background:none;border:0;padding:6px 14px;
  color:#8a93a3;font-family:inherit;font-size:calc(10px * var(--mmh3-fs, 1));
  text-transform:uppercase;letter-spacing:.08em;cursor:pointer;text-align:left;}
.mmh3p-issuehead:hover{color:#c9cfda;}
.mmh3p-issuecaret{display:inline-block;transition:transform .15s ease;
  font-size:calc(9px * var(--mmh3-fs, 1));}
.mmh3p-issuebox.collapsed .mmh3p-issuecaret{transform:rotate(-90deg);}
.mmh3p-issuebox.collapsed .mmh3p-issues{display:none;}
.mmh3p-issuecount{margin-left:auto;font-variant-numeric:tabular-nums;
  letter-spacing:0;}
.mmh3p-issuecount.error{color:#f07070;} .mmh3p-issuecount.warn{color:#e0a94c;}
.mmh3p-issuecount.info{color:#8a93a3;} .mmh3p-issuecount.ok{color:#7ec87e;}
/* Wraps, never scrolls sideways. A long unbroken run — a file name, a list of
   tags — used to widen the content box and put the whole list on a horizontal
   scrollbar, pushing the text of every other line out of view with it. */
.mmh3p-issues{max-height:180px;overflow-y:auto;overflow-x:hidden;
  padding:0 14px 8px;font-size:calc(12px * var(--mmh3-fs, 1));min-width:0;}
.mmh3p-issues>div{overflow-wrap:anywhere;word-break:normal;}
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
  opacity:.85;user-select:none;cursor:pointer;}
.mmh3p-summark:hover{opacity:1;}
/* Quick edit: smaller than the full builder, same chrome. */
/* 25% off both axes (was 900x780 capped at 92vw/88vh). The viewport caps come
   down with the pixel sizes, or on a small screen the window would still fill
   almost the whole viewport and the reduction would only show on large ones. */
.mmh3p-quickmodal{box-sizing:border-box;width:min(900px,88vw);height:min(585px,66vh);
  display:flex;flex-direction:column;background:#191c22;color:#d7dbe2;
  border:1px solid #303642;border-radius:10px;overflow:hidden;
  box-shadow:0 24px 64px rgba(0,0,0,.55);}
.mmh3p-quickbody{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 18px;}
.mmh3p-quick{display:flex;flex-direction:column;min-height:100%;
  container:mmh3p-fields / inline-size;}
/* #46: keyframes on the left, fields on the right. The keyframes are what
   you are writing against, so they get real estate — a proportional column,
   full body height — rather than the 132px thumbnail strip they used to be.
   One picture (I2VA/L2VA) fills the column; two (FL2VA) split it evenly,
   first frame above last. */
.mmh3p-quickwrap{display:flex;gap:12px;align-items:stretch;min-height:100%;}
.mmh3p-quickwrap>.mmh3p-quick{flex:1 1 auto;min-width:0;}
/* Width, flex-direction and each tile's exact size are written inline by
   keyframePaneLayout() — the pane takes its shape from the pictures rather
   than fitting them into a fixed column, so nothing is cropped and no
   letterbox bars are left over. The values here are the pre-measurement
   fallback, replaced on the first layout pass. */
.mmh3p-quickpics{flex:0 0 auto;min-width:0;align-self:center;
  display:flex;flex-direction:column;gap:8px;
  /* Two pictures of different shapes give the pane the width of the wider
     one; centring keeps the narrower under it rather than hard left. */
  align-items:center;justify-content:center;}
.mmh3p-quickpic{flex:0 0 auto;min-height:0;position:relative;box-sizing:border-box;
  border:1px solid #2e3440;border-radius:7px;overflow:hidden;background:#12151b;
  /* Sizes the crop window below in cqw/cqh — see .mmh3p-quickcrop. */
  container-type:size;}
/* contain, not cover: the whole frame, undistorted. Showing what the model
   actually receives is the point of these. */
.mmh3p-quickpic>.mmh3p-quickimg{width:100%;height:100%;object-fit:contain;
  display:block;background:#0d1015;}
/* A cropped picture is shown through cropFrame()'s offset window, which fills
   its box by width and leaves the box's own height to do the clipping — so
   the box has to carry the kept region's aspect ratio for the crop to land
   exactly. --ar is set per picture in keyframes().

   Container-query units rather than max-width/max-height: clamping one axis
   with max-* does not re-derive the other, so a box wider than its tile came
   out stretched. min() against both cq axes is exact containment — measured
   across 15 tile/aspect combinations. */
.mmh3p-quickpic>.mmh3p-quickcrop{position:absolute;left:50%;top:50%;
  transform:translate(-50%,-50%);
  width:min(100cqw, calc(100cqh * var(--ar)));
  height:min(100cqh, calc(100cqw / var(--ar)));}
/* The speaker buttons share the field's header row with + Shot, and there
   are as many of them as the prompt has speakers — so the group wraps as a
   unit rather than letting one button strand itself on a line of its own. */
.mmh3p-quickspk{display:inline-flex;gap:5px;flex-wrap:wrap;
  align-items:center;}
.mmh3p-quickpic .mmh3p-tagname{position:absolute;left:6px;bottom:6px;
  padding:2px 7px;border-radius:5px;background:rgba(8,10,14,.78);
  pointer-events:none;}
.mmh3p-quick>*{flex:0 0 auto;}
.mmh3p-quick .mmh3p-sec.mmh3p-grow{flex:1 1 auto;display:flex;flex-direction:column;
  min-height:200px;}
.mmh3p-quick .mmh3p-sec.mmh3p-grow textarea{flex:1 1 auto;min-height:120px;}
/* Same guard as the full editor's grow section, ahead of the same class of
   bug — no hint lives here yet, but the label shouldn't be squeezable. */
.mmh3p-quick .mmh3p-sec.mmh3p-grow>label,
.mmh3p-quick .mmh3p-sec.mmh3p-grow>.hint{flex-shrink:0;}
.mmh3p-quick textarea{width:100%;box-sizing:border-box;background:#12151b;
  color:#dde2ea;border:1px solid #2e3440;border-radius:6px;padding:7px 9px;
  font-size:calc(13px * var(--mmh3-fs, 1));font-family:inherit;resize:vertical;line-height:1.5;}
.mmh3p-quick textarea:focus{outline:none;border-color:#4a5568;}
.mmh3p-quick label{display:block;font-size:calc(11px * var(--mmh3-fs, 1));text-transform:uppercase;
  letter-spacing:.08em;color:#8a93a3;margin-bottom:5px;}
/* The node's bar expanded into those fields: it stops being a one-line summary
   and becomes a small scrolling editor. */
/* The node's stack: media panel above, prompt bar below, in ONE DOM widget.
   The split is a flex rule rather than two widget heights reconciled in JS,
   which is what stops them drifting apart — see promptstudio.js's STACK_H.
   Whichever half is flexible takes the slack, so no arrangement can leave a
   gap between them. */
/* overflow stays visible: the panel's dropdowns escape its own box when it
   is collapsed, and a second clip here would put them straight back. The
   halves clip their own content already. */
.mmh3p-nodestack{display:flex;flex-direction:column;width:100%;
  box-sizing:border-box;height:100%;min-height:0;}
/* Normally the panel takes the room and the bar is a fixed strip under it. */
.mmh3p-nodestack>.mmlp-panel{flex:1 1 auto;min-height:0;height:auto;}
.mmh3p-nodestack>.mmh3p-summary{flex:0 0 auto;}
/* In T2VA's "Used" layout the panel collapses to its toolbar (.mmlp-min) and
   the bar expands into the fields, so the two swap which one is flexible. The
   bar then absorbs everything the panel gave up — by construction, not by
   arithmetic, which is the bug this replaced: the panel's element collapsed
   while its widget went on reserving the old height. */
.mmh3p-nodestack>.mmlp-panel.mmlp-min{flex:0 0 auto;}
.mmh3p-nodestack>.mmh3p-summary.mmh3p-summary-open{flex:1 1 auto;min-height:0;}
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
/* Width cut 25% (was 1240). Height is no longer fixed: the window sizes to
   however many entries there are, growing only until it runs out of viewport,
   so a library holding three prompts is no longer a mostly-empty full-height
   panel. min-height keeps the head/filter bar from looking cramped when the
   list is empty. */
.mmh3p-libmodal{box-sizing:border-box;width:min(930px,95vw);
  height:auto;max-height:92vh;min-height:min(260px,92vh);display:flex;
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
/* flex-shrink only, no grow: growing would make the list claim the whole
   max-height and defeat the height:auto above. */
.mmh3p-liblist{flex:0 1 auto;min-height:0;overflow:auto;padding:6px 8px;}
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
/* Preview line count, from the library's own slider. At one line the
   single-line rule above already ellipsises; past that -webkit-line-clamp is
   what actually ellipsises a wrapped block. */
.mmh3p-liblist .mmh3p-libprev{white-space:normal;text-overflow:initial;
  display:-webkit-box;-webkit-line-clamp:var(--mmh3-librows, 1);
  -webkit-box-orient:vertical;line-height:1.45;}
/* The 🔊/🎵 marks, matching .mmh3p-summark on the node's prompt bar. */
.mmh3p-libmark{font-size:calc(11px * var(--mmh3-fs, 1));line-height:1;opacity:.85;
  user-select:none;}
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
/* Subject-definition rows are the same shape: power toggle, field, remove
   button. The wrapper takes the flex:1 the bare textarea had. */
.mmh3p-defrow .mmh3p-chipwrap{flex:1;min-width:0;}
/* Same problem one level up, in the growing sections. The section is a flex
   column whose textarea is meant to absorb all the slack, but the wrapper now
   sits between the two — so the grow has to be handed down through it, or the
   wrapper sizes to its content and the field stops short of the sections
   below instead of filling to them. min-height:0 lets it shrink below the
   textarea's intrinsic rows, which is what makes "fill exactly" possible
   rather than "fill, then overflow". */
.mmh3p-sec.mmh3p-grow>.mmh3p-chipwrap{flex:1 1 auto;min-height:0;display:flex;
  /* Nothing may paint outside this box onto the sections below it. */
  overflow:hidden;}
.mmh3p-sec.mmh3p-grow>.mmh3p-chipwrap>textarea.mmh3p-chiptext{
  flex:1 1 auto;min-height:0;
  /* No drag handle here. This field's height is the flex layout's to decide
     — it fills to whatever is left above the audio sections — and the
     wrapper's height does not follow a drag, so dragging the grip only made
     the textarea outgrow its wrapper and paint over what came next. */
  resize:none;}
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
/* Plain mode. Nothing here changes metrics — the mirror still lays the text
   out exactly as before, it just paints nothing, and the textarea shows its
   own text instead. The tag spans stay in place, so hover previews still
   find them. */
.mmh3p-chipwrap.plain textarea.mmh3p-chiptext{color:#dde2ea;}
.mmh3p-chipwrap.plain textarea.mmh3p-chiptext::selection{
  background:rgba(96,140,210,.45);color:#fff;}
.mmh3p-chipwrap.plain .mmh3p-chipmirror{color:transparent;}
/* A name suggestion after the caret: grey in both modes, Tab fills it in. */
.mmh3p-chipmirror .mmh3p-ghost,.mmh3p-chipwrap.plain .mmh3p-chipmirror .mmh3p-ghost{color:#6b7484;}
.mmh3p-chipwrap.plain .mmh3p-chipmirror .mmh3p-reftag,
.mmh3p-chipwrap.plain .mmh3p-chipmirror .mmh3p-dblock,
.mmh3p-chipwrap.plain .mmh3p-chipmirror .mmh3p-dmark,
.mmh3p-chipwrap.plain .mmh3p-chipmirror .mmh3p-dlang,
.mmh3p-chipwrap.plain .mmh3p-chipmirror .mmh3p-dtag,
.mmh3p-chipwrap.plain .mmh3p-chipmirror .mmh3p-dtext{
  color:transparent;background:none;box-shadow:none;}
.mmh3p-reftag{border-radius:3px;background:color-mix(in srgb, var(--mmh3-tag-pic) 18%, transparent);color:var(--mmh3-tag-pic, #e0a94c);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--mmh3-tag-pic) 18%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--mmh3-tag-pic) 45%, transparent);
  -webkit-box-decoration-break:clone;box-decoration-break:clone;}
.mmh3p-reftag.vid{background:color-mix(in srgb, var(--mmh3-tag-vid) 18%, transparent);color:var(--mmh3-tag-vid, #4cc3e0);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--mmh3-tag-vid) 18%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--mmh3-tag-vid) 45%, transparent);}
.mmh3p-reftag.aud{background:color-mix(in srgb, var(--mmh3-tag-aud) 18%, transparent);color:var(--mmh3-tag-aud, #b48ce8);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--mmh3-tag-aud) 18%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--mmh3-tag-aud) 45%, transparent);}
.mmh3p-reftag.subj{background:color-mix(in srgb, var(--mmh3-tag-subj) 18%, transparent);color:var(--mmh3-tag-subj, #7ec87e);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--mmh3-tag-subj) 18%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--mmh3-tag-subj) 45%, transparent);}
.mmh3p-reftag.unknown{background:color-mix(in srgb, var(--mmh3-tag-unknown) 16%, transparent);color:var(--mmh3-tag-unknown, #f07070);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--mmh3-tag-unknown) 16%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--mmh3-tag-unknown) 50%, transparent);}
.mmh3p-reftag.spk{background:color-mix(in srgb, var(--mmh3-tag-spk) 16%, transparent);color:var(--mmh3-tag-spk, #7ea7d8);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--mmh3-tag-spk) 16%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--mmh3-tag-spk) 40%, transparent);}
/* Cut markers are the loudest thing in a prompt, so they're the only SOLID
   chip: every other tag is a translucent tint. The weight does the work, which
   also means the hue doesn't have to compete with audio's violet or the red
   that means "undefined tag". */
/* No font-weight here, ever: bold widens the glyphs, so the mirror's [Shot N]
   advanced further than the textarea's invisible regular-weight copy — a few
   px of caret drift on that line, or a whole word once the widened line
   wrapped earlier than the real one. The double text-shadow fakes the weight
   without touching a single glyph advance. */
.mmh3p-reftag.shot{background:var(--mmh3-tag-shot, #a34b7d);color:var(--mmh3-tag-shotink, #ffe9f4);
  text-shadow:0.02em 0 currentColor,-0.02em 0 currentColor;
  box-shadow:0 0 0 2px var(--mmh3-tag-shot, #a34b7d), inset 0 0 0 1px rgba(255,255,255,.18);}
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
.mmh3p-dtag{color:#e692c8;background:rgba(230,146,200,.14);border-radius:3px;
  box-shadow:0 0 0 1px rgba(230,146,200,.28);
  -webkit-box-decoration-break:clone;box-decoration-break:clone;}
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
/* ---- Draft mode ----
   One class on the modal drives everything: teal chrome for the across-the-
   room read, a cool field wash for mid-typing, and the banner carrying the
   actual meaning. Teal is the one hue unclaimed elsewhere in the palette —
   speaker blue, shot magenta and danger red all stay distinct — and unlike
   a warm accent it doesn't go muddy at low luminance. Colors only, so the
   chip mirror never notices. Last in the sheet on purpose. */
.mmh3p-modal.draft{border-color:#3fb2a8;
  box-shadow:0 24px 64px rgba(0,0,0,.55), 0 0 0 1px #3fb2a8;}
.mmh3p-modal.draft .mmh3p-head{background:#15242a;border-bottom-color:#3fb2a8;}
.mmh3p-modal.draft .mmh3p-form textarea,
.mmh3p-modal.draft .mmh3p-form input[type=text],
.mmh3p-modal.draft .mmh3p-form input[type=number],
.mmh3p-modal.draft .mmh3p-form select{background:#101619;border-color:#24343a;}
/* Chip fields paint their background on the WRAP — textarea and mirror are
   both transparent by design — so the wash has to land there. Backgrounds
   and borders only: colors are layout-neutral, the mirror never notices. */
.mmh3p-modal.draft .mmh3p-chipwrap{background:#101619;border-color:#24343a;}
.mmh3p-modal.draft .mmh3p-chipwrap textarea.mmh3p-chiptext{background:transparent;
  border-color:transparent;}
.mmh3p-titletag{color:#3fb2a8;font-weight:600;margin-left:8px;
  font-size:calc(13px * var(--mmh3-fs, 1));}
.mmh3p-modetoggle.draft{border-color:#3fb2a8;color:#6fd0c6;}
.mmh3p-draftadmin{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
  padding:5px 6px;}
.mmh3p-drafthint{flex:1 1 140px;min-width:0;color:#8a93a3;
  font-size:calc(10px * var(--mmh3-fs, 1));line-height:1.4;}
.mmh3p-draftslot{flex:0 0 auto;}
.mmh3p-draftslot:empty{display:none;}
.mmh3p-draftbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  background:#15242a;border-top:1px solid #3fb2a8;
  border-bottom:1px solid #3fb2a8;padding:8px 16px;}
.mmh3p-draftbadge{background:#3fb2a8;color:#06211f;font-weight:700;
  border-radius:5px;padding:1px 7px;letter-spacing:.06em;
  font-size:calc(10px * var(--mmh3-fs, 1));}
.mmh3p-draftmsg{flex:1 1 240px;min-width:0;color:#bfe0dc;
  font-size:calc(11px * var(--mmh3-fs, 1));line-height:1.45;}
.mmh3p-draftstatus{color:#3fb2a8;opacity:.75;}
.mmh3p-mediapeek{width:256px;padding:0;}
.mmh3p-peeklink{margin-top:5px;padding-top:5px;border-top:1px solid #262c36;
  color:#8fd3c8;line-height:1.4;font-size:calc(10px * var(--mmh3-fs, 1));}
.mmh3p-peekgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;
  padding:6px;background:#12151b;}
.mmh3p-peekcell{position:relative;aspect-ratio:1;background:#0e1116;
  border-radius:4px;overflow:hidden;display:flex;align-items:center;
  justify-content:center;}
.mmh3p-peekcell img{width:100%;height:100%;object-fit:cover;}
.mmh3p-peekkind{color:#6b7484;display:flex;align-items:center;
  justify-content:center;}
.mmh3p-peekkind .mmh3p-kindicon{width:22px;height:22px;color:#6b7484;}
.mmh3p-peekname{position:absolute;left:0;right:0;bottom:0;padding:1px 3px;
  background:rgba(8,10,14,.72);color:#9aa3b2;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;
  font-size:calc(8px * var(--mmh3-fs, 1));}
.mmh3p-libmedia{display:inline-flex;align-items:baseline;gap:5px;
  font-size:calc(10px * var(--mmh3-fs, 1));color:#8fd3c8;
  background:rgba(63,178,168,.14);border:1px solid rgba(63,178,168,.32);
  border-radius:5px;padding:1px 7px;max-width:260px;overflow:hidden;
  white-space:nowrap;cursor:help;}
.mmh3p-libmedia:hover{background:rgba(63,178,168,.22);}
.mmh3p-libkind{color:#8fd3c8;flex:0 0 auto;display:inline-flex;
  align-items:baseline;gap:2px;}
.mmh3p-kindicon{width:1.05em;height:1.05em;display:block;flex:0 0 auto;
  color:#5e9c93;}
.mmh3p-libkind{gap:3px;}
.mmh3p-libsep{color:#4a7a73;flex:0 0 auto;}
.mmh3p-libpname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mmh3p-prefitem.off{opacity:.5;}
.mmh3p-prefitem.off .mmh3p-prefhint{color:#f0c98a;opacity:.85;}
.mmh3p-linkrow{display:flex;align-items:flex-start;gap:7px;flex-wrap:wrap;
  margin-top:7px;padding-top:7px;border-top:1px solid #262c36;}
.mmh3p-linktext{display:flex;flex-direction:column;gap:1px;
  font-size:calc(11px * var(--mmh3-fs, 1));color:#8a93a3;}
.mmh3p-linktext b{color:#6fb3a8;font-weight:600;}
.mmh3p-linknote{color:#6b7484;font-size:calc(10px * var(--mmh3-fs, 1));
  line-height:1.4;}
.mmh3p-linkname{flex:1 1 140px;min-width:0;background:#12151b;color:#dde2ea;
  border:1px solid #2e3440;border-radius:6px;padding:4px 8px;
  font-size:calc(11px * var(--mmh3-fs, 1));font-family:inherit;}
.mmh3p-linkname:focus{outline:none;border-color:#4a5568;}
.mmh3p-linkwarn{display:block;margin-top:5px;color:#f0c98a;}
.mmh3p-draftdropped{background:#3a2a18;color:#f0c98a;border:1px solid #6b4f26;
  border-radius:5px;padding:1px 7px;flex:0 0 auto;cursor:help;
  font-size:calc(10px * var(--mmh3-fs, 1));}
.mmh3p-draftactions{display:flex;gap:6px;flex:0 0 auto;}
.mmh3p-commitstrip{background:#132126;border-top:1px solid #3fb2a8;
  border-bottom:1px solid #3fb2a8;padding:10px 16px;}
.mmh3p-commitmsg{display:block;color:#bfe0dc;margin-bottom:7px;
  font-size:calc(12px * var(--mmh3-fs, 1));line-height:1.45;}
.mmh3p-commitrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.mmh3p-commitname{flex:1 1 180px;min-width:0;background:#12151b;
  color:#dde2ea;border:1px solid #2e3440;border-radius:6px;padding:5px 8px;
  font-size:calc(12px * var(--mmh3-fs, 1));font-family:inherit;}
.mmh3p-commitname:focus{outline:none;border-color:#4a5568;}
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

/* ---------- drafts ----------
 * Draft mode's scratchpad. Lives on disk (one keyed file, server-side), so
 * a browser crash loses at most a debounce window. Live is the node; the
 * draft is the file; nothing here ever touches the prompt library or the
 * preset store except through the user's own explicit save. */

async function draftApi(path, body) {
  const resp = await postApi("/minimax_h3_plus/drafts" + path, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `request failed (${resp.status})`);
  return data;
}

/** Stable serialisation: object key order must not read as "changed". */
function stableStringify(v) {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(
      (k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

/** djb2 — cheap content fingerprint for clean/dirty comparisons. Cleanliness
 *  is always computed from this, never stored as a flag: stored booleans
 *  drift out of sync, a comparison can't. */
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function stateHash(state) { return hashStr(stableStringify(state)); }

const DRAFT_MEDIA_KINDS = new Set(["picture", "video", "audio"]);

/** Validate a media array that came from disk.
 *
 *  This is the only path that writes to the loader's media_state without
 *  having gone through upload/probe first — commit deep-copies the draft's
 *  set straight in, and that widget is what nodes.py reads at execution.
 *  So a malformed item here doesn't just look wrong, it reaches Python.
 *
 *  Unknown keys are deliberately KEPT: a newer build may add fields, and
 *  stripping them would make an older build silently lossy. Returns
 *  { items, dropped } — the caller must surface `dropped`, because a draft
 *  quietly losing a reference is the failure this exists to prevent. */
function validateDraftMedia(raw) {
  if (!Array.isArray(raw)) return { items: null, dropped: 0 };
  const seen = new Set();
  let dropped = 0;
  const items = [];
  for (const it of raw) {
    if (!it || typeof it !== "object" || Array.isArray(it)) { dropped++; continue; }
    if (!DRAFT_MEDIA_KINDS.has(it.kind)) { dropped++; continue; }
    if (typeof it.file !== "string" || !it.file.trim()) { dropped++; continue; }
    const out = { ...it };
    out.file = it.file.trim();
    if (typeof out.name !== "string" || !out.name.trim()) {
      // Fall back to the filename rather than rendering "undefined".
      out.name = parseAnnotatedPath(out.file).name || out.file;
    }
    // live() matches on uid, so a collision lands edits on the wrong item.
    if (typeof out.uid !== "string" || !out.uid || seen.has(out.uid)) {
      out.uid = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    }
    seen.add(out.uid);
    items.push(out);
  }
  return { items: items.length ? items : null, dropped };
}

/** RefMod picks a draft stored — from disk, so unvalidated. Keeps what the
 *  stack panel can show: a name and at least one channel with a file. */
function validateDraftRefmods(raw) {
  if (!Array.isArray(raw)) return { items: null, dropped: 0 };
  let dropped = 0;
  const items = [];
  for (const p of raw) {
    if (!p || typeof p !== "object" || Array.isArray(p)) { dropped++; continue; }
    const chan = (c) => (c && typeof c === "object" && typeof c.file === "string" && c.file.trim()) ? { ...c } : null;
    const visual = chan(p.visual), audio = chan(p.audio);
    if (!visual && !audio) { dropped++; continue; }
    const out = { ...p, visual: visual || undefined, audio: audio || undefined };
    if (typeof out.name !== "string" || !out.name.trim()) out.name = (visual || audio).file;
    if (typeof out.label !== "string" || !out.label.trim()) out.label = out.name.split("/").pop();
    items.push(out);
  }
  return { items: items.length ? items : null, dropped };
}

/** The node's draft identity. Properties serialise by NAME in the workflow
 *  file — unlike widgets, which are positional — so this adds no widget and
 *  can't shift saved-graph value mapping. Minted once, travels with the
 *  workflow through save/export/import. */
function draftIdFor(node) {
  node.properties = node.properties || {};
  if (!node.properties.mmh3_draft_id) {
    node.properties.mmh3_draft_id = "d" + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8);
  }
  return node.properties.mmh3_draft_id;
}

/** RefMod presets: a saved stack, kept by the same routes shape. */
async function refmodPresetApi(path, body) {
  const resp = await postApi("/minimax_h3_plus/refmod_presets" + path, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `request failed (${resp.status})`);
  return data;
}

async function presetApi(path, body) {
  const resp = await postApi("/minimax_h3_plus/presets" + path, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `request failed (${resp.status})`);
  return data;
}

async function libApi(path, body) {
  const resp = body
    ? await postApi("/minimax_h3_plus/prompts" + path, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" } })
    : await api.fetchApi("/minimax_h3_plus/prompts" + path);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || `request failed (${resp.status})`);
    if (data.exists) err.exists = true;   // 409: name collision on a new save
    throw err;
  }
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
/** The prompt bar's own 🔊/🎵 rules, applied to a library entry. The server
 *  answers the question (_audio_marks in web_api.py) using the same test the
 *  bar does — text that isn't "N/A" in a section that isn't switched off —
 *  because it reads the saved state, and the assembled prompt this listing
 *  otherwise carries has already resolved both of those away. */
function libMarks(entry) {
  const a = entry.audio;
  if (!a) return [];
  const out = [];
  if (a.sound)
    out.push(el("span", { class: "mmh3p-libmark",
      title: "overall_soundscape has content" }, "\u{1F50A}"));
  if (a.music)
    out.push(el("span", { class: "mmh3p-libmark",
      title: "non_diegetic_music has content" }, "\u{1F3B5}"));
  return out;
}

class Library {
  static _peekCache = new Map();

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
    this.prefs = loadPrefs();
    injectCSS();
    this.build();
    this.applyPrefs();
    document.body.append(this.overlay);
    editor._mmh3Lib = this;
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
          el("div", { class: "mmh3p-title" }, "Prompt Library"),
          el("button", { class: "mmh3p-btn",
            onclick: () => { this.saveOpen = !this.saveOpen; this.paint(); } },
            "Save current prompt"),
          this.prefsButton(),
          el("button", { class: "mmh3p-x", onclick: () => this.close() }, "\u2715")),
        el("div", { class: "mmh3p-libbar" },
          this.searchEl, this.catEl, this.catBtn, this.favEl),
        this.listEl));

    // Both overlays listen on window, and this one registered first — so
    // without this guard Escape closed the editor out from under whatever
    // was stacked on top of it.
    this.escHandler = (e) => {
      if (e.key !== "Escape") return;
      // A window opened from here owns Escape: the Media Loader, the RefMod
      // Stack or library, or a crop editor.
      if (document.querySelector(".mmlp-overlay, .mmrp-overlay, .mmlp-tmover")) return;
      this.close();
    };
    window.addEventListener("keydown", this.escHandler);
  }

  /** This window's own settings, framed and placed like the editor's. Only
   *  the two preferences that change what this list looks like — the editor's
   *  own live on its cog and would be noise here. */
  prefsButton() {
    const item = (key, label, hint) => {
      const box = el("input", { type: "checkbox", checked: !!this.prefs[key],
        onchange: (e) => {
          this.prefs[key] = e.target.checked;
          savePrefs(this.prefs);
          this.applyPrefs();
          this.paint();
        } });
      return el("label", { class: "mmh3p-prefitem" }, box,
        el("span", {}, el("span", { class: "mmh3p-preflabel" }, label),
          el("span", { class: "mmh3p-prefhint" }, hint)));
    };
    // Preview line count, which replaces the old on/off "taller rows"
    // toggle — that was just this set to 2, so it has nothing left to say.
    const rowsOut = el("input", { type: "number", class: "mmh3p-scaleval",
      min: "1", max: "6", step: "1", value: String(this.prefs.libPreviewRows),
      onchange: (e) => setRows(e.target.value) });
    const rowsIn = el("input", { type: "range", class: "mmh3p-scalerange",
      min: "1", max: "6", step: "1", value: String(this.prefs.libPreviewRows),
      oninput: (e) => setRows(e.target.value) });
    const setRows = (v) => {
      const n = Math.max(1, Math.min(6, Math.round(Number(v) || 1)));
      this.prefs.libPreviewRows = n;
      rowsIn.value = String(n);
      rowsOut.value = String(n);
      savePrefs(this.prefs);
      this.applyPrefs();
    };
    this.prefsMenu = el("div", { class: "mmh3p-prefmenu" },
      el("label", { class: "mmh3p-scalerow" },
        el("span", { class: "mmh3p-scalelabel" }, "Preview rows"),
        rowsIn, rowsOut),
      el("div", { class: "mmh3p-prefsep" }),
      item("libFullPrompt", "Show full prompt",
           "Off previews just what you typed. On shows the assembled " +
           "prompt, headers and generated lines included."));
    this.prefsCog = el("button", { class: "mmh3p-btn", title: "Library settings",
      onclick: (e) => {
        e.stopPropagation();
        const open = !this.prefsMenu.classList.contains("on");
        this.prefsMenu.classList.toggle("on", open);
        this.prefsCog.classList.toggle("on", open);
      } }, "\u2699");
    return el("span", { class: "mmh3p-prefwrap" }, this.prefsCog, this.prefsMenu);
  }

  /** Row height rides on a CSS variable rather than a rebuild, so dragging
   *  the slider doesn't tear down the list and lose its scroll position. */
  applyPrefs() {
    this.listEl.style.setProperty("--mmh3-librows",
      String(this.prefs.libPreviewRows || 1));
  }

  close() {
    window.removeEventListener("keydown", this.escHandler);
    // The peek lives on <body>, so it would outlive the modal that owns it.
    this.closeMediaPeek();
    this.overlay.remove();
    if (this.editor?._mmh3Lib === this) this.editor._mmh3Lib = null;
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
    // A filter pointing at a category that no longer exists (its last prompt
    // deleted, renamed away, or lost to a save elsewhere) showed an empty
    // list under a dropdown reading "All categories" — the classic
    // "my prompts are missing" report. Reset the filter instead.
    if (this.category && !this.categories.includes(this.category)) {
      this.category = "";
      this.catEdit = false;
    }
    this.catEl.replaceChildren(
      el("option", { value: "" }, "All categories"),
      ...this.categories.map((c) =>
        el("option", { value: c, selected: c === this.category }, c)));
    this.catEl.value = this.category;   // displayed value === active filter, always
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

    // Media link. Which of the three states applies is decided by CONTENT,
    // not by the loader's presetName: that label survives every edit short
    // of Unload, so it happily claims "beach set" for media that stopped
    // matching it an hour ago.
    const linkBox = el("input", { type: "checkbox" });
    const linkNew = el("input", { type: "text", class: "mmh3p-linkname",
      placeholder: "new preset name\u2026" });
    const linkRow = el("label", { class: "mmh3p-linkrow" },
      el("span", { class: "mmh3p-linktext" }, "checking media\u2026"));
    const link = { mode: "none", preset: null, digest: null, items: null };

    (async () => {
      const items = loaderItems(ed.node) || [];
      if (!items.length) { linkRow.style.display = "none"; return; }
      let match;
      try { match = await presetApi("/match", { items }); }
      catch (e2) { linkRow.style.display = "none"; return; }
      link.items = items;
      link.digest = match.digest;
      const count = `${items.length} reference` +
        `${items.length === 1 ? "" : "s"}`;
      if (match.name) {
        link.mode = "existing";
        link.preset = match.name;
        linkBox.checked = true;
        linkRow.replaceChildren(linkBox,
          el("span", { class: "mmh3p-linktext" },
            el("b", {}, "Linked to media \u2014 " + match.name),
            el("span", { class: "mmh3p-linknote" },
              `The loaded media (${count}) is saved as this preset. ` +
              "Loading this prompt will offer to load it too.")));
      } else {
        link.mode = "new";
        linkNew.value = (name.value || "").trim();
        linkRow.replaceChildren(linkBox,
          el("span", { class: "mmh3p-linktext" },
            el("b", {}, "Link to media \u2014 new preset"),
            el("span", { class: "mmh3p-linknote" },
              `The loaded media (${count}) isn't saved as a preset yet. ` +
              "Name it and it will be saved and linked to this prompt.")),
          linkNew);
      }
    })();

    // RefMod link, the same way: decided by what the stack holds (or the
    // draft's own picks), matched against the saved RefMod presets.
    const rlinkBox = el("input", { type: "checkbox" });
    const rlinkNew = el("input", { type: "text", class: "mmh3p-linkname",
      placeholder: "new preset name\u2026" });
    const rlinkRow = el("label", { class: "mmh3p-linkrow" },
      el("span", { class: "mmh3p-linktext" }, "checking RefMods\u2026"));
    const rlink = { mode: "none", preset: null, digest: null, picks: null };

    (async () => {
      let picks = [];
      try {
        if (ed.bufferMode === "draft") picks = ed.draftRefmodsView() || [];
        else { const { stack } = refmodStackFor(ed.node); picks = stack ? readStack(stack).picks : []; }
      } catch (e2) { picks = []; }
      const live = picks.filter((p) => p && p.on !== false);
      if (!live.length) { rlinkRow.style.display = "none"; return; }
      let match;
      try { match = await refmodPresetApi("/match", { picks }); }
      catch (e2) { rlinkRow.style.display = "none"; return; }
      rlink.picks = picks;
      rlink.digest = match.digest;
      const count = `${live.length} RefMod${live.length === 1 ? "" : "s"}`;
      if (match.name) {
        rlink.mode = "existing";
        rlink.preset = match.name;
        rlinkBox.checked = true;
        rlinkRow.replaceChildren(rlinkBox,
          el("span", { class: "mmh3p-linktext" },
            el("b", {}, "Linked to RefMods \u2014 " + match.name),
            el("span", { class: "mmh3p-linknote" },
              `The stack (${count}, with weights) is saved as this preset. ` +
              "Loading this prompt will offer to load it too.")));
      } else {
        rlink.mode = "new";
        rlinkNew.value = (name.value || "").trim();
        rlinkRow.replaceChildren(rlinkBox,
          el("span", { class: "mmh3p-linktext" },
            el("b", {}, "Link to RefMods \u2014 new preset"),
            el("span", { class: "mmh3p-linknote" },
              `The stack (${count}, with weights) isn't saved as a preset yet. ` +
              "Name it and it will be saved and linked to this prompt.")),
          rlinkNew);
      }
    })();

    /** Returns the link fields for the save body — media_preset and
     *  refmod_preset with their digests — creating a preset first when the
     *  user asked for a new one. */
    const resolveLink = async () => {
      const out = {};
      if (linkBox.checked && link.mode !== "none") {
        if (link.mode === "existing") {
          out.media_preset = link.preset; out.media_digest = link.digest;
        } else {
          const pname = linkNew.value.trim();
          if (!pname) throw new Error("Give the media preset a name, or untick it.");
          const res = await presetApi("/save", { name: pname, items: link.items });
          out.media_preset = res.name; out.media_digest = link.digest;
        }
      }
      if (rlinkBox.checked && rlink.mode !== "none") {
        if (rlink.mode === "existing") {
          out.refmod_preset = rlink.preset; out.refmod_digest = rlink.digest;
        } else {
          const pname = rlinkNew.value.trim();
          if (!pname) throw new Error("Give the RefMod preset a name, or untick it.");
          const res = await refmodPresetApi("/save", { name: pname, picks: rlink.picks });
          out.refmod_preset = res.name; out.refmod_digest = res.digest || rlink.digest;
        }
      }
      return out;
    };

    // Saving under a different name used to be treated as a rename, which
    // DELETED the loaded prompt — "save a variant" quietly ate the original.
    // The ambiguity is now the user's call: "Save as new" never deletes, and
    // renaming is its own, clearly-labelled button.
    const doSave = async ({ rename = false, overwrite = false } = {}) => {
      const value = name.value.trim();
      if (!value) { err.textContent = "Give it a name first."; name.focus(); return; }
      const inPlace = ed.libraryId && value === ed.libraryName;
      let linkFields;
      try { linkFields = await resolveLink(); }
      catch (e3) { err.textContent = e3.message; return; }
      const body = {
        name: value,
        category: categoryValue(),
        favorite: fav.checked,
        mode: ed.state.mode,
        refs: ed.slots.filter((s) => s.tag).length,
        prompt: generate(ed.state),
        state: ed.state,
        ...linkFields,
      };
      if (rename) { body.rename_from = ed.libraryId; body.rename = true; }
      else if (!inPlace && !overwrite) body.expect_new = true;
      try {
        const res = await libApi("/save", body);
        ed.libraryId = res.id;
        ed.libraryName = res.name;
        ed.libraryCategory = categoryValue();
        ed.noteLibraryIdentity();
        this.saveOpen = false;
        toast(`Saved "${res.name}"`);
        this.refresh();
      } catch (e2) {
        if (e2.exists) {
          // Name collision on a new save: confirm inline, never silently.
          err.replaceChildren(
            `A prompt named "${value}" already exists. `,
            el("button", { class: "mmh3p-btn",
              onclick: () => doSave({ overwrite: true }) },
              "Overwrite it"));
        } else err.textContent = e2.message;
      }
    };

    const saveBtn = el("button", { class: "mmh3p-btn primary",
      onclick: () => doSave() }, "Save");
    const renameBtn = el("button", { class: "mmh3p-btn ghost",
      style: { display: "none" },
      onclick: () => doSave({ rename: true }) }, "");
    const syncButtons = () => {
      const value = name.value.trim();
      const renaming = ed.libraryId && ed.libraryName
        && value && value !== ed.libraryName;
      saveBtn.textContent = renaming ? "Save as new" : "Save";
      renameBtn.style.display = renaming ? "" : "none";
      if (renaming) {
        renameBtn.textContent = `Rename "${ed.libraryName}"`;
        renameBtn.title = `"${ed.libraryName}" becomes "${value}" — ` +
          "no second copy is kept";
      }
      err.textContent = "";        // typing resets a stale collision notice
    };
    name.addEventListener("input", syncButtons);
    syncButtons();

    name.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); });
    catNew.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); });
    setTimeout(() => { name.focus(); name.select(); }, 0);

    return el("div", { class: "mmh3p-saveform" },
      el("div", { class: "mmh3p-saverow" },
        name, category, catNew,
        el("label", { class: "mmh3p-savefav" }, fav, "favourite"),
        saveBtn, renameBtn,
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.saveOpen = false; this.paint(); } }, "Cancel")),
      linkRow,
      rlinkRow,
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
          ...libMarks(e),
          e.media_preset
            ? this.mediaBadge(e.media_preset, e.media_counts)
            : null,
          e.refmod_preset
            ? el("span", { class: "mmh3p-libmedia", title: "Linked RefMod preset: loading this prompt offers to load it too" },
                el("span", { class: "mmh3p-libkind" }, "\u25c8", e.refmod_count != null ? String(e.refmod_count) : ""),
                el("span", { class: "mmh3p-libsep" }, "\u00b7"),
                el("span", { class: "mmh3p-libpname" }, e.refmod_preset))
            : null,
          el("span", { class: "mmh3p-libage" }, ago(e.updated))),
        // previewFor(), not a bare .mmh3p-libprev: this fork's library has a
        // preview-rows setting, and the row count decides how much is shown.
        this.previewFor(e)),
      el("div", { class: "mmh3p-libacts" },
        el("button", { class: "mmh3p-btn primary",
          onclick: () => this.askLoad(e) }, "Load"),
        el("button", { class: "mmh3p-btn ghost", title: "Delete",
          onclick: () => { this.pending = { id: e.id, action: "delete" };
            this.paint(); } }, "\u2715")))));
    this.listEl.replaceChildren(...kids);
  }

  /** The preview line. Coloured with the same pass the editor's own preview
   *  and the node's prompt bar use, so a tag reads the same everywhere. No
   *  resolver: this listing has no node to check what is actually loaded, so
   *  every tag is drawn as defined rather than guessing. */
  previewFor(entry) {
    // preview_user is empty on records saved before the raw fields were
    // stored, so fall back rather than showing an empty row for them.
    const text = (!this.prefs.libFullPrompt && entry.preview_user)
      || entry.preview || "";
    const box = el("div", { class: "mmh3p-libprev" });
    if (text) box.innerHTML = paintTags(text);
    else box.textContent = "(empty)";
    return box;
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
      // Loading = clean against that entry; the active buffer records it.
      this.editor.noteLibraryIdentity();
      if (data.media_preset) {
        this.editor.offerLinkedMedia(data.media_preset, data.media_digest);
      }
      if (data.refmod_preset) {
        this.editor.offerLinkedRefmods(data.refmod_preset, data.refmod_digest);
      }
      this.editor.render();
      toast(`Loaded "${entry.name}"`);
      this.close();
    } catch (err) { toast(`Load failed: ${err.message}`); }
  }

  /** The linked-preset badge, with a hover preview of what it holds.
   *
   *  The contents are fetched once per preset per session and cached: the
   *  route probes files it hasn't got metadata for, and a hover shouldn't
   *  pay that twice. Everything here is read-only — a failed fetch just
   *  means no preview, never a broken row. */
  mediaBadge(presetName, counts) {
    const badge = el("span", { class: "mmh3p-libmedia" });
    // Kind counts instead of a label: they say "this is media" AND what
    // media, in the same space. Zero kinds are omitted, so an all-pictures
    // set reads "3 pictures" rather than padding with empty categories.
    // Glyphs match the rest of the pack — the loader already counts audio
    // with the same note, and the media peek marks video with the same
    // play mark.
    if (counts) {
      for (const k of ["picture", "video", "audio"]) {
        if (!counts[k]) continue;
        badge.append(el("span", { class: "mmh3p-libkind" },
          kindIcon(k), String(counts[k])));
      }
      if (badge.childElementCount) {
        badge.append(el("span", { class: "mmh3p-libsep" }, "\u00b7"));
      }
    }
    badge.append(el("span", { class: "mmh3p-libpname" }, presetName));
    // Deliberately no title attribute anywhere on this badge: the OS
    // tooltip appears over the preview and hides the thing you hovered for.
    // The preview says it all instead.
    let timer = null;
    const open = async () => {
      let info = Library._peekCache.get(presetName);
      if (!info) {
        try {
          info = await presetApi("/load", { name: presetName });
        } catch (e) {
          info = { missing: null };          // remember the failure too
        }
        Library._peekCache.set(presetName, info);
      }
      if (!badge.isConnected || badge !== this._peekBadge) return;
      this.closeMediaPeek();
      const box = el("div", { class: "mmh3p-peek mmh3p-mediapeek" });
      if (info.missing === null) {
        box.append(el("div", { class: "mmh3p-peekmeta" },
          el("div", { class: "mmh3p-peeksrc" },
            `\u201c${presetName}\u201d couldn't be read \u2014 it may have ` +
            "been deleted since this prompt was saved.")));
      } else {
        const items = info.items || [];
        const grid = el("div", { class: "mmh3p-peekgrid" });
        items.slice(0, 9).forEach((it) => {
          const url = loaderViewURL(it.file);
          grid.append(el("div", { class: "mmh3p-peekcell" },
            it.kind === "picture"
              ? el("img", { src: url, loading: "lazy" })
              : el("span", { class: "mmh3p-peekkind" }, kindIcon(it.kind)),
            el("span", { class: "mmh3p-peekname" }, it.name || it.file)));
        });
        const counts = ["picture", "video", "audio"].map((k) => {
          const n = items.filter((i) => i.kind === k).length;
          return n ? `${n} ${k}${n === 1 ? "" : "s"}` : null;
        }).filter(Boolean).join(" \u00b7 ");
        box.append(grid,
          el("div", { class: "mmh3p-peekmeta" },
            el("div", { class: "mmh3p-peekrow" },
              el("span", { class: "mmh3p-libmedia" },
                el("span", { class: "mmh3p-libpname" }, presetName)),
              el("span", { class: "mmh3p-peekcite" },
                counts || "empty")),
            info.category
              ? el("div", { class: "mmh3p-peeksrc" },
                  "Category: " + info.category)
              : null,
            items.length > 9
              ? el("div", { class: "mmh3p-peeksrc" },
                  `\u2026 and ${items.length - 9} more`)
              : null,
            (info.missing || []).length
              ? el("div", { class: "mmh3p-peeksrc" },
                  `\u26a0 ${info.missing.length} file(s) missing`)
              : null,
            el("div", { class: "mmh3p-peeklink" },
              "Linked \u2014 loading this prompt offers to load this media.")));
      }
      const r = badge.getBoundingClientRect();
      box.style.left = `${Math.max(8,
        Math.min(r.left, window.innerWidth - 268))}px`;
      // Flip above when there isn't room below, so it never runs off-screen.
      const below = window.innerHeight - r.bottom;
      if (below < 220) box.style.bottom = `${window.innerHeight - r.top + 6}px`;
      else box.style.top = `${r.bottom + 6}px`;
      box.addEventListener("mouseenter", () => clearTimeout(this._mpClose));
      box.addEventListener("mouseleave", () => this.closeMediaPeek());
      document.body.append(box);
      this._mediaPeek = box;
    };
    badge.addEventListener("mouseenter", () => {
      this._peekBadge = badge;
      timer = setTimeout(open, 320);
    });
    badge.addEventListener("mouseleave", () => {
      clearTimeout(timer);
      this._peekBadge = null;
      this._mpClose = setTimeout(() => this.closeMediaPeek(), 180);
    });
    return badge;
  }

  closeMediaPeek() {
    clearTimeout(this._mpClose);
    this._mediaPeek?.remove();
    this._mediaPeek = null;
  }

  async remove(entry) {
    this.pending = null;
    try {
      await libApi("/delete", { id: entry.id });
      this.entries = this.entries.filter((x) => x !== entry);
      this.paint();          // the row disappears immediately…
      this.refresh();        // …and the category list follows the server
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
    this.libraryId = null;
    this.libraryName = "";
    this.libraryCategory = "";
    this.clearPending = false;
    this.closePending = false;
    this.prefs = loadPrefs();
    // A global preference now (see PREF_DEFAULTS), not per-node — the
    // sidebar is the standard layout, so there's no reason for one node to
    // remember it differently than another.
    this.sidebar = !this.prefs.classicLayout;
    setNamePrefix(this.prefs.namePrefix);
    this.prefsOpen = false;
    // Draft mode. "live" edits the node's prompt as ever; "draft" edits a
    // disk-backed scratch buffer that is never queued or executed. The two
    // buffers swap wholesale — state, library identity, session baseline —
    // so neither can bleed into the other.
    this.bufferMode = "live";
    this.draftEntry = null;          // the disk entry, once fetched
    this.commitPending = false;      // commit decision strip showing
    this.pullPending = false;        // pull-from-Live choice strip showing
    this.linkOffer = null;           // linked media preset awaiting a yes/no
    this.draftStale = false;         // media snapshot diverged from loader
    this._liveHeld = null;           // live session edits parked during draft
    // What the node currently holds, to tell "edited" from "just looked".
    this.openedWith = JSON.stringify(this.state);
    injectCSS();
    // Same affordance the loader panel has: a handle for console diagnostics.
    node._mmh3Editor = this;
    this.build();
    this.render();
    document.body.append(this.overlay);
    this.applyScale();
    this.applyHighlight();
    // Reopen where you left off: if this node's draft was active when the
    // modal last closed, restore draft mode once the entry arrives.
    draftApi("/load", { id: draftIdFor(node) }).then((res) => {
      this.node._mmh3DraftActive = !!res.exists;
      updateSummary(this.node);
      if (res.exists) {
        this.draftEntry = res.draft;
        if (res.draft.mode === "draft" && this.bufferMode === "live" &&
            this.overlay.isConnected) {
          this.enterDraft();
        }
      }
    }).catch(() => { /* drafts unavailable: live mode works as ever */ });
  }

  /* ---------- insertion ---------- */
  /** Insert a snippet at the caret.
   *
   *  opts.newline  — only for [Shot N]; see below.
   *  opts.wrap     — `text` is an opening tag whose closing half is supplied
   *                  here. Any selected text is kept and wrapped rather than
   *                  overwritten; with no selection the caret lands between
   *                  the two halves, ready to type. */
  insert(text, opts = {}) {
    // opts.target pins the insertion to a specific field, for controls that
    // belong to one section rather than to wherever the caret happens to be.
    const t = opts.target || this.lastFocus;
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
    const base = before.length + pad.length;

    if (opts.wrap) {
      const held = t.value.slice(start, end);
      t.value = before + pad + text + held + opts.wrap + after;
      // Selection wrapped: leave it selected so it can be re-wrapped or
      // retyped. Nothing selected: sit between the halves.
      t.selectionStart = base + text.length;
      t.selectionEnd = base + text.length + held.length;
    } else {
      t.value = before + pad + text + after;
      const dPos = text.indexOf("</d>");
      t.selectionStart = t.selectionEnd =
        dPos >= 0 ? base + dPos : base + text.length;
    }
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
    // Collapsible: on a long prompt the list can crowd out the preview above
    // it, and once you have read a warning you mostly want the room back.
    // The count stays on the header while collapsed, so nothing disappears
    // silently. Remembered per user, like the editor's other preferences.
    this.issuesCount = el("span", { class: "mmh3p-issuecount" });
    this.issuesHead = el("button", { class: "mmh3p-issuehead",
      title: "Show or hide the checks",
      onclick: () => this.toggleIssues() },
      el("span", { class: "mmh3p-issuecaret" }, "\u25be"),
      el("span", {}, "checks"), this.issuesCount);
    this.issuesBox = el("div", { class: "mmh3p-issuebox" },
      this.issuesHead, this.issuesEl);
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
      title: "Close without giving the node these changes",
      onclick: () => this.requestClose({ discard: true }) }, "Cancel");
    const saveBtn = this.saveBtn = el("button",
      { class: "mmh3p-btn primary", onclick: () => this.save() },
      "Save to node");

    const guideBtn = el("button", { class: "mmh3p-btn mmh3p-guidebtn",
      // No longer "(PDF)": 1.6.1 replaced it with a searchable HTML page.
      title: "Open the bundled MiniMax H3 Video Prompt Writing Guide",
      onclick: () => window.open(
        new URL("./video-prompt-writing-guide.html", import.meta.url).href,
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
            this.titleTag = el("span", { class: "mmh3p-titletag" }, ""),
            el("small", {}, "guide-conformant output")),
          this.modeToggle = el("button",
            { class: "mmh3p-btn mmh3p-modetoggle",
              title: "Switch to the draft scratchpad \u2014 the node keeps "
                + "the Live prompt",
              onclick: () => this.toggleDraftMode() }, "Draft \u25b6"),
          el("button", { class: "mmh3p-btn",
            title: "Open the RefMod Stack this prompt's references come from",
            onclick: () => this.openRefMods() }, "\u25c8 RefMods"),
          el("button", { class: "mmh3p-btn",
            title: "Browse saved prompts",
            onclick: () => {
              if (raiseIfOpen(this._mmh3Lib?.overlay)) return;
              new Library(this);
            } }, "\u2630 Library"),
          el("button", { class: "mmh3p-btn mmh3p-danger",
            title: "Clear every field and start over",
            onclick: () => { this.clearPending = !this.clearPending; this.render(); } },
            "Clear"),
          guideBtn,
          this.modeBar,
          // Opens over the top rather than handing over. The editor used to
          // close itself first, which meant a trip through the
          // unsaved-changes strip just to glance at the media \u2014 and in draft
          // mode there is a second reference set to edit, which a handover
          // could not express at all. Escape belongs to whichever overlay is
          // on top, and reference tags refresh on close since adding media
          // renumbers them.
          el("button", { class: "mmh3p-btn",
            title: "Open the media loader without leaving the editor",
            onclick: () => this.openMedia() }, "\u2750 Media Loader"),
          // Settings sits immediately left of the close button, matching the
          // prompt library's header. It used to sit mid-row between Clear and
          // the guide, which put the one control that isn't about THIS prompt
          // in among the ones that are.
          this.prefsButton(),
          el("button", { class: "mmh3p-x",
            onclick: () => this.requestClose() }, "\u2715"),
        ),
        this.modeSends,
        // Draft status sits OUTSIDE the scrolling form on purpose: most of
        // the work happens far down in the description fields, and a banner
        // that scrolls away stops answering "am I editing Live?" exactly
        // when it matters most. The commit decision lands in the same slot,
        // so the choice appears where the eye already is.
        this.draftSlot = el("div", { class: "mmh3p-draftslot" }),
        el("div", { class: "mmh3p-body" + (this.sidebar ? " sidebar" : "") },
          this.railEl,
          this.formEl,
          el("div", { class: "mmh3p-side" },
            this.previewEl, this.issuesBox,
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
      // On a tag: replace, swap or remove it. A selection reaching beyond
      // that one tag keeps the phrase menu.
      const hit = this.tagUnderPointer(e, box);
      if (hit && (b <= a || (a >= hit.start && b <= hit.end))) {
        e.preventDefault();
        this.openTagMenu(e.clientX, e.clientY, box, hit);
        return;
      }
      if (b <= a) return;                       // no selection: native menu
      e.preventDefault();
      this.openCtx(e.clientX, e.clientY, box.value.slice(a, b));
    });
    this.formEl.addEventListener("input", () => {
      this.updatePreview();
      // Covers every route a speaker marker can arrive by — the buttons
      // here, a rail drop, or simply typing "(S2)" by hand.
      this.refreshDialogue();
    });
    // Dropping a rail card onto a textarea inserts the tag where it lands.
    this.formEl.addEventListener("drop", (e) => {
      const t = e.target;
      if (!t.matches?.("textarea, input[type=text]")) return;
      setTimeout(() => {
        this.lastFocus = t;
        this.updatePreview();
      }, 0);
    });
    // Both overlays listen on window, and this one registered first — so
    // without this guard Escape closed the editor out from under whatever
    // was stacked on top of it.
    // Goes through requestClose, not close: Escape used to bypass both
    // preferences entirely, which made "Off means ✕, Cancel and Escape
    // discard your edits silently" false — it discarded silently either way.
    this.escHandler = (e) => {
      if (e.key !== "Escape") return;
      // A window opened from here owns Escape: the Media Loader, the RefMod
      // Stack or library, or a crop editor.
      if (document.querySelector(".mmlp-overlay, .mmrp-overlay, .mmlp-tmover")) return;
      if (this._tagMenu) { this.closeTagMenu(); return; }
      // A strip is already asking a question; Escape shouldn't answer it.
      if (this.closePending || this.clearPending || this.linkOffer) return;
      this.requestClose();
    };
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
    // Draft edits autosave to disk, so they are never "unsaved". What the
    // close guard protects in draft mode is the parked LIVE session.
    if (this.bufferMode === "draft") {
      try {
        return !!this._liveHeld &&
          JSON.stringify(this._liveHeld.state) !== this._liveHeld.openedWith;
      } catch (e) { return false; }
    }
    try { return JSON.stringify(this.state) !== this.openedWith; }
    catch (e) { return false; }
  }

  /** Close, but ask first if there's unsaved work.
   *
   *  With "save to node when closing" on, the ordinary exits just save —
   *  except in draft mode, where the parked Live session is still at risk
   *  and a draft must never reach the node by closing. `discard: true` is
   *  the Cancel button, which means the opposite and always confirms. */
  requestClose({ discard = false } = {}) {
    const drafting = this.bufferMode === "draft";
    if (!discard && this.prefs.saveOnClose && !drafting) {
      if (this.isDirty()) this.writeNode();
      this.close();
      return;
    }
    // Cancel is destructive by definition, so it asks whenever there is
    // something to lose, even if the warning preference is off.
    const ask = discard ? this.isDirty()
                        : (this.prefs.warnUnsaved && this.isDirty());
    if (!ask) {
      if (discard) this.state = JSON.parse(this.openedWith);
      this.close();
      return;
    }
    if (drafting) {
      // The at-risk work is the parked live session; show it, then ask.
      this.exitDraft();
    }
    this.closePending = true;
    this.render();
  }

  prefsButton() {
    const pct = (v) => `${Math.round(v * 100)}%`;
    // Deliberately not live: resizing the window moves this menu with it, so
    // the slider would slide out from under the pointer mid-drag.
    const pending = { windowScale: this.prefs.windowScale,
                      textScale: this.prefs.textScale,
                      chipScale: this.prefs.chipScale };
    const inputs = {};
    const outs = {};
    const dirty = () => scaleApply.classList.toggle("primary",
      pending.windowScale !== this.prefs.windowScale ||
      pending.textScale !== this.prefs.textScale ||
      pending.chipScale !== this.prefs.chipScale);

    const maxFor = (key) => key === "textScale" ? TEXT_SCALE_MAX
      : key === "chipScale" ? CHIP_SCALE_MAX : SCALE_MAX;

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
    const setScale = (w, t, c) => {
      this.prefs.windowScale = w;
      this.prefs.textScale = t;
      this.prefs.chipScale = c;
      pending.windowScale = w; pending.textScale = t; pending.chipScale = c;
      for (const [key, v] of [["windowScale", w], ["textScale", t],
                              ["chipScale", c]]) {
        inputs[key].value = String(Math.round(v * 100));
        outs[key].value = String(Math.round(v * 100));
      }
      savePrefs(this.prefs);
      this.applyScale();
      scaleApply.classList.remove("primary");
    };
    const scaleApply = el("button", { class: "mmh3p-btn",
      onclick: () => setScale(pending.windowScale, pending.textScale,
        pending.chipScale) }, "Apply");
    const scaleReset = el("button", { class: "mmh3p-btn",
      onclick: () => setScale(1, 1, 1) }, "Reset");

    const rows = {};
    const item = (key, label, hint) => {
      const box = el("input", { type: "checkbox", checked: !!this.prefs[key],
        onchange: (e) => {
          this.prefs[key] = e.target.checked;
          savePrefs(this.prefs);
          if (key === "highlightTags") this.applyHighlight();
          if (key === "classicLayout") this.applySidebarPref();
          if (key === "tallWindow") this.applyScale();
          if (key === "hideHints") this.applyHints();
          syncPrefDeps();
        } });
      const hintEl = el("span", { class: "mmh3p-prefhint" }, hint);
      const row = el("label", { class: "mmh3p-prefitem" }, box,
        el("span", {}, el("span", { class: "mmh3p-preflabel" }, label), hintEl));
      rows[key] = { box, row, hintEl, hint };
      return row;
    };

    /** "Warn about unsaved changes" has nothing to say once closing saves,
     *  so it greys out rather than sitting there implying it still applies.
     *  The stored value is left alone — untick save-on-close and the warning
     *  comes back exactly as it was. */
    const syncPrefDeps = () => {
      const w = rows.warnUnsaved;
      if (!w) return;
      const off = !!this.prefs.saveOnClose;
      w.box.disabled = off;
      w.row.classList.toggle("off", off);
      w.hintEl.textContent = off
        ? "Not used while closing saves \u2014 except in draft mode, and " +
          "Cancel still asks before discarding."
        : w.hint;
    };
    // Shown so a bug report can name the exact build rather than a version
    // number that may have covered several.
    // Drafts are internal state that outlives code changes, so there has to
    // be a way to wipe them from the UI rather than by deleting a file.
    const draftLine = el("span", { class: "mmh3p-drafthint" }, "counting\u2026");
    const draftRow = el("div", { class: "mmh3p-draftadmin" });
    const paintDrafts = (count) => {
      if (!count) {
        draftLine.textContent = "No saved drafts.";
        draftRow.replaceChildren(draftLine);
        return;
      }
      draftLine.textContent =
        `${count} saved draft${count === 1 ? "" : "s"} across all workflows.`;
      draftRow.replaceChildren(draftLine,
        el("button", { class: "mmh3p-btn",
          title: "Discard every saved draft on this machine",
          onclick: () => {
            draftRow.replaceChildren(
              el("span", { class: "mmh3p-drafthint" },
                "Discard all drafts? This can't be undone."),
              el("button", { class: "mmh3p-btn mmh3p-danger", onclick: async () => {
                try {
                  const res = await draftApi("/clear_all", {});
                  this.draftEntry = null;
                  this.node._mmh3DraftActive = false;
                  updateSummary(this.node);
                  if (this.bufferMode === "draft") this.exitDraft();
                  toast(`Cleared ${res.cleared} draft${
                    res.cleared === 1 ? "" : "s"}`);
                  paintDrafts(0);
                } catch (e) { toast(`Couldn't clear drafts: ${e.message}`); }
              } }, "Discard all"),
              el("button", { class: "mmh3p-btn",
                onclick: () => paintDrafts(count) }, "Cancel"));
          } }, "Clear all"));
    };
    api.fetchApi("/minimax_h3_plus/drafts")
      .then((r) => r.json())
      .then((d) => paintDrafts(d.count || 0))
      .catch(() => { draftLine.textContent = "Drafts unavailable."; });

    const version = el("div", { class: "mmh3p-prefversion" }, "version \u2026");
    api.fetchApi("/minimax_h3_plus/capabilities")
      .then((r) => r.json())
      .then((c) => { version.textContent = `Fantastic H3 \u2014 v${c.version || "?"}`; })
      .catch(() => { version.textContent = "version unavailable"; });

    const menu = el("div", { class: "mmh3p-prefmenu" },
      slider("windowScale", "Window size"),
      slider("textScale", "Text size"),
      slider("chipScale", "Chip size"),
      el("div", { class: "mmh3p-scalefoot" }, scaleReset, scaleApply),
      el("div", { class: "mmh3p-prefsep" }),
      item("highlightTags", "Highlight tags and dialogue",
           "Off gives plain text fields; hovering a tag still shows its " +
           "preview."),
      item("classicLayout", "Classic top-strip layout",
           "Off (default) keeps reference media in a column down the left " +
           "edge. On puts it back in a strip across the top."),
      item("tallWindow", "Full-height window",
           "Fills the screen top to bottom, less a small margin. Window " +
           "size then only sets the width."),
      item("railPeek", "Preview tags on the media strip",
           "Hovering a tag lights up its card's preview in the media " +
           "strip, instead of a small panel at the cursor."),
      item("hideHints", "Hide help captions",
           "Moves the explanatory line under each section onto that " +
           "section's hover tooltip. Live readouts stay put."),
      el("label", { class: "mmh3p-prefitem mmh3p-prefselect" },
        el("select", { "aria-label": "Subject name prefix",
          onchange: (e) => {
            this.prefs.namePrefix = e.target.value;
            savePrefs(this.prefs);
            setNamePrefix(this.prefs.namePrefix);
            this.render();
          } },
          NAME_PREFIXES.map((c) => el("option", { value: c, selected: c === this.prefs.namePrefix }, `${c}Name`))),
        el("span", {},
          el("span", { class: "mmh3p-preflabel" }, "Subject name prefix"),
          el("span", { class: "mmh3p-prefhint" },
            "Typed before a subject's name, it stands for \u201c<Subject N> Name\u201d. " +
            "Changing it doesn't rewrite shorthand you've already typed."))),
      item("closeOnBackdrop", "Click outside to close",
           "Off means only \u2715, Cancel and Escape close the window."),
      item("saveOnClose", "Save to node when closing",
           "\u2715, Escape and clicking outside give the node your changes " +
           "instead of asking. Cancel still discards, and drafts are never " +
           "written to the node by closing."),
      item("warnUnsaved", "Warn about unsaved changes",
           "Off means \u2715, Cancel and Escape discard your edits silently."),
      el("div", { class: "mmh3p-prefsep" }),
      draftRow,
      version);
    syncPrefDeps();
    this.prefsMenu = menu;
    // Framed like every other button in the bar. It used to wear .mmh3p-x,
    // the frameless treatment reserved for the close ✕, which left it the one
    // control in the row without a border.
    this.prefsCog = el("button", { class: "mmh3p-btn", title: "Editor settings",
      onclick: (e) => { e.stopPropagation(); this.togglePrefs(); } }, "\u2699");
    return el("span", { class: "mmh3p-prefwrap" }, this.prefsCog, menu);
  }

  /** Show or hide the chips without touching layout: in plain mode the
   *  textarea paints its own text and the mirror goes transparent, so the
   *  spans are still there to hover even though you can't see them. */
  applyHighlight() {
    const plain = !this.prefs.highlightTags;
    (this._chipWraps || []).forEach((w) => w.classList.toggle("plain", plain));
  }

  /** Flips the media rail between the sidebar and the classic top strip,
   *  same as the old Sidebar button used to. */
  applySidebarPref() {
    this.sidebar = !this.prefs.classicLayout;
    this.overlay.querySelector(".mmh3p-body")
      .classList.toggle("sidebar", this.sidebar);
    this.railEl.replaceChildren();
    this.closePeek();
    this.render();
    // railExtra (see applyScale()) only applies in sidebar mode, so leaving
    // classic layout has to give that width back.
    this.applyScale();
  }

  /** Window scale changes the modal's box; text scale zooms its contents. */
  applyScale() {
    const modal = this.overlay?.querySelector(".mmh3p-modal");
    if (!modal) return;
    const w = clampScale(this.prefs.windowScale);
    const t = clampScale(this.prefs.textScale, TEXT_SCALE_MAX);
    const chip = clampScale(this.prefs.chipScale, CHIP_SCALE_MAX);
    // Bigger chips need a wider rail column (--mmh3-railw in the stylesheet,
    // same formula), which would otherwise come out of the grid's flexible
    // middle column — the form shrinking every time this slider moves. Grown
    // onto the modal's own width instead, so the rail gets the room without
    // taking it from anything else. 164 is --mmh3-railw's own value at 1x.
    const railExtra = this.sidebar ? Math.max(0, Math.round(128 * chip + 36) - 164) : 0;
    modal.style.width = `min(${Math.round(1240 * w) + railExtra}px, 95vw)`;
    // Tall mode hands the height to the viewport, so the slider governs
    // width alone — scaling the height as well would immediately clamp back
    // against the same margin and make the slider look broken.
    modal.style.height = this.prefs.tallWindow
      ? `${100 - TALL_MARGIN_VH * 2}vh`
      : `min(${Math.round(860 * w)}px, 92vh)`;
    // Font size only. zoom scaled the layout as well, which changed how much
    // fitted rather than how readable it was.
    document.documentElement.style.setProperty("--mmh3-fs", String(t));
    document.documentElement.style.setProperty("--mmh3-chip",
      String(clampScale(this.prefs.chipScale, CHIP_SCALE_MAX)));
  }

  /** Show or hide the checks list, remembering the choice. */
  toggleIssues(force) {
    const shut = force === undefined ? !this.prefs.issuesCollapsed : !!force;
    this.prefs.issuesCollapsed = shut;
    savePrefs(this.prefs);
    this.issuesBox?.classList.toggle("collapsed", shut);
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
          onclick: () => {
            this.closePending = false;
            this.render();
          } },
          "Keep editing")));
  }

  close() {
    this.closePeek();
    this.closeCtx();
    this.hidePhrasePeek();
    this.hideTagPeek();
    window.removeEventListener("keydown", this.escHandler);
    // The DRAFT buffer flushes to disk with the mode it closed in, so the
    // editor reopens where you left off. The LIVE buffer carries nothing
    // over: closing without saving discards live edits — which is what
    // Cancel says on the tin. Keeping a live draft here made the editor
    // look like it autosaved: reopening showed changes the node didn't
    // hold. Draft mode is that idea done right — labeled, tinted, and
    // never executable.
    if (this.draftEntry) this.flushDraftSave(this.bufferMode);
    this.node._mmh3Draft = null;
    this.overlay.remove();
  }

  /** Write the active state onto the node's widgets. The one and only path
   *  by which anything becomes executable. */
  writeNode() {
    const pw = this.node.widgets?.find((w) => w.name === "prompt_text");
    const sw = this.node.widgets?.find((w) => w.name === "builder_state");
    if (pw) pw.value = generate(this.state);
    if (sw) sw.value = JSON.stringify(this.state);
    this.node._mmh3Draft = null;
    this.closePending = false;
    this.openedWith = JSON.stringify(this.state);
    updateSummary(this.node);
    // A mode changed in here can change the media panel's shape, and with it
    // whether the node's prompt bar expands and whether the panel is sized to
    // fit the node — the node's own hooks know, this method does not. The
    // node's small mode-switcher button already does this on every change;
    // this is the far more common way a mode actually gets changed, and it
    // was the one path that skipped it, which is what left the on-node
    // interface showing the previous mode's layout until something
    // unrelated (a resize drag, a reload) happened to nudge it.
    try {
      this.node._mmlPanel?.render?.();
      this.node._mmlOnCommit?.();
    } catch (e) { /* cosmetic */ }
    try {
      this.node.setDirtyCanvas?.(true, true);
      app.graph.setDirtyCanvas(true, true);
    } catch (e) { /* Vue redraws itself */ }
  }

  save() {
    // The button is disabled in draft mode; this is the belt to that brace,
    // since a keyboard shortcut or a stale handler could still land here.
    if (this.bufferMode === "draft") {
      toast("This is a draft \u2014 use Commit to Live to put it on the node");
      return;
    }
    this.writeNode();
    toast("Saved to node");
    this.close();
  }

  /** Open the Media Loader's own modal on top of this editor.
   *
   *  It's the same LoaderPanel the node hosts — mounting it in a body
   *  overlay is all "Open loader…" does — so this needs no new UI, just a
   *  refresh afterwards: adding or reordering media renumbers the tags this
   *  editor renders. */
  /** The RefMods counterpart of openMedia: the stack's own panel in a
   *  window, with its library and Create a click away. */
  openRefMods() {
    let { stack, why } = refmodStackFor(this.node);
    if (!stack && why === "other") {
      toast("This prompt's RefMods come from a node that isn't a RefMod Stack, " +
        "so there's no stack panel to open.", 6000);
      return;
    }
    if (!stack) stack = addRefModStack(this.node, { focus: false });
    if (!stack) return;
    if (this.bufferMode === "draft") { this.openDraftRefMods(stack); return; }
    openStackModal(stack, { onClose: () => {
      // The stack may have changed under a parked draft: refresh tags and staleness.
      this.draftRefmodsStale = this._refmodsDiverged();
      this.refreshSlots(); this.render();
    } });
  }

  /** The same stack panel, pointed at this draft's RefMods instead of the
   *  node's stack: it edits a stand-in that holds the draft's picks, and
   *  the real stack is only written when the draft is committed. Copy-on-
   *  write like the media: looking without changing anything forks nothing. */
  openDraftRefMods(stack) {
    if (!this.draftEntry) return;
    const live = readStack(stack);
    const start = this.draftRefmodsView() || live.picks;
    const startKey = stableStringify(start);
    const stub = {
      title: "Draft RefMods \u2014 applied to the stack on commit",
      widgets: [{ name: "stack_state", value: JSON.stringify({ picks: JSON.parse(JSON.stringify(start)), budget: live.budget }) }],
    };
    openStackModal(stub, { onClose: () => {
      const picks = readStack(stub).picks;
      if (this.draftEntry && (this.draftRefmods() || stableStringify(picks) !== startKey)) {
        const v = validateDraftRefmods(JSON.parse(JSON.stringify(picks)));
        this.draftEntry.refmods = v.items || [];
        if (v.dropped) this.draftDropped = (this.draftDropped || 0) + v.dropped;
        this.draftRefmodsStale = this._refmodsDiverged();
        this.flushDraftSave();
      }
      this.refreshSlots();
      this.render();
    } });
  }

  openMedia() {
    // Prompt Studio owns its panel, so the media lives on this very node;
    // mediaSource() resolves that without caring which shape it is.
    const loader = mediaSource(this.node)?.owner;
    if (!loader) { toast("This node has no reference media"); return; }
    if (this.bufferMode === "draft") { this.openDraftMedia(loader); return; }
    openLoaderModal(loader, { title: "MiniMax H3 \u2014 media", onClose: () => {
      // Media may have changed under us: refresh tags.
      this.draftStale = this._mediaDiverged();
      this.render();
    } });
  }

  /** The same LoaderPanel, pointed at this draft's media instead of the
   *  node's. Nothing about Live moves while this is open — and because the
   *  overlay covers the canvas, the node's own panel can't be reached at the
   *  same time, so the two can never be edited at once. */
  openDraftMedia(loader) {
    const store = {
      // Copy-on-write: until the draft is touched it simply shows Live, so
      // opening the panel to look at it doesn't fork anything.
      read: () => this.draftView() || loaderItems(this.node) || [],
      write: (items) => {
        if (!this.draftEntry) return;
        const v = validateDraftMedia(JSON.parse(JSON.stringify(items)));
        this.draftEntry.media = v.items;
        if (v.dropped) this.draftDropped = (this.draftDropped || 0) + v.dropped;
        this.draftStale = this._mediaDiverged();
        this.flushDraftSave();
        this.refreshSlots();
        this.render();
      },
    };
    openLoaderModal(loader, {
      store,
      draft: true,
      storeLabel: "Draft media",
      note: "Editing this draft's own reference set. The node keeps its "
        + "Live media until you commit the draft.",
      onClose: () => {
        this.draftStale = this._mediaDiverged();
        this.refreshSlots();
        this.render();
      },
    });
  }

  /* ---------- draft mode ---------- */

  /** The two buffers swap wholesale. Everything that defines "what am I
   *  editing" travels together: state, library identity, session baseline. */
  _snapshotBuffer() {
    return {
      state: this.state,
      libraryId: this.libraryId,
      libraryName: this.libraryName,
      libraryCategory: this.libraryCategory,
      openedWith: this.openedWith,
      pins: this.pins,
      autoPin: this.autoPin,
    };
  }

  _restoreBuffer(b) {
    this.state = b.state;
    this.libraryId = b.libraryId;
    this.libraryName = b.libraryName;
    this.libraryCategory = b.libraryCategory;
    this.openedWith = b.openedWith;
    this.pins = b.pins || [];
    this.autoPin = b.autoPin || null;
  }

  enterDraft() {
    if (this.bufferMode === "draft") return;
    // Unsaved live edits are parked in memory, untouched and unwarned —
    // they're fully reversible, and the close guard still covers the exit.
    this._liveHeld = this._snapshotBuffer();
    this.bufferMode = "draft";
    this.pullPending = false;

    const e = this.draftEntry;
    if (e && e.state) {
      // From disk: normalise before it reaches the renderer.
      e.state = normaliseState(e.state);
      // Pre-split entries put the auto-frozen snapshot in `media`, which is
      // now the "applied on commit" field. Demote it: nothing auto-captured
      // should ever be written back to the loader.
      if (e.mediaBase === undefined) {
        e.mediaBase = Array.isArray(e.media) && e.media.length ? e.media : null;
        e.media = null;
      }
      // Both media fields come from disk unvalidated. Repair them here and
      // remember what had to go, so the banner can say so — a draft that
      // silently loses a reference is the bug this guards against.
      const vm = validateDraftMedia(e.media);
      const vb = validateDraftMedia(e.mediaBase);
      e.media = vm.items;
      e.mediaBase = vb.items;
      // RefMods follow the same two-field split as media. A draft written
      // before RefMods existed simply has neither, and follows the stack.
      const vr = validateDraftRefmods(e.refmods);
      const vrb = validateDraftRefmods(e.refmodsBase);
      e.refmods = Array.isArray(e.refmods) ? (vr.items || []) : null;
      e.refmodsBase = vrb.items;
      this.draftDropped = vm.dropped + vb.dropped + vr.dropped + vrb.dropped;
      if (this.draftDropped) {
        console.warn("[MiniMaxH3 PromptBuilder] draft media: discarded " +
          `${this.draftDropped} unusable item(s)`);
      }
      this._restoreBuffer({
        state: e.state,
        libraryId: e.savedTo?.libraryId || null,
        libraryName: e.savedTo?.libraryName || "",
        libraryCategory: e.savedTo?.libraryCategory || "",
        openedWith: JSON.stringify(e.state),
        pins: [], autoPin: null,
      });
    } else {
      // A fresh draft starts blank in the current mode: the use case is
      // "start on the NEXT prompt", not "fork this one".
      const mode = this.state.mode;
      const blank = defaultState();
      blank.mode = mode;
      this._restoreBuffer({ state: blank, libraryId: null, libraryName: "",
        libraryCategory: "", openedWith: JSON.stringify(blank),
        pins: [], autoPin: null });
      this.draftEntry = {
        mode: "draft",
        state: blank,
        // TWO fields, because the snapshot was doing two unrelated jobs and
        // the overlap was destructive.
        //
        //   mediaBase - frozen at creation, DISPLAY ONLY. Reference numbers
        //     are positional and global, so without it, rearranging Live
        //     media while the draft says <Picture 3> silently retargets
        //     that tag. Never applied to the loader.
        //
        //   media - written only when the draft's own set is edited through
        //     the media modal. This IS applied on commit.
        //
        // Conflated, every draft froze a copy nobody asked for and then
        // applied it: start a draft, spend an hour improving Live media,
        // commit, and the loader silently reverted to the old set.
        //
        // Empty stays null, never []: [] is truthy, and as `media` it would
        // have wiped the loader on commit.
        mediaBase: this._snapshotMedia(),
        media: null,
        // The RefMod picks, split the same way: refmodsBase is frozen for
        // display, refmods is written only through the draft's own stack
        // panel and applied to the stack on commit ([] = deliberately none).
        refmodsBase: this._snapshotRefmods(),
        refmods: null,
        savedTo: null,
      };
    }
    this.draftStale = this._mediaDiverged();
    this.draftRefmodsStale = this._refmodsDiverged();
    this.node._mmh3DraftActive = true;
    this.draftDropped = this.draftDropped || 0;
    this.refreshSlots();
    this.applyDraftChrome();
    this.scheduleDraftSave();
    updateSummary(this.node);
    this.render();
  }

  exitDraft() {
    if (this.bufferMode !== "draft") return;
    this.flushDraftSave("live");
    this.bufferMode = "live";
    if (this._liveHeld) this._restoreBuffer(this._liveHeld);
    this._liveHeld = null;
    this.commitPending = false;
    this.pullPending = false;
    this.refreshSlots();
    this.applyDraftChrome();
    this.render();
  }

  toggleDraftMode() {
    if (this.bufferMode === "draft") this.exitDraft();
    else this.enterDraft();
  }

  /** The draft entry as it should be written to disk right now.
   *
   *  Reads draftEntry.state, NEVER this.state: `this.state` is the draft's
   *  content only while bufferMode is "draft", and flushDraftSave syncs it
   *  in exactly that case. Reading it unconditionally meant closing the
   *  modal from Live mode wrote the LIVE prompt over the stored draft —
   *  the draft looked wiped on reopen. */
  draftPayload(modeOverride) {
    if (!this.draftEntry) return null;
    return {
      mode: modeOverride || this.bufferMode,
      state: this.draftEntry.state,
      media: this.draftEntry.media ?? null,
      mediaBase: this.draftEntry.mediaBase ?? null,
      refmods: this.draftEntry.refmods ?? null,
      refmodsBase: this.draftEntry.refmodsBase ?? null,
      savedTo: this.draftEntry.savedTo ?? null,
    };
  }

  scheduleDraftSave() {
    if (this.bufferMode !== "draft") return;
    clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => this.flushDraftSave(), 1500);
  }

  flushDraftSave(modeOverride) {
    clearTimeout(this._draftTimer);
    if (!this.draftEntry) return;
    if (this.bufferMode === "draft") {
      this.draftEntry.state = this.state;
      this.draftEntry.mode = modeOverride || "draft";
    } else if (modeOverride) {
      this.draftEntry.mode = modeOverride;
    }
    const payload = this.draftPayload(this.draftEntry.mode);
    // The no-empty-drafts rule: a pristine blank with no library tie and no
    // media or RefMods of its own isn't worth a disk entry — or an LRU slot.
    const blank = defaultState();
    blank.mode = payload.state.mode;
    if (!payload.savedTo && !payload.media && !payload.refmods &&
        stableStringify(payload.state) === stableStringify(blank)) {
      return;
    }
    draftApi("/save", { id: draftIdFor(this.node), draft: payload })
      .catch(() => { /* offline blip: the buffer is still in memory */ });
  }

  clearDraft() {
    clearTimeout(this._draftTimer);
    draftApi("/clear", { id: draftIdFor(this.node) })
      .catch(() => { /* worst case the LRU reaps it */ });
    this.draftEntry = null;
    this.draftDropped = 0;
    this.node._mmh3DraftActive = false;
    updateSummary(this.node);
    if (this.bufferMode === "draft") {
      // Start a fresh blank draft in place rather than dumping to live —
      // "clear" means "new page", not "close the notebook".
      const held = this._liveHeld;    // keep the parked live session
      this.bufferMode = "live";       // let enterDraft do its full setup
      this.enterDraft();
      this._liveHeld = held;
    }
    this.render();
  }

  /** True when the buffer matches its last library save exactly. Always
   *  computed, never stored — stored flags drift, comparisons can't. */
  cleanSince(savedTo, state) {
    return !!(savedTo && savedTo.hash && savedTo.hash === stateHash(state));
  }

  /** Called by the Library after a successful save or load, so the active
   *  buffer remembers what it's clean against. */
  noteLibraryIdentity() {
    const rec = {
      libraryId: this.libraryId,
      libraryName: this.libraryName,
      libraryCategory: this.libraryCategory,
      hash: stateHash(this.state),
    };
    if (this.bufferMode === "draft") {
      if (this.draftEntry) {
        this.draftEntry.savedTo = rec;
        this.flushDraftSave();
      }
    } else {
      this.node.properties = this.node.properties || {};
      this.node.properties.mmh3_live_saved = rec;
    }
    this.applyDraftChrome();
  }

  /** The loader's current set, or null when there's nothing worth freezing. */
  _snapshotMedia() {
    const items = loaderItems(this.node);
    return (Array.isArray(items) && items.length) ? items : null;
  }

  /** The picks of the stack this prompt's RefMods come from, or null. */
  _snapshotRefmods() {
    const { stack } = refmodStackFor(this.node);
    if (!stack) return null;
    const picks = readStack(stack).picks;
    return picks.length ? JSON.parse(JSON.stringify(picks)) : null;
  }

  /** RefMods the draft OWNS — edited through its own stack panel, applied to
   *  the stack on commit. Null = never edited (follows the stack); [] = the
   *  draft deliberately has none, which does clear the stack on commit. */
  draftRefmods() {
    const r = this.draftEntry?.refmods;
    return Array.isArray(r) ? r : null;
  }

  /** What the draft DISPLAYS for RefMods: its own set, else the frozen
   *  base, else null (the stack itself). Display only. */
  draftRefmodsView() {
    if (!this.draftEntry) return null;
    const own = this.draftRefmods();
    if (own) return own;
    const b = this.draftEntry.refmodsBase;
    return (Array.isArray(b) && b.length) ? b : null;
  }

  /** True when the stack has moved on from the picks this draft froze. */
  _refmodsDiverged() {
    if (this.draftRefmods()) return false;
    const b = this.draftEntry?.refmodsBase;
    if (!Array.isArray(b) || !b.length) return false;
    const { stack } = refmodStackFor(this.node);
    if (!stack) return true;                  // stack unwired since creation
    const strip = (picks) => picks.map(({ missing, ...p }) => p);
    return stableStringify(strip(b)) !== stableStringify(strip(readStack(stack).picks));
  }

  /** Media the draft OWNS — edited deliberately, and applied on commit.
   *  Null means the draft has never been given media of its own. Always go
   *  through this: a bare `.media` check treats [] as a real set. */
  draftMedia() {
    const m = this.draftEntry?.media;
    return (Array.isArray(m) && m.length) ? m : null;
  }

  /** What the draft DISPLAYS: its own set if it has one, else the frozen
   *  base, else whatever the node currently holds. Display only — commit
   *  never reads this. */
  draftView() {
    if (!this.draftEntry) return null;
    const own = this.draftMedia();
    if (own) return own;
    const b = this.draftEntry.mediaBase;
    return (Array.isArray(b) && b.length) ? b : null;
  }

  /** True when the frozen base no longer matches the node — i.e. the tags
   *  this draft was written against describe a set the loader has moved on
   *  from. Only meaningful while the draft has no media of its own. */
  _mediaDiverged() {
    if (this.draftMedia()) return false;      // own set: nothing to compare
    const b = this.draftEntry?.mediaBase;
    if (!Array.isArray(b) || !b.length) return false;
    const now = loaderItems(this.node);
    if (!now) return true;                    // loader unwired since creation
    return stableStringify(b) !== stableStringify(now);
  }

  refreshSlots() {
    if (this.bufferMode !== "draft") { this.slots = getRefSlots(this.node); return; }
    // A draft stands in for the loader's items and the stack's picks where it
    // has its own (or frozen) copies; the wiring itself is always live.
    const snap = this.draftView(), picks = this.draftRefmodsView();
    this.slots = getRefSlots(this.node, {
      media: snap || undefined, mediaLabel: this.draftMedia() ? "Draft media" : "Media Loader",
      picks: picks || undefined, picksLabel: this.draftRefmods() ? "Draft RefMods" : "RefMod Stack",
    }) || getRefSlots(this.node);
  }

  /** A loaded prompt named a media preset. Never apply it silently: it
   *  replaces whatever is in the loader, and reference numbering is
   *  positional, so a preset edited since linking can retarget the tags in
   *  the prompt that just loaded. */
  async offerLinkedMedia(presetName, savedDigest) {
    let info = null;
    try {
      info = await presetApi("/load", { name: presetName });
    } catch (e) {
      toast(`This prompt is linked to media preset \u201c${presetName}\u201d, ` +
        "which no longer exists.", 7000);
      return;
    }
    this.linkOffer = {
      name: presetName,
      items: info.items || [],
      missing: info.missing || [],
      changed: !!(savedDigest && info.digest && savedDigest !== info.digest),
    };
    this.render();
  }

  async offerLinkedRefmods(presetName, savedDigest) {
    let info = null;
    try {
      info = await refmodPresetApi("/load", { name: presetName });
    } catch (e) {
      toast(`This prompt is linked to RefMod preset \u201c${presetName}\u201d, which no longer exists.`, 7000);
      return;
    }
    this.refmodOffer = {
      name: presetName,
      picks: info.picks || [],
      missing: info.missing || [],
      changed: !!(savedDigest && info.digest && savedDigest !== info.digest),
    };
    this.render();
  }

  refmodLinkStrip() {
    const o = this.refmodOffer;
    if (!o) return null;
    const drafting = this.bufferMode === "draft";
    let current = 0;
    try {
      if (drafting) current = (this.draftRefmodsView() || []).length;
      else { const { stack } = refmodStackFor(this.node); current = stack ? readStack(stack).picks.length : 0; }
    } catch (e) { current = 0; }
    const target = drafting ? "this draft's RefMods" : "the RefMod Stack";
    const n = o.picks.filter((p) => p.on !== false).length;
    return el("div", { class: "mmh3p-commitstrip" },
      el("span", { class: "mmh3p-commitmsg" },
        `This prompt is linked to RefMod preset \u201c${o.name}\u201d ` +
        `(${n} RefMod${n === 1 ? "" : "s"}, with weights). ` +
        `Loading it replaces ${current} in ${target}.`,
        o.changed
          ? el("span", { class: "mmh3p-linkwarn" },
              " \u26a0 That preset has changed since this prompt was saved, " +
              "so its labels may no longer line up with the tags in the text.")
          : null,
        o.missing.length
          ? el("span", { class: "mmh3p-linkwarn" },
              ` \u26a0 ${o.missing.length} file(s) in the preset are missing from the library.`)
          : null),
      el("div", { class: "mmh3p-commitrow" },
        el("button", { class: "mmh3p-btn primary",
          onclick: () => this.applyLinkedRefmods() }, "Load the RefMods too"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.refmodOffer = null; this.render(); } },
          "Prompt only")));
  }

  applyLinkedRefmods() {
    const o = this.refmodOffer;
    this.refmodOffer = null;
    if (!o) return;
    const picks = JSON.parse(JSON.stringify(o.picks));
    if (this.bufferMode === "draft") {
      // The draft takes the set as its own; it reaches the stack on commit.
      if (this.draftEntry) {
        const v = validateDraftRefmods(picks);
        this.draftEntry.refmods = v.items || [];
        if (v.dropped) this.draftDropped = (this.draftDropped || 0) + v.dropped;
        this.draftRefmodsStale = this._refmodsDiverged();
        this.flushDraftSave();
      }
    } else {
      this._applyRefmodSnapshot(picks);
    }
    this.refreshSlots();
    this.render();
    toast(`Loaded RefMod preset \u201c${o.name}\u201d`);
  }

  linkStrip() {
    const o = this.linkOffer;
    if (!o) return null;
    const drafting = this.bufferMode === "draft";
    const currentCount = drafting
      ? (this.draftView() || []).length
      : (loaderItems(this.node) || []).length;
    const target = drafting ? "this draft's media" : "the Media Loader";
    return el("div", { class: "mmh3p-commitstrip" },
      el("span", { class: "mmh3p-commitmsg" },
        `This prompt is linked to media preset \u201c${o.name}\u201d ` +
        `(${o.items.length} reference${o.items.length === 1 ? "" : "s"}). ` +
        `Loading it replaces ${currentCount} in ${target}.`,
        o.changed
          ? el("span", { class: "mmh3p-linkwarn" },
              " \u26a0 That preset has changed since this prompt was saved, " +
              "so its reference numbers may no longer line up with the tags " +
              "in the text.")
          : null,
        o.missing.length
          ? el("span", { class: "mmh3p-linkwarn" },
              ` \u26a0 ${o.missing.length} file(s) in the preset are missing ` +
              "and will be skipped.")
          : null),
      el("div", { class: "mmh3p-commitrow" },
        el("button", { class: "mmh3p-btn primary",
          onclick: () => this.applyLinkedMedia() }, "Load the media too"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.linkOffer = null; this.render(); } },
          "Prompt only")));
  }

  applyLinkedMedia() {
    const o = this.linkOffer;
    this.linkOffer = null;
    if (!o) return;
    if (this.bufferMode === "draft") {
      // Never touch the executable node from inside a draft: the draft takes
      // the set as its own, and it reaches the loader only on commit.
      if (this.draftEntry) {
        const v = validateDraftMedia(JSON.parse(JSON.stringify(o.items)));
        this.draftEntry.media = v.items;
        if (v.dropped) this.draftDropped = (this.draftDropped || 0) + v.dropped;
        this.draftStale = this._mediaDiverged();
        this.flushDraftSave();
      }
    } else {
      this._applyMediaSnapshot(o.items);
    }
    this.refreshSlots();
    this.render();
    toast(`Loaded media preset \u201c${o.name}\u201d`);
  }

  /** Copy the Live prompt into the draft.
   *
   *  "setup" keeps the scaffolding that costs real effort — mode, duration,
   *  subject definitions, style, retention markers — and blanks the
   *  per-shot writing, which is the shape of chaining one shot to the next.
   *  "all" is a straight fork, for working up a variant.
   *
   *  Live is never touched: this reads the parked live buffer (or the node
   *  when there isn't one) and writes only the draft. */
  pullFromLive(scope) {
    const srcState = this._liveHeld?.state ?? loadState(this.node);
    const next = normaliseState(JSON.parse(JSON.stringify(srcState)));
    if (scope === "setup") {
      const d = defaultState();
      next.imd = d.imd;
      next.soundscape = d.soundscape;
      next.ref.summaryText = d.ref.summaryText;
      next.ref.detail = d.ref.detail;
      next.ref.soundscape = d.ref.soundscape;
    }
    this.state = next;
    this.openedWith = JSON.stringify(next);
    this.pins = [];
    this.autoPin = null;
    if (this.draftEntry) {
      // The pulled text's tags are numbered against the node's media as it
      // is now, so re-freeze the display base to match. A media set the
      // draft OWNS is left alone — that was a deliberate choice.
      this.draftEntry.mediaBase = this._snapshotMedia();
      this.draftStale = this._mediaDiverged();
      if (!this.draftRefmods()) {
        this.draftEntry.refmodsBase = this._snapshotRefmods();
        this.draftRefmodsStale = this._refmodsDiverged();
      }
    }
    this.pullPending = false;
    this.flushDraftSave();
    this.refreshSlots();
    this.render();
    toast(scope === "setup"
      ? "Pulled the cast and setup from Live"
      : "Pulled the Live prompt into this draft");
  }

  pullStrip() {
    if (!this.pullPending) return null;
    const blank = (() => {
      const d = defaultState(); d.mode = this.state.mode;
      return stableStringify(this.state) === stableStringify(d);
    })();
    return el("div", { class: "mmh3p-commitstrip" },
      el("span", { class: "mmh3p-commitmsg" },
        blank
          ? "Copy the Live prompt into this draft."
          : "Copy the Live prompt into this draft, replacing what's here. " +
            "Live itself is not changed."),
      el("div", { class: "mmh3p-commitrow" },
        el("button", { class: "mmh3p-btn primary",
          title: "Keep the mode, duration, subjects, style and retention " +
            "markers; leave the description fields empty for the next shot",
          onclick: () => this.pullFromLive("setup") }, "Cast and setup only"),
        el("button", { class: "mmh3p-btn",
          title: "Copy the whole Live prompt, description included",
          onclick: () => this.pullFromLive("all") }, "Everything"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.pullPending = false; this.render(); } },
          "Cancel")));
  }

  /** Commit: the single doorway from draft to executable. */
  commitDraft() {
    const liveState = this._liveHeld?.state ?? loadState(this.node);
    const liveSaved = this.node.properties?.mmh3_live_saved;
    const b = defaultState();
    b.mode = liveState.mode;
    const liveBlank = stableStringify(liveState) === stableStringify(b);
    // The only genuinely destructive edge in the whole feature: live being
    // displaced while unfiled. Everything else is recoverable by design.
    if (!liveBlank && !this.cleanSince(liveSaved, liveState)) {
      this.commitPending = "guard";
      this.render();
      return;
    }
    this._doCommit();
  }

  _doCommit() {
    const committed = this.state;
    // Only a set the draft OWNS is applied. The frozen base is display-only:
    // applying it would revert any media work done on Live while drafting.
    const media = this.draftMedia();
    const refmods = this.draftRefmods();
    // Draft becomes live: adopt its state and library identity as the live
    // buffer, write the node, apply the media snapshot through the same
    // front door presets use, and consume the draft entry.
    this.bufferMode = "live";
    this._liveHeld = null;
    this.commitPending = false;
    this.pullPending = false;
    this.state = committed;
    this.writeNode();
    if (media) this._applyMediaSnapshot(media);
    if (refmods) this._applyRefmodSnapshot(refmods);
    clearTimeout(this._draftTimer);
    draftApi("/clear", { id: draftIdFor(this.node) }).catch(() => {});
    this.draftEntry = null;
    this.draftDropped = 0;
    this.node._mmh3DraftActive = false;
    updateSummary(this.node);
    this.refreshSlots();
    this.applyDraftChrome();
    toast("Draft committed to Live");
    this.render();
  }

  /** Write a draft's picks into the stack this prompt's RefMods come from,
   *  keeping the stack's own token budget. */
  _applyRefmodSnapshot(picks) {
    try {
      const { stack } = refmodStackFor(this.node);
      if (!stack) { toast("The draft's RefMods had no stack to go to \u2014 use + RefMods first", 5000); return; }
      const w = stack.widgets?.find((x) => x.name === "stack_state");
      if (!w) return;
      w.value = JSON.stringify({ picks: JSON.parse(JSON.stringify(picks)), budget: readStack(stack).budget });
      stack._mmrPanel?.reload();
      stack.setDirtyCanvas?.(true, true);
    } catch (e) { console.error("[MiniMaxH3 PromptBuilder] applying draft RefMods failed:", e); }
  }

  _applyMediaSnapshot(items) {
    // Same shape as presets/load on the loader panel: replace the items
    // array and let the panel's own commit() do everything else. The
    // panel stays single-buffered and mode-ignorant.
    try {
      // Whichever node actually owns the media — this one in Prompt Studio,
      // a wired loader otherwise.
      const loader = mediaSource(this.node)?.owner;
      if (!loader) return;
      const panel = loader._mmlPanel || loader._mmlPanels?.[0];
      if (panel) {
        panel.items = JSON.parse(JSON.stringify(items));
        panel.presetName = "";
        panel.commit();
      } else {
        const w = loader.widgets?.find((x) => x.name === "media_state");
        if (w) w.value = JSON.stringify(items);
      }
    } catch (e) {
      console.error("[MiniMaxH3 PromptBuilder] draft media apply failed:", e);
      toast("Draft media couldn't be applied to the loader \u2014 see console");
    }
  }

  applyDraftChrome() {
    const modal = this.overlay?.querySelector(".mmh3p-modal");
    if (!modal) return;
    const drafting = this.bufferMode === "draft";
    modal.classList.toggle("draft", drafting);
    if (this.modeToggle) {
      this.modeToggle.textContent = drafting ? "\u25c0 Live" : "Draft \u25b6";
      this.modeToggle.title = drafting
        ? "Back to the Live prompt (the one on the node)"
        : "Switch to the draft scratchpad \u2014 the node keeps the Live prompt";
      this.modeToggle.classList.toggle("draft", drafting);
    }
    if (this.titleTag) this.titleTag.textContent = drafting ? "\u2014 Draft" : "";
    if (this.saveBtn) {
      // Nothing in a draft can reach the node except through Commit, so the
      // one button that writes the node must not look available here.
      // Disabled rather than relabelled: the commit action already lives in
      // the banner above, and two doors to it invites clicking the wrong one.
      this.saveBtn.disabled = drafting;
      this.saveBtn.classList.toggle("off", drafting);
      this.saveBtn.title = drafting
        ? "Drafts can't be saved to the node \u2014 use Commit to Live above"
        : "";
    }
  }

  draftBar() {
    if (this.bufferMode !== "draft") return null;
    const saved = this.draftEntry?.savedTo;
    const clean = this.cleanSince(saved, this.state);
    const status = saved
      ? (clean ? `saved to library as \u201c${saved.libraryName}\u201d`
               : `edited since it was saved as \u201c${saved.libraryName}\u201d`)
      : "not in the library";
    return el("div", { class: "mmh3p-draftbar" },
      el("span", { class: "mmh3p-draftbadge" }, "DRAFT"),
      this.draftDropped
        ? el("span", { class: "mmh3p-draftdropped",
            title: "Items that were missing a file or had an unknown type. " +
              "See the browser console for details." },
            `\u26a0 ${this.draftDropped} unusable reference item` +
            `${this.draftDropped === 1 ? "" : "s"} discarded`)
        : null,
      el("span", { class: "mmh3p-draftmsg" },
        "The node still holds the Live prompt. Nothing here is queued or " +
        "executed until you commit it to Live.",
        el("span", { class: "mmh3p-draftstatus" },
          ` \u2014 ${status}` +
          (this.draftMedia()
            ? " \u00b7 has its own media, applied on commit"
            : (this.draftStale
              ? " \u00b7 showing media as of when this draft was started; " +
                "the loader has changed since"
              : " \u00b7 following the node's media")) +
          (this.draftRefmods()
            ? " \u00b7 has its own RefMods, applied to the stack on commit"
            : (this._refmodsDiverged()
              ? " \u00b7 showing RefMods as of when this draft was started; " +
                "the stack has changed since"
              : (this.draftEntry?.refmodsBase ? " \u00b7 following the stack's RefMods" : ""))))),
      el("div", { class: "mmh3p-draftactions" },
        el("button", { class: "mmh3p-btn",
          title: "Copy the Live prompt into this draft \u2014 " +
            "Live itself isn't changed",
          onclick: () => { this.pullPending = true; this.render(); } },
          "\u21e3 Pull from Live"),
        el("button", { class: "mmh3p-btn primary",
          title: "Overwrite the Live prompt with this draft",
          onclick: () => this.commitDraft() }, "Commit to Live"),
        el("button", { class: "mmh3p-btn",
          title: "Throw this draft away and start a blank one",
          onclick: () => this.clearDraft() }, "Clear draft")));
  }

  commitStrip() {
    if (this.commitPending !== "guard") return null;
    const liveState = this._liveHeld?.state ?? loadState(this.node);
    const nameInput = el("input", { type: "text", class: "mmh3p-commitname",
      placeholder: "name for the Live prompt\u2026",
      value: this._liveHeld?.libraryName || "" });
    const err = el("span", { class: "mmh3p-saveerr" });
    const saveLive = async (expectNew) => {
      const value = nameInput.value.trim();
      if (!value) { err.textContent = "Give it a name first."; return; }
      const body = {
        name: value,
        category: this._liveHeld?.libraryCategory || "",
        favorite: false,
        mode: liveState.mode,
        refs: 0,
        prompt: generate(liveState),
        state: liveState,
      };
      if (expectNew) body.expect_new = true;
      const res = await libApi("/save", body);
      this.node.properties = this.node.properties || {};
      this.node.properties.mmh3_live_saved = {
        libraryId: res.id, libraryName: res.name,
        libraryCategory: body.category,
        hash: stateHash(liveState),
      };
      toast(`Live prompt saved as \u201c${res.name}\u201d`);
      this._doCommit();
    };
    return el("div", { class: "mmh3p-commitstrip" },
      el("span", { class: "mmh3p-commitmsg" },
        "The Live prompt has work that isn't in the library. Committing " +
        "this draft will overwrite it."),
      el("div", { class: "mmh3p-commitrow" },
        nameInput,
        el("button", { class: "mmh3p-btn primary",
          onclick: async () => {
            try {
              await saveLive(nameInput.value.trim() !==
                (this._liveHeld?.libraryName || ""));
            } catch (e2) {
              if (e2.exists) {
                err.replaceChildren(
                  `\u201c${nameInput.value.trim()}\u201d already exists. `,
                  el("button", { class: "mmh3p-btn", onclick: async () => {
                    try { await saveLive(false); }
                    catch (e3) { err.textContent = e3.message; }
                  } }, "Overwrite it"));
              } else err.textContent = e2.message;
            }
          } }, "Save Live to library, then commit"),
        el("button", { class: "mmh3p-btn mmh3p-danger",
          onclick: () => this._doCommit() }, "Overwrite Live"),
        el("button", { class: "mmh3p-btn",
          onclick: () => { this.commitPending = false; this.render(); } },
          "Cancel")),
      err);
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

  /** Instance-aware wrapper over the shared chipField(): resolves tags
   *  against this editor's own slots/subject defs, applies its highlight
   *  preference, and wires the hover-preview thumbnails only it has room
   *  for. */
  chipField(box) {
    const { wrap, paint } = chipField(box, {
      slotFor: (t) => this.slotFor(t),
      subjectInfo: (t) => this.subjectInfo(t),
      names: () => subjectNames(this.state),
      nameSuggestion: (b) => nameSuggestionFor(b, this.state),
      highlightTags: this.prefs?.highlightTags,
      onHover: (e, mirror) => this.chipHover(e, mirror),
      onLeave: () => this.chipLeave(),
    });
    (this._chipWraps = this._chipWraps || []).push(wrap);
    (this._chipFields = this._chipFields || []).push(paint);
    return wrap;
  }

  /** What a <Subject N> chip should show: the first picture its definition
   *  cites, plus every media tag that line mentions. */
  subjectInfo(tag) {
    const line = subjectLine(this.state, tag);
    if (!line) return null;
    const defs = this.state?.ref?.subjectDefs || [];
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
    return { slot, tags, voices, speakers, line, name: (line.name || "").trim() };
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
    if (tag.startsWith(NAME_PREFIX) && !tag.startsWith("<")) {
      // The shorthand shows the subject it stands for.
      const named = lookupName(subjectNames(this.state), tag.slice(1));
      if (!named) return;
      subject = this.subjectInfo(named.tag);
      if (!subject) return;
      slot = subject.slot;
      this._chipOpenFor = tag;
      this._chipTimer = setTimeout(() => this.openChipPeek(hit, slot, named.tag, subject), 180);
      return;
    }
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
      () => {
        // With railPeek on, show the tag's own card preview in the media
        // strip rather than a second panel over the text being typed. Falls
        // back to the cursor panel when the tag has no card to point at —
        // a subject with no media attached, or a slot the mode leaves out.
        //
        // A <Subject N> has no card of its own: the strip holds media, and
        // what a subject points at is its slot. Looking the subject's tag up
        // directly always missed, which is why subjects ignored this setting
        // and always opened the cursor panel.
        const key = subject ? slot?.tag : tag;
        const rail = this.prefs.railPeek && key && this._cardFor?.get(key);
        if (rail) this.openRailPeek(rail.card, rail.slot);
        else this.openChipPeek(hit, slot, tag, subject);
      }, 180);
  }

  chipLeave() {
    clearTimeout(this._chipTimer);
    this._chipOpenFor = null;
    if (this._chipPeek) { this._chipPeek.remove(); this._chipPeek = null; }
    // Under railPeek the panel that opened is the rail's, not the chip's,
    // so leaving the tag has to close that one too.
    if (this.prefs.railPeek) this.closePeek();
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
            subject.name ? el("span", { class: "mmh3p-chipname" }, subject.name) : null,
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
    box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 240))}px`;
    box.style.visibility = "hidden";
    document.body.append(box);

    // Above the chip, not below: a panel under the tag covers the line you
    // are about to type into. Flips below only when it cannot fit above.
    const place = () => {
      const bh = box.offsetHeight || 0;
      const above = r.top - bh - 6;
      box.style.top = above >= 8
        ? `${above}px`
        : `${Math.min(r.bottom + 6, window.innerHeight - bh - 8)}px`;
      box.style.visibility = "";
    };
    place();
    // Same as the rail peek: media has no size until it loads, so a box
    // placed before that would sit as if it were empty.
    const m = box.querySelector("img, video");
    if (m) {
      m.addEventListener("load", place, { once: true });
      m.addEventListener("loadedmetadata", place, { once: true });
      if (m.complete || m.readyState >= 1) place();
    }
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
      // Canvas cannot read a CSS variable, so the audio hue comes from
      // the same exported palette the stylesheets are built from —
      // otherwise this waveform is the one surface that can drift.
      ctx.fillStyle = TAG_COLORS.aud;
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
    // Text Encode has no per-mode caps: whatever the stack sends, it labels.
    if (this.slots?.refmod) return true;
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

  /* --- draft definitions from RefMods ------------------------------ */

  /** One definition line and one retention entry per RefMod in the stack,
   *  worded from the concept saved in the library (a person, a place, a
   *  style, a voice…). Names and descriptions are the user's own notes and
   *  never go into the prompt. Loose loader media is left alone: nothing is known
   *  about it. A RefMod whose concept was never set is asked about first,
   *  and the answer can be written back to the library so it isn't asked
   *  again. Labels that already have a line are skipped. */
  async draftFromRefmods() {
    const r = this.state.ref;
    // These three are read with .some()/.push()/.includes() throughout, and a
    // state that reached us from somewhere other than normaliseState() — a
    // loaded library prompt, a draft buffer — can be missing one. That is a
    // TypeError in an async handler, which is invisible: hence the guard here
    // as well as the reporting one on the button.
    if (!Array.isArray(r.subjectDefs)) r.subjectDefs = [];
    if (!Array.isArray(r.retention)) r.retention = [];
    if (!Array.isArray(r.summaryTypes)) r.summaryTypes = [];
    const slots = (this.slots || []).filter((s) => s.refmod && s.tag);
    if (!slots.length) {
      // Say which of the two cases it is: no stack at all reads very
      // differently from a stack that is wired but empty.
      const { stack } = refmodStackFor(this.node);
      toast(stack
        ? "The RefMod Stack is connected but has no RefMods in it — open it and pick some"
        : "No RefMods are connected — use ◈ RefMods to add a stack", 5000);
      return;
    }
    let library = [];
    try {
      const resp = await api.fetchApi("/minimax_h3_plus/refmods", { cache: "no-store" });
      library = (await resp.json()).items || [];
    } catch (e) { /* the concept picker covers the gap */ }
    const infoOf = (file) => {
      const it = library.find((x) => x.visual?.file === file || x.audio?.file === file);
      const nm = String(it?.subject_name || "").trim();
      return { concept: it?.concept || "generic", subjectName: /^[A-Za-z][\w-]{0,39}$/.test(nm) ? nm : "",
        appearance: oneLine(it?.appearance), voiceDesc: oneLine(it?.voice_description) };
    };
    // Group each RefMod's look and voice; a voice-only RefMod has no look.
    const mods = [];
    for (const s of slots) {
      const file = s.slotName.replace(/^refmod:/, "");
      let m = mods.find((x) => x.uid === s.refmod.uid);
      if (!m) { m = { uid: s.refmod.uid, name: s.refmod.name, ...infoOf(file) }; mods.push(m); }
      if (s.refmod.role === "voice") m.voice = s; else m.look = s;
      // The concept is written to the half it describes: the look's file,
      // or the voice's when the RefMod is a voice only.
      if (s.refmod.role !== "voice" || !m.file) m.file = file;
    }
    // A RefMod's saved subject name goes on its subject line when that line
    // has no name of its own yet — including lines drafted before the name
    // was set in the library. A name you typed is never replaced.
    const nameLines = (dry = false) => {
      let named = 0;
      for (const m of mods) {
        if (m.subjectName && m.look) {
          const line = r.subjectDefs.find((d) => !(d.name || "").trim() && /^\s*<Subject \d+>/.test(d.text || "")
            && (d.text || "").includes(m.look.tag));
          if (line) { if (!dry) line.name = m.subjectName; named++; }
        }
        // A saved voice description fills the voice box on the RefMod's voice line.
        if (m.voiceDesc && m.voice) {
          const line = r.subjectDefs.find((d) => !oneLine(d.voice) && voiceBinding(d.text)
            && (d.text || "").includes(m.voice.tag));
          if (line) { if (!dry) line.voice = m.voiceDesc; named++; }
        }
      }
      return named;
    };
    let how = null;
    {
      const citedNow = (tag) => r.subjectDefs.some((d) => (d.text || "").includes(tag));
      const nothingNew = !mods.some((m) => (m.look && !citedNow(m.look.tag)) || (m.voice && !citedNow(m.voice.tag)));
      if (nothingNew) {
        // Every RefMod already has a line: nothing to add, but the two
        // sections can still be drafted fresh, or blank names filled.
        how = await this.askOverwrite({ complete: true, names: nameLines(true) });
        if (!how) return;
        if (how === "keep") {
          const named = nameLines();
          this.render();
          toast(`Filled ${named} name or voice box${named === 1 ? "" : "es"} from the library`, 4000);
          return;
        }
      }
    }
    // Existing lines: add to them, or start the two sections over.
    const hasText = r.subjectDefs.some((d) => (d.text || "").trim()) || r.retention.some((x) => x.label);
    if (hasText && !how) {
      how = await this.askOverwrite();
      if (!how) return;
    }
    if (how === "replace") { r.subjectDefs = []; r.retention = []; }
    const defText = () => r.subjectDefs.map((d) => d.text).join("\n");
    const cited = (tag) => defText().includes(tag);
    const pending = mods.filter((m) => (m.look && !cited(m.look.tag)) || (m.voice && !cited(m.voice.tag)));
    if (!pending.length) { toast("Every RefMod already has a definition line", 3000); return; }

    // Ask about the ones the library can't describe.
    const unknown = pending.filter((m) => m.look ? !VISUAL_CONCEPTS.includes(m.concept)
                                            : !AUDIO_CONCEPTS.includes(m.concept));
    if (unknown.length) {
      const answers = await this.askConcepts(unknown);
      if (!answers) return;                       // cancelled
      for (const m of unknown) m.concept = answers.choice[m.uid];
      if (answers.remember) {
        for (const m of unknown) {
          try {
            await postApi("/minimax_h3_plus/refmods/meta", { headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ files: [m.file], concept_type: m.concept }) });
          } catch (e) { /* the draft still goes ahead */ }
        }
      }
    }

    const usedSpeakers = () => new Set([...defText().matchAll(/\(S(\d+)\)/g)].map((x) => +x[1]));
    const nextSpeaker = () => { const u = usedSpeakers(); let i = 1; while (u.has(i)) i++; return `S${i}`; };
    const nextSubject = () => {
      const n = [...defText().matchAll(/<Subject (\d+)>/g)].map((x) => +x[1]);
      return `<Subject ${Math.max(0, ...n) + 1}>`;
    };
    const ensureRet = (label, marker, note) => {
      if (r.retention.some((x) => x.label === label)) return;
      r.retention.push({ label, context: "", marker, note });
    };
    const ensureTask = (t) => { if (!r.summaryTypes.includes(t)) r.summaryTypes.push(t); };
    let added = 0;
    for (const m of pending) {
      let subj = null;
      if (m.look && !cited(m.look.tag)) {
        const spec = REFMOD_CONCEPTS[m.concept] || REFMOD_CONCEPTS.identity;
        subj = spec.subject ? nextSubject() : null;
        const ctx = { subj, tag: m.look.tag };
        let text = spec.text(ctx);
        // A saved appearance goes straight into a subject's line, where it can be edited.
        const looks = m.appearance.replace(/^with\s+/i, "");
        if (spec.subject && looks) text = text.replace(/\.\s*$/, "") + `, with ${looks}.`;
        r.subjectDefs.push({ text, role: null });
        ensureRet(subj || m.look.tag, spec.marker, spec.note(ctx));
        ensureTask(spec.task);
        added++;
      } else if (m.look) {
        // The look is already defined: reuse its subject for the voice.
        const line = r.subjectDefs.find((d) => d.text.includes(m.look.tag));
        subj = (line?.text.match(/<Subject \d+>/) || [null])[0];
      }
      if (m.voice && !cited(m.voice.tag)) {
        const vc = m.look ? (m.concept === "singing" ? "singing" : "voice") : m.concept;
        const spec = REFMOD_CONCEPTS[vc] || REFMOD_CONCEPTS.voice;
        if (spec.speaker && !subj) {
          // A voice with no look of its own still needs someone to belong to.
          subj = nextSubject();
          r.subjectDefs.push({ text: spec.speaker({ subj, tag: m.voice.tag }), role: null, name: m.subjectName || "" });
          ensureRet(subj, "fully_preserved", `${subj}'s identity is retained.`);
        }
        const ctx = { subj: subj || "<Subject 1>", tag: m.voice.tag, sx: nextSpeaker() };
        r.subjectDefs.push({ text: spec.text(ctx), role: vc === "voice" ? "timbre" : null,
          voice: vc === "voice" ? (m.voiceDesc || "") : "" });
        ensureRet(m.voice.tag, spec.marker, spec.note(ctx));
        ensureTask(spec.task);
        added++;
      }
    }
    nameLines();                                  // saved names onto the lines just written
    this.render();
    toast(`Drafted ${added} definition line${added === 1 ? "" : "s"} and their retention entries \u2014 read them over`, 5000);
  }

  /** Lines already exist: resolves to "add", "replace" or null (cancelled).
   *  With `complete`, every RefMod already has a line, so there is nothing to
   *  add: it offers "replace", and "keep" (fill `names` blank name boxes)
   *  when there are names to fill. */
  askOverwrite({ complete = false, names = 0 } = {}) {
    return new Promise((resolve) => {
      const close = (result) => { window.removeEventListener("keydown", onKey); box.remove(); resolve(result); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
      const box = el("div", { class: "mmh3p-conceptover", onmousedown: (e) => { if (e.target === box) close(null); } },
        el("div", { class: "mmh3p-conceptbox", role: "dialog", "aria-label": "Definitions already exist" },
          el("div", { class: "mmh3p-concepthead" },
            complete ? "Every RefMod already has a definition" : "You already have definitions"),
          el("div", { class: "mmh3p-dim" },
            complete
              ? "Start over clears ALL of subject_definitions and retention_analysis, including lines for other media, " +
                "and drafts them fresh from the RefMods." +
                (names ? ` Fill names and voices keeps your lines and fills ${names} empty name or voice ` +
                         `box${names === 1 ? "" : "es"} with what's saved in the library.` : "")
              : "Add missing keeps every line you have and drafts only the RefMods that don't have one yet. " +
                "Start over clears ALL of subject_definitions and retention_analysis, including lines for other media, " +
                "and drafts them fresh from the RefMods."),
          el("div", { class: "mmh3p-conceptbtns" },
            el("button", { class: "mmh3p-btn", onclick: () => close(null) }, "Cancel"),
            el("button", { class: "mmh3p-btn danger", onclick: () => close("replace") }, "Start over"),
            !complete ? el("button", { class: "mmh3p-btn primary", onclick: () => close("add") }, "Add missing")
              : names ? el("button", { class: "mmh3p-btn primary", onclick: () => close("keep") }, "Fill names and voices")
              : null)));
      window.addEventListener("keydown", onKey);
      document.body.append(box);
    });
  }

  /** A small dialog over the editor: what is each of these RefMods? Resolves
   *  to { choice: {uid: concept}, remember } or null when cancelled. */
  askConcepts(mods) {
    return new Promise((resolve) => {
      const choice = {};
      const rows = mods.map((m) => {
        const options = m.look ? VISUAL_CONCEPTS : AUDIO_CONCEPTS;
        choice[m.uid] = options[0];
        return el("label", { class: "mmh3p-conceptrow" },
          el("span", {}, `\u25c8 ${m.name}`, el("small", {}, m.look ? " (look)" : " (voice)")),
          el("select", { onchange: (e) => { choice[m.uid] = e.target.value; } },
            options.map((c) => el("option", { value: c }, CONCEPT_LABEL[c] || c))));
      });
      const remember = el("input", { type: "checkbox", checked: true });
      const close = (result) => { window.removeEventListener("keydown", onKey); box.remove(); resolve(result); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
      const box = el("div", { class: "mmh3p-conceptover", onmousedown: (e) => { if (e.target === box) close(null); } },
        el("div", { class: "mmh3p-conceptbox", role: "dialog", "aria-label": "What are these RefMods?" },
          el("div", { class: "mmh3p-concepthead" }, "What are these RefMods?"),
          el("div", { class: "mmh3p-dim" }, "The library has no concept saved for them, and the wording depends on it."),
          ...rows,
          el("label", { class: "mmh3p-inline" }, remember, " Save the answers to the library so this isn't asked again"),
          el("div", { class: "mmh3p-conceptbtns" },
            el("button", { class: "mmh3p-btn", onclick: () => close(null) }, "Cancel"),
            el("button", { class: "mmh3p-btn primary", onclick: () => close({ choice, remember: remember.checked }) }, "Draft"))));
      window.addEventListener("keydown", onKey);
      document.body.append(box);
    });
  }

  /* --- hover peek ------------------------------------------------- */

  peekFor(card, s) {
    let timer = null;
    const open = () => this.openRailPeek(card, s);
    card.addEventListener("mouseenter", () => {
      clearTimeout(this._peekClose);
      timer = setTimeout(open, 250);
    });
    card.addEventListener("mouseleave", () => {
      clearTimeout(timer);
      this._peekClose = setTimeout(() => this.closePeek(), 220);
    });
  }

  /** The big preview beside a rail card. Split out of peekFor()'s hover
   *  closure so a tag hover in a text field can open the very same panel
   *  (see the railPeek preference), rather than a second, smaller one. */
  openRailPeek(card, s) {
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

    box.addEventListener("mouseenter", () => clearTimeout(this._peekClose));
    box.addEventListener("mouseleave", () => this.closePeek());
    // In the document before it is placed: .mmh3p-peek is width:max-content
    // between 240px and 540px, so its real size depends on the media inside
    // it and can only be measured once it is laid out. Positioning against
    // the 540px cap instead is what left a narrow preview floating far to
    // the left of the chip it belongs to — the gap being exactly the width
    // the box turned out not to need. Hidden for the first measure so the
    // unplaced box is never painted at 0,0.
    box.style.visibility = "hidden";
    document.body.append(box);

    const GAP = 8;
    const place = () => {
      const bw = box.offsetWidth || 540;
      const bh = box.offsetHeight || 0;
      const r = card.getBoundingClientRect();
      // Beside the thumbnail in the sidebar view, below it otherwise. Both
      // clamp to the viewport on each axis, so a box larger than the screen
      // still lands inside it rather than off an edge.
      if (this.sidebar) {
        // The rail sits at the left edge, so the right is usually the only
        // side with room — but on a wide enough window (a maximised browser
        // on a widescreen monitor) there's space on the left too, and that
        // keeps the peek from drifting far from the cursor. Left wins only
        // when it can fit without clipping against the viewport edge.
        const openLeft = r.left - GAP - bw >= 0;
        box.style.left = openLeft
          ? `${Math.round(r.left - GAP - bw)}px`
          : `${Math.max(GAP, Math.min(r.right + GAP, window.innerWidth - bw - GAP))}px`;
        box.style.top = `${Math.max(4,
          Math.min(r.top, window.innerHeight - bh - GAP))}px`;
      } else {
        box.style.left =
          `${Math.max(GAP, Math.min(r.left, window.innerWidth - bw - GAP))}px`;
        box.style.top = `${r.bottom + 6}px`;
      }
      box.style.visibility = "";
    };
    place();
    // An <img>/<video> has no intrinsic size until it loads, so the first
    // measure above is of a box that hasn't grown yet. A large image then
    // finished loading into a box already positioned for a small one and
    // spilled off the edge of the screen — which read as the preview simply
    // not appearing. Measure again when the media settles.
    const media2 = box.querySelector("img, video");
    if (media2) {
      media2.addEventListener("load", place, { once: true });
      media2.addEventListener("loadedmetadata", place, { once: true });
      // A cached image can be complete before the listener is attached, in
      // which case neither event will ever fire.
      if (media2.complete || media2.readyState >= 1) place();
    }
    this._peek = box;
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
    // Rebuilt every render, so the lookup is rebuilt with it rather than
    // holding elements that are no longer in the document.
    this._cardFor = new Map();
    const live = this.slots.filter((s) => s.tag);
    const tile = this.dropTile();
    if (!live.length) {
      // In draft mode, say which set came up empty: the draft's own frozen
      // snapshot, or the node's live references. "No media" with no source
      // named is unactionable when two sources are possible.
      const snap = this.bufferMode === "draft" ? this.draftView() : null;
      if (snap) {
        return [tile, el("span", { class: "hint keep" },
          `This draft's frozen media snapshot holds ${snap.length} `
          + `item${snap.length === 1 ? "" : "s"}, but none of them produce a `
          + "reference tag \u2014 they may all be switched off. Commit or clear "
          + "the draft to go back to the node's own media.")].filter(Boolean);
      }
      if (this.slots?.refmod) {
        return el("span", { class: "mmh3p-refmodnone",
          title: "The RefMod Stack connected to this prompt isn't sending anything yet." },
          "No RefMods loaded");
      }
      return [tile, el("span", { class: "hint keep" },
        "No reference media on this node yet \u2014 add some in the panel on the "
        + "node, or with the + tile here."
        + (this.bufferMode === "draft"
          ? " (This draft has no snapshot of its own, so it follows the node.)"
          : ""))].filter(Boolean);
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
      if (s.refmod) {
        card.classList.add("refmod");
        card.append(el("span", { class: "mmh3p-cardbadge", title: `From the RefMod \u201c${s.refmod.name}\u201d` }, "\u25c8"));
        if (s.refmod.role === "voice" && s.preview?.type === "img")
          card.append(el("span", { class: "mmh3p-cardvoice" }, "\u266a"));
      }
      if (ok) this.peekFor(card, s);
      // Lets a tag hovered in a text field open this card's own preview
      // rather than a separate one — see the railPeek preference.
      this._cardFor.set(s.tag, { card, slot: s });
      return card;
    });
    // Trailing "+" tile. dropTile() returns null once the mode has no
    // room left, so it shows only when it is relevant.
    // Only worth sorting into groups when RefMods are in the mix: then each
    // RefMod's look and voice sit together under its name, and the loader's
    // media under its own.
    if (!live.some((s) => s.refmod))
      return tile ? [...cards, tile] : cards;
    const keyOf = (s) => (s.refmod ? `r:${s.refmod.uid}:${s.refmod.name}` : `m:${(s.source || "").split(" \u2022 ")[0]}`);
    const out = [];
    live.forEach((s, i) => {
      const key = keyOf(s);
      const last = out[out.length - 1];
      if (last && last.key === key) { last.cards.push(cards[i]); return; }
      out.push({ key, s, cards: [cards[i]] });
    });
    const groups = out.map((g) => el("div", { class: "mmh3p-cardgroup" + (g.s.refmod ? " refmod" : "") },
      el("div", { class: "mmh3p-cardgroupcards" }, ...g.cards),
      el("div", { class: "mmh3p-cardstrip",
        title: g.s.refmod ? `RefMod \u201c${g.s.refmod.name}\u201d${g.s.refmod.draft ? " (this draft's copy)" : ""}` : g.s.source },
        g.s.refmod ? `\u25c8 ${g.s.refmod.name}`
          : (/^draft/i.test(g.s.source || "") ? "Draft media" : (g.s.slotName || "").startsWith("loader:") ? "Media" : "Connected"))));
    return tile ? [...groups, tile] : groups;
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
        // hasCrop() rather than s.item.crop: a full-frame or placeholder
        // rect is truthy but crops nothing, and used to light this orange on
        // pictures that were never edited. Same test the loader's own edit
        // button uses, so the two can't disagree.
        class: "mmh3p-cardtool" + (s.item.trim || hasCrop(s.item) || s.item.rotate
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
  /** `allowed` pins the picker to a set of fields: the caret's field when it
   *  is one of them, otherwise the first. Without it the style lands in
   *  whatever was focused last, which in Reference mode meant picking a style
   *  with the cursor in the soundscape wrote it into the soundscape. */
  styleSelect(allowed = null) {
    const sel = el("select", {},
      [el("option", { value: "" }, "(style)"),
        ...STYLES.map((s) => el("option", { value: s }, s))]);
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      const target = allowed
        ? (allowed.includes(this.lastFocus) ? this.lastFocus : allowed[0])
        : null;
      this.insert(sel.value + ", ", target ? { target } : {});
      sel.value = "";
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
      // The handle is this fork's: refreshDialogue() swaps this one row in
      // place as speakers are added, rather than re-rendering the form.
      this.dialogueSlot = el("div", { class: "mmh3p-dialogslot" },
        this.dialogueEl = this.dialogueRow(lang)),
      this.tagRow(),
      this.phraseRow());
  }

  /* --- delivery tags: community findings, inserted inside <d> -------- */

  /** The tag picker row. Deliberately its own row rather than an extension of
   *  the dialogue row: that one already grows with every speaker, and 24 tags
   *  need a picker, not buttons. Sits directly under dialogue because these
   *  tags belong inside <d>, and insert() parks the caret before </d>. */
  tagRow() {
    const groups = [...new Set(DELIVERY_TAGS.map((t) => t.group))];
    this.tagGroup = this.tagGroup || groups[0];

    this.tagGroupEl = el("select", { class: "mmh3p-phrasecat",
      title: "Filter delivery tags by kind",
      onchange: () => { this.tagGroup = this.tagGroupEl.value;
        this.drawTags(); } });
    this.tagEl = el("select", { class: "mmh3p-phrasesel",
      onchange: () => this.showTagPeek(),
      onmouseenter: () => this.showTagPeek(),
      onmouseleave: () => this.hideTagPeek(),
      onmousedown: () => this.hideTagPeek(),
      onblur: () => this.hideTagPeek() });

    this.tagBar = el("div", { class: "mmh3p-tools mmh3p-phraserow" },
      el("span", { class: "mmh3p-toollabel" }, "Delivery:"),
      this.tagGroupEl, this.tagEl,
      el("button", { class: "mmh3p-btn",
        title: "Insert the selected tag at the caret. Tags belong inside a " +
               "<d> block \u2014 insert a dialogue line first.",
        onclick: () => this.insertTag() }, "insert"));
    this.drawTags();
    return this.tagBar;
  }

  selectedTag() {
    return DELIVERY_TAGS.find((t) => t.tag === this.tagEl?.value) || null;
  }

  drawTags() {
    if (!this.tagGroupEl) return;
    this.hideTagPeek();
    const groups = [...new Set(DELIVERY_TAGS.map((t) => t.group))];
    this.tagGroupEl.replaceChildren(...groups.map((g) =>
      el("option", { value: g, selected: g === this.tagGroup }, g)));
    const list = DELIVERY_TAGS.filter((t) => t.group === this.tagGroup);
    this.tagEl.replaceChildren(...list.map((t) =>
      el("option", { value: t.tag, title: t.what },
        `${t.tag}\u2002\u2014\u2002${t.what.split(".")[0]}`)));
  }

  insertTag() {
    const t = this.selectedTag();
    if (!t) return;
    if (t.wrap) {
      const close = `</${t.tag.slice(1)}`;      // <whisper> -> </whisper>
      this.insert(t.tag, { wrap: close });
    } else {
      this.insert(t.tag);
    }
  }

  /** Show the example on hover: the picker only has room for the tag and a
   *  few words, and the example is what tells you how it reads in a line. */
  showTagPeek() {
    this.hideTagPeek();
    const t = this.selectedTag();
    if (!t) return;
    const box = el("div", { class: "mmh3p-phrasepeek" },
      el("div", { class: "mmh3p-phrasepeekhead" },
        el("span", {}, t.tag),
        el("span", { class: "mmh3p-phrasepeekcat" }, t.group)),
      el("div", { class: "mmh3p-phrasepeektext" }, ...deliverySpans(t.ex)),
      el("div", { class: "mmh3p-tagpeekwhat" }, t.what));
    document.body.append(box);
    const r = this.tagEl.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - b.width - 8))}px`;
    box.style.top = r.top - b.height - 6 >= 8
      ? `${r.top - b.height - 6}px`
      : `${r.bottom + 6}px`;
    this._tagPeek = box;
  }

  hideTagPeek() {
    this._tagPeek?.remove();
    this._tagPeek = null;
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
          // Async, so the same silent-rejection trap as Draft from RefMods.
          onclick: () => this.confirmDeletePhrase().catch((e) => {
            console.error("[MiniMaxH3 PromptBuilder] deleting the phrase failed:", e);
            toast(`Couldn't delete the phrase: ${e?.message || e}`, 6000);
          }) }, "Delete"),
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
      const resp = await postApi("/minimax_h3_plus/phrases/save", {
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
      const resp = await postApi("/minimax_h3_plus/phrases/delete", {
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

  /** Rebuild just the dialogue row when the speakers in the prompt change.
   *
   *  The buttons are derived from the prompt text, so inserting "(S1)" should
   *  immediately offer "+ (S2)". It didn't: the row is built by toolBar()
   *  during render(), and insert() deliberately never re-renders — a full
   *  render rebuilds every field and drops the caret mid-sentence. So the
   *  new speaker only appeared after Save to node and reopening, which is
   *  two round trips to learn something the editor already knew.
   *
   *  Swapping the one row keeps the caret where it is. The language select
   *  is carried across rather than rebuilt, so a repaint can't silently
   *  reset a chosen language back to the default. */
  refreshDialogue() {
    if (!this.dialogueEl?.isConnected) return;
    if (this.usedSpeakers().join(",") === this._spkKey) return;
    const next = this.dialogueRow(this._langSel
      || el("select", {}, LANGS.map((l) => el("option", { value: l }, l))));
    this.dialogueEl.replaceWith(next);
    this.dialogueEl = next;
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
  /** Rebuild ONLY the dialogue row.
   *
   *  insert() can't call render(): a full rebuild replaces the textareas and
   *  throws away the caret it just placed inside <d>…</d>. So the speaker
   *  buttons, the pair button and the voiceover state all went stale the
   *  moment they mattered — you clicked "+ (S1)" and the row kept offering
   *  "+ (S1)" until some unrelated event forced a render. Swapping just this
   *  row leaves the focused field untouched. */
  refreshDialogueRow() {
    if (!this.dialogueSlot?.isConnected || !this.dialogueLang) return;
    try {
      this.dialogueSlot.replaceChildren(this.dialogueRow(this.dialogueLang));
    } catch (err) {
      console.error("[MiniMaxH3 PromptBuilder] dialogue row refresh failed:", err);
    }
  }

  /* --- right-click a tag: replace, swap or remove ------------------- */

  /** Reference mode: each voice-timbre line ties a speaker ID to its
   *  subject, that subject's name, the audio tag and, when filled in, a
   *  description of the voice. { S1: { audio, subj, sx, name, voice } } */
  speakerBindings() {
    const binds = {};
    if (this.state.mode !== "REF") return binds;
    const names = subjectNames(this.state);
    for (const d of this.state.ref?.subjectDefs || []) {
      const b = !d.off && voiceBinding(d.text);
      if (!b || binds[b.sx]) continue;
      const named = b.subj ? Object.values(names).find((n) => n.tag === b.subj) : null;
      binds[b.sx] = { ...b, name: named ? named.name : "", voice: oneLine(d.voice) };
    }
    return binds;
  }

  /** Every string in this mode's prompt a tag can sit in. */
  tagTexts() {
    const st = this.state, out = [];
    const add = (obj, key, where = "") => { if (obj && typeof obj[key] === "string") out.push({ obj, key, where }); };
    if (st.mode === "REF") {
      const r = st.ref;
      (r.subjectDefs || []).forEach((d) => add(d, "text", "def"));
      ["summaryText", "styleLine", "detail", "soundscape", "music"].forEach((k) => add(r, k));
      (r.retention || []).forEach((row) => { add(row, "label", "label"); add(row, "context"); add(row, "note"); });
    } else {
      ["imd", "soundscape", "music"].forEach((k) => add(st, k));
    }
    return out;
  }

  /** The tag under a right-click: read off the painted chips where the
   *  field has them, else from where the click put the caret. */
  tagUnderPointer(e, box) {
    const toks = tagTokens(box.value);
    if (!toks.length) return null;
    const mirror = box.closest(".mmh3p-chipwrap")?.querySelector(".mmh3p-chipmirror");
    if (mirror) {
      const chips = [...mirror.querySelectorAll(".mmh3p-reftag[data-tag]")];
      const hit = chips.find((c) => {
        const r = c.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!hit) return null;
      const same = toks.filter((t) => sameTok(t.tok, hit.dataset.tag));
      const k = chips.filter((c) => sameTok(c.dataset.tag, hit.dataset.tag)).indexOf(hit);
      return same[Math.max(0, Math.min(k, same.length - 1))] || null;
    }
    const a = box.selectionStart ?? -1, b = box.selectionEnd ?? a;
    if (a < 0) return null;
    return toks.find((t) => a >= t.start && a <= t.end && b <= t.end) || null;
  }

  /** Nothing in the prompt cites it. A subject's own definition line and a
   *  retention label don't count as citing it. */
  tagUnused(tok, texts = this.tagTexts()) {
    for (const t of texts) {
      if (t.where === "label" || (isSpk(tok) && t.where === "def")) continue;
      const v = t.obj[t.key] || "";
      let n = countTok(v, tok);
      if (t.where === "def" && tok.startsWith("<Subject") && v.trim().startsWith(tok)) n -= 1;
      if (n > 0) return false;
    }
    return true;
  }

  /** Other tags of the same kind, unused ones first. */
  tagChoices(tok) {
    const cls = tagClass(tok), texts = this.tagTexts(), list = [];
    if (cls === "Name") {
      for (const n of Object.values(subjectNames(this.state)))
        list.push({ tok: NAME_PREFIX + n.name, sub: n.tag, slot: this.subjectInfo(n.tag)?.slot || null, initial: n.name[0] });
    } else if (cls === "Subject") {
      const seen = new Set();
      for (const d of this.state.ref?.subjectDefs || []) {
        const m = (d.text || "").match(/^\s*(<Subject \d+>)/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const nm = (d.name || "").trim();
        list.push({ tok: m[1], sub: nm || "no name", slot: this.subjectInfo(m[1])?.slot || null, initial: nm ? nm[0] : "S" });
      }
    } else if (cls === "Speaker") {
      // Voice lines say who each speaker is; group tags only offer groups.
      const single = spkIds(tok).length === 1, bindings = {}, names = subjectNames(this.state);
      for (const d of this.state.ref?.subjectDefs || []) {
        const b = !d.off && voiceBinding(d.text);
        if (b && !bindings[b.sx]) bindings[b.sx] = b;
      }
      const seen = new Map();
      for (const t of texts) for (const k of tagTokens(t.obj[t.key] || "")) {
        if (!isSpk(k.tok)) continue;
        const ids = spkIds(k.tok);
        if (single && ids.length !== 1) continue;
        if (!seen.has(spkTok(ids))) seen.set(spkTok(ids), ids);
      }
      if (single) Object.keys(bindings).forEach((sx) => { if (!seen.has(`(${sx})`)) seen.set(`(${sx})`, [sx]); });
      for (const [norm, ids] of seen) {
        const b = ids.length === 1 ? bindings[ids[0]] : null;
        const named = b?.subj ? Object.values(names).find((n) => n.tag === b.subj) : null;
        list.push({ tok: norm, sub: ids.length > 1 ? "speaking together" : (named ? named.name : b?.subj || "no voice line"),
          slot: b?.subj ? this.subjectInfo(b.subj)?.slot || null : null, initial: ids.join("+") });
      }
      if (single) {
        const used = new Set([...seen.values()].flat());
        let i = 1;
        while (used.has(`S${i}`)) i++;
        list.push({ tok: `(S${i})`, sub: "new speaker", slot: null, initial: `S${i}`, fresh: true });
      }
    } else {
      for (const s of this.slots || []) {
        if (!s.tag || !s.tag.startsWith(`<${cls} `)) continue;
        const src = s.refmod?.name || String(s.source || "").split("•").pop().trim() || s.note || "";
        list.push({ tok: s.tag, sub: src, slot: s, initial: cls.slice(0, 3).toUpperCase() });
      }
    }
    return list.filter((o) => !sameTok(o.tok, tok))
      .map((o) => ({ ...o, unused: !o.fresh && this.tagUnused(o.tok, texts) }))
      .sort((a, b) => b.unused - a.unused);
  }

  /** Carry out a choice from the tag menu; returns what happened. */
  applyTagEdit(box, hit, scope, mode, target) {
    const tok = hit.tok;
    const swap = mode === "swap" && target != null && scope !== "this";
    const named = tagClass(tok) === "Name" ? lookupName(subjectNames(this.state), tok.slice(1)) : null;
    const back = named ? NAME_PREFIX + named.name : isSpk(tok) ? spkTok(spkIds(tok)) : tok;
    const verb = target == null ? "Removed" : swap ? "Swapped" : "Replaced";
    const what = target == null ? back : swap ? `${back} and ${target}` : `${back} with ${target}`;
    // A speaker's name and voice clause go with its ID — except when swapping
    // IDs everywhere, which renumbers the voice lines too and changes nobody.
    const oneSpk = isSpk(tok) && spkIds(tok).length === 1 && (target == null || spkIds(target).length === 1);
    const ctx = oneSpk && !(scope === "all" && swap) ? { bindings: this.speakerBindings(), prefix: NAME_PREFIX } : null;
    if (scope === "this") {
      if (ctx) {
        const v = box.value;
        let s0 = hit.start, e0 = hit.end;
        const pre = v.slice(0, s0).match(new RegExp(`${reEsc(NAME_PREFIX)}[A-Za-z][\\w-]* $`));
        if (pre) s0 -= pre[0].length;
        const post = v.slice(e0).match(/^, in the [^<\n]+? referenced from <Audio \d+>,/);
        if (post) e0 += post[0].length;
        const text = rewriteTokens(v.slice(s0, e0), tok, target, false, back, ctx);
        const r = text === "" ? tidyRange(v, s0, e0) : { start: s0, end: e0 };
        editField(box, r.start, r.end, text);
      } else {
        const r = target == null ? tidyRange(box.value, hit.start, hit.end) : hit;
        editField(box, r.start, r.end, target ?? "");
      }
      this.lastFocus = box;
      return `${verb} ${what}`;
    }
    if (scope === "field") {
      const v = box.value, n = countTok(v, tok) + (swap ? countTok(v, target) : 0);
      editField(box, 0, v.length, rewriteTokens(v, tok, target, swap, back, ctx));
      this.lastFocus = box;
      return `${verb} ${what} in this field (${n})`;
    }
    let n = 0, dropped = 0;
    const r = this.state.ref;
    if (target == null && tok.startsWith("<") && this.state.mode === "REF") {
      // Removing a label everywhere takes the lines that define it too, or
      // they'd be left reading "is the man in…".
      const before = r.subjectDefs.length + r.retention.length;
      r.subjectDefs = r.subjectDefs.filter((d) => !(d.text || "").trim().startsWith(tok));
      r.retention = r.retention.filter((row) => row.label !== tok);
      dropped = before - r.subjectDefs.length - r.retention.length;
    }
    for (const t of this.tagTexts()) {
      const v = t.obj[t.key] || "";
      const c = countTok(v, tok) + (swap ? countTok(v, target) : 0);
      if (!c) continue;
      n += c;
      t.obj[t.key] = rewriteTokens(v, tok, target, swap, back, ctx);
    }
    this.render();
    return `${verb} ${what} everywhere (${n})` +
      (dropped ? ` and deleted ${dropped} line${dropped === 1 ? "" : "s"} defining it` : "");
  }

  /** The tag menu: other tags of the same kind to put in its place, how
   *  far the change reaches, and Remove. */
  openTagMenu(x, y, box, hit) {
    this.closeTagMenu();
    this.chipLeave();
    this.closeCtx();
    const tok = hit.tok, cls = tagClass(tok);
    const st = { scope: "this", mode: "replace" };
    const host = this.overlay.querySelector(".mmh3p-modal") || document.body;
    const menu = el("div", { class: "mmh3p-tagpick", role: "dialog", "aria-label": `Replace ${tok}` });
    const chipCls = cls === "Name" || cls === "Subject" ? "subj" : cls === "Speaker" ? "spk" : (this.slotFor(tok)?.cls || "unknown");
    const thumb = (o) => {
      const wrap = el("span", { class: "mmh3p-tagpickthumb" });
      if (o.slot?.preview?.url) wrap.append(this.mediaThumb(o.slot));
      else wrap.append(o.initial || "?");
      if (o.unused || o.fresh) wrap.append(el("span", { class: "mmh3p-tagpickun",
        title: o.fresh ? "The next speaker ID not used anywhere yet" : "Nothing in the prompt cites this yet" }, o.fresh ? "new" : "unused"));
      return wrap;
    };
    const place = () => {
      const pr = (menu.offsetParent || document.body).getBoundingClientRect();
      const w = menu.offsetWidth, h = menu.offsetHeight;
      let left = x - pr.left, top = y - pr.top + 8;
      left = Math.max(8, Math.min(left, pr.width - w - 8));
      if (top + h > pr.height - 8) top = Math.max(8, y - pr.top - h - 8);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    const paint = () => {
      const texts = this.tagTexts();
      const inField = countTok(box.value, tok);
      const everywhere = texts.reduce((n, t) => n + countTok(t.obj[t.key] || "", tok), 0);
      const choices = this.tagChoices(tok);
      const seg = (key, val, label, disabled = false, title = "") => el("button", {
        type: "button", class: st[key] === val ? "on" : "", disabled, title,
        onclick: (e) => { e.stopPropagation(); st[key] = val; if (st.scope === "this") st.mode = "replace"; paint(); },
      }, label);
      const go = (target) => {
        const msg = this.applyTagEdit(box, hit, st.scope, st.mode, target);
        this.closeTagMenu();
        toast(msg, 3500);
      };
      let note = st.mode === "swap" ? "Swap exchanges both tags" : "Unused tags first";
      if (st.scope === "all" && tok.startsWith("<") && this.state.mode === "REF") {
        const r = this.state.ref;
        const lines = r.subjectDefs.filter((d) => (d.text || "").trim().startsWith(tok)).length +
          r.retention.filter((row) => row.label === tok).length;
        if (lines) note = `Remove also deletes the ${lines} line${lines === 1 ? "" : "s"} defining it`;
      }
      menu.replaceChildren(
        el("div", { class: "mmh3p-tagpickhead" },
          el("span", { class: `mmh3p-reftag ${chipCls} mmh3p-tagpicktag` }, tok),
          el("span", { class: "mmh3p-tagpicknote" }, TAG_CLASS_LABEL[cls]),
          el("span", { class: "mmh3p-tagpickgrow" }),
          el("button", { type: "button", class: "mmh3p-btn ghost", title: "Close", onclick: () => this.closeTagMenu() }, "✕")),
        el("div", { class: "mmh3p-tagpickrow" },
          el("span", { class: "mmh3p-tagpicklbl" }, "Apply to"),
          el("span", { class: "mmh3p-tagseg" },
            seg("scope", "this", "This tag"),
            seg("scope", "field", `Field (${inField})`),
            seg("scope", "all", `Everywhere (${everywhere})`))),
        el("div", { class: "mmh3p-tagpickrow" },
          el("span", { class: "mmh3p-tagpicklbl" }, "Action"),
          el("span", { class: "mmh3p-tagseg" },
            seg("mode", "replace", "Replace"),
            seg("mode", "swap", "Swap", st.scope === "this",
              st.scope === "this" ? "Swap needs Field or Everywhere — on one tag it's the same as Replace"
                : "Exchange the two tags"))),
        choices.length
          ? el("div", { class: "mmh3p-tagpickgrid" }, choices.map((o) => el("button", {
              type: "button", class: "mmh3p-tagpickopt",
              title: `${st.mode === "swap" && st.scope !== "this" ? "Swap with" : "Replace with"} ${o.tok}`,
              onclick: () => go(o.tok) },
              thumb(o),
              el("span", { class: "mmh3p-tagpicknm" }, o.tok),
              el("span", { class: "mmh3p-tagpicksub" }, o.sub))))
          : el("div", { class: "mmh3p-tagpicknone" }, `No other ${TAG_CLASS_LABEL[cls]} to put in its place.`),
        el("div", { class: "mmh3p-tagpickfoot" },
          el("button", { type: "button", class: "mmh3p-btn danger", onclick: () => go(null) }, "Remove"),
          el("span", { class: "mmh3p-tagpicknote" }, note)));
      place();
    };
    host.append(menu);
    paint();
    const onDown = (e) => { if (!menu.contains(e.target)) this.closeTagMenu(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); this.closeTagMenu(); } };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    this._tagMenu = { menu, onDown, onKey };
  }

  closeTagMenu() {
    const m = this._tagMenu;
    if (!m) return;
    m.menu.remove();
    document.removeEventListener("mousedown", m.onDown, true);
    window.removeEventListener("keydown", m.onKey, true);
    this._tagMenu = null;
  }

  /** The speaker button's menu: a plain line, or one that names the voice.
   *  Kept inside the editor, so a click in it doesn't count as outside. */
  openSpeakerMenu(anchor, id, b, line, pick) {
    this._spkMenu?.close();
    const host = anchor.closest(".mmh3p-modal") || document.body;
    let menu;
    const close = () => {
      menu?.remove();
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      this._spkMenu = null;
    };
    const onDown = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } };
    const item = (label, text, enabled, onpick) => el("button", {
      class: "mmh3p-spkitem" + (enabled ? "" : " off"), type: "button",
      onclick: (e) => { e.stopPropagation(); if (!enabled) return; close(); onpick(); },
    }, el("b", {}, label), el("small", {}, text));
    menu = el("div", { class: "mmh3p-spkmenu", role: "menu" },
      item(`Just (${id})`, line(id, false), true, () => pick(false)),
      item(`(${id}) with voice`, b.voice ? line(id, true) : `Fill in the voice box on the ${b.audio} line first`,
        !!b.voice, () => pick(true)));
    host.append(menu);
    const pr = (menu.offsetParent || document.body).getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(ar.left - pr.left, pr.width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${ar.bottom - pr.top + 4}px`;
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    this._spkMenu = { close };
  }

  dialogueRow(lang) {
    this.dialogueLang = lang;          // reused by refreshDialogueRow()
    const used = this.usedSpeakers();
    const next = `S${used.length ? Math.max(...used.map((s) => +s.slice(1))) + 1 : 1}`;
    this._spkKey = used.join(",");
    this._langSel = lang;

    const vo = el("button", {
      class: "mmh3p-btn" + (this.voiceover ? " primary" : ""),
      title: "Off-screen voiceover. While on, inserted lines use the guide's " +
             "exact phrasing and append the lips-closed clause, which is " +
             "required on every voiceover line.",
      onclick: () => { this.voiceover = !this.voiceover; this.render(); },
    }, "\u{1F399} voiceover");

    const binds = this.speakerBindings();

    const line = (id, withVoice = false) => {
      const b = binds[id];
      const who = b?.name ? `${NAME_PREFIX}${b.name} ` : "";
      const how = withVoice && b?.voice ? `, in the ${noArticle(b.voice)} referenced from ${b.audio},` : "";
      const said = this.voiceover
        ? `${who}(${id})${how} says in an off-screen voiceover: `
        : `${who}(${id})${how} says: `;
      const tail = this.voiceover
        ? " while their lips remain completely closed."
        : "";
      // Deliberately NOT on its own line: the model reads a line break as a
      // shot boundary, so only [Shot N] may introduce one. Dialogue joins the
      // description it belongs to.
      return `${said}<d>[${lang.value}] </d>${tail}`;
    };

    const spkBtn = (id, isNew) => {
      const b = !isNew && binds[id];
      if (!b) return el("button", {
        class: "mmh3p-btn" + (isNew ? " ghost" : ""),
        title: isNew
          ? `Add ${id} \u2014 the next speaker in the video's speaking order`
          : `Insert a line for ${id}`,
        onclick: () => this.insert(line(id)),
      }, isNew ? `+ (${id})` : `(${id})`);
      // A split button: the main part repeats this speaker's last choice,
      // the arrow offers a plain line or one that names the voice. Each
      // speaker remembers its own choice, saved with the prompt.
      const picks = this.state.ref.voicePick || {};
      const withVoice = picks[id] !== false && !!b.voice;
      const pick = (voice) => {
        this.state.ref.voicePick = { ...(this.state.ref.voicePick || {}), [id]: voice };
        this.insert(line(id, voice));
        this.refreshDialogueRow();
      };
      const arrow = el("button", { class: "mmh3p-btn mmh3p-spkarrow", title: `Line options for ${id}`,
        "aria-label": `Line options for ${id}`,
        onclick: (e) => { e.stopPropagation(); this.openSpeakerMenu(arrow, id, b, line, pick); } }, "\u25be");
      return el("span", { class: "mmh3p-spksplit" },
        el("button", { class: "mmh3p-btn mmh3p-spkmain",
          title: withVoice ? `Insert a line for ${id} in the voice from ${b.audio}` : `Insert a line for ${id}`,
          onclick: () => this.insert(line(id, withVoice)) }, withVoice ? `(${id}) + voice` : `(${id})`),
        arrow);
    };

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
    const hint = el("span", { class: "hint keep" },
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

  /** Guarded so a bad state can't leave a half-built form.
   *
   *  The media loader learned this the hard way (see "render failed" in its
   *  console output): a throw partway through a build leaves stale tiles and
   *  dead buttons with nothing on screen to explain it. Same shape here —
   *  an unbuilt chipbar reads as "my media disappeared". */
  render() {
    try {
      this._render();
    } catch (err) {
      console.error("[MiniMaxH3 PromptBuilder] render failed:", err);
      toast("The editor hit an error while drawing \u2014 " +
        "see the browser console (F12).", 8000);
    }
  }

  _render() {
    this._citeText = null;
    const scroll = this.formEl.scrollTop;
    [...this.modeBar.children].forEach((b, i) =>
      b.classList.toggle("on", MODES[i].id === this.state.mode));
    this._slotMap = null;                 // slots may have changed
    (this._chipFields || []).forEach((paint) => { try { paint(); } catch (e) {} });
    this.modeSends.textContent = MODE_SENDS[this.state.mode] || "";
    this.modeSends.classList.toggle("gated", this.state.mode !== "REF");
    this.formEl.replaceChildren();
    this.refreshSlots();
    // Fill the status slot BEFORE the form. If a form build throws, the
    // guard catches it — but the draft banner is the one thing that must
    // survive, because it's what tells you the node isn't holding what
    // you're looking at. Drawing it last made it the first casualty.
    this.draftSlot.replaceChildren(
      this.linkOffer ? this.linkStrip()
        : this.refmodOffer ? this.refmodLinkStrip()
        : this.commitPending === "guard" ? this.commitStrip()
        : this.pullPending ? this.pullStrip()
        : (this.bufferMode === "draft" ? this.draftBar() : null) || "");
    if (this.state.mode === "REF") this.renderRef();
    else this.renderBase();
    if (this.closePending) {
      this.formEl.prepend(this.closeStrip());
      this.formEl.scrollTop = 0;
    } else if (this.clearPending) {
      this.formEl.prepend(this.clearStrip());
      this.formEl.scrollTop = 0;
    } else this.formEl.scrollTop = scroll;
    this.applyHints();
    this.applyDraftChrome();
    this.updatePreview();
  }

  /** Hide the standing help captions, moving each onto its section's
   *  tooltip so the guidance is still one hover away. Runs after every
   *  render because render() rebuilds the form from scratch. */
  applyHints() {
    const hide = !!this.prefs.hideHints;
    this.overlay?.querySelector(".mmh3p-modal")
      ?.classList.toggle("mmh3p-nohints", hide);
    if (!this.formEl) return;
    const seen = new Set();
    for (const h of this.formEl.querySelectorAll(".hint:not(.keep)")) {
      const sec = h.closest(".mmh3p-sec") || h.parentElement;
      if (!sec || seen.has(sec)) continue;
      seen.add(sec);
      if (!hide) continue;
      // Every non-live caption in this section, joined — a couple of
      // sections carry two. Appended to any title the section already has
      // rather than replacing it.
      const own = [...sec.querySelectorAll(".hint:not(.keep)")]
        .map((x) => (x.textContent || "").trim()).filter(Boolean).join("\n\n");
      const had = sec.getAttribute("data-own-title") ?? sec.title ?? "";
      sec.setAttribute("data-own-title", had);
      sec.title = [had, own].filter(Boolean).join("\n\n");
    }
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
      el("label", {
        title: "Open [Shot 1] with the overall style and initial composition. " +
          "Later shots: \"[Shot N] At MM:SS.mmm, the shot cuts to ...\". Write " +
          "camera moves as natural sentences.",
      }, "integrated_multimodal_description"),
      this.ta(s, "imd", 12,
        `[Shot 1] Live-action, cinematic, ...\nRecommended: ${structures[s.mode]}`)));

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
      const names = subjectNames(this.state);
      const nameOf = (n) => Object.values(names).find((v) => v.tag === `<Subject ${n}>`)?.name;
      return ns.flatMap((n) => {
        const nm = nameOf(n);
        const chips = [el("span", {
          class: "mmh3p-chip subj", title: `Insert <Subject ${n}>`,
          onclick: () => this.insert(`<Subject ${n}>`),
        }, el("b", {}, `Subject ${n}`), nm ? el("span", { class: "mmh3p-chipname" }, nm) : null)];
        if (nm) chips.push(el("span", {
          class: "mmh3p-chip subj", title: `Insert ${NAME_PREFIX}${nm} \u2014 becomes "<Subject ${n}> ${nm}" in the prompt`,
          onclick: () => this.insert(`${NAME_PREFIX}${nm}`),
        }, el("b", {}, `${NAME_PREFIX}${nm}`)));
        return chips;
      });
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
          oninput: (e) => { d.text = e.target.value; d.role = null; paintMini(); nameIn.hidden = !/^\s*<Subject \d+>/.test(d.text); voiceIn.hidden = !voiceBinding(d.text); } });
        // A name rides on a <Subject N> line: the prompt adds "Their name
        // is X." and !X anywhere else becomes "<Subject N> X".
        const nameIn = el("input", { class: "mmh3p-defname", type: "text", value: d.name || "",
          placeholder: "name", title: "Optional name for this subject. The prompt adds \u201cTheir name is \u2026\u201d " +
            `to the line, and typing ${NAME_PREFIX}Name in any field stands for \u201c<Subject N> Name\u201d.`,
          hidden: !/^\s*<Subject \d+>/.test(d.text || ""),
          oninput: (e) => { keepNameChars(e); d.name = e.target.value.trim(); this._paintSubjChips?.(); this.updatePreview(); } });
        // A voice description rides on a voice-timbre line: the prompt adds
        // "It is a …", and the speaker button can put it into a spoken line.
        const voiceIn = el("input", { class: "mmh3p-defname mmh3p-defvoice", type: "text", value: d.voice || "",
          placeholder: "voice, like low and husky", title: "Optional description of this voice. The prompt adds " +
            "“It is a …” to the line, and the speaker button can insert it into a spoken line.",
          hidden: !voiceBinding(d.text || ""),
          oninput: (e) => { d.voice = e.target.value; this.updatePreview(); this.refreshDialogueRow(); } });
        paintMini();
        // Chip-wrapped like every other prompt field. This is where subjects
        // are actually written, and it was the one field left painting them
        // as plain text — while the mini-tags directly underneath it were
        // already colour-coded, so the same line was coloured twice over and
        // plain once.
        const row = el("div", { class: "mmh3p-defrow" + (d.off ? " off" : "") },
          this.rowPower(d, drawDefs), this.chipField(ta), nameIn, voiceIn,
          el("button", { class: "mmh3p-btn rowx", title: "Remove line",
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
          onclick: () => addDef(`<Audio ${nextTagN("Audio")}> is `) }, "+ Audio line"),
        el("button", { class: "mmh3p-btn", title: "Write a definition and a retention entry for each " +
            "RefMod in the stack, from what the library knows about it. With lines already here you " +
            "choose whether to add the missing ones or start over.",
          // draftFromRefmods() is async, so an exception inside it becomes an
          // unhandled rejection: the button does nothing at all, with no toast
          // and nothing on screen to say why. Report it instead \u2014 a failure
          // the user can see and quote is worth far more than a silent no-op.
          onclick: () => this.draftFromRefmods().catch((e) => {
            console.error("[MiniMaxH3 PromptBuilder] Draft from RefMods failed:", e);
            toast(`Draft from RefMods failed: ${e?.message || e}`, 6000);
          }) }, "\u25c8 Draft from RefMods")),
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
          el("button", { class: "mmh3p-btn rowx", title: "Remove entry",
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
    const wcSpan = el("span", { class: "hint keep" });
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
    const styleWrap = this.ta(r, "styleLine", 2,
      "The target video is in a realistic multi-camera sitcom style with warm indoor lighting.");
    // ta() hands back the chip wrapper, so reach through it for the field
    // itself — the two detailed_description halves are the only places this
    // picker may write.
    const detailFields = [styleWrap, detTa]
      .map((w) => w.querySelector("textarea")).filter(Boolean);
    f.append(el("div", { class: "mmh3p-sec" },
      el("label", { class: "act" },
        "detailed_description \u2014 style opening (before [Shot 1])",
        el("span", { class: "mmh3p-secact" }, this.styleSelect(detailFields))),
      styleWrap));
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
    this.scheduleDraftSave();      // no-op outside draft mode
    this.refreshDialogueRow();     // speaker buttons follow the text
    this._paintSubjChips?.();
    const text = generate(this.state);
    this._citeText = text;
    // Order matters. The language bracket runs before [Shot N] and excludes it
    // by lookahead, so the two can't claim each other's text; every pattern
    // after the first excludes < and > so none can match inside a span this
    // chain has already inserted.
    // Resolved against this editor's own slots and subject definitions, the
    // same test paintToken() applies in the fields, so a tag that reads red
    // while typing reads red here too.
    this.previewEl.innerHTML = paintTags(text, (tag) => {
      if (tag.startsWith("<Subject")) return this.subjectInfo(tag) ? "subj" : "unknown";
      const slot = this.slotFor(tag);
      return slot ? (slot.cls || "pic") : "unknown";
    });

    const rank = { error: 0, warn: 1, info: 2 };
    const icon = { error: "\u26d4 ", warn: "\u26a0 ", info: "\u2139 " };
    const issues = validate(this.state, this.slots)
      .sort((a, b) => rank[a.level] - rank[b.level]);
    this.issuesEl.replaceChildren(...(issues.length
      ? issues.map((i) => el("div", { class: i.level }, icon[i.level] + i.msg))
      : [el("div", { class: "ok" }, "\u2713 No issues found")]));
    // The header carries the tally so a collapsed list still reports what it
    // is hiding, and the worst level it holds so the colour still warns.
    const worst = issues.length
      ? issues.reduce((w, i) => rank[i.level] < rank[w] ? i.level : w, "info")
      : "ok";
    this.issuesCount.textContent = issues.length
      ? `${issues.length}` : "\u2713";
    this.issuesCount.className = `mmh3p-issuecount ${worst}`;
    this.issuesBox.classList.toggle("collapsed", !!this.prefs.issuesCollapsed);

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

/** A saved draft should show on the node without opening the editor — one
 *  light POST per node per workflow load. Mints no id: a node that never
 *  drafted has no `mmh3_draft_id` property and is skipped outright. */
export function restoreDraftFlag(node) {
  const id = node.properties?.mmh3_draft_id;
  if (!id) return;
  draftApi("/load", { id })
    .then((res) => {
      node._mmh3DraftActive = !!res.exists;
      if (res.exists) updateSummary(node);
    })
    .catch(() => { /* the flag is cosmetic; the draft itself is on disk */ });
}

/** The one place this file links two nodes. */
function wire(from, outSlot, to, inSlot) {
  return linkNodes(from, outSlot, to, inSlot);
}

function redraw(node) {
  try {
    node.setDirtyCanvas?.(true, true);
    app.graph.setDirtyCanvas(true, true);
  } catch (e) { /* Vue redraws itself */ }
}

/** Pass this builder's media on to a Text Encode whose references input is
 *  empty, when the builder has a Media Loader. Returns true if it wired. */
function feedEncoderMedia(node, enc) {
  const refIn = (node.inputs || []).findIndex((i) => i.name === "references");
  const refOut = (node.outputs || []).findIndex((o) => o.name === "references");
  const ri = (enc.inputs || []).findIndex((i) => i.name === "references");
  if (refIn < 0 || refOut < 0 || ri < 0) return false;
  if (node.inputs[refIn].link == null || enc.inputs[ri].link != null) return false;
  wire(node, refOut, enc, ri);
  return true;
}

/** Wire a RefMod Stack into this builder's mods input. Focuses the stack
 *  already there; otherwise adopts one already feeding a RefMod Text Encode
 *  this prompt drives, or creates a new one beside the node and passes the
 *  builder's mods output on to any such Text Encode whose mods input is
 *  empty. Returns the stack, or null. */
function addRefModStack(node, { focus = true } = {}) {
  const inIdx = (node.inputs || []).findIndex((i) => i.name === "mods");
  const outIdx = (node.outputs || []).findIndex((o) => o.name === "mods");
  if (inIdx < 0 || outIdx < 0) {
    toast("This Prompt Builder has no mods input \u2014 restart ComfyUI and reload the page", 6000);
    return null;
  }

  if (node.inputs[inIdx].link != null) {
    const { stack } = refmodStackFor(node);
    // An older workflow may have the stack but not the media wire: finish it.
    const fed = encodersOf(node).filter((enc) => feedEncoderMedia(node, enc)).length;
    if (fed) redraw(node);
    if (stack && focus && !safeCanvasFocus(stack))
      openStackModal(stack, { onClose: () => updateSummary(node) });
    if (!stack) toast("Something other than a RefMod Stack is on this node's mods input");
    else if (focus) toast(fed ? "RefMod Stack already connected \u2014 wired this node's media on to RefMod Text Encode too"
                              : "A RefMod Stack is already connected");
    return stack;
  }

  const encoders = outputTargets(node, promptOutIdx(node)).filter((n) => ENCODE_NAMES.has(n?.type));
  const modsInput = (enc) => (enc.inputs || []).findIndex((i) => i.name === "mods");
  for (const enc of encoders) {
    const mi = modsInput(enc);
    const head = mi >= 0 && enc.inputs[mi].link != null ? originNode(enc, mi) : null;
    if (STACK_NAMES.has(head?.type)) {
      wire(head, 0, node, inIdx);     // slot 0 is the stack's mods bundle
      feedEncoderMedia(node, enc);
      redraw(node);
      toast("Connected the RefMod Stack that already feeds RefMod Text Encode");
      return head;
    }
  }

  let stack = null;
  try {
    stack = LiteGraph.createNode(STACK_NAME);
  } catch (e) { stack = null; }
  if (!stack) {
    toast("RefMod Stack node not found \u2014 restart ComfyUI");
    return null;
  }
  app.graph.add(stack);
  try {
    // Left of the builder like the Media Loader, below it when one is there.
    const refIdx = (node.inputs || []).findIndex((i) => i.name === "references");
    const loader = refIdx >= 0 && node.inputs[refIdx].link != null ? originNode(node, refIdx) : null;
    const x = node.pos[0] - ((stack.size?.[0] || 560) + 60);
    const y = loader ? loader.pos[1] + (loader.size?.[1] || 400) + 60 : node.pos[1];
    stack.pos = [x, y];
  } catch (e) { /* let the renderer place it */ }
  wire(stack, 0, node, inIdx);
  let fed = 0;
  for (const enc of encoders) {
    const mi = modsInput(enc);
    if (mi >= 0 && enc.inputs[mi].link == null) { wire(node, outIdx, enc, mi); fed++; }
    feedEncoderMedia(node, enc);
  }
  redraw(node);
  toast(fed
    ? "RefMod Stack added and connected \u2014 its bundle goes on to RefMod Text Encode"
    : "RefMod Stack added and connected. Wire this node's mods output into " +
      "RefMod Text Encode's mods input.", 6000);
  return stack;
}

export function openEditor(node) {
  try {
    // One editor per node. Every route in — double-clicking the node, the
    // prompt bar's scroll, the quick editor's "full editor" button, and the
    // media loader's Prompt Builder button — used to build an unconditional
    // second one. The loader route was the easy one to hit: the loader opens
    // OVER the editor, so handing back from it left the original still up
    // underneath and stacked a fresh copy on top. Two editors on one node
    // then disagree about state, and whichever you save last silently wins.
    if (raiseIfOpen(node._mmh3Editor?.overlay)) return;
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
  // Filled in by keyframes(); relayout() is handed back to the caller so the
  // pane can be re-measured whenever the window it sits in changes size.
  let relayoutPics = () => {};
  let widthToFillHeight = null;
  const keyframes = () => {
    if (isRef) return null;
    const cap = MODE_CAPACITY[state.mode]?.Picture || 0;
    if (!cap) return null;
    let pics;
    try {
      pics = getRefSlots(node).filter((sl) => sl.kind === "Picture").slice(0, cap);
    } catch (e) { return null; }
    if (!pics.length) return null;

    const entries = pics.map((sl) => {
      const img = el("img", { class: "mmh3p-quickimg", src: sl.preview?.url });
      let view = img;
      if (hasCrop(sl.item)) {
        // cropFrame() gives back a window onto the kept region. It fills that
        // window by width and lets the window's height clip, so the window
        // needs the region's own aspect for the crop to land right — the CSS
        // reads it from --ar. The tile is sized to that same aspect below, so
        // the two agree and nothing is cropped a second time.
        view = cropFrame(img, sl.item.crop);
        view.classList.add("mmh3p-quickcrop");
        view.style.setProperty("--ar", String(shownAspect(sl.item) || 1));
      }
      const tile = el("div", { class: "mmh3p-quickpic" }, view,
        el("span", { class: `mmh3p-tagname ${sl.cls}` }, sl.tag));
      const entry = { tile, ar: shownAspect(sl.item) };
      // Older saves never recorded their dimensions. The picture itself knows
      // them once it loads, so take them from there and lay out again — the
      // crop fractions still apply on top.
      if (!entry.ar) {
        img.addEventListener("load", () => {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return;
          entry.ar = shownAspect({ ...sl.item, width: w, height: h })
            || (w / h);
          if (view !== img) view.style.setProperty("--ar", String(entry.ar));
          relayoutPics();
        }, { once: true });
      }
      return entry;
    });

    const pane = el("div", { class: "mmh3p-quickpics" },
      ...entries.map((e) => e.tile));

    // The width this pane would need to stand `h` pixels tall, laid out in a
    // single row — the arrangement that makes the pictures largest once width
    // stops being the binding constraint. The caller uses it to decide how
    // wide the WINDOW has to be, rather than squeezing the fields.
    widthToFillHeight = (h) => entries.reduce(
      (t, e) => t + (Number(e.ar) > 0 ? Number(e.ar) : 16 / 9) * h, 0)
      + PANE_GAP * (entries.length - 1);

    relayoutPics = () => {
      // Measured off the scroll container, whose size comes from the window
      // rather than from what is in it — measuring the pane's own parent
      // instead would feed the pane's width back into its own input.
      const body = pane.parentElement?.parentElement;
      if (!body) return;
      let pad = { top: 0, bottom: 0, left: 0, right: 0 };
      try {
        const cs = getComputedStyle(body);
        pad = { top: parseFloat(cs.paddingTop) || 0,
                bottom: parseFloat(cs.paddingBottom) || 0,
                left: parseFloat(cs.paddingLeft) || 0,
                right: parseFloat(cs.paddingRight) || 0 };
      } catch (e) { /* measured as zero padding */ }
      const out = keyframePaneLayout(entries, {
        width: (body.clientWidth || 0) - pad.left - pad.right,
        height: (body.clientHeight || 0) - pad.top - pad.bottom,
      });
      if (!out) return;
      pane.style.flexDirection = out.dir;
      pane.style.width = `${Math.round(out.paneW)}px`;
      entries.forEach((e, i) => {
        e.tile.style.width = `${Math.round(out.sizes[i][0])}px`;
        e.tile.style.height = `${Math.round(out.sizes[i][1])}px`;
      });
    };
    return pane;
  };
  // Same colour coding as the full editor, minus what only it has room for
  // (hover-preview thumbnails). Slots computed once and reused across every
  // field the quick editor mounts.
  let slots = null;
  const slotFor = (tag) => {
    if (!slots) { try { slots = getRefSlots(node); } catch (e) { slots = []; } }
    return slots.find((s) => s.tag === tag);
  };
  const highlightTags = loadPrefs().highlightTags;

  // Same answer the full editor gives, so a subject is the same colour in
  // both windows. Only the truthiness is used for painting; the full editor's
  // own subjectInfo() adds the hover-preview detail only it has room for.
  const subjectFor = (tag) => subjectLine(state, tag);

  const field = (label, obj, key, rows, placeholder, cls, extra) => {
    const t = el("textarea", {
      rows, placeholder, value: obj[key] ?? "",
      oninput: (e) => { obj[key] = e.target.value; },
    });
    const { wrap } = chipField(t, { slotFor, subjectInfo: subjectFor, names: () => subjectNames(state),
      nameSuggestion: (b) => nameSuggestionFor(b, state), highlightTags });
    const labelEl = extra
      ? el("label", { class: "act" }, label,
          // extra() may hand back one control or several; el() flattens.
          el("span", { class: "mmh3p-secact" }, extra(t)))
      : el("label", {}, label);
    root.append(el("div", { class: "mmh3p-sec" + (cls ? ` ${cls}` : "") },
      labelEl, wrap));
    return t;
  };

  // Self-contained: no shared "last focused field" or cut-time stepper to
  // lean on here, unlike the full editor's toolbar version. Inserts a bare
  // marker — same as the full editor already does for its own timestamp-less
  // "appears in..." fields — leaving any "At MM:SS..." phrasing to be typed
  // by hand.
  const shotBtn = (t) => el("button", { class: "mmh3p-btn",
    title: "Insert the next [Shot N]",
    onclick: () => {
      const val = t.value || "";
      const n = Math.max(0, ...[...val.matchAll(/\[Shot (\d+)\]/g)].map((m) => +m[1])) + 1;
      const pos = t.selectionStart ?? val.length;
      const before = val.slice(0, pos), after = val.slice(pos);
      const insert = (before && !before.endsWith("\n") ? "\n" : "") + `[Shot ${n}] `;
      t.value = before + insert + after;
      t.selectionStart = t.selectionEnd = before.length + insert.length;
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.focus();
    } }, "+ Shot");

  /** The full editor's "add speaker" button, trimmed to what this window can
   *  support. Speaker IDs follow the video's speaking order, so the number
   *  offered is the next one this field hasn't used — the full editor derives
   *  it the same way, just from the whole prompt rather than one field.
   *
   *  The language select defaults to English (LANGS[0]) and is carried on the
   *  button's own row rather than assumed, because the marker it writes has
   *  to name a language and guessing wrong is worse than one more control. */
  /** Speakers already used in this field, in numeric order. The same scan
   *  the full editor runs over the whole prompt, kept local here because a
   *  quick-edit field is the only text this window has. */
  const spkIds = (t) => {
    const used = new Set();
    for (const m of (t.value || "").matchAll(/\((S\d+(?:\s*,\s*S\d+)*)\)/g)) {
      for (const id of m[1].split(",")) used.add(id.trim());
    }
    return [...used].sort((a, b) => (+a.slice(1)) - (+b.slice(1)));
  };

  /** The full editor's dialogue buttons, trimmed to what this window needs.
   *
   *  Progressive, exactly as the full editor is: one button per speaker
   *  already in the text, plus the next unused ID. So a two-speaker scene
   *  ends up with (S1), (S2) and + (S3) — you re-use a speaker by clicking
   *  their own button, not by counting.
   *
   *  No language picker. Lines go out as English, which is LANGS[0] and the
   *  full editor's own default; anything else is a word to change in the
   *  text, and a dropdown for it costs more header room than this window has.
   *
   *  Rebuilt on every edit rather than relabelled, since the button COUNT
   *  changes as speakers are added — which is the behaviour being matched. */
  const spkControl = (t) => {
    const row = el("span", { class: "mmh3p-quickspk" });

    const insert = (id) => {
      const val = t.value || "";
      // Deliberately NOT on its own line: the model reads a line break as a
      // shot boundary, so only [Shot N] may introduce one. Dialogue joins
      // the description it belongs to. Same rule as the full editor.
      const text = `(${id}) says: <d>[${LANGS[0]}] </d>`;
      const pos = t.selectionStart ?? val.length;
      const before = val.slice(0, pos), after = val.slice(pos);
      const pad = before && !/[\s(\u2014]$/.test(before) ? " " : "";
      t.value = before + pad + text + after;
      // Land the caret inside the <d> block, where the words go — the same
      // place the full editor's insert() puts it.
      const dPos = text.indexOf("</d>");
      t.selectionStart = t.selectionEnd = before.length + pad.length + dPos;
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.focus();
    };

    const paint = () => {
      const used = spkIds(t);
      const next = `S${used.length
        ? Math.max(...used.map((x) => +x.slice(1))) + 1 : 1}`;
      const btn = (id, isNew) => el("button", {
        class: "mmh3p-btn" + (isNew ? " ghost" : ""),
        title: isNew
          ? `Add ${id} \u2014 the next speaker in the video's speaking order`
          : `Insert a line for ${id}`,
        onclick: () => insert(id),
      }, isNew ? `+ (${id})` : `(${id})`);
      // .filter(Boolean), because replaceChildren is not el(): el() drops a
      // null child, replaceChildren stringifies it — so the pair button's
      // absence rendered as the literal text "null" beside the buttons
      // whenever there were fewer than two speakers, which is the state the
      // row opens in.
      row.replaceChildren(...[
        ...used.map((id) => btn(id, false)),
        btn(next, true),
        // Two speakers vocalising together, same as the full editor offers
        // once there are two to pair.
        used.length >= 2
          ? el("button", { class: "mmh3p-btn",
              title: "Two speakers vocalising together",
              onclick: () => insert(`${used[0]},${used[1]}`) },
              `(${used[0]},${used[1]})`)
          : null,
      ].filter(Boolean));
    };
    t.addEventListener("input", paint);
    paint();
    return row;
  };

  if (isRef) {
    // Reference mode writes detailed_description instead: its style opening
    // and its shots, the two halves the generator joins.
    field("detailed_description — style opening", target, "styleLine", 2,
      "The target video is in a realistic multi-camera sitcom style…");
    field("detailed_description — shots", target, "detail", 10,
      "[Shot 1] A medium shot establishes <Subject 1>, …", "mmh3p-grow",
      (t) => [shotBtn(t), spkControl(t)]);
  } else {
    field("integrated_multimodal_description", state, "imd", 10,
      "[Shot 1] Live-action, cinematic, …", "mmh3p-grow",
      (t) => [shotBtn(t), spkControl(t)]);
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
    const { wrap } = chipField(t, { slotFor, subjectInfo: subjectFor, names: () => subjectNames(state),
      nameSuggestion: (b) => nameSuggestionFor(b, state), highlightTags });
    pair.append(el("div", { class: "mmh3p-sec" },
      el("label", { class: "act" }, label,
        el("span", { class: "mmh3p-secact" }, na)),
      wrap));
    return t;
  };
  const soundTa = audioBox("overall_soundscape", "soundscape",
    "Ambience, physical action sounds, non-verbal human sounds.");
  const musicTa = audioBox("non_diegetic_music", "music",
    "Instrumentation, tempo, rhythm, dynamics. No abstract mood words.");
  // Named so a caller can open straight into one of them — the node bar's
  // 🔊/🎵 marks do exactly that.
  const fieldFor = { soundscape: soundTa, music: musicTa };
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
  return { root: shell, save, state, fieldFor, relayoutPics,
           widthToFillHeight: (h) => widthToFillHeight?.(h) || 0 };
}

/** The quick-edit window, opened by clicking the node's prompt bar. The bar's
 *  scroll still opens the full builder, so both routes stay available.
 *
 *  `focusKey` names a field to open into ("soundscape" / "music"), used by
 *  the bar's 🔊/🎵 marks so clicking one lands on the section it stands for. */
/** The quick editor's own settings: how big this window is, and how it
 *  splits between the keyframe pane and the fields. Deliberately just these
 *  two — the editor's own preferences live on its cog and would be noise
 *  here, the same call the Prompt Library's settings make.
 *
 *  `onApply` re-lays-out the window; the sliders are not live for the same
 *  reason the other windows' are not — resizing moves the menu out from under
 *  the pointer mid-drag. */
function quickPrefsButton(onApply) {
  const prefs = loadPrefs();
  // textScale is the pack's own text-size pref, shared with the full editor
  // rather than given a quick-edit twin. It resolves to one global custom
  // property (--mmh3-fs on documentElement), so two prefs writing it would
  // fight and whichever window opened last would win — and "text size" reads
  // as one setting anyway. Window size stays per-window, since the two
  // windows are genuinely different sizes.
  const pending = { quickScale: prefs.quickScale,
                    textScale: prefs.textScale };
  const inputs = {}, outs = {};
  const maxFor = (k) => k === "textScale" ? TEXT_SCALE_MAX : SCALE_MAX;
  const dirty = () => applyBtn.classList.toggle("primary",
    pending.quickScale !== prefs.quickScale
    || pending.textScale !== prefs.textScale);

  const slider = (key, label) => {
    const out = el("input", { type: "number", class: "mmh3p-scaleval",
      min: String(Math.round(SCALE_MIN * 100)),
      max: String(Math.round(maxFor(key) * 100)), step: "5",
      value: String(Math.round(pending[key] * 100)),
      onchange: (e) => {
        pending[key] = clampScale(Number(e.target.value) / 100,
          maxFor(key));
        const shown = Math.round(pending[key] * 100);
        e.target.value = String(shown); inputs[key].value = String(shown);
        dirty();
      },
      onkeydown: (e) => { if (e.key === "Enter") { e.stopPropagation();
        e.target.blur(); } } });
    const input = el("input", { type: "range", class: "mmh3p-scalerange",
      min: String(Math.round(SCALE_MIN * 100)),
      max: String(Math.round(maxFor(key) * 100)), step: "5",
      value: String(Math.round(pending[key] * 100)),
      oninput: (e) => {
        pending[key] = clampScale(Number(e.target.value) / 100,
          maxFor(key));
        out.value = String(Math.round(pending[key] * 100));
        dirty();
      } });
    inputs[key] = input; outs[key] = out;
    return el("label", { class: "mmh3p-scalerow" },
      el("span", { class: "mmh3p-scalelabel" }, label), input, out,
      el("span", { class: "mmh3p-scalepct" }, "%"));
  };

  const set = (w, t) => {
    prefs.quickScale = w; prefs.textScale = t;
    pending.quickScale = w; pending.textScale = t;
    for (const [k, v] of [["quickScale", w], ["textScale", t]]) {
      inputs[k].value = String(Math.round(v * 100));
      outs[k].value = String(Math.round(v * 100));
    }
    savePrefs(prefs);
    onApply();
    applyBtn.classList.remove("primary");
  };
  const applyBtn = el("button", { class: "mmh3p-btn",
    onclick: () => set(pending.quickScale, pending.textScale) }, "Apply");
  const resetBtn = el("button", { class: "mmh3p-btn",
    onclick: () => set(1, 1) }, "Reset");

  const menu = el("div", { class: "mmh3p-prefmenu" },
    slider("quickScale", "Window size"),
    slider("textScale", "Text size"),
    el("div", { class: "mmh3p-scalefoot" }, resetBtn, applyBtn));
  const cog = el("button", { class: "mmh3p-btn", title: "Quick edit settings",
    onclick: (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains("on");
      menu.classList.toggle("on", open);
      cog.classList.toggle("on", open);
    } }, "\u2699");
  return el("span", { class: "mmh3p-prefwrap" }, cog, menu);
}

export function openQuickEdit(node, focusKey = null) {
  injectCSS();
  if (raiseIfOpen(node._mmh3Quick)) return;
  // The full editor and the quick editor are two views of the same prompt,
  // so a second view of it is the same hazard as a second editor.
  if (raiseIfOpen(node._mmh3Editor?.overlay)) return;
  const fields = promptFields(node);
  const mode = fields.state.mode;
  const close = () => {
    overlay.remove();
    node._mmh3Quick = null;      // or reopening finds a stale, dead overlay
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
        quickPrefsButton(() => applyQuickScale()),
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
  node._mmh3Quick = overlay;
  // Window size is a preference rather than a fixed box, so it is applied
  // here and re-applied whenever the setting changes. The pane follows,
  // since its own size is measured against this window.
  const applyQuickScale = () => {
    const box = overlay.querySelector(".mmh3p-quickmodal");
    if (!box) return;
    const p = loadPrefs();
    const w = clampScale(p.quickScale);
    box.style.width = `min(${Math.round(900 * w)}px, 88vw)`;
    box.style.height = `min(${Math.round(585 * w)}px, 66vh)`;
    // Text size, applied the same way the full editor applies it — on the
    // document, because --mmh3-fs is a single global custom property. Until
    // now only the full editor ever wrote it, so opening the quick editor
    // without having opened the full one first left the stored text size
    // unapplied: the setting existed and this window ignored it.
    try {
      document.documentElement.style.setProperty(
        "--mmh3-fs", String(clampScale(p.textScale, TEXT_SCALE_MAX)));
    } catch (e) { /* the stylesheet's own default of 1 still applies */ }
    growForPics(box, p);
    fields.relayoutPics?.();
  };

  /** Widen the window so the preview can stand at the window's full height.
   *
   *  The preview is height-first: a picture should use every pixel of height
   *  the window has. For a tall or square picture that costs nothing, but a
   *  16:9 needs about 1.8x its height in width, which the base 900px window
   *  cannot give it without starving the prompt fields beside it — measured,
   *  a 16:9 reached 54% of the available height.
   *
   *  So the window grows instead of the fields shrinking. It is centred in
   *  the overlay, so the extra room opens out on the picture's side; the
   *  fields keep their own floor untouched. Clamped to the viewport, where a
   *  very wide picture simply gets whatever the screen allows.
   *
   *  Only ever grows past the size the window-size preference asks for, never
   *  below it. */
  const growForPics = (box, prefs) => {
    const body = overlay.querySelector(".mmh3p-quickbody");
    if (!box || !body) return;
    let pad = { top: 0, bottom: 0, left: 0, right: 0 };
    try {
      const cs = getComputedStyle(body);
      pad = { top: parseFloat(cs.paddingTop) || 0,
              bottom: parseFloat(cs.paddingBottom) || 0,
              left: parseFloat(cs.paddingLeft) || 0,
              right: parseFloat(cs.paddingRight) || 0 };
    } catch (e) { /* measured as zero padding */ }
    const availH = (body.clientHeight || 0) - pad.top - pad.bottom;
    // Height is fixed by the window's own height, so it is already known here
    // and does not depend on the width this is about to set.
    const need = availH > 0 ? fields.widthToFillHeight?.(availH) || 0 : 0;
    const base = Math.round(900 * clampScale(prefs.quickScale));
    if (!(need > 0)) { box.style.width = `min(${base}px, 88vw)`; return; }
    const chrome = Math.max(0, Math.round(
      (box.getBoundingClientRect().width || base) - (body.clientWidth || 0)))
      + pad.left + pad.right;
    const want = Math.round(need + PANE_GAP + PANE_FIELDS_MIN + chrome);
    box.style.width = `min(${Math.max(base, want)}px, 96vw)`;
  };

  applyQuickScale();

  // The keyframe pane sizes itself to the pictures, which needs the window's
  // real measurements — so it runs once mounted, and again whenever the
  // window it sits in changes size.
  fields.relayoutPics?.();
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => fields.relayoutPics?.());
    ro.observe(overlay.querySelector(".mmh3p-quickbody"));
  }

  setTimeout(() => {
    // Straight into the named field when one was asked for, so the bar's
    // audio marks land on the section they stand for; the first field
    // otherwise, as before.
    const want = focusKey && fields.fieldFor?.[focusKey];
    const t = want || fields.root.querySelector("textarea");
    t?.focus();
    // Caret at the end rather than selecting nothing at position 0 — this
    // opens on a field that already has text, and typing should extend it.
    try { t.selectionStart = t.selectionEnd = t.value.length; } catch (e) {}
    t?.scrollIntoView?.({ block: "nearest" });
  }, 0);
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
/** The aspect ratio a picture actually shows once its rotation and crop are
 *  applied — what the model receives, not what is on disk. Null when the item
 *  never recorded its dimensions (older saves), which callers treat as "lay it
 *  out without an aspect hint". Mirroring is left out on purpose: it flips the
 *  frame without changing its proportions. */
function shownAspect(item) {
  if (!item) return null;
  let w = Number(item.width), h = Number(item.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const turn = ((parseInt(item.rotate, 10) || 0) % 360 + 360) % 360;
  if (turn === 90 || turn === 270) { const t = w; w = h; h = t; }
  if (hasCrop(item)) {
    w *= Number(item.crop.w) || 1;
    h *= Number(item.crop.h) || 1;
  }
  return w > 0 && h > 0 ? w / h : null;
}

/* Keyframe pane geometry. The pane takes its size from the pictures rather
   than the pictures being fitted into a fixed column, so nothing is cropped
   and no letterbox bars are left over. */
const PANE_GAP = 8;          // between two pictures
// Below this the audio pair stacks and the description field starts to feel
// cramped, so the previews give way rather than the writing surface.
const PANE_FIELDS_MIN = 420;

/** Size the keyframe pane and its tiles to the pictures' own aspect ratios.
 *
 *  `entries` is [{ tile, ar }]; `avail` is the space the pane may use. Two
 *  pictures go side by side when their full-height widths fit the budget, and
 *  stack otherwise — "side by side if there is horizontal room, vertical if
 *  not". Whichever way round, every tile ends up at exactly its picture's
 *  aspect, so `object-fit:contain` has nothing left to letterbox and the pane
 *  itself is only as wide as the pictures need.
 *
 *  Pure geometry, no DOM reads: the caller measures once and passes it in,
 *  which keeps this testable and keeps the measure/write phases apart. */
function keyframePaneLayout(entries, avail) {
  const availW = Number(avail?.width) || 0;
  const availH = Number(avail?.height) || 0;
  if (!availW || !availH || !entries.length) return null;
  // The pane may take everything except the fields' own floor. There used to
  // be a second cap at 65% of the width; it is gone because the window now
  // grows to fit a picture that wants to be full height (see growForPics in
  // openQuickEdit), and that cap was then the one thing still holding the
  // picture short of the height it had just been given room for.
  const budget = Math.max(1, availW - PANE_GAP - PANE_FIELDS_MIN);
  // 16:9 stands in for a picture whose dimensions were never recorded; the
  // caller replaces it and re-runs once the image reports its own.
  const ars = entries.map((e) => (Number(e.ar) > 0 ? Number(e.ar) : 16 / 9));

  // How tall each picture can be in either arrangement, given both the width
  // budget and the height available. Comparing the two is what decides the
  // layout: side by side wins exactly when it leaves the pictures bigger,
  // which is what "is there horizontal room" amounts to. Testing whether a
  // full-height row *fits* instead got this wrong — the row was pinned to the
  // full height, so two wide pictures stacked even in a very wide window
  // where side by side would plainly have been roomier.
  const gaps = PANE_GAP * (ars.length - 1);
  const sum = ars.reduce((t, a) => t + a, 0);
  const widest = Math.max(...ars);
  const rowH = Math.min(availH, (budget - gaps) / sum);
  const colH = Math.min((availH - gaps) / ars.length, budget / widest);

  const dir = rowH > colH ? "row" : "column";
  const each = Math.max(1, dir === "row" ? rowH : colH);
  const sizes = ars.map((a) => [each * a, each]);
  const paneW = dir === "row"
    ? sizes.reduce((t, sz) => t + sz[0], 0) + PANE_GAP * (sizes.length - 1)
    : Math.max(...sizes.map((sz) => sz[0]));
  return { dir, paneW, sizes };
}

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

/** `classFor` optionally resolves a tag against what is actually loaded, so
 *  the preview can mark an undefined tag red exactly as the input fields do.
 *  Without it every tag is assumed defined, which is right for the node's
 *  prompt bar — it has no editor state to check against. */
function paintTags(text, classFor = null) {
  return escapeHtml(text)
    .replace(/&lt;(Subject|Picture|Video|Audio) (\d+)&gt;/g,
      (m, k, n) => {
        const cls = classFor ? classFor(`<${k} ${n}>`) : TAG_CLASS[k];
        return `<span class="mmh3p-t-${cls}">&lt;${k} ${n}&gt;</span>`;
      })
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
    preview.textContent = "click to open the quick editor";
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
    // A draft is invisible from the canvas otherwise, and it is exactly the
    // state where "why isn't my edit showing?" gets asked.
    node._mmh3DraftActive ? "draft in progress" : "",
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
  // Clicking a mark opens the quick editor with that section's field focused,
  // rather than the generic open the rest of the bar does — the icon already
  // names the field, so it may as well take you to it.
  const mark = (icon, key, label) => el("span", {
    class: "mmh3p-summark",
    title: `${label} has content \u2014 click to edit it`,
    onclick: (e) => { e.stopPropagation(); openQuickEdit(node, key); },
  }, icon);
  if (filled("soundscape", "overall_soundscape"))
    marks.push(mark("\u{1F50A}", "soundscape", "overall_soundscape"));
  if (filled("music", "non_diegetic_music"))
    marks.push(mark("\u{1F3B5}", "music", "non_diegetic_music"));

  node._mmh3Summary.title = `${detail}\nClick to open the editor`;
  node._mmh3Summary.replaceChildren(scroll, preview, ...marks, btn);
}

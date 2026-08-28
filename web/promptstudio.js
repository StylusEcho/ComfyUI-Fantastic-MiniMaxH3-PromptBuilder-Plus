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
import {
  LoaderPanel, applyCanvasSizing, applyTextScale, loadScalePrefs,
  PANEL_H, NODE_W,
} from "./medialoader.js";
import {
  openEditor, openQuickEdit, updateSummary, promptFields, hideWidget, el,
  injectCSS, restoreDraftFlag,
} from "./promptbuilder.js";

// Logged at module scope: if this line is missing from the console the file
// never loaded (or one of its imports threw), which is a very different fault
// from the extension loading and then failing on a particular node.
console.log("[MiniMaxH3 PromptStudio] module loaded");

const STUDIO_NAME = "MiniMaxH3PromptStudio";
const SUMMARY_H = 52;   // two clamped preview lines + padding
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
  const expand = !!sh && sh.pictures === 0;

  if (!expand) {
    if (node._mmh3Expanded) {
      node._mmh3Expanded = false;
      bar.classList.remove("mmh3p-summary-open");
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
  bar.replaceChildren(fields.root);
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

        this._mmlPanel = new LoaderPanel(this);
        // The prompt bar mounts flush beneath this panel, so the two square
        // off the edge they share and read as a single surface.
        this._mmlPanel.root.classList.add("mmlp-joinbelow");

        // The prompt bar: preview, audio marks and the mode button, with the
        // scroll at its left opening the full editor.
        const summary = el("div", {
          class: "mmh3p-summary mmh3p-joinabove",
          title: "Quick-edit the prompt \u2014 the scroll opens the full editor",
          // A floor, not a fixed height: the flex rules decide how tall the
          // bar actually is, and setting `height` here is what used to go
          // stale. This only stops the collapsed bar shrinking below the two
          // preview lines it is meant to show.
          style: { cursor: "pointer", minHeight: `${SUMMARY_H}px` },
          onclick: () => openQuickEdit(this),
        });
        this._mmh3Summary = summary;

        // ONE widget for the pair, not one each. They were two, and their
        // heights had to be reconciled by hand every time the layout changed
        // — which is exactly what went wrong: T2VA's "Used" layout collapsed
        // the panel's element but left its widget reserving the old height,
        // stranding a few hundred pixels of dead space between the toolbar
        // and the fields. Inside this stack the split is a flex rule, so the
        // browser keeps them adjacent by construction and there is no second
        // height to go stale.
        this._mmh3Stack = el("div", { class: "mmh3p-nodestack" },
          this._mmlPanel.root, summary);
        const widget = this.addDOMWidget("mml_panel", "div",
          this._mmh3Stack, { serialize: false });
        applyCanvasSizing(this, widget, NODE_W, STACK_H);
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] on-node panel failed; "
          + "right-click a slot, or open the loader window, instead:", e);
      }

      setTimeout(() => {
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
        // A saved node restores its own height, so re-fit after that lands.
        fitPanel(this, baseComputeSize);
        refreshBar(this);
        restoreDraftFlag(this);
      }, 0);
      return r;
    };
  },
});

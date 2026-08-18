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
  LoaderPanel, applyCanvasSizing, PANEL_H, NODE_W,
} from "./medialoader.js";
import {
  openEditor, openQuickEdit, updateSummary, promptFields, hideWidget, el,
  injectCSS,
} from "./promptbuilder.js";

// Logged at module scope: if this line is missing from the console the file
// never loaded (or one of its imports threw), which is a very different fault
// from the extension loading and then failing on a particular node.
console.log("[MiniMaxH3 PromptStudio] module loaded");

const STUDIO_NAME = "MiniMaxH3PromptStudio";
const SUMMARY_H = 52;   // two clamped preview lines + padding
const EDITOR_H = 300;   // the bar expanded into the three prompt fields
/* The prompt bar is the node's last widget, so without this it sits hard
   against the bottom edge while the panel above it is inset left and right.
   Reported as part of the widget's height but not given to the element, so it
   reads as a margin under the bar. fitPanel()/minSize() measure the overhead
   rather than assuming it, so both pick this up on their own. */
const BOTTOM_GAP = 8;

/** In T2VA there is no reference media, so the mode-shaped loader steps aside
 *  and the prompt bar takes the room instead — the three fields inline, using
 *  the same block the quick-edit window mounts. Anything else keeps the bar.
 *
 *  Saves as you type rather than on a button, since there is nothing to
 *  dismiss; the save is the full editor's own, so this cannot diverge. */
function refreshBar(node) {
  const bar = node._mmh3Summary;
  const widget = node.widgets?.find((w) => w.name === "mmh3_summary");
  if (!bar || !widget) return;
  const sh = node._mmlPanel?.shape?.();
  const expand = !!sh && sh.pictures === 0;

  if (!expand) {
    if (node._mmh3Expanded) {
      node._mmh3Expanded = false;
      bar.classList.remove("mmh3p-summary-open");
      widget.computedHeight = SUMMARY_H + BOTTOM_GAP;
      widget.computeSize = () => [NODE_W, SUMMARY_H + BOTTOM_GAP];
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
  widget.computedHeight = EDITOR_H + BOTTOM_GAP;
  widget.computeSize = () => [NODE_W, EDITOR_H + BOTTOM_GAP];
}

/** The panel widget's current height, read back off the widget rather than
 *  kept in a cache that could drift out of step with it. */
function panelHeight(widget) {
  try {
    const h = widget.computeSize()[1];
    return Number.isFinite(h) ? h : PANEL_H;
  } catch (e) { return PANEL_H; }
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
      widget.computeSize = () => [NODE_W, PANEL_H];
      widget.computedHeight = PANEL_H;
    }
    const out = base ? base.call(node) : null;
    const w = Math.max(NODE_W, out?.[0] || 0);
    const h = Number.isFinite(out?.[1]) ? out[1] : PANEL_H;
    return [w, h];
  } catch (e) {
    return [NODE_W, PANEL_H];
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
  if (!widget) return;
  // Minimised (T2VA): the panel is deliberately collapsed to its content and
  // the prompt bar takes the room. Writing an inline height here would beat
  // the class rule that collapses it and pin the panel open for good.
  if (node._mmlPanel?.shape?.()?.pictures === 0) return;
  const overhead = minSize(node, base)[1] - PANEL_H;
  const height = Math.max(PANEL_H, Math.round((node.size?.[1] || 0) - overhead));
  if (!Number.isFinite(height) || height === panelHeight(widget)) return;

  widget.computedHeight = height;
  widget.computeSize = () => [NODE_W, height];
  // Inline styles beat .mmlp-panel's fixed height without touching the shared
  // rule the standalone Media Loader still relies on.
  const root = node._mmlPanel?.root;
  if (root) {
    root.style.height = `${height}px`;
    root.style.minHeight = `${height}px`;
  }
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
        // to redraw the summary's count. LoaderPanel.commit calls this.
        this._mmlOnCommit = () => refreshBar(this);

        this._mmlPanel = new LoaderPanel(this);
        // The prompt bar mounts flush beneath this panel, so the two square
        // off the edge they share and read as a single surface.
        this._mmlPanel.root.classList.add("mmlp-joinbelow");
        const widget = this.addDOMWidget("mml_panel", "div",
          this._mmlPanel.root, { serialize: false });
        applyCanvasSizing(this, widget, NODE_W, PANEL_H);
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] on-node media panel failed; "
          + "right-click a slot, or open the loader window, instead:", e);
      }

      // The prompt bar sits under it: preview, audio marks and the mode
      // button, with the scroll at its left opening the full editor.
      try {
        if (this.addDOMWidget) {
          const summary = el("div", {
            class: "mmh3p-summary mmh3p-joinabove",
            title: "Quick-edit the prompt \u2014 the scroll opens the full editor",
            style: { cursor: "pointer", height: `${SUMMARY_H}px`,
                     minHeight: `${SUMMARY_H}px` },
            onclick: () => openQuickEdit(this),
          });
          this._mmh3Summary = summary;
          const sw = this.addDOMWidget("mmh3_summary", "div", summary,
            { serialize: false });
          sw.computedHeight = SUMMARY_H + BOTTOM_GAP;
          sw.computeSize = () => [NODE_W, SUMMARY_H + BOTTOM_GAP];
        }
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] summary panel failed:", e);
      }

      setTimeout(() => { try { refreshBar(this); } catch (e) { /* cosmetic */ } }, 0);
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
          NODE_W, PANEL_H);
        // A saved node restores its own height, so re-fit after that lands.
        fitPanel(this, baseComputeSize);
        refreshBar(this);
      }, 0);
      return r;
    };
  },
});

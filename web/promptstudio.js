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
  LoaderPanel, addSplitter, openLoaderModal, applyCanvasSizing,
  PANEL_H, NODE_W,
} from "./medialoader.js";
import {
  openEditor, updateSummary, hideWidget, el, injectCSS,
} from "./promptbuilder.js";

// Logged at module scope: if this line is missing from the console the file
// never loaded (or one of its imports threw), which is a very different fault
// from the extension loading and then failing on a particular node.
console.log("[MiniMaxH3 PromptStudio] module loaded");

const STUDIO_NAME = "MiniMaxH3PromptStudio";
// Outputs are (prompt, references, picture_1, picture_2, ref2va_needed) —
// the splitter wants the bundle, which is the second one.
const REFS_SLOT = 1;
const SUMMARY_H = 52;   // two clamped preview lines + padding

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
  const overhead = minSize(node, base)[1] - PANEL_H;
  const height = Math.max(PANEL_H, Math.round((node.size?.[1] || 0) - overhead));
  if (!Number.isFinite(height) || height === panelHeight(widget)) return;

  widget.computedHeight = height;
  widget.computeSize = () => [NODE_W, height];
  // Inline styles beat .mml-panel's fixed height without touching the shared
  // rule the standalone Media Loader still relies on.
  const root = node._mmlPanel?.root;
  if (root) {
    root.style.height = `${height}px`;
    root.style.minHeight = `${height}px`;
  }
}

app.registerExtension({
  name: "MiniMaxH3.PromptStudio",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== STUDIO_NAME) return;
    console.log("[MiniMaxH3 PromptStudio] extension registered");

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);

      // The buttons come first and are the one part that must never be lost:
      // both open a modal, so the node stays fully usable even if the on-node
      // panel or summary below fails to build. (They also have to precede any
      // DOM widget — in Nodes 2.0 a plain widget added after one anchors to
      // the node's bottom and leaves a gap on resize.)
      this.addWidget("button", "Prompt Builder", null, () => openEditor(this));
      this.addWidget("button", "Open Media Loader in Window", null,
        () => openLoaderModal(this, "MiniMax H3 Prompt Studio — media"));
      this.addWidget("button", "+ Native-output splitter", null,
        () => addSplitter(this, REFS_SLOT));

      try {
        injectCSS();
        hideWidget(this, "prompt_text");
        hideWidget(this, "builder_state");
        hideWidget(this, "media_state");
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] could not hide the state "
          + "widgets; they stay visible but still work:", e);
      }

      // Clickable summary, as on the Prompt Builder: a layout-independent way
      // into the editor when the canvas button is hard to hit.
      try {
        if (this.addDOMWidget) {
          const summary = el("div", {
            class: "mmh3-summary",
            title: "Open the prompt editor",
            style: { cursor: "pointer", height: `${SUMMARY_H}px`,
                     minHeight: `${SUMMARY_H}px` },
            onclick: () => openEditor(this),
          });
          this._mmh3Summary = summary;
          const sw = this.addDOMWidget("mmh3_summary", "div", summary,
            { serialize: false });
          sw.computedHeight = SUMMARY_H;
          sw.computeSize = () => [NODE_W, SUMMARY_H];
        }
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] summary panel failed:", e);
      }

      try {
        // Media and prompt share this node, so a change to the inventory has
        // to redraw the summary's count. LoaderPanel.commit calls this.
        this._mmlOnCommit = () => updateSummary(this);

        this._mmlPanel = new LoaderPanel(this);
        const widget = this.addDOMWidget("mml_panel", "div",
          this._mmlPanel.root, { serialize: false });
        applyCanvasSizing(this, widget, NODE_W, PANEL_H);
      } catch (e) {
        console.error("[MiniMaxH3 PromptStudio] on-node media panel failed; "
          + "use the 'Open Media Loader in Window' button instead:", e);
      }

      setTimeout(() => { try { updateSummary(this); } catch (e) { /* cosmetic */ } }, 0);
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
        updateSummary(this);
      }, 0);
      return r;
    };
  },
});

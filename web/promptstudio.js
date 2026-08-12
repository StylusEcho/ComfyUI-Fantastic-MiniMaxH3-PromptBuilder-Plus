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

const STUDIO_NAME = "MiniMaxH3PromptStudio";
// Outputs are (prompt, references) — the splitter wants the second one.
const REFS_SLOT = 1;
const SUMMARY_H = 46;

app.registerExtension({
  name: "MiniMaxH3.PromptStudio",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== STUDIO_NAME) return;
    console.log("[MiniMaxH3 PromptStudio] extension registered");

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      injectCSS();
      hideWidget(this, "prompt_text");
      hideWidget(this, "builder_state");
      hideWidget(this, "media_state");

      // Every canvas button first: in Nodes 2.0 a plain widget added after a
      // DOM widget anchors to the node's bottom and leaves a gap on resize.
      this.addWidget("button", "Edit prompt…", null, () => openEditor(this));
      this.addWidget("button", "Media in a window…", null,
        () => openLoaderModal(this, "MiniMax H3 Prompt Studio — media"));
      this.addWidget("button", "+ Native-output splitter", null,
        () => addSplitter(this, REFS_SLOT));

      // Clickable summary, as on the Prompt Builder: a layout-independent way
      // into the editor when the canvas button is hard to hit.
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

      // Media and prompt share this node, so a change to the inventory has to
      // redraw the summary's reference count. LoaderPanel.commit calls this.
      this._mmlOnCommit = () => updateSummary(this);

      this._mmlPanel = new LoaderPanel(this);
      const widget = this.addDOMWidget("mml_panel", "div", this._mmlPanel.root,
        { serialize: false });
      applyCanvasSizing(this, widget, NODE_W, PANEL_H);

      setTimeout(() => updateSummary(this), 0);
      return r;
    };

    // Canvas-only: Vue owns sizing there, so failure here must be harmless.
    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      try {
        const min = this.computeSize();
        size[0] = Math.max(NODE_W, size[0]);
        size[1] = Math.max(min[1], size[1]);
      } catch (e) { /* leave the size alone */ }
      return onResize?.apply(this, arguments);
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
        updateSummary(this);
      }, 0);
      return r;
    };
  },
});

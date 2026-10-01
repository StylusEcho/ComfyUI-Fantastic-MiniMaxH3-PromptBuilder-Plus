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
import { StackPanel, readStack, openStackModal, refreshStackLabels } from "./refmodstack.js";

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

/** The RefMods grid follows the node's own text size, like the media panel —
 *  not the stack node's separate ⤡ Size preference, which it doesn't show. */
function applyTabText(node) {
  try { node._mmrPanel?.root?.style.setProperty("--mmh3-fs", String(loadScalePrefs().text || 1)); }
  catch (e) { /* the panel's own default applies */ }
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
        // The RefMods tab: the same panel a RefMod Stack node carries, holding
        // this node's own picks in its stack_state widget. `_mmrPanel` is the
        // name the rest of the pack already reloads after an edit elsewhere
        // (the RefMods window, a draft's snapshot being applied).
        let stackRoot = null;
        try {
          this._mmrPanel = new StackPanel(this, { embedded: true,
            swap: () => swapButton(this, "mmrp-btn") });
          this._mmrOnCommit = () => refreshTabCount(this);
          // For the full-size media loader's ◈ RefMods button: this node's
          // RefMods docked beside it (see openLoaderModal). A hook rather
          // than an import, since medialoader.js can't import refmodstack.js.
          this._mmrOpenDocked = (host, onUndock) => openStackModal(this, { host,
            onClose: () => { refreshTabCount(this); onUndock?.(); } });
          stackRoot = this._mmrPanel.root;
          applyTabText(this);
        } catch (e) {
          // RefMods are optional on top of the core node; losing the tab
          // must not take the media panel and the prompt bar with it.
          console.error("[MiniMaxH3 PromptStudio] RefMods tab failed:", e);
          this._mmrPanel = null;
        }
        this._mmh3Stack = el("div", { class: "mmh3p-nodestack" },
          this._mmlPanel.root, stackRoot, summary);
        const widget = this.addDOMWidget("mml_panel", "div",
          this._mmh3Stack, { serialize: false });
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
        try { applyTextScale(this._mmlPanel, loadScalePrefs().text); applyTabText(this); }
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

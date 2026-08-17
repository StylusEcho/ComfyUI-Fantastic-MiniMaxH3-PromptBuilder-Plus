# Prompt Studio Tasks List

Status key: `🟦` pending · `🟨` in progress · `🟩` complete · `🟥` blocked · `❓` needs your call

---

1. 🟩 if any of the below or past changes conflict, or are redundant compared to latest upstream repo changes, flag it. the majority of the following was written before those changes.

   **Audit against the upstream 1.5.0–1.5.4 merge. Four items flagged, everything else is unaffected and stands as written.**

   - **#34 is obsolete** — the video *detail* dropdown it asks to narrow no longer
     exists. Upstream replaced the `detail` field with a per-item `resize` cap set
     in the ✂ trim/crop editor (and removed `DETAIL_CAPS`), so there is no control
     left to resize. Closed as 🟩 with nothing to do.
   - **#6 needs your call (❓)** — moving `model` to the first output renumbers
     *every* output slot, which silently rewires every saved workflow built on this
     node. The pack has an explicit rule against this (new outputs are appended last
     precisely so slots never shift; see the comment on `RETURN_NAMES` in
     `nodes.py`). Happy to do it if you accept the breakage — say the word.
   - **#38 is truncated (❓)** — the sentence ends mid-clause: "when I connect this
     bool input to the ref2va\_needed output of". Can't tell what the symptom is.
   - **#43 / #44 reference a "quick album" (❓)** — there is no album feature in this
     pack, and none in the upstream repo either (checked both). If it is something
     you saw in another pack, or a name for an existing view, let me know which.

   **Found later, while starting #8 — the biggest one:** upstream's 1.5.0 commit
   **disabled the pinned-media pane** (`drawPins()` opens with `if (true) return;`,
   commented "chips in the text carry the previews now"), but left the 📌 pin
   button on every reference card. So pinning turned the button red and did nothing
   else — a dead control. That retired the feature **#8, #9, #10, #11 and #40** were
   all written against. You chose to follow upstream and drop pins rather than
   restore the pane, so those five are closed as obsolete and the dead button is
   gone. See #8 for what was removed.

   Two more worth knowing about, neither blocking:

   - **#12 / #13 supersede recent work rather than upstream.** Linked video+audio are
     currently *two* cards joined edge-to-edge with squared inner corners
     (`joinL`/`joinR`, built last session). #12 replaces that with a single
     `Video 1 + Audio 1` chip, so that styling gets torn out — intended, just noting
     it is not additive.
   - **#25 gets easier post-merge.** Upstream added the tag-painting chain the
     editor's preview uses, so colouring the prompt bar's preview is reuse rather
     than new parsing.

2. 🟩 remove the drag button on the media loader thumbnail for minimized I2VA mode

   `picCell()` takes a `reorder` flag, and the compact layout passes `false`
   whenever it shows a single slot — I2VA and L2VA. The ☰ handle and the drag
   listeners both go; FL2VA keeps them, since swapping there is what decides which
   picture is the first frame and which the last. The right-click menu is attached
   before the early return, so copy / paste / remove still work on a slot that can
   no longer be dragged.
3. 🟩 show the 15 sec mark with a line after the starting marker in the trimming window. the ending marker can snap to this marker.

   A dashed amber line labelled `15s` is drawn at `start + 15s` on the trim bar and
   rides with the start handle, since the budget is measured from wherever the kept
   range begins. It is hidden when the clip already fits inside the budget, where it
   would only ever pin to the end. Dragging the end handle within ~1% of the line
   snaps it exactly onto 15.00s; the start handle is unaffected. The line sits below
   the handles and takes no pointer events, so a handle parked on it is still
   grabbable and clicking through it still scrubs. The readout now also flags going
   *over* 15s, not just under 2s.
4. 🟩 join the prompt bar on the node with the media loader

   The two widgets already stacked flush (the node's 528px floor is exactly
   476 + 52, no gap) — they only *read* as separate boxes because each drew its
   own border and rounded corners. So the panel squares off its bottom corners and
   drops its bottom border, and the bar squares off its top corners and takes the
   panel's background and border colour, keeping its own top border as the divider
   between them. Outer corners are matched at 8px. Measured in Chromium: seam gap
   0px, identical backgrounds, one 1px divider, total height unchanged at 528.
   Applied only on the Studio node, so the media loader's own modal is untouched.
5. 🟩 provide some alternative names to "Mode" for the media loader layout button

   Offered *Used / All*, *Compact / Full*, *In use / All slots* and *Fit / All*; you
   picked **Used / All**, so the toggle now reads `◰ Used` / `◱ All`. Took the
   chance to make the tooltips symmetric — the "All" state previously described what
   clicking would do while the "Mode" state described what you were looking at, so
   only one of them told you the current state. Both now do.
6. ❓ put the model node output first in the outputs — **see #1: this renumbers every output slot and breaks saved workflows. Needs your go-ahead.**
7. 🟩 if there is never any other button options except N/A below the sound/audio boxes, move them to the top right of their sections.

   Confirmed the premise: N/A is the only button on those boxes, at all four call
   sites (soundscape + music, in base and REF modes). `secLabel()` now takes
   trailing `actions` that lay out against the right edge of the heading, and the
   audio sections pass their N/A there — so the field below runs the full width of
   the section instead of sharing a row. Two details worth noting: the button's
   click handler resolves its field with `closest('.mmh3p-sec')`, which still
   works from inside the label (verified in Chromium — it finds the textarea and
   fires the `input` event that updates state and repaints the chip mirror); and
   the switched-off heading style is a strikethrough, which is now explicitly
   cancelled on the actions so it can't strike through the button. The header rule
   is a descendant selector, otherwise `.mmh3p-btn` — declared later in the sheet —
   won on equal specificity and left a 31px button in a 12px heading.
8. 🟩 show playback controls for pinned videos

   **Obsolete — pins removed instead, per your call.** Upstream retired the pinned
   pane in 1.5.0 but left the pin button wired to nothing (see #1). Rather than
   restore the pane, this removes the feature outright: the 📌 card tool,
   `togglePin`, `syncCaretPin`, `caretTag`, `drawPins`, the `pins`/`autoPin` state,
   the caret-tracking listeners, and all the pin CSS including the floating
   wide-screen pane and its `--mmh3p-gap` variable.

   One thing that had to be fixed with it: the pane occupied a **grid track**, so
   deleting the element without changing `grid-template-columns` dropped the side
   panel onto a second row (measured: preview 797px wide instead of 439, footer
   spilling). The body grid is now 2 tracks, 3 with the sidebar, and the side panel
   is a consistent 440px in every configuration — slightly wider than the 400px it
   used to shrink to when pins were open. `layout.mjs` and `layout-mixed.mjs`
   existed only to measure the pane and were deleted; four other harnesses had the
   element removed. README's "Pinned references" section is replaced by a short
   note that chip hover previews do this job now.
9. 🟩 allow drag and drop resorting of pinned media

   **Obsolete — pins removed, see #8.**
10. 🟩 set max width for pinned sidebar to only as much as is needed to fit the widest images and videos, anchored from the right edge. same logic for vertical, anchor from the top edge.

   **Obsolete — pins removed, see #8.**
11. 🟩 pinned audio only takes up the minimum amount of vertical space possible.

   **Obsolete — pins removed, see #8.**
12. 🟦 for linked video/audio, combine them into a single chip. should say Video 1 + Audio 1 etc. when pinned or viewing the hover preview, simply play back as a normal video with audio.
13. 🟦 when clicking the X for combined video/audio chips, bring up a dialog box asking if the user wants to delete the video only, the audio only, or both, as long as this doesn't cause any issues or conflicts.
14. 🟦 change the citation count on chips to the top right corner.
15. 🟦 put the Guide button to the left of the prompt mode selector.
16. 🟦 when the sidebar is not enabled, chips area should have have a MEDIA header like it does with sidebar enabled.
17. 🟦 chips dimensions should be the same in sidebar mode.
18. 🟦 videos flash when clicking the prompt builder section toggles.
19. 🟦 the shot and camera control bar's dropdown boxes should only use the minimum width needed.
20. 🟦 the top and bottom margins of the prompt builder's main pane should be consistent with the left and right margins.
21. 🟦 add a dashed box with a plus on it for adding media in the chips area, if relevant for the current prompt mode.
22. 🟦 add N/A buttons to the audio prompt boxes in the prompt quick editor
23. 🟦 X should be in the top right
24. 🟦 change the "Full editor..." button to "Prompt Builder" and put it to the left of the X.
25. 🟦 colour code the tags on the prompt bar prompt preview
26. 🟦 change the Scroll to a full button that says "📜 Prompt Builder"
27. 🟦 crop button in the media thumbnails shows orange even if cropping was not used
28. 🟦 right click media slot should say "Paste Media" and accept file paths and any media not just images.
29. 🟦 put the retention\_analysis +Entry / auto-fill buttons to the right edge of the header, like how it is for the sound prompt headers
30. 🟦 retention\_analysis dropdown boxes take up the minimum amount of width possible to be legible
31. 🟦 move the (style) dropdown to the right side of the style opening header
32. 🟦 the resolution and aspect ratio of the full size image/video viewer should be to the right, next to the close button
33. 🟦 buttons at the top of the media loader should be a consistent height
34. 🟩 the detail dropdown for videos should be the minimum width required to be legible.

    **Obsolete — no change made.** The detail dropdown was removed by the upstream
    merge; per-item decode size is now the `resize` cap in the ✂ editor, which
    already sizes itself. See #1.

35. 🟦 allow a margin at the bottom edge of the node consistent with the margins on the left and right
36. 🟦 when right clicking a thumbnail in the media loader with media in the clipboard, offer an option to paste and replace (if the media type is the same the slot)
37. 🟦 there seems to be certain scenarios where the interface on the node will shrink below its minimum size, and become unable to be returned to its normal size via resizing the node. may or may not be a comfy frontend update bug.
38. ❓ I have a subgraph with a bool input. this input goes to a switch, where if true, a ref2va is passed along, other wise fl2va. when I connect this bool input to the ref2va\_needed output of — **sentence is cut off; can't tell what goes wrong. See #1.**
39. 🟦 when in the full media view, allow navigating between different medias with left and right arrow keys.
40. 🟩 for the pinned media views, only show the cropped view.

    **Obsolete — pins removed, see #8.** The cropped-view intent lives on in #41
    (chips reflect cropping) and #42 (hover thumbnail frames the crop), both still
    open.
41. 🟦 media chips should reflect the cropping as well.
42. 🟦 the hover over thumbnail should show the full image, but have a frame around the cropped area, like how the crop editor shows.
43. ❓ immediately remove items from view when viewing the quick album and removing them from it. — **no "quick album" exists in this pack or upstream. See #1.**
44. ❓ quick album hotkey doesn't work for fullscreen. — **same as #43.**
45. 🟦 going from quick prompt to prompt builder should transfer the prompt over.
46. 🟦 the quick prompt editor should show picture 1 and/or picture 2 on the left side.

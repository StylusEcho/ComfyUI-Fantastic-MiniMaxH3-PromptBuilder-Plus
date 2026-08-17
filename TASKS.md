# Prompt Studio Tasks List

Status key: `🟦` pending · `🟨` in progress · `🟩` complete · `🟥` blocked · `❓` needs your call · `⏸️` on hold

---

1. 🟩 if any of the below or past changes conflict, or are redundant compared to latest upstream repo changes, flag it. the majority of the following was written before those changes.

   **Audit against the upstream 1.5.0–1.5.4 merge. Four items flagged, everything else is unaffected and stands as written.**

   - **#34 is obsolete** — the video *detail* dropdown it asks to narrow no longer
     exists. Upstream replaced the `detail` field with a per-item `resize` cap set
     in the ✂ trim/crop editor (and removed `DETAIL_CAPS`), so there is no control
     left to resize. Closed as 🟩 with nothing to do.
   - **#6 flagged, then approved and done.** Moving `model` to the first output
     renumbers *every* output slot, which mis-wires any saved workflow built on this
     node — the pack had an explicit rule against exactly that. You accepted the
     breakage, so it is implemented; see #6.
   - **#38 is truncated (❓)** — the sentence ends mid-clause: "when I connect this
     bool input to the ref2va\_needed output of". Can't tell what the symptom is.
     You've asked to leave this one for now.
   - **#43 / #44 removed.** They referenced a "quick album", which exists neither in
     this pack nor upstream (checked both) — you've confirmed they belong to a
     different project, so they are deleted rather than left open.

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
6. 🟩 put the model node output first in the outputs

   Done on your go-ahead, knowing it breaks saved workflows. `model` is now slot 0
   and everything else shifts down one: `prompt`, `references`, `picture_1`,
   `picture_2`, `ref2va_needed`. The returned tuple, `RETURN_TYPES`,
   `RETURN_NAMES` and the node DESCRIPTION were all reordered together, and a
   harness asserts every slot still carries what its name says in FL2VA, REF and
   T2VA — including that mode-gating still blanks the pictures in T2VA and that
   `model` routes ref2va only in REF.

   Nothing in the pack depended on the old indices (the JS that connected outputs
   by slot went with the standalone nodes, and the shipped example workflow does
   not use this node), so the impact is entirely on users' own graphs: links out
   of a pre-2.0.0 Prompt Studio come back one slot off and need reconnecting.
   Documented under a new "Upgrading from 1.x" heading in the README, and the
   reasoning recorded next to `RETURN_TYPES` — including that this is a one-off
   and later additions get appended last as before. The pyproject note for 2.0.0
   now covers both breaking changes rather than just the node removal.
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
12. ⏸️ **On hold at your request.** for linked video/audio, combine them into a single chip. should say Video 1 + Audio 1 etc. when pinned or viewing the hover preview, simply play back as a normal video with audio.
13. ⏸️ **On hold — depends on #12.** when clicking the X for combined video/audio chips, bring up a dialog box asking if the user wants to delete the video only, the audio only, or both, as long as this doesn't cause any issues or conflicts.
14. 🟩 change the citation count on chips to the top right corner.

    Moved out of the bottom bar and badged into the card's top-right corner over
    the thumbnail, as a dark rounded pill so a single digit stays legible against a
    bright frame. It is `pointer-events:none`, so the corner remains part of the
    card's click target — clicking a card inserts its tag, and that must not have a
    dead spot. All three states move together: the count, the amber `–` for
    "not cited yet", and the `⊘` shown when the mode can't use the reference.
    Measured at 3px from both edges, clear of the bottom bar, in normal and
    sidebar views.
15. 🟩 put the Guide button to the left of the prompt mode selector.

    Reordering alone wasn't enough: the mode selector carried `margin-left:auto`,
    which is what opens the gap between the left- and right-hand groups, so Guide
    would have been left stranded at the end of the left group with the gap between
    them. The auto margin moves onto Guide instead, so the two travel together and
    sit 14px apart. Close stays furthest right.
16. 🟩 when the sidebar is not enabled, chips area should have have a MEDIA header like it does with sidebar enabled.

    The inline strip now emits the same `mmh3p-railhead` "media" heading the
    sidebar column already had, so the section is named either way round. It needed
    one extra rule: in the sidebar the column's flex `gap` spaces the heading, but
    inline it is a block, so the 6px is spelled out.
17. 🟩 chips dimensions should be the same in sidebar mode.

    The sidebar was overriding cards to `width:auto` and stretching them to fill the
    column, making them 169px against 128px inline. Both overrides are gone and the
    column centres the cards instead, so a card measures the same 130px (128 + the
    1px borders) in either view. The joined video+audio pair still meets with a 0px
    seam vertically.

    **Follow-up done on your say-so:** the column is tightened from 186px to 164px,
    sized to the card rather than the other way round — 130px card + the rail's
    16px padding and 1px border, plus ~17px slack. The slack is deliberate: this
    Chromium uses overlay scrollbars (measured 0px), so a bare fit of 147px would
    have clipped the card on any platform with classic scrollbars once the list
    scrolls. The form gains the 22px (612px → 634px at 1600x900).
18. 🟩 videos flash when clicking the prompt builder section toggles.

    Cause: `render()` calls `formEl.replaceChildren()` and rebuilds every card, so
    each redraw built a **new** `<video>` element, and a new element with the same
    `src` is a new load — hence the blink. Section toggles call `render()`, which is
    why they showed it, but any redraw did.

    Card thumbnails are now cached per reference and reused, so a rebuild moves the
    existing element rather than replacing it, and browsers don't treat a move as a
    load. Measured in Chromium: five re-renders went from 5 media loads to 1.

    Scoped deliberately to the card thumbnails. The `big` variants are built on
    hover for the peek panels — those are never rebuilt by `render()` so they never
    flashed, and two peeks can be open at once, where sharing one element would
    yank it out of the first. The key is the preview URL, so a clip that changes
    file still gets a fresh element while a renumbered tag on the same file does
    not.
19. 🟩 the shot and camera control bar's dropdown boxes should only use the minimum width needed.

    A `<select>` lays itself out against its **widest** option rather than the one
    on show, so the camera-move box was 145px to display "Zoom In" (42px of text)
    purely because "Roll Counterclockwise" was in the list. Measured across the row:
    477px of dropdowns for ~164px of visible text.

    Added `fitSelect()` / `autoFitSelect()`, which measure the *displayed* option
    with a shared probe span that copies the select's own font — so the figure is
    measured, not estimated — and re-fit on every change. The row's four dropdowns
    now total **309px, down from 477px**, with nothing clipped, and picking the
    longest option correctly grows the box back to 147px.

    One ordering detail: the style dropdown resets its own value inside its change
    handler, so its fit is registered *after* that handler — registering first
    would measure the style just picked and then miss the reset back to "(style)".
20. 🟩 the top and bottom margins of the prompt builder's main pane should be consistent with the left and right margins.

    Sides were 16px, top 0 and bottom 24px. Two things had to change rather than
    one. The form keeps `padding-top:0` on purpose — the media bar is sticky and
    pins flush to the top of the scroll area, and giving the form top padding would
    put a gap above it that collapses on scroll — so the top gap now comes from the
    bar's own padding, raised 12px → 16px. Bottom went 24px → 16px, but measured
    32px, because the form is a flex column so the last section's own 16px
    `margin-bottom` doesn't collapse and was stacking onto the padding; the last
    child's margin is now zeroed. Measured with the pane scrolled to the bottom:
    16px on all four edges, bar still full-bleed.
21. 🟩 add a dashed box with a plus on it for adding media in the chips area, if relevant for the current prompt mode.

    The dashed `+` tile already existed but `refChips()` only emitted it when there
    was **no** media at all, so it vanished as soon as you had one reference. It now
    trails the cards as well as standing in for them when empty.

    The "if relevant for the current prompt mode" half needed nothing: `dropTile()`
    returns null when `roomLeft()` is empty, and that already gates on the mode's
    per-kind ceiling (`MODE_CAPACITY`), the loader's own capacity check — which also
    counts split soundtracks — and the total reference cap. So it hides itself in
    T2VA, and once I2VA's single picture is filled.

    Also cleaned up two user-facing strings left over from removing the standalone
    nodes: the empty-state hint told you to use "+ Media loader", and a validation
    warning blamed "the Media Loader", neither of which this pack ships any more.
22. 🟩 add N/A buttons to the audio prompt boxes in the prompt quick editor

    Both audio sections in the quick editor now carry the same N/A the full editor
    has, in the section heading (the `label.act` / `mmh3p-secact` pattern from #7,
    so the two windows match). The handler writes through the field and fires
    `input` rather than setting the state directly, which keeps a single save path
    — the textarea's own handler is what records the value, so the debounced
    save on the node's inline T2VA mount picks it up too. Verified end to end:
    clicking N/A takes the state from "birdsong" to "N/A".
23. 🟩 X should be in the top right

    **Already the case — no change needed.** Measured the quick editor's header:
    the close button sits 16px from the right edge, which is the header's own
    padding. `.mmh3p-head .mmh3p-x{margin-left:auto}` was already doing it. Flagging
    rather than inventing a change; if you meant a different window's X, point me at
    it.
24. 🟩 change the "Full editor..." button to "Prompt Builder" and put it to the left of the X.

    Relabelled to **📜 Prompt Builder** — the scroll matches the icon the prompt bar
    uses for the same action, which #26 turns into a full button. Moving it needed
    more than reordering: it was already the X's DOM sibling but sat **602px** away,
    because the X's `margin-left:auto` claimed all the header's slack. The button now
    carries the auto margin and the X's is cancelled when it follows one
    (`.mmh3p-pushright ~ .mmh3p-x`) — with both set, the free space splits between
    them and the pair still ends up apart. Now 14px apart, X still hard right.
25. 🟩 colour code the tags on the prompt bar prompt preview

    Extracted the editor's tag-painting chain into a module-level `paintTags()`
    and pointed both the editor's preview and the node's prompt bar at it, so the
    two can't drift on what counts as a tag. Input is escaped first, so the only
    markup in the result is ours.

    One thing the extraction alone didn't fix: the colours were scoped
    `.mmh3p-preview .mmh3p-t-*`, so the bar got the right classes and rendered
    them all one colour — measured 8 classes, 1 colour. Unscoping the palette
    fixed it: now 8 classes, 8 distinct colours, and verified identical between
    the editor preview and the bar. The two-line clamp still holds.
26. 🟩 change the Scroll to a full button that says "📜 Prompt Builder"

    Now a real `<button>` labelled **📜 Prompt Builder**, styled to match the mode
    button at the bar's other end so the two read as a pair. This mattered beyond
    labelling: clicking the strip opens the *quick* editor, so the route to the full
    one needed to say what it was. Measured on a 660px node — button 105px, mode
    64px, preview keeps 430px — so the text still gets the bulk of the width.
    Matches the button #24 put in the quick editor's header.
27. 🟩 crop button in the media thumbnails shows orange even if cropping was not used

    Real cause: pressing **▣ Crop** immediately wrote a 75% rect. The rect is inset
    so the handles are grabbable (the frame edge isn't), but that meant merely
    *opening* the crop tool cropped your media — and the clear-on-close check only
    fired for a near-full-frame rect, which the 0.75 default could never be. So the
    button went orange for a crop you never made.

    An auto-created rect is now marked as ours and thrown away on close unless it
    was actually dragged (or its aspect ratio changed). Verified: open+close leaves
    no crop; open+drag+close keeps it; a pre-existing crop survives open+close
    untouched; and dragging out to the full frame still clears it.
28. 🟨 right click media slot should say "Paste Media" and accept file paths and any media not just images.

    **Label and "any media" done; "file paths" needs your call — see below.**

    Relabelled to **Paste Media**. The right-click paste read only `image/*` off the
    system clipboard and now takes video and audio too. Worth knowing the Ctrl+V
    path over the panel already accepted any media file — it reads
    `clipboardData.files` — so this closes the gap between the two routes.

    **⚠ Flagged: file paths.** A browser cannot read an arbitrary local path, so
    supporting one means a server route that opens files by path — effectively an
    arbitrary-file-read endpoint on the ComfyUI server. I'm not adding that
    unprompted. Options, if you want it: restrict it to paths under ComfyUI's own
    input/output directories (safe, covers most real use), or accept the wider
    exposure knowingly. Say which and I'll build it.
29. 🟩 put the retention\_analysis +Entry / auto-fill buttons to the right edge of the header, like how it is for the sound prompt headers

    Both buttons moved into the section heading through the same `secLabel()`
    actions slot #7 added for the audio N/A, so they line up the same way. The
    separate `.mmh3p-tools` row they sat in is gone, which also reclaims its height.
    Measured: the button group's right edge matches the heading's.
30. 🟩 retention\_analysis dropdown boxes take up the minimum amount of width possible to be legible

    The row is a grid whose label and marker columns were pinned at 150px and 160px,
    so the dropdowns were that wide whatever they held. Those tracks are now `auto`
    and both selects go through `fitSelect()` from #19, so each sizes to the option
    on show. The marker dropdown measures 118px against 133px before, nothing is
    clipped, and the freed width goes to the context field.
31. 🟩 move the (style) dropdown to the right side of the style opening header

    Moved into the `detailed_description — style opening` heading, right-aligned.
    One thing worth flagging: that heading only exists in **Reference** mode. Base
    modes have no style-opening section, so they keep the dropdown in the toolbar —
    otherwise T2VA/I2VA/FL2VA/L2VA would simply lose it. The dropdown is built by a
    shared `styleSelect()` so both mounts stay identical.
32. 🟩 the resolution and aspect ratio of the full size image/video viewer should be to the right, next to the close button

    The dimensions carry the auto margin now instead of Close, so the pair sits
    together at the right (8px apart) clear of the filename, which is the part that
    varies in length. Close stays hard right.
33. 🟩 buttons at the top of the media loader should be a consistent height

    Measured three heights across that row — 22px for `.mmlp-btn`, 19px for the
    `.mmlp-sm` variants, 23px for the preset select. Pinning the height on the row's
    controls makes it one 22px line while each keeps its own padding and font.
34. 🟩 the detail dropdown for videos should be the minimum width required to be legible.

    **Obsolete — no change made.** The detail dropdown was removed by the upstream
    merge; per-item decode size is now the `resize` cap in the ✂ editor, which
    already sizes itself. See #1.

35. 🟩 allow a margin at the bottom edge of the node consistent with the margins on the left and right

    The prompt bar is the node's last widget, so it sat hard against the bottom edge
    while the panel above was inset left and right. It now reports 8px more height
    than the element occupies, which reads as a margin beneath it. `fitPanel()` and
    `minSize()` measure the overhead rather than assuming it, so both picked this up
    unchanged — the node's floor moved 528 → 536 and the panel still returns to
    exactly 476.

    ⚠ The exact left/right inset is decided by ComfyUI's own widget layout, which I
    can't measure outside a running ComfyUI, so 8px is a judged match rather than a
    measured one. Easy to nudge if it looks off against the sides.
36. 🟩 when right clicking a thumbnail in the media loader with media in the clipboard, offer an option to paste and replace (if the media type is the same the slot)

    A **Replace with <name>** row appears on a filled slot when the clipboard holds
    media of the same kind, and only then — a picture slot offers it for a copied
    picture but not for a copied video. It swaps in place, so the slot keeps its
    position and therefore its tag number; that's the point of it over remove+paste,
    since tags already written into the prompt keep pointing at the same slot.

    Capacity is measured with the outgoing item already removed, so a like-for-like
    swap isn't refused for the slot it is about to free — verified by replacing into
    a full 9/9 picture set. A replacement video whose soundtrack would breach the
    audio budget arrives with its audio off and says so, matching paste.
37. 🟨 there seems to be certain scenarios where the interface on the node will shrink below its minimum size, and become unable to be returned to its normal size via resizing the node. may or may not be a comfy frontend update bug.

    **Found and fixed one concrete cause; can't rule out others.**

    `fitPanel()` writes an **inline** height on the media panel, while the T2VA
    collapse is a *class* rule (`.mmlp-min{height:auto}`). Inline always outranks a
    class, so once the node had been resized even once, the panel was pinned at that
    height for good — the collapse silently stopped working and the prompt bar could
    never take the room back. Entering the minimised shape now clears the inline
    height, and `fitPanel()` bails out while minimised so it can't re-pin. Verified
    the whole sequence: resize in REF → switch to T2VA → resize again → back to REF,
    with the panel collapsing and re-fitting correctly at each step.

    ⚠ Left 🟨 deliberately. That is *a* cause matching your description, not
    provably *the* one — you mention it might be a Comfy frontend bug, and I can't
    reproduce against a real ComfyUI here. If you still see it after this, tell me
    which mode and what you did just before, and I'll dig again.
38. ❓ I have a subgraph with a bool input. this input goes to a switch, where if true, a ref2va is passed along, other wise fl2va. when I connect this bool input to the ref2va\_needed output of — **sentence is cut off; can't tell what goes wrong. See #1.**
39. 🟩 when in the full media view, allow navigating between different medias with left and right arrow keys.

    The viewer takes the other viewable references and ← / → step through them,
    wrapping at both ends, with an `n/total` counter in the caption once there is
    more than one. Audio is excluded, having no lightbox. Two details: the arrows are
    ignored while focus is inside a video's own controls, so keyboard seeking doesn't
    jump to the next clip; and the list follows load order, matching the tag order
    bar you read the numbering off.
40. 🟩 for the pinned media views, only show the cropped view.

    **Obsolete — pins removed, see #8.** The cropped-view intent lives on in #41
    (chips reflect cropping) and #42 (hover thumbnail frames the crop), both still
    open.
41. 🟩 media chips should reflect the cropping as well.

    A cropped reference's card now shows its kept region: the media is scaled to
    1/w by 1/h and offset so the crop fills the tile, which is the same mapping the
    decoder applies. Measured against a test image with a known crop — the visible
    window maps to exactly `x=0.5 y=0.25 w=0.25 h=0.25`. Uncropped media is returned
    untouched, so it keeps the plain cached element from #18.
42. 🟩 the hover over thumbnail should show the full image, but have a frame around the cropped area, like how the crop editor shows.

    The hover preview keeps the whole frame and draws the kept rect over it with
    everything outside dimmed, the same reading the crop editor gives. Measured: the
    outline lands on the crop rect and the full image is still shown whole. Note this
    is deliberately the opposite treatment to #41 — the chip shows what the model
    gets, the preview shows what was dropped as well.
45. 🟩 going from quick prompt to prompt builder should transfer the prompt over.

    Was a real bug: the button ran `close(); openEditor(node)` with no save, and the
    full editor reads the node's widgets — so everything typed in the quick window
    since opening was silently dropped on the way through. It saves first now.
    Verified `save()` both persists to `builder_state` and regenerates
    `prompt_text`.
46. 🟩 the quick prompt editor should show picture 1 and/or picture 2 on the left side.

    A keyframe column sits left of the fields, showing exactly the pictures the mode
    sends — verified per mode: T2VA 0, I2VA 1, FL2VA 2, L2VA 1, Reference 0 (it has
    no keyframes). It disappears when no pictures are loaded, so the fields keep the
    full width. The thumbnails reuse #41's crop treatment, so they show the kept
    region too. Wrapped in a new container rather than restructuring `.mmh3p-quick`,
    so none of the existing field rules changed.

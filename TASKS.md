# Prompt Studio Tasks List

firstly, update with the latest upstream changes. if any of the below or past changes conflict, or are redundant compared to latest upstream repo changes, flag it.

🟩 **Upstream sync — nothing to pull.** `upstream/main` is still at `c100a10`
(1.5.8), already merged here in `43b5fd8`. `git log HEAD..upstream/main` is
empty, so no task below conflicts with or is made redundant by upstream work.

1. 🟩 change the node pack name to Fantastic-MiniMax-H3-PromptStudio
   - `pyproject.toml`: registry `name` → `fantastic-minimax-h3-promptstudio`
     (registry IDs are lowercase/hyphen only) and `DisplayName` → "Fantastic
     MiniMax H3 Prompt Studio". The GitHub repo/folder name is unchanged —
     renaming that is a GitHub-side action, not a file edit.
2. 🟩 text on the Size window should be affected by its Text size settings.
   - Dropped the `--mml-fs:1` pin on `.mmlp-scalemenu`. Its width and fixed
     label/value columns now scale with the factor too, so the box grows with
     its text instead of the text bursting a fixed 268px shell; width is
     capped at `92vw` so it can never grow off-screen and strand the slider
     that would shrink it back.
3. 🟩 change Node size in the Size settings for the full size media loader to be for the window size.
   - The slider reads "Window size" when the panel is modal, and applying
     calls the new `LoaderPanel.resizeWindow()` (same 1140×780 base as
     `openLoaderModal`) instead of `applyNodeSize()`, which would have
     resized a node hidden behind the window.
4. 🟩 make text in buttons consistent size
   - `.mmlp-btn.mmlp-sm` and `.mmh3p-secact .mmh3p-btn` set padding only;
     both used to drop the font size as well, which put two button text
     sizes side by side in one toolbar.
5. 🟩 prompt builder button in the full size media view should be next to the X, and styled like the Prompt Builder button on the node's prompt bar.
   - `.mmlp-modalhead button` had `margin-left:auto` on *every* button, giving
     each its own elastic gap and spreading them across the header. The
     actions now sit in one `.mmlp-modalacts` group, and the button wears
     `.mmlp-pbbtn` — the same pill as `.mmh3p-sumbtn` on the node's bar.
6. 🟩 clicking the Media Loader button whilst on the Prompt Builder should close the current window before opening the new one and vice versa.
   - Both buttons hand over instead of stacking. The editor's side goes
     through `requestClose()`, so the unsaved-changes prompt still gets to
     interrupt — when it does, the handover waits for an answer rather than
     opening over the top.
7. 🟩 reduce minimum node size by 10%.
   - `PANEL_H` 476→428, `NODE_W` 660→594; the panel CSS now interpolates
     `PANEL_H` rather than repeating the number, which is what let the two
     drift apart. Measured floor is 594×488, was 660×536.
8. 🟩 the crop button at the bottom right of the thumbnails is still sometimes orange even with no crop applied. resolve once and for all.
   - Root cause: "is this cropped" was five separate bare-truthiness tests on
     `item.crop`, so any full-frame or placeholder rect lit the button even
     though the decoder ignores it. Added one exported `hasCrop()` predicate
     (tolerance matched to `media_io.load_image()`'s own full-frame check) and
     routed the edit button, dimension badge, thumbnail marquee, tooltip,
     Reset button, the crop tool's own highlight, and the editor's card tool
     through it. `apply()` keeps the separate `cropAuto` guard for the
     placeholder rect, which is a real crop geometrically.
9. 🟩 the input box for integrated\_multimodal\_description in the quick edit should fill the space up to where the sound/music sections start.
   - The `chipField()` wrapper added for tag colouring sits between the
     section and its textarea, which broke the flex chain: the wrapper had no
     grow, so it sized to content and the field stopped short. The grow is
     now handed down through the wrapper to the textarea.
10. 🟩 reduce the overall width and height of the quick edit window by 25%
   - 900×780 → 675×585. The viewport caps came down with it (92vw/88vh →
     69vw/66vh), or on a small screen the window would still have filled
     almost everything and the reduction would only show on large ones.
11. 🟩 ensure buttons on the trim windows do not overflow to a second line
   - `.mmlp-tmfoot` no longer wraps. Buttons give up label width (ellipsised,
     full text still on the title) rather than the row giving up a place to
     put them, so Apply/Cancel can't drop onto a cut-off second row.
12. 🟩 change instances of the Size button to be a Settings button, bringing it in line with the new Settings button in the prompt editor.
   - "⤡ Size" → "⚙ Settings", already framed as `.mmlp-btn`.
13. 🟩 move that Settings button on the node interface to be the rightmost button on the bar.
   - `topRight()` now returns `{shape, window}` instead of one array, so the
     two controls can be placed independently. Measured bar order:
     `❐ · Load · Unload All · preset… · spacer · Used/All · ⚙ Settings`.
14. 🟩 change "Load files..." to "Load"
   - Done.
15. 🟩 change "Unload media" to "Unload All"
   - Done.
16. 🟩 move the button for the full size media loader to be the first item on the bar
   - Done — see item 13's measured order.
17. 🟩 the "No reference media on this node yet" text, change it to a size consistent with the rest of the interface, and scale with the text size setting.
   - That line sits directly in the chip strip, not inside a `.mmh3p-sec`, so
     the `.mmh3p-sec .hint` rule never reached it and it rendered at the
     browser default — the one piece of text in the editor that ignored the
     text-size setting. Given its own rule matching that one.
18. 🟩 add a setting for the Prompt Builder to maximise the vertical height of the window, with a reasonable margin on the top and bottom (window size setting then only affects width)
   - New `tallWindow` pref ("Full-height window"). Height becomes `92vh`
     (4vh margin top and bottom) and the window-size slider governs width
     alone — scaling height too would just clamp against the same margin and
     make the slider look broken.
19. 🟩 media chips should be aligned to the left in the classic prompt builder layout, like before
   - `justify-content` back to `flex-start` on the base rule. Centring was
     only ever wanted in the sidebar, which gets it from `align-items` on its
     own column rule, so the base rule was overreaching.
20. 🟩 make sure the add media 'chip' is aligned with the actual chips in the new layout
   - The + tile carried `align-self:stretch` (right for the inline strip,
     where it matches row height). In the sidebar column that overrode the
     centring and spanned the whole rail, leaving it wider than the 128px
     cards below it. Pinned to the card width there.
21. 🟩 the warnings list text should wrap and never be horizontally scrollable.
   - `overflow-x:hidden` plus `overflow-wrap:anywhere` on the entries. A long
     unbroken run (a file name, a list of tags) used to widen the box and put
     the whole list on a horizontal scrollbar.
22. 🟩 allow minimizing the warnings section
   - The list now sits in a `.mmh3p-issuebox` under a clickable header. The
     header keeps the tally and the worst level's colour while collapsed, so
     nothing is hidden silently. Stored as `issuesCollapsed` — set by clicking
     the header, so deliberately not listed in the settings menu.
23. 🟩 don't allow the integrated\_multimodal\_description input box to overlap anything else.
   - The field kept `resize:vertical` inside a wrapper whose height is set by
     flex, so dragging its grip grew the textarea past the wrapper and painted
     over the sections below. The grip is gone (the field's height is the
     layout's to decide) and the wrapper clips as a backstop.
24. 🟩 add a setting to do the following: change tag hover-over preview to activate the media strip preview popup instead of at the cursor.
   - New `railPeek` pref. `peekFor()`'s hover closure was extracted to
     `openRailPeek()` so a tag hover opens the very same panel a card hover
     does, and `refChips()` now records each tag's card to point at. Falls
     back to the cursor panel when a tag has no card (undefined subject, or a
     slot the mode leaves out).
25. 🟩 add a setting to hide the help captions ("One line per tracked item. Focus a line, then..." etc)
when hiding, makes it a mouse-over caption for the respective section.
   - New `hideHints` pref. `applyHints()` hides the captions and copies each
     onto its section's tooltip. Live readouts — word count, snapped duration,
     the empty-media line — are marked `.keep` and stay put: they report state
     rather than explain a field.
26. 🟩 in reference mode, the style dropdown only adds its text to detailed\_description fields.
   - `insert()` takes an explicit target and `styleSelect(allowed)` pins the
     picker to the two detailed_description halves — the caret's field when it
     is one of them, otherwise the style opening. Previously it wrote to
     whatever was focused last, so picking a style with the cursor in the
     soundscape put it in the soundscape.
27. 🟩 settings gear button should have a frame around it like every other button. going forward, any instance of this button should be styled like this.
   - The cog wore `.mmh3p-x`, the frameless treatment reserved for the close
     ✕, leaving it the one control in the row without a border. Now
     `.mmh3p-btn`. The media loader's Settings button (item 12) already
     matches.
28. 🟩 when clicking the audio/music icons on the node's prompt bar, it should open to the quick edit and select the respective field.
   - The 🔊/🎵 marks are clickable and pass a focus key through
     `openQuickEdit(node, key)`; `promptFields()` exposes the two audio
     textareas as `fieldFor` so the window opens with that one focused and the
     caret at the end.
29. 🟩 reconcile inconsistencies between the final prompt preview colour coding and input boxes colour coding.
   - Five token types disagreed, and `[Shot N]`/`(S1)` were outright swapped:
     the preview drew a shot blue and a speaker pink while the fields drew a
     shot pink and a speaker blue. The preview now tracks the chip palette
     token for token, and — given a resolver — marks undefined tags red as the
     fields do, which it previously could not do at all. Verified: all nine
     token types now report the same colour on both sides.
30. 🟩 when text size is increased, button titles sometimes overflow into two lines outside the bounds of the button.
   - `white-space:nowrap` on both button bases, plus a catch-all over every
     button in each window so it holds whichever of the pack's button styles
     a control happens to wear.
31. 🟩 colour code Prompt Library's prompt previews
   - Previews go through the same `paintTags()` pass the editor's preview and
     the node's bar use. No resolver is passed: this listing has no node to
     check what is loaded, so tags are drawn as defined rather than guessed
     red.
32. 🟩 title-case Prompt library's title
   - "Prompt library" → "Prompt Library".
33. 🟩 add a Settings button on the top right
   - A framed `⚙` in the library head, styled and placed like the editor's
     (item 27), carrying items 34 and 38. The editor's own preferences stay
     on the editor — they would be noise here.
34. 🟩 for the prompt previews, only show the user-inputtable text, not what was added on by Prompt Builder. make this a toggleable setting.
   - The listing only carried a preview of the *assembled* prompt, so every
     entry opened with the same generated header. `_user_text()` in
     `web_api.py` reads the saved `state` and returns just the typed fields
     (skipping "N/A" sections), sent as `preview_user`. Records saved before
     `state` was stored return "" and the frontend falls back to the old
     preview. On by default; `libUserPreview` turns it off.
35. 🟩 use the same rules as the prompt bar on the node for showing the speaker/music emojis.
   - `_audio_marks()` applies the bar's exact test — text that isn't "N/A",
     in a section not switched off, reading `ref.*` in Reference mode — and
     sends two booleans. Verified against the off-switch, REF, blank-string
     and old-record cases.
36. 🟩 reduce the width of the window by 25%
   - 1240 → 930.
37. 🟩 height should scale according to the amount entries.
   - `height:auto` with `max-height:92vh` and a small floor; the list is
     `flex:0 1 auto` so it can't claim the full height and defeat that.
38. 🟩 add a setting for the entries to have double height.
   - `libTallRows` gives each preview a second line (`-webkit-line-clamp:2`).
     Applied as a class on the list so toggling doesn't rebuild the rows and
     lose the scroll position.
39. 🟩 on some browsers, when the hover-over preview for the chips sidebar is on the left side, it is very far to the left instead of right next to the chip.
   - `.mmh3p-peek` is `width:max-content` between 240px and 540px, but the
     left placement positioned against the 540px cap — so a narrower preview
     sat exactly as far from the chip as the width it didn't need. It is now
     measured after being added to the document (hidden for that frame) and
     placed against its real size. The vertical clamp had the same bug:
     `offsetHeight` was read before the box was in the document, so it was
     always 0.


---

## Follow-up round

40. 🟩 add-media chip: `+` centred in the tile, PICTURE / VIDEO / AUDIO centred
    between the `+` and the bottom edge
    - Three grid rows with equal outer rows puts the `+` on the tile's exact
      centre line and leaves the label centred in the space below it. The two
      were previously one centred flex group, so the pair straddled the middle
      and neither sat where it belonged.
41. 🟩 with "Preview tags" on, the popup doesn't appear when the image is large
    or the window is narrow
    - An `<img>`/`<video>` has no intrinsic size until it loads, so the box was
      measured while still empty and then positioned as if it were small. A
      large image finished loading into that placement and spilled off-screen,
      which read as the preview not appearing. It re-measures on
      `load`/`loadedmetadata` (and immediately for an already-cached image,
      where neither event fires), and both axes clamp into the viewport.
42. 🟩 tag previews for Subjects don't respect that setting
    - The card lookup is keyed by media tag, and a `<Subject N>` has no card of
      its own — what it points at is its slot — so the lookup always missed and
      subjects fell through to the cursor panel. Keyed off the subject's slot.
43. 🟩 with the setting off, the popup should go above the text
    - Prefers above, flipping below only when it cannot fit. Same
      measure-after-load fix as 41, since it had the same bug.
44. 🟩 add a third slider for chips size
    - `chipScale` (100–200%) drives `--mmh3-chip`, which scales the card, its
      thumbnail and the crop window. Independent of window and text scale. The
      sidebar rail's min-width tracks it so larger cards aren't clipped.
45. 🟩 frame the X on subject definition and retention lines; frame and
    background every retention entry
    - Those used `.ghost`, which removes the border outright — right for a
      footer, but it left the control unbounded beside bordered fields. New
      framed `.rowx`. Retention entries are boxed, which matters because they
      wrap onto a second line for the note.
46. 🟩 at larger text sizes, button labels are not vertically centred
    - The bar heights were fixed pixels (26px / 22px) that didn't scale, so
      raised text outgrew a box that stayed put and sat low. Both scale now,
      and buttons centre their own content.
47. 🟩 prompt library: slider for previewed rows, remove the double-row
    setting, invert and rename "Preview what you typed"
    - `libPreviewRows` (1–6) drives `-webkit-line-clamp` through a CSS
      variable, so dragging it doesn't rebuild the list and lose its scroll
      position. The old toggle was just this set to 2 and is gone. The preview
      source is now "Show full prompt", off by default — same behaviour as
      before, stated the other way round.

---

## Follow-up round 2

48. 🟩 when chip size is increased, widen the media pane instead of squeezing
    the form
    - `.mmh3p-body.sidebar`'s rail column was a fixed `164px` grid track,
      chip-scaled or not — the `min-width` I'd put on the rail element in
      item 44 did nothing, since a fixed-length track doesn't grow for
      content (that min-width was silently dead). The rail column is now a
      `--mmh3-railw` custom property driven by `--mmh3-chip`, and
      `applyScale()` grows the modal by exactly the rail's extra width, so
      the form and reference-preview columns keep their own size instead of
      shrinking every time the slider moves. `applySidebarPref()` also
      recomputes it, since the extra only applies in sidebar mode.
      Measured in a real Chromium via Playwright once the CSS transition on
      `grid-template-columns` settles: rail 164px→292px at 2x chip scale,
      form and side columns unchanged (634px / 440px) at both scales, modal
      grew by exactly the rail's own growth (128px). Found and fixed a
      companion bug while measuring this: the rail had no `box-sizing`, so
      its content-box `width` plus its own padding and border rendered
      wider than the grid track and forced the track to grow past its
      declared size — set to `border-box` to match what `--mmh3-railw`
      actually represents.
      (The modal is centred by the overlay, so this growth is symmetric
      about the screen's centre, not literally left-edge-only — matching
      how the existing window-size slider has always grown the same modal.)
49. 🟩 prompt library: rows beyond 2 did nothing, and the preview didn't
    fill the space it had
    - Root cause was server-side: `web_api.py` truncated every preview to
      150 characters, a leftover from when this was a single ellipsised
      line. Measured against the library's actual column width and font
      (Playwright again): 6 rows holds roughly 680 characters, so a
      150-character preview never has enough text to reach past ~1-2 lines
      regardless of the client-side rows setting — the slider had nothing
      left to reveal. Raised the cap (`PREVIEW_CHARS`) to 2000, comfortably
      past 6 rows' worth with margin. Verified with a realistic 780-character
      prompt: rows 1/2/3/4/6 each now show visibly more text than the last,
      where before only rows 1-2 differed and 3-6 were identical to 2.

---

## Follow-up round 3

50. 🟩 unsaved changes: Save on the media-loader handover closed the editor
    but never opened the media loader
    - `requestClose()` deferred to the unsaved-changes strip and the button's
      own handler raced it: it checked `this.closePending` and only opened
      the media loader when that was still false, i.e. only on the
      already-saved path. Once the strip appeared, its own "Save to node"
      (and "Discard") buttons just called `save()`/`close()` directly, with
      no idea a media-loader handover was waiting — so closing that way lost
      the follow-up action entirely.
      `requestClose()` now takes an optional `then`, run once by `close()`
      itself however the close is actually resolved — immediately, or via
      either button on the strip — so the handover fires exactly once
      regardless of path. "Keep editing" clears it, since abandoning the
      close attempt has to abandon anything queued to run after it too, or a
      later, unrelated close would fire a stale handover.
      Verified with a real end-to-end run: Save-then-handover and
      Discard-then-handover both now show `.mmlp-overlay` actually mounted,
      not just the editor closing; Keep-editing-then-close-again shows the
      strip a second time (still dirty, correctly) and resolving it doesn't
      open a stray media loader; the not-dirty immediate path (no
      regression) still opens straight away.
    - Surfaced two real gaps in the DOM stub while writing that test, fixed
      alongside it: `addEventListener` only ever kept the *last* listener
      registered for an event type, silently dropping earlier ones — a
      chip-tagged textarea genuinely carries two ("input" for the state
      update, "input" again for chipField's repaint), so any test typing
      into one was only ever exercising whichever handler was attached
      second. Now dispatches to every listener, same as a real element.
      `prepend()` was also missing (used by the unsaved-changes strip).

---

## Follow-up round 4

51. 🟩 quick edit: full-aspect keyframe previews down the left in
    I2VA / FL2VA / L2VA, per the supplied layout
    - The preview column was a fixed 132px strip of 80px `object-fit:cover`
      thumbnails — chips, not views. It is now a proportional column (44% of
      the window, full body height): one picture fills it in I2VA/L2VA, two
      split it evenly in FL2VA, first frame above last. Images are
      `object-fit:contain`, so a 9:16 keyframe letterboxes rather than being
      centre-cropped.
    - Cropped pictures needed more than `contain`. `cropFrame()` shows the
      kept region by scaling the image to the window's width and letting the
      window's own height do the clipping — so the window has to carry the
      region's aspect ratio or the crop lands wrong. New `shownAspect()`
      computes what a picture actually shows after rotation and cropping
      (mirroring is deliberately ignored: it flips the frame without changing
      its proportions), passed to the CSS as `--ar`.
    - Containing a fixed-aspect box turned out to have no naive CSS answer:
      clamping one axis with `max-width`/`max-height` does not re-derive the
      other, so a box wider than its tile came out stretched. Measured four
      candidate rules across three aspects and confirmed each fails somewhere.
      Container-query units (`min(100cqw, calc(100cqh * var(--ar)))`) express
      it exactly — verified across 15 tile/aspect combinations, all with exact
      aspect, fitting inside, and filling one axis.
    - **Window widened 675 → 900px.** The previews are additive, so the width
      comes from the window rather than from the fields: measured, the prompt
      fields keep 505px against 499px before, i.e. unchanged. This does undo
      the earlier 25% width reduction (item 10), which was made when the
      preview strip was 132px; the height stays at the reduced 585px. Say if
      you would rather keep 675 and let the fields take the reduction instead.
    - Measured in a real Chromium: column 42.3% of window width and 93.5% of
      body height, FL2VA tiles split evenly (224.5px each), a 9:16 picture
      drawn undistorted, and a middle-half crop of a 16:9 source rendering at
      exactly 0.889 (=160/180) inside its tile.

---

## Follow-up round 5

52. 🟩 the node interface glitches and gets stuck at a certain size within
    the node's frame on certain interactions
    - Root cause: the on-node media panel is only ever re-fit to the node's
      actual current size (`fitPanel()`) from `onResize` and `onConfigure` —
      an explicit drag or a reload. Nothing re-fit it when the panel's own
      natural/shaped height requirement changed for any other reason: a mode
      switch (T2VA's toolbar-only collapse and back), or the Used/All toggle
      shrinking or growing what the panel needs to show. A node resized
      taller in a picture mode, then switched into and back out of a
      shape-changing state, was left with the panel stuck at its own
      default/last-fit height — a gap or an overflow against the node's
      actual frame — until an unrelated resize or reload happened to nudge
      it into re-fitting.
    - `_mmlOnCommit` (`promptstudio.js`), the hook every shape-changing
      interaction already calls, now also calls `fitPanel()` alongside
      `refreshBar()`, so any of them re-fits the panel immediately rather
      than leaving it stuck.
    - Separately, `Editor.save()` (the full editor's Save button — by far
      the most common way a mode actually gets changed) never called either
      hook at all: it only updated the node's collapsed-bar preview text.
      The node's own small mode-switcher button already called
      `node._mmlPanel.render()` and `node._mmlOnCommit()` after a mode
      change; `Editor.save()` was the one path that skipped both, so saving
      a mode change from the full editor left the on-node interface showing
      the *previous* mode's layout — collapsed when it should be open, or
      the reverse — until something unrelated forced a redraw. Now mirrors
      the small mode-switcher's own refresh sequence.
    - Verified end-to-end through the real Editor UI, not just the
      hooks in isolation: resized a node to 1200px in I2VA (panel grows to
      1140px to fill it), switched to T2VA with "Used" active via the mode
      bar and Save button (panel correctly collapses, bar correctly
      expands), then switched back to I2VA and saved again — panel
      correctly un-collapses and re-fits to the full 1140px, rather than
      being stuck at its own default floor.

---

## Follow-up round 6

53. 🟩 the quick edit's side pane should conform to the pictures' aspect
    ratios, crop nothing, and put two pictures side by side when there is
    horizontal room (vertical when there isn't)
    - The pane was a fixed 44% column with the pictures fitted into it, so a
      picture whose shape didn't match its tile sat in letterbox bars. New
      `keyframePaneLayout()` inverts that: it sizes each tile to its own
      picture's aspect and the pane to the tiles, so `object-fit:contain` has
      nothing left to letterbox and nothing is cropped. Pure geometry, no DOM
      reads — the caller measures and passes the space in, which keeps the
      measure and write phases apart and the rule itself testable.
    - Row vs column is decided by which arrangement leaves the pictures
      **larger**, which is what "is there horizontal room" actually amounts
      to. My first attempt asked whether a *full-height* row fitted the width
      budget, and that was wrong: the row was pinned to full height, so two
      wide pictures stacked even in a 2400px window where side by side was
      plainly roomier. Caught by testing the geometry directly before wiring
      it up.
    - Verified in a real Chromium against real images: every tile matches its
      picture's natural aspect exactly (16:9, 9:16, 1:1, and a 0.889 crop),
      two tall pictures go side by side, two wide ones stack at the default
      window and switch to side by side when given room, and a mixed pair
      keeps both shapes. Plus a geometry sweep over 9 aspect combinations ×
      3 window sizes: all keep aspect and stay inside both the width budget
      and the height.
    - **Fixed a latent bug this exposed.** `.mmh3p-audiopair` stacked via
      `@media (max-width:900px)` — a *viewport* query answering a *container*
      question. The fields column can be narrow inside a wide window (this
      pane takes a share of it; the full editor's form sits beside a
      sidebar), and the pair then stayed side by side and overflowed its own
      column. It is now a container query on a named `mmh3p-fields` container
      declared by both hosts. The 400px threshold is measured — the label
      rows start overflowing just under 380px — and `label.act` now wraps
      rather than overflows, so a larger text scale degrades gracefully
      instead of spilling out of any fixed px threshold.

---

## Follow-up round 7

54. 🟩 all instances of the Settings button should only have a gear on it
    - The media loader's read "⚙ Settings"; the rest were already bare gears.
      All four now match, with the wording kept on the tooltip.
55. 🟩 add a settings button to the quick editor with window size and image
    size
    - A gear in the quick editor's header, matching the editor's and the
      library's. Window size scales its 900×585 base; image size moves the
      split between the keyframe pane and the fields beside it. Both persist
      per user like the pack's other scales.
    - `clampScale()` gained a `min` parameter. It floored everything at 100%
      via a shared `SCALE_MIN`, which is right for the window and text scales
      but wrong here: turning the pane's share *down* to give the fields more
      room is the useful direction, and it was unreachable — measured, a 50%
      setting was silently clamped back to 100% and the slider did nothing.
      Image size runs 40–200%.
    - Measured: window 100%→150% takes the modal 900×585 → 1350×726; image
      size 50% → 200% takes the pane 428px → 888px, the top end capped by the
      fields' own floor rather than squeezing them out. Reset returns both.

56. 🟩 dropping a picture on a filled slot in the Used layout should replace
    that picture
    - **The reported behaviour was inverted, and the real fault was worse.**
      Measured in a real Chromium: the drop did not replace anything, it
      *appended* — `[p1.png]` became `[p1.png, dropped.png]`. In the shaped
      layouts that is the bad case, because I2VA/L2VA show one picture and
      FL2VA two, so the newly dropped picture landed **hidden**, with only
      the window button's count badge as a hint that anything had arrived.
      The drop looked like it had done nothing at all.
    - Dropping onto a filled slot now replaces that slot's media, per the
      explicit choice: pointing at a slot is an explicit target, so nothing
      is hidden and no extra picture accumulates. Dropping on an empty slot
      or on the panel background still appends, unchanged.
    - The drop handlers are registered in `reorderable()` *before* its
      `enable` guard, on purpose: a slot that cannot be dragged (the
      single-picture shaped layouts) is still a perfectly good drop target,
      and it is precisely the case where appending would put the picture
      somewhere the layout cannot show it.
    - Guarded: a video dropped on a picture slot is refused by name rather
      than silently mismatched (*"clip.mp4 is a video; drop it on a video
      slot, or on the panel to add it. This slot holds a picture."*), an
      unsupported extension says so, and a multi-file drop replaces with the
      first and appends the rest. A `.hot` ring marks the slot under the
      cursor so the target is visible before the drop lands.
    - Verified: I2VA `[p1]` → `[dropped1]`, FL2VA `[p1,p2]` → `[dropped2,p2]`,
      L2VA `[p1]` → `[dropped3]`, with `hiddenCount()` 0 and no badge in all
      three; empty slot and panel background still append. Full harness
      sweep (34 scripts) green.

---

## Upstream sync — 1.6.0

57. 🟩 merge the latest upstream changes (`Adudeguyman` 1.6.0: Draft mode,
    in-editor media loader, seven fixes)
    - One upstream commit, ~1300 lines, 20 conflicts across `pyproject.toml`,
      `README.md`, `web/medialoader.js` (5) and `web/promptbuilder.js` (12).
      `web_api.py` auto-merged. Version → **2.3.0**.
    - **Draft mode** came in whole: the disk-backed scratchpad, Pull from
      Live, per-draft reference sets, the teal chrome, and the prefs-menu
      "clear all drafts" admin row. Five new `drafts/*` routes.
    - **Re-pointed at this fork's node shape.** Upstream's draft code assumed
      a separate Media Loader node wired into a `references` input and
      reached for it in five places (`openMedia`, `openDraftMedia`,
      `_applyMediaSnapshot`, `_mediaDiverged`, `_snapshotMedia`). Prompt
      Studio owns its panel outright and has no such input, so every one of
      those would have bailed early and the feature would have looked
      installed but dead. They now all route through the fork's existing
      `mediaSource()`, which resolves either shape. Upstream's own
      `loaderItems()` was rewritten on top of it rather than kept alongside.
    - **Namespacing.** Upstream is on `.mml-`/`.mmh3-` and `/minimax_h3/`;
      this fork is on `.mmlp-`/`.mmh3p-` and `/minimax_h3_plus/`. 28 class
      references and 8 routes (5 server, 3 client) renamed. The CSS custom
      properties (`--mml-fs`, `--mmh3-fs`) keep their unprefixed names — they
      are shared with upstream by design.
    - **Dropped as dead here**: `addSplitter()`, `flash()`, `addMediaLoader()`
      and the standalone Media Loader / Prompt Builder node extensions. Those
      nodes were removed from this fork in an earlier session.

58. 🟩 flag what upstream 1.6.0 makes redundant or conflicts with
    - **The editor's Media Loader button — resolved in upstream's favour.**
      This fork's button *handed over*: it closed the editor, routing through
      the unsaved-changes strip via `requestClose(then)`, and then opened the
      loader. Upstream's opens the loader *over the top* and leaves the editor
      up. Upstream's is strictly better and draft mode requires it — a draft
      has its own reference set, which a handover cannot express — so the
      handover is gone. `requestClose(then)`'s mechanism stays (nothing calls
      it with a `then` now) since it is what makes close-and-then safe at all.
      `rig/closehandover.mjs` tested the removed behaviour and was replaced by
      `rig/mediaoverlay.mjs`, which asserts the inverse: no strip, editor
      stays open, panel reads *this* node's own `media_state`.
    - **Upstream fix "node and text scale never re-read at startup" — half
      redundant.** Its `applyStoredScale()` is dead code in this fork (it
      existed only for the standalone loader node's `onConfigure`). But the
      underlying bug was real here too and unfixed: nothing restored
      `--mml-fs` on workflow load. Ported the text half into
      `promptstudio.js`'s `onConfigure`; the node-size half is deliberately
      not ported, because `fitPanel()` already owns this node's height and
      a second writer would fight it.
    - **Upstream fix "`[Shot N]` chip was font-weight 700 → caret drift"** —
      landed clean, no conflict. This is the same class of bug as the mirror
      work in earlier rounds; worth knowing the metric-neutral `text-shadow`
      is now the house pattern.
    - **Not redundant, no conflict**: the atomic-write, save-under-new-name,
      category-filter, preset-picker-popover and preset-dimension-backfill
      fixes all apply here unchanged.

59. 🟩 fix the media panel's "bake" route, broken since the namespace move
    - Found while auditing routes for the merge, not reported. When this fork
      moved its endpoints to `/minimax_h3_plus/`, `medialoader.js`'s bake call
      — flattening a trim or crop into a new file — was missed and still
      posted to `/minimax_h3/bake`, which no longer exists. It would have
      404'd every time. One line.

60. 🟩 fix the harness's DOM stub treating `className` and `classList` as two
    separate stores
    - Found by a merge test failing on an assertion that was correct.
      `classList.add/toggle` wrote a `Set`; `className` read a different
      string. A class added through one was invisible to the other — which
      includes the stub's own selector engine and most of the harness's
      `find()` helpers. Tests were asserting against a view of the element no
      browser would ever produce.
    - They are now one store, as in a real DOM. Re-ran the full suite against
      the corrected stub, since this is the first time every class-based
      assertion in it has been honest: **35 scripts, all green.**

---

## Follow-up round 8

61. 🟩 rename the `picture_1`/`picture_2` outputs to `first_frame`/`last_frame`,
    matching what each mode actually sends: I2VA and FL2VA on `first_frame`,
    FL2VA and L2VA on `last_frame` (L2VA's one loaded picture IS the last
    frame, not the first), nothing on T2VA or Reference mode
    - **Breaking for saved L2VA workflows only**, and documented as such —
      see the new note under "Upgrading from 1.x" in the README, and the
      `pyproject.toml` version comment. Slots are positional in ComfyUI, and
      L2VA's picture used to travel on the `picture_1` slot regardless of
      which downstream input you'd wired it to; it now travels on the
      `last_frame` slot instead, matching what it actually is. I2VA and
      FL2VA are unaffected — their pictures already came out on the same two
      slots they do now, only the labels changed, and a label is not part of
      a saved link. Version → **2.4.0**.
    - `nodes.py`: `build()` now computes `first_frame`/`last_frame`
      explicitly per mode rather than blindly padding `keyframes[0:2]` into
      two same-named outputs. `RETURN_NAMES`, the class docstring, the
      module docstring and `DESCRIPTION` all updated to match; the console
      line that names which outputs fired now says `first_frame`/
      `last_frame` instead of `picture_1`/`picture_2`.
    - Swept the README for every `picture_1`/`picture_2` reference: the
      outputs table, the wiring instructions, both FAQ entries, and the
      "which output goes where" / "does switching mode change what's sent"
      sections. Left the media panel's own `<Picture N>` reference-tag
      numbering alone — a different, still-current naming scheme for the
      panel's reference slots, unrelated to these node outputs.
    - Verified by exercising `build()` directly (stubbing `media_io.load_image`
      to skip real image decoding — PIL isn't installed in this environment)
      across all five modes: T2VA and REF both `None`/`None`; I2VA
      `first_frame`/`None`; FL2VA `first_frame`/`last_frame`; L2VA
      `None`/`last_frame`. Matches the spec exactly.

---

## Follow-up round 9

62. 🟩 update with the latest upstream changes (1.6.1 + the 1.6.2 security
    release)
    - Two commits, 36 conflicts. Version → **2.5.0**. Details in the merge
      commit; the notable resolutions were keeping this fork's
      `/minimax_h3_plus/` prefix while taking upstream's new `@_guard`
      decorators (16 route conflicts resolved by script), and dropping
      `/browse`, `/mkdir` and `/probe` as dead here — the first two served
      the removed Filename Prefix node, and 1.6.2's own reasoning for
      deleting `/probe` applies to all three.
    - **Checked the security release doesn't break this fork's client.**
      1.6.2 makes JSON routes *require* `Content-Type: application/json`;
      every JSON POST here already sends it, and `upload` correctly stays on
      `@_guard(json_only=False)` for its FormData body. Added a client-vs-
      server route cross-check that confirms all 13 client routes resolve —
      it immediately caught `presets/match`, a new upstream route that had
      auto-merged onto the wrong prefix.
    - `requestClose()` took upstream's `{discard}` form, which supersedes the
      `then` parameter this fork added for the old Media Loader handover.
      Nothing had set `_closeThen` since that handover was replaced, so the
      dead mechanism was removed rather than left to rot.

63. 🟩 make tag colour coding consistent across every interface
    - **Found one real inconsistency by auditing rather than by eye.**
      Subject was `#7ec87e` in the rail cards, the field chips and the
      mini-tags, but `#6fbf73` in the generated-prompt preview and in the
      chips drawn inside the text fields — close enough to read as a
      rendering artefact, far enough to be visibly wrong side by side.
      Picture, Video and Audio were already consistent.
    - Fixed at the root rather than by patching two hex values: the palette
      is now one exported object (`TAG_COLORS`) emitted as `:root` custom
      properties by both stylesheets, and all 55 tag colour declarations
      reference `var(--mmh3-tag-*)`. A future family cannot quietly invent
      its own green, and an upstream merge that changes a hue shows up as a
      conflict in one place instead of as one surface disagreeing.
    - The waveform canvas is drawn, not styled, so it cannot read a CSS
      variable — it takes `TAG_COLORS.aud` from the same object instead of a
      literal, which is what stops it being the one drifting surface.
    - **A second bug surfaced while verifying.** My first pass kept each
      rule's *original* literal as its `var()` fallback, so subject still
      fell back to two different greens if the `:root` block ever failed to
      load. All fallbacks are now canonical.
    - `rig/tagcolours.mjs` reads the actual injected stylesheets and asserts:
      every kind has a declared hue, no tag rule sets a colour from a
      literal, each kind resolves to exactly one variable, no fallback is
      stale, and the canvas matches. Verified it fails against both drift
      modes before being restored — the first version of this test passed
      against the reintroduced bug, which is why it now checks fallbacks too.

64. 🟩 prevent opening the same window twice when moving between the prompt
    builder and the media loader
    - **The path that bit.** Upstream 1.6.0 changed the editor's Media Loader
      button from a handover to an overlay, so the editor stays open
      underneath. The loader's own "Prompt Builder" button still closed the
      loader and built a *fresh* editor — stacking a second one on the first.
      Two editors on one node disagree about state, and whichever you save
      last silently wins.
    - One guard, `raiseIfOpen()`, applied at all four entry points: the full
      editor, the quick editor, the prompt library and the loader modal. An
      already-open window is raised (re-appended, so DOM order puts it in
      front) and pulsed rather than duplicated. The pulse matters — without
      it the button looks broken when the window is already open behind.
    - A draft's loader is tracked separately from the live one: they are
      different targets, so both open at once is correct, not a duplicate.
    - Registry entries are cleared on close, so a reopened window is never
      blocked by a stale reference. `rig/singlewindow.mjs` covers all of it,
      including the exact reported path end to end.

65. 🟩 put the settings button to the left of the ✕ in the prompt builder and
    the prompt library
    - The library was already correct. The editor's gear sat mid-header
      between Clear and the guide, which put the one control that isn't about
      *this prompt* in among the ones that are. Both headers now end
      `⚙ | ✕`, verified against the rendered header rather than the source.

66. 🟩 update the dialogue speaker buttons as speakers are added
    - The row is built by `toolBar()` during `render()`, and `insert()`
      deliberately never re-renders — a full render rebuilds every field and
      drops the caret mid-sentence. So the derived button list was frozen at
      whatever the prompt held when the window opened, and `+ (S2)` only
      appeared after Save to node and reopening: two round trips to learn
      something the editor already knew.
    - `refreshDialogue()` swaps just that one row, driven by the `input`
      event that already bubbles to the form — so it covers the buttons, a
      rail drop, and typing `(S2)` by hand. It no-ops when the speaker set is
      unchanged, so an ordinary keystroke doesn't churn the DOM, and the
      language select is carried across rather than rebuilt so a repaint
      can't silently reset a chosen language.

67. 🟩 add the prompt builder's Add speaker button to the quick editor,
    defaulting to English
    - Built self-contained against the field's own text, the same way the
      quick editor's existing `+ Shot` button is — there is no shared
      "last focused field" here to lean on. The number offered is the next
      one the field hasn't used, and it advances as you add.
    - A compact language select sits beside it, defaulting to English
      (`LANGS[0]`). Carried explicitly rather than assumed, because the
      marker it writes has to name a language and guessing wrong is worse
      than one more control.
    - The inserted line never introduces a newline: the model reads a line
      break as a shot boundary, so only `[Shot N]` may start one. Same rule
      the full editor follows, and the test asserts it.

68. 🟩 harness: five DOM-stub fidelity gaps, four of them masking real code
    paths
    - The merge failed 22 of 35 scripts on one missing feature, and fixing
      that exposed the rest. Each of these made production code that works
      in a browser look broken — or worse, look fine — under test.
    - `value:""` on form controls. A real `<input>` has it from birth;
      without it a freshly rendered filter box threw on `.value.trim()` and
      took the whole panel render down with it.
    - **`isConnected` and parent tracking.** Six production sites read
      `isConnected` — "is this window still open", "is the caret's field
      still in the document" — and with no parent link every one silently
      read `undefined`. Four of those six pre-date this round's work, so
      whole branches had never been reached by any test. `remove()` also only
      worked on direct children of body/head; it now works on nested nodes,
      as a real DOM does.
    - **Event bubbling.** `insert()` signals its edit with
      `dispatchEvent(new Event("input", {bubbles:true}))`, and the listener
      that acts on it sits on the *form*, not the field — so that entire path
      was invisible to the harness. Added `dispatchEvent`, `replaceWith` and
      the `Event` constructor.
    - **`<select>.value`.** Not a stored string: with nothing selected a real
      select reports its first option's value. A freshly built picker read as
      empty, so "the language select starts on English because English is
      listed first" silently got `""`. `<option>` had no `value` property at
      all.
    - Two scripts (`run.mjs`, `t2va_combine.mjs`) carried private stubs
      predating `domstub.mjs` and had drifted from it, breaking on any merge
      touching a feature the private copy lacked. Both now import the shared
      one. **38 scripts green.**

---

## Follow-up round 10

69. 🟩 drop the quick editor's language dropdown; keep the prompt builder's
    progressive speaker buttons
    - The quick editor now shows the same row the full editor does: one
      button per speaker already in the text, plus the next unused ID, plus
      the pair button once there are two to pair. Re-using a speaker is
      clicking their own button rather than counting.
    - No dropdown. Lines go out as English (`LANGS[0]`, the full editor's own
      default); anything else is a word to change in the text.
    - The row is rebuilt on every edit rather than relabelled, because the
      button *count* changes as speakers are added — which is the behaviour
      being matched.
    - **Caught a bug of my own making, in the browser.** `replaceChildren()`
      is not `el()`: `el()` drops a null child, `replaceChildren` stringifies
      it. The pair button's absence rendered as the literal text **"null"**
      beside the buttons — in the state the row *opens* in, so it was on
      screen every time until a second speaker appeared. The headless harness
      only surfaced it as a crash in an unrelated test's DOM walker; the
      real-browser check is what showed what a user would actually see.
      Guarded now by an assertion on the row's own text content.

70. 🟩 remove the gap between the settings button and the ✕ in the prompt
    builder
    - Cause: `.mmh3p-head .mmh3p-x{margin-left:auto}` had the close button
      claiming all the header's slack on its own, pinning it to the edge and
      stranding the gear a full 14px header gap behind it. The settings
      wrapper claims the slack now and the ✕ cancels the gap, so the two read
      as one control group. The negative margin is derived from the gap
      variable rather than repeating `14px`.
    - **Measured, not assumed — and the first attempt was wrong.** The editor
      and library came out at 0px but the quick editor stayed at 14px: its
      header also carries a `.mmh3p-pushright` button, and
      `.mmh3p-pushright ~ .mmh3p-x{margin-left:0}` ties with the new rule on
      specificity, so source order decided it. The rules are now one ordered
      group with the dependency written down. Verified in real Chromium:
      **0.0px in all four windows**, with the ✕ flush to the header's right
      padding edge.

71. 🟩 keep the settings button placement consistent across every interface
    - Three of four windows already ended `⚙ | ✕`. The media loader's window
      was the odd one out: its gear sat at the far right of the *panel's*
      toolbar while its header held only the ✕.
    - The gear now renders in the loader's window header beside its ✕, and is
      re-framed there — `.mmlp-modalhead button` strips every button in that
      row back to a bare glyph, which would have left this one unframed while
      the other three are framed. Measured: gear and ✕ both 23px, same top.
    - The on-node panel has no header, so its gear stays last in the toolbar
      — the same rule ("settings sits last, by the close control") applied to
      the only row that view has.

72. 🟩 in the quick editor, put the Prompt Builder button next to the settings
    button
    - **My own regression from item 70.** Giving `.mmh3p-prefwrap` the
      header's `margin-left:auto` added a *second* slack-claimer to the quick
      editor's header, which already had one on its `.mmh3p-pushright` Prompt
      Builder button. Two auto margins split the free space rather than
      pooling it, so each took 264px and the button ended up 278px from the
      settings button it belongs beside — settings and close correctly
      paired, but marooned from it. The editor and library were unaffected
      (the editor's header is full, so there is no slack to split; the
      library has only the one claimer), which is why item 70's measurement
      passed.
    - Fixed by extending the invariant that rule already relied on for the
      close button: only the *first* slack-claimer in a header may claim, so
      `.mmh3p-pushright ~ .mmh3p-prefwrap` stands down. The quick editor now
      reads `Prompt Builder | 14px | ⚙ | 0 | ✕` — 14px being the header's own
      gap, the same spacing as every other adjacent pair.
    - The browser check now asserts the invariant directly rather than only
      the gear/✕ gap: at most one resolved auto margin per header, and the
      right-hand group contiguous at no more than the header's gap. Measured
      across all four windows.

73. 🟩 remove the quick editor's image-size slider (it does nothing); replace
    it with text size
    - **Confirmed the report, and found the shape of it.** Measured at the
      default window: `quickPicScale` 0.4 → pane 225px, 1.0 → 438px, 2.0 →
      438px. Turning it *down* worked; turning it *up* did nothing, because
      the fields' own 420px floor already caps the pane at that window size.
      So half the control was dead — my earlier "50% → 200% takes the pane
      428px → 888px" measurement was taken at a larger window, where the top
      half does move, which is why it read as working.
    - Removed the whole mechanism rather than just the slider: the pref, its
      two constants, and `keyframePaneLayout`'s `picScale` parameter, which
      nothing else fed. The pane still takes at most 65% of the width or
      whatever leaves the fields their floor, whichever binds first.
    - **Text size fixes a second bug the slider was hiding.** `--mmh3-fs` is
      one global custom property, and only the *full editor* ever wrote it —
      so opening the quick editor without opening the full one first left the
      stored text size unapplied entirely. Measured: with `textScale: 1.6`
      stored, the quick editor opened with `--mmh3-fs` **unset**.
    - The new slider therefore writes the shared `textScale` pref rather than
      a quick-edit twin: two prefs on one global property would fight, and
      whichever window opened last would win. Window size stays per-window,
      since the two windows are genuinely different sizes.
    - Measured after: `--mmh3-fs` applied on open at both 1.0 and 1.6, field
      labels 11px → 17.6px and textareas 13px → 20.8px (exactly ×1.6), the
      menu offering "Window size" and "Text size", and the keyframe pane
      still laying out correctly in I2VA and FL2VA with the fields at their
      floor and the pane inside its cap.
    - Two of my own test's assertions were wrong on the first run and are
      noted in the script: `===` on two arrays is always false, so a correct
      label list read as a failure; and the "fields keep their floor" check
      subtracted the pane's width from a *sibling* column rather than reading
      that column directly. The product was right both times.

74. 🟩 T2VA "Used" left a large empty gap between the media toolbar and the
    prompt fields — merge the panel and the prompt bar into one element
    - **Root cause.** The two were separate DOM widgets whose heights had to
      be reconciled by hand. On collapsing into T2VA's Used layout the panel's
      *element* correctly shrank to its toolbar (`.mmlp-min`, inline height
      cleared), but `fitPanel()` returned early for that shape and so never
      reduced the *widget's* `computedHeight` — the node went on reserving the
      panel's full height for an element that was no longer drawing it.
      Reproduced: panel element collapsed to a toolbar while its widget still
      reserved 428px. That unpainted reservation is the gap in the report.
    - This was the third height-desync in this file (the bar's inline height,
      the panel's stale fit, now this), so the fix is the merge rather than a
      third patch: **one DOM widget** holding the panel and the bar, with the
      split expressed as a flex rule instead of arithmetic. Whichever half is
      flexible takes the slack — normally the panel, and in T2VA's Used layout
      the bar, since the panel goes `flex:0 0 auto` when `.mmlp-min` applies.
      No arrangement can leave a gap, by construction.
    - `refreshBar()` no longer sets any height; it swaps content and a class.
      `fitPanel()` lost its shape special-case entirely and just sizes the one
      stack. `PANEL_H`/`SUMMARY_H` collapsed into a single `STACK_H` floor.
      The bar keeps a `min-height` (a floor, not a fixed height — setting
      `height` is what used to go stale).
    - Measured in real Chromium across six arrangements: T2VA/Used at 900px
      gives panel 57px + bar 843px; at 520px, 57 + 463; every other mode gives
      panel + a 52px bar. **Zero gap and zero slack in all six.** Confirmed
      the check catches a broken rule by deleting the expand rule: 407.8px of
      slack, which is the reported bug.
    - Two harness scripts asserted against the old two-widget shape and were
      updated to read the stack.

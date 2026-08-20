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

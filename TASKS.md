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
30. when text size is increased, button titles sometimes overflow into two lines outside the bounds of the button.
31. colour code Prompt Library's prompt previews
32. title-case Prompt library's title
33. add a Settings button on the top right
34. for the prompt previews, only show the user-inputtable text, not what was added on by Prompt Builder. make this a toggleable setting.
35. use the same rules as the prompt bar on the node for showing the speaker/music emojis.
36. reduce the width of the window by 25%
37. height should scale according to the amount entries.
38. add a setting for the entries to have double height.
39. on some browsers, when the hover-over preview for the chips sidebar is on the left side, it is very far to the left instead of right next to the chip.


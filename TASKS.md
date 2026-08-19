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
9. the input box for integrated\_multimodal\_description in the quick edit should fill the space up to where the sound/music sections start.
10. reduce the overall width and height of the quick edit window by 25%
11. ensure buttons on the trim windows do not overflow to a second line
12. change instances of the Size button to be a Settings button, bringing it in line with the new Settings button in the prompt editor.
13. move that Settings button on the node interface to be the rightmost button on the bar.
14. change "Load files..." to "Load"
15. change "Unload media" to "Unload All"
16. move the button for the full size media loader to be the first item on the bar
17. the "No reference media on this node yet" text, change it to a size consistent with the rest of the interface, and scale with the text size setting.
18. add a setting for the Prompt Builder to maximise the vertical height of the window, with a reasonable margin on the top and bottom (window size setting then only affects width)
19. media chips should be aligned to the left in the classic prompt builder layout, like before
20. make sure the add media 'chip' is aligned with the actual chips in the new layout
21. the warnings list text should wrap and never be horizontally scrollable.
22. allow minimizing the warnings section
23. don't allow the integrated\_multimodal\_description input box to overlap anything else.
24. add a setting to do the following: change tag hover-over preview to activate the media strip preview popup instead of at the cursor.
25. add a setting to hide the help captions ("One line per tracked item. Focus a line, then..." etc)
when hiding, makes it a mouse-over caption for the respective section.
26. in reference mode, the style dropdown only adds its text to detailed\_description fields.
27. settings gear button should have a frame around it like every other button. going forward, any instance of this button should be styled like this.
28. when clicking the audio/music icons on the node's prompt bar, it should open to the quick edit and select the respective field.
29. reconcile inconsistencies between the final prompt preview colour coding and input boxes colour coding.
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


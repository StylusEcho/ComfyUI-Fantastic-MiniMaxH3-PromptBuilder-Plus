### prompt studio to-do list
* 🟩 solve the bug from upstream 1.4.2 that was mentioned.
  * Already fixed in `e6e67fd`: `turn`/`quarter` were `const`-declared below the `if (it.crop)` block that reads them, so any cropped picture threw a temporal-dead-zone `ReferenceError` and took the whole panel render down. Declarations hoisted above first use (`web/medialoader.js`). Still present upstream.
* 🟩 add a square with a dashed lines on the prompt builder window's media area, similar to the empty rectangles on the node interface, to drop and drop/copy/paste additional media on this screen, if possible for the current prompt mode and within limits.
  * Dashed `+` tile appended to the editor's rail by `refChips()`, sized to match a media card (measured 130px wide, same as a card). Click opens the picker, files can be dropped on it, right-click offers paste — all delegated to the owning `LoaderPanel`'s existing `add()` / `slotMenu()` / `pasteItem()`, so uploads and budget refusals behave exactly as on the node. Shown only for kinds the current mode can still take: gated on `MODE_CAPACITY` plus the panel's own `capacityError()`, so it is hidden entirely in T2VA and when a mode's slots are full.
* 🟩 when hovering over a thumbnail, the preview should be 50% larger than it is now, and the frame should follow the aspect ratio of the image.
  * Peek grown 360px -> 540px (+50%, measured exactly 540 after switching it to `border-box`). The frame now sizes to the picture instead of letterboxing it: `width:max-content` on the box with `width/height:auto` and a cap on each axis for the media. Measured — landscape 1600x900 renders 540x304 (ratio 1.78) and portrait 600x1200 renders 378x756 (ratio 0.50), both matching source. Waveform buffer and the screen-edge clamp moved with it.
* 🟩 remove the green media toggle switches from the prompt builder window.
  * The on/off control is gone from the editor's thumbnails; only the crop/trim button remains there. Dead `.mmh3-cardtool.lit` rules removed. Switching media off is still available on the node tiles and from the slot right-click menu.
* 🟩 put the detail dropdown for videos to the left of the video quantity counter.
  * Moved out of the panel's top row into the videos section header, immediately left of the `N/3` count (it takes over the header's push-right so the two sit together). Still only rendered when a video is loaded.
* 🟩 move the unload media button next to the Load files button
  * Now directly after **Load files…** in the top row, where it previously sat past the spacer on the far right.
* 🟩 add an icon to the left side of the node prompt preview of a scroll or letter to indicate that it is for prompting. when this icon is clicked, it opens the Prompt Builder.
  * 📜 added at the left of the node's prompt bar; clicking it opens the Prompt Builder. Verified it renders as the bar's first child with a click handler. The whole bar already opened the editor — nothing said so.
* 🟩 the node prompt preview should show the contents of integrated\_multimodal\_description in all modes except Reference. for Reference, the contents of detailed\_description.
  * The bar now shows the description the mode is built around rather than the whole assembled prompt: `integrated_multimodal_description` in T2VA/I2VA/FL2VA/L2VA, and `detailed_description` (style opening + shots) in Reference. Verified across all three cases.
* 🟩 resizing overall\_soundscape or non\_diegetic\_music should also resize the other.
  * The two boxes are height-linked by a pair of ResizeObservers with a re-entrancy guard, so dragging either grip resizes the other and the pair stays level; applied in both the base and reference layouts. Degrades silently where ResizeObserver is unavailable. ⚠ The drag itself needs a pointer, so it is a manual check — the wiring and guards are verified, the gesture is not.
* 🟦 the button I've asked to be added to the thumbnails in the prompt builder, they should be in the bottom right to match them on the node interface.
* 🟦 add a Pin button. red if enabled. remove the bottom buttons in the hover-over preview if you think they're redundant.
* 🟦 add an x like the node as well for removal.
* 🟦 the audio trim window needs to be reverted to its original size.
* 🟦 <> tags in the prompt builder should be colour coded (orange for <Picture x>, green for <Subject x>, etc). \[Shot x],<d>\[language] </d> tags should get their own colour too, decide that based on what's unused. same for (Sx) and N/A
* 🟦 the prompt preview on the node, there should be icons on the right (to the left of the mode dropdown).
🔊 if overall\_soundscape has content. 🎵 if non\_diegetic\_music has content. but not if they are just N/A.
* 🟦 in the prompt builder, if there is linked audio and video media, the video should come first. also, reduce the space between the two to zero (teal next to purple border), no corner radius on the corners that are joined. when joined, there should only be one x removal button and one trim button, on the right media chip.
* 🟦 remove the 3 Prompt Builder/open media/etc buttons on the node.
* 🟦 move the prompt builder bar below the media loader on the node interface.
* 🟦 clicking the node interface prompt preview opens a window to quickly edit the integrated\_multimodal\_description, overall\_soundscape and non\_diegetic\_music for non-Reference modes. for reference, show detailed\_description (style opening and shots) instead of integrated\_multimodal\_description.
* 🟦 add a button on prompt builder to toggle a view for the media to be on a single-column sidebar on the left edge of the main window. in this mode, the hover-over preview goes to the right of the thumbnail instead of down. for linked video/audio media, change the spacing and borders appropriately like I instructed before.
* 🟦 add a button at the top right of the node interface media loader. when clicked, it toggles between two layouts: the default, and a new layout where it only shows slots for media that are appropriate for the current prompting mode. eg:
one large box for i2v/l2va
two side by side boxes for fl2va
media prompter minimized in t2va and prompt preview bar maximised and taking up the remaining space, exposing editable integrated\_multimodal\_description, overall\_soundscape and non\_diegetic\_music.
no change for reference mode.
* 🟦 change dots in tag order bar to right arrows. colour code the tags.
* 🟦 add fl2va and ref2va model inputs, and one model output. the appropriate model is passed to the output depending on the prompt mode selected.
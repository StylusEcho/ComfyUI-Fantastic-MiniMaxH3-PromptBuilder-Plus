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

   Two more worth knowing about, neither blocking:

   - **#12 / #13 supersede recent work rather than upstream.** Linked video+audio are
     currently *two* cards joined edge-to-edge with squared inner corners
     (`joinL`/`joinR`, built last session). #12 replaces that with a single
     `Video 1 + Audio 1` chip, so that styling gets torn out — intended, just noting
     it is not additive.
   - **#25 gets easier post-merge.** Upstream added the tag-painting chain the
     editor's preview uses, so colouring the prompt bar's preview is reuse rather
     than new parsing.

2. 🟦 remove the drag button on the media loader thumbnail for minimized I2VA mode
3. 🟦 show the 15 sec mark with a line after the starting marker in the trimming window. the ending marker can snap to this marker.
4. 🟦 join the prompt bar on the node with the media loader
5. 🟦 provide some alternative names to "Mode" for the media loader layout button
6. ❓ put the model node output first in the outputs — **see #1: this renumbers every output slot and breaks saved workflows. Needs your go-ahead.**
7. 🟦 if there is never any other button options except N/A below the sound/audio boxes, move them to the top right of their sections.
8. 🟦 show playback controls for pinned videos
9. 🟦 allow drag and drop resorting of pinned media
10. 🟦 set max width for pinned sidebar to only as much as is needed to fit the widest images and videos, anchored from the right edge. same logic for vertical, anchor from the top edge.
11. 🟦 pinned audio only takes up the minimum amount of vertical space possible.
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
40. 🟦 for the pinned media views, only show the cropped view.
41. 🟦 media chips should reflect the cropping as well.
42. 🟦 the hover over thumbnail should show the full image, but have a frame around the cropped area, like how the crop editor shows.
43. ❓ immediately remove items from view when viewing the quick album and removing them from it. — **no "quick album" exists in this pack or upstream. See #1.**
44. ❓ quick album hotkey doesn't work for fullscreen. — **same as #43.**
45. 🟦 going from quick prompt to prompt builder should transfer the prompt over.
46. 🟦 the quick prompt editor should show picture 1 and/or picture 2 on the left side.

# ComfyUI MiniMax H3 Prompt Studio (Plus)

![version](https://img.shields.io/badge/dynamic/toml?url=https%3A%2F%2Fraw.githubusercontent.com%2FAdudeguyman%2FComfyUI-Fantastic-MiniMaxH3-PromptBuilder%2Fmain%2Fpyproject.toml&query=%24.project.version&label=version&color=0a6166) ![nodes 2.0](https://img.shields.io/badge/Nodes%202.0-compatible-7ec87e) ![license](https://img.shields.io/badge/license-MIT-blue)

Guided prompt writing and reference-media handling for the open-weight
**MiniMax H3** video model in ComfyUI, in a single node.

H3 doesn't want a casual sentence — it wants a structured prompt with named
sections, shot timings, speaker IDs, and tags pointing at your reference media.
MiniMax publishes a written guide for that format, and normally a separate
rewriting model (`H3-Context-IR`) turns your idea into it. That rewriter wasn't
open-sourced. This pack is the hand-driven replacement: fillable templates for
every mode, live checking against the guide's rules, and a media panel that
keeps your reference tags straight — all on **MiniMax H3 Prompt Studio**, the
one node you need to install this pack for. (Six more come with it since
2.6.0, for [RefMods](#refmods); you only meet those if you use them.)

This is a companion to
[Adudeguyman's Fantastic H3 Prompt Builder](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder),
not a replacement for it. That pack's standalone Prompt Builder, Media Loader,
Reference Splitter, and Filename Prefix nodes aren't duplicated here — install
both packs side by side if you want those too (see
[Reference mode](#reference-mode) for why full-reference workflows still want
the Reference Splitter).

![Keyframe workflow](docs/2.png)

*Prompt Studio → MiniMax H3 Image to Video*

![Media previews in the editor](docs/6.png)

*Media is displayed while you work. Hover over for previews. Clicking media
automatically adds the tag (like `<Picture 1>`) into the active text field for
you.*

Picture thumbnails in the media panel carry their pixel size and aspect ratio
in the corner, repeated in the larger preview when you click one. The ratio is
named from the same list the resolution selectors use (16:9, 4:3, 9:16, 21:9
and so on), with `≈` when a reference only comes close — so you can see at a
glance which preset matches it. Hover the thumbnail for the exact figures.

![Trim and crop editor](docs/7.png)

*Trim and crop clips on the fly without touching the original files, and pull
any frame straight out of a video into your picture references.*

![The RefMod library](docs/refmods/01-library.png)

*Now supports creating, editing, organizing, and tagging
[RefMods](REFMODS.md).*

---

## What's new in 2.6.0

Folds in upstream's 1.6.3, 1.6.4, 1.7.0 and 1.7.1. **This is the release that
stops being a one-node pack** — see [RefMods](#refmods) below, and
[Upgrading](#upgrading-from-1x) for what it means for a workflow you already
have.

### RefMods (upstream 1.7.0 and 1.7.1)

**Save a character, a place, a look or a voice once and use it in any prompt
after that** — no re-uploading, no re-cropping. A RefMod is a small file in
`models/refmods`; the model reads it the same way it reads a reference
picture or clip. New to them? Start with the
[RefMods how-to guide](REFMODS.md).

This is a whole subsystem, and it brings **six new nodes** with it. Until now
this pack installed exactly one node, on purpose. RefMods needs more than one
— a node to hold the picks, a node to encode them, and three that make and
inspect the files — so the count went from one to seven:

| Node | What it's for |
|---|---|
| **MiniMax H3 RefMod Stack** | Holds the RefMods a prompt uses, with a weight per pick. **Browse library…** picks from what you've saved. |
| **MiniMax H3 RefMod Text Encode** | Stands in for *MiniMax H3 Reference to Video*. Sends the RefMods and Prompt Studio's media to the model together, numbered in one sequence, and hands back the empty latent. |
| **MiniMax H3 RefMod Apply** | Appends references to conditioning encoded elsewhere, for workflows that already have their own text encoding. |
| **MiniMax H3 Create RefMod** | The node the library queues when you create one. Works by hand in a graph too. |
| **MiniMax H3 Inspect RefMod** | Decodes a RefMod so you can see what's actually stored in it. |
| **MiniMax H3 Edit RefMod** | Drops, reorders or adds frames, and swaps the voice. |

**Prompt Studio's editor** gets a **◈ RefMods** button in its header. It adds
and wires a stack for you (or opens the one you already have), shows RefMods
as chips beside your media, warns when something isn't reaching the Text
Encode, and keeps a draft's RefMods separate from Live — the same way it
already handles media. Right-clicking the Prompt Studio node has a **RefMod
library** entry that sends the node's loaded media straight to the Create tab.

**The library** is where RefMods are made and looked after. Drop in pictures,
clips or audio (or pull them off the node's media panel), choose Full or
Compressed, and create. Several photos become one RefMod; a clip's soundtrack
or an audio file becomes its voice. Later you can rename it, give it a
description and a preview image, see what's stored inside it, drop or reorder
its frames, add more, swap the voice, or save the result as a copy.

RefMods made from a **video clip** hold real motion: Create and Edit take the
first frames of the clip on H3's own frame grid — 22 frames store 7, 39 store
12, 56 store 17 — rather than evenly spaced picks that stored only 2.

Two ready-made workflows show the whole chain,
`MMH3_RefMod_Vanilla_Stack_Example.json` and
`MMH3_RefMod_Fully_Fantastic_Example.json`. **Both are built on the original
pack's Prompt Builder and Media Loader** rather than on Prompt Studio, so they
need that pack installed alongside this one to load — see
[Example workflows](#example-workflows).

The format comes from
[ComfyUI-MiniMaxH3Mod](https://github.com/Luisacaotica/ComfyUI-MiniMaxH3Mod)
and is shared with it, so the two packs mix freely in one graph. Single-file
RefMod bundles saved by ComfyUI-MiniMaxH3Mod 0.2.6 show up in the library and
can be used and inspected (not edited) here.

### Delivery tags (upstream 1.6.4)

A new **Delivery** row in the editor, under the dialogue row, inserts the
community-found performance tags that shape how a line is spoken: pauses and
breaths, emphasis and whispering, and non-verbal sounds such as laughs, sighs
and gasps. Pick a group, pick a tag, and hover the picker to preview an
example line before inserting it. Tags that wrap text, like `<i>` and
`<whisper>`, wrap whatever you have selected and leave it selected; with
nothing selected the caret lands between the two halves, ready to type.

These tags aren't in MiniMax's published guide, so results may vary — the
bundled writing guide lists them in a **Community Discoveries** section,
clearly marked as community findings.

Delivery tags show in pink in the prompt, in the picker's preview and in the
guide, so they stand out from the words being spoken. `<pants>` and
`<smacks lips>` are gone; they didn't do anything.

### Fixes (upstream 1.6.3, 1.7.0 and 1.7.1)

- The crop frame now follows the picture when you rotate it. Turning a picture
  that had an active crop left the marquee stranded in the black area beside
  the image, wrongly shaped, and it could barely be dragged and never over the
  picture itself.
- Weight sliders on a long stack no longer jump the list back to the top.
- Set/Get nodes between Prompt Studio and the Text Encode are followed, so
  labels and warnings stay right on tidy graphs.
- A draft with its own media or RefMods but no text yet is saved to disk like
  any other draft (it used to be lost on reload).
- Deleting a RefMod closes its details panel.

### Coexistence

Everything RefMods added has been renamed for this pack, the same way the rest
of it already was: the six node types, their frontend CSS and their server
routes all carry this pack's own names, so installing it alongside
[the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
still works with no clashes. The **RefMod files themselves are shared** — both
packs read and write `models/refmods` — which is the point: a RefMod you make
in one is usable in the other, and in ComfyUI-MiniMaxH3Mod.

---

## What's new in 2.5.0

Folds in upstream's 1.6.1 and the 1.6.2 security release.

### Security (upstream 1.6.2)

**Security release.** This version exists to address findings from the Comfy
Registry's security review of earlier versions. No features changed; if you
run any earlier version, update.

- **Path containment.** Every file path a request supplies is now resolved
  and verified (via `realpath`) to live inside ComfyUI's input, output or
  temp directory before it is read, and the fallback that could previously
  rewrite a rejected path into an unconfined one is gone. Symlink escapes
  are caught by the same check.
- **Cross-site request protection.** Every `POST` route now refuses requests
  that a browser marks as coming from another site (`Sec-Fetch-Site:
  cross-site`, or an `Origin` that doesn't match the host), independently of
  ComfyUI core's middleware — which matters on `--listen` installs, where
  core's Host/Origin comparison doesn't apply. A malicious web page you
  happen to visit can no longer call this pack's upload, delete or write
  endpoints.
- **JSON routes require `Content-Type: application/json`.** Cross-origin
  pages cannot send that content type without a CORS preflight, which is
  never approved, so the JSON endpoints stop being reachable as "simple
  requests". *If you script these endpoints yourself, add the header* — a
  `text/plain` body now gets a 415.
- **Deletion is double-checked.** The prompt/preset delete and rename paths
  re-verify, immediately beside the `os.remove`, that the target file lives
  inside its own library directory.
- **`POST /minimax_h3/probe` removed.** Nothing in the pack called it, and
  an uncalled endpoint that accepts an arbitrary path is pure attack
  surface. Media metadata comes from the upload and extract responses and
  from `presets/load`, as before.
- **No more shelling out to ffmpeg.** All video and audio decoding now goes
  through PyAV in-process (ComfyUI core requires PyAV, so every working
  install has it). The ffmpeg/ffprobe fallback paths are gone: they were the
  cause of the registry scanner's command-injection flags (list-argument
  calls that were never actually injectable, but the cleanest answer is no
  external processes at all), and they were also the pack's only dependency
  on a binary being on PATH. If you previously relied on ffmpeg because PyAV
  was broken in your environment, see Troubleshooting — a broken PyAV also
  breaks ComfyUI itself, so it's worth fixing either way.

### Prompt/preset linking and categories (upstream 1.6.1)

**Prompts can be linked to a media preset.** A prompt is written for a
particular set of references, so saving one can remember which. If your
current media already matches a saved preset it offers to link it; if it
doesn't, it offers to save it as a preset and link it in the same action.
Which case applies is decided by comparing the media itself, not by the label
on the preset picker — that label survives every edit short of *Unload*, so it
can name a preset your media stopped matching an hour ago. Loading a linked
prompt never swaps your media silently: a strip names the preset, its
reference count and how many it would replace, and warns you if the preset has
been edited since it was linked, because reference numbers are positional and
`<Picture 3>` may no longer mean the picture you wrote it for. Linked prompts
carry a badge in the library showing what the preset holds, with a hover
preview of its contents. In draft mode the media goes to the draft's own set,
never to the node. See
[Linking a prompt to its media](#linking-a-prompt-to-its-media).

**Media presets can be categorised.** The picker now has the same bar the
prompt library does — a search box, a category dropdown and a ✎ to rename or
clear a category — above a list grouped by category with uncategorised sets
last. File a preset when you save it, or from the ✎ on its row in the picker,
which changes only the label and never touches the media. Preset names stay
unique across every category, because a prompt links to a preset by name.

**Closing can save instead of asking.** A new ⚙ setting, *Save to node when
closing*, makes ✕, Escape and clicking outside give the node your changes.
Cancel still discards, and a draft is never written to the node by closing.
While it's on, the unsaved-changes warning greys out, since it has nothing
left to warn about.

**The bundled guide is now HTML rather than a PDF** — it opens in a tab,
searches with Ctrl+F, has a contents sidebar and deep links, and reads
properly on a phone.

**Fixes:**

- Rotating a picture or clip in the crop editor no longer paints outside the
  window. A quarter turn used to spill over the toolbar and cover the rotate
  button itself, so the turn couldn't be undone.
- The dialogue row's speaker buttons now keep up with your text. Inserting a
  line for (S1) offers (S2) next, as it always should have — the row was only
  rebuilt when something else redrew the editor.
- Escape now respects your preferences. It used to close the editor directly,
  discarding unsaved edits even with *Warn about unsaved changes* switched
  on — which is the opposite of what that setting says.
- A draft no longer loses its edits when you switch back to Live and then
  close the editor.
- A draft that never had media of its own no longer reverts your Media Loader
  when it's committed. Media a draft merely displays is now kept separate from
  media it owns, so only a set you deliberately edited is applied.
- A draft started while the Media Loader was empty now follows the node's
  media instead of showing none for ever, and committing it can't clear your
  loader.
- Media stored in a draft is checked when it loads; anything unusable is
  discarded and the banner says how many, rather than a broken reference
  reaching a generation.
- The preset picker no longer reports a freshly loaded preset as edited. It
  compares effective values now, so a preset whose stored form predates a
  field still matches itself after loading.
- A preset containing a switched-off item can be recognised again; the
  comparison was ignoring disabled items on one side only.
- The draft banner stays pinned above the editor body instead of scrolling
  away, and survives a failure elsewhere in the form — it's the one thing that
  tells you the node isn't holding what you're looking at.
- The ⚙ menu can discard every saved draft, and shows how many there are.

---

### Draft mode (upstream 1.6.0)

**Draft mode.** Queue a batch, then start writing the next prompt on a
scratchpad the node can't execute. Drafts autosave to disk, survive a browser
crash, reopen where you left off, and can carry their own reference set.
**⇣ Pull from Live** copies the current prompt across — cast and setup only,
or everything — so a follow-up shot doesn't mean re-typing your subjects.
See [Draft mode](#draft-mode).

**The media loader opens inside the editor.** The editor header's
**❐ Media Loader** button now brings the panel up *over* the editor instead of
closing it first, so adding a reference mid-sentence no longer costs a trip
through the unsaved-changes prompt.

**Fixes:**

- Saving a prompt under a new name no longer deletes the one you loaded.
  Renaming is now its own clearly-labelled action, and a name collision asks
  before overwriting instead of replacing silently.
- The library's category filter no longer sticks to a category that no longer
  exists, which made a full library look empty.
- The Media Loader's preset dropdown stayed open reliably; it was a native
  `<select>` inside the node, which the ComfyUI frontend closes on every
  canvas redraw.
- Presets saved before dimensions were stored now come back with their aspect
  data, and no longer cause a burst of redraws that made the browser sluggish.
- The text size you set is re-applied when a workflow loads, instead of the
  panel reverting to 100% inside a correctly-sized node.
- Fixed caret drift in the highlighted text fields: the `[Shot N]` marker was
  drawn bold, and the extra glyph width pushed the caret out of step with the
  text underneath.
- All prompt and preset writes are atomic, so a crash mid-save can't corrupt
  an entry.
- **(Plus only)** The media panel's "bake" call — flattening a trim or crop
  into a new file — was still pointing at upstream's `/minimax_h3/` route
  after this fork moved its own routes to `/minimax_h3_plus/`, so it 404'd.

---

## Contents

- [What you get](#what-you-get)
  — [Example workflows](#example-workflows)
- [Requirements](#requirements)
- [Install](#install)
- [Prompt Studio](#prompt-studio)
- [Quick start](#quick-start)
- [Writing a prompt](#writing-a-prompt)
- [Prompt library](#prompt-library)
- [Draft mode](#draft-mode)
- [Reference mode](#reference-mode)
- [FAQ: wiring reference media](#faq-wiring-reference-media)
- [RefMods](#refmods) (step-by-step: [RefMods how-to guide](REFMODS.md))
- [Dated output folders](#dated-output-folders)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)
- [License](#license)

## What you get

Under **conditioning → video_models**. **One node does the prompt and the
media** — that's the pack:

| Node | What it's for |
|---|---|
| **MiniMax H3 Prompt Studio** | The prompt editor and the reference-media panel in one node. No inputs required — prompt, the gated reference bundle, two keyframe images, a mode flag, and a routed MODEL all come out. Start here. |

That's deliberate: this pack exists so you don't need two nodes wired together
for the common case.

The other six are the [RefMods](#refmods) subsystem, added in 2.6.0. You only
meet them if you use RefMods, and even then mostly through windows rather than
by wiring:

| Node | What it's for |
|---|---|
| **MiniMax H3 RefMod Stack** | Holds the RefMods a prompt uses. Prompt Studio's **◈ RefMods** button adds and wires one for you. |
| **MiniMax H3 RefMod Text Encode** | Stands in for *MiniMax H3 Reference to Video* when RefMods are in play. |
| **MiniMax H3 RefMod Apply** | Attaches references to conditioning encoded elsewhere. |
| **MiniMax H3 Create RefMod** | Makes a RefMod. The library queues this for you. |
| **MiniMax H3 Inspect RefMod** | Decodes a RefMod to see what's stored in it. |
| **MiniMax H3 Edit RefMod** | Changes a RefMod's frames or voice. |

If you also install
[the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder),
its Prompt Builder, Media Loader, Reference Splitter, and Filename Prefix
nodes appear alongside these with no name clashes — the two packs are built to
coexist, RefMod nodes included, and both read the same `models/refmods`
folder.

### Example workflows

Three ship in `example_workflows`, loadable from ComfyUI's workflow browser
(Workflows → Browse Templates → this pack):

| Workflow | What it shows |
|---|---|
| `MMH3PromptBuilder_AIO_Example.json` | The Set/Get fan-out pattern — one media source driving an fl2va and a ref2va pipeline. See [One loader, two pipelines](#one-loader-two-pipelines). |
| `MMH3_RefMod_Vanilla_Stack_Example.json` | The RefMod chain with core ComfyUI nodes only. |
| `MMH3_RefMod_Fully_Fantastic_Example.json` | The same chain plus the Fantastic LoRA loader and seed nodes from [comfyui-fantastic-loras](https://github.com/Adudeguyman/comfyui_fantastic-loras). |

**All three came from the original pack and are built on its standalone Prompt
Builder and Media Loader, not on Prompt Studio**, so they need that pack
installed alongside this one to load at all. They're kept because the patterns
they show are worth having; Prompt-Studio-native rebuilds are on the list and
aren't done yet.

Highlights:

- **Templates for all five modes** — text-to-video, first frame, first+last
  frame, last frame, and full reference mode.
- **Click-to-insert tags.** Your reference media appears as thumbnails; click
  one to drop `<Picture 2>` into your text. No typing tags by hand.
- **Live checking.** Shot numbering, cut times, dialogue formatting, references
  you connected but never mentioned — flagged while you write, not after a
  failed render.
- **The official guide is built in.** A 📖 button opens the full guide in a new tab — searchable, linkable, and readable on a phone.
- **Your work isn't lost by a stray click.** Closing with unsaved changes asks
  first — **Save to node**, **Discard**, or **Keep editing**. Only *Save to
  node* changes what the node sends. If you'd rather work the other way round,
  ⚙ → *Save to node when closing* makes ✕, Escape and clicking outside hand
  your changes to the node instead of asking; Cancel still discards, and a
  draft is never written to the node by closing. The ⚙ menu can also turn off
  click-outside-to-close, or the warning itself.
- **Reference tags read as chips** in the text, colour-coded by kind (⚙ has a
  toggle for plain text fields, which keeps the hover previews), with the
  thumbnail on hover — no side panel opening and shifting the layout. Hovering
  a `<Subject N>` shows the first picture its definition cites, the media it
  references, its speaker ID, and any `<Audio N>` attached to it — including
  voice references declared the other way round, in the audio's own line. Tags
  with nothing behind them show red as you type.
- **A dialogue row** with a language picker and one button per speaker already
  in the prompt, plus the next unused ID — and a voiceover toggle that writes
  the guide's exact phrasing including the lips-closed clause.
- **Cut markers are chipped too** — `[Shot 2] at 00:03.000` reads as one unit,
  in a neutral slate, so the structure of a multi-shot prompt is scannable.
- **Spoken lines are shaded** — `<d>…</d>` blocks get a blue band matching the
  speaker chips, with the markers dimmed and the language tag picked out, so you can see at a glance
  what the model will actually say and catch delivery notes that drifted
  inside the tags. Speaker IDs like `(S1)` are chipped too.
- **Drag-and-drop media** with previews, playback, and reorderable slots.
- **Non-destructive trim and crop** — a popout editor sends just a slice of a
  clip (like its last 3 seconds), or just a region of the frame, without
  touching the file.
- **A prompt library** — save prompts with categories and favourites, then
  search and reload them.
- **Draft mode** — park the prompt that's queued and start the next one on a
  disk-backed scratchpad, with its own reference set, that can't be executed
  until you commit it.
- **The media loader opens inside the editor** — no hunting for the node on
  the canvas to add a reference mid-sentence.
- **Media presets** so you can reload a set of references in one click.
- **Unload media** clears the node in one go (after a confirmation) without
  deleting the underlying files, so presets pointing at them still work.
- **Size control** — ⤢ Size sets the media panel's scale (100–300%) and its
  text size (100–200%) independently, by slider or by typing the number.
  Changes apply when you press **Apply**, not while you drag, because
  resizing the node would pull the slider out from under the pointer. Both are
  remembered for you rather than for the workflow, so a node dropped into a
  new graph starts at the size you actually work at. The prompt editor has the
  same two sliders in its ⚙ menu, which is what you want on a 4K monitor.
- **Detail control for reference video** — decode big clips at a smaller size
  so a long 4K reference doesn't eat gigabytes of RAM.
- **Optional model routing.** Wire both checkpoints — `fl2va_model` and
  `ref2va_model` — once, and the node's `model` output passes through whichever
  one the saved mode actually runs on. Both inputs are lazy, so the checkpoint
  the mode isn't using is never pulled into memory.

---

## Requirements

- **ComfyUI 0.30.0 or newer** — this is when H3 support landed.
- **The MiniMax H3 models.** Use the `fl2va` checkpoint for text and keyframe
  work, `ref2va` for reference mode. ComfyUI's own H3 templates will set you up.
- **PyAV** — used for video and audio decoding. ComfyUI itself requires PyAV,
  so every working install already has it; the node checks at startup and
  tells you if videos are unavailable rather than failing when you hit queue.
  Since 1.6.2 the pack never shells out to ffmpeg — decoding is all in-process
  through PyAV.

---

## Install

**Via git**

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/StylusEcho/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder-Plus
```

**Via ComfyUI Manager** — search for "MiniMax H3 Prompt Studio" and install.

**Manually** — download the ZIP and extract into `ComfyUI/custom_nodes/` so you
end up with `ComfyUI/custom_nodes/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder-Plus/`.

This installs alongside
[the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
without conflict — install one or both.

Then **restart ComfyUI completely** — not just a browser refresh. Nodes are only
registered at startup.

To confirm it worked, search the node menu for "MiniMax H3 Prompt Studio".

### Upgrading from 1.x

**2.0.0 is a breaking release — check any workflow you already have.** Two things
changed that a saved workflow can't adapt to on its own:

- **The standalone Prompt Builder, Media Loader, Reference Splitter and Filename
  Prefix nodes are gone from this pack.** A workflow wired to them will report the
  node types as missing. Install
  [the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
  alongside this one and they come back, unchanged.
- **Prompt Studio's outputs were reordered** to put `model` first. ComfyUI stores
  connections by slot position, not by name, so every link out of a Prompt Studio
  placed before 2.0.0 now points one slot off — the link that fed `prompt` is now
  attached to `model`, and so on. **Reconnect its output wires**; there is no need
  to delete and re-add the node, and you shouldn't, since your prompt, editor
  state and loaded media all live on the node's own widgets and are carried
  across the update intact.

**2.4.0 renames `picture_1`/`picture_2` to `first_frame`/`last_frame` and, for
L2VA only, moves which output slot the picture comes out on.** The rename
alone is cosmetic — ComfyUI links by slot position, not name, so it doesn't
touch existing connections. But **L2VA workflows saved before 2.4.0 need their
picture link moved**: L2VA's one loaded picture used to travel on the
`picture_1` slot (whichever input you'd wired it to), and now travels on the
`last_frame` slot instead — matching what it actually is, the *last* frame,
not the first. **Reconnect L2VA's picture wire to the new `last_frame`
output**; I2VA and FL2VA are unaffected, since their pictures already came out
on these same two slots.

**2.6.0 adds six nodes and breaks no existing workflow.** Everything already
on your canvas keeps working exactly as it did. Prompt Studio itself gains
one new optional input (`mods`) and one new trailing output (`mods`) so it
can actually carry a RefMod bundle — both appended after everything that was
already there, so no existing slot moves and no existing wire is disturbed.
The rest of the change is [RefMods](#refmods) arriving, with six more node
types under **conditioning → video_models**. If you don't use RefMods you
can ignore all of it entirely; if you do, start at **◈ RefMods** in the
prompt editor's header.

One thing to know if you also run
[the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder):
its RefMod nodes and this pack's are **separate node types with separate
names**, so a workflow saved against one won't pick up the other's nodes. The
RefMod *files* are shared, so your library is the same either way.

---

## Prompt Studio

**MiniMax H3 Prompt Studio** puts the prompt editor and the reference-media
panel on one node. There's nothing to wire between them: the media lives on
the same node that writes the prompt, so the tags the editor offers are always
the tags the output actually carries.

It takes **no required inputs** — one optional `mods` for
[RefMods](#refmods), alongside the two optional checkpoint inputs below — and
has seven outputs:

| Output | Type | Goes to |
|---|---|---|
| `model` | `MODEL` | the sampler, once you've wired both checkpoints in (see below) |
| `prompt` | `STRING` | the `prompt` input on **Image to Video**, **Reference to Video**, or **RefMod Text Encode** |
| `references` | `H3_REFS` | a **Reference Splitter**, whose slots feed **Reference to Video** — from the original pack, if you have it installed too |
| `first_frame` | `IMAGE` | `first_frame` on **Image to Video** |
| `last_frame` | `IMAGE` | `last_frame` on **Image to Video** |
| `ref2va_needed` | `BOOLEAN` | a switch node, to pick which H3 node runs |
| `mods` | `H3_REF_MODS` | whatever was wired into this node's own `mods` input, passed straight through — usually **RefMod Text Encode**'s `mods` input, wired for you by **◈ RefMods** |

`ref2va_needed` is true only in **Reference** mode — the one mode whose prompt
goes to **Reference to Video** instead of **Image to Video**. Feed it to a
boolean switch and the mode you pick in the editor chooses the branch, instead
of you rewiring by hand. If the editor state is ever unreadable it falls back
to reference mode, same as the media gate does.

`first_frame` and `last_frame` are named after exactly what they wire into —
**Image to Video**'s own two picture inputs — so no splitter and no separate
**Load Image** is needed for the keyframe modes:

| Mode | Wire |
|---|---|
| **I2VA** | panel's picture → `first_frame` |
| **L2VA** | panel's picture → `last_frame` |
| **FL2VA** | panel's two pictures → `first_frame` and `last_frame` |

Reference media comes from the node's own panel rather than upstream slots, so
the keyframe and reference media you load are picked up directly. The
`references` bundle and both picture outputs are **mode-gated**: T2VA and
Reference mode leave all three empty, I2VA fills `first_frame` only, L2VA
fills `last_frame` only (its one loaded picture IS the last frame, not the
first), and FL2VA fills both — so switching mode never quietly sends media the
mode can't use. Anything withheld is printed to the console, never dropped
silently.

Two optional inputs, `fl2va_model` and `ref2va_model`, take both H3 checkpoints
at once; the `model` output passes through whichever one the saved mode
actually runs on (`ref2va` in Reference mode, `fl2va` everywhere else). Both
are lazy, so the checkpoint the mode isn't using is never pulled into memory —
wire both in once and let the mode decide, instead of rewiring the sampler by
hand every time you switch modes.

A third optional input, `mods`, takes a [RefMod](#refmods) bundle — usually
from **◈ RefMods** in the prompt editor, which finds or creates the stack and
wires this input for you — and passes it straight through to the node's own
`mods` output for **RefMod Text Encode**. Not lazy: unlike the checkpoints,
reading it costs nothing beyond the stack's own already-cheap parse.

The node carries no buttons — everything is reachable from the panel itself.
The media panel sits at the top; drag the node's bottom edge and it grows with
you, so you can give the thumbnails as much room as the canvas allows. Below
it, a prompt bar shows two lines of the current prompt and the mode as a
button on the right — click the bar to quick-edit the main text fields in
place, click the mode button for a dropdown of all five modes without opening
the full editor, or double-click the node (or click the 📜 icon in the bar) to
open the full editor. In T2VA, where there's no reference media to show, the
bar expands in place to the same three quick-edit fields instead of staying
collapsed. Hover the bar for the reference count, duration, and any warnings,
and the mode button turns red when you're over a limit.

---

## Quick start

This is the same for every mode.

1. Add a **MiniMax H3 Prompt Studio**.
2. Drop your keyframe or reference media onto the panel, if your mode needs
   any (T2VA needs none).
3. Click the prompt bar (or double-click the node) to open the editor, pick
   your mode along the top, and fill in the fields. The finished prompt builds
   live in the right-hand panel.
4. Click **Save to node**.
5. Connect the node's `prompt` output to the `prompt` input on whichever H3
   node you're using:
   - **MiniMax H3 Image to Video** for T2VA, I2VA, FL2VA, and L2VA
   - **MiniMax H3 Reference to Video** for reference mode

   If `prompt` shows as a widget rather than an input, right-click it and choose
   *Convert widget to input*.
6. Set `width`, `height`, and `length` on that node. For first/last-frame modes
   the editor shows the exact frame count to use — H3 only accepts certain
   values, and the editor already rounds to a valid one.
7. Wire up whatever your mode needs:
   - **T2VA** — nothing else; the prompt is the whole input.
   - **I2VA / FL2VA / L2VA** — connect the node's own `first_frame` (and
     `last_frame` for FL2VA/L2VA) outputs to **Image to Video**:
     - **I2VA** — `first_frame` → `first_frame`
     - **FL2VA** — `first_frame` → `first_frame`, `last_frame` → `last_frame`
     - **L2VA** — `last_frame` → `last_frame`
   - **Reference mode** — see [Reference mode](#reference-mode) below.
8. Queue it.

The rest of the workflow — loaders, samplers, VAE decode, save — is unchanged
from ComfyUI's built-in MiniMax H3 templates. This pack only replaces how the
prompt gets written.

---

## Writing a prompt

Click the prompt bar to open the editor, then pick a mode along the top:

| Mode | You give it | Good for |
|---|---|---|
| **T2VA** | Just text | Building a scene from scratch |
| **I2VA** | A first frame | Animating forward from an image |
| **FL2VA** | First and last frames | Getting from A to B |
| **L2VA** | A last frame | Working backwards to a known ending |
| **Reference** | Any mix of images, video, audio | Locking a character, style, voice, or motion |

The editor fills in the fixed boilerplate — instruction lines, timing values,
section headers — so you write the actual description and it assembles a
correctly formatted prompt underneath. The right-hand panel shows the finished
prompt live as you type.

**Things the toolbar does for you:** inserts numbered shots with correctly
formatted cut times, writes camera moves as proper sentences, wraps dialogue
with the right language tags and speaker IDs, and drops in reference tags.

**Things it checks:** shots numbered in order, cut times increasing and inside
your video's length, `[Shot 1]` not carrying a timestamp, dialogue tags balanced
and labelled, references you connected but never mentioned, and — in reference
mode — every subject having a matching retention entry.

Amber warnings are advisory and the prompt saves regardless. Red errors are the
ones worth fixing before you render.

**Clear** in the header empties every field and starts a new prompt in the same
mode. It asks first, and the node keeps whatever prompt it already has until you
save — so clearing is only permanent once you press **Save to node**.

![I2VA editor layout](docs/4.png)

*I2VA layout — only the input Picture 1 can be used in I2VA mode. Other media is
disabled. You can rearrange which image is used as Picture 1 in the panel:
click and drag the ☰ icon. Alternatively, media can be disabled and
enabled by clicking the green dial, which automatically reorders the media
passed to the processing node. NOTE: changing order or disabling media changes
its label for the prompt — it does **not** automatically update your prompt.*

---

## Prompt library

Click **☰ Library** in the editor header to browse everything you've saved.

**Save current prompt** stores what's in the editor under a name, with an
optional category. Saved prompts keep the *editor state*, not just the finished
text — so loading one puts every field back exactly as you left it, ready to
edit. Nothing is re-parsed, so nothing can be misread on the way back in.

In the library you can:

- **Search** by name, category, mode, or the prompt text itself.
- **Filter by category** — type any category name when saving and it becomes
  available in the dropdown.
- **Manage categories** — pick one in the dropdown and click ✎ to rename it
  across every prompt in it, or clear it so those prompts become uncategorised.
  The prompts themselves are never deleted.
- **Recategorise a single prompt** — click its category chip (or `+ category` on
  one without) and set a new one.
- **Star favourites**, which sort to the top of the list.
- **Load** a prompt, replacing what's in the editor (it asks first if you'd be
  overwriting something).
- **Delete** entries you don't need.

Each row shows the mode it was written for, its category, how long ago it was
saved, and the opening of the prompt.

Saving again under the same name updates the entry in place. Saving under a
**different** name after loading one is your call, made explicitly: **Save as
new** (the default, also what Enter does) keeps the original and adds a second
prompt, while **Rename "…"** carries the loaded prompt over to the new name and
keeps no second copy. Earlier versions treated every changed name as a rename,
which silently deleted the prompt you'd loaded — that is what made saved
prompts go missing. If a new save collides with a name that already exists,
nothing is overwritten until you confirm it inline.

Prompts live as individual JSON files in your ComfyUI user directory, so they
survive updates and are easy to back up or share. Writes go through a temporary
file, so a crash mid-save can't corrupt an entry.

The editor's **❐ Media Loader** button opens the node's own media panel in an
overlay on top of the editor — the same panel the node hosts, so everything
works the same way. Escape closes the loader and leaves the editor open.
Reference tags refresh when you close it, so adding or reordering media
renumbers `<Picture N>` immediately.

In draft mode that button opens the **draft's own** reference set instead,
marked teal like the rest of draft mode. Editing it never touches the node's
Live media: the draft keeps its own until you commit. Which set you are
editing is decided by where you clicked — the panel on the node itself is
always Live, and ❐ Media Loader while drafting is always the draft.

### Linking a prompt to its media

A prompt is usually written for a particular set of references, so the save
form offers to remember which. What it offers depends on your current media:

- **Linked to media — *name*** — your media is already saved as that preset,
  so ticking the box is all it takes.
- **Link to media — new preset** — your media isn't saved as a preset yet.
  Tick the box, give it a name, and it's saved and linked in one go.

The match is decided by comparing the media itself, not by the label on the
preset picker: that label survives every edit short of **Unload media**, so it
can name a preset your media stopped matching a while ago. When it has, the
picker now shows it as *name (edited)*.

Linked prompts carry a badge in the library showing what the preset holds —
a small icon and count per kind, then the preset name — counted live from the preset itself, so it stays
right even if you edit the preset afterwards, so you can
tell at a glance which prompts bring media with them. Hover it for a preview
of what's in that preset — thumbnails, a count by kind, and a note if any of
its files have gone missing.

Loading a linked prompt never changes your media silently. A strip appears
naming the preset, how many references it holds and how many it would
replace, with **Load the media too** or **Prompt only**. If the preset has
been edited since it was linked, the strip warns you — reference numbers are
positional, so `<Picture 3>` in the prompt may no longer mean the picture it
did when you wrote it. A preset that has since been deleted doesn't block the
prompt; you're just told it's gone.

In draft mode the media goes to the draft's own set, never to the Media
Loader node.

---

## Draft mode

Queue some generations, then start on your *next* prompt without touching the
one that's running: the **Draft ▶** button in the editor header switches to a
scratchpad. The modal turns teal, the fields cool, and a banner states the
deal plainly — the node still holds the Live prompt, and nothing in the draft
is queued or executed until you commit it.

The draft autosaves to disk as you type (its own file, in its own directory —
it can never appear in, or interfere with, your prompt library or presets), so
a browser crash costs at most a second or two. Closing the editor from draft
mode reopens it in draft mode. Your Live session edits are held while you
draft and restored when you switch back — nothing is written to the node by
switching.

A draft's media is in one of three states, and the banner always says which:

- **Following the node's media** — the usual case. The draft shows whatever
  the Media Loader holds.
- **Showing media as of when the draft started** — if the loader held
  references when you began, the draft remembers them so its `<Picture N>`
  tags keep meaning the same files. Reference numbers are positional, so
  without this, rearranging the loader would silently retarget the tags in
  your draft. This is display only.
- **Has its own media** — you edited the draft's reference set through
  ❐ Media Loader. Only this state is applied to the node when you commit.

The distinction matters: a draft you never edited media in will never change
the node's media on commit, so improving your Live references while a draft
sits open is safe.

RefMods get the same treatment. A draft remembers the stack's picks as of
when it started, so its `<Video N>` labels keep meaning the same files while
you rework the Live stack; **◈ RefMods** in draft mode opens the stack panel
on the draft's own copy of the picks (with the library and Create a click
away as usual), and only a set you edited that way is written to the RefMod
Stack when you commit. The banner says which state the draft's RefMods are
in, just as it does for media.

Because a draft's media is the one thing that can reach the Media Loader
without having been uploaded through it, it's checked when the draft loads.
Anything unusable — a missing file, an unrecognised type — is discarded, and
the banner says how many, rather than letting a broken reference through to a
generation. Unrecognised fields are left alone, so a draft written by a newer
version isn't damaged by an older one.

**Save to node** is greyed out while you're drafting — nothing in a draft can
reach the node except through Commit — and the ⚙ menu's other controls carry
on working as usual.

**⇣ Pull from Live** copies the Live prompt into the draft, which saves
re-typing a cast you've already written. It offers two scopes: *Cast and
setup only* keeps the mode, duration, subject definitions, style and
retention markers but leaves the description fields empty — the shape of
writing the next shot in a scene — while *Everything* is a straight copy for
working up a variant. Live is not changed either way.

**Commit to Live** overwrites the node's prompt with the draft and applies the
draft's media snapshot to the loader. If the Live prompt has work that isn't
in the library, you're offered the chance to save it there first — inline,
with the same collision protection as any library save. Committing consumes
the draft. **Clear draft** throws the scratchpad away and starts a blank one.

The draft banner stays pinned above the editor body rather than scrolling with
the fields, so it still answers "am I editing Live?" when you're deep in the
description. The ⚙ menu shows how many drafts exist across all your workflows
and can discard them all at once.

You can also save a draft straight to the library at any point without
committing it — the banner then tracks whether the draft still matches what
you saved. Drafts are per prompt-builder node, capped at the 25 most recently
touched across all workflows; older ones age out on their own.

---

## Reference mode

Reference mode is the one that takes media — images, video, and audio you want
the model to draw a character, style, voice, or motion from. It uses **MiniMax
H3 Reference to Video** and the `ref2va` checkpoint.

### The short version

1. Drop your reference files onto Prompt Studio's own panel, or click
   **Load files…**. Images, video, and audio can all go in at once — each
   lands in the right group.
2. Open the editor and switch to **Reference** mode. Your media now shows up
   as clickable thumbnails; click one to insert its tag into your text.
3. Fill in the six sections, then **Save to node**.
4. Connect the node's `prompt` output to **MiniMax H3 Reference to Video**'s
   `prompt` input.
5. `references` carries the whole gated bundle, but **Reference to Video**
   wants individual `ref_image_N` / `ref_video_N` / etc. slots — so it needs a
   **Reference Splitter** in between. This pack doesn't include one; install
   [the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
   alongside this one, add its **Fantastic H3 Reference Splitter**, and wire
   `references` → the splitter → the matching slots on **Reference to Video**.

### What the media panel shows you

Every reference gets a tag like `<Picture 1>` or `<Audio 2>`, and your prompt
refers to media by those tags. The numbering isn't simply "which slot did I plug
this into" — see [How do tags get their
numbers?](#how-do-tags-get-their-numbers) — so the loader displays the exact tag
order along the bottom of the node, and the editor labels each thumbnail with
the tag it will actually get.

The ✂ button on any video or audio row trims what's sent to a start–end range
in seconds — the file itself is untouched, and the counters and 15-second
budgets track the trimmed span. `last 2s` / `last 3s` shortcuts grab a clip's
tail in one click, which is exactly what video continuation wants. Over-long
clips can be brought inside the budget the same way instead of re-exporting.

Videos that carry sound get an extra control for whether that soundtrack is
treated as part of the video or as a separate audio reference. The **?** button
by the videos heading explains the choice, and there's a
[summary in the FAQ](#what-do-off--paired--alone-do).

### Video size and memory

Reference video is decoded to raw float frames, so memory is
`width x height x 3 x 4 bytes x frames` — a 15-second 1080p clip is about 9 GB,
and three of those will hurt.

**Nothing is resized unless you ask.** A clip is decoded at its own resolution
until you set a **size** in its ✂ editor, which caps the long edge while
decoding so full-size frames are never built:

| Cap on a 15s 1080p clip | Memory |
|---|---|
| full *(default)* | ~9.0 GB |
| 1280 px | ~4.0 GB |
| 1024 px | ~2.5 GB |
| 832 px | ~1.7 GB |

It costs less quality than you'd expect, because the native H3 node rescales
every reference to your generation's pixel area regardless — feeding it 1080p
while generating at 832x480 spends the memory and then throws the detail away.
Clips already smaller than the cap are left alone.

Two cases where you should leave it at full: a video used as a **motion-context
continuation source**, and any clip whose framing you're matching closely —
both want to be at least as large as your generation.

Trimming helps too, and multiplies with this: size and duration are
independent factors.

### Picture roles

Start a definition line with `<Picture N>` and role chips appear under it, the
same way audio lines work. Each one writes the definition, sets the matching
retention marker and context, and adds the right summary task type:

| Chip | Marker | Task type |
|---|---|---|
| First frame | `fully_preserved` | keyframe completion |
| Last frame | `fully_preserved` | keyframe completion |
| Composition | `weak_reference` | reference generation |
| Look / style | `weak_reference` | reference generation |
| Setting | `partially_preserved` | reference generation |
| Attribute → subject | `attribute_transfer` | reference generation |
| Storyboard | `weak_reference` | reference generation |

There's deliberately no "identity" chip: a picture that simply shows what a
character looks like belongs cited *inside* that subject's line
(`<Subject 1> is the woman in <Picture 1>, with ...`), not as a standalone
`<Picture N>` definition. Standalone picture lines are for pictures playing a
role in their own right.

Note that `attribute transfer` is a retention marker, not a task type — the
chip sets `attribute_transfer` on the retention row while the summary stays
`reference generation`.

### Phrases

Bits of wording you write over and over — a house style line, a camera move you
like, a soundscape you always start from — can be saved once and inserted with
a click. The **Phrases** row sits under the dialogue controls:

- **+ New** opens a small window to compose the phrase — prefilled if you had
  text selected, empty and ready to type if not — with a name and an optional
  category. Ctrl+Enter saves, Esc closes.
- **Right-click a selection** in any field for *Save selection as phrase…*,
  which opens the same window with the text already in it.
- The two dropdowns filter by category and pick the phrase; hovering the
  phrase picker shows the whole wording, since the list only has room for the
  name.
- **+ Phrase** drops it in at the caret, on the same line — line breaks in a
  saved phrase are flattened, because the model reads them as shot cuts.
- **Delete** removes the selected one.

Phrases are stored with ComfyUI rather than in the workflow, so they follow the
install and are shared by every prompt you write. They're plain text — for
saving a whole prompt, use the [prompt library](#prompt-library) instead.

### Switching lines off

Every line in `subject_definitions` and every row in `retention_analysis` has
its own ◉ switch. Click it and the line greys out and **drops out of the
generated prompt**, while staying exactly where it is in the editor.

That's for the in-between moments: you pull a reference out of the loader to
try something, and the lines describing it would now be pointing at media
that isn't there. Switch those two lines off, run the test, switch them back
on — no deleting and retyping.

The checks follow suit: a switched-off definition doesn't count as defined, so
you won't be told a subject is missing its retention entry when both of its
lines are off together.

Whole sections have the same switch on their heading — `subject_definitions`,
`retention_analysis`, `overall_soundscape` and `non_diegetic_music` — for when
you want the lot gone at once. `summary` and the description can't be switched
off; without them there's no prompt.

All of it saves with the workflow and with prompt presets.

### Trimming and cropping clips

The ✂ button on any video or audio row opens a popout editor. **The file on
disk is never modified** — everything is applied when the clip is decoded, so
the same file can be treated differently in another workflow, and Reset gives
you the whole clip back.

Video previews play with sound (🔊 mutes them), so you can trim on what you
hear as well as what you see. For both video and audio you get a timeline:
**click or drag anywhere on the bar to scrub** the preview, and drag the two blue handles to set what's kept —
clicking the bar never moves them. The preview follows whichever handle you're
dragging, so you can find a cut by eye. An amber playhead shows where the preview is, with its exact time
below the bar; if you scrub outside the kept range it turns red and says so, so
a frame you're looking at is never quietly excluded from the output. **◀| |▶** step a frame; **⇤ start** and **end ⇥** snap the range
to wherever the playhead sits — scrub to a cut, then click. **⏮ First** and
**Last ⏭** jump the playhead to the clip's own first or last frame, which pairs
with 📷 for grabbing a continuation frame. Or use the
keyboard:

| Key | Does |
|---|---|
| ← → | Step one frame (hold shift for ten) |
| space | Play / pause the selected span |
| `[` `]` | Set start / end to where the playhead is |
| home / end | Jump to the start / end of the selection |
| M | Mute / unmute the preview |
| A | Save the kept range as an audio reference |
| C | Capture the current frame (video only) |
| esc | Close without applying |

 Audio shows its waveform under the ruler. Play loops just the
selected span, and the readout warns when the kept span drops under the model's
2-second minimum.

Video also gets **📷 Use frame**, which grabs the frame currently shown in the
preview, saves it into ComfyUI's input folder, and adds it to the node as a
picture reference. That's the easy way to continue from a clip's ending: scrub
to the frame you want (the very last frame is often the blurriest, so pick a
good one a little earlier), capture it, and wire that picture to `first_frame`
on **MiniMax H3 Image to Video** in I2VA mode. If a crop is active the still is
cropped to match.

If all 12 references are already in use, the frame is still captured — it just
arrives **switched off**, with a message saying so. Free a slot (a video's
soundtrack counts as one, so setting it to `off` is often the easiest) and
switch the picture on with ◉. Capture is only refused outright when all nine
picture slots are taken, since there'd be nowhere to put it.

**🎵 Use audio** does the same for sound: it writes the kept range out as its
own WAV in ComfyUI's input folder and adds it as a standalone audio reference.
That's how you lift a voice sample out of a longer clip — trim to the sentence
you want, click, and it appears in the audio slots ready to define as
`<Audio N>`. It's offered for standalone audio too, so you can cut a long
recording down to a reference-sized piece without leaving ComfyUI. The
extraction runs server-side through the same decoder the loader uses, and is
refused if the audio slots are full or the range is under the 2-second
minimum.

![Capturing a frame in the trim editor](docs/7.png)

![The captured frame in the picture pool](docs/8.png)

*Capture the frame you're looking at, and it lands in the picture pool like any
other reference — tagged, taggable, and saved with presets.*

**Pictures get the same treatment.** The ▣ button on a picture tile opens the
editor with the rotate, crop and mirror tools — no timeline, since there's nothing
to trim. The **size** dropdown caps the long edge of what's actually sent. Videos have
the same control in their ✂ editor, where it matters more — a cap saves that
memory on *every frame*, so a 15-second clip capped at 1280 px costs a fraction
of the same clip at 4K. Both default to full — media is only resized when you
set a size. A 4K photo is
decoded and rescaled on *every* generation, which costs real time and memory —
and the native H3 node downsizes references to your generation's pixel area
anyway, so the detail is discarded regardless. Capping a 4K reference at
1280 px cuts its decoded tensor from about 100 MB to 11 MB. The reported size
updates live, and it never upscales: a picture already under the cap is left
alone.

The cap only affects what's decoded — the file in ComfyUI's input folder stays
full size, and every run pays to decode it. **⬇ Write copy** does the permanent
version: it writes a resized copy (with the current crop, rotation and mirror
baked in) into the input folder and points the reference at it, so the file, the
decode and the tensor all shrink. Your original file is left exactly as it was;
the copy is a new entry. A 4K PNG capped at 1280 px goes from about 25 MB to
2.4 MB.

One exception worth respecting: a picture used as `first_frame` or `last_frame`
should stay **at least as large as your generation**, or the model will be
upscaling it back and you'll see the softness.

**↻ Rotate** turns the picture 90° clockwise per click (shift-click goes
anticlockwise), for phone photos that came in sideways. The crop rect turns
with the picture, so a region you framed stays on the same part of the image,
and the reported size swaps to match. Back on the tile, the kept region is
outlined and everything outside
it is dimmed, so you can see what was dropped as well as what's left, and the
corner badge switches to the **cropped** pixel size and ratio. Mirrored
pictures show flipped. Crop a subject out of a wider shot, or flip a reference, without
touching the file: the rect is stored on the item and applied when the image is
decoded, and PIL crops before the float conversion, so a small crop of a huge
photo costs a fraction of the memory the whole frame would.

Video also gets **⇄ Mirror**, which flips the clip left-to-right before it's
sent. The preview flips with it, and so does the row thumbnail, so you always
see what the model will get. Worth knowing what mirroring does to a reference:
any text in frame becomes reversed, and asymmetric details swap sides — a
parting, a scar, which hand holds something, which way a subject faces. That
makes it useful for getting a pose or composition facing the other way, and a
poor idea for identity references you're keeping consistent across a chain,
where the flipped side-details will fight your unmirrored ones.

Video additionally gets **▣ Crop**: drag a rectangle (with rule-of-thirds
guides) to send only part of the frame freeform or locked to 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9 or 9:21, with the resulting pixel size shown live. Once set, the rectangle stays on
the preview with everything outside it dimmed, so the framing is always visible;
pressing ▣ again just puts the handles away. Handy for cutting a subject
out of wider footage instead of re-exporting.

Two things it's for:

- **Getting inside the budget.** A 40-second song or a long take doesn't need
  re-exporting; trim it to the seconds you want. The file counter, the ♪ audio
  counter, and the 2–15s and 15s-total checks all measure the *trimmed* span.
- **Continuing a video.** `2s⇥` and `3s⇥` set the trim to the clip's final
  seconds in one click, which is exactly what a continuation reference wants —
  the motion and audio leading into the new clip, without spending your whole
  budget on footage the model doesn't need.

The scissors glow amber when a trim is active, and the trim travels with media
presets and with saved workflows.

One wrinkle worth knowing: a trim applies to the *item*, so trimming a video
trims its frames and its paired soundtrack together. To keep the full video but
only a few seconds of its audio, set the video's audio to `off` and load the
audio separately, then trim that copy.

You can also skip the panel entirely and wire your own loaders straight into
the native H3 node — the [FAQ](#do-i-have-to-use-the-media-loader) covers your
options.

![Reference mode editor layout](docs/5.png)

*Reference mode — all six sections, with every connected reference available to
cite.*

### Presets

The panel can save your current set of references — which files, their
order, and each video's audio setting — under a name, and reload it later from
the preset picker.

The picker is the pack's own dropdown rather than a native `<select>`: the
native one sat inside the node's widget area, which the ComfyUI frontend
repositions on every canvas redraw, and any touch collapses an open native
picker — the "dropdown flashes and closes" bug. The pack's popover can only be
closed by you: pick an entry, click elsewhere, or press Escape.

The preset label, dropdown and Save / Delete buttons sit in the panel's top
row, next to **Load files…**.

Presets can be filed into **categories**. The picker has the same bar the
prompt library does — a search box, a category dropdown, and a ✎ to rename or
clear the selected category — above a list grouped by category, with
uncategorised sets last. Set a category when you save, or file an existing
preset from the picker with the ✎ on its row; that only changes the label,
never the media. Categories are a view, not folders: preset
names stay unique across the whole set, because a prompt links to a preset by
name.

Presets point at files you already uploaded rather than copying them, so saving
and loading is instant. If you later delete one of those files, loading the
preset skips it and tells you which one is missing. Deleting a preset never
deletes your media.

### The reference rail

The strip of thumbnails at the top of the editor wraps onto further rows rather
than scrolling sideways, so every reference stays visible and reachable. Click
one to insert its tag, or drag it into a text field to drop the tag where it
lands.

Each card carries the same two controls as the node's own tiles: **▣** / **✂**
opens the crop and trim editor, and **◉** switches the reference off without
removing it. Drag one card onto another to reorder your media — the tag numbers
renumber to match, exactly as they do on the node. Both act on the node's real
media, so the editor and the node never disagree.

### Keeping a reference in view while you write

Reference tags in the text are chips: hover one and its thumbnail opens right
there, so you can check a reference without leaving the line you're on. That
replaces the old pinned-references pane, which took a column out of the editor
and pushed every field sideways.

### Copying media between slots

Right-click any slot for **Copy**, **Duplicate**, **Paste**, **Switch on/off**
and **Remove**. Copy puts the reference on a clipboard shared by every loader
on the page, so you can paste it into a different node — useful for sending one
picture through two graphs with different crops.

A pasted reference is a *new entry pointing at the same uploaded file*, so
nothing is re-sent to the server, and per-item settings (crop, rotate, resize,
trim, audio routing) come across with it. Because they are per-item, you can
then change one without touching the other. Pasting obeys the same limits as
loading: a full slot type refuses with a message, and a pasted video whose
soundtrack won't fit the audio budget arrives with its audio switched off
rather than silently going over.

You can also hover the panel and press **Ctrl+V** to paste an image straight
from the system clipboard — a screenshot, say — which uploads it as a new
picture.

---

## FAQ: wiring reference media

This is the fiddly part, so here's the whole picture.

### Do I have to use the Media Loader?

No. There are three ways to get media in:

1. **Prompt Studio's own panel.** No cable at all — the panel is on the node
   that writes the prompt. See [Prompt Studio](#prompt-studio).
2. **Straight to the native node.** Skip this pack's media handling entirely and
   wire your loaders directly into **MiniMax H3 Reference to Video**. You still
   get a well-formed prompt; you just won't get thumbnails in the editor.
3. **The original pack's Media Loader → Prompt Builder,** if you install
   [that pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
   alongside this one. Its Prompt Builder is a separate node with its own
   editor, unrelated to Prompt Studio.

Prompt Studio itself has no media inputs to wire — option 1 is entirely
self-contained.

### Which output goes where?

Prompt Studio has a `prompt` output, a gated `references` bundle, and
`first_frame` / `last_frame` for the keyframe modes (see
[Prompt Studio](#prompt-studio) for the full table). `references` isn't split
into individual slots on its own — see the next question.

### Then what's the Reference Splitter for?

**MiniMax H3 Reference to Video** wants individual `ref_image_N` /
`ref_video_N` / `ref_video_audio_N` / `ref_audio_N` inputs, not one bundle. A
Reference Splitter fans `references` out into those slots. This pack doesn't
include one — install
[the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
alongside this one, add its **Fantastic H3 Reference Splitter**, and wire
Prompt Studio's `references` output into it. It's the one part of a full
Reference-mode workflow this pack can't finish on its own.

### How do tags get their numbers?

This is the one that trips people up, so it's worth reading.

H3 numbers references **by the order they arrive**, not by which slot they're
plugged into. Two consequences:

- **Gaps close up.** If you only fill `picture_2` and `picture_5`, they become
  `<Picture 1>` and `<Picture 2>`.
- **A video's soundtrack takes a low audio number.** It's presented right before
  its own video, so with one video (with sound) plus one standalone audio clip,
  the soundtrack is `<Audio 1>` and the standalone clip is `<Audio 2>` — even
  though the standalone one might feel like it should come first.

You don't have to work this out yourself. The panel shows the exact tag
order along the bottom of the node, and the editor's thumbnails are labelled
with the tag each one will actually get. Trust those over intuition.

### Why is a video's audio a separate thing at all?

ComfyUI has no single "video with sound" type, so frames and audio travel on
separate wires. The panel splits it for you automatically when you drop
in a video file. If you're wiring your own loaders, you'll need one that gives
you frames and audio separately.

The model treats them as one thing internally — the separation is just plumbing.

### What do off / paired / alone do?

That's the little control on a video row when the file has sound. There's a **?**
button next to the videos heading that explains it in the node, but in short:

- **paired** — the sound belongs to this footage. Use it for on-screen dialogue
  where lip sync matters, action sounds that need to land on the right frames,
  or when you're keeping a source video's original audio.
- **alone** — you want the audio as a *reference* rather than as this clip's
  soundtrack: borrowing a voice, a music style, some ambience. Also the right
  pick when you're not reusing the video's visuals in sync.
- **off** — ignore the audio entirely.

### Why does one video count as two files?

H3 takes at most 12 references in total, and a video's split-off soundtrack is
its own reference. So a video with `paired` or `alone` audio uses two of your
twelve. Set it to `off` and you get one back.

It also spends part of a second budget: H3 accepts **three audio clips**, and a
split soundtrack is one of them even though it travels in a different input
group on the native node. Three videos with their sound enabled therefore use
your whole audio allowance. The loader shows both counters — files and ♪ audio —
and warns when either is exceeded.

Reference clips should also run 2–15 seconds each, and — this is the one people
miss — **15 seconds is the total across all clips of a type, not a per-clip
allowance**. Three 15-second audio clips is 45 seconds and three times over
budget; three clips only fit if they average about five seconds each. A split
soundtrack spends from both totals at once: a 12-second video with its audio on
uses 12 of your 15 video seconds *and* 12 of your 15 audio seconds, leaving 3
seconds of audio for anything else.

Audio also can't be sent without at least one image or video alongside it.

The loader flags all of these, and the ✂ trim is usually the fix — see
[Trimming and cropping clips](#trimming-and-cropping-clips).

Go over twelve and you get a red warning. The node deliberately won't drop
anything for you — removing a reference renumbers every tag after it, which
would quietly invalidate tags already written into your prompt.

### Does switching mode change what gets sent?

Yes — the saved mode decides what the outputs carry, so cables can stay
plugged in permanently. Keep `first_frame` wired to `first_frame`, and a
prompt saved in T2VA mode sends nothing but the prompt; switch the editor to
I2VA and Save, and the picture flows again. What each mode sends is written
right under the mode buttons in the editor, unusable media is greyed out in
the rail, and
the console prints exactly what was withheld on each run — so a gated
reference is visible three ways before a render finishes.

Mode and prompt are saved together by the editor's **Save**, so they can never
disagree with each other. If the node's state is missing or unreadable, the
gate fails open and passes everything rather than silently withholding.

For per-item control within a mode, the ◉ toggle on the panel switches
one reference off without unplugging anything.

### One loader, two pipelines

An example workflow using this pattern ships with the pack — load
**MMH3PromptBuilder_AIO_Example** from ComfyUI's workflow browser (Workflows →
Browse Templates → this pack), or open
`example_workflows/MMH3PromptBuilder_AIO_Example.json` directly. It needs
[VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) for
the video output and
[KJNodes](https://github.com/kijai/ComfyUI-KJNodes) for the Set/Get nodes.

**This example predates Prompt Studio** and is still built on the standalone
Prompt Builder, Media Loader, and two Reference Splitters, so it needs
[the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
installed alongside this one to load at all. It's kept as a reference for the
Set/Get fan-out pattern described below; a Prompt-Studio-only rebuild of it is
on the list but isn't done yet.

The example is set up for a 4-step turbo LoRA, with **Sigma Shift at 12 video /
6 audio**. That audio value is deliberate: the released base configuration is
12/3, but distilled turbo LoRAs compress the video trajectory, and since the
audio schedule is derived from the video one, 6 keeps audio aligned at low step
counts. Running the base FL2VA model without a turbo LoRA? Put it back to 3.

The builder also has a **references** output (last slot): the same bundle it
received, gated to the saved mode, ready for a **Reference Splitter**. That
makes a single Media Loader + Prompt Builder able to drive both an fl2va
pipeline and a ref2va pipeline — wire the builder's `references` through a
Set/Get pair into each pipeline's own splitter, keep one pipeline bypassed,
and the saved mode decides what media flows: switch to FL2VA and Save, and the
ref2va side's splitter receives only pictures 1–2; switch to REF and the full
set flows again. Gating lives in one place — the builder — no matter how many
pipelines fan out from it. Prompt Studio's own `references` output works the
same way if you want to build this pattern around it instead.

### Can I wire every output once and leave it?

Yes — that's the intended way to work. Connect Prompt Studio's outputs to the
matching slots once (via a Reference Splitter for `references`, see
[above](#then-whats-the-reference-splitter-for)), and leave the workflow alone.

Slots with nothing in them pass through empty, and the H3 node skips them. The
tags close up around whatever is actually present, so three images in slots 1, 2
and 3 are `<Picture 1>`–`<Picture 3>` whether or not the other six are wired.

That pairs with the ◉ toggle on the panel: rather than unplugging cables
between runs, switch an item off and it stops reaching the model — the tag
numbering adjusts, and the editor's checks update to match.

### What if I connect an image but never mention it in the prompt?

Nothing errors, but it does affect the result. The image is still handed to the
model, labelled, and taken into account — you've just given it no instructions
about what to do with it. It can bleed into the output in ways you didn't ask
for, and it costs render time and VRAM on every step.

The editor flags this: a reference thumbnail showing an amber dash instead of a
count hasn't been mentioned yet. Either write it into your description or
disconnect it.

### Where do first and last frames go for the non-reference modes?

Keyframes work differently from references. In I2VA, FL2VA, and L2VA your images
are exact frames of the finished video, so they go to the `first_frame` and
`last_frame` inputs on **MiniMax H3 Image to Video** — not to the `ref_images`
slots, which exist only on the reference node and mean "here's something to draw
from", not "here's a frame".

Load your keyframes onto Prompt Studio's own panel and its `first_frame` /
`last_frame` outputs already carry them — no separate **Load Image** node or
extra wiring needed. See [Quick start](#quick-start) for the wiring.

These modes take one image each, except FL2VA which takes two. Wire in more and
the editor tells you exactly which ones will be ignored.

### My video length and the prompt disagree

For first/last-frame modes the prompt states when the last frame lands, so it
has to match the length you're actually generating. The editor shows the correct
frame count for your chosen end time — put that number into the native node's
`length`. H3 only accepts certain frame counts, and the editor already rounds to
a valid one.

---

## RefMods

> **New to RefMods? Start with the [RefMods how-to guide](REFMODS.md).** It
> walks through making, saving, editing and using them step by step. This
> section is the detailed reference.

RefMods are saved reference files for H3: a character's look, a voice, a
place or a style, compressed once into a small latent and reused without
re-encoding the source media. The format comes from
[ComfyUI-MiniMaxH3Mod](https://github.com/Luisacaotica/ComfyUI-MiniMaxH3Mod)
(MIT), and this pack can make, keep and use them on its own: the nodes below
carry their own copy of that pack's runtime, credited in `refmod_core.py`
and `refmod_create.py`, and share its `H3_REF_MODS` bundle type, so the two
mix freely in one graph — our stack into its Step Curve or Inspect, its
loaders into our Text Encode.

### The library

**MiniMax H3 RefMod Stack** holds every pick in one node. **Browse
library…** opens the library: a thumbnail grid of everything under your
`refmods` folders (including any mapped in `extra_model_paths.yaml`), with
search, folders and a type filter. A card shows the file's token cost
before you add it, and a look-and-voice pair saved as two files —
`hero_visual` + `hero_audio`, or the H3RefMods fork's `hero_Video` +
`hero_Audio` — appears as one card and one row. Click a card for its
details, where you can rename it, move it to another folder, edit its
description and concept, replace its preview image, or delete it. A
preview is any `.png`, `.jpg` or `.webp` saved beside the file with the
same name.

The details panel also has **Show what's stored**. A RefMod holds a latent,
not a picture, so this runs it back through the H3 VAE (through the queue,
like Create) and shows what the model is actually given: each stored frame
as a thumbnail — right for a stack of photos — or the frames played as a
clip, and the voice as an audio player. The **Strength** slider previews
the softening a weight below 1 applies, so you can see what 0.5 really
looks like. **MiniMax H3 Inspect RefMod** does the same in a graph.

**Edit frames & voice…** in the details panel pulls a RefMod back into
the Create tab. Its stored frames are listed first as sources — untick or
remove the ones you don't want, drag to reorder, and drop new pictures or
clips in to add them; they're encoded to the file's own size and style and
the previews show how each one is trimmed or squeezed to fit. Frames you
keep are copied exactly as they are, never decoded and re-encoded. The
voice is a source too: untick it to remove it, or add an audio file (or
tick a clip's soundtrack) to replace it — the first *Voice seconds* are
kept. **Save changes** writes the result through the queue and the library
reselects the file; tick **Save as a copy** and give it a name to leave the
original alone and write the result as a new RefMod (its voice and preview
come along). A RefMod that had no voice is renamed to the
`_visual`/`_audio` pair when one is added. **MiniMax H3 Edit RefMod** is
the node behind it, should you want it in a graph.

The **Create** tab makes new ones. Drop pictures, clips or audio anywhere
on the library, or pull the items from any Prompt Studio in the workflow
(the node's right-click menu has *RefMod library* for the same thing), so
a clip you have already trimmed and cropped goes in as it stands. By
default everything becomes **one RefMod**: six photos of a character are
stacked into a single reference, one frame per photo, and any voices —
audio files, or clips whose soundtrack you keep — are joined into one voice
saved beside it. Every photo in it takes the first one's shape (portrait,
landscape or square): in Full the others have their edges trimmed to fit,
in Compressed they are squeezed to fit. Each photo's preview shows exactly
what will be trimmed or how it will be squeezed, so drag your best-framed
one to the top. Rather than accept the automatic trim, click **Crop to
fit…** on any other photo: the crop editor opens locked to the first
photo's shape, and you drag the box over the part you want to keep. Every
row also has **Crop…** (or **Crop / trim…** for a clip) for rotating,
mirroring and trimming. These edits apply to the RefMod only; the node's
media panel keeps its own settings. A stacked RefMod is cited in prompts as one
video, like `<Video 1>`. Switch to **One
per source** to turn a batch of unrelated items into separate RefMods
instead.

A clip contributes its first `latent_frames` frames (after its trim in the
media panel), consecutive so the motion is real; H3's video VAE stores 2
frames for up to 17 and 5 more per further 17, so 22 frames store 7, 39
store 12, 56 store 17, and other counts are cut down to the nearest of
those. The setting's caption shows the result live.

Under the Create button the tab shows how many frames and tokens the
result will have. If that goes over the token limit, Create is blocked
until you raise the limit, lower the resolution, switch to Compressed or
leave some sources out — it never quietly drops photos to fit. Creation
runs through the queue like any workflow, so ComfyUI manages memory and you
can follow it in the queue panel, and the new card appears in the library
when it lands, with a preview image written beside the file.

**MiniMax H3 Create RefMod** is the node the library queues. It also
works by hand in a graph with IMAGE and AUDIO inputs, and its `source`
field takes a media-panel item, or a list of them to stack, as JSON. Not carried over from the
original pack: masks, multi-reference merging, motion-only mode and
presets.

**Full or Compressed?** Full keeps as much of your picture or clip as
possible, so faces, characters, products and text come through clearly,
but it makes generation slower. Compressed keeps the overall look (colours,
layout, shapes and style) and drops the fine detail, which makes it much
lighter; it suits settings, styles and moods, or using many references at
once. If you're not sure, make one of each and try them with the same
prompt.

### Weights and labels

Each stack row has a weight per channel. Up to 1 is plain strength. Above
1 adds copies: 2.7 sends two full copies and a third at 0.7, and the
readout next to the slider spells that out along with the token cost.
Switch a channel to **S × C** for several copies at the same reduced
strength. Rows can be switched off without removing them, and dragged to
reorder, which matters because order sets the label numbers. The footer
shows the bundle's total, an optional `max_total_tokens` limit that the
queue will enforce, and the labels the next node will assign.

To use RefMods, open **Edit prompt…** on Prompt Studio and click
**◈ RefMods** in the editor's header. It adds a RefMod Stack wired into the
node's `mods` input (or connects the stack already feeding your Text Encode),
and Prompt Studio passes the bundle on through its own `mods` output. Wire the
node's `prompt`, `mods` and `references` outputs into RefMod Text Encode — the
button does the `mods` and `references` halves itself when the Text Encode is
already there, and the editor warns when either bundle doesn't reach one. A
stack wired straight to the Text Encode still works: the node finds it by
following its `prompt` output. Loaded media and RefMods can be used together
this way; the editor numbers the media first, then the RefMods, matching Text
Encode.

**MiniMax H3 RefMod Text Encode** stands in for *MiniMax H3 Reference to
Video*. It takes the H3 CLIP, a prompt, the RefMod bundle on `mods`, and a
reference bundle on `references` — Prompt Studio's `references` output, or a
Media Loader's own — with the video VAE for pictures and clips
and the audio VAE for voices. It presents every reference to the model's own
encoder during tokenization, so the prompt can cite `<Picture n>`,
`<Video n>` and `<Audio n>`: loaded media is labelled first, the
RefMods after it, one counter per kind with every copy numbered, and the
map is reported on `reference_map`. Loaded media is sized as the native
node sizes it (`width`, `height`, `length` and `ref_image_size` are the
same settings); RefMods keep the size they were saved at. Connect its
conditioning straight to the sampler — it has already attached the
references — and its `latent` output is the empty AV latent to sample
from, so no separate Empty Latent node is needed. The editor shows the same
labels on its reference chips, media and RefMods together, groups a pick's
copies under its first label (citing `<Picture 1>` is enough when 1–3 are
the same file), and warns when the prompt cites a label the stack doesn't
send. The stack's `labels` output carries the same map as text, and its
optional `mods` input appends to another stack or loader, whose entries are
numbered first.

**MiniMax H3 RefMod Apply** appends the references to conditioning encoded
elsewhere, with a `retention` multiplier on every entry. The model sees them,
but the prompt cannot name them — use it when a workflow already has its
own text encoding.

Files from the H3RefMods fork's older "combined" format keep a voice inside
the visual file; they load with the visual half only and are marked
*embedded audio ignored* in the library. ComfyUI-MiniMaxH3Mod 0.2.6's
single-file **bundles** (format version 5, several references in one file)
are listed with a *bundle* badge and addressed as `name#index`; the first
look and first voice inside become the card's channels. They can be picked,
inspected, renamed, described and deleted here, but not edited — use that
pack's Save H3 RefMods node to split one into standalone files first.

---

## Dated output folders

Save nodes expand date tokens from their own widget, so a prefix like
`MiniMaxH3/%date:yyyy-MM-dd%/vid` only works when it's typed straight into the
save node. Route it through a string node, a switch, or anything else and the
token arrives verbatim — you get a folder literally named `%date:yyyy-MM-dd%`.
That's a known issue in VideoHelperSuite among others.

This pack doesn't include a fix for that — the original pack's **Fantastic H3
Filename Prefix** node builds a save prefix from parts and resolves the date
itself, so what reaches the save node is a plain string that survives any
amount of wiring. Install
[the original pack](https://github.com/Adudeguyman/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder)
alongside this one if you want it.

---

## Troubleshooting

### The media loader looks empty after opening a workflow

Fixed in 1.5.7. Earlier versions could overwrite the loaded media when the
node's hidden state widget wasn't readable yet — which happens while a
workflow is still loading, or when a node is detached as you switch tabs. The
panel treats an unreadable widget as "not ready" now and keeps what it has,
rather than reading it as "no media".

Your files are never touched by this; only the node's list of them was.

### The node appears but has no panel or buttons

The Python side registered fine — you can see `media_state` or `builder_state`
as a plain text widget — but the interface didn't build. That's the frontend
script failing, and almost always one of:

1. **A stale browser cache.** Python reloads on restart, JavaScript doesn't.
   Hard-refresh with Ctrl+Shift+R, or try an incognito window.
2. **Another extension throwing during load,** which can stop later ones
   registering. Open the browser console (F12) — the first red error usually
   names the culprit, and it often isn't this pack.
3. **A partial install.** `custom_nodes/<this pack>/web/` should contain
   `promptbuilder.js`, `medialoader.js`, `promptstudio.js`,
   `refmodstack.js` and `video-prompt-writing-guide.html`.

If this pack itself is the one failing, the node now shows a **⚠ UI failed**
button — click it for the error, and include that text in a bug report.

### Anything else

**The nodes don't appear.** ComfyUI needs a full restart, not a page refresh.
Check the startup console for errors mentioning MiniMaxH3.

**I updated but nothing changed.** ComfyUI caches extension files aggressively.
Open DevTools (F12), tick *Disable cache* in the Network tab, and reload with it
open. If a node's *outputs* look wrong specifically, that's a restart issue
rather than a browser one — and nodes already placed in a workflow keep their
old slots, so delete and re-add them after an update.

**Videos are rejected.** PyAV failed to import. ComfyUI core requires PyAV, so
this almost always means another pack downgraded or broke it (a known culprit:
`aiortc` pins `av<17`, which ComfyUI's own code can't run with).
`pip install 'av>=17'` into your ComfyUI environment restores it.

**A button does nothing.** Open the browser console (F12) and click it again —
any failure prints there. The panel's **❐** button opens the media panel in
its own window, independent of the on-node one, if that helps narrow it
down.

**Something looks squashed or overlapping.** This pack works with both the
classic node renderer and Nodes 2.0. If the on-node panel misbehaves in one of
them, double-clicking the node still opens the full editor, and **Open
loader…** still opens the media panel in its own window, regardless.

---

## Credits

Prompt structure follows MiniMax's official *Video Prompt Writing Guide*, which
ships with this pack — click 📖 in the editor to read it.

Built against ComfyUI's native MiniMax H3 support.

RefMods: the format and the encode/apply runtime are adapted from
[ComfyUI-MiniMaxH3Mod](https://github.com/Luisacaotica/ComfyUI-MiniMaxH3Mod)
by Luisa (luisacaotica), MIT License; the library's layout took cues from
FranckyB's [ComfyUI-H3RefMods](https://github.com/FranckyB/ComfyUI-H3RefMods).

## License

MIT

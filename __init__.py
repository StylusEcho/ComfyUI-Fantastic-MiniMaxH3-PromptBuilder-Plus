# One node. Prompt Studio is the whole pack; everything else it works with
# (RefMod Stack, Text Encode, Apply, Create/Inspect/Edit, Edit Composite,
# Video Edit Latent, Object Mask, Store Encoder Frames) comes from the
# original pack, installed alongside, whose nodes take Prompt Studio's
# `references` and `mods` outputs as they are.
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Registers the upload / library / mask routes when running inside ComfyUI.
# Import failures here must never take the node down with them.
try:
    from . import web_api  # noqa: F401
except Exception as exc:  # pragma: no cover
    print(f"[MiniMaxH3] media loader routes unavailable: {exc}")

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

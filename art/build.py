"""
Builds every asset: runs assets/<name>.py, exports public/models/<name>.glb, saves
art/blend/<name>.blend (hand-editable in desktop Blender) and renders art/previews/<name>.png.

    art/.venv/bin/python art/build.py [name ...]      # or: npm run art
    art/.venv/bin/python art/build.py --no-preview    # skip the (slow) preview renders
"""
from __future__ import annotations

import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from lib.export import export_glb  # noqa: E402
from lib.modifiers import triangle_count  # noqa: E402
from lib.preview import render_views  # noqa: E402

ASSETS = ["court", "plane_tree", "houses", "mairie", "cafe", "props", "cypress", "hills"]
MODELS_DIR = os.path.join(ROOT, "public", "models")
BLEND_DIR = os.path.join(HERE, "blend")
PREVIEW_DIR = os.path.join(HERE, "previews")


def build_asset(name: str, preview: bool) -> None:
    t0 = time.time()
    mod = importlib.import_module(f"assets.{name}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = mod.build()
    tris = sum(triangle_count(o) for o in objs)
    size = export_glb(objs, os.path.join(MODELS_DIR, f"{mod.NAME}.glb"))
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, f"{mod.NAME}.blend"), compress=True)
    print(f"[art] {mod.NAME}: {len(objs)} objects, {tris} triangles, {size / 1024:.0f} KB glb ({time.time() - t0:.1f}s)")
    if preview:
        p = mod.PREVIEW
        for other in p.get("context", []):  # neighbouring assets, only to judge this one in place
            importlib.import_module(f"assets.{other}").build()
        render_views(PREVIEW_DIR, mod.NAME, p["views"], ground_size=p.get("ground_size", 0.0),
                     ground_color=p.get("ground_color"))
        print(f"[art] {mod.NAME}: previews rendered ({time.time() - t0:.1f}s)")


def main(argv: list[str]) -> None:
    preview = "--no-preview" not in argv
    names = [a for a in argv if not a.startswith("--")] or ASSETS
    for n in names:
        if n not in ASSETS:
            raise SystemExit(f"unknown asset '{n}' (known: {', '.join(ASSETS)})")
        build_asset(n, preview)


if __name__ == "__main__":
    main(sys.argv[1:])

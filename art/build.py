"""
Builds every asset: runs assets/<name>.py, exports public/models/<name>.glb, saves
art/blend/<name>.blend (hand-editable in desktop Blender) and renders art/previews/<name>.png.
Then bakes the static lighting (lib/bake.py): public/models/ground_light.png + village_light.png,
re-exports the baked assets with their lightmap UVs and writes src/render/bakedLayout.ts.

    art/.venv/bin/python art/build.py [name ...]      # or: npm run art
    art/.venv/bin/python art/build.py --no-preview    # skip the (slow) preview renders
    art/.venv/bin/python art/build.py bake            # only the light bake
    art/.venv/bin/python art/build.py --quick ...     # bake with 1/4 of the samples (look-dev)
    art/.venv/bin/python art/build.py --no-bake ...   # skip the bake (only when shadows can't change)

The bake runs whenever an asset that casts or receives baked light was (re)built.
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

from lib.bake import bake_scene  # noqa: E402
from lib.export import export_glb  # noqa: E402
from lib.modifiers import triangle_count  # noqa: E402
from lib.preview import render_views  # noqa: E402

ASSETS = ["court", "plane_tree", "houses", "mairie", "cafe", "props", "cypress", "hills"]
# Static assets lit by the lightmaps (exported by the bake, with their atlas UVs).
BAKED = ["court", "houses", "mairie", "cafe", "props"]
# Assets whose geometry shows up in the bake (as receivers or shadow casters).
IN_BAKE = BAKED + ["plane_tree", "cypress"]
MODELS_DIR = os.path.join(ROOT, "public", "models")
LAYOUT_TS = os.path.join(ROOT, "src", "render", "bakedLayout.ts")
BLEND_DIR = os.path.join(HERE, "blend")
PREVIEW_DIR = os.path.join(HERE, "previews")


def build_asset(name: str, preview: bool) -> None:
    t0 = time.time()
    mod = importlib.import_module(f"assets.{name}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = mod.build()
    tris = sum(triangle_count(o) for o in objs)
    if name in BAKED:
        # exported by the bake, with the lightmap-atlas UVs (an export here would drop them)
        size = os.path.getsize(os.path.join(MODELS_DIR, f"{mod.NAME}.glb"))
    else:
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


def bake(quality: float) -> None:
    mods = {n: importlib.import_module(f"assets.{n}") for n in IN_BAKE}
    bake_scene(mods, BAKED, MODELS_DIR, export_glb, LAYOUT_TS, quality)


def main(argv: list[str]) -> None:
    preview = "--no-preview" not in argv
    quality = 0.25 if "--quick" in argv else 1.0
    names = [a for a in argv if not a.startswith("--")] or ASSETS
    for n in names:
        if n != "bake" and n not in ASSETS:
            raise SystemExit(f"unknown asset '{n}' (known: {', '.join(ASSETS)}, bake)")
    for n in names:
        if n != "bake":
            build_asset(n, preview)
    if "--no-bake" not in argv and any(n == "bake" or n in IN_BAKE for n in names):
        bake(quality)


if __name__ == "__main__":
    main(sys.argv[1:])

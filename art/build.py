"""
Builds every asset of a venue: runs <venue package>/<name>.py, exports the venue's models dir
(public/models/<name>.glb, or public/models/<venue>/<name>.glb), saves art/blend/<name>.blend
(hand-editable in desktop Blender) and renders art/previews/<name>.png (venues have their own
sub-directories, see lib/venues.py). Then bakes the static lighting (lib/bake.py): ground_light.png +
<venue>_light.png, re-exports the baked assets with their lightmap UVs and writes the generated layout
TS (src/render/bakedLayout.ts, or src/render/bakedLayoutDerborence.ts).

    art/.venv/bin/python art/build.py [name ...]      # or: npm run art
    art/.venv/bin/python art/build.py --no-preview    # skip the (slow) preview renders
    art/.venv/bin/python art/build.py bake            # only the light bake
    art/.venv/bin/python art/build.py --venue derborence [name ...]  # another venue (default: village)
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
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from lib import venues  # noqa: E402
from lib.bake import bake_scene  # noqa: E402
from lib.export import export_glb  # noqa: E402
from lib.modifiers import triangle_count  # noqa: E402
from lib.preview import render_views  # noqa: E402


def build_asset(venue: venues.Venue, name: str, preview: bool) -> None:
    t0 = time.time()
    mod = importlib.import_module(f"{venue.package}.{name}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = mod.build()
    tris = sum(triangle_count(o) for o in objs)
    if name in venue.baked:
        # exported by the bake, with the lightmap-atlas UVs (an export here would drop them)
        size = os.path.getsize(os.path.join(venue.models_dir(), f"{mod.NAME}.glb"))
    else:
        size = export_glb(objs, os.path.join(venue.models_dir(), f"{mod.NAME}.glb"))
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(venue.blend_dir(), f"{mod.NAME}.blend"), compress=True)
    print(f"[art] {venue.id}/{mod.NAME}: {len(objs)} objects, {tris} triangles, {size / 1024:.0f} KB glb "
          f"({time.time() - t0:.1f}s)")
    if preview:
        p = mod.PREVIEW
        for other in p.get("context", []):  # neighbouring assets, only to judge this one in place
            importlib.import_module(f"{venue.package}.{other}").build()
        render_views(venue.previews_dir(), mod.NAME, p["views"], ground_size=p.get("ground_size", 0.0),
                     ground_color=p.get("ground_color"))
        print(f"[art] {mod.NAME}: previews rendered ({time.time() - t0:.1f}s)")


def bake(venue: venues.Venue, quality: float) -> None:
    if not venue.in_bake:
        print(f"[art] {venue.id}: no assets to bake yet, nothing done")
        return
    mods = {n: importlib.import_module(f"{venue.package}.{n}") for n in venue.in_bake}
    bake_scene(mods, venue, export_glb, quality)


def _venue_arg(argv: list[str]) -> tuple[str | None, list[str]]:
    """Takes `--venue <id>` / `--venue=<id>` out of the arguments (the venue being built)."""
    rest: list[str] = []
    venue_id: str | None = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--venue":
            if i + 1 >= len(argv):
                raise SystemExit("--venue needs a venue id (known: " + ", ".join(venues.VENUES) + ")")
            venue_id = argv[i + 1]
            i += 2
            continue
        if a.startswith("--venue="):
            venue_id = a.split("=", 1)[1]
        else:
            rest.append(a)
        i += 1
    return venue_id, rest


def main(argv: list[str]) -> None:
    venue_id, argv = _venue_arg(argv)
    venue = venues.select(venue_id)  # every output path below follows the venue
    preview = "--no-preview" not in argv
    quality = 0.25 if "--quick" in argv else 1.0
    names = [a for a in argv if not a.startswith("--")] or list(venue.assets)
    for n in names:
        if n != "bake" and n not in venue.assets:
            raise SystemExit(f"unknown {venue.id} asset '{n}' (known: {', '.join(venue.assets) or 'none'}, bake)")
    for n in names:
        if n != "bake":
            build_asset(venue, n, preview)
    if "--no-bake" not in argv and any(n == "bake" or n in venue.in_bake for n in names):
        bake(venue, quality)


if __name__ == "__main__":
    main(sys.argv[1:])

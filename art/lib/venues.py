"""
Venue registry: one 3D environment around the same court (its asset scripts, its layout, its baked
lightmaps and where all of it is written). The game picks one at boot (`?venue=` ->
src/app/venue.ts -> src/render/venues.ts, which reads the generated layout TS the bake writes here).

    npm run art -- --venue derborence            # build every derborence asset, then bake
    npm run art -- --venue derborence <name>     # one asset (+ the bake, if it is in it)
    npm run art -- --venue derborence bake       # only the light bake

Without `--venue` the village is built, exactly as before. Only the art side uses this module; the
physics arena (src/tuning/config.ts) is shared by every venue.

Adding a venue: create the asset package art/assets/<id>/ (plus its `__init__.py`), its layout module
lib/layout_<id>.py (same public shape as lib/layout.py), register it here, and add the matching
record to src/render/venues.ts.
"""
from __future__ import annotations

import dataclasses
import importlib
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
ROOT = os.path.dirname(ART)


@dataclasses.dataclass(frozen=True)
class Venue:
    """Everything that differs between the venues (the court itself is shared)."""

    id: str
    # Asset scripts to build, in build order (module names inside `package`).
    assets: tuple[str, ...]
    # Static assets lit by the lightmap atlas: the bake re-exports them with their atlas UVs.
    baked: tuple[str, ...]
    # Assets whose geometry shows up in the bake (the baked ones plus every instanced asset).
    in_bake: tuple[str, ...]
    # Assets the layout places by instancing them (keys of its INSTANCED mapping).
    instanced: tuple[str, ...]
    # Importable package holding the asset scripts ("assets.derborence" for a venue).
    package: str
    # Importable layout module: SUN, GROUND_RECT / COURT_RECT (+ resolutions), INSTANCED, to_ts().
    layout_module: str
    # Output directory of the glbs and textures, relative to the repo root.
    models: str
    # Generated TS copy of the layout, relative to the repo root.
    layout_ts: str
    # .blend files and preview renders, relative to art/.
    blend: str
    previews: str
    # Name stem of the lightmap atlas for the non-ground surfaces (`village_light.png`).
    atlas: str
    # Meshes of the court asset that lie on the planar ground lightmap (the rest uses the atlas).
    court_ground: tuple[str, ...]
    # Palette entries of the bake's flat ground / court receivers (the albedo they bounce light with).
    ground_albedo: str = "earth"
    court_albedo: str = "dust"

    def models_dir(self) -> str:
        return os.path.join(ROOT, self.models)

    def layout_ts_path(self) -> str:
        return os.path.join(ROOT, self.layout_ts)

    def blend_dir(self) -> str:
        return os.path.join(ART, self.blend)

    def previews_dir(self) -> str:
        return os.path.join(ART, self.previews)

    def layout(self):
        """The layout module itself (imported here, so this registry stays importable without bpy)."""
        return importlib.import_module(self.layout_module)


# The Provençal village: the original scene (same files, same paths as before the venues existed).
VILLAGE = Venue(
    id="village",
    assets=("court", "plane_tree", "houses", "mairie", "cafe", "props", "cypress", "hills"),
    baked=("court", "houses", "mairie", "cafe", "props"),
    in_bake=("court", "houses", "mairie", "cafe", "props", "plane_tree", "cypress"),
    instanced=("plane_tree", "cypress"),
    package="assets",
    layout_module="lib.layout",
    models="public/models",
    layout_ts="src/render/bakedLayout.ts",
    blend="blend",
    previews="previews",
    atlas="village",
    court_ground=("court_gravel", "court_surround"),
)

# An alpine forest court: the petanque court at Derborence (Valais) under larches and spruces, with
# a log chalet up the bank behind the far end and the limestone cliffs of the cirque beyond.
DERBORENCE = Venue(
    id="derborence",
    assets=("court", "spruce", "larch", "pine", "terrain", "chalet", "props", "boulders", "backdrop"),
    baked=("court", "terrain", "chalet", "props", "boulders"),
    in_bake=("court", "terrain", "chalet", "props", "boulders", "spruce", "larch", "pine"),
    instanced=("spruce", "larch", "pine"),
    package="assets.derborence",
    layout_module="lib.layout_derborence",
    models="public/models/derborence",
    layout_ts="src/render/bakedLayoutDerborence.ts",
    blend="blend/derborence",
    previews="previews/derborence",
    atlas="derborence",
    court_ground=("court_gravel", "court_surround", "court_litter"),
    ground_albedo="d_soil",
    court_albedo="d_gravel",
)

VENUES = {v.id: v for v in (VILLAGE, DERBORENCE)}
DEFAULT = VILLAGE.id

_current: Venue = VILLAGE


def get(venue_id: str | None = None) -> Venue:
    """The venue record for an id (None = the default one)."""
    if venue_id is None:
        return VENUES[DEFAULT]
    if venue_id not in VENUES:
        raise SystemExit(f"unknown venue '{venue_id}' (known: {', '.join(VENUES)})")
    return VENUES[venue_id]


def select(venue_id: str | None = None) -> Venue:
    """Makes the venue the one being built: every output path below follows it (build.py does this once)."""
    global _current
    _current = get(venue_id)
    for d in (_current.models_dir(), _current.blend_dir(), _current.previews_dir()):
        os.makedirs(d, exist_ok=True)
    return _current


def current() -> Venue:
    return _current


def models_dir() -> str:
    """Output dir (glbs, lightmaps, textures) of the venue being built; for the asset scripts."""
    return _current.models_dir()

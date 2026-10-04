# art/ - Blender asset pipeline

All 3D assets are made by Python scripts running Blender as a module (`bpy`), so they are
reproducible and diff-able. Output goes to the game as glTF; the `.blend` files can be opened
in desktop Blender for hand edits.

```
art/
  build.py          runs every asset script (export glb + save .blend + render preview)
  assets/           one script per exported file: court, plane_tree, houses, mairie, cafe, props, cypress, hills
  lib/              palette (single colour source of truth), seeded noise/rng, mesh builder,
                    house builder (building.py), small prop shapes (props.py), shared
                    vertex-colour material, modifiers, glTF export + quantization, preview renderer
  blend/<name>.blend   generated, hand-editable in Blender
  previews/<name>*.png generated Cycles previews (for approving a look)
  ../public/models/<name>.glb   generated, loaded by src/render/scenery.ts
```

## Set up (once)

Needs Python 3.11 (the `bpy==5.0.1` wheel is cp311) and ~1 GB of disk.

```sh
./art/setup.sh            # creates art/.venv (git-ignored) and installs bpy
PYTHON=/path/to/python3.11 ./art/setup.sh   # if python3 is not 3.11
```

## Build

```sh
npm run art                 # all assets: glb + blend + previews (~1 min)
npm run art -- court        # only one asset
npm run art -- --no-preview # skip the Cycles preview renders
```

`npm run art` uses `art/.venv/bin/python` when it exists, otherwise `python3` (which then needs
`bpy` installed). The generated `.glb`, `.blend` and preview `.png` files are committed, so
you only need to run this when you change a script.

## Editing by hand

Open `art/blend/<name>.blend` in Blender, edit, then export with File > Export > glTF 2.0
(Format: glTF Binary, Include: Selected Objects, Mesh > Apply Modifiers, Attributes > Vertex
Color: Material) to `public/models/<name>.glb`. Note that `npm run art` overwrites both the
`.blend` and the `.glb`, so either hand-edit **or** change the script, not both.

## Conventions

- **Units** are metres; the game is Y-up with the player throwing toward -Z. The scripts write
  geometry in *game* coordinates and `lib/mesh.py` converts to Blender's Z-up (game x,y,z ->
  Blender x,-z,y); the glTF exporter converts back. In Blender, "far end of the court" is +Y.
- **Court**: x -2..2, z -9.5..5.5, ground top exactly y = 0. Keep `ARENA` in `assets/court.py`
  in sync with `physics.arena` in `src/tuning/config.ts`.
- **Colour** lives in per-face vertex colours (attribute `Col`), one shared material `Palette`
  for everything. Pick colours from `lib/palette.py` (sRGB hex, converted to linear with `lin()`).
  The game replaces the glTF material with one `MeshLambertMaterial({ vertexColors: true })`.
- **Style**: flat shaded, faceted, no textures, no UVs. Randomness only via `lib/rand.py` (seeded).
- **Triangles**: a `Triangulate` modifier is left on each object (the exporter applies it), so
  counts are deterministic. `lib/modifiers.py` also has `decimate()` if an asset gets too heavy.
- **Compression**: `lib/export.py` quantizes every exported file (KHR_mesh_quantization, read
  natively by three's GLTFLoader, no decoder): normals -> int8, vertex colours -> uint8 RGBA;
  positions/indices stay float/uint. No Draco/meshopt (they would need a runtime decoder); the
  host gzips the files (all eight: ~2.5 MB raw, ~0.6 MB gzipped).
- **Trees** (`plane_tree.glb`: `plane_tree_a/_b/_c`; `cypress.glb`: `cypress_a/_b`) are modelled
  with the trunk base at the object origin; plane trees lean and reach toward +X. The game uses
  only their geometry and instances them with its own position / rotation / scale (`TREES` and
  `CYPRESSES` in `src/render/scenery.ts`): plane trees in rows along both sides of the court,
  canopies hanging into the top corners of the aim view.
- **Village** (`houses`, `mairie`, `cafe`, `props`, `hills`) is modelled directly in game coordinates
  and loaded as is. Layout: far row of houses with facades at z = -16, closed in line with the
  court (|x| < 3.4) by the town hall (`mairie.py`: pediment with clock, bell gable, balcony, steps;
  the backdrop behind the jack, so it stays mid-dark and free of bright yellow low on the axis);
  side rows at |x| = 10.5 from z = -10 forward; café terrace right of the mairie, bench / lavender
  wall / lamp left of it; taller roofs, bell tower and cypresses behind. The surround in `court.py`
  mirrors this (pavements) - keep the constants in sync.
  Everything stays outside the court (x -2..2, z -9.5..5.5) and within ~85 m of the cameras
  (far plane 90 m). The hills are drawn unlit, without fog or tone mapping: their colours are
  pre-lit and pre-hazed in `hills.py`.
- **Budget** (whole scene incl. shadow pass): < 120k triangles, < 60 draw calls. Currently about
  79k triangles / 26 draw calls in the aim view. Only the court boards and the plane trees cast
  shadows (the sun's shadow map covers the court only).

## Adding an asset

1. Create `art/assets/<name>.py` with `NAME`, `build() -> [objects]` and `PREVIEW`
   (`views`: `(suffix, camera_xyz, target_xyz, lens_mm)` in game coordinates; optional `context`:
   other asset names built into the preview scene only, to judge the asset in place).
2. Add `"<name>"` to `ASSETS` in `art/build.py`.
3. `npm run art -- <name>`, look at `art/previews/<name>.png`, then load it in `src/render/scenery.ts`
   (`STATIC_MODELS` for files in game coordinates, `loadInstanced` for placed variants).

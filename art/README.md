# art/ - Blender asset pipeline

All 3D assets are made by Python scripts running Blender as a module (`bpy`), so they are
reproducible and diff-able. Output goes to the game as glTF; the `.blend` files can be opened
in desktop Blender for hand edits.

```
art/
  build.py          runs every asset script (export glb + save .blend + render preview)
  assets/           one script per exported file: court.py, plane_tree.py
  lib/              palette (single colour source of truth), seeded noise/rng, mesh builder,
                    shared vertex-colour material, modifiers, glTF export settings, preview renderer
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
- **Compression**: none (Draco would need a decoder at runtime; the files are < 1 MB and the host
  gzips them).
- **Trees** (`plane_tree.glb`) contain two objects, `plane_tree_a` / `plane_tree_b`, modelled with
  the trunk base at the object origin and leaning toward +X. The game uses only their geometry
  and instances them with its own position / rotation / scale (`TREES` in `src/render/scenery.ts`).

## Adding an asset

1. Create `art/assets/<name>.py` with `NAME`, `build() -> [objects]` and `PREVIEW`
   (`views`: `(suffix, camera_xyz, target_xyz, lens_mm)` in game coordinates).
2. Add `"<name>"` to `ASSETS` in `art/build.py`.
3. `npm run art -- <name>`, look at `art/previews/<name>.png`, then load it in `src/render/`.

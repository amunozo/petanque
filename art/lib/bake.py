"""
Light bake for the static scenery (Cycles, CPU): the whole square is assembled in one scene (court,
houses, mairie, café, props + every plane tree and cypress at its place from lib/layout.py) and lit
by the game's sun, then two terms are baked per texel:

  R  sun visibility 0..1: soft shadows of the trees (through the alpha-tested leaf cards, so they
     are dappled), buildings and props. Computed as direct sun light with shadows / without
     shadows, so it holds only the shadow, not N.L (the game still shades N.L in real time).
  G  ambient occlusion 0..1 (sky visibility within AO_DISTANCE: contact shadows at wall feet,
     under the trees, between the boards).

into two textures (8-bit RGB PNG, linear values, B unused):

  public/models/ground_light.png    the square's floor, a planar map over layout.GROUND_RECT (the
                                    game computes the UV from the world position)
  public/models/village_light.png   one atlas for the court boards, houses, mairie, café and props,
                                    through a second UV set made here (smart project + pack)

The baked objects are exported again from this scene (with the atlas UVs) so geometry and
lightmap always match. The real-time sun (src/render/lighting.ts) uses the same direction
(src/render/bakedLayout.ts is written from lib/layout.py here) and only casts the boules' shadows.
"""
from __future__ import annotations

import math
import os
import time

import bpy
import numpy as np
from PIL import Image

from . import layout

AO_DISTANCE = 3.0
SAMPLES_SUN = 32
SAMPLES_FLAT = 4
SAMPLES_AO = 32
SAMPLES_COURT = 40
LIGHT_UV = "Light"


def _bl(v):
    return (v[0], -v[2], v[1])


def _instance(objs_by_name: dict, prefix: str, placements) -> list:
    """Linked duplicates of `<prefix><variant>` (+ `_leaves`) at the layout placements."""
    out = []
    for i, (variant, x, z, rot, s) in enumerate(placements):
        for suffix in ("", "_leaves"):
            src = objs_by_name.get(f"{prefix}{variant}{suffix}")
            if src is None:
                continue
            o = bpy.data.objects.new(f"{src.name}.{i}", src.data)
            o.location = (x, -z, 0.0)
            o.rotation_euler = (0.0, 0.0, math.radians(rot))
            o.scale = (s, s, s)
            for mod in src.modifiers:
                if mod.type == "TRIANGULATE":
                    o.modifiers.new(mod.name, "TRIANGULATE")
            bpy.context.scene.collection.objects.link(o)
            out.append(o)
    return out


def _new_image(name: str, res: int, height: int | None = None):
    img = bpy.data.images.new(name, res, height or res, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    return img


def _receiver(name: str, x0: float, z0: float, w: float, d: float):
    """Flat quad at y = 0 over x0..x0+w, z0..z0+d; UV u along +x, v along +z (the game computes the
    same from the world position; the PNG rows are flipped on save)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([_bl((x0, 0.0, z0)), _bl((x0 + w, 0.0, z0)), _bl((x0 + w, 0.0, z0 + d)), _bl((x0, 0.0, z0 + d))],
                   [], [(0, 3, 2, 1)])
    uv = me.uv_layers.new(name=LIGHT_UV)
    for loop in me.loops:
        x, by, _ = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((x - x0) / w, (-by - z0) / d)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _bake_target(mat, img) -> None:
    nt = mat.node_tree
    node = nt.nodes.get("BakeTarget") or nt.nodes.new("ShaderNodeTexImage")
    node.name = "BakeTarget"
    node.image = img
    nt.nodes.active = node


def _unwrap(objs, margin: float) -> None:
    for o in objs:
        uv = o.data.uv_layers.get(LIGHT_UV) or o.data.uv_layers.new(name=LIGHT_UV)
        o.data.uv_layers.active = uv
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=margin, shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")


def _pixels(img) -> np.ndarray:
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)[..., 0].copy()


def _bake(objs, kind: str, samples: int) -> None:
    sc = bpy.context.scene
    sc.cycles.samples = samples
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bk = sc.render.bake
    bk.margin = 4
    bk.margin_type = "EXTEND"
    bk.use_clear = True
    if kind == "DIFFUSE":
        bk.use_pass_direct = True
        bk.use_pass_indirect = False
        bk.use_pass_color = False
    bpy.ops.object.bake(type=kind)


def _save_grey(path: str, vis: np.ndarray) -> int:
    """Single-channel map as lossy WebP (greyscale, so no cross-channel chroma artefacts)."""
    g = np.flipud(np.clip(vis, 0, 1))
    Image.fromarray((g * 255 + 0.5).astype(np.uint8), "L").save(path, quality=88, method=6)
    return os.path.getsize(path)


def _blur(a: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return a
    r = int(math.ceil(sigma * 2.5))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, r, mode="edge")
    p = sum(k[i] * p[:, i:i + a.shape[1]] for i in range(2 * r + 1))
    p = sum(k[i] * p[i:i + a.shape[0], :] for i in range(2 * r + 1))
    return p


def _save(path: str, vis: np.ndarray, ao: np.ndarray) -> int:
    rgb = np.stack([vis, ao, np.zeros_like(vis)], axis=-1)
    rgb = np.flipud(np.clip(rgb, 0, 1))  # Blender rows are bottom-up
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), "RGB").save(path, optimize=True)
    return os.path.getsize(path)


def bake_scene(assets: dict, baked_names: list[str], models_dir: str, export_fn, ts_path: str,
               quality: float = 1.0) -> None:
    """
    assets: name -> asset module (must include the baked ones plus plane_tree and cypress).
    export_fn(objects, path) exports a glb. quality scales the sample counts (0.25 for quick tests).
    """
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    built: dict[str, list] = {}
    for name in baked_names + ["plane_tree", "cypress"]:
        built[name] = assets[name].build()
    by_name = {o.name: o for objs in built.values() for o in objs}

    # Trees at their places (the modelled variants are removed; their meshes live on in the copies).
    trees = _instance(by_name, "plane_tree_", layout.TREES) + _instance(by_name, "cypress_", layout.CYPRESSES)
    for o in built["plane_tree"] + built["cypress"]:
        bpy.data.objects.remove(o)

    # Ground receivers: flat quads over the lightmap rectangles (the real ground meshes are hidden
    # for the bake; they are flat to a few cm). They are coplanar, so each is baked with the other hidden.
    g = layout.GROUND_RECT
    receiver = _receiver("ground_receiver", g["x0"], g["z0"], g["size"], g["size"])
    c = layout.COURT_RECT
    court_receiver = _receiver("court_receiver", c["x0"], c["z0"], c["w"], c["d"])
    court_receiver.hide_render = True
    for o in built["court"]:
        if o.name in ("court_gravel", "court_surround"):
            o.hide_render = True

    atlas_objs = [o for n in baked_names for o in built[n] if not o.hide_render]
    _unwrap(atlas_objs, 0.004)
    print(f"[bake] unwrapped {len(atlas_objs)} objects ({time.time() - t0:.1f}s)")

    ground_img = _new_image("ground_light", layout.GROUND_RES)
    village_img = _new_image("village_light", layout.VILLAGE_RES)
    gmat = bpy.data.materials.new("GroundReceiver")
    gmat.use_nodes = True
    receiver.data.materials.append(gmat)
    _bake_target(gmat, ground_img)
    court_img = _new_image("court_light", *layout.COURT_RES)
    cmat = bpy.data.materials.new("CourtReceiver")
    cmat.use_nodes = True
    court_receiver.data.materials.append(cmat)
    _bake_target(cmat, court_img)
    mats = {s.material for o in atlas_objs for s in o.material_slots if s.material}
    for m in mats:
        _bake_target(m, village_img)

    # Light: the game's sun, no sky (direct light only), transparent leaf shadows.
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = False
    sc.cycles.transparent_max_bounces = 24
    sc.cycles.max_bounces = 0
    world = bpy.data.worlds.new("BakeWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    world.light_settings.distance = AO_DISTANCE
    sc.world = world
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 1.0
    sun.angle = math.radians(layout.SUN["angle"])
    sun_obj = bpy.data.objects.new("Sun", sun)
    sc.collection.objects.link(sun_obj)
    from mathutils import Vector
    d = Vector(_bl(layout.sun_direction()))
    sun_obj.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()

    targets = [receiver] + atlas_objs
    results = {}
    _bake(targets, "DIFFUSE", max(4, int(SAMPLES_SUN * quality)))
    results["lit"] = (_pixels(ground_img), _pixels(village_img))
    print(f"[bake] sun ({time.time() - t0:.1f}s)")
    casters = [o for o in sc.objects if o.type == "MESH"]
    for o in casters:
        o.visible_shadow = False
    _bake(targets, "DIFFUSE", SAMPLES_FLAT)
    results["flat"] = (_pixels(ground_img), _pixels(village_img))
    for o in casters:
        o.visible_shadow = True
    print(f"[bake] unshadowed ({time.time() - t0:.1f}s)")
    _bake(targets, "AO", max(4, int(SAMPLES_AO * quality)))
    results["ao"] = (_pixels(ground_img), _pixels(village_img))
    print(f"[bake] ambient occlusion ({time.time() - t0:.1f}s)")
    # High-density court map: sun visibility only (AO comes from the ground map). The unshadowed
    # sun light on a flat, level receiver is one constant: take it from the ground receiver.
    receiver.hide_render = True
    court_receiver.hide_render = False
    _bake([court_receiver], "DIFFUSE", max(4, int(SAMPLES_COURT * quality)))
    court_lit = _pixels(court_img)
    flat_ground = results["flat"][0]
    flat_const = float(np.median(flat_ground[flat_ground > 1e-3]))
    court_vis = _blur(np.clip(court_lit / flat_const, 0, 1), 1.3)
    court_receiver.hide_render = True
    print(f"[bake] court ({time.time() - t0:.1f}s)")
    n = _save_grey(os.path.join(models_dir, "court_light.webp"), court_vis)
    print(f"[bake] court_light.webp {n / 1024:.0f} KB")

    for i, name in enumerate(("ground_light", "village_light")):
        lit, flat, ao = results["lit"][i], results["flat"][i], results["ao"][i]
        vis = np.where(flat > 1e-3, lit / np.maximum(flat, 1e-3), 1.0)
        # light denoise (the penumbrae are wider than this); AO is low-frequency, blurred more
        vis = _blur(np.clip(vis, 0, 1), 1.1 if i == 0 else 0.7)
        ao = _blur(np.clip(ao, 0, 1), 2.5 if i == 0 else 1.0)
        n = _save(os.path.join(models_dir, f"{name}.png"), vis, ao)
        print(f"[bake] {name}.png {n / 1024:.0f} KB")

    # Re-export the baked assets with their atlas UVs.
    for name in baked_names:
        objs = built[name]
        for o in objs:
            o.hide_render = False
        size_b = export_fn(objs, os.path.join(models_dir, f"{assets[name].NAME}.glb"))
        print(f"[bake] {name}.glb {size_b / 1024:.0f} KB")
    with open(ts_path, "w") as f:
        f.write(layout.to_ts())
    print(f"[bake] done ({time.time() - t0:.1f}s)")

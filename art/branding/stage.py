"""
Shared Blender helpers for the branding renders (app icon, feature graphic): an empty Cycles
scene, sky-gradient world, sun, camera, the steel boules / jack, and a faceted gravel ground.

Coordinates are GAME coordinates (Y up, the player throws toward -Z), like the rest of art/;
`bl()` converts to Blender's Z-up. Colours come from lib/palette.py.
"""
from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
ROOT = os.path.dirname(ART)
if ART not in sys.path:
    sys.path.insert(0, ART)

import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib.materials import palette_material  # noqa: E402,F401  (re-exported for scripts)
from lib.mesh import MeshData, to_object  # noqa: E402
from lib.palette import Color, lin, mix, scale  # noqa: E402
from lib.rand import Rng, fbm  # noqa: E402


def bl(v) -> Vector:
    """Game (x, y, z) -> Blender (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


# --- world / lights / camera -------------------------------------------------------------

def sky_world(zenith: str, horizon: str, ground: str, strength: float = 1.0) -> None:
    """World = vertical gradient (what the steel reflects): zenith -> horizon above, `ground` below."""
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    # Generated z of the world: direction z in -1..1 mapped to 0..1
    mp = nt.nodes.new("ShaderNodeMapRange")
    mp.inputs["From Min"].default_value = -1.0
    mp.inputs["From Max"].default_value = 1.0
    nt.links.new(sep.outputs["Z"], mp.inputs["Value"])
    nt.links.new(mp.outputs["Result"], ramp.inputs["Fac"])
    els = ramp.color_ramp.elements
    els[0].position = 0.47
    els[0].color = (*lin(ground), 1.0)
    els[1].position = 0.75
    els[1].color = (*lin(zenith), 1.0)
    mid = els.new(0.52)
    mid.color = (*lin(horizon), 1.0)
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    bpy.context.scene.world = world


def sun(direction_to_sun_game, energy: float, color: str = "#fff4e2", angle_deg: float = 3.0, name: str = "Sun"):
    light = bpy.data.lights.new(name, "SUN")
    light.energy = energy
    light.color = lin(color)
    light.angle = math.radians(angle_deg)
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    d = bl(direction_to_sun_game).normalized()
    obj.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return obj


def camera(location_game, target_game, lens_mm: float = 50.0, ortho_scale: float | None = None, shift=(0.0, 0.0)):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = lens_mm
    cam_data.clip_start = 0.01
    cam_data.clip_end = 400
    cam_data.shift_x, cam_data.shift_y = shift
    if ortho_scale:
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = bl(location_game)
    cam.rotation_euler = (bl(target_game) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def setup_render(width: int, height: int, samples: int = 64, transparent: bool = False, exposure: float = 0.0,
                 look: str = "None") -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 60
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = look
    scene.view_settings.exposure = exposure
    scene.display_settings.display_device = "sRGB"


def render(path: str) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def project(point_game, radius: float = 0.0):
    """Pixel position (x right, y down) of a game-space point in the current camera; with `radius`,
    also the approximate on-screen radius (px) of a sphere of that radius there."""
    scene = bpy.context.scene
    cam = scene.camera
    w, h = scene.render.resolution_x, scene.render.resolution_y
    p = world_to_camera_view(scene, cam, bl(point_game))
    xy = (p.x * w, (1 - p.y) * h)
    if not radius:
        return xy
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    q = world_to_camera_view(scene, cam, bl(point_game) + right * radius)
    return xy, math.hypot((q.x - p.x) * w, (q.y - p.y) * h)


# --- boules and jack ---------------------------------------------------------------------

def _groove_material(name: str, tint: str, groove: str, roughness: float, metallic: float,
                     grooves: tuple[float, ...], width: float, coat: float = 0.0):
    """Polished steel (tinted) with dark rings at object-space heights `grooves` (unit sphere)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if coat and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.08
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
    mask = None
    for g in grooves:
        d = nt.nodes.new("ShaderNodeMath")
        d.operation = "SUBTRACT"
        d.inputs[1].default_value = g
        nt.links.new(sep.outputs["Z"], d.inputs[0])
        a = nt.nodes.new("ShaderNodeMath")
        a.operation = "ABSOLUTE"
        nt.links.new(d.outputs[0], a.inputs[0])
        s = nt.nodes.new("ShaderNodeMath")
        s.operation = "LESS_THAN"
        s.inputs[1].default_value = width
        nt.links.new(a.outputs[0], s.inputs[0])
        if mask is None:
            mask = s
        else:
            m = nt.nodes.new("ShaderNodeMath")
            m.operation = "MAXIMUM"
            nt.links.new(mask.outputs[0], m.inputs[0])
            nt.links.new(s.outputs[0], m.inputs[1])
            mask = m
    mixc = nt.nodes.new("ShaderNodeMix")
    mixc.data_type = "RGBA"
    mixc.inputs["A"].default_value = (*lin(tint), 1.0)
    mixc.inputs["B"].default_value = (*lin(groove), 1.0)
    nt.links.new(mask.outputs[0], mixc.inputs["Factor"])
    nt.links.new(mixc.outputs["Result"], bsdf.inputs["Base Color"])
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = roughness
    rough.inputs["To Max"].default_value = 0.7
    nt.links.new(mask.outputs[0], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def sphere(name: str, center_game, radius: float, mat, rot_deg=(0.0, 0.0, 0.0), segments: int = 64, rings: int = 32):
    # Unit sphere scaled to `radius`, so object-space (texture) coordinates are radius-independent.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=bl(center_game))
    o = bpy.context.active_object
    o.name = name
    o.scale = (radius, radius, radius)
    o.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


def boule(name: str, center_game, radius: float, tint: str, rot_deg=(0.0, 0.0, 0.0), roughness: float = 0.22,
          groove: str = "#1d2128", grooves=(-0.42, 0.42), width: float = 0.05):
    mat = _groove_material(f"{name}_steel", tint, groove, roughness, 1.0, grooves, width)
    return sphere(name, center_game, radius, mat, rot_deg)


def jack(name: str, center_game, radius: float, color: str = "#ffd23a"):
    mat = bpy.data.materials.new(f"{name}_wood")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(color), 1.0)
    b.inputs["Roughness"].default_value = 0.38
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = 0.5
        b.inputs["Coat Roughness"].default_value = 0.15
    return sphere(name, center_game, radius, mat)


def flat_material(name: str, color: str, emission: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(color), 1.0)
    b.inputs["Roughness"].default_value = 1.0
    if emission:
        b.inputs["Emission Color"].default_value = (*lin(color), 1.0)
        b.inputs["Emission Strength"].default_value = emission
    return mat


# --- ground ------------------------------------------------------------------------------

def gravel(name: str, half: float, cell: float, colors: list[Color], seed: int, height: float,
           center=(0.0, 0.0), color_fn=None, shade_jitter: float = 0.07, noise_scale: float = 0.22):
    """Faceted low-poly ground: a jittered triangle grid (y ~ 0) with per-face colours blended between
    `colors[0]` and `colors[1]` by noise. `color_fn(x, z, base) -> Color` may shade it further."""
    rng = Rng(seed)
    n = max(2, int(2 * half / cell))
    m = MeshData()
    idx = {}
    for i in range(n + 1):
        for j in range(n + 1):
            x = center[0] - half + i * 2 * half / n
            z = center[1] - half + j * 2 * half / n
            edge = i in (0, n) or j in (0, n)
            jx = 0.0 if edge else rng.jitter(cell * 0.32)
            jz = 0.0 if edge else rng.jitter(cell * 0.32)
            idx[i, j] = m.add_vert((x + jx, rng.jitter(height), z + jz))
    for i in range(n):
        for j in range(n):
            a, b, c, d = idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1]
            tris = ((a, b, c), (a, c, d)) if (i + j) % 2 else ((a, b, d), (b, c, d))
            for t in tris:
                m.add_face((t[0], t[2], t[1]), (0, 0, 0))  # wound so the normal points up (+y)
    for k in range(len(m.faces)):
        cx, _, cz = m.face_center(k)
        v = fbm(cx / cell * noise_scale, cz / cell * noise_scale, 0.0, seed, 3)
        t = max(0.0, min(1.0, (v - 0.3) / 0.4 + rng.jitter(0.12)))  # fbm clusters around 0.5: stretch
        base = colors[0] if len(colors) == 1 else mix(colors[0], colors[1], t)
        base = scale(base, 1.0 + rng.jitter(shade_jitter))
        m.colors[k] = color_fn(cx, cz, base) if color_fn else base
    return to_object(m, name, palette_material())


__all__ = ["bl", "reset", "sky_world", "sun", "camera", "setup_render", "render", "project", "boule", "jack",
           "sphere", "flat_material", "gravel", "lin", "mix", "scale", "palette_material", "ROOT", "ART", "HERE"]

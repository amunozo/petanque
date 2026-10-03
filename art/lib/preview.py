"""Preview renders (Cycles CPU, few samples, small, neutral 3-point light) for art/previews/<name>.png."""
from __future__ import annotations

import math
import os

import bpy
from mathutils import Vector


def _bl(v):
    """Game coordinates (Y up, -Z forward) -> Blender world coordinates."""
    return Vector((v[0], -v[2], v[1]))


def _add_sun(name: str, direction_from_game, energy: float, color=(1.0, 1.0, 1.0), angle_deg: float = 6.0):
    light = bpy.data.lights.new(name, "SUN")
    light.energy = energy
    light.color = color
    light.angle = math.radians(angle_deg)
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    # Aim the lamp from `direction_from_game` (a point, relative to the origin) toward the origin.
    d = _bl(direction_from_game).normalized()
    obj.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return obj


def render_views(out_dir: str, name: str, views, resolution=(640, 480), samples: int = 24,
                 ground_color=None, ground_size: float = 0.0) -> list[str]:
    """
    views: list of (suffix, camera_game_xyz, target_game_xyz, lens_mm). The first view is saved as
    <name>.png, the others as <name>_<suffix>.png. Returns the written paths.
    `ground_size` > 0 adds a plain disc under the asset (for objects that have no ground of their own).
    """
    scene = bpy.context.scene
    created = []

    if ground_size > 0:
        bpy.ops.mesh.primitive_circle_add(vertices=48, radius=ground_size, fill_type="NGON", location=(0, 0, -0.002))
        g = bpy.context.active_object
        created.append(g)
        mat = bpy.data.materials.new("PreviewGround")
        mat.diffuse_color = (*(ground_color or (0.55, 0.5, 0.4)), 1.0)
        mat.use_nodes = True
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*(ground_color or (0.55, 0.5, 0.4)), 1.0)
        mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
        g.data.materials.append(mat)

    # 3-point light (neutral white), tuned for the Standard view transform.
    created.append(_add_sun("Key", (6, 9, 7), 2.1, (1.0, 0.97, 0.92)))
    created.append(_add_sun("Fill", (-8, 4, 5), 0.6, (0.92, 0.96, 1.0), 20))
    created.append(_add_sun("Rim", (-2, 6, -9), 1.0, (1.0, 1.0, 1.0)))

    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.64, 0.66, 1.0)
    bg.inputs["Strength"].default_value = 0.4
    scene.world = world

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 90
    scene.view_settings.view_transform = "Standard"
    scene.display_settings.display_device = "sRGB"

    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i, (suffix, cam_loc, target, lens) in enumerate(views):
        cam_data = bpy.data.cameras.new("PreviewCam")
        cam_data.lens = lens
        cam_data.clip_end = 400
        cam = bpy.data.objects.new("PreviewCam", cam_data)
        scene.collection.objects.link(cam)
        cam.location = _bl(cam_loc)
        cam.rotation_euler = (_bl(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.camera = cam
        path = os.path.join(out_dir, f"{name}.png" if i == 0 else f"{name}_{suffix}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
        bpy.data.objects.remove(cam)
    return paths

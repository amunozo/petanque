"""glTF export settings shared by all assets (Y-up, modifiers applied, no cameras/lights)."""
from __future__ import annotations

import os

import bpy


def export_glb(objects, path: str) -> int:
    """Exports only `objects` to a binary glTF. Returns the file size in bytes."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,            # apply modifiers (triangulate/decimate)
        export_yup=True,              # Blender Z-up -> glTF Y-up
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_texcoords=False,       # no textures in this project
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",     # no images exist; "NONE" would also disable vertex-colour detection
        export_vertex_color="MATERIAL",   # COLOR_0 from the material's Color Attribute node
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False,
        export_extras=False,
        # Draco is off on purpose: it needs a decoder at runtime and these assets are a few
        # hundred KB at most (the host gzips them anyway).
        export_draco_mesh_compression_enable=False,
    )
    return os.path.getsize(path)

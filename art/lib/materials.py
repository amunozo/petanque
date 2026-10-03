"""
One shared flat-shaded material for every asset. All colour lives in the per-face
vertex colours ('Col'), so the whole scene needs a single material (and few draw calls).
"""
from __future__ import annotations

import bpy

MATERIAL_NAME = "Palette"
COLOR_ATTRIBUTE = "Col"


def palette_material():
    """Vertex-colour material (Color Attribute -> Principled BSDF, fully rough). Created once."""
    mat = bpy.data.materials.get(MATERIAL_NAME)
    if mat:
        return mat
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    col = nt.nodes.new("ShaderNodeVertexColor")
    col.layer_name = COLOR_ATTRIBUTE
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)  # glTF multiplies this with COLOR_0
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat

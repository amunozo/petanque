"""Modifier helpers. They are left on the objects (editable in Blender); the exporter applies them."""
from __future__ import annotations


def triangulate(obj, quad_method: str = "BEAUTY"):
    """Triangulate so triangle counts and shading are deterministic."""
    mod = obj.modifiers.new("Triangulate", "TRIANGULATE")
    mod.quad_method = quad_method
    mod.min_vertices = 4
    return mod


def decimate(obj, ratio: float):
    """Collapse decimate to `ratio` (0..1) of the triangles."""
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    return mod


def triangle_count(obj) -> int:
    """Triangles after applying modifiers."""
    import bpy

    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    ev.to_mesh_clear()
    return n

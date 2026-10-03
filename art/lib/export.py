"""
glTF export settings shared by all assets (Y-up, modifiers applied, no cameras/lights), plus a
small dependency-free post-pass that quantizes the vertex data (KHR_mesh_quantization, which
three's GLTFLoader reads natively, no decoder needed):
  NORMAL  float32 x3 -> int8 x3 (normalized, padded to 4 bytes)
  COLOR_0 float32 x3 -> uint8 x4 (normalized, alpha 1)
Positions and indices stay as exported. That is ~45% smaller before gzip.
"""
from __future__ import annotations

import json
import os
import struct
from array import array

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
        # Draco is off on purpose: it needs a decoder at runtime. quantize_glb() below shrinks the
        # vertex data instead (and the host gzips the files).
        export_draco_mesh_compression_enable=False,
    )
    quantize_glb(path)
    return os.path.getsize(path)


_COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def _read_accessor(js, bin_: bytes, acc: dict) -> array:
    code, size = _COMPONENT[acc["componentType"]]
    n = _NCOMP[acc["type"]]
    bv = js["bufferViews"][acc["bufferView"]]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride", 0) or size * n
    out = array(code)
    if stride == size * n:
        out.frombytes(bin_[start:start + acc["count"] * stride])
    else:
        for i in range(acc["count"]):
            out.frombytes(bin_[start + i * stride:start + i * stride + size * n])
    return out


def quantize_glb(path: str) -> None:
    """Rewrites a .glb in place with quantized normals and colours (see the module docstring)."""
    data = open(path, "rb").read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2
    jlen, _ = struct.unpack_from("<II", data, 12)
    js = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen, _ = struct.unpack_from("<II", data, off)
    bin_ = data[off + 8:off + 8 + blen]

    new_bin = bytearray()
    new_views: list[dict] = []
    new_accs: list[dict] = []
    remap: dict[tuple[int, str], int] = {}

    def add_view(payload: bytes, stride: int | None, target: int) -> int:
        while len(new_bin) % 4:
            new_bin.append(0)
        view = {"buffer": 0, "byteOffset": len(new_bin), "byteLength": len(payload), "target": target}
        if stride:
            view["byteStride"] = stride
        new_bin.extend(payload)
        new_views.append(view)
        return len(new_views) - 1

    def convert(acc_index: int, kind: str) -> int:
        key = (acc_index, kind)
        if key in remap:
            return remap[key]
        acc = js["accessors"][acc_index]
        vals = _read_accessor(js, bin_, acc)
        count = acc["count"]
        if kind == "NORMAL":
            q = array("b")
            for i in range(count):
                x, y, z = vals[3 * i], vals[3 * i + 1], vals[3 * i + 2]
                q.extend((max(-127, min(127, round(x * 127))), max(-127, min(127, round(y * 127))),
                          max(-127, min(127, round(z * 127))), 0))
            view = add_view(q.tobytes(), 4, 34962)
            new = {"bufferView": view, "componentType": 5120, "normalized": True, "count": count, "type": "VEC3"}
        elif kind == "COLOR_0":
            n = _NCOMP[acc["type"]]
            q = array("B")
            for i in range(count):
                rgb = [vals[n * i + k] for k in range(3)]
                q.extend([max(0, min(255, round(c * 255))) for c in rgb] + [255])
            view = add_view(q.tobytes(), 4, 34962)
            new = {"bufferView": view, "componentType": 5121, "normalized": True, "count": count, "type": "VEC4"}
        else:  # copy as is (positions, indices)
            code, size = _COMPONENT[acc["componentType"]]
            target = 34963 if kind == "indices" else 34962
            view = add_view(vals.tobytes(), None, target)
            new = {k: v for k, v in acc.items() if k not in ("bufferView", "byteOffset")}
            new["bufferView"] = view
        new_accs.append(new)
        remap[key] = len(new_accs) - 1
        return remap[key]

    for mesh in js["meshes"]:
        for prim in mesh["primitives"]:
            prim["attributes"] = {k: convert(v, k) for k, v in prim["attributes"].items()}
            if "indices" in prim:
                prim["indices"] = convert(prim["indices"], "indices")
    js["accessors"] = new_accs
    js["bufferViews"] = new_views
    js["buffers"] = [{"byteLength": len(new_bin)}]
    for mat in js.get("materials", []):
        mat.pop("extensions", None)  # the game uses its own material
    js["extensionsUsed"] = ["KHR_mesh_quantization"]
    js["extensionsRequired"] = ["KHR_mesh_quantization"]

    jbytes = json.dumps(js, separators=(",", ":")).encode()
    jbytes += b" " * ((4 - len(jbytes) % 4) % 4)
    while len(new_bin) % 4:
        new_bin.append(0)
    total = 12 + 8 + len(jbytes) + 8 + len(new_bin)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(jbytes), 0x4E4F534A))
        f.write(jbytes)
        f.write(struct.pack("<II", len(new_bin), 0x004E4942))
        f.write(new_bin)

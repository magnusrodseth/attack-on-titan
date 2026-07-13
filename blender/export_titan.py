"""Export any titan .blend to a game-ready glb.

Run:  blender --background blender/titans/<slug>/<slug>.blend \
          --python blender/export_titan.py -- <slug> [tri_budget]

Keeps every mesh object except the Ground plane, strips modifiers (particle
hair has no glTF primitive), decimates uniformly to the triangle budget
(small meshes under 2k tris are left alone — eyes and face details), and
exports to public/models/<slug>-titan.glb (Y-up; Blender -Y front becomes
+Z, so three.js rotation.y = facing works directly).
"""

import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not argv:
    raise SystemExit("usage: ... --python export_titan.py -- <slug> [tri_budget]")
SLUG = argv[0]
BUDGET = int(argv[1]) if len(argv) > 1 else 45_000

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "public", "models", f"{SLUG}-titan.glb")

SKIP = ("Ground",)
MIN_DECIMATE_TRIS = 2_000


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


keep = []
for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        continue
    if obj.name in SKIP or obj.name.split(".")[0] in SKIP:
        continue
    keep.append(obj)

for obj in keep:
    obj.modifiers.clear()

total = sum(tri_count(obj) for obj in keep)
ratio = BUDGET / total if total > BUDGET else 1.0
print(f"TOTAL {total} tris, budget {BUDGET}, ratio {ratio:.3f}")

for obj in keep:
    tris = tri_count(obj)
    if ratio < 1.0 and tris > MIN_DECIMATE_TRIS:
        mod = obj.modifiers.new("GameLOD", type="DECIMATE")
        mod.ratio = ratio
        print(f"MESH {obj.name}: {tris} -> ~{int(tris * ratio)}")
    else:
        print(f"MESH {obj.name}: {tris} (kept)")

bpy.ops.object.select_all(action="DESELECT")
for obj in keep:
    obj.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    use_selection=True,
    export_apply=True,
    export_format="GLB",
)
print("EXPORTED", os.path.abspath(OUT))

"""Export beast_titan.blend to a game-ready glb.

Run:  blender --background blender/beast_titan.blend --python blender/export_game.py

Strips the particle hair (glTF has no hair primitive), decimates the heavy
metaball-derived meshes to game weight, and exports just the model to
public/models/beast-titan.glb (Y-up; the -Y Blender front becomes +Z, so
three.js rotation.y = facing works directly).
"""

import os
import bpy

TARGETS = {"Fur": 30_000, "Skin": 15_000}     # triangle budgets
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "public", "models", "beast-titan.glb")

def budget_for(name):
    """Converted metaballs come out suffixed ('Fur.001'); match by prefix."""
    for key, tri_budget in TARGETS.items():
        if name == key or name.startswith(key + "."):
            return tri_budget
    return None


keep = []
for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        continue
    name = obj.name
    if budget_for(name) or name.startswith(("EyeSocket", "Eye", "Nostril")):
        keep.append(obj)

for obj in keep:
    obj.modifiers.clear()                     # drops the hair particle system
    budget = budget_for(obj.name)
    if budget:
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        if tris > budget:
            mod = obj.modifiers.new("GameLOD", type="DECIMATE")
            mod.ratio = budget / tris
        print(f"MESH {obj.name}: {tris} tris -> budget {budget}")

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

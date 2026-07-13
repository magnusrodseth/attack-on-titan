"""Cart Titan — parametric build (Blender 5.x, headless).

Run:  blender --background --python blender/titans/cart/build.py

The quadruped: body axis runs along Y (head at -Y), so the default
height-scaled cameras don't fit — custom camera rig below. Single pink
skin metaball family, lips/eyes/hair as meshes. Ground z=0, meters.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
import bpy  # noqa: E402
import titanlib as T  # noqa: E402

RENDER_DIR = os.path.join(BASE, "renders")
SAMPLES = 128

SKIN = {
    "skull":    [(0.0, -2.9, 2.55, 0.5), (0.0, -2.7, 2.7, 0.42)],
    "chin":     [(0.0, -3.95, 2.02, 0.26)],
    "neck":     [(0.0, -2.3, 2.4, 0.55), (0.0, -1.95, 2.45, 0.6)],
    "shoulders": [(0.5, -1.4, 2.6, 0.55), (0.0, -1.5, 2.2, 0.75)],
    "belly":    [(0.0, 0.1, 2.1, 0.75), (0.0, -0.7, 2.2, 0.75)],
    "rump":     [(0.0, 2.5, 2.15, 0.7), (0.55, 2.2, 2.05, 0.6)],
    "hands":    [(0.85, -1.95, 0.3, 0.3), (0.85, -2.3, 0.24, 0.26)],
    "fingers":  [(0.65, -2.55, 0.18, 0.11), (0.85, -2.6, 0.19, 0.12),
                 (1.05, -2.55, 0.18, 0.11)],
    "feet":     [(0.78, 2.4, 0.3, 0.28), (0.78, 1.9, 0.24, 0.24)],
    "toes":     [(0.6, 1.6, 0.18, 0.1), (0.78, 1.55, 0.19, 0.11),
                 (0.96, 1.6, 0.18, 0.1)],
    # chains
    "spine":    ((0.0, -1.6, 2.5), (0.0, 2.2, 2.3), 0.85, 0.85, 11),
    "muzzle":   ((0.0, -3.0, 2.4), (0.0, -3.9, 2.08), 0.42, 0.28, 6),
    "forearm":  ((0.8, -1.7, 2.3), (0.85, -1.85, 0.4), 0.42, 0.3, 10),
    "thigh":    ((0.7, 1.9, 2.0), (0.8, 1.2, 1.05), 0.62, 0.44, 7),
    "shin":     ((0.8, 1.2, 1.05), (0.78, 2.3, 0.5), 0.42, 0.3, 8),
    "foot_arc": ((0.78, 2.35, 0.4), (0.78, 1.7, 0.25), 0.27, 0.22, 5),
}
BALL_KEYS = ("skull", "chin", "neck", "shoulders", "belly", "rump", "hands",
             "fingers", "feet", "toes")
CHAIN_KEYS = ("spine", "muzzle", "forearm", "thigh", "shin", "foot_arc")

SKIN_COLOR = (0.55, 0.35, 0.3, 1.0)
LIP_COLOR = (0.45, 0.28, 0.22, 1.0)
HAIR_COLOR = (0.15, 0.1, 0.06, 1.0)

CAMS = {
    "front":        ((0.0, -13.0, 2.2), (0.0, -0.5, 1.9), 50),
    "threequarter": ((7.5, -9.0, 3.2), (0.0, 0.0, 1.8), 50),
    "side":         ((11.0, 0.0, 2.0), (0.0, 0.2, 1.9), 50),
    "head":         ((2.2, -5.6, 2.7), (0.0, -3.35, 2.35), 85),
}

scene = T.reset_scene()

skin_mat = T.make_material("Skin", SKIN_COLOR, 0.65, bump_strength=0.35,
                           bump_scale=20.0, sss=0.12)
lip_mat = T.make_material("Lip", LIP_COLOR, 0.55)
hair_mat = T.make_material("Hair", HAIR_COLOR, 0.8)
dark_mat = T.make_material("FaceDark", (0.07, 0.03, 0.02, 1.0), 0.6)
eye_mat = T.make_material("Eye", (0.55, 0.4, 0.18, 1.0), 0.25, emission=0.5)

mb_obj = T.make_metaball_object(scene, "Skin", skin_mat, resolution=0.035)
T.fill_family(mb_obj.data, SKIN, ball_keys=BALL_KEYS, chain_keys=CHAIN_KEYS)
skin_obj = T.to_smooth_mesh(mb_obj)

# ---- big fleshy lips wrapping the muzzle end + mouth slit
T.add_sphere("Lips", (0.0, -3.98, 2.05), 0.3, lip_mat,
             scale=(1.1, 0.55, 0.75))
T.add_box("MouthSlit", (0.0, -4.18, 2.02), (0.5, 0.1, 0.05), dark_mat)

# ---- eyes high on the skull, ears, brown shaggy crown
for sx in (1, -1):
    # NOTE: surface_y scans the whole (x, z) column and would find the
    # muzzle tip here — the skull-front depth is hardcoded instead.
    ey = -3.2
    T.add_sphere("EyeSocket", (sx * 0.24, ey + 0.06, 2.58), 0.09,
                 dark_mat, scale=(1.1, 0.3, 0.8))
    T.add_sphere("Eye", (sx * 0.24, ey + 0.05, 2.58), 0.038, eye_mat)
    ear = T.add_sphere("Ear", (sx * 0.5, -2.55, 2.58), 0.15, skin_mat,
                       scale=(0.35, 0.6, 1.0))
    ear.rotation_euler = (0.2, sx * 0.4, 0)

T.add_sphere("HairCrown", (0.0, -2.85, 2.95), 0.42, hair_mat,
             scale=(1.15, 1.5, 0.55))

crown = bpy.data.objects["HairCrown"]
T.add_hair(crown, lambda co: 0.8 if co.y > -2.85 else 0.35,
           strand_mat=hair_mat, count=900, hair_length=0.28,
           child_percent=15, rendered_children=25, clump=0.8)

# ---------------------------------------------------------------- output
T.setup_environment(scene, ground_size=80)
T.setup_render(scene, res=(1200, 900), samples=SAMPLES)
T.render_views(scene, CAMS, RENDER_DIR)
T.save_blend(os.path.join(BASE, "cart.blend"))

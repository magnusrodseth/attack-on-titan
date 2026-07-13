"""Founding Titan (Ymir Fritz's form) — parametric build (Blender 5.x).

Run:  blender --background --python blender/titans/founding/build.py

Gaunt pale giant: single skin metaball family, rib bands + tendrils +
face as meshes. Z up, faces -Y, ground z=0, meters.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
import bpy  # noqa: E402
import titanlib as T  # noqa: E402

H = 13.0
RENDER_DIR = os.path.join(BASE, "renders")
SAMPLES = 128

BODY = {
    "head":     [(0.0, 0.05, 12.2, 0.6), (0.0, 0.1, 12.5, 0.52)],
    "jaw":      [(0.0, -0.12, 11.75, 0.34)],
    "neck":     [(0.0, 0.1, 11.4, 0.38), (0.0, 0.15, 11.1, 0.45)],
    "traps":    [(0.6, 0.15, 10.85, 0.55)],
    "chest":    [(0.0, 0.1, 10.2, 1.25), (0.0, 0.4, 10.25, 0.95),
                 (0.55, 0.05, 10.15, 0.7)],
    "abs":      [(0.0, -0.05, 9.2, 0.85), (0.0, -0.05, 8.6, 0.75)],
    "waist":    [(0.0, 0.0, 8.15, 0.72)],
    "pelvis":   [(0.0, 0.0, 7.3, 0.95), (0.5, 0.0, 7.0, 0.7),
                 (0.0, 0.3, 7.15, 0.7)],
    "shoulder": [(1.3, 0.08, 10.55, 0.6)],
    "hand":     [(1.85, -0.42, 5.9, 0.42), (1.85, -0.55, 5.5, 0.34)],
    "finger":   [(1.68, -0.6, 5.25, 0.13), (1.85, -0.65, 5.2, 0.14),
                 (2.02, -0.6, 5.25, 0.13)],
    "foot":     [(0.62, -0.25, 0.45, 0.4), (0.62, -0.68, 0.38, 0.36),
                 (0.62, -1.1, 0.32, 0.3), (0.62, 0.12, 0.4, 0.32)],
    "toe":      [(0.44, -1.35, 0.24, 0.12), (0.62, -1.4, 0.25, 0.13),
                 (0.8, -1.35, 0.24, 0.12)],
    # chains — gaunt long limbs
    "upper_arm": ((1.42, 0.05, 10.45), (1.7, -0.15, 8.4), 0.5, 0.4, 10),
    "forearm":   ((1.7, -0.15, 8.4), (1.85, -0.35, 6.2), 0.42, 0.32, 11),
    "thigh":     ((0.6, 0.0, 6.8), (0.68, -0.1, 3.9), 0.75, 0.5, 12),
    "calf":      ((0.68, -0.02, 3.9), (0.62, 0.05, 0.65), 0.52, 0.32, 13),
}
BALL_KEYS = ("head", "jaw", "neck", "traps", "chest", "abs", "waist",
             "pelvis", "shoulder", "hand", "finger", "foot", "toe")
CHAIN_KEYS = ("upper_arm", "forearm", "thigh", "calf")

BODY_COLOR = (0.52, 0.46, 0.4, 1.0)
BONE_COLOR = (0.62, 0.56, 0.48, 1.0)
HAIR_COLOR = (0.04, 0.035, 0.03, 1.0)

scene = T.reset_scene()

body_mat = T.make_material("Body", BODY_COLOR, 0.65, bump_strength=0.3,
                           bump_scale=28.0)
T.add_striation(body_mat, scale=15.0, strength=1.0, direction="X",
                distortion=3.0, color_dip=0.25)
bone_mat = T.make_material("Bone", BONE_COLOR, 0.55, bump_strength=0.3,
                           bump_scale=15.0)
hair_mat = T.make_material("Hair", HAIR_COLOR, 0.8)
dark_mat = T.make_material("Hollow", (0.04, 0.03, 0.025, 1.0), 0.6)
tooth_mat = T.make_material("Tooth", (0.85, 0.82, 0.75, 1.0), 0.35)
eye_mat = T.make_material("Eye", (0.85, 0.85, 0.8, 1.0), 0.3, emission=1.5)

mb_obj = T.make_metaball_object(scene, "Body", body_mat, resolution=0.05)
T.fill_family(mb_obj.data, BODY, ball_keys=BALL_KEYS, chain_keys=CHAIN_KEYS)
body_obj = T.to_smooth_mesh(mb_obj)

# ---- rib bands wrapping the chest + dark sternum cavity + tendrils
for i, rz in enumerate((10.55, 10.25, 9.95, 9.65)):
    for sx in (1, -1):
        rib = T.add_sphere("Rib", (sx * 0.5, -0.55, rz), 0.4, bone_mat,
                           scale=(1.1, 0.35, 0.2))
        rib.rotation_euler = (0.2, 0, sx * -0.15)
T.add_sphere("Cavity", (0.0, -0.75, 10.1), 0.28, dark_mat,
             scale=(0.9, 0.25, 1.15))

for sx in (1, -1):
    for i, (tx, tz) in enumerate(((0.7, 8.6), (0.85, 8.8))):
        tendril = T.add_sphere("Tendril", (sx * tx, -0.55, tz), 0.09,
                               bone_mat, scale=(0.4, 0.4, 3.4),
                               segments=12, rings=8)
        tendril.rotation_euler = (0.1, sx * 0.12, 0)

# ---- face: hollow sockets with pin-point eyes, gaping mouth, teeth
eye_front = T.surface_y(body_obj, 0.2, 12.3) or -0.45
for sx in (1, -1):
    T.add_sphere("EyeHollow", (sx * 0.2, eye_front + 0.08, 12.3), 0.12,
                 dark_mat, scale=(1.1, 0.4, 1.25))
    T.add_sphere("Eye", (sx * 0.2, eye_front + 0.05, 12.3), 0.035, eye_mat)

mouth_front = T.surface_y(body_obj, 0.0, 11.8) or -0.42
T.add_box("MouthGape", (0.0, mouth_front + 0.08, 11.78), (0.44, 0.12, 0.3),
          dark_mat)
for i in range(6):
    tx = -0.2 + i * 0.08
    T.add_box("Tooth", (tx, mouth_front + 0.02, 11.92), (0.06, 0.1, 0.09),
              tooth_mat)

# ---- long swept-back hair from a high hairline
T.add_sphere("HairCrown", (0.0, 0.22, 12.7), 0.5, hair_mat,
             scale=(1.0, 1.1, 0.55))
T.add_sphere("HairBack", (0.0, 0.6, 11.3), 0.4, hair_mat,
             scale=(0.9, 0.5, 3.0))

crown = bpy.data.objects["HairCrown"]
T.add_hair(crown, lambda co: 1.0 if co.y > 0.25 else 0.1,
           strand_mat=hair_mat, count=1000, hair_length=0.45,
           child_percent=15, rendered_children=25, clump=0.9)

# ---------------------------------------------------------------- output
T.setup_environment(scene)
T.setup_render(scene, res=(1200, 1600), samples=SAMPLES)
T.render_views(scene, T.default_cameras(H, head_z=12.25), RENDER_DIR)
T.save_blend(os.path.join(BASE, "founding.blend"))

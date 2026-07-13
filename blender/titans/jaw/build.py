"""Jaw Titan — parametric build (Blender 5.x, headless).

Run:  blender --background --python blender/titans/jaw/build.py

Smallest titan (5 m): pale SKIN body (single metaball family), white bone
mask + claws as meshes, big blonde mane. At this size the metaball grid
must be FINER than the 15 m default (0.025 vs 0.06) or limbs go chunky.
Z up, faces -Y, ground z=0, meters.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
import bpy  # noqa: E402
import titanlib as T  # noqa: E402

H = 5.0
RENDER_DIR = os.path.join(BASE, "renders")
SAMPLES = 128

SKIN = {
    "head":     [(0.0, 0.02, 4.63, 0.28), (0.0, 0.05, 4.75, 0.24)],
    "jaw":      [(0.0, -0.06, 4.45, 0.17)],
    "neck":     [(0.0, 0.05, 4.3, 0.2), (0.0, 0.07, 4.2, 0.24)],
    "traps":    [(0.32, 0.06, 4.18, 0.28)],
    "chest":    [(0.0, 0.04, 3.95, 0.46), (0.0, 0.15, 3.98, 0.36),
                 (0.0, -0.05, 3.9, 0.35)],
    "lats":     [(0.32, 0.1, 3.72, 0.24)],
    "abs":      [(0.0, -0.02, 3.5, 0.33), (0.0, -0.02, 3.3, 0.3)],
    "waist":    [(0.0, 0.0, 3.12, 0.3)],
    "pelvis":   [(0.0, 0.0, 2.8, 0.38), (0.21, 0.0, 2.68, 0.28),
                 (0.0, 0.12, 2.75, 0.27)],
    "shoulder": [(0.52, 0.04, 4.12, 0.3)],
    "quads":    [(0.28, -0.14, 2.1, 0.22)],
    "hams":     [(0.27, 0.13, 2.1, 0.2)],
    "calfback": [(0.28, 0.13, 1.15, 0.16)],
    "hand":     [(0.7, -0.16, 2.35, 0.15), (0.7, -0.2, 2.18, 0.12)],
    "foot":     [(0.26, -0.09, 0.22, 0.17), (0.26, -0.25, 0.19, 0.15),
                 (0.26, -0.4, 0.16, 0.13), (0.26, 0.07, 0.19, 0.14)],
    # chains
    "upper_arm": ((0.57, 0.04, 4.05), (0.66, -0.04, 3.3), 0.24, 0.19, 9),
    "forearm":   ((0.66, -0.04, 3.3), (0.7, -0.13, 2.45), 0.2, 0.15, 10),
    "thigh":     ((0.26, 0.0, 2.6), (0.29, -0.05, 1.5), 0.34, 0.24, 11),
    "calf":      ((0.29, -0.01, 1.5), (0.27, 0.03, 0.24), 0.25, 0.16, 12),
}
BALL_KEYS = ("head", "jaw", "neck", "traps", "chest", "lats", "abs", "waist",
             "pelvis", "shoulder", "quads", "hams", "calfback", "hand",
             "foot")
CHAIN_KEYS = ("upper_arm", "forearm", "thigh", "calf")

SKIN_COLOR = (0.55, 0.38, 0.28, 1.0)
BONE_COLOR = (0.85, 0.82, 0.75, 1.0)
HAIR_COLOR = (0.75, 0.62, 0.3, 1.0)
RED_COLOR = (0.4, 0.1, 0.07, 1.0)

scene = T.reset_scene()

skin_mat = T.make_material("Skin", SKIN_COLOR, 0.65, bump_strength=0.25,
                           bump_scale=25.0, sss=0.12)
bone_mat = T.make_material("Bone", BONE_COLOR, 0.4)
hair_mat = T.make_material("Hair", HAIR_COLOR, 0.75)
red_mat = T.make_material("MuscleRed", RED_COLOR, 0.6)
dark_mat = T.make_material("FaceDark", (0.07, 0.03, 0.02, 1.0), 0.6)
eye_mat = T.make_material("Eye", (0.75, 0.55, 0.2, 1.0), 0.25, emission=0.7)

mb_obj = T.make_metaball_object(scene, "Skin", skin_mat, resolution=0.025)
T.fill_family(mb_obj.data, SKIN, ball_keys=BALL_KEYS, chain_keys=CHAIN_KEYS)
skin_obj = T.to_smooth_mesh(mb_obj)

# ---- white bone muzzle mask with jagged teeth arc
mask_front = T.surface_y(skin_obj, 0.0, 4.45, dx=0.1, dz=0.1) or -0.28
T.add_sphere("Mask", (0.0, mask_front + 0.06, 4.45), 0.17, bone_mat,
             scale=(1.1, 0.5, 0.85))
T.add_box("MouthSlit", (0.0, mask_front + 0.0, 4.38), (0.26, 0.05, 0.05),
          dark_mat)
for i in range(7):                          # jagged teeth: alternate tilt
    tx = -0.12 + i * 0.04
    tooth = T.add_box("Tooth", (tx, mask_front - 0.01, 4.38),
                      (0.028, 0.05, 0.07), bone_mat)
    tooth.rotation_euler = (0, 0.35 if i % 2 else -0.35, 0)

eye_front = T.surface_y(skin_obj, 0.1, 4.66, dx=0.06, dz=0.06) or -0.24
for sx in (1, -1):
    T.add_sphere("EyeRim", (sx * 0.1, eye_front + 0.045, 4.66), 0.05,
                 red_mat, scale=(1.1, 0.35, 1.0))
    T.add_sphere("EyeSocket", (sx * 0.1, eye_front + 0.03, 4.66), 0.038,
                 dark_mat, scale=(1.1, 0.4, 0.95))
    T.add_sphere("Eye", (sx * 0.1, eye_front + 0.02, 4.66), 0.02, eye_mat)

# ---- claws: white bone spikes on fingers and toes + red muscle patches
for sx in (1, -1):
    for i, cx in enumerate((0.62, 0.7, 0.78)):
        claw = T.add_sphere("Claw", (sx * cx, -0.24, 2.02), 0.045, bone_mat,
                            scale=(0.5, 0.7, 2.2), segments=12, rings=8)
        claw.rotation_euler = (0.15, 0, 0)
    for i, cx in enumerate((0.18, 0.26, 0.34)):
        claw = T.add_sphere("ToeClaw", (sx * cx, -0.52, 0.14), 0.04,
                            bone_mat, scale=(0.5, 2.2, 0.7),
                            segments=12, rings=8)
    T.add_sphere("WristRed", (sx * 0.7, -0.15, 2.32), 0.13, red_mat,
                 scale=(1.1, 1.1, 0.6))
    T.add_sphere("AnkleRed", (sx * 0.26, -0.02, 0.32), 0.13, red_mat,
                 scale=(1.05, 1.05, 0.5))

# ---- huge blonde back-swept mane
T.add_sphere("HairCrown", (0.0, 0.08, 4.82, ), 0.27, hair_mat,
             scale=(1.15, 1.2, 0.8))
T.add_sphere("HairTop", (0.0, 0.28, 4.72), 0.2, hair_mat,
             scale=(1.2, 1.0, 1.0))
T.add_sphere("HairBack", (0.0, 0.26, 4.32), 0.2, hair_mat,
             scale=(1.3, 0.7, 2.4))
for sx in (1, -1):
    T.add_sphere("HairSide", (sx * 0.24, 0.1, 4.32), 0.14, hair_mat,
                 scale=(0.6, 0.9, 2.2))

crown = bpy.data.objects["HairCrown"]


def hair_weight(co):
    if co.y < -0.08:
        return 0.05
    return 1.0 if co.y > 0.12 or abs(co.x) > 0.16 else 0.5


T.add_hair(crown, hair_weight, strand_mat=hair_mat, count=800,
           hair_length=0.18, child_percent=15, rendered_children=25,
           clump=0.85)

# ---------------------------------------------------------------- output
T.setup_environment(scene, ground_size=80)
T.setup_render(scene, res=(1200, 1600), samples=SAMPLES)
T.render_views(scene, T.default_cameras(H, head_z=4.6), RENDER_DIR)
T.save_blend(os.path.join(BASE, "jaw.blend"))

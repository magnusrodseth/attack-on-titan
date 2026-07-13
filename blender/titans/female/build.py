"""Female Titan — parametric build (Blender 5.x, headless).

Run:  blender --background --python blender/titans/female/build.py

Two metaball families (the Beast fur/skin trick): red MUSCLE full body +
PALE skin panels embedded over torso front/back, glutes, and face so the
pale surface pokes through exactly where the refs show skin. Z up, faces
-Y, ground z=0, meters.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
import bpy  # noqa: E402
import titanlib as T  # noqa: E402

H = 14.0
RENDER_DIR = os.path.join(BASE, "renders")
SAMPLES = 128

MUSCLE = {
    "head":     [(0.0, 0.05, 13.0, 0.62), (0.0, 0.12, 13.3, 0.55)],
    "jaw":      [(0.0, -0.12, 12.7, 0.38)],
    "neck":     [(0.0, 0.1, 12.35, 0.5), (0.0, 0.15, 12.1, 0.6)],
    "traps":    [(0.7, 0.15, 12.05, 0.65), (1.05, 0.12, 11.85, 0.55)],
    "chest":    [(0.0, 0.1, 11.2, 1.25), (0.0, 0.4, 11.3, 0.95),
                 (0.6, 0.0, 11.15, 0.8)],
    "lats":     [(0.9, 0.3, 10.6, 0.7)],
    "abs":      [(0.0, -0.05, 10.0, 0.95), (0.0, -0.05, 9.4, 0.85)],
    "waist":    [(0.0, 0.0, 8.9, 0.85)],
    "pelvis":   [(0.0, 0.0, 7.9, 1.1), (0.62, 0.0, 7.6, 0.85),
                 (0.0, 0.35, 7.8, 0.8)],
    "shoulder": [(1.45, 0.1, 11.7, 0.72)],
    "biceps":   [(1.7, -0.2, 10.6, 0.48)],
    "quads":    [(0.78, -0.35, 5.9, 0.6), (0.72, -0.3, 5.2, 0.5)],
    "hams":     [(0.75, 0.35, 5.9, 0.55)],
    "calfback": [(0.78, 0.35, 3.2, 0.45), (0.75, 0.28, 2.6, 0.38)],
    "hand":     [(1.95, -0.45, 6.6, 0.4), (1.95, -0.55, 6.25, 0.3)],
    "foot":     [(0.72, -0.25, 0.55, 0.45), (0.72, -0.7, 0.45, 0.4),
                 (0.72, -1.15, 0.38, 0.34), (0.72, 0.12, 0.5, 0.38)],
    "toe":      [(0.52, -1.42, 0.28, 0.16), (0.72, -1.47, 0.29, 0.17),
                 (0.92, -1.42, 0.28, 0.16)],
    # chains
    "upper_arm": ((1.6, 0.1, 11.6), (1.85, -0.1, 9.4), 0.55, 0.45, 9),
    "forearm":   ((1.85, -0.1, 9.4), (1.95, -0.35, 6.95), 0.47, 0.36, 10),
    "thigh":     ((0.72, 0.0, 7.3), (0.8, -0.12, 4.1), 0.85, 0.6, 12),
    "calf":      ((0.8, -0.02, 4.1), (0.74, 0.08, 0.75), 0.62, 0.4, 13),
}
BALL_KEYS = ("head", "jaw", "neck", "traps", "chest", "lats", "abs", "waist",
             "pelvis", "shoulder", "biceps", "quads", "hams", "calfback",
             "hand", "foot", "toe")
CHAIN_KEYS = ("upper_arm", "forearm", "thigh", "calf")

# pale skin family — embedded so the pale surface breaks through the red
PALE = {
    "face":     [(0.0, -0.32, 13.0, 0.44), (0.0, -0.28, 12.73, 0.36)],
    "chestpl":  [(0.0, -0.55, 11.35, 0.9), (0.55, -0.5, 11.1, 0.7),
                 (0.0, -0.5, 10.7, 0.65)],
    "belly":    [(0.0, -0.55, 10.1, 0.56), (0.0, -0.58, 9.65, 0.56),
                 (0.0, -0.55, 9.2, 0.56), (0.0, -0.52, 8.8, 0.52)],
    "pelvispl": [(0.0, -0.45, 7.85, 0.7), (0.0, -0.5, 8.4, 0.5)],
    "glutes":   [(0.45, 0.55, 7.75, 0.6)],
    "backpl":   [(0.0, 0.65, 11.3, 0.75), (0.0, 0.6, 10.4, 0.6)],
}
PALE_KEYS = ("face", "chestpl", "belly", "pelvispl", "glutes", "backpl")

MUSCLE_COLOR = (0.5, 0.16, 0.11, 1.0)
PALE_COLOR = (0.62, 0.47, 0.38, 1.0)
HAIR_COLOR = (0.6, 0.55, 0.28, 1.0)

scene = T.reset_scene()

muscle_mat = T.make_material("Muscle", MUSCLE_COLOR, 0.65, bump_strength=0.3,
                             bump_scale=30.0)
T.add_striation(muscle_mat, scale=16.0, strength=1.3, direction="X",
                distortion=3.0, color_dip=0.4)
pale_mat = T.make_material("Pale", PALE_COLOR, 0.6, bump_strength=0.2,
                           bump_scale=25.0, sss=0.15)
hair_mat = T.make_material("Hair", HAIR_COLOR, 0.75)
dark_mat = T.make_material("FaceDark", (0.08, 0.04, 0.03, 1.0), 0.6)
eye_mat = T.make_material("Eye", (0.25, 0.45, 0.75, 1.0), 0.25, emission=0.6)

mb_obj = T.make_metaball_object(scene, "Muscle", muscle_mat)
T.fill_family(mb_obj.data, MUSCLE, ball_keys=BALL_KEYS, chain_keys=CHAIN_KEYS)
muscle_obj = T.to_smooth_mesh(mb_obj)

pale_obj = T.make_metaball_object(scene, "Pale", pale_mat)
T.fill_family(pale_obj.data, PALE, ball_keys=PALE_KEYS)
pale_obj = T.to_smooth_mesh(pale_obj)

# ---- face: blue eyes, red cheek fiber patches, subtle mouth line
eye_front = T.surface_y(pale_obj, 0.2, 13.05) or -0.72
link_mat = T.make_material("ChainRed", (0.35, 0.1, 0.07, 1.0), 0.6)
for sx in (1, -1):
    T.add_sphere("EyeSocket", (sx * 0.2, eye_front + 0.08, 13.05), 0.08,
                 dark_mat, scale=(1.1, 0.35, 0.9))
    T.add_sphere("Eye", (sx * 0.2, eye_front + 0.05, 13.05), 0.038, eye_mat)
    # red muscle fiber patch on the cheek (canon Annie marking)
    T.add_sphere("CheekPatch", (sx * 0.27, eye_front + 0.14, 12.83), 0.1,
                 link_mat, scale=(0.85, 0.15, 1.25))

mouth_front = T.surface_y(pale_obj, 0.0, 12.65) or -0.62
T.add_box("MouthLine", (0.0, mouth_front + 0.02, 12.65), (0.3, 0.06, 0.05),
          dark_mat)
nose_front = T.surface_y(pale_obj, 0.0, 12.85) or -0.7
T.add_sphere("Nose", (0.0, nose_front + 0.07, 12.85), 0.06, pale_mat,
             scale=(0.55, 0.5, 0.8))

# ---- red chain-link core down the pale belly panel
belly_front = T.surface_y(pale_obj, 0.0, 9.8, dx=0.15) or -1.0
for i in range(4):
    z = 10.25 - i * 0.4
    T.add_box("ChainLink", (0.0, belly_front + 0.01, z),
              (0.34, 0.18, 0.28), link_mat)

# ---- blonde bob: crown + fringe + side curtains over the ears
T.add_sphere("HairCrown", (0.0, 0.15, 13.4), 0.58, hair_mat,
             scale=(1.1, 1.15, 0.7))
T.add_sphere("HairBack", (0.0, 0.42, 12.8), 0.42, hair_mat,
             scale=(1.2, 0.7, 1.4))
T.add_sphere("HairFringe", (0.0, -0.4, 13.32), 0.32, hair_mat,
             scale=(1.4, 0.4, 0.35))
for sx in (1, -1):
    T.add_sphere("HairSide", (sx * 0.46, 0.05, 12.8), 0.26, hair_mat,
                 scale=(0.35, 0.75, 1.3))

crown = bpy.data.objects["HairCrown"]


def hair_weight(co):
    if co.y < -0.2:
        return 0.1
    return 0.7 if abs(co.x) > 0.3 or co.y > 0.2 else 0.35


T.add_hair(crown, hair_weight, strand_mat=hair_mat, count=900,
           hair_length=0.22, child_percent=15, rendered_children=25,
           clump=0.9)

# ---- pale ankle wrap bands
for sx in (1, -1):
    T.add_sphere("AnkleWrap", (sx * 0.74, 0.0, 0.75), 0.36, pale_mat,
                 scale=(1.15, 1.15, 0.45))

# ---------------------------------------------------------------- output
T.setup_environment(scene)
T.setup_render(scene, res=(1200, 1600), samples=SAMPLES)
T.render_views(scene, T.default_cameras(H, head_z=13.2), RENDER_DIR)
T.save_blend(os.path.join(BASE, "female.blend"))

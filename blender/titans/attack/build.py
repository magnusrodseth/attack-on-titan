"""Attack Titan — parametric build (Blender 5.x, headless).

Run:  blender --background --python blender/titans/attack/build.py

One tan muscle metaball family with definition balls proud of the core so
the big muscle groups read; hair is mesh caps (glb keeps them) + particle
strands (renders only). Coordinates: Z up, faces -Y, ground z=0, meters.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
import bpy  # noqa: E402
import titanlib as T  # noqa: E402

H = 15.0
RENDER_DIR = os.path.join(BASE, "renders")
SAMPLES = 128

MUSCLE = {
    "head":     [(0.0, 0.05, 13.95, 0.72), (0.0, 0.15, 14.3, 0.62)],
    "cheekbone": [(0.38, -0.08, 13.65, 0.16)],
    "jaw":      [(0.0, -0.15, 13.4, 0.42), (0.0, -0.05, 13.2, 0.4)],
    "neck":     [(0.0, 0.15, 13.0, 0.75), (0.0, 0.2, 12.75, 0.85)],
    "traps":    [(0.8, 0.2, 12.95, 1.05)],
    "chest":    [(0.0, 0.1, 11.9, 1.8), (0.7, -0.35, 12.25, 0.85),
                 (0.0, 0.55, 12.0, 1.3), (0.9, 0.1, 11.9, 1.0)],
    "lats":     [(1.15, 0.4, 11.3, 1.0)],
    "abs":      [(0.0, -0.05, 10.7, 1.3), (0.0, -0.1, 9.9, 1.2)],
    "waist":    [(0.0, 0.0, 9.3, 1.05)],
    "pelvis":   [(0.0, 0.05, 8.3, 1.45), (0.65, 0.0, 7.9, 1.0),
                 (0.0, 0.4, 8.1, 0.95)],
    "shoulder": [(1.85, 0.1, 12.35, 1.0)],
    "biceps":   [(2.2, -0.3, 11.2, 0.7), (2.25, 0.25, 11.1, 0.55),
                 (2.4, -0.3, 9.2, 0.62)],
    "quads":    [(0.95, -0.45, 6.4, 0.85), (0.85, -0.4, 5.6, 0.7)],
    "hams":     [(0.9, 0.4, 6.4, 0.75)],
    "calfback": [(0.95, 0.4, 3.6, 0.65), (0.9, 0.32, 2.9, 0.55)],
    "hand":     [(2.45, -0.5, 6.9, 0.55), (2.45, -0.65, 6.45, 0.45)],
    "finger":   [(2.25, -0.62, 6.2, 0.18), (2.45, -0.68, 6.15, 0.19),
                 (2.65, -0.62, 6.2, 0.18)],
    "foot":     [(0.85, -0.3, 0.55, 0.6), (0.85, -0.85, 0.5, 0.55),
                 (0.85, -1.4, 0.45, 0.48), (0.85, 0.15, 0.55, 0.48)],
    "toe":      [(0.6, -1.68, 0.35, 0.2), (0.85, -1.72, 0.36, 0.21),
                 (1.1, -1.68, 0.35, 0.2)],
    # chains
    "upper_arm": ((2.0, 0.1, 12.3), (2.3, -0.15, 9.9), 0.85, 0.68, 10),
    "forearm":   ((2.3, -0.15, 9.9), (2.45, -0.4, 7.3), 0.72, 0.58, 11),
    "thigh":     ((0.85, 0.0, 7.7), (0.95, -0.15, 4.4), 1.1, 0.75, 11),
    "calf":      ((0.95, -0.05, 4.4), (0.85, 0.1, 1.1), 0.8, 0.5, 12),
}
BALL_KEYS = ("head", "cheekbone", "jaw", "neck", "traps", "chest", "lats",
             "abs", "waist", "pelvis", "shoulder", "biceps", "quads", "hams",
             "calfback", "hand", "finger", "foot", "toe")
CHAIN_KEYS = ("upper_arm", "forearm", "thigh", "calf")

MUSCLE_COLOR = (0.4, 0.16, 0.08, 1.0)
HAIR_COLOR = (0.03, 0.025, 0.02, 1.0)

scene = T.reset_scene()

# NOTE: texture coords are generated (bounding-box normalized), so scale N
# means ~N bands across the whole body — use 20+, not meters.
muscle_mat = T.make_material("Muscle", MUSCLE_COLOR, 0.7, bump_strength=0.3,
                             bump_scale=30.0, sss=0.1)
T.add_striation(muscle_mat, scale=16.0, strength=1.5, direction="X",
                distortion=3.0, color_dip=0.45)
hair_mat = T.make_material("Hair", HAIR_COLOR, 0.8)
dark_mat = T.make_material("FaceDark", (0.06, 0.03, 0.02, 1.0), 0.6)
tooth_mat = T.make_material("Tooth", (0.92, 0.9, 0.85, 1.0), 0.35)
eye_mat = T.make_material("Eye", (0.15, 0.35, 0.25, 1.0), 0.25, emission=0.4)

mb_obj = T.make_metaball_object(scene, "Muscle", muscle_mat)
T.fill_family(mb_obj.data, MUSCLE, ball_keys=BALL_KEYS, chain_keys=CHAIN_KEYS)
muscle_obj = T.to_smooth_mesh(mb_obj)

# ---- face: skull grin, deep-set eyes, brow ridge, nose, pointed ears
eye_front = T.surface_y(muscle_obj, 0.24, 14.0) or -0.5
for sx in (1, -1):
    T.add_sphere("EyeSocket", (sx * 0.24, eye_front + 0.14, 14.0), 0.11,
                 dark_mat, scale=(1.1, 0.4, 0.9))
    T.add_sphere("Eye", (sx * 0.24, eye_front + 0.09, 14.0), 0.045, eye_mat)

brow_front = T.surface_y(muscle_obj, 0.0, 14.2) or -0.45
T.add_sphere("Brow", (0.0, brow_front + 0.16, 14.23), 0.3,
             muscle_mat, scale=(1.5, 0.5, 0.35))
nose_front = T.surface_y(muscle_obj, 0.0, 13.8) or -0.5
T.add_sphere("Nose", (0.0, nose_front + 0.08, 13.8), 0.09,
             muscle_mat, scale=(0.6, 0.5, 0.7))

# skull grin: measure the muzzle surface PER TOOTH so the row follows the
# face curve — 10 teeth reaching toward the cheeks (ref: ear-to-ear grin)
for i in range(10):
    tx = -0.405 + i * 0.09
    surf = T.surface_y(muscle_obj, tx, 13.4, dx=0.12) or -0.55
    T.add_box("Tooth", (tx, surf + 0.03, 13.4), (0.075, 0.12, 0.14),
              tooth_mat)
    if i < 9:
        T.add_box("ToothGap", (tx + 0.045, surf + 0.05, 13.4),
                  (0.02, 0.1, 0.15), dark_mat)

for sx in (1, -1):
    ear = T.add_sphere("Ear", (sx * 0.62, -0.05, 13.85), 0.16, muscle_mat,
                       scale=(0.3, 0.5, 1.0))
    ear.rotation_euler = (0.35, sx * 0.5, 0)

# ---- long black hair: crown cap + back flap + shoulder-length side
# curtains (all meshes — the glb keeps these), strands only for renders
T.add_sphere("HairCrown", (0.0, 0.2, 14.55), 0.68, hair_mat,
             scale=(1.08, 1.12, 0.72))
T.add_sphere("HairBack", (0.0, 0.6, 13.4), 0.5, hair_mat,
             scale=(1.15, 0.6, 2.3))
for sx in (1, -1):
    T.add_sphere("HairSide", (sx * 0.45, 0.25, 13.4), 0.3, hair_mat,
                 scale=(0.45, 0.75, 2.2))


def hair_weight(co):
    if co.y < -0.15:                      # keep the face clear
        return 0.05
    if co.y > 0.25 or abs(co.x) > 0.4:    # drape at back and sides
        return 1.0
    return 0.35


crown = bpy.data.objects["HairCrown"]
T.add_hair(crown, hair_weight, strand_mat=hair_mat, count=1500,
           hair_length=0.65, child_percent=15, rendered_children=25,
           clump=0.9)

# ---------------------------------------------------------------- output
T.setup_environment(scene)
T.setup_render(scene, res=(1200, 1600), samples=SAMPLES)
T.render_views(scene, T.default_cameras(H, head_z=14.0), RENDER_DIR)
T.save_blend(os.path.join(BASE, "attack.blend"))

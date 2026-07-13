"""Colossus Titan — parametric build (Blender 5.x, headless).

Run:  blender --background --python blender/titans/colossus/build.py

One crimson muscle metaball family + pale sinew strips (meshes). At 60 m
the metaball resolution must scale with the body (0.22 here ≈ the 0.06
used at 17 m) or the converted mesh explodes. Z up, faces -Y, ground z=0.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
import bpy  # noqa: E402
import titanlib as T  # noqa: E402

H = 60.0
RENDER_DIR = os.path.join(BASE, "renders")
SAMPLES = 128

MUSCLE = {
    "head":     [(0.0, 0.2, 56.5, 2.9), (0.0, 0.35, 57.3, 2.5)],
    "temple":   [(1.35, 0.2, 57.0, 1.8)],
    "cheek":    [(1.4, -0.3, 55.8, 0.75)],
    "jaw":      [(0.0, -0.7, 54.4, 1.9)],
    "neck":     [(0.0, 0.5, 53.5, 2.9)],
    "traps":    [(2.8, 0.8, 52.2, 2.9)],
    "chest":    [(0.0, 0.5, 49.5, 6.4), (0.0, -1.5, 49.8, 4.6),
                 (0.0, 2.6, 49.6, 4.8), (4.4, 0.4, 49.4, 4.4)],
    "lats":     [(5.0, 1.2, 46.0, 3.4)],
    "abs":      [(0.0, -0.6, 44.5, 4.4), (0.0, -0.8, 42.0, 3.9)],
    "waist":    [(0.0, 0.0, 40.0, 3.9)],
    "pelvis":   [(0.0, 0.0, 37.0, 4.4), (2.9, 0.0, 34.6, 3.5),
                 (0.0, 1.8, 36.5, 3.2)],
    "shoulder": [(7.0, 0.4, 51.3, 3.0)],
    "hams":     [(3.7, 1.6, 26.0, 2.4)],
    "calfback": [(3.8, 1.5, 13.5, 1.9), (3.7, 1.2, 10.0, 1.6)],
    "hand":     [(8.7, -1.5, 28.9, 2.0), (8.7, -2.1, 26.8, 1.5)],
    "finger":   [(8.0, -2.2, 25.6, 0.62), (8.7, -2.35, 25.4, 0.66),
                 (9.4, -2.2, 25.6, 0.62)],
    "foot":     [(3.6, -1.0, 2.3, 2.0), (3.6, -3.0, 1.9, 1.8),
                 (3.6, -5.0, 1.6, 1.55), (3.6, 0.8, 2.1, 1.7)],
    "toe":      [(2.7, -6.1, 1.2, 0.62), (3.6, -6.3, 1.3, 0.66),
                 (4.5, -6.1, 1.2, 0.62)],
    # chains — overshoot every junction; tangent joins disconnect
    "upper_arm": ((7.6, 0.3, 50.5), (8.45, -0.6, 40.2), 2.6, 2.1, 10),
    "forearm":   ((8.35, -0.4, 41.8), (8.6, -1.2, 30.2), 2.15, 1.7, 12),
    "thigh":     ((3.4, 0.0, 32.8), (3.9, -0.5, 17.5), 3.4, 2.3, 12),
    "calf":      ((3.9, -0.2, 18.5), (3.6, 0.3, 4.0), 2.4, 1.4, 13),
}
BALL_KEYS = ("head", "temple", "cheek", "jaw", "neck", "traps", "chest",
             "lats", "abs", "waist", "pelvis", "shoulder", "hams",
             "calfback", "hand", "finger", "foot", "toe")
CHAIN_KEYS = ("upper_arm", "forearm", "thigh", "calf")

# pale sinew strips: (x, y, z, r, (sx, sy, sz), (rx, ry, rz), mirror)
SINEW = [
    (3.75, -1.55, 10.0, 1.1, (0.6, 0.45, 4.5), (0, 0, 0), True),   # shin
    (3.85, -2.1, 17.5, 1.5, (0.9, 0.5, 1.1), (0, 0, 0), True),     # knee
    (5.4, -0.5, 24.0, 1.2, (0.5, 0.5, 3.8), (0, 0, 0), True),      # IT band
    (8.9, -1.7, 34.0, 0.9, (0.5, 0.5, 3.0), (0.1, 0, 0), True),    # forearm
    (0.0, 5.5, 48.0, 1.2, (0.7, 0.5, 2.5), (0, 0, 0), False),      # spine
    (3.65, 1.5, 6.5, 0.8, (0.5, 0.5, 3.0), (0, 0, 0), True),       # achilles
]

MUSCLE_COLOR = (0.42, 0.1, 0.07, 1.0)
SINEW_COLOR = (0.78, 0.64, 0.55, 1.0)

scene = T.reset_scene()

muscle_mat = T.make_material("Muscle", MUSCLE_COLOR, 0.65, bump_strength=0.3,
                             bump_scale=30.0)
T.add_striation(muscle_mat, scale=22.0, strength=1.5, direction="X",
                distortion=2.0, color_dip=0.4)
sinew_mat = T.make_material("Sinew", SINEW_COLOR, 0.5, bump_strength=0.3,
                            bump_scale=20.0)
dark_mat = T.make_material("FaceDark", (0.07, 0.03, 0.02, 1.0), 0.6)
tooth_mat = T.make_material("Tooth", (0.9, 0.88, 0.82, 1.0), 0.35)
eye_mat = T.make_material("Eye", (0.85, 0.83, 0.75, 1.0), 0.3, emission=0.5)

# Metaball junction behavior is only proven at ~15 m scale (beast/armored/
# attack): build the family at quarter scale with the proven 0.06 grid,
# then scale the converted mesh x4 back to 60 m.
SF = 0.25
scaled = {}
for key, val in MUSCLE.items():
    if key in CHAIN_KEYS:
        s, e, r0, r1, n = val
        scaled[key] = (tuple(c * SF for c in s), tuple(c * SF for c in e),
                       r0 * SF, r1 * SF, n)
    else:
        scaled[key] = [(x * SF, y * SF, z * SF, r * SF) for x, y, z, r in val]

mb_obj = T.make_metaball_object(scene, "Muscle", muscle_mat, resolution=0.06)
T.fill_family(mb_obj.data, scaled, ball_keys=BALL_KEYS,
              chain_keys=CHAIN_KEYS)
muscle_obj = T.to_smooth_mesh(mb_obj)
muscle_obj.scale = (1 / SF, 1 / SF, 1 / SF)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

for x, y, z, r, s, rot, mirror in SINEW:
    xs = (x, -x) if mirror else (x,)
    for xi in xs:
        o = T.add_sphere("Sinew", (xi, y, z), r, sinew_mat, scale=s,
                         segments=16, rings=12)
        rx, ry, rz = rot
        if xi < 0:
            ry, rz = -ry, -rz
        o.rotation_euler = (rx, ry, rz)

# ---- face: ear-to-ear skeletal grin, small lidless eyes, brow ridge
eye_front = T.surface_y(muscle_obj, 1.05, 56.6, dx=0.5, dz=0.5) or -2.2
for sx in (1, -1):
    T.add_sphere("EyeSocket", (sx * 1.05, eye_front + 0.5, 56.6), 0.5,
                 dark_mat, scale=(1.2, 0.3, 0.9))
    T.add_sphere("Eye", (sx * 1.05, eye_front + 0.3, 56.6), 0.17, eye_mat)

brow_front = T.surface_y(muscle_obj, 0.0, 57.3, dx=0.5, dz=0.5) or -2.0
T.add_sphere("Brow", (0.0, brow_front + 0.6, 57.4), 1.3,
             muscle_mat, scale=(1.6, 0.45, 0.35))
nose_front = T.surface_y(muscle_obj, 0.0, 55.9, dx=0.5, dz=0.5) or -2.3
T.add_sphere("Nose", (0.0, nose_front + 0.25, 55.9), 0.35,
             muscle_mat, scale=(0.7, 0.5, 0.9))

# grin: teeth on a smooth parabolic arc anchored at ONE center measurement
# (per-tooth sampling wobbles where the row wraps onto the jaw sides)
grin_front = T.surface_y(muscle_obj, 0.0, 54.8, dx=0.4, dz=0.45) or -2.2
for i in range(11):
    tx = -1.5 + i * 0.3
    ty = grin_front + 0.15 + 0.3 * (tx / 1.5) ** 2
    T.add_box("Tooth", (tx, ty, 54.8), (0.28, 0.42, 0.7), tooth_mat)
    if i < 10:
        T.add_box("ToothGap", (tx + 0.15, ty + 0.08, 54.8),
                  (0.07, 0.36, 0.76), dark_mat)

for sx in (1, -1):
    ear = T.add_sphere("Ear", (sx * 2.55, 0.3, 56.4), 0.55, muscle_mat,
                       scale=(0.3, 0.6, 1.0))
    ear.rotation_euler = (0.3, sx * 0.4, 0)

# ---------------------------------------------------------------- output
T.setup_environment(scene, ground_size=800)
T.setup_render(scene, res=(1200, 1600), samples=SAMPLES)
T.render_views(scene, T.default_cameras(H, head_z=56.5), RENDER_DIR)
T.save_blend(os.path.join(BASE, "colossus.blend"))

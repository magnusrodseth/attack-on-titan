"""War Hammer Titan — parametric build (Blender 5.x, headless).

Run:  blender --background --python blender/titans/warhammer/build.py

Slender white fibrous body (single metaball family), striped muzzle band +
neck rings + spiked hammer as meshes. Z up, faces -Y, ground z=0, meters.
"""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
import titanlib as T  # noqa: E402

H = 15.0
RENDER_DIR = os.path.join(BASE, "renders")
SAMPLES = 128

BODY = {
    "head":     [(0.0, 0.05, 14.0, 0.68), (0.0, 0.1, 14.35, 0.6)],
    "jaw":      [(0.0, -0.15, 13.5, 0.42), (0.0, -0.05, 13.3, 0.4)],
    "neck":     [(0.0, 0.1, 13.05, 0.55), (0.0, 0.15, 12.8, 0.65)],
    "traps":    [(0.75, 0.18, 12.85, 0.8)],
    "chest":    [(0.0, 0.1, 11.95, 1.55), (0.65, -0.35, 12.2, 0.72),
                 (0.0, 0.5, 12.0, 1.15), (0.85, 0.1, 11.9, 0.9)],
    "lats":     [(1.05, 0.35, 11.2, 0.85)],
    "abs":      [(0.0, -0.1, 10.7, 1.15), (0.0, -0.12, 9.9, 1.05)],
    "waist":    [(0.0, 0.0, 9.3, 1.0)],
    "pelvis":   [(0.0, 0.05, 8.3, 1.3), (0.6, 0.0, 7.9, 0.95),
                 (0.0, 0.4, 8.1, 0.9)],
    "shoulder": [(1.75, 0.1, 12.3, 0.85)],
    "biceps":   [(2.05, -0.25, 11.2, 0.6)],
    "quads":    [(0.85, -0.4, 6.3, 0.7), (0.8, -0.35, 5.6, 0.6)],
    "hams":     [(0.85, 0.4, 6.3, 0.65)],
    "calfback": [(0.9, 0.4, 3.5, 0.5), (0.85, 0.3, 2.9, 0.42)],
    "hand":     [(2.35, -0.45, 6.9, 0.48), (2.35, -0.6, 6.5, 0.38)],
    "foot":     [(0.8, -0.3, 0.55, 0.52), (0.8, -0.85, 0.45, 0.46),
                 (0.8, -1.4, 0.4, 0.4), (0.8, 0.15, 0.5, 0.4)],
    "toe":      [(0.58, -1.68, 0.3, 0.15), (0.8, -1.73, 0.31, 0.16),
                 (1.02, -1.68, 0.3, 0.15)],
    # chains
    "upper_arm": ((1.9, 0.1, 12.2), (2.2, -0.15, 9.9), 0.72, 0.58, 10),
    "forearm":   ((2.2, -0.15, 9.9), (2.35, -0.35, 7.3), 0.6, 0.48, 11),
    "thigh":     ((0.8, 0.0, 7.7), (0.9, -0.12, 4.4), 1.0, 0.68, 12),
    "calf":      ((0.9, -0.02, 4.4), (0.82, 0.08, 0.85), 0.72, 0.45, 13),
}
BALL_KEYS = ("head", "jaw", "neck", "traps", "chest", "lats", "abs", "waist",
             "pelvis", "shoulder", "biceps", "quads", "hams", "calfback",
             "hand", "foot", "toe")
CHAIN_KEYS = ("upper_arm", "forearm", "thigh", "calf")

BODY_COLOR = (0.72, 0.72, 0.7, 1.0)
RED_COLOR = (0.45, 0.1, 0.08, 1.0)

scene = T.reset_scene()

body_mat = T.make_material("Body", BODY_COLOR, 0.6, bump_strength=0.3,
                           bump_scale=30.0)
T.add_striation(body_mat, scale=16.0, strength=1.2, direction="X",
                distortion=3.0, color_dip=0.25)
red_mat = T.make_material("StripeRed", RED_COLOR, 0.55)
white_mat = T.make_material("StripeWhite", (0.78, 0.76, 0.72, 1.0), 0.5)
dark_mat = T.make_material("Slit", (0.05, 0.03, 0.03, 1.0), 0.5)

mb_obj = T.make_metaball_object(scene, "Body", body_mat)
T.fill_family(mb_obj.data, BODY, ball_keys=BALL_KEYS, chain_keys=CHAIN_KEYS)
body_obj = T.to_smooth_mesh(mb_obj)

# ---- face: dark eye slits on the dome, striped muzzle band, neck rings
eye_front = T.surface_y(body_obj, 0.22, 14.1) or -0.52
for sx in (1, -1):
    T.add_sphere("EyeSlit", (sx * 0.22, eye_front + 0.05, 14.1), 0.11,
                 dark_mat, scale=(1.2, 0.35, 0.45))

# striped muzzle: flat white band embedded in the lower face + red bars
mouth_front = T.surface_y(body_obj, 0.0, 13.5) or -0.55
T.add_sphere("MuzzlePlate", (0.0, mouth_front + 0.16, 13.5), 0.34,
             white_mat, scale=(0.85, 0.35, 0.8))
for i in range(7):
    tx = -0.24 + i * 0.08
    T.add_box("MuzzleStripe", (tx, mouth_front + 0.06, 13.48),
              (0.03, 0.1, 0.45), red_mat)

# neck rings: snug red wraps around the neck
for i, rz in enumerate((13.15, 13.0, 12.85)):
    T.add_sphere("NeckRing", (0.0, 0.1, rz), 0.46 + i * 0.02, red_mat,
                 scale=(1.0, 1.0, 0.22))

# ---- the war hammer: pole + cross-hatched head with spike grid, held in
# the right hand, head resting on the ground
T.add_box("HammerPole", (2.35, -0.5, 4.9), (0.24, 0.24, 8.6), white_mat)
T.add_box("HammerHead", (2.35, -0.5, 1.2), (2.0, 1.5, 2.2), white_mat)
for ix in range(3):
    for iz in range(3):
        sx_ = 2.35 - 0.6 + ix * 0.6
        sz_ = 1.2 - 0.65 + iz * 0.65
        T.add_box("HammerSpike", (sx_, -1.6, sz_), (0.16, 0.9, 0.16),
                  white_mat)

# ---------------------------------------------------------------- output
T.setup_environment(scene)
T.setup_render(scene, res=(1200, 1600), samples=SAMPLES)
T.render_views(scene, T.default_cameras(H, head_z=14.0), RENDER_DIR)
T.save_blend(os.path.join(BASE, "warhammer.blend"))

"""Armored Titan — parametric build (Blender 5.x, headless).

Run:  blender --background --python blender/titans/armored/build.py

Muscle underbody = one metaball family (dark maroon). Armor = discrete
squashed-sphere plates (cream) joined into a single Plates mesh, so the
segmented gaps show muscle beneath — the defining look from the refs.
Coordinates: Z up, faces -Y, ground z=0, meters.
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

# ------------------------------------------------------------- muscle body
# metaball surfaces render ~25% smaller than nominal radius: sizes below are
# deliberately fat so the flesh reads BULKY (iteration-1 body was gaunt).
MUSCLE = {
    "head":     [(0.0, 0.05, 14.3, 0.78), (0.0, 0.15, 14.7, 0.68)],
    "jaw":      [(0.0, -0.3, 13.9, 0.6)],
    "neck":     [(0.0, 0.1, 13.3, 0.85)],
    "traps":    [(1.05, 0.15, 12.9, 1.2), (0.0, 0.7, 13.3, 0.9)],
    "chest":    [(0.0, 0.15, 12.1, 1.95), (1.0, 0.1, 11.9, 1.4),
                 (0.0, -0.75, 12.0, 1.35), (0.0, 0.9, 12.2, 1.35)],
    "lats":     [(1.25, 0.35, 11.2, 1.2)],
    "abs":      [(0.0, 0.0, 10.6, 1.7), (0.0, -0.05, 9.6, 1.6),
                 (0.0, -0.5, 10.0, 1.2)],
    "waist":    [(0.0, 0.0, 9.0, 1.5)],
    "pelvis":   [(0.0, 0.0, 8.5, 1.5), (0.8, 0.0, 8.1, 1.15),
                 (0.0, 0.6, 8.3, 1.05)],
    "hams":     [(1.0, 0.5, 6.5, 0.8)],
    "calfback": [(1.05, 0.45, 3.9, 0.75), (1.0, 0.35, 3.0, 0.65)],
    "shoulder": [(2.0, 0.1, 12.55, 1.25)],
    "hand":     [(2.6, -0.55, 6.6, 0.7), (2.6, -0.75, 6.0, 0.55)],
    "foot":     [(1.0, -0.35, 0.65, 0.75), (1.0, -1.1, 0.6, 0.65),
                 (1.0, -1.85, 0.5, 0.55), (1.0, 0.2, 0.6, 0.55)],
    # chains: (start, end, r0, r1, count)
    "upper_arm": ((2.3, 0.1, 12.3), (2.6, -0.1, 9.8), 1.0, 0.85, 7),
    "forearm":   ((2.6, -0.1, 9.8), (2.6, -0.4, 7.1), 0.85, 0.7, 8),
    "thigh":     ((1.0, 0.0, 7.9), (1.05, -0.15, 4.7), 1.15, 0.85, 8),
    "calf":      ((1.05, -0.05, 4.7), (1.0, 0.1, 1.3), 1.0, 0.65, 9),
}
BALL_KEYS = ("head", "jaw", "neck", "traps", "chest", "lats", "abs", "waist",
             "pelvis", "hams", "calfback", "shoulder", "hand", "foot")
CHAIN_KEYS = ("upper_arm", "forearm", "thigh", "calf")

# ------------------------------------------------------------- armor plates
# (x, y, z, r, (sx, sy, sz), (rx, ry, rz), mirror) — each must interpenetrate
# the muscle surface (iteration-1 plates floated).
PLATES = [
    # torso front — flat broad slabs that abut into contiguous bands
    (0.78, -1.55, 12.3, 0.8, (1.15, 0.32, 0.95), (0.2, 0, 0), True),    # pec
    (0.6, -1.45, 11.42, 0.5, (1.35, 0.25, 0.34), (0.1, 0, 0), True),    # rib 1
    (0.55, -1.48, 11.05, 0.48, (1.3, 0.24, 0.32), (0.05, 0, 0), True),  # rib 2
    (0.5, -1.46, 10.7, 0.45, (1.2, 0.22, 0.3), (0, 0, 0), True),        # rib 3
    (0.38, -1.48, 10.32, 0.4, (1.05, 0.3, 0.95), (0, 0, 0), True),      # abs r1
    (0.38, -1.46, 9.68, 0.4, (1.05, 0.3, 0.95), (0, 0, 0), True),       # abs r2
    (0.38, -1.35, 9.05, 0.42, (1.05, 0.3, 0.95), (-0.1, 0, 0), True),   # abs r3
    (1.22, -0.65, 9.9, 0.5, (0.65, 0.35, 1.5), (0, 0, -0.25), True),    # oblique
    # collar / shoulders / arms
    (0.8, -0.5, 13.35, 0.58, (1.35, 0.5, 0.55), (0.3, 0, 0), True),     # collar
    (0.0, -1.05, 13.05, 0.44, (1.05, 0.4, 0.55), (0.3, 0, 0), False),   # sternum
    (2.05, 0.1, 12.9, 0.95, (1.05, 0.8, 0.85), (0, 0, 0), True),        # deltoid
    (2.85, 0.0, 11.1, 0.55, (0.85, 0.6, 1.9), (0, 0.1, 0), True),       # arm slab
    (2.95, -0.35, 8.4, 0.5, (0.9, 0.6, 2.0), (0.1, 0, 0), True),        # forearm
    (2.65, -0.9, 6.4, 0.44, (1.05, 0.45, 0.95), (0.3, 0, 0), True),     # knuckles
    # legs — wider strips so the red/white stripe pattern reads
    (0.72, -0.9, 6.4, 0.46, (0.6, 0.4, 2.7), (0.12, 0, 0), True),       # thigh in
    (1.32, -0.8, 6.3, 0.42, (0.55, 0.4, 2.5), (0.12, 0, -0.1), True),   # thigh out
    (1.03, -0.85, 4.6, 0.46, (1.0, 0.45, 0.95), (0, 0, 0), True),       # knee
    (1.02, -0.6, 2.9, 0.42, (0.85, 0.45, 2.5), (-0.05, 0, 0), True),    # shin
    (1.0, -1.0, 0.9, 0.5, (1.25, 1.7, 0.6), (0.25, 0, 0), True),        # foot top
    (1.0, -2.05, 0.55, 0.36, (1.15, 0.75, 0.6), (0.1, 0, 0), True),     # toe cap
    # back — seated into the muscle, flatter
    (0.0, 1.75, 12.5, 0.5, (0.95, 0.35, 1.05), (0, 0, 0), False),       # spine 1
    (0.0, 1.7, 11.4, 0.48, (0.9, 0.35, 1.05), (0, 0, 0), False),        # spine 2
    (0.0, 1.5, 10.3, 0.45, (0.85, 0.35, 0.95), (0, 0, 0), False),       # spine 3
    (1.0, 1.45, 12.3, 0.65, (1.15, 0.35, 1.25), (0, 0, 0.2), True),     # scapula
    (0.65, 1.25, 8.3, 0.55, (1.05, 0.45, 0.95), (0, 0, 0), True),       # glute
    (0.0, 1.35, 8.8, 0.44, (0.95, 0.4, 0.85), (0, 0, 0), False),        # sacrum
]

MUSCLE_COLOR = (0.30, 0.08, 0.06, 1.0)
PLATE_COLOR = (0.58, 0.45, 0.27, 1.0)
HAIR_COLOR = (0.9, 0.8, 0.45, 1.0)

# ---------------------------------------------------------------- build
scene = T.reset_scene()

muscle_mat = T.make_material("Muscle", MUSCLE_COLOR, 0.6, bump_strength=0.25)
T.add_striation(muscle_mat, scale=2.2, strength=0.3)
plate_mat = T.make_material("Plate", PLATE_COLOR, 0.6,
                            bump_strength=0.9, bump_scale=3.0)
hair_mat = T.make_material("Hair", HAIR_COLOR, 0.7)
dark_mat = T.make_material("FaceDark", (0.05, 0.015, 0.012, 1.0), 0.5)
tooth_mat = T.make_material("Tooth", (0.9, 0.88, 0.8, 1.0), 0.35)
eye_mat = T.make_material("Eye", (1.0, 1.0, 0.95, 1.0), 0.2, emission=3.0)

mb_obj = T.make_metaball_object(scene, "Muscle", muscle_mat)
T.fill_family(mb_obj.data, MUSCLE, ball_keys=BALL_KEYS, chain_keys=CHAIN_KEYS)
muscle_obj = T.to_smooth_mesh(mb_obj)

plate_objs = []


def plate(x, y, z, r, s, rot, mirror, mat=None):
    xs = (x, -x) if (mirror and abs(x) > 1e-6) else (x,)
    for xi in xs:
        o = T.add_sphere("Plate", (xi, y, z), r, mat or plate_mat, scale=s,
                         segments=16, rings=12)
        rx, ry, rz = rot
        if xi < 0:
            ry, rz = -ry, -rz
        o.rotation_euler = (rx, ry, rz)
        plate_objs.append(o)


for spec in PLATES:
    plate(*spec)

# ---- face plates measured off the actual muscle surface (no guessing):
# brow above the eye line, cheeks beside it, chin mask under the mouth.
eye_front = T.surface_y(muscle_obj, 0.27, 14.22) or -0.55
plate(0.0, eye_front + 0.34, 14.52, 0.44, (1.25, 0.45, 0.36),
      (0.55, 0, 0), False)                                            # brow
plate(0.36, eye_front + 0.3, 14.0, 0.3, (0.75, 0.4, 1.1),
      (0, 0, -0.15), True)                                            # cheek
mouth_front = T.surface_y(muscle_obj, 0.0, 13.75) or -0.75
plate(0.0, mouth_front + 0.18, 13.45, 0.3, (0.85, 0.5, 0.5),
      (-0.25, 0, 0), False)                                           # chin

# join all plates into one mesh (draw-call budget for three.js)
bpy.ops.object.select_all(action="DESELECT")
for o in plate_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = plate_objs[0]
bpy.ops.object.join()
bpy.context.view_layer.objects.active.name = "Plates"

for sx in (1, -1):
    T.add_sphere("EyeSocket", (sx * 0.27, eye_front + 0.18, 14.22), 0.11,
                 dark_mat, scale=(1.0, 0.3, 0.85))
    T.add_sphere("Eye", (sx * 0.27, eye_front + 0.1, 14.22), 0.042, eye_mat)

T.add_box("Mouth", (0.0, mouth_front + 0.03, 13.75), (0.78, 0.14, 0.22),
          dark_mat)
for i in range(7):                        # lipless teeth ROW, not one block
    tx = -0.3 + i * 0.1
    T.add_box("Tooth", (tx, mouth_front - 0.04, 13.76), (0.082, 0.1, 0.14),
              tooth_mat)

# ---- short blonde crop: scalp cap + strands (strands stripped at export)
scalp = T.add_sphere("Scalp", (0.0, 0.25, 14.95), 0.6, hair_mat,
                     scale=(1.05, 1.15, 0.5))
T.add_hair(scalp, lambda _co: 1.0, strand_mat=hair_mat, count=1200,
           hair_length=0.09, child_percent=15, rendered_children=30,
           clump=0.4)

# ---------------------------------------------------------------- output
T.setup_environment(scene)
T.setup_render(scene, res=(1200, 1600), samples=SAMPLES)
T.render_views(scene, T.default_cameras(H, head_z=13.9), RENDER_DIR)
T.save_blend(os.path.join(BASE, "armored.blend"))

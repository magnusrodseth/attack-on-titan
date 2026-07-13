"""Beast Titan — parametric metaball build (Blender 5.x, headless).

Run:  blender --background --python build.py
Outputs renders/*.png and beast_titan.blend next to this file.

Two metaball families: FUR (dark) and SKIN (tan). Metaballs within a family
blend organically; the two families overlap to fake the fur/skin boundary.
Coordinates: Z up, character faces -Y, ground at z=0. Units = meters.
"""

import os
import bpy
from mathutils import Vector

BASE = os.path.dirname(os.path.abspath(__file__))
RENDER_DIR = os.path.join(BASE, "renders")
os.makedirs(RENDER_DIR, exist_ok=True)

# ---------------------------------------------------------------- parameters
H = 17.0                      # total height (canon)

P = {
    # fur family: (x, y, z, radius) — mirrored entries use +x, mirror adds -x
    "mane":      [(1.8, 0.3, 13.4, 1.9), (0.0, 0.6, 14.1, 1.9)],
    "traps":     [(1.3, 0.0, 14.1, 1.45)],
    "neckfur":   [(0.0, 0.1, 14.6, 1.15)],
    "hair":      [(0.0, 0.25, 16.25, 0.7), (0.0, 0.6, 15.85, 0.65)],
    "shoulder":  [(2.9, 0.0, 12.8, 1.7), (2.3, 0.1, 13.3, 1.5),
                  (3.15, 0.0, 12.8, 1.55)],           # deltoid bulge

    "torso":     [(0.0, 0.5, 12.6, 2.2), (0.0, 0.6, 11.0, 2.3),
                  (0.0, 0.4, 9.4, 2.1)],
    "back":      [(0.0, 1.5, 12.2, 1.9)],
    "pelvis":    [(0.0, 0.2, 7.9, 1.9), (1.0, 0.1, 7.5, 1.5)],
    "beard":     [(0.0, -1.0, 14.75, 0.55), (0.0, -0.9, 14.25, 0.45),
                  (0.45, -0.8, 14.95, 0.38)],
    # limb chains: (start xyz, end xyz, start r, end r, ball count)
    "upper_arm": ((3.15, 0.0, 12.5), (3.35, -0.1, 8.8), 1.45, 1.15, 9),
    "forearm":   ((3.35, -0.1, 8.8), (3.35, -0.45, 4.0), 1.15, 0.95, 12),
    "thigh":     ((1.35, 0.0, 7.3), (1.4, -0.15, 4.3), 1.55, 1.15, 7),
    "calf":      ((1.4, -0.15, 4.3), (1.35, 0.05, 1.1), 1.15, 0.75, 10),
    # skin family — embedded into the fur so the two surfaces overlap
    "pec":       [(0.85, -1.15, 12.0, 1.05)],
    "sternum":   [(0.0, -1.2, 11.85, 0.9)],
    "abs":       [(0.0, -1.3, 10.9, 1.25)],
    "belly":     [(0.0, -1.1, 9.9, 1.95)],
    "neck":      [(0.0, -0.3, 15.0, 0.7)],
    "head":      [(0.0, -0.45, 15.2, 0.7), (0.0, -0.35, 15.75, 1.05),
                  (0.0, -0.1, 16.05, 0.75),
                  (0.0, -1.05, 15.5, 0.42)],   # jaw, skull, cranium, muzzle
    "cheek":     [(0.42, -0.65, 15.35, 0.34)],
    "brow":      [(0.3, -0.9, 15.98, 0.22)],
    "ear":       [(0.72, -0.2, 15.95, 0.22)],
    "hand":      [(3.4, -0.55, 3.5, 1.35), (3.45, -0.8, 2.7, 1.05),
                  (3.45, -1.0, 2.1, 0.75)],
    "finger":    [(3.15, -0.9, 2.2, 0.2), (3.4, -0.95, 2.15, 0.21),
                  (3.65, -0.95, 2.15, 0.21), (3.9, -0.9, 2.2, 0.2),
                  (3.15, -1.0, 1.75, 0.15), (3.4, -1.05, 1.7, 0.16),
                  (3.65, -1.05, 1.7, 0.16), (3.9, -1.0, 1.75, 0.15)],
    "foot":      [(1.35, -0.5, 0.7, 0.9), (1.4, -1.25, 0.62, 0.8),
                  (1.5, -2.0, 0.55, 0.68)],
    "toe":       [(1.15, -2.35, 0.45, 0.2), (1.45, -2.4, 0.48, 0.22),
                  (1.75, -2.35, 0.45, 0.2)],
}

FUR_COLOR = (0.05, 0.026, 0.016, 1.0)      # dark undercoat (converted mesh)
STRAND_COLOR = (0.16, 0.09, 0.055, 1.0)    # lighter strands over it
SKIN_COLOR = (0.44, 0.29, 0.19, 1.0)
MBALL_RESOLUTION = 0.06

RES_X, RES_Y = 1200, 1600
SAMPLES = 128

CAMERAS = {
    "front":        ((0.0, -34.0, 8.5), (0.0, 0.0, 8.5), 50),
    "threequarter": ((22.0, -26.0, 10.0), (0.0, 0.0, 8.8), 50),
    "side":         ((34.0, 0.0, 8.5), (0.0, 0.0, 8.5), 50),
    "head":         ((1.6, -7.6, 16.2), (0.0, -0.9, 15.8), 85),
}

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def make_material(name, color, roughness, bump_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    if bump_strength > 0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 8.0
        noise.inputs["Detail"].default_value = 8.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_metaball_object(name, material):
    mb = bpy.data.metaballs.new(name)
    mb.resolution = MBALL_RESOLUTION
    mb.render_resolution = MBALL_RESOLUTION
    obj = bpy.data.objects.new(name, mb)
    scene.collection.objects.link(obj)
    mb.materials.append(material)
    return obj


def add_ball(mb, x, y, z, r, mirror=False):
    xs = (x, -x) if (mirror and abs(x) > 1e-6) else (x,)
    for xi in xs:
        el = mb.elements.new(type="BALL")
        el.co = (xi, y, z)
        el.radius = r


def add_chain(mb, start, end, r0, r1, count, mirror=True):
    for i in range(count):
        t = i / (count - 1)
        x = start[0] + (end[0] - start[0]) * t
        y = start[1] + (end[1] - start[1]) * t
        z = start[2] + (end[2] - start[2]) * t
        add_ball(mb, x, y, z, r0 + (r1 - r0) * t, mirror=mirror)


fur_mat = make_material("Fur", FUR_COLOR, 0.95, bump_strength=0.6)
skin_mat = make_material("Skin", SKIN_COLOR, 0.65, bump_strength=0.15)

fur_obj = make_metaball_object("Fur", fur_mat)
fur = fur_obj.data
for key in ("mane", "traps", "neckfur", "hair", "shoulder", "torso", "back",
            "pelvis", "beard"):
    for x, y, z, r in P[key]:
        add_ball(fur, x, y, z, r, mirror=True)
for key in ("upper_arm", "forearm", "thigh", "calf"):
    add_chain(fur, *P[key])

skin_obj = make_metaball_object("Skin", skin_mat)
skin = skin_obj.data
for key in ("pec", "sternum", "abs", "belly", "neck", "head", "cheek",
            "brow", "ear", "hand", "finger", "foot", "toe"):
    for x, y, z, r in P[key]:
        add_ball(skin, x, y, z, r, mirror=True)

# --------------------------------------------------- realism pass
# Metaballs -> smooth meshes, hair-strand fur, subsurface skin.


def to_smooth_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    converted = bpy.context.view_layer.objects.active
    for poly in converted.data.polygons:
        poly.use_smooth = True
    return converted


fur_obj = to_smooth_mesh(fur_obj)
skin_obj = to_smooth_mesh(skin_obj)

# ---- face features, placed against the measured skin surface ----


def surface_front_y(obj, x0, z0, dx=0.2, dz=0.2):
    best = None
    for v in obj.data.vertices:
        if abs(v.co.x - x0) < dx and abs(v.co.z - z0) < dz:
            if best is None or v.co.y < best:
                best = v.co.y
    return best


dark_mat = make_material("FaceDark", (0.02, 0.012, 0.009, 1.0), 0.55)
eye_mat = make_material("Eye", (0.01, 0.008, 0.006, 1.0), 0.2)


def add_face_sphere(name, loc, r, mat, scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc,
                                         segments=24, ring_count=16)
    o = bpy.context.active_object
    o.name = name
    if scale:
        o.scale = scale
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


eye_front = surface_front_y(skin_obj, 0.27, 15.8)
nose_front = surface_front_y(skin_obj, 0.1, 15.5)
for sx in (1, -1):
    add_face_sphere("EyeSocket", (sx * 0.27, eye_front + 0.075, 15.8),
                    0.085, dark_mat)
    add_face_sphere("Eye", (sx * 0.27, eye_front + 0.005, 15.8),
                    0.035, eye_mat)
    add_face_sphere("Nostril", (sx * 0.1, nose_front + 0.02, 15.5),
                    0.04, dark_mat)
# mouth omitted: in the references the beard covers it, and every attached
# mouth primitive read as an artifact against the curved muzzle

skin_bsdf = skin_mat.node_tree.nodes["Principled BSDF"]
for inp, val in (("Subsurface Weight", 0.15), ("Subsurface Scale", 0.1)):
    try:
        skin_bsdf.inputs[inp].default_value = val
    except KeyError:
        pass

# region-weighted fur length: mane/crown/beard long, limbs short
fur_vg = fur_obj.vertex_groups.new(name="FurLen")
for v in fur_obj.data.vertices:
    x, y, z = v.co
    w = 0.45                                   # base coat
    if z > 12.4:
        w = 0.9                                # mane / shoulders
    if z > 13.2 and y > -0.2:
        w = 0.7                                # crown / traps
    if z > 13.0 and y < -0.3 and abs(x) < 1.5:
        w = 1.0                                # beard wrapping the jaw
    if z < 2.2:
        w = 0.35                               # ankles taper
    fur_vg.add([v.index], w, "REPLACE")

fur_obj.modifiers.new("FurHair", type="PARTICLE_SYSTEM")
psys = fur_obj.particle_systems[-1]
psys.vertex_group_length = "FurLen"
ps = psys.settings
ps.type = "HAIR"
ps.count = 6000
ps.hair_length = 0.55
ps.hair_step = 5
ps.child_type = "INTERPOLATED"
ps.child_percent = 20
ps.rendered_child_count = 50
ps.clump_factor = 0.6
ps.length_random = 0.4
ps.roughness_1 = 0.08
ps.roughness_endpoint = 0.02
ps.root_radius = 1.0
ps.tip_radius = 0.0
ps.radius_scale = 0.05
strand_mat = make_material("FurStrand", STRAND_COLOR, 0.75)
fur_obj.data.materials.append(strand_mat)
ps.material = 2                            # strands lighter than undercoat

# ---------------------------------------------------------------- environment
ground_mat = make_material("Ground", (0.06, 0.055, 0.05, 1.0), 0.95)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
ground = bpy.context.active_object
ground.data.materials.append(ground_mat)

world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.09, 0.09, 0.10, 1.0)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
scene.world = world

key = bpy.data.lights.new("Key", type="SUN")
key.energy = 5.0
key_obj = bpy.data.objects.new("Key", key)
key_obj.rotation_euler = (0.9, 0.0, -0.6)     # from front-left, high
scene.collection.objects.link(key_obj)

fill = bpy.data.lights.new("Fill", type="SUN")
fill.energy = 1.0
fill.color = (0.8, 0.85, 1.0)
fill.use_shadow = False
fill_obj = bpy.data.objects.new("Fill", fill)
fill_obj.rotation_euler = (1.2, 0.0, 2.6)     # from back-right
scene.collection.objects.link(fill_obj)

rim = bpy.data.lights.new("Rim", type="SUN")
rim.energy = 3.5
rim.color = (1.0, 0.85, 0.7)
rim.use_shadow = False
rim_obj = bpy.data.objects.new("Rim", rim)
rim_obj.rotation_euler = (1.35, 0.0, 3.6)     # low, from behind-left
scene.collection.objects.link(rim_obj)

# ---------------------------------------------------------------- cameras
def make_camera(name, location, target, lens):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    obj = bpy.data.objects.new(name, cam)
    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)
    return obj


cam_objs = {n: make_camera(n, *spec) for n, spec in CAMERAS.items()}

# ---------------------------------------------------------------- render
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.image_settings.file_format = "PNG"
try:
    scene.eevee.taa_render_samples = SAMPLES
except AttributeError:
    pass
for attr, val in (("hair_type", "STRAND"), ("hair_subdiv", 2)):
    try:
        setattr(scene.render, attr, val)
    except (AttributeError, TypeError):
        pass
try:
    scene.eevee.use_raytracing = True
except AttributeError:
    pass
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

for name, cam in cam_objs.items():
    scene.camera = cam
    scene.render.filepath = os.path.join(RENDER_DIR, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {name}")

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BASE, "beast_titan.blend"))
print("DONE")

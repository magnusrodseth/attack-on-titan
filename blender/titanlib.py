"""Shared helpers for the parametric titan builds (Blender 5.x, headless).

Extracted from the Beast Titan build (build.py). Per-titan scripts live in
titans/<slug>/build.py and import this via:

    import sys, os
    BASE = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.abspath(os.path.join(BASE, "..", "..")))
    import titanlib as T

Conventions: Z up, character faces -Y, ground at z=0, units = meters.
Blender 5.1 headless exposes only BLENDER_EEVEE (no CYCLES in --background).
"""

import os

import bpy
from mathutils import Vector

MBALL_RESOLUTION = 0.06


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


# ---------------------------------------------------------------- materials
def make_material(name, color, roughness, bump_strength=0.0, bump_scale=8.0,
                  sss=0.0, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0:
        try:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emission
        except KeyError:
            pass
    if bump_strength > 0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = 8.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if sss > 0:
        for inp, val in (("Subsurface Weight", sss), ("Subsurface Scale", 0.1)):
            try:
                bsdf.inputs[inp].default_value = val
            except KeyError:
                pass
    return mat


def add_striation(mat, scale=3.0, strength=0.35, direction="Z",
                  distortion=2.0, color_dip=0.0):
    """Anisotropic wave bump for exposed-muscle fiber striation.

    Texture coords are generated (bounding-box normalized): scale N means
    ~N bands across the whole object, so use ~15-30 for a body.
    color_dip > 0 also darkens the wave grooves (normal-only bump washes
    out under AgX at game-render distances).
    """
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = direction
    wave.inputs["Scale"].default_value = scale
    wave.inputs["Distortion"].default_value = distortion
    wave.inputs["Detail"].default_value = 3.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    links.new(wave.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if color_dip > 0:
        base = tuple(bsdf.inputs["Base Color"].default_value)
        dark = tuple(c * (1.0 - color_dip) for c in base[:3]) + (1.0,)
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = dark
        ramp.color_ramp.elements[1].color = base
        links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---------------------------------------------------------------- metaballs
def make_metaball_object(scene, name, material, resolution=MBALL_RESOLUTION):
    mb = bpy.data.metaballs.new(name)
    mb.resolution = resolution
    mb.render_resolution = resolution
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


def add_ellipsoid(mb, x, y, z, r, sx=1.0, sy=1.0, sz=1.0, mirror=False):
    """Scaled ball for plates/slabs. Scale acts on the element, not object."""
    xs = (x, -x) if (mirror and abs(x) > 1e-6) else (x,)
    for xi in xs:
        el = mb.elements.new(type="ELLIPSOID")
        el.co = (xi, y, z)
        el.radius = r
        el.size_x, el.size_y, el.size_z = sx, sy, sz


def add_chain(mb, start, end, r0, r1, count, mirror=True):
    for i in range(count):
        t = i / (count - 1)
        x = start[0] + (end[0] - start[0]) * t
        y = start[1] + (end[1] - start[1]) * t
        z = start[2] + (end[2] - start[2]) * t
        add_ball(mb, x, y, z, r0 + (r1 - r0) * t, mirror=mirror)


def fill_family(mb, P, ball_keys=(), chain_keys=(), mirror=True):
    for key in ball_keys:
        for x, y, z, r in P[key]:
            add_ball(mb, x, y, z, r, mirror=mirror)
    for key in chain_keys:
        add_chain(mb, *P[key])


# ---------------------------------------------------------------- meshing
def to_smooth_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    converted = bpy.context.view_layer.objects.active
    for poly in converted.data.polygons:
        poly.use_smooth = True
    return converted


def surface_y(obj, x0, z0, dx=0.2, dz=0.2):
    """Frontmost (min) y of the mesh near (x0, z0) — faces attach here."""
    best = None
    for v in obj.data.vertices:
        if abs(v.co.x - x0) < dx and abs(v.co.z - z0) < dz:
            if best is None or v.co.y < best:
                best = v.co.y
    return best


def add_sphere(name, loc, r, mat, scale=None, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc,
                                         segments=segments, ring_count=rings)
    o = bpy.context.active_object
    o.name = name
    if scale:
        o.scale = scale
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


def add_box(name, loc, dims, mat, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    if rot:
        o.rotation_euler = rot
    o.data.materials.append(mat)
    return o


# ---------------------------------------------------------------- hair
def add_hair(obj, weight_fn, strand_mat=None, count=6000, hair_length=0.55,
             child_percent=20, rendered_children=50, clump=0.6):
    """Particle hair with region-weighted length. weight_fn(co) -> 0..1.

    Leave emission velocity at defaults; control ONLY hair_length + the
    vertex group (velocity scales strand length unpredictably).
    """
    vg = obj.vertex_groups.new(name="FurLen")
    for v in obj.data.vertices:
        vg.add([v.index], max(0.0, min(1.0, weight_fn(v.co))), "REPLACE")
    obj.modifiers.new("FurHair", type="PARTICLE_SYSTEM")
    psys = obj.particle_systems[-1]
    psys.vertex_group_length = "FurLen"
    ps = psys.settings
    ps.type = "HAIR"
    ps.count = count
    ps.hair_length = hair_length
    ps.hair_step = 5
    ps.child_type = "INTERPOLATED"
    ps.child_percent = child_percent
    ps.rendered_child_count = rendered_children
    ps.clump_factor = clump
    ps.length_random = 0.4
    ps.roughness_1 = 0.08
    ps.roughness_endpoint = 0.02
    ps.root_radius = 1.0
    ps.tip_radius = 0.0
    ps.radius_scale = 0.05
    if strand_mat is not None:
        obj.data.materials.append(strand_mat)
        ps.material = len(obj.data.materials)
    return psys


# ---------------------------------------------------------------- environment
def setup_environment(scene, ground_color=(0.06, 0.055, 0.05, 1.0),
                      ground_size=200):
    ground_mat = make_material("Ground", ground_color, 0.95)
    bpy.ops.mesh.primitive_plane_add(size=ground_size, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    ground.data.materials.append(ground_mat)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.09, 0.09, 0.10, 1.0)
    bg.inputs["Strength"].default_value = 0.8
    scene.world = world

    key = bpy.data.lights.new("Key", type="SUN")
    key.energy = 5.0
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.rotation_euler = (0.9, 0.0, -0.6)      # front-left, high
    scene.collection.objects.link(key_obj)

    fill = bpy.data.lights.new("Fill", type="SUN")
    fill.energy = 1.0
    fill.color = (0.8, 0.85, 1.0)
    fill.use_shadow = False
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.rotation_euler = (1.2, 0.0, 2.6)      # back-right
    scene.collection.objects.link(fill_obj)

    rim = bpy.data.lights.new("Rim", type="SUN")
    rim.energy = 3.5
    rim.color = (1.0, 0.85, 0.7)
    rim.use_shadow = False
    rim_obj = bpy.data.objects.new("Rim", rim)
    rim_obj.rotation_euler = (1.35, 0.0, 3.6)      # low, behind-left
    scene.collection.objects.link(rim_obj)


# ---------------------------------------------------------------- cameras
def make_camera(scene, name, location, target, lens):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    obj = bpy.data.objects.new(name, cam)
    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)
    return obj


def default_cameras(H, head_z=None, head_y=None):
    """Front/threequarter/side/head views scaled to total height H."""
    if head_z is None:
        head_z = 0.93 * H
    if head_y is None:
        head_y = -0.05 * H
    return {
        "front":        ((0.0, -2.0 * H, 0.5 * H), (0.0, 0.0, 0.5 * H), 50),
        "threequarter": ((1.3 * H, -1.53 * H, 0.59 * H),
                         (0.0, 0.0, 0.52 * H), 50),
        "side":         ((2.0 * H, 0.0, 0.5 * H), (0.0, 0.0, 0.5 * H), 50),
        "head":         ((0.1 * H, head_y - 0.42 * H, head_z + 0.02 * H),
                         (0.0, head_y, head_z), 85),
    }


# ---------------------------------------------------------------- rendering
def setup_render(scene, res=(1200, 1600), samples=128):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.image_settings.file_format = "PNG"
    try:
        scene.eevee.taa_render_samples = samples
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


def render_views(scene, camera_specs, render_dir, only=None):
    os.makedirs(render_dir, exist_ok=True)
    cam_objs = {n: make_camera(scene, n, *spec)
                for n, spec in camera_specs.items()}
    for name, cam in cam_objs.items():
        if only and name not in only:
            continue
        scene.camera = cam
        scene.render.filepath = os.path.join(render_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"RENDERED {name}")


def save_blend(path):
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print("DONE", path)

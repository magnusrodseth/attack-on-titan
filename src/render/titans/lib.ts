import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three'
import type { BossFight } from '../../sim/boss'
import type { TitanState } from '../../sim/titan'

/**
 * Shared toolkit for the procedural Shifter bodies ported from the Blender statue
 * builds (blender/titans/<slug>/build.py). Each port transcribes the named numbers
 * from its build.py; these helpers keep that transcription mechanical: coordinates
 * stay in Blender's convention (Z up, character faces -Y, ground z=0, meters) and
 * convert at the last moment, so a builder reads line-for-line against the Python.
 */

/** A procedural Shifter body: primitives on articulated pivots, driven per frame. */
export interface BossBodyVisual {
  addTo(scene: Scene): void
  removeFrom(scene: Scene): void
  /** Drive pose and boss-specific overlays (throw windup, steam shudder) each frame. */
  sync(fight: BossFight, dt: number): void
  /** Cosmetic anchor for the lit Weak Point glow; null falls back to bossPartCenter. */
  partAnchor(partId: string): Object3D | null
}

export type BossBodyBuilder = (t: TitanState) => BossBodyVisual

/** Blender build.py coords (Z up, faces -Y) to three.js scene coords (Y up, faces +Z). */
export function bl(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, z, -y)
}

const loader = new TextureLoader()
const textureCache = new Map<string, Texture>()

/** One GPU texture per (path, repeat); tints vary per material, maps are shared. */
export function sharedTexture(path: string, repeat = 1, srgb = true): Texture {
  const key = `${path}@${repeat}:${srgb}`
  let texture = textureCache.get(key)
  if (!texture) {
    texture = loader.load(path)
    if (srgb) texture.colorSpace = SRGBColorSpace
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(repeat, repeat)
    textureCache.set(key, texture)
  }
  return texture
}

export interface BodyMatOpts {
  /** public/textures path; the mandate: every visible surface layers a tint over a map. */
  map: string
  /** Tint from the build.py named color, translated to multiply over the map. */
  tint: Color | string | number
  repeat?: number
  roughness?: number
  metalness?: number
  /** Optional credited normal map (linear, not sRGB) to kill the smooth-primitive look. */
  normal?: string
  normalScale?: number
  emissive?: string | number
  emissiveIntensity?: number
}

/** Builds one body's materials and fades them all together for the death dissolve. */
export class MatBag {
  private readonly mats: MeshStandardMaterial[] = []

  make(opts: BodyMatOpts): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({
      map: sharedTexture(opts.map, opts.repeat ?? 1),
      color: new Color(opts.tint),
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      transparent: true,
    })
    if (opts.normal) {
      mat.normalMap = sharedTexture(opts.normal, opts.repeat ?? 1, false)
      mat.normalScale.setScalar(opts.normalScale ?? 0.5)
    }
    if (opts.emissive !== undefined) {
      mat.emissive = new Color(opts.emissive)
      mat.emissiveIntensity = opts.emissiveIntensity ?? 0.5
    }
    this.mats.push(mat)
    return mat
  }

  setFade(fade: number): void {
    for (const mat of this.mats) mat.opacity = fade
  }
}

/**
 * A body part's local frame: a pivot Group placed at a Blender-space origin whose
 * children are given in ABSOLUTE build.py coordinates, so limb transcriptions copy the
 * Python numbers verbatim while still articulating around the pivot.
 */
export class PartFrame {
  private constructor(
    readonly node: Group,
    private readonly ox: number,
    private readonly oy: number,
    private readonly oz: number,
  ) {}

  static at(parent: Object3D, ox: number, oy: number, oz: number): PartFrame {
    const node = new Group()
    node.position.copy(bl(ox, oy, oz))
    parent.add(node)
    return new PartFrame(node, ox, oy, oz)
  }

  /** A child frame (knee, elbow) of this one, again at absolute Blender coords. */
  child(ox: number, oy: number, oz: number): PartFrame {
    const node = new Group()
    node.position.copy(bl(ox - this.ox, oy - this.oy, oz - this.oz))
    this.node.add(node)
    return new PartFrame(node, ox, oy, oz)
  }

  private rel(x: number, y: number, z: number): Vector3 {
    return bl(x - this.ox, y - this.oy, z - this.oz)
  }

  /** Metaball-style ball; optional Blender-axis ellipsoid scale (sx, sy, sz). */
  ball(
    mat: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    r: number,
    opts: { scale?: readonly [number, number, number]; rot?: readonly [number, number, number]; segments?: number } = {},
  ): Mesh {
    const segments = opts.segments ?? 12
    const mesh = new Mesh(new SphereGeometry(r, segments, Math.max(6, Math.round(segments * 0.75))), mat)
    mesh.position.copy(this.rel(x, y, z))
    if (opts.scale) mesh.scale.set(opts.scale[0], opts.scale[2], opts.scale[1])
    if (opts.rot) {
      // Blender euler to three: X stays, Y becomes -Z, Z becomes Y (fine for small angles)
      mesh.rotation.set(opts.rot[0], opts.rot[2], -opts.rot[1])
    }
    mesh.castShadow = true
    this.node.add(mesh)
    return mesh
  }

  /**
   * add_chain equivalent: a tapered capsule from a to b (absolute Blender coords),
   * cylinder plus sphere caps, reading like the metaball chain it replaces.
   */
  chain(
    mat: MeshStandardMaterial,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    r0: number,
    r1: number,
    radial = 12,
  ): Mesh {
    const a = this.rel(ax, ay, az)
    const b = this.rel(bx, by, bz)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const cyl = new Mesh(new CylinderGeometry(r1, r0, len, radial, 1, true), mat)
    cyl.position.copy(a).addScaledVector(dir, 0.5)
    cyl.quaternion.setFromUnitVectors(UP, dir.normalize())
    cyl.castShadow = true
    const capA = new Mesh(new SphereGeometry(r0, radial, Math.max(6, Math.round(radial * 0.75))), mat)
    capA.position.copy(a)
    capA.castShadow = true
    const capB = new Mesh(new SphereGeometry(r1, radial, Math.max(6, Math.round(radial * 0.75))), mat)
    capB.position.copy(b)
    capB.castShadow = true
    this.node.add(cyl, capA, capB)
    return cyl
  }

  /** add_box equivalent: dims are Blender (dx, dy, dz). */
  box(
    mat: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    dims: readonly [number, number, number],
    rot?: readonly [number, number, number],
  ): Mesh {
    const mesh = new Mesh(new BoxGeometry(dims[0], dims[2], dims[1]), mat)
    mesh.position.copy(this.rel(x, y, z))
    if (rot) mesh.rotation.set(rot[0], rot[2], -rot[1])
    mesh.castShadow = true
    this.node.add(mesh)
    return mesh
  }

  /** An invisible anchor at absolute Blender coords, for Weak Point glow placement. */
  anchor(x: number, y: number, z: number): Group {
    const group = new Group()
    group.position.copy(this.rel(x, y, z))
    this.node.add(group)
    return group
  }
}

const UP = new Vector3(0, 1, 0)

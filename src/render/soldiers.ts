import {
  AnimationAction,
  AnimationMixer,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RepeatWrapping,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { EYE_HEIGHT } from '../sim/constants'
import type { RemoteSoldier } from '../sim/coopClient'

const loader = new TextureLoader()

// galvanized wire rope (ambientCG Rope002, CC0); one cylinder spans the full wire, so v repeats high
const ropeTexture = loader.load('/textures/wire-rope.jpg')
ropeTexture.colorSpace = SRGBColorSpace
ropeTexture.wrapS = ropeTexture.wrapT = RepeatWrapping
ropeTexture.repeat.set(0.5, 24)
const ropeMat = new MeshStandardMaterial({ map: ropeTexture, color: 0xd8dde2, roughness: 0.38, metalness: 0.55 })

// KayKit Adventurers Rogue_Hooded (CC0, see README credits): hooded cape reads Survey Corps,
// the dual knives pass as ODM blades. Crossbows and throwables are hidden at attach time.
const RECRUIT_URL = '/models/kaykit/rogue_hooded.glb'
const HIDDEN_PROPS = new Set(['1H_Crossbow', '2H_Crossbow', 'Throwable'])
// the bind pose stands 2.25 units from sole to hood tip
const MODEL_HEIGHT = 2.25
// Running_A is authored around a 4 m/s jog; timeScale stretches it to the sim's actual speed
const RUN_CLIP_SPEED = 4

let recruitPromise: Promise<GLTF> | null = null
function loadRecruit(): Promise<GLTF> {
  recruitPromise ??= new GLTFLoader().loadAsync(RECRUIT_URL)
  return recruitPromise
}

// per-teammate tint layered over the sourced atlas (texture rule): muted field-kit shades
const TINTS = [0xffffff, 0xd7e0cc, 0xe4d8c2, 0xcdd7df]

/** Live-tunable recruit look; the dev playground drives this through setRecruitStyle. */
export interface RecruitStyle {
  /** sole-to-hood-tip height in metres (player eyes sit at 1.7) */
  height: number
  /** hex tint layered over the atlas for every recruit, or null for the per-name palette */
  tint: string | null
}

const recruitStyle: RecruitStyle = { height: 2.5, tint: null }
const liveVisuals = new Set<SoldierVisual>()

export function getRecruitStyle(): RecruitStyle {
  return { ...recruitStyle }
}

export function setRecruitStyle(patch: Partial<RecruitStyle>): void {
  Object.assign(recruitStyle, patch)
  for (const visual of liveVisuals) visual.applyStyle()
}

function nameHash(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0
  return h
}

function nameSprite(name: string): Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = '600 64px Cinzel, Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 12
  ctx.fillStyle = '#e9dcc0'
  ctx.fillText(name.toUpperCase(), 256, 64)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.scale.set(3.4, 0.85, 1)
  sprite.renderOrder = 5
  return sprite
}

const UP = new Vector3(0, 1, 0)

type Pose = 'idle' | 'walk' | 'run' | 'air'

class SoldierVisual {
  readonly group = new Group()
  private readonly ropes: [Mesh, Mesh]
  private readonly paletteTint: Color
  private readonly tag: Sprite
  private rig: Object3D | null = null
  private tintedMats: { material: MeshStandardMaterial; baseColor: Color }[] = []
  private mixer: AnimationMixer | null = null
  private actions: Record<Pose, AnimationAction> | null = null
  private pose: Pose = 'idle'
  private disposed = false

  constructor(name: string, scene: Scene) {
    this.paletteTint = new Color(TINTS[nameHash(name) % TINTS.length]!)

    this.tag = nameSprite(name)
    this.group.add(this.tag)

    void loadRecruit().then((gltf) => this.attachRig(gltf))

    this.ropes = [
      new Mesh(new CylinderGeometry(0.02, 0.02, 1, 5), ropeMat),
      new Mesh(new CylinderGeometry(0.02, 0.02, 1, 5), ropeMat),
    ]
    for (const rope of this.ropes) {
      rope.visible = false
      scene.add(rope)
    }
    scene.add(this.group)
    liveVisuals.add(this)
    this.applyStyle()
  }

  private attachRig(gltf: GLTF): void {
    if (this.disposed) return
    const rig = cloneSkeleton(gltf.scene) as Object3D

    const tinted = new Map<string, MeshStandardMaterial>()
    rig.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      if (HIDDEN_PROPS.has(obj.name)) {
        obj.visible = false
        return
      }
      obj.castShadow = true
      const source = obj.material as MeshStandardMaterial
      let material = tinted.get(source.uuid)
      if (!material) {
        material = source.clone()
        tinted.set(source.uuid, material)
        this.tintedMats.push({ material, baseColor: source.color.clone() })
      }
      obj.material = material
    })
    this.rig = rig
    this.group.add(rig)

    this.mixer = new AnimationMixer(rig)
    const action = (clip: string): AnimationAction => {
      const found = gltf.animations.find((a) => a.name === clip)
      if (!found) throw new Error(`recruit model is missing the "${clip}" clip`)
      return this.mixer!.clipAction(found)
    }
    this.actions = {
      idle: action('Idle'),
      walk: action('Walking_A'),
      run: action('Running_A'),
      air: action('Jump_Idle'),
    }
    this.actions[this.pose].play()
    this.applyStyle()
  }

  /** Re-applies the shared RecruitStyle (height + tint) to this visual. */
  applyStyle(): void {
    this.tag.position.y = recruitStyle.height + 0.45
    if (this.rig) this.rig.scale.setScalar(recruitStyle.height / MODEL_HEIGHT)
    const tint = recruitStyle.tint ? new Color(recruitStyle.tint) : this.paletteTint
    for (const { material, baseColor } of this.tintedMats) {
      material.color.copy(baseColor).multiply(tint)
    }
  }

  private setPose(next: Pose): void {
    if (!this.actions || this.pose === next) return
    const from = this.actions[this.pose]
    const to = this.actions[next]
    to.reset().play()
    from.crossFadeTo(to, 0.2, false)
    this.pose = next
  }

  sync(s: RemoteSoldier, dt: number): void {
    this.group.visible = s.alive
    this.group.position.set(s.pos.x, s.pos.y - EYE_HEIGHT, s.pos.z)
    this.group.rotation.y = s.yaw

    const speed = Math.hypot(s.vel.x, s.vel.z)
    if (!s.onGround) {
      this.setPose('air')
      // flying: lean into the velocity
      this.group.rotation.x = Math.min(0.6, speed * 0.015)
    } else if (speed > 0.5) {
      this.setPose(speed > 5 ? 'run' : 'walk')
      this.group.rotation.x = 0.05
    } else {
      this.setPose('idle')
      this.group.rotation.x = 0
    }
    if (this.actions) {
      // stride keeps pace with the sim's actual ground speed
      this.actions.run.timeScale = Math.min(1.6, Math.max(0.6, speed / RUN_CLIP_SPEED))
    }
    this.mixer?.update(dt)

    // rope anchor rides the visual chest, which scales with the styled height
    const chest = new Vector3(s.pos.x, s.pos.y - EYE_HEIGHT + recruitStyle.height * 0.55, s.pos.z)
    for (const side of [0, 1] as const) {
      const rope = this.ropes[side]!
      const anchor = s.hooks[side]
      if (!anchor || !s.alive) {
        rope.visible = false
        continue
      }
      const end = new Vector3(anchor.x, anchor.y, anchor.z)
      const dir = end.clone().sub(chest)
      const length = dir.length()
      if (length < 0.1) {
        rope.visible = false
        continue
      }
      rope.visible = true
      rope.position.copy(chest).addScaledVector(dir, 0.5)
      rope.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.normalize()))
      rope.scale.set(1, length, 1)
    }
  }

  dispose(scene: Scene): void {
    this.disposed = true
    liveVisuals.delete(this)
    scene.remove(this.group)
    for (const rope of this.ropes) scene.remove(rope)
  }
}

/** Mirrors the RemoteSoldier map into scene visuals, teammate by teammate. */
export class SoldierPool {
  private visuals = new Map<string, SoldierVisual>()

  constructor(private scene: Scene) {}

  sync(soldiers: Map<string, RemoteSoldier>, dt: number): void {
    for (const [id, soldier] of soldiers) {
      let visual = this.visuals.get(id)
      if (!visual) {
        visual = new SoldierVisual(id, this.scene)
        this.visuals.set(id, visual)
      }
      visual.sync(soldier, dt)
    }
    for (const [id, visual] of this.visuals) {
      if (!soldiers.has(id)) {
        visual.dispose(this.scene)
        this.visuals.delete(id)
      }
    }
  }

  clear(): void {
    for (const visual of this.visuals.values()) visual.dispose(this.scene)
    this.visuals.clear()
  }
}

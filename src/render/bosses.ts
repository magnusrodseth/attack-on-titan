import {
  Box3,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { BossFight } from '../sim/boss'
import { bossPartCenter, steamRadius } from '../sim/boss'
import type { GameState } from '../sim/game'
import type { TitanState } from '../sim/titan'
import { makeWeakPoint, makeWeakPointMats, TitanVisual } from './titans'

const textureLoader = new TextureLoader()

// The statue glbs carry flat Blender colors. Shipping them anyway is a user-decided,
// dated exception to the texture mandate (2026-07-13, recorded in CLAUDE.md): the boss
// silhouettes go live now, the CC0 texture/bake pass follows as polish (ticket 009).

/**
 * The Shifter's body and fight FX, driven straight from GameState.boss each frame.
 *
 * Body: the statue glb named after the spec (public/models/<spec-id>.glb, the contract
 * with the Blender modeling session) with procedural root motion — glide, bob, chase
 * lean, stagger reel, death topple — since the statues carry no rig. Until the glb
 * resolves (or if it is missing), the existing capsule-limb TitanVisual walks instead,
 * with its nape/heel glows muted: a Shifter advertises only its lit Weak Point.
 *
 * FX, all within the texture rule: the lit-part bloom reuses the nape indicator style
 * (accepted exception), boulders wear the credited rock texture, spike telegraphs are
 * gameplay indicator glows, and the steam is a transient cloud-sprite effect.
 */
export class BossFxView {
  private fightTitanId: number | null = null
  private rig: TitanVisual | null = null
  private glb: Group | null = null
  private glbBaseY = 0
  private walkPhase = 0
  private lastPos = { x: 0, z: 0 }

  private readonly weakMats = makeWeakPointMats()
  private readonly glow: Group
  private readonly boulders = new Map<number, Mesh>()
  private boulderMat: MeshStandardMaterial | null = null
  private readonly spikeRings: Mesh[] = []
  private readonly spikeMat = new MeshBasicMaterial({
    color: 0xff7a3c,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  private readonly steam: Sprite[] = []
  private steamMat: SpriteMaterial | null = null

  private static glbCache = new Map<string, Promise<Group | null>>()

  constructor(private scene: Scene) {
    this.glow = makeWeakPoint(this.weakMats, 0.4, 0.15)
    this.glow.visible = false
    scene.add(this.glow)
  }

  sync(game: GameState, dt: number): void {
    const fight = game.boss
    const alive = fight !== null && fight.titan.hp > 0
    const fading = fight !== null && fight.titan.state === 'dead' && fight.titan.stateTime < 3.2

    if (!fight || (!alive && !fading)) {
      this.clearBody()
      this.glow.visible = false
      this.clearBoulders()
      this.clearSpikes()
      this.setSteam(null, 0)
      return
    }

    this.syncBody(fight, dt)
    this.syncGlow(fight)
    this.syncBoulders(fight)
    this.syncSpikes(fight)
    this.setSteam(fight.state.steamOn && alive ? fight.titan : null, dt)
  }

  // --- body -------------------------------------------------------------------

  private syncBody(fight: BossFight, dt: number): void {
    const t = fight.titan
    if (this.fightTitanId !== t.id) {
      this.clearBody()
      this.fightTitanId = t.id
      this.walkPhase = 0
      this.lastPos = { x: t.pos.x, z: t.pos.z }
      this.rig = new TitanVisual(t)
      // the capsule rig advertises nape and heels; a Shifter sells only its lit part
      this.rig.group.traverse((obj) => {
        if (obj instanceof Sprite) obj.visible = false
      })
      this.rig.addTo(this.scene)
      this.loadGlb(fight)
    }
    if (this.glb) this.driveStatue(fight, dt)
    else if (this.rig) this.rig.syncPose(t, dt)
  }

  private loadGlb(fight: BossFight): void {
    const specId = fight.spec.id
    let pending = BossFxView.glbCache.get(specId)
    if (!pending) {
      pending = new GLTFLoader()
        .loadAsync(`/models/${specId}.glb`)
        .then((gltf) => {
          const root = gltf.scene
          root.traverse((obj) => {
            if (obj instanceof Mesh) {
              obj.castShadow = true
              obj.receiveShadow = true
              for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
                mat.transparent = true // the death dissolve fades the statue out
              }
            }
          })
          return root
        })
        .catch(() => null) // model not delivered yet: the capsule rig stays on duty
      BossFxView.glbCache.set(specId, pending)
    }
    pending.then((template) => {
      // the fight may be long over (or replaced) by the time the model arrives
      if (!template || this.fightTitanId !== fight.titan.id) return
      const root = template.clone(true)
      root.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.material = Array.isArray(obj.material)
            ? obj.material.map((m) => m.clone())
            : obj.material.clone()
        }
      })
      // statues export facing +Z with feet at y=0, but heights may drift: fit to the sim
      const box = new Vector3()
      root.updateMatrixWorld(true)
      const bounds = new Box3().setFromObject(root)
      bounds.getSize(box)
      const fit = box.y > 0.01 ? fight.titan.height / box.y : 1
      root.scale.multiplyScalar(fit)
      this.glbBaseY = -bounds.min.y * fit
      if (this.rig) {
        this.rig.removeFrom(this.scene)
        this.rig = null
      }
      this.glb = root
      this.scene.add(root)
    })
  }

  /** Root motion for an unrigged statue: glide, bob, lean, reel, and the final topple. */
  private driveStatue(fight: BossFight, dt: number): void {
    const t = fight.titan
    const root = this.glb!
    root.position.set(t.pos.x, t.pos.y + this.glbBaseY, t.pos.z)
    root.rotation.set(0, t.facing, 0)

    if (t.state === 'dead') {
      const fall = Math.min(1, t.stateTime / 0.9)
      root.rotation.x = (Math.PI / 2) * (1 - (1 - fall) * (1 - fall))
      const fade = Math.max(0, 1 - Math.max(0, t.stateTime - 1) / 2)
      root.traverse((obj) => {
        if (obj instanceof Mesh) {
          for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
            mat.opacity = fade
          }
        }
      })
      root.visible = fade > 0.01
      return
    }

    const moved = Math.hypot(t.pos.x - this.lastPos.x, t.pos.z - this.lastPos.z)
    this.lastPos = { x: t.pos.x, z: t.pos.z }
    const speed = dt > 0 ? moved / dt : 0
    this.walkPhase += speed * dt * 1.6
    root.position.y += Math.abs(Math.sin(this.walkPhase)) * t.height * 0.012

    if (t.state === 'staggered') {
      root.rotation.x = -0.08 + Math.sin(performance.now() * 0.035) * 0.015
    } else if (t.state === 'chase') {
      root.rotation.x = 0.05
    }
  }

  private clearBody(): void {
    if (this.rig) {
      this.rig.removeFrom(this.scene)
      this.rig = null
    }
    if (this.glb) {
      this.scene.remove(this.glb)
      this.glb = null
    }
    this.fightTitanId = null
  }

  // --- the lit Weak Point -------------------------------------------------------

  private syncGlow(fight: BossFight): void {
    const t = fight.titan
    const partSpec = fight.spec.parts[fight.state.phase]
    if (t.hp <= 0 || !partSpec) {
      this.glow.visible = false
      return
    }
    this.glow.visible = true
    this.glow.position.copy(bossPartCenter(t, partSpec))
    this.glow.scale.setScalar(t.height)
    const part = fight.state.parts[fight.state.phase]!
    const pulse = Math.sin(performance.now() * 0.005)
    // plated parts glow cold steel-blue until cracked; flesh burns the usual red
    this.weakMats.glow.color.setHex(part.plated ? 0x9fc9ff : 0xff2a1a)
    this.weakMats.stain.color.setHex(part.plated ? 0x7fa8dd : 0xc11414)
    this.weakMats.glow.opacity = 0.75 + pulse * 0.25
    this.weakMats.stain.opacity = 0.55 + pulse * 0.15
  }

  // --- boulders -------------------------------------------------------------------

  private syncBoulders(fight: BossFight): void {
    const live = new Set<number>()
    for (const proj of fight.state.projectiles) {
      live.add(proj.id)
      let mesh = this.boulders.get(proj.id)
      if (!mesh) {
        this.boulderMat ??= new MeshStandardMaterial({
          map: rockTexture(),
          roughness: 0.95,
        })
        mesh = new Mesh(new IcosahedronGeometry(1.7, 1), this.boulderMat)
        mesh.castShadow = true
        this.scene.add(mesh)
        this.boulders.set(proj.id, mesh)
      }
      mesh.position.copy(proj.pos)
      mesh.rotation.x += 0.11
      mesh.rotation.z += 0.07
    }
    for (const [id, mesh] of this.boulders) {
      if (!live.has(id)) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        this.boulders.delete(id)
      }
    }
  }

  private clearBoulders(): void {
    for (const mesh of this.boulders.values()) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
    }
    this.boulders.clear()
  }

  // --- war hammer spike telegraphs ---------------------------------------------

  private syncSpikes(fight: BossFight): void {
    while (this.spikeRings.length < fight.state.pendingSpikes.length) {
      const ring = new Mesh(new RingGeometry(2.6, 4, 28), this.spikeMat)
      ring.rotation.x = -Math.PI / 2
      this.scene.add(ring)
      this.spikeRings.push(ring)
    }
    for (const [i, ring] of this.spikeRings.entries()) {
      const spike = fight.state.pendingSpikes[i]
      ring.visible = spike !== undefined
      if (!spike) continue
      ring.position.set(spike.x, 0.1, spike.z)
      const urgency = 1 - Math.min(1, Math.max(0, spike.timer) / 0.9)
      ring.scale.setScalar(1 - urgency * 0.45) // the ring tightens as the strike nears
    }
  }

  private clearSpikes(): void {
    for (const ring of this.spikeRings) {
      this.scene.remove(ring)
      ring.geometry.dispose()
    }
    this.spikeRings.length = 0
  }

  // --- colossus steam --------------------------------------------------------------

  private setSteam(titan: TitanState | null, dt: number): void {
    if (!titan) {
      for (const sprite of this.steam) sprite.visible = false
      return
    }
    if (this.steam.length === 0) {
      this.steamMat = new SpriteMaterial({
        map: cloudTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
      for (let i = 0; i < 6; i++) {
        const sprite = new Sprite(this.steamMat)
        this.scene.add(sprite)
        this.steam.push(sprite)
      }
    }
    const radius = steamRadius(titan) * 0.8
    const now = performance.now() * 0.0002
    for (const [i, sprite] of this.steam.entries()) {
      const angle = now + (i / this.steam.length) * Math.PI * 2
      sprite.visible = true
      sprite.position.set(
        titan.pos.x + Math.cos(angle) * radius * 0.7,
        titan.pos.y + titan.height * (0.15 + 0.12 * Math.sin(angle * 3 + i)),
        titan.pos.z + Math.sin(angle) * radius * 0.7,
      )
      const puff = radius * (0.9 + 0.2 * Math.sin(now * 7 + i * 2))
      sprite.scale.set(puff, puff * 0.8, 1)
    }
    if (this.steamMat) {
      this.steamMat.opacity = 0.42 + 0.1 * Math.sin(performance.now() * 0.003)
    }
    void dt
  }
}

let rockTex: ReturnType<TextureLoader['load']> | null = null
function rockTexture() {
  if (!rockTex) {
    rockTex = textureLoader.load('/textures/rock.jpg')
    rockTex.wrapS = rockTex.wrapT = RepeatWrapping
    rockTex.colorSpace = SRGBColorSpace
  }
  return rockTex
}

let cloudTex: ReturnType<TextureLoader['load']> | null = null
function cloudTexture() {
  if (!cloudTex) {
    cloudTex = textureLoader.load('/textures/cloud1.png')
    cloudTex.colorSpace = SRGBColorSpace
  }
  return cloudTex
}

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Scene,
  TorusGeometry,
  Vector3,
} from 'three'
import type { GameState } from '../sim/game'

/**
 * Signal Run course markers (wayfinder tt-004). Three signal-flare smoke columns — green
 * on the gate you must take, dim yellow on the one after (line planning), red burning on
 * the finish — plus a glowing ring at pass height on the active gate. All of it is
 * transient particles and gameplay indicator glow: the two accepted texture-rule
 * exceptions. Rigs are built once and recycled; nothing allocates per frame.
 */
const COLUMN_HEIGHT = 240 // m of smoke: read the sky, not the streets
const SMOKE_COUNT = 110 // particles per column
const RISE_SPEED = 26 // m/s upward drift

const GREEN = new Color(0x37e06b)
const YELLOW = new Color(0xe8c545)
const RED = new Color(0xe8402f)

/** Soft radial puff so smoke reads as smoke, not squares (transient-FX exception). */
function smokeSprite(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.4)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  return new CanvasTexture(canvas)
}

interface FlareRig {
  beam: Mesh
  beamMat: MeshBasicMaterial
  smoke: Points
  smokeMat: PointsMaterial
  seeds: Float32Array // per-particle phase/jitter, fixed at construction
  gate: Vector3
}

export class GatesView {
  private rigs: [FlareRig, FlareRig, FlareRig] // active, next-after, finish
  private ring: Mesh
  private ringMat: MeshBasicMaterial
  private sprite = smokeSprite()

  constructor(private scene: Scene) {
    this.rigs = [this.makeFlare(), this.makeFlare(), this.makeFlare()]
    // the pass ring: pure indicator glow at pass height on the active gate
    this.ringMat = new MeshBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false, // signal flares outshine any fog, above ground or under it
    })
    this.ring = new Mesh(new TorusGeometry(1, 0.22, 10, 44), this.ringMat)
    this.ring.visible = false
    this.ring.frustumCulled = false
    scene.add(this.ring)
  }

  private makeFlare(): FlareRig {
    const beamMat = new MeshBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.14,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    // open-ended cone of light, wider at the top like a smoke plume catching sun
    const beam = new Mesh(new CylinderGeometry(2.6, 0.9, COLUMN_HEIGHT, 10, 1, true), beamMat)
    beam.visible = false
    beam.frustumCulled = false
    this.scene.add(beam)

    const positions = new Float32Array(SMOKE_COUNT * 3)
    const seeds = new Float32Array(SMOKE_COUNT * 3)
    for (let i = 0; i < SMOKE_COUNT; i++) {
      seeds[i * 3] = Math.random() // height phase 0..1
      seeds[i * 3 + 1] = Math.random() * Math.PI * 2 // drift angle
      seeds[i * 3 + 2] = 0.5 + Math.random() // drift radius factor
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    const smokeMat = new PointsMaterial({
      color: GREEN,
      size: 4.6,
      map: this.sprite,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const smoke = new Points(geometry, smokeMat)
    smoke.visible = false
    smoke.frustumCulled = false
    this.scene.add(smoke)

    return { beam, beamMat, smoke, smokeMat, seeds, gate: new Vector3() }
  }

  private showFlare(rig: FlareRig, gate: { x: number; y: number; z: number }, color: Color, dim: number): void {
    rig.gate.set(gate.x, gate.y, gate.z)
    rig.beam.position.set(gate.x, COLUMN_HEIGHT / 2, gate.z)
    rig.beam.visible = true
    rig.beamMat.color.copy(color)
    rig.beamMat.opacity = 0.14 * dim
    rig.smoke.visible = true
    rig.smokeMat.color.copy(color)
    rig.smokeMat.opacity = 0.55 * dim
  }

  private animateFlare(rig: FlareRig, time: number): void {
    if (!rig.smoke.visible) return
    const attr = rig.smoke.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const phase = rig.seeds[i * 3]!
      const angle = rig.seeds[i * 3 + 1]!
      const drift = rig.seeds[i * 3 + 2]!
      const y = ((phase * COLUMN_HEIGHT + time * RISE_SPEED) % COLUMN_HEIGHT)
      const spread = 0.7 + (y / COLUMN_HEIGHT) * 3.2 * drift // widens as it climbs
      const wobble = angle + y * 0.02 + time * 0.35
      attr.setXYZ(
        i,
        rig.gate.x + Math.cos(wobble) * spread,
        y,
        rig.gate.z + Math.sin(wobble) * spread,
      )
    }
    attr.needsUpdate = true
  }

  /** Drives everything from race state; call once per frame with seconds. */
  sync(game: GameState, time: number): void {
    const race = game.race
    const active = race && game.phase === 'playing' ? race.course.gates[race.nextGate] : undefined
    if (!race || !active) {
      for (const rig of this.rigs) {
        rig.beam.visible = false
        rig.smoke.visible = false
      }
      this.ring.visible = false
      return
    }

    const gates = race.course.gates
    const finish = gates[gates.length - 1]!
    const activeIsFinish = race.nextGate === gates.length - 1
    const after = activeIsFinish ? undefined : gates[race.nextGate + 1]
    const afterIsFinish = race.nextGate + 1 === gates.length - 1

    this.showFlare(this.rigs[0], active, activeIsFinish ? RED : GREEN, 1)
    if (after && !afterIsFinish) this.showFlare(this.rigs[1], after, YELLOW, 0.45)
    else {
      this.rigs[1].beam.visible = false
      this.rigs[1].smoke.visible = false
    }
    if (!activeIsFinish) this.showFlare(this.rigs[2], finish, RED, 0.6)
    else {
      this.rigs[2].beam.visible = false
      this.rigs[2].smoke.visible = false
    }
    for (const rig of this.rigs) this.animateFlare(rig, time)

    // the ring hangs at pass height on the active gate, facing the line of approach
    const prev = race.nextGate > 0 ? gates[race.nextGate - 1]! : race.course.start
    this.ring.visible = true
    this.ring.position.set(active.x, active.y, active.z)
    const approach = new Vector3(active.x - prev.x, 0, active.z - prev.z)
    if (approach.lengthSq() < 1e-6) approach.set(0, 0, 1)
    this.ring.lookAt(this.ring.position.clone().add(approach))
    const scale = active.radius * (1 + 0.05 * Math.sin(time * 4.2))
    this.ring.scale.set(scale, scale, scale)
    this.ringMat.color.copy(activeIsFinish ? RED : GREEN)
    this.ringMat.opacity = 0.75 + 0.2 * Math.sin(time * 4.2)
  }
}

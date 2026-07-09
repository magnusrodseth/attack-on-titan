import { Camera, Object3D, Scene, SpotLight, Vector3 } from 'three'

/**
 * First-person flashlight: a warm, soft-edged cone that rides the camera and points
 * where the player looks. Purely a renderer — when it lights and how much battery
 * remains live in the sim (src/sim/flashlight.ts) and arrive here as one 0..1 glow.
 * The heavy penumbra is what makes it a smooth pool of light instead of a hard disc.
 */
const MAX_INTENSITY = 220
const CONE_ANGLE = 0.5
const PENUMBRA = 0.9 // nearly all penumbra: the pool of light dissolves at its edge
const REACH = 110

export class FlashlightBeam {
  private readonly light: SpotLight
  private readonly aim = new Object3D()
  private readonly forward = new Vector3()

  constructor(scene: Scene) {
    this.light = new SpotLight(0xffdfae, 0, REACH, CONE_ANGLE, PENUMBRA, 1.1)
    this.light.castShadow = false // one shadow map belongs to the sun/moon; this cone is fill
    this.light.visible = false
    this.light.target = this.aim
    scene.add(this.light, this.aim)
  }

  update(camera: Camera, glow: number, timeMs: number): void {
    const lit = glow > 0.001
    this.light.visible = lit
    if (!lit) return
    // a dying battery gutters rather than dimming cleanly — the warning is diegetic
    const flicker = glow < 0.5 ? 0.85 + 0.15 * Math.sin(timeMs * 0.021) * Math.sin(timeMs * 0.0077) : 1
    this.light.intensity = MAX_INTENSITY * glow * flicker
    this.light.position.copy(camera.position)
    camera.getWorldDirection(this.forward)
    this.aim.position.copy(camera.position).addScaledVector(this.forward, 40)
  }
}

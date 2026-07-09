import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  CylinderGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three'
import type { PlayerState } from '../sim/player'

const STREAK_COUNT = 46
const ROPE_UP = new Vector3(0, 1, 0)

export class Effects {
  private ropes: [Mesh, Mesh]
  private streaks: LineSegments
  private streakOffsets: Vector3[] = []
  private streakMat: LineBasicMaterial
  private bursts: Array<{ points: Points; vels: Vector3[]; life: number }> = []
  private shake = 0

  constructor(private scene: Scene) {
    this.ropes = [this.makeRope(), this.makeRope()]

    const positions = new Float32Array(STREAK_COUNT * 6)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    this.streakMat = new LineBasicMaterial({
      color: 0xdfefff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    this.streaks = new LineSegments(geometry, this.streakMat)
    this.streaks.frustumCulled = false
    scene.add(this.streaks)
    for (let i = 0; i < STREAK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 2.5 + Math.random() * 5
      this.streakOffsets.push(
        new Vector3(Math.cos(angle) * radius, (Math.random() - 0.5) * 7, Math.sin(angle) * radius),
      )
    }
  }

  private makeRope(): Mesh {
    // a unit cylinder stretched between hand and anchor each frame: cable with volume
    const rope = new Mesh(
      new CylinderGeometry(0.016, 0.016, 1, 6, 1, true),
      new MeshStandardMaterial({ color: 0x241f1a, roughness: 0.6, metalness: 0.4 }),
    )
    rope.frustumCulled = false
    rope.visible = false
    this.scene.add(rope)
    return rope
  }

  syncRopes(player: PlayerState, camera: Camera): void {
    player.hooks.forEach((hook, i) => {
      const rope = this.ropes[i]!
      if (hook.state !== 'attached') {
        rope.visible = false
        return
      }
      rope.visible = true
      const hand = new Vector3(i === 0 ? -0.35 : 0.35, -0.32, -0.5)
      camera.localToWorld(hand)
      const span = new Vector3().subVectors(hook.anchor, hand)
      const length = Math.max(span.length(), 0.01)
      rope.position.copy(hand).addScaledVector(span, 0.5)
      rope.scale.set(1, length, 1)
      rope.quaternion.setFromUnitVectors(ROPE_UP, span.divideScalar(length))
    })
  }

  burst(pos: Vector3, color: number, count = 34): void {
    const positions = new Float32Array(count * 3)
    const vels: Vector3[] = []
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x
      positions[i * 3 + 1] = pos.y
      positions[i * 3 + 2] = pos.z
      vels.push(
        new Vector3(
          (Math.random() - 0.5) * 22,
          Math.random() * 16,
          (Math.random() - 0.5) * 22,
        ),
      )
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    const points = new Points(
      geometry,
      new PointsMaterial({ color, size: 0.5, transparent: true, opacity: 1, depthWrite: false }),
    )
    points.frustumCulled = false
    this.scene.add(points)
    this.bursts.push({ points, vels, life: 0.9 })
  }

  addShake(intensity: number): void {
    this.shake = Math.max(this.shake, intensity)
  }

  /** Call after the camera has been positioned; applies decaying shake. */
  applyShake(camera: Camera): void {
    if (this.shake <= 0.001) return
    camera.position.x += (Math.random() - 0.5) * this.shake
    camera.position.y += (Math.random() - 0.5) * this.shake
    camera.position.z += (Math.random() - 0.5) * this.shake
  }

  update(dt: number, camera: Camera, playerVel: Vector3): void {
    this.shake *= Math.exp(-9 * dt)

    // kill bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!
      burst.life -= dt
      const attr = burst.points.geometry.getAttribute('position') as BufferAttribute
      for (let j = 0; j < burst.vels.length; j++) {
        const vel = burst.vels[j]!
        vel.y -= 26 * dt
        attr.setXYZ(j, attr.getX(j) + vel.x * dt, attr.getY(j) + vel.y * dt, attr.getZ(j) + vel.z * dt)
      }
      attr.needsUpdate = true
      ;(burst.points.material as PointsMaterial).opacity = Math.max(0, burst.life / 0.9)
      if (burst.life <= 0) {
        this.scene.remove(burst.points)
        burst.points.geometry.dispose()
        this.bursts.splice(i, 1)
      }
    }

    // wind streaks: only at speed, aligned with velocity
    const speed = playerVel.length()
    const strength = Math.min(1, Math.max(0, (speed - 16) / 42))
    this.streakMat.opacity = strength * 0.45
    this.streaks.visible = strength > 0.01
    if (this.streaks.visible) {
      const dir = playerVel.clone().normalize()
      const attr = this.streaks.geometry.getAttribute('position') as BufferAttribute
      const time = performance.now() * 0.001
      for (let i = 0; i < STREAK_COUNT; i++) {
        const offset = this.streakOffsets[i]!
        const slide = ((time * speed * 0.7 + i * 3.1) % 26) - 13
        const base = new Vector3()
          .copy(camera.position)
          .add(offset)
          .addScaledVector(dir, -slide)
        const tip = base.clone().addScaledVector(dir, -(0.8 + speed * 0.055))
        attr.setXYZ(i * 2, base.x, base.y, base.z)
        attr.setXYZ(i * 2 + 1, tip.x, tip.y, tip.z)
      }
      attr.needsUpdate = true
    }
  }
}

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import type { PlayerState } from '../sim/player'

const STREAK_COUNT = 46
const ROPE_UP = new Vector3(0, 1, 0)
const ROPE_SEGMENTS = 12
const HOOK_FLIGHT_SPEED = 300 // m/s visual travel of the grapple head

interface RopeVisual {
  segments: Mesh[]
  head: Group
  flight: number // 0..1 launch progress; 1 = landed
  wobble: number // decaying cable oscillation energy
}

export class Effects {
  private ropes: [RopeVisual, RopeVisual]
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

  private makeRope(): RopeVisual {
    // segmented steel cable so it can bow and "boing" during hook flight
    const cableTexture = new TextureLoader().load('/textures/metal.jpg')
    cableTexture.colorSpace = SRGBColorSpace
    cableTexture.wrapS = cableTexture.wrapT = RepeatWrapping
    cableTexture.repeat.set(0.25, 4)
    const cableMat = new MeshStandardMaterial({
      map: cableTexture,
      color: 0x8a8072,
      roughness: 0.55,
      metalness: 0.5,
    })
    const geometry = new CylinderGeometry(0.016, 0.016, 1, 6, 1, true)
    const segments: Mesh[] = []
    for (let i = 0; i < ROPE_SEGMENTS; i++) {
      const segment = new Mesh(geometry, cableMat)
      segment.frustumCulled = false
      segment.visible = false
      this.scene.add(segment)
      segments.push(segment)
    }

    // AoT grapple head: central spike with three back-swept barbs
    const head = new Group()
    const headMat = new MeshStandardMaterial({
      map: cableTexture,
      color: 0x71767c,
      metalness: 0.65,
      roughness: 0.4,
    })
    const spike = new Mesh(new ConeGeometry(0.09, 0.5, 6), headMat)
    spike.position.y = 0.22
    head.add(spike)
    for (let b = 0; b < 3; b++) {
      const barb = new Mesh(new ConeGeometry(0.055, 0.3, 5), headMat)
      const angle = (b / 3) * Math.PI * 2
      barb.position.set(Math.cos(angle) * 0.12, -0.05, Math.sin(angle) * 0.12)
      barb.rotation.set(Math.sin(angle) * 2.6, 0, Math.cos(angle) * 2.6)
      head.add(barb)
    }
    head.visible = false
    this.scene.add(head)

    return { segments, head, flight: 1, wobble: 0 }
  }

  /** Called on the sim's hook event: restart the visual launch for that cable. */
  launchHook(index: 0 | 1): void {
    const rope = this.ropes[index]!
    rope.flight = 0
    rope.wobble = 1
  }

  syncRopes(player: PlayerState, camera: Camera, dt: number): void {
    player.hooks.forEach((hook, i) => {
      const rope = this.ropes[i]!
      if (hook.state !== 'attached') {
        for (const segment of rope.segments) segment.visible = false
        rope.head.visible = false
        return
      }
      const hand = new Vector3(i === 0 ? -0.35 : 0.35, -0.32, -0.5)
      camera.localToWorld(hand)
      const span = new Vector3().subVectors(hook.anchor, hand)
      const dist = Math.max(span.length(), 0.01)
      const dir = span.clone().divideScalar(dist)

      if (rope.flight < 1) {
        rope.flight = Math.min(1, rope.flight + (dt * HOOK_FLIGHT_SPEED) / Math.max(dist, 1))
      } else {
        rope.wobble *= Math.exp(-5 * dt)
      }
      const tipParam = rope.flight * (2 - rope.flight) // ease-out: fast launch, soft arrival

      // wobble plane perpendicular to the cable
      const perp = new Vector3().crossVectors(dir, ROPE_UP)
      if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0)
      perp.normalize()
      const amplitude = Math.min(1.4, dist * 0.05) * rope.wobble
      const time = performance.now() * 0.001

      const points: Vector3[] = []
      for (let s = 0; s <= ROPE_SEGMENTS; s++) {
        const along = (s / ROPE_SEGMENTS) * tipParam
        const point = new Vector3().copy(hand).addScaledVector(span, along)
        const envelope = Math.sin(Math.PI * (s / ROPE_SEGMENTS)) // pinned at both ends
        point.addScaledVector(perp, Math.sin(along * Math.PI * 3 - time * 26) * amplitude * envelope)
        points.push(point)
      }

      for (let s = 0; s < ROPE_SEGMENTS; s++) {
        const segment = rope.segments[s]!
        const a = points[s]!
        const b = points[s + 1]!
        const seg = new Vector3().subVectors(b, a)
        const len = Math.max(seg.length(), 0.001)
        segment.visible = true
        segment.position.copy(a).addScaledVector(seg, 0.5)
        segment.scale.set(1, len, 1)
        segment.quaternion.setFromUnitVectors(ROPE_UP, seg.divideScalar(len))
      }

      const tip = points[ROPE_SEGMENTS]!
      const tail = points[ROPE_SEGMENTS - 1]!
      const tipDir = new Vector3().subVectors(tip, tail).normalize()
      rope.head.visible = true
      rope.head.position.copy(tip)
      rope.head.quaternion.setFromUnitVectors(ROPE_UP, tipDir)
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
    const strength = Math.min(1, Math.max(0, (speed - 12) / 26))
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

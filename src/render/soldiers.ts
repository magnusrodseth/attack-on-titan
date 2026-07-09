import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three'
import { EYE_HEIGHT } from '../sim/constants'
import type { RemoteSoldier } from '../sim/coopClient'

const loader = new TextureLoader()

function cloth(path: string, repeat: number): Texture {
  const texture = loader.load(path)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}

// Survey Corps kit: sourced CC0 weaves tinted per the texture rule (see README credits)
const jacketMat = new MeshStandardMaterial({ map: cloth('/textures/soldier-cloth.jpg', 1), color: 0xb98d55, roughness: 0.9 })
const trouserMat = new MeshStandardMaterial({ map: cloth('/textures/soldier-cloth.jpg', 1), color: 0xd8d2c4, roughness: 0.95 })
const leatherMat = new MeshStandardMaterial({ map: cloth('/textures/soldier-leather.jpg', 1), color: 0x8a6a48, roughness: 0.8 })
const cloakMat = new MeshStandardMaterial({ map: cloth('/textures/cloak-fabric.jpg', 1.5), color: 0x35543c, roughness: 1 })
const skinMat = new MeshStandardMaterial({ map: cloth('/textures/skin.jpg', 1), color: 0xe8c9a8, roughness: 0.85 })
const hairMat = new MeshStandardMaterial({ map: cloth('/textures/bark.jpg', 1), color: 0x3a2c1c, roughness: 0.95 })
const ropeMat = new MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.6 })

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

class SoldierVisual {
  readonly group = new Group()
  private readonly legL: Mesh
  private readonly legR: Mesh
  private readonly cloak: Mesh
  private readonly ropes: [Mesh, Mesh]
  private walkPhase = 0

  constructor(name: string, scene: Scene) {
    const torso = new Mesh(new CapsuleGeometry(0.22, 0.5, 4, 10), jacketMat)
    torso.position.y = 1.05
    torso.castShadow = true
    this.group.add(torso)

    // harness straps and gear boxes read instantly as ODM kit
    const strap = new Mesh(new BoxGeometry(0.46, 0.07, 0.46), leatherMat)
    strap.position.y = 0.95
    this.group.add(strap)
    for (const side of [-1, 1]) {
      const gear = new Mesh(new BoxGeometry(0.16, 0.3, 0.34), leatherMat)
      gear.position.set(side * 0.3, 0.72, 0.02)
      this.group.add(gear)
    }

    this.legL = new Mesh(new CapsuleGeometry(0.095, 0.5, 3, 8), trouserMat)
    this.legL.position.set(-0.12, 0.45, 0)
    this.legR = new Mesh(new CapsuleGeometry(0.095, 0.5, 3, 8), trouserMat)
    this.legR.position.set(0.12, 0.45, 0)
    this.group.add(this.legL, this.legR)

    const head = new Mesh(new SphereGeometry(0.17, 12, 10), skinMat)
    head.position.y = 1.62
    this.group.add(head)
    const hair = new Mesh(new BoxGeometry(0.3, 0.14, 0.32), hairMat)
    hair.position.y = 1.74
    this.group.add(hair)

    this.cloak = new Mesh(new BoxGeometry(0.52, 0.95, 0.06), cloakMat)
    this.cloak.position.set(0, 1.05, -0.24)
    this.cloak.castShadow = true
    this.group.add(this.cloak)

    const tag = nameSprite(name)
    tag.position.y = 2.25
    this.group.add(tag)

    this.ropes = [
      new Mesh(new CylinderGeometry(0.02, 0.02, 1, 5), ropeMat),
      new Mesh(new CylinderGeometry(0.02, 0.02, 1, 5), ropeMat),
    ]
    for (const rope of this.ropes) {
      rope.visible = false
      scene.add(rope)
    }
    scene.add(this.group)
  }

  sync(s: RemoteSoldier, dt: number): void {
    this.group.visible = s.alive
    this.group.position.set(s.pos.x, s.pos.y - EYE_HEIGHT, s.pos.z)
    this.group.rotation.y = s.yaw

    const speed = Math.hypot(s.vel.x, s.vel.z)
    if (s.onGround && speed > 0.5) {
      this.walkPhase += speed * dt * 1.4
      const swing = Math.sin(this.walkPhase) * Math.min(0.7, speed * 0.08)
      this.legL.rotation.x = swing
      this.legR.rotation.x = -swing
      this.group.rotation.x = 0.05
    } else if (!s.onGround) {
      // flying: trail the legs and lean into the velocity
      this.legL.rotation.x = this.legR.rotation.x = 0.55
      this.group.rotation.x = Math.min(0.6, speed * 0.015)
    } else {
      this.legL.rotation.x = this.legR.rotation.x = 0
      this.group.rotation.x = 0
    }
    this.cloak.rotation.x = Math.min(1.1, speed * 0.03) // the cloak billows with speed

    const chest = new Vector3(s.pos.x, s.pos.y - 0.3, s.pos.z)
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

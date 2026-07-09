import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import { makeLimb } from './titans'

/**
 * The two rare footballer titans from IDEAS.md: the Striker (Haaland homage, Norway home
 * kit, ponytail bun) and the Captain (Kane homage, England home kit, beard, armband).
 * Style-driven so the dev playground can retint every slot live; the eventual gameplay
 * effort reuses these builders with the locked-in style. Per the texture rule, every
 * surface layers a tint over an already-credited CC0 texture (soldier cloth and leather,
 * bark, skin); the kit numeral is a canvas glyph like the soldier name sprites.
 */

const loader = new TextureLoader()

function cloth(path: string, repeat: number): Texture {
  const texture = loader.load(path)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}

function numberTexture(text: string, hex: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 256, 256)
  ctx.font = '700 200px Arial, Helvetica, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = hex
  ctx.fillText(text, 128, 140)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export type FigureKind = 'striker' | 'captain'

/** Editable color slots per kind. 'number' recolors the kit numeral, the rest tint materials. */
export const KIT_DEFAULTS: Record<FigureKind, Record<string, string>> = {
  striker: {
    jersey: '#d21034', // Norway home red
    cross: '#003087', // offset flag cross, navy over a white inlay
    crossInlay: '#f0ede4',
    shorts: '#f2f2f2',
    socks: '#d21034',
    skin: '#e6b98e',
    hair: '#e2c26a', // blond, ponytail bun
    number: '#ffffff',
  },
  captain: {
    jersey: '#f2f1ea', // England home white
    collar: '#1f2a5a', // navy crew collar
    shorts: '#1f2a5a',
    socks: '#f2f1ea',
    skin: '#e0b48c',
    hair: '#9a7648', // swept-back dark blond
    beard: '#755631',
    armband: '#3050d8', // captain's armband, left arm
    number: '#ce1126',
  },
}

export interface FootballerFigure {
  kind: FigureKind
  group: Group
  /** Slot name to material; setting material.color restyles the live figure. */
  slots: Record<string, MeshStandardMaterial>
  setNumberColor(hex: string): void
  setHeight(h: number): void
  dispose(scene: Scene): void
}

export function buildFootballer(
  kind: FigureKind,
  colors: Record<string, string>,
  height: number,
): FootballerFigure {
  const group = new Group()
  const slots: Record<string, MeshStandardMaterial> = {}
  const slot = (name: string, path: string, repeat: number, roughness = 0.9): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({
      map: cloth(path, repeat),
      color: new Color(colors[name] ?? '#ffffff'),
      roughness,
    })
    slots[name] = material
    return material
  }

  const skin = slot('skin', '/textures/skin.jpg', 1.5)
  const jersey = slot('jersey', '/textures/soldier-cloth.jpg', 1)
  const shorts = slot('shorts', '/textures/soldier-cloth.jpg', 1)
  const socks = slot('socks', '/textures/soldier-cloth.jpg', 1)
  const hair = slot('hair', '/textures/bark.jpg', 2, 0.95)
  // near-black facial features, same bark-over-dark trick as the titan mouths
  const face = new MeshStandardMaterial({ map: cloth('/textures/bark.jpg', 2), color: 0x241b12, roughness: 0.95 })

  // legs: bare thighs under the shorts, socks from the knee down
  const legL = makeLimb(skin, 0.058, 0.11, 0.047, 0.1, -0.085, 0.44, socks)
  const legR = makeLimb(skin, 0.058, 0.11, 0.047, 0.1, 0.085, 0.44, socks)
  group.add(legL.pivot, legR.pivot)

  const torso = new Group()
  torso.position.y = 0.44
  group.add(torso)

  const chest = new Mesh(new CapsuleGeometry(0.12, 0.2, 4, 10), jersey)
  chest.scale.set(1.15, 1, 0.8) // battering-ram build, not the titan belly
  chest.position.y = 0.18
  chest.castShadow = true
  torso.add(chest)

  const hips = new Mesh(new CapsuleGeometry(0.13, 0.08, 4, 10), shorts)
  hips.scale.set(1.05, 1, 0.78)
  hips.position.y = 0.02
  hips.castShadow = true
  torso.add(hips)

  for (const side of [-1, 1]) {
    const shoulder = new Mesh(new SphereGeometry(0.06, 8, 6), jersey)
    shoulder.position.set(side * 0.15, 0.31, 0)
    torso.add(shoulder)
    const sleeve = new Mesh(new CapsuleGeometry(0.05, 0.05, 3, 8), jersey)
    sleeve.position.set(side * 0.165, 0.27, 0)
    sleeve.rotation.z = side * 0.25
    torso.add(sleeve)
  }

  const armL = makeLimb(skin, 0.044, 0.1, 0.037, 0.1, -0.165, 0.32)
  const armR = makeLimb(skin, 0.044, 0.1, 0.037, 0.1, 0.165, 0.32)
  armL.pivot.rotation.x = armR.pivot.rotation.x = -0.1
  torso.add(armL.pivot, armR.pivot)

  const head = new Group()
  head.position.y = 0.4
  torso.add(head)
  const skull = new Mesh(new SphereGeometry(0.085, 12, 10), skin)
  skull.scale.set(1, 1.12, 1)
  skull.castShadow = true
  head.add(skull)
  for (const side of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.011, 6, 5), face)
    eye.position.set(side * 0.032, 0.015, 0.078)
    head.add(eye)
  }

  if (kind === 'striker') {
    // slicked-back blond with the ponytail bun
    const cap = new Mesh(new BoxGeometry(0.15, 0.05, 0.16), hair)
    cap.position.set(0, 0.075, -0.01)
    head.add(cap)
    const bun = new Mesh(new SphereGeometry(0.032, 8, 6), hair)
    bun.position.set(0, 0.05, -0.095)
    head.add(bun)

    // offset Nordic cross on the chest: white inlay under the navy bands
    const crossInlay = slot('crossInlay', '/textures/soldier-cloth.jpg', 1)
    const cross = slot('cross', '/textures/soldier-cloth.jpg', 1)
    const decals: [MeshStandardMaterial, number, number, number, number, number][] = [
      [crossInlay, 0.27, 0.075, 0, 0.2, 0.1],
      [crossInlay, 0.08, 0.26, -0.05, 0.19, 0.101],
      [cross, 0.27, 0.046, 0, 0.2, 0.102],
      [cross, 0.05, 0.26, -0.05, 0.19, 0.103],
    ]
    for (const [material, w, h, x, y, z] of decals) {
      const band = new Mesh(new PlaneGeometry(w, h), material)
      band.position.set(x, y, z)
      torso.add(band)
    }
  } else {
    // swept-back hair and the short full beard
    const sweep = new Mesh(new BoxGeometry(0.155, 0.06, 0.17), hair)
    sweep.position.set(0, 0.065, -0.015)
    head.add(sweep)
    const beard = slot('beard', '/textures/bark.jpg', 2, 0.95)
    const jaw = new Mesh(new BoxGeometry(0.11, 0.05, 0.05), beard)
    jaw.position.set(0, -0.055, 0.05)
    head.add(jaw)

    const collar = slot('collar', '/textures/soldier-cloth.jpg', 1)
    const ring = new Mesh(new CylinderGeometry(0.05, 0.055, 0.035, 10), collar)
    ring.position.y = 0.365
    torso.add(ring)

    const armband = slot('armband', '/textures/soldier-leather.jpg', 1, 0.8)
    const band = new Mesh(new CylinderGeometry(0.052, 0.052, 0.03, 10), armband)
    band.position.y = -0.07
    armL.pivot.add(band)
  }

  // kit number on the back, canvas glyph like the soldier name sprites
  const numberMat = new MeshBasicMaterial({
    map: numberTexture('9', colors.number ?? '#ffffff'),
    transparent: true,
  })
  const numberPlane = new Mesh(new PlaneGeometry(0.15, 0.17), numberMat)
  numberPlane.position.set(0, 0.2, -0.1)
  numberPlane.rotation.y = Math.PI
  torso.add(numberPlane)

  // the nape marks them as titans; same overbright indicator as every other nape
  const nape = new Mesh(
    new BoxGeometry(0.085, 0.075, 0.035),
    new MeshStandardMaterial({ color: 0xb3202a, emissive: 0xd42b35, emissiveIntensity: 0.8 }),
  )
  nape.position.set(0, 0.38, -0.09)
  torso.add(nape)

  group.scale.setScalar(height)

  return {
    kind,
    group,
    slots,
    setNumberColor(hex: string) {
      numberMat.map?.dispose()
      numberMat.map = numberTexture('9', hex)
      numberMat.needsUpdate = true
    },
    setHeight(h: number) {
      group.scale.setScalar(h)
    },
    dispose(scene: Scene) {
      scene.remove(group)
    },
  }
}

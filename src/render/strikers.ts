import {
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TubeGeometry,
  Vector3,
} from 'three'
import { makeLimb, makeWeakPoint, makeWeakPointMats } from './titans'

/**
 * The two rare footballer titans from IDEAS.md: the Striker (Haaland homage, Norway home
 * kit, photo face, wind-swept bun) and the Captain (Kane homage, England home kit, beard,
 * armband). Style-driven so the dev playground can retint every slot live; the eventual
 * gameplay effort reuses these builders with the locked-in style.
 *
 * The jersey is a baked canvas: cloth weave, flag cross and back number composited into one
 * texture that wraps the chest capsule, so the cross follows the body instead of floating
 * in front of it as decal planes. Likewise the Striker's head bakes the face photo into the
 * skull sphere's texture. Retinting a baked slot repaints the canvas.
 *
 * Texture rule: every surface layers a tint over an already-credited CC0 texture (soldier
 * cloth, skin, bark). The one exception, by explicit user decision (2026-07-09): the
 * Striker's face is a real Wikimedia Commons photo, credited in the README.
 */

const loader = new TextureLoader()

function cloth(path: string, repeat: number): Texture {
  const texture = loader.load(path)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}

/** Plain <img> for canvas compositing; painters re-run as each asset arrives. */
function loadImage(path: string, onLoad: () => void): HTMLImageElement {
  const img = new Image()
  img.addEventListener('load', onLoad)
  img.src = path
  return img
}

function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0
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
    skin: '#eac09e', // light enough that the neck blends into the photo face
    hair: '#dcb763', // blond, wind-swept ponytail bun
    number: '#ffffff',
  },
  captain: {
    jersey: '#f2f1ea', // England home white
    collar: '#1f2a5a', // navy crew collar
    shorts: '#1f2a5a',
    socks: '#f2f1ea',
    skin: '#e0b48c',
    hair: '#9a7648', // swept-back dark blond; the beard lives in the face photo
    armband: '#3050d8', // captain's armband, left arm
    number: '#ce1126',
  },
}

export interface FootballerFigure {
  kind: FigureKind
  group: Group
  /** Restyle a KIT_DEFAULTS slot on the live figure: tints materials, repaints baked canvases. */
  setColor(slot: string, hex: string): void
  setHeight(h: number): void
  dispose(scene: Scene): void
}

// CapsuleGeometry/SphereGeometry UV facts (three r185): u wraps the circumference with the
// mesh front (+z) at u=0.25 and the seam under the figure's right arm; v runs hem (0) to
// collar (1), arc-length parametrized over the capsule caps. Canvas row 0 lands at v=1.
const FRONT_U = 0.25
const BACK_U = 0.75

const JERSEY_W = 1024
const JERSEY_H = 512
const HEAD_W = 512
const HEAD_H = 256

/** Skull scale per kind: the Striker's long pill head vs the Captain's rounder one. */
const HEAD_SHAPE: Record<FigureKind, { x: number; y: number; z: number }> = {
  striker: { x: 0.94, y: 1.3, z: 0.96 },
  captain: { x: 1.02, y: 1.16, z: 1 },
}

const FACE_PHOTO: Record<FigureKind, string> = {
  striker: '/textures/haaland-face.jpg',
  captain: '/textures/kane-face.jpg',
}

/** Face patch width on the head canvas: both wrap far past the front of the head. */
const FACE_W: Record<FigureKind, number> = {
  striker: 265,
  captain: 275,
}

export function buildFootballer(
  kind: FigureKind,
  colors: Record<string, string>,
  height: number,
): FootballerFigure {
  const kit: Record<string, string> = { ...KIT_DEFAULTS[kind], ...colors }
  const kitColor = (name: string): string => kit[name] ?? '#ffffff'
  const group = new Group()
  const materialSlots: Record<string, MeshStandardMaterial[]> = {}
  const slot = (name: string, path: string, repeat: number, roughness = 0.9): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({
      map: cloth(path, repeat),
      color: new Color(kit[name] ?? '#ffffff'),
      roughness,
    })
    ;(materialSlots[name] ??= []).push(material)
    return material
  }

  const skin = slot('skin', '/textures/skin.jpg', 1.5)
  const jersey = slot('jersey', '/textures/soldier-cloth.jpg', 1) // shoulders + sleeves
  const shorts = slot('shorts', '/textures/soldier-cloth.jpg', 1)
  const socks = slot('socks', '/textures/soldier-cloth.jpg', 1)
  // linen, not bark: hair tints multiply over the map, and bark is too dark to ever read blond
  const hair = slot('hair', '/textures/linen.jpg', 2, 0.95)

  // --- baked jersey: flag cross + back number wrap the chest instead of floating decals
  const jerseyCanvas = document.createElement('canvas')
  jerseyCanvas.width = JERSEY_W
  jerseyCanvas.height = JERSEY_H
  const jerseyTexture = new CanvasTexture(jerseyCanvas)
  jerseyTexture.colorSpace = SRGBColorSpace

  function paintJersey(): void {
    const ctx = jerseyCanvas.getContext('2d')!
    const uCol = (u: number) => u * JERSEY_W
    const vRow = (v: number) => (1 - v) * JERSEY_H
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = kitColor('jersey')
    ctx.fillRect(0, 0, JERSEY_W, JERSEY_H)
    if (kind === 'striker') {
      // offset Nordic cross: horizontal band wraps all the way around at mid-chest (any
      // lower and the shorts swallow it), vertical band runs down the front, shifted
      // toward the hoist side like the flag
      const bandRow = vRow(0.5)
      const bandCol = uCol(FRONT_U - 0.07)
      ctx.fillStyle = kitColor('crossInlay')
      ctx.fillRect(0, bandRow - 33, JERSEY_W, 66)
      ctx.fillRect(bandCol - 54, 0, 108, JERSEY_H)
      ctx.fillStyle = kitColor('cross')
      ctx.fillRect(0, bandRow - 20, JERSEY_W, 40)
      ctx.fillRect(bandCol - 34, 0, 68, JERSEY_H)
    }
    ctx.fillStyle = kitColor('number')
    ctx.font = '700 190px Arial, Helvetica, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('9', uCol(BACK_U), vRow(0.5))
    if (ready(clothImg)) {
      // multiply the weave over the flat colors: same result as map * material.color
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(clothImg, 0, 0, JERSEY_W, JERSEY_H)
      ctx.globalCompositeOperation = 'source-over'
    }
    jerseyTexture.needsUpdate = true
  }

  const clothImg = loadImage('/textures/soldier-cloth.jpg', paintJersey)
  const chestMat = new MeshStandardMaterial({ map: jerseyTexture, roughness: 0.9 })

  // --- baked head: the face photo feathered into the skin at the sphere front
  const headCanvas = document.createElement('canvas')
  headCanvas.width = HEAD_W
  headCanvas.height = HEAD_H
  const headTexture = new CanvasTexture(headCanvas)
  headTexture.colorSpace = SRGBColorSpace

  function paintHead(): void {
    const ctx = headCanvas.getContext('2d')!
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = kitColor('skin')
    ctx.fillRect(0, 0, HEAD_W, HEAD_H)
    if (ready(skinImg)) {
      ctx.globalCompositeOperation = 'multiply'
      const tile = HEAD_W / 1.5 // match the body skin's 1.5 texture repeat
      for (let y = 0; y < HEAD_H; y += tile)
        for (let x = 0; x < HEAD_W; x += tile) ctx.drawImage(skinImg, x, y, tile, tile)
      ctx.globalCompositeOperation = 'source-over'
    }
    if (ready(faceImg)) {
      // feathered oval so the photo blends into the skin instead of ending at a hard seam;
      // sized per kind to wrap most of the head, not just a front patch
      const fw = FACE_W[kind]
      const fh = 175
      const off = document.createElement('canvas')
      off.width = fw
      off.height = fh
      const octx = off.getContext('2d')!
      octx.drawImage(faceImg, 0, 0, fw, fh)
      octx.globalCompositeOperation = 'destination-in'
      octx.translate(fw / 2, fh / 2)
      octx.scale(1, fh / fw)
      const mask = octx.createRadialGradient(0, 0, 0, 0, 0, fw / 2)
      mask.addColorStop(0.55, 'rgba(0,0,0,1)')
      mask.addColorStop(0.85, 'rgba(0,0,0,0)') // stop short of the crop edge: photo background stays out
      octx.fillStyle = mask
      octx.fillRect(-fw / 2, -fw / 2, fw, fw)
      ctx.drawImage(off, FRONT_U * HEAD_W - fw / 2, (1 - 0.52) * HEAD_H - fh / 2)
    }
    headTexture.needsUpdate = true
  }

  const headMat = new MeshStandardMaterial({ map: headTexture, roughness: 0.85 })
  const skinImg = loadImage('/textures/skin.jpg', paintHead)
  const faceImg = loadImage(FACE_PHOTO[kind], paintHead)

  // legs: bare thighs under the shorts, socks from the knee down; stance kept narrow
  // enough that the slimmed shorts still contain the thigh tops
  const legL = makeLimb(skin, 0.058, 0.11, 0.047, 0.1, -0.075, 0.44, socks)
  const legR = makeLimb(skin, 0.058, 0.11, 0.047, 0.1, 0.075, 0.44, socks)
  group.add(legL.pivot, legR.pivot)

  const torso = new Group()
  torso.position.y = 0.44
  group.add(torso)

  // long jersey: the chest capsule runs low so the shirt hangs over the shorts
  const chest = new Mesh(new CapsuleGeometry(0.12, 0.26, 4, 24), chestMat)
  chest.scale.set(1.15, 1, 0.8) // battering-ram build, not the titan belly
  chest.position.y = 0.15
  chest.castShadow = true
  torso.add(chest)

  // shorts: slimmer than the jersey and set low, strictly inside the chest until its
  // base curve narrows past them
  const hips = new Mesh(new CapsuleGeometry(0.115, 0.05, 4, 24), shorts)
  hips.scale.set(1.17, 1, 0.8)
  hips.position.y = -0.03
  hips.castShadow = true
  torso.add(hips)

  // slim jersey-red hem band over the seam where the shorts emerge from under the chest,
  // so the shirt ends on a clean horizontal line with no white at the waist
  const hem = new Mesh(new CylinderGeometry(0.12, 0.12, 0.024, 24), jersey)
  hem.scale.set(1.17, 1, 0.82)
  hem.position.y = -0.01
  torso.add(hem)

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
  const shape = HEAD_SHAPE[kind]
  const skull = new Mesh(new SphereGeometry(0.085, 24, 18), headMat)
  skull.scale.set(shape.x, shape.y, shape.z)
  skull.castShadow = true
  head.add(skull)

  if (kind === 'striker') {
    // slicked-back crown: a snug shell over the skull, tilted back just enough that the
    // hairline overlaps the photo's forehead (no skin gap) while eyes and brow stay clear
    const crown = new Mesh(new SphereGeometry(0.089, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), hair)
    crown.scale.set(shape.x * 1.02, shape.y * 0.98, shape.z * 1.02)
    crown.position.set(0, 0.005, -0.01)
    crown.rotation.x = -0.38
    head.add(crown)

    const bun = new Mesh(new SphereGeometry(0.036, 10, 8), hair)
    bun.position.set(0, 0.075, -0.085)
    head.add(bun)

    // one tight tail off the bun (three overlapping strands reading as a single mass, with
    // a slight wind sway) plus skull-hugging temple wisps; short enough that the nape glow
    // underneath stays readable from behind
    const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z)
    const locks: [Vector3[], number][] = [
      [[v3(0, 0.045, -0.1), v3(0.006, 0.01, -0.13), v3(-0.004, -0.025, -0.145), v3(0.002, -0.055, -0.14)], 0.016],
      [[v3(0.012, 0.04, -0.095), v3(0.018, 0.005, -0.125), v3(0.012, -0.03, -0.14)], 0.011],
      [[v3(-0.012, 0.04, -0.095), v3(-0.018, 0.005, -0.125), v3(-0.012, -0.03, -0.14)], 0.011],
      [[v3(0.055, 0.02, -0.04), v3(0.06, -0.005, -0.08), v3(0.05, -0.025, -0.105)], 0.006],
      [[v3(-0.055, 0.02, -0.04), v3(-0.06, -0.005, -0.08), v3(-0.05, -0.025, -0.105)], 0.006],
    ]
    for (const [points, radius] of locks) {
      const lock = new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 12, radius, 6), hair)
      head.add(lock)
      const tip = new Mesh(new SphereGeometry(radius * 0.95, 6, 5), hair)
      tip.position.copy(points[points.length - 1]!)
      head.add(tip)
    }
  } else {
    // swept-back short hair: same snug shell as the striker, sitting a touch flatter
    const crown = new Mesh(new SphereGeometry(0.089, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hair)
    crown.scale.set(shape.x * 1.02, shape.y * 0.98, shape.z * 1.02)
    crown.position.set(0, 0.008, -0.012)
    crown.rotation.x = -0.3
    head.add(crown)

    const collar = slot('collar', '/textures/soldier-cloth.jpg', 1)
    const ring = new Mesh(new CylinderGeometry(0.05, 0.055, 0.035, 10), collar)
    ring.position.y = 0.365
    torso.add(ring)

    const armband = slot('armband', '/textures/soldier-leather.jpg', 1, 0.8)
    const band = new Mesh(new CylinderGeometry(0.052, 0.052, 0.03, 10), armband)
    band.position.y = -0.07
    armL.pivot.add(band)
  }

  // the nape marks them as titans: the same bloom-from-within as every other nape, plus
  // heel tendons since they cripple like any aberrant
  const weakMats = makeWeakPointMats()
  const nape = makeWeakPoint(weakMats, 0.34, 0.12)
  nape.position.set(0, 0.36, -0.1)
  torso.add(nape)
  for (const limb of [legL, legR]) {
    const heel = makeWeakPoint(weakMats, 0.19, 0.07)
    heel.position.set(0, -0.175, -0.055)
    limb.lower.add(heel)
  }

  group.scale.setScalar(height)
  paintJersey()
  paintHead()

  const bakedSlots = new Set(['jersey', 'cross', 'crossInlay', 'number'])
  return {
    kind,
    group,
    setColor(slotName: string, hex: string) {
      kit[slotName] = hex
      for (const material of materialSlots[slotName] ?? []) material.color.set(hex)
      if (bakedSlots.has(slotName)) paintJersey()
      if (slotName === 'skin') paintHead()
    },
    setHeight(h: number) {
      group.scale.setScalar(h)
    },
    dispose(scene: Scene) {
      scene.remove(group)
    },
  }
}

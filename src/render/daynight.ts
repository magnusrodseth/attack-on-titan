import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { nightFactor, sunElevation } from '../sim/daynight'

// Daylight matches the game's original fixed look; night and dusk are graded
// off it so the district reads as the same place at every hour. Night is pinned
// at a deep-dusk brightness — dark enough to sell the hour, light enough to stay
// playable (user mandate 2026-07-09); the flashlight carries the drama on top.
const FOG_DAY = new Color(0xb9cfe2)
const FOG_NIGHT = new Color(0x2e3a55)
const FOG_DUSK = new Color(0xd99f6c)
const SUN_NOON = new Color(0xfff1da)
const SUN_HORIZON = new Color(0xff9550)
const MOON_TINT = new Color(0x93a7c8)
const HEMI_SKY_DAY = new Color(0xd8e8ff)
const HEMI_SKY_NIGHT = new Color(0x45557c)
const HEMI_GROUND_DAY = new Color(0x8a7a63)
const HEMI_GROUND_NIGHT = new Color(0x3c3a45)

// Underground: the same sky, sun, moon and stars overhead — but seen from inside a cavern,
// through holes worn in the rock. So the sky machinery is untouched and only what the ROCK
// does to the light changes: the air below is dim and close, ambient is a fraction of the
// surface's, and the sun is a rumour rather than a lamp. Daylight still swells the cave, so
// the hour reads down here and the flashlight stays a night tool.
const CAVE_FOG_DAY = new Color(0x1c1a18)
const CAVE_FOG_NIGHT = new Color(0x05060a)
const CAVE_HEMI_SKY_DAY = new Color(0x8d9bb4)
const CAVE_HEMI_SKY_NIGHT = new Color(0x2b3346)
const CAVE_HEMI_GROUND_DAY = new Color(0x6b5a44)
const CAVE_HEMI_GROUND_NIGHT = new Color(0x2a2620)

export interface SkyOptions {
  /** Grade for a roofed world: dark close fog, weak ambient, a sun that cannot get in. */
  underground?: boolean
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/**
 * Sky, celestial light, fog and ambient graded by the sim's day/night clock.
 * One DirectionalLight plays the sun by day and the moon by night (they never
 * share the sky at meaningful intensity, and one shadow map is cheaper than two).
 * Scenery that must react to darkness (window lamps, cloud billboards — both
 * unlit MeshBasicMaterial that would otherwise glow at midnight) registers a
 * callback via onNight.
 */
export class DayNightSky {
  private readonly sky = new Sky()
  private readonly stars: Mesh
  private readonly starsMat: MeshBasicMaterial
  private readonly moon: Mesh
  private readonly moonMat: MeshBasicMaterial
  private readonly celestial: DirectionalLight
  private readonly hemi: HemisphereLight
  private readonly fog: Fog
  private readonly background = FOG_DAY.clone()
  private readonly nightCallbacks: Array<(night: number) => void> = []
  private nightBucket = -1
  private readonly sunDir = new Vector3()
  // an unloaded texture renders solid black, which would blot out the twilight sky
  private starsReady = false
  private moonReady = false
  private readonly underground: boolean

  constructor(scene: Scene, options: SkyOptions = {}) {
    this.underground = options.underground ?? false
    this.fog = new Fog(FOG_DAY.clone(), 70, 620)
    scene.fog = this.fog
    scene.background = this.background

    this.sky.scale.setScalar(4000)
    const uniforms = (this.sky.material as ShaderMaterial).uniforms
    uniforms.turbidity!.value = 2.5
    uniforms.rayleigh!.value = 1.4
    uniforms.mieCoefficient!.value = 0.005
    uniforms.mieDirectionalG!.value = 0.8
    uniforms.cloudCoverage!.value = 0 // the sourced billboard clouds are the clouds
    // Underground you never see the weather — a hole in the rock reads as raw white light,
    // not as a window onto clouds and stars. So the sky, the star dome and the moon are
    // simply never built down there; the shaft caps in cavern.ts are the light.
    if (!this.underground) scene.add(this.sky)

    const loader = new TextureLoader()
    const starTex = loader.load('/textures/stars.jpg', () => {
      this.starsReady = true
    })
    starTex.colorSpace = SRGBColorSpace
    starTex.wrapS = RepeatWrapping // blend the equirect seam instead of clamping it
    this.starsMat = new MeshBasicMaterial({
      map: starTex,
      side: BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    })
    // radius must stay inside camera.far (900); the dome tracks the camera
    this.stars = new Mesh(new SphereGeometry(850, 32, 16), this.starsMat)
    this.stars.visible = !this.underground
    this.stars.frustumCulled = false
    // the dome is camera-centered, so the distance sort would draw it over every
    // other transparent object (moon, clouds); force it to the very back instead
    this.stars.renderOrder = -2
    // tip the UV poles toward the horizon so their pinch hides behind rooftops
    this.stars.rotation.x = 1.35
    scene.add(this.stars)

    const moonTex = loader.load('/textures/moon.jpg', () => {
      this.moonReady = true
    })
    moonTex.colorSpace = SRGBColorSpace
    this.moonMat = new MeshBasicMaterial({
      map: moonTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    })
    this.moon = new Mesh(new SphereGeometry(26, 24, 16), this.moonMat)
    this.moon.visible = !this.underground
    this.moon.frustumCulled = false
    this.moon.renderOrder = -1 // over the stars, under everything nearer
    scene.add(this.moon)

    this.hemi = new HemisphereLight(HEMI_SKY_DAY.clone(), HEMI_GROUND_DAY.clone(), 1.1)
    scene.add(this.hemi)

    this.celestial = new DirectionalLight(SUN_NOON.clone(), 2.4)
    this.celestial.position.set(140, 200, 80)
    this.celestial.castShadow = true
    this.celestial.shadow.mapSize.set(2048, 2048)
    // sized to the v2 district: the 260m wall plus its ground apron
    this.celestial.shadow.camera.left = -330
    this.celestial.shadow.camera.right = 330
    this.celestial.shadow.camera.top = 330
    this.celestial.shadow.camera.bottom = -330
    this.celestial.shadow.camera.far = 800
    this.celestial.shadow.bias = -0.0004
    scene.add(this.celestial)
  }

  /** Register scenery that re-tints when darkness changes (called with night 0..1). */
  onNight(callback: (night: number) => void): void {
    this.nightCallbacks.push(callback)
  }

  update(fraction: number, camera: Object3D): void {
    // The sun sweeps a great circle tilted off the zenith so shadows always slant.
    const angle = (fraction - 0.25) * Math.PI * 2
    this.sunDir.set(Math.cos(angle), Math.sin(angle), 0.38).normalize()
    const el = sunElevation(fraction)
    const night = nightFactor(fraction)
    // warm grading peaks while the sun crosses the horizon
    const dusk = 1 - Math.min(1, Math.abs(el) / 0.35)

    const uniforms = (this.sky.material as ShaderMaterial).uniforms
    ;(uniforms.sunPosition!.value as Vector3).copy(this.sunDir).multiplyScalar(100)
    uniforms.rayleigh!.value = 1.4 + dusk * 2.2
    uniforms.turbidity!.value = 2.5 + dusk * 3
    uniforms.mieCoefficient!.value = 0.005 + dusk * 0.008

    const sunStrength = smooth(el / 0.25)
    const moonStrength = smooth(-el / 0.25)
    if (sunStrength >= moonStrength) {
      this.celestial.position.copy(this.sunDir).multiplyScalar(240)
      this.celestial.color.copy(SUN_HORIZON).lerp(SUN_NOON, smooth(el / 0.5))
      this.celestial.intensity = Math.max(0.02, 2.4 * sunStrength)
    } else {
      this.celestial.position.copy(this.sunDir).multiplyScalar(-240)
      this.celestial.color.copy(MOON_TINT)
      this.celestial.intensity = Math.max(0.02, 0.95 * moonStrength)
    }

    if (this.underground) {
      // rock over your head: the sun never lands on you, it only leaks in. Ambient swells
      // with the day so noon in the cavern is dim-but-readable and midnight is black.
      this.hemi.color.copy(CAVE_HEMI_SKY_DAY).lerp(CAVE_HEMI_SKY_NIGHT, night)
      this.hemi.groundColor.copy(CAVE_HEMI_GROUND_DAY).lerp(CAVE_HEMI_GROUND_NIGHT, night)
      this.hemi.intensity = 0.95 - 0.55 * night
      this.celestial.intensity *= 0.12
      this.fog.color.copy(CAVE_FOG_DAY).lerp(CAVE_FOG_NIGHT, night)
      this.fog.near = 24
      this.fog.far = 330 - 60 * night
      this.background.copy(CAVE_FOG_NIGHT) // the void beyond the rock, at every hour
    } else {
      this.hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, night)
      this.hemi.groundColor.copy(HEMI_GROUND_DAY).lerp(HEMI_GROUND_NIGHT, night)
      this.hemi.intensity = 1.1 - 0.42 * night

      this.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, night).lerp(FOG_DUSK, dusk * 0.65)
      this.fog.near = 70 - 15 * night
      this.fog.far = 460 - 50 * night
      this.background.copy(this.fog.color)
    }

    // stars and moon ride with the camera so the domes never clip the far plane
    this.stars.position.copy(camera.position)
    this.stars.rotation.y = -fraction * Math.PI * 2
    this.starsMat.opacity = this.starsReady ? night * 0.95 : 0
    this.moon.position.copy(camera.position).addScaledVector(this.sunDir, -780)
    this.moonMat.opacity = this.moonReady ? 0.95 * smooth(-el / 0.2) : 0

    const bucket = Math.round(night * 48)
    if (bucket !== this.nightBucket) {
      this.nightBucket = bucket
      for (const callback of this.nightCallbacks) callback(night)
    }
  }
}

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
// off it so the district reads as the same place at every hour.
const FOG_DAY = new Color(0xb9cfe2)
const FOG_NIGHT = new Color(0x0c1120)
const FOG_DUSK = new Color(0xd99f6c)
const SUN_NOON = new Color(0xfff1da)
const SUN_HORIZON = new Color(0xff9550)
const MOON_TINT = new Color(0x93a7c8)
const HEMI_SKY_DAY = new Color(0xd8e8ff)
const HEMI_SKY_NIGHT = new Color(0x1a2338)
const HEMI_GROUND_DAY = new Color(0x8a7a63)
const HEMI_GROUND_NIGHT = new Color(0x1f1d22)

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

  constructor(scene: Scene) {
    this.fog = new Fog(FOG_DAY.clone(), 70, 460)
    scene.fog = this.fog
    scene.background = this.background

    this.sky.scale.setScalar(4000)
    const uniforms = (this.sky.material as ShaderMaterial).uniforms
    uniforms.turbidity!.value = 2.5
    uniforms.rayleigh!.value = 1.4
    uniforms.mieCoefficient!.value = 0.005
    uniforms.mieDirectionalG!.value = 0.8
    uniforms.cloudCoverage!.value = 0 // the sourced billboard clouds are the clouds
    scene.add(this.sky)

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
    this.moon.frustumCulled = false
    this.moon.renderOrder = -1 // over the stars, under everything nearer
    scene.add(this.moon)

    this.hemi = new HemisphereLight(HEMI_SKY_DAY.clone(), HEMI_GROUND_DAY.clone(), 1.1)
    scene.add(this.hemi)

    this.celestial = new DirectionalLight(SUN_NOON.clone(), 2.4)
    this.celestial.position.set(140, 200, 80)
    this.celestial.castShadow = true
    this.celestial.shadow.mapSize.set(2048, 2048)
    this.celestial.shadow.camera.left = -220
    this.celestial.shadow.camera.right = 220
    this.celestial.shadow.camera.top = 220
    this.celestial.shadow.camera.bottom = -220
    this.celestial.shadow.camera.far = 600
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
      this.celestial.intensity = Math.max(0.02, 0.4 * moonStrength)
    }

    this.hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, night)
    this.hemi.groundColor.copy(HEMI_GROUND_DAY).lerp(HEMI_GROUND_NIGHT, night)
    this.hemi.intensity = 1.1 - 0.8 * night

    this.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, night).lerp(FOG_DUSK, dusk * 0.65)
    this.fog.near = 70 - 15 * night
    this.fog.far = 460 - 90 * night
    this.background.copy(this.fog.color)

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

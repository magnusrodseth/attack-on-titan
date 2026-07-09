import { PerspectiveCamera, Vector3, WebGLRenderer } from 'three'
import { AudioSystem, FLINCHES, GRUNTS, ROARS, SLASHES } from './audio'
import { Hud } from './hud'
import { BladeView } from './render/blade'
import { Effects } from './render/effects'
import { buildScene } from './render/scene'
import { TitanPool } from './render/titans'
import { raycastHookTarget } from './sim/city'
import { SIM_DT } from './sim/constants'
import type { GameEvent } from './sim/game'
import { chooseUpgrade, createGame, startGame, stepGame } from './sim/game'
import type { InputState } from './sim/player'
import { neutralInput } from './sim/player'
import { napeCenter } from './sim/titan'

function dailySeed(): string {
  const d = new Date()
  return `wall-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const seed = new URLSearchParams(location.search).get('seed') ?? dailySeed()
const game = createGame(seed)
const scene = buildScene(game.arena)
const camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 900)
camera.rotation.order = 'YXZ'

const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

scene.add(camera) // camera children (blade viewmodel) need the camera in the scene graph
const titanPool = new TitanPool(scene)
const effects = new Effects(scene)
const hud = new Hud(seed)
const blade = new BladeView(camera)
const audio = new AudioSystem()
let gasAudible = false
let roarTimer = 3

// --- input -----------------------------------------------------------------

const keys = new Set<string>()
let mouseL = false
let mouseR = false
let yaw = 0
let pitch = 0
const debug = { autopilot: false, silent: false }

window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (['Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyR'].includes(e.code)) e.preventDefault()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseL = true
  if (e.button === 2) mouseR = true
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseL = false
  if (e.button === 2) mouseR = false
})
window.addEventListener('contextmenu', (e) => e.preventDefault())
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return
  yaw -= e.movementX * 0.0023
  pitch = Math.min(1.45, Math.max(-1.45, pitch - e.movementY * 0.0023))
})
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// Escape resumes from the pause menu. Chrome refuses to re-lock the pointer for
// ~1.25s after an ESC-initiated exit, so wait out the remainder before requesting.
let lastUnlockAt = -Infinity
let resumeTimer: number | undefined
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement) lastUnlockAt = performance.now()
})
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return
  if (game.phase !== 'playing' || document.pointerLockElement === renderer.domElement) return
  const wait = Math.max(0, 1350 - (performance.now() - lastUnlockAt))
  window.clearTimeout(resumeTimer)
  resumeTimer = window.setTimeout(() => {
    if (game.phase === 'playing' && document.pointerLockElement !== renderer.domElement) {
      lockPointer()
    }
  }, wait)
})

const UP = new Vector3(0, 1, 0)

function buildInput(): InputState {
  const input = neutralInput()
  input.jump = keys.has('Space')
  input.gas = keys.has('ShiftLeft') || keys.has('ShiftRight')
  input.slash = keys.has('KeyF')
  input.hookL = mouseL || keys.has('KeyQ')
  input.hookR = mouseR
  input.resupply = keys.has('KeyR')
  camera.getWorldDirection(input.lookDir)

  const forward = new Vector3(input.lookDir.x, 0, input.lookDir.z)
  if (forward.lengthSq() > 0) forward.normalize()
  const right = new Vector3().crossVectors(forward, UP).negate()
  const fw = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
  const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  input.move.copy(forward).multiplyScalar(fw).addScaledVector(right, -side)
  return input
}

// --- HUD wiring -------------------------------------------------------------

function lockPointer(): void {
  try {
    const result = renderer.domElement.requestPointerLock() as unknown
    if (result instanceof Promise) result.catch(() => {})
  } catch {
    // pointer lock can be refused (backgrounded tab, iframe); pause overlay handles it
  }
}

function beginRun(): void {
  audio.init()
  hud.hideStart()
  hud.hideDeath()
  pauseShown = false
  if (game.phase === 'menu' || game.phase === 'dead') {
    startGame(game)
    prevPhase = game.phase
    hud.showBanner('Wave 1')
  }
  lockPointer()
}

hud.onStart = beginRun
hud.onRetry = beginRun
hud.onPickUpgrade = (id) => {
  audio.init()
  audio.chime()
  chooseUpgrade(game, id)
  prevPhase = game.phase
  hud.hideUpgrades()
  hud.showBanner(`Wave ${game.wave}`)
  lockPointer()
}
hud.showStart()

// --- events from the sim ----------------------------------------------------

function handleEvents(events: GameEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'slash':
        blade.slash()
        audio.play(SLASHES, { volume: 0.55 })
        if (event.hit && event.napeHit) {
          hud.slashFlash()
          effects.addShake(0.12)
          audio.play('slice', { volume: 0.9 })
        } else if (event.hit) {
          effects.addShake(0.06)
          audio.thud(0.3)
          audio.play(FLINCHES, { volume: 0.4 })
        }
        break
      case 'kill': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        if (titan) {
          effects.burst(napeCenter(titan), 0xd42b35)
          const dist = titan.pos.distanceTo(game.player.pos)
          audio.playAt('death-groan', dist, { volume: 1.2 })
        }
        effects.addShake(0.4)
        audio.thud(0.6)
        hud.popPoints(event.points, event.oneCut)
        break
      }
      case 'bladeBroke':
        hud.showBanner('Blade Shattered', 900)
        audio.snap()
        break
      case 'playerHit':
        hud.showHit()
        effects.addShake(0.6)
        audio.thud(0.9)
        audio.play(GRUNTS, { volume: 0.8, rate: 0.7 })
        break
      case 'waveClear':
        hud.showBanner(`Wave ${event.wave} Cleared  +${event.bonus}`, 2400)
        audio.chime()
        break
      case 'resupply':
        hud.showBanner('Resupplied', 900)
        audio.refill()
        break
      case 'canisterSwap':
        hud.showBanner(event.remaining > 0 ? `Canister Swapped · ${event.remaining} Left` : 'Last Canister', 1200)
        audio.refill()
        break
      case 'death':
        effects.addShake(1)
        audio.boom()
        audio.play('player-death', { volume: 0.7, rate: 0.85 })
        break
      case 'hook':
        audio.click()
        break
      case 'unhook':
        break // ropes render straight from state
    }
  }
}

// --- main loop ----------------------------------------------------------------

let last = performance.now()
let acc = 0
let prevPhase = game.phase
let pauseShown = false

renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min(now - last, 100) / 1000
  last = now
  const locked = document.pointerLockElement === renderer.domElement
  const simActive = game.phase === 'playing' && (locked || debug.autopilot)

  if (simActive) {
    if (pauseShown) {
      hud.hideStart()
      pauseShown = false
    }
    const input = buildInput()
    acc += dt
    while (acc >= SIM_DT) {
      stepGame(game, input, SIM_DT)
      handleEvents(game.events)
      acc -= SIM_DT
    }
    gasAudible = input.gas && game.player.gas > 0 && !game.player.onGround
  } else {
    gasAudible = false
    if (game.phase === 'playing' && !debug.autopilot && !debug.silent && !pauseShown) {
      hud.showStart(true)
      pauseShown = true
    }
  }

  if (game.phase !== prevPhase) {
    if (game.phase === 'upgrading') {
      document.exitPointerLock()
      hud.showUpgrades(game.offers)
    } else if (game.phase === 'dead') {
      document.exitPointerLock()
      hud.showDeath(game)
    }
    prevPhase = game.phase
  }

  camera.rotation.y = yaw
  camera.rotation.x = pitch
  camera.position.copy(game.player.pos)
  const speed = game.player.vel.length()
  const targetFov = 75 + 22 * Math.min(1, Math.max(0, (speed - 12) / 55))
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8)
  camera.updateProjectionMatrix()
  effects.applyShake(camera)

  titanPool.sync(game.titans, dt)
  blade.update(dt)
  effects.syncRopes(game.player, camera)
  effects.update(dt, camera, game.player.vel)

  audio.setWind(simActive ? speed : 0)
  audio.setGas(gasAudible)
  audio.setDucked((game.phase === 'playing' && !simActive && !debug.silent) || game.phase === 'menu')
  roarTimer -= dt
  if (roarTimer <= 0) {
    roarTimer = 4 + Math.random() * 6
    if (simActive) {
      const alive = game.titans.filter((t) => t.hp > 0)
      const titan = alive[Math.floor(Math.random() * alive.length)]
      if (titan) {
        const dist = titan.pos.distanceTo(game.player.pos)
        audio.playAt([ROARS[titan.id % ROARS.length]!], dist, {
          volume: titan.state === 'chase' || titan.state === 'leap' ? 1.1 : 0.7,
        })
      }
    }
  }

  const lookDir = camera.getWorldDirection(new Vector3())
  const hookInRange =
    game.phase === 'playing' &&
    raycastHookTarget(game.arena, game.player.pos, lookDir, game.player.config.hookRange) !== null
  const nearStation =
    Math.hypot(game.player.pos.x - game.arena.station.x, game.player.pos.z - game.arena.station.z) <= 10
  hud.update(game, { speed, nearStation, hookInRange })

  renderer.render(scene, camera)
})

// --- debug hook for browser automation (playwriter) --------------------------

interface DebugStepInput {
  gas?: boolean
  jump?: boolean
  slash?: boolean
  hookL?: boolean
  hookR?: boolean
  resupply?: boolean
  look?: [number, number, number]
  move?: [number, number]
}

function snapshot() {
  return {
    phase: game.phase,
    wave: game.wave,
    score: game.score.score,
    hp: game.player.hp,
    gas: Math.round(game.player.gas),
    canisters: game.player.canisters,
    blades: game.player.blades,
    pos: game.player.pos.toArray().map((v) => Math.round(v * 10) / 10),
    speed: Math.round(game.player.vel.length() * 10) / 10,
    titansAlive: game.titans.filter((t) => t.hp > 0).length,
    hooks: game.player.hooks.map((h) => h.state),
    buildings: game.arena.buildings.length,
  }
}

;(window as unknown as Record<string, unknown>).__aot = {
  game,
  seed,
  snapshot,
  setAutopilot(value: boolean) {
    debug.autopilot = value
  },
  audioDebug() {
    return { state: audio.state, loaded: audio.loadedCount, ducked: audio.ducked }
  },
  fxSlash() {
    blade.slash()
  },
  setSilent(value: boolean) {
    debug.silent = value
    if (value) {
      hud.hideStart()
      pauseShown = false
    }
  },
  start() {
    hud.hideStart()
    hud.hideDeath()
    startGame(game)
    prevPhase = game.phase
    return snapshot()
  },
  pickUpgrade(index = 0) {
    const offer = game.offers[index]
    if (offer) {
      chooseUpgrade(game, offer.id)
      prevPhase = game.phase
      hud.hideUpgrades()
    }
    return snapshot()
  },
  step(ticks = 1, partial: DebugStepInput = {}) {
    const input = neutralInput()
    input.gas = partial.gas ?? false
    input.jump = partial.jump ?? false
    input.slash = partial.slash ?? false
    input.hookL = partial.hookL ?? false
    input.hookR = partial.hookR ?? false
    input.resupply = partial.resupply ?? false
    if (partial.look) input.lookDir.set(...partial.look).normalize()
    if (partial.move) input.move.set(partial.move[0], 0, partial.move[1])
    for (let i = 0; i < ticks; i++) stepGame(game, input, SIM_DT)
    return snapshot()
  },
}

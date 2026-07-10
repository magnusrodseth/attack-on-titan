import { PerspectiveCamera, Vector3, WebGLRenderer } from 'three'
import { AudioSystem, FLINCHES, GRUNTS, ROARS, SLASHES } from './audio'
import { CoopSession } from './coopSession'
import { Hud } from './hud'
import type { Account } from './net/client'
import { clearAccount, fetchLeaderboard, loadAccount, login, register } from './net/client'
import type { Leaderboard } from './net/protocol'
import { generateRoomCode, normalizeRoomCode } from './net/protocol'
import { BladeView } from './render/blade'
import { Effects } from './render/effects'
import { FlashlightBeam } from './render/flashlight'
import { GatesView } from './render/gates'
import { PerfHud } from './render/perf'
import { buildScene } from './render/scene'
import { SoldierPool } from './render/soldiers'
import { SpearsView } from './render/spears'
import { TitanPool } from './render/titanPool'
import { raycastHookTarget } from './sim/city'
import { SIM_DT } from './sim/constants'
import { clockFraction } from './sim/daynight'
import { LAMP_BATTERY_SECONDS, lampGlow, lampOn } from './sim/flashlight'
import type { CoopEvent } from './sim/coop'
import { musterPos } from './sim/coop'
import { stepCoopClient } from './sim/coopClient'
import type { GameEvent } from './sim/game'
import { chooseUpgrade, createGame, FOCUS_TIME_SCALE, startGame, stepGame } from './sim/game'
import { DEFAULT_MODE_ID, GAME_MODES } from './sim/modes'
import type { SavedRun } from './sim/persist'
import { restoreRun, serializeRun } from './sim/persist'
import { Minimap } from './minimap'
import type { InputState } from './sim/player'
import { createPlayer, neutralInput } from './sim/player'
import { restartRace } from './sim/race'
import { releaseHook } from './sim/rope'
import { createScore } from './sim/score'
import { SPEAR_FUSE } from './sim/spear'
import { anklePos, isFootballer, napeCenter } from './sim/titan'
import { isMatchday } from './sim/waves'
import { UPGRADE_POOL, applyUpgrade } from './sim/upgrades'

function dailySeed(): string {
  const d = new Date()
  return `wall-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const MODE_KEY = 'aot-odm-mode'
function storedModeId(): string | null {
  try {
    return localStorage.getItem(MODE_KEY)
  } catch {
    return null
  }
}

// refresh-proof persistence: a saved run pins its own seed and mode, so a plain reload
// (no explicit URL overrides) drops back into exactly the run that was interrupted
const RUN_KEY = 'aot-odm-run'
function loadRunSave(): SavedRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    return raw ? (JSON.parse(raw) as SavedRun) : null
  } catch {
    return null
  }
}
const runSave = loadRunSave()

const urlParams = new URLSearchParams(location.search)
// ?lobby=CODE means co-op: the room code pins the city seed so every client (and the
// server) builds the identical district before the match even starts
const lobbyCode = normalizeRoomCode(urlParams.get('lobby') ?? '')
const coopMode = lobbyCode !== null
// dev playground: a statue gallery with free flight and nothing that bites; the
// import.meta.env.DEV guard makes this a compile-time false in production builds
const playgroundMode = import.meta.env.DEV && !coopMode && urlParams.get('playground') === '1'
const seed = coopMode ? `coop-${lobbyCode.toLowerCase()}` : (urlParams.get('seed') ?? runSave?.seed ?? dailySeed())
const modeId = urlParams.get('mode') ?? (coopMode ? DEFAULT_MODE_ID : (runSave?.modeId ?? storedModeId() ?? DEFAULT_MODE_ID))
const game = createGame(seed, undefined, modeId)
const { scene, updateScenery, dayNight } = buildScene(game.arena)
const camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 900)
camera.rotation.order = 'YXZ'

const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)
const perf = new PerfHud()

scene.add(camera) // camera children (blade viewmodel) need the camera in the scene graph
const titanPool = new TitanPool(scene)
const soldierPool = new SoldierPool(scene)
const effects = new Effects(scene)
const flashlight = new FlashlightBeam(scene)
const hud = new Hud(seed)
const blade = new BladeView(camera)
const audio = new AudioSystem()
const minimap = new Minimap(game.arena)
const spearsView = new SpearsView(scene)
const gatesView = new GatesView(scene)
hud.setRaceUi(game.mode.id === 'race')
let roarTimer = 3

// --- input -----------------------------------------------------------------

const keys = new Set<string>()
let mouseL = false
let mouseM = false
let mouseR = false
let yaw = 0
let pitch = 0
const debug = { autopilot: false, silent: false, clockOverride: null as number | null }

window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (['Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyR'].includes(e.code)) e.preventDefault()
  if (e.code === 'F3') {
    perf.toggle()
    e.preventDefault()
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseL = true
  if (e.button === 1) {
    mouseM = true
    e.preventDefault() // middle-click must fire a spear, not start autoscroll
  }
  if (e.button === 2) mouseR = true
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseL = false
  if (e.button === 1) mouseM = false
  if (e.button === 2) mouseR = false
})
window.addEventListener('contextmenu', (e) => e.preventDefault())
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return
  const look = 0.0023 * settings.sensitivity
  yaw -= e.movementX * look
  pitch = Math.min(1.45, Math.max(-1.45, pitch - e.movementY * look))
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
  if (hud.settingsOpen || hud.modesOpen || hud.leaderboardOpen || (hud.coopOpen && !coopMode)) {
    // Escape backs out of a panel to the menu underneath instead of resuming
    hud.hideSettings()
    hud.hideModes()
    hud.hideLeaderboard()
    if (!coopMode) {
      hud.hideCoop()
      hud.showStart(game.phase === 'playing')
    }
    return
  }
  if (game.phase !== 'playing' || document.pointerLockElement === renderer.domElement) return
  if (playgroundMode) return // the playground drawer owns unlock; clicking the city resumes
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
  input.focus = keys.has('KeyQ')
  input.slash = keys.has('KeyF')
  input.fire = keys.has('KeyE') || mouseM
  input.hookL = mouseL || keys.has('KeyJ')
  input.hookR = mouseR || keys.has('KeyK')
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

// phones and tablets cannot drive this control scheme: gate them out, on brand
const touchOnly =
  matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches
if (touchOnly) document.getElementById('mobile-gate')?.classList.remove('hidden')

function beginRun(): void {
  if (touchOnly) return
  audio.init()
  hud.hideStart()
  hud.hideDeath()
  hud.hideRaceResults()
  pauseShown = false
  if (game.phase === 'menu' || game.phase === 'dead' || game.phase === 'finished') {
    startGame(game)
    prevPhase = game.phase
    if (waveBased()) announceWave(game.wave)
    else hud.showBanner(game.mode.name)
    persistRun()
  }
  lockPointer()
}

const waveBased = () => game.mode.id === 'waves' || game.mode.id === 'matchday'

/** Every 3rd wave the footballers walk; in Matchday mode, every wave is theirs. */
function announceWave(wave: number): void {
  if (game.mode.id === 'matchday' || isMatchday(wave)) {
    hud.showBanner(`Matchday · Wave ${wave}`, 3000)
    audio.boom()
  } else {
    hud.showBanner(`Wave ${wave}`)
  }
}

// settings: persisted sliders applied live to the audio buses and mouse look
const SETTINGS_KEY = 'aot-odm-settings'
function loadSettings(): { music: number; sfx: number; sensitivity: number } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ music: number; sfx: number; sensitivity: number }>
      return { music: parsed.music ?? 0.7, sfx: parsed.sfx ?? 1, sensitivity: parsed.sensitivity ?? 1 }
    }
  } catch {
    // corrupt storage falls through to defaults
  }
  return { music: 0.7, sfx: 1, sensitivity: 1 }
}
const settings = loadSettings()
audio.setMusicVolume(settings.music)
audio.setSfxVolume(settings.sfx)
hud.initSettings(settings)
hud.onOpenSettings = () => hud.showSettings()
hud.onCloseSettings = () => {
  hud.hideSettings()
  hud.showStart(game.phase === 'playing')
}
hud.onSettingsChange = (values) => {
  Object.assign(settings, values)
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // private mode: settings just do not persist
  }
  audio.setMusicVolume(values.music)
  audio.setSfxVolume(values.sfx)
}

// game modes: pick in the menu; switching reloads into the new mode (URL carries it)
hud.onOpenModes = () => hud.showModes(GAME_MODES, game.mode.id)
hud.onCloseModes = () => {
  hud.hideModes()
  hud.showStart(game.phase === 'playing')
}
hud.onPickMode = (id) => {
  if (id === game.mode.id) {
    hud.onCloseModes()
    return
  }
  try {
    localStorage.setItem(MODE_KEY, id)
  } catch {
    // private mode: the URL param below still carries the choice
  }
  const params = new URLSearchParams(location.search)
  params.set('mode', id)
  location.search = params.toString()
}

hud.onStart = beginRun
hud.onRetry = beginRun
// the finish screen's "Run It Again" relights the same line without a full startGame
hud.onRaceAgain = () => {
  if (touchOnly) return
  audio.init()
  hud.hideRaceResults()
  restartRace(game)
  prevPhase = game.phase
  lockPointer()
}
// R restarts straight off the finish screen; mid-run R is handled inside the sim
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && game.phase === 'finished') hud.onRaceAgain()
})
hud.onRestart = () => {
  // abandon the current round and take the field again from wave 1, same seed and mode
  if (touchOnly) return
  audio.init()
  hud.hideStart()
  pauseShown = false
  clearRun()
  startGame(game)
  prevPhase = game.phase
  if (waveBased()) announceWave(game.wave)
  else hud.showBanner(game.mode.name)
  persistRun()
  lockPointer()
}
hud.onPickUpgrade = (id) => {
  audio.init()
  audio.chime()
  if (coopMode) {
    coop?.sendPick(id) // the server confirms with an upgradePicked event
    return
  }
  chooseUpgrade(game, id)
  prevPhase = game.phase
  hud.hideUpgrades()
  announceWave(game.wave)
  persistRun()
  lockPointer()
}

// --- run persistence: refreshing the page loses nothing --------------------

function persistRun(): void {
  if (coopMode || playgroundMode) return // neither belongs in the solo save slot
  if (game.phase !== 'playing' && game.phase !== 'upgrading') return
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(serializeRun(game, { yaw, pitch })))
  } catch {
    // storage full or private mode: the run simply is not refresh-proof
  }
}

function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY)
  } catch {
    // nothing to clear
  }
}

window.addEventListener('pagehide', persistRun)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistRun()
})

const restored = !coopMode && !playgroundMode && runSave !== null && restoreRun(runSave, game)
if (restored) {
  if (runSave?.view) {
    yaw = runSave.view.yaw
    pitch = runSave.view.pitch
  }
  if (game.phase === 'upgrading') {
    hud.hideStart()
    hud.showUpgrades(game.offers)
  } else {
    hud.showStart(true) // straight back to the paused run: one click resumes
  }
} else if (!coopMode && !playgroundMode) {
  hud.showStart()
}

// --- co-op: lobby flow, match mirrors, server events -------------------------

let coop: CoopSession | null = null
let spectating = false
let coopInputTimer = 0
const COOP_ERROR_KEY = 'aot-coop-error'

function coopJoinUrl(code: string): string {
  return `${location.origin}${location.pathname}?lobby=${encodeURIComponent(code)}`
}

function gotoLobby(code: string | null): void {
  const params = new URLSearchParams(location.search)
  params.delete('seed') // a lobby's city comes from its code
  if (code) params.set('lobby', code)
  else params.delete('lobby')
  location.search = params.toString()
}

function connectCoop(account: Account): void {
  if (!lobbyCode) return
  hud.hideCoop()
  hud.setCoopUi(true)
  coop = new CoopSession(lobbyCode, account, {
    onLobby(lobby) {
      // the lobby overlay belongs to the lobby phase only; spectators watch the fight
      if (lobby.phase === 'lobby') {
        hud.showLobby(lobby, coopJoinUrl(lobby.code))
        hud.hideResults()
        spectating = false
        soldierPool.clear()
        game.titans = []
        hud.updateSquad([])
      } else if (lobby.phase === 'match' && !coop?.playing && hud.lobbyOpen) {
        hud.hideLobby()
        hud.showBanner('Battle Under Way · You Muster Next Match', 3200)
      }
    },
    onMatchStart(roster) {
      startCoopMatch(roster)
    },
    onEvents(events) {
      handleCoopEvents(events)
    },
    onResults(results) {
      document.exitPointerLock()
      hud.hideUpgrades()
      hud.setPickStatus('')
      hud.hideLobby()
      hud.showResults(results, coop?.me ?? '', coop?.isCreator ?? false)
    },
    onFatal(message) {
      try {
        sessionStorage.setItem(COOP_ERROR_KEY, message)
      } catch {
        // the message is a nicety; losing it is fine
      }
      gotoLobby(null)
    },
  })
}

function startCoopMatch(roster: string[]): void {
  hud.hideLobby()
  hud.hideResults()
  hud.hideUpgrades()
  hud.hideStart()
  hud.setPickStatus('')
  pauseShown = false
  spectating = false
  soldierPool.clear()
  game.titans = []
  game.phase = 'playing'
  game.wave = 1
  game.time = 0
  game.score = createScore()
  game.offers = []
  game.player = createPlayer()
  const index = Math.max(0, roster.indexOf(coop?.me ?? ''))
  game.player.pos.copy(musterPos(index, Math.max(1, roster.length)))
  prevPhase = game.phase
  audio.init()
  if (coop?.playing) {
    hud.showBanner('Wave 1')
    lockPointer()
  }
}

/** Local intents from stepCoopClient: swing/whoosh instantly, let the server judge. */
function handleCoopIntents(events: GameEvent[]): void {
  const passthrough: GameEvent[] = []
  for (const event of events) {
    if (event.type === 'coopSlash') {
      blade.slash()
      audio.play(SLASHES, { volume: 0.55 })
      coop?.sendSlash()
    } else if (event.type === 'coopFire') {
      audio.spearLaunch() // whoosh instantly; the server launches the real spear
      effects.addShake(0.1)
      const look = camera.getWorldDirection(new Vector3())
      coop?.sendFire({ x: look.x, y: look.y, z: look.z })
    } else if (event.type === 'coopResupply') {
      coop?.sendResupply()
    } else {
      passthrough.push(event)
    }
  }
  handleEvents(passthrough)
}

function handleCoopEvents(events: CoopEvent[]): void {
  if (!coop) return
  const me = coop.me
  for (const event of events) {
    switch (event.type) {
      case 'slash': {
        if (event.playerId !== me) break
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
      }
      case 'kill': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        const star = isFootballer(event.kind)
        const aberrant = event.kind === 'abnormal' || star
        if (titan) {
          const nape = napeCenter(titan)
          effects.burst(nape, 0xd42b35, aberrant ? 52 : 40)
          effects.burst(nape.clone().add(new Vector3(0, 2.2, 0)), 0xbfc7cc, 26)
          audio.playAt('death-groan', titan.pos.distanceTo(game.player.pos), { volume: 1.2 })
        }
        if (event.playerId === me) {
          effects.addShake(aberrant ? 0.6 : 0.45)
          hitstop = aberrant ? 0.14 : 0.09
          audio.killHit(aberrant ? 0.85 : 0.65)
          if (audio.has('aberrant-slain')) {
            audio.play('aberrant-slain', { volume: aberrant ? 0.95 : 0.4, rate: aberrant ? 1 : 1.25 })
          }
          if (star) hud.showBanner(event.kind === 'striker' ? 'Striker Sent Off!' : 'Captain Sent Off!', 2000)
          else if (aberrant) hud.showBanner('Aberrant Slain!', 1600)
          hud.popPoints(event.points, event.oneCut, event.heartGained)
        } else {
          audio.killHit(0.25)
          const prey = star ? `the ${event.kind === 'striker' ? 'Striker' : 'Captain'}` : aberrant ? 'an aberrant' : 'a titan'
          hud.addFeedLine(`<b>${event.playerId}</b> slew ${prey} +${event.points}`)
        }
        break
      }
      case 'ankleSliced': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        if (titan) effects.burst(anklePos(titan, event.side), 0xd42b35, 18)
        if (event.playerId === me) {
          hud.popText(event.remaining > 0 ? 'Ankle!' : 'Both Ankles!')
          audio.play('slice', { volume: 0.7, rate: 1.25 })
          effects.addShake(0.15)
        }
        break
      }
      case 'crippled': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        if (titan) audio.playAt(ROARS, titan.pos.distanceTo(game.player.pos), { volume: 1.4, rate: 0.75 })
        hud.showBanner('Crippled · Take the Nape!', 1800)
        break
      }
      case 'bladeBroke':
        if (event.playerId === me) {
          hud.showBanner('Blade Shattered', 900)
          audio.snap()
        }
        break
      case 'playerHit': {
        if (event.playerId !== me) break
        game.player.vel.x += event.knockback.x
        game.player.vel.y += event.knockback.y
        game.player.vel.z += event.knockback.z
        game.player.invulnTimer = 1.2
        hud.showHit()
        effects.addShake(0.6)
        audio.thud(0.9)
        audio.play(GRUNTS, { volume: 0.8, rate: 0.7 })
        break
      }
      case 'playerDied':
        if (event.playerId === me) {
          spectating = true
          for (const hook of game.player.hooks) releaseHook(hook)
          document.exitPointerLock()
          effects.addShake(1)
          audio.play('player-death', { volume: 0.7, rate: 0.85 })
          hud.showBanner('Devoured · Watching the Squad', 2600)
        } else {
          hud.addFeedLine(`<b>${event.playerId}</b> was devoured`)
        }
        break
      case 'respawn':
        if (event.playerId === me) {
          spectating = false
          game.player.pos.set(event.pos.x, event.pos.y, event.pos.z)
          game.player.vel.set(0, 0, 0)
          hud.showBanner('Back in the Fight', 1600)
          lockPointer()
        } else {
          hud.addFeedLine(`<b>${event.playerId}</b> returned to the fight`)
        }
        break
      case 'resupply':
        if (event.playerId === me) {
          game.player.gas = game.player.config.maxGas
          game.player.canisters = game.player.config.gasCanisters
          game.player.lamp = LAMP_BATTERY_SECONDS
          hud.showBanner('Resupplied', 900)
          audio.refill()
        }
        break
      case 'spearFired':
        if (event.playerId !== me) audio.spearLaunch() // mine whooshed on the intent already
        break
      case 'spearStuck':
        audio.thud(0.35)
        break
      case 'spearFizzled':
        audio.fizzle()
        break
      case 'spearDetonated': {
        const pos = new Vector3(event.pos.x, event.pos.y, event.pos.z)
        effects.burst(pos, 0xffb347, 60) // fireball
        effects.burst(pos.clone().add(new Vector3(0, 1.5, 0)), 0x8a8a90, 40) // smoke
        effects.addShake(0.7)
        audio.spearBoom(pos.distanceTo(game.player.pos))
        break
      }
      case 'staggered':
        hud.popText('Staggered!')
        break
      case 'spearPickup':
        if (event.playerId === me) {
          hud.showBanner(`Thunder Spear Racked · ${event.remaining}`, 1200)
          audio.pickupChime()
        }
        break
      case 'blasted':
        // thrown by a teammate's blast: knockback only, no heart lost
        if (event.playerId === me) {
          game.player.vel.x += event.knockback.x
          game.player.vel.y += event.knockback.y
          game.player.vel.z += event.knockback.z
          effects.addShake(0.5)
          audio.play(GRUNTS, { volume: 0.6, rate: 0.85 })
        }
        break
      case 'waveClear':
        hud.showBanner(`Wave ${event.wave} Cleared  +${event.bonus}`, 2400)
        audio.chime()
        break
      case 'offers': {
        if (event.playerId !== me || !coop.playing) break
        document.exitPointerLock()
        const offers = event.upgradeIds
          .map((id) => UPGRADE_POOL.find((u) => u.id === id))
          .filter((u): u is NonNullable<typeof u> => u !== undefined)
        hud.hideStart()
        pauseShown = false
        hud.showUpgrades(offers)
        break
      }
      case 'upgradePicked':
        if (event.playerId === me) {
          applyUpgrade(game.player, event.upgradeId) // movement config; hp/blades mirror the server
          hud.showUpgrades([])
          hud.setPickStatus('Waiting for the squad…')
        }
        break
      case 'waveStart':
        hud.hideUpgrades()
        hud.setPickStatus('')
        announceWave(event.wave)
        if (coop.playing && !spectating) lockPointer()
        break
      case 'teamWipe':
        effects.addShake(1)
        audio.boom()
        break
    }
  }
}

if (coopMode) {
  hud.setCoopUi(true)
  hud.hideStart()
  const account = loadAccount()
  if (account) connectCoop(account)
  else hud.showCoop('auth')
} else {
  try {
    const coopError = sessionStorage.getItem(COOP_ERROR_KEY)
    if (coopError) {
      sessionStorage.removeItem(COOP_ERROR_KEY)
      const account = loadAccount()
      hud.showCoop(account ? 'room' : 'auth', account?.username ?? '')
      hud.coopError(coopError, account ? 'room' : 'auth')
    }
  } catch {
    // sessionStorage unavailable: skip the notice
  }
}

hud.onOpenCoop = () => {
  const account = loadAccount()
  hud.showCoop(account ? 'room' : 'auth', account?.username ?? '')
}
hud.onCloseCoop = () => {
  hud.hideCoop()
  if (coopMode) gotoLobby(null)
  else hud.showStart(game.phase === 'playing')
}
hud.onAuth = (mode, username, password) => {
  const request = mode === 'register' ? register(username, password) : login(username, password)
  void request.then((result) => {
    if (!result.ok) {
      hud.coopError(result.error, 'auth')
      return
    }
    if (coopMode) connectCoop(result.account)
    else hud.showCoop('room', result.account.username)
  })
}
hud.onSignOut = () => {
  clearAccount()
  hud.showCoop('auth')
}
hud.onCreateLobby = () => gotoLobby(generateRoomCode())
hud.onJoinLobby = (raw) => {
  const code = normalizeRoomCode(raw)
  if (!code) {
    hud.coopError('Codes look like TROST-7K', 'room')
    return
  }
  gotoLobby(code)
}
hud.onReadyToggle = () => {
  const meNow = coop?.lobby?.players.find((p) => p.id === coop?.me)
  coop?.sendReady(!(meNow?.ready ?? false))
}
hud.onStartMatch = () => coop?.sendStart()
hud.onLeaveLobby = () => {
  coop?.leave()
  gotoLobby(null)
}
hud.onRematch = () => coop?.sendRematch()
// stale-while-revalidate: paint the cached board instantly, refresh in the background
const LB_CACHE_KEY = 'aot-leaderboard-cache'
let leaderboardCache: Leaderboard | null = null
try {
  const raw = localStorage.getItem(LB_CACHE_KEY)
  if (raw) leaderboardCache = JSON.parse(raw) as Leaderboard
} catch {
  // corrupt cache: first open shows skeletons instead
}
hud.onOpenLeaderboard = () => {
  hud.showLeaderboard(leaderboardCache, leaderboardCache ? 'ready' : 'loading')
  void fetchLeaderboard().then((data) => {
    if (data) {
      leaderboardCache = data
      try {
        localStorage.setItem(LB_CACHE_KEY, JSON.stringify(data))
      } catch {
        // cache is a nicety
      }
      if (hud.leaderboardOpen) hud.showLeaderboard(data)
    } else if (!leaderboardCache && hud.leaderboardOpen) {
      hud.showLeaderboard(null, 'error')
    }
  })
}
hud.onCloseLeaderboard = () => {
  hud.hideLeaderboard()
  if (!coopMode) hud.showStart(game.phase === 'playing')
}

// --- dev playground (compile-time false in production) -----------------------

let devFrame: ((dt: number) => void) | null = null
if (import.meta.env.DEV) {
  void import('./dev/playground').then(({ initDev }) => {
    devFrame = initDev({
      playground: playgroundMode,
      game,
      scene,
      camera,
      hud,
      soldierPool,
      canvas: renderer.domElement,
      enterWorld: () => {
        audio.init()
        lockPointer()
      },
      setView: (y, p) => {
        yaw = y
        pitch = p
      },
      setClock: (f) => {
        debug.clockOverride = f
      },
    })
  })
}

/** Playground: slashes are pure spectacle and resupply refills locally; nothing judges. */
function handlePlaygroundIntents(events: GameEvent[]): void {
  const passthrough: GameEvent[] = []
  for (const event of events) {
    if (event.type === 'coopSlash') {
      blade.slash()
      audio.play(SLASHES, { volume: 0.55 })
    } else if (event.type === 'coopResupply') {
      const p = game.player
      p.gas = p.config.maxGas
      p.canisters = p.config.gasCanisters
      p.blades = p.config.bladePairs
      p.bladeHp = p.config.bladeDurability
      p.lamp = LAMP_BATTERY_SECONDS
      hud.showBanner('Resupplied', 900)
      audio.refill()
    } else {
      passthrough.push(event)
    }
  }
  handleEvents(passthrough)
}

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
        const star = isFootballer(event.kind)
        const aberrant = event.kind === 'abnormal' || star
        if (titan) {
          const nape = napeCenter(titan)
          effects.burst(nape, 0xd42b35, aberrant ? 52 : 40) // blood
          effects.burst(nape.clone().add(new Vector3(0, 2.2, 0)), 0xbfc7cc, 26) // steam
          audio.playAt('death-groan', titan.pos.distanceTo(game.player.pos), { volume: 1.2 })
        }
        effects.addShake(aberrant ? 0.6 : 0.45)
        hitstop = aberrant ? 0.14 : 0.09 // a heartbeat of frozen time sells the cut
        audio.killHit(aberrant ? 0.85 : 0.65)
        if (audio.has('aberrant-slain')) {
          audio.play('aberrant-slain', { volume: aberrant ? 0.95 : 0.4, rate: aberrant ? 1 : 1.25 })
        }
        if (star) hud.showBanner(event.kind === 'striker' ? 'Striker Sent Off!' : 'Captain Sent Off!', 2000)
        else if (aberrant) hud.showBanner('Aberrant Slain!', 1600)
        hud.popPoints(event.points, event.oneCut, event.heartGained)
        break
      }
      case 'ankleSliced': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        if (titan) effects.burst(anklePos(titan, event.side), 0xd42b35, 18)
        hud.popText(event.remaining > 0 ? 'Ankle!' : 'Both Ankles!')
        audio.play('slice', { volume: 0.7, rate: 1.25 })
        audio.play(FLINCHES, { volume: 0.7 })
        effects.addShake(0.15)
        break
      }
      case 'empty':
        if (event.kind === 'blades') {
          blade.jam()
          if (audio.has('empty-click')) audio.play('empty-click', { volume: 0.8 })
          else audio.click()
          hud.popText('Out of Blades · Resupply!')
        } else if (event.kind === 'spears') {
          audio.click()
          hud.popText('No Spears · Find a Cache!')
        } else {
          if (audio.has('gas-empty')) audio.play('gas-empty', { volume: 0.8 })
          else audio.click()
          hud.popText('Out of Gas · Resupply!')
        }
        break
      case 'crippled': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        if (titan) {
          audio.playAt(ROARS, titan.pos.distanceTo(game.player.pos), { volume: 1.4, rate: 0.75 })
        }
        hud.showBanner('Crippled · Take the Nape!', 1800)
        effects.addShake(0.35)
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
      case 'lampLow':
        hud.showBanner('Lamp Fading · Recharge at the Station', 2200)
        audio.click()
        break
      case 'lampDead':
        hud.showBanner('Lamp Dead · Recharge at the Station', 2600)
        audio.click()
        break
      case 'canisterSwap':
        hud.showBanner(event.remaining > 0 ? `Canister Swapped · ${event.remaining} Left` : 'Last Canister', 1200)
        audio.refill()
        break
      case 'boost':
        audio.gasBurst()
        effects.addShake(0.08)
        break
      case 'death':
        effects.addShake(1)
        audio.boom()
        audio.play('player-death', { volume: 0.7, rate: 0.85 })
        break
      case 'hook':
        audio.click()
        effects.launchHook(event.index)
        break
      case 'unhook':
        break // ropes render straight from state
      case 'spearFired':
        audio.spearLaunch()
        effects.addShake(0.1)
        break
      case 'spearStuck':
        audio.thud(0.35)
        break
      case 'spearFizzled':
        audio.fizzle()
        break
      case 'spearDetonated':
        effects.burst(event.pos, 0xffb347, 60) // fireball
        effects.burst(event.pos.clone().add(new Vector3(0, 1.5, 0)), 0x8a8a90, 40) // smoke
        effects.addShake(0.7)
        audio.spearBoom(event.pos.distanceTo(game.player.pos))
        break
      case 'staggered':
        hud.popText('Staggered!')
        break
      case 'spearPickup':
        hud.showBanner(`Thunder Spear Racked · ${event.remaining}`, 1200)
        audio.pickupChime()
        break
      case 'gatePass': {
        // the flare pops in a puff of its own smoke and the column dies with it
        const gate = game.race?.course.gates[event.index]
        if (gate) {
          const pos = new Vector3(gate.x, gate.y, gate.z)
          const last = event.index === event.total - 1
          effects.burst(pos, last ? 0xe8402f : 0x37e06b, 44)
          effects.burst(pos.clone().add(new Vector3(0, 1.5, 0)), 0xbfc7cc, 22)
        }
        audio.pickupChime()
        hud.raceSplitFlash(event.delta, event.split)
        break
      }
      case 'raceFinished':
        audio.chime()
        effects.addShake(0.25)
        break
      case 'raceArmed':
      case 'raceRestart':
        break // the HUD and the columns re-derive from race state
    }
  }
}

// armed spears beep faster and higher as their fuses run down
const beepTimers = new Map<number, number>()
function updateSpearBeeps(dt: number): void {
  for (const spear of game.spears) {
    if (spear.phase !== 'stuck') continue
    const timer = (beepTimers.get(spear.id) ?? 0) - dt
    if (timer > 0) {
      beepTimers.set(spear.id, timer)
      continue
    }
    const urgency = 1 - Math.max(0, spear.fuse) / SPEAR_FUSE
    audio.spearBeep(urgency, spear.pos.distanceTo(game.player.pos))
    beepTimers.set(spear.id, 0.45 - 0.33 * urgency)
  }
  for (const id of beepTimers.keys()) {
    if (!game.spears.some((s) => s.id === id)) beepTimers.delete(id)
  }
}

// --- main loop ----------------------------------------------------------------

let last = performance.now()
let acc = 0
let prevPhase = game.phase
let pauseShown = false
let prevCrippled = new Set<number>()
let saveTimer = 0
let hitstop = 0 // brief sim freeze on kills; rendering continues

renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min(now - last, 100) / 1000
  last = now
  const locked = document.pointerLockElement === renderer.domElement
  const coopBattle = coop !== null && coop.phase === 'match'
  const piloting = coopBattle && (coop?.playing ?? false) && !spectating
  const simActive = !coopMode && game.phase === 'playing' && (locked || debug.autopilot)
  const inAction = coopBattle ? piloting && locked : simActive

  if (coopBattle && coop) {
    const intermission = coop.buf.b?.phase === 'upgrading'
    if (piloting && (locked || debug.autopilot)) {
      if (pauseShown) {
        hud.hideStart()
        pauseShown = false
      }
      const input = buildInput()
      if (hitstop > 0) hitstop -= dt
      else acc += dt
      while (acc >= SIM_DT) {
        stepCoopClient(game, input, SIM_DT)
        handleCoopIntents(game.events)
        acc -= SIM_DT
      }
    } else if (piloting && !intermission && !debug.autopilot && !debug.silent && !pauseShown) {
      hud.showStart(true)
      hud.showBanner('The Battle Rages On…', 2600) // a shared world does not pause
      pauseShown = true
    }
    coop.syncFrame(game, now, dt)
    game.wave = coop.buf.b?.wave ?? game.wave
    soldierPool.sync(coop.soldiers, dt)
    coopInputTimer += dt
    if (piloting && coopInputTimer >= 0.05) {
      coopInputTimer = 0
      coop.sendInput(game, yaw, pitch)
    }
    const snapPlayers = (coop.buf.b?.players ?? []).filter((p) => p.connected)
    hud.updateSquad(
      snapPlayers.map((p) => ({
        id: p.id,
        hp: p.hp,
        maxHp: p.maxHp,
        score: p.score,
        alive: p.alive,
        me: p.id === coop?.me,
      })),
    )
    if (intermission && piloting) {
      const meSnap = snapPlayers.find((p) => p.id === coop?.me)
      hud.setPickStatus(
        meSnap?.picked ? 'Waiting for the squad…' : `${Math.ceil(coop.myPickTimer())} s to choose`,
      )
    }
  } else if (playgroundMode && game.phase === 'playing') {
    // statue gallery: the local soldier flies via the co-op pilot (no titan AI, no waves)
    if (locked || debug.autopilot) {
      const input = buildInput()
      acc += dt
      while (acc >= SIM_DT) {
        stepCoopClient(game, input, SIM_DT)
        handlePlaygroundIntents(game.events)
        acc -= SIM_DT
      }
    }
    devFrame?.(dt)
  } else if (simActive) {
    if (pauseShown) {
      hud.hideStart()
      pauseShown = false
    }
    const input = buildInput()
    if (hitstop > 0) hitstop -= dt
    else acc += dt * (game.focusActive ? FOCUS_TIME_SCALE : 1)
    while (acc >= SIM_DT) {
      stepGame(game, input, SIM_DT)
      handleEvents(game.events)
      acc -= SIM_DT
    }
  } else if (!coopMode && game.phase === 'playing' && !debug.autopilot && !debug.silent && !pauseShown) {
    hud.showStart(true)
    pauseShown = true
  }

  if (game.phase !== prevPhase) {
    if (game.phase === 'upgrading' || game.phase === 'dead' || game.phase === 'finished') {
      document.exitPointerLock()
      hud.hideStart() // a lingering pause overlay must not sit under the new menu
      hud.hideSettings()
      hud.hideModes()
      pauseShown = false
      if (game.phase === 'upgrading') {
        hud.showUpgrades(game.offers)
        persistRun()
      } else if (game.phase === 'finished') {
        hud.showRaceResults(game)
        clearRun() // a finished run must not resurrect on refresh
      } else {
        hud.showDeath(game)
        clearRun()
      }
    }
    prevPhase = game.phase
  }

  camera.rotation.y = yaw
  camera.rotation.x = pitch
  if (coopBattle && coop && (spectating || !coop.playing)) {
    // dead or late to the muster: orbit a living teammate instead of a corpse
    const target = coop.livingTeammate()
    if (target) {
      const dir = camera.getWorldDirection(new Vector3())
      camera.position.copy(target.pos).addScaledVector(dir, -9)
      camera.position.y += 2.5
    }
  } else {
    camera.position.copy(game.player.pos)
  }
  const speed = game.player.vel.length()
  const targetFov = 75 + 22 * Math.min(1, Math.max(0, (speed - 10) / 30))
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8)
  camera.updateProjectionMatrix()
  effects.applyShake(camera)

  titanPool.sync(game.titans, dt)
  spearsView.sync(game.spears, game.pickups, dt)
  gatesView.sync(game, now * 0.001)
  updateSpearBeeps(dt)
  updateScenery(dt, camera)
  const clock = debug.clockOverride ?? clockFraction(seed, game.time)
  dayNight.update(clock, camera)
  flashlight.update(camera, game.phase === 'menu' ? 0 : lampGlow(clock, game.player.lamp), now)
  blade.update(dt)
  effects.syncRopes(game.player, camera, dt)
  effects.update(dt, camera, game.player.vel)

  audio.setWind(inAction ? speed : 0)
  audio.setMuffled(game.focusActive)
  audio.setDucked((game.phase === 'playing' && !inAction && !debug.silent) || game.phase === 'menu')
  hud.setFocusVignette(game.focusActive)
  minimap.update(game, yaw)
  // a crippled titan leaving that state alive has regenerated and risen
  const crippledNow = new Set(
    game.titans.filter((t) => t.state === 'crippled').map((t) => t.id),
  )
  for (const id of prevCrippled) {
    if (!crippledNow.has(id)) {
      const titan = game.titans.find((t) => t.id === id)
      if (titan && titan.hp > 0 && game.phase === 'playing') {
        hud.showBanner('It Has Risen…', 1800)
        audio.playAt(ROARS, titan.pos.distanceTo(game.player.pos), { volume: 1.4, rate: 0.7 })
      }
    }
  }
  prevCrippled = crippledNow

  roarTimer -= dt
  if (roarTimer <= 0) {
    roarTimer = 4 + Math.random() * 6
    if (inAction) {
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
  const lamp =
    lampOn(clock) && game.phase !== 'menu' ? Math.min(1, game.player.lamp / LAMP_BATTERY_SECONDS) : null
  hud.update(game, { speed, nearStation, hookInRange, lamp })

  if (game.race) {
    // project the active gate: distance readout on screen, an edge caret when it is not
    const gate = game.race.course.gates[game.race.nextGate]
    if (gate && game.phase === 'playing') {
      const world = new Vector3(gate.x, gate.y, gate.z)
      const dist = world.distanceTo(game.player.pos)
      const ndc = world.project(camera)
      const behind = ndc.z > 1
      const onScreen = !behind && Math.abs(ndc.x) <= 0.92 && Math.abs(ndc.y) <= 0.88
      // behind the camera the NDC flips: negate so the caret points the right way
      let dx = behind ? -ndc.x : ndc.x
      let dy = behind ? -ndc.y : ndc.y
      if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dy = -1
      const scale = 0.92 / Math.max(Math.abs(dx), Math.abs(dy))
      dx *= scale
      dy *= scale
      hud.updateRace(game, {
        dist,
        onScreen,
        x: ((dx + 1) / 2) * innerWidth,
        y: ((1 - dy) / 2) * innerHeight,
        angle: Math.atan2(dx, dy), // 0 = up; the caret triangle points up by default
      })
    } else {
      hud.updateRace(game, null)
    }
  }

  saveTimer += dt
  if (saveTimer >= 1) {
    saveTimer = 0
    persistRun()
  }

  renderer.render(scene, camera)
  perf.sample(dt, renderer)
})

// --- debug hook for browser automation (playwriter) --------------------------

interface DebugStepInput {
  gas?: boolean
  jump?: boolean
  focus?: boolean
  slash?: boolean
  fire?: boolean
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
    spears: game.player.spears,
    spearsLive: game.spears.map((s) => ({ id: s.id, phase: s.phase, fuse: Math.round(s.fuse * 100) / 100 })),
    pickupsLeft: game.pickups.filter((pk) => !pk.taken).length,
    pos: game.player.pos.toArray().map((v) => Math.round(v * 10) / 10),
    speed: Math.round(game.player.vel.length() * 10) / 10,
    titansAlive: game.titans.filter((t) => t.hp > 0).length,
    hooks: game.player.hooks.map((h) => h.state),
    buildings: game.arena.buildings.length,
    clock: Math.round((debug.clockOverride ?? clockFraction(seed, game.time)) * 1000) / 1000,
    lamp: Math.round(game.player.lamp),
  }
}

;(window as unknown as Record<string, unknown>).__aot = {
  game,
  seed,
  scene,
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
  fxHook(index: 0 | 1 = 0) {
    effects.launchHook(index)
  },
  setSilent(value: boolean) {
    debug.silent = value
    if (value) {
      hud.hideStart()
      pauseShown = false
    }
  },
  // render-only clock override (0 = midnight, 0.5 = noon, null = follow the sim)
  setClock(fraction: number | null) {
    debug.clockOverride = fraction
  },
  // live graphics toggles for bisecting frame-budget cost (see src/render/perf.ts)
  gfx: {
    perf: (on?: boolean) => perf.toggle(on),
    // drop to 1 to test retina fill-rate; back to min(dpr,2) for the shipped look
    pixelRatio(n: number) {
      renderer.setPixelRatio(n)
      renderer.setSize(innerWidth, innerHeight)
    },
    // toggle the whole real-time shadow pass; materials recompile on the flip
    shadows(on: boolean) {
      renderer.shadowMap.enabled = on
      scene.traverse((obj) => {
        const mat = (obj as { material?: unknown }).material
        if (!mat) return
        for (const m of Array.isArray(mat) ? mat : [mat]) (m as { needsUpdate: boolean }).needsUpdate = true
      })
    },
    info: () => ({ ...renderer.info.render, ...renderer.info.memory, pixelRatio: renderer.getPixelRatio() }),
  },
  // aim the camera without pointer lock (headless verification)
  setView(newYaw: number, newPitch: number) {
    yaw = newYaw
    pitch = Math.min(1.45, Math.max(-1.45, newPitch))
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
    input.focus = partial.focus ?? false
    input.slash = partial.slash ?? false
    input.fire = partial.fire ?? false
    input.hookL = partial.hookL ?? false
    input.hookR = partial.hookR ?? false
    input.resupply = partial.resupply ?? false
    if (partial.look) input.lookDir.set(...partial.look).normalize()
    if (partial.move) input.move.set(partial.move[0], 0, partial.move[1])
    for (let i = 0; i < ticks; i++) {
      stepGame(game, input, SIM_DT)
      // route events exactly like the live loop so headless runs exercise HUD/FX/audio
      if (!coopMode) handleEvents(game.events)
    }
    return snapshot()
  },
  coop() {
    if (!coop) return { active: false as const, mode: coopMode }
    return {
      active: true as const,
      mode: coopMode,
      code: coop.code,
      me: coop.me,
      phase: coop.phase,
      playing: coop.playing,
      spectating,
      roster: coop.roster,
      lobby: coop.lobby,
      results: coop.results,
      snapshotTick: coop.buf.b?.tick ?? -1,
      snapshotWave: coop.buf.b?.wave ?? 0,
      titans: game.titans.length,
      teammates: [...coop.soldiers.keys()],
      squad: coop.buf.b?.players ?? [],
      net: coop.netStats(),
    }
  },
  // lobby controls for two-browser automation (mirrors the Ready/Start buttons)
  coopReady(ready = true) {
    coop?.sendReady(ready)
  },
  coopStart() {
    coop?.sendStart()
  },
  coopRematch() {
    coop?.sendRematch()
  },
  frameStats() {
    return perf.stats()
  },
}

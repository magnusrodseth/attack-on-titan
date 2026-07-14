import { AdditiveBlending, Mesh, MeshBasicMaterial, PerspectiveCamera, SphereGeometry, Vector3, WebGLRenderer } from 'three'
import { initAnalytics, track } from './analytics'
import { AudioSystem, FLINCHES, GRUNTS, ROARS, SLASHES } from './audio'
import { CoopSession } from './coopSession'
import type { SettingsValues, ThreatPing, TrialSection } from './hud'
import { formatRaceTime, Hud } from './hud'
import type { Account } from './net/client'
import { clearAccount, fetchLeaderboard, fetchTrials, loadAccount, login, postTrial, register } from './net/client'
import type { Leaderboard, LobbyMsg } from './net/protocol'
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
import { BossFxView } from './render/bosses'
import { bossForMilestone, bossPartCenter } from './sim/boss'
import { nearestStationDist, raycastHookTarget } from './sim/city'
import { DEFAULT_BLAST_RADIUS, SIM_DT } from './sim/constants'
import { LAMP_BATTERY_SECONDS, lampGlow, lampOn, lightAround } from './sim/flashlight'
import type { CoopEvent } from './sim/coop'
import { musterPos } from './sim/coop'
import { stepCoopClient } from './sim/coopClient'
import type { GameEvent } from './sim/game'
import { chooseUpgrade, createGame, FOCUS_TIME_SCALE, gameClock, saveBest, startGame, stepGame } from './sim/game'
import { DEFAULT_MAP_ID, GAME_MAPS, getMap, mapScopedSeed, mapsForMode } from './sim/maps'
import {
  commendationInfo,
  commendationRows,
  createCommendations,
  flushCommendations,
  loadCommendations,
  resetCommendationRun,
  stepCommendations,
} from './sim/commendations'
import { loadHuntBest } from './sim/hunt'
import { DEFAULT_MODE_ID, GAME_MODES } from './sim/modes'
import type { SavedRun } from './sim/persist'
import { restoreRun, serializeRun } from './sim/persist'
import { Minimap } from './minimap'
import type { InputState } from './sim/player'
import { createPlayer, neutralInput } from './sim/player'
import { loadRaceBest, restartRace } from './sim/race'
import { releaseHook } from './sim/rope'
import { createScore } from './sim/score'
import { SPEAR_FUSE } from './sim/spear'
import { anklePos, napeCenter } from './sim/titan'
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

const MAP_KEY = 'aot-odm-map'
function storedMapId(): string | null {
  try {
    return localStorage.getItem(MAP_KEY)
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
// the arena archetype resolves like the mode (URL → saved run → sticky choice), then
// falls back to the district anywhere the chosen map cannot host the chosen mode
// in co-op the world is the lobby's, and it reaches this page in the URL: the lobby
// announces its map/mode, the client reloads into them, and the arena is built before the
// match ever starts (see syncWorldToLobby)
const requestedMapId = coopMode
  ? (urlParams.get('map') ?? DEFAULT_MAP_ID)
  : (urlParams.get('map') ?? runSave?.mapId ?? storedMapId() ?? DEFAULT_MAP_ID)
const mapId = getMap(requestedMapId).modes.includes(modeId) ? getMap(requestedMapId).id : DEFAULT_MAP_ID
initAnalytics()
const game = createGame(seed, undefined, modeId, mapId)
// the soldier's record: lifetime commendations riding the solo event bus (ticket 010)
const commendations = createCommendations(loadCommendations(game.storage))
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
const bossFx = new BossFxView(scene)
hud.setRaceUi(game.mode.id === 'race')
hud.setHuntUi(game.mode.id === 'hunt')
let roarTimer = 3

// focus strike lock: an indicator glow riding the locked nape (accepted texture-rule
// exception, like the weak-point blooms) so a crowd never leaves the target ambiguous
const strikeMarker = new Mesh(
  new SphereGeometry(0.6, 20, 14),
  new MeshBasicMaterial({
    color: 0xc3adff,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  }),
)
strikeMarker.visible = false
strikeMarker.renderOrder = 5
scene.add(strikeMarker)

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
  // zoomed look slows with the current FOV so field-glass aiming stays controllable
  // (clamped so speed/strike widening never makes the mouse FASTER than 1:1)
  const look = 0.0023 * settings.sensitivity * Math.min(1, camera.fov / settings.fov)
  const dy = settings.invertY ? -e.movementY : e.movementY
  yaw -= e.movementX * look
  pitch = Math.min(1.45, Math.max(-1.45, pitch - dy * look))
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
  if (hud.confirmOpen) {
    // Escape declines: the run is too expensive for a default-yes
    hud.hideConfirm()
    hud.showStart(game.phase === 'playing', game)
    return
  }
  if (hud.settingsOpen || hud.modesOpen || hud.leaderboardOpen || (hud.coopOpen && !coopMode)) {
    // Escape backs out of a panel to the menu underneath instead of resuming
    hud.hideSettings()
    hud.hideModes()
    hud.hideLeaderboard()
    if (!coopMode) {
      hud.hideCoop()
      hud.showStart(game.phase === 'playing', game)
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

// phones and tablets cannot drive this control scheme: gate them out, on brand.
// The media queries only report the browser's guess at the primary pointer, and
// Edge on touch-screen Windows machines guesses touch even with a mouse attached;
// proof of a real mouse or keyboard overrides the guess and lifts the gate.
let touchOnly =
  matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches
if (touchOnly) {
  const gate = document.getElementById('mobile-gate')
  gate?.classList.remove('hidden')
  const liftGate = (e: Event) => {
    if (e instanceof PointerEvent && e.pointerType !== 'mouse') return
    touchOnly = false
    gate?.classList.add('hidden')
    window.removeEventListener('keydown', liftGate)
    window.removeEventListener('pointermove', liftGate)
  }
  window.addEventListener('keydown', liftGate)
  window.addEventListener('pointermove', liftGate)
}

function beginRun(): void {
  if (touchOnly) return
  audio.init()
  hud.hideStart()
  hud.hideDeath()
  hud.hideRaceResults()
  pauseShown = false
  if (game.phase === 'menu' || game.phase === 'dead' || game.phase === 'finished') {
    startGame(game)
    resetCommendationRun(commendations)
    prevPhase = game.phase
    if (waveBased()) announceWave(game.wave)
    else hud.showBanner(game.mode.name)
    persistRun()
    track('run_started', { mode: game.mode.id, coop: coopMode, seed })
  }
  lockPointer()
}

const waveBased = () =>
  game.mode.id === 'waves' ||
  game.mode.id === 'bossrush' ||
  game.mode.id === 'hunt'

function announceWave(wave: number): void {
  if (game.mode.id === 'hunt') {
    // The Culling speaks in levels
    hud.showBanner(`Level ${wave}`, 2400)
  } else if (bossForMilestone(wave, game.mode.id, game.arena)) {
    // the milestone: the Shifter gets the whole drum roll
    const milestone = bossForMilestone(wave, game.mode.id, game.arena)!
    hud.showBanner(`${milestone.spec.name} Approaches`, 3400)
    audio.boom()
  } else {
    hud.showBanner(`Wave ${wave}`)
  }
}

// settings: persisted sliders applied live to the audio buses, mouse look and camera
const SETTINGS_KEY = 'aot-odm-settings'
const SETTINGS_DEFAULTS: SettingsValues = { music: 0.7, sfx: 1, sensitivity: 1, invertY: false, fov: 75, shadows: true }
function loadSettings(): SettingsValues {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SettingsValues>
      return {
        music: parsed.music ?? SETTINGS_DEFAULTS.music,
        sfx: parsed.sfx ?? SETTINGS_DEFAULTS.sfx,
        sensitivity: parsed.sensitivity ?? SETTINGS_DEFAULTS.sensitivity,
        invertY: parsed.invertY ?? SETTINGS_DEFAULTS.invertY,
        fov: parsed.fov ?? SETTINGS_DEFAULTS.fov,
        shadows: parsed.shadows ?? SETTINGS_DEFAULTS.shadows,
      }
    }
  } catch {
    // corrupt storage falls through to defaults
  }
  return { ...SETTINGS_DEFAULTS }
}
const settings = loadSettings()

/** Toggling the shadow pass forces a material recompile, so only flip it on change. */
function applyShadows(on: boolean): void {
  if (renderer.shadowMap.enabled === on) return
  renderer.shadowMap.enabled = on
  scene.traverse((obj) => {
    const mat = (obj as { material?: unknown }).material
    if (!mat) return
    for (const m of Array.isArray(mat) ? mat : [mat]) (m as { needsUpdate: boolean }).needsUpdate = true
  })
}

function persistSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // private mode: settings just do not persist
  }
}

function applySettings(values: SettingsValues): void {
  Object.assign(settings, values)
  audio.setMusicVolume(values.music)
  audio.setSfxVolume(values.sfx)
  applyShadows(values.shadows)
  // sensitivity, invertY and fov are read live each frame / mouse event
}

audio.setMusicVolume(settings.music)
audio.setSfxVolume(settings.sfx)
applyShadows(settings.shadows)
hud.initSettings(settings)
hud.onOpenSettings = () => hud.showSettings()
hud.onCloseSettings = () => {
  hud.hideSettings()
  hud.showStart(game.phase === 'playing', game)
}
hud.onSettingsChange = (values) => {
  applySettings(values)
  persistSettings()
}
hud.onResetSettings = () => {
  applySettings({ ...SETTINGS_DEFAULTS })
  hud.initSettings(settings)
  persistSettings()
}

/** A confirmed abandon must not resurrect: park the phase so pagehide skips the save. */
function dropRunAndGo(navigate: () => void): void {
  if (game.phase === 'playing' || game.phase === 'upgrading') {
    saveBest(game) // the earned score still counts
    game.phase = 'menu'
    clearRun()
  }
  navigate()
}

/** Wraps a run-destroying action in the shared confirm plate while a run is live. */
function confirmIfMidRun(text: string, yesLabel: string, action: () => void): void {
  if (game.phase !== 'playing' && game.phase !== 'upgrading') {
    action()
    return
  }
  hud.showConfirm(text, yesLabel, action)
}

// game modes: pick in the menu; switching reloads into the new mode (URL carries it)
hud.onOpenModes = () => {
  // each card carries your record on it: what winning means, and where you stand
  const bests: Record<string, string> = {}
  if (game.best.bestScore > 0) bests.waves = `Best ${game.best.bestScore} · Wave ${game.best.bestWave}`
  const raceBest = loadRaceBest(game.storage, mapScopedSeed(game.map.id, seed))
  if (raceBest) bests.race = `Best ${formatRaceTime(raceBest.time)} on this course`
  const huntBest = loadHuntBest(game.storage, mapScopedSeed(game.map.id, seed))
  if (huntBest) bests.hunt = `Best Level ${huntBest.level} on this district`
  hud.showModes(GAME_MODES, game.mode.id, bests)
}
hud.onCloseModes = () => {
  hud.hideModes()
  hud.showStart(game.phase === 'playing', game)
}
hud.onOpenCommendations = () => hud.showCommendations(commendationRows(commendations.save))
hud.onCloseCommendations = () => {
  hud.hideCommendations()
  hud.showStart(game.phase === 'playing', game)
}
// the map picker: every mode now offers every arena in the registry
hud.initMapsButton(game.map.name, mapsForMode(game.mode.id).length > 1)
hud.onOpenMaps = () => {
  const maps = mapsForMode(game.mode.id)
  const bests: Record<string, string> = {}
  // a course record only means anything in a time trial; don't caption a Wave Survival
  // map with a lap time the player set on it in Signal Run
  if (game.mode.id === 'race') {
    for (const map of maps) {
      const best = loadRaceBest(game.storage, mapScopedSeed(map.id, seed))
      if (best) bests[map.id] = `Best ${formatRaceTime(best.time)} on this course`
    }
  }
  hud.showMaps(maps, game.map.id, bests)
}
hud.onCloseMaps = () => {
  hud.hideMaps()
  hud.showStart(game.phase === 'playing', game)
}
hud.onPickMap = (id) => {
  if (id === game.map.id) {
    hud.onCloseMaps()
    return
  }
  confirmIfMidRun(
    `Deploying to ${GAME_MAPS.find((m) => m.id === id)?.name ?? id} ends your current run.`,
    'Switch Map',
    () =>
      dropRunAndGo(() => {
        try {
          localStorage.setItem(MAP_KEY, id)
        } catch {
          // private mode: the URL param below still carries the choice
        }
        const params = new URLSearchParams(location.search)
        params.set('map', id)
        location.search = params.toString()
      }),
  )
}

hud.onPickMode = (id) => {
  if (id === game.mode.id) {
    hud.onCloseModes()
    return
  }
  confirmIfMidRun(
    `Switching to ${GAME_MODES.find((m) => m.id === id)?.name ?? id} ends your current run.`,
    'Switch Mode',
    () =>
      dropRunAndGo(() => {
        try {
          localStorage.setItem(MODE_KEY, id)
        } catch {
          // private mode: the URL param below still carries the choice
        }
        const params = new URLSearchParams(location.search)
        params.set('mode', id)
        location.search = params.toString()
      }),
  )
}

/** A finished trial posts to the board when signed in; localStorage PBs always work. */
function submitTrial(body: Parameters<typeof postTrial>[1]): void {
  if (coopMode || playgroundMode || debug.autopilot) return
  const account = loadAccount()
  if (account) void postTrial(account.token, body)
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
  track('run_started', { mode: game.mode.id, coop: false, seed })
  lockPointer()
}
// R restarts straight off the finish screen; mid-run R is handled inside the sim
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && game.phase === 'finished') hud.onRaceAgain()
})
hud.onRestart = () => {
  // abandon the current round and take the field again from wave 1, same seed and mode
  if (touchOnly) return
  confirmIfMidRun('Back to wave one, same district. Your current run ends here.', 'Restart Run', () => {
    audio.init()
    hud.hideStart()
    pauseShown = false
    saveBest(game) // the abandoned score still counts toward the record
    clearRun()
    startGame(game)
    prevPhase = game.phase
    if (waveBased()) announceWave(game.wave)
    else hud.showBanner(game.mode.name)
    persistRun()
    track('run_started', { mode: game.mode.id, coop: coopMode, seed })
    lockPointer()
  })
}
hud.onGiveUp = () => {
  // end the run deliberately: the report gets filed exactly as it stands
  confirmIfMidRun('The report gets filed as it stands. There is no coming back.', 'Abandon Run', () => {
    abandonedRun = true
    saveBest(game)
    track('run_abandoned', { mode: game.mode.id, wave: game.wave, score: game.score.score, seed })
    game.phase = 'dead' // the main loop's phase transition files the report and clears the save
  })
}
// declining a confirm lands back on the pause menu the action came from
hud.onConfirmCancel = () => hud.showStart(game.phase === 'playing', game)
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
  // the pre-restore boost history is gone: the current wave cannot vouch for Cold Steel
  resetCommendationRun(commendations, { restored: true })
  if (runSave?.view) {
    yaw = runSave.view.yaw
    pitch = runSave.view.pitch
  }
  if (game.phase === 'upgrading') {
    hud.hideStart()
    hud.showUpgrades(game.offers)
  } else {
    hud.showStart(true, game) // straight back to the paused run: one click resumes
  }
} else if (!coopMode && !playgroundMode) {
  hud.showStart(false, game)
}

// --- co-op: lobby flow, match mirrors, server events -------------------------

let coop: CoopSession | null = null
let spectating = false
let coopInputTimer = 0
const COOP_ERROR_KEY = 'aot-coop-error'

/**
 * The invite link names the world, not just the room. A link that carries only the code lands
 * the guest in The District, and the lobby then has to reload them into the squad's real arena
 * — a reload that costs them their connection the moment they arrive (the leader watches them
 * flicker in and straight back out). Naming the ground in the link means they build it on the
 * first load and simply stay.
 */
function coopJoinUrl(lobby: LobbyMsg): string {
  const url = new URL(`${location.origin}${location.pathname}`)
  url.searchParams.set('lobby', lobby.code)
  url.searchParams.set('map', lobby.mapId)
  url.searchParams.set('mode', lobby.modeId)
  return url.toString()
}

function gotoLobby(code: string | null): void {
  const params = new URLSearchParams(location.search)
  params.delete('seed') // a lobby's city comes from its code
  if (code) params.set('lobby', code)
  else params.delete('lobby')
  location.search = params.toString()
}

/**
 * The lobby names the world; this page may have been built for a different one. The arena
 * and the whole three.js scene are built at page load from (seed, map), so the honest way
 * to change the ground under a lobby is to reload into it — which costs nothing here,
 * because nobody is fighting yet. Returns true when a reload is on its way.
 */
function syncWorldToLobby(lobby: LobbyMsg): boolean {
  if (lobby.mapId === mapId && lobby.modeId === modeId) return false
  reloadInto({ lobby: lobby.code, map: lobby.mapId, mode: lobby.modeId })
  return true
}

/**
 * Leave the room on purpose, then reload into the given world. Closing the socket ourselves
 * first is the whole point: an unannounced close on a page that is already navigating reads as
 * "connection lost", and the handler for that used to send us to the main menu — cancelling the
 * very reload that was carrying us into the squad's arena.
 */
function reloadInto(next: Record<string, string>): void {
  coop?.leave()
  const params = new URLSearchParams(location.search)
  for (const [key, value] of Object.entries(next)) params.set(key, value)
  location.replace(`${location.pathname}?${params.toString()}`)
}

function connectCoop(account: Account): void {
  if (!lobbyCode) return
  hud.hideCoop()
  hud.setCoopUi(true)
  coop = new CoopSession(lobbyCode, account, {
    onLobby(lobby) {
      if (syncWorldToLobby(lobby)) return // reloading into the squad's chosen ground
      // the lobby overlay belongs to the lobby phase only; spectators watch the fight
      if (lobby.phase === 'lobby') {
        hud.showLobby(lobby, coopJoinUrl(lobby))
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
    onMatchStart(roster, startMapId, startModeId) {
      // a late joiner can arrive on the wrong ground (the room changed maps before they
      // opened the link): reload into the real one rather than fight a mirage
      if (startMapId !== mapId || startModeId !== modeId) {
        reloadInto({ map: startMapId, mode: startModeId })
        return
      }
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
    onLinkLost() {
      // partysocket is already retrying; say so and hold the lobby open rather than
      // dumping the soldier back to the menu over a dropped socket
      hud.showBanner('Link to the squad lost · reconnecting…', 60_000)
    },
    onLinkBack() {
      hud.showBanner('Reconnected', 1400)
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
      const look = camera.getWorldDirection(new Vector3())
      coop?.sendSlash({ x: look.x, y: look.y, z: look.z })
    } else if (event.type === 'coopFire') {
      audio.spearLaunch() // whoosh instantly; the server launches the real spear
      effects.addShake(0.1)
      const look = camera.getWorldDirection(new Vector3())
      coop?.sendFire({ x: look.x, y: look.y, z: look.z })
    } else if (event.type === 'coopResupply') {
      coop?.sendResupply()
    } else if (event.type === 'coopMash') {
      coop?.sendMash()
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
        const aberrant = event.kind === 'abnormal'
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
          if (aberrant) hud.showBanner('Aberrant Slain!', 1600)
          hud.popPoints(event.points, event.oneCut, event.heartGained)
        } else {
          audio.killHit(0.25)
          const prey = aberrant ? 'an aberrant' : 'a titan'
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
        // the world ships the shove with the wound; a squeeze (grabFailed) carries none
        if (event.knockback) {
          game.player.vel.x += event.knockback.x
          game.player.vel.y += event.knockback.y
          game.player.vel.z += event.knockback.z
        }
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
        const scale = (event.radius / DEFAULT_BLAST_RADIUS) ** 2 // a wider blast throws more fire
        effects.burst(pos, 0xffb347, Math.round(60 * scale)) // fireball
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
        track('run_ended', { mode: game.mode.id, coop: true, wave: game.wave })
        break
      // the Shifter fight looks the same from either driver: the boss bar, the plate
      // clinks, the breaks, the fall. The mirrored g.boss is what these read.
      case 'bossEngaged':
      case 'bossPlated':
      case 'bossPlateCracked':
      case 'bossPartBroken':
      case 'bossKilled':
      case 'bossThrowWindup':
      case 'bossProjectileImpact':
      case 'bossSummon':
      case 'bossSteam':
      case 'bossRoar':
      case 'bossSpikeTelegraph':
      case 'bossSpike':
      case 'spearCachesRestocked':
        handleEvents([event])
        break
      // the crowd is the squad's problem, not one soldier's: the same scream, the same window,
      // the same silence when it closes. These route through the solo handlers untouched.
      // the fist: mine is a QTE, a teammate's is a line in the feed
      case 'grabbed':
      case 'grabEscaped':
      case 'grabFailed':
      case 'grabReleased':
        if (event.playerId === me) handleEvents([event])
        else if (event.type === 'grabbed') hud.addFeedLine(`<b>${event.playerId}</b> is in a fist`)
        else if (event.type === 'grabEscaped') hud.addFeedLine(`<b>${event.playerId}</b> broke free`)
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
  else hud.showStart(game.phase === 'playing', game)
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
hud.onSetWorld = (pickedMap, pickedMode) => coop?.sendSetWorld(pickedMap, pickedMode)
hud.onLeaveLobby = () => {
  coop?.leave()
  gotoLobby(null)
}
hud.onRematch = () => coop?.sendRematch()
// stale-while-revalidate: paint the cached board instantly, refresh in the background
const LB_CACHE_KEY = 'aot-leaderboard-cache'
let leaderboardCache: Leaderboard | null = null
let trialsFlight = 0
try {
  const raw = localStorage.getItem(LB_CACHE_KEY)
  if (raw) leaderboardCache = JSON.parse(raw) as Leaderboard
} catch {
  // corrupt cache: first open shows skeletons instead
}
hud.onOpenLeaderboard = () => {
  const you = loadAccount()?.username ?? null
  hud.setLeaderboardIdentity(you) // signed-out visitors learn how names get on the board
  hud.showLeaderboard(leaderboardCache, leaderboardCache ? 'ready' : 'loading', you)
  // one board pair per arena in the registry, so a new map shows up here for free. Coop
  // runs never post trials, so a lobby seed would only ever draw empty boards: skip them.
  const sections: TrialSection[] = coopMode
    ? []
    : GAME_MAPS.map((map) => ({
        mapName: map.name,
        scope: mapScopedSeed(map.id, seed),
        current: map.id === game.map.id,
        boards: null,
        state: 'loading' as const,
      }))
  hud.showTrialBoards(seed, sections, you)
  // each arena paints the moment its own fetch lands; a reopen supersedes the older flight
  const flight = ++trialsFlight
  for (const section of sections) {
    void fetchTrials(section.scope).then((boards) => {
      section.boards = boards
      section.state = boards ? 'ready' : 'error'
      if (hud.leaderboardOpen && flight === trialsFlight) hud.showTrialBoards(seed, sections, you)
    })
  }
  void fetchLeaderboard().then((data) => {
    if (data) {
      leaderboardCache = data
      try {
        localStorage.setItem(LB_CACHE_KEY, JSON.stringify(data))
      } catch {
        // cache is a nicety
      }
      if (hud.leaderboardOpen) hud.showLeaderboard(data, 'ready', you)
    } else if (!leaderboardCache && hud.leaderboardOpen) {
      hud.showLeaderboard(null, 'error')
    }
  })
}
hud.onCloseLeaderboard = () => {
  hud.hideLeaderboard()
  if (!coopMode) hud.showStart(game.phase === 'playing', game)
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
      case 'slashConnect':
        // a buffered swing landing a beat after its whoosh: contact feedback only
        if (event.napeHit) {
          hud.slashFlash()
          effects.addShake(0.12)
          audio.play('slice', { volume: 0.9 })
        } else {
          effects.addShake(0.06)
          audio.thud(0.3)
          audio.play(FLINCHES, { volume: 0.4 })
        }
        break
      case 'kill': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        const aberrant = event.kind === 'abnormal'
        if (titan) {
          const nape = napeCenter(titan)
          effects.burst(nape, 0xd42b35, aberrant ? 52 : 40) // blood
          effects.burst(nape.clone().add(new Vector3(0, 2.2, 0)), 0xbfc7cc, 26) // steam
          audio.playAt('death-groan', titan.pos.distanceTo(game.player.pos), { volume: 1.2 })
        }
        if (game.mode.id === 'hunt') hud.huntKillFlash()
        if (event.weapon === 'focus') {
          // the dash just passed through the nape: the cut itself flashes and sings
          hud.slashFlash()
          audio.play('slice', { volume: 1 })
        }
        effects.addShake(aberrant ? 0.6 : 0.45)
        hitstop = aberrant ? 0.14 : 0.09 // a heartbeat of frozen time sells the cut
        audio.killHit(aberrant ? 0.85 : 0.65)
        if (audio.has('aberrant-slain')) {
          audio.play('aberrant-slain', { volume: aberrant ? 0.95 : 0.4, rate: aberrant ? 1 : 1.25 })
        }
        if (aberrant) hud.showBanner('Aberrant Slain!', 1600)
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
      case 'gasLow':
        hud.showBanner('Gas Running Low · Make for a Station', 2400)
        audio.click()
        break
      case 'bladesLow':
        // the warning is not "you will run out", it is "titans have stopped dying at your
        // usual speed" — say the number, because that is the thing that will get you killed
        hud.showBanner(`Blades Dulling · One-Cut at ${event.oneCutSpeed.toFixed(1)} m/s`, 2600)
        audio.click()
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
        track('run_ended', { mode: game.mode.id, coop: false, wave: game.wave, score: game.score.score })
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
        effects.burst(event.pos, 0xffb347, Math.round(60 * (event.radius / DEFAULT_BLAST_RADIUS) ** 2)) // fireball
        effects.burst(event.pos.clone().add(new Vector3(0, 1.5, 0)), 0x8a8a90, 40) // smoke
        effects.addShake(0.7)
        audio.spearBoom(event.pos.distanceTo(game.player.pos))
        break
      case 'staggered':
        hud.popText('Staggered!')
        break
      case 'bossEngaged': {
        const dist = game.boss?.titan.pos.distanceTo(game.player.pos) ?? 40
        hud.showBanner(`${event.name} · Break Its Guard`, 2800)
        audio.playAt(ROARS, dist, { volume: 1.7, rate: 0.55 })
        effects.addShake(0.5)
        break
      }
      case 'bossPlated':
        hud.popText('Plated · Crack It With a Spear!')
        audio.thud(0.5)
        audio.click()
        break
      case 'bossPlateCracked': {
        hud.showBanner('Plate Cracked · Blades In!', 1800)
        hud.bossBarFlash()
        const fight = game.boss
        if (fight) {
          const part = fight.spec.parts[event.partIndex]
          if (part) effects.burst(bossPartCenter(fight.titan, part), 0xcdd6de, 34)
        }
        effects.addShake(0.5)
        audio.snap()
        break
      }
      case 'bossPartBroken': {
        hud.showBanner(`${event.partName} Severed  +${event.points}`, 2200)
        hud.bossBarFlash()
        const fight = game.boss
        if (fight) {
          const part = fight.spec.parts[event.partIndex]
          if (part) {
            const at = bossPartCenter(fight.titan, part)
            effects.burst(at, 0xd42b35, 46)
            effects.burst(at.clone().add(new Vector3(0, 2, 0)), 0xbfc7cc, 24)
          }
          audio.playAt(ROARS, fight.titan.pos.distanceTo(game.player.pos), { volume: 1.6, rate: 0.65 })
        }
        effects.addShake(0.8)
        hitstop = 0.12
        audio.killHit(0.9)
        break
      }
      case 'bossKilled':
        hud.showBanner(event.flawless ? 'The Wall Stands · Flawless' : 'The Wall Stands', 4200)
        effects.addShake(1)
        hitstop = 0.18
        audio.boom()
        if (audio.has('aberrant-slain')) audio.play('aberrant-slain', { volume: 1, rate: 0.85 })
        break
      case 'bossThrowWindup': {
        hud.popText('Incoming!')
        const dist = game.boss?.titan.pos.distanceTo(game.player.pos) ?? 60
        audio.playAt(ROARS, dist, { volume: 1.2, rate: 0.9 })
        break
      }
      case 'bossProjectileImpact':
        effects.burst(event.pos, 0x8a8a90, 44)
        effects.burst(event.pos.clone().add(new Vector3(0, 1.5, 0)), 0xb59a72, 26)
        effects.addShake(0.5)
        audio.spearBoom(event.pos.distanceTo(game.player.pos))
        break
      case 'bossSummon': {
        hud.showBanner('The Scream · Pures Answer', 2200)
        const dist = game.boss?.titan.pos.distanceTo(game.player.pos) ?? 40
        audio.playAt(ROARS, dist, { volume: 1.5, rate: 1.2 })
        break
      }
      case 'bossSteam':
        hud.popText(event.on ? 'Scalding Steam!' : 'The Steam Thins · Dive!')
        audio.gasBurst()
        break
      case 'bossRoar': {
        const dist = game.boss?.titan.pos.distanceTo(game.player.pos) ?? 20
        audio.playAt(ROARS, dist, { volume: 1.9, rate: 0.5 })
        effects.addShake(0.9)
        hud.popText('Thrown by the Roar!')
        break
      }
      case 'bossSpikeTelegraph':
        audio.click()
        break
      case 'bossSpike':
        effects.burst(new Vector3(event.x, 1.2, event.z), 0x9a927f, 38)
        effects.addShake(0.4)
        audio.thud(0.8)
        break
      case 'spearPickup':
        hud.showBanner(`Thunder Spear Racked · ${event.remaining}`, 1200)
        audio.pickupChime()
        break
      case 'spearCachesRestocked':
        hud.showBanner('Fresh Spear Caches Dropped', 2000)
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
        submitTrial({ mode: 'race', seed: mapScopedSeed(game.map.id, seed), timeS: event.time, splits: event.splits })
        track('trial_finished', { mode: game.mode.id, seed, map: game.map.id, time_s: event.time, pb: event.pb })
        break
      case 'raceArmed':
      case 'raceRestart':
        break // the HUD and the columns re-derive from race state
      case 'huntUrgency':
        // the heartbeat layer rises from state each frame; this is the moment it turns
        hud.showBanner('The Clock Runs Thin', 2000)
        audio.thud(0.55)
        break
      case 'huntTimeout':
        effects.addShake(0.8)
        audio.boom()
        break
      case 'focusCharge':
        hud.focusCharged()
        if (event.full) audio.focusReady()
        break
      case 'strike':
        audio.strikeSwoosh()
        hud.strikeFx()
        blade.slash()
        effects.addShake(0.25)
        break
      case 'grabbed': {
        const titan = game.titans.find((t) => t.id === event.titanId)
        if (titan) {
          audio.playAt(ROARS, titan.pos.distanceTo(game.player.pos), { volume: 1.3, rate: 0.8 })
        }
        audio.thud(0.8)
        effects.addShake(0.6)
        break
      }
      case 'grabEscaped':
        hud.showBanner('Broke Free!', 1400)
        audio.play(GRUNTS, { volume: 0.9, rate: 1.15 })
        effects.addShake(0.3)
        break
      case 'grabFailed':
        // the squeeze: the playerHit riding along already shakes, thuds and flashes red
        hud.showBanner('Crushed · 2 Hearts Lost', 2000)
        break
      case 'grabReleased':
        hud.showBanner('The Grip Falls Open', 1400)
        break
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
let abandonedRun = false // a Give Up retitles the death report; a real death never does
let prevCrippled = new Set<number>()
let saveTimer = 0
let hitstop = 0 // brief sim freeze on kills; rendering continues

/**
 * Projects a world point onto the viewport for an edge indicator: `onScreen` when it
 * sits inside the safe frame, otherwise x/y clamped to the screen edge plus the angle
 * an upward-pointing triangle must rotate by to aim at it. Shared by the race caret
 * and the titan threat radar.
 */
function edgeProject(world: Vector3): { onScreen: boolean; x: number; y: number; angle: number } {
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
  return {
    onScreen,
    x: ((dx + 1) / 2) * innerWidth,
    y: ((1 - dy) / 2) * innerHeight,
    angle: Math.atan2(dx, dy), // 0 = up; the caret triangle points up by default
  }
}

// threat radar: titans this close ping the screen edge when they are not in view.
// 70 m covers a normal's full aggro range (55) with warning slack; abnormals sprint
// in from further out, but a radar that lights half the map would read as noise.
const THREAT_RADIUS = 70
const THREAT_MAX = 4 // only the nearest few — a horde should not wallpaper the edges

// field glasses (hold C): the zoomed-in field of view. ~3.5× magnification at the
// default 70° base; the mouselook handler slows to match so aiming stays controllable.
const ZOOM_FOV = 20

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
      if (!coopMode && !debug.autopilot && !debug.silent) {
        const awarded = stepCommendations(commendations, game, SIM_DT)
        if (awarded.length > 0) {
          for (const id of awarded) {
            const info = commendationInfo(id)
            hud.commendationToast(info.name, info.desc)
          }
          audio.chime()
        }
        flushCommendations(commendations, game.storage)
      }
      handleEvents(game.events)
      acc -= SIM_DT
    }
  } else if (!coopMode && game.phase === 'playing' && !debug.autopilot && !debug.silent && !pauseShown) {
    hud.showStart(true, game)
    pauseShown = true
  }

  if (game.phase !== prevPhase) {
    if (game.phase === 'upgrading' || game.phase === 'dead' || game.phase === 'finished') {
      document.exitPointerLock()
      hud.hideStart() // a lingering pause overlay must not sit under the new menu
      hud.hideSettings()
      hud.hideModes()
      hud.hideCommendations()
      pauseShown = false
      if (game.phase === 'upgrading') {
        hud.showUpgrades(game.offers)
        persistRun()
      } else if (game.phase === 'finished') {
        hud.showRaceResults(game)
        clearRun() // a finished run must not resurrect on refresh
      } else {
        // the hunt posts its result when the run ends, however it ended
        if (game.mode.id === 'hunt' && game.wave > 1) {
          submitTrial({
            mode: 'hunt',
            seed: mapScopedSeed(game.map.id, seed),
            level: game.wave - 1,
            score: game.score.score,
          })
        }
        hud.showDeath(game, abandonedRun)
        abandonedRun = false
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
  // field glasses: hold C to narrow the FOV. Purely client-side (the sim never sees
  // it); the strike dash keeps priority, since its FOV slam is most of the strike feel.
  const zooming = keys.has('KeyC') && inAction && !game.strike
  // the strike dash slams the FOV wide open; the snap-in is most of the ZOOM feel.
  // The settings FOV is the base; speed widening and the strike offset ride on top.
  const targetFov = game.strike
    ? settings.fov + 37
    : zooming
      ? ZOOM_FOV
      : settings.fov + 22 * Math.min(1, Math.max(0, (speed - 10) / 30))
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * (game.strike ? 18 : zooming ? 14 : 8))
  camera.updateProjectionMatrix()
  // the lens mask fades in step with the optical zoom itself, not the key edge
  hud.setZoom(Math.min(1, Math.max(0, (settings.fov - camera.fov) / (settings.fov - ZOOM_FOV))))
  effects.applyShake(camera)

  // nape lock indicator + crosshair prompt while a strike is on offer
  const lockedTitan =
    game.strikeTargetId === null ? undefined : game.titans.find((t) => t.id === game.strikeTargetId)
  strikeMarker.visible = lockedTitan !== undefined
  if (lockedTitan) {
    strikeMarker.position.copy(napeCenter(lockedTitan))
    // sized to the titan so a 15m captain reads as clearly as a 6m runt
    strikeMarker.scale.setScalar((lockedTitan.height / 8) * (1 + 0.25 * Math.sin(now * 0.02)))
  }
  hud.setStrikePrompt(lockedTitan !== undefined)

  titanPool.sync(game.titans, dt)
  bossFx.sync(game, dt)
  spearsView.sync(game.spears, game.pickups, dt)
  gatesView.sync(game, now * 0.001)
  updateSpearBeeps(dt)
  updateScenery(dt, camera)
  const clock = debug.clockOverride ?? gameClock(game)
  // the beam is on a light meter, not a clock: torchlight and shafts keep it off
  const light = lightAround(game.arena, game.player.pos.x, game.player.pos.y, game.player.pos.z, clock)
  dayNight.update(clock, camera)
  flashlight.update(camera, game.phase === 'menu' ? 0 : lampGlow(light, game.player.lamp), now)
  blade.update(dt)
  effects.syncRopes(game.player, camera, dt)
  effects.update(dt, camera, game.player.vel)

  audio.setWind(inAction ? speed : 0)
  audio.setMuffled(game.focusActive)
  audio.setDucked((game.phase === 'playing' && !inAction && !debug.silent) || game.phase === 'menu')
  hud.setFocusVignette(game.focusActive)
  minimap.update(game, yaw, coopBattle && coop ? coop.soldiers.values() : undefined)
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
  const nearStation = nearestStationDist(game.arena, game.player.pos.x, game.player.pos.z) <= 10
  const lamp =
    lampOn(light) && game.phase !== 'menu' ? Math.min(1, game.player.lamp / LAMP_BATTERY_SECONDS) : null
  hud.update(game, { speed, nearStation, hookInRange, lamp })

  if (game.mode.id === 'hunt') {
    audio.setHeartbeat(game.hunt !== null && hud.updateHunt(game))
  }

  // the boss drone swells while a living Shifter is engaged and dies with the fight
  audio.setBossLayer(
    game.boss !== null &&
      game.boss.state.engaged &&
      game.boss.titan.hp > 0 &&
      game.phase === 'playing',
  )

  if (game.race) {
    // project the active gate: distance readout on screen, an edge caret when it is not
    const gate = game.race.course.gates[game.race.nextGate]
    if (gate && game.phase === 'playing') {
      const world = new Vector3(gate.x, gate.y, gate.z)
      const dist = world.distanceTo(game.player.pos) // before project() mutates world
      hud.updateRace(game, { dist, ...edgeProject(world) })
    } else {
      hud.updateRace(game, null)
    }
  }

  // threat radar: the nearest living titans in the vicinity that the camera cannot see
  // ping the screen edge as red triangles, brighter the closer they loom
  const pings: ThreatPing[] = []
  if (game.phase === 'playing' && !playgroundMode && !spectating) {
    const nearby = game.titans
      .filter((t) => t.hp > 0)
      .map((t) => ({ t, dist: t.pos.distanceTo(game.player.pos) }))
      .filter((n) => n.dist <= THREAT_RADIUS)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, THREAT_MAX)
    for (const { t, dist } of nearby) {
      const proj = edgeProject(new Vector3(t.pos.x, t.pos.y + t.height * 0.55, t.pos.z))
      if (proj.onScreen) continue // visible titans need no arrow
      pings.push({
        x: proj.x,
        y: proj.y,
        angle: proj.angle,
        alpha: 0.45 + 0.55 * (1 - dist / THREAT_RADIUS),
        hot: t.state === 'chase' || t.state === 'leap',
      })
    }
  }
  hud.updateThreats(pings)

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
    focus: Math.round(game.focus),
    focusCharge: game.focusCharge,
    focusActive: game.focusActive,
    striking: game.strike !== null,
    strikeTarget: game.strikeTargetId,
    grab: game.grab
      ? {
          titanId: game.grab.titanId,
          presses: game.grab.presses,
          timeLeft: Math.round(game.grab.timeLeft * 100) / 100,
        }
      : null,
    hooks: game.player.hooks.map((h) => h.state),
    buildings: game.arena.buildings.length,
    clock: Math.round((debug.clockOverride ?? gameClock(game)) * 1000) / 1000,
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
      applyShadows(on)
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

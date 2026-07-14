import type { Leaderboard, LobbyMsg, TrialBoards } from './net/protocol'
import type { CommendationRow } from './sim/commendations'
import type { MatchResults } from './sim/coop'
import type { GameState } from './sim/game'
import { FOCUS_KILLS_TO_FILL } from './sim/game'
import { oneCutSpeed } from './sim/combat'
import { loadHuntBest, HUNT_URGENCY_FRACTION } from './sim/hunt'
import { DEFAULT_MAP_ID, coopMaps, mapScopedSeed } from './sim/maps'
import { coopModes } from './sim/modes'
import { loadRaceBest } from './sim/race'
import { BOOST_COST } from './sim/player'
import type { Upgrade } from './sim/upgrades'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing HUD element #${id}`)
  return node as T
}

export interface HudFrame {
  speed: number
  nearStation: boolean
  hookInRange: boolean
  /** Flashlight battery 0..1 while the night lamp window is open; null hides the gauge by day. */
  lamp: number | null
}

/** Where the active gate sits relative to the screen, computed by main from the camera. */
export interface RaceCaret {
  dist: number
  onScreen: boolean
  /** Viewport position for the edge caret (px) and its pointing angle (rad, 0 = up). */
  x: number
  y: number
  angle: number
}

/** A nearby off-screen titan pinging the screen edge, computed by main from the camera. */
export interface ThreatPing {
  /** Viewport position for the edge triangle (px) and its pointing angle (rad, 0 = up). */
  x: number
  y: number
  angle: number
  /** 0..1 — closer titans burn brighter. */
  alpha: number
  /** A titan mid-chase or mid-leap pulses instead of idling. */
  hot: boolean
}

/** m:ss.cc — the race strip's one number. */
export function formatRaceTime(t: number): string {
  const minutes = Math.floor(t / 60)
  const seconds = t - minutes * 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

function formatDelta(delta: number): string {
  return `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}`
}

/**
 * One arena's slice of the leaderboard's trial block: the same seed on a different map is
 * an honestly different course, so it gets its own scope, its own fetch and its own state.
 */
export interface TrialSection {
  mapName: string
  /** The map-scoped seed these boards were fetched under. */
  scope: string
  /** True for the arena the soldier is standing in right now. */
  current: boolean
  boards: TrialBoards | null
  state: 'loading' | 'ready' | 'error'
}

/** Three rows per board: enough to show the podium without burying the arena below. */
const TRIAL_ROWS = 3

function skeletonRows(): string {
  return Array.from(
    { length: TRIAL_ROWS },
    () => '<div class="lb-row skeleton"><span class="sk-bar"></span><span class="sk-bar sk-short"></span></div>',
  ).join('')
}

function raceRows(section: TrialSection, you: string | null): string {
  if (!section.boards) {
    return section.state === 'loading' ? skeletonRows() : '<div class="lb-empty">Headquarters is unreachable.</div>'
  }
  if (section.boards.race.length === 0) return '<div class="lb-empty">No times on this course yet. Set one.</div>'
  return section.boards.race
    .slice(0, TRIAL_ROWS)
    .map(
      (entry, i) =>
        `<div class="lb-row${entry.username === you ? ' mine' : ''}">` +
        `<span><b>${formatRaceTime(entry.timeS)}</b> · ${entry.username}</span>` +
        `<span class="lb-sub">#${i + 1}</span></div>`,
    )
    .join('')
}

function huntRows(section: TrialSection, you: string | null): string {
  if (!section.boards) {
    return section.state === 'loading' ? skeletonRows() : '<div class="lb-empty"></div>'
  }
  if (section.boards.hunt.length === 0) return '<div class="lb-empty">No culls on this course yet.</div>'
  return section.boards.hunt
    .slice(0, TRIAL_ROWS)
    .map(
      (entry, i) =>
        `<div class="lb-row${entry.username === you ? ' mine' : ''}">` +
        `<span><b>Level ${entry.level}</b> · ${entry.username}</span>` +
        `<span class="lb-sub">#${i + 1} · ${entry.score}</span></div>`,
    )
    .join('')
}

export interface SettingsValues {
  music: number
  sfx: number
  sensitivity: number
  invertY: boolean
  /** Base field of view in degrees; speed and strike widening stack on top. */
  fov: number
  shadows: boolean
}

const SLIDER_IDS = ['set-music', 'set-sfx', 'set-sens', 'set-fov'] as const
/** Persisted on/off plates; fullscreen is browser state, not a setting. */
const TOGGLE_IDS = ['set-invert', 'set-shadows'] as const

export class Hud {
  private crosshair = el('crosshair')
  private hearts = el('hearts')
  private score = el('score')
  private combo = el('combo')
  private best = el('best')
  private gasBar = el('gas-bar')
  private gasFill = el('gas-fill')
  private gasCanisters = el('gas-canisters')
  private bladeBar = el('blade-bar')
  private focusBar = el('focus-bar')
  private focusFill = el('focus-fill')
  private focusStatus = el('focus-status')
  private focusVignette = el('focus-vignette')
  private strikePrompt = el('strike-prompt')
  private strikeFxEl = el('strike-fx')
  private grabQte = el('grab-qte')
  private grabDialFill = el('grab-dial-fill')
  private grabTime = el('grab-time')
  private bladeFill = el('blade-fill')
  private bladePairs = el('blade-pairs')
  private bladeThreshold = el('blade-threshold')
  private spearBar = el('spear-bar')
  private spearFill = el('spear-fill')
  private spearCount = el('spear-count')
  private lampRow = el('lamp-row')
  private lampFill = el('lamp-fill')
  private meters = el('meters')
  private speedo = el('speedo')
  private banner = el('banner')
  private popup = el('popup')
  private prompt = el('prompt')
  private vignette = el('vignette')
  private flash = el('flash')
  private start = el('start')
  private upgrade = el('upgrade')
  private upgradeCards = el('upgrade-cards')
  private death = el('death')
  private deathStats = el('death-stats')
  private settingsPanel = el('settings')
  private modesPanel = el('modes')
  private modeCards = el('mode-cards')
  private mapsPanel = el('maps')
  private mapCards = el('map-cards')
  private bannerTimer: number | undefined

  private raceStrip = el('race-strip')
  private raceTimer = el('race-timer')
  private raceGate = el('race-gate')
  private raceSplit = el('race-split')
  private raceDist = el('race-dist')
  private raceCaret = el('race-caret')
  private raceResults = el('race-results')
  private raceSplitTimer: number | undefined
  private threats = el('threats')
  private threatPool: HTMLElement[] = []
  private zoomMask = el('zoom-mask')
  private zoomShown = -1
  private huntStrip = el('hunt-strip')
  private huntTimer = el('hunt-timer')
  private huntLeft = el('hunt-left')
  private huntVignette = el('hunt-vignette')

  private bossStrip = el('boss-strip')
  private bossName = el('boss-name')
  private bossBar = el('boss-bar')
  private bossPart = el('boss-part')
  private bossSegs: { seg: HTMLElement; fill: HTMLElement }[] = []

  private coopPanel = el('coop')
  private lobbyPanel = el('lobby')
  private resultsPanel = el('results')
  private leaderboardPanel = el('leaderboard')
  private confirmPanel = el('confirm')
  private confirmAction: () => void = () => {}
  /** The fresh-menu subtitle, restored whenever the overlay is not a pause screen. */
  private startSubDefault = el('start-sub').innerHTML
  private squad = el('squad')
  private feed = el('feed')
  private pickStatus = el('pick-status')
  private toastEl = el('toast')
  private toastTimer: number | undefined
  private copyTimer: number | undefined
  private joinUrl = ''

  private commendPanel = el('commendations')
  private commendRowsEl = el('commend-rows')
  private commendCountEl = el('commend-count')
  private commendToastEl = el('commend-toast')
  private commendToastTimer: number | undefined
  private commendQueue: { name: string; desc: string }[] = []
  private commendToastBusy = false

  onStart: () => void = () => {}
  onRestart: () => void = () => {}
  onGiveUp: () => void = () => {}
  onConfirmCancel: () => void = () => {}
  onResetSettings: () => void = () => {}
  onRetry: () => void = () => {}
  onPickUpgrade: (id: string) => void = () => {}
  onOpenSettings: () => void = () => {}
  onCloseSettings: () => void = () => {}
  onSettingsChange: (values: SettingsValues) => void = () => {}
  onOpenModes: () => void = () => {}
  onCloseModes: () => void = () => {}
  onPickMode: (id: string) => void = () => {}
  onOpenMaps: () => void = () => {}
  onCloseMaps: () => void = () => {}
  onPickMap: (id: string) => void = () => {}
  onOpenCoop: () => void = () => {}
  onCloseCoop: () => void = () => {}
  onAuth: (mode: 'register' | 'login', username: string, password: string) => void = () => {}
  onSignOut: () => void = () => {}
  onCreateLobby: () => void = () => {}
  onJoinLobby: (code: string) => void = () => {}
  onReadyToggle: () => void = () => {}
  /** Creator only: the arena and mission this room fights. */
  onSetWorld: (mapId: string, modeId: string) => void = () => {}
  onStartMatch: () => void = () => {}
  onLeaveLobby: () => void = () => {}
  onRematch: () => void = () => {}
  onOpenLeaderboard: () => void = () => {}
  onOpenCommendations: () => void = () => {}
  onCloseCommendations: () => void = () => {}
  onCloseLeaderboard: () => void = () => {}
  onRaceAgain: () => void = () => {}

  constructor(seed: string) {
    el('death-seed').textContent = `seed: ${seed}`
    el('race-seed').textContent = `seed: ${seed}`
    el<HTMLButtonElement>('race-again-btn').addEventListener('click', () => this.onRaceAgain())
    el<HTMLButtonElement>('start-btn').addEventListener('click', () => this.onStart())
    el<HTMLButtonElement>('restart-btn').addEventListener('click', () => this.onRestart())
    el<HTMLButtonElement>('giveup-btn').addEventListener('click', () => this.onGiveUp())
    el<HTMLButtonElement>('confirm-yes').addEventListener('click', () => {
      this.hideConfirm()
      this.confirmAction()
    })
    el<HTMLButtonElement>('confirm-no').addEventListener('click', () => {
      this.hideConfirm()
      this.onConfirmCancel()
    })
    el<HTMLButtonElement>('retry-btn').addEventListener('click', () => this.onRetry())
    el<HTMLButtonElement>('settings-btn').addEventListener('click', () => this.onOpenSettings())
    el<HTMLButtonElement>('settings-back').addEventListener('click', () => this.onCloseSettings())
    el<HTMLButtonElement>('modes-btn').addEventListener('click', () => this.onOpenModes())
    el<HTMLButtonElement>('modes-back').addEventListener('click', () => this.onCloseModes())
    el<HTMLButtonElement>('maps-btn').addEventListener('click', () => this.onOpenMaps())
    el<HTMLButtonElement>('maps-back').addEventListener('click', () => this.onCloseMaps())
    el<HTMLButtonElement>('coop-btn').addEventListener('click', () => this.onOpenCoop())
    el<HTMLButtonElement>('coop-back').addEventListener('click', () => this.onCloseCoop())
    el<HTMLButtonElement>('coop-register').addEventListener('click', () => this.submitAuth('register'))
    el<HTMLButtonElement>('coop-login').addEventListener('click', () => this.submitAuth('login'))
    el<HTMLInputElement>('coop-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitAuth('login')
    })
    el<HTMLButtonElement>('coop-signout').addEventListener('click', () => this.onSignOut())
    el<HTMLButtonElement>('coop-create').addEventListener('click', () => this.onCreateLobby())
    el<HTMLButtonElement>('coop-join').addEventListener('click', () =>
      this.onJoinLobby(el<HTMLInputElement>('coop-join-code').value),
    )
    el<HTMLInputElement>('coop-join-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onJoinLobby(el<HTMLInputElement>('coop-join-code').value)
    })
    el<HTMLButtonElement>('lobby-copy').addEventListener('click', () => void this.copyJoinLink())
    // the pickers are populated from the registries themselves, filtered by co-op stance:
    // a map or mode that says it is solo-only never appears as an option for a squad
    const mapSel = el<HTMLSelectElement>('lobby-map')
    const modeSel = el<HTMLSelectElement>('lobby-mode')
    for (const map of coopMaps()) mapSel.appendChild(new Option(map.name, map.id))
    for (const mode of coopModes()) modeSel.appendChild(new Option(mode.name, mode.id))
    mapSel.addEventListener('change', () => this.onSetWorld(mapSel.value, modeSel.value))
    modeSel.addEventListener('change', () => this.onSetWorld(mapSel.value, modeSel.value))
    el<HTMLButtonElement>('lobby-ready').addEventListener('click', () => this.onReadyToggle())
    el<HTMLButtonElement>('lobby-start').addEventListener('click', () => this.onStartMatch())
    el<HTMLButtonElement>('lobby-leave').addEventListener('click', () => this.onLeaveLobby())
    el<HTMLButtonElement>('results-rematch').addEventListener('click', () => this.onRematch())
    el<HTMLButtonElement>('results-leave').addEventListener('click', () => this.onLeaveLobby())
    el<HTMLButtonElement>('leaderboard-btn').addEventListener('click', () => this.onOpenLeaderboard())
    el<HTMLButtonElement>('leaderboard-back').addEventListener('click', () => this.onCloseLeaderboard())
    el<HTMLButtonElement>('commend-btn').addEventListener('click', () => this.onOpenCommendations())
    el<HTMLButtonElement>('commend-back').addEventListener('click', () => this.onCloseCommendations())
    for (const id of SLIDER_IDS) {
      el<HTMLInputElement>(id).addEventListener('input', () => {
        this.refreshSettingsDisplay()
        this.onSettingsChange(this.readSettings())
      })
    }
    for (const id of TOGGLE_IDS) {
      el<HTMLButtonElement>(id).addEventListener('click', () => {
        this.setToggle(id, !this.toggleOn(id))
        this.onSettingsChange(this.readSettings())
      })
    }
    el<HTMLButtonElement>('settings-reset').addEventListener('click', () => this.onResetSettings())
    // fullscreen is queried live, never persisted; the label follows the browser state
    el<HTMLButtonElement>('set-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen().catch(() => {})
    })
    document.addEventListener('fullscreenchange', () =>
      this.setToggle('set-fullscreen', document.fullscreenElement !== null),
    )
  }

  private toggleOn(id: string): boolean {
    return el<HTMLButtonElement>(id).dataset.on === '1'
  }

  private setToggle(id: string, on: boolean): void {
    const btn = el<HTMLButtonElement>(id)
    btn.dataset.on = on ? '1' : '0'
    btn.textContent = on ? 'On' : 'Off'
  }

  private submitAuth(mode: 'register' | 'login'): void {
    this.onAuth(mode, el<HTMLInputElement>('coop-username').value, el<HTMLInputElement>('coop-password').value)
  }

  initSettings(values: SettingsValues): void {
    el<HTMLInputElement>('set-music').value = String(Math.round(values.music * 100))
    el<HTMLInputElement>('set-sfx').value = String(Math.round(values.sfx * 100))
    el<HTMLInputElement>('set-sens').value = String(Math.round(values.sensitivity * 100))
    el<HTMLInputElement>('set-fov').value = String(Math.round(values.fov))
    this.setToggle('set-invert', values.invertY)
    this.setToggle('set-shadows', values.shadows)
    this.setToggle('set-fullscreen', document.fullscreenElement !== null)
    this.refreshSettingsDisplay()
  }

  private refreshSettingsDisplay(): void {
    for (const id of SLIDER_IDS) {
      const input = el<HTMLInputElement>(id)
      const min = Number(input.min)
      const pct = ((input.valueAsNumber - min) / (Number(input.max) - min)) * 100
      input.style.setProperty('--fill', `${pct.toFixed(0)}%`)
      el(`${id}-val`).textContent = id === 'set-fov' ? `${input.value}°` : `${input.value}%`
    }
  }

  private readSettings(): SettingsValues {
    return {
      music: el<HTMLInputElement>('set-music').valueAsNumber / 100,
      sfx: el<HTMLInputElement>('set-sfx').valueAsNumber / 100,
      sensitivity: el<HTMLInputElement>('set-sens').valueAsNumber / 100,
      invertY: this.toggleOn('set-invert'),
      fov: el<HTMLInputElement>('set-fov').valueAsNumber,
      shadows: this.toggleOn('set-shadows'),
    }
  }

  showSettings(): void {
    this.start.classList.add('hidden')
    this.settingsPanel.classList.remove('hidden')
  }

  hideSettings(): void {
    this.settingsPanel.classList.add('hidden')
  }

  get settingsOpen(): boolean {
    return !this.settingsPanel.classList.contains('hidden')
  }

  showModes(
    modes: { id: string; name: string; desc: string }[],
    currentId: string,
    bests: Record<string, string> = {},
  ): void {
    this.modeCards.innerHTML = ''
    for (const mode of modes) {
      const selected = mode.id === currentId
      const best = bests[mode.id]
      const card = document.createElement('div')
      card.className = selected ? 'card mode-card selected' : 'card mode-card'
      card.tabIndex = 0
      card.setAttribute('role', 'button')
      card.innerHTML =
        `<div class="card-name">${mode.name}</div><div class="card-desc">${mode.desc}</div>` +
        (selected ? '<div class="card-tag">Active</div>' : '') +
        (best ? `<div class="card-pb">${best}</div>` : '')
      card.addEventListener('click', () => this.onPickMode(mode.id))
      card.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        this.onPickMode(mode.id)
      })
      this.modeCards.appendChild(card)
    }
    this.start.classList.add('hidden')
    this.modesPanel.classList.remove('hidden')
  }

  hideModes(): void {
    this.modesPanel.classList.add('hidden')
  }

  get modesOpen(): boolean {
    return !this.modesPanel.classList.contains('hidden')
  }

  /** The Map button on the start plate; hidden when the mode offers only one arena. */
  initMapsButton(mapName: string, visible: boolean): void {
    const button = el<HTMLButtonElement>('maps-btn')
    button.textContent = `Map · ${mapName}`
    button.classList.toggle('hidden', !visible)
  }

  showMaps(
    maps: { id: string; name: string; desc: string }[],
    currentId: string,
    bests: Record<string, string> = {},
  ): void {
    this.mapCards.innerHTML = ''
    for (const map of maps) {
      const selected = map.id === currentId
      const best = bests[map.id]
      const card = document.createElement('div')
      card.className = selected ? 'card mode-card selected' : 'card mode-card'
      card.tabIndex = 0
      card.setAttribute('role', 'button')
      card.innerHTML =
        `<div class="card-name">${map.name}</div><div class="card-desc">${map.desc}</div>` +
        (selected ? '<div class="card-tag">Active</div>' : '') +
        (best ? `<div class="card-pb">${best}</div>` : '')
      card.addEventListener('click', () => this.onPickMap(map.id))
      card.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        this.onPickMap(map.id)
      })
      this.mapCards.appendChild(card)
    }
    this.start.classList.add('hidden')
    this.mapsPanel.classList.remove('hidden')
  }

  hideMaps(): void {
    this.mapsPanel.classList.add('hidden')
  }

  get mapsOpen(): boolean {
    return !this.mapsPanel.classList.contains('hidden')
  }

  showCommendations(rows: CommendationRow[]): void {
    this.commendRowsEl.innerHTML = ''
    let earned = 0
    for (const row of rows) {
      if (row.awarded) earned += 1
      const rowEl = document.createElement('div')
      rowEl.className = row.awarded ? 'commend-row awarded' : 'commend-row'
      const left = document.createElement('div')
      const name = document.createElement('div')
      name.className = 'commend-name'
      name.textContent = row.name
      if (row.tiers) {
        const tiers = document.createElement('span')
        tiers.className = 'commend-tiers'
        for (const [i, lit] of row.tiers.entries()) {
          const pip = document.createElement('span')
          pip.className = lit ? 'lit' : 'unlit'
          pip.textContent = `${['I', 'II', 'III'][i]} `
          tiers.appendChild(pip)
        }
        name.appendChild(tiers)
      }
      const desc = document.createElement('div')
      desc.className = 'commend-desc'
      desc.textContent = row.desc
      left.append(name, desc)
      const meta = document.createElement('div')
      meta.className = 'commend-meta'
      meta.textContent = row.awarded
        ? '✓ Awarded'
        : row.progress
          ? `${row.progress.value.toLocaleString('en-US')} / ${row.progress.target.toLocaleString('en-US')}`
          : 'Locked'
      rowEl.append(left, meta)
      this.commendRowsEl.appendChild(rowEl)
    }
    this.commendCountEl.textContent = `${earned} of ${rows.length} awarded`
    this.start.classList.add('hidden')
    this.commendPanel.classList.remove('hidden')
  }

  hideCommendations(): void {
    this.commendPanel.classList.add('hidden')
  }

  get commendationsOpen(): boolean {
    return !this.commendPanel.classList.contains('hidden')
  }

  /** Queue an award toast; simultaneous awards play one after another, ~3s each. */
  commendationToast(name: string, desc: string): void {
    this.commendQueue.push({ name, desc })
    if (!this.commendToastBusy) this.nextCommendToast()
  }

  private nextCommendToast(): void {
    const next = this.commendQueue.shift()
    if (!next) {
      this.commendToastBusy = false
      return
    }
    this.commendToastBusy = true
    this.commendToastEl.innerHTML = ''
    const kicker = document.createElement('span')
    kicker.className = 'commend-kicker'
    kicker.textContent = 'Commendation'
    const title = document.createElement('span')
    title.className = 'commend-title'
    title.textContent = next.name
    const desc = document.createElement('span')
    desc.className = 'commend-toast-desc'
    desc.textContent = ` · ${next.desc}`
    this.commendToastEl.append(kicker, title, desc)
    this.commendToastEl.classList.add('show')
    window.clearTimeout(this.commendToastTimer)
    this.commendToastTimer = window.setTimeout(() => {
      this.commendToastEl.classList.remove('show')
      this.commendToastTimer = window.setTimeout(() => this.nextCommendToast(), 300)
    }, 3000)
  }

  update(game: GameState, frame: HudFrame): void {
    const p = game.player
    this.crosshair.classList.toggle('in-range', frame.hookInRange)
    const hp = Math.max(0, p.hp)
    const lost = Math.max(0, p.config.maxHp - hp)
    this.hearts.innerHTML =
      '♥ '.repeat(hp).trim() + (lost > 0 ? ` <span class="empty">${'♥ '.repeat(lost).trim()}</span>` : '')
    this.score.textContent = String(game.score.score)
    this.combo.textContent =
      game.score.combo > 1 ? `×${(1 + 0.25 * Math.min(game.score.combo, 12)).toFixed(2)} chain (${game.score.combo})` : ''
    // the record line follows the live run the moment it becomes the record
    const record = game.score.score > 0 && game.score.score >= game.best.bestScore
    this.best.textContent = record
      ? `BEST ${game.score.score} · THIS ROUND`
      : `BEST ${game.best.bestScore} · WAVE ${game.best.bestWave}`
    this.best.classList.toggle('record', record)

    const gasRatio = p.gas / p.config.maxGas
    this.gasFill.style.width = `${(gasRatio * 100).toFixed(1)}%`
    this.gasCanisters.textContent = `×${p.canisters}`
    // the edge left on the pair in hand, and the gauge stains toward dull as it goes: the
    // blade you are swinging is visibly worse steel than the one you started the wave with
    const edge = p.bladeHp / Math.max(1, p.config.bladeDurability)
    this.bladeFill.style.width = `${(edge * 100).toFixed(1)}%`
    this.bladeFill.classList.toggle('dull', edge <= 0.5)
    this.bladePairs.textContent = `×${p.blades}`
    // and the bar it now takes to take a head off, whenever that is not the honest 17
    const bar = oneCutSpeed(p)
    const dulled = Number.isFinite(bar) && bar > p.config.killSpeed + 0.05
    this.bladeThreshold.classList.toggle('hidden', !dulled)
    if (dulled) this.bladeThreshold.textContent = `ONE-CUT ${bar.toFixed(1)} m/s`
    // segment the gauges into countable uses (upgrades can change both counts)
    this.gasBar.style.setProperty('--segs', String(Math.max(1, Math.floor(p.config.maxGas / BOOST_COST))))
    this.bladeBar.style.setProperty('--segs', String(Math.max(1, p.config.bladeDurability)))
    this.spearFill.style.width = `${((p.spears / Math.max(1, p.config.spearCapacity)) * 100).toFixed(1)}%`
    this.spearCount.textContent = `×${p.spears}`
    this.spearBar.style.setProperty('--segs', String(Math.max(1, p.config.spearCapacity)))
    // the lamp gauge only exists at night; an empty or dying battery joins the red pulse
    this.lampRow.classList.toggle('hidden', frame.lamp === null)
    if (frame.lamp !== null) this.lampFill.style.width = `${(frame.lamp * 100).toFixed(1)}%`

    this.meters.classList.toggle(
      'low',
      (gasRatio < 0.2 && p.canisters === 0) || p.blades <= 1 || (frame.lamp !== null && frame.lamp < 0.2),
    )

    // the focus bar is a 3-kill charge: segments fill per kill, drain continuously while spent
    this.focusBar.style.setProperty('--segs', String(FOCUS_KILLS_TO_FILL))
    const focusReady = game.focusCharge >= FOCUS_KILLS_TO_FILL
    this.focusFill.style.width = game.focusActive
      ? `${game.focus.toFixed(1)}%`
      : `${((game.focusCharge / FOCUS_KILLS_TO_FILL) * 100).toFixed(1)}%`
    this.focusBar.classList.toggle('ready', focusReady && !game.focusActive)
    this.focusStatus.classList.toggle('ready', focusReady && !game.focusActive)
    this.focusStatus.textContent = game.focusActive
      ? 'AIM THE NAPE'
      : focusReady
        ? 'READY — Q'
        : game.focusCharge === 0
          ? 'KILL TITANS TO CHARGE'
          : `${game.focusCharge} / ${FOCUS_KILLS_TO_FILL}`

    // grabbed: the dial fills per mash press while the countdown drains toward the squeeze
    this.grabQte.classList.toggle('hidden', game.grab === null)
    if (game.grab) {
      // the soldier's own threshold, not the stock one: Escape Artist has to make the dial
      // fill faster, or the pick is invisible exactly where the player is looking hardest
      this.grabDialFill.style.setProperty(
        '--p',
        Math.min(1, game.grab.presses / game.player.config.grabEscapePresses).toFixed(3),
      )
      this.grabTime.textContent = Math.max(0, game.grab.timeLeft).toFixed(1)
    }

    this.updateBossBar(game)

    if (game.mode.id === 'race') {
      // racers think in meters per second; the station prompt is meaningless (R restarts)
      this.speedo.textContent = `${Math.round(frame.speed)} m/s`
      this.prompt.textContent = ''
    } else {
      const kmh = Math.round(frame.speed * 3.6)
      // "fast enough to kill" is a moving line now: it is the bar for the steel in hand
      this.speedo.innerHTML =
        // the bar moves with the edge on the blade in hand, so the "fast enough to kill"
        // highlight has to move with it (dull blades, tf-002)
        frame.speed >= oneCutSpeed(p) ? `<span class="fast">${kmh} km/h</span>` : `${kmh} km/h`
      // a Field Kit is a station you carry, so it has to prompt like one — otherwise the pick
      // works and the player never finds out, which is the same as it not working
      const kits = p.kits
      this.prompt.textContent =
        game.phase !== 'playing'
          ? ''
          : frame.nearStation
            ? 'R — RESUPPLY'
            : kits > 0
              ? `R — FIELD KIT (${kits})`
              : ''
    }
  }

  // --- Shifter bar ---------------------------------------------------------------

  /**
   * The branded boss gauge: one segment per Weak Point, filled from its pool, the lit one
   * pulsing, plated ones reading steel. Shown only while a living Shifter is engaged.
   */
  private updateBossBar(game: GameState): void {
    const fight = game.boss
    const show =
      fight !== null && fight.state.engaged && fight.titan.hp > 0 && game.phase === 'playing'
    this.bossStrip.classList.toggle('hidden', !show)
    if (!fight || !show) return

    if (this.bossSegs.length !== fight.state.parts.length) {
      this.bossBar.innerHTML = ''
      this.bossSegs = fight.state.parts.map(() => {
        const seg = document.createElement('div')
        seg.className = 'boss-seg'
        const fill = document.createElement('div')
        fill.className = 'boss-seg-fill'
        seg.appendChild(fill)
        this.bossBar.appendChild(seg)
        return { seg, fill }
      })
    }
    this.bossName.textContent = fight.spec.name
    for (const [i, { seg, fill }] of this.bossSegs.entries()) {
      const part = fight.state.parts[i]!
      fill.style.transform = `scaleX(${(part.hp / part.maxHp).toFixed(3)})`
      seg.classList.toggle('plated', part.plated && !part.broken)
      seg.classList.toggle('lit', i === fight.state.phase)
    }
    const lit = fight.spec.parts[fight.state.phase]
    this.bossPart.textContent = lit
      ? fight.state.parts[fight.state.phase]!.plated
        ? `WEAK POINT — ${lit.name.toUpperCase()} · PLATED`
        : `WEAK POINT — ${lit.name.toUpperCase()}`
      : ''
  }

  /** A plate crack or part break flashes the whole bar bright for a beat. */
  bossBarFlash(): void {
    this.bossBar.classList.remove('crack')
    void this.bossBar.offsetWidth // restart the animation
    this.bossBar.classList.add('crack')
  }

  // --- Signal Run race strip ---------------------------------------------------

  /** Swaps the combat HUD for the race strip; set once at boot (mode is per page load). */
  setRaceUi(active: boolean): void {
    document.body.classList.toggle('race', active)
    this.raceStrip.classList.toggle('hidden', !active)
  }

  /** Per-frame race readout: clock, gate counter, meters-to-gate, edge caret. */
  updateRace(game: GameState, caret: RaceCaret | null): void {
    const race = game.race
    if (!race) return
    this.raceTimer.textContent = formatRaceTime(race.time)
    this.raceTimer.classList.toggle('idle', !race.armed)
    this.raceGate.textContent =
      race.nextGate >= race.course.gates.length
        ? 'FINISH'
        : `GATE ${race.nextGate + 1}/${race.course.gates.length}`

    const show = caret !== null && game.phase === 'playing'
    this.raceDist.classList.toggle('hidden', !show)
    if (show) this.raceDist.textContent = `${Math.round(caret.dist)} m`
    const edge = show && !caret.onScreen
    this.raceCaret.classList.toggle('hidden', !edge)
    if (edge) {
      this.raceCaret.style.left = `${caret.x.toFixed(0)}px`
      this.raceCaret.style.top = `${caret.y.toFixed(0)}px`
      this.raceCaret.style.transform = `translate(-50%, -50%) rotate(${caret.angle.toFixed(3)}rad)`
    }
  }

  /** Binocular mask strength 0..1, faded by main in step with the optical zoom. */
  setZoom(strength: number): void {
    const v = Math.round(strength * 100) / 100
    if (v === this.zoomShown) return
    this.zoomShown = v
    this.zoomMask.style.opacity = v.toFixed(2)
  }

  /** Per-frame threat radar: one red edge triangle per nearby off-screen titan. */
  updateThreats(pings: ThreatPing[]): void {
    while (this.threatPool.length < pings.length) {
      const div = document.createElement('div')
      div.className = 'threat-caret'
      this.threats.appendChild(div)
      this.threatPool.push(div)
    }
    for (const [i, div] of this.threatPool.entries()) {
      const ping = pings[i]
      if (!ping) {
        div.style.display = 'none'
        continue
      }
      div.style.display = ''
      div.style.left = `${ping.x.toFixed(0)}px`
      div.style.top = `${ping.y.toFixed(0)}px`
      div.style.transform = `translate(-50%, -50%) rotate(${ping.angle.toFixed(3)}rad)`
      div.style.opacity = ping.alpha.toFixed(2)
      div.classList.toggle('hot', ping.hot)
    }
  }

  /** Split delta vs PB flashed as a gate is passed: green ahead, red behind. */
  raceSplitFlash(delta: number | null, split: number): void {
    this.raceSplit.textContent = delta === null ? formatRaceTime(split) : formatDelta(delta)
    this.raceSplit.className = delta === null ? 'show' : delta <= 0 ? 'show ahead' : 'show behind'
    window.clearTimeout(this.raceSplitTimer)
    this.raceSplitTimer = window.setTimeout(() => this.raceSplit.classList.remove('show'), 1800)
  }

  showRaceResults(game: GameState): void {
    const race = game.race
    if (!race) return
    const best = race.best
    const pb = best !== null && race.time <= best.time
    el('race-results-stats').innerHTML = [
      `TIME <b>${formatRaceTime(race.time)}</b>${pb ? ' · <b>NEW PB</b>' : ''}`,
      best && !pb ? `PB <b>${formatRaceTime(best.time)}</b> (${formatDelta(race.time - best.time)})` : '',
    ]
      .filter(Boolean)
      .join('<br />')
    el('race-splits').innerHTML = race.splits
      .map((split, i) => {
        const ref = pb ? null : best?.splits[i]
        const delta = ref === undefined || ref === null ? null : split - ref
        const cls = delta === null ? '' : delta <= 0 ? 'rs-ahead' : 'rs-behind'
        return (
          `<div class="rs-row"><span>GATE ${i + 1}</span><span>${formatRaceTime(split)}</span>` +
          `<span class="${cls}">${delta === null ? '' : formatDelta(delta)}</span></div>`
        )
      })
      .join('')
    this.raceResults.classList.remove('hidden')
  }

  hideRaceResults(): void {
    this.raceResults.classList.add('hidden')
  }

  // --- The Culling countdown strip ----------------------------------------------

  setHuntUi(active: boolean): void {
    this.huntStrip.classList.toggle('hidden', !active)
  }

  /**
   * Per-frame hunt readout: countdown, titans left, urgency styling.
   * Returns whether the urgency layer is live so main can drive the heartbeat.
   */
  updateHunt(game: GameState): boolean {
    const hunt = game.hunt
    if (!hunt) return false
    const total = Math.max(0, Math.ceil(hunt.timeLeft))
    this.huntTimer.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
    const alive = game.titans.filter((t) => t.hp > 0).length
    this.huntLeft.textContent = `TITANS LEFT · ${alive}`
    const urgent =
      game.phase === 'playing' && hunt.timeLeft <= hunt.budget * HUNT_URGENCY_FRACTION
    this.huntTimer.classList.toggle('urgent', urgent)
    this.huntVignette.classList.toggle('on', urgent)
    return urgent
  }

  /** A kill flashes the TITANS LEFT counter: one fewer between you and the next breath. */
  huntKillFlash(): void {
    this.huntLeft.classList.remove('pop')
    void this.huntLeft.offsetWidth // restart the CSS animation
    this.huntLeft.classList.add('pop')
  }

  showBanner(text: string, ms = 1800): void {
    this.banner.textContent = text
    this.banner.classList.add('show')
    window.clearTimeout(this.bannerTimer)
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), ms)
  }

  popPoints(points: number, oneCut: boolean, heartGained = false): void {
    this.popText(`+${points}${oneCut ? ' ONE CUT' : ''}${heartGained ? ' ♥' : ''}`)
  }

  popText(text: string): void {
    this.popup.textContent = text
    this.popup.classList.remove('pop')
    void this.popup.offsetWidth // restart the CSS animation
    this.popup.classList.add('pop')
  }

  setFocusVignette(active: boolean): void {
    this.focusVignette.classList.toggle('on', active)
  }

  setStrikePrompt(show: boolean): void {
    this.strikePrompt.classList.toggle('show', show)
  }

  /** A kill just banked a third of the meter: snap the new segment in with a flash. */
  focusCharged(): void {
    this.focusBar.classList.remove('charged')
    void this.focusBar.offsetWidth // restart the CSS animation
    this.focusBar.classList.add('charged')
  }

  /** Radial speed lines for the strike dash. */
  strikeFx(): void {
    this.strikeFxEl.classList.remove('go')
    void this.strikeFxEl.offsetWidth
    this.strikeFxEl.classList.add('go')
  }

  slashFlash(): void {
    this.flash.classList.remove('go')
    void this.flash.offsetWidth
    this.flash.classList.add('go')
  }

  showHit(): void {
    this.vignette.style.opacity = '1'
    window.setTimeout(() => (this.vignette.style.opacity = '0'), 220)
  }

  showStart(resume = false, g?: GameState): void {
    this.start.classList.remove('hidden')
    this.start.classList.toggle('paused', resume) // pause menu lays the buttons out as a two-column grid
    this.start.querySelector('h1')!.textContent = resume ? 'Paused' : 'Wings of Freedom'
    el<HTMLButtonElement>('start-btn').textContent = resume ? 'Resume' : 'Deploy Your Soldier'
    el<HTMLButtonElement>('restart-btn').classList.toggle('hidden', !resume) // mid-run only
    // no death report to file in a race: Restart already covers "start over"
    el<HTMLButtonElement>('giveup-btn').classList.toggle('hidden', !resume || g?.mode.id === 'race')
    // paused: the subtitle slot carries the run, not the sales pitch
    el('start-sub').innerHTML = resume && g ? this.runSummary(g) : this.startSubDefault
    el('start-context').textContent = g ? this.menuContext(g) : ''
  }

  /** One line of where the paused run stands, phrased per mode. */
  private runSummary(g: GameState): string {
    if (g.race) {
      const total = g.race.course.gates.length
      return `Signal Run · ${g.race.nextGate} of ${total} gates · ${formatRaceTime(g.race.time)}`
    }
    if (g.mode.id === 'hunt' && g.hunt) {
      return `Level ${g.wave} · Score ${g.score.score} · ${Math.max(0, Math.ceil(g.hunt.timeLeft))} s on the clock`
    }
    return `Wave ${g.wave} · Score ${g.score.score} · ${g.score.kills} kills`
  }

  /** What deploys when you press the button: active mode, course, and your record on it. */
  private menuContext(g: GameState): string {
    const parts = [g.mode.name, `seed ${g.seed}`]
    if (g.map.id !== DEFAULT_MAP_ID) parts.splice(1, 0, g.map.name)
    if (g.mode.id === 'race') {
      const best = g.race?.best ?? loadRaceBest(g.storage, mapScopedSeed(g.map.id, g.seed))
      if (best) parts.push(`best ${formatRaceTime(best.time)}`)
    } else if (g.mode.id === 'hunt') {
      const best = g.hunt?.best ?? loadHuntBest(g.storage, mapScopedSeed(g.map.id, g.seed))
      if (best) parts.push(`best level ${best.level}`)
    } else if (g.best.bestScore > 0) {
      parts.push(`best ${g.best.bestScore} · wave ${g.best.bestWave}`)
    }
    return parts.join(' · ')
  }

  hideStart(): void {
    this.start.classList.add('hidden')
  }

  /** One shared "this ends your run" gate for every destructive menu action. */
  showConfirm(text: string, yesLabel: string, onYes: () => void): void {
    this.start.classList.add('hidden')
    this.modesPanel.classList.add('hidden')
    this.mapsPanel.classList.add('hidden')
    el('confirm-text').textContent = text
    el<HTMLButtonElement>('confirm-yes').textContent = yesLabel
    this.confirmAction = onYes
    this.confirmPanel.classList.remove('hidden')
  }

  hideConfirm(): void {
    this.confirmPanel.classList.add('hidden')
  }

  get confirmOpen(): boolean {
    return !this.confirmPanel.classList.contains('hidden')
  }

  showUpgrades(offers: Upgrade[]): void {
    this.upgradeCards.innerHTML = ''
    for (const offer of offers) {
      const card = document.createElement('div')
      card.className = 'card'
      card.innerHTML = `<div class="card-name">${offer.name}</div><div class="card-desc">${offer.desc}</div>`
      card.addEventListener('click', () => this.onPickUpgrade(offer.id))
      this.upgradeCards.appendChild(card)
    }
    this.upgrade.classList.remove('hidden')
  }

  hideUpgrades(): void {
    this.upgrade.classList.add('hidden')
  }

  // --- co-op panels ----------------------------------------------------------

  /** Toggles the co-op chrome: hides solo-only menu items while in a squad. */
  setCoopUi(active: boolean): void {
    document.body.classList.toggle('coop', active)
  }

  showCoop(view: 'auth' | 'room', username = ''): void {
    this.start.classList.add('hidden')
    this.coopPanel.classList.remove('hidden')
    el('coop-auth').classList.toggle('hidden', view !== 'auth')
    el('coop-room').classList.toggle('hidden', view !== 'room')
    el('coop-whoami').textContent = username
    this.coopError('')
  }

  hideCoop(): void {
    this.coopPanel.classList.add('hidden')
  }

  get coopOpen(): boolean {
    return !this.coopPanel.classList.contains('hidden')
  }

  coopError(message: string, view: 'auth' | 'room' = 'auth'): void {
    el(view === 'auth' ? 'coop-auth-error' : 'coop-room-error').textContent = message
  }

  showLobby(lobby: LobbyMsg, joinUrl: string): void {
    this.start.classList.add('hidden')
    this.resultsPanel.classList.add('hidden')
    this.lobbyPanel.classList.remove('hidden')
    this.joinUrl = joinUrl
    el('lobby-title').textContent = lobby.code.toUpperCase()
    el('lobby-share').textContent = `${lobby.players.length} / ${lobby.maxPlayers} soldiers mustered`
    const roster = el('lobby-roster')
    roster.innerHTML = ''
    for (const player of lobby.players) {
      const row = document.createElement('div')
      row.className = player.ready ? 'roster-row ready' : 'roster-row'
      const you = player.id === lobby.you ? ' <span class="you">· you</span>' : ''
      const crown = player.id === lobby.creator ? '<span class="r-crown">♛</span>' : ''
      const state = lobby.phase !== 'lobby' && player.inMatch ? 'IN BATTLE' : player.ready ? 'READY' : 'MUSTERING'
      row.innerHTML = `<span class="r-name">${crown}${player.id}${you}</span><span class="r-state">${state}</span>`
      roster.appendChild(row)
    }
    const me = lobby.players.find((p) => p.id === lobby.you)
    const isCreator = lobby.creator === lobby.you
    // the world: the leader chooses it, everyone else reads it
    const mapSel = el<HTMLSelectElement>('lobby-map')
    const modeSel = el<HTMLSelectElement>('lobby-mode')
    mapSel.value = lobby.mapId
    modeSel.value = lobby.modeId
    const picking = isCreator && lobby.phase === 'lobby'
    mapSel.disabled = !picking
    modeSel.disabled = !picking
    el('lobby-world').classList.toggle('hidden', !picking)
    const read = el('lobby-world-read')
    read.classList.toggle('hidden', picking)
    if (!picking) {
      const map = coopMaps().find((m) => m.id === lobby.mapId)
      const mode = coopModes().find((m) => m.id === lobby.modeId)
      read.textContent = `${map?.name ?? lobby.mapId} · ${mode?.name ?? lobby.modeId}`
    }
    el<HTMLButtonElement>('lobby-ready').textContent = me?.ready ? 'Not Ready' : 'Ready'
    el<HTMLButtonElement>('lobby-ready').classList.toggle('hidden', isCreator)
    const allReady = lobby.players.every((p) => p.ready)
    const startBtn = el<HTMLButtonElement>('lobby-start')
    startBtn.classList.toggle('hidden', !isCreator)
    startBtn.disabled = !allReady
    startBtn.style.opacity = allReady ? '1' : '0.45'
    el('lobby-status').textContent =
      lobby.phase !== 'lobby'
        ? 'A battle is under way. You will muster with the squad when it ends.'
        : isCreator && !allReady && lobby.players.length > 1
          ? 'Waiting for the squad to ready up…'
          : ''
  }

  hideLobby(): void {
    this.lobbyPanel.classList.add('hidden')
  }

  private async copyJoinLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.joinUrl)
    } catch {
      // clipboard API can be denied outside secure contexts: fall back to the classic trick
      const scratch = document.createElement('textarea')
      scratch.value = this.joinUrl
      document.body.appendChild(scratch)
      scratch.select()
      document.execCommand('copy')
      scratch.remove()
    }
    const btn = el<HTMLButtonElement>('lobby-copy')
    btn.textContent = 'Link Copied'
    btn.classList.add('copied')
    window.clearTimeout(this.copyTimer)
    this.copyTimer = window.setTimeout(() => {
      btn.textContent = 'Copy Squad Link'
      btn.classList.remove('copied')
    }, 1600)
    this.toast('Squad link copied · Send it to your soldiers')
  }

  toast(text: string): void {
    this.toastEl.textContent = text
    this.toastEl.classList.add('show')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600)
  }

  get lobbyOpen(): boolean {
    return !this.lobbyPanel.classList.contains('hidden')
  }

  showResults(results: MatchResults, me: string, isCreator: boolean): void {
    this.lobbyPanel.classList.add('hidden')
    this.resultsPanel.classList.remove('hidden')
    const minutes = Math.floor(results.durationS / 60)
    const seconds = Math.round(results.durationS % 60)
    el('results-sub').textContent =
      `The squad held ${results.wavesCleared} ${results.wavesCleared === 1 ? 'wave' : 'waves'} for ` +
      `${minutes}:${String(seconds).padStart(2, '0')} before the wall fell.`
    const rows = el('result-rows')
    rows.innerHTML = ''
    results.players.forEach((player, index) => {
      const row = document.createElement('div')
      row.className = player.mvp ? 'result-row mvp' : 'result-row'
      const name = player.id === me ? `${player.id} · you` : player.id
      row.innerHTML =
        `<span class="rr-rank">${player.mvp ? '♛' : index + 1}</span>` +
        `<span class="rr-name">${name}${player.mvp ? ' · MVP' : ''}</span>` +
        `<span class="rr-stats">${player.kills} kills · ${player.deaths} deaths</span>` +
        `<span class="rr-score">${player.score}</span>`
      rows.appendChild(row)
    })
    el('results-rematch').classList.toggle('hidden', !isCreator)
    el('results-wait').classList.toggle('hidden', isCreator)
  }

  hideResults(): void {
    this.resultsPanel.classList.add('hidden')
  }

  updateSquad(rows: { id: string; hp: number; maxHp: number; score: number; alive: boolean; me: boolean }[]): void {
    if (rows.length === 0) {
      this.squad.innerHTML = ''
      return
    }
    this.squad.innerHTML = rows
      .map(
        (r) =>
          `<div class="sq-row${r.me ? ' me' : ''}${r.alive ? '' : ' dead'}">` +
          `<span class="sq-name">${r.id}</span>` +
          `<span class="sq-hearts">${'♥'.repeat(Math.max(0, r.hp))}${'·'.repeat(Math.max(0, r.maxHp - r.hp))}</span>` +
          `<span class="sq-score">${r.score}</span></div>`,
      )
      .join('')
  }

  addFeedLine(html: string): void {
    const line = document.createElement('div')
    line.className = 'feed-line'
    line.innerHTML = html
    this.feed.prepend(line)
    while (this.feed.children.length > 4) this.feed.lastChild?.remove()
    window.setTimeout(() => line.remove(), 5000)
  }

  setPickStatus(text: string): void {
    this.pickStatus.textContent = text
  }

  showLeaderboard(
    data: Leaderboard | null,
    state: 'loading' | 'ready' | 'error' = 'ready',
    you: string | null = null,
  ): void {
    this.start.classList.add('hidden')
    this.leaderboardPanel.classList.remove('hidden')
    const teams = el('lb-teams')
    const soldiers = el('lb-soldiers')
    if (!data) {
      if (state === 'loading') {
        // skeleton rows hold the exact card layout while the archive loads
        const skeletons = Array.from(
          { length: 5 },
          () => '<div class="lb-row skeleton"><span class="sk-bar"></span><span class="sk-bar sk-short"></span></div>',
        ).join('')
        teams.innerHTML = skeletons
        soldiers.innerHTML = skeletons
      } else {
        teams.innerHTML = '<div class="lb-empty">Headquarters is unreachable.</div>'
        soldiers.innerHTML = '<div class="lb-empty"></div>'
      }
      return
    }
    // five rows per column: the panel must fit a laptop screen, not archive history
    teams.innerHTML =
      data.teams.length === 0
        ? '<div class="lb-empty">No squads on record yet. Be the first.</div>'
        : data.teams
            .slice(0, 5)
            .map(
              (t) =>
                `<div class="lb-row${t.players.some((p) => p.username === you) ? ' mine' : ''}">` +
                `<span><b>${t.wavesCleared} waves</b> · ${t.players
                  .map((p) => p.username)
                  .join(', ')}</span><span class="lb-sub">${Math.round(t.durationS / 60)} min</span></div>`,
            )
            .join('')
    soldiers.innerHTML =
      data.soldiers.length === 0
        ? '<div class="lb-empty">No soldiers on record yet.</div>'
        : data.soldiers
            .slice(0, 5)
            .map(
              (s) =>
                `<div class="lb-row${s.username === you ? ' mine' : ''}"><span><b>${s.score}</b> · ${s.username}</span>` +
                `<span class="lb-sub">${s.kills} kills · wave ${s.wavesCleared}</span></div>`,
            )
            .join('')
  }

  /** Tells a signed-out visitor how names get onto the boards at all. */
  setLeaderboardIdentity(username: string | null): void {
    el('lb-signin').innerHTML = username
      ? `Posting times as <b>${username}</b>`
      : 'Times post under your soldier name: enlist once via <b>Multiplayer</b> to join the boards.'
  }

  hideLeaderboard(): void {
    this.leaderboardPanel.classList.add('hidden')
  }

  /**
   * Time-trial boards, one block per arena the caller hands over (main.ts walks the map
   * registry, so a new map brings its own boards with it). Each arena resolves its fetch
   * on its own clock, hence the per-section state. An empty list hides the whole block.
   */
  showTrialBoards(seed: string, sections: TrialSection[], you: string | null = null): void {
    const caption = el('lb-trial-caption')
    const trials = el('lb-trials')
    caption.classList.toggle('hidden', sections.length === 0)
    trials.classList.toggle('hidden', sections.length === 0)
    if (sections.length === 0) return

    caption.innerHTML = `Time trials on seed <b>${seed}</b> — every arena keeps its own board.`
    trials.innerHTML = sections
      .map((section) => {
        const here = section.current ? '<span class="lb-here">You are here</span>' : ''
        const rows = `lb-rows${section.state === 'loading' ? ' loading' : ''}`
        return (
          `<div class="lb-arena${section.current ? ' current' : ''}">` +
          `<div class="lb-arena-name">${section.mapName}${here}</div>` +
          '<div class="lb-cols">' +
          `<div class="lb-col"><h3>Signal Run · Fastest</h3>` +
          `<div class="${rows}">${raceRows(section, you)}</div></div>` +
          `<div class="lb-col"><h3>The Culling · Deepest</h3>` +
          `<div class="${rows}">${huntRows(section, you)}</div></div>` +
          '</div></div>'
        )
      })
      .join('')
  }

  get leaderboardOpen(): boolean {
    return !this.leaderboardPanel.classList.contains('hidden')
  }

  showDeath(game: GameState, abandoned = false): void {
    const title = this.death.querySelector('h2')!
    if (game.mode.id === 'hunt') {
      // the hunt's run-over card: how deep you got, and what the seed's record is
      const timedOut = game.hunt !== null && game.hunt.timeLeft <= 0
      title.textContent = timedOut ? 'The Clock Ran Out' : 'Devoured'
      const best = game.hunt?.best
      this.deathStats.innerHTML = [
        `LEVEL <b>${game.wave}</b> · CLEARED <b>${Math.max(0, game.wave - 1)}</b>`,
        `KILLS <b>${game.score.kills}</b> · SCORE <b>${game.score.score}</b>`,
        best ? `BEST · LEVEL <b>${best.level}</b> · SCORE <b>${best.score}</b>` : '',
      ]
        .filter(Boolean)
        .join('<br />')
    } else {
      title.textContent = 'Devoured'
      this.deathStats.innerHTML = [
        `SCORE <b>${game.score.score}</b>`,
        `WAVE <b>${game.wave}</b> · KILLS <b>${game.score.kills}</b> · BEST CHAIN <b>${game.score.bestChain}</b>`,
        `ALL-TIME BEST <b>${game.best.bestScore}</b> · WAVE <b>${game.best.bestWave}</b>`,
      ].join('<br />')
    }
    if (abandoned) title.textContent = 'Run Abandoned' // the stats still tell the story
    this.death.classList.remove('hidden')
  }

  hideDeath(): void {
    this.death.classList.add('hidden')
  }
}

import type { Leaderboard, LobbyMsg } from './net/protocol'
import type { MatchResults } from './sim/coop'
import type { GameState } from './sim/game'
import { HUNT_URGENCY_FRACTION } from './sim/hunt'
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

/** m:ss.cc — the race strip's one number. */
export function formatRaceTime(t: number): string {
  const minutes = Math.floor(t / 60)
  const seconds = t - minutes * 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

function formatDelta(delta: number): string {
  return `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}`
}

export interface SettingsValues {
  music: number
  sfx: number
  sensitivity: number
}

const SLIDER_IDS = ['set-music', 'set-sfx', 'set-sens'] as const

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
  private focusFill = el('focus-fill')
  private focusVignette = el('focus-vignette')
  private bladeFill = el('blade-fill')
  private bladePairs = el('blade-pairs')
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
  private bannerTimer: number | undefined

  private raceStrip = el('race-strip')
  private raceTimer = el('race-timer')
  private raceGate = el('race-gate')
  private raceSplit = el('race-split')
  private raceDist = el('race-dist')
  private raceCaret = el('race-caret')
  private raceResults = el('race-results')
  private raceSplitTimer: number | undefined
  private huntStrip = el('hunt-strip')
  private huntTimer = el('hunt-timer')
  private huntLeft = el('hunt-left')
  private huntVignette = el('hunt-vignette')

  private coopPanel = el('coop')
  private lobbyPanel = el('lobby')
  private resultsPanel = el('results')
  private leaderboardPanel = el('leaderboard')
  private squad = el('squad')
  private feed = el('feed')
  private pickStatus = el('pick-status')
  private toastEl = el('toast')
  private toastTimer: number | undefined
  private copyTimer: number | undefined
  private joinUrl = ''

  onStart: () => void = () => {}
  onRestart: () => void = () => {}
  onRetry: () => void = () => {}
  onPickUpgrade: (id: string) => void = () => {}
  onOpenSettings: () => void = () => {}
  onCloseSettings: () => void = () => {}
  onSettingsChange: (values: SettingsValues) => void = () => {}
  onOpenModes: () => void = () => {}
  onCloseModes: () => void = () => {}
  onPickMode: (id: string) => void = () => {}
  onOpenCoop: () => void = () => {}
  onCloseCoop: () => void = () => {}
  onAuth: (mode: 'register' | 'login', username: string, password: string) => void = () => {}
  onSignOut: () => void = () => {}
  onCreateLobby: () => void = () => {}
  onJoinLobby: (code: string) => void = () => {}
  onReadyToggle: () => void = () => {}
  onStartMatch: () => void = () => {}
  onLeaveLobby: () => void = () => {}
  onRematch: () => void = () => {}
  onOpenLeaderboard: () => void = () => {}
  onCloseLeaderboard: () => void = () => {}
  onRaceAgain: () => void = () => {}

  constructor(seed: string) {
    el('death-seed').textContent = `seed: ${seed}`
    el('race-seed').textContent = `seed: ${seed}`
    el<HTMLButtonElement>('race-again-btn').addEventListener('click', () => this.onRaceAgain())
    el<HTMLButtonElement>('start-btn').addEventListener('click', () => this.onStart())
    el<HTMLButtonElement>('restart-btn').addEventListener('click', () => this.onRestart())
    el<HTMLButtonElement>('retry-btn').addEventListener('click', () => this.onRetry())
    el<HTMLButtonElement>('settings-btn').addEventListener('click', () => this.onOpenSettings())
    el<HTMLButtonElement>('settings-back').addEventListener('click', () => this.onCloseSettings())
    el<HTMLButtonElement>('modes-btn').addEventListener('click', () => this.onOpenModes())
    el<HTMLButtonElement>('modes-back').addEventListener('click', () => this.onCloseModes())
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
    el<HTMLButtonElement>('lobby-ready').addEventListener('click', () => this.onReadyToggle())
    el<HTMLButtonElement>('lobby-start').addEventListener('click', () => this.onStartMatch())
    el<HTMLButtonElement>('lobby-leave').addEventListener('click', () => this.onLeaveLobby())
    el<HTMLButtonElement>('results-rematch').addEventListener('click', () => this.onRematch())
    el<HTMLButtonElement>('results-leave').addEventListener('click', () => this.onLeaveLobby())
    el<HTMLButtonElement>('leaderboard-btn').addEventListener('click', () => this.onOpenLeaderboard())
    el<HTMLButtonElement>('leaderboard-back').addEventListener('click', () => this.onCloseLeaderboard())
    for (const id of SLIDER_IDS) {
      el<HTMLInputElement>(id).addEventListener('input', () => {
        this.refreshSettingsDisplay()
        this.onSettingsChange(this.readSettings())
      })
    }
  }

  private submitAuth(mode: 'register' | 'login'): void {
    this.onAuth(mode, el<HTMLInputElement>('coop-username').value, el<HTMLInputElement>('coop-password').value)
  }

  initSettings(values: SettingsValues): void {
    el<HTMLInputElement>('set-music').value = String(Math.round(values.music * 100))
    el<HTMLInputElement>('set-sfx').value = String(Math.round(values.sfx * 100))
    el<HTMLInputElement>('set-sens').value = String(Math.round(values.sensitivity * 100))
    this.refreshSettingsDisplay()
  }

  private refreshSettingsDisplay(): void {
    for (const id of SLIDER_IDS) {
      const input = el<HTMLInputElement>(id)
      const min = Number(input.min)
      const pct = ((input.valueAsNumber - min) / (Number(input.max) - min)) * 100
      input.style.setProperty('--fill', `${pct.toFixed(0)}%`)
      el(`${id}-val`).textContent = `${input.value}%`
    }
  }

  private readSettings(): SettingsValues {
    return {
      music: el<HTMLInputElement>('set-music').valueAsNumber / 100,
      sfx: el<HTMLInputElement>('set-sfx').valueAsNumber / 100,
      sensitivity: el<HTMLInputElement>('set-sens').valueAsNumber / 100,
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

  showModes(modes: { id: string; name: string; desc: string }[], currentId: string): void {
    this.modeCards.innerHTML = ''
    for (const mode of modes) {
      const selected = mode.id === currentId
      const card = document.createElement('div')
      card.className = selected ? 'card mode-card selected' : 'card mode-card'
      card.innerHTML =
        `<div class="card-name">${mode.name}</div><div class="card-desc">${mode.desc}</div>` +
        (selected ? '<div class="card-tag">Active</div>' : '')
      card.addEventListener('click', () => this.onPickMode(mode.id))
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
    this.bladeFill.style.width = `${((p.bladeHp / p.config.bladeDurability) * 100).toFixed(1)}%`
    this.bladePairs.textContent = `×${p.blades}`
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

    this.focusFill.style.width = `${game.focus.toFixed(1)}%`

    if (game.mode.id === 'race') {
      // racers think in meters per second; the station prompt is meaningless (R restarts)
      this.speedo.textContent = `${Math.round(frame.speed)} m/s`
      this.prompt.textContent = ''
    } else {
      const kmh = Math.round(frame.speed * 3.6)
      this.speedo.innerHTML =
        frame.speed >= p.config.killSpeed ? `<span class="fast">${kmh} km/h</span>` : `${kmh} km/h`
      this.prompt.textContent =
        frame.nearStation && game.phase === 'playing' ? 'R — RESUPPLY' : ''
    }
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

  slashFlash(): void {
    this.flash.classList.remove('go')
    void this.flash.offsetWidth
    this.flash.classList.add('go')
  }

  showHit(): void {
    this.vignette.style.opacity = '1'
    window.setTimeout(() => (this.vignette.style.opacity = '0'), 220)
  }

  showStart(resume = false): void {
    this.start.classList.remove('hidden')
    this.start.classList.toggle('paused', resume) // pause menu lays the buttons out as a two-column grid
    this.start.querySelector('h1')!.textContent = resume ? 'Paused' : 'Wings of Freedom'
    el<HTMLButtonElement>('start-btn').textContent = resume ? 'Resume' : 'Deploy Your Soldier'
    el<HTMLButtonElement>('restart-btn').classList.toggle('hidden', !resume) // mid-run only
  }

  hideStart(): void {
    this.start.classList.add('hidden')
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

  showLeaderboard(data: Leaderboard | null, state: 'loading' | 'ready' | 'error' = 'ready'): void {
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
    teams.innerHTML =
      data.teams.length === 0
        ? '<div class="lb-empty">No squads on record yet. Be the first.</div>'
        : data.teams
            .map(
              (t) =>
                `<div class="lb-row"><span><b>${t.wavesCleared} waves</b> · ${t.players
                  .map((p) => p.username)
                  .join(', ')}</span><span class="lb-sub">${Math.round(t.durationS / 60)} min</span></div>`,
            )
            .join('')
    soldiers.innerHTML =
      data.soldiers.length === 0
        ? '<div class="lb-empty">No soldiers on record yet.</div>'
        : data.soldiers
            .map(
              (s) =>
                `<div class="lb-row"><span><b>${s.score}</b> · ${s.username}</span>` +
                `<span class="lb-sub">${s.kills} kills · wave ${s.wavesCleared}</span></div>`,
            )
            .join('')
  }

  hideLeaderboard(): void {
    this.leaderboardPanel.classList.add('hidden')
  }

  get leaderboardOpen(): boolean {
    return !this.leaderboardPanel.classList.contains('hidden')
  }

  showDeath(game: GameState): void {
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
    this.death.classList.remove('hidden')
  }

  hideDeath(): void {
    this.death.classList.add('hidden')
  }
}

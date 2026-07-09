import type { GameState } from './sim/game'
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

  constructor(seed: string) {
    el('seed-line').textContent = `seed: ${seed} — share the URL with ?seed=${encodeURIComponent(seed)} to race the same city`
    el('death-seed').textContent = `seed: ${seed}`
    el<HTMLButtonElement>('start-btn').addEventListener('click', () => this.onStart())
    el<HTMLButtonElement>('restart-btn').addEventListener('click', () => this.onRestart())
    el<HTMLButtonElement>('retry-btn').addEventListener('click', () => this.onRetry())
    el<HTMLButtonElement>('settings-btn').addEventListener('click', () => this.onOpenSettings())
    el<HTMLButtonElement>('settings-back').addEventListener('click', () => this.onCloseSettings())
    el<HTMLButtonElement>('modes-btn').addEventListener('click', () => this.onOpenModes())
    el<HTMLButtonElement>('modes-back').addEventListener('click', () => this.onCloseModes())
    for (const id of SLIDER_IDS) {
      el<HTMLInputElement>(id).addEventListener('input', () => {
        this.refreshSettingsDisplay()
        this.onSettingsChange(this.readSettings())
      })
    }
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
    this.meters.classList.toggle('low', (gasRatio < 0.2 && p.canisters === 0) || p.blades <= 1)

    this.focusFill.style.width = `${game.focus.toFixed(1)}%`

    const kmh = Math.round(frame.speed * 3.6)
    this.speedo.innerHTML =
      frame.speed >= p.config.killSpeed ? `<span class="fast">${kmh} km/h</span>` : `${kmh} km/h`

    this.prompt.textContent =
      frame.nearStation && game.phase === 'playing' ? 'R — RESUPPLY' : ''
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

  showDeath(game: GameState): void {
    this.deathStats.innerHTML = [
      `SCORE <b>${game.score.score}</b>`,
      `WAVE <b>${game.wave}</b> · KILLS <b>${game.score.kills}</b> · BEST CHAIN <b>${game.score.bestChain}</b>`,
      `ALL-TIME BEST <b>${game.best.bestScore}</b> · WAVE <b>${game.best.bestWave}</b>`,
    ].join('<br />')
    this.death.classList.remove('hidden')
  }

  hideDeath(): void {
    this.death.classList.add('hidden')
  }
}

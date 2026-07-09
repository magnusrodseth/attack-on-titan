import type { GameState } from './sim/game'
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

export class Hud {
  private crosshair = el('crosshair')
  private hearts = el('hearts')
  private score = el('score')
  private combo = el('combo')
  private best = el('best')
  private gasFill = el('gas-fill')
  private gasCanisters = el('gas-canisters')
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
  private bannerTimer: number | undefined

  onStart: () => void = () => {}
  onRetry: () => void = () => {}
  onPickUpgrade: (id: string) => void = () => {}

  constructor(seed: string) {
    el('seed-line').textContent = `seed: ${seed} — share the URL with ?seed=${encodeURIComponent(seed)} to race the same city`
    el('death-seed').textContent = `seed: ${seed}`
    el<HTMLButtonElement>('start-btn').addEventListener('click', () => this.onStart())
    el<HTMLButtonElement>('retry-btn').addEventListener('click', () => this.onRetry())
  }

  update(game: GameState, frame: HudFrame): void {
    const p = game.player
    this.crosshair.classList.toggle('in-range', frame.hookInRange)
    this.hearts.textContent = '♥ '.repeat(Math.max(0, p.hp)).trim()
    this.score.textContent = String(game.score.score)
    this.combo.textContent =
      game.score.combo > 1 ? `×${(1 + 0.25 * Math.min(game.score.combo, 12)).toFixed(2)} chain (${game.score.combo})` : ''
    this.best.textContent = `BEST ${game.best.bestScore} · WAVE ${game.best.bestWave}`

    const gasRatio = p.gas / p.config.maxGas
    this.gasFill.style.width = `${(gasRatio * 100).toFixed(1)}%`
    this.gasCanisters.textContent = `×${p.canisters}`
    this.bladeFill.style.width = `${((p.bladeHp / p.config.bladeDurability) * 100).toFixed(1)}%`
    this.bladePairs.textContent = `×${p.blades}`
    this.meters.classList.toggle('low', (gasRatio < 0.2 && p.canisters === 0) || p.blades <= 1)

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

  popPoints(points: number, oneCut: boolean): void {
    this.popText(oneCut ? `+${points} ONE CUT` : `+${points}`)
  }

  popText(text: string): void {
    this.popup.textContent = text
    this.popup.classList.remove('pop')
    void this.popup.offsetWidth // restart the CSS animation
    this.popup.classList.add('pop')
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
    el<HTMLButtonElement>('start-btn').textContent = resume ? 'RESUME' : 'DEPLOY'
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

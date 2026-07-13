import type { Arena } from './sim/city'
import type { RemoteSoldier } from './sim/coopClient'
import type { GameState } from './sim/game'
import { isFootballer } from './sim/titan'

const SIZE = 170
const CENTER = SIZE / 2

/**
 * Top-right canvas minimap: static city pre-rendered once, then per-frame titan blips
 * (red normals, orange abnormals, yellow kneeling cripples), co-op teammate arrows,
 * and the player arrow.
 */
export class Minimap {
  private ctx: CanvasRenderingContext2D
  private background: HTMLCanvasElement
  private scale: number

  constructor(arena: Arena) {
    const canvas = document.getElementById('minimap') as HTMLCanvasElement
    this.ctx = canvas.getContext('2d')!
    this.scale = (CENTER - 7) / arena.wallRadius

    this.background = document.createElement('canvas')
    this.background.width = this.background.height = SIZE
    const bg = this.background.getContext('2d')!
    bg.strokeStyle = 'rgba(220, 224, 228, 0.8)'
    bg.lineWidth = 2.5
    bg.beginPath()
    bg.arc(CENTER, CENTER, arena.wallRadius * this.scale, 0, Math.PI * 2)
    bg.stroke()
    if (arena.canal) {
      // the canal reads as a water ribbon clipped to the wall ring
      bg.save()
      bg.beginPath()
      bg.arc(CENTER, CENTER, arena.wallRadius * this.scale, 0, Math.PI * 2)
      bg.clip()
      bg.fillStyle = 'rgba(96, 152, 175, 0.75)'
      bg.fillRect(
        CENTER + (arena.canal.x - arena.canal.halfWidth) * this.scale,
        0,
        arena.canal.halfWidth * 2 * this.scale,
        SIZE,
      )
      bg.restore()
    }
    const landmark = new Set(['tower', 'cathedral', 'gatehouse', 'bastion'])
    const clutter = new Set(['chimney', 'flagpole', 'well', 'stall', 'cart'])
    for (const b of arena.buildings) {
      if (clutter.has(b.kind)) continue // sub-pixel props would only add noise
      bg.fillStyle = landmark.has(b.kind)
        ? 'rgba(235, 235, 240, 0.75)'
        : b.kind === 'deck' || b.kind === 'pier'
          ? 'rgba(200, 205, 212, 0.8)'
          : b.kind === 'warehouse'
            ? 'rgba(170, 150, 125, 0.6)'
            : 'rgba(205, 180, 150, 0.5)'
      bg.fillRect(
        CENTER + (b.x - b.w / 2) * this.scale,
        CENTER + (b.z - b.d / 2) * this.scale,
        Math.max(1.2, b.w * this.scale),
        Math.max(1.2, b.d * this.scale),
      )
    }
    bg.strokeStyle = 'rgba(63, 191, 114, 0.95)'
    bg.lineWidth = 1.8
    for (const station of arena.stations) {
      bg.beginPath()
      bg.arc(
        CENTER + station.x * this.scale,
        CENTER + station.z * this.scale,
        10 * this.scale + 3,
        0,
        Math.PI * 2,
      )
      bg.stroke()
    }
  }

  update(game: GameState, yaw: number, teammates?: Iterable<RemoteSoldier>): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(this.background, 0, 0)

    // spear caches: amber diamonds so they read apart from the round titan blips
    for (const pickup of game.pickups) {
      if (pickup.taken) continue
      ctx.save()
      ctx.translate(CENTER + pickup.x * this.scale, CENTER + pickup.z * this.scale)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = '#ffb347'
      ctx.fillRect(-2.4, -2.4, 4.8, 4.8)
      ctx.restore()
    }

    // Signal Run: the lit gate pulses green, the finish burns red, the next line dims yellow
    const race = game.race
    if (race && game.phase === 'playing') {
      const gates = race.course.gates
      const active = gates[race.nextGate]
      const finish = gates[gates.length - 1]!
      const pulse = 1 + 0.35 * Math.sin(performance.now() * 0.006)
      if (active !== finish) {
        ctx.strokeStyle = '#e8402f'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(CENTER + finish.x * this.scale, CENTER + finish.z * this.scale, 3.4, 0, Math.PI * 2)
        ctx.stroke()
      }
      const after = gates[race.nextGate + 1]
      if (after && after !== finish) {
        ctx.fillStyle = 'rgba(232, 197, 69, 0.75)'
        ctx.beginPath()
        ctx.arc(CENTER + after.x * this.scale, CENTER + after.z * this.scale, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      if (active) {
        ctx.fillStyle = active === finish ? '#e8402f' : '#37e06b'
        ctx.beginPath()
        ctx.arc(CENTER + active.x * this.scale, CENTER + active.z * this.scale, 2.6 * pulse, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const t of game.titans) {
      if (t.hp <= 0) continue
      const x = CENTER + t.pos.x * this.scale
      const y = CENTER + t.pos.z * this.scale
      const radius = 2.4 + t.height * 0.08
      ctx.fillStyle =
        t.state === 'crippled'
          ? '#ffd257'
          : t.kind === 'shifter'
            ? '#f5c542' // the Shifter reads as the milestone: gold, ringed below
            : isFootballer(t.kind)
              ? '#ffffff' // the matchday duo reads as stars on the map
              : t.kind === 'abnormal'
                ? '#ff7a3c'
                : '#e0352b'
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      if (t.state === 'crippled' || t.kind === 'shifter') {
        ctx.strokeStyle = t.kind === 'shifter' ? '#f5c542' : '#ffd257'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // co-op teammates: smaller cyan arrows so friends read apart from every enemy blip;
    // a dead soldier hollows out and dims (matching the squad panel) until respawn
    if (teammates) {
      for (const mate of teammates) {
        if (!mate.connected) continue
        ctx.save()
        ctx.translate(CENTER + mate.pos.x * this.scale, CENTER + mate.pos.z * this.scale)
        ctx.rotate(-mate.yaw)
        ctx.beginPath()
        ctx.moveTo(0, -4.6)
        ctx.lineTo(3.3, 3.8)
        ctx.lineTo(-3.3, 3.8)
        ctx.closePath()
        if (mate.alive) {
          ctx.fillStyle = '#5ec8ff'
          ctx.fill()
        } else {
          ctx.globalAlpha = 0.45
          ctx.strokeStyle = '#5ec8ff'
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
        ctx.restore()
      }
    }

    // player arrow rotated to the camera heading (camera forward is -z at yaw 0 → up)
    ctx.save()
    ctx.translate(CENTER + game.player.pos.x * this.scale, CENTER + game.player.pos.z * this.scale)
    ctx.rotate(-yaw)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(0, -6)
    ctx.lineTo(4.2, 5)
    ctx.lineTo(-4.2, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

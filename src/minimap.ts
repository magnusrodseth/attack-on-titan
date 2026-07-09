import type { Arena } from './sim/city'
import type { GameState } from './sim/game'

const SIZE = 170
const CENTER = SIZE / 2

/**
 * Top-right canvas minimap: static city pre-rendered once, then per-frame titan blips
 * (red normals, orange abnormals, yellow kneeling cripples) and the player arrow.
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
    for (const b of arena.buildings) {
      bg.fillStyle = b.kind === 'tower' ? 'rgba(235, 235, 240, 0.75)' : 'rgba(205, 180, 150, 0.5)'
      bg.fillRect(
        CENTER + (b.x - b.w / 2) * this.scale,
        CENTER + (b.z - b.d / 2) * this.scale,
        Math.max(1.2, b.w * this.scale),
        Math.max(1.2, b.d * this.scale),
      )
    }
    bg.strokeStyle = 'rgba(63, 191, 114, 0.95)'
    bg.lineWidth = 1.8
    bg.beginPath()
    bg.arc(
      CENTER + arena.station.x * this.scale,
      CENTER + arena.station.z * this.scale,
      10 * this.scale + 3,
      0,
      Math.PI * 2,
    )
    bg.stroke()
  }

  update(game: GameState, yaw: number): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(this.background, 0, 0)

    for (const t of game.titans) {
      if (t.hp <= 0) continue
      const x = CENTER + t.pos.x * this.scale
      const y = CENTER + t.pos.z * this.scale
      const radius = 2.4 + t.height * 0.08
      ctx.fillStyle =
        t.state === 'crippled' ? '#ffd257' : t.kind === 'abnormal' ? '#ff7a3c' : '#e0352b'
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      if (t.state === 'crippled') {
        ctx.strokeStyle = '#ffd257'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2)
        ctx.stroke()
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

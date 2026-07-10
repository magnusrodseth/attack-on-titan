import type { WebGLRenderer } from 'three'

/**
 * A lightweight, opt-in performance overlay for diagnosing frame-budget problems.
 * Off by default (toggle with F3, or __aot.gfx.perf(true)); when hidden it costs nothing.
 *
 * It reports the two numbers that separate the usual suspects:
 *  - avg frame ms + FPS         → sustained cost (GPU fill-rate / shadow pass = it's high all the time)
 *  - worst frame ms over 1 s    → spikes (GC hitches from per-repath nav allocations = avg fine, worst ugly)
 *  - draw calls + triangles     → how much geometry the shadow pass + main pass push
 */
export class PerfHud {
  private readonly el: HTMLDivElement
  private visible = false
  private frames = 0
  private accMs = 0
  private worstMs = 0
  private windowMs = 0
  // rolling stats since the last stats() call — always on (a few adds per frame),
  // so headless automation can read frame health without showing the overlay
  private statFrames = 0
  private statAccMs = 0
  private statWorstMs = 0

  constructor() {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'z-index:9999',
      'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#9effa1',
      'background:rgba(0,0,0,0.62)',
      'padding:6px 9px',
      'border-radius:6px',
      'white-space:pre',
      'pointer-events:none',
      'display:none',
    ].join(';')
    document.body.appendChild(el)
    this.el = el
  }

  toggle(on?: boolean): boolean {
    this.visible = on ?? !this.visible
    this.el.style.display = this.visible ? 'block' : 'none'
    if (!this.visible) this.reset()
    return this.visible
  }

  private reset(): void {
    this.frames = 0
    this.accMs = 0
    this.worstMs = 0
    this.windowMs = 0
  }

  /** Frame stats accumulated since the previous stats() call, then reset. */
  stats(): { frames: number; avgMs: number; worstMs: number } {
    const out = {
      frames: this.statFrames,
      avgMs: this.statFrames > 0 ? this.statAccMs / this.statFrames : 0,
      worstMs: this.statWorstMs,
    }
    this.statFrames = 0
    this.statAccMs = 0
    this.statWorstMs = 0
    return out
  }

  /** Call once per rendered frame with the frame's dt (seconds) and the renderer. */
  sample(dt: number, renderer: WebGLRenderer): void {
    const frameMs = dt * 1000
    this.statFrames++
    this.statAccMs += frameMs
    if (frameMs > this.statWorstMs) this.statWorstMs = frameMs
    if (!this.visible) return
    const ms = frameMs
    this.frames++
    this.accMs += ms
    this.windowMs += ms
    if (ms > this.worstMs) this.worstMs = ms
    if (this.windowMs < 500) return
    const avg = this.accMs / this.frames
    const info = renderer.info.render
    this.el.textContent =
      `${avg.toFixed(1)} ms  ${(1000 / avg).toFixed(0)} fps\n` +
      `worst ${this.worstMs.toFixed(1)} ms\n` +
      `calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
      `dpr ${renderer.getPixelRatio().toFixed(2)}  shadows ${renderer.shadowMap.enabled ? 'on' : 'off'}`
    this.reset()
  }
}

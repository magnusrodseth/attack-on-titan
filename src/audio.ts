/**
 * Audio: CC0 samples (public/sounds, see README credits) for voiced sounds — titan roars,
 * blade whooshes, the nape slice — plus procedural WebAudio synthesis for everything that
 * must track the sim continuously (wind vs speed, gas hiss) or is a plain transient
 * (thuds, snaps, chimes). Everything hangs off one AudioContext created on first user
 * gesture, so autoplay policies are satisfied.
 */

const SAMPLE_NAMES = [
  'slash-1',
  'slash-2',
  'slash-3',
  'roar-1',
  'roar-2',
  'roar-3',
  'roar-4',
  'roar-5',
  'roar-6',
  'grunt-1',
  'grunt-2',
  'flinch-1',
  'flinch-2',
  'slice',
  'death-groan',
  'player-death',
] as const

export type SampleName = (typeof SAMPLE_NAMES)[number]

export const ROARS: SampleName[] = ['roar-1', 'roar-2', 'roar-3', 'roar-4', 'roar-5', 'roar-6']
export const SLASHES: SampleName[] = ['slash-1', 'slash-2', 'slash-3']
export const GRUNTS: SampleName[] = ['grunt-1', 'grunt-2']
export const FLINCHES: SampleName[] = ['flinch-1', 'flinch-2']

interface PlayOpts {
  volume?: number
  rate?: number
  jitter?: number
}

const MASTER_VOLUME = 0.8

export class AudioSystem {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private duckedState = false
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null
  private gasGain: GainNode | null = null
  private muffle: BiquadFilterNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private musicTracks: HTMLAudioElement[] = []
  private musicIndex = 0

  /** Idempotent; must be called from a user gesture (DEPLOY / retry / upgrade click). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.duckedState ? 0 : MASTER_VOLUME
    this.muffle = ctx.createBiquadFilter()
    this.muffle.type = 'lowpass'
    this.muffle.frequency.value = 20000
    this.master.connect(this.muffle).connect(ctx.destination)

    const noise = this.noiseBuffer(ctx)

    // wind loop: band-passed noise whose gain and brightness track player speed
    const windSrc = ctx.createBufferSource()
    windSrc.buffer = noise
    windSrc.loop = true
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 400
    this.windFilter.Q.value = 0.6
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master)
    windSrc.start()

    // gas loop: bright hiss while thrusting
    const gasSrc = ctx.createBufferSource()
    gasSrc.buffer = noise
    gasSrc.loop = true
    const gasFilter = ctx.createBiquadFilter()
    gasFilter.type = 'highpass'
    gasFilter.frequency.value = 2800
    this.gasGain = ctx.createGain()
    this.gasGain.gain.value = 0
    gasSrc.connect(gasFilter).connect(this.gasGain).connect(this.master)
    gasSrc.start()

    // background music: two tracks alternating forever, routed through the master
    // chain so menu ducking and focus muffle apply to it too
    const musicGain = ctx.createGain()
    musicGain.gain.value = 0.32
    musicGain.connect(this.master)
    this.musicTracks = ['/music/track-1.mp3', '/music/track-2.mp3'].map((url) => {
      const element = new Audio(url)
      element.preload = 'auto'
      ctx.createMediaElementSource(element).connect(musicGain)
      element.addEventListener('ended', () => this.playNextTrack())
      return element
    })
    void this.musicTracks[0]?.play().catch(() => {})

    for (const name of SAMPLE_NAMES) {
      void fetch(`/sounds/${name}.ogg`)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => this.buffers.set(name, buffer))
        .catch(() => {
          // missing sample just stays silent; synth sounds still work
        })
    }
  }

  private playNextTrack(): void {
    this.musicIndex = (this.musicIndex + 1) % this.musicTracks.length
    void this.musicTracks[this.musicIndex]?.play().catch(() => {})
  }

  get loadedCount(): number {
    return this.buffers.size
  }

  get state(): string {
    return this.ctx?.state ?? 'uninitialized'
  }

  get ducked(): boolean {
    return this.duckedState
  }

  /** Silences the whole soundscape (including tails) while a menu covers the game. */
  setDucked(ducked: boolean): void {
    if (ducked === this.duckedState) return
    this.duckedState = ducked
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(ducked ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.05)
  }

  play(names: SampleName | SampleName[], opts: PlayOpts = {}): void {
    if (!this.ctx || !this.master) return
    const name = Array.isArray(names) ? names[Math.floor(Math.random() * names.length)]! : names
    const buffer = this.buffers.get(name)
    if (!buffer) return
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const jitter = opts.jitter ?? 0.06
    source.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter)
    const gain = this.ctx.createGain()
    gain.gain.value = opts.volume ?? 1
    source.connect(gain).connect(this.master)
    source.start()
  }

  /** Distance-attenuated one-shot for world-positioned sources (titans). */
  playAt(names: SampleName | SampleName[], distance: number, opts: PlayOpts = {}): void {
    const falloff = 1 / (1 + distance / 35)
    this.play(names, { ...opts, volume: (opts.volume ?? 1) * falloff })
  }

  setWind(speed: number): void {
    if (!this.ctx || !this.windGain || !this.windFilter) return
    const target = Math.min(0.4, Math.max(0, (speed - 8) / 34) * 0.5)
    this.windGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1)
    this.windFilter.frequency.setTargetAtTime(300 + speed * 28, this.ctx.currentTime, 0.15)
  }

  setGas(active: boolean): void {
    if (!this.ctx || !this.gasGain) return
    this.gasGain.gain.setTargetAtTime(active ? 0.1 : 0, this.ctx.currentTime, 0.05)
  }

  /** Meaty low-end impact; volume ~0.3 body tap, ~0.9 taking a swat. */
  thud(volume: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(95, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.16)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.connect(gain).connect(this.master)
    osc.start()
    osc.stop(ctx.currentTime + 0.22)
    this.noiseBurst(600, 0.06, volume * 0.5, 'lowpass')
  }

  /** Metallic tick for hook fire. */
  click(): void {
    this.noiseBurst(5200, 0.03, 0.35, 'highpass')
  }

  /** Blade pair shattering. */
  snap(): void {
    this.noiseBurst(3200, 0.07, 0.6, 'highpass')
    this.noiseBurst(900, 0.05, 0.4, 'bandpass')
  }

  /** Short gas dash puff. */
  gasBurst(): void {
    this.noiseBurst(2600, 0.22, 0.35, 'bandpass')
  }

  /** Underwater-y lowpass while focus (bullet time) is active. */
  setMuffled(muffled: boolean): void {
    if (!this.ctx || !this.muffle) return
    this.muffle.frequency.setTargetAtTime(muffled ? 650 : 20000, this.ctx.currentTime, 0.08)
  }

  /** Resupply hiss-clunk. */
  refill(): void {
    this.noiseBurst(3800, 0.25, 0.25, 'bandpass')
    this.thud(0.25)
  }

  /** Wave-clear chime: two soft partials. */
  chime(): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    for (const [freq, delay] of [
      [660, 0],
      [990, 0.12],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.9)
      osc.connect(gain).connect(this.master)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 1)
    }
  }

  /** Player-death sub boom. */
  boom(): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(70, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(26, ctx.currentTime + 0.7)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.9, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85)
    osc.connect(gain).connect(this.master)
    osc.start()
    osc.stop(ctx.currentTime + 0.9)
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  private noiseBurst(
    frequency: number,
    duration: number,
    volume: number,
    type: BiquadFilterType,
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const source = ctx.createBufferSource()
    source.buffer = this.noiseBuffer(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
    source.stop(ctx.currentTime + duration + 0.02)
  }
}

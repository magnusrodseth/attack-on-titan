import type { PerspectiveCamera, Scene } from 'three'
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import type { Hud } from '../hud'
import type { SoldierPool } from '../render/soldiers'
import { getRecruitStyle, setRecruitStyle } from '../render/soldiers'
import type { FigureKind, FootballerFigure } from '../render/strikers'
import { buildFootballer, KIT_DEFAULTS } from '../render/strikers'
import type { BossBodyVisual } from '../render/titans/lib'
import { BOSS_BODY_BUILDERS } from '../render/titans/registry'
import type { BossFight } from '../sim/boss'
import { BOSS_LADDER, createBossFight } from '../sim/boss'
import { EYE_HEIGHT } from '../sim/constants'
import type { RemoteSoldier } from '../sim/coopClient'
import { clockFraction } from '../sim/daynight'
import { LAMP_BATTERY_SECONDS } from '../sim/flashlight'
import type { GameState } from '../sim/game'
import type { TitanKind } from '../sim/titan'
import { createTitan } from '../sim/titan'
import { TitanHitboxes } from './hitboxes'

/**
 * Dev-only playground: a statue gallery in the real city with free ODM flight and
 * nothing that bites. Loaded via dynamic import behind import.meta.env.DEV, so none
 * of this (or the drawer DOM) exists in production builds. Titans here are plain
 * TitanState statues the normal TitanPool renders; soldiers are RemoteSoldier dummies
 * through the normal SoldierPool; the Striker and Captain are the strikers.ts figures
 * with live-editable color slots; the nine Shifters are the ported procedural bodies
 * from src/render/titans/ posed by unstepped BossFights.
 */

export interface DevCtx {
  playground: boolean
  game: GameState
  scene: Scene
  camera: PerspectiveCamera
  hud: Hud
  soldierPool: SoldierPool
  canvas: HTMLCanvasElement
  enterWorld(): void
  setView(yaw: number, pitch: number): void
  /** Render-only clock override (0 = midnight, 0.5 = noon); null returns to the sim clock. */
  setClock(fraction: number | null): void
}

const DRAWER_CSS = `
#dev-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 300px; z-index: 60;
  background: rgba(12, 14, 18, 0.93); border-left: 1px solid #2f3642; color: #cfd6e0;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 14px 16px;
  overflow-y: auto; transition: transform 0.18s ease; box-sizing: border-box; }
#dev-drawer.closed { transform: translateX(105%); }
#dev-drawer h3 { margin: 0 0 2px; font-size: 13px; color: #7ec8ff; letter-spacing: 0.08em; text-transform: uppercase; }
#dev-drawer .dv-hint { color: #7d8794; margin-bottom: 10px; }
#dev-drawer .dv-section { border-top: 1px solid #232a34; padding: 10px 0; }
#dev-drawer .dv-label { color: #93a0b0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.1em; margin-bottom: 6px; }
#dev-drawer .dv-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
#dev-drawer button { background: #1b2129; color: #cfd6e0; border: 1px solid #333d4b; border-radius: 4px;
  padding: 5px 9px; font: inherit; cursor: pointer; }
#dev-drawer button:hover { border-color: #7ec8ff; color: #fff; }
#dev-drawer .dv-check { display: block; margin: 4px 0; cursor: pointer; }
#dev-drawer .dv-slot { display: flex; align-items: center; justify-content: space-between; margin: 3px 0; }
#dev-drawer .dv-slot input[type="color"] { width: 42px; height: 22px; border: 1px solid #333d4b; background: none; padding: 0; cursor: pointer; }
#dev-drawer select { width: 100%; background: #1b2129; color: #cfd6e0; border: 1px solid #333d4b; padding: 4px; font: inherit; margin-bottom: 8px; }
#dev-drawer input[type="range"] { width: 120px; vertical-align: middle; }
#dev-tab { position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 59;
  background: rgba(12, 14, 18, 0.93); color: #7ec8ff; border: 1px solid #2f3642; border-right: none;
  border-radius: 6px 0 0 6px; padding: 10px 7px; font: 12px ui-monospace, Menlo, monospace; cursor: pointer; }
`

export function initDev(ctx: DevCtx): ((dt: number) => void) | null {
  if (!ctx.playground) {
    injectMenuButton()
    return null
  }
  return bootPlayground(ctx)
}

/** Normal dev session: add a Playground entry to the menu's utility row. */
function injectMenuButton(): void {
  const row = document.getElementById('menu-row')
  if (!row || document.getElementById('playground-btn')) return
  const btn = document.createElement('button')
  btn.id = 'playground-btn'
  btn.className = 'solo-only compact'
  btn.textContent = 'Playground · Dev'
  btn.addEventListener('click', () => {
    const params = new URLSearchParams(location.search)
    params.delete('lobby')
    params.set('playground', '1')
    location.search = params.toString()
  })
  row.appendChild(btn)
}

function bootPlayground(ctx: DevCtx): (dt: number) => void {
  const { game, scene, camera, hud, soldierPool } = ctx

  game.phase = 'playing'
  game.titans = []
  hud.hideStart()

  let titanId = 5000 // far above wave ids; no waves spawn here anyway
  let recruitN = 0
  const dummies = new Map<string, RemoteSoldier>()
  const figures: FootballerFigure[] = []
  const bodies: { fight: BossFight; visual: BossBodyVisual; tag: Sprite }[] = []

  /**
   * A floating name plate over a gallery statue, styled like the recruits' RECRUIT
   * label (same font, glow-shadow, slim proportions). Playground-only chrome: this
   * module never ships in production builds.
   */
  function nameTag(text: string, height: number): Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.font = '600 64px Cinzel, Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#e9dcc0'
    ctx.fillText(text.toUpperCase(), 256, 64)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
    sprite.renderOrder = 5
    const w = Math.max(3.4, height * 0.32)
    sprite.scale.set(w, w / 4, 1)
    return sprite
  }
  const styles: Record<FigureKind, Record<string, string>> = {
    striker: { ...KIT_DEFAULTS.striker },
    captain: { ...KIT_DEFAULTS.captain },
  }
  const figureHeights: Record<FigureKind, number> = { striker: 12, captain: 12 }
  let turntable = false

  /** Ground spot `dist` ahead of the camera, and the yaw that looks back at the player. */
  function spotAhead(dist: number): { x: number; z: number; faceBack: number } {
    const dir = camera.getWorldDirection(new Vector3())
    dir.y = 0
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1)
    dir.normalize()
    const x = game.player.pos.x + dir.x * dist
    const z = game.player.pos.z + dir.z * dist
    return { x, z, faceBack: Math.atan2(game.player.pos.x - x, game.player.pos.z - z) }
  }

  function spawnStatue(kind: TitanKind, height: number, x: number, z: number, facing: number): void {
    const titan = createTitan({ id: titanId++, kind, height, x, z })
    titan.facing = facing
    game.titans.push(titan)
  }

  function spawnDummy(x: number, z: number, yaw: number): void {
    recruitN += 1
    const name = recruitN === 1 ? 'recruit' : `recruit-${recruitN}`
    dummies.set(name, {
      id: name,
      pos: new Vector3(x, EYE_HEIGHT, z),
      vel: new Vector3(),
      yaw,
      pitch: 0,
      hooks: [null, null],
      onGround: true,
      alive: true,
      connected: true,
      hp: 5,
      maxHp: 5,
      score: 0,
      kills: 0,
    })
  }

  function spawnFigure(kind: FigureKind, x: number, z: number, facing: number): void {
    const figure = buildFootballer(kind, styles[kind], figureHeights[kind])
    figure.group.position.set(x, 0, z)
    figure.group.rotation.y = facing
    scene.add(figure.group)
    figures.push(figure)
  }

  /** A ported procedural boss body as a standing statue: a real (unstepped) BossFight. */
  function spawnBody(slug: string, x: number, z: number, facing: number): void {
    const spec = BOSS_LADDER.find((s) => s.id === `${slug}-titan`)
    const builder = BOSS_BODY_BUILDERS[`${slug}-titan`]
    if (!spec || !builder) return
    const fight = createBossFight(titanId++, spec, spec.wave, 'playground', x, z)
    fight.titan.facing = facing
    const visual = builder(fight.titan)
    visual.addTo(scene)
    const tag = nameTag(spec.name, spec.height)
    tag.position.set(x, spec.height + Math.max(1.5, spec.height * 0.08), z)
    scene.add(tag)
    bodies.push({ fight, visual, tag })
  }

  function clearAll(): void {
    game.titans = []
    dummies.clear()
    recruitN = 0
    for (const figure of figures) figure.dispose(scene)
    figures.length = 0
    for (const body of bodies) {
      body.visual.removeFrom(scene)
      scene.remove(body.tag)
    }
    bodies.length = 0
  }

  /** One of everything on the plaza, facing the muster point; player teleported to it. */
  function musterLineup(): void {
    clearAll()
    const viewer = { x: 0, z: 12 }
    const face = (x: number, z: number) => Math.atan2(viewer.x - x, viewer.z - z)
    // x=0 stays clear: the station pole stands at the plaza center between viewer and lineup
    spawnStatue('normal', 10.5, -16, -16, face(-16, -16))
    spawnStatue('abnormal', 8.5, -8, -18, face(-8, -18))
    spawnDummy(3, -12, face(3, -12))
    spawnFigure('striker', 9, -18, face(9, -18))
    spawnFigure('captain', 17, -16, face(17, -16))
    spawnBody('beast', -26, -30, face(-26, -30))
    spawnBody('founding', -34, -38, face(-34, -38))
    spawnBody('attack', -14, -34, face(-14, -34))
    spawnBody('cart', -6, -24, face(-6, -24))
    spawnBody('jaw', 6, -24, face(6, -24))
    spawnBody('armored', 14, -34, face(14, -34))
    spawnBody('female', 24, -30, face(24, -30))
    spawnBody('warhammer', 32, -38, face(32, -38))
    spawnBody('colossus', 0, -110, face(0, -110)) // looms behind the lineup
    game.player.pos.set(viewer.x, EYE_HEIGHT + 1, viewer.z)
    game.player.vel.set(0, 0, 0)
    ctx.setView(0, 0.14)
  }

  // --- drawer ----------------------------------------------------------------

  const style = document.createElement('style')
  style.textContent = DRAWER_CSS
  document.head.appendChild(style)

  const drawer = document.createElement('div')
  drawer.id = 'dev-drawer'
  drawer.innerHTML = `
    <h3>Playground · Dev</h3>
    <div class="dv-hint">\` toggles this drawer · click the city to fly · slashes swing, nothing bites</div>
    <div class="dv-section">
      <div class="dv-label">Spawn ahead of you</div>
      <div class="dv-row">
        <button data-spawn="titan">Titan</button>
        <button data-spawn="aberrant">Aberrant</button>
        <button data-spawn="soldier">Soldier</button>
        <button data-spawn="striker">Striker</button>
        <button data-spawn="captain">Captain</button>
      </div>
      <div class="dv-label">The Nine (procedural)</div>
      <div class="dv-row" id="dv-bodies"></div>
      <div class="dv-row">
        <button id="dv-lineup">Muster the Lineup</button>
        <button id="dv-clear">Clear</button>
      </div>
    </div>
    <div class="dv-section">
      <label class="dv-check"><input type="checkbox" id="dv-turntable"> Turntable</label>
      <label class="dv-check"><input type="checkbox" id="dv-hud"> Hide HUD</label>
      <label class="dv-check"><input type="checkbox" id="dv-hitboxes"> Titan hitboxes</label>
      <div class="dv-hint">the sim's true hit volumes — nape red (dims outside your aim cone), ankles amber, body blue, hook anchor green</div>
    </div>
    <div class="dv-section">
      <div class="dv-label">Time of day</div>
      <label class="dv-check"><input type="checkbox" id="dv-clock-on"> Override the sim clock</label>
      <div class="dv-row" style="align-items:center">
        <input type="range" id="dv-clock" min="0" max="1" step="0.005">
        <span id="dv-clock-val"></span>
      </div>
      <div class="dv-hint">The flashlight is automatic: it lights once the sun is down and runs on its battery.</div>
      <div class="dv-row" style="align-items:center">
        <label>Battery <input type="range" id="dv-lamp" min="0" max="${LAMP_BATTERY_SECONDS}" step="1"></label>
        <span id="dv-lamp-val"></span>
      </div>
    </div>
    <div class="dv-section">
      <div class="dv-label">Kit styling</div>
      <select id="dv-kind">
        <option value="striker">Striker · Haaland</option>
        <option value="captain">Captain · Kane</option>
        <option value="recruit">Recruit · Soldier</option>
      </select>
      <div id="dv-slots"></div>
      <div class="dv-row" style="align-items:center">
        <label>Height <input type="range" id="dv-height" min="6" max="16" step="0.5"></label>
        <span id="dv-height-val"></span>
      </div>
      <button id="dv-copy">Copy Style JSON</button>
    </div>
    <div class="dv-section">
      <button id="dv-exit">Exit Playground</button>
    </div>`
  document.body.appendChild(drawer)

  const tab = document.createElement('div')
  tab.id = 'dev-tab'
  tab.textContent = '\`'
  tab.title = 'Open the dev drawer (backquote)'
  document.body.appendChild(tab)

  const q = <T extends HTMLElement>(sel: string): T => drawer.querySelector(sel) as T

  function setDrawerOpen(open: boolean): void {
    drawer.classList.toggle('closed', !open)
    tab.style.display = open ? 'none' : 'block'
    if (open) document.exitPointerLock()
  }
  tab.addEventListener('click', () => setDrawerOpen(true))
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
      e.preventDefault()
      setDrawerOpen(drawer.classList.contains('closed'))
    }
  })
  ctx.canvas.addEventListener('click', () => {
    setDrawerOpen(false)
    ctx.enterWorld()
  })

  for (const btn of drawer.querySelectorAll<HTMLButtonElement>('[data-spawn]')) {
    btn.addEventListener('click', () => {
      const what = btn.dataset.spawn!
      if (what === 'titan' || what === 'aberrant') {
        const { x, z, faceBack } = spotAhead(24)
        spawnStatue(what === 'aberrant' ? 'abnormal' : 'normal', what === 'aberrant' ? 8.5 : 10.5, x, z, faceBack)
      } else if (what === 'soldier') {
        const { x, z, faceBack } = spotAhead(9)
        spawnDummy(x, z, faceBack)
      } else {
        const { x, z, faceBack } = spotAhead(26)
        spawnFigure(what as FigureKind, x, z, faceBack)
      }
    })
  }
  // one button per ported Shifter body, straight from the registry
  const bodiesRow = q<HTMLDivElement>('#dv-bodies')
  for (const id of Object.keys(BOSS_BODY_BUILDERS)) {
    const slug = id.replace(/-titan$/, '')
    const btn = document.createElement('button')
    btn.textContent = slug
    btn.addEventListener('click', () => {
      const { x, z, faceBack } = spotAhead(slug === 'colossus' ? 100 : 34)
      spawnBody(slug, x, z, faceBack)
    })
    bodiesRow.appendChild(btn)
  }
  q<HTMLButtonElement>('#dv-lineup').addEventListener('click', musterLineup)
  q<HTMLButtonElement>('#dv-clear').addEventListener('click', clearAll)
  q<HTMLInputElement>('#dv-turntable').addEventListener('change', (e) => {
    turntable = (e.target as HTMLInputElement).checked
  })
  q<HTMLInputElement>('#dv-hud').addEventListener('change', (e) => {
    const hudRoot = document.getElementById('hud')
    if (hudRoot) hudRoot.style.visibility = (e.target as HTMLInputElement).checked ? 'hidden' : ''
  })
  const hitboxes = new TitanHitboxes(scene)
  const aimScratch = new Vector3()
  q<HTMLInputElement>('#dv-hitboxes').addEventListener('change', (e) => {
    hitboxes.setVisible((e.target as HTMLInputElement).checked)
  })
  q<HTMLButtonElement>('#dv-exit').addEventListener('click', () => {
    const params = new URLSearchParams(location.search)
    params.delete('playground')
    location.search = params.toString()
  })

  // --- time of day + flashlight battery ---------------------------------------

  const clockOn = q<HTMLInputElement>('#dv-clock-on')
  const clockSlider = q<HTMLInputElement>('#dv-clock')
  const clockVal = q<HTMLSpanElement>('#dv-clock-val')
  const lampSlider = q<HTMLInputElement>('#dv-lamp')
  const lampVal = q<HTMLSpanElement>('#dv-lamp-val')

  function clockLabel(fraction: number): string {
    const hours = fraction * 24
    const hh = String(Math.floor(hours)).padStart(2, '0')
    const mm = String(Math.floor((hours % 1) * 60)).padStart(2, '0')
    return `${hh}:${mm}`
  }

  function pushClock(): void {
    ctx.setClock(clockOn.checked ? clockSlider.valueAsNumber : null)
    clockVal.textContent = clockOn.checked ? clockLabel(clockSlider.valueAsNumber) : 'sim'
  }

  // start the slider where the sky currently stands, so ticking the box changes nothing
  clockSlider.value = String(clockFraction(game.seed, game.time))
  clockOn.addEventListener('change', pushClock)
  clockSlider.addEventListener('input', () => {
    clockOn.checked = true // dragging the sun implies taking the wheel
    pushClock()
  })
  pushClock()

  lampSlider.value = String(game.player.lamp)
  lampSlider.addEventListener('input', () => {
    game.player.lamp = lampSlider.valueAsNumber
  })

  // --- kit styling -------------------------------------------------------------

  const kindSelect = q<HTMLSelectElement>('#dv-kind')
  const slotsRoot = q<HTMLDivElement>('#dv-slots')
  const heightInput = q<HTMLInputElement>('#dv-height')
  const heightVal = q<HTMLSpanElement>('#dv-height-val')

  function currentKind(): FigureKind {
    return kindSelect.value as FigureKind
  }

  const isRecruit = (): boolean => kindSelect.value === 'recruit'

  function applySlot(kind: FigureKind, slot: string, hex: string): void {
    styles[kind][slot] = hex
    for (const figure of figures) {
      if (figure.kind === kind) figure.setColor(slot, hex)
    }
  }

  function renderStyleRows(): void {
    slotsRoot.innerHTML = ''
    if (isRecruit()) {
      // one shared tint layered over the KayKit atlas; height is metres, not statue units
      const row = document.createElement('div')
      row.className = 'dv-slot'
      const label = document.createElement('span')
      label.textContent = 'tint'
      const input = document.createElement('input')
      input.type = 'color'
      input.value = getRecruitStyle().tint ?? '#ffffff'
      input.addEventListener('input', () => setRecruitStyle({ tint: input.value }))
      row.append(label, input)
      slotsRoot.appendChild(row)
      heightInput.min = '1.5'
      heightInput.max = '6'
      heightInput.step = '0.1'
      const { height } = getRecruitStyle()
      heightInput.value = String(height)
      heightVal.textContent = `${height}m`
      return
    }
    heightInput.min = '6'
    heightInput.max = '16'
    heightInput.step = '0.5'
    const kind = currentKind()
    for (const [slot, hex] of Object.entries(styles[kind])) {
      const row = document.createElement('div')
      row.className = 'dv-slot'
      const label = document.createElement('span')
      label.textContent = slot
      const input = document.createElement('input')
      input.type = 'color'
      input.value = hex
      input.addEventListener('input', () => applySlot(kind, slot, input.value))
      row.append(label, input)
      slotsRoot.appendChild(row)
    }
    heightInput.value = String(figureHeights[kind])
    heightVal.textContent = `${figureHeights[kind]}`
  }

  kindSelect.addEventListener('change', renderStyleRows)
  heightInput.addEventListener('input', () => {
    if (isRecruit()) {
      setRecruitStyle({ height: heightInput.valueAsNumber })
      heightVal.textContent = `${heightInput.value}m`
      return
    }
    const kind = currentKind()
    figureHeights[kind] = heightInput.valueAsNumber
    heightVal.textContent = heightInput.value
    for (const figure of figures) {
      if (figure.kind === kind) figure.setHeight(figureHeights[kind])
    }
  })
  q<HTMLButtonElement>('#dv-copy').addEventListener('click', () => {
    if (isRecruit()) {
      const json = JSON.stringify({ kind: 'recruit', ...getRecruitStyle() }, null, 2)
      void navigator.clipboard
        .writeText(json)
        .finally(() => hud.toast('recruit style copied to clipboard'))
      return
    }
    const kind = currentKind()
    const json = JSON.stringify({ kind, height: figureHeights[kind], colors: styles[kind] }, null, 2)
    void navigator.clipboard
      .writeText(json)
      .catch(() => {
        const scratch = document.createElement('textarea')
        scratch.value = json
        document.body.appendChild(scratch)
        scratch.select()
        document.execCommand('copy')
        scratch.remove()
      })
      .finally(() => hud.toast(`${kind} style copied to clipboard`))
  })

  // --- boot ----------------------------------------------------------------------

  // headless verification hook: drive ported bodies (gait, poses) without the sim
  ;(window as unknown as Record<string, unknown>).__aotPlayground = { bodies, spawnBody, clearAll }

  renderStyleRows()
  musterLineup()
  setDrawerOpen(true)
  hud.showBanner('Playground', 2200)
  hud.toast('Dev playground · \` toggles the drawer, click the city to fly')

  return (dt: number) => {
    soldierPool.sync(dummies, dt)
    // mirror the live battery so drain (and refills at the station) read on the slider
    lampVal.textContent = `${Math.round(game.player.lamp)}s`
    if (document.activeElement !== lampSlider) lampSlider.value = String(game.player.lamp)
    for (const body of bodies) body.visual.sync(body.fight, dt)
    if (turntable) {
      for (const titan of game.titans) titan.facing += dt * 0.4
      for (const figure of figures) figure.group.rotation.y += dt * 0.4
      for (const dummy of dummies.values()) dummy.yaw += dt * 0.4
      for (const body of bodies) body.fight.titan.facing += dt * 0.4
    }
    // after the turntable spin so the nape/ankle volumes track facing without a frame of lag
    hitboxes.sync(
      game.titans,
      game.player.config.slashRange,
      game.player.pos,
      camera.getWorldDirection(aimScratch),
    )
  }
}

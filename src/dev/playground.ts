import type { PerspectiveCamera, Scene } from 'three'
import { Vector3 } from 'three'
import type { Hud } from '../hud'
import type { SoldierPool } from '../render/soldiers'
import type { FigureKind, FootballerFigure } from '../render/strikers'
import { buildFootballer, KIT_DEFAULTS } from '../render/strikers'
import { EYE_HEIGHT } from '../sim/constants'
import type { RemoteSoldier } from '../sim/coopClient'
import type { GameState } from '../sim/game'
import type { TitanKind } from '../sim/titan'
import { createTitan } from '../sim/titan'

/**
 * Dev-only playground: a statue gallery in the real city with free ODM flight and
 * nothing that bites. Loaded via dynamic import behind import.meta.env.DEV, so none
 * of this (or the drawer DOM) exists in production builds. Titans here are plain
 * TitanState statues the normal TitanPool renders; soldiers are RemoteSoldier dummies
 * through the normal SoldierPool; the Striker and Captain are the strikers.ts figures
 * with live-editable color slots.
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

/** Normal dev session: add a Playground entry to the main menu. */
function injectMenuButton(): void {
  const menu = document.querySelector('#start .menu-col')
  const settingsBtn = document.getElementById('settings-btn')
  if (!menu || !settingsBtn || document.getElementById('playground-btn')) return
  const btn = document.createElement('button')
  btn.id = 'playground-btn'
  btn.className = 'solo-only'
  btn.textContent = 'Playground · Dev'
  btn.addEventListener('click', () => {
    const params = new URLSearchParams(location.search)
    params.delete('lobby')
    params.set('playground', '1')
    location.search = params.toString()
  })
  menu.insertBefore(btn, settingsBtn)
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

  function clearAll(): void {
    game.titans = []
    dummies.clear()
    recruitN = 0
    for (const figure of figures) figure.dispose(scene)
    figures.length = 0
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
      <div class="dv-row">
        <button id="dv-lineup">Muster the Lineup</button>
        <button id="dv-clear">Clear</button>
      </div>
    </div>
    <div class="dv-section">
      <label class="dv-check"><input type="checkbox" id="dv-turntable"> Turntable</label>
      <label class="dv-check"><input type="checkbox" id="dv-hud"> Hide HUD</label>
    </div>
    <div class="dv-section">
      <div class="dv-label">Kit styling</div>
      <select id="dv-kind">
        <option value="striker">Striker · Haaland</option>
        <option value="captain">Captain · Kane</option>
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
  q<HTMLButtonElement>('#dv-lineup').addEventListener('click', musterLineup)
  q<HTMLButtonElement>('#dv-clear').addEventListener('click', clearAll)
  q<HTMLInputElement>('#dv-turntable').addEventListener('change', (e) => {
    turntable = (e.target as HTMLInputElement).checked
  })
  q<HTMLInputElement>('#dv-hud').addEventListener('change', (e) => {
    const hudRoot = document.getElementById('hud')
    if (hudRoot) hudRoot.style.visibility = (e.target as HTMLInputElement).checked ? 'hidden' : ''
  })
  q<HTMLButtonElement>('#dv-exit').addEventListener('click', () => {
    const params = new URLSearchParams(location.search)
    params.delete('playground')
    location.search = params.toString()
  })

  // --- kit styling -------------------------------------------------------------

  const kindSelect = q<HTMLSelectElement>('#dv-kind')
  const slotsRoot = q<HTMLDivElement>('#dv-slots')
  const heightInput = q<HTMLInputElement>('#dv-height')
  const heightVal = q<HTMLSpanElement>('#dv-height-val')

  function currentKind(): FigureKind {
    return kindSelect.value as FigureKind
  }

  function applySlot(kind: FigureKind, slot: string, hex: string): void {
    styles[kind][slot] = hex
    for (const figure of figures) {
      if (figure.kind !== kind) continue
      if (slot === 'number') figure.setNumberColor(hex)
      else figure.slots[slot]?.color.set(hex)
    }
  }

  function renderStyleRows(): void {
    const kind = currentKind()
    slotsRoot.innerHTML = ''
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
    const kind = currentKind()
    figureHeights[kind] = heightInput.valueAsNumber
    heightVal.textContent = heightInput.value
    for (const figure of figures) {
      if (figure.kind === kind) figure.setHeight(figureHeights[kind])
    }
  })
  q<HTMLButtonElement>('#dv-copy').addEventListener('click', () => {
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

  renderStyleRows()
  musterLineup()
  setDrawerOpen(true)
  hud.showBanner('Playground', 2200)
  hud.toast('Dev playground · \` toggles the drawer, click the city to fly')

  return (dt: number) => {
    soldierPool.sync(dummies, dt)
    if (turntable) {
      for (const titan of game.titans) titan.facing += dt * 0.4
      for (const figure of figures) figure.group.rotation.y += dt * 0.4
      for (const dummy of dummies.values()) dummy.yaw += dt * 0.4
    }
  }
}

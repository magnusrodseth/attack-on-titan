import type { Scene } from 'three'
import type { TitanState } from '../sim/titan'
import { TitanVisual } from './titans'

/**
 * Keeps scene titan visuals in sync with sim titan states across waves: flesh titans
 * for normals and abnormals (the Shifter body belongs to BossFxView in bosses.ts).
 */
export class TitanPool {
  private visuals = new Map<number, TitanVisual>()

  constructor(private scene: Scene) {}

  sync(titans: TitanState[], dt: number): void {
    const alive = new Set<number>()
    for (const t of titans) {
      if (t.kind === 'shifter') continue // the boss body belongs to BossFxView (bosses.ts)
      alive.add(t.id)
      let visual = this.visuals.get(t.id)
      if (!visual) {
        visual = new TitanVisual(t)
        visual.addTo(this.scene)
        this.visuals.set(t.id, visual)
      }
      visual.syncPose(t, dt)
    }
    for (const [id, visual] of this.visuals) {
      if (!alive.has(id)) {
        visual.removeFrom(this.scene)
        this.visuals.delete(id)
      }
    }
  }
}

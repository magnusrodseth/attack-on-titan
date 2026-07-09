import type { Scene } from 'three'
import type { TitanState } from '../sim/titan'
import { isFootballer } from '../sim/titan'
import { FootballerVisual } from './strikers'
import { TitanVisual } from './titans'

/**
 * Keeps scene titan visuals in sync with sim titan states across waves, choosing the
 * visual per kind: flesh titans for normals and abnormals, kit-and-photo footballers for
 * the matchday duo. Lives outside titans.ts so titans.ts and strikers.ts stay acyclic.
 */
export class TitanPool {
  private visuals = new Map<number, TitanVisual | FootballerVisual>()

  constructor(private scene: Scene) {}

  sync(titans: TitanState[], dt: number): void {
    const alive = new Set<number>()
    for (const t of titans) {
      alive.add(t.id)
      let visual = this.visuals.get(t.id)
      if (!visual) {
        visual = isFootballer(t.kind) ? new FootballerVisual(t) : new TitanVisual(t)
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

---
type: wayfinder:task
status: open
assignee:
blocked-by: [tf-004]
---

# tf-007 · Render: bodies in the streets

## Question

Draw the crowd. The humanoid-pool pattern is proven by `SoldierPool` (`src/render/soldiers.ts`) and
`TitanPool`; copy it rather than inventing a third.

- `CivilianPool`: instanced, capped, recycled, with the walk/flee/held/fallen poses tf-001 and tf-005
  need. Held is the important one: a body lifted at nape height, struggling, legible in silhouette.
- **Texture rule (CLAUDE.md, user mandate)**: every visible surface needs a sourced CC0 texture, no
  invented flat colours. Reuse the already-credited cloth/skin maps if they fit; source new ones via
  a research subagent with verified direct-download URLs and licences if they do not. Per-instance
  `instanceColor` tints over a sourced map are encouraged for crowd variety.
- Minimap: civilians as small white blips; a held civilian reads differently from a walking one (this
  is a gameplay indicator, so a glow is an accepted texture-rule exception).
- Death: a body that falls and stays, or a body that despawns? A street that accumulates the dead is
  the strongest possible statement of a losing run, and also a perf and a taste question. Decide with
  the user in tf-006's feel pass rather than alone.
- Ambient audio: the district has a crowd sound, and losing the crowd removes it. Silence is the fail
  state's voice.

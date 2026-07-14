---
type: wayfinder:task
status: closed
assignee: claude (worktree-townsfolk, 2026-07-14)
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

## Resolution

`src/render/civilians.ts`: `CivilianPool`, four InstancedMeshes for the whole district
(head/torso/legs/arms), so sixty-odd people cost four draw calls. Walk/flee/held/dead poses; the
dead lie where they fell for the rest of the run, so an emptying district is visible from the air as
the bodies it is leaving behind.

**Textures (CC0, sourced and credited, per the texture mandate)**: a real human-skin macro from
Wikimedia Commons for faces and hands, and neutral ambientCG fabrics (wool / canvas / cotton)
tinted per person with `instanceColor` so a crowd looks like a crowd. Deliberately NOT the
`skin.jpg` leather that gives the titans their cursed register — the user asked for people who look
like people, and the scout agent flagged honestly that the skin macro had to be de-gradiented and
cross-dissolved to tile (every pixel photographic, nothing invented).

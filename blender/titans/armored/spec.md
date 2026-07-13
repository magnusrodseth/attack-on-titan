# Armored Titan — model spec (from refs 01, 03, 09, 11, 04)

Target: readable Armored Titan silhouette — segmented cream armor plates over
dark exposed muscle. Plates are DISCRETE (squashed sphere meshes), muscle is
one organic metaball body.

## Parts list
- Head: armored cheek/jaw mask, exposed lipless teeth row, glowing white
  eyes in dark sockets, short pale-blonde cropped hair. No visible neck —
  head sits in a plate collar.
- Torso: two big pectoral plates, layered rib bands under them, 2×3 ab
  plates, oblique side plates; dark muscle visible in every gap.
- Shoulders/arms: huge rounded shoulder caps; plate slabs down outer arm and
  forearm; dark muscle in elbow pit; plated knuckles.
- Legs: iconic red/white stripes — muscle thigh with vertical plate strips
  down the front, plated knee cap, plated shin front, red hamstring/calf
  back fully exposed. Plated foot top, red at ankle.
- Back: shoulder-blade plates, spine column plates, sacrum + glute plates.

## Proportions (fraction of H = 15 m, measured off ref 03)
- Head top ≈ 1.0 H incl hair; head ≈ 0.11 H; sits LOW (chin ≈ 0.88 H).
- Shoulder span ≈ 0.38 H; extremely bulky torso, chest depth ≈ 0.16 H.
- Hip line ≈ 0.53 H; legs long and thick (unlike Beast).
- Arms: fingertips reach ≈ 0.38 H (mid-thigh).
- Feet long, plated, ≈ 0.13 H front extension.

## Materials / colors
- Plate: warm cream/tan (0.65, 0.55, 0.38), roughness 0.55, strong noise
  bump (wood-grain-like slabs in figure refs).
- Muscle: dark maroon (0.30, 0.08, 0.06), roughness 0.6, fiber striation.
- Hair: pale blonde, short crop (particle pass for renders, scalp cap in glb).
- Eyes: white, emissive glow. Teeth: bone white. Mouth recess: near-black red.

## Verifier checklist
1. Silhouette: bulky, wide-shouldered, thick long legs, head sunk low.
2. Plates read SEGMENTED — dark muscle visible in gaps (not one smooth shell).
3. Legs: white plate strips over red muscle; hamstrings/calf backs red.
4. Face: jaw mask + teeth row + glowing white eyes; short blonde hair.
5. Chest: two pec plates + rib bands + ab plate grid.
6. Colors: cream plates vs dark maroon muscle; nothing glossy.

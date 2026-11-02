# HANDOFF

**Last updated:** 2026-11-02, Claude Code. Milestone: experimental venue `exp-derborence` (lighting + polish pass on top of f4bce69).
Full project state lives in `docs/STATUS.md` — read it first.

## State of the project
- Main game live at https://petanque.amunozo.com/. Typecheck clean; `npx vitest run`: 415 passed, 3 skipped (2026-11-02).
- Derborence venue: plumbing fdae5d1, first art pass f4bce69 (owner: "base is solid"), selected only via `?venue=derborence`.
- Lighting/polish pass is **uncommitted** (see below), awaiting the owner's look in-game.

## Done in the last session
- fdae5d1 per-venue art pipeline + renderer; f4bce69 first Derborence art pass.
- (uncommitted) lighting consistency + polish pass, see Work in progress.

## Work in progress (uncommitted, branch exp-derborence)
- Stones (`art/lib/alpine.py`): one tone per stone (was a random palette pick per face), soft corner
  normals bent toward the stone's ellipsoid (`add_stone(soft=)`, `add_boulder(soft=)`), written as
  custom split normals by `stone_object()`. Rock palette a touch darker (`art/lib/palette.py` d_rock*).
- Logs: lower-contrast grain, `to_object_flat(blend=)` softens per-strip colours (no stripe banding).
- Props: shed rebuilt (board-and-batten, posts, framed Z-brace door, thick roof), smaller barrel resting
  in its cradle, exposed roots removed (read as stray blades). Note: props' later random draws shifted
  (low wall / stump details), positions of the listed props unchanged.
- Chalet: log courses with bevels (each course catches light). Court: fewer / lighter needles at the far end.
- Conifer atlas 1024 as `leaves.webp` (was 512 `leaves.png`): cleaner card edges, smaller file.
- Renderer: `Venue.treeShade` (src/render/venues.ts, bakedLight.ts): instanced tree wood / cards take
  the baked ground shade low on the tree (derborence only; village shaders unchanged).
- Screenshots: `python3 shots.py <prefix> [views]` in the session scratchpad (Playwright, camera override
  by patching `PerspectiveCamera.prototype.updateMatrixWorld`).

## Next steps
1. Owner reviews in-game; commit the pass if approved.
2. Art polish still open: backdrop cliffs (faceted, striped), terrain hills, spruce card silhouettes.

## Decisions made
- Derborence is purely visual and URL-only; no UI/i18n until owner decides.
- Visual/taste work goes to Opus subagents, not DeepSeek.
- Stones keep faceted silhouettes but shade as one volume (soft normals) instead of per-face random tones.

## Open questions for the owner
- Is the softer stone/log look right, or should facets read a bit stronger?

## Gotchas
- Derborence models are excluded from the PWA precache (vite.config.ts).
- `--quick` bakes are noisy in the bounce maps (green/gold blotches on rocks and gravel): always finish with a full bake.
- Stone colours use a private RNG per stone (`_burn_face` keeps the shared RNG sequence), so stone placements don't move when colours change.

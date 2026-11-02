# HANDOFF

**Last updated:** 2026-11-02, Claude Code. Milestone: experimental venue `exp-derborence` (polish round 2 on top of 27932ba).
Full project state lives in `docs/STATUS.md` — read it first.

## State of the project
- Main game live at https://petanque.amunozo.com/. Typecheck clean; `npx vitest run`: 415 passed, 3 skipped (2026-11-02).
- Derborence venue: plumbing fdae5d1, art pass f4bce69, lighting/polish 27932ba, selected only via `?venue=derborence`.
- Second polish round (valley-shade light, new mountains, chalet/shed fixes) is **uncommitted**, awaiting the owner.

## Done in the last session
- 27932ba consistent stone lighting (soft normals, one tone per stone), rebuilt shed, conifer atlas 1024 webp.
- (uncommitted) round 2, see Work in progress.

## Work in progress (uncommitted, branch exp-derborence)
- Lighting: `Venue.shade` (src/render/venues.ts, lighting.ts): the clearing lies in the valley's shade.
  The directional light becomes a soft high key (62 deg), baked sun shadows and bounce are off, AO stays.
  No tree-shadow blotches on the court. `treeShade` removed. Village unchanged (opt-in per venue).
- Bake: `Venue.atlas_unlit_vis` (art/lib/venues.py, bake.py; derborence 0.0): turned-away faces were
  stored as "unshadowed" (1.0), and the soft stone normals lit them up as bright wedges.
- Backdrop rewritten (art/assets/derborence/backdrop.py): stratified cliff band with buttresses and gullies,
  grass/snow ledges, slopes with larches, two summits behind (tower + pyramid), aerial perspective. 451 KB.
- Chalet: tilted louvres, muted shutters, grounded bench, calmer foundation; steps on risers + cheek stones;
  pale bank stones. Shed moved to (-6.95, -4.05) clear of the larch, shingle-row roof in weathered grey.
- Screenshots: `python3 shots.py <prefix> [views]` in the session scratchpad (Playwright; camera override).

## Next steps
1. Owner reviews in-game; commit if approved.
2. Possible: spruce card silhouettes; the backdrop's left/right flanks seen from wide angles.

## Decisions made
- Derborence is purely visual and URL-only; no UI/i18n until owner decides.
- Visual/taste work goes to Opus subagents, not DeepSeek.
- Stones keep faceted silhouettes but shade as one volume (soft normals) instead of per-face random tones.
- Derborence court is in valley shade (owner, 2026-11-02): even light for gameplay, sun only on the mountains.

## Open questions for the owner
- Is the softer stone/log look right, or should facets read a bit stronger?

## Gotchas
- Derborence models are excluded from the PWA precache (vite.config.ts).
- `--quick` bakes are noisy in the bounce maps (green/gold blotches on rocks and gravel): always finish with a full bake.
- Stone colours use a private RNG per stone (`_burn_face` keeps the shared RNG sequence), so stone placements don't move when colours change.

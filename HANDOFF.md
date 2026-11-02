# HANDOFF

**Last updated:** 2026-11-02, Claude Code. Milestone: experimental venue `exp-derborence` (art pass).
Full project state lives in `docs/STATUS.md` — read it first.

## State of the project
- Main game live at https://petanque.amunozo.com/. Typecheck clean; `npx vitest run`: 415 passed, 3 skipped (2026-11-02).
- Derborence venue: plumbing committed (fdae5d1), selected only via `?venue=derborence`.
- First art pass exists but is **uncommitted** (see below). Owner tested in-game 2026-11-02: "base is solid", shadows and lighting still off.

## Done in the last session
- fdae5d1 per-venue art pipeline + renderer, `?venue=derborence` placeholder.
- (uncommitted) Opus subagent built court, chalet, spruce, larch, pine, boulders, props, terrain, backdrop.

## Work in progress
- Uncommitted: `art/assets/derborence/*.py`, `art/lib/{alpine,conifer}.py`, edits to `art/lib/{palette,venues,bake,layout_derborence}.py`, `art/build.py`, `src/render/{venues,bakedLayoutDerborence}.ts`, docs/STATUS.md.
- Outputs: `public/models/derborence/` (GLBs + bakes), Blender files `art/blend/derborence/`, previews `art/previews/derborence/`.
- Rebuild: `npm run art -- --venue derborence …` (see art/README.md).

## Next steps
1. Fix shadows/lighting (owner feedback 2026-11-02; get specifics/screenshots first).
2. Art polish: backdrop cliffs (faceted, striped, flat grey sky), terrain (muddy brown hills), court surface.
3. Commit the art pass once the owner approves.

## Decisions made
- Derborence is purely visual and URL-only; no UI/i18n until owner decides.
- Visual/taste work goes to Opus subagents, not DeepSeek.

## Open questions for the owner
- Which shadows/lights look wrong, and where?

## Gotchas
- Derborence models are excluded from the PWA precache (vite.config.ts).

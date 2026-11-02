# HANDOFF

**Last updated:** 2026-11-02, Claude Code. Milestone: experimental venue `exp-derborence` (polish round 2 on top of 27932ba).
Full project state lives in `docs/STATUS.md` — read it first.

## State of the project
- Main game live at https://petanque.amunozo.com/. `npm run typecheck` clean; `npx vitest run`: 432 passed, 3 skipped (2026-11-02).
- Second court "Alps" (venue id `derborence`; player-facing name never "Derborence") is playable on branch `exp-derborence`, NOT pushed/released:
  menu picker Provence | Alps (saved pref, live scene switch behind the menu), "Loading court…" indicator,
  online: room creator picks, joiner gets it, lobby shows "Quick · 7 · Alps". Art ~6.4 MB, downloaded on first pick, then cached (StaleWhileRevalidate).
- `?venue=derborence` still works as a dev override.

## Done in the last session (2026-11-02)
- f4bce69 / 27932ba / 8cb7d83 / 9683fd6: Derborence art passes (consistent stone light, valley-shade flat light, chalet/shed polish, layered mountains, no "1920").
- 60e1874 plumbing (pref, room venue field without protocol bump, runtime caching, i18n); 74e967b runtime `setVenue`; next commit: menu/online UI.

## Work in progress
- None uncommitted after the UI commit.

## Next steps
1. Owner tests the picker on the phone (dev server `npm run dev -- --host`).
2. Release: merge `exp-derborence` → main, bump version, Release checklist in docs/STATUS.md, push (deploys site + server; server change is additive).
3. Optional: tagline "Boules in the village square" on the Alps court; mountains warmer/more contrast; big boulder too pale; mid-distance spruces washed by fog.
4. Optional: one-off +3 textures after switching venues (does not grow; render layer).

## Decisions made
- Court names Provence / Alps; picker on the main menu; online = room creator's court for both (no protocol bump, old clients fall back to Provence).
- Alps art not precached (6.4 MB): downloaded on first pick; compress later if the app grows.
- Matches start immediately while the court loads (fallback court is playable).
- Visual/taste work goes to Opus subagents, not DeepSeek.
- Stones keep faceted silhouettes but shade as one volume (soft normals) instead of per-face random tones.
- Derborence court is in valley shade (owner, 2026-11-02): even light for gameplay, sun only on the mountains.

## Open questions for the owner
- Tagline on the Alps court? Release now?

## Gotchas
- Derborence models are excluded from the PWA precache (vite.config.ts).
- `--quick` bakes are noisy in the bounce maps (green/gold blotches on rocks and gravel): always finish with a full bake.
- Stone colours use a private RNG per stone (`_burn_face` keeps the shared RNG sequence), so stone placements don't move when colours change.

# Pétanque (mobile web game)

**Start here:** read `docs/STATUS.md` (current state, decisions, owner's open
tasks, next steps, and how Claude works here: orchestrator, one subagent per
task) before doing anything. Keep `docs/STATUS.md` updated with every change.

Prototype phase: game feel first, placeholder graphics (Three.js primitives only).
Target: mobile browsers in portrait, touch-only. Later: Google Play (PWA/TWA or
Capacitor) and turn-based online multiplayer — not implemented yet, but the
architecture below must keep them possible.

## Stack
- TypeScript (strict), Vite, Three.js, Vitest. No UI framework.
- `npm run dev` / `npm run build` / `npm run typecheck` / `npm test`.
- Vite `base: './'` — the build must work from any sub-path (versioned deploys).

## Architecture rules (do not break)
```
src/
  engine/        Reusable throwing/physics engine. Pure TS. NO DOM, NO three.js,
                 NO Math.random, NO Date/performance.now. Fixed timestep.
                 Deterministic: same inputs -> same outputs. Game-agnostic
                 (shared by pétanque, bocce, mölkky later).
  games/petanque/ Rules + state for pétanque. Pure TS, no DOM/three.
                 State changes only via serializable actions (reducer style),
                 so turns can later be sent over the network and replayed.
  render/        Three.js view. Reads simulation state, never mutates it.
  input/         Touch gestures -> serializable throw parameters.
  tuning/        Live-tunable config (all game-feel numbers) + in-game panel.
  app/           Wiring, screens, main loop.
  i18n/          Typed string catalogues (en/fr/es/it/pt); all player-facing
                 text goes through t(); missing keys fail typecheck.
  audio/         Procedural WebAudio sounds driven by engine events.
```
- Every game-feel number lives in a tunable config object, never as a magic
  constant inside engine/render code.
- Units: metres, seconds, kilograms. Y is up. Player throws toward -Z.
- Keep files small and focused; prefer plain functions and data over classes
  where reasonable.

## Deploy
- `.github/workflows/deploy.yml` builds on push and publishes to the
  `gh-pages` branch: branch pushes -> site root (latest) AND
  `v/v<package.json version>/` (frozen per phase: bump the version to start a
  new one). Git tags can't be pushed from the cloud dev env.
  Live at https://petanque.amunozo.com/ (custom domain via `public/CNAME`;
  old `www.amunozo.com/petanque/` URLs redirect).
- The build id (commit sha or tag) is shown on screen so testers can confirm
  they have the latest version.

## Git
- Commits are authored by Alberto (`54112057+amunozo@users.noreply.github.com`).
  Never add Claude/AI attribution: no `Co-Authored-By` or `Claude-Session`
  trailers, no "Generated with Claude Code" in PR bodies. Enforced by
  `.claude/settings.json` (attribution off + SessionStart git config) and
  `.githooks/commit-msg`.

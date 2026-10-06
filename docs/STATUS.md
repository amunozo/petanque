# Project status & handoff

Last updated: 2026-10-06. Read this first in a new session, together with
`CLAUDE.md`. Work happens on branch `ccr-5ca53e30-ms79ka` (the repo's only
code branch; `gh-pages` is the deploy output).

## How we work
- The owner (Alberto, Spanish, plays on an Android phone) gives feedback from
  the phone; Claude acts as **orchestrator**: plans, delegates coding to
  subagents (Sonnet for well-specified building, Opus for art/visual direction,
  game feel, AI and tricky design), reviews screenshots/diffs, then commits and
  pushes. Small fixes can be done directly.
- Every push deploys automatically (see CLAUDE.md → Deploy). After pushing,
  give the owner the build id (short sha) to check on the phone.
- Show visual work as screenshots (Playwright + Chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, swiftshader; never run
  `playwright install`; Playwright module at `/opt/node-tools/node_modules/playwright`).
- No AI attribution in commits/PRs (CLAUDE.md → Git).
- If a usage limit interrupts subagents, resume them after the reset; the owner
  asked to restart interrupted work at 3:30 AM Spain time if limits hit at night.
- Owner preferences learned so far: natural/realistic look (not candy, not
  cream), straight camera down the court, small half-transparent white aim dots,
  minimal HUD that never covers the court/jack, vivid-but-natural UI, no text
  for celebrations, no ads at launch and **no promises about ads either way**.

## What exists (v0.5.0, live at https://www.amunozo.com/petanque/)
- Modes: Practice, 1 player vs computer (Easy/Medium/Hard AI in a Web Worker),
  2 players same phone. Match length Quick 7 / Standard 13.
- Rules: FIPJP-style; jack 6–10 m; boards are dead on contact (art. 18);
  scoring, turn order, measuring at end of each end.
- Throws: Roll / Half-lob / Lob / Shoot; slingshot gesture (pull down & release).
  Jack has wooden-ball physics incl. a deterministic chaotic landing kick.
- Engine: pure deterministic TS (`src/engine`), reusable for bocce/mölkky;
  rules as a reducer (`src/games/petanque`), ready for online play.
- Art: Blender (bpy 5.0.1) pipeline in `art/` (see `art/README.md`):
  Provençal village square, town hall (no text/flags), plane trees, café;
  baked lighting (sun visibility + AO + 3-bounce warm indirect) in lightmaps;
  real-time shadows only for balls. `npm run art` rebuilds (~10 min).
- UI: one ⋯ sheet, compact score bar, toasts, How-to-play pages, 5 languages
  (EN/FR/ES/IT/PT, `src/i18n`), procedural audio, haptics, carreau celebration.
- PWA: offline play, update prompt, install entry, privacy page
  (`public/privacy.html`, contact amunozortiz1996@gmail.com), terracotta theme
  `#a95f3a`, `public/.well-known/assetlinks.json` placeholder.
- Developer mode: `?dev=1` (persisted per device) shows the Tuning panel, saved
  tuning and build chips; `?dev=0` turns it off. Players never see tuning.
- Store assets in `store/` (see `store/README.md`): icons, adaptive icon,
  splash, feature graphics per language, captioned screenshots per language.
- Research: `docs/research/competitor-reviews.md` (Bochas 3D/Giraffe, La
  Pétanque/Royer, Paradise Roll, etc.).

## Decisions taken
- Release first on Google Play as a **TWA** (Bubblewrap) wrapping the website;
  local-only game (no online) at launch. Online multiplayer comes after, built
  during the 14-day closed test (plan below).
- App domain for the TWA: **https://petanque.amunozo.com** (custom domain for
  this repo's GitHub Pages). Package id: **`com.amunozo.petanque`** (never
  changes). Brand/logo stays "Pétanque" for now; store titles localized with the
  local sport word (e.g. "Pétanque: Petanca 3D"). The owner may buy
  `petanca.io` later — not yet.
- Monetization: none at launch (no ads); later options are cosmetics, a
  supporter pack, and light opt-in ads with founders exempt — undecided.

## Owner's open tasks (as of 2026-10-06)
1. **DNS at Porkbun**: CNAME `petanque` → `amunozo.github.io` on amunozo.com.
   (Was NOT live yet on 2026-10-06; `petanque.amunozo.com` resolved to Porkbun's
   wildcard parking `uixie.porkbun.com`.)
2. **Google Play developer account** (personal, $25, ID verification).
3. **12+ testers** (Android, Gmail) for the mandatory 14-day closed test; paid
   tester services ($15–35) are an acceptable fallback.
4. Optional: native-speaker check of FR/IT/PT (and ES "mano", "Ordenador").

## Next steps for Claude
1. When DNS resolves to GitHub (185.199.108–111.153): add `public/CNAME` with
   `petanque.amunozo.com`, have the owner (or settings) set the custom domain +
   Enforce HTTPS in repo Settings → Pages, verify the site and
   `/.well-known/assetlinks.json` load at the root, update links in CLAUDE.md /
   README. (Old `www.amunozo.com/petanque/` URLs will redirect.)
2. Build the Android package with Bubblewrap (Java + Android SDK can be
   downloaded in the cloud env): app name/short name, start URL, theme
   `#a95f3a`, icons from `store/`. Generate an **upload keystore** and hand it to
   the owner securely (never commit it); use Play App Signing; put the app
   signing SHA-256 from Play Console into `assetlinks.json`.
3. Walk the owner through Play Console: create app, store listing per language
   (assets in `store/`), privacy policy URL, data safety (no data collected),
   content rating, closed test track with the testers' emails.
4. During the 14-day test: online multiplayer step 1 (friend invites via link,
   guest accounts, Cloudflare Workers + Durable Objects, server re-simulates
   throws with the engine). Then quick match (practice while waiting, AI
   fallback), ratings; then polish. Privacy policy + data safety must be updated
   when online/accounts ship.
5. Nice-to-haves noted: bark texture for plane trees; FR end card wraps to two
   lines at 360 px; 3D render pixel ratio cap 2 (screenshots slightly soft).

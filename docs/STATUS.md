# Project status & handoff

Last updated: 2026-10-06 (identity verified; AAB ready to upload; multiplayer step 1 started). Read this first in a new session, together with
`CLAUDE.md`. Work happens on branch `ccr-5ca53e30-ms79ka` (the repo's only
code branch; `gh-pages` is the deploy output).

## Keep this document current
**Every session must update this file** whenever something changes: a
feature ships, a decision is taken, an owner task is done or added, a next
step is finished or re-planned, or a new owner preference is learned. Update
"Last updated", commit it with the work it describes (or right after), and
push. A new session should be able to continue from this file alone.

## How we work
- The owner (Alberto, Spanish, plays on an Android phone) gives feedback from
  the phone. Claude is the **orchestrator**, not the main coder:
  - **Plan** each piece of work. Present a short phased plan and wait for the
    owner's OK before big phases. Move in small steps.
  - **Delegate** each task to its **own individual subagent**: one focused task
    per subagent, with a self-contained brief (goal, files, constraints from
    CLAUDE.md, acceptance checks: typecheck/tests/screenshots). Independent
    tasks can run in parallel subagents. Use Sonnet for well-specified
    building and Opus for art/visual direction, game feel, AI and tricky
    design. Choose the effort level to fit the task.
  - **Review** what each subagent returns: read the diff, run
    `npm run typecheck`, `npm test` and `npm run build`, and check screenshots
    for visual work. Send it back if it is not right.
  - **Decide** architecture and technology yourself, and keep CLAUDE.md's rules intact.
  - **Commit and push** (explicit paths, never `git add -A` blindly). Then give
    the owner the link, the build id, and a short "what to test" list.
  - Only trivial edits (a constant, a typo, docs) are done directly without a
    subagent.
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

## What exists (v0.5.0, live at https://petanque.amunozo.com/)
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
- Online "play a friend" foundation (no UI yet, server not deployed): wire
  protocol `src/net/protocol.ts`, pure room referee `src/net/room.ts`, browser
  transport `src/net/client.ts`, replay helper `src/net/replay.ts`, invite links
  `src/net/invite.ts`; Cloudflare Worker + Durable Object in `server/` (see
  `server/README.md`), deployed by `.github/workflows/deploy-server.yml` once the
  `CLOUDFLARE_API_TOKEN` secret exists. `npm run typecheck` also checks `server/`.
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
- Owner is moving to Switzerland (Oct 2026). Play identity is verified with the
  Spanish DNI (padrón) address. Any monetization waits until Swiss residency is
  settled: set up the merchant/payments profile then (likely a new profile for
  the new country) and get tax advice. Free app until then.
- Owner prefers to finish identity verification before uploading the AAB
  (nothing is lost: the closed test can't start until verification passes).

## Owner's open tasks (as of 2026-10-06)
1. ~~DNS at Porkbun~~ — done 2026-10-06 (CNAME `petanque` → `amunozo.github.io`).
   Remaining: in repo Settings → Pages, confirm the custom domain shows
   `petanque.amunozo.com` and tick **Enforce HTTPS** once the certificate is issued.
2. ~~Google Play developer account~~ — done 2026-10-06 (personal account,
   developer name "amunozo"). Identity verified (with the DNI address). Personal accounts created after Nov 2023 must run
   the 12-tester / 14-day closed test before production.
3. **12+ testers** (Android, Gmail) for the mandatory 14-day closed test; paid
   tester services ($15–35) are an acceptable fallback.
4. Optional: native-speaker check of FR/IT/PT (and ES "mano", "Ordenador").

## Next steps for Claude
1. ~~Domain switch~~ — done 2026-10-06: site, manifest and
   `/.well-known/assetlinks.json` load over HTTPS at https://petanque.amunozo.com/
   (`public/CNAME`, `public/.nojekyll`). Owner still has to tick Enforce HTTPS
   (plain http was not redirecting yet).
2. ~~Android package~~ — built 2026-10-06 with Bubblewrap; project in `android/`
   (see `android/README.md` to rebuild; bump `appVersionCode` per upload).
   Upload key: alias `upload`, SHA-256
   `35:F8:0B:12:81:66:C2:90:AA:FA:A0:18:7C:11:87:80:43:A8:AB:16:AD:3A:E0:18:88:F7:B2:14:E6:C7:72:FE`
   (already in `assetlinks.json`). The keystore + passwords were handed to the
   owner (never in the repo; owner keeps the backup). **Still to do:** after the
   first AAB upload, add the Play App Signing SHA-256 (Play Console → Test and
   release → App integrity) as a second entry in `assetlinks.json` and deploy —
   until then store installs show a URL bar. How to rebuild in the cloud env (tools are not persistent) is in
   `android/README.md`.
3. Walk the owner through Play Console: create app, store listing per language
   (assets in `store/`), privacy policy URL, data safety (no data collected),
   content rating, closed test track with the testers' emails.
4. **In progress (started 2026-10-06):** online multiplayer step 1 = live 1v1
   "play a friend by link" (room code + link, nickname only, rejoin after drop,
   server referee re-simulates every throw with the default config). Owner OK'd
   live (not async) play. Subagent 1 builds protocol (`src/net/protocol.ts`), pure
   room logic, Cloudflare Worker + Durable Object (`server/`) and the browser
   client (`src/net/client.ts`) — DONE and committed (see `server/README.md`;
   tested locally with `wrangler dev`, not deployed yet). Subagent 2 builds the
   UI (menu entry, lobby/invite, online match mode, banners, i18n). Bump
   `PROTOCOL_VERSION` whenever engine/rules behaviour changes. Before online
   ships publicly: update privacy page + Play data safety (nickname and a random
   device token go to the server). Owner will need a
   free Cloudflare account + API token to deploy.
   Store listing: English name/short/full description options were given to the
   owner (in chat, 2026-10-06); once chosen, translate to FR/ES/IT/PT and put
   them in `store/LISTING.md`.
   Original plan: online multiplayer step 1 (friend invites via link,
   guest accounts, Cloudflare Workers + Durable Objects, server re-simulates
   throws with the engine). Then quick match (practice while waiting, AI
   fallback), ratings; then polish. Privacy policy + data safety must be updated
   when online/accounts ship.
5. Nice-to-haves noted: bark texture for plane trees; FR end card wraps to two
   lines at 360 px; 3D render pixel ratio cap 2 (screenshots slightly soft).

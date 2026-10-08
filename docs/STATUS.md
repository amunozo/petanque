# Project status & handoff

Last updated: 2026-10-08 (exp-feel branch: lob/shoot rebalance for tester feedback, preview only). Read this first in a new session, together with
`CLAUDE.md`. Work happens on branch `ccr-5ca53e30-ms79ka` (the repo's only
code branch; `gh-pages` is the deploy output).

## Keep this document current
**Every session must update this file** whenever something changes: a
feature ships, a decision is taken, an owner task is done or added, a next
step is finished or re-planned, or a new owner preference is learned. Update
"Last updated", commit it with the work it describes (or right after), and
push. A new session should be able to continue from this file alone.

## Release checklist (every update, owner's standing rule)
(Content rating as submitted 2026-10-08 for online-by-invite: users interact
= Yes; block = No; report = No; chat moderation = No; limited to invited
friends = Yes. When quick match with strangers ships: that last answer
becomes No → add a nickname filter + report option first, redo the
questionnaire.)
Before shipping any change that players get (site deploy or new AAB), check
whether it makes a Google Play declaration or the privacy page untrue, and if so
tell the owner exactly what to change in Play Console *before* it goes live:
- **Data safety** (any new data sent anywhere: nicknames, tokens, analytics, crash logs)
- **Content rating** (user interaction/chat/nicknames, gambling-like features, violence)
- **Ads** declaration and **in-app purchases**
- **App access / sign-in details** (accounts, logins, codes)
- **Target audience**, **privacy policy** (`public/privacy.html`, 5 languages)
- Store listing text/screenshots if features changed (never mention ads)
- New AAB only if the Android wrapper changed: bump `appVersionCode`

## How we work
- The owner (Alberto, Spanish, plays on an Android phone) gives feedback from
  the phone. Claude is the **orchestrator**, not the main coder:
  - **Plan** each piece of work. Present a short phased plan and wait for the
    owner's OK before big phases. Move in small steps.
  - **Delegate** each task to its **own individual subagent**: one focused task
    per subagent, with a self-contained brief (goal, files, constraints from
    CLAUDE.md, acceptance checks: typecheck/tests/screenshots). Independent
    tasks can run in parallel subagents. Use **Haiku** only for easy, mechanical, low-risk tasks (text/translation tweaks, renames, small doc or config edits, simple scripted checks); **Sonnet** for well-specified building; **Opus** for art/visual direction, game feel, AI and tricky design. Choose the effort level to fit the task.
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
  **never put the owner's personal email in anything
  public** (store listing, privacy page, in-game text, this repo). Public
  contact for all games: **amunozo.gamedev@proton.me** (Proton free plan),
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
  (`public/privacy.html`, contact amunozo.gamedev@proton.me), terracotta theme
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
- Paid promotion: Google Ads App-campaign offers (e.g. "spend €400, get €400",
  seen 2026-10-08) — ignored for now (closed test can't be promoted). Revisit
  ~1 month after public launch, once quick match is live and Play retention is
  known; target FR/ES.
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
2b. **Play setup** — done 2026-10-07: all App content forms, store listing
   (EN + translations from `store/LISTING.md`), app switched to Free (a leftover
   "Create a merchant account" dashboard item stays; do NOT create one — it
   would publish the owner's legal name/address), advertising ID = No,
   closed testing track "Alpha" (all countries, Google Group testers, release
   0.5.0 (1)). **Submitted 2026-10-07 and APPROVED** — closed testing Active, 0 testers so far. Opt-in: https://play.google.com/apps/testing/com.amunozo.petanque
   On approval: share the Google Group link + opt-in link (Reddit post text in
   chat; r/petanque mods messaged first), 14-day clock starts at 12 testers.
3. **12+ testers** (Android, Gmail) for the mandatory 14-day closed test; paid
   tester services ($15–35) are an acceptable fallback.
4. Optional: native-speaker check of FR/IT/PT (and ES "mano", "Ordenador").

## Experiments (preview without touching the live game)
Push a branch named `exp-<name>` → the deploy workflow publishes it ONLY to
`https://petanque.amunozo.com/exp/exp-<name>/` (root and `v/` untouched; the
root service worker never serves its shell there). Use for game-feel changes
the owner wants to try before testers get them. Current experiment: **`exp-feel`** (2026-10-08) — lob/shoot rebalance from
tester feedback (per-loft noise multipliers, boule landing kick on hard
landings, shoot flies onto the target; PROTOCOL_VERSION 2). Measured: lob
pointing error ~1.5× half-lob; shot hit 80/66/54 % at 6/8/10 m (was 41/32/26);
lob-as-shot 7/6/3 %. Owner approved → MERGED into the main branch and live
2026-10-08. In progress: **`exp-landing`** (started 2026-10-08, worktree
/home/user/petanque-exp-landing): tap/drag the landing spot, pick the loft,
then a quick swipe whose quality sets the error; same ThrowIntent so
engine/rules/AI/online are unchanged; "Controls: Classic / Landing spot"
setting. Preview: https://petanque.amunozo.com/exp/exp-landing/ — built
(0b2d526) and REJECTED by the owner 2026-10-08: "extremely confusing and
counterintuitive… more complicated and less fun". Classic slingshot controls
stay. Branch kept for reference only; do not merge or revive without the
owner asking.
Online play: server DEPLOYED 2026-10-08 at
https://petanque-server.amunozo-gamedev.workers.dev (GitHub secrets
CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID; deploy-server.yml deploys on
push or manual run). The online menu entry is hidden; `?online=1` (persisted
per device, `?online=0` to clear) shows it, and invite links from such a host
carry `online=1`. Plan: owner tests phone+PC (DONE 2026-10-08: "works flawlessly", in
sync, fast) → friends on other networks → then open to testers after the
release checklist: privacy page DONE (22779a8); Play Data safety (Name,
Device or other IDs, App interactions; collected, not shared, optional, app
functionality) and content rating ("users interact" = Yes) are the owner's
to submit. To open for everyone: set repo variable VITE_SERVER_URL (or show
the entry by default) and redeploy.

## In flight (2026-10-08, update when done)
- **Online forfeit rule** — NOT STARTED (first subagent was lost in a session
  restart; restart it from this spec): disconnected player has **60 s**
  (SERVER_CONFIG.reconnectGraceMs) to rejoin; the player who stays sees a
  server-driven countdown; after 60 s the stayer wins by forfeit; explicit
  Leave mid-match = immediate forfeit; both gone = no winner (idle expiry);
  late rejoin sees "You left the match". PROTOCOL_VERSION 2 → 3. No turn
  timer for now. On completion: review, run checks, commit, push (deploys
  site + server), owner tests phone+PC.
- **Play forms** submitted for review 2026-10-08: Data safety (Name, Device
  or other IDs, App interactions; collected, not shared, optional, app
  functionality, encrypted in transit, no accounts) and new content rating
  (see Release checklist note). Owner waits for approval email.
- **Open online play to everyone** after that approval: set repo variable
  `VITE_SERVER_URL=https://petanque-server.amunozo-gamedev.workers.dev` (or
  show the entry by default), redeploy, announce to testers (Reddit + Google
  Group; draft the message).
- **GoatCounter analytics** — DONE on branch `analytics` (0579027, pushed as a
  backup; that branch name does not deploy). Site code `amunozo-petanque`.
  WAITING for the owner to update Play Data safety: App interactions + purpose
  Analytics, now Required; add Location → Approximate location (collected,
  not shared, required, Analytics). Then merge `analytics` into the main
  branch and push (privacy page goes live with it).
- Testers: ~7+ opted in via r/petanque (as of 2026-10-08); need 12 for 14
  days.

## Next Android package (AAB) — not urgent, bundle with the next wrapper change
Play pre-launch "for your next release" notes on 0.5.0 (1), none blocking:
- Edge-to-edge (Android 15+, targetSdk 35+): check the game draws correctly
  under status/nav bars (web side uses `viewport-fit=cover`; verify safe-area
  insets on a real Android 15 phone).
- "Deprecated edge-to-edge APIs": comes from Bubblewrap's
  android-browser-helper (status/nav bar colour calls) → update Bubblewrap /
  androidbrowserhelper when rebuilding.
- Orientation/resizability on large screens: Android 16 ignores portrait locks
  on tablets/foldables for apps targeting SDK 36 unless the app is a game →
  add `android:appCategory="game"` to the <application> in
  android/app/src/main/AndroidManifest.xml, and make sure the web game copes
  with landscape/wide windows anyway.
Bump `appVersionCode` to 2 in android/twa-manifest.json when rebuilding.

## Tester feedback log (closed test, from r/petanque)
- 2026-10-08 (7 testers so far): works well on iPhone in the browser. High lob
  is by far the easiest/most precise way to point, and even to shoot. Real
  shooting is too random to be as effective as in real life. Suggestion:
  choose the landing point first, then the height. Owner agrees on lob/shoot;
  unsure about the control change → experiment on a separate branch/preview
  URL first. NO changes made yet (owner asked to wait).
  Diagnosis notes: execution noise is identical for every loft
  (aimNoiseDeg 0.8, powerNoisePct 1.5) and boules have no landing scatter, so
  a 52° lob lands exactly and stops; shoot is a 20° / 1.35× speed throw that
  lands short of the target and skips, so small errors are amplified.
- 2026-10-08 branch `exp-feel` (preview https://petanque.amunozo.com/exp/exp-feel/
  once pushed; NOT on main): lob/shoot rebalance, measured with
  `src/games/petanque/feelBench.ts` (report:
  `FEEL_REPORT=1 npx vitest run src/games/petanque/feelBench.report.test.ts --silent=false`;
  guards in `feelBench.test.ts`). Bench before: every loft pointed equally
  well (8 m: ~22 cm mean error), shot with the ring on the boule hit only
  41/32/26 % at 6/8/10 m. Changes (all tunable, Throw + Balls panels):
  per-loft execution-error multipliers (`throw.aimNoiseMul*`/`powerNoiseMul*`:
  lob ×1.3 aim / ×1.4 power, shoot ×0.6 / ×0.5), boule landing kick on hard
  landings only (`balls.boule.landingScatter` 20°, speed ±10 %, ramps from
  5.2 to 9 m/s vertical impact: lobs only), shoot 26° with backspin 100 and
  the shoot aim ring drawn `throw.shootRingAhead` 0.1 m past the first ground
  contact (a boule under the ring is struck squarely). After: lob pointing
  error 23/33/48 cm vs half-lob 16/22/29; shot hits 80/66/54 % (carreau
  10/5/4 %); lob onto a boule hits 3–7 %. AI: level error scaled by the same
  per-loft multipliers, candidates planned without the landing kick (no
  "lucky lob" exploits), shoots when pointing holds the point < 50 % of error
  samples (was 25 %). Self-play (20 matches/pairing): hard > medium > easy
  still 20/20, 19/20, 20/20. `PROTOCOL_VERSION` → 2. Owner to try on the
  preview before it goes to main.

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
   owner (never in the repo; owner keeps the backup). Play App Signing key SHA-256
   `2D:D1:99:6F:5D:C9:73:6E:44:A8:5F:56:34:62:4C:0B:1F:B0:2A:89:71:9C:4F:16:07:DA:42:99:97:01:FC:50`
   added to `assetlinks.json` too (2026-10-06), so Play installs run full-screen.
   First AAB (versionCode 1) is uploaded and live on the internal testing track. How to rebuild in the cloud env (tools are not persistent) is in
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
   tested locally with `wrangler dev`, not deployed yet). Online UI — DONE and committed
   2026-10-06 (`src/app/online/*`, shared match logic in `src/app/matchCore.ts`;
   verified with a two-browser e2e against local `wrangler dev`: create/join by
   link, full match, end cards, rejoin after reload, reconnect, leave, rematch;
   local modes regression-checked). Hidden in production until the repo
   variable `VITE_SERVER_URL` is set (dev: `?dev=1&server=http://localhost:8787`).
   NEXT: owner creates a free Cloudflare account + puts `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` in GitHub Actions secrets → deploy server → set
   `VITE_SERVER_URL` → test on phones → run the release checklist (privacy page,
   data safety, content rating) BEFORE players see it. Known nits: dev-mode
   invite links don't carry `?dev=1`; close-up camera can leave other boules at
   the screen edge (same as local). Bump
   `PROTOCOL_VERSION` whenever engine/rules behaviour changes. Before online
   ships publicly: update privacy page + Play data safety (nickname and a random
   device token go to the server) AND redo the Play content rating questionnaire
   ("users can interact": answered No for the offline game; nicknames are shown
   to the opponent online, so likely Yes). Owner will need a
   free Cloudflare account + API token to deploy.
   Store listing: English name/short/full description options + all Play form
   answers are in `store/LISTING.md` (also given to the owner as a zip with the
   AAB, key and graphics). Once the owner picks, translate to FR/ES/IT/PT there.
   Original plan: online multiplayer step 1 (friend invites via link,
   guest accounts, Cloudflare Workers + Durable Objects, server re-simulates
   throws with the engine). Then quick match (practice while waiting, AI
   fallback), ratings; then polish. Privacy policy + data safety must be updated
   when online/accounts ship.
5. Nice-to-haves noted: bark texture for plane trees; FR end card wraps to two
   lines at 360 px; 3D render pixel ratio cap 2 (screenshots slightly soft).

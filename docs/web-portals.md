# Web game portals (CrazyGames, Poki, itch.io)

Notes from 2026-10-28, decision 2026-10-29 (below). Portal mode is live since 2026-10-29.

## Decision (2026-10-29): portals iframe the live site

Uploaded copies drift from the server (it rejects any client whose `protocolVersion`/`configHash` differs), and most
portals have no upload API and review updates. So we only use portals that iframe our own domain:
`https://petanque.amunozo.com/?portal=<name>`. One copy of the game, every deploy updates every portal, no pipeline,
and the server's origin allowlist needs no change (the frame's origin is our domain). Implemented in
`src/app/portal.ts` (+ analytics, install, iPhone hint, service worker, invites; see STATUS.md).

| Portal | Iframes your own domain? | Notes |
|---|---|---|
| CrazyGames | Yes ("we'll consider it a regular submission") | Open; ≤ 20 s to gameplay; no multiplayer hosting. First target. |
| GameDistribution | Yes (zipped `index.html` with an iframe) | SDK mandatory; QA up to 3 weeks; syndicates widely. |
| Kongregate | Yes ("iframe option", HTTPS) | Approved developers only; Kong API expected. |
| itch.io | Via an uploaded HTML that iframes us (or `butler` uploads) | No review, little traffic. |
| Y8 | Only multiplayer games, and not on GitHub Pages hosting | Skip. |
| Poki | No, hosts files; asks web exclusivity (a non-exclusive deal exists) | Later, if ever. |

GoatCounter: `count.js` skips frames unless `allow_frame: true` (now set). Portal page views count as
`/portal/<name>` (unknown framers: `/portal/embed`), next to `/` and `/app`; events stay shared. If a portal's CSP
blocks `gc.zgo.at`, fall back to `POST /api/v0/count` (API token) from the Worker.

Sources (checked 2026-10-29): docs.crazygames.com/faq and /requirements/technical, sdk.poki.com,
gamedistribution.com/developers, docs.y8.com/studio/iframe-game-hosting, docs.kongregate.com, gc.zgo.at/count.js,
goatcounter.com/help/api. Not reachable: Poki guide subpages, Armor Games and Newgrounds developer pages.

The 2026-10-28 notes below assumed uploaded copies; the code-change and update sections are superseded by the above.

## Does portal traffic reach petanque.amunozo.com?

No. Portals host their own copy of the build and players play on the portal's page. The domain gets no page
visits. Only online play reaches us: it goes to the Cloudflare Worker (`petanque-server.amunozo-gamedev.workers.dev`).
Portals are a separate player source for the web game, not a funnel to the site or the Play Store.

## Is it worth it?

Yes, starting with a **CrazyGames basic launch** as a cheap test. Hold Poki until the CrazyGames numbers are good.

For:
- Free players at a scale we can't reach ourselves; no strong pétanque/bocce game on either portal.
- Real retention and playtime numbers, useful for every version of the game.
- More simultaneous players, which helps fill online lobbies (the main matchmaking risk).
- Basic launch needs no SDK; same web build plus the origin allowlist.

Against:
- Audience is young casual players who decide in ~30 seconds; a slow sport may keep them less well.
- The audience belongs to the portal, not to us.
- Full launch means a separate build (SDK, ad breaks, no outside links, portal-specific invites) to keep working.
- Ad revenue share only matters at high playtime.

What decides it is the first minute. Before uploading, check a portal player can:
1. load quickly on desktop with a mouse;
2. start a match against the computer in one click (no room codes, no sign-in);
3. understand aiming and throwing without reading anything;
4. finish a short match quickly (a full game to 13 is long for portal players).

## How to publish

- **CrazyGames** (open to anyone): developer.crazygames.com, upload a zip of `dist/` (`base: './'` in
  `vite.config.ts` already makes it work from a sub-path). Basic launch first; full launch needs the CrazyGames SDK
  (ad breaks, `gameplayStart`/`gameplayStop`, loading events). Ad revenue share.
- **Poki** (curated): apply at developers.poki.com; if accepted, add the Poki SDK. Stricter rules.
- **Extras:** itch.io (no review, little traffic), GameDistribution (syndicates to smaller portals).

## Code changes needed for a portal build

1. **Server origin allowlist.** `server/src/config.ts` only allows `https://petanque.amunozo.com`, and
   `isAllowedOrigin` (`server/src/http.ts`) matches exactly, so creating a room from a portal fails with
   `originNotAllowed`. Find the real origin in devtools after uploading, add it to `ALLOWED_ORIGINS` in
   `server/wrangler.toml`; if the portal uses changing subdomains, add suffix matching.
2. **Invite links** (`src/net/invite.ts`) point to our domain. Portals don't allow links off their site; use the
   SDK's own share/invite mechanism instead.
3. **No promotion of other platforms:** no Play Store buttons or links to the site in portal builds.
4. **Analytics and PWA:** check each portal allows GoatCounter; the service worker is pointless in an iframe.
5. A **`VITE_TARGET` build flag** (e.g. `web`, `crazygames`, `poki`) to switch all of the above.

## Analytics: one count across all versions

`src/app/analytics.ts` already sends the website (`/`) and the Play app (`/app`) to the same GoatCounter site. Add
one path per portal (`/crazygames`, `/poki`) on the same endpoint: the total is the combined count, the path
breakdown shows the source.

- Page views are app loads, not people; `match-finished-*` events are the best sign of real play.
- Test one portal upload to confirm counts arrive (iframe sandbox, ad blockers).
- Update the privacy page (`public/privacy.html`) to mention portal versions.

## Updating all versions

- **Website + Play app:** already updated together. The Play app is a Trusted Web Activity of the site; only shell
  changes (icon, package settings) need a new Play upload. The service worker uses `registerType: 'prompt'`, so
  players get a new version when they tap "Update".
- **Portals:** each holds its own copy and needs a re-upload.

| Portal | Automatable? | How |
|---|---|---|
| Poki | Mostly | Official CLI: `npx @poki/cli init`, then `npx @poki/cli upload --name "$(git rev-parse --short HEAD)"`. Review still requested by hand. First login is in the browser and saves `auth.json`; using it in CI is unverified. |
| CrazyGames | No | No public upload API or CLI found; upload through the dashboard. Confirm with their developer support. Scripting the dashboard with a browser bot is fragile and not recommended. |
| itch.io | Yes | `butler push dist-itch amunozo/petanque:html5` with an API key. |

Plan: on each deploy, CI (`.github/workflows/deploy.yml`) builds the site plus `petanque-crazygames.zip` and
`petanque-poki.zip` from the same commit, uploads to Poki/itch.io where possible, and the CrazyGames zip is uploaded
by hand (~2 minutes).

**Version drift breaks online play.** On joining a room the client sends `protocolVersion` and `configHash`
(`src/net/client.ts`). After a protocol or physics-tuning change, portal copies not yet re-uploaded are rejected by
the server or can't play against web/Play players. Keep the server accepting the previous protocol for a while, and
re-upload to portals the same day as a tuning change.

## Next steps

1. Done 2026-10-29: owner checked it framed on desktop; merged and live.
2. Confirm a `/portal/...` page view reaches GoatCounter from a real frame.
3. CrazyGames basic launch: submit `https://petanque.amunozo.com/?portal=crazygames`.
4. After 2–4 weeks of numbers (`match-finished-*` on `/portal/crazygames`): CrazyGames SDK + full launch (ads,
   portal invites), then GameDistribution; itch.io any time.

## Sources

- [poki/poki-cli (GitHub)](https://github.com/poki/poki-cli)
- [@poki/cli on npm](https://npmjs.com/package/@poki/cli)
- [CrazyGames docs](https://docs.crazygames.com)
- [Playgama: Business FAQs (third-party, on portal upload automation)](https://playgama.com/blog/?p=14418)

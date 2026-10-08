# petanque-server

Cloudflare Worker + one Durable Object per room for online "play a friend"
matches. The server is the referee: it applies the pétanque rules and
simulates every throw with the same engine as the game, always with the
**default** config (`src/tuning/config.ts`), never a player's tuning.

```
server/src/index.ts       HTTP routes (create room, room info, WebSocket upgrade, health)
server/src/roomObject.ts  Durable Object "Room": sockets (Hibernation API), storage, alarm, rate limit
server/src/config.ts      limits and timeouts (message size, rate limit, idle expiry, CORS origins)
../src/net/protocol.ts    wire protocol shared with the browser (+ validation)
../src/net/room.ts        pure room state machine (lobby -> playing -> matchOver), unit-tested
```

The shared game code under `../src` (engine, games/petanque, tuning/config,
net) is bundled by wrangler (esbuild). It must stay free of DOM/three.js:
`npm run typecheck` at the repo root also runs `tsc -p server` with no DOM
lib, so a DOM import anywhere in that graph fails CI.

## Routes

| Method | Path | Result |
| --- | --- | --- |
| POST | `/rooms` body `{"length":"quick"\|"standard"}` (optional) | `201 {"code":"K7M9P"}` |
| GET | `/rooms/:code` | `200 {code, phase, length, players}` or `404` |
| GET | `/rooms/:code/ws` | WebSocket upgrade into the room (protocol: `src/net/protocol.ts`) |
| GET | `/health` | `{ok, protocolVersion, configHash}` |

CORS allows `https://petanque.amunozo.com` and any `http://localhost:*` /
`http://127.0.0.1:*` origin. Add more with the `ALLOWED_ORIGINS` variable
(comma-separated) in `wrangler.toml` or the Cloudflare dashboard.

Rooms expire after 30 min idle in the lobby or after the match, and 2 h idle
during a match (a Durable Object alarm, pushed back on every change).

## Local development

```sh
cd server
npm install
npx wrangler dev --port 8787        # http://localhost:8787, state in server/.wrangler/
```

In another terminal, `npm run dev` at the repo root: dev builds talk to
`http://localhost:8787` by default. End-to-end check with the real client:

```sh
PETANQUE_SERVER_URL=http://127.0.0.1:8787 npx vitest run src/net/server.smoke.test.ts
```

(Behind a proxy, set `NO_PROXY=127.0.0.1,localhost`.)

## Deploy (owner)

1. Create a free Cloudflare account (https://dash.cloudflare.com/sign-up).
   Durable Objects with SQLite storage are included in the Workers Free plan.
2. Pick your `workers.dev` subdomain (Workers & Pages -> overview). The server
   will live at `https://petanque-server.<subdomain>.workers.dev`.
3. Either deploy from a machine:
   ```sh
   cd server && npm install && npx wrangler login && npx wrangler deploy
   ```
   or let GitHub Actions do it (`.github/workflows/deploy-server.yml`):
   - Create an API token (My Profile -> API Tokens -> "Edit Cloudflare
     Workers" template) and add it as the repo secret `CLOUDFLARE_API_TOKEN`.
   - If the token can see more than one account, also add the secret
     `CLOUDFLARE_ACCOUNT_ID` (dashboard -> Workers & Pages -> Account ID).
   - Every push touching `server/**`, `src/net/**`, `src/engine/**`,
     `src/games/**` or `src/tuning/config.ts` typechecks, tests and deploys.
     Without the secret the deploy step is skipped and the job still passes.
4. Point the website at the server: add the repo **variable**
   `VITE_SERVER_URL` = `https://petanque-server.<subdomain>.workers.dev`
   (Settings -> Secrets and variables -> Actions -> Variables). The site
   build (`deploy.yml`) passes it to Vite. Without it the client falls back
   to `PROD_SERVER_URL` in `src/net/client.ts` (the real URL:
   `https://petanque-server.amunozo-gamedev.workers.dev`). Players without
   `VITE_SERVER_URL` see the online entry only after opening the site once with
   `?online=1` (hidden beta switch, remembered per device; `?online=0` turns it off).

## Environment / config

| Name | Where | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `wrangler.toml` `[vars]` | extra CORS / WebSocket origins, comma-separated |
| `CLOUDFLARE_API_TOKEN` | GitHub secret | enables the deploy step |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub secret (optional) | needed when the token sees several accounts |
| `VITE_SERVER_URL` | GitHub variable / `.env.local` | server base URL baked into the site build |

## Versioning

Client and server must referee identically. The client's `hello` carries
`PROTOCOL_VERSION` and `CONFIG_HASH` (a hash of the default physics, balls,
throw and match config); a mismatch is answered with a fatal
`versionMismatch`, and the UI should ask the player to update/reload.
**Bump `PROTOCOL_VERSION` in `src/net/protocol.ts` whenever a message
shape or the engine/rules behaviour changes** (the hash only covers config
numbers). Deploy the server and the site together.

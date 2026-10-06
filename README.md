# Pétanque

Mobile-first web pétanque game (portrait, touch-only). Prototype phase: game feel
first, placeholder graphics built from Three.js primitives. See `CLAUDE.md` for
architecture rules.

Stack: TypeScript (strict), Vite, Three.js, Vitest.

## Run locally

```sh
npm install
npm run dev        # dev server (open on your phone via the LAN URL)
npm run typecheck
npm test
npm run build      # output in dist/
npm run preview    # serve the production build
```

Set `BUILD_ID=...` when building to change the id shown on screen (defaults to `dev`).

## Live versions

- Latest (`main` and `ccr-*` branch pushes): https://petanque.amunozo.com/
- Frozen versions, one per `package.json` version (bump it to freeze a phase):
  https://petanque.amunozo.com/v/v<version>/, e.g. https://petanque.amunozo.com/v/v0.5.0/

The build id (tag, or `<branch>@<short sha>`) is shown in the top-left corner so you
can confirm which version is loaded (developer mode, `?dev=1`). The app is a PWA:
when a new build is deployed it shows an update prompt.

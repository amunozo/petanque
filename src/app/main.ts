/**
 * Practice mode wiring: config store + tuning panel + input -> game state
 * (games/petanque/practice) -> engine stepping (fixed timestep accumulator) ->
 * three.js view + DOM HUD. Config is read live (store.config is mutated in place).
 */
import '../style.css';
import { isSettled, step, type SimEvent, type World } from '../engine';
import {
  beginThrow,
  closestBoule,
  createPractice,
  distancesToJack,
  JACK_ID,
  newEnd,
  previewThrow,
  settleThrow,
  type PracticeState,
} from '../games/petanque';
import { createLoftPicker, createThrowController, type AimPreview, type ThrowIntent } from '../input';
import { createPitchScene } from '../render';
import { createConfigStore, createTuningPanel, defaultConfig, tuningSchema } from '../tuning';
import { createHaptics } from './haptics';
import { createHud, formatDistance, type DistanceRow } from './hud';

/** Longest real-time gap one frame may simulate (after a tab switch etc.). */
const MAX_FRAME_SECONDS = 0.25;
/** Hard cap on physics steps per frame (avoids a spiral of death on slow devices). */
const MAX_STEPS_PER_FRAME = 600;
/** A throw that has not settled after this much simulated time is forced to rest. */
const MAX_THROW_SECONDS = 40;

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const app = byId<HTMLElement>('app');
const canvas = byId<HTMLCanvasElement>('scene');
const hudRoot = byId<HTMLElement>('hud');

const store = createConfigStore(defaultConfig, { schema: tuningSchema });
const cfg = store.config;

const scene = createPitchScene(canvas, () => store.config);
const hud = createHud(hudRoot, __BUILD_ID__);

// First-throw hint: shown until the player's first throw of this page load.
const hint = document.createElement('div');
hint.className = 'throw-hint';
hint.innerHTML = 'Put your finger anywhere,<br><b>pull down</b> and <b>let go</b> to throw<span class="throw-hint-arrow">↓</span>';
app.append(hint);
let hasThrown = false;
const setHint = (visible: boolean): void => {
  hint.hidden = hasThrown || !visible;
};
const haptics = createHaptics(() => cfg.controls.haptics);
const loftPicker = createLoftPicker('half');
app.append(loftPicker.element);

// ---- game session state -----------------------------------------------------
const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const seed = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : Date.now() >>> 0;

let state: PracticeState = createPractice(seed, cfg);
let world: World | null = null;
let accumulator = 0;
let sessionBest: number | null = null;

const lastThrowId = (): string | null => state.throws[state.throws.length - 1]?.id ?? null;

function updateStatus(): void {
  const total = cfg.practice.boulesPerEnd;
  const n = Math.min(total, state.throws.length + (state.phase === 'aiming' ? 1 : 0));
  hud.setStatus(state.phase === 'endOver' ? `End ${state.endNumber} · done` : `End ${state.endNumber} · Boule ${n}/${total}`);
}

function showResult(): void {
  const d = distancesToJack(state);
  const best = closestBoule(state);
  const rows: DistanceRow[] = d.entries.map((e) => ({
    label: `Boule ${e.throwNumber}:`,
    text: e.out ? 'OUT' : e.distance === null ? '-' : formatDistance(e.distance),
    closest: best !== null && best.id === e.id,
    out: e.out,
  }));
  if (d.jackOut) rows.unshift({ label: 'Jack:', text: 'OUT', closest: false, out: true });
  hud.setDistances(rows);

  const jack = state.bodies.find((b) => b.id === JACK_ID);
  const closest = best ? state.bodies.find((b) => b.id === best.id) : undefined;
  scene.setResultLine(jack && closest ? jack.pos : null, jack && closest ? closest.pos : null);

  if (state.phase === 'endOver') {
    if (best && best.distance !== null && (sessionBest === null || best.distance < sessionBest)) sessionBest = best.distance;
    hud.showEndCard({
      best: best && best.distance !== null ? formatDistance(best.distance) : null,
      sessionBest: sessionBest === null ? null : formatDistance(sessionBest),
      ...(d.jackOut ? { note: 'Jack out' } : best ? {} : { note: 'All boules out' }),
    });
  }
}

function resetView(): void {
  hud.setDistances(null);
  hud.setPower(null);
  hud.showEndCard(null);
  app.classList.remove('is-endover');
  scene.setResultLine(null, null);
  scene.setAimPreview(null);
  scene.setCameraMode('aim');
}

function startNewEnd(): void {
  world = null;
  accumulator = 0;
  state = newEnd(state, cfg);
  resetView();
  updateStatus();
  updateInputEnabled();
}

function onThrow(intent: ThrowIntent): void {
  if (state.phase !== 'aiming' || panel.isOpen()) return;
  hasThrown = true;
  setHint(false);
  const r = beginThrow(state, intent, cfg);
  state = r.state;
  world = r.world;
  accumulator = 0;
  hud.setDistances(null);
  hud.setPower(null);
  scene.setAimPreview(null);
  scene.setResultLine(null, null);
  scene.setCameraMode('flight');
  updateStatus();
  updateInputEnabled();
}

function onPreview(p: AimPreview | null): void {
  setHint(!p);
  if (!p || state.phase !== 'aiming') {
    hud.setPower(null);
    scene.setAimPreview(null);
    return;
  }
  scene.setCameraMode('aim');
  hud.setPower(p.power);
  const { params, flight } = previewThrow({ aim: p.aim, power: p.power, loft: loftPicker.get() }, cfg);
  scene.setAimPreview({ origin: params.origin, aim: p.aim, landing: flight.landing, points: flight.points });
}

// ---- input ------------------------------------------------------------------
const panel = createTuningPanel(store, tuningSchema, { onOpenChange: () => updateInputEnabled() });
const controller = createThrowController(canvas, () => store.config, () => loftPicker.get(), {
  onPreview,
  onThrow,
});

function updateInputEnabled(): void {
  controller.setEnabled(state.phase === 'aiming' && !panel.isOpen());
}

// Any touch on the field while aiming brings the camera back behind the circle.
canvas.addEventListener('pointerdown', () => {
  if (state.phase === 'aiming' && !panel.isOpen()) scene.setCameraMode('aim');
});

hud.onNewEnd(startNewEnd);
hud.onNextEnd(startNewEnd);

// ---- fullscreen (hidden where unsupported, e.g. iOS Safari) -----------------------
if (document.fullscreenEnabled && typeof app.requestFullscreen === 'function') {
  hud.fullscreenButton.hidden = false;
  hud.fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void app.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', () => {
    hud.fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen');
    scene.resize();
  });
}

function resize(): void {
  scene.resize();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ---- main loop ----------------------------------------------------------------
function settle(w: World): void {
  state = settleThrow(state, w, cfg);
  world = null;
  accumulator = 0;
  scene.setCameraMode('rest');
  app.classList.toggle('is-endover', state.phase === 'endOver');
  showResult();
  updateStatus();
  updateInputEnabled();
}

function simulate(dtReal: number): void {
  const w = world;
  if (!w || state.phase !== 'inFlight') return;
  accumulator += dtReal * cfg.camera.playbackSpeed;
  const dt = cfg.physics.fixedDt;
  const frameEvents: SimEvent[] = [];
  let steps = 0;
  while (accumulator >= dt && steps < MAX_STEPS_PER_FRAME) {
    for (const e of step(w, cfg.physics)) frameEvents.push(e);
    accumulator -= dt;
    steps++;
    if (isSettled(w) || w.time > MAX_THROW_SECONDS) break;
  }
  if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0; // drop the backlog instead of spiralling
  haptics.handle(frameEvents);
  if (isSettled(w) || w.time > MAX_THROW_SECONDS) settle(w);
}

let lastFrame = performance.now();
function frame(now: number): void {
  const dtReal = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  simulate(dtReal);
  scene.syncBodies(world ? world.bodies : state.bodies, lastThrowId());
  scene.render(dtReal);
  requestAnimationFrame(frame);
}

resize();
updateStatus();
updateInputEnabled();
requestAnimationFrame(frame);

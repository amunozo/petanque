/**
 * Practice mode wiring: config store + tuning panel + input -> game state
 * (games/petanque/practice) -> engine stepping (fixed timestep accumulator) ->
 * three.js view + DOM HUD. Config is read live (store.config is mutated in place).
 */
import '../style.css';
import { isSettled, step, type SimEvent, type ThrowParams, type Vec3, type World } from '../engine';
import {
  beginThrow,
  closestBoule,
  createPractice,
  distancesToJack,
  JACK_ID,
  newEnd,
  predictRestPoint,
  previewThrow,
  settleThrow,
  type PracticeState,
} from '../games/petanque';
import { createLoftPicker, createThrowController, type AimPreview, type ThrowIntent } from '../input';
import { createPitchScene } from '../render';
import { createConfigStore, createTuningPanel, defaultConfig, tuningSchema, type LoftPreset } from '../tuning';
import { createHaptics } from './haptics';
import { createTouchHint } from './touchHint';
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

// "Touch here" cue: full (with text) before the first throw, faint for the next few.
const touchHint = createTouchHint(app);
let throwsDone = 0;
let dragging = false;
function refreshTouchHint(): void {
  touchHint.update(state.phase === 'aiming' && !dragging && !panel.isOpen(), throwsDone);
}
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
  throwsDone++;
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

// Roll-out prediction (lone-boule simulation): cached on rounded (aim, power, loft, tuning) so it
// only reruns when the preview meaningfully changes.
let restKey = '';
let restPoint: Vec3 | null = null;
store.subscribe(() => {
  restKey = ''; // any tuning change invalidates the cache
});
function restFor(p: AimPreview, loft: LoftPreset, params: ThrowParams): Vec3 | null {
  if (cfg.controls.rollHintFrac <= 0) return null;
  const key = `${Math.round(p.aim * 1000)}|${Math.round(p.power * 200)}|${loft}`;
  if (key !== restKey) {
    restKey = key;
    restPoint = predictRestPoint(params, cfg);
  }
  return restPoint;
}

function onPreview(p: AimPreview | null): void {
  if (!p || state.phase !== 'aiming') {
    hud.setPower(null);
    scene.setAimPreview(null);
    return;
  }
  scene.setCameraMode('aim');
  hud.setPower(cfg.controls.showPowerMeter ? p.power : null);
  const loft = loftPicker.get();
  const { params, flight } = previewThrow({ aim: p.aim, power: p.power, loft }, cfg);
  scene.setAimPreview({ origin: params.origin, aim: p.aim, landing: flight.landing, rest: restFor(p, loft, params), points: flight.points });
}

// ---- input ------------------------------------------------------------------
const panel = createTuningPanel(store, tuningSchema, { onOpenChange: () => updateInputEnabled() });
const controller = createThrowController(canvas, () => store.config, () => loftPicker.get(), {
  onPreview,
  onThrow,
});

function updateInputEnabled(): void {
  controller.setEnabled(state.phase === 'aiming' && !panel.isOpen());
  refreshTouchHint();
}

// Any touch on the field while aiming brings the camera back behind the circle.
canvas.addEventListener('pointerdown', () => {
  if (state.phase === 'aiming' && !panel.isOpen()) scene.setCameraMode('aim');
});

// The cue hides while a finger is down (pointer capture keeps up/cancel on the canvas).
const fingers = new Set<number>();
const trackFinger = (e: PointerEvent, isDown: boolean): void => {
  if (isDown) fingers.add(e.pointerId);
  else fingers.delete(e.pointerId);
  dragging = fingers.size > 0;
  refreshTouchHint();
};
canvas.addEventListener('pointerdown', (e) => trackFinger(e, true));
canvas.addEventListener('pointerup', (e) => trackFinger(e, false));
canvas.addEventListener('pointercancel', (e) => trackFinger(e, false));

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

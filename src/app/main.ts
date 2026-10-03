/**
 * App wiring: config store + tuning panel + input + start menu. The menu picks a
 * mode (practice / 2-player match, each in its own file); main owns what they
 * share: the three.js view, the HUD, gesture routing and the frame loop.
 * Config is read live (store.config is mutated in place).
 */
import '../style.css';
import { createLoftPicker, createThrowController, type AimPreview, type ThrowIntent } from '../input';
import { createPitchScene } from '../render';
import { createConfigStore, createTuningPanel, defaultConfig, tuningSchema } from '../tuning';
import type { AppContext, Mode } from './context';
import { createHaptics } from './haptics';
import { createHud } from './hud';
import { createMatchHud } from './matchHud';
import { createMatchMode } from './matchMode';
import { confirmDialog, createMenu } from './menu';
import { createPracticeMode } from './practiceMode';
import { createTouchHint } from './touchHint';

/** Longest real-time gap one frame may simulate (after a tab switch etc.). */
const MAX_FRAME_SECONDS = 0.25;

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
const matchHud = createMatchHud(hudRoot);
const menu = createMenu(app, __BUILD_ID__);
const touchHint = createTouchHint(app);
const haptics = createHaptics(() => cfg.controls.haptics);
const loftPicker = createLoftPicker('half');
app.append(loftPicker.element);

// ---- session / mode plumbing -----------------------------------------------------
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
let seedPending = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : null;

let mode: Mode | null = null;
let throwsDone = 0;
let dragging = false;
let dialogOpen = false;

const ctx: AppContext = {
  app,
  store,
  cfg,
  scene,
  hud,
  matchHud,
  haptics,
  loftPicker,
  refreshInput: () => refreshInput(),
  noteThrow: () => {
    throwsDone++;
  },
  newSeed: () => {
    const s = seedPending ?? Date.now() >>> 0;
    seedPending = null; // `?seed=` applies to the first session only
    return s;
  },
};

const panel = createTuningPanel(store, tuningSchema, { onOpenChange: () => refreshInput() });
const practice = createPracticeMode(ctx);
const match = createMatchMode(ctx, () => goMenu());

/** Can the player start a throw gesture right now? */
const inputOpen = (): boolean => mode !== null && mode.canAim() && !panel.isOpen() && !menu.isOpen() && !dialogOpen;

const controller = createThrowController(canvas, () => store.config, () => loftPicker.get(), {
  onPreview: (p: AimPreview | null) => {
    if (!inputOpen()) {
      mode?.onPreview(null);
      return;
    }
    mode?.onPreview(p);
  },
  onThrow: (intent: ThrowIntent) => {
    if (inputOpen()) mode?.onThrow(intent);
  },
});

function refreshInput(): void {
  const open = inputOpen();
  controller.setEnabled(open);
  // "Touch here" cue: full (with text) before the first throw, faint for the next few.
  touchHint.update(open && !dragging, throwsDone);
}

function enterMode(next: Mode): void {
  mode = next;
  menu.hide();
  next.enter();
  refreshInput();
}

function goMenu(): void {
  mode?.exit();
  mode = null;
  scene.setAimPreview(null);
  scene.setCameraMode('aim');
  menu.show();
  refreshInput();
}

async function requestMenu(): Promise<void> {
  if (!mode || dialogOpen) return;
  if (mode.inProgress()) {
    dialogOpen = true;
    refreshInput();
    const leave = await confirmDialog(app, {
      title: 'Leave the match?',
      text: 'The current match will be lost.',
      confirmLabel: 'Leave',
      cancelLabel: 'Keep playing',
    });
    dialogOpen = false;
    if (!leave) {
      refreshInput();
      return;
    }
  }
  goMenu();
}

menu.setMatchInfo(`First to ${cfg.match.pointsToWin}`);
menu.onPractice(() => enterMode(practice));
menu.onMatch(() => enterMode(match));
hud.onMenu(() => void requestMenu());

// Any touch on the field while aiming brings the camera back behind the circle.
canvas.addEventListener('pointerdown', () => {
  if (inputOpen()) scene.setCameraMode('aim');
});

// The cue hides while a finger is down (pointer capture keeps up/cancel on the canvas).
const fingers = new Set<number>();
const trackFinger = (e: PointerEvent, isDown: boolean): void => {
  if (isDown) fingers.add(e.pointerId);
  else fingers.delete(e.pointerId);
  dragging = fingers.size > 0;
  refreshInput();
};
canvas.addEventListener('pointerdown', (e) => trackFinger(e, true));
canvas.addEventListener('pointerup', (e) => trackFinger(e, false));
canvas.addEventListener('pointercancel', (e) => trackFinger(e, false));

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
let lastFrame = performance.now();
function frame(now: number): void {
  const dtReal = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (mode) mode.frame(dtReal);
  else scene.syncBodies([], null);
  scene.render(dtReal);
  requestAnimationFrame(frame);
}

resize();
// `?mode=practice|match` skips the menu (handy for dev and screenshots).
const startMode = params.get('mode');
if (startMode === 'practice') enterMode(practice);
else if (startMode === 'match') enterMode(match);
else goMenu();
requestAnimationFrame(frame);

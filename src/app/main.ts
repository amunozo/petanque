/**
 * App wiring: config store + tuning panel + input + start menu. The menu picks a
 * mode (practice / match vs a friend or the computer; practice and match each in their own file); main owns what they
 * share: the three.js view, the HUD, gesture routing and the frame loop.
 * Config is read live (store.config is mutated in place).
 */
import '../style.css';
import { createAudio } from '../audio';
import { resolveLang, setLang, t } from '../i18n';
import { createLoftPicker, createThrowController, type AimPreview, type ThrowIntent } from '../input';
import { createPitchScene } from '../render';
import { createConfigStore, createTuningPanel, defaultConfig, tuningSchema } from '../tuning';
import { initAnalytics, track } from './analytics';
import { resolveDevMode } from './devMode';
import type { AppContext, Mode } from './context';
import { createFx } from './fx';
import { createHaptics } from './haptics';
import { createHowTo } from './howto';
import { createHud } from './hud';
import { createInstaller } from './install';
import { createMatchHud } from './matchHud';
import { pointsFor } from './matchLength';
import { createMatchCore } from './matchCore';
import { createMatchMode, setup2p, setupVsComputer } from './matchMode';
import { createMeasureOverlay } from './measure';
import { confirmDialog, createMenu } from './menu';
import { hasSeenHowTo, isDifficulty, loadDifficulty, loadLang, loadMatchLength, markHowToSeen } from './prefs';
import { createPracticeMode } from './practiceMode';
import { registerServiceWorker } from './pwa';
import { createTouchHint } from './touchHint';
import { playShotEffects } from './shotEffects';
import { createUpdateToast } from './updateToast';
import { configuredServerUrl, defaultServerUrl, INVITE_BASE_URL, ROOM_PARAM } from '../net';
import { createOnlineFlow, type OnlineFlow } from './online/flow';
import { stripRoomParam } from './online/rules';
import { resolveOnlineBeta, resolveServer } from './online/storage';

/** Longest real-time gap one frame may simulate (after a tab switch etc.). */
const MAX_FRAME_SECONDS = 0.25;

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

// Language first: every screen below is built in it. `?lang=fr` (dev, screenshots) beats the saved choice, which beats the browser's.
const params = new URLSearchParams(location.search);
setLang(resolveLang({ param: params.get('lang'), saved: loadLang(), preferred: navigator.languages }));

// Listen for the browser's install offer right away: the event can fire before the rest has loaded.
const installer = createInstaller();

const app = byId<HTMLElement>('app');
const canvas = byId<HTMLCanvasElement>('scene');
const hudRoot = byId<HTMLElement>('hud');

// Players get the official defaults; saved tuning and the panel are dev-only.
const devMode = resolveDevMode(params, import.meta.env.DEV);
document.documentElement.classList.toggle('is-dev', devMode);
const store = createConfigStore(defaultConfig, { schema: tuningSchema, ...(devMode ? {} : { storage: null }) });
const cfg = store.config;

const scene = createPitchScene(canvas, () => store.config);
// Overlays drawn over the 3D view (under the HUD): measuring lines, dust bursts.
const project = (p: Parameters<typeof scene.project>[0]) => scene.project(p);
const fx = createFx(app, canvas, project, hudRoot);
const measure = createMeasureOverlay(app, project, hudRoot);
const hud = createHud(hudRoot, __BUILD_ID__);
const matchHud = createMatchHud(hudRoot);
const menu = createMenu(app, __BUILD_ID__, () => ({ quick: pointsFor('quick', cfg), standard: pointsFor('standard', cfg) }));
const touchHint = createTouchHint(app);
const haptics = createHaptics(() => cfg.controls.haptics);
const audio = createAudio();
const loftPicker = createLoftPicker('half');
app.append(loftPicker.element);

// ---- session / mode plumbing -----------------------------------------------------
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
  audio,
  loftPicker,
  fx,
  measure,
  refreshInput: () => refreshInput(),
  uiBlocked: () => panel.isOpen() || menu.isOpen() || hud.isSheetOpen() || dialogOpen || howTo.isOpen() || Boolean(online?.isOpen()),
  noteThrow: () => {
    throwsDone++;
  },
  newSeed: () => {
    const s = seedPending ?? Date.now() >>> 0;
    seedPending = null; // `?seed=` applies to the first session only
    return s;
  },
};

const howTo = createHowTo(app, () => ({
  quick: pointsFor('quick', cfg),
  standard: pointsFor('standard', cfg),
  jackMin: cfg.match.jackMinDist,
  jackMax: cfg.match.jackMaxDist,
}));
howTo.onClose(() => {
  markHowToSeen();
  refreshInput();
});
const openHowTo = (): boolean => {
  if (dialogOpen || howTo.isOpen()) return false;
  hud.closeSheet();
  howTo.open();
  refreshInput();
  return true;
};
/** The player asked for it (the first-launch offer below is not counted). */
const openHowToFromUi = (): void => {
  if (openHowTo()) track('howto-opened');
};
menu.onHowTo(openHowToFromUi);
hud.onHowTo(openHowToFromUi);

const panel = createTuningPanel(store, tuningSchema, { onOpenChange: () => refreshInput() });
const practice = createPracticeMode(ctx);
const core = createMatchCore(ctx);
const match = createMatchMode(ctx, core, () => goMenu());
// Online play shows only when this build has a server, in developer mode (`?server=` overrides it there),
// or when the hidden beta switch (`?online=1`, remembered) is on; the switch never enables developer mode.
const onlineBeta = resolveOnlineBeta(params);
const serverUrl = resolveServer(params, devMode, onlineBeta, configuredServerUrl(), defaultServerUrl());
const updates = registerServiceWorker();
const online: OnlineFlow | null = serverUrl
  ? createOnlineFlow({
      ctx,
      core,
      menu,
      points: () => ({ quick: pointsFor('quick', cfg), standard: pointsFor('standard', cfg) }),
      serverUrl,
      inviteBase: devMode ? `${location.origin}${location.pathname}` : INVITE_BASE_URL,
      inviteOnline: onlineBeta,
      enterMode: (m) => enterMode(m),
      goMenu: () => goMenu(),
      update: () => updates.applyOrCheck(),
    })
  : null;

/** Can the player start a throw gesture right now? */
const inputOpen = (): boolean => mode !== null && mode.canAim() && !ctx.uiBlocked();

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
  const isOnline = next === online?.mode;
  // Online matches play the server's config: no tuning panel, no local restart.
  hud.setSettingsAvailable(devMode && !isOnline);
  hud.setRestartAvailable(!isOnline);
  if (isOnline) panel.close();
  mode = next;
  menu.hide();
  next.enter();
  refreshInput();
}

function goMenu(): void {
  mode?.exit();
  audio.setRolling(0);
  mode = null;
  scene.setAimPreview(null);
  scene.setCameraMode('aim');
  fx.clear();
  menu.show();
  online?.refresh(); // is the saved online match still there?
  refreshInput();
}

/** Asks before throwing away a match in progress; resolves true when it's fine to go on. */
async function confirmLeave(title: string, confirmLabel: string, text = t('confirm.text')): Promise<boolean> {
  if (!mode?.inProgress()) return true;
  dialogOpen = true;
  refreshInput();
  const ok = await confirmDialog(app, {
    title,
    text,
    confirmLabel,
    cancelLabel: t('confirm.keep'),
  });
  dialogOpen = false;
  refreshInput();
  return ok;
}

async function requestMenu(): Promise<void> {
  if (!mode || dialogOpen) return;
  if (!(await confirmLeave(t('confirm.leave.title'), t('confirm.leave.ok'), mode.leaveText?.()))) return;
  mode?.leave?.();
  goMenu();
}

async function requestRestart(): Promise<void> {
  if (mode !== match || dialogOpen) return;
  if (await confirmLeave(t('confirm.restart.title'), t('confirm.restart.ok'))) match.restart();
}

// Anonymous usage events (analytics.ts) fire on the menu choices only, not on the `?mode=` dev shortcuts.
menu.onPractice(() => {
  track('practice-start');
  enterMode(practice);
});
menu.onMatch((length) => {
  track('two-players-start');
  match.setSetup(setup2p(length));
  enterMode(match);
});
menu.onVsComputer((difficulty, length) => {
  track(`vs-computer-start-${difficulty}`);
  match.setSetup(setupVsComputer(difficulty, length));
  enterMode(match);
});

// ---- PWA: "Install app" (menu + ⋯ sheet) and the "new version" toast ----------------------
const paintInstall = (): void => {
  const available = installer.canInstall();
  menu.setInstallable(available);
  hud.setInstallable(available);
};
installer.onChange(paintInstall);
paintInstall();
menu.onInstall(() => void installer.install());
hud.onInstall(() => void installer.install());

// A new version waits until the player taps "Update" (a match in progress asks first).
const updateToast = createUpdateToast(app);
updates.onUpdate(() =>
  updateToast.show(() => {
    if (dialogOpen) return;
    void confirmLeave(t('confirm.update.title'), t('confirm.update.ok')).then((ok) => {
      if (ok) updates.apply();
    });
  }),
);

// ---- sound: mute toggles (⋯ sheet + menu) and loft tick ---------------------------------
const paintMute = (muted: boolean): void => {
  hud.setMuted(muted);
  menu.setMuted(muted);
};
paintMute(audio.isMuted());
audio.onMuteChange(paintMute);
const toggleMute = (): void => {
  audio.toggleMute();
  if (!audio.isMuted()) audio.tick(); // audible confirmation
};
hud.onMute(toggleMute);
menu.onMute(toggleMute);
loftPicker.onChange(() => audio.tick());
hud.onMenu(() => void requestMenu());
hud.onRestart(() => void requestRestart());
hud.onSheetChange(() => refreshInput());

// ---- tuning: opened from the ⋯ sheet; a dot on ⋯ flags changed values -----------------
hud.onSettings(() => panel.open());
hud.setSettingsAvailable(devMode);
const paintTuningDot = (): void => hud.setSettingsChanged(store.diffCount() > 0);
store.subscribe(paintTuningDot);
paintTuningDot();

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

// ---- fullscreen (sheet row hidden where unsupported, e.g. iOS Safari) ---------------
if (document.fullscreenEnabled && typeof app.requestFullscreen === 'function') {
  hud.setFullscreen(true, false);
  hud.onFullscreen(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void app.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', () => {
    hud.setFullscreen(true, Boolean(document.fullscreenElement));
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
  measure.frame(now);
  fx.frame(now);
  requestAnimationFrame(frame);
}

resize();
// `?mode=practice|match|ai` skips the menu (handy for dev and screenshots); `&level=easy|medium|hard` for ai.
const startMode = params.get('mode');
const levelParam = params.get('level');
if (startMode === 'practice') enterMode(practice);
else if (startMode === 'match') {
  match.setSetup(setup2p(loadMatchLength()));
  enterMode(match);
} else if (startMode === 'ai') {
  match.setSetup(setupVsComputer(isDifficulty(levelParam) ? levelParam : loadDifficulty(), loadMatchLength()));
  enterMode(match);
} else {
  const invited = params.has(ROOM_PARAM);
  goMenu();
  if (online) online.start();
  else if (invited) history.replaceState(history.state, '', stripRoomParam(location.href));
  // First launch: offer "How to play" once (skippable). Not with the dev shortcuts above, nor over an invite (offered next time).
  if (!hasSeenHowTo() && !(online && invited)) {
    markHowToSeen();
    openHowTo();
  }
}
requestAnimationFrame(frame);
initAnalytics({ devMode, search: location.search }); // after the first paint; a no-op in developer mode, offline, on localhost

// Dev shortcut: `?fxdemo=carreau|hit` plays a good-shot celebration once, in front of the throwing circle (to tune sound and visuals).
const demo = params.get('fxdemo');
if (demo === 'carreau' || demo === 'hit') {
  const kind = demo;
  window.setTimeout(() => {
    scene.setCameraMode('rest');
    playShotEffects(ctx, kind, { x: cfg.throw.originX, y: 0, z: cfg.throw.originZ - 3 });
  }, 1800);
}

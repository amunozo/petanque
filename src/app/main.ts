import '../style.css';
import { createTouchTracker } from '../input/touchTracker';
import { createPitchScene } from '../render/pitchScene';
import { createTrailOverlay } from '../render/trailOverlay';

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const sceneCanvas = byId<HTMLCanvasElement>('scene');
const trailCanvas = byId<HTMLCanvasElement>('trail');
const statsEl = byId<HTMLElement>('stats');
const fullscreenBtn = byId<HTMLButtonElement>('fullscreen');
const app = byId<HTMLElement>('app');

const pitch = createPitchScene(sceneCanvas);
const overlay = createTrailOverlay(trailCanvas);
const tracker = createTouchTracker(app, () => performance.now());

function resize(): void {
  pitch.resize();
  overlay.resize();
}
resize();
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// Fullscreen button (hidden where unsupported, e.g. iOS Safari)
if (document.fullscreenEnabled && typeof app.requestFullscreen === 'function') {
  fullscreenBtn.hidden = false;
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void app.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    resize();
  });
}

// FPS: smoothed over ~0.5s windows
let frames = 0;
let windowStart = performance.now();
let fps = 0;

function frame(now: number): void {
  frames++;
  if (now - windowStart >= 500) {
    fps = (frames * 1000) / (now - windowStart);
    frames = 0;
    windowStart = now;
    statsEl.textContent =
      `build   ${__BUILD_ID__}\n` +
      `fps     ${fps.toFixed(0)}\n` +
      `pointers ${tracker.active.size}\n` +
      `drag    ${tracker.lastDragLength.toFixed(0)} px`;
  }
  pitch.render();
  overlay.draw(tracker, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/**
 * Procedural game audio (WebAudio, no samples, no dependencies).
 *
 * - The AudioContext is created lazily on the first user gesture (iOS / Android
 *   autoplay rules) and resumed on later gestures / when the tab returns.
 * - Sounds are driven by engine SimEvents (`handle`) plus the fastest rolling
 *   speed (`setRolling`); UI sounds are `tick` and `chime`.
 * - Mute state is persisted in localStorage (best effort).
 * Tweak the sounds in ./config.ts (numbers) and ./voices.ts / ./rumble.ts (recipes).
 */
import type { Body, SimEvent } from '../engine';
import { audioConfig } from './config';
import { createRumble, type Rumble } from './rumble';
import { fillNoise, level01, loudest } from './shape';
import { playBoard, playChime, playHit, playJackHit, playLand, playTick, type ChimeKind, type Runtime } from './voices';

export { audioConfig } from './config';
export type { AudioConfig } from './config';
export type { ChimeKind } from './voices';

const STORAGE_KEY = 'petanque.muted';
const NOISE_SECONDS = 2;
/** User gestures that may unlock audio (capture phase, so shielded buttons still count). */
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

export interface Audio {
  /** Sounds for the events of one frame; `bodies` tells the jack (wood) from boules (metal). */
  handle(events: readonly SimEvent[], bodies: readonly Body[]): void;
  /** Fastest rolling speed (m/s) this frame; 0 = everything rests. */
  setRolling(speed: number): void;
  /** Soft UI tick (loft change). */
  tick(): void;
  chime(kind: ChimeKind): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  toggleMute(): void;
  /** Returns an unsubscribe function. */
  onMuteChange(fn: (muted: boolean) => void): () => void;
  /** 'none' until the first user gesture created the context. */
  state(): AudioContextState | 'none';
}

export interface AudioOptions {
  /** Body kind that sounds like wood instead of metal. */
  woodKind?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Target for the gesture listeners (default: document). */
  gestureTarget?: Pick<Document, 'addEventListener'> | null;
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createAudio(opts: AudioOptions = {}): Audio {
  const woodKind = opts.woodKind ?? 'jack';
  const storage = opts.storage === undefined ? safeStorage() : opts.storage;
  const listeners = new Set<(m: boolean) => void>();

  let muted = false;
  try {
    muted = storage?.getItem(STORAGE_KEY) === '1';
  } catch {
    /* storage blocked */
  }

  let rt: Runtime | null = null;
  let master: GainNode | null = null;
  let rumble: Rumble | null = null;

  const masterTarget = (): number => (muted ? 0 : audioConfig.masterVolume);

  function create(trigger: string): void {
    const Ctor: typeof AudioContext | undefined = typeof AudioContext !== 'undefined' ? AudioContext : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
      fillNoise(noise.getChannelData(0));
      master = ctx.createGain();
      master.gain.value = masterTarget();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.002;
      comp.release.value = 0.15;
      master.connect(comp).connect(ctx.destination);
      rt = { ctx, out: master, noise, active: 0, seq: 1 };
      rumble = createRumble(rt);
      console.info(`[audio] AudioContext created on first ${trigger} (state: ${ctx.state})`);
    } catch (err) {
      console.warn('[audio] cannot create AudioContext', err);
    }
  }

  /** Called from user gestures: create the context once, and wake it whenever it is not running. */
  function unlock(e: Event): void {
    if (!rt) create(e.type);
    const ctx = rt?.ctx;
    if (!ctx || ctx.state === 'running') return;
    void ctx.resume().catch(() => undefined);
  }

  const target = opts.gestureTarget === undefined ? (typeof document === 'undefined' ? null : document) : opts.gestureTarget;
  if (target) for (const type of GESTURE_EVENTS) target.addEventListener(type, unlock, { capture: true, passive: true });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      const ctx = rt?.ctx;
      if (!ctx) return;
      if (document.hidden) {
        rumble?.stop();
        void ctx.suspend().catch(() => undefined);
      } else void ctx.resume().catch(() => undefined);
    });
  }

  /** The runtime, only when sound can actually come out now. */
  const live = (): Runtime | null => (rt && !muted && rt.ctx.state === 'running' ? rt : null);

  function play(r: Runtime, kind: 'hit' | 'jackHit' | 'land' | 'board', level: number): void {
    if (r.active >= audioConfig.maxActiveVoices) return;
    if (kind === 'hit') playHit(r, level);
    else if (kind === 'jackHit') playJackHit(r, level);
    else if (kind === 'land') playLand(r, level);
    else playBoard(r, level);
  }

  const setMuted = (next: boolean): void => {
    if (next === muted) return;
    muted = next;
    try {
      storage?.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    if (rt && master) {
      master.gain.setTargetAtTime(masterTarget(), rt.ctx.currentTime, 0.02);
      if (muted) rumble?.stop();
    }
    for (const fn of [...listeners]) fn(muted);
  };

  return {
    handle(events, bodies) {
      const r = live();
      if (!r || events.length === 0) return;
      const kindOf = (id: string): string | undefined => bodies.find((b) => b.id === id)?.kind;
      const cands: { kind: 'hit' | 'jackHit' | 'land' | 'board'; level: number }[] = [];
      for (const e of events) {
        if (e.type === 'hit') {
          const wood = kindOf(e.a) === woodKind || kindOf(e.b) === woodKind;
          const c = wood ? audioConfig.jackHit : audioConfig.hit;
          cands.push({ kind: wood ? 'jackHit' : 'hit', level: level01(e.speed, c.minSpeed, c.refSpeed) });
        } else if (e.type === 'land') {
          const c = audioConfig.land;
          cands.push({ kind: 'land', level: level01(e.speed, c.minSpeed, c.refSpeed) });
        } else if (e.type === 'board') {
          const c = audioConfig.board;
          cands.push({ kind: 'board', level: level01(e.speed, c.minSpeed, c.refSpeed) });
        }
      }
      for (const c of loudest(
        cands.filter((x) => x.level > 0),
        audioConfig.maxVoicesPerFrame,
      )) {
        play(r, c.kind, c.level);
      }
    },
    setRolling(speed) {
      const r = live();
      if (!r) {
        rumble?.stop();
        return;
      }
      rumble?.set(speed);
    },
    tick() {
      const r = live();
      if (r && r.active < audioConfig.maxActiveVoices) playTick(r);
    },
    chime(kind) {
      const r = live();
      if (r) playChime(r, kind);
    },
    isMuted: () => muted,
    setMuted,
    toggleMute: () => setMuted(!muted),
    onMuteChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    state: () => rt?.ctx.state ?? 'none',
  };
}

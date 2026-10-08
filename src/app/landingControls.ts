/**
 * "Landing spot" controls, app side: the throw handle, swipe trail, feedback
 * chip and first-throw hints (DOM, styles in the "Landing-spot controls"
 * section of src/style.css, classes ld-*), plus the glue between the gesture
 * (input/landingController.ts) and the rules: marker -> clamped spot -> solved
 * intent -> the usual aim preview; swipe -> execution error -> perturbed intent
 * -> the mode's onThrow. The intent is an ordinary ThrowIntent, so every mode
 * (practice, vs computer, two players, online) works unchanged.
 */
import { ballConfig, constrainSpot, perturbIntent, reachRange, solveSpot, type SolvedSpot, type Spot } from '../games/petanque';
import { onLangChange, t } from '../i18n';
import { createLandingInput, type SwipeSkill, type ThrowIntent } from '../input';
import type { GameConfig } from '../tuning';
import type { AppContext, Mode, ThrowSetup } from './context';
import { el, setRich } from './dom';

export interface LandingControls {
  /** The player chose these controls (false = classic: everything here hides and stops). */
  setActive(active: boolean): void;
  /** May the player aim right now (same rule as the classic gesture). */
  setOpen(open: boolean): void;
  /** Forgets the marker (new mode / session). */
  clear(): void;
}

export interface LandingControlsDeps {
  ctx: AppContext;
  surface: HTMLElement;
  pick(x: number, y: number): Spot | null;
  project(spot: Spot): { x: number; y: number } | null;
  /** Is the aim view up (a touch elsewhere only brings it back)? */
  canPlace(): boolean;
  mode(): Mode | null;
  /** Hands a finished throw to the active mode (the caller re-checks that input is open). */
  throwIntent(intent: ThrowIntent): void;
}

/** First-throw hints ("touch the court", "swipe up") show for this many throws per page load. */
const HINT_THROWS = 2;

const ARROW = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>';

type FeedbackKey = 'swipe.clean' | 'swipe.strong' | 'swipe.soft' | 'swipe.left' | 'swipe.right';

function feedbackKeys(s: SwipeSkill): FeedbackKey[] {
  const keys: FeedbackKey[] = [];
  if (s.pace === 'strong') keys.push('swipe.strong');
  if (s.pace === 'soft') keys.push('swipe.soft');
  if (s.direction === 'left') keys.push('swipe.left');
  if (s.direction === 'right') keys.push('swipe.right');
  return keys.length > 0 ? keys : ['swipe.clean'];
}

export function createLandingControls(deps: LandingControlsDeps): LandingControls {
  const { ctx } = deps;
  const { app, loftPicker } = ctx;

  // ---- DOM -----------------------------------------------------------------------------
  const handle = el('div', 'ld-handle');
  handle.setAttribute('role', 'button');
  handle.innerHTML = `<span class="ld-arrow">${ARROW}</span><span class="ld-ball"></span>`;
  handle.hidden = true;
  const svgNs = 'http://www.w3.org/2000/svg';
  const trail = document.createElementNS(svgNs, 'svg');
  trail.setAttribute('class', 'ld-trail');
  trail.setAttribute('aria-hidden', 'true');
  const trailLine = document.createElementNS(svgNs, 'polyline');
  trail.append(trailLine);
  const chip = el('div', 'ld-chip');
  chip.hidden = true;
  chip.setAttribute('role', 'status');
  const hint = el('div', 'ld-hint');
  hint.hidden = true;
  app.append(trail, hint, chip, handle);

  // ---- state ---------------------------------------------------------------------------
  let active = false;
  let open = false;
  /** The spot as asked (kept across loft changes, so a shorter loft's clamp is undone by switching back). */
  let asked: Spot | null = null;
  /** The spot in use (clamped to the court and the current loft's reach). */
  let spot: Spot | null = null;
  let solved: { key: string; result: SolvedSpot } | null = null;
  let previewShown = false;
  let throws = 0;
  let raf = 0;
  let chipTimer: ReturnType<typeof setTimeout> | undefined;
  let trailTimer: ReturnType<typeof setTimeout> | undefined;
  let swiping = false;

  // Reach per (loft, ball, config): two noise-free simulations, cached; tuning changes reset it.
  const reachCache = new Map<string, { min: number; max: number }>();
  let cfgVersion = 0;
  ctx.store.subscribe(() => {
    reachCache.clear();
    cfgVersion++;
    if (spot) schedule();
  });

  const setup = (): ThrowSetup | null => deps.mode()?.throwSetup() ?? null;
  const cfgTag = (cfg: GameConfig): string => (cfg === ctx.cfg ? `live${cfgVersion}` : 'fixed');
  const ballCfg = (s: ThrowSetup): GameConfig => ballConfig(s.cfg, s.ball);

  function constrain(raw: Spot, s: ThrowSetup): Spot {
    const loft = loftPicker.get();
    const key = `${loft}|${s.ball}|${cfgTag(s.cfg)}`;
    const c = ballCfg(s);
    let reach = reachCache.get(key);
    if (!reach) {
      reach = reachRange(loft, c);
      reachCache.set(key, reach);
    }
    return constrainSpot(raw, c, reach);
  }

  function solveNow(): SolvedSpot | null {
    const s = setup();
    if (!spot || !s) return null;
    const loft = loftPicker.get();
    const key = `${spot.x.toFixed(4)},${spot.z.toFixed(4)}|${loft}|${s.ball}|${cfgTag(s.cfg)}`;
    if (solved?.key !== key) solved = { key, result: solveSpot(spot, loft, ballCfg(s)) };
    return solved.result;
  }

  /** Solves and previews on the next frame (dragging fires faster than a solve needs to run). */
  function schedule(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      showPreview();
    });
  }

  function showPreview(): void {
    if (!active || !open || !spot) return;
    const r = solveNow();
    const mode = deps.mode();
    if (!r || !mode) return;
    mode.onPreview({ aim: r.intent.aim, power: r.intent.power, start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, target: { x: r.spot.x, z: r.spot.z, meaning: r.meaning } });
    previewShown = true;
  }

  function hidePreview(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (previewShown) deps.mode()?.onPreview(null);
    previewShown = false;
  }

  function paint(): void {
    const on = active && open;
    handle.hidden = !(on && spot !== null);
    handle.classList.toggle('is-jack', setup()?.ball === 'jack');
    handle.classList.toggle('is-hinted', on && spot !== null && throws < HINT_THROWS);
    const showHint = on && !swiping && throws < HINT_THROWS;
    hint.hidden = !showHint;
    if (showHint) {
      hint.classList.toggle('is-swipe', spot !== null);
      setRich(hint, t(spot ? 'hint.landing.swipe' : 'hint.landing.place'));
    }
  }

  function paintText(): void {
    handle.setAttribute('aria-label', t('landing.handle.aria'));
    paint();
  }
  paintText();
  onLangChange(paintText);

  // ---- swipe feedback -------------------------------------------------------------------
  function drawTrail(points: readonly { x: number; y: number }[] | null, verdict?: 'clean' | 'off' | 'cancel'): void {
    clearTimeout(trailTimer);
    if (!points || points.length === 0) {
      if (!verdict) trail.classList.remove('is-on');
      return;
    }
    trailLine.setAttribute('points', points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
    trail.classList.add('is-on');
    trail.classList.remove('is-clean', 'is-off', 'is-cancel', 'is-fading');
    if (verdict) {
      trail.classList.add(`is-${verdict}`);
      void trail.getBoundingClientRect();
      trail.classList.add('is-fading');
      trailTimer = setTimeout(() => trail.classList.remove('is-on', 'is-fading'), Math.max(300, ctx.cfg.landing.feedbackMs));
    }
  }

  function showChip(skill: SwipeSkill): void {
    clearTimeout(chipTimer);
    const ms = ctx.cfg.landing.feedbackMs;
    if (ms <= 0) return;
    chip.textContent = feedbackKeys(skill).map((k) => t(k)).join(' · ');
    chip.classList.toggle('is-clean', skill.pace === 'good' && skill.direction === 'straight');
    chip.hidden = false;
    chip.style.animationDuration = `${ms}ms`;
    chip.classList.remove('is-in');
    void chip.offsetWidth;
    chip.classList.add('is-in');
    chipTimer = setTimeout(() => {
      chip.hidden = true;
    }, ms);
  }

  // ---- input -------------------------------------------------------------------------------
  const input = createLandingInput(
    {
      surface: deps.surface,
      handle,
      getConfig: () => ctx.cfg,
      getSpot: () => spot,
      pick: deps.pick,
      project: (s) => deps.project(s),
      canPlace: () => deps.canPlace(),
    },
    {
      onSpot(raw) {
        const s = setup();
        if (!active || !open || !s) return null;
        asked = raw;
        spot = constrain(raw, s);
        schedule();
        paint();
        return spot;
      },
      onSwipeMove(points) {
        swiping = points !== null;
        if (points) drawTrail(points);
        paint();
      },
      onSwipe(result) {
        swiping = false;
        if (!result) {
          drawTrail(null, 'cancel');
          paint();
          return;
        }
        const s = setup();
        const r = active && open ? solveNow() : null;
        if (!r || !s) {
          drawTrail(result.points, 'cancel');
          paint();
          return;
        }
        const clean = result.skill.pace === 'good' && result.skill.direction === 'straight';
        drawTrail(result.points, clean ? 'clean' : 'off');
        showChip(result.skill);
        const intent = perturbIntent(r.intent, result.skill, s.cfg);
        // Forget the marker first: the throw closes the input and the mode clears its own preview.
        asked = null;
        spot = null;
        solved = null;
        previewShown = false;
        throws++;
        paint();
        deps.throwIntent(intent);
      },
    },
  );

  loftPicker.onChange(() => {
    const s = setup();
    if (!active || !asked || !s) return;
    spot = constrain(asked, s);
    schedule();
  });

  return {
    setActive(a) {
      if (a === active) return;
      active = a;
      if (!a) {
        hidePreview();
        asked = null;
        spot = null;
      }
      input.setEnabled(active && open);
      paint();
    },
    setOpen(o) {
      if (o === open) return;
      open = o;
      input.setEnabled(active && open);
      if (!open) hidePreview();
      else if (active && spot) schedule();
      if (!open) swiping = false;
      paint();
    },
    clear() {
      hidePreview();
      asked = null;
      spot = null;
      solved = null;
      paint();
    },
  };
}

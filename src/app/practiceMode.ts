/**
 * Practice mode: input -> games/petanque/practice state -> engine playback ->
 * view. One end of a few boules thrown at a seeded jack, again and again.
 */
import type { World } from '../engine';
import {
  beginThrow,
  closestBoule,
  createPractice,
  distancesToJack,
  JACK_ID,
  newEnd,
  settleThrow,
  type PracticeState,
} from '../games/petanque';
import { onLangChange, t } from '../i18n';
import type { AimPreview, ThrowIntent } from '../input';
import { createAimPreviewer } from './aimPreview';
import type { AppContext, Mode } from './context';
import { formatDistance, type DistanceRow } from './hud';
import { createPlayback } from './playback';

export function createPracticeMode(ctx: AppContext): Mode {
  const { cfg, scene, hud, app } = ctx;
  const playback = createPlayback(ctx);
  const preview = createAimPreviewer(ctx);

  let state: PracticeState = createPractice(1, cfg);
  let world: World | null = null;
  let sessionBest: number | null = null;

  const lastThrowId = (): string | null => state.throws[state.throws.length - 1]?.id ?? null;

  function updateStatus(): void {
    const total = cfg.practice.boulesPerEnd;
    const n = Math.min(total, state.throws.length + (state.phase === 'aiming' ? 1 : 0));
    hud.setStatus(state.phase === 'endOver' ? t('practice.done', { end: state.endNumber }) : t('practice.status', { end: state.endNumber, n, total }));
  }

  function showResult(): void {
    const d = distancesToJack(state);
    const best = closestBoule(state);
    const rows: DistanceRow[] = d.entries.map((e) => ({
      label: t('practice.boule', { n: e.throwNumber }),
      text: e.out ? t('practice.out') : e.distance === null ? '-' : formatDistance(e.distance),
      closest: best !== null && best.id === e.id,
      out: e.out,
    }));
    if (d.jackOut) rows.unshift({ label: t('practice.jack'), text: t('practice.out'), closest: false, out: true });
    hud.setDistances(rows);

    const jack = state.bodies.find((b) => b.id === JACK_ID);
    const closest = best ? state.bodies.find((b) => b.id === best.id) : undefined;
    scene.setResultLine(jack && closest ? jack.pos : null, jack && closest ? closest.pos : null);

    if (state.phase === 'endOver') {
      if (best && best.distance !== null && (sessionBest === null || best.distance < sessionBest)) sessionBest = best.distance;
      hud.showEndCard({
        best: best && best.distance !== null ? best.distance : null,
        sessionBest,
        ...(d.jackOut ? { note: 'jackOut' as const } : best ? {} : { note: 'allOut' as const }),
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
    playback.reset();
    state = newEnd(state, cfg);
    resetView();
    updateStatus();
    ctx.refreshInput();
  }

  function settle(w: World): void {
    state = settleThrow(state, w, cfg);
    world = null;
    playback.reset();
    scene.setCameraMode('rest');
    app.classList.toggle('is-endover', state.phase === 'endOver');
    showResult();
    updateStatus();
    ctx.refreshInput();
  }

  let active = false;
  // A language change repaints the texts that were built from state.
  onLangChange(() => {
    if (!active) return;
    updateStatus();
    if (state.phase !== 'inFlight' && state.throws.length > 0) showResult();
  });

  return {
    enter() {
      active = true;
      hud.setMode('practice');
      hud.onNewEnd(startNewEnd);
      hud.onNextEnd(startNewEnd);
      state = createPractice(ctx.newSeed(), cfg);
      world = null;
      sessionBest = null;
      playback.reset();
      resetView();
      scene.setJackZone(null);
      scene.setScoringHighlight(null, null);
      updateStatus();
    },
    exit() {
      active = false;
      world = null;
      resetView();
      hud.setStatus('');
    },
    canAim: () => state.phase === 'aiming',
    throwSetup: () => ({ ball: 'boule', cfg }),
    inProgress: () => false,
    onPreview(p: AimPreview | null) {
      preview.update(p, state.phase === 'aiming' ? 'boule' : null);
    },
    onThrow(intent: ThrowIntent) {
      if (state.phase !== 'aiming') return;
      ctx.noteThrow();
      const r = beginThrow(state, intent, cfg);
      state = r.state;
      world = r.world;
      playback.reset();
      hud.setDistances(null);
      hud.setPower(null);
      scene.setAimPreview(null);
      scene.setResultLine(null, null);
      scene.setCameraMode('flight');
      updateStatus();
      ctx.refreshInput();
    },
    frame(dtReal) {
      if (world && state.phase === 'inFlight' && playback.advance(world, dtReal)) settle(world);
      scene.syncBodies(world ? world.bodies : state.bodies, lastThrowId());
    },
  };
}

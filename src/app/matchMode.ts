/**
 * 2-player pass-and-play match: input -> games/petanque/match rules (reducer
 * style) -> engine playback -> view + match HUD. The active team throws with the
 * usual gestures; when the world settles its resting bodies go back to the rules.
 */
import type { Body, World } from '../engine';
import {
  beginMatchThrow,
  canThrow,
  createMatch,
  distances,
  nextEnd,
  settle,
  type MatchState,
  type TeamId,
} from '../games/petanque';
import type { AimPreview, ThrowIntent } from '../input';
import type { JackZoneView, TeamResolver } from '../render';
import { createAimPreviewer } from './aimPreview';
import type { AppContext, Mode } from './context';
import type { TurnData } from './matchHud';
import { endCardView, jackFault, matchOverTitle, scoreLine, settleMessage, turnView } from './matchText';
import { createPlayback } from './playback';

/** Pause between the last boule coming to rest and the end card (s): time to see the scoring rings. */
const CARD_DELAY_MS = 900;

/** Boule bodies are named `${team}${n}` by the rules; the jack and practice balls stay neutral. */
const teamOf: TeamResolver = (b) => (b.kind === 'boule' ? (b.id.startsWith('B') ? 'B' : 'A') : null);

export function createMatchMode(ctx: AppContext, goMenu: () => void): Mode {
  const { cfg, scene, matchHud, app } = ctx;
  const playback = createPlayback(ctx);
  const preview = createAimPreviewer(ctx);

  let state: MatchState = createMatch(1, cfg);
  let world: World | null = null;
  /** A rejected jack: the rules drop it from the state, but it stays on screen until the next throw. */
  let ghostJack: Body | null = null;
  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  let lastTurn: TurnData | null = null;

  const lastThrow = () => state.throws[state.throws.length - 1];
  const thrower = (): TeamId => state.toThrow;
  const isJackThrow = (): boolean => lastThrow()?.id === 'jack';

  function zone(): JackZoneView {
    const { originX, originZ } = cfg.throw;
    const { minX, maxX } = cfg.physics.arena;
    return {
      originX,
      originZ,
      minDist: state.rules.jackMinDist,
      maxDist: state.rules.jackMaxDist,
      xMin: minX + state.rules.jackMinSideMargin,
      xMax: maxX - state.rules.jackMinSideMargin,
    };
  }

  function turnData(): TurnData {
    return { ...turnView(state), left: state.boulesLeft, total: state.rules.boulesPerTeam };
  }

  function announceTurn(): void {
    lastTurn = turnData();
    matchHud.announceTurn(lastTurn);
  }

  function clearCards(): void {
    clearTimeout(cardTimer);
    cardTimer = undefined;
    matchHud.showEndCard(null);
    matchHud.showMatchOver(null);
    app.classList.remove('is-endover');
  }

  function showResultCards(): void {
    const end = state.lastEnd;
    if (!end) return;
    const over = state.phase === 'matchOver';
    cardTimer = setTimeout(() => {
      app.classList.add('is-endover');
      ctx.refreshInput();
      if (over && state.winner) {
        const ends = state.endNumber;
        matchHud.showMatchOver({ title: matchOverTitle(state.winner, state.score), detail: `after ${ends} end${ends === 1 ? '' : 's'}`, team: state.winner });
      } else {
        const v = endCardView(end);
        matchHud.showEndCard({ ...v, score: scoreLine(state.score) });
      }
    }, CARD_DELAY_MS);
  }

  /** Everything that follows a settle: message chip, turn banner, rings, cards. */
  function afterSettle(fault: string | null): void {
    matchHud.setScore(state.score, state.phase === 'jack' || state.phase === 'boule' ? state.toThrow : null);
    scene.setCameraMode('rest');
    scene.setJackZone(state.phase === 'jack' ? zone() : null);

    if (state.phase === 'endOver' || state.phase === 'matchOver') {
      matchHud.setMessage(null, null);
      const end = state.lastEnd;
      scene.setScoringHighlight(end ? end.scoringIds : null, end ? end.winner : null);
      showResultCards();
      return;
    }
    const msg = settleMessage(state, fault);
    matchHud.setMessage(msg ? msg.text : null, msg ? msg.team : null);
    // The point line (jack -> nearest boule) like in practice.
    const jack = state.bodies.find((b) => b.id === 'jack');
    const nearest = distances(state)[0];
    const nb = nearest ? state.bodies.find((b) => b.id === nearest.id) : undefined;
    scene.setResultLine(jack && nb ? jack.pos : null, jack && nb ? nb.pos : null);
    announceTurn();
  }

  function onSettled(w: World): void {
    const wasJack = isJackThrow();
    const jackBody = w.bodies.find((b) => b.id === 'jack');
    state = settle(state, w.bodies, cfg);
    world = null;
    playback.reset();
    let fault: string | null = null;
    ghostJack = null;
    if (wasJack && state.phase === 'jack') {
      fault = jackFault(jackBody, state.rules, cfg);
      if (jackBody && jackBody.state !== 'out') ghostJack = { ...jackBody, pos: { ...jackBody.pos } };
    }
    afterSettle(fault);
    ctx.refreshInput();
  }

  function start(): void {
    clearCards();
    world = null;
    ghostJack = null;
    playback.reset();
    scene.setAimPreview(null);
    scene.setResultLine(null, null);
    scene.setScoringHighlight(null, null);
    scene.setCameraMode('aim');
    scene.setJackZone(state.phase === 'jack' ? zone() : null);
    matchHud.setMessage(null, null);
    matchHud.setScore(state.score, state.toThrow);
    announceTurn();
    ctx.refreshInput();
  }

  function newMatch(): void {
    matchHud.reset();
    state = createMatch(ctx.newSeed(), cfg);
    start();
  }

  matchHud.onNextEnd(() => {
    if (state.phase !== 'endOver') return;
    state = nextEnd(state);
    start();
  });
  matchHud.onRematch(newMatch);
  matchHud.onMenu(goMenu);

  return {
    enter() {
      ctx.hud.setMode('match');
      ctx.hud.showEndCard(null);
      matchHud.show();
      newMatch();
    },
    exit() {
      clearCards();
      world = null;
      ghostJack = null;
      scene.setJackZone(null);
      scene.setScoringHighlight(null, null);
      scene.setResultLine(null, null);
      scene.setAimPreview(null);
      ctx.hud.setPower(null);
      matchHud.reset();
      matchHud.hide();
    },
    canAim: () => canThrow(state, thrower()),
    inProgress: () => state.phase !== 'matchOver' && (state.endNumber > 1 || state.throws.length > 0 || state.score.A + state.score.B > 0),
    onPreview(p: AimPreview | null) {
      const ball = canThrow(state, thrower()) ? (state.phase === 'jack' ? 'jack' : 'boule') : null;
      preview.update(p, ball);
    },
    onThrow(intent: ThrowIntent) {
      if (!canThrow(state, thrower())) return;
      ctx.noteThrow();
      const r = beginMatchThrow(state, thrower(), intent, cfg);
      state = r.state;
      world = r.world;
      ghostJack = null;
      playback.reset();
      matchHud.setMessage(null, null);
      if (lastTurn) matchHud.setChip({ ...lastTurn, left: state.boulesLeft });
      ctx.hud.setPower(null);
      scene.setAimPreview(null);
      scene.setResultLine(null, null);
      scene.setCameraMode('flight');
      ctx.refreshInput();
    },
    frame(dtReal) {
      if (world && state.phase === 'inFlight' && playback.advance(world, dtReal)) onSettled(world);
      const bodies = world ? world.bodies : ghostJack ? [...state.bodies, ghostJack] : state.bodies;
      scene.syncBodies(bodies, lastThrow()?.id ?? null, teamOf);
    },
  };
}

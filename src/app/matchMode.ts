/**
 * Match mode: input -> games/petanque/match rules (reducer style) -> engine
 * playback -> view + match HUD. Each team is a seat controlled by a human (usual
 * gestures) or the computer (aiTurn.ts: think -> show aim -> throw). Pass-and-play
 * is two human seats; "vs computer" is Blue = human, Red = computer. When the
 * world settles its resting bodies go back to the rules.
 */
import type { Body, World } from '../engine';
import {
  analyseShot,
  beginMatchThrow,
  canThrow,
  createMatch,
  distances,
  nextEnd,
  settle,
  type MatchState,
  type TeamId,
} from '../games/petanque';
import type { AiDecision, AiDifficulty, AiRequest } from '../games/petanque/aiTypes';
import type { AimPreview, ThrowIntent } from '../input';
import { onLangChange, t } from '../i18n';
import type { JackZoneView, TeamResolver } from '../render';
import { createAimPreviewer } from './aimPreview';
import { createAiClient } from './aiClient';
import { createAiTurn } from './aiTurn';
import type { AppContext, Mode } from './context';
import { effectsConfig } from './effectsConfig';
import type { TurnData } from './matchHud';
import { endCardView, jackFault, matchOverDetail, matchOverTitle, scoreLine, settleMessage, turnView, voice2p, voiceVs, type JackFault } from './matchText';
import { matchConfig, type MatchLength } from './matchLength';
import { formatMeasure, isTight, measureTargets } from './measureLines';
import { createPlayback } from './playback';
import { playShotEffects } from './shotEffects';

export type Seat = 'human' | 'ai';

export interface MatchSetup {
  seats: Record<TeamId, Seat>;
  /** Used when a seat is 'ai'. */
  difficulty: AiDifficulty;
  /** Match length chosen in the menu; sets the points to win of every match created (rematches included). */
  length: MatchLength;
}

export const setup2p = (length: MatchLength): MatchSetup => ({ seats: { A: 'human', B: 'human' }, difficulty: 'medium', length });
/** Human = Blue (team A, throws the first jack), computer = Red (team B). */
export const setupVsComputer = (difficulty: AiDifficulty, length: MatchLength): MatchSetup => ({ seats: { A: 'human', B: 'ai' }, difficulty, length });

export interface MatchMode extends Mode {
  /** Who plays which team; call before entering (a rematch keeps it). */
  setSetup(setup: MatchSetup): void;
  /** Starts a fresh match with the same setup (the ⋯ sheet's "Restart match"). */
  restart(): void;
}

/** Pause between the last boule coming to rest and the end card (ms) when there is nothing to measure: time to see the scoring rings. */
const CARD_DELAY_MS = 900;

/** Boule bodies are named `${team}${n}` by the rules; the jack and practice balls stay neutral. */
const teamOf: TeamResolver = (b) => (b.kind === 'boule' ? (b.id.startsWith('B') ? 'B' : 'A') : null);

export function createMatchMode(ctx: AppContext, goMenu: () => void): MatchMode {
  const { cfg, scene, matchHud, app } = ctx;
  const playback = createPlayback(ctx);
  const preview = createAimPreviewer(ctx);

  let setup: MatchSetup = setup2p('standard');
  let state: MatchState = createMatch(1, matchConfig(cfg, setup.length));
  let world: World | null = null;
  /** A rejected jack: the rules drop it from the state, but it stays on screen until the next throw. */
  let ghostJack: Body | null = null;
  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  let measureTimer: ReturnType<typeof setTimeout> | undefined;
  /** The cards are up (so a language change re-words them). */
  let cardsUp = false;
  let active = false;
  /** Resting bodies before the throw in flight, to judge the shot once it settles. */
  let shotBefore: readonly Body[] = [];
  let lastTurn: TurnData | null = null;
  /** Throws made in this match (both seats): feeds the AI seed. */
  let throwCount = 0;
  const aiClient = createAiClient(() => cfg);

  const isVs = (): boolean => setup.seats.A !== setup.seats.B;
  const voice = () => (isVs() ? voiceVs() : voice2p());
  const isAiTurn = (): boolean => canThrow(state, thrower()) && setup.seats[thrower()] === 'ai';
  const isHumanTurn = (): boolean => canThrow(state, thrower()) && setup.seats[thrower()] === 'human';

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
    return { ...turnView(state, voice()), left: state.boulesLeft, total: state.rules.boulesPerTeam };
  }

  function announceTurn(): void {
    lastTurn = turnData();
    matchHud.announceTurn(lastTurn);
  }

  // ---- the computer's turn -----------------------------------------------------
  const ai = createAiTurn({
    request: () => {
      const req: AiRequest = { state, team: thrower(), difficulty: setup.difficulty, seed: state.seed * 1000 + throwCount };
      return aiClient.requestAiThrow(req);
    },
    onAim(d: AiDecision) {
      app.dataset['ai'] = 'aiming';
      if (lastTurn) {
        lastTurn = { ...lastTurn, chip: t('turn.computerPlays') };
        matchHud.setChip(lastTurn);
      }
      // Same dots arc + landing ring a human sees while aiming, from its intent without noise.
      preview.showIntent(d.intent, state.phase === 'jack' ? 'jack' : 'boule');
      if (d.plan === 'shoot') matchHud.setMessage(t('toast.shoots', { name: voice().name[thrower()] }), thrower());
    },
    onFire(d: AiDecision) {
      delete app.dataset['ai'];
      const shoots = d.plan === 'shoot';
      const team = thrower();
      doThrow(team, d.intent);
      if (shoots) matchHud.setMessage(t('toast.shoots', { name: voice().name[team] }), team);
    },
  });

  /** Starts the computer's turn if it is its move. */
  function maybeStartAi(): void {
    if (!isAiTurn()) return;
    app.dataset['ai'] = 'thinking'; // also a hook for tests / styling
    ai.start();
  }

  function clearMeasure(): void {
    clearTimeout(measureTimer);
    measureTimer = undefined;
    ctx.measure.hide();
  }

  function clearCards(): void {
    clearTimeout(cardTimer);
    cardTimer = undefined;
    cardsUp = false;
    clearMeasure();
    matchHud.showEndCard(null);
    matchHud.showMatchOver(null);
    app.classList.remove('is-endover');
  }

  /** (Re)words whichever card is up. */
  function renderCards(): void {
    const end = state.lastEnd;
    if (!end) return;
    const v = voice();
    if (state.phase === 'matchOver' && state.winner) {
      matchHud.showMatchOver({
        title: matchOverTitle(state.winner, state.score, v),
        detail: matchOverDetail(state.endNumber),
        team: state.winner,
        celebrate: setup.seats[state.winner] === 'human',
      });
    } else {
      matchHud.showEndCard({ ...endCardView(end, v), score: scoreLine(state.score, v) });
    }
  }

  function showResultCards(delayMs: number): void {
    const end = state.lastEnd;
    if (!end) return;
    const over = state.phase === 'matchOver';
    cardTimer = setTimeout(() => {
      app.classList.add('is-endover');
      ctx.refreshInput();
      if (over && state.winner) ctx.audio.chime(isVs() && setup.seats[state.winner] === 'ai' ? 'lose' : 'win');
      else if (end.winner) ctx.audio.chime('score');
      cardsUp = true;
      renderCards();
    }, delayMs);
  }

  /** Shows the measuring lines after `delayMs` (the camera needs a moment to reach the close-up). */
  function scheduleMeasure(delayMs: number): void {
    clearTimeout(measureTimer);
    measureTimer = setTimeout(() => showMeasure(), delayMs);
  }

  function showMeasure(): void {
    const targets = measureTargets(state, effectsConfig.measure.maxMeasured);
    if (targets.length === 0) return;
    scene.setResultLine(null, null); // the lines below replace the single ground line
    ctx.measure.show(targets.map((tg) => ({ team: tg.team, from: tg.from, to: tg.to, label: formatMeasure(tg.distance) })));
  }

  /** A contested end (both teams have a boule in play) is measured before the card. */
  const isContested = (): boolean => measureTargets(state, effectsConfig.measure.maxMeasured).length === 2 && state.lastEnd?.reason !== 'jackOut';

  /** Everything that follows a settle: message chip, turn banner, rings, cards. */
  function afterSettle(fault: JackFault | null): void {
    matchHud.setScore(state.score, state.phase === 'jack' || state.phase === 'boule' ? state.toThrow : null);
    scene.setCameraMode('rest');
    scene.setJackZone(state.phase === 'jack' ? zone() : null);

    if (state.phase === 'endOver' || state.phase === 'matchOver') {
      matchHud.setMessage(null, null);
      const end = state.lastEnd;
      scene.setScoringHighlight(end ? end.scoringIds : null, end ? end.winner : null);
      if (isContested()) {
        const m = effectsConfig.measure;
        scheduleMeasure(m.startMs);
        showResultCards(m.startMs + m.drawMs + m.holdMs);
      } else showResultCards(CARD_DELAY_MS);
      return;
    }
    const msg = settleMessage(state, fault, voice());
    matchHud.setMessage(msg ? msg.text : null, msg ? msg.team : null);
    // The point line (jack -> nearest boule) like in practice.
    const jack = state.bodies.find((b) => b.id === 'jack');
    const nearest = distances(state)[0];
    const nb = nearest ? state.bodies.find((b) => b.id === nearest.id) : undefined;
    scene.setResultLine(jack && nb ? jack.pos : null, jack && nb ? nb.pos : null);
    // A photo finish in the middle of an end is measured too.
    if (isTight(measureTargets(state, effectsConfig.measure.maxMeasured), effectsConfig.measure.tightGap)) scheduleMeasure(effectsConfig.measure.startMs);
    announceTurn();
    maybeStartAi();
  }

  /** Celebrates a good shot (sound, haptics, dust, a nudge of the view); a carreau is the big one. No words. */
  function celebrateShot(w: World): void {
    const thrownId = lastThrow()?.id;
    if (!thrownId || thrownId === 'jack') return;
    const shot = analyseShot(
      { thrownId, teamOf: (id) => state.throws.find((th) => th.id === id)?.team ?? null, events: playback.events(), before: shotBefore, after: w.bodies },
      effectsConfig.carreau,
    );
    if (shot.kind !== 'none') playShotEffects(ctx, shot.kind, shot.spot);
  }

  function onSettled(w: World): void {
    const wasJack = isJackThrow();
    const jackBody = w.bodies.find((b) => b.id === 'jack');
    celebrateShot(w);
    state = settle(state, w.bodies, cfg);
    world = null;
    playback.reset();
    let fault: JackFault | null = null;
    ghostJack = null;
    if (wasJack && state.phase === 'jack') {
      fault = jackFault(jackBody, state.rules, cfg);
      if (jackBody && jackBody.state !== 'out') ghostJack = { ...jackBody, pos: { ...jackBody.pos } };
    }
    afterSettle(fault);
    ctx.refreshInput();
  }

  function start(): void {
    ai.cancel();
    delete app.dataset['ai'];
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
    maybeStartAi();
  }

  function newMatch(): void {
    matchHud.reset();
    matchHud.setNames(voice().name);
    throwCount = 0;
    // Rules are snapshotted into the state; the live tuning config is not touched.
    state = createMatch(ctx.newSeed(), matchConfig(cfg, setup.length));
    matchHud.setTarget(state.rules.pointsToWin);
    start();
  }

  /** Applies a throw through the match rules, whoever decided it (gesture or computer). */
  function doThrow(team: TeamId, intent: ThrowIntent): void {
    if (!canThrow(state, team)) return;
    throwCount++;
    clearMeasure();
    shotBefore = state.bodies;
    const r = beginMatchThrow(state, team, intent, cfg);
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
  }

  matchHud.onNextEnd(() => {
    if (state.phase !== 'endOver') return;
    state = nextEnd(state);
    start();
  });
  matchHud.onRematch(newMatch);
  matchHud.onMenu(goMenu);

  // A language change re-words what was built from state: names, turn line, cards, measuring labels.
  onLangChange(() => {
    if (!active) return;
    matchHud.setNames(voice().name);
    matchHud.setScore(state.score, state.phase === 'jack' || state.phase === 'boule' ? state.toThrow : null);
    matchHud.setTarget(state.rules.pointsToWin);
    if (state.phase === 'jack' || state.phase === 'boule') {
      lastTurn = turnData();
      matchHud.setChip(lastTurn);
    }
    if (cardsUp) renderCards();
    if (ctx.measure.isShown()) {
      const targets = measureTargets(state, effectsConfig.measure.maxMeasured);
      ctx.measure.relabel(targets.map((tg) => formatMeasure(tg.distance)));
    }
  });

  return {
    setSetup(next) {
      setup = next;
    },
    restart: newMatch,
    enter() {
      active = true;
      ctx.hud.setMode('match');
      ctx.hud.showEndCard(null);
      matchHud.show();
      newMatch();
    },
    exit() {
      active = false;
      ai.cancel();
      delete app.dataset['ai'];
      aiClient.dispose();
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
    canAim: isHumanTurn,
    inProgress: () => state.phase !== 'matchOver' && (state.endNumber > 1 || state.throws.length > 0 || state.score.A + state.score.B > 0),
    onPreview(p: AimPreview | null) {
      const ball = isHumanTurn() ? (state.phase === 'jack' ? 'jack' : 'boule') : null;
      preview.update(p, ball);
    },
    onThrow(intent: ThrowIntent) {
      if (!isHumanTurn()) return;
      ctx.noteThrow();
      doThrow(thrower(), intent);
    },
    frame(dtReal) {
      ai.tick(dtReal, ctx.uiBlocked());
      if (world && state.phase === 'inFlight' && playback.advance(world, dtReal)) onSettled(world);
      const bodies = world ? world.bodies : ghostJack ? [...state.bodies, ghostJack] : state.bodies;
      scene.syncBodies(bodies, lastThrow()?.id ?? null, teamOf);
    },
  };
}

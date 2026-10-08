/**
 * Local match mode: input -> games/petanque/match rules (reducer style) ->
 * engine playback (matchCore.ts presents it). Each team is a seat controlled by
 * a human on this phone (usual gestures) or the computer (aiTurn.ts: think ->
 * show aim -> throw). Pass-and-play is two human seats; "vs computer" is
 * Blue = human, Red = computer. When the world settles its resting bodies go
 * back to the rules.
 */
import { beginMatchThrow, canThrow, createMatch, nextEnd, settle, type TeamId } from '../games/petanque';
import type { AiDecision, AiDifficulty, AiRequest } from '../games/petanque/aiTypes';
import type { AimPreview, ThrowIntent } from '../input';
import { t } from '../i18n';
import { track } from './analytics';
import { createAiClient } from './aiClient';
import { createAiTurn } from './aiTurn';
import type { AppContext, Mode } from './context';
import type { MatchCore, MatchDriver } from './matchCore';
import { voice2p, voiceVs } from './matchText';
import { matchConfig, type MatchLength } from './matchLength';

/** Who plays a team in a local match. (Online seats: see onlineMatch.ts.) */
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

export function createMatchMode(ctx: AppContext, core: MatchCore, goMenu: () => void): MatchMode {
  const { cfg, app } = ctx;

  let setup: MatchSetup = setup2p('standard');
  /** Throws made in this match (both seats): feeds the AI seed. */
  let throwCount = 0;
  const aiClient = createAiClient(() => cfg);

  const state = () => core.state();
  const thrower = (): TeamId => state().toThrow;
  const isVs = (): boolean => setup.seats.A !== setup.seats.B;
  const voice = () => (isVs() ? voiceVs() : voice2p());
  const isAiTurn = (): boolean => canThrow(state(), thrower()) && setup.seats[thrower()] === 'ai';
  const isHumanTurn = (): boolean => canThrow(state(), thrower()) && setup.seats[thrower()] === 'human';

  // ---- the computer's turn -----------------------------------------------------
  const ai = createAiTurn({
    request: () => {
      const s = state();
      const req: AiRequest = { state: s, team: thrower(), difficulty: setup.difficulty, seed: s.seed * 1000 + throwCount };
      return aiClient.requestAiThrow(req);
    },
    onAim(d: AiDecision) {
      app.dataset['ai'] = 'aiming';
      core.clearMeasure();
      core.setChip(t('turn.computerPlays'));
      // Same dots arc + landing ring a human sees while aiming, from its intent without noise.
      core.preview.showIntent(d.intent, state().phase === 'jack' ? 'jack' : 'boule');
      if (d.plan === 'shoot') ctx.matchHud.setMessage(t('toast.shoots', { name: voice().name[thrower()] }), thrower());
    },
    onFire(d: AiDecision) {
      delete app.dataset['ai'];
      const team = thrower();
      doThrow(team, d.intent);
      if (d.plan === 'shoot') ctx.matchHud.setMessage(t('toast.shoots', { name: voice().name[team] }), team);
    },
  });

  function stopAi(): void {
    ai.cancel();
    delete app.dataset['ai'];
  }

  /** Applies a throw through the match rules, whoever decided it (gesture or computer). */
  function doThrow(team: TeamId, intent: ThrowIntent): void {
    const before = state();
    if (!canThrow(before, team)) return;
    throwCount++;
    const r = beginMatchThrow(before, team, intent, cfg);
    core.play(r.state, r.world, (w) => settle(r.state, w.bodies, cfg));
  }

  function newMatch(): void {
    stopAi();
    throwCount = 0;
    // Rules are snapshotted into the state; the live tuning config is not touched.
    core.show(createMatch(ctx.newSeed(), matchConfig(cfg, setup.length)), true);
  }

  const driver: MatchDriver = {
    voice,
    cfg: () => cfg,
    onTurn() {
      if (!isAiTurn()) return;
      app.dataset['ai'] = 'thinking'; // also a hook for tests / styling
      ai.start();
    },
    onMatchOver: () => track(isVs() ? 'match-finished-vs-computer' : 'match-finished-two-players'),
    nextEnd() {
      if (state().phase !== 'endOver') return;
      stopAi();
      core.show(nextEnd(state()), false);
    },
    rematch: newMatch,
    menu: goMenu,
  };

  return {
    setSetup(next) {
      setup = next;
    },
    restart: newMatch,
    enter() {
      core.attach(driver);
      newMatch();
    },
    exit() {
      stopAi();
      aiClient.dispose();
      core.detach();
    },
    canAim: isHumanTurn,
    inProgress: () => core.inProgress(),
    onPreview(p: AimPreview | null) {
      core.onPreview(p, isHumanTurn());
    },
    onThrow(intent: ThrowIntent) {
      if (!isHumanTurn()) return;
      ctx.noteThrow();
      doThrow(thrower(), intent);
    },
    frame(dtReal) {
      ai.tick(dtReal, ctx.uiBlocked());
      core.frame(dtReal);
    },
  };
}

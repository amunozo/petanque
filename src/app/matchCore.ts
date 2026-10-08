/**
 * Match presentation shared by every kind of match (two players on one phone,
 * vs computer, online): plays a throw back, then everything that follows a
 * settle (toast, turn banner, scoring rings, measuring, end / match-over
 * cards, the carreau celebration). It never decides the rules' next state:
 * the active *driver* does (matchMode.ts locally with the reducer,
 * onlineMatch.ts from the server's results) and also says who controls each
 * seat (who may aim, when the computer thinks).
 */
import type { Body, World } from '../engine';
import { analyseShot, createMatch, distances, type MatchState, type TeamId } from '../games/petanque';
import type { AimPreview } from '../input';
import { onLangChange } from '../i18n';
import type { JackZoneView, TeamResolver } from '../render';
import type { GameConfig } from '../tuning';
import { createAimPreviewer, type AimPreviewer } from './aimPreview';
import type { AppContext } from './context';
import { effectsConfig } from './effectsConfig';
import type { TurnData } from './matchHud';
import { celebrates, endCardView, jackFault, matchOverDetail, matchOverTitle, scoreLine, settleMessage, turnView, voice2p, type JackFault, type Voice } from './matchText';
import { formatMeasure, isTight, measureTargets } from './measureLines';
import { createPlayback } from './playback';
import { playShotEffects } from './shotEffects';

/** What a kind of match plugs into the core. */
export interface MatchDriver {
  /** How the UI names the teams. */
  voice(): Voice;
  /** Rules + physics config: the live tuning for local matches, the defaults online. */
  cfg(): GameConfig;
  /** A turn is up (after a settle, or at the start of an end / match): e.g. the computer starts thinking. */
  onTurn(): void;
  /** The match was just decided (not when an already finished one is shown again). */
  onMatchOver?(): void;
  /** Card buttons. */
  nextEnd(): void;
  rematch(): void;
  menu(): void;
}

export interface MatchCore {
  /** Hands the match HUD and the view to `driver` (when a match mode is entered). */
  attach(driver: MatchDriver): void;
  /** Clears everything the core put on screen (when the mode is left). */
  detach(): void;
  /** The state on screen. */
  state(): MatchState;
  /**
   * Shows `state` without animation: the start of a turn / end / match, or a
   * finished end with its cards. `fresh` = a new match (resets the score bar).
   */
  show(state: MatchState, fresh: boolean): void;
  /**
   * Plays a throw back: `inFlight` is the state with the throw recorded, `world`
   * its launch. Once the world rests, `resolve(world)` gives the settled state
   * (online it first snaps `world.bodies` to the server's).
   */
  play(inFlight: MatchState, world: World, resolve: (w: World) => MatchState): void;
  /** A throw's outcome without animation (online, after a missed step): `bodies` = the resting bodies before the rules. */
  land(thrownId: string, bodies: readonly Body[], next: MatchState): void;
  /** A throw is in flight, or the end's result is still being presented (cards not up yet / up only briefly). */
  busy(): boolean;
  /** Replaces the turn line's text (e.g. "Computer plays"). */
  setChip(text: string): void;
  /** Puts the turn line back to the state's own wording (undoes setChip). */
  refreshChip(): void;
  clearMeasure(): void;
  readonly preview: AimPreviewer;
  /** Gesture preview: shown only when `canAim`. */
  onPreview(p: AimPreview | null, canAim: boolean): void;
  inProgress(): boolean;
  frame(dtReal: number): void;
}

/** Pause between the last boule coming to rest and the end card (ms) when there is nothing to measure: time to see the scoring rings. */
const CARD_DELAY_MS = 900;
/** Online: a card stays at least this long before the other player's "next end" replaces it (ms). */
const MIN_CARD_MS = 1500;

/** Boule bodies are named `${team}${n}` by the rules; the jack and practice balls stay neutral. */
const teamOf: TeamResolver = (b) => (b.kind === 'boule' ? (b.id.startsWith('B') ? 'B' : 'A') : null);

const IDLE: MatchDriver = {
  voice: voice2p,
  cfg: () => {
    throw new Error('match core: no driver attached');
  },
  onTurn: () => undefined,
  nextEnd: () => undefined,
  rematch: () => undefined,
  menu: () => undefined,
};

export function createMatchCore(ctx: AppContext): MatchCore {
  const { scene, matchHud, app } = ctx;
  let driver: MatchDriver = IDLE;
  const cfg = (): GameConfig => (driver === IDLE ? ctx.cfg : driver.cfg());
  const playback = createPlayback(ctx, cfg);
  const preview = createAimPreviewer(ctx, cfg);

  let state: MatchState = createMatch(1, ctx.cfg);
  let world: World | null = null;
  let resolveFn: ((w: World) => MatchState) | null = null;
  /** A rejected jack: the rules drop it from the state, but it stays on screen until the next throw. */
  let ghostJack: Body | null = null;
  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  let measureTimer: ReturnType<typeof setTimeout> | undefined;
  /** The cards are up (so a language change re-words them), and since when. */
  let cardsUp = false;
  let cardsAt = 0;
  /** Resting bodies before the throw in flight, to judge the shot once it settles. */
  let shotBefore: readonly Body[] = [];
  let lastTurn: TurnData | null = null;

  const voice = (): Voice => driver.voice();
  const lastThrow = (s: MatchState = state) => s.throws[s.throws.length - 1];
  const turnActive = (): TeamId | null => (state.phase === 'jack' || state.phase === 'boule' ? state.toThrow : null);

  function zone(): JackZoneView {
    const c = cfg();
    const { originX, originZ } = c.throw;
    const { minX, maxX } = c.physics.arena;
    return {
      originX,
      originZ,
      minDist: state.rules.jackMinDist,
      maxDist: state.rules.jackMaxDist,
      xMin: minX + state.rules.jackMinSideMargin,
      xMax: maxX - state.rules.jackMinSideMargin,
    };
  }

  const turnData = (): TurnData => ({ ...turnView(state, voice()), left: state.boulesLeft, total: state.rules.boulesPerTeam });

  function announceTurn(): void {
    lastTurn = turnData();
    matchHud.announceTurn(lastTurn);
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
        celebrate: celebrates(state.winner, v),
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
      cardTimer = undefined;
      app.classList.add('is-endover');
      ctx.refreshInput();
      if (over && state.winner) ctx.audio.chime(celebrates(state.winner, voice()) ? 'win' : 'lose');
      else if (end.winner) ctx.audio.chime('score');
      cardsUp = true;
      cardsAt = performance.now();
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
    matchHud.setScore(state.score, turnActive());
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
    driver.onTurn();
  }

  /** Celebrates a good shot (sound, haptics, dust, a nudge of the view); a carreau is the big one. No words. */
  function celebrateShot(thrown: MatchState, after: readonly Body[]): void {
    const thrownId = lastThrow(thrown)?.id;
    if (!thrownId || thrownId === 'jack') return;
    const shot = analyseShot(
      { thrownId, teamOf: (id) => thrown.throws.find((th) => th.id === id)?.team ?? null, events: playback.events(), before: shotBefore, after },
      effectsConfig.carreau,
    );
    if (shot.kind !== 'none') playShotEffects(ctx, shot.kind, shot.spot);
  }

  /** The view as a throw starts (or lands without animation). */
  function clearThrowView(): void {
    clearMeasure();
    ghostJack = null;
    playback.reset();
    matchHud.setMessage(null, null);
    ctx.hud.setPower(null);
    scene.setAimPreview(null);
    scene.setResultLine(null, null);
  }

  function land(thrownId: string, bodies: readonly Body[], next: MatchState): void {
    const jackBody = bodies.find((b) => b.id === 'jack');
    const decided = state.phase !== 'matchOver' && next.phase === 'matchOver';
    state = next;
    world = null;
    resolveFn = null;
    playback.reset();
    let fault: JackFault | null = null;
    ghostJack = null;
    if (thrownId === 'jack' && state.phase === 'jack') {
      fault = jackFault(jackBody, state.rules, cfg());
      if (jackBody && jackBody.state !== 'out') ghostJack = { ...jackBody, pos: { ...jackBody.pos } };
    }
    afterSettle(fault);
    ctx.refreshInput();
    if (decided) driver.onMatchOver?.();
  }

  function onSettled(w: World): void {
    const thrown = state;
    const next = resolveFn ? resolveFn(w) : state;
    celebrateShot(thrown, w.bodies);
    land(lastThrow(thrown)?.id ?? '', w.bodies, next);
  }

  function show(next: MatchState, fresh: boolean): void {
    if (fresh) {
      matchHud.reset();
      matchHud.setNames(voice().name);
      matchHud.setTarget(next.rules.pointsToWin);
    }
    state = next;
    clearCards();
    clearThrowView();
    world = null;
    resolveFn = null;
    scene.setScoringHighlight(null, null);
    scene.setCameraMode('aim');
    scene.setJackZone(state.phase === 'jack' ? zone() : null);
    if (state.phase === 'endOver' || state.phase === 'matchOver') {
      afterSettle(null);
      ctx.refreshInput();
      return;
    }
    matchHud.setScore(state.score, turnActive());
    announceTurn();
    ctx.refreshInput();
    driver.onTurn();
  }

  matchHud.onNextEnd(() => driver.nextEnd());
  matchHud.onRematch(() => driver.rematch());
  matchHud.onMenu(() => driver.menu());

  function refreshChip(): void {
    if (!turnActive()) return;
    lastTurn = turnData();
    matchHud.setChip(lastTurn);
  }

  // A language change re-words what was built from state: names, turn line, cards, measuring labels.
  onLangChange(() => {
    if (driver === IDLE) return;
    matchHud.setNames(voice().name);
    matchHud.setScore(state.score, turnActive());
    matchHud.setTarget(state.rules.pointsToWin);
    refreshChip();
    if (cardsUp) renderCards();
    if (ctx.measure.isShown()) {
      const targets = measureTargets(state, effectsConfig.measure.maxMeasured);
      ctx.measure.relabel(targets.map((tg) => formatMeasure(tg.distance)));
    }
  });

  return {
    attach(d) {
      driver = d;
      ctx.hud.setMode('match');
      ctx.hud.showEndCard(null);
      matchHud.show();
    },
    detach() {
      clearCards();
      world = null;
      resolveFn = null;
      ghostJack = null;
      playback.reset();
      scene.setJackZone(null);
      scene.setScoringHighlight(null, null);
      scene.setResultLine(null, null);
      scene.setAimPreview(null);
      ctx.hud.setPower(null);
      matchHud.reset();
      matchHud.setNotice(null);
      matchHud.hide();
      driver = IDLE;
    },
    state: () => state,
    show,
    play(inFlight, w, resolve) {
      shotBefore = state.bodies;
      clearThrowView();
      state = inFlight;
      world = w;
      resolveFn = resolve;
      if (lastTurn) matchHud.setChip({ ...lastTurn, left: state.boulesLeft });
      scene.setCameraMode('flight');
      ctx.refreshInput();
    },
    land(thrownId, bodies, next) {
      clearThrowView();
      land(thrownId, bodies, next);
    },
    busy: () => world !== null || cardTimer !== undefined || (cardsUp && performance.now() - cardsAt < MIN_CARD_MS),
    setChip(text) {
      if (!lastTurn) return;
      lastTurn = { ...lastTurn, chip: text };
      matchHud.setChip(lastTurn);
    },
    refreshChip,
    clearMeasure,
    preview,
    onPreview(p, canAim) {
      if (p) clearMeasure(); // never leave measuring labels over the aim view
      preview.update(p, canAim ? (state.phase === 'jack' ? 'jack' : 'boule') : null);
    },
    inProgress: () => state.phase !== 'matchOver' && (state.endNumber > 1 || state.throws.length > 0 || state.score.A + state.score.B > 0),
    frame(dtReal) {
      if (world && state.phase === 'inFlight' && playback.advance(world, dtReal)) onSettled(world);
      const bodies = world ? world.bodies : ghostJack ? [...state.bodies, ghostJack] : state.bodies;
      scene.syncBodies(bodies, lastThrow()?.id ?? null, teamOf);
    },
  };
}

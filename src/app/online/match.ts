/**
 * Online match mode: the server referees, this device presents. Seats: this
 * device's seat is a local human (usual gestures, only on its own turn), the
 * other seat is remote ("<Name> is aiming…"). A throw is sent as an intent; the
 * server's `throwResult` is played back from the state before it with the
 * DEFAULT config (net/replay.ts), then snapped to the server's resting bodies
 * and match state, and matchCore.ts shows the usual result (toasts, cards,
 * measuring, celebration). Server steps queue up and are shown one at a time,
 * so a slow device never skips an animation it can still play.
 */
import { beginMatchThrow, type MatchState } from '../../games/petanque';
import type { ThrowRecord } from '../../games/petanque/matchTypes';
import type { AimPreview, ThrowIntent } from '../../input';
import { onLangChange, t } from '../../i18n';
import { replayThrowWorld, type NetClient, type NetEvents, type RoomSnapshot, type Seat } from '../../net';
import type { Body } from '../../engine';
import { defaultConfig } from '../../tuning';
import { track } from '../analytics';
import type { AppContext, Mode } from '../context';
import { button, el, shieldPointer } from '../dom';
import type { MatchCore, MatchDriver } from '../matchCore';
import { voiceOnline } from '../matchText';
import { canAimOnline, connectionNotice, opponentsTurn, otherSeat, seatNames, throwAction } from './rules';

type Step =
  | { kind: 'throw'; ev: NetEvents['throwResult'] }
  /** endStarted (`fresh` false) or matchStarted (`fresh` true). */
  | { kind: 'state'; seq: number; match: MatchState; fresh: boolean }
  /** (Re)connected: the room as the server has it now. */
  | { kind: 'sync'; room: RoomSnapshot };

export interface OnlineMatchHooks {
  /** Tell the server we leave and forget the room (stays on screen; the caller goes to the menu). */
  leave(): void;
  /** Leave and go back to the menu (match-over / opponent-left "Menu" buttons). */
  quit(): void;
}

export interface OnlineMatch extends Mode {
  /** Text of the "Leave the match?" dialog. */
  leaveText(): string;
  leave(): void;
}

export function createOnlineMatch(ctx: AppContext, core: MatchCore, client: NetClient, hooks: OnlineMatchHooks): OnlineMatch {
  const { matchHud, app } = ctx;
  let queue: Step[] = [];
  /** Room revision on screen. */
  let shownSeq = 0;
  /** Our throw was sent; waiting for its result. */
  let pending = false;
  let rematchVoted = false;
  let offs: (() => void)[] = [];
  /** The turn line says "<Name> left the match" instead of "<Name> is aiming…". */
  let chipSaysLeft = false;
  let active = false;

  const mine = (): Seat => client.seat ?? 'A';
  const theirs = (): Seat => otherSeat(mine());
  const names = (): Record<Seat, string> => seatNames(client.room?.players, () => t('online.opponent'));
  const opponentName = (): string => names()[theirs()];
  const opponent = () => client.room?.players[theirs()] ?? null;
  const opponentLeft = (): boolean => opponent()?.left === true;

  // ---- "<Name> left the match" card -------------------------------------------------
  const leftCard = el('div', 'mh-card ol-left');
  leftCard.hidden = true;
  const leftTitle = el('div', 'mh-card-title');
  const leftMenu = button('mh-btn mh-primary', '', () => hooks.quit());
  leftCard.append(leftTitle, leftMenu);
  shieldPointer(leftCard);
  app.append(leftCard);

  function paintRematch(): void {
    const room = client.room;
    if (!room || room.phase !== 'matchOver' || core.state().phase !== 'matchOver') return;
    const name = opponentName();
    const votedHere = rematchVoted || room.rematch[mine()];
    if (opponentLeft()) matchHud.setRematchWaiting(t('net.opponentLeft', { name }));
    else if (votedHere) matchHud.setRematchWaiting(t('over.rematchWaiting', { name }));
    else matchHud.setRematchWaiting(null);
    // Stays on the card (a toast would be gone before a player who looked away sees it).
    matchHud.setRematchHint(!opponentLeft() && !votedHere && room.rematch[theirs()] ? t('over.rematchAsked', { name }) : null);
  }

  /** Connection notice, the opponent-left card, the rematch button. */
  function paint(): void {
    if (!active) return;
    const name = opponentName();
    const n = connectionNotice(client.status, opponent());
    matchHud.setNotice(n === 'reconnecting' ? t('net.reconnecting') : n === 'opponentLost' ? t('net.opponentLost', { name }) : null);
    leftCard.hidden = !(n === 'opponentLeft' && client.room?.phase === 'playing');
    app.classList.toggle('is-opponent-left', !leftCard.hidden); // the card replaces the end card
    leftTitle.textContent = t('net.opponentLeft', { name });
    // Never "<Name> is aiming…" for someone who left (nor after they come back).
    if (!leftCard.hidden) core.setChip(leftTitle.textContent);
    else if (chipSaysLeft) core.refreshChip();
    chipSaysLeft = !leftCard.hidden;
    leftMenu.textContent = t('over.menu');
    paintRematch();
    ctx.refreshInput();
  }

  /** Plays a refereed throw back from `before`; false when it cannot be rebuilt (then the caller snaps). */
  function animate(before: MatchState, record: ThrowRecord, rest: Body[], match: MatchState): boolean {
    const world = replayThrowWorld(before, record, defaultConfig);
    if (!world) return false;
    let inFlight: MatchState;
    try {
      inFlight = beginMatchThrow(before, record.team, record.intent, defaultConfig).state;
    } catch {
      return false;
    }
    inFlight = { ...inFlight, throws: [...inFlight.throws.slice(0, -1), record] };
    core.play(inFlight, world, (w) => {
      // Float results may differ a hair across devices: the server's bodies are the truth.
      w.bodies = structuredClone(rest);
      return match;
    });
    return true;
  }

  function run(step: Step): void {
    switch (step.kind) {
      case 'throw': {
        const { seq, record, rest, match, before } = step.ev;
        const action = throwAction(seq, shownSeq, before !== null);
        if (action === 'skip') return;
        shownSeq = seq;
        if (action === 'animate' && before && animate(before, record, rest, match)) return;
        core.land(record.id, rest, match);
        return;
      }
      case 'state':
        if (step.seq <= shownSeq) return;
        shownSeq = step.seq;
        if (step.fresh) {
          rematchVoted = false;
        }
        core.show(step.match, step.fresh);
        return;
      case 'sync': {
        const room = step.room;
        if (!room.match || room.seq === shownSeq) {
          matchHud.setNames(names());
          return;
        }
        shownSeq = room.seq;
        core.show(room.match, true);
        return;
      }
    }
  }

  /** Marks whose turn it is on the page: 'you' when this device may aim, 'remote' while the opponent aims (their mark pulses). Also a hook for tests. */
  function paintTurn(): void {
    const s = core.state();
    const remote = (s.phase === 'jack' || s.phase === 'boule') && s.toThrow === theirs() && !core.busy() && !opponentLeft();
    const turn = canAim() ? 'you' : remote ? 'remote' : null;
    if (turn) app.dataset['turn'] = turn;
    else delete app.dataset['turn'];
    // No loft picker while the other player has the turn (it would look like ours).
    app.classList.toggle('is-their-turn', active && opponentsTurn(s, client.seat));
  }

  const driver: MatchDriver = {
    voice: () => voiceOnline(names(), mine()),
    // The server's config: tuning never changes an online match.
    cfg: () => defaultConfig,
    onTurn: () => ctx.refreshInput(),
    onMatchOver: () => track('match-finished-online'),
    nextEnd() {
      client.sendNextEnd();
    },
    rematch() {
      if (!client.sendRematch()) return;
      rematchVoted = true;
      paintRematch();
    },
    menu: () => hooks.quit(),
  };

  function subscribe(): void {
    offs = [
      client.on('throwResult', (ev) => {
        if (ev.record.team === client.seat) pending = false;
        queue.push({ kind: 'throw', ev });
      }),
      client.on('endStarted', (ev) => queue.push({ kind: 'state', seq: ev.seq, match: ev.match, fresh: false })),
      client.on('matchStarted', (ev) => {
        if (ev.room.match) queue.push({ kind: 'state', seq: ev.room.seq, match: ev.room.match, fresh: true });
      }),
      client.on('welcome', (ev) => {
        pending = false;
        queue.push({ kind: 'sync', room: ev.room });
        paint();
      }),
      client.on('roomState', paint),
      client.on('opponentConnection', paint),
      client.on('status', paint),
      client.on('error', (ev) => {
        if (ev.fatal) return; // online/flow.ts handles fatal errors
        pending = false;
        ctx.refreshInput();
      }),
    ];
  }

  const canAim = (): boolean =>
    active &&
    canAimOnline({
      status: client.status,
      seat: client.seat,
      roomSeq: client.room?.seq ?? null,
      shownSeq,
      state: core.state(),
      pending,
      queued: queue.length,
      busy: core.busy(),
      opponentLeft: opponentLeft(),
    });

  onLangChange(paint);

  return {
    enter() {
      active = true;
      queue = [];
      pending = false;
      rematchVoted = false;
      chipSaysLeft = false;
      core.attach(driver);
      subscribe();
      const room = client.room;
      shownSeq = room?.seq ?? 0;
      if (room?.match) core.show(room.match, true);
      paint();
    },
    exit() {
      active = false;
      for (const off of offs) off();
      offs = [];
      queue = [];
      leftCard.hidden = true;
      app.classList.remove('is-opponent-left');
      delete app.dataset['turn'];
      app.classList.remove('is-their-turn');
      core.detach();
    },
    canAim,
    inProgress: () => client.room?.phase === 'playing' && !opponentLeft(),
    leaveText: () => t('confirm.online.text', { name: opponentName() }),
    leave: () => hooks.leave(),
    onPreview(p: AimPreview | null) {
      core.onPreview(p, canAim());
    },
    onThrow(intent: ThrowIntent) {
      if (!canAim() || !client.sendThrow(intent)) return;
      pending = true;
      ctx.noteThrow();
      core.onPreview(null, false);
      ctx.refreshInput();
    },
    frame(dtReal) {
      core.frame(dtReal);
      const step = !core.busy() ? queue.shift() : undefined;
      if (step) {
        run(step);
        paint();
      }
      paintTurn();
    },
  };
}

/**
 * Online "play a friend" flow: menu entry -> sheet -> create / join a room ->
 * lobby -> online match (online/match.ts); invite links (`?room=CODE`), rejoin
 * after the app was closed, and the friendly messages for every failure
 * (offline, server unreachable, room gone / full, version mismatch, opened
 * elsewhere). Owns the NetClient.
 */
import { pointsFor } from '../../games/petanque';
import { t, type MessageKey } from '../../i18n';
import { CLOSE_CODES, createNetClient, inviteLink, ROOM_PARAM, roomCodeFromSearch, type ErrorCode, type RoomSnapshot } from '../../net';
import { defaultConfig } from '../../tuning';
import type { AppContext, Mode } from '../context';
import type { MatchCore } from '../matchCore';
import type { MatchLength } from '../matchLength';
import { noticeDialog, type LengthPoints, type Menu } from '../menu';
import { createOnlineMatch, type OnlineMatch } from './match';
import { otherSeat, rejoinDecision, stripRoomParam } from './rules';
import { createLobby, createOnlineSheet } from './screens';
import { clearActiveRoom, loadActiveRoom, saveActiveRoom, saveNickname } from './storage';

export interface OnlineFlowDeps {
  ctx: AppContext;
  core: MatchCore;
  menu: Menu;
  points: LengthPoints;
  serverUrl: string;
  /** Invite links point at the live site, or (developer mode) at this page. */
  inviteBase: string;
  /** The online beta switch is on here: invite links carry `online=1` so the friend gets the online UI too. */
  inviteOnline: boolean;
  enterMode(mode: Mode): void;
  goMenu(): void;
  /** versionMismatch: start the PWA update (apply a waiting version, or look for one). */
  update(): void;
}

export interface OnlineFlow {
  readonly mode: OnlineMatch;
  /** The sheet, the lobby or a message is up (the game ignores gestures meanwhile). */
  isOpen(): boolean;
  /** Start-up: an invite link (`?room=`) opens the join sheet; otherwise maybe offer "Rejoin". */
  start(): void;
}

type NoticeKind = 'offline' | 'server' | 'notFound' | 'full' | 'version' | 'replaced' | 'error';
const NOTICE = {
  offline: ['notice.offline.title', 'notice.offline.text'],
  server: ['notice.server.title', 'notice.server.text'],
  notFound: ['notice.notFound.title', 'notice.notFound.text'],
  full: ['notice.full.title', 'notice.full.text'],
  version: ['notice.version.title', 'notice.version.text'],
  replaced: ['notice.replaced.title', 'notice.replaced.text'],
  error: ['notice.error.title', 'notice.error.text'],
} as const satisfies Record<NoticeKind, readonly [MessageKey, MessageKey]>;
const ERROR_NOTICE: Partial<Record<ErrorCode, NoticeKind>> = { roomNotFound: 'notFound', roomExpired: 'notFound', roomFull: 'full', versionMismatch: 'version' };

const LENGTH_KEY = { quick: 'length.quick', standard: 'length.standard' } as const satisfies Record<MatchLength, MessageKey>;
/** Points to win online: the server's (default) config, never the tuning. */
const onlinePoints = (length: MatchLength): number => pointsFor(length, defaultConfig);
const offline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

export function createOnlineFlow(d: OnlineFlowDeps): OnlineFlow {
  const { app } = d.ctx;
  const client = createNetClient({ serverUrl: d.serverUrl });
  const sheet = createOnlineSheet(app, d.points);
  const lobby = createLobby(app);
  let stage: 'idle' | 'connecting' | 'lobby' | 'match' = 'idle';
  let noticeUp = false;

  const mode = createOnlineMatch(d.ctx, d.core, client, {
    leave,
    quit() {
      leave();
      d.goMenu();
    },
  });

  async function notice(kind: NoticeKind): Promise<void> {
    const [title, text] = NOTICE[kind];
    noticeUp = true;
    d.ctx.refreshInput();
    const action = await noticeDialog(app, {
      title: t(title),
      text: t(text),
      okLabel: t('notice.ok'),
      ...(kind === 'version' ? { actionLabel: t('notice.version.action') } : {}),
    });
    noticeUp = false;
    d.ctx.refreshInput();
    if (action) d.update();
  }

  /** Back to the menu with a message; the room is kept unless the caller forgot it. */
  function fail(kind: NoticeKind): void {
    client.disconnect();
    stage = 'idle';
    lobby.hide();
    d.goMenu();
    void notice(kind);
    void checkRejoin();
  }

  function leave(): void {
    client.leave();
    clearActiveRoom();
    stage = 'idle';
    lobby.hide();
    d.menu.setRejoin(null);
  }

  function enterMatch(): void {
    stage = 'match';
    lobby.hide();
    d.menu.setRejoin(null);
    d.enterMode(mode);
  }

  /** Keeps the other player's nickname with the saved room (for "Rejoin your match vs …"). */
  function rememberOpponent(room: RoomSnapshot): void {
    const active = loadActiveRoom();
    const seat = client.seat;
    const opponent = seat ? room.players[otherSeat(seat)]?.nickname : undefined;
    if (active && active.code === room.code && opponent && opponent !== active.opponent) saveActiveRoom({ ...active, opponent });
  }

  function join(code: string, nickname: string): void {
    saveNickname(nickname);
    const active = loadActiveRoom();
    saveActiveRoom({ code, nickname, opponent: active?.code === code ? active.opponent : null });
    stage = 'connecting';
    lobby.showConnecting();
    client.connect(code, nickname);
  }

  async function host(nickname: string, length: MatchLength): Promise<void> {
    saveNickname(nickname);
    if (offline()) return notice('offline');
    stage = 'connecting';
    lobby.showConnecting();
    let code: string;
    try {
      code = await client.createRoom(length);
    } catch {
      if (stage === 'connecting') fail(offline() ? 'offline' : 'server');
      return;
    }
    if (stage !== 'connecting') return; // cancelled meanwhile
    saveActiveRoom({ code, nickname, opponent: null });
    client.connect(code, nickname);
  }

  /** An invite (link or typed code): check the room, then the nickname sheet (unless `nickname` is known). */
  async function openInvite(code: string, nickname?: string): Promise<void> {
    if (offline()) return notice('offline');
    let info;
    try {
      info = await client.roomInfo(code);
    } catch {
      return notice(offline() ? 'offline' : 'server');
    }
    if (!info) {
      if (loadActiveRoom()?.code === code) clearActiveRoom();
      return notice('notFound');
    }
    const active = loadActiveRoom();
    if (active?.code === info.code) return join(info.code, active.nickname); // our own match: rejoin
    if (info.phase !== 'lobby') return notice('full');
    if (nickname) return join(info.code, nickname);
    const r = await sheet.open({ code: info.code, points: onlinePoints(info.length) });
    if (r) join(info.code, r.nickname);
  }

  async function openSheet(): Promise<void> {
    const r = await sheet.open(null);
    if (d.menu.isOpen()) d.menu.show(); // repaints the menu's length choice (shared with the sheet)
    if (!r) return;
    if (r.kind === 'host') await host(r.nickname, r.length);
    else await openInvite(r.code, r.nickname);
  }

  async function checkRejoin(): Promise<void> {
    const active = loadActiveRoom();
    if (!active) return d.menu.setRejoin(null);
    let info: Awaited<ReturnType<typeof client.roomInfo>> | 'unreachable';
    try {
      info = await client.roomInfo(active.code);
    } catch {
      info = 'unreachable';
    }
    const decision = rejoinDecision(active, info);
    if (decision === 'forget') clearActiveRoom();
    if (decision !== 'offer' || stage !== 'idle' || info === 'unreachable' || !info) return;
    d.menu.setRejoin({ code: active.code, opponent: info.phase === 'lobby' ? null : active.opponent });
  }

  async function share(): Promise<void> {
    const code = client.code;
    if (!code) return;
    const url = inviteLink(code, d.inviteBase, d.inviteOnline);
    const text = t('lobby.shareText', { code });
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Pétanque', text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // the player closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      lobby.toast(t('lobby.copied'));
    } catch {
      lobby.toast(t('lobby.copyFailed'));
    }
  }

  // ---- server events (the match itself is handled by online/match.ts) --------------------
  client.on('welcome', (ev) => {
    rememberOpponent(ev.room);
    if (stage === 'match' || stage === 'idle') return;
    if (ev.room.phase === 'lobby') {
      stage = 'lobby';
      lobby.showRoom(ev.room.code, `${t(LENGTH_KEY[ev.room.length])} · ${onlinePoints(ev.room.length)}`);
    } else enterMatch();
  });
  client.on('matchStarted', (ev) => {
    rememberOpponent(ev.room);
    if (stage === 'connecting' || stage === 'lobby') enterMatch();
  });
  client.on('roomState', (ev) => rememberOpponent(ev.room));
  client.on('error', (ev) => {
    if (!ev.fatal || stage === 'idle') return;
    const kind = ERROR_NOTICE[ev.code] ?? 'error';
    if (kind === 'notFound' || (kind === 'full' && loadActiveRoom()?.code === client.code)) clearActiveRoom();
    fail(kind);
  });
  client.on('status', (ev) => {
    if (ev.status === 'closed' && ev.closeCode === CLOSE_CODES.replaced && stage !== 'idle') fail('replaced');
  });

  // Phones drop sockets when the app sleeps: retry right away when it is back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') client.reconnectNow();
  });
  window.addEventListener('online', () => client.reconnectNow());

  lobby.onShare(() => void share());
  lobby.onCancel(() => {
    leave();
    d.goMenu();
  });
  d.menu.onOnline(() => void openSheet());
  d.menu.onRejoin(() => {
    const active = loadActiveRoom();
    if (active) join(active.code, active.nickname);
  });
  d.menu.setOnlineAvailable(true);

  return {
    mode,
    isOpen: () => sheet.isOpen() || lobby.isOpen() || noticeUp,
    start() {
      const code = roomCodeFromSearch(location.search);
      if (new URLSearchParams(location.search).has(ROOM_PARAM)) history.replaceState(history.state, '', stripRoomParam(location.href));
      if (code) void openInvite(code);
      else void checkRejoin();
    },
  };
}

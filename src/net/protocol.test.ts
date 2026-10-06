import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../tuning/config';
import { CONFIG_HASH, configFingerprint, stableStringify } from './fingerprint';
import { inviteLink, roomCodeFromSearch } from './invite';
import {
  PING_TEXT,
  PONG_TEXT,
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  cleanNickname,
  normalizeRoomCode,
  parseClientMessage,
  parseServerMessage,
} from './protocol';

const TOKEN = 'abcdefghijklmnop_1234';
const hello = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH, roomCode: 'AB2CD', clientToken: TOKEN, nickname: 'Ana', ...over });

describe('parseClientMessage', () => {
  it('accepts a valid hello, normalising the code and the nickname, dropping extra fields', () => {
    const r = parseClientMessage(hello({ roomCode: ' ab2-cd ', nickname: '  Ana \u0007 María  ', extra: 1 }));
    expect(r).toEqual({
      ok: true,
      msg: { type: 'hello', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH, roomCode: 'AB2CD', clientToken: TOKEN, nickname: 'Ana María' },
    });
  });

  it('rejects bad hellos', () => {
    for (const over of [
      { roomCode: 'AB0CD' }, // 0 is not in the alphabet
      { roomCode: 'ABCD' },
      { clientToken: 'short' },
      { clientToken: 'has spaces in the token!!' },
      { nickname: '' },
      { nickname: '   ' },
      { nickname: 'x'.repeat(PROTOCOL_LIMITS.nicknameMaxChars + 1) },
      { nickname: 42 },
      { protocolVersion: 1.5 },
      { protocolVersion: '1' },
      { configHash: 7 },
    ]) {
      expect(parseClientMessage(hello(over)).ok, JSON.stringify(over)).toBe(false);
    }
  });

  it('accepts a valid throw and copies only the intent fields', () => {
    const r = parseClientMessage(JSON.stringify({ type: 'throw', seq: 3, intent: { aim: 0.1, power: 0.6, loft: 'lob', cheat: true } }));
    expect(r).toEqual({ ok: true, msg: { type: 'throw', seq: 3, intent: { aim: 0.1, power: 0.6, loft: 'lob' } } });
  });

  it('rejects NaN, huge and out-of-range numbers', () => {
    const bad = [
      '{"type":"throw","seq":1,"intent":{"aim":1e308,"power":0.5,"loft":"roll"}}',
      '{"type":"throw","seq":1,"intent":{"aim":0,"power":1.01,"loft":"roll"}}',
      '{"type":"throw","seq":1,"intent":{"aim":0,"power":-0.1,"loft":"roll"}}',
      '{"type":"throw","seq":1,"intent":{"aim":0,"power":null,"loft":"roll"}}',
      '{"type":"throw","seq":1,"intent":{"aim":"0","power":0.5,"loft":"roll"}}',
      '{"type":"throw","seq":1,"intent":{"aim":0,"power":0.5,"loft":"spin"}}',
      '{"type":"throw","seq":-1,"intent":{"aim":0,"power":0.5,"loft":"roll"}}',
      '{"type":"throw","seq":1e12,"intent":{"aim":0,"power":0.5,"loft":"roll"}}',
      '{"type":"throw","seq":1}',
      '{"type":"nextEnd","endNumber":0}',
      '{"type":"nextEnd","endNumber":2.5}',
      '{"type":"nextEnd"}',
    ];
    for (const raw of bad) expect(parseClientMessage(raw).ok, raw).toBe(false);
    // JSON has no NaN literal; a NaN smuggled through JSON.stringify becomes null and is rejected above.
    expect(JSON.stringify({ x: NaN })).toBe('{"x":null}');
  });

  it('rejects unknown types, non-objects, invalid JSON, binary frames and oversized payloads', () => {
    expect(parseClientMessage('{"type":"teleport"}')).toMatchObject({ ok: false, code: 'badMessage' });
    expect(parseClientMessage('[1,2]')).toMatchObject({ ok: false, code: 'badMessage' });
    expect(parseClientMessage('{"type":')).toMatchObject({ ok: false, code: 'badMessage' });
    expect(parseClientMessage(new ArrayBuffer(4))).toMatchObject({ ok: false, code: 'badMessage' });
    const big = JSON.stringify({ type: 'ping', pad: 'x'.repeat(PROTOCOL_LIMITS.maxClientMessageChars) });
    expect(parseClientMessage(big)).toMatchObject({ ok: false, code: 'tooLarge' });
  });

  it('accepts the field-less messages, including the exact keepalive text', () => {
    expect(parseClientMessage(PING_TEXT)).toEqual({ ok: true, msg: { type: 'ping' } });
    expect(parseClientMessage('{"type":"rematch"}')).toEqual({ ok: true, msg: { type: 'rematch' } });
    expect(parseClientMessage('{"type":"leave"}')).toEqual({ ok: true, msg: { type: 'leave' } });
    expect(parseClientMessage('{"type":"nextEnd","endNumber":4}')).toEqual({ ok: true, msg: { type: 'nextEnd', endNumber: 4 } });
  });
});

describe('helpers', () => {
  it('room codes use the unambiguous alphabet only', () => {
    expect(normalizeRoomCode('k7m-9p')).toBe('K7M9P');
    expect(normalizeRoomCode('K7M9I')).toBeNull(); // I is ambiguous
    expect(normalizeRoomCode('K7M9P1')).toBeNull();
    expect(normalizeRoomCode(12345)).toBeNull();
  });

  it('nicknames keep unicode but not control characters', () => {
    expect(cleanNickname('Zoë 🎯')).toBe('Zoë 🎯');
    expect(cleanNickname('a​b\nc')).toBe('ab c');
    expect(cleanNickname('é'.repeat(20))).toBe('é'.repeat(20));
  });

  it('server messages: known types only', () => {
    expect(parseServerMessage(PONG_TEXT)).toEqual({ type: 'pong' });
    expect(parseServerMessage('<html>502</html>')).toBeNull();
    expect(parseServerMessage('{"type":"hack"}')).toBeNull();
  });

  it('invite links round-trip', () => {
    expect(inviteLink('K7M9P')).toBe('https://petanque.amunozo.com/?room=K7M9P');
    expect(roomCodeFromSearch('?dev=1&room=k7m9p')).toBe('K7M9P');
    expect(roomCodeFromSearch('?room=nope!')).toBeNull();
    expect(roomCodeFromSearch('')).toBeNull();
  });

  it('config fingerprint is stable and sensitive to physics changes', () => {
    expect(CONFIG_HASH).toMatch(/^[0-9a-f]{8}$/);
    expect(configFingerprint(JSON.parse(JSON.stringify(defaultConfig)))).toBe(CONFIG_HASH);
    const changed = { ...defaultConfig, physics: { ...defaultConfig.physics, gravity: 9.8 } };
    expect(configFingerprint(changed)).not.toBe(CONFIG_HASH);
    // Only physics/balls/throw/match count: camera or look tweaks keep the hash.
    expect(configFingerprint({ ...defaultConfig, camera: { ...defaultConfig.camera, fovDeg: 70 } } as typeof defaultConfig)).toBe(CONFIG_HASH);
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
  });
});

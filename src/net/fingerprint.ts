/**
 * Config fingerprint: a short hash of the config slice that decides a throw's
 * outcome (physics, balls, throw model, match rules). The server always plays
 * with `defaultConfig`; a client whose build has different defaults gets
 * `versionMismatch` and should reload/update. Pure.
 */
import { defaultConfig, type GameConfig } from '../tuning/config';

/** JSON with object keys sorted, so the hash does not depend on key order. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** FNV-1a 32-bit, as 8 hex chars. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const configFingerprint = (cfg: Pick<GameConfig, 'physics' | 'balls' | 'throw' | 'match'>): string =>
  fnv1a(stableStringify({ physics: cfg.physics, balls: cfg.balls, throw: cfg.throw, match: cfg.match }));

/** Fingerprint of this build's defaults (what the server referees with). */
export const CONFIG_HASH = configFingerprint(defaultConfig);

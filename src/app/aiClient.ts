/**
 * Asks the computer opponent for a throw. The real work (games/petanque/ai.ts)
 * runs in a Web Worker so the UI never stutters. If the worker cannot start,
 * errors, or takes too long, the request resolves with a trivial safe decision
 * so a match can never stall.
 */
import type { AiDecision, AiRequest } from '../games/petanque/aiTypes';
import type { GameConfig } from '../tuning';
import { safeDecision } from './aiFallback';

export interface AiWorkerRequest {
  id: number;
  req: AiRequest;
  /** Plain-data copy of the live config. */
  cfg: GameConfig;
}
export type AiWorkerResponse = { id: number; decision: AiDecision } | { id: number; error: string };

/** Give up on the worker after this long (ms). */
const TIMEOUT_MS = 10_000;

export interface AiClient {
  requestAiThrow(req: AiRequest): Promise<AiDecision>;
  /** Terminates the worker (a later request starts a fresh one). */
  dispose(): void;
}

export function createAiClient(getCfg: () => GameConfig): AiClient {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (d: AiDecision) => void; req: AiRequest; timer: ReturnType<typeof setTimeout> }>();

  function settle(id: number, decision: AiDecision | null): void {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(decision ?? safeDecision(p.req));
  }

  function failAll(why?: string): void {
    if (why) console.warn(`[ai] ${why}; using a safe fallback throw`);
    for (const id of [...pending.keys()]) settle(id, null);
  }

  function ensureWorker(): Worker | null {
    if (worker) return worker;
    try {
      const w = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<AiWorkerResponse>) => {
        const m = e.data;
        if ('decision' in m) settle(m.id, m.decision);
        else {
          console.warn(`[ai] worker error: ${m.error}`);
          settle(m.id, null);
        }
      };
      w.onerror = (e) => {
        failAll(`worker failed (${e.message || 'unknown'})`);
        w.terminate();
        if (worker === w) worker = null;
      };
      worker = w;
    } catch (err) {
      console.warn('[ai] cannot start worker', err);
      worker = null;
    }
    return worker;
  }

  return {
    requestAiThrow(req) {
      return new Promise<AiDecision>((resolve) => {
        const w = ensureWorker();
        if (!w) {
          resolve(safeDecision(req));
          return;
        }
        const id = nextId++;
        const timer = setTimeout(() => {
          console.warn('[ai] worker timed out');
          settle(id, null);
        }, TIMEOUT_MS);
        pending.set(id, { resolve, req, timer });
        const msg: AiWorkerRequest = { id, req, cfg: JSON.parse(JSON.stringify(getCfg())) as GameConfig };
        try {
          w.postMessage(msg);
        } catch (err) {
          console.warn('[ai] postMessage failed', err);
          settle(id, null);
        }
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll();
    },
  };
}

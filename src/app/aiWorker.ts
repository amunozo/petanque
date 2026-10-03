/**
 * Web Worker entry: runs the computer opponent off the main thread.
 * Receives { id, req, cfg } and answers { id, decision } or { id, error }.
 * Pure compute: no DOM, no timers.
 */
import { chooseThrow } from '../games/petanque/ai';
import type { AiWorkerRequest, AiWorkerResponse } from './aiClient';

// The tsconfig has the DOM lib, not WebWorker: type the few members we use.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<AiWorkerRequest>) => void) | null;
  postMessage(msg: AiWorkerResponse): void;
};

scope.onmessage = (e) => {
  const { id, req, cfg } = e.data;
  try {
    scope.postMessage({ id, decision: chooseThrow(req, cfg) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

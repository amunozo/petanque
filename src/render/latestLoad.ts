/**
 * Latest-wins bookkeeping for the scene's expensive, asynchronous loads (switching venue at runtime:
 * src/render/pitchScene.ts). Pure TS, no three.js: the handle's own load/dispose do the work, this
 * only decides which handle is current.
 *
 * Rules: asking for the key that is already in place does nothing (no reload, resolves at once);
 * asking for another key disposes the handle in place *before* starting the new one, so a superseded
 * load never adds to the scene; every promise handed out settles (a superseded one resolves as soon
 * as its handle is disposed, per the LoadHandle contract), so callers can always await.
 */

/** A load that can be dropped again. `dispose()` only has to make the in-flight parts harmless. */
export interface LoadHandle {
  /** Resolves when the load has finished (loaded or failed); a disposed handle resolves at once. Never rejects. */
  ready: Promise<void>;
  /** Removes and frees what was loaded; results still in flight are dropped when they arrive. */
  dispose(): void;
}

export interface LatestLoad<K> {
  /** Key of the handle currently in place (null before the first `set` and after `dispose`). */
  current(): K | null;
  /**
   * Makes the handle for `key` the current one: the previous handle is disposed first, then
   * `start(key)` runs (`start` is skipped when `key` already is current). Returns the new handle's
   * ready promise; for the current key it returns an already-resolved promise.
   */
  set(key: K, start: (key: K) => LoadHandle): Promise<void>;
  /** Ready promise of the current handle (already resolved before the first `set`). */
  ready(): Promise<void>;
  /** Disposes the current handle (if any) and forgets it. */
  dispose(): void;
}

const RESOLVED: Promise<void> = Promise.resolve();

export function createLatestLoad<K>(same: (a: K, b: K) => boolean = Object.is): LatestLoad<K> {
  let key: K | null = null;
  let handle: LoadHandle | null = null;
  return {
    current: () => key,
    ready: () => handle?.ready ?? RESOLVED,
    set(next, start) {
      if (handle && key !== null && same(key, next)) return RESOLVED;
      const previous = handle;
      handle = null;
      key = null;
      previous?.dispose(); // first: its late results must never land in the new venue's scene
      const started = start(next);
      handle = started;
      key = next;
      return started.ready;
    },
    dispose() {
      const previous = handle;
      handle = null;
      key = null;
      previous?.dispose();
    },
  };
}

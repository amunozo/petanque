/**
 * Live config store. `config` is a single object mutated in place, so any code
 * holding a reference (or reading it each frame) always sees current values.
 * Only the diff from defaults is persisted, so changed defaults in a new
 * version are picked up for every setting the user never touched.
 */
import type { GameConfig, TuningFolder } from './config';
import {
  assignDeep,
  cloneDeep,
  diffFromDefaults,
  getPath,
  isPlainObject,
  isValidLeaf,
  leafPaths,
  mergeValidated,
  setPath,
  type PlainObject,
} from './paths';

export const TUNING_STORAGE_KEY = 'petanque.tuning.v1';

/** `path` is the changed dot path, or null when many values changed at once (reset/import). */
export type ConfigListener = (path: string | null) => void;

export interface ImportResult {
  ok: boolean;
  error?: string;
  /** Paths in the pasted JSON that were ignored (unknown or wrong type). */
  ignored?: string[];
}

export interface ConfigStore {
  /** Live object, mutated in place. */
  readonly config: GameConfig;
  /** Returns false (and changes nothing) for unknown paths / wrong types. */
  set(path: string, value: number | string | boolean): boolean;
  get(path: string): unknown;
  getDefault(path: string): unknown;
  isChanged(path: string): boolean;
  subscribe(fn: ConfigListener): () => void;
  reset(): void;
  /** JSON of only the values that differ from defaults (nested). "{}" when nothing changed. */
  exportJson(): string;
  /** Replaces current settings with the pasted diff (unspecified values return to defaults). */
  importJson(json: string): ImportResult;
  /** Number of leaf values that differ from defaults. */
  diffCount(): number;
}

export interface ConfigStoreOptions {
  /** localStorage key. */
  storageKey?: string;
  /** Storage backend; defaults to window.localStorage (if available). Pass null to disable persistence. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Schema, used only to validate enum membership of string values. */
  schema?: readonly TuningFolder[];
}

function resolveStorage(): ConfigStoreOptions['storage'] {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createConfigStore(defaults: GameConfig, opts: ConfigStoreOptions = {}): ConfigStore {
  const key = opts.storageKey ?? TUNING_STORAGE_KEY;
  const storage = opts.storage === undefined ? resolveStorage() : opts.storage;
  const defaultsObj = cloneDeep(defaults) as unknown as PlainObject;
  const config = cloneDeep(defaults);
  const configObj = config as unknown as PlainObject;
  const listeners = new Set<ConfigListener>();

  const enums = new Map<string, readonly string[]>();
  for (const folder of opts.schema ?? []) {
    for (const f of folder.fields) if ('options' in f) enums.set(f.path, f.options);
  }
  const validate = (path: string, value: unknown): boolean => {
    const options = enums.get(path);
    return !options || (typeof value === 'string' && options.includes(value));
  };

  const diff = (): PlainObject => diffFromDefaults(configObj, defaultsObj);

  const persist = (): void => {
    if (!storage) return;
    try {
      const d = diff();
      if (Object.keys(d).length === 0) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(d));
    } catch {
      /* storage full / blocked: keep working in memory */
    }
  };

  const notify = (path: string | null): void => {
    for (const fn of [...listeners]) {
      try {
        fn(path);
      } catch (err) {
        console.error('tuning listener failed', err);
      }
    }
  };

  // Load saved diff.
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw) mergeValidated(configObj, defaultsObj, JSON.parse(raw) as unknown, validate);
    } catch {
      /* corrupt or inaccessible: start from defaults */
    }
  }

  return {
    config,
    set(path, value) {
      const def = getPath(defaultsObj, path);
      if (def === undefined || isPlainObject(def)) return false;
      if (!isValidLeaf(value, def) || !validate(path, value)) return false;
      if (Object.is(getPath(configObj, path), value)) return true;
      setPath(configObj, path, value);
      persist();
      notify(path);
      return true;
    },
    get: (path) => getPath(configObj, path),
    getDefault: (path) => getPath(defaultsObj, path),
    isChanged: (path) => !Object.is(getPath(configObj, path), getPath(defaultsObj, path)),
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    reset() {
      assignDeep(configObj, defaultsObj);
      persist();
      notify(null);
    },
    exportJson: () => JSON.stringify(diff(), null, 2),
    importJson(json) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return { ok: false, error: 'Not valid JSON' };
      }
      if (!isPlainObject(parsed)) return { ok: false, error: 'Expected a JSON object like {"throw":{"maxSpeed":12}}' };
      const candidate = cloneDeep(defaultsObj);
      const res = mergeValidated(candidate, defaultsObj, parsed, validate);
      if (res.applied.length === 0 && res.rejected.length > 0) {
        return { ok: false, error: `Nothing recognised (ignored: ${res.rejected.slice(0, 4).join(', ')})`, ignored: res.rejected };
      }
      assignDeep(configObj, candidate);
      persist();
      notify(null);
      return res.rejected.length > 0 ? { ok: true, ignored: res.rejected } : { ok: true };
    },
    diffCount: () => leafPaths(diff()).length,
  };
}

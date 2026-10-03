/**
 * Pure helpers for working with dot paths into nested plain-object configs.
 * No DOM, no storage. Used by the config store and unit-tested on their own.
 */

export type PlainObject = Record<string, unknown>;

export function isPlainObject(v: unknown): v is PlainObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Deep clone of plain JSON-like data (objects, numbers, strings, booleans). */
export function cloneDeep<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => cloneDeep(x)) as unknown as T;
  if (isPlainObject(v)) {
    const out: PlainObject = {};
    for (const k of Object.keys(v)) out[k] = cloneDeep(v[k]);
    return out as T;
  }
  return v;
}

/** Value at `path`, or undefined when any segment is missing. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (!isPlainObject(cur) || !hasOwn(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * Set the value at `path`. Only overwrites an EXISTING leaf (never creates
 * keys, never replaces a sub-object). Returns false if the path is invalid.
 */
export function setPath(obj: unknown, path: string, value: unknown): boolean {
  const keys = path.split('.');
  const last = keys.pop();
  if (last === undefined) return false;
  let cur: unknown = obj;
  for (const key of keys) {
    if (!isPlainObject(cur) || !hasOwn(cur, key)) return false;
    cur = cur[key];
  }
  if (!isPlainObject(cur) || !hasOwn(cur, last) || isPlainObject(cur[last])) return false;
  cur[last] = value;
  return true;
}

/** All leaf paths of a nested object, in key order. */
export function leafPaths(obj: unknown, prefix = ''): string[] {
  if (!isPlainObject(obj)) return [];
  const out: string[] = [];
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (isPlainObject(v)) out.push(...leafPaths(v, p));
    else out.push(p);
  }
  return out;
}

/** Nested object holding only the leaves where `current` differs from `defaults`. */
export function diffFromDefaults(current: unknown, defaults: unknown): PlainObject {
  const out: PlainObject = {};
  if (!isPlainObject(current) || !isPlainObject(defaults)) return out;
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    if (!hasOwn(current, k)) continue;
    const c = current[k];
    if (isPlainObject(d)) {
      const sub = diffFromDefaults(c, d);
      if (Object.keys(sub).length > 0) out[k] = sub;
    } else if (!Object.is(c, d)) {
      out[k] = c;
    }
  }
  return out;
}

/** True if `value` is acceptable for a leaf whose default is `template`. */
export function isValidLeaf(value: unknown, template: unknown): boolean {
  if (typeof value !== typeof template) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' || typeof value === 'boolean';
}

export interface MergeResult {
  /** Leaf paths that were written to the target. */
  applied: string[];
  /** Leaf paths that were skipped (unknown path or type mismatch / invalid). */
  rejected: string[];
}

/**
 * Deep-merge `patch` onto `target` in place, guided by `template` (the
 * defaults: they define which paths exist and their types). Unknown paths,
 * type mismatches and non-finite numbers are skipped, never thrown on.
 * `validate` can veto a leaf (e.g. enum membership).
 */
export function mergeValidated(
  target: PlainObject,
  template: PlainObject,
  patch: unknown,
  validate?: (path: string, value: unknown) => boolean,
  prefix = '',
): MergeResult {
  const result: MergeResult = { applied: [], rejected: [] };
  if (!isPlainObject(patch)) return result;
  for (const k of Object.keys(patch)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = patch[k];
    if (!hasOwn(template, k) || !hasOwn(target, k)) {
      result.rejected.push(p);
      continue;
    }
    const t = template[k];
    if (isPlainObject(t)) {
      const targetSub = target[k];
      if (!isPlainObject(v) || !isPlainObject(targetSub)) {
        result.rejected.push(p);
        continue;
      }
      const sub = mergeValidated(targetSub, t, v, validate, p);
      result.applied.push(...sub.applied);
      result.rejected.push(...sub.rejected);
    } else if (isValidLeaf(v, t) && (!validate || validate(p, v))) {
      target[k] = v;
      result.applied.push(p);
    } else {
      result.rejected.push(p);
    }
  }
  return result;
}

/** Copy every leaf of `source` into `target` in place (same shape assumed). */
export function assignDeep(target: PlainObject, source: PlainObject): void {
  for (const k of Object.keys(source)) {
    const s = source[k];
    const t = target[k];
    if (isPlainObject(s) && isPlainObject(t)) assignDeep(t, s);
    else target[k] = cloneDeep(s);
  }
}

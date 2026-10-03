import { describe, expect, it, vi } from 'vitest';
import { defaultConfig, tuningSchema } from './config';
import { createConfigStore } from './store';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
const KEY = 'petanque.tuning.v1';

describe('config store', () => {
  it('mutates the live config in place and notifies', () => {
    const store = createConfigStore(defaultConfig, { storage: null });
    const ref = store.config;
    const fn = vi.fn();
    store.subscribe(fn);
    expect(store.set('throw.maxSpeed', 15)).toBe(true);
    expect(ref.throw.maxSpeed).toBe(15);
    expect(store.get('throw.maxSpeed')).toBe(15);
    expect(fn).toHaveBeenCalledWith('throw.maxSpeed');
    expect(defaultConfig.throw.maxSpeed).toBe(11); // defaults untouched
    expect(store.diffCount()).toBe(1);
  });

  it('rejects unknown paths, wrong types and bad enums', () => {
    const store = createConfigStore(defaultConfig, { storage: null, schema: tuningSchema });
    expect(store.set('nope.x', 1)).toBe(false);
    expect(store.set('throw', 1)).toBe(false);
    expect(store.set('throw.maxSpeed', 'fast')).toBe(false);
    expect(store.set('throw.maxSpeed', Number.NaN)).toBe(false);
    expect(store.set('controls.scheme', 'banana')).toBe(false);
    expect(store.set('controls.scheme', 'flick')).toBe(true);
    expect(store.diffCount()).toBe(1);
  });

  it('does not notify when the value is unchanged', () => {
    const store = createConfigStore(defaultConfig, { storage: null });
    const fn = vi.fn();
    store.subscribe(fn);
    store.set('throw.maxSpeed', 11);
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const store = createConfigStore(defaultConfig, { storage: null });
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    store.set('throw.maxSpeed', 12);
    expect(fn).not.toHaveBeenCalled();
  });

  it('exports only the diff, nested', () => {
    const store = createConfigStore(defaultConfig, { storage: null });
    expect(JSON.parse(store.exportJson())).toEqual({});
    store.set('physics.surface.rollingResistance', 0.2);
    store.set('controls.showLandingMarker', false);
    expect(JSON.parse(store.exportJson())).toEqual({
      physics: { surface: { rollingResistance: 0.2 } },
      controls: { showLandingMarker: false },
    });
  });

  it('persists only the diff and restores it', () => {
    const storage = fakeStorage();
    const a = createConfigStore(defaultConfig, { storage });
    a.set('camera.fovDeg', 70);
    expect(JSON.parse(storage.data.get(KEY) ?? '')).toEqual({ camera: { fovDeg: 70 } });
    const b = createConfigStore(defaultConfig, { storage });
    expect(b.config.camera.fovDeg).toBe(70);
    expect(b.config.camera.height).toBe(defaultConfig.camera.height);
  });

  it('removes the saved key when back to defaults', () => {
    const storage = fakeStorage();
    const s = createConfigStore(defaultConfig, { storage });
    s.set('camera.fovDeg', 70);
    s.reset();
    expect(storage.data.has(KEY)).toBe(false);
    expect(s.config.camera.fovDeg).toBe(defaultConfig.camera.fovDeg);
  });

  it('ignores unknown paths and type mismatches in saved data', () => {
    const storage = fakeStorage({
      [KEY]: JSON.stringify({ camera: { fovDeg: 'wide', oldThing: 1 }, removed: { x: 1 }, throw: { maxSpeed: 14 } }),
    });
    const s = createConfigStore(defaultConfig, { storage, schema: tuningSchema });
    expect(s.config.camera.fovDeg).toBe(defaultConfig.camera.fovDeg);
    expect(s.config.throw.maxSpeed).toBe(14);
    expect('removed' in s.config).toBe(false);
  });

  it('drops the old controls.fullPowerDragPx key from saved data', () => {
    const storage = fakeStorage({ [KEY]: JSON.stringify({ controls: { fullPowerDragPx: 400, haptics: false } }) });
    const s = createConfigStore(defaultConfig, { storage, schema: tuningSchema });
    expect('fullPowerDragPx' in s.config.controls).toBe(false);
    expect(s.config.controls.fullPowerDragFrac).toBe(defaultConfig.controls.fullPowerDragFrac);
    expect(s.config.controls.haptics).toBe(false);
  });

  it('survives corrupt saved JSON', () => {
    const s = createConfigStore(defaultConfig, { storage: fakeStorage({ [KEY]: '{oops' }) });
    expect(s.diffCount()).toBe(0);
  });

  it('works when every storage call throws', () => {
    const boom = () => {
      throw new Error('denied');
    };
    const s = createConfigStore(defaultConfig, { storage: { getItem: boom, setItem: boom, removeItem: boom } });
    expect(s.set('throw.maxSpeed', 13)).toBe(true);
    expect(s.config.throw.maxSpeed).toBe(13);
    s.reset();
    expect(s.config.throw.maxSpeed).toBe(11);
  });

  it('works with no localStorage global at all', () => {
    const s = createConfigStore(defaultConfig);
    expect(s.set('throw.maxSpeed', 9)).toBe(true);
  });

  it('imports an exported diff (round trip), replacing current state', () => {
    const a = createConfigStore(defaultConfig, { storage: null });
    a.set('throw.maxSpeed', 15);
    a.set('controls.scheme', 'flick');
    const json = a.exportJson();
    const b = createConfigStore(defaultConfig, { storage: null });
    b.set('camera.fovDeg', 80);
    const fn = vi.fn();
    b.subscribe(fn);
    expect(b.importJson(json)).toEqual({ ok: true });
    expect(b.config.throw.maxSpeed).toBe(15);
    expect(b.config.controls.scheme).toBe('flick');
    expect(b.config.camera.fovDeg).toBe(defaultConfig.camera.fovDeg);
    expect(fn).toHaveBeenCalledWith(null);
  });

  it('reports import errors and leaves state alone', () => {
    const s = createConfigStore(defaultConfig, { storage: null });
    s.set('throw.maxSpeed', 15);
    expect(s.importJson('not json').ok).toBe(false);
    expect(s.importJson('[1,2]').ok).toBe(false);
    const r = s.importJson('{"zzz":{"a":1}}');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(s.config.throw.maxSpeed).toBe(15);
  });

  it('import applies the valid part and lists ignored paths', () => {
    const s = createConfigStore(defaultConfig, { storage: null });
    const r = s.importJson('{"throw":{"maxSpeed":12,"gone":1}}');
    expect(r.ok).toBe(true);
    expect(r.ignored).toEqual(['throw.gone']);
    expect(s.config.throw.maxSpeed).toBe(12);
  });

  it('isChanged / getDefault', () => {
    const s = createConfigStore(defaultConfig, { storage: null });
    expect(s.isChanged('throw.maxSpeed')).toBe(false);
    s.set('throw.maxSpeed', 12);
    expect(s.isChanged('throw.maxSpeed')).toBe(true);
    expect(s.getDefault('throw.maxSpeed')).toBe(11);
  });
});

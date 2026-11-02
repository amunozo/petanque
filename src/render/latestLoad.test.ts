import { describe, expect, it } from 'vitest';
import { createLatestLoad, type LoadHandle } from './latestLoad';

/** A handle whose ready promise the test controls, and which resolves it when disposed. */
function fakeHandle() {
  let finish: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const handle: LoadHandle & { disposed: boolean } = {
    ready,
    disposed: false,
    dispose() {
      handle.disposed = true;
      finish(); // a disposed load never leaves its awaiter hanging
    },
  };
  return { handle, finish: () => finish() };
}

describe('createLatestLoad', () => {
  it('starts the first handle and tracks it as current', () => {
    const loads = createLatestLoad<string>();
    const started: string[] = [];
    const { handle } = fakeHandle();
    const ready = loads.set('village', (k) => {
      started.push(k);
      return handle;
    });
    expect(started).toEqual(['village']);
    expect(loads.current()).toBe('village');
    expect(ready).toBe(handle.ready);
    expect(loads.ready()).toBe(handle.ready);
  });

  it('does nothing for the key that is already current, and resolves at once', async () => {
    const loads = createLatestLoad<string>();
    const { handle } = fakeHandle();
    let starts = 0;
    loads.set('village', () => {
      starts++;
      return handle;
    });
    let resolvedImmediately = false;
    const again = loads.set('village', () => {
      starts++;
      return fakeHandle().handle;
    });
    void again.then(() => {
      resolvedImmediately = true;
    });
    await Promise.resolve();
    expect(starts).toBe(1);
    expect(resolvedImmediately).toBe(true); // not waiting for the still-loading handle
    expect(handle.disposed).toBe(false);
    expect(loads.ready()).toBe(handle.ready); // the running load is still the current one
  });

  it('disposes the previous handle before starting the new one', async () => {
    const loads = createLatestLoad<string>();
    const first = fakeHandle();
    const second = fakeHandle();
    let firstDisposedWhenStarted = false;
    const firstReady = loads.set('village', () => first.handle);
    const secondReady = loads.set('derborence', () => {
      firstDisposedWhenStarted = first.handle.disposed;
      return second.handle;
    });
    expect(firstDisposedWhenStarted).toBe(true);
    expect(loads.current()).toBe('derborence');
    // the superseded promise still settles (never hangs)
    await expect(firstReady).resolves.toBeUndefined();
    second.finish();
    await expect(secondReady).resolves.toBeUndefined();
    expect(second.handle.disposed).toBe(false);
  });

  it('keeps only the latest of rapid calls; the earlier ones are disposed and resolve', async () => {
    const loads = createLatestLoad<string>();
    const handles = [fakeHandle(), fakeHandle(), fakeHandle()];
    const keys = ['village', 'derborence', 'village'];
    const promises = keys.map((key, i) => loads.set(key, () => handles[i]!.handle));
    expect(handles[0]!.handle.disposed).toBe(true);
    expect(handles[1]!.handle.disposed).toBe(true); // village again: a new load, not the first handle
    expect(handles[2]!.handle.disposed).toBe(false);
    expect(loads.current()).toBe('village');
    handles[2]!.finish();
    await expect(Promise.all(promises)).resolves.toBeDefined();
  });

  it('disposes the current handle and forgets it', async () => {
    const loads = createLatestLoad<string>();
    const { handle } = fakeHandle();
    const ready = loads.set('village', () => handle);
    loads.dispose();
    expect(handle.disposed).toBe(true);
    expect(loads.current()).toBeNull();
    await expect(loads.ready()).resolves.toBeUndefined();
    await expect(ready).resolves.toBeUndefined();
  });

  it('accepts a custom equality (e.g. case-insensitive ids)', () => {
    const loads = createLatestLoad<string>((a, b) => a.toLowerCase() === b.toLowerCase());
    let starts = 0;
    const { handle } = fakeHandle();
    loads.set('Village', () => {
      starts++;
      return handle;
    });
    loads.set('village', () => {
      starts++;
      return fakeHandle().handle;
    });
    expect(starts).toBe(1);
    expect(loads.current()).toBe('Village');
  });
});

/**
 * Developer mode: the tuning panel, saved tuning and the build chips are for
 * playtesting only. Players get the official defaults. Turn it on once per
 * device with `?dev=1` (remembered), off with `?dev=0`; dev builds always have it.
 */
const DEV_KEY = 'petanque.dev';

export function resolveDevMode(params: URLSearchParams, isDevBuild: boolean): boolean {
  const flag = params.get('dev');
  try {
    if (flag === '1') localStorage.setItem(DEV_KEY, '1');
    else if (flag === '0') localStorage.removeItem(DEV_KEY);
    if (isDevBuild) return true;
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return isDevBuild || flag === '1';
  }
}

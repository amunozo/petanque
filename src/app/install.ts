/**
 * "Install app" support. Chromium fires `beforeinstallprompt` when the game can be installed;
 * we keep the event and offer an "Install app" item (menu + ⋯ sheet) that triggers the native
 * prompt. Nothing is offered where that event never fires (iOS Safari, Firefox) or when the game
 * already runs as an installed app / inside the Android TWA.
 *
 * `createInstaller()` must run early (before the page finishes loading) so the event isn't missed.
 */

/** Chromium's install event (not in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface Installer {
  /** True while the native install prompt can be shown. */
  canInstall(): boolean;
  /** Shows the native prompt (no-op when unavailable). */
  install(): Promise<void>;
  /** Fires whenever `canInstall()` changes. */
  onChange(fn: () => void): void;
}

/** Running as an installed app: PWA window, fullscreen, iOS home-screen app, or the Android TWA. */
export function isStandalone(): boolean {
  const mq = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;
  return (
    mq('(display-mode: standalone)') ||
    mq('(display-mode: fullscreen)') ||
    mq('(display-mode: minimal-ui)') ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith('android-app://') // TWA launch
  );
}

export function createInstaller(): Installer {
  let deferred: BeforeInstallPromptEvent | null = null;
  let changeFn: () => void = () => undefined;
  const canInstall = (): boolean => deferred !== null && !isStandalone();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    changeFn();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changeFn();
  });

  return {
    canInstall,
    async install() {
      const event = deferred;
      if (!event || isStandalone()) return;
      deferred = null; // the event can be used once
      changeFn();
      await event.prompt();
      await event.userChoice; // dismissed: Chromium fires beforeinstallprompt again later
    },
    onChange(fn) {
      changeFn = fn;
    },
  };
}

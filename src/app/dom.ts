/** Tiny DOM helpers shared by the HUD, menu and match HUD (no framework). */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(cls: string, text: string, onClick?: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Pointer/touch events on `target` must not leak into the game canvas underneath. */
export function shieldPointer(target: HTMLElement): void {
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'] as const) {
    target.addEventListener(type, (e) => e.stopPropagation());
  }
}

/** Restarts a CSS animation class on `target`. */
export function replay(target: HTMLElement, cls: string): void {
  target.classList.remove(cls);
  void target.offsetWidth; // reflow so the animation restarts
  target.classList.add(cls);
}

/**
 * Fills `target` with catalogue text: `**bold**` becomes <strong>, "\n" a line break.
 * Built from DOM nodes (never innerHTML), so params can't inject markup.
 */
export function setRich(target: HTMLElement, text: string): void {
  const nodes: Node[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) nodes.push(document.createElement('br'));
    line.split('**').forEach((part, j) => {
      if (part === '') return;
      if (j % 2 === 1) {
        const b = document.createElement('b');
        b.textContent = part;
        nodes.push(b);
      } else nodes.push(document.createTextNode(part));
    });
  });
  target.replaceChildren(...nodes);
}

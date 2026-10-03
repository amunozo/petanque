/** Speaker icon markup (24x24, stroke = currentColor) shared by the HUD and menu mute buttons. */
export function soundIconSvg(muted: boolean, size = 22): string {
  const speaker = '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/>';
  const extra = muted ? '<path d="M16 9.5l5 5M21 9.5l-5 5"/>' : '<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${speaker}${extra}</svg>`;
}

/** Updates a mute button's icon + accessible state. */
export function paintMuteButton(btn: HTMLButtonElement, muted: boolean): void {
  btn.innerHTML = soundIconSvg(muted);
  btn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  btn.setAttribute('aria-pressed', String(muted));
}

/**
 * The UI icon set: inline SVG on a 24x24 grid, 2px round strokes in
 * currentColor (so every icon follows its button's text colour). The loft
 * icons in input/loftPicker.ts are drawn in the same language.
 */
const PATHS = {
  more: '<circle cx="5.5" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.9" fill="currentColor" stroke="none"/>',
  fullscreen: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  fullscreenExit: '<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>',
  soundOn: '<path d="M4 10v4a1 1 0 0 0 1 1h3l4.5 4V5L8 9H5a1 1 0 0 0-1 1z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/>',
  soundOff: '<path d="M4 10v4a1 1 0 0 0 1 1h3l4.5 4V5L8 9H5a1 1 0 0 0-1 1z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  settings: '<path d="M4 7h8M18 7h2M4 17h2M12 17h8"/><circle cx="15" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4"/><path d="M4.5 4.5V9H9"/>',
  home: '<path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V9.5"/>',
  install: '<path d="M12 4v10M7.5 10l4.5 4.5 4.5-4.5"/><path d="M5 18.5h14"/>',
  privacy: '<path d="M12 3.5l7 2.8v5.4c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.2 10"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.7a2.6 2.6 0 1 1 3.7 2.3c-.8.4-1.2 1-1.2 1.9"/><circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
  check: '<path d="M5.5 12.5l4.2 4.2L18.5 7.5"/>',
  chevronLeft: '<path d="M14.5 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  share: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.7l6.6-3.9M8.7 13.3l6.6 3.9"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** `<svg>` markup for one icon (decorative: the button carries the label). */
export function icon(name: IconName, size = 22): string {
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

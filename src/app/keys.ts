export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);

/**
 * Normalises a key event to a combo string such as "mod+shift+z", "alt+arrowup", "shift+1" or "?".
 * Letters use the layout-aware key so Dvorak and AZERTY users get the letter printed on their keycap.
 */
export function comboOf(e: KeyboardEvent): string {
  let key = e.key;
  let shift = e.shiftKey;
  if (key === ' ' || e.code === 'Space') key = 'space';
  else if (key.length === 1 && /[a-z]/i.test(key)) key = key.toLowerCase();
  else if (/^Key[A-Z]$/.test(e.code) && (e.altKey || e.ctrlKey || e.metaKey)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (key.length === 1) shift = false; // Symbols like ? already include shift.
  else key = key.toLowerCase();

  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('mod');
  if (isMac && e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (shift) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

const NAMES: Record<string, string> = {
  mod: isMac ? '⌘' : 'Ctrl',
  ctrl: '⌃',
  alt: isMac ? '⌥' : 'Alt',
  shift: '⇧',
  enter: '↵',
  tab: '⇥',
  escape: 'esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'del',
  space: 'space',
  home: 'home',
  f2: 'F2',
};

/** Splits a combo into keycap labels for display. */
export function capsOf(combo: string): string[] {
  // "+" on its own (or as the last key) is a key, not a separator.
  const parts = combo.endsWith('+') ? [...combo.slice(0, -1).split('+').filter(Boolean), '+'] : combo.split('+');
  return parts.map((p) => NAMES[p] ?? (p.length === 1 ? p.toUpperCase() : p));
}

export function kbd(combo: string): string {
  return capsOf(combo)
    .map((c) => `<kbd>${escapeHtml(c)}</kbd>`)
    .join('');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

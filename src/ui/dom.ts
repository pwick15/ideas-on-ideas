/** A keyboard-owning layer on top of the canvas: palette, search, prune, and so on. */
export interface Layer {
  readonly name: string;
  /** Return true when the key was handled; the event is then cancelled. */
  key(e: KeyboardEvent, combo: string): boolean;
  close(): void;
  /** Shortcuts to show in the hint bar while this layer is on top. Omit to hide the bar. */
  hints?(): [combo: string, label: string][];
  /** Called when a layer above this one closes. */
  resume?(): void;
  /** Called when an idea is clicked while this layer is on top. */
  pick?(id: string): void;
}

/** A centered dialog with a dimmed backdrop. Clicking the backdrop closes it. */
export function modal(cls: string, onBackdrop: () => void, ...children: Node[]): HTMLDivElement {
  const panel = h('div', 'panel ' + cls, ...children);
  const wrap = h('div', 'modal');
  wrap.append(panel);
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target === wrap) onBackdrop();
  });
  document.body.append(wrap);
  return wrap;
}

type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | string = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (typeof attrs === 'string') el.className = attrs;
  else {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function relTime(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Fuzzy subsequence score. Higher is better, -1 means no match. */
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx * 2 - (t.length - q.length) * 0.1 + (idx === 0 || t[idx - 1] === ' ' ? 200 : 0);
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 6 + (found === 0 || t[found - 1] === ' ' ? 12 : 0) - Math.min(8, found - ti);
    ti = found + 1;
  }
  return score;
}

export function download(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'map'
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Small inline line icons, 20px, stroke follows currentColor. */
export const ICONS: Record<string, string> = {
  brainstorm:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9.2v5.6l4.8-2.8z"/></svg>',
  short: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.8 9.5v5l4-2.5z"/></svg>',
  article: '<svg viewBox="0 0 24 24"><path d="M6 3.5h9l3 3v14H6z"/><path d="M9 10h6M9 13.5h6M9 17h4"/></svg>',
  software: '<svg viewBox="0 0 24 24"><path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/></svg>',
  starburst:
    '<svg viewBox="0 0 24 24"><path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M5.6 18.4l3.6-3.6M14.8 9.2l3.6-3.6"/><circle cx="12" cy="12" r="1.6"/></svg>',
  scamper: '<svg viewBox="0 0 24 24"><path d="M3 7h4c4 0 6 10 10 10h4M3 17h4c1.6 0 2.8-1.6 3.9-3.6M17 7h4M13.1 10.6C14.2 8.6 15.4 7 17 7"/><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5"/></svg>',
  maps: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  command: '<svg viewBox="0 0 24 24"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></svg>',
  help: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6.5 10h1M10 10h1M13.5 10h1M17 10h.5M8 14h8"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  layout: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5"/><path d="M14.5 12h3M6.5 12h3M17.5 12c1.5 0 1.5-5 3-5M17.5 12c1.5 0 1.5 5 3 5M6.5 12c-1.5 0-1.5-5-3-5M6.5 12c-1.5 0-1.5 5-3 5"/></svg>',
  harvest: '<svg viewBox="0 0 24 24"><path d="m12 3 2.2 5.6L20 9.3l-4.4 3.9 1.3 5.8L12 16l-4.9 3 1.3-5.8L4 9.3l5.8-.7z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

export function icon(name: string): HTMLSpanElement {
  const s = h('span', 'icon');
  s.innerHTML = ICONS[name] ?? '';
  return s;
}

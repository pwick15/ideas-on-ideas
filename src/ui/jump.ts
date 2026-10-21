import type { App } from '../app/app';
import type { Id } from '../model/types';
import { h, type Layer } from './dom';

const ALPHABET = 'asdfjklghqwertyuiopzxcvbnm';

/** Vimium-style labels: one letter when they fit, otherwise prefix-free pairs. */
function labels(n: number): string[] {
  if (n <= ALPHABET.length) return ALPHABET.slice(0, n).split('');
  const out: string[] = [];
  // Reserve enough first letters as prefixes for two-letter labels.
  let singles = ALPHABET.length;
  while (singles > 0 && singles + (ALPHABET.length - singles) * ALPHABET.length < n) singles--;
  for (let i = 0; i < singles; i++) out.push(ALPHABET[i]);
  for (let p = singles; p < ALPHABET.length && out.length < n; p++) {
    for (let q = 0; q < ALPHABET.length && out.length < n; q++) out.push(ALPHABET[p] + ALPHABET[q]);
  }
  return out;
}

export class JumpHints implements Layer {
  readonly name = 'jump';
  private el: HTMLDivElement;
  private map = new Map<string, Id>();
  private typed = '';

  constructor(private app: App, private onPick?: (id: Id) => void) {
    this.el = h('div', 'jump-layer');
    const ids = app.visible().filter((id) => app.view.isOnScreen(id));
    // Closest to the focus get the easiest letters.
    const f = app.focus ? app.view.screenRect(app.focus) : null;
    const cx = f ? f.x + f.w / 2 : app.view.vw / 2;
    const cy = f ? f.y + f.h / 2 : app.view.vh / 2;
    ids.sort((a, b) => dist(app, a, cx, cy) - dist(app, b, cx, cy));
    const ls = labels(ids.length);
    ids.forEach((id, i) => {
      const r = app.view.screenRect(id)!;
      const tag = h('span', { class: 'jump-tag', 'data-l': ls[i] }, ls[i].toUpperCase());
      tag.style.transform = `translate(${Math.round(r.x - 6)}px, ${Math.round(r.y - 10)}px)`;
      this.el.append(tag);
      this.map.set(ls[i], id);
    });
    document.body.append(this.el);
    if (!ids.length) {
      queueMicrotask(() => app.popLayer(this));
      app.toast('No ideas on screen');
    }
  }

  key(e: KeyboardEvent, combo: string): boolean {
    if (combo === 'escape' || combo === 'f') {
      this.app.popLayer(this);
      return true;
    }
    if (combo === 'backspace') {
      this.typed = this.typed.slice(0, -1);
      this.filter();
      return true;
    }
    const k = e.key.toLowerCase();
    if (k.length !== 1 || !ALPHABET.includes(k)) return true;
    this.typed += k;
    const hit = this.map.get(this.typed);
    if (hit) {
      if (this.onPick) this.onPick(hit);
      else this.app.setFocus(hit);
      this.app.popLayer(this);
      return true;
    }
    if (![...this.map.keys()].some((l) => l.startsWith(this.typed))) this.typed = '';
    this.filter();
    return true;
  }

  private filter() {
    this.el.querySelectorAll<HTMLElement>('.jump-tag').forEach((t) => {
      const l = t.dataset.l!;
      const match = l.startsWith(this.typed);
      t.classList.toggle('dim', !match);
      t.innerHTML = match && this.typed ? `<b>${this.typed.toUpperCase()}</b>${l.slice(this.typed.length).toUpperCase()}` : l.toUpperCase();
    });
  }

  hints(): [string, string][] {
    return [
      ['a', 'type a label'],
      ['escape', 'cancel'],
    ];
  }

  close() {
    this.el.remove();
  }
}

function dist(app: App, id: Id, x: number, y: number) {
  const r = app.view.screenRect(id)!;
  return Math.hypot(r.x + r.w / 2 - x, r.y + r.h / 2 - y);
}

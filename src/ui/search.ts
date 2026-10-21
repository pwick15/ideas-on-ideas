import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { visibleOrder } from '../model/tree';
import type { Id } from '../model/types';
import { fuzzy, h, type Layer } from './dom';

/** Find ideas by text. Matches light up on the map; arrows step through them. */
export class Search implements Layer {
  readonly name = 'search';
  private el: HTMLDivElement;
  private input: HTMLInputElement;
  private status: HTMLSpanElement;
  private matches: Id[] = [];
  private cur = 0;
  private origin: Id | null;

  constructor(private app: App) {
    this.origin = app.focus;
    this.input = h('input', { class: 'search-input', placeholder: 'Search ideas…', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Search ideas' });
    this.status = h('span', 'search-status');
    const keys = h('span', 'search-keys');
    keys.innerHTML = `${kbd('arrowup')}${kbd('arrowdown')}<span>step</span>${kbd('enter')}<span>go</span>`;
    this.el = h('div', 'searchbar', h('span', 'search-icon', '/'), this.input, this.status, keys);
    app.topbar.slot.append(this.el);
    this.input.addEventListener('input', () => this.run());
    requestAnimationFrame(() => this.input.focus());
  }

  private run() {
    const q = this.input.value;
    const doc = this.app.doc;
    if (!q.trim()) {
      this.matches = [];
      this.app.view.setMatches(null, null);
      this.status.textContent = '';
      return;
    }
    // Search everything, including folded and cut ideas.
    const all = visibleOrder({ ...doc, nodes: Object.fromEntries(Object.entries(doc.nodes).map(([k, n]) => [k, { ...n, collapsed: false }])) }, false);
    const scored = all.map((id) => ({ id, s: fuzzy(q, doc.nodes[id].text) })).filter((x) => x.s >= (q.length > 2 ? 30 : 0));
    // Keep map order for stepping, but start at the best match.
    this.matches = scored.map((x) => x.id);
    const best = scored.reduce((b, x) => (x.s > b.s ? x : b), scored[0] ?? { id: '', s: -1 });
    this.cur = Math.max(0, this.matches.indexOf(best.id));
    this.paint();
  }

  private paint() {
    const id = this.matches[this.cur] ?? null;
    this.app.view.setMatches(new Set(this.matches), id);
    this.status.textContent = this.matches.length ? `${this.cur + 1} of ${this.matches.length}` : 'no matches';
    this.el.classList.toggle('none', !this.matches.length);
    if (id) this.app.setFocus(id, { quiet: true });
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    const n = this.matches.length;
    switch (combo) {
      case 'escape':
        this.app.popLayer(this);
        if (this.origin && this.app.doc.nodes[this.origin]) this.app.setFocus(this.origin);
        return true;
      case 'enter':
        this.app.popLayer(this);
        return true;
      case 'arrowdown':
      case 'tab':
        if (n) {
          this.cur = (this.cur + 1) % n;
          this.paint();
        }
        return true;
      case 'arrowup':
      case 'shift+tab':
        if (n) {
          this.cur = (this.cur - 1 + n) % n;
          this.paint();
        }
        return true;
    }
    return false;
  }

  hints(): [string, string][] {
    return [
      ['arrowup arrowdown', 'step'],
      ['enter', 'go'],
      ['escape', 'cancel'],
    ];
  }

  close() {
    this.app.view.setMatches(null, null);
    this.el.remove();
  }
}

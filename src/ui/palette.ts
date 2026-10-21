import type { App } from '../app/app';
import type { Command } from '../app/commands';
import { escapeHtml, kbd } from '../app/keys';
import { loadIndex } from '../model/storage';
import { fuzzy, h, icon, modal, type Layer } from './dom';

interface Item {
  title: string;
  group: string;
  keys?: string[];
  iconName?: string;
  run: () => void;
  id: string;
}

const recent: string[] = [];

export class Palette implements Layer {
  readonly name = 'palette';
  private wrap: HTMLDivElement;
  private input: HTMLInputElement;
  private list: HTMLDivElement;
  private items: Item[] = [];
  private shown: Item[] = [];
  private sel = 0;

  constructor(private app: App) {
    this.input = h('input', {
      class: 'palette-input',
      placeholder: 'Type a command or a map name…',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Command',
    });
    this.list = h('div', { class: 'palette-list', role: 'listbox' });
    this.wrap = modal('palette', () => app.popLayer(this), this.input, this.list);

    const cmds = app.commands.filter((c: Command) => !c.hidden && (!c.when || c.when()));
    this.items = cmds.map((c) => ({ id: c.id, title: c.title, group: c.group, keys: c.keys, run: c.run }));
    for (const m of loadIndex()) {
      if (m.id === app.doc.id) continue;
      this.items.push({
        id: 'map:' + m.id,
        title: m.title,
        group: 'Open map',
        iconName: m.kind,
        run: () => app.openMap(m.id),
      });
    }
    this.input.addEventListener('input', () => {
      this.sel = 0;
      this.render();
    });
    this.list.addEventListener('pointermove', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
      if (row && Number(row.dataset.i) !== this.sel) {
        this.sel = Number(row.dataset.i);
        this.paintSel();
      }
    });
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
      if (row) this.choose(Number(row.dataset.i));
    });
    this.render();
    requestAnimationFrame(() => this.input.focus());
  }

  private render() {
    const q = this.input.value;
    if (!q.trim()) {
      const rank = (i: Item) => {
        const r = recent.indexOf(i.id);
        return r < 0 ? 999 : r;
      };
      this.shown = this.items.slice().sort((a, b) => rank(a) - rank(b));
    } else {
      this.shown = this.items
        .map((i) => ({ i, s: Math.max(fuzzy(q, i.title), fuzzy(q, i.group + ' ' + i.title) - 50) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.i);
    }
    this.list.replaceChildren(
      ...this.shown.slice(0, 60).map((it, i) => {
        const row = h('div', { class: 'row', role: 'option', 'data-i': i });
        if (it.iconName) row.append(icon(it.iconName));
        row.append(h('span', 'row-title', it.title), h('span', 'row-group', it.group));
        if (it.keys?.length) {
          const k = h('span', 'row-keys');
          k.innerHTML = kbd(it.keys[0]);
          row.append(k);
        }
        return row;
      }),
    );
    if (!this.shown.length) {
      const empty = h('div', 'empty');
      empty.innerHTML = `Nothing matches “${escapeHtml(q)}”`;
      this.list.append(empty);
    }
    this.paintSel();
  }

  private paintSel() {
    const rows = this.list.querySelectorAll<HTMLElement>('.row');
    rows.forEach((r, i) => r.classList.toggle('sel', i === this.sel));
    rows[this.sel]?.scrollIntoView({ block: 'nearest' });
  }

  private choose(i: number) {
    const it = this.shown[i];
    if (!it) return;
    const r = recent.indexOf(it.id);
    if (r >= 0) recent.splice(r, 1);
    recent.unshift(it.id);
    this.app.popLayer(this);
    it.run();
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    const n = Math.min(this.shown.length, 60);
    switch (combo) {
      case 'escape':
      case 'mod+k':
        this.app.popLayer(this);
        return true;
      case 'arrowdown':
      case 'ctrl+n':
        this.sel = n ? (this.sel + 1) % n : 0;
        this.paintSel();
        return true;
      case 'arrowup':
      case 'ctrl+p':
        this.sel = n ? (this.sel - 1 + n) % n : 0;
        this.paintSel();
        return true;
      case 'enter':
        this.choose(this.sel);
        return true;
    }
    return false;
  }

  close() {
    this.wrap.remove();
  }
}

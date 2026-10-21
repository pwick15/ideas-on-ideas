import type { App } from '../app/app';
import { escapeHtml, kbd } from '../app/keys';
import { loadIndex } from '../model/storage';
import { templateFor } from '../model/templates';
import type { MapMeta } from '../model/types';
import { Composer } from './composer';
import { fuzzy, h, icon, modal, relTime, type Layer } from './dom';

export class MapsPanel implements Layer {
  readonly name = 'maps';
  private wrap: HTMLDivElement;
  private input: HTMLInputElement;
  private list: HTMLDivElement;
  private shown: (MapMeta | 'new')[] = [];
  private sel = 1;
  private armed: string | null = null;

  constructor(private app: App) {
    app.store.flush();
    this.input = h('input', { class: 'palette-input', placeholder: 'Find a map…', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Find a map' });
    this.list = h('div', { class: 'palette-list maps-list', role: 'listbox' });
    const foot = h('div', 'panel-foot');
    foot.innerHTML = [
      ['enter', 'open'],
      ['mod+d', 'duplicate'],
      ['mod+backspace', 'delete'],
    ]
      .map(([k, l]) => `<span class="hint">${kbd(k)}<span>${l}</span></span>`)
      .join('');
    const backup = h('button', { class: 'text-btn', type: 'button' }, 'Back up all');
    backup.addEventListener('click', () => app.exportBackup());
    const imp = h('button', { class: 'text-btn', type: 'button' }, 'Import');
    imp.addEventListener('click', () => {
      app.popLayer(this);
      app.importBackup();
    });
    foot.append(h('span', 'grow'), backup, imp);
    const head = h('div', 'panel-head', h('h2', '', 'Maps'), h('span', 'muted', 'Stored in this browser only'));
    this.wrap = modal('maps', () => app.popLayer(this), head, this.input, this.list, foot);
    this.input.addEventListener('input', () => {
      this.sel = this.input.value ? 0 : 1;
      this.render();
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
    const maps = loadIndex();
    let filtered: MapMeta[] = maps;
    if (q.trim()) {
      filtered = maps
        .map((m) => ({ m, s: fuzzy(q, m.title) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.m);
    }
    this.shown = ['new', ...filtered];
    this.sel = Math.min(this.sel, this.shown.length - 1);
    this.list.replaceChildren(
      ...this.shown.map((m, i) => {
        const row = h('div', { class: 'row', 'data-i': i, role: 'option' });
        if (m === 'new') {
          row.classList.add('row-new');
          row.append(icon('plus'), h('span', 'row-title', q.trim() ? `New map: “${q.trim()}”` : 'New map'));
          const k = h('span', 'row-keys');
          k.innerHTML = kbd('shift+n');
          row.append(k);
          return row;
        }
        const current = m.id === this.app.doc.id;
        row.append(icon(m.kind), h('span', 'row-title', m.title));
        const meta = h('span', 'row-group');
        meta.innerHTML = `${escapeHtml(templateFor(m.kind).label)} · ${m.count - 1} ideas · ${relTime(m.updated)}${current ? ' · <b>open</b>' : ''}`;
        row.append(meta);
        if (this.armed === m.id) row.classList.add('armed');
        return row;
      }),
    );
    this.paint();
  }

  private paint() {
    const rows = this.list.querySelectorAll<HTMLElement>('.row');
    rows.forEach((r, i) => r.classList.toggle('sel', i === this.sel));
    rows[this.sel]?.scrollIntoView({ block: 'nearest' });
  }

  private choose(i: number) {
    const m = this.shown[i];
    if (!m) return;
    this.app.popLayer(this);
    if (m === 'new') this.app.pushLayer(new Composer(this.app, this.input.value.trim()));
    else this.app.openMap(m.id);
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    const n = this.shown.length;
    const cur = this.shown[this.sel];
    if (combo !== 'mod+backspace' && combo !== 'mod+delete' && this.armed) {
      this.armed = null;
      this.render();
    }
    switch (combo) {
      case 'escape':
        this.app.popLayer(this);
        return true;
      case 'arrowdown':
        this.sel = (this.sel + 1) % n;
        this.paint();
        return true;
      case 'arrowup':
        this.sel = (this.sel - 1 + n) % n;
        this.paint();
        return true;
      case 'enter':
        this.choose(this.sel);
        return true;
      case 'mod+d':
        if (cur && cur !== 'new') {
          this.app.duplicateMap(cur.id);
          this.app.toast('Map duplicated');
          this.render();
        }
        return true;
      case 'mod+backspace':
      case 'mod+delete':
        if (!cur || cur === 'new') return true;
        if (this.armed !== cur.id) {
          this.armed = cur.id;
          this.app.toast(`Press again to delete “${cur.title}”. This cannot be undone.`, 'warn');
          this.render();
          return true;
        }
        this.armed = null;
        this.app.deleteMapById(cur.id);
        this.app.toast(`Deleted “${cur.title}”`);
        this.render();
        return true;
    }
    return false;
  }

  close() {
    this.wrap.remove();
  }
}

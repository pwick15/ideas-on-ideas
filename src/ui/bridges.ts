import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { labelKey, linksOf, removeLink, setLink } from '../model/ops';
import { labelHues, pathText } from '../model/tree';
import type { Id, Link } from '../model/types';
import { h, icon, type Layer } from './dom';
import { LinkEditor } from './linkedit';
import { LinkMode } from './linkmode';

type Kind = 'out' | 'in' | 'plain';
interface Row {
  link: Link;
  kind: Kind;
  /** Where Enter goes: the idea at the other end, or the source in the whole-map list. */
  goto: Id;
}

const GROUPS: { kind: Kind; title: string; arrow: string }[] = [
  { kind: 'out', title: 'Goes to', arrow: '→' },
  { kind: 'in', title: 'Comes from', arrow: '←' },
  { kind: 'plain', title: 'Linked with', arrow: '—' },
];

/**
 * A drawer listing the bridges on the focused idea, split by direction. Enter follows one to the
 * idea at the other end and the drawer follows, so you can walk a chain of connections. Tab
 * switches to every bridge on the map, grouped by label.
 */
export class BridgesPanel implements Layer {
  readonly name = 'bridges';
  private el: HTMLElement;
  private list: HTMLDivElement;
  private title: HTMLHeadingElement;
  private path: HTMLDivElement;
  private mode: 'idea' | 'all' = 'idea';
  private id: Id;
  private rows: Row[] = [];
  private sel = 0;
  private trail: Id[] = [];
  private prevInset: number;

  constructor(private app: App, id: Id) {
    this.id = id;
    this.path = h('div', 'notes-path');
    this.title = h('h2', 'notes-title');
    const done = h('button', { class: 'icon-btn', type: 'button', title: 'Done (Esc)', 'aria-label': 'Close bridges' }, icon('close'));
    done.addEventListener('click', () => app.popLayer(this));
    this.list = h('div', 'harvest-list');
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.bridge-item');
      if (!row) return;
      this.sel = Number(row.dataset.i);
      this.paint();
    });
    this.list.addEventListener('dblclick', () => this.go());
    const foot = h('div', 'panel-foot');
    foot.innerHTML = [
      ['arrowup arrowdown', 'browse'],
      ['enter', 'follow'],
      ['arrowleft', 'back'],
      ['a', 'add'],
      ['e', 'edit'],
      ['r', 'reverse'],
      ['backspace', 'remove'],
      ['tab', 'whole map'],
    ]
      .map(([k, l]) => `<span class="hint">${k.split(' ').map(kbd).join('')}<span>${l}</span></span>`)
      .join('');
    this.el = h(
      'aside',
      { class: 'drawer bridges', 'aria-label': 'Bridges' },
      h('div', 'notes-head', h('div', 'notes-heading', this.path, this.title), done),
      this.list,
      foot,
    );
    document.body.append(this.el);
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.prevInset = app.view.insets.right;
    app.view.insets.right = Math.min(400, window.innerWidth * 0.9) + 24;
    this.render();
  }

  private render() {
    const doc = this.app.doc;
    const idea = doc.nodes[this.id];
    if (!idea) {
      this.app.popLayer(this);
      return;
    }
    this.app.view.ensureVisible(this.id);
    const name = (id: Id) => doc.nodes[id]?.text || 'Untitled';
    const hues = labelHues(doc);
    const chip = (l: Link) => {
      const c = h('span', l.label ? 'bi-chip' : 'bi-chip none', l.label ?? 'bridge');
      const hue = l.label ? hues.get(labelKey(l.label)) : undefined;
      if (hue !== undefined) c.style.setProperty('--lh', String(hue));
      return c;
    };
    const frag = document.createDocumentFragment();
    this.rows = [];

    if (this.mode === 'idea') {
      this.title.textContent = name(this.id);
      this.path.textContent = ['Bridges', ...pathText(doc.nodes, this.id)].join(' › ');
      const mine = linksOf(doc, this.id);
      for (const g of GROUPS) {
        const group = mine.filter((l) => (l.dir ? (l.a === this.id ? 'out' : 'in') : 'plain') === g.kind);
        if (!group.length) continue;
        frag.append(h('div', 'tier', h('span', '', g.title)));
        for (const l of group) {
          const other = l.a === this.id ? l.b : l.a;
          const i = this.rows.push({ link: l, kind: g.kind, goto: other }) - 1;
          frag.append(
            h(
              'div',
              { class: 'bridge-item', 'data-i': i },
              h('div', 'bi-line', chip(l), h('span', 'bi-arrow', g.arrow), h('span', 'hi-text', name(other))),
              h('div', 'hi-path', pathText(doc.nodes, other).join(' › ') || 'Center'),
            ),
          );
        }
      }
      if (!this.rows.length) {
        frag.append(
          h(
            'div',
            'empty',
            h('p', '', 'No bridges on this idea yet.'),
            h('p', '', 'Press A to connect it to another idea and say how they relate.'),
          ),
        );
      }
    } else {
      this.title.textContent = 'Every bridge';
      this.path.textContent = 'Whole map';
      const keys: string[] = [];
      for (const l of doc.links) if (!keys.includes(labelKey(l.label))) keys.push(labelKey(l.label));
      keys.sort((x, y) => (x === '' ? 1 : y === '' ? -1 : 0));
      for (const k of keys) {
        const group = doc.links.filter((l) => labelKey(l.label) === k);
        const first = group[0];
        const head = h('div', 'tier', first.label ? chip(first) : h('span', '', 'Unlabelled'), h('span', 'muted', String(group.length)));
        frag.append(head);
        for (const l of group) {
          const i = this.rows.push({ link: l, kind: l.dir ? 'out' : 'plain', goto: l.a }) - 1;
          frag.append(
            h(
              'div',
              { class: 'bridge-item', 'data-i': i },
              h('div', 'bi-line', h('span', 'hi-text', name(l.a)), h('span', 'bi-arrow', l.dir ? '→' : '—'), h('span', 'hi-text', name(l.b))),
            ),
          );
        }
      }
      if (!this.rows.length) frag.append(h('div', 'empty', h('p', '', 'No bridges on this map yet.')));
    }
    this.list.replaceChildren(frag);
    this.sel = Math.max(0, Math.min(this.sel, this.rows.length - 1));
    this.paint();
  }

  private paint() {
    this.list.querySelectorAll<HTMLElement>('.bridge-item').forEach((r) => r.classList.toggle('sel', Number(r.dataset.i) === this.sel));
    this.list.querySelector('.bridge-item.sel')?.scrollIntoView({ block: 'nearest' });
    // The selected bridge's label lights up every bridge of that kind on the map.
    const row = this.rows[this.sel];
    if (!row?.link.label) return this.app.view.setLinkSpotlight(null);
    const k = labelKey(row.link.label);
    this.app.view.setLinkSpotlight(new Set(this.app.doc.links.filter((l) => labelKey(l.label) === k).map((l) => l.id)));
  }

  private go() {
    const row = this.rows[this.sel];
    if (!row) return;
    if (this.mode === 'idea') this.trail.push(this.id);
    this.mode = 'idea';
    this.sel = 0;
    this.id = row.goto;
    this.app.setFocus(row.goto, { center: true, quiet: true });
    this.render();
  }

  private back() {
    const prev = this.trail.pop();
    if (!prev || !this.app.doc.nodes[prev]) return;
    this.mode = 'idea';
    this.sel = 0;
    this.id = prev;
    this.app.setFocus(prev, { center: true, quiet: true });
    this.render();
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    const n = this.rows.length;
    const row = this.rows[this.sel];
    switch (combo) {
      case 'escape':
      case 'b':
        this.app.popLayer(this);
        return true;
      case 'arrowdown':
      case 'j':
        if (n) this.sel = (this.sel + 1) % n;
        this.paint();
        return true;
      case 'arrowup':
      case 'k':
        if (n) this.sel = (this.sel - 1 + n) % n;
        this.paint();
        return true;
      case 'enter':
        this.go();
        return true;
      case 'arrowleft':
        this.back();
        return true;
      case 'tab':
        this.mode = this.mode === 'idea' ? 'all' : 'idea';
        this.sel = 0;
        this.render();
        return true;
      case 'a':
        this.app.popLayer(this);
        if (this.app.doc.nodes[this.id]) {
          this.app.setFocus(this.id, { quiet: true });
          this.app.pushLayer(new LinkMode(this.app));
        }
        return true;
      case 'e':
        if (row) this.app.pushLayer(new LinkEditor(this.app, row.link.a, row.link.b, this.id));
        return true;
      case 'r':
        if (row?.link.dir) {
          this.app.commit(setLink(this.app.doc, row.link.b, row.link.a, row.link.label, true), this.id);
          this.render();
        }
        return true;
      case 'backspace':
      case 'delete':
        if (row) {
          this.app.commit(removeLink(this.app.doc, row.link.id), this.id);
          this.render();
        }
        return true;
      case 'mod+z':
        this.app.undo();
        this.render();
        return true;
    }
    return true;
  }

  pick(id: Id) {
    this.app.setFocus(id, { quiet: true });
    this.mode = 'idea';
    this.id = id;
    this.sel = 0;
    this.render();
  }

  resume() {
    this.render();
  }

  close() {
    this.app.view.setLinkSpotlight(null);
    this.app.view.insets.right = this.prevInset;
    this.el.classList.remove('open');
    setTimeout(() => this.el.remove(), 220);
  }
}

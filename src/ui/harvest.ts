import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { harvestItems, harvestToMarkdown, type HarvestItem } from '../model/markdown';
import { setCut, setRating } from '../model/ops';
import { titleOf } from '../model/storage';
import type { Rating } from '../model/types';
import { copyText, download, h, slug, type Layer } from './dom';

const TIERS: Record<Rating, string> = { 3: 'Strongest', 2: 'Promising', 1: 'Worth a look' };

/** A side drawer listing every rated idea, best first. Moving through it moves the map. */
export class Harvest implements Layer {
  readonly name = 'harvest';
  private el: HTMLElement;
  private list: HTMLDivElement;
  private items: HarvestItem[] = [];
  private sel = 0;
  private prevInset: number;

  constructor(private app: App) {
    this.list = h('div', 'harvest-list');
    const copy = h('button', { class: 'text-btn', type: 'button' }, 'Copy Markdown');
    copy.addEventListener('click', () => this.copy());
    const dl = h('button', { class: 'text-btn', type: 'button' }, 'Download .md');
    dl.addEventListener('click', () => this.download());
    const foot = h('div', 'panel-foot');
    foot.innerHTML = [
      ['arrowup arrowdown', 'browse'],
      ['1 2 3', 'rerate'],
      ['x', 'cut'],
      ['c', 'copy'],
    ]
      .map(([k, l]) => `<span class="hint">${k.split(' ').map(kbd).join('')}<span>${l}</span></span>`)
      .join('');
    this.el = h(
      'aside',
      { class: 'drawer harvest', 'aria-label': 'Harvest' },
      h('div', 'panel-head', h('h2', '', 'Harvest'), h('span', 'muted', 'Rated ideas, best first')),
      this.list,
      h('div', 'drawer-actions', copy, dl),
      foot,
    );
    document.body.append(this.el);
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.prevInset = app.view.insets.right;
    app.view.insets.right = Math.min(420, window.innerWidth * 0.9) + 24;
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.harvest-item');
      if (row) {
        this.sel = Number(row.dataset.i);
        this.paint(true);
      }
    });
    this.render();
    const i = this.items.findIndex((it) => it.id === app.focus);
    this.sel = Math.max(0, i);
    this.paint(true);
  }

  private render() {
    this.items = harvestItems(this.app.doc);
    if (!this.items.length) {
      this.list.innerHTML =
        '<div class="empty"><p>Nothing harvested yet.</p><p>Rate ideas with <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>, or press <kbd>P</kbd> to prune the whole map.</p></div>';
      return;
    }
    const frag = document.createDocumentFragment();
    let tier: Rating | 0 = 0;
    this.items.forEach((it, i) => {
      if (it.rating !== tier) {
        tier = it.rating;
        frag.append(h('div', 'tier', h('span', 'stars', '✦'.repeat(tier)), h('span', '', TIERS[tier])));
      }
      const row = h(
        'div',
        { class: 'harvest-item', 'data-i': i },
        h('div', 'hi-text', it.text || 'Untitled'),
        h('div', 'hi-path', it.path.join(' › ')),
      );
      frag.append(row);
    });
    this.list.replaceChildren(frag);
  }

  private paint(moveMap = false) {
    const rows = this.list.querySelectorAll<HTMLElement>('.harvest-item');
    rows.forEach((r, i) => r.classList.toggle('sel', i === this.sel));
    rows[this.sel]?.scrollIntoView({ block: 'nearest' });
    const it = this.items[this.sel];
    if (moveMap && it) this.app.setFocus(it.id, { quiet: true });
  }

  private async copy() {
    const ok = await copyText(harvestToMarkdown(this.app.doc, titleOf(this.app.doc)));
    this.app.toast(ok ? 'Harvest copied as Markdown' : 'Copy failed', ok ? 'good' : 'warn');
  }

  private download() {
    const title = titleOf(this.app.doc);
    download(`${slug(title)}-harvest.md`, harvestToMarkdown(this.app.doc, title), 'text/markdown');
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    const n = this.items.length;
    const it = this.items[this.sel];
    switch (combo) {
      case 'escape':
      case 'h':
        this.app.popLayer(this);
        return true;
      case 'arrowdown':
      case 'j':
        if (n) this.sel = (this.sel + 1) % n;
        this.paint(true);
        return true;
      case 'arrowup':
      case 'k':
        if (n) this.sel = (this.sel - 1 + n) % n;
        this.paint(true);
        return true;
      case 'enter':
        this.app.popLayer(this);
        if (it) this.app.setFocus(it.id, { center: true });
        return true;
      case 'c':
      case 'mod+c':
        this.copy();
        return true;
      case 'd':
        this.download();
        return true;
      case '1':
      case '2':
      case '3':
      case 'x':
        if (!it) return true;
        this.app.commit(combo === 'x' ? setCut(this.app.doc, it.id, true) : setRating(this.app.doc, it.id, Number(combo) as Rating));
        this.render();
        this.sel = Math.min(this.sel, this.items.length - 1);
        if (combo !== 'x') this.sel = Math.max(0, this.items.findIndex((x) => x.id === it.id));
        this.paint(true);
        return true;
      case 'mod+z':
        this.app.undo();
        this.render();
        this.paint();
        return true;
    }
    return false;
  }

  close() {
    this.app.view.insets.right = this.prevInset;
    this.el.classList.remove('open');
    setTimeout(() => this.el.remove(), 220);
  }
}

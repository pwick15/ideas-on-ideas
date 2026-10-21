import type { App } from '../app/app';
import { LAYOUT_NAMES } from '../app/app';
import { isMac } from '../app/keys';
import { titleOf } from '../model/storage';
import { templateFor } from '../model/templates';
import { h, icon } from './dom';

export class Topbar {
  readonly el: HTMLElement;
  private title: HTMLButtonElement;
  private kind: HTMLSpanElement;
  private stats: HTMLSpanElement;
  private themeBtn: HTMLButtonElement;
  private layoutBtn: HTMLButtonElement;
  readonly slot: HTMLDivElement;

  constructor(private app: App) {
    const brand = h('div', 'brand', mark(), h('span', 'brand-name', 'ideas on ideas'));
    this.kind = h('span', 'kind-chip');
    this.title = h('button', { class: 'map-title', type: 'button', title: 'All maps (M)' });
    this.title.addEventListener('click', () => app.runCommand('maps.open'));
    this.stats = h('span', 'stats');
    this.slot = h('div', 'top-slot');

    const btn = (name: string, label: string, cmd: string) => {
      const b = h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label });
      b.append(icon(name));
      b.addEventListener('click', () => app.runCommand(cmd));
      return b;
    };
    this.layoutBtn = btn('layout', 'Next layout (V)', 'view.layout');
    this.themeBtn = btn('moon', 'Switch theme (Shift+T)', 'view.theme');
    const harvest = btn('harvest', 'Harvest (H)', 'judge.harvest');
    const palette = btn('command', `Commands (${isMac ? '⌘' : 'Ctrl+'}K)`, 'app.palette');
    const help = btn('help', 'Shortcuts (?)', 'app.help');

    this.el = h(
      'header',
      'topbar',
      h('div', 'top-left', brand, h('span', 'sep'), this.kind, this.title),
      this.slot,
      h('div', 'top-right', this.stats, this.layoutBtn, harvest, this.themeBtn, palette, help),
    );
  }

  update() {
    const doc = this.app.doc;
    const t = templateFor(doc.kind);
    this.kind.replaceChildren(icon(doc.kind));
    this.kind.title = t.label;
    this.title.textContent = titleOf(doc);
    let rated = 0;
    let cut = 0;
    const nodes = Object.values(doc.nodes);
    for (const n of nodes) {
      if (n.rating) rated++;
      if (n.cut) cut++;
    }
    const ideas = nodes.length - doc.roots.length;
    const parts = [`${ideas} ${ideas === 1 ? 'idea' : 'ideas'}`];
    if (rated) parts.push(`${rated} ✦`);
    if (cut) parts.push(`${cut} cut${this.app.hideCut ? ' (hidden)' : ''}`);
    this.stats.textContent = parts.join(' · ');
    this.layoutBtn.title = `Layout: ${LAYOUT_NAMES[doc.layout]} (V for next)`;
    const theme = document.documentElement.dataset.theme;
    this.themeBtn.replaceChildren(icon(theme === 'light' ? 'sun' : 'moon'));
  }
}

function mark(): HTMLSpanElement {
  const s = h('span', 'brand-mark');
  s.innerHTML =
    '<svg viewBox="0 0 32 32"><path d="M15 16C20 16 20 9 25 9" class="b1"/><path d="M15 16C20 16 20 23 25 23" class="b2"/><path d="M15 16C11 16 10 12 6.5 12" class="b3"/><circle cx="25" cy="9" r="2.4" class="b1f"/><circle cx="25" cy="23" r="2.4" class="b2f"/><circle cx="6.5" cy="12" r="2.4" class="b3f"/><circle cx="15" cy="16" r="4.2" class="c"/></svg>';
  return s;
}

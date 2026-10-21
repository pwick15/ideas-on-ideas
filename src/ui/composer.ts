import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { TEMPLATES } from '../model/templates';
import { h, icon, modal, type Layer } from './dom';

/** The new-map sheet: name the center, pick a starting shape. */
export class Composer implements Layer {
  readonly name = 'composer';
  private wrap: HTMLDivElement;
  private input: HTMLInputElement;
  private chips: HTMLDivElement;
  private seeds: HTMLDivElement;
  private sel = 0;

  constructor(private app: App, initial = '') {
    this.input = h('input', { class: 'composer-input', spellcheck: 'true', autocomplete: 'off', 'aria-label': 'Central idea' });
    this.input.value = initial;
    this.chips = h('div', { class: 'chips', role: 'radiogroup' });
    this.seeds = h('div', 'seeds');
    TEMPLATES.forEach((t, i) => {
      const c = h('button', { class: 'chip', type: 'button', role: 'radio', 'data-i': i }, icon(t.kind), h('span', '', t.label));
      c.addEventListener('click', () => {
        this.sel = i;
        this.paint();
        this.input.focus();
      });
      this.chips.append(c);
    });
    const foot = h('div', 'panel-foot');
    foot.innerHTML = [
      ['tab', 'next kind'],
      ['shift+tab', 'previous'],
      ['enter', 'create'],
      ['escape', 'cancel'],
    ]
      .map(([k, l]) => `<span class="hint">${kbd(k)}<span>${l}</span></span>`)
      .join('');
    this.wrap = modal(
      'composer',
      () => app.popLayer(this),
      h('div', 'composer-eyebrow', 'New map'),
      this.input,
      this.chips,
      this.seeds,
      foot,
    );
    this.paint();
    requestAnimationFrame(() => this.input.focus());
  }

  private paint() {
    const t = TEMPLATES[this.sel];
    this.chips.querySelectorAll<HTMLElement>('.chip').forEach((c, i) => {
      c.classList.toggle('sel', i === this.sel);
      c.setAttribute('aria-checked', String(i === this.sel));
    });
    this.input.placeholder = t.placeholder;
    this.seeds.replaceChildren(
      h('p', 'muted', t.blurb),
      ...(t.seeds.length ? [h('div', 'seed-list', ...t.seeds.map((s) => h('span', 'seed', s)))] : []),
    );
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    switch (combo) {
      case 'escape':
        this.app.popLayer(this);
        return true;
      case 'tab':
        this.sel = (this.sel + 1) % TEMPLATES.length;
        this.paint();
        return true;
      case 'shift+tab':
        this.sel = (this.sel - 1 + TEMPLATES.length) % TEMPLATES.length;
        this.paint();
        return true;
      case 'enter': {
        const text = this.input.value.trim();
        const kind = TEMPLATES[this.sel].kind;
        this.app.popLayer(this);
        this.app.newMap(kind, text);
        return true;
      }
    }
    return false;
  }

  close() {
    this.wrap.remove();
  }
}

import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { cleanLabel, findLink, labelKey, labelsInUse, removeLink, setLink } from '../model/ops';
import { labelHues } from '../model/tree';
import type { Id } from '../model/types';
import { h, modal, type Layer } from './dom';

type Dir = 'none' | 'fwd' | 'back';
const ORDER: Dir[] = ['none', 'fwd', 'back'];
const ARROWS: Record<Dir, string> = { none: '—', fwd: '→', back: '←' };
const trim = (t: string) => (t.length > 34 ? t.slice(0, 33) + '…' : t) || 'Untitled';

/**
 * Names a bridge: how two ideas relate and which way it runs. Opens when a bridge is made, and
 * again from the bridges drawer to change one. Enter saves, an empty label keeps it plain.
 */
export class LinkEditor implements Layer {
  readonly name = 'linkedit';
  private wrap: HTMLDivElement;
  private input: HTMLInputElement;
  private arrow: HTMLButtonElement;
  private chips: HTMLDivElement;
  private from: Id;
  private to: Id;
  private dir: Dir = 'none';
  /** Until the arrow is pressed by hand, it follows the label: a new label is a one-way relation. */
  private auto = true;
  private chosen = -1;
  /** What was typed, so stepping through suggestions does not narrow them. */
  private typed = '';
  private existing;

  /** `back` is the idea that keeps focus once this closes. */
  constructor(private app: App, a: Id, b: Id, private back: Id = a) {
    const doc = app.doc;
    this.existing = findLink(doc, a, b);
    // A one-way bridge always reads from its source.
    const flipped = !!this.existing?.dir && this.existing.a === b;
    this.from = flipped ? b : a;
    this.to = flipped ? a : b;
    if (this.existing?.dir) {
      this.dir = 'fwd';
      this.auto = false;
    } else if (this.existing) this.auto = false;

    this.input = h('input', {
      class: 'link-input',
      placeholder: 'How are they connected? flows into, backs up, same tier as…',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Bridge label',
    });
    this.input.value = this.existing?.label ?? '';
    this.input.addEventListener('input', () => {
      this.typed = this.input.value;
      this.chosen = -1;
      this.autoDir();
      this.paint();
    });
    this.arrow = h('button', { class: 'link-arrow', type: 'button', title: 'Direction (Tab)', 'aria-label': 'Change direction' });
    this.arrow.addEventListener('click', () => {
      this.cycle();
      this.input.focus();
    });
    this.chips = h('div', 'chips link-chips');

    const foot = h('div', 'panel-foot');
    foot.innerHTML = [
      ['enter', 'save'],
      ['tab', 'direction'],
      ['arrowdown', 'suggestions'],
      ['escape', 'cancel'],
    ]
      .map(([k, l]) => `<span class="hint">${kbd(k)}<span>${l}</span></span>`)
      .join('');
    if (this.existing) {
      const rm = h('button', { class: 'text-btn', type: 'button' }, 'Remove bridge');
      rm.addEventListener('click', () => this.remove());
      foot.append(h('span', 'grow'), rm);
    }
    const text = (id: Id) => h('span', 'link-end', trim(doc.nodes[id]?.text ?? ''));
    this.wrap = modal(
      'link-editor',
      () => app.popLayer(this),
      h('div', 'composer-eyebrow', this.existing ? 'Edit bridge' : 'New bridge'),
      h('div', 'link-ends', text(this.from), this.arrow, text(this.to)),
      this.input,
      this.chips,
      foot,
    );
    this.paint();
    requestAnimationFrame(() => {
      this.input.focus();
      this.input.select();
    });
  }

  private suggestions() {
    const q = labelKey(this.typed.trim());
    return labelsInUse(this.app.doc)
      .filter((s) => !q || labelKey(s.label).includes(q))
      .slice(0, 8);
  }

  private autoDir() {
    if (!this.auto) return;
    const label = cleanLabel(this.input.value);
    const known = labelsInUse(this.app.doc).find((s) => labelKey(s.label) === labelKey(label));
    this.dir = known ? (known.dir ? 'fwd' : 'none') : label ? 'fwd' : 'none';
  }

  private cycle() {
    this.auto = false;
    this.dir = ORDER[(ORDER.indexOf(this.dir) + 1) % ORDER.length];
    this.paint();
  }

  private paint() {
    this.arrow.textContent = ARROWS[this.dir];
    this.arrow.classList.toggle('plain', this.dir === 'none');
    const sugg = this.suggestions();
    const hues = labelHues(this.app.doc);
    this.chips.replaceChildren(
      ...sugg.map((s, i) => {
        const c = h('button', { class: 'chip', type: 'button' }, s.label, h('span', 'chip-n', String(s.count)));
        c.classList.toggle('sel', i === this.chosen);
        const hue = hues.get(labelKey(s.label));
        if (hue !== undefined) c.style.setProperty('--lh', String(hue));
        c.addEventListener('click', () => this.choose(s.label));
        return c;
      }),
    );
  }

  private choose(label: string) {
    this.input.value = label;
    this.typed = '';
    this.chosen = -1;
    this.autoDir();
    this.paint();
    this.input.focus();
  }

  private save() {
    const label = cleanLabel(this.input.value);
    const { from, to, dir } = this;
    const doc = dir === 'back' ? setLink(this.app.doc, to, from, label, true) : setLink(this.app.doc, from, to, label, dir === 'fwd');
    this.app.popLayer(this);
    this.app.commit(doc, this.back);
    this.app.toast(this.existing ? 'Bridge updated' : 'Bridge added', 'good');
  }

  private remove() {
    if (!this.existing) return;
    const doc = removeLink(this.app.doc, this.existing.id);
    this.app.popLayer(this);
    this.app.commit(doc, this.back);
    this.app.toast('Bridge removed');
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    switch (combo) {
      case 'escape':
        this.app.popLayer(this);
        return true;
      case 'enter':
        this.save();
        return true;
      case 'tab':
        this.cycle();
        return true;
      case 'shift+tab':
        this.cycle();
        this.cycle();
        return true;
      case 'mod+backspace':
        this.remove();
        return true;
      case 'arrowdown':
      case 'arrowup': {
        const sugg = this.suggestions();
        if (!sugg.length) return true;
        const step = combo === 'arrowdown' ? 1 : -1;
        this.chosen = (this.chosen + step + sugg.length) % sugg.length;
        this.input.value = sugg[this.chosen].label;
        this.autoDir();
        this.paint();
        return true;
      }
    }
    return false;
  }

  close() {
    this.wrap.remove();
    if (this.app.focus !== this.back && this.app.doc.nodes[this.back]) this.app.setFocus(this.back, { quiet: true });
  }
}

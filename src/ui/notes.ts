import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { patchNode } from '../model/ops';
import { pathText } from '../model/tree';
import type { Id } from '../model/types';
import { h, icon, type Layer } from './dom';

const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
};

/**
 * A scratch pad for one idea, in a drawer beside the map. It saves as you type. Clicking another
 * idea switches to its notes; after a click on the map, arrows browse and the notes follow.
 */
export class NotesPanel implements Layer {
  readonly name = 'notes';
  private el: HTMLElement;
  private path: HTMLDivElement;
  private title: HTMLHeadingElement;
  private input: HTMLTextAreaElement;
  private id: Id;
  /** Each visit to an idea's notes is one undo step, however long the writing. */
  private recorded = false;
  private prevInset: number;

  constructor(private app: App, id: Id) {
    this.id = id;
    this.path = h('div', 'notes-path');
    this.title = h('h2', 'notes-title');
    this.input = h('textarea', {
      class: 'notes-input',
      placeholder: 'Write it out. Details, reasons, examples, next steps. These notes stay with the idea.',
      spellcheck: 'true',
      'aria-label': 'Notes',
    });
    this.input.addEventListener('input', () => this.save());
    const done = h('button', { class: 'icon-btn', type: 'button', title: 'Done (Esc)', 'aria-label': 'Close notes' }, icon('close'));
    done.addEventListener('click', () => app.popLayer(this));
    const foot = h('div', 'panel-foot');
    foot.innerHTML = `<span class="hint">${kbd('escape')}<span>done</span></span><span class="muted">Click another idea to switch. Saved as you type.</span>`;
    this.el = h(
      'aside',
      { class: 'drawer notes', 'aria-label': 'Notes' },
      h('div', 'notes-head', h('div', 'notes-heading', this.path, this.title), done),
      this.input,
      foot,
    );
    document.body.append(this.el);
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.prevInset = app.view.insets.right;
    app.view.insets.right = Math.min(460, window.innerWidth - 24) + 24;
    this.show(id);
  }

  private show(id: Id, write = true) {
    const doc = this.app.doc;
    const n = doc.nodes[id];
    if (!n) return;
    this.id = id;
    this.recorded = false;
    this.title.textContent = n.text || 'Untitled';
    const path = pathText(doc.nodes, id);
    this.path.textContent = path.length ? path.join(' › ') : 'Center';
    this.input.value = n.note ?? '';
    this.app.view.ensureVisible(id);
    if (write) {
      this.input.focus({ preventScroll: true });
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }
  }

  private save() {
    const doc = this.app.doc;
    const n = doc.nodes[this.id];
    if (!n) return;
    const note = this.input.value.trimEnd() || undefined;
    if (note === n.note) return;
    const next = patchNode(doc, this.id, { note });
    if (this.recorded) this.app.store.amend(next);
    else {
      this.app.store.commit(next, this.id);
      this.recorded = true;
    }
    // Redraw only when the idea gains or loses its note badge.
    if (!note !== !n.note) this.app.refresh(false);
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    if (combo === 'escape' || combo === 'mod+enter') {
      this.app.popLayer(this);
      return true;
    }
    if (document.activeElement === this.input) return false;
    const dir = ARROWS[combo];
    if (dir) {
      this.app.move(dir);
      if (this.app.focus && this.app.focus !== this.id) this.show(this.app.focus, false);
      return true;
    }
    // Any other key goes back to writing.
    this.input.focus({ preventScroll: true });
    return combo === 'enter';
  }

  pick(id: string) {
    this.app.setFocus(id, { quiet: true });
    this.show(id);
  }

  close() {
    this.input.blur();
    this.app.view.insets.right = this.prevInset;
    this.el.classList.remove('open');
    setTimeout(() => this.el.remove(), 220);
    this.app.refresh(false);
  }
}

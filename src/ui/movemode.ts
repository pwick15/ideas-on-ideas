import type { App } from '../app/app';
import type { Id } from '../model/types';
import type { DropWhere } from '../view/mapview';
import { h, type Layer } from './dom';
import { JumpHints } from './jump';

const clip = (s: string) => (s.length > 40 ? s.slice(0, 39) + '…' : s) || 'Untitled';

/** Pick a new home for an idea. Arrows or jump letters choose; Enter nests it there, Shift+Enter puts it after. */
export class MoveMode implements Layer {
  readonly name = 'move';
  private from: Id;
  /** What is being moved: the whole selection, or the focused idea. */
  private ids: Id[];
  private hud: HTMLElement;
  private dest: HTMLSpanElement;

  constructor(private app: App) {
    this.from = app.focus!;
    this.ids = app.selection.size ? app.topLevel(app.selection) : [this.from];
    this.dest = h('span', 'move-dest');
    this.hud = h(
      'div',
      'hud move-hud',
      h('span', 'hud-title', 'Move'),
      h('span', 'hud-text', `${this.what()} into `, this.dest),
    );
    app.topbar.slot.append(this.hud);
    this.update();
  }

  private what() {
    return this.ids.length > 1 ? `${this.ids.length} ideas` : `“${clip(this.app.doc.nodes[this.ids[0]].text)}”`;
  }

  private inside(to: Id) {
    return this.ids.some((i) => this.app.view.isWithin(to, i));
  }

  private update() {
    const to = this.app.focus;
    const valid = !!to && !this.inside(to);
    this.app.view.setDropMarks(this.ids, to && !this.ids.includes(to) ? { id: to, where: 'into' } : null, valid);
    this.dest.textContent = to && valid ? `“${clip(this.app.doc.nodes[to].text)}”` : '…';
  }

  private drop(to: Id | null, where: DropWhere) {
    if (!to || this.inside(to)) {
      this.app.view.flash(to ?? this.from, 'bump');
      this.app.toast(to && this.ids.includes(to) ? 'Arrows or F pick where it goes' : 'An idea cannot go inside itself', 'warn');
      return;
    }
    const text = clip(this.app.doc.nodes[to].text);
    this.app.popLayer(this);
    const subject = this.ids.length > 1 ? `${this.ids.length} ideas` : 'Moved';
    if (this.app.moveIdeas(this.ids, { id: to, where }, this.from)) {
      const verb = this.ids.length > 1 ? `${subject} moved` : subject;
      this.app.toast(where === 'into' ? `${verb} into “${text}”` : `${verb} after “${text}”`, 'good');
    } else {
      this.app.setFocus(this.from);
      this.app.toast('It is already there');
    }
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    switch (combo) {
      case 'escape':
      case 'g':
        this.app.popLayer(this);
        this.app.setFocus(this.from);
        return true;
      case 'arrowup':
      case 'arrowdown':
      case 'arrowleft':
      case 'arrowright':
        this.app.move(combo.slice(5) as 'up' | 'down' | 'left' | 'right');
        this.update();
        return true;
      case 'f':
        this.app.layers.push(new JumpHints(this.app, (id) => this.app.setFocus(id)));
        this.app.hintbar.update();
        return true;
      case '[':
        this.app.focusRoot(-1);
        this.update();
        return true;
      case ']':
        this.app.focusRoot(1);
        this.update();
        return true;
      case 'enter':
        this.drop(this.app.focus, 'into');
        return true;
      case 'shift+enter':
        this.drop(this.app.focus, 'after');
        return true;
    }
    return true;
  }

  pick(id: Id) {
    this.drop(id, 'into');
  }

  resume() {
    this.update();
  }

  hints(): [string, string][] {
    return [
      ['arrowup arrowdown arrowleft arrowright', 'choose'],
      ['f', 'jump'],
      ['enter', 'put inside'],
      ['shift+enter', 'put after'],
      ['escape', 'cancel'],
    ];
  }

  close() {
    this.app.view.setDropMarks(null, null);
    this.hud.remove();
  }
}

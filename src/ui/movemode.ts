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
  private hud: HTMLElement;
  private dest: HTMLSpanElement;

  constructor(private app: App) {
    this.from = app.focus!;
    this.dest = h('span', 'move-dest');
    this.hud = h(
      'div',
      'hud move-hud',
      h('span', 'hud-title', 'Move'),
      h('span', 'hud-text', `“${clip(app.doc.nodes[this.from].text)}” into `, this.dest),
    );
    app.topbar.slot.append(this.hud);
    this.update();
  }

  private update() {
    const to = this.app.focus;
    const valid = !!to && !this.app.view.isWithin(to, this.from);
    this.app.view.setDropMarks(this.from, to && to !== this.from ? { id: to, where: 'into' } : null, valid);
    this.dest.textContent = to && valid ? `“${clip(this.app.doc.nodes[to].text)}”` : '…';
  }

  private drop(to: Id | null, where: DropWhere) {
    if (!to || this.app.view.isWithin(to, this.from)) {
      this.app.view.flash(to ?? this.from, 'bump');
      this.app.toast(to === this.from ? 'Arrows or F pick where it goes' : 'An idea cannot go inside itself', 'warn');
      return;
    }
    const text = clip(this.app.doc.nodes[to].text);
    this.app.popLayer(this);
    if (this.app.moveIdea(this.from, { id: to, where })) {
      this.app.toast(where === 'into' ? `Moved into “${text}”` : `Moved after “${text}”`, 'good');
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

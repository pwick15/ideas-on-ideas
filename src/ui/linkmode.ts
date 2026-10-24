import type { App } from '../app/app';
import type { Id } from '../model/types';
import { h, type Layer } from './dom';
import { JumpHints } from './jump';
import { LinkEditor } from './linkedit';

/** Pick a second idea to bridge to. Arrows or jump letters choose, Enter connects. */
export class LinkMode implements Layer {
  readonly name = 'link';
  private from: Id;
  private hud: HTMLElement;

  constructor(private app: App) {
    this.from = app.focus!;
    const text = app.doc.nodes[this.from].text || 'Untitled';
    this.hud = h(
      'div',
      'hud link-hud',
      h('span', 'hud-title', 'Bridge'),
      h('span', 'hud-text', `from “${text.length > 40 ? text.slice(0, 39) + '…' : text}” to…`),
    );
    app.topbar.slot.append(this.hud);
    app.view.setLinkPreview(this.from, null);
  }

  private update() {
    this.app.view.setLinkPreview(this.from, this.app.focus);
  }

  private connect(to: Id | null) {
    if (!to || to === this.from) {
      this.app.view.flash(this.from, 'bump');
      return;
    }
    this.app.popLayer(this);
    this.app.pushLayer(new LinkEditor(this.app, this.from, to));
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    switch (combo) {
      case 'escape':
      case 'l':
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
        this.connect(this.app.focus);
        return true;
    }
    return true;
  }

  pick(id: Id) {
    this.connect(id);
  }

  resume() {
    this.update();
  }

  hints(): [string, string][] {
    return [
      ['arrowup arrowdown arrowleft arrowright', 'choose'],
      ['f', 'jump'],
      ['enter', 'connect and name it'],
      ['escape', 'cancel'],
    ];
  }

  close() {
    this.app.view.setLinkPreview(null, null);
    this.hud.remove();
  }
}

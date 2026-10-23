import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { h } from './dom';

type Hint = [combo: string, label: string];

export class Hintbar {
  readonly el = h('footer', { class: 'hintbar', 'aria-hidden': 'true' });

  constructor(private app: App) {}

  update() {
    const app = this.app;
    let hints: Hint[] | null;
    const top = app.topLayer();
    if (app.editing) {
      const ed = app.editing;
      if (ed.spark) {
        hints = [['enter', 'answer, next prompt'], ['arrowup arrowdown', 'another prompt'], ['tab', 'go deeper'], ['escape', 'stop']];
      } else if (ed.isNew) {
        hints = [['enter', 'next idea'], ['tab', 'go deeper'], ['shift+tab', 'back up'], ['shift+enter', 'line break'], ['escape', 'done']];
      } else {
        hints = [['enter', 'save'], ['shift+enter', 'line break'], ['escape', 'save']];
      }
    } else if (top) {
      hints = top.hints?.().length ? top.hints() : null;
    } else if (!app.doc.roots.length) {
      hints = [['n', 'add a center'], ['m', 'maps'], ['mod+k', 'commands'], ['?', 'shortcuts']];
    } else if (app.selection.size) {
      hints = [['shift+arrowup shift+arrowdown', 'select more'], ['g', 'move'], ['alt+arrowup alt+arrowdown', 'reorder'], ['backspace', 'delete'], ['escape', 'clear']];
    } else {
      const n = app.focus ? app.doc.nodes[app.focus] : null;
      hints = n && !n.parent
        ? [['tab', 'branch out'], ['o', 'notes'], ['s', 'spark'], ['n', 'new center'], ['t', 'sprint'], ['p', 'prune'], ['v', 'layout'], ['mod+k', 'commands'], ['?', 'all keys']]
        : [['tab', 'branch'], ['enter', 'sibling'], ['space', 'edit'], ['o', 'notes'], ['g', 'move'], ['s', 'spark'], ['1 2 3', 'rate'], ['x', 'cut'], ['f', 'jump'], ['mod+k', 'commands'], ['?', 'all keys']];
    }
    if (!hints || (!app.settings.hints && !app.editing && !top)) {
      this.el.classList.toggle('hidden', !hints);
      if (!app.settings.hints && hints) {
        this.el.innerHTML = `<span class="hint">${kbd('?')}<span>shortcuts</span></span>`;
        this.el.classList.add('minimal');
        this.el.classList.remove('hidden');
      }
      return;
    }
    this.el.classList.remove('hidden', 'minimal');
    this.el.innerHTML = hints
      .map(([c, l]) => `<span class="hint">${c.split(' ').map(kbd).join('')}<span>${l}</span></span>`)
      .join('');
  }
}

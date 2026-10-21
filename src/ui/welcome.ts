import type { App } from '../app/app';
import { isMac } from '../app/keys';
import { h, modal, type Layer } from './dom';

/** First-run card. Explains the loop in four lines and gets out of the way. */
export class Welcome implements Layer {
  readonly name = 'welcome';
  private wrap: HTMLDivElement;

  constructor(private app: App) {
    const steps = h('div', 'method');
    steps.innerHTML = [
      ['Grow', 'Put a thought in the middle. <kbd>⇥</kbd> branches out, <kbd>↵</kbd> adds the next idea. Keep typing, judge nothing.'],
      ['Spark', 'Out of ideas? <kbd>S</kbd> throws a provocation at the focused idea. <kbd>T</kbd> runs a timed sprint.'],
      ['Prune', '<kbd>P</kbd> walks the map one idea at a time. <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> rate it, <kbd>X</kbd> cuts it.'],
      ['Harvest', '<kbd>H</kbd> lists the best ideas, ready to copy as Markdown.'],
    ]
      .map(([t, d], i) => `<div class="step"><span class="step-n">${i + 1}</span><div><b>${t}</b><p>${d}</p></div></div>`)
      .join('');
    const go = h('button', { class: 'primary-btn', type: 'button' }, 'Explore the example');
    go.addEventListener('click', () => app.popLayer(this));
    const fresh = h('button', { class: 'text-btn', type: 'button' }, 'Start a new map');
    fresh.addEventListener('click', () => {
      app.popLayer(this);
      app.runCommand('maps.new');
    });
    const foot = h('div', 'welcome-actions', go, fresh);
    const note = h('p', 'muted small');
    note.innerHTML = `Everything is saved in this browser. <kbd>?</kbd> shows every shortcut, <kbd>${isMac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd> finds any command.`;
    this.wrap = modal(
      'welcome',
      () => app.popLayer(this),
      h('div', 'composer-eyebrow', 'Ideas on Ideas'),
      h('h2', 'welcome-title', 'Grow first. Judge later.'),
      steps,
      foot,
      note,
    );
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    if (combo === 'enter' || combo === 'escape' || combo === 'space') {
      this.app.popLayer(this);
      return true;
    }
    if (combo === 'shift+n' || combo === 'n') {
      this.app.popLayer(this);
      this.app.runCommand('maps.new');
      return true;
    }
    return true;
  }

  close() {
    this.app.settings.welcomed = true;
    this.app.saveSettings();
    this.wrap.remove();
  }
}

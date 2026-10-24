import type { App } from '../app/app';
import { h, modal, type Layer } from './dom';

/**
 * Import a backup by pasting its JSON instead of picking a file. Cmd+Enter imports. If the text
 * is not a backup the box keeps what was pasted, so it can be fixed.
 */
export class PasteImport implements Layer {
  readonly name = 'pasteimport';
  private wrap: HTMLDivElement;
  private input: HTMLTextAreaElement;

  constructor(private app: App) {
    this.input = h('textarea', {
      class: 'paste-input',
      placeholder: 'Paste the backup JSON here…',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Backup JSON',
    });
    const cancel = h('button', { class: 'text-btn', type: 'button' }, 'Cancel');
    cancel.addEventListener('click', () => app.popLayer(this));
    const go = h('button', { class: 'primary-btn', type: 'button' }, 'Import');
    go.addEventListener('click', () => this.submit());
    // The keys show in the hint bar below, so the foot only holds the buttons.
    const foot = h('div', 'panel-foot', h('span', 'grow'), cancel, go);
    this.wrap = modal(
      'paste-import',
      () => app.popLayer(this),
      h('div', 'composer-eyebrow', 'Import'),
      h('p', 'muted', 'New maps are added next to yours. Nothing is overwritten.'),
      this.input,
      foot,
    );
    requestAnimationFrame(() => this.input.focus());
  }

  private submit() {
    const text = this.input.value.trim();
    if (!text) return this.app.toast('Paste the backup JSON first', 'warn');
    // A good import loads the last map, which closes every layer including this one.
    if (this.app.importJson(text)) this.app.popLayer(this);
    else this.input.focus();
  }

  hints(): [string, string][] {
    return [
      ['mod+enter', 'import'],
      ['escape', 'cancel'],
    ];
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    if (combo === 'escape') {
      this.app.popLayer(this);
      return true;
    }
    if (combo === 'mod+enter') {
      this.submit();
      return true;
    }
    // Typing, paste and plain Enter belong to the textarea.
    return false;
  }

  close() {
    this.wrap.remove();
  }
}

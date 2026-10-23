import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { h, modal, type Layer } from './dom';

/** A small yes/no dialog. Enter confirms, Escape cancels. */
export class Confirm implements Layer {
  readonly name = 'confirm';
  private wrap: HTMLDivElement;

  constructor(
    private app: App,
    title: string,
    body: string,
    okLabel: string,
    private onOk: () => void,
  ) {
    const ok = h('button', { class: 'primary-btn danger-btn', type: 'button' }, okLabel);
    ok.addEventListener('click', () => this.accept());
    const cancel = h('button', { class: 'text-btn', type: 'button' }, 'Cancel');
    cancel.addEventListener('click', () => app.popLayer(this));
    const foot = h('div', 'panel-foot');
    foot.innerHTML = [
      ['enter', okLabel.toLowerCase()],
      ['escape', 'cancel'],
    ]
      .map(([k, l]) => `<span class="hint">${kbd(k)}<span>${l}</span></span>`)
      .join('');
    foot.append(h('span', 'grow'), cancel, ok);
    this.wrap = modal('confirm', () => app.popLayer(this), h('h2', '', title), h('p', 'muted', body), foot);
    requestAnimationFrame(() => ok.focus());
  }

  private accept() {
    this.app.popLayer(this);
    this.onOk();
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    if (combo === 'escape') this.app.popLayer(this);
    else if (combo === 'enter') this.accept();
    // Swallow everything else so keys don't reach the layer underneath.
    return true;
  }

  close() {
    this.wrap.remove();
  }
}

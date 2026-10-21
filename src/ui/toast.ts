import { h } from './dom';

export class Toaster {
  readonly el = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });

  show(msg: string, tone: 'info' | 'warn' | 'good' = 'info', action?: { label: string; run: () => void }) {
    const t = h('div', 'toast ' + tone, h('span', 'toast-msg', msg));
    if (action) {
      const b = h('button', { class: 'toast-action', type: 'button' }, action.label);
      b.addEventListener('click', () => {
        action.run();
        dismiss();
      });
      t.append(b);
    }
    this.el.append(t);
    while (this.el.children.length > 3) this.el.firstElementChild?.remove();
    let gone = false;
    const dismiss = () => {
      if (gone) return;
      gone = true;
      t.classList.add('out');
      setTimeout(() => t.remove(), 220);
    };
    setTimeout(dismiss, action ? 4200 : 2400);
  }
}

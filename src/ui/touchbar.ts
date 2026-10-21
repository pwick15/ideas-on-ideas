import type { App } from '../app/app';
import { h } from './dom';

/** A few big buttons for phones and tablets, where there is no keyboard. CSS shows it only on touch screens. */
export class Touchbar {
  readonly el: HTMLElement;

  constructor(app: App) {
    const btn = (label: string, run: () => void, title: string) => {
      const b = h('button', { type: 'button', title, 'aria-label': title }, label);
      // Keep the editor focused when a button is tapped mid-edit.
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', run);
      return b;
    };
    const finishThen = (fn: () => void) => () => {
      if (app.editing) app.endEdit('commit');
      fn();
    };
    this.el = h(
      'nav',
      { class: 'touchbar', 'aria-label': 'Actions' },
      btn('+Branch', finishThen(() => app.runCommand('grow.child')), 'New branch'),
      btn('+Next', finishThen(() => app.runCommand('grow.sibling')), 'New sibling'),
      btn('Edit', finishThen(() => app.runCommand('grow.edit')), 'Edit'),
      btn('✦', finishThen(() => app.runCommand('spark.spark')), 'Spark'),
      btn('⌫', finishThen(() => app.runCommand('shape.delete')), 'Delete'),
      btn('↶', finishThen(() => app.undo()), 'Undo'),
      btn('⋯', finishThen(() => app.runCommand('app.palette')), 'More'),
    );
  }
}

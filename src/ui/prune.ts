import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { patchNode, setCut, setRating } from '../model/ops';
import { ancestors, isCutDeep, subtreeIds } from '../model/tree';
import type { Id, Rating } from '../model/types';
import { h, type Layer } from './dom';

/**
 * A guided pass over the map, one idea at a time. The camera tours the map and
 * spotlights each idea with its path back to the center.
 */
export class Prune implements Layer {
  readonly name = 'prune';
  private queue: Id[] = [];
  private i = 0;
  private hud: HTMLElement;
  private bar: HTMLElement;
  private count: HTMLElement;
  private tally = { rated: 0, cut: 0 };

  static start(app: App) {
    if (app.sprint) return app.toast('Finish the sprint first. Press T to stop it.', 'warn');
    const p = new Prune(app);
    if (!p.queue.length) return app.toast('Nothing to prune yet. Grow some ideas first.');
    app.pushLayer(p);
    p.show();
  }

  private constructor(private app: App) {
    this.queue = this.build();
    // Start from the focused idea when it is in the queue, so a second pass can resume.
    const at = app.focus ? this.queue.indexOf(app.focus) : -1;
    this.i = Math.max(0, at);
    this.count = h('span', 'prune-count');
    this.bar = h('span', 'prune-fill');
    const keys = h('span', 'prune-keys');
    keys.innerHTML = [
      ['1 2 3', 'rate'],
      ['x', 'cut'],
      ['arrowright', 'skip'],
      ['arrowleft', 'back'],
      ['e', 'edit'],
      ['escape', 'done'],
    ]
      .map(([k, l]) => `<span class="hint">${k.split(' ').map(kbd).join('')}<span>${l}</span></span>`)
      .join('');
    this.hud = h(
      'div',
      { class: 'hud prune-hud', role: 'status' },
      h('div', 'hud-row', h('span', 'hud-title', 'Prune'), this.count),
      h('div', 'prune-track', this.bar),
      keys,
    );
    app.topbar.slot.append(this.hud);
  }

  /** Every idea below the centers, depth first, skipping anything already under a cut. */
  private build(): Id[] {
    const doc = this.app.doc;
    const out: Id[] = [];
    const walk = (id: Id) => {
      const n = doc.nodes[id];
      if (n.parent) out.push(id);
      if (n.cut && n.parent) return;
      for (const c of n.children) walk(c);
    };
    for (const r of doc.roots) walk(r);
    return out;
  }

  private show() {
    const id = this.queue[this.i];
    if (!id) return this.finish();
    const doc = this.app.doc;
    // Unfold the path so the idea is on screen.
    let d = doc;
    for (const a of ancestors(doc.nodes, id)) if (d.nodes[a].collapsed) d = patchNode(d, a, { collapsed: undefined });
    if (d !== doc) {
      this.app.store.amend(d);
      this.app.refresh(false);
    }
    if (this.app.hideCut && isCutDeep(this.app.doc.nodes, id)) {
      this.app.hideCut = false;
      this.app.refresh(false);
    }
    this.app.setFocus(id, { center: true, quiet: true });
    const lit = new Set<Id>([id, ...ancestors(this.app.doc.nodes, id)]);
    this.app.view.setSpotlight(lit);
    this.count.textContent = `${this.i + 1} / ${this.queue.length}`;
    this.bar.style.width = `${((this.i + 1) / this.queue.length) * 100}%`;
    this.app.hintbar.update();
  }

  private advance(step = 1) {
    this.i += step;
    if (this.i < 0) this.i = 0;
    if (this.i >= this.queue.length) return this.finish();
    this.show();
  }

  private finish() {
    const { rated, cut } = this.tally;
    this.app.popLayer(this);
    const parts = [];
    if (rated) parts.push(`${rated} rated`);
    if (cut) parts.push(`${cut} cut`);
    this.app.toast(parts.length ? `Pruned: ${parts.join(', ')}. Press H to harvest.` : 'Prune finished. Press H to harvest.', 'good');
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    const id = this.queue[this.i];
    switch (combo) {
      case '1':
      case '2':
      case '3': {
        const r = Number(combo) as Rating;
        this.app.commit(setRating(this.app.doc, id, r));
        this.tally.rated++;
        this.app.view.flash(id, 'pulse');
        this.advance();
        return true;
      }
      case 'x':
      case 'backspace': {
        const n = this.app.doc.nodes[id];
        this.app.commit(setCut(this.app.doc, id, !n.cut));
        if (!n.cut) {
          this.tally.cut++;
          this.app.view.flash(id, 'zap');
          // Ideas under a cut idea go with it, so skip them.
          const gone = new Set(subtreeIds(this.app.doc.nodes, id));
          gone.delete(id);
          this.queue = this.queue.filter((q) => !gone.has(q));
        } else this.queue = this.build();
        this.i = this.queue.indexOf(id);
        this.advance();
        return true;
      }
      case '0':
        this.app.commit(patchNode(this.app.doc, id, { rating: undefined, cut: undefined }));
        this.queue = this.build();
        this.i = Math.max(0, this.queue.indexOf(id));
        this.advance();
        return true;
      case 'arrowright':
      case 'arrowdown':
      case 'space':
      case 'enter':
      case 'j':
        this.advance(1);
        return true;
      case 'arrowleft':
      case 'arrowup':
      case 'k':
        this.advance(-1);
        return true;
      case 'e':
      case 'f2':
        this.app.startEdit(id);
        return true;
      case 'mod+z':
        this.app.undo();
        this.queue = this.build();
        this.show();
        return true;
      case 'escape':
      case 'p':
      case 'q':
        this.finish();
        return true;
    }
    return true;
  }

  hints(): [string, string][] {
    return [];
  }

  resume() {
    this.show();
  }

  close() {
    this.app.view.setSpotlight(null);
    this.hud.remove();
  }
}

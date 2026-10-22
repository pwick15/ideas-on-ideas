import { mapToMarkdown, parseOutline, subtreeToMarkdown } from '../model/markdown';
import {
  addChild,
  addRoot,
  addSibling,
  deleteNode,
  duplicate,
  flipSide,
  indent,
  insertForest,
  makeCenter,
  moveAmongSiblings,
  outdent,
  patchNode,
  reparent,
  setCut,
  setRating,
  setText,
  toForest,
  toggleLink,
  wrapInParent,
  type ForestNode,
} from '../model/ops';
import {
  deleteMap,
  exportAll,
  loadIndex,
  loadMap,
  loadSettings,
  saveMap,
  saveSettings,
  titleOf,
  isMapKey,
} from '../model/storage';
import { createFromTemplate, exampleMap } from '../model/templates';
import { HUES, depthOf, hueOf, isCutDeep, rootOf, subtreeSize, visibleOrder } from '../model/tree';
import type { Id, LayoutKind, MapDoc, MapKind, Rating, Settings } from '../model/types';
import { SparkDeck, type Spark } from '../sparks/deck';
import { copyText, download, h, slug, type Layer } from '../ui/dom';
import { Hintbar } from '../ui/hintbar';
import { Toaster } from '../ui/toast';
import { Topbar } from '../ui/topbar';
import { MapView, type DropTarget } from '../view/mapview';
import { buildCommands, type Command } from './commands';
import { comboOf, isTextInput } from './keys';
import { Store } from './store';

type Dir = 'up' | 'down' | 'left' | 'right';

interface EditState {
  id: Id;
  isNew: boolean;
  original: string;
  returnTo: Id | null;
  spark?: Spark;
  sparkParent?: Id;
  bubble?: HTMLElement;
}

export interface SprintState {
  added: number;
  onIdea(): void;
}

const LAYOUTS: LayoutKind[] = ['balanced', 'right', 'down', 'radial'];
export const LAYOUT_NAMES: Record<LayoutKind, string> = {
  balanced: 'Mind map',
  right: 'Tree',
  down: 'Top-down',
  radial: 'Radial',
};

const plaintextOnly = (() => {
  const d = document.createElement('div');
  try {
    d.contentEditable = 'plaintext-only';
  } catch {
    return false;
  }
  return d.contentEditable === 'plaintext-only';
})();

export class App {
  store!: Store;
  readonly view: MapView;
  settings: Settings;
  focus: Id | null = null;
  editing: EditState | null = null;
  layers: Layer[] = [];
  hideCut = false;
  sprint: SprintState | null = null;
  readonly deck = new SparkDeck();
  readonly commands: Command[];
  readonly toaster: Toaster;
  readonly topbar: Topbar;
  readonly hintbar: Hintbar;
  private lastChild = new Map<Id, Id>();
  private clip: { text: string; forest: ForestNode[] } | null = null;
  private pendingPaste = 0;
  private live: HTMLElement;
  private emptyHint: HTMLElement;
  private keymap = new Map<string, Command>();

  constructor(readonly root: HTMLElement) {
    this.settings = loadSettings();
    this.applyTheme();

    this.view = new MapView({
      nodeClick: (id, e) => this.onNodeClick(id, e),
      nodeDblClick: (id) => this.onNodeDblClick(id),
      canvasClick: () => {
        if (this.editing) this.endEdit('commit');
      },
      canvasDblClick: () => {
        if (!this.layers.length && !this.editing) this.create('root');
      },
      cameraMoved: () => {
        if (this.store) this.store.view.cam = { ...this.view.camT };
        this.onCamera?.();
      },
      dragStart: (id) => {
        if (this.layers.length) return false;
        if (this.editing) this.endEdit('commit');
        return !!this.doc.nodes[id];
      },
      drop: (id, target) => this.moveIdea(id, target),
    });

    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    this.emptyHint = h('div', 'empty-hint');
    this.emptyHint.innerHTML = '<p>This map is empty.</p><p><kbd>N</kbd> or <kbd>↵</kbd> adds a central idea</p>';
    this.toaster = new Toaster();
    this.topbar = new Topbar(this);
    this.hintbar = new Hintbar(this);
    root.append(this.view.el, this.emptyHint, this.topbar.el, this.hintbar.el, this.toaster.el, this.live);

    this.commands = buildCommands(this);
    for (const c of this.commands) for (const k of c.keys ?? []) this.keymap.set(k, c);

    this.bindEvents();
  }

  /** Called by overlays that track node positions on screen (jump hints, spark bubbles). */
  onCamera?: () => void;

  get doc(): MapDoc {
    return this.store.doc;
  }

  // ------------------------------------------------------------------- boot

  boot() {
    let index = loadIndex();
    let first: MapDoc | null = null;
    if (!index.length) {
      first = exampleMap();
      saveMap(first);
      index = loadIndex();
    }
    const id = this.settings.lastMap && index.some((m) => m.id === this.settings.lastMap) ? this.settings.lastMap : index[0].id;
    const doc = first?.id === id ? first : loadMap(id) ?? first ?? exampleMap();
    this.load(doc);
    document.fonts?.ready.then(() => {
      this.view.remeasureAll();
      this.refresh();
      if (!doc.view?.cam) this.view.fit(undefined, 1, false);
    });
  }

  load(doc: MapDoc) {
    if (this.store) {
      if (this.editing) this.endEdit('commit');
      this.store.flush();
    }
    while (this.layers.length) this.popLayer();
    // An idea left empty (page closed mid-edit) is noise; drop it.
    for (const n of Object.values(doc.nodes)) {
      if (n.parent && !n.text.trim() && !n.children.length && !n.note && doc.nodes[n.id]) doc = deleteNode(doc, n.id).doc;
    }
    this.store = new Store(doc);
    this.store.onSaveFailed = () => this.toast('Could not save. Browser storage may be full or blocked.', 'warn');
    this.settings.lastMap = doc.id;
    this.saveSettings();
    this.lastChild.clear();
    this.hideCut = false;
    // A fresh renderer state per map keeps animations from flying across maps.
    this.view.render({ doc: { ...doc, roots: [] }, visible: [], kids: () => [], focus: null, editing: null, layout: doc.layout });
    const focus = this.store.view.focus && doc.nodes[this.store.view.focus] ? this.store.view.focus : doc.roots[0] ?? null;
    this.focus = focus;
    this.refresh(false);
    if (doc.view?.cam) {
      this.view.setCamera(doc.view.cam);
      // A camera saved on a bigger screen may leave the focus off-screen here.
      if (focus) this.view.ensureVisible(focus);
      this.pendingFit = false;
    } else {
      this.view.fit(undefined, 1, false);
      this.pendingFit = true;
    }
    this.view.setFocus(focus);
  }

  // ----------------------------------------------------------------- render

  visibleKids = (id: Id): Id[] => {
    const n = this.doc.nodes[id];
    if (!n || n.collapsed) return [];
    return this.hideCut ? n.children.filter((c) => !this.doc.nodes[c].cut) : n.children;
  };

  visible(): Id[] {
    return visibleOrder(this.doc, this.hideCut);
  }

  refresh(follow = true) {
    const doc = this.doc;
    if (this.focus && !doc.nodes[this.focus]) this.focus = doc.roots[0] ?? null;
    if (this.focus && this.hideCut && isCutDeep(doc.nodes, this.focus)) this.focus = this.nearestVisible(this.focus);
    this.view.render({
      doc,
      visible: this.visible(),
      kids: this.visibleKids,
      focus: this.focus,
      editing: this.editing?.id ?? null,
      layout: doc.layout,
    });
    this.view.setFocus(this.focus);
    this.store.view.focus = this.focus;
    if (follow && this.focus) this.view.ensureVisible(this.focus, this.settings.follow);
    this.emptyHint.classList.toggle('show', !doc.roots.length);
    // The first center names the map, and it can change (an edit, Make this the center).
    const title = `${titleOf(doc)} · Ideas on Ideas`;
    if (document.title !== title) document.title = title;
    this.topbar.update();
    this.hintbar.update();
  }

  private nearestVisible(id: Id): Id | null {
    let cur: Id | null = id;
    while (cur && isCutDeep(this.doc.nodes, cur)) cur = this.doc.nodes[cur].parent;
    return cur ?? this.doc.roots.find((r) => !this.doc.nodes[r].cut) ?? null;
  }

  setFocus(id: Id | null, opts: { center?: boolean; quiet?: boolean } = {}) {
    if (id && !this.doc.nodes[id]) return;
    const prev = this.focus;
    this.focus = id;
    this.store.view.focus = id;
    this.view.setFocus(id);
    if (id) {
      // Expand collapsed ancestors so the focus is never hidden.
      let p = this.doc.nodes[id].parent;
      let opened = false;
      while (p) {
        if (this.doc.nodes[p].collapsed) {
          this.store.amend(patchNode(this.doc, p, { collapsed: undefined }));
          opened = true;
        }
        p = this.doc.nodes[p].parent;
      }
      if (opened) this.refresh(false);
      this.view.ensureVisible(id, opts.center ?? this.settings.follow);
      if (!opts.quiet) this.announce(id);
    }
    if (prev !== id) this.hintbar.update();
  }

  private announce(id: Id) {
    const n = this.doc.nodes[id];
    const bits = [n.text || 'Untitled', `level ${depthOf(this.doc.nodes, id) + 1}`];
    if (n.children.length) bits.push(`${n.children.length} ${n.children.length === 1 ? 'branch' : 'branches'}${n.collapsed ? ', folded' : ''}`);
    if (n.rating) bits.push(`rated ${n.rating}`);
    if (n.cut) bits.push('cut');
    if (n.note) bits.push('has notes');
    this.live.textContent = bits.join(', ');
  }

  commit(next: MapDoc | null, focus?: Id | null) {
    if (!next) return false;
    this.store.commit(next, this.focus);
    if (focus !== undefined) this.focus = focus;
    this.refresh();
    return true;
  }

  toast(msg: string, tone: 'info' | 'warn' | 'good' = 'info', action?: { label: string; run: () => void }) {
    this.toaster.show(msg, tone, action);
  }

  // ----------------------------------------------------------------- layers

  pushLayer(layer: Layer) {
    if (this.editing) this.endEdit('commit');
    this.layers.push(layer);
    this.hintbar.update();
  }

  popLayer(layer?: Layer) {
    const top = layer ?? this.layers[this.layers.length - 1];
    if (!top) return;
    const i = this.layers.lastIndexOf(top);
    if (i < 0) return;
    this.layers.splice(i, 1);
    top.close();
    this.topLayer()?.resume?.();
    this.hintbar.update();
  }

  topLayer(): Layer | undefined {
    return this.layers[this.layers.length - 1];
  }

  hasLayer(name: string) {
    return this.layers.some((l) => l.name === name);
  }

  // --------------------------------------------------------------- keyboard

  /** True until the person moves the camera, so a resize right after boot can still fit the map. */
  private pendingFit = false;

  private bindEvents() {
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', () => (this.pendingFit = false), { capture: true });
    window.addEventListener('wheel', () => (this.pendingFit = false), { capture: true, passive: true });
    window.addEventListener('resize', () => {
      if (this.pendingFit && !this.editing) requestAnimationFrame(() => this.view.fit(undefined, 1, false));
    });
    // The editor lives inside the canvas, so input events bubble up to it.
    this.view.el.addEventListener('input', (e) => {
      if (this.editing && e.target === this.view.textEl(this.editing.id)) {
        const el = e.target as HTMLElement;
        el.classList.toggle('is-empty', !readText(el));
        this.refresh(false);
        this.view.ensureVisible(this.editing.id);
      }
    });
    this.view.el.addEventListener('focusout', (e) => {
      if (this.editing && e.target === this.view.textEl(this.editing.id)) {
        // Clicking elsewhere finishes the edit, unless focus moved to a layer input.
        queueMicrotask(() => {
          if (this.editing && document.activeElement !== this.view.textEl(this.editing.id)) this.endEdit('commit');
        });
      }
    });
    this.view.el.addEventListener('paste', (e) => this.onEditPaste(e));
    document.addEventListener('paste', (e) => {
      if (this.editing || isTextInput(e.target) || this.layers.length) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      this.pendingPaste = 0;
      e.preventDefault();
      this.pasteText(text);
    });
    const flush = () => {
      if (this.store) this.store.flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('storage', (e) => {
      if (!this.store || this.editing || !isMapKey(e.key, this.doc.id) || !e.newValue) return;
      const doc = loadMap(this.doc.id);
      if (doc && doc.updated > this.doc.updated) {
        this.store.amend(doc);
        this.refresh(false);
      }
    });
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => this.applyTheme());
  }

  private onKey(e: KeyboardEvent) {
    const combo = comboOf(e);
    this.pendingFit = false;
    // The map view owns the keyboard while an idea is being dragged.
    if (this.view.dragging) return;
    if (this.editing) {
      if (this.editKey(e, combo)) e.preventDefault();
      return;
    }
    const top = this.topLayer();
    if (top) {
      if (top.key(e, combo)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (isTextInput(e.target)) return;
    if (e.isComposing) return;
    const cmd = this.keymap.get(combo);
    if (!cmd) return;
    if (e.repeat && !cmd.repeat) {
      e.preventDefault();
      return;
    }
    if (cmd.when && !cmd.when()) return;
    // Let the browser fire its own copy/paste events where we rely on them.
    if (cmd.native) {
      cmd.run();
      return;
    }
    e.preventDefault();
    cmd.run();
  }

  runCommand(id: string) {
    const c = this.commands.find((x) => x.id === id);
    if (c && (!c.when || c.when())) c.run();
  }

  // ---------------------------------------------------------------- editing

  startEdit(id: Id, opts: { isNew?: boolean; returnTo?: Id | null; spark?: Spark; sparkParent?: Id; selectAll?: boolean } = {}) {
    if (this.editing) this.endEdit('commit');
    const n = this.doc.nodes[id];
    if (!n) return;
    this.editing = {
      id,
      isNew: !!opts.isNew,
      original: n.text,
      returnTo: opts.returnTo ?? null,
      spark: opts.spark,
      sparkParent: opts.sparkParent,
    };
    this.focus = id;
    this.refresh(false);
    const el = this.view.textEl(id);
    if (!el) return;
    el.contentEditable = plaintextOnly ? 'plaintext-only' : 'true';
    el.spellcheck = true;
    el.dataset.placeholder = opts.spark ? 'Your answer…' : n.parent ? 'New idea' : 'Central idea';
    el.classList.toggle('is-empty', !n.text);
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    if (!opts.selectAll) range.collapse(false);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    if (opts.spark) this.showSparkBubble();
    this.view.ensureVisible(id);
    this.hintbar.update();
  }

  /** Finishes the current edit. Returns false when the edit removed an empty new idea. */
  endEdit(mode: 'commit' | 'cancel'): boolean {
    const ed = this.editing;
    if (!ed) return true;
    this.editing = null;
    const el = this.view.textEl(ed.id);
    let text = el ? readText(el) : ed.original;
    if (el) {
      el.removeAttribute('contenteditable');
      el.classList.remove('is-empty');
      if (document.activeElement === el) el.blur();
    }
    ed.bubble?.remove();
    if (mode === 'cancel') text = ed.original;

    let kept = true;
    if (!text && ed.isNew) {
      this.store.discard();
      this.focus = ed.returnTo && this.doc.nodes[ed.returnTo] ? ed.returnTo : this.doc.roots[0] ?? null;
      kept = false;
    } else {
      if (!text) text = ed.original;
      if (ed.isNew) {
        let d = setText(this.doc, ed.id, text);
        if (ed.spark) {
          d = patchNode(d, ed.id, { spark: ed.spark.prompt });
          if (ed.spark.linkTo && d.nodes[ed.spark.linkTo]) d = toggleLink(d, ed.id, ed.spark.linkTo).doc;
        }
        this.store.amend(d);
        this.sprint?.onIdea();
      } else if (text !== ed.original) {
        this.store.commit(setText(this.doc, ed.id, text), ed.id);
      }
    }
    // Force the renderer to rewrite the text it handed over to the editor.
    if (el) el.textContent = this.doc.nodes[ed.id]?.text ?? '';
    this.refresh();
    return kept;
  }

  private editKey(e: KeyboardEvent, combo: string): boolean {
    const ed = this.editing!;
    if (e.isComposing || e.keyCode === 229) return false;
    const el = this.view.textEl(ed.id);
    if (!el || e.target !== el) {
      // Focus drifted (for example to the window); finish the edit and handle the key normally.
      this.endEdit('commit');
      return false;
    }
    const text = readText(el);
    switch (combo) {
      case 'enter': {
        if (!text || !ed.isNew) {
          this.endEdit('commit');
          return true;
        }
        const spark = ed.spark;
        const parent = ed.sparkParent;
        this.endEdit('commit');
        if (spark && parent) this.sparkFrom(parent, ed.id);
        else this.create('sibling');
        return true;
      }
      case 'mod+enter':
      case 'escape':
        this.endEdit('commit');
        return true;
      case 'tab': {
        if (text) {
          this.endEdit('commit');
          this.create('child');
        } else if (ed.isNew) {
          const next = indent(this.doc, ed.id);
          if (next) {
            ed.spark = undefined;
            ed.bubble?.remove();
            this.store.amend(next);
            this.refresh(false);
            el.focus({ preventScroll: true });
          } else this.view.flash(ed.id, 'bump');
        }
        return true;
      }
      case 'shift+tab': {
        const parent = this.doc.nodes[ed.id].parent;
        const grand = parent ? this.doc.nodes[parent].parent : null;
        if (text) {
          if (!parent || !grand) {
            this.view.flash(ed.id, 'bump');
            return true;
          }
          this.endEdit('commit');
          this.setFocus(parent, { quiet: true });
          this.create('sibling');
        } else if (ed.isNew && grand) {
          const next = outdent(this.doc, ed.id);
          if (next) {
            ed.spark = undefined;
            ed.bubble?.remove();
            this.store.amend(next);
            this.refresh(false);
            el.focus({ preventScroll: true });
          }
        } else this.view.flash(ed.id, 'bump');
        return true;
      }
      case 'arrowup':
      case 'arrowdown':
        if (ed.spark && ed.sparkParent && !text) {
          ed.spark = this.deck.next(this.doc, ed.sparkParent);
          this.showSparkBubble();
          return true;
        }
        return false;
    }
    return false;
  }

  private onEditPaste(e: ClipboardEvent) {
    const ed = this.editing;
    if (!ed || e.target !== this.view.textEl(ed.id)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const el = e.target as HTMLElement;
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (ed.isNew && !readText(el) && lines.length > 1) {
      // A list pasted into a fresh idea becomes a set of ideas.
      e.preventDefault();
      const node = this.doc.nodes[ed.id];
      const forest = parseOutline(text);
      this.endEdit('cancel');
      if (!forest.length) return;
      const parent = node.parent;
      const sibs = parent ? this.doc.nodes[parent].children : this.doc.roots;
      const at = parent ? sibs.length : this.doc.roots.length;
      const r = insertForest(this.doc, parent, forest, at);
      this.commit(r.doc, r.ids[0]);
      this.toast(`Added ${forest.length} ${forest.length === 1 ? 'idea' : 'ideas'} from the clipboard`);
      return;
    }
    if (!plaintextOnly) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
    }
  }

  private showSparkBubble() {
    const ed = this.editing;
    if (!ed?.spark) return;
    const nodeEl = this.view.nodeEl(ed.id);
    if (!nodeEl) return;
    ed.bubble?.remove();
    const b = h(
      'div',
      'spark-bubble',
      h('span', 'spark-label', '✦ ' + ed.spark.label),
      h('span', 'spark-prompt', ed.spark.prompt),
      h('span', 'spark-keys', '↑↓ another · ↵ next · esc stop'),
    );
    nodeEl.append(b);
    ed.bubble = b;
    // Keep the whole prompt on screen, not just the idea under it.
    const box = this.view.targetBox(ed.id);
    if (box) {
      const bw = b.offsetWidth;
      const bh = b.offsetHeight + 14;
      const left = nodeEl.classList.contains('left');
      const x0 = left ? Math.min(box.x, box.x + box.w + 4 - bw) : box.x - 4;
      const x1 = left ? box.x + box.w + 4 : Math.max(box.x + box.w, box.x - 4 + bw);
      this.view.ensureBoxVisible({ x: x0, y: box.y - bh, w: x1 - x0, h: box.h + bh });
    }
  }

  // --------------------------------------------------------------- creating

  create(kind: 'child' | 'sibling' | 'before' | 'root' | 'parent') {
    if (this.editing) this.endEdit('commit');
    const before = this.focus;
    let doc = this.doc;
    let r: { doc: MapDoc; id: Id } | null = null;
    const n = before ? doc.nodes[before] : null;
    if (!n || kind === 'root') r = addRoot(doc);
    else if (kind === 'child') r = addChild(doc, n.id);
    else if (kind === 'parent') r = wrapInParent(doc, n.id);
    else if (!n.parent) r = addChild(doc, n.id);
    else r = addSibling(doc, n.id, kind === 'before');
    if (!r) return;
    this.store.commit(r.doc, before);
    this.focus = r.id;
    this.refresh(false);
    this.startEdit(r.id, { isNew: true, returnTo: before });
  }

  /** A new child of `parent` with a provocation attached. */
  sparkFrom(parent: Id, after?: Id) {
    if (this.editing) this.endEdit('commit');
    if (!this.doc.nodes[parent]) return;
    const spark = this.deck.next(this.doc, parent);
    const kids = this.doc.nodes[parent].children;
    const at = after && kids.includes(after) ? kids.indexOf(after) + 1 : undefined;
    const r = addChild(this.doc, parent, '', {}, at);
    this.store.commit(r.doc, this.focus);
    this.focus = r.id;
    this.refresh(false);
    this.startEdit(r.id, { isNew: true, returnTo: parent, spark, sparkParent: parent });
  }

  // ------------------------------------------------------------- navigation

  private sideOf(id: Id): 1 | -1 {
    const n = this.doc.nodes[id];
    if (this.doc.layout === 'right' || this.doc.layout === 'down') return 1;
    let cur = n;
    while (cur.parent && this.doc.nodes[cur.parent].parent) cur = this.doc.nodes[cur.parent];
    if (!cur.parent) return 1;
    if (cur.side) return cur.side;
    const sibs = this.doc.nodes[cur.parent].children;
    return sibs.indexOf(cur.id) < Math.ceil(sibs.length / 2) ? 1 : -1;
  }

  private intent(id: Id, dir: Dir): 'parent' | 'child' | 'prev' | 'next' | 'childLeft' | 'childRight' | null {
    const layout = this.doc.layout;
    const n = this.doc.nodes[id];
    if (layout === 'radial') return null;
    if (layout === 'down') return ({ up: 'parent', down: 'child', left: 'prev', right: 'next' } as const)[dir];
    if (!n.parent) {
      if (dir === 'right') return layout === 'balanced' ? 'childRight' : 'child';
      if (dir === 'left') return layout === 'balanced' ? 'childLeft' : null;
      return null;
    }
    const s = this.sideOf(id);
    if (dir === 'up') return 'prev';
    if (dir === 'down') return 'next';
    return (dir === 'right') === s > 0 ? 'child' : 'parent';
  }

  private pickChild(parent: Id, kids: Id[]): Id | null {
    if (!kids.length) return null;
    const remembered = this.lastChild.get(parent);
    if (remembered && kids.includes(remembered)) return remembered;
    const pb = this.view.targetBox(parent);
    if (!pb) return kids[0];
    const vertical = this.doc.layout === 'down';
    let best = kids[0];
    let bestD = Infinity;
    for (const k of kids) {
      const b = this.view.targetBox(k);
      if (!b) continue;
      const d = vertical ? Math.abs(b.x + b.w / 2 - (pb.x + pb.w / 2)) : Math.abs(b.y + b.h / 2 - (pb.y + pb.h / 2));
      if (d < bestD - 0.5) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  private spatial(from: Id, dir: Dir): Id | null {
    const fb = this.view.targetBox(from);
    if (!fb) return null;
    const fx = fb.x + fb.w / 2;
    const fy = fb.y + fb.h / 2;
    let best: Id | null = null;
    let bestScore = Infinity;
    for (const id of this.visible()) {
      if (id === from) continue;
      const b = this.view.targetBox(id);
      if (!b) continue;
      const dx = b.x + b.w / 2 - fx;
      const dy = b.y + b.h / 2 - fy;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along < 4) continue;
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }

  move(dir: Dir) {
    const id = this.focus;
    if (!id || !this.doc.nodes[id]) {
      this.setFocus(this.doc.roots[0] ?? null);
      return;
    }
    const n = this.doc.nodes[id];
    const intent = this.intent(id, dir);
    let target: Id | null = null;
    if (intent === 'parent') {
      target = n.parent;
      if (target) this.lastChild.set(target, id);
    } else if (intent === 'child' || intent === 'childLeft' || intent === 'childRight') {
      if (n.collapsed && n.children.length) {
        this.commit(patchNode(this.doc, id, { collapsed: undefined }));
      }
      let pool = this.visibleKids(id);
      if (intent !== 'child') pool = pool.filter((k) => this.sideOf(k) === (intent === 'childRight' ? 1 : -1));
      target = this.pickChild(id, pool);
    } else if (intent === 'prev' || intent === 'next') {
      const sibs = (n.parent ? this.visibleKids(n.parent) : this.doc.roots).filter(
        (s) => !n.parent || this.doc.nodes[n.parent].parent || this.sideOf(s) === this.sideOf(id),
      );
      const i = sibs.indexOf(id);
      target = sibs[i + (intent === 'prev' ? -1 : 1)] ?? null;
    }
    target ??= this.spatial(id, dir);
    if (target) this.setFocus(target);
    else this.view.flash(id, 'bump');
  }

  moveNode(dir: Dir) {
    const id = this.focus;
    if (!id) return;
    const n = this.doc.nodes[id];
    const layout = this.doc.layout;
    let next: MapDoc | null = null;
    if (!n.parent) {
      if (dir === 'left' || dir === 'right') next = moveAmongSiblings(this.doc, id, dir === 'left' ? -1 : 1);
    } else if (layout === 'radial') {
      next =
        dir === 'up' ? moveAmongSiblings(this.doc, id, -1)
        : dir === 'down' ? moveAmongSiblings(this.doc, id, 1)
        : dir === 'right' ? indent(this.doc, id)
        : outdent(this.doc, id);
    } else {
      const intent = this.intent(id, dir);
      if (intent === 'prev') next = moveAmongSiblings(this.doc, id, -1);
      else if (intent === 'next') next = moveAmongSiblings(this.doc, id, 1);
      else if (intent === 'child') next = indent(this.doc, id);
      else if (intent === 'parent') {
        const parentIsRoot = !this.doc.nodes[n.parent].parent;
        next = parentIsRoot && layout === 'balanced' ? flipSide(this.doc, id) : outdent(this.doc, id);
        if (next && parentIsRoot && layout !== 'balanced') this.toast('Promoted to a new center');
      }
    }
    if (!this.commit(next)) this.view.flash(id, 'bump');
  }

  /** Puts an idea inside another, or next to it. Returns false when that is not possible or changes nothing. */
  moveIdea(id: Id, t: DropTarget): boolean {
    const doc = this.doc;
    const target = doc.nodes[t.id];
    if (!target || !doc.nodes[id]) return false;
    let next: MapDoc | null;
    if (t.where === 'into') {
      next = reparent(doc, id, t.id, undefined, !target.parent && doc.layout === 'balanced' ? t.side : undefined);
    } else {
      const list = target.parent ? doc.nodes[target.parent].children : doc.roots;
      const firstLevel = !!target.parent && !doc.nodes[target.parent].parent;
      const at = list.indexOf(t.id) + (t.where === 'after' ? 1 : 0);
      next = reparent(doc, id, target.parent, at, firstLevel ? target.side ?? t.side : undefined);
    }
    if (!this.commit(next, id)) return false;
    this.view.flash(id, 'pulse');
    return true;
  }

  /** Swaps the focused idea into the middle of its tree. The old center becomes one of its branches. */
  makeCenter() {
    const id = this.focus;
    if (!id) return;
    const n = this.doc.nodes[id];
    if (!n.parent) return this.toast('This is already a center');
    const old = this.doc.nodes[rootOf(this.doc.nodes, id)];
    if (!this.commit(makeCenter(this.doc, id), id)) return;
    this.view.ensureVisible(id, true);
    this.view.flash(id, 'pulse');
    const label = (s: string) => (s || 'Untitled').slice(0, 28);
    this.toast(`“${label(n.text)}” is the center now. “${label(old.text)}” became a branch.`, 'good', {
      label: 'Undo',
      run: () => this.undo(),
    });
  }

  focusRoot(dir: -1 | 0 | 1) {
    if (!this.focus) return this.setFocus(this.doc.roots[0] ?? null);
    let root = this.focus;
    while (this.doc.nodes[root].parent) root = this.doc.nodes[root].parent!;
    if (dir === 0) return this.setFocus(root);
    const i = this.doc.roots.indexOf(root) + dir;
    const target = this.doc.roots[(i + this.doc.roots.length) % this.doc.roots.length];
    if (target === root) this.view.flash(root, 'bump');
    else this.setFocus(target);
  }

  // ---------------------------------------------------------------- actions

  edit(selectAll = false) {
    if (!this.focus) return;
    this.startEdit(this.focus, { selectAll });
  }

  remove() {
    const id = this.focus;
    if (!id) return;
    const n = this.doc.nodes[id];
    const size = subtreeSize(this.doc.nodes, id);
    const r = deleteNode(this.doc, id);
    this.commit(r.doc, r.focus);
    const label = (n.text || 'idea').slice(0, 32);
    this.toast(size > 1 ? `Deleted “${label}” and ${size - 1} more` : `Deleted “${label}”`, 'info', {
      label: 'Undo',
      run: () => this.undo(),
    });
  }

  rate(r: Rating | 0) {
    const id = this.focus;
    if (!id) return;
    if (this.sprint && r) return this.toast('Sprints are for quantity. Judge later with P.', 'warn');
    const n = this.doc.nodes[id];
    const next = r === 0 ? patchNode(this.doc, id, { rating: undefined, cut: undefined }) : setRating(this.doc, id, n.rating === r ? undefined : r);
    this.commit(next);
    if (r) this.view.flash(id, 'pulse');
  }

  toggleCut() {
    const id = this.focus;
    if (!id) return;
    if (this.sprint) return this.toast('Sprints are for quantity. Judge later with P.', 'warn');
    const n = this.doc.nodes[id];
    if (!n.parent && !n.cut && this.doc.roots.length === 1) return this.toast('The only center cannot be cut.', 'warn');
    this.commit(setCut(this.doc, id, !n.cut));
    if (!n.cut) this.view.flash(id, 'zap');
    if (this.hideCut && !n.cut) this.toast('Cut and hidden. Shift+X shows cut ideas.');
  }

  toggleFold() {
    const id = this.focus;
    if (!id) return;
    const n = this.doc.nodes[id];
    if (!n.children.length) return this.view.flash(id, 'bump');
    this.commit(patchNode(this.doc, id, { collapsed: n.collapsed ? undefined : true }));
  }

  unfoldAll() {
    let d = this.doc;
    for (const n of Object.values(d.nodes)) if (n.collapsed) d = patchNode(d, n.id, { collapsed: undefined });
    if (d === this.doc) return this.toast('Nothing is folded');
    this.commit(d);
  }

  cycleHue() {
    const id = this.focus;
    if (!id) return;
    if (!this.doc.nodes[id].parent) return this.toast('Centers stay neutral. Colour a branch instead.');
    const cur = hueOf(this.doc.nodes, id) ?? HUES[HUES.length - 1];
    const next = HUES[(HUES.indexOf(cur) + 1) % HUES.length];
    this.commit(patchNode(this.doc, id, { hue: next }));
  }

  setLayout(kind: LayoutKind) {
    if (this.doc.layout === kind) return;
    this.store.amend({ ...this.doc, layout: kind });
    this.refresh(false);
    this.view.fit(undefined, 1);
    this.toast(`Layout: ${LAYOUT_NAMES[kind]}`);
  }

  cycleLayout(dir: 1 | -1) {
    const i = LAYOUTS.indexOf(this.doc.layout);
    this.setLayout(LAYOUTS[(i + dir + LAYOUTS.length) % LAYOUTS.length]);
  }

  toggleHideCut() {
    this.hideCut = !this.hideCut;
    this.refresh();
    const count = Object.values(this.doc.nodes).filter((n) => n.cut).length;
    this.toast(this.hideCut ? `Hiding ${count} cut ${count === 1 ? 'idea' : 'ideas'}` : 'Showing cut ideas');
  }

  undo() {
    const snap = this.store.undo(this.focus);
    if (!snap) return this.toast('Nothing to undo');
    this.focus = snap.focus && this.doc.nodes[snap.focus] ? snap.focus : this.doc.roots[0] ?? null;
    this.refresh();
  }

  redo() {
    const snap = this.store.redo(this.focus);
    if (!snap) return this.toast('Nothing to redo');
    this.focus = snap.focus && this.doc.nodes[snap.focus] ? snap.focus : this.focus;
    this.refresh();
  }

  dup() {
    if (!this.focus) return;
    const r = duplicate(this.doc, this.focus);
    this.commit(r.doc, r.id);
  }

  async copy(cut = false) {
    const id = this.focus;
    if (!id) return;
    const text = subtreeToMarkdown(this.doc, id);
    this.clip = { text, forest: [toForest(this.doc, id)] };
    const ok = await copyText(text);
    if (cut) {
      const r = deleteNode(this.doc, id);
      this.commit(r.doc, r.focus);
    }
    const count = subtreeSize(this.doc.nodes, id);
    this.toast(cut ? 'Cut to clipboard' : ok ? `Copied ${count > 1 ? count + ' ideas' : 'idea'} as Markdown` : 'Copied');
  }

  /** Cmd+V: the paste event normally arrives; if a browser does not send one, read the clipboard. */
  requestPaste() {
    this.pendingPaste = window.setTimeout(async () => {
      if (!this.pendingPaste) return;
      this.pendingPaste = 0;
      try {
        this.pasteText(await navigator.clipboard.readText());
      } catch {
        this.toast('Paste blocked by the browser. Try again.', 'warn');
      }
    }, 60);
  }

  pasteText(text: string) {
    clearTimeout(this.pendingPaste);
    this.pendingPaste = 0;
    if (!text.trim()) return;
    const forest = this.clip && this.clip.text === text ? this.clip.forest : parseOutline(text);
    if (!forest.length) return;
    const parent = this.focus ?? null;
    const r = insertForest(this.doc, parent, forest);
    this.commit(r.doc, r.ids[0]);
    const total = forest.reduce((s, f) => s + countForest(f), 0);
    this.toast(`Pasted ${total} ${total === 1 ? 'idea' : 'ideas'}`);
  }

  spark() {
    if (!this.focus) return this.toast('Focus an idea first');
    this.sparkFrom(this.focus);
  }

  // -------------------------------------------------------------- maps & io

  newMap(kind: MapKind, text: string) {
    const r = createFromTemplate(kind, text);
    saveMap(r.doc);
    this.load(r.doc);
    this.setFocus(r.root);
    this.view.fit(undefined, 1, false);
    if (kind === 'brainstorm') this.create('child');
  }

  openMap(id: Id) {
    if (id === this.doc.id) return;
    const doc = loadMap(id);
    if (!doc) return this.toast('That map could not be loaded', 'warn');
    this.load(doc);
  }

  deleteMapById(id: Id) {
    deleteMap(id);
    if (id === this.doc.id) {
      const next = loadIndex()[0];
      const doc = next ? loadMap(next.id) : null;
      if (doc) this.load(doc);
      else {
        const fresh = createFromTemplate('brainstorm', 'New idea');
        saveMap(fresh.doc);
        this.load(fresh.doc);
      }
    }
  }

  duplicateMap(id: Id) {
    const src = id === this.doc.id ? this.doc : loadMap(id);
    if (!src) return;
    const copy = cloneDoc(src);
    copy.nodes[copy.roots[0]].text = (copy.nodes[copy.roots[0]].text || 'Untitled') + ' (copy)';
    saveMap(copy);
    return copy.id;
  }

  exportMarkdown() {
    download(`${slug(titleOf(this.doc))}.md`, mapToMarkdown(this.doc), 'text/markdown');
  }

  async copyMapMarkdown() {
    const ok = await copyText(mapToMarkdown(this.doc));
    this.toast(ok ? 'Map copied as Markdown' : 'Copy failed', ok ? 'good' : 'warn');
  }

  exportBackup() {
    this.store.flush();
    const date = new Date().toISOString().slice(0, 10);
    download(`ideas-on-ideas-backup-${date}.json`, JSON.stringify(exportAll(), null, 1), 'application/json');
    this.toast('Backup downloaded', 'good');
  }

  exportMapJson() {
    this.store.flush();
    download(`${slug(titleOf(this.doc))}.json`, JSON.stringify({ app: 'ideas-on-ideas', v: 1, maps: [this.doc] }, null, 1), 'application/json');
  }

  importBackup() {
    const input = h('input', { type: 'file', accept: '.json,application/json,.md,.txt,text/markdown,text/plain' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (/\.json$/i.test(file.name) || text.trimStart().startsWith('{')) this.importJson(text);
      else this.importOutline(text, file.name);
    });
    input.click();
  }

  private importJson(text: string) {
    try {
      const data = JSON.parse(text) as { maps?: MapDoc[] };
      const maps = (data.maps ?? []).filter((m) => m && m.v === 1 && m.nodes && Array.isArray(m.roots));
      if (!maps.length) throw new Error('no maps');
      const existing = new Set(loadIndex().map((m) => m.id));
      let last: MapDoc | null = null;
      for (const m of maps) {
        const doc = existing.has(m.id) ? cloneDoc(m) : { ...m, links: m.links ?? [] };
        saveMap(doc);
        last = doc;
      }
      if (last) this.load(last);
      this.toast(`Imported ${maps.length} ${maps.length === 1 ? 'map' : 'maps'}`, 'good');
    } catch {
      this.toast('That file is not an Ideas on Ideas backup', 'warn');
    }
  }

  private importOutline(text: string, name: string) {
    const forest = parseOutline(text);
    if (!forest.length) return this.toast('Nothing to import in that file', 'warn');
    const r = createFromTemplate('brainstorm', '');
    let doc: MapDoc = { ...r.doc, nodes: {}, roots: [] };
    if (forest.length === 1) doc = insertForest(doc, null, forest).doc;
    else {
      const root = addRoot(doc, name.replace(/\.[^.]+$/, ''));
      doc = insertForest(root.doc, root.id, forest).doc;
    }
    saveMap(doc);
    this.load(doc);
    this.toast('Imported outline as a new map', 'good');
  }

  // --------------------------------------------------------------- settings

  saveSettings() {
    saveSettings(this.settings);
  }

  applyTheme() {
    const pref = this.settings.theme;
    const theme = pref === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
  }

  cycleTheme() {
    const order: Settings['theme'][] = ['system', 'dark', 'light'];
    this.settings.theme = order[(order.indexOf(this.settings.theme) + 1) % order.length];
    this.saveSettings();
    this.applyTheme();
    this.toast(`Theme: ${this.settings.theme === 'system' ? 'match system' : this.settings.theme}`);
    this.topbar.update();
  }

  toggleFollow() {
    this.settings.follow = !this.settings.follow;
    this.saveSettings();
    if (this.focus) this.view.ensureVisible(this.focus, this.settings.follow);
    this.toast(this.settings.follow ? 'Follow mode on: the focused idea stays centered' : 'Follow mode off');
  }

  toggleHints() {
    this.settings.hints = !this.settings.hints;
    this.saveSettings();
    this.hintbar.update();
  }

  // ------------------------------------------------------------------ mouse

  private onNodeClick(id: Id, e: MouseEvent) {
    const top = this.topLayer();
    if (top?.pick) return top.pick(id);
    if (this.editing?.id === id) return;
    if (this.editing) this.endEdit('commit');
    if (top) return;
    this.setFocus(id, { quiet: true });
    if ((e.target as HTMLElement).closest('.node-note')) this.runCommand('grow.notes');
  }

  private onNodeDblClick(id: Id) {
    if (this.layers.length) return;
    if (this.editing?.id === id) return;
    this.setFocus(id, { quiet: true });
    this.startEdit(id);
  }
}

function readText(el: HTMLElement): string {
  return el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function countForest(f: ForestNode): number {
  return 1 + f.children.reduce((s, c) => s + countForest(c), 0);
}

function cloneDoc(src: MapDoc): MapDoc {
  // Re-key every node so a copy never collides with its source.
  const map = new Map<Id, Id>();
  const fresh = () => Math.random().toString(36).slice(2, 12);
  for (const id of Object.keys(src.nodes)) map.set(id, fresh());
  const nodes: MapDoc['nodes'] = {};
  for (const n of Object.values(src.nodes)) {
    const id = map.get(n.id)!;
    nodes[id] = { ...n, id, parent: n.parent ? map.get(n.parent)! : null, children: n.children.map((c) => map.get(c)!) };
  }
  const now = Date.now();
  return {
    ...src,
    id: fresh(),
    nodes,
    roots: src.roots.map((r) => map.get(r)!),
    links: (src.links ?? []).map((l) => ({ id: fresh(), a: map.get(l.a)!, b: map.get(l.b)! })).filter((l) => l.a && l.b),
    created: now,
    updated: now,
    view: undefined,
  };
}

export { readText };

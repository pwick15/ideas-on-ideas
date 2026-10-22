import { subtreeSize } from '../model/tree';
import type { Camera, Id, LayoutKind, MapDoc, Side } from '../model/types';
import { edgePath, linkPath } from './geometry';
import { anchorOf, boxFrom, computeLayout, type Anchor, type Box, type Placement } from './layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NOTE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h8M4 8h8M4 11h5"/></svg>';
const NODE_RATE = 22;
const CAM_RATE = 13;
const MIN_Z = 0.15;
const MAX_Z = 2.5;

interface NV {
  id: Id;
  el: HTMLDivElement;
  body: HTMLDivElement;
  text: HTMLDivElement;
  stars: HTMLSpanElement;
  fold: HTMLSpanElement;
  note: HTMLSpanElement;
  sig: string;
  textCache: string | null;
  noteCache: string | undefined;
  w: number;
  h: number;
  needsMeasure: boolean;
  ax: number;
  ay: number;
  tax: number;
  tay: number;
  anchor: Anchor;
  side: Side;
  depth: number;
  root: Id;
  placed: boolean;
  dying: number;
}

export interface RenderInput {
  doc: MapDoc;
  visible: Id[];
  kids: (id: Id) => Id[];
  focus: Id | null;
  editing: Id | null;
  layout: LayoutKind;
}

export type DropWhere = 'into' | 'before' | 'after';

/** Where a moved idea would land: inside an idea, or next to it as a sibling. */
export interface DropTarget {
  id: Id;
  where: DropWhere;
  /** Which side of the center to land on, for an idea that ends up on the first level. */
  side?: Side;
}

export interface ViewEvents {
  nodeClick(id: Id, e: MouseEvent): void;
  nodeDblClick(id: Id, e: MouseEvent): void;
  canvasClick(e: MouseEvent): void;
  canvasDblClick(e: MouseEvent): void;
  cameraMoved(): void;
  /** Return false to refuse dragging an idea, for example while a panel is open. */
  dragStart(id: Id): boolean;
  drop(id: Id, target: DropTarget): void;
}

export class MapView {
  readonly el: HTMLDivElement;
  private world: HTMLDivElement;
  private edgeLayer: SVGGElement;
  private linkLayer: SVGGElement;
  private previewPath: SVGPathElement;
  private nodeLayer: HTMLDivElement;

  private nvs = new Map<Id, NV>();
  private edges = new Map<Id, SVGPathElement>();
  private links = new Map<Id, { el: SVGPathElement; a: Id; b: Id }>();
  private kidsOf = new Map<Id, Id[]>();
  private parentOf = new Map<Id, Id | null>();

  layout: LayoutKind = 'balanced';
  cam: Camera = { x: 0, y: 0, z: 1 };
  camT: Camera = { x: 0, y: 0, z: 1 };
  vw = window.innerWidth;
  vh = window.innerHeight;

  private doc: MapDoc | null = null;
  private focusId: Id | null = null;
  private marks: { src: Id | null; target: Id | null; cls: string | null } = { src: null, target: null, cls: null };
  /** True while an idea is being dragged with the pointer. */
  dragging = false;
  private raf = 0;
  private last = 0;
  private dirtyEdges = new Set<Id>();
  private reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private linkPreview: { a: Id; b: Id } | null = null;
  /** Safe area insets so the camera keeps focus clear of the top bar and hint bar. */
  insets = { top: 76, bottom: 84, left: 40, right: 40 };

  constructor(private events: ViewEvents) {
    this.el = document.createElement('div');
    this.el.className = 'viewport';
    this.el.setAttribute('role', 'tree');
    this.el.setAttribute('aria-label', 'Idea map');

    this.world = document.createElement('div');
    this.world.className = 'world';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('wires');
    this.edgeLayer = document.createElementNS(SVG_NS, 'g');
    this.linkLayer = document.createElementNS(SVG_NS, 'g');
    this.linkLayer.classList.add('links');
    this.previewPath = document.createElementNS(SVG_NS, 'path');
    this.previewPath.classList.add('link', 'preview');
    svg.append(this.edgeLayer, this.linkLayer, this.previewPath);
    this.nodeLayer = document.createElement('div');
    this.nodeLayer.className = 'nodes';
    this.world.append(svg, this.nodeLayer);
    this.el.append(this.world);

    this.bindPointer();
    window.addEventListener('resize', () => {
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;
      this.applyCamera();
    });
  }

  // ---------------------------------------------------------------- rendering

  render(input: RenderInput) {
    const { doc, visible, kids } = input;
    this.doc = doc;
    if (this.layout !== input.layout) {
      // Side classes depend on the layout, so recompute them all.
      for (const nv of this.nvs.values()) delete nv.el.dataset.sided;
    }
    this.layout = input.layout;
    this.el.dataset.layout = input.layout;
    const seen = new Set<Id>();
    const depth = new Map<Id, number>();
    const hue = new Map<Id, number | undefined>();
    const cutDeep = new Map<Id, boolean>();
    this.kidsOf.clear();
    this.parentOf.clear();

    for (const id of visible) {
      const n = doc.nodes[id];
      seen.add(id);
      const d = n.parent ? (depth.get(n.parent) ?? 0) + 1 : 0;
      depth.set(id, d);
      const h = n.hue ?? (n.parent ? hue.get(n.parent) : undefined);
      hue.set(id, h);
      const inheritedCut = n.parent ? !!cutDeep.get(n.parent) : false;
      cutDeep.set(id, inheritedCut || !!n.cut);
      this.kidsOf.set(id, kids(id));
      this.parentOf.set(id, n.parent);

      let nv = this.nvs.get(id);
      if (!nv) nv = this.createNode(id);
      else if (nv.dying) this.revive(nv);

      const isEditing = input.editing === id;
      const foldCount = n.collapsed && n.children.length ? subtreeSize(doc.nodes, id) - 1 : 0;
      const dc = 'd' + Math.min(d, 3);
      const sig = [dc, n.cut ? 1 : 0, inheritedCut ? 1 : 0, n.rating ?? 0, foldCount, h ?? '', isEditing ? 1 : 0, n.note ? 1 : 0].join('|');
      if (sig !== nv.sig) {
        const cl = nv.el.classList;
        for (let i = 0; i < 4; i++) cl.toggle('d' + i, 'd' + i === dc);
        cl.toggle('cut', !!n.cut);
        cl.toggle('cut-deep', !n.cut && inheritedCut);
        for (const r of [1, 2, 3]) cl.toggle('r' + r, n.rating === r);
        cl.toggle('folded', !!foldCount);
        cl.toggle('neutral', h === undefined);
        cl.toggle('editing', isEditing);
        cl.toggle('has-note', !!n.note);
        if (h !== undefined) nv.el.style.setProperty('--hue', String(h));
        else nv.el.style.removeProperty('--hue');
        nv.stars.textContent = n.rating ? '✦'.repeat(n.rating) : '';
        nv.fold.textContent = foldCount ? '+' + foldCount : '';
        const old = nv.sig.split('|');
        if (old[0] !== dc || old[6] !== (isEditing ? '1' : '0')) nv.needsMeasure = true;
        nv.sig = sig;
        nv.el.setAttribute('aria-level', String(d + 1));
      }
      if (nv.noteCache !== n.note) {
        nv.noteCache = n.note;
        nv.note.title = n.note ? clip(n.note, 280) : '';
      }
      if (n.children.length) nv.el.setAttribute('aria-expanded', String(!n.collapsed));
      else nv.el.removeAttribute('aria-expanded');
      if (!isEditing && nv.textCache !== n.text) {
        nv.text.textContent = n.text;
        nv.textCache = n.text;
        nv.needsMeasure = true;
      }
      if (isEditing) {
        nv.textCache = null;
        nv.needsMeasure = true;
      }
      nv.depth = d;
    }

    for (const [id, nv] of this.nvs) if (!seen.has(id) && !nv.dying) this.kill(nv);

    this.measure();
    this.place(doc);
    this.syncEdges(hue, cutDeep);
    this.syncLinks(doc, seen);
    this.kick();
  }

  /** Re-measure one node (while typing) and re-run layout. */
  remeasureAll() {
    for (const nv of this.nvs.values()) nv.needsMeasure = true;
  }

  private createNode(id: Id): NV {
    const el = document.createElement('div');
    el.className = 'node enter';
    el.dataset.id = id;
    el.setAttribute('role', 'treeitem');
    el.id = 'n-' + id;
    const body = document.createElement('div');
    body.className = 'node-body';
    const text = document.createElement('div');
    text.className = 'node-text';
    body.append(text);
    const stars = document.createElement('span');
    stars.className = 'node-stars';
    const fold = document.createElement('span');
    fold.className = 'node-fold';
    const note = document.createElement('span');
    note.className = 'node-note';
    note.innerHTML = NOTE_ICON;
    el.append(body, stars, fold, note);
    this.nodeLayer.append(el);
    setTimeout(() => el.classList.remove('enter'), 260);
    const nv: NV = {
      id, el, body, text, stars, fold, note,
      sig: '', textCache: null, noteCache: undefined, w: 0, h: 0, needsMeasure: true,
      ax: 0, ay: 0, tax: 0, tay: 0, anchor: 'c', side: 1, depth: 0, root: id,
      placed: false, dying: 0,
    };
    this.nvs.set(id, nv);
    return nv;
  }

  private kill(nv: NV) {
    nv.el.classList.add('exit');
    nv.el.classList.remove('focused');
    nv.dying = window.setTimeout(() => {
      nv.el.remove();
      this.nvs.delete(nv.id);
    }, 180);
    const edge = this.edges.get(nv.id);
    if (edge) {
      edge.classList.add('exit');
      this.edges.delete(nv.id);
      setTimeout(() => edge.remove(), 180);
    }
  }

  private revive(nv: NV) {
    clearTimeout(nv.dying);
    nv.dying = 0;
    nv.el.classList.remove('exit');
  }

  private measure() {
    const todo: NV[] = [];
    for (const nv of this.nvs.values()) if (nv.needsMeasure && !nv.dying) todo.push(nv);
    // Read everything in one pass after all writes, so the browser lays out once.
    for (const nv of todo) {
      const w = nv.el.offsetWidth;
      const h = nv.el.offsetHeight;
      if (w !== nv.w || h !== nv.h) {
        // Keep the anchor fixed and let the box grow away from it.
        nv.w = w;
        nv.h = h;
        this.dirtyEdges.add(nv.id);
        this.writeTransform(nv);
      }
      nv.needsMeasure = false;
    }
  }

  private place(doc: MapDoc) {
    const placements = computeLayout(
      doc,
      this.layout,
      (id) => this.kidsOf.get(id) ?? [],
      (id) => {
        const nv = this.nvs.get(id)!;
        return { w: nv.w, h: nv.h };
      },
    );
    for (const [id, p] of placements) {
      const nv = this.nvs.get(id);
      if (!nv) continue;
      this.applyPlacement(nv, p);
    }
  }

  private applyPlacement(nv: NV, p: Placement) {
    if (!nv.placed) {
      // New nodes grow out of their parent.
      const parentId = this.parentOf.get(nv.id);
      const parent = parentId ? this.nvs.get(parentId) : undefined;
      if (parent && parent.placed) {
        const pb = this.box(parent);
        const start = anchorOf({ x: pb.x + pb.w / 2 - nv.w / 2, y: pb.y + pb.h / 2 - nv.h / 2, w: nv.w, h: nv.h }, p.anchor);
        nv.ax = start.x;
        nv.ay = start.y;
      } else {
        nv.ax = p.ax;
        nv.ay = p.ay;
      }
      nv.anchor = p.anchor;
      nv.placed = true;
    } else if (nv.anchor !== p.anchor) {
      const b = this.box(nv);
      const a = anchorOf(b, p.anchor);
      nv.ax = a.x;
      nv.ay = a.y;
      nv.anchor = p.anchor;
    }
    nv.tax = p.ax;
    nv.tay = p.ay;
    if (nv.side !== p.side || !nv.el.dataset.sided) {
      nv.el.classList.toggle('left', p.side < 0 && (this.layout === 'balanced' || this.layout === 'radial'));
      nv.el.dataset.sided = '1';
    }
    nv.side = p.side;
    nv.root = p.root;
    nv.depth = p.depth;
    this.dirtyEdges.add(nv.id);
    this.writeTransform(nv);
  }

  private box(nv: NV): Box {
    return boxFrom(nv.ax, nv.ay, nv.anchor, nv.w, nv.h);
  }

  /** Where the node will settle, in world coordinates. */
  targetBox(id: Id): Box | null {
    const nv = this.nvs.get(id);
    if (!nv || !nv.placed) return null;
    return boxFrom(nv.tax, nv.tay, nv.anchor, nv.w, nv.h);
  }

  private writeTransform(nv: NV) {
    const b = this.box(nv);
    nv.el.style.transform = `translate(${Math.round(b.x * 10) / 10}px, ${Math.round(b.y * 10) / 10}px)`;
  }

  private syncEdges(hue: Map<Id, number | undefined>, cutDeep: Map<Id, boolean>) {
    const want = new Set<Id>();
    for (const [id, parent] of this.parentOf) {
      if (!parent) continue;
      want.add(id);
      let el = this.edges.get(id);
      if (!el) {
        el = document.createElementNS(SVG_NS, 'path');
        el.classList.add('edge', 'enter');
        this.edgeLayer.append(el);
        this.edges.set(id, el);
        const e = el;
        setTimeout(() => e.classList.remove('enter'), 260);
      }
      const h = hue.get(id);
      if (h !== undefined) el.style.setProperty('--hue', String(h));
      el.classList.toggle('cut', !!cutDeep.get(id));
      this.dirtyEdges.add(id);
    }
    for (const [id, el] of this.edges) {
      if (!want.has(id)) {
        el.remove();
        this.edges.delete(id);
      }
    }
  }

  private syncLinks(doc: MapDoc, visible: Set<Id>) {
    const want = new Set<Id>();
    for (const l of doc.links) {
      if (!visible.has(l.a) || !visible.has(l.b)) continue;
      want.add(l.id);
      let rec = this.links.get(l.id);
      if (!rec) {
        const el = document.createElementNS(SVG_NS, 'path');
        el.classList.add('link');
        this.linkLayer.append(el);
        rec = { el, a: l.a, b: l.b };
        this.links.set(l.id, rec);
      }
      rec.a = l.a;
      rec.b = l.b;
      this.updateLink(rec.el, l.a, l.b);
    }
    for (const [id, rec] of this.links) {
      if (!want.has(id)) {
        rec.el.remove();
        this.links.delete(id);
      }
    }
  }

  private updateLink(el: SVGPathElement, a: Id, b: Id) {
    const na = this.nvs.get(a);
    const nb = this.nvs.get(b);
    if (!na || !nb) return;
    el.setAttribute('d', linkPath(this.box(na), this.box(nb)).d);
  }

  private updateEdge(childId: Id) {
    const el = this.edges.get(childId);
    const parentId = this.parentOf.get(childId);
    if (!el || !parentId) return;
    const c = this.nvs.get(childId);
    const p = this.nvs.get(parentId);
    if (!c || !p) return;
    const root = this.nvs.get(c.root);
    const rb = root ? this.box(root) : { x: 0, y: 0, w: 0, h: 0 };
    el.setAttribute(
      'd',
      edgePath(this.layout, this.box(p), this.box(c), c.side, c.depth, !this.parentOf.get(parentId), {
        x: rb.x + rb.w / 2,
        y: rb.y + rb.h / 2,
      }),
    );
  }

  // --------------------------------------------------------------- animation

  private kick() {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.step(t));
    }
  }

  private step(now: number) {
    this.raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    const instant = this.reduceMotion.matches;
    const k = instant ? 1 : 1 - Math.exp(-NODE_RATE * dt);
    const kc = instant ? 1 : 1 - Math.exp(-CAM_RATE * dt);
    let busy = false;

    for (const nv of this.nvs.values()) {
      const dx = nv.tax - nv.ax;
      const dy = nv.tay - nv.ay;
      if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
        if (dx || dy) {
          nv.ax = nv.tax;
          nv.ay = nv.tay;
          this.writeTransform(nv);
          this.markMoved(nv.id);
        }
        continue;
      }
      nv.ax += dx * k;
      nv.ay += dy * k;
      this.writeTransform(nv);
      this.markMoved(nv.id);
      busy = true;
    }

    if (this.dirtyEdges.size) {
      for (const id of this.dirtyEdges) this.updateEdge(id);
      for (const rec of this.links.values()) {
        if (this.dirtyEdges.has(rec.a) || this.dirtyEdges.has(rec.b)) this.updateLink(rec.el, rec.a, rec.b);
      }
      if (this.linkPreview) this.drawPreview();
      this.dirtyEdges.clear();
    }

    const c = this.cam;
    const t = this.camT;
    const camMoving = Math.abs(t.x - c.x) * c.z > 0.2 || Math.abs(t.y - c.y) * c.z > 0.2 || Math.abs(t.z - c.z) > 0.0005;
    if (camMoving) {
      // Interpolate zoom in log space so zooming feels even.
      c.z = Math.exp(Math.log(c.z) + (Math.log(t.z) - Math.log(c.z)) * kc);
      c.x += (t.x - c.x) * kc;
      c.y += (t.y - c.y) * kc;
      this.applyCamera();
      busy = true;
    } else if (c.x !== t.x || c.y !== t.y || c.z !== t.z) {
      c.x = t.x;
      c.y = t.y;
      c.z = t.z;
      this.applyCamera();
    }
    if (busy) this.kick();
  }

  private markMoved(id: Id) {
    this.dirtyEdges.add(id);
    const kids = this.kidsOf.get(id);
    if (kids) for (const k of kids) this.dirtyEdges.add(k);
  }

  // ------------------------------------------------------------------ camera

  private applyCamera() {
    const { x, y, z } = this.cam;
    const tx = this.vw / 2 - x * z;
    const ty = this.vh / 2 - y * z;
    this.world.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    const grid = 28 * z;
    this.el.style.backgroundSize = `${grid}px ${grid}px`;
    this.el.style.backgroundPosition = `${tx}px ${ty}px`;
    this.el.style.setProperty('--zoom', String(z));
    this.events.cameraMoved();
  }

  setCamera(cam: Camera, animate = false) {
    this.camT = { ...cam, z: clampZ(cam.z) };
    if (!animate) {
      this.cam = { ...this.camT };
      this.applyCamera();
    } else this.kick();
  }

  /** Pan so the node is comfortably on screen. */
  ensureVisible(id: Id, center = false) {
    const b = this.targetBox(id);
    if (b) this.ensureBoxVisible(b, center);
  }

  /** Pan so a world-space box is comfortably on screen. */
  ensureBoxVisible(b: Box, center = false) {
    const z = this.camT.z;
    if (center) {
      this.camT.x = b.x + b.w / 2;
      this.camT.y = b.y + b.h / 2 + (this.insets.top - this.insets.bottom) / 2 / z;
      this.kick();
      return;
    }
    const mx = Math.min(140, this.vw * 0.12);
    const left = this.insets.left + mx;
    const right = this.vw - this.insets.right - mx;
    const top = this.insets.top + 30;
    const bottom = this.vh - this.insets.bottom - 30;
    const sx0 = (b.x - this.camT.x) * z + this.vw / 2;
    const sx1 = (b.x + b.w - this.camT.x) * z + this.vw / 2;
    const sy0 = (b.y - this.camT.y) * z + this.vh / 2;
    const sy1 = (b.y + b.h - this.camT.y) * z + this.vh / 2;
    let dx = 0;
    let dy = 0;
    if (sx1 - sx0 > right - left) dx = (sx0 + sx1) / 2 - (left + right) / 2;
    else if (sx0 < left) dx = sx0 - left;
    else if (sx1 > right) dx = sx1 - right;
    if (sy1 - sy0 > bottom - top) dy = (sy0 + sy1) / 2 - (top + bottom) / 2;
    else if (sy0 < top) dy = sy0 - top;
    else if (sy1 > bottom) dy = sy1 - bottom;
    if (dx || dy) {
      this.camT.x += dx / z;
      this.camT.y += dy / z;
      this.kick();
    }
  }

  isOnScreen(id: Id): boolean {
    const r = this.screenRect(id);
    return !!r && r.x + r.w > 0 && r.y + r.h > 0 && r.x < this.vw && r.y < this.vh;
  }

  bounds(ids?: Iterable<Id>): Box | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids ?? this.nvs.keys()) {
      const nv = this.nvs.get(id);
      if (!nv || nv.dying) continue;
      const b = this.targetBox(id);
      if (!b) continue;
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    if (x0 === Infinity) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  fit(ids?: Iterable<Id>, maxZ = 1.15, animate = true) {
    const b = this.bounds(ids);
    if (!b) return;
    const availW = this.vw - this.insets.left - this.insets.right - 80;
    const availH = this.vh - this.insets.top - this.insets.bottom - 40;
    const z = clampZ(Math.min(availW / Math.max(b.w, 1), availH / Math.max(b.h, 1), maxZ));
    const cam = {
      x: b.x + b.w / 2,
      y: b.y + b.h / 2 - (this.insets.top - this.insets.bottom) / 2 / z,
      z,
    };
    this.setCamera(cam, animate);
  }

  zoomBy(factor: number, sx = this.vw / 2, sy = this.vh / 2) {
    const z0 = this.camT.z;
    const z1 = clampZ(z0 * factor);
    const wx = this.camT.x + (sx - this.vw / 2) / z0;
    const wy = this.camT.y + (sy - this.vh / 2) / z0;
    this.camT.z = z1;
    this.camT.x = wx - (sx - this.vw / 2) / z1;
    this.camT.y = wy - (sy - this.vh / 2) / z1;
    this.kick();
  }

  screenRect(id: Id): Box | null {
    const nv = this.nvs.get(id);
    if (!nv || !nv.placed) return null;
    const b = this.box(nv);
    const z = this.cam.z;
    return {
      x: (b.x - this.cam.x) * z + this.vw / 2,
      y: (b.y - this.cam.y) * z + this.vh / 2,
      w: b.w * z,
      h: b.h * z,
    };
  }

  /** Converts a screen point to world coordinates. */
  toWorld(sx: number, sy: number) {
    return { x: this.cam.x + (sx - this.vw / 2) / this.cam.z, y: this.cam.y + (sy - this.vh / 2) / this.cam.z };
  }

  // ------------------------------------------------------- transient marks

  setFocus(id: Id | null) {
    if (this.focusId === id) return;
    if (this.focusId) this.nvs.get(this.focusId)?.el.classList.remove('focused');
    this.focusId = id;
    if (id) {
      const nv = this.nvs.get(id);
      nv?.el.classList.add('focused');
      this.el.setAttribute('aria-activedescendant', 'n-' + id);
    }
  }

  textEl(id: Id): HTMLDivElement | null {
    return this.nvs.get(id)?.text ?? null;
  }

  nodeEl(id: Id): HTMLDivElement | null {
    return this.nvs.get(id)?.el ?? null;
  }

  /** Dims everything except the given ideas (and the wires between them). */
  setSpotlight(ids: Set<Id> | null) {
    this.el.classList.toggle('spotlit', !!ids);
    for (const [id, nv] of this.nvs) nv.el.classList.toggle('lit', !!ids?.has(id));
    for (const [id, el] of this.edges) {
      const p = this.parentOf.get(id);
      el.classList.toggle('lit', !!ids && ids.has(id) && !!p && ids.has(p));
    }
  }

  setMatches(ids: Set<Id> | null, current: Id | null) {
    this.el.classList.toggle('searching', !!ids);
    for (const [id, nv] of this.nvs) {
      nv.el.classList.toggle('match', !!ids?.has(id));
      nv.el.classList.toggle('match-current', id === current);
    }
  }

  setLinkPreview(a: Id | null, b: Id | null) {
    for (const nv of this.nvs.values()) nv.el.classList.remove('link-src', 'link-dst');
    if (!a) {
      this.linkPreview = null;
      this.previewPath.removeAttribute('d');
      return;
    }
    this.nvs.get(a)?.el.classList.add('link-src');
    if (b && b !== a) {
      this.nvs.get(b)?.el.classList.add('link-dst');
      this.linkPreview = { a, b };
    } else this.linkPreview = null;
    this.drawPreview();
  }

  private drawPreview() {
    if (!this.linkPreview) {
      this.previewPath.removeAttribute('d');
      return;
    }
    const na = this.nvs.get(this.linkPreview.a);
    const nb = this.nvs.get(this.linkPreview.b);
    if (na && nb) this.previewPath.setAttribute('d', linkPath(this.box(na), this.box(nb)).d);
  }

  /** Marks an idea being moved (with everything under it) and where it would land. Nulls clear the marks. */
  setDropMarks(src: Id | null, target: DropTarget | null, valid = true) {
    if (src !== this.marks.src) {
      for (const nv of this.nvs.values()) nv.el.classList.remove('drag-src');
      if (src) for (const id of this.visibleSubtree(src)) this.nvs.get(id)?.el.classList.add('drag-src');
      this.marks.src = src;
    }
    const cls = target ? (valid ? 'drop-' + target.where : 'drop-no') : null;
    const id = target?.id ?? null;
    if (id === this.marks.target && cls === this.marks.cls) return;
    if (this.marks.target && this.marks.cls) this.nvs.get(this.marks.target)?.el.classList.remove(this.marks.cls);
    if (id && cls) this.nvs.get(id)?.el.classList.add(cls);
    this.marks.target = id;
    this.marks.cls = cls;
  }

  /** True when `id` is `ancestor` or sits somewhere under it. */
  isWithin(id: Id, ancestor: Id): boolean {
    for (let cur: Id | null | undefined = id; cur; cur = this.parentOf.get(cur)) if (cur === ancestor) return true;
    return false;
  }

  private visibleSubtree(id: Id): Id[] {
    const out: Id[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      for (const k of this.kidsOf.get(cur) ?? []) stack.push(k);
    }
    return out;
  }

  /**
   * The idea under a screen point, and where a dragged idea would land on it. The middle of an
   * idea nests inside it; the edges (and the gaps between siblings) place it before or after.
   */
  private dropAt(sx: number, sy: number): DropTarget | null {
    const pad = 7;
    let best: NV | null = null;
    let bestD = Infinity;
    for (const nv of this.nvs.values()) {
      if (nv.dying || !nv.placed) continue;
      const r = this.screenRect(nv.id)!;
      if (sx < r.x - pad || sx > r.x + r.w + pad || sy < r.y - pad || sy > r.y + r.h + pad) continue;
      const d = Math.hypot(sx - (r.x + r.w / 2), sy - (r.y + r.h / 2));
      if (d < bestD) {
        bestD = d;
        best = nv;
      }
    }
    if (!best) return null;
    const r = this.screenRect(best.id)!;
    const isRoot = !this.parentOf.get(best.id);
    let where: DropWhere = 'into';
    if (!isRoot && this.layout !== 'radial') {
      const f = this.layout === 'down' ? (sx - r.x) / r.w : (sy - r.y) / r.h;
      where = f < 0.3 ? 'before' : f > 0.7 ? 'after' : 'into';
    }
    const side: Side = isRoot ? (sx < r.x + r.w / 2 ? -1 : 1) : best.side;
    return { id: best.id, where, side };
  }

  flash(id: Id, cls: 'bump' | 'pulse' | 'zap') {
    const el = this.nvs.get(id)?.el;
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 450);
  }

  // ------------------------------------------------------------------ input

  private bindPointer() {
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let pinch: { d: number; z: number } | null = null;
    // Pressing an idea arms a move. A mouse starts it by moving a few pixels, a finger by holding still.
    let press: { id: Id; pointerId: number; x: number; y: number; lx: number; ly: number; touch: boolean; timer: number } | null = null;
    let moving: { id: Id; pointerId: number; ghost: HTMLElement; x: number; y: number; hit: DropTarget | null; raf: number } | null = null;
    let swallowClick = false;

    const clearPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };

    const track = (x: number, y: number) => {
      if (!moving) return;
      moving.x = x;
      moving.y = y;
      moving.ghost.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 12)}px)`;
      const hit = this.dropAt(x, y);
      const valid = !!hit && !this.isWithin(hit.id, moving.id);
      moving.hit = valid ? hit : null;
      this.setDropMarks(moving.id, hit, valid);
    };

    // Re-check the target every frame: the camera may pan under a still pointer.
    const frame = () => {
      if (!moving) return;
      const m = 48;
      const { x, y } = moving;
      const edge = (v: number, size: number) => Math.max(-m, Math.min(m, v < m ? v - m : v > size - m ? v - (size - m) : 0));
      const dx = edge(x, this.vw);
      const dy = edge(y, this.vh);
      if (dx || dy) {
        this.camT.x += (dx * 0.3) / this.camT.z;
        this.camT.y += (dy * 0.3) / this.camT.z;
        this.cam.x = this.camT.x;
        this.cam.y = this.camT.y;
        this.applyCamera();
      }
      track(x, y);
      moving.raf = requestAnimationFrame(frame);
    };

    const onMoveKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') finishMove(false);
    };

    const startMove = () => {
      const p = press;
      clearPress();
      const nv = p && this.nvs.get(p.id);
      if (!p || !nv || nv.dying || !this.events.dragStart(p.id)) return;
      try {
        this.el.setPointerCapture(p.pointerId);
      } catch {
        /* the pointer is already gone */
      }
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      const hue = nv.el.style.getPropertyValue('--hue');
      if (hue) {
        ghost.style.setProperty('--hue', hue);
        ghost.classList.add('tinted');
      }
      const label = document.createElement('span');
      label.textContent = this.doc?.nodes[p.id]?.text || 'Untitled';
      ghost.append(label);
      const more = this.doc ? subtreeSize(this.doc.nodes, p.id) - 1 : 0;
      if (more) {
        const count = document.createElement('span');
        count.className = 'drag-more';
        count.textContent = '+' + more;
        ghost.append(count);
      }
      document.body.append(ghost);
      document.body.classList.add('moving-idea');
      moving = { id: p.id, pointerId: p.pointerId, ghost, x: p.lx, y: p.ly, hit: null, raf: 0 };
      this.dragging = true;
      window.addEventListener('keydown', onMoveKey, true);
      track(p.lx, p.ly);
      moving.raf = requestAnimationFrame(frame);
    };

    const finishMove = (drop: boolean) => {
      const m = moving;
      if (!m) return;
      moving = null;
      this.dragging = false;
      cancelAnimationFrame(m.raf);
      window.removeEventListener('keydown', onMoveKey, true);
      m.ghost.remove();
      document.body.classList.remove('moving-idea');
      this.setDropMarks(null, null);
      // The browser still sends a click for this press; it is not one.
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);
      if (drop && m.hit) this.events.drop(m.id, m.hit);
    };

    // Catches releases outside the viewport (the canvas handles its own first).
    window.addEventListener('pointerup', (e) => {
      if (press?.pointerId === e.pointerId) clearPress();
      if (moving?.pointerId === e.pointerId) finishMove(true);
    });
    window.addEventListener('blur', () => {
      clearPress();
      finishMove(false);
    });

    this.el.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const nodeEl = target.closest<HTMLElement>('.node');
      if (nodeEl) {
        if (press || moving || pointers.size || e.button !== 0) return;
        if (nodeEl.classList.contains('exit') || nodeEl.classList.contains('editing') || target.closest('[contenteditable]')) return;
        const touch = e.pointerType === 'touch';
        press = { id: nodeEl.dataset.id!, pointerId: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, touch, timer: 0 };
        if (touch) press.timer = window.setTimeout(startMove, 420);
        return;
      }
      clearPress();
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.camT.z };
        drag = null;
      }
    });
    this.el.addEventListener('pointermove', (e) => {
      if (moving?.pointerId === e.pointerId) {
        // The button came up somewhere we never heard about (another window, say).
        if (e.pointerType === 'mouse' && !(e.buttons & 1)) finishMove(false);
        else track(e.clientX, e.clientY);
        return;
      }
      if (press?.pointerId === e.pointerId) {
        press.lx = e.clientX;
        press.ly = e.clientY;
        const dist = Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y);
        if (press.touch) {
          if (dist > 10) clearPress();
        } else if (!(e.buttons & 1)) clearPress();
        else if (dist > 5) startMove();
        return;
      }
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = clampZ((pinch.z * d) / pinch.d);
        this.zoomBy(target / this.camT.z, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.cam = { ...this.camT };
        this.applyCamera();
        return;
      }
      if (drag) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) {
          drag.moved = true;
          this.el.classList.add('panning');
        }
        this.camT.x -= dx / this.camT.z;
        this.camT.y -= dy / this.camT.z;
        this.cam.x = this.camT.x;
        this.cam.y = this.camT.y;
        this.applyCamera();
      }
    });
    const end = (e: PointerEvent) => {
      if (moving?.pointerId === e.pointerId) {
        track(e.clientX, e.clientY);
        finishMove(e.type === 'pointerup');
        return;
      }
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !drag.moved && e.type === 'pointerup') this.events.canvasClick(e);
      if (!pointers.size) drag = null;
      this.el.classList.remove('panning');
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('lostpointercapture', (e) => {
      if (moving?.pointerId === e.pointerId) finishMove(false);
    });

    this.el.addEventListener('click', (e) => {
      if (swallowClick) return;
      const node = (e.target as HTMLElement).closest<HTMLElement>('.node');
      if (node?.dataset.id && !node.classList.contains('exit')) this.events.nodeClick(node.dataset.id, e);
    });
    this.el.addEventListener('dblclick', (e) => {
      if (swallowClick) return;
      const node = (e.target as HTMLElement).closest<HTMLElement>('.node');
      if (node?.dataset.id) this.events.nodeDblClick(node.dataset.id, e);
      else this.events.canvasDblClick(e);
    });

    this.el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.vh : 1;
        if (e.ctrlKey || e.metaKey) {
          this.zoomBy(Math.exp(-e.deltaY * unit * 0.0075), e.clientX, e.clientY);
        } else {
          this.camT.x += (e.deltaX * unit) / this.camT.z;
          this.camT.y += (e.deltaY * unit) / this.camT.z;
          this.cam.x = this.camT.x;
          this.cam.y = this.camT.y;
          this.applyCamera();
        }
      },
      { passive: false },
    );
  }
}

function clampZ(z: number) {
  return Math.min(MAX_Z, Math.max(MIN_Z, z));
}

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

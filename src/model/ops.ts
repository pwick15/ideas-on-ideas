import { ancestors, depthOf, isAncestor, pickHue, subtreeIds, subtreeSize } from './tree';
import type { Id, IdeaNode, Link, MapDoc, MapKind, Rating, Side } from './types';

export function uid(): Id {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0].toString(36) + a[1].toString(36)).slice(0, 10);
}

/**
 * A copy-on-write transaction over a map. Nodes are copied the first time they are
 * mutated, so untouched nodes are shared with the previous version (cheap undo).
 */
export class Tx {
  nodes: Record<Id, IdeaNode>;
  roots: Id[];
  links: Link[];
  private owned = new Set<Id>();

  constructor(private base: MapDoc) {
    this.nodes = { ...base.nodes };
    this.roots = base.roots.slice();
    this.links = base.links;
  }

  get(id: Id): IdeaNode {
    return this.nodes[id];
  }

  mut(id: Id): IdeaNode {
    if (!this.owned.has(id)) {
      const n = this.nodes[id];
      this.nodes[id] = { ...n, children: n.children.slice() };
      this.owned.add(id);
    }
    return this.nodes[id];
  }

  add(n: IdeaNode) {
    this.nodes[n.id] = n;
    this.owned.add(n.id);
  }

  remove(id: Id) {
    delete this.nodes[id];
  }

  done(): MapDoc {
    return { ...this.base, nodes: this.nodes, roots: this.roots, links: this.links, updated: Date.now() };
  }
}

export function makeNode(text: string, parent: Id | null, extra: Partial<IdeaNode> = {}): IdeaNode {
  return { id: uid(), text, parent, children: [], created: Date.now(), ...extra };
}

export function emptyDoc(kind: MapKind): MapDoc {
  const now = Date.now();
  return { v: 1, id: uid(), kind, nodes: {}, roots: [], links: [], layout: 'balanced', created: now, updated: now };
}

/** Removes the node from its parent's child list (or the root list). Returns the old index. */
function detach(tx: Tx, id: Id): number {
  const n = tx.get(id);
  if (n.parent) {
    const p = tx.mut(n.parent);
    const i = p.children.indexOf(id);
    if (i >= 0) p.children.splice(i, 1);
    return i;
  }
  const i = tx.roots.indexOf(id);
  if (i >= 0) tx.roots.splice(i, 1);
  return i;
}

function attach(tx: Tx, id: Id, parent: Id | null, index: number) {
  const n = tx.mut(id);
  // A new home means a new automatic position.
  delete n.off;
  n.parent = parent;
  const list = parent ? tx.mut(parent).children : tx.roots;
  const i = Math.max(0, Math.min(index, list.length));
  list.splice(i, 0, id);
}

/** Picks the lighter side of a center for a new first-level branch. */
function lighterSide(tx: Tx, rootId: Id, skip?: Id): Side {
  let right = 0;
  let left = 0;
  for (const c of tx.get(rootId).children) {
    if (c === skip) continue;
    const w = subtreeSize(tx.nodes, c);
    if ((tx.get(c).side ?? 1) === 1) right += w;
    else left += w;
  }
  return left < right ? -1 : 1;
}

/** Keeps first-level styling rules true after a node moves: hue and side live at depth 1 only. */
function normalizeBranch(tx: Tx, id: Id, preferSide?: Side) {
  const n = tx.get(id);
  const depth = depthOf(tx.nodes, id);
  if (depth === 1) {
    const m = tx.mut(id);
    if (m.hue === undefined) {
      const sibs = tx.get(n.parent!).children.filter((c) => c !== id);
      m.hue = pickHue(sibs.map((c) => tx.get(c).hue));
    }
    if (m.side === undefined) m.side = preferSide ?? lighterSide(tx, n.parent!, id);
  } else if (n.hue !== undefined || n.side !== undefined) {
    const m = tx.mut(id);
    delete m.hue;
    delete m.side;
  }
}

export function addChild(doc: MapDoc, parentId: Id, text = '', extra: Partial<IdeaNode> = {}, index?: number) {
  const tx = new Tx(doc);
  const parent = tx.get(parentId);
  const node = makeNode(text, parentId, extra);
  if (!parent.parent) {
    node.side = extra.side ?? lighterSide(tx, parentId);
    node.hue = pickHue(parent.children.map((c) => tx.get(c).hue));
  }
  tx.add(node);
  const p = tx.mut(parentId);
  if (p.collapsed) p.collapsed = false;
  // A new first-level branch goes after the last branch on its side so it lands near the bottom of that column.
  let at = index ?? p.children.length;
  if (index === undefined && !parent.parent) {
    let last = -1;
    p.children.forEach((c, i) => {
      if (c !== node.id && (tx.get(c).side ?? 1) === node.side) last = i;
    });
    at = last + 1;
  }
  p.children.splice(at, 0, node.id);
  return { doc: tx.done(), id: node.id };
}

export function addSibling(doc: MapDoc, id: Id, before = false, text = '') {
  const n = doc.nodes[id];
  if (!n.parent) return addRoot(doc, text, doc.roots.indexOf(id) + (before ? 0 : 1));
  const sibs = doc.nodes[n.parent].children;
  const i = sibs.indexOf(id) + (before ? 0 : 1);
  return addChild(doc, n.parent, text, n.side ? { side: n.side } : {}, i);
}

export function addRoot(doc: MapDoc, text = '', index?: number) {
  const tx = new Tx(doc);
  const node = makeNode(text, null);
  tx.add(node);
  tx.roots.splice(index ?? tx.roots.length, 0, node.id);
  return { doc: tx.done(), id: node.id };
}

export function setText(doc: MapDoc, id: Id, text: string): MapDoc {
  if (doc.nodes[id].text === text) return doc;
  const tx = new Tx(doc);
  tx.mut(id).text = text;
  return tx.done();
}

export function patchNode(doc: MapDoc, id: Id, patch: Partial<IdeaNode>): MapDoc {
  const tx = new Tx(doc);
  const m = tx.mut(id);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (m as unknown as Record<string, unknown>)[k];
    else (m as unknown as Record<string, unknown>)[k] = v;
  }
  return tx.done();
}

/** Shifts an idea (and so everything under it) by a drag. Dragging it back to where it started clears the offset. */
export function offsetNode(doc: MapDoc, id: Id, dx: number, dy: number): MapDoc {
  const o = doc.nodes[id].off;
  const x = Math.round((o?.x ?? 0) + dx);
  const y = Math.round((o?.y ?? 0) + dy);
  return patchNode(doc, id, { off: x || y ? { x, y } : undefined });
}

/** Sends dragged ideas back to their automatic positions: the whole map, or one idea's branch. Null when nothing was moved. */
export function clearOffsets(doc: MapDoc, from?: Id): MapDoc | null {
  const ids = from ? subtreeIds(doc.nodes, from) : Object.keys(doc.nodes);
  const moved = ids.filter((id) => doc.nodes[id].off);
  if (!moved.length) return null;
  const tx = new Tx(doc);
  for (const id of moved) delete tx.mut(id).off;
  return tx.done();
}

export function setRating(doc: MapDoc, id: Id, rating: Rating | undefined): MapDoc {
  return patchNode(doc, id, { rating, cut: rating ? undefined : doc.nodes[id].cut });
}

export function setCut(doc: MapDoc, id: Id, cut: boolean): MapDoc {
  return patchNode(doc, id, { cut: cut || undefined, rating: cut ? undefined : doc.nodes[id].rating });
}

/** Deletes a node and everything under it. Returns the id that should take focus. */
export function deleteNode(doc: MapDoc, id: Id): { doc: MapDoc; focus: Id | null } {
  const n = doc.nodes[id];
  const sibs = n.parent ? doc.nodes[n.parent].children : doc.roots;
  const i = sibs.indexOf(id);
  const focus = sibs[i + 1] ?? sibs[i - 1] ?? n.parent ?? null;
  const tx = new Tx(doc);
  detach(tx, id);
  const gone = new Set(subtreeIds(doc.nodes, id));
  for (const g of gone) tx.remove(g);
  if (doc.links.some((l) => gone.has(l.a) || gone.has(l.b))) {
    tx.links = doc.links.filter((l) => !gone.has(l.a) && !gone.has(l.b));
  }
  return { doc: tx.done(), focus };
}

/** Swap with the previous (-1) or next (+1) sibling. First-level branches only swap within their side. */
export function moveAmongSiblings(doc: MapDoc, id: Id, dir: -1 | 1): MapDoc | null {
  const n = doc.nodes[id];
  const list = n.parent ? doc.nodes[n.parent].children : doc.roots;
  const i = list.indexOf(id);
  let j = i + dir;
  if (n.side !== undefined && n.parent && !doc.nodes[n.parent].parent) {
    while (j >= 0 && j < list.length && (doc.nodes[list[j]].side ?? 1) !== n.side) j += dir;
  }
  if (j < 0 || j >= list.length) return null;
  const tx = new Tx(doc);
  const target = n.parent ? tx.mut(n.parent).children : tx.roots;
  target.splice(i, 1);
  target.splice(j, 0, id);
  // Dragged positions would hide the swap, so both ideas go back to their automatic spots.
  for (const k of [id, target[i]]) if (tx.get(k)?.off) delete tx.mut(k).off;
  return tx.done();
}

/** Make the node the last child of its previous sibling (outliner-style indent). */
export function indent(doc: MapDoc, id: Id): MapDoc | null {
  const n = doc.nodes[id];
  if (!n.parent) return null;
  const sibs = doc.nodes[n.parent].children;
  let i = sibs.indexOf(id) - 1;
  if (n.side !== undefined && !doc.nodes[n.parent].parent) {
    while (i >= 0 && (doc.nodes[sibs[i]].side ?? 1) !== n.side) i--;
  }
  if (i < 0) return null;
  const newParent = sibs[i];
  const tx = new Tx(doc);
  detach(tx, id);
  attach(tx, id, newParent, tx.get(newParent).children.length);
  const np = tx.mut(newParent);
  if (np.collapsed) np.collapsed = false;
  for (const d of subtreeIds(tx.nodes, id)) normalizeBranch(tx, d);
  return tx.done();
}

/** Make the node a sibling that follows its parent. At depth 1 it becomes a new center. */
export function outdent(doc: MapDoc, id: Id): MapDoc | null {
  const n = doc.nodes[id];
  if (!n.parent) return null;
  const parent = doc.nodes[n.parent];
  const tx = new Tx(doc);
  detach(tx, id);
  if (!parent.parent) {
    attach(tx, id, null, tx.roots.indexOf(parent.id) + 1);
  } else {
    const gp = tx.get(parent.parent!);
    attach(tx, id, gp.id, gp.children.indexOf(parent.id) + 1);
  }
  const preferSide = parent.side;
  for (const d of subtreeIds(tx.nodes, id)) normalizeBranch(tx, d, d === id ? preferSide : undefined);
  return tx.done();
}

export function flipSide(doc: MapDoc, id: Id): MapDoc | null {
  const n = doc.nodes[id];
  if (!n.parent || doc.nodes[n.parent].parent) return null;
  const tx = new Tx(doc);
  const m = tx.mut(id);
  m.side = ((n.side ?? 1) * -1) as Side;
  // Move it to the end of its new side so it lands at the bottom of that column.
  const p = tx.mut(n.parent);
  p.children.splice(p.children.indexOf(id), 1);
  let last = -1;
  p.children.forEach((c, i) => {
    if ((tx.get(c).side ?? 1) === m.side) last = i;
  });
  p.children.splice(last + 1, 0, id);
  return tx.done();
}

/** Insert a new empty parent between the node and its parent. */
export function wrapInParent(doc: MapDoc, id: Id): { doc: MapDoc; id: Id } | null {
  const n = doc.nodes[id];
  const tx = new Tx(doc);
  const wrapper = makeNode('', n.parent);
  tx.add(wrapper);
  const i = detach(tx, id);
  attach(tx, wrapper.id, n.parent, i);
  attach(tx, id, wrapper.id, 0);
  if (n.side !== undefined) tx.mut(wrapper.id).side = n.side;
  for (const d of subtreeIds(tx.nodes, wrapper.id)) normalizeBranch(tx, d, n.side);
  return { doc: tx.done(), id: wrapper.id };
}

/**
 * Move a node (and its subtree) under a new parent, or out to be a center when the parent is null.
 * `index` is a position in the target list as it is before the move, and defaults to the end.
 * `side` puts a new first-level branch on that side of its center. Returns null when nothing would change.
 */
export function reparent(doc: MapDoc, id: Id, newParent: Id | null, index?: number, side?: Side): MapDoc | null {
  if (newParent && (newParent === id || isAncestor(doc.nodes, id, newParent))) return null;
  const n = doc.nodes[id];
  const list = newParent ? doc.nodes[newParent].children : doc.roots;
  const from = list.indexOf(id);
  let at = index ?? list.length;
  // Taking the node out first shifts everything after it in the same list.
  if (from >= 0 && from < at) at--;
  if (from === at && (side === undefined || side === n.side)) return null;
  const tx = new Tx(doc);
  detach(tx, id);
  attach(tx, id, newParent, at);
  if (newParent) {
    const np = tx.mut(newParent);
    if (np.collapsed) np.collapsed = false;
  }
  const m = tx.mut(id);
  delete m.side;
  if (depthOf(tx.nodes, id) !== 1) delete m.hue;
  for (const d of subtreeIds(tx.nodes, id)) normalizeBranch(tx, d, d === id ? side : undefined);
  return tx.done();
}

/**
 * Make a node the center of its tree. The path back to the old center flips direction,
 * so the old center (and anything in between) becomes a branch. Nothing is deleted.
 */
export function makeCenter(doc: MapDoc, id: Id): MapDoc | null {
  if (!doc.nodes[id]?.parent) return null;
  const path = [id, ...ancestors(doc.nodes, id)];
  const tx = new Tx(doc);
  // Each parent on the path becomes the last child of the idea that was below it.
  for (let i = 0; i < path.length - 1; i++) {
    const below = tx.mut(path[i]);
    const above = tx.mut(path[i + 1]);
    delete below.off;
    delete above.off;
    above.children.splice(above.children.indexOf(below.id), 1);
    below.children.push(above.id);
    above.parent = below.id;
  }
  tx.roots[tx.roots.indexOf(path[path.length - 1])] = id;
  const center = tx.mut(id);
  center.parent = null;
  delete center.collapsed;
  // A cut center would fade its whole tree.
  delete center.cut;
  restyle(tx, id);
  return tx.done();
}

/** After a tree changes shape: the center is neutral, first-level branches get a hue and a side, deeper ideas inherit both. */
function restyle(tx: Tx, rootId: Id) {
  const strip = (id: Id) => {
    const n = tx.get(id);
    if (n.hue === undefined && n.side === undefined) return;
    const m = tx.mut(id);
    delete m.hue;
    delete m.side;
  };
  strip(rootId);
  const kids = tx.get(rootId).children;
  const used = kids.map((k) => tx.get(k).hue);
  for (const k of kids) {
    if (tx.get(k).hue !== undefined) continue;
    const hue = pickHue(used);
    tx.mut(k).hue = hue;
    used.push(hue);
  }
  // Split the branches into two columns of similar size, keeping their order.
  const weights = kids.map((k) => subtreeSize(tx.nodes, k));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  kids.forEach((k, i) => {
    const side: Side = acc + weights[i] / 2 <= total / 2 ? 1 : -1;
    acc += weights[i];
    if (tx.get(k).side !== side) tx.mut(k).side = side;
    for (const d of subtreeIds(tx.nodes, k)) if (d !== k) strip(d);
  });
}

export function toggleLink(doc: MapDoc, a: Id, b: Id): { doc: MapDoc; added: boolean } {
  const existing = doc.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  const tx = new Tx(doc);
  if (existing) tx.links = doc.links.filter((l) => l !== existing);
  else tx.links = [...doc.links, { id: uid(), a, b }];
  return { doc: tx.done(), added: !existing };
}

export interface ForestNode {
  text: string;
  rating?: Rating;
  cut?: boolean;
  note?: string;
  children: ForestNode[];
}

/** Insert a parsed outline (from paste or a template) as children of a node, or as new centers. */
export function insertForest(doc: MapDoc, parentId: Id | null, forest: ForestNode[], index?: number) {
  let d = doc;
  const created: Id[] = [];
  let at = index;
  const put = (pid: Id | null, f: ForestNode, i?: number): Id => {
    const extra: Partial<IdeaNode> = {};
    if (f.rating) extra.rating = f.rating;
    if (f.cut) extra.cut = true;
    if (f.note) extra.note = f.note;
    const r = pid ? addChild(d, pid, f.text, extra, i) : addRoot(d, f.text, i);
    d = r.doc;
    if (!pid && Object.keys(extra).length) d = patchNode(d, r.id, extra);
    for (const c of f.children) put(r.id, c);
    return r.id;
  };
  for (const f of forest) {
    created.push(put(parentId, f, at));
    if (at !== undefined) at++;
  }
  return { doc: d, ids: created };
}

export function toForest(doc: MapDoc, id: Id): ForestNode {
  const n = doc.nodes[id];
  return {
    text: n.text,
    rating: n.rating,
    cut: n.cut,
    note: n.note,
    children: n.children.map((c) => toForest(doc, c)),
  };
}

export function duplicate(doc: MapDoc, id: Id) {
  const n = doc.nodes[id];
  const sibs = n.parent ? doc.nodes[n.parent].children : doc.roots;
  const r = insertForest(doc, n.parent, [toForest(doc, id)], sibs.indexOf(id) + 1);
  let d = r.doc;
  if (n.side !== undefined) d = patchNode(d, r.ids[0], { side: n.side });
  return { doc: d, id: r.ids[0] };
}

export function moveRoot(doc: MapDoc, id: Id, dir: -1 | 1): MapDoc | null {
  return moveAmongSiblings(doc, id, dir);
}

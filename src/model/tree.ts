import type { Id, IdeaNode, MapDoc } from './types';

type Nodes = Record<Id, IdeaNode>;

/** Branch hues, ordered so neighbouring branches contrast. Gold (~90) is reserved for ratings. */
export const HUES = [22, 192, 298, 142, 352, 245, 52, 168];

export function depthOf(nodes: Nodes, id: Id): number {
  let d = 0;
  let n = nodes[id];
  while (n && n.parent) {
    d++;
    n = nodes[n.parent];
  }
  return d;
}

export function rootOf(nodes: Nodes, id: Id): Id {
  let n = nodes[id];
  while (n.parent) n = nodes[n.parent];
  return n.id;
}

/** Ancestors from the parent up to the root. */
export function ancestors(nodes: Nodes, id: Id): Id[] {
  const out: Id[] = [];
  let p = nodes[id]?.parent;
  while (p) {
    out.push(p);
    p = nodes[p].parent;
  }
  return out;
}

export function isAncestor(nodes: Nodes, maybeAncestor: Id, id: Id): boolean {
  let p = nodes[id]?.parent;
  while (p) {
    if (p === maybeAncestor) return true;
    p = nodes[p].parent;
  }
  return false;
}

export function subtreeIds(nodes: Nodes, id: Id): Id[] {
  const out: Id[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    const n = nodes[cur];
    if (n) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return out;
}

export function subtreeSize(nodes: Nodes, id: Id): number {
  return subtreeIds(nodes, id).length;
}

/** The nearest explicit hue on the node or its ancestors. Roots have none. */
export function hueOf(nodes: Nodes, id: Id): number | undefined {
  let n: IdeaNode | undefined = nodes[id];
  while (n) {
    if (n.hue !== undefined) return n.hue;
    n = n.parent ? nodes[n.parent] : undefined;
  }
  return undefined;
}

/** True when the node or any ancestor is cut. */
export function isCutDeep(nodes: Nodes, id: Id): boolean {
  let n: IdeaNode | undefined = nodes[id];
  while (n) {
    if (n.cut) return true;
    n = n.parent ? nodes[n.parent] : undefined;
  }
  return false;
}

export function siblingsOf(doc: MapDoc, id: Id): Id[] {
  const n = doc.nodes[id];
  return n.parent ? doc.nodes[n.parent].children : doc.roots;
}

/** Depth-first order of everything currently on screen. */
export function visibleOrder(doc: MapDoc, hideCut: boolean): Id[] {
  const out: Id[] = [];
  const walk = (id: Id) => {
    const n = doc.nodes[id];
    if (!n) return;
    if (hideCut && n.cut) return;
    out.push(id);
    if (!n.collapsed) for (const c of n.children) walk(c);
  };
  for (const r of doc.roots) walk(r);
  return out;
}

export function countIdeas(doc: MapDoc): number {
  return Object.keys(doc.nodes).length;
}

export function pickHue(used: (number | undefined)[]): number {
  const counts = new Map<number, number>();
  for (const h of HUES) counts.set(h, 0);
  for (const h of used) if (h !== undefined && counts.has(h)) counts.set(h, counts.get(h)! + 1);
  let best = HUES[0];
  let bestCount = Infinity;
  for (const h of HUES) {
    const c = counts.get(h)!;
    if (c < bestCount) {
      best = h;
      bestCount = c;
    }
  }
  return best;
}

/** Breadcrumb text from the root down to the node. */
export function pathText(nodes: Nodes, id: Id): string[] {
  const ids = ancestors(nodes, id).reverse();
  return ids.map((a) => nodes[a].text || 'Untitled');
}

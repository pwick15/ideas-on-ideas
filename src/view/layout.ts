import type { Id, LayoutKind, MapDoc, Side } from '../model/types';

/**
 * Where a node's position is pinned. Horizontal trees pin the inner edge so a node
 * grows away from its parent while you type, instead of jittering around its center.
 */
export type Anchor = 'c' | 'l' | 'r' | 't';

export interface Placement {
  ax: number;
  ay: number;
  anchor: Anchor;
  side: Side;
  depth: number;
  root: Id;
}

export interface Size {
  w: number;
  h: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boxFrom(ax: number, ay: number, anchor: Anchor, w: number, h: number): Box {
  switch (anchor) {
    case 'l':
      return { x: ax, y: ay - h / 2, w, h };
    case 'r':
      return { x: ax - w, y: ay - h / 2, w, h };
    case 't':
      return { x: ax - w / 2, y: ay, w, h };
    default:
      return { x: ax - w / 2, y: ay - h / 2, w, h };
  }
}

/** The anchor point of a box for a given anchor type. Used to convert when the anchor type changes. */
export function anchorOf(b: Box, anchor: Anchor): { x: number; y: number } {
  switch (anchor) {
    case 'l':
      return { x: b.x, y: b.y + b.h / 2 };
    case 'r':
      return { x: b.x + b.w, y: b.y + b.h / 2 };
    case 't':
      return { x: b.x + b.w / 2, y: b.y };
    default:
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
}

const GAP_X = [72, 44, 36];
const GAP_STACK = [22, 12, 8];
const DOWN_GAP_Y = [70, 48, 40];
const DOWN_GAP_X = [26, 16, 12];
const TREE_GAP = 160;

const at = (xs: number[], d: number) => xs[Math.min(d, xs.length - 1)];

export function computeLayout(
  doc: MapDoc,
  kind: LayoutKind,
  visibleKids: (id: Id) => Id[],
  size: (id: Id) => Size,
): Map<Id, Placement> {
  const all = new Map<Id, Placement>();
  let cursor = 0;
  let first = true;

  for (const rootId of doc.roots) {
    if (!doc.nodes[rootId]) continue;
    const local = new Map<Id, Placement>();
    if (kind === 'radial') radial(rootId, visibleKids, size, local);
    else if (kind === 'down') down(rootId, visibleKids, size, local);
    else horizontal(rootId, kind === 'balanced', doc, visibleKids, size, local);

    // Lay trees out in a row, left to right, with the first center at the origin.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const [id, p] of local) {
      const s = size(id);
      const b = boxFrom(p.ax, p.ay, p.anchor, s.w, s.h);
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.w);
    }
    const dx = first ? 0 : cursor + TREE_GAP - minX;
    first = false;
    cursor = maxX + dx;
    for (const [id, p] of local) all.set(id, { ...p, ax: p.ax + dx });
  }
  return all;
}

function horizontal(
  rootId: Id,
  balanced: boolean,
  doc: MapDoc,
  kids: (id: Id) => Id[],
  size: (id: Id) => Size,
  out: Map<Id, Placement>,
) {
  const heights = new Map<Id, number>();
  const heightOf = (id: Id, depth: number): number => {
    const cached = heights.get(id);
    if (cached !== undefined) return cached;
    const ks = kids(id);
    const own = size(id).h;
    let block = 0;
    if (ks.length) {
      for (const k of ks) block += heightOf(k, depth + 1);
      block += at(GAP_STACK, depth + 1) * (ks.length - 1);
    }
    const h = Math.max(own, block);
    heights.set(id, h);
    return h;
  };

  const place = (id: Id, edgeX: number, cy: number, dir: Side, depth: number) => {
    const s = size(id);
    out.set(id, { ax: edgeX, ay: cy, anchor: dir > 0 ? 'l' : 'r', side: dir, depth, root: rootId });
    stack(kids(id), edgeX + dir * (s.w + at(GAP_X, depth)), cy, dir, depth + 1);
  };

  const stack = (ks: Id[], edgeX: number, cy: number, dir: Side, depth: number) => {
    if (!ks.length) return;
    const gap = at(GAP_STACK, depth);
    let total = gap * (ks.length - 1);
    for (const k of ks) total += heightOf(k, depth);
    let y = cy - total / 2;
    for (const k of ks) {
      const h = heightOf(k, depth);
      place(k, edgeX, y + h / 2, dir, depth);
      y += h + gap;
    }
  };

  const rs = size(rootId);
  out.set(rootId, { ax: 0, ay: 0, anchor: 'c', side: 1, depth: 0, root: rootId });
  const all = kids(rootId);
  if (!balanced) {
    stack(all, rs.w / 2 + at(GAP_X, 0), 0, 1, 1);
    return;
  }
  // Branches without a stored side split by order: first half right, rest left.
  const right: Id[] = [];
  const left: Id[] = [];
  all.forEach((k, i) => {
    const side = doc.nodes[k].side ?? (i < Math.ceil(all.length / 2) ? 1 : -1);
    (side === 1 ? right : left).push(k);
  });
  stack(right, rs.w / 2 + at(GAP_X, 0), 0, 1, 1);
  stack(left, -(rs.w / 2 + at(GAP_X, 0)), 0, -1, 1);
}

function down(rootId: Id, kids: (id: Id) => Id[], size: (id: Id) => Size, out: Map<Id, Placement>) {
  const widths = new Map<Id, number>();
  const widthOf = (id: Id, depth: number): number => {
    const cached = widths.get(id);
    if (cached !== undefined) return cached;
    const ks = kids(id);
    let block = 0;
    if (ks.length) {
      for (const k of ks) block += widthOf(k, depth + 1);
      block += at(DOWN_GAP_X, depth + 1) * (ks.length - 1);
    }
    const w = Math.max(size(id).w, block);
    widths.set(id, w);
    return w;
  };

  const place = (id: Id, cx: number, topY: number, depth: number) => {
    out.set(id, { ax: cx, ay: topY, anchor: 't', side: 1, depth, root: rootId });
    row(kids(id), cx, topY + size(id).h + at(DOWN_GAP_Y, depth), depth + 1);
  };

  const row = (ks: Id[], cx: number, topY: number, depth: number) => {
    if (!ks.length) return;
    const gap = at(DOWN_GAP_X, depth);
    let total = gap * (ks.length - 1);
    for (const k of ks) total += widthOf(k, depth);
    let x = cx - total / 2;
    for (const k of ks) {
      const w = widthOf(k, depth);
      place(k, x + w / 2, topY, depth);
      x += w + gap;
    }
  };

  const rs = size(rootId);
  out.set(rootId, { ax: 0, ay: 0, anchor: 'c', side: 1, depth: 0, root: rootId });
  row(kids(rootId), 0, rs.h / 2 + at(DOWN_GAP_Y, 0), 1);
}

function radial(rootId: Id, kids: (id: Id) => Id[], size: (id: Id) => Size, out: Map<Id, Placement>) {
  const leaves = new Map<Id, number>();
  const leafCount = (id: Id): number => {
    const ks = kids(id);
    const n = ks.length ? ks.reduce((s, k) => s + leafCount(k), 0) : 1;
    leaves.set(id, n);
    return n;
  };
  leafCount(rootId);

  const angle = new Map<Id, number>();
  const byDepth: Id[][] = [];
  const assign = (id: Id, a0: number, a1: number, depth: number) => {
    angle.set(id, (a0 + a1) / 2);
    (byDepth[depth] ??= []).push(id);
    const ks = kids(id);
    const total = leaves.get(id)!;
    let a = a0;
    for (const k of ks) {
      const span = ((a1 - a0) * leaves.get(k)!) / total;
      assign(k, a, a + span, depth + 1);
      a += span;
    }
  };
  // Start a little before 12 o'clock so the first branch sits upper right.
  const start = -Math.PI / 2 + 0.35;
  assign(rootId, start, start + Math.PI * 2, 0);

  const radialExtent = (id: Id) => {
    const s = size(id);
    const t = angle.get(id)!;
    return Math.abs(s.w * Math.cos(t)) + Math.abs(s.h * Math.sin(t));
  };
  const tangentExtent = (id: Id) => {
    const s = size(id);
    const t = angle.get(id)!;
    return Math.abs(s.w * Math.sin(t)) + Math.abs(s.h * Math.cos(t));
  };

  const radius: number[] = [0];
  const rs = size(rootId);
  let prevHalf = Math.hypot(rs.w, rs.h) / 2;
  for (let d = 1; d < byDepth.length; d++) {
    const ids = byDepth[d];
    let maxHalf = 0;
    for (const id of ids) maxHalf = Math.max(maxHalf, radialExtent(id) / 2);
    let r = radius[d - 1] + prevHalf + maxHalf + (d === 1 ? 70 : 46);
    if (ids.length > 1) {
      const sorted = ids.slice().sort((a, b) => angle.get(a)! - angle.get(b)!);
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        const b = sorted[(i + 1) % sorted.length];
        let dt = angle.get(b)! - angle.get(a)!;
        if (i === sorted.length - 1) dt += Math.PI * 2;
        if (dt <= 0) continue;
        const need = (tangentExtent(a) + tangentExtent(b)) / 2 + 10;
        const chord = 2 * Math.sin(Math.min(dt, Math.PI) / 2);
        r = Math.max(r, need / chord);
      }
    }
    radius[d] = r;
    prevHalf = maxHalf;
  }

  const walk = (id: Id, depth: number) => {
    const t = angle.get(id)!;
    const r = radius[depth];
    out.set(id, {
      ax: depth === 0 ? 0 : r * Math.cos(t),
      ay: depth === 0 ? 0 : r * Math.sin(t),
      anchor: 'c',
      side: Math.cos(t) >= 0 ? 1 : -1,
      depth,
      root: rootId,
    });
    for (const k of kids(id)) walk(k, depth + 1);
  };
  walk(rootId, 0);
}

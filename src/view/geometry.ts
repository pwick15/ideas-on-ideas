import type { LayoutKind, Side } from '../model/types';
import type { Box } from './layout';

type P = { x: number; y: number };

const f = (n: number) => Math.round(n * 10) / 10;

/** Branch thickness at the parent end and child end, by the child's depth. */
const WIDTHS: [number, number][] = [
  [0, 0],
  [8, 3],
  [3.2, 1.8],
  [2, 1.4],
];

function norm(x: number, y: number): P {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

/** A cubic Bézier drawn as a filled shape that tapers from w0 to w1. */
function taper(p0: P, p1: P, p2: P, p3: P, w0: number, w1: number): string {
  let d0 = norm(p1.x - p0.x, p1.y - p0.y);
  if (p1.x === p0.x && p1.y === p0.y) d0 = norm(p3.x - p0.x, p3.y - p0.y);
  let d3 = norm(p3.x - p2.x, p3.y - p2.y);
  if (p3.x === p2.x && p3.y === p2.y) d3 = norm(p3.x - p0.x, p3.y - p0.y);
  const n0 = { x: -d0.y, y: d0.x };
  const n3 = { x: -d3.y, y: d3.x };
  const a = w0 / 2;
  const b = (w0 + (w1 - w0) / 3) / 2;
  const c = (w0 + ((w1 - w0) * 2) / 3) / 2;
  const d = w1 / 2;
  const t0 = { x: p0.x + n0.x * a, y: p0.y + n0.y * a };
  const t1 = { x: p1.x + n0.x * b, y: p1.y + n0.y * b };
  const t2 = { x: p2.x + n3.x * c, y: p2.y + n3.y * c };
  const t3 = { x: p3.x + n3.x * d, y: p3.y + n3.y * d };
  const b3 = { x: p3.x - n3.x * d, y: p3.y - n3.y * d };
  const b2 = { x: p2.x - n3.x * c, y: p2.y - n3.y * c };
  const b1 = { x: p1.x - n0.x * b, y: p1.y - n0.y * b };
  const b0 = { x: p0.x - n0.x * a, y: p0.y - n0.y * a };
  return (
    `M${f(t0.x)} ${f(t0.y)}C${f(t1.x)} ${f(t1.y)} ${f(t2.x)} ${f(t2.y)} ${f(t3.x)} ${f(t3.y)}` +
    `A${f(d)} ${f(d)} 0 0 0 ${f(b3.x)} ${f(b3.y)}` +
    `C${f(b2.x)} ${f(b2.y)} ${f(b1.x)} ${f(b1.y)} ${f(b0.x)} ${f(b0.y)}Z`
  );
}

export function edgePath(
  layout: LayoutKind,
  parent: Box,
  child: Box,
  side: Side,
  childDepth: number,
  parentIsRoot: boolean,
  rootCenter: P,
): string {
  const [w0, w1] = WIDTHS[Math.min(childDepth, WIDTHS.length - 1)];
  const pc = { x: parent.x + parent.w / 2, y: parent.y + parent.h / 2 };
  const cc = { x: child.x + child.w / 2, y: child.y + child.h / 2 };

  if (layout === 'down') {
    const p0 = { x: pc.x, y: parentIsRoot ? pc.y + parent.h / 2 - 8 : parent.y + parent.h };
    const p3 = { x: cc.x, y: child.y };
    const dy = (p3.y - p0.y) * 0.55;
    return taper(p0, { x: p0.x, y: p0.y + dy }, { x: p3.x, y: p3.y - dy }, p3, w0, w1);
  }

  if (layout === 'radial') {
    const tp = Math.atan2(pc.y - rootCenter.y, pc.x - rootCenter.x);
    const tc = Math.atan2(cc.y - rootCenter.y, cc.x - rootCenter.x);
    const rp = Math.hypot(pc.x - rootCenter.x, pc.y - rootCenter.y);
    const rc = Math.hypot(cc.x - rootCenter.x, cc.y - rootCenter.y);
    const rm = (rp + rc) / 2;
    const ta = rp < 1 ? tc : tp;
    const c1 = { x: rootCenter.x + rm * Math.cos(ta), y: rootCenter.y + rm * Math.sin(ta) };
    const c2 = { x: rootCenter.x + rm * Math.cos(tc), y: rootCenter.y + rm * Math.sin(tc) };
    return taper(pc, c1, c2, cc, w0, w1);
  }

  // Horizontal trees: leave the parent's outer edge, enter the child's inner edge.
  const p0 = {
    x: parentIsRoot ? pc.x + side * (parent.w / 2 - 10) : side > 0 ? parent.x + parent.w : parent.x,
    y: pc.y,
  };
  const p3 = { x: side > 0 ? child.x : child.x + child.w, y: cc.y };
  const dx = (p3.x - p0.x) * 0.5;
  return taper(p0, { x: p0.x + dx, y: p0.y }, { x: p3.x - dx, y: p3.y }, p3, w0, w1);
}

/** Where a ray from the box center toward a point leaves the box. */
function exitPoint(b: Box, toward: P, pad = 4): P {
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const hw = b.w / 2 + pad;
  const hh = b.h / 2 + pad;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** A gently bowed curve between two ideas, for bridges. */
export function linkPath(a: Box, b: Box): { d: string; a: P; b: P } {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
  const n = { x: -(cb.y - ca.y) / len, y: (cb.x - ca.x) / len };
  const bow = Math.min(160, len * 0.22);
  const ctrl = { x: (ca.x + cb.x) / 2 + n.x * bow, y: (ca.y + cb.y) / 2 + n.y * bow };
  const pa = exitPoint(a, ctrl);
  const pb = exitPoint(b, ctrl);
  return { d: `M${f(pa.x)} ${f(pa.y)}Q${f(ctrl.x)} ${f(ctrl.y)} ${f(pb.x)} ${f(pb.y)}`, a: pa, b: pb };
}

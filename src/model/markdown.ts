import type { ForestNode } from './ops';
import { pathText } from './tree';
import type { Id, MapDoc, Rating } from './types';

const STAR = '✦';

function decorate(text: string, rating?: Rating, cut?: boolean): string {
  const clean = text.replace(/\n+/g, ' ').trim() || 'Untitled';
  let out = cut ? `~~${clean}~~` : clean;
  if (rating) out += ' ' + STAR.repeat(rating);
  return out;
}

/** A note as quote lines, indented so Markdown keeps it inside the list item above. */
function noteLines(note: string | undefined, indent: string): string[] {
  if (!note?.trim()) return [];
  return note
    .trim()
    .split('\n')
    .map((l) => (indent + '> ' + l).trimEnd());
}

/** The whole map as a nested Markdown outline. Each center becomes a heading. */
export function mapToMarkdown(doc: MapDoc, includeCut = true): string {
  const lines: string[] = [];
  const walk = (id: Id, depth: number) => {
    const n = doc.nodes[id];
    if (!includeCut && n.cut) return;
    lines.push('  '.repeat(depth) + '- ' + decorate(n.text, n.rating, n.cut), ...noteLines(n.note, '  '.repeat(depth + 1)));
    for (const c of n.children) walk(c, depth + 1);
  };
  for (const r of doc.roots) {
    const root = doc.nodes[r];
    if (lines.length) lines.push('');
    lines.push('# ' + decorate(root.text, root.rating));
    lines.push('');
    const note = noteLines(root.note, '');
    if (note.length) lines.push(...note, '');
    for (const c of root.children) walk(c, 0);
  }
  if (doc.links.length) {
    lines.push('', '---', '', 'Bridges:', '');
    for (const l of doc.links) {
      const a = doc.nodes[l.a]?.text ?? '?';
      const b = doc.nodes[l.b]?.text ?? '?';
      const arrow = l.dir ? '->' : '<->';
      lines.push(`- ${a} ${arrow} ${b}${l.label ? ` (${l.label})` : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}

export function subtreeToMarkdown(doc: MapDoc, id: Id): string {
  const lines: string[] = [];
  const walk = (nid: Id, depth: number) => {
    const n = doc.nodes[nid];
    lines.push('  '.repeat(depth) + '- ' + decorate(n.text, n.rating, n.cut), ...noteLines(n.note, '  '.repeat(depth + 1)));
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(id, 0);
  return lines.join('\n');
}

export interface HarvestItem {
  id: Id;
  text: string;
  rating: Rating;
  path: string[];
  note?: string;
}

export function harvestItems(doc: MapDoc): HarvestItem[] {
  const items: HarvestItem[] = [];
  const walk = (id: Id, underCut: boolean) => {
    const n = doc.nodes[id];
    const cut = underCut || !!n.cut;
    if (n.rating && !cut) items.push({ id, text: n.text, rating: n.rating, path: pathText(doc.nodes, id), note: n.note });
    for (const c of n.children) walk(c, cut);
  };
  for (const r of doc.roots) walk(r, false);
  // Stable sort keeps map order inside each rating tier.
  return items.sort((a, b) => b.rating - a.rating);
}

export function harvestToMarkdown(doc: MapDoc, title: string): string {
  const items = harvestItems(doc);
  const lines = [`# Harvest: ${title}`, ''];
  for (const tier of [3, 2, 1] as Rating[]) {
    const group = items.filter((i) => i.rating === tier);
    if (!group.length) continue;
    lines.push(`## ${STAR.repeat(tier)}`, '');
    for (const i of group) {
      const ctx = i.path.length > 1 ? ` (${i.path.slice(1).join(' > ')})` : '';
      lines.push(`- ${i.text.replace(/\n+/g, ' ')}${ctx}`, ...noteLines(i.note, '  '));
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Parses pasted text into an outline. Understands indentation, Markdown bullets,
 * numbered lists, headings, and the ✦ / ~~strike~~ / > note markers this app exports.
 */
export function parseOutline(text: string): ForestNode[] {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const items: { depth: number; node: ForestNode }[] = [];
  let headingDepth = -1;
  for (const raw of rawLines) {
    if (!raw.trim() || /^\s*(---|\*\*\*|___)\s*$/.test(raw)) continue;
    const expanded = raw.replace(/\t/g, '    ');
    const indent = expanded.length - expanded.trimStart().length;
    let body = expanded.trim();
    // A quote line is part of the note on the idea above it.
    const quote = /^>\s?(.*)$/.exec(body);
    if (quote && items.length) {
      const last = items[items.length - 1].node;
      last.note = last.note === undefined ? quote[1] : last.note + '\n' + quote[1];
      continue;
    }
    if (quote) body = quote[1].trim();
    let depth: number;
    const heading = /^(#{1,6})\s+(.*)$/.exec(body);
    if (heading) {
      depth = heading[1].length - 1;
      headingDepth = depth;
      body = heading[2];
    } else {
      const bullet = /^([-*+•]|\d+[.)]|\[[ xX]\])\s+(.*)$/.exec(body);
      if (bullet) body = bullet[2].replace(/^\[[ xX]\]\s+/, '');
      depth = headingDepth + 1 + Math.floor(indent / 2);
    }
    let rating: Rating | undefined;
    const stars = /\s*(✦{1,3}|★{1,3})\s*$/.exec(body);
    if (stars) {
      rating = Math.min(3, stars[1].length) as Rating;
      body = body.slice(0, stars.index);
    }
    let cut = false;
    const strike = /^~~(.*)~~$/.exec(body.trim());
    if (strike) {
      cut = true;
      body = strike[1];
    }
    body = body.trim();
    if (!body) continue;
    items.push({ depth, node: { text: body, rating, cut: cut || undefined, children: [] } });
  }
  if (!items.length) return [];
  for (const { node } of items) if (node.note !== undefined) node.note = node.note.trim() || undefined;
  // Normalise so the shallowest line is depth 0.
  const min = Math.min(...items.map((i) => i.depth));
  const forest: ForestNode[] = [];
  const stack: { depth: number; node: ForestNode }[] = [];
  for (const it of items) {
    const d = it.depth - min;
    while (stack.length && stack[stack.length - 1].depth >= d) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(it.node);
    else forest.push(it.node);
    stack.push({ depth: d, node: it.node });
  }
  return forest;
}

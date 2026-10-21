import { ancestors, isAncestor } from '../model/tree';
import type { Id, MapDoc, MapKind } from '../model/types';
import { CONSTRAINTS, PERSONAS, WORDS } from './words';

export interface Spark {
  label: string;
  prompt: string;
  /** Set for collisions: the answer gets bridged to this idea. */
  linkTo?: Id;
}

interface Card {
  label: string;
  t: string;
  /** Restrict to map kinds. Omitted means every kind. */
  kinds?: MapKind[];
  /** 'root' cards only fire on a center, 'branch' cards only below it. */
  at?: 'root' | 'branch';
}

// Placeholders: {node} {parent} {root} {other} {word} {persona} {constraint}
const CARDS: Card[] = [
  // Lateral moves that work on anything
  { label: 'Opposite', t: 'What is the opposite of {node}?' },
  { label: 'Exaggerate', t: 'What if {node} were 100× bigger?' },
  { label: 'Shrink', t: 'What is the tiniest possible version of {node}?' },
  { label: 'Constraint', t: '{node}, but {constraint}.' },
  { label: 'Borrow', t: 'How would {persona} approach {node}?' },
  { label: 'Random word', t: 'Connect {node} to “{word}”.' },
  { label: 'Random word', t: '“{word}” is the answer. What was the question about {node}?' },
  { label: 'Collide', t: 'Combine {node} with {other}. What comes out?' },
  { label: 'Collide', t: 'What do {node} and {other} secretly have in common?' },
  { label: 'Remove', t: 'What could you delete from {node} and lose nothing?' },
  { label: 'Annoyance', t: 'What is annoying about {node}?' },
  { label: 'Hater', t: 'Who would hate {node}, and what would they say?' },
  { label: 'Why', t: 'Why does {node} matter? Then ask why again.' },
  { label: 'Before', t: 'What has to happen right before {node}?' },
  { label: 'After', t: 'What happens right after {node}?' },
  { label: 'Zoom in', t: 'Name one specific, concrete detail of {node}.' },
  { label: 'Zoom out', t: 'What bigger thing is {node} a part of?' },
  { label: 'Example', t: 'Give the weirdest real example of {node}.' },
  { label: 'Substitute', t: 'What could replace one part of {node}?' },
  { label: 'Adapt', t: 'What else already works like {node}? Steal from it.' },
  { label: 'Reverse', t: 'Flip the order, or swap who does what, in {node}.' },
  { label: 'Repurpose', t: 'Put {node} to a completely different use.' },
  { label: 'Provocation', t: 'Po: {node} is free. What changes?' },
  { label: 'Provocation', t: 'Po: {node} is illegal. What do people do instead?' },
  { label: 'Provocation', t: 'Po: {node} happens backwards.' },
  { label: 'Obvious', t: 'Write the most obvious idea about {node}. Get it out of the way.' },
  { label: 'Question', t: 'What question does {node} raise that nobody asks?' },
  { label: 'Failure', t: 'How could {node} fail spectacularly?' },
  { label: 'Sibling', t: 'What sits next to {node} that you have not written yet?', at: 'branch' },
  { label: 'Gap', t: 'What is missing between {parent} and {node}?', at: 'branch' },

  // Centers
  { label: 'Angle', t: 'Five different people care about {node}. Who is the first?', at: 'root' },
  { label: 'Category', t: 'What is a whole category of {node} you have not branched yet?', at: 'root' },

  // Long-form video
  { label: 'Hook', t: 'What happens in the first 5 seconds of {root}?', kinds: ['video'] },
  { label: 'Thumbnail', t: 'Describe the thumbnail for {node} in one image.', kinds: ['video', 'short'] },
  { label: 'Title', t: 'Title {node} in five words or fewer.', kinds: ['video', 'article'] },
  { label: 'Aha', t: 'Where is the “wait, what?” moment in {node}?', kinds: ['video', 'short'] },
  { label: 'Comments', t: 'What will viewers argue about in the comments on {node}?', kinds: ['video', 'short'] },
  { label: 'Transformation', t: 'What is the before → after in {node}?', kinds: ['video', 'short'] },
  { label: 'Story', t: 'Who wants what in {node}, and what is in the way?', kinds: ['video', 'article'] },
  { label: 'B-roll', t: 'What would you show on screen to prove {node}?', kinds: ['video'] },
  { label: 'Sequel', t: 'What is the follow-up video to {root}?', kinds: ['video', 'short'] },
  { label: 'Stakes', t: 'What does the viewer lose if they skip {node}?', kinds: ['video'] },

  // Short-form
  { label: 'First 2s', t: 'What is on screen in the first 1.5 seconds of {node}?', kinds: ['short'] },
  { label: 'Myth vs fact', t: 'What do people get wrong about {node}?', kinds: ['short', 'article', 'video'] },
  { label: 'POV', t: 'Write {node} as a “POV:” caption.', kinds: ['short'] },
  { label: 'Series', t: 'Turn {node} into a three-part series. What is part two?', kinds: ['short'] },
  { label: 'Loop', t: 'How could the ending of {node} lead straight back into the start?', kinds: ['short'] },
  { label: 'Ranking', t: 'Rank or tier-list something inside {node}.', kinds: ['short', 'video'] },
  { label: 'Contrarian', t: '“Stop doing X”: what is the contrarian take on {node}?', kinds: ['short', 'video', 'article'] },
  { label: 'Phone only', t: 'How would you film {node} with only your phone in ten minutes?', kinds: ['short'] },

  // Article
  { label: 'Thesis', t: 'State {root} as one arguable sentence.', kinds: ['article'] },
  { label: 'Steelman', t: 'What is the strongest argument against {node}?', kinds: ['article'] },
  { label: 'Anecdote', t: 'What happened to you that shows {node}?', kinds: ['article', 'video'] },
  { label: 'Evidence', t: 'What data or example would prove {node}?', kinds: ['article'] },
  { label: 'Beginner', t: 'What would a total beginner ask about {node}?', kinds: ['article', 'video'] },
  { label: 'Metaphor', t: 'What is a metaphor for {node}?', kinds: ['article', 'video'] },
  { label: 'Takeaway', t: 'What should the reader do after reading {node}?', kinds: ['article'] },
  { label: 'Surprise', t: 'What is surprising about {node}?', kinds: ['article', 'short'] },

  // Software
  { label: 'First user', t: 'Who exactly is the first user of {root}? Name them.', kinds: ['software'] },
  { label: 'Smallest', t: 'What is the smallest useful version of {node}?', kinds: ['software'] },
  { label: 'Dumb build', t: 'What is the dumbest way to build {node} this weekend?', kinds: ['software'] },
  { label: 'Prior art', t: 'What already does {node}, and why is it not enough?', kinds: ['software'] },
  { label: 'Scale', t: 'What breaks in {node} at 1000× the users?', kinds: ['software'] },
  { label: 'Data', t: 'What data does {node} need, and where does it live?', kinds: ['software'] },
  { label: 'Assumption', t: 'What is the riskiest assumption inside {node}?', kinds: ['software'] },
  { label: 'Cut scope', t: 'What could you cut from {node} and still ship?', kinds: ['software'] },
  { label: 'Delight', t: 'What tiny detail would make {node} delightful?', kinds: ['software'] },
  { label: 'Name', t: 'Give {root} a name. Then a worse one.', kinds: ['software'] },
  { label: 'Shortcut', t: 'What should the keyboard shortcut for {node} be?', kinds: ['software'] },

  // Starburst
  { label: 'Who', t: 'Who else is affected by {node}?', kinds: ['starburst'] },
  { label: 'When', t: 'When does {node} matter most? When not at all?', kinds: ['starburst'] },
  { label: 'Where', t: 'Where would {node} not work?', kinds: ['starburst'] },
  { label: 'How', t: 'How would you know {node} worked?', kinds: ['starburst'] },
];

function quote(s: string, max = 42): string {
  const t = s.replace(/\s+/g, ' ').trim() || 'this';
  return '“' + (t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t) + '”';
}

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

/** Draws prompts without repeats until the eligible deck is used up. */
export class SparkDeck {
  private seen = new Set<string>();

  next(doc: MapDoc, focus: Id): Spark {
    const n = doc.nodes[focus];
    const isRoot = !n.parent;
    const other = this.distantIdea(doc, focus);
    const eligible = CARDS.filter((c) => {
      if (c.kinds && !c.kinds.includes(doc.kind)) return false;
      if (c.at === 'root' && !isRoot) return false;
      if (c.at === 'branch' && isRoot) return false;
      if (c.t.includes('{other}') && !other) return false;
      if (c.t.includes('{parent}') && !n.parent) return false;
      return true;
    });
    let fresh = eligible.filter((c) => !this.seen.has(c.t));
    if (!fresh.length) {
      for (const c of eligible) this.seen.delete(c.t);
      fresh = eligible;
    }
    // Kind-specific cards are the point of a template, so they come up more often.
    const weighted = fresh.flatMap((c) => (c.kinds ? [c, c, c] : [c]));
    const card = pick(weighted);
    this.seen.add(card.t);

    const rootId = isRoot ? focus : ancestors(doc.nodes, focus).pop()!;
    const prompt = card.t
      .replaceAll('{node}', quote(n.text))
      .replaceAll('{parent}', quote(n.parent ? doc.nodes[n.parent].text : ''))
      .replaceAll('{root}', quote(doc.nodes[rootId].text))
      .replaceAll('{other}', other ? quote(doc.nodes[other].text) : '')
      .replace('{word}', pick(WORDS))
      .replace('{persona}', pick(PERSONAS))
      .replace('{constraint}', pick(CONSTRAINTS));
    return {
      label: card.label,
      prompt: prompt.charAt(0).toUpperCase() + prompt.slice(1),
      linkTo: card.t.includes('{other}') ? other ?? undefined : undefined,
    };
  }

  /** An idea far from the focus in the tree: not an ancestor, descendant or sibling. */
  private distantIdea(doc: MapDoc, focus: Id): Id | null {
    const n = doc.nodes[focus];
    const candidates = Object.values(doc.nodes).filter(
      (o) =>
        o.id !== focus &&
        o.parent !== null &&
        o.parent !== n.parent &&
        !o.cut &&
        o.text.trim().length > 1 &&
        !isAncestor(doc.nodes, o.id, focus) &&
        !isAncestor(doc.nodes, focus, o.id),
    );
    return candidates.length ? pick(candidates).id : null;
  }
}

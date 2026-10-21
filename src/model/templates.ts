import { addChild, addRoot, emptyDoc, patchNode, toggleLink } from './ops';
import type { Id, MapDoc, MapKind, Rating } from './types';

export interface Template {
  kind: MapKind;
  label: string;
  blurb: string;
  placeholder: string;
  seeds: string[];
}

export const TEMPLATES: Template[] = [
  {
    kind: 'brainstorm',
    label: 'Brainstorm',
    blurb: 'One idea in the middle. Branch out freely.',
    placeholder: 'What are we thinking about?',
    seeds: [],
  },
  {
    kind: 'video',
    label: 'Video',
    blurb: 'Long-form video: hooks, angles, beats, packaging.',
    placeholder: 'What is the video about?',
    seeds: ['Hooks', 'Angles', 'Story beats', 'Visuals', 'Titles', 'Thumbnails'],
  },
  {
    kind: 'short',
    label: 'Short',
    blurb: 'Short-form: first 2 seconds, format, payoff, series.',
    placeholder: 'What is the short about?',
    seeds: ['First 2 seconds', 'Formats', 'Payoff', 'On-screen text', 'Series ideas'],
  },
  {
    kind: 'article',
    label: 'Article',
    blurb: 'Thesis, reader, arguments, stories, headlines.',
    placeholder: 'What do you want to write about?',
    seeds: ['Thesis', 'Reader', 'Questions it answers', 'Counterpoints', 'Stories & examples', 'Headlines'],
  },
  {
    kind: 'software',
    label: 'Software',
    blurb: 'Problem, users, features, risks, names.',
    placeholder: 'What do you want to build?',
    seeds: ['Problem', 'Users', 'Core features', 'Later, maybe', 'Stack', 'Risks', 'Names'],
  },
  {
    kind: 'starburst',
    label: 'Starburst',
    blurb: 'Interrogate an idea with who, what, when, where, why, how.',
    placeholder: 'What idea needs questioning?',
    seeds: ['Who?', 'What?', 'When?', 'Where?', 'Why?', 'How?'],
  },
  {
    kind: 'scamper',
    label: 'SCAMPER',
    blurb: 'Twist an existing thing seven ways.',
    placeholder: 'What existing thing are you reworking?',
    seeds: ['Substitute', 'Combine', 'Adapt', 'Modify', 'Put to other uses', 'Eliminate', 'Reverse'],
  },
];

export function templateFor(kind: MapKind): Template {
  return TEMPLATES.find((t) => t.kind === kind) ?? TEMPLATES[0];
}

export function createFromTemplate(kind: MapKind, centerText: string): { doc: MapDoc; root: Id; first: Id | null } {
  const t = templateFor(kind);
  let doc = emptyDoc(kind);
  const r = addRoot(doc, centerText.trim() || t.label);
  doc = r.doc;
  let first: Id | null = null;
  for (const s of t.seeds) {
    const c = addChild(doc, r.id, s);
    doc = c.doc;
    first ??= c.id;
  }
  return { doc, root: r.id, first };
}

type Seed = [text: string, opts?: { rating?: Rating; cut?: boolean; kids?: Seed[]; key?: string }];

/** The first-run example, built from the information-management brief. */
export function exampleMap(): MapDoc {
  let doc = emptyDoc('brainstorm');
  const keys = new Map<string, Id>();
  const grow = (parent: Id, seeds: Seed[]) => {
    for (const [text, o] of seeds) {
      const r = addChild(doc, parent, text);
      doc = r.doc;
      if (o?.rating || o?.cut) doc = patchNode(doc, r.id, { rating: o.rating, cut: o.cut });
      if (o?.key) keys.set(o.key, r.id);
      if (o?.kids) grow(r.id, o.kids);
    }
  };

  const info = addRoot(doc, 'Information storage');
  doc = info.doc;
  grow(info.id, [
    [
      'Short-term',
      {
        kids: [
          ['Reminders', { rating: 2 }],
          ['Tasks', { kids: [['Today list'], ['Someday pile', { cut: true }]] }],
          ['Temporary notes'],
          ['Inbox for quick capture', { rating: 3 }],
        ],
      },
    ],
    [
      'Long-term',
      {
        kids: [
          ['Admin documents', { rating: 3, key: 'admin', kids: [['Scanned IDs'], ['Contracts'], ['Tax records']] }],
          ['Reference notes'],
          ['Decision log', { rating: 1 }],
        ],
      },
    ],
    ['Retrieval', { kids: [['Search everything'], ['Tags vs folders?'], ['Weekly review', { rating: 2 }]] }],
  ]);

  const sec = addRoot(doc, 'Security');
  doc = sec.doc;
  grow(sec.id, [
    ['Passwords', { kids: [['Password manager', { rating: 3 }], ['Memorised master phrase']] }],
    ['Backups', { kids: [['Offline drive'], ['Encrypted cloud', { key: 'cloud', rating: 2 }]] }],
    ['Two-factor', { kids: [['Hardware key'], ['SMS codes', { cut: true }]] }],
  ]);

  const a = keys.get('admin');
  const b = keys.get('cloud');
  if (a && b) doc = toggleLink(doc, a, b).doc;
  return doc;
}

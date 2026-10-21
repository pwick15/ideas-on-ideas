export type Id = string;

/** Which side of the center a first-level branch grows on in the balanced layout. */
export type Side = 1 | -1;

export type LayoutKind = 'balanced' | 'right' | 'down' | 'radial';

export type MapKind =
  | 'brainstorm'
  | 'video'
  | 'short'
  | 'article'
  | 'software'
  | 'starburst'
  | 'scamper';

export type Rating = 1 | 2 | 3;

export interface IdeaNode {
  id: Id;
  text: string;
  parent: Id | null;
  children: Id[];
  side?: Side;
  /** Explicit branch hue in degrees. Children inherit the nearest ancestor's hue. */
  hue?: number;
  rating?: Rating;
  cut?: boolean;
  collapsed?: boolean;
  /** The spark prompt this idea answered, kept as context. */
  spark?: string;
  created: number;
}

/** A bridge between two ideas anywhere on the map, outside the tree structure. */
export interface Link {
  id: Id;
  a: Id;
  b: Id;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface MapDoc {
  v: 1;
  id: Id;
  kind: MapKind;
  nodes: Record<Id, IdeaNode>;
  roots: Id[];
  links: Link[];
  layout: LayoutKind;
  created: number;
  updated: number;
  view?: { focus?: Id | null; cam?: Camera };
}

export interface MapMeta {
  id: Id;
  title: string;
  kind: MapKind;
  count: number;
  created: number;
  updated: number;
}

export type ThemePref = 'system' | 'dark' | 'light';

export interface Settings {
  theme: ThemePref;
  follow: boolean;
  hints: boolean;
  sprintMinutes: number;
  lastMap?: Id;
  welcomed?: boolean;
}

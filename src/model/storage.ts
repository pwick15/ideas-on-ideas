import { countIdeas } from './tree';
import type { Id, MapDoc, MapMeta, Settings } from './types';

const PREFIX = 'ioi:v1:';
const INDEX_KEY = PREFIX + 'index';
const SETTINGS_KEY = PREFIX + 'settings';
const mapKey = (id: Id) => PREFIX + 'map:' + id;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  follow: false,
  hints: true,
  sprintMinutes: 5,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refused the write (quota or private mode). */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function titleOf(doc: MapDoc): string {
  const first = doc.roots[0];
  const t = first ? doc.nodes[first]?.text.trim() : '';
  return t || 'Untitled map';
}

export function metaOf(doc: MapDoc): MapMeta {
  return {
    id: doc.id,
    title: titleOf(doc),
    kind: doc.kind,
    count: countIdeas(doc),
    created: doc.created,
    updated: doc.updated,
  };
}

export function loadIndex(): MapMeta[] {
  return read<MapMeta[]>(INDEX_KEY) ?? [];
}

export function loadMap(id: Id): MapDoc | null {
  const doc = read<MapDoc>(mapKey(id));
  if (!doc || doc.v !== 1 || !doc.nodes || !doc.roots) return null;
  doc.links ??= [];
  doc.layout ??= 'balanced';
  return doc;
}

export function saveMap(doc: MapDoc): boolean {
  const ok = write(mapKey(doc.id), doc);
  const index = loadIndex().filter((m) => m.id !== doc.id);
  index.unshift(metaOf(doc));
  index.sort((a, b) => b.updated - a.updated);
  return write(INDEX_KEY, index) && ok;
}

export function deleteMap(id: Id) {
  try {
    localStorage.removeItem(mapKey(id));
  } catch {
    /* ignore */
  }
  write(
    INDEX_KEY,
    loadIndex().filter((m) => m.id !== id),
  );
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}

export function isMapKey(key: string | null, id: Id) {
  return key === mapKey(id);
}

export interface Backup {
  app: 'ideas-on-ideas';
  v: 1;
  exported: number;
  maps: MapDoc[];
}

export function exportAll(): Backup {
  const maps = loadIndex()
    .map((m) => loadMap(m.id))
    .filter((d): d is MapDoc => !!d);
  return { app: 'ideas-on-ideas', v: 1, exported: Date.now(), maps };
}

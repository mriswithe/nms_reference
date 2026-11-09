import { totalCount, type Db } from './db';

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');

interface Entry {
  id: string;
  n: string;
  ab: string;
  g: string;
}

/** lower is better; -1 means no match */
export function score(e: Entry, q: string): number {
  if (e.n === q || e.ab === q) return 0;
  if (e.n.startsWith(q)) return 1;
  if (e.n.split(' ').some((w) => w.startsWith(q))) return 2;
  if (e.n.includes(q)) return 3;
  const ws = q.split(' ').filter(Boolean);
  if (ws.length > 1 && ws.every((w) => e.n.includes(w))) return 4;
  if (e.g.includes(q)) return 6;
  return -1;
}

export function createSearch(db: Db) {
  const index: Entry[] = db.ids.map((id) => ({
    id,
    n: norm(db.items[id].n),
    ab: (db.items[id].ab || '').toLowerCase(),
    g: norm(db.items[id].g),
  }));
  // items with no way to obtain them sink below ones that have recipes/sources
  const obtainable = new Map(db.ids.map((id) => [id, totalCount(db.counts(id)) > 0]));

  return function search(query: string, limit = 40): string[] {
    const q = norm(query).trim();
    if (!q) return [];
    return index
      .map((e) => [e, score(e, q)] as const)
      .filter(([, s]) => s >= 0)
      .sort(
        ([a, sa], [b, sb]) =>
          sa - sb ||
          Number(!obtainable.get(a.id)) - Number(!obtainable.get(b.id)) ||
          a.n.length - b.n.length,
      )
      .slice(0, limit)
      .map(([e]) => e.id);
  };
}

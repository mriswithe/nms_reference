import type { Dataset, Item, Recipe } from './types';

export interface Links {
  ref: Recipe[];
  cook: Recipe[];
  /** ids of items whose crafting recipe uses this item (only populated in `uses`) */
  craft: string[];
}

export interface Counts {
  ref: number;
  craft: number;
  cook: number;
  mine: number;
  buy: number;
}

export interface Db {
  data: Dataset;
  items: Record<string, Item>;
  ids: string[];
  /** id -> recipes that produce it */
  makes: Record<string, Links>;
  /** id -> recipes that consume it */
  uses: Record<string, Links>;
  counts(id: string): Counts;
  /** first item with this exact name that has any recipe or gathering info */
  byName(name: string): string | undefined;
  /** raw material (id prefix "raw") with this exact name */
  rawByName(name: string): string | undefined;
}

const empty = (): Links => ({ ref: [], cook: [], craft: [] });

export function createDb(data: Dataset): Db {
  const items = data.items;
  const ids = Object.keys(items);
  const makes: Record<string, Links> = {};
  const uses: Record<string, Links> = {};
  const ens = (o: Record<string, Links>, k: string) => (o[k] ??= empty());

  for (const kind of ['ref', 'cook'] as const) {
    for (const r of data[kind]) {
      ens(makes, r[1][0])[kind].push(r);
      for (const [i] of r[0]) {
        const u = ens(uses, i)[kind];
        if (!u.includes(r)) u.push(r);
      }
    }
  }
  for (const id of ids) {
    for (const [i] of items[id].rq ?? []) ens(uses, i).craft.push(id);
  }

  const counts = (id: string): Counts => {
    const m = makes[id] ?? empty();
    const it = items[id];
    return {
      ref: m.ref.length,
      craft: it.rq ? 1 : 0,
      cook: m.cook.length,
      mine: (it.ob ?? []).length,
      buy: (it.buy ?? []).length,
    };
  };

  return {
    data,
    items,
    ids,
    makes,
    uses,
    counts,
    byName: (n) => ids.find((id) => items[id].n === n && (items[id].rq || makes[id] || items[id].ob)),
    rawByName: (n) => ids.find((id) => items[id].n === n && id.startsWith('raw')),
  };
}

export const totalCount = (c: Counts) => c.ref + c.craft + c.cook + c.mine + c.buy;

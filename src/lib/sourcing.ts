/**
 * Ingredients you can't produce yourself, on two independent axes:
 *  - animal-only: the only source is killing or harvesting a creature (or fishing)
 *  - wild-only:   the only source is harvesting a plant on a planet that can't be farmed (e.g. Fireberry)
 *
 * An item escapes an axis if it has any other source (mining, farming, buying…) or a refiner / Nutrient Processor
 * recipe makes it entirely from inputs that escape that axis. Computed as a least fixpoint, so cycles of recipes
 * only count when something outside the cycle grounds them.
 */
import type { Db } from './db';
import type { RecipeGroup } from './group';
import type { Qty } from './types';

const ANIMAL_SOURCE = /harvested from creatures|caught by fishing|dropped by creatures/i;
const ANIMAL_GROUP = new Set(['Horrific Sample', 'Monstrosity', 'Intestinal Fragment', 'Vile Larva']);
const ANIMAL_CATEGORY = /^any .*seafood$/i;

const WILD_SOURCE = /not farmable/i;
/** raw ingredients with no gathering notes say where they come from in the description */
const WILD_DESC = /harvested from (planetary flora|the \S+ plant)/i;

/** classification of an item with respect to one axis, before recipes are considered */
type Base = 'restricted' | 'free' | 'unknown';

function animalBase(db: Db, id: string): Base {
  const it = db.items[id];
  if (ANIMAL_GROUP.has(it.g) || ANIMAL_CATEGORY.test(it.n)) return 'restricted';
  const ob = it.ob ?? [];
  if (ob.some((s) => !ANIMAL_SOURCE.test(s)) || (it.buy ?? []).length) return 'free';
  return ob.length ? 'restricted' : 'unknown';
}

function wildBase(db: Db, id: string): Base {
  const it = db.items[id];
  const ob = it.ob ?? [];
  if (ob.some((s) => !WILD_SOURCE.test(s)) || (it.buy ?? []).length) return 'free';
  if (ob.length) return 'restricted';
  return WILD_DESC.test(it.d) ? 'restricted' : 'unknown';
}

/** items whose every route needs a restricted base ingredient; unknown items with no recipe count as free */
function restricted(db: Db, base: (db: Db, id: string) => Base): Set<string> {
  const recipes = [...db.data.cook, ...db.data.ref];
  const ids = new Set<string>();
  for (const r of recipes) for (const [i] of [...r[0], r[1]]) ids.add(i);

  const free = new Set<string>();
  for (const i of ids) {
    const b = base(db, i);
    const m = db.makes[i];
    if (b === 'free' || (b === 'unknown' && !m?.ref.length && !m?.cook.length)) free.add(i);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [ins, [out]] of recipes) {
      if (free.has(out) || !ins.every(([i]) => free.has(i))) continue;
      free.add(out);
      changed = true;
    }
  }
  return new Set([...ids].filter((i) => !free.has(i)));
}

export interface Sourcing {
  /** only obtainable from creatures */
  animal: Set<string>;
  /** only obtainable by harvesting wild, unfarmable plants */
  wild: Set<string>;
}

export const sourcing = (db: Db): Sourcing => ({ animal: restricted(db, animalBase), wild: restricted(db, wildBase) });
export const animalOnly = (db: Db) => restricted(db, animalBase);
export const wildOnly = (db: Db) => restricted(db, wildBase);

/** how many restricted ingredients one choice needs */
export interface Cost {
  animal: number;
  wild: number;
}

const ZERO: Cost = { animal: 0, wild: 0 };
const add = (a: Cost, b: Cost): Cost => ({ animal: a.animal + b.animal, wild: a.wild + b.wild });
/** fewer restricted ingredients overall first; on a tie, fewer animal parts */
export const cmpCost = (a: Cost, b: Cost) => a.animal + a.wild - (b.animal + b.wild) || a.animal - b.animal;
const itemCost = (s: Sourcing, [i]: Qty): Cost => ({ animal: s.animal.has(i) ? 1 : 0, wild: s.wild.has(i) ? 1 : 0 });

/** the cheapest recipe a grouped row allows, picking the best option in each slot */
export function rowCost(g: RecipeGroup, s: Sourcing): Cost {
  if (g.pool) {
    const { opts, doubles } = g.pool;
    const costs = opts.map((o) => itemCost(s, o));
    let best: Cost | null = null;
    for (let i = 0; i < opts.length; i++) {
      // pairs of different options always exist; the same option twice only when listed in doubles
      for (let j = doubles.includes(opts[i]) ? i : i + 1; j < opts.length; j++) {
        const c = add(costs[i], costs[j]);
        if (!best || cmpCost(c, best) < 0) best = c;
      }
    }
    return best ?? ZERO;
  }
  return g.slots.reduce((acc, sl) => add(acc, sl.opts.map((o) => itemCost(s, o)).sort(cmpCost)[0]), ZERO);
}

const width = (g: RecipeGroup) => (g.pool ? 2 : g.slots.length);

/**
 * Rows ordered by fewest restricted ingredients (animal-only + wild-only, ties to fewer animal parts), then fewest
 * inputs, then most recipes covered; each slot's options are listed cheapest first. Returns new objects.
 */
export function rankRows(groups: RecipeGroup[], s: Sourcing): RecipeGroup[] {
  const order = (opts: Qty[]) => [...opts].sort((a, b) => cmpCost(itemCost(s, a), itemCost(s, b)));
  return groups
    .map((g) => ({
      ...g,
      slots: g.slots.map((sl) => ({ ...sl, opts: order(sl.opts) })),
      pool: g.pool && { ...g.pool, opts: order(g.pool.opts) },
    }))
    .map((g) => ({ g, c: rowCost(g, s) }))
    .sort((a, b) => cmpCost(a.c, b.c) || width(a.g) - width(b.g) || b.g.recipes.length - a.g.recipes.length)
    .map(({ g }) => g);
}

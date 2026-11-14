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
import { recipeKey, type RecipeGroup } from './group';
import type { Qty, Recipe } from './types';

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

/** gathered, farmed or bought directly without creatures or wild-only plants (0 processing steps) */
function direct(db: Db, id: string): boolean {
  const it = db.items[id];
  const ob = it.ob ?? [];
  if (ob.some((s) => !ANIMAL_SOURCE.test(s) && !WILD_SOURCE.test(s)) || (it.buy ?? []).length) return true;
  const m = db.makes[id];
  return animalBase(db, id) === 'unknown' && wildBase(db, id) === 'unknown' && !m?.ref.length && !m?.cook.length;
}

/**
 * Fewest refiner / Nutrient Processor operations to make each item from directly obtainable ones, counting every
 * operation in the tree (A + B costs 1 + steps(A) + steps(B)). Items with no such route are absent.
 */
function processingSteps(db: Db): Map<string, number> {
  const recipes = [...db.data.cook, ...db.data.ref];
  const steps = new Map<string, number>();
  for (const r of recipes) for (const [i] of [...r[0], r[1]]) if (direct(db, i)) steps.set(i, 0);
  // relax until stable; every recipe adds at least 1, so this terminates
  let changed = true;
  while (changed) {
    changed = false;
    for (const [ins, [out]] of recipes) {
      let n = 1;
      for (const [i] of ins) n += steps.get(i) ?? Infinity;
      if (n < (steps.get(out) ?? Infinity)) {
        steps.set(out, n);
        changed = true;
      }
    }
  }
  return steps;
}

export interface Sourcing {
  /** only obtainable from creatures */
  animal: Set<string>;
  /** only obtainable by harvesting wild, unfarmable plants */
  wild: Set<string>;
  /** fewest processing steps from directly obtainable items, avoiding both; absent when there is no such route */
  steps: Map<string, number>;
}

export const sourcing = (db: Db): Sourcing => ({
  animal: restricted(db, animalBase),
  wild: restricted(db, wildBase),
  steps: processingSteps(db),
});
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
  const steps = (q: Qty) => s.steps.get(q[0]) ?? Number.MAX_SAFE_INTEGER;
  // least restricted first; within a tier, fewest processing steps (stable for ties)
  const order = (opts: Qty[]) => [...opts].sort((a, b) => cmpCost(itemCost(s, a), itemCost(s, b)) || steps(a) - steps(b));
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

/** the inputs of `ins` with the `k`th removed, in canonical form */
const without = (ins: Qty[], k: number) => recipeKey(ins.filter((_, i) => i !== k));

/** ingredients that other recipes for the same output use in place of `id` */
function peers(db: Db, r: Recipe, id: string): string[] {
  const k = r[0].findIndex(([i]) => i === id);
  if (k < 0) return [];
  const rest = without(r[0], k);
  const out: string[] = [];
  for (const r2 of db.makes[r[1][0]]?.cook ?? []) {
    if (r2 === r || r2[2] !== r[2] || r2[3] !== r[3] || r2[0].length !== r[0].length) continue;
    r2[0].forEach(([i], j) => {
      if (i !== id && without(r2[0], j) === rest) out.push(i);
    });
  }
  return out;
}

/**
 * Order for an item's "Used in" Nutrient Processor rows (groups pinned on `id`), each tier keeping `rankRows` order:
 *  0. the item can't be replaced: no other ingredient makes the same output with the same partners
 *  1. the item is one of several interchangeable ingredients, fewest alternatives first
 *  2. Creature Pellets (bait accepts almost anything)
 */
export function rankUses(db: Db, groups: RecipeGroup[], id: string): RecipeGroup[] {
  const rank = (g: RecipeGroup): [number, number] => {
    if (db.items[g.out[0]]?.n === 'Creature Pellets') return [2, 0];
    const each = g.recipes.map((r) => peers(db, r, id));
    return each.every((p) => p.length) ? [1, new Set(each.flat()).size] : [0, 0];
  };
  return groups
    .map((g) => ({ g, r: rank(g) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1])
    .map(({ g }) => g);
}

export type Tier = 'free' | 'wild' | 'animal' | 'both';

export const TIER_LABEL: Record<Tier, string> = {
  free: 'Makeable ↑ steps',
  wild: '🌿 Wild plants only',
  animal: '🐾 Creatures only',
  both: '🐾🌿 Creatures and wild plants',
};

const TIER_ORDER: Tier[] = ['free', 'wild', 'animal', 'both'];

export function tierOf(s: Sourcing, id: string): Tier {
  const a = s.animal.has(id);
  const w = s.wild.has(id);
  return a && w ? 'both' : a ? 'animal' : w ? 'wild' : 'free';
}

/** options split into non-empty tiers, least restricted first, keeping each tier's existing order */
export function byTier(opts: Qty[], s: Sourcing): [Tier, Qty[]][] {
  const out = new Map<Tier, Qty[]>();
  for (const o of opts) {
    const t = tierOf(s, o[0]);
    (out.get(t) ?? out.set(t, []).get(t)!).push(o);
  }
  return TIER_ORDER.filter((t) => out.has(t)).map((t) => [t, out.get(t)!]);
}

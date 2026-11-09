/**
 * Condenses recipe lists. Recipes with the same output, operation and time that differ in only one input
 * are merged into one row whose differing input becomes a slot of alternatives ("one of …").
 *
 * Merging two groups that are identical except for one slot is exact: the cartesian product of the merged
 * group is precisely the union of the two originals, so a grouped row never implies a recipe that doesn't exist.
 */
import type { Qty, Recipe } from './types';

export interface Slot {
  /** alternatives for this input; any one of them works */
  opts: Qty[];
  /** pinned slots (the item being viewed) are never merged with other inputs */
  pinned: boolean;
}

/** "any 2 different of `opts`": every distinct pair exists; `doubles` lists which same-twice pairs also exist */
export interface Pool {
  opts: Qty[];
  doubles: Qty[];
}

export interface RecipeGroup {
  /** empty when `pool` is set */
  slots: Slot[];
  pool?: Pool;
  out: Qty;
  time: number;
  op: string;
  /** the original recipes this row stands for */
  recipes: Recipe[];
}

const tok = ([id, q]: Qty) => `${id}:${q}`;
const slotKey = (s: Slot) => (s.pinned ? '!' : '') + s.opts.map(tok).sort().join('|');

/** canonical (order-independent) form of a recipe's inputs */
export const recipeKey = (ins: Qty[]) => ins.map(tok).sort().join('+');

/** every concrete input combination a group stands for, as canonical keys */
export function expand(g: RecipeGroup): Set<string> {
  if (g.pool) {
    const { opts, doubles } = g.pool;
    const pairs = opts.flatMap((a, i) => opts.slice(i + 1).map((b) => recipeKey([a, b])));
    return new Set([...pairs, ...doubles.map((d) => recipeKey([d, d]))]);
  }
  let combos: Qty[][] = [[]];
  for (const s of g.slots) combos = combos.flatMap((c) => s.opts.map((o) => [...c, o]));
  return new Set(combos.map(recipeKey));
}

/** sorted-key multiset equality of two slot lists */
function sameSlots(a: Slot[], b: Slot[]) {
  if (a.length !== b.length) return false;
  const ka = a.map(slotKey).sort();
  const kb = b.map(slotKey).sort();
  return ka.every((k, i) => k === kb[i]);
}

/** try to merge b into a; returns the merged slot list or null */
function merge(a: Slot[], b: Slot[]): Slot[] | null {
  if (sameSlots(a, b)) return a;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pinned) continue;
    const restA = a.filter((_, k) => k !== i);
    for (let j = 0; j < b.length; j++) {
      if (b[j].pinned) continue;
      if (!sameSlots(restA, b.filter((_, k) => k !== j))) continue;
      const seen = new Set(a[i].opts.map(tok));
      const opts = [...a[i].opts, ...b[j].opts.filter((o) => !seen.has(tok(o)))];
      return a.map((s, k) => (k === i ? { opts, pinned: false } : s));
    }
  }
  return null;
}

/** smallest ingredient count worth calling a pool; below this the one-of rows already read fine */
const MIN_POOL = 4;

/**
 * A 2-input bucket where every distinct pair of its ingredients is a recipe reads best as one "any 2 of" row.
 * Only the whole bucket qualifies, so the row is always exact.
 */
function asPool(list: RecipeGroup[]): RecipeGroup | null {
  if (list.length < 2 || list[0].slots.length !== 2) return null;
  const recipes = list.flatMap((g) => g.recipes);
  const opts = new Map<string, Qty>();
  for (const r of recipes) for (const q of r[0]) opts.set(tok(q), q);
  if (opts.size < MIN_POOL) return null;
  const have = new Set(recipes.map((r) => recipeKey(r[0])));
  const all = [...opts.values()];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (!have.has(recipeKey([all[i], all[j]]))) return null;
  const doubles = all.filter((q) => have.has(recipeKey([q, q])));
  const { out, time, op } = list[0];
  return { slots: [], pool: { opts: all, doubles }, out, time, op, recipes };
}

/**
 * Group recipes. With `pin`, the pinned item stays a fixed input of its own (used for "Used in" lists,
 * where the viewed item is the constant and its partners vary).
 */
export function groupRecipes(recipes: Recipe[], pin?: string): RecipeGroup[] {
  const buckets = new Map<string, RecipeGroup[]>();
  for (const r of recipes) {
    const [ins, out, time, op] = r;
    const pi = pin ? ins.findIndex(([i]) => i === pin) : -1;
    const slots: Slot[] = ins.map((q, k) => ({ opts: [q], pinned: k === pi }));
    if (pi > 0) slots.unshift(...slots.splice(pi, 1));
    const key = `${tok(out)}|${time}|${op}|${ins.length}`;
    const list = buckets.get(key) ?? buckets.set(key, []).get(key)!;
    list.push({ slots, out, time, op, recipes: [r] });
  }

  const result: RecipeGroup[] = [];
  for (const list of buckets.values()) {
    const pool = pin ? null : asPool(list);
    if (pool) {
      result.push(pool);
      continue;
    }
    // merge until nothing changes; prefer merging the largest groups first so big "one of" slots form
    let changed = true;
    while (changed) {
      changed = false;
      list.sort((x, y) => y.recipes.length - x.recipes.length);
      outer: for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const m = merge(list[a].slots, list[b].slots);
          if (!m) continue;
          list[a] = { ...list[a], slots: m, recipes: [...list[a].recipes, ...list[b].recipes] };
          list.splice(b, 1);
          changed = true;
          break outer;
        }
      }
    }
    for (const g of list) {
      // fixed inputs first, then alternatives by size; alternatives alphabetical-stable by original order
      g.slots.sort((x, y) => Number(y.pinned) - Number(x.pinned) || x.opts.length - y.opts.length);
      result.push(g);
    }
  }
  return result;
}

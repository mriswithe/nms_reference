/**
 * Cost model: everything is measured in the in-game base value of the raw inputs.
 * Used to decide whether refining something beats crafting it.
 */
import type { Db } from './db';
import type { Qty, Recipe } from './types';

export interface RefineOption {
  cost: number;
  r: Recipe;
}

export interface Cheaper {
  /** percent saved by refining instead of crafting */
  pct: number;
  r: Recipe;
  craft: number;
  refine: number;
}

/** max recursion depth for crafting trees */
export const MAX_DEPTH = 6;

export class CostModel {
  private cc = new Map<string, number>();
  private rc = new Map<string, RefineOption | null>();

  constructor(private db: Db) {}

  raw(id: string): number {
    return this.db.items[id].v || 0;
  }

  /** cost to craft one, choosing the cheaper of craft/refine for each part */
  craft(id: string, seen = new Set<string>()): number {
    const hit = this.cc.get(id);
    if (hit !== undefined) return hit;
    const it = this.db.items[id];
    if (!it.rq || seen.has(id)) return this.raw(id);
    seen.add(id);
    const v = it.rq.reduce((s, [c, q]) => s + q * this.best(c, seen), 0) / (it.q || 1);
    seen.delete(id);
    this.cc.set(id, v);
    return v;
  }

  /** cost of one unit of a refiner recipe's output, given its inputs */
  recipeCost(r: Recipe): number {
    const items = this.db.items;
    return r[0].reduce((s, [a, q]) => s + q * (items[a].rq ? this.craft(a) : this.raw(a)), 0) / r[1][1];
  }

  /** cheapest refiner recipe for an item, ignoring recipes that consume the item itself */
  refineBest(id: string): RefineOption | null {
    if (this.rc.has(id)) return this.rc.get(id)!;
    let best: RefineOption | null = null;
    for (const r of this.db.makes[id]?.ref ?? []) {
      if (r[0].some(([a]) => a === id)) continue;
      const cost = this.recipeCost(r);
      if (!best || cost < best.cost) best = { cost, r };
    }
    this.rc.set(id, best);
    return best;
  }

  best(id: string, seen?: Set<string>): number {
    if (!this.db.items[id].rq) return this.raw(id);
    const c = this.craft(id, seen);
    const r = this.refineBest(id);
    return r && r.cost < c ? r.cost : c;
  }

  /** non-null when a craftable item is meaningfully (>0.5%) cheaper to refine */
  cheaper(id: string): Cheaper | null {
    if (!this.db.items[id].rq) return null;
    const r = this.refineBest(id);
    if (!r) return null;
    const c = this.craft(id);
    return r.cost < c * 0.995 ? { pct: Math.round((1 - r.cost / c) * 100), r: r.r, craft: c, refine: r.cost } : null;
  }

  /** true when some part below the top of the tree is cheaper to refine */
  hasCheaperPart(id: string, depth = 0, seen = new Set<string>()): boolean {
    if (depth > MAX_DEPTH || seen.has(id)) return false;
    const s2 = new Set(seen).add(id);
    if (depth > 0 && this.cheaper(id)) return true;
    return (this.db.items[id].rq ?? []).some(([c]) => this.hasCheaperPart(c, depth + 1, s2));
  }

  /**
   * Base ingredients needed to make one of `id`, sorted by quantity.
   * With `smart`, sub-parts that are cheaper to refine expand into their refiner inputs.
   */
  totals(id: string, smart: boolean): Qty[] {
    const items = this.db.items;
    const acc: Record<string, number> = {};
    const walk = (id: string, mult: number, depth: number, seen: Set<string>) => {
      const it = items[id];
      const ch = smart && depth > 0 ? this.cheaper(id) : null;
      if ((!it.rq && !ch) || depth > MAX_DEPTH || seen.has(id)) {
        acc[id] = (acc[id] || 0) + mult;
        return;
      }
      const s2 = new Set(seen).add(id);
      if (ch) {
        const runs = Math.ceil(mult / ch.r[1][1]);
        ch.r[0].forEach(([c, q]) => walk(c, q * runs, depth + 1, s2));
        return;
      }
      const runs = Math.ceil(mult / (it.q || 1));
      it.rq!.forEach(([c, q]) => walk(c, q * runs, depth + 1, s2));
    };
    walk(id, 1, 0, new Set());
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }

  totalValue(list: Qty[]): number {
    return list.reduce((s, [i, q]) => s + q * this.raw(i), 0);
  }
}

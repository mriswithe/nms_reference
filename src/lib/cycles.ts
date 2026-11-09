/**
 * Refiner conversion families: groups of raw materials that refine into one another
 * (a loop) or down a one-way chain.
 */
import type { Db } from './db';
import type { Recipe } from './types';

export interface FamilyDef {
  key: string;
  title: string;
  blurb: string;
  members: string[];
}

export const FAMILY_DEFS: FamilyDef[] = [
  {
    key: 'gas',
    title: 'Atmospheric gases',
    blurb: 'Gas Transfer in any refiner. Each step moves one place clockwise.',
    members: ['Sulphurine', 'Radon', 'Nitrogen'],
  },
  {
    key: 'biome',
    title: 'Biome minerals',
    blurb: 'Environmental Element Transfer. Each needs Ferrite Dust or Pure Ferrite as the second input.',
    members: ['Uranium', 'Pyrite', 'Paraffinium', 'Ammonia', 'Dioxite', 'Phosphorus'],
  },
  {
    key: 'junk',
    title: 'Machinery junk',
    blurb: 'Recycle Waste Materials. A one-way chain, not a loop.',
    members: ['Residual Goop', 'Viscous Fluids', 'Living Slime', 'Runaway Mould'],
  },
];

/** raw materials that only have one-way upgrade recipes */
export const ONE_WAY_NAMES = ['Platinum', 'Basalt', 'Lithium', 'Crystallised Helium', 'Methane', 'Deuterium'];

export interface Edge {
  to: string;
  recipes: Recipe[];
}

export interface Family extends FamilyDef {
  ids: string[];
  /** from -> next member */
  edges: Record<string, Edge>;
  /** members in conversion order */
  order: string[];
  loop: boolean;
  /** recipes that make a member purely from non-member raw materials */
  side: Recipe[];
}

export function buildFamily(db: Db, def: FamilyDef): Family {
  const ids = def.members.map(db.rawByName).filter((x): x is string => !!x);
  const set = new Set(ids);
  const edges: Record<string, Edge> = {};
  for (const r of db.data.ref) {
    const o = r[1][0];
    if (!set.has(o)) continue;
    const mem = r[0].filter(([i]) => set.has(i));
    if (mem.length !== 1 || mem[0][0] === o) continue;
    const a = mem[0][0];
    (edges[a] ??= { to: o, recipes: [] }).recipes.push(r);
  }
  // follow edges from a node with no incoming edge (chain) or the first member (loop)
  const incoming = new Set(Object.values(edges).map((e) => e.to));
  let s: string | undefined = ids.find((i) => !incoming.has(i)) ?? ids[0];
  const order: string[] = [];
  while (s && !order.includes(s)) {
    order.push(s);
    s = edges[s]?.to;
  }
  const loop = !!(s && s === order[0]);
  const side = db.data.ref.filter(
    (r) => set.has(r[1][0]) && !r[0].some(([i]) => set.has(i)) && r[0].every(([i]) => i.startsWith('raw')),
  );
  return { ...def, ids, edges, order, loop, side };
}

export const buildFamilies = (db: Db) => FAMILY_DEFS.map((d) => buildFamily(db, d));

export interface Route {
  steps: { from: string; to: string; r: Recipe }[];
  /** units of the starting member needed for one unit of the target */
  need: number;
  /** catalysts (non-member inputs) needed along the way */
  extras: Record<string, number>;
}

/**
 * Cheapest route between two members: walk the order, picking per step the variant with the
 * lowest member ratio (ties: cheaper catalyst). With `solo`, only single-input recipes are allowed.
 */
export function route(db: Db, f: Family, a: string, b: string, solo: boolean): Route | null {
  const steps: Route['steps'] = [];
  let i = f.order.indexOf(a);
  if (i < 0 || !f.order.includes(b)) return null;
  while (f.order[i] !== b) {
    const from = f.order[i];
    const e = f.edges[from];
    if (!e) return null;
    let vs = e.recipes;
    if (solo) {
      vs = vs.filter((r) => r[0].length === 1);
      if (!vs.length) return null;
    }
    const ratio = (r: Recipe) => r[0].find(([x]) => x === from)![1] / r[1][1];
    const extra = (r: Recipe) =>
      r[0].filter(([x]) => x !== from).reduce((s, [x, q]) => s + q * (db.items[x].v || 0), 0) / r[1][1];
    vs = vs.slice().sort((p, q) => ratio(p) - ratio(q) || extra(p) - extra(q));
    steps.push({ from, to: e.to, r: vs[0] });
    i = (i + 1) % f.order.length;
    if (steps.length > f.order.length) return null;
  }
  let need = 1;
  const extras: Record<string, number> = {};
  for (let k = steps.length - 1; k >= 0; k--) {
    const { from, r } = steps[k];
    const runs = need / r[1][1];
    r[0].forEach(([x, q]) => {
      if (x !== from) extras[x] = (extras[x] || 0) + q * runs;
    });
    need = runs * r[0].find(([x]) => x === from)![1];
  }
  return { steps, need, extras };
}

/** Chromatic Expansion recipes (double a stellar metal with Chromatic Metal) */
export const stellarExpansions = (db: Db) => db.data.ref.filter((r) => r[3] === 'Chromatic Expansion');

/** raw-only recipes that produce one of ONE_WAY_NAMES */
export function oneWayUpgrades(db: Db): Recipe[] {
  const named = ONE_WAY_NAMES.map(db.rawByName).filter(Boolean);
  return db.data.ref.filter((r) => named.includes(r[1][0]) && r[0].every(([i]) => i.startsWith('raw')));
}

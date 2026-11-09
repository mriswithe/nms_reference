import { describe, expect, it } from 'vitest';
import raw from '../src/data/nms.json';
import { cmpCost, rankRows, rowCost, sourcing } from '../src/lib/sourcing';
import { CostModel } from '../src/lib/cost';
import { refinableConsumables } from '../src/lib/consumables';
import { buildFamilies, oneWayUpgrades, route, stellarExpansions } from '../src/lib/cycles';
import { createDb } from '../src/lib/db';
import { expand, groupRecipes, recipeKey } from '../src/lib/group';
import { createCtx } from '../src/ui/context';
import { renderSource } from '../src/ui/popover';
import { abbr, esc } from '../src/lib/format';
import { createSearch, norm } from '../src/lib/search';
import type { Dataset, Recipe } from '../src/lib/types';

const data = raw as unknown as Dataset;
const db = createDb(data);
const cost = new CostModel(db);
const id = (name: string) => {
  const x = db.byName(name);
  if (!x) throw new Error(`missing item ${name}`);
  return x;
};

describe('dataset', () => {
  it('has items and recipes', () => {
    expect(db.ids.length).toBeGreaterThan(3000);
    expect(data.ref.length).toBeGreaterThan(100);
    expect(data.cook.length).toBeGreaterThan(100);
  });

  it('every recipe references known items', () => {
    for (const r of [...data.ref, ...data.cook]) {
      for (const [i] of [...r[0], r[1]]) expect(db.items[i], `unknown id ${i} in ${r[3]}`).toBeDefined();
    }
    for (const x of db.ids) for (const [i] of db.items[x].rq ?? []) expect(db.items[i], `unknown id ${i} in ${x}`).toBeDefined();
  });
});

describe('db indexes', () => {
  it('links makes and uses', () => {
    const radon = id('Radon');
    expect(db.makes[radon].ref.length).toBeGreaterThan(0);
    expect(db.uses[radon].ref.length).toBeGreaterThan(0);
    expect(db.counts(radon).ref).toBe(db.makes[radon].ref.length);
  });
});

describe('search', () => {
  const search = createSearch(db);
  it('ranks exact names first', () => expect(db.items[search('radon')[0]].n).toBe('Radon'));
  it('matches multi-word queries in any order', () => expect(search('metal chromatic').map((x) => db.items[x].n)).toContain('Chromatic Metal'));
  it('returns nothing for blank input', () => expect(search('   ')).toEqual([]));
  it('normalises accents and punctuation', () => expect(norm("Café-Ö")).toBe('cafeo'));
});

describe('cost model', () => {
  it('raw cost is base value', () => expect(cost.raw(id('Carbon'))).toBe(12));
  it('craft costs are finite and positive for every craftable item', () => {
    for (const x of db.ids.filter((i) => db.items[i].rq)) {
      const c = cost.craft(x);
      expect(Number.isFinite(c), db.items[x].n).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
    }
  });
  it('totals for a raw item is itself', () => expect(cost.totals(id('Carbon'), false)).toEqual([[id('Carbon'), 1]]));
  it('smart totals never cost more than crafting everything', () => {
    for (const x of db.ids.filter((i) => db.items[i].rq).slice(0, 300)) {
      expect(cost.totalValue(cost.totals(x, true))).toBeLessThanOrEqual(cost.totalValue(cost.totals(x, false)) + 1e-6);
    }
  });
});

describe('conversion cycles', () => {
  const fams = Object.fromEntries(buildFamilies(db).map((f) => [f.key, f]));
  it('gases form a 3-member loop', () => {
    expect(fams.gas.loop).toBe(true);
    expect(fams.gas.order).toHaveLength(3);
  });
  it('biome minerals form a 6-member loop', () => {
    expect(fams.biome.loop).toBe(true);
    expect(fams.biome.order).toHaveLength(6);
  });
  it('machinery junk is a one-way chain', () => expect(fams.junk.loop).toBe(false));
  it('routes around a loop', () => {
    const f = fams.gas;
    const rt = route(db, f, f.order[0], f.order[2], false)!;
    expect(rt.steps).toHaveLength(2);
    expect(rt.need).toBeGreaterThan(0);
  });
  it('cannot route backwards along a chain', () => {
    const f = fams.junk;
    expect(route(db, f, f.order.at(-1)!, f.order[0], false)).toBeNull();
  });
  it('finds stellar expansions and one-way upgrades', () => {
    expect(stellarExpansions(db).length).toBeGreaterThan(0);
    expect(oneWayUpgrades(db).length).toBeGreaterThan(0);
  });
});

describe('consumables', () => {
  it('excludes raw materials and intermediates', () => {
    const list = refinableConsumables(db);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((x) => !x.startsWith('raw'))).toBe(true);
  });
});

describe('format', () => {
  it('escapes html', () => expect(esc('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;'));
  it('abbreviates names', () => expect(abbr({ ...db.items[id('Warp Cell')], ab: undefined })).toBe('WC'));
});

describe('recipe grouping', () => {
  const check = (recipes: Recipe[], pin?: string) => {
    const groups = groupRecipes(recipes, pin);
    for (const g of groups) {
      for (const r of g.recipes) {
        expect(r[1]).toEqual(g.out);
        expect(r[3]).toBe(g.op);
      }
      // a row expands to exactly the recipes it claims, never an invented combination
      const want = new Set(g.recipes.map((r) => recipeKey(r[0])));
      expect(expand(g)).toEqual(want);
    }
    expect(groups.reduce((s, g) => s + g.recipes.length, 0)).toBe(recipes.length);
    return groups;
  };

  it('is exact over every cooking and refiner recipe', () => {
    expect(check(data.cook).length).toBeLessThan(data.cook.length * 0.7);
    check(data.ref);
  });

  it('is exact for every item page, makes and used-in', () => {
    for (const x of db.ids) {
      if (db.makes[x]) check(db.makes[x].cook);
      if (db.uses[x]) check(db.uses[x].cook, x);
    }
  });

  it('shows any-two-of pools as one row with their missing doubles', () => {
    const stew = id('Mystery Meat Stew');
    const gs = groupRecipes(db.makes[stew].cook);
    expect(gs).toHaveLength(1);
    const p = gs[0].pool!;
    expect(p.opts).toHaveLength(9);
    const missing = p.opts.filter((o) => !p.doubles.includes(o)).map(([i]) => db.items[i].n);
    expect(missing).toEqual(['ProtoSausage']);
  });

  it('keeps the pinned item fixed in used-in lists', () => {
    const mc = id('Meaty Chunks');
    const stew = id('Mystery Meat Stew');
    const gs = groupRecipes(db.uses[mc].cook, mc).filter((g) => g.out[0] === stew);
    expect(gs).toHaveLength(1);
    expect(gs[0].slots[0].opts).toEqual([[mc, 1]]);
    expect(gs[0].slots[1].opts.length).toBeGreaterThan(5);
  });
});

describe('source popover', () => {
  const ctx = createCtx(data);
  it('summarises how to get an item', () => {
    const h = renderSource(ctx, id('Meaty Chunks'));
    expect(h).toContain('Harvested from creatures');
    expect(h).toContain('Meat Flakes');
    expect(h).toMatch(/>Cook</);
    expect(h).not.toMatch(/>Refine</);
  });
  it('condenses large cooking groups', () => {
    const h = renderSource(ctx, id('Mystery Meat Stew'));
    expect(h).toContain('Any 2 different of');
    for (const n of ['Raw Steak', 'Scaly Meat', 'Diplo Chunks']) expect(h).toContain(n);
    expect(h).toContain('except ProtoSausage');
  });
});

describe('restricted ingredients', () => {
  const src = sourcing(db);
  const byName = (n: string) => db.ids.find((x) => db.items[x].n === n)!;
  const animal = (n: string) => src.animal.has(byName(n));
  const wild = (n: string) => src.wild.has(byName(n));

  it('flags items only obtainable from creatures', () => {
    for (const n of ['Raw Steak', 'Creature Egg', 'Fresh Milk', 'Hypnotic Eye', 'Cream']) expect(animal(n), n).toBe(true);
  });

  it('treats anything a refiner or Nutrient Processor can make from other sources as makeable', () => {
    // Mordite is farmable -> Meat Flakes -> Meaty Chunks -> Processed Meat
    for (const n of ['Mordite', 'Meat Flakes', 'Meaty Chunks', 'Processed Meat', 'Carbon', 'Faecium']) expect(animal(n), n).toBe(false);
  });

  it('flags wild, unfarmable plants', () => {
    for (const n of ['Fireberry', 'Heptaploid Wheat', 'Sweetroot', 'Frozen Tubers', 'Grahberry']) expect(wild(n), n).toBe(true);
    for (const n of ['Solanium', 'Star Bulb', 'Fungal Mould', 'Carbon', 'Raw Steak']) expect(wild(n), n).toBe(false);
    // not farmable, but a refiner makes them (Sodium + Mordite, Salt + Nitrogen)
    for (const n of ['Marrow Bulb', 'Kelp Sac']) expect(wild(n), n).toBe(false);
  });

  it('sorts cooking rows by fewest restricted ingredients, cheapest options first', () => {
    for (const x of db.ids) {
      const rows = rankRows(groupRecipes(db.makes[x]?.cook ?? []), src);
      const costs = rows.map((g) => rowCost(g, src));
      expect(costs).toEqual([...costs].sort(cmpCost));
      for (const g of rows)
        for (const s of g.slots) {
          const c = s.opts.map((o) => ({ animal: +src.animal.has(o[0]), wild: +src.wild.has(o[0]) }));
          expect(c).toEqual([...c].sort(cmpCost));
        }
    }
  });

  it('counts a pool by its best pair', () => {
    const stew = rankRows(groupRecipes(db.makes[id('Mystery Meat Stew')].cook), src)[0];
    expect(rowCost(stew, src)).toEqual({ animal: 0, wild: 0 });
  });
});

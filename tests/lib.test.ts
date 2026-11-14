import { describe, expect, it } from 'vitest';
import raw from '../src/data/nms.json';
import { byTier, cmpCost, rankRows, rankUses, rowCost, sourcing } from '../src/lib/sourcing';
import { CostModel } from '../src/lib/cost';
import { refinableConsumables } from '../src/lib/consumables';
import { buildFamilies, oneWayUpgrades, route, stellarExpansions } from '../src/lib/cycles';
import { createDb } from '../src/lib/db';
import { expand, groupRecipes, recipeKey } from '../src/lib/group';
import { createCtx } from '../src/ui/context';
import { renderSource } from '../src/ui/popover';
import { abbr, esc } from '../src/lib/format';
import { eatText, ingestor, ingestorValue, page, rankedIngestor, shown, tiers, topBySale, topEaten, topIngestor } from '../src/lib/food';
import { renderCooking } from '../src/ui/views/cooking';
import { renderItem } from '../src/ui/views/item';
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
    expect(db.ids.length).toBeGreaterThan(2000);
    expect(data.ref.length).toBeGreaterThan(100);
    expect(data.cook.length).toBeGreaterThan(100);
  });

  it('leaves out starship components and base parts', () => {
    expect(db.ids.filter((x) => /Starship Component$/.test(db.items[x].g) || db.items[x].c === 'Base part')).toEqual([]);
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
  it('shows the fewest creature and wild-plant parts needed to make an item', () => {
    expect(renderSource(ctx, id('Ice Cream'))).toContain('Needs at least 🐾 2 creature parts to make');
    expect(renderSource(ctx, id('Spiced Ice'))).toContain('Needs at least 🐾 2 creature parts + 🌿 1 wild plant to make');
    // makeable without either, or itself the creature part
    for (const n of ['Processed Meat', 'Raw Steak']) expect(renderSource(ctx, id(n))).not.toContain('Needs at least');
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

  it('splits options into tiers, least restricted first, without losing any', () => {
    const order = ['free', 'wild', 'animal', 'both'];
    for (const x of db.ids)
      for (const g of rankRows(groupRecipes(db.makes[x]?.cook ?? []), src))
        for (const opts of [...g.slots.map((sl) => sl.opts), ...(g.pool ? [g.pool.opts] : [])]) {
          const tiers = byTier(opts, src);
          expect(tiers.flatMap(([, qs]) => qs)).toEqual(opts);
          const idx = tiers.map(([t]) => order.indexOf(t));
          expect(idx).toEqual([...idx].sort((a, b) => a - b));
        }
  });

  it('counts processing steps from gathered resources', () => {
    const steps = (n: string) => src.steps.get(byName(n));
    // farmable Mordite -> Meat Flakes -> Meaty Chunks -> Processed Meat
    expect([steps('Mordite'), steps('Meat Flakes'), steps('Meaty Chunks'), steps('Processed Meat')]).toEqual([0, 1, 2, 3]);
    expect(steps('Carbon')).toBe(0);
    expect(steps('Raw Steak')).toBeUndefined();
  });

  it('lists makeable options fewest steps first', () => {
    const big = Number.MAX_SAFE_INTEGER;
    for (const x of db.ids)
      for (const g of rankRows(groupRecipes(db.makes[x]?.cook ?? []), src))
        for (const opts of [...g.slots.map((sl) => sl.opts), ...(g.pool ? [g.pool.opts] : [])])
          for (const [t, qs] of byTier(opts, src)) {
            if (t !== 'free') continue;
            const n = qs.map(([i]) => src.steps.get(i) ?? big);
            expect(n).toEqual([...n].sort((a, b) => a - b));
          }
  });

  it('orders an item\'s cooking uses: irreplaceable, then fewest interchangeable peers, then Creature Pellets', () => {
    const fc = byName('Frost Crystal');
    const outs = rankUses(db, rankRows(groupRecipes(db.uses[fc].cook, fc), src), fc).map((g) => db.items[g.out[0]].n);
    const at = (n: string) => outs.indexOf(n);
    // nothing replaces Frost Crystal in Iced Screams; Frozen Tubers does in Ice Cream
    expect(at('Iced Screams')).toBeLessThan(at('Ice Cream'));
    expect(outs.at(-1)).toBe('Creature Pellets');
    // Fruity Ice Cream (Very Thick Custard is the only peer) before Cream Fingers (six other creams and custards)
    const vc = byName('Viscous Custard');
    const vOuts = rankUses(db, rankRows(groupRecipes(db.uses[vc].cook, vc), src), vc).map((g) => db.items[g.out[0]].n);
    expect(vOuts.indexOf('Fruity Ice Cream')).toBeLessThan(vOuts.indexOf('Cream Fingers'));
  });

  it('counts a pool by its best pair', () => {
    const stew = rankRows(groupRecipes(db.makes[id('Mystery Meat Stew')].cook), src)[0];
    expect(rowCost(stew, src)).toEqual({ animal: 0, wild: 0 });
  });
});

describe('food effects', () => {
  const food = db.ids.filter((x) => db.items[x].c === 'Cooking');

  it('covers the cooking items', () => {
    expect(food.filter((x) => db.items[x].eat).length).toBeGreaterThan(300);
    expect(food.filter((x) => db.items[x].ing).length).toBeGreaterThan(300);
  });

  it('every ingestor stat has a range', () => {
    for (const x of food) {
      const s = db.items[x].ing;
      if (s) expect(data.fstat?.[s[0]], `${x} ${s[0]}`).toBeDefined();
    }
  });

  /** in-game Nutrient Ingestor readings: [food, percent shown, seconds per item]; used only to check the estimates */
  const READINGS: [string, number, number?][] = [
    ['Spore Dunkers', 4233, 396],
    ['Herbal Crunchie', 4474],
    ['Floral Wafer', 4136],
    ['Honied Angel Cake', 6214],
    ['Nightmare Sausage', 1612],
    ['Syrupy Viscera', 15, 120],
  ];

  it('in-game readings fall inside the estimated range', () => {
    for (const [name, pct, secs] of READINGS) {
      const g = ingestor(data, db.items[id(name)])!;
      expect(pct, name).toBeGreaterThanOrEqual(g.lo);
      expect(pct, name).toBeLessThanOrEqual(g.hi);
      if (secs) expect(g.seconds, name).toBe(secs);
    }
  });

  it('known miss: Purged Ribs read +54% Toxic Resistance for 7:30, above the fit', () => {
    const g = ingestor(data, db.items[id('Purged Ribs')])!;
    expect(g.est).toBeCloseTo(41.5, 0);
    expect(g.seconds).toBe(450);
  });

  it('describes Spore Dunkers', () => {
    const it = db.items[id('Spore Dunkers')];
    expect(eatText(it.eat!)).toBe('Restores 20% life support');
    const g = ingestor(data, it)!;
    expect(g.label).toBe('Flora Analysis Rewards');
    expect(g.est).toBeCloseTo(4272, 0);
  });

  it('renders a food section on the item page', () => {
    const ctx = createCtx(data);
    const html = renderItem(ctx, id('Spore Dunkers'));
    expect(html).toContain('Restores 20% life support');
    expect(html).toContain('about +4,272% Flora Analysis Rewards');
    expect(renderItem(ctx, id('Floral Wafer'))).toContain('Restores 25% hazard protection');
    expect(renderItem(ctx, id('Nightmare Sausage'))).toContain('Cannot be eaten directly');
    const sv = renderItem(ctx, id('Syrupy Viscera'));
    expect(sv).toContain('about +16% Sprint Distance');
    expect(sv).toContain('2:00 per item');
    expect(html).toContain('6:36 per item');
    expect(renderItem(ctx, id('Carbon'))).not.toContain('Food effects');
  });
});

describe('cooking reference', () => {
  it('lists the 10 most valuable foods, highest first', () => {
    const top = topBySale(db);
    expect(top).toHaveLength(10);
    const v = top.map((x) => db.items[x].v);
    expect(v).toEqual([...v].sort((a, b) => b - a));
    expect(db.items[top[0]].n).toBe('Horrifying, Gooey Delight');
  });

  it('ranks the top 10 per ingestor stat, biggest shown bonus first', () => {
    const rows = topIngestor(db, 10);
    expect(rows.length).toBe(Object.keys(data.fstat!).length);
    for (const [stat, ids] of rows) {
      expect(ids.length).toBeLessThanOrEqual(10);
      const vals = ids.map((x) => ingestorValue(ingestor(data, db.items[x])!));
      expect(vals, stat).toEqual([...vals].sort((a, b) => b - a));
    }
  });

  it('shows multipliers as the part above 1 and lower-is-better stats as the part below 1', () => {
    expect(shown(10, 60, 42.33)).toBeCloseTo(4233);
    expect(shown(0.1, 0.6, 0.15)).toBeCloseTo(15);
    expect(shown(1.15, 1.5, 1.54)).toBeCloseTo(54);
    expect(shown(0.9, 0.7, 0.7)).toBeCloseTo(30);
    // every estimate is a sensible positive percent, never "+141%" for a 1.15–1.5 multiplier
    for (const x of db.ids) {
      const g = db.items[x].ing && ingestor(data, db.items[x]);
      const [, mn, mx] = g ? data.fstat![db.items[x].ing![0]] : [0, 0, 0];
      if (g && mn >= 1 && mx <= 3) expect(g.est, db.items[x].n).toBeLessThan(250);
    }
  });

  it('ranks the top 3 per eat effect, ties cheapest first', () => {
    const top = topEaten(db);
    expect(top.life.map((x) => db.items[x].eat![1])).toEqual([40, 40, 40]);
    const jet = top.jet.map((x) => db.items[x].v);
    expect(jet).toEqual([...jet].sort((a, b) => a - b));
  });

  it('merges foods with the same ingestor bonus into one tier', () => {
    const all = rankedIngestor(db, 'Weapon_Scan_Discovery_Creature');
    const t = tiers(db, all);
    expect(t.reduce((n, x) => n + x.ids.length, 0)).toBe(all.length);
    expect(t[0].ids.length).toBeGreaterThan(1);
    const v = t.map((x) => x.value);
    expect(v).toEqual([...v].sort((a, b) => b - a));
  });

  it('pages the ingestor table by bonus tier', () => {
    const ctx = createCtx(data);
    ctx.state.cookStat = 'Weapon_Scan_Discovery_Creature';
    // one tier of 22 tied foods: a single page, all 22 shown
    let html = renderCooking(ctx);
    const ing = (h: string) => h.slice(h.indexOf('id="ck-ing"'), h.indexOf('id="ck-eat"'));
    expect(ing(html)).not.toContain('data-cpage');
    expect(ing(html).match(/<button class="chip/g)!.length).toBe(22);
    ctx.state.cookStat = 'Suit_Energy';
    html = renderCooking(ctx);
    expect(ing(html)).toContain('1–5 of 11 tiers');
    expect(ing(html).match(/<tr><td class="num">≈/g)!.length).toBe(5);
  });

  it('shows one eat effect at a time, foods with the same amount in one tier', () => {
    const ctx = createCtx(data);
    const eat = (h: string) => h.slice(h.indexOf('id="ck-eat"'));
    let html = eat(renderCooking(ctx));
    // life support: 40%, 20% and 5% tiers, biggest first, on one page
    const amounts = [...html.matchAll(/<tr><td>Restores (\d+)% life support/g)].map((m) => Number(m[1]));
    expect(amounts).toEqual([40, 20, 5]);
    expect(html).not.toContain('data-cpage');
    // sprint: every food gives 15 s, so one tier listing all of them
    ctx.state.cookEat = 'sprint';
    html = eat(renderCooking(ctx));
    expect(html.match(/<tr><td>/g)!.length).toBe(1);
    expect(html.match(/<button class="chip/g)!.length).toBe(topEaten(db, Infinity).sprint.length);
    expect(html).not.toMatch(/Show all|Show fewer/);
  });

  it('pages a list and clamps out-of-range pages', () => {
    const list = Array.from({ length: 25 }, (_, i) => i);
    expect(page(list, 1)).toMatchObject({ items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], start: 10, page: 1, pages: 3, total: 25 });
    expect(page(list, 9)).toMatchObject({ items: [20, 21, 22, 23, 24], page: 2 });
    expect(page(list, -1).page).toBe(0);
    expect(page([], 0)).toMatchObject({ items: [], pages: 1 });
  });

  it('renders the page, with paging past the first 10', () => {
    const ctx = createCtx(data);
    const html = renderCooking(ctx);
    for (const s of ['By sale price', 'best foods per bonus', 'Flora Analysis Rewards', 'Jetpack overload', 'Horrifying, Gooey Delight', '1–10 of'])
      expect(html).toContain(s);
    // sale table is just rank, food and base value
    expect(html.slice(html.indexOf('id="ck-sale"'), html.indexOf('id="ck-ing"'))).not.toContain('Nutrient Ingestor<');
    ctx.state.cookPage.sale = 1;
    const p2 = renderCooking(ctx);
    expect(p2).toContain('11–20 of');
    expect(p2.slice(p2.indexOf('id="ck-sale"'), p2.indexOf('id="ck-ing"'))).not.toContain('Horrifying, Gooey Delight');
  });
});

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
import { groupRow } from '../src/ui/html';
import { abbr, esc } from '../src/lib/format';
import { eatRank, eatText, fewestHarvest, ingestor, ingestorRank, ingestorValue, page, rankedIngestor, shown, tiers, topBySale, topEaten, topIngestor } from '../src/lib/food';
import { renderCooking } from '../src/ui/views/cooking';
import { renderItem } from '../src/ui/views/item';
import { renderMtUpgrades, renderMultitool } from '../src/ui/views/multitool';
import { renderExosuit, renderUpgrades } from '../src/ui/views/upgrades';
import { renderReroll } from '../src/ui/views/reroll';
import { MOD_CLASSES, moduleCatalog, MT_TECH, RANGES, SPECIAL } from '../src/lib/multitool';
import { EXOSUIT, PLATFORMS, SHIP_PLATFORMS, upgradeCatalog } from '../src/lib/upgrades';
import { createSearch, norm } from '../src/lib/search';
import { compareKeys, nextSort, numKey, sortRows, textKey } from '../src/lib/tablesort';
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
  it('names the creature and wild-plant ingredients the cheapest route needs', () => {
    const names = (n: string) => ctx.src.needs(id(n)).map((x) => x.opts.map((o) => db.items[o].n));
    // three egg recipes for Viscous Custard merge into one choice; Cream comes from either milk
    const ice = names('Ice Cream').map((x) => x.sort());
    expect(ice).toHaveLength(2);
    expect(ice).toContainEqual(['Creature Egg', 'Giant Egg', 'Tall Eggs']);
    expect(ice).toContainEqual(['Fresh Milk', 'Wild Milk']);
    expect(names('Spiced Ice').flat()).toContain('Fireberry');
    const h = renderSource(ctx, id('Ice Cream'));
    expect(h).toContain('Needs from creatures / wild plants');
    for (const n of ['Fresh Milk', 'Wild Milk', 'Creature Egg', 'Tall Eggs', 'Giant Egg']) expect(h).toContain(n);
    // makeable without either, or itself the creature part
    for (const n of ['Processed Meat', 'Raw Steak']) expect(renderSource(ctx, id(n))).not.toContain('Needs from');
  });
  it('condenses large cooking groups', () => {
    const h = renderSource(ctx, id('Mystery Meat Stew'));
    expect(h).toContain('Any two*');
    expect(h).not.toContain('different');
    for (const n of ['Raw Steak', 'Scaly Meat', 'Diplo Chunks']) expect(h).toContain(n);
    expect(h).toContain('*Except ProtoSausage, which can only be used once.');
    // the expanded list on the item page says the same
    const pool = groupRecipes(db.makes[id('Mystery Meat Stew')].cook).find((g) => g.pool)!;
    ctx.state.expanded.add('t:pool');
    const row = groupRow(ctx, pool, null, 't');
    expect(row).toContain('Any two*');
    expect(row).toContain('*Except ProtoSausage, which can only be used once.');
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

  it('counts restricted parts across the whole recipe tree', () => {
    // Viscous Custard needs an egg and Cream (from milk): 2 creature parts, not 1
    const vc = byName('Viscous Custard');
    const ice = groupRecipes(db.uses[vc].cook, vc).find((g) => db.items[g.out[0]].n === 'Ice Cream')!;
    expect(rowCost(ice, src)).toEqual({ animal: 2, wild: 0 });
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

  it('ranks a food by distinct amount among foods with the same effect', () => {
    // hazard protection: 36 foods at 50%, 62 at 25%, 5 at 10%
    const haz = topEaten(db, Infinity).haz;
    const at = (n: number) => haz.find((x) => db.items[x].eat![1] === n)!;
    expect(eatRank(db, at(50))).toEqual({ rank: 1, of: 3, shared: 36, foods: 103 });
    expect(eatRank(db, at(25))).toEqual({ rank: 2, of: 3, shared: 62, foods: 103 });
    expect(eatRank(db, at(10))).toEqual({ rank: 3, of: 3, shared: 5, foods: 103 });
    const sd = id('Spore Dunkers');
    const r = ingestorRank(db, sd)!;
    expect(r.foods).toBe(rankedIngestor(db, db.items[sd].ing![0]).length);
    expect(r.of).toBeLessThanOrEqual(r.foods);
    expect(renderItem(createCtx(data), sd)).toContain(`#${r.rank} of ${r.of}`);
    expect(renderItem(createCtx(data), at(25))).toContain('#2 of 3</span> <span class="q">· shared by 62 foods');
  });

  it('puts the in-game description last on the item page', () => {
    const html = renderItem(createCtx(data), id('Viscous Custard'));
    expect(html.indexOf('Used in')).toBeGreaterThan(-1);
    expect(html.lastIndexOf('<section')).toBe(html.indexOf('<section class="card k-use"><h3>In-game description'));
  });

  it('renders a food section on the item page', () => {
    const ctx = createCtx(data);
    const html = renderItem(ctx, id('Spore Dunkers'));
    expect(html).toContain('Restores 20% life support');
    expect(html).toContain('about +4,272%<sup class="fn" aria-hidden="true">*</sup> Flora Analysis Rewards');
    expect(html).toMatch(/\*<\/span> Estimated from the food's cooking value; the game's range for this bonus is \+[\d,]+% to \+[\d,]+%\./);
    expect(html).not.toContain('estimated, ');
    expect(renderItem(ctx, id('Floral Wafer'))).toContain('Restores 25% hazard protection');
    expect(renderItem(ctx, id('Nightmare Sausage'))).toContain('Cannot be eaten directly');
    const sv = renderItem(ctx, id('Syrupy Viscera'));
    expect(sv).toContain('about +16%<sup class="fn" aria-hidden="true">*</sup> Sprint Distance');
    // the game's range (about 3.6% to 4.0%) rounds to one value: shown as exact, no footnote
    const vc = renderItem(ctx, id('Viscous Custard'));
    expect(vc).toContain('<b>Nutrient Ingestor:</b> +4% Sprint Recovery Time');
    expect(vc).not.toContain('Estimated from');
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

  it('stars the foods with the fewest harvest-only ingredients in each ingestor tier, listed first', () => {
    const ctx = createCtx(data);
    const ing = (h: string) => h.slice(h.indexOf('id="ck-ing"'), h.indexOf('id="ck-eat"'));
    ctx.state.cookStat = 'Weapon_Scan_Discovery_Mineral';
    let html = ing(renderCooking(ctx));
    const top = tiers(db, rankedIngestor(db, 'Weapon_Scan_Discovery_Mineral'))[0];
    const best = fewestHarvest(ctx.src, top.ids);
    expect(best.n).toBe(2);
    expect([...best.ids].map((x) => db.items[x].n)).toEqual(['Caramel Curiosity']);
    const row = html.slice(html.indexOf('<tr><td class="num">≈'));
    expect(row.indexOf('Caramel Curiosity')).toBeLessThan(row.indexOf('Angelic Fruitcake'));
    expect(row.slice(0, row.indexOf('</tr>')).match(/⭐/g)!.length).toBe(1);
    ctx.state.cookStat = 'Weapon_Scan_Discovery_Creature';
    html = ing(renderCooking(ctx));
    expect(fewestHarvest(ctx.src, tiers(db, rankedIngestor(db, 'Weapon_Scan_Discovery_Creature'))[0].ids).n).toBe(3);
    expect(html).toContain('Fewest harvest-only ingredients for this bonus (3)');
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

describe('multi-tool guide', () => {
  it('finds a module of every class for every technology', () => {
    const cat = moduleCatalog(db);
    for (const t of MT_TECH) for (const c of MOD_CLASSES) expect(cat[t.key][c], `${t.name} ${c}`).toBeTruthy();
    expect(db.items[cat.mining.S!].g).toBe('Supreme Mining Beam Upgrade');
    expect(db.items[cat.mining.X!].g).toBe('Banned Mining Beam Upgrade');
  });

  it('has a range row of the right width for every class', () => {
    for (const t of MT_TECH) {
      const r = RANGES[t.key];
      expect(r, t.key).toBeTruthy();
      for (const c of MOD_CLASSES) expect(r.rows[c]?.length, `${t.key} ${c}`).toBe(r.stats.length + 1);
    }
  });

  it('renders every technology tab on the upgrades half', () => {
    const ctx = createCtx(data);
    for (const t of MT_TECH) {
      ctx.state.mtTech = t.key;
      const h = renderMtUpgrades(ctx);
      expect(h).toContain(`data-mttech="${t.key}" aria-pressed="true"`);
      expect(h).toContain('id="mt-shop"');
      expect(h).toContain('id="mt-special"');
    }
  });

  it('splits the guide: tools on one page, modules on the other', () => {
    const ctx = createCtx(data);
    const tools = renderMultitool(ctx);
    expect(tools).toContain('id="mt-tool"');
    expect(tools).not.toContain('id="mt-ranges"');
    expect(tools).toContain('data-go="mtupgrades"');
    expect(renderMtUpgrades(ctx)).toContain('data-go="multitool"');
  });

  it('keeps the reroll method on its own page, linked from every upgrades page', () => {
    const ctx = createCtx(data);
    const mt = renderMtUpgrades(ctx);
    expect(mt).not.toContain('id="mt-reroll"');
    expect(mt).not.toContain('data-jump="mt-reroll"');
    for (const h of [mt, renderUpgrades(ctx), renderExosuit(ctx)]) expect(h).toContain('data-go="reroll"');
    const r = renderReroll(ctx);
    for (const id of ['rr-how', 'rr-steps', 'rr-which', 'rr-tips']) expect(r).toContain(`id="${id}"`);
    for (const v of ['mtupgrades', 'upgrades', 'exosuit']) expect(r).toContain(`data-go="${v}"`);
  });

  it('links every special upgrade to a real item', () => {
    for (const id of [SPECIAL.shard.id, SPECIAL.shard.glass, ...SPECIAL.blueprints.map((b) => b.id), ...SPECIAL.typed.map((b) => b.id)])
      expect(db.items[id], id).toBeTruthy();
    expect(db.items[SPECIAL.shard.id].g).toBe('Forbidden Multi-Tool Module');
  });
});

describe('ship and exosuit upgrades', () => {
  it('has a module item for every class it lists ranges for, and row widths match', () => {
    for (const p of PLATFORMS) {
      const cat = upgradeCatalog(db, p);
      for (const t of p.techs) {
        for (const c of MOD_CLASSES) {
          const r = t.rows[c];
          if (r) expect(r.length, `${t.key} ${c}`).toBe(t.stats.length + 1);
          if (t.match) expect(!!cat[t.key][c], `${p.key} ${t.key} ${c}`).toBe(!!r);
          // one module per class, except the tab that covers the four identical fleet bonuses
          if (r && t.match) expect(cat[t.key][c]!.length, `${p.key} ${t.key} ${c}`).toBe(t.key === 'fmission' ? 4 : 1);
        }
      }
    }
  });

  it('renders every ship platform and technology', () => {
    const ctx = createCtx(data);
    for (const p of SHIP_PLATFORMS) {
      ctx.state.upPlat = p.key;
      for (const t of p.techs) {
        ctx.state.upTech[p.key] = t.key;
        const h = renderUpgrades(ctx);
        expect(h).toContain(`data-upplat="${p.key}" aria-pressed="true"`);
        expect(h).toContain(`data-uptech="${t.key}" data-plat="${p.key}" aria-pressed="true"`);
        expect(h).not.toContain('data-upplat="exosuit"');
      }
    }
  });

  it('gives the Exosuit its own page', () => {
    const ctx = createCtx(data);
    for (const t of EXOSUIT.techs) {
      ctx.state.upTech.exosuit = t.key;
      const h = renderExosuit(ctx);
      expect(h).toContain(`data-uptech="${t.key}" data-plat="exosuit" aria-pressed="true"`);
      expect(h).not.toContain('data-upplat=');
      expect(h).toContain('data-go="upgrades"');
    }
  });
});

describe('sortable tables', () => {
  it('reads numbers, clocks and ranges from cell text', () => {
    expect(numKey('≈ 12%')).toBe(12);
    expect(numKey('−30 to −50%')).toBe(-30);
    expect(numKey('10,000')).toBe(10000);
    expect(numKey('1:30')).toBe(90);
    expect(numKey('Restores 25% life support')).toBe(25);
    expect(textKey('—', true)).toBeNull();
    expect(textKey('  ', false)).toBeNull();
  });

  it('sorts stably, empty cells last both ways, and cycles asc → desc → off', () => {
    const rows = ['b10', 'a', '', 'b9', 'A'];
    const key = [(r: string) => textKey(r, false)];
    expect(sortRows(rows, { col: 0, dir: 1 }, key)).toEqual(['a', 'A', 'b9', 'b10', '']);
    expect(sortRows(rows, { col: 0, dir: -1 }, key)).toEqual(['b10', 'b9', 'a', 'A', '']);
    expect(sortRows(rows, undefined, key)).toBe(rows);
    expect(compareKeys(2, 10, 1)).toBeLessThan(0);
    expect(nextSort(undefined, 2)).toEqual({ col: 2, dir: 1 });
    expect(nextSort({ col: 2, dir: 1 }, 2)).toEqual({ col: 2, dir: -1 });
    expect(nextSort({ col: 2, dir: -1 }, 2)).toBeUndefined();
    expect(nextSort({ col: 2, dir: -1 }, 0)).toEqual({ col: 0, dir: 1 });
  });

  it("sorts a paged cooking list as a whole, keeping each food's rank", () => {
    const ctx = createCtx(data);
    const sale = (h: string) => h.slice(h.indexOf('id="ck-sale"'), h.indexOf('id="ck-ing"'));
    const ranks = (h: string) => [...sale(h).matchAll(/<tr><td class="num">(\d+)<\/td>/g)].map((m) => Number(m[1]));
    expect(ranks(renderCooking(ctx))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // base value ascending: the cheapest foods overall, i.e. the last ranks, on page one
    ctx.state.tableSort.sale = { col: 2, dir: 1 };
    const all = topBySale(db, Infinity);
    const vals = ranks(renderCooking(ctx)).map((r) => db.items[all[r - 1]].v ?? 0);
    expect(vals[0]).toBe(Math.min(...all.map((f) => db.items[f].v ?? 0)));
    expect(vals).toEqual(vals.slice().sort((a, b) => a - b));
    expect(ranks(renderCooking(ctx))).not.toContain(1);
    expect(sale(renderCooking(ctx))).toContain('data-pager="sale"');
    // chip columns get no sort button
    expect(sale(renderCooking(ctx))).toContain('<th scope="col" data-nosort>Simplest recipe</th>');
  });
});

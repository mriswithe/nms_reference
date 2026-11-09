import { describe, expect, it } from 'vitest';
import raw from '../src/data/nms.json';
import { CostModel } from '../src/lib/cost';
import { refinableConsumables } from '../src/lib/consumables';
import { buildFamilies, oneWayUpgrades, route, stellarExpansions } from '../src/lib/cycles';
import { createDb } from '../src/lib/db';
import { abbr, esc } from '../src/lib/format';
import { createSearch, norm } from '../src/lib/search';
import type { Dataset } from '../src/lib/types';

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

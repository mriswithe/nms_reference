/**
 * Multi-Tool upgrade modules: which buyable module item is which class, per technology.
 * The guide text itself lives in src/ui/views/multitool.ts.
 */
import type { Db } from './db';
import type { Item } from './types';

export type ModClass = 'C' | 'B' | 'A' | 'S' | 'X';

export const MOD_CLASSES: ModClass[] = ['C', 'B', 'A', 'S', 'X'];

/** module group name prefix per class: "Supreme Mining Beam Upgrade" is S, "Banned …" is the black-market X class */
const PREFIX: Record<ModClass, string> = { C: '', B: 'Significant ', A: 'Powerful ', S: 'Supreme ', X: 'Banned ' };

/**
 * Multi-Tool technologies that take upgrade modules, in the order the guide lists them; `g` is the name inside the
 * module group, `sg` the name inside the salvaged module's group (absent when there is no salvaged form)
 */
export const MT_TECH: { key: string; name: string; g: string; sg?: string; role: 'utility' | 'weapon' }[] = [
  { key: 'mining', name: 'Mining Beam', g: 'Mining Beam', sg: 'Mining Beam', role: 'utility' },
  { key: 'scanner', name: 'Scanner', g: 'Scanning System', sg: 'Analysis Visor', role: 'utility' },
  { key: 'bolt', name: 'Boltcaster', g: 'Boltcaster', sg: 'Boltcaster', role: 'weapon' },
  { key: 'pulse', name: 'Pulse Spitter', g: 'Pulse Spitter', sg: 'Pulse Spitter', role: 'weapon' },
  { key: 'scatter', name: 'Scatter Blaster', g: 'Scatter Blaster', sg: 'Scatter Blaster', role: 'weapon' },
  { key: 'blaze', name: 'Blaze Javelin', g: 'Blaze Javelin', sg: 'Blaze Javelin', role: 'weapon' },
  { key: 'neutron', name: 'Neutron Cannon', g: 'Neutron Cannon', role: 'weapon' },
  { key: 'plasma', name: 'Plasma Launcher', g: 'Plasma Launcher', sg: 'Plasma Launcher', role: 'weapon' },
  { key: 'geology', name: 'Geology Cannon', g: 'Geology Cannon', sg: 'Geology Cannon', role: 'weapon' },
];

/**
 * Salvaged modules: the unpackaged "Tech module" form of an upgrade ("A-Class Hyperdrive Upgrade",
 * "Illegal Mining Beam Upgrade"), which is what scrapping a starship or Multi-Tool gives back. The class is in
 * the group prefix; the technology names don't always match the shop's ("Defence Systems", "Analysis Visor").
 */
export function salvageClass(it: Item): ModClass | undefined {
  if (it.c !== 'Tech module') return undefined;
  const m = /^(?:([CBAS])-Class|(Illegal)) /.exec(it.g);
  if (m) return (m[1] as ModClass | undefined) ?? 'X';
  // Aeration Membrane keeps the shop's word prefixes, one class lower than usual (no C exists)
  const w = /^(Significant |Powerful )?Underwater Oxygen Upgrade$/.exec(it.g);
  if (w) return w[1] === 'Significant ' ? 'A' : w[1] === 'Powerful ' ? 'S' : 'B';
  return undefined;
}

/** salvaged module whose group, minus the class prefix, is `g` (e.g. "Hyperdrive Upgrade") */
export const salvageOf = (g: string) => (it: Item) =>
  salvageClass(it) !== undefined && it.g.replace(/^(?:[CBAS]-Class|Illegal|Significant|Powerful) /, '') === g;

/** tech key -> class -> salvaged module item id */
export function salvageCatalog(db: Db): Record<string, Partial<Record<ModClass, string>>> {
  const out: Record<string, Partial<Record<ModClass, string>>> = {};
  for (const t of MT_TECH) {
    const row: Partial<Record<ModClass, string>> = {};
    if (t.sg)
      for (const id of db.ids) {
        const it = db.items[id];
        if (salvageOf(`${t.sg} Upgrade`)(it)) row[salvageClass(it)!] = id;
      }
    out[t.key] = row;
  }
  return out;
}

/** tech key -> class -> module item id (only classes the dataset has) */
export function moduleCatalog(db: Db): Record<string, Partial<Record<ModClass, string>>> {
  const byGroup = new Map<string, string>();
  for (const id of db.ids) {
    const it = db.items[id];
    // the nanite-priced modules sold by technology merchants ("Upgrade module"; Neutron Cannon's are filed as "Product")
    if (it.c === 'Upgrade module' || (it.c === 'Product' && / Upgrade$/.test(it.g) && /Module$/.test(it.n))) byGroup.set(it.g, id);
  }
  const out: Record<string, Partial<Record<ModClass, string>>> = {};
  for (const t of MT_TECH) {
    const row: Partial<Record<ModClass, string>> = {};
    for (const c of MOD_CLASSES) {
      const id = byGroup.get(`${PREFIX[c]}${t.g} Upgrade`);
      if (id) row[c] = id;
    }
    out[t.key] = row;
  }
  return out;
}

/**
 * Roll ranges per module class, read from the game's procedural technology table (Forsaken, via
 * exports/modules.json from scripts/modules-export.mjs). Values are what the game stores: "−10%" on a time stat
 * means faster, and Damage on projectile weapons is a flat game-file number, not a percent.
 */
export interface StatTable {
  stats: string[];
  /** class -> [number of stats rolled, ...one range per stat ('—' = can't roll)] */
  rows: Partial<Record<ModClass, string[]>>;
  /** which stats to judge a roll on, best first */
  judge: string;
  /** stats every module of this technology rolls (they count toward "Stats"); the rest are random picks */
  always?: string[];
  /** upgrades outside the C–X ladder that roll this technology's stats (Sentinel shards), shown below the class rows */
  extra?: ExtraRow[];
}

export interface ExtraRow {
  label: string;
  /** item ids: the carried item, and its installed "Tech module" form */
  ids: string[];
  salvage?: string[];
  /** same shape as a class row: [number of stats rolled, ...one range per stat] */
  row: string[];
}

export const RANGES: Record<string, StatTable> = {
  mining: {
    stats: ['Mining speed', 'Heat dispersion', 'Fuel efficiency', 'Overheat downtime'],
    rows: {
      C: ['1–2', '5–10%', '5–15%', '1–10%', '−5 to −10%'],
      B: ['2–3', '5–15%', '15–20%', '10–15%', '−10 to −15%'],
      A: ['3–4', '10–20%', '20–40%', '15–20%', '−10 to −15%'],
      S: ['4', '15–20%', '40–50%', '20%', '−15 to −20%'],
      X: ['1–4', '5–20%', '5–55%', '1–25%', '−5 to −25%'],
    },
    judge: 'S always rolls all four and fuel efficiency is fixed at 20%, so judge on heat dispersion (widest range) and then mining speed.',
  },
  scanner: {
    stats: ['Scan radius', 'Flora, fauna and mineral analysis rewards (each)'],
    rows: {
      C: ['1–2', '5–10%', '1,000–2,000%'],
      B: ['2–3', '10–20%', '2,500–5,000%'],
      A: ['2–4', '20–30%', '5,000–10,000%'],
      S: ['3–4', '30–40%', '6,500–10,000%'],
      X: ['2–4', '5–50%', '1,000–11,000%'],
    },
    judge: 'Analysis rewards are where the units and nanites come from; scan radius is a convenience. Flora, fauna and mineral rewards roll as three separate stats with this range, so "Stats" counts out of four. Keep the module with the highest reward rolls.',
  },
  bolt: {
    stats: ['Damage', 'Reload time', 'Clip size', 'Fire rate', 'Shots per burst', 'Burst cooldown'],
    always: ['Damage'],
    rows: {
      C: ['1–2', '1', '−5 to −10%', '+2', '1–10%', '+1', '−1 to −5%'],
      B: ['2–3', '1–2', '−10 to −15%', '+4', '5–10%', '+1', '−5 to −10%'],
      A: ['3–4', '2–3', '−10 to −20%', '+6', '10–15%', '+1 to +2', '−10 to −15%'],
      S: ['4', '3–4', '−10 to −20%', '+8', '10–15%', '+1 to +2', '−15%'],
      X: ['2–4', '1–5', '−5 to −25%', '+2 to +10', '1–20%', '+1 to +2', '−1 to −20%'],
    },
    judge: 'Damage is always rolled, so an S module picks 3 of the other 5 stats. Judge on damage, then fire rate; a module whose picks went to clip size or shots per burst is the one to reroll.',
    extra: [{ label: 'Sentinel Weapons Shard', ids: ['prod166'], salvage: ['tMod176'], row: ['2–3', '1–4', '−1 to −15%', '—', '1–20%', '—', '—'] }],
  },
  pulse: {
    stats: ['Damage', 'Fire rate', 'Reload time', 'Clip size'],
    rows: {
      C: ['1–2', '1', '1–10%', '—', '+12'],
      B: ['2–3', '1–2', '1–10%', '−1 to −10%', '+12'],
      A: ['3–4', '1–3', '5–10%', '−1 to −10%', '+12'],
      S: ['4', '2–3', '10–15%', '−5 to −10%', '+12'],
      X: ['2–4', '1–4', '1–20%', '−1 to −15%', '+12'],
    },
    judge: 'S always rolls all four and clip size is +12 at every class, so judge on damage and fire rate. X-class has the highest damage ceiling here (4).',
  },
  scatter: {
    stats: ['Damage', 'Reload time', 'Clip size', 'Fire rate', 'Shots per burst', 'Burst cooldown'],
    always: ['Damage'],
    rows: {
      C: ['1–2', '1', '−5 to −10%', '—', '—', '+1', '—'],
      B: ['2–3', '1–2', '−10 to −15%', '+8', '1–5%', '+1', '−5 to −10%'],
      A: ['3–4', '2–4', '−15 to −20%', '+8', '5–10%', '+1', '−10 to −15%'],
      S: ['4', '3–5', '−20 to −25%', '+8', '10–15%', '+1', '−15 to −20%'],
      X: ['2–4', '1–6', '−5 to −30%', '+8', '1–20%', '+1', '−5 to −25%'],
    },
    judge: 'Damage is always rolled, so an S module picks 3 of the other 5 stats. Judge on damage, then reload time; clip size and shots per burst are fixed amounts, so a module that spent picks on them is the one to reroll.',
  },
  blaze: {
    stats: ['Damage', 'Charge time'],
    rows: {
      C: ['1', '30–40', '−5 to −10%'],
      B: ['1–2', '40–50', '−10 to −15%'],
      A: ['2', '50–60', '−10 to −20%'],
      S: ['2', '60–75', '−10 to −20%'],
      X: ['1–2', '30–85', '−5 to −25%'],
    },
    judge: 'Only two stats, and S always rolls both, so this is the easiest weapon to max: reroll until damage is near 75.',
  },
  neutron: {
    stats: ['Damage', 'Ion spheres', 'Charged shot speed', 'Charge time'],
    always: ['Charge time'],
    rows: {
      C: ['1–2', '2–5', '+1', '5–10', '−5 to −10%'],
      B: ['2–3', '5–7', '+1', '10–15', '−10 to −15%'],
      A: ['3–4', '7–12', '+1', '15–20', '−20 to −30%'],
      S: ['4', '12–18', '+1', '20–25', '−30 to −50%'],
      X: ['2–4', '5–18', '+1', '5–25', '−5 to −50%'],
    },
    judge: 'Charge time is always rolled, and S rolls all four. S charge time ranges from −30% to −50%, the widest spread of any weapon stat. Judge on that, then damage.',
  },
  plasma: {
    stats: ['Damage', 'Bounces', 'Explosion radius', 'Projectile speed'],
    rows: {
      C: ['1–2', '100–200', '1', '1–5%', '1–2'],
      B: ['1–3', '200–300', '1–2', '5–10%', '1–3'],
      A: ['2–3', '300–400', '2–3', '5–10%', '1–3'],
      S: ['3', '350–400', '3', '10–15%', '2–3'],
      X: ['2–3', '100–450', '1–4', '1–20%', '1–4'],
    },
    judge: 'Damage, then radius. The step from A to S is small, so a high A roll is nearly as good.',
  },
  geology: {
    stats: ['Damage', 'Crater radius', 'Projectile speed'],
    rows: {
      C: ['1', '100–200', '10–20%', '1–2'],
      B: ['1–2', '200–300', '20–30%', '1–3'],
      A: ['1–2', '300–400', '30–50%', '1–3'],
      S: ['2', '350–400', '40–50%', '2–3'],
      X: ['1–2', '100–450', '10–60%', '1–4'],
    },
    judge: 'For terrain clearing and mining deposits, crater radius matters more than damage.',
  },
};

export interface SpecialTech {
  /** item id in the dataset */
  id: string;
  /** MT_TECH key of the technology it boosts, or 'all' */
  tech: string;
  what: string;
}

/**
 * Non-procedural Multi-Tool upgrades. Shard ranges are the game's UP_SENGUN entry; shatter odds are the
 * Salvaged Glass loot table (DE_SENT_LOOT).
 */
export const SPECIAL = {
  shard: {
    id: 'prod166',
    glass: 'cur80',
    notes: [
      'A "Forbidden Multi-Tool Module". It rolls 2–3 of its three stats when installed, like any other module, and players report the same save-and-reload reroll works.',
      'It boosts the <b>Boltcaster</b> only. Players run three shards beside three normal Boltcaster modules without overloading, so the shards appear to have their own cap of three. That comes from player builds, not the game files.',
      'Get it by shattering Salvaged Glass (from Sentinel drops, 0–1 per wreck) in your inventory. The game\'s loot table gives a Weapons Shard and a Sentinel Exosuit Fragment about 20% each; the rest is nanites, Vy\'keen Effigies, Sentinel Boundary Maps and other salvage.',
      'Another source gives a much lower damage ceiling (+2). The 1–4 here is the game-file number.',
    ],
  },
  blueprints: [
    { id: 'tech73', tech: 'bolt', what: 'less recoil and burst cooldown, +1 shot per burst' },
    { id: 'tech74', tech: 'bolt', what: '+1 damage, faster fire rate, bigger clip' },
    { id: 'tech184', tech: 'bolt', what: 'shots ricochet' },
    { id: 'tech83', tech: 'pulse', what: 'bigger clip' },
    { id: 'tech185', tech: 'pulse', what: 'shots ricochet' },
    { id: 'tech207', tech: 'pulse', what: 'sets targets on fire' },
    { id: 'tech81', tech: 'scatter', what: 'faster reload' },
    { id: 'tech79', tech: 'blaze', what: 'more damage' },
    { id: 'tech206', tech: 'blaze', what: 'stuns targets' },
    { id: 'tech209', tech: 'neutron', what: 'faster charge and charged shots, +2 ion spheres' },
    { id: 'tech70', tech: 'mining', what: 'mines large and rare deposits' },
    { id: 'tech71', tech: 'mining', what: 'more yield per harvest' },
    { id: 'tech75', tech: 'mining', what: 'faster mining, slower overheating' },
    { id: 'tech64', tech: 'scanner', what: 'faster scanner recharge, bigger scan radius' },
    { id: 'tech210', tech: 'all', what: 'every weapon does more damage to stunned targets (pair with the Paralysis Mortar)' },
    { id: 'tech68', tech: 'all', what: 'zoom when aiming' },
  ] as SpecialTech[],
  typed: [
    { id: 'tech241', tech: 'mining', what: 'Sentinel Multi-Tools only: built-in mining laser in place of the Mining Beam.' },
    { id: 'tech249', tech: 'mining', what: 'Atlantid Multi-Tools only: built-in mining laser with a cloaking mode. Players report it works alongside a normal Mining Beam.' },
    { id: 'tech167', tech: 'mining', what: 'Starbirth quest reward: turns terrain deposits into Solanium. Does no damage.' },
    { id: 'tech168', tech: 'mining', what: 'Starbirth quest reward: an overloaded mining laser.' },
    { id: 'tech247', tech: 'scanner', what: 'From the "They Who Returned" quest: reveals cloaked Autophage. Also +10% scan radius.' },
    { id: 'tech248', tech: 'scanner', what: 'From the Autophage quest: locates Autophage gatherings. Also +10% scan radius.' },
    { id: 'tech242', tech: 'scanner', what: 'Finds sentience echoes on dissonant worlds. Also +10% scan radius.' },
  ] as SpecialTech[],
};

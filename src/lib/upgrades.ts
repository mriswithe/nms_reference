/**
 * Upgrade-module roll ranges for the starship, living ship, freighter and exosuit, plus which dataset item is
 * which class. The Multi-Tool has its own page (multitool.ts); this reuses its class letters and table shape.
 *
 * Ranges are datamined (nomansskyrecipes.com, Forsaken 7.1, data dated 2026-10-28). That site stores some
 * percentages as "value − 100%" (e.g. Life Support S "−50% → 0%"); those are converted here to what the game
 * shows (+50 to +100%). The Life Support conversion is confirmed against the wiki; sprint distance and
 * shield strength are converted the same way.
 *
 * Checked against the game's own procedural technology table (exports/modules.json, Steam build 26540391), which
 * fixed Positron Ejector C damage and the Freighter Hyperdrive's warp cell efficiency, and supplied the Sentinel
 * and Autophage Exosuit rows. The Exocraft rows come from that table alone (EXPORT_BUILD).
 */
import type { Db } from './db';
import type { Item } from './types';
import { MOD_CLASSES, salvageClass, salvageOf, type ExtraRow, type ModClass, type SpecialTech, type StatTable } from './multitool';

export interface UpTech extends StatTable {
  key: string;
  name: string;
  /** picks this technology's module items out of the dataset; omitted when the dataset has none */
  match?: (it: Item) => boolean;
  /** group of its salvaged modules, minus the class prefix (see salvageClass); omitted when there are none */
  salvage?: string;
  /** narrows `salvage` when one group covers two technologies (heat and cold share "Thermal Protection") */
  salvageDesc?: RegExp;
  /** extra line under the table */
  note?: string;
}

export interface Platform {
  key: string;
  name: string;
  icon: string;
  techs: UpTech[];
  /** where the modules come from */
  where: string[];
  /** lower-case name for running text ("Where to get … modules"); defaults to `name` in lower case */
  noun?: string;
  /** fixed-stat blueprint technologies; `tech` is a key in `techs`, or 'all' */
  blueprints?: SpecialTech[];
}

/** class from the module item: "Banned …" group is X, salvage carries its letter, otherwise the nanite price tier */
const PRICE_CLASS: Record<number, ModClass> = { 60: 'C', 140: 'B', 300: 'A', 480: 'S' };
export function classOf(it: Item): ModClass | undefined {
  if (/^Banned /.test(it.g) || /^Suspicious /.test(it.n)) return 'X';
  const m = /^([CBAS])-Class Deployable Salvage$/.exec(it.g);
  if (m) return m[1] as ModClass;
  return PRICE_CLASS[it.v];
}

const isModule = (it: Item) => it.c === 'Upgrade module' || /Deployable Salvage$/.test(it.g);
/** module whose group, minus the class prefix, is `g` */
const grp = (g: string) => (it: Item) => isModule(it) && it.g.replace(/^(Significant|Powerful|Supreme|Banned) /, '') === g;
/** module whose name, minus "Suspicious ", is `n` (for groups shared by several technologies) */
const named = (n: string) => (it: Item) => isModule(it) && it.n.replace(/^Suspicious /, '') === n;

type Catalog = Record<string, Partial<Record<ModClass, string[]>>>;

function catalog(db: Db, p: Platform, pick: (t: UpTech) => ((it: Item) => boolean) | undefined, cls: (it: Item) => ModClass | undefined): Catalog {
  const out: Catalog = {};
  for (const t of p.techs) {
    const row: Partial<Record<ModClass, string[]>> = {};
    const m = pick(t);
    if (m)
      for (const id of db.ids) {
        const it = db.items[id];
        if (!m(it)) continue;
        const c = cls(it);
        if (c) (row[c] ??= []).push(id);
      }
    out[t.key] = row;
  }
  return out;
}

/** tech key -> class -> item ids (several when one tab covers modules that roll the same, like the fleet bonuses) */
export const upgradeCatalog = (db: Db, p: Platform): Catalog => catalog(db, p, (t) => t.match, classOf);

/** tech key -> class -> salvaged module item ids (the "Tech module" form scrapping gives back) */
export const salvageCatalog = (db: Db, p: Platform): Catalog =>
  catalog(
    db,
    p,
    (t) => {
      if (!t.salvage) return undefined;
      const g = salvageOf(t.salvage);
      return (it) => g(it) && (!t.salvageDesc || t.salvageDesc.test(it.d));
    },
    salvageClass,
  );

const NA = '—';

/**
 * The Sentinel Exosuit Fragment (UP_SNSUIT) and the Autophage Rebuilt Exosuit Module (UP_RBSUIT) roll 2–4 of the
 * same six stats, which span three Exosuit tabs; each tab shows its share (`cols` maps tab stats to ranges).
 */
const SUIT_SPECIAL = (cols: string[]): ExtraRow[] => [
  { label: 'Sentinel Exosuit Fragment', ids: ['prod167'], salvage: ['tMod177'], row: ['2–4', ...cols] },
  { label: 'Rebuilt Exosuit Module', ids: ['other404'], salvage: ['tMod178'], row: ['2–4', ...cols] },
];
const SUIT_SPECIAL_NOTE =
  'The Sentinel Exosuit Fragment (from shattering Salvaged Glass) and the Autophage Rebuilt Exosuit Module roll the same 2–4 stats out of six: shield strength, health, life support tanks, energy regen, sprint distance and jetpack drain. Those span the Defensive Systems, Life Support and Movement System tabs, and each tab shows its share. The ranges match X-class, except jetpack drain, which starts at −5% instead of −10%.';

const EXOSUIT: Platform = {
  key: 'exosuit',
  name: 'Exosuit',
  icon: '🥽',
  where: [
    '<b>B–S</b>: the Exosuit Technology Merchant on any space station. Which classes are stocked changes from system to system.',
    '<b>X (Suspicious)</b>: outlaw stations\' Salvage Dealer. Hazard Protection only comes as X.',
    'Three modules per technology, the same cap as the Multi-Tool. Radiation, Toxic, Heat and Cold protection each have their own three.',
  ],
  techs: [
    {
      key: 'life',
      name: 'Life Support',
      match: grp('Life Support Upgrade'),
      salvage: 'Life Support Upgrade',
      stats: ['Life support tanks', 'Energy regen'],
      rows: {
        B: ['1–2', '+5 to +20%', '1–10%'],
        A: ['2', '+20 to +50%', '1–25%'],
        S: ['2', '+50 to +100%', '25–50%'],
        X: ['2', '+5 to +110%', '1–75%'],
      },
      judge: 'Tank size. S tops out at +100%; X can reach +110% but usually rolls lower.',
      extra: SUIT_SPECIAL(['+5 to +110%', '1–75%']),
      note: 'No C-class Life Support module exists. ' + SUIT_SPECIAL_NOTE,
    },
    {
      key: 'jet',
      name: 'Movement System',
      match: grp('Movement System Upgrade'),
      salvage: 'Movement System Upgrade',
      stats: ['Jetpack tank', 'Sprint distance', 'Sprint recovery', 'Jetpack drain', 'Initial boost', 'Jetpack recharge'],
      rows: {
        C: ['2–3', '0–50%', '+10 to +20%', '1–10%', '−5 to −10%', NA, '1–5%'],
        B: ['2–4', '0–65%', '+10 to +30%', '10–20%', '−10 to −15%', '1–5%', '5–15%'],
        A: ['3–4', '50–120%', '+20 to +50%', '20–30%', '−15 to −20%', '1–10%', '10–30%'],
        S: ['4', '100–135%', '+40 to +50%', '30–50%', '−15 to −25%', '5–15%', '15–35%'],
        X: ['2–4', '0–140%', '+10 to +60%', '1–60%', '−10 to −30%', '1–20%', '5–40%'],
      },
      judge: 'Jetpack tank first, then recharge and drain. Six stats share at most four rolls, so a module that missed the tank is the one to reroll.',
      extra: SUIT_SPECIAL([NA, '+10 to +60%', NA, '−5 to −30%', NA, NA]),
      note: SUIT_SPECIAL_NOTE,
    },
    {
      key: 'shield',
      name: 'Defensive Systems',
      match: grp('Defensive Systems Upgrade'),
      salvage: 'Defence Systems Upgrade',
      stats: ['Shield strength', 'Health'],
      rows: {
        C: ['1–2', '+10 to +15%', '20'],
        B: ['1–2', '+15 to +20%', '20'],
        A: ['2', '+20 to +30%', '20'],
        S: ['2', '+30 to +35%', '20'],
        X: ['2', '+10 to +35%', '20'],
      },
      judge: 'Shield strength is the only stat that varies; health is a flat 20 when it rolls.',
      extra: SUIT_SPECIAL(['+10 to +35%', '20']),
      note: SUIT_SPECIAL_NOTE,
    },
    {
      key: 'hazard',
      name: 'Hazard Protection',
      match: grp('Hazard Protection Upgrade'),
      salvage: 'Hazard Protection Upgrade',
      stats: ['Heat drain', 'Cold drain', 'Radiation drain', 'Toxic drain'],
      rows: { X: ['4', '1–10%', '1–10%', '1–10%', '1–10%'] },
      judge: 'All four always roll; keep the module with the best total, or the best for the hazard you face most.',
      note: 'Suspicious (X) only: there is no C–S Hazard Protection module.',
    },
    {
      key: 'rad',
      name: 'Radiation Protection',
      match: grp('Radiation Protection Upgrade'),
      salvage: 'Radiation Protection Upgrade',
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
      note: 'Toxic, Heat and Cold protection modules roll exactly the same ranges.',
    },
    {
      key: 'tox',
      name: 'Toxic Protection',
      match: grp('Toxic Protection Upgrade'),
      salvage: 'Toxic Protection Upgrade',
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
    },
    {
      key: 'hot',
      name: 'Heat Protection',
      match: grp('Thermal Protection Upgrade'),
      salvage: 'Thermal Protection Upgrade',
      salvageDesc: /high-temperature/,
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
      note: 'Heat and Cold modules are both called "Thermal Protection Module" in the shop; check the group name.',
    },
    {
      key: 'cold',
      name: 'Cold Protection',
      match: grp('Frost Protection Upgrade'),
      salvage: 'Thermal Protection Upgrade',
      salvageDesc: /sub-zero/,
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
    },
    {
      key: 'water',
      name: 'Aeration Membrane',
      // the unprefixed group is B here (no C exists), so the class comes from the price, not the prefix
      match: grp('Underwater Oxygen Upgrade'),
      salvage: 'Underwater Oxygen Upgrade',
      stats: ['Underwater oxygen'],
      rows: { B: ['1', '90–120'], A: ['1', '120–180'], S: ['1', '180–240'] },
      judge: 'One stat; keep the highest.',
    },
  ],
};

/** freighter modules each roll one stat, the same ladder for every fleet bonus */
const fleet = (key: string, name: string, stat: string, items: string[]): UpTech => ({
  key,
  name,
  match: (it) => items.some((n) => named(n)(it)),
  stats: [stat],
  rows: { C: ['1', '1–5%'], B: ['1', '5–10%'], A: ['1', '10–14%'], S: ['1', '15%'] },
  judge: 'One stat. S is fixed at 15% and a top A roll is 14%, so a high A is nearly as good.',
});

const FREIGHTER: Platform = {
  key: 'freighter',
  name: 'Freighter',
  icon: '🛳',
  where: [
    'Freighter modules are <b>salvage</b>, not shop stock: "Salvaged Fleet …" units from frigate expedition rewards and derelict freighters. Install one from your inventory and it becomes the matching module.',
    'Classes run C to S only; there is no Suspicious freighter module.',
    'The fleet bonuses apply to frigate expeditions sent from this freighter.',
  ],
  techs: [
    {
      key: 'fhyper',
      name: 'Freighter Hyperdrive',
      match: named('Salvaged Hyperdrive Upgrade'),
      stats: ['Jump distance', 'Warp cell efficiency'],
      // B is stored as rolling 1–2 stats, but its pool has only jump distance
      rows: { C: ['1', '50–100 ly', NA], B: ['1', '100–150 ly', NA], A: ['2', '150–200 ly', '+100%'], S: ['2', '200–250 ly', '+100%'] },
      judge: 'Jump distance. A and S always add warp cell efficiency, stored the same as on a starship Hyperdrive module.',
    },
    fleet('fspeed', 'Expedition Speed', 'Expedition speed', ['Salvaged Fleet Beacon']),
    {
      key: 'ffuel',
      name: 'Expedition Efficiency',
      match: named('Salvaged Fleet Fuel Unit'),
      stats: ['Expedition fuel cost'],
      rows: { C: ['1', '−1 to −5%'], B: ['1', '−5 to −10%'], A: ['1', '−10 to −15%'], S: ['1', '−15 to −20%'] },
      judge: 'One stat; the more negative, the less fuel each expedition burns.',
    },
    {
      // Expedition Defences, Scientific Control, Mining Control and Trade Control roll identically
      ...fleet('fmission', 'Defences / Scientific / Mining / Trade', 'Expedition bonus', [
        'Salvaged Fleet Combat Unit',
        'Salvaged Fleet Exploration Unit',
        'Salvaged Fleet Mining Unit',
        'Salvaged Fleet Trade Unit',
      ]),
      note: 'Expedition Defences (combat), Scientific Control (exploration), Mining Control (industry) and Trade Control (trade) roll exactly the same ranges; each boosts its own expedition type.',
    },
  ],
};

const DMG_NOTE = 'Damage is the game\'s own flat number, not the percent the module card shows: the card under-reports it (an S Photon Cannon module rolls 20–28 but shows +6–8%).';

const STARSHIP: Platform = {
  key: 'starship',
  name: 'Starship',
  icon: '🚀',
  where: [
    '<b>C–S</b>: the Starship Technology Merchant on any space station. Which classes are stocked changes from system to system.',
    '<b>X (Suspicious)</b>: outlaw stations\' Salvage Dealer. The floor is about C-class and the ceiling beats S on most stats.',
    'Three modules per technology, the same cap as the Multi-Tool.',
  ],
  techs: [
    {
      key: 'pulse',
      name: 'Pulse Engine',
      match: grp('Pulse Engine Upgrade'),
      salvage: 'Pulse Engine Upgrade',
      stats: ['Fuel efficiency', 'Boost', 'Boost manoeuvrability', 'Manoeuvrability'],
      rows: {
        C: ['1–2', '5–10%', '1–10%', '1–7.5%', '0.5%'],
        B: ['2', '10–15%', '10–15%', '1–12%', '0.5%'],
        A: ['2–3', '15–20%', '10–20%', '5–16%', '0.5%'],
        S: ['3', '20%', '10–25%', '5–18%', '0.65%'],
        X: ['2–3', '5–25%', '1–30%', '1–20%', '0.65%'],
      },
      judge: 'Boost, then boost manoeuvrability. Fuel efficiency is fixed at 20% on S.',
      note: 'The small manoeuvrability bonus is fixed per class and comes with every module.',
    },
    {
      key: 'hyper',
      name: 'Hyperdrive',
      match: grp('Hyperdrive Upgrade'),
      salvage: 'Hyperdrive Upgrade',
      stats: ['Jump range', 'Warp cell efficiency'],
      rows: {
        C: ['1', '50–100 ly', NA],
        B: ['1', '115–165 ly', NA],
        A: ['2', '165–220 ly', '+100%'],
        S: ['2', '220–265 ly', '+100%'],
        X: ['1–2', '50–320 ly', '+100%'],
      },
      judge: 'Jump range. A and S always add warp cell efficiency; X only sometimes.',
      note: 'Warp cell efficiency stacks: with one module a jump costs half a cell, with two a third, with three a quarter.',
    },
    {
      key: 'shield',
      name: 'Deflector Shield',
      match: grp('Starship Shield Upgrade'),
      salvage: 'Deflector Shield Upgrade',
      stats: ['Shield strength'],
      rows: { C: ['1', '5–10%'], B: ['1', '5–10%'], A: ['1', '10–20%'], S: ['1', '20%'], X: ['1', '5–25%'] },
      judge: 'One stat, fixed on S, so only X can beat an S module, and only by a little.',
      note: 'These are the game-file values; the module card shows them about 1.5 times higher (S shows +30%). B has the same range as C but rolls toward the top of it.',
    },
    {
      key: 'photon',
      name: 'Photon Cannon',
      match: named('Photon Cannon Module'),
      salvage: 'Photon Cannon Upgrade',
      stats: ['Damage', 'Fire rate', 'Heat dispersion'],
      rows: {
        C: ['1–2', '8–16', '0.1–1.1%', '0.1–1%'],
        B: ['1–2', '12–20', '0.6–1.6%', '1–2%'],
        A: ['2–3', '16–24', '1.6–2.1%', '2–3%'],
        S: ['3', '20–28', '2.1%', '3%'],
        X: ['1–3', '8–32', '0.1–2.6%', '0.1–3.5%'],
      },
      judge: 'Damage: on S it is the only stat that varies.',
      note: DMG_NOTE,
    },
    {
      key: 'phase',
      name: 'Phase Beam',
      match: named('Phase Beam Module'),
      salvage: 'Phase Beam Upgrade',
      stats: ['Damage', 'Heat dispersion'],
      rows: {
        C: ['1–2', '30–40', '10–35%'],
        B: ['1–2', '40–50', '35–55%'],
        A: ['2', '50–60', '55–75%'],
        S: ['2', '60–70', '75–95%'],
        X: ['1–2', '30–80', '10–100%'],
      },
      judge: 'Damage, with heat dispersion close behind for a beam you hold down. A and S always roll both.',
      note: DMG_NOTE,
    },
    {
      key: 'positron',
      name: 'Positron Ejector',
      match: named('Positron Module'),
      salvage: 'Positron Ejector Upgrade',
      stats: ['Damage', 'Fire rate', 'Heat dispersion'],
      rows: {
        C: ['1–2', '1–3', '1–4%', '1–4%'],
        B: ['2–3', '3–5', '4–6%', '4–6%'],
        A: ['3', '5–6', '6–10%', '6–10%'],
        S: ['3', '6–8', '6–10%', '6–10%'],
        X: ['2–3', '2–8', '5–10%', '1–10%'],
      },
      judge: 'Fire rate, then heat. A and S share those ranges, so a well-rolled A is nearly an S.',
      note: DMG_NOTE,
    },
    {
      key: 'infra',
      name: 'Infra-Knife Accelerator',
      match: named('Infra-Knife Module'),
      salvage: 'Infra-Knife Accelerator Upgrade',
      stats: ['Damage', 'Fire rate', 'Heat dispersion'],
      rows: {
        C: ['1–2', '2–6', '1–5%', '1–3%'],
        B: ['2–3', '4–10', '1–5%', '3–5%'],
        A: ['3', '8–12', '5–10%', '5–7%'],
        S: ['3', '10–12', '5–10%', '7–9%'],
        X: ['2–3', '2–14', '1–15%', '1–13%'],
      },
      judge: 'Fire rate; damage barely varies on S.',
      note: DMG_NOTE,
    },
    {
      key: 'cyclotron',
      name: 'Cyclotron Ballista',
      match: named('Cyclotron Module'),
      salvage: 'Cyclotron Ballista Upgrade',
      stats: ['Damage', 'Fire rate', 'Heat dispersion'],
      rows: {
        C: ['1–2', '2–6', '1–5%', '10–20%'],
        B: ['2–3', '4–10', '1–5%', '20–25%'],
        A: ['3', '8–12', '5–10%', '25–30%'],
        S: ['3', '10–12', '10–15%', '30–35%'],
        X: ['2–3', '2–14', '1–20%', '10–40%'],
      },
      judge: 'Fire rate, then heat dispersion. Damage is a small share of this weapon\'s modules.',
      note: DMG_NOTE,
    },
    {
      key: 'launch',
      name: 'Launch Thrusters',
      match: grp('Launch Thrusters Upgrade'),
      salvage: 'Launch Thruster Upgrade',
      stats: ['Launch cost', 'Boost'],
      rows: {
        C: ['1', '−5 to −10%', '1%'],
        B: ['1–2', '−10 to −15%', '2–5%'],
        A: ['1–2', '−15 to −20%', '5–8%'],
        S: ['2', '−20%', '8–10%'],
        X: ['2', '−5 to −25%', '1–10%'],
      },
      judge: 'Below S, launch cost. On S it is fixed at −20%, so judge on boost.',
      note: 'The wiki gives slightly different stat counts (C and X 1–2, B and A always 2).',
    },
  ],
};

const LIVING: Platform = {
  key: 'living',
  name: 'Living Ship',
  icon: '🥚',
  where: [
    'Living ship nodes come from Void Eggs and the Starbirth quest line; you grow a C node into higher classes for 210, 310 and 430 nanites.',
    'There is no Suspicious (X) class for living ships.',
    'Three nodes per technology, the same cap as the other platforms.',
  ],
  techs: [
    {
      key: 'heart',
      name: 'Pulsing Heart',
      match: grp('Pulsing Heart Upgrade'),
      salvage: 'Pulsing Heart Node',
      stats: ['Fuel efficiency', 'Boost', 'Boost manoeuvrability', 'Manoeuvrability'],
      rows: {
        C: ['1–2', '5–10%', '1–10%', '1–7.5%', '0.5%'],
        B: ['2', '10–15%', '10–15%', '1–12%', '0.5%'],
        A: ['2–3', '15–20%', '10–20%', '5–16%', '0.5%'],
        S: ['3', '20%', '10–25%', '5–18%', '0.65%'],
      },
      judge: 'Boost. The pulse engine for living ships, with the same ranges as a starship Pulse Engine.',
    },
    {
      key: 'cortex',
      name: 'Singularity Cortex',
      match: grp('Singularity Cortex Upgrade'),
      salvage: 'Singularity Cortex Node',
      stats: ['Jump range', 'Warp cell efficiency'],
      rows: { C: ['1', '50–100 ly', NA], B: ['1', '115–165 ly', NA], A: ['1', '165–220 ly', '+100%'], S: ['2', '220–265 ly', '+100%'] },
      judge: 'Jump range. Unlike a starship A module, an A node rolls only one stat, so warp cell efficiency is only sure on S.',
    },
    {
      key: 'scream',
      name: 'Scream Suppressor',
      match: named('Scream Suppressor Node'),
      salvage: 'Scream Suppressor Node',
      stats: ['Shield strength'],
      rows: { C: ['1', '5–10%'], B: ['1', '5–10%'], A: ['1', '10–20%'], S: ['1', '20%'] },
      judge: 'One stat, fixed on S. The node card shows it about 1.5 times higher, as for the Deflector Shield.',
    },
    {
      key: 'neural',
      name: 'Neural Assembly',
      match: grp('Neural Assembly Upgrade'),
      salvage: 'Neural Assembly Node',
      stats: ['Launch cost', 'Auto recharge'],
      rows: { C: ['1–2', '−5 to −10%', NA], B: ['1–2', '−10 to −15%', NA], A: ['2', '−15 to −20%', NA], S: ['2', '−20%', 'yes'] },
      judge: 'Get an S: it is the only class with auto-recharging launch thrusters. Launch cost is fixed at −20% there.',
      note: 'The launch thrusters for living ships. Unlike the starship version it has no boost stat.',
    },
    {
      key: 'vents',
      name: 'Spewing Vents',
      match: named('Spewing Vent Node'),
      salvage: 'Spewing Vents Node',
      stats: ['Damage', 'Fire rate', 'Heat dispersion'],
      rows: {
        C: ['1–2', '8–16', '0.1–1.1%', '0.1–1%'],
        B: ['1–2', '12–20', '0.6–1.6%', '1–2%'],
        A: ['2–3', '16–24', '1.6–2.1%', '2–3%'],
        S: ['3', '20–28', '2.1%', '3%'],
      },
      judge: 'Damage. The living ship\'s Photon Cannon, with the same ranges.',
      note: DMG_NOTE,
    },
    {
      key: 'eyes',
      name: 'Grafted Eyes',
      match: named('Grafted Eye Node'),
      salvage: 'Grafted Eyes Node',
      stats: ['Damage', 'Heat dispersion', 'Shield recharge on hit'],
      rows: {
        C: ['1–2', '30–40', '10–35%', '5–10%'],
        B: ['1–2', '40–50', '35–55%', '10–15%'],
        A: ['2', '50–60', '55–75%', '15–20%'],
        S: ['3', '60–70', '75–95%', '20–30%'],
      },
      judge: 'Damage, then shield recharge. The living ship\'s Phase Beam, plus a shield-recharge stat; only S is sure to roll all three.',
      note: DMG_NOTE,
    },
  ],
};

/** the game build the Exocraft rows were read from (exports/modules.json `gameVersion`) */
export const EXPORT_BUILD = 'Steam build 26540391';

/*
 * Exocraft rows, read from the procedural technology table (exports/modules.json). Weapon power efficiency, fire
 * rate and mining laser efficiency are stored below 1 and fall from C to S, so they are shown as 1 − value, like
 * Mining speed on the Multi-Tool. Fuel usage is a cost (−). Boost power, boost tank and acceleration are stored as
 * fractions and shown plain (no +).
 */
const EXO_PRICE = 'C–S modules are priced in nanites: 60 for C, 140 for B, 300 for A and 480 for S.';
const ICARUS = (drive: string) => `The game files list these modules as upgrading the Icarus Fuel System as well as the ${drive}.`;

const CANNON_ROWS: Partial<Record<ModClass, string[]>> = {
  C: ['1–2', '5–10', '1–5%', '1–3%'],
  B: ['2–3', '10–20', '5–10%', '3–5%'],
  A: ['3', '20–30', '10–15%', '5–7%'],
  S: ['3', '30–40', '15–20%', '7–10%'],
};
const LASER_ROWS: Partial<Record<ModClass, string[]>> = {
  C: ['1', '5–10', '1–5%'],
  B: ['1–2', '10–20', '5–10%'],
  A: ['1–2', '20–30', '10–15%'],
  S: ['2', '30–40', '15–20%'],
};
/** the Minotaur has no C class */
const fromB = (r: Partial<Record<ModClass, string[]>>) => ({ B: r.B, A: r.A, S: r.S });

const EXOCRAFT: Platform = {
  key: 'exocraft',
  name: 'Nomad / Roamer / Pilgrim / Colossus',
  noun: 'Nomad, Roamer, Pilgrim and Colossus',
  icon: '🚙',
  where: [EXO_PRICE, 'There is no Suspicious (X) class for these Exocraft.'],
  techs: [
    {
      key: 'cannon',
      name: 'Mounted Cannon',
      match: named('Exocraft Cannon Module'),
      salvage: 'Mounted Cannon Upgrade',
      stats: ['Damage', 'Power efficiency', 'Fire rate'],
      rows: CANNON_ROWS,
      judge: 'Damage. A and S always roll all three stats.',
    },
    {
      key: 'laser',
      name: 'Exocraft Mining Laser',
      match: named('Exocraft Laser Module'),
      salvage: 'Exocraft Mining Laser Upgrade',
      stats: ['Mining laser power', 'Mining laser efficiency'],
      rows: LASER_ROWS,
      judge: 'Mining laser power. Only S is sure to roll both.',
    },
    {
      key: 'boost',
      name: 'Exocraft Boosters',
      match: grp('Exocraft Boost Upgrade'),
      salvage: 'Exocraft Boosters Upgrade',
      stats: ['Boost power', 'Boost tank'],
      rows: {
        C: ['1', '10–20%', '10–20%'],
        B: ['1–2', '20–35%', '15–30%'],
        A: ['1–2', '35–55%', '30–50%'],
        S: ['2', '55–70%', '50–60%'],
      },
      judge: 'Boost power, then tank. Only S always rolls both.',
    },
    {
      key: 'engine',
      name: 'Fusion Engine',
      match: grp('Exocraft Engine Upgrade'),
      salvage: 'Fusion Engine Upgrade',
      stats: ['Fuel usage', 'Top speed'],
      rows: {
        C: ['1', '−1 to −5%', '1–3%'],
        B: ['1–2', '−5 to −10%', '3–8%'],
        A: ['1–2', '−10 to −15%', '8–15%'],
        S: ['2', '−15 to −20%', '10–15%'],
      },
      judge: 'Top speed, then fuel usage. A top speed reaches 15% like S, so a high A matches S there, but A rolls only 1–2 stats, so it may not get top speed.',
      note: ICARUS('Fusion Engine'),
    },
  ],
  blueprints: [
    { id: 'tech91', tech: 'engine', what: 'tuned to help the Exocraft drift' },
    { id: 'tech92', tech: 'engine', what: 'tuned to help the Exocraft turn sharply' },
    { id: 'tech93', tech: 'engine', what: 'tuned to help the Exocraft slide' },
    { id: 'tech99', tech: 'laser', what: '+50 mining laser power' },
    { id: 'tech174', tech: 'all', what: 'the Exocraft Radar also finds Drop Pods, Abandoned Structures and Waste Heaps' },
    { id: 'tech96', tech: 'all', what: 'the Exocraft Radar also finds Trade Outposts, Ruins and Alien Structures' },
  ],
};

const NAUTILON: Platform = {
  key: 'nautilon',
  name: 'Nautilon',
  noun: 'Nautilon',
  icon: '🐟',
  where: [EXO_PRICE, 'There is no Suspicious (X) class for the Nautilon.'],
  techs: [
    {
      key: 'humboldt',
      name: 'Humboldt Drive',
      match: grp('Submarine Drive Upgrade'),
      salvage: 'Humboldt Drive Upgrade',
      stats: ['Fuel usage', 'Top speed', 'Acceleration'],
      rows: {
        C: ['1', '−1 to −10%', '2–4%', '10–15%'],
        B: ['1–2', '−10 to −15%', '4–6%', '15–20%'],
        A: ['2–3', '−15 to −25%', '6–7.5%', '20–25%'],
        S: ['3', '−15 to −30%', '7.5%', '25–30%'],
      },
      judge: 'Fuel usage. S top speed is fixed at 7.5%, and S fuel usage reaches −30%, further than A\'s −25%.',
      note: ICARUS('Humboldt Drive'),
    },
    {
      key: 'subgun',
      name: 'Nautilon Cannon',
      match: grp('Nautilon Cannon Upgrade'),
      salvage: 'Nautilon Cannon Upgrade',
      stats: ['Damage', 'Fire rate'],
      rows: {
        C: ['1', '5–10', '1–3%'],
        B: ['1–2', '10–20', '3–5%'],
        A: ['1–2', '20–30', '5–7%'],
        S: ['2', '30–40', '7–10%'],
      },
      judge: 'Damage. Only S is sure to roll both.',
    },
  ],
  blueprints: [{ id: 'tech105', tech: 'humboldt', what: 'fuel usage −20%, and a slow recharge of the Humboldt Drive in deep water' }],
};

const MINOTAUR: Platform = {
  key: 'minotaur',
  name: 'Minotaur',
  noun: 'Minotaur',
  icon: '🤖',
  where: [
    'B–S modules are priced in nanites: 140 for B, 300 for A and 480 for S.',
    'There is no C or Suspicious (X) class for the Minotaur.',
    'Flamethrower modules have no nanite price. They upgrade the Liquidator Right Arm, which the Quicksilver Synthesis Companion on the Space Anomaly sells for 2,400 Quicksilver.',
  ],
  techs: [
    {
      key: 'mcannon',
      name: 'Minotaur Cannon',
      match: named('Minotaur Cannon Module'),
      salvage: 'Minotaur Cannon Upgrade',
      stats: ['Damage', 'Power efficiency', 'Fire rate'],
      rows: fromB(CANNON_ROWS),
      judge: 'Damage. A and S always roll all three stats.',
      note: 'The same ranges as the Mounted Cannon.',
    },
    {
      key: 'mlaser',
      name: 'Minotaur Laser',
      match: named('Minotaur Laser Module'),
      salvage: 'Minotaur Laser Upgrade',
      stats: ['Mining laser power', 'Mining laser efficiency'],
      rows: fromB(LASER_ROWS),
      judge: 'Mining laser power. Only S is sure to roll both.',
      note: 'The same ranges as the Exocraft Mining Laser.',
    },
    {
      key: 'flame',
      name: 'Minotaur Flamethrower',
      // filed as "Constructed tech" with no price, so isModule doesn't take them
      match: (it) => it.c === 'Constructed tech' && it.n === 'Minotaur Flamethrower Module',
      salvage: 'Minotaur Flamethrower Upgrade',
      stats: ['Damage', 'Power efficiency', 'Fire duration'],
      rows: {
        B: ['1–2', '1', '5–10%', '5–10%'],
        A: ['2–3', '1–2', '10–20%', '10–20%'],
        S: ['3', '2', '20–30%', '20–35%'],
      },
      judge: 'Fire duration and power efficiency. Damage is 1–2 at most, fixed at 2 on S.',
      note: 'These modules upgrade the Liquidator Right Arm, the Minotaur\'s flamethrower.',
    },
    {
      key: 'daedalus',
      name: 'Daedalus Engine',
      match: grp('Minotaur Engine Upgrade'),
      salvage: 'Daedalus Engine Upgrade',
      stats: ['Fuel usage', 'Boost tank'],
      rows: {
        B: ['1', '−5 to −10%', '10–15%'],
        A: ['1–2', '−10 to −15%', '15–25%'],
        S: ['2', '−15 to −20%', '25–30%'],
      },
      judge: 'Fuel usage, then boost tank. Only S always rolls both.',
      note: ICARUS('Daedalus Engine'),
    },
  ],
  blueprints: [
    { id: 'tech176', tech: 'daedalus', what: 'fuel usage −20%' },
    { id: 'tech214', tech: 'daedalus', what: 'fuel usage −10%, boost tank 25%' },
    {
      id: 'tech274',
      tech: 'daedalus',
      what: 'fuel usage −10%, boost tank 25%. The Liquidator Legs item is sold by the Quicksilver Synthesis Companion on the Space Anomaly for 1,000 Quicksilver.',
    },
    { id: 'tech180', tech: 'mlaser', what: '+50 mining laser power' },
    { id: 'tech212', tech: 'mlaser', what: '+50 mining laser power, sets targets on fire, and more damage to stunned targets' },
  ],
};

/** the Ship upgrades page; the Exosuit and the Exocraft have pages of their own */
export const SHIP_PLATFORMS: Platform[] = [STARSHIP, LIVING, FREIGHTER];
export const EXOCRAFT_PLATFORMS: Platform[] = [EXOCRAFT, NAUTILON, MINOTAUR];
export { EXOSUIT };
export const PLATFORMS: Platform[] = [...SHIP_PLATFORMS, EXOSUIT, ...EXOCRAFT_PLATFORMS];

export { MOD_CLASSES };

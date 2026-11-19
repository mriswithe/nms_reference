/**
 * Upgrade-module roll ranges for the starship, living ship, exosuit and freighter, plus which dataset item is
 * which class. The Multi-Tool has its own page (multitool.ts); this reuses its class letters and table shape.
 *
 * Ranges are datamined (nomansskyrecipes.com, Forsaken 7.1, data dated 2026-10-28). That site stores some
 * percentages as "value − 100%" (e.g. Life Support S "−50% → 0%"); those are converted here to what the game
 * shows (+50 to +100%). The Life Support conversion is confirmed against the wiki; sprint distance and
 * shield strength are converted the same way.
 */
import type { Db } from './db';
import type { Item } from './types';
import { MOD_CLASSES, type ModClass, type StatTable } from './multitool';

export interface UpTech extends StatTable {
  key: string;
  name: string;
  /** picks this technology's module items out of the dataset; omitted when the dataset has none */
  match?: (it: Item) => boolean;
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

/** tech key -> class -> item ids (several when one tab covers modules that roll the same, like the fleet bonuses) */
export function upgradeCatalog(db: Db, p: Platform): Record<string, Partial<Record<ModClass, string[]>>> {
  const out: Record<string, Partial<Record<ModClass, string[]>>> = {};
  for (const t of p.techs) {
    const row: Partial<Record<ModClass, string[]>> = {};
    if (t.match)
      for (const id of db.ids) {
        const it = db.items[id];
        if (!t.match(it)) continue;
        const c = classOf(it);
        if (c) (row[c] ??= []).push(id);
      }
    out[t.key] = row;
  }
  return out;
}

const NA = '—';

const EXOSUIT: Platform = {
  key: 'exosuit',
  name: 'Exosuit',
  icon: '🧑‍🚀',
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
      stats: ['Life support tanks', 'Energy regen'],
      rows: {
        B: ['1–2', '+5 to +20%', '1–10%'],
        A: ['2', '+20 to +50%', '1–25%'],
        S: ['2', '+50 to +100%', '25–50%'],
        X: ['2', '+5 to +110%', '1–75%'],
      },
      judge: 'Tank size. S tops out at +100%; X can reach +110% but usually rolls lower.',
      note: 'No C-class Life Support module exists.',
    },
    {
      key: 'jet',
      name: 'Movement System',
      match: grp('Movement System Upgrade'),
      stats: ['Jetpack tank', 'Sprint distance', 'Sprint recovery', 'Jetpack drain', 'Initial boost', 'Jetpack recharge'],
      rows: {
        C: ['2–3', '0–50%', '+10 to +20%', '1–10%', '−5 to −10%', NA, '1–5%'],
        B: ['2–4', '0–65%', '+10 to +30%', '10–20%', '−10 to −15%', '1–5%', '5–15%'],
        A: ['3–4', '50–120%', '+20 to +50%', '20–30%', '−15 to −20%', '1–10%', '10–30%'],
        S: ['4', '100–135%', '+40 to +50%', '30–50%', '−15 to −25%', '5–15%', '15–35%'],
        X: ['2–4', '0–140%', '+10 to +60%', '1–60%', '−10 to −30%', '1–20%', '5–40%'],
      },
      judge: 'Jetpack tank first, then recharge and drain. Six stats share at most four rolls, so a module that missed the tank is the one to reroll.',
    },
    {
      key: 'shield',
      name: 'Defensive Systems',
      match: grp('Defensive Systems Upgrade'),
      stats: ['Shield strength', 'Health'],
      rows: {
        C: ['1–2', '+10 to +15%', '20'],
        B: ['1–2', '+15 to +20%', '20'],
        A: ['2', '+20 to +30%', '20'],
        S: ['2', '+30 to +35%', '20'],
        X: ['2', '+10 to +35%', '20'],
      },
      judge: 'Shield strength is the only stat that varies; health is a flat 20 when it rolls.',
    },
    {
      key: 'hazard',
      name: 'Hazard Protection',
      match: grp('Hazard Protection Upgrade'),
      stats: ['Heat drain', 'Cold drain', 'Radiation drain', 'Toxic drain'],
      rows: { X: ['4', '1–10%', '1–10%', '1–10%', '1–10%'] },
      judge: 'All four always roll; keep the module with the best total, or the best for the hazard you face most.',
      note: 'Suspicious (X) only: there is no C–S Hazard Protection module.',
    },
    {
      key: 'rad',
      name: 'Radiation Protection',
      match: grp('Radiation Protection Upgrade'),
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
      note: 'Toxic, Heat and Cold protection modules roll exactly the same ranges.',
    },
    {
      key: 'tox',
      name: 'Toxic Protection',
      match: grp('Toxic Protection Upgrade'),
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
    },
    {
      key: 'hot',
      name: 'Heat Protection',
      match: grp('Thermal Protection Upgrade'),
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
      note: 'Heat and Cold modules are both called "Thermal Protection Module" in the shop; check the group name.',
    },
    {
      key: 'cold',
      name: 'Cold Protection',
      match: grp('Frost Protection Upgrade'),
      stats: ['Protection', 'Damage taken'],
      rows: { B: ['2', '200–300', '−1 to −5%'], A: ['2', '240–320', '−5 to −15%'], S: ['2', '280–360', '−10 to −20%'] },
      judge: 'Protection (how long the hazard bar lasts). The ranges overlap, so a high A can beat a low S.',
    },
    {
      key: 'water',
      name: 'Aeration Membrane',
      // the unprefixed group is B here (no C exists), so the class comes from the price, not the prefix
      match: grp('Underwater Oxygen Upgrade'),
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
      stats: ['Jump distance'],
      rows: { C: ['1', '50–100 ly'], B: ['1–2', '100–150 ly'], A: ['2', '150–200 ly'], S: ['2', '200–250 ly'] },
      judge: 'Jump distance. A and S also roll a jumps-per-cell stat, but its stored range is zero, so it adds nothing.',
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
      stats: ['Shield strength'],
      rows: { C: ['1', '5–10%'], B: ['1', '5–10%'], A: ['1', '10–20%'], S: ['1', '20%'], X: ['1', '5–25%'] },
      judge: 'One stat, fixed on S, so only X can beat an S module, and only by a little.',
      note: 'These are the game-file values; the module card shows them about 1.5 times higher (S shows +30%). B has the same range as C but rolls toward the top of it.',
    },
    {
      key: 'photon',
      name: 'Photon Cannon',
      match: named('Photon Cannon Module'),
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
      stats: ['Damage', 'Fire rate', 'Heat dispersion'],
      rows: {
        C: ['1–2', '0–2', '1–4%', '1–4%'],
        B: ['2–3', '3–5', '4–6%', '4–6%'],
        A: ['3', '5–6', '6–10%', '6–10%'],
        S: ['3', '6–8', '6–10%', '6–10%'],
        X: ['2–3', '2–8', '5–10%', '1–10%'],
      },
      judge: 'Fire rate, then heat. A and S share those ranges, so a well-rolled A is nearly an S.',
      note: 'C-class damage is stored oddly in the game files (as 0–200%); 0–2 is the best reading of it. ' + DMG_NOTE,
    },
    {
      key: 'infra',
      name: 'Infra-Knife Accelerator',
      match: named('Infra-Knife Module'),
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
      stats: ['Jump range', 'Warp cell efficiency'],
      rows: { C: ['1', '50–100 ly', NA], B: ['1', '115–165 ly', NA], A: ['1', '165–220 ly', '+100%'], S: ['2', '220–265 ly', '+100%'] },
      judge: 'Jump range. Unlike a starship A module, an A node rolls only one stat, so warp cell efficiency is only sure on S.',
    },
    {
      key: 'scream',
      name: 'Scream Suppressor',
      match: named('Scream Suppressor Node'),
      stats: ['Shield strength'],
      rows: { C: ['1', '5–10%'], B: ['1', '5–10%'], A: ['1', '10–20%'], S: ['1', '20%'] },
      judge: 'One stat, fixed on S. The node card shows it about 1.5 times higher, as for the Deflector Shield.',
    },
    {
      key: 'neural',
      name: 'Neural Assembly',
      match: grp('Neural Assembly Upgrade'),
      stats: ['Launch cost', 'Auto recharge'],
      rows: { C: ['1–2', '−5 to −10%', NA], B: ['1–2', '−10 to −15%', NA], A: ['2', '−15 to −20%', NA], S: ['2', '−20%', 'yes'] },
      judge: 'Get an S: it is the only class with auto-recharging launch thrusters. Launch cost is fixed at −20% there.',
      note: 'The launch thrusters for living ships. Unlike the starship version it has no boost stat.',
    },
    {
      key: 'vents',
      name: 'Spewing Vents',
      match: named('Spewing Vent Node'),
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

export const PLATFORMS: Platform[] = [STARSHIP, LIVING, EXOSUIT, FREIGHTER];

export { MOD_CLASSES };

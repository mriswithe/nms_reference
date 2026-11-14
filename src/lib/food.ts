import { fmt } from './format';
import type { Db } from './db';
import type { Dataset, EatEffect, Item } from './types';

/** plain-English text for what eating an item does */
export function eatText(e: EatEffect): string {
  switch (e[0]) {
    case 'life':
      return `Restores ${e[1]}% life support`;
    case 'haz':
      return `Restores ${e[1]}% hazard protection`;
    case 'health':
      return e[1] === e[2] ? `Restores ${e[1]} health` : `Restores ${e[1]}–${e[2]} health`;
    case 'sprint':
      return `${e[1]} seconds of sprint overload`;
    case 'jet':
      return `${e[1]} seconds of jetpack overload`;
  }
}

/**
 * Where a food sits in its stat's min..max range, from its CookingValue. Fitted (least squares) to in-game readings of
 * flora-analysis foods at CookingValue 0.2, 0.66 and 1.0: the position is not the CookingValue itself but roughly
 * 1.15 × CookingValue − 0.106, so low-value foods fall short of the stored minimum and the best ones pass the maximum.
 */
export const position = (cv: number) => Math.max(0, 1.15148 * cv - 0.10558);

/**
 * How far in-game readings stray from the fit, as a shift in position. Foods with the same CookingValue still differ by a
 * fixed per-item amount (−0.025 to +0.043 of the range so far, across flora analysis and sprint distance).
 */
export const POSITION_SPREAD = 0.05;

/** BaseFoodDuration in the gameplay globals; one item lasts this × CookingValue (measured: 2:00 at 0.2, 6:36 at 0.66, 7:30 at 0.75) */
export const BASE_FOOD_SECONDS = 600;

/**
 * Stat value -> the percent the game shows. Analysis rewards (10–60) and small additive stats (Sprint Distance 0.1–0.6)
 * show value × 100: 42.33 is +4,233%, 0.15 is +15%. Multipliers (ranges within 1–3, like Toxic Resistance 1.15–1.5) show
 * the part above 1: Purged Ribs read +54%, which can't be value × 100 there. Stats where lower is better (Mining Speed
 * 0.9 to 0.7) are assumed to show the part below 1; that one is unconfirmed.
 */
export function shown(min: number, max: number, v: number): number {
  if (min >= 1 && max <= 3) return (v - 1) * 100;
  if (max < min) return (1 - v) * 100;
  return v * 100;
}

export interface Ingestor {
  label: string;
  /** percent as the game displays it (see shown) */
  est: number;
  lo: number;
  hi: number;
  /** seconds one item lasts */
  seconds: number;
}

/**
 * Nutrient Ingestor bonus. The game stores a min/max per stat (FoodStatValues) and a CookingValue per food;
 * readings fit min + position(CookingValue) × (max − min), give or take POSITION_SPREAD, shown as a percent by `shown`.
 * The fit is confirmed for Flora Analysis Rewards and Sprint Distance; Toxic Resistance read higher than it predicts
 * (Purged Ribs: +54% against about +41%), so multiplier stats may follow a different curve.
 */
export function ingestor(data: Dataset, it: Item): Ingestor | undefined {
  const s = it.ing && data.fstat?.[it.ing[0]];
  if (!s) return undefined;
  const [label, min, max] = s;
  const cv = it.ing![1];
  const at = (p: number) => shown(min, max, min + Math.max(0, p) * (max - min));
  const p = position(cv);
  const [a, b] = [at(p - POSITION_SPREAD), at(p + POSITION_SPREAD)];
  return {
    label,
    est: at(p),
    lo: Math.min(a, b),
    hi: Math.max(a, b),
    seconds: Math.round(BASE_FOOD_SECONDS * cv),
  };
}

/** ingestor bonus as the game shows it, e.g. +4,233% */
export const pct = (n: number) => `+${fmt(Math.round(n))}%`;

/** m:ss */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------- cooking reference rankings ----------

/** ids of every Nutrient Processor item (raw ingredients and products) */
export const foods = (db: Db) => db.ids.filter((id) => db.items[id].c === 'Cooking');

/** cheapest first: breaks ties so the food you'd lose least by using comes first */
const byValue = (db: Db) => (a: string, b: string) => (db.items[a].v ?? 0) - (db.items[b].v ?? 0);

/** the n most valuable foods to sell */
export const topBySale = (db: Db, n = 10) =>
  foods(db)
    .slice()
    .sort((a, b) => (db.items[b].v ?? 0) - (db.items[a].v ?? 0))
    .slice(0, n);

export const EAT_KINDS: [kind: EatEffect[0], label: string][] = [
  ['life', 'Life support'],
  ['haz', 'Hazard protection'],
  ['health', 'Health'],
  ['sprint', 'Sprint overload'],
  ['jet', 'Jetpack overload'],
];

/** best n foods to eat for each effect kind: biggest amount (health: max, then min), ties cheapest first */
/** how big an eat effect is, for ranking foods of the same kind */
const size = (e: EatEffect) => (e[0] === 'health' ? e[2] * 1000 + e[1] : e[1]);

export function topEaten(db: Db, n = 3): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [kind] of EAT_KINDS)
    out[kind] = foods(db)
      .filter((id) => db.items[id].eat?.[0] === kind)
      .sort((a, b) => size(db.items[b].eat!) - size(db.items[a].eat!) || byValue(db)(a, b))
      .slice(0, n);
  return out;
}

/** a food's ingestor bonus for ranking */
export const ingestorValue = (g: Ingestor) => g.est;

/**
 * best n foods for each ingestor stat, biggest shown bonus first (`shown` already turns lower-is-better stats into
 * bigger-is-better percents), ties cheapest first. Stats are in the order the dataset lists them.
 */
export function topIngestor(db: Db, n = 3): [stat: string, ids: string[]][] {
  const out: [string, string[]][] = [];
  for (const stat of Object.keys(db.data.fstat ?? {})) {
    const val = (id: string) => ingestorValue(ingestor(db.data, db.items[id])!);
    const ids = foods(db)
      .filter((id) => db.items[id].ing?.[0] === stat)
      .sort((a, b) => val(b) - val(a) || byValue(db)(a, b))
      .slice(0, n);
    if (ids.length) out.push([stat, ids]);
  }
  return out;
}

/** ingestor bonuses grouped for the cooking reference picker; keys are Dataset.fstat stats */
export const STAT_GROUPS: [group: string, stats: string[]][] = [
  ['Scanning', ['Weapon_Scan_Discovery_Flora', 'Weapon_Scan_Discovery_Creature', 'Weapon_Scan_Discovery_Mineral', 'Weapon_Scan_Recharge_Time']],
  ['Mining', ['Weapon_Laser_MiningBonus', 'Weapon_Laser_Mining_Speed']],
  [
    'Protection',
    [
      'Suit_Protection',
      'Suit_Protection_HeatDrain',
      'Suit_Protection_ColdDrain',
      'Suit_Protection_ToxDrain',
      'Suit_Protection_RadDrain',
      'Suit_Protection_WaterDrain',
      'Suit_Armour_Shield_Strength',
    ],
  ],
  ['Movement', ['Suit_Stamina_Strength', 'Suit_Stamina_Recovery', 'Suit_Jetpack_Tank']],
  ['Life support and other', ['Suit_Energy', 'Suit_Energy_Regen', 'Suit_AutoTranslator']],
];

export interface Tier {
  /** estimated bonus percent */
  value: number;
  seconds: number;
  /** foods sharing this exact bonus and duration, cheapest first */
  ids: string[];
}

/** a food's level among the distinct amounts foods give for the same effect, best first */
export interface Rank {
  /** 1 = the biggest amount */
  rank: number;
  /** how many distinct amounts there are */
  of: number;
  /** foods giving this exact amount, this one included */
  shared: number;
  /** foods with this effect in total */
  foods: number;
}

function rankIn(ids: string[], val: (id: string) => number, id: string): Rank | undefined {
  if (!ids.includes(id)) return undefined;
  const v = val(id);
  const levels = [...new Set(ids.map(val))].sort((a, b) => b - a);
  return { rank: levels.indexOf(v) + 1, of: levels.length, shared: ids.filter((x) => val(x) === v).length, foods: ids.length };
}

/** where a food's eat effect ranks among foods with the same kind of effect */
export function eatRank(db: Db, id: string): Rank | undefined {
  const e = db.items[id].eat;
  return e && rankIn(topEaten(db, Infinity)[e[0]] ?? [], (x) => size(db.items[x].eat!), id);
}

/** where a food's ingestor bonus ranks among foods for the same stat (by the rounded estimate shown) */
export function ingestorRank(db: Db, id: string): Rank | undefined {
  const stat = db.items[id].ing?.[0];
  return stat === undefined ? undefined : rankIn(rankedIngestor(db, stat), (x) => Math.round(ingestorValue(ingestor(db.data, db.items[x])!)), id);
}

/** every food for one ingestor stat, best first (see topIngestor for the order) */
export const rankedIngestor = (db: Db, stat: string) => topIngestor(db, Infinity).find(([s]) => s === stat)?.[1] ?? [];

/**
 * Groups ranked foods into tiers: consecutive foods with the same estimated bonus and duration share one tier
 * (estimates can't tell apart foods with the same cooking value).
 */
export function tiers(db: Db, ids: string[]): Tier[] {
  const out: Tier[] = [];
  for (const id of ids) {
    const g = ingestor(db.data, db.items[id])!;
    const value = Math.round(ingestorValue(g));
    const last = out[out.length - 1];
    if (last && last.value === value && last.seconds === g.seconds) last.ids.push(id);
    else out.push({ value, seconds: g.seconds, ids: [id] });
  }
  return out;
}

export const PAGE_SIZE = 10;

/** one page of a ranked list: the slice, its 0-based start, and the clamped page number */
export function page<T>(list: T[], n: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(0, n), pages - 1);
  return { items: list.slice(p * size, p * size + size), start: p * size, page: p, pages, total: list.length };
}

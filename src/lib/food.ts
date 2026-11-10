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

/** BaseFoodDuration in the gameplay globals; one item lasts this × CookingValue (measured: 2:00 at 0.2, 6:36 at 0.66) */
export const BASE_FOOD_SECONDS = 600;

export interface Ingestor {
  label: string;
  /** percent as the game displays it (stat value × 100) */
  est: number;
  lo: number;
  hi: number;
  /** measured in game, when curated */
  measured?: number;
  /** seconds one item lasts */
  seconds: number;
}

/**
 * Nutrient Ingestor bonus. The game stores a min/max per stat (FoodStatValues) and a CookingValue per food;
 * readings fit min + position(CookingValue) × (max − min), give or take POSITION_SPREAD, and the game shows the value
 * × 100 as a percent. Both are confirmed against in-game readings only for Flora Analysis Rewards and Sprint Distance.
 */
export function ingestor(data: Dataset, it: Item): Ingestor | undefined {
  const s = it.ing && data.fstat?.[it.ing[0]];
  if (!s) return undefined;
  const [label, min, max] = s;
  const cv = it.ing![1];
  const at = (p: number) => (min + Math.max(0, p) * (max - min)) * 100;
  const p = position(cv);
  const [a, b] = [at(p - POSITION_SPREAD), at(p + POSITION_SPREAD)];
  return {
    label,
    est: at(p),
    // ranges that run high to low (lower is better) keep lo <= hi
    lo: Math.min(a, b),
    hi: Math.max(a, b),
    measured: it.ingM,
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
export function topEaten(db: Db, n = 3): Record<string, string[]> {
  const size = (e: EatEffect) => (e[0] === 'health' ? e[2] * 1000 + e[1] : e[1]);
  const out: Record<string, string[]> = {};
  for (const [kind] of EAT_KINDS)
    out[kind] = foods(db)
      .filter((id) => db.items[id].eat?.[0] === kind)
      .sort((a, b) => size(db.items[b].eat!) - size(db.items[a].eat!) || byValue(db)(a, b))
      .slice(0, n);
  return out;
}

/** a food's ingestor bonus for ranking: the in-game reading when measured, else the estimate */
export const ingestorValue = (g: Ingestor) => g.measured ?? g.est;

/**
 * best n foods for each ingestor stat, by measured-or-estimated bonus (lower wins for stats whose range runs high to
 * low, like Mining Speed), ties cheapest first. Stats are in the order the dataset lists them.
 */
export function topIngestor(db: Db, n = 3): [stat: string, ids: string[]][] {
  const out: [string, string[]][] = [];
  for (const [stat, [, min, max]] of Object.entries(db.data.fstat ?? {})) {
    const dir = max >= min ? 1 : -1;
    const val = (id: string) => ingestorValue(ingestor(db.data, db.items[id])!);
    const ids = foods(db)
      .filter((id) => db.items[id].ing?.[0] === stat)
      .sort((a, b) => dir * (val(b) - val(a)) || byValue(db)(a, b))
      .slice(0, n);
    if (ids.length) out.push([stat, ids]);
  }
  return out;
}

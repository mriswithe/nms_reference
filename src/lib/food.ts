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

/** BaseFoodDuration in the gameplay globals; one item lasts about this × CookingValue (2:00 measured at 0.2) */
export const BASE_FOOD_SECONDS = 600;

export interface Ingestor {
  label: string;
  /** percent as the game displays it (stat value × 100) */
  est: number;
  lo: number;
  hi: number;
  /** measured in game, when curated */
  measured?: number;
  /** estimated seconds one item lasts */
  seconds: number;
}

/**
 * Nutrient Ingestor bonus. The game stores a min/max per stat (FoodStatValues) and a CookingValue per food;
 * readings fit min + position(CookingValue) × (max − min), give or take POSITION_SPREAD, and the game shows the value
 * × 100 as a percent. Both are confirmed only for the stats in VERIFIED_STATS.
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

/** m:ss */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** stats whose ingestor display has been checked against in-game readings */
export const VERIFIED_STATS = new Set([
  'Weapon_Scan_Discovery_Flora',
  'Weapon_Scan_Discovery_Creature',
  'Weapon_Scan_Discovery_Mineral',
  'Suit_Stamina_Strength',
]);

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
 * How far in-game readings stray from the fit. Foods with the same CookingValue still differ by a fixed per-item factor
 * (0.968–1.047 of the fit so far), so estimates are shown as a ±5% range.
 */
export const INGESTOR_SPREAD = 0.05;

export interface Ingestor {
  label: string;
  /** percent as the game displays it (stat value × 100) */
  est: number;
  lo: number;
  hi: number;
  /** measured in game, when curated */
  measured?: number;
}

/**
 * Nutrient Ingestor bonus. The game stores a min/max per stat (FoodStatValues) and a CookingValue per food;
 * readings for the analysis-reward stats fit min + position(CookingValue) × (max − min), give or take INGESTOR_SPREAD.
 * The fit and the display (value × 100 as a percent) are only confirmed for the analysis-reward stats.
 */
export function ingestor(data: Dataset, it: Item): Ingestor | undefined {
  const s = it.ing && data.fstat?.[it.ing[0]];
  if (!s) return undefined;
  const [label, min, max] = s;
  const est = (min + position(it.ing![1]) * (max - min)) * 100;
  return { label, est, lo: est * (1 - INGESTOR_SPREAD), hi: est * (1 + INGESTOR_SPREAD), measured: it.ingM };
}

/** stats whose ingestor display has been checked against in-game readings */
export const VERIFIED_STATS = new Set(['Weapon_Scan_Discovery_Flora', 'Weapon_Scan_Discovery_Creature', 'Weapon_Scan_Discovery_Mineral']);

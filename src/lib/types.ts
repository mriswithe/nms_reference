/**
 * Shape of src/data/nms.json. Keys are kept terse because the whole file ships to the browser.
 */

/** [item id, quantity] */
export type Qty = [id: string, qty: number];

export interface Item {
  /** name */
  n: string;
  /** group, e.g. "Unrefined Organic Element" */
  g: string;
  /** category, e.g. "Raw material" */
  c: string;
  /** in-game description */
  d: string;
  /** colour, hex without '#' (may include alpha) */
  col: string;
  /** base value */
  v: number;
  /** currency of the base value ("Credits", "None", ...) */
  cur: string;
  /** abbreviation shown in the swatch (raw materials only) */
  ab?: string;
  /** where to find / gather it */
  ob?: string[];
  /** where to buy it */
  buy?: string[];
  /** crafting requirements */
  rq?: Qty[];
  /** crafting yield (items per craft) */
  q?: number;
  /** curated note */
  note?: string;
  /** what eating it does, from the game's reward table (see scripts/food-effects.mjs) */
  eat?: EatEffect;
  /** Nutrient Ingestor bonus: [stat key in Dataset.fstat, CookingValue 0..1] */
  ing?: [stat: string, cookingValue: number];
  /** curated: Nutrient Ingestor bonus measured in game, in percent as the game shows it */
  ingM?: number;
}

/**
 * life / haz: percent restored; health: min and max restored; sprint / jet: seconds of overload
 */
export type EatEffect =
  | [kind: 'life' | 'haz', amount: number]
  | [kind: 'health', min: number, max: number]
  | [kind: 'sprint' | 'jet', seconds: number];

/** Refiner or Nutrient Processor recipe: [inputs, output, seconds, operation name] */
export type Recipe = [inputs: Qty[], output: Qty, time: number, op: string];

export interface Dataset {
  items: Record<string, Item>;
  /** refiner recipes */
  ref: Recipe[];
  /** Nutrient Processor (cooking) recipes */
  cook: Recipe[];
  /** Nutrient Ingestor stats: key -> [English label, value at CookingValue 0, value at CookingValue 1] */
  fstat?: Record<string, [label: string, min: number, max: number]>;
  /** ids with an icon in public/icons (added at build time, absent in nms.json) */
  icons?: string[];
}

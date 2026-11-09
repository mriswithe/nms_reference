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
}

/** Refiner or Nutrient Processor recipe: [inputs, output, seconds, operation name] */
export type Recipe = [inputs: Qty[], output: Qty, time: number, op: string];

export interface Dataset {
  items: Record<string, Item>;
  /** refiner recipes */
  ref: Recipe[];
  /** Nutrient Processor (cooking) recipes */
  cook: Recipe[];
}

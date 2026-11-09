import type { Db } from './db';

/** refiner outputs in these groups are intermediate products, not consumables */
const NOT_CONSUMABLE = new Set(['Alloy Metal', 'Enhanced Gas Product', 'Advanced Agricultural Product']);

/** non-raw items a refiner can produce, sorted by group then name */
export function refinableConsumables(db: Db): string[] {
  const I = db.items;
  return [...new Set(db.data.ref.map((r) => r[1][0]))]
    .filter((id) => !id.startsWith('raw') && !NOT_CONSUMABLE.has(I[id].g))
    .sort((a, b) => I[a].g.localeCompare(I[b].g) || I[a].n.localeCompare(I[b].n));
}

/** refiner size needed for a recipe with this many inputs */
export const refinerSize = (inputs: number) =>
  inputs === 1 ? 'Portable refiner' : inputs === 2 ? 'Medium refiner' : 'Large refiner';

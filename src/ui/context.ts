import { CostModel } from '../lib/cost';
import { buildFamilies, type Family } from '../lib/cycles';
import { createDb, type Db } from '../lib/db';
import type { Dataset } from '../lib/types';

export interface UiState {
  refSort: 'fewest' | 'yield';
  treeMode: 'craft' | 'smart';
  /** list keys the user expanded with "Show all" */
  expanded: Set<string>;
  /** per-family route-finder selection */
  routes: Record<string, { a: string; b: string }>;
  /** cycle cards the user opened */
  openCycles: Set<string>;
}

export interface Ctx {
  db: Db;
  cost: CostModel;
  families: Family[];
  state: UiState;
}

export function createCtx(data: Dataset): Ctx {
  const db = createDb(data);
  return {
    db,
    cost: new CostModel(db),
    families: buildFamilies(db),
    state: { refSort: 'fewest', treeMode: 'craft', expanded: new Set(), routes: {}, openCycles: new Set() },
  };
}

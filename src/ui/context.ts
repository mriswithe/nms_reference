import { sourcing, type Sourcing } from '../lib/sourcing';
import { CostModel } from '../lib/cost';
import { buildFamilies, type Family } from '../lib/cycles';
import { createDb, type Db } from '../lib/db';
import type { Dataset } from '../lib/types';

export interface UiState {
  refSort: 'fewest' | 'yield';
  treeMode: 'craft' | 'smart';
  /** "one of" / "any 2 of" chips the user expanded */
  expanded: Set<string>;
  /** per-family route-finder selection */
  routes: Record<string, { a: string; b: string }>;
  /** cycle cards the user opened */
  openCycles: Set<string>;
  /** ingestor bonus shown on the cooking reference page */
  cookStat: string;
  /** eat effect shown on the cooking reference page */
  cookEat: string;
  /** cooking reference page number per list: "sale", "eat", "ing:<stat>" */
  cookPage: Record<string, number>;
}

export interface Ctx {
  db: Db;
  cost: CostModel;
  families: Family[];
  state: UiState;
  /** ids that have an icon file */
  icons: Set<string>;
  /** items only obtainable from creatures / from wild, unfarmable plants */
  src: Sourcing;
}

export function createCtx(data: Dataset): Ctx {
  const db = createDb(data);
  return {
    db,
    cost: new CostModel(db),
    families: buildFamilies(db),
    icons: new Set(data.icons ?? []),
    src: sourcing(db),
    state: { refSort: 'fewest', treeMode: 'craft', expanded: new Set(), routes: {}, openCycles: new Set(), cookStat: 'Weapon_Scan_Discovery_Flora', cookEat: 'life', cookPage: {} },
  };
}

/** Click-to-sort tables: sort keys and ordering, kept free of the DOM so they can be tested. */

/** the column a table is sorted on; 1 ascending, -1 descending */
export interface TableSort {
  col: number;
  dir: 1 | -1;
}

/** a cell's sort value; null (an empty cell or "—") always sorts last */
export type SortKey = number | string | null;

const NUM = /[−-]?\d[\d,]*(?:\.\d+)?/;

/** the first number in a cell's text: "≈ 12%" → 12, "−30 to −50%" → −30, "10,000" → 10000, "1:30" → 90 (a clock) */
export function numKey(text: string): number | null {
  const clock = /^(\d+):(\d\d)$/.exec(text.trim());
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const m = NUM.exec(text);
  return m ? Number(m[0].replace('−', '-').replaceAll(',', '')) : null;
}

/** a cell's key from its text: numbers for numeric columns, trimmed text otherwise */
export function textKey(text: string, numeric: boolean): SortKey {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t === '—') return null;
  return numeric ? numKey(t) : t;
}

export function compareKeys(a: SortKey, b: SortKey, dir: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * dir;
}

/** `list` ordered by column `sort.col` (keyed by `keys[col]`), or unchanged with no sort; stable, so ties keep their order */
export function sortRows<T>(list: T[], sort: TableSort | undefined, keys: ((row: T) => SortKey)[]): T[] {
  const key = sort && keys[sort.col];
  if (!key) return list;
  const k = list.map((row, i) => ({ row, i, v: key(row) }));
  k.sort((a, b) => compareKeys(a.v, b.v, sort.dir) || a.i - b.i);
  return k.map((x) => x.row);
}

/** the next state on clicking a column head: ascending, then descending, then back to the table's own order */
export function nextSort(cur: TableSort | undefined, col: number): TableSort | undefined {
  if (!cur || cur.col !== col) return { col, dir: 1 };
  return cur.dir === 1 ? { col, dir: -1 } : undefined;
}

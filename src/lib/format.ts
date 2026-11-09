import type { Item } from './types';

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** swatch label: explicit abbreviation, else initials of the first two words */
export const abbr = (it: Item) =>
  it.ab ||
  it.n
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export const color = (it: Item) => (it.col ? '#' + it.col.slice(0, 6) : '#56657a');

export const fmt = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

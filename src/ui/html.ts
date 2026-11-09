/** Small HTML-string building blocks shared by every view. */
import type { Cheaper } from '../lib/cost';
import { abbr, color, esc, fmt } from '../lib/format';
import type { Qty, Recipe } from '../lib/types';
import type { Ctx } from './context';

export function swatch(ctx: Ctx, id: string, cls = '') {
  const it = ctx.db.items[id];
  return `<span class="sw ${cls}" style="background:${color(it)}" aria-hidden="true">${esc(abbr(it))}</span>`;
}

/** clickable item chip; `q` shows a quantity, `self` marks the item currently being viewed */
export function chip(ctx: Ctx, id: string, q?: number | string | null, self = false) {
  const it = ctx.db.items[id];
  return `<button class="chip${self ? ' self' : ''}" data-go="${id}" title="${esc(it.g)}">${swatch(ctx, id, 'sm')}${
    q != null ? `<span class="q">${q}×</span>` : ''
  }${esc(it.n)}</button>`;
}

export const chips = (ctx: Ctx, list: Qty[], sep = '<span class="plus">+</span>') =>
  list.map(([i, q]) => chip(ctx, i, q)).join(sep);

/** one recipe as `a + b → c   op · time`; `extraOp` is prepended inside the right-hand note */
export function recipeRow(ctx: Ctx, r: Recipe, selfId: string | null, extraOp = '', rowStyle = '') {
  const [ins, [oid, oq], t, op] = r;
  const left = ins.map(([i, q]) => chip(ctx, i, q, i === selfId)).join('<span class="plus">+</span>');
  return `<div class="row"${rowStyle ? ` style="${rowStyle}"` : ''}>${left}<span class="arrow">→</span>${chip(
    ctx,
    oid,
    oq,
    oid === selfId,
  )}<span class="op">${extraOp}${esc(op)}${t ? ` · ${fmt(t)}s` : ''}</span></div>`;
}

/** show the first `n` rows with a "Show all" toggle, remembered under `key` */
export function limited(ctx: Ctx, rows: string[], key: string, n = 8) {
  if (rows.length <= n) return rows.join('');
  if (ctx.state.expanded.has(key)) return rows.join('') + `<button class="more" data-less="${esc(key)}">Show fewer</button>`;
  return rows.slice(0, n).join('') + `<button class="more" data-more="${esc(key)}">Show all ${rows.length}</button>`;
}

export const refineBadge = (ch: Cheaper | null) =>
  ch
    ? `<span class="tag t-refine badge" title="Refining uses about ${fmt(Math.round(ch.refine))} units of raw value per item vs ${fmt(
        Math.round(ch.craft),
      )} to craft">Refine −${ch.pct}%</span>`
    : '';

export const pageHead = (icon: string, bg: string, title: string, sub: string) =>
  `<div class="head"><span class="sw" style="background:${bg}" aria-hidden="true">${icon}</span><div><h2>${esc(
    title,
  )}</h2><div class="sub">${esc(sub)}</div></div></div>`;

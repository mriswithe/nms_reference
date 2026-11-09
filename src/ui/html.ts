/** Small HTML-string building blocks shared by every view. */
import type { Cheaper } from '../lib/cost';
import { abbr, color, esc, fmt } from '../lib/format';
import type { Pool, RecipeGroup } from '../lib/group';
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

/** slots with more options than this collapse to a "one of N" toggle */
const INLINE_ALTS = 3;

/** "any 2 different of N" toggle; its options and the doubles note open below the row */
function poolSlot(ctx: Ctx, p: Pool, selfId: string | null, key: string, below: string[]) {
  const k = `${key}:pool`;
  const open = ctx.state.expanded.has(k);
  if (open) {
    const names = (qs: Qty[]) => qs.map(([i]) => esc(ctx.db.items[i].n)).join(', ');
    const missing = p.opts.filter((o) => !p.doubles.includes(o));
    const twice = !p.doubles.length
      ? 'The same ingredient twice does not work.'
      : !missing.length
        ? 'The same ingredient twice also works.'
        : `The same ingredient twice also works, except ${names(missing)}.`;
    below.push(
      `<div class="altlist"><span class="note">Any two different:</span>${p.opts
        .map(([i, q]) => chip(ctx, i, q, i === selfId))
        .join('')}<span class="note twice">${twice}</span></div>`,
    );
  }
  const hasSelf = p.opts.some(([i]) => i === selfId);
  return `<button class="chip oneof${hasSelf ? ' self' : ''}" data-${open ? 'less' : 'more'}="${esc(k)}" aria-expanded="${open}">any 2 of ${
    p.opts.length
  } <span aria-hidden="true">${open ? '▴' : '▾'}</span></button>`;
}

/**
 * one grouped recipe row: slots with several options read "Carbon or Condensed Carbon"; big slots collapse
 * to a "one of N" toggle whose options open on a line below, remembered under `key`
 */
export function groupRow(ctx: Ctx, g: RecipeGroup, selfId: string | null, key: string) {
  const below: string[] = [];
  const slot = (s: RecipeGroup['slots'][number], si: number) => {
    const c = s.opts.map(([i, q]) => chip(ctx, i, q, i === selfId));
    if (c.length === 1) return c[0];
    if (c.length <= INLINE_ALTS) return `<span class="alts">${c.join('<span class="or">or</span>')}</span>`;
    const k = `${key}:${si}`;
    const open = ctx.state.expanded.has(k);
    if (open) below.push(`<div class="altlist"><span class="note">Any one of:</span>${c.join('')}</div>`);
    const hasSelf = s.opts.some(([i]) => i === selfId);
    return `<button class="chip oneof${hasSelf ? ' self' : ''}" data-${open ? 'less' : 'more'}="${esc(k)}" aria-expanded="${open}">one of ${
      c.length
    } <span aria-hidden="true">${open ? '▴' : '▾'}</span></button>`;
  };
  const left = g.pool ? poolSlot(ctx, g.pool, selfId, key, below) : g.slots.map(slot).join('<span class="plus">+</span>');
  const n = g.recipes.length;
  return `<div class="row">${left}<span class="arrow">→</span>${chip(ctx, g.out[0], g.out[1], g.out[0] === selfId)}<span class="op">${esc(
    g.op,
  )}${g.time ? ` · ${fmt(g.time)}s` : ''}${n > 1 ? ` · <span class="n">${n} recipes</span>` : ''}</span>${below.join('')}</div>`;
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

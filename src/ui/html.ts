/** Small HTML-string building blocks shared by every view. */
import type { Cheaper } from '../lib/cost';
import { abbr, color, esc, fmt } from '../lib/format';
import { byTier, rowCost, TIER_LABEL } from '../lib/sourcing';
import type { Pool, RecipeGroup } from '../lib/group';
import type { Qty, Recipe } from '../lib/types';
import type { Ctx } from './context';

const ICONS = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}icons/`;

export function swatch(ctx: Ctx, id: string, cls = '') {
  const it = ctx.db.items[id];
  if (ctx.icons.has(id))
    return `<span class="sw icon ${cls}" aria-hidden="true"><img src="${ICONS}${esc(id)}.webp" alt="" loading="lazy" decoding="async"></span>`;
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

/** an expanded option list, one line per tier (makeable / wild-only / creatures only) when they differ */
function tierList(ctx: Ctx, opts: Qty[], selfId: string | null, title: string, extra = '') {
  const tiers = byTier(opts, ctx.src);
  const line = (qs: Qty[]) => `<span class="tc">${qs.map(([i, q]) => chip(ctx, i, q, i === selfId)).join('')}</span>`;
  const body =
    tiers.length === 1
      ? `<div class="tier">${line(tiers[0][1])}</div>`
      : tiers.map(([t, qs]) => `<div class="tier"><span class="tl"${
              t === 'free' ? ' title="Can be made without creatures or wild-only plants; fewest refiner / processor steps first"' : ''
            }>${TIER_LABEL[t]}</span>${line(qs)}</div>`).join('');
  return `<div class="altlist"><span class="note">${title}</span>${body}${extra}</div>`;
}

/** "any 2 of N" toggle; its options and the doubles note open below the row */
function poolSlot(ctx: Ctx, p: Pool, selfId: string | null, key: string, below: string[]) {
  const k = `${key}:pool`;
  const open = ctx.state.expanded.has(k);
  if (open) {
    const names = (qs: Qty[]) => qs.map(([i]) => esc(ctx.db.items[i].n)).join(', ');
    const missing = p.opts.filter((o) => !p.doubles.includes(o));
    // headline matches the common case; the note spells out doubles
    const title = p.doubles.length ? 'Any two, the same one twice included:' : 'Any two different:';
    const twice = !p.doubles.length
      ? 'The same ingredient twice does not work.'
      : !missing.length
        ? ''
        : `Except ${names(missing)}, which can't be used twice.`;
    below.push(tierList(ctx, p.opts, selfId, title, twice && `<span class="note twice">${twice}</span>`));
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
    if (open) below.push(tierList(ctx, s.opts, selfId, 'Any one of:'));
    const hasSelf = s.opts.some(([i]) => i === selfId);
    return `<button class="chip oneof${hasSelf ? ' self' : ''}" data-${open ? 'less' : 'more'}="${esc(k)}" aria-expanded="${open}">one of ${
      c.length
    } <span aria-hidden="true">${open ? '▴' : '▾'}</span></button>`;
  };
  const left = g.pool ? poolSlot(ctx, g.pool, selfId, key, below) : g.slots.map(slot).join('<span class="plus">+</span>');
  const n = g.recipes.length;
  const cost = rowCost(g, ctx.src);
  const s = (k: number) => (k > 1 ? 's' : '');
  const paw =
    (cost.animal
      ? `<span class="an" title="Needs at least ${fmt(cost.animal)} creature-only ingredient${s(cost.animal)} across the whole recipe tree">🐾 ${fmt(cost.animal)}</span> · `
      : '') +
    (cost.wild
      ? `<span class="an" title="Needs at least ${fmt(cost.wild)} wild-only plant${s(cost.wild)} (can't be farmed) across the whole recipe tree">🌿 ${fmt(cost.wild)}</span> · `
      : '');
  return `<div class="row">${left}<span class="arrow">→</span>${chip(ctx, g.out[0], g.out[1], g.out[0] === selfId)}<span class="op">${paw}${esc(
    g.op,
  )}${g.time ? ` · ${fmt(g.time)}s` : ''}${n > 1 ? ` · <span class="n">${n} recipes</span>` : ''}</span>${below.join('')}</div>`;
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

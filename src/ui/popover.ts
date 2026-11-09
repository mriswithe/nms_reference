/**
 * Hover / focus popover on item chips summarising where an item comes from: find, buy, craft, refine, cook.
 * Read-only text (no buttons inside), so it never traps focus; clicking the chip still opens the full page.
 */
import { byTier, rankRows, TIER_LABEL } from '../lib/sourcing';
import { groupRecipes, type RecipeGroup } from '../lib/group';
import { esc, fmt } from '../lib/format';
import type { Qty, Recipe } from '../lib/types';
import type { Ctx } from './context';
import { swatch } from './html';

const SHOW_DELAY = 300;
const MAX_LINES = 2;

const name = (ctx: Ctx, [id, q]: Qty) => `<span class="pi">${swatch(ctx, id, 'xs')}${q > 1 ? `${fmt(q)}× ` : ''}${esc(ctx.db.items[id].n)}</span>`;
const plus = '<span class="pp">+</span>';

const recipeLine = (ctx: Ctx, r: Recipe) => r[0].map((q) => name(ctx, q)).join(plus) + (r[1][1] > 1 ? ` <span class="pq">→ ${fmt(r[1][1])}</span>` : '');

/** most options listed under a big slot before "+N more" */
const MAX_OPTS = 10;

/** indented list of a big slot's options, grouped by tier when they differ; at most MAX_OPTS names in total */
function optList(ctx: Ctx, opts: Qty[]) {
  const tiers = byTier(opts, ctx.src);
  let left = MAX_OPTS;
  const lines = tiers.map(([t, qs]) => {
    const shown = qs.slice(0, Math.max(0, left));
    left -= shown.length;
    const more = qs.length - shown.length;
    const label = tiers.length > 1 ? `<span class="ptl">${TIER_LABEL[t]}</span>` : '';
    return `<div class="ptier">${label}${shown.map((q) => name(ctx, q)).join('')}${more ? `<span class="pmore">+${more} more</span>` : ''}</div>`;
  });
  return `<div class="popts">${lines.join('')}</div>`;
}

/** a grouped cooking row: small slots inline ("A or B"), big slots and pools as a labelled list of their options */
function groupLine(ctx: Ctx, g: RecipeGroup) {
  if (g.pool) {
    const { opts, doubles } = g.pool;
    const missing = opts.filter((o) => !doubles.includes(o));
    const note = !doubles.length
      ? 'not the same one twice'
      : missing.length
        ? `same one twice works, except ${missing.map(([i]) => esc(ctx.db.items[i].n)).join(', ')}`
        : 'same one twice works';
    return `<span class="pi">Any 2 different of:</span>${optList(ctx, opts)}<div class="pnote">${note}</div>`;
  }
  const lists: string[] = [];
  const slot = (opts: Qty[]) => {
    if (opts.length <= 3) return opts.map((q) => name(ctx, q)).join('<span class="pp">or</span>');
    lists.push(optList(ctx, opts));
    return `<span class="pi">one of ${opts.length} ↓</span>`;
  };
  return g.slots.map((s) => slot(s.opts)).join(plus) + lists.join('');
}

function block(label: string, kind: string, lines: string[], total = lines.length) {
  if (!total) return '';
  const more = total > lines.length ? `<div class="pmore">+${total - lines.length} more</div>` : '';
  return `<div class="pb"><div class="pl t-${kind}">${label}</div>${lines.map((l) => `<div class="pr">${l}</div>`).join('')}${more}</div>`;
}

/** "Makeable in N refiner / processor steps" for items that need processing but no restricted ingredients */
function stepNote(ctx: Ctx, id: string) {
  const n = ctx.src.steps.get(id);
  if (!n || ctx.src.animal.has(id) || ctx.src.wild.has(id)) return '';
  return `⚙ Makeable in ${n} refiner / processor step${n > 1 ? 's' : ''} from gathered resources`;
}

export function renderSource(ctx: Ctx, id: string): string {
  const { db } = ctx;
  const it = db.items[id];
  const m = db.makes[id];
  const ob = it.ob ?? [];
  const buy = it.buy ?? [];
  const ref = (m?.ref ?? []).slice().sort((a, b) => a[0].length - b[0].length);
  const cook = rankRows(groupRecipes(m?.cook ?? []), ctx.src);

  const body =
    block('Find', 'mine', ob.slice(0, MAX_LINES).map(esc), ob.length) +
    block('Buy', 'buy', buy.slice(0, MAX_LINES).map(esc), buy.length) +
    block('Craft', 'craft', it.rq ? [it.rq.map((q) => name(ctx, q)).join(plus) + (it.q && it.q > 1 ? ` <span class="pq">→ ${fmt(it.q)}</span>` : '')] : []) +
    block('Refine', 'refine', ref.slice(0, MAX_LINES).map((r) => recipeLine(ctx, r)), ref.length) +
    block('Cook', 'cook', cook.slice(0, MAX_LINES).map((g) => groupLine(ctx, g)), cook.length);

  const only =
    (ctx.src.animal.has(id) ? '<div class="pan">🐾 Only obtainable from creatures</div>' : '') +
    (ctx.src.wild.has(id) ? '<div class="pan">🌿 Only harvested from wild plants; cannot be farmed</div>' : '') +
    (stepNote(ctx, id) ? `<div class="pan">${stepNote(ctx, id)}</div>` : '');
  return `<div class="ph">${swatch(ctx, id)}<div><div class="pn">${esc(it.n)}</div><div class="ps">${esc(it.g)}</div></div></div>${only}${
    body || (only ? '' : '<div class="pempty">No source info in the dataset.</div>')
  }`;
}

export function initPopover(ctx: Ctx) {
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.id = 'item-pop';
  pop.setAttribute('role', 'tooltip');
  pop.hidden = true;
  document.body.append(pop);

  let timer = 0;
  let anchor: HTMLElement | null = null;

  const hide = () => {
    clearTimeout(timer);
    pop.hidden = true;
    anchor?.removeAttribute('aria-describedby');
    anchor = null;
  };

  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const gap = 8;
    const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    const below = r.bottom + gap + h <= innerHeight || r.top - gap - h < 0;
    pop.style.left = `${left + scrollX}px`;
    pop.style.top = `${(below ? r.bottom + gap : r.top - gap - h) + scrollY}px`;
  };

  const show = (el: HTMLElement) => {
    const id = el.dataset.go!;
    if (!ctx.db.items[id]) return;
    anchor = el;
    pop.innerHTML = renderSource(ctx, id);
    pop.hidden = false;
    place(el);
    el.setAttribute('aria-describedby', pop.id);
  };

  const chipOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('.chip[data-go]') : null);

  // mouse only: touch "hover" fires on tap, which already navigates
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = chipOf(e.target);
    if (el === anchor) return;
    hide();
    if (el) timer = window.setTimeout(() => show(el), SHOW_DELAY);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && chipOf(e.target) && !chipOf(e.relatedTarget)) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = chipOf(e.target);
    hide();
    if (el?.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
  document.addEventListener('click', hide, true);
  addEventListener('scroll', hide, { passive: true });
  addEventListener('resize', hide);
}

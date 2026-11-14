import { clock, EAT_KINDS, eatText, page, pct, rankedIngestor, STAT_GROUPS, tiers, topBySale, topEaten } from '../../lib/food';
import { esc, fmt } from '../../lib/format';
import type { Ctx } from '../context';
import { chip, pageHead } from '../html';

const table = (head: string[], rows: string[], cls = '') =>
  `<div class="tscroll"><table class="tbl ${cls}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join(
    '',
  )}</tbody></table></div>`;

/** a food chip followed by 🐾 / 🌿 when it can only be made with creature parts or wild-only plants */
function foodChip(ctx: Ctx, id: string): string {
  const marks =
    (ctx.src.animal.has(id) ? '<span class="srcm" title="Only obtainable from creatures">🐾</span>' : '') +
    (ctx.src.wild.has(id) ? '<span class="srcm" title="Needs plants that only grow wild (cannot be farmed)">🌿</span>' : '');
  return marks ? `<span class="fc">${chip(ctx, id)}${marks}</span>` : chip(ctx, id);
}

/** what the 🐾 / 🌿 markers mean, shown under each table */
const LEGEND = "🐾 needs creature parts · 🌿 needs wild plants that can't be farmed; unmarked foods can be made from farmed or gathered ingredients.";

const chipList = (ctx: Ctx, ids: string[]) => `<div class="chips">${ids.map((id) => foodChip(ctx, id)).join('')}</div>`;

/** "‹ Previous  11–20 of 385  Next ›"; `key` names the list in state.cookPage */
function pager(key: string, p: { page: number; pages: number; start: number; total: number }, shown: number, noun: string): string {
  if (p.pages < 2) return '';
  const btn = (to: number, label: string, off: boolean) =>
    `<button data-cpage="${esc(key)}" data-to="${to}"${off ? ' disabled' : ''}>${label}</button>`;
  return `<div class="ctrl pager" role="group" aria-label="Pages">${btn(p.page - 1, '‹ Previous', p.page === 0)}<span class="q">${fmt(p.start + 1)}–${fmt(
    p.start + shown,
  )} of ${fmt(p.total)} ${noun}</span>${btn(p.page + 1, 'Next ›', p.page === p.pages - 1)}</div>`;
}

/** bonus tiers per page in the Nutrient Ingestor table (most bonuses have 5 or fewer; the most is 11) */
const TIERS_PER_PAGE = 5;

/** bonus picker plus a paged table for the chosen bonus, with tied foods merged into a row */
function ingestorSection(ctx: Ctx): string {
  const { db, state } = ctx;
  const fstat = db.data.fstat ?? {};
  const stat = fstat[state.cookStat] ? state.cookStat : Object.keys(fstat)[0];
  const picker = STAT_GROUPS.map(([group, stats]) => {
    const btns = stats
      .filter((s) => fstat[s])
      .map((s) => `<button data-cookstat="${s}" aria-pressed="${s === stat}">${esc(fstat[s][0])}</button>`)
      .join('');
    return btns ? `<div class="pick"><span class="pick-l">${esc(group)}</span><div class="ctrl" role="group" aria-label="${esc(group)}">${btns}</div></div>` : '';
  }).join('');

  const key = 'ing:' + stat;
  // paged by bonus tier, not by food: a tier of tied foods never splits across pages
  const p = page(tiers(db, rankedIngestor(db, stat)), state.cookPage[key] ?? 0, TIERS_PER_PAGE);
  const rows = p.items.map(
    (t) =>
      `<tr><td class="num">≈ ${pct(t.value)}</td><td class="num">${clock(
        t.seconds,
      )}</td><td>${chipList(ctx, t.ids)}</td></tr>`,
  );
  return `<section class="card k-cook" id="ck-ing"><h3>Nutrient Ingestor <span class="ct">best foods per bonus</span></h3>${picker}
    <div class="note" style="margin:14px 0 6px"><b>${esc(fstat[stat][0])}</b></div>${table(['Bonus', 'Time', 'Foods'], rows)}${pager(
      key,
      p,
      p.items.length,
      'tiers',
    )}
    <p class="note">Time is per item. ≈ marks an estimate from the game's range for the bonus and the food's cooking value, so foods with the same cooking value share a row.</p><p class="note">${LEGEND}</p></section>`;
}

/** foods in one tier, cheapest first */
const tierChips = (ctx: Ctx, ids: string[]) => `<div class="chips">${ids.map((id) => foodChip(ctx, id)).join('')}</div>`;

/** effect picker plus a table of the chosen effect's amounts, foods with the same amount sharing a row */
function eatenSection(ctx: Ctx): string {
  const { db, state } = ctx;
  const all = topEaten(db, Infinity);
  const kinds = EAT_KINDS.filter(([k]) => all[k].length);
  const kind = kinds.find(([k]) => k === state.cookEat)?.[0] ?? kinds[0][0];
  const picker = `<div class="ctrl" role="group" aria-label="Effect">${kinds
    .map(([k, label]) => `<button data-cookeat="${k}" aria-pressed="${k === kind}">${esc(label)}</button>`)
    .join('')}</div>`;

  // tiers: foods with the same effect text, biggest first (topEaten order), cheapest first within
  const groups = new Map<string, string[]>();
  for (const id of all[kind]) {
    const t = eatText(db.items[id].eat!);
    groups.set(t, [...(groups.get(t) ?? []), id]);
  }
  const key = 'eat:' + kind;
  const p = page([...groups], state.cookPage[key] ?? 0, TIERS_PER_PAGE);
  const rows = p.items.map(([t, ids]) => `<tr><td>${esc(t)}</td><td>${tierChips(ctx, ids)}</td></tr>`);
  return `<section class="card k-cook" id="ck-eat"><h3>Eaten directly <span class="ct">best foods per effect</span></h3>${picker}${table(
    ['Amount', 'Foods'],
    rows,
  )}${pager(key, p, p.items.length, 'tiers')}<p class="note">Biggest effect first; foods with the same effect are listed cheapest first, so you give up the least sale value.</p><p class="note">${LEGEND}</p></section>`;
}

export function renderCooking(ctx: Ctx): string {
  const { db, state } = ctx;
  let h = pageHead(
    '🍳',
    'var(--cook)',
    'Cooking reference',
    'The best Nutrient Processor foods to sell, to feed the Nutrient Ingestor, and to eat directly.',
  );
  h += `<nav class="summary" aria-label="Cooking reference">
    <a href="#" data-jump="ck-sale">Top sale prices</a><a href="#" data-jump="ck-ing">Nutrient Ingestor</a><a href="#" data-jump="ck-eat">Eaten directly</a></nav>`;

  const sale = page(topBySale(db, Infinity), state.cookPage.sale ?? 0);
  h += `<section class="card k-buy" id="ck-sale"><h3>By sale price <span class="ct">base value</span></h3>${table(
    ['#', 'Food', 'Base value'],
    sale.items.map(
      (id, i) => `<tr><td class="num">${sale.start + i + 1}</td><td>${foodChip(ctx, id)}</td><td class="num">${fmt(db.items[id].v)}</td></tr>`,
    ),
    'fit',
  )}${pager('sale', sale, sale.items.length, 'foods')}<p class="note">Terminal prices swing with each system's economy; base value is the reference price.</p><p class="note">${LEGEND}</p></section>`;

  h += ingestorSection(ctx);
  h += eatenSection(ctx);
  return h;
}

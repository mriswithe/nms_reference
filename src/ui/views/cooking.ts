import { clock, EAT_KINDS, eatText, ingestor, pct, topBySale, topEaten, topIngestor } from '../../lib/food';
import { esc, fmt } from '../../lib/format';
import type { Ctx } from '../context';
import { chip, pageHead } from '../html';

const table = (head: string[], rows: string[]) =>
  `<div class="tscroll"><table class="tbl"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join(
    '',
  )}</tbody></table></div>`;

/** "+6,214% · 10:00" with a "measured" or "≈" marker */
function ingestorText(ctx: Ctx, id: string, withLabel = false): string {
  const g = ingestor(ctx.db.data, ctx.db.items[id]);
  if (!g) return '<span class="q">none</span>';
  const v = g.measured != null ? `<b>${pct(g.measured)}</b> <span class="q">measured</span>` : `≈ ${pct(g.est)}`;
  return `${v}${withLabel ? ` ${esc(g.label)}` : ''} <span class="q">· ${clock(g.seconds)}</span>`;
}

const ranked = (ctx: Ctx, ids: string[], detail: (id: string) => string, n = 3) =>
  Array.from({ length: n }, (_, i) => (ids[i] ? `<td>${chip(ctx, ids[i])}<div class="cell">${detail(ids[i])}</div></td>` : '<td></td>')).join('');

export function renderCooking(ctx: Ctx): string {
  const { db } = ctx;
  let h = pageHead(
    '🍳',
    'var(--cook)',
    'Cooking reference',
    'The best Nutrient Processor foods to sell, to feed the Nutrient Ingestor, and to eat directly.',
  );
  h += `<nav class="summary" aria-label="Cooking reference">
    <a href="#" data-jump="ck-sale">Top sale prices</a><a href="#" data-jump="ck-ing">Nutrient Ingestor</a><a href="#" data-jump="ck-eat">Eaten directly</a></nav>`;

  h += `<section class="card k-buy" id="ck-sale"><h3>Top 10 by sale price <span class="ct">base value</span></h3>${table(
    ['#', 'Food', 'Base value', 'Nutrient Ingestor', 'Eat'],
    topBySale(db).map((id, i) => {
      const it = db.items[id];
      return `<tr><td class="num">${i + 1}</td><td>${chip(ctx, id)}</td><td class="num">${fmt(it.v)}</td><td>${ingestorText(ctx, id, true)}</td><td>${
        it.eat ? esc(eatText(it.eat)) : '<span class="q">ingestor only</span>'
      }</td></tr>`;
    }),
  )}<p class="note">Terminal prices swing with each system's economy; base value is the reference price.</p></section>`;

  h += `<section class="card k-cook" id="ck-ing"><h3>Nutrient Ingestor <span class="ct">top 3 per bonus</span></h3>${table(
    ['Bonus', '1st', '2nd', '3rd'],
    topIngestor(db).map(
      ([stat, ids]) => `<tr><th scope="row">${esc(db.data.fstat![stat][0])}</th>${ranked(ctx, ids, (id) => ingestorText(ctx, id))}</tr>`,
    ),
  )}<p class="note">Bonus and time per item. ≈ marks an estimate from the game's range for the stat and the food's cooking value; measured values are in-game readings.</p></section>`;

  const eaten = topEaten(db);
  h += `<section class="card k-cook" id="ck-eat"><h3>Eaten directly <span class="ct">top 3 per effect</span></h3>${table(
    ['Effect', '1st', '2nd', '3rd'],
    EAT_KINDS.filter(([k]) => eaten[k].length).map(
      ([k, label]) => `<tr><th scope="row">${esc(label)}</th>${ranked(ctx, eaten[k], (id) => esc(eatText(db.items[id].eat!)))}</tr>`,
    ),
  )}<p class="note">Biggest effect first; foods with the same effect are listed cheapest first, so you give up the least sale value.</p></section>`;
  return h;
}

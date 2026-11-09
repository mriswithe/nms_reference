import { refinableConsumables, refinerSize } from '../../lib/consumables';
import { esc, fmt, plural } from '../../lib/format';
import type { Ctx } from '../context';
import { chip, chips, pageHead, recipeRow, swatch } from '../html';

export function renderConsumables(ctx: Ctx): string {
  const { db, cost } = ctx;
  const list = refinableConsumables(db);
  let h = pageHead(
    '⚗',
    'var(--refine)',
    'Refining consumables',
    'Charges, fuels and ammo you can make in a refiner, compared with crafting. Cost is the in-game base value of the raw inputs per item.',
  );
  h += `<nav class="summary" aria-label="Consumables">${list
    .map((id) => `<a href="#" data-jump="cn-${id}">${esc(db.items[id].n)}</a>`)
    .join('')}</nav>`;

  for (const id of list) {
    const it = db.items[id];
    const rs = (db.makes[id]?.ref ?? []).map((r) => ({ r, cost: cost.recipeCost(r) })).sort((a, b) => a.cost - b.cost);
    const cc = it.rq ? cost.craft(id) : null;
    h += `<section class="card k-refine" id="cn-${id}"><div class="head" style="margin-bottom:10px">${swatch(ctx, id)}<div><h3 style="margin:0">${esc(
      it.n,
    )}</h3><div class="sub">${esc(it.g)}</div></div></div>`;
    if (it.rq)
      h += `<div class="note" style="margin:0"><b>Craft</b> · about ${fmt(Math.round(cc!))} units each</div><div class="rlist"><div class="row">${chips(
        ctx,
        it.rq,
      )}<span class="arrow">→</span>${chip(ctx, id, it.q || 1, true)}</div></div>`;
    else h += `<p class="note" style="margin:0">No crafting recipe; refining is the only way to make it.</p>`;

    h += `<div class="note"><b>Refine</b> · ${plural(rs.length, 'recipe')}</div><div class="rlist">`;
    rs.forEach(({ r, cost: c }, k) => {
      const cheapest = k === 0 && rs.length > 1 && c < rs[1].cost * 0.995 ? '<span class="tag t-cook">Cheapest</span>' : '';
      const vsCraft =
        cc != null && c < cc * 0.995
          ? `<span class="tag t-refine">−${Math.round((1 - c / cc) * 100)}% vs craft</span>`
          : cc != null && c > cc * 1.005
            ? '<span class="tag t-buy">Costs more than crafting</span>'
            : '';
      h += recipeRow(ctx, r, id, `${cheapest}${vsCraft} about ${fmt(Math.round(c))} units each · ${refinerSize(r[0].length)} · `);
    });
    h += `</div></section>`;
  }
  return h;
}

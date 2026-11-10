import { MAX_DEPTH } from '../../lib/cost';
import { totalCount } from '../../lib/db';
import { esc, fmt, plural } from '../../lib/format';
import { clock, eatText, ingestor } from '../../lib/food';
import type { Recipe } from '../../lib/types';
import type { Ctx } from '../context';
import { rankRows } from '../../lib/sourcing';
import { groupRecipes } from '../../lib/group';
import { chip, chips, groupRow, limited, recipeRow, refineBadge, swatch } from '../html';

const byInputs = (a: Recipe, b: Recipe) => a[0].length - b[0].length;
/** grouped Nutrient Processor rows; `pin` keeps the viewed item as the fixed input */
const cookRows = (ctx: Ctx, rs: Recipe[], id: string, key: string, pin?: string) =>
  rankRows(groupRecipes(rs, pin), ctx.src)
    .map((g, i) => groupRow(ctx, g, id, `${key}:${i}`));
/** outputs per input unit */
const efficiency = (r: Recipe) => r[1][1] / r[0].reduce((s, [, q]) => s + q, 0);

/** recursive crafting tree; in "smart" mode parts cheaper to refine expand into their refiner inputs */
function tree(ctx: Ctx, id: string, mult: number, depth: number, seen: Set<string>): string {
  const it = ctx.db.items[id];
  const ch = ctx.cost.cheaper(id);
  const smart = ctx.state.treeMode === 'smart' && ch;
  if ((!it.rq && !smart) || depth > MAX_DEPTH || seen.has(id)) return `<div class="leaf">${chip(ctx, id, fmt(mult))}</div>`;
  const s2 = new Set(seen).add(id);
  if (smart) {
    const r = smart.r;
    const runs = Math.ceil(mult / r[1][1]);
    return `<details open><summary>${chip(ctx, id, fmt(mult))}<span class="tag t-refine">Refine</span><span class="q">${esc(r[3])}${
      runs > 1 ? ' ×' + runs : ''
    }</span></summary>${r[0].map(([c, q]) => tree(ctx, c, q * runs, depth + 1, s2)).join('')}</details>`;
  }
  const per = it.q || 1;
  const runs = Math.ceil(mult / per);
  return `<details open><summary>${chip(ctx, id, fmt(mult))}${
    per > 1 ? `<span class="q">(${plural(runs, 'craft')})</span>` : ''
  }${refineBadge(ch)}</summary>${it.rq!.map(([c, q]) => tree(ctx, c, q * runs, depth + 1, s2)).join('')}</details>`;
}

function craftSection(ctx: Ctx, id: string): string {
  const { db, cost, state } = ctx;
  const it = db.items[id];
  let h = `<section class="card k-craft" id="s-craft"><h3>Craft <span class="ct">${it.q! > 1 ? 'makes ' + fmt(it.q!) : ''}</span></h3>
    <div class="rlist"><div class="row">${chips(ctx, it.rq!)}<span class="arrow">→</span>${chip(ctx, id, it.q || 1, true)}</div></div>`;

  const self = cost.cheaper(id);
  if (self)
    h += `<p class="callout">${refineBadge(self)} Refining ${esc(it.n)} is about ${self.pct}% cheaper than crafting it. <a href="#" data-jump="s-refine">See refiner recipes</a></p>`;

  const deep = it.rq!.some(([i]) => db.items[i].rq || cost.cheaper(i));
  if (deep) {
    const smart = state.treeMode === 'smart';
    const tot = cost.totals(id, smart);
    const canSmart = cost.hasCheaperPart(id);
    const plain = cost.totalValue(cost.totals(id, false));
    const sm = cost.totalValue(cost.totals(id, true));
    h += `<div class="ctrl" role="group" aria-label="Tree mode" style="margin-top:12px">
      <button data-tmode="craft" aria-pressed="${!smart}">Craft everything</button>
      <button data-tmode="smart" aria-pressed="${smart}"${canSmart ? '' : ' disabled title="No part of this is cheaper to refine"'}>Refine where cheaper</button>
      ${
        canSmart
          ? `<span class="note" style="margin:0;align-self:center">Saves about <b>${Math.round((1 - sm / plain) * 100)}%</b> of raw value (${fmt(
              Math.round(plain),
            )} → ${fmt(Math.round(sm))} units)</span>`
          : ''
      }</div>
      <div class="grid2">
        <div><div class="note"><b>Full ${smart ? 'build' : 'crafting'} tree</b></div>
          <div class="ctrl" style="margin-top:6px"><button data-tree="open">Expand all</button><button data-tree="close">Collapse all</button></div>
          <div class="tree">${tree(ctx, id, 1, 0, new Set())}</div></div>
        <div><div class="note"><b>Total base ingredients</b> (${smart ? 'refining where cheaper' : 'crafting every part'}) · about ${fmt(
          Math.round(cost.totalValue(tot)),
        )} units of raw value</div>
          <div class="totals" style="margin-top:6px">${tot.map(([i, q]) => chip(ctx, i, fmt(q))).join('')}</div></div>
      </div>`;
  }
  return h + `</section>`;
}

const pct = (n: number) => `+${fmt(Math.round(n))}%`;

/** what eating it does, and its Nutrient Ingestor bonus */
function foodSection(ctx: Ctx, id: string): string {
  const it = ctx.db.items[id];
  const ing = ingestor(ctx.db.data, it);
  if (!it.eat && !ing) return '';
  let h = `<section class="card k-cook" id="s-food"><h3>Food effects</h3><ul class="plain">`;
  // no consumable entry in the game: it can only be used through the Nutrient Ingestor
  h += `<li><b>Eat:</b> ${it.eat ? esc(eatText(it.eat)) : 'Cannot be eaten directly, only through the Nutrient Ingestor'}</li>`;
  if (ing) {
    const range = `${pct(ing.lo)} to ${pct(ing.hi)}`;
    h += `<li><b>Nutrient Ingestor:</b> ${
      ing.measured
        ? `${pct(ing.measured)} ${esc(ing.label)} <span class="q">measured in game</span>`
        : `about ${pct(ing.est)} ${esc(ing.label)} <span class="q">estimated, ${range}</span>`
    }</li><li><b>Ingestor duration:</b> ${clock(ing.seconds)} per item</li>`;
  }
  return h + `</ul></section>`;
}

function usedInSection(ctx: Ctx, id: string): string {
  const { db } = ctx;
  const u = db.uses[id];
  if (!u) return '';
  const ur = u.ref.length,
    uc = u.craft.length,
    uk = u.cook.length;
  if (!(ur + uc + uk)) return '';
  let h = `<section class="card k-use"><h3>Used in <span class="ct">${ur} refine · ${uc} craft · ${uk} cook</span></h3>`;
  if (ur)
    h += `<div class="note"><b>Refiner input</b></div><div class="rlist">${limited(
      ctx,
      u.ref.slice().sort(byInputs).map((r) => recipeRow(ctx, r, id)),
      'uref' + id,
      6,
    )}</div>`;
  if (uc) {
    const list = u.craft.slice().sort((a, b) => db.items[a].n.localeCompare(db.items[b].n));
    h += `<div class="note"><b>Crafting ingredient for</b></div><div class="totals" style="margin-top:6px">${limited(
      ctx,
      list.map((x) => chip(ctx, x, db.items[x].rq!.find((r) => r[0] === id)![1])),
      'ucraft' + id,
      24,
    )}</div>`;
  }
  if (uk)
    h += `<div class="note"><b>Nutrient Processor input</b></div><div class="rlist">${limited(
      ctx,
      cookRows(ctx, u.cook, id, 'gucook' + id, id),
      'ucook' + id,
      5,
    )}</div>`;
  return h + `</section>`;
}

export function renderItem(ctx: Ctx, id: string): string {
  const { db, state } = ctx;
  const it = db.items[id];
  const m = db.makes[id] ?? { ref: [], cook: [], craft: [] };
  const c = db.counts(id);

  const ref = m.ref.slice();
  if (state.refSort === 'fewest') ref.sort((a, b) => byInputs(a, b) || efficiency(b) - efficiency(a));
  else ref.sort((a, b) => efficiency(b) - efficiency(a));

  const value = it.v ? `${fmt(it.v)} ${it.cur === 'None' ? '' : it.cur}`.trim() : '';
  let h = `<div class="head">${swatch(ctx, id)}<div><h2>${esc(it.n)}</h2><div class="sub">${esc(it.g)} · ${esc(it.c)}${
    value ? ` · base value <span class="q">${esc(value)}</span>` : ''
  }</div></div></div>`;

  const sum: [string, string, number][] = [
    ['refine', 'Refine', c.ref],
    ['craft', 'Craft', c.craft],
    ['cook', 'Cook', c.cook],
    ['mine', 'Find / gather', c.mine],
    ['buy', 'Buy', c.buy],
  ];
  h += `<nav class="summary" aria-label="Ways to get it">${sum
    .map(([k, l, n]) => `<a href="#" class="t-${k}${n ? '' : ' off'}" data-jump="s-${k}">${l}<b>${n}</b></a>`)
    .join('')}</nav>`;

  const limits = [
    ctx.src.animal.has(id) && '🐾 Only obtainable from creatures. No refiner or Nutrient Processor recipe makes it from other sources.',
    ctx.src.wild.has(id) && '🌿 Only harvested from wild plants on planets. It cannot be farmed, and no recipe makes it from other sources.',
  ].filter(Boolean);
  if (limits.length) h += `<section class="card"><p class="note" style="margin:0">${limits.join('<br>')}</p></section>`;
  else if (!totalCount(c))
    h += `<section class="card"><p class="empty">No refining, crafting, cooking, gathering or purchase info in the dataset for this item. Check the description below.</p></section>`;

  if (c.ref)
    h += `<section class="card k-refine" id="s-refine"><h3>Refine <span class="ct">${plural(c.ref, 'recipe')}</span></h3>
      <div class="ctrl" role="group" aria-label="Sort refiner recipes"><button data-sort="fewest" aria-pressed="${
        state.refSort === 'fewest'
      }">Simplest first</button><button data-sort="yield" aria-pressed="${state.refSort === 'yield'}">Best yield first</button></div>
      <div class="rlist">${limited(ctx, ref.map((r) => recipeRow(ctx, r, id)), 'ref' + id)}</div></section>`;

  if (c.craft) h += craftSection(ctx, id);

  if (c.cook)
  {
    const rows = cookRows(ctx, m.cook, id, 'gcook' + id);
    h += `<section class="card k-cook" id="s-cook"><h3>Cook <span class="ct">Nutrient Processor · ${plural(c.cook, 'recipe')}${
      rows.length < c.cook ? ` in ${plural(rows.length, 'row')}` : ''
    }</span></h3><div class="rlist">${limited(ctx, rows, 'cook' + id)}</div></section>`;
  }

  h += foodSection(ctx, id);

  if (c.mine || c.buy) {
    h += `<div class="grid2">`;
    if (c.mine)
      h += `<section class="card k-mine" id="s-mine"><h3>Find / gather</h3><ul class="plain">${it
        .ob!.map((s) => `<li>${esc(s)}</li>`)
        .join('')}</ul></section>`;
    if (c.buy)
      h += `<section class="card k-buy" id="s-buy"><h3>Buy</h3><ul class="plain">${it.buy!.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${
        it.v && it.cur === 'Credits'
          ? `<p class="note">Base price about <b>${fmt(it.v)} units</b> each; terminal prices swing with system economy and supply.</p>`
          : ''
      }</section>`;
    h += `</div>`;
  }

  if (it.note) h += `<section class="card"><p class="note" style="margin:0">${esc(it.note)}</p></section>`;
  if (it.d) h += `<section class="card k-use"><h3>In-game description</h3><p class="desc">${esc(it.d)}</p></section>`;
  return h + usedInSection(ctx, id);
}

export const renderWelcome = () => `<section class="card welcome"><h2>What do you need?</h2>
  <p>Search for any item to see every way to get it: refiner recipes, crafting blueprints, Nutrient Processor recipes, where to mine or gather it, and where to buy it.</p>
  <p>Each page also shows what the item is used in, and for crafted items, a full ingredient tree down to base materials.</p></section>`;

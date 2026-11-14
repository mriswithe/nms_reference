import { oneWayUpgrades, route, stellarExpansions, type Family, type Route } from '../../lib/cycles';
import { abbr, color, esc, fmt, plural } from '../../lib/format';
import type { Recipe } from '../../lib/types';
import type { Ctx } from '../context';
import { chip, pageHead, recipeRow } from '../html';

const byInputs = (a: Recipe, b: Recipe) => a[0].length - b[0].length;

/** SVG diagram: members on a circle (loop) or a line (chain) with arrows between steps */
function ring(ctx: Ctx, f: Family): string {
  const I = ctx.db.items;
  const n = f.order.length,
    W = 380,
    H = f.loop ? 300 : 150,
    cx = W / 2,
    cy = H / 2,
    R = f.loop ? 100 : 0;
  const pos = f.order.map((_, i) =>
    f.loop
      ? [cx + R * Math.sin((2 * Math.PI * i) / n), cy - R * Math.cos((2 * Math.PI * i) / n)]
      : [40 + (i * (W - 80)) / (n - 1), cy],
  );
  const r = 19;
  let s = '';
  f.order.forEach((_, i) => {
    if (!f.loop && i === n - 1) return;
    const [x1, y1] = pos[i],
      [x2, y2] = pos[(i + 1) % n];
    const dx = x2 - x1,
      dy = y2 - y1,
      L = Math.hypot(dx, dy),
      ux = dx / L,
      uy = dy / L;
    s += `<line x1="${x1 + ux * (r + 4)}" y1="${y1 + uy * (r + 4)}" x2="${x2 - ux * (r + 9)}" y2="${
      y2 - uy * (r + 9)
    }" stroke="var(--muted)" stroke-width="1.6" marker-end="url(#ah-${f.key})"/>`;
  });
  f.order.forEach((id, i) => {
    const [x, y] = pos[i];
    const it = I[id];
    const anchor = !f.loop || Math.abs(x - cx) < 5 ? 'middle' : x > cx ? 'start' : 'end';
    let lx = f.loop ? x + ((x - cx) / R) * 34 : x;
    let ly = f.loop ? y + ((y - cy) / R) * 34 + 4 : y + r + 18;
    if (f.loop && anchor !== 'middle') {
      lx = anchor === 'start' ? x + r + 6 : x - r - 6;
      ly = y + 4;
    }
    s += `<g data-go="${id}" style="cursor:pointer" role="link" aria-label="${esc(it.n)}"><circle cx="${x}" cy="${y}" r="${r}" fill="${color(
      it,
    )}"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="#fff" style="font:700 11px var(--f-display)">${esc(
      abbr(it),
    )}</text><text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="var(--ink)" style="font:600 13px var(--f-body)">${esc(it.n)}</text></g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:4px auto 0;overflow:visible" role="img" aria-label="${esc(
    f.title,
  )} order: ${f.order.map((i) => esc(I[i].n)).join(' to ')}"><defs><marker id="ah-${
    f.key
  }" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted)"/></marker></defs>${s}</svg>`;
}

function routeFinder(ctx: Ctx, f: Family): string {
  const I = ctx.db.items;
  const c = (ctx.state.routes[f.key] ??= { a: f.order[0], b: f.order[Math.min(2, f.order.length - 1)] });
  const opts = (sel: string) =>
    f.order.map((id) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(I[id].n)}</option>`).join('');
  let h = `<div class="route"><div class="note" style="margin:0 0 6px"><b>Route finder</b></div><div class="rsel">
    <label>From <select id="ra-${f.key}" data-route="${f.key}" data-end="a">${opts(c.a)}</select></label><span class="arrow">→</span>
    <label>To <select id="rb-${f.key}" data-route="${f.key}" data-end="b">${opts(c.b)}</select></label></div>`;
  if (c.a === c.b) return h + `<p class="note">Pick two different elements.</p></div>`;

  const best = route(ctx.db, f, c.a, c.b, false);
  const solo = route(ctx.db, f, c.a, c.b, true);
  if (!best) return h + `<p class="note">No route: this chain only runs one way.</p></div>`;

  const line = (rt: Route, label: string) =>
    `<div class="row" style="border:0;padding:4px 0"><span class="note" style="margin:0;min-width:9em"><b>${esc(label)}</b></span>${chip(
      ctx,
      c.a,
      fmt(rt.need),
    )}${Object.entries(rt.extras)
      .map(([x, q]) => '<span class="plus">+</span>' + chip(ctx, x, fmt(q)))
      .join('')}<span class="arrow">→</span>${chip(ctx, c.b, 1)}</div>`;
  h += `<p class="note">${plural(best.steps.length, 'step')}: ${[c.a, ...best.steps.map((s) => s.to)].map((i) => esc(I[i].n)).join(' → ')}</p>`;
  h += line(best, 'Fewest ' + I[c.a].n);
  if (solo && JSON.stringify(Object.keys(solo.extras)) !== JSON.stringify(Object.keys(best.extras))) h += line(solo, 'No catalyst');
  return h + `</div>`;
}

function familyCard(ctx: Ctx, f: Family): string {
  const I = ctx.db.items;
  const open = ctx.state.openCycles.has(f.key) ? ' open' : '';
  let h = `<details class="card k-refine cyc" id="cy-${f.key}" data-cy="${f.key}"${open}><summary><h3>${esc(f.title)} <span class="ct">${
    f.loop ? 'loop' : 'chain'
  } · ${f.order.length}</span></h3><span class="peek">${f.order.map((i) => esc(I[i].n)).join(' → ')}${
    f.loop ? ' → ↺' : ''
  }</span></summary><p class="note" style="margin:0">${esc(f.blurb)}</p>${ring(ctx, f)}`;
  h += `<div class="rlist" style="margin-top:6px">`;
  for (const id of f.order) {
    const e = f.edges[id];
    if (!e) continue;
    h += `<div class="row" style="flex-direction:column;align-items:stretch;gap:2px"><div class="note" style="margin:0"><b>${esc(I[id].n)} → ${esc(
      I[e.to].n,
    )}</b></div>${e.recipes
      .slice()
      .sort(byInputs)
      .map((r) => recipeRow(ctx, r, null, '', 'border:0;padding:3px 0'))
      .join('')}</div>`;
  }
  h += `</div>` + routeFinder(ctx, f);
  if (f.side.length)
    h += `<div class="note"><b>Other ways in</b> (from other raw materials)</div><div class="rlist">${f.side
      .slice()
      .sort(byInputs)
      .map((r) => recipeRow(ctx, r, null))
      .join('')}</div>`;
  return h + `</details>`;
}

export function renderCycles(ctx: Ctx): string {
  const { db, state } = ctx;
  const I = db.items;
  let h =
    pageHead('⟳', 'var(--accent)', 'Conversion cycles', 'Refiner loops for turning one gas or biome mineral into another. Click any element to open it.') +
    `<div class="ctrl" style="margin:0"><button data-cyall="open">Expand all</button><button data-cyall="close">Collapse all</button></div>`;

  for (const f of ctx.families) if (f.order.length) h += familyCard(ctx, f);

  const open = (k: string) => (state.openCycles.has(k) ? ' open' : '');
  h += `<details class="card k-refine cyc" data-cy="stellar"${open('stellar')}><summary><h3>Stellar metals <span class="ct">no colour-to-colour cycle</span></h3><span class="peek">Double any stellar metal with Chromatic Metal</span></summary><p class="note" style="margin:0 0 6px">Stellar metals can't be turned into each other. You can double any of them with Chromatic Metal.</p><div class="rlist">${stellarExpansions(
    db,
  )
    .map((r) => recipeRow(ctx, r, null))
    .join('')}</div></details>`;

  const oneway = oneWayUpgrades(db).sort((p, q) => I[p[1][0]].n.localeCompare(I[q[1][0]].n));
  h += `<details class="card k-refine cyc" data-cy="oneway"${open('oneway')}><summary><h3>One-way upgrades <span class="ct">${
    oneway.length
  }</span></h3><span class="peek">${[...new Set(oneway.map((r) => I[r[1][0]].n))].sort().join(' · ')}</span></summary><div class="rlist">${oneway
    .map((r) => recipeRow(ctx, r, null))
    .join('')}</div></details>`;
  return h;
}

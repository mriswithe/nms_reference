import { MOD_CLASSES, type ModClass } from '../../lib/multitool';
import { EXOSUIT, SHIP_PLATFORMS, upgradeCatalog, type Platform } from '../../lib/upgrades';
import { esc } from '../../lib/format';
import type { Ctx } from '../context';
import { pageHead, swatch } from '../html';

const CLASS_LABEL: Record<ModClass, string> = { C: 'C', B: 'B', A: 'A', S: 'S', X: 'X (Suspicious)' };

const table = (head: string[], rows: string[]) =>
  `<div class="tscroll"><table class="tbl"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

const modChip = (ctx: Ctx, id: string, c: ModClass) => {
  const it = ctx.db.items[id];
  return `<button class="chip" data-go="${id}" aria-label="${c}-class: ${esc(it.n)}" title="${esc(it.n)} (${esc(it.g)})">${swatch(ctx, id, 'sm')}</button>`;
};

const RULES = `The same rules as Multi-Tool modules apply: three modules per technology, stats roll on install, and the <a href="#mtupgrades" class="jl" data-go="mtupgrades">save-and-reload reroll</a> works on every module.`;

const SOURCES = `<p class="note">Sources: datamined module tables (nomansskyrecipes.com, Forsaken 7.1). Some of that site's percentages are stored as "value − 100%" and are shown here as the game displays them.</p>`;

/** roll-range card (technology picker + table) and where-to-get card for one platform */
function platformCards(ctx: Ctx, plat: Platform): string {
  const tech = plat.techs.find((t) => t.key === ctx.state.upTech[plat.key]) ?? plat.techs[0];
  const row = upgradeCatalog(ctx.db, plat)[tech.key];
  const picker = `<div class="ctrl" role="group" aria-label="Technology">${plat.techs
    .map((t) => `<button data-uptech="${t.key}" data-plat="${plat.key}" aria-pressed="${t === tech}">${esc(t.name)}</button>`)
    .join('')}</div>`;
  const hasItems = Object.keys(row).length > 0;
  const rows = MOD_CLASSES.filter((c) => tech.rows[c]).map((c) => {
    const [n, ...vals] = tech.rows[c]!;
    const item = hasItems ? `<td>${row[c] ? row[c]!.map((id) => modChip(ctx, id, c)).join('') : '—'}</td>` : '';
    return `<tr><th scope="row">${CLASS_LABEL[c]}</th>${item}<td class="num">${n}</td>${vals.map((v) => `<td class="num">${esc(v)}</td>`).join('')}</tr>`;
  });
  return `<section class="card k-craft" id="up-ranges"><h3>${esc(plat.name)} roll ranges <span class="ct">per module class</span></h3>
    ${picker}${table(['Class', ...(hasItems ? ['Module'] : []), 'Stats', ...tech.stats.map(esc)], rows)}
    <p class="note"><b>Judge a roll on:</b> ${esc(tech.judge)}</p>
    ${tech.note ? `<p class="note">${esc(tech.note)}</p>` : ''}
    <p class="note">"Stats" is how many of the listed stats a module rolls; which ones it gets is random when there are more stats than rolls. Negative times and costs are better. Ranges come from the game files (Forsaken 7.1).</p>
  </section>
  <section class="card k-buy" id="up-where"><h3>Where to get ${esc(plat.name.toLowerCase())} modules</h3><ul class="plain note">${plat.where
    .map((w) => `<li>${w}</li>`)
    .join('')}</ul></section>`;
}

/** Ship upgrade ranges: starship, living ship, freighter; one platform at a time */
export function renderUpgrades(ctx: Ctx): string {
  const plat = SHIP_PLATFORMS.find((p) => p.key === ctx.state.upPlat) ?? SHIP_PLATFORMS[0];
  let h = pageHead(
    '🚀',
    'var(--craft)',
    'Ship upgrades',
    'What each upgrade-module class can roll for the starship, living ship and freighter, and which stat to judge a roll on.',
  );
  h += `<p class="note">${RULES} Exosuit modules are on their own page: <a href="#exosuit" class="jl" data-go="exosuit">Exosuit upgrades</a>.</p>`;
  h += `<div class="ctrl" role="group" aria-label="Ship">${SHIP_PLATFORMS.map(
    (p) => `<button data-upplat="${p.key}" aria-pressed="${p === plat}">${p.icon} ${esc(p.name)}</button>`,
  ).join('')}</div>`;
  h += platformCards(ctx, plat);
  return h + SOURCES;
}

/** Exosuit upgrade ranges */
export function renderExosuit(ctx: Ctx): string {
  let h = pageHead(
    '🥽',
    'var(--craft)',
    'Exosuit upgrades',
    'What each Exosuit upgrade-module class can roll, from Life Support and the jetpack to each hazard protection, and which stat to judge a roll on.',
  );
  h += `<p class="note">${RULES} Starship, living ship and freighter modules are on <a href="#upgrades" class="jl" data-go="upgrades">Ship upgrades</a>.</p>`;
  h += platformCards(ctx, EXOSUIT);
  return h + SOURCES;
}

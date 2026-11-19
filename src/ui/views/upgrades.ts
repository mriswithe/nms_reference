import { MOD_CLASSES, type ModClass } from '../../lib/multitool';
import { PLATFORMS, upgradeCatalog } from '../../lib/upgrades';
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

/** Ship & suit upgrade ranges: one platform at a time, one technology at a time */
export function renderUpgrades(ctx: Ctx): string {
  const plat = PLATFORMS.find((p) => p.key === ctx.state.upPlat) ?? PLATFORMS[0];
  const tech = plat.techs.find((t) => t.key === ctx.state.upTech[plat.key]) ?? plat.techs[0];
  const cat = upgradeCatalog(ctx.db, plat);

  let h = pageHead(
    '🚀',
    'var(--craft)',
    'Ship & suit upgrades',
    'What each upgrade-module class can roll for the starship, living ship, exosuit and freighter, and which stat to judge a roll on.',
  );
  h += `<p class="note">Multi-Tool modules are on their own page: <a href="#mtupgrades" class="jl" data-go="mtupgrades">Multi-Tool upgrades</a>. The same rules apply here: three modules per technology, stats roll on install, and the <a href="#mtupgrades" class="jl" data-go="mtupgrades">save-and-reload reroll</a> works on every module.</p>`;

  h += `<div class="ctrl" role="group" aria-label="Platform">${PLATFORMS.map(
    (p) => `<button data-upplat="${p.key}" aria-pressed="${p === plat}">${p.icon} ${esc(p.name)}</button>`,
  ).join('')}</div>`;

  const picker = `<div class="ctrl" role="group" aria-label="Technology">${plat.techs
    .map((t) => `<button data-uptech="${t.key}" aria-pressed="${t === tech}">${esc(t.name)}</button>`)
    .join('')}</div>`;
  const row = cat[tech.key];
  const hasItems = Object.keys(row).length > 0;
  const rows = MOD_CLASSES.filter((c) => tech.rows[c]).map((c) => {
    const [n, ...vals] = tech.rows[c]!;
    const item = hasItems ? `<td>${row[c] ? modChip(ctx, row[c]!, c) : '—'}</td>` : '';
    return `<tr><th scope="row">${CLASS_LABEL[c]}</th>${item}<td class="num">${n}</td>${vals.map((v) => `<td class="num">${esc(v)}</td>`).join('')}</tr>`;
  });
  h += `<section class="card k-craft" id="up-ranges"><h3>${esc(plat.name)} roll ranges <span class="ct">per module class</span></h3>
    ${picker}${table(['Class', ...(hasItems ? ['Module'] : []), 'Stats', ...tech.stats.map(esc)], rows)}
    <p class="note"><b>Judge a roll on:</b> ${esc(tech.judge)}</p>
    ${tech.note ? `<p class="note">${esc(tech.note)}</p>` : ''}
    <p class="note">"Stats" is how many of the listed stats a module rolls; which ones it gets is random when there are more stats than rolls. Negative times and costs are better. Ranges come from the game files (Forsaken 7.1).</p>
  </section>`;

  h += `<section class="card k-buy" id="up-where"><h3>Where to get ${esc(plat.name.toLowerCase())} modules</h3><ul class="plain note">${plat.where
    .map((w) => `<li>${w}</li>`)
    .join('')}</ul></section>`;

  h += `<p class="note">Sources: datamined module tables (nomansskyrecipes.com, Forsaken 7.1). Some of that site's percentages are stored as "value − 100%" and are shown here as the game displays them.</p>`;
  return h;
}

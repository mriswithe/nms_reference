import { MOD_CLASSES, type ExtraRow, type ModClass, type SpecialTech } from '../../lib/multitool';
import { EXOCRAFT_PLATFORMS, EXOSUIT, EXPORT_BUILD, salvageCatalog, SHIP_PLATFORMS, upgradeCatalog, type Platform } from '../../lib/upgrades';
import { esc } from '../../lib/format';
import type { Ctx } from '../context';
import { chip, pageHead, swatch } from '../html';

const CLASS_LABEL: Record<ModClass, string> = { C: 'C', B: 'B', A: 'A', S: 'S', X: 'X (Suspicious)' };

const table = (head: string[], rows: string[]) =>
  `<div class="tscroll"><table class="tbl ranges"><thead><tr>${head.map((h) => `<th scope="col"${h === 'Module' || h === 'Salvaged' ? ' class="mod" data-nosort' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

const modChip = (ctx: Ctx, id: string, label: string) => {
  const it = ctx.db.items[id];
  return `<button class="chip" data-go="${id}" aria-label="${esc(label)}: ${esc(it.n)}" title="${esc(it.n)} (${esc(it.g)})">${swatch(ctx, id, 'sm')}</button>`;
};

const reroll = '<a href="#reroll" class="jl" data-go="reroll">save-and-reload reroll</a>';
const link = (view: string, text: string) => `<a href="#${view}" class="jl" data-go="${view}">${esc(text)}</a>`;

/** an extra row's label, with a visible marker when its link to these ranges isn't in the game files */
export const extraLabel = (x: ExtraRow) =>
  esc(x.label) + (x.unverified ? ` <span class="tag unv" title="The game files don't link this item to these ranges">unverified</span>` : '');

/** the extra rows' notes, each once */
export const extraNotes = (rows: ExtraRow[] | undefined) =>
  [...new Set((rows ?? []).map((x) => x.note).filter(Boolean))].map((n) => `<p class="note">${n}</p>`).join('');

export const SALVAGE_NOTE = `<b>Salvaged</b> modules are the unpackaged form of the same upgrade, the kind scrapping a ship or Multi-Tool gives back. They install into a slot the same way and roll the same ranges as the shop module of their class.`;

/** text that differs between the upgrade pages: the Starship and Exosuit tables come from a datamined site, the Exocraft ones from the game files alone */
interface PageText {
  /** first line under the page head; `cross` links to the other upgrade pages */
  rules: (cross: string) => string;
  salvage: string;
  /** last line of the roll-range card */
  footer: string;
  sources: string;
}

const DATAMINED: PageText = {
  rules: (cross) =>
    `The same rules as Multi-Tool modules apply: three modules per technology, stats roll on install, and the ${reroll} works on every module. ${cross}`,
  salvage: SALVAGE_NOTE,
  footer: `"Stats" is how many of the listed stats a module rolls; which ones it gets is random when there are more stats than rolls. Negative times and costs are better. Ranges come from the game files (Forsaken 7.1).`,
  sources: `<p class="note src">Sources: datamined module tables (nomansskyrecipes.com, Forsaken 7.1), checked against the game's own files. Some of that site's percentages are stored as "value − 100%" and are shown here as the game displays them.</p>`,
};

const EXOCRAFT_TEXT: PageText = {
  rules: (cross) => `A module's stats are set when it is installed: the module text says exact statistics are unknown until installation is complete. ${cross}`,
  salvage: `<b>Salvaged</b> modules are the "Tech module" form of the same upgrade, named by class (such as "C-Class Mounted Cannon Upgrade"). The game files tie each one to the module of its class, so it rolls the same ranges. How to get them isn't in the game data.`,
  footer: `"Stats" is how many of the listed stats a module rolls; which ones it gets is random when there are more stats than rolls. Negative fuel usage is better. Power efficiency, fire rate and mining laser efficiency are stored below 1 and fall from C to S, so they are shown as the reduction, like Mining speed on the Multi-Tool. Ranges come from the game files (${EXPORT_BUILD}).`,
  sources: `<p class="note src">Sources: the game's procedural technology, technology and product tables (exports/modules.json, ${EXPORT_BUILD}) for the ranges and blueprint stats; the item dataset for prices.</p>`,
};

/**
 * Blueprint (fixed-stat) technologies grouped under the technology they boost, `'all'` ones last without a heading.
 * `techs` gives the order and names.
 */
export function blueprintList(ctx: Ctx, techs: { key: string; name: string }[], list: SpecialTech[]): string {
  const grouped = techs
    .filter((t) => list.some((b) => b.tech === t.key))
    .map((t) => `<li><b>${esc(t.name)}</b>: ${list.filter((b) => b.tech === t.key).map((b) => `${chip(ctx, b.id)} ${esc(b.what)}`).join('; ')}</li>`);
  const general = list.filter((b) => !techs.some((t) => t.key === b.tech)).map((b) => `<li>${chip(ctx, b.id)} ${esc(b.what)}</li>`);
  return `<ul class="plain">${grouped.join('')}${general.join('')}</ul>`;
}

/** one platform's blueprint upgrades; empty when it has none */
export function blueprintCard(ctx: Ctx, plat: Platform): string {
  if (!plat.blueprints?.length) return '';
  return `<section class="card k-use" id="up-blueprints"><h3>${esc(plat.name)} blueprint upgrades <span class="ct">fixed stats</span></h3>
    <p class="note">Technologies with set stats, not random modules: their stats don't roll.</p>
    ${blueprintList(ctx, plat.techs, plat.blueprints)}</section>`;
}

/** roll-range card (technology picker + table), where-to-get card and blueprint card for one platform */
function platformCards(ctx: Ctx, plat: Platform, text: PageText): string {
  const tech = plat.techs.find((t) => t.key === ctx.state.upTech[plat.key]) ?? plat.techs[0];
  const row = upgradeCatalog(ctx.db, plat)[tech.key];
  const sal = salvageCatalog(ctx.db, plat)[tech.key];
  const picker = `<div class="ctrl" role="group" aria-label="Technology">${plat.techs
    .map((t) => `<button data-uptech="${t.key}" data-plat="${plat.key}" aria-pressed="${t === tech}">${esc(t.name)}</button>`)
    .join('')}</div>`;
  const hasItems = Object.keys(row).length > 0;
  const hasSal = Object.keys(sal).length > 0;
  const chips = (ids: string[] | undefined, label: string) => `<td>${ids?.length ? ids.map((id) => modChip(ctx, id, label)).join('') : '—'}</td>`;
  const rows = MOD_CLASSES.filter((c) => tech.rows[c]).map((c) => {
    const [n, ...vals] = tech.rows[c]!;
    const item = (hasItems ? chips(row[c], `${c}-class`) : '') + (hasSal ? chips(sal[c], `${c}-class`) : '');
    return `<tr><th scope="row" data-sort="${MOD_CLASSES.indexOf(c)}">${CLASS_LABEL[c]}</th>${item}<td class="num">${n}</td>${vals.map((v) => `<td class="num">${esc(v)}</td>`).join('')}</tr>`;
  });
  // upgrades outside the C–X ladder (Sentinel fragments) that roll this technology's stats
  const extra = (tech.extra ?? []).map((x, i) => {
    const [n, ...vals] = x.row;
    const item = (hasItems ? chips(x.ids, x.label) : '') + (hasSal ? chips(x.salvage, x.label) : '');
    return `<tr class="extra"><th scope="row" data-sort="${MOD_CLASSES.length + i}">${extraLabel(x)}</th>${item}<td class="num">${n}</td>${vals.map((v) => `<td class="num">${esc(v)}</td>`).join('')}</tr>`;
  });
  return `<section class="card k-craft" id="up-ranges"><h3>${esc(plat.name)} roll ranges <span class="ct">per module class</span></h3>
    ${picker}${table(['Class', ...(hasItems ? ['Module'] : []), ...(hasSal ? ['Salvaged'] : []), 'Stats', ...tech.stats.map(esc)], [...rows, ...extra])}
    <p class="note"><b>Judge a roll on:</b> ${esc(tech.judge)}</p>
    ${tech.note ? `<p class="note">${esc(tech.note)}</p>` : ''}${extraNotes(tech.extra)}
    ${hasSal ? `<p class="note">${text.salvage}</p>` : ''}
    <p class="note">${text.footer}</p>
  </section>
  <section class="card k-buy" id="up-where"><h3>Where to get ${esc(plat.noun ?? plat.name.toLowerCase())} modules</h3><ul class="plain note">${plat.where
    .map((w) => `<li>${w}</li>`)
    .join('')}</ul></section>${blueprintCard(ctx, plat)}`;
}

interface Head {
  icon: string;
  title: string;
  sub: string;
  /** aria-label of the platform tabs */
  label: string;
}

/** an upgrades page: head, rules line, platform tabs (when there are several) and one platform's cards */
function platformPage(ctx: Ctx, platforms: Platform[], head: Head, cross: string, text: PageText): string {
  const plat = platforms.find((p) => p.key === ctx.state.upPlat) ?? platforms[0];
  let h = pageHead(head.icon, 'var(--craft)', head.title, head.sub);
  h += `<p class="note">${text.rules(cross)}</p>`;
  if (platforms.length > 1)
    h += `<div class="ctrl" role="group" aria-label="${esc(head.label)}">${platforms
      .map((p) => `<button data-upplat="${p.key}" aria-pressed="${p === plat}">${p.icon} ${esc(p.name)}</button>`)
      .join('')}</div>`;
  h += platformCards(ctx, plat, text);
  return h + text.sources;
}

/** Ship upgrade ranges: starship, living ship, freighter; one platform at a time */
export const renderUpgrades = (ctx: Ctx): string =>
  platformPage(
    ctx,
    SHIP_PLATFORMS,
    {
      icon: '🚀',
      title: 'Ship upgrades',
      sub: 'What each upgrade-module class can roll for the starship, living ship and freighter, and which stat to judge a roll on.',
      label: 'Ship',
    },
    `Exosuit and Exocraft modules are on their own pages: ${link('exosuit', 'Exosuit upgrades')} and ${link('exocraft', 'Exocraft upgrades')}.`,
    DATAMINED,
  );

/** Exosuit upgrade ranges */
export const renderExosuit = (ctx: Ctx): string =>
  platformPage(
    ctx,
    [EXOSUIT],
    {
      icon: '🥽',
      title: 'Exosuit upgrades',
      sub: 'What each Exosuit upgrade-module class can roll, from Life Support and the jetpack to each hazard protection, and which stat to judge a roll on.',
      label: 'Exosuit',
    },
    `Starship, living ship and freighter modules are on ${link('upgrades', 'Ship upgrades')}.`,
    DATAMINED,
  );

/** Exocraft upgrade ranges: the wheeled Exocraft, the Nautilon and the Minotaur */
export const renderExocraft = (ctx: Ctx): string =>
  platformPage(
    ctx,
    EXOCRAFT_PLATFORMS,
    {
      icon: '🚙',
      title: 'Exocraft upgrades',
      sub: 'What each Exocraft upgrade-module class can roll for the Nomad, Roamer, Pilgrim, Colossus, Nautilon and Minotaur, which stat to judge a roll on, and the blueprint upgrades.',
      label: 'Exocraft',
    },
    `Starship, living ship and freighter modules are on ${link('upgrades', 'Ship upgrades')}, and Exosuit modules on ${link('exosuit', 'Exosuit upgrades')}.`,
    EXOCRAFT_TEXT,
  );

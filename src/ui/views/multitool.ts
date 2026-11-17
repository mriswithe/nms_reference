import { MOD_CLASSES, moduleCatalog, MT_TECH, RANGES, type ModClass } from '../../lib/multitool';
import { esc, fmt } from '../../lib/format';
import type { Ctx } from '../context';
import { chip, pageHead, swatch } from '../html';

const table = (head: string[], rows: string[], cls = '') =>
  `<div class="tscroll"><table class="tbl ${cls}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join(
    '',
  )}</tbody></table></div>`;

const CLASS_LABEL: Record<ModClass, string> = { C: 'C', B: 'B', A: 'A', S: 'S', X: 'X (Suspicious)' };

const card = (id: string, k: string, title: string, ct: string, body: string) =>
  `<section class="card ${k}" id="${id}"><h3>${esc(title)}${ct ? ` <span class="ct">${esc(ct)}</span>` : ''}</h3>${body}</section>`;

function rangesSection(ctx: Ctx): string {
  const tech = RANGES[ctx.state.mtTech] ? ctx.state.mtTech : 'mining';
  const t = RANGES[tech];
  const picker = `<div class="ctrl" role="group" aria-label="Technology">${MT_TECH.map(
    (m) => `<button data-mttech="${m.key}" aria-pressed="${m.key === tech}">${esc(m.name)}</button>`,
  ).join('')}</div>`;
  const rows = MOD_CLASSES.filter((c) => t.rows[c]).map((c) => {
    const [n, ...vals] = t.rows[c]!;
    return `<tr><th scope="row">${CLASS_LABEL[c]}</th><td class="num">${n}</td>${vals.map((v) => `<td class="num">${v}</td>`).join('')}</tr>`;
  });
  return card(
    'mt-ranges',
    'k-craft',
    'Roll ranges',
    'per module class',
    `${picker}${table(['Class', 'Stats', ...t.stats.map(esc)], rows)}<p class="note"><b>Judge a roll on:</b> ${esc(t.judge)}</p>
    <p class="note">"Stats" is how many of the listed stats a module rolls; which ones it gets is random when there are more stats than rolls. Damage on the guns is the game's own flat number, not a percent. Negative times are faster. Ranges come from the game files (Forsaken 7.1).</p>`,
  );
}

function shopSection(ctx: Ctx): string {
  const cat = moduleCatalog(ctx.db);
  const price = (c: ModClass) => {
    // nanite price from the Mining Beam row; X varies by tech (280–320)
    const vs = MT_TECH.map((m) => cat[m.key][c]).filter(Boolean).map((id) => ctx.db.items[id!]).filter((it) => it.cur === 'Nanites').map((it) => it.v);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    return lo === hi ? `${fmt(lo)}` : `${fmt(lo)}–${fmt(hi)}`;
  };
  const rows = MT_TECH.map(
    (m) =>
      `<tr><th scope="row">${esc(m.name)}</th>${MOD_CLASSES.map((c) => {
        const id = cat[m.key][c];
        // the row names the tech, and the column the class, so each cell is just the icon; the full name is the tooltip
        return `<td>${id ? `<button class="chip" data-go="${id}" aria-label="${c}-class: ${esc(ctx.db.items[id].n)}" title="${esc(ctx.db.items[id].n)} (${esc(ctx.db.items[id].g)})">${swatch(ctx, id, 'sm')}</button>` : '—'}</td>`;
      }).join('')}</tr>`,
  );
  return card(
    'mt-shop',
    'k-buy',
    'Shopping list',
    'modules by class',
    `${table(['Tech', ...MOD_CLASSES.map((c) => `${c}<br><span class="q">${price(c)}</span>`)], rows, 'shop')}
    <p class="note">Prices are in nanites, under each class letter. X is the black-market Suspicious class.</p>
    <ul class="plain note">
      <li><b>C–S</b>: the Technology Merchant on any space station. C is always stocked; which higher classes appear changes from system to system, so check a few stations.</li>
      <li><b>X (Suspicious)</b>: outlaw stations' Salvage Dealer, trader ships and buried caches. The floor is about C-class, the ceiling beats S.</li>
      <li>Prices are base values; terminals vary a little by station. Selling an unused module gets more back than selling one you've installed and packaged.</li>
    </ul>`,
  );
}

export function renderMultitool(ctx: Ctx): string {
  let h = pageHead(
    '🔧',
    'var(--craft)',
    'Multi-Tool min/max guide',
    'How to get the most out of Multi-Tool upgrade modules: what each class can roll, how to reroll, where to place modules, and which tool to start from.',
  );
  h += `<nav class="summary" aria-label="Multi-Tool guide">
    <a href="#" data-jump="mt-rules">The short version</a><a href="#" data-jump="mt-ranges">Roll ranges</a><a href="#" data-jump="mt-reroll">Rerolling</a><a href="#" data-jump="mt-layout">Layout</a><a href="#" data-jump="mt-tool">Choosing the tool</a><a href="#" data-jump="mt-builds">Builds</a><a href="#" data-jump="mt-shop">Shopping list</a></nav>`;

  h += card(
    'mt-rules',
    'k-cook',
    'The short version',
    '',
    `<ol class="plain">
      <li><b>Pick the right tool first.</b> The tool's own class bonuses (damage, mining, scanning) are fixed by its seed and can't be rerolled. Upgrading its class only adds slots and supercharged slots.</li>
      <li><b>Three modules per technology, no more.</b> A fourth of the same family (C, B, A, S and X together) switches all of them off ("Technology overloaded").</li>
      <li><b>Stats roll when you install, not when you buy.</b> Save first, install, and reload if the roll is bad. See <a href="#" class="jl" data-jump="mt-reroll">Rerolling</a>.</li>
      <li><b>Cluster each technology with its three modules</b> in a square, on the supercharged slots when you can.</li>
      <li><b>S is not always best.</b> X-class (Suspicious) modules can beat S on the stat you care about, and can also roll near C-class. They're worth rerolling.</li>
    </ol>`,
  );

  h += rangesSection(ctx);

  h += card(
    'mt-reroll',
    'k-refine',
    'Rerolling a module',
    'save-scumming',
    `<p class="note" style="margin-top:0">A module's stats are not stored on it when you buy it. They come from a roll sequence that moves on <b>each time you install any upgrade module</b>. Station, merchant slot and purchase order don't matter. Reloading alone gives the same roll again, and dismantling a module doesn't move the sequence on.</p>
    <ol class="plain">
      <li>Buy the module you want plus a few cheap C-class modules of any type.</li>
      <li>Make a restore point: get in and out of your ship, or use a save beacon.</li>
      <li>Install the expensive module and read its stats.</li>
      <li>Bad roll? Reload. Install one C-class module (this moves the sequence on), then dismantle it.</li>
      <li>Install the expensive module again. Repeat until the stats you care about are near the top of the range.</li>
    </ol>
    <p class="note">Once a module is installed you can move it between slots, and pack it up to put into another tool. Leaving a system and coming back restocks its merchants, and so does reloading a save from before you bought.</p>
    <p class="note">This has worked since the NEXT update and no patch since has changed it. If a reload gives you a different roll, the game has changed: fall back to buying from several stations.</p>`,
  );

  h += card(
    'mt-layout',
    'k-mine',
    'Layout',
    'supercharged slots and adjacency',
    `<ul class="plain">
      <li><b>Supercharged slots</b> (glowing): from 1 on a C-class tool to 4 on an S-class one. A module or technology on one gets a large boost, often 25–30% or more depending on the roll. Where they sit is fixed by the tool's seed, so check the layout before you upgrade the class.</li>
      <li><b>Put your three best modules on them first.</b> On an S-class tool, the main technology plus its three modules in a 2×2 square over the supercharged slots is the strongest single build.</li>
      <li><b>Adjacency</b>: every touching side between related technologies adds a bonus, summed before the class bonus. A tight square of one technology and its modules touches more sides than a line.</li>
      <li><b>Craftable add-ons don't count toward the cap of three.</b> Optical Drill, Advanced Mining Laser and the like are separate technologies; slot them next to the Mining Beam group.</li>
      <li><b>Sentinel Weapons Shards</b> (Forbidden modules, from Salvaged Glass) boost the Boltcaster and are a separate family. The wiki says you can add up to three of them on top of three Boltcaster modules. Players report this; it isn't confirmed in the game files.</li>
    </ul>`,
  );

  const types: [string, string, string, string, string, string][] = [
    ['Pistol', '0', '20–35', '40–50', '9–18', 'Space station / planet cabinets'],
    ['Rifle', '15–20', '0', '15–20', '13–30', 'Cabinets'],
    ['Experimental', '15–25', '25–30', '100', '9–30', 'Cabinets'],
    ['Alien', '25–35', '15–20', '50–60', '9–30', 'Cabinets'],
    ['Royal', '15–25', '25–30', '100', '20', 'Sentinel Pillars'],
    ['Sentinel', '25–50', '10–15', '40–50', '17–30', 'Harmonic Camps (free)'],
    ['Atlantid', '10–20', '35–50', '40–50', '17–30', 'Korvax Monolith, after "They Who Returned"'],
    ['Voltaic Staff', '25–50', '10–15', '40–50', '17–30', 'Autophage Synthesis Terminal'],
  ];
  h += card(
    'mt-tool',
    'k-use',
    'Choosing the tool',
    'S-class bonus ranges',
    `${table(
      ['Type', 'Damage %', 'Mining %', 'Scanning %', 'Slots found', 'Where'],
      types.map(([t, ...r]) => `<tr><th scope="row">${t}</th>${r.map((v, i) => `<td${i < 4 ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`),
    )}
    <p class="note">Lower classes follow the same pattern with smaller numbers. These bonuses are fixed per tool. To get better ones, find another tool of the same type (reload, or re-warp to the same cabinet or Pillar) rather than upgrading.</p>
    <div class="grid2" style="margin-top:12px">
      <div>${table(
        ['Economy', 'C', 'B', 'A', 'S'],
        [
          ['Poor', '60%', '30%', '10%', '0%'],
          ['Average', '49%', '35%', '15%', '1%'],
          ['Wealthy', '30%', '40%', '28%', '2%'],
          ['Outlaw', '85%', '5%', '5%', '5%'],
        ].map(([e, ...r]) => `<tr><th scope="row">${e}</th>${r.map((v) => `<td class="num">${v}</td>`).join('')}</tr>`),
      )}<p class="note">How likely a found tool is to be each class, by system economy.</p></div>
      <div>${table(
        ['Upgrade', 'Standard', 'Discounted', 'Expensive'],
        [
          ['C → B', '10,000', '3,300', '25,000'],
          ['B → A', '25,000', '8,250', '62,500'],
          ['A → S', '50,000', '16,500', '125,000'],
          ['Total', '85,000', '28,050', '212,500'],
        ].map(([e, ...r]) => `<tr><th scope="row">${e}</th>${r.map((v) => `<td class="num">${v}</td>`).join('')}</tr>`),
      )}<p class="note">Nanites to raise a tool's class at a station's Multi-Tool Upgrade Station, by difficulty setting. Upgrading costs far less than hunting for an S-class drop (1–2% even in wealthy systems), but it doesn't change the type's bonus ranges.</p></div>
    </div>
    <p class="note"><b>Slot caps by class:</b> C 21, B 30, A 45, S 60. Buy early slots with units, and save ${chip(ctx, 'conTech64')} items for the costly later ones.</p>`,
  );

  h += card(
    'mt-builds',
    'k-cook',
    'Builds',
    '',
    `<ul class="plain">
      <li><b>Mining / money</b>: an Atlantid (highest mining bonus), or an Experimental or Royal if you also want the 100% scanning bonus. Put the Mining Beam and three S or high-rolled X modules in a supercharged square, with the Optical Drill and Advanced Mining Laser next to it. Then add the Scanner with three S modules: analysis rewards of 6,500–10,000% each are a steady earner of units and nanites.</li>
      <li><b>Combat</b>: a Sentinel tool or a Staff (up to +50% damage), or an Alien. Choose <i>one</i> main weapon and give it the supercharged square and three modules. Rolls vary most on Neutron Cannon charge time (−30 to −50% at S), Scatter Blaster damage and reload, and Blaze Javelin damage (up to 85 on X). If your main weapon is the Boltcaster, Sentinel Weapons Shards can add more on top.</li>
      <li><b>Everything else</b> gets its base technology only. A second weapon at C-class modules is rarely worth the slots on a combat tool.</li>
    </ul>`,
  );

  h += shopSection(ctx);
  h += `<p class="note">Sources: datamined module tables (nomansskyrecipes.com, Forsaken 7.1) and the No Man's Sky Wiki. The reroll method, supercharge sizes and Forbidden-module cap come from player testing, not game files.</p>`;
  return h;
}

import { MOD_CLASSES, moduleCatalog, MT_TECH, RANGES, SPECIAL, type ModClass } from '../../lib/multitool';
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

const nav = (label: string, links: [string, string][]) =>
  `<nav class="summary" aria-label="${esc(label)}">${links.map(([id, t]) => `<a href="#" data-jump="${id}">${esc(t)}</a>`).join('')}</nav>`;

/** link to the other half of the guide */
const toPage = (view: string, text: string) => `<a href="#${view}" class="jl" data-go="${view}">${esc(text)}</a>`;

// ---------------------------------------------------------------- part 1: the Multi-Tools themselves

export function renderMultitool(ctx: Ctx): string {
  let h = pageHead(
    '🔧',
    'var(--craft)',
    'Multi-Tools',
    'Which Multi-Tool to start from: type bonuses, class odds and upgrade costs, slots and supercharged slots, and builds.',
  );
  h += `<p class="note">Part 1 of the Multi-Tool guide. Part 2, ${toPage('mtupgrades', 'Multi-Tool upgrades')}, covers modules: roll ranges, rerolling, layout and where to buy them.</p>`;
  h += nav('Multi-Tools', [
    ['mt-rules', 'The short version'],
    ['mt-tool', 'Tool types'],
    ['mt-class', 'Class and slots'],
    ['mt-super', 'Supercharged slots'],
    ['mt-builds', 'Builds'],
  ]);

  h += card(
    'mt-rules',
    'k-cook',
    'The short version',
    '',
    `<ol class="plain">
      <li><b>Pick the right tool first.</b> The tool's own bonuses (damage, mining, scanning) are fixed by its seed and can't be rerolled. Upgrading its class only adds slots and supercharged slots.</li>
      <li><b>Look at the supercharged slots before you pay to upgrade.</b> Their positions come with the tool, and a good layout matters more than a few percent of bonus.</li>
      <li><b>Upgrading is cheaper than hunting.</b> Raising a tool from C to S costs 85,000 nanites on standard difficulty; an S-class drop is 1–2% even in wealthy systems.</li>
      <li><b>Then fill it with modules.</b> See ${toPage('mtupgrades', 'Multi-Tool upgrades')}.</li>
    </ol>`,
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
    'Tool types',
    'S-class bonus ranges',
    `${table(
      ['Type', 'Damage %', 'Mining %', 'Scanning %', 'Slots found', 'Where'],
      types.map(([t, ...r]) => `<tr><th scope="row">${t}</th>${r.map((v, i) => `<td${i < 4 ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`),
    )}
    <p class="note">Lower classes follow the same pattern with smaller numbers. These bonuses are fixed per tool. To get better ones, find another tool of the same type (reload, or re-warp to the same cabinet or Pillar) rather than upgrading.</p>
    <p class="note">Sentinel and Atlantid tools come with their own mining lasers; see Special upgrades in ${toPage('mtupgrades', 'Multi-Tool upgrades')}.</p>`,
  );

  h += card(
    'mt-class',
    'k-craft',
    'Class and slots',
    'odds and upgrade costs',
    `<div class="grid2">
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
      )}<p class="note">Nanites to raise a tool's class at a station's Multi-Tool Upgrade Station, by difficulty setting. It doesn't change the type's bonus ranges.</p></div>
    </div>
    <p class="note"><b>Slot caps by class:</b> C 21, B 30, A 45, S 60. Buy early slots with units, and save ${chip(ctx, 'conTech64')} items for the costly later ones.</p>`,
  );

  h += card(
    'mt-super',
    'k-mine',
    'Supercharged slots',
    '',
    `<ul class="plain">
      <li><b>From 1 on a C-class tool to 4 on an S-class one.</b> Upgrading the class adds them; where they sit is fixed by the tool's seed.</li>
      <li><b>A module or technology on one gets a large boost</b>, often 25–30% or more depending on the roll.</li>
      <li><b>Best case:</b> the supercharged slots touch in a 2×2 square, so one technology and its three modules can all sit on them. A tool with its supercharged slots scattered is worth replacing before you spend on it.</li>
    </ul>`,
  );

  h += card(
    'mt-builds',
    'k-cook',
    'Builds',
    '',
    `<ul class="plain">
      <li><b>Mining / money</b>: an Atlantid (highest mining bonus), or an Experimental or Royal if you also want the 100% scanning bonus. Put the Mining Beam and three S or high-rolled X modules in a supercharged square, with the Optical Drill and Advanced Mining Laser next to it. Then add the Scanner with three S modules: analysis rewards of 6,500–10,000% each are a steady earner of units and nanites.</li>
      <li><b>Combat</b>: a Sentinel tool or a Staff (up to +50% damage), or an Alien. Choose <i>one</i> main weapon and give it the supercharged square, three modules and its blueprint upgrades. Rolls vary most on Neutron Cannon charge time (−30 to −50% at S), Scatter Blaster damage and reload, and Blaze Javelin damage (up to 85 on X). Sentinel Weapons Shards add more on top.</li>
      <li><b>Everything else</b> gets its base technology only. A second weapon at C-class modules is rarely worth the slots on a combat tool.</li>
    </ul>`,
  );

  h += `<p class="note">Sources: the No Man's Sky Wiki and player testing (supercharge sizes, class odds).</p>`;
  return h;
}

// ---------------------------------------------------------------- part 2: upgrades

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

function specialSection(ctx: Ctx): string {
  const s = SPECIAL;
  const shard = s.shard;
  const shardRows = shard.stats.map(([stat, range]) => `<tr><th scope="row">${esc(stat)}</th><td class="num">${esc(range)}</td></tr>`);
  const bp = MT_TECH.filter((m) => s.blueprints.some((b) => b.tech === m.key)).map((m) => {
    const list = s.blueprints.filter((b) => b.tech === m.key);
    return `<li><b>${esc(m.name)}</b>: ${list.map((b) => `${chip(ctx, b.id)} ${esc(b.what)}`).join('; ')}</li>`;
  });
  const general = s.blueprints.filter((b) => !MT_TECH.some((m) => m.key === b.tech));
  return card(
    'mt-special',
    'k-buy',
    'Special upgrades',
    'Sentinel, blueprint and tool-type tech',
    `<h4 class="sub">${chip(ctx, shard.id)} <span class="q">from</span> ${chip(ctx, shard.glass)}</h4>
    <ul class="plain note">${shard.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    ${shardRows.length ? table(['Stat', 'Range'], shardRows, 'fit') : ''}
    <h4 class="sub">Blueprint upgrades</h4>
    <p class="note">Fixed-stat technologies, not random modules: they don't roll, don't count toward the cap of three, and get adjacency from the technology they boost, so slot them next to its group.</p>
    <ul class="plain">${bp.join('')}${general.map((b) => `<li>${chip(ctx, b.id)} ${esc(b.what)}</li>`).join('')}</ul>
    <h4 class="sub">Quest and tool-type technology</h4>
    <ul class="plain">${s.typed.map((b) => `<li>${chip(ctx, b.id)} ${esc(b.what)}</li>`).join('')}</ul>`,
  );
}

function shopSection(ctx: Ctx): string {
  const cat = moduleCatalog(ctx.db);
  const price = (c: ModClass) => {
    // nanite price range across techs; X varies by tech (280–320)
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

export function renderMtUpgrades(ctx: Ctx): string {
  let h = pageHead(
    '🔩',
    'var(--craft)',
    'Multi-Tool upgrades',
    'How to get the most out of Multi-Tool upgrade modules: what each class can roll, how to reroll, where to place modules, the Sentinel and blueprint upgrades, and where to buy.',
  );
  h += `<p class="note">Part 2 of the Multi-Tool guide. Part 1, ${toPage('multitool', 'Multi-Tools')}, covers choosing and upgrading the tool itself.</p>`;
  h += nav('Multi-Tool upgrades', [
    ['mt-mrules', 'The short version'],
    ['mt-ranges', 'Roll ranges'],
    ['mt-reroll', 'Rerolling'],
    ['mt-layout', 'Layout'],
    ['mt-special', 'Special upgrades'],
    ['mt-shop', 'Shopping list'],
  ]);

  h += card(
    'mt-mrules',
    'k-cook',
    'The short version',
    '',
    `<ol class="plain">
      <li><b>Three modules per technology, no more.</b> A fourth of the same family (C, B, A, S and X together) switches all of them off ("Technology overloaded").</li>
      <li><b>Stats roll when you install, not when you buy.</b> Save first, install, and reload if the roll is bad. See <a href="#" class="jl" data-jump="mt-reroll">Rerolling</a>.</li>
      <li><b>Cluster each technology with its three modules</b> in a square, on the supercharged slots when you can.</li>
      <li><b>S is not always best.</b> X-class (Suspicious) modules can beat S on the stat you care about, and can also roll near C-class. They're worth rerolling.</li>
      <li><b>Blueprint upgrades and Sentinel Weapons Shards are extra.</b> They sit outside the cap of three; see <a href="#" class="jl" data-jump="mt-special">Special upgrades</a>.</li>
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
      <li><b>Put your three best modules on the supercharged slots first.</b> On an S-class tool, the main technology plus its three modules in a 2×2 square over the supercharged slots is the strongest single build. See ${toPage('multitool', 'Supercharged slots')} in part 1.</li>
      <li><b>Adjacency</b>: every touching side between related technologies adds a bonus, summed before the class bonus. A tight square of one technology and its modules touches more sides than a line.</li>
      <li><b>Blueprint add-ons</b> (Optical Drill, Advanced Mining Laser, Mass Accelerator and the like) are separate technologies; slot them against the side of their group.</li>
    </ul>`,
  );

  h += specialSection(ctx);
  h += shopSection(ctx);
  h += `<p class="note">Sources: datamined module tables (nomansskyrecipes.com, Forsaken 7.1) and the No Man's Sky Wiki. The reroll method and the Sentinel Weapons Shard cap come from player testing, not game files.</p>`;
  return h;
}

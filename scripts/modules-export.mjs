/**
 * Exports every upgrade module in the game, with the stat ranges it rolls, to exports/modules.{json,csv}:
 *   procedural modules  (procedural technology table: C/B/A/S/X, "Rusted", Sentinel and Autophage modules)
 *   fixed upgrades      (technology table: non-procedural Upgrade techs, i.e. blueprint upgrades with fixed stats)
 * Each entry carries its platform, the technology it upgrades, the products that deploy it (shop modules,
 * salvage, "Suspicious …", "Salvaged Fleet …") and English names. Values are the game's stored numbers, not
 * what the module card shows; see `kind` on each stat.
 *
 * Input is a folder of MXML files converted from a local game install:
 *   1. Unpack with HGPAKtool (pip install HGPAKtool), from GAMEDATA/PCBANKS:
 *        NMSARC.Precache.pak    metadata/reality/tables/{nms_reality_gcproceduraltechnologytable,
 *                               nms_reality_gctechnologytable,nms_reality_gcproducttable}.mbin
 *        NMSARC.MetadataEtc.pak metadata/reality/defaultreality.mbin, language/nms_*_english.mbin
 *      e.g. hgpaktool -U -O .cache/gamedata -f "metadata/reality/*" -f "language/*english*" <the two paks>
 *   2. Convert each .mbin to .MXML with MBINCompiler (a release matching the game version):
 *        MBINCompiler convert -y -f -Q .cache/gamedata
 *      (it needs the .NET 8 runtime; a local one works: set DOTNET_ROOT to its folder)
 *   3. node scripts/modules-export.mjs <folder holding metadata/ and language/> [game version label]
 *
 * Stat `kind` is inferred from the stored numbers (the game's display rules live in the executable, not the
 * data): "multiplier" (1.10 = +10%, 0.90 = −10%), "fraction" (0.30 = +30%, added to the base) or "flat"
 * (a plain amount: damage, light years, clip size, seconds of protection). Nothing is converted.
 * `lessIsBetter` is the game's own stat-screen flag (defaultreality Stats); null where the stat isn't listed there.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/modules-export.mjs <mxml folder> [game version label]');
  process.exit(1);
}
const gameVersion = process.argv[3] ?? 'unknown';
const tables = path.join(root, 'metadata/reality/tables');
const outDir = path.join(import.meta.dirname, '..', 'exports');
const siteData = path.join(import.meta.dirname, '..', 'src', 'data', 'nms.json');

const unxml = (s) =>
  s.replace(/&#xA;/g, '\n').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** MXML -> tree of { name, value, id, index, kids } */
function parse(file) {
  const s = fs.readFileSync(file, 'utf8');
  const top = { kids: [] };
  const stack = [top];
  for (const m of s.matchAll(/<(\/?)(?:Property|Data)((?:\s+\w+="[^"]*")*)\s*(\/?)>/g)) {
    if (m[1]) {
      stack.pop();
      continue;
    }
    const a = Object.fromEntries([...m[2].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], unxml(x[2])]));
    const node = { name: a.name ?? a.template, value: a.value, id: a._id, index: a._index, kids: [] };
    stack.at(-1).kids.push(node);
    if (!m[3]) stack.push(node);
  }
  return top.kids[0];
}
/** tree -> plain JS; lists become arrays, single-value enum wrappers ({StatsType: 'X'}) become their value */
function plain(n) {
  if (!n.kids.length) return n.value ?? [];
  if (n.value && n.kids.length === 1 && !n.kids[0].kids.length) return n.kids[0].value;
  if (n.kids.every((k) => k.name === n.name)) return n.kids.map(plain);
  const o = {};
  for (const k of n.kids) o[k.name] = plain(k);
  return o;
}
const table = (f) => plain(parse(path.join(tables, f))).Table;

// English text by localisation key (UK English, as the other scripts use)
const lang = {};
for (const f of fs.readdirSync(path.join(root, 'language')).filter((f) => /_english\.MXML$/i.test(f) && !/usenglish/i.test(f)))
  for (const m of fs.readFileSync(path.join(root, 'language', f), 'utf8').matchAll(/<Property name="Id" value="([^"]+)" \/>\s*<Property name="English" value="([^"]*)"/g))
    lang[m[1]] ??= unxml(m[2]);
const en = (k) => (k ? lang[k] ?? lang[k.toUpperCase()] : undefined);
const clean = (s) => s?.replace(/<[A-Z_]*>|<>/g, '').replace(/\n+/g, ' ').trim();

const proc = table('nms_reality_gcproceduraltechnologytable.MXML');
const tech = table('nms_reality_gctechnologytable.MXML');
const products = table('nms_reality_gcproducttable.MXML');
const techById = Object.fromEntries(tech.map((t) => [t.ID, t]));

// "less is better" flags from the game's stat groups (defaultreality Stats)
const lessIsBetter = {};
{
  const s = fs.readFileSync(path.join(root, 'metadata/reality/defaultreality.MXML'), 'utf8');
  for (const m of s.matchAll(/name="StatsType" value="(\w+)" \/>\s*<\/Property>\s*<Property name="Colour">[\s\S]*?name="LessIsBetter" value="(\w+)"/g))
    lessIsBetter[m[1]] ??= m[2] === 'true';
}

const PLATFORM = {
  Weapon: 'Multi-Tool',
  Suit: 'Exosuit',
  Ship: 'Starship',
  AllShips: 'Starship (all ships)',
  AllShipsExceptAlien: 'Starship',
  AlienShip: 'Living Ship',
  RobotShip: 'Sentinel Interceptor',
  Freighter: 'Freighter',
  Exocraft: 'Exocraft (Nomad, Roamer, Pilgrim, Colossus)',
  AllVehicles: 'Exocraft (all)',
  Colossus: 'Exocraft (Colossus)',
  Submarine: 'Exocraft (Nautilon)',
  Mech: 'Exocraft (Minotaur)',
  Corvette: 'Corvette',
};
/** tech categories whose base technologies a template's modules can upgrade */
const COMPAT = {
  Weapon: ['Weapon'],
  Suit: ['Suit'],
  AllShipsExceptAlien: ['Ship', 'AllShips', 'AllShipsExceptAlien'],
  AlienShip: ['AlienShip', 'AllShips'],
  Freighter: ['Freighter'],
  Exocraft: ['Exocraft', 'AllVehicles', 'Colossus'],
  Submarine: ['Submarine', 'AllVehicles'],
  Mech: ['Mech', 'AllVehicles'],
  Corvette: ['Corvette'],
};
const CLASS = { Normal: 'C', Rare: 'B', Epic: 'A', Legendary: 'S', Illegal: 'X', SeaTrash: 'rusted', Sentinel: 'special', Robot: 'special' };

// stat kind, judged over every value the stat takes anywhere in the procedural table
const statValues = {};
for (const p of proc) for (const s of p.StatLevels) (statValues[s.Stat] ??= []).push(+s.ValueMin, +s.ValueMax);
/** stats the numbers alone misjudge: analysis rewards are stored as 10..110 but shown as +1,000..+11,000% */
const KIND = { Weapon_Scan_Discovery_Creature: 'fraction', Weapon_Scan_Discovery_Flora: 'fraction', Weapon_Scan_Discovery_Mineral: 'fraction' };
const kindOf = (stat, vals = statValues[stat] ?? []) =>
  KIND[stat] ?? (vals.every((v) => Number.isInteger(v)) || vals.some((v) => v > 2.5) ? 'flat' : vals.some((v) => v < 0.5) ? 'fraction' : 'multiplier');
/** stat labels are keyed by the upper-cased stat name, cut to the game's 31-character key limit */
const statLabel = (s) => en(s.toUpperCase().slice(0, 31)) ?? en('STATS_' + s.toUpperCase()) ?? null;

// site dataset items, matched by English name + group, so the export can be joined to nms.json
const site = fs.existsSync(siteData) ? JSON.parse(fs.readFileSync(siteData, 'utf8')).items : {};
const siteIds = (pred) => Object.entries(site).filter(([, it]) => pred(it)).map(([id]) => id);

const deployers = {};
for (const p of products) if (p.DeploysInto) (deployers[p.DeploysInto] ??= []).push(p);
const productOut = (p) => {
  const name = en(p.NameLower) ?? en(p.Name) ?? null;
  const group = en(p.Subtitle) ?? null;
  return {
    id: p.ID,
    name,
    group,
    nameKey: name ? undefined : p.NameLower || p.Name,
    baseValue: +p.BaseValue,
    rarity: p.Rarity,
    siteIds: name ? siteIds((it) => it.n === name && it.g === group && it.c !== 'Tech module') : [],
  };
};

/** base (non-upgrade) technologies a template upgrades: same base stat, compatible category */
function baseTechs(tpl) {
  const cats = COMPAT[tpl.Category] ?? [tpl.Category];
  return tech
    .filter((t) => t.IsTemplate !== 'true' && t.Upgrade !== 'true' && t.Procedural !== 'true' && t.BaseStat === tpl.BaseStat && cats.includes(t.Category))
    .map((t) => ({ id: t.ID, name: en(t.NameLower) ?? en(t.Name) ?? null }));
}

const modules = [];

for (const p of proc) {
  const tpl = techById[p.Template];
  const corvette = p.ID.startsWith('CV_');
  const techName = en(p.NameLower) ?? en(p.Group) ?? null;
  const subtitle = en(p.Subtitle)?.replace('%NAME%', techName ?? '') ?? null;
  const prods = (deployers[p.ID] ?? []).map(productOut);
  modules.push({
    id: p.ID,
    name: prods.find((x) => x.name)?.name ?? subtitle ?? techName,
    group: subtitle,
    nameKeys: en(p.Subtitle) ? undefined : { name: p.NameLower, subtitle: p.Subtitle, group: p.Group },
    platform: corvette ? 'Corvette' : PLATFORM[tpl?.Category] ?? tpl?.Category ?? null,
    techCategory: tpl?.Category ?? null,
    template: { id: p.Template, name: en(tpl?.Group) ?? null, baseStat: tpl?.BaseStat ?? null },
    upgrades: tpl && baseTechs(tpl).length ? baseTechs(tpl) : [{ id: null, name: techName, note: 'no base technology shares this base stat; name comes from the module itself' }],
    class: CLASS[p.Quality] ?? p.Quality,
    quality: p.Quality,
    procedural: true,
    statsRolled: { min: +p.NumStatsMin, max: +p.NumStatsMax },
    weighting: p.WeightingCurve,
    stats: p.StatLevels.map((s) => ({
      stat: s.Stat,
      label: statLabel(s.Stat),
      min: +s.ValueMin,
      max: +s.ValueMax,
      kind: kindOf(s.Stat),
      lessIsBetter: lessIsBetter[s.Stat] ?? null,
      weighting: s.WeightingCurve,
      always: s.AlwaysChoose === 'true',
    })),
    products: prods,
    installedSiteIds: subtitle ? siteIds((it) => it.c === 'Tech module' && (it.g === subtitle || prods.some((x) => x.name === it.n && x.group === it.g))) : [],
    description: clean(en(p.Description)) ?? null,
    source: 'nms_reality_gcproceduraltechnologytable' + (prods.length ? ' + nms_reality_gcproducttable (DeploysInto)' : ''),
    notes: [
      ...(corvette ? ['Platform inferred from the CV_ id prefix.'] : []),
      ...(prods.length ? [] : ['No product deploys this module.']),
      ...p.StatLevels.filter((s) => +s.ValueMin > +s.ValueMax).map((s) => `${s.Stat} is stored with min > max (${+s.ValueMin} > ${+s.ValueMax}).`),
    ],
  });
}

// fixed-stat upgrades: non-procedural Upgrade techs (blueprints, quest and expedition rewards)
for (const t of tech.filter((t) => t.Upgrade === 'true' && t.Procedural !== 'true' && t.IsTemplate !== 'true')) {
  const name = en(t.NameLower) ?? en(t.Name) ?? null;
  const bonuses = Array.isArray(t.StatBonuses) ? t.StatBonuses : [];
  const prods = (deployers[t.ID] ?? []).filter((p) => !/%NAME%/.test(en(p.NameLower) ?? en(p.Name) ?? '')).map(productOut);
  const req = (Array.isArray(t.Requirements) ? t.Requirements : []).map((r) => ({ id: r.ID, name: en(products.find((p) => p.ID === r.ID)?.NameLower) ?? null, amount: +r.Amount }));
  modules.push({
    id: t.ID,
    name,
    group: en(t.Subtitle) ?? null,
    platform: PLATFORM[t.Category] ?? t.Category,
    techCategory: t.Category,
    template: null,
    upgrades: tech
      .filter((b) => b.IsTemplate !== 'true' && b.Upgrade !== 'true' && (b.ID === t.RequiredTech || (!t.RequiredTech && b.BaseStat === t.BaseStat && (COMPAT[t.Category] ?? [t.Category]).includes(b.Category))))
      .map((b) => ({ id: b.ID, name: en(b.NameLower) ?? en(b.Name) ?? null })),
    class: 'special',
    quality: null,
    procedural: false,
    statsRolled: { min: bonuses.length, max: bonuses.length },
    weighting: null,
    stats: bonuses.map((b) => ({
      stat: b.Stat,
      label: statLabel(b.Stat),
      min: +b.Bonus,
      max: +b.Bonus,
      kind: kindOf(b.Stat, statValues[b.Stat] ?? [+b.Bonus]),
      lessIsBetter: lessIsBetter[b.Stat] ?? null,
      level: +b.Level,
      always: true,
    })),
    products: prods,
    installedSiteIds: name ? siteIds((it) => it.n === name && /Technology|Constructed tech/.test(it.c)) : [],
    blueprint: {
      requiredTech: t.RequiredTech || null,
      fragmentCost: +t.FragmentCost,
      rarity: t.Rarity,
      techShopRarity: t.TechShopRarity,
      dispensingRace: t.DispensingRace,
      buildCost: req,
    },
    description: clean(en(t.Description)) ?? null,
    source: 'nms_reality_gctechnologytable (Upgrade=true, Procedural=false; StatBonuses are fixed)',
    notes: ['Fixed stats: min = max = the StatBonus value; `level` is the bonus level the game uses for stacking/adjacency.'],
  });
}

// products that deploy an id neither table defines (unfinished content, e.g. the U_CR* corvette modules)
const known = new Set([...proc.map((p) => p.ID), ...tech.map((t) => t.ID)]);
const orphanDeployers = products.filter((p) => p.DeploysInto && !known.has(p.DeploysInto)).map((p) => ({ ...productOut(p), deploysInto: p.DeploysInto, nameKey: p.NameLower || p.Name, groupKey: p.Subtitle }));

const json = { gameVersion, extractedAt: new Date().toISOString(), counts: {}, orphanDeployers, modules };
for (const m of modules) {
  const k = `${m.platform} / ${m.class}`;
  json.counts[k] = (json.counts[k] ?? 0) + 1;
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'modules.json'), JSON.stringify(json, null, 1) + '\n');

const csvCell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const cols = ['id', 'name', 'platform', 'upgrades', 'class', 'statsMin', 'statsMax', 'stat', 'label', 'min', 'max', 'kind', 'always', 'products', 'price', 'source'];
const rows = [cols.join(',')];
for (const m of modules)
  for (const s of m.stats.length ? m.stats : [{}])
    rows.push(
      [
        m.id,
        m.name,
        m.platform,
        m.upgrades.map((u) => u.name ?? u.id).join(' / ') || m.template?.name,
        m.class,
        m.statsRolled.min,
        m.statsRolled.max,
        s.stat,
        s.label,
        s.min,
        s.max,
        s.kind,
        s.always,
        m.products.map((p) => p.id).join(' '),
        m.products.map((p) => p.baseValue).join(' '),
        m.procedural ? 'proc' : 'tech',
      ]
        .map(csvCell)
        .join(','),
    );
fs.writeFileSync(path.join(outDir, 'modules.csv'), rows.join('\n') + '\n');
console.log(`${modules.length} modules (${proc.length} procedural), ${rows.length - 1} csv rows -> ${outDir}`);

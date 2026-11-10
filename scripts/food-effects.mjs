/**
 * Adds food effects from the game's own data to src/data/nms.json:
 *   item.eat   what eating it does            (consumable table -> reward table)
 *   item.ing   Nutrient Ingestor stat + value (product table FoodBonusStat / CookingValue)
 *   fstat      per-stat ingestor ranges        (defaultreality FoodStatValues) + English labels
 *
 * Input is a folder of MXML files converted from a local game install:
 *   1. Unpack with HGPAKtool (pip install HGPAKtool), from GAMEDATA/PCBANKS:
 *        NMSARC.Precache.pak    metadata/reality/tables/{nms_reality_gcproducttable,consumableitemtable,rewardtable}.mbin
 *        NMSARC.MetadataEtc.pak metadata/reality/defaultreality.mbin, language/nms_*_english.mbin
 *   2. Convert each .mbin to .MXML with MBINCompiler (a release matching the game version).
 *   3. node scripts/food-effects.mjs <folder holding metadata/ and language/>
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/food-effects.mjs <mxml folder>');
  process.exit(1);
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tables = 'metadata/reality/tables/';
const dataFile = path.join(import.meta.dirname, '..', 'src', 'data', 'nms.json');

const unxml = (s) =>
  s.replace(/&#xA;/g, '\n').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const field = (blk, name) => blk.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1];

// English text by localisation key
const lang = {};
for (const f of fs.readdirSync(path.join(root, 'language')).filter((f) => /_english\.MXML$/i.test(f)))
  for (const m of read('language/' + f).matchAll(/<Property name="Id" value="([^"]+)" \/>\s*<Property name="English" value="([^"]*)"/g))
    lang[m[1]] ??= unxml(m[2]);

// products: id -> name, ingestor stat, cooking value
const products = {};
for (const blk of read(tables + 'nms_reality_gcproducttable.MXML').split('<Property name="Table" value="GcProductData"').slice(1)) {
  const stat = blk.match(/name="FoodBonusStat" value="GcStatsTypes">\s*<Property name="StatsType" value="([^"]+)"/)?.[1];
  products[field(blk, 'ID')] = {
    name: lang[field(blk, 'NameLower')] ?? lang[field(blk, 'Name')],
    wiki: field(blk, 'WikiCategory'),
    stat: stat && stat !== 'Unspecified' ? stat : undefined,
    cv: Number(field(blk, 'CookingValue')),
  };
}

// consumable id -> reward id
const rewardOf = {};
for (const m of read(tables + 'consumableitemtable.MXML').matchAll(/_id="([^"]+)">\s*<Property name="ID" value="[^"]+" \/>\s*<Property name="RewardID" value="([^"]*)"/g))
  rewardOf[m[1]] = m[2];

// reward id -> first reward in its list, as [kind, a, b?]
const rewardTable = read(tables + 'rewardtable.MXML');
const rewards = {};
for (const blk of rewardTable.split(/<Property name="\w+" value="GcGenericRewardTableEntry" /).slice(1)) {
  const id = blk.match(/^_id="([^"]+)"/)?.[1];
  const type = blk.match(/name="Reward" value="(\w+)"/)?.[1];
  if (!id || rewards[id]) continue;
  const num = (n) => Number(field(blk, n));
  rewards[id] =
    type === 'GcRewardEnergy' ? ['life', num('Amount')]
    : type === 'GcRewardRefreshHazProt' ? ['haz', Math.abs(num('Amount'))]
    : type === 'GcRewardHealth' ? ['health', num('AmountMin'), num('AmountMax')]
    : type === 'GcRewardFreeStamina' ? ['sprint', num('Duration')]
    : type === 'GcRewardJetpackBoost' ? ['jet', num('Duration')]
    : undefined;
}

// ingestor ranges per stat
const reality = read('metadata/reality/defaultreality.MXML');
const fsv = reality.slice(reality.indexOf('name="FoodStatValues"'));
const fstat = {};
for (const m of fsv
  .slice(0, fsv.search(/\n\t<Property name="(?!FoodStatValues)/))
  .matchAll(/<Property name="(\w+)" value="GcMinMaxFloat">\s*<Property name="Min" value="([^"]+)" \/>\s*<Property name="Max" value="([^"]+)"/g)) {
  const [min, max] = [Number(m[2]), Number(m[3])];
  if (min || max) fstat[m[1]] = [lang[m[1].toUpperCase()] ?? m[1], min, max];
}

// match our items to game products by English name (prefer cooking products)
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const byName = {};
for (const [pid, p] of Object.entries(products)) if (p.name) (byName[p.name.toLowerCase()] ??= []).push(pid);

let matched = 0;
const missing = [];
const usedStats = new Set();
for (const it of Object.values(data.items)) {
  if (it.c !== 'Cooking') continue;
  delete it.eat;
  delete it.ing;
  const ids = byName[it.n.toLowerCase()] ?? [];
  const pid = ids.find((i) => products[i].wiki === 'Cooking') ?? ids[0];
  if (!pid) {
    missing.push(it.n);
    continue;
  }
  matched++;
  const p = products[pid];
  const eat = rewards[rewardOf[pid]];
  if (eat) it.eat = eat;
  if (p.stat && fstat[p.stat]) {
    it.ing = [p.stat, p.cv];
    usedStats.add(p.stat);
  }
}
data.fstat = Object.fromEntries(Object.entries(fstat).filter(([k]) => usedStats.has(k)));

fs.writeFileSync(dataFile, JSON.stringify(data));
const count = (k) => Object.values(data.items).filter((it) => it[k]).length;
console.log(`food-effects: matched ${matched} cooking items; ${count('eat')} with an eat effect, ${count('ing')} with an ingestor stat`);
if (missing.length) console.log(`food-effects: no game product named: ${missing.join(', ')}`);

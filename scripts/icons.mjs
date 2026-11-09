/**
 * Fetches item icons from our pinned fork of the Assistant for No Man's Sky app and writes small WebP copies to
 * public/icons/<itemId>.webp (gitignored). Runs before `dev` and `build`; does nothing when the output already
 * matches the pinned commit. If the fetch fails (offline, GitHub down) it warns and the site falls back to the
 * coloured abbreviation swatches.
 *
 * To update: bump SOURCE.sha to a newer commit of the fork (sync the fork with upstream first).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SOURCE = {
  repo: 'https://github.com/mriswithe/AssistantNMS-App.git',
  sha: '00163085c2e6afb10bb4ce57dcf7897e4779a2bb',
};
/** output edge in px: 2x the largest swatch (44px) for sharp high-DPI rendering */
const SIZE = 96;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.cache', 'assistantnms');
const out = path.join(root, 'public', 'icons');
const stampFile = path.join(out, '.source');
const dataFile = path.join(root, 'src', 'data', 'nms.json');
/** regenerate when the pin, the size, or the dataset changes */
const stamp = `${SOURCE.sha} ${SIZE} ${createHash('sha1').update(fs.readFileSync(dataFile)).digest('hex')}`;

const git = (...args) => execFileSync('git', args, { cwd: cache, stdio: ['ignore', 'ignore', 'inherit'] });

/** sparse, blob-filtered shallow checkout of just the JSON and images at the pinned commit */
function checkout() {
  const head = path.join(cache, '.pinned');
  if (fs.existsSync(head) && fs.readFileSync(head, 'utf8') === SOURCE.sha) return;
  fs.rmSync(cache, { recursive: true, force: true });
  fs.mkdirSync(cache, { recursive: true });
  console.log(`icons: fetching ${SOURCE.repo} @ ${SOURCE.sha.slice(0, 8)} (sparse)…`);
  git('init', '-q');
  git('remote', 'add', 'origin', SOURCE.repo);
  git('sparse-checkout', 'set', 'assets/json/en', 'assets/images');
  git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', SOURCE.sha);
  git('checkout', '-q', 'FETCH_HEAD');
  fs.writeFileSync(head, SOURCE.sha);
}

/** item id -> icon path relative to assets/images, from every upstream item list */
function iconPaths() {
  const dir = path.join(cache, 'assets', 'json', 'en');
  const map = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let list;
    try {
      list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(list)) continue;
    for (const x of list) if (x && typeof x.Id === 'string' && typeof x.Icon === 'string') map.set(x.Id, x.Icon);
  }
  return map;
}

async function main() {
  if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stamp) return;
  try {
    checkout();
  } catch (e) {
    console.warn(`icons: could not fetch icons (${e.message.split('\n')[0]}); the site will use colour swatches.`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const icons = iconPaths();
  const images = path.join(cache, 'assets', 'images');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  let done = 0;
  const missing = [];
  const jobs = Object.keys(data.items).map((id) => async () => {
    const rel = icons.get(id);
    const src = rel && path.join(images, rel);
    // stay inside the checkout even if an upstream path is odd
    if (!src || !src.startsWith(images + path.sep) || !fs.existsSync(src)) return missing.push(id);
    await sharp(src).resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82 }).toFile(path.join(out, `${id}.webp`));
    done++;
  });
  // small worker pool keeps memory flat
  const queue = jobs.slice();
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await queue.shift()(); }));

  fs.writeFileSync(stampFile, stamp);
  console.log(`icons: wrote ${done} icons to public/icons (${missing.length} items have no upstream icon)`);
}

await main();

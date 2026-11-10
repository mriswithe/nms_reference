/**
 * Browser entry point. Hash routing: `#<itemId>` shows an item, `#cycles` / `#consumables` / `#cooking` show reference views.
 * Hash URLs are kept so links to the old single-file site keep working.
 */
import { esc } from '../lib/format';
import { createSearch } from '../lib/search';
import type { Dataset } from '../lib/types';
import { createCtx } from './context';
import { swatch } from './html';
import { initPopover } from './popover';
import { renderConsumables } from './views/consumables';
import { renderCooking } from './views/cooking';
import { renderCycles } from './views/cycles';
import { renderItem, renderWelcome } from './views/item';

const data: Dataset = JSON.parse(document.getElementById('nmsdata')!.textContent!);
const ctx = createCtx(data);
const { db, state } = ctx;
const search = createSearch(db);
initPopover(ctx);

const VIEWS: Record<string, (c: typeof ctx) => string> = { cycles: renderCycles, consumables: renderConsumables, cooking: renderCooking };
const DEFAULT_ITEM = 'Radon';

const main = document.getElementById('main')!;
const qEl = document.getElementById('q') as HTMLInputElement;
const resEl = document.getElementById('results')!;
const header = document.querySelector<HTMLElement>('header.top')!;

// ---------- search box ----------
let sel = 0;
let cur: string[] = [];

function hideResults() {
  resEl.hidden = true;
  qEl.setAttribute('aria-expanded', 'false');
  qEl.removeAttribute('aria-activedescendant');
}

function showResults() {
  cur = search(qEl.value);
  sel = 0;
  if (!qEl.value.trim()) return hideResults();
  resEl.innerHTML = cur.length
    ? cur
        .map((id, i) => {
          const it = db.items[id];
          const c = db.counts(id);
          const tags = [
            c.ref && '<span class="tag t-refine">Refine</span>',
            c.craft && '<span class="tag t-craft">Craft</span>',
            c.cook && '<span class="tag t-cook">Cook</span>',
            c.mine && '<span class="tag t-mine">Find</span>',
            c.buy && '<span class="tag t-buy">Buy</span>',
          ]
            .filter(Boolean)
            .join('');
          return `<button class="res" role="option" id="opt${i}" aria-selected="${i === 0}" data-go="${id}">${swatch(
            ctx,
            id,
            'sm',
          )}<span style="min-width:0"><div class="nm">${esc(it.n)}</div><div class="meta">${esc(it.g)} · ${esc(
            it.c,
          )}</div></span><span class="tags">${tags}</span></button>`;
        })
        .join('')
    : `<p class="empty" style="padding:10px">No items match “${esc(qEl.value)}”.</p>`;
  resEl.hidden = false;
  qEl.setAttribute('aria-expanded', 'true');
  if (cur.length) qEl.setAttribute('aria-activedescendant', 'opt0');
}

qEl.addEventListener('input', showResults);
qEl.addEventListener('focus', () => {
  if (qEl.value) showResults();
});
qEl.addEventListener('keydown', (e) => {
  if (resEl.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sel = Math.max(0, Math.min(cur.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
    resEl.querySelectorAll('.res').forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)));
    document.getElementById('opt' + sel)?.scrollIntoView({ block: 'nearest' });
    qEl.setAttribute('aria-activedescendant', 'opt' + sel);
  } else if (e.key === 'Enter') {
    if (cur[sel]) go(cur[sel]);
  } else if (e.key === 'Escape') {
    hideResults();
  }
});

// ---------- navigation ----------
let current: string | null = null;

function rerender() {
  if (!current) main.innerHTML = renderWelcome();
  else main.innerHTML = VIEWS[current] ? VIEWS[current](ctx) : renderItem(ctx, current);
}

function go(id: string | undefined, push = true) {
  if (!id || !(VIEWS[id] || db.items[id])) return;
  current = id;
  hideResults();
  if (db.items[id]) {
    qEl.value = '';
    qEl.blur();
  }
  rerender();
  window.scrollTo({ top: 0 });
  if (push) history.pushState(null, '', '#' + id);
}

document.addEventListener('click', (e) => {
  const target = e.target as Element;
  const t = target.closest<HTMLElement>('[data-go]');
  if (t) {
    e.preventDefault();
    go(t.dataset.go);
    return;
  }
  if (!target.closest('.search')) hideResults();
});

// ---------- in-view controls ----------
main.addEventListener('click', (e) => {
  const t = e.target as Element;
  const on = <K extends string>(attr: K) => t.closest<HTMLElement>(`[data-${attr}]`);
  let el: HTMLElement | null;

  if ((el = on('cyall'))) {
    const open = el.dataset.cyall === 'open';
    main.querySelectorAll<HTMLDetailsElement>('details.cyc').forEach((d) => (d.open = open));
  } else if ((el = on('tmode'))) {
    state.treeMode = el.dataset.tmode as typeof state.treeMode;
    rerender();
  } else if ((el = on('tree'))) {
    const open = el.dataset.tree === 'open';
    main.querySelectorAll<HTMLDetailsElement>('.tree details').forEach((d, i) => (d.open = open || i === 0));
  } else if ((el = on('sort'))) {
    state.refSort = el.dataset.sort as typeof state.refSort;
    rerender();
  } else if ((el = on('cookstat'))) {
    state.cookStat = el.dataset.cookstat!;
    rerender();
  } else if ((el = on('cookeat'))) {
    state.cookEat = el.dataset.cookeat!;
    rerender();
  } else if ((el = on('cpage'))) {
    state.cookPage[el.dataset.cpage!] = Number(el.dataset.to);
    rerender();
  } else if ((el = on('more'))) {
    state.expanded.add(el.dataset.more!);
    rerender();
  } else if ((el = on('less'))) {
    state.expanded.delete(el.dataset.less!);
    rerender();
  } else if ((el = on('jump'))) {
    e.preventDefault();
    const dest = document.getElementById(el.dataset.jump!);
    if (dest) {
      const y = dest.getBoundingClientRect().top + scrollY - header.offsetHeight - 10;
      scrollTo({ top: y, behavior: 'smooth' });
    }
  }
});

// remember which cycle cards are open across re-renders
main.addEventListener(
  'toggle',
  (e) => {
    const d = e.target as HTMLDetailsElement;
    const key = d.dataset?.cy;
    if (!key) return;
    if (d.open) state.openCycles.add(key);
    else state.openCycles.delete(key);
  },
  true,
);

// route-finder selects
main.addEventListener('change', (e) => {
  const s = (e.target as Element).closest<HTMLSelectElement>('[data-route]');
  if (!s) return;
  state.routes[s.dataset.route!][s.dataset.end as 'a' | 'b'] = s.value;
  const id = s.id;
  rerender();
  document.getElementById(id)?.focus();
});

window.addEventListener('popstate', () => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (db.items[h] || VIEWS[h]) go(h, false);
  else {
    current = null;
    rerender();
  }
});

const start = decodeURIComponent(location.hash.slice(1));
if (db.items[start] || VIEWS[start]) go(start, false);
else go(db.byName(DEFAULT_ITEM), false);

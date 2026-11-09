# NMS Recipe Finder

A No Man's Sky reference for refining, crafting, cooking, gathering and buying: search any item to see every way to get it, what it's used in, a full crafting tree, and whether refining beats crafting.

Live: https://mriswithe.github.io/nms_reference/

Built with [Astro](https://astro.build) as a single static page. Item views render client-side from an embedded JSON dataset, with hash routing (`#raw1`, `#cycles`, `#consumables`) so links are shareable.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321/nms_reference/
npm test           # unit tests over src/lib against the real dataset
npm run check      # astro check (types)
npm run build      # static site in dist/
npm run preview    # serve dist/
```

Node 22+.

## Layout

```
src/
  data/nms.json          dataset: items, refiner recipes (ref), Nutrient Processor recipes (cook)
  lib/                   pure logic, no DOM; covered by tests/
    types.ts             dataset shape (short keys documented here)
    db.ts                indexes: what makes / uses each item, counts, name lookup
    cost.ts              raw-value cost model: craft vs refine, crafting trees, totals
    search.ts            item search + ranking
    cycles.ts            conversion families (gas / biome loops, junk chain), route finder
    consumables.ts       refinable consumables list
    format.ts            escaping and number/label formatting
  ui/                    browser code
    app.ts               entry point: routing, search box, event delegation
    context.ts           shared db / cost model / view state
    html.ts              chip, recipe row, "show all" helpers
    views/               item, cycles, consumables renderers (return HTML strings)
  components/            Header, Footer (rendered at build time)
  layouts/Base.astro
  pages/index.astro      computes header stats + quick picks at build time, embeds the dataset
  styles/global.css      theme tokens (light/dark) and all styles
tests/lib.test.ts
```

Common edits:

- **Quick-pick buttons**: `QUICK_PICKS` in `src/pages/index.astro`.
- **Conversion families**: `FAMILY_DEFS` / `ONE_WAY_NAMES` in `src/lib/cycles.ts`.
- **Data fixes**: edit `src/data/nms.json` (see `src/lib/types.ts` for the keys); `npm test` checks every recipe references a known item.

## Deploy

`.github/workflows/deploy.yml` type-checks, tests and builds on every push and PR, and deploys `main` to GitHub Pages. The repo's Pages source must be set to **GitHub Actions**.

## Data

Recipe data comes from the open-source [Assistant for No Man's Sky](https://github.com/AssistantNMS/App) dataset (extracted from game files, up to the Voyagers-era updates). Gathering and buying notes are general guidance.

The original single-file version lives at https://github.com/mriswithe/nms_refining_reference.

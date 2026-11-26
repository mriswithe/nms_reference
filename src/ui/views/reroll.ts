import { esc } from '../../lib/format';
import type { Ctx } from '../context';
import { pageHead } from '../html';

const card = (id: string, k: string, title: string, ct: string, body: string) =>
  `<section class="card ${k}" id="${id}"><h3>${esc(title)}${ct ? ` <span class="ct">${esc(ct)}</span>` : ''}</h3>${body}</section>`;

const link = (view: string, text: string) => `<a href="#${view}" class="jl" data-go="${view}">${esc(text)}</a>`;

/** Save-scumming upgrade modules: how the roll works and the reroll loop. Applies to every platform's modules. */
export function renderReroll(_ctx: Ctx): string {
  let h = pageHead(
    '🎲',
    'var(--craft)',
    'Rerolling upgrades',
    'How upgrade-module stats are rolled, and how to save-and-reload until a module rolls near the top of its range.',
  );
  h += `<p class="note">For what a good roll looks like, see the roll ranges on ${link('mtupgrades', 'Multi-Tool upgrades')}, ${link('upgrades', 'Ship upgrades')}, ${link('exosuit', 'Exosuit upgrades')} and ${link('exocraft', 'Exocraft upgrades')}.</p>`;
  h += `<nav class="summary" aria-label="Rerolling upgrades"><a href="#" data-jump="rr-how">How the roll works</a><a href="#" data-jump="rr-steps">The reroll loop</a><a href="#" data-jump="rr-which">What it works on</a><a href="#" data-jump="rr-tips">Tips</a></nav>`;

  h += card(
    'rr-how',
    'k-refine',
    'How the roll works',
    '',
    `<ul class="plain">
      <li><b>Stats roll when you install, not when you buy.</b> A module in your inventory has no stats yet; the card only lists which stats it <i>can</i> roll.</li>
      <li><b>The roll comes from a sequence that moves on each time you install any upgrade module.</b> Station, merchant slot and purchase order don't matter.</li>
      <li><b>Reloading alone gives the same roll again</b>, because the sequence is saved with the game. Dismantling a module doesn't move it on either.</li>
      <li><b>So to get a different roll, install something else first.</b> Any cheap module will do.</li>
    </ul>`,
  );

  h += card(
    'rr-steps',
    'k-craft',
    'The reroll loop',
    'save-scumming',
    `<ol class="plain">
      <li>Buy the module you want plus a few cheap C-class modules of any type.</li>
      <li>Make a restore point: get in and out of your ship, or use a save beacon.</li>
      <li>Install the expensive module and read its stats.</li>
      <li>Bad roll? Reload. Install one C-class module (this moves the sequence on), then dismantle it.</li>
      <li>Install the expensive module again. Repeat until the stats you care about are near the top of the range.</li>
    </ol>
    <p class="note">Once a module is installed you can move it between slots, and pack it up to put into another tool or ship. Leaving a system and coming back restocks its merchants, and so does reloading a save from before you bought.</p>`,
  );

  h += card(
    'rr-which',
    'k-use',
    'What it works on',
    '',
    `<ul class="plain">
      <li><b>Every random-stat upgrade module</b>: Multi-Tool, starship and exosuit modules of every class, Suspicious (X) ones included.</li>
      <li><b>Sentinel Weapons Shards</b>: players report the same loop works. The cheap module you install in between can be any type.</li>
      <li><b>Living ship nodes and freighter salvage</b> roll their stats on install in the same way; the loop should work, but most player reports are about Multi-Tool and starship modules.</li>
      <li><b>Not</b> blueprint upgrades (Optical Drill, Mass Accelerator and the like): they have fixed stats. And not a tool's or ship's own class bonuses, which come with it.</li>
    </ul>`,
  );

  h += card(
    'rr-tips',
    'k-cook',
    'Tips',
    '',
    `<ul class="plain">
      <li><b>Reroll the stat that varies most.</b> When S fixes some stats (Pulse Engine fuel, Photon Cannon fire rate, Deflector Shield), the remaining one is all that matters. Each range table has a "judge a roll on" line.</li>
      <li><b>X (Suspicious) modules are worth the most rerolls.</b> Their range runs from about C to above S, so a lucky roll beats any S and an unlucky one is barely worth a slot.</li>
      <li><b>When there are more stats than rolls</b> (Boltcaster, Movement System), a module that missed the stat you want is the first to reroll.</li>
      <li><b>Keep a stack of C-class modules</b> for advancing the sequence; at 60 nanites they're the cheapest to install and scrap.</li>
    </ul>
    <p class="note">This has worked since the NEXT update and no patch since has changed it. If a reload gives you a different roll, the game has changed: fall back to buying from several stations. The method comes from player testing, not the game files.</p>`,
  );
  return h;
}

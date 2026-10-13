// The stage-0 outside world: a script instead of a world map. It owns the SUPPLY side of every
// flow — when a group sets out and how many want to come — using fixed neighbours from
// data/neighbours.js and the start-menu presets. A statistical world map will replace this file
// with a provider of the same shape; nothing on the local map has to change.
//
// A provider is {id, label, flows: {<migration id>: {from, first(w, rng), offer(w, rng), next(w, rng, arrived)}},
//                distance(w, neighbourId), receive(w, msg)}
//   first  — tick of the first check;   offer — how many set out now (0: nobody this time);
//   size   — optional: how many would come if forced now (the «Набег» button), ignoring chance;
//   missed — optional: a journal line when a check comes to nothing;
//   next   — tick of the next check, told how many actually arrived;
//   receive — messages the colony sends out (its daily report, later tribute and envoys).
import {DAY} from '../core/time.js';
import {RAIDS, WILDLIFE, PREDATORS} from '../data/presets.js';
import {NEIGHBOURS} from '../data/neighbours.js';
import {raidSize, settlerWaitDays} from '../settlement/threat.js';
import {TRADE} from '../data/trade.js';
import {HOUR, dayOf} from '../core/time.js';

const raidDist = w => RAIDS[w.cfg.raids].dist;

const caravanDay = (w, day, rng) => Math.max(w.tick + 1, day * DAY + (TRADE.setOut[0] + rng() * (TRADE.setOut[1] - TRADE.setOut[0])) * HOUR);

export const scripted = {
  id: 'scripted', label: 'Сценарий',

  distance: (w, id) => (id === 'greywolves' ? raidDist(w) : NEIGHBOURS.get(id).dist),

  flows: {
    // one newcomer at a time from the kin; the wait grows with the colony (it hears how big it is)
    settlers: {from: 'kin',
      first: w => w.tick + settlerWaitDays(w.outside.seen.pop) * DAY,
      offer: () => 1,
      next: w => w.tick + settlerWaitDays(w.outside.seen.pop) * DAY},
    // hares drift in from the wild woods every few hours, a few at a time
    hares: {from: 'wilds',
      first: w => w.tick + 240,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares ? 1 + Math.floor(rng() * 3) : 0),
      next: w => w.tick + 240},
    // now and then a wolf pack roams by
    wolves: {from: 'wilds',
      first: w => w.tick + 1500,
      offer: (w, rng) => { const k = PREDATORS[w.cfg.predators].wolves; return k && rng() <= k ? 2 + Math.floor(rng() * (k >= 1 ? 3 : 2)) : 0; },
      next: w => w.tick + 1500},
    // now and then a wild mule wanders in from the woods
    mules: {from: 'wilds',
      first: w => w.tick + 2 * DAY,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares && rng() < 0.35 ? 1 : 0),
      next: (w, rng) => w.tick + (1.5 + rng()) * DAY},
    // a caravan may come on day firstDay, then every everyDays: each time it sets out with `chance`,
    // in the morning, so that it reaches the camp before the evening council (data/trade.js)
    caravan: {from: 'empire',
      first: (w, rng) => caravanDay(w, TRADE.firstDay - 1, rng),
      offer: (w, rng) => (rng() < TRADE.chance ? 1 : 0),
      next: (w, rng) => caravanDay(w, dayOf(w.tick) + TRADE.everyDays, rng)},
    // every dist/2 days (a little sooner after each raid) a band may set out — with the preset's
    // chance — sized by the rumours; a check that comes to nothing gives the colony time to recover
    raiders: {from: 'greywolves',
      first: (w, rng) => scripted.flows.raiders.next(w, rng),
      offer: (w, rng) => (rng() < (RAIDS[w.cfg.raids].chance ?? 1) ? raidSize(w) : 0),
      size: w => raidSize(w),
      missed: () => ['Разведчики «Серых волков» побродили у края леса и ушли. Набега в этот раз не будет.', 'danger', 'info'],
      next: (w, rng) => (raidDist(w) ? w.tick + raidDist(w) / 2 * DAY * Math.max(0.6, 1 - w.stats.raids * 0.05) * (0.6 + rng() * 0.8) : Infinity)},
  },

  // the stub only remembers what it last heard
  receive(w, msg) { if (msg.kind === 'report') w.outside.seen = msg.data; },
};

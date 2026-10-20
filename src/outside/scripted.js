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
import {region} from '../world/region.js';
import {DAY} from '../core/time.js';
import {RAIDS, WILDLIFE, PREDATORS, MONSTERS} from '../data/presets.js';
import {NEIGHBOURS} from '../data/neighbours.js';
import {raidStrength, settlerWaitDays} from '../settlement/threat.js';
import {TRADE} from '../data/trade.js';
import {season} from '../data/seasons.js';
import {HOUR, dayOf, nightness} from '../core/time.js';
import {RAID_BANDS} from '../data/raids.js';
import {raidThreat, scoutedBand} from '../settlement/threat.js';
import {weighted} from '../core/util.js';
import {SPECIES} from '../data/species.js';
import {faunaLevel} from '../world/region.js';

// Who is beyond the edge: on a cell of the world map the site names its neighbours (seam/cell.js) —
// how far the hostile are and which bands they send, where the kin and the market are; on the
// polygon the presets and the fixed neighbours of data/neighbours.js decide, and the menu may allow
// only some bands (cfg.bands).
const worldNb = w => w.site?.neighbours || null;
const NB_ID = {kin: 'kin', empire: 'empire', hostile: 'hostile'};
// how much a band is wanted here: 0 — it never comes
export function bandAllowed(w, id) {
  const nb = worldNb(w);
  if (nb) return nb.hostile?.bands?.[id] || 0;
  return !w.cfg.bands || w.cfg.bands.includes(id) ? 1 : 0;
}
// which band sets out: each weighs itself by the threat it sees and the hour, and by whether it lives near
export const pickBand = (w, rng) => { const sc = scoutedBand(w); return weighted(rng, RAID_BANDS.all().map(b => [b.id, b.weight(w, raidThreat(w), nightness(w)) * (b.id === sc ? 4 : 1) * bandAllowed(w, b.id)])); };
const anyBand = w => RAID_BANDS.all().some(b => bandAllowed(w, b.id) > 0);

const raidDist = w => { const nb = worldNb(w); return nb ? (nb.hostile && anyBand(w) ? nb.hostile.dist : null) : anyBand(w) ? RAIDS[w.cfg.raids].dist : null; };
// for the panel: how far the raiders are and how likely a check brings them
export const raidOdds = w => ({dist: raidDist(w), chance: raidChance(w)});
const raidChance = w => { const nb = worldNb(w); return nb ? nb.hostile?.chance ?? 0 : RAIDS[w.cfg.raids].chance ?? 1; };

const caravanDay = (w, day, rng) => Math.max(w.tick + 1, day * DAY + (TRADE.setOut[0] + rng() * (TRADE.setOut[1] - TRADE.setOut[0])) * HOUR);

export const scripted = {
  id: 'scripted', label: 'Сценарий',

  distance: (w, id) => (id === 'hostile' ? raidDist(w) : worldNb(w) && NB_ID[id] ? worldNb(w)[NB_ID[id]]?.dist ?? null : NEIGHBOURS.get(id).dist),

  flows: {
    // one newcomer at a time from the kin; the wait grows with the colony (it hears how big it is)
    settlers: {from: 'kin',
      first: w => w.tick + settlerWaitDays(w.outside.seen.pop) * DAY,
      offer: () => 1,
      next: w => w.tick + settlerWaitDays(w.outside.seen.pop) * DAY},
    // hares drift in from the wild woods every few hours, a few at a time
    hares: {from: 'wilds',
      first: w => w.tick + 240,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares && rng() < season(w).hares ? 1 + Math.floor(rng() * 3) : 0),
      next: w => w.tick + 240},
    // now and then a wolf pack roams by
    wolves: {from: 'wilds',
      first: w => w.tick + 1500,
      offer: (w, rng) => { const k = PREDATORS[w.cfg.predators].wolves; return k && rng() <= k ? 2 + Math.floor(rng() * (k >= 1 ? 3 : 2)) : 0; },
      next: w => w.tick + 1500},
    // game from the woods: deer in small herds, a fox now and then, a boar or a sounder of them;
    // fewer in lean seasons. How many stay is up to the land (data/migrations.js)
    deer: {from: 'wilds', first: w => w.tick + DAY,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares && rng() < 0.5 * season(w).hares ? 2 + Math.floor(rng() * 3) : 0),
      next: (w, rng) => w.tick + (1 + rng()) * DAY},
    foxes: {from: 'wilds', first: w => w.tick + 2 * DAY,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares && rng() < 0.4 * season(w).hares ? 1 : 0),
      next: (w, rng) => w.tick + (1.5 + rng()) * DAY},
    boars: {from: 'wilds', first: w => w.tick + 4 * DAY,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares && rng() < 0.35 ? 1 + Math.floor(rng() * 3) : 0),
      next: (w, rng) => w.tick + (2.5 + rng() * 2) * DAY},
    // rats smell a full stock
    rats: {from: 'wilds', first: w => w.tick + 3 * DAY,
      offer: (w, rng) => (rng() < 0.5 ? 1 + Math.floor(rng() * 2) : 0),
      next: (w, rng) => w.tick + (0.5 + rng()) * DAY},
    // now and then a wild mule wanders in from the woods
    mules: {from: 'wilds',
      first: w => w.tick + 2 * DAY,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares && rng() < 0.35 ? 1 : 0),
      next: (w, rng) => w.tick + (1.5 + rng()) * DAY},
    // wild goats, a few at a time
    goats: {from: 'wilds', first: w => w.tick + 3 * DAY,
      offer: (w, rng) => (WILDLIFE[w.cfg.wildlife].hares && rng() < 0.45 * season(w).hares ? 1 + Math.floor(rng() * 3) : 0),
      next: (w, rng) => w.tick + (2 + rng() * 2) * DAY},
    // a caravan may come on day firstDay, then every everyDays: each time it sets out with `chance`,
    // in the morning, so that it reaches the camp before the evening council (data/trade.js)
    caravan: {from: 'empire',
      first: (w, rng) => caravanDay(w, TRADE.firstDay - 1, rng),
      offer: (w, rng) => (rng() < Math.min(0.95, TRADE.chance * region(w).road) ? 1 : 0),   // a road close by brings more caravans
      next: (w, rng) => caravanDay(w, dayOf(w.tick) + TRADE.everyDays, rng)},
    // every dist/2 days (a little sooner after each raid) a band may set out — with the preset's
    // chance — sized by the rumours; a check that comes to nothing gives the colony time to recover.
    // Which band comes is drawn from data/raids.js: bandits, orcs, goblins, gnolls, the dead…
    raiders: {from: 'hostile',
      first: (w, rng) => scripted.flows.raiders.next(w, rng),
      offer: (w, rng) => (rng() < raidChance(w) ? {n: raidStrength(w), band: pickBand(w, rng)} : 0),
      size: w => ({n: raidStrength(w), band: pickBand(w, w.rngs.outside)}),
      missed: () => ['Чужие разведчики побродили у края леса и ушли. Набега в этот раз не будет.', 'danger', 'info'],
      next: (w, rng) => (raidDist(w) ? w.tick + raidDist(w) / 2 * DAY * Math.max(0.6, 1 - w.stats.raids * 0.05) * (0.6 + rng() * 0.8) * (scoutedBand(w) ? 0.6 : 1) : Infinity)},
  },

  // the stub only remembers what it last heard
  receive(w, msg) { if (msg.kind === 'report') w.outside.seen = msg.data; },
};

// ── the bestiary (data/bestiary.js `arrive`): a flow per beast, built from its entry. A check comes every
// `every` days (night hunters: in the evening); it succeeds with `chance` × how common the beast is here
// (world/region.js) × the start menu's wildlife or predators setting. The nechist is checked daily:
// whether it may come back is the land's business (data/migrations.js `resident`).
const evening = t => { let x = Math.floor(t / DAY) * DAY + 21.5 * HOUR; if (x < t) x += DAY; return x; };
for (const sp of SPECIES.filter(s => s.arrive)) {
  const A = sp.arrive, when = (w, t) => (A.night ? evening(t) : t);
  // the polygon's «Чудища» scales the monsters on top of the wolves' or the game's setting; «Нечисть» turns the spirits off
  const monsters = w => (sp.kind === 'monster' ? MONSTERS[w.cfg.monsters ?? 'usual']?.k ?? 1 : 1);
  const setting = w => (sp.resident ? (w.cfg.spirits === false ? 0 : 1) : (sp.brain === 'predator' ? PREDATORS[w.cfg.predators].wolves : WILDLIFE[w.cfg.wildlife].hares ? 1 : 0) * monsters(w));
  scripted.flows[sp.id] = {from: sp.resident ? 'local' : 'wilds',
    first: (w, rng) => when(w, w.tick + (A.first + rng()) * DAY),
    offer: (w, rng) => {
      if (sp.resident) return setting(w);
      const k = setting(w), lvl = faunaLevel(w, sp.id);
      if (!k || !lvl || rng() >= A.chance * k * Math.min(1.5, lvl)) return 0;
      return A.group[0] + Math.floor(rng() * (A.group[1] - A.group[0] + 1));
    },
    next: (w, rng) => (sp.resident ? w.tick + DAY : when(w, w.tick + (A.every[0] + rng() * (A.every[1] - A.every[0])) * DAY))};
}

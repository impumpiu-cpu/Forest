// What an arriving group looks like and whether the colony's land can take it.
// WHEN groups come and HOW MANY want to come is not decided here: that is the outside world's
// business (src/outside/). This file is the local half of every arrival:
//   accept(w, n, rng) — how many of the n offered actually arrive (room, food, what the land feeds);
//   blocked(w)        — for the panel: why a due arrival is held up;
//   retry             — a due arrival that could not happen is tried again this often;
//   species/faction/init/kit/groupInit/message — the group itself;
//   members(w, rng) — a mixed group instead: [{species, faction?, init(a, w)?, kit?}, …]
import {Registry} from '../core/registry.js';
import {colonists, foodTotal, popCap, ofSpecies} from '../settlement/query.js';
import {plural} from '../core/util.js';
import {WILDLIFE} from './presets.js';
import {BY_CODE} from './terrain.js';
import {HOUR, DAY} from '../core/time.js';
import {season} from './seasons.js';
import {homeCell} from '../agents/nechist.js';
import {TRADE} from './trade.js';
import {startCaravan} from '../settlement/trade.js';
import {exposedShare} from '../settlement/stock.js';
import {RAID_BANDS} from './raids.js';
import {raidMembers, raidArrives} from '../settlement/raiders.js';
import {SPECIES, isPredator, onSpeciesChange, arrives} from './species.js';
import {raceLabel, refreshBody} from '../agents/special.js';
import {settlerSpecies} from '../settlement/relations.js';
import {ofSpeciesList} from '../agents/lookup.js';
import {setStanding} from '../agents/standing.js';

export const MIGRATIONS = new Registry('migration');

// meadow cells on the map (counted again a few times a day): what grazers can live on
function grassland(w) {
  if (w.cache.grass == null || w.tick % DAY < DAY / 5) w.cache.grass = w.grid.terr.reduce((s, t) => s + BY_CODE[t].graze, 0);
  return w.cache.grass;
}

MIGRATIONS.registerAll([
  // newcomers need a free place to sleep and food to spare
  // newcomers need a free place to sleep and food to spare. Most come from the kin; now and then
  // someone of a friendly race (settlement/relations.js) — the more the colony's folk like them, the likelier
  {id: 'settlers', faction: 'colony', topic: 'people', retry: 2 * HOUR, gate: 'road',
    blocked: w => (colonists(w).length >= popCap(w) ? 'нет места, нужен шалаш' : foodTotal(w) <= colonists(w).length * 5 ? 'мало еды в запасе' : null),
    accept: (w, n) => (MIGRATIONS.get('settlers').blocked(w) ? 0 : n),
    members: (w, rng, n) => Array.from({length: n}, () => ({species: settlerSpecies(w, rng)})),
    message: (w, group) => (group[0].species === 'human' ? `К лагерю пришла новая душа: <b>${group[0].name}</b>.`
      : `К лагерю ${group[0].gender === 'f' ? 'пришла' : 'пришёл'} <b>${group[0].name}</b> (${raceLabel(SPECIES.get(group[0].species))}). Просится в поселение.`)},

  // hares stay only while the meadows can feed more of them
  {id: 'hares', species: 'hare', faction: 'wild', minDist: 20, topic: 'wildlife',
    accept: (w, n) => {
      const k = WILDLIFE[w.cfg.wildlife].hares;
      const cap = Math.round(grassland(w) / ARRIVALS.hares.grass * k);
      return Math.max(0, Math.min(n, cap - ofSpecies(w, 'hare').length));
    },
    message: (w, group, side) => (group.length > 1 ? `С ${side} прибежали зайцы: ${group.length}.` : null)},

  // a wolf pack settles in only while there are hares to eat and no other pack around
  {id: 'wolves', species: 'wolf', faction: 'predators', minDist: 30, topic: 'danger', level: 'notice',
    accept: (w, n) => (ofSpecies(w, 'wolf').length || ofSpecies(w, 'hare').length < ARRIVALS.wolves.hares ? 0 : n),
    // members share a pack id; the first one leads
    groupInit: group => { const pack = group[0].id; for (const a of group) { a.pack = pack; a.name = 'Волк'; } },
    message: (w, group, side) => `С ${side} пришла стая волков: ${group.length}. Одному в лес лучше не ходить.`},

  // game: the meadows and woods feed only so many
  {id: 'deer', species: 'deer', faction: 'wild', minDist: 25, topic: 'wildlife',
    accept: (w, n) => Math.max(0, Math.min(n, Math.round(grassland(w) / ARRIVALS.deer.grass) - ofSpecies(w, 'deer').length)),
    init: a => { a.name = 'Олень'; },
    message: (w, group, side) => `С ${side} к лугам вышли олени: ${group.length}.`},
  {id: 'foxes', species: 'fox', faction: 'wild', minDist: 25, topic: 'wildlife',
    accept: (w, n) => Math.max(0, Math.min(n, ARRIVALS.foxes.cap - ofSpecies(w, 'fox').length)),
    init: a => { a.name = 'Лиса'; }},
  {id: 'boars', species: 'boar', faction: 'wild', minDist: 30, topic: 'wildlife',
    accept: (w, n) => Math.max(0, Math.min(n, ARRIVALS.boars.cap - ofSpecies(w, 'boar').length)),
    init: a => { a.name = 'Кабан'; },
    message: (w, group, side) => `С ${side} в лес пришли кабаны: ${group.length}. Подранок бросается на охотника.`},
  // rats come while there is a lot of food lying in the open; never more than six
  {id: 'rats', species: 'rat', faction: 'wild', minDist: 20, topic: 'wildlife',
    accept: (w, n) => (foodTotal(w) * exposedShare(w) < ARRIVALS.rats.food ? 0 : Math.max(0, Math.min(n, ARRIVALS.rats.cap - ofSpecies(w, 'rat').length))),
    init: a => { a.name = 'Крыса'; },
    message: (w, group) => (ofSpecies(w, 'rat').length >= 3 ? 'На складе завелись крысы. Горшки и амбар спрячут от них еду.' : null)},

  // a wild mule wanders onto the meadows now and then; never more than two at a time
  {id: 'mules', species: 'mule', faction: 'wild', minDist: 25, topic: 'wildlife',
    accept: (w, n) => Math.max(0, Math.min(n, ARRIVALS.mules.cap - w.agents.filter(o => o.species === 'mule' && o.faction === 'wild').length)),
    init: a => { a.name = 'Мул'; },
    message: (w, group, side) => `С ${side} на луга вышел дикий мул. Охотиться на него опасно: он лягается и бросается на стрелков.`},

  // wild goats come down to the meadows in small flocks; never more than five wild ones about
  {id: 'goats', species: 'goat', faction: 'wild', minDist: 25, topic: 'wildlife',
    accept: (w, n) => Math.max(0, Math.min(n, ARRIVALS.goats.cap - w.agents.filter(o => o.species === 'goat' && o.faction === 'wild').length)),
    init: a => { a.name = 'Дикая коза'; },
    message: (w, group, side) => `С ${side} на луга вышли дикие козы: ${group.length}. Терпеливый скотник с охапкой сена мог бы их приручить.`},

  // a trader's caravan: the trader, guards in imperial iron, and pack mules with crates.
  // One caravan at a time; the colony has to be alive to be worth the trip.
  {id: 'caravan', faction: 'traders', minDist: 25, topic: 'trade', level: 'notice', gate: 'road',
    accept: (w, n) => (w.caravan || !colonists(w).length ? 0 : n),
    members: (w, rng) => {
      const pickName = list => list[Math.floor(rng() * list.length)];
      const out = [{species: 'human', init: a => { setStanding(a, 'trader'); [a.name, a.gender] = pickName(TRADE.traderNames); }}];
      for (let k = 0; k < TRADE.guards; k++) out.push({species: 'human', kit: TRADE.guardKit,
        init: a => { setStanding(a, 'guard'); a.slot = k; a.name = pickName(TRADE.guardNames)[0]; a.own = {set: {bravery: TRADE.guardBravery}, hp: TRADE.guardHp}; refreshBody(a); a.skill = {ranged: TRADE.guardAim}; a.skillVer = 1; }});
      const mules = TRADE.mules[0] + Math.floor(rng() * (TRADE.mules[1] - TRADE.mules[0] + 1));
      for (let k = 0; k < mules; k++) out.push({species: 'mule', init: a => { a.name = 'Вьючный мул'; }});
      return out;
    },
    groupInit: (group, w) => startCaravan(w, group),
    message: (w, group, side) => {
      const mules = group.filter(a => a.species === 'mule').length;
      return `С ${side} по тракту идёт торговый караван: купец, охрана и ${mules} ${plural(mules, 'вьючный мул', 'вьючных мула', 'вьючных мулов')}.`;
    }},

  // A band from the hostile lands (data/raids.js): the provider says which one sets out and how strong it
  // is (n: a budget in strength rating, КС); toughness and aim grow with the threat level they have reached.
  // A campaign's camp (campaign/camp.js) adds `fill` options: `up` — the heads rounded up, `max` — the caps lifted
  {id: 'raiders', faction: 'raiders', minDist: 40, topic: 'danger',
    // who comes and how the band is set up as it arrives: settlement/raiders.js
    members: (w, rng, n, opts) => raidMembers(w, rng, n, opts),
    groupInit: (group, w) => raidArrives(group, w),
    ammo: 8,
    message: (w, group, side) => `${RAID_BANDS.get(group[0].band).message(group.length, group)}${side ? ` — с ${side}` : ''}.`},   // (a camp's foe may come from close by, not from an edge: no side)
]);

// ── the bestiary's beasts (data/bestiary.js `arrive`): one arrival each, built from the entry.
// Beasts that hunt people come as predators, the nechist as nechist, the rest as wild game.
export const factionOf = sp => (sp.resident ? 'nechist' : isPredator(sp) ? 'predators' : 'wild');
const onMap = (w, id) => ofSpeciesList(w, [id], o => !o.dead && !o.tame).length;
const cap1 = s => s[0].toUpperCase() + s.slice(1);

function arrivalFor(sp) {
  const A = sp.arrive;
  MIGRATIONS.register({
    id: sp.id, species: sp.id, faction: factionOf(sp), minDist: 30, topic: isPredator(sp) || sp.resident ? 'danger' : 'wildlife',
    level: isPredator(sp) || sp.resident ? 'notice' : undefined,
    // a resident is one of a kind and returns `respawn` days after it was killed; others stay under `cap`
    accept: (w, n) => {
      if (sp.resident) return onMap(w, sp.id) || w.tick - (w.residents?.[sp.id] ?? -1e9) < sp.respawn * DAY ? 0 : 1;
      if (sp.hibernates && season(w).id === 'winter') return 0;
      return Math.max(0, Math.min(n, A.cap - onMap(w, sp.id)));
    },
    // the nechist appears at its home ground (agents/nechist.js), not at the map edge
    spawnAt: sp.spirit ? w => homeCell(w, sp.spirit.home, 18) : undefined,
    init: a => { a.name = cap1(sp.label); },
    // a pack: members share an id, the first one leads (agents/hunting.js)
    groupInit: isPredator(sp) ? group => { const pack = group[0].id; for (const a of group) a.pack = pack; } : undefined,
    message: A.message ? (w, group) => `${cap1(A.message.replace('{n}', group.length))}.` : undefined,
  });
}
for (const sp of SPECIES.filter(s => s.arrive)) arrivalFor(sp);
// the dragon never comes to a colony's map of itself: only a campaign brings it — its lair stormed, or met on the wing
// (campaign/errands.js, campaign/land.js lairFoe); one, as it is
MIGRATIONS.register({id: 'dragon', species: 'dragon', faction: 'predators', minDist: 30, topic: 'danger', level: 'notice', accept: () => 0,
  init: a => { a.name = 'Дракон'; }, groupInit: group => { for (const a of group) a.pack = group[0].id; }});   // (a hunter is of a pack: agents/hunting.js packOf)
// a species made in the constructor (data/species.js cloneSpecies) comes and goes as the one it was copied from
onSpeciesChange((what, sp) => {
  if (what !== 'added' && MIGRATIONS.has(sp.id)) MIGRATIONS.unregister(sp.id);
  if (what !== 'removed' && arrives(sp)) arrivalFor(sp);
});

// How often the wild sends its beasts to the local map (outside/scripted.js), before the land decides how many stay:
// the first after `first` days (hares and wolves: `every` ticks, again and again), then again after wait[0] + wait[1] ×
// a roll days; each time with `chance` (× the season's for the grazers), n[0] + ⌊n[1] × a roll⌋ of them (wolves: n[2]
// in place of n[1] where the preset's wolves are rare). How many the land keeps (the arrivals' `accept` above): hares one for
// each `grass` of the meadows' grazing (× the preset), deer one for each `grass`; a wolf pack only while `hares` hares are about;
// foxes, boars, rats, wild mules and goats at most `cap` on the map; rats only while `food` of it lies in the open
export const ARRIVALS = {hares: {every: 240, n: [1, 3], grass: 500}, wolves: {every: 1500, n: [2, 3, 2], hares: 5},
  deer: {first: 1, chance: 0.5, n: [2, 3], wait: [1, 1], grass: 900}, foxes: {first: 2, chance: 0.4, n: [1], wait: [1.5, 1], cap: 3},
  boars: {first: 4, chance: 0.35, n: [1, 3], wait: [2.5, 2], cap: 4}, rats: {first: 3, chance: 0.5, n: [1, 2], wait: [0.5, 1], cap: 6, food: 30},
  mules: {first: 2, chance: 0.35, n: [1], wait: [1.5, 1], cap: 2}, goats: {first: 3, chance: 0.45, n: [1, 3], wait: [2, 2], cap: 5}};

// Who comes on a raid. Every time the hostile lands send a band (outside/scripted.js), one of these
// is drawn by its `chance` (data/chance.js: weight, from which threat, only by night, more by night — the table
// «Таблицы случайностей»), read by `weight(w, t, night)`: t is the threat level the enemies have reached (settlement/threat.js),
// night is 0…1 at the moment the band sets out. The band's size is a budget in strength rating (КС,
// agents/strength.js): members are added while their expected ratings — with the gear and the toughness
// a band of level t brings — fit into it, so a raid of 600 may be five bandits, eight goblins or two
// trolls. members(w, rng, budget, t) lists who comes: [{species, kit?, init?(a, w)}].
//   kind: 'sentient' — a thinking enemy (later: talks, ransoms, can be bargained with);
//         'monster'  — beasts and the rot's undead.
//   goals(w, group) — what they come for, [[goal, weight], …] (agents/squad.js GOALS): loot, kill, burn,
//         scout. A band that lost many to the colony comes for blood more often; scouts only come small
//         and only before the band has raided. The mindless dead always go for anything alive.
//   nerve — added to the squad's retreat threshold (agents/squad.js SQUAD.nerve): trolls and the
//         bloodthirsty hold on longer (< 0), goblins break sooner (> 0).
import {Registry} from '../core/registry.js';
import {pick, plural} from '../core/util.js';
import {SPECIES} from './species.js';
import {expectedStrength} from '../agents/strength.js';
import {chanceWeight} from './chance.js';

// a band that has lost many to the colony comes for the one who killed them; scouts come first, few
const feud = w => Math.min(2, (w.chronicle.raidersKilled || 0) / 6);
const scouting = (w, group) => (group.length <= 3 && w.stats.raids <= 3 ? 1.2 : 0);
const torches = w => (w.buildings.some(b => b.done && b.cells.length && b.key !== 'campfire') ? 1 : 0);

export const RAID_BANDS = new Registry('raid band');

// Raiders of level t: the more the enemy has learned, the tougher and the better shots its people are
// (data/migrations.js puts this on every member as the band arrives)
export const raiderBody = t => ({hp: Math.min(1.1, 0.75 + t * 0.012), ranged: Math.min(0.7, 0.1 + t * 0.025)});

// what one member of a band of level t is worth (КС), on average: kit 'bandit' — the bandits' gear, 'raid' —
// what its kind carries (KITS below), as it will be given out on arrival
export function memberStrength(species, t, kit = 'raid') {
  const L = Math.max(0, Math.floor(t)), body = raiderBody(L);
  return expectedStrength(species, {key: `${kit}|${L}`, kit: kit === 'bandit' ? rng => banditKit(rng, L) : rng => kitFor(species, rng, L),
    prepare: a => { a.hp = (a.maxHp || 1) * body.hp; a.skill = {ranged: body.ranged}; }});
}
// one bandit of level t: the yardstick of a raid's size (settlement/threat.js) — what «a band of five» means
export const raiderStrength = t => memberStrength('human', t, 'bandit');
// a budget counted in such bandits, for the bands that change their make-up with size
const heads = (budget, t) => budget / raiderStrength(t);

// Fill the budget with species drawn from `mix` ([[species, weight], …]): a member is taken while it brings
// the band's expected rating closer to the budget (at least half of it fits into what is left, so a band of
// big creatures comes out over as often as under); `max` caps a
// species by head count ({ogre: 2}); `extra` — members who come anyway (a necromancer), paid from the budget
// too. At least one member; no more than 18.
function fill(rng, budget, mix, t, {extra = [], kit = 'raid', max = {}} = {}) {
  const cost = sp => memberStrength(sp, t, kit);
  const out = [...extra];
  let left = budget - extra.reduce((s, m) => s + memberStrength(m.species, t), 0);
  for (let guard = 0; guard < 40; guard++) {
    const fits = mix.filter(([sp, wt]) => wt > 0 && cost(sp) / 2 <= left && out.filter(m => m.species === sp).length < (max[sp] ?? Infinity));
    if (!fits.length) break;
    let r = rng() * fits.reduce((s, m) => s + m[1], 0), sp = fits[0][0];
    for (const [s, wt] of fits) { r -= wt; if (r <= 0) { sp = s; break; } }
    out.push({species: sp}); left -= cost(sp);
  }
  if (!out.length) out.push({species: (mix.find(m => m[1] > 0) || mix[0])[0]});
  return out.slice(0, 18);
}

// early bands carry clubs and slings in rags, later ones spears, shields, bows and leather
export function banditKit(rng, t) {
  const early = [['club'], ['club'], ['spear'], ['sling'], ['staff']];
  const late = [['spear', 'shield'], ['club', 'shield'], ['maul'], ['bow', 'quiver'], ['spear'], ['sling']];
  const set = pick(rng, rng() < Math.min(0.9, t * 0.04) ? late : early);
  const r = rng(), leather = Math.min(0.6, t * 0.025), plates = t > 12 ? Math.min(0.3, (t - 12) * 0.025) : 0;
  return [...set, ...(r < plates ? ['hardleather'] : r < plates + leather ? ['jerkin'] : r < plates + leather + 0.4 ? ['clothes'] : [])];
}

const KITS = {
  orc: (rng, t) => [...pick(rng, [['maul'], ['axe', 'shield'], ['club', 'shield'], ['spear'], t > 10 ? ['bronzeaxe', 'shield'] : ['axe']]), ...(rng() < 0.5 ? ['jerkin'] : [])],
  goblin: rng => pick(rng, [['sling'], ['sling'], ['bow', 'quiver'], ['club'], ['spear']]),
  ogre: rng => pick(rng, [['maul'], ['club']]),
  giant: rng => pick(rng, [['maul'], ['club'], ['club']]),
  gnoll: (rng, t) => [...pick(rng, [['spear'], ['spear', 'shield'], ['bow', 'quiver'], ['axe']]), ...(rng() < 0.3 ? ['jerkin'] : [])],
  darkelf: (rng, t) => [...pick(rng, [['bow', 'quiver'], ['bow', 'quiver'], ['sword'], ['spear', 'shield']]), rng() < 0.6 ? 'hardleather' : 'jerkin'],
  skeleton: rng => pick(rng, [['club'], ['spear'], ['axe'], ['club', 'shield']]),
  vampire: () => ['sword', 'clothes'],
  necromancer: () => ['staff', 'clothes'],
};

// what a member of a band carries; species without hands carry nothing
export const kitFor = (species, rng, t) => (SPECIES.get(species).inventory && KITS[species] ? KITS[species](rng, t) : []);

const named = sp => a => { a.name = SPECIES.get(sp).label.replace(/^./, c => c.toUpperCase()); };

RAID_BANDS.registerAll([
  {id: 'bandits', label: 'разбойники «Серых волков»', kind: 'sentient',
    goals: (w, g) => [['loot', 3], ['kill', feud(w)], ['burn', 0.6 * torches(w)], ['scout', scouting(w, g)]],
    chance: {weight: 3},
    members: (w, rng, budget, t) => fill(rng, budget, [['human', 1]], t, {kit: 'bandit'}).map(m => ({...m, init: a => { a.name = 'Налётчик'; }, kit: 'bandit'})),
    message: n => `Набег! ${n} ${plural(n, 'разбойник', 'разбойника', 'разбойников')} из «Серых волков»`},

  {id: 'orcs', label: 'орочья ватага', kind: 'sentient',
    goals: (w, g) => [['loot', 2], ['burn', 1.5 * torches(w)], ['kill', 0.5 + feud(w)], ['scout', scouting(w, g)]], nerve: -0.05,
    chance: {weight: 2, threat: 4, below: 0.5},
    members: (w, rng, budget, t) => fill(rng, budget, [['orc', 3], ['goblin', 2], ['varg', heads(budget, t) >= 5 ? 1 : 0], ['ogre', heads(budget, t) >= 10 ? 0.6 : 0]], t),
    message: (n, group) => `Набег! Орочья ватага с гоблинами${group.some(a => a.species === 'varg') ? ' и боевыми варгами' : ''}`},

  {id: 'goblins', label: 'гоблинская шайка', kind: 'sentient',
    goals: (w, g) => [['loot', 4], ['burn', 0.8 * torches(w)], ['scout', scouting(w, g)]], nerve: 0.1,
    chance: {weight: 1.5},
    // a big band rides: wargs out of the hills, giant spiders out of the deep wood (the tribes' beasts, data/lairs.js)
    members: (w, rng, budget, t) => fill(rng, budget, [['goblin', 1], ['varg', heads(budget, t) >= 4 ? 0.3 : 0], ['spider', heads(budget, t) >= 6 ? 0.2 : 0]], t),
    message: (n, group) => `Набег! Гоблинская шайка: мелкие, юркие, тащат всё, что плохо лежит${group.some(a => a.species === 'varg') ? '; верхом на варгах' : ''}${group.some(a => a.species === 'spider') ? '; с ними гигантские пауки' : ''}`},

  {id: 'gnolls', label: 'стая гноллов', kind: 'sentient',
    goals: (w, g) => [['loot', 3], ['kill', 0.6 + feud(w)]],
    chance: {weight: 1.5, threat: 3, below: 0.4},
    members: (w, rng, budget, t) => fill(rng, budget, [['gnoll', 3], ['hyena', 1.5]], t),
    message: () => 'Набег! Гноллы-падальщики идут на запах лагеря'},

  {id: 'darkelves', label: 'отряд тёмных эльфов', kind: 'sentient',
    goals: (w, g) => [['kill', 2], ['loot', 1], ['scout', scouting(w, g)]],
    chance: {weight: 0.6, perNight: 1, threat: 8},
    members: (w, rng, budget, t) => fill(rng, budget, [['darkelf', 1]], t),
    message: () => 'Набег! Тёмные эльфы вышли из-под земли за рабами и добычей'},

  {id: 'ogres', label: 'огры-людоеды', kind: 'monster',
    goals: () => [['kill', 3], ['loot', 1]], nerve: -0.1,
    chance: {weight: 0.8, threat: 6},
    members: (w, rng, budget, t) => fill(rng, budget, [['ogre', 1]], t, {max: {ogre: 2}}).map(m => ({...m, init: named('ogre')})),
    message: () => 'С гор спустились огры-людоеды'},

  {id: 'giants', label: 'великаны', kind: 'sentient',
    goals: () => [['loot', 2], ['kill', 1.5], ['burn', 1]], nerve: -0.2,
    chance: {weight: 0.5, threat: 8},
    members: (w, rng, budget, t) => fill(rng, budget, [['giant', 1]], t, {max: {giant: 2}}).map(m => ({...m, init: (a, w) => { [a.name, a.gender] = pick(w.rngs.outside, SPECIES.get('giant').names); }})),
    message: n => (n === 1 ? 'С гор спустился великан: ему ваш частокол по колено' : `С гор спустились великаны: ${n}. Им ваш частокол по колено`)},

  {id: 'troll', label: 'тролль', kind: 'monster',
    goals: () => [['kill', 2], ['loot', 1]], nerve: -0.15,
    chance: {weight: 1, threat: 5},
    members: (w, rng, budget, t) => fill(rng, budget, [['troll', 1]], t, {max: {troll: 2}}).map(m => ({...m, init: named('troll')})),
    message: n => (n === 1 ? 'Из чащи вышел тролль. Раны на нём затягиваются, пока рядом нет огня' : 'Из чащи вышли тролли. Раны на них затягиваются, пока рядом нет огня')},

  // the rot's host: by night three times as likely; past a threat of 10 a necromancer walks behind it
  {id: 'undead', label: 'мертвецы', kind: 'monster',
    chance: {weight: 0.8, perNight: 2, threat: 3},
    members: (w, rng, budget, t) => {
      const lead = t >= 10 ? [{species: 'necromancer', init: a => { a.role = 'necromancer'; a.name = 'Некромант'; }}] : [];
      // the dead are slow: a host of them comes a fifth bigger than its rating says it needs to be
      return fill(rng, budget * 1.2, [['zombie', 3], ['skeleton', t >= 6 ? 2 : 0]], t, {extra: lead});
    },
    groupInit: group => { const nec = group.find(a => a.role === 'necromancer'); if (nec) for (const a of group) if (a !== nec) a.master = nec.id; },
    message: (n, group) => `Из курганов поднялись мертвецы: ${n}${group.some(a => a.role === 'necromancer') ? '. За ними идёт некромант — без него они разбредутся' : ''}`},

  // upyrs come only by night and run from the sun
  {id: 'upyrs', label: 'упыри', kind: 'monster',
    goals: () => [['kill', 3]], nerve: -0.1,
    chance: {weight: 1.2, threat: 6, night: 0.5},
    members: (w, rng, budget, t) => fill(rng, budget, [['upyr', 1]], t, {max: {upyr: 3}}),
    message: () => 'Ночью к лагерю пришли упыри. Им нужна кровь, солнце гонит их прочь'},

  {id: 'vampire', label: 'вампир со свитой', kind: 'sentient',
    goals: () => [['kill', 3], ['loot', 0.5]], nerve: -0.2,
    chance: {weight: 0.5, threat: 20, night: 0.5},
    members: (w, rng, budget, t) => fill(rng, budget, [['upyr', 1]], t, {extra: [{species: 'vampire', init: (a, w) => { [a.name, a.gender] = pick(w.rngs.outside, SPECIES.get('vampire').names); }}]}),
    message: (n, group) => `${group.find(a => a.species === 'vampire')?.name || 'Вампир'} пришёл со свитой упырей. Простое железо его почти не берёт, нужно серебро`},
]);
// the weight of a band now, from its row of the random table (data/chance.js)
for (const b of RAID_BANDS.all()) b.weight = (w, t, night) => chanceWeight(b.chance, {threat: t, night});




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
//   roles — the band's leaning in its fighters' roles ({role: ×} over the species' weights, data/roles.js ROLE_MIX);
//   least — the share of heads a role must have at least ({shield: 0.2}: one shield-bearer in five)
//   ranks — the band's names for its ranks ({officer: 'десятник'}: data/ranks.js)
//   nerve — added to the squad's retreat threshold (agents/squad.js SQUAD.nerve): trolls and the
//         bloodthirsty hold on longer (< 0), goblins break sooner (> 0).
import {Registry} from '../core/registry.js';
import {pick, plural} from '../core/util.js';
import {SPECIES} from './species.js';
import {expectedStrength} from '../agents/strength.js';
import {chanceWeight} from './chance.js';
import {roleKit, drawRole} from './roles.js';
import {refreshBody} from '../agents/special.js';

// a band that has lost many to the colony comes for the one who killed them; scouts come first, few
const feud = w => Math.min(2, (w.chronicle.raidersKilled || 0) / 6);
const scouting = (w, group) => (group.length <= 3 && w.stats.raids <= 3 ? 1.2 : 0);
const torches = w => (w.buildings.some(b => b.done && b.cells.length && b.key !== 'campfire') ? 1 : 0);

export const RAID_BANDS = new Registry('raid band');

// Raiders of level t: the more the enemy has learned, the tougher and the better shots its people are
// (data/migrations.js puts this on every member as the band arrives)
export const raiderBody = t => ({hp: Math.min(1.1, 0.75 + t * 0.012), ranged: Math.min(0.7, 0.1 + t * 0.025)});

// what one member of a band of level t is worth (КС), on average: in its fighting role (data/roles.js), or over the roles
// its species takes (`role` null), with the gear a band of that level brings, as it will be given out on arrival
export function memberStrength(species, t, role = null) {
  const L = Math.max(0, Math.floor(t)), body = raiderBody(L);
  return expectedStrength(species, {key: `role:${role || '*'}|${L}`, kit: rng => kitFor(species, rng, L, role),
    prepare: a => {
      if (SPECIES.get(species).behaviours) { a.marks = ['trained']; refreshBody(a); }   // a band's beast is trained (data/migrations.js)
      a.hp = (a.maxHp || 1) * body.hp; a.skill = {ranged: body.ranged};
    }});
}
// one human raider of level t: the yardstick of a raid's size (settlement/threat.js) — what «a band of five» means
export const raiderStrength = t => memberStrength('human', t);
// a budget counted in such bandits, for the bands that change their make-up with size
const heads = (budget, t) => budget / raiderStrength(t);

// Fill the budget with species drawn from `mix` ([[species, weight], …]): a member is taken while it brings
// the band's expected rating closer to the budget (at least half of it fits into what is left, so a band of
// big creatures comes out over as often as under; with `up` — while anything of the budget is left, so the heads are
// rounded up: a campaign's foe, data/camp.js CAMP.foe); `max` caps a
// species by head count ({ogre: 2}); `extra` — members who come anyway (a necromancer), paid from the budget
// too. At least one member; no more than 18.
function fill(rng, budget, mix, t, {extra = [], max = {}, up = false, here = null, roles = null, least = null} = {}) {
  const cost = (sp, role = null) => memberStrength(sp, t, role);
  if (here) mix = mix.map(([sp, wt]) => [sp, wt * (here[sp] ?? 1)]);   // the war beasts only as many as live about (data/raids.js BAND_BEASTS)
  const out = [...extra];
  let left = budget - extra.reduce((s, m) => s + memberStrength(m.species, t), 0);
  for (let guard = 0; guard < 40; guard++) {
    const fits = mix.filter(([sp, wt]) => wt > 0 && (up ? left > 0 : cost(sp) / 2 <= left) && out.filter(m => m.species === sp).length < (max[sp] ?? Infinity));
    if (!fits.length) break;
    let r = rng() * fits.reduce((s, m) => s + m[1], 0), sp = fits[0][0];
    for (const [s, wt] of fits) { r -= wt; if (r <= 0) { sp = s; break; } }
    // its fighting role (data/roles.js): what the band still lacks first, then by the species' weights
    const role = SPECIES.get(sp).inventory ? drawRole(rng, sp, {bias: roles, least, have: out.filter(m => m.species === sp).map(m => m.role)}) : null;
    out.push({species: sp, ...(role ? {role} : {})}); left -= cost(sp, role);
  }
  if (!out.length) { const sp = (mix.find(m => m[1] > 0) || mix[0])[0], role = SPECIES.get(sp).inventory ? drawRole(rng, sp, {bias: roles, least}) : null; out.push({species: sp, ...(role ? {role} : {})}); }
  return out.slice(0, 18);
}

// On a cell of the world map (seam/cell.js: the game in a settlement, a caravan's camp) a band's war beasts — the wargs
// of goblins and orcs, the spiders, the hyenas of gnolls — come only as thick as they live about (world/region.js
// faunaLevel): × their level over `full` (at most 1); on the polygon, as the band's list says
export const BAND_BEASTS = {full: 0.6};

// what a member of a band carries: the kit of its fighting role (data/roles.js); species without hands carry nothing
// (with no role given, one is drawn from the species' row: a creature that comes outside a band, the arena)
export const kitFor = (species, rng, t, role = null) => (SPECIES.get(species).inventory ? roleKit(species, role ?? drawRole(rng, species), rng, t) : []);

const cap1 = x => x[0].toUpperCase() + x.slice(1);
const named = sp => a => { a.name = SPECIES.get(sp).label.replace(/^./, c => c.toUpperCase()); };

RAID_BANDS.registerAll([
  {id: 'bandits', label: 'разбойники «Серых волков»', kind: 'sentient',
    goals: (w, g) => [['loot', 3], ['kill', feud(w)], ['burn', 0.6 * torches(w)], ['scout', scouting(w, g)]],
    least: {shield: 0.2}, ranks: {officer: 'десятник', boss: 'атаман'},
    chance: {weight: 3},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['human', 1]], t, o).map(m => ({...m, init: a => { a.name = 'Налётчик'; }})),
    message: n => `Набег! ${n} ${plural(n, 'разбойник', 'разбойника', 'разбойников')} из «Серых волков»`},

  {id: 'orcs', label: 'орочья ватага', kind: 'sentient',
    goals: (w, g) => [['loot', 2], ['burn', 1.5 * torches(w)], ['kill', 0.5 + feud(w)], ['scout', scouting(w, g)]], nerve: -0.05,
    least: {shield: 0.2}, ranks: {officer: 'сотник', boss: 'вождь'},
    chance: {weight: 2, threat: 4, below: 0.5},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['orc', 3], ['goblin', 2], ['varg', heads(budget, t) >= 5 ? 1 : 0], ['ogre', heads(budget, t) >= 10 ? 0.6 : 0]], t, o),
    message: (n, group) => `Набег! Орочья ватага с гоблинами${group.some(a => a.species === 'varg') ? ' и боевыми варгами' : ''}`},

  {id: 'goblins', label: 'гоблинская шайка', kind: 'sentient',
    goals: (w, g) => [['loot', 4], ['burn', 0.8 * torches(w)], ['scout', scouting(w, g)]], nerve: 0.1, ranks: {officer: 'заводила', boss: 'главарь'},
    chance: {weight: 1.5},
    // a big band rides: wargs out of the hills, giant spiders out of the deep wood (the tribes' beasts, data/lairs.js)
    members: (w, rng, budget, t, o) => fill(rng, budget, [['goblin', 1], ['varg', heads(budget, t) >= 4 ? 0.3 : 0], ['spider', heads(budget, t) >= 6 ? 0.2 : 0]], t, o),
    message: (n, group) => `Набег! Гоблинская шайка: мелкие, юркие, тащат всё, что плохо лежит${group.some(a => a.species === 'varg') ? '; верхом на варгах' : ''}${group.some(a => a.species === 'spider') ? '; с ними гигантские пауки' : ''}`},

  {id: 'gnolls', label: 'стая гноллов', kind: 'sentient',
    goals: (w, g) => [['loot', 3], ['kill', 0.6 + feud(w)]], ranks: {officer: 'клык', boss: 'вожак стаи'},
    chance: {weight: 1.5, threat: 3, below: 0.4},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['gnoll', 3], ['hyena', 1.5]], t, o),
    message: () => 'Набег! Гноллы-падальщики идут на запах лагеря'},

  {id: 'darkelves', label: 'отряд тёмных эльфов', kind: 'sentient',
    goals: (w, g) => [['kill', 2], ['loot', 1], ['scout', scouting(w, g)]],
    least: {archer: 0.3}, ranks: {officer: 'страж', boss: 'матрона'},
    chance: {weight: 0.6, perNight: 1, threat: 8},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['darkelf', 1]], t, o),
    message: () => 'Набег! Тёмные эльфы вышли из-под земли за рабами и добычей'},

  {id: 'ogres', label: 'огры-людоеды', kind: 'monster',
    goals: () => [['kill', 3], ['loot', 1]], nerve: -0.1,
    chance: {weight: 0.8, threat: 6},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['ogre', 1]], t, {max: {ogre: 2}, ...o}).map(m => ({...m, init: named('ogre')})),
    message: () => 'С гор спустились огры-людоеды'},

  {id: 'giants', label: 'великаны', kind: 'sentient',
    goals: () => [['loot', 2], ['kill', 1.5], ['burn', 1]], nerve: -0.2,
    chance: {weight: 0.5, threat: 8},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['giant', 1]], t, {max: {giant: 2}, ...o}).map(m => ({...m, init: (a, w) => { [a.name, a.gender] = pick(w.rngs.outside, SPECIES.get('giant').names); }})),
    message: n => (n === 1 ? 'С гор спустился великан: ему ваш частокол по колено' : `С гор спустились великаны: ${n}. Им ваш частокол по колено`)},

  {id: 'troll', label: 'тролль', kind: 'monster',
    goals: () => [['kill', 2], ['loot', 1]], nerve: -0.15,
    chance: {weight: 1, threat: 5},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['troll', 1]], t, {max: {troll: 2}, ...o}).map(m => ({...m, init: named('troll')})),
    message: n => (n === 1 ? 'Из чащи вышел тролль. Раны на нём затягиваются, пока рядом нет огня' : 'Из чащи вышли тролли. Раны на них затягиваются, пока рядом нет огня')},

  // the rot's host: by night three times as likely; past a threat of 10 a necromancer walks behind it
  {id: 'undead', label: 'мертвецы', kind: 'monster',
    chance: {weight: 0.8, perNight: 2, threat: 3},
    members: (w, rng, budget, t, o) => {
      const lead = t >= 10 ? [{species: 'necromancer', init: a => { a.role = 'necromancer'; a.name = 'Некромант'; }}] : [];
      // the dead are slow: a host of them comes a fifth bigger than its rating says it needs to be
      return fill(rng, budget * 1.2, [['zombie', 3], ['skeleton', t >= 6 ? 2 : 0]], t, {extra: lead, ...o});
    },
    groupInit: group => { const nec = group.find(a => a.role === 'necromancer'); if (nec) for (const a of group) if (a !== nec) a.master = nec.id; },
    message: (n, group) => `Из курганов поднялись мертвецы: ${n}${group.some(a => a.role === 'necromancer') ? '. За ними идёт некромант — без него они разбредутся' : ''}`},

  // a necromancer's cult (atlas/necro.js): any of the living about and the dead with them — each head drawn by itself
  // from the cell's pool (o.pool: [[species, weight]] by density, campaign/land.js; on a settlement's cell its
  // neighbours' `cultPool`, seam/cell.js), no cap on how many kinds: a troll, two orcs, an elf and a few of the dead
  // in one band. `world` — only where the world map knows a necromancer (never on the polygon)
  {id: 'cultists', label: 'культисты некроманта', kind: 'sentient', world: true,
    goals: (w, g) => [['kill', 2], ['loot', 1], ['burn', torches(w)]], nerve: -0.1, ranks: {officer: 'жрец', boss: 'некромант'},
    chance: {weight: 1, perNight: 1},
    members: (w, rng, budget, t, o) => {
      const pool = o?.pool?.length ? o.pool : w?.site?.neighbours?.hostile?.cultPool?.length ? w.site.neighbours.hostile.cultPool : [['human', 2], ['zombie', 2], ['skeleton', 1]];
      return fill(rng, budget, pool, t, {...(o || {}), pool: undefined}).map(m => {
        const sp = SPECIES.get(m.species), living = sp.kind === 'race' || sp.mind === 'sentient' && sp.kind !== 'undead';
        return {...m,
          init: a => { a.cultist = true; a.name = cap1(living ? `${sp.label.split(' ').pop()}-культист` : sp.label); }};
      });
    },
    message: (n, group) => `Набег! Культисты некроманта: ${n} — ${[...new Set(group.map(a => (SPECIES.get(a.species).plural || a.species)))].slice(0, 5).join(', ')}`},

  // upyrs come only by night and run from the sun
  {id: 'upyrs', label: 'упыри', kind: 'monster',
    goals: () => [['kill', 3]], nerve: -0.1,
    chance: {weight: 1.2, threat: 6, night: 0.5},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['upyr', 1]], t, {max: {upyr: 3}, ...o}),
    message: () => 'Ночью к лагерю пришли упыри. Им нужна кровь, солнце гонит их прочь'},

  {id: 'vampire', label: 'вампир со свитой', kind: 'sentient',
    goals: () => [['kill', 3], ['loot', 0.5]], nerve: -0.2,
    chance: {weight: 0.5, threat: 20, night: 0.5},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['upyr', 1]], t, {extra: [{species: 'vampire', init: (a, w) => { [a.name, a.gender] = pick(w.rngs.outside, SPECIES.get('vampire').names); }}], ...o}),
    message: (n, group) => `${group.find(a => a.species === 'vampire')?.name || 'Вампир'} пришёл со свитой упырей. Простое железо его почти не берёт, нужно серебро`},
]);
// the band's roles go into its fill (read at the call: an edit of the table counts)
for (const b of RAID_BANDS.all()) { const own = b.members; b.members = (w, rng, budget, t, o) => own(w, rng, budget, t, {roles: b.roles || null, least: b.least || null, ...(o || {})}); }
// the weight of a band now, from its row of the random table (data/chance.js)
for (const b of RAID_BANDS.all()) b.weight = (w, t, night) => chanceWeight(b.chance, {threat: t, night});




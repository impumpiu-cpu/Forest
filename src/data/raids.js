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
//   least — the share of heads of one species a role must have at least ({shield: 0.2}: one shield-bearer in five)
//           (`roles` and `least` are for a band without links; none of the bands uses them now)
//   champion — its strongest fighter grows into a champion (data/conditions.js mark `champion`, data/migrations.js): one a band
//   links — the links it comes in ([[link, weight], …]: data/roles.js LINKS): a band of links fills them place by place;
//           without — its species drawn one by one, each in a role of its own (`roles`, `least` then apply)
//   ranks — the band's names for its ranks ({officer: 'десятник'}: data/ranks.js)
//   nerve — added to the squad's retreat threshold (agents/squad.js SQUAD.nerve): trolls and the
//         bloodthirsty hold on longer (< 0), goblins break sooner (> 0).
import {Registry} from '../core/registry.js';
import {pick, plural} from '../core/util.js';
import {SPECIES} from './species.js';
import {chanceWeight} from './chance.js';
// the make-up of a band — fill a budget, links, the beast-driver's beasts, the golems — is the system's (outside/bands.js)
import {fill, withLed, heads, golemFor} from '../outside/bands.js';

// a band that has lost many to the colony comes for the one who killed them; scouts come first, few
const feud = w => Math.min(2, (w.chronicle.raidersKilled || 0) / 6);
const scouting = (w, group) => (group.length <= 3 && w.stats.raids <= 3 ? 1.2 : 0);
const torches = w => (w.buildings.some(b => b.done && b.cells.length && b.key !== 'campfire') ? 1 : 0);

export const RAID_BANDS = new Registry('raid band');

// The numbers of the bands' make-up (outside/bands.js; docs/SETTLEMENT.md «Набеги»):
//   RAIDER    — raiders of level t: the more the enemy has learned, the tougher (`hp`: × health) and the better shots (`ranged`:
//               the skill) its people are — base + per × t, at most max (data/migrations.js puts this on every member)
//   YARDSTICK — the yardstick of a raid's size (settlement/threat.js): five raiders «of the old days» — clubs and slings in rags
//               early (`early`), spears, shields, bows and leather later (`late`, with the chance per × t, at most max); a jerkin
//               with leather.per × t (at most max), hardened leather past plates.from with (t − from) × per (at most max), plain
//               clothes with `clothes` more
//   BAND      — at most `max` heads a band, `guard`/`linkGuard` draws while filling it; `led` — the war beasts a beast-driver
//               brings on the polygon (a world cell gives its own)
export const RAIDER = {hp: {base: 0.75, per: 0.012, max: 1.1}, ranged: {base: 0.1, per: 0.025, max: 0.7}};
export const YARDSTICK = {
  early: [['club'], ['club'], ['spear'], ['sling'], ['staff']],
  late: [['spear', 'shield'], ['club', 'shield'], ['maul'], ['bow', 'quiver'], ['spear'], ['sling']],
  lateAt: {per: 0.04, max: 0.9}, leather: {per: 0.025, max: 0.6}, plates: {from: 12, per: 0.025, max: 0.3}, clothes: 0.4,
};
export const BAND = {max: 18, guard: 40, linkGuard: 60, led: ['wolf', 'boar', 'varg', 'bear']};

// On a cell of the world map (seam/cell.js: the game in a settlement, a caravan's camp) a band's war beasts — the wargs
// of goblins and orcs, the spiders, the hyenas of gnolls — come only as thick as they live about (world/region.js
// faunaLevel): × their level over `full` (at most 1); on the polygon, as the band's list says
export const BAND_BEASTS = {full: 0.6};

const cap1 = x => x[0].toUpperCase() + x.slice(1);
const named = sp => a => { a.name = SPECIES.get(sp).label.replace(/^./, c => c.toUpperCase()); };

RAID_BANDS.registerAll([
  {id: 'bandits', label: 'разбойники «Серых волков»', kind: 'sentient',
    goals: (w, g) => [['loot', 3], ['kill', feud(w)], ['burn', 0.6 * torches(w)], ['scout', scouting(w, g)]],
    links: [['line', 2], ['wall', 1], ['raid', 1]], ranks: {officer: 'десятник', boss: 'атаман'},
    chance: {weight: 3},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['human', 1]], t, o).map(m => ({...m, init: a => { a.name = 'Налётчик'; }})),
    message: n => `Набег! ${n} ${plural(n, 'разбойник', 'разбойника', 'разбойников')} из «Серых волков»`},

  {id: 'orcs', label: 'ватага зеленокожих', kind: 'sentient',
    goals: (w, g) => [['loot', 2], ['burn', 1.5 * torches(w)], ['kill', 0.5 + feud(w)], ['scout', scouting(w, g)]], nerve: -0.05,
    links: [['warband', 3], ['swarm', 1], ['riders', 1], ['takers', 1]], ranks: {officer: 'сотник', boss: 'вождь'}, champion: true,
    chance: {weight: 2, threat: 4, below: 0.5},
    // all the greenskin kinds in one band (data/peoples.js orcs `kin`); a beast-driver brings the war beasts of the land
    members: (w, rng, budget, t, o) => withLed(rng, fill(rng, budget, [['orc', 3], ['goblin', 2], ['gnoll', 1], ['varg', heads(budget, t) >= 5 ? 1 : 0], ['ogre', heads(budget, t) >= 10 ? 0.6 : 0], ['troll', heads(budget, t) >= 12 ? 0.3 : 0]], t, o), o),
    message: (n, group) => `Набег! Ватага зеленокожих: ${[...new Set(group.filter(a => !a.warBeast).map(a => SPECIES.get(a.species).plural))].join(', ')}${group.some(a => a.mount) ? ', с наездниками' : ''}${group.some(a => a.warBeast) ? ' и боевыми зверями' : ''}`},

  {id: 'goblins', label: 'гоблинская шайка', kind: 'sentient',
    goals: (w, g) => [['loot', 4], ['burn', 0.8 * torches(w)], ['scout', scouting(w, g)]], nerve: 0.1, links: [['swarm', 3], ['line', 1], ['spiders', 1]], ranks: {officer: 'заводила', boss: 'главарь'},
    chance: {weight: 1.5},
    // a big band rides: wargs out of the hills, giant spiders out of the deep wood (the tribes' beasts, data/lairs.js)
    members: (w, rng, budget, t, o) => fill(rng, budget, [['goblin', 1], ['varg', heads(budget, t) >= 4 ? 0.3 : 0], ['spider', heads(budget, t) >= 6 ? 0.2 : 0]], t, o),
    message: (n, group) => `Набег! Гоблинская шайка: мелкие, юркие, тащат всё, что плохо лежит${group.some(a => a.species === 'varg') ? '; верхом на варгах' : ''}${group.some(a => a.species === 'spider') ? '; с ними гигантские пауки' : ''}`},

  {id: 'gnolls', label: 'стая гноллов', kind: 'sentient',
    goals: (w, g) => [['loot', 3], ['kill', 0.6 + feud(w)]], links: [['pack', 2], ['line', 1], ['hyenas', 1]], ranks: {officer: 'клык', boss: 'вожак стаи'},
    chance: {weight: 1.5, threat: 3, below: 0.4},
    members: (w, rng, budget, t, o) => withLed(rng, fill(rng, budget, [['gnoll', 3], ['hyena', 1.5]], t, o), o, ['hyena']),   // (a beast-driver of theirs brings hyenas)
    message: () => 'Набег! Гноллы-падальщики идут на запах лагеря'},

  // a dwarven war party (data/seam.js REALM_BANDS): only a dwarven realm at war sends it (`world`); it takes no captives
  // and burns nothing. Past a level its forges send golems along (data/constructs.js) — of the best metal its level opens
  // (data/roles.js ROLE_TIERS), more of them with the hammer-smiths and the forge-masters
  {id: 'dwarves', label: 'дварфийская дружина', kind: 'sentient', world: true, noCaptives: true,
    goals: () => [['kill', 2], ['loot', 1]], nerve: -0.15,
    links: [['anvil', 3], ['berserks', 1]], ranks: {officer: 'хирдман', boss: 'тан'},
    chance: {weight: 0},
    members: (w, rng, budget, t, o) => {
      const g = golemFor(t), n = heads(budget, t);
      return fill(rng, budget, [['dwarf', 3], ...(g && n >= 5 ? [[g, n >= 10 ? 0.6 : 0.3]] : [])], t, o);
    },
    message: (n, group) => `Дварфийская дружина: ${n}${group.some(a => SPECIES.get(a.species).mechanism) ? ', с ними големы' : ''}. Пленных дварфы не берут`},

  // the humans' host (data/seam.js REALM_BANDS, atlas/towns.js realmBand): a realm's men at war — the levy and a wall of
  // shields; the knights and a champion when the realm has a tilt-yard (`k`), the horse-knights with a hippodrome (`h`), the
  // cutthroats with a den (`d`): one band for each of what the realm has built (`host`, `host:k`, `host:kh`, …). Only from
  // the world map (`world`)
  ...['', 'k', 'h', 'kh', 'd', 'kd', 'hd', 'khd'].filter(s => !s.includes('h') || s.includes('k')).map(s => ({id: s ? `host:${s}` : 'host', label: 'дружина людей', kind: 'sentient', world: true,
    goals: (w, g) => [['loot', 2], ['kill', 1 + feud(w)], ['burn', 0.4 * torches(w)], ['scout', scouting(w, g)]],
    links: [['levy', 2], ['wall', 1], ...(s.includes('k') ? [['knights', 2]] : []), ...(s.includes('h') ? [['cavalry', 1]] : []), ...(s.includes('d') ? [['raid', 1]] : [])],
    ranks: {officer: 'сотник', boss: 'воевода'}, champion: s.includes('k'),
    chance: {weight: 0},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['human', 1]], t, o).map(m => ({...m, init: a => { a.name = m.role === 'knight' || m.role === 'horseknight' ? 'Рыцарь' : 'Ратник'; }})),
    message: (n, group) => `Дружина людей: ${n}${group.some(a => a.fightRole === 'knight' || a.fightRole === 'horseknight') ? ', с рыцарями' : ''}${group.some(a => a.mount) ? ' и конницей' : ''}`})),

  // an elven war party (data/seam.js REALM_BANDS): only an elven realm at war sends it (`world`, WAR_ONLY_BANDS); it takes no
  // captives and burns nothing: bows from the trees, the caller of beasts behind them
  {id: 'elves', label: 'отряд эльфов', kind: 'sentient', world: true, noCaptives: true,
    goals: () => [['kill', 2], ['loot', 0.5]], nerve: 0.05,
    links: [['grove', 3], ['wardens', 1], ['volley', 1]], ranks: {officer: 'страж', boss: 'владыка леса'},
    chance: {weight: 0},
    members: (w, rng, budget, t, o) => fill(rng, budget, [['elf', 1]], t, o),
    message: (n, group) => `Отряд эльфов: ${n}${group.some(a => a.fightRole === 'summoner') ? ', с призывателем' : ''}. Пленных эльфы не берут`},

  {id: 'darkelves', label: 'отряд тёмных эльфов', kind: 'sentient',
    goals: (w, g) => [['kill', 2], ['loot', 1], ['scout', scouting(w, g)]],
    links: [['slavers', 2], ['volley', 1]], ranks: {officer: 'страж', boss: 'матрона'},
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
  {id: 'undead', label: 'мертвецы', kind: 'monster', links: [['bones', 1]], ranks: {officer: 'умертвие', boss: 'лич'},
    chance: {weight: 0.8, perNight: 2, threat: 3},
    members: (w, rng, budget, t, o) => {
      const lead = t >= 10 ? [{species: 'necromancer', init: a => { a.name = 'Некромант'; }}] : [];
      // the dead are slow: a host of them comes a fifth bigger than its rating says it needs to be
      return fill(rng, budget * 1.2, [['zombie', 3], ['skeleton', t >= 6 ? 2 : 0]], t, {extra: lead, ...o});
    },
    groupInit: group => { const nec = group.find(a => a.species === 'necromancer'); if (nec) for (const a of group) if (a !== nec) a.obeys = nec.id; },
    message: (n, group) => `Из курганов поднялись мертвецы: ${n}${group.some(a => a.species === 'necromancer') ? '. За ними идёт некромант — без него они разбредутся' : ''}`},

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
for (const b of RAID_BANDS.all()) { const own = b.members; b.members = (w, rng, budget, t, o) => own(w, rng, budget, t, {roles: b.roles || null, least: b.least || null, links: b.links || null, ...(o || {})}); }
// the weight of a band now, from its row of the random table (data/chance.js)
for (const b of RAID_BANDS.all()) b.weight = (w, t, night) => chanceWeight(b.chance, {threat: t, night});




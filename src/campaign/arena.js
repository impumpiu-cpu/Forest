// The arena (data/arena.js ARENA; docs/GAME.md «Арена»): one fight, made by hand, on a camp map of a world cell drawn at random.
// Nothing here is a new fight: it is the camp of the campaign (campaign/camp.js openCamp, stepCamp) — the company of the caravan,
// the foe's bands and beasts, the scene of a storm, the night — with its people and its foe chosen instead of drawn.
//   arenaAtlas(seed)      — a small world to draw the cells from (made once a session: the land, the peoples, no history)
//   arenaCatalog()        — what may be chosen: the races of the company with their fighting roles and classes, the foe's
//                           bands and beasts, which of them shun the sun
//   arenaSetup(a, opts)   — the camp's setup for openCamp: {kind, time, seed, ours: [{race, role, level, gear, n}],
//                           foes: [{band, s, level, gear} | {beast, n, level}]} → {setup, K, info}
//   arenaSides(w)         — the strength of each side on the map now (КС of those still standing) and the heads
//   arenaRandom(a, rnd)   — a random company and a random foe of about its strength
import {newAtlas, runNextStage} from '../atlas/index.js';
import {SPECIES, isSentient} from '../data/species.js';
import {COMBAT_ROLES, rolesOf, roleKit} from '../data/roles.js';
import {classOfRole} from '../data/classes.js';
import {RAID_BANDS} from '../data/raids.js';
import {MIGRATIONS} from '../data/migrations.js';
import {ARENA} from '../data/arena.js';
import {RETINUE} from '../data/campaign.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {gearDef, expectedStrength, sideStrength} from '../local/index.js';
import {capitals, newCampaign} from './start.js';
import {makeMember} from './start.js';
import {need, levelEvening} from './experience.js';
import {campSetup, companyStrength} from './camp.js';

// ── a small world (the land and the peoples; its cells give the maps)
export function arenaAtlas(seed = 'arena') {
  const a = newAtlas({seed: String(seed), size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  while (runNextStage(a));
  return a;
}

// ── what may be chosen
const mayRole = R => !R.mount && !R.linkOnly;
// a foe that shuns the sun: by night or under the ground only (ARENA.dark)
export const shunsSun = sp => !!(sp?.sun || sp?.nocturnal);
export function arenaCatalog() {
  const races = SPECIES.filter(sp => sp.kind === 'race' && isSentient(sp) && rolesOf(sp.id).length && sp.id !== 'necromancer')
    .map(sp => ({id: sp.id, label: sp.label, roles: rolesOf(sp.id).map(([id]) => COMBAT_ROLES.get(id)).filter(mayRole)
      .map(R => ({id: R.id, label: R.label, cls: classOfRole(R.id)?.label || null}))}))
    .filter(r => r.roles.length);
  const bands = RAID_BANDS.all().map(B => ({id: B.id, label: B.label, dark: ARENA.dark.bands.includes(B.id)}));
  const beasts = MIGRATIONS.all().filter(m => m.faction === 'predators' && SPECIES.has(m.species))
    .map(m => ({id: m.id, species: m.species, label: SPECIES.get(m.species).label, dark: shunsSun(SPECIES.get(m.species))}))
    .sort((x, y) => x.label.localeCompare(y.label, 'ru'));
  return {races, bands, beasts, kinds: ARENA.kinds, gear: ARENA.gear};
}
// whether the foe asked must fight in the dark: one of its rows shuns the sun
export function darkFoes(foes) {
  return (foes || []).some(e => (e.band && ARENA.dark.bands.includes(e.band)) || (e.beast && MIGRATIONS.has(e.beast) && shunsSun(SPECIES.get(MIGRATIONS.get(e.beast).species))));
}

// ── the setup
// a land cell of the world to fight on, drawn by the fight's seed
function landCell(a, rnd) {
  for (let k = 0; k < 400; k++) { const i = (rnd() * a.n) | 0; if (!a.f.ocean?.[i]) return i; }
  return capitals(a)[0]?.i ?? 0;
}
// one of the company: of its race, its role's kit at the gear's step, its level grown as a level grows (letters and perks)
function arenaMember(K, rnd, {race, role, gear = 2}) {
  const R = role && COMBAT_ROLES.has(role) ? COMBAT_ROLES.get(role) : null;
  const kit = R ? roleKit(race, role, rnd, ARENA.gear[Math.max(0, Math.min(ARENA.gear.length - 1, gear))].t) : [];
  const body = kit.find(id => gearDef(id)?.slot === 'body') || RETINUE.body;
  const hand = kit.filter(id => gearDef(id)?.slot !== 'body');
  const lean = R ? RETINUE.lean[R.group] || [] : [];
  return makeMember(K, rnd, {race, role: 'fighter', fight: R ? role : null, potions: R?.potions || 0, gear: {hand, body}, core: true, lean});
}
// the strength a row of the foe is worth, before the fight (КС): a band — as asked; beasts — their heads × one of their kind
export function foeRowStrength(e) {
  if (e.band) return Math.max(0, e.s || 0);
  if (e.beast && MIGRATIONS.has(e.beast)) return Math.max(0, e.n | 0) * expectedStrength(MIGRATIONS.get(e.beast).species, {key: 'wild'});
  return 0;
}
export function arenaSetup(a, {kind = 'defend', time = 'day', seed = 'arena', ours = [], foes = []} = {}) {
  const KD = ARENA.kinds[kind] || ARENA.kinds.defend, rnd = mulberry(seedNumber(`${seed}:arena`));
  const cap = capitals(a)[0]; if (!cap) throw new Error('арена: в мире нет столицы');
  const K = newCampaign(a, cap.town, {mode: 'local', seed: `${seed}:arena`});
  // the company as asked (at most ARENA.most.members), each grown to its level
  K.members = []; K.nextMember = 0; K.beasts = []; K.vehicles = [];
  for (const row of ours) for (let k = 0; k < Math.max(1, row.n | 0) && K.members.length < ARENA.most.members; k++) {
    const m = arenaMember(K, rnd, row);
    const L = Math.max(ARENA.levels.member[0], Math.min(ARENA.levels.member[1], row.level | 0 || 1));
    if (L > 1) m.xp = need(L);
    K.members.push(m);
  }
  levelEvening(a, K);
  K.i = landCell(a, rnd);
  // the dark: a foe that shuns the sun is met by night, or under the ground by day (a vault: always night)
  const dark = darkFoes(foes), vault = dark && time !== 'night';
  const hour = time === 'night' || dark && !vault ? ARENA.hour.night : ARENA.hour.day;
  const rows = foes.map(e => (e.band ? {band: e.band, s: Math.min(ARENA.most.band, e.s || 100), threat: ARENA.gear[Math.max(0, Math.min(ARENA.gear.length - 1, e.gear ?? 2))].t, level: e.level | 0 || 0}
    : {beast: e.beast, n: Math.min(ARENA.most.heads, e.n | 0 || 1), level: e.level | 0 || 0}));
  const first = rows[0] || {band: 'bandits'};
  const foe = {kind: first.band ? (first.band === 'undead' || first.band === 'upyrs' ? 'undead' : 'raiders') : 'beasts', strength: 1, label: 'противник арены',
    ...(first.band ? {band: first.band} : {beast: first.beast})};
  const setup = campSetup(a, K, {kind: KD.kind, foe, dayIn: 0});
  setup.seed = `${seed}:arena:${KD.kind}`;
  setup.arena = {foes: rows, hour, meet: !!KD.meet, time: vault ? 'vault' : dark ? 'night' : time};
  if (vault) setup.layout = {...setup.layout, scene: true, force: 'vault'};
  const ourS = companyStrength(a, K), foeS = rows.reduce((s, e) => s + foeRowStrength(e), 0);
  return {setup, K, info: {kind: KD.label, time: setup.arena.time, cell: K.i, ours: Math.round(ourS), foes: Math.round(foeS), heads: K.members.length}};
}

// ── the sides on the map now
const standing = o => !o.dead && !o.gone && !o.downed && !o.captive && o.task?.id !== 'leave';
export function arenaSides(w) {
  const ours = w.agents.filter(o => o.member != null && standing(o)), foes = (w.campaign?.foeObjs || []).filter(standing);
  return {ours: {n: ours.length, s: Math.round(sideStrength(ours, {now: true}))}, foes: {n: foes.length, s: Math.round(sideStrength(foes, {now: true}))}, spawned: !!w.campaign?.spawned};
}

// ── a random company and a random foe about its strength
export function arenaRandom(rnd = Math.random) {
  const C = arenaCatalog(), R = ARENA.random, pick = xs => xs[Math.floor(rnd() * xs.length)];
  const race = pick(C.races), n = R.members[0] + Math.floor(rnd() * (R.members[1] - R.members[0] + 1));
  const ours = [];
  for (let k = 0; k < n; k++) { const role = pick(race.roles).id, row = ours.find(o => o.role === role); if (row) row.n++; else ours.push({race: race.id, role, level: 1 + Math.floor(rnd() * 6), gear: 1 + Math.floor(rnd() * 3), n: 1}); }
  return {ours, foes: arenaFoesFor(R.bandS[0] + R.bandS[1] / 2, rnd)};
}
// a random foe of about this strength (КС): one or two rows, a band's strength or a beast's heads made to fit; a beast whose one
// head is past `R.over` of it is left out (two dragons do not come at four goblins)
export function arenaFoesFor(target, rnd = Math.random) {
  const C = arenaCatalog(), R = ARENA.random, pick = xs => xs[Math.floor(rnd() * xs.length)];
  const rows = R.rows[0] + Math.floor(rnd() * (R.rows[1] - R.rows[0] + 1)), share = Math.max(1, target) / rows, out = [];
  for (let k = 0; k < rows; k++) {
    const level = 1 + Math.floor(rnd() * 5);
    const beasts = C.beasts.filter(b => expectedStrength(b.species, {key: 'wild'}) <= share * R.over);
    if (rnd() < R.band || !beasts.length) { out.push({band: pick(C.bands).id, s: Math.max(50, Math.round(share)), level, gear: 1 + Math.floor(rnd() * 3)}); continue; }
    const b = pick(beasts), one = expectedStrength(b.species, {key: 'wild'});
    out.push({beast: b.id, n: Math.max(1, Math.min(ARENA.most.heads, Math.round(share / Math.max(1, one)))), level});
  }
  return out;
}

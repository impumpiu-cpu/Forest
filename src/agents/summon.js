// The caller of beasts (docs/WORLD.md «Асимметрия народов», data/roles.js SUMMON): an elf in a fight calls the forest
// beasts that live about (tag «Лесной», data/tags.js sylvan) to its side — once a fight, beasts worth a quarter of its own
// side's strength, as many of each kind as the land holds of it. A called beast fights its caller's foes and, when there
// are none for a while, goes back to the wood (agents/behaviours/summoned.js).
// Who calls: a fighter of the role `summoner` (a band, data/roles.js), or an elf of a colony or a caravan — the race's
// `summons` share of them, fixed for each by its id and the world's seed (no draw on any stream).
import {SPECIES} from '../data/species.js';
import {SUMMON} from '../data/roles.js';
import {expectedStrength, sideStrength} from './strength.js';
import {createAgent} from './agent.js';
import {walkable} from '../world/grid.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {log} from '../core/log.js';
import {plural} from '../core/util.js';

const sylvans = () => SPECIES.filter(s => s.sylvan);
// those who live here and how thick: the map's biomes × the species' habitat
export function sylvanPool(w) {
  const biomes = w.region?.biomes || {};
  return sylvans().map(s => [s.id, Object.entries(biomes).reduce((v, [b, share]) => v + share * (SUMMON.levels[s.habitat?.[b]] || 0), 0)]).filter(([, v]) => v > 0);
}
// is this one a caller of beasts
export function isSummoner(w, a) {
  if (a.fightRole === 'summoner') return true;
  const p = SPECIES.get(a.species).summons;
  return !!p && mulberry(seedNumber(`${w.cfg?.seed ?? ''}:summoner:${a.id}`))() < p;
}
const cost = new Map();
const beastCost = sp => cost.get(sp) ?? cost.set(sp, expectedStrength(sp, {key: 'summon', n: 16})).get(sp);

// call them, if it may now: the beasts called, [] when none came
export function trySummon(w, a, foe) {
  if (a.dead || a.downed || a.captive) return [];
  if (a.summonedAt != null && w.tick - a.summonedAt < SUMMON.cooldown) return [];
  a.summonedAt = w.tick;
  const pool = sylvanPool(w); if (!pool.length) return [];
  const side = w.agents.filter(o => !o.dead && !o.captive && o.faction === a.faction && SPECIES.get(o.species).kind === 'race' && Math.hypot(o.x - a.x, o.y - a.y) <= SUMMON.reach);
  let left = SUMMON.share * sideStrength(side);
  const r = w.rngs.hits, out = [], total = pool.reduce((s, [, v]) => s + v, 0);
  for (let guard = 0; guard < 20 && out.length < SUMMON.max; guard++) {
    let x = r() * total, sp = pool[0][0];
    for (const [id, v] of pool) { x -= v; if (x <= 0) { sp = id; break; } }
    const c = beastCost(sp);
    if (c / 2 > left) { if (pool.every(([id]) => beastCost(id) / 2 > left)) break; continue; }
    left -= c;
    // out of the wood round the caller: a free cell within the ring
    let bx = a.x, by = a.y;
    for (let k = 0; k < 12; k++) {
      const ang = r() * Math.PI * 2, d = 1 + r() * SUMMON.ring, nx = a.x + Math.cos(ang) * d, ny = a.y + Math.sin(ang) * d;
      if (nx >= 0 && ny >= 0 && nx < w.w && ny < w.h && walkable(w, (ny | 0) * w.w + (nx | 0))) { bx = nx; by = ny; break; }
    }
    const b = createAgent(w, sp, a.faction === 'colony' ? 'allies' : a.faction, bx, by);
    b.brain = 'summoned'; b.summoned = {by: a.id, last: w.tick}; b.task = null;
    if (foe && !foe.dead) b.task = {id: 'fight', target: foe};
    out.push(b);
  }
  if (out.length) {
    const names = [...new Set(out.map(b => SPECIES.get(b.species).plural || SPECIES.get(b.species).label))].join(', ');
    log(w, `<b>${a.name}</b> ${a.gender === 'f' ? 'позвала' : 'позвал'} лес на помощь: ${out.length} ${plural(out.length, 'зверь', 'зверя', 'зверей')} — ${names}.`, 'danger');
  }
  return out;
}

// Agent creation and death. An agent is a plain object:
//   species / faction / brain ids, position, hp, needs, personality (colonists), memory, current task.
import {SPECIES} from '../data/species.js';
import {FACTIONS} from '../data/factions.js';
import {NEEDS} from '../data/needs.js';
import {JOBS} from '../data/jobs.js';
import {TRAITS, BASE_MODS, LIKE_RANGE, DISLIKE_RANGE, NEUTRAL_RANGE} from '../data/traits.js';
import {shuffle, weighted, esc} from '../core/util.js';
import {log} from '../core/log.js';
import {emptySlots, recalcGear, stripAll, def} from './equipment.js';

// memory of the day's hardships: any key reads as 0 until something is remembered
const newMemory = () => new Proxy({}, {get: (t, k) => (typeof k === 'string' ? t[k] ?? 0 : t[k])});

const between = (rng, [a, b]) => a + rng() * (b - a);

// liked and disliked work are drawn from preferable jobs; up to two traits from different groups
function personality(w, a) {
  const rng = w.rng, pool = shuffle(rng, JOBS.filter(j => j.preferable).map(j => j.id));
  a.prefs = {}; a.skill = {};
  for (const id of JOBS.ids()) { a.prefs[id] = between(rng, NEUTRAL_RANGE); a.skill[id] = rng() * 0.15; }
  a.likes = pool[0]; a.dislikes = pool[1];
  a.prefs[a.likes] = between(rng, LIKE_RANGE); a.skill[a.likes] = 0.3;
  a.prefs[a.dislikes] = between(rng, DISLIKE_RANGE);
  a.traits = [];
  const groups = new Set(), want = rng() < 0.25 ? 0 : rng() < 0.6 ? 1 : 2;
  for (let k = 0; k < want; k++) {
    const opts = TRAITS.filter(t => !groups.has(t.group)).map(t => [t, t.weight]);
    const t = weighted(rng, opts); if (!t) break;
    a.traits.push(t.id); groups.add(t.group);
  }
  for (const id of a.traits) for (const [k, v] of Object.entries(TRAITS.get(id).mods)) {
    a.mods[k] = k === 'bravery' ? a.mods[k] + v : a.mods[k] * v;
  }
  a.mods.bravery *= 0.85 + rng() * 0.3;
}

export function createAgent(w, speciesId, factionId, x, y) {
  const sp = SPECIES.get(speciesId), fa = FACTIONS.get(factionId);
  const a = {
    id: w.nextId++, species: speciesId, faction: factionId, brain: sp.brain || fa.brain,
    name: sp.names ? sp.names[w.nameIdx++ % sp.names.length] : sp.label,
    x, y, hp: sp.hp, mods: {...BASE_MODS}, needs: {}, mem: newMemory(),
    task: null, think: (w.rng() * 15) | 0, cd: 0, carry: null, sleeping: false,
  };
  for (const [k, v] of Object.entries(sp.mods || {})) a.mods[k] *= v;
  a.stamina = 1;
  for (const id of sp.needs) { const n = NEEDS.get(id); a.needs[id] = between(w.rng, n.start); }
  if (sp.sentient && factionId === 'colony') personality(w, a);
  if (sp.inventory) a.equip = emptySlots();
  recalcGear(a);
  w.agents.push(a);
  return a;
}

// mark dead; the sim removes dead agents at the end of the tick
export function kill(w, a, cause, by) {
  if (a.dead) return;
  a.dead = true; a.hp = 0;
  const sp = SPECIES.get(a.species);
  const killer = by ? SPECIES.get(by.species) : null;
  if (a.faction === 'colony') log(w, killer?.killMessage ? killer.killMessage(esc(a.name)) : by ? `<b>${esc(a.name)}</b> погиб(ла) в бою.` : `<b>${esc(a.name)}</b> не пережил(а) ${cause}.`, 'death');
  else if (sp.id === 'wolf' && by?.faction === 'colony') {
    // a wolf killed in a fight: its hide and bones are brought home
    for (const [r, n] of Object.entries(sp.yields || {})) w.stock[r] = (w.stock[r] || 0) + n;
    log(w, `<b>${esc(by.name)}</b> убил(а) волка. Шкура и кости — в лагерь.`, 'danger', 'notice');
  } else if (a.faction === 'raiders' && by) {
    const got = [];
    stripAll(a, got);
    const loot = got.filter(it => it.dur > 0);
    w.armory.push(...loot); w.armoryVersion = (w.armoryVersion || 0) + 1;
    log(w, `Налётчик убит, его сразил(а) <b>${esc(by.name)}</b>.${loot.length ? ' Трофеи: ' + loot.map(it => def(it).short).join(', ') + '.' : ''}`, 'danger', 'notice');
  }
  // a fallen colonist's gear goes back to the store
  if (a.faction === 'colony' && a.equip) { stripAll(a, w.armory); w.armoryVersion = (w.armoryVersion || 0) + 1; }
  else if (sp.yields && by) { /* game killed by a hunter: the hunter logs nothing, the meat speaks for itself */ }
}

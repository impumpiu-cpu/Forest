// Agent creation and death. An agent is a plain object:
//   species / faction / brain ids, position, hp, needs, personality (colonists), memory, current task.
import {SPECIES} from '../data/species.js';
import {FACTIONS} from '../data/factions.js';
import {NEEDS} from '../data/needs.js';
import {JOBS} from '../data/jobs.js';
import {TRAITS, BASE_MODS, LIKE_RANGE, DISLIKE_RANGE, NEUTRAL_RANGE} from '../data/traits.js';
import {shuffle, weighted, esc, g} from '../core/util.js';
import {log} from '../core/log.js';
import {emptySlots, recalcGear, stripAll, def} from './equipment.js';
import {think} from './mind.js';
import {drawFoodPrefs} from '../data/foods.js';
import {enrol, noteDeath} from '../settlement/chronicle.js';
import {lostBeast} from '../settlement/herd.js';
import {addCorpse} from '../settlement/life.js';
import {rollCreature, refreshBody, BODY_VER} from './special.js';
import {startSkills} from './skills.js';
import {releaseAll} from '../settlement/reserve.js';
import {noteFallen} from './squad.js';
import {noteHuntDeath} from './carcass.js';
import {RESOURCES} from '../data/resources.js';
import {decideTrophies} from './trophies.js';
import {noteBoardDeath} from '../settlement/board.js';
import {load} from './jobRunners.js';

// a line for the log about the rare trophies of a kill
export function trophyText(t) {
  if (!t) return '';
  const got = Object.entries(t.got).map(([r, n]) => `${RESOURCES.get(r).label}${n > 1 ? ' ×' + n : ''}`);
  const lost = [...new Set(t.spoiled)].map(r => RESOURCES.get(r).label);
  return (got.length ? ` Редкая добыча: ${got.join(', ')}${t.by ? ` (вырезал${t.byF ? 'а' : ''} ${esc(t.by)})` : ''}.` : '') + (lost.length ? ` Испорчено неумелой рукой: ${lost.join(', ')}.` : '');
}

// memory of the day's hardships: any key reads as 0 until something is remembered
export const newMemory = (init = {}) => new Proxy(init, {get: (t, k) => (typeof k === 'string' ? t[k] ?? 0 : t[k])});

const between = (rng, [a, b]) => a + rng() * (b - a);

// liked and disliked work are drawn from preferable jobs; up to two traits from different groups.
// Skills start from SPECIAL (agents/skills.js): a little of everything, more where the letter is strong.
function personality(w, a) {
  const rng = w.rngs.birth, pool = shuffle(rng, JOBS.filter(j => j.preferable).map(j => j.id));
  a.prefs = {};
  for (const id of JOBS.ids()) a.prefs[id] = between(rng, NEUTRAL_RANGE);
  a.likes = pool[0]; a.dislikes = pool[1];
  startSkills(rng, a, JOBS.get(a.likes).skill);
  a.prefs[a.likes] = between(rng, LIKE_RANGE);
  a.prefs[a.dislikes] = between(rng, DISLIKE_RANGE);
  a.traits = [];
  const groups = new Set(), want = rng() < 0.25 ? 0 : rng() < 0.6 ? 1 : 2;
  for (let k = 0; k < want; k++) {
    const opts = TRAITS.filter(t => !groups.has(t.group)).map(t => [t, t.weight]);
    const t = weighted(rng, opts); if (!t) break;
    a.traits.push(t.id); groups.add(t.group);
  }
  // how brave this one is beyond its traits: kept as its own extra, so a rebuilt body keeps it
  (a.own ||= {}).mul = {bravery: 0.85 + rng() * 0.3};
  a.food = drawFoodPrefs(rng);
}

// the next name from the list that no living colonist carries
function freshName(w, names) {
  const used = new Set(w.agents.filter(o => o.faction === 'colony' && !o.dead).map(o => o.name));
  for (let k = 0; k < names.length; k++) { const n = names[w.nameIdx++ % names.length]; if (!used.has(n[0])) return n; }
  return names[w.nameIdx++ % names.length];
}

export function createAgent(w, speciesId, factionId, x, y) {
  const sp = SPECIES.get(speciesId), fa = FACTIONS.get(factionId);
  const a = {
    id: w.nextId++, species: speciesId, faction: factionId, brain: sp.brain || fa.brain,
    name: sp.label, gender: 'm',
    x, y, hp: sp.hp, mods: {...BASE_MODS}, needs: {}, mem: newMemory(), bodyVer: BODY_VER,
    task: null, think: (w.rngs.birth() * 15) | 0, cd: 0, carry: null, sleeping: false,
  };
  if (sp.names && factionId === 'colony') [a.name, a.gender] = freshName(w, sp.names);
  rollCreature(w, a, sp);
  a.stamina = 1;
  for (const id of sp.needs) { const n = NEEDS.get(id); a.needs[id] = between(w.rngs.birth, n.start); }
  if (sp.sentient && factionId === 'colony') personality(w, a);
  // the body from all its sources at once (species, SPECIAL, people, innate, traits, own extras), at full health
  refreshBody(a); a.hp = maxHp(a);
  if (a.prefs) { a.diary = []; enrol(w, a, w.founding); }
  if (sp.inventory) a.equip = emptySlots();
  recalcGear(a);
  w.agents.push(a);
  if (w.scratch) delete w.scratch.colonists;   // the per-tick list of colonists is out of date now
  return a;
}

// full health: the creature's own (from Endurance) or its species'
export const maxHp = a => a.maxHp || SPECIES.get(a.species).hp;
export const hpShare = a => a.hp / maxHp(a);

// mark dead; the sim removes dead agents at the end of the tick. `quiet`: the caller has written the
// death to the log in its own words (agents/wounds.js: bled out)
// a raider with the colony's goods on its back brought down by one of ours: the goods go onto the
// victor's back and back to the stores (the colonist brain drops a load at the camp)
function takeBackLoot(w, a, by) {
  const parts = [];
  let n = 0;
  for (const [r, v] of Object.entries(a.loot)) { if (v <= 0) continue; load(by, r, v); n += v; parts.push(`${RESOURCES.get(r).label} ${Math.round(v * 10) / 10}`); }
  a.loot = null;
  const b = w.behave?.board; if (b) b.lootBack = (b.lootBack || 0) + n;
  if (n > 0.5) log(w, `<b>${esc(by.name)}</b> ${g(by, 'отбил', 'отбила')} у налётчика добычу: ${parts.join(', ')}.`, 'danger');
}

export function kill(w, a, cause, by, {quiet = false} = {}) {
  if (a.dead) return;
  a.dead = true; a.hp = 0;
  releaseAll(w, a);   // a bench, a bed, a body or a beast it held is free again
  noteFallen(w, a);   // a raider's band counts its losses (agents/squad.js)
  noteHuntDeath(w, a);   // a pack hunting it stops (agents/carcass.js)
  noteBoardDeath(w, a);   // the colony's board remembers which foe fell (settlement/board.js)
  if (a.loot && by?.faction === 'colony' && !by.dead) takeBackLoot(w, a, by);
  const sp = SPECIES.get(a.species);
  const killer = by ? SPECIES.get(by.species) : null;
  // rare trophies, decided now and once (agents/trophies.js): only for what the colony brought down
  const trophy = sp.trophies && by?.faction === 'colony' ? decideTrophies(w, a, by) : null;
  if (a.faction === 'colony') { noteDeath(w, a, cause, by); addCorpse(w, a); }
  if (a.tame) { lostBeast(w, a, killer?.predator ? `задрали ${killer.plural || killer.label}` : by ? 'убили' : cause); return; }
  // the nechist comes back some time after it was killed (data/migrations.js `resident`)
  if (sp.resident) (w.residents ||= {})[sp.id] = w.tick;
  // beasts that hunt people count as the colony's beast kills (the chronicle's «wolves»)
  if (by?.stats) { if (sp.predator || sp.resident) { by.stats.wolves++; w.chronicle.wolvesKilled++; } else if (a.faction === 'raiders') { by.stats.raiders++; w.chronicle.raidersKilled++; } }
  if (a.faction === 'colony' && !quiet) log(w, killer?.killMessage ? killer.killMessage(esc(a.name)) : by ? `<b>${esc(a.name)}</b> ${g(a, 'погиб', 'погибла')} в бою.` : `<b>${esc(a.name)}</b> ${g(a, 'не пережил', 'не пережила')} ${cause}.`, 'death');
  else if (sp.yields && by?.faction === 'colony' && by.task?.id !== 'job' && a.faction !== 'traders') {
    // an animal killed in a fight (not on a hunt, where the hunter carries the game home): the carcass is brought in
    for (const [r, n] of Object.entries(sp.yields)) w.stock[r] = (w.stock[r] || 0) + n;
    for (const [r, n] of Object.entries(trophy?.got || {})) w.stock[r] = (w.stock[r] || 0) + n;
    const got = Object.keys(sp.yields).map(r => RESOURCES.get(r).label).join(', ');
    log(w, `<b>${esc(by.name)}</b> ${g(by, sp.undead ? 'упокоил' : 'убил', sp.undead ? 'упокоила' : 'убила')} ${sp.labelAcc || sp.label}. ${got[0].toUpperCase() + got.slice(1)} — в лагерь.${trophyText(trophy)}`, 'danger', 'notice');
  } else if (sp.resident && by?.faction === 'colony') {
    log(w, `<b>${esc(by.name)}</b> ${g(by, 'упокоил', 'упокоила')} ${sp.labelAcc || sp.label}. Надолго ли?`, 'danger', 'notice');
  } else if (a.faction === 'raiders' && by) {
    const got = [];
    stripAll(a, got);
    const loot = got.filter(it => it.dur > 0);
    w.armory.push(...loot); w.armoryVersion = (w.armoryVersion || 0) + 1;
    const who = a.band === 'bandits' ? a.name || 'Налётчик' : a.name !== sp.label.replace(/^./, c => c.toUpperCase()) ? `${a.name}, ${sp.label},` : a.name;
    const verb = sp.undead ? g(a, 'упокоен', 'упокоена') : g(a, 'убит', 'убита');
    log(w, `${who} ${verb}, ${g(by, 'его сразил', 'его сразила').replace('его', a.gender === 'f' ? 'её' : 'его')} <b>${esc(by.name)}</b>.${loot.length ? ' Трофеи: ' + loot.map(it => def(it).short).join(', ') + '.' : ''}`, 'danger', 'notice');
  }
  // the necromancer falls: his dead lose their way
  if (a.role === 'necromancer' && w.agents.some(o => o.master === a.id && !o.dead)) log(w, 'Некромант пал. Мертвецы теряют направление и разбредаются.', 'danger', 'notice');
  if (a.faction === 'colony') for (const o of w.agents) if (o !== a && o.faction === 'colony' && !o.dead) { think(w, o, 'grief', {name: a.name, f: a.gender === 'f'}); o.mem.grief += 0.5; }
  if (by?.faction === 'colony') { if (sp.predator || sp.resident) think(w, by, 'killedWolf', {beast: sp.labelAcc || sp.label}); else if (a.faction === 'raiders') think(w, by, 'killedRaider'); }
  // a fallen colonist's gear goes back to the store
  if (a.faction === 'colony' && a.equip) { stripAll(a, w.armory); w.armoryVersion = (w.armoryVersion || 0) + 1; }
  else if (sp.yields && by) { /* game killed by a hunter: the hunter logs nothing, the meat speaks for itself */ }
}

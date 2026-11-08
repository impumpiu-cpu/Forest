// The greenskins' war beasts on the local map (data/buildings.js WAR_DENS): a warg den and a spider den raise a beast of
// their kind at the start of each season, fed on meat; the spider den spins rope a day; the fighting pits break a beast or
// a monster beaten near the camp to war instead of killing it. A war beast stands guard on the colony's side (the brain
// `golem`: agents/behaviours/golem.js — a guard at its post).
import {WAR_DENS as D} from '../data/buildings.js';
import {SPECIES} from '../data/species.js';
import {seasonStarts} from '../data/seasons.js';
import {DAY, HOUR, tickOfDay, atHour} from '../core/time.js';
import {createAgent, maxHp} from '../agents/agent.js';
import {refreshBody} from '../agents/special.js';
import {colonists, has} from './query.js';
import {log} from '../core/log.js';

// the dens of WAR_DENS: every row that raises a beast, in its order
const dens = () => Object.entries(D).filter(([, R]) => R && typeof R === 'object' && R.beast);
const warBeasts = w => w.agents.filter(a => !a.dead && a.faction === 'allies' && a.warBeast);
const room = w => warBeasts(w).length < 1 + Math.floor(colonists(w).filter(a => !a.dead && !a.captive).length / D.per);
function enlist(w, a, post) {
  a.faction = 'allies'; a.brain = 'golem'; a.post = {...post}; a.warBeast = true; a.task = null;
  a.marks = [...new Set([...(a.marks || []), 'trained'])]; refreshBody(a);
}
// a den raises one: → the beast, or null
export function raise(w, key) {
  const b = w.buildings.find(x => x.key === key && x.done), R = D[key]; if (!b || !room(w) || (w.stock.meat || 0) < R.food) return null;
  w.stock.meat -= R.food;
  const at = {x: b.x + b.w / 2, y: b.y + b.h + 1}, a = createAgent(w, R.beast, 'allies', at.x, at.y);
  enlist(w, a, at); a.hp = maxHp(a);
  a.name = SPECIES.get(R.beast).label.replace(/^./, c => c.toUpperCase());
  log(w, `В логове вырос боевой ${SPECIES.get(R.beast).label}: встал на стражу лагеря.`, 'build', 'notice');
  return a;
}
export function stepWarBeasts(w) {
  if (tickOfDay(w) !== atHour(w, 8)) return;
  for (const [key, R] of dens()) if (R.silk && has(w, key)) w.stock.rope = (w.stock.rope || 0) + R.silk;   // (the spider den spins rope)
  if (!seasonStarts(w, w.tick)) return;
  for (const [key] of dens()) raise(w, key);
}
// a beast or a monster beaten near the camp (agents/combat.js, at its last blow): broken to war in the pits → true
export function breakToWar(w, by, t) {
  if (by?.faction !== 'colony' || t.faction === 'allies' || !has(w, 'fightpits')) return false;
  const sp = SPECIES.get(t.species);
  if (!(sp.kind === 'beast' || sp.kind === 'monster') || sp.mind === 'sentient' || sp.resident || t.tame || !room(w)) return false;   // (no thinking kind: a troll is a greenskin)
  const pit = w.buildings.find(x => x.key === 'fightpits' && x.done);
  if (!pit || Math.hypot(pit.x - t.x, pit.y - t.y) > D.reach) return false;
  enlist(w, t, {x: pit.x + pit.w / 2, y: pit.y + pit.h + 1}); t.hp = Math.max(t.hp, D.below * maxHp(t));
  log(w, `<b>${by.name}</b> не ${by.gender === 'f' ? 'добила' : 'добил'} ${sp.labelAcc || sp.label}: в бойцовских ямах его ломают в боевого.`, 'danger', 'notice');
  return true;
}

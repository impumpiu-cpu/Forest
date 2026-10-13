// Fighting: melee blows, shots from bows and slings, armour and shields.
// Weapons come from the agent's gear (equipment.js); animals use their species' attack.
import {isHostile} from '../data/factions.js';
import {SPECIES} from '../data/species.js';
import {kill} from './agent.js';
import {wear} from './equipment.js';
import {agentInZone} from '../settlement/zone.js';
import {think} from './mind.js';

// an agent that is attacking one of ours counts as an enemy even without a war between factions
export const aggressor = (a, o) => o.task?.id === 'maul' && o.task.target && (o.task.target === a || o.task.target.faction === a.faction);

export function nearestHostile(w, a, r) {
  let best = null, bd = r * r;
  for (const o of w.agents) {
    if (o === a || o.dead || !(isHostile(a, o) || aggressor(a, o))) continue;
    const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; best = o; }
  }
  return best;
}

const ensureGear = a => a.gear || {melee: {dmg: (SPECIES.get(a.species).attack || {power: 1}).power, cd: (SPECIES.get(a.species).attack || {cooldown: 12}).cooldown}, armor: 0, block: 0};

// apply a hit: shields may stop melee blows, armour absorbs part of the rest.
// Inside the settlement zone colonists fight harder and a palisade shields them.
export function damage(w, by, t, raw, {melee = true} = {}) {
  const g = ensureGear(t);
  // the victim remembers who hurt it and from how far (a mule charges whoever shot it)
  t.hurtBy = {id: by.id, tick: w.tick, far: !melee};
  if (melee && g.block && w.rng() < g.block) { wear(w, t, g.blockItem); t.flash = 3; return 'blocked'; }
  const home = by.faction === 'colony' && agentInZone(w, by) ? 1.25 : 1;
  const wall = t.faction === 'colony' && agentInZone(w, t) ? w.mods.mul.defense : 1;
  let dmg = raw * home * wall * (1 - (g.armor || 0));
  if (g.armor && t.equip?.body) wear(w, t, t.equip.body);
  t.hp -= dmg;
  if (t.diary && t.hp < 0.45 && t.hp > 0) { if (!t.diary.some(e => e.id === 'wounded' && w.tick - e.t < 360)) t.stats.wounds++; think(w, t, 'wounded'); }
  const memKey = by.species === 'wolf' || t.species === 'wolf' ? 'wolf' : by.species === 'mule' || t.species === 'mule' ? 'mule' : 'raid';
  if (t.faction === 'colony' && t.mem) t.mem[memKey] += 0.25; else if (by.faction === 'colony' && by.mem) by.mem[memKey] += 0.1;
  if (t.hp <= 0) kill(w, t, 'ран', by);
  return dmg;
}

export function attack(w, a, t) {
  if (a.cd > 0) return;
  const g = ensureGear(a);
  a.cd = g.melee.cd; a.flash = 4;
  damage(w, a, t, (0.1 + w.rng() * 0.12) * g.melee.dmg);
  if (g.melee.item) wear(w, a, g.melee.item);
}

// one shot at a target within range; returns 'kill' | 'hit' | 'miss' | null (cannot shoot)
export function shoot(w, a, t, skillJob = 'hunt') {
  const g = a.gear; if (!g?.ranged || !g.rangedReady || a.cd > 0) return null;
  const r = g.ranged, d = Math.hypot(t.x - a.x, t.y - a.y), range = r.range + (a.faction === 'colony' ? w.mods.add.huntRange : 0);
  if (d > range) return null;
  a.cd = r.cd;
  if (r.ammo) { a.equip.back.ammo--; if (a.equip.back.ammo <= 0) g.rangedReady = false; }
  wear(w, a, r.item);
  const skill = a.skill?.[skillJob] ?? 0.2, moving = t.task?.id === 'bolt' || t.task?.id === 'chase' ? 0.12 : 0;
  const hit = w.rng() < 0.4 + 0.4 * skill - (d / range) * 0.2 - moving;
  w.fx.push({x1: a.x, y1: a.y, x2: hit ? t.x : t.x + (w.rng() - 0.5) * 2, y2: hit ? t.y : t.y + (w.rng() - 0.5) * 2, t: 8, kind: r.ammo ? 'arrow' : 'stone'});
  if (!hit) return 'miss';
  const boost = r.boost && a.faction === 'colony' ? (w.mods.best[r.boost] || 1) : 1;
  const res = damage(w, a, t, (0.12 + w.rng() * 0.1) * r.dmg * boost, {melee: false});
  return t.dead ? 'kill' : res === 'blocked' ? 'miss' : 'hit';
}


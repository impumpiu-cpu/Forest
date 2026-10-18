// Fighting: melee blows, shots from bows and slings, armour and shields.
// Weapons come from the agent's gear (equipment.js); animals use their species' attack.
import {isHostile} from '../data/factions.js';
import {SPECIES} from '../data/species.js';
import {maxHp} from './agent.js';
import {wear, def} from './equipment.js';
import {agentInZone} from '../settlement/zone.js';
import {think} from './mind.js';
import {lineOfFire} from '../nav/astar.js';
import {practice} from './skills.js';
import {LEARN} from '../data/skills.js';
import {critChance, lethal} from './wounds.js';
import {CRIT} from '../data/wounds.js';
import {noteHit} from './trophies.js';
import {heatTo} from '../world/heat.js';
import {nearAgents} from './spatial.js';

// an agent that is attacking one of ours counts as an enemy even without a war between factions
export const aggressor = (a, o) => o.task?.id === 'maul' && o.task.target && (o.task.target === a || o.task.target.faction === a.faction);

// Can `a` see `t` right now? The nechist is seen only up close (`veil` cells: a leshy among the trees)
// or not at all while it hides (`hiddenUntil`: a rusalka under the water) — unless it is attacking.
// Finding a foe, keeping after one and striking one all go by this.
export function canSee(w, a, t) {
  if (t.hiddenUntil > w.tick) return false;
  if (t.veil == null || aggressor(a, t)) return true;
  return Math.hypot(t.x - a.x, t.y - a.y) <= t.veil;
}

export function nearestHostile(w, a, r) {
  let best = null, bd = r * r;
  for (const o of nearAgents(w, a.x, a.y, r)) {
    if (o === a || o.dead || o.downed || !(isHostile(a, o) || aggressor(a, o))) continue;   // the fallen are out of the fight
    const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
    if (d >= bd || !canSee(w, a, o)) continue;
    bd = d; best = o;
  }
  return best;
}

// how far a blow reaches: the species' own `attack.reach` (a toad's tongue), otherwise arm's length
export const MELEE_REACH = 1.25;
export const reachOf = a => SPECIES.get(a.species).attack?.reach ?? MELEE_REACH;

const ensureGear = a => a.gear || {melee: {dmg: (SPECIES.get(a.species).attack || {power: 1}).power, cd: (SPECIES.get(a.species).attack || {cooldown: 12}).cooldown}, armor: 0, block: 0};

// Apply a hit: shields may stop melee blows, armour absorbs part of the rest.
// Inside the settlement zone colonists fight harder and a palisade shields them.
// A hit that lands (not dodged, not blocked) may be critical: one check on the attacker's Luck
// (agents/wounds.js critChance), × CRIT.mul, before armour. A blow that takes the last health goes to
// lethal(): death, or for a colonist with luck a fall (data/wounds.js). The fallen are not struck again.
export function damage(w, by, t, raw, {melee = true} = {}) {
  if (t.downed || t.dead) return 'downed';
  const g = ensureGear(t);
  // the victim remembers who hurt it and from how far (a mule charges whoever shot it)
  t.hurtBy = {id: by.id, tick: w.tick, far: !melee};
  // luck: now and then a blow or a shot simply misses (SPECIAL L)
  if (t.mods?.dodge > 0 && w.rngs.combat() < t.mods.dodge) { t.flash = 2; return 'dodged'; }
  const tsp = SPECIES.get(t.species);
  if (!melee && tsp.resist?.ranged) raw *= tsp.resist.ranged;   // arrows pass through a skeleton
  if (melee && tsp.resist?.melee) raw *= tsp.resist.melee;      // an axe in a mycelium does little
  if (melee && g.block && w.rngs.combat() < g.block) { wear(w, t, g.blockItem); t.flash = 3; return 'blocked'; }
  const crit = w.rngs.combat() < critChance(by);
  if (crit) { raw *= CRIT.mul; t.flash = 6; }
  const cs = w.chronicle.combat ||= {hits: 0, crits: 0}; cs.hits++; if (crit) cs.crits++;
  const home = by.faction === 'colony' && agentInZone(w, by) ? 1.25 : 1;
  const wall = t.faction === 'colony' && agentInZone(w, t) ? w.mods.mul.defense : 1;
  let dmg = raw * home * wall * (1 - (g.armor || 0));
  noteHit(t, by);   // the colonists who fought it share in its rare trophies (agents/trophies.js)
  if (g.armor && t.equip?.body) wear(w, t, t.equip.body);
  t.hp -= dmg;
  // creatures that drink blood heal by what they draw
  const bsp = SPECIES.get(by.species);
  if (bsp.drinks && melee && !by.dead) by.hp = Math.min(maxHp(by), by.hp + dmg * bsp.drinks);
  // a venomous bite keeps hurting (agents/body.js), a web slows (agents/movement.js), a drake's breath burns
  if (melee && bsp.venom && !tsp.undead) { t.poison = {dmg: bsp.venom.dmg, until: w.tick + bsp.venom.ticks}; }
  if (melee && bsp.web) t.webbed = {slow: bsp.web.slow, until: w.tick + bsp.web.ticks};
  if (melee && bsp.breath && w.rngs.combat() < bsp.breath) scorch(w, t);
  if (t.diary && t.hp < 0.45 && t.hp > 0) { if (!t.diary.some(e => e.id === 'wounded' && w.tick - e.t < 360)) t.stats.wounds++; think(w, t, 'wounded'); }
  const memKey = by.species === 'wolf' || t.species === 'wolf' ? 'wolf' : by.species === 'mule' || t.species === 'mule' ? 'mule' : 'raid';
  if (t.faction === 'colony' && t.mem) t.mem[memKey] += 0.25; else if (by.faction === 'colony' && by.mem) by.mem[memKey] += 0.1;
  if (t.hp <= 0) lethal(w, t, 'ран', by);
  return dmg;
}

// creatures that fear silver (species `weakTo: ['silver']`): a silvered blade bites them hard, anything else barely
export const SILVER = {bane: 2.5, plain: 0.5};
const silverFactor = (t, item) => (SPECIES.get(t.species).weakTo?.includes('silver') ? (item && def(item).silver ? SILVER.bane : SILVER.plain) : 1);

// a drake's breath: the ground under the victim catches fire (only where there is something to burn)
function scorch(w, t) {
  const cx = t.x | 0, cy = t.y | 0;
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const i = y * w.w + x;
    if (w.grid.fuel[i] > 0.05) { w.grid.fire[i] = Math.max(w.grid.fire[i], 0.5); heatTo(w, i, 260); }
  }
  w.nav.dirty('fire');
}

// rock between the two: no blow and no bite across it. Whoever is that close should step around instead
// (approach() walks around rock), so the callers treat it like "not close enough yet".
export const behindRock = (w, a, t) => !lineOfFire(w, a.x, a.y, t.x, t.y);

// one melee blow; nothing happens (false) unless the target is alive, seen, within reach and not behind rock
// The blow reads and trains the melee skill (data/skills.js): skill only adds (× 1 + MELEE_SKILL × skill),
// so a creature without it hits as before.
export const MELEE_SKILL = 0.4;
export function attack(w, a, t) {
  if (a.cd > 0 || !t || t.dead || t.downed || a.dead) return false;
  if (Math.hypot(t.x - a.x, t.y - a.y) > reachOf(a) || !canSee(w, a, t)) return false;
  // rock stops a blow as it stops a shot (a line through the corner of two rocks included); water does not
  if (behindRock(w, a, t)) return false;
  const g = ensureGear(a);
  a.cd = Math.max(4, Math.round(g.melee.cd * (a.mods?.swing ?? 1))); a.flash = 4;
  damage(w, a, t, (0.1 + w.rngs.combat() * 0.12) * g.melee.dmg * (a.mods?.str ?? 1) * (1 + MELEE_SKILL * (a.skill?.melee || 0)) * silverFactor(t, g.melee.item));
  practice(a, 'melee', LEARN.blow);   // the blow was struck: it teaches, whatever came of it
  if (g.melee.item) wear(w, a, g.melee.item);
  return true;
}

// one shot at a target within range; returns 'kill' | 'hit' | 'miss' | null (cannot shoot).
// The same shot for a hunt and for a fight: it reads and trains the shooting skill (`ranged`), and only
// a shot that really left the bow teaches anything (a reload or a target out of sight teaches nothing).
export function shoot(w, a, t) {
  const g = a.gear; if (!g?.ranged || !g.rangedReady || a.cd > 0 || t.downed) return null;
  const r = g.ranged, d = Math.hypot(t.x - a.x, t.y - a.y), range = r.range + (a.faction === 'colony' ? w.mods.add.huntRange : 0);
  // out of range, unseen, or a rock in the way: no shot
  if (d > range || !canSee(w, a, t) || !lineOfFire(w, a.x, a.y, t.x, t.y)) return null;
  a.cd = r.cd;
  if (r.ammo) { a.equip.back.ammo--; if (a.equip.back.ammo <= 0) g.rangedReady = false; }
  wear(w, a, r.item);
  const skill = a.skill?.ranged ?? 0.2, moving = t.task?.id === 'bolt' || t.task?.id === 'chase' ? 0.12 : 0;
  const hit = w.rngs.combat() < 0.4 + 0.4 * skill + (a.mods?.aim || 0) - (d / range) * 0.2 - moving;
  practice(a, 'ranged', LEARN.shot);   // a miss teaches too: the arrow did fly
  w.fx.push({x1: a.x, y1: a.y, x2: hit ? t.x : t.x + (w.rngs.combat() - 0.5) * 2, y2: hit ? t.y : t.y + (w.rngs.combat() - 0.5) * 2, t: 8, kind: r.ammo ? 'arrow' : 'stone'});
  if (!hit) return 'miss';
  const boost = r.boost && a.faction === 'colony' ? (w.mods.best[r.boost] || 1) : 1;
  const res = damage(w, a, t, (0.12 + w.rngs.combat() * 0.1) * r.dmg * boost * silverFactor(t, null), {melee: false});
  return t.dead ? 'kill' : res === 'blocked' || res === 'dodged' ? 'miss' : 'hit';
}


// Fighting: melee blows, shots from bows and slings, armour and shields.
// The numbers of the fight (base blow, hit chance, skill, reach, silver): data/balance/combat.js.
// Weapons come from the agent's gear (equipment.js); animals use their species' attack.
import {isHostile} from '../data/factions.js';
import {SPECIES} from '../data/species.js';
import {maxHp} from './agent.js';
import {wear, def, blowStat, carriesTorch} from './equipment.js';
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
import {COMBAT, CAPS, DEFAULT_BLOW, ARMOR_VS_CAP, resistTo, traitOf} from '../data/balance/combat.js';
import {drawPlace} from '../data/anatomy.js';
import {CONDITIONS, effectResist} from '../data/conditions.js';
import {taintBy} from './afflictions.js';
import {degreeOf, passed, degreeValue, degreesOn, checkChance, DEGREE_CHECKS} from '../data/checks.js';
import {NORM} from '../data/special.js';

import {firstAttacker} from './lookup.js';
import {KINDLE} from '../data/behaviour.js';
import {T, BY_CODE} from '../data/terrain.js';
import {cellOf} from '../world/grid.js';
import {quaff, drinkFor, bladeHit, silverCoat} from './potions.js';
import {potionOf} from '../data/potions.js';
import {NIGHT, nightSight} from '../data/tongues.js';
import {WATCH} from '../data/colony.js';
import {nightness} from '../core/time.js';
import {log} from '../core/log.js';

// a stunned creature neither strikes nor shoots until it comes to (data/conditions.js 'stunned')
const stunnedNow = (w, a) => !!a.stunned && w.tick < a.stunned.until;

// an agent that is attacking one of ours counts as an enemy even without a war between factions
// a race at home among trees takes a blow lighter there (data/races.js forestGuard: the elves)
export const forestGuard = (w, t) => { const g = SPECIES.get(t.species).forestGuard; return g && BY_CODE[w.grid.terr[cellOf(w, t)]]?.kind === 'wood' ? g : 1; };

export const aggressor = (a, o) => o.task?.id === 'maul' && o.task.target && (o.task.target === a || o.task.target.faction === a.faction);
// who is attacking `a` right now: a beast that mauls (maul) or a raider that fights (fight) with `a` as its target
// (agents/lookup.js keeps who attacks whom, so this is not a walk over every creature)
export const attackerOf = (w, a) => firstAttacker(w, a);

// Can `a` see `t` right now? The nechist is seen only up close (`veil` cells: a leshy among the trees)
// or not at all while it hides (`hiddenUntil`: a rusalka under the water) — unless it is attacking.
// Finding a foe, keeping after one and striking one all go by this.
// how close one who creeps is seen (COMBAT.sneak): heavier armour is heard further
export const sneakSeen = t => COMBAT.sneak.seen + COMBAT.sneak.armour * (t.gear?.armor || 0);
export function canSee(w, a, t) {
  if (t.hiddenUntil > w.tick) return false;
  if (t.sneaking && !t.downed && !t.captive && !aggressor(a, t) && Math.hypot(t.x - a.x, t.y - a.y) > sneakSeen(t)) return false;   // the fallen and the bound creep no more
  if (t.veil == null || aggressor(a, t)) return true;
  return Math.hypot(t.x - a.x, t.y - a.y) <= t.veil;
}

// × how far `a` sees now (data/tongues.js NIGHT): by day, by a lit campfire (WATCH.fireLight), with darkvision or a
// cat's eye — 1; otherwise less the deeper the night; one carrying a torch (in hand or behind the back) loses
// only WATCH.torch of it
export function darkness(w, a) {
  const night = nightness(w);
  if (!(night > 0) || !(NIGHT.loss > 0)) return 1;
  if (w.campLit && w.camp && Math.hypot(a.x - w.camp.x, a.y - w.camp.y) <= WATCH.fireLight) return 1;
  const k = nightSight(a.species, night, a);
  return k < 1 && carriesTorch(a) ? 1 - (1 - k) * (1 - WATCH.torch) : k;   // (a torch: half of what the night takes, as the watchman's)
}

export function nearestHostile(w, a, r) {
  r *= darkness(w, a);   // (the night hides what is further off)
  let best = null, bd = r * r;
  for (const o of nearAgents(w, a.x, a.y, r)) {
    if (o === a || o.dead || o.downed || o.ledBy != null || !(isHostile(a, o) || aggressor(a, o))) continue;   // the fallen and the bound are out of the fight
    const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
    if (d >= bd || !canSee(w, a, o)) continue;
    bd = d; best = o;
  }
  return best;
}

// how far a blow reaches: the species' own `attack.reach` (a toad's tongue), otherwise arm's length; a long weapon
// (quality `reach`, data/balance/combat.js WEAPON_QUALITIES) further
export const reachOf = a => (SPECIES.get(a.species).attack?.reach ?? COMBAT.reach) + traitOf(a.gear?.melee?.q, 'reach');

const ensureGear = a => a.gear || {melee: {dmg: (SPECIES.get(a.species).attack || {power: 1}).power, cd: (SPECIES.get(a.species).attack || {cooldown: 12}).cooldown, type: SPECIES.get(a.species).attack?.type || DEFAULT_BLOW.melee}, armor: 0, block: 0};

// what a blow of this kind meets: the body's armour and the block of the hand that blocks, each × its own `vs`
// (forms.js: mail turns a cut, a hide shield catches a spear point and gives under a club) — one rule for both
const against = (value, vs, type) => (vs && type ? Math.min(ARMOR_VS_CAP, (value || 0) * (vs[type] ?? 1)) : value || 0);
export const armorAgainst = (g, type) => against(g.armor, g.armorVs, type);
// a shot meets only what covers: a shield, at `cover` of its block (forms.js); a sword or a staff parries no arrow.
// A parrying weapon in hand (quality `parry`) adds to the block against blows, never past CAPS.block
export const blockAgainst = (g, type, melee = true) => (melee ? (g.parry ? Math.max(against(g.block, g.blockVs, type), Math.min(CAPS.block, against(g.block, g.blockVs, type) + g.parry)) : against(g.block, g.blockVs, type)) : against(g.cover, g.coverVs, type));
// what the body does to a blow of this kind and delivery (creatures.js `resist`: pierce, slash, blunt, melee, ranged)
export const resistOf = (sp, type, melee) => (sp.resist ? (sp.resist[type] ?? 1) * (sp.resist[melee ? 'melee' : 'ranged'] ?? 1) : 1);

// Apply a hit: a shield may stop a blow or a shot (a parry only a blow), armour absorbs part of the rest.
// Inside the settlement zone colonists fight harder and a palisade shields them.
// A hit that lands (not dodged, not blocked) may be critical: one check on the attacker's Luck
// (agents/wounds.js critChance), × CRIT.mul, before armour. A blow that takes the last health goes to
// lethal(): death, or for a colonist with luck a fall (data/wounds.js). The fallen are not struck again.
// `mix` — a blow of several kinds at once ([[kind, weight], …]: a marked piece, data/balance/marks.js): the body and the
// armour answer each part; a shield stops or lets through the whole blow by its first kind
// `q` — the qualities of the weapon that struck (data/balance/combat.js WEAPON_QUALITIES): piercing takes a share of the
// armour off, vicious makes a critical blow worse. Every blow that lands draws its place on the body (data/anatomy.js)
// from its own stream: × the damage there, and the place a fallen one's trauma comes from
export function damage(w, by, t, raw, {melee = true, type = null, mix = null, q = null, stance = null} = {}) {
  if (t.downed || t.dead) return 'downed';
  const g = ensureGear(t);
  // the victim remembers who hurt it and from how far (a mule charges whoever shot it)
  t.hurtBy = {id: by.id, tick: w.tick, far: !melee};
  // luck: now and then a blow or a shot simply misses (SPECIAL L)
  if (t.mods?.dodge > 0 && w.rngs.combat() < t.mods.dodge) { t.flash = 2; return 'dodged'; }
  const tsp = SPECIES.get(t.species);
  // what kind of blow: the caller's word, else what the striker holds or strikes with
  type ||= melee ? by.gear?.melee?.type || SPECIES.get(by.species).attack?.type || DEFAULT_BLOW.melee : DEFAULT_BLOW.ranged;
  if (mix) type = mix[0][0];
  else raw *= resistOf(tsp, type, melee);   // a spear point in a skeleton, an axe in a mycelium do little
  // a blow from the flank meets half a shield, one in the back none (stanceOf)
  const block = blockAgainst(g, type, melee) * (stance === 'back' ? 0 : stance === 'flank' ? COMBAT.flank.block : 1);
  // the block is a check with four degrees (data/checks.js): a critical block wears the striker's weapon, a botched
  // one lets the blow into the open (both 0 — as before)
  let botched = 1;
  if (block > 0) {
    const deg = degreeOf(w.rngs.combat(), block);
    if (passed(deg)) {
      wear(w, t, melee ? g.blockItem : g.coverItem); t.flash = 3;
      const v = deg === 'critSuccess' ? degreeValue('block', 'critSuccess') : 0;
      if (v && melee && by.gear?.melee?.item) wear(w, by, by.gear.melee.item, v);
      return 'blocked';
    }
    if (deg === 'critFail') botched = 1 + degreeValue('block', 'critFail');
  }
  const crit = w.rngs.combat() < critChance(by);
  if (crit) { raw *= CRIT.mul + traitOf(q, 'vicious'); t.flash = 6; }
  const place = drawPlace(tsp, w.rngs.hits);
  t.hitAt = place.id; raw *= place.dmg * botched;
  const pierce = 1 - traitOf(q, 'piercing');
  // a cut that bleeds, a blow that stuns (weapon qualities `bleed`, `stun`; data/conditions.js): a chance each, drawn
  // from the stream of places, and only for a weapon that has them — every other blow draws nothing more
  const bleed = traitOf(q, 'bleed'), stun = traitOf(q, 'stun');
  if (bleed && !tsp.undead && tsp.kind !== 'spirit' && w.rngs.hits() < bleed) { const C = CONDITIONS.get('bleeding'); t.bleeding = {dmg: C.dmg, until: w.tick + C.ticks}; }
  if (stun && w.rngs.hits() < stun) t.stunned = {until: w.tick + CONDITIONS.get('stunned').ticks};
  // a net (quality `ensnare`): tangled — slow, and no blow until it is shaken off (COMBAT.net)
  const snare = traitOf(q, 'ensnare');
  if (snare && w.rngs.hits() < snare) { const N = COMBAT.net; t.webbed = {slow: N.slow, until: w.tick + N.ticks}; t.stunned = {until: Math.max(t.stunned?.until || 0, w.tick + N.hold)}; }
  const cs = w.chronicle.combat ||= {hits: 0, crits: 0}; cs.hits++; if (crit) cs.crits++;
  const home = by.faction === 'colony' && agentInZone(w, by) ? COMBAT.home : 1;
  const wall = (t.faction === 'colony' && agentInZone(w, t) ? w.mods.mul.defense : 1) * forestGuard(w, t);
  let dmg = mix ? raw * home * wall * mix.reduce((s, [ty, k]) => s + k * resistOf(tsp, ty, melee) * (1 - armorAgainst(g, ty) * pierce), 0)
    : raw * home * wall * (1 - armorAgainst(g, type) * pierce);
  taintBy(w, t, by);   // an undead's blow leaves the rot (agents/afflictions.js; 0 a blow — nothing)
  noteHit(t, by);   // the colonists who fought it share in its rare trophies (agents/trophies.js)
  if (g.armor && t.equip?.body) wear(w, t, t.equip.body);
  t.hp -= dmg;
  // creatures that drink blood heal by what they draw
  const bsp = SPECIES.get(by.species);
  if (bsp.drinks && melee && !by.dead) by.hp = Math.min(maxHp(by), by.hp + dmg * bsp.drinks);
  // a venomous bite keeps hurting (agents/body.js), a web slows (agents/movement.js), a drake's breath burns
  if (melee && bsp.venom && !tsp.undead) { t.poison = {dmg: bsp.venom.dmg * resistTo(tsp, 'poison') * effectResist(w, t, 'poison'), until: w.tick + bsp.venom.ticks}; }
  // a poison rubbed on the blade (agents/potions.js): the blow that struck home carries it in
  if (melee && by.coat && dmg > 0) bladeHit(w, by, t, resistTo(tsp, 'poison') * effectResist(w, t, 'poison'), !!tsp.undead);
  if (melee && bsp.web) t.webbed = {slow: bsp.web.slow, until: w.tick + bsp.web.ticks};
  // a burning weapon (quality `burn`: a torch) sets alight what the struck one stands on — the ground, a wall
  const burn = melee ? traitOf(q, 'burn') : 0;
  if (burn && dmg > 0 && w.rngs.hits() < burn) kindle(w, Math.min(w.h - 1, Math.max(0, t.y | 0)) * w.w + Math.min(w.w - 1, Math.max(0, t.x | 0)));
  if (melee && bsp.breath && w.rngs.combat() < bsp.breath) scorch(w, t);
  if (t.diary && t.hp < 0.45 && t.hp > 0) { if (!t.diary.some(e => e.id === 'wounded' && w.tick - e.t < 360)) t.stats.wounds++; think(w, t, 'wounded'); }
  const memKey = by.species === 'wolf' || t.species === 'wolf' ? 'wolf' : by.species === 'mule' || t.species === 'mule' ? 'mule' : 'raid';
  if (t.faction === 'colony' && t.mem) t.mem[memKey] += 0.25; else if (by.faction === 'colony' && by.mem) by.mem[memKey] += 0.1;
  if (t.hp <= 0) lethal(w, t, 'ран', by); else if (t.potions || t.belt?.length) quaff(w, t);   // a potion at the edge (agents/potions.js)
  return dmg;
}

// creatures that fear silver (species `weakTo: ['silver']`): a silvered blade bites them hard, anything else barely;
// a silvered blade × the body's own answer to silver too (`resist.silver`, the table «Урон по видам»)
export const SILVER = COMBAT.silver;
const silverFactor = (t, item, by = null) => {
  const sp = SPECIES.get(t.species), silvered = !!(item && def(item).silver) || (!!item && silverCoat(by));   // (a silver oil on the blade: agents/potions.js)
  const fear = sp.weakTo?.includes('silver') ? (silvered ? COMBAT.silver.bane : COMBAT.silver.plain) : 1;
  return silvered ? fear * resistTo(sp, 'silver') : fear;
};

// a torch put to a cell (KINDLE.torch): it catches, whatever it held — a wall, the grass
export function kindle(w, i) {
  if (w.grid.terr[i] === T.WATER || w.grid.terr[i] === T.ROCK) return;   // nothing there to catch
  const K = KINDLE.torch; w.grid.fire[i] = Math.max(w.grid.fire[i], K.fire); heatTo(w, i, K.heat); w.grid.fuel[i] = Math.max(w.grid.fuel[i], K.fuel);
  w.nav.dirty('fire');
}

// a drake's breath: the ground under the victim catches fire (only where there is something to burn)
function scorch(w, t) {
  const cx = t.x | 0, cy = t.y | 0;
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const i = y * w.w + x;
    const B = KINDLE.breath; if (w.grid.fuel[i] > B.fuel) { w.grid.fire[i] = Math.max(w.grid.fire[i], B.fire); heatTo(w, i, B.heat); }
  }
  w.nav.dirty('fire');
}

// a fire flask hurled from the belt (data/potions.js flask; its row of «Состояний» `flask`): at a foe from `min` to
// `range` cells off, the way clear and none of the thrower's own within reach of the burst — fire on everyone within
// `radius` (× their answer to fire, × a fire-ward at work), the ground there catches where there is something to burn.
// → true when it flew
export function hurl(w, a, t, d) {
  if (a.cd > 0 || a.dead || a.downed || a.captive || !t || t.dead || stunnedNow(w, a)) return false;
  const res = a.belt?.find(r => potionOf(r)?.potion.use === 'throw'); if (!res) return false;
  const F = CONDITIONS.get(potionOf(res).grade.effect).flask;
  if (d < F.min || d > F.range || !canSee(w, a, t) || !lineOfFire(w, a.x, a.y, t.x, t.y)) return false;
  const caught = nearAgents(w, t.x, t.y, F.radius + 1);
  if (caught.some(o => o !== a && !o.dead && o.faction === a.faction && Math.hypot(o.x - t.x, o.y - t.y) <= F.radius + 1)) return false;   // not into one's own (nearAgents is the cells about: the distance is told here)
  a.belt.splice(a.belt.indexOf(res), 1); a.cd = F.cd;
  const st = w.chronicle.potions ||= {drunk: 0, ours: 0}; (st.by ||= {}).flask = (st.by.flask || 0) + 1;
  w.fx.push({x1: a.x, y1: a.y, x2: t.x, y2: t.y, t: 8, kind: 'stone'});
  for (const o of caught) {
    if (o.dead || o.downed || Math.hypot(o.x - t.x, o.y - t.y) > F.radius) continue;   // (the fallen lie low under it)
    o.hp -= F.dmg * resistTo(SPECIES.get(o.species), 'fire') * effectResist(w, o, 'fire'); o.flash = 6; noteHit(o, a);
    if (o.hp <= 0) lethal(w, o, 'огня', a);
  }
  const cx = t.x | 0, cy = t.y | 0, R = Math.ceil(F.radius);
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h || Math.hypot(x - cx, y - cy) > R) continue;
    const i = y * w.w + x;
    if (w.grid.fuel[i] > KINDLE.breath.fuel) { w.grid.fire[i] = Math.max(w.grid.fire[i], F.fire); heatTo(w, i, F.heat); }
  }
  w.nav.dirty('fire');
  if (a.faction === 'colony' && a.name) log(w, `${a.name} ${a.gender === 'f' ? 'метнула' : 'метнул'} зажигательную склянку.`, 'people');
  return true;
}

// rock between the two: no blow and no bite across it. Whoever is that close should step around instead
// (approach() walks around rock), so the callers treat it like "not close enough yet".
export const behindRock = (w, a, t) => !lineOfFire(w, a.x, a.y, t.x, t.y);

// one melee blow; nothing happens (false) unless the target is alive, seen, within reach and not behind rock
// The blow reads and trains the melee skill (data/skills.js): skill only adds (× 1 + COMBAT.meleeSkill × skill),
// so a creature without it hits as before.
const BLOW = COMBAT.blow, SHOT = COMBAT.shot, HIT = COMBAT.hit;
// Where an armed blow comes from (COMBAT.flank, back): 'back' — the target does not know of the striker (asleep, or out
// of any fight and not hurt lately), 'flank' — it is fighting someone else, otherwise 'front'. A beast's bite is
// always 'front' (a pack's tactics are its own: agents/carcass.js)
const busy = t => (t.task?.id === 'fight' || t.task?.id === 'maul') && t.task.target;
export function stanceOf(w, a, t) {
  if (!a.gear?.melee?.item) return 'front';
  const fighting = busy(t);
  if (fighting) return t.task.target === a ? 'front' : 'flank';
  if (t.sleeping || !(t.hurtBy && w.tick - t.hurtBy.tick < COMBAT.back.aware)) return 'back';
  return 'front';
}
// × the blow from there: the stance's own, its share over 1 × (1 + the weapon's `backstab`)
export const stanceGain = (stance, q) => (stance === 'front' ? 1 : 1 + ((stance === 'back' ? COMBAT.back.dmg : COMBAT.flank.dmg) - 1) * (1 + traitOf(q, 'backstab')));
export function attack(w, a, t) {
  if (a.cd > 0 || !t || t.dead || t.downed || a.dead || stunnedNow(w, a)) return false;
  if (Math.hypot(t.x - a.x, t.y - a.y) > reachOf(a) || !canSee(w, a, t)) return false;
  // the first blow of a fight: a brew for it drunk, a poison rubbed on the blade (agents/potions.js) — the blow waits
  if (a.belt?.length && drinkFor(w, a, 'fight', t)) { a.cd = COMBAT.drink; return true; }
  // rock stops a blow as it stops a shot (a line through the corner of two rocks included); water does not
  if (behindRock(w, a, t)) return false;
  const g = ensureGear(a);
  a.cd = Math.max(COMBAT.minCooldown, Math.round(g.melee.cd * (a.mods?.swing ?? 1))); a.flash = 4;
  a.sneaking = false;   // the first blow gives it away
  // the blow as a check of Agility against a step of the ladder (data/checks.js): rolled only while one of its
  // degrees does something — a full blow, or a miss that leaves the striker open
  let full = 1;
  if (degreesOn('melee')) {
    const deg = degreeOf(w.rngs.combat(), checkChance(a.special?.A ?? NORM, DEGREE_CHECKS.melee.step));
    if (deg === 'critSuccess') full = 1 + degreeValue('melee', 'critSuccess');
    if (deg === 'critFail') a.cd += degreeValue('melee', 'critFail');
  }
  const stance = stanceOf(w, a, t);   // read before the blow: a hurt target knows of it after
  damage(w, a, t, full * (BLOW.base + w.rngs.combat() * BLOW.spread) * g.melee.dmg * blowStat(a, g.melee.scale) * (1 + COMBAT.meleeSkill * (a.skill?.melee || 0)) * silverFactor(t, g.melee.item, a) * stanceGain(stance, g.melee.q), {type: g.melee.type, mix: g.melee.mix || null, q: g.melee.q || null, stance});
  // the other hand follows (quality `paired`: a second dagger, a hatchet): a blow of its own at its share, met by
  // the target's dodge, block and armour as any
  const off = g.offhand;
  if (off && !t.dead && !t.downed) {
    damage(w, a, t, (BLOW.base + w.rngs.combat() * BLOW.spread) * off.dmg * off.share * blowStat(a, off.scale) * (1 + COMBAT.meleeSkill * (a.skill?.melee || 0)) * silverFactor(t, off.item, a) * stanceGain(stance, off.q), {type: off.type, mix: off.mix || null, q: off.q || null, stance});
    wear(w, a, off.item);
  }
  practice(a, 'melee', LEARN.blow);   // the blow was struck: it teaches, whatever came of it
  if (g.melee.item) wear(w, a, g.melee.item);
  return true;
}

// the one who stands between a shooter and its target with a shield up: of the target's side, near it, nearer the
// shooter, close to the line of the shot (COMBAT.cover); the nearest such, or null
function coverFor(w, a, t) {
  const C = COMBAT.cover, dx = t.x - a.x, dy = t.y - a.y, L = Math.hypot(dx, dy) || 1;
  let best = null, bd = Infinity;
  for (const o of nearAgents(w, t.x, t.y, C.near)) {
    if (o === t || o.dead || o.downed || o.faction !== t.faction || !(o.gear?.cover > 0)) continue;
    const along = ((o.x - a.x) * dx + (o.y - a.y) * dy) / L, off = Math.abs((o.x - a.x) * dy - (o.y - a.y) * dx) / L;
    if (along <= 0 || along >= L || off > C.side) continue;   // not between them, or off the line
    const d = Math.hypot(o.x - t.x, o.y - t.y);
    if (d <= C.near && d < bd) { bd = d; best = o; }
  }
  return best;
}

// one shot at a target within range; returns 'kill' | 'hit' | 'miss' | null (cannot shoot).
// The same shot for a hunt and for a fight: it reads and trains the shooting skill (`ranged`), and only
// a shot that really left the bow teaches anything (a reload or a target out of sight teaches nothing).
export function shoot(w, a, t) {
  const g = a.gear; if (!g?.ranged || !g.rangedReady || a.cd > 0 || t.downed || stunnedNow(w, a)) return null;
  const r = g.ranged, d = Math.hypot(t.x - a.x, t.y - a.y), range = (r.range + (a.faction === 'colony' ? w.mods.add.huntRange : 0)) * darkness(w, a);   // (in the dark one shoots only as far as one sees)
  // out of range, unseen, or a rock in the way: no shot
  if (d > range || !canSee(w, a, t) || !lineOfFire(w, a.x, a.y, t.x, t.y)) return null;
  if (!(r.dmg > 0)) return null;   // a torch is thrown at a wall, not at a body (agents/tasks.js torch)
  // the first shot of a fight, as the first blow: a brew for it (a light step; a cat's eye at night; a fire-ward against
  // a fire-breather) — the shot waits; no oil goes on a bow (agents/potions.js fits)
  if (a.belt?.length && (isHostile(a, t) || aggressor(a, t)) && drinkFor(w, a, 'fight', t)) { a.cd = COMBAT.drink; return 'drink'; }   // (not at game: a hunter keeps its brews)
  a.cd = r.cd; a.sneaking = false;
  const thrown = traitOf(r.q, 'thrown') > 0;   // a javelin, a hatchet: one of the bundle flies, the last stays in the hand
  if (thrown) { r.item.ammo = (r.item.ammo || 0) - 1; if (r.item.ammo <= 0) g.rangedReady = false; }
  else if (r.ammo) { a.equip.back.ammo--; if (a.equip.back.ammo <= 0) g.rangedReady = false; }
  wear(w, a, r.item);
  const skill = a.skill?.ranged ?? HIT.noSkill, moving = t.task?.id === 'bolt' || t.task?.id === 'chase' ? HIT.moving : 0;
  // to hit is a check with four degrees (data/checks.js): success as always while the roll is under the chance
  const deg = degreeOf(w.rngs.combat(), HIT.base + HIT.skill * skill + (a.mods?.aim || 0) - (d / range) * HIT.far - moving), hit = passed(deg);
  if (deg === 'critFail') { const v = degreeValue('shot', 'critFail'); if (v) wear(w, a, r.item, v); }
  practice(a, 'ranged', LEARN.shot);   // a miss teaches too: the arrow did fly
  w.fx.push({x1: a.x, y1: a.y, x2: hit ? t.x : t.x + (w.rngs.combat() - 0.5) * 2, y2: hit ? t.y : t.y + (w.rngs.combat() - 0.5) * 2, t: 8, kind: r.ammo || thrown ? 'arrow' : 'stone'});
  if (!hit) return 'miss';
  // a shield-bearer between the shooter and the target catches the shot for it (COMBAT.cover)
  const guard = coverFor(w, a, t);
  if (guard && w.rngs.combat() < guard.gear.cover * COMBAT.cover.share) { wear(w, guard, guard.gear.coverItem); guard.flash = 3; return 'miss'; }
  const boost = r.boost && a.faction === 'colony' ? (w.mods.best[r.boost] || 1) : 1;
  const sure = deg === 'critSuccess' ? 1 + degreeValue('shot', 'critSuccess') : 1;
  const res = damage(w, a, t, (SHOT.base + w.rngs.combat() * SHOT.spread) * r.dmg * boost * silverFactor(t, null) * sure, {melee: false, type: r.type || DEFAULT_BLOW.ranged, mix: r.mix || null, q: r.q || null});
  return t.dead ? 'kill' : res === 'blocked' || res === 'dodged' ? 'miss' : 'hit';
}


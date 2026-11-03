// Captives (docs/CAPTIVES.md, numbers: data/captives.js). A thinking foe who fell senseless after the
// fight (agents/wounds.js) may be bound: a colonist with bonds in the stock goes to it, dresses the wound
// and ties it up. That saves its life and makes it one of the settlement — with a lot of its own:
//   - a member of the colony (faction 'colony') with `a.captive = {since, bonds, by, band, people}`;
//   - it eats, sleeps and keeps warm with everyone, works the vacancies, cries out when it sees a threat;
//   - it never sits at the council, takes no flag, no watch, no work beyond the settlement zone, holds
//     no weapon and no armour (a tool and clothes only), and answers only an attack on itself;
//   - out of the zone it is turned back to the fire at once.
//   bindOption(w, a)      — the colonist's choice: a fallen foe to bind (agents/brains/colonist.js)
//   bindCaptive(w, by, f) — the knots are tied (agents/tasks/social.js 'bind')
//   captiveItem(it)       — what a captive may hold (agents/outfit.js)
import {SPECIES} from '../data/species.js';
import {BONDS, CAPTIVE, ESCAPE, bestBonds} from '../data/captives.js';
import {CAN_FALL, WOUNDS, GRAVE_TICKS, DEATHBLOW} from '../data/wounds.js';
import {isHostile} from '../data/factions.js';
import {RESOURCES} from '../data/resources.js';
import {maxHp, hpShare, personality, freshName} from '../agents/agent.js';
import {refreshBody} from '../agents/special.js';
import {def, allItems, emptySlots, putOn, recalcGear, captiveItem} from '../agents/equipment.js';
export {captiveItem};
import {load} from '../agents/jobRunners.js';
import {nearAgents} from '../agents/spatial.js';
import {think} from '../agents/mind.js';
import {wake} from '../agents/attention.js';
import {releaseAll} from './reserve.js';
import {enrol, recordOf} from './chronicle.js';
import {colonists, raidAlarm} from './query.js';
import {raidOnBoard} from './board.js';
import {log} from '../core/log.js';
import {esc, g, perTick} from '../core/util.js';
import {liveById} from '../agents/lookup.js';
import {setStanding} from '../agents/standing.js';
import {raceFrees} from '../data/slavery.js';
import {colonyRace} from '../data/buildings.js';

export const captives = w => colonists(w).filter(a => a.captive && !a.dead);

// can the colony take one more: bonds in the stock and room for a captive
// a colony of a people that keeps no captives (data/slavery.js frees: the dwarves) dresses a fallen foe and lets it go
export const letsGo = w => raceFrees(colonyRace(w));
export const canBind = w => letsGo(w) || (captives(w).length < CAPTIVE.max && !!bestBonds(w.stock));

// a foe lying senseless that could be taken
const takeable = (w, o) => !!o.downed && !o.dead && o.faction !== 'colony' && CAN_FALL(SPECIES.get(o.species), {faction: 'colony'});
const fallenFoes = w => perTick(w, 'fallenFoes', () => w.agents.filter(o => o.downed && !o.dead && o.faction !== 'colony'));   // scan: once a tick

// nobody on its feet who would fight for the fallen is this close to it
function calmAround(w, f) {
  for (const o of nearAgents(w, f.x, f.y, CAPTIVE.calm)) {
    if (o === f || o.dead || o.downed || o.gone || o.task?.id === 'leave') continue;
    if (isHostile(o, {faction: 'colony'}) && Math.hypot(o.x - f.x, o.y - f.y) <= CAPTIVE.calm) return false;
  }
  return true;
}
const binder = (w, id) => colonists(w).find(o => o.task?.id === 'bind' && o.task.who === id);

// any fallen foe the colony could bind now (the camp waits for them before it ends: campaign/camp.js)
export const bindWaiting = w => canBind(w) && fallenFoes(w).some(o => takeable(w, o));

// the colonist's choice: the nearest fallen foe nobody else is binding, when it is safe and there are bonds
export function bindOption(w, a) {
  if (a.captive || a.downed || hpShare(a) < CAPTIVE.bindHp) return null;
  const why = f => `${SPECIES.get(f.species).label} лежит без сознания: связать, пока жив`;
  if (a.task?.id === 'bind') {
    const f = liveById(w, a.task.who);
    if (f && takeable(w, f) && canBind(w)) return [a.task, CAPTIVE.bindWeight, () => why(f)];
  }
  // after the fight, not in it: while a raid is on, the fallen wait (settlement/board.js red flags)
  if (!canBind(w) || raidAlarm(w) || raidOnBoard(w)) return null;
  let best = null, bd = Infinity;
  for (const f of fallenFoes(w)) {
    if (!takeable(w, f)) continue;
    const d = Math.hypot(f.x - a.x, f.y - a.y);
    if (d > CAPTIVE.bindFar || d >= bd) continue;
    const h = binder(w, f.id); if (h && h !== a) continue;
    if (!calmAround(w, f)) continue;
    best = f; bd = d;
  }
  return best ? [{id: 'bind', who: best.id}, CAPTIVE.bindWeight - bd * 0.002, () => why(best)] : null;
}
export const bindStillOn = (w, a, task) => { const f = liveById(w, task.who); return f && takeable(w, f) && canBind(w) ? f : null; };

// ── the knots are tied: the wound dressed, the foe one of ours, with the lot of a captive
export function bindCaptive(w, by, f) {
  if (letsGo(w)) return letGo(w, by, f);
  const B = bestBonds(w.stock);
  if (!B || !f.downed || f.dead) return null;
  w.stock[B.resource] -= B.n;
  // the wound dressed in time (as agents/wounds.js stabilize, without the colonist's words)
  const d = f.downed; f.downed = null;
  f.wounds = [...(f.wounds || []), {id: 'grave', until: w.tick + GRAVE_TICKS('grave')}];
  if (d.trauma) f.wounds.push({id: d.trauma});
  // the goods on its back go to the one who bound it; weapons and armour to the store
  if (f.loot) {
    const parts = [];
    for (const [r, v] of Object.entries(f.loot)) if (v > 0) { load(by, r, v); parts.push(`${RESOURCES.get(r).label} ${Math.round(v * 10) / 10}`); }
    f.loot = null;
    if (parts.length) log(w, `<b>${esc(by.name)}</b> ${g(by, 'забрал', 'забрала')} у пленного добычу: ${parts.join(', ')}.`, 'danger');
  }
  const kept = [], taken = [];
  for (const it of allItems(f)) (captiveItem(it) ? kept : taken).push(it);
  if (f.equip) {
    f.equip = emptySlots();
    const spill = [];
    for (const it of kept) putOn(f, it, def(it).slot === 'body' ? 'body' : def(it).slot === 'back' ? 'back' : def(it).hands === 2 ? 'hands2' : f.equip.right ? 'left' : 'right', spill);
    taken.push(...spill);
  }
  const loot = taken.filter(it => it.dur > 0);
  if (loot.length) { w.armory.push(...loot); w.armoryVersion = (w.armoryVersion || 0) + 1; }
  // one of the settlement now
  const sp = SPECIES.get(f.species), was = f.name;
  releaseAll(w, f);
  // (a runaway brought down is bound again: it stays the captive it was — will, years, service)
  setStanding(f, 'captive', f.captive ? {...f.captive, bonds: B.id} : {since: w.tick, bonds: B.id, by: by.id, band: f.band || null, people: f.people || null, was: f.faction, will: ESCAPE.will.start});
  f.squad = null; f.band = null; f.looted = false; f.lost = false; f.leads = null; f.obeys = null; f.obeysUp = null; f.sneaking = false;
  f.fightRole = null; f.sqRole = null; f.link = null; f.linkNo = null; f.linkKind = null;   // its band's role and link are over
  const ranked = !!f.marks?.some(m => m === 'officer' || m === 'wight');
  if (f.marks) { f.marks = f.marks.filter(m => m !== 'officer' && m !== 'wight'); if (!f.marks.length) delete f.marks; }   // nor its band's rank (agents/ranks.js)
  if (!f.prefs) personality(w, f);
  if (sp.names && (!f.name || ranked || f.name === sp.label || /^налётчик/i.test(f.name))) [f.name, f.gender] = freshName(w, sp.names);   // (a rank is no name)
  f.diary ||= [];
  if (!recordOf(w, f)) { enrol(w, f, false); const r = recordOf(w, f); if (r) r.captive = true; }
  refreshBody(f);
  f.hp = Math.max(f.hp, DEATHBLOW.stableHp * maxHp(f) * (1 + (by.skill?.medicine || 0)));
  for (const n of Object.keys(f.needs || {})) f.needs[n] = Math.max(f.needs[n], 0.4);
  recalcGear(f);
  f.task = null; f.think = 0; wake(f, 'очнулся в плену', 'очнулся');
  if (w.scratch) delete w.scratch.colonists;
  const C = (w.chronicle.captives ||= {taken: 0, died: 0});
  C.taken++;
  think(w, f, 'captured', {bonds: B.label});
  if (d.trauma) think(w, f, 'trauma', {what: WOUNDS.get(d.trauma).label});
  think(w, by, 'tookCaptive', {name: f.name});
  const who = was && was !== f.name && !/^налётчик/i.test(was) ? `${esc(f.name)} (${esc(was)}, ${sp.label})` : `${esc(f.name)}, ${sp.label},`;
  log(w, `<b>${esc(by.name)}</b> ${g(by, 'перевязал и связал', 'перевязала и связала')} упавшего врага: ${who} теперь пленный. Путы — ${B.label}.`, 'people', 'notice');
  return B;
}

// the wound dressed and the fallen foe let go: it walks off the map, its arms and armour stay in the store → {label}
function letGo(w, by, f) {
  if (!f.downed || f.dead) return null;
  const d = f.downed; f.downed = null;
  f.wounds = [...(f.wounds || []), {id: 'grave', until: w.tick + GRAVE_TICKS('grave')}];
  if (d.trauma) f.wounds.push({id: d.trauma});
  const loot = allItems(f).filter(it => it.dur > 0 && !captiveItem(it));
  if (f.equip) { f.equip = emptySlots(); for (const it of allItems(f).filter(captiveItem)) putOn(f, it, 'body', []); }
  if (loot.length) { w.armory.push(...loot); w.armoryVersion = (w.armoryVersion || 0) + 1; }
  if (f.loot) { for (const [r, v] of Object.entries(f.loot)) if (v > 0) load(by, r, v); f.loot = null; }
  releaseAll(w, f);
  f.hp = Math.max(f.hp, DEATHBLOW.stableHp * maxHp(f));
  f.faction = 'leavers'; f.brain = 'leaver'; f.task = {id: 'leave'}; f.squad = null; f.band = null; f.leads = null; f.fightRole = null;
  recalcGear(f);
  const C = (w.chronicle.captives ||= {taken: 0, died: 0}); C.freed = (C.freed || 0) + 1;
  log(w, `<b>${esc(by.name)}</b> ${g(by, 'перевязал', 'перевязала')} упавшего врага (${SPECIES.get(f.species).label}) и ${g(by, 'отпустил', 'отпустила')}: дварфы пленных не держат.`, 'people', 'notice');
  return {label: 'отпущен'};
}

// a captive died: shackles come back to the stock (rope is cut and lost)
export function captiveDied(w, a, cause) {
  // a runaway killed out there (settlement/escape.js): its bonds are lost with it; its death is still told
  if (a.fugitive) {
    const r = w.chronicle.people?.find(p => p.id === a.id); if (r) { r.died = w.tick; r.cause = g(a, `погиб в бегах (${cause})`, `погибла в бегах (${cause})`); }
    const C = (w.chronicle.captives ||= {taken: 0, died: 0}); C.died++;
    return;
  }
  const B = BONDS.has(a.captive.bonds) ? BONDS.get(a.captive.bonds) : null;
  // (a caravan's captive dying in its camp: the campaign takes the shackles back itself, campaign/captives.js unbind)
  if (B?.back && !a.captive.member) w.stock[B.resource] = (w.stock[B.resource] || 0) + B.n;
  const C = (w.chronicle.captives ||= {taken: 0, died: 0}); C.died++;
}

// once a step of the colonist brain: a captive outside the settlement zone goes straight back
const OUTSIDE_OK = new Set(['fight', 'flee', 'runHome', 'downed']);
export function keepInside(w, a, inZone) {
  if (!a.captive || inZone || OUTSIDE_OK.has(a.task?.id)) return false;
  a.switchWhy = 'пленному нельзя за периметр';
  a.task = {id: 'runHome'};
  return true;
}

// the card: what binds it, since when
export function captiveText(w, a) {
  if (!a.captive) return '';
  const B = BONDS.has(a.captive.bonds) ? BONDS.get(a.captive.bonds) : null;
  return `пленный${B ? `, ${B.short}` : ''}`;
}

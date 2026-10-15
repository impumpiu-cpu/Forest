// Everyday life of the outpost: furniture and the standing of buildings, the dead and their graves,
// home brew in the evenings, prayer at the shrine, and what a long low mood does to people.
//
// Furniture (data/furniture.js) is made into the stock and put into solid buildings at dawn, up to
// FURNISH_MAX pieces each, the finest piece into the building that needs it most (houses first).
// A building's standing — statusOf(b), the sum of its pieces' comfort — works where it stands:
// sleepers in furnished houses wake happier, work at a furnished workshop goes faster, the healer
// tends faster, prayer at a furnished shrine comforts more.
//
// The dead: a colonist who dies leaves a body where they fell (w.corpses). Someone buries it
// (data/jobs.js 'bury'); the grave goes to the shrine's churchyard or, without a shrine, to a plot
// beside the camp. Bodies lying unburied for a day weigh on everyone; a funeral eases the grief,
// a funeral with the rite at the shrine eases it twice as much.
//
// Brew: in the evening after the council those in low spirits get a cup of braga while it lasts; with enough for everyone, once in LIFE.feastEvery, it is a feast. Now and then a cup costs a
// sore head next morning.
//
// Gloom: someone whose mood stays below LIFE.gloomBelow at dawn day after day first sulks for a few
// hours instead of working, and after LIFE.leaveAfter such days may leave the outpost for good.
import {isFree} from './reserve.js';
import {BUILDINGS} from '../data/buildings.js';
import {FURNITURE, FURNISH_MAX} from '../data/furniture.js';
import {DAY, HOUR} from '../core/time.js';
import {log} from '../core/log.js';
import {esc, g} from '../core/util.js';
import {colonists, has} from './query.js';
import {think, moodOf} from '../agents/mind.js';
import {walkable, isCampArea} from '../world/grid.js';
import {stripAll} from '../agents/equipment.js';
import {SPECIES} from '../data/species.js';

// races that live on brew (dwarves: `brew` in data/races.js) work slower without it
const brewOf = a => SPECIES.get(a.species).brew;
export function brewFactor(w, a) {
  const b = brewOf(a); if (!b) return 1;
  return a.drankAt != null && w.tick - a.drankAt < b.lasts * DAY ? b.drunk : b.sober;
}

export const LIFE = {
  unburiedAfter: 0.6 * DAY,   // a body lying this long weighs on everyone
  gloomBelow: -0.35,          // mood at dawn that counts as a gloomy day
  sulkFrom: 2,                // gloomy days in a row before someone sulks…
  sulkChance: 0.5,
  leaveAfter: 5,              // …and before they may leave (if still below leaveBelow)
  leaveBelow: -0.5, leaveChance: 0.35,
  hangover: 0.15,             // chance a cup of braga costs a sore head
  feastEvery: 6 * DAY,        // a feast for all at most this often
  prayGap: DAY,               // one prayer a day is enough
};

// ── furniture and standing
const furnishable = w => w.buildings.filter(b => b.done && BUILDINGS.get(b.key).furnish);
export const statusOf = b => (b?.furniture || []).reduce((s, id) => s + (FURNITURE.get(id)?.comfort || 0), 0);
const inStock = w => FURNITURE.all().reduce((s, f) => s + Math.floor(w.stock[f.id] || 0), 0);
export const freeSlots = w => furnishable(w).reduce((s, b) => s + FURNISH_MAX - (b.furniture?.length || 0), 0) - inStock(w);
// comfort of the colony's houses, per bed: how much better a night there is
export function homeComfort(w) {
  const houses = w.buildings.filter(b => b.done && b.key === 'house');
  return houses.length ? houses.reduce((s, b) => s + statusOf(b), 0) / houses.length : 0;
}
// how much a building's standing speeds work there (×)
export const workBonus = b => 1 + statusOf(b);

// which building should get the next piece: houses, then the shrine and the healer, then the rest;
// the barest one of the kind first
const ORDER = ['house', 'shrine', 'healerhut', 'hearth', 'crafthut'];
function furnish(w) {
  const pieces = FURNITURE.filter(f => (w.stock[f.id] || 0) >= 1).sort((x, y) => y.comfort - x.comfort);
  for (const f of pieces) {
    while ((w.stock[f.id] || 0) >= 1) {
      const room = furnishable(w).filter(b => (b.furniture?.length || 0) < FURNISH_MAX);
      if (!room.length) return;
      const rank = b => { const k = ORDER.indexOf(b.key); return (k < 0 ? ORDER.length : k) * 10 + statusOf(b) * 20; };
      const b = room.sort((x, y) => rank(x) - rank(y))[0];
      (b.furniture ||= []).push(f.id); w.stock[f.id] -= 1;
      const d = BUILDINGS.get(b.key);
      log(w, `${f.label[0].toUpperCase() + f.label.slice(1)} — ${d.name === 'Изба' ? 'в избу' : 'в ' + d.name.toLowerCase()}. Убранство: ${b.furniture.map(id => FURNITURE.get(id).label).join(', ')}.`, 'build');
    }
  }
}

// ── the dead
export function addCorpse(w, a) {
  (w.corpses ||= []).push({id: a.id, name: a.name, f: a.gender === 'f', x: a.x, y: a.y, tick: w.tick});
}
export const corpses = w => w.corpses || [];
// a body nobody else is carrying (reservation 'corpse:<id>', settlement/reserve.js); not while wolves prowl near it
const wolvesNear = (w, c) => w.agents.some(o => o.species === 'wolf' && !o.dead && Math.hypot(o.x - c.x, o.y - c.y) < 20);
export const reachableCorpses = w => corpses(w).filter(c => !wolvesNear(w, c));
export function freeCorpse(w, a) {
  let best = null, bd = Infinity;
  for (const c of reachableCorpses(w)) {
    if (!isFree(w, 'corpse:' + c.id, a)) continue;
    const d = Math.hypot(c.x - a.x, c.y - a.y); if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// where the next grave goes: rows beside the shrine, or a plot near the camp chosen once
export function graveSpot(w) {
  const shrine = w.buildings.find(b => b.done && b.key === 'shrine');
  const taken = new Set((w.graves || []).map(gr => gr.y * w.w + gr.x));
  const ok = (x, y) => x > 0 && y > 0 && x < w.w - 1 && y < w.h - 1 && walkable(w, y * w.w + x) && w.grid.bld[y * w.w + x] < 0
    && !isCampArea(w, y * w.w + x) && !taken.has(y * w.w + x);
  let ox, oy;
  if (shrine) { ox = shrine.x - 1; oy = shrine.y + shrine.h + 1; }
  else {
    if (!w.graveyard) {
      for (let r = 8; r < 14 && !w.graveyard; r++) for (let k = 0; k < 24 && !w.graveyard; k++) {
        const ang = k / 24 * Math.PI * 2, x = Math.round(w.camp.x + Math.cos(ang) * r), y = Math.round(w.camp.y + Math.sin(ang) * r);
        if (ok(x, y) && ok(x + 1, y) && ok(x, y + 1)) w.graveyard = {x, y};
      }
      w.graveyard ||= {x: w.camp.x + 8, y: w.camp.y + 8};
    }
    ({x: ox, y: oy} = w.graveyard);
  }
  for (let row = 0; row < 8; row++) for (let col = 0; col < 5; col++) {
    const x = ox + col, y = oy + row; if (ok(x, y)) return [x + 0.5, y + 0.5];
  }
  return [ox + 0.5, oy + 0.5];
}

export function bury(w, c, by, spot) {
  // someone else may have dug a grave right here meanwhile: the next free place then
  if ((w.graves || []).some(gr => gr.x === (spot[0] | 0) && gr.y === (spot[1] | 0))) spot = graveSpot(w);
  const [x, y] = spot;
  w.corpses = corpses(w).filter(o => o !== c);
  const rite = has(w, 'shrine');
  (w.graves ||= []).push({x: x | 0, y: y | 0, name: c.name, f: c.f, died: c.tick, tick: w.tick, rite});
  log(w, `<b>${esc(by.name)}</b> ${g(by, 'проводил', 'проводила')} в последний путь: ${esc(c.name)}${rite ? '. Похоронили у святилища, с обрядом' : ''}.`, 'people');
  for (const a of colonists(w)) {
    think(w, a, rite ? 'funeralRite' : 'funeral', {name: c.name});
    // grief for the dead fades sooner once they are laid to rest
    for (const e of a.diary || []) if (e.id === 'grief' && e.until > w.tick) e.until = w.tick + (e.until - w.tick) * (rite ? 0.5 : 0.75);
  }
}

// ── brew and gloom
function evening(w) {
  const col = colonists(w); if (!col.length) return;
  const have = Math.floor(w.stock.braga || 0); if (have < 1) return;
  // a feast for everyone when there is enough and the last one was a while ago; otherwise a cup for the gloomiest
  const feast = have >= col.length && w.tick - (w.lastFeast ?? -1e9) >= LIFE.feastEvery;
  if (feast) w.lastFeast = w.tick;
  // a cup only for those who need cheering up (at most a third of the colony), so the brew can build up for a feast
  // those who live on brew get theirs first
  const brewers = col.filter(brewOf);
  const order = feast ? col : [...brewers, ...col.filter(a => !brewOf(a) && moodOf(w, a) < -0.1).sort((x, y) => moodOf(w, x) - moodOf(w, y))];
  const n = feast ? col.length : Math.min(have, Math.ceil(col.length / 3) + brewers.length, order.length);
  if (!n) return;
  for (const a of order.slice(0, n)) {
    if (a.task?.id === 'treat' || a.dead) continue;
    w.stock.braga -= 1;
    a.drankAt = w.tick;
    const b = brewOf(a);
    if (b) a.needs.food = Math.min(1, (a.needs.food ?? 1) + b.food);
    think(w, a, feast ? 'feast' : b ? 'beerFed' : 'drank');
    if (w.rngs.colony() < LIFE.hangover) think(w, a, 'hangover');
  }
  w.chronicle.cups = (w.chronicle.cups || 0) + n; if (feast) w.chronicle.feasts = (w.chronicle.feasts || 0) + 1;
  if (feast) log(w, `Вечером пировали: браги хватило на всех (${n}).`, 'people');
}

function dawn(w) {
  furnish(w);
  if (corpses(w).some(c => w.tick - c.tick > LIFE.unburiedAfter)) for (const a of colonists(w)) think(w, a, 'unburied');
  for (const a of colonists(w)) {
    if (brewOf(a) && brewFactor(w, a) < 1) think(w, a, 'sober');
    const m = moodOf(w, a);
    a.gloom = m < LIFE.gloomBelow ? (a.gloom || 0) + 1 : 0;
    if (a.gloom >= LIFE.leaveAfter && m < LIFE.leaveBelow && w.rngs.colony() < LIFE.leaveChance) { leave(w, a); continue; }
    if (a.gloom >= LIFE.sulkFrom && w.rngs.colony() < LIFE.sulkChance) {
      a.task = {id: 'sulk', until: w.tick + 3 * HOUR}; think(w, a, 'sulking'); w.chronicle.sulks = (w.chronicle.sulks || 0) + 1;
      log(w, `<b>${esc(a.name)}</b> ${g(a, 'хандрит', 'хандрит')}: бросает работу и бродит по лагерю.`, 'people');
    }
  }
}

// someone who has had enough walks away, leaving their gear in the store
function leave(w, a) {
  if (a.equip) { stripAll(a, w.armory); w.armoryVersion = (w.armoryVersion || 0) + 1; }
  a.faction = 'leavers'; a.brain = 'leaver'; a.task = {id: 'leave'}; a.carry = null;
  if (w.scratch) delete w.scratch.colonists;
  w.chronicle.left = (w.chronicle.left || 0) + 1;
  const r = w.chronicle.people?.find(p => p.id === a.id); if (r) { r.left = w.tick; r.cause = g(a, 'ушёл из поселения', 'ушла из поселения'); }
  log(w, `<b>${esc(a.name)}</b> ${g(a, 'не выдержал', 'не выдержала')} и ${g(a, 'ушёл', 'ушла')} из поселения.`, 'people', 'alert');
  for (const o of colonists(w)) think(w, o, 'someoneLeft', {name: a.name, f: a.gender === 'f'});
}

export function stepLife(w) {
  const t = w.tick % DAY;
  if (t === 5 * HOUR) dawn(w);
  else if (t === Math.round(21.6 * HOUR)) evening(w);
}

// the shrine: worth a walk for someone in low spirits, once a day
export const wantsPrayer = (w, a) => has(w, 'shrine') && w.tick - (a.prayed ?? -1e9) > LIFE.prayGap ? Math.max(0, -moodOf(w, a)) : 0;
export function prayed(w, a) {
  a.prayed = w.tick;
  const b = w.buildings.find(x => x.done && x.key === 'shrine');
  // a candle lit before the idol makes the prayer comfort more
  const candle = (w.stock.candles || 0) >= 1;
  if (candle) w.stock.candles -= 1;
  const k = (1 + 2 * statusOf(b)) * (candle ? 1.5 : 1);
  think(w, a, 'prayed', {mood: Math.min(0.5, 0.2 * k)});
}

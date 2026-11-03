// The colony's livestock. A wild animal whose species has a `tame` block (data/species.js, data/bestiary.js: goats,
// sheep, horses, aurochs, camels, mules) can be tamed by a herder with bait from the stock (agents/jobRunners.js, runner 'herd');
// it then joins the faction 'herd', walks to a pen (data/buildings.js, `pen`) and lives there
// (agents/behaviours/penned.js, fendOff.js: the brain `livestock`).
//
// Once a day, at dawn (stepHerd):
//   - every animal eats: grass in the pen covers HERD.graze[season] of it, hay from the stock the
//     rest; an animal that goes hungry for a few days breaks out and goes wild again;
//   - a fed animal gives milk (little in winter) and grows wool, if its kind does (`milk`, `wool`), which the herder takes;
//   - a kind that breeds (`breed`): with two grown ones, room in the pen and warm weather a young one may be born; the
//     young grow up in `grownDays`;
//   - grown surplus is slaughtered for meat while supplies are low; `keep` of each breeding kind stay for breeding.
// Tame mules work for the colony: their `effects` join the colony's modifiers (settlement/mods.js).
import {canDoAction} from '../agents/skills.js';
import {isFree} from './reserve.js';
import {SPECIES, brainOf} from '../data/species.js';
import {BUILDINGS, penK, useHerd} from '../data/buildings.js';
import {DAY, HOUR} from '../core/time.js';
import {season, SEASON_DAYS, daysLeftInSeason} from '../data/seasons.js';
import {log} from '../core/log.js';
import {esc, perTick} from '../core/util.js';
import {colonists, foodTotal, buildingById} from './query.js';
import {createAgent} from '../agents/agent.js';
import {recomputeMods} from './mods.js';
import {think} from '../agents/mind.js';
import {HERD} from '../data/colony.js';
import {useWinterHay} from '../data/plants.js';

export {HERD};   // (data/colony.js)
const tameOf = a => SPECIES.get(a.species).tame;
// the breeders of a kind the pen keeps whatever happens (species tame `keep`); a kind that does not breed keeps none
const keepOf = T => (T.breed ? T.keep ?? HERD.breeders : 0);
// the word is a she's: «коза оголодала», «лошадь сыта» (species `g`)
const she = a => SPECIES.get(a.species).g === 'f';
// the per-tick lists are out of date once an animal joins, leaves or dies
const forget = w => { if (w.scratch) { delete w.scratch.herd; delete w.scratch.tameTargets; delete w.scratch.chores; } };
export const herd = w => perTick(w, 'herd', () => w.agents.filter(a => a.tame && !a.dead && !a.warBeast && !a.summoned));
export const pens = w => w.buildings.filter(b => b.done && b.key === 'pen');
export const penSpace = w => pens(w).reduce((s, b) => s + BUILDINGS.get(b.key).pen, 0) * penK(w);   // (the greenskins keep twice the herd: data/buildings.js PEN_K)
export const penUsed = w => herd(w).reduce((s, a) => s + tameOf(a).space, 0);
export const penRoom = w => penSpace(w) - penUsed(w);
export const isTameable = o => !o.dead && !o.tame && !o.warBeast && !o.summoned && o.faction === 'wild' && o.owner == null && !!SPECIES.get(o.species).tame;

// wild animals the herder could go for now: room for them in the pen, bait in the stock, not too far
// (the herder's runner leaves a beast another herder is already after to them: `tamerAt` is renewed
// while they go for it — see claimed())
// another herder is already after this animal (taming, milking or shearing it): reservation 'beast:<id>'
export const claimed = (w, o, a) => !isFree(w, 'beast:' + o.id, a);
// may this herder go after this wild beast? (species tame.tier on husbandry, agents/skills.js)
export const canTame = (a, b) => !a || canDoAction(a, 'husbandry', SPECIES.get(b.species).tame?.tier);

export const tameTargets = w => perTick(w, 'tameTargets', () => {
  const room = penRoom(w);
  if (room <= 0) return [];
  // no new mouths for the winter unless the hay is already in: taming is for spring and summer,
  // or an autumn with the hay stacked; and no more of a kind than the colony has use for (`max`)
  const S = season(w);
  if (S.lean) return [];
  const kinds = {};
  for (const a of herd(w)) kinds[a.species] = (kinds[a.species] || 0) + 1;
  return w.agents.filter(o => isTameable(o) && tameOf(o).space <= room && hasBait(w, tameOf(o)) && !(w.tick - (o.unreachable ?? -1e9) < 600)
    && (kinds[o.species] || 0) < (tameOf(o).max ?? Infinity)
    && (!S.stockUp || (w.stock.hay || 0) >= winterHay(w) + tameOf(o).eats * SEASON_DAYS * (1 - HERD.graze.winter))
    && Math.hypot(o.x - w.camp.x, o.y - w.camp.y) < HERD.reach);
});
export const hasBait = (w, T) => Object.entries(T.bait).every(([r, v]) => (w.stock[r] || 0) >= v);

// animals with something to take: milk or a grown fleece (sheared in spring and summer)
export const chores = w => perTick(w, 'chores', () => herd(w).filter(a => (a.milk || 0) >= 1 || woolReady(w, a)));
const woolReady = (w, a) => tameOf(a).wool && (a.wool || 0) >= 1 && !!season(w).shear;

// the herder's try: bait from the stock, then a roll; every failed try makes the next one easier
export function tryTame(w, a, beast) {
  const T = tameOf(beast);
  if (!hasBait(w, T)) return 'nobait';
  for (const [r, v] of Object.entries(T.bait)) w.stock[r] -= v;
  const chance = T.chance * (0.6 + (a.skill.husbandry || 0)) * (1 + 0.35 * (beast.tries || 0));
  w.stats.tameTries = (w.stats.tameTries || 0) + 1;
  if (w.rngs.wild() < chance) { makeTame(w, beast, a); return 'tamed'; }
  beast.tries = (beast.tries || 0) + 1;
  return 'failed';
}

function freshName(w, T) {
  const used = new Set(herd(w).map(o => o.name));
  return T.names.find(n => !used.has(n)) || T.names[Math.floor(w.rngs.wild() * T.names.length)];
}

export function makeTame(w, beast, by, born = false) {
  const sp = SPECIES.get(beast.species), T = sp.tame;
  beast.tame = true; beast.faction = 'herd'; beast.brain = 'livestock'; beast.task = null;
  beast.fed = 1; beast.hungry = 0; beast.milk = 0; beast.wool = born ? 0 : 0.6; beast.age = born ? 0 : T.grownDays || 0;
  beast.name = freshName(w, T); beast.spooked = 0; beast.hurtBy = null;
  forget(w);
  recomputeMods(w);
  if (born) return;
  w.chronicle.tamed = (w.chronicle.tamed || 0) + 1;
  log(w, `<b>${esc(by.name)}</b> ${by.gender === 'f' ? 'приручила' : 'приручил'} ${sp.labelAcc}: теперь это <b>${esc(beast.name)}</b>. ${T.effect[0].toUpperCase() + T.effect.slice(1)}.`, 'people', 'notice');
  think(w, by, 'tamedBeast', {beast: sp.labelAcc, name: beast.name});
}

// an animal that goes wild again (hunger)
function breakOut(w, a, why) {
  const sp = SPECIES.get(a.species);
  a.tame = false; a.faction = 'wild'; a.brain = brainOf(sp); a.task = {id: 'leave'};
  forget(w);
  recomputeMods(w);
  const f = she(a);
  log(w, `${esc(a.name)} (${sp.label}) ${f ? 'оголодала' : 'оголодал'} ${why} и ${f ? 'ушла' : 'ушёл'} в лес.`, 'people', 'alert');
}

function slaughter(w, a, why = 'Голод') {
  const sp = SPECIES.get(a.species);
  for (const [r, n] of Object.entries(sp.yields)) w.stock[r] = (w.stock[r] || 0) + n;
  a.dead = true; a.slaughtered = true;
  forget(w);
  recomputeMods(w);
  if (why) log(w, `${why}: пришлось заколоть ${sp.labelAcc} ${esc(a.name)}. Мясо, шкура и кости — на склад.`, 'people', 'alert');
}

function bear(w, mother) {
  const kid = createAgent(w, mother.species, 'herd', mother.x + (w.rngs.wild() - 0.5), mother.y + (w.rngs.wild() - 0.5));
  makeTame(w, kid, null, true);
  kid.pen = mother.pen;
  log(w, `В загоне прибыло: ${esc(mother.name)} принесла ${SPECIES.get(mother.species).tame.youngAcc || 'детёныша'} — <b>${esc(kid.name)}</b>.`, 'people');
}

export function stepHerd(w) {
  if (w.tick % DAY !== 6 * HOUR) return;
  const list = herd(w); if (!list.length) return;
  const S = season(w), grass = HERD.graze[S.id] ?? 0;
  let hayShort = false;
  for (const a of list) {
    const T = tameOf(a);
    a.age = (a.age || 0) + 1;
    // grass in the pen covers part of the day's food (half of it for an animal not in a pen), hay the rest;
    // short of food it grows thin, and a few days with less than `starveBelow` of it make it break out
    const eats = T.eats * (a.age < (T.grownDays || 0) ? 0.5 : 1), graze = a.pen != null && buildingById(w, a.pen)?.done ? grass : grass * 0.5;   // a standing pen, not a burnt one
    const got = Math.min(eats * (1 - graze), w.stock.hay || 0);
    w.stock.hay = (w.stock.hay || 0) - got;
    const share = graze + got / eats;
    if (share >= 1 - 1e-6) { a.fed = 1; a.hungry = 0; }
    else {
      a.fed = Math.max(0, (a.fed ?? 1) - 0.35 * (1 - share)); hayShort = true;
      a.hungry = share < HERD.starveBelow ? (a.hungry || 0) + 1 : Math.max(0, (a.hungry || 0) - 1);
    }
    if (a.hungry >= HERD.hungryDays) { breakOut(w, a, 'без сена'); continue; }
    const grown = a.age >= (T.grownDays || 0);
    if (T.milk && grown && a.fed > 0.5) a.milk = Math.min(HERD.milkCap, (a.milk || 0) + T.milk * (S.lean ? HERD.winterMilk : 1));
    if (T.wool && a.fed > 0.3) a.wool = Math.min(1, (a.wool || 0) + 1 / T.woolDays);
  }
  if (hayShort) log(w, 'Скоту не хватает сена. Без корма животные уйдут в лес.', 'people', 'notice');
  // the young: two grown ones of a breeding kind, room in the pen, fed, not winter
  if (!S.lean) for (const sp of new Set(list.map(a => a.species))) {
    const T = SPECIES.get(sp).tame; if (!T.breed) continue;
    const grown = herd(w).filter(a => a.species === sp && a.age >= T.grownDays && a.fed > 0.6);
    for (let k = 0; k + 1 < grown.length; k += 2) if (penRoom(w) >= T.space && w.rngs.wild() < T.breed) bear(w, grown[k]);
  }
  // A working pen supplies meat before famine: slaughter a grown surplus, keeping each kind's breeders.
  const people = colonists(w).length;
  if (people && foodTotal(w) < people * HERD.meatBelow) {
    for (const sp of new Set(herd(w).map(a => a.species))) {
      const T = SPECIES.get(sp).tame; if (!T?.breed) continue;
      const grown = herd(w).filter(a => a.species === sp && a.age >= T.grownDays).sort((x, y) => y.age - x.age);
      if (grown.length > keepOf(T)) { slaughter(w, grown[0], 'Загон снабжает припасами'); break; }
    }
  }
  // winter: what the hay cannot feed till spring goes for meat, the youngest of the breeding kinds first (they grow
  // again), the working ones (mules) last; each breeding kind keeps its `keep` whatever happens. Planned on the first
  // day of winter, then checked again every day (the hay may go to bedding, or be stolen)
  if (S.lean) {
    const plan = daysLeftInSeason(w) > SEASON_DAYS - 1;
    const culled = [];
    for (let k = 0; k < 30; k++) {
      const daily = herd(w).reduce((s, a) => s + tameOf(a).eats * (a.age < (tameOf(a).grownDays || 0) ? 0.5 : 1) * (1 - grass), 0);
      if ((w.stock.hay || 0) >= daily * daysLeftInSeason(w) * (plan ? 1 : 0.8)) break;
      const cull = spare(w).sort((x, y) => (tameOf(x).breed ? 0 : 1) - (tameOf(y).breed ? 0 : 1) || (x.age || 0) - (y.age || 0))[0];
      if (!cull) break;
      culled.push(cull); slaughter(w, cull, null);
      if (!plan) break;
    }
    if (culled.length) log(w, `Сена до весны не хватит на всех: закололи ${culled.map(a => `${SPECIES.get(a.species).labelAcc} ${esc(a.name)}`).join(', ')}. Мясо, шкуры и кости — на склад.`, 'people', 'notice');
  }
  // famine: the youngest of a breeding kind for the pot, as long as that kind keeps its breeders
  const pop = colonists(w).length;
  if (pop && foodTotal(w) < pop * HERD.slaughterBelow) {
    const pick = spare(w).filter(a => tameOf(a).breed).sort((x, y) => (x.age || 0) - (y.age || 0))[0];
    if (pick) slaughter(w, pick);
  }
}

// the animals that may go for meat: all of a kind that does not breed, and of a breeding kind only more than its `keep`
function spare(w) {
  const n = {};
  for (const a of herd(w)) n[a.species] = (n[a.species] || 0) + 1;
  return herd(w).filter(a => n[a.species] > keepOf(tameOf(a)));
}

// a tame animal killed (wolves, raiders, fire): the herd is smaller now
export function lostBeast(w, a, cause) {
  forget(w);
  recomputeMods(w);
  log(w, `Погиб${she(a) ? 'ла' : ''} ${esc(a.name)} (${SPECIES.get(a.species).label}): ${cause}.`, 'people', 'alert');
}

// hay the herd eats in a winter (the mowers keep this much on top of the bedding)
export const winterHay = w => perTick(w, 'winterHay', () => herd(w).reduce((s, a) => s + tameOf(a).eats, 0) * SEASON_DAYS * (1 - HERD.graze.winter));
// the tables' hooks read these (data/buildings.js: the pen's `available`; data/plants.js: the mowers' `keep`)
useHerd({isTameable, penRoom});
useWinterHay(winterHay);

// for the panel: what a tame animal is like now
export function beastText(w, a) {
  const T = tameOf(a), out = [];
  if (a.age < (T.grownDays || 0)) out.push(T.young || 'детёныш');
  out.push(a.fed >= 0.99 ? 'сыт' + (she(a) ? 'а' : '') : `голоден ${Math.round(a.fed * 100)}%`);
  if (T.milk) out.push(`молока ${(a.milk || 0).toFixed(1)}`);
  if (T.wool) out.push(`шерсть ${Math.round((a.wool || 0) * 100)}%`);
  if (T.effects) out.push(T.effect);
  return out.join(' · ');
}

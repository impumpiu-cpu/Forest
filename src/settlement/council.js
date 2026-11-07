// The evening council at the campfire. Between 19:00 and 21:30 colonists gather at the fire.
// When most have come (or time runs out) each argues for the building that would have helped
// them most today; the majority decides to build it now or to save up for it.
import {BUILDINGS} from '../data/buildings.js';
import {RESOURCES} from '../data/resources.js';
import {dayOf, hourOf} from '../core/time.js';
import {log} from '../core/log.js';
import {colonists, count, has, popCap, openSites, ofSpecies} from './query.js';
import {canAfford, eligible as buildable, laySite, missing} from './buildings.js';
import {obtainable, sourcesOf} from './sources.js';
import {RECIPES} from '../data/recipes.js';
import {perTick} from '../core/util.js';
const RECIPES_ALL = () => RECIPES.all();
import {hpShare} from '../agents/agent.js';

import {handItems, allItems, def} from '../agents/equipment.js';
import {think} from '../agents/mind.js';
import {oreSeen} from '../world/ores.js';
import {season} from '../data/seasons.js';
import {moodOf} from '../agents/mind.js';
import {penRoom, herd, isTameable} from './herd.js';
import {councilRoster} from './plan.js';
import {ALIGN_DRIFT, shiftAlign} from '../data/values.js';
import {COUNCIL} from '../data/colony.js';
import {onEdit} from '../data/schema/layer.js';
import {allowed} from '../data/commands.js';
import {tracing, noteDecision} from '../core/decide.js';

export {COUNCIL};   // (data/colony.js)
// (kept for agents/outfit.js: live bindings, renewed on a table edit; the council's own steps read COUNCIL)
export let COUNCIL_FROM = COUNCIL.from, COUNCIL_TO = COUNCIL.to;
onEdit(() => { COUNCIL_FROM = COUNCIL.from; COUNCIL_TO = COUNCIL.to; });

// a building the council may pick: allowed, and everything its price still lacks can be come by
export const eligible = (w, key) => buildable(w, key) && missing(w, BUILDINGS.get(key).cost).every(([r]) => obtainable(w, r));


export function councilDue(w) {
  const h = hourOf(w.tick);
  return !w.light && h >= COUNCIL.from && h < COUNCIL.to && w.council.lastDay !== dayOf(w.tick) && colonists(w).length > 0;
}

// extra pull toward work that brings in what the current goal still lacks. «Lacks» is measured the way
// the site is laid (settlement/buildings.js missing): for wood that is the price plus the fuel kept for
// the fire. Measured against the bare price, the woodcutters stopped short of it and the site was never laid.
// The pull reaches one link down the chain: if the goal lacks rope and rope is made from fiber at a
// workshop the colony has, the fiber gatherers are pulled too (otherwise nobody brought the fiber, the
// workshop had nothing to make and the colony sat idle with the goal stuck).
export function goalNeed(w, res) {
  if (!w.council.goal) return 0;
  return goalWants(w).has(res) ? COUNCIL.goalPull : 0;
}
const goalWants = w => perTick(w, 'goalWants', () => {
  const want = new Set(), lack = missing(w, BUILDINGS.get(w.council.goal).cost);
  for (const [r, n] of lack) {
    want.add(r);
    for (const rec of RECIPES_ALL()) {
      if (rec.makes?.resource !== r || !has(w, rec.at)) continue;
      const runs = Math.ceil(n / (rec.makes.n || 1));
      for (const [c, v] of Object.entries(rec.cost)) if ((w.stock[c] || 0) < v * runs) want.add(c);
    }
  }
  return want;
});

// strongest argument this colonist has for a building: [score, reason]
function motive(w, a, def, ctx, noise = true) {
  const args = def.motive ? def.motive(a, ctx) : [];
  let best = [0, ''];
  for (const o of args) if (o[0] > best[0]) best = o;
  const score = args.reduce((t, o) => t + Math.max(0, o[0]), 0) + ((a.prefs.build ?? 1) - 1) * COUNCIL.buildPref + (noise ? w.rngs.colony() * COUNCIL.noise : 0);
  return [score, best[0] > 0.05 ? best[1] : def.wish];
}

function councilCtx(w, cands) {
  return {
    crowded: colonists(w).length >= popCap(w) - 1, spoiled: w.stats.spoiledToday, burnt: w.stats.burntCells,
    preyCount: ofSpecies(w, 'hare').length, wolves: ofSpecies(w, 'wolf').length, count: k => count(w, k),
    unarmed: colonists(w).filter(a => !handItems(a).some(it => def(it).melee || def(it).ranged)).length / Math.max(1, colonists(w).length),
    hides: w.stock.hide || 0, broken: w.stats.broken,
    fishLakes: w.lakes.filter(l => l.cap && l.fish > l.cap * 0.3).length,
    items: w.armory.length + colonists(w).reduce((s, a) => s + allItems(a).length, 0),
    stock: r => w.stock[r] || 0,
    season: season(w).id,
    rats: w.agents.filter(o => o.species === 'rat').length,
    hurt: a => hpShare(a),   // a colonist's health as a share of their own full health
    // wounded by each one's own measure: a giant's 1.0 is not a human's 1.0
    wounded: colonists(w).filter(a => hpShare(a) < 0.7).length / Math.max(1, colonists(w).length),
    oreSeen: oreSeen(w),
    wildHerd: w.agents.filter(isTameable).length,
    herdFull: herd(w).length > 0 && penRoom(w) < 1,
    gloomy: colonists(w).filter(a => moodOf(w, a) < -0.2).length / Math.max(1, colonists(w).length),
    graves: (w.graves || []).length + (w.corpses || []).length,
    wantStone: !has(w, 'quarry') && cands.some(k => BUILDINGS.get(k).needs === 'quarry' || (BUILDINGS.get(k).cost.stone || 0) > 0),
  };
}

// the building this colonist would argue for right now (for the colonist card)
export function councilWish(w, a) {
  const cands = BUILDINGS.ids().filter(k => eligible(w, k));
  if (!cands.length || !a.prefs) return null;
  const ctx = councilCtx(w, cands);
  let best = null, bs = 0.3;
  for (const k of cands) { const [sc, why] = motive(w, a, BUILDINGS.get(k), ctx, false); if (sc > bs) { bs = sc; best = {name: BUILDINGS.get(k).name, why}; } }
  return best;
}

export function stepCouncil(w) {
  const day = dayOf(w.tick), h = hourOf(w.tick);
  if (!councilDue(w)) {
    if (w.council.lastDay !== day && h >= COUNCIL.to && colonists(w).length) w.council.lastDay = day;   // nobody came
    return;
  }
  const col = colonists(w).filter(a => !a.captive && !a.former), present = col.filter(a => a.task?.id === 'council' && a.task.seated);   // captives have no seat (settlement/captives.js)
  if (!present.length || (present.length < Math.ceil(col.length * COUNCIL.quorum) && h < COUNCIL.to - COUNCIL.late)) return;
  hold(w, present, col.length);
}

function hold(w, present, total) {
  const c = w.council;
  c.lastDay = dayOf(w.tick);
  for (const a of present) shiftAlign(a, 'order', ALIGN_DRIFT.pawn.council, (a.alignRoot?.order ?? a.align?.order ?? 0) + ALIGN_DRIFT.pawn.councilCap);   // an evening of law: a little more of it in each
  const site = openSites(w)[0];
  const args = [];
  let decision, winner = null;   // the proposal the council settled on: the second round's when there was one
  if (site) {
    const d = BUILDINGS.get(site.key);
    decision = `Решили сначала достроить: ${d.name.toLowerCase()} (${Math.floor(site.progress / d.work * 100)}%).`;
    c.votes = [];
  } else {
    // the decision point `settlement.council` (data/commands.js): the command `settlement.council.build`, by vote
    const may = allowed(w.cfg, 'settlement.council.build'), cands = may ? BUILDINGS.ids().filter(k => eligible(w, k)) : [];
    if (!may) { decision = 'Совет посидел у огня: о стройке речи не было.'; c.votes = []; c.goal = null; }
    else if (!cands.length) { decision = 'Всё задуманное построено. Совет просто посидел у огня.'; c.votes = []; c.goal = null; }
    else {
      const ctx = councilCtx(w, cands);
      const tally = {}, weight = {};
      for (const a of present) {
        let best = null, bs = -1, why = '';
        for (const k of cands) { const [sc, r] = motive(w, a, BUILDINGS.get(k), ctx); if (sc > bs) { bs = sc; best = k; why = r; } }
        tally[best] = (tally[best] || 0) + 1; weight[best] = (weight[best] || 0) + bs;
        args.push({id: a.id, name: a.name, key: best, why});
      }
      const ranked = Object.keys(tally).sort((x, y) => tally[y] - tally[x] || weight[y] - weight[x]);
      c.votes = ranked.map(k => [k, tally[k]]);
      // a decision needs more than half of those present: if nobody has that, the two strongest
      // proposals go to a second round, where everyone picks the one of the two they prefer
      let win = ranked[0], votes = tally[win], round2 = '';
      if (votes * 2 <= present.length && ranked.length > 1) {
        const [p1, p2] = ranked, t2 = {[p1]: 0, [p2]: 0};
        for (const a of present) {
          const s1 = motive(w, a, BUILDINGS.get(p1), ctx, false)[0], s2 = motive(w, a, BUILDINGS.get(p2), ctx, false)[0];
          t2[s1 >= s2 ? p1 : p2]++;
        }
        win = t2[p1] >= t2[p2] ? p1 : p2; votes = t2[win];
        round2 = ` Во втором туре: ${BUILDINGS.get(p1).name.toLowerCase()} ${t2[p1]}, ${BUILDINGS.get(p2).name.toLowerCase()} ${t2[p2]}.`;
      }
      winner = win;
      const d = BUILDINGS.get(win);
      if (tracing()) noteDecision({point: 'settlement.council', who: 'council', at: w.tick, band: 'routine', policy: 'vote',
        opts: ranked.map(k => ({cmd: 'settlement.council.build', key: `settlement.council.build(${k})`, score: tally[k]})), pick: `settlement.council.build(${win})`, round2: !!round2});
      if (canAfford(w, d.cost) && laySite(w, win)) {
        c.goal = null;
        w.chronicle.councilWins[win] = (w.chronicle.councilWins[win] || 0) + 1;
        decision = `Решили строить: ${d.name.toLowerCase()} (${votes} из ${present.length}).${round2} Место под стройку уже размечено.`;
      } else {
        // the same goal again keeps its start: the panel says how long the colony has been saving
        if (c.goal !== win) { c.goalSince = w.tick; c.goalLack = missing(w, d.cost).reduce((t, [, v]) => t + v, 0); }
        c.goal = win;
        w.chronicle.saving ??= {}; w.chronicle.saving[win] = (w.chronicle.saving[win] || 0) + 1;
        // what is lacking and where it is to come from (settlement/sources.js)
        const lack = missing(w, d.cost).map(([r, v]) => `${RESOURCES.get(r).label} ${v} (${sourcesOf(w, r).map(s => s.how).join(' или ') || 'нет источника'})`).join(', ');
        decision = `Решили копить на: ${d.name.toLowerCase()} (${votes} из ${present.length}).${round2} Не хватает: ${lack}.`;
      }
    }
  }
  c.decision = decision; c.winner = winner; c.args = args.slice(0, 6); c.present = present.length; c.total = total;
  // everyone who spoke remembers how it went — by the proposal that won (after a second round, not the first's leader)
  w.chronicle.councils++;
  for (const x of args) {
    const a = present.find(p => p.id === x.id), choice = BUILDINGS.get(x.key).name.toLowerCase();
    const id = x.key !== winner ? 'councilLost' : c.goal ? 'councilSaving' : 'councilWon';
    think(w, a, id, {choice, why: x.why, decision: winner ? BUILDINGS.get(winner).name.toLowerCase() : ''});
  }
  const quotes = args.slice(0, 3).map(x => `${x.name}: ${BUILDINGS.get(x.key).name.toLowerCase()}, ${x.why}`).join('; ');
  log(w, `Совет у костра (${present.length} из ${total}). ${quotes ? quotes + '. ' : ''}${decision}`, 'council');
  for (const a of colonists(w)) {
    for (const k of Object.keys(a.mem)) a.mem[k] *= COUNCIL.memory;
    if (a.task?.id === 'council') a.task = null;
  }
  w.stats.spoiledToday = 0;
  // the second half of the council: who does what tomorrow (settlement/plan.js)
  councilRoster(w);
}

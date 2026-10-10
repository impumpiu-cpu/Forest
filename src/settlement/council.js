// The evening council at the campfire. Between 19:00 and 21:30 colonists gather at the fire.
// When most have come (or time runs out) each argues for the building that would have helped
// them most today; the majority decides to build it now or to save up for it.
import {BUILDINGS} from '../data/buildings.js';
import {RESOURCES} from '../data/resources.js';
import {dayOf, hourOf} from '../core/time.js';
import {log} from '../core/log.js';
import {colonists, count, has, popCap, openSites, ofSpecies} from './query.js';
import {canAfford, eligible, laySite, missing} from './buildings.js';
import {handItems, allItems, def} from '../agents/equipment.js';

export const COUNCIL_FROM = 19, COUNCIL_TO = 21.5;

export function councilDue(w) {
  const h = hourOf(w.tick);
  return h >= COUNCIL_FROM && h < COUNCIL_TO && w.council.lastDay !== dayOf(w.tick) && colonists(w).length > 0;
}

// extra pull toward work that brings in what the current goal still lacks
export function goalNeed(w, res) {
  const g = w.council.goal; if (!g) return 0;
  const need = BUILDINGS.get(g).cost[res] || 0;
  return (w.stock[res] || 0) < need ? 0.3 : 0;
}

// strongest argument this colonist has for a building: [score, reason]
function motive(w, a, def, ctx) {
  const args = def.motive ? def.motive(a, ctx) : [];
  let best = [0, ''];
  for (const o of args) if (o[0] > best[0]) best = o;
  const score = args.reduce((t, o) => t + Math.max(0, o[0]), 0) + ((a.prefs.build ?? 1) - 1) * 0.2 + w.rng() * 0.25;
  return [score, best[0] > 0.05 ? best[1] : def.wish];
}

export function stepCouncil(w) {
  const day = dayOf(w.tick), h = hourOf(w.tick);
  if (!councilDue(w)) {
    if (w.council.lastDay !== day && h >= COUNCIL_TO && colonists(w).length) w.council.lastDay = day;   // nobody came
    return;
  }
  const col = colonists(w), present = col.filter(a => a.task?.id === 'council' && a.task.seated);
  if (!present.length || (present.length < Math.ceil(col.length * 0.7) && h < COUNCIL_TO - 0.3)) return;
  hold(w, present, col.length);
}

function hold(w, present, total) {
  const c = w.council;
  c.lastDay = dayOf(w.tick);
  const site = openSites(w)[0];
  const args = [];
  let decision;
  if (site) {
    const d = BUILDINGS.get(site.key);
    decision = `Решили сначала достроить: ${d.name.toLowerCase()} (${Math.floor(site.progress / d.work * 100)}%).`;
    c.votes = [];
  } else {
    const cands = BUILDINGS.ids().filter(k => eligible(w, k));
    if (!cands.length) { decision = 'Всё задуманное построено. Совет просто посидел у огня.'; c.votes = []; c.goal = null; }
    else {
      const ctx = {
        crowded: colonists(w).length >= popCap(w) - 1, spoiled: w.stats.spoiledToday, burnt: w.stats.burntCells,
        preyCount: ofSpecies(w, 'hare').length, wolves: ofSpecies(w, 'wolf').length, count: k => count(w, k),
        unarmed: colonists(w).filter(a => !handItems(a).some(it => def(it).melee || def(it).ranged)).length / Math.max(1, colonists(w).length),
        hides: w.stock.hide || 0, broken: w.stats.broken,
        items: w.armory.length + colonists(w).reduce((s, a) => s + allItems(a).length, 0),
        wantStone: !has(w, 'quarry') && cands.some(k => BUILDINGS.get(k).needs === 'quarry' || (BUILDINGS.get(k).cost.stone || 0) > 0),
      };
      const tally = {}, weight = {};
      for (const a of present) {
        let best = null, bs = -1, why = '';
        for (const k of cands) { const [sc, r] = motive(w, a, BUILDINGS.get(k), ctx); if (sc > bs) { bs = sc; best = k; why = r; } }
        tally[best] = (tally[best] || 0) + 1; weight[best] = (weight[best] || 0) + bs;
        args.push({name: a.name, key: best, why});
      }
      const ranked = Object.keys(tally).sort((x, y) => tally[y] - tally[x] || weight[y] - weight[x]);
      const win = ranked[0], d = BUILDINGS.get(win);
      c.votes = ranked.map(k => [k, tally[k]]);
      if (canAfford(w, d.cost) && laySite(w, win)) {
        c.goal = null;
        decision = `Решили строить: ${d.name.toLowerCase()} (${tally[win]} из ${present.length}). Место под стройку уже размечено.`;
      } else {
        c.goal = win;
        const lack = missing(w, d.cost).map(([r, v]) => `${RESOURCES.get(r).label} ${v}`).join(', ');
        decision = `Решили копить на: ${d.name.toLowerCase()} (${tally[win]} из ${present.length}). Не хватает: ${lack}.`;
      }
    }
  }
  c.decision = decision; c.args = args.slice(0, 6); c.present = present.length; c.total = total;
  const quotes = args.slice(0, 3).map(x => `${x.name}: ${BUILDINGS.get(x.key).name.toLowerCase()}, ${x.why}`).join('; ');
  log(w, `Совет у костра (${present.length} из ${total}). ${quotes ? quotes + '. ' : ''}${decision}`);
  for (const a of colonists(w)) {
    for (const k of Object.keys(a.mem)) a.mem[k] *= 0.4;
    if (a.task?.id === 'council') a.task = null;
  }
  w.stats.spoiledToday = 0;
}

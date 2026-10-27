// The captives' will to run (docs/CAPTIVES.md; numbers: data/captives.js ESCAPE). Once a tick
// (sim.js, after the board) and cheap when there are no captives:
//   - at dawn every captive's will moves: a cut ration, hunger, wounds and kin seen in a raid push it up,
//     the days in captivity, a full belly and health bring it down;
//   - at the evening council (once it is over, or nobody came) the council sets the captives' ration (cut
//     when food is short), and every captive not resigned rolls to run and to resign. One who wants to run
//     starts a plot: this night all who are not resigned run together — unless a resigned one informs;
//   - at the hour of the plot the plotters run (not when the night watch is on its post and they lose heart);
//   - during a red alarm each captive rolls once to run in the confusion, more readily when the raiders are
//     its own kind or it still holds a tool;
//   - from the council till dawn a captive in the camp hands its tool in to the store.
// A runaway is a creature of the faction 'fugitives' running for the map's edge, slowed by its bonds; the
// colony's board sees it as a yellow flag («беглецы», settlement/board.js) and whoever answers it and gets
// within reach grabs it (agents/tasks.js fight → catchRunaway). Gone over the edge — it got away.
// State: w.escape = {rolled, dawn, plot: {day, ids, by}, alarm, cut}; on the captive a.captive.{will,
// resigned, service, redAt, kinSeen}; on a runaway a.fugitive = {since, why, slow}.
import {ESCAPE, BONDS} from '../data/captives.js';
import {opinion} from '../data/relations.js';
import {SPECIES} from '../data/species.js';
import {COUNCIL_FROM, COUNCIL_TO} from './council.js';
import {colonists, foodTotal, raidAlarm} from './query.js';
import {raidOnBoard, marching, watchOnPost} from './board.js';
import {captives} from './captives.js';
import {hpShare} from '../agents/agent.js';
import {refreshBody} from '../agents/special.js';
import {handItems, recalcGear} from '../agents/equipment.js';
import {releaseAll} from './reserve.js';
import {wake} from '../agents/attention.js';
import {cellOf} from '../world/grid.js';
import {log} from '../core/log.js';
import {esc, g, clamp} from '../core/util.js';
import {hourOf, dayOf, DAY, HOUR} from '../core/time.js';
import {ALIGN_DRIFT, shiftAlign} from '../data/values.js';
import {setStanding} from '../agents/standing.js';
import {sleepDose} from '../agents/potions.js';
import {POTION} from '../data/potions.js';

const E = w => (w.escape ??= {rolled: -1, dawn: -1, plot: null, alarm: null, cut: false});
const C = w => (w.chronicle.captives ||= {taken: 0, died: 0});
const willOf = a => (a.captive.will ??= ESCAPE.will.start);
const holdOf = a => (BONDS.has(a.captive.bonds) ? BONDS.get(a.captive.bonds).hold : 1);
const holdsTool = a => handItems(a).length > 0;   // a captive holds nothing in its hands but a tool (agents/equipment.js captiveItem)
const days = (w, a) => Math.max(0, (w.tick - a.captive.since) / DAY);
const free = w => colonists(w).filter(a => !a.captive && !a.dead);
const label = a => SPECIES.get(a.species).label;
const name = a => `<b>${esc(a.name)}</b>`;

// the tools are away for the night: from the end of the council till dawn
export const toolsAway = w => { const h = hourOf(w.tick); return h >= COUNCIL_TO || h < ESCAPE.tools.dawn; };

// the council's ration for the captives: × hunger and × work through the body's own extras
function applyRation(a, cut) {
  const mul = ((a.own ||= {}).mul ||= {});
  if (cut) { mul.hunger = ESCAPE.ration.eat; mul.work = ESCAPE.ration.work; }
  else { delete mul.hunger; delete mul.work; }
  a.captive.cut = cut;
  refreshBody(a);
}

// ── dawn: the will moves
function dawn(w, S) {
  const W = ESCAPE.will.day;
  for (const a of captives(w)) {
    let d = W.time;
    if (a.captive.cut) d += W.cut;
    if ((a.needs.food ?? 1) < 0.3) d += W.hungry;
    if (hpShare(a) < 0.5) d += W.hurt;
    if (a.captive.kinSeen) { d += W.kin; a.captive.kinSeen = false; }
    if ((a.needs.food ?? 1) > 0.6 && hpShare(a) > 0.8 && !a.captive.cut) d += W.content;
    a.captive.will = clamp(willOf(a) + d, 0, 1);
  }
}

// ── the evening council: the ration, the rolls, the plot, the informer
function council(w, S, rng) {
  const caps = captives(w); if (!caps.length) return;
  // the ration: cut when food is short (data/captives.js ESCAPE.ration)
  const cut = foodTotal(w) / Math.max(1, free(w).length) < ESCAPE.ration.cutDays;
  if (cut !== S.cut) log(w, cut ? 'Совет урезал паёк пленным: еды мало.' : 'Совет вернул пленным полный паёк.', 'council');
  S.cut = cut;
  for (const a of caps) if (!!a.captive.cut !== cut) applyRation(a, cut);
  // the rolls of every captive not resigned
  const want = [];
  let slept = 0;
  for (const a of caps) {
    if (a.captive.resigned || a.downed) continue;
    const will = willOf(a);
    // one set on running is given the sleeping brew, if the stock has one (data/potions.js sleep): it sleeps the night
    // through; a strong one calms it too
    const dose = will >= POTION.home.will ? sleepDose(w.stock) : null;
    if (dose) { slept++; a.captive.sleepsUntil = (dayOf(w.tick) + 1) * DAY + ESCAPE.tools.dawn * HOUR; if (dose.calm) a.captive.will = clamp(will - dose.calm, 0, 1); continue; }
    if (rng() < ESCAPE.escape.base * will * holdOf(a)) want.push(a);
    const R = ESCAPE.resign;
    if (!want.includes(a) && rng() < R.base * (1 - will) * days(w, a) / (days(w, a) + R.settle)) {
      a.captive.resigned = w.tick;
      log(w, `${name(a)}, ${g(a, 'пленный', 'пленная')} (${label(a)}), ${g(a, 'смирился', 'смирилась')}: бежать больше не думает.`, 'people');
    }
  }
  if (slept) log(w, `Совет велел напоить сонным отваром ${slept === 1 ? 'пленного, что задумал бежать' : `пленных, что задумали бежать (${slept})`}: проспят до утра.`, 'council');
  if (!want.length) return;
  const by = want[0], plotters = caps.filter(a => !a.captive.resigned && !a.downed && !(w.tick < (a.captive.sleepsUntil ?? -1)));   // (one given the sleeping brew sleeps till dawn)
  // a resigned one may tell: the more it likes the free, the readier
  const fr = free(w);
  for (const s of caps.filter(a => a.captive.resigned && !a.downed)) {
    const like = fr.length ? fr.reduce((t, o) => t + opinion(s, o), 0) / fr.length : 0;
    if (rng() >= ESCAPE.inform.base + ESCAPE.inform.opinion * Math.max(0, like)) continue;
    by.captive.will = clamp(willOf(by) + ESCAPE.will.betrayed, 0, 1);
    s.captive.service = (s.captive.service || 0) + ESCAPE.inform.service;
    C(w).told = (C(w).told || 0) + 1;
    log(w, `${name(s)} ${g(s, 'выдал', 'выдала')} сговор пленных: ${name(by)} ${g(by, 'подбивал', 'подбивала')} бежать этой ночью. Побега не будет.`, 'people', 'notice');
    return;
  }
  S.plot = {day: dayOf(w.tick), ids: plotters.map(a => a.id), by: by.id};
  C(w).plots = (C(w).plots || 0) + 1;
}

// ── a runaway: off for the map's edge
export function startEscape(w, a, why) {
  const B = BONDS.has(a.captive.bonds) ? BONDS.get(a.captive.bonds) : null;
  const slow = holdsTool(a) ? 1 : B?.slow ?? 1;   // a tool kept for the night cuts the bonds
  releaseAll(w, a);
  a.fugitive = {since: w.tick, why, slow};
  shiftAlign(a, 'order', ALIGN_DRIFT.pawn.fled);   // the bonds broken, the law with them
  setStanding(a, 'fugitive', a.fugitive); a.task = {id: 'escape'}; a.sleeping = false; a.carry = null;
  if (w.scratch) delete w.scratch.colonists;
  C(w).ran = (C(w).ran || 0) + 1;
  log(w, `${name(a)}, ${g(a, 'пленный', 'пленная')} (${label(a)}), ${g(a, 'бежал', 'бежала')}${why === 'plot' ? ' ночью по сговору' : ' в суматохе тревоги'}${slow < 1 ? '' : ', перерезав путы'}.`, 'danger', 'alert');
}

// gone over the edge: got away, the bonds with it (agents/behaviours/escape.js)
export function gotAway(w, a) {
  a.gone = true;
  C(w).escaped = (C(w).escaped || 0) + 1;
  const r = w.chronicle.people?.find(p => p.id === a.id); if (r) { r.left = w.tick; r.cause = g(a, 'бежал из плена', 'бежала из плена'); }
  log(w, `${name(a)} ${g(a, 'ушёл', 'ушла')} от погони: пленного больше нет.`, 'danger', 'notice');
}

// grabbed by one who got within reach: back to the captives, and readier to run next time
export function catchRunaway(w, by, a) {
  setStanding(a, 'captive');
  a.captive.will = clamp(willOf(a) + ESCAPE.will.caught, 0, 1);
  a.task = {id: 'runHome'}; a.think = 0; wake(a, 'пойман', 'пойман');
  if (w.scratch) delete w.scratch.colonists;
  C(w).caught = (C(w).caught || 0) + 1;
  log(w, `${name(by)} ${g(by, 'догнал', 'догнала')} беглеца: ${name(a)} снова в путах.`, 'danger', 'notice');
}

// ── the tool for the night: a captive in the camp hands it in to the store
function handIn(w, a) {
  const hs = handItems(a); if (!hs.length) return;
  for (const it of hs) { it.handedBy = a.id; w.armory.push(it); }   // the captive's own: not loot (campaign/camp.js)
  a.equip.left = a.equip.right = null;
  recalcGear(a);
  w.armoryVersion = (w.armoryVersion || 0) + 1;
}

// once a tick
export function stepEscape(w) {
  const caps = captives(w), S = E(w);
  if (!caps.length && !S.plot) { S.alarm = null; return; }
  const day = dayOf(w.tick), h = hourOf(w.tick), rng = w.rngs.colony;
  if (h >= ESCAPE.tools.dawn && S.dawn !== day) { S.dawn = day; dawn(w, S); }
  // the council: once it is over (or nobody came) — not in a caravan's camp (campaign/camp.js: the campaign rolls)
  if (!w.light && S.rolled !== day && h >= COUNCIL_FROM && w.council?.lastDay === day) { S.rolled = day; council(w, S, rng); }
  // the plot's hour (the night after the council)
  if (S.plot && S.plot.day === day - 1 && h >= ESCAPE.hour) {
    const P = S.plot; S.plot = null;
    const ms = P.ids.map(id => caps.find(a => a.id === id)).filter(a => a && !a.downed && !a.captive.resigned);
    if (ms.length && watchOnPost(w) && rng() >= ESCAPE.escape.watched) {
      log(w, `Пленные не решились бежать: у огня не спит дозорный.`, 'people');
    } else for (const a of ms) startEscape(w, a, 'plot');
  } else if (S.plot && S.plot.day < day - 1) S.plot = null;
  // a red alarm: each captive rolls once, in the confusion
  const red = raidAlarm(w) || raidOnBoard(w);
  if (!red) S.alarm = null;
  else {
    S.alarm ??= w.tick;
    for (const a of caps) {
      if (a.downed || a.captive.resigned || a.captive.redAt === S.alarm || a.task?.id === 'fight' || w.tick < (a.captive.sleepsUntil ?? -1)) continue;   // (one given the sleeping brew sleeps till dawn, alarm or none)
      a.captive.redAt = S.alarm;
      const kin = w.agents.some(o => o.species === a.species && marching(w, o) && !o.dead && !o.downed);   // scan: once a captive per alarm
      if (kin) a.captive.kinSeen = true;
      const R = ESCAPE.red;
      if (rng() < R.base * willOf(a) * holdOf(a) * (kin ? R.kin : 1) * (holdsTool(a) ? R.tool : 1)) startEscape(w, a, 'alarm');
    }
  }
  // the tools for the night: handed in at the camp, given back by outfit after dawn (agents/equipment.js)
  if (toolsAway(w)) for (const a of caps) if (w.nav.get('camp')[cellOf(w, a)] < 3 && handItems(a).length) handIn(w, a);
}

// Masters and their learners (docs/CAPTIVES.md; numbers and crafts: data/masters.js).
//   - At the evening council (once it is over, or nobody came) a craft without a master gets one: the free
//     colonist best at it, once the skill reaches MASTER.min; the council names the master solemnly.
//     A master is a.master = {skill, since, workedAt}. A captive is never named.
//   - A master working at the craft has MASTER.places places for learners («ученик мастера»): soft places
//     every colonist weighs for itself (assistOption), a free one before a captive — a captive takes one
//     only when no vacancy of its own pulls harder, and only beside a master working inside the camp.
//   - A learner keeps close to the master (agents/tasks.js 'assist'); while the master works (workRate is
//     read, agents/jobRunners.js), the master works faster by `bonus` per place and the learner practises the
//     craft; a captive learner earns service (stage 4: the way out of captivity).
import {MASTERS, MASTER} from '../data/masters.js';
import {CAPTIVE} from '../data/captives.js';
import {JOBS} from '../data/jobs.js';
import {SKILLS} from '../data/skills.js';
import {COUNCIL_FROM} from './council.js';
import {colonists} from './query.js';
import {agentInZone} from './zone.js';
import {skillOf, practice} from '../agents/skills.js';
import {hpShare} from '../agents/agent.js';
import {liveById} from '../agents/lookup.js';
import {think} from '../agents/mind.js';
import {log} from '../core/log.js';
import {esc, g, perTick, dist} from '../core/util.js';
import {hourOf, dayOf} from '../core/time.js';

export const masters = w => perTick(w, 'masters', () => colonists(w).filter(a => a.master && !a.dead && !a.captive));
export const masterOf = (w, skill) => masters(w).find(a => a.master.skill === skill) || null;
export const masterTitle = a => (a.master ? `мастер-${MASTERS.get(a.master.skill).title}` : '');

// the learners of every master, in the order the places go: the free first, then captives; then who came first
const learners = w => perTick(w, 'learners', () => {
  const by = {};
  for (const c of colonists(w)) if (c.task?.id === 'assist' && !c.dead && !c.downed) (by[c.task.master] ||= []).push(c);
  for (const ls of Object.values(by)) ls.sort((p, q) => (!!p.captive - !!q.captive) || (p.task.since ?? 0) - (q.task.since ?? 0) || p.id - q.id);
  return by;
});
export const learnersOf = (w, m) => (learners(w)[m.id] || []);
// the place a learner holds (0, 1…) — or -1 beyond the places
export function placeOf(w, a) {
  const m = a.task?.id === 'assist' ? liveById(w, a.task.master) : null; if (!m) return -1;
  const k = learnersOf(w, m).indexOf(a);
  return k >= 0 && k < MASTER.places ? k : -1;
}

// the master is at the craft now: on one of its jobs
const atCraft = m => m.task?.id === 'job' && MASTERS.get(m.master.skill).jobs.includes(m.task.job);
// a captive helps only where it may go: a craft done inside the camp, a master inside the zone
const campCraft = M => M.jobs.every(j => CAPTIVE.camp.includes(JOBS.get(j).runner));

// how much faster a master works with the learners beside it (agents/jobRunners.js workRate); 0 for anyone else
export function apprenticeBonus(w, a, jobId) {
  if (!a.master || !MASTERS.get(a.master.skill).jobs.includes(jobId)) return 0;
  let b = 0;
  learnersOf(w, a).slice(0, MASTER.places).forEach((c, k) => { if (dist(c, a) <= MASTER.near) b += MASTER.bonus[k] ?? 0; });
  return b;
}

// the colonist's choice: a learner's place beside a master at work
export function assistOption(w, a) {
  if (a.master || a.downed || hpShare(a) < 0.5) return null;
  const Wt = MASTER.weight;
  const score = (m, M) => {
    const lack = Math.max(0, skillOf(m, M.id) - skillOf(a, M.id));
    return (a.captive ? Wt.captive : Wt.free) + (M.jobs.includes(a.likes) ? Wt.liked : 0) + Wt.lack * lack - 0.003 * dist(a, m);
  };
  const why = (m, M) => `учится у ${esc(m.name)}, ${masterTitle(m)}${a.captive ? ' (пленный: при мастере в лагере)' : ''}`;
  let best = null, bs = -Infinity;
  for (const m of masters(w)) {
    if (m === a || !atCraft(m)) continue;
    const M = MASTERS.get(m.master.skill);
    if (a.captive && (!campCraft(M) || !agentInZone(w, m))) continue;
    if (!a.captive && skillOf(a, M.id) >= skillOf(m, M.id)) continue;   // nothing to learn
    const others = learnersOf(w, m).filter(c => c !== a);
    const taken = a.captive ? others.length : others.filter(c => !c.captive).length;   // a free one may take a captive's place
    if (taken >= MASTER.places) continue;
    const s = score(m, M) + (a.task?.id === 'assist' && a.task.master === m.id ? 0.15 : 0);
    if (s > bs) { bs = s; best = m; }
  }
  if (!best) return null;
  const M = MASTERS.get(best.master.skill);
  const task = a.task?.id === 'assist' && a.task.master === best.id ? a.task : {id: 'assist', master: best.id, skill: M.id, since: w.tick};
  return [task, bs, () => why(best, M)];
}
export const assistStillOn = (w, a, task) => { const m = liveById(w, task.master); return m && m.master?.skill === task.skill && !m.dead && atCraft(m) ? m : null; };   // the master left its craft: so does the learner

// ── the council names the masters
function nameMasters(w) {
  const free = colonists(w).filter(a => !a.captive && !a.former && !a.dead && !a.downed && a.skill);   // the free: not a captive, not a former slave
  for (const M of MASTERS.all()) {
    if (masterOf(w, M.id)) continue;
    let best = null;
    for (const a of free) if (!a.master && skillOf(a, M.id) >= MASTER.min && (!best || skillOf(a, M.id) > skillOf(best, M.id))) best = a;
    if (!best) continue;
    best.master = {skill: M.id, since: w.tick, workedAt: -1};
    if (w.scratch) delete w.scratch.masters;
    const C = (w.chronicle.masters ||= []); C.push({id: best.id, name: best.name, skill: M.id, tick: w.tick});
    think(w, best, 'namedMaster', {title: `мастер-${M.title}`});
    for (const o of free) if (o !== best) think(w, o, 'masterNamed', {name: best.name, title: `мастер-${M.title}`});
    log(w, `Совет торжественно нарёк мастером-${M.ins}: <b>${esc(best.name)}</b> (${SKILLS.get(M.id).label} — ${Math.round(skillOf(best, M.id) * 100)}). При ${g(best, 'нём', 'ней')} будут ученики.`, 'council', 'notice');
  }
}

// once a tick (sim.js): the council's naming; the learners learn beside a master at work
export function stepMasters(w) {
  const S = (w.mastersState ??= {named: -1});
  const day = dayOf(w.tick);
  if (!w.light && S.named !== day && hourOf(w.tick) >= COUNCIL_FROM && w.council?.lastDay === day) { S.named = day; nameMasters(w); }
  // a captive working the master's craft beside the master at work earns half a learner's service: it learns
  // under the master's eye (the way out of captivity, settlement/freedom.js)
  for (const m of masters(w)) {
    if ((m.master.workedAt ?? -1) < w.tick - 1 || !atCraft(m)) continue;
    for (const c of colonists(w)) if (c.captive && c !== m && c.task?.id === 'job' && c.task.job === m.task.job && dist(c, m) <= MASTER.near) {
      c.captive.service = (c.captive.service || 0) + MASTER.service * MASTER.beside; c.captive.teacher = m.id;
    }
  }
  const by = learners(w);
  for (const [id, ls] of Object.entries(by)) {
    const m = liveById(w, +id);
    if (!m?.master || (m.master.workedAt ?? -1) < w.tick - 1 || !atCraft(m)) continue;   // the master is not at its craft this moment
    ls.slice(0, MASTER.places).forEach(c => {
      if (dist(c, m) > MASTER.near) return;
      practice(c, m.master.skill, MASTER.learn);
      if (c.captive) { c.captive.service = (c.captive.service || 0) + MASTER.service; c.captive.teacher = m.id; }   // the master who would vouch (settlement/freedom.js)
      c.learnt = (c.learnt || 0) + 1;
    });
  }
}

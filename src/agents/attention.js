// When a colonist thinks again (docs/MIND.md stage 4): on events, not on a timer.
//
// A colonist used to weigh everything anew every 15–45 ticks and, four times out of five, went on with
// what it was doing. Now it thinks when something happened that may change its choice:
//   — its own: the task ended (agents/lifecycle.js), a need fell past a band, it got hurt, it was
//     struck (the reflex in agents/brains/colonist.js), a foe close by (settlement/board.js);
//   — the colony's (stepAttention, once a tick): night falls or day breaks, the council or the trade
//     begins, the raid alarm goes up or down, fire near the camp, new vacancies (settlement/plan.js),
//     one of ours fallen or badly hurt out in the woods, the woods turn dangerous or safe again, new gear
//     in the store; and the board's flags (settlement/board.js).
// A long heartbeat stays as a safety net (HEART): a colonist that heard of nothing in a while looks
// round anyway. The reason it woke is kept for its card (a.why.woke) and counted (w.behave.thinks).
import {colonists, raidAlarm} from '../settlement/query.js';
import {councilDue} from '../settlement/council.js';
import {tradeOpen} from '../settlement/trade.js';
import {planStale, makePlan} from '../settlement/plan.js';
import {outsideRisk, TOGETHER} from '../settlement/together.js';
import {agentInZone} from '../settlement/zone.js';
import {nightness, HOUR} from '../core/time.js';
import {hpShare} from './agent.js';
import {NEEDS} from '../data/needs.js';

// ticks until a colonist looks round with nothing having happened, by what it is doing
export const HEART = {job: 4 * HOUR, idle: HOUR, reserve: 15, muster: 30, other: 2 * HOUR};
export const heartOf = a => HEART[a.task?.id] ?? HEART.other;

// a need falling past one of these is an event (eat, sleep, warm up may now beat the work)
const NEED_BANDS = [0.6, 0.4, 0.25, 0.12];
// health falling past these (to the healer, out of a fight)
const HP_BANDS = [0.6, 0.35, 0.3];
const bandOf = (v, bands) => { let k = 0; while (k < bands.length && v < bands[k]) k++; return k; };

// wake a colonist: it thinks again at its next step. `why` goes on its card, `kind` is what is counted
// (w.behave.thinks). The first reason since its last think is the one kept
export function wake(a, why, kind = why) {
  if (!a || a.dead) return;
  if (a.wakeWhy == null) { a.wakeWhy = why; a.wakeKind = kind; }
  a.think = 0;
}
const wakeAll = (w, why, keep = () => true, kind = why) => { for (const a of colonists(w)) if (!a.dead && !a.downed && keep(a)) wake(a, why, kind); };

// the colonist's own events, at the start of its step (agents/brains/colonist.js)
export function noticeSelf(w, a) {
  const bands = a.bands ||= {};
  for (const id in a.needs) {
    const b = bandOf(a.needs[id], NEED_BANDS), was = bands[id] ?? b;
    if (b > was) wake(a, `${NEEDS.get(id).label} ${Math.round(a.needs[id] * 100)}%`, 'нужда тела');
    bands[id] = b;
  }
  const h = bandOf(hpShare(a), HP_BANDS), was = bands.hp ?? h;
  if (h > was) wake(a, `ранен: здоровье ${Math.round(hpShare(a) * 100)}%`, 'ранен');
  bands.hp = h;
}

// the colony's events, once a tick (sim.js), before the creatures step
export function stepAttention(w) {
  const col = colonists(w);
  if (!col.length) return;
  const S = w.attention ||= {};
  const flip = (key, now, on, off) => { const was = S[key]; S[key] = now; if (was == null || was === now) return; if (now && on) wakeAll(w, on); else if (!now && off) wakeAll(w, off); };
  flip('night', nightness(w) > 0.6, 'стемнело', 'рассвело');
  flip('council', councilDue(w), 'время совета', null);
  flip('trade', tradeOpen(w), 'пришёл купец: торг', null);
  flip('raid', raidAlarm(w), 'тревога: налётчики', 'тревога кончилась');
  flip('fire', (w.stats.fireNearCamp || 0) > 0, 'пожар у лагеря', null);
  const risk = outsideRisk(w);
  flip('risky', S.risky ? risk >= TOGETHER.riskTill : risk >= TOGETHER.riskFrom, 'в лесу опасно', 'в лесу стало спокойнее');
  // the colony has changed under the vacancies: post them anew, and those with nothing to do look at them
  if (planStale(w)) {
    const had = !!w.plan?.vac;
    makePlan(w, had ? 'перемены в поселении' : 'первый день');
    if (had) wakeAll(w, 'новая работа', a => !a.task || a.task.id === 'idle' || (a.task.id === 'job' && !w.plan.vac[a.task.job]));
  }
  // new gear in the store: who has nothing to do may take up work that needs it (a bow for the hunt)
  if (S.armory !== w.armoryVersion) { if (S.armory != null) wakeAll(w, 'новое снаряжение на складе', a => !a.task || a.task.id === 'idle'); S.armory = w.armoryVersion; }
  // one of ours fallen, or badly hurt out in the woods: everyone may want to help
  const hurt = S.hurt ||= {};
  const here = new Set(col.map(a => a.id));
  for (const id of Object.keys(hurt)) if (!here.has(+id)) delete hurt[id];   // gone from the colony: forgotten
  for (const a of col) {
    if (a.dead) { delete hurt[a.id]; continue; }
    const now = a.downed ? 2 : hpShare(a) < TOGETHER.aidBelow && !agentInZone(w, a) ? 1 : 0;
    if (now > (hurt[a.id] || 0)) wakeAll(w, now === 2 ? `${a.name} упал${a.gender === 'f' ? 'а' : ''} без сознания` : `${a.name} ранен${a.gender === 'f' ? 'а' : ''} в лесу`, o => o !== a, 'свой в беде');
    if (now) hurt[a.id] = now; else delete hurt[a.id];
  }
}

// counted for the balance runner: how often a colonist thinks, why, and how often it then went on as before
export function noteThink(w, kind, kept) {
  const b = w.behave; if (!b) return;
  const t = b.thinks ||= {n: 0, kept: 0, by: {}};
  t.n++; if (kept) t.kept++;
  t.by[kind] = (t.by[kind] || 0) + 1;
}

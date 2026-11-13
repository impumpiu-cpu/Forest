// The caravan's war band (docs/BEHAVIOUR.md «Дружина»): on the map of a camp (campaign/camp.js) the caravan's people are
// not settlers who answer a cry only while nobody covers it, keep by the fire or finish their work — they came as a
// company of arms. Once the camp's alarm is up (w.campaign.alarm: a foe seen by one awake, a blow struck — stepCamp),
// every able one goes for the foe: the one who strikes it, else the nearest on its feet. Who sleeps sleeps till the
// alarm (a night raid takes a sleeping camp by surprise); a captive, a former slave (no arms) and one hurt past
// BOARD.hurt keep out of it (agents/behaviours/colony.js reserve). Each fights in its fighting role (a.fightRole, set
// by its place in the company and what it holds, looked at each time it thinks: agents/tactics.js kitRole) — a shield-bearer covers
// the archers, an archer keeps its distance, the healer gets the fallen up. Reads: w.campaign (alarm, foeObjs).
import {hpShare} from '../agent.js';
import {attackerOf} from '../combat.js';
import {BOARD} from '../../settlement/board.js';
import {CAMP} from '../../data/camp.js';
import {roleTactic, caravanSide, holdFoe, fightTask, kitRole} from '../tactics.js';
import {opinion} from '../../data/relations.js';
import {threatTo} from '../../settlement/together.js';
import {colonists} from '../../settlement/query.js';

const up = o => !o.dead && !o.gone && !o.captive && !o.downed;

export const warband = {
  want(w, a) {
    const C = w.campaign;
    a.sneaking = false;   // only a cutthroat's tactic creeps, each think anew
    if (!C?.alarm || a.captive || a.former || a.downed || hpShare(a) <= BOARD.hurt) return null;
    // the fighting role's own way (agents/tactics.js): whom to go for, keeping back, healing — by what it holds now (a
    // fishing rod at the alarm, an axe from the stores a moment later)
    a.fightRole = kitRole(a);
    const out = [...asOne(w, a)];   // (beside the line: a friend fallen, or one's own nerve)
    const t = roleTactic(w, a, caravanSide(w), CAMP.band.sight);
    if (t) {
      const task = t.id === 'fight' ? fightTask(w, a, holdFoe(w, a, t.target)) : t;
      return [[task, CAMP.band.want, () => (task.id === 'fight' ? `дружина в бою: ${task.target.name}` : task.id === 'mend' ? 'поднимает своего' : 'отходит от клинка')], ...out];
    }
    let e = attackerOf(w, a);
    if (!e || !up(e)) {
      e = null; let best = Infinity;
      for (const o of C.foeObjs || []) { if (!up(o)) continue; const d = Math.hypot(o.x - a.x, o.y - a.y); if (d < best) { best = d; e = o; } }
    }
    if (!e) return out.length ? out : null;
    return [[a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e}, CAMP.band.want, () => `дружина в бою: ${e.name}`], ...out];
  },
};

// one's own answer to the fight, beside the line's: run to a friend who lies fallen with a foe over it (the bond decides,
// not a rule that everyone helps), or falter — badly hurt and faint-hearted — and fall back to the fire. Each is one more
// offer in the alarm's lane, weighed against the line's (agents/brains/tabled.js): it may win, or not
function asOne(w, a) {
  const B = CAMP.band, R = B.rescue, F = B.falter, out = [];
  if (a.fightRole !== 'healer') {   // (the healer gets the fallen up by its role already)
    let best = null, bs = 0;
    for (const b of colonists(w)) {
      if (b === a || !b.downed || b.captive || Math.hypot(b.x - a.x, b.y - a.y) > R.near) continue;
      const op = opinion(a, b); if (op < R.friend || !threatTo(w, b, R.foe, a)) continue;
      const s = Math.min(R.cap, (op - R.friend + 1) * R.per);
      if (s > bs) { bs = s; best = b; }
    }
    if (best) out.push([a.task?.id === 'aid' && a.task.who === best.id ? a.task : {id: 'aid', who: best.id, fallen: true}, B.want + bs, () => `бросился к упавшему другу: ${best.name}`]);
  }
  if (hpShare(a) < F.hp && a.morale?.state === 'breaking') out.push([a.task?.id === 'runHome' ? a.task : {id: 'runHome'}, B.want + F.over, () => 'дрогнул: ранен и страшно — назад, к огню']);
  return out;
}

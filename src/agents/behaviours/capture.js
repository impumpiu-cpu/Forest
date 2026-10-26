// Capture: a living raider takes a prisoner — the mirror of the colonist's `bind` (settlement/captives.js). A foe
// lying senseless this close (RAID.capture.near), nobody standing against it within `calm`, the raider itself not
// badly hurt and leading no one yet: it goes over, dresses the wound roughly and ties the knots (`ticks` on the spot),
// and from then on the bound one follows it like a stolen beast (led.js: a.ledBy, a.ledFrom — what it was) and is
// gone with it; the raider counts itself paid (a.looted) and heads home. The band's plan comes first (RAID.want: plan
// above capture): a band on the run stops for no one, though knots begun are finished (keep). Reads: nothing of its own.
import {isHostile} from '../../data/factions.js';
import {nearAgents} from '../spatial.js';
import {nearestHostile} from '../combat.js';
import {hpShare} from '../agent.js';
import {approach} from '../movement.js';
import {endTask} from '../lifecycle.js';
import {liveById} from '../lookup.js';
import {dress} from '../wounds.js';
import {releaseAll} from '../../settlement/reserve.js';
import {log} from '../../core/log.js';
import {esc, g, dist} from '../../core/util.js';
import {RAID} from '../../data/behaviour.js';


// the fallen foe to take: the nearest one lying within reach that nobody leads yet
function fallenNear(w, a) {
  let best = null, bd = Infinity;
  for (const o of nearAgents(w, a.x, a.y, RAID.capture.near)) {
    if (o === a || o.dead || !o.downed || o.ledBy != null || !isHostile(a, o)) continue;
    const d = dist(a, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// the knots tied: the wound dressed (no healer's hand), its work let go, and off behind the raider
function take(w, a, f) {
  dress(w, f, 0);
  releaseAll(w, f);
  f.task = null; f.sleeping = false; f.path = null;
  f.ledFrom = f.brain; f.brain = 'led'; f.ledBy = a.id;
  a.leads = f.id; a.looted = true;
  log(w, `<b>${esc(a.name)}</b> ${g(a, 'связал', 'связала')} <b>${esc(f.name)}</b> и уводит в плен.`, 'danger', 'alert');
}

export const capture = {
  want(w, a, {sp}) {
    if (sp.mindless || a.warBeast || a.leads || hpShare(a) < RAID.capture.hp) return null;
    const cur = a.task?.id === 'capture' ? a.task : null;
    const f = (cur && liveById(w, cur.who)) || fallenNear(w, a);
    if (!f || f.dead || !f.downed || (f.ledBy != null && f.ledBy !== a.id)) return null;
    if (nearestHostile(w, a, RAID.capture.calm)) return null;   // someone still stands over the fallen: not now
    return [[cur && cur.who === f.id ? cur : {id: 'capture', who: f.id, work: 0}, RAID.want.capture, () => `упавший враг: ${f.name}`]];
  },
  step(w, a, t) {
    const f = liveById(w, t.who);
    if (!f || f.dead || !f.downed || f.ledBy != null) { endTask(w, a, 'impossible', 'некого вязать'); return; }
    if (dist(a, f) > 1.3) { t.work = 0; if (approach(w, a, f.x, f.y, 1.2) === null) endTask(w, a, 'impossible', 'к упавшему не подойти'); return; }
    if ((t.work = (t.work || 0) + 1) < RAID.capture.ticks) return;
    take(w, a, f);
    endTask(w, a);
  },
};

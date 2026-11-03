// Stand ground: a big grazer does not run from people or wolves. Whoever comes close and attacks it gets kicked (a
// heavy, slow blow); whoever hurt it from afar (an arrow, a sling stone) gets charged: it runs at them and the first
// blow after the run lands harder; it keeps the grudge for a while, unless they get away. Badly hurt, it limps off —
// and only then do wolves dare to go for it. A bold, healthy bull of a herd stands up for a member under attack.
// Offers the shared `maul` task in the `kick` mode (the step is here, agents/behaviours/maul.js reaches it) and
// `bolt`. Reads: mule {kickRange, charge, chargeHit, chargeFrom, grudge, giveUp, fleeBelow}.
import {SPECIES} from '../../data/species.js';
import {approach, sprintMul} from '../movement.js';
import {damage} from '../combat.js';
import {maxHp} from '../agent.js';
import {nearAgents} from '../spatial.js';
import {liveById, onMap} from '../lookup.js';
import {herdOf, nerveOf} from '../wildHerd.js';
import {hpShare} from '../agent.js';
import {log} from '../../core/log.js';
import {esc, dist, cap} from '../../core/util.js';
import {endTask} from '../lifecycle.js';
import {STAND} from '../../data/behaviour.js';

const AT = new Set(['maul', 'chase', 'fight']);

// who it is angry with: someone attacking it right now from close by, or whoever hurt it lately and is still near
export function foeOf(w, a, M) {
  let foe = null, bd = STAND.foeNear;
  for (const o of nearAgents(w, a.x, a.y, STAND.foeNear)) {
    if (o === a || o.dead || o.task?.target !== a || !AT.has(o.task.id)) continue;
    const d = dist(a, o); if (d < bd) { bd = d; foe = o; }
  }
  if (foe) return foe;
  const h = a.hurtBy;
  if (!h || w.tick - h.tick > M.grudge) return null;
  const o = liveById(w, h.id);
  return o && dist(a, o) < M.giveUp ? o : null;
}

// a kick: the species' blow, harder at the end of a charge
function kick(w, a, t, M, charging) {
  if (a.cd > 0) return;
  const atk = SPECIES.get(a.species).attack, K = STAND.kick;
  a.cd = atk.cooldown; a.flash = 4;
  damage(w, a, t, (K.least + w.rngs.wild() * K.spread) * atk.power * (charging ? M.chargeHit : 1));
}

export const standGround = {
  want(w, a, {sp}) {
    const M = sp.mule, W = STAND.want;
    let foe = foeOf(w, a, M);
    const H = herdOf(w, a);
    if (!foe && H && nerveOf(w, a) >= STAND.bull && hpShare(a) > STAND.bullHp) {
      for (const id of H.members) {
        const m = id !== a.id ? liveById(w, id) : null;
        const f = m && dist(m, a) < STAND.bullNear ? foeOf(w, m, M) : null;
        if (f) { foe = f; break; }
      }
    }
    if (!foe) return null;
    // badly hurt: limp away, but still kick whoever is right at its flank
    if (a.hp < maxHp(a) * M.fleeBelow && dist(a, foe) > M.kickRange) return [[{id: 'bolt', mode: 'from', from: [foe], sprint: STAND.limpPace, drain: 0}, W.limp, () => 'ранен: хромает прочь']];
    return [[{id: 'maul', mode: 'kick', target: foe, mule: true}, W.foe, () => `отбивается: ${foe.name}`]];
  },
};

// the step of `maul` in the `kick` mode
export function kickStep(w, a, t) {
  const sp = SPECIES.get(a.species), M = sp.mule, foe = t.target;
  if (!foe || foe.dead || !onMap(w, foe)) { endTask(w, a); return; }
  const d = dist(a, foe);
  if (d > M.kickRange) {
    if (t.stay) { endTask(w, a); return; }   // a tame mule kicks where it stands and goes after nobody (fendOff)
    if (a.hurtBy?.far && d > M.chargeFrom && !t.charging) {
      t.charging = true;
      if (foe.faction === 'colony') log(w, `${cap(sp.label)} несётся на <b>${esc(foe.name)}</b>: стрелять в него было ошибкой.`, 'danger', 'notice');
    }
    if (approach(w, a, foe.x, foe.y, t.charging ? sprintMul(a, M.charge, STAND.chargeDrain) : STAND.closePace) === null) a.hurtBy = null;   // cannot get there: forget it
  } else { kick(w, a, foe, M, t.charging); t.charging = false; }
}

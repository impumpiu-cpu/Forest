// Lure (the rusalka, the vodyanoy): by night she sings at the shore. A colonist alone within `radius` walks to her
// (the `lured` spell, agents/tasks.js) unless a sharp eye and a clear head see through the song — Perception +
// Intelligence against her Charisma × 2 — and she drowns them unless someone comes close and breaks the spell. One
// song a night. The song is the `always` hook (an aura works whatever she is doing); the task `sing` walks her home
// ground like lurk, or stands still (`wait` mode) while a victim is on its way. Reads: spirit {aura: 'lure', radius, night?}.
import {think} from '../mind.js';
import {wake} from '../attention.js';
import {log} from '../../core/log.js';
import {esc, g} from '../../core/util.js';
import {HOUR} from '../../core/time.js';
import {contest} from '../../data/special.js';
import {agentInZone} from '../../settlement/zone.js';
import {awake, lonely, spellbound, dist, Label} from '../nechist.js';
import {wanderStep} from './lurk.js';
import {NECHIST} from '../../data/behaviour.js';

const victimOf = (w, a) => w.agents.find(o => !o.dead && o.task?.id === 'lured' && o.task.by === a.id) || null;   // scan: spirits only

export const lure = {
  always(w, a, {sp, night}) {
    const S = sp.spirit, L = NECHIST.lure;
    if (S.aura !== 'lure' || !awake(S, night) || a.hiddenUntil > w.tick || victimOf(w, a)) return;
    // one song a night: after a try (kept, broken or resisted) she waits for the next night
    if ((w.tick + a.id) % L.every || w.tick < (a.lureAt ?? -1e9) + L.oneSong * HOUR) return;
    let best = null, bd = S.radius;
    for (const o of w.agents) {   // scan: spirits only
      if (o.faction !== 'colony' || o.dead || o.downed || spellbound(o) || agentInZone(w, o) || !lonely(w, o, L.lonely)) continue;
      const d = dist(o, a); if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    a.lureAt = w.tick;
    const vs = best.special, ss = a.special;
    if (vs && ss && w.rngs.nechist() < contest(vs.P + vs.I, ss.C * 2)) {
      think(w, best, 'resistedSong');
      best.task = {id: 'runHome'};   // what the journal says is what happens: back to the settlement
      log(w, `Ночью у воды пели, но <b>${esc(best.name)}</b> ${g(best, 'не поддался', 'не поддалась')} и ${g(best, 'ушёл', 'ушла')} к своим.`, 'wildlife', 'notice');
      return;
    }
    best.task = {id: 'lured', by: a.id, until: w.tick + L.holds * HOUR, spell: NECHIST.spell.lure};
    think(w, best, 'lured');
    log(w, `Ночью у воды поют. <b>${esc(best.name)}</b> бредёт на голос — одному туда нельзя!`, 'danger');
  },
  want(w, a, {sp, night}) {
    const S = sp.spirit, W = NECHIST.want;
    if (S.aura !== 'lure' || !awake(S, night)) return null;
    const v = victimOf(w, a);
    if (!v) return [[a.task?.id === 'sing' ? a.task : {id: 'sing'}, W.song, () => 'поёт у воды']];
    if (!lonely(w, v, NECHIST.lure.lonely)) {   // someone came close: the spell breaks
      v.task = null; wake(v, 'чары спали', 'чары');
      log(w, `<b>${esc(v.name)}</b> ${g(v, 'очнулся', 'очнулась')} у самой воды: рядом оказались свои. ${Label(sp)} скрылась.`, 'danger', 'notice');
      return [[{id: 'lurk'}, W.drowning, () => 'чары спали: скрылась']];
    }
    if (dist(a, v) < NECHIST.lure.reach) return [[{id: 'maul', mode: 'strike', target: v}, W.drowning, () => `топит ${v.name}`]];
    return [[{id: 'sing', mode: 'wait'}, W.drowning, () => `${v.name} идёт на голос`]];
  },
  step(w, a, t) { if (t.mode !== 'wait') wanderStep(w, a, t); },
};

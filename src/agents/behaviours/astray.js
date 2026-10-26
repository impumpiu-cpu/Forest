// Astray (the leshy, the poludnitsa): every `every` ticks the colonists within `radius` — outside the settlement, not
// already under a spell — lose their way for an hour or two (the `astray` spell, agents/tasks.js). An aura: the
// `always` hook, whatever the spirit is doing; it offers nothing. Reads: spirit {aura: 'astray', radius, every}.
import {think} from '../mind.js';
import {log} from '../../core/log.js';
import {esc} from '../../core/util.js';
import {HOUR, DAY} from '../../core/time.js';
import {agentInZone} from '../../settlement/zone.js';
import {spellbound, dist, Label} from '../nechist.js';
import {NECHIST} from '../../data/behaviour.js';

export const astray = {
  always(w, a, {sp}) {
    const S = sp.spirit, A = NECHIST.astray;
    if (S.aura !== 'astray' || a.hiddenUntil > w.tick || a.task?.id === 'maul' || (w.tick + a.id) % S.every) return;   // (while it fights back: no spell)
    const lost = w.agents.filter(o => o.faction === 'colony' && !o.dead && dist(o, a) < S.radius && !agentInZone(w, o) && !spellbound(o));   // scan: spirits only
    for (const v of lost) { v.task = {id: 'astray', until: w.tick + HOUR * (A.hours[0] + A.hours[1] * w.rngs.nechist()), spell: NECHIST.spell.astray}; think(w, v, 'leshyLost'); }
    if (lost.length && w.tick - (w.lastAstray || -1e9) > DAY * A.logEvery) {
      w.lastAstray = w.tick;
      log(w, `В лесу плутает ${lost.map(o => `<b>${esc(o.name)}</b>`).join(', ')}: тропы водят по кругу. ${Label(sp)} шалит.`, 'wildlife', 'notice');
    }
  },
  want() { return null; },
};

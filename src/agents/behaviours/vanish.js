// Vanish: hurt, a rusalka dives and a leshy melts into the thicket when a crowd closes in; hidden (a.hiddenUntil),
// nobody sees it, and it makes for a far home cell. Offers `hide` in the `deep` mode (the step is here, hide.js
// reaches it). The `always` hook keeps the nechist's body: at home its wounds close (`spirit.regen`), and its veil —
// how close one must come to see it — is set by what it is doing (agents/combat.js nearestHostile).
// Reads: spirit {home, keepOff, dives?, crowd?, veil, regen?, aura?, night?}.
import {SPECIES} from '../../data/species.js';
import {cellOf} from '../../world/grid.js';
import {approach} from '../movement.js';
import {maxHp} from '../agent.js';
import {isHome, homeCell, foeOf, awake} from '../nechist.js';
import {NECHIST} from '../../data/behaviour.js';

export const vanish = {
  always(w, a, {sp, night}) {
    const S = sp.spirit;
    if (isHome(w, cellOf(w, a), S.home) && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + NECHIST.mends * maxHp(a) * (S.regen || 1));
    if (a.hiddenUntil > w.tick) { a.veil = 0; return; }
    a.veil = foeOf(w, a) ? null : S.aura === 'lure' && awake(S, night) && a.task?.id === 'sing' ? NECHIST.lure.singVeil : S.veil;
  },
  want(w, a) {
    return a.hiddenUntil > w.tick ? [[a.task?.id === 'hide' && a.task.mode === 'deep' ? a.task : {id: 'hide', mode: 'deep'}, NECHIST.want.hidden, () => 'скрылась от глаз']] : null;
  },
};

// the step of `hide` in the `deep` mode: to a home cell well away from the camp, found once
export function deepHideStep(w, a, t) {
  const spirit = SPECIES.get(a.species).spirit;
  if (!t.spot && !t.searched) { t.searched = true; const k = homeCell(w, spirit.home, (spirit.keepOff || 0) * NECHIST.hideFar); if (k >= 0) t.spot = [k % w.w + 0.5, ((k / w.w) | 0) + 0.5]; }
  if (t.spot && approach(w, a, t.spot[0], t.spot[1], NECHIST.hidePace) === null) t.spot = null;
}

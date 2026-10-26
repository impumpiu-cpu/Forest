// Nibble: when the camp is quiet (mostly at night, while people sleep) vermin sneaks in and nibbles the food lying in
// the open (settlement/stock.js nibble; pots and a granary keep food out of reach). The kikimora (`spoils`) would
// rather spoil a carcass in the woods than risk the camp: she hastens its rot (agents/carcass.js: an old carcass in
// the dark may raise an upyr). Reads: vermin {eats, spoils?}.
import {SPECIES} from '../../data/species.js';
import {follow, approach} from '../movement.js';
import {nibble as eat} from '../../settlement/stock.js';
import {smellCarcass} from '../carcass.js';
import {log} from '../../core/log.js';
import {VERMIN} from '../../data/behaviour.js';
import {dist} from '../../core/util.js';


export const nibble = {
  want(w, a) { return [[a.task?.id === 'nibble' ? a.task : {id: 'nibble'}, VERMIN.want.nibble, () => 'у припасов тихо']]; },
  step(w, a, t) {
    const sp = SPECIES.get(a.species), V = sp.vermin;
    if (V.spoils) {
      const S = VERMIN.spoil, c = smellCarcass(w, a, S.smell);
      if (c) {
        if (dist(a, c) > S.at) { if (approach(w, a, c.x, c.y, S.pace) === null) a.task = {id: 'hide'}; }
        else { c.food = Math.max(0, c.food - S.food); c.t -= S.rot; }
        return;
      }
    }
    if (follow(w, a, 'camp') === 'arrived') {
      t.at ??= w.tick;
      eat(w, V.eats);
      if (V.spoils && w.tick - (w.lastSpoil || -1e9) > VERMIN.spoil.logEvery) { w.lastSpoil = w.tick; log(w, `Ночью у припасов шебуршала ${sp.label}: часть еды испорчена.`, 'wildlife', 'notice'); }
    }
  },
};

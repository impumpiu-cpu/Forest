// Scout: a realm sends trackers after a hidden lair of the wild (data/lairs.js WILD; atlas/lairs.js spawnWild). A season's
// WILD.scout.chance (× `raided` when a town of the realm was raided in the last `recent` years — the raids show where to
// look): a town of the realm within `reach` of a hidden lair sends them; they find it with find[0] + find[1] × the town's
// lore + find[2] × its step. A found lair is an ordinary one: the realms may go against it (atlas/deeds/clearLair.js).
import {LAIRS, WILD} from '../../data/lairs.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';
import {townFx, townLabel} from '../towns.js';
import {realmLabelGen} from '../realms.js';
import {revealLair, wherePhrase} from '../lairs.js';
import {scaleOf} from '../tectonics.js';
import {liveTowns} from './realm.js';

export const scout = {
  want(a, realm, {r}) {
    const S = WILD.scout, hidden = (a.lairs || []).filter(l => l.alive && l.hidden);
    if (!hidden.length) return null;
    const towns = liveTowns(a, realm), raided = towns.some(t => t.raided != null && a.hist.year - t.raided <= S.recent);
    if (r() > S.chance * (raided ? S.raided : 1) / SEASONS_PER_YEAR) return null;
    const reach = S.reach * scaleOf(a);
    let best = null, bd = Infinity;
    for (const l of hidden) for (const t of towns) { const d = Math.hypot(t.x - l.x, t.y - l.y); if (d <= reach && d < bd) { bd = d; best = [t, l]; } }
    return best ? [[{town: best[0].id, lair: best[1].id}, 1, () => `в глуши у ${best[0].name} неспокойно`]] : null;
  },
  act(a, realm, plan, {r}) {
    const l = a.lairs.find(x => x.id === plan.lair), t = a.towns.find(x => x.id === plan.town), F = WILD.scout.find;
    if (!l?.alive || !l.hidden || !t?.alive) return null;
    if (r() >= F[0] + F[1] * townFx(t).lore + F[2] * t.tier) return null;   // they came back with nothing: not worth a line
    revealLair(a, l, t.name);
    const L = LAIRS.get(l.kind);
    return `Следопыты ${realmLabelGen(a, realm.id)} из ${townLabel(t, 2)} ${t.name} выследили ${L.labelAcc || L.label} «${l.name}» ${wherePhrase(a, l.i)}: теперь его можно выжечь.`;
  },
};

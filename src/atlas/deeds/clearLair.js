// Clearing a lair: a town goes against a lair whose territory reaches it (data/peoples.js TOWN_WAR: within the lair's
// radius + `reach`, with the year's chance spread over the seasons) — a calamity's boss's lair is beyond one town
// (atlas/alliance.js). The town's might × TOWN_WAR.might against the lair's strength × its owner's body, with luck on
// both sides: the lair is burnt out, or the town pays `raidLoss` of its people and a work.
import {townBeatsLair} from '../lairs.js';
import {cap1} from '../../core/util.js';
import {LAIRS, NECRO} from '../../data/lairs.js';
import {killShare} from '../population.js';
import {deadAt} from '../necro.js';
import {TOWN_WAR} from '../../data/peoples.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';
import {SPECIES} from '../../data/species.js';
import {townFx, raidShare, townLabel} from '../towns.js';
import {raidGraves} from '../diplomacy.js';
import {raidSite} from '../sites.js';
import {realmLabel} from '../realms.js';
import {BURNT} from '../peoples.js';
import {scaleOf} from '../tectonics.js';
import {liveTowns} from './realm.js';


// how far a lair's land reaches the towns about it, world cells: its territory + TOWN_WAR.reach (only read — the board of
// errands asks it too: campaign/errands.js boardFor)
export const lairReach = (a, l) => (LAIRS.get(l.kind).radius + TOWN_WAR.reach) * scaleOf(a);

export const clearLair = {
  want(a, realm, {r}) {
    const out = [];
    for (const l of a.lairs || []) {
      if (!l.alive || l.boss != null || l.hidden) continue;   // a hidden lair must be found first (atlas/deeds/scout.js)
      const L = LAIRS.get(l.kind), reach = lairReach(a, l);
      for (const t of liveTowns(a, realm)) {
        if (Math.hypot(t.x - l.x, t.y - l.y) > reach || r() > TOWN_WAR.chance / SEASONS_PER_YEAR) continue;
        out.push([{town: t.id, lair: l.id}, 1, () => `${L.label} «${l.name}» достаёт до ${t.name}`]);
        break;   // one town of the realm a lair a season
      }
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, {r}) {
    const l = a.lairs.find(x => x.id === plan.lair), t = a.towns.find(x => x.id === plan.town);
    if (!l?.alive || !t?.alive) return null;
    const L = LAIRS.get(l.kind), owner = SPECIES.get(L.species), W = TOWN_WAR;
    // a necromancer's tower stands behind its dead (atlas/necro.js): × its kind's might × (1 + guard × the dead about it)
    const guard = L.domain ? (L.might || 1) * (1 + NECRO.guard * Math.min(1, deadAt(a, l.i))) : 1;
    const fx = townFx(t);
    if (townBeatsLair(t, l, r, guard, fx)) {
      l.alive = false; l.died = a.hist.year; l.clearedBy = t.id;
      return `${cap1(realmLabel(a, realm.id))} из ${townLabel(t, 2)} ${t.name} выжгли ${L.labelAcc || L.label} «${l.name}»: ${owner.plural} больше не тревожат их земли.`;
    }
    const loss = W.raidLoss * raidShare(fx);
    killShare(a, t, loss, 'raid'); t.raided = a.hist.year; raidGraves(a, t);
    const burnt = raidSite(a, t, r);
    return `${cap1(L.domain ? 'мертвецы' : owner.plural)} ${L.from} «${l.name}» напали на ${townLabel(t, 1)} ${t.name}: погибло ${Math.round(loss * 100)}% жителей${burnt ? `, ${BURNT[burnt.g]} ${burnt.name}` : ''}.`;
  },
};

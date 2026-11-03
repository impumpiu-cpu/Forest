// Strike and sleep: the dragon (data/parties.js DRAGON; the lair kind `dragon`, data/lairs.js) on the common deeds. Each
// summer its lair weighs two deeds, as any actor does (atlas/actor.js draws): `sleep`, of weight DRAGON.rest, and
// `strike`, of weight DRAGON.strike shared among the towns within `reach` by their people ^ `pick` — so it sleeps most
// summers and, awake, flies to a town the more likely the richer; it burns `burns` of its works and `loss` of its people,
// unless the town drives it off, and flies home. Wounded (atlas/calamity.js: l.wakes, a year) it only sleeps. The lair's
// role only: a dragon raises no leader. Neither `want` changes anything or draws.
import {cap1, luck} from '../../core/util.js';
import {DRAGON} from '../../data/parties.js';
import {killShare} from '../population.js';
import {LAIRS} from '../../data/lairs.js';
import {WORLD_PEOPLES} from '../../data/peoples.js';
import {townFx, might, raidShare, townLabel} from '../towns.js';
import {raidGraves} from '../diplomacy.js';
import {raidSite} from '../sites.js';
import {sendParty} from '../parties.js';
import {scaleOf} from '../tectonics.js';
import {dist} from './shared.js';

const flying = (a, l) => (a.parties || []).some(p => p.kind === 'dragon' && p.owner === l.id && p.state !== 'gone');
const wounded = (a, l) => l.wakes != null && a.hist.year < l.wakes;

export const sleep = {
  want(a, l, {season, L}) {
    if (season !== 'summer' || !L?.dragon || flying(a, l)) return null;
    return [[{}, DRAGON.rest, () => (wounded(a, l) ? `ранен: спит до ${l.wakes} года` : 'спит')]];
  },
};

export const strike = {
  want(a, l, {season}) {
    if (season !== 'summer' || wounded(a, l) || flying(a, l) || !a.towns.length) return null;
    const near = a.towns.filter(t => t.alive && t.pop > 0 && dist(l, t) <= DRAGON.reach * scaleOf(a));
    const w = near.map(t => Math.pow(t.pop, DRAGON.pick)), sum = w.reduce((s, x) => s + x, 0);
    if (!(sum > 0)) return null;   // nothing worth the flight: it sleeps
    return near.map((t, k) => [{goal: t.i, target: t.id}, DRAGON.strike * w[k] / sum, () => `проснулся: ${t.name} — богатый город в досягаемости`]);
  },
  act(a, l, plan, {L}) {
    const target = a.towns.find(t => t.id === plan.target);
    const p = sendParty(a, 'dragon', l.i, target.i, {owner: l.id, plan: 'strike', target: target.id, might: DRAGON.might, speed: 'flight', label: 'дракон', color: L.color});
    return p ? `Дракон ${L.from} «${l.name}» проснулся и полетел на ${townLabel(target, 1)} ${target.name}.` : null;
  },
  arrive(a, p, l, L, rnd, say) {
    const target = a.towns.find(t => t.id === p.target), D = DRAGON;
    if (!target?.alive) return;
    const fx = townFx(target), town = might(target, fx) * luck(D.luck, rnd);
    if (town > p.might * luck(D.luck, rnd)) { say(`${cap1(WORLD_PEOPLES.get(target.people).label)} ${townLabel(target, 2)} ${target.name} отогнали дракона: стрелы и копья его не взяли, но и он не стал жечь.`); return; }
    let burnt = 0;
    const n = D.burns[0] + Math.floor(rnd() * (D.burns[1] - D.burns[0] + 1));
    for (let q = 0; q < n; q++) if (raidSite(a, target, () => 0)) burnt++;
    const loss = D.loss * raidShare(fx);
    killShare(a, target, loss, 'dragon'); target.raided = a.hist.year; raidGraves(a, target);
    say(`Дракон ${LAIRS.get(l.kind).from} «${l.name}» выжег ${townLabel(target, 1)} ${target.name}: погибло ${Math.round(loss * 100)}% жителей${burnt ? `, сгорело угодий: ${burnt}` : ''}.`);
  },
};

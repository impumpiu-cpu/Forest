// Strike: the dragon (data/parties.js DRAGON; the lair kind `dragon`, data/lairs.js). It sleeps for years (`sleep`,
// counted down a summer at a time); awake, it flies to the richest town within `reach` — the town's people weighed with
// luck — and burns `burns` of its works and `loss` of its people, unless the town drives it off; then it flies home
// and sleeps again. The lair's role only: a dragon raises no leader.
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

const nap = r => DRAGON.sleep[0] + Math.floor(r() * (DRAGON.sleep[1] - DRAGON.sleep[0] + 1));

export const strike = {
  want(a, l, {season, r}) {
    if (season !== 'summer') return null;
    if (l.sleep == null) l.sleep = nap(r);
    if (--l.sleep > 0 || !a.towns.length) return null;
    let target = null, bv = 0;
    for (const t of a.towns) if (t.alive && dist(l, t) <= DRAGON.reach * scaleOf(a)) { const v = t.pop * (0.7 + 0.6 * r()); if (v > bv) { bv = v; target = t; } }
    if (!target) { l.sleep = 2; return null; }   // nothing worth the flight: a short nap
    return [[{goal: target.i, target: target.id}, 1, () => `проснулся: ${target.name} — самый богатый город в досягаемости`]];
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
  home(a, p, l, rnd) { l.sleep = nap(rnd); },
};

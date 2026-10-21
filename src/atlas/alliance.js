// The alliances against a calamity (data/calamities.js ALLY; docs/CAMPAIGN.md «Доработка, этап 8») — the world's own
// mind: after the wild era the peoples see a boss rise, forget their quarrels and band together. The realms within
// its reach make a truce, each musters an army at its town nearest the boss and marches on its lair; at the lair the
// armies wait for each other and storm it together. Won — the boss falls (atlas/calamity.js); beaten — they try
// again a few years later. After the boss is gone come years of peace, then the alliance falls apart: the realms'
// feelings go back to what they were, a member that sent no army is held worse, and the old wars come back by
// themselves (atlas/diplomacy.js). The code knows nothing of the epic world but the calamity it is given, so that
// an alliance may one day be an option of the «Мир» screen too.
//
// a.alliances = [{id, calamity, members: [realm ids], since, tries, armies: [party ids], sent: [realm ids], before:
//   {pair: att}, ended, peaceUntil, broken}]
import {LAIRS} from '../data/lairs.js';
import {SPECIES} from '../data/species.js';
import {ARMY} from '../data/parties.js';
import {ALLY} from '../data/calamities.js';
import {scaleOf} from './tectonics.js';
import {meet, relation} from './diplomacy.js';
import {realmLabel, realmLabelGen, realmOf} from './realms.js';
import {townFx, townLabel} from './towns.js';
import {sendParty, goHome} from './parties.js';
import {WORLD_PEOPLES} from '../data/peoples.js';

const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const cap1 = s => s[0].toUpperCase() + s.slice(1);
const pairKey = (p, q) => (p < q ? `${p}:${q}` : `${q}:${p}`);
const power = sp => { const s = SPECIES.get(sp)?.special; return s ? (s.S[0] + s.S[1]) / 2 + (s.E[0] + s.E[1]) / 2 : 10; };
const armyMight = (men, fx) => Math.sqrt(men) * (1 + 0.3 * fx.prod + 0.5 * fx.defence) * ARMY.might;
const names = (a, ids) => ids.map(id => realmLabel(a, id)).join(', ');

// the realms that stand against a calamity: those with a living town in its reach, else the nearest
function threatened(a, c) {
  const k = scaleOf(a), x = c.i % a.w, y = (c.i / a.w) | 0, d = t => Math.hypot(t.x - x, t.y - y);
  const towns = (a.towns || []).filter(t => t.alive && t.realm);
  const near = [...new Set(towns.filter(t => d(t) <= ALLY.reach * k).map(t => t.realm))];
  if (near.length) return near;
  const best = {};
  for (const t of towns) if (best[t.realm] == null || d(t) < best[t.realm]) best[t.realm] = d(t);
  return Object.entries(best).sort((p, q) => p[1] - q[1]).slice(0, ALLY.nearest).map(e => e[0]);
}

// a year of the alliance against calamity `c` (atlas/calamity.js, in spring). `fall(line)` — the boss falls
export function stepAlliance(a, c, r, tell) {
  const y = a.hist.year;
  let A = (a.alliances || []).find(x => x.calamity === c.id);
  if (c.phase === 'rise') {
    if (!A) {
      if (y < c.riseAt + (c.allyAfter ??= Math.round(between(r, ALLY.after)))) return;
      const members = threatened(a, c);
      if (!members.length) return;
      A = {id: (a.alliances ||= []).length + 1, calamity: c.id, members, since: y, tries: 0, armies: [], sent: [], before: {}, ended: null, peaceUntil: null, broken: false};
      a.alliances.push(A);
      for (const p of members) for (const q of members) if (p < q) A.before[pairKey(p, q)] = meet(a, p, q, y).att;
      const truce = [];
      for (const p of members) for (const q of members) if (p < q) { const rel = relation(a, p, q); if (rel?.war) { rel.war = null; truce.push(`${realmLabel(a, p)} и ${realmLabel(a, q)}`); } }
      tell(members.length > 1
        ? `Перед лицом беды ${names(a, members)} забыли распри и заключили союз против ${c.boss.title[1].toLowerCase()} по имени ${c.boss.name}${truce.length ? `; войну прекратили ${truce.join('; ')}` : ''}.`
        : `${cap1(realmLabel(a, members[0]))} поднялись против ${c.boss.title[1].toLowerCase()} по имени ${c.boss.name}: другим державам до беды пока нет дела.`);
    }
    // while it lasts: no war between members, the feeling between them warms
    for (const p of A.members) for (const q of A.members) if (p < q) { const rel = meet(a, p, q, y); rel.war = null; rel.att = Math.min(5, Math.max(ALLY.truce, rel.att) + ALLY.bond); }
    // the armies: mustered when none is out and the last try is far enough behind
    const out = A.armies.some(id => (a.parties || []).some(p => p.id === id && p.state !== 'gone'));
    if (!out && y >= (A.nextTry ?? 0)) muster(a, A, c, tell);
    return;
  }
  // the boss is gone: years of peace, then the alliance falls apart
  if (!A || A.broken) return;
  if (A.ended == null) { A.ended = y; A.peaceUntil = y + Math.round(between(r, ALLY.peace)); return; }
  if (y < A.peaceUntil) return;
  A.broken = true;
  const shirkers = A.members.filter(p => !A.sent.includes(p));
  for (const p of A.members) for (const q of A.members) {
    if (p >= q) continue;
    const rel = meet(a, p, q, y), was = A.before[pairKey(p, q)] ?? rel.att;
    rel.att = rel.att + (was - rel.att) * ALLY.back - (shirkers.includes(p) || shirkers.includes(q) ? ALLY.shirk : 0);
    rel.att = Math.max(-5, Math.min(5, rel.att));
  }
  if (A.members.length > 1) tell(`Союз против ${c.boss.title[1].toLowerCase()} по имени ${c.boss.name} распался: прошло ${y - A.ended} лет мира, и ${names(a, A.members)} вспомнили старые обиды${shirkers.length ? `; ${names(a, shirkers)} припомнили, что ${shirkers.length > 1 ? 'они не прислали' : 'не прислали'} войска` : ''}.`);
}

// each member's army from its town nearest the boss
function muster(a, A, c, tell) {
  const x = c.i % a.w, y = (c.i / a.w) | 0, lair = a.lairs.find(l => l.id === c.lair);
  if (!lair || !lair.alive) return;
  A.tries++; A.armies = []; A.arrived = 0;
  const went = [];
  for (const realm of A.members) {
    const t = (a.towns || []).filter(o => o.alive && o.realm === realm).sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
    if (!t) continue;
    const men = Math.round(ALLY.levy * t.pop);
    if (men < ALLY.minMen) continue;
    const R = realmOf(a, realm);
    const p = sendParty(a, 'army', t.i, lair.i, {owner: realm, from: t.id, target: null, lair: lair.id, ally: A.id, war: null, men, might: armyMight(men, townFx(t)),
      supplies: ARMY.supplies * 2, people: t.people, speed: 'foot', label: `войско ${realmLabelGen(a, realm)}`, color: R?.color || WORLD_PEOPLES.get(t.people).color, burnt: 0});
    if (!p) continue;
    t.pop -= men; A.armies.push(p.id); if (!A.sent.includes(realm)) A.sent.push(realm);
    went.push(`${realmLabel(a, realm)} — ${men} из ${townLabel(t, 2)} ${t.name}`);
  }
  if (went.length) tell(`Союз ${A.tries > 1 ? 'снова ' : ''}выступил на «${lair.name}»: ${went.join('; ')}.`);
  else A.nextTry = a.hist.year + ALLY.retry;
}

// an army of an alliance at the boss's lair (atlas/diplomacy.js BEHAVIOURS.army): it waits there for the others; when
// they are all in, or it has waited long enough, the storm. → true when it handled the day
export function allianceStay(a, p, rnd, say, fall) {
  const A = (a.alliances || []).find(x => x.id === p.ally), lair = a.lairs.find(l => l.id === p.lair);
  if (!A || !lair || !lair.alive) { goHome(a, p); return true; }
  const armies = A.armies.map(id => a.parties.find(q => q.id === id)).filter(q => q && q.state !== 'gone' && q.state !== 'home');
  const waiting = armies.filter(q => q.state === 'stay');
  if (waiting.length < armies.length && p.stay < ALLY.wait) return true;
  if (waiting[0] !== p) return true;   // the first one in storms for them all
  const c = a.calamities.find(x => x.id === A.calamity), L = LAIRS.get(lair.kind);
  const retinue = a.lairs.filter(l => l.alive && l.retinue === c.id).length;
  const boss = lair.strength * power(L.species) * ALLY.boss + ALLY.retinue * retinue;
  const we = waiting.reduce((s, q) => s + q.might, 0) * (0.6 + 0.8 * rnd()), they = boss * (0.6 + 0.8 * rnd());
  const who = names(a, [...new Set(waiting.map(q => q.owner))]);
  if (we > they) {
    for (const q of waiting) { q.men *= 1 - ALLY.loss.won; goHome(a, q); }
    fall(`Войска союза — ${who} — сошлись у «${lair.name}» и взяли его штурмом: ${c.boss.title[0]} ${c.boss.name} пал${c.boss.g === 'f' ? 'а' : ''} в битве.`);
  } else {
    for (const q of waiting) { q.men *= 1 - ALLY.loss.beaten; goHome(a, q); }
    A.nextTry = a.hist.year + ALLY.retry;
    say(`Войска союза — ${who} — разбиты у «${lair.name}»: ${c.boss.title[0]} ${c.boss.name} устоял${c.boss.g === 'f' ? 'а' : ''}. Уцелевшие отходят.`);
  }
  return true;
}

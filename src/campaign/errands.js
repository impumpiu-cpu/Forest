// The errands (data/errands.js; docs/CAMPAIGN.md «Поручения»; plan claude/ver_f-status.md Ф2): what this world can ask of a
// caravan from this capital, and the errand laid out as a quest of the one machine of campaign/quest.js.
//   errandsFor(a, town) — every errand of the list, each with whether the world has it to give and why not
//   makeErrand(a, K, rnd, id) — K.quest for it (the crown and the calamity: their own makers; a lair: here)
//   the hooks the quest machine asks of an errand of a lair: errandReady (before the storm), errandStormed (after it won)
// The world is only read here until the storm is won: then the lair is laid waste, as a realm's town would lay it
// (atlas/deeds/clearLair.js) — its captives go home by the world's own rule (atlas/demography.js freeCaptives).
import {ERRANDS, DEFAULT_ERRAND, ERRAND} from '../data/errands.js';
import {LAIRS} from '../data/lairs.js';
import {QUEST} from '../data/quest.js';
import {YEAR_DAYS} from '../data/seasons.js';
import {CAMPAIGN} from '../data/campaign.js';
import {EPIC} from '../data/calamities.js';
import {townLabel, wherePhrase} from '../atlas/index.js';
import {isAt} from '../atlas/index.js';
import {cellDist, plural} from '../core/util.js';
import {reachable, foot, places, layClues, circle, whereFrom, crownQuest} from './quest.js';
import {makeEpicQuest, epicWorld} from './epic.js';
import {lairGuard} from './land.js';

const lairName = l => `${LAIRS.get(l.kind).label} «${l.name}»`;
const years = n => `${n} ${plural(n, 'год', 'года', 'лет')}`;
export const errandOf = Q => (Q?.errand ? ERRANDS.get(Q.errand) : null);

// a caravan's start as the errands see it: its capital, its people, where home is (K of a campaign, or one only thought of)
const stub = (a, t) => ({home: t.i, people: t.people, realm: t.realm, capital: t.id});

// the lairs an errand of a lair may be sent against, the nearest first: [{l, i (the cell at its foot), d (share of the diagonal)}]
function lairTargets(a, K, E, mask) {
  const diag = Math.hypot(a.w, a.h), out = [];
  for (const l of a.lairs || []) {
    if (!l.alive || l.hidden || l.boss != null) continue;   // (a hidden lair is not known; a boss's seat is the calamity's own)
    const L = LAIRS.get(l.kind); if (!L || L.fiend || L.at === 'town') continue;
    if (E.lairs && !E.lairs.includes(l.kind)) continue;
    if (E.captives && !Object.values(l.captives || {}).some(n => n > 0)) continue;
    if (E.leader && !l.leader) continue;
    const i = foot(a, mask, l.i); if (i < 0) continue;
    const d = cellDist(a, K.home, i) / diag;
    if (d < E.at[0] || d > E.at[1]) continue;
    out.push({l, i, d});
  }
  return out.sort((p, q) => (E.pick === 'far' ? q.d - p.d : p.d - q.d) || p.l.id - q.l.id);
}

// every errand of the list for a caravan from the capital `townId`: {id, tier, label, about, years, gold, ok, why, goal}
//   goal — what it would be sent against (the nearest lair that fits), why — why the world has none to give
export function errandsFor(a, townId) {
  const t = a.towns.find(x => x.id === townId); if (!t) return [];
  const K = stub(a, t), {mask, cells} = reachable(a, K);
  return ERRANDS.all().map(E => {
    const row = {id: E.id, tier: E.tier, label: E.label, about: E.about, years: E.years ?? null, gold: E.gold, ok: false, why: '', goal: null};
    if (!cells.length) { row.why = 'из столицы никуда не дойти'; return row; }
    if (E.how === 'epic') { row.ok = epicWorld(a); row.why = row.ok ? '' : 'в этом мире нет бедствия, которое ещё можно остановить'; return row; }
    if (E.how === 'crown') { row.ok = true; return row; }
    const T = lairTargets(a, K, E, mask)[0];
    if (T) { row.ok = true; row.goal = `${lairName(T.l)}, ${wherePhrase(a, T.l.i)}`; }
    else row.why = E.captives ? 'ни в одном логове в досягаемости не держат пленных' : E.leader ? 'ни у одного логова в досягаемости нет главаря'
      : `в досягаемости нет ${[...new Set((E.lairs || []).map(k => LAIRS.get(k)?.gen).filter(Boolean))].join(', ') || 'подходящих логов'}`;
    return row;
  });
}

// K.quest for the errand `id` (null: the world's own — the crown or the calamity, as before errands were). The deadline
// (Q.until) counts from today. → null when the world has none to give
export function makeErrand(a, K, rnd, id = null) {
  const E = ERRANDS.get(id || DEFAULT_ERRAND(epicWorld(a)));
  let Q = null;
  if (E.how === 'epic') Q = makeEpicQuest(a, K, rnd);
  else if (E.how === 'crown') Q = crownQuest(a, K, rnd);
  else Q = lairErrand(a, K, rnd, E);
  if (!Q) return null;
  Q.errand = E.id; Q.tier = E.tier; Q.from = K.day;
  // the deadline: the row's; the crown's and the calamity's — the campaign's own years (data/campaign.js maxYears, EPIC.years), from
  // today when taken in a later chapter (at the start: none, the campaign's, as before errands were)
  const years = E.years ?? (K.day > 0 ? (Q.epic ? EPIC.years : CAMPAIGN.maxYears) : null);
  if (years) Q.until = K.day + years * YEAR_DAYS;
  return Q;
}

// an errand of a lair: the lair is the goal (stormed, laid waste), its trophy is carried home
function lairErrand(a, K, rnd, E) {
  const {mask, cells} = reachable(a, K);
  const T = lairTargets(a, K, E, mask)[0]; if (!T) return null;
  const {l, i} = T, L = LAIRS.get(l.kind), G = QUEST.guard, s = Math.min(G.max, (G.base + G.perDiag * T.d) * E.guard);
  const guard = L.dragon
    ? {kind: 'lair', strength: s, beast: 'drake', label: `дракон и его выводок — ${lairName(l)}`, seat: l.id, boss: {name: `Дракон логова «${l.name}»`, g: 'm', species: 'drake', add: {...ERRAND.dragon}, mustDie: true}}
    : {...lairGuard(a, l.kind, i, s, l), label: lairName(l)};
  const goal = {kind: L.dragon ? 'dragon' : L.undead ? 'dread' : 'lair', at: l.i, i, label: lairName(l), lair: l.id};
  const clues = E.clueAt.length ? layClues(a, K, rnd, places(a, K, mask).filter(p => p.lair !== l.id), cells, goal, E.clueAt) : [];
  const known = !clues.length;
  const [name, acc, g] = E.trophy;
  const Q = {name, acc, g, how: 'lair', lair: l.id, leader: E.leader ? l.leader?.id ?? null : null, pursuit: E.pursuit,
    story: errandStory(a, E, l), crown: {...goal, guard, area: null, exact: known, seen: false, state: 'lost', carrier: null},
    clues, search: null, stormAt: 0, next: null, found: 0};
  if (clues.length) clues[0].area = circle(a, clues[0].i, QUEST.area, rnd);
  return Q;
}
function errandStory(a, E, l) {
  const L = LAIRS.get(l.kind), who = l.leader ? `${l.leader.title?.[0] || 'главарь'} ${l.leader.name}` : null;
  if (E.leader && who) return `${who} из логова «${l.name}» водит набеги на земли державы.`;
  if (E.captives) return `В логове «${l.name}» держат пленных из земель державы.`;
  if (L.dragon) return `Дракон логова «${l.name}» — беда для всех земель вокруг.`;
  return `${L.label[0].toUpperCase()}${L.label.slice(1)} «${l.name}» не даёт покоя землям державы.`;
}
// how the capital tells its errand of a lair (campaign/quest.js questIntro)
export function errandIntro(a, K, clueHint) {
  const Q = K.quest, E = errandOf(Q), C = Q.crown, c = Q.clues[0];
  const where = C.exact ? `Где оно, знают: ${whereFrom(a, K, K.home, {x: C.i % a.w + 0.5, y: ((C.i / a.w) | 0) + 0.5, r: 0})}.` : c ? `Где оно, точно не знает никто; первый след ищут ${clueHint(a, K, c, K.home)}.` : '';
  return `Их поручение — ${E.label.toLowerCase()}: ${C.label}. ${Q.story} ${where} В доказательство — ${Q.acc[0].toLowerCase()}${Q.acc.slice(1)} в столицу. Срок — ${years(E.years)}.`;
}

// ── the hooks of the quest machine (campaign/quest.js questArrive)
// before the storm of the goal: may it be stormed now? A leader to be killed must be at home; one dead already makes the
// errand a lair's to lay waste; a lair already laid waste by another hand gives its trophy up without a fight
export function errandReady(a, K, here, say) {
  const Q = K.quest; if (Q?.how !== 'lair' || here !== Q.crown) return true;
  const l = (a.lairs || []).find(x => x.id === Q.lair);
  if (!l?.alive) {
    if (here.guard) { here.guard = null; say(`${cap(here.label)}: разорено без них — ${Q.acc[0].toLowerCase()}${Q.acc.slice(1)} нашли на пепелище.`, 'quest'); }
    return true;
  }
  if (Q.leader == null) return true;
  if (!l.leader || l.leader.id !== Q.leader) { lesser(Q); say(`Главарь логова «${l.name}» пал не от их руки. Поручение — разорить само логово: в столицу понесут его знамя.`, 'quest'); return true; }
  if (isAt(l.leader, 'lair', l.id)) return true;
  if (!(here.rest > K.day)) { here.rest = K.day + ERRAND.wait; here.restWhy = 'away'; if (!Q.waited) say(`${l.leader.name} не дома — ушёл из логова со своими. Совет решил ждать его возвращения неподалёку.`, 'quest'); Q.waited = true; }
  return false;
}
// the leader's head not to be had: the lair's banner instead, and half the pay (data/errands.js gold)
function lesser(Q) { Q.leader = null; Q.name = 'Знамя логова'; Q.acc = 'Знамя логова'; Q.g = 'n'; Q.half = true; }
const cap = s => s[0].toUpperCase() + s.slice(1);

// the storm of the goal won: the lair laid waste in the world (its captives go home by the world's rule), the leader's fate
// already told by the fight (campaign/march.js worldOutcome); a leader who got away leaves a lesser trophy
export function errandStormed(a, K, say) {
  const Q = K.quest; if (Q?.how !== 'lair') return;
  const l = (a.lairs || []).find(x => x.id === Q.lair), t = a.towns.find(x => x.id === K.capital);
  if (l?.alive) {
    l.alive = false; l.died = a.hist.year; l.clearedBy = K.capital;
    const L = LAIRS.get(l.kind), freed = Object.values(l.captives || {}).reduce((s, n) => s + n, 0);
    say(`Караван ${t ? `${townLabel(t, 2)} ${t.name}` : ''} разорил ${L.labelAcc || L.label} «${l.name}» ${wherePhrase(a, l.i)}${freed ? `: пленные — ${freed} — возвращаются по домам` : ''}.`.replace('Караван  ', 'Караван '), 'quest', true);
  }
  if (Q.leader != null && l?.leader?.id === Q.leader && !l.leader.captive) {   // it got away from the storm: the lair is gone, the head is not
    lesser(Q);
    say(`Главарь ушёл живым — вместо его головы в столицу понесут знамя логова.`, 'quest');
  }
}

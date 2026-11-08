// The epic campaign's quest (data/calamities.js EPIC; docs/CAMPAIGN.md). In an epic world
// (a.artifact) the quest is the world's own story: the artifact the god left at the dawn went through three bosses and
// lay in the last one's grave; now a fourth gathers its servants at a far seat with the artifact, and in `doom` years its
// calamity will rise. The three graves are the clues — each read tells where the lair is (the circle narrows as in the
// quest of any world: campaign/quest.js) and where another grave lies; a miniboss of the old retinue guards each, and
// sends its servants after the caravan while it lives. The lair of the fourth is the goal: stormed, with the boss on the
// local map; the boss must die. The further on, the darker: omens over the world after the first clue, a hunt from the
// lair after the second, an active hunt and the first towns burning after the third.
//
// Q (as campaign/quest.js) + {epic: true, calamity, hunt (0 … 2), nextHunt, started}; a clue: + {epitaph, grave,
//   mini: {name, add}, nextServ}; the crown (the lair): kind 'seat', guard.boss: {name, add}
import {scaleOf} from '../atlas/index.js';
import {killShare} from '../atlas/index.js';
import {LAIRS} from '../data/lairs.js';
import {SPECIES} from '../data/species.js';
import {EPIC} from '../data/calamities.js';
import {SEASON_DAYS} from '../data/atlas.js';
import {BUBBLE} from '../data/bubble.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {gatherFourth, tell as tellWorld, fallToCaravan, questCalamity, questHint} from '../atlas/index.js';
import {wherePhrase} from '../atlas/index.js';
import {raidGraves} from '../atlas/index.js';
import {townLabel} from '../atlas/index.js';
import {reachable, foot, circle} from './quest.js';
import {overSea} from './ferry.js';
import {lairGuard} from './land.js';
import {bubbleOf, cellAt} from './bubble.js';
import {QUEST} from '../data/quest.js';
import {plural, cellDist} from '../core/util.js';

// a word by gender: masculine, feminine, neuter
const G3 = (g, m, f, n) => (g === 'f' ? f : g === 'n' ? n : m);
const years = n => `${n} ${plural(n, 'год', 'года', 'лет')}`;
const xy = (a, i) => [i % a.w + 0.5, ((i / a.w) | 0) + 0.5];
const dist = cellDist;   // (core/util.js)
const between = (r, [lo, hi]) => lo + r() * (hi - lo);

// the seats where a fourth may gather: prepared once for the world, far from each other, the graves and the towns
export function seats(a) {
  if (a.seats) return a.seats;
  const r = mulberry(seedNumber(`${a.cfg.seed}:atlas:seats`)), out = [], k = scaleOf(a);
  const land = i => a.f.land[i] && !a.f.ocean[i] && a.f.temp[i] >= EPIC.cold, townNear = i => (a.towns || []).some(t => t.alive && dist(a, t.i, i) < EPIC.seatGap * k);
  const cand = [];
  for (let n = 0; n < 1500; n++) { const i = (r() * a.n) | 0; if (land(i) && !townNear(i)) cand.push(i); }
  // farthest-point picks: each the farthest from those picked and from the graves
  const from = [...(a.graves || []).map(g => g.i)];
  while (out.length < EPIC.seats && cand.length) {
    let best = -1, bd = -1;
    for (const i of cand) { const d = from.length ? Math.min(...from.map(j => dist(a, i, j))) : r(); if (d > bd) { bd = d; best = i; } }
    out.push(best); from.push(best); cand.splice(cand.indexOf(best), 1);
  }
  return (a.seats = out);
}

// who guards a place of the old calamities: the band of its lair's kind and its ruler's summoned, as any lair's seat
// (campaign/land.js lairGuard); strength by the distance from home
function guardFor(a, K, lairKind, i, x = 1) {
  const G = EPIC.guard, diag = Math.hypot(a.w, a.h);
  return lairGuard(a, lairKind, i, Math.min(G.max, (G.base + G.perDiag * dist(a, K.home, i) / diag) * x));
}
const grown = (r, M) => Object.fromEntries(['S', 'E', 'A'].map(id => [id, Math.round(between(r, M.add))]));

// ── the quest is laid out when the caravan sets out
// (a world of «Заселение мира», docs/CAMPAIGN.md: a calamity the hand set that has not passed yet is the quest
// itself — atlas/calamity.js questCalamity; with none, the graves of its bosses and a fourth, as in an epic world)
export const epicWorld = a => !!questHint(a);

// the walk's cell nearest a place that `ok` takes (−1: none)
function nearestFree(a, cells, i, ok) {
  let best = -1, bd = Infinity;
  for (const j of cells) { const d = dist(a, i, j); if (d < bd && ok(j)) { bd = d; best = j; } }
  return best;
}

export function makeEpicQuest(a, K, rnd) {
  const {mask, cells} = reachable(a, K), hint = questHint(a);
  // (the artifact brought home by a caravan before: the world's story is told — a quest of any world, campaign/quest.js)
  if (!cells.length || !hint) return null;
  // a fourth (or a calamity of the hand) still alive from a caravan before (lost, or out of its years): the new caravan goes after the same
  let old = a.calamities.find(c => (c.era === 'after' || c.quest) && c.phase !== 'fallen');
  // the seat: the farthest the caravan can walk to, at least EPIC.far of the diagonal if any is
  const S = seats(a).map(i => ({i, at: foot(a, mask, i, 4)})).filter(s => s.at >= 0).sort((p, q) => dist(a, K.home, q.at) - dist(a, K.home, p.at));
  const seat = S[0] || {i: cells.reduce((b, c) => (dist(a, K.home, c) > dist(a, K.home, b) ? c : b), K.home)};
  seat.at ??= seat.i;
  // a calamity of the hand: where it stands (risen) or will gather (the hand's cell) must be within the caravan's walk —
  // one still waiting gathers at the far seat instead, one risen beyond reach leaves the quest to the crown of any world
  if (!old && hint.kind === 'hand') {
    const c = a.calamities.find(x => x.id === hint.calamity);
    const place = c.phase === 'rise' ? c.i : c.at >= 0 ? c.at : seat.at;
    if (foot(a, mask, place, 6) < 0) { if (c.phase === 'rise') return null; c.at = -1; }
    old = questCalamity(a, c, seat.at);
  }
  if (old) {
    const at = foot(a, mask, old.i, 6);
    if (at < 0) return null;   // (a calamity of a caravan before, out of this capital's walk)
    seat.i = old.i; seat.at = at;
  }
  const c4 = old || gatherFourth(a, seat.at, EPIC.doom), lair = a.lairs.find(l => l.id === c4.lair), A = a.artifact;
  // the graves: each a clue, guarded by a miniboss of its boss's retinue
  const clues = [], sea = overSea(a, K, mask) || mask;   // (a grave over the water is sought there: the ferry — campaign/ferry.js)
  for (const g of a.graves || []) {
    const c = a.calamities.find(x => x.id === g.calamity), gl = a.lairs.find(l => l.id === c?.lair);
    // a grave the caravan cannot reach even by a ferry (no boats at the sea on its land) or on a place taken already (the
    // seat, another clue): its clue is a cenotaph — the stone of its epitaph raised on the walk's nearest free cell to it,
    // guarded the same
    let at = foot(a, sea, g.i, 6), far = false;
    const free = j => j >= 0 && dist(a, j, seat.at) >= EPIC.clueApart && clues.every(x => dist(a, j, x.i) >= EPIC.clueApart);
    if (at < 0 || at === seat.at || clues.some(x => x.i === at)) { at = nearestFree(a, cells, g.i, free); far = true; if (at < 0) continue; }
    const retinue = gl ? (LAIRS.get(gl.kind)?.species || c.boss.species) : c.boss.species, sp = SPECIES.get(retinue);
    const whose = `${c.boss.title[1].toLowerCase()} по имени ${c.boss.name}`;
    const guard = {...guardFor(a, K, gl?.kind || 'wights', at), label: `${sp?.plural || 'слуги'} былой свиты у могилы`, boss: {name: `Страж могилы — ${sp?.label || retinue}`, species: retinue, add: grown(rnd, EPIC.mini)}};
    clues.push({k: clues.length, kind: 'grave', at: far ? at : g.i, i: at, tomb: g.i, label: far ? `кенотаф: ${whose} лежит далеко отсюда` : `могила ${whose}`, far, town: null, guard, area: null, seen: false, found: false,
      epitaph: g.epitaph, grave: g.calamity, nextServ: 0});
  }
  // the order: the nearest to home first known
  clues.sort((p, q) => dist(a, K.home, p.i) - dist(a, K.home, q.i)).forEach((x, k) => { x.k = k; });
  const guard = {...guardFor(a, K, lair.kind, seat.at, EPIC.guard.seat), label: `логово «${lair.name}» — ${c4.boss.title[0]} ${c4.boss.name} и ${c4.boss.g === 'f' ? 'её' : 'его'} слуги`,
    boss: {name: `${c4.boss.title[0]} ${c4.boss.name}`, g: c4.boss.g, species: c4.boss.species, add: grown(rnd, EPIC.boss), mustDie: true}};
  const Q = {name: A.name, acc: A.acc, g: A.g, epic: true, calamity: c4.id, hunt: 0, nextHunt: null, started: K.day, base: guard.strength,
    story: c4.era !== 'after' ? handStory(a, c4, clues.length) : `${A.name} — дар бога, сотворившего мир. ${G3(A.g, 'Он', 'Она', 'Оно')} прош${G3(A.g, 'ёл', 'ла', 'ло')} через три бедствия и лежал${G3(A.g, '', 'а', 'о')} в могиле последнего; теперь ${A.g === 'f' ? 'её' : 'его'} держит ${c4.boss.title[0]} ${c4.boss.name}, и ${c4.phase === 'rise' ? `новое бедствие — ${c4.label} — уже идёт` : `через ${years(Math.max(1, c4.riseAt - a.hist.year))} начнётся новое бедствие — ${c4.label}`}. Могилы старых боссов хранят, где искать.`,
    crown: {kind: 'seat', at: seat.at, i: seat.at, label: `логово «${lair.name}»`, guard, area: null, exact: false, seen: false, state: 'lost', carrier: null},
    clues, search: null, stormAt: 0, next: null, found: 0};
  if (clues.length) clues[0].area = circle(a, clues[0].i, QUEST.area, rnd);
  else Q.crown.area = circle(a, seat.at, QUEST.narrow[0], rnd);
  return Q;
}

// the story of a quest after a calamity of «Заселение мира»
function handStory(a, c, graves) {
  const A = a.artifact, n = (a.graves || []).length, who = `${c.boss.title[0]} ${c.boss.name}`;
  return `${A.name} — дар бога, сотворившего мир.${n ? ` ${G3(A.g, 'Он', 'Она', 'Оно')} прош${G3(A.g, 'ёл', 'ла', 'ло')} через ${n} ${plural(n, 'бедствие', 'бедствия', 'бедствий')}.` : ''} Теперь ${A.g === 'f' ? 'её' : 'его'} держит ${who}, и ` +
    `${c.phase === 'rise' ? `бедствие — ${c.label} — уже идёт ${wherePhrase(a, c.i)}` : `через ${years(Math.max(1, c.riseAt - a.hist.year))} начнётся бедствие — ${c.label}`}. ` +
    (graves ? 'Могилы старых боссов хранят, где искать.' : 'Где логово, расскажут беглецы и следы: круг поиска сужается в пути.');
}

// ── a clue read: the epitaph; the darkening goes a step on
export const graveLine = c => `${c.far ? 'На кенотафе — памятном камне, поставленном свитой там, куда ей было дойти до могилы, —' : 'На могиле'} прочли надпись: «${c.epitaph}»`;

// ── every day of an epic quest: the lair grows, the minibosses send their servants, the hunt
export function epicDay(a, K, r, say) {
  const Q = K.quest; if (!Q?.epic) return;
  const c4 = a.calamities.find(c => c.id === Q.calamity), G = EPIC.guard, H = EPIC.hunt;
  // the lair's servants gather month by month; once the calamity has risen the boss is stronger
  if (Q.crown.kind === 'seat' && Q.crown.state === 'lost' && Q.crown.guard) {   // (not the camp of a band that took it on the way home)
    const months = (K.day - Q.started) / SEASON_DAYS, risen = c4?.phase === 'rise' ? G.risen : 1;
    Q.crown.guard.strength = Math.min(G.max * risen, Q.base * (1 + G.grow * months) * risen);
    if (c4?.phase === 'rise' && !Q.risenTold) { Q.risenTold = true; Q.risenDay = K.day; say(`Пришла весть: ${c4.boss.title[0]} ${c4.boss.name} выступил${c4.boss.g === 'f' ? 'а' : ''} — началось новое бедствие. ${c4.boss.g === 'f' ? 'Её' : 'Его'} логово теперь стерегут злее.`, 'quest', false); }
  }
  // the darkening by the clues found
  // (a quest with no graves to read — a calamity of «Заселение мира» with none before it — darkens with the months)
  const want = Q.clues.length ? (Q.found >= 3 ? 3 : Q.found) : Math.min(3, Math.floor((K.day - Q.started) / EPIC.darkDays));
  while ((Q.dark || 0) < want) { Q.dark = (Q.dark || 0) + 1; darken(a, K, Q, c4, Q.dark, say); }
  Q.hunt = Q.dark >= H.from[1] ? 2 : Q.dark >= H.from[0] ? 1 : 0;
  if (K.inTown || Q.crown.state === 'carried') return;
  // the hunt from the lair
  if (Q.hunt && K.day >= (Q.nextHunt ?? 0)) {
    Q.nextHunt = K.day + Math.round(H.every[Q.hunt - 1] * (EPIC.jitter[0] + EPIC.jitter[1] * r()));
    const lair = a.lairs.find(l => l.id === c4?.lair);
    if (lair?.alive) send(a, K, r, Q.crown.guard.kind, Q.crown.guard, `погоня: слуги ${c4.boss.title[1].toLowerCase()} ${c4.boss.name}`, Q.base * H.strength[Q.hunt - 1], say);
  }
  // the minibosses send their servants while they live and the caravan is near their grave
  const near = EPIC.mini.near * scaleOf(a);
  for (const c of Q.clues) {
    if (c.found || !c.guard || K.day < c.nextServ || Math.hypot(xy(a, c.i)[0] - K.x, xy(a, c.i)[1] - K.y) > near) continue;
    c.nextServ = K.day + Math.round(EPIC.mini.every * (EPIC.jitter[0] + EPIC.jitter[1] * r()));
    send(a, K, r, c.guard.kind, c.guard, `слуги: ${c.guard.boss.name.toLowerCase()}`, c.guard.strength * EPIC.mini.servants, say);
  }
}

// a band on the caravan's trail, from the edge of the bubble
function send(a, K, r, kind, who, label, strength, say) {
  const B = bubbleOf(K), far = BUBBLE.far * scaleOf(a);
  if (B.things.filter(t => t.pursuit).length >= EPIC.hunt.most) return;
  for (let k = 0; k < 12; k++) {
    const ang = r() * Math.PI * 2, x = K.x + Math.cos(ang) * far, y = K.y + Math.sin(ang) * far;
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
    const i = cellAt(a, x, y); if (!a.f.land[i] || a.f.ocean[i]) continue;
    B.things.push({id: B.next++, x, y, i, born: K.day, sated: -1, seen: false, hunting: true, strength: Math.min(EPIC.guard.max, strength), pursuit: true, kind, src: label.startsWith('слуги') ? 'mini' : 'hunt',
      label, ...(who.band ? {band: who.band} : {}), ...(who.beast ? {beast: who.beast} : {})});
    K.stats.pursuers = (K.stats.pursuers || 0) + 1;
    if (r() < EPIC.hunt.told) say(`За караваном идут ${label.startsWith('слуги: ') ? `слуги — ${label.slice(7)}` : label.replace(/^погоня: /, '')}.`, 'sight');
    return;
  }
}

// the darkening, a step at a time: told in the campaign's chronicle and in the world's
function darken(a, K, Q, c4, step, say) {
  if (!c4) return;
  const who = `${c4.boss.title[0]} ${c4.boss.name}`, lair = a.lairs.find(l => l.id === c4.lair);
  if (step === 1) {
    const t = `Над миром недобрые знаки: звери уходят из своих краёв, набеги чудовищ чаще, державы косятся друг на друга. Говорят, это ${who} собирает силы.`;
    say(t, 'quest', false); tellWorld(a, t, c4);
    if (lair) lair.strength = Math.min(1, lair.strength + EPIC.darkLair);
  } else if (step === 2) {
    say(`${who} узнал${c4.boss.g === 'f' ? 'а' : ''}, что за артефактом идут: из логова «${lair?.name}» вышли охотники по следу каравана.`, 'quest', true);
  } else if (step === 3) {
    // the active hunt, and the first town burns
    const t = (a.towns || []).filter(x => x.alive).sort((p, q) => dist(a, p.i, c4.i) - dist(a, q.i, c4.i))[0];
    if (t) { killShare(a, t, EPIC.hunt.burn, 'calamity'); raidGraves(a, t); }
    const line = `Слуги ${c4.boss.title[1].toLowerCase()} ${c4.boss.name} рыщут по всему краю${t ? ` и сожгли окраины ${townLabel(t, 2)} ${t.name}` : ''}: все ближние логова вышли на след каравана.`;
    say(line, 'quest', false); tellWorld(a, line, c4);
  }
}

// ── the storm of the lair won: the boss is dead, the artifact is the caravan's (campaign/quest.js takeCrown)
export function epicTaken(a, K, carrierName) {
  const Q = K.quest, c4 = a.calamities.find(c => c.id === Q.calamity);
  if (!c4 || c4.phase === 'fallen') return;
  fallToCaravan(a, c4, `Караван ${K.capitalFrom || K.capitalName} взял штурмом логово ${wherePhrase(a, c4.i)}: ${c4.boss.title[0]} ${c4.boss.name} пал${c4.boss.g === 'f' ? 'а' : ''}, ${a.artifact.name} теперь несёт ${carrierName}.`);
}

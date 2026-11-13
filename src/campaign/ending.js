// The end of a campaign and its epilogue (data/epilogue.js). When the crown comes home, when none of the eight
// is left, or after twenty-five years on the road, the campaign is over — but the world goes on: for a few
// seasons more it lives on with the caravan's ending in it, and the fates of those who walked are told,
// a few lines a season. A crown brought home strengthens its realm in the world (its capital grows, the realms
// that know it think better of it, the crown stays its relic); a lost caravan is a line of the world's
// chronicle. When the epilogue is told, the campaign goes into the world's archive (a.campaignsDone): its
// chronicle stays with the world, and another caravan may set out.
import {drawTo} from '../atlas/index.js';
import {memberFate} from '../atlas/index.js';
import {stepHistory} from '../atlas/index.js';
import {townLabel} from '../atlas/index.js';
import {realmLabel, realmLabelGen, realmTowns} from '../atlas/index.js';
import {relation} from '../atlas/index.js';
import {SPECIES} from '../data/species.js';
import {RETINUE, inLine} from '../data/campaign.js';
import {EPILOGUE, FATES, fate} from '../data/epilogue.js';
import {draw} from './start.js';
import {say, isCore, rank, handedOf} from './march.js';
import {perkLabel} from './perks.js';
import {woundLabel} from './maims.js';
import {ERRANDS, ERRAND} from '../data/errands.js';
import {errandOf} from './errands.js';
import {plural} from '../core/util.js';

const cap = s => s[0].toUpperCase() + s.slice(1);
const SIDES = ['на восток', 'на юго-восток', 'на юг', 'на юго-запад', 'на запад', 'на северо-запад', 'на север', 'на северо-восток'];
const cases = t => t ? [0, 1, 2, 3, 4].map(k => `${townLabel(t, k)} ${t.name}`) : ['родные края', 'родные края', 'родных краёв', 'родных краях', 'родными краями'];

// the words a fate is told with
function words(a, K, m, r) {
  const capital = a.towns.find(t => t.id === K.capital && t.alive) || null, towns = K.realm ? realmTowns(a, K.realm) : [];
  const Q = K.quest, town = towns.length ? towns[(r() * towns.length) | 0] : capital;
  // the errand's words: the crown's (and the calamity's) as before; a lair's — its trophy; a campaign of chapters — its errands
  const many = (K.done?.length || 0) > 1, lair = Q?.how === 'lair';
  const E = many ? {keeps: 'трофеев', tales: 'о своих походах', about: 'о походах', sought: 'славы'} : lair ? {keeps: 'трофея', tales: 'о походе', about: 'о походе', sought: 'славы'} : {keeps: 'короны', tales: 'о походе за короной', about: 'о короне', sought: 'короны'};
  return {...E, g: (male, female) => (m.gender === 'f' ? female : male), town: cases(town), capital: cases(capital), crown: Q?.name || 'корона', crownAcc: lair ? `${Q.crown.label}` : Q?.acc || Q?.name || 'корону',
    knights: RETINUE[K.people].title[1], where: SIDES[(r() * SIDES.length) | 0], race: SPECIES.get(m.race)?.label || m.race};
}

// the crown, when it did not come home
function crownFate(a, K) {
  const Q = K.quest; if (!Q) return null;
  const C = Q.crown, g = (m, f, n) => (Q.g === 'm' ? m : Q.g === 'n' ? n : f);   // (a crown of an old save has no gender: feminine)
  if (C.state === 'carried') return `${Q.name} ${g('пропал', 'пропала', 'пропало')} вместе с остатками каравана: где ${g('он', 'она', 'оно')} теперь, не знает никто.`;
  if (C.state === 'taken') return `${Q.name} ${g('остался', 'осталась', 'осталось')} у врагов: ${C.label}.`;
  return `${Q.name} так и лежит там, где ${g('лежал', 'лежала', 'лежало')}: ${C.label}.`;
}

// what the world makes of an errand handed in at the capital (→ the line of the chronicle): the crown — the capital's relic, people
// flock to it (EPILOGUE.crown.pop × its people, drawn from the realm: atlas/demography.js drawTo), the realms that know the realm
// think better of it; a lair laid waste — the realms think better of it by its tier (EPILOGUE.errand.att per tier)
export function homeReward(a, K, capital) {
  const Q = K.quest, E = EPILOGUE.crown, R = (a.realms || []).find(x => x.id === K.realm), at = capital ? `${townLabel(capital, 3)} ${capital.name}` : 'столице';
  const befriend = att => { let n = 0; if (R) for (const o of a.realms) { const rel = o.id !== R.id && relation(a, R.id, o.id); if (rel) { rel.att = Math.min(E.attMax, rel.att + att); n++; } } return n; };
  if (Q?.how === 'lair') {
    const n = befriend(EPILOGUE.errand.att * (Q.tier || 1));
    return `В ${at} чествуют караван: ${Q.crown.label} больше не тревожит земли державы${R ? ` ${realmLabelGen(a, R.id)}` : ''}${n ? '; соседи слышат о том с уважением' : ''}.`;
  }
  if (capital) { drawTo(a, capital, capital.pop * (E.pop - 1)); capital.relic = {name: Q?.name || 'корона', year: a.hist.year}; }
  if (R) R.crown = {name: Q?.name || 'корона', year: a.hist.year};
  const friends = befriend(E.att);
  return `В ${at} празднуют возвращение короны. Слава державы ${R ? realmLabelGen(a, R.id) : ''} растёт${friends ? `; ${friends === 1 ? 'соседи ищут' : 'соседние державы ищут'} с ней дружбы` : ''}, в столицу тянутся новые жители.`.replace('державы  растёт', 'державы растёт');
}
const homeTown = (a, K) => a.towns.find(t => t.id === K.capital && t.alive) || a.towns.filter(t => t.alive && t.realm != null && t.realm === K.realm).sort((p, q) => (q.capital ? 1 : 0) - (p.capital ? 1 : 0) || q.pop - p.pop)[0];

// ── a campaign of chapters (K.chapters: the screen's; plan claude/ver_f-status.md Ф2): the errand handed in at the capital does not
// end the campaign — the world rewards it now, the capital pays, and the caravan waits there (K.phase 'home') for the player's
// word: another errand (campaign/index.js nextErrand) or the end (endCampaign: the epilogue, the ascension)
export function handIn(a, K) {
  const Q = K.quest, E = errandOf(Q), capital = homeTown(a, K);
  const A = a.artifact;
  if (Q?.epic && A?.holder.kind === 'caravan') { A.holder = {kind: 'capital', town: capital?.id ?? K.capital}; A.trail.push({year: a.hist.year, era: a.hist.era, i: A.i, text: 'принесён караваном в столицу'}); }
  const text = homeReward(a, K, capital);
  const gold = E ? Math.round(E.gold * (Q.half ? ERRAND.lesser : 1)) : 0;
  K.gold = Math.round((K.gold + gold) * 10) / 10;
  Q.handed = true;
  (K.done ||= []).push({errand: Q.errand || null, contract: Q.contract || null, tier: Q.tier || null, label: E?.label || 'поручение', name: Q.name, goal: Q.crown?.label || null, from: Q.from ?? 0, day: K.day, year: a.hist.year, gold});
  say(a, K, `Поручение исполнено — ${(E?.label || 'поручение').toLowerCase()}. ${text}${gold ? ` Столица платит каравану ${gold} зол.` : ''}`, 'home', true);
  K.phase = 'home';
}

// ── a campaign of chapters, the errand failed (the author's word 11.11, claude/ver_f-status.md): its deadline past on the way
// there — the caravan goes home on its own feet with nothing («возвращаются ни с чем»: the road home is still a story — fights,
// camps, towns; no pursuit, no trophy), the realms that know the capital's realm think worse of it (data/errands.js ERRAND.fail),
// and at the capital the player's word waits again: another errand, or the end
export function failErrand(a, K) {
  const Q = K.quest, E = errandOf(Q), F = ERRAND.fail;
  Q.failed = {day: K.day, year: a.hist.year, why: 'срок'};
  K.phase = 'empty'; K.goal = K.home; K.path = null; K.via = null; K.viaWhy = null; K.camp = 0;
  if (K.bubble) K.bubble.things = K.bubble.things.filter(t => !t.pursuit);   // (no one hunts a caravan that carries nothing)
  let cooled = 0;
  for (const [k, rel] of Object.entries(a.rel || {})) {
    const [p, q] = k.split(':').map(Number); if (p !== K.realm && q !== K.realm) continue;
    if ((rel.att ?? 0) > F.floor) { rel.att = Math.max(F.floor, rel.att - F.att); cooled++; }   // (never pushed into enmity by it alone)
  }
  say(a, K, `Срок поручения вышел: ${(E?.label || 'поручение').toLowerCase()} — ${Q.crown?.label || 'цель'} — так и не исполнено. Караван возвращается в столицу ни с чем${cooled ? '; соседние державы думают о столице хуже' : ''}.`, 'end', true);
}
// home with nothing: the failure told at the capital, no pay; the player's word waits (as after an errand handed in)
export function emptyHome(a, K, t = homeTown(a, K), ms = K.members.filter(m => m.alive)) {
  const Q = K.quest, E = errandOf(Q);
  (K.done ||= []).push({errand: Q?.errand || null, contract: Q?.contract || null, tier: Q?.tier || null, label: E?.label || 'поручение', name: Q?.name, goal: Q?.crown?.label || null, from: Q?.from ?? 0, day: K.day, year: a.hist.year, gold: 0, failed: true, why: Q?.failed?.why || null});
  say(a, K, `Караван вернулся в ${t ? `${townLabel(t, 1)} ${t.name}` : 'родные края'} ни с чем: ${ms.length} ${plural(ms.length, 'человек', 'человека', 'человек')}. Поручение провалено — ${(E?.label || 'поручение').toLowerCase()}; столица не платит.`, 'home', true);
  K.phase = 'home';
}

// once, when the campaign has just ended: the world's consequences and the fates to tell
export function finish(a, K) {
  if (K.epilogue) return;
  const {r, done} = draw(K, 'epilogue'), lines = [], Q = K.quest, E = EPILOGUE.crown;
  // home: the capital it set out from, or — burnt while the caravan was away — its realm's seat now, or its realm's biggest town
  const capital = homeTown(a, K);
  // the artifact of an epic quest: home in the capital when the caravan came back with it; lost where the caravan fell
  // or gave up — free again for the next boss to take and the next caravan to seek (atlas/calamity.js questHint)
  const A = a.artifact;
  if (Q?.epic && A?.holder.kind === 'caravan' && !Q.handed) {
    if (K.phase === 'won') { A.holder = {kind: 'capital', town: capital?.id ?? K.capital}; A.trail.push({year: a.hist.year, era: a.hist.era, i: A.i, text: 'принесён караваном в столицу'}); }
    else { const i = Math.min(a.n - 1, Math.floor(K.y) * a.w + Math.floor(K.x)); A.holder = {kind: 'lost'}; A.i = i; A.trail.push({year: a.hist.year, era: a.hist.era, i, text: 'потерян вместе с караваном'}); }
  }
  // the persons of the world among its members go back to the world (atlas/persons.js memberFate): a captive brought home is
  // held at the capital; the rest — one unbound, one who joined — go their own ways (a caravan lost let them go already: march.js)
  if (K.phase !== 'lost') for (const m of K.members.filter(x => x.alive && x.person != null)) memberFate(a, m, m.captive && K.phase === 'won' ? 'kept' : 'freed', capital || null);
  const used = new Set(), tellFate = (m, list) => { const w = words(a, K, m, r); m.fate = fate(r, list, used)(m, w); lines.push({text: m.fate, who: [m.id]}); };
  if (K.phase === 'won') {
    // the crown home: people of the realm's towns flock to the capital (E.pop × its people: drawn from them, not made —
    // atlas/demography.js drawTo), the realms that know the realm think better of it
    if (handedOf(K).length) lines.push({text: `В ${capital ? `${townLabel(capital, 3)} ${capital.name}` : 'столице'} встречают караван, исполнивший ${handedOf(K).length} ${plural(handedOf(K).length, 'поручение', 'поручения', 'поручений')}: ${handedOf(K).map(d => d.label.toLowerCase()).join(', ')}.`, world: true});
    else lines.push({text: homeReward(a, K, capital), world: true});
    for (const m of K.members.filter(x => x.alive)) tellFate(m, m.captive ? FATES.captive.won : isCore(m) ? FATES.won[inLine(m) ? 'knight' : 'squire'] : FATES.won.other);
    const fallen = K.members.filter(m => isCore(m) && m.died);
    if (fallen.length) lines.push({text: `У ворот ${capital ? `${townLabel(capital, 2)} ${capital.name}` : 'столицы'} поставили камень в память о тех, кто не вернулся: ${fallen.map(m => `${m.name}, ${rank(K, m)}`).join('; ')}.`, who: fallen.map(m => m.id)});
  } else {
    const survivors = K.phase === 'lost' ? K.members.filter(m => (K.lostWith || []).includes(m.id)) : K.members.filter(m => m.alive);
    for (const m of survivors) tellFate(m, m.captive ? FATES.captive.lost : K.phase === 'lost' ? FATES.lost : FATES.timeout);
    if (K.phase === 'lost' && !survivors.length) lines.push({text: 'Из каравана не вернулся никто; о том, где он сгинул, рассказали лишь купцы на дорогах.'});
    const cf = crownFate(a, K); if (cf) lines.push({text: cf, world: true});
    lines.push({text: `${capital ? `В ${townLabel(capital, 3)} ${capital.name}` : 'На родине'} долго ждали караван. ${K.realm ? `${cap(realmLabel(a, K.realm))} помнят` : 'Помнят'} ушедших: ${K.members.filter(isCore).map(m => m.name).join(', ')}.`, world: true});
  }
  // who they became (Ver_E Э5): the level, the perks, the maims of each of the company who went the road, alive or fallen —
  // one line, after the fates (the line, not a draw: the stream above is untouched)
  const became = K.members.filter(m => !m.captive && (m.level || 1) > 1).map(m => {
    const perks = (m.perks || []).map(p => perkLabel(p.id, p.rank)), scars = (m.wounds || []).filter(x => x.day == null).map(x => woundLabel(x.id));
    return `${m.name}${m.died ? ' (пал)' : ''} — ${m.level}-й уровень${perks.length ? `, ${perks.join(', ')}` : ''}${scars.length ? `; ${scars.join(', ')}` : ''}`;
  });
  if (became.length) lines.push({text: `Кем они стали за дорогу: ${became.join('; ')}.`, who: K.members.filter(m => !m.captive && (m.level || 1) > 1).map(m => m.id)});
  done();
  // the lines go out over the seasons of the epilogue, the most important first
  K.epilogue = {left: EPILOGUE.seasons, queue: lines, done: false};
}

// a season of the world after the end: history goes on, a few fates are told; then the archive
export function stepEpilogue(a, K) {
  const E = K.epilogue; if (!E || E.done) return;
  if (a.hist.step >= a.hist.end) a.hist.end = a.hist.step + 1;
  K.track = [];
  stepHistory(a);
  E.left--;
  const n = E.left <= 0 ? E.queue.length : Math.min(EPILOGUE.perSeason, Math.ceil(E.queue.length / Math.max(1, E.left + 1)));
  for (const l of E.queue.splice(0, n)) say(a, K, l.text, 'epilogue', !!l.world, l.who);
  if (E.left <= 0) { E.done = true; archive(a, K); }
}

// the finished campaign kept with the world: its chronicle and how it ended
export function archive(a, K) {
  const Q = K.quest;
  (a.campaignsDone ||= []).push({
    from: K.capitalFrom || K.capitalName, capital: K.capital, people: K.people, realm: K.realm, phase: K.phase,
    crown: Q?.name || null, clues: Q?.found ?? 0, errand: Q?.errand || null, errands: K.done ? K.done.map(d => ({...d})) : null, started: K.started, ended: {year: a.hist.year, season: a.hist.season}, days: K.day,
    // the people by their ids (the lines and the company's story name them so: two of one name stay two)
    members: K.members.map(m => ({id: m.id, name: m.name, gender: m.gender, race: m.race, role: m.role, core: isCore(m), rank: rank(K, m), level: m.level || 1, perks: (m.perks || []).map(p => ({id: p.id, rank: p.rank})), maims: m.maims || 0, died: m.died || null, left: m.left || null, fate: m.fate || null, ...(m.local ? {local: {likes: m.local.likes, dislikes: m.local.dislikes, traits: m.local.traits}} : {})})),
    log: K.log.map(l => ({day: l.day, year: l.year, season: l.season, kind: l.kind, text: l.text, ...(l.who ? {who: [...l.who]} : {})})),
    // the company's story as it ended (campaign/social.js): the bonds and their reasons, the facts they point to, the promises
    // closed, the meetings at the fire — the finished campaign's, kept; no new mechanics rides on it
    ...(K.social ? {social: structuredClone({relations: K.social.relations, why: K.social.why, facts: K.social.facts, commitments: K.social.commitments, meetings: K.social.meetings || []})} : {}),
  });
}

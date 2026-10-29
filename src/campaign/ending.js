// The end of a campaign and its epilogue (data/epilogue.js). When the crown comes home, when none of the eight
// is left, or after twenty-five years on the road, the campaign is over — but the world goes on: for a few
// seasons more it lives on with the caravan's ending in it, and the fates of those who walked are told,
// a few lines a season. A crown brought home strengthens its realm in the world (its capital grows, the realms
// that know it think better of it, the crown stays its relic); a lost caravan is a line of the world's
// chronicle. When the epilogue is told, the campaign goes into the world's archive (a.campaignsDone): its
// chronicle stays with the world, and another caravan may set out.
import {stepHistory} from '../atlas/history.js';
import {townLabel} from '../atlas/towns.js';
import {realmLabel, realmLabelGen, realmTowns} from '../atlas/realms.js';
import {relation} from '../atlas/diplomacy.js';
import {SPECIES} from '../data/species.js';
import {RETINUE, inLine} from '../data/campaign.js';
import {EPILOGUE, FATES, fate} from '../data/epilogue.js';
import {draw} from './start.js';
import {say, isCore, rank} from './march.js';

const cap = s => s[0].toUpperCase() + s.slice(1);
const SIDES = ['на восток', 'на юго-восток', 'на юг', 'на юго-запад', 'на запад', 'на северо-запад', 'на север', 'на северо-восток'];
const cases = t => t ? [0, 1, 2, 3, 4].map(k => `${townLabel(t, k)} ${t.name}`) : ['родные края', 'родные края', 'родных краёв', 'родных краях', 'родными краями'];

// the words a fate is told with
function words(a, K, m, r) {
  const capital = a.towns.find(t => t.id === K.capital && t.alive) || null, towns = K.realm ? realmTowns(a, K.realm) : [];
  const Q = K.quest, town = towns.length ? towns[(r() * towns.length) | 0] : capital;
  return {g: (male, female) => (m.gender === 'f' ? female : male), town: cases(town), capital: cases(capital), crown: Q?.name || 'корона', crownAcc: Q?.acc || Q?.name || 'корону',
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

// once, when the campaign has just ended: the world's consequences and the fates to tell
export function finish(a, K) {
  if (K.epilogue) return;
  const {r, done} = draw(K, 'epilogue'), lines = [], Q = K.quest, E = EPILOGUE.crown;
  // the artifact of an epic quest: home in the capital when the caravan came back with it; lost where the caravan fell
  // or gave up — free again for the next boss to take and the next caravan to seek (atlas/calamity.js questHint)
  const A = a.artifact;
  if (Q?.epic && A?.holder.kind === 'caravan') {
    if (K.phase === 'won') { A.holder = {kind: 'capital', town: K.capital}; A.trail.push({year: a.hist.year, era: a.hist.era, i: A.i, text: 'принесён караваном в столицу'}); }
    else { const i = Math.min(a.n - 1, Math.floor(K.y) * a.w + Math.floor(K.x)); A.holder = {kind: 'lost'}; A.i = i; A.trail.push({year: a.hist.year, era: a.hist.era, i, text: 'потерян вместе с караваном'}); }
  }
  const capital = a.towns.find(t => t.id === K.capital && t.alive);
  const used = new Set(), tellFate = (m, list) => { const w = words(a, K, m, r); m.fate = fate(r, list, used)(m, w); lines.push({text: m.fate, who: [m.id]}); };
  if (K.phase === 'won') {
    // the crown home: the capital grows, the realms that know the realm think better of it
    let friends = 0;
    if (capital) { capital.pop = Math.round(capital.pop * E.pop); capital.relic = {name: Q?.name || 'корона', year: a.hist.year}; }
    const R = (a.realms || []).find(x => x.id === K.realm);
    if (R) {
      R.crown = {name: Q?.name || 'корона', year: a.hist.year};
      for (const o of a.realms) { const rel = o.id !== R.id && relation(a, R.id, o.id); if (rel) { rel.att = Math.min(E.attMax, rel.att + E.att); friends++; } }
    }
    lines.push({text: `В ${capital ? `${townLabel(capital, 3)} ${capital.name}` : 'столице'} празднуют возвращение короны. Слава державы ${R ? realmLabelGen(a, R.id) : ''} растёт${friends ? `; ${friends === 1 ? 'соседи ищут' : 'соседние державы ищут'} с ней дружбы` : ''}, в столицу тянутся новые жители.`.replace('державы  растёт', 'державы растёт'), world: true});
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
    crown: Q?.name || null, clues: Q?.found ?? 0, started: K.started, ended: {year: a.hist.year, season: a.hist.season}, days: K.day,
    members: K.members.map(m => ({name: m.name, gender: m.gender, race: m.race, role: m.role, core: isCore(m), rank: rank(K, m), died: m.died || null, left: m.left || null, fate: m.fate || null})),
    log: K.log.map(l => ({day: l.day, year: l.year, season: l.season, kind: l.kind, text: l.text})),
  });
}

// The adventurers' guild (plan claude/guild-plan.md Г1; docs/GUILD.md) — a part of the campaign's system: its door is campaign/index.js. A house in a capital of a living world: its treasury,
// its people, the deeds in town it takes (tier 0: data/chores.js) and the errands of the world it sends an expedition on (tier
// 1 and up: campaign/errands.js, played as a campaign of chapters on the world map and the local map). The world goes on
// whatever the guild does: the guild's clock is the world's season with the guild's days in it (stepGuild).
//
// a.guild = G = {v, id, name, seed, town, people, realm, founded: {year, season}, day, gold, fame, phase ('hire' | 'open' | 'over'),
//   candidates: [member…] (while hiring), members: [member…] (every one ever taken in: the dead and the gone stay, with their
//   state), nextMember, offers: [{uid, id, pay, days, until}], chores: [{uid, id, ids, from, until, pay, rng}], expeditions: [
//   summary…], store: {beasts, vehicles, cargo, buildings, nextBeast}, social (the bonds of all of them: campaign/social.js),
//   seen (what the guild knows of the world), log: [{day, year, season, text, kind}], ledger: [{day, year, gold, why}], rng}
// A member is the campaign's own (campaign/start.js makeMember) with m.guild = {state, until, chore, since}:
//   state — 'ready' (at the house; healing too, if below GUILD.home.ready), 'chore', 'expedition', 'dead', 'left'
// An expedition is a.campaign (campaign/start.js newExpedition): its members are the same objects as the roster's.
import {mulberry, seedNumber} from '../core/rng.js';
import {plural} from '../core/util.js';
import {GUILD} from '../data/guild.js';
import {CHORES, CHORE} from '../data/chores.js';
import {SPECIES} from '../data/species.js';
import {COMBAT_ROLES} from '../data/roles.js';
import {stepHistory, startHistory, lifeOf, townLabel} from '../atlas/index.js';
import {drawCore, coreMember, newExpedition} from './start.js';
import {caravanDay, ended, alive, die, dayShot, isCore, say} from './march.js';
import {upgradeMembers} from './start.js';
import {award, levelEvening, ensureXp, need} from './experience.js';
import {bondBy, bondOf} from './social.js';
import {opinion} from '../data/relations.js';
import {TRAITS} from '../data/traits.js';
import {XP} from '../data/experience.js';
import {DAY} from '../core/time.js';
import {HOUSE} from '../data/rooms.js';
import {stepContracts, contractCards, contractOf, contractWhy, takeContract, settleContract, campsOf, fameBy, levelOf, tierOf, levelNext, abortWhy, abortContract} from './contracts.js';
import {giveUp} from './errands.js';
import {houseOf, houseSeason, finishBuilding, roomBy, grieve, working, roomLevel} from './house.js';
import {outfit, bringHome} from './armory.js';
import {boardFor} from './errands.js';
import {ERRANDS} from '../data/errands.js';

// a named stream of the guild, kept by its position (as the campaign's: campaign/start.js draw)
export function gdraw(G, name) {
  const r = mulberry(G.rng[name] ?? seedNumber(`${G.seed}:guild:${name}`));
  return {r, done: () => { G.rng[name] = r.state; }};
}
const year = a => a.hist?.year ?? 0;
// a line of the guild's chronicle; `world` — also into the world's
export function tell(a, G, text, kind = 'guild', world = false) {
  const H = a.hist;
  G.log.push({day: G.day, year: H?.year ?? 0, season: H?.season ?? 0, text, kind});
  if (world && H) a.chronicle.push({era: H.era, year: H.year, season: H.season, text, campaign: true});
}
// gold in or out of the treasury, written down (no gold out of nowhere: every move has its why)
export function pay(G, gold, why) {
  const g = Math.round(gold * 10) / 10; if (!g) return;
  G.gold = Math.round((G.gold + g) * 10) / 10;
  G.ledger.push({day: G.day, gold: g, why});
}

// the members by state
export const membersOf = (G, state = null) => G.members.filter(m => m.alive && m.guild && (state == null ? !['dead', 'left'].includes(m.guild.state) : m.guild.state === state));
// (at the house: free, at a post, a trainee, a patient — campaign/house.js)
export const atHouse = G => G.members.filter(m => m.alive && ['ready', 'post', 'training', 'treat'].includes(m.guild?.state));
// the most in one party (the planning room: data/rooms.js) and in the guild (the barracks)
export const partyMost = G => roomBy(G, 'planning', 'party') || GUILD.party.max;
export const rosterMost = G => roomBy(G, 'barracks', 'roster') || GUILD.roster;
export const healing = m => (m.hp ?? 1) < GUILD.home.ready;
// a member's years now (world years)
export const ageOf = (a, m) => (m.born == null ? null : Math.max(0, year(a) - m.born));
// the parties out (G.live: the campaigns of this guild not yet settled; plan Г3/Г4 — several at once, the planning room's count)
export const parties = a => (a.guild?.live || []).filter(K => !K.closed);
// the party watched (a.campaign: its camps played on the local map), or the first one out, or none
export const expedition = a => (a.campaign && a.guild && a.campaign.guild === a.guild.id && !a.campaign.closed ? a.campaign : parties(a)[0] || null);
export const partiesMost = G => roomBy(G, 'planning', 'parties') || 1;
// watch one party: its camps on the local map (its mode 'local'), the others reckoned unseen (the quick mode: only their lines)
export function watchParty(a, n) {
  const K = parties(a).find(x => x.expedition === n); if (!K) throw new Error('Такого отряда в пути нет.');
  for (const x of parties(a)) x.mode = x === K ? (x.watchMode || 'local') : 'auto';
  a.campaign = K;
  return K;
}

// ── the founding: the guild's house in a capital, its gold, and `candidates` at its door (the kinds and roles of the town,
// each in the starting kit of a caravan's core: data/campaign.js RETINUE.level). The player takes `pick` of them (hire).
export function foundGuild(a, townId, {name = null} = {}) {
  if (!a.hist) throw new Error('Гильдии нужен мир с историей.');
  const t = a.towns.find(x => x.id === townId && x.alive);
  if (!t || !t.capital) throw new Error('Гильдию основывают в столице.');
  const G = a.guild = {
    v: 1, id: `${a.cfg.seed}:guild:${t.id}`, name: name || `${t.name}ский дом`, seed: `${a.cfg.seed}:guild:${t.id}`, town: t.id, people: t.people, realm: t.realm,
    founded: {year: a.hist.year, season: a.hist.season}, day: 0, gold: 0, fame: 0, phase: 'hire', candidates: [], members: [], nextMember: 0,
    offers: [], chores: [], expeditions: [], store: {beasts: [], vehicles: [], cargo: {}, buildings: [], nextBeast: 1},
    social: {version: 1, relations: {}, why: {}, facts: [], commitments: [], applied: {}, faded: {}}, seen: new Uint8Array(a.n), log: [], ledger: [], rng: {},
  };
  pay(G, GUILD.start.gold, 'грамота державы на основание гильдии');
  houseOf(G);
  G.candidates = rollRecruits(a, G, GUILD.start.candidates);
  acquaint(G, G.candidates);
  tell(a, G, `В ${townLabel(t, 3)} ${t.name} основана гильдия приключенцев «${G.name}». В казне ${G.gold} зол.; к дверям пришли ${G.candidates.length} ${plural(G.candidates.length, 'человек', 'человека', 'человек')}.`, 'start', true);
  return G;
}
// `n` people of the town to take in: drawn as a caravan's core is (campaign/start.js drawCore: the town's kinds, the roles a
// company must have first), each with his years (data/races.js: grown + a share of his life) and the year he will die of age
function rollRecruits(a, G, n) {
  const H = {seed: G.seed, moreNames: true, members: [...G.members, ...(G.candidates || [])], nextMember: G.nextMember, day: 0, capital: G.town, people: G.people, realm: G.realm};
  const {r, done} = gdraw(G, 'recruits'), out = [];
  drawCore(a, H, r, n).forEach((x, k) => {
    const m = coreMember(H, a, r, x, k); if (x.required) m.required = x.required;
    const B = SPECIES.get(m.race).body || {}, grown = B.adult ?? 16, life = lifeOf(m.race, r() * 2);
    const age = Math.round(grown + Math.pow(r(), GUILD.age.skew) * GUILD.age.span * Math.max(0, life - grown));
    m.born = year(a) - age; m.dies = m.born + Math.max(age + 1, Math.round(life * (GUILD.age.dies[0] + (GUILD.age.dies[1] - GUILD.age.dies[0]) * r())));
    m.guild = {state: 'candidate', since: G.day};
    H.members.push(m); out.push(m);
  });
  G.nextMember = H.nextMember; done();
  return out;
}
// those who came to the door know one another from the town (GUILD.acquaint): a bond each way, the two close but not the same
//   (one = a newcomer: only his pairs with `ms`)
function acquaint(G, ms, one = null) {
  const A = GUILD.acquaint, {r, done} = gdraw(G, 'acquaint'), H = {members: one ? [one, ...ms] : ms, social: G.social};
  const pairs = one ? ms.map(x => [one, x]) : ms.flatMap((x, i) => ms.slice(i + 1).map(y => [x, y]));
  for (const [p, q] of pairs) {
    const ms_ = [p, q], i = 0, j = 1;
    if (r() >= A.chance) continue;
    const v = (r() < A.good ? 1 : -1) * A.spread * (A.least + (1 - A.least) * r()), d = (2 * r() - 1) * A.spread * A.diff;
    bondBy(H, ms_[i].id, ms_[j].id, Math.round((v + d) * 10) / 10); bondBy(H, ms_[j].id, ms_[i].id, Math.round((v - d) * 10) / 10);
  }
  done();
}
// the candidates taken in (their ids): the guild opens
export function hire(a, ids) {
  const G = a.guild; if (G?.phase !== 'hire') throw new Error('Гильдия никого не нанимает.');
  const pick = new Set(ids), take = G.candidates.filter(m => pick.has(m.id));
  if (take.length !== GUILD.start.pick) throw new Error(`Нужно выбрать ${GUILD.start.pick}.`);
  for (const m of take) { m.guild = {state: 'ready', since: G.day}; m.core = true; m.joined = 0; ensureXp(m); G.members.push(m); }
  const R = G.social.relations, kept = new Set(take.map(m => String(m.id)));   // the bonds of those not taken go with them
  for (const k of Object.keys(R)) { if (!kept.has(k)) delete R[k]; else for (const j of Object.keys(R[k])) if (!kept.has(j)) delete R[k][j]; }
  G.candidates = null; G.phase = 'open';
  offerChores(a, G); contracts(a, G); refreshRecruits(a, G);
  tell(a, G, `В гильдию вступили: ${take.map(m => `${m.name} (${roleWord(m)}, ${ageOf(a, m)} ${plural(ageOf(a, m), 'год', 'года', 'лет')})`).join(', ')}.`, 'people');
  return G;
}
// ── the door (GUILD.recruit; the author's word 13.11): anew each season, `count` from the town's people, of the guild's level
// (at least the 1st) — a third or so one lower, a rare one higher; taken in for a fee, while the barracks have room
export function refreshRecruits(a, G) {
  const R = GUILD.recruit, base = Math.max(1, levelOf(G)), {r, done} = gdraw(G, 'door');
  const ms = rollRecruits(a, G, R.count);
  for (const m of ms) {
    const x = r(), L = x < R.up ? base + 1 : x < R.up + R.down ? Math.max(1, base - 1) : base;
    raiseTo(a, G, m, L);
    m.fee = R.fee.base + R.fee.perLevel * (m.level || 1);
  }
  done();
  G.recruits = ms;
}
// a recruit grown to his level as the guild's own would be (a level's letter and perk each: campaign/experience.js levelEvening)
function raiseTo(a, G, m, L) {
  ensureXp(m);
  if (L <= 1) return;
  m.xp = need(L); m.acts = {...(m.acts || {}), role: L};
  levelEvening(a, {seed: `${G.seed}:door:${m.id}`, rng: {}, day: G.day, members: [m], people: G.people, realm: G.realm, capital: G.town, social: {relations: {}, facts: []}, log: [], beasts: [], vehicles: []});
}
export function recruitWhy(a, id) {
  const G = a.guild, m = (G.recruits || []).find(x => x.id === id);
  if (!m) return 'его у дверей больше нет';
  if (membersOf(G).length >= rosterMost(G)) return `в казармах нет места (${rosterMost(G)})`;
  if (G.gold < m.fee) return `в казне нет ${m.fee} зол.`;
  return null;
}
export function takeRecruit(a, id) {
  const G = a.guild, why = recruitWhy(a, id); if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const m = G.recruits.find(x => x.id === id);
  pay(G, -m.fee, `найм: ${m.name}`); delete m.fee;
  m.guild = {state: 'ready', since: G.day}; m.core = true; m.joined = 0; G.members.push(m);
  G.recruits = G.recruits.filter(x => x !== m);
  acquaint(G, membersOf(G).filter(x => x !== m), m);   // (he may know some of them from the town)
  tell(a, G, `В гильдию вступил ${m.name} (${roleWord(m)}, ${m.level || 1}-й уровень).`, 'people');
  return m;
}
// an expedition's errand in words: «Разорить логово: логово варгов «Мёртвые буреломы»»
export const questWord = K => [K?.quest?.spec?.label || (ERRANDS.has(K?.quest?.errand) ? ERRANDS.get(K.quest.errand).label : null), K?.quest?.crown?.label || K?.quest?.name].filter(Boolean).join(': ') || 'поручение';
export const roleWord = m => (m.fight && COMBAT_ROLES.has(m.fight) ? COMBAT_ROLES.get(m.fight).label : SPECIES.get(m.race)?.label || m.race);

// ── the clock: one season of the world with the guild's days in it (and the expedition's, if one is out). The decisions are
// the player's between seasons (hire, takeChore, launch); the season itself runs on its own. → false once the guild is over
export function stepGuild(a) {
  const G = a.guild; if (!G || G.phase !== 'open') return false;
  if (!a.hist) startHistory(a);
  if (a.hist.step >= a.hist.end) a.hist.end = a.hist.step + 1;   // (history goes on past its plan, as for a campaign)
  const out = parties(a);
  for (const K of out) { upgradeMembers(K); K.track = []; K.seasonFrom = K.day; K.daily = [dayShot(K, K.day - 1)]; }
  const spring = a.hist.season === 0;
  const paid = wages(a, G);
  houseSeason(a, G, paid, {pay, tell: (text, kind) => tell(a, G, text, kind), award: (m, xp) => award(homeK(a, G), m, 'train', 1, {xp}), level: () => levelEvening(a, homeK(a, G), text => tell(a, G, text, 'level'))});
  leaveCold(a, G);
  stepHistory(a, () => {
    for (const K of out) if (!K.closed) { caravanDay(a, K, K.day); if (K.phase === 'home' || ended(K)) closeExpedition(a, G, K); }
    homeDay(a, G);
  });
  finishBuilding(a, G, text => tell(a, G, text, 'house'));
  if (spring) ageGuild(a, G);
  offerChores(a, G);
  contracts(a, G);
  refreshRecruits(a, G);
  if (!membersOf(G).length && !parties(a).length) { G.phase = 'over'; tell(a, G, `В гильдии «${G.name}» не осталось никого. Дом заколочен.`, 'end', true); }
  return G.phase === 'open';
}
// a day at the house: the hurt mend, the deeds in town come back
function homeDay(a, G) {
  G.day++;
  const heal = GUILD.home.heal * (working(G, 'healer') ? 1 + HOUSE.heal.home * roomLevel(G, 'healer') : 1);   // (the healer's room: data/rooms.js)
  for (const m of atHouse(G)) if ((m.hp ?? 1) < 1) m.hp = Math.min(1, (m.hp ?? 1) + heal);
  for (const c of [...G.chores]) if (G.day >= c.until) settleChore(a, G, c);
}
// a season's pay (at its first day, before the season runs): each living member's wage from the treasury, by his level;
// one unpaid GUILD.wage.leave seasons running leaves the guild
function wages(a, G) {
  const W = GUILD.wage; let paid = 0;
  for (const m of membersOf(G)) {
    const w = Math.round((W.base + W.perLevel * ((m.level || 1) - 1)) * 10) / 10;
    if (G.gold >= w) { pay(G, -w, `жалованье: ${m.name}`); paid += w; m.unpaid = 0; m.devotion = Math.min(1, devotionOf(m) + GUILD.devotion.paid); continue; }
    m.unpaid = (m.unpaid || 0) + 1;
    if (m.unpaid >= W.leave && m.guild.state === 'ready') { m.guild.state = 'left'; m.left = {day: G.day, year: year(a), why: 'не платили жалованья'}; tell(a, G, `${m.name} ушёл из гильдии: жалованья не видел ${m.unpaid} ${plural(m.unpaid, 'сезон', 'сезона', 'сезонов')}.`, 'people'); }
    else tell(a, G, `${m.name} не получил жалованья: казна пуста.`, 'people');
  }
  return paid;
}
// devotion (GUILD.devotion): one who has none written yet has the start's
export const devotionOf = m => m.devotion ?? GUILD.devotion.start;
// one whose devotion is gone leaves (at the house, at a season's start)
function leaveCold(a, G) {
  for (const m of membersOf(G, 'ready')) if (devotionOf(m) < GUILD.devotion.leave) {
    m.guild.state = 'left'; m.left = {day: G.day, year: year(a), why: 'разуверился в гильдии'};
    tell(a, G, `${m.name} ушёл из гильдии: не простил, что его гнали в поход силой.`, 'people');
  }
}
// spring: age takes those whose years are out — at the house, on a deed, on the road
function ageGuild(a, G) {
  for (const m of membersOf(G)) {
    if (m.dies == null || year(a) < m.dies) continue;
    const K = parties(a).find(x => x.members.includes(m));
    if (m.guild.state === 'expedition' && K) { die(a, K, m, 'умер от старости'); continue; }
    fall(a, G, m, 'умер от старости');
  }
}
// a member dies at home or in town (on the road the campaign's own die: campaign/march.js)
function fall(a, G, m, why) {
  m.alive = false; m.hp = 0; m.died = {day: G.day, year: year(a), why}; m.guild.state = 'dead';
  for (const c of G.chores) c.ids = c.ids.filter(id => id !== m.id);
  tell(a, G, `${m.name} ${m.gender === 'f' ? 'умерла' : 'умер'}: ${why}.`, 'death', true);
  grieve(G, m, (x, y) => bondOf(G, x, y), text => tell(a, G, text, 'house'));
}

// the world's contracts on the guild's board (campaign/contracts.js): a season's posting, offers run out, stories go on
function contracts(a, G) {
  const {r, done} = gdraw(G, 'contracts');
  stepContracts(a, G, {r, tell: (text, kind) => tell(a, G, text, kind), pay});
  done();
}
// ── the deeds in town (tier 0): offered each season from data/chores.js, taken by 1–4 of those at the house, settled by one
// draw of their own at the end (settleChore)
function offerChores(a, G) {
  const C = GUILD.chore, {r, done} = gdraw(G, 'offers');
  G.offers = G.offers.filter(o => o.until > G.day);
  const want = Math.max(1, C.perSeason + Math.round((r() * 2 - 1) * C.spread));
  const pool = CHORES.all();
  while (G.offers.length < want) {
    const R = pool[(r() * pool.length) | 0];
    G.offers.push({uid: `${G.day}:${G.offers.length}:${R.id}`, id: R.id, pay: Math.round(R.pay[0] + r() * (R.pay[1] - R.pay[0])), until: G.day + C.stands});
  }
  done();
}
// why these may not take that offer (null — they may)
export function choreWhy(a, offer, ids) {
  const G = a.guild, R = CHORES.get(offer?.id); if (!R || !G.offers.includes(offer)) return 'этого дела больше нет';
  if (ids.length < R.hands[0] || ids.length > R.hands[1]) return `нужно ${R.hands[0] === R.hands[1] ? R.hands[0] : `${R.hands[0]}–${R.hands[1]}`} ${plural(R.hands[1], 'человек', 'человека', 'человек')}`;
  const ms = ids.map(id => G.members.find(m => m.id === id));
  if (ms.some(m => !m || !m.alive || m.guild.state !== 'ready')) return 'не все свободны';
  return null;
}
export function takeChore(a, uid, ids) {
  const G = a.guild, offer = G.offers.find(o => o.uid === uid), why = choreWhy(a, offer, ids);
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const R = CHORES.get(offer.id), {r, done} = gdraw(G, 'chores'), days = R.days[0] + Math.floor(r() * (R.days[1] - R.days[0] + 1)), seed = (r() * 4294967296) >>> 0; done();
  G.offers = G.offers.filter(o => o !== offer);
  const c = {uid, id: R.id, ids: [...ids], from: G.day, until: G.day + days, pay: offer.pay, rng: seed};   // (its own draw, kept: a load does not draw it anew)
  G.chores.push(c);
  for (const id of ids) { const m = G.members.find(x => x.id === id); m.guild = {...m.guild, state: 'chore', chore: uid, until: c.until}; }
  tell(a, G, `${names(G, ids)} ${ids.length > 1 ? 'взялись' : 'взялся'}: ${R.label.toLowerCase()} — на ${days} ${plural(days, 'день', 'дня', 'дней')}, плата ${offer.pay} зол.`, 'chore');
  return c;
}
const names = (G, ids) => ids.map(id => G.members.find(m => m.id === id)?.name).filter(Boolean).join(', ');
const line = (r, xs, who, one = '') => (xs?.length ? xs[(r() * xs.length) | 0].replaceAll('{who}', who).replaceAll('{one}', one) : '');
// a deed's end: right or wrong by the mean of the letter it wants, then each one's hurt and death by their chances; the pay and
// the experience; a level taken at the house as at a camp's evening (campaign/experience.js levelEvening)
function settleChore(a, G, c) {
  G.chores = G.chores.filter(x => x !== c);
  const R = CHORES.get(c.id), r = mulberry(c.rng), ms = c.ids.map(id => G.members.find(m => m.id === id)).filter(m => m?.alive);
  for (const m of ms) m.guild = {state: 'ready', since: G.day};
  if (!ms.length) return;
  const mean = ms.reduce((s, m) => s + (m.special?.[R.stat] ?? 5), 0) / ms.length;
  const p = Math.min(CHORE.chance[1], Math.max(CHORE.chance[0], R.win + (mean - 5) * CHORE.per + (ms.length - R.hands[0]) * CHORE.more));
  const won = r() < p, worse = won ? 1 : CHORE.worse, who = names(G, ms.map(m => m.id));
  const out = [line(r, won ? R.lines.win : R.lines.lose, who)];
  for (const m of ms) {
    if (R.die > 0 && r() < R.die * worse) { out.push(line(r, R.lines.die, who, m.name)); fall(a, G, m, `погиб на городском деле: ${R.label.toLowerCase()}`); continue; }
    if (R.hurt > 0 && r() < R.hurt * worse) { m.hp = Math.max(CHORE.floor, (m.hp ?? 1) - (CHORE.hurtBy[0] + r() * (CHORE.hurtBy[1] - CHORE.hurtBy[0]))); out.push(line(r, R.lines.hurt, who, m.name)); }
  }
  const live = ms.filter(x => x.alive), H0 = {members: live, social: G.social};   // a deed done together: closer, or a little sore (GUILD.bond)
  for (const x of live) for (const y of live) if (x !== y) bondBy(H0, x.id, y.id, won ? GUILD.bond.won : GUILD.bond.lost);
  const gold = Math.round(c.pay * (won ? 1 : CHORE.lose));
  if (won) fameBy(G, GUILD.level.chore, text => tell(a, G, text, 'level'));   // (a deed done well: a little fame — GUILD.level)
  pay(G, gold, `городское дело: ${R.label}`);
  const H = homeK(a, G);
  for (const m of ms.filter(x => x.alive)) award(H, m, 'chore', 1, {xp: R.xp * (won ? 1 : CHORE.lostXp)});
  out.push(`Плата — ${gold} зол.`);
  tell(a, G, out.filter(Boolean).join(' '), won ? 'chore' : 'choreBad');
  levelEvening(a, H, (text) => tell(a, G, text, 'level'));
}
// the guild's house as the campaign's machinery reads a company (a level's draw of perks, its day): a campaign-shaped view
function homeK(a, G) {
  return {seed: G.seed, rng: G.rng, day: G.day, members: atHouse(G), people: G.people, realm: G.realm, capital: G.town, social: G.social, log: [], beasts: [], vehicles: []};
}

// ── the board: the deeds in town and the world's errands of the guild's capital (campaign/errands.js boardFor — the guard
// weighed against the people picked, if any)
export function guildBoard(a, ids = [], sort = 'tier') {
  const G = a.guild, ms = ids.map(id => G.members.find(m => m.id === id)).filter(Boolean);
  const chores = G.offers.map(o => { const R = CHORES.get(o.id); return {...o, label: R.label, text: R.text, hands: R.hands, days: R.days, stat: R.stat, xp: R.xp, why: ms.length ? choreWhy(a, o, ids) : null}; });
  // an errand above the people's rank is greyed with why: those picked, or (none picked) the best of those at the house
  const who = ms.length ? ms : membersOf(G, 'ready');
  const errands = (parties(a).length >= partiesMost(G) ? [] : contractCards(a, G, ms, sort))
    .map(e => { const why = e.ok ? rankWhy(who, e.tier) : null; return why ? {...e, ok: false, why} : e; });
  return {chores, errands};
}
// the rank an errand asks (GUILD.rank, by its tier): null, or why the people are not up to it yet
// (`what` — a tier, or an errand's id: data/errands.js)
export const rankOf = what => GUILD.rank[Math.min(GUILD.rank.length - 1, typeof what === 'number' ? what : ERRANDS.get(what)?.tier ?? 1)];
export function rankWhy(ms, what) {
  const need = rankOf(what), best = Math.max(0, ...ms.map(m => m.level || 1));
  return best >= need ? null : `рано: ведущему нужен хотя бы ${need}-й уровень (${ms.length ? `лучший — ${best}-й` : 'свободных нет'}); новички начинают с городских дел`;
}

// ── the muster (the author's word 12.11): the player names one to a quarter of the party asked (GUILD.muster.named); the others
// at the house answer for themselves — the danger against their courage and level, those already going (friends draw, a foe
// keeps one home), health, a road just walked — each by his own will, the strongest first. Pure: the same day, the same errand
// and the same names give the same answer (the draw is seeded by them, nothing is stored), so the board shows what the gate does
export const namedMost = size => Math.max(1, Math.floor(size * GUILD.muster.named));
const braveryOf = m => 1 + (m.local?.traits || []).reduce((s, t) => s + (TRAITS.has(t) ? TRAITS.get(t).mods?.bravery || 0 : 0), 0);
const likes = (G, x, y) => opinion({...x, species: x.race}, {...y, species: y.race}) + bondOf(G, x.id, y.id);
export function muster(a, {errand = null, contract = null, size = null, named = []} = {}) {
  size ??= partyMost(a.guild);
  const G = a.guild, M = GUILD.muster, rec = contract ? contractOf(a, contract) : null, need = rec ? rankOf(rec.tier) : errand ? rankOf(errand) : 0;
  errand = errand || contract;
  const going = named.map(id => G.members.find(m => m.id === id)).filter(Boolean);
  const r = mulberry(seedNumber(`${G.seed}:muster:${G.day}:${errand}:${named.join(',')}`));
  const rest = membersOf(G, 'ready').filter(m => !going.includes(m)).map(m => ({m, sway: (2 * r() - 1) * M.sway}));
  const answers = [];
  const weigh = ({m, sway}, with_ = going) => {
    const fear = Math.max(0, need - (m.level || 1)) * M.risk, hurt = Math.max(0, GUILD.home.ready - (m.hp ?? 1)) * M.hurt;
    const tired = m.guild?.from === 'expedition' && G.day - (m.guild.since || 0) < M.restDays ? M.rest : 0;
    let w = M.base + M.brave * (braveryOf(m) - 1) + GUILD.devotion.will * (devotionOf(m) - GUILD.devotion.start) - fear - hurt - tired + sway, foe = null, friend = null;
    for (const y of with_) { const v = likes(G, m, y); w += M.bond * (v - M.neutral); if (v <= M.foe && (!foe || v < foe.v)) foe = {y, v}; if (v >= M.friend && (!friend || v > friend.v)) friend = {y, v}; }
    const go = !foe && !(hurt > 0) && w > M.line;
    const why = go ? (friend ? `идёт: в отряде друг — ${friend.y.name}` : fear > 0 ? 'идёт, хоть и боязно' : 'согласен')
      : foe ? `не пойдёт: в отряде недруг — ${foe.y.name}` : hurt > 0 ? 'ещё не оправился от ран' : fear > M.base ? 'не по силам: боится' : tired ? 'только с дороги' : 'не хочет';
    return {w: foe || hurt > 0 ? -Infinity : w, why};   // (a foe in the party, or wounds not mended: not of himself — only named)
  };
  // the named go — each one's own answer asked all the same: one who would not have gone goes against his will (launch: devotion, mood)
  for (const m of going) { const v = weigh({m, sway: 0}, going.filter(y => y !== m)); answers.push({id: m.id, go: true, named: true, unwilling: !(v.w > M.line), why: v.w > M.line ? 'назначен' : `назначен против воли: ${v.why}`}); }
  let left = rest;
  while (going.length < size && left.length) {
    const scored = left.map(x => ({x, ...weigh(x)})).sort((p, q) => q.w - p.w || p.x.m.id - q.x.m.id), best = scored[0];
    if (!(best.w > M.line)) break;
    going.push(best.x.m); answers.push({id: best.x.m.id, go: true, why: best.why}); left = left.filter(x => x !== best.x);
  }
  for (const x of left) { const v = weigh(x); answers.push({id: x.m.id, go: false, why: going.length >= size && v.w > M.line ? 'отряд уже набран' : v.why}); }
  return {ids: going.map(m => m.id), answers};
}
export function musterWhy(a, {size = null, named = []} = {}) {
  size ??= partyMost(a.guild);
  if (size > partyMost(a.guild)) return `комната планирования отправляет не больше ${partyMost(a.guild)}`;
  if (!named.length) return 'назначьте хотя бы одного: он поведёт, остальные решат сами';
  if (named.length > namedMost(size)) return `назначить можно не больше ${namedMost(size)} из ${size}: остальные решают сами`;
  return null;
}

// ── an expedition: the people picked set out on an errand of the board (campaign/start.js newExpedition), with `purse` from
// the treasury and the road's food bought besides; one at a time (two and more — Г3)
export function launchWhy(a, {ids = [], purse = GUILD.purse, errand = null, contract = null} = {}) {
  const G = a.guild;
  if (G?.phase !== 'open') return 'гильдия закрыта';
  if (parties(a).length >= partiesMost(G)) return `в пути уже ${parties(a).length} ${plural(parties(a).length, 'отряд', 'отряда', 'отрядов')}: больше комната планирования не позволяет`;
  if (ids.length < GUILD.party.min || ids.length > partyMost(G)) return `в отряде ${GUILD.party.min}–${partyMost(G)} человек (комната планирования)`;
  if (ids.some(id => G.members.find(m => m.id === id)?.guild?.state !== 'ready')) return 'не все свободны';
  if (G.gold < purse) return `в казне нет ${purse} зол. на дорогу`;
  if (contract) { const why = contractWhy(a, contract); if (why) return why; return rankWhy(ids.map(id => G.members.find(m => m.id === id)), contractOf(a, contract).tier); }
  if (errand) return rankWhy(ids.map(id => G.members.find(m => m.id === id)), errand);
  return null;
}
//   contract — the uid of a contract of the board (campaign/contracts.js); errand — an errand of the capital's (data/errands.js:
//              the checks of before the contracts)
export function launch(a, {contract = null, errand = null, targetId = null, ids = null, named = null, size = null, purse = GUILD.purse, mode = 'local'} = {}) {
  // the named and the volunteers (muster); `ids` — a party set by hand (the checks, the quick probes)
  let M = null;
  if (!ids) { const w = musterWhy(a, {size, named: named || []}); if (w) throw new Error(w[0].toUpperCase() + w.slice(1) + '.'); M = muster(a, {errand, contract, size, named}); ids = M.ids; }
  const G = a.guild, why = launchWhy(a, {ids, purse, errand, contract});
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const ms = ids.map(id => G.members.find(m => m.id === id));
  for (const line of outfit(G, ms)) tell(a, G, `${line}.`, 'house');   // (the armory: each takes what is better than his own — campaign/armory.js)
  const rec = contract ? takeContract(a, G, contract, (G.expeditions.length || 0) + 1) : null;
  const K = newExpedition(a, G, ms, {errand, targetId, purse, mode, contract: rec});
  // several out at once: the first watched (its camps on the local map), the rest reckoned unseen till watched (watchParty)
  K.watchMode = mode; (G.live ||= []).push(K);
  if (!(a.campaign && !a.campaign.closed && a.campaign.guild === G.id)) a.campaign = K; else K.mode = 'auto';
  // sent against his will (GUILD.devotion): less devoted, and a bad mood on the road
  const D = GUILD.devotion;
  for (const x of M?.answers || []) if (x.unwilling) {
    const m = G.members.find(y => y.id === x.id); m.devotion = Math.max(0, devotionOf(m) - D.forced);
    ((m.social ||= {}).mood ||= []).push({id: 'forced', text: 'Послан в поход против воли.', mood: D.mood, endDay: K.day + D.days, span: D.days * DAY});
    tell(a, G, `${m.name} идёт против воли (${x.why.replace('назначен против воли: ', '')}).`, 'people');
  }
  pay(G, -purse, `в дорогу отряду: ${questWord(K)}`);
  const food = Math.round(K.food * GUILD.food * (roomBy(G, 'pantry', 'food') ?? 1) * 10) / 10;   // (the pantry: data/rooms.js)
  const pots = roomBy(G, 'healer', 'potions') || 0; if (pots) for (const m of ms) m.potions = Math.max(m.potions || 0, pots);   // (the healer's potions for the road)
  if (G.gold >= food) pay(G, -food, 'еда в дорогу'); else { K.food = Math.floor(K.food * G.gold / Math.max(1e-6, food)); pay(G, -G.gold, 'еда в дорогу: на что хватило'); }
  for (const m of ms) m.guild = {state: 'expedition', since: G.day, expedition: K.expedition};
  tell(a, G, `Отряд гильдии ушёл: ${names(G, ids)} — ${questWord(K)}.`, 'start');
  return K;
}
// an expedition back (the errand handed in, failed and home, or no one left): the living to the house, the gold to the
// treasury, the beasts, carts and goods to the store; those who joined on the way (not the hired, not the captives) stay
// with the guild if there is room. The campaign stays as a.campaign, marked closed, till the next one sets out (its chronicle
// and its map are the screen's to show)
export function closeExpedition(a, G, K) {
  K.closed = true; G.live = (G.live || []).filter(x => x !== K);
  const back = alive(K), mine = back.filter(m => m.guild), fell = K.members.filter(m => m.guild && !m.alive);
  for (const m of mine) m.guild = {state: 'ready', since: G.day, from: 'expedition'};
  // the errand's experience (data/experience.js XP.quest, by its tier): whole when handed in, a little when back with nothing
  const done = K.done?.at(-1), tier = done?.tier ?? K.quest?.tier ?? ERRANDS.get(K.quest?.errand)?.tier ?? 0, H = homeK(a, G);
  // (the planning room's trade: fewer hands — more experience each, HOUSE.xpRef / the party's size within HOUSE.xpSpan)
  const went = K.members.filter(m => m.guild).length || 1, each = Math.min(HOUSE.xpSpan[1], Math.max(HOUSE.xpSpan[0], HOUSE.xpRef / went));
  const qx = (XP.quest[Math.min(XP.quest.length - 1, tier)] || 0) * (done && !done.failed ? 1 : XP.questFail) * each;
  if (qx > 0) for (const m of mine) award(H, m, 'quest', 1, {xp: qx});
  for (const m of fell) { if (m.guild.state !== 'dead') m.guild = {...m.guild, state: 'dead'}; grieve(G, m, (x, y) => bondOf(G, x, y), text => tell(a, G, text, 'house')); }
  const room = Math.max(0, rosterMost(G) - membersOf(G).length), stay = back.filter(m => !m.guild && !m.captive && !m.contract && !m.former && m.loyalty != null).slice(0, room);
  for (const m of stay) { m.guild = {state: 'ready', since: G.day}; m.core = true; delete m.loyalty; G.members.push(m); }
  G.nextMember = Math.max(G.nextMember, K.nextMember || 0);
  pay(G, K.gold, K.done?.at(-1)?.failed ? 'вернулись ни с чем: остаток кошеля' : `сдано поручение: ${questWord(K)} (с остатком кошеля)`);
  K.gold = 0;
  // the spoils onto the armory's racks and the beasts into the stable while there is room; the rest sold (campaign/armory.js)
  const home = bringHome(a, G, K, pay);
  if (home.kept) tell(a, G, `В оружейную легли трофеи: ${home.kept}.`, 'house');
  G.store = {beasts: home.beasts, vehicles: K.vehicles, cargo: K.cargo, buildings: K.buildings, nextBeast: K.nextBeast};
  const p = (a.parties || []).find(x => x.id === K.party); if (p) p.state = 'gone';
  const last = K.done?.at(-1), how = !back.length ? 'не вернулся' : last?.failed ? 'вернулся ни с чем' : 'вернулся с победой';
  if (last && !last.failed) for (const m of mine) m.devotion = Math.min(1, devotionOf(m) + GUILD.devotion.back);
  if (K.contract) { const {r, done} = gdraw(G, 'contracts'); settleContract(a, G, K, {r, tell: (text, kind) => tell(a, G, text, kind), pay}); done(); }
  else if (last && !last.failed) fameBy(G, last.tier || 1, text => tell(a, G, text, 'level'));
  G.expeditions.push({n: K.expedition, errand: K.quest?.errand, contract: K.contract || null, name: K.quest?.name, how, from: K.started, back: {year: year(a), season: a.hist.season}, days: K.day,
    went: K.members.filter(m => m.guild || stay.includes(m)).map(m => m.id), fell: fell.map(m => m.id), joined: stay.map(m => m.id)});
  tell(a, G, `Отряд ${how} (${questWord(K)})${back.length ? `: ${back.filter(m => m.guild).map(m => m.name).join(', ')}` : ''}${fell.length ? `; пали ${fell.map(m => m.name).join(', ')}` : ''}${stay.length ? `; в гильдию вступили ${stay.map(m => m.name).join(', ')}` : ''}. ${K.day} ${plural(K.day, 'день', 'дня', 'дней')} в пути.`, back.length ? 'home' : 'death', true);
  if (qx > 0) levelEvening(a, homeK(a, G), (text) => tell(a, G, text, 'level'));
}
export {GUILD};
export const isGuildMember = m => !!m?.guild && isCore(m);
export {campsOf, levelOf, tierOf, levelNext, abortWhy};
// the guild calls its party back from a contract (campaign/contracts.js abortContract): home with nothing; early — a little
// fame lost, in the last of its time — much
export function recall(a, n = null) {
  const G = a.guild, K = n == null ? expedition(a) : parties(a).find(x => x.expedition === n);
  const late = abortContract(a, G, K, giveUp, say);
  tell(a, G, `Отряд отозван с договора${late ? ' в последний срок — это дорого стоит славе гильдии' : ''}: ${questWord(K)}.`, 'contract');
  return late;
}

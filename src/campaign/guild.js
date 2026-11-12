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
import {caravanDay, ended, alive, die, dayShot, isCore} from './march.js';
import {upgradeMembers} from './start.js';
import {award, levelEvening, ensureXp} from './experience.js';
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
export const atHouse = G => membersOf(G, 'ready');
export const healing = m => (m.hp ?? 1) < GUILD.home.ready;
// a member's years now (world years)
export const ageOf = (a, m) => (m.born == null ? null : Math.max(0, year(a) - m.born));
// the expedition under way (a.campaign of this guild, not yet settled)
export const expedition = a => (a.campaign && a.guild && a.campaign.guild === a.guild.id && !a.campaign.closed ? a.campaign : null);

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
  G.candidates = rollRecruits(a, G, GUILD.start.candidates);
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
// the candidates taken in (their ids): the guild opens
export function hire(a, ids) {
  const G = a.guild; if (G?.phase !== 'hire') throw new Error('Гильдия никого не нанимает.');
  const pick = new Set(ids), take = G.candidates.filter(m => pick.has(m.id));
  if (take.length !== GUILD.start.pick) throw new Error(`Нужно выбрать ${GUILD.start.pick}.`);
  for (const m of take) { m.guild = {state: 'ready', since: G.day}; m.core = true; m.joined = 0; ensureXp(m); G.members.push(m); }
  G.candidates = null; G.phase = 'open';
  offerChores(a, G);
  tell(a, G, `В гильдию вступили: ${take.map(m => `${m.name} (${roleWord(m)}, ${ageOf(a, m)} ${plural(ageOf(a, m), 'год', 'года', 'лет')})`).join(', ')}.`, 'people');
  return G;
}
// an expedition's errand in words: «Разорить логово: логово варгов «Мёртвые буреломы»»
export const questWord = K => [ERRANDS.has(K?.quest?.errand) ? ERRANDS.get(K.quest.errand).label : null, K?.quest?.crown?.label || K?.quest?.name].filter(Boolean).join(': ') || 'поручение';
export const roleWord = m => (m.fight && COMBAT_ROLES.has(m.fight) ? COMBAT_ROLES.get(m.fight).label : SPECIES.get(m.race)?.label || m.race);

// ── the clock: one season of the world with the guild's days in it (and the expedition's, if one is out). The decisions are
// the player's between seasons (hire, takeChore, launch); the season itself runs on its own. → false once the guild is over
export function stepGuild(a) {
  const G = a.guild; if (!G || G.phase !== 'open') return false;
  if (!a.hist) startHistory(a);
  if (a.hist.step >= a.hist.end) a.hist.end = a.hist.step + 1;   // (history goes on past its plan, as for a campaign)
  const K = expedition(a);
  if (K) { upgradeMembers(K); K.track = []; K.seasonFrom = K.day; K.daily = [dayShot(K, K.day - 1)]; }
  const spring = a.hist.season === 0;
  wages(a, G);
  stepHistory(a, () => {
    if (K && !K.closed) { caravanDay(a, K, K.day); if (K.phase === 'home' || ended(K)) closeExpedition(a, G, K); }
    homeDay(a, G);
  });
  if (spring) ageGuild(a, G);
  offerChores(a, G);
  if (!membersOf(G).length && !expedition(a)) { G.phase = 'over'; tell(a, G, `В гильдии «${G.name}» не осталось никого. Дом заколочен.`, 'end', true); }
  return G.phase === 'open';
}
// a day at the house: the hurt mend, the deeds in town come back
function homeDay(a, G) {
  G.day++;
  for (const m of atHouse(G)) if ((m.hp ?? 1) < 1) m.hp = Math.min(1, (m.hp ?? 1) + GUILD.home.heal);
  for (const c of [...G.chores]) if (G.day >= c.until) settleChore(a, G, c);
}
// a season's pay (at its first day, before the season runs): each living member's wage from the treasury, by his level;
// one unpaid GUILD.wage.leave seasons running leaves the guild
function wages(a, G) {
  const W = GUILD.wage;
  for (const m of membersOf(G)) {
    const w = Math.round((W.base + W.perLevel * ((m.level || 1) - 1)) * 10) / 10;
    if (G.gold >= w) { pay(G, -w, `жалованье: ${m.name}`); m.unpaid = 0; continue; }
    m.unpaid = (m.unpaid || 0) + 1;
    if (m.unpaid >= W.leave && m.guild.state === 'ready') { m.guild.state = 'left'; m.left = {day: G.day, year: year(a), why: 'не платили жалованья'}; tell(a, G, `${m.name} ушёл из гильдии: жалованья не видел ${m.unpaid} ${plural(m.unpaid, 'сезон', 'сезона', 'сезонов')}.`, 'people'); }
    else tell(a, G, `${m.name} не получил жалованья: казна пуста.`, 'people');
  }
}
// spring: age takes those whose years are out — at the house, on a deed, on the road
function ageGuild(a, G) {
  const K = expedition(a);
  for (const m of membersOf(G)) {
    if (m.dies == null || year(a) < m.dies) continue;
    if (m.guild.state === 'expedition' && K?.members.includes(m)) { die(a, K, m, 'умер от старости'); continue; }
    fall(a, G, m, 'умер от старости');
  }
}
// a member dies at home or in town (on the road the campaign's own die: campaign/march.js)
function fall(a, G, m, why) {
  m.alive = false; m.hp = 0; m.died = {day: G.day, year: year(a), why}; m.guild.state = 'dead';
  for (const c of G.chores) c.ids = c.ids.filter(id => id !== m.id);
  tell(a, G, `${m.name} ${m.gender === 'f' ? 'умерла' : 'умер'}: ${why}.`, 'death', true);
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
  const gold = Math.round(c.pay * (won ? 1 : CHORE.lose));
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
export function guildBoard(a, ids = []) {
  const G = a.guild, ms = ids.map(id => G.members.find(m => m.id === id)).filter(Boolean);
  const chores = G.offers.map(o => { const R = CHORES.get(o.id); return {...o, label: R.label, text: R.text, hands: R.hands, days: R.days, stat: R.stat, xp: R.xp, why: ms.length ? choreWhy(a, o, ids) : null}; });
  const errands = expedition(a) ? [] : boardFor(a, G.town, ms.length ? {K: {members: ms, beasts: G.store.beasts}} : {});
  return {chores, errands};
}

// ── an expedition: the people picked set out on an errand of the board (campaign/start.js newExpedition), with `purse` from
// the treasury and the road's food bought besides; one at a time (two and more — Г3)
export function launchWhy(a, {ids = [], purse = GUILD.purse} = {}) {
  const G = a.guild;
  if (G?.phase !== 'open') return 'гильдия закрыта';
  if (expedition(a)) return 'отряд уже в пути';
  if (ids.length < GUILD.party.min || ids.length > GUILD.party.max) return `в отряде ${GUILD.party.min}–${GUILD.party.max} человек`;
  if (ids.some(id => G.members.find(m => m.id === id)?.guild?.state !== 'ready')) return 'не все свободны';
  if (G.gold < purse) return `в казне нет ${purse} зол. на дорогу`;
  return null;
}
export function launch(a, {errand, targetId = null, ids = [], purse = GUILD.purse, mode = 'local'} = {}) {
  const G = a.guild, why = launchWhy(a, {ids, purse});
  if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const ms = ids.map(id => G.members.find(m => m.id === id));
  const K = a.campaign = newExpedition(a, G, ms, {errand, targetId, purse, mode});
  pay(G, -purse, `в дорогу отряду: ${questWord(K)}`);
  const food = Math.round(K.food * GUILD.food * 10) / 10;
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
  K.closed = true;
  const back = alive(K), mine = back.filter(m => m.guild), fell = K.members.filter(m => m.guild && !m.alive);
  for (const m of mine) m.guild = {state: 'ready', since: G.day};
  for (const m of fell) if (m.guild.state !== 'dead') m.guild = {...m.guild, state: 'dead'};
  const room = Math.max(0, GUILD.roster - membersOf(G).length), stay = back.filter(m => !m.guild && !m.captive && !m.contract && !m.former && m.loyalty != null).slice(0, room);
  for (const m of stay) { m.guild = {state: 'ready', since: G.day}; m.core = true; delete m.loyalty; G.members.push(m); }
  G.nextMember = Math.max(G.nextMember, K.nextMember || 0);
  pay(G, K.gold, K.done?.at(-1)?.failed ? 'вернулись ни с чем: остаток кошеля' : `сдано поручение: ${questWord(K)} (с остатком кошеля)`);
  K.gold = 0;
  G.store = {beasts: K.beasts.filter(b => b.hp > 0), vehicles: K.vehicles, cargo: K.cargo, buildings: K.buildings, nextBeast: K.nextBeast};
  const p = (a.parties || []).find(x => x.id === K.party); if (p) p.state = 'gone';
  const last = K.done?.at(-1), how = !back.length ? 'не вернулся' : last?.failed ? 'вернулся ни с чем' : 'вернулся с победой';
  if (last && !last.failed) G.fame += last.tier || 1;
  G.expeditions.push({n: K.expedition, errand: K.quest?.errand, name: K.quest?.name, how, from: K.started, back: {year: year(a), season: a.hist.season}, days: K.day,
    went: K.members.filter(m => m.guild || stay.includes(m)).map(m => m.id), fell: fell.map(m => m.id), joined: stay.map(m => m.id)});
  tell(a, G, `Отряд ${how} (${questWord(K)})${back.length ? `: ${back.filter(m => m.guild).map(m => m.name).join(', ')}` : ''}${fell.length ? `; пали ${fell.map(m => m.name).join(', ')}` : ''}${stay.length ? `; в гильдию вступили ${stay.map(m => m.name).join(', ')}` : ''}. ${K.day} ${plural(K.day, 'день', 'дня', 'дней')} в пути.`, back.length ? 'home' : 'death', true);
}
export {GUILD};
export const isGuildMember = m => !!m?.guild && isCore(m);

// The campaign's clock: the world's season (atlas/history.js stepHistory), with the caravan's day after
// each of the world's days (campaign/march.js). History runs on past its planned end for as long as the
// campaign lasts, so the caravan walks a living world: wars, raids, towns that grow and burn.
import {stepHistory, startHistory} from '../atlas/index.js';
import {caravanDay, ended, finished, alive, die, dayShot, handedOf} from './march.js';
import {finish, stepEpilogue} from './ending.js';
import {personOf, agedOut} from '../atlas/index.js';
import {upgradeMembers, draw} from './start.js';
import {makeErrand, targetWhy} from './errands.js';
import {questTarget, questIntro} from './quest.js';
import {capacity} from './baggage.js';
import {say} from './march.js';
import {plural} from '../core/util.js';
import {YEAR_DAYS} from '../data/seasons.js';

export {newCampaign, capitals} from './start.js';
export {restMember, foundGuild, hire, stepGuild, guildBoard, takeChore, choreWhy, launch, launchWhy, expedition, membersOf, atHouse, healing, ageOf, roleWord, questWord, rankOf, rankWhy, muster, musterWhy, namedMost, devotionOf, campsOf, levelOf, tierOf, levelNext, abortWhy, recall, partyMost, rosterMost, parties, partiesMost, watchParty, refreshRecruits, recruitWhy, takeRecruit, GUILD} from './guild.js';
export {errandsFor, errandOf, boardFor} from './errands.js';

// ── a campaign of chapters (campaign/ending.js handIn): the caravan at its capital, an errand handed in
// another errand for the same company (data/errands.js id): fresh from the capital — the satchels full, the wounds tended
// targetId — the lair picked on the board (campaign/errands.js boardFor): one no longer there throws, the campaign untouched
export function nextErrand(a, id, {targetId = null} = {}) {
  const K = a.campaign; if (K?.phase !== 'home') throw new Error('Караван не ждёт поручения.');
  if (targetId != null) { const why = targetWhy(a, K, id, targetId); if (why) throw new Error(`Цель не ждёт: ${why}.`); }
  const {r, done} = draw(K, 'errand');
  const Q = makeErrand(a, K, r, id, {targetId}); if (!Q) { done(); throw new Error('В этом мире такого поручения сейчас нет.'); }
  K.quest = Q; K.phase = 'out'; K.path = null; K.via = null; K.viaWhy = null; K.camp = 0; K.hungry = 0;
  K.food = Math.max(K.food, capacity(K));
  for (const m of alive(K)) if (!m.captive) m.hp = 1;
  K.goal = questTarget(a, K, r);
  done();
  say(a, K, `Караван снова выходит из столицы. ${questIntro(a, K)}`, 'start', true);
  return K;
}
// the end: the company goes home for good — the epilogue, then the ascension (campaign/ascend.js)
export function endCampaign(a) {
  const K = a.campaign; if (K?.phase !== 'home') throw new Error('Караван не в столице.');
  K.phase = 'won';
  say(a, K, `Караван распущен: ${handedOf(K).length} ${plural(handedOf(K).length, 'поручение', 'поручения', 'поручений')} исполнено${K.done.length > handedOf(K).length ? `, ${K.done.length - handedOf(K).length} провалено` : ''}, ${Math.round(K.day / YEAR_DAYS * 10) / 10} лет в пути.`, 'home', true);
  finish(a, K);
}
export {ended, finished, alive, caravanMight, memberMight, pace} from './march.js';
export {chronicleText} from './chronicle.js';

// one season of the world with the campaign in it;
// after the end, a few seasons of the epilogue (campaign/ending.js); false once that is told too
export function stepCampaign(a) {
  const K = a.campaign;
  if (!K) return false;
  if (K.phase === 'home') return true;   // the errand handed in: the world waits for the player's word (nextErrand, endCampaign)
  if (ended(K)) {
    if (!K.epilogue) finish(a, K);   // a campaign saved at its very end, before this was
    if (!K.epilogue.done) stepEpilogue(a, K);
    return !finished(K);
  }
  upgradeMembers(K);   // a save from before the character came with the member (campaign/start.js memberLocal)
  if (!a.hist) startHistory(a);
  if (a.hist.step >= a.hist.end) a.hist.end = a.hist.step + 1;   // history goes on past its plan
  K.track = []; K.seasonFrom = K.day;   // (the camps of this season are all kept for the screen: campaign/fight.js play)
  K.daily = [dayShot(K, K.day - 1)];   // (the season's days as the screen shows them: what stood at the end of each — ui/campaignView.js)
  const spring = a.hist.season === 0;
  stepHistory(a, () => caravanDay(a, K, K.day));
  if (spring && !ended(K)) agePersons(a, K);
  if (ended(K)) finish(a, K);
  return !finished(K);
}

// the persons of the world walking with the caravan (a member with `person`: a captive, one unbound) are the caravan's to
// count: the world's spring (atlas/persons.js stepPersons) leaves them to it, and here age takes them as members — one death,
// the member's, and the person dies with it (campaign/march.js die → memberFate)
export function agePersons(a, K) {
  for (const m of alive(K)) { if (m.person == null) continue; const p = personOf(a, m.person); if (p && agedOut(a, p)) die(a, K, m, 'умер от старости'); }
}

// the whole campaign at once (tests, headless); at most `seasons`
export function runCampaign(a, seasons = Infinity) {
  let n = 0;
  while (n < seasons && stepCampaign(a)) n++;
  return a.campaign;
}

// a short fingerprint of the campaign: the same seed must give the same walk
export function campaignHash(K) {
  let h = 2166136261;
  const mix = v => { h ^= v; h = Math.imul(h, 16777619); };
  mix(K.day); mix(Math.round(K.x * 100)); mix(Math.round(K.y * 100)); mix(Math.round(K.food * 100)); mix(K.gold);
  for (const m of K.members) { mix(Math.round(m.hp * 1000)); mix(m.alive ? 1 : 0); }
  for (const l of K.log) for (let k = 0; k < l.text.length; k++) mix(l.text.charCodeAt(k));
  for (const t of K.bubble?.things || []) { mix(t.id); mix(Math.round(t.x * 100)); mix(Math.round(t.y * 100)); }
  return `${(h >>> 0).toString(16)} · ${alive(K).length}/${K.members.length}`;
}

// the company's story as a model (plan claude/caravan-ver_d.md §4.3): every part of it that decides what comes next — the
// bonds and their reasons, the facts with who saw and heard them, each one's memory (what, how, from whom), mood, tiredness,
// whole character (leanings too), world view, the promises with all their terms, the watch's turn, the council's meetings
// with every voice, the states of the company's streams of chance — the model, not the words said about it. Keys sorted,
// numbers to a thousandth: the same story, the same projection (tools/social-check.mjs compares it whole after a load)
const sortKeys = v => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
const SOCIAL_STREAMS = ['social', 'council', 'day', 'town', 'quest', 'slaves', 'ferry'];
export function socialModel(K) {
  const S = K.social || {};
  return sortKeys({relations: S.relations || {}, why: S.why || {}, facts: S.facts || [], commitments: S.commitments || [], meetings: S.meetings || [], told: S.told ?? null,
    duty: K.duty ? {queue: K.duty.queue, on: K.duty.on, night: K.duty.night} : null,
    members: K.members.map(m => ({id: m.id, alive: m.alive, local: m.local || null, align: m.align || null, alignRoot: m.alignRoot || null, social: m.social || null})),
    rng: Object.fromEntries(SOCIAL_STREAMS.filter(k => K.rng?.[k] != null).map(k => [k, K.rng[k]]))});
}
// its fingerprint
export function socialHash(K) {
  let h = 2166136261;
  const str = JSON.stringify(socialModel(K));
  for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// — the door: what the other systems and the screen take from the campaign —
export {capacity, load, wheeled} from './baggage.js';
export {campDone, openCamp, stepCamp} from './camp.js';
export {dateOf, lineLevel, readLines} from './chronicle.js';
export {baggageText, isCore, rank} from './march.js';
export {reasonsOf} from './social.js';
export {levelOn, need, atCap, specialOn, grewBy, growText, xpOn, toNext, deedsOf} from './experience.js';
export {perksBy, perkLabel, perkAbout, perkWhy} from './perks.js';
export {woundLabel, maimMax, scarsOn, maimsOn, scarEased} from './maims.js';
export {FATES, HOWS, fightReportText, fightStats, groupText, walkReportText, walkStats} from './stats.js';
export {workText} from './works.js';
export {ASCEND, emptyRegistry, mayAscend, ascend, summonable, takeHeroes, summonLine, snapshotOf} from './ascend.js';
export {contractsOf, contractOf, contractCards, issuerName} from './contracts.js';
export {houseOf, roomLevel, roomBy, working, staffOf, buildWhy, nextCost, postWhy, trainWhy, treatWhy, takeBack} from './house.js';
export {build as buildRoom, setPost as setRoomPost, sendTo as sendToRoom} from './house.js';
export {armoryOf, racks, stalls, shopOf, buyPrice, sellPrice, buyWhy, buyItem, sellItem, lockItem, forgeCost, forgeWhy, forgeItem, buyBeast} from './armory.js';
export {cagesOf, cageRoom, beastMarket, buyWarWhy, buyWarBeast, release as releaseBeast, keepHome, beastLabel, beastStrength} from './cages.js';
export {kinOf, relWord, moodOf} from './kin.js';
export {restWhy, retireWhy, unretireWhy, dismissWhy, giftOf} from './retire.js';

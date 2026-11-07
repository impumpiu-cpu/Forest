// The campaign's clock: the world's season (atlas/history.js stepHistory), with the caravan's day after
// each of the world's days (campaign/march.js). History runs on past its planned end for as long as the
// campaign lasts, so the caravan walks a living world: wars, raids, towns that grow and burn.
import {stepHistory, startHistory} from '../atlas/history.js';
import {caravanDay, ended, finished, alive, die} from './march.js';
import {finish, stepEpilogue} from './ending.js';
import {personOf, agedOut} from '../atlas/persons.js';
import {upgradeMembers} from './start.js';

export {newCampaign, capitals} from './start.js';
export {ended, finished, alive, caravanMight, memberMight, pace} from './march.js';
export {chronicleText} from './chronicle.js';

// one season of the world with the campaign in it;
// after the end, a few seasons of the epilogue (campaign/ending.js); false once that is told too
export function stepCampaign(a) {
  const K = a.campaign;
  if (!K) return false;
  if (ended(K)) {
    if (!K.epilogue) finish(a, K);   // a campaign saved at its very end, before this was
    if (!K.epilogue.done) stepEpilogue(a, K);
    return !finished(K);
  }
  upgradeMembers(K);   // a save from before the character came with the member (campaign/start.js memberLocal)
  if (!a.hist) startHistory(a);
  if (a.hist.step >= a.hist.end) a.hist.end = a.hist.step + 1;   // history goes on past its plan
  K.track = []; K.seasonFrom = K.day;   // (the camps of this season are all kept for the screen: campaign/fight.js play)
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

// The chronicle: what the settlement and each colonist did, kept for the final summary.
// Every colonist who ever lived gets a record (alive or not); the colony keeps totals.
import {noteSeen} from './facts.js';
import {SPECIES} from '../data/species.js';
import {DAY} from '../core/time.js';
import {colonists} from './query.js';
import {moodOf} from '../agents/mind.js';

export function newChronicle() {
  return {people: [], peakPop: 0, built: [], crafted: {}, gathered: {}, raidersKilled: 0, wolvesKilled: 0,
    biggestRaid: null, councilWins: {}, deaths: {}, councils: 0};
}

// a colonist's personal counters live on the agent and in the chronicle record
export function enrol(w, a, founder) {
  a.stats = {gathered: {}, hunted: 0, crafted: 0, labour: 0, raiders: 0, wolves: 0, wounds: 0, moodSum: 0, moodN: 0};
  w.chronicle.people.push({id: a.id, name: a.name, gender: a.gender, likes: a.likes, traits: a.traits,
    arrived: w.tick, founder: !!founder, died: null, cause: null, stats: a.stats});
}

export const recordOf = (w, a) => w.chronicle.people.find(p => p.id === a.id);

export function noteDeath(w, a, cause, by) {
  noteSeen(w, a);   // (who of a caravan saw it fall: campaign/social.js noteFate)
  const r = recordOf(w, a); if (!r) return;
  r.died = w.tick; r.doing = a.task?.id === 'job' ? a.task.job : a.task?.id;
  // killed by raiders, by a beast (its name), or died of something (hunger, cold, fire, venom…)
  const ks = by ? SPECIES.get(by.species) : null, raid = by?.faction === 'raiders';
  r.cause = !by ? `умер от ${cause}` : raid ? 'погиб в бою с налётчиками' : `погиб: ${ks.label}`;
  if (a.gender === 'f') r.cause = r.cause.replace('погиб', 'погибла').replace('умер от', 'умерла от');
  const key = !by ? 'от ' + cause : raid ? 'налётчики' : ks.plural || ks.label;
  w.chronicle.deaths[key] = (w.chronicle.deaths[key] || 0) + 1;
}

// called every tick from the simulation: peak population and mood samples
export function sampleChronicle(w) {
  const c = w.chronicle, col = colonists(w);
  if (col.length > c.peakPop) c.peakPop = col.length;
  if (w.tick % 60 === 0) for (const a of col) { a.stats.moodSum += moodOf(w, a); a.stats.moodN++; }
}

export const add = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };
export const daysLived = (w, r) => ((r.died ?? r.left ?? w.tick) - r.arrived) / DAY;

// The border between the local map and the rest of the world. It is the ONLY way the two talk:
//   in  — arrivals (settlers, beasts, raiders; later envoys, traders, orders) offered by a provider;
//   out — what the colony sends: a daily report (rumours of its strength), later tribute and envoys.
// The provider behind the border is swappable: today the scripted stub, later the world map.
// Every arrival has two halves: the provider decides who sets out and when (supply), the local
// MIGRATIONS entry decides how many the colony's land takes in (accept) and what they look like.
import {faunaLevel} from '../world/region.js';
import {Registry} from '../core/registry.js';
import {MIGRATIONS} from '../data/migrations.js';
import {NEIGHBOURS} from '../data/neighbours.js';
import {spawnGroup} from '../settlement/migration.js';
import {colonyReport} from './report.js';
import {DAY} from '../core/time.js';
import {scripted} from './scripted.js';
import {log} from '../core/log.js';

export const PROVIDERS = new Registry('outside');
PROVIDERS.register(scripted);

const OUTBOX = 40;

export const provider = w => PROVIDERS.get(w.outside.provider);

export function initOutside(w, providerId = 'scripted') {
  w.outside = {provider: providerId, next: {}, due: {}, seen: colonyReport(w), outbox: []};
  ensureFlows(w);
}

// flows that this game has not scheduled yet (a save from before they existed) get their first date
export function ensureFlows(w) {
  for (const [id, f] of Object.entries(provider(w).flows)) if (!(id in w.outside.next)) w.outside.next[id] = f.first(w, w.rng);
}

// the colony sends something out of the map
export function tell(w, kind, data) {
  const msg = {tick: w.tick, kind, data};
  w.outside.outbox.unshift(msg);
  if (w.outside.outbox.length > OUTBOX) w.outside.outbox.pop();
  provider(w).receive(w, msg);
}

// a group offered by the provider reaches the map edge: the land decides how many stay
//   offered: how many, or {n, …details} (a raid names its band: {n, band})
export function arrive(w, flowId, offered) {
  const def = MIGRATIONS.get(flowId);
  const {n: count, ...opts} = typeof offered === 'object' ? offered : {n: offered};
  offered = count;
  // the region decides which beasts live here at all (data/regions.js); a rich one sends one more
  const lvl = def.species ? faunaLevel(w, def.species) : 1;
  if (lvl <= 0) return [];
  const n = def.accept ? def.accept(w, offered + (lvl > 1 ? 1 : 0), w.rng) : offered;
  return n > 0 ? spawnGroup(w, flowId, n, opts) : [];
}

// the «Набег» button and similar: a group arrives now, outside any schedule
export function arriveNow(w, flowId) {
  const f = provider(w).flows[flowId];
  return arrive(w, flowId, (f.size ? f.size(w, w.rng) : f.offer(w, w.rng)) || 1);
}

export function stepOutside(w) {
  if (w.tick % DAY === 0) tell(w, 'report', colonyReport(w));
  const o = w.outside, P = provider(w);
  for (const [id, f] of Object.entries(P.flows)) {
    if (w.tick < o.next[id]) continue;
    const offered = f.offer(w, w.rng);
    const group = offered ? arrive(w, id, offered) : [];
    if (!offered && f.missed) { const m = f.missed(w); if (m) log(w, ...m); }
    // a due arrival that the colony could not take in is retried soon without resetting its schedule
    const retry = MIGRATIONS.get(id).retry;
    if (offered && !group.length && retry) { o.next[id] = w.tick + retry; o.due[id] ??= w.tick; continue; }
    if (group.length && id === 'settlers') tell(w, 'report', colonyReport(w));   // word of a newcomer travels fast
    o.next[id] = f.next(w, w.rng, group.length);
    o.due[id] = null;
  }
}

// for the panel: each neighbour with its distance and the next arrival from it
export function neighbours(w) {
  const P = provider(w);
  return NEIGHBOURS.all().map(n => ({
    ...n, dist: P.distance(w, n.id),
    flows: n.flows.filter(f => P.flows[f]).map(f => ({id: f, next: w.outside.next[f], due: w.outside.due[f]})),
  }));
}

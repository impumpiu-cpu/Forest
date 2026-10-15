// Reservations: one holder at a time for a place or a thing, so two colonists never walk to the same
// bench, the same bed at the healer's or the same body. A reservation is a lease: it lasts `ttl` ticks
// and the holder renews it while walking there and working (reserve() again). A holder who dies, drops
// the task or simply forgets lets it lapse; the task's exit (agents/lifecycle.js) releases it at once.
//   keys: 'bench:<building id>:<k>'  — a bench at a workshop (k < the building's `benches`)
//         'bed:<building id>:<k>'    — a bed in the healer's hut (k < its `beds`)
//         'corpse:<id>'              — a body someone is carrying to the graves
//         'beast:<id>'               — an animal a herder is taming, milking or shearing
// Plain data in w.reserve ({key: {by, until}}) and a.holds ([keys]): saved with the world.

export const LEASE = 40;

const table = w => w.reserve || (w.reserve = {});
const live = (w, r) => r && r.until > w.tick;

// take or renew key for a; false when someone else holds it
export function reserve(w, key, a, ttl = LEASE) {
  const R = table(w), r = R[key];
  if (live(w, r) && r.by !== a.id) return false;
  R[key] = {by: a.id, until: w.tick + ttl};
  if (!(a.holds ||= []).includes(key)) a.holds.push(key);
  return true;
}

// free for a (nobody holds it, the lease ran out, or a holds it already)
export const isFree = (w, key, a) => { const r = w.reserve?.[key]; return !live(w, r) || (!!a && r.by === a.id); };
export const holderOf = (w, key) => { const r = w.reserve?.[key]; return live(w, r) ? r.by : null; };

export function release(w, key, a) {
  const r = w.reserve?.[key];
  if (r && (!a || r.by === a.id)) delete w.reserve[key];
  if (a?.holds) a.holds = a.holds.filter(k => k !== key);
}

// everything a holds (its task ended, or it died)
export function releaseAll(w, a) {
  for (const k of a.holds || []) { const r = w.reserve?.[k]; if (r?.by === a.id) delete w.reserve[k]; }
  a.holds = [];
}

// the first of n numbered places (`${prefix}:0` … `${prefix}:${n-1}`) free for a — the one a already
// holds, if any — or null when all are taken
export function freeSlot(w, prefix, n, a) {
  let free = null;
  for (let k = 0; k < n; k++) {
    const key = `${prefix}:${k}`, r = w.reserve?.[key];
    if (live(w, r) && a && r.by === a.id) return key;
    if (free == null && !live(w, r)) free = key;
  }
  return free;
}
export const slotsHeld = (w, prefix, n, but) => {
  let c = 0;
  for (let k = 0; k < n; k++) { const r = w.reserve?.[`${prefix}:${k}`]; if (live(w, r) && (!but || r.by !== but.id)) c++; }
  return c;
};

// drop lapsed leases now and then, so the table does not grow with old keys
export function sweepReserve(w) {
  if (w.tick % 200 || !w.reserve) return;
  for (const [k, r] of Object.entries(w.reserve)) if (!live(w, r)) delete w.reserve[k];
}

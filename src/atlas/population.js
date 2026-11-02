// The people of a town as a composition (docs/WORLD.md «Демография», «Расы и народы»): how many of each race, in three
// bands of age — the young (under its race's `adult`), the grown and the old (past TOWN_LIFE.age.oldAt of its life). This is
// the one place that changes who lives in a town: births add young ones, deaths take by band, a levy takes grown ones, a
// raid takes any, settlers carry their composition to the new town, folk of another people move in as their own race.
// `t.pop`, `t.kin` (the shares by race) and `t.age` (the mean, for the cards) are sums of it, kept in step by `sync`;
// nothing else writes them (tools/pop-ledger.mjs books every change to the function that made it).
//
//   t.heads = {race: [young, grown, old]}   — the counts (fractional: the town is a field, not a census)
//   t.book  = {cause: n}                    — the year's losses by cause (war, raid, siege, taken, hunger, age, brawl, moved…),
//                                             closed into t.vital by lifeYear (atlas/demography.js)
// A group carried between places (a levy, settlers, captives come home) is the same shape: {race: [y, g, o]}.
import {SPECIES} from '../data/species.js';
import {WORLD_PEOPLES, TOWN_LIFE as TL, KIN} from '../data/peoples.js';
import {TOWN_FLOW} from '../data/townBuildings.js';
import {townKin, kinOfLand} from './towns.js';

export const BANDS = ['young', 'grown', 'old'];
const r4 = v => Math.round(v * 10000) / 10000;
const bodyOf = id => (SPECIES.has(id) ? SPECIES.get(id).body || {} : {});
// the edges of the bands of a race: grown at `adult`, old at life × oldAt (data/races.js body; TOWN_LIFE.age)
export const bandEdges = race => { const B = bodyOf(race), L = B.life || B.lifeFrom || 70; return [B.adult ?? 16, Math.round(L * TL.age.oldAt)]; };
// the middle age of a band of a race (the death rate reads it: atlas/demography.js)
export const bandAge = (race, b, L = null) => { const [ad, old] = bandEdges(race), life = L ?? (bodyOf(race).life || 70); return b === 0 ? ad / 2 : b === 1 ? (ad + old) / 2 : (old + life) / 2; };

// ── the composition of a town, made once from what the town had (an old save: its people and mean age; a town of no
// composition yet: its races in the standing bands, TOWN_LIFE.age.bands); a founding band is made grown by foundHeads
export function headsOf(a, t) {
  if (t.heads) {
    // a hand set the people (a scenario, a probe, «Заселение мира»): the composition follows, its shares kept
    const n = groupSize(t.heads);
    if (t.pop != null && Math.abs(n - t.pop) > 1e-6) {
      if (n > 0) { for (const b of Object.values(t.heads)) for (let i = 0; i < 3; i++) b[i] *= t.pop / n; return t.heads; }
      delete t.heads;
    } else return t.heads;
  }
  const K = t.kin || townKin(a, t), H = {};
  for (const [race, sh] of Object.entries(K)) H[race] = bandsFor(race, sh * Math.max(0, t.pop || 0), t.kinAge?.[race] ?? t.age ?? null);
  t.heads = H;
  delete t.kinAge;
  sync(t);
  return H;
}
// a founding band (atlas/peoples.js foundTown): `pop` grown ones of the races its land gives
export function foundHeads(a, t, pop) {
  const K = kinOfLand(a, t) || {[WORLD_PEOPLES.get(t.people).race]: 1};
  t.heads = Object.fromEntries(Object.entries(K).map(([race, sh]) => [race, [0, sh * pop, 0]]));
  sync(t);
  return t.heads;
}
// n of a race spread over the bands as a town of that mean age would hold them (null: the standing bands)
function bandsFor(race, n, meanAge) {
  const [ad, old] = bandEdges(race), L = bodyOf(race).life || 70;
  if (!(n > 0)) return [0, 0, 0];
  if (meanAge == null) return TL.age.bands.map(x => x * n);
  // the young and the old by how the mean sits between the edges: a young town has children, an old one elders
  const y = Math.max(0, Math.min(1 / 2, (ad / L) * (1 - Math.min(1, meanAge / ((ad + old) / 2))))), o = Math.max(0, Math.min(1 / 2, ((L - old) / L) * Math.min(1, meanAge / ((ad + old) / 2))));
  return [n * y, n * (1 - y - o), n * o];
}
export const groupSize = G => Object.values(G || {}).reduce((s, b) => s + b[0] + b[1] + b[2], 0);
export const bandSum = (G, b) => Object.values(G || {}).reduce((s, x) => s + x[b], 0);
export const grownOf = (a, t) => bandSum(headsOf(a, t), 1);
export const youngOf = (a, t) => bandSum(headsOf(a, t), 0);

// the sums: t.pop, t.kin (shares, 4 places), t.age (the mean by the bands' middles)
export function sync(t) {
  const H = t.heads; if (!H) return t.pop;
  let pop = 0, ageSum = 0;
  for (const [race, b] of Object.entries(H)) { for (let i = 0; i < 3; i++) { if (!(b[i] > 0)) b[i] = 0; pop += b[i]; ageSum += b[i] * bandAge(race, i); } }
  t.pop = pop;
  const kin = {};
  for (const [race, b] of Object.entries(H)) { const n = b[0] + b[1] + b[2]; if (n > 0) kin[race] = r4(n / pop); }
  if (!Object.keys(kin).length) kin[WORLD_PEOPLES.get(t.people)?.race || 'human'] = 1;
  t.kin = kin;
  t.age = pop > 0 ? Math.round(ageSum / pop * 100) / 100 : 0;
  return pop;
}

// ── the operations
// n of a race in a band come (the born: band 0; a founding band: 1)
export function addHeads(a, t, race, n, band = 1) {
  if (!(n > 0)) return 0;
  const H = headsOf(a, t);
  (H[race] ||= [0, 0, 0])[band] += n;
  sync(t);
  return n;
}
// a group comes (its races and bands as they were)
export function addGroup(a, t, G) {
  if (!G) return 0;
  const H = headsOf(a, t);
  let n = 0;
  for (const [race, b] of Object.entries(G)) { const x = H[race] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) { x[i] += b[i]; n += b[i]; } }
  sync(t);
  return n;
}
// n taken out of the town, in proportion over its races — and over its bands, or of one band (`band`: a levy takes the
// grown), or of one race — never more than it has → the group taken. `how` books it as a loss of that cause
export function takeHeads(a, t, n, {race = null, band = null, how = null} = {}) {
  const H = headsOf(a, t), G = {};
  const pool = Object.entries(H).filter(([r]) => !race || r === race);
  const tot = pool.reduce((s, [, b]) => s + (band == null ? b[0] + b[1] + b[2] : b[band]), 0);
  const want = Math.min(Math.max(0, n), tot);
  if (!(want > 0)) return G;
  for (const [r, b] of pool) {
    const g = [0, 0, 0];
    for (let i = 0; i < 3; i++) { if (band != null && i !== band) continue; const x = b[i] * want / tot; g[i] = x; b[i] -= x; }
    if (g[0] + g[1] + g[2] > 0) G[r] = g;
  }
  sync(t);
  if (how) book(t, how, want);
  return G;
}
// n die of a cause (a raid, a storm, a siege's hunger, a burnt field): taken out and booked → how many
export function killHeads(a, t, n, how, opts = {}) { return groupSize(takeHeads(a, t, n, {...opts, how})); }
// a share of the town dies of a cause → how many
export const killShare = (a, t, share, how, opts = {}) => killHeads(a, t, Math.max(0, t.pop) * Math.max(0, Math.min(1, share)), how, opts);
// n move from one town to another, as they are (their races and bands) → how many
export function moveHeads(a, from, to, n, how = 'moved') {
  const G = takeHeads(a, from, n, {how});
  return addGroup(a, to, G);
}
// the year's book of losses
export const book = (t, how, n) => { if (n > 0) (t.book ||= {})[how] = Math.round(((t.book?.[how] || 0) + n) * 10) / 10; };

// ── what the land keeps bringing (KIN.pull): each year the town's own races (its people's, not the strangers') move this
// share of the way back to what its land gives — the wild tribes of the land join the horde, as many as leave it: nobody is
// made, the shares shift (the ones who come are grown)
export function pullToLand(a, t) {
  const land = kinOfLand(a, t); if (!land) return;
  const H = headsOf(a, t), own = Object.keys(land), pop = own.reduce((s, r) => s + (H[r] ? H[r][0] + H[r][1] + H[r][2] : 0), 0);
  if (!(pop > 0)) return;
  for (const race of own) {
    const have = H[race] ? H[race][0] + H[race][1] + H[race][2] : 0, d = (land[race] * pop - have) * KIN.pull;
    if (d > 0) (H[race] ||= [0, 0, 0])[1] += d;
    else if (d < 0 && have > 0) { const b = H[race]; for (let i = 0; i < 3; i++) b[i] += d * b[i] / have; }
  }
  sync(t);
}

// ── the people of a people of a town: of its own people's races (the composition it was founded with) and the strangers —
// folk of other peoples that moved in (atlas/demography.js migrate, atlas/diplomacy.js) → {own, strangers} as shares
export function strangersOf(a, t) {
  const K = townKin(a, t), own = new Set(Object.keys(WORLD_PEOPLES.get(t.people)?.kin || {[WORLD_PEOPLES.get(t.people)?.race]: 1}));
  let s = 0; for (const [race, sh] of Object.entries(K)) if (!own.has(race)) s += sh;
  return {own: 1 - s, strangers: s};
}
// the share of a town's people of the races of another people (the humans in a dwarven town)
export function shareOfPeople(a, t, peopleId) {
  const K = townKin(a, t), races = new Set(Object.keys(WORLD_PEOPLES.get(peopleId)?.kin || {}));
  let s = 0; for (const [race, sh] of Object.entries(K)) if (races.has(race)) s += sh;
  return s;
}
// the hands of a town: its grown ones × the share of them its people puts to work (data/peoples.js `hands`) — the young and the
// old do not work
export const handsOf = (a, t) => grownOf(a, t) * (WORLD_PEOPLES.get(t.people)?.hands ?? TOWN_FLOW.hands);

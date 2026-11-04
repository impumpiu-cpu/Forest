// The councils under the microscope: one world's history with the decision trace on (core/decide.js), read step by step the
// way the councils decide. The town's council (atlas/build.js pickProject → atlas/towns.js chooseBuilding): its needs, the deck
// of candidates it looks at (candidatesOf), what of it it may build (canBuild), the scores, how often the noise decides
// (the best within the noise of the second), what it could not pay for, and — the point of the probe — the buildings a town
// could build right now that never came into its deck. The realm's council (atlas/mind.js): its flags, wind, roles, obedience.
// The court (atlas/court.js): which deeds it drew, from which lane. The kingdom's edicts (atlas/kingdom.js).
// `node tools/town-council-probe.mjs [seed] [size] [std|start] [snapshot years, e.g. 60,90,120]` → JSON on stdout
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {traceMode, TRACE} from '../src/core/decide.js';
import {TOWN_BUILDINGS, TOWN_FX} from '../src/data/townBuildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {townFx, townNeeds, canBuild, realmBuilt, slotsUsed, slotsOf} from '../src/atlas/towns.js';
import {townFacts} from '../src/atlas/requirements.js';
import {roadAccess} from '../src/atlas/roads.js';
import {realmTaste} from '../src/atlas/realms.js';

const seed = process.argv[2] || 'start376615', size = process.argv[3] || 'small', mode = process.argv[4] || 'std';
const SNAP = (process.argv[5] || '60,90,120').split(',').map(Number);
if (mode === 'start') for (const P of WORLD_PEOPLES.all()) P.era = 'elder';
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const r3 = x => Math.round(x * 1000) / 1000;
const townOf = id => a.towns.find(t => t.id === id);

// the trace: every decision, folded as it comes (nothing kept but the tallies)
const T = {proj: {n: 0, none: 0, opts: 0, noise: 0, close: 0, skip: 0, byPeople: {}, picks: {}, optsHist: {}},
  deed: {n: 0, bands: {}, picks: {}, byPeople: {}}, raze: {}};
const add = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };
let year = 0;
traceMode('collect', {sink: rec => {
  if (rec.outcome) return;
  if (rec.point === 'town.project') {
    const t = townOf(+rec.who.split(':')[1]); const P = t?.people || '?';
    const p = T.proj; p.n++; const n = rec.opts.length; p.opts += n; add(p.optsHist, n >= 20 ? '20+' : n >= 10 ? '10–19' : n >= 5 ? '5–9' : n >= 1 ? '1–4' : '0');
    if (rec.skip) p.skip += rec.skip.length;
    const bp = p.byPeople[P] ||= {n: 0, none: 0, opts: 0, picks: {}};
    bp.n++; bp.opts += n;
    if (!rec.pick) { p.none++; bp.none++; return; }
    const id = rec.pick.slice(19, -1); add(p.picks, id); add(bp.picks, id);
    // how much the noise decided: the best over the second, against the noise's span (TOWN_FX.noise: × 0.85 … 1.15)
    const s = rec.opts.map(o => o.score).sort((x, y) => y - x);
    if (s.length > 1 && s[1] > 0) { const q = s[0] / s[1]; const span = (TOWN_FX.noise[0] + TOWN_FX.noise[1]) / TOWN_FX.noise[0]; if (q < span) p.noise++; if (q < 1.1) p.close++; }
  } else if (rec.point === 'world.deed' && rec.role === 'realm') {
    const d = T.deed; d.n++; add(d.bands, rec.band); add(d.picks, rec.pick.replace('world.deed.', ''));
  } else if (rec.point === 'town.raze') add(T.raze, rec.opts[0].cmd);
}});

// the snapshot: every town's council as it would sit now — its needs, its deck, what it may build and what it never sees
function snapshot() {
  const out = {y: a.hist.year, towns: [], realms: []};
  for (const t of a.towns.filter(x => x.alive && x.wants && x.econ)) {
    const pe = a.peoples.find(p => p.id === t.people); if (!pe) continue;
    const P = {...pe.P, taste: realmTaste(a, t.realm)}, fx = townFx(t), ctx = {...t.wants, road: roadAccess(a, t.i), econ: t.econ};
    const need = townNeeds(a, t, fx, ctx);
    const inRealm = realmBuilt(a, t), facts = townFacts(a, t, {inRealm});
    const may = TOWN_BUILDINGS.all().filter(b => canBuild(a, t, b, inRealm, facts));
    // the deck: what chooseBuilding would look at — read off one traced sitting (the options it scored are the deck ∩ what it may build)
    const keep = TRACE.sink; let opts = null;
    TRACE.sink = rec => { if (rec.point === 'town.project') opts = rec.opts; };
    // (the stream: a copy — the snapshot must not move the world's draws)
    // eslint-disable-next-line no-use-before-define
    const {chooseBuilding} = TOWNS;
    chooseBuilding(a, t, P, fx, {...ctx, skip: new Set()}, () => 0.5);
    const deck = new Set((opts || []).map(o => o.key.slice(19, -1)));
    const scores = Object.fromEntries((opts || []).map(o => [o.key.slice(19, -1), o.score]));
    // the whole hand: the same sitting with every building it may build as a candidate — would the deck have hidden the best?
    opts = null;
    chooseBuilding(a, t, P, fx, {...ctx, skip: new Set(), candidates: may}, () => 0.5);
    TRACE.sink = keep;
    const all = Object.fromEntries((opts || []).map(o => [o.key.slice(19, -1), o.score]));
    out.towns.push({id: t.id, people: t.people, tier: t.tier || 0, pop: Math.round(t.pop), role: t.role || (a.realms.find(r => r.id === t.realm)?.capital === t.id ? 'seat' : null),
      need: Object.fromEntries(Object.entries(need).map(([k, v]) => [k, r3(v)])), taste: Object.fromEntries(Object.entries(P.taste).map(([k, v]) => [k, r3(v)])),
      may: may.map(b => b.id), deck: [...deck], scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, r3(v)])), all: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, r3(v)])),
      unseen: may.filter(b => !deck.has(b.id)).map(b => b.id), slots: slotsUsed(t).town + '/' + slotsOf(t).town, project: t.project || null,
      short: Object.keys(t.econ.short || {}), lack: Object.keys(t.needs?.lack || {}), freeHands: Math.round(t.econ.freeHands || 0), feeds: Math.round(t.wants.feeds), threat: r3(t.wants.threat || 0)});
  }
  for (const r of (a.realms || []).filter(r => r.fallen == null && r.mind)) {
    const M = r.mind;
    out.realms.push({id: r.id, people: r.people, towns: a.towns.filter(t => t.alive && t.realm === r.id).length, flags: M.flags, sense: M.sense, wind: M.wind, course: M.course, obey: M.obey, lead: M.lead,
      roles: a.towns.filter(t => t.alive && t.realm === r.id).reduce((o, t) => (add(o, t.role || 'seat'), o), {}), edicts: r.kingdom?.edicts || {}, why: r.why || null});
  }
  return out;
}

const TOWNS = await import('../src/atlas/towns.js');
const snaps = [];
const winds = [];
let lastY = null;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (st.id !== 'history' || !a.hist) continue;
  year = a.hist.year;
  if (a.hist.season === 0 && a.hist.year !== lastY) {
    lastY = a.hist.year;
    if (SNAP.includes(a.hist.year)) snaps.push(snapshot());
    if (a.realms?.length) winds.push({y: a.hist.year, realms: a.realms.filter(r => r.fallen == null && r.mind).map(r => ({people: r.people, wind: r.mind.wind, flags: r.mind.flags, obey: r.mind.obey}))});
  }
}
snaps.push(snapshot());
process.stdout.write(JSON.stringify({seed, mode, trace: T, snaps, winds}));

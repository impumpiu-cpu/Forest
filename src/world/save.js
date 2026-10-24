// Saving and loading a whole game. The world is plain data (see core/serialize.js); the few live
// parts are rebuilt around it: the random stream continues from its saved position, navigation
// gets its distance fields back as they were (stale ones stay stale, so the game goes on exactly
// as it would have), agents' memories get their "unknown reads as 0" wrapper again.
// A loaded game continues tick for tick like the one that was saved (tools/determinism.mjs checks it).
import {newBehaviour} from '../settlement/behaviour.js';
import {SPECIES} from '../data/species.js';
import {rollCreature, refreshBody, adoptBody, BODY_VER} from '../agents/special.js';
import {migrateSkills} from '../agents/skills.js';
import {activeSkills} from '../data/skills.js';
import {BASE_MODS} from '../data/traits.js';
import {encode, decode} from '../core/serialize.js';
import {Registry} from '../core/registry.js';
import * as PRESETS from '../data/presets.js';
import {mulberry, newStreams, streamStates, restoreStreams} from '../core/rng.js';
import {Navigation} from '../nav/navigation.js';
import {newMemory} from '../agents/agent.js';
import {VERSION} from '../version.js';
import {ensureOre} from './ores.js';
import {ensurePlants} from './plants.js';
import {ensureRegion} from './region.js';
import {ensureHeat} from './heat.js';
import {newTradeState} from '../settlement/trade.js';
import {ensureFlows} from '../outside/index.js';
import {recomputeMods} from '../settlement/mods.js';
import {RESOURCES} from '../data/resources.js';
import {drawFoodPrefs} from '../data/foods.js';
import {JOBS} from '../data/jobs.js';
import {TASKS} from '../agents/tasks.js';
import {ITEMS} from '../data/items.js';
import {BRAINS} from '../agents/brains/index.js';

// 2: random streams by subsystem (core/rng.js). A format-1 save (one stream) still loads: its streams
// are seeded from the game's seed and the saved position of the old stream, the same every time.
// 3: SPECIAL states (the `downed` task, tiers, trophies). Builds that know only 1–2 refuse it before
// loading instead of crashing on the first tick; this build still reads 1 and 2.
export const SAVE_FORMAT = 3;
const FORMATS = [1, 2, 3];
// brains that run their task through the TASKS registry: an id it does not know would stop the game
const TASK_BRAINS = new Set(['colonist', 'raider', 'tabled', 'livestock', 'leaver', 'led']);

// world keys that are rebuilt rather than saved
const LIVE = new Set(['nav', 'rng', 'rngs', 'astar', 'perf', 'scratch', 'chunks']);
// grid buffers that the next field pass overwrites anyway
const GRID_LIVE = new Set(['heat2', 'smoke2']);

// definitions and presets are referenced by name, never copied into the save
function externals() {
  const m = new Map();
  for (const r of Registry.list) for (const d of r.all()) m.set(d, `${r.kind}:${d.id}`);
  for (const [name, table] of Object.entries(PRESETS)) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) continue;
    for (const [k, v] of Object.entries(table)) if (v && typeof v === 'object') m.set(v, `preset:${name}:${k}`);
  }
  return m;
}

export function saveWorld(w) {
  const nav = w.nav;
  const tree = encode({world: w, nav: {dist: nav.dist, dirty: [...nav.dirtySet], last: nav.last}},
    {externals: externals(), skip: (path, k) => (path === 'world.world' && LIVE.has(k)) || (path === 'world.world.grid' && GRID_LIVE.has(k))});
  return {format: SAVE_FORMAT, version: VERSION, name: w.cfg.name, tick: w.tick, savedAt: Date.now(), rng: w.rng.state, rngs: streamStates(w.rngs), tree};
}

export function loadWorld(save) {
  if (!save || !FORMATS.includes(save.format)) throw new Error('Это не сохранение «Тёплого Брода» или оно из несовместимой версии.');
  const {world: w, nav} = decode(save.tree, {externals: externals()});
  checkKnown(w);
  ensureRegion(w);
  ensureOre(w);
  ensurePlants(w);
  w.grid.smoke2 ??= new Float32Array(w.n);
  ensureHeat(w);   // old saves hold an absolute temperature; the chunks are rebuilt and settle in one pass
  w.trade ??= newTradeState(); w.caravan ??= null;
  w.corpses ??= []; w.graves ??= []; w.graveyard ??= null;
  w.behave ??= newBehaviour();
  w.behave.outcomes ??= {}; w.behave.company ??= 0;
  w.behave.squads ??= {started: 0, goal: 0, retreat: 0, wiped: 0};
  w.behave.hunts ??= {started: 0};
  // feeding from before carcasses goes on by the old timer (agents/behaviours/feed.js); chases without a pack hunt end
  for (const a of w.agents) if (a.task?.id === 'chase' && a.hunt == null) a.task = {id: 'roam'};
  for (const a of w.agents) if (a.task?.id === 'toPen') a.task = {id: 'penned', mode: 'to'};   // the pen's walk is a mode of `penned` now (agents/behaviours/penned.js)
  w.behave.social ??= {escort: 0, aid: 0, yield: 0, calm: 0, bond: 0};
  // raiders from before squads (no w.squads, no a.squad) go on the old way: nearest foe, the stores, home
  // claims from before reservations (settlement/reserve.js) are simply dropped: the leases start empty
  for (const b of w.buildings) delete b.workers;
  for (const c of w.corpses) { delete c.by; delete c.at; }
  for (const a of w.agents) { delete a.tamer; delete a.tamerAt; delete a.skipJob; }   // behaviour counters (settlement/behaviour.js) start at the load
  recomputeMods(w);   // building effects as this version defines them
  // charcoal and mined coal are one coal now
  if (w.stock.charcoal != null) { w.stock.coal = (w.stock.coal || 0) + w.stock.charcoal; delete w.stock.charcoal; }
  for (const r of RESOURCES.all()) w.stock[r.id] ??= 0;
  w.rng = mulberry(0); w.rng.state = save.rng;
  w.rngs = save.rngs ? restoreStreams(save.rngs, w.cfg.seed) : newStreams(`${w.cfg.seed}:${save.rng}`);
  w.nav = new Navigation(w);
  for (const [id, d] of Object.entries(nav.dist)) if (w.nav.dist[id]) w.nav.dist[id].set(d);
  w.nav.dirtySet = new Set(nav.dirty);
  // fields added since this game was saved start empty: build them first
  for (const id of w.nav.order) if (!(id in nav.dist)) w.nav.dirtySet.add(id);
  Object.assign(w.nav.last, nav.last);
  for (const a of w.agents) if (a.mem) a.mem = newMemory(a.mem);
  // deaths from before the bestiary: causes are «от …» now, beasts go by their plural name (settlement/chronicle.js)
  for (const k of Object.keys(w.chronicle.deaths || {})) {
    if (k === 'налётчики' || k.startsWith('от ') || SPECIES.all().some(s => s.plural === k || s.label === k)) continue;
    w.chronicle.deaths['от ' + k] = (w.chronicle.deaths['от ' + k] || 0) + w.chronicle.deaths[k]; delete w.chronicle.deaths[k];
  }
  // multipliers added since the save (SPECIAL, races) start neutral
  for (const a of w.agents) if (a.mods) for (const [k, v] of Object.entries(BASE_MODS)) a.mods[k] ??= v;
  // creatures from before SPECIAL get theirs now, the same every time this save is loaded
  // (their body is rebuilt just below, health keeps its share)
  for (const a of w.agents) {
    const sp = SPECIES.get(a.species);
    if (a.special || !sp.special) continue;
    rollCreature({rngs: {birth: mulberry(a.id * 6151 + 3)}}, a, sp);
    a.bodyVer = 0;   // its saved mods know nothing of SPECIAL: rebuild them below
  }
  // bodies from before refreshBody (agents/special.js): what the sources do not explain is kept as the
  // creature's own extra; a body that never had SPECIAL is simply rebuilt
  for (const a of w.agents) {
    if (!a.mods || a.bodyVer === BODY_VER) continue;
    if (a.bodyVer === 0) { delete a.own; refreshBody(a); a.bodyVer = BODY_VER; }
    // built from sources already (stage 1 on): only a rule has changed since (aim and dodge left Luck)
    else if (a.bodyVer >= 1) { refreshBody(a); a.bodyVer = BODY_VER; }
    else adoptBody(a);
  }
  // skills kept under job ids before the skill catalogue (data/skills.js): each skill takes the best of its jobs
  for (const a of w.agents) migrateSkills(a);
  // colonists from before food preferences: give them some, the same every time this save is loaded
  for (const a of w.agents) if (a.prefs && !a.food) a.food = drawFoodPrefs(mulberry(a.id * 7919 + 17));
  // jobs and skills added since the save (herding, burials): neutral about them, no skill yet
  for (const a of w.agents) if (a.prefs) {
    for (const id of JOBS.ids()) a.prefs[id] ??= 1;
    for (const s of activeSkills()) a.skill[s.id] ??= 0;
  }
  w.perf = {fields: 0, nav: 0, agents: 0, render: 0};
  ensureFlows(w);   // arrivals added since the save get their first date (draws from the restored random stream)
  return w;
}

// Everything the first tick will look up by id must exist in this build. A save from a newer build
// (or another branch) is refused here, before it replaces the running game, with the reason.
function checkKnown(w) {
  const bad = new Set();
  for (const a of w.agents || []) {
    if (!SPECIES.has(a.species)) bad.add(`вид «${a.species}»`);
    if (!BRAINS.has(a.brain)) bad.add(`поведение «${a.brain}»`);
    if (TASK_BRAINS.has(a.brain) && a.task && !TASKS.has(a.task.id)) bad.add(`задача «${a.task.id}»`);
    if (a.task?.id === 'job' && !JOBS.has(a.task.job)) bad.add(`работа «${a.task.job}»`);
    for (const it of Object.values(a.equip || {})) if (it?.type && !ITEMS.has(it.type)) bad.add(`предмет «${it.type}»`);
    for (const r of Object.keys(a.carry?.res || {})) if (!RESOURCES.has(r)) bad.add(`ресурс «${r}»`);
  }
  for (const it of w.armory || []) if (it?.type && !ITEMS.has(it.type)) bad.add(`предмет «${it.type}»`);
  if (bad.size) throw new Error(`Сохранение сделано другой версией игры: эта сборка не знает ${[...bad].slice(0, 4).join(', ')}.`);
}

// a fingerprint of the full state: two worlds with the same hash are the same world
export function worldHash(w) {
  const sv = saveWorld(w), s = JSON.stringify(sv.tree) + JSON.stringify(sv.rngs);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// Saving and loading a whole game. The world is plain data (see core/serialize.js); the few live
// parts are rebuilt around it: the random stream continues from its saved position, navigation
// gets its distance fields back as they were (stale ones stay stale, so the game goes on exactly
// as it would have), agents' memories get their "unknown reads as 0" wrapper again.
// A loaded game continues tick for tick like the one that was saved (tools/determinism.mjs checks it).
import {encode, decode} from '../core/serialize.js';
import {Registry} from '../core/registry.js';
import * as PRESETS from '../data/presets.js';
import {mulberry} from '../core/rng.js';
import {Navigation} from '../nav/navigation.js';
import {newMemory} from '../agents/agent.js';
import {VERSION} from '../version.js';
import {ensureOre} from './ores.js';
import {recomputeMods} from '../settlement/mods.js';
import {RESOURCES} from '../data/resources.js';
import {drawFoodPrefs} from '../data/foods.js';

export const SAVE_FORMAT = 1;

// world keys that are rebuilt rather than saved
const LIVE = new Set(['nav', 'rng', 'astar', 'perf', 'scratch']);

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
    {externals: externals(), skip: (path, k) => path === 'world.world' && LIVE.has(k)});
  return {format: SAVE_FORMAT, version: VERSION, name: w.cfg.name, tick: w.tick, savedAt: Date.now(), rng: w.rng.state, tree};
}

export function loadWorld(save) {
  if (!save || save.format !== SAVE_FORMAT) throw new Error('Это не сохранение «Тёплого Брода» или оно из несовместимой версии.');
  const {world: w, nav} = decode(save.tree, {externals: externals()});
  ensureOre(w);
  recomputeMods(w);   // building effects as this version defines them
  for (const r of RESOURCES.all()) w.stock[r.id] ??= 0;
  w.rng = mulberry(0); w.rng.state = save.rng;
  w.nav = new Navigation(w);
  for (const [id, d] of Object.entries(nav.dist)) if (w.nav.dist[id]) w.nav.dist[id].set(d);
  w.nav.dirtySet = new Set(nav.dirty);
  // fields added since this game was saved start empty: build them first
  for (const id of w.nav.order) if (!(id in nav.dist)) w.nav.dirtySet.add(id);
  Object.assign(w.nav.last, nav.last);
  for (const a of w.agents) if (a.mem) a.mem = newMemory(a.mem);
  // colonists from before food preferences: give them some, the same every time this save is loaded
  for (const a of w.agents) if (a.prefs && !a.food) a.food = drawFoodPrefs(mulberry(a.id * 7919 + 17));
  w.perf = {fields: 0, nav: 0, agents: 0, render: 0};
  return w;
}

// a fingerprint of the full state: two worlds with the same hash are the same world
export function worldHash(w) {
  const s = JSON.stringify(saveWorld(w).tree);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

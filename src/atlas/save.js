// Saving and loading a world map with its chronicle. The world is plain data and goes through the
// same codec as a saved game (core/serialize.js): registry definitions are written by name. The only
// live part is the random stream of history, which is saved by its position and rebuilt from the
// seed on load, so a world saved in the middle of history goes on season for season exactly as it
// would have (tools/atlas-save-check.mjs checks it). Scratch buffers of the path search are not
// saved: they are rebuilt on first use.
//
// A world is kept whole, not as seed and settings: a change to the generator gives the same seed a
// different world, and the chronicle of the saved one is worth keeping (docs/CAMPAIGN.md).
import {encode, decode} from '../core/serialize.js';
import {Registry} from '../core/registry.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {VERSION} from '../version.js';
import {atlasHash, atlasDone, landDone} from './generate.js';
import {ATLAS_SIZES} from '../data/atlas.js';
import {shapeCount} from './shape.js';
import {yearsLived} from './history.js';
import {questHint} from './calamity.js';
import {upgradePersons} from './persons.js';

export const WORLD_KIND = 'forest-world';
// a land («Создать землю»): the atlas made to the end of its land stages, with no peoples and no history yet, and
// the hand's edits in its settings (atlas/shape.js). The same codec; its own kind, so the library and the file
// tell it from a world, and «Заселение мира» takes it to run history on (docs/WORLD.md)
export const LAND_KIND = 'forest-land';
export const WORLD_FORMAT = 1;
const FORMATS = [1];

// world keys rebuilt on first use rather than saved: the scratch of A* on land and at sea, the
// buffers of the rot; `ms` (how long each stage took) belongs to this machine and this run; the caches of the land that
// does not change — the roads' base costs by people (atlas/roads.js), the cells' place answers (atlas/sites.js) — are
// worked out again from the land and the tables of this run (a world opened under other table edits takes them as they are now)
const SCRATCH = new Set(['roadScratch', 'seaScratch', 'rotBuf', 'ms', 'roadBase', 'needCache']);
const HIST_LIVE = new Set(['rnd']);

function externals() {
  const m = new Map();
  for (const r of Registry.list) for (const d of r.all()) m.set(d, `${r.kind}:${d.id}`);
  return m;
}

// what a list of saved worlds shows without opening the world itself
export function worldMeta(a, name, kind = WORLD_KIND) {
  const towns = (a.towns || []).filter(t => t.alive).length;
  return {
    type: kind === LAND_KIND ? 'land' : 'world', shape: shapeCount(a.cfg.shape),
    name: name || (kind === LAND_KIND ? `Земля ${a.cfg.seed}` : `Мир ${a.cfg.seed}`), seed: a.cfg.seed, size: a.cfg.size, sizeLabel: ATLAS_SIZES[a.cfg.size]?.label || a.cfg.size,
    year: a.hist?.year ?? 0, lived: yearsLived(a), done: atlasDone(a), land: landDone(a), towns, realms: (a.realms || []).length,
    lines: a.chronicle.length, hash: atlasHash(a), version: VERSION, epic: !!a.cfg.epic, free: !!a.cfg.free,
    // made under table edits (src/data/schema/layer.js): how many
    tables: a.tables?.n || 0,
    // a campaign under way in this world (campaign/): where it is
    campaign: a.campaign ? {phase: a.campaign.phase, day: a.campaign.day, from: a.campaign.capitalFrom || a.campaign.capitalName, crown: a.campaign.quest?.name || null} : null,
    // campaigns finished in this world (campaign/ending.js): their chronicles stay with it
    campaigns: (a.campaignsDone || []).length,
    // what quest a caravan from this world goes on (atlas/calamity.js questHint): 'hand' | 'epic' | null — the crown
    quest: kind === LAND_KIND ? null : questHint(a),
  };
}

export function saveAtlas(a, name, kind = WORLD_KIND) {
  if (kind === LAND_KIND && (!landDone(a) || a.hist)) throw new Error('Землёй сохраняется только суша без истории.');
  const tree = encode(a, {
    externals: externals(),
    skip: (path, k) => (path === 'world' && SCRATCH.has(k)) || (path === 'world.hist' && HIST_LIVE.has(k)) || (path === 'world.fauna' && k === 'buf'),   // (fauna.buf: a season's buffers, atlas/fauna.js)
  });
  return {kind, format: WORLD_FORMAT, version: VERSION, savedAt: Date.now(), meta: worldMeta(a, name, kind), histRnd: a.hist ? a.hist.rnd.state : null, tree};
}

export const isWorldSave = s => !!s && (s.kind === WORLD_KIND || s.kind === LAND_KIND);
export const isLandSave = s => !!s && s.kind === LAND_KIND;

export function loadAtlas(save) {
  if (!isWorldSave(save)) throw new Error('Это не сохранённый мир или земля «Тёплого Брода».');
  if (!FORMATS.includes(save.format)) throw new Error('Мир сохранён в более новой версии игры.');
  const a = decode(save.tree, {externals: externals()});
  a.ms = {};
  if (a.hist) {
    a.hist.rnd = mulberry(seedNumber(`${a.cfg.seed}:atlas:history`));
    a.hist.rnd.state = save.histRnd;
    upgradePersons(a);   // a world saved before the persons: its leaders and courts become persons (atlas/persons.js)
  }
  return a;
}

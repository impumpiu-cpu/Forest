// The minds' baseline (docs/BEHAVIOUR.md «Договор решения»): fingerprints of the runs every mind of the game takes part
// in — the settlement (the creatures' and the colonists' minds), the world's history (the towns, the councils, the courts,
// the lairs and their leaders) and the campaign (the caravan's evening and its stops) — so that moving a mind onto the
// common contract can be checked to change nothing. Each run gives the game's own fingerprint and a hash of its whole save.
//   node tools/minds-baseline.mjs            compare with tools/minds-baseline.json
//   node tools/minds-baseline.mjs --write    write the file anew (after a change that is meant to change the game)
//   node tools/minds-baseline.mjs --only=settlement|world|campaign
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {saveWorld, worldHash} from '../src/world/save.js';
import {DAY} from '../src/core/time.js';
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';
import {capitals, newCampaign, runCampaign, campaignHash} from '../src/campaign/index.js';
import {CAMPAIGN} from '../src/data/campaign.js';

const FILE = new URL('./minds-baseline.json', import.meta.url);
const args = process.argv.slice(2), write = args.includes('--write');
const only = (args.find(x => x.startsWith('--only=')) || '').slice(7);
// the hash of a save, without the moment it was made
const bare = (k, v) => (k === 'savedAt' || k === 'saved' ? undefined : v);
const fnv = s => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const out = {};
// world/save.js worldHash, of the save without the leanings (data/leans.js) and their stream: what the game was before them
function neutralHash(w) {
  const sv = saveWorld(w), drop = (k, v) => (k === 'leans' || k === 'profile' ? undefined : v);   // (and the run's profile in its settings)
  const s = JSON.stringify(sv.tree, drop) + JSON.stringify(sv.rngs, drop);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
const t0 = Date.now(), lap = what => console.log(`  ${what}: ${((Date.now() - t0) / 1000).toFixed(1)} с`);

// the settlement: three seeds, four days, everything that comes to a settlement turned up
if (!only || only === 'settlement') {
  for (const seed of [DEFAULT_CFG.seed, 'x7', 'fpl']) {
    const w = newGame({...DEFAULT_CFG, seed, raids: 'often', wildlife: 'many', predators: 'many'});
    for (let t = 0; t < 4 * DAY && !w.over; t++) step(w);
    out[`settlement:${seed}`] = {hash: worldHash(w), save: fnv(JSON.stringify(saveWorld(w), bare)), tick: w.tick};
    // the same run without the leanings' weight (the profile «без влияния склонностей»), its fingerprint without the leanings
    // themselves: the game as it was before them — compared with the fingerprint the baseline kept from before (`neutral`)
    const n = newGame({...DEFAULT_CFG, seed, raids: 'often', wildlife: 'many', predators: 'many', profile: 'noLeans'});
    for (let t = 0; t < 4 * DAY && !n.over; t++) step(n);
    out[`settlement:${seed}`].neutral = neutralHash(n);
  }
  lap('поселение');
}

// the world: two small worlds through their whole history
if (!only || only === 'world') {
  for (const seed of ['minds1', 'minds2']) {
    const a = generateAtlas({...DEFAULT_ATLAS_CFG, seed, size: 'small'});
    out[`world:${seed}`] = {hash: atlasHash(a), save: fnv(JSON.stringify(saveAtlas(a, 'эталон'), bare)), year: a.hist.year, chronicle: a.chronicle.length};
  }
  lap('мир');
}

// the campaign: a caravan from one capital of each people, on two worlds, the fights settled at once
if (!only || only === 'campaign') {
  for (const seed of ['777', '790']) {
    const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
    const frozen = JSON.stringify(saveAtlas(base));
    const caps = capitals(base);
    for (const p of CAMPAIGN.peoples) {
      const c = caps.find(x => x.people === p);
      if (!c) continue;
      const a = loadAtlas(JSON.parse(frozen));
      newCampaign(a, c.town, {mode: 'auto'});
      const K = runCampaign(a);
      out[`campaign:${seed}:${p}`] = {hash: campaignHash(K), world: atlasHash(a), day: K.day, why: fnv(JSON.stringify(K.log || K.chronicle || []))};
    }
  }
  lap('поход');
}

if (write) {
  const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  writeFileSync(FILE, JSON.stringify({...old, ...out}, null, 1) + '\n');
  console.log(`записано ${Object.keys(out).length} прогонов в tools/minds-baseline.json`);
} else {
  if (!existsSync(FILE)) { console.log('нет tools/minds-baseline.json: сначала --write'); process.exit(1); }
  const ref = JSON.parse(readFileSync(FILE, 'utf8'));
  let bad = 0;
  for (const [k, v] of Object.entries(out)) {
    const r = ref[k], want = f => (f === 'neutral' && r && r.neutral == null ? r.hash : r?.[f]), diff = r ? Object.keys(v).filter(f => want(f) !== v[f]) : ['нет в эталоне'];
    if (diff.length) bad++;
    console.log(`${diff.length ? 'FAIL' : 'ok  '} ${k}${diff.length ? ': ' + diff.map(f => `${f} ${want(f)} → ${v[f]}`).join(', ') : ''}`);
  }
  if (bad) process.exit(1);
}

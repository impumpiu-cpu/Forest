// The humans and the dwarves' strangers (docs/WORLD.md «Асимметрия народов»): the middling people that takes in everyone
// and breeds crime for it, its tilt-yard, hippodrome, den and trading post, the knights and the host; the dwarves who push
// strangers out. `npm run humans`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
import {speedOf} from '../src/agents/movement.js';
import {kitRole} from '../src/agents/tactics.js';
import {newItem, dress} from '../src/agents/equipment.js';
import {eligible, putUp} from '../src/settlement/buildings.js';
import {recomputeMods} from '../src/settlement/mods.js';
import {caravanChance} from '../src/outside/scripted.js';
import {spawnGroup} from '../src/settlement/migration.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {realmBand} from '../src/atlas/towns.js';
import {stepDiplomacy} from '../src/atlas/diplomacy.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {RUINS} from '../src/data/kingdom.js';
import {RAID_BANDS} from '../src/data/raids.js';
import {roleKit, rolesOf} from '../src/data/roles.js';
import {ITEMS} from '../src/data/items.js';
import {mulberry} from '../src/core/rng.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const game = (seed = 'humans') => { const w = newGame({...DEFAULT_CFG, seed, size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'}); w.agents = []; return w; };

// the people
{
  const H = WORLD_PEOPLES.get('humans'), D = WORLD_PEOPLES.get('dwarves');
  check('люди принимают чужих в полтора раза охотнее и теплеют от торговли; толпа чужих растит преступность; дварфы чужих почти не берут',
    H.folk.take > 1 && H.trade > 1 && RUINS.get('crime').grows.folk > 0 && D.folk.take < 1 && D.folk.expel > 0 && D.folk.push > 1);
}
// the dwarves push strangers out of their towns; the world: the humans' host by what the realm has built
{
  const a = generateAtlas({seed: '5', size: 'small', land: 1, plates: 1, hemisphere: 'north'});
  // (a town on many routes with humans takes some back by trade: the push is measured against the same world without it)
  const saved = saveAtlas(a, 'humans'), b = loadAtlas(structuredClone(saved));
  const t = a.towns.find(x => x.alive && x.people === 'dwarves'), tb = b.towns.find(x => x.id === t.id); t.folk = {humans: 0.2}; tb.folk = {humans: 0.2};
  const lines = []; stepDiplomacy(a, mulberry(1), s => lines.push(s), () => 0);
  const ex = WORLD_PEOPLES.get('dwarves').folk.expel; WORLD_PEOPLES.get('dwarves').folk.expel = 0;
  stepDiplomacy(b, mulberry(1), () => {}, () => 0);
  WORLD_PEOPLES.get('dwarves').folk.expel = ex;
  const now = t.folk.humans || 0, kept = tb.folk.humans || 0;
  check('дварфы выживают чужаков из своих городов', now < kept && Math.abs(kept - now - Math.min(ex, 0.2)) < 1e-6, `люди ${0.2} → ${now.toFixed(3)}, без выселения ${kept.toFixed(3)}`);
  const r = a.realms.find(x => x.people === 'humans'), town = a.towns.find(x => x.alive && x.realm === r.id);
  const was = [...town.built]; town.built = was.filter(id => !['tiltyard', 'hippodrome', 'den'].includes(id));
  const plain = realmBand(a, r.id, 'humans');
  const others = a.towns.filter(x => x.alive && x.realm === r.id && x !== town); const keep = others.map(x => x.built); for (const x of others) x.built = x.built.filter(id => !['tiltyard', 'hippodrome', 'den'].includes(id));
  const p0 = realmBand(a, r.id, 'humans'); town.built.push('tiltyard', 'hippodrome', 'den'); const p1 = realmBand(a, r.id, 'humans');
  others.forEach((x, k) => { x.built = keep[k]; }); town.built = was;
  check('дружина людей — по постройкам державы: без ристалища — ополчение, с ристалищем, ипподромом и притоном — рыцари, конница, головорезы', p0 === 'host' && p1 === 'host:khd', `${plain} · ${p0} → ${p1}`);
}
// the knights
{
  const B = RAID_BANDS.get('host:khd'), list = Array.from({length: 10}, (_, k) => B.members(null, mulberry(k), 2500, 20)).flat(), roles = new Set(list.map(m => m.role));
  const plain = Array.from({length: 10}, (_, k) => RAID_BANDS.get('host').members(null, mulberry(k), 2500, 20)).flat();
  const kit = roleKit('human', 'knight', mulberry(2), 0).map(id => ITEMS.get(id.split(/[~+@$!]/)[0]));
  check('рыцарь — тяжёлый доспех и щит, металл на ступень выше банды; конный рыцарь; в простой дружине рыцарей нет; сами по себе рыцари не набираются',
    roles.has('knight') && roles.has('horseknight') && roles.has('cutthroat') && !plain.some(m => m.role === 'knight' || m.role === 'cutthroat') && kit.some(d => d?.form === 'shield') && !rolesOf('human').some(([r]) => r === 'knight'),
    [...roles].join(', '));
  const w = game(); w.camp ||= {x: 40, y: 40};
  let g = [], champs = true;
  for (let k = 0; k < 40 && !g.some(a => a.mount); k++) { const one = spawnGroup(w, 'raiders', 2500, {band: 'host:kh'}); champs &&= one.filter(a => a.marks?.includes('champion')).length === 1; g = [...g, ...one]; }
  const rider = g.find(a => a.mount), foot = g.find(a => !a.mount);
  check('конный рыцарь скачет на коне; в дружине с ристалищем — один чемпион', !!rider && rider.mount.species === 'horse' && speedOf(w, rider) > speedOf(w, foot) * 0.9 && champs,
    `${g.length} бойцов, конных ${g.filter(a => a.mount).length}`);
  const kn = createAgent(w, 'human', 'colony', 10, 10); kn.place = 'knight'; kn.equip.right = null; kn.equip.left = null; kn.equip.body = null;
  dress(kn, [newItem('sword'), newItem('shield'), newItem('lamellar')]);
  check('рыцарь каравана в тяжёлом доспехе со щитом бьётся рыцарем', kitRole(kn) === 'knight', kitRole(kn) || '—');
}
// the colony
{
  const w = game(), cx = Math.floor(w.w / 2), cy = Math.floor(w.h / 2);
  for (let k = 0; k < 4; k++) createAgent(w, 'human', 'colony', cx + k, cy);
  recomputeMods(w); const c0 = caravanChance(w);
  const tp = eligible(w, 'tradepost'), den = eligible(w, 'den');
  putUp(w, 'tradepost'); recomputeMods(w); const c1 = caravanChance(w);
  const d = game('d'); for (let k = 0; k < 4; k++) createAgent(d, 'dwarf', 'colony', cx + k, cy);
  check('поселение людей: торговый пост — караваны чаще; притон есть; у дварфов их нет', tp && den && c1 > c0 && !eligible(d, 'tradepost'), `шанс ${c0.toFixed(2)} → ${c1.toFixed(2)}`);
}

if (fail.length) process.exit(1);

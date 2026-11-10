// The pieces of terrain of a camp's map (world/pieces.js, data/pieces.js; plan claude/terrain-pieces-plan.md):
//   - the generator: on many maps every anchor and cache can be walked to from the camp, the camp's ring stays clear,
//     the water and the roads are never built over, the same site lays out the same map, a site without a layout has none;
//   - the scenes: a storm or a boss lays its scene by the foe (the dead — a graveyard, a tribe — a stockade …), its heart
//     with the anchor far from the camp;
//   - the fight: a wall stops a shot as rock does, a barricade gives cover to the one behind it;
//   - the campaign: a storm's guards stand at the heart; the caches are searched and their finds come into the caravan;
//     a camp kept from before the pieces is played without them.
//   node tools/pieces-check.mjs [maps]
import {makeTerrain} from '../src/world/generate.js';
import {reachFrom, sceneFor} from '../src/world/pieces.js';
import {T, BY_CODE} from '../src/data/terrain.js';
import {PIECES, SCENES, PIECE_RULES, PIECE_FINDS, LEGEND} from '../src/data/pieces.js';
import {RESOURCES} from '../src/data/resources.js';
import {ITEMS} from '../src/data/items.js';
import {lineOfFire, coverOnLine} from '../src/nav/astar.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, campOutcome, stepCamp, campDone} from '../src/campaign/camp.js';
import {applyCamp} from '../src/campaign/fight.js';

let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const MAPS = +(process.argv[2] || 40);

// ── the tables
{
  const bad = [];
  for (const p of PIECES) {
    for (const row of p.mask) for (const ch of row) if (ch !== ' ' && !LEGEND[ch]) bad.push(`${p.id}: знак «${ch}»`);
    if (p.finds && !PIECE_FINDS[p.finds]) bad.push(`${p.id}: нет находок ${p.finds}`);
    if (p.layer === 'heart' && !p.mask.some(r => /[Aa]/.test(r))) bad.push(`${p.id}: у сердца нет якоря`);
  }
  for (const [id, S] of Object.entries(SCENES)) { if (!PIECES.some(p => p.id === S.heart)) bad.push(`сцена ${id}: нет сердца ${S.heart}`); for (const [pid] of S.scatter) if (!PIECES.some(p => p.id === pid)) bad.push(`сцена ${id}: нет лекала ${pid}`); }
  for (const [id, F] of Object.entries(PIECE_FINDS)) { for (const r of Object.keys(F.goods || {})) if (!RESOURCES.has(r)) bad.push(`находки ${id}: ресурс ${r}`); for (const it of Object.keys(F.items || {})) if (!ITEMS.has(it)) bad.push(`находки ${id}: вещь ${it}`); }
  check('справочник лекал, сцен и находок сходится', !bad.length, bad.join('; '));
}

// ── the generator on many maps
const BIOME_SETS = [{forest: 0.5, meadow: 0.4, swamp: 0.1}, {steppe: 0.7, meadow: 0.2, foothills: 0.1}, {taiga: 0.6, highlands: 0.3, tundra: 0.1}, {jungle: 0.6, swamp: 0.3, savanna: 0.1}];
const LORES = [{}, {ruin: 1}, {graves: 0.3, rot: 0.4}, {battle: 0.6}, {beasts: 1, river: 1}, {spiders: 1}, {tribe: 1, ruin: 1}];
const FOES = [{kind: 'bandits', band: 'bandits'}, {kind: 'undead', band: 'undead'}, {kind: 'tribe', band: 'goblins'}, {kind: 'wolves', beast: 'wolves'}, {kind: 'lair', beast: 'spiders'}, {kind: 'cultists', band: 'cultists'}];
const KINDS = ['night', 'ambush', 'stop', 'guard'];
const siteOf = (k, layout = true) => {
  const biomes = BIOME_SETS[k % BIOME_SETS.length], kind = KINDS[k % KINDS.length], foe = kind === 'stop' ? null : FOES[k % FOES.length];
  const gates = [{kind: 'road', side: ['north', 'east', 'south', 'west'][k % 4], at: 0.3 + (k % 5) / 10}];
  if (k % 3 === 0) gates.push({kind: 'road', side: ['south', 'west', 'north', 'east'][k % 4], at: 0.5});
  if (k % 4 === 1) gates.push({kind: 'river', role: 'source', side: 'west', at: 0.4, wide: false}, {kind: 'river', role: 'mouth', side: 'east', at: 0.6, wide: false});
  return {seed: `pieces-check:${k}`, w: 64, h: 48, biomes, water: 0.06 + (k % 3) * 0.03, rock: 0.06 + (k % 4) * 0.03, trees: 1, fert: 1, startDay: 0,
    region: {biomes, road: 1.2, river: k % 4 === 1 ? 0.6 : 0}, climate: {}, gates, lore: LORES[k % LORES.length],
    ...(layout ? {layout: {v: 1, kind, scene: kind === 'guard' || k % 11 === 0, foe}} : {})};
};
{
  const unreached = [], nearCamp = [], drowned = [], counts = {}, scenes = {}, kinds = new Set();
  let maps = 0, pieces = 0, caches = 0, sameAll = true, edgesKept = true;
  for (let k = 0; k < MAPS; k++) {
    const site = siteOf(k), t = makeTerrain(site), plain = makeTerrain(siteOf(k, false));
    maps++;
    const n = t.w * t.h, reach = reachFrom(t, t.cy * t.w + t.cx), reach0 = reachFrom(plain, plain.cy * plain.w + plain.cx);
    // whatever could leave the map before still can: an edge cell reached on the plain map and on this one
    const edge = r => { for (let i = 0; i < n; i++) { const x = i % t.w, y = (i / t.w) | 0; if ((x === 0 || y === 0 || x === t.w - 1 || y === t.h - 1) && r[i]) return true; } return false; };
    if (edge(reach0) && !edge(reach)) edgesKept = false;
    for (const p of t.pieces) {
      pieces++; counts[p.layer] = (counts[p.layer] || 0) + 1; kinds.add(p.id);
      for (const i of [p.anchor, ...p.caches]) if (i != null && !reach[i]) unreached.push(`${site.seed}/${p.id}`);
      caches += p.caches.length;
      if (p.layer !== 'road') for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
        const i = y * t.w + x;
        if (t.terr[i] !== plain.terr[i] && Math.hypot(x - t.cx, y - t.cy) < PIECE_RULES.keep - 1) nearCamp.push(`${site.seed}/${p.id}`);
        if ((plain.terr[i] === T.WATER || plain.terr[i] === T.FORD) && t.terr[i] !== plain.terr[i] && BY_CODE[t.terr[i]].kind === 'built') drowned.push(`${site.seed}/${p.id}`);
      }
    }
    if (t.scene) scenes[t.scene.id] = (scenes[t.scene.id] || 0) + 1;
    if (k < 8) { const again = makeTerrain(siteOf(k)); if (again.terr.join() !== t.terr.join() || JSON.stringify(again.pieces) !== JSON.stringify(t.pieces)) sameAll = false; }
    if (plain.pieces) sameAll = false;
  }
  check(`на ${maps} картах лекала ложатся`, pieces >= maps * 2, `всего ${pieces} (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}), видов ${kinds.size}, тайников ${caches}`);
  check('каждый якорь и тайник достижим от лагеря', !unreached.length, unreached.slice(0, 6).join(', '));
  check('из лагеря по-прежнему можно уйти за край карты', edgesKept);
  check('лагерь и кольцо судес не застроены', !nearCamp.length, [...new Set(nearCamp)].slice(0, 6).join(', '));
  check('на воде не строят стен', !drowned.length, [...new Set(drowned)].slice(0, 6).join(', '));
  check('тот же сид — та же карта; без раскладки лекал нет', sameAll);
  check('сцены бывают разные', Object.keys(scenes).length >= 3, JSON.stringify(scenes));
}

// ── the scenes by the foe
{
  const want = [[{kind: 'undead', band: 'undead'}, 'necropolis'], [{kind: 'tribe', band: 'goblins'}, 'warcamp'], [{kind: 'lair', beast: 'spiders'}, 'nest'],
    [{kind: 'wolves', beast: 'wolves'}, 'den'], [{kind: 'cultists', band: 'cultists'}, 'keep'], [{kind: 'lair', boss: 'demon'}, 'rift'], [{kind: 'bandits', band: 'bandits'}, 'warcamp']];
  const bad = want.filter(([f, s]) => sceneFor(f) !== s).map(([f, s]) => `${JSON.stringify(f)} → ${sceneFor(f)} (ждали ${s})`);
  check('сцена по врагу', !bad.length, bad.join('; '));
  const far = [];
  for (let k = 0; k < 12; k++) {
    const site = siteOf(k * 4 + 3), t = makeTerrain(site);   // the guards' storms
    const a = t.scene?.anchor; if (a == null) { far.push(`${site.seed}: нет якоря`); continue; }
    const d = Math.hypot((a % t.w) - t.cx, ((a / t.w) | 0) - t.cy);
    if (d < PIECE_RULES.heartKeep - 2) far.push(`${site.seed}: ${d.toFixed(1)}`);
  }
  check('сердце сцены с якорем далеко от лагеря', !far.length, far.join('; '));
}

// ── the fight: a wall and a barricade
{
  const w = {w: 9, h: 3, n: 27, grid: {terr: new Uint8Array(27).fill(T.GRASS)}};
  check('по чистому полю стрела летит, укрытия нет', lineOfFire(w, 0.5, 1.5, 8.5, 1.5) && coverOnLine(w, 0.5, 1.5, 8.5, 1.5) === 0);
  w.grid.terr[1 * 9 + 4] = T.WALL;
  check('кладка держит стрелу, как скала', !lineOfFire(w, 0.5, 1.5, 8.5, 1.5));
  w.grid.terr[1 * 9 + 4] = T.GRASS; w.grid.terr[1 * 9 + 7] = T.BARRICADE;
  check('завал перед целью — укрытие', Math.abs(coverOnLine(w, 0.5, 1.5, 8.5, 1.5) - BY_CODE[T.BARRICADE].cover) < 1e-6);
  check('свой завал у стрелка не укрывает цель', coverOnLine(w, 8.5, 1.5, 0.5, 1.5) === 0);
}

// ── the campaign: a storm, a stop, an old camp
const base = generateAtlas({seed: '790', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0}), fz = JSON.stringify(saveAtlas(base));
const fresh = k => { const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, capitals(a)[k % capitals(a).length].town, {mode: 'local'}); K.day = 10 + k; return {a, K}; };
const run = (S, ticks = 4 * 2400) => { const w = openCamp(S); for (let g = 0; g < ticks && !campDone(w); g++) stepCamp(w); return {w, o: campOutcome(w)}; };
{
  const {a, K} = fresh(0);
  const S = campSetup(a, K, {kind: 'guard', dayIn: 0, foe: {kind: 'undead', strength: 0.6, band: 'undead', label: 'мертвецы'}});
  const w = openCamp(S);
  check('штурм раскладывается сценой', S.layout?.scene && w.scene?.id === 'necropolis' && w.pieces.some(p => p.layer === 'heart'), JSON.stringify(w.scene));
  for (let g = 0; g < 4000 && !w.campaign.spawned; g++) stepCamp(w);
  const A = w.scene?.anchor, ax = A % w.w, ay = (A / w.w) | 0;
  const near = w.campaign.foeObjs.filter(o => Math.hypot(o.x - ax, o.y - ay) < 8).length;
  check('стража стоит у сердца сцены', w.campaign.foeObjs.length > 0 && near >= Math.ceil(w.campaign.foeObjs.length / 2), `${near} из ${w.campaign.foeObjs.length}`);
}
{
  // stops of a few campaigns: some map holds a cache; it is searched (on the map, with no foe about) and comes into the caravan
  let shown = false;
  for (let k = 0; k < 12 && !shown; k++) {
    const {a, K} = fresh(k); K.day += k * 3;
    const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), probe = openCamp(S);
    if (!(probe.works || []).some(x => x.key === 'cache')) continue;
    shown = true;
    check('тайник поначалу никому не известен и не работа', probe.works.filter(x => x.key === 'cache').every(x => x.hidden && !x.done));
    // the camp played tick by tick: no chore run to by the crowd (the mark «занято», settlement/works.js), caches seen first
    const w = openCamp(S); let crowd = 0, busy = 0;
    for (let g = 0; g < 4 * 2400 && !campDone(w); g++) {
      stepCamp(w);
      const on = new Map();
      for (const ag of w.campaign.people.values()) if (!ag.dead && ag.task?.id === 'campwork') on.set(ag.task.work, (on.get(ag.task.work) || 0) + 1);
      if (on.size) busy++;
      if ([...on.values()].some(n => n > 1)) crowd++;
    }
    const o = campOutcome(w);
    check('к одной работе не бегут гурьбой', crowd <= Math.max(2, busy * 0.02), `тиков с работами ${busy}, из них с двумя и больше на одной ${crowd}`);
    const caches = w.works.filter(x => x.key === 'cache');
    check('обыскан только замеченный тайник, и после того, как заметили', caches.every(x => !x.done || (x.spotted && !x.hidden)), caches.map(x => `${x.piece}: ${x.hidden ? 'не замечен' : `замечен ${x.spotted?.tick}`}${x.done ? ', обыскан' : ''}`).join('; '));
    check('незамеченные тайники утром не обыскивают', o.found.length === caches.filter(x => !x.hidden).length || o.found.length <= caches.filter(x => !x.hidden).length);
    const onMap = w.works.filter(x => x.key === 'cache' && x.done).length;
    check('на стоянке тайник обыскали на карте', onMap > 0 && o.found.some(f => !f.late), `обыскано ${onMap}, находок ${o.found.length}`);
    const gold0 = K.gold, cargo0 = Object.values(K.cargo).reduce((s, v) => s + v, 0), finds0 = K.stats.finds || 0;
    applyCamp(a, K, S, o, null, 'stop');
    const gold = o.found.reduce((s, f) => s + f.gold, 0);
    check('находки пришли в караван', K.gold >= gold0 + gold - 0.01 && (K.stats.finds || 0) >= finds0 + o.found.length && (K.stats.caches || 0) >= o.found.length,
      `золото ${gold0} → ${K.gold}, груз ${cargo0} → ${Object.values(K.cargo).reduce((s, v) => s + v, 0)}`);
    check('та же стоянка — те же находки', JSON.stringify(run(S).o.found) === JSON.stringify(o.found));
  }
  check('на какой-то из стоянок есть тайник', shown);
}
{
  const {a, K} = fresh(1);
  const S = campSetup(a, K, {kind: 'night', dayIn: 0, foe: {kind: 'bandits', strength: 0.6, band: 'bandits', label: 'разбойники'}});
  const old = {...S}; delete old.layout;
  const w = openCamp(old);
  check('стоянка, сохранённая до лекал, играется без них', !w.pieces.length && !w.scene && !(w.works || []).some(x => x.key === 'cache'));
}

console.log(ok ? '\nЛекала террейна: все проверки прошли.' : '\nЛекала террейна: есть ошибки.');
if (!ok) process.exit(1);

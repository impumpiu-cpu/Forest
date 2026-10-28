// World map check: the same seed gives the same world, every stage runs, the land share is what
// was asked, the edge of the world is sea, plates are whole, rocks and ores follow the geology, and
// the climate bands lie as the «Широты» setting says. Prints the shares of rocks and ores.
// Usage: node tools/atlas-check.mjs [seeds=3] [size=small]
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {ATLAS_LAND} from '../src/data/atlas.js';
import {ROCK_BY_CODE, ROCK_KINDS, ORE_GENESIS, PLATE_COUNTS} from '../src/data/geology.js';
import {levelOf} from '../src/atlas/geology.js';
import {latitude} from '../src/atlas/latitude.js';
import {biomeAt, soilAt, cellBiomes, dryness} from '../src/atlas/biomes.js';
import {BIOMES, KOPPEN} from '../src/data/biomes.js';
import {LAIRS} from '../src/data/lairs.js';
import {historyLength, eraPlan, epicYears} from '../src/atlas/history.js';
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {SPECIES} from '../src/data/species.js';
import {lineLevel, worldChronicleText, calamityChronicleText, eraSpans} from '../src/atlas/chronicle.js';
import {EPIC_YEARS} from '../src/data/history.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {TOWN_BUILDINGS, PLACE_NEEDS, EFFECTS, CATEGORIES} from '../src/data/townBuildings.js';
import {placeHas, townFx, room} from '../src/atlas/towns.js';
import {ROADS, SEA} from '../src/data/roads.js';
import {DIPLOMACY} from '../src/data/diplomacy.js';
import {scaleOf} from '../src/atlas/tectonics.js';
import {siteRadius} from '../src/atlas/sites.js';

const seeds = +(process.argv[2] || 3), size = process.argv[3] || 'small';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const kinds = {}, ores = {}, coalOnSed = [0, 0];
const bands = {tropic: [0, 0], subtropic: [0, 0], temperate: [0, 0]}, shadow = {lee: [0, 0], windward: [0, 0]};
const addTo = (acc, v) => { acc[0] += v; acc[1]++; };
const lakeRain = {fresh: [0, 0], salt: [0, 0]};
let lakesAll = 0, saltAll = 0, placerCells = 0;
const bioLat = {}, bioTrees = {}, bioCount = {}, soilFert = {};
const hist = {lanes: 0, harbors: 0, schisms: 0, moved: 0, realms: 0, kinWars: 0, undead: 0, undeadRaids: 0, undeadCleared: 0, tribes: 0, raidsWon: 0, raidsLost: 0, tribesCleared: 0, lairs: 0, alive: 0, lines: 0, worlds: 0, kinds: {}, towns: {}, pop: {}, built: {}, rel: {}, relN: {}, wars: 0, ruins: 0, trade: 0, cleared: 0, roads: 0, linked: [0, 0], sites: 0, stumps: 0, links: 0, thick: 0, flows: 0, fed: 0, feeders: 0, sent: 0, arrived: 0, partyLost: 0, wetParties: 0};

// the catalogue of town buildings holds together: links to the local map, prerequisites, conditions,
// peoples and effects are all known, and every people can house and feed a hamlet
{
  const bad = [];
  for (const b of TOWN_BUILDINGS.all()) {
    if (b.local && !BUILDINGS.has(b.local)) bad.push(`${b.id}: нет постройки локальной карты ${b.local}`);
    for (const id of [...(b.requires || []), ...(b.requiresAny || [])]) if (!TOWN_BUILDINGS.has(id)) bad.push(`${b.id}: требует неизвестное ${id}`);
    for (const nd of [...(b.needs || []), ...(b.needsAny || [])]) if (!(nd in PLACE_NEEDS)) bad.push(`${b.id}: неизвестное условие места ${nd}`);
    for (const p of b.peoples || []) if (!WORLD_PEOPLES.has(p)) bad.push(`${b.id}: неизвестный народ ${p}`);
    for (const k of Object.keys(b.fx)) if (!(k in EFFECTS)) bad.push(`${b.id}: неизвестный эффект ${k}`);
    if (!(b.cat in CATEGORIES)) bad.push(`${b.id}: неизвестная категория ${b.cat}`);
    for (const id of [...(b.requires || []), ...(b.requiresAny || [])]) if (TOWN_BUILDINGS.has(id) && TOWN_BUILDINGS.get(id).tier > b.tier && !(b.requiresAny || []).includes(id)) bad.push(`${b.id}: требует ${id}, который строится позже`);
  }
  for (const P of WORLD_PEOPLES.ids()) for (const cat of ['housing', 'food'])
    if (!TOWN_BUILDINGS.all().some(b => b.tier === 0 && b.cat === cat && (!b.peoples || b.peoples.includes(P)) && !b.needs && !b.requires && !b.requiresAny))
      bad.push(`${P}: в приюте нечего строить (${CATEGORIES[cat]}) без условий`);
  check('каталог построек мира сходится', !bad.length, bad.length ? bad.slice(0, 4).join('; ') : `построек: ${TOWN_BUILDINGS.all().length}, из них на локальной карте: ${TOWN_BUILDINGS.filter(b => b.local).length}`);
}

// towns stand on dry land, build only what their place allows, are joined by roads to their own
// people's neighbours; roads keep to the land; a people lives only where its land can hold it
function townsCheck(a, tag) {
  const f = a.f, lv = id => ORE_GENESIS.get(id).levels, k2 = (Math.min(a.w, a.h) / 192) ** 2;
  let wet = 0, misbuilt = '', seaRoad = 0, homeless = 0;
  for (const t of a.towns) {
    if (f.ocean[t.i] || f.lake[t.i] >= 0) wet++;
    // everything built fits the town's people, the place and what was built before it, within its max
    const seen = {}, seenSites = new Set();
    for (const id of t.built) {
      const b = TOWN_BUILDINGS.get(id);
      seen[id] = (seen[id] || 0) + 1;
      if (b.peoples && !b.peoples.includes(t.people)) misbuilt ||= `${t.name}: ${b.name} — не их постройка`;
      if (seen[id] > b.max) misbuilt ||= `${t.name}: ${b.name} больше ${b.max}`;
      const at = b.site ? (a.sites.find(s => s.alive && s.town === t.id && s.kind === id && !seenSites.has(s.id)) || null) : null;
      if (at) seenSites.add(at.id);
      const where = b.site ? at?.i : t.i;   // an outlying work has its place in its own cell
      if (b.site && at == null && t.alive) misbuilt ||= `${t.name}: ${b.name} без своей клетки`;
      if (where != null && b.needs && !b.needs.every(nd => nd === 'road' || placeHas(a, where, nd))) misbuilt ||= `${t.name}: ${b.name} не на своём месте`;
      if (where != null && b.needsAny && !b.needsAny.some(nd => nd === 'road' || placeHas(a, where, nd))) misbuilt ||= `${t.name}: ${b.name} не на своём месте`;
      // what it needed had to stand in its realm (atlas/towns.js canBuild): realms break and towns burn, so it is
      // enough that a town of the same people has or had it (a burnt outlying work: that it ever stood)
      const had = r => a.towns.some(o => o.people === t.people && o.built.includes(r)) || (TOWN_BUILDINGS.get(r).site && (a.sites || []).some(s => s.kind === r && a.towns.find(o => o.id === s.town)?.people === t.people));
      if (b.requires && !b.requires.every(had)) misbuilt ||= `${t.name}: ${b.name} без ${b.requires.join(', ')} в державе`;
      if (b.requiresAny && !b.requiresAny.some(had)) misbuilt ||= `${t.name}: ${b.name} без ${b.requiresAny.join(' / ')} в державе`;
    }
    if (t.alive && t.pop > Math.max(170, 1.1 * room(townFx(t)))) misbuilt ||= `${t.name}: ${Math.round(t.pop)} жителей в домах на ${room(townFx(t))}`;
    for (const id of t.built) hist.built[TOWN_BUILDINGS.get(id).cat] = (hist.built[TOWN_BUILDINGS.get(id).cat] || 0) + 1;
    hist.towns[t.people] = (hist.towns[t.people] || 0) + (t.alive ? 1 : 0);
    hist.pop[t.people] = (hist.pop[t.people] || 0) + (t.alive ? t.pop : 0);
  }
  for (let i = 0; i < a.n; i++) if (f.road[i] >= ROADS.levels[0].wear) { hist.roads++; if (f.ocean[i]) seaRoad++; }
  let landLane = 0; if (f.sea) for (let i = 0; i < a.n; i++) if (f.sea[i] >= SEA.levels[0].wear) { hist.lanes++; if (!f.ocean[i]) landLane++; }
  hist.harbors += a.towns.filter(t => t.alive && t.built.includes('harbor')).length;
  // the works of the towns stand on free land within their town's reach, one to a cell, and the
  // net of supply carries food between towns
  {
    const cells = new Set();
    let badSite = '';
    for (const s of a.sites || []) {
      if (!s.alive) continue;
      const t = a.towns.find(t => t.id === s.town);
      if (!t || !t.alive) badSite ||= `${TOWN_BUILDINGS.get(s.kind).name} без живого города`;
      else if (Math.max(Math.abs(t.x - s.x), Math.abs(t.y - s.y)) > siteRadius(a, t)) badSite ||= `${TOWN_BUILDINGS.get(s.kind).name} ${t.name} дальше ${siteRadius(a, t)} клеток`;
      else if (!t.built.includes(s.kind)) badSite ||= `${t.name}: ${TOWN_BUILDINGS.get(s.kind).name} стоит, а в городе не числится`;
      if (f.ocean[s.i] || f.lake[s.i] >= 0) badSite ||= `${TOWN_BUILDINGS.get(s.kind).name} в воде`;
      if (cells.has(s.i)) badSite ||= `две постройки в одной клетке`;
      cells.add(s.i);
      if (a.siteAt[s.i] !== s.id) badSite ||= `siteAt не сходится`;
      hist.sites++;
    }
    hist.stumps += (a.sites || []).filter(s => !s.alive && s.died > 0).length;
    for (const l of a.net?.links.values() || []) { hist.links++; if (l.c > 0.3) hist.thick++; if (l.flow > 0) hist.flows++; if (!(l.c >= 0 && l.c <= 1)) badSite ||= `проводимость ${l.c}`; }
    hist.fed += a.towns.filter(t => t.alive && t.supply && t.supply.got >= 0.2 * t.pop).length;
    hist.feeders += a.towns.filter(t => t.alive && t.supply && t.supply.gave >= 0.2 * t.pop).length;
    check(`${tag}: угодья городов стоят на своих клетках, сеть снабжения в пределах`, !badSite, badSite);
  }
  for (const pe of a.peoples) for (let j = 0; j < pe.u.length; j++) if (pe.u[j] > 0 && pe.K[j] <= 0) homeless++;
  // towns at least 6 years old with a town of their own people close by have a worn road at their door
  const towns = a.towns.filter(t => t.alive && a.hist.year - t.founded >= 6);
  for (const t of towns) {
    const mate = towns.some(o => o !== t && o.people === t.people && Math.hypot(o.x - t.x, o.y - t.y) < 0.5 * ROADS.reach * Math.sqrt(k2));
    if (!mate) continue;
    hist.linked[1]++;
    let road = false;
    for (let y = t.y - 2; y <= t.y + 2 && !road; y++) for (let x = t.x - 2; x <= t.x + 2; x++) if (x >= 0 && y >= 0 && x < a.w && y < a.h && f.road[y * a.w + x] >= ROADS.levels[0].wear) { road = true; break; }
    if (road) hist.linked[0]++;
  }
  hist.cleared += a.lairs.filter(l => l.clearedBy && !LAIRS.get(l.kind).tribe && !LAIRS.get(l.kind).undead).length;
  hist.tribesCleared += a.lairs.filter(l => l.clearedBy && LAIRS.get(l.kind).tribe).length;
  hist.tribes += a.lairs.filter(l => LAIRS.get(l.kind).tribe).length;
  hist.undead += a.lairs.filter(l => LAIRS.get(l.kind).undead).length;
  hist.undeadCleared += a.lairs.filter(l => l.clearedBy && LAIRS.get(l.kind).undead).length;
  for (const c of a.chronicle) if (/(Костяки|Упыри|Некромант повёл) .*(разорили|обескровили|опустошили)/.test(c.text)) hist.undeadRaids++;
  for (const c of a.chronicle) { if (/^(Гоблины|Гноллы|Огры|Тролли|Великаны) .*разграбили/.test(c.text)) hist.raidsWon++; const m = c.text.match(/^За год отбито (\d+) набег/); if (m) hist.raidsLost += +m[1]; if (/отбили набег .* из /.test(c.text)) hist.raidsLost++; }
  // the parties: strong raids and broods walk the map and mostly get where they go
  if (a.hist.parties) { hist.sent += a.hist.parties.sent; hist.arrived += a.hist.parties.arrived; hist.partyLost += a.hist.parties.lost; }
  for (const p of a.parties || []) if (f.ocean[p.i]) hist.wetParties++;
  // dealings: attitudes in bounds, every war in the chronicle, burnt towns left as ruins, battles as barrows
  let relBad = '';
  const warsTold = a.chronicle.filter(c => /началась война/.test(c.text)).length, wars = Object.values(a.rel || {}).reduce((x, r) => x + r.wars, 0);
  for (const [kk, r] of Object.entries(a.rel || {})) {
    const [p, q] = kk.split(':');
    if (!(r.att >= -5 && r.att <= 5)) relBad ||= `${kk}: отношение ${r.att}`;
    if (r.war && r.war.since > a.hist.year) relBad ||= `${kk}: война из будущего`;
    const pk = [p, q].map(id => a.realms.find(r => r.id === id).people).sort().join(':');
    hist.rel[pk] = (hist.rel[pk] || 0) + r.att; hist.relN[pk] = (hist.relN[pk] || 0) + 1;
  }
  if (warsTold !== wars) relBad ||= `войн ${wars}, в летописи ${warsTold}`;
  const razed = a.towns.filter(t => !t.alive).length;
  if (razed !== (a.ruins || []).length) relBad ||= `сожжено ${razed}, пепелищ ${(a.ruins || []).length}`;
  const battles = Object.values(a.rel || {}).reduce((x, r) => x + (r.war?.battles || 0), 0) + a.chronicle.filter(c => /Битва под|сожгли/.test(c.text)).length;
  if (battles && !(a.f.barrows && a.f.barrows.some(v => v > 0))) relBad ||= 'битвы были, курганов нет';
  for (const t of a.towns) for (const v of Object.values(t.folk || {})) if (v > DIPLOMACY.mingleMax + 1e-9) relBad ||= `${t.name}: чужих больше предела`;
  // realms: every town holds to one of its people; a seat is its realm's; one throne hall a realm
  for (const t of a.towns) if (t.alive) { const r = a.realms.find(x => x.id === t.realm); if (!r) relBad ||= `${t.name}: без державы`; else if (r.people !== t.people) relBad ||= `${t.name}: держава чужого народа`; }
  for (const r of a.realms) { const thrones = a.towns.filter(t => t.alive && t.realm === r.id && t.built.includes('throne')); if (thrones.length > 1) relBad ||= `${r.name}: тронных залов ${thrones.length}`; if (thrones.length && !thrones[0].capital) relBad ||= `${r.name}: тронный зал не в столице`; }
  hist.realms += a.realms.length; hist.schisms += a.chronicle.filter(c => /^Раскол:|^Власть не удержали/.test(c.text)).length; hist.moved += a.chronicle.filter(c => /^Столица державы .* перенесена/.test(c.text)).length;
  for (const r of a.realms) { const seat = a.towns.find(t => t.id === r.capital); if (seat && seat.alive && !seat.capital) relBad ||= `${r.name}: столица без флага`; if (seat && seat.alive && seat.realm !== r.id) relBad ||= `${r.name}: столица в чужой державе`; } hist.kinWars += Object.entries(a.rel || {}).filter(([kk, r]) => r.wars && kk.split(':').map(id => a.realms.find(x => x.id === id).people).every((v, i, arr) => v === arr[0])).length;
  check(`${tag}: державы, отношения, войны, пепелища и курганы сходятся`, !relBad, relBad);
  hist.wars += wars; hist.ruins += razed; hist.trade += Object.values(a.rel || {}).filter(r => r.routes > 0).length;
  check(`${tag}: города на суше`, wet === 0, wet ? `${wet} в воде` : '');
  check(`${tag}: города строят только то, что им можно, где можно и в своём порядке; живут в своих домах`, !misbuilt, misbuilt);
  check(`${tag}: дороги не идут по морю`, seaRoad === 0, seaRoad ? `${seaRoad} клеток` : '');
  check(`${tag}: морские пути не идут по суше`, landLane === 0, landLane ? `${landLane} клеток` : '');
  check(`${tag}: народы живут только там, где их земля их держит`, homeless === 0, homeless ? `${homeless} клеток` : '');
}


// the wild era ran to its end; beasts stay where their biomes can hold them; lairs keep apart
function historyCheck(a, tag) {
  check(`${tag}: дикая эра прошла до конца`, a.hist && a.hist.step === historyLength(a));
  let nan = 0, outside = 0, total = 0;
  for (const s of a.fauna.list) for (let j = 0; j < s.N.length; j++) {
    const v = s.N[j]; if (!Number.isFinite(v) || v < 0) nan++;
    total += v; if (s.K[j] <= 0) outside += v;
  }
  check(`${tag}: численность зверей — конечные неотрицательные числа`, nan === 0, nan ? `${nan} плохих` : '');
  const home = outside <= 0.02 * total;
  check(`${tag}: звери живут в своих биомах`, home, home ? '' : `вне своих краёв ${(outside / (total || 1) * 100).toFixed(1)}%`);
  const alive = a.lairs.filter(l => l.alive);
  let close = 0;
  for (const p of alive) for (const q of alive) if (p.id < q.id && p.kind === q.kind && Math.hypot(p.x - q.x, p.y - q.y) < 2 * LAIRS.get(p.kind).radius * scaleOf(a) - 1) close++;
  check(`${tag}: логова одного рода не теснят друг друга`, close === 0, close ? `${close} пар` : '');
  hist.lairs += a.lairs.length; hist.alive += alive.length; hist.worlds++;
  hist.lines += a.chronicle.filter(c => c.season != null).length;
  for (const l of a.lairs) hist.kinds[l.kind] = (hist.kinds[l.kind] || 0) + 1;
}


// every land cell has a biome and a soil, and the biome agrees with its climate as Köppen has it
function biomeCheck(a, tag) {
  let none = 0, wrong = 0, sharesBad = 0, example = '';
  for (let i = 0; i < a.n; i++) {
    if (a.f.ocean[i]) continue;
    const b = biomeAt(a, i), s = soilAt(a, i);
    if (!b || !s) { none++; continue; }
    const T = a.f.temp[i], Tw = T + a.f.trange[i] / 2, Tc = T - a.f.trange[i] / 2, P = a.f.rain[i], Pd = Math.max(1, dryness(T));
    const bad = (b.id === 'jungle' && Tc < KOPPEN.tropics) || (b.id === 'taiga' && Tc >= KOPPEN.continental) ||
      (b.id === 'tundra' && Tw >= KOPPEN.treeline) || (b.id === 'ice' && Tw >= 0) || (b.id === 'desert' && P >= Pd / 2) ||
      ((b.id === 'forest' || b.id === 'taiga' || b.id === 'jungle') && (Tw < KOPPEN.treeline || P < Pd));
    if (bad) { wrong++; example ||= `${b.label}: ${T.toFixed(0)}°, лето ${Tw.toFixed(0)}°, зима ${Tc.toFixed(0)}°, ${Math.round(P)} мм`; }
    addTo(bioLat[b.id] ??= [0, 0], Math.abs(latitude(a, (i / a.w) | 0)));
    addTo(bioTrees[b.id] ??= [0, 0], a.f.trees[i]);
    bioCount[b.id] = (bioCount[b.id] || 0) + 1;
    addTo(soilFert[s.id] ??= [0, 0], a.f.fert[i]);
    if (i % 97 === 0) {
      const sh = cellBiomes(a, i), sum = Object.values(sh).reduce((x, v) => x + v, 0);
      if (Math.abs(sum - 1) > 0.06 || Object.keys(sh).some(id => !BIOMES.has(id))) sharesBad++;
    }
  }
  check(`${tag}: у каждой клетки суши биом и почва`, none === 0, none ? `${none} без` : '');
  check(`${tag}: биомы согласны с климатом по Кёппену`, wrong === 0, wrong ? `${wrong} клеток, например ${example}` : '');
  check(`${tag}: доли биомов клетки складываются в целое`, sharesBad === 0, sharesBad ? `${sharesBad} клеток` : '');
}


// every land cell drains to the ocean or into a salt lake, without loops, and the water only grows
// downstream (except into a salt lake, which keeps it)
function drainage(a) {
  const {down, ocean, flow, lake} = a.f, seen = new Int32Array(a.n).fill(-1);
  let bad = 0, shrink = 0;
  const salt = i => lake[i] >= 0 && a.lakes[lake[i]].salt;
  for (let s = 0; s < a.n; s++) {
    if (ocean[s]) continue;
    let i = s, steps = 0;
    while (!ocean[i] && !salt(i) && steps <= a.n) {
      if (seen[i] === s) { steps = a.n + 1; break; }
      seen[i] = s;
      const d = down[i];
      if (d < 0) break;
      if (!ocean[d] && !salt(d) && flow[d] + 1e-3 < flow[i]) shrink++;
      i = d; steps++;
    }
    if (steps > a.n || (!ocean[i] && !salt(i))) bad++;
  }
  return {bad, shrink};
}

const mean = acc => acc[0] / (acc[1] || 1);

// rain by belt (all cells, sea too): the rising belts are wet, the sinking ones at ~30° dry
function rainBelts(a) {
  for (let y = 0; y < a.h; y++) {
    const L = Math.abs(latitude(a, y)), b = L < 10 ? 'tropic' : L > 22 && L < 35 ? 'subtropic' : L > 40 && L < 60 ? 'temperate' : null;
    if (b) for (let x = 0; x < a.w; x++) addTo(bands[b], a.f.rain[y * a.w + x]);
  }
}

// rain shadow: land cells behind a ridge (looking upwind, the ground rises well above them) against
// land cells that get the wind straight off the sea
function rainShadow(a) {
  const rel = i => (a.f.elev[i] - a.sea) / (1 - a.sea), R = Math.round(10 * Math.min(a.w, a.h) / 192);
  for (let i = 0; i < a.n; i++) {
    if (!a.f.land[i]) continue;
    const u = a.f.windX[i], v = a.f.windY[i], sp = Math.hypot(u, v);
    if (sp < 0.3) continue;
    const x0 = i % a.w, y0 = (i / a.w) | 0;
    let ridge = 0, sea = false;
    for (let t = 1; t <= R; t++) {
      const x = Math.round(x0 - u / sp * t), y = Math.round(y0 - v / sp * t);
      if (x < 0 || y < 0 || x >= a.w || y >= a.h) break;
      const j = y * a.w + x;
      if (!a.f.land[j]) { sea = t <= 3; break; }
      ridge = Math.max(ridge, rel(j) - rel(i));
    }
    if (ridge > 0.25) addTo(shadow.lee, a.f.rain[i]);
    else if (sea && rel(i) < 0.15) addTo(shadow.windward, a.f.rain[i]);
  }
}

let landAll = 0, worlds = 0;

// every plate is one piece (plates grow over 8 neighbours, so a diagonal touch joins)
function platesWhole(a) {
  const seen = new Uint8Array(a.n);
  for (const p of a.plates) {
    const start = p.sy * a.w + p.sx, stack = [start]; let cnt = 0; seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(); cnt++;
      const x = i % a.w, y = (i / a.w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue;
        const j = ny * a.w + nx;
        if (!seen[j] && a.f.plate[j] === p.id) { seen[j] = 1; stack.push(j); }
      }
    }
    if (cnt !== p.area) return false;
  }
  return true;
}

const rowTemp = (a, y) => { let s = 0; for (let x = 0; x < a.w; x++) s += a.f.temp[y * a.w + x]; return s / a.w; };

for (let s = 1; s <= seeds; s++) for (let land = 0; land < ATLAS_LAND.length; land++) for (const hemisphere of ['north', 'equator']) {
  const cfg = {seed: String(s), size, land, plates: (s + land) % PLATE_COUNTS.length, hemisphere};
  const t0 = Date.now(), a = generateAtlas(cfg), ms = Date.now() - t0, b = generateAtlas(cfg);
  const tag = `сид ${s}, ${ATLAS_LAND[land].label}, ${PLATE_COUNTS[cfg.plates].label.toLowerCase()} плит, ${hemisphere}`;
  worlds++;
  check(`${tag}: тот же мир`, atlasHash(a) === atlasHash(b), s === 1 && land === 1 ? `${atlasHash(a)}, ${ms} мс` : '');
  let landCnt = 0, edgeLand = 0, noRock = 0, magmaCold = 0, unplated = 0;
  for (let i = 0; i < a.n; i++) {
    if (a.f.plate[i] < 0) unplated++;
    if (!a.f.land[i]) continue;
    landCnt++;
    const x = i % a.w, y = (i / a.w) | 0;
    if (x === 0 || y === 0 || x === a.w - 1 || y === a.h - 1) edgeLand++;
    const rock = ROCK_BY_CODE[a.f.rock[i]];
    if (!rock) { noRock++; continue; }
    kinds[rock.kind] = (kinds[rock.kind] || 0) + 1;
    for (const o of ORE_GENESIS.all()) {
      const lv = levelOf(a.f[`ore_${o.id}`][i], o.levels);
      (ores[o.id] ??= [0, 0, 0, 0])[[0, 0.5, 1, 1.6].indexOf(lv)]++;
      if (o.id === 'coal' && lv >= 1) { coalOnSed[1]++; if (rock.kind === 'sedimentary') coalOnSed[0]++; }
      if (o.id === 'magma' && lv >= 1 && a.f.volc[i] < 0.05) magmaCold++;
    }
  }
  landAll += landCnt;
  const share = landCnt / a.n;
  // the ocean share jumps when a basin joins the sea through a strait, so the land share may miss by a few points
  const shareOk = Math.abs(share - ATLAS_LAND[land].share) < 0.05;
  check(`${tag}: доля суши`, shareOk, shareOk ? '' : `${(share * 100).toFixed(1)}%`);
  check(`${tag}: по краю мира море`, edgeLand === 0, edgeLand ? `${edgeLand} клеток суши на краю` : '');
  check(`${tag}: каждая клетка на плите, плиты целые`, unplated === 0 && platesWhole(a));
  check(`${tag}: у каждой клетки суши есть порода`, noRock === 0, noRock ? `${noRock} без породы` : '');
  check(`${tag}: магма только у живых вулканов`, magmaCold === 0, magmaCold ? `${magmaCold} клеток` : '');
  rainBelts(a); rainShadow(a);
  biomeCheck(a, tag);
  historyCheck(a, tag);
  townsCheck(a, tag);
  const dr = drainage(a);
  check(`${tag}: вся вода стекает в море или в солёное озеро`, dr.bad === 0, dr.bad ? `${dr.bad} клеток без стока` : '');
  check(`${tag}: вниз по течению воды не меньше`, dr.shrink === 0, dr.shrink ? `${dr.shrink} мест` : '');
  lakesAll += a.lakes.length; saltAll += a.lakes.filter(L => L.salt).length;
  for (let i = 0; i < a.n; i++) {
    if (a.f.lake[i] >= 0) addTo(lakeRain[a.lakes[a.f.lake[i]].salt ? 'salt' : 'fresh'], a.f.rain[i]);
    if (levelOf(a.f.ore_placer[i], ORE_GENESIS.get('placer').levels) >= 1) {
      placerCells++;
      if (a.f.flow[i] < 1) check(`${tag}: золотой песок только в реках`, false, `клетка ${i}`);
    }
  }
  const top = rowTemp(a, 0), mid = rowTemp(a, a.h >> 1), bot = rowTemp(a, a.h - 1);
  const bands = hemisphere === 'equator' ? mid > top + 10 && mid > bot + 10 : bot > top + 20;
  check(`${tag}: пояса температуры`, bands, !bands || (s === 1 && land === 1) ? `верх ${top.toFixed(0)}°, середина ${mid.toFixed(0)}°, низ ${bot.toFixed(0)}°` : '');
}

console.log(`\nПороды суши (${worlds} миров):`);
for (const [k, l] of Object.entries(ROCK_KINDS)) {
  const v = (kinds[k] || 0) / landAll;
  check(`  ${l}`, v >= 0.04, `${(v * 100).toFixed(1)}%`);
}
console.log('Руды на суше: нет / бедно / есть / богато');
for (const o of ORE_GENESIS.all()) console.log(`     ${o.label.padEnd(14)} ${ores[o.id].map(v => (v / landAll * 100).toFixed(1).padStart(5) + '%').join(' ')}`);
const iron = 1 - ores.iron[0] / landAll;
check('железо есть хотя бы бедно на четверти суши', iron >= 0.25, `${(iron * 100).toFixed(0)}%`);
check('уголь (есть и богато) лежит в осадочных породах', coalOnSed[0] >= 0.7 * coalOnSed[1], `${(coalOnSed[0] / (coalOnSed[1] || 1) * 100).toFixed(0)}%`);
console.log('Осадки, мм в год:');
const r = v => Math.round(mean(v));
check('  экватор влажнее конских широт', mean(bands.tropic) > 1.5 * mean(bands.subtropic), `${r(bands.tropic)} против ${r(bands.subtropic)}`);
check('  умеренные широты влажнее конских', mean(bands.temperate) > 1.3 * mean(bands.subtropic), `${r(bands.temperate)} против ${r(bands.subtropic)}`);
check('  дождевая тень', mean(shadow.lee) < 0.6 * mean(shadow.windward), `за хребтом ${r(shadow.lee)}, на наветренном берегу ${r(shadow.windward)}`);
console.log('Биомы (доля суши, средняя широта, лес):');
let landBio = 0; for (const v of Object.values(bioCount)) landBio += v;
for (const b of BIOMES.all()) if (bioCount[b.id]) console.log(`     ${b.label.padEnd(26)} ${(bioCount[b.id] / landBio * 100).toFixed(1).padStart(5)}%  ${Math.round(mean(bioLat[b.id])).toString().padStart(3)}°  ${Math.round(mean(bioTrees[b.id]) * 100).toString().padStart(3)}%`);
const L = id => mean(bioLat[id] || [0, 0]), Tr = id => mean(bioTrees[id] || [0, 0]), F = id => mean(soilFert[id] || [0, 0]);
check('  зоны по широте: тундра севернее тайги, тайга севернее широколиственных, джунгли у экватора', L('tundra') > L('taiga') && L('taiga') > L('forest') && L('jungle') < 20, `${Math.round(L('tundra'))}° / ${Math.round(L('taiga'))}° / ${Math.round(L('forest'))}° / ${Math.round(L('jungle'))}°`);
check('  леса лесистые, степи и пустыни нет', Tr('forest') > 0.5 && Tr('taiga') > 0.5 && Tr('steppe') < 0.1 && Tr('desert') < 0.05, `лес ${Math.round(Tr('forest') * 100)}%, тайга ${Math.round(Tr('taiga') * 100)}%, степь ${Math.round(Tr('steppe') * 100)}%`);
check('  чернозём и поймы плодороднее подзола и латерита', F('chernozem') > F('podzol') && F('alluvial') > F('laterite'), `чернозём ${Math.round(F('chernozem') * 100)}%, пойма ${Math.round(F('alluvial') * 100)}%, подзол ${Math.round(F('podzol') * 100)}%, латерит ${Math.round(F('laterite') * 100)}%`);
console.log('Дикая эра:');
check('  логова чудовищ есть', hist.lairs - hist.tribes - hist.undead > 0, `${hist.lairs - hist.tribes - hist.undead} за эру на ${hist.worlds} миров; ` + LAIRS.filter(L => !L.tribe && !L.undead).map(L => `${L.label} ${hist.kinds[L.id] || 0}`).join(', '));
check('  племена стоят станами', hist.tribes > 0, `${hist.tribes} за эру на ${hist.worlds} миров; ` + LAIRS.filter(L => L.tribe).map(L => `${L.label} ${hist.kinds[L.id] || 0}`).join(', '));
check('  летопись эры пишется', hist.lines >= 10 * hist.worlds, `${(hist.lines / hist.worlds).toFixed(0)} записей на мир`);
console.log('Народы:');
for (const P of WORLD_PEOPLES.all()) check(`  ${P.label} живут в мире`, (hist.towns[P.id] || 0) > 0, `городов ${hist.towns[P.id] || 0} на ${hist.worlds} миров, в среднем ${Math.round((hist.pop[P.id] || 0) / hist.worlds)} жителей на мир`);
check('  города строят всё', Object.keys(hist.built).length === Object.keys(CATEGORIES).length, Object.entries(CATEGORIES).map(([k, l]) => `${l} ${hist.built[k] || 0}`).join(', '));
check('  дороги наезжены', hist.roads > 0 && hist.linked[0] >= 0.8 * hist.linked[1], `${hist.linked[0]} из ${hist.linked[1]} городов с соседями своего народа стоят у дороги; клеток дорог ${hist.roads}`);
check('  гавани ходят по морю', hist.harbors > 0 && hist.lanes > 0, `гаваней ${hist.harbors} на ${hist.worlds} миров, клеток морских путей ${hist.lanes}`);
check('  отряды ходят по карте и доходят', hist.sent > 0 && hist.arrived >= 0.8 * hist.sent && !hist.wetParties, `отрядов отправлено ${hist.sent} на ${hist.worlds} миров, дошло ${hist.arrived}, заблудилось ${hist.partyLost}`);
check('  города обстраиваются угодьями, хлеб идёт по связям', hist.sites > 0 && hist.flows > 0, `угодий ${hist.sites} на ${hist.worlds} миров, пней ${hist.stumps}; связей сети ${hist.links}, с потоком ${hist.flows}, наезженных ${hist.thick}; городов на привозном хлебе ${hist.fed}, кормильцев ${hist.feeders}`);
check('  народы теснят чудовищ', hist.cleared > 0, `выжжено логов: ${hist.cleared}`);
check('  мёртвые встают из курганов и пепелищ', hist.undead > 0 && hist.undeadRaids > 0 && hist.undeadCleared > 0, `${hist.undead} логов на ${hist.worlds} миров: ` + LAIRS.filter(L => L.undead).map(L => `${L.label} ${hist.kinds[L.id] || 0}`).join(', ') + `; набегов удачных ${hist.undeadRaids}; выжжено ${hist.undeadCleared}`);
check('  племена грабят города, города разоряют станы', hist.raidsWon > 0 && hist.raidsLost > 0 && hist.tribesCleared > 0, `набегов удачных ${hist.raidsWon}, отбито (вместе с мертвецами) ${hist.raidsLost}; станов разорено ${hist.tribesCleared}`);
console.log('Эпоха молодых:');
check('  державы враждуют и торгуют', hist.wars > 0 && hist.trade > 0, `держав ${hist.realms} на ${hist.worlds} миров, расколов ${hist.schisms}, столиц перенесено ${hist.moved}; войн ${hist.wars}, из них между державами одной расы ${hist.kinWars}; сожжено городов ${hist.ruins}, пар держав с торговлей ${hist.trade}; среднее отношение рас: ` + Object.keys(hist.rel).sort().map(kk => `${kk} ${(hist.rel[kk] / hist.relN[kk]).toFixed(1)}`).join(', '));
console.log('Вода:');
check('  озёра есть', lakesAll > 0, `${lakesAll} на ${worlds} миров, солёных ${saltAll}`);
if (lakeRain.salt[1] && lakeRain.fresh[1]) check('  солёные озёра в сухом климате', mean(lakeRain.salt) < mean(lakeRain.fresh), `у солёных ${Math.round(mean(lakeRain.salt))} мм, у пресных ${Math.round(mean(lakeRain.fresh))} мм`);
check('  золотой песок где-то есть', placerCells > 0, `${placerCells} клеток уровня «есть» и выше`);
// the epic world of the campaign (cfg.epic): its eras' years are drawn from their own stream, inside EPIC_YEARS, and kept
// in the world; a short one (the eras set by hand) lives its whole history and is saved and opened the same
console.log('Эпический мир кампании:');
{
  const drawn = ['3', '11', '29'].map(seed => epicYears(newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true})));
  const inside = drawn.every(Y => Object.entries(EPIC_YEARS).every(([id, [lo, hi]]) => Y[id] >= lo && Y[id] <= hi));
  const again = JSON.stringify(epicYears(newAtlas({seed: '3', size: 'small', epic: true}))) === JSON.stringify(drawn[0]);
  check('  годы эпох — от 75 до 150, по сиду одни и те же', inside && again, drawn.map(Y => `${Y.wild}+${Y.elder}+${Y.young}`).join(', '));
  const cfg = {seed: '5', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true, epicYears: {wild: 20, elder: 20, young: 20}};
  const a = generateAtlas(cfg), plan = eraPlan(a).map(e => e.seasons / 4);
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  check('  короткий эпический мир доживает историю, сохраняется и открывается тем же', a.hist.year >= 60 && a.hist.era === 'young' && plan.join() === '20,20,20' && atlasHash(b) === atlasHash(a) && eraPlan(b).map(e => e.seasons / 4).join() === '20,20,20',
    `${a.hist.year} лет, эпохи ${plan.join(' + ')}, городов ${a.towns.filter(t => t.alive).length}`);
  // the calamities (atlas/calamity.js): three, one an era; each rose, its boss stronger than its kind allows, and fell;
  // a grave for each; the artifact went from the sanctuary through the bosses to the last grave; the chronicle tells it
  const C = a.calamities || [], allFell = C.length === 3 && C.every(c => c.phase === 'fallen' && c.boss && c.fell);
  const beyond = C.some(c => c.boss?.special && Object.entries(c.boss.special).some(([id, v]) => v > (SPECIES.get(c.boss.species).special?.[id]?.[1] ?? 99)));
  const lines = a.chronicle.filter(l => l.topic === 'calamity').length, bossesDead = C.every(c => !a.lairs.find(l => l.id === c.lair)?.alive);
  check('  эпос: три бедствия по эпохам, босс сильнее своего вида, у каждого могила, артефакт прошёл через всех', allFell && beyond && bossesDead && a.graves?.length === 3 && a.artifact?.holder.kind === 'grave' && a.artifact.trail.length === 7 && lines >= 9,
    C.map(c => `${c.era}: ${c.kind}, пал ${c.fell?.year} (${c.fell?.by})`).join('; ') + `; строк летописи бедствий ${lines}`);
  // saved in the middle of a calamity, the epic world goes on exactly as the unbroken one
  const mid = newAtlas(cfg); let steps = 0;
  while (!(mid.calamities?.[1]?.phase === 'rise') && steps < 5000) { runNextStage(mid); steps++; }
  const half = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(mid))));
  while (runNextStage(mid)); while (runNextStage(half));
  check('  эпос: мир, сохранённый посреди бедствия, идёт так же', atlasHash(mid) === atlasHash(half) && atlasHash(mid) === atlasHash(a), `${atlasHash(mid)} / ${atlasHash(half)}`);
  // the alliances (atlas/alliance.js): after the wild era the realms in a boss's reach band together and march on it, and
  // the alliance falls apart after the boss is gone — what holds in any world (whether an alliance or the heroes bring a
  // boss down is the luck of the world: the win itself is a scene of tools/world-check.mjs, W20). Eras of 40 years
  const e = generateAtlas({...cfg, seed: '3', epicYears: {wild: 40, elder: 40, young: 40}}), AL = e.alliances || [];
  const later = (e.calamities || []).filter(c => c.era !== 'wild');
  check('  эпос: против бедствий после дикой эры собираются союзы, идут походом, союз распадается после мира', AL.length === later.length && AL.every(A => A.members.length && A.tries > 0) && AL.some(A => A.sent.length) && AL.some(A => A.broken),
    AL.map(A => `союз ${A.members.length} держав, походов ${A.tries}, прислали войска ${A.sent.length}${A.broken ? ', распался' : ''}`).join('; ') + '; ' + later.map(c => `${c.kind} пал от ${c.fell?.by}`).join(', '));
  // the chronicle as a text (atlas/chronicle.js): every level has lines; major ⊂ normal ⊂ all; by its eras, every era a
  // block; the calamities apart — each calamity with its boss, its grave's epitaph, and the artifact's way
  const lv = {major: 0, normal: 0, minor: 0}; for (const c of e.chronicle) lv[lineLevel(c)]++;
  const tx = d => worldChronicleText(e, {detail: d, name: 'Проверка'}), [tMaj, tNorm, tAll] = ['major', 'normal', 'all'].map(tx), rows = t => t.split('\n').length;
  const eras = eraSpans(e).every(sp => tAll.includes(`=== ${sp.label} · годы ${sp.from}–${sp.to}`)) && tAll.includes('=== Сотворение мира ===');
  const cal = calamityChronicleText(e, {name: 'Проверка'}), graves = (e.graves || []).every(g => g.epitaph && cal.includes(g.epitaph));
  check('  летопись текстом: три уровня подробности, по эпохам; летопись катаклизмов с боссами, надписями на могилах и путём артефакта',
    lv.major && lv.normal && lv.minor && rows(tMaj) < rows(tNorm) && rows(tNorm) < rows(tAll) && eras && (cal.match(/=== Бедствие /g) || []).length === 3 && graves && cal.includes('Путь артефакта'),
    `строк важных ${lv.major}, обычных ${lv.normal}, мелких ${lv.minor}; текст ${rows(tMaj)} / ${rows(tNorm)} / ${rows(tAll)} строк; катаклизмы ${rows(cal)} строк`);
  const plain = {seed: '5', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0};
  check('  без эпоса эпохи прежние', eraPlan(newAtlas(plain)).map(e => e.seasons / 4).join() === '25,25,25');
}
if (!ok) process.exit(1);

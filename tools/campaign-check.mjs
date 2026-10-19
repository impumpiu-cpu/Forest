// The campaign's core: from every major people's capital of a small world a caravan sets out — eight
// of the realm's race (four knights, four squires) in their own gear, food on their backs, a goal that
// can be walked to — and walks the world day by day while history goes on. Checked: the caravan reaches
// its goal and comes home (or dies trying) with no broken numbers; the same seed gives the same walk;
// a world saved in the middle of a campaign goes on exactly as the unbroken one; the world lives on
// (history past its end, told once); the caravan is a party of the world. The baggage: the load never
// outgrows the room, wheels only go where wheels can, a caravan comes by beasts and a cart and chooses
// between the road and the straight way; wheels never cross a swamp without a road. Towns and people: the
// caravan trades in friendly towns, the treasury never goes below nothing, the core stays the eight who set
// out, nobody joins beyond the limits, the hired and the joined come and go; the campaign is lost exactly
// when none of the eight is left. The bubble: never more things than its limit, none beyond the ring where
// they melt away, all on land; night fights come from things that reach the camp, ambushes happen on the
// march, merchants' trains and herds are met. The local map: fights and stops are played on it, the camp
// played again from its setup comes out the same (the screen shows it so), the dead on the map are dead in
// the campaign, and a camp takes a fraction of a second. Prints how each went.
// The full walks run in the quick mode (fights settled at once); the local map is checked on a stretch of
// one walk played in full. `local` as the third argument plays every walk in full (slow: minutes).
// Usage: node tools/campaign-check.mjs [seeds=1] [size=small] [local]
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign, runCampaign, campaignHash, alive} from '../src/campaign/index.js';
import {findPath} from '../src/atlas/roads.js';
import {scratch} from '../src/campaign/march.js';
import {CAMPAIGN} from '../src/data/campaign.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {ITEMS} from '../src/data/items.js';
import {capacity, load, wheeled} from '../src/campaign/baggage.js';
import {stepCost, onRoad} from '../src/campaign/path.js';
import {biomeAt} from '../src/atlas/biomes.js';
import {baggageText} from '../src/campaign/march.js';
import {WHEELS} from '../src/data/transport.js';
import {COMPANY_MAX, JOINED_MAX} from '../src/data/market.js';
import {core, isCore} from '../src/campaign/march.js';
import {BUBBLE, THINGS} from '../src/data/bubble.js';
import {scaleOf} from '../src/atlas/tectonics.js';
import {runCamp, campOutcome, outcomeHash} from '../src/campaign/camp.js';

const seeds = +(process.argv[2] || 1), size = process.argv[3] || 'small', fullLocal = process.argv[4] === 'local';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const finite = K => [K.food, K.x, K.y, K.gold, ...K.members.map(m => m.hp)].every(Number.isFinite);
const tally = {won: 0, lost: 0, timeout: 0}, got = {beast: 0, cart: 0, route: 0, trade: 0, joined: 0, left: 0, met: 0, ambush: 0, road: 0}, local = {camps: 0, ms: 0, ticks: 0, fights: 0, stops: 0, replays: 0, same: 0};

// the local map of a walk: every fight and stop was played on it, the kept camps played again come out the same
function countLocal(K, label, bad) {
  if (K.mode === 'auto') return;
  const L = K.stats.local || {camps: 0, ms: 0, ticks: 0};
  local.camps += L.camps; local.ms += L.ms; local.ticks += L.ticks; local.stops += K.stats.stopDays || 0;
  if (L.camps < K.stats.fights + (K.stats.stopDays || 0)) bad.push(`${label}: боёв и стоянок ${K.stats.fights + (K.stats.stopDays || 0)}, на карте сыграно ${L.camps}`);
  for (const cm of (K.camps || []).slice(-3)) { local.replays++; if (outcomeHash(campOutcome(runCamp(cm.setup))) === cm.hash) local.same++; else bad.push(`${label}: стоянка дня ${cm.day} сыграна заново иначе`); }
}

for (let s = 0; s < seeds; s++) {
  const seed = String(777 + s * 13), base = generateAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), fresh = () => loadAtlas(JSON.parse(frozen));
  const caps = capitals(base);
  check(`сид ${seed}: столицы только мажорных народов`, caps.length > 0 && caps.every(c => CAMPAIGN.peoples.includes(c.people)), `${caps.length}: ${[...new Set(caps.map(c => c.peopleLabel))].join(', ')}`);
  // one capital of each people
  const pick = CAMPAIGN.peoples.map(p => caps.find(c => c.people === p)).filter(Boolean);
  const bad = [];
  for (const c of pick) {
    const a = fresh(), K = newCampaign(a, c.town, {mode: fullLocal ? 'local' : 'auto'}), race = WORLD_PEOPLES.get(c.people).race;
    const knights = K.members.filter(m => m.role === 'knight').length, squires = K.members.filter(m => m.role === 'squire').length;
    if (knights !== CAMPAIGN.knights || squires !== CAMPAIGN.squires || K.members.some(m => m.race !== race || !m.special)) bad.push(`${c.label}: состав ${knights}+${squires}`);
    if (K.members.some(m => [...m.gear.hand, m.gear.body].some(id => !ITEMS.has(id)))) bad.push(`${c.label}: неизвестная вещь`);
    if (K.members.some(m => m.role === 'knight' && !['jerkin', 'hardleather'].includes(m.gear.body))) bad.push(`${c.label}: рыцарь не в коже`);
    if (K.goal == null || !findPath(a, K.home, K.goal, K.people, scratch(a))) bad.push(`${c.label}: к цели нет пути`);
    if (!(a.parties || []).some(p => p.kind === 'caravan' && p.id === K.party)) bad.push(`${c.label}: караван не отряд мира`);
    const y0 = a.hist.year;
    while (stepCampaign(a)) {
      if (load(K) > capacity(K) + 1e-6) { bad.push(`${c.label}: груз ${load(K).toFixed(1)} больше места ${capacity(K)}`); break; }
      if (wheeled(K) && K.path && K.path.slice(K.k).some(i => stepCost(a, i, K.people, true) === Infinity)) { bad.push(`${c.label}: колёса идут по бездорожью`); break; }
      if (!(K.gold >= 0)) { bad.push(`${c.label}: казна ${K.gold}`); break; }
      if (K.members.filter(isCore).length !== 8) { bad.push(`${c.label}: основной состав ${K.members.filter(isCore).length}`); break; }
      const live = K.members.filter(m => m.alive);
      if (live.length > COMPANY_MAX || live.filter(m => m.loyalty != null).length > JOINED_MAX) { bad.push(`${c.label}: в отряде ${live.length}`); break; }
      const things = K.bubble?.things || [];
      if (things.length > BUBBLE.max || things.some(t => !THINGS[t.kind] || Math.hypot(t.x - K.x, t.y - K.y) > BUBBLE.gone * scaleOf(a) + 1e-6 || a.f.ocean[t.i])) { bad.push(`${c.label}: пузырь — ${things.length} вещей, есть за краем или в море`); break; }
    }
    if (K.log.some(l => l.kind === 'beast')) got.beast++;
    if (K.log.some(l => l.kind === 'build' && /тележк|повозк/.test(l.text))) got.cart++;
    if (K.log.some(l => l.kind === 'route')) got.route++;
    if (K.log.some(l => l.kind === 'town' && /купили|продали/.test(l.text))) got.trade++;
    if (K.members.some(m => !isCore(m))) got.joined++;
    if (K.log.some(l => l.kind === 'leave')) got.left++;
    countLocal(K, c.label, bad);
    if (K.stats.met) got.met++;
    if (K.stats.ambushes) got.ambush++;
    if (K.stats.trains || K.stats.herds) got.road++;
    if ((K.phase === 'lost') !== (core(K).length === 0)) bad.push(`${c.label}: ${K.phase} при ${core(K).length} из восьми`);
    tally[K.phase]++;
    if (!finite(K)) bad.push(`${c.label}: числа сломались`);
    if (K.phase === 'won' && !(K.log.some(l => l.kind === 'goal') && K.log.some(l => l.kind === 'home'))) bad.push(`${c.label}: вернулся, не дойдя до цели`);
    if (!(a.hist.year > y0) && K.day > 120) bad.push(`${c.label}: мир не жил`);
    if (a.chronicle.filter(l => /Эпоха молодых народов подошла к концу/.test(l.text)).length !== 1) bad.push(`${c.label}: конец эпохи сказан не один раз`);
    if (!a.chronicle.some(l => l.campaign)) bad.push(`${c.label}: в летописи мира нет похода`);
    const dead = K.members.filter(m => isCore(m) && !m.alive).length, extra = K.members.filter(m => !isCore(m));
    console.log(`     ${c.label.padEnd(24)} ${K.phase.padEnd(7)} ${(K.day / 120).toFixed(1).padStart(4)} лет, живы ${8 - dead}/8 (+${extra.filter(m => m.alive).length} из ${extra.length} приставших), в городах ${K.stats.towns || 0} раз, казна ${K.gold}, боёв ${K.stats.fights}, голодных дней ${K.stats.hungryDays}, мир ${y0}→${a.hist.year}; обоз: ${baggageText(K)}`);
  }
  check(`сид ${seed}: походы от столиц каждого народа`, !bad.length, bad.slice(0, 5).join('; '));
  // wheels: a road is passable, a swamp or a mountain without one is not
  {
    const a = fresh(), road = [], blocked = [];
    for (let i = 0; i < a.n; i++) { if (a.f.ocean[i]) continue; if (onRoad(a, i)) road.push(i); else if (WHEELS.block.includes(biomeAt(a, i)?.id)) blocked.push(i); }
    check(`сид ${seed}: колёса — по дорогам, не по болотам и горам`, road.length > 0 && road.every(i => stepCost(a, i, 'humans', true) < Infinity) && blocked.every(i => stepCost(a, i, 'humans', true) === Infinity),
      `клеток дорог ${road.length}, закрытых для колёс ${blocked.length}`);
  }

  // the local map: a stretch of a walk played in full — its fights and stops on the map
  if (!fullLocal) {
    const lbad = [], c = pick[0], a = fresh(), K = newCampaign(a, c.town);
    for (let k = 0; k < 8 && stepCampaign(a); k++) if (K.members.filter(isCore).length !== 8 || !finite(K)) { lbad.push('сломался'); break; }
    countLocal(K, c.label, lbad);
    check(`сид ${seed}: два года похода с боями и стоянками на локальной карте`, !lbad.length && (K.stats.local?.camps || 0) > 0, lbad.slice(0, 3).join('; ') || `${K.stats.fights} боёв, ${K.stats.stopDays || 0} дней стоянок, из восьми живы ${core(K).length}`);
  }

  // the same seed, the same walk; a save in the middle goes on as the unbroken one (in full: with the local map)
  const c = pick[0], A = fresh(), B = fresh();
  newCampaign(A, c.town); newCampaign(B, c.town);
  for (let k = 0; k < 3; k++) { stepCampaign(A); stepCampaign(B); }
  check(`сид ${seed}: тот же поход по тому же сиду`, campaignHash(A.campaign) === campaignHash(B.campaign) && atlasHash(A) === atlasHash(B), campaignHash(A.campaign));
  const C = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(A))));
  for (let k = 0; k < 3; k++) { stepCampaign(A); stepCampaign(C); }
  check(`сид ${seed}: сохранённый посреди похода мир идёт так же`, campaignHash(A.campaign) === campaignHash(C.campaign) && atlasHash(A) === atlasHash(C), `день ${A.campaign.day}`);
}
check('хотя бы один караван дошёл и вернулся', tally.won > 0, JSON.stringify(tally));
check('караваны торгуют в городах, к ним пристают и от них уходят', got.trade > 0 && got.joined > 0 && got.left > 0, `торговали ${got.trade}, с нанятыми или приставшими ${got.joined}, с ушедшими ${got.left}`);
check('пузырь: ночные бои от тех, кто дошёл до лагеря, засады на марше, обозы и стада на пути', got.met > 0 && got.ambush > 0 && got.road > 0, `с ночными встречами ${got.met}, с засадами ${got.ambush}, с обозами или стадами ${got.road}`);
check('локальная карта: бои и стоянки сыграны на ней, повтор стоянки даёт то же', local.camps > 0 && local.stops > 0 && local.same === local.replays,
  `сыграно ${local.camps} (дней стоянок ${local.stops}), в среднем ${Math.round(local.ticks / Math.max(1, local.camps))} тиков и ${Math.round(local.ms / Math.max(1, local.camps))} мс; повторов ${local.same} из ${local.replays}`);
check('караваны обзаводятся обозом и выбирают между трактом и прямой дорогой', got.beast > 0 && got.cart > 0 && got.route > 0, `со зверями ${got.beast}, с тележкой или повозкой ${got.cart}, с выбором пути ${got.route}`);
if (!ok) process.exit(1);

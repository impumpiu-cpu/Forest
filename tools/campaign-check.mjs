// The campaign's core: from every major people's capital of a small world a caravan sets out — eight
// of the realm's race (four knights, four squires) in their own gear, food on their backs, a goal that
// can be walked to — and walks the world day by day while history goes on. Checked: the caravan reaches
// its goal and comes home (or dies trying) with no broken numbers; the same seed gives the same walk;
// a world saved in the middle of a campaign goes on exactly as the unbroken one; the quest: a crown and three
// clues on walkable land, the circles that narrow it hold it, a won walk came home with the crown; the end:
// the epilogue tells the fates, the campaign goes to the world's archive (a second caravan may follow), the
// chronicle as text holds all of it; the world lives on
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
import {capitals, newCampaign, stepCampaign, runCampaign, campaignHash, alive, finished, chronicleText} from '../src/campaign/index.js';
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
import {CAPTIVE} from '../src/data/captives.js';
import {memberMight} from '../src/campaign/march.js';
import {core, isCore} from '../src/campaign/march.js';
import {BUBBLE, THINGS} from '../src/data/bubble.js';
import {scaleOf} from '../src/atlas/tectonics.js';
import {runCamp, campOutcome, outcomeHash, campSetup, openCamp, stepCamp} from '../src/campaign/camp.js';
import {room, freeOf, joinedOf} from '../src/campaign/company.js';
import {playStop} from '../src/campaign/fight.js';
import {cellRegion} from '../src/campaign/land.js';
import {trade, standing} from '../src/campaign/town.js';
import {SMITH} from '../src/data/market.js';
import {freedomEvening} from '../src/campaign/captives.js';
import {FREEDOM} from '../src/data/captives.js';

const seeds = +(process.argv[2] || 1), size = process.argv[3] || 'small', fullLocal = process.argv[4] === 'local';
let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; if (!pass || info) console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };
const finite = K => [K.food, K.x, K.y, K.gold, ...K.members.map(m => m.hp)].every(Number.isFinite);
const tally = {won: 0, lost: 0, timeout: 0}, got = {beast: 0, cart: 0, route: 0, trade: 0, joined: 0, left: 0, met: 0, ambush: 0, road: 0, captives: 0, bound: 0, escaped: 0, caught: 0, told: 0, resigned: 0, stayed: 0, extended: 0, deserted: 0, freed: 0, sold: 0, bought: 0, finds: 0, thinAir: 0, hireEnds: 0, mines: 0, dug: 0, noticed: 0, small: 0, wanderers: 0}, local = {camps: 0, ms: 0, ticks: 0, fights: 0, stops: 0, replays: 0, same: 0}, quest = {clues: 0, crown: 0, storms: 0, rumours: 0, pursuers: 0, taken: 0}, ending = {lines: 0};

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
    // the quest: a crown and three clues on land the caravan can walk to, each in its own place; the capital
    // tells where to look for the first clue
    const Q = K.quest;
    if (!Q) bad.push(`${c.label}: нет квеста`);
    else {
      const spots = [Q.crown, ...Q.clues];
      if (Q.clues.length !== 3 || new Set(spots.map(p => p.at)).size !== spots.length) bad.push(`${c.label}: подсказок ${Q.clues.length}, мест ${new Set(spots.map(p => p.at)).size}`);
      for (const p of spots) if (!findPath(a, K.home, p.i, K.people, scratch(a))) { bad.push(`${c.label}: к «${p.label}» нет пути`); break; }
      if (!Q.clues[0]?.area || Q.clues.slice(1).some(x => x.area)) bad.push(`${c.label}: столица должна знать ровно один след`);
    }
    if (!(a.parties || []).some(p => p.kind === 'caravan' && p.id === K.party)) bad.push(`${c.label}: караван не отряд мира`);
    const y0 = a.hist.year;
    while (stepCampaign(a)) {
      if (load(K) > capacity(K) + 1e-6) { bad.push(`${c.label}: груз ${load(K).toFixed(1)} больше места ${capacity(K)}`); break; }
      if (wheeled(K) && K.path && K.path.slice(K.k).some(i => stepCost(a, i, K.people, true) === Infinity)) { bad.push(`${c.label}: колёса идут по бездорожью`); break; }
      if (!(K.gold >= 0)) { bad.push(`${c.label}: казна ${K.gold}`); break; }
      if (K.members.filter(isCore).length !== 8) { bad.push(`${c.label}: основной состав ${K.members.filter(isCore).length}`); break; }
      const live = K.members.filter(m => m.alive && !m.captive), held = K.members.filter(m => m.alive && m.captive);
      if (live.length > COMPANY_MAX || live.filter(m => m.loyalty != null).length > JOINED_MAX) { bad.push(`${c.label}: в отряде ${live.length}`); break; }
      // captives (docs/CAPTIVES.md): no more than the limit, no strength of the caravan, never the crown's carrier, no weapon
      if (held.length > CAPTIVE.max || held.some(m => memberMight(m) !== 0 || m.loyalty != null || m.id === K.quest?.crown?.carrier || m.gear.hand.some(id => ITEMS.get(id)?.melee && !ITEMS.get(id)?.tool))) { bad.push(`${c.label}: пленные — ${held.length}, с силой, оружием или короной`); break; }
      if (K.members.some(m => m.alive && m.former && (m.captive || m.gear.hand.some(id => ITEMS.get(id)?.melee && !ITEMS.get(id)?.tool) || (ITEMS.get(m.gear.body)?.armor ?? 0) > 0.12))) { bad.push(`${c.label}: бывший раб с оружием, доспехом или в путах`); break; }
      if (Object.values(K.cargo).some(n => !(n >= 0))) { bad.push(`${c.label}: груз ${JSON.stringify(K.cargo)}`); break; }
      const things = K.bubble?.things || [];
      if (things.filter(t => !t.pursuit).length > BUBBLE.max || things.some(t => !THINGS[t.kind] || Math.hypot(t.x - K.x, t.y - K.y) > (t.pursuit ? 2 : 1) * BUBBLE.gone * scaleOf(a) + 1e-6 || a.f.ocean[t.i])) { bad.push(`${c.label}: пузырь — ${things.length} вещей, есть за краем или в море`); break; }
    }
    if (K.log.some(l => l.kind === 'beast')) got.beast++;
    if (K.log.some(l => l.kind === 'build' && /тележк|повозк/.test(l.text))) got.cart++;
    if (K.log.some(l => l.kind === 'route')) got.route++;
    if (K.log.some(l => l.kind === 'town' && /купили|продали/.test(l.text))) got.trade++;
    if (K.members.some(m => !isCore(m) && !m.captive)) got.joined++;
    got.captives += K.members.filter(m => m.captive).length; got.escaped += K.stats.escaped || 0; got.caught += K.stats.caught || 0; got.told += K.stats.told || 0; got.resigned += K.log.filter(l => /смирил/.test(l.text)).length; got.stayed += K.stats.stayed || 0; got.extended += K.stats.extended || 0; got.deserted += K.stats.deserted || 0; got.freed += K.stats.freed || 0; got.sold += K.stats.sold || 0; got.bought += K.stats.bought || 0; got.finds += K.log.filter(l => l.kind === 'treasure').length; got.noticed += K.stats.noticed || 0; got.small += K.stats.small || 0; got.mines += K.log.filter(l => /встать и добывать/.test(l.text)).length; got.dug += K.log.filter(l => /Стоянка у выработки окончена: добыли/.test(l.text)).length; got.thinAir += K.log.filter(l => /оброненный кошель/.test(l.text)).length; if (K.log.some(l => /связали|В плен взяли/.test(l.text))) got.bound++;
    if (K.log.some(l => l.kind === 'leave')) got.left++;
    countLocal(K, c.label, bad);
    if (K.stats.met) got.met++;
    if (K.stats.ambushes) got.ambush++;
    if (K.stats.trains || K.stats.herds) got.road++;
    if ((K.phase === 'lost') !== (core(K).length === 0)) bad.push(`${c.label}: ${K.phase} при ${core(K).length} из восьми`);
    tally[K.phase]++;
    if (!finite(K)) bad.push(`${c.label}: числа сломались`);
    if (K.phase === 'won' && !(K.log.some(l => l.kind === 'crown') && K.log.some(l => l.kind === 'home') && Q.crown.state === 'carried' && K.members.find(m => m.id === Q.crown.carrier)?.alive)) bad.push(`${c.label}: вернулся без короны`);
    // the crown is never narrowed to a circle that does not hold it
    if (Q?.crown.area && Math.hypot(Q.crown.area.x - (Q.crown.i % a.w + 0.5), Q.crown.area.y - (((Q.crown.i / a.w) | 0) + 0.5)) > Q.crown.area.r + 1e-6) bad.push(`${c.label}: круг поиска короны не содержит её`);
    if (Q) { quest.clues += Q.found; if (K.log.some(l => l.kind === 'crown')) quest.crown++; quest.storms += K.stats.storms || 0; quest.rumours += K.stats.rumours || 0; quest.pursuers += K.stats.pursuers || 0; if (Q.crown.state === 'taken' || K.log.some(l => /досталась врагам|достался врагам/.test(l.text))) quest.taken++; }
    if (!(a.hist.year > y0) && K.day > 120) bad.push(`${c.label}: мир не жил`);
    // the end: the epilogue told (fates of those who were left), the campaign in the world's archive, the
    // chronicle as text; a crown home makes its realm stronger
    const epi = K.log.filter(l => l.kind === 'epilogue');
    if (!finished(K) || a.campaignsDone?.length !== 1 || !epi.length) bad.push(`${c.label}: эпилог не рассказан или поход не в архиве мира`);
    if (K.members.some(m => m.alive && !m.fate) || (K.lostWith || []).some(id => !K.members.find(m => m.id === id)?.fate)) bad.push(`${c.label}: не у всех оставшихся есть судьба`);
    if (K.phase === 'won' && !(a.towns.find(t => t.id === K.capital)?.relic && a.realms.find(r => r.id === K.realm)?.crown)) bad.push(`${c.label}: корона дома, а держава о ней не знает`);
    const text = chronicleText(a, a.campaignsDone?.[0] || K);
    if (!text.includes('ЛЕТОПИСЬ ПОХОДА') || text.split('\n').length < K.log.length + K.members.length) bad.push(`${c.label}: летопись текстом неполна`);
    ending[K.phase] = (ending[K.phase] || 0) + 1; ending.lines += epi.length;
    if (a.chronicle.filter(l => /Эпоха молодых народов подошла к концу/.test(l.text)).length !== 1) bad.push(`${c.label}: конец эпохи сказан не один раз`);
    if (!a.chronicle.some(l => l.campaign)) bad.push(`${c.label}: в летописи мира нет похода`);
    const dead = K.members.filter(m => isCore(m) && !m.alive).length, extra = K.members.filter(m => !isCore(m) && !m.captive), caps = K.members.filter(m => m.captive);
    console.log(`     ${c.label.padEnd(24)} ${K.phase.padEnd(7)} ${(K.day / 120).toFixed(1).padStart(4)} лет, живы ${8 - dead}/8 (+${extra.filter(m => m.alive).length} из ${extra.length} приставших, пленных ${caps.filter(m => m.alive).length} из ${caps.length}), в городах ${K.stats.towns || 0} раз, казна ${K.gold}, боёв ${K.stats.fights}, голодных дней ${K.stats.hungryDays}, мир ${y0}→${a.hist.year}; обоз: ${baggageText(K)}`);
  }
  check(`сид ${seed}: походы от столиц каждого народа`, !bad.length, bad.slice(0, 5).join('; '));
  // wheels: a road is passable, a swamp or a mountain without one is not
  {
    const a = fresh(), road = [], blocked = [];
    for (let i = 0; i < a.n; i++) { if (a.f.ocean[i]) continue; if (onRoad(a, i)) road.push(i); else if (WHEELS.block.includes(biomeAt(a, i)?.id)) blocked.push(i); }
    check(`сид ${seed}: колёса — по дорогам, не по болотам и горам`, road.length > 0 && road.every(i => stepCost(a, i, 'humans', true) < Infinity) && blocked.every(i => stepCost(a, i, 'humans', true) === Infinity),
      `клеток дорог ${road.length}, закрытых для колёс ${blocked.length}`);
  }

  // a second caravan in the same world, after the first is over: both in the archive
  {
    const a = fresh(), K1 = newCampaign(a, pick[0].town, {mode: 'auto'});
    for (let k = 0; k < 400 && stepCampaign(a); k++);
    const K2 = newCampaign(a, (pick[1] || pick[0]).town, {mode: 'auto'});
    for (let k = 0; k < 400 && stepCampaign(a); k++);
    const saved = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
    check(`сид ${seed}: второй поход в том же мире после первого; оба в архиве, архив сохраняется`, finished(K1) && finished(K2) && a.campaignsDone.length === 2 && saved.campaignsDone?.length === 2 && saved.campaignsDone[0].log.length === K1.log.length,
      `${K1.phase} и ${K2.phase}`);
  }

  // a lost caravan (the eight fall at once): the joined go their own ways in the epilogue, the crown's fate is
  // told, the world's chronicle has the end
  {
    const a = fresh(), K = newCampaign(a, pick[0].town, {mode: 'auto'});
    stepCampaign(a);
    K.members.push({...K.members[0], id: 999, name: 'Пристав', core: false, role: 'freed', loyalty: 0.5, alive: true, hp: 1});
    for (const m of K.members.filter(x => x.core)) { m.alive = false; m.died = {day: K.day, year: a.hist.year, why: 'пал в проверке'}; }
    for (let k = 0; k < 10 && stepCampaign(a); k++);
    const epi = K.log.filter(l => l.kind === 'epilogue').map(l => l.text);
    check(`сид ${seed}: поход проигран — эпилог о приставших и о короне, строка в летописи мира`, K.phase === 'lost' && finished(K) && !!K.members.find(m => m.id === 999)?.fate && epi.some(t => /лежит|у врагов|пропал/.test(t)) && a.chronicle.some(l => l.campaign && /помнят/.test(l.text)),
      epi.slice(0, 2).join(' / '));
  }

  // the ranks lean (data/campaign.js RETINUE.lean): over many rolls the fighters are stronger, tougher and quicker,
  // the squires cleverer, more charming, sharper-eyed and luckier; nobody leaves the people's limits
  {
    const sum = {knight: {}, squire: {}}, n = {knight: 0, squire: 0};
    let out = 0;
    for (const c of pick) for (let k = 0; k < 20; k++) {
      const a = fresh(), K = newCampaign(a, c.town, {seed: `lean:${k}:${c.town}`, mode: 'auto'});
      for (const m of K.members) {
        n[m.role]++;
        for (const [id, v] of Object.entries(m.special)) { sum[m.role][id] = (sum[m.role][id] || 0) + v; if (v < 0) out++; }
      }
    }
    const avg = (r, ids) => ids.reduce((t, id) => t + sum[r][id] / n[r], 0) / ids.length;
    const fight = ['S', 'E', 'A'], craft = ['I', 'C', 'L'];
    check(`сид ${seed}: бойцы сильнее в боевых характеристиках, сквайры — в остальных`, avg('knight', fight) > avg('squire', fight) + 0.4 && avg('squire', craft) > avg('knight', craft) + 0.4 && !out,
      `S/E/A ${avg('knight', fight).toFixed(2)} против ${avg('squire', fight).toFixed(2)}, I/C/L ${avg('squire', craft).toFixed(2)} против ${avg('knight', craft).toFixed(2)}`);
  }

  // a full company (docs/CAMPAIGN.md «Пополнение», campaign/company.js): with four joined nobody more joins, and a
  // captive who has earned its freedom waits in its bonds; with a place free it is freed
  {
    const a = fresh(), K = newCampaign(a, pick[0].town, {mode: 'auto'}), say = () => {};
    const add = (props) => K.members.push({...K.members[4], id: 900 + K.members.length, name: `Проверка ${K.members.length}`, core: false, alive: true, hp: 1, ...props});
    for (let k = 0; k < JOINED_MAX; k++) add({role: 'companion', loyalty: 0.5});
    K.members[0].master = {skill: 'smithing', day: 0};
    add({role: 'captive', captive: {since: 0, bonds: 'rope', will: 0.1, resigned: 1, service: FREEDOM.free + 1}});
    const full = !room(K, 'joined') && !room(K, 'former') && !room(K, 'stay') && !room(K, 'hire:guide') && room(K, 'captive');   // 8 + 4 = 12
    freedomEvening(a, K, say);
    const waited = K.members.at(-1).captive && joinedOf(K).length === JOINED_MAX;
    K.members.find(m => m.role === 'companion').alive = false;
    freedomEvening(a, K, say);
    const freed = !K.members.at(-1).captive && K.members.at(-1).role === 'former' && joinedOf(K).length === JOINED_MAX;
    const capped = freeOf(K).length === COMPANY_MAX && !room(K, 'hire:guide') && !room(K, 'joined');
    check(`сид ${seed}: полный отряд — приставших не больше ${JOINED_MAX}, заслуживший свободу ждёт места, всех не больше ${COMPANY_MAX}`, full && waited && freed && capped,
      `полон ${full}, ждал ${waited}, освобождён ${freed}, предел ${capped}`);
  }

  // hirelings at the end of the term (data/market.js CONTRACT): a good opinion stays for good, a middling one asks
  // for another term (paid, when there is gold), a poor one goes — set up by hand, as hiring is rare in a walk
  {
    const a = fresh(), K = newCampaign(a, pick[0].town, {mode: 'auto'});
    K.gold = 200;
    const hire = (name, opinion) => K.members.push({...K.members[0], id: 950 + K.members.length, name, core: false, role: 'sellsword', alive: true, hp: 1, loyalty: undefined,
      gear: {hand: ['sword', 'shield'], body: 'lamellar'}, contract: {until: 1, wage: 0.5, opinion}});
    hire('Остался', 0.95); hire('Продлил', 0.6); hire('Ушёл', 0.1);
    stepCampaign(a);
    const by = n => K.members.find(m => m.name === n);
    const ends = [by('Остался').alive && !by('Остался').contract, by('Продлил').alive && by('Продлил').contract?.until > 1, !by('Ушёл').alive || !!by('Ушёл').left];
    got.hireEnds += ends.filter(Boolean).length;
    check(`сид ${seed}: конец срока наёмника — остался, продлил, ушёл`, ends.every(Boolean), ends.join(', '));
  }

  // digging (data/campaign.js MINE): on the local map the caravan works the outcrop of the ore it stopped for and
  // carries it away; the smith of a town forges a piece from it cheaper, and the rest is sold
  {
    const a = fresh(), K = newCampaign(a, pick[0].town);
    let cell = -1;
    for (let i = 0; i < a.n && cell < 0; i++) if (a.f.land[i] && !a.f.ocean[i] && (cellRegion(a, i).ores?.iron ?? 0) >= 1) cell = i;
    let dug = 0, forged = false, sold = false;
    if (cell >= 0) {
      K.i = cell; K.x = cell % a.w + 0.5; K.y = ((cell / a.w) | 0) + 0.5; K.why = 'mine:iron'; K.cargo = {};
      for (let d = 0; d < 3; d++) { const got = playStop(a, K); dug += got.ironore || 0; }
      const t = a.towns.find(x => x.alive && standing(a, K, x) && SMITH.at.some(id => x.built.includes(id)));
      if (t) {
        K.cargo.ironore = 40; K.gold = 200;
        const lines = trade(a, K, t, standing(a, K, t));
        forged = lines.some(l => /кузнец перековал/.test(l)); sold = !K.cargo.ironore;
      }
    }
    check(`сид ${seed}: добыча — на стоянке копают руду, кузнец перековывает её дешевле, остаток продают`, cell < 0 || (dug > 0 && forged && sold), `руды за 3 дня ${dug}, перековка ${forged}, остаток продан ${sold}`);
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
check('хотя бы один караван нашёл корону и вернулся с ней', tally.won > 0, JSON.stringify(tally));
check('конец: эпилог с судьбами, поход в архиве мира, летопись текстом', Object.keys(ending).length > 1, `${JSON.stringify(ending)}`);
check('квест: подсказки найдены, места взяты штурмом, корону ищут и за ней гонятся', quest.clues > 0 && quest.crown > 0 && quest.storms > 0 && quest.pursuers > 0, `подсказок ${quest.clues}, корону нашли ${quest.crown} раз, штурмов ${quest.storms}, слухов ${quest.rumours}, погонь ${quest.pursuers}, корону отбивали ${quest.taken}`);
check('караваны торгуют в городах, к ним пристают и от них уходят', got.trade > 0 && got.joined > 0 && got.left > 0, `торговали ${got.trade}, с нанятыми или приставшими ${got.joined}, с ушедшими ${got.left}`);
check('пленные: упавших врагов вяжут и ведут с караваном', got.captives > 0 && got.bound > 0, `пленных ${got.captives}, походов с пленными ${got.bound}`);
check('пленные бегут и смиряются, беглецов ловят', got.escaped > 0 && got.resigned > 0 && got.caught > 0, `попыток побега ${got.escaped + got.caught}: ушли ${got.escaped}, пойманы ${got.caught}; смирились ${got.resigned}, доносов ${got.told}`);
check('наёмники в конце срока остаются, продлевают или уходят', got.stayed + got.extended + got.hireEnds > 0, `остались ${got.stayed}, продлили ${got.extended}, сбежали ${got.deserted}; освобождено пленных ${got.freed}`);
check('стоянки ради добычи: встают у руды выше своего металла или у серебра, самоцветов и золота, добытое везут с собой', got.mines > 0 && got.dug > 0, `стоянок ${got.mines}, с добычей ${got.dug}`);
check('пузырь: бродячие отряды замечают караван только вблизи и тогда идут по следу, днём ходят малые отряды', got.noticed > 0 && got.small > 0, `заметили караван ${got.noticed} раз, малых отрядов ${got.small}`);
check('находки с причиной: тело у дороги, брошенная повозка, логово, пепелище, поле боя — и ни одного кошеля из воздуха', got.finds > 0 && !got.thinAir, `находок ${got.finds}`);
check('пленных продают и покупают в городах, где это не запрещено', got.sold + got.bought > 0, `продали ${got.sold}, купили ${got.bought}`);
check('пузырь: ночные бои от тех, кто дошёл до лагеря, засады на марше, обозы и стада на пути', got.met > 0 && got.ambush > 0 && got.road > 0, `с ночными встречами ${got.met}, с засадами ${got.ambush}, с обозами или стадами ${got.road}`);
check('локальная карта: бои и стоянки сыграны на ней, повтор стоянки даёт то же', local.camps > 0 && local.stops > 0 && local.same === local.replays,
  `сыграно ${local.camps} (дней стоянок ${local.stops}), в среднем ${Math.round(local.ticks / Math.max(1, local.camps))} тиков и ${Math.round(local.ms / Math.max(1, local.camps))} мс; повторов ${local.same} из ${local.replays}`);
check('караваны обзаводятся обозом и выбирают между трактом и прямой дорогой', got.beast > 0 && got.cart > 0 && got.route > 0, `со зверями ${got.beast}, с тележкой или повозкой ${got.cart}, с выбором пути ${got.route}`);

// the epic campaign (campaign/epic.js): in an epic world the clues are the graves of the bosses, read by their epitaphs;
// the goal is the lair of the fourth, gathering with the artifact; the darkening goes on with the clues; the fourth rises
// in the world in its years; a storm of a lair with a boss is won only with the boss dead; won — the artifact home
{
  const E = generateAtlas({seed: '7', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true, epicYears: {wild: 40, elder: 40, young: 40}});
  const frozenE = JSON.stringify(saveAtlas(E)), freshE = () => loadAtlas(JSON.parse(frozenE)), capsE = capitals(E);
  const a = freshE(), K = newCampaign(a, capsE[0].town, {mode: 'auto'}), Q = K.quest, c4 = a.calamities.at(-1);
  const laid = Q?.epic && Q.clues.length === 3 && Q.clues.every(c => c.kind === 'grave' && c.epitaph && c.guard?.boss) && c4.phase === 'gathering' && c4.riseAt === a.hist.year + 25 &&
    a.lairs.find(l => l.id === c4.lair)?.boss === c4.id && a.artifact.holder.kind === 'boss' && Q.crown.guard?.boss && Q.clues.filter(c => c.area).length === 1;
  check('эпос: следы — могилы боссов с надписями и стражами, цель — логово четвёртого, где собирается сила с артефактом; срок — 25 лет', laid,
    Q?.epic ? `${Q.clues.map(c => c.label).join('; ')} → ${Q.crown.label}, ${c4.label}` : 'не эпический квест');
  runCampaign(a);
  const read = K.log.filter(l => /На могиле прочли надпись/.test(l.text)).length, dark = K.log.filter(l => /недобрые знаки|вышли охотники по следу|рыщут по всему краю/.test(l.text)).length;
  const end = K.phase === 'won' ? c4.phase === 'fallen' && c4.fell.by === 'caravan' && a.artifact.holder.kind === 'caravan' && a.chronicle.some(l => l.topic === 'calamity' && /караван/.test(l.text)) : true;
  check('эпос: могилы читают, мир мрачнеет с каждым следом, охота идёт; победа — босс пал от рук каравана, артефакт у него', read === Q.found && dark === Math.min(3, Q.found) && (Q.found < 2 || (K.stats.pursuers || 0) > 0) && end,
    `${K.phase}, следов ${Q.found}, прочли ${read}, мрачнее ${dark} раз, погонь ${K.stats.pursuers || 0}, четвёртое ${c4.phase}${c4.fell ? ' — ' + c4.fell.by : ''}`);
  // the doom: the fourth rises in the world in its year, and its lair is guarded harder
  const b = freshE(), K2 = newCampaign(b, capsE[1 % capsE.length].town, {mode: 'auto'}), d4 = b.calamities.at(-1), g0 = K2.quest.crown.guard.strength;
  d4.riseAt = b.hist.year + 1;
  for (let k = 0; k < 8 && stepCampaign(b); k++);
  check('эпос: в свой год четвёртое бедствие начинается в мире, логово стерегут злее', d4.phase === 'rise' && K2.quest.crown.guard.strength > g0 * 1.3 && b.chronicle.some(l => l.calamity === d4.id && /Началось новое бедствие/.test(l.text)),
    `${d4.phase}, стража ${g0.toFixed(2)} → ${K2.quest.crown.guard.strength.toFixed(2)}`);
  // on the local map the boss stands among its servants, grown past its kind
  const c = freshE(), K3 = newCampaign(c, capsE[0].town), G = K3.quest.crown.guard;
  const S = campSetup(c, K3, {kind: 'guard', foe: G, dayIn: 0}), w = openCamp(S);
  for (let t = 0; t < 600 && !w.campaign.spawned; t++) stepCamp(w);
  const boss = w.campaign.boss;
  check('эпос: на штурме логова босс стоит среди слуг, сильнее своего рода', !!boss && boss.name === G.boss.name && Object.entries(G.boss.add).every(([id, v]) => v > 0 && boss.special[id] >= v),
    boss ? `${boss.name}: ${['S', 'E', 'A'].map(id => `${id} ${boss.special[id]}`).join(', ')}` : 'босса нет');
}
if (!ok) process.exit(1);

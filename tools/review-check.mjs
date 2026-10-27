// The findings of the review of the branch Role (docs/TODO.md), each held to what fixed it: one led off by raiders
// leaves the caravan; wounds and traumas go with a member from camp to camp; a healer is no looter while another can
// be; a far ally does not stop a fire flask; one wounded out of reach does not keep a healer from the next; a
// shooter drinks its brews before the first shot (not at game); a strong grade replaces the plain one in a belt;
// the path search finds a road off the straight line; a lane of paused offers gives way to the next (not under an
// alarm). Part of `npm test`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {T, BY_CODE} from '../src/data/terrain.js';
import {createAgent} from '../src/agents/agent.js';
import {dress, recalcGear} from '../src/agents/equipment.js';
import {hurl, shoot} from '../src/agents/combat.js';
import {taskKey, skipped} from '../src/agents/lifecycle.js';
import {rebelt, threatOf} from '../src/agents/potions.js';
import {findPath} from '../src/nav/astar.js';
import {woundsOut, woundsIn, wearOff} from '../src/campaign/potions.js';
import {DAY} from '../src/core/time.js';

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
function scene() {
  const w = newGame({...DEFAULT_CFG, seed: 'review', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.heat[i] = 15; w.grid.fire[i] = 0; }
  return w;
}
const put = (w, sp, fac, x, kit = []) => { const a = createAgent(w, sp, fac, x, 20.5); if (kit.length) dress(a, kit, 20); recalcGear(a); return a; };

// one led off: out of the caravan, alive (campaign/camp.js campOutcome); wounds and traumas taken out of the camp
{
  const {campSetup, openCamp, campOutcome} = await import('../src/campaign/camp.js');
  const {generateAtlas} = await import('../src/atlas/generate.js');
  const {capitals, newCampaign} = await import('../src/campaign/index.js');
  const a = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const K = newCampaign(a, capitals(a)[0].town, {mode: 'local'});
  K.members[1].wounds = [{id: 'limp', day: null}];
  const w = openCamp(campSetup(a, K, {kind: 'stop', dayIn: 0}));
  const ag0 = w.campaign.people.get(K.members[0].id), ag1 = w.campaign.people.get(K.members[1].id);
  expect(ag1.wounds?.some(x => x.id === 'limp') && ag1.mods.speed < 1, 'хромота не дошла до стоянки');
  ag0.gone = true;
  const o = campOutcome(w), m0 = o.members.find(m => m.id === K.members[0].id), m1 = o.members.find(m => m.id === K.members[1].id);
  expect(m0.taken && !m0.alive, `уведённый участник вернулся в караван: ${JSON.stringify(m0).slice(0, 120)}`);
  expect(m1.wounds?.some(x => x.id === 'limp' && x.ticks == null), 'хромота не вернулась со стоянки');
}

// wounds across the maps: a trauma for life, a grave wound by its days
{
  const K = {day: 10, members: []};
  const out = woundsIn(K, [{id: 'limp', ticks: null}, {id: 'grave', ticks: DAY * 2}]);
  const m = {alive: true, wounds: out};
  expect(out.length === 2 && out[0].day == null && out[1].day === 11, `раны на карту мира: ${JSON.stringify(out)}`);
  const back = woundsOut(K, m);
  expect(back.find(x => x.id === 'limp').ticks === null && back.find(x => x.id === 'grave').ticks === 2 * DAY, `раны на стоянку: ${JSON.stringify(back)}`);
  K.members = [m]; K.day = 12; wearOff(K);
  expect(m.wounds?.length === 1 && m.wounds[0].id === 'limp', `тяжёлая рана не зажила в срок или травма ушла: ${JSON.stringify(m.wounds)}`);
}

// a far ally does not stop a fire flask; a near one does
{
  const w = scene(), a = put(w, 'human', 'colony', 10.5), t = put(w, 'human', 'raiders', 16.5), al = put(w, 'human', 'colony', 23.5);
  a.belt = ['fireFlask']; t.hp = 50;
  expect(hurl(w, a, t, 6), 'склянку запретил союзник в семи клетках от цели');
  const w2 = scene(), a2 = put(w2, 'human', 'colony', 10.5), t2 = put(w2, 'human', 'raiders', 16.5), near = put(w2, 'human', 'colony', 17.5);
  a2.belt = ['fireFlask'];
  expect(!hurl(w2, a2, t2, 6) && near, 'склянку бросили рядом со своим');
  void al;
}

// one wounded out of reach keeps a healer from that one only
{
  const w = scene(), h = put(w, 'human', 'raiders', 20.5);
  w.tick = 600; (h.skips ||= {})[taskKey({id: 'mend', who: 1})] = 1200;
  expect(skipped(w, h, {id: 'mend', who: 1}) && !skipped(w, h, {id: 'mend', who: 2}), 'один недоступный раненый закрыл лечение других');
}

// a shooter drinks its brews before the first shot at a foe, not at game, and no oil goes on a bow
{
  const w = scene(), b = put(w, 'human', 'colony', 20.5, ['bow', 'quiver']), t = put(w, 'human', 'raiders', 24.5);
  w.tick = Math.round(DAY / 2);   // (by day: the night shortens a shot)
  b.belt = ['lightStep', 'bladeVenom']; b.cd = 0;
  const r = shoot(w, b, t);
  expect(r === 'drink' && !b.belt.includes('lightStep') && b.belt.includes('bladeVenom') && !b.coat, `стрелок перед выстрелом: ${r}, пояс ${b.belt}`);
  const hare = put(w, 'hare', 'wild', 22.5); const b2 = put(w, 'human', 'colony', 20.5, ['bow', 'quiver']); b2.belt = ['lightStep']; b2.cd = 0;
  shoot(w, b2, hare);
  expect(b2.belt.includes('lightStep'), 'охотник выпил боевое зелье перед выстрелом по зайцу');
}

// a strong grade takes the plain one's place in a belt, one for one
{
  const a = {belt: ['bearBrew', 'antidote']}, S = {bearBrewStrong: 1};
  rebelt(a, 'human', r => S[r] || 0, r => { S[r]--; }, r => { S[r] = (S[r] || 0) + 1; }, () => true, threatOf({}));
  expect(a.belt.includes('bearBrewStrong') && !a.belt.includes('bearBrew') && S.bearBrew === 1, `усиленное не заменило простое: ${a.belt}`);
}

// the path search: a cheap road off the straight line, as Dijkstra finds it
{
  const W = 24, H = 9, terr = new Uint8Array(W * H).fill(T.GRASS);
  for (let x = 1; x <= 22; x++) terr[2 * W + x] = T.ROAD;
  const w = {w: W, h: H, n: W * H, grid: {terr}};
  const p = findPath(w, 1.5, 4.5, 22.5, 4.5);
  let cost = 0, prev = 4 * W + 1;
  for (const c of p || []) { const dx = Math.abs((c % W) - (prev % W)), dy = Math.abs(((c / W) | 0) - ((prev / W) | 0)); cost += BY_CODE[terr[c]].pathCost * (dx && dy ? Math.SQRT2 : 1); prev = c; }
  expect(p && Math.abs(cost - 15.2911688245) < 1e-6, `путь не по дороге: цена ${cost}`);
}

// a healer is no looter while another can be (agents/squad.js)
{
  const {createSquad} = await import('../src/agents/squad.js');
  const w = scene();
  const g = [['shield', ['ironspear', 'shield']], ['cleaver', ['ironaxe']], ['spearman', ['ironspear']], ['healer', ['staff']]].map(([role, kit], k) => { const a = put(w, 'human', 'raiders', 20.5 + k, kit); a.fightRole = role; a.band = 'bandits'; return a; });
  g[3].hp = 0.2;
  try {
    createSquad(w, g, {goal: 'loot'});
    expect(g[3].sqRole !== 'looter' && g[3].sqRole !== 'torch', `знахарь в грабителях: ${g[3].sqRole}`);
  } catch (e) { bad.push(`отряд не собрался для проверки знахаря: ${e.message}`); }
}

// a healer passes over a fallen one it could not reach for the next (Codex on PR #25: tactics.js healer)
{
  const {roleTactic} = await import('../src/agents/tactics.js');
  const w = scene(), h = put(w, 'human', 'raiders', 20.5, ['staff']), f1 = put(w, 'human', 'raiders', 21.5), f2 = put(w, 'human', 'raiders', 23.5);
  h.fightRole = 'healer'; f1.downed = {until: 9999}; f2.downed = {until: 9999};
  const side = {fallen: () => [f1, f2], all: () => [h], has: () => false};
  w.tick = 100; (h.skips ||= {})[taskKey({id: 'mend', who: f1.id})] = 700;
  const t = roleTactic(w, h, side, 8);
  expect(t?.id === 'mend' && t.who === f2.id, `знахарь не перешёл ко второму раненому: ${JSON.stringify(t)}`);
}

// the sleeping brew holds a captive through a red alarm till dawn (Codex on PR #25: escape.js)
{
  const src = (await import('node:fs')).readFileSync(new URL('../src/settlement/escape.js', import.meta.url), 'utf8');
  expect(/sleepsUntil/.test(src.slice(src.indexOf('a red alarm'))), 'тревога не смотрит, что пленный спит после сонного отвара');
}

// the recheck (R02a, R02b): a new captive's wounds go with it; a member still senseless at the camp's end is bound — a
// grave wound and its trauma (campaign/camp.js campOutcome, campaign/captives.js takeFromCamp)
{
  const {campSetup, openCamp, campOutcome} = await import('../src/campaign/camp.js');
  const {takeFromCamp} = await import('../src/campaign/captives.js');
  const {generateAtlas} = await import('../src/atlas/generate.js');
  const {capitals, newCampaign} = await import('../src/campaign/index.js');
  const a = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const K = newCampaign(a, capitals(a)[0].town, {mode: 'local'});
  const w = openCamp(campSetup(a, K, {kind: 'stop', dayIn: 0}));
  const ag = w.campaign.people.get(K.members[0].id);
  ag.downed = {until: w.tick + 999, cause: 'ран', trauma: 'limp'};
  const o = campOutcome(w), m0 = o.members.find(m => m.id === K.members[0].id);
  expect(m0.alive && m0.wounds?.some(x => x.id === 'grave') && m0.wounds.some(x => x.id === 'limp' && x.ticks == null), `упавший к концу стоянки встал без раны: ${JSON.stringify(m0.wounds)}`);
  const room = K.members.length;
  o.taken = [{name: 'Пленник', gender: 'm', race: 'human', special: {...K.members[0].special}, hp: 0.5, bonds: 'rope', will: 0.5, gear: {hand: [], body: 'clothes'}, wounds: [{id: 'limp', ticks: null}, {id: 'grave', ticks: 2 * DAY}]}];
  const got = takeFromCamp(a, K, o, () => {});
  if (got.length) expect(got[0].wounds?.some(x => x.id === 'limp' && x.day == null) && got[0].wounds.some(x => x.id === 'grave' && x.day > K.day), `травма нового пленного потерялась: ${JSON.stringify(got[0].wounds)}`);
  else bad.push(`пленного не взяли для проверки ран (в отряде ${room})`);
}

// a belt place is counted where a full belt would trade its worst for the new potion (Codex on PR #25)
{
  const {kindRoom} = await import('../src/campaign/potions.js');
  const {POTIONS} = await import('../src/data/potions.js');
  const K = {members: [{alive: true, race: 'human', potions: 3, belt: ['bladeVenom', 'lightStep'], gear: {hand: ['ironaxe']}}], cargo: {}, fights: [{species: {vampire: 3}}], buildings: [], vehicles: [], beasts: [], stats: {}};
  expect(kindRoom(K, POTIONS.get('silver'), 'silverOil') === 1, `под серебряное масло нет места в полном поясе против вампиров: ${kindRoom(K, POTIONS.get('silver'), 'silverOil')}`);
}

// the entry points load first, each in a fresh process (the recheck's N01: a cycle of imports broke the tables and the
// page): the tools' and the game's own; the page (src/app/main.js) gets as far as the browser it needs
{
  const {execFile} = await import('node:child_process');
  const root = new URL('../src/', import.meta.url).pathname;
  const ENTRIES = ['sim.js', 'data/schema/index.js', 'campaign/index.js', 'atlas/generate.js', 'world/save.js', 'outside/index.js', 'app/main.js',
    'agents/tactics.js', 'agents/lifecycle.js', 'agents/tasks.js', 'agents/jobRunners.js', 'agents/combat.js', 'agents/potions.js', 'agents/squad.js',
    'settlement/potions.js', 'settlement/escape.js', 'campaign/potions.js', 'campaign/camp.js', 'campaign/captives.js', 'data/potions.js', 'data/raids.js'];
  const BROWSER = /(document|window|localStorage|requestAnimationFrame|HTMLElement) is not defined/;
  const run = f => new Promise(res => execFile(process.execPath, ['-e', `import(${JSON.stringify(root + f)}).then(() => {}, e => { console.error(e.message); process.exit(1); })`], (err, out, errOut) => {
    const msg = (errOut || '').trim().split('\n').find(l => /Error|not defined|before initialization/.test(l)) || (errOut || '').trim().split('\n')[0];
    res(err && !BROWSER.test(errOut || '') ? `${f}: ${msg}` : null);
  }));
  const fails = (await Promise.all(ENTRIES.map(run))).filter(Boolean);
  expect(!fails.length, `не грузятся первыми: ${fails.join('; ')}`);
}

if (bad.length) { console.log('Ревизия Role:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('ok   ревизия Role: повторная проверка — раны нового пленного и упавшего к концу стоянки, место под замену в поясе, точки входа грузятся первыми; уведённый уходит, раны и травмы идут со стоянки на стоянку, склянка — по точному кругу, недоступный раненый не закрывает других, стрелок пьёт перед первым выстрелом (не по дичи), усиленное заменяет простое, путь по дороге как у Дейкстры, знахарь не грабит');

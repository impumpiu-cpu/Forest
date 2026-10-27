// Potions (docs/RULES.md «Зелья», data/potions.js): what each does is its row of «Состояния»; the healing potion has its
// slot, the others two belt places; drunk by themselves when their moment comes — at the edge of death, with venom in
// the blood, at the first blow of a fight; the poison on a blade passes into what it strikes and wears off; a strong bear's
// brew holds its drinker to the ground; a mark is never taken twice; every potion takes a pot; the settlement's stock fills
// the slots and belts, the caravan's healer's hut brews the plain grades from the cargo. Part of `npm test`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {T} from '../src/data/terrain.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {attack, damage} from '../src/agents/combat.js';
import {dress, recalcGear} from '../src/agents/equipment.js';
import {stepEffects} from '../src/agents/body.js';
import {quaff, drink} from '../src/agents/potions.js';
import {holdsGround} from '../src/agents/auras.js';
import {stepPotions} from '../src/settlement/potions.js';
import {CONDITIONS, effectResist} from '../src/data/conditions.js';
import {POTION, POTIONS} from '../src/data/potions.js';
import {RECIPES} from '../src/data/recipes.js';

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
function scene() {
  const w = newGame({...DEFAULT_CFG, seed: 'potions', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.heat[i] = 15; w.grid.fire[i] = 0; }
  return w;
}
const rngs = (w, v) => { for (const k of Object.keys(w.rngs)) w.rngs[k] = Object.assign(() => v, {state: 0}); };
const put = (w, sp, fac, kit = []) => { const a = createAgent(w, sp, fac, 20.5, 20.5); if (kit.length) dress(a, kit); a.mods.dodge = 0; a.gear = {...recalcGear(a), block: 0, cover: 0}; return a; };

// every potion takes a pot; the hut brews only the plain grades of its tier
for (const p of POTIONS.all()) for (const g of p.grades) expect(g.cost.pots >= POTION.pot, `${g.res}: без горшка`);
expect(RECIPES.all().filter(r => r.at === 'healerhut').every(r => r.tier <= POTION.hutTier && !/Strong$/.test(r.id)), 'хижина лекаря варит усиленное или слишком сложное');

// the edge of death: the slot's healing potion, then a strong one from the belt
{
  const w = scene(), a = put(w, 'human', 'colony');
  a.potions = 1; a.belt = ['potionStrong']; a.hp = maxHp(a) * 0.1;
  quaff(w, a);
  expect(a.potions === 0 && a.belt.length === 1 && Math.abs(a.hp - (maxHp(a) * 0.1 + CONDITIONS.get('potHeal').heal)) < 1e-9, 'лечение: не из гнезда или не на heal');
  a.hp = maxHp(a) * 0.1; a.bleeding = {dmg: 0.001, until: w.tick + 99}; quaff(w, a);
  expect(!a.belt.length && !a.bleeding && a.hp > maxHp(a) * 0.1, 'усиленное лечение из пояса не выпито или не остановило кровь');
}

// venom in the blood: the antidote ends it, and a new bite reaches only its share for a while
{
  const w = scene(), a = put(w, 'human', 'colony'), spider = put(w, 'spider', 'raiders');
  a.belt = ['antidote']; rngs(w, 0.99); a.hp = 5;
  damage(w, spider, a, 0.001);
  const full = a.poison?.dmg;
  stepEffects(w, a);
  expect(full > 0 && !a.poison && !a.belt.length, 'противоядие не выпито при яде или яд остался');
  damage(w, spider, a, 0.001);
  expect(Math.abs(a.poison.dmg - full * CONDITIONS.get('potAntidote').resist.poison) < 1e-12, `после противоядия яд не ослаб: ${a.poison?.dmg} против ${full}`);
  w.tick += CONDITIONS.get('potAntidote').ticks + 1; stepEffects(w, a);
  expect(effectResist(w, a, 'poison') === 1 && !a.effects, 'противоядие не кончилось в срок');
}

// a bear's brew at the first blow: stronger for a while, then as before; a strong one holds the ground
{
  const w = scene(), a = put(w, 'human', 'raiders', ['ironaxe']), t = put(w, 'human', 'colony');
  t.x = a.x + 1; a.belt = ['bearBrew']; const str = a.mods.str;
  a.cd = 0; attack(w, a, t);
  expect(!a.belt.length && a.mods.str > str * 1.1 && a.cd > 0, 'медвежья сила не выпита перед первым ударом или не прибавила силы');
  w.tick += CONDITIONS.get('potBear').ticks + 1; stepEffects(w, a);
  expect(Math.abs(a.mods.str - str) < 1e-9, 'медвежья сила не кончилась в срок');
  a.belt = ['bearBrewStrong']; drink(w, a, 'bearBrewStrong'); a.hp = maxHp(a) * 0.3;
  expect(holdsGround(w, a), 'усиленная медвежья сила не держит на поле');
}

// a poison on the blade: rubbed on at the first blow, passes into what it strikes, wears off, not into the dead
{
  const w = scene(), a = put(w, 'human', 'raiders', ['ironaxe']), t = put(w, 'human', 'colony'), sk = put(w, 'skeleton', 'colony');
  t.x = a.x + 1; t.hp = 50; a.belt = ['bladeVenom']; rngs(w, 0.5);
  a.cd = 0; attack(w, a, t);
  const hits = CONDITIONS.get('potVenom').blade.hits;
  expect(a.coat?.hits === hits, 'яд не нанесён на клинок перед первым ударом');
  a.cd = 0; attack(w, a, t);
  expect(t.poison?.dmg > 0 && a.coat?.hits === hits - 1, 'удар отравленным клинком не отравил');
  sk.x = a.x + 1; sk.hp = 50; t.x = 99; a.cd = 0; attack(w, a, sk);
  expect(!sk.poison, 'яд с клинка отравил нежить');
  for (let k = 0; k < hits + 2; k++) { t.x = a.x + 1; t.poison = null; a.cd = 0; attack(w, a, t); }
  expect(!a.coat, 'яд на клинке не стёрся');
  const b = put(w, 'human', 'raiders', ['bow', 'quiver']); b.belt = ['bladeVenom'];
  b.x = 30; b.cd = 0; const t2 = put(w, 'human', 'colony'); t2.x = 31; attack(w, b, t2);
  expect(b.belt.length === 1 && !b.coat, 'лучник натёр ядом лук');
}

// a mark is never taken twice
{
  const w = scene(), a = put(w, 'human', 'colony'), row = CONDITIONS.get('potBear');
  row.mark = 'trained'; a.marks = ['trained']; a.belt = ['bearBrew'];
  expect(!drink(w, a, 'bearBrew') && a.belt.length === 1, 'зелье с меткой выпито второй раз');
  delete row.mark;
}

// the stock fills the slots and the belts: two places at most, a poison for the blade only to one with a blade
{
  const w = scene(), a = put(w, 'human', 'colony', ['ironaxe']), b = put(w, 'human', 'colony', ['bow', 'quiver']);
  a.diary = []; b.diary = [];
  w.stock.potion = 4; w.stock.antidote = 3; w.stock.bearBrew = 3; w.stock.bladeVenom = 3;
  for (let k = 0; k < 6; k++) { w.tick = k * POTION.hand; stepPotions(w); }
  expect(a.potions >= 1 && b.potions >= 1, 'гнёзда лечения не наполнились');
  expect(a.belt?.length === POTION.belt && b.belt?.length === POTION.belt, `пояса: ${a.belt} / ${b.belt}`);
  expect(!b.belt.includes('bladeVenom'), 'лучнику дали яд для клинка');
}

// the caravan: the healer's hut brews the plain grades from the cargo, a pot each; no pot — nothing
{
  const {brewDay} = await import('../src/campaign/potions.js');
  const K = {members: [{alive: true, potions: 0, gear: {hand: ['ironaxe']}}, {alive: true, potions: 0, gear: {hand: ['bow']}}],
    cargo: {herbs: 4, slime: 1, bile: 1, braga: 1, venom: 1, wax: 1}, buildings: ['healerhut'], vehicles: [], beasts: []};
  const hut = (await import('../src/campaign/baggage.js')).hasBuilding;
  if (hut(K, 'healerhut')) {
    expect(brewDay(K, () => 1, false) === 0, 'без горшков сварили зелье');
    K.cargo.pots = 6;
    const n = brewDay(K, () => 1, false);
    expect(n >= 4 && K.members.every(m => m.potions >= 1) && K.members.some(m => m.belt?.length), `хижина каравана сварила ${n}, пояса ${K.members.map(m => m.belt).join(' / ')}`);
  } else bad.push('проверка похода: хижина лекаря не найдена в лагере каравана (K.buildings)');
}

// the brews of the stock: a freezing one drinks a warming one, a hurt one a strengthening one (its grave wound heals
// sooner), one worn out on the watch an invigorating one; none goes into a belt; one of a kind at a time
{
  const w = scene(), a = put(w, 'human', 'colony');
  a.diary = []; a.needs.warmth = 0.1; a.needs.rest = 0.1; a.task = {id: 'watch'};
  a.hp = maxHp(a) * 0.4; a.wounds = [{id: 'grave', until: w.tick + 4000}];
  w.stock.warmBrew = 2; w.stock.mendBrew = 2; w.stock.vigorBrew = 2;
  const cold = a.mods.cold;
  w.tick = POTION.hand * 10; stepPotions(w);
  expect(w.stock.warmBrew === 1 && a.needs.warmth > 0.1 && a.mods.cold < cold, 'согревающий отвар не выпит или не согрел');
  expect(w.stock.vigorBrew === 1 && a.needs.rest > 0.1, 'бодрящий отвар на посту не выпит');
  expect(w.stock.mendBrew === 1 && a.wounds[0].until < w.tick + 4000 * 0.8 && a.mods.mend > 1, `укрепляющий отвар: рана ${a.wounds[0].until - w.tick}, заживление ${a.mods.mend}`);
  expect(!a.belt?.length, 'отвар попал в пояс');
  a.needs.warmth = 0.1; w.tick += POTION.hand; stepPotions(w);
  expect(w.stock.warmBrew === 1, 'второй согревающий выпит, пока первый действует');
}

// the sleeping brew: a captive set on running sleeps the night through instead of plotting
{
  const {sleepDose} = await import('../src/agents/potions.js');
  const st = {sleepBrewStrong: 1, sleepBrew: 1};
  const d1 = sleepDose(st), d2 = sleepDose(st), d3 = sleepDose(st);
  expect(d1?.calm > 0 && d2?.sleeps && !d2.calm && d3 === null, 'сонный отвар: не усиленный первым или выдан из пустого');
}

// the caravan: brews have their own room in the cargo, never in a belt; the hut brews them from the new herbs
{
  const {brewDay, homeRoom, mendDay} = await import('../src/campaign/potions.js');
  const K = {members: [{alive: true, potions: 3, belt: ['antidote', 'bearBrew'], gear: {hand: ['ironaxe']}, hp: 0.3}, {alive: true, potions: 3, belt: ['antidote', 'bearBrew'], gear: {hand: ['bow']}, hp: 1}],
    cargo: {wort: 4, herbs: 4, bone: 2, sleepgrass: 2, pots: 10}, buildings: ['healerhut'], vehicles: [], beasts: []};
  const n = brewDay(K, () => 1, false);
  expect(n >= 2 && K.cargo.warmBrew >= 1 && K.cargo.mendBrew >= 1 && !K.cargo.sleepBrew, `хижина каравана сварила отваров ${n}: ${JSON.stringify(K.cargo)}`);
  expect(homeRoom(K, POTIONS.get('mend')) <= 0 && K.members.every(m => m.belt.length === 2 && !m.belt.some(r => /Brew$/.test(r) && r !== 'bearBrew')), 'отвары в поясе или сверх запаса');
  const hp = K.members[0].hp; mendDay(K);
  expect(K.members[0].hp > hp && K.members[1].hp === 1, 'укрепляющий в походе не выпит раненым');
}

// a brew of the day on the world map: everyone drinks or nobody; it works a day (the strong two) and goes onto the
// local map and back
{
  const {brewTheDay, wearOff, effectsOut, effectsIn, workingOn} = await import('../src/campaign/potions.js');
  const K = {day: 10, members: [1, 2, 3, 4, 5].map(id => ({alive: true, id})), cargo: {warmBrew: 1}, stats: {}, buildings: [], vehicles: [], beasts: []};
  expect(!brewTheDay(K, 'cold', K.members) && K.cargo.warmBrew === 1, 'согревающий выпит, когда котлов не хватает на всех');
  K.cargo.warmBrewStrong = 1;
  expect(brewTheDay(K, 'cold', K.members) && !K.cargo.warmBrew && !K.cargo.warmBrewStrong, 'два котла на пятерых не выпиты');
  const out = effectsOut(K, K.members[0]);
  expect(out.length === 1 && out[0].ticks === CONDITIONS.get(out[0].id).ticks, `отвар на локальную карту: ${JSON.stringify(out)}`);
  expect(effectsIn(K, [{id: 'potWarm', ticks: 300}])[0].day === K.day, 'остаток отвара с локальной карты: не до конца дня');
  K.day++; wearOff(K);
  expect(K.members.filter(m => workingOn(K, m, 'cold')).length === POTION.home.kettle, 'простой согревающий не кончился за день или усиленный кончился');
}

// modifiers do not pile up: of those pushing one key the same way the strongest works (agents/special.js refreshBody)
{
  const {refreshBody} = await import('../src/agents/special.js');
  const w = scene(), a = put(w, 'human', 'colony');
  a.traits = []; a.effects = null; refreshBody(a); const c0 = a.mods.cold;
  a.traits = ['hardy']; refreshBody(a); const c1 = a.mods.cold;
  a.effects = [{id: 'potWarm', until: w.tick + 999}]; refreshBody(a); const c2 = a.mods.cold;
  expect(Math.abs(c1 - c0 * 0.6) < 1e-9 && Math.abs(c2 - c0 * CONDITIONS.get('potWarm').mods.cold) < 1e-9, `холод не по сильнейшему: ${c0} → ${c1} → ${c2}`);
  a.traits = ['hardy', 'chilly']; a.effects = null; refreshBody(a);
  expect(Math.abs(a.mods.cold - c0 * 0.6 * 1.5) < 1e-9, 'прибавка и убыль в разные стороны не сложились');
  const tr = put(w, 'troll', 'raiders'); tr.effects = [{id: 'potMend', until: w.tick + 999}]; refreshBody(tr);
  expect(tr.mods.regen > 1 && tr.mods.mend === CONDITIONS.get('potMend').mods.mend, `тролль: заживление ${tr.mods.regen}, отвар ${tr.mods.mend}`);
}

// silver oil goes on the blade against what fears silver (a poison against the living), and bites it as silver
{
  const w = scene(), a = put(w, 'human', 'colony', ['ironaxe']), v = put(w, 'vampire', 'raiders'), h = put(w, 'human', 'raiders');
  a.belt = ['bladeVenom', 'silverOil']; v.x = a.x + 1; v.hp = 99; rngs(w, 0.5);
  a.cd = 0; attack(w, a, v);
  expect(a.coat?.id === 'potSilver' && a.belt.includes('bladeVenom'), `против вампира на клинок не масло: ${a.coat?.id}`);
  const hp0 = v.hp; a.cd = 0; attack(w, a, v); const withOil = hp0 - v.hp;
  a.coat = null; v.hp = 99; a.cd = 0; attack(w, a, v);   // (the venom is not for it: nothing goes on)
  const hp1 = v.hp; a.coat = null; a.cd = 0; attack(w, a, v); const bare = hp1 - v.hp;
  expect(withOil > bare * 2, `масло не бьёт как серебро: ${withOil} против ${bare}`);
  const b = put(w, 'human', 'colony', ['ironaxe']); b.belt = ['bladeVenom', 'silverOil']; b.x = 40; h.x = 41; b.cd = 0; attack(w, b, h);
  expect(b.coat?.id === 'potVenom', 'против живого на клинок не яд');
}

// fire: a fire-ward drunk when the fire burns, it holds the fire off; a flask hurled burns the foe and not one's own
{
  const {heatHarm} = await import('../src/agents/body.js');
  const {SPECIES} = await import('../src/data/species.js');
  const w = scene(), a = put(w, 'human', 'colony'), sp = SPECIES.get('human'), tick = () => { w.tick++; if (w.scratch) w.scratch = {}; };
  const hp = a.hp; heatHarm(a, sp, sp.heatHarm + 20, 'colonist'); const bare = hp - a.hp;
  a.hp = hp; a.belt = ['firewardBrew']; heatHarm(a, sp, sp.heatHarm + 20, 'colonist', w); const warded = hp - a.hp;
  expect(!a.belt.length && Math.abs(warded - bare * CONDITIONS.get('potFireward').resist.fire) < 1e-9, `огнестойкость: ${warded} против ${bare}`);
  const {hurl} = await import('../src/agents/combat.js');
  const t = put(w, 'human', 'raiders'), c = put(w, 'human', 'colony'); t.x = a.x + 4; c.x = 60; t.hp = 5;
  a.belt = ['fireFlask']; a.cd = 0;
  expect(hurl(w, a, t, 4) && t.hp < 5 && !a.belt.length, 'склянка не брошена или не обожгла');
  a.belt = ['fireFlask']; a.cd = 0; c.x = t.x + 0.5; c.y = t.y; tick();
  expect(!hurl(w, a, t, 4) && a.belt.length === 1, 'склянку бросили рядом со своим');
  a.cd = 0; c.x = 60;
  expect(!hurl(w, a, t, 1) && a.belt.length === 1, 'склянку бросили вплотную');
}

// light step, cat's eye at the first blow at night, the elixir of tempering: a mark for life, never twice
{
  const {nightSight, NIGHT} = await import('../src/data/tongues.js');
  const loss = NIGHT.loss; NIGHT.loss = 0.5;   // (the night hides nothing by default: the eye would have nothing to do)
  const w = scene(), a = put(w, 'human', 'colony', ['ironaxe']), t = put(w, 'human', 'raiders');
  t.x = a.x + 1; t.hp = 50; a.belt = ['lightStep', 'catEye']; const speed = a.mods.speed;
  a.cd = 0; attack(w, a, t);
  expect(a.mods.speed > speed && a.belt.includes('catEye'), 'лёгкий шаг не выпит перед боем или кошачий глаз выпит днём');
  expect(nightSight('human', 1, a) < 1, 'без кошачьего глаза видит ночью как днём');
  drink(w, a, 'catEye');
  expect(nightSight('human', 1, a) === 1, 'кошачий глаз не дал видеть во мраке');
  NIGHT.loss = loss;
  a.diary = []; w.stock.temperElixir = 2; const hpMax = maxHp(a);
  w.tick = POTION.hand * 50; stepPotions(w); w.tick += POTION.hand; stepPotions(w);
  expect(a.marks?.includes('tempered') && w.stock.temperElixir === 1 && maxHp(a) > hpMax, `эликсир закалки: метки ${a.marks}, осталось ${w.stock.temperElixir}`);
}

if (bad.length) { console.log('Зелья:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   зелья: ${POTIONS.all().length} (ступеней ${POTIONS.all().reduce((s, p) => s + p.grades.length, 0)}) — лечение из гнезда и пояса, противоядие при яде, медвежья сила и яд на клинке перед первым ударом, усиленное держит на поле, метка не дважды; горшок в каждом; запасы наполняют пояса; хижина каравана варит простое; отвары из запасов — согревающий, бодрящий, укрепляющий, сонный пленному; масло против боящихся серебра, огнестойкость, склянка мимо своих, лёгкий шаг, кошачий глаз, закалка навсегда`);

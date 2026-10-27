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

if (bad.length) { console.log('Зелья:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   зелья: ${POTIONS.all().length} (ступеней ${POTIONS.all().reduce((s, p) => s + p.grades.length, 0)}) — лечение из гнезда и пояса, противоядие при яде, медвежья сила и яд на клинке перед первым ударом, усиленное держит на поле, метка не дважды; горшок в каждом; запасы наполняют пояса; хижина каравана варит простое`);

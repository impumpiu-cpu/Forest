// Physical stores and repeated seasonal calculations: small fixtures through the production modules.
import assert from 'node:assert/strict';
import {planBuild, doBuild, seasonMoney, goodsFor} from '../src/atlas/treasury.js';
import {TOWN_MONEY} from '../src/data/townBuildings.js';
import {sendArmy, armyLosses, returnArmy} from '../src/atlas/army.js';
import {stepWarBeasts} from '../src/atlas/beasts.js';
import {stepGolems} from '../src/atlas/golems.js';
import {BIOMES} from '../src/data/biomes.js';
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
import {eligible, putUp} from '../src/settlement/buildings.js';
import {makeTame, stepHerd, herd} from '../src/settlement/herd.js';
import {foodTotal} from '../src/settlement/query.js';
import {HOUR} from '../src/core/time.js';
const check = (name, f) => { f(); console.log(`ok   ${name}`); };
const town = (o = {}) => ({id: 1, realm: '1', name: 'Проверка', people: 'humans', alive: true, i: 13, pop: 200, tier: 1,
  gold: 100, peopleGold: 100, makersGold: 100, grant: 0, stock: {}, built: [], work: {}, ...o});
const world = (towns = []) => ({towns, realms: [{id: '1', people: 'humans', gold: 0}], hist: {year: 1, step: 0}, net: {links: new Map()}});
const flat = t => {
  const a = world([t]), n = 144, biome = BIOMES.all().findIndex(b => b.id === 'meadow') + 1;
  return Object.assign(a, {w: 12, h: 12, n, cfg: {}, parties: [], f: {ocean: new Uint8Array(n), lake: new Int32Array(n).fill(-1),
    biome: new Uint8Array(n).fill(biome), flat: new Float32Array(n).fill(1), flow: new Float32Array(n), road: new Float32Array(n), temp: new Float32Array(n).fill(15)}});
};
const game = () => { const w = newGame({...DEFAULT_CFG, seed: 'herd-regression', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'}); w.agents = []; return w; };

check('стройка объединяет дерево и заменённые доски до резервирования; склад остаётся конечным', () => {
  // (what a house takes, as the orcs take it: TOWN_MONEY.build.mats — boards swapped for logs; one stock short of it, one over it)
  const need = goodsFor('orcs', TOWN_MONEY.build.mats.housing).wood;
  for (const wood of [need * 0.6, need + 5]) {
    const t = town({people: 'orcs', stock: {wood}, econ: {dem: {}, freeHands: 100}}), a = world([t]);
    const p = planBuild(a, t, {tier: 1, cat: 'housing'});
    assert.ok(p); assert.equal(p.own.filter(([g]) => g === 'wood').length, 1);
    assert.equal(p.own[0][1], Math.min(wood, need)); assert.equal(p.gather > 0, wood < need);
    doBuild(p); assert.ok(Object.values(t.stock).every(v => Number.isFinite(v) && v >= 0)); assert.ok(Math.abs((t.stock.wood || 0) - Math.max(0, wood - need)) < 0.01);
  }
});
check('запас базовых нужд учитывает кость вместо горшков и меньшие нужды орды', () => {
  const s = town({people: 'orcs', pop: 100, peopleGold: 0, stock: {bone: 0.2}}), b = town({id: 2, people: 'orcs', pop: 100}), a = world([s, b]);
  a.net.links.set('1:2', {p: s, q: b, c: 1}); seasonMoney(a, [s, b]);
  assert.ok(s.stock.bone >= 0.19); assert.equal(b.econ.people?.bone?.got || 0, 0);
});
check('бойня даёт мясо, шкуры и кости за реальный расход обычного скота; загон без бойни не забивает; боевые звери целы', () => {
  const p = town({built: ['pen'], stock: {beasts: 10}}), ap = world([p]);
  seasonMoney(ap, [p]);
  assert.equal(p.econ.used.beasts || 0, 0); assert.equal(p.econ.made.raw || 0, 0); assert.ok(p.stock.beasts > 10);   // (the increase goes to the store)
  const t = town({built: ['pen', 'slaughter'], stock: {beasts: 10}, warBeasts: {list: {varg: 2}, men: 100}}), a = world([t]);
  seasonMoney(a, [t]);
  const e = t.econ;
  assert.ok(e.herd.slaughtered > 0); assert.ok(e.made.raw > 0 && e.made.hide > 0 && e.made.bone > 0 && e.lit.includes('meat'));   // (meat: raw food, the kitchens cook it; it lights «мясо»)
  assert.equal(e.used.beasts / 4, e.herd.slaughtered);
  assert.ok(Math.abs(t.stock.beasts - (10 + (e.made.beasts - e.used.beasts) / 4)) < 0.011);
  assert.deepEqual(t.warBeasts.list, {varg: 2}); assert.ok(t.stock.beasts >= 2);
});
check('логова выращивают отмеченных боевых зверей, а не мясной скот; неработающее логово не плодит', () => {
  // (a den is a recipe of the beast dens, by the kind the town holds: atlas/beasts.js, data/peoples.js WAR_BEASTS)
  for (const [den, species] of [['dens:wargs', 'varg'], ['dens:spiders', 'spider']]) {
    const t = town({people: 'orcs', pop: 500, built: ['dens'], work: {[den]: 1}}), a = world([t]);
    assert.equal(stepWarBeasts(a, t), species); assert.equal(t.warBeasts.list[species], 1); assert.equal(t.stock.beasts, undefined);
    t.work[den] = 0; assert.equal(stepWarBeasts(a, t), null);
  }
  const t = town({people: 'orcs', pop: 1000, built: ['dens'], work: {'dens:wargs': 1, 'dens:spiders': 1}}), a = world([t]);
  assert.equal(stepWarBeasts(a, t), 'varg'); a.hist.step = 2; assert.equal(stepWarBeasts(a, t), 'spider');
});
check('армия забирает боевых зверей, големов и снаряжение; обычный скот остаётся дома; возврат однократный', () => {
  const t = town({people: 'orcs', pop: 1000, stock: {beasts: 20, arms: 20, armor: 10, herbs: 6},
    warBeasts: {list: {varg: 2}, men: 100}, golems: {auto: {}, guard: ['iron'], since: null}}), a = flat(t);
  const p = sendArmy(a, t, 22, 100, {owner: '1'});
  assert.ok(p); assert.equal(t.stock.beasts, 20); assert.deepEqual(p.warBeasts, {varg: 2}); assert.deepEqual(t.warBeasts.list, {});
  assert.deepEqual(t.golems.guard, []); assert.deepEqual(p.golems, ['iron']); assert.equal(t.stock.arms, 10); assert.equal(t.stock.herbs, 3);
  const q = sendArmy(a, t, 22, 100, {owner: '1'});
  assert.deepEqual(q.warBeasts, {}); assert.deepEqual(q.golems, []);
  returnArmy(a, p); const back = JSON.stringify(t); returnArmy(a, p); assert.equal(JSON.stringify(t), back);
  assert.deepEqual(t.warBeasts.list, {varg: 2}); assert.deepEqual(t.golems.guard, ['iron']); assert.equal(t.stock.beasts, 20);
});
check('боевые звери и стражевые големы в пути занимают место в пределе города', () => {
  const t = town({pop: 200, built: ['dens'], work: {'dens:wargs': 1}, warBeasts: {list: {}, men: 0}}), a = world([t]);
  a.parties = [{kind: 'army', from: t.id, state: 'go', warBeasts: {varg: 1}, golems: ['iron']}];
  assert.equal(stepWarBeasts(a, t), null);
  t.built = ['golemforge', 'forge', 'mineshaft']; t.stock.bar_iron = 100; t.work.golemforge = 1;
  t.golems = {auto: {mineshaft: ['iron']}, guard: [], since: 0};
  assert.equal(stepGolems(a, t), null); assert.equal(t.stock.bar_iron, 100);
});
check('неудачная отправка не забирает людей и материальные запасы', () => {
  const t = town({stock: {arms: 10}, warBeasts: {list: {varg: 2}, men: 100}}), a = flat(t), before = JSON.stringify(t);
  a.f.ocean.fill(1); const p = sendArmy(a, t, 22, 100, {});
  assert.equal(p, null); assert.equal(JSON.stringify(t), before);
});
check('потери уменьшают силу; травы тратятся на раненых и не лечат голод', () => {
  const make = () => ({men: 100, men0: 100, force: 1, might: 10, kit: {herbs: 3}}), p = make(), bare = make(); bare.kit.herbs = 0;
  armyLosses(p, 0.2, () => 0.9, 'beaten'); armyLosses(bare, 0.2, () => 0.9, 'beaten');
  assert.ok(p.men > bare.men && p.men < 100 && p.might < 10); assert.ok(p.kit.herbs < 3 && p.herbsUsed > 0);
  const march = make(); armyLosses(march, 0.2, () => 0.9); assert.equal(march.men, bare.men); assert.equal(march.kit.herbs, 3);
  const legacy = {men: 100, might: 10}; armyLosses(legacy, 0.5, () => 0.9); assert.ok(legacy.might < 10);
});
check('у проигравших больше износ оружия и брони; снаряжение павших не возвращается', () => {
  const back = result => { const t = town({stock: {}}), a = world([t]); returnArmy(a, {from: t.id, men: 50, men0: 100, result, kit: {arms: 10, armor: 10, herbs: 2}}); return t.stock; };
  const win = back('won'), lost = back('beaten');
  assert.ok(win.arms < 5 && lost.arms < win.arms && lost.armor < win.armor); assert.equal(win.herbs, 1); assert.equal(lost.herbs, 1);
});
check('местная стройка соблюдает доступ народов; общий загон доступен зеленокожим', () => {
  const w = game(); createAgent(w, 'elf', 'colony', 20, 20); w.buildings.push({key: 'quarry', done: true});
  assert.equal(eligible(w, 'charpit'), false);
  w.agents[0].dead = true; createAgent(w, 'orc', 'colony', 20, 20); createAgent(w, 'goat', 'wild', 21, 20); assert.equal(eligible(w, 'pen'), true);
});
check('местный загон забивает взрослый излишек до голода, сохраняет пару и не трогает боевых и призванных', () => {
  const w = game(); createAgent(w, 'human', 'colony', 20, 20); putUp(w, 'pen');
  const pen = w.buildings.find(b => b.key === 'pen');
  const goats = Array.from({length: 3}, () => { const a = createAgent(w, 'goat', 'wild', 20, 20); makeTame(w, a, null, true); a.age = 30; a.pen = pen.id; return a; });
  const war = createAgent(w, 'goat', 'allies', 20, 20); war.tame = true; war.warBeast = true;
  const summon = createAgent(w, 'goat', 'allies', 20, 20); summon.tame = true; summon.summoned = true;
  for (const g of Object.keys(w.stock)) w.stock[g] = 0; w.stock.hay = 100; w.tick = 6 * HOUR; w.scratch = {};
  const before = foodTotal(w); stepHerd(w);
  assert.equal(goats.filter(a => !a.dead).length, 2); assert.ok(foodTotal(w) > before);
  assert.ok(!war.dead && !summon.dead); assert.ok(herd(w).every(a => !a.warBeast && !a.summoned));
});

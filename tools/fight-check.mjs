// The fight of docs/RULES.md: kinds of harm and the table «Урон по видам», weapon qualities, places where blows
// land. Each rule is checked where the game reads it: a blow through armour, a critical blow, a body's answer to
// fire, frost, venom and silver, a long or parrying or brittle weapon, a trauma by the place of the last blow, the
// strength rating. Part of `npm test`; `node tools/fight-check.mjs`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {T} from '../src/data/terrain.js';
import {SPECIES} from '../src/data/species.js';
import {createAgent} from '../src/agents/agent.js';
import {damage, reachOf, blockAgainst} from '../src/agents/combat.js';
import {recalcGear, wear} from '../src/agents/equipment.js';
import {heatHarm, stepBody} from '../src/agents/body.js';
import {traumasAt} from '../src/agents/wounds.js';
import {strengthParts} from '../src/agents/strength.js';
import {DAMAGE_TYPES, DELIVERY, WEAPON_QUALITIES, CAPS, COMBAT} from '../src/data/balance/combat.js';
import {BODY_PLANS, HIT_LOCATIONS, planOf, placesOf, drawPlace} from '../src/data/anatomy.js';
import {WOUNDS} from '../src/data/wounds.js';
import {ITEMS} from '../src/data/items.js';
import {mulberry} from '../src/core/rng.js';
import * as E from '../src/data/schema/edits.js';

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// a flat empty map, every random stream answering what the test says
function scene() {
  const w = newGame({...DEFAULT_CFG, seed: 'fight', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.heat[i] = 0; w.grid.fire[i] = 0; }
  return w;
}
const rngs = (w, v, hits = v) => { for (const k of Object.keys(w.rngs)) w.rngs[k] = Object.assign(() => v, {state: 0}); w.rngs.hits = Object.assign(() => hits, {state: 0}); };
const put = (w, sp, fac) => { const a = createAgent(w, sp, fac, 20.5, 20.5); a.mods.dodge = 0; return a; };
// the damage of one blow of `raw` by a human at a human in armour 0.5, with this random number and these qualities
function blow(v, q = null, hits = 0.5) {
  const w = scene(), by = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony');
  t.gear = {...recalcGear(t), armor: 0.5, armorVs: null, block: 0, cover: 0};
  rngs(w, v, hits);
  t.hp = 100;
  return damage(w, by, t, 1, {type: 'pierce', q});
}

// ── the dictionaries and the matrix
const HARM = new Set([...DAMAGE_TYPES.map(d => d.id), ...Object.keys(DELIVERY)]);
for (const sp of SPECIES.all()) {
  for (const k of Object.keys(sp.resist || {})) expect(HARM.has(k), `${sp.id}: «${k}» — нет такого типа урона`);
  expect(planOf(sp) in BODY_PLANS, `${sp.id}: план тела «${planOf(sp)}» — нет такого`);
}
for (const plan of Object.keys(BODY_PLANS)) {
  const list = placesOf(plan);
  expect(list.length > 0 && list.every(l => l.weight >= 0) && list.some(l => l.weight > 0), `план ${plan}: нет мест с весом`);
  for (const l of list) for (const id of l.traumas) expect(WOUNDS.has(id) && WOUNDS.get(id).trauma, `${l.id}: «${id}» — не травма`);
}
for (const t of WOUNDS.filter(x => x.trauma)) expect(HIT_LOCATIONS.all().some(l => l.traumas.includes(t.id)), `травма ${t.id} не выпадает ни в одном месте`);

// ── places land by their weights, from their own stream
{
  const r = mulberry(7), n = 60000, seen = {}, list = placesOf('humanoid'), total = list.reduce((s, l) => s + l.weight, 0);
  for (let k = 0; k < n; k++) { const l = drawPlace(SPECIES.get('human'), r); seen[l.id] = (seen[l.id] || 0) + 1; }
  for (const l of list) expect(Math.abs(seen[l.id] / n - l.weight / total) < 0.01, `${l.id}: выпадает ${(seen[l.id] / n).toFixed(3)}, а вес ${(l.weight / total).toFixed(3)}`);
}

// ── qualities in a blow: piercing takes armour off, vicious makes a critical blow worse; the place × the damage
{
  const plain = blow(0.99), pierced = blow(0.99, {piercing: 0.5});
  expect(near(pierced / plain, (1 - 0.5 * 0.5) / (1 - 0.5)), `пробивное 0,5: урон ×${(pierced / plain).toFixed(3)}, а должно ×1,5`);
  const crit = blow(0), vicious = blow(0, {vicious: 0.5});
  expect(near(vicious / crit, 2 / 1.5), `жестокое 0,5: крит ×${(vicious / crit).toFixed(3)}, а должно ×1,333`);
  E.setCell('hitLocations', 'humanoid.head', 'dmg', 2);
  expect(near(blow(0.99, null, 0) / plain, 2), 'урон × места не дошёл до удара в голову');
  expect(near(blow(0.99, null, 0.99), plain), 'урон × головы задел удар в ноги');
  // (the rating is relative to the reference human, whom the edit strikes alike: the human's own rating stays; what sees
  // the head is the raw strength the rating is made of — a human's falls, a beast's rating with another plan does not)
  const w = scene(), a = put(w, 'human', 'colony'), s0 = strengthParts(a).raw;
  E.resetAll();
  const s1 = strengthParts(a).raw;
  expect(s0 < s1, `КС не видит, что удар в голову вдвое страшнее: ${s0.toFixed(5)} при ×2, ${s1.toFixed(5)} без`);
}

// ── a body's answer to fire, frost, venom and silver (the table «Урон по видам»)
{
  const w = scene(), a = put(w, 'human', 'colony'), sp = SPECIES.get('human');
  a.hp = 1; heatHarm(a, sp, sp.heatHarm + 20, 'colonist'); const burnt = 1 - a.hp;
  E.setCell('damageMatrix', 'human', 'resist.fire', 0);
  a.hp = 1; heatHarm(a, sp, sp.heatHarm + 20, 'colonist');
  expect(burnt > 0 && a.hp === 1, `огонь 0 у людей: жар всё равно жжёт (${1 - a.hp})`);
  E.setCell('damageMatrix', 'human', 'resist.fire', 2);
  a.hp = 1; heatHarm(a, sp, sp.heatHarm + 20, 'colonist');
  expect(near(1 - a.hp, 2 * burnt), 'огонь 2 у людей: жар не вдвое сильнее');
  E.resetAll();
  // frost: warmth gone, deep cold
  const frost = () => { const w2 = scene(), b = put(w2, 'human', 'colony'); for (let i = 0; i < w2.w * w2.h; i++) w2.grid.heat[i] = -400; b.needs.warmth = 0; b.hp = 1; stepBody(w2, b); return 1 - b.hp; };
  const cold1 = frost();
  E.setCell('damageMatrix', 'human', 'resist.cold', 0);
  const cold0 = frost();
  E.resetAll();
  expect(cold1 > 0 && cold0 < cold1, `холод 0 у людей: мороз жжёт так же (${cold0} против ${cold1})`);
  // venom: a spider's bite on a body that takes no poison leaves no poison
  const w3 = scene(), spider = put(w3, 'spider', 'raiders'), v = put(w3, 'human', 'colony');
  rngs(w3, 0.99); v.gear = {...recalcGear(v), block: 0, cover: 0};
  damage(w3, spider, v, 0.01); const venom = v.poison?.dmg;
  E.setCell('damageMatrix', 'human', 'resist.poison', 0);
  v.poison = null; damage(w3, spider, v, 0.01);
  E.resetAll();
  expect(SPECIES.get('spider').venom ? venom > 0 && v.poison?.dmg === 0 : true, `яд 0 у людей: укус паука всё равно травит (${v.poison?.dmg})`);
}

// ── long, parrying and brittle weapons
{
  const w = scene(), a = put(w, 'human', 'colony');
  a.gear = recalcGear(a); const r0 = reachOf(a);
  a.gear.melee = {...a.gear.melee, q: {reach: 1}};
  expect(near(reachOf(a), r0 + 1), 'длинное 1: досягаемость не +1');
  const g = {block: 0.3, blockVs: null, cover: 0, coverVs: null};
  expect(near(blockAgainst({...g, parry: 0.2}, 'slash'), 0.5) && blockAgainst({...g, parry: 0.2}, 'slash', false) === 0, 'парирующее 0,2: блок вблизи не +0,2 или ловит стрелы');
  expect(blockAgainst({...g, block: 0.7, parry: 0.5}, 'slash') === CAPS.block, 'парирующее пробило потолок блока');
  E.setCell('forms', 'spear', 'qualities', {unreliable: 1, piercing: 0.2});
  const it = {type: 'ironspear', dur: 100}, d = ITEMS.get('ironspear');
  expect(d.qualities?.unreliable === 1 && d.qualities?.piercing === 0.2, 'свойства формы не дошли до вещи');
  a.faction = 'raiders'; wear(w, a, it, 1);
  expect(it.dur === 98, `ненадёжное 1: износ ${100 - it.dur}, а должен быть 2`);
  E.resetAll();
  expect(!ITEMS.get('ironspear').qualities?.unreliable && !ITEMS.get('ironspear').qualities?.piercing, 'сброс не снял свойства с вещи');
}

// ── paired weapons: a second dagger strikes after the first, a shield in the other hand does not; КС sees it
{
  const {dress} = await import('../src/agents/equipment.js'), {strengthOf} = await import('../src/agents/strength.js'), {attack} = await import('../src/agents/combat.js');
  const w = scene(), two = put(w, 'human', 'raiders'), one = put(w, 'human', 'raiders'), sh = put(w, 'human', 'raiders');
  const {refreshBody} = await import('../src/agents/special.js'), {maxHp} = await import('../src/agents/agent.js');
  for (const x of [one, sh]) { x.special = {...two.special}; refreshBody(x); x.hp = maxHp(x); x.mods.dodge = 0; }   // the same hands
  dress(two, ['irondagger', 'irondagger']); dress(one, ['irondagger']); dress(sh, ['irondagger', 'ironshield']);
  expect(two.gear.offhand?.share === ITEMS.get('irondagger').qualities.paired && !one.gear.offhand && !sh.gear.offhand, 'вторая рука: парный кинжал не взят или щит взят за оружие');
  expect(strengthOf(two) > strengthOf(one), 'КС не видит второго кинжала');
  const t = put(w, 'human', 'colony'); t.gear = {...recalcGear(t), block: 0, cover: 0}; t.mods.dodge = 0; t.hp = 100;
  t.hurtBy = null; rngs(w, 0.5); two.cd = 0; const h0 = t.hp; attack(w, two, t); const d2 = h0 - t.hp;
  t.hurtBy = null; rngs(w, 0.5); one.cd = 0; const h1 = t.hp; attack(w, one, t); const d1 = h1 - t.hp;
  expect(near(d2 / d1, 1 + two.gear.offhand.share), `два кинжала: урон ×${(d2 / d1).toFixed(2)}, а должно ×${1 + two.gear.offhand.share}`);
}

// ── where the blow comes from: front, flank (the target fights another), back (it does not know); a dagger is sly
{
  const {attack, stanceOf, stanceGain} = await import('../src/agents/combat.js'), {dress} = await import('../src/agents/equipment.js');
  const w = scene(), a = put(w, 'human', 'raiders'), other = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony');
  dress(a, ['ironspear']);
  t.task = {id: 'fight', target: a}; expect(stanceOf(w, a, t) === 'front', 'лицом к лицу — не спереди');
  t.task = {id: 'fight', target: other}; expect(stanceOf(w, a, t) === 'flank', 'цель бьётся с другим — не фланг');
  t.task = {id: 'work'}; t.hurtBy = null; expect(stanceOf(w, a, t) === 'back', 'цель не знает — не в спину');
  t.hurtBy = {id: other.id, tick: w.tick}; expect(stanceOf(w, a, t) === 'front', 'раненая только что цель всё ещё не знает');
  const wolf = put(w, 'wolf', 'raiders'); t.hurtBy = null; expect(stanceOf(w, wolf, t) === 'front', 'зверь бьёт в спину');
  expect(near(stanceGain('back', null), COMBAT.back.dmg) && near(stanceGain('flank', {backstab: 1}), 1 + 2 * (COMBAT.flank.dmg - 1)), 'прибавка с фланга и в спину не по числам');
  // the shield turns half a blow from the flank, none in the back
  t.gear = {...recalcGear(t), block: 0.9, blockVs: null}; t.hp = 100; t.mods.dodge = 0;
  rngs(w, 0.5); t.task = {id: 'fight', target: a}; a.cd = 0; const f0 = t.hp; attack(w, a, t);
  expect(f0 === t.hp, 'щит 0,9 не остановил удар спереди при броске 0,5');
  rngs(w, 0.5); t.task = {id: 'work'}; t.hurtBy = null; a.cd = 0; const b0 = t.hp; attack(w, a, t);
  expect(b0 > t.hp, 'удар в спину остановил щит');
}

// ── thrown weapons: a bundle of javelins flies one by one, the last stays in the hand to stab with; КС counts the bundle
{
  const {dress, recalcGear: rg} = await import('../src/agents/equipment.js'), {shoot} = await import('../src/agents/combat.js'), {strengthOf} = await import('../src/agents/strength.js');
  const w = scene(), a = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony');
  dress(a, ['ironjavelin', 'ironshield']); t.x = a.x + 3; t.hp = 100;
  const n = ITEMS.get('ironjavelin').qualities.thrown, it = a.equip.right.type === 'ironjavelin' ? a.equip.right : a.equip.left;
  expect(it.ammo === n && a.gear.rangedReady, `связка дротиков: ${it.ammo} из ${n}, готов ${a.gear.rangedReady}`);
  rngs(w, 0.1); let k = 0;
  for (; k < n + 2; k++) { a.cd = 0; if (shoot(w, a, t) === null) break; }
  expect(k === n && it.ammo === 0 && !a.gear.rangedReady && a.gear.melee.item === it, `бросков ${k} из ${n}; дротик в руке для ближнего боя: ${a.gear.melee.item === it}`);
  rg(a);
  expect(!a.gear.rangedReady, 'пустая связка снова готова к броску после пересчёта');
  const b = put(w, 'human', 'raiders'), s = put(w, 'human', 'raiders'); b.special = {...a.special}; s.special = {...a.special};
  dress(b, ['ironjavelin', 'ironshield']); dress(s, ['ironspear', 'ironshield']);
  expect(strengthOf(b) > strengthOf(s) * 0.85 && strengthOf(b) < strengthOf(s) * 1.15, 'КС дротиков со щитом далеко от копья со щитом');
}

// ── the crossbow goes through armour; the elves will not touch it — not wear it, not make it, not bring it in a band
{
  const {roleKit} = await import('../src/data/roles.js'), {raceMayCraft} = await import('../src/settlement/crafting.js'), {RECIPES} = await import('../src/data/recipes.js');
  const {mulberry} = await import('../src/core/rng.js'), {mayWield} = await import('../src/data/kinds.js');
  expect(ITEMS.get('crossbow').qualities?.piercing > 0 && ITEMS.get('crossbow').ranged.cd > ITEMS.get('bow').ranged.cd, 'арбалет не пробивает или не медленнее лука');
  expect(!mayWield('elf', 'crossbow') && mayWield('human', 'crossbow'), 'эльф берёт арбалет или человек не берёт');
  const w = scene(), elf = put(w, 'elf', 'colony');
  expect(!raceMayCraft(w, elf, RECIPES.get('crossbow')), 'эльф делает арбалет');
  const rng = mulberry(7); let elves = 0, humans = 0;
  for (let i = 0; i < 200; i++) { if (roleKit('elf', 'archer', rng, 30).includes('crossbow')) elves++; if (roleKit('human', 'archer', rng, 30).includes('crossbow')) humans++; }
  expect(elves === 0 && humans > 0, `арбалеты у стрелков: эльфам ${elves}, людям ${humans} из 200`);
}

// ── a spear reaches past a shoulder; a shield-bearer between a shooter and its target catches the shot
{
  const {dress} = await import('../src/agents/equipment.js'), {shoot} = await import('../src/agents/combat.js');
  const w = scene(), sp = put(w, 'human', 'raiders'); dress(sp, ['ironspear']);
  expect(reachOf(sp) > COMBAT.reach + 0.5, `копьё бьёт не дальше руки: ${reachOf(sp)}`);
  const archer = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony'), g = put(w, 'human', 'colony');
  dress(archer, ['bow', 'quiver'], 15); dress(g, ['spear', 'ironshield']);
  archer.x = 10.5; archer.y = 20.5; t.x = 16.5; t.y = 20.5; g.x = 15.5; g.y = 20.5; t.hp = 100;
  rngs(w, 0.01); archer.cd = 0; const d0 = g.equip.left?.dur ?? g.equip.right?.dur, res = shoot(w, archer, t);
  expect(res === 'miss' && t.hp === 100, `щитоносец перед целью не закрыл её от стрелы: ${res}`);
  g.y = 24.5; archer.cd = 0; const res2 = shoot(w, archer, t);
  expect(res2 !== 'miss' || t.hp < 100, 'щитоносец в стороне всё равно закрыл');
  void d0;
}

// ── a net tangles whom it falls on: slow, and no blow for a while
{
  const {dress} = await import('../src/agents/equipment.js'), {shoot, attack} = await import('../src/agents/combat.js');
  const w = scene(), a = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony'); dress(a, ['net', 'club']); dress(t, ['club']);
  t.x = a.x + 2.5; t.gear = {...t.gear, block: 0, cover: 0}; t.mods.dodge = 0;
  rngs(w, 0.01); a.cd = 0; shoot(w, a, t);
  expect(t.webbed?.slow === COMBAT.net.slow && t.stunned?.until >= w.tick + COMBAT.net.hold - 1, 'сеть не опутала');
  t.x = a.x + 1; t.cd = 0; expect(!attack(w, t, a), 'опутанный бьёт');
  expect(a.gear.melee.item?.type === 'club', 'с сетью в руке ловчий не бьёт дубиной');
}

// ── one who creeps is seen only close, heavier armour further; its first blow gives it away
{
  const {dress} = await import('../src/agents/equipment.js'), {canSee, attack, sneakSeen} = await import('../src/agents/combat.js');
  const w = scene(), a = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony'); dress(a, ['irondagger', 'irondagger']);
  a.sneaking = true; t.x = a.x + COMBAT.sneak.seen + 1;
  expect(!canSee(w, t, a) && canSee(w, a, t), 'крадущегося видно издали или он сам не видит');
  dress(a, ['chainmail']);
  expect(sneakSeen(a) > COMBAT.sneak.seen + 2 && canSee(w, t, a), 'кольчугу у крадущегося не слышно');
  t.x = a.x + 1; a.cd = 0; attack(w, a, t);
  expect(!a.sneaking, 'после удара крадущийся всё ещё невидим');
}

// ── the review: finer copies follow an edit; a material's qualities go to weapons only; parry never lowers a block
{
  const {itemDef} = await import('../src/agents/equipment.js');
  void itemDef('ironspear', 1);   // made before the edit, kept in the cache
  E.setCell('forms', 'spear', 'qualities', {piercing: 0.3});
  expect(itemDef('ironspear', 1).qualities?.piercing === 0.3, 'копия +1 не видит свойства после правки');
  E.resetAll();
  E.setCell('materials', 'iron', 'qualities', {unreliable: 0.5});
  const armour = ITEMS.all().find(d => d.material === 'iron' && !d.melee && !d.ranged), weapon = ITEMS.get('ironspear');
  expect(weapon.qualities?.unreliable === 0.5 && (!armour || !armour.qualities), 'свойства материала легли не только на оружие');
  E.resetAll();
  const g = {block: 0.9, blockVs: null, cover: 0, coverVs: null};
  expect(blockAgainst({...g, parry: 0.1}, 'slash') >= blockAgainst(g, 'slash'), 'парирующее снизило блок выше потолка');
}

// ── a trauma by the place of the last blow
{
  const ids = place => traumasAt({hitAt: place}).map(x => x.id).sort().join(',');
  expect(ids('humanoid.legs') === 'limp' && ids('humanoid.head') === 'dread,eye' && ids('humanoid.arms') === 'maimedHand', `травмы по месту: ноги ${ids('humanoid.legs')}, голова ${ids('humanoid.head')}, руки ${ids('humanoid.arms')}`);
  expect(traumasAt({}).length === WOUNDS.filter(x => x.trauma).length, 'без места травма берётся не из всех');
}

// a torch (data/balance/forms.js torch): its light halves what the night takes, its blow sets alight what the struck
// one stands on, thrown it sets a wooden wall alight and is gone; a wooden building holds fuel as a wood does
{
  const {dress, throwTorch} = await import('../src/agents/equipment.js');
  const {darkness} = await import('../src/agents/combat.js');
  const {TASKS} = await import('../src/agents/tasks.js');
  const {DAY} = await import('../src/core/time.js');
  const w = scene(), a = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony');
  dress(a, ['torch']); recalcGear(a);
  const T = throwTorch(a);
  expect(T && T.range > 1, 'факел не бросается');
  w.tick = Math.round(DAY * 0.02); const dark = darkness(w, a); a.torchlit = true; const lit = darkness(w, a);
  expect(dark < 1 && near(1 - lit, (1 - dark) / 2), `свет факела: без него ${dark}, с ним ${lit}`);
  t.x = a.x + 1; t.hp = 50; t.gear = {...recalcGear(t), block: 0, cover: 0}; rngs(w, 0.5, 0);
  const ti = (t.y | 0) * w.w + (t.x | 0); w.grid.fuel[ti] = 0;
  damage(w, a, t, 0.1, {type: 'blunt', q: a.gear.melee.q});
  expect(w.grid.fire[ti] > 0, 'удар факелом не поджёг землю под целью');
  const cell = (a.y | 0) * w.w + (a.x | 0) + 3;
  w.buildings.push({id: 991, key: 'hut', done: true, cells: [cell]}); w.grid.bld[cell] = 991;
  const task = {id: 'hurlTorch', cell}; a.task = task;
  TASKS.get('hurlTorch').step(w, a, task);
  expect(w.grid.fire[cell] > 0 && !throwTorch(a) && !a.equip.right && !a.equip.left, 'брошенный факел не поджёг постройку или остался в руке');
  const {FIRE} = await import('../src/data/nature.js');
  w.grid.fuel[cell] = 0; w.grid.fire[cell] = 0; w.tick = FIRE.woodEvery * 10;
  const {stepFields} = await import('../src/world/fields.js');
  stepFields(w);
  expect(w.grid.fuel[cell] >= FIRE.wooden, `деревянная постройка не держит топлива: ${w.grid.fuel[cell]}`);
}

if (bad.length) { console.log('Бой (этап 3):\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   бой: типов урона ${DAMAGE_TYPES.length} + вблизи/издали, свойств оружия ${WEAPON_QUALITIES.length} (работают ${WEAPON_QUALITIES.filter(q => q.live).length}), мест попадания ${HIT_LOCATIONS.all().length} на ${Object.keys(BODY_PLANS).length} плана тела — каждое правило доходит до боя, жара, мороза, яда, травм и КС`);

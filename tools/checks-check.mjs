// Checks and chance of docs/RULES.md: the ladder of difficulty, the four degrees of success (never changing
// whether a check passes; their effects at 0 change nothing, a number turns each on), and the random tables in one
// format (raids by weight, finds by first, trophies each) drawing as the old code did. Part of `npm test`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {T} from '../src/data/terrain.js';
import {createAgent} from '../src/agents/agent.js';
import {damage, attack, shoot} from '../src/agents/combat.js';
import {recalcGear, newItem} from '../src/agents/equipment.js';
import {lethal} from '../src/agents/wounds.js';
import {pieceLasts} from '../src/settlement/crafting.js';
import {craftChance} from '../src/data/quality.js';
import {DIFFICULTY, DEGREES, DEGREE_EFFECTS, degreeOf, passed, checkChance} from '../src/data/checks.js';
import {chanceWeight, pickFirst} from '../src/data/chance.js';
import {RAID_BANDS} from '../src/data/raids.js';
import {FINDS} from '../src/data/campaign.js';
import {SPECIES} from '../src/data/species.js';
import {mulberry} from '../src/core/rng.js';
import * as E from '../src/data/schema/edits.js';
import {MORALE} from '../src/data/morale.js';
for (const s of MORALE.ladder) { s.fight = 1; s.guard = 1; }   // (the weapons' and the armour's arithmetic, apart from one's morale: agents/morale.js)

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
function scene() {
  const w = newGame({...DEFAULT_CFG, seed: 'checks', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.heat[i] = 15; w.grid.fire[i] = 0; }
  return w;
}
// every stream answers the numbers of `seq` in turn (the last one after that)
const rngs = (w, ...seq) => { let k = 0; const f = Object.assign(() => seq[Math.min(k++, seq.length - 1)], {state: 0}); for (const s of Object.keys(w.rngs)) w.rngs[s] = f; };
const put = (w, sp, fac, x = 20.5) => { const a = createAgent(w, sp, fac, x, 20.5); a.mods.dodge = 0; a.gear = {...recalcGear(a), block: 0, cover: 0}; return a; };

// ── the ladder and the degrees
expect(near(checkChance(5, 'medium'), 0.5), 'средне при норме 5 — не 50%');
{ const p = DIFFICULTY.all().map(d => checkChance(5, d.id)); expect(p.every((x, k) => !k || x < p[k - 1]), 'ступени не идут от лёгкой к трудной'); }
for (const p of [0, 0.05, 0.3, 0.5, 0.8, 1, 1.3]) {
  let crit = 0, succ = 0, fum = 0, fail = 0;
  for (let k = 0; k < 2000; k++) {
    const u = (k + 0.5) / 2000, d = degreeOf(u, p);
    expect(passed(d) === (u < p), `степень при u ${u}, p ${p}: успех не совпадает с u < p`);
    if (d === 'critSuccess') crit++; if (passed(d)) succ++; if (d === 'critFail') fum++; if (!passed(d)) fail++;
  }
  if (p > 0.2 && p < 1) expect(Math.abs(crit / succ - DEGREES.crit) < 0.01, `p ${p}: крит. успехов ${(crit / succ).toFixed(3)} от успехов`);
  if (p > 0 && p < 0.8) expect(Math.abs(fum / fail - DEGREES.fumble) < 0.01, `p ${p}: крит. провалов ${(fum / fail).toFixed(3)} от провалов`);
}
expect(DEGREE_EFFECTS.all().every(e => e.value === 0), 'последствия степеней не нулевые по умолчанию');
expect(!passed(degreeOf(0.5, 0.5)) && passed(degreeOf(0.4999, 0.5)) && !passed(degreeOf(0, 0)), 'граница: бросок, равный шансу, — успех');

// ── the degrees in the game: block, blow, shot, deadly wound, craft
{
  const w = scene(), by = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony');
  by.equip.right = newItem('ironspear'); by.gear = recalcGear(by);
  t.gear.block = 0.5; t.hp = 100;
  rngs(w, 0.99); const plain = damage(w, by, t, 1, {type: 'pierce'});   // 0.99 ≥ 1 − 0.5 × 0.1: a botched block
  E.setCell('degreeEffects', 'block.critFail', 'value', 1);
  rngs(w, 0.99); const botched = damage(w, by, t, 1, {type: 'pierce'});
  expect(near(botched / plain, 2), `сорванный блок со значением 1: урон ×${(botched / plain).toFixed(3)}`);
  E.setCell('degreeEffects', 'block.critSuccess', 'value', 3);
  const dur = by.equip.right.dur; rngs(w, 0.01);
  expect(damage(w, by, t, 1, {type: 'pierce'}) === 'blocked' && by.equip.right.dur === dur - 3, 'крит. блок не износил оружие нападающего');
  E.resetAll();
  // a blow: no extra roll while its effects are 0; a fumble adds to the pause when one is set
  const a = put(w, 'human', 'raiders'), foe = put(w, 'human', 'colony', 21);
  let n = 0; const count = () => { n++; return 0.99; };
  for (const s of Object.keys(w.rngs)) w.rngs[s] = Object.assign(count, {state: 0});
  a.cd = 0; attack(w, a, foe); const draws0 = n;
  E.setCell('degreeEffects', 'melee.critFail', 'value', 5);
  n = 0; a.cd = 0; attack(w, a, foe);
  const cd = Math.max(4, Math.round(a.gear.melee.cd * (a.mods.swing ?? 1)));
  expect(n === draws0 + 1 && a.cd === cd + 5, `удар вблизи: бросков ${draws0} → ${n}, пауза ${a.cd} (должна ${cd + 5})`);
  E.resetAll();
  // a shot: a critical hit with a number doubles the damage
  const archer = put(w, 'human', 'raiders'), mark = put(w, 'human', 'colony', 23);
  archer.equip.left = archer.equip.right = newItem('bow'); archer.equip.back = newItem('quiver'); archer.equip.back.ammo = 20;
  const shotDmg = () => { archer.gear = recalcGear(archer); archer.gear.rangedReady = true; archer.cd = 0; mark.hp = 100; mark.gear = {...recalcGear(mark), block: 0, cover: 0}; rngs(w, 0); shoot(w, archer, mark); return 100 - mark.hp; };
  const s0 = shotDmg();
  E.setCell('degreeEffects', 'shot.critSuccess', 'value', 1);
  const s1 = shotDmg();
  E.resetAll();
  expect(s0 > 0 && near(s1 / s0, 2), `меткий выстрел со значением 1: урон ×${(s1 / s0).toFixed(3)}`);
  // a deadly wound: a critical success with 1 leaves it clean and draws no second check
  const fall = v => {
    const w2 = scene(), c = put(w2, 'human', 'colony'), r = put(w2, 'human', 'raiders', 21);
    c.special.L = 10; c.hp = -0.01;
    E.setCell('degreeEffects', 'survive.critSuccess', 'value', v);
    rngs(w2, 0, 0.99, 0.5); lethal(w2, c, 'ран', r); E.resetAll();
    return c.downed?.trauma ?? null;
  };
  expect(fall(0) !== null && fall(1) === null, `чистая рана: без значения травма ${fall(0)}, со значением ${fall(1)}`);
  // craft: the quality roll's degree, × the piece's life
  const p = craftChance(1, 0.5);
  E.setCell('degreeEffects', 'craft.critFail', 'value', 0.4); E.setCell('degreeEffects', 'craft.critSuccess', 'value', 0.5);
  expect(near(pieceLasts(0.9999, 0.5), 0.6) && near(pieceLasts(p * DEGREES.crit / 2, 0.5), 1.5) && pieceLasts((1 + p) / 2, 0.5) === 1, 'ремесло: прочность по степени не та');
  E.resetAll();
  expect(pieceLasts(0.9999, 0.5) === 1, 'ремесло: без значения прочность меняется');
}

// ── random tables: the format, the engine, the edits
{
  expect(chanceWeight({weight: 2, threat: 4, below: 0.5}, {threat: 3}) === 0.5 && chanceWeight({weight: 2, threat: 4, below: 0.5}, {threat: 4}) === 2, 'вес ниже и выше угрозы');
  expect(chanceWeight({weight: 1.2, threat: 6, night: 0.5}, {threat: 9, night: 0.4}) === 0 && chanceWeight({weight: 0.8, perNight: 2, threat: 3}, {threat: 3, night: 0.5}) === 1.8, 'ночь: только глубже и прибавка за ночь');
  // the finds draw as `find` did: one number per row tried
  const r1 = mulberry(3), r2 = mulberry(3), p = f => f.chance * 20;
  for (let k = 0; k < 500; k++) expect(pickFirst(r1, FINDS, p) === (FINDS.find(f => r2() < p(f)) ?? null), 'находки: движок тянет не так, как find');
  const orcs = RAID_BANDS.get('orcs'), w0 = orcs.weight(null, 5, 0);
  E.setCell('randomTables', 'raids:orcs', 'weight', 7);
  expect(orcs.weight(null, 5, 0) === 7, 'правка веса набега не дошла');
  E.setCell('randomTables', `finds:${FINDS[0].id}`, 'chance', 0.5);
  expect(FINDS[0].chance === 0.5, 'правка шанса находки не дошла');
  const sp = SPECIES.filter(s => s.trophies?.length)[0];
  E.setCell('randomTables', `trophies:${sp.id}:0`, 'chance', 0.9);
  expect(sp.trophies[0].chance === 0.9, 'правка шанса трофея не дошла');
  expect(!!E.setCell('randomTables', `finds:${FINDS[0].id}`, 'weight', 3).error, 'у находки правится вес, которого у неё нет');
  E.resetAll();
  expect(orcs.weight(null, 5, 0) === w0, 'сброс не вернул вес набега');
}

if (bad.length) { console.log('Проверки и случайности (этап 5):\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   проверки: лестница ${DIFFICULTY.all().length} ступеней, четыре степени не меняют исход, последствия ${DEGREE_EFFECTS.all().length} (по умолчанию 0) доходят до блока, удара, выстрела, раны, ремесла; таблицы случайностей тянут как раньше и правятся`);

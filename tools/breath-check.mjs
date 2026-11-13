// The acts of a fight (plan claude/bestiary-plan.md З-2; agents/abilities.js, the perks of `how: 'act'`): a dragon's breath of
// the fifth rank — a cone of eleven cells — and a forge-master's of the first — of three, and only with the coal in hand; the
// shape (its angle, a rock shuts it off); the wind-up fixes the direction: one who steps out takes nothing, and those who see
// it step out by themselves; the release strikes once; one on fire keeps burning, water puts it out; fireproof takes no
// fire; it aims past its own; a stun breaks the wind-up; a tail knocks one behind; a roar shakes once in its calm; the old
// «a blow sets the ground alight» is gone.
//   node tools/breath-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, companyStrength} from '../src/campaign/camp.js';
import {step} from '../src/sim.js';
import {createAgent} from '../src/agents/agent.js';
import {damage} from '../src/agents/combat.js';
import {actsOf, inShape, stepAct, stepBurning} from '../src/agents/abilities.js';
import {recalcGear} from '../src/agents/equipment.js';
import {newItem} from '../src/agents/itemDefs.js';
import {perkProfile} from '../src/data/perks.js';
import {ABILITY} from '../src/data/abilities.js';
import {CAMP} from '../src/data/camp.js';
import {T} from '../src/data/terrain.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base)), cap = capitals(base)[0];
const camp = () => {
  const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, cap.town, {mode: 'local'});
  return openCamp(campSetup(a, K, {kind: 'night', foe: {kind: 'bandits', strength: companyStrength(a, K) / CAMP.foe.unit}, dayIn: K.dayIn}));
};
// an open field: everyone else off the map, the ground grass, nothing burning
const field = () => {
  const w = camp();
  for (const o of w.agents) { o.x = -100; o.y = -100; o.dead = true; }
  w.agents = []; w.fx = [];
  for (let i = 0; i < w.w * w.h; i++) { if (w.grid.terr[i] === T.ROCK || w.grid.terr[i] === T.WATER) w.grid.terr[i] = T.GRASS; w.grid.fire[i] = 0; }
  w.campaign.S.kind = 'stop';
  return w;
};
const put = (w, sp, fac, x, y) => { const a = createAgent(w, sp, fac, x, y); a.think = 1e9; return a; };
const until = (w, a, n = 60) => { for (let k = 0; k < n && a.act; k++) { w.tick++; stepAct(w, a); } };

// ── who holds what: the dragon the fifth rank (eleven cells), the drake the third, the forge-master the first — with the coal
{
  const w = field(), dr = put(w, 'dragon', 'raiders', 20, 20), dk = put(w, 'drake', 'raiders', 40, 40);
  const fm = put(w, 'dwarf', 'colony', 30, 30); fm.fightRole = 'forgemaster';
  const br = a => actsOf(a).find(x => x.id === 'fireBreath');
  ok(br(dr)?.rank === 5 && br(dr).row.length === 11 && br(dk)?.rank === 3 && br(dk).row.length === 7, 'дракон — Огнедышащий V (11 клеток), дрейк — III (7)', `${br(dr)?.row.length} / ${br(dk)?.row.length}`);
  ok(!br(fm), 'мастер горна без угля в клещах не дышит');
  fm.equip.right = newItem('spitfire'); recalcGear(fm);
  ok(br(fm)?.rank === 1 && br(fm).row.length === 3 && br(fm).row.shape === 'cone', 'мастер горна с углём — Огнедышащий I: конус в три клетки', JSON.stringify(br(fm)?.row));
  const r1 = perkProfile('fireBreath', 1), r5 = perkProfile('fireBreath', 5);
  ok(r5.dmg > r1.dmg && r5.prep > r1.prep && r5.wait > r1.wait && !r1.kindle && r5.kindle, 'ранги — свои строки: урон, подготовка, пауза, поджог', `I ${r1.dmg}/${r1.prep}/${r1.wait}, V ${r5.dmg}/${r5.prep}/${r5.wait}`);
}

// ── the shape: 60°, from the body's edge; a rock shuts it off
{
  const w = field(), row = perkProfile('fireBreath', 5);
  const inC = (x, y) => inShape(w, row, 20, 20, 0, x, y);
  ok(inC(31, 20) && !inC(33, 20) && inC(28, 23) && !inC(25, 25), 'конус: 60°, одиннадцать клеток от края тела', `край ${row.length + ABILITY.edge}`);
  w.grid.terr[20 * w.w + 24] = T.ROCK;
  ok(!inC(28, 20.5) && inC(28, 22.5), 'скала закрывает того, кто за ней; сбоку от неё — горит');
}

// ── the wind-up fixes the direction: one who steps out takes nothing, one who stays takes it once
{
  const w = field(), dr = put(w, 'dragon', 'raiders', 20, 20);
  const stay = put(w, 'zombie', 'colony', 26, 20), go = put(w, 'zombie', 'colony', 27, 20.5);
  const h0 = stay.hp, g0 = go.hp;
  w.tick = 1000 - ((1000 + dr.id) % ABILITY.look);
  ok(stepAct(w, dr) && dr.act?.id === 'fireBreath', 'дракон видит двоих в конусе — начинает выдох', JSON.stringify(dr.act));
  go.x = 20; go.y = 30;   // (stepped out, past the rim)
  until(w, dr);
  ok(stay.hp < h0 && go.hp === g0, 'вышедший из конуса до выдоха цел, оставшийся обожжён', `${(h0 - stay.hp).toFixed(2)} / ${(g0 - go.hp).toFixed(2)}`);
  const once = stay.hp; for (let k = 0; k < 10; k++) { w.tick++; stepAct(w, dr); }
  ok(w.chronicle.acts.fireBreath === 1 && stay.hp === once && dr.actReady.fireBreath > w.tick, 'выдох — один раз, потом пауза', `готов снова через ${dr.actReady.fireBreath - w.tick}`);
  ok(!stay.burning || stay.burning.until > w.tick, 'не увернувшийся горит');
}

// ── those who see it coming step out by themselves (the people, not the mindless dead)
{
  const w = field(), dr = put(w, 'dragon', 'raiders', 20, 20), man = put(w, 'human', 'colony', 25, 20.4), z = put(w, 'zombie', 'colony', 25, 19.6);
  w.tick = 2000 - ((2000 + dr.id) % ABILITY.look); stepAct(w, dr);
  ok(!!man.dodge && !z.dodge, 'человек видит подготовку и уходит из конуса; мертвец — нет', JSON.stringify(man.dodge));
  for (let k = 0; k < 40 && dr.act; k++) { w.tick++; stepAct(w, man); stepAct(w, dr); }
  ok(!inShape(w, perkProfile('fireBreath', 5), 20, 20, 0, man.x, man.y), 'к выдоху человек вне конуса', `${man.x.toFixed(1)}, ${man.y.toFixed(1)}`);
}

// ── burning: it keeps hurting; the stronger kept; water puts it out; fireproof takes no fire
{
  const w = field(), m = put(w, 'human', 'colony', 10, 10), h0 = m.hp;
  m.burning = {dmg: 0.002, until: w.tick + 50};
  for (let k = 0; k < 10; k++) { w.tick++; stepBurning(w, m, false); }
  ok(m.hp < h0, 'горящий теряет здоровье', (h0 - m.hp).toFixed(3));
  stepBurning(w, m, true);
  ok(!m.burning, 'в воде пламя гаснет');
  const w2 = field(), dr = put(w2, 'dragon', 'raiders', 20, 20), fm = put(w2, 'dwarf', 'colony', 25, 20); fm.fightRole = 'forgemaster'; fm.think = 1e9;
  const f0 = fm.hp; w2.tick = 3000 - ((3000 + dr.id) % ABILITY.look); stepAct(w2, dr); fm.dodge = null; until(w2, dr);
  ok(fm.hp === f0 && !fm.burning, 'мастер горна в драконьем огне цел: огнестойкость роли', `${f0} → ${fm.hp}`);
}

// ── it aims past its own; a stun breaks the wind-up; a tail knocks one behind; a roar shakes once
{
  const w = field(), dr = put(w, 'dragon', 'raiders', 20, 20), foe = put(w, 'zombie', 'colony', 26, 20); put(w, 'human', 'raiders', 24, 20);
  w.tick = 4000 - ((4000 + dr.id) % ABILITY.look);
  const began = stepAct(w, dr);
  ok(!began || dr.act?.id !== 'fireBreath' || Math.abs(dr.act.dir) > 0.3, 'свой в конусе — туда не дышит', JSON.stringify(dr.act));
  const w2 = field(), d2 = put(w2, 'dragon', 'raiders', 20, 20), z = put(w2, 'zombie', 'colony', 25, 20), z0 = z.hp;
  w2.tick = 5000 - ((5000 + d2.id) % ABILITY.look); stepAct(w2, d2);
  if (d2.act?.id !== 'fireBreath') stepAct(w2, d2);
  d2.stunned = {until: w2.tick + 50}; w2.tick++; stepAct(w2, d2);
  ok(!d2.act && z.hp === z0 && d2.actReady.fireBreath === w2.tick + ABILITY.interrupt, 'оглушённый дракон не выдыхает: подготовка сорвана');
  const w3 = field(), d3 = put(w3, 'dragon', 'raiders', 20, 20), front = put(w3, 'zombie', 'colony', 26, 20), back = put(w3, 'zombie', 'colony', 18.5, 20);
  d3.task = {id: 'maul', target: front}; d3.actReady = {fireBreath: 1e9, roar: 1e9};
  w3.tick = 6000 - ((6000 + d3.id) % ABILITY.look); stepAct(w3, d3);
  ok(d3.act?.id === 'tailSweep', 'зашёл за спину — дракон бьёт хвостом', JSON.stringify(d3.act));
  const b0 = back.hp; until(w3, d3);
  ok(back.hp < b0 && back.stunned?.until > w3.tick && front.hp === front.hp, 'хвост сбивает того, кто сзади', `−${(b0 - back.hp).toFixed(2)}, оглушён до ${back.stunned?.until}`);
  const w4 = field(), d4 = put(w4, 'dragon', 'raiders', 20, 20), m4 = put(w4, 'human', 'colony', 26, 20);
  d4.actReady = {fireBreath: 1e9, tailSweep: 1e9}; m4.think = 1e9;
  w4.tick = 7000 - ((7000 + d4.id) % ABILITY.look); stepAct(w4, d4);
  ok(d4.act?.id === 'roar', 'при встрече дракон ревёт', JSON.stringify(d4.act));
  until(w4, d4); const v1 = m4.morale?.v;
  ok(v1 < 60, 'рёв: мораль врага падает', `${v1?.toFixed(1)}`);
  d4.actReady.roar = 0; w4.tick += ABILITY.look - ((w4.tick + d4.id) % ABILITY.look);
  ok(!stepAct(w4, d4) || d4.act?.id !== 'roar', 'второй раз сразу не ревёт: враг ещё помнит, рана не тяжелее');
}

// ── the old «a blow sets the ground alight» is gone: a dragon's bite burns nothing under the bitten
{
  const w = field(), dr = put(w, 'dragon', 'raiders', 20, 20), m = put(w, 'human', 'colony', 21, 20);
  let fire = 0; for (let k = 0; k < 30; k++) { m.hp = 99; m.downed = null; damage(w, dr, m, 1); }
  for (let i = 0; i < w.w * w.h; i++) fire += w.grid.fire[i] > 0;
  ok(fire === 0, 'укус дракона больше не поджигает землю: огонь — отдельный выдох');
}

// ── a fight played by the brains: the forge-master in front, two of his behind, raiders coming on — he breathes at them,
// not into his own (his own in the way: he steps aside to a clear cone)
{
  let used = 0, ownBurnt = 0, foeBurnt = 0;
  for (let i = 0; i < 3; i++) {
    const w = field(); w.campaign.S.kind = 'night'; w.campaign.alarm = w.tick;
    const fm = put(w, 'dwarf', 'colony', 30, 30 + i); fm.fightRole = fm.fightPref = 'forgemaster'; fm.equip.right = newItem('spitfire'); fm.equip.left = null; recalcGear(fm);
    const own = [put(w, 'dwarf', 'colony', 28.5, 29), put(w, 'dwarf', 'colony', 28.5, 31)];
    const foes = [put(w, 'human', 'raiders', 36, 29.5), put(w, 'human', 'raiders', 36.5, 30.5), put(w, 'human', 'raiders', 37, 31.5)];
    for (const o of [fm, ...own, ...foes]) o.think = 0;
    w.campaign.foeObjs = foes; w.campaign.spawned = true;
    const hp = new Map([fm, ...own, ...foes].map(o => [o, o.hp]));
    for (let g = 0; g < 200 && !(w.chronicle.acts?.fireBreath); g++) step(w);
    for (let g = 0; g < 20; g++) step(w);
    used += w.chronicle.acts?.fireBreath || 0;
    ownBurnt += own.filter(o => o.burning || o.hurtBy?.id === fm.id).length;
    foeBurnt += foes.filter(o => o.hurtBy?.id === fm.id || o.burning).length;
  }
  ok(used > 0 && foeBurnt > 0 && ownBurnt === 0, 'бой мозгами: мастер горна дышит по налётчикам, своих не жжёт', `выдохов ${used}, задето врагов ${foeBurnt}, своих ${ownBurnt}`);
}

if (fails) { console.log(`\nbreath-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nbreath-check: ok');

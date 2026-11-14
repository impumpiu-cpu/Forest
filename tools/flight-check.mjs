// Flight and the single-target acts (plan claude/bestiary-plan.md З-3; agents/abilities.js stepFlight, the perks «Полёт»,
// «Шипы», «Ядовитое жало», «Выстрел паутиной», «Ядовитый плевок»): in the air one flies straight over water, not through
// rock, at its wings' pace; high up a short blade does not reach it — a spear and an arrow do; it comes down to strike and
// stays down a while, then rises; its wings fail when it is badly hurt. The manticore's spikes from the air, as many as it
// has; the wyvern's sting poisons and its bite does not; the spider throws its web; a spit is caught by a raised shield.
//   node tools/flight-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, companyStrength} from '../src/campaign/camp.js';
import {createAgent} from '../src/agents/agent.js';
import {damage, attack, shoot} from '../src/agents/combat.js';
import {moveToward, approach} from '../src/agents/movement.js';
import {stepAct, stepFlight, flightOf} from '../src/agents/abilities.js';
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
const field = () => {
  const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, cap.town, {mode: 'local'});
  const w = openCamp(campSetup(a, K, {kind: 'night', foe: {kind: 'bandits', strength: companyStrength(a, K) / CAMP.foe.unit}, dayIn: K.dayIn}));
  w.agents = []; w.fx = []; w.campaign.S.kind = 'stop';
  for (let i = 0; i < w.w * w.h; i++) { if (w.grid.terr[i] !== T.GRASS) w.grid.terr[i] = T.GRASS; w.grid.fire[i] = 0; }
  w.nav.dirty('trees');
  return w;
};
const put = (w, sp, fac, x, y) => { const a = createAgent(w, sp, fac, x, y); a.think = 1e9; return a; };
const armed = (a, form) => { a.equip.right = newItem(form); a.equip.left = null; recalcGear(a); a.cd = 0; return a; };
const tick = (w, a, n = 1) => { for (let k = 0; k < n; k++) { w.tick++; stepAct(w, a); } };

// ── in the air: straight over water at its wings' pace; never through rock
{
  const w = field();
  for (let y = 0; y < w.h; y++) for (let x = 25; x < 29; x++) w.grid.terr[y * w.w + x] = T.WATER;
  const wy = put(w, 'wyvern', 'raiders', 20, 20);
  stepFlight(w, wy);
  ok(wy.aloft && flightOf(wy)?.air === perkProfile('flight', 2).air, 'виверна без врага рядом — в воздухе, шаг крыльев', `${flightOf(wy)?.air}`);
  for (let k = 0; k < 120 && wy.x < 32; k++) moveToward(w, wy, 34, 20);
  ok(wy.x >= 32, 'над водой летит прямо', `x ${wy.x.toFixed(1)}`);
  const w2 = field(); w2.grid.terr[20 * w2.w + 24] = T.ROCK;
  const g = put(w2, 'griffin', 'raiders', 22.5, 20.5); stepFlight(w2, g);
  let blocked = false; for (let k = 0; k < 40; k++) if (moveToward(w2, g, 26.5, 20.5) === null) blocked = true;
  ok(g.aloft && (blocked || Math.floor(g.x) !== 24 || Math.floor(g.y) !== 20), 'сквозь скалу не летит');
  const m = put(w2, 'human', 'colony', 40, 40); stepFlight(w2, m);
  ok(!m.aloft && flightOf(m) === null, 'человек не летает');
}

// ── high up: a sword does not reach it, a spear and a bow do; it comes down to strike, stays, rises again
{
  const w = field(), g = put(w, 'griffin', 'raiders', 20, 20), sw = armed(put(w, 'human', 'colony', 21, 20), 'sword'), sp = armed(put(w, 'human', 'colony', 21.2, 20.6), 'spear');
  stepFlight(w, g);
  ok(g.aloft && attack(w, sw, g) === false && attack(w, sp, g) === true, 'грифон в высоте: меч не достаёт, копьё достаёт', `меч ${sw.cd}, копьё ${sp.cd}`);
  const bw = armed(put(w, 'human', 'colony', 22.5, 20), 'bow'); bw.equip.back = newItem('quiver', {ammo: 20}); recalcGear(bw); bw.cd = 0;
  ok(shoot(w, bw, g) !== null, 'стрела достаёт и летящего');
  g.task = {id: 'maul', target: sw}; g.fly.rise = 0; stepFlight(w, g);
  ok(!g.aloft, 'рядом с добычей — садится для удара');
  const F = perkProfile('flight', 2); w.tick += F.ground; stepFlight(w, g);
  ok(g.aloft && g.fly.rise === w.tick + F.rise, 'посидел своё — взлетает и держится в воздухе', `${F.ground} внизу, ${F.rise} вверху`);
  g.hp = g.maxHp * (F.grounded - 0.05); stepFlight(w, g);
  ok(!g.aloft, 'тяжело раненый — крылья не держат');
}

// ── the manticore's spikes from the air, as many as it has
{
  const w = field(), mc = put(w, 'manticore', 'raiders', 20, 20), z = put(w, 'zombie', 'colony', 26, 20);
  mc.task = {id: 'maul', target: z}; stepFlight(w, mc);
  const S = perkProfile('spikes', 2), h0 = z.hp;
  let shots = 0;
  for (let k = 0; k < 1200 && z.hp > -50; k++) { mc.aloft = true; mc.fly.rise = 1e9; z.hp = Math.max(z.hp, 0.5); z.downed = null; w.tick++; const was = w.chronicle.acts?.spikes || 0; stepAct(w, mc); if ((w.chronicle.acts?.spikes || 0) > was) shots++; }
  ok(shots === S.ammo && mc.ammo.spikes === 0, 'мантикора мечет шипы сверху — сколько их есть', `${shots} из ${S.ammo}`);
}

// ── the wyvern's sting poisons, its bite does not; the spider throws its web and its bite poisons; a raised shield catches a spit
{
  const w = field(), wy = put(w, 'wyvern', 'raiders', 20, 20), v = put(w, 'human', 'colony', 21.5, 20);
  v.gear = {...v.gear, block: 0, cover: 0}; v.mods.dodge = 0;
  damage(w, wy, v, 0.01);
  ok(!v.poison, 'укус виверны не травит');
  wy.flightRow = null; wy.task = {id: 'maul', target: v};
  for (let k = 0; k < 40 && !v.poison; k++) tick(w, wy);
  ok(!!v.poison && v.poison.dmg > 0, 'жало виверны травит', JSON.stringify(v.poison));
  const sp = put(w, 'spider', 'raiders', 40, 40), u = put(w, 'human', 'colony', 44, 40);
  sp.task = {id: 'maul', target: u};
  for (let k = 0; k < 40 && !u.webbed; k++) tick(w, sp);
  ok(!!u.webbed && u.webbed.slow === perkProfile('webShot', 2).web.slow, 'паук бросает паутину за четыре клетки', JSON.stringify(u.webbed));
  u.gear = {...u.gear, block: 0, cover: 0}; u.mods.dodge = 0; damage(w, sp, u, 0.01);
  ok(!!u.poison, 'укус паука травит');
  let caught = 0, got = 0;
  for (let i = 0; i < 40; i++) {
    const w2 = field(), c = put(w2, 'human', 'raiders', 20, 20), t = put(w2, 'human', 'colony', 23, 20);
    c.perks = [{id: 'venomSpit', rank: 2}]; c.task = {id: 'fight', target: t};
    if (i % 2) { armed(t, 'shield'); t.gear.cover = 0.9; } else t.gear = {...t.gear, cover: 0};
    for (let k = 0; k < 40 && !(w2.chronicle.acts?.venomSpit); k++) tick(w2, c);
    if (i % 2) caught += !t.poison; else got += !!t.poison;
  }
  ok(caught >= 12 && got >= 12, 'плевок: поднятый щит ловит его чаще, без щита — травит', `со щитом пойман ${caught} из 20, без щита отравлен ${got} из 20`);
}

if (fails) { console.log(`\nflight-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nflight-check: ok');

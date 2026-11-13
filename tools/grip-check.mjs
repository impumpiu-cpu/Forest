// Holding, a run at it, and under the ground (plan claude/bestiary-plan.md З-4; agents/abilities.js, the perks «Захват»,
// «Сдавливание», «Проглатывание», «Таран и пикирование», «Рытьё»): a toad's tongue takes hold of one — it does not move and
// strikes only at the toad; its own close by help it pull free; the holder's death frees it; a small one is swallowed —
// unseen, digested — and its death lets it out; a squeeze through the armour; a varg's blow after a run is harder and knocks
// one down; a burrower lies unseen under soft ground, feels one coming, comes under it, the ground heaves (plain to see), it
// bursts out and strikes; a road stops it; after a while above it goes under again.
//   node tools/grip-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, companyStrength} from '../src/campaign/camp.js';
import {createAgent, kill} from '../src/agents/agent.js';
import {attack, canSee} from '../src/agents/combat.js';
import {speedOf} from '../src/agents/movement.js';
import {stepAct} from '../src/agents/abilities.js';
import {perkProfile} from '../src/data/perks.js';
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
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.fire[i] = 0; }
  w.nav.dirty('trees');
  return w;
};
const put = (w, sp, fac, x, y) => { const a = createAgent(w, sp, fac, x, y); a.think = 1e9; a.mods.dodge = 0; return a; };
const run = (w, as, n) => { for (let k = 0; k < n; k++) { w.tick++; for (const a of as) if (!a.dead) stepAct(w, a); } };
const grabbed = (w, toad, v, n = 60) => { toad.task = {id: 'maul', target: v}; for (let k = 0; k < n && !v.held; k++) { w.tick++; stepAct(w, toad); } return !!v.held; };

// ── the toad's tongue: held, it does not move, strikes only at the toad; the toad's death frees it
{
  const w = field(), toad = put(w, 'toad', 'raiders', 20, 20), v = put(w, 'human', 'colony', 21.2, 20), other = put(w, 'human', 'raiders', 21.5, 21);
  v.gear = {...v.gear, block: 0, cover: 0};
  ok(grabbed(w, toad, v) && toad.holding === v.id, 'жаба хватает языком', JSON.stringify(v.held));
  ok(speedOf(w, v) === 0, 'схваченный не двигается');
  v.cd = 0; const atOther = attack(w, v, other); v.cd = 0; const atToad = attack(w, v, toad);
  ok(atOther === false && atToad === true, 'схваченный бьёт только того, кто держит');
  kill(w, toad, 'проба', v); run(w, [v], 2);
  ok(!v.held, 'жаба мертва — схваченный свободен');
}

// ── its own close by help it pull free
{
  const tries = help => {
    let free = 0;
    for (let i = 0; i < 40; i++) {
      const w = field(), toad = put(w, 'toad', 'raiders', 20, 20), v = put(w, 'human', 'colony', 21.2, 20);
      v.special.S = 4; v.special.A = 4; toad.actReady = {swallow: 1e9}; toad.swallowRow = null;   // (no swallowing here)
      if (!grabbed(w, toad, v)) continue;
      for (let k = 0; k < help; k++) put(w, 'human', 'colony', 21.2 + 0.4 * k, 20.8);
      for (let r = 0; r < i * 7; r++) w.rngs.combat();   // (each try its own draw: the worlds start alike)
      run(w, [v, toad], perkProfile('grab', 1).grab.every + 1);
      if (!v.held) free++;
    }
    return free;
  };
  const alone = tries(0), helped = tries(2);
  ok(helped > alone, 'свои рядом помогают вырваться', `за одну попытку: один ${alone} из 40, при двух своих ${helped} из 40`);
}

// ── a small one swallowed: unseen, digested; the toad's death lets it out
{
  const w = field(), toad = put(w, 'toad', 'raiders', 20, 20), g = put(w, 'goblin', 'colony', 21.2, 20), m = put(w, 'human', 'colony', 25, 25);
  g.special.S = 1; g.special.A = 1;
  ok(grabbed(w, toad, g), 'жаба хватает гоблина');
  const S = perkProfile('swallow', 1); let h0 = null;
  for (let k = 0; k < S.after + 5 && !g.swallowed; k++) { w.tick++; stepAct(w, toad); }
  h0 = g.hp; g.held.next = 1e9; run(w, [toad, g], 20);
  ok(g.swallowed && !canSee(w, m, g) && g.hp < h0, 'проглочен: его не видно, его переваривает', `−${(h0 - g.hp).toFixed(3)} за 20 тиков`);
  kill(w, toad, 'проба', m); run(w, [g], 2);
  ok(!g.swallowed && !g.held && Math.hypot(g.x - toad.x, g.y - toad.y) < 0.01, 'жаба мертва — проглоченный снаружи');
}

// ── a squeeze through the armour (a holder with «Сдавливание»)
{
  const w = field(), c = put(w, 'crocodile', 'raiders', 20, 20), v = put(w, 'human', 'colony', 21.4, 20);
  c.perks = [{id: 'constrict', rank: 2}]; c.constrictRow = undefined;
  v.special.S = 1; v.special.A = 1; v.gear = {...v.gear, block: 0, cover: 0, armor: 0.6};
  ok(grabbed(w, c, v), 'крокодил хватает');
  v.held.next = 1e9; const h0 = v.hp; run(w, [c, v], 61);
  const C = perkProfile('constrict', 2);
  ok(Math.abs(h0 - v.hp - 2 * C.dmg) < 1e-9, 'сдавливает мимо брони: каждые 30 тиков своё', `−${(h0 - v.hp).toFixed(3)} (броня 0,6)`);
}

// ── a run at it: harder, and knocks one down; no run, no knock
{
  const blow = runFirst => {
    const w = field(), vg = put(w, 'varg', 'raiders', runFirst ? 14 : 20, 20), t = put(w, 'human', 'colony', 21, 20);
    t.gear = {...t.gear, block: 0, cover: 0}; t.hp = 99; vg.task = {id: 'maul', target: t};
    if (runFirst) for (let k = 0; k < 60 && vg.x < 20; k++) { vg.x += 0.15; w.tick++; stepAct(w, vg); }
    else { w.tick++; stepAct(w, vg); }
    vg.cd = 0; attack(w, vg, t);
    return {knock: !!(t.stunned && t.stunned.until > w.tick)};
  };
  const a = blow(true), b = blow(false);
  ok(a.knock && !b.knock, 'варг с разбега сбивает с ног; без разбега — нет', JSON.stringify({сразбега: a, сместа: b}));
}

// ── under the ground: unseen, it comes under one walking near; the ground heaves; it bursts out; a road stops it
{
  const w = field(), bu = put(w, 'bear', 'raiders', 20, 20), m = put(w, 'human', 'colony', 27, 20);
  bu.perks = [{id: 'burrow', rank: 1}]; bu.burrowRow = undefined; m.special.A = 1;
  run(w, [bu], 1);
  ok(bu.under && !canSee(w, m, bu), 'роющий под мягкой землёй — его не видно');
  let heaved = false, out = false; const h0 = m.hp;
  for (let k = 0; k < 200 && !out; k++) { w.tick++; stepAct(w, bu); if (bu.act?.id === 'burrow') heaved = heaved || w.fx.some(f => f.kind === 'cone' && f.prep); if (!bu.under) out = true; }
  ok(heaved && out && m.hp < h0, 'почуял шаги, подошёл под землёй, земля вздыбилась — вынырнул и ударил', `−${(h0 - m.hp).toFixed(2)}`);
  ok(m.stunned?.until > w.tick, 'вынырнувший сбивает с ног');
  const B = perkProfile('burrow', 1); m.x = 60; m.y = 60;
  run(w, [bu], B.stay + 2);
  ok(bu.under, 'посидел наверху своё — снова под землю');
  const w2 = field(), b2 = put(w2, 'bear', 'raiders', 20, 20), p = put(w2, 'human', 'colony', 26, 20);
  b2.perks = [{id: 'burrow', rank: 1}]; b2.burrowRow = undefined;
  for (let y = 0; y < w2.h; y++) for (let x = 22; x < 24; x++) w2.grid.terr[y * w2.w + x] = T.ROAD;
  run(w2, [b2], 200);
  ok(b2.under && b2.x < 22, 'дорогу (твёрдую землю) первый ранг не прорывает', `x ${b2.x.toFixed(1)}`);
}

if (fails) { console.log(`\ngrip-check: FAIL ×${fails}`); process.exit(1); }
console.log('\ngrip-check: ok');

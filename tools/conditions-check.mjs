// Conditions of docs/RULES.md (data/conditions.js): wounds and traumas are rows of the table «Состояния», a
// bleeding cut and a stunning blow come from weapon qualities and run their course, exhaustion follows the needs and
// does to the body what its stage says — and nothing while the stage is empty. Part of `npm test`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {T} from '../src/data/terrain.js';
import {createAgent} from '../src/agents/agent.js';
import {damage, attack} from '../src/agents/combat.js';
import {recalcGear} from '../src/agents/equipment.js';
import {stepEffects, stepBody} from '../src/agents/body.js';
import {speedOf} from '../src/agents/movement.js';
import {CONDITIONS, EXHAUSTION, conditionsOf, exhaustionStage} from '../src/data/conditions.js';
import {WOUNDS} from '../src/data/wounds.js';
import * as E from '../src/data/schema/edits.js';

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
function scene() {
  const w = newGame({...DEFAULT_CFG, seed: 'conditions', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.heat[i] = 15; w.grid.fire[i] = 0; }
  return w;
}
const rngs = (w, v) => { for (const k of Object.keys(w.rngs)) w.rngs[k] = Object.assign(() => v, {state: 0}); };
const put = (w, sp, fac) => { const a = createAgent(w, sp, fac, 20.5, 20.5); a.mods.dodge = 0; a.gear = {...recalcGear(a), block: 0, cover: 0}; return a; };

// wounds and traumas are the table's rows, the same objects
for (const W of WOUNDS.all()) expect(CONDITIONS.get(W.id) === W, `рана ${W.id}: не строка «Состояний»`);
for (const c of CONDITIONS.all()) expect(c.label && c.note, `${c.id}: без названия или описания`);

// a bleeding cut
{
  const w = scene(), by = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony'), C = CONDITIONS.get('bleeding');
  rngs(w, 0.99); w.rngs.hits = Object.assign(() => 0, {state: 0}); t.hp = 10;
  damage(w, by, t, 0.01, {type: 'slash', q: {bleed: 0.5}});
  expect(t.bleeding?.dmg === C.dmg && t.bleeding.until === w.tick + C.ticks, 'кровопускающее не оставило кровотечения');
  const hp = t.hp; stepEffects(w, t);
  expect(Math.abs(hp - t.hp - C.dmg) < 1e-12, 'кровотечение не отнимает здоровье за тик');
  expect(conditionsOf(w, t).some(x => x.row.id === 'bleeding'), 'карточка не видит кровотечения');
  w.tick = t.bleeding.until; stepEffects(w, t);
  expect(t.bleeding === null, 'кровотечение не прошло в срок');
  const u = put(w, 'skeleton', 'raiders'); u.hp = 10;
  damage(w, by, u, 0.01, {type: 'slash', q: {bleed: 1}});
  expect(!u.bleeding, 'нежить кровит');
  const p = put(w, 'human', 'colony'); p.hp = 10;
  damage(w, by, p, 0.01, {type: 'slash'});
  expect(!p.bleeding, 'кровотечение без кровопускающего оружия');
}

// a bleeding colonist at the end of its blood falls by luck as from a blow; the fall and the dressing stop the bleeding
{
  const {lethal, stabilize} = await import('../src/agents/wounds.js');
  const w = scene(), c = put(w, 'human', 'colony'), h = put(w, 'human', 'colony');
  c.special.L = 10; rngs(w, 0); c.bleeding = {dmg: 1, until: w.tick + 600}; c.hp = 0.5;
  stepEffects(w, c);
  expect(c.downed && !c.dead && c.bleeding === null, `истёк кровью: ${c.dead ? 'мёртв' : c.downed ? 'упал' : 'стоит'}, кровотечение ${JSON.stringify(c.bleeding)}`);
  c.bleeding = {dmg: 1, until: w.tick + 600}; stabilize(w, h, c);
  expect(!c.downed && c.bleeding === null, 'перевязка не остановила кровотечения');
  void lethal;
}

// a stunning blow
{
  const w = scene(), by = put(w, 'human', 'raiders'), t = put(w, 'human', 'colony');
  rngs(w, 0.99); w.rngs.hits = Object.assign(() => 0, {state: 0}); t.hp = 10;
  const v0 = speedOf(w, t);
  damage(w, by, t, 0.01, {type: 'blunt', q: {stun: 0.5}});
  expect(t.stunned?.until === w.tick + CONDITIONS.get('stunned').ticks, 'оглушающее не оглушило');
  t.cd = 0;
  expect(attack(w, t, by) === false, 'оглушённый бьёт');
  expect(Math.abs(speedOf(w, t) - v0 * CONDITIONS.get('stunned').slow) < 1e-12, 'оглушённый ходит как прежде');
  w.tick = t.stunned.until; stepEffects(w, t);
  expect(t.stunned === null && Math.abs(speedOf(w, t) - v0) < 1e-12, 'оглушение не прошло в срок');
}

// exhaustion: the stage follows the needs; an empty stage leaves the body as it is, a stage with numbers changes it
{
  const w = scene(), a = put(w, 'human', 'colony');
  a.needs.food = EXHAUSTION.low / 2; a.needs.rest = EXHAUSTION.low / 2; a.needs.warmth = 1;
  expect(exhaustionStage(a) === 2, `истощение: две нужды на исходе — ступень ${exhaustionStage(a)}`);
  const mods0 = JSON.stringify(a.mods), hp0 = a.hp;
  stepBody(w, a);
  expect(a.exhaust === 2 && JSON.stringify(a.mods) === mods0 && a.hp <= hp0, 'пустая ступень истощения изменила тело');
  E.setCell('conditions', 'exhausted1', 'mods', {work: 0.5});
  const work = a.mods.work;
  a.needs.food = 1; stepBody(w, a);   // from II down to I: the stage with numbers begins
  expect(a.exhaust === 1 && Math.abs(a.mods.work - work * 0.5) < 1e-12, `ступень I с работой 0,5: работа ${a.mods.work}`);
  a.needs.rest = 1; stepBody(w, a);
  expect(!a.exhaust && Math.abs(a.mods.work - work) < 1e-12, 'истощение прошло, а тело не вернулось');
  E.resetAll();
}

if (bad.length) { console.log('Состояния (этап 4):\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   состояния: ${CONDITIONS.all().length} (ран ${WOUNDS.filter(x => !x.trauma).length}, травм ${WOUNDS.filter(x => x.trauma).length}, состояний ${CONDITIONS.filter(c => c.kind === 'state').length}, ступеней истощения ${CONDITIONS.filter(c => c.kind === 'exhaustion').length}) — кровотечение и оглушение от оружия идут и проходят, истощение меняет тело только своими числами`);

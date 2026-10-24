// The content of the world (docs/RULES.md, docs/WORLD.md): illness with stages, addiction and withdrawal, the rot from undead blows, tongues
// in a town's market, night sight, the caravan's fame, the pace of the march, the settlement's vital signs. Every way
// in is 0 by default (nobody falls ill, gets hooked or tainted, no price or pace changes); each is checked to work
// once a number is set. Part of `npm test`.
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {T} from '../src/data/terrain.js';
import {DAY} from '../src/core/time.js';
import {createAgent} from '../src/agents/agent.js';
import {damage} from '../src/agents/combat.js';
import {recalcGear} from '../src/agents/equipment.js';
import {stepBody} from '../src/agents/body.js';
import {stabilize} from '../src/agents/wounds.js';
import {catchIll, stepIll, stepTaint, stepWithdrawal} from '../src/agents/afflictions.js';
import {AFFLICTIONS, ADDICTION, TAINT} from '../src/data/afflictions.js';
import {conditionsOf} from '../src/data/conditions.js';
import {nightSight} from '../src/data/tongues.js';
import {termsOf, famed, choosePace, paceOf} from '../src/campaign/road.js';
import {PACE_RULES} from '../src/data/road.js';
import {settlementStats} from '../src/settlement/stats.js';
import * as E from '../src/data/schema/edits.js';

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
function scene() {
  const w = newGame({...DEFAULT_CFG, seed: 'content', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  w.agents = [];
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.heat[i] = 15; w.grid.fire[i] = 0; }
  return w;
}
const rngs = (w, v) => { for (const k of Object.keys(w.rngs)) w.rngs[k] = Object.assign(() => v, {state: 0}); };
const put = (w, sp, fac) => { const a = createAgent(w, sp, fac, 20.5, 20.5); a.mods.dodge = 0; a.gear = {...recalcGear(a), block: 0, cover: 0}; return a; };

// ── defaults: no way in is open
expect(AFFLICTIONS.all().every(A => A.catch === 0) && ADDICTION.braga.hook === 0 && TAINT.perHit === 0, 'недуг, зависимость или порча открыты по умолчанию');

// ── illness: stages, the check, the body, death
{
  const w = scene(), a = put(w, 'human', 'colony'), work = a.mods.work;
  catchIll(w, a, 'fever');
  expect(a.ill?.stage === 1 && near(a.mods.work, work * AFFLICTIONS.get('fever').stages[0].mods.work), 'лихорадка I не легла на тело');
  expect(conditionsOf(w, a).some(x => x.row.id === 'ill'), 'карточка не видит болезни');
  rngs(w, 0.99); w.tick = a.ill.next; stepIll(w, a);
  expect(a.ill?.stage === 3, `крит. провал проверки: стадия ${a.ill?.stage}, а должна 3`);
  w.tick = a.ill.next; stepIll(w, a);
  expect(a.dead, 'смертельный недуг за последней стадией не убил');
  const b = put(w, 'human', 'colony'), workB = b.mods.work; catchIll(w, b, 'fever'); rngs(w, 0); w.tick = b.ill.next; stepIll(w, b);
  expect(!b.ill && near(b.mods.work, workB), 'крит. успех не вылечил или тело не вернулось');
  const c = put(w, 'human', 'colony'); catchIll(w, c, 'chill'); c.ill.stage = 2; rngs(w, 0.99); w.tick = c.ill.next; stepIll(w, c);
  expect(!c.dead && c.ill?.stage === 2, 'несмертельный недуг убил или ушёл за последнюю стадию');
}
// fever after a dressed wound, chill in the cold: never at 0, always at 1 (and no number drawn at 0)
{
  const fall = v => { const w = scene(), a = put(w, 'human', 'colony'), h = put(w, 'human', 'colony');
    a.downed = {since: 0, until: 500, cause: 'ран', by: null, trauma: null};
    E.setCell('afflictions', 'fever', 'catch', v);
    let n = 0; for (const k of Object.keys(w.rngs)) w.rngs[k] = Object.assign(() => { n++; return 0; }, {state: 0});
    stabilize(w, h, a); E.resetAll(); return {ill: a.ill?.id, n}; };
  const off = fall(0), on = fall(1);
  expect(!off.ill && off.n === 0 && on.ill === 'fever', `лихорадка после перевязки: при 0 — ${off.ill}, бросков ${off.n}; при 1 — ${on.ill}`);
  const w = scene(), a = put(w, 'human', 'colony'); a.needs.warmth = 0; rngs(w, 0);
  E.setCell('afflictions', 'chill', 'catch', 1); stepBody(w, a); E.resetAll();
  expect(a.ill?.id === 'chill', 'в холоде простуда не пристала');
}
// addiction and withdrawal; the rot
{
  const w = scene(), a = put(w, 'human', 'colony');
  a.addicted = 'braga'; a.drankAt = 0; w.tick = (ADDICTION.braga.days + 1) * DAY;
  E.setCell('conditions', 'withdrawal', 'mods', {work: 0.5});
  const work = a.mods.work; stepWithdrawal(w, a);
  expect(a.withdrawal && near(a.mods.work, work * 0.5), 'ломка не легла на тело');
  a.drankAt = w.tick; stepWithdrawal(w, a);
  expect(!a.withdrawal && near(a.mods.work, work), 'кружка не сняла ломку');
  E.resetAll();
  const z = put(w, 'zombie', 'raiders'), t = put(w, 'human', 'colony'); rngs(w, 0.99); t.hp = 100;
  damage(w, z, t, 0.01); expect(!t.taint, 'порча при нуле');
  E.setCell('afflictionRules', 'taint.perHit', 'value', 3); E.setCell('damageMatrix', 'human', 'resist.rot', 0.5);
  for (let k = 0; k < 4; k++) damage(w, z, t, 0.01);   // 4 × 3 × 0.5
  expect(t.taint === 6 && conditionsOf(w, t).some(x => x.row.id === 'tainted1'), `порча: ${t.taint}`);
  w.tick += DAY; for (let k = 0; k < DAY; k++) stepTaint(w, t);
  expect(t.taint < 6, 'порча не уходит');
  E.resetAll();
}

// ── tongues, night sight, fame, pace
{
  const K = {members: [{race: 'human', alive: true}], fame: {}};
  const orcs = {people: 'orcs', realm: 'r1'}, dwarves = {people: 'dwarves', realm: 'r2'};
  expect(termsOf(null, K, orcs).buy === 1 && termsOf(null, K, orcs).sell === 1, 'без чисел цены города меняются');
  E.setCell('tongueRules', 'tongue.barrier', 'value', 0.5);
  expect(near(termsOf(null, K, orcs).buy, 1.5) && near(termsOf(null, K, orcs).sell, 0.5) && termsOf(null, K, dwarves).buy === 1, 'чужой язык: орки без толмача дороже, с гномами есть общий');
  E.resetAll();
  expect(nightSight('human', 1) === 1, 'ночь сужает обзор при нуле');
  E.setCell('tongueRules', 'night.loss', 'value', 0.5);
  expect(nightSight('human', 1) === 0.5 && nightSight('dwarf', 1) === 1, 'ночное зрение: человек и гном');
  E.resetAll();
  famed(null, K, 'slaveSale', 'r1'); famed(null, K, 'slaveSale', 'r1');
  E.setCell('reputation', 'reputation.infamyMarkup', 'value', 0.1);
  expect(K.fame.r1.infamy === 2 && near(termsOf(null, K, {people: 'humans', realm: 'r1'}).buy, 1.2), 'дурная слава не подняла цены');
  E.resetAll();
  const P = {members: [], bubble: {things: [{pursuit: true}]}};
  expect(choosePace(null, P) === 'normal', 'темп не обычный при правилах по умолчанию');
  E.setCell('paceRules', 'rules', 'pursued', 'fast');
  expect(choosePace(null, P) === 'fast', 'под погоней совет не ускорился');
  P.pace = 'fast'; expect(paceOf(P).speed > 1, 'быстрый темп не быстрее');
  E.resetAll();
  expect(PACE_RULES.pursued === 'normal', 'сброс не вернул правила темпа');
  expect(!!E.setCell('paceRules', 'rules', 'danger', 'gallop').error, 'принят темп, которого нет');
}

// ── the settlement's vital signs
{
  const w = newGame({...DEFAULT_CFG, seed: 'content'}); for (let t = 0; t < DAY; t++) step(w);
  const s = settlementStats(w);
  expect(s.length === 6 && s.every(x => Number.isFinite(x.value) || x.id === 'defence'), `показатели поселения: ${s.map(x => `${x.id} ${x.value}`).join(', ')}`);
  const beds = s.find(x => x.id === 'beds');
  expect(near(beds.value, (w.mods.add.beds || 0) / w.agents.filter(a => a.faction === 'colony').length), 'кровати на жителя посчитаны не так');
}

if (bad.length) { console.log('Содержание мира (этап 8):\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   содержание: недуги ${AFFLICTIONS.all().length} со стадиями, зависимость и ломка, порча от нежити, языки в торге, ночное зрение, слава каравана, темп похода, показатели поселения — по умолчанию закрыты, с числами работают`);

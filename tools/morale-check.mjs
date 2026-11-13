// One's morale in a fight (agents/morale.js, data/morale.js MORALE; plan claude/combat-plan.md Бой-1, the author's word 13.11):
// a comrade's fall shakes those who see it, the more for one close; the stubborn (a troll) less than the skittish (a goblin); an
// officer near softens it; resolve by species and bravery; the ladder; a fleeing one runs (a raider off the map, one of ours
// to the fire) and strikes nothing; it rallies with no foe close; a band breaks when half of it does; the mindless dead have
// none; saved and loaded. Then whole night raids: the stronger side's foe breaks more often.
//   node tools/morale-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, stepCamp, campDone, campOutcome, companyStrength} from '../src/campaign/camp.js';
import {createAgent} from '../src/agents/agent.js';
import {attack} from '../src/agents/combat.js';
import {moraleFell, moraleShock, moraleLift, resolveOf, stateOf, hasMorale, brokenShare, stepMorale} from '../src/agents/morale.js';
import {rout} from '../src/agents/behaviours/rout.js';
import {MORALE} from '../src/data/morale.js';
import {CAMP} from '../src/data/camp.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base)), caps = capitals(base);
// a camp's world before the foe comes: the caravan's people on it
const camp = (ratio = 1, kind = 'bandits', i = 0) => {
  const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, caps[i % caps.length].town, {mode: 'local'});
  const d = {kind, strength: companyStrength(a, K) / (CAMP.foe.unit * ratio)};
  return openCamp(campSetup(a, K, {kind: 'night', foe: d, dayIn: K.dayIn}));
};
const ours = w => w.agents.filter(o => o.faction === 'colony' && !o.dead && !o.captive);
const near = (o, x, y) => { o.x = x; o.y = y; };

// ── a comrade falls: those who see it shaken, the closer the more; resolve by species; temper
{
  const w = camp(), [a, b, c] = ours(w);
  near(a, 20, 20); near(b, 20.5, 20); near(c, 28, 20);
  moraleFell(w, b, null);
  ok(stateOf(a) && a.morale.v < MORALE.start && c.morale.v < MORALE.start && a.morale.v < c.morale.v, 'пал товарищ: видевшим тяжело, стоявшему рядом — тяжелее', `${a.morale.v.toFixed(1)} рядом, ${c.morale.v.toFixed(1)} поодаль`);
  const troll = createAgent(w, 'troll', 'raiders', 40, 40), gob = createAgent(w, 'goblin', 'raiders', 44, 40);
  ok(resolveOf(w, troll) > resolveOf(w, gob) + 30, 'Решимость вида: тролль много твёрже гоблина', `${resolveOf(w, troll).toFixed(0)} / ${resolveOf(w, gob).toFixed(0)}`);
  moraleShock(w, troll, 20, 'fell', 'проба'); moraleShock(w, gob, 20, 'fell', 'проба');
  ok(MORALE.start - troll.morale.v < (MORALE.start - gob.morale.v) / 4, 'характер вида: та же беда бьёт тролля в разы слабее гоблина', `−${(MORALE.start - troll.morale.v).toFixed(1)} / −${(MORALE.start - gob.morale.v).toFixed(1)}`);
  const sk = createAgent(w, 'skeleton', 'raiders', 48, 40);
  ok(!hasMorale(sk), 'у безмозглой нежити морали нет');
}

// ── an officer near softens the blow
{
  const w = camp(), [a, b] = ours(w), x = createAgent(w, 'goblin', 'raiders', 30, 30), y = createAgent(w, 'goblin', 'raiders', 60, 60), boss = createAgent(w, 'goblin', 'raiders', 31, 30);
  boss.marks = ['officer'];
  moraleShock(w, x, 20, 'fell', 'проба'); moraleShock(w, y, 20, 'fell', 'проба');
  ok(x.morale.v > y.morale.v, 'офицер рядом смягчает удар', `${x.morale.v.toFixed(1)} при офицере, ${y.morale.v.toFixed(1)} без`);
}

// ── the ladder: broken — it runs and strikes nothing; a raider off the map, one of ours to the fire; it rallies
{
  const w = camp(), [a] = ours(w), foe = createAgent(w, 'human', 'raiders', a.x + 1, a.y);
  moraleShock(w, a, 400, 'wound', 'проба'); moraleShock(w, foe, 400, 'wound', 'проба');
  ok(stateOf(a).id === 'fleeing' && stateOf(foe).id === 'fleeing', 'мораль на дне — бежит', `${stateOf(a).label}`);
  ok(rout.want(w, a)?.[0]?.[0]?.id === 'runHome' && rout.want(w, foe)?.[0]?.[0]?.id === 'leave', 'бегство: свой — к огню, налётчик — с карты');
  a.cd = 0; ok(attack(w, a, foe) === false, 'бегущий не бьёт');
  foe.dead = true; foe.x = foe.y = -100;
  for (const o of w.agents) if (o !== a && o.faction !== 'colony') { o.x = -100; o.y = -100; }
  moraleLift(w, a, 200, 'проба');
  ok(stateOf(a).id !== 'fleeing', 'опомнился: мораль вернулась, врага рядом нет', stateOf(a).label);
}

// ── a band breaks when half of it does
{
  const ms = [{morale: {state: 'fleeing'}}, {morale: {state: 'breaking'}}, {morale: {state: 'steady'}}, {}];
  ok(brokenShare(ms) === 0.5 && 0.5 >= MORALE.squad.broken, 'отряд ломается, когда сломлена половина');
}

// ── plain data on the agent (a settlement's world saves its agents whole; a camp's is not saved)
{
  const w = camp(), [a] = ours(w);
  moraleShock(w, a, 30, 'wound', 'проба');
  const m2 = JSON.parse(JSON.stringify(a.morale));
  ok(Math.abs(m2.v - a.morale.v) < 1e-9 && m2.state === a.morale.state && Object.keys(a.morale).every(k => typeof a.morale[k] !== 'function'), 'мораль — простые данные на существе: сохраняется с ним', JSON.stringify(m2));
}

// ── whole night raids: against a weak band its men break; against a strong one, ours
{
  const run = (ratio, i) => {
    const w = camp(ratio, 'bandits', i), seen = {foe: new Set(), ours: new Set()};
    for (let g = 0; g < 4800 && !campDone(w); g++) { stepCamp(w); for (const o of w.agents) if (o.morale?.state === 'fleeing') seen[o.faction === 'colony' ? 'ours' : 'foe'].add(o.id); }
    campOutcome(w);
    return {foe: seen.foe.size, ours: seen.ours.size};
  };
  const strong = [0, 1, 2].map(i => run(2, i)), weak = [0, 1, 2].map(i => run(0.5, i));
  const sum = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
  ok(sum(strong, 'foe') > sum(strong, 'ours') && sum(weak, 'ours') > sum(strong, 'ours'), 'ночной налёт: слабая банда бежит, сильная ломает наших', `мы сильнее: бежало врагов ${sum(strong, 'foe')}, наших ${sum(strong, 'ours')}; враг сильнее: наших ${sum(weak, 'ours')}`);
}

if (fails) { console.log(`\nmorale-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nmorale-check: ok');

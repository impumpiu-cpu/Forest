// The scenes of a fight (plan claude/combat-plan.md Бой-2, the author's word 13.11): a place stormed — its guards hold it (goal
// `hold`: about the lair's heart, never chasing far, no looting of the caravan's stores, no captives led off); they break only
// as their morale breaks (agents/morale.js), and a troll does not; the storm raises the caravan at once. The shots spread over
// the foes (0 A.D. Petra: no more than two on one).
//   node tools/scene-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, stepCamp, campDone, campOutcome, companyStrength} from '../src/campaign/camp.js';
import {lairGuard} from '../src/campaign/land.js';
import {planFor} from '../src/agents/squad.js';
import {influenceAt} from '../src/agents/influence.js';
import {nightness} from '../src/core/time.js';
import {CAMP} from '../src/data/camp.js';
import {SQUAD, TACTICS} from '../src/data/behaviour.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base)), cap = capitals(base)[0];
const storm = (kind, ratio) => {
  const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, cap.town, {mode: 'local'}), l = a.lairs.find(x => x.alive && x.kind === kind);
  if (!l) return null;
  const d = {...lairGuard(a, l.kind, l.i, 1, l)}; d.strength = companyStrength(a, K) / (CAMP.foe.unit * ratio);
  return openCamp(campSetup(a, K, {kind: 'guard', foe: d, dayIn: K.dayIn}));
};
const play = (w, each) => { for (let g = 0; g < 4800 && !campDone(w); g++) { stepCamp(w); each?.(w); } return campOutcome(w); };

// ── a troll's bridge stormed: its guards hold it, loot nothing, lead nobody off; the strong company takes it, the weak does not
{
  let looted = 0, led = 0, raised = null;
  const w = storm('trolls', 1.5);
  if (!w) ok(true, 'на этом сиде нет логова троллей — не проверить');
  else {
    const o = play(w, w => { raised ??= w.campaign.alarm; for (const f of w.campaign.foeObjs) { if (f.looted) looted++; if (f.leads != null) led++; } });
    const sq = Object.values(w.squads || {})[0];
    ok(sq?.goal === 'hold' || o.foes.killed === o.foes.n, 'стража логова — цель «оборона»', sq?.goal);
    ok(looted === 0 && led === 0, 'стража не грабит лагерь и не уводит пленных', `грабили ${looted}, уводили ${led}`);
    ok(raised != null && raised <= w.campaign.foeAt + 1, 'штурм поднимает караван сразу');
    ok(o.won && o.foes.fled === 0, 'сильный отряд берёт мост; тролли не бегут — гибнут', JSON.stringify(o.foes).slice(0, 120));
    const w2 = storm('trolls', 0.5), o2 = play(w2);
    ok(!o2.won && o2.foes.fled === 0, 'слабый отряд моста не берёт; тролли его держат', JSON.stringify(o2.foes).slice(0, 120));
  }
}

// ── a guard with nobody near goes back to its spot by the post; a foe far from the post is not chased
{
  const w = storm('goblins', 1) || storm('gnolls', 1);
  if (!w) ok(true, 'нет логова гоблинов или гноллов — не проверить');
  else {
    for (let g = 0; g < 60; g++) stepCamp(w);
    const sq = Object.values(w.squads || {}).find(s => s.goal === 'hold'), g0 = w.campaign.foeObjs.find(f => !f.dead && f.squad === sq?.id);
    for (const p of w.agents) if (p.faction === 'colony') { p.x = sq.post.x + 40; p.y = sq.post.y; p.task = null; }   // (the caravan gone off: none at it)
    const plan = g0 && planFor(w, g0, sq, 12);
    ok(plan?.id === 'holdPost' && Math.hypot(plan.x - sq.post.x, plan.y - sq.post.y) <= SQUAD.hold.ring + 0.01, 'никого рядом — страж идёт на своё место у логова', plan?.id);
  }
}

// ── the shots spread: at a night raid, seldom more than two of one side's shooters on one foe
{
  let samples = 0, over = 0;
  const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, cap.town, {mode: 'local'});
  const w = openCamp(campSetup(a, K, {kind: 'night', foe: {kind: 'bandits', strength: companyStrength(a, K) / CAMP.foe.unit}, dayIn: K.dayIn}));
  play(w, w => {
    if (w.tick % 20) return;
    const aim = new Map();
    for (const s of w.agents) if (!s.dead && s.gear?.rangedReady && s.task?.id === 'fight' && s.task.target) { const k = `${s.faction}:${s.task.target.id}`; aim.set(k, (aim.get(k) || 0) + 1); }
    for (const n of aim.values()) { samples++; if (n > TACTICS.focus.most + 1) over++; }
  });
  ok(samples === 0 || over / samples < 0.2, 'отстрел: на одну цель редко больше двух стрелков', `замеров ${samples}, сверх меры ${over}`);
}

// ── the map of influence (Бой-3): ours strong by our own, the foe's by its; a big band sends a third of its front round the flank
{
  let flankers = 0, turned = 0, inf = null;
  for (let i = 0; i < 3 && !turned; i++) {
    const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, capitals(base)[i % capitals(base).length].town, {mode: 'local'});
    const w = openCamp(campSetup(a, K, {kind: 'night', foe: {kind: 'raiders', strength: companyStrength(a, K) / (CAMP.foe.unit * 0.4)}, dayIn: K.dayIn}));
    const seen = new Set();
    play(w, w => {
      if (!inf && w.influence && w.campaign.spawned) {
        const us = w.agents.find(o => o.faction === 'colony' && !o.dead), them = w.campaign.foeObjs.find(o => !o.dead);
        if (us && them) inf = {usAtUs: influenceAt(w, 'colony', us.x, us.y), themAtUs: influenceAt(w, 'foe', us.x, us.y), themAtThem: influenceAt(w, 'foe', them.x, them.y)};
      }
      for (const o of w.agents) { if (o.sqRole === 'flank') seen.add(o.id); else if (seen.has(o.id) && o.flankTo && !o.dead) turned++; }
    });
    flankers += seen.size;
  }
  ok(inf && inf.usAtUs > 0 && inf.themAtThem > 0, 'карта влияния: у своих — своя сила, у врага — его', JSON.stringify(inf && Object.fromEntries(Object.entries(inf).map(([k, v]) => [k, Math.round(v)]))));
  ok(flankers > 0 && turned > 0, 'большая банда заходит с фланга: обходчики дошли и ударили', `обходчиков ${flankers}, дошли ${turned > 0 ? 'да' : 'нет'}`);
}

// ── an ambush (Бой-4): the band creeps up unseen, then strikes; a band with ranks forms a line, then comes on together
{
  const run = (kind, how, r) => {
    const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, cap.town, {mode: 'local'});
    const w = openCamp(campSetup(a, K, {kind: how, foe: {kind, strength: companyStrength(a, K) / (CAMP.foe.unit * r)}, dayIn: K.dayIn}));
    const got = {creep: 0, lurk: false, struck: false, line: false, spots: false, on: false};
    play(w, w => {
      for (const o of w.agents) if (o.task?.id === 'creep' && o.sneaking) got.creep++;
      for (const q of Object.values(w.squads || {})) { if (q.lurk) got.lurk = true; else if (got.lurk) got.struck = true; if (q.line) { got.line = true; if (q.line.spots) got.spots = true; if (q.line.on) got.on = true; } }
    });
    return got;
  };
  const amb = run('raiders', 'ambush', 0.8), line = run('army', 'night', 0.5);
  ok(amb.lurk && amb.creep > 0 && amb.struck, 'засада: подкрадываются скрытно, потом бьют', JSON.stringify(amb));
  ok(line.line && line.spots && line.on, 'войско встаёт стеной и идёт разом', JSON.stringify(line));
}

// ── a vault (Бой-5): the lair of those who shun the sun is stormed under the ground — night all day; they fight, not leave
{
  const w = storm('vampire', 0.5);
  if (!w) ok(true, 'на этом сиде нет логова вампиров — не проверить');
  else {
    ok(w.scene?.id === 'vault' && nightness(w) === 1, 'логово вампиров — подземелье: там всегда ночь', `${w.scene?.id}, ночь ${nightness(w)}`);
    let sun = 0; const o = play(w, w => { for (const f of w.campaign.foeObjs) if (f.task?.id === 'leave' && f.why?.why === 'солнце встало') sun++; });
    ok(sun === 0 && o.foes.killed + o.foes.left > o.foes.fled, 'под землёй упыри не уходят от солнца — дерутся', JSON.stringify(o.foes).slice(0, 110));
  }
}

if (fails) { console.log(`\nscene-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nscene-check: ok');

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

if (fails) { console.log(`\nscene-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nscene-check: ok');

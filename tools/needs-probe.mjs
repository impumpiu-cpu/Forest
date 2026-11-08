// The towns' needs and their councils' answers (atlas/townNeeds.js) over one world's history: how often each need is lit, which
// answer was taken and which could not be given (by reason), how the plans ended (done, cancelled, failed — by reason), what
// the budgets cost and brought, and the needs' strength over the years by people.
// `node tools/needs-probe.mjs [seed] [size] [std|start]` → JSON on stdout, a summary on stderr
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {traceMode} from '../src/core/decide.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';

const seed = process.argv[2] || 'start376615', size = process.argv[3] || 'small', mode = process.argv[4] || 'std';
if (mode === 'start') for (const P of WORLD_PEOPLES.all()) P.era = 'elder';
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const add = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };
const T = {sittings: {}, picks: {}, none: {}, why: {}, goalPaid: 0, goalUnpaid: 0, settleAsked: 0, settleFound: 0};
traceMode('collect', {sink: rec => {
  if (rec.outcome) return;
  if (rec.point === 'town.need') {
    add(T.sittings, rec.need);
    if (rec.pick) add(T.picks, rec.pick.replace(/^town\.need\.\w+\(/, '').replace(')', '')); else add(T.none, rec.need);
    for (const o of rec.opts) if (o.why) add(T.why, `${o.key.replace(/^town\.need\.\w+\(/, '').replace(')', '')}: ${o.why}`);
  } else if (rec.point === 'town.project' && rec.goal) { if (rec.pick) T.goalPaid++; else T.goalUnpaid++; }
  else if (rec.point === 'town.settle' && rec.asked) { T.settleAsked++; if (rec.found) T.settleFound++; }
}});
// the plans' ends: read off the towns' logs as they grow
const ends = {}, seen = new Set();
const years = [];
let lastY = null;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (st.id !== 'history' || !a.hist) continue;
  for (const t of a.towns || []) for (const n of Object.values(t.need || {})) for (const l of n.log || []) {
    const k = `${t.id}:${l.answer}:${l.at}`; if (seen.has(k)) continue; seen.add(k); add(ends, `${l.answer} ${l.outcome}: ${l.why.replace(/[\d.]+/g, 'N').replace(/: .*/, l.outcome === 'done' ? '' : ': ' + l.why.split(': ').slice(1).join(': '))}`);
  }
  if (a.hist.season === 0 && a.hist.year !== lastY && a.hist.year % 10 === 0) {
    lastY = a.hist.year;
    const row = {y: a.hist.year};
    for (const P of [...WORLD_PEOPLES.all().map(p => p.id), 'all']) {
      const ts = a.towns.filter(t => t.alive && (P === 'all' || t.people === P));
      if (!ts.length) continue;
      const on = id => ts.filter(t => t.need?.[id]?.on).length / ts.length;
      row[P] = {towns: ts.length, pop: Math.round(ts.reduce((s, t) => s + t.pop, 0)), room: +on('room').toFixed(3), metal: +on('metal').toFixed(3),
        budgets: Math.round(ts.reduce((s, t) => s + Object.values(t.budget || {}).reduce((q, B) => q + B.gold, 0), 0)), goals: ts.filter(t => t.goal).length};
    }
    years.push(row);
  }
}
const top = (o, n = 25) => Object.fromEntries(Object.entries(o).sort((p, q) => q[1] - p[1]).slice(0, n));
const out = {seed, mode, sittings: T.sittings, picks: T.picks, none: T.none, why: top(T.why), ends: top(ends, 40),
  goals: {paid: T.goalPaid, unpaid: T.goalUnpaid}, settle: {asked: T.settleAsked, found: T.settleFound}, years};
process.stdout.write(JSON.stringify(out));
process.stderr.write(JSON.stringify({sittings: out.sittings, picks: out.picks, none: out.none, goals: out.goals, settle: out.settle}, null, 1) + '\n');

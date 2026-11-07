// The living company's contract (docs/CAMPAIGN.md «Живая команда: договор»; plan claude/caravan-ver_d.md), scene by scene.
// Step 1 (D0): the fate of a member is read from what the campaign keeps, never «not alive = dead»; every way out of
// the caravan leaves its reason; the settlement's council remembers the proposal that won the second round.
//   node tools/social-check.mjs [worlds=2]
import {fateOf, livesOn, FATES} from '../src/social/fate.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign} from '../src/campaign/index.js';
import {CAMPAIGN} from '../src/data/campaign.js';
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {traceMode} from '../src/core/decide.js';
import {colonists} from '../src/settlement/query.js';
import {DAY} from '../src/core/time.js';

let ok = true;
const check = (what, pass, info = '') => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}${info ? ': ' + info : ''}`); return pass; };

// ── the fates, by hand
const M = o => ({alive: false, ...o});
const cases = [[{alive: true}, 'in'], [M({died: {day: 3, why: 'пал в бою'}}), 'dead'], [M({left: {day: 3, taken: true}}), 'taken'], [M({left: {day: 3, escaped: true}}), 'escaped'],
  [M({left: {day: 3, sold: true}}), 'sold'], [M({left: {day: 3, why: 'deserted'}}), 'left'], [M({left: {day: 3, disbanded: true}}), 'disbanded'], [M({left: {day: 3}}), 'gone'], [M({}), 'gone']];
check('судьба участника — по полям похода, не «не жив = умер»', cases.every(([m, f]) => fateOf(m) === f), cases.map(([m, f]) => `${f}=${fateOf(m)}`).join(' '));
check('живые отсутствующие не оплакиваются как павшие', livesOn(M({left: {sold: true}})) && !livesOn(M({died: {}})) && !livesOn({alive: true}));

// ── every way out of real walks leaves its reason (an old save may have «gone»; a new walk must not)
const worlds = +(process.argv[2] || 2), seen = Object.fromEntries(FATES.map(f => [f, 0]));
let lostEnds = 0, disbandedOk = true;
for (let s = 0; s < worlds; s++) {
  const base = generateAtlas({seed: String(777 + s * 13), size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), caps = capitals(base);
  for (const p of CAMPAIGN.peoples) {
    const c = caps.find(x => x.people === p); if (!c) continue;
    const a = loadAtlas(JSON.parse(frozen));
    newCampaign(a, c.town, {mode: 'auto'});
    const K = runCampaign(a);
    for (const m of K.members) seen[fateOf(m)]++;
    if (K.phase === 'lost') { lostEnds++; for (const id of K.lostWith || []) if (fateOf(K.members.find(m => m.id === id)) !== 'disbanded') disbandedOk = false; }
  }
}
check('у каждого ушедшего из похода есть причина (ни одного «gone» в новых походах)', seen.gone === 0, Object.entries(seen).filter(([, n]) => n).map(([f, n]) => `${f} ${n}`).join(', '));
check('когда ядра не осталось, остальные отпущены живыми, а не записаны в павшие', disbandedOk, `походов с потерей ядра ${lostEnds}`);

// ── the settlement's council: the proposal that won is the one remembered (a second round may change it)
let councils = 0, round2 = 0, changed = 0, mismatched = 0;
for (const seed of ['fpl', 'x7', 'soc3']) {
  const notes = [];
  traceMode('collect', {sink: r => { if (r.point === 'settlement.council') notes.push(r); }});
  const w = newGame({...DEFAULT_CFG, seed});
  for (let d = 0; d < 12; d++) {
    for (let t = 0; t < DAY; t++) {
      const before = notes.length;
      step(w);
      if (notes.length === before) continue;
      const r = notes[notes.length - 1], won = r.pick.slice(r.pick.indexOf('(') + 1, -1);
      councils++; if (r.round2) round2++; if (r.round2 && r.opts[0]?.key !== r.pick) changed++;
      if (w.council.winner !== won) mismatched++;
      // the thoughts of those who spoke: «won» or «saving» only for the winner's backers
      for (const x of w.council.args || []) {
        const ag = colonists(w).find(o => o.id === x.id), th = ag?.diary?.find(e => e.t === w.tick || e.t === w.tick - 1);
        if (!th) continue;
        if ((x.key === won) !== (th.id !== 'councilLost')) mismatched++;
      }
    }
  }
  traceMode('off');
}
check('совет поселения: реакции и память — по итогу, в том числе когда второй тур меняет победителя', councils > 0 && mismatched === 0,
  `советов ${councils}, со вторым туром ${round2}, из них победитель сменился ${changed}, расхождений ${mismatched}`);

console.log(ok ? '\nok   договор живой команды держится' : '\nFAIL договор живой команды нарушен');
process.exit(ok ? 0 : 1);

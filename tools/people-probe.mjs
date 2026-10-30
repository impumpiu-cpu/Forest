// Probe of the peoples' numbers (atlas/demography.js, docs/WORLD.md «Демография»): at the end of history, per people — towns,
// people, the towns its settlers founded and the ones left empty, how many moved and how many abroad.
// `node tools/people-probe.mjs [worlds] [size] [--json]`
import {newAtlas, runNextStage} from '../src/atlas/generate.js';

const args = process.argv.slice(2), json = args.includes('--json'), pos = args.filter(x => !x.startsWith('--'));
const N = +(pos[0] || 4), size = pos[1] || 'small';
const by = {}, all = {moved: 0, abroad: 0};
for (let k = 0; k < N; k++) {
  const a = newAtlas({seed: 'macro' + k, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
  while (runNextStage(a)) { /* the whole history */ }
  for (const t of a.towns) {
    const P = by[t.people] ||= {towns: 0, pop: 0, settled: 0, left: 0, razed: 0, big: 0};
    if (t.from != null) P.settled++;
    if (t.alive) { P.towns++; P.pop += t.pop; if (t.tier >= 2) P.big++; }
  }
  for (const r of a.ruins || []) { const P = by[r.people]; if (P) { if (r.how === 'опустел') P.left++; else P.razed++; } }
  all.moved += a.hist.moved || 0; all.abroad += a.hist.movedAbroad || 0;
}
const out = Object.fromEntries(Object.entries(by).map(([p, P]) => [p, {towns: +(P.towns / N).toFixed(1), pop: Math.round(P.pop / N), perTown: Math.round(P.pop / Math.max(1, P.towns)),
  big: +(P.big / N).toFixed(1), settled: +(P.settled / N).toFixed(1), left: +(P.left / N).toFixed(1), razed: +(P.razed / N).toFixed(1)}]));
out.moved = {perWorld: Math.round(all.moved / N), abroad: Math.round(all.abroad / N)};
if (json) console.log(JSON.stringify(out));
else {
  for (const [p, o] of Object.entries(out)) if (p !== 'moved') console.log(`${p.padEnd(8)} городов ${o.towns} (больших ${o.big}), жителей ${o.pop}, на город ${o.perTown} | основали поселенцы ${o.settled}, опустело ${o.left}, сожжено ${o.razed}`);
  console.log(`переехало за историю: ${out.moved.perWorld} на мир, из них в чужие державы ${out.moved.abroad}`);
}

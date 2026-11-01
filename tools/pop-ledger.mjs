// Where each people's town folk come from and go to, from one start (as tools/race-start-probe.mjs): every change of
// `t.pop` in a town is booked to the function that made it (the first frame of the stack outside this file), by decade.
// `node tools/pop-ledger.mjs [seed]` → JSON on stdout: {book: {people: {decade: {function: [gained, lost]}}}, pops: {people: {decade:
// person-years}}}
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';

const seed = process.argv[2] || 'start376615';
for (const Q of WORLD_PEOPLES.all()) Q.era = 'elder';
const a = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const book = {}, watched = new WeakSet();
const callerOf = () => {
  const lines = new Error().stack.split('\n').slice(2);
  for (const l of lines) {
    if (/pop-ledger/.test(l)) continue;
    const m = /at (?:(\S+) \()?.*?\/src\/([\w/]+)\.js:(\d+)/.exec(l);
    if (m) return `${m[2]}:${m[1] || 'anon'}`;
  }
  return '?';
};
const watch = t => {
  if (watched.has(t)) return;
  watched.add(t);
  let v = t.pop;
  Object.defineProperty(t, 'pop', {
    get: () => v,
    set: x => {
      const d = x - v;
      if (d && a.hist?.year != null) {
        const k = callerOf(), dec = Math.floor(a.hist.year / 10) * 10, B = ((book[t.people] ||= {})[dec] ||= {}), e = (B[k] ||= [0, 0]);
        if (d > 0) e[0] += d; else e[1] -= d;
      }
      v = x;
    },
    enumerable: true, configurable: true,
  });
};
let lastY = 0;
const pops = {};   // person-years by decade: [Σ people at each new year, years counted]
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  for (const t of a.towns || []) watch(t);
  if (a.hist?.season === 0 && a.towns?.length && a.hist.year !== lastY) { lastY = a.hist.year; for (const t of a.towns) if (t.alive) { const B = ((pops[t.people] ||= {})[Math.floor(lastY / 10) * 10] ||= [0, 0]); B[0] += t.pop; B[1]++; } }
}
const out = {};
for (const [pe, D] of Object.entries(book)) { out[pe] = {}; for (const [dec, B] of Object.entries(D)) out[pe][dec] = Object.fromEntries(Object.entries(B).map(([k, [g, l]]) => [k, [Math.round(g), Math.round(l)]]).sort((p, q) => (q[1][0] + q[1][1]) - (p[1][0] + p[1][1]))); }
console.log(JSON.stringify({seed, book: out, pops: Object.fromEntries(Object.entries(pops).map(([pe, D]) => [pe, Object.fromEntries(Object.entries(D).map(([d, [s]]) => [d, Math.round(s)]))]))}));

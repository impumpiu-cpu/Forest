// Probe of the realms' councils (atlas/mind.js, docs/WORLD.md «Совет державы»): where each people's realms stand on the
// three vectors at the end of history against their rose, how they spend, how fed and how many they are.
// `node tools/mind-probe.mjs [worlds] [size] [--json]`
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {treasuryWorth, treasuryOf} from '../src/atlas/treasury.js';
import {VECTOR_IDS} from '../src/data/mind.js';
import {roseOf, townLean} from '../src/atlas/mind.js';

const args = process.argv.slice(2), json = args.includes('--json'), pos = args.filter(x => !x.startsWith('--'));
const N = +(pos[0] || 4), size = pos[1] || 'small';
const by = {};
const sum = (o, k, v) => { o[k] = (o[k] || 0) + v; };
const vadd = (o, v, w = 1) => { for (const k of VECTOR_IDS) sum(o, k, (v?.[k] || 0) * w); };

for (let k = 0; k < N; k++) {
  const a = newAtlas({seed: 'macro' + k, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
  while (runNextStage(a)) { /* the whole history */ }
  for (const r of a.realms || []) {
    const ts = a.towns.filter(t => t.alive && t.realm === r.id);
    if (!ts.length || r.fallen != null) continue;
    const P = by[r.people] ||= {realms: 0, towns: 0, pop: 0, fedPop: 0, course: {}, wind: {}, built: {}, roles: {}, reserve: [], income: 0, out: 0, grant: 0, wars: 0};
    const pop = ts.reduce((s, t) => s + t.pop, 0);
    P.realms++; P.towns += ts.length; P.pop += pop;
    P.fedPop += ts.reduce((s, t) => s + (t.econ?.fed ?? 1) * t.pop, 0);
    vadd(P.course, r.mind?.course); vadd(P.wind, r.mind?.wind);
    for (const t of ts) { vadd(P.built, townLean(t), t.built.length); sum(P.roles, t.role || 'seat', 1); }
    const T = treasuryOf(r), y = T.year || {in: {}, out: {}};
    P.reserve.push(treasuryWorth(r) / Math.max(1, T.need || 0));
    P.income += Object.values(y.in || {}).reduce((s, v) => s + v, 0);
    P.out += Object.values(y.out || {}).reduce((s, v) => s + v, 0);
    P.grant += y.out?.grant || 0;
    P.wars += Object.entries(a.rel || {}).filter(([kk, x]) => x.wars && kk.split(':').includes(String(r.id))).reduce((s, [, x]) => s + x.wars, 0);
  }
}
const f2 = v => v.toFixed(2), med = xs => { const s = [...xs].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
const norm = o => { const s = VECTOR_IDS.reduce((x, k) => x + (o[k] || 0), 0) || 1; return VECTOR_IDS.map(k => f2((o[k] || 0) / s)).join(' · '); };
const out = {};
for (const [p, P] of Object.entries(by)) {
  out[p] = {realms: P.realms, towns: P.towns, pop: Math.round(P.pop / N), fed: +(P.fedPop / Math.max(1, P.pop)).toFixed(2),
    rose: VECTOR_IDS.map(k => f2(roseOf(p)[k])).join(' · '), built: norm(P.built), course: norm(P.course), wind: norm(P.wind),
    roles: P.roles, reserveSeasons: Math.round(med(P.reserve)), spentShare: +(P.out / Math.max(1, P.income)).toFixed(2), grantShare: +(P.grant / Math.max(1, P.income)).toFixed(2), wars: P.wars};
}
if (json) console.log(JSON.stringify(out));
else for (const [p, o] of Object.entries(out)) console.log(`${p.padEnd(8)} держав ${o.realms}, городов ${o.towns}, жителей на мир ${o.pop}, еда ${o.fed}
         роза ${o.rose} | построено ${o.built} | курс ${o.course} | ветер ${o.wind}
         роли ${JSON.stringify(o.roles)} | запас казны ${o.reserveSeasons} сез. | расход/доход ${o.spentShare}, гранты ${o.grantShare} | войн ${o.wars}`);

// «Заселение мира» (atlas/settle.js; docs/TABLE.md этап 9): a land made into a world with no eras; the hand lands
// peoples, sets lairs and calamities, runs the clock; the world lives on from them; the same acts give the same world,
// and a world saved between stretches goes on as it would have.
import {newAtlas, runNextStage, landDone, atlasDone, atlasHash} from '../src/atlas/generate.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';
import {startFree, landPeople, addLair, wildByLand, setCalamity, runYears, endRun} from '../src/atlas/settle.js';
import {findSpot} from '../src/atlas/lairs.js';
import {LAIRS} from '../src/data/lairs.js';
import {biomeAt} from '../src/atlas/biomes.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {eraSpans, worldChronicleText} from '../src/atlas/chronicle.js';
import {mulberry} from '../src/core/rng.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

function land() { const a = newAtlas({...DEFAULT_ATLAS_CFG, seed: '11', size: 'small'}); while (!landDone(a)) runNextStage(a); return a; }
const run = (a, years) => { runYears(a, years); while (!atlasDone(a)) runNextStage(a); endRun(a); };
const cellOf = (a, test) => { for (let i = 0; i < a.n; i++) if (!a.f.ocean[i] && a.f.lake[i] < 0 && test(i)) return i; return -1; };
// the hand's acts, the same each time
function acts(a) {
  const forest = cellOf(a, i => ['forest', 'taiga'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.3);
  const plain = cellOf(a, i => ['meadow', 'steppe', 'forest'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.55);
  const out = {elves: landPeople(a, 'elves', forest), humans: landPeople(a, 'humans', plain)};
  out.varg = addLair(a, 'varg', findSpot(a, LAIRS.get('varg'), mulberry(5)));
  out.necro = addLair(a, 'necromancer', cellOf(a, i => i % a.w < a.w * 0.5 && ((i / a.w) | 0) > a.h * 0.5));
  out.cal = setCalamity(a, {kind: 'necromancer', at: cellOf(a, i => i % a.w > a.w * 0.6 && ((i / a.w) | 0) > a.h * 0.4), years: 6});
  return out;
}

const base = land(), A = structuredClone(base);
startFree(A);
check('земля стала миром без эпох: часы стоят, народов и логов нет', A.hist.era === 'free' && atlasDone(A) && !A.towns.length && !A.lairs.length && A.fauna);
run(A, 5);
check('пустой мир живёт 5 лет: только звери', A.hist.year === 6 && !A.towns.length, `год ${A.hist.year}`);
const B = structuredClone(base); startFree(B);
const r = acts(B);
check('народы высажены рукой: город и держава у каждого', r.elves.town && r.humans.town && B.realms.length === 2, `${r.elves.town?.name}, ${r.humans.town?.name}`);
check('логово ставится рукой; мёртвым — курганы и гниль', r.varg.id && r.necro.id && B.f.barrows && B.rot.some(v => v > 0.5));
const bad = addLair(B, 'drake', cellOf(B, i => biomeAt(B, i)?.id === 'meadow' && B.f.volc[i] < 0.2 && !B.towns.some(t => Math.hypot(t.x - i % B.w, t.y - ((i / B.w) | 0)) < 4)));
check('логово не на своей земле — отказ со словами', !!bad.error, bad.error);
check('бедствие задано: вид, место, год', r.cal.id === 1 && r.cal.at >= 0 && r.cal.riseAt === B.hist.year + 6);
const w = wildByLand(B), w2 = wildByLand(B);
check('логова по земле — один раз', w.n > 0 && !!w2.error, `легло ${w.n}`);
run(B, 25);
const c = B.calamities[0], towns = B.towns.filter(t => t.alive);
check('за 25 лет: города растут и множатся, бедствие поднялось там, где задано', towns.length > 2 && c.phase !== 'waiting' && c.i === c.at && B.artifact,
  `городов ${towns.length}, бедствие: ${c.phase}${c.fell ? ` (${c.fell.by})` : ''}`);
check('в летописи — строки руки и итог отрезка', B.chronicle.some(l => l.hand && /Прошло 25 лет/.test(l.text)));
check('летопись по «эпохам» читается: одна — «Вольная история»', eraSpans(B).length === 1 && eraSpans(B)[0].to === 25 && worldChronicleText(B, {detail: 'normal'}).includes('Вольная история'));
check('бедствий в ожидании — не больше трёх', !setCalamity(B, {years: 5}).error && !setCalamity(B, {years: 5}).error && (B.calamities.filter(x => x.phase !== 'fallen').length < 3 || !!setCalamity(B, {years: 5}).error));

// the same acts — the same world; saved between stretches — goes on the same
const C1 = structuredClone(base); startFree(C1); acts(C1); wildByLand(C1); run(C1, 25);
check('те же действия — тот же мир', atlasHash(C1) === atlasHash(B.calamities.length > 1 ? (() => { const D = structuredClone(base); startFree(D); acts(D); wildByLand(D); run(D, 25); return D; })() : B));
const S = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(C1, 'проба'))));
run(C1, 10); run(S, 10);
check('мир, сохранённый между отрезками, идёт дальше так же', atlasHash(C1) === atlasHash(S) && S.cfg.free, `год ${S.hist.year}`);
const late = landPeople(S, 'dwarves', cellOf(S, i => ['foothills', 'highlands'].includes(biomeAt(S, i)?.id)));
check('народ можно высадить и позже, в живой мир', !!late.town || /близко/.test(late.error), late.error || late.town.name);

if (fail.length) { console.log(`\n${fail.length} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки заселения прошли.');

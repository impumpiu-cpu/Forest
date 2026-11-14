// The arena (campaign/arena.js, data/arena.js; docs/GAME.md «Арена»): what may be chosen is there; the company is made as
// asked — its heads, races, roles, levels; the foe comes as asked — beasts by the head, a band by its strength, each row at its
// level; a foe that shuns the sun fights by night, or by day in a vault (always night); a storm lays out a scene, a meeting
// lets nobody creep; the counters count the sides; the fight comes to its end; the same seed gives the same fight.
//   node tools/arena-check.mjs [seed]
import {arenaAtlas, arenaCatalog, arenaSetup, arenaSides, arenaRandom, darkFoes} from '../src/campaign/arena.js';
import {openCamp, stepCamp, campDone} from '../src/campaign/camp.js';
import {nightness} from '../src/core/time.js';
import {mulberry, seedNumber} from '../src/core/rng.js';

const seed = process.argv[2] || 'arena';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const a = arenaAtlas(seed);
const ours = [{race: 'human', role: 'shield', level: 5, gear: 2, n: 2}, {race: 'human', role: 'archer', level: 3, gear: 2, n: 2}];
const play = (setup, most = 60000) => { const w = openCamp(setup); let n = 0; while (!campDone(w) && n < most) { stepCamp(w); n++; } return {w, n}; };
const until = (w, f, most = 5000) => { let n = 0; while (!f() && n < most && !campDone(w)) { stepCamp(w); n++; } return n; };

// ── the catalogue
{
  const C = arenaCatalog();
  ok(C.races.length >= 5 && C.races.every(r => r.roles.length), 'расы отряда — с боевыми ролями', C.races.map(r => `${r.label} ${r.roles.length}`).join(', '));
  ok(C.bands.length >= 8 && C.beasts.length >= 10, 'враги: банды и звери', `банд ${C.bands.length}, зверей ${C.beasts.length}`);
  ok(C.bands.find(b => b.id === 'upyrs')?.dark && C.beasts.find(b => b.species === 'bat')?.dark && !C.beasts.find(b => b.species === 'wolf')?.dark, 'упыри и кровопийцы помечены ночными, волки — нет');
  ok(Object.keys(C.kinds).join() === 'defend,storm,meet', 'три типа боя: оборона, штурм, встречный');
}

// ── the company and the foe as asked
{
  const {setup, K, info} = arenaSetup(a, {kind: 'defend', time: 'day', seed: `${seed}:1`, ours, foes: [{beast: 'wolves', n: 3, level: 5}, {band: 'orcs', s: 400, level: 3}]});
  ok(K.members.length === 4 && K.members.filter(m => m.fight === 'shield').length === 2, 'отряд — как заказан: 4, из них 2 щитоносца', K.members.map(m => `${m.fight}:${m.level}`).join(' '));
  ok(K.members.filter(m => m.fight === 'shield').every(m => m.level === 5) && K.members.filter(m => m.fight === 'archer').every(m => m.level === 3), 'уровни — как заказаны');
  ok(info.ours > 0 && info.foes > 400, 'счётчики КС до боя', `наши ${info.ours}, враги ${info.foes}`);
  const w = openCamp(setup);
  until(w, () => w.campaign.spawned);
  const F = w.campaign.foeObjs, wolves = F.filter(o => o.species === 'wolf'), orcs = F.filter(o => o.band === 'orcs');
  ok(wolves.length === 3 && wolves.every(o => o.level === 5), 'звери — поштучно, на своём уровне', `волков ${wolves.length}, ур. ${wolves.map(o => o.level).join('/')}`);
  ok(orcs.length >= 1 && orcs.every(o => o.level === 3), 'банда — по своему КС, на своём уровне', `${orcs.length} голов`);
  const S = arenaSides(w);
  ok(S.ours.n === 4 && S.foes.n === F.length && S.ours.s > 0 && S.foes.s > 0, 'счётчики сторон на карте', JSON.stringify(S));
}

// ── the dark
{
  const foes = [{band: 'upyrs', s: 300}];
  ok(darkFoes(foes) && !darkFoes([{beast: 'wolves', n: 2}]), 'упыри — ночной враг, волки — нет');
  const day = arenaSetup(a, {kind: 'defend', time: 'day', seed: `${seed}:2`, ours, foes}), wd = openCamp(day.setup);
  ok(day.info.time === 'vault' && wd.scene?.dark && nightness(wd) === 1, 'упыри днём — только в подземелье: там всегда ночь', `${day.info.time}, сцена ${wd.scene?.id || wd.scene?.kind}`);
  const night = arenaSetup(a, {kind: 'defend', time: 'night', seed: `${seed}:2`, ours, foes}), wn = openCamp(night.setup);
  ok(night.info.time === 'night' && !wn.scene?.dark && nightness(wn) > 0, 'упыри ночью — на обычной карте, ночью', `${night.info.time}, ночь ${nightness(wn).toFixed(2)}`);
  const wolves = arenaSetup(a, {kind: 'defend', time: 'day', seed: `${seed}:2`, ours, foes: [{beast: 'wolves', n: 2}]}), ww = openCamp(wolves.setup);
  ok(wolves.info.time === 'day' && nightness(ww) === 0, 'волки днём — днём');
}

// ── a storm, a meeting
{
  const st = arenaSetup(a, {kind: 'storm', time: 'day', seed: `${seed}:3`, ours, foes: [{band: 'bandits', s: 300}]}), ws = openCamp(st.setup);
  ok(!!ws.scene, 'штурм — на сцене с логовом в середине', ws.scene?.id || ws.scene?.kind);
  const me = arenaSetup(a, {kind: 'meet', time: 'day', seed: `${seed}:3`, ours, foes: [{band: 'orcs', s: 500}]}), wm = openCamp(me.setup);
  until(wm, () => wm.campaign.spawned);
  ok(wm.campaign.foeObjs.length && !wm.campaign.foeObjs.some(o => o.sneaking), 'встречный бой: никто не крадётся', `${wm.campaign.foeObjs.length} голов`);
}

// ── to the end, the same twice
{
  const opts = {kind: 'meet', time: 'day', seed: `${seed}:4`, ours, foes: [{beast: 'wolves', n: 4, level: 3}]};
  const x = play(arenaSetup(a, opts).setup), y = play(arenaSetup(a, opts).setup);
  ok(campDone(x.w), 'бой доходит до конца', `${x.n} тиков`);
  ok(x.n === y.n && JSON.stringify(arenaSides(x.w)) === JSON.stringify(arenaSides(y.w)), 'тот же сид — тот же бой', `${JSON.stringify(arenaSides(x.w))}`);
  const R = arenaRandom(mulberry(seedNumber(`${seed}:r`)));
  const r = arenaSetup(a, {kind: 'defend', time: 'day', seed: `${seed}:5`, ...R});
  ok(r.K.members.length >= 4 && R.foes.length >= 1 && r.info.foes > 0, 'случайные стороны собираются', `наши ${r.info.ours} (${r.K.members.length}), враги ${r.info.foes}`);
}

console.log(fails ? `\narena-check: ${fails} FAIL` : '\narena-check: ok');
process.exit(fails ? 1 : 0);

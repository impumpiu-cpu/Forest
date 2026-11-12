// The baseline of the guild's plan (claude/guild-plan.md Д0): what the campaign is now, in numbers, from one command —
//   errands  — each errand of a lair from every capital that has it: handed in, out of time, lost; the days to hand-in; the
//              storms it took and the levels it ended at (the quick mode by default: its walk is the local map's; its fights
//              only roughly — `--mode local` for the map's own, slow);
//   fights   — the fights of a few campaigns on the local map by kind (a night, an ambush, a storm): won, fallen, the foe's
//              strength in the world and in strength rating against the caravan's;
//   strength — the same guards stormed by a fresh caravan of eight and by the same eight grown (+2 S/E/A): the guards stay the
//              same, the grown win cheaper (the foe is bought by its own strength: data/camp.js CAMP.foe);
//   time     — a season of one caravan on the local map.
//   node tools/guild-baseline.mjs [--seeds 777,790] [--mode auto|local] [--part errands,fights,strength,time] [--caps 99] [--n 6]
// Prints a report in Markdown (to keep as claude/guild-baseline.md); nothing is checked here — it is a measure, not a test.
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign, errandsFor} from '../src/campaign/index.js';
import {campSetup, runCamp, campOutcome} from '../src/campaign/camp.js';
import {lairGuard} from '../src/campaign/land.js';
import {ERRANDS} from '../src/data/errands.js';
import {YEAR_DAYS} from '../src/data/seasons.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const seeds = arg('seeds', '777,790').split(','), mode = arg('mode', 'auto'), parts = new Set(arg('part', 'errands,fights,strength,time').split(','));
const capsMax = +arg('caps', 99), N = +arg('n', 6);
const world = seed => generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const q = (xs, p) => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(p * (s.length - 1))] : null; };
const f1 = v => (v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));
const out = [`# Исходные показатели похода (${new Date().toISOString().slice(0, 10)})`, '', `Малые миры, сиды ${seeds.join(', ')}; год = ${YEAR_DAYS} дней. Команда: \`node tools/guild-baseline.mjs ${process.argv.slice(2).join(' ')}\`.`, ''];

if (parts.has('errands')) {
  const rows = {};
  for (const seed of seeds) {
    const base = world(seed), fz = JSON.stringify(saveAtlas(base));
    for (const cap of capitals(base).slice(0, capsMax)) for (const e of errandsFor(base, cap.town)) {
      if (!e.ok || ERRANDS.get(e.id).how !== 'lair') continue;
      const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, cap.town, {mode, errand: e.id, chapters: true});
      let n = 0; while (n < 100 && (K.phase === 'out' || K.phase === 'back' || K.phase === 'empty') && stepCampaign(a)) n++;
      const d = K.done?.at(-1);
      (rows[e.id] ||= []).push({phase: d ? (d.failed ? 'failed' : 'handed') : K.phase, days: d ? d.day : K.day, storms: K.stats.storms || 0, lv: Math.max(0, ...K.members.filter(m => m.alive).map(m => m.level || 1)), alive: K.members.filter(m => m.alive && m.core).length});
    }
  }
  out.push(`## Поручения (режим ${mode === 'auto' ? 'быстрый: путь как на карте, бои приблизительно' : 'локальная карта'})`, '', '| Поручение | Походов | Сдано | Провал (срок) | Погибли | Дней до сдачи: мин / медиана / макс | Штурмов (медиана) | Лучший уровень (медиана) | Ядра живо (медиана) |', '|---|---|---|---|---|---|---|---|---|');
  for (const [id, rs] of Object.entries(rows)) {
    const h = rs.filter(r => r.phase === 'handed'), ds = h.map(r => r.days);
    out.push(`| ${ERRANDS.get(id).label} (${'I II III IV V'.split(' ')[ERRANDS.get(id).tier - 1]}) | ${rs.length} | ${h.length} | ${rs.filter(r => r.phase === 'failed').length} | ${rs.filter(r => r.phase === 'lost').length} | ${ds.length ? `${q(ds, 0)} / ${q(ds, 0.5)} / ${q(ds, 1)}` : '—'} | ${q(rs.map(r => r.storms), 0.5)} | ${q(h.map(r => r.lv), 0.5) ?? '—'} | ${q(rs.map(r => r.alive), 0.5)} |`);
  }
  out.push('');
}

if (parts.has('fights') || parts.has('time')) {
  const fights = [], times = [];
  for (const seed of seeds) {
    const base = world(seed), fz = JSON.stringify(saveAtlas(base));
    for (const cap of capitals(base).slice(0, Math.min(3, capsMax))) {
      const a = loadAtlas(JSON.parse(fz)), K = newCampaign(a, cap.town, {mode: 'local'});
      const t0 = Date.now(); let n = 0; while (n < 8 && stepCampaign(a)) n++;
      times.push((Date.now() - t0) / Math.max(1, n) / 1000);
      for (const f of K.fights || []) fights.push(f);
    }
  }
  if (parts.has('fights')) {
    out.push('## Бои на локальной карте (8 сезонов, до трёх столиц на сид)', '', 'Сила врага — из мира (земля, логово, ступень), не от каравана. «Сила» — его сила в мире; бюджеты — в рейтинге силы.', '', '| Бой | Боёв | Выиграно | Пало своих | Сила в мире: 10 % / медиана / 90 % | Враг (медиана) | Караван (медиана) |', '|---|---|---|---|---|---|---|');
    const WORD = {night: 'ночью', ambush: 'засада', guard: 'штурм'};
    for (const how of ['night', 'ambush', 'guard']) {
      const fs = fights.filter(f => f.how === how); if (!fs.length) continue;
      out.push(`| ${WORD[how]} | ${fs.length} | ${fs.filter(f => f.won).length} | ${fs.reduce((s, f) => s + f.fell.length, 0)} | ${f1(q(fs.map(f => f.strength), 0.1))} / ${f1(q(fs.map(f => f.strength), 0.5))} / ${f1(q(fs.map(f => f.strength), 0.9))} | ${Math.round(q(fs.map(f => f.theirs), 0.5))} | ${Math.round(q(fs.map(f => f.ours), 0.5))} |`);
    }
    out.push('');
  }
  if (parts.has('time')) out.push('## Время', '', `Сезон одного каравана на локальной карте: медиана ${f1(q(times, 0.5))} с (от ${f1(q(times, 0))} до ${f1(q(times, 1))}).`, '');
}

if (parts.has('strength')) {
  const a = world(seeds[0]), caps = capitals(a), res = {};
  for (const variant of ['fresh', 'grown']) for (const s of [0.8, 1.2, 1.6]) {
    const R = res[`${variant}:${s}`] = {won: 0, dead: 0, theirs: 0, ours: 0};
    for (let k = 0; k < N; k++) {
      const K = newCampaign(a, caps[k % caps.length].town, {mode: 'local', seed: `baseline:${k}`});
      if (variant === 'grown') for (const m of K.members) for (const key of ['S', 'E', 'A']) m.special[key] = (m.special[key] || 5) + 2;
      K.day = 10 + k;
      const o = campOutcome(runCamp(campSetup(a, K, {kind: 'guard', foe: {...lairGuard(a, 'goblins', K.i, s), label: 'проба'}})));
      R.won += o.won ? 1 : 0; R.dead += o.members.filter(m => !m.alive).length; R.theirs += o.foes.might || 0; R.ours += o.ours.might || 0;
      a.campaign = null;
    }
  }
  out.push(`## Проба силы: штурм гоблинского логова, ${N} штурмов на строку`, '', 'Одна и та же стража против свежей восьмёрки и той же восьмёрки, выросшей на +2 к S/E/A.', '', '| Сила стражи | Стража (рейтинг) | Свежий: побед / пало в среднем | Выросший: побед / пало в среднем |', '|---|---|---|---|');
  for (const s of [0.8, 1.2, 1.6]) {
    const F = res[`fresh:${s}`], G = res[`grown:${s}`];
    out.push(`| ${f1(s)} | ${Math.round(F.theirs / N)} (у выросшего ${Math.round(G.theirs / N)}) | ${F.won}/${N} · ${f1(F.dead / N)} | ${G.won}/${N} · ${f1(G.dead / N)} |`);
  }
  out.push('');
}

console.log(out.join('\n'));

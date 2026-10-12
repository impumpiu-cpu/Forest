// The final summary: totals, awards for the colonists who stood out, and curious facts.
// Pure: reads the world and its chronicle, returns plain data for the end screen.
import {DAY} from '../core/time.js';
import {g, plural} from '../core/util.js';
import {BUILDINGS} from '../data/buildings.js';
import {ITEMS} from '../data/items.js';
import {RESOURCES} from '../data/resources.js';
import {JOBS} from '../data/jobs.js';
import {colonists} from './query.js';
import {daysLived} from './chronicle.js';

const sumVals = o => Object.values(o).reduce((s, v) => s + v, 0);
const dayNo = t => Math.floor(t / DAY) + 1;
const fmt = n => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
// "1 день", "3 дня", "8 дней", but "8,4 дня" for fractions
const daysText = v => { const r = Math.round(v * 10) / 10; return `${fmt(r)} ${Number.isInteger(r) ? plural(r, 'день', 'дня', 'дней') : 'дня'}`; };

// how much a colonist gave the settlement, in one number
function worth(w, r) {
  const s = r.stats;
  return daysLived(w, r) * 2 + sumVals(s.gathered) * 0.15 + s.hunted * 2 + s.crafted * 3 + s.labour / 120 + s.raiders * 4 + s.wolves * 5;
}

function deeds(w, r) {
  const s = r.stats, out = [];
  if (s.raiders + s.wolves) out.push(`${s.raiders + s.wolves} ${plural(s.raiders + s.wolves, 'победа', 'победы', 'побед')} в бою`);
  if (s.crafted) out.push(`${s.crafted} ${plural(s.crafted, 'вещь', 'вещи', 'вещей')} своими руками`);
  if (s.hunted) out.push(`${s.hunted} ${plural(s.hunted, 'заяц', 'зайца', 'зайцев')}`);
  const top = Object.entries(s.gathered).sort((a, b) => b[1] - a[1])[0];
  if (top) out.push(`${top[1]} ед.: ${RESOURCES.get(top[0]).label}`);
  if (s.labour > 120) out.push(`${Math.round(s.labour / 120)} ч на стройке`);
  return out.slice(0, 3);
}

export function summarize(w) {
  const c = w.chronicle, people = c.people, now = w.tick;
  const days = now / DAY;
  const alive = colonists(w);
  const finished = c.built.length;

  const totals = [
    ['Продержалось', daysText(days)],
    ['Жителей в лучшие дни', c.peakPop],
    ['Всего прошло через поселение', people.length],
    ['Зданий построено', finished],
    ['Сделано вещей', sumVals(c.crafted)],
    ['Налётов пережито', Math.max(0, w.stats.raids - (w.over?.reason === 'raided' ? 1 : 0))],
    ['Сражено налётчиков', c.raidersKilled],
    ['Убито волков', c.wolvesKilled],
  ];

  // awards: the colonist with the most of something (only if anyone did it at all)
  const award = (title, metric, text, min = 0.5) => {
    let best = null, bv = min;
    for (const r of people) { const v = metric(r); if (v > bv) { bv = v; best = r; } }
    return best ? {title, name: best.name, text: text(best, bv), dead: best.died != null} : null;
  };
  const moodAvg = r => (r.stats.moodN > 20 ? r.stats.moodSum / r.stats.moodN : null);
  const best = award('Опора поселения', r => worth(w, r), r => deeds(w, r).join(', ') || g(r, 'был рядом, когда это было нужно', 'была рядом, когда это было нужно'), 1);
  const awards = [
    best,
    award('Лучший охотник', r => r.stats.hunted, (r, v) => `${v} ${plural(v, 'заяц', 'зайца', 'зайцев')}`),
    award('Лесоруб', r => r.stats.gathered.wood || 0, (r, v) => `${v} ед. древесины`),
    award('Собиратель', r => r.stats.gathered.berries || 0, (r, v) => `${v} ед. ягод`),
    award('Каменотёс', r => r.stats.gathered.stone || 0, (r, v) => `${v} ед. камня`),
    award('Мастер', r => r.stats.crafted, (r, v) => `${v} ${plural(v, 'вещь', 'вещи', 'вещей')}`),
    award('Строитель', r => r.stats.labour, (r, v) => `${Math.round(v / 120)} ч на стройке`, 240),
    award('Защитник', r => r.stats.raiders + r.stats.wolves, r => [r.stats.raiders && `${r.stats.raiders} налётч.`, r.stats.wolves && `${r.stats.wolves} волк.`].filter(Boolean).join(', ')),
    award('Долгожитель', r => daysLived(w, r), (r, v) => `${daysText(v)} в поселении`),
    award('Живучий', r => r.stats.wounds, (r, v) => `${v} тяжёл. ${plural(v, 'рана', 'раны', 'ран')}`),
    award('Душа компании', r => (moodAvg(r) ?? -9) + 1, r => `чаще всех ${g(r, 'был', 'была')} в хорошем настроении`, 0.9),
    award('Вечно недовольный', r => (moodAvg(r) == null ? -9 : -moodAvg(r)) + 1, r => `чаще всех ${g(r, 'был', 'была')} не в духе`, 1.05),
  ].filter(Boolean);

  // facts worth telling
  const facts = [];
  const dead = people.filter(r => r.died != null).sort((a, b) => a.died - b.died);
  if (dead.length) facts.push(`Первой потерей ${g(dead[0], 'стал', 'стала')} ${dead[0].name} на ${dayNo(dead[0].died)}-й день: ${dead[0].cause}.`);
  const byCause = Object.entries(c.deaths).sort((a, b) => b[1] - a[1]);
  if (byCause.length) facts.push(`Погибли: ${byCause.map(([k, v]) => `${k === 'волки' ? 'от волков' : k === 'налётчики' ? 'от налётчиков' : 'от ' + k} — ${v}`).join(', ')}.`);
  if (c.biggestRaid) facts.push(`Самый большой налёт: ${c.biggestRaid.size} ${plural(c.biggestRaid.size, 'налётчик', 'налётчика', 'налётчиков')} на ${dayNo(c.biggestRaid.tick)}-й день.`);
  if (c.built.length) {
    const first = c.built[0], last = c.built[c.built.length - 1], nm = k => BUILDINGS.get(k).name.toLowerCase();
    facts.push(c.built.length > 1 ? `Первой постройкой ${BUILDINGS.get(first.key).gender === 'f' ? 'стала' : 'стал'} ${nm(first.key)} (день ${dayNo(first.tick)}), последней — ${nm(last.key)} (день ${dayNo(last.tick)}).`
      : `Успели построить только ${nm(first.key)}.`);
  }
  const wins = Object.entries(c.councilWins).sort((a, b) => b[1] - a[1])[0];
  if (c.councils) facts.push(`Совет у костра собирался ${c.councils} ${plural(c.councils, 'раз', 'раза', 'раз')}${wins ? `, чаще всего голосовали за ${BUILDINGS.get(wins[0]).name.toLowerCase()}` : ''}.`);
  const fav = Object.entries(c.crafted).sort((a, b) => b[1] - a[1])[0];
  if (fav) facts.push(`Чаще всего мастерили: ${ITEMS.get(fav[0]).short} (×${fav[1]}).`);
  if (w.stats.hunted) facts.push(`Охотники добыли ${w.stats.hunted} ${plural(w.stats.hunted, 'зайца', 'зайцев', 'зайцев')}${w.stats.wolfKills ? `, волки — ${w.stats.wolfKills}` : ''}.`);
  else if (w.stats.wolfKills) facts.push(`Волки съели ${w.stats.wolfKills} ${plural(w.stats.wolfKills, 'зайца', 'зайцев', 'зайцев')}, охотникам не досталось ни одного.`);
  const gathered = RESOURCES.filter(r => c.gathered[r.id]).map(r => `${r.label} — ${c.gathered[r.id]}`);
  if (gathered.length) facts.push(`Собрано: ${gathered.join(', ')}.`);
  if (w.stats.broken) facts.push(`Сломалось вещей: ${w.stats.broken}.`);
  if (w.stats.burntCells) facts.push(`Огонь выжег ${w.stats.burntCells} ${plural(w.stats.burntCells, 'клетку', 'клетки', 'клеток')} леса и луга.`);
  const likes = {};
  for (const r of people) if (r.likes) likes[r.likes] = (likes[r.likes] || 0) + 1;
  const topLike = Object.entries(likes).sort((a, b) => b[1] - a[1])[0];
  if (topLike) facts.push(`Любимое дело в поселении: ${JOBS.get(topLike[0]).label} (${topLike[1]} из ${people.length}).`);
  if (alive.length === 1) facts.push(`Последним ${g(alive[0], 'держался', 'держалась')} ${alive[0].name}.`);

  const roll = people.map(r => ({
    name: r.name, founder: r.founder, arrivedDay: dayNo(r.arrived), lived: daysLived(w, r),
    fate: r.died != null ? r.cause : (r.gender === 'f' ? 'выжила' : 'выжил'), dead: r.died != null, deeds: deeds(w, r),
  }));

  return {name: w.cfg.name, reason: w.over?.reason, days, totals, awards, facts, roll};
}

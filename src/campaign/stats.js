// The fights of a campaign, summed up (docs/CAMPAIGN.md «Статистика боёв»): what K.fights holds (campaign/fight.js
// recordFight — every fight with who came, who fell and fled, the two sides' strength, the boss and its fate), read
// as totals, by the years of the walk, by the caravan's people, and the named fights apart — the graves' guards,
// the fourth's lair, the leaders of the old lairs: the fights the walk is about.
import {YEAR_DAYS} from '../data/atlas.js';
import {FOES} from '../data/campaign.js';
import {SPECIES} from '../data/species.js';

const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
const avg = (xs, f) => (xs.length ? sum(xs, f) / xs.length : 0);
const r1 = v => Math.round(v * 10) / 10;
export const FATES = {absent: 'не явился', dead: 'убит', bound: 'связан', fled: 'бежал', stood: 'устоял'};
export const HOWS = {night: 'ночной бой', ambush: 'засада', guard: 'штурм', stop: 'стоянка'};

// the ratio of the caravan's strength to the foe's, where both are known
const ratio = f => (f.ours > 0 && f.theirs > 0 ? f.ours / f.theirs : null);
const withRatio = xs => xs.filter(f => ratio(f) != null);

// everything at once → {total, byKind, byYear, byMember, named}
export function fightStats(K) {
  const F = K.fights || [];
  const known = F.filter(f => f.foes != null);
  const total = {fights: F.length, won: F.filter(f => f.won).length, ambushes: F.filter(f => f.how === 'ambush').length, storms: F.filter(f => f.how === 'guard').length,
    foes: sum(known, f => f.foes), killed: sum(known, f => f.killed), fled: sum(known, f => f.fled), taken: sum(known, f => f.taken),
    fighters: r1(avg(F, f => f.fighters)), foesAvg: r1(avg(known, f => f.foes)), ratio: r1(avg(withRatio(F), ratio)),
    fell: sum(F, f => f.fell.length), hurt: sum(F, f => f.hurt.length), named: F.filter(f => f.boss).length};
  const byKind = Object.keys(FOES).map(k => F.filter(f => f.kind === k)).filter(xs => xs.length).map(xs => ({kind: xs[0].kind, label: FOES[xs[0].kind].label,
    fights: xs.length, won: xs.filter(f => f.won).length, foes: r1(avg(xs.filter(f => f.foes != null), f => f.foes)), killed: sum(xs, f => f.killed), fled: sum(xs, f => f.fled), ratio: r1(avg(withRatio(xs), ratio))}));
  const years = Math.max(1, Math.ceil((K.day + 1) / YEAR_DAYS));
  const byYear = Array.from({length: years}, (_, y) => {
    const xs = F.filter(f => Math.floor(f.day / YEAR_DAYS) === y);
    return {year: y + 1, fights: xs.length, won: xs.filter(f => f.won).length, foes: sum(xs, f => f.foes), killed: sum(xs, f => f.killed), fled: sum(xs, f => f.fled), ratio: r1(avg(withRatio(xs), ratio)), fell: sum(xs, f => f.fell.length), named: xs.filter(f => f.boss).length};
  });
  const members = {};
  const at = name => (members[name] ||= {name, fights: 0, kills: 0, hurt: 0, fell: false});
  for (const f of F) {
    for (const [name, n] of Object.entries(f.kills || {})) { at(name).kills += n; }
    for (const name of f.hurt) at(name).hurt++;
    for (const name of f.fell) at(name).fell = true;
  }
  // how many fights each one stood in: everyone alive and free at the time (the record keeps the count, not the names)
  for (const m of K.members) { const mm = at(m.name), gone = m.died?.day ?? m.left?.day; mm.role = m.role; mm.race = m.race; mm.alive = m.alive; mm.fights = F.filter(f => f.day >= (m.joined || 0) && (gone == null || f.day <= gone)).length; }   // (to the day one fell or left: deserted, sold, ran)
  const byMember = Object.values(members).sort((p, q) => q.kills - p.kills || q.fights - p.fights);
  const named = F.filter(f => f.boss).map(f => ({...f, ratio: ratio(f), guards: f.foes != null ? Math.max(0, f.foes - (f.boss.came ? 1 : 0)) : null}));
  return {total, byKind, byYear, byMember, named};
}

// the composition of a foe group in words: «варги 3, гоблины 2»
export const groupText = species => Object.entries(species || {}).map(([id, n]) => `${SPECIES.has(id) ? SPECIES.get(id).plural : id} ${n}`).join(', ');

// the statistics as a text file
export function fightReportText(a, K) {
  const S = fightStats(K), T = S.total, out = [];
  out.push(`Бои похода из ${K.capitalFrom || K.capitalName}: ${T.fights} (выиграно ${T.won}, засад ${T.ambushes}, штурмов ${T.storms}), именных ${T.named}`);
  out.push(`Зелий лечения выпито ${K.stats.potions || 0}, сварено ${K.stats.brewed || 0}.`);
  out.push(`Врагов пришло ${T.foes} (в среднем ${T.foesAvg} на бой против ${T.fighters} наших), убито ${T.killed}, бежали ${T.fled}, в плен ${T.taken}; наша сила к их силе в среднем ${T.ratio}; пали наши ${T.fell}, ранены ${T.hurt} раз.`);
  out.push('', 'По родам врага:');
  for (const k of S.byKind) out.push(`  ${k.label}: боёв ${k.fights}, выиграно ${k.won}, врагов в среднем ${k.foes}, убито ${k.killed}, бежали ${k.fled}, сила ${k.ratio}`);
  out.push('', 'По годам похода: год · боёв · выиграно · врагов · убито · бежали · наша/их сила · пали наши · именных');
  for (const y of S.byYear) out.push(`  ${y.year} · ${y.fights} · ${y.won} · ${y.foes} · ${y.killed} · ${y.fled} · ${y.ratio || '—'} · ${y.fell} · ${y.named}`);
  out.push('', 'По людям: кто · боёв · убил · ранен раз');
  for (const m of S.byMember) out.push(`  ${m.name} (${m.role || '—'}${m.alive === false ? ', пал' : ''}) · ${m.fights} · ${m.kills} · ${m.hurt}`);
  out.push('', 'Именные бои:');
  for (const f of S.named) out.push(`  день ${f.day}, ${HOWS[f.how] || f.how}: ${f.boss.name} (${SPECIES.has(f.boss.species) ? SPECIES.get(f.boss.species).label : f.boss.species}${f.boss.mustDie ? ', четвёртый' : ''}) — ${FATES[f.boss.fate]}${f.boss.hp != null && f.boss.fate !== 'dead' ? `, здоровье ${Math.round(f.boss.hp * 100)}%` : ''}; свита ${f.guards ?? '?'} [${groupText(f.species)}], убито ${f.killed ?? '?'}, бежали ${f.fled ?? '?'}; сила ${f.ours?.toFixed(1) ?? '?'} против ${f.theirs?.toFixed(1) ?? '?'}; ${f.won ? 'победа' : 'отбиты'}${f.fell.length ? `, пали ${f.fell.join(', ')}` : ''}${f.hurt.length ? `, ранены ${f.hurt.join(', ')}` : ''}`);
  if (!S.named.length) out.push('  не было');
  return out.join('\n');
}

// ── the walk summed up (docs/CAMPAIGN.md «Итоги похода»): every counter of K.stats, the company and the quest, in
// sections of [label, value] — the dock's «Итоги» tab (live while the walk goes, opened by itself when it ends) and
// «Итоги в файл». Counters a walk has not touched show as 0, so two walks read alike.
const END = {won: 'вернулись с короной', lost: 'погибли все восемь', timeout: 'срок вышел — не вернулись'};
const CROWN = {carried: 'несут', taken: 'у врагов', lost: 'пропала'};
export function walkStats(a, K) {
  const s = K.stats || {}, v = k => s[k] || 0, ms = K.members || [];
  const core = ms.filter(m => m.core), years = r1(K.day / YEAR_DAYS);
  const fell = ms.filter(m => m.died), left = ms.filter(m => !m.alive && !m.died && !m.left?.escaped && !m.captive);
  const here = ms.filter(m => m.alive && !m.captive), captives = ms.filter(m => m.alive && m.captive);
  const out = [];
  out.push({title: 'Поход', rows: [
    ['Итог', K.phase === 'won' && K.done?.length ? `исполнили поручений: ${K.done.length} — и вернулись` : K.phase === 'won' && K.quest?.how === 'lair' ? 'поручение исполнено' : K.phase === 'home' ? 'поручение сдано — ждут в столице' : END[K.phase] || 'в пути'],   // (an errand's words: campaign/errands.js)
    ['В пути', `${K.day} дн. (${years} г.)`],
    ['Пройдено', `${Math.round(s.walked || 0)} клеток`],
    ['Стоянок', `${v('camps')}, дней на стоянке ${v('stopDays')}`],
    ['В городах', `${v('towns')} раз, нанимались на работу ${v('worked')}`],
    ['Голодных дней', `${v('hungryDays')}, кормили даром ${v('alms')} раз`],
    ['Бросили повозки', v('left')],
    ['Переправ через воду', `${v('ferries')}${K.ferry ? (K.ferry.state === 'aboard' ? ' — сейчас на борту' : K.ferry.state === 'landed' ? ' — лодка заберёт из бухты высадки' : ' — идут к лодке') : ''}`],
  ]});
  if (K.quest) {
    const Q = K.quest, C = Q.crown;
    const lair = Q.how === 'lair';
    out.push({title: lair ? 'Поручение' : 'Корона', rows: [
      ...(K.done?.length ? [['Исполнено', K.done.map(d => d.label).join(', ')]] : []),
      [lair ? 'Трофей' : 'Корона', `${Q.name}: ${CROWN[C.state] || (C.exact || C.seen ? 'известно где' : C.area ? 'известен круг' : 'где — неизвестно')}`],
      ['Следы', `найдено ${Q.found} из ${Q.clues.length}`],
      ['Слухов', v('rumours')], ['Штурмов', v('storms')], ['Погонь', v('pursuers')],
    ]});
  }
  out.push({title: 'Отряд', rows: [
    ['Вышли', `${core.length}, в строю из них ${core.filter(m => m.alive).length}`],
    ['Сейчас в отряде', `${here.length}${captives.length ? `, пленных ${captives.length}` : ''}`],
    ['Пали', fell.length ? `${fell.length}: ${fell.map(m => m.name).join(', ')}` : 0],
    ['Ушли', `${left.length}, из них дезертиров ${v('deserted')}`],
    ['Наёмники', `остались без платы ${v('stayed')}, продлили ${v('extended')}, ушли — не было места ${v('stayFull')}`],
    ['Бывшие пленные в отряде', v('formerMembers')],
  ]});
  out.push({title: 'Встречи и бои', rows: [
    ['Боёв', `${v('fights')}, отбились ${v('won')}, отступили ${v('fled')}, засад ${v('ambushes')}`],
    ['Главарей логов', v('leaders')],
    ['Встречено угроз', `${v('met')} в пути, ${v('strays')} ночью, мелких ${v('small')}; заметили караван ${v('noticed')} раз`],
    ['Ушли от угрозы', v('evaded')],
    ['Торговых обозов', v('trains')],
    ['Зелий', `сварено ${v('brewed')}, выпито ${v('potions')}`],
  ]});
  out.push({title: 'Добыча и хозяйство', rows: [
    ['Находки', `${v('finds')}, кладов ${v('treasures')}`],
    ['Стад добыто', v('herds')], ['Приручено', v('tamed')], ['Построено', v('built')],
    ['Добыто на стоянках', v('dug')], ['Намыто золота', `${r1(v('panned'))} зол.`],
    ['Сковано в кузнях', v('forged')], ['Казна', `${K.gold} зол.`],
  ]});
  out.push({title: 'Пленные', rows: [
    ['Взято', v('captives')], ['Бежали', v('escaped')], ['Пойманы при побеге', v('caught')], ['Выдали сговор', v('told')],
    ['Отпущены на волю', v('freed')], ['Продано', v('sold')], ['Куплено', v('bought')],
  ]});
  return out;
}
export const walkReportText = (a, K) => [`Итоги похода из ${K.capitalFrom || K.capitalName}`,
  ...walkStats(a, K).flatMap(S => ['', `${S.title}:`, ...S.rows.map(([l, x]) => `  ${l}: ${x}`)])].join('\n');

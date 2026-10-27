// The cards of the local map (the observer's dock «Объект», docs/GAME.md «Управление»): a creature, a colonist, a
// building, a cell — what it is, what it has, and what it thinks (agents' `why`: the choice, the runner-up, what woke
// it). Built once for the settlement screen of old, used by the camps of the campaign (ui/campaignView.js).
import {hpShare} from '../agents/agent.js';
import {POTION} from '../data/potions.js';
import {captiveText} from '../settlement/captives.js';
import {masterTitle} from '../settlement/masters.js';
import {formerText} from '../settlement/freedom.js';
import {RESOURCES} from '../data/resources.js';
import {FOODS} from '../data/foods.js';
import {CROPS} from '../data/crops.js';
import {WALKABLE} from '../data/terrain.js';
import {lotFertility} from '../settlement/buildings.js';
import {OUTCOMES} from '../agents/lifecycle.js';
import {goodsUnits} from '../settlement/trade.js';
import {RECIPES} from '../data/recipes.js';
import {oreOf} from '../world/ores.js';
import {furnacePick} from '../settlement/stock.js';
import {fuelReserve} from '../settlement/buildings.js';
import {NEEDS} from '../data/needs.js';
import {JOBS} from '../data/jobs.js';
import {TRAITS} from '../data/traits.js';
import {SPECIES} from '../data/species.js';
import {BUILDINGS} from '../data/buildings.js';
import {clockStr, dayOf} from '../core/time.js';
import {esc, clamp, plural} from '../core/util.js';
import {colonists, has} from '../settlement/query.js';
import {taskLabel} from '../agents/tasks.js';
import {cellOf} from '../world/grid.js';
import {BY_CODE} from '../data/terrain.js';
import {ITEMS, SLOTS} from '../data/items.js';
import {gearText, def as itemDef} from '../agents/equipment.js';
import {orderText, craftContext} from '../settlement/crafting.js';
import {moodOf, moodLabel, wishes} from '../agents/mind.js';
import {councilWish} from '../settlement/council.js';
import {boldness} from '../agents/hunting.js';
import {STATS} from '../data/special.js';
import {WOUNDS} from '../data/wounds.js';
import {conditionsOf} from '../data/conditions.js';
import {AFFLICTIONS} from '../data/afflictions.js';
import {activeSkills, TIERS} from '../data/skills.js';
import {skillTier, softCap, canMake, recipeNeed, reasonText, recipeAccess, jobAccess, actionAccess} from '../agents/skills.js';
import {VALUES, axisWord, alignLabel} from '../data/values.js';
import {opinionWord} from '../data/relations.js';
import {feelings, history} from '../settlement/relations.js';
import {squadText, fighterLabel} from '../agents/squad.js';
import {huntOf, carcassById, ROLE_LABEL} from '../agents/carcass.js';
import {raceLabel, innateOf, limits, peopleOf} from '../agents/special.js';
import {RAID_BANDS} from '../data/raids.js';
import {tempAt} from '../world/heat.js';
import {DAY, HOUR} from '../core/time.js';
import {FURNITURE, FURNISH_MAX} from '../data/furniture.js';
import {statusOf} from '../settlement/life.js';
import {herd, beastText, penRoom, penSpace, isTameable} from '../settlement/herd.js';
import {herdOf, herdAlarm, stragglerOf} from '../agents/wildHerd.js';
import {WOODS, STONES} from '../data/kinds.js';
import {STANDINGS} from '../agents/standing.js';

const soilWord = f => (f < 0.3 ? 'тощая' : f < 0.5 ? 'средняя' : f < 0.7 ? 'добрая' : 'жирная');
const bar = (v, c) => `<div class="bar"><i style="width:${(clamp(v, 0, 1) * 100).toFixed(0)}%;background:${c}"></i></div>`;

// SPECIAL as seven small cells; the tooltip gives the race's limits
function specialHtml(a) {
  if (!a.special) return '';
  const sp = SPECIES.get(a.species), lim = limits(sp, peopleOf(sp, a));
  return `<div class="spc">${STATS.all().map(s => `<span title="${s.label}: ${s.note}. У этой расы ${lim[s.id][0]}–${lim[s.id][1]}"><b>${a.special[s.id]}</b>${s.short}</span>`).join('')}</div>`;
}

// Skills grouped by their SPECIAL letter: value, the soft ceiling the letter sets (10 × letter) and the
// highest tier of actions it opens. The liked job's skill is marked.
function skillsHtml(a) {
  if (!a.skill) return '';
  const liked = JOBS.get(a.likes)?.skill, disliked = JOBS.get(a.dislikes)?.skill;
  return STATS.all().map(st => {
    const list = activeSkills().filter(s => s.stat === st.id);
    if (!list.length) return '';
    const v = a.special?.[st.id], tier = skillTier(a, list[0].id), cap = Math.round(softCap(a, list[0].id) * 100);
    const chips = list.map(s => [s, a.skill[s.id] || 0]).sort((x, y) => y[1] - x[1]).map(([s, x]) => {
      const n = Math.round(x * 100), top = n >= cap && cap < 100;
      return `<span class="chip${s.id === liked ? ' like' : s.id === disliked ? ' dislike' : ''}" title="${s.label}: ${n} из 100${top ? '; выше потолка учится медленно' : ''}">${s.short} ${n}${top ? '·' : ''}</span>`;
    }).join('');
    return `<div class="sk-row"><span class="sk-stat" title="${st.label} ${v ?? '—'}: потолок навыков ${cap}, доступно до «${TIERS[tier - 1].label}» (T${tier})">${st.short}${v != null ? ' ' + v : ''} · T${tier}</span><div class="chips">${chips}</div></div>`;
  }).join('');
}

// a deadly wound and what it left (agents/wounds.js): bleeding now, a grave wound healing, traumas for life
function woundsHtml(w, a) {
  const out = [];
  if (a.master) out.push(`<span class="chip like" title="Назван советом; при нём ученики">${masterTitle(a)}</span>`);
  if (a.task?.id === 'assist') out.push(`<span class="chip" title="Помогает мастеру и учится">ученик мастера</span>`);
  if (a.former) out.push(`<span class="chip" title="Путы сняты; без оружия, без места на совете">${formerText(a)}</span>`);
  if (a.captive) out.push(`<span class="chip dislike" title="Без оружия, за периметр нельзя, на совет не ходит">${captiveText(w, a)}</span>`);
  if (a.downed) out.push(`<span class="chip dislike" title="Без помощи умрёт">без сознания: ${Math.max(0, Math.ceil((a.downed.until - w.tick) / HOUR * 10) / 10)} ч до смерти</span>`);
  for (const x of a.wounds || []) {
    const W = WOUNDS.get(x.id);
    const left = x.until != null ? `, заживёт через ${Math.max(1, Math.ceil((x.until - w.tick) / DAY))} дн.` : '';
    out.push(`<span class="chip${W.trauma ? ' dislike' : ''}" title="${esc(W.label)}: ${esc(W.note)}${left}">${esc(W.label)}</span>`);
  }
  // the passing states and exhaustion (data/conditions.js); the fall and the wounds are shown above
  for (const {row, ill} of conditionsOf(w, a)) {
    if (!(row.kind === 'state' && row.id !== 'downed' || row.kind === 'exhaustion' || row.kind === 'taint')) continue;
    const label = ill ? `${AFFLICTIONS.get(ill.id).label}: ${AFFLICTIONS.get(ill.id).stages[ill.stage - 1].label}` : row.label;
    out.push(`<span class="chip dislike" title="${esc(label)}: ${esc(row.note)}">${esc(label)}</span>`);
  }
  return out.length ? `<div class="chips">${out.join('')}</div>` : '';
}

// what this colonist may not do yet and why: tiered recipes, jobs and parts of jobs (agents/skills.js),
// nearest first (smallest gap to the letter)
function lockedHtml(a) {
  if (!a.special || !a.prefs) return '';
  const all = [
    ...RECIPES.all().map(r => [(r.makes.item ? ITEMS.get(r.makes.item).short : RESOURCES.get(r.makes.resource).short) + (r.makes.silver ? ' посеребр.' : ''), recipeAccess(a, r)]),
    ...JOBS.all().filter(j => j.tier > 1).map(j => [j.label, jobAccess(a, j)]),
    ...JOBS.all().filter(j => j.tendTier).map(j => ['лечить в хижине', actionAccess(a, j.skill, j.tendTier)]),
    ...JOBS.all().filter(j => j.riskyTier).map(j => ['охотиться на крупного зверя', actionAccess(a, j.skill, j.riskyTier)]),
    ...SPECIES.filter(sp => sp.tame?.tier > 1).map(sp => ['приручать: ' + sp.label, actionAccess(a, 'husbandry', sp.tame.tier)]),
  ].filter(([, r]) => !r.ok).map(([what, r]) => [what, r.reasons[0]]);
  if (!all.length) return '<p class="muted pc-small">Доступно всё, что есть в поселении.</p>';
  all.sort((x, y) => (x[1].need - x[1].have) - (y[1].need - y[1].have));
  const seen = new Set(), rows = [];
  for (const [what, why] of all) { if (seen.has(what)) continue; seen.add(what); rows.push(`<li title="T${why.tier}">${esc(what)}: ${reasonText(why)}</li>`); if (rows.length >= 6) break; }
  return `<ul class="pc-list">${rows.join('')}</ul>${all.length > rows.length ? `<p class="muted pc-small">и ещё ${all.length - rows.length}</p>` : ''}`;
}

const raceOf = a => raceLabel(SPECIES.get(a.species), a);



export function where(w, a) {
  const i = cellOf(w, a), dc = w.nav.get('camp')[i];
  if (dc < 3) return 'у костра';
  if (w.zone[i]) return 'в поселении';
  const d = Math.round(Math.hypot(a.x - w.camp.x, a.y - w.camp.y));
  return `в ${d} ${plural(d, 'клетке', 'клетках', 'клетках')} от лагеря`;
}

export function whyHtml(w, a) {
  if (a.downed) return '';   // senseless: no choice to explain (agents/wounds.js)
  const y = a.why, rows = [];
  const ago = t => { const m = w.tick - t; return m < HOUR ? `${Math.max(1, Math.round(m / HOUR * 60))} мин назад` : m < DAY ? `${Math.round(m / HOUR)} ч назад` : `${Math.floor(m / DAY)} дн. назад`; };
  if (y) {
    if (y.woke) rows.push(`<dt>Задумался</dt><dd>${ago(y.t)}: ${esc(y.woke)}</dd>`);
    rows.push(`<dt>Выбор</dt><dd><b>${esc(y.task)}</b> (${y.score})${y.why ? ` — ${esc(y.why)}` : ''}${y.kept ? '; продолжает начатое' : ''}</dd>`);
    if (y.alt) rows.push(`<dt>Второе</dt><dd class="alt">${esc(y.alt)} (${y.altScore})${y.altWhy ? ` — ${esc(y.altWhy)}` : ''}</dd>`);
  }
  if (a.route && w.tick - a.route.t < 30) rows.push(`<dt>Путь</dt><dd>${esc(a.route.how)}</dd>`);
  if (a.lastStop) rows.push(`<dt>${a.lastStop.outcome === 'interrupted' ? 'Прервал' : 'Бросил'}</dt><dd>«${esc(a.lastStop.task)}» ${ago(a.lastStop.t)}${a.lastStop.outcome && a.lastStop.outcome !== 'interrupted' ? ` (${OUTCOMES[a.lastStop.outcome].label})` : ''}: ${esc(a.lastStop.why)}</dd>`);
  return rows.length ? `<dl class="kv why">${rows.join('')}</dl>` : '';
}

export function creatureHtml(w, a) {
  const sp = SPECIES.get(a.species), T = tempAt(w, cellOf(w, a)).toFixed(1);
  const rows = [`<dt>Сейчас</dt><dd>${taskLabel(a)}, ${where(w, a)}</dd>`, `<dt>Здоровье</dt><dd>${Math.round(hpShare(a) * 100)}%${a.potions ? ` · зелий лечения ${a.potions}` : ''}</dd>`];
  if (a.band) rows.push(`<dt>Кто</dt><dd>${RAID_BANDS.get(a.band).label}; ${{mindless: 'безмозглый', beast: 'неразумен', semi: 'полуразумен', sentient: 'разумен'}[sp.mind]}</dd>`);
  const herd = herdOf(w, a);
  if (herd) rows.push(`<dt>Стадо</dt><dd>${herd.n} ${herd.n > 1 ? sp.plural || sp.label : sp.label}${herdAlarm(w, herd) ? ', настороже' : ''}; ${a.nerve == null ? '' : a.nerve < 0.85 ? 'пугливый' : a.nerve > 1.15 ? 'невозмутимый' : 'спокойный'}${stragglerOf(w, a) ? ', отстаёт' : ''}</dd>`);
  const h = huntOf(w, a);
  if (h) { const prey = w.agents.find(o => o.id === h.prey); rows.push(`<dt>Охота</dt><dd>стаей на ${prey ? (SPECIES.get(prey.species).labelAcc || SPECIES.get(prey.species).label) : '—'}${prey?.name && prey.faction === 'colony' ? ` (${esc(prey.name)})` : ''}: ${ROLE_LABEL[h.roles[a.id]] || 'в погоне'}; ${h.members.length} в стае; ${w.tick - h.seen.t < 5 ? 'добыча на виду' : `из виду ${w.tick - h.seen.t} ${plural(w.tick - h.seen.t, 'тик', 'тика', 'тиков')}`}</dd>`); }
  if (a.task?.id === 'feed' && a.task.c != null) { const c = carcassById(w, a.task.c); if (c) rows.push(`<dt>Туша</dt><dd>${SPECIES.get(c.species).label}: осталось ${Math.round(c.food / c.food0 * 100)}%</dd>`); }
  const sq = squadText(w, a);
  if (sq) rows.push(`<dt>Отряд</dt><dd>${esc(sq)}</dd>`);
  if (a.special) rows.push(`<dt>Тело</dt><dd>${specialHtml(a)}</dd>`);
  const inn = innateOf(sp, a);
  if (inn.length) rows.push(`<dt>Особое</dt><dd>${inn.map(t => `<span class="chip" title="${esc(t.note)}">${t.label}</span>`).join(' ')}</dd>`);
  if (a.brain === 'trader' && w.caravan?.traderId === a.id) {
    const c = w.caravan;
    rows.push(`<dt>Караван</dt><dd>${goodsUnits(c.goods)} мест груза, ${Math.floor(c.purse)} зол. в кошельке</dd>`);
  }
  if (a.tame) rows.push(`<dt>Хозяйство</dt><dd>${beastText(w, a)}</dd>`);
  else if (isTameable(a)) rows.push(`<dt>Можно приручить</dt><dd>скотнику с приманкой: ${Object.entries(sp.tame.bait).map(([r, v]) => `${RESOURCES.get(r).label} ${v}`).join(', ')}${has(w, 'pen') ? '' : '; сначала нужен загон'}</dd>`);
  if (a.owner != null) rows.push(`<dt>Поклажа</dt><dd>${a.load || 0} из 20 (два ящика по 10)</dd>`);
  if (sp.mule && a.owner == null) rows.push(`<dt>Нрав</dt><dd>${a.task?.mule ? 'в ярости' : 'спокоен'}; охотиться опасно</dd>`);
  if (sp.predator) {
    const b = boldness(a, sp.predator);
    rows.push(`<dt>Голод</dt><dd>${a.needs.food > 0.7 ? 'сыт' : a.needs.food > 0.35 ? 'голоден' : 'изголодался'} (${Math.round(a.needs.food * 100)}%)</dd>`,
      `<dt>Дерзость</dt><dd>${b < 0.2 ? 'осторожен' : b < 0.6 ? 'смелеет' : 'безрассуден'}</dd>`);
  }
  if (a.equip) rows.push(`<dt>Снаряжение</dt><dd>${gearText(a)}</dd>`);
  if (a.route && w.tick - a.route.t < 30) rows.push(`<dt>Путь</dt><dd>${esc(a.route.how)}</dd>`);
  rows.push(`<dt>Под ногами</dt><dd>${T} °C</dd>`);
  const who = a.brain === 'trader' || a.brain === 'guard' ? STANDINGS[a.brain].label : a.tame ? `${sp.label}, ${sp.id === 'goat' ? 'своя' : 'свой'}` : raceOf(a);
  const whoFull = fighterLabel(w, a, who);   // in a band: «гоблин-стрелок-грабитель»
  const title = a.name.toLowerCase() !== who ? `${esc(a.name)}, ${esc(whoFull)}` : whoFull[0].toUpperCase() + esc(whoFull.slice(1));
  return `<div class="pc-head"><h3>${title}</h3></div><dl class="kv">${rows.join('')}</dl>${whyHtml(w, a)}`;   // the beast's choice too (agents/brains/tabled.js a.why)
}

export function personHtml(w, a) {
  const sp = SPECIES.get(a.species), mood = moodOf(w, a);
  const traits = a.traits.map(id => `<span class="chip">${TRAITS.get(id).label}</span>`).join('');
  const fresh = a.diary.filter(e => e.until > w.tick && e.mood !== 0).sort((x, y) => Math.abs(y.mood) - Math.abs(x.mood)).slice(0, 2);
  const moodPct = Math.round((mood + 1) * 50);
  const needs = sp.needs.map(id => { const n = NEEDS.get(id); return `<div class="pc-bar"><span>${n.label}</span>${bar(a.needs[id], n.color)}<b>${Math.round(a.needs[id] * 100)}</b></div>`; }).join('') +
    `<div class="pc-bar"><span>здоровье</span>${bar(hpShare(a), 'var(--good)')}<b>${Math.round(hpShare(a) * 100)}</b></div>` +
    (a.potions ? `<div class="pc-bar"><span>зелья лечения</span>${bar(a.potions / POTION.slot, '#d8506a')}<b>${a.potions}</b></div>` : '');
  const inn = innateOf(sp, a).map(t => `<span class="chip race" title="${esc(t.note)}">${t.label}</span>`).join('');
  const vals = (a.values || []).map(id => `<span class="chip">${VALUES.get(id).label}</span>`).join('');
  const feel = feelings(w, a), strong = [...feel.filter(([, v]) => v <= -1.5).slice(0, 3), ...feel.filter(([, v]) => v >= 1.5).slice(-3).reverse()];
  const feelHtml = strong.length ? `<ul class="pc-list">${strong.map(([b, v]) => `<li class="${v < 0 ? 'down' : 'up'}"${Math.abs(history(a, b)) >= 0.3 ? ` title="личный опыт: ${history(a, b) > 0 ? '+' : ''}${history(a, b).toFixed(1)}"` : ''}>${opinionWord(v)} ${esc(b.name)}${b.species !== a.species ? ` (${raceOf(b)})` : ''}${history(a, b) >= 0.8 ? ' · многое вместе' : history(a, b) <= -0.8 ? ' · старые обиды' : ''}</li>`).join('')}</ul>` : '<p class="muted pc-small">Ни с кем особо не сошёлся и не повздорил.</p>';
  const body = sp.body ? `${raceOf(a)[0].toUpperCase() + raceOf(a).slice(1)}: взрослеют к ${sp.body.adult}, живут до ${sp.body.life} лет; ${sp.body.diet}.` : '';
  const want = wishes(w, a, councilWish(w, a));
  const slots = SLOTS.map(s => {
    const it = a.equip?.[s.id];
    const txt = it ? itemDef(it).short + (Number.isFinite(it.dur) ? ` · ${Math.max(0, Math.round(it.dur / itemDef(it).dur * 100))}%` : '') + (it.ammo != null ? ` · стрел ${it.ammo}` : '') : '—';
    return `<dt>${s.label}</dt><dd class="q${it?.q || 0}"${it?.q ? ` title="${itemDef(it).rank}${it.maker ? ', работа: ' + esc(it.maker) : ''}"` : ''}>${esc(txt)}</dd>`;
  }).join('');
  const today = dayOf(w.tick);
  let lastDay = null;
  const diary = a.diary.slice(0, 14).map(e => {
    const d = dayOf(e.t), head = d !== lastDay ? `<li class="dday">${d === today ? 'Сегодня' : d === today - 1 ? 'Вчера' : 'День ' + (d + 1)}</li>` : '';
    lastDay = d;
    const hh = clockStr(e.t).split(', ')[1];
    return `${head}<li class="${e.mood > 0 ? 'up' : e.mood < 0 ? 'down' : ''}"><span>${hh}</span>${esc(e.text)}</li>`;
  }).join('');
  return `<div class="pc-head"><h3>${esc(a.name)}</h3><span class="pc-mood m${mood > 0.15 ? 'up' : mood < -0.15 ? 'down' : 'mid'}">${moodLabel(a, mood)}</span>
      </div>
    <p class="pc-now">Сейчас ${taskLabel(a)}, ${where(w, a)}.${fresh.length ? ' На душе: ' + fresh.map(e => esc(e.text.replace(/[.!…]+$/, '')).replace(/^./, ch => ch.toLowerCase())).join('; ') + '.' : ''}</p>
    ${whyHtml(w, a)}
    <div class="pc-grid">
      <section><h4>Характер</h4>
        <p class="pc-small">Любит ${JOBS.get(a.likes).label}, не любит ${JOBS.get(a.dislikes).label}.</p>
        ${a.food ? `<p class="pc-small">Любимая еда: ${FOODS.get(a.food.likes).label}${a.food.dislikes ? `, не любит: ${FOODS.get(a.food.dislikes).label}` : ''}.</p>` : ''}
        <div class="chips">${traits || '<span class="muted pc-small">ничем особым не выделяется</span>'}</div>
        <h4>Настроение</h4><div class="pc-moodbar"><i style="left:${moodPct}%"></i></div>
        <h4>Самочувствие</h4>${needs}
      </section>
      <section><h4>Природа</h4>
        <p class="pc-small">${body}</p>
        ${specialHtml(a)}
        ${inn ? `<div class="chips">${inn}</div>` : ''}
        ${woundsHtml(w, a)}
        <h4>Мировоззрение</h4>
        ${a.align ? `<p class="pc-small"><b>${alignLabel(a.align, a.gender === 'f' ? 'f' : 'm')}</b> · ${axisWord('order', a.align.order)} · ${axisWord('mercy', a.align.mercy)}</p>` : ''}
        ${vals ? `<div class="chips">${vals}</div>` : ''}
        <h4>Соседи</h4>${feelHtml}
      </section>
      <section><h4>Хочет</h4>${want.length ? `<ul class="pc-list">${want.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted pc-small">Всем доволен.</p>'}
        <h4>Снаряжение</h4><dl class="kv">${slots}</dl>
        <h4>Навыки</h4>${skillsHtml(a)}
        <h4>Пока не по силам</h4>${lockedHtml(a)}
      </section>
      <section><h4>Дневник</h4><ul class="pc-diary">${diary || '<li class="muted">Пока ничего.</li>'}</ul></section>
    </div>`;
}

export function buildingHtml(w, b) {
  const d = BUILDINGS.get(b.key);
  const state = b.done ? 'построено' : `строится ${Math.floor(b.progress / d.work * 100)}%`;
  const rows = [`<dt>Состояние</dt><dd>${state}</dd>`, `<dt>Цена</dt><dd class="nb">${Object.entries(d.cost).map(([r, v]) => `${v} ${RESOURCES.get(r).label}`).join(', ')}</dd>`];
  // what it was built of (data/kinds.js, settlement/kinds.js)
  if (b.stone || b.wood) rows.push(`<dt>Из чего</dt><dd>${[b.stone && STONES.has(b.stone) ? `камень — ${STONES.get(b.stone).label} (прочность ×${STONES.get(b.stone).dur})` : '', b.wood && WOODS.has(b.wood) ? `дерево — ${WOODS.get(b.wood).label}` : ''].filter(Boolean).join(', ')}</dd>`);
  let extra = '';
  if (d.soil) {
    const f = lotFertility(w, b.x, b.y, b.w || 2, b.h || 2);
    rows.push(`<dt>Почва</dt><dd>${Math.round(f * 100)}% · ${soilWord(f)} (урожай ×${(0.4 + 1.2 * f).toFixed(2)})</dd>`);
  }
  if (b.plots && b.key === 'field') {
    const by = {}; let empty = 0, ripe = 0;
    for (const p of b.plots) { if (!p.crop) empty++; else { by[p.crop] = (by[p.crop] || 0) + 1; if (p.g >= 1) ripe++; } }
    const growing = Object.entries(by).map(([c, n]) => `${CROPS.get(c).label} ${n}`).join(', ');
    const avg = b.plots.filter(p => p.crop).reduce((s, p) => s + p.g, 0) / Math.max(1, b.plots.length - empty);
    rows.push(`<dt>Грядки</dt><dd>${b.plots.length}: ${growing || 'ничего не посеяно'}${empty ? `, пустых ${empty}` : ''}</dd>`,
      `<dt>Урожай</dt><dd>${ripe ? `созрело ${ripe}` : growing ? `зреет, ${Math.round(avg * 100)}%` : '—'}</dd>`,
      `<dt>Семена</dt><dd>${CROPS.all().map(c => `${c.label} ${Math.floor(w.stock[c.seed] || 0)}`).join(', ')}</dd>`);
  }
  if (d.key) rows.push(`<dt>Инструмент</dt><dd>${RESOURCES.get(d.key).label} (куплен у торговца)</dd>`);
  if (d.furnish && b.done) {
    const by = {}; for (const id of b.furniture || []) by[id] = (by[id] || 0) + 1;
    const items = Object.entries(by).map(([id, n]) => FURNITURE.get(id).label + (n > 1 ? ' ×' + n : ''));
    const st = statusOf(b);
    const what = b.key === 'house' ? 'сон здесь лучше для настроения' : b.key === 'shrine' ? 'молитва утешает сильнее' : d.station || b.key === 'healerhut' ? `работа здесь быстрее на ${Math.round(st * 100)}%` : 'поселение выглядит богаче';
    rows.push(`<dt>Убранство</dt><dd>${items.length ? items.join(', ') : 'голые стены'} (${(b.furniture || []).length}/${FURNISH_MAX})${st ? ` · ${what}` : ''}</dd>`);
  }
  if (d.pen && b.done) {
    const beasts = herd(w).filter(a => a.pen === b.id);
    rows.push(`<dt>Места</dt><dd>занято ${penSpace(w) - penRoom(w)} из ${penSpace(w)} во всех загонах</dd>`,
      `<dt>Скот</dt><dd class="nb">${beasts.map(a => `${esc(a.name)} (${SPECIES.get(a.species).label}): ${beastText(w, a)}`).join('<br>') || 'пусто'}</dd>`,
      `<dt>Сено</dt><dd>${Math.floor(w.stock.hay || 0)} на складе</dd>`);
  }
  if (d.station && b.done) {
    const workers = colonists(w).filter(x => x.task?.id === 'job' && x.task.station === d.id && w.grid.bld[cellOf(w, x)] === b.id).map(x => esc(x.name));
    rows.push(`<dt>Заказ</dt><dd>${orderText(b)}</dd>`, `<dt>Работают</dt><dd>${workers.join(', ') || 'никого'}</dd>`);
    const ctx = craftContext(w), cur = b.order?.recipe;
    const recs = RECIPES.filter(r => r.at === d.id).map(r => {
      const what = r.makes.item ? ITEMS.get(r.makes.item).label : `${RESOURCES.get(r.makes.resource).label} ×${r.makes.n}`;
      const cost = Object.entries(r.cost).map(([res, v]) => `<span class="cost${(w.stock[res] || 0) >= v ? '' : ' short'}">${v} ${RESOURCES.get(res).short}</span>`).join('') +
        (r.fuel ? (() => { const f = furnacePick(w, r.heat ?? 2, r.fuel, fuelReserve(w)); return `<span class="cost${f ? '' : ' short'}">${f ? `${+f[1].toFixed(1)} ${f[0].short}` : (r.heat ?? 2) >= 2 ? `${r.fuel} угля` : `${r.fuel} угля или ${r.fuel * 3} дров`}</span>`; })() : '') +
        (r.tool ? `<span class="cost${(w.stock[r.tool] || 0) >= 1 ? '' : ' short'}">${RESOURCES.get(r.tool).short}</span>` : '');
      const want = r.want(ctx), need = recipeNeed(r);
      // the tier: who in the colony may take it (agents/skills.js); nobody — the order waits for a master
      const able = need ? colonists(w).filter(x => canMake(x, r)).map(x => x.name) : null;
      const tier = need ? `<span class="cost${able.length ? '' : ' short'}" title="${able.length ? 'Могут: ' + esc(able.join(', ')) : 'В поселении нет такого мастера'}">T${need.tier} · ${reasonText(need)}</span>` : '';
      return `<div class="rc${r.id === cur ? ' cur' : ''}"><b>${esc(what)}</b><span class="costs">${tier}${cost}</span><span class="muted">${r.id === cur ? 'в работе' : need && !able.length ? 'некому' : want > 0 ? 'нужно' : 'хватает'}</span></div>`;
    }).join('');
    extra = `<section><h4>Что здесь делают</h4><div class="recipes">${recs}</div></section>`;
  }
  return `<div class="pc-head"><h3>${d.name}</h3></div><p class="pc-now">${d.effect}</p>
    <div class="pc-grid bgrid"><section><dl class="kv">${rows.join('')}</dl></section>${extra}</div>`;
}

export function cellHtml(w, i) {
  const g = w.grid, x = i % w.w, y = (i / w.w) | 0, d = w.nav.get('camp')[i];
  const lake = g.lake?.[i] >= 0 ? w.lakes[g.lake[i]] : null;
  const rows = [`<dt>Местность</dt><dd>${lake ? `озеро, ${lake.size} клеток` : esc(BY_CODE[g.terr[i]].label)}</dd>`];
  if (oreOf(w, i)) rows.push(`<dt>Руда</dt><dd>${oreOf(w, i).label}, ещё ${Math.ceil(g.oreLeft[i])}</dd>`);
  if (lake) rows.push(`<dt>Рыба</dt><dd>${lake.cap ? `${Math.floor(lake.fish)} из ${lake.cap}${lake.resting ? ', отдыхает' : ''}` : 'слишком мало для рыбы'}</dd>`);
  if (g.wood[i] > 0) rows.push(`<dt>Древесина</dt><dd>${g.wood[i].toFixed(2)}</dd>`);
  if (g.bush[i]) rows.push(`<dt>Ягоды</dt><dd>${g.food[i].toFixed(2)}</dd>`);
  if (WALKABLE[g.terr[i]]) rows.push(`<dt>Плодородие</dt><dd>${Math.round(g.fert[i] * 100)}% · ${soilWord(g.fert[i])}</dd>`);
  rows.push(`<dt>Температура</dt><dd>${tempAt(w, i).toFixed(1)} °C</dd>`, `<dt>Путь до лагеря</dt><dd>${d >= 1e8 ? 'нет' : Math.round(d)}</dd>`);
  if (g.fire[i] > 0) rows.push(`<dt>Огонь</dt><dd>${g.fire[i].toFixed(2)}</dd>`);
  for (const gr of w.graves || []) if (gr.x === x && gr.y === y) rows.push(`<dt>Могила</dt><dd>${esc(gr.name)} · умер${gr.f ? 'ла' : ''} в день ${dayOf(gr.died) + 1}${gr.rite ? ', похоронен' + (gr.f ? 'а' : '') + ' с обрядом' : ''}</dd>`);
  for (const c of w.corpses || []) if ((c.x | 0) === x && (c.y | 0) === y) rows.push(`<dt>Тело</dt><dd>${esc(c.name)}, ещё не похоронен${c.f ? 'а' : ''}</dd>`);
  return `<div class="pc-head"><h3>Клетка ${x}, ${y}</h3></div><dl class="kv">${rows.join('')}</dl>`;
}

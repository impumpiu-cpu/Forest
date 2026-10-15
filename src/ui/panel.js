// Panels around the map: the clock line above it, the selection pane under it and the tabs on its right
// (stock and jobs, colonists, buildings, council, journal, world). Only the open tab is redrawn.
import {hpShare} from '../agents/agent.js';
import {RESOURCES, resourceGroups} from '../data/resources.js';
import {FOODS} from '../data/foods.js';
import {TRADE} from '../data/trade.js';
import {CROPS} from '../data/crops.js';
import {WALKABLE} from '../data/terrain.js';
import {lotFertility, missing} from '../settlement/buildings.js';
import {sourcesOf} from '../settlement/sources.js';

const soilWord = f => (f < 0.3 ? 'тощая' : f < 0.5 ? 'средняя' : f < 0.7 ? 'добрая' : 'жирная');
import {goodsUnits, goodsLabel, askPrice} from '../settlement/trade.js';
import {RECIPES} from '../data/recipes.js';
import {SIZES, CLIMATES, WILDLIFE, PREDATORS} from '../data/presets.js';
import {exposedOre, oreOf} from '../world/ores.js';
import {ORES} from '../data/ores.js';
import {campFuel, furnacePick} from '../settlement/stock.js';
import {fuelReserve} from '../settlement/buildings.js';
import {treasury} from '../settlement/precious.js';
import {region, regionFauna, faunaLevel} from '../world/region.js';
import {BIOMES, faunaWord} from '../data/biomes.js';
import {LEVEL_WORDS} from '../data/regions.js';
import {NEEDS} from '../data/needs.js';
import {JOBS} from '../data/jobs.js';
import {TRAITS} from '../data/traits.js';
import {SPECIES} from '../data/species.js';
import {FACTIONS} from '../data/factions.js';
import {season, seasonDay, yearOf, daysLeftInSeason} from '../data/seasons.js';
import {BUILDINGS} from '../data/buildings.js';
import {clockStr, hourOf, dayOf, ambientTemp} from '../core/time.js';
import {esc, clamp, plural} from '../core/util.js';
import {TICK_MS} from '../core/time.js';
import {colonists, count, has, ofSpecies, popCap, foodTotal, jobUnlocked, buildingById} from '../settlement/query.js';
import {councilDue, COUNCIL_FROM} from '../settlement/council.js';
import {taskLabel} from '../agents/tasks.js';
import {cellOf} from '../world/grid.js';
import {BY_CODE} from '../data/terrain.js';
import {$} from './dom.js';
import {LEVELS, LOG_TOPICS} from '../data/logTopics.js';
import {ITEMS, SLOTS} from '../data/items.js';
import {gearText, allItems, def as itemDef} from '../agents/equipment.js';
import {orderText, craftContext} from '../settlement/crafting.js';
import {fishTotals} from '../world/lakes.js';
import {moodOf, moodLabel, wishes} from '../agents/mind.js';
import {councilWish} from '../settlement/council.js';
import {boldness} from '../agents/brains/predator.js';
import {STATS} from '../data/special.js';
import {VALUES, axisWord} from '../data/values.js';
import {opinionWord} from '../data/relations.js';
import {feelings} from '../settlement/relations.js';
import {raceLabel, innateOf, limits, peopleOf} from '../agents/special.js';
import {RAID_BANDS} from '../data/raids.js';
import {raidThreat, raidSize} from '../settlement/threat.js';
import {DAY, HOUR} from '../core/time.js';
import {RAIDS} from '../data/presets.js';
import {MIGRATIONS} from '../data/migrations.js';
import {neighbours} from '../outside/index.js';
import {FURNITURE, FURNISH_MAX} from '../data/furniture.js';
import {statusOf} from '../settlement/life.js';
import {herd, beastText, penRoom, penSpace, isTameable} from '../settlement/herd.js';

const DIRS = ['восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный', 'северный', 'северо-восточный'];
const bar = (v, c) => `<div class="bar"><i style="width:${(clamp(v, 0, 1) * 100).toFixed(0)}%;background:${c}"></i></div>`;
const costHtml = (w, cost) => Object.entries(cost).map(([r, v]) => `<span class="cost${(w.stock[r] || 0) >= v ? '' : ' short'}">${v} ${RESOURCES.get(r).label}</span>`).join('');

// SPECIAL as seven small cells; the tooltip gives the race's limits
function specialHtml(a) {
  if (!a.special) return '';
  const sp = SPECIES.get(a.species), lim = limits(sp, peopleOf(sp, a));
  return `<div class="spc">${STATS.all().map(s => `<span title="${s.label}: ${s.note}. У этой расы ${lim[s.id][0]}–${lim[s.id][1]}"><b>${a.special[s.id]}</b>${s.short}</span>`).join('')}</div>`;
}

const raceOf = a => raceLabel(SPECIES.get(a.species), a);

export function traitsText(a) {
  const t = a.traits.map(id => TRAITS.get(id).label);
  return `любит: ${JOBS.get(a.likes).short} · не любит: ${JOBS.get(a.dislikes).short}${t.length ? ' · ' + t.join(', ') : ''}`;
}

export class Panel {
  constructor() {
    this.sig = {}; this.lastTick = 0; this.lastT = performance.now();
    this.hidden = this.loadFilter();
    this.buildFilters();
    this.buildLegend(null);
  }

  // the map legend: creatures and fixed marks, plus every ore from data/ores.js
  // rebuilt for each world: the beasts listed are the ones that live in its land
  buildLegend(w) {
    const dot = (c, t) => `<span><i style="background:${c}"></i>${t}</span>`;
    const ores = ORES.all().map(o => dot(`rgb(${o.tint.join(',')})`, o.label)).join('');
    $('legend').innerHTML = dot('var(--colony)', 'колонисты') + dot('var(--raider)', 'налётчики') +
      FACTIONS.filter(f => f.legend).map(f => dot(f.color, f.legend)).join('') +
      // only the beasts that live in this land (and those that come everywhere)
      SPECIES.filter(s => s.look.color && !s.sentient && (!s.habitat || !w || faunaLevel(w, s.id) > 0) && !s.undead).map(s => dot(s.look.color, s.legend || s.label)).join('') +
      dot('var(--food)', 'ягоды') + ores + dot('var(--ember)', 'огонь и костёр') +
      '<span>пунктир — граница зоны поселения</span>' +
      `<span>обводка — броня: ${ITEMS.filter(d => d.slot === 'body' && d.color).map(d => d.short).join(', ')} (своим цветом)</span>`;
  }

  // ── journal filters: levels and topics can be switched off; remembered in this browser
  loadFilter() {
    try { return new Set(JSON.parse(localStorage.getItem('forest.logHidden') || '[]')); } catch (e) { return new Set(); }
  }
  saveFilter() { try { localStorage.setItem('forest.logHidden', JSON.stringify([...this.hidden])); } catch (e) { /* storage unavailable */ } }

  buildFilters() {
    const chip = (key, label, dot) => `<button type="button" data-key="${key}" aria-pressed="${!this.hidden.has(key)}">${dot ? `<i style="background:${dot}"></i>` : ''}${label}</button>`;
    $('logLevels').innerHTML = LEVELS.map(l => chip('lv:' + l.id, l.label, l.color)).join('');
    $('logTopics').innerHTML = LOG_TOPICS.all().map(t => chip('t:' + t.id, t.label)).join('');
    for (const box of [$('logLevels'), $('logTopics')]) box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.key;
      if (this.hidden.has(k)) this.hidden.delete(k); else this.hidden.add(k);
      b.setAttribute('aria-pressed', String(!this.hidden.has(k)));
      this.saveFilter(); this.sig.log = null;
      if (this.lastWorld) this.renderLog(this.lastWorld);
    });
  }

  renderLog(w) {
    this.lastWorld = w;
    const lines = w.logLines.filter(l => !this.hidden.has('lv:' + l.level) && !this.hidden.has('t:' + l.topic));
    this.set('log', lines.map(l => `<div class="lv-${l.level}"><span>${l.when}</span> · <b>${l.html}</b></div>`).join('') ||
      '<div class="empty">Нет событий в выбранных рубриках.</div>');
  }

  // replace innerHTML only when the content changed, so clicks are not lost
  set(id, html) { if (this.sig[id] === html) return; this.sig[id] = html; $(id).innerHTML = html; }

  render(w, view) {
    if (this.legendFor !== w) { this.legendFor = w; this.buildLegend(w); }
    $('clock').textContent = clockStr(w.tick);
    const S = season(w), left = Math.ceil(daysLeftInSeason(w.tick));
    $('season').textContent = `${S.label}, ${seasonDay(w.tick)}-й день · год ${yearOf(w.tick)}`;
    $('season').title = `${S.note} До смены сезона: ${left} ${plural(left, 'день', 'дня', 'дней')}.`;
    $('season').dataset.s = S.id;
    $('amb').textContent = ambientTemp(w).toFixed(1) + ' °C' + (w.weather.rain > 0.1 ? (season(w).snow ? ', снег' : ', дождь') : '') + (w.stats.fireCount ? ` · горит клеток: ${w.stats.fireCount}` : '');
    $('windTxt').textContent = w.wind.str < 0.03 ? 'штиль' : `ветер ${DIRS[Math.round(((w.wind.dir + 180) % 360) / 45) % 8]}, ${(w.wind.str * 10).toFixed(1)} м/с`;
    const col = colonists(w);
    $('popCount').textContent = col.length;
    $('goldCount').textContent = w.caravan && w.caravan.phase !== 'leaving' ? '●' : Math.floor(treasury(w)) || '';
    const now = performance.now();
    const tps = view.speed && this.lastT ? (w.tick - this.lastTick) / ((now - this.lastT) / 1000) : 0;
    this.lastTick = w.tick; this.lastT = now;
    // only the open tab is drawn
    switch (view.tab) {
      case 'people': this.renderPeople(w, view.selected); break;
      case 'build': this.renderBuildings(w); break;
      case 'council': this.renderCouncil(w); break;
      case 'trade': this.renderTrade(w); break;
      case 'log': this.renderLog(w); break;
      case 'world': this.renderWorld(w, view, tps); break;
      default: this.renderStock(w); this.renderJobs(w); this.renderGear(w);
    }
  }

  // the treasury, the caravan in camp with its goods and prices, the last deals
  renderTrade(w) {
    const gold = w.stock.gold || 0, c = w.caravan;
    const phase = {coming: 'идёт к лагерю', camp: 'стоит лагерем, торг после совета', trading: 'идёт торг', night: 'ночует у костра', leaving: 'уходит'};
    // gold and silver count as money at their rate (settlement/precious.js)
    const metal = RESOURCES.filter(r => r.money && (w.stock[r.id] || 0) >= 0.05)
      .map(r => `${r.short} ${(w.stock[r.id]).toFixed(r.value < 1 ? 1 : 0)} (≈${(w.stock[r.id] * r.value * r.money).toFixed(1)})`);
    let head = `<dl class="kv"><dt>Казна</dt><dd>${treasury(w).toFixed(1)} зол.: монетами ${gold.toFixed(1)}${metal.length ? '; ' + metal.join(', ') : ''}</dd>` +
      `<dt>Следующий караван</dt><dd>${c ? 'уже здесь' : this.caravanWhen(w)}</dd>` +
      `<dt>Караванов было</dt><dd>${w.trade.visits} · выручено ${Math.floor(w.trade.earned)} · потрачено ${Math.floor(w.trade.spent)}</dd></dl>`;
    let goods = '';
    if (c) {
      const units = goodsUnits(c.goods), cap = c.capacity;
      // identical pieces are shown as one line with a count
      const lines = [];
      for (const g of c.goods) {
        const same = g.kind === 'item' && lines.find(x => x.g.kind === 'item' && x.g.type === g.type && (x.g.q || 0) === (g.q || 0));
        if (same) same.n++; else lines.push({g, n: g.kind === 'res' ? g.n : 1});
      }
      const rows = lines.sort((x, y) => (x.g.kind === y.g.kind ? askPrice(y.g) - askPrice(x.g) : x.g.kind === 'item' ? -1 : 1)).map(({g, n}) => {
        const p = askPrice(g), can = gold >= p;
        return `<div class="wrow${g.kind === 'item' && g.q ? ' fine' : ''}"><span>${esc(goodsLabel(g))}${n > 1 || g.kind === 'res' ? ' ×' + n : ''}</span><b class="${can ? '' : 'dear'}">${p} зол.${n > 1 ? ' / шт.' : ''}</b></div>`;
      }).join('');
      goods = `<h2>Купец ${esc(c.name)}</h2><p class="small muted">Сейчас: ${phase[c.phase]}. Груз ${units} из ${cap} мест, в кошельке у купца ${Math.floor(c.purse)} зол. Купец просит ×${TRADE.ask} от цены и платит ×${TRADE.bid}.</p><div class="wares">${rows || '<p class="muted small">Всё распродано.</p>'}</div>`;
    }
    const deals = w.trade.deals.map(d => {
      const list = xs => xs.map(([l, n, g]) => `${esc(l)}${n > 1 ? ' ×' + n : ''}`).join(', ');
      return `<li><b>День ${d.day}, ${esc(d.trader)}</b>: ${d.sold.length ? 'продали ' + list(d.sold) + ` (+${d.earned})` : 'продать было нечего'}; ${d.bought.length ? 'купили ' + list(d.bought) + ` (−${d.spent})` : 'ничего не купили'}. В казне ${Math.floor(d.gold)}.</li>`;
    }).join('');
    this.set('tradeBox', `${head}${goods}<h2>Последние сделки</h2>${deals ? `<ul class="deals">${deals}</ul>` : '<p class="muted small">Торговли ещё не было. Караваны ходят по Имперскому тракту с 10-го дня, раз в 10 дней, и приходят не всегда.</p>'}`);
  }

  caravanWhen(w) {
    const at = w.outside.next.caravan;
    if (!Number.isFinite(at)) return 'не ожидается';
    return `${this.waitText(w, at)}, если придёт (${Math.round(Math.min(0.95, TRADE.chance * region(w).road) * 100)}%)`;
  }

  // the stock, grouped: food, materials, fuel, ore, metal, luxury, ammunition
  renderStock(w) {
    const groups = resourceGroups().map(gname => {
      const rs = RESOURCES.filter(r => (r.group || 'Прочее') === gname);
      if (!rs.length) return '';
      const rows = rs.map(r => { const v = w.stock[r.id] || 0; return `<div class="srow2${v < 0.05 ? ' zero' : ''}" title="${esc(r.label)}"><span><i class="dot" style="background:${r.color}"></i>${esc(r.short || r.label)}</span><b>${v < 10 ? v.toFixed(1) : Math.floor(v)}</b></div>`; }).join('');
      const tagged = t => rs.some(r => r.tags.includes(t));
      const extra = gname === 'Еда' ? `<div class="srow2"><span>всего</span><b>${Math.floor(foodTotal(w))}</b></div>` : rs.every(r => r.tags.includes('fuel')) ? `<div class="srow2"><span>костёр</span><b>${w.campLit ? 'горит' : campFuel(w) ? 'не нужен' : 'нечем топить'}</b></div>` : '';
      return `<div class="sgroup"><h3>${gname}</h3>${rows}${extra}</div>`;
    }).join('');
    this.set('stock', groups);
  }

  // every job: how many are at it right now, how many like it; locked ones say what they wait for
  renderJobs(w) {
    const col = colonists(w), doing = {}, likes = {};
    for (const a of col) {
      const t = a.task?.id === 'job' ? a.task.job : null;
      if (t) doing[t] = (doing[t] || 0) + 1;
      likes[a.likes] = (likes[a.likes] || 0) + 1;
    }
    const rows = JOBS.all().map(j => {
      if (!jobUnlocked(w, j)) {
        const need = [].concat(j.requires).map(b => BUILDINGS.get(b).name.toLowerCase()).join(' или ');
        return `<span class="lock">${esc(j.label)}</span><span class="lock jn jneed" title="Откроется, когда построят: ${need}">нужна: ${need}</span>`;
      }
      return `<span>${esc(j.label)}</span><span class="jn" title="заняты сейчас">${doing[j.id] || '·'}</span><span class="jn" title="любят эту работу">${likes[j.id] ? '♥' + likes[j.id] : ''}</span>`;
    }).join('');
    this.set('jobs', `<span class="jh">работа</span><span class="jh jn">сейчас</span><span class="jh jn">любят</span>${rows}`);
  }

  renderWorld(w, view, tps) {
    const c = w.cfg, sz = SIZES[c.size];
    $('worldLine').textContent = `Мир ${sz.w} × ${sz.h}, сид «${c.seed}», климат ${CLIMATES[c.climate].label.toLowerCase()}, набеги: ${RAIDS[c.raids].label.toLowerCase()}, зайцев: ${WILDLIFE[c.wildlife].label.toLowerCase()}, волки: ${PREDATORS[c.predators].label.toLowerCase()}${c.lightning ? ', молнии' : ''}.`;
    const col = colonists(w), raiders = w.agents.filter(a => a.faction === 'raiders').length, hares = ofSpecies(w, 'hare').length;
    const ore = exposedOre(w);
    this.set('worldKv',
      `<dt>Жители</dt><dd>${col.length} из ${popCap(w)}${raiders ? ` · налётчиков ${raiders}` : ''}</dd>` +
      `<dt>Местность</dt><dd class="nb">${this.regionText(w)}</dd>` +
      `<dt>Новый поселенец</dt><dd>${this.settlerText(w)}</dd>` +
      `<dt title="Налётчики не видят лагерь: они знают о нём по слухам, которые обновляются раз в день">Угроза налёта</dt><dd>${raidThreat(w).toFixed(1)} · банда ~${raidSize(w)}${RAIDS[w.cfg.raids].dist ? ` · ${this.waitText(w, w.outside.next.raiders)}, если выйдут (${Math.round((RAIDS[w.cfg.raids].chance ?? 1) * 100)}%)` : ''}</dd>` +
      `<dt>Соседи</dt><dd class="nb">${neighbours(w).filter(n => n.dist).map(n => `<span title="${esc(n.note)}">${esc(n.label)} · ${n.dist} дн. пути</span>`).join('<br>') || '—'}</dd>` +
      `<dt>Зайцы рядом</dt><dd>${hares} · добыто ${w.stats.hunted}</dd>` +
      (fishTotals(w)[1] ? `<dt>Рыба в озёрах</dt><dd>${Math.floor(fishTotals(w)[0])} из ${fishTotals(w)[1]}</dd>` : '<dt>Рыба в озёрах</dt><dd>нет больших озёр</dd>') +
      `<dt>Волки</dt><dd>${ofSpecies(w, 'wolf').length || 'нет'}</dd>` +
      `<dt title="Сколько руды можно выкопать с открытого склона скал">Руда на склонах</dt><dd class="nb">${ORES.filter(o => ore[o.id] > 0).map(o => `${o.label} ${Math.round(ore[o.id])}`).join(' · ') || 'не видно'}</dd>`);
    $('pFlabel').textContent = `Поля (${w.n.toLocaleString('ru-RU')} клеток)`;
    $('pF').textContent = w.perf.fields.toFixed(2); $('pN').textContent = w.perf.nav.toFixed(2);
    $('pA').textContent = w.perf.agents.toFixed(2); $('pR').textContent = view.renderMs.toFixed(2);
    $('pT').textContent = tps.toFixed(0);
    $('pS').textContent = view.speed ? `×${(tps * TICK_MS / 1000).toFixed(1)} / ×${view.speed}` : 'пауза';
  }

  // what the land holds (data/regions.js): ores, gold sand, beasts, wild beds
  regionText(w) {
    const R = region(w), word = v => LEVEL_WORDS[v] ?? v;
    const ores = ORES.filter(o => !o.event).map(o => `${o.label} — ${word(R.ores[o.id] ?? 0)}`);
    ores.push(`золото в отмелях — ${word(R.placer)}`);
    if (R.goldVein) ores.push('бывает золотая жила');
    // biomes in shares, then everyone who lives here with how common they are (data/biomes.js, world/region.js)
    const biomes = Object.entries(R.biomes || {}).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${BIOMES.get(id).label} ${Math.round(v * 100)}%`);
    const beasts = regionFauna(w).map(([sp, v]) => `${sp.label} (${faunaWord(v)})`);
    return `<b>${esc(R.label)}</b>: ${esc(R.note || '')}<br>земли: ${biomes.join(', ')}<br>${ores.join(', ')}<br>живут: ${beasts.join(', ')}${R.magma ? '<br>под скалами магма' : ''}`;
  }

  // the arrival is either still on its way (time left) or due and waiting for a reason
  settlerText(w) {
    const def = MIGRATIONS.get('settlers'), why = def.blocked(w);
    if (w.outside.due.settlers != null) return why ? `ждёт: ${why}` : 'скоро';
    return this.waitText(w, w.outside.next.settlers) + (why ? ` · ${why}` : '');
  }

  waitText(w, at) {
    if (!Number.isFinite(at)) return 'нет';
    const t = at - w.tick;
    if (t <= 0) return 'скоро';
    return t >= DAY ? `через ${(t / DAY).toFixed(1).replace('.0', '')} дн.` : `через ${Math.max(1, Math.round(t / HOUR))} ч`;
  }

  renderCouncil(w) {
    const c = w.council, due = councilDue(w), h = hourOf(w.tick);
    const when = due ? 'идёт сбор у костра' : c.lastDay === dayOf(w.tick) || h >= COUNCIL_FROM ? 'завтра в 19:00' : 'сегодня в 19:00';
    const maxV = Math.max(1, ...c.votes.map(v => v[1]));
    const votes = c.votes.map(([k, n]) => { const d = BUILDINGS.get(k); return `<div class="vote"><span>${d.name}</span><i style="width:${n / maxV * 100}%;background:${d.color}"></i><b>${n}</b></div>`; }).join('');
    const args = c.args.map(x => `<li><b>${esc(x.name)}</b> за ${BUILDINGS.get(x.key).name.toLowerCase()}: ${x.why}</li>`).join('');
    let goal = '';
    if (c.goal) {
      const d = BUILDINGS.get(c.goal);
      // wood is counted with the camp fire's reserve, as the site is laid (settlement/buildings.js)
      const need = (r, v) => v + (r === 'wood' ? fuelReserve(w) : 0);
      goal = `<div class="goal">Копим на ${d.name.toLowerCase()}: ${Object.entries(d.cost).map(([r, v]) => `<span class="cost${(w.stock[r] || 0) >= need(r, v) ? '' : ' short'}">${RESOURCES.get(r).label} ${Math.min(need(r, v), Math.floor(w.stock[r] || 0))}/${need(r, v)}${need(r, v) > v ? ` (из них ${need(r, v) - v} на костёр)` : ''}</span>`).join(' ')}</div>` + this.waitingHtml(w, d);
    }
    this.set('council', `<div class="when">Следующий совет: ${when}</div><p class="decision">${c.decision}</p>${goal}${votes ? `<div class="votes">${votes}</div>` : ''}${args ? `<ul class="args">${args}</ul>` : ''}`);
  }

  // why the council's goal is not laid yet: each missing resource, where it comes from and who is at it;
  // how long the colony has been saving and how much of the shortfall is already made up
  waitingHtml(w, d) {
    const c = w.council, lack = missing(w, d.cost);
    if (!lack.length) return '<p class="pc-small">Всё собрано: стройку заложат на ближайшем совете.</p>';
    const rows = lack.map(([r, n]) => {
      const src = sourcesOf(w, r), busy = src.reduce((t, s) => t + s.busy, 0);
      const how = src.length ? src.map(s => `${s.how}${s.busy ? ` — ${s.busy} чел.` : ''}`).join('; ') : 'взять неоткуда';
      const note = '';
      return `<li class="${busy ? '' : 'down'}"><b>${RESOURCES.get(r).label} ${n}</b>${note}: ${how}${src.length && !busy ? '. Сейчас этим никто не занят' : ''}</li>`;
    }).join('');
    const days = c.goalSince != null ? Math.floor((w.tick - c.goalSince) / DAY) : 0;
    const left = lack.reduce((t, [, n]) => t + n, 0), done = c.goalLack ? Math.max(0, Math.round((1 - left / c.goalLack) * 100)) : null;
    const since = days >= 1 ? `Копят ${days} ${plural(days, 'день', 'дня', 'дней')}${done != null ? `, собрано ${done}% недостающего` : ''}.` : '';
    return `<h4 class="pc-sub">Чего ждём</h4><ul class="pc-list">${rows}</ul>${since ? `<p class="pc-small">${since}</p>` : ''}`;
  }

  // stations at work and the gear store
  renderGear(w) {
    const stations = BUILDINGS.filter(d => d.station);
    const rows = stations.map(d => {
      const b = w.buildings.find(x => x.key === d.id && x.done);
      return `<div class="srow"><b>${d.name}</b><span>${b ? orderText(b) : 'не построена'}</span></div>`;
    }).join('');
    // counted by kind: type and quality, named with the "+1"
    const counts = {};
    for (const it of w.armory) { const s = itemDef(it).short; counts[s] = (counts[s] || 0) + 1; }
    const store = Object.entries(counts).map(([s, n]) => `<span class="cost">${esc(s)}${n > 1 ? ' ×' + n : ''}</span>`).join('') || '<span class="muted">пусто, всё на руках</span>';
    const worn = {};
    for (const a of colonists(w)) for (const it of allItems(a)) { const s = itemDef(it).short; worn[s] = (worn[s] || 0) + 1; }
    const wornTxt = Object.entries(worn).map(([s, n]) => `${esc(s)} ${n}`).join(', ') || 'ничего';
    this.set('gearbox', `${rows}<div class="slabel">На складе снаряжения</div><div class="costs">${store}</div>
      <div class="slabel">На поселенцах</div><p class="muted">${wornTxt}</p>
      <div class="slabel">Сделано ${w.stats.crafted}, сломалось ${w.stats.broken}</div>`);
  }

  renderBuildings(w) {
    this.set('build', BUILDINGS.all().map(d => {
      const n = count(w, d.id), site = w.buildings.find(b => b.key === d.id && !b.done);
      const state = site ? `<span class="bstate">строится ${Math.floor(site.progress / d.work * 20) * 5}%</span>`
        : n ? `<span class="bstate done">построено${d.max > 1 ? ' ×' + n : ''}</span>` : w.council.goal === d.id ? '<span class="bstate">цель совета</span>' : '';
      const note = n >= d.max || site ? '' : d.needs && !has(w, d.needs) ? `<span class="bneed">после: ${BUILDINGS.get(d.needs).name.toLowerCase()}</span>`
        : d.key && !(w.stock[d.key] >= 1) ? `<span class="bneed" title="Инструмент делают только в городах">нужно у торговца: ${RESOURCES.get(d.key).label}</span>` : '';
      return `<div class="bcard${n ? ' built' : ''}"><div class="bhead"><i class="bmark" style="background:${d.color}">${d.mark}</i><b>${d.name}</b>${state}</div>
        <p>${d.effect}</p><div class="bfoot"><span class="costs">${costHtml(w, d.cost)}</span>${note}</div></div>`;
    }).join(''));
  }

  renderPeople(w, selected) {
    const col = colonists(w);
    const needs = SPECIES.get('human').needs.map(id => NEEDS.get(id));
    this.set('people', (col.map(a => `<div class="person${a === selected ? ' sel' : ''}" data-id="${a.id}">
      <span class="nm">${esc(a.name)} <i class="race">${raceOf(a)}</i></span><span class="task">${taskLabel(a)}${a.carry?.n ? ` · несёт ${a.carry.n}` : ''}</span><span class="likes">${traitsText(a)}</span><span class="gear">${gearText(a)}</span>
      <div class="bars" title="${needs.map(n => n.label).join(' · ')} · здоровье">${needs.map(n => bar(a.needs[n.id], n.color)).join('')}${bar(hpShare(a), 'var(--good)')}</div></div>`).join('')
      || '<div class="task">Колония погибла. Откройте «Меню мира», чтобы начать заново.</div>') + this.herdHtml(w) + this.lifeHtml(w, col));
  }

  herdHtml(w) {
    const list = herd(w);
    if (!list.length && !has(w, 'pen')) return '';
    const rows = list.map(a => `<div class="person beast" data-id="${a.id}"><span class="nm">${esc(a.name)}</span><span class="task">${SPECIES.get(a.species).label} · ${taskLabel(a)}</span><span class="likes">${beastText(w, a)}</span></div>`).join('');
    return `<h3 class="psec">Скот · ${list.length}${has(w, 'pen') ? ` · мест ${penRoom(w)} из ${penSpace(w)}` : ''} · сена ${Math.floor(w.stock.hay || 0)}</h3>${rows || '<p class="muted pc-small">Загон пуст: скотник ждёт диких коз и мулов.</p>'}`;
  }

  // the colony's spirits: average mood, who is in low spirits, the dead and the graves
  lifeHtml(w, col) {
    if (!col.length) return '';
    const m = col.reduce((s, a) => s + moodOf(w, a), 0) / col.length;
    const low = col.filter(a => moodOf(w, a) < -0.3).map(a => esc(a.name));
    const graves = (w.graves || []).length, bodies = (w.corpses || []).length;
    return `<h3 class="psec">Дух поселения</h3><p class="pc-small">Настроение в среднем ${m >= 0 ? '+' : ''}${Math.round(m * 100)}${low.length ? `; не в духе: ${low.join(', ')}` : '; все держатся'}. Браги ${Math.floor(w.stock.braga || 0)}. Могил ${graves}${bodies ? `, непогребённых ${bodies}` : ''}${w.chronicle.left ? `, ушли из поселения ${w.chronicle.left}` : ''}.</p>`;
  }

  // one line under the map: the cell under the cursor
  readout(w, hoverCell) {
    if (hoverCell < 0) return;
    const g = w.grid, i = hoverCell, d = w.nav.get('camp')[i];
    const lake = g.lake[i] >= 0 ? w.lakes[g.lake[i]] : null;
    const ore = oreOf(w, i) ? ` · ${oreOf(w, i).label} ${Math.ceil(g.oreLeft[i])}` : '';
    if (lake) { $('readout').textContent = `(${i % w.w}, ${(i / w.w) | 0}) озеро, ${lake.size} клеток · ${lake.cap ? `рыбы ${Math.floor(lake.fish)} из ${lake.cap}${lake.resting ? ', выловлено, отдыхает' : ''}` : 'слишком мало для рыбы'} · ${g.temp[i].toFixed(1)} °C`; return; }
    $('readout').textContent = `(${i % w.w}, ${(i / w.w) | 0}) ${BY_CODE[g.terr[i]].label}${ore} · ${g.temp[i].toFixed(1)} °C · почва ${Math.round(g.fert[i] * 100)}% · топливо ${g.fuel[i].toFixed(2)} · огонь ${g.fire[i].toFixed(2)} · дым ${g.smoke[i].toFixed(2)} · ягоды ${g.food[i].toFixed(2)} · древесина ${g.wood[i].toFixed(2)} · путь до лагеря ${d >= 1e8 ? 'нет' : d.toFixed(0)}`;
  }

  // the pane under the map: the selected creature, building or cell; a hint when nothing is picked
  renderSelection(w, view) {
    const a = view.selected;
    let html;
    if (a && !a.dead && w.agents.includes(a)) html = a.prefs ? this.personHtml(w, a) : this.creatureHtml(w, a);
    else if (view.selBld != null && buildingById(w, view.selBld)) html = this.buildingHtml(w, buildingById(w, view.selBld));
    else if (view.selCell != null && view.selCell >= 0) html = this.cellHtml(w, view.selCell);
    else html = '<p class="selhint">Ничего не выбрано. В режиме «Осмотр» щёлкните по поселенцу, зверю, постройке или любой клетке карты.</p>';
    this.set('selCard', html);
  }

  buildingHtml(w, b) {
    const d = BUILDINGS.get(b.key), close = '<button type="button" class="pc-close" data-close aria-label="Закрыть">×</button>';
    const state = b.done ? 'построено' : `строится ${Math.floor(b.progress / d.work * 100)}%`;
    const rows = [`<dt>Состояние</dt><dd>${state}</dd>`, `<dt>Цена</dt><dd class="nb">${Object.entries(d.cost).map(([r, v]) => `${v} ${RESOURCES.get(r).label}`).join(', ')}</dd>`];
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
        const want = r.want(ctx);
        return `<div class="rc${r.id === cur ? ' cur' : ''}"><b>${esc(what)}</b><span class="costs">${cost}</span><span class="muted">${r.id === cur ? 'в работе' : want > 0 ? 'нужно' : 'хватает'}</span></div>`;
      }).join('');
      extra = `<section><h4>Что здесь делают</h4><div class="recipes">${recs}</div></section>`;
    }
    return `<div class="pc-head"><h3>${d.name}</h3>${close}</div><p class="pc-now">${d.effect}</p>
      <div class="pc-grid bgrid"><section><dl class="kv">${rows.join('')}</dl></section>${extra}</div>`;
  }

  cellHtml(w, i) {
    const g = w.grid, x = i % w.w, y = (i / w.w) | 0, d = w.nav.get('camp')[i];
    const close = '<button type="button" class="pc-close" data-close aria-label="Закрыть">×</button>';
    const lake = g.lake?.[i] >= 0 ? w.lakes[g.lake[i]] : null;
    const rows = [`<dt>Местность</dt><dd>${lake ? `озеро, ${lake.size} клеток` : BY_CODE[g.terr[i]].label}</dd>`];
    if (oreOf(w, i)) rows.push(`<dt>Руда</dt><dd>${oreOf(w, i).label}, ещё ${Math.ceil(g.oreLeft[i])}</dd>`);
    if (lake) rows.push(`<dt>Рыба</dt><dd>${lake.cap ? `${Math.floor(lake.fish)} из ${lake.cap}${lake.resting ? ', отдыхает' : ''}` : 'слишком мало для рыбы'}</dd>`);
    if (g.wood[i] > 0) rows.push(`<dt>Древесина</dt><dd>${g.wood[i].toFixed(2)}</dd>`);
    if (g.bush[i]) rows.push(`<dt>Ягоды</dt><dd>${g.food[i].toFixed(2)}</dd>`);
    if (WALKABLE[g.terr[i]]) rows.push(`<dt>Плодородие</dt><dd>${Math.round(g.fert[i] * 100)}% · ${soilWord(g.fert[i])}</dd>`);
    rows.push(`<dt>Температура</dt><dd>${g.temp[i].toFixed(1)} °C</dd>`, `<dt>Путь до лагеря</dt><dd>${d >= 1e8 ? 'нет' : Math.round(d)}</dd>`);
    if (g.fire[i] > 0) rows.push(`<dt>Огонь</dt><dd>${g.fire[i].toFixed(2)}</dd>`);
    for (const gr of w.graves || []) if (gr.x === x && gr.y === y) rows.push(`<dt>Могила</dt><dd>${esc(gr.name)} · умер${gr.f ? 'ла' : ''} в день ${dayOf(gr.died) + 1}${gr.rite ? ', похоронен' + (gr.f ? 'а' : '') + ' с обрядом' : ''}</dd>`);
    for (const c of w.corpses || []) if ((c.x | 0) === x && (c.y | 0) === y) rows.push(`<dt>Тело</dt><dd>${esc(c.name)}, ещё не похоронен${c.f ? 'а' : ''}</dd>`);
    return `<div class="pc-head"><h3>Клетка ${x}, ${y}</h3>${close}</div><dl class="kv">${rows.join('')}</dl>`;
  }

  where(w, a) {
    const i = cellOf(w, a), dc = w.nav.get('camp')[i];
    if (dc < 3) return 'у костра';
    if (w.zone[i]) return 'в поселении';
    const d = Math.round(Math.hypot(a.x - w.camp.x, a.y - w.camp.y));
    return `в ${d} ${plural(d, 'клетке', 'клетках', 'клетках')} от лагеря`;
  }

  // why the colonist does what it does: the choice at the last think, the runner-up, the way, the last
  // task dropped before it was done (agents/brains/colonist.js a.why, a.lastStop; agents/movement.js a.route)
  whyHtml(w, a) {
    const y = a.why, rows = [];
    const ago = t => { const m = w.tick - t; return m < HOUR ? `${Math.max(1, Math.round(m / HOUR * 60))} мин назад` : m < DAY ? `${Math.round(m / HOUR)} ч назад` : `${Math.floor(m / DAY)} дн. назад`; };
    if (y) {
      rows.push(`<dt>Выбор</dt><dd><b>${esc(y.task)}</b> (${y.score})${y.why ? ` — ${esc(y.why)}` : ''}${y.kept ? '; продолжает начатое' : ''}</dd>`);
      if (y.alt) rows.push(`<dt>Второе</dt><dd class="alt">${esc(y.alt)} (${y.altScore})${y.altWhy ? ` — ${esc(y.altWhy)}` : ''}</dd>`);
    }
    if (a.route && w.tick - a.route.t < 30) rows.push(`<dt>Путь</dt><dd>${esc(a.route.how)}</dd>`);
    if (a.lastStop) rows.push(`<dt>Бросил</dt><dd>«${esc(a.lastStop.task)}» ${ago(a.lastStop.t)}: ${esc(a.lastStop.why)}</dd>`);
    return rows.length ? `<dl class="kv why">${rows.join('')}</dl>` : '';
  }

  creatureHtml(w, a) {
    const sp = SPECIES.get(a.species), T = w.grid.temp[cellOf(w, a)].toFixed(1);
    const rows = [`<dt>Сейчас</dt><dd>${taskLabel(a)}, ${this.where(w, a)}</dd>`, `<dt>Здоровье</dt><dd>${Math.round(hpShare(a) * 100)}%</dd>`];
    if (a.band) rows.push(`<dt>Кто</dt><dd>${RAID_BANDS.get(a.band).label}; ${{beast: 'неразумен', semi: 'полуразумен', sentient: 'разумен'}[sp.mind]}</dd>`);
    if (a.special) rows.push(`<dt>Тело</dt><dd>${specialHtml(a)}</dd>`);
    const inn = innateOf(sp, a);
    if (inn.length) rows.push(`<dt>Особое</dt><dd>${inn.map(t => `<span class="chip" title="${esc(t.note)}">${t.label}</span>`).join(' ')}</dd>`);
    if (a.role === 'trader' && w.caravan?.traderId === a.id) {
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
    const who = a.role === 'trader' ? 'купец' : a.role === 'guard' ? 'охранник каравана' : a.tame ? `${sp.label}, ${sp.id === 'goat' ? 'своя' : 'свой'}` : raceOf(a);
    const title = a.name.toLowerCase() !== who ? `${esc(a.name)}, ${who}` : who[0].toUpperCase() + who.slice(1);
    return `<div class="pc-head"><h3>${title}</h3><button type="button" class="pc-close" data-close aria-label="Закрыть">×</button></div><dl class="kv">${rows.join('')}</dl>`;
  }

  personHtml(w, a) {
    const sp = SPECIES.get(a.species), mood = moodOf(w, a);
    const traits = a.traits.map(id => `<span class="chip">${TRAITS.get(id).label}</span>`).join('');
    const fresh = a.diary.filter(e => e.until > w.tick && e.mood !== 0).sort((x, y) => Math.abs(y.mood) - Math.abs(x.mood)).slice(0, 2);
    const moodPct = Math.round((mood + 1) * 50);
    const needs = sp.needs.map(id => { const n = NEEDS.get(id); return `<div class="pc-bar"><span>${n.label}</span>${bar(a.needs[id], n.color)}<b>${Math.round(a.needs[id] * 100)}</b></div>`; }).join('') +
      `<div class="pc-bar"><span>здоровье</span>${bar(hpShare(a), 'var(--good)')}<b>${Math.round(hpShare(a) * 100)}</b></div>`;
    const inn = innateOf(sp, a).map(t => `<span class="chip race" title="${esc(t.note)}">${t.label}</span>`).join('');
    const vals = (a.values || []).map(id => `<span class="chip">${VALUES.get(id).label}</span>`).join('');
    const feel = feelings(w, a), strong = [...feel.filter(([, v]) => v <= -1.5).slice(0, 3), ...feel.filter(([, v]) => v >= 1.5).slice(-3).reverse()];
    const feelHtml = strong.length ? `<ul class="pc-list">${strong.map(([b, v]) => `<li class="${v < 0 ? 'down' : 'up'}">${opinionWord(v)} ${esc(b.name)}${b.species !== a.species ? ` (${raceOf(b)})` : ''}</li>`).join('')}</ul>` : '<p class="muted pc-small">Ни с кем особо не сошёлся и не повздорил.</p>';
    const body = sp.body ? `${raceOf(a)[0].toUpperCase() + raceOf(a).slice(1)}: взрослеют к ${sp.body.adult}, живут до ${sp.body.life} лет; ${sp.body.diet}.` : '';
    const want = wishes(w, a, councilWish(w, a));
    const slots = SLOTS.map(s => {
      const it = a.equip?.[s.id];
      const txt = it ? itemDef(it).short + (Number.isFinite(it.dur) ? ` · ${Math.max(0, Math.round(it.dur / itemDef(it).dur * 100))}%` : '') + (it.ammo != null ? ` · стрел ${it.ammo}` : '') : '—';
      return `<dt>${s.label}</dt><dd class="q${it?.q || 0}"${it?.q ? ` title="${itemDef(it).rank}"` : ''}>${esc(txt)}</dd>`;
    }).join('');
    const skills = JOBS.filter(j => j.preferable).map(j => [j, a.skill[j.id] || 0]).sort((x, y) => y[1] - x[1])
      .map(([j, v]) => `<span class="chip${j.id === a.likes ? ' like' : j.id === a.dislikes ? ' dislike' : ''}">${j.short} ${Math.round(v * 100)}</span>`).join('');
    const today = dayOf(w.tick);
    let lastDay = null;
    const diary = a.diary.slice(0, 14).map(e => {
      const d = dayOf(e.t), head = d !== lastDay ? `<li class="dday">${d === today ? 'Сегодня' : d === today - 1 ? 'Вчера' : 'День ' + (d + 1)}</li>` : '';
      lastDay = d;
      const hh = clockStr(e.t).split(', ')[1];
      return `${head}<li class="${e.mood > 0 ? 'up' : e.mood < 0 ? 'down' : ''}"><span>${hh}</span>${esc(e.text)}</li>`;
    }).join('');
    return `<div class="pc-head"><h3>${esc(a.name)}</h3><span class="pc-mood m${mood > 0.15 ? 'up' : mood < -0.15 ? 'down' : 'mid'}">${moodLabel(a, mood)}</span>
        <button type="button" class="pc-close" data-close aria-label="Закрыть">×</button></div>
      <p class="pc-now">Сейчас ${taskLabel(a)}, ${this.where(w, a)}.${fresh.length ? ' На душе: ' + fresh.map(e => esc(e.text.replace(/[.!…]+$/, '')).replace(/^./, ch => ch.toLowerCase())).join('; ') + '.' : ''}</p>
      ${this.whyHtml(w, a)}
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
          <h4>Мировоззрение</h4>
          ${a.align ? `<p class="pc-small">${axisWord('order', a.align.order)} · ${axisWord('mercy', a.align.mercy)}</p>` : ''}
          ${vals ? `<div class="chips">${vals}</div>` : ''}
          <h4>Соседи</h4>${feelHtml}
        </section>
        <section><h4>Хочет</h4>${want.length ? `<ul class="pc-list">${want.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted pc-small">Всем доволен.</p>'}
          <h4>Снаряжение</h4><dl class="kv">${slots}</dl>
          <h4>Навыки</h4><div class="chips">${skills}</div>
        </section>
        <section><h4>Дневник</h4><ul class="pc-diary">${diary || '<li class="muted">Пока ничего.</li>'}</ul></section>
      </div>`;
  }
}

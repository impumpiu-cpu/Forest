// Panels around the map: the clock line above it, the selection pane under it and the tabs on its right
// (stock and jobs, colonists, buildings, council, journal, world). Only the open tab is redrawn.
import {RESOURCES, resourceGroups} from '../data/resources.js';
import {FOODS} from '../data/foods.js';
import {TRADE} from '../data/trade.js';
import {CROPS} from '../data/crops.js';
import {WALKABLE} from '../data/terrain.js';
import {lotFertility} from '../settlement/buildings.js';

const soilWord = f => (f < 0.3 ? 'тощая' : f < 0.5 ? 'средняя' : f < 0.7 ? 'добрая' : 'жирная');
import {goodsUnits, goodsLabel, askPrice} from '../settlement/trade.js';
import {RECIPES} from '../data/recipes.js';
import {SIZES, CLIMATES, WILDLIFE, PREDATORS} from '../data/presets.js';
import {exposedOre, oreOf} from '../world/ores.js';
import {ORES} from '../data/ores.js';
import {campFuel, smeltFuelTotal} from '../settlement/stock.js';
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
import {raidThreat, raidSize} from '../settlement/threat.js';
import {DAY, HOUR} from '../core/time.js';
import {RAIDS} from '../data/presets.js';
import {MIGRATIONS} from '../data/migrations.js';
import {neighbours} from '../outside/index.js';

const DIRS = ['восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный', 'северный', 'северо-восточный'];
const bar = (v, c) => `<div class="bar"><i style="width:${(clamp(v, 0, 1) * 100).toFixed(0)}%;background:${c}"></i></div>`;
const costHtml = (w, cost) => Object.entries(cost).map(([r, v]) => `<span class="cost${(w.stock[r] || 0) >= v ? '' : ' short'}">${v} ${RESOURCES.get(r).label}</span>`).join('');

export function traitsText(a) {
  const t = a.traits.map(id => TRAITS.get(id).label);
  return `любит: ${JOBS.get(a.likes).short} · не любит: ${JOBS.get(a.dislikes).short}${t.length ? ' · ' + t.join(', ') : ''}`;
}

export class Panel {
  constructor() {
    this.sig = {}; this.lastTick = 0; this.lastT = performance.now();
    this.hidden = this.loadFilter();
    this.buildFilters();
    this.buildLegend();
  }

  // the map legend: creatures and fixed marks, plus every ore from data/ores.js
  buildLegend() {
    const dot = (c, t) => `<span><i style="background:${c}"></i>${t}</span>`;
    const ores = ORES.all().map(o => dot(`rgb(${o.tint.join(',')})`, o.label)).join('');
    $('legend').innerHTML = dot('var(--colony)', 'колонисты') + dot('var(--raider)', 'налётчики') +
      FACTIONS.filter(f => f.legend).map(f => dot(f.color, f.legend)).join('') +
      SPECIES.filter(s => s.look.color && !s.sentient).map(s => dot(s.look.color, s.legend || s.label)).join('') +
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
    $('clock').textContent = clockStr(w.tick);
    const S = season(w), left = Math.ceil(daysLeftInSeason(w.tick));
    $('season').textContent = `${S.label}, ${seasonDay(w.tick)}-й день · год ${yearOf(w.tick)}`;
    $('season').title = `${S.note} До смены сезона: ${left} ${plural(left, 'день', 'дня', 'дней')}.`;
    $('season').dataset.s = S.id;
    $('amb').textContent = ambientTemp(w).toFixed(1) + ' °C' + (w.weather.rain > 0.1 ? (season(w).snow ? ', снег' : ', дождь') : '') + (w.stats.fireCount ? ` · горит клеток: ${w.stats.fireCount}` : '');
    $('windTxt').textContent = w.wind.str < 0.03 ? 'штиль' : `ветер ${DIRS[Math.round(((w.wind.dir + 180) % 360) / 45) % 8]}, ${(w.wind.str * 10).toFixed(1)} м/с`;
    const col = colonists(w);
    $('popCount').textContent = col.length;
    $('goldCount').textContent = w.caravan && w.caravan.phase !== 'leaving' ? '●' : Math.floor(w.stock.gold || 0) ? Math.floor(w.stock.gold) : '';
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
    let head = `<dl class="kv"><dt>Казна</dt><dd>${gold.toFixed(1)} имперских золотых</dd>` +
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
    return `${this.waitText(w, at)}, если придёт (${Math.round(TRADE.chance * 100)}%)`;
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
      `<dt>Новый поселенец</dt><dd>${this.settlerText(w)}</dd>` +
      `<dt title="Налётчики не видят лагерь: они знают о нём по слухам, которые обновляются раз в день">Угроза налёта</dt><dd>${raidThreat(w).toFixed(1)} · банда ~${raidSize(w)}${RAIDS[w.cfg.raids].dist ? ` · ${this.waitText(w, w.outside.next.raiders)}, если выйдут (${Math.round((RAIDS[w.cfg.raids].chance ?? 1) * 100)}%)` : ''}</dd>` +
      `<dt>Соседи</dt><dd class="nb">${neighbours(w).filter(n => n.dist).map(n => `<span title="${esc(n.note)}">${esc(n.label)} · ${n.dist} дн. пути</span>`).join('<br>') || '—'}</dd>` +
      `<dt>Зайцы рядом</dt><dd>${hares} · добыто ${w.stats.hunted}</dd>` +
      (fishTotals(w)[1] ? `<dt>Рыба в озёрах</dt><dd>${Math.floor(fishTotals(w)[0])} из ${fishTotals(w)[1]}</dd>` : '<dt>Рыба в озёрах</dt><dd>нет больших озёр</dd>') +
      `<dt>Волки</dt><dd>${ofSpecies(w, 'wolf').length || 'нет'}</dd>` +
      `<dt title="Сколько руды можно выкопать с открытого склона скал">Руда на склонах</dt><dd class="nb">${ORES.all().map(o => `${o.label} ${Math.round(ore[o.id])}`).join(' · ')}</dd>`);
    $('pFlabel').textContent = `Поля (${w.n.toLocaleString('ru-RU')} клеток)`;
    $('pF').textContent = w.perf.fields.toFixed(2); $('pN').textContent = w.perf.nav.toFixed(2);
    $('pA').textContent = w.perf.agents.toFixed(2); $('pR').textContent = view.renderMs.toFixed(2);
    $('pT').textContent = tps.toFixed(0);
    $('pS').textContent = view.speed ? `×${(tps * TICK_MS / 1000).toFixed(1)} / ×${view.speed}` : 'пауза';
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
      goal = `<div class="goal">Копим на ${d.name.toLowerCase()}: ${Object.entries(d.cost).map(([r, v]) => `<span class="cost${(w.stock[r] || 0) >= v ? '' : ' short'}">${RESOURCES.get(r).label} ${Math.min(v, Math.floor(w.stock[r] || 0))}/${v}</span>`).join(' ')}</div>`;
    }
    this.set('council', `<div class="when">Следующий совет: ${when}</div><p class="decision">${c.decision}</p>${goal}${votes ? `<div class="votes">${votes}</div>` : ''}${args ? `<ul class="args">${args}</ul>` : ''}`);
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
      const note = n >= d.max || site ? '' : d.needs && !has(w, d.needs) ? `<span class="bneed">после: ${BUILDINGS.get(d.needs).name.toLowerCase()}</span>` : '';
      return `<div class="bcard${n ? ' built' : ''}"><div class="bhead"><i class="bmark" style="background:${d.color}">${d.mark}</i><b>${d.name}</b>${state}</div>
        <p>${d.effect}</p><div class="bfoot"><span class="costs">${costHtml(w, d.cost)}</span>${note}</div></div>`;
    }).join(''));
  }

  renderPeople(w, selected) {
    const col = colonists(w);
    const needs = SPECIES.get('human').needs.map(id => NEEDS.get(id));
    this.set('people', col.map(a => `<div class="person${a === selected ? ' sel' : ''}" data-id="${a.id}">
      <span class="nm">${esc(a.name)}</span><span class="task">${taskLabel(a)}${a.carry?.n ? ` · несёт ${a.carry.n}` : ''}</span><span class="likes">${traitsText(a)}</span><span class="gear">${gearText(a)}</span>
      <div class="bars" title="${needs.map(n => n.label).join(' · ')} · здоровье">${needs.map(n => bar(a.needs[n.id], n.color)).join('')}${bar(a.hp, 'var(--good)')}</div></div>`).join('')
      || '<div class="task">Колония погибла. Откройте «Меню мира», чтобы начать заново.</div>');
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
    if (d.station && b.done) {
      const workers = colonists(w).filter(x => x.task?.id === 'job' && x.task.station === d.id && w.grid.bld[cellOf(w, x)] === b.id).map(x => esc(x.name));
      rows.push(`<dt>Заказ</dt><dd>${orderText(b)}</dd>`, `<dt>Работают</dt><dd>${workers.join(', ') || 'никого'}</dd>`);
      const ctx = craftContext(w), cur = b.order?.recipe;
      const recs = RECIPES.filter(r => r.at === d.id).map(r => {
        const what = r.makes.item ? ITEMS.get(r.makes.item).label : `${RESOURCES.get(r.makes.resource).label} ×${r.makes.n}`;
        const cost = Object.entries(r.cost).map(([res, v]) => `<span class="cost${(w.stock[res] || 0) >= v ? '' : ' short'}">${v} ${RESOURCES.get(res).short}</span>`).join('') +
          (r.fuel ? `<span class="cost${smeltFuelTotal(w) >= r.fuel ? '' : ' short'}">${r.fuel} топлива</span>` : '');
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
    return `<div class="pc-head"><h3>Клетка ${x}, ${y}</h3>${close}</div><dl class="kv">${rows.join('')}</dl>`;
  }

  where(w, a) {
    const i = cellOf(w, a), dc = w.nav.get('camp')[i];
    if (dc < 3) return 'у костра';
    if (w.zone[i]) return 'в поселении';
    const d = Math.round(Math.hypot(a.x - w.camp.x, a.y - w.camp.y));
    return `в ${d} ${plural(d, 'клетке', 'клетках', 'клетках')} от лагеря`;
  }

  creatureHtml(w, a) {
    const sp = SPECIES.get(a.species), T = w.grid.temp[cellOf(w, a)].toFixed(1);
    const rows = [`<dt>Сейчас</dt><dd>${taskLabel(a)}, ${this.where(w, a)}</dd>`, `<dt>Здоровье</dt><dd>${Math.round(a.hp / sp.hp * 100)}%</dd>`];
    if (a.role === 'trader' && w.caravan?.traderId === a.id) {
      const c = w.caravan;
      rows.push(`<dt>Караван</dt><dd>${goodsUnits(c.goods)} мест груза, ${Math.floor(c.purse)} зол. в кошельке</dd>`);
    }
    if (a.owner != null) rows.push(`<dt>Поклажа</dt><dd>${a.load || 0} из 20 (два ящика по 10)</dd>`);
    if (sp.mule && a.owner == null) rows.push(`<dt>Нрав</dt><dd>${a.task?.mule ? 'в ярости' : 'спокоен'}; охотиться опасно</dd>`);
    if (sp.predator) {
      const b = boldness(a, sp.predator);
      rows.push(`<dt>Голод</dt><dd>${a.needs.food > 0.7 ? 'сыт' : a.needs.food > 0.35 ? 'голоден' : 'изголодался'} (${Math.round(a.needs.food * 100)}%)</dd>`,
        `<dt>Дерзость</dt><dd>${b < 0.2 ? 'осторожен' : b < 0.6 ? 'смелеет' : 'безрассуден'}</dd>`);
    }
    if (a.equip) rows.push(`<dt>Снаряжение</dt><dd>${gearText(a)}</dd>`);
    rows.push(`<dt>Под ногами</dt><dd>${T} °C</dd>`);
    const who = a.role === 'trader' ? 'купец' : a.role === 'guard' ? 'охранник каравана' : sp.label;
    const title = a.name.toLowerCase() !== who ? `${esc(a.name)}, ${who}` : who[0].toUpperCase() + who.slice(1);
    return `<div class="pc-head"><h3>${title}</h3><button type="button" class="pc-close" data-close aria-label="Закрыть">×</button></div><dl class="kv">${rows.join('')}</dl>`;
  }

  personHtml(w, a) {
    const sp = SPECIES.get(a.species), mood = moodOf(w, a);
    const traits = a.traits.map(id => `<span class="chip">${TRAITS.get(id).label}</span>`).join('');
    const fresh = a.diary.filter(e => e.until > w.tick && e.mood !== 0).sort((x, y) => Math.abs(y.mood) - Math.abs(x.mood)).slice(0, 2);
    const moodPct = Math.round((mood + 1) * 50);
    const needs = sp.needs.map(id => { const n = NEEDS.get(id); return `<div class="pc-bar"><span>${n.label}</span>${bar(a.needs[id], n.color)}<b>${Math.round(a.needs[id] * 100)}</b></div>`; }).join('') +
      `<div class="pc-bar"><span>здоровье</span>${bar(a.hp, 'var(--good)')}<b>${Math.round(a.hp * 100)}</b></div>`;
    const want = wishes(w, a, councilWish(w, a));
    const slots = SLOTS.map(s => {
      const it = a.equip?.[s.id];
      const txt = it ? itemDef(it).short + (Number.isFinite(it.dur) ? ` · ${Math.max(0, Math.round(it.dur / itemDef(it).dur * 100))}%` : '') + (it.ammo != null ? ` · стрел ${it.ammo}` : '') : '—';
      return `<dt>${s.label}</dt><dd>${txt}</dd>`;
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
      <div class="pc-grid">
        <section><h4>Характер</h4>
          <p class="pc-small">Любит ${JOBS.get(a.likes).label}, не любит ${JOBS.get(a.dislikes).label}.</p>
          ${a.food ? `<p class="pc-small">Любимая еда: ${FOODS.get(a.food.likes).label}${a.food.dislikes ? `, не любит: ${FOODS.get(a.food.dislikes).label}` : ''}.</p>` : ''}
          <div class="chips">${traits || '<span class="muted pc-small">ничем особым не выделяется</span>'}</div>
          <h4>Настроение</h4><div class="pc-moodbar"><i style="left:${moodPct}%"></i></div>
          <h4>Самочувствие</h4>${needs}
        </section>
        <section><h4>Хочет</h4>${want.length ? `<ul class="pc-list">${want.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted pc-small">Всем доволен.</p>'}
          <h4>Снаряжение</h4><dl class="kv">${slots}</dl>
          <h4>Навыки</h4><div class="chips">${skills}</div>
        </section>
        <section><h4>Дневник</h4><ul class="pc-diary">${diary || '<li class="muted">Пока ничего.</li>'}</ul></section>
      </div>`;
  }
}

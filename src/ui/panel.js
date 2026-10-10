// Side panels: weather, stock, council, buildings, colonists, performance, journal.
import {RESOURCES} from '../data/resources.js';
import {NEEDS} from '../data/needs.js';
import {JOBS} from '../data/jobs.js';
import {TRAITS} from '../data/traits.js';
import {SPECIES} from '../data/species.js';
import {BUILDINGS} from '../data/buildings.js';
import {clockStr, hourOf, dayOf, ambientTemp} from '../core/time.js';
import {esc, clamp} from '../core/util.js';
import {colonists, count, has, ofSpecies, popCap} from '../settlement/query.js';
import {councilDue, COUNCIL_FROM} from '../settlement/council.js';
import {taskLabel} from '../agents/tasks.js';
import {cellOf} from '../world/grid.js';
import {BY_CODE} from '../data/terrain.js';
import {$} from './dom.js';
import {LEVELS, LOG_TOPICS} from '../data/logTopics.js';
import {ITEMS, SLOTS} from '../data/items.js';
import {gearText, allItems, def as itemDef} from '../agents/equipment.js';
import {orderText} from '../settlement/crafting.js';

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
    $('amb').textContent = ambientTemp(w).toFixed(1) + ' °C' + (w.weather.rain > 0.1 ? ', дождь' : '');
    $('windTxt').textContent = w.wind.str < 0.03 ? 'штиль' : `${DIRS[Math.round(((w.wind.dir + 180) % 360) / 45) % 8]}, ${(w.wind.str * 10).toFixed(1)} м/с`;
    $('fires').textContent = w.stats.fireCount;
    const col = colonists(w), raiders = w.agents.filter(a => a.faction === 'raiders').length, hares = ofSpecies(w, 'hare').length;
    this.set('stock', RESOURCES.all().map(r => `<dt><i class="dot" style="background:${r.color}"></i>${r.label}</dt><dd>${(w.stock[r.id] || 0).toFixed(1)}</dd>`).join('') +
      `<dt>Костёр</dt><dd>${w.campLit ? 'горит' : w.stock.wood > 0.05 ? 'не нужен' : 'нет дров'}</dd>` +
      `<dt>Жители</dt><dd>${col.length} из ${popCap(w)}${raiders ? ` · налётчиков ${raiders}` : ''}</dd>` +
      `<dt>Зайцы рядом</dt><dd>${hares} · добыто ${w.stats.hunted}</dd>` +
      `<dt>Волки</dt><dd>${ofSpecies(w, 'wolf').length || 'нет'}</dd>`);
    this.renderCouncil(w);
    this.renderGear(w);
    this.renderBuildings(w);
    this.renderPeople(w, view.selected);
    $('pFlabel').textContent = `Поля (${w.n.toLocaleString('ru-RU')} клеток)`;
    $('pF').textContent = w.perf.fields.toFixed(2); $('pN').textContent = w.perf.nav.toFixed(2);
    $('pA').textContent = w.perf.agents.toFixed(2); $('pR').textContent = view.renderMs.toFixed(2);
    const now = performance.now();
    $('pT').textContent = view.speed ? ((w.tick - this.lastTick) / ((now - this.lastT) / 1000)).toFixed(0) : '0';
    this.lastTick = w.tick; this.lastT = now;
    this.renderLog(w);
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
    const counts = {};
    for (const it of w.armory) counts[it.type] = (counts[it.type] || 0) + 1;
    const store = Object.entries(counts).map(([t, n]) => `<span class="cost">${ITEMS.get(t).short}${n > 1 ? ' ×' + n : ''}</span>`).join('') || '<span class="muted">пусто, всё на руках</span>';
    const worn = {};
    for (const a of colonists(w)) for (const it of allItems(a)) worn[it.type] = (worn[it.type] || 0) + 1;
    const wornTxt = Object.entries(worn).map(([t, n]) => `${ITEMS.get(t).short} ${n}`).join(', ') || 'ничего';
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

  readout(w, selected, hoverCell) {
    const el = $('readout');
    if (selected && !selected.dead) {
      const a = selected, sp = SPECIES.get(a.species), T = w.grid.temp[cellOf(w, a)].toFixed(1);
      if (!a.prefs) { el.textContent = `${a.name !== sp.label ? a.name + ', ' : ''}${sp.label}: ${taskLabel(a)}${a.equip ? ' · ' + gearText(a) : ''} · здоровье ${Math.round(a.hp / sp.hp * 100)}% · под ногами ${T} °C`; return; }
      const needs = sp.needs.map(id => `${NEEDS.get(id).label} ${Math.round(a.needs[id] * 100)}%`).join(' · ');
      const skills = JOBS.filter(j => j.preferable).map(j => `${j.short} ${Math.round((a.skill[j.id] || 0) * 100)}`).join(', ');
      const slots = SLOTS.map(s => { const it = a.equip?.[s.id]; return `${s.label}: ${it ? itemDef(it).short + (Number.isFinite(it.dur) ? ` (${Math.max(0, Math.round(it.dur / itemDef(it).dur * 100))}%)` : '') + (it.ammo != null ? `, стрел ${it.ammo}` : '') : '—'}`; }).join('; ');
      el.textContent = `${a.name}: ${taskLabel(a)} · ${traitsText(a)} · ${slots} · навыки: ${skills} · ${needs} · здоровье ${Math.round(a.hp * 100)}% · под ногами ${T} °C`;
      return;
    }
    if (hoverCell < 0) return;
    const g = w.grid, i = hoverCell, d = w.nav.get('camp')[i];
    el.textContent = `(${i % w.w}, ${(i / w.w) | 0}) ${BY_CODE[g.terr[i]].label} · ${g.temp[i].toFixed(1)} °C · топливо ${g.fuel[i].toFixed(2)} · огонь ${g.fire[i].toFixed(2)} · дым ${g.smoke[i].toFixed(2)} · ягоды ${g.food[i].toFixed(2)} · древесина ${g.wood[i].toFixed(2)} · путь до лагеря ${d >= 1e8 ? 'нет' : d.toFixed(0)}`;
  }
}

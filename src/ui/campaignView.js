// The «Кампания» screen: a world from the library, a capital, and then the caravan walks the world
// like a screensaver. The core runs a season at a time (campaign/index.js stepCampaign: the world's
// season with the caravan's thirty days in it); the screen then plays the season back day by day —
// the caravan slides along the day's positions (K.track), the world's parties slide as on the «Мир»
// screen. The map is the «Мир» screen's own drawing (ui/atlasView.js), with the fog, the caravan, its
// way, its goal and its home on top.
import {AtlasView} from './atlasView.js';
import {listWorlds, openWorld, saveWorldToLibrary} from './worlds.js';
import {capitals, newCampaign, stepCampaign, ended, alive, pace} from '../campaign/index.js';
import {CAMPAIGN, RETINUE} from '../data/campaign.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {SEASONS} from '../data/seasons.js';
import {raceLabel} from '../agents/special.js';
import {atlasDone} from '../atlas/generate.js';
import {plural, esc} from '../core/util.js';
import {$} from './dom.js';
import {Camera} from '../render/camera.js';
import {ITEMS} from '../data/items.js';
import {BUILDINGS} from '../data/buildings.js';
import {BEASTS} from '../data/transport.js';
import {capacity, load, wheeled} from '../campaign/baggage.js';
import {baggageText} from '../campaign/march.js';
const itemShort = id => (ITEMS.has(id) ? ITEMS.get(id).short : id);

const SEASON_LIST = SEASONS.all();
// the pace: ms a season is played back over (a day is a thirtieth of it); «сразу» — as many seasons as fit a frame
const SPEEDS = [
  {id: 'x1', label: '×1', wait: 3000},
  {id: 'x4', label: '×4', wait: 750},
  {id: 'x16', label: '×16', wait: 190},
  {id: 'max', label: 'Сразу', wait: 30, budget: 30},
];
const LAYERS = [['relief', 'Рельеф'], ['biomes', 'Биомы'], ['peoples', 'Народы'], ['fauna', 'Звери']];
const PHASE = {out: 'идут к цели', back: 'возвращаются домой', won: 'вернулись с победой', lost: 'погибли', timeout: 'не вернулись'};
const seasonWord = s => SEASON_LIST[s % SEASON_LIST.length].label.toLowerCase();

export class CampaignView extends AtlasView {
  // the «Мир» screen's controls are not built here: only the campaign's
  build() {
    this.layer = 'peoples'; this.capPick = null; this.logShown = 0; this.fog = null; this.fogKey = '';
    this.wireCamera({map: 'campMap', readout: 'campReadout', zoomIn: 'campZoomIn', zoomOut: 'campZoomOut', zoomFit: 'campZoomFit', screen: 'campaign',
      hint: 'Наведите на карту, чтобы увидеть клетку.'});
    const lay = $('campLayer');
    lay.innerHTML = LAYERS.map(([id, l]) => `<button type="button" data-val="${id}" aria-pressed="${id === this.layer}">${l}</button>`).join('');
    lay.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.layer = b.dataset.val; lay.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.draw(); });
    const sp = $('campSpeed');
    sp.innerHTML = SPEEDS.map(S => `<button type="button" data-val="${S.id}" aria-pressed="${S.id === this.speed}">${S.label}</button>`).join('');
    sp.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.speed = b.dataset.val; this.paused = false; this.syncRun(); this.run(); });
    $('campPause').addEventListener('click', () => { this.paused = !this.paused; this.syncRun(); if (!this.paused) this.run(); });
    $('campWorlds').addEventListener('click', e => { const row = e.target.closest('.sv'); if (row) this.openFromLibrary(row.dataset.id, row.dataset.name); });
    $('campCaps').addEventListener('click', e => { const row = e.target.closest('.sv'); if (!row) return; this.capPick = +row.dataset.town; this.renderCaps(); this.draw(); });
    $('campGo').addEventListener('click', () => this.begin());
    $('campNew').addEventListener('click', () => { this.halt(); this.atlas = null; this.worldId = null; this.setupMode(); this.refresh(); });
    $('campSave').addEventListener('click', () => this.saveRun());
    $('campBack').addEventListener('click', () => { this.halt(); this.onBack(); });
  }

  show() { this.refresh(); if (this.atlas?.campaign) { this.runMode(); this.draw(); } else this.setupMode(); }
  // leaving the screen: the walk halts between seasons and waits
  halt() { clearTimeout(this.timer); this.timer = 0; if (this.atlas?.campaign && !ended(this.atlas.campaign)) this.paused = true; this.syncRun(); }

  // ── setup: a world, a capital
  async refresh() {
    const box = $('campWorlds');
    let list;
    try { list = await listWorlds(); } catch (e) { box.innerHTML = '<small>Библиотека в этом браузере недоступна.</small>'; return; }
    if (!list.length) { box.innerHTML = '<small>Пока нет сохранённых миров: сотворите мир на экране «Мир» и сохраните его.</small>'; return; }
    box.innerHTML = list.map(r => `<div class="sv${r.id === this.worldId ? ' cur' : ''}" data-id="${esc(r.id)}" data-name="${esc(r.name)}"><span class="t"><b>${esc(r.name)}</b> · ${esc(r.sizeLabel)} · ${r.year} лет` +
      (r.campaign ? `<br><small>поход из ${esc(r.campaign.from)}: ${PHASE[r.campaign.phase] || r.campaign.phase}, ${Math.round(r.campaign.day / 12) / 10} лет в пути</small>` : `<br><small>городов ${r.towns} · держав ${r.realms}${r.done ? '' : ' · история не дожита'}</small>`) +
      `</span><button type="button">${r.campaign && !['won', 'lost', 'timeout'].includes(r.campaign.phase) ? 'Продолжить' : 'Открыть'}</button></div>`).join('');
  }

  async openFromLibrary(id, name) {
    this.halt();
    $('campWorldNote').textContent = 'Открываю мир…';
    try {
      const a = await openWorld(id);
      if (!atlasDone(a) && !a.campaign) { $('campWorldNote').textContent = 'История этого мира не дожита: доведите её до конца на экране «Мир».'; return; }
      this.atlas = a; this.worldId = id; this.worldName = name; this.saveId = a.campaign ? id : null;
      this.cam = null; this.bitmap = null; this.bitmapKey = ''; this.fogKey = ''; this.logShown = 0; this.capPick = null;
      this.cam = new Camera(a.w, a.h);
      $('campWorldNote').textContent = '';
      if (a.campaign) { this.paused = true; this.runMode(); }
      else this.setupMode();
      this.refresh(); this.draw();
    } catch (e) { $('campWorldNote').textContent = 'Не удалось открыть: ' + e.message; }
  }

  setupMode() {
    $('campSetup').hidden = false; $('campRun').hidden = true;
    $('campTitle').textContent = this.atlas ? this.worldName : 'Кампания';
    $('campCapsField').hidden = !this.atlas;
    this.renderCaps(); this.renderLog();
  }
  renderCaps() {
    const a = this.atlas; if (!a) { $('campGo').disabled = true; return; }
    const caps = capitals(a);
    $('campCaps').innerHTML = caps.length ? caps.map(c => `<div class="sv cap${c.town === this.capPick ? ' cur' : ''}" data-town="${c.town}"><span class="t"><i style="background:rgb(${WORLD_PEOPLES.get(c.people).color.join(',')})"></i><b>${esc(c.label)}</b> · ${esc(c.peopleLabel)}` +
      `<br><small>${esc(c.realmLabel)} · ${c.towns} ${plural(c.towns, 'город', 'города', 'городов')} · ${c.pop} жителей · ${RETINUE[c.people].knight[1]} и ${RETINUE[c.people].squire[1]}</small></span><button type="button">Выбрать</button></div>`).join('')
      : '<small>В этом мире нет столиц людей, эльфов, гномов или орков.</small>';
    $('campGo').disabled = this.capPick == null;
  }

  begin() {
    const a = this.atlas; if (!a || this.capPick == null) return;
    newCampaign(a, this.capPick);
    this.saveId = null; this.logShown = 0; this.paused = false;
    this.runMode(); this.run();
  }

  // ── the walk
  runMode() {
    $('campSetup').hidden = true; $('campRun').hidden = false;
    const K = this.atlas.campaign;
    $('campTitle').textContent = `Поход из ${K.capitalFrom || K.capitalName}`;
    this.syncRun(); this.renderSide();
    const sw = (c, l) => `<span><i style="background:${c}"></i>${l}</span>`;
    $('campLegend').innerHTML = sw(`rgb(${WORLD_PEOPLES.get(K.people).color.join(',')})`, 'караван (флажок)') + sw('rgba(255,215,110,0.8)', 'путь пешком (пунктир), цель (×), дом (кольцо)') + sw('rgba(240,160,90,0.9)', 'путь с колёсами — по дорогам (длинный штрих)') +
      sw('rgb(40,42,36)', 'туман: чего караван не знает') + '<b>карта</b> — как на экране «Мир»: города, дороги, логова, отряды и войска';
  }
  syncRun() {
    const K = this.atlas?.campaign, done = !K || ended(K);
    $('campPause').hidden = done; $('campSpeed').hidden = done;
    $('campPause').textContent = this.paused ? 'Дальше' : 'Пауза';
    $('campSpeed').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === this.speed)));
  }

  run() {
    const a = this.atlas; clearTimeout(this.timer);
    const next = () => {
      if (a !== this.atlas || this.paused || !a.campaign || ended(a.campaign)) { this.syncRun(); return; }
      const sp = SPEEDS.find(S => S.id === this.speed) || SPEEDS[0], t0 = Date.now();
      do { stepCampaign(a); } while (sp.budget && !ended(a.campaign) && Date.now() - t0 < sp.budget);
      this.tickAt = performance.now(); this.tickWait = sp.budget ? 0 : sp.wait;
      this.renderSide(); this.draw(); this.animate();
      if (!ended(a.campaign)) this.timer = setTimeout(next, sp.wait); else this.syncRun();
    };
    this.timer = setTimeout(next, 30);
  }
  // the season plays back: a frame loop while the caravan slides along its days
  animate() {
    if (this.raf) return;
    const loop = () => {
      this.raf = 0;
      if (!this.atlas?.campaign || this.paused || !this.tickWait || this.slide() >= 1) { this.draw(); return; }
      this.draw(); this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // where the caravan is at this moment of the playback
  caravanAt() {
    const K = this.atlas.campaign, T = K.track;
    if (!T.length) return [K.x, K.y];
    const t = this.slide(), f = t * (T.length - 1), k = Math.floor(f), u = f - k, p = T[k], q = T[Math.min(T.length - 1, k + 1)];
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  }

  // the fog: what the caravan does not know is dimmed (a bitmap a pixel a cell, rebuilt each season)
  fogBitmap(a, K) {
    const key = `${K.day}:${a.w}`;
    if (this.fog && this.fogKey === key) return this.fog;
    const off = this.fog || document.createElement('canvas'); off.width = a.w; off.height = a.h;
    const px = off.getContext('2d'), img = px.createImageData(a.w, a.h), d = img.data;
    for (let i = 0; i < a.n; i++) if (!K.seen[i]) { d[i * 4] = 10; d[i * 4 + 1] = 12; d[i * 4 + 2] = 9; d[i * 4 + 3] = 190; }
    px.putImageData(img, 0, 0);
    this.fog = off; this.fogKey = key;
    return off;
  }

  overlay(a, px, cam) {
    const K = a.campaign, k = this.unit(a);
    if (!K) {   // choosing: the capitals, the picked one ringed
      for (const c of capitals(a)) {
        const r = (c.town === this.capPick ? 2.4 : 1.4) * Math.max(0.6, k);
        px.strokeStyle = c.town === this.capPick ? '#ffd36a' : 'rgba(255,250,235,0.7)'; px.lineWidth = Math.max(this.minW, 0.25 * k);
        px.beginPath(); px.arc(c.x + 0.5, c.y + 0.5, r, 0, Math.PI * 2); px.stroke();
      }
      return;
    }
    px.imageSmoothingEnabled = false;
    px.drawImage(this.fogBitmap(a, K), 0, 0, a.w, a.h);
    const [x, y] = this.caravanAt(), col = WORLD_PEOPLES.get(K.people).color, r = Math.max(0.7, 1.1 * k);
    // the way ahead, the goal, home
    if (K.path && K.k < K.path.length && !ended(K)) {
      px.strokeStyle = wheeled(K) ? 'rgba(240,160,90,0.75)' : 'rgba(255,215,110,0.6)'; px.lineWidth = Math.max(this.minW, (wheeled(K) ? 0.26 : 0.18) * k); px.setLineDash(wheeled(K) ? [1.1 * k, 0.4 * k] : [0.5 * k, 0.6 * k]);
      px.beginPath(); px.moveTo(K.x, K.y);
      for (let q = K.k; q < K.path.length; q++) px.lineTo(K.path[q] % a.w + 0.5, ((K.path[q] / a.w) | 0) + 0.5);
      px.stroke(); px.setLineDash([]);
    }
    const mark = (i, color, size) => { const gx = i % a.w + 0.5, gy = ((i / a.w) | 0) + 0.5, s = size * Math.max(0.6, k); px.strokeStyle = color; px.lineWidth = Math.max(this.minW * 1.5, 0.3 * k); px.beginPath(); px.moveTo(gx - s, gy - s); px.lineTo(gx + s, gy + s); px.moveTo(gx + s, gy - s); px.lineTo(gx - s, gy + s); px.stroke(); };
    if (K.goal != null && K.phase === 'out') mark(K.goal, '#ffd36a', 1.4);
    px.strokeStyle = 'rgba(255,215,110,0.9)'; px.lineWidth = Math.max(this.minW, 0.25 * k);
    px.beginPath(); px.arc(K.home % a.w + 0.5, ((K.home / a.w) | 0) + 0.5, 1.8 * Math.max(0.6, k), 0, Math.PI * 2); px.stroke();
    // the caravan: a banner in the people's colour
    px.fillStyle = ended(K) && K.phase !== 'won' ? 'rgb(90,90,90)' : `rgb(${col.join(',')})`; px.strokeStyle = 'rgba(255,250,235,0.95)'; px.lineWidth = Math.max(this.minW, 0.25 * k);
    px.beginPath(); px.arc(x, y, r, 0, Math.PI * 2); px.fill(); px.stroke();
    px.beginPath(); px.moveTo(x, y - r); px.lineTo(x, y - 3 * r); px.lineTo(x + 1.6 * r, y - 2.5 * r); px.lineTo(x, y - 2 * r); px.stroke();
  }

  renderSide() {
    const a = this.atlas, K = a.campaign; if (!K) return;
    const ms = alive(K), need = ms.length * CAMPAIGN.ration, H = a.hist;
    const doing = {heal: 'лагерь: раненые отлёживаются', food: 'лагерь: охотятся и собирают', build: K.build ? `лагерь: ${K.build.kind === 'building' ? `рубят «${BUILDINGS.get(K.build.id).name}»` : K.build.kind === 'cart' ? 'сколачивают тележку' : 'сколачивают повозку'}, ещё ${K.build.days} дн.` : 'лагерь: строят'};
    const tameKind = K.why?.startsWith('tame:') ? BEASTS[K.why.slice(5)] : null;
    const plan = ended(K) ? PHASE[K.phase] : K.hungry ? `голодают ${K.hungry} ${plural(K.hungry, 'день', 'дня', 'дней')}` : K.camp > 0 ? (tameKind ? `лагерь: приручают — ${tameKind.plural}` : doing[K.why] || 'лагерь') : PHASE[K.phase];
    $('campStatus').innerHTML = `<dt>Дата</dt><dd>год ${H.year}, ${seasonWord(H.season)}</dd>` +
      `<dt>В пути</dt><dd>${K.day} ${plural(K.day, 'день', 'дня', 'дней')} (${(K.day / 120).toFixed(1)} г.)</dd>` +
      `<dt>Что делают</dt><dd>${plan}</dd>` +
      `<dt>Еда</dt><dd>${Math.floor(K.food)} ${plural(Math.floor(K.food), 'паёк', 'пайка', 'пайков')} · на ${need ? (K.food / need).toFixed(1) : 0} дн.</dd>` +
      `<dt>Груз</dt><dd>${Math.round(load(K))} из ${capacity(K)} мест</dd>` +
      `<dt>Обоз</dt><dd class="nb">${esc(baggageText(K))}</dd>` +
      (K.route ? `<dt>Путь</dt><dd>${K.route === 'road' ? 'с обозом по дорогам' : 'напрямик, налегке'}</dd>` : '') +
      `<dt>Казна</dt><dd>${K.gold} зол.</dd>` +
      `<dt>Скорость</dt><dd>${pace(a, K, SEASON_LIST[H.season].id).toFixed(2)} кл./день</dd>` +
      `<dt>Пройдено</dt><dd>${Math.round(K.stats.walked)} клеток</dd>` +
      `<dt>Ночных боёв</dt><dd>${K.stats.fights} · отбились ${K.stats.won}</dd>`;
    $('campRoster').innerHTML = K.members.map(m => {
      const sp = SPECIES.get(m.race), rk = RETINUE[K.people][m.role][0];
      const mount = m.ride ? K.beasts.find(b => b.id === m.ride) : null, extra = [mount ? `верхом: ${BEASTS[mount.kind].label}` : '', (m.back ?? 1) > 1 ? 'с коробом' : ''].filter(Boolean).join(', ');
      return `<div class="rm${m.alive ? '' : ' dead'}"><span><b>${esc(m.name)}</b> · ${rk}${m.alive && extra ? ` <small style="display:inline;color:var(--muted)">(${extra})</small>` : ''}</span><span class="hp"><i class="${m.hp < 0.4 ? 'low' : ''}" style="width:${Math.round(Math.max(0, m.hp) * 100)}%"></i></span>` +
        `<small>${esc(raceLabel(sp, m))} · ${m.gear.hand.map(itemShort).join(', ')} · ${itemShort(m.gear.body)}${m.alive ? '' : ` · ${esc(m.died.why)}, ${m.died.year}-й год`}</small></div>`;
    }).join('');
    this.renderLog();
  }

  renderLog() {
    const box = $('campLog'), K = this.atlas?.campaign;
    if (!K) { box.innerHTML = '<small class="muted">Летопись начнётся, когда караван выступит.</small>'; this.logShown = 0; return; }
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
    if (this.logShown === 0) box.innerHTML = '';
    if (K.log.length > this.logShown) {
      box.insertAdjacentHTML('beforeend', K.log.slice(this.logShown).map(l => `<div><small>год ${l.year}, ${seasonWord(l.season)}, день ${l.day + 1}</small> ${esc(l.text)}</div>`).join(''));
      this.logShown = K.log.length;
    }
    if (atEnd) box.scrollTop = box.scrollHeight;
  }

  async saveRun() {
    const a = this.atlas; if (!a?.campaign) return;
    const say = t => { $('campSaveStatus').textContent = t; };
    say('Сохраняю…');
    try { const rec = await saveWorldToLibrary(a, this.saveId ? this.worldName : `${this.worldName}: поход из ${a.campaign.capitalFrom || a.campaign.capitalName}`, this.saveId); this.saveId = rec.id; this.worldId = rec.id; this.worldName = rec.name; say(`Сохранено: «${rec.name}».`); this.refresh(); }
    catch (e) { say('Не удалось сохранить: ' + e.message); }
  }
}

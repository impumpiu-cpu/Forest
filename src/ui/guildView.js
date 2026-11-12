// The adventurers' guild on the campaign screen (plan claude/guild-plan.md Г1; docs/GUILD.md). The same screen as the walk
// (ui/campaignView.js: the world's map, the expedition's march and camps, the chronicles) with the guild on top: founding it in
// a capital, taking in eight of twenty at its door, and then its panel in the rail («Гильдия»): the people with what each is
// doing, the board — the deeds in town (tier 0) and the world's errands (tier 1 and up) — and the guild's chronicle. The clock
// runs the world's seasons whether an expedition is out or not (campaign/guild.js stepGuild); an expedition out is shown as a
// campaign is (its camps on the local map while watched: «⚔»; else only its lines).
import {CampaignView, errandCards, errandPicked, itemShort, baseName, clockTime} from './campaignView.js';
import {foundGuild, hire, stepGuild, guildBoard, takeChore, launch, launchWhy, muster, musterWhy, namedMost, devotionOf, expedition, membersOf, healing, ageOf, roleWord, questWord, GUILD, levelOn, toNext} from '../view/campaign.js';
import {SPECIES} from '../data/species.js';
import {SEASONS} from '../data/seasons.js';
import {raceLabel} from '../view/local.js';
import {saveWorldToLibrary} from './worlds.js';
import {rememberRun, forgetRun, saveDue} from './autosave.js';
import {WATCH} from './campLocal.js';
import {plural, esc} from '../core/util.js';
import {$, seg, press} from './dom.js';
import {CampShell} from './shell/campShell.js';

const TABS = [['people', 'Люди'], ['board', 'Доска'], ['log', 'Летопись']];
const STATE = {ready: 'дома', chore: 'на деле', expedition: 'в походе', dead: 'погиб', left: 'ушёл'};
const LOG_LINES = 80;   // the guild's chronicle in its tab: the last lines

export class GuildView extends CampaignView {
  build() {
    super.build();
    this.guildOn = false; this.gpick = new Set(); this.gtab = 'people'; this.offerUid = null; this.gerrand = null; this.hirePick = new Set(); this.gsize = GUILD.party.max;
    seg('guildTabs', TABS, this.gtab, v => { this.gtab = v; this.renderGuild(); });
    $('guildBody').addEventListener('change', e => {
      const box = e.target.closest('input[data-mid]'); if (box) { box.checked ? this.gpick.add(+box.dataset.mid) : this.gpick.delete(+box.dataset.mid); this.renderGuild(); return; }
      const o = e.target.closest('input[name="gchore"]'); if (o) { this.offerUid = o.value; this.renderGuild(); return; }
      const sz = e.target.closest('select[data-gsize]'); if (sz) { this.gsize = +sz.value; this.renderGuild(); return; }
      const r = e.target.closest('input[name="gerrand"]'); if (r) { this.gerrand = r.value; this.renderGuild(); this.lookAtCard(r.value); }
    });
    $('guildBody').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      if (b.dataset.act === 'chore') this.doChore(); else if (b.dataset.act === 'launch') this.doLaunch(); else if (b.dataset.act === 'none') { this.gpick.clear(); this.renderGuild(); }
    });
    // the board's errands ring their targets on the map, as the capital's board does (ui/campaignView.js drawBoard)
    const box = $('guildBody'), hover = card => { if ((card ?? null) !== this.boardHover) { this.boardHover = card ?? null; this.draw(); } };
    box.addEventListener('pointerover', e => hover(e.target.closest('[data-card]')?.dataset.card));
    box.addEventListener('pointerleave', () => hover(null));
    $('guildHireList').addEventListener('change', e => {
      const b = e.target.closest('input[data-mid]'); if (!b) return;
      if (b.checked && this.hirePick.size >= GUILD.start.pick) { b.checked = false; return; }
      b.checked ? this.hirePick.add(+b.dataset.mid) : this.hirePick.delete(+b.dataset.mid); this.syncHire();
    });
    $('guildHireGo').addEventListener('click', () => this.doHire());
  }
  get G() { return this.atlas?.guild || null; }

  // mode as the campaign's ('library' | 'epic'); guild — the guild's game (forest.html «Гильдия»), else the quick campaign
  show(mode = 'library', {guild = this.guildOn} = {}) {
    if (guild !== this.guildOn && this.atlas && !this.atlas.guild && !(this.atlas.campaign && !this.atlas.campaign.closed)) { this.atlas = null; this.worldId = null; }
    this.guildOn = guild;
    super.show(mode);
    if (this.guildOn && this.G) this.guildMode();
  }
  setupMode() {
    super.setupMode();
    $('guildFoundField').hidden = !this.guildOn || !this.atlas;
    $('campGo').textContent = this.guildOn ? 'Основать гильдию' : 'Выступить';
    if (this.guildOn) { $('campErrandsField').hidden = true; $('campHeroesField').hidden = true; }
    $('guildSide').hidden = true;
  }
  renderErrands() { if (this.guildOn) { $('campErrandsField').hidden = true; $('campGo').disabled = this.capPick == null; $('campQuestNote').textContent = ''; return; } super.renderErrands(); }
  async renderHeroes() { if (this.guildOn) { $('campHeroesField').hidden = true; return; } return super.renderHeroes(); }
  async openFromLibrary(id, name) {
    await super.openFromLibrary(id, name);
    if (this.atlas?.guild && this.worldId === id) { this.guildOn = true; this.saveId = id; this.saved = {a: this.atlas, mark: this.gmark(), at: Date.now()}; this.guildMode(); }
  }
  showOffer() { if (this.atlas?.guild) return; super.showOffer(); }   // (an expedition back is the guild's: no capital's offer)

  // «Основать гильдию»: the house in the capital picked, then the door (doHire)
  async begin() {
    if (!this.guildOn) return super.begin();
    const a = this.atlas; if (!a || this.capPick == null) return;
    try { foundGuild(a, this.capPick, {name: $('guildName').value.trim() || null}); } catch (e) { $('campQuestNote').textContent = e.message; return; }
    this.saveId = null; this.saved = null; this.logShown = 0; this.logKey = ''; this.who = null;
    this.guildMode();
  }
  syncHire() {
    $('guildHireCount').textContent = `выбрано ${this.hirePick.size} из ${GUILD.start.pick}`;
    $('guildHireGo').disabled = this.hirePick.size !== GUILD.start.pick;
  }
  showHire() {
    const a = this.atlas, G = this.G; if (G?.phase !== 'hire') { $('guildHire').hidden = true; return; }
    const t = a.towns.find(x => x.id === G.town);
    $('guildHireTitle').textContent = `К дверям гильдии «${G.name}» пришли`;
    $('guildHireText').textContent = `${G.candidates.length} ${plural(G.candidates.length, 'человек', 'человека', 'человек')} из ${t?.name || 'столицы'}: в стартовом снаряжении, первого уровня. Возьмите ${GUILD.start.pick} — остальные уйдут. Смотрите на роли (нужны линия, стрелки и знахарь), буквы и годы: эльф прослужит века, гоблин — несколько лет.`;
    $('guildHireList').innerHTML = G.candidates.map(m => `<label class="sv${this.hirePick.has(m.id) ? ' cur' : ''}"><input type="checkbox" data-mid="${m.id}"${this.hirePick.has(m.id) ? ' checked' : ''}>` +
      `<span class="t"><b>${esc(m.name)}</b> · ${esc(roleWord(m))} · ${esc(raceLabel(SPECIES.get(m.race)))}, ${ageOf(a, m)} ${plural(ageOf(a, m), 'год', 'года', 'лет')}` +
      `<br><small>${letters(m)} · ${esc([...m.gear.hand, m.gear.body].filter(Boolean).map(itemShort).join(', '))}</small></span></label>`).join('');
    $('guildHire').hidden = false; this.syncHire();
  }
  doHire() {
    try { hire(this.atlas, [...this.hirePick]); } catch (e) { $('guildHireCount').textContent = e.message; return; }
    this.hirePick.clear(); $('guildHire').hidden = true;
    this.guildMode(); this.autosave(true);
  }

  // ── the guild's game: the screen as the walk's, the guild's panel in the rail
  guildMode() {
    const G = this.G; if (!G) return;
    this.guildOn = true; this.choosing = false; this.hideOffer?.();
    $('campSetup').hidden = true; $('campRun').hidden = false; $('campRunSide').hidden = !this.atlas.campaign; $('guildSide').hidden = false;
    this.setupShell?.leave(); (this.shell ||= new CampShell(this)).enter();
    this.syncGuildRail();
    $('campTitle').textContent = `Гильдия «${G.name}»`; $('campName2').textContent = baseName(this.worldName) || '';
    if (G.phase === 'hire') { this.clock.stop(); this.showHire(); this.syncRun(); return; }
    $('guildHire').hidden = true;
    if (!this.cam) return;
    this.renderGuild(); this.renderSide(); this.syncRun(); this.draw();
    if (this.shell?.open !== 'guild') this.shell?.toggle('guild');
  }
  syncGuildRail() { const b = this.shell?.rail?.querySelector('[data-menu="guild"]'); if (b) b.hidden = !this.G; }
  runMode() {
    super.runMode();
    this.syncGuildRail();
    if (this.G) { $('campTitle').textContent = `Гильдия «${this.G.name}»`; $('guildSide').hidden = false; }
  }
  renderSide() {
    if (this.atlas?.campaign) super.renderSide(); else { this.renderFights?.(); this.renderSummary?.(); this.renderWorldLog(); this.frame(); }
    $('campRunSide').hidden = !this.atlas?.campaign;
    if (this.G) this.renderGuild();
  }

  // the clock: the world's season with the guild in it; an expedition out — its camps to watch, as the walk's (campaignView)
  run() { if (!this.G) return super.run(); if (this.G.phase === 'open') this.clock.start(); this.syncRun(); }
  syncRun() {
    if (!this.G) return super.syncRun();
    const open = this.G.phase === 'open';
    $('campAgain').hidden = true; $('campAscend').hidden = true;
    $('campPause').hidden = !open; $('campSpeed').hidden = !open;
    this.syncPaceBox?.();
    if (this.local) $('campPause').textContent = this.ticks.paused ? 'Дальше' : 'Пауза';
  }
  stepSeason() {
    const a = this.atlas, G = this.G; if (!G) return super.stepSeason();
    if (G.phase !== 'open') return false;
    const K0 = expedition(a), d0 = K0?.day ?? 0;
    this.autosave();
    const more = stepGuild(a);
    const K = a.campaign;
    if (K0 && K0 === K) {   // the expedition's camps of this season, each at its day of the playback (as campaignView.stepSeason)
      const W = WATCH[this.clock.pace], n = Math.max(1, K.track.length - 1);
      this.queue = this.watch ? (K.camps || []).filter(c => c.day >= d0 && (c.boss || (W && (c.kind !== 'stop' || W.stops)))).map(c => ({...c, at: Math.min(1, (c.day - d0) / n)})) : [];
    } else this.queue = [];
    if (K0 && K0.closed) { this.pauseAfter = `Отряд вернулся: ${G.expeditions.at(-1)?.how || ''}.`; }
    if (!more) this.autosave(true);
    return more;
  }
  afterSeason() {
    super.afterSeason();
    if (this.G) this.renderGuild();
    if (this.pauseAfter) { const t = this.pauseAfter; this.pauseAfter = null; $('guildNote').textContent = t; this.clock.pause(); this.syncRun(); if (this.shell?.open !== 'guild') this.shell?.toggle('guild'); }
  }

  // the map: an expedition out (or the last one back) as the walk draws it; none — the guild's house ringed and the board's targets
  overlay(a, px, cam) {
    if (!this.G || this.choosing || a.campaign) return super.overlay(a, px, cam);
    const t = a.towns.find(x => x.id === this.G.town), k = this.unit(a);
    if (t) { px.strokeStyle = '#ffd36a'; px.lineWidth = Math.max(this.minW, 0.3 * k); px.beginPath(); px.arc(t.x + 0.5, t.y + 0.5, 2.4 * Math.max(0.6, k), 0, Math.PI * 2); px.stroke(); }
    // the camps of the contracts (campaign/contracts.js), those whose place is known: a small tent each
    px.fillStyle = '#d8573f';
    for (const c of this.board || []) if (c.at && c.ok !== undefined) { const x = c.at.x + 0.5, y = c.at.y + 0.5, s = 0.9 * Math.max(0.6, k); px.beginPath(); px.moveTo(x, y - s); px.lineTo(x + s, y + s * 0.7); px.lineTo(x - s, y + s * 0.7); px.closePath(); px.fill(); }
    this.drawBoard(a, px, k);
  }

  // the board's card picked and its home (ui/campaignView.js drawBoard); a lair clicked on the map picks its card
  get boardPick() { return this.G ? () => this.gerrand : null; }
  boardHome() { return this.G?.town ?? null; }
  pickCardAt(e) {
    if (!this.G) return super.pickCardAt(e);
    const i = this.cellAt(e); if (i < 0 || !this.board) return false;
    const x = i % this.atlas.w, y = (i / this.atlas.w) | 0;
    const c = this.board.find(b => b.ok && b.at && Math.abs(b.at.x - x) <= 1 && Math.abs(b.at.y - y) <= 1); if (!c) return false;
    this.gerrand = c.id; this.gtab = 'board'; press('guildTabs', 'board'); this.renderGuild(); this.lookAtCard(c.id);
    if (this.shell?.open !== 'guild') this.shell?.toggle('guild');
    return true;
  }

  // ── the panel
  renderGuild() {
    const a = this.atlas, G = this.G; if (!G || G.phase === 'hire') return;
    const K = expedition(a), ms = membersOf(G);
    $('guildStatus').innerHTML = `<dt>Казна</dt><dd>${G.gold} зол.</dd><dt>Слава</dt><dd>${G.fame}</dd>` +
      `<dt>Людей</dt><dd>${ms.length} · дома ${ms.filter(m => m.guild.state === 'ready').length}${ms.some(m => m.guild.state === 'chore') ? ` · на делах ${ms.filter(m => m.guild.state === 'chore').length}` : ''}${K ? ` · в походе ${ms.filter(m => m.guild.state === 'expedition').length}` : ''}</dd>` +
      `<dt>Отряд</dt><dd>${K ? `в пути ${K.day} ${plural(K.day, 'день', 'дня', 'дней')}: ${esc(questWord(K))}` : 'дома'}</dd>` +
      (G.phase === 'over' ? '<dt>Гильдия</dt><dd>закрыта</dd>' : '');
    for (const id of [...this.gpick]) if (!ms.some(m => m.id === id && m.guild.state === 'ready')) this.gpick.delete(id);
    $('guildBody').innerHTML = this.gtab === 'people' ? this.peopleHtml() : this.gtab === 'board' ? this.boardHtml() : this.logHtml();
  }
  // one member: a tick to pick (at the house only), name, role, level, years, health, what he is doing, wage
  memberRow(m, pickable = true) {
    const a = this.atlas, G = this.G, st = m.guild.state, free = st === 'ready', K = expedition(a) || {members: [m], day: 0};
    const doing = st === 'chore' ? `на деле до ${m.guild.until - G.day > 0 ? `${m.guild.until - G.day} ${plural(m.guild.until - G.day, 'дня', 'дней', 'дней')}` : 'вечера'}` : st === 'ready' && healing(m) ? 'лечится' : STATE[st] || st;
    const lv = m.level || 1, nx = toNext(K, m, K.day);
    return `<label class="gm${free ? '' : ' busy'}${m.alive ? '' : ' dead'}">${pickable ? `<input type="checkbox" data-mid="${m.id}"${this.gpick.has(m.id) ? ' checked' : ''}${free ? '' : ' disabled'}>` : ''}` +
      `<span class="t"><b>${esc(m.name)}</b> · ${esc(roleWord(m))}, ур. ${lv} · ${esc(raceLabel(SPECIES.get(m.race)))}, ${ageOf(a, m)} ${plural(ageOf(a, m), 'год', 'года', 'лет')} · <i>${esc(doing)}</i>` +
      `<span class="hp"><i class="${(m.hp ?? 1) < 0.4 ? 'low' : ''}" style="width:${Math.round(Math.max(0, m.hp ?? 1) * 100)}%"></i></span>` +
      (nx != null ? `<span class="xp" title="опыт до ${lv + 1}-го уровня: ${Math.round(nx * 100)}%"><i style="width:${Math.round(nx * 100)}%"></i></span>` : '') +
      `<small>${letters(m)} · ${esc([...m.gear.hand, m.gear.body].filter(Boolean).map(itemShort).join(', '))}${m.maims ? ` · увечий ${m.maims}` : ''} · верность ${Math.round(devotionOf(m) * 100)}%</small></span></label>`;
  }
  peopleHtml() {
    const G = this.G, live = membersOf(G), gone = G.members.filter(m => !live.includes(m));
    return `<p class="note">Отметьте, кого послать: на дело в городе или в поход — на «Доске». Раненые лечатся дома сами; жалованье — каждый сезон из казны.</p>` +
      `<div class="savelist guild-people">${live.map(m => this.memberRow(m)).join('')}</div>` +
      (this.gpick.size ? `<div class="row"><small>Выбрано: ${this.gpick.size}</small><button type="button" class="quiet mini" data-act="none">снять</button></div>` : '') +
      (gone.length ? `<details class="obs-lib"><summary>Ушедшие и павшие (${gone.length})</summary><div class="savelist guild-people">${gone.map(m => this.memberRow(m, false)).join('')}</div></details>` : '');
  }
  boardHtml() {
    const a = this.atlas, G = this.G, ids = [...this.gpick], B = guildBoard(a, ids), K = expedition(a);
    if (this.offerUid && !B.chores.some(o => o.uid === this.offerUid)) this.offerUid = null;
    const picked = ids.length ? ids.map(id => G.members.find(m => m.id === id)?.name).join(', ') : 'никто — отметьте людей в «Людях» или здесь';
    const chores = B.chores.map(o => `<label class="sv${o.uid === this.offerUid ? ' cur' : ''}${o.why ? ' off' : ''}"><input type="radio" name="gchore" value="${esc(o.uid)}"${o.uid === this.offerUid ? ' checked' : ''}>` +
      `<span class="t"><span class="tier">0</span><b>${esc(o.label)}</b> · плата ${o.pay} зол. · ${o.hands[0] === o.hands[1] ? o.hands[0] : `${o.hands[0]}–${o.hands[1]}`} чел. · ${o.days[0] === o.days[1] ? o.days[0] : `${o.days[0]}–${o.days[1]}`} дн.` +
      `<br><small>${esc(o.text)}${o.why ? ` <b>${esc(o.why)}</b>` : ''}</small></span></label>`).join('');
    const offer = B.chores.find(o => o.uid === this.offerUid), choreOk = offer && !offer.why && ids.length;
    this.board = B.errands;
    this.gerrand = errandPicked(B.errands, this.gerrand);
    // the muster (campaign/guild.js): the picked are the named; the others answer for themselves — shown before the gate
    const contract = B.errands.find(e => e.id === this.gerrand)?.contract || null, M = contract && ids.length ? muster(a, {contract, size: this.gsize, named: ids}) : null;
    const why = musterWhy(a, {size: this.gsize, named: ids}) || launchWhy(a, {ids: M ? M.ids : ids, contract});
    const sizes = Array.from({length: GUILD.party.max - GUILD.party.min + 1}, (_, k) => GUILD.party.min + k).map(n => `<option value="${n}"${n === this.gsize ? ' selected' : ''}>${n}</option>`).join('');
    const answers = M ? `<div class="guild-muster">${M.answers.map(x => { const m = G.members.find(y => y.id === x.id); return `<div class="${x.go ? 'go' : 'no'}">${x.go ? '✓' : '✗'} <b>${esc(m.name)}</b> <small>ур. ${m.level || 1} · ${esc(x.why)}</small></div>`; }).join('')}</div>` : '';
    return `<div class="row"><small>Отмечены (на дело в городе — все они; в поход — назначенные): <b>${esc(picked)}</b></small></div>` +
      `<div class="savelist guild-pick">${membersOf(G, 'ready').map(m => this.memberRow(m)).join('')}</div>` +
      `<h4 class="menu-group">В городе</h4><div class="savelist errands">${chores || '<small>Дел в городе пока нет: новые — с началом сезона.</small>'}</div>` +
      `<div class="row actions"><button type="button" data-act="chore"${choreOk ? '' : ' disabled'}>Послать на дело</button><small>${offer ? (offer.why ? esc(offer.why) : `отчёт — через ${offer.days[0] === offer.days[1] ? offer.days[0] : `${offer.days[0]}–${offer.days[1]}`} дн.`) : 'выберите дело'}</small></div>` +
      `<h4 class="menu-group">Договоры</h4>` +
      (K ? `<p class="note">Отряд в пути: ${esc(questWord(K))}. Второй отряд — позже (Г3).</p>` :
        `<div class="savelist errands">${errandCards(B.errands, this.gerrand, 'gerrand')}</div>` +
        `<div class="row"><small>Отряд: <select data-gsize>${sizes}</select> чел.; назначить — до ${namedMost(this.gsize)} (отмеченные выше), остальные решают сами</small></div>` + answers +
        `<div class="row actions"><button type="button" data-act="launch" class="primary"${why || !this.gerrand ? ' disabled' : ''}>Отправить отряд</button><small>${why ? esc(why) : (M ? `идут ${M.ids.length} из ${this.gsize}; в дорогу — ${GUILD.purse} зол. из казны и еда` : 'выберите поручение')}</small></div>`);
  }
  logHtml() {
    const G = this.G;
    return `<div class="guild-log">${G.log.slice(-LOG_LINES).reverse().map(l => `<div class="lv-${l.kind === 'death' ? 'top' : l.kind === 'choreBad' ? 'mid' : 'low'}"><small>${l.year}-й год, ${SEASONS.all()[l.season]?.label || ''}</small> ${esc(l.text)}</div>`).join('')}</div>`;
  }
  doChore() {
    const a = this.atlas, ids = [...this.gpick];
    try { takeChore(a, this.offerUid, ids); } catch (e) { $('guildNote').textContent = e.message; return; }
    this.gpick.clear(); this.offerUid = null; $('guildNote').textContent = 'Ушли на дело: отчёт придёт в летопись гильдии.';
    this.renderGuild(); this.autosave(true);
    if (this.clock.paused || !this.clock.timer) this.run();
  }
  doLaunch() {
    const a = this.atlas, card = this.cardOf(this.gerrand), ids = [...this.gpick];
    if (!card) return;
    try { launch(a, {contract: card.contract, named: ids, size: this.gsize}); } catch (e) { $('guildNote').textContent = e.message; return; }
    this.gpick.clear(); this.gerrand = null; this.board = null; this.boardHover = null;
    $('guildNote').textContent = 'Отряд ушёл. Его бои на локальной карте — если включено «⚔»; иначе — только строки летописи.';
    this.logShown = 0; this.logKey = ''; this.who = null;
    if (this.follow) this.closeUp();
    super.runMode(); this.syncGuildRail(); $('campTitle').textContent = `Гильдия «${this.G.name}»`;
    this.renderGuild(); this.renderSide(); this.autosave(true);
    if (this.clock.paused || !this.clock.timer) this.run();
  }

  // ── saved by itself (ui/autosave.js): the guild's day marks a change
  gmark() { const G = this.G; return G ? `${G.day}:${G.phase}:${G.members.length}:${G.chores.length}:${G.expeditions.length}:${expedition(this.atlas)?.day ?? ''}` : ''; }
  async persist(a = this.atlas) {
    if (!a?.guild) return super.persist(a);
    while (this.saving) await this.saving.catch(() => null);
    if (a !== this.atlas) return null;
    const G = a.guild, name = this.saveId ? this.worldName : `${baseName(this.worldName)}: гильдия «${G.name}»`, mark = this.gmark(), p = saveWorldToLibrary(a, name, this.saveId);
    this.saving = p;
    try {
      const rec = await p;
      if (a === this.atlas) { this.saveId = rec.id; this.worldId = rec.id; this.worldName = rec.name; this.saved = {a, day: G.day, mark, at: Date.now()}; }
      this.pointAt(a, rec);
      return rec;
    } finally { this.saving = null; if (this.again) { this.again = false; this.autosave(true); } }
  }
  pointAt(a, rec) {
    if (!a.guild) return super.pointAt(a, rec);
    const G = a.guild;
    if (G.phase === 'over') { forgetRun(rec.id); return; }
    rememberRun({id: rec.id, name: rec.name, guild: G.name, from: `гильдия «${G.name}»`, day: G.day, year: a.hist?.year ?? null, phase: G.phase, done: false, savedAt: rec.savedAt || Date.now()});
  }
  autosave(now = false) {
    const a = this.atlas; if (!a?.guild) return super.autosave(now);
    if (this.making) return;
    if (this.saving) { if (now) this.again = true; return; }
    const last = this.saved?.a === a ? this.saved : null, mark = this.gmark();
    if (now ? last?.mark === mark : !saveDue(last, Date.now(), a.guild.day)) return;
    const say = t => { const el = $('campSaveStatus'); if (el) el.textContent = t; $('guildNote').dataset.saved = t; };
    this.persist(a).then(rec => { if (rec) say(`Автосохранено в ${clockTime(Date.now())}.`); }, e => say('Автосохранение не удалось: ' + e.message));
  }
  async continueRun(id, name) {
    if (!(this.atlas?.guild && this.saveId === id)) { this.guildOn = true; this.show('library', {guild: true}); await this.openFromLibrary(id, name); if (this.saveId !== id) return; }
    else this.show('library', {guild: true});
    if (!this.atlas?.guild) return super.continueRun(id, name);
    this.guildMode();
  }
}

// the letters of a member, as «S6 P5 E7 C4 I5 A6» (Luck aside)
const letters = m => ['S', 'P', 'E', 'C', 'I', 'A'].map(k => `${k}${m.special?.[k] ?? '?'}`).join(' ');

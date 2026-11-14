// The adventurers' guild on the campaign screen (plan claude/guild-plan.md Г1; docs/GUILD.md). The same screen as the walk
// (ui/campaignView.js: the world's map, the expedition's march and camps, the chronicles) with the guild on top: founding it in
// a capital, taking in eight of twenty at its door, and then its panel in the rail («Гильдия»): the people with what each is
// doing, the board — the deeds in town (tier 0) and the world's errands (tier 1 and up) — and the guild's chronicle. The clock
// runs the world's seasons whether an expedition is out or not (campaign/guild.js stepGuild); an expedition out is shown as a
// campaign is (its camps on the local map while watched: «⚔»; else only its lines).
import {CampaignView, errandCards, errandPicked, itemShort, baseName, clockTime} from './campaignView.js';
import {foundGuild, foundWhy, hire, stepGuild, guildBoard, takeChore, launch, launchWhy, muster, musterWhy, namedMost, devotionOf, levelOf, tierOf, levelNext, abortWhy, recall, partyMost, rosterMost, parties, partiesMost, watchParty, recruitWhy, takeRecruit, kinOf, relWord, moodOf, restMember, retireWhy, unretireWhy, dismissWhy, giftOf, roomLevel, roomBy, working, staffOf, buildWhy, nextCost, postWhy, trainWhy, treatWhy, takeBack, buildRoom, setRoomPost, sendToRoom, armoryOf, racks, stalls, shopOf, sellPrice, buyWhy, buyItem, sellItem, lockItem, forgeCost, forgeWhy, forgeItem, buyBeast, cagesOf, cageRoom, beastMarket, buyWarWhy, buyWarBeast, releaseBeast, keepHome, beastLabel, expedition, membersOf, healing, ageOf, roleWord, questWord, GUILD, levelOn, toNext, classOf, guildOpenBranch, guildCloseBranch, guildSetManager, guildTransfer, guildMove, branchesOf, branchesMost, branchCost, branchIdle, managerOf, managerWhy, openWhy, roadDays, roadGold, transferWhy, moveWhy, moveSpan, moveCost, houseTown, payK, tierAt, priceK, feeK, guildIo, guildAscend, guildSummon, ascendPrice, summonPrice, templeAscendWhy, templeSummonable, templeSummonWhy, summonLine} from '../view/campaign.js';
import {loadHeroes, saveHeroes} from './heroes.js';
import {ROOMS} from '../data/rooms.js';
import {TIER_LABEL} from '../data/errands.js';
import {townLabel, realmLabel} from '../view/world.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {drawPortraits} from './portrait.js';
import {BEASTS} from '../data/transport.js';
const BEAST_WORD = Object.fromEntries(Object.entries(BEASTS).map(([k, v]) => [k, v.label]));
import {SPECIES} from '../data/species.js';
import {SEASONS} from '../data/seasons.js';
import {raceLabel, gearDef} from '../view/local.js';
import {saveWorldToLibrary} from './worlds.js';
import {rememberRun, forgetRun, saveDue} from './autosave.js';
import {WATCH} from './campLocal.js';
import {plural, esc} from '../core/util.js';
import {$, seg, press} from './dom.js';
import {CampShell, GUILD_MENUS} from './shell/campShell.js';

const TABS = [['people', 'Люди'], ['board', 'Доска'], ['house', 'Дом'], ['branches', 'Филиалы'], ['fallen', 'Павшие'], ['log', 'Летопись']];
const STATE = {retired: 'на покое', ready: 'дома', chore: 'на деле', expedition: 'в походе', dead: 'погиб', left: 'ушёл', post: 'на посту', training: 'учится у тренера', treat: 'у лекаря', road: 'в дороге'};
const LOG_LINES = 80;   // the guild's chronicle in its tab: the last lines

const SORT_WORDS = [['tier', 'по тиру'], ['pay', 'по плате'], ['margin', 'по запасу дней'], ['road', 'по дороге'], ['left', 'по сроку предложения']];
// what a room does now, in a line (data/rooms.js `by`)
function roomFx(G, id) {
  const L = roomLevel(G, id); if (!L) return '';
  const v = k => roomBy(G, id, k), pc = x => `${Math.round(x * 100)} %`;
  switch (id) {
    case 'board': return `объявлений на доске: ${v('slots')}`;
    case 'planning': return `в отряде — до ${v('party')}`;
    case 'barracks': return `мест в гильдии: ${v('roster')}`;
    case 'tavern': return working(G, id) ? `возвращается ${pc(v('back'))} жалованья; доход с гостей — ${v('income')} зол. × Харизма управляющего / 5` : '';
    case 'training': return working(G, id) ? `мест: ${v('slots')}; учит до ${1 + L}-го уровня` : '';
    case 'healer': return working(G, id) ? `мест: ${v('slots')}; зелий в дорогу: ${v('potions')}; дома раны заживают быстрее` : '';
    case 'pantry': return `еда в дорогу: ${pc(v('food'))} цены`;
    case 'maps': return `срок договоров «по следам»: ×${String(v('time')).replace('.', ',')}${v('known') ? '; места лагерей известны' : ''}`;
    case 'chapel': return `горе от гибели товарища: −${pc(v('grief'))}`;
    default: return '';
  }
}
// a member's spirits in a word (campaign/kin.js m.mood, −1 … 1)
const moodWord = v => (v <= -0.6 ? 'тоскует' : v <= -0.25 ? 'не в духе' : v >= 0.3 ? 'в духе' : 'спокоен');
// a member's kin, in a line under him
function kinLine(a, G, m) {
  const ks = kinOf(a, G, m); if (!ks.length) return '';
  return `<br><small class="fact">${ks.map(k => `${k.word}: ${esc(k.person ? `${k.who.title?.[0] ? `${k.who.title[0]} ` : ''}${k.who.name}` : k.who.name)}${k.who.alive === false ? ' †' : ''}`).join(' · ')}</small>`;
}
export class GuildView extends CampaignView {
  build() {
    super.build();
    this.guildOn = false; this.gpick = new Set(); this.gtab = 'people'; this.offerUid = null; this.gerrand = null; this.hirePick = new Set(); this.gsize = GUILD.party.max; this.gsort = 'tier';
    seg('guildTabs', TABS, this.gtab, v => { this.gtab = v; this.renderGuild(); });
    $('guildBody').addEventListener('change', e => {
      const box = e.target.closest('input[data-mid]'); if (box) { box.checked ? this.gpick.add(+box.dataset.mid) : this.gpick.delete(+box.dataset.mid); this.renderGuild(); return; }
      const o = e.target.closest('input[name="gchore"]'); if (o) { this.offerUid = o.value; this.gerrand = null; this.renderGuild(); return; }
      const ps = e.target.closest('select[data-post]'); if (ps) { this.houseDo(() => setRoomPost(this.atlas, ps.dataset.post, ps.value ? +ps.value : null, guildIo(this.atlas).tell)); return; }
      const rs = e.target.closest('select[data-room]'); if (rs && rs.value) { this.houseDo(() => sendToRoom(this.atlas, rs.dataset.room, +rs.value, guildIo(this.atlas).tell)); return; }
      const bm = e.target.closest('select[data-bmgr]'); if (bm) { this.houseDo(() => guildSetManager(this.atlas, +bm.dataset.bmgr, bm.value ? +bm.value : null)); return; }
      const so = e.target.closest('select[data-gsort]'); if (so) { this.gsort = so.value; this.renderGuild(); return; }
      const sz = e.target.closest('select[data-gsize]'); if (sz) { this.gsize = +sz.value; this.renderGuild(); return; }
      const r = e.target.closest('input[name="gerrand"]'); if (r) { this.gerrand = r.value; this.offerUid = null; this.renderGuild(); this.lookAtCard(r.value); }
    });
    $('guildBody').addEventListener('click', e => {
      const ch = e.target.closest('button[data-chip]');
      if (ch) { const id = +ch.dataset.chip; this.gpick.has(id) ? this.gpick.delete(id) : this.gpick.add(id); this.renderGuild(); return; }
      const bd = e.target.closest('button[data-build]'); if (bd) { this.houseDo(() => buildRoom(this.atlas, bd.dataset.build, guildIo(this.atlas))); return; }
      const pay = guildIo(this.atlas).pay;   // (the guild's own ledger: campaign/guild.js)
      const ar = e.target.closest('button[data-arm]');
      if (ar) { const id = +ar.dataset.id, G = this.G; this.houseDo(() => ar.dataset.arm === 'lock' ? lockItem(G, id, !armoryOf(G).items.find(x => x.id === id)?.locked) : ar.dataset.arm === 'sell' ? sellItem(this.atlas, G, id, pay) : ar.dataset.arm === 'forge' ? forgeItem(G, id, pay) : buyItem(this.atlas, G, ar.dataset.token, pay)); return; }
      const cg = e.target.closest('button[data-cage]'); if (cg) { const id = +cg.dataset.id, G = this.G; this.houseDo(() => (cg.dataset.cage === 'home' ? keepHome(G, id, !cagesOf(G).beasts.find(x => x.id === id)?.home) : releaseBeast(G, id))); return; }
      const wr = e.target.closest('button[data-war]'); if (wr) { this.houseDo(() => buyWarBeast(this.atlas, this.G, wr.dataset.war, pay)); return; }
      const bs = e.target.closest('button[data-beast]'); if (bs) { this.houseDo(() => buyBeast(this.atlas, this.G, bs.dataset.beast, pay)); return; }
      const bb = e.target.closest('button[data-branch]');
      if (bb) {
        const a = this.atlas, k = bb.dataset.branch, v = id => $(id)?.value;
        this.houseDo(() => k === 'open' ? guildOpenBranch(a, +v('gBranchTown')) : k === 'close' ? guildCloseBranch(a, +bb.dataset.town) : k === 'move' ? guildMove(a, +v('gMoveTown')) : guildTransfer(a, +v('gXferWho'), +v('gXferTo')));
        return;
      }
      const tp = e.target.closest('button[data-temple]'); if (tp) { this.templeDo(tp.dataset.temple, tp.dataset.id); return; }
      const hr = e.target.closest('button[data-hire]'); if (hr) { this.houseDo(() => takeRecruit(this.atlas, +hr.dataset.hire)); return; }
      const wt = e.target.closest('button[data-watch]'); if (wt) { this.houseDo(() => watchParty(this.atlas, +wt.dataset.watch)); this.draw?.(); return; }
      const rc = e.target.closest('button[data-recall]'); if (rc) { this.houseDo(() => recall(this.atlas, +rc.dataset.recall)); return; }
      const rt = e.target.closest('button[data-rest]'); if (rt) { e.preventDefault(); this.houseDo(() => restMember(this.atlas, +rt.dataset.id, rt.dataset.rest)); return; }
      const fr = e.target.closest('button[data-free]'); if (fr) { this.houseDo(() => takeBack(this.G, +fr.dataset.free)); return; }
      const b = e.target.closest('button[data-act]'); if (!b) return;
      if (b.dataset.act === 'send') { if (this.offerUid) this.doChore(); else this.doLaunch(); return; }
      if (b.dataset.act === 'unjob') { this.offerUid = null; this.gerrand = null; this.renderGuild(); this.draw(); return; }
      if (b.dataset.act === 'chore') this.doChore(); else if (b.dataset.act === 'launch') this.doLaunch(); else if (b.dataset.act === 'recall') { try { recall(this.atlas); } catch (err) { $('guildNote').textContent = err.message; } this.renderGuild(); this.autosave?.(); } else if (b.dataset.act === 'none') { this.gpick.clear(); this.renderGuild(); }
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
    // the town of the guild, of a branch, of the move (the author's word 14.11): by its name or by a click on the map
    this.townQ = '';
    $('campTownQ').addEventListener('input', e => { this.townQ = e.target.value; this.renderCaps(); });
    $('campCaps').addEventListener('click', e => { const row = e.target.closest('.sv[data-town]'); if (row && this.guildOn && !this.G) this.pickTown(+row.dataset.town, {look: true}); }, true);
    $('guildBody').addEventListener('input', e => { if (e.target.id === 'gTownQ') { this.townQ = e.target.value; this.renderTownHits(); } });
    $('guildBody').addEventListener('click', e => { const row = e.target.closest('[data-gtown]'); if (row) this.pickTown(+row.dataset.gtown, {look: true}); });
    $('campInspect').addEventListener('click', e => {
      const b = e.target.closest('button[data-tact]'); if (!b) return;
      const a = this.atlas, id = +b.dataset.town;
      if (b.dataset.tact === 'found') { this.capPick = id; this.begin(); return; }
      this.houseDo(() => (b.dataset.tact === 'branch' ? guildOpenBranch(a, id) : guildMove(a, id)));
      this.renderInspect();
    });
  }
  // ── the town picked: on the map (its card on the right with what the guild may do there), in the lists
  pickTown(id, {look = false} = {}) {
    const a = this.atlas, t = a?.towns.find(x => x.id === id); if (!t) return;
    this.townPick = id;
    if (!this.G) this.capPick = id;
    if (look && this.cam) { this.cam.zoom = Math.max(this.cam.zoom, 2.5); this.cam.cx = t.x + 0.5; this.cam.cy = t.y + 0.5; this.follow = false; }
    this.select({kind: 'town', id: t.id, i: t.y * a.w + t.x});
    if (!this.G) this.renderCaps(); else if (this.gtab === 'branches') this.renderGuild();
  }
  clickAt(e) {
    super.clickAt(e);
    if (this.guildOn && this.sel?.kind === 'town' && this.sel.id !== this.townPick) this.pickTown(this.sel.id);
  }
  // the towns whose name begins with (or holds) what is typed; the living, of a people that comes to a guild's door first
  townHits(q, n = 12) {
    const a = this.atlas; q = q.trim().toLowerCase(); if (!a || !q) return [];
    const rank = t => (t.name.toLowerCase().startsWith(q) ? 0 : 1) + (t.capital ? 0 : 0.5);
    return a.towns.filter(t => t.alive && t.name.toLowerCase().includes(q)).sort((p, r) => rank(p) - rank(r) || (r.pop || 0) - (p.pop || 0)).slice(0, n);
  }
  townRow(t, {why = null, cur = false, attr = 'data-town'} = {}) {
    const a = this.atlas, col = WORLD_PEOPLES.has(t.people) ? WORLD_PEOPLES.get(t.people).color.join(',') : '128,128,128';
    return `<div class="sv cap${cur ? ' cur' : ''}${why ? ' off' : ''}" ${attr}="${t.id}"${why ? ` title="${esc(why)}"` : ''}><span class="t"><i style="background:rgb(${col})"></i><b>${esc(townLabel(t, 0))} ${esc(t.name)}</b>${t.capital ? ' · столица' : ''}` +
      `<br><small>${t.realm != null ? esc(realmLabel(a, t.realm)) : 'вольный город'} · жителей ${Math.round(t.pop || 0)}${why ? ` · <b>${esc(why)}</b>` : ''}</small></span></div>`;
  }
  // founding: any town of a people that comes to the door — found by its name, or clicked on the map; the capitals offered first
  renderCaps() {
    if (!this.guildOn || this.G) { $('campTownQ').hidden = true; $('campCapsLbl').textContent = 'Столица'; return super.renderCaps(); }
    super.renderCaps();
    const a = this.atlas; if (!a) return;
    $('campCapsLbl').textContent = 'Город гильдии'; $('campTownQ').hidden = false;
    $('campCapsNote').textContent = 'Щёлкните город на карте или найдите его по названию — не обязательно столицу. Его народ придёт к дверям, его держава даст грамоту.';
    const q = this.townQ.trim(), hits = q ? this.townHits(q) : a.towns.filter(t => t.alive && t.capital);
    const pick = a.towns.find(t => t.id === this.capPick), list = pick && !hits.includes(pick) ? [pick, ...hits] : hits;
    $('campCaps').innerHTML = list.length ? list.map(t => this.townRow(t, {why: foundWhy(a, t.id), cur: t.id === this.capPick})).join('') : `<small>${q ? 'Таких городов нет.' : 'Щёлкните город на карте.'}</small>`;
    $('campGo').disabled = this.capPick == null || !!foundWhy(a, this.capPick);
  }
  // the card of a town on the right: what the guild may do there — found its house, open a branch, move
  renderInspect() {
    super.renderInspect();
    const a = this.atlas, box = $('campInspect'); if (!box || !a || !this.guildOn || this.sel?.kind !== 'town') return;
    const id = this.sel.id, G = this.G, btn = (act, label, why) => `<button type="button" class="${act === 'found' ? 'primary' : 'mini'}" data-tact="${act}" data-town="${id}"${why ? ` disabled title="${esc(why)}"` : ''}>${label}</button>${why ? ` <small>${esc(why)}</small>` : ''}`;
    let html = '';
    if (!G) html = btn('found', 'Основать гильдию здесь', foundWhy(a, id));
    else if (G.phase === 'open' && id !== G.town) {
      const isBranch = branchesOf(G).some(b => b.town === id);
      html = (isBranch ? '' : `<div class="row">${btn('branch', `Открыть филиал (${branchCost(G)} зол.)`, openWhy(a, G, id))}</div>`) +
        (G.moving ? '' : `<div class="row">${btn('move', isBranch ? 'Переехать в филиал' : `Переехать сюда (дом ${moveCost(G, id)} зол.)`, moveWhy(a, G, id))}</div>`);
    }
    if (html) box.insertAdjacentHTML('afterbegin', `<div class="card guild-town-act">${html}</div>`);
  }
  // the branches' tab: the town found by its name (a click on a hit — the map goes there and the town is picked)
  renderTownHits() {
    const box = $('gTownHits'); if (!box) return;
    const hits = this.townHits(this.townQ, 8);
    box.innerHTML = hits.map(t => this.townRow(t, {cur: t.id === this.townPick, attr: 'data-gtown'})).join('');
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
    this.heroReg = undefined;   // (the ascended: read anew — a walk may have raised or summoned some)
    $('campSetup').hidden = true; $('campRun').hidden = false; $('campRunSide').hidden = !this.atlas.campaign; $('guildSide').hidden = false;
    this.setupShell?.leave(); (this.shell ||= new CampShell(this)).enter();
    this.syncGuildRail();
    $('campTitle').textContent = `Гильдия «${G.name}»`; $('campName2').textContent = baseName(this.worldName) || '';
    if (G.phase === 'hire') { this.clock.stop(); this.showHire(); this.syncRun(); return; }
    $('guildHire').hidden = true;
    if (!this.cam) return;
    this.renderGuild(); this.renderSide(); this.syncRun(); this.draw();
    if (!GUILD_MENUS.some(m => m[0] === this.shell?.open)) this.openGuild();
  }
  syncGuildRail() { for (const [id] of GUILD_MENUS) { const b = this.shell?.rail?.querySelector(`[data-menu="${id}"]`); if (b) b.hidden = !this.G; } $('guildTabs').hidden = !!this.shell; }
  // ── the strip along the bottom (the author's word 14.11): the guild's people as portraits — a click on one at home picks
  // it for the job (the same pick as the muster's); a switch per party out shows that party's own strip (the walk's roster)
  renderStrip() {
    const box = $('campShParty'), a = this.atlas, G = this.G; if (!box || !G || G.phase !== 'open') { $('guildStrip')?.remove(); $('campRoster')?.removeAttribute('hidden'); return; }
    let gs = $('guildStrip');
    if (!gs) {
      gs = document.createElement('div'); gs.id = 'guildStrip'; gs.className = 'guild-strip'; box.prepend(gs);
      gs.addEventListener('click', e => {
        const t = e.target.closest('button[data-gs]');
        if (t) { const v = t.dataset.gs; this.stripMode = v === 'guild' ? 'guild' : +v; if (v !== 'guild') { try { watchParty(this.atlas, +v); } catch (err) { /* gone home meanwhile */ } this.renderSide(); this.draw(); } this.renderStrip(); return; }
        const c = e.target.closest('[data-gsm]'); if (!c) return;
        const id = +c.dataset.gsm, m = this.G.members.find(x => x.id === id); if (!m || m.guild.state !== 'ready') return;
        this.gpick.has(id) ? this.gpick.delete(id) : this.gpick.add(id); this.renderGuild();
      });
    }
    const out = parties(a);
    if (this.stripMode == null || (this.stripMode !== 'guild' && !out.some(K => K.expedition === this.stripMode))) this.stripMode = 'guild';
    const tabs = [['guild', `Гильдия · ${membersOf(G).length}`], ...out.map(K => [K.expedition, `Отряд ${K.expedition} · ${K.members.filter(m => m.alive).length}`])];
    const own = this.stripMode === 'guild';
    $('campRoster').hidden = own;
    const order = {ready: 0, chore: 1, training: 2, post: 3, expedition: 4, road: 5, retired: 6};
    const ms = own ? membersOf(G).slice().sort((p, q) => (order[p.guild.state] ?? 9) - (order[q.guild.state] ?? 9)) : [];
    gs.innerHTML = `<div class="gs-tabs">${tabs.map(([v, l]) => `<button type="button" data-gs="${v}" aria-pressed="${v === this.stripMode}">${esc(l)}</button>`).join('')}</div>` +
      (own ? `<div class="gs-people">${ms.map(m => { const st = m.guild.state, free = st === 'ready';
        return `<div class="gs-m${free ? '' : ' busy'}${this.gpick.has(m.id) ? ' lit' : ''}" data-gsm="${m.id}" title="${esc(`${m.name}, ${roleWord(m)}, ур. ${m.level || 1} — ${STATE[st] || st}${free ? '; щелчок — отметить для задания' : ''}`)}">` +
          `<em class="role">${esc(roleWord(m))}</em><canvas class="pt" width="96" height="96" data-pt="${m.id}"></canvas><b class="nm">${esc(m.name.split(' ')[0])}</b><small>${esc(STATE[st] || st)}</small></div>`; }).join('')}</div>` : '');
    this.pawns ||= new Map(); drawPortraits(gs, id => G.members.find(m => m.id === id), this.pawns);
  }
  // a section of the guild opened from the rail (ui/shell/campShell.js GUILD_MENUS)
  guildTab(tab) { this.gtab = tab; this.renderGuild(); }
  // the guild's panel open at a section (its button pressed on the rail)
  openGuild(tab = this.gtab) { const id = GUILD_MENUS.find(m => m[3] === tab)?.[0] || 'guild'; this.gtab = tab; if (this.shell?.open !== id) this.shell?.toggle(id); else this.renderGuild(); }
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
  // the guild's clock runs with no expedition out (no a.campaign): its pause is its own (the walk's asks for a walk)
  togglePause() {
    if (!this.G || this.making) return super.togglePause();
    if (this.G.phase !== 'open') return;
    if (!this.local && !this.clock.running && !this.clock.paused) { this.run(); return; }
    this.flipClock();
  }
  paceShown(P) { return !P.slow || !!this.G; }
  run() { if (!this.G) return super.run(); if (this.G.phase === 'open') this.clock.start(); this.syncRun(); this.dayTick(); }
  // the date's day follows the playback with no expedition out too (the walk's animate() draws only with one): a few times a second
  dayTick() {
    if (this.dayTimer) return;
    const go = () => {
      this.dayTimer = 0;
      if (!this.G || $('campaign').hidden || !this.clock.running || this.clock.paused) return;
      if (!this.atlas?.campaign) this.frame();
      this.dayTimer = setTimeout(go, 250);
    };
    this.dayTimer = setTimeout(go, 250);
  }
  flipClock() { super.flipClock(); if (this.G) this.dayTick(); }
  syncRun() {
    if (!this.G) return super.syncRun();
    const open = this.G.phase === 'open';
    $('campAgain').hidden = true; $('campAscend').hidden = true;
    $('campPause').hidden = !open; $('campSpeed').hidden = !open;
    this.syncPaceBox?.();
    // (the guild's clock may stand with no pause pressed — after the hiring, before the first «Дальше»: the button says what it will do)
    $('campPause').textContent = this.local ? (this.ticks.paused ? 'Дальше' : 'Пауза') : this.clock.running && !this.clock.paused ? 'Пауза' : 'Дальше';
  }
  stepSeason() {
    const a = this.atlas, G = this.G; if (!G) return super.stepSeason();
    if (G.phase !== 'open') return false;
    const K0 = expedition(a), d0 = K0?.day ?? 0, out0 = parties(a);
    this.autosave();
    const more = stepGuild(a);
    const K = a.campaign;
    if (K0 && K0 === K) {   // the expedition's camps of this season, each at its day of the playback (as campaignView.stepSeason)
      const W = WATCH[this.clock.pace], n = Math.max(1, K.track.length - 1);
      this.queue = this.watch ? (K.camps || []).filter(c => c.day >= d0 && (c.boss || (W && (c.kind !== 'stop' || W.stops)))).map(c => ({...c, at: Math.min(1, (c.day - d0) / n)})) : [];
    } else this.queue = [];
    const back = out0.filter(x => x.closed);   // (any party home this season: the player's word waits)
    if (back.length) this.pauseAfter = back.map(x => `Отряд ${x.expedition} ${G.expeditions.find(e => e.n === x.expedition)?.how || 'вернулся'}.`).join(' ');
    if (!more) this.autosave(true);
    return more;
  }
  afterSeason() {
    super.afterSeason();
    if (this.G) this.renderGuild();
    if (this.pauseAfter) { const t = this.pauseAfter; this.pauseAfter = null; $('guildNote').textContent = t; this.clock.pause(); this.syncRun(); if (!GUILD_MENUS.some(m => m[0] === this.shell?.open)) this.openGuild(); }
  }

  // the map: an expedition out (or the last one back) as the walk draws it; none — the guild's house ringed and the board's targets
  overlay(a, px, cam) {
    if (!this.G || this.choosing || a.campaign) return super.overlay(a, px, cam);
    const t = a.towns.find(x => x.id === this.G.town), k = this.unit(a);
    if (t) { px.strokeStyle = '#ffd36a'; px.lineWidth = Math.max(this.minW, 0.3 * k); px.beginPath(); px.arc(t.x + 0.5, t.y + 0.5, 2.4 * Math.max(0.6, k), 0, Math.PI * 2); px.stroke(); }
    // the branches (campaign/branches.js): a smaller ring each, dashed while idle
    for (const br of branchesOf(this.G)) {
      const b = a.towns.find(x => x.id === br.town); if (!b) continue;
      px.strokeStyle = '#8fc8ff'; px.setLineDash(branchIdle(a, this.G, br) ? [0.6 * k, 0.6 * k] : []);
      px.beginPath(); px.arc(b.x + 0.5, b.y + 0.5, 1.8 * Math.max(0.6, k), 0, Math.PI * 2); px.stroke(); px.setLineDash([]);
    }
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
    if (!GUILD_MENUS.some(m => m[0] === this.shell?.open)) this.openGuild();
    return true;
  }

  // ── the panel
  renderGuild() {
    const a = this.atlas, G = this.G; if (!G || G.phase === 'hire') return;
    const K = expedition(a), ms = membersOf(G);
    $('guildStatus').innerHTML = `<dt>Казна</dt><dd>${G.gold} зол.</dd><dt>Уровень</dt><dd>${levelOf(G)} · договоры до тира ${TIER_LABEL[tierOf(G)] || '—'}</dd><dt>Слава</dt><dd>${G.fame}${levelNext(G) != null ? ` / ${levelNext(G)}` : ''}</dd>` +
      `<dt>Людей</dt><dd>${ms.length} · дома ${ms.filter(m => m.guild.state === 'ready').length}${ms.some(m => m.guild.state === 'chore') ? ` · на делах ${ms.filter(m => m.guild.state === 'chore').length}` : ''}${K ? ` · в походе ${ms.filter(m => m.guild.state === 'expedition').length}` : ''}</dd>` +
      `<dt>Отряды</dt><dd>${parties(a).length ? `в пути ${parties(a).length} из ${partiesMost(G)}${K ? `; смотрим: ${K.expedition}-й, ${esc(questWord(K))}` : ''}` : `дома (до ${partiesMost(G)} в пути разом)`}</dd>` +
      (G.phase === 'over' ? '<dt>Гильдия</dt><dd>закрыта</dd>' : '');
    for (const id of [...this.gpick]) if (!ms.some(m => m.id === id && m.guild.state === 'ready')) this.gpick.delete(id);
    const typing = document.activeElement?.id === 'gTownQ' ? document.activeElement.selectionStart : null;   // (a season's redraw keeps the search being typed)
    $('guildBody').innerHTML = this.gtab === 'people' ? this.peopleHtml() : this.gtab === 'board' ? this.boardHtml() : this.gtab === 'house' ? this.houseHtml() : this.gtab === 'branches' ? this.branchesHtml() : this.gtab === 'fallen' ? this.fallenHtml() : this.logHtml();
    this.pawns ||= new Map(); drawPortraits($('guildBody'), id => this.G.members.find(m => m.id === id), this.pawns);   // (the muster's portraits)
    this.renderStrip();
    if (this.gtab === 'branches') { this.renderTownHits(); if (typing != null) { const q = $('gTownQ'); q?.focus(); q?.setSelectionRange(typing, typing); } }
  }
  // one member: a tick to pick (at the house only), name, role, level, years, health, what he is doing, wage
  memberRow(m, pickable = true) {
    const a = this.atlas, G = this.G, st = m.guild.state, free = st === 'ready', K = expedition(a) || {members: [m], day: 0};
    const doing = st === 'chore' ? `на деле до ${m.guild.until - G.day > 0 ? `${m.guild.until - G.day} ${plural(m.guild.until - G.day, 'дня', 'дней', 'дней')}` : 'вечера'}` : st === 'ready' && healing(m) ? 'лечится' : st === 'post' ? (m.guild.post === 'branch' ? `управляет филиалом в ${this.townIn(m.guild.branch)}` : `на посту: ${ROOMS.has(m.guild.post) ? ROOMS.get(m.guild.post).post?.label || '' : ''}`) + (m.retired ? ' (на покое)' : '') : st === 'road' ? `в дороге в ${this.townName(m.guild.to)}: ещё ${Math.max(0, m.guild.until - G.day)} дн.` : STATE[st] || st;
    const lives = m.house != null && st !== 'road' && st !== 'post' ? ` · живёт в ${this.townIn(m.house)}` : '';
    const lv = m.level || 1, nx = toNext(K, m, K.day), cls = classOf(m);   // (its class: learned for life, never changed)
    return `<label class="gm${free ? '' : ' busy'}${m.alive ? '' : ' dead'}">${pickable ? `<input type="checkbox" data-mid="${m.id}"${this.gpick.has(m.id) ? ' checked' : ''}${free ? '' : ' disabled'}>` : ''}` +
      `<span class="t"><b>${esc(m.name)}</b> · ${esc(roleWord(m))}${cls ? ` <span class="muted" title="${esc(`класс на всю жизнь: ${cls.note}`)}">(${esc(cls.label)})</span>` : ''}, ур. ${lv} · ${esc(raceLabel(SPECIES.get(m.race)))}, ${ageOf(a, m)} ${plural(ageOf(a, m), 'год', 'года', 'лет')} · <i>${esc(doing + lives)}</i>` +
      `<span class="hp"><i class="${(m.hp ?? 1) < 0.4 ? 'low' : ''}" style="width:${Math.round(Math.max(0, m.hp ?? 1) * 100)}%"></i></span>` +
      (nx != null ? `<span class="xp" title="опыт до ${lv + 1}-го уровня: ${Math.round(nx * 100)}%"><i style="width:${Math.round(nx * 100)}%"></i></span>` : '') +
      `<small>${letters(m)} · ${esc([...m.gear.hand, m.gear.body].filter(Boolean).map(itemShort).join(', '))}${m.maims ? ` · увечий ${m.maims}` : ''} · верность ${Math.round(devotionOf(m) * 100)}% · ${moodWord(moodOf(m))}</small>${kinLine(this.atlas, G, m)}${pickable ? this.restButtons(m) : ''}</span></label>`;
  }
  // rest and retirement (campaign/retire.js): one at the house — to rest, back to the ranks, let go with honour or without
  restButtons(m) {
    const G = this.G, st = m.guild.state; if (!['ready', 'post', 'retired'].includes(st)) return '';
    const b = (kind, label, why, title = '') => `<button type="button" class="quiet mini" data-rest="${kind}" data-id="${m.id}"${why ? ` disabled title="${esc(why)}"` : title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
    const asks = m.asks ? `<small><b>просится на покой</b> (${esc(m.asks.why)})</small> ` : '';
    return `<span class="gm-rest">${asks}${m.retired ? b('back', 'в строй', unretireWhy(G, m)) : b('rest', 'на покой', retireWhy(G, m), 'живёт при гильдии, в походы не ходит, может занять пост; жалованье — половина')}` +
      b('honour', `в отставку — ${giftOf(m)} зол.`, dismissWhy(G, m, true), 'уходит из гильдии с прощальным даром') + b('fire', 'уволить', dismissWhy(G, m, false), 'уходит без дара; друзья в гильдии обидятся') + '</span>';
  }
  peopleHtml() {
    const G = this.G, live = membersOf(G), gone = G.members.filter(m => !live.includes(m));
    return `<p class="note">Отметьте, кого послать: на дело в городе или в поход — на «Доске». Раненые лечатся дома сами; жалованье — каждый сезон из казны.</p>` + this.doorHtml() + `<h4 class="menu-group">Гильдия</h4>` +
      `<div class="savelist guild-people">${live.map(m => this.memberRow(m)).join('')}</div>` +
      (this.gpick.size ? `<div class="row"><small>Выбрано: ${this.gpick.size}</small><button type="button" class="quiet mini" data-act="none">снять</button></div>` : '') +
      this.familiesHtml() +
      (gone.filter(m => m.guild?.state === 'left').length ? `<details class="obs-lib"><summary>Ушедшие (${gone.filter(m => m.guild?.state === 'left').length})</summary><div class="savelist guild-people">${gone.filter(m => m.guild?.state === 'left').map(m => this.memberRow(m, false)).join('')}</div></details>` : '');
  }
  // ── the house (campaign/house.js; data/rooms.js): each room — its level, what it does now, its next level's cost, its post
  houseHtml() {
    const a = this.atlas, G = this.G, ready = membersOf(G, 'ready'), B = G.building;
    const rows = ROOMS.all().filter(R => R.id !== 'fallen').map(R => {
      const L = roomLevel(G, R.id), max = R.cost.length, cost = nextCost(G, R.id), why = buildWhy(a, R.id), staff = staffOf(G, R.id), idle = L > 0 && R.post && !staff;
      const fx = roomFx(G, R.id);
      const post = R.post && L > 0 ? `<div class="row"><small>${esc(R.post.label)}${R.post.level ? ` (ур. ${R.post.level}+)` : R.post.letter ? ` (${R.post.letter} ${R.post.least}+)` : ''}: <select data-post="${R.id}"><option value="">— никого —</option>${[...(staff ? [staff] : []), ...ready, ...membersOf(G, 'retired')].map(m => `<option value="${m.id}"${m === staff ? ' selected' : ''}${m !== staff && postWhy(G, R.id, m) ? ' disabled' : ''}>${esc(m.name)}, ур. ${m.level || 1} · ${letters(m)}</option>`).join('')}</select></small></div>` : '';
      const kind = R.id === 'training' ? 'training' : R.id === 'healer' ? 'treat' : null, inside = kind ? G.members.filter(m => m.alive && m.guild?.state === kind) : [];
      const room = kind && working(G, R.id) ? `<div class="row"><small>${kind === 'training' ? 'Учатся' : 'Лечатся'}: ${inside.map(m => `${esc(m.name)} <button type="button" class="quiet mini" data-free="${m.id}">отпустить</button>`).join(', ') || 'никого'}` +
        ` · <select data-room="${kind}"><option value="">${kind === 'training' ? 'отдать в учёбу…' : 'к лекарю…'}</option>${ready.map(m => `<option value="${m.id}"${(kind === 'training' ? trainWhy(G, m) : treatWhy(G, m)) ? ' disabled' : ''}>${esc(m.name)}, ур. ${m.level || 1}</option>`).join('')}</select></small></div>` : '';
      const extra = R.id === 'armory' && L ? this.armoryHtml() : R.id === 'stable' && L ? this.stableHtml() : R.id === 'cages' && L ? this.cagesHtml() : R.id === 'temple' && L ? this.templeHtml() : '';
      return `<div class="sv${L ? '' : ' off'}"><span class="t"><b>${esc(R.label)}</b> · ${L ? `${L}-й уровень${max > 1 ? ` из ${max}` : ''}` : 'не построено'}${idle ? ` · <b>стоит: нужен ${esc(R.post.label)}</b>` : ''}` +
        `<br><small>${esc(R.about)}</small>${fx ? `<br><small class="fact">${esc(fx)}</small>` : ''}</span>${post}${room}${extra}` +
        `<div class="row actions">${cost != null ? `<button type="button" class="mini" data-build="${R.id}"${why ? ' disabled' : ''}>${L ? 'Улучшить' : 'Построить'} — ${cost} зол.</button>` : ''}<small>${why && cost != null ? esc(why) : ''}</small></div></div>`;
    });
    return `<p class="note">Строится одна комната за раз, готова к новому сезону.${B ? ` Сейчас: <b>${esc(ROOMS.get(B.room).label)}</b>, ${B.level}-й уровень.` : ''} Содержание дома — каждый сезон вместе с жалованьем.</p>` +
      `<div class="savelist errands">${rows.join('')}</div>`;
  }
  // ── the Temple of All Gods (campaign/temple.js): raise one at the house among the ascended, summon one of them (the registry
  // of this browser: ui/heroes.js — both games' pool)
  templeHtml() {
    const a = this.atlas, G = this.G;
    if (this.heroReg === undefined) { this.heroReg = null; loadHeroes().then(r => { this.heroReg = r; this.renderGuild(); }); }
    if (!this.heroReg) return '<div class="row"><small>Храм: читаю список вознесённых…</small></div>';
    const home = membersOf(G).filter(m => m.house == null && ['ready', 'retired', 'post'].includes(m.guild.state));
    const room = membersOf(G).length < rosterMost(G), can = templeSummonable(a, G, this.heroReg);
    const up = home.map(m => { const why = templeAscendWhy(a, G, m); return `<div class="row"><small><b>${esc(m.name)}</b>, ур. ${m.level || 1}</small><button type="button" class="quiet mini" data-temple="up" data-id="${m.id}"${why ? ` disabled title="${esc(why)}"` : ' title="уходит из гильдии к вознесённым: его можно призвать снова — сюда или в Поход"'}>вознести — ${ascendPrice(G, m)} зол.</button></div>`; }).join('');
    const call = can.map(h => { const why = templeSummonWhy(a, G, this.heroReg, h.uid, room); return `<div class="row"><small><b>${esc(h.name)}</b>, ур. ${h.level || 1} · ${esc(raceLabel(SPECIES.get(h.race)))} — ${esc(summonLine(h))}</small><button type="button" class="mini" data-temple="call" data-id="${esc(h.uid)}"${why ? ` disabled title="${esc(why)}"` : ' title="снова смертен: его смерть будет навсегда"'}>призвать — ${summonPrice(G, h)} зол.</button></div>`; }).join('');
    return `<div class="savelist guild-people"><h4 class="menu-group">Вознести</h4>${up || '<small>дома никого</small>'}<h4 class="menu-group">Призвать из вознесённых (${can.length} из ${this.heroReg.heroes.length} — по народам города)</h4>${call || '<small>некого призвать</small>'}</div>`;
  }
  async templeDo(kind, id) {
    const a = this.atlas;
    try {
      const reg = await loadHeroes();
      const next = kind === 'up' ? guildAscend(a, +id, reg) : guildSummon(a, reg, id).reg;
      await saveHeroes(next); this.heroReg = next; $('guildNote').textContent = '';
    } catch (e) { $('guildNote').textContent = e.message; }
    this.renderGuild(); this.autosave?.(true);
  }
  // ── the branches and the move (campaign/branches.js; GUILD.branch): each branch — its town, its manager, its fame and people;
  // opening one, sending people between the houses, moving the guild
  townOf(id) { return this.atlas.towns.find(t => t.id === id) || null; }
  townIn(id) { const t = this.townOf(id); return t ? `${townLabel(t, 3)} ${t.name}` : 'городе'; }
  townName(id) { const t = this.townOf(id); return t ? `${townLabel(t, 1)} ${t.name}` : 'город'; }
  branchesHtml() {
    const a = this.atlas, G = this.G, BR = GUILD.branch, bs = branchesOf(G), most = branchesMost(G), pc = x => `${Math.round((x - 1) * 100)} %`;
    const mv = G.moving ? `<p class="note"><b>Гильдия переезжает в ${esc(this.townName(G.moving.to))}</b>: ещё ${Math.max(0, G.moving.until - a.hist.step)} ${plural(Math.max(0, G.moving.until - a.hist.step), 'сезон', 'сезона', 'сезонов')}. Пока — ни дел в городе, ни походов, никого у дверей.</p>` : '';
    const nextAt = BR.at.find(L => L > levelOf(G));
    const head = `<p class="note">Филиал — второй дом гильдии в другом городе: ${BR.slots} договора его города на доске сверх своих, ${BR.door[0]}–${BR.door[1]} человека у дверей из его земли, товар его города в оружейную. Отряд на договор филиала выходит оттуда и туда возвращается. Без управляющего филиал стоит. Филиалов сейчас ${bs.length} из ${most}${nextAt ? ` (ещё один — с ${nextAt}-го уровня)` : ''}; содержание — ${BR.upkeep} зол. за сезон каждый.</p>`;
    const rows = bs.map(br => {
      const t = this.townOf(br.town), idle = branchIdle(a, G, br), mgr = managerOf(G, br), lives = membersOf(G).filter(m => m.house === br.town && m !== mgr);
      const cands = membersOf(G).filter(m => m === mgr || ['ready', 'retired'].includes(m.guild.state));
      const pick = `<select data-bmgr="${br.town}"><option value="">— никого —</option>${cands.map(m => { const why = m === mgr ? null : managerWhy(a, G, br.town, m); return `<option value="${m.id}"${m === mgr ? ' selected' : ''}${why ? ` disabled title="${esc(why)}"` : ''}>${esc(m.name)}, ур. ${m.level || 1} · Х ${m.special?.C ?? 5}${houseTown(G, m) !== br.town ? ` · ${roadDays(a, houseTown(G, m), br.town)} дн. пути` : ''}</option>`; }).join('')}</select>`;
      const going = G.members.find(m => m.alive && m.guild?.state === 'road' && m.guild.to === br.town && m.guild.then === 'manage');
      return `<div class="sv${idle ? ' off' : ''}"><span class="t"><b>${esc(t?.name || '?')}</b> · ${roadDays(a, G.town, br.town)} дн. от дома · ${idle ? `<b>стоит: ${esc(idle)}</b>` : 'работает'}` +
        `<br><small class="fact">местная слава ${br.fame || 0} · плата его договоров +${pc(payK(br))} · договоры до тира ${TIER_LABEL[tierAt(G, br)] || '—'}${mgr ? ` · цены ×${priceK(G, br).toFixed(2).replace('.', ',')}, найм ×${feeK(G, br).toFixed(2).replace('.', ',')}` : ''}</small>` +
        `<br><small>Живут: ${lives.map(m => esc(m.name)).join(', ') || 'никого'}${going ? ` · управляющий в пути: ${esc(going.name)}` : ''}</small></span>` +
        `<div class="row"><small>Управляющий (ур. ${BR.manager.level}+; Харизма — цены и найм): ${pick}</small></div>` +
        `<div class="row actions"><button type="button" class="quiet mini" data-branch="close" data-town="${br.town}">закрыть филиал</button></div></div>`;
    });
    const used = new Set([G.town, ...bs.map(b => b.town)]), towns = a.towns.filter(t => t.alive && !used.has(t.id)).sort((p, q) => roadDays(a, G.town, p.id) - roadDays(a, G.town, q.id));
    const ow = towns.length ? openWhy(a, G, towns[0].id) : 'некуда';
    const open = `<div class="row"><small>Открыть филиал (${branchCost(G)} зол.): <select id="gBranchTown">${towns.map(t => `<option value="${t.id}"${t.id === this.townPick ? ' selected' : ''}${openWhy(a, G, t.id) ? ' disabled' : ''}>${esc(t.name)} · ${esc(townLabel(t, 0))} · ${roadDays(a, G.town, t.id)} дн.</option>`).join('')}</select>` +
      ` <button type="button" class="mini" data-branch="open"${ow && !towns.some(t => !openWhy(a, G, t.id)) ? ` disabled title="${esc(ow)}"` : ''}>Открыть</button>${ow && !towns.some(t => !openWhy(a, G, t.id)) ? ` ${esc(ow)}` : ''}</small></div>`;
    const houses = [G.town, ...bs.map(b => b.town)], who = membersOf(G).filter(m => ['ready', 'retired'].includes(m.guild.state));
    const xfer = bs.length ? `<div class="row"><small>Перевести: <select id="gXferWho">${who.map(m => `<option value="${m.id}">${esc(m.name)} (${esc(this.townOf(houseTown(G, m))?.name || '')})</option>`).join('')}</select> в <select id="gXferTo">${houses.map(id => `<option value="${id}">${esc(this.townOf(id)?.name || '')}${id === G.town ? ' (дом)' : ''}</option>`).join('')}</select>` +
      ` <button type="button" class="mini" data-branch="xfer">В дорогу</button> · ${BR.road.gold} зол. за день пути</small></div>` : '';
    const dests = [...bs.map(b => this.townOf(b.town)).filter(t => t?.alive), ...towns];
    const move = G.moving ? '' : `<h4 class="menu-group">Переезд</h4><p class="note">Дом гильдии переезжает в город филиала (${BR.move.branch.join('–')} сезона) или в город, где куплен дом (${BR.move.house} зол., ${BR.move.bare[0] / SEASONS.all().length}–${BR.move.bare[1] / SEASONS.all().length} года). Пока переезжает, гильдия ничего не берёт; комнаты теряют ${BR.move.lose.branch}–${BR.move.lose.bare} ур.; старый дом становится филиалом, если для него есть место. Женатые в городе, родня его жителей и родители растущих детей остаются в старом доме — а если филиала там не будет, могут уйти из гильдии.</p>` +
      `<div class="row"><small>Переехать в <select id="gMoveTown">${dests.map(t => `<option value="${t.id}"${t.id === this.townPick ? ' selected' : ''}${moveWhy(a, G, t.id) ? ` disabled` : ''}>${esc(t.name)}${bs.some(b => b.town === t.id) ? ' — филиал' : ` — дом ${moveCost(G, t.id)} зол.`} · ${moveSpan(G, t.id).join('–')} сез.</option>`).join('')}</select>` +
      ` <button type="button" class="mini" data-branch="move"${dests.some(t => !moveWhy(a, G, t.id)) ? '' : ` disabled title="${esc(dests.length ? moveWhy(a, G, dests[0].id) : 'некуда')}"`}>Переехать</button>${dests.length && !dests.some(t => !moveWhy(a, G, t.id)) ? ` ${esc(moveWhy(a, G, dests[0].id))}` : ''}</small></div>`;
    // the town to open a branch in or move to: by its name, or a click on it on the map (its card then offers both)
    const find = `<div class="row"><input id="gTownQ" type="search" autocomplete="off" placeholder="Найти город по названию…" aria-label="Найти город" value="${esc(this.townQ || '')}"><small> или щёлкните город на карте</small></div><div id="gTownHits" class="savelist"></div>`;
    return mv + head + `<div class="savelist errands">${rows.join('')}</div>` + find + (G.moving ? '' : open) + xfer + move;
  }
  // the parties out: each its errand and days; watch it (its camps on the local map — the others reckoned unseen), call it back
  partiesHtml() {
    const a = this.atlas, G = this.G, out = parties(a); if (!out.length) return '';
    return `<div class="savelist guild-parties">${out.map(K => `<div class="row"><small>${K === a.campaign ? '👁 ' : ''}<b>Отряд ${K.expedition}</b> · ${K.day} ${plural(K.day, 'день', 'дня', 'дней')} · ${esc(questWord(K))} · ${K.members.filter(m => m.alive).map(m => esc(m.name)).join(', ')}</small>` +
      (K === a.campaign ? '' : `<button type="button" class="quiet mini" data-watch="${K.expedition}">смотреть</button>`) +
      (abortWhy(a, G, K) ? '' : `<button type="button" class="quiet mini" data-recall="${K.expedition}" title="договор будет брошен: сразу — малая потеря славы, в последнюю пятую часть срока — как провал">отозвать</button>`) + '</div>').join('')}</div>`;
  }
  // the families (campaign/kin.js): the children of the guild's people, growing in the town
  familiesHtml() {
    const a = this.atlas, G = this.G, cs = G.children || [];
    if (!cs.length) return '';
    return `<h4 class="menu-group">Дети гильдии</h4><div class="savelist guild-people">${cs.map(c => `<div class="gm"><span class="t"><b>${esc(c.name)}</b> · ${esc(raceLabel(SPECIES.get(c.race)))}, ${Math.max(0, a.hist.year - c.born)} ${plural(Math.max(0, a.hist.year - c.born), 'год', 'года', 'лет')}` +
      `<br><small>${kinOf(a, G, c).map(k => `${k.word} — ${esc(k.who.name)}`).join(', ')}${c.orphan ? ' · сирота' : ''} · к дверям гильдии — в ${SPECIES.get(c.race)?.body?.adult ?? 16} лет</small></span></div>`).join('')}</div>`;
  }
  // the door: who came this season (anew each season — campaign/guild.js refreshRecruits)
  doorHtml() {
    const a = this.atlas, G = this.G, rs = G.recruits || [];
    if (!rs.length) return '';
    return `<h4 class="menu-group">У дверей (до нового сезона) · мест в казармах: ${membersOf(G).length} из ${rosterMost(G)}</h4><div class="savelist guild-people">${rs.map(m => {
      const why = recruitWhy(a, m.id);
      return `<div class="gm"><span class="t"><b>${esc(m.name)}</b> · ${esc(roleWord(m))}, ур. ${m.level || 1} · ${esc(raceLabel(SPECIES.get(m.race)))}, ${ageOf(a, m)} ${plural(ageOf(a, m), 'год', 'года', 'лет')}<br><small>${letters(m)} · ${esc([...m.gear.hand, m.gear.body].filter(Boolean).map(itemShort).join(', '))}</small></span>` +
        `<div class="row actions"><button type="button" class="mini" data-hire="${m.id}"${why ? ` disabled title="${esc(why)}"` : ''}>Нанять — ${m.fee} зол.</button></div></div>`;
    }).join('')}</div>`;
  }
  // the armory's racks and the town's shop (campaign/armory.js)
  armoryHtml() {
    const a = this.atlas, G = this.G, A = armoryOf(G), shop = shopOf(a, G), smith = working(G, 'forge');
    const rows = A.items.map(it => { const d = gearDef(it.token), fc = smith ? forgeCost(it.token) : null, fw = smith ? forgeWhy(G, it.id) : null;
      return `<div class="row"><small>${esc(d?.label || it.token)}${it.locked ? ' · <b>заперто</b>' : ''}</small>` +
        `<button type="button" class="quiet mini" data-arm="lock" data-id="${it.id}">${it.locked ? 'отпереть' : 'запереть'}</button>` +
        `<button type="button" class="quiet mini" data-arm="sell" data-id="${it.id}">продать — ${sellPrice(G, it.token)}</button>` +
        (smith && fc != null ? `<button type="button" class="quiet mini" data-arm="forge" data-id="${it.id}"${fw ? ` disabled title="${esc(fw)}"` : ''}>в кузню — ${fc}</button>` : '') + '</div>'; }).join('');
    return `<details class="obs-lib"><summary>Стойки: ${A.items.length} из ${racks(G)}</summary>${rows || '<small>Пусто: купите в городе или принесите трофеями.</small>'}</details>` +
      `<details class="obs-lib"><summary>Купить в городе (${shop.items.length})</summary>${shop.items.map(o => `<div class="row"><small>${esc(o.label)}</small><button type="button" class="quiet mini" data-arm="buy" data-token="${esc(o.token)}"${buyWhy(a, G, o.token) ? ' disabled' : ''}>купить — ${o.price}</button></div>`).join('') || '<small>Город оружием не торгует.</small>'}</details>`;
  }
  stableHtml() {
    const a = this.atlas, G = this.G, shop = shopOf(a, G), have = G.store?.beasts || [];
    return `<div class="row"><small>В конюшне: ${have.map(b => esc(BEAST_WORD[b.kind] || b.kind)).join(', ') || 'никого'} (${have.length} из ${stalls(G)})</small></div>` +
      (shop.beasts.length ? `<div class="row">${shop.beasts.map(o => `<button type="button" class="quiet mini" data-beast="${esc(o.kind)}"${have.length >= stalls(G) || G.gold < o.price ? ' disabled' : ''}>${esc(o.label)} — ${o.price}</button>`).join('')}</div>` : '<small>В городе зверей не продают.</small>');
  }
  // the war beasts (campaign/cages.js): who is in the cages, who goes with the next party; the town's beasts of prey
  cagesHtml() {
    const a = this.atlas, G = this.G, C = cagesOf(G), mk = beastMarket(a, G);
    const rows = C.beasts.map(b => `<div class="row"><small>${esc(beastLabel(b.species))} · здоровье ${Math.round(b.hp * 100)} %${b.home ? ' · <b>остаётся дома</b>' : ' · пойдёт с отрядом'}</small>` +
      `<button type="button" class="quiet mini" data-cage="home" data-id="${b.id}">${b.home ? 'брать в поход' : 'оставить дома'}</button><button type="button" class="quiet mini" data-cage="free" data-id="${b.id}">отпустить</button></div>`).join('');
    return `<div class="row"><small>В клетках: ${C.beasts.length} из ${cageRoom(G)}. Грифона, виверну, варга — только поймать (договор «Поймать…» на доске).</small></div>${rows}` +
      (mk.length ? `<div class="row">${mk.map(o => `<button type="button" class="quiet mini" data-war="${esc(o.species)}"${buyWarWhy(a, G, o.species) ? ' disabled' : ''}>${esc(o.label)} — ${o.price}</button>`).join('')}</div>` : '<small>Здешних хищников в городе не продают.</small>');
  }
  // ── the fallen (the board that is always there): who, when, how, what they had done
  fallenHtml() {
    const G = this.G, dead = G.members.filter(m => !m.alive || m.guild?.state === 'dead').sort((p, q) => (q.died?.year ?? 0) - (p.died?.year ?? 0));
    if (!dead.length) return '<p class="note">Доска павших пуста. Пусть так и остаётся.</p>';
    return `<div class="savelist guild-people">${dead.map(m => {
      const went = G.expeditions.filter(x => x.went.includes(m.id)).length;
      return `<div class="gm dead"><span class="t"><b>${esc(m.name)}</b> · ${esc(roleWord(m))}, ур. ${m.level || 1} · ${esc(raceLabel(SPECIES.get(m.race)))}` +
        `<br><small>${m.died ? `${m.died.year}-й год: ${esc(m.died.why || 'пал')}` : 'пал'} · походов ${went}${m.maims ? ` · увечий ${m.maims}` : ''}</small></span></div>`;
    }).join('')}</div>`;
  }
  // the board (the author's word 14.11): one way — the job first (a deed in town or a contract), then the party for it: the
  // named picked on their portraits (a deed — all who go; a contract — up to namedMost, the rest answer for themselves and
  // light up as they say yes, campaign/guild.js muster), then «Отправить»
  boardHtml() {
    const a = this.atlas, G = this.G, ids = [...this.gpick], B = guildBoard(a, ids, this.gsort);
    this.gsize = Math.min(this.gsize, partyMost(G));   // (the planning room: data/rooms.js)
    if (this.offerUid && !B.chores.some(o => o.uid === this.offerUid)) this.offerUid = null;
    this.board = B.errands;
    if (this.gerrand && !B.errands.some(e => e.id === this.gerrand && e.ok)) this.gerrand = null;
    const offer = B.chores.find(o => o.uid === this.offerUid) || null, card = this.gerrand ? B.errands.find(e => e.id === this.gerrand) : null;
    const chores = B.chores.map(o => `<label class="sv${o.uid === this.offerUid ? ' cur' : ''}${o.why ? ' off' : ''}"><input type="radio" name="gchore" value="${esc(o.uid)}"${o.uid === this.offerUid ? ' checked' : ''}>` +
      `<span class="t"><span class="tier">0</span><b>${esc(o.label)}</b> · плата ${o.pay} зол. · ${o.hands[0] === o.hands[1] ? o.hands[0] : `${o.hands[0]}–${o.hands[1]}`} чел. · ${o.days[0] === o.days[1] ? o.days[0] : `${o.days[0]}–${o.days[1]}`} дн.` +
      `<br><small>${esc(o.text)}${o.why ? ` <b>${esc(o.why)}</b>` : ''}</small></span></label>`).join('');
    const full = parties(a).length >= partiesMost(G);
    const lists = `<h4 class="menu-group">В городе</h4><div class="savelist errands">${chores || '<small>Дел в городе пока нет: новые — с началом сезона.</small>'}</div>` +
      `<h4 class="menu-group">Договоры</h4>` + this.partiesHtml() +
      (full ? `<p class="note">В пути все отряды, что позволяет комната планирования (${partiesMost(G)}).</p>` :
        (B.errands.length ? `<div class="row"><small>Порядок: <select data-gsort>${SORT_WORDS.map(([k, w]) => `<option value="${k}"${k === this.gsort ? ' selected' : ''}>${w}</option>`).join('')}</select></small></div>` : `<p class="note">Договоров нет: гильдии ${levelOf(G)}-го уровня мир доверяет немногое.</p>`) +
        `<div class="savelist errands">${errandCards(B.errands, this.gerrand, 'gerrand')}</div>`);
    const step = !offer && !card ? `<p class="note guild-step">1. Выберите задание — дело в городе или договор. 2. Соберите отряд на портретах. 3. «Отправить».</p>` : this.musterHtml(offer, card);
    return step + lists;
  }
  // step 2: the party for the job picked — the people at home as portraits: a click names one (goes for sure); for a contract
  // the others answer for themselves — lit who goes, dim who stays (with why)
  musterHtml(offer, card) {
    const a = this.atlas, G = this.G, ready = membersOf(G, 'ready'), ids = [...this.gpick].filter(id => ready.some(m => m.id === id));
    let head, lim, answers = new Map(), why, go = ids, size = '';
    if (offer) {
      head = `<b>${esc(offer.label)}</b> · в городе · плата ${offer.pay} зол. · ${offer.days[0] === offer.days[1] ? offer.days[0] : `${offer.days[0]}–${offer.days[1]}`} дн.`;
      lim = offer.hands[1];
      why = offer.why || (ids.length < offer.hands[0] ? `нужно ${offer.hands[0] === offer.hands[1] ? offer.hands[0] : `${offer.hands[0]}–${offer.hands[1]}`} чел.: отметьте их` : null);
      size = `<small>идут все отмеченные: ${ids.length} из ${offer.hands[0] === offer.hands[1] ? offer.hands[0] : `${offer.hands[0]}–${offer.hands[1]}`}</small>`;
    } else {
      head = `<b>${esc(card.label)}</b> · договор ${TIER_LABEL[card.tier]} · плата ${card.gold} зол.`;
      lim = namedMost(this.gsize);
      const M = ids.length ? muster(a, {contract: card.contract, size: this.gsize, named: ids}) : null;
      if (M) { for (const x of M.answers) answers.set(x.id, x); go = M.ids; }
      why = musterWhy(a, {size: this.gsize, named: ids}) || launchWhy(a, {ids: M ? M.ids : ids, contract: card.contract});
      if (!ids.length) why = `назначьте хотя бы одного (до ${lim}): остальные решат сами`;
      const sizes = Array.from({length: partyMost(G) - GUILD.party.min + 1}, (_, k) => GUILD.party.min + k).map(n => `<option value="${n}"${n === this.gsize ? ' selected' : ''}>${n}</option>`).join('');
      size = `<small>Отряд: <select data-gsize>${sizes}</select> чел.; назначить — до ${lim}, остальные вызываются сами${M ? ` · идут ${M.ids.length} из ${this.gsize}` : ''}</small>`;
    }
    const chip = m => {
      const named = ids.includes(m.id), x = answers.get(m.id), lit = named || go.includes(m.id);
      const tip = named ? 'назначен — идёт' : x ? (x.go ? `вызвался: ${x.why}` : `остаётся: ${x.why}`) : 'щелчок — назначить';
      return `<button type="button" class="gchip${named ? ' named' : ''}${lit ? ' lit' : ''}${x && !x.go && !named ? ' no' : ''}" data-chip="${m.id}" title="${esc(`${m.name}, ${roleWord(m)}, ур. ${m.level || 1} — ${tip}`)}">` +
        `<canvas class="pt" width="96" height="96" data-pt="${m.id}"></canvas><b>${esc(m.name.split(' ')[0])}</b><small>${esc(roleWord(m))} · ${m.level || 1}${named ? ' · ★' : x ? (x.go ? ' · ✓' : ' · ✗') : ''}</small></button>`;
    };
    return `<div class="guild-muster-panel"><div class="row"><span>${head}</span> <button type="button" class="quiet mini" data-act="unjob">← другое задание</button></div>` +
      `<div class="row">${size}</div><div class="gchips">${ready.map(chip).join('') || '<small>Дома никого: все на делах или в пути.</small>'}</div>` +
      `<div class="row actions"><button type="button" data-act="send" class="primary"${why ? ' disabled' : ''}>Отправить</button><small>${why ? esc(why) : offer ? 'отчёт придёт в летопись гильдии' : `в дорогу — ${GUILD.purse} зол. из казны и еда`}</small></div></div>`;
  }
  logHtml() {
    const G = this.G;
    return `<div class="guild-log">${G.log.slice(-LOG_LINES).reverse().map(l => `<div class="lv-${l.kind === 'death' ? 'top' : l.kind === 'choreBad' ? 'mid' : 'low'}"><small>${l.year}-й год, ${SEASONS.all()[l.season]?.label || ''}</small> ${esc(l.text)}</div>`).join('')}</div>`;
  }
  // a deed of the house (build, a post, a trainee, a patient): its error to the note; the panel and the save after it
  houseDo(f) {
    try { f(); $('guildNote').textContent = ''; } catch (e) { $('guildNote').textContent = e.message; }
    this.renderGuild(); this.autosave?.(true);
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

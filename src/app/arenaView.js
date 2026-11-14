// The arena (forest.html #arena; docs/GAME.md «Арена»; campaign/arena.js): a third way to play — one fight made by hand. On the
// left the setup: the kind of fight (a camp defended, a storm, a meeting), day or night (a foe that shuns the sun: by night, or
// by day under the ground), the land drawn at random by its seed, the company row by row (race, fighting role and class,
// level, gear, how many) and the foe row by row (a band by its strength, a beast by the head, each at its level), the strength
// (КС) of each side counted as it is set. «В бой» opens the camp map of a world cell and plays the fight: the sides counted as
// it goes, a pause, the pace, a creature's card on a click, the same fight again or back to the setup.
import {$} from '../ui/dom.js';
import {esc} from '../core/util.js';
import {Renderer} from '../render/renderer.js';
import {creatureHtml, personHtml} from '../ui/cards.js';
import {openCamp, stepCamp, campDone, arenaAtlas, arenaCatalog, arenaSetup, arenaSides, arenaRandom, arenaFoesFor, darkFoes} from '../view/campaign.js';
import {ARENA} from '../data/arena.js';

const STORE = 'forest.app.arena';
const PACES = [['x1', 1, '×1'], ['x4', 4, '×4'], ['x16', 16, '×16']];
const randomSeed = () => String(100000 + Math.floor(Math.random() * 899999));
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
const num = (key, i, v, lo, hi, title) => `<input type="number" data-k="${key}" data-i="${i}" value="${v}" min="${lo}" max="${hi}" title="${esc(title)}">`;

export class ArenaView {
  constructor() {
    this.cat = arenaCatalog();
    const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; } })();
    this.cfg = saved?.ours ? saved : {kind: 'defend', time: 'day', seed: randomSeed(), ...arenaRandom()};
    this.atlas = null; this.fight = null; this.pace = 1; this.paused = false;
    this.R = new Renderer($('arenaMap'));
    this.wire();
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.cfg)); } catch { /* private mode: not kept */ } }

  show() { this.fight ? this.loop() : this.renderSetup(); this.ensureAtlas(); }
  stop() { this.running = false; }
  // the world the cells are drawn from: made once a session (it takes some seconds — said so on the screen)
  ensureAtlas() {
    if (this.atlas || this.making) return;
    this.making = true; this.status('Готовлю мир для арены — один раз за сессию, несколько секунд…');
    setTimeout(() => { try { this.atlas = arenaAtlas('arena'); this.status(''); this.count(); } catch (e) { this.status(`Мир не собрался: ${e.message}`, 'bad'); } this.making = false; }, 30);
  }
  status(text, kind = '') { const s = $('arenaStatus'); s.textContent = text; s.className = `arena-status${kind ? ' ' + kind : ''}`; s.hidden = !text; }

  // ── the setup
  renderSetup() {
    const C = this.cat, c = this.cfg, dark = darkFoes(c.foes);
    $('arenaSetup').hidden = false; $('arenaFight').hidden = true;
    const kinds = Object.entries(C.kinds).map(([id, K]) => `<label class="arena-pick" title="${esc(K.note)}"><input type="radio" name="arenaKind" value="${id}"${c.kind === id ? ' checked' : ''}> ${esc(K.label)}</label>`).join('');
    const times = [['day', 'День'], ['night', 'Ночь']].map(([id, l]) => `<label class="arena-pick"><input type="radio" name="arenaTime" value="${id}"${c.time === id ? ' checked' : ''}> ${l}</label>`).join('');
    const darkNote = dark ? `<p class="arena-note">В отряде врага те, кто не выходит на солнце: ${c.time === 'night' ? 'бой — ночью.' : 'днём бой — в подземелье, там всегда ночь.'}</p>` : '';
    const ourRows = c.ours.map((r, i) => {
      const race = C.races.find(x => x.id === r.race) || C.races[0];
      const roles = race.roles.map(R => opt(R.id, `${R.label}${R.cls && R.cls !== R.label ? ` — ${R.cls}` : ''}`, R.id === r.role)).join('');
      return `<div class="arena-row"><select data-k="race" data-i="${i}">${C.races.map(x => opt(x.id, x.label, x.id === race.id)).join('')}</select>` +
        `<select data-k="role" data-i="${i}">${roles}</select>` +
        `<label>ур. ${num('level', i, r.level || 1, ...ARENA.levels.member, 'уровень бойца')}</label>` +
        `<select data-k="gear" data-i="${i}" title="снаряжение">${ARENA.gear.map((g, k) => opt(k, g.label, k === (r.gear ?? 2))).join('')}</select>` +
        `<label>× ${num('n', i, r.n || 1, 1, ARENA.most.members, 'сколько')}</label><button type="button" class="quiet" data-del="ours" data-i="${i}" title="Убрать">✕</button></div>`;
    }).join('');
    const foeRows = c.foes.map((r, i) => {
      const val = r.band ? `band:${r.band}` : `beast:${r.beast}`;
      const pick = `<select data-k="who" data-i="${i}"><optgroup label="Банды">${C.bands.map(b => opt(`band:${b.id}`, `${b.label}${b.dark ? ' ☾' : ''}`, val === `band:${b.id}`)).join('')}</optgroup>` +
        `<optgroup label="Звери и чудовища">${C.beasts.map(b => opt(`beast:${b.id}`, `${b.label}${b.dark ? ' ☾' : ''}`, val === `beast:${b.id}`)).join('')}</optgroup></select>`;
      const size = r.band ? `<label>КС ${num('s', i, r.s || 300, 50, ARENA.most.band, 'сила банды (КС): по ней набираются головы')}</label><select data-k="gear" data-i="${i}" title="снаряжение банды">${ARENA.gear.map((g, k) => opt(k, g.label, k === (r.gear ?? 2))).join('')}</select>`
        : `<label>× ${num('n', i, r.n || 1, 1, ARENA.most.heads, 'сколько голов')}</label>`;
      return `<div class="arena-row">${pick}${size}<label>ур. ${num('level', i, r.level || 1, ...ARENA.levels.foe, 'уровень: путь вида и класса')}</label><button type="button" class="quiet" data-del="foes" data-i="${i}" title="Убрать">✕</button></div>`;
    }).join('');
    $('arenaSetup').innerHTML =
      `<div class="field"><span class="lbl">Бой</span><div class="arena-picks">${kinds}</div><small class="muted">${esc(C.kinds[c.kind]?.note || '')}</small></div>` +
      `<div class="field"><span class="lbl">Время</span><div class="arena-picks">${times}</div>${darkNote}</div>` +
      `<div class="field"><span class="lbl">Местность</span><div class="arena-row"><span>случайная клетка мира, сид</span><input id="arenaSeed" value="${esc(c.seed)}" size="9"><button type="button" class="quiet" id="arenaDice" title="Бросить кубик: новая местность">🎲</button></div></div>` +
      `<div class="field"><span class="lbl">Наш отряд <b class="arena-ks" id="arenaOurKs">…</b></span>${ourRows || '<p class="muted">Никого.</p>'}` +
      `<div class="arena-row"><button type="button" id="arenaAddOur">+ Бойцы</button><button type="button" class="quiet" id="arenaRandOur">🎲 Случайный отряд</button></div></div>` +
      `<div class="field"><span class="lbl">Враги <b class="arena-ks" id="arenaFoeKs">…</b></span>${foeRows || '<p class="muted">Никого.</p>'}` +
      `<div class="arena-row"><button type="button" id="arenaAddFoe">+ Враги</button><button type="button" class="quiet" id="arenaRandFoe">🎲 Случайные враги</button></div>` +
      `<small class="muted">☾ — не выходят на солнце.</small></div>` +
      `<button type="button" class="primary" id="arenaGo">В бой</button>`;
    this.count();
  }
  // the company's strength as set (КС), for a random foe to match it
  ourStrength() { try { return this.atlas ? arenaSetup(this.atlas, {...this.cfg, foes: []}).info.ours : 500; } catch { return 500; } }
  // the strength of each side as set (КС: the company rated as the map rates it, the foe by its rows)
  count() {
    if (!this.atlas || $('arenaSetup').hidden) return;
    try {
      const {info} = arenaSetup(this.atlas, this.cfg);
      $('arenaOurKs').textContent = `КС ${info.ours} · ${info.heads}`;
      $('arenaFoeKs').textContent = `КС ≈ ${info.foes}`;
    } catch (e) { $('arenaOurKs').textContent = '—'; console.warn('арена: счёт не сложился', e); }
  }
  edit(e) {
    const t = e.target, k = t.dataset.k, i = +t.dataset.i, c = this.cfg;
    if (t.name === 'arenaKind') c.kind = t.value;
    else if (t.name === 'arenaTime') c.time = t.value;
    else if (t.id === 'arenaSeed') c.seed = t.value.trim() || randomSeed();
    else if (k && t.closest('.arena-row')) {
      const ours = !!t.closest('.field')?.querySelector('#arenaOurKs'), list = ours ? c.ours : c.foes, r = list[i]; if (!r) return;
      if (k === 'race') { r.race = t.value; const race = this.cat.races.find(x => x.id === t.value); if (!race.roles.some(R => R.id === r.role)) r.role = race.roles[0].id; }
      else if (k === 'role') r.role = t.value;
      else if (k === 'who') { const [kind, id] = t.value.split(':'); list[i] = kind === 'band' ? {band: id, s: r.s || 300, level: r.level || 1, gear: r.gear ?? 2} : {beast: id, n: r.n || 2, level: r.level || 1}; }
      else r[k] = +t.value;
    } else return;
    this.save(); this.renderSetup();
  }
  click(e) {
    const t = e.target.closest('button'); if (!t) return;
    const c = this.cfg;
    if (t.id === 'arenaDice') c.seed = randomSeed();
    else if (t.id === 'arenaAddOur') c.ours.push({race: c.ours.at(-1)?.race || 'human', role: c.ours.at(-1)?.role || 'shield', level: 1, gear: 2, n: 1});
    else if (t.id === 'arenaAddFoe') c.foes.push({beast: 'wolves', n: 2, level: 1});
    else if (t.id === 'arenaRandOur') c.ours = arenaRandom().ours;
    else if (t.id === 'arenaRandFoe') c.foes = arenaFoesFor(this.ourStrength());   // (about the company's strength)
    else if (t.dataset.del) c[t.dataset.del].splice(+t.dataset.i, 1);
    else if (t.id === 'arenaGo') return this.start();
    else return;
    this.save(); this.renderSetup();
  }

  // ── the fight
  start() {
    if (!this.atlas) { this.status('Мир ещё готовится — сейчас.'); return; }
    if (!this.cfg.ours.length || !this.cfg.foes.length) { this.status('Нужны обе стороны.', 'bad'); return; }
    let made;
    try { made = arenaSetup(this.atlas, this.cfg); } catch (e) { this.status(`Бой не собрался: ${e.message}`, 'bad'); return; }
    const w = openCamp(made.setup);
    this.fight = {w, info: made.info, view: {cam: {zoom: 2, cx: w.camp.x + 0.5, cy: w.camp.y + 0.5}, layer: 'world', resHidden: new Set(), selected: null, selBld: null, selCell: null}, frames: 0, end: null};
    this.R.setup(w); this.paused = false;
    $('arenaSetup').hidden = true; $('arenaFight').hidden = false; this.status('');
    this.renderFight(); this.loop();
  }
  loop() {
    if (this.running || !this.fight) return;
    this.running = true;
    const frame = () => {
      if (!this.running || !this.fight) { this.running = false; return; }
      const F = this.fight, w = F.w;
      if (!this.paused && !campDone(w)) for (let k = 0; k < this.pace && !campDone(w); k++) stepCamp(w);
      if (campDone(w) && !F.end) { F.end = this.verdict(); this.renderFight(); }
      this.R.draw(w, F.view);
      if (++F.frames % 10 === 0) { this.renderSides(); if (F.view.selected) this.card(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  verdict() {
    const S = arenaSides(this.fight.w);
    if (S.ours.n && !S.foes.n) return `Победа: на ногах ${S.ours.n} из ${this.fight.info.heads}.`;
    if (!S.ours.n) return S.foes.n ? 'Поражение: отряд пал.' : 'Пали все — и наши, и враги.';
    return 'Бой кончился: враг ушёл или день вышел.';
  }
  renderFight() {
    const F = this.fight, I = F.info;
    $('arenaFightHead').innerHTML = `<b>${esc(I.kind)}</b> · ${I.time === 'vault' ? 'подземелье, ночь' : I.time === 'night' ? 'ночь' : 'день'}${F.end ? ` — <b>${esc(F.end)}</b>` : ''}`;
    $('arenaPause').textContent = this.paused ? '▶' : '⏸';
    for (const b of document.querySelectorAll('#arenaPace button')) b.classList.toggle('on', +b.dataset.pace === this.pace);
    this.renderSides();
  }
  renderSides() {
    const F = this.fight; if (!F) return;
    const S = arenaSides(F.w), I = F.info;
    const bar = (s, of) => `<span class="arena-bar"><i style="width:${Math.round(Math.min(1, s / Math.max(1, of)) * 100)}%"></i></span>`;
    $('arenaSides').innerHTML = `<div class="arena-side-row ours"><b>Наши</b> ${S.ours.n} из ${I.heads} · КС ${S.ours.s}${bar(S.ours.s, I.ours)}</div>` +
      `<div class="arena-side-row foes"><b>Враги</b> ${S.spawned ? `${S.foes.n} · КС ${S.foes.s}` : 'на подходе'}${bar(S.foes.s, Math.max(I.foes, S.foes.s, F.foeTop || 0))}</div>`;
    if (S.spawned) F.foeTop = Math.max(F.foeTop || 0, S.foes.s);
  }
  card() {
    const F = this.fight, a = F.view.selected;
    if (!a) { $('arenaCard').innerHTML = '<p class="muted">Щёлкните по существу на карте.</p>'; return; }
    if (a.dead || !F.w.agents.includes(a)) { F.view.selected = null; $('arenaCard').innerHTML = '<p class="muted">Его больше нет на карте.</p>'; return; }
    $('arenaCard').innerHTML = `<div class="pc">${a.diary && a.likes ? personHtml(F.w, a) : creatureHtml(F.w, a)}</div>`;
  }
  pick(e) {
    const F = this.fight; if (!F || this.dragged) return;
    const r = $('arenaMap').getBoundingClientRect(), [fx, fy] = this.R.toCell(e.clientX - r.left, e.clientY - r.top);
    let best = null, bd = 0.9;
    for (const a of F.w.agents) { if (a.dead) continue; const d = Math.hypot(a.x - fx, a.y - fy); if (d < bd) { bd = d; best = a; } }
    F.view.selected = best; this.card();
  }

  wire() {
    const box = $('arenaSetup');
    box.addEventListener('change', e => this.edit(e));
    box.addEventListener('click', e => this.click(e));
    $('arenaPause').addEventListener('click', () => { this.paused = !this.paused; this.renderFight(); });
    $('arenaPace').innerHTML = PACES.map(([id, n, l]) => `<button type="button" class="quiet" data-pace="${n}" title="темп">${l}</button>`).join('');
    $('arenaPace').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.pace = +b.dataset.pace; this.renderFight(); });
    $('arenaAgain').addEventListener('click', () => { this.fight = null; this.running = false; this.start(); });
    $('arenaNewMap').addEventListener('click', () => { this.cfg.seed = randomSeed(); this.save(); this.fight = null; this.running = false; this.start(); });
    $('arenaBack').addEventListener('click', () => { this.fight = null; this.running = false; this.renderSetup(); });
    const cv = $('arenaMap'), at = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('wheel', e => { const F = this.fight; if (!F) return; e.preventDefault(); const [px, py] = at(e); this.R.zoomAt(F.w, F.view.cam, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), px, py); }, {passive: false});
    let g = null;
    cv.addEventListener('pointerdown', e => { if (!this.fight) return; g = {id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: e.button !== 0}; this.dragged = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const F = this.fight; if (!F || !g || g.id !== e.pointerId) return;
      if (!g.drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 4) g.drag = true;
      if (g.drag) { this.R.pan(F.w, F.view.cam, e.clientX - g.lx, e.clientY - g.ly); this.dragged = true; }
      g.lx = e.clientX; g.ly = e.clientY;
    });
    const up = () => { g = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('click', e => this.pick(e));
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }
}

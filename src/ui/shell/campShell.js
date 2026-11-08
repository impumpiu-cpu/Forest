// The campaign screen as a game screen (shell.css; docs/GAME.md «Экран похода»): a top bar with the day and what the
// caravan has, a rail of menus on the left that open a drawer over the map, the map in the middle, a column on the right
// (the world in small, what is under the hand, the tallies, the latest), and the company along the bottom as portraits.
// The shell owns no game logic: it takes the blocks the campaign view (ui/campaignView.js) already fills, by their ids,
// and lays them out in its own places; the view keeps filling them and never knows. `enter()` when the caravan is on
// its way, `leave()` back to the setup (the old layout stands as it was). Reads the campaign only through view/.
import {$} from '../dom.js';
import {SPECIES} from '../../data/species.js';
import {dress, gearDef} from '../../view/local.js';
import {realmLand} from '../../view/world.js';
import {drawPawn} from '../../render/art/pawn.js';
import {esc} from '../../core/util.js';

const BASE_H = 1080;   // the window height the sizes of shell.css are drawn for (--u: 1px)
const RAIL = [
  ['stock', '▦', 'Склад'], ['fights', '⚔', 'Бои'], ['fire', '♨', 'Совет'], ['chron', '✎', 'Летопись'], ['layers', '❖', 'Слои'], ['save', '⌂', 'Мир'],
];
const RES = [['Еда', '🍖', 'еда'], ['Груз', '▦', 'груз'], ['Казна', '◉', 'казна'], ['Следы', '✦', 'следы']];
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };

export class CampShell {
  constructor(view) {
    this.view = view; this.on = false; this.open = null; this.home = new Map(); this.pawns = new Map();
    this.build();
  }
  build() {
    const S = $('campaign');
    this.top = el('div', 'sh sh-top', `<span class="title" id="shTitle"></span><span class="sh-res" id="shRes"></span><span class="sp"></span>`);
    this.rail = el('div', 'sh sh-rail', RAIL.map(([id, ic, t]) => `<button type="button" data-menu="${id}" aria-pressed="false"><i>${ic}</i>${t}</button>`).join('') + '<span class="gap"></span>');
    this.map = el('div', 'sh-map');
    this.drawer = el('div', 'sh-drawer', `<h3><span id="shDrawerTitle"></span><span class="x" id="shDrawerClose">✕</span></h3><div class="body" id="shDrawerBody"></div>`);
    this.drawer.hidden = true; this.map.appendChild(this.drawer);
    this.side = el('div', 'sh-side',
      `<div class="sh sh-mini"><canvas id="shMini" aria-label="Мир в малом"></canvas></div>` +
      `<div class="sh sh-hand"><h3>Под рукой</h3><div class="body" id="shHand"></div></div>` +
      `<div class="sh sh-sum"><h3>Итоги</h3><div class="body" id="shSum"></div></div>` +
      `<div class="sh sh-last"><h3>Последнее<span class="x">летопись — в меню</span></h3><div class="body"><div class="log" id="shLast"></div></div></div>`);
    this.party = el('div', 'sh sh-party', `<h3><span id="shPartyHead">Отряд</span><span class="x" id="shPartyNote"></span></h3><div class="body"><button type="button" class="arrow" data-dir="-1" aria-label="Назад">‹</button><div class="scroll" id="shParty"></div><button type="button" class="arrow" data-dir="1" aria-label="Дальше">›</button></div><div class="sh-say" id="shSay" hidden></div>`);
    for (const n of [this.top, this.rail, this.map, this.side, this.party]) { n.hidden = true; S.appendChild(n); }
    this.rail.addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (b) this.toggle(b.dataset.menu); });
    $('shDrawerClose').addEventListener('click', () => this.toggle(null));
    this.party.addEventListener('click', e => { const b = e.target.closest('.arrow'); if (b) $('shParty').scrollBy({left: +b.dataset.dir * 300, behavior: 'smooth'}); });
    document.addEventListener('keydown', e => { if (this.on && e.key === 'Escape' && this.open) { this.toggle(null); e.stopPropagation(); } }, true);
    window.addEventListener('resize', () => { if (this.on) this.unit(); });
  }
  // a block of the old layout moved into the shell; `leave()` puts it back where it stood
  take(node, into) {
    if (!node) return;
    if (!this.home.has(node)) this.home.set(node, {parent: node.parentNode, next: node.nextSibling});
    into.appendChild(node);
  }
  unit() { document.documentElement.style.setProperty('--u', `${Math.max(0.7, Math.min(1.3, window.innerHeight / BASE_H)).toFixed(3)}px`); }

  enter() {
    if (this.on) return;
    this.on = true;
    const S = $('campaign'); S.classList.add('shell'); document.body.classList.add('shelled'); this.unit();
    for (const n of [this.top, this.rail, this.map, this.side, this.party]) n.hidden = false;
    const title = $('shTitle');
    this.take($('campTitle'), title); this.take($('campName2'), title);
    const sp = this.top.querySelector('.sp');
    this.take($('campDay'), this.top); this.top.insertBefore($('campDay'), sp); this.top.insertBefore($('shRes'), sp);
    for (const id of ['campSpeed', 'campPause', 'campBack']) this.take($(id), this.top);
    this.take(S.querySelector(':scope > .obs-map'), this.map); this.map.insertBefore(this.drawer, null);
    this.take($('campInspect'), $('shHand')); this.take($('campSummary'), $('shSum')); this.take($('campRoster'), $('shParty'));
    // what the rail opens (kept where they are until opened: the drawer takes them then)
    this.menus = {
      stock: [S.querySelector('[data-pane="stock"]'), 'Склад'], fights: [S.querySelector('[data-pane="fights"]'), 'Бои'],
      fire: [S.querySelector('[data-pane="fire"]'), 'Совет у костра'], chron: [S.querySelector(':scope > .obs-chron'), 'Летопись похода'],
      layers: [$('campLayer')?.closest('.card'), 'Слои карты'], save: [$('campSave')?.closest('.card'), 'Мир и поход'],
    };
    // the bars fed by what the view writes: the status list, the roster, the chronicle
    this.watch = [[$('campStatus'), () => this.syncTop()], [$('campRoster'), () => this.portraits()], [$('campLog'), () => this.syncLast()], [$('campFireWords') || $('campFire'), () => this.say()]];
    this.obs = new MutationObserver(ms => { const seen = new Set(); for (const m of ms) for (const [n, fn] of this.watch) if (n && (n === m.target || n.contains(m.target)) && !seen.has(fn)) { seen.add(fn); fn(); } });
    this.obs.observe(S, {childList: true, subtree: true, characterData: true});
    this.syncTop(); this.portraits(); this.syncLast();
    this.tick = setInterval(() => this.mini(), 400);
    requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); this.view.draw?.(); this.mini(); });   // (the canvases take their new boxes)
  }
  leave() {
    if (!this.on) return;
    this.on = false; this.toggle(null);
    clearInterval(this.tick); this.obs?.disconnect();
    for (const [node, {parent, next}] of [...this.home].reverse()) parent.insertBefore(node, next && next.parentNode === parent ? next : null);
    this.home.clear();
    const S = $('campaign'); S.classList.remove('shell'); document.body.classList.remove('shelled');
    for (const n of [this.top, this.rail, this.map, this.side, this.party]) n.hidden = true;
    document.documentElement.style.removeProperty('--u');
    requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); this.view.draw?.(); });
  }

  // the drawer: one menu at a time; the same button or Esc closes it
  toggle(id) {
    if (this.open) {
      const [node] = this.menus[this.open]; const h = this.home.get(node);
      if (h) { h.parent.insertBefore(node, h.next && h.next.parentNode === h.parent ? h.next : null); this.home.delete(node); }
      if (node?.dataset?.pane) node.hidden = true;
    }
    this.open = id && id !== this.open ? id : null;
    this.rail.querySelectorAll('[data-menu]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.menu === this.open)));
    this.drawer.hidden = !this.open;
    if (!this.open) return;
    const [node, title] = this.menus[this.open];
    $('shDrawerTitle').textContent = title;
    this.take(node, $('shDrawerBody')); node.hidden = false;
    if (this.open === 'fire') $('campDock')?.dispatchEvent(new CustomEvent('tab', {detail: {id: 'fire'}}));   // (the scene drawn at its real size)
    if (this.open === 'chron') { const log = $('campLog'); log.scrollTop = log.scrollHeight; }
  }

  // the top bar: the day and what the caravan has, read off the status list the view keeps («Еда», «Груз», «Казна», «Следы»)
  syncTop() {
    const dl = $('campStatus'); if (!dl) return;
    const rows = new Map(); [...dl.querySelectorAll('dt')].forEach(dt => rows.set(dt.textContent.trim(), dt.nextElementSibling?.textContent.trim() || ''));
    const short = v => v.replace(/\s*\(.*\)\s*$/, '').replace(/ мест$/, '').replace(/ зол\.$/, '').replace(/ (паёк|пайка|пайков)/, '');
    $('shRes').innerHTML = RES.map(([k, ic, t]) => rows.has(k) ? `<span><i>${ic}</i><small>${t}</small><b>${esc(short(rows.get(k)))}</b></span>` : '').join('');
    const doing = rows.get('Что делают'); if (doing) $('shPartyNote').textContent = doing;
  }
  // the latest: the last lines of the chronicle, mirrored
  syncLast() {
    const log = $('campLog'), box = $('shLast'); if (!log || !box) return;
    const lines = [...log.children].slice(-4);
    box.innerHTML = lines.map(d => `<div class="${d.className}">${d.innerHTML}</div>`).join('');
  }
  // the company as portraits: each row of the roster gets the member's pawn, dressed as it is (render/art/pawn.js)
  portraits() {
    const K = this.view.atlas?.campaign; if (!K) return;
    for (const row of $('campRoster').querySelectorAll('.rm')) {
      if (row.querySelector('canvas.pt')) continue;
      const m = K.members.find(x => x.id === +row.dataset.id); if (!m) continue;
      const cv = document.createElement('canvas'); cv.className = 'pt'; cv.width = 128; cv.height = 128;
      row.insertBefore(cv, row.firstChild);
      const sp = SPECIES.get(m.race), ctx = cv.getContext('2d');
      let pawn = this.pawns.get(m.id);
      const key = `${m.gear?.hand?.join(',')}|${m.gear?.body}`;
      if (!pawn || pawn.key !== key) {
        pawn = {key, id: m.id, species: m.race, gender: m.gender, equip: {}, faceX: 1};
        try { dress(pawn, [...(m.gear?.hand || []), m.gear?.body].filter(id => id && gearDef(id)), 0); } catch (e) { pawn.equip = {}; }
        this.pawns.set(m.id, pawn);
      }
      ctx.clearRect(0, 0, 128, 128);
      if (!sp || !drawPawn(ctx, pawn, sp, 64, 80, 56, '#8a6a4a')) { ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(64, 64, 18, 0, 6.283); ctx.fill(); }
    }
  }
  // a word said by the fire, over the one who says it (the view plays the scene: ui/campSocial.js fireWords)
  say() {
    const words = $('campFireWords'), box = $('shSay'); if (!box) return;
    const text = words?.textContent?.trim() || '';
    const m = text.match(/^([^:«]+?)(?:,[^:«]*)?:\s*«(.+)»$/);
    if (!text || !m) { box.hidden = true; return; }
    const K = this.view.atlas?.campaign, who = K?.members.find(x => x.name === m[1].trim());
    const row = who ? $('campRoster').querySelector(`.rm[data-id="${who.id}"]`) : null;
    box.innerHTML = `<b>${esc(m[1].trim())}:</b> ${esc(m[2])}`; box.hidden = false;
    if (row) { const r = row.getBoundingClientRect(), p = this.party.getBoundingClientRect(); box.style.left = `${Math.max(8, Math.min(p.width - box.offsetWidth - 8, r.left - p.left))}px`; }
  }
  // the world in small (the realms' land, the caravan, its goal): drawn from the view's own bitmap of the realms layer
  mini() {
    const cv = $('shMini'), a = this.view.atlas, K = a?.campaign, V = this.view; if (!cv || !a) return;
    const w = cv.clientWidth || 300, h = cv.clientHeight || 180, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0d0f0a'; ctx.fillRect(0, 0, w, h);
    const S = Math.min(w / a.w, h / a.h), ox = (w - a.w * S) / 2, oy = (h - a.h * S) / 2;
    ctx.imageSmoothingEnabled = false;
    const bmp = this.realmsBitmap(a); if (bmp) ctx.drawImage(bmp, ox, oy, a.w * S, a.h * S);
    const at = (i, r, color, ring) => { const x = ox + (i % a.w + 0.5) * S, y = oy + ((i / a.w | 0) + 0.5) * S; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fillStyle = color; ctx.fill(); if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke(); } };
    if (K) {
      if (K.goal != null && K.goal >= 0) at(K.goal, 4, 'rgba(255,220,120,0.9)', '#3a2a10');
      if (K.i != null) at(K.i, 3.5, '#f0e6c8', '#1b130a');
    }
    // the main map's window
    if (V.cam && $('campMap') && !$('campMap').hidden) { const r = V.box?.() || [0, 0]; const c = V.cam.clamp(r[0], r[1]); const x0 = -c.ox / c.S, y0 = -c.oy / c.S, x1 = (r[0] - c.ox) / c.S, y1 = (r[1] - c.oy) / c.S; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(ox + x0 * S, oy + y0 * S, (x1 - x0) * S, (y1 - y0) * S); }
  }
  // the realms layer painted once per change into a small bitmap (the same colours the map's «Державы» uses)
  realmsBitmap(a) {
    const key = `${a.hist?.step ?? -1}:${a.towns?.length || 0}:${a.realms?.length || 0}`;
    if (this.bmp && this.bmpKey === key) return this.bmp;
    const off = this.bmp || document.createElement('canvas'); off.width = a.w; off.height = a.h;
    const px = off.getContext('2d'), img = px.createImageData(a.w, a.h), d = img.data, own = realmLand(a), hue = new Map();
    const colorOf = r => { if (!hue.has(r)) { const k = hue.size; hue.set(r, [120 + (k * 67) % 120, 90 + (k * 43) % 110, 80 + (k * 89) % 130]); } return hue.get(r); };
    for (let i = 0; i < a.n; i++) {
      const o = i * 4, sea = !a.f.land?.[i], hgt = a.f.elev ? Math.max(0, Math.min(1, a.f.elev[i])) : 0.5, r = own?.[i];
      let c = sea ? [40, 60, 90] : [70 + hgt * 60, 80 + hgt * 50, 50 + hgt * 30];
      if (!sea && r != null && r >= 0) { const rc = colorOf(r); c = [(c[0] + rc[0] * 2) / 3, (c[1] + rc[1] * 2) / 3, (c[2] + rc[2] * 2) / 3]; }
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    px.putImageData(img, 0, 0); this.bmp = off; this.bmpKey = key; return off;
  }
}

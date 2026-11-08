// The game's shell (shell.css; docs/GAME.md «Экран похода», docs/ARCHITECTURE.md «Оболочка и прослойка view»): an
// observer's screen laid out as a game — a top bar, a rail of menus on the left that open a drawer over the map, the map
// in the middle, a column on the right, and a strip along the bottom. The shell owns no game logic: it takes the blocks
// a screen's view already fills, by their ids, and lays them out in its own places; the view keeps filling them and
// never knows. A screen describes itself to the shell (a spec: ui/shell/campShell.js, worldShell.js): what goes into
// the top bar, what the rail opens, what the column and the strip hold. `enter()` lays the screen out, `leave()` puts
// every block back where it stood.
import {$} from '../dom.js';
import {realmLand} from '../../view/world.js';

const BASE_H = 1080;   // the window height the sizes of shell.css are drawn for (--u: 1px)
export const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };

export class Shell {
  // spec: {section, title: [ids], top: [ids], rail: [[id, icon, label]], menus: {id: [() => node, title]}, side: [{id, title, note, node: () => node}],
  //        strip: {title, note: id, body: html}, mini: bool, watch: [[() => node, fn]], onEnter, onLeave}
  constructor(view, spec) {
    this.view = view; this.spec = spec; this.on = false; this.open = null; this.home = new Map();
    this.build();
  }
  build() {
    const S = $(this.spec.section), sp = this.spec, k = sp.key || sp.section;   // (`key`: a second shell on the same section names its ids apart)
    this.top = el('div', 'sh sh-top', `<span class="title" id="${k}ShTitle"></span><span class="sh-res" id="${k}ShRes"></span><span class="sp"></span>`);
    this.rail = el('div', 'sh sh-rail', sp.rail.map(([id, ic, t]) => `<button type="button" data-menu="${id}" aria-pressed="false"><i>${ic}</i>${t}</button>`).join('') + '<span class="gap"></span>');
    this.map = el('div', 'sh-map');
    this.drawer = el('div', 'sh-drawer', `<h3><span class="t"></span><span class="x" title="Закрыть (Esc)">✕</span></h3><div class="body"></div>`);
    this.drawer.hidden = true; this.map.appendChild(this.drawer);
    this.side = el('div', 'sh-side', (sp.mini ? `<div class="sh sh-mini"><canvas id="${k}ShMini" aria-label="Мир в малом"></canvas></div>` : '') +
      sp.side.map(s => `<div class="sh sh-${s.id}"><h3>${s.title}${s.note ? `<span class="x">${s.note}</span>` : ''}</h3><div class="body" id="${k}Sh_${s.id}"></div></div>`).join(''));
    this.side.style.gridTemplateRows = (sp.mini ? 'calc(190 * var(--u)) ' : '') + sp.side.map(s => s.rows || 'minmax(0,1fr)').join(' ');
    this.strip = sp.strip ? el('div', 'sh sh-strip' + (sp.strip.cls ? ' ' + sp.strip.cls : ''), `<h3><span>${sp.strip.title}</span><span class="x" id="${k}ShStripNote"></span></h3><div class="body" id="${k}Sh_strip">${sp.strip.body || ''}</div>`) : null;
    for (const n of [this.top, this.rail, this.map, this.side, this.strip]) if (n) { n.hidden = true; S.appendChild(n); }
    if (!sp.strip) this.map.style.gridRow = '2 / 4';
    const noSide = !sp.side.length && !sp.mini, noRail = !sp.rail.length;
    if (noSide) this.side.style.display = 'none'; if (noRail) this.rail.style.display = 'none';
    this.map.style.gridColumn = `${noRail ? 1 : 2} / ${noSide ? 4 : 3}`;
    this.rail.addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (b) this.toggle(b.dataset.menu); });
    this.drawer.querySelector('.x').addEventListener('click', () => this.toggle(null));
    document.addEventListener('keydown', e => { if (this.on && e.key === 'Escape' && this.open) { this.toggle(null); e.stopPropagation(); } }, true);
    window.addEventListener('resize', () => { if (this.on) this.unit(); });
  }
  // a block of the old layout moved into the shell; `leave()` puts it back where it stood
  take(node, into) {
    if (!node) return;
    if (!this.home.has(node)) this.home.set(node, {parent: node.parentNode, next: node.nextSibling});
    into.appendChild(node);
  }
  back(node) { const h = this.home.get(node); if (!h) return; h.parent.insertBefore(node, h.next && h.next.parentNode === h.parent ? h.next : null); this.home.delete(node); }
  unit() { document.documentElement.style.setProperty('--u', `${Math.max(0.7, Math.min(1.3, window.innerHeight / BASE_H)).toFixed(3)}px`); }
  slot(id) { return $(`${this.spec.key || this.spec.section}Sh_${id}`); }

  enter() {
    if (this.on) return;
    this.on = true;
    const sp = this.spec, S = $(sp.section); S.classList.add('shell'); document.body.classList.add('shelled'); this.unit();
    for (const n of [this.top, this.rail, this.map, this.side, this.strip]) if (n) n.hidden = false;
    const title = this.top.querySelector('.title'), spacer = this.top.querySelector('.sp');
    for (const id of sp.title) this.take($(id), title);
    for (const id of sp.top) { const n = $(id); if (n) { this.take(n, this.top); this.top.insertBefore(n, spacer); } }
    this.top.insertBefore(this.top.querySelector('.sh-res'), spacer);
    for (const id of sp.topEnd || []) this.take($(id), this.top);
    const mapNode = sp.map ? sp.map() : S.querySelector(':scope > .obs-map');
    if (mapNode) this.take(mapNode, this.map);
    if (sp.center) { const c = el('div', 'sh sh-center'); this.map.appendChild(c); this.take(sp.center(), c); this.center = c; }
    this.map.appendChild(this.drawer);
    for (const s of sp.side) { const n = s.node?.(); if (n) { this.take(n, this.slot(s.id)); if (n.dataset?.pane) n.hidden = false; } }
    if (sp.strip?.node) this.take(sp.strip.node(), this.slot('strip'));
    this.watch = (sp.watch || []).map(([f, fn]) => [f(), fn]);
    this.obs = new MutationObserver(ms => { const seen = new Set(); for (const m of ms) for (const [n, fn] of this.watch) if (n && (n === m.target || n.contains(m.target)) && !seen.has(fn)) { seen.add(fn); fn(); } });
    this.obs.observe(S, {childList: true, subtree: true, characterData: true});
    for (const [, fn] of this.watch) fn();
    if (sp.mini) this.tick = setInterval(() => this.mini(), 400);
    sp.onEnter?.(this);
    this.nodes = Object.fromEntries(Object.entries(sp.menus).map(([id, [f, title, after]]) => [id, [f(), title, after]]));   // (found once, now: moved into the drawer, a block is not where its finder looks)
    sp.opens && this.toggle(sp.opens);
    requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); this.view.draw?.(); if (sp.mini) this.mini(); });   // (the canvases take their new boxes)
  }
  leave() {
    if (!this.on) return;
    this.on = false; this.toggle(null);
    clearInterval(this.tick); this.obs?.disconnect();
    for (const node of [...this.home.keys()].reverse()) { if (node.dataset?.pane) node.hidden = !node.matches('[data-pane="object"]'); this.back(node); }
    const S = $(this.spec.section); S.classList.remove('shell'); document.body.classList.remove('shelled');
    for (const n of [this.top, this.rail, this.map, this.side, this.strip]) if (n) n.hidden = true;
    if (this.center) { this.center.remove(); this.center = null; }
    document.documentElement.style.removeProperty('--u');
    this.spec.onLeave?.(this);
    requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); this.view.draw?.(); });
  }

  // the drawer: one menu at a time; the same button or Esc closes it
  toggle(id) {
    if (this.open) { const [node] = this.nodes[this.open]; if (node) { this.back(node); if (node.dataset?.pane) node.hidden = true; } }
    this.open = id && id !== this.open ? id : null;
    this.rail.querySelectorAll('[data-menu]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.menu === this.open)));
    this.drawer.hidden = !this.open;
    if (!this.open) return;
    const [node, title, after] = this.nodes[this.open];
    this.drawer.querySelector('.t').textContent = title;
    if (node) { this.take(node, this.drawer.querySelector('.body')); node.hidden = false; if (node.tagName === 'DETAILS') node.open = true; }
    after?.(node);
  }
  // the top bar's numbers, read off a status list the view keeps (dt → dd): [[dt text, icon, label]]
  resources(dl, rows) {
    if (!dl) return;
    const got = new Map(); [...dl.querySelectorAll('dt')].forEach(dt => got.set(dt.textContent.trim(), dt.nextElementSibling?.textContent.trim() || ''));
    const short = v => v.replace(/\s*\(.*\)\s*$/, '').replace(/ мест$/, '').replace(/ зол\.$/, '').replace(/ (паёк|пайка|пайков)/, '');
    this.top.querySelector('.sh-res').innerHTML = rows.map(([k, ic, t]) => got.has(k) ? `<span><i>${ic}</i><small>${t}</small><b>${short(got.get(k)).replace(/</g, '&lt;')}</b></span>` : '').join('');
    return got;
  }
  // the last lines of a log, mirrored into a slot
  last(log, box, n = 4) {
    if (!log || !box) return;
    box.innerHTML = [...log.children].slice(-n).map(d => `<div class="${d.className}">${d.innerHTML}</div>`).join('');
  }
  // the world in small: the realms' land, the marks the screen asks for, the main map's window
  mini() {
    const cv = $(`${this.spec.key || this.spec.section}ShMini`), a = this.view.atlas, V = this.view; if (!cv || !a) return;
    const w = cv.clientWidth || 300, h = cv.clientHeight || 180, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0d0f0a'; ctx.fillRect(0, 0, w, h);
    const S = Math.min(w / a.w, h / a.h), ox = (w - a.w * S) / 2, oy = (h - a.h * S) / 2;
    ctx.imageSmoothingEnabled = false;
    const bmp = this.realmsBitmap(a); if (bmp) ctx.drawImage(bmp, ox, oy, a.w * S, a.h * S);
    const at = (i, r, color, ring) => { const x = ox + (i % a.w + 0.5) * S, y = oy + ((i / a.w | 0) + 0.5) * S; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fillStyle = color; ctx.fill(); if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke(); } };
    for (const [i, r, c, ring] of this.spec.marks?.(a) || []) if (i != null && i >= 0) at(i, r, c, ring);
    const mapCv = $(V.ids?.map);
    if (V.cam && mapCv && !mapCv.hidden) { const r = V.box?.() || [0, 0]; const c = V.cam.clamp(r[0], r[1]); const x0 = -c.ox / c.S, y0 = -c.oy / c.S, x1 = (r[0] - c.ox) / c.S, y1 = (r[1] - c.oy) / c.S; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(ox + x0 * S, oy + y0 * S, (x1 - x0) * S, (y1 - y0) * S); }
  }
  // the realms layer painted once per change into a small bitmap
  realmsBitmap(a) {
    const key = `${a.hist?.step ?? -1}:${a.towns?.length || 0}:${a.realms?.length || 0}:${a.stage}`;
    if (this.bmp && this.bmpKey === key) return this.bmp;
    const off = this.bmp || document.createElement('canvas'); off.width = a.w; off.height = a.h;
    const px = off.getContext('2d'), img = px.createImageData(a.w, a.h), d = img.data, own = a.towns ? realmLand(a) : null, hue = new Map();
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

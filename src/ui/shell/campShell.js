// The campaign screen in the shell (ui/shell/shell.js; docs/GAME.md «Экран похода»): the top bar with the day and what the
// caravan has (read off the status list the view keeps), the rail — stock, fights, the council, the walk's chronicle, the
// world's chronicle, the layers, the world — the column with the world in small (the caravan and its goal), «Под рукой», «Итоги», «Последнее»,
// and the company along the bottom as portraits, with a word said by the fire over the one who says it.
import {$} from '../dom.js';
import {Shell, SAY_EVENT} from './shell.js';
import {SPECIES} from '../../data/species.js';
import {dress, gearDef} from '../../view/local.js';
import {drawPawn} from '../../render/art/pawn.js';
import {esc} from '../../core/util.js';

const RES = [['Еда', '🍖', 'еда'], ['Груз', '▦', 'груз'], ['Казна', '◉', 'казна'], ['Следы', '✦', 'следы']];
const SAY_MS = 5000;   // a bubble's time on the screen, by the clock on the wall

export class CampShell extends Shell {
  constructor(view) {
    const S = () => $('campaign');
    super(view, {
      section: 'campaign', title: ['campTitle', 'campName2'], top: ['campDay'], topEnd: ['campSpeed', 'campPause', 'campBack'],
      rail: [['stock', '▦', 'Склад'], ['fights', '⚔', 'Бои'], ['fire', '♨', 'Совет'], ['chron', '✎', 'Летопись похода'], ['world', '◷', 'Летопись мира'], ['layers', '❖', 'Слои'], ['save', '⌂', 'Мир']],
      menus: {
        stock: [() => S().querySelector('[data-pane="stock"]'), 'Склад'], fights: [() => S().querySelector('[data-pane="fights"]'), 'Бои'],
        fire: [() => S().querySelector('[data-pane="fire"]'), 'Совет у костра', () => $('campDock')?.dispatchEvent(new CustomEvent('tab', {detail: {id: 'fire'}}))],   // (the scene drawn at its real size)
        chron: [() => S().querySelector(':scope > .obs-chron'), 'Летопись похода', () => { const log = $('campLog'); log.scrollTop = log.scrollHeight; }],
        world: [() => $('campWorldBox'), 'Летопись мира', () => this.view.renderWorldLog?.(true)],   // (the world's history, ui/worldChron.js)
        layers: [() => $('campLayer')?.closest('.card'), 'Слои карты'], save: [() => $('campSave')?.closest('.card'), 'Мир и поход'],
      },
      mini: true, marks: a => { const K = a.campaign; return K ? [[K.goal, 4, 'rgba(255,220,120,0.9)', '#3a2a10'], [K.i, 3.5, '#f0e6c8', '#1b130a']] : []; },
      side: [{id: 'hand', title: 'Под рукой', node: () => $('campInspect'), rows: 'minmax(0,1.2fr)'}, {id: 'sum', title: 'Итоги', node: () => $('campSummary')},
        {id: 'last', title: 'Последнее', note: 'летопись — в меню', rows: 'calc(118 * var(--u))'}],
      strip: {title: 'Отряд', cls: 'sh-party', body: `<button type="button" class="arrow" data-dir="-1" aria-label="Назад">‹</button><div class="scroll" id="campShParty"></div><button type="button" class="arrow" data-dir="1" aria-label="Дальше">›</button>`},
      watch: [[() => $('campStatus'), () => this.syncTop()], [() => $('campRoster'), () => this.portraits()], [() => $('campLog'), () => this.last($('campLog'), this.slot('last'))]],
      onEnter: () => this.take($('campRoster'), $('campShParty')),
    });
    this.pawns = new Map(); this.bubbles = []; this.bubbleTimer = 0;
    document.addEventListener(SAY_EVENT, e => this.speak(e.detail.who, e.detail.said));
    $('campShParty').addEventListener('scroll', () => this.placeBubbles());
    this.strip.addEventListener('click', e => { const b = e.target.closest('.arrow'); if (b) $('campShParty').scrollBy({left: +b.dataset.dir * 300, behavior: 'smooth'}); });
  }
  syncTop() {
    const rows = this.resources($('campStatus'), RES);
    const doing = rows?.get('Что делают'); if (doing) $('campaignShStripNote').textContent = doing;
  }
  // the company as portraits: each row of the roster gets the member's pawn, dressed as it is (render/art/pawn.js)
  portraits() {
    const K = this.view.atlas?.campaign; if (!K) return;
    for (const row of $('campRoster').querySelectorAll('.rm')) {
      if (row.querySelector('canvas.pt')) continue;
      const m = K.members.find(x => x.id === +row.dataset.id); if (!m) continue;
      // the card: the role above, the picture, the name below (the roster's own line stays as the tooltip)
      const head = row.querySelector(':scope > span'), role = (head?.textContent || '').split('·')[1]?.replace(/\(.*$/, '').trim() || '';
      row.title = `${head?.textContent.trim() || m.name}\n${row.querySelector(':scope > small')?.textContent.trim() || ''}`;
      const cv = document.createElement('canvas'); cv.className = 'pt'; cv.width = 256; cv.height = 256;
      row.insertBefore(cv, row.firstChild);
      const r = document.createElement('em'); r.className = 'role'; r.textContent = role; row.insertBefore(r, cv);
      const nm = document.createElement('b'); nm.className = 'nm'; nm.textContent = m.name; cv.after(nm);
      const sp = SPECIES.get(m.race), ctx = cv.getContext('2d'), key = `${m.gear?.hand?.join(',')}|${m.gear?.body}`;
      let pawn = this.pawns.get(m.id);
      if (!pawn || pawn.key !== key) {
        pawn = {key, id: m.id, species: m.race, gender: m.gender, equip: {}, faceX: 1};
        try { dress(pawn, [...(m.gear?.hand || []), m.gear?.body].filter(id => id && gearDef(id)), 0); } catch (e) { pawn.equip = {}; }
        this.pawns.set(m.id, pawn);
      }
      ctx.clearRect(0, 0, 256, 256);
      if (!sp || !drawPawn(ctx, pawn, sp, 128, 168, 118, '#8a6a4a')) { ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(128, 128, 36, 0, 6.283); ctx.fill(); }
    }
  }
  // words said in the company (ui/campaignView.js SAY_EVENT: the fire's lines now, abilities and the small talk of the march
  // later), as bubbles over the speakers' portraits — each shown SAY_MS of the clock on the wall, whatever the game's pace;
  // a speaker scrolled out of the strip gets his bubble at its edge, with the arrow pointing on
  speak(who, said) {
    const K = this.view.atlas?.campaign; if (!K || !this.on) return;
    for (const id of who) {
      const m = K.members.find(x => x.id === id); if (!m) continue;
      const old = this.bubbles.find(b => b.id === id); if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
      const el = document.createElement('div'); el.className = 'sh-say'; el.innerHTML = `<b>${esc(m.name)}:</b> ${esc(said)}`;
      this.strip.appendChild(el);
      this.bubbles.push({id, el, until: performance.now() + SAY_MS});
    }
    this.placeBubbles();
    if (!this.bubbleTimer) this.bubbleTimer = setInterval(() => this.ageBubbles(), 250);
  }
  ageBubbles() {
    const now = performance.now();
    for (const b of [...this.bubbles]) if (now >= b.until) { b.el.remove(); this.bubbles.splice(this.bubbles.indexOf(b), 1); }
    if (!this.bubbles.length) { clearInterval(this.bubbleTimer); this.bubbleTimer = 0; }
    else this.placeBubbles();
  }
  placeBubbles() {
    const p = this.strip.getBoundingClientRect(), scroll = $('campShParty'), sr = scroll.getBoundingClientRect();
    const placed = this.bubbles.map(b => {
      const card = $('campRoster').querySelector(`.rm[data-id="${b.id}"]`), r = card?.getBoundingClientRect();
      let x = r ? r.left - p.left + r.width / 2 - 24 : p.width / 2, side = '';
      if (r && r.right < sr.left + 10) { x = sr.left - p.left + 4; side = 'left'; }   // (scrolled out to the left)
      else if (r && r.left > sr.right - 10) { x = sr.right - p.left - b.el.offsetWidth - 4; side = 'right'; }
      return {b, x: Math.max(4, Math.min(p.width - b.el.offsetWidth - 4, x)), side};
    }).sort((u, v) => u.x - v.x);
    const rows = [];   // the right edge of the last bubble in each row: a bubble goes to the first row with room
    for (const {b, x, side} of placed) {
      let row = rows.findIndex(right => x >= right); if (row < 0) { row = rows.length; rows.push(0); }
      rows[row] = x + b.el.offsetWidth + 8;
      b.el.style.left = `${x}px`; b.el.style.bottom = `calc(100% + ${6 + row * 46}px)`; b.el.dataset.side = side;
    }
  }
}

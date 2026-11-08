// The campaign screen in the shell (ui/shell/shell.js; docs/GAME.md «Экран похода»): the top bar with the day and what the
// caravan has (read off the status list the view keeps), the rail — stock, fights, the council, the chronicle, the
// layers, the world — the column with the world in small (the caravan and its goal), «Под рукой», «Итоги», «Последнее»,
// and the company along the bottom as portraits, with a word said by the fire over the one who says it.
import {$} from '../dom.js';
import {Shell} from './shell.js';
import {SPECIES} from '../../data/species.js';
import {dress, gearDef} from '../../view/local.js';
import {drawPawn} from '../../render/art/pawn.js';
import {esc} from '../../core/util.js';

const RES = [['Еда', '🍖', 'еда'], ['Груз', '▦', 'груз'], ['Казна', '◉', 'казна'], ['Следы', '✦', 'следы']];

export class CampShell extends Shell {
  constructor(view) {
    const S = () => $('campaign');
    super(view, {
      section: 'campaign', title: ['campTitle', 'campName2'], top: ['campDay'], topEnd: ['campSpeed', 'campPause', 'campBack'],
      rail: [['stock', '▦', 'Склад'], ['fights', '⚔', 'Бои'], ['fire', '♨', 'Совет'], ['chron', '✎', 'Летопись'], ['layers', '❖', 'Слои'], ['save', '⌂', 'Мир']],
      menus: {
        stock: [() => S().querySelector('[data-pane="stock"]'), 'Склад'], fights: [() => S().querySelector('[data-pane="fights"]'), 'Бои'],
        fire: [() => S().querySelector('[data-pane="fire"]'), 'Совет у костра', () => $('campDock')?.dispatchEvent(new CustomEvent('tab', {detail: {id: 'fire'}}))],   // (the scene drawn at its real size)
        chron: [() => S().querySelector(':scope > .obs-chron'), 'Летопись похода', () => { const log = $('campLog'); log.scrollTop = log.scrollHeight; }],
        layers: [() => $('campLayer')?.closest('.card'), 'Слои карты'], save: [() => $('campSave')?.closest('.card'), 'Мир и поход'],
      },
      mini: true, marks: a => { const K = a.campaign; return K ? [[K.goal, 4, 'rgba(255,220,120,0.9)', '#3a2a10'], [K.i, 3.5, '#f0e6c8', '#1b130a']] : []; },
      side: [{id: 'hand', title: 'Под рукой', node: () => $('campInspect'), rows: 'minmax(0,1.2fr)'}, {id: 'sum', title: 'Итоги', node: () => $('campSummary')},
        {id: 'last', title: 'Последнее', note: 'летопись — в меню', rows: 'calc(118 * var(--u))'}],
      strip: {title: 'Отряд', cls: 'sh-party', body: `<button type="button" class="arrow" data-dir="-1" aria-label="Назад">‹</button><div class="scroll" id="campShParty"></div><button type="button" class="arrow" data-dir="1" aria-label="Дальше">›</button><div class="sh-say" id="campShSay" hidden></div>`},
      watch: [[() => $('campStatus'), () => this.syncTop()], [() => $('campRoster'), () => this.portraits()], [() => $('campLog'), () => this.last($('campLog'), this.slot('last'))], [() => $('campFire'), () => this.say()]],
      onEnter: () => this.take($('campRoster'), $('campShParty')),
    });
    this.pawns = new Map();
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
      const cv = document.createElement('canvas'); cv.className = 'pt'; cv.width = 128; cv.height = 128;
      row.insertBefore(cv, row.firstChild);
      const sp = SPECIES.get(m.race), ctx = cv.getContext('2d'), key = `${m.gear?.hand?.join(',')}|${m.gear?.body}`;
      let pawn = this.pawns.get(m.id);
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
    const words = $('campFireWords'), box = $('campShSay'); if (!box) return;
    const text = words?.textContent?.trim() || '', m = text.match(/^([^:«]+?)(?:,[^:«]*)?:\s*«(.+)»$/);
    if (!text || !m) { box.hidden = true; return; }
    const K = this.view.atlas?.campaign, who = K?.members.find(x => x.name === m[1].trim());
    const row = who ? $('campRoster').querySelector(`.rm[data-id="${who.id}"]`) : null;
    box.innerHTML = `<b>${esc(m[1].trim())}:</b> ${esc(m[2])}`; box.hidden = false;
    if (row) { const r = row.getBoundingClientRect(), p = this.strip.getBoundingClientRect(); box.style.left = `${Math.max(8, Math.min(p.width - box.offsetWidth - 8, r.left - p.left))}px`; }
  }
}

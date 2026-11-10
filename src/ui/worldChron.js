// The world's chronicle on screen (atlas/chronicle.js): the lines of a.chronicle at the detail chosen, appended as the
// world lives on — «Летопись» of the settled world (app/settleView.js) and «Летопись мира» of the campaign screen
// (ui/campaignView.js: along the bottom while a world is made and its capital picked, a menu of its own on the walk).
// Not the campaign's own chronicle («Летопись похода», campaign/chronicle.js): that one is the caravan's days.
import {lineLevel, keeps, seasonLabel} from '../view/world.js';
import {STAGE_ERAS} from '../data/labels.js';
import {esc} from '../core/util.js';

// one line: the date (a year and season, or the land's stage before history), the text — a calamity and the hand's own
// deeds in bold
export function worldLineHtml(c) {
  const lv = c.hand || lineLevel(c) === 'major' ? 'notice' : 'info';
  const when = c.season != null ? `год ${c.year}, ${seasonLabel(c.season)}` : esc(STAGE_ERAS[c.era] || c.era || '');
  const text = c.topic === 'calamity' || c.hand ? `<b>${esc(c.text)}</b>` : esc(c.text);
  return `<div class="lv-${lv}${c.topic === 'calamity' ? ' lv-alert' : ''}"><small>${when}</small> ${text}</div>`;
}

export class WorldChron {
  // box: the .log the lines go into; land: the land's stages too (lines without a season), not only the history;
  // empty: what stands in the box with no lines yet
  constructor(box, {land = false, empty = 'Летопись мира начнётся с первым годом истории.'} = {}) {
    this.box = box; this.land = land; this.empty = empty; this.of = null; this.detail = null; this.shown = 0;
  }
  reset() { this.of = null; }
  // the lines of `a` at `detail` ('major' | 'normal' | 'all'); only the new ones are added, the box keeps its scroll
  // unless it stood at the end
  render(a, detail) {
    const box = this.box; if (!box) return;
    if (!a) { this.of = null; box.innerHTML = `<small class="muted">${esc(this.empty)}</small>`; return; }
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 12;
    if (this.of !== a || this.detail !== detail) { this.of = a; this.detail = detail; this.shown = 0; box.innerHTML = ''; }
    const all = a.chronicle || [];
    if (all.length > this.shown) {
      const lines = all.slice(this.shown).filter(c => (this.land || c.season != null) && keeps(detail, lineLevel(c)));
      this.shown = all.length;
      if (lines.length) { box.querySelector(':scope > .wc-empty')?.remove(); box.insertAdjacentHTML('beforeend', lines.map(worldLineHtml).join('')); }
    }
    if (!box.childElementCount) box.innerHTML = `<small class="muted wc-empty">${esc(this.empty)}</small>`;
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
}

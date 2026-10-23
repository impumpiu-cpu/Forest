// «Кампания» of the new menu (forest.html #camp; docs/TABLE.md, этап 10): the living worlds of the library — settled by
// hand, epic, or of the polygon — with the quest each gives (atlas/calamity.js questHint, kept in the library's index).
// The walk itself is the campaign screen (ui/campaignView.js): a world chosen here opens there, at its capitals.
import {listWorlds} from '../ui/worlds.js';
import {esc, plural} from '../core/util.js';
import {$} from '../ui/dom.js';

const PHASE = {out: 'ищут', back: 'несут домой', won: 'вернулись с победой', lost: 'погибли', timeout: 'не вернулись'};

// open a world of the library on the campaign screen (index.html; «← Главное меню» there comes back here)
export const march = (id, name) => { location.href = `index.html?${new URLSearchParams({go: 'campaign', world: id, name, from: 'forest'})}`; };

export function questText(r) {
  const Q = r.quest;
  if (Q?.kind === 'hand') return `квест — бедствие «${Q.label}»${Q.boss ? `: ${Q.boss}` : ''}${Q.phase === 'rise' ? ', уже идёт' : `, поднимется в ${Q.riseAt}-м году`}`;
  if (Q?.kind === 'epic') return `квест — артефакт: могилы ${Q.graves} ${plural(Q.graves, 'босса', 'боссов', 'боссов')} и четвёртое бедствие`;
  return 'квест — корона, потерянная историей мира';
}

export class CampView {
  constructor() {
    $('campList').addEventListener('click', e => { const row = e.target.closest('.sv'); if (row && e.target.closest('button')) march(row.dataset.id, row.dataset.name); });
  }
  async show() {
    const box = $('campList');
    let list;
    try { list = (await listWorlds()).filter(r => r.type !== 'land' && r.done !== false); } catch (e) { box.innerHTML = '<small>Библиотека в этом браузере недоступна.</small>'; return; }
    if (!list.length) { box.innerHTML = '<small>Пока нет живых миров: заселите землю («Заселение мира») или начните «Быстрый старт».</small>'; return; }
    box.innerHTML = list.map(r => `<div class="sv" data-id="${esc(r.id)}" data-name="${esc(r.name)}"><span class="t"><b>${esc(r.name)}</b> · ${esc(r.sizeLabel)} · ${r.free ? 'заселённый' : r.epic ? 'эпический' : 'полигон'} · ${r.lived ?? Math.max(0, r.year - 1)} лет · городов ${r.towns}` +
      `<br><small>${esc(questText(r))}${r.campaign ? ` · поход из ${esc(r.campaign.from)}: ${PHASE[r.campaign.phase] || r.campaign.phase}` : ''}${r.tables ? ` · с правками таблиц (${r.tables})` : ''}</small></span>` +
      `<button type="button" class="primary">${r.campaign && !['won', 'lost', 'timeout'].includes(r.campaign.phase) ? 'Продолжить' : 'В поход'}</button></div>`).join('');
  }
}

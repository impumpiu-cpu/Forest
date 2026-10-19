// What a settlement on a cell of the world map would find there, in words: the same summary on the
// «Мир» screen (the card of a picked cell) and in the «Карта» menu (the chosen cell). Reads only the
// cell's plan (seam/cell.js), never the world.
import {BIOMES} from '../data/biomes.js';
import {LEVEL_WORDS} from '../data/regions.js';
import {ORES} from '../data/ores.js';
import {RAID_BANDS} from '../data/raids.js';
import {esc} from '../core/util.js';

const SIDE = {north: 'с севера', south: 'с юга', east: 'с востока', west: 'с запада'};
const pct = v => `${Math.round(v * 100)}%`;
const oreLabel = id => (ORES.has(id) ? ORES.get(id).label : id);

export function cellSummary(plan) {
  const R = plan.region, X = plan.extra, rows = [];
  const row = (k, v) => rows.push(`<dt>${k}</dt><dd>${v}</dd>`);
  row('Мир', `${esc(plan.ref.name)} · клетка ${plan.ref.x}, ${plan.ref.y}${plan.ref.year ? ` · ${plan.ref.year}-й год` : ''}`);
  row('Местность', `${esc(R.label)}: ` + Object.entries(R.biomes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, v]) => `${BIOMES.has(id) ? BIOMES.get(id).label : id} ${pct(v)}`).join(', '));
  row('Климат', `${esc(X.climate.label)}, ${esc(X.climate.note)}`);
  const ores = Object.entries(R.ores).filter(([, v]) => v > 0).map(([id, v]) => `${oreLabel(id)} — ${LEVEL_WORDS[v]}`);
  if (R.placer > 0) ores.push(`золотой песок — ${LEVEL_WORDS[R.placer]}`);
  row('Руды', ores.join(', ') || 'нет');
  const roads = X.gates.filter(g => g.kind === 'road').map(g => SIDE[g.side]), river = X.gates.find(g => g.kind === 'river' && g.role === 'source');
  const mouth = X.gates.find(g => g.kind === 'river' && g.role === 'mouth');
  row('Пути', [roads.length ? `дорога ${roads.join(' и ')}` : 'дорог нет', river ? `${river.wide ? 'большая река' : 'река'} течёт ${SIDE[river.side]} ${mouth ? 'на ' + {north: 'север', south: 'юг', east: 'восток', west: 'запад'}[mouth.side] : ''}` : 'реки нет'].join('; '));
  const nb = X.neighbours || {};
  if (nb.kin) row('Свои', `${esc(nb.kin.label)} — ${nb.kin.dist} дн. (${esc(nb.kin.note.split(':')[0])})`);
  if (nb.empire) row('Торг', nb.empire.town === nb.kin?.town ? 'там же' : `${esc(nb.empire.label)} — ${nb.empire.dist} дн.`);
  if (nb.hostile) {
    const bands = Object.entries(nb.hostile.bands).sort((a, b) => b[1] - a[1]).map(([id]) => (RAID_BANDS.has(id) ? RAID_BANDS.get(id).label : id));
    row('Угроза', `${bands.join(', ')} — ближайшие в ${nb.hostile.dist} дн.<br><small>${esc(nb.hostile.note)}</small>`);
  } else row('Угроза', 'набегов ждать неоткуда');
  // a land that starves or freezes a fresh camp: say so before the landing (the world does not soften it)
  const fert = Object.entries(R.biomes).reduce((s, [id, v]) => s + v * (BIOMES.has(id) ? BIOMES.get(id).fert : 1), 0) * (X.fert ?? 1);
  const warn = [];
  if (fert < 0.4) warn.push('земля почти ничего не родит: еды не будет, кроме привезённой и добытой охотой');
  if (X.climate.meanT < 1) warn.push('холодно круглый год: без тёплой одежды и дров не выжить');
  if (warn.length) rows.push(`<dt class="warn">Внимание</dt><dd class="warn">${warn.join('; ')}</dd>`);
  return rows.join('');
}

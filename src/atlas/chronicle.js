// The world's chronicle as a reader takes it (docs/CAMPAIGN.md «Доработка, этап 9»): every line has a level of
// importance (data/worldChronicle.js), the whole is written out as a text by its eras — the making of the land, then
// the wild era, the elder peoples, the young peoples, and what came after — at the detail asked for; and the chronicle
// of the calamities (atlas/calamity.js) apart: the artifact's dawn, then each calamity from its omens to its grave, with
// its boss and the alliance against it. A grave's epitaph (for the campaign's clues) is told from the same.
import {SEASONS} from '../data/seasons.js';
import {plural} from '../core/util.js';
import {SEASONS_PER_YEAR, ATLAS_SIZES} from '../data/atlas.js';
import {ERAS} from '../data/history.js';
import {LEVELS, LEVEL_RULES} from '../data/worldChronicle.js';
import {SPECIES} from '../data/species.js';
import {STATS} from '../data/special.js';
import {eraPlan} from './history.js';
import {wherePhrase} from './lairs.js';
import {realmLabel} from './realms.js';

const SEASON_LIST = SEASONS.all();
const STAGE_ERAS = {geology: 'Геология', climate: 'Климат', water: 'Вода', life: 'Жизнь'};
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const BY = {dragon: 'от дракона', beasts: 'от собственных стай', heroes: 'запечатан героями', cleared: 'вместе с логовом', alliance: 'от союза держав', none: '—'};

// a line's level: 'major' | 'normal' | 'minor'
export function lineLevel(c) {
  if (c.topic === 'calamity' || c.campaign || c.stage) return 'major';
  for (const R of LEVEL_RULES) if (R.re.test(c.text)) return R.level;
  return 'normal';
}
// the lines kept at a detail: 'major' — only the major; 'normal' — and the normal; 'all' — everything
export const keeps = (detail, level) => detail === 'all' || level === 'major' || (detail === 'normal' && level === 'normal');
export const DETAILS = [{id: 'major', label: 'Важное'}, {id: 'normal', label: 'Обычное'}, {id: 'all', label: 'Всё'}];

// the eras with their years (the first year of history is 1)
export function eraSpans(a) {
  const out = []; let y = 1;
  for (const e of eraPlan(a)) { const n = e.seasons / SEASONS_PER_YEAR; out.push({id: e.id, label: ERAS.get(e.id).label, from: y, to: y + n - 1}); y += n; }
  return out;
}
const dateOf = c => (c.season != null ? `год ${c.year}, ${SEASON_LIST[c.season % SEASON_LIST.length].label.toLowerCase()}` : STAGE_ERAS[c.era] || c.era);

function head(a, name, what) {
  const S = ATLAS_SIZES[a.cfg.size], years = a.hist ? a.hist.year : 0;
  return [`${what} — «${name || `Мир ${a.cfg.seed}`}»`,
    `Сид ${a.cfg.seed} · ${S ? `${S.label.toLowerCase()} мир ${S.w}×${S.h}` : a.cfg.size} · ${years} ${plural(years, 'год', 'года', 'лет')} истории${a.cfg.epic ? ' · эпический мир' : ''}`,
    `Эпохи: ${eraSpans(a).map(e => `${e.label} — годы ${e.from}–${e.to}`).join('; ')}.`];
}

// ── the whole chronicle by its eras, at `detail`
export function worldChronicleText(a, {detail = 'normal', name = null} = {}) {
  const lines = a.chronicle, kept = lines.filter(c => keeps(detail, lineLevel(c)));
  const out = [...head(a, name, 'Летопись мира'),
    `Подробность: ${DETAILS.find(d => d.id === detail).label.toLowerCase()} — ${kept.length} строк из ${lines.length}.`, ''];
  const block = (title, list) => { if (!list.length) return; out.push(`=== ${title} ===`, ...list.map(c => `${dateOf(c)} — ${c.text}`), ''); };
  block('Сотворение мира', kept.filter(c => c.season == null));
  const spans = eraSpans(a), last = spans.at(-1);
  for (const e of spans) {
    const inEra = kept.filter(c => c.season != null && c.year >= e.from && c.year <= e.to);
    const cal = (a.calamities || []).find(c => c.era === e.id);
    block(`${e.label} · годы ${e.from}–${e.to}${cal?.boss ? ` · бедствие: ${cal.label}` : ''}`, inEra);
  }
  block(`После эпох · с ${last.to + 1} года`, kept.filter(c => c.season != null && c.year > last.to));
  return out.join('\n');
}

// ── the chronicle of the calamities: the dawn, then each calamity from omens to grave
export function calamityChronicleText(a, {name = null} = {}) {
  const out = [...head(a, name, 'Летопись катаклизмов'), ''];
  if (!a.artifact) { out.push('В этом мире не было бедствий: это не эпический мир.'); return out.join('\n'); }
  const L = a.chronicle.filter(c => c.topic === 'calamity');
  out.push(`=== Заря мира ===`, ...L.filter(c => c.calamity == null).map(c => `${dateOf(c)} — ${c.text}`), '');
  for (const [k, c] of a.calamities.entries()) {
    const era = ERAS.get(c.era).label;
    out.push(`=== Бедствие ${ROMAN[k] || k + 1} · ${era}: ${c.label} ===`);
    if (c.boss) out.push(...calamityFacts(a, c), '');
    out.push(...L.filter(x => x.calamity === c.id).map(x => `${dateOf(x)} — ${x.text}`), '');
  }
  const A = a.artifact;
  out.push(`=== Путь артефакта: ${A.name} ===`, ...A.trail.map(t => `год ${t.year} — ${t.text}, ${wherePhrase(a, t.i)}`), '');
  return out.join('\n');
}

// what is known of a calamity, in a few lines: the boss, the dates, who ended it, the alliance
function calamityFacts(a, c) {
  const B = c.boss, sp = SPECIES.get(B.species), out = [];
  const stats = B.special ? STATS.all().filter(s => ['S', 'E', 'A'].includes(s.id)).map(s => {
    const lim = sp?.special?.[s.id]?.[1];
    return `${s.label} ${B.special[s.id]}${lim != null ? ` (у своего рода не выше ${lim})` : ''}`;
  }).join(', ') : '';
  out.push(`Босс: ${B.title[0]} ${B.name} — ${sp?.label || B.species}${stats ? `; ${stats}` : ''}.`);
  out.push(`Знамения с ${c.omensAt} года, восход в ${c.riseAt}-м ${wherePhrase(a, c.i)}${c.fell ? `, пал${B.g === 'f' ? 'а' : ''} в ${c.fell.year}-м — ${BY[c.fell.by] || c.fell.by}` : ', жив' + (B.g === 'f' ? 'а' : '')}.`);
  const A = (a.alliances || []).find(x => x.calamity === c.id);
  if (A) out.push(`Союз (${A.since} год): ${A.members.map(id => realmLabel(a, id)).join(', ')}; походов ${A.tries}, войска прислали ${A.sent.length} из ${A.members.length}${A.broken ? '; союз распался' : ''}.`);
  const g = (a.graves || []).find(x => x.calamity === c.id);
  if (g?.epitaph) out.push(`Надпись на могиле: «${g.epitaph}»`);
  return out;
}

// the epitaph of a grave: who lay there, with what, how long it raged and who ended it (the campaign's clues read it)
const ENDED = {dragon: 'сразил дракон', beasts: 'разорвали собственные стаи', heroes: 'запечатали безымянные герои', cleared: 'сгинул вместе с логовом', alliance: 'сразили войска союза держав'};
export function epitaph(a, c) {
  const B = c.boss, A = a.artifact, f = B.g === 'f', him = f ? 'её' : 'его', end = ENDED[c.fell.by];
  return `Здесь лежит ${B.title[0]} ${B.name}. ${f ? 'Она' : 'Он'} восстал${f ? 'а' : ''} в ${c.riseAt} году и носил${f ? 'а' : ''} ${A.acc}, ` +
    `данн${A.g === 'f' ? 'ую' : A.g === 'n' ? 'ое' : 'ый'} миру на его заре. В ${c.fell.year} году ${c.fell.by === 'cleared' ? `${f ? 'она' : 'он'} ${end}` : `${him} ${end}`}. Куда ушла ${him} сила, не знает никто.`;
}

export {LEVELS};

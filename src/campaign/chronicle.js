// The chronicle of a campaign as reading matter (data/campaign.js CHRONICLE): its lines by theme, a run of
// repeating lines folded into one, and the whole of it as plain text — the header (who set out, for what), the
// lines with their dates, the fates of those who walked. The text goes into a file from the campaign's screen;
// a finished campaign kept in the world's archive (campaign/ending.js) is told the same way.
import {SEASONS} from '../data/seasons.js';
import {SPECIES} from '../data/species.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {CHRONICLE} from '../data/campaign.js';
import {rank, yearsOf} from './march.js';
import {plural} from '../core/util.js';

const SEASON_LIST = SEASONS.all();
const season = s => SEASON_LIST[s % SEASON_LIST.length].label.toLowerCase();
export const lineTopic = l => (CHRONICLE.kinds[l.kind] || ['road', 'info'])[0];
export const lineLevel = l => (CHRONICLE.kinds[l.kind] || ['road', 'info'])[1];
// the epilogue's lines are dated by the season: the caravan's days are over
export const dateOf = l => (l.kind === 'epilogue' ? `год ${l.year}, ${season(l.season)}` : `год ${l.year}, ${season(l.season)}, день ${l.day + 1}`);

// the lines to show: themes hidden, one member's lines only (by id or by name), runs folded:
// → [{line, n, last}] — n lines of the same foldable kind in a row, `last` the last of them
export function readLines(log, {hidden = new Set(), member = null} = {}) {
  const out = [];
  for (const l of log) {
    if (hidden.has(lineTopic(l))) continue;
    if (member && !(l.who?.includes(member.id) || l.text.includes(member.name))) continue;
    const prev = out.at(-1);
    if (prev && prev.line.kind === l.kind && CHRONICLE.fold.includes(l.kind)) { prev.n++; prev.last = l; continue; }
    out.push({line: l, n: 1, last: l});
  }
  return out;
}

// the whole campaign as text (K — a campaign, or a record of the world's archive: campaign/ending.js)
export function chronicleText(a, K) {
  const P = WORLD_PEOPLES.get(K.people);
  const rankOf = m => m.rank || (K.log ? rank(K, m) : m.role);
  const out = [];
  out.push(`ЛЕТОПИСЬ ПОХОДА ИЗ ${(K.capitalFrom || K.from || '').toUpperCase()}`, '');
  out.push(`Мир: ${a.cfg?.name || `сид ${a.cfg?.seed}`}. Народ: ${P?.label || K.people}.`);
  if (K.started) out.push(`Вышли: ${K.started.year}-й год, ${season(K.started.season)}.`);
  const crown = K.quest?.name || K.crown;
  if (crown) out.push(`Поручение: найти ${K.quest?.acc || crown}.${K.quest ? ` ${K.quest.story}` : ''}`);
  const result = {won: 'вернулись с короной', lost: 'погибли все, кто вышел из столицы', timeout: `за ${yearsOf(K)} ${plural(yearsOf(K), 'год', 'года', 'лет')} не вернулись`, out: 'в пути', back: 'несут корону домой'}[K.phase] || K.phase;
  out.push(`Итог: ${result}; в пути ${Math.round(K.day ?? K.days ?? 0)} дней (${((K.day ?? K.days ?? 0) / 120).toFixed(1)} г.).`, '');
  out.push('Отряд:');
  for (const m of K.members) {
    const core = m.core ?? ['knight', 'squire'].includes(m.role);
    const end = m.fate || (m.died ? `${m.died.why}, ${m.died.year}-й год` : m.left ? `${m.left.taken ? (m.gender === 'f' ? 'уведена в плен' : 'уведён в плен') : m.gender === 'f' ? 'ушла' : 'ушёл'}, ${m.left.year}-й год` : m.alive ? 'жив' + (m.gender === 'f' ? 'а' : '') : '');
    out.push(`  ${m.name} — ${rankOf(m)}${core ? '' : ' (пристал в пути)'}, ${SPECIES.get(m.race)?.label || m.race}${end ? `: ${end}` : ''}`);
  }
  out.push('', 'Летопись:');
  for (const l of K.log) out.push(`${dateOf(l)}. ${l.text}`);
  return out.join('\n') + '\n';
}

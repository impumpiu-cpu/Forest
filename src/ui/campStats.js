// The «Кампания» screen's stats panes in the dock (ui/campaignView.js CampaignView): the fights of the walk and the walk
// summed up (campaign/stats.js). Out of ui/campaignView.js, a mixin over the screen's base.
import {offerText, latinTitle} from './store.js';
import {SPECIES} from '../data/species.js';
import {esc} from '../core/util.js';
import {$} from './dom.js';
import {fightStats, fightReportText, groupText, FATES, HOWS, walkStats, walkReportText} from '../campaign/stats.js';

export const campStats = Base => class extends Base {
  // the fights of the walk (campaign/stats.js) in the dock: the totals, the years as bars, the named fights, the people
  renderFights() {
    const K = this.atlas?.campaign, box = $('campFights'); if (!box) return;
    if (!K?.fights?.length) { box.innerHTML = '<p class="muted">Боёв ещё не было.</p>'; return; }
    const S = fightStats(K), T = S.total, n = x => (x == null ? '—' : x), sp = id => (SPECIES.has(id) ? SPECIES.get(id).label : id);
    const maxF = Math.max(1, ...S.byYear.map(y => y.fights));
    const bars = S.byYear.map(y => `<div class="yb" title="год ${y.year}: боёв ${y.fights}, выиграно ${y.won}, врагов ${y.foes}, убито ${y.killed}, бежали ${y.fled}, наша/их сила ${y.ratio || '—'}, пали наши ${y.fell}, именных ${y.named}"><i style="height:${Math.round(y.fights / maxF * 56)}px"></i><i class="k" style="height:${Math.round(y.killed / Math.max(1, Math.max(...S.byYear.map(z => z.foes))) * 56)}px"></i><small>${y.year}</small></div>`).join('');
    const named = S.named.length ? `<table><tr><th>День</th><th class="t">Кто</th><th>Свита</th><th class="t">Босс</th><th>Убито</th><th>Бежали</th><th>Сила</th><th class="t">Исход</th></tr>${S.named.map(f =>
      `<tr><td>${f.day}</td><td class="t boss">${esc(f.boss.name)} (${esc(sp(f.boss.species))}${f.boss.mustDie ? ', четвёртый' : ''}) — ${HOWS[f.how] || f.how}</td><td>${n(f.guards)}<br><small>${esc(groupText(f.species))}</small></td><td class="t">${FATES[f.boss.fate]}${f.boss.hp != null && f.boss.fate !== 'dead' ? `, ${Math.round(f.boss.hp * 100)}%` : ''}</td><td>${n(f.killed)}</td><td>${n(f.fled)}</td><td>${f.ratio ? f.ratio.toFixed(1) : '—'}</td><td class="t ${f.won ? 'won' : 'lost'}">${f.won ? 'победа' : 'отбиты'}${f.fell.length ? `; пали ${esc(f.fell.join(', '))}` : ''}${f.hurt.length ? `; ранены ${esc(f.hurt.join(', '))}` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Именных боёв ещё не было: стражи могил, главари логов и четвёртый — впереди.</p>';
    box.innerHTML = `<div><h4>Поход</h4><p>Боёв ${T.fights}, выиграно ${T.won}, засад ${T.ambushes}, штурмов ${T.storms}, именных ${T.named}. Врагов пришло ${T.foes} — в среднем ${T.foesAvg} на бой против ${T.fighters} наших; убито ${T.killed}, бежали ${T.fled}, в плен ${T.taken}. Наша сила к их силе — в среднем ${T.ratio}. Пали наши ${T.fell}, ранены ${T.hurt} раз.</p>
      <h4>По родам врага</h4><table><tr><th class="t">Враг</th><th>Боёв</th><th>Выиграно</th><th>Их в бою</th><th>Убито</th><th>Бежали</th><th>Сила</th></tr>${S.byKind.map(k => `<tr><td class="t">${esc(k.label)}</td><td>${k.fights}</td><td>${k.won}</td><td>${k.foes}</td><td>${k.killed}</td><td>${k.fled}</td><td>${k.ratio || '—'}</td></tr>`).join('')}</table></div>
      <div><h4>По годам похода</h4><div class="ybars">${bars}</div><small class="muted">оранжевое — боёв в год, зелёное — убито врагов; наведите на год</small>
      <h4>По людям</h4><table><tr><th class="t">Кто</th><th>Боёв</th><th>Убил</th><th>Ранен</th></tr>${S.byMember.slice(0, 16).map(m => `<tr><td class="t">${esc(m.name)}${m.alive === false ? ' †' : ''}</td><td>${m.fights}</td><td>${m.kills}</td><td>${m.hurt}</td></tr>`).join('')}</table></div>
      <div class="wide"><h4>Именные бои</h4>${named}<div class="row actions"><button type="button" class="quiet mini" id="campFightsFile">Бои в файл</button></div></div>`;
    $('campFightsFile').addEventListener('click', () => offerText(latinTitle(`boi-${K.capitalName}-${K.started?.year ?? ''}`), fightReportText(this.atlas, K)));
  }

  // the walk summed up (campaign/stats.js walkStats) in the dock's «Итоги»: live while it goes, the whole of it at the end
  renderSummary() {
    const K = this.atlas?.campaign, box = $('campSummary'); if (!box) return;
    if (!K) { box.innerHTML = '<p class="muted">Итоги начнут собираться, когда караван выступит.</p>'; return; }
    box.innerHTML = walkStats(this.atlas, K).map(S => `<div><h4>${esc(S.title)}</h4><dl class="sum">${S.rows.map(([l, x]) => `<dt>${esc(l)}</dt><dd>${esc(String(x))}</dd>`).join('')}</dl></div>`).join('') +
      `<div class="wide"><div class="row actions"><button type="button" class="quiet mini" id="campSummaryFile">Итоги в файл</button></div></div>`;
    $('campSummaryFile').addEventListener('click', () => offerText(latinTitle(`itogi-${K.capitalName}-${K.started?.year ?? ''}`), walkReportText(this.atlas, K)));
  }
};

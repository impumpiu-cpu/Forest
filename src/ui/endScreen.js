// The end of a settlement: totals, awards, facts and the roll of everyone who lived there.
import {summarize} from '../settlement/summary.js';
import {esc} from '../core/util.js';
import {$} from './dom.js';

export function showEnd(w, onMenu) {
  const s = summarize(w);
  const totals = s.totals.map(([k, v]) => `<div class="go-stat"><b>${esc(String(v))}</b><span>${esc(k)}</span></div>`).join('');
  const awards = s.awards.map(a => `<li><span class="go-award">${esc(a.title)}</span><b>${esc(a.name)}${a.dead ? ' †' : ''}</b><span class="muted">${esc(a.text)}</span></li>`).join('');
  const facts = s.facts.map(f => `<li>${esc(f)}</li>`).join('');
  const roll = s.roll.map(r => `<tr class="${r.dead ? 'gone' : 'alive'}"><td>${esc(r.name)}${r.founder ? ' <span class="muted">основатель</span>' : ''}</td>
    <td>${r.arrivedDay}</td><td>${(Math.round(r.lived * 10) / 10).toLocaleString('ru-RU')}</td><td>${esc(r.fate)}</td><td class="muted">${esc(r.deeds.join(', ') || '—')}</td></tr>`).join('');
  $('gameOver').innerHTML = `
    <header class="go-head">
      <p class="go-kicker">${s.reason === 'raided' ? 'Лагерь разорён' : 'Поселение опустело'}</p>
      <h2 id="goTitle">«${esc(s.name)}» ${s.reason === 'raided' ? 'пало' : 'опустело'}</h2>
      <button type="button" id="goMenu" class="primary">В главное меню</button>
    </header>
    <div class="go-stats">${totals}</div>
    <div class="go-cols">
      <section class="card"><h2>Отличились</h2><ul class="go-awards">${awards || '<li class="muted">Никто не успел отличиться.</li>'}</ul></section>
      <section class="card"><h2>Летопись</h2><ul class="go-facts">${facts}</ul></section>
    </div>
    <section class="card"><h2>Все, кто здесь жил</h2>
      <div class="go-table"><table><thead><tr><th>Имя</th><th>Пришёл, день</th><th>Прожил, дней</th><th>Судьба</th><th>Чем запомнился</th></tr></thead><tbody>${roll}</tbody></table></div>
    </section>`;
  $('gameOver').hidden = false;
  $('goMenu').addEventListener('click', onMenu);
  $('gameOver').scrollIntoView?.({block: 'start'});
}

export function hideEnd() { $('gameOver').hidden = true; }

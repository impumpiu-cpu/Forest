// The inspector of the world map (docs/GAME.md «Наблюдатель»): what a click on the map selects — a party, a town (and
// its realm), a lair, a ruin or the cell — and its card: what it is, what it has, what it thinks and plans. The card is
// a view of the live objects (the selection keeps ids and is resolved anew each season), so it changes as the world does.
import {DEEDS, DEED_BAND_LABELS, deedLabel} from '../data/deeds.js';
import {LAIRS, LEADER} from '../data/lairs.js';
import {necroLabel, zoneOf} from '../atlas/necro.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {TOWN_BUILDINGS, TOWN_GOODS, EFFECTS, CATEGORIES, CHAINS} from '../data/townBuildings.js';
import {REALM_STATS, RUINS, OFFICES} from '../data/kingdom.js';
import {ARMY} from '../data/parties.js';
import {seasonLabel} from '../atlas/history.js';
import {alignLabel} from '../data/values.js';
import {townAt, townLabel} from '../atlas/peoples.js';
import {townFx, room, realmMetalWords} from '../atlas/towns.js';
import {buildDays} from '../atlas/build.js';
import {siteRadius} from '../atlas/sites.js';
import {partyAt} from '../atlas/parties.js';
import {captiveCount, power} from '../atlas/lairs.js';
import {realmOf, realmLabel, realmTowns, subOf} from '../atlas/realms.js';
import {stateOf, stateLabel, relation, ruinAt} from '../atlas/diplomacy.js';
import {leaderName} from '../atlas/leaders.js';
import {scaleOf} from '../atlas/tectonics.js';
import {esc, plural} from '../core/util.js';

const seasonWord = s => seasonLabel(s);
const KIND = {raid: 'набег', brood: 'выводок', army: 'войско', leader: 'отряд главаря', dragon: 'дракон', caravan: 'караван'};
const STATE = {go: 'в пути', arrive: 'на месте', stay: 'стоит', home: 'идёт домой', gone: 'разошёлся', camp: 'на стоянке'};
const r1 = v => Math.round(v * 10) / 10;

// ── what a click picks: the nearest party within a cell, else the town, the lair whose point is here, the ruin, the cell
export function pickObject(a, i) {
  const p = partyAt(a, i);
  if (p && p.kind !== 'caravan') return {kind: 'party', id: p.id, i};
  const t = townAt(a, i);
  if (t) return {kind: 'town', id: t.id, i};
  const x = i % a.w, y = (i / a.w) | 0;
  const l = (a.lairs || []).find(o => o.alive && Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1);
  if (l) return {kind: 'lair', id: l.id, i};
  const ru = ruinAt(a, i);
  if (ru) return {kind: 'ruin', i, year: ru.year, name: ru.name};
  return {kind: 'cell', i};
}

// the live object of a selection, or null when it is gone (a party home, a lair dead, a town burnt)
export function resolve(a, sel) {
  if (!sel) return null;
  if (sel.kind === 'party') return (a.parties || []).find(p => p.id === sel.id && p.state !== 'gone') || null;
  if (sel.kind === 'town') return (a.towns || []).find(t => t.id === sel.id && t.alive) || null;
  if (sel.kind === 'lair') return (a.lairs || []).find(l => l.id === sel.id && l.alive) || null;
  if (sel.kind === 'realm') return realmOf(a, sel.id) || null;
  return sel;
}

// where the selection is drawn: [x, y] in cells, or null
export function whereIs(a, sel, slide = 1) {
  const o = resolve(a, sel); if (!o) return null;
  if (sel.kind === 'party') return [o.px + (o.x - o.px) * slide, o.py + (o.y - o.py) * slide];
  if (sel.kind === 'town' || sel.kind === 'lair') return [o.x + 0.5, o.y + 0.5];
  if (sel.kind === 'realm') { const c = (a.towns || []).find(t => t.id === o.capital && t.alive); return c ? [c.x + 0.5, c.y + 0.5] : null; }
  return [sel.i % a.w + 0.5, ((sel.i / a.w) | 0) + 0.5];
}

// ── the card
const row = (k, v) => (v == null || v === '' ? '' : `<div class="ir"><span>${k}</span><b>${v}</b></div>`);
const sec = (title, body) => (body ? `<section class="isec"><h5>${esc(title)}</h5>${body}</section>` : '');
const when = t => `${t.year}, ${seasonWord(t.season ?? 0)}`;

// the trail of an actor's choices (atlas/actor.js thoughts), newest first
function thoughtsHtml(actor) {
  const T = actor.thoughts || (actor.why ? [actor.why] : []);
  if (!T.length) return '<p class="muted">пока ничего не предпринимало</p>';
  return `<ol class="thoughts">${[...T].reverse().map(t => `<li><small>${esc(when(t))}</small> <b>${esc(DEEDS.has(t.deed) ? DEEDS.get(t.deed).label : t.deed)}</b>${t.why ? ` — ${esc(t.why)}` : ''}${t.alt ? `<br><small class="muted">иначе: ${esc(deedLabel(t.alt))}${t.altWhy ? ` — ${esc(t.altWhy)}` : ''}</small>` : ''}</li>`).join('')}</ol>`;
}
// the deeds an actor may do, by lane
function deedsHtml(list) {
  if (!list?.length) return '';
  return `<p class="deeds">${list.map(id => { const d = DEEDS.get(id); return `<span class="deed lane-${d.band}" title="${esc(d.note)}">${esc(id)} <small>${esc(DEED_BAND_LABELS[d.band])}</small></span>`; }).join(' ')}</p>`;
}

function realmHtml(a, R) {
  if (!R) return '';
  const towns = realmTowns(a, R.id), pop = Math.round(towns.reduce((s, t) => s + t.pop, 0)), P = WORLD_PEOPLES.get(R.people), sp = SPECIES.get(P.race), sub = subOf(a, R.id);
  const cap = towns.find(t => t.id === R.capital);
  const rels = (a.realms || []).filter(o => o.id !== R.id && relation(a, R.id, o.id) && realmTowns(a, o.id).length).map(o => {
    const r = relation(a, R.id, o.id), st = stateOf(a, R.id, o.id);
    return `<li class="rel-${st}"><b>${esc(realmLabel(a, o.id))}</b> — ${stateLabel(st)} (${r.att.toFixed(1)})${r.war ? `, война с ${r.war.since} г.${r.war.battles ? `, битв ${r.war.battles}` : ''}` : ''}${r.routes ? `, торговых путей ${r.routes}` : ''}</li>`;
  }).join('');
  const armies = (a.parties || []).filter(p => p.kind === 'army' && p.owner === R.id && p.state !== 'gone').map(p => { const t = a.towns.find(x => x.id === p.target); return `${Math.round(p.men)} бойцов${t ? ` → ${townLabel(t, 1)} ${t.name}` : ''}, ${STATE[p.state] || p.state}`; }).join('; ');
  const Kd = R.kingdom;
  const kingdom = Kd ? row('показатели', REALM_STATS.all().map(x => `${x.label} ${Kd.stats[x.id].toFixed(1)}`).join(', ')) +
    row('разруха', RUINS.all().filter(x => Kd.ruin[x.id] > 0.05).map(x => `${x.label} ${Kd.ruin[x.id].toFixed(1)}`).join(', ') || 'нет') +
    row('двор', OFFICES.all().map(o => `${o.label}: ${Kd.court[o.id]?.name || '—'}`).join(', ')) : '';
  return sec(`Держава: ${realmLabel(a, R.id)}`,
    row('народ', `${esc(sub?.plural || P.label)}, ${esc(alignLabel(R.align || sp.align))}`) +
    row('столица', cap ? `${townLabel(cap)} ${esc(cap.name)}${R.seatSince ? ` (с ${R.seatSince} г.)` : ''}` : '—') +
    row('города', `${towns.length}, жителей ${pop}: ${esc(towns.map(t => t.name).join(', '))}`) +
    row('основана', R.founded != null ? `${R.founded} г.${R.from != null ? `, расколом от «${esc(realmOf(a, R.from)?.name || '…')}»` : ''}` : null) +
    row('металлы', cap ? (realmMetalWords(a, cap).join(', ') || 'только кость, дерево и камень') : null) +
    row('войска', armies || null) +
    row('в полоне увели', R.captives && Object.values(R.captives).some(v => v > 0) ? captiveCount(R) : null) +
    kingdom +
    (rels ? `<div class="ir"><span>отношения</span></div><ul class="rels">${rels}</ul>` : '') +
    `<div class="ir"><span>нравы</span></div>${deedsHtml(sp.deeds?.realm)}` +
    `<div class="ir"><span>о чём думал двор</span></div>${thoughtsHtml(R)}`);
}

// the building under way (atlas/build.js): its work done and the materials it still waits for
function buildingHtml(t) {
  const w = t.project && t.works?.[t.project];
  if (!w) return null;
  const b = TOWN_BUILDINGS.get(t.project), wait = Object.entries(w.mat).filter(([, v]) => v > 0.5).map(([g, v]) => `${TOWN_GOODS.get(g).label} ${Math.round(v)}`);
  return `${esc(b.name)}: работа ${Math.min(100, Math.round(100 * w.done / buildDays(b)))}%${wait.length ? `, ждёт: ${esc(wait.join(', '))}` : ''}`;
}

function townHtml(a, t) {
  const P = WORLD_PEOPLES.get(t.people), fx = townFx(t), cnt = {};
  for (const id of t.built) cnt[id] = (cnt[id] || 0) + 1;
  const byCat = {};
  for (const [id, n] of Object.entries(cnt)) { const b = TOWN_BUILDINGS.get(id); (byCat[b.cat] ||= []).push(b.name + (n > 1 ? ` ×${n}` : '')); }
  const built = Object.entries(byCat).map(([c, l]) => `<li><small>${esc(CATEGORIES[c] || c)}:</small> ${esc(l.join(', '))}</li>`).join('');
  const gives = Object.entries(EFFECTS).filter(([k]) => k !== 'housing' && fx[k] > 0).map(([k, l]) => `${l} +${Math.round(fx[k] * 100)}%`).join(', ');
  const folk = Object.entries(t.folk || {}).filter(([, v]) => v >= 0.03).map(([id, v]) => `${WORLD_PEOPLES.get(id).label} ${Math.round(v * 100)}%`).join(', ');
  const sup = t.supply, feed = sup ? (sup.got > 0.05 * t.pop ? `привозят еды на ${Math.round(sup.got)}` : sup.gave > 0.05 * t.pop ? `отправляют еды на ${Math.round(sup.gave)}` : 'кормятся своим') : null;
  const sieged = (a.parties || []).find(p => p.kind === 'army' && p.state === 'stay' && p.target === t.id);
  const head = sec(`${townLabel(t).replace(/^./, c => c.toUpperCase())} ${t.name}`,
    row('народ', `${esc(P.label)}${folk ? `, среди них ${esc(folk)}` : ''}`) +
    row('жители', `${Math.round(t.pop)}, дома на ${room(fx)}`) +
    row('основан', `${t.founded} г.${t.capital ? ', столица' : ''}`) +
    row('угодья', `в ${siteRadius(a, t)} клетках; ${feed || ''}`) +
    row('даёт', gives || 'ничего сверх жилья') +
    row('набег', t.raided != null ? `последний в ${t.raided} г.` : 'не знал набегов') +
    row('осада', sieged ? `${esc(sieged.label)}: ${sieged.stay} дн., запас еды ${sieged.siege?.stock ?? '?'} дн., сожжено угодий ${sieged.burnt || 0}${sieged.siege?.starved ? `, умерло от голода ${Math.round(sieged.siege.starved)}` : ''}` : null) +
    row('строится', buildingHtml(t)) +
    (built ? `<div class="ir"><span>постройки</span></div><ul class="built">${built}</ul>` : row('постройки', 'нет')) +
    economyHtml(t));
  return head + realmHtml(a, t.realm ? realmOf(a, t.realm) : null);
}

// the town's household (atlas/economy.js): for each good the rate a day (+ made, − used up) and the stock, by branch
const num = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).toString().replace('.', ',');
function economyHtml(t) {
  const E = t.econ;
  if (!E) return row('хозяйство', 'ещё не считалось');
  const rows = TOWN_GOODS.all().filter(g => Math.abs(E.rate[g.id] || 0) > 0.001 || (E.stock[g.id] || 0) >= 0.5)
    .sort((x, y) => Object.keys(CHAINS).indexOf(x.chain) - Object.keys(CHAINS).indexOf(y.chain))
    .map(g => {
      const r = E.rate[g.id] || 0, s = E.stock[g.id] || 0, low = E.short.includes(g.id);
      return `<li class="${low ? 'short' : ''}"><span>${esc(g.label)}</span><b class="${r > 0 ? 'up' : r < 0 ? 'down' : ''}">${r > 0 ? '+' : r < 0 ? '−' : ''}${num(Math.abs(r))}/день</b><i>${num(s)}${g.unit === 'рацион' ? ' рац.' : g.unit === 'зол. ценности' ? ' зол.' : ''}</i></li>`;
    }).join('');
  return `<div class="ir"><span>хозяйство</span><b>загрузка ${Math.round(E.load * 100)}%, ${E.scale < 1 ? `рук ${Math.round(E.scale * 100)}%` : `размах ×${num(E.scale)}`}${E.short.length ? `; не хватает: ${esc(E.short.map(id => TOWN_GOODS.get(id).label).join(', '))}` : ''}</b></div>
    <ul class="econ"><li class="head"><span>благо</span><b>в день</b><i>на складе</i></li>${rows}</ul>`;
}

function lairHtml(a, l) {
  const L = LAIRS.get(l.kind), sp = SPECIES.get(L.species), lord = l.lord != null ? a.lairs.find(o => o.id === l.lord) : null;
  const vassals = (a.lairs || []).filter(o => o.alive && o.lord === l.id).map(o => `«${o.name}»`).join(', ');
  const ld = l.leader, special = ld?.special ? LEADER.stats.map(k => `${k} ${ld.special[k]}`).join(' ') : '';
  const leader = ld ? sec(`${ld.title[0]} ${ld.name}`,
    row('кто', `${esc(sp.label)} сильнее своих: ${esc(special)}${ld.add ? ` (+${Object.values(ld.add).join('/')})` : ''}`) +
    row('правит', `с ${ld.born} г., до ~${ld.dies} г.; дел на счету ${ld.deeds}`) +
    row('отряд', (() => { const p = (a.parties || []).find(x => x.kind === 'leader' && x.owner === l.id && x.state !== 'gone'); return p ? `${esc(deedLabel(p.plan, p.plan))}, ${STATE[p.state]}, ${p.days} дн.` : 'дома'; })())) : '';
  const parties = (a.parties || []).filter(p => p.owner === l.id && p.kind !== 'leader' && p.state !== 'gone').map(p => `${KIND[p.kind] || p.kind} (${esc(deedLabel(p.plan, p.plan || ''))}), ${STATE[p.state]}, ${p.days} дн.`).join('; ');
  return sec(`${L.label.replace(/^./, c => c.toUpperCase())} «${l.name}»`,
    row('хозяева', `${esc(sp.plural)}${L.tribe ? ' (племя)' : L.undead ? ' (мёртвые)' : L.fiend ? ' (демоны)' : L.dragon ? '' : ' (чудовища)'}; мощь вида ${r1(power(L.species))}`) +
    row('сила', `${Math.round(l.strength * 100)}%${l.boss != null ? ', логово босса бедствия' : ''}`) +
    (L.domain ? row('некромант', `${esc(necroLabel(l.race))}; владения — ${Math.round(zoneOf(a, l))} клеток вокруг, данников ${(a.lairs || []).filter(o => o.alive && o.lord === l.id).length}`) : '') +
    row('известно', l.hidden ? 'скрыто: ни одна держава о нём не знает, выжечь его нельзя' : l.found ? `найдено в ${l.found.year} г. (${esc(l.found.by)})` : 'с давних пор') +
    row('возраст', `с ${l.born <= 0 ? 'незапамятных времён' : `${l.born} г.`}${l.ancient ? ', древнее' : ''}`) +
    row('владения', `${Math.round(L.radius * scaleOf(a))} клеток`) +
    row('господин', lord?.alive ? `«${esc(lord.name)}»${lord.leader ? ` (${esc(leaderName(lord))})` : ''}` : null) +
    row('данники', vassals || null) +
    row('в полоне', captiveCount(l) || null) +
    row('отряды', parties || null) +
    (L.dragon ? row('сон', l.sleep > 0 ? `ещё ${l.sleep} ${plural(l.sleep, 'лето', 'лета', 'лет')}` : 'проснулся') : '') +
    `<div class="ir"><span>нравы</span></div>${deedsHtml(sp.deeds?.lair)}` +
    `<div class="ir"><span>о чём думало логово</span></div>${thoughtsHtml(l)}`) + leader;
}

function partyHtml(a, p) {
  const lair = p.owner != null && p.kind !== 'army' ? a.lairs.find(l => l.id === p.owner) : null, R = p.kind === 'army' ? realmOf(a, p.owner) : null;
  const tgt = p.target != null ? a.towns.find(t => t.id === p.target) : null, from = p.from != null ? a.towns.find(t => t.id === p.from) : null;
  const left = p.path && p.state !== 'stay' ? Math.max(0, p.path.length - p.k) : 0;
  const S = p.siege, siege = S ? `запас еды в городе ${S.stock} дн.${S.starved ? `, умерло от голода ${Math.round(S.starved)}` : ''}, сожжено угодий ${p.burnt || 0}; штурм — когда войско сильнее ${ARMY.assaultAt * 100}% города, через ${ARMY.longest} дн. осады или без припасов` : null;
  return sec(`${(KIND[p.kind] || p.kind).replace(/^./, c => c.toUpperCase())}: ${p.label}`,
    row('дело', p.plan && DEEDS.has(p.plan) ? `${esc(DEEDS.get(p.plan).label)}${p.why ? ` — ${esc(p.why)}` : ''}` : p.kind === 'army' ? `война${p.war ? ` (${esc(p.war)})` : ''}` : null) +
    row('чей', lair ? `${LAIRS.get(lair.kind).label} «${esc(lair.name)}»` : R ? esc(realmLabel(a, R.id)) : null) +
    row('откуда', from ? `${townLabel(from)} ${esc(from.name)}` : null) +
    row('куда', tgt ? `${townLabel(tgt, 1)} ${esc(tgt.name)}` : p.kind === 'brood' ? 'к месту нового логова' : null) +
    row('состояние', `${STATE[p.state] || p.state}, ${p.days} дн. в пути${left ? `, ещё ~${left} клеток` : ''}${p.state === 'stay' ? `, стоит ${p.stay} дн.` : ''}`) +
    row('сила', p.men ? `${Math.round(p.men)} бойцов, сила ${r1(p.might)}` : p.might ? r1(p.might) : null) +
    row('припасы', p.supplies != null ? `${Math.max(0, Math.round(p.supplies))} дн.` : null) +
    row('осада', siege) +
    row('добыча', p.loot ? 'несут добычу домой' : null));
}

export function inspectHtml(a, sel, cellText = '') {
  const o = resolve(a, sel);
  if (!sel) return '<p class="muted">Щёлкните по городу, логову, отряду или войску — здесь будет его карточка: что это, что у него есть, о чём оно думает.</p>';
  if (!o) return `<p class="muted">${sel.kind === 'party' ? 'Отряд разошёлся' : sel.kind === 'town' ? 'Города больше нет' : sel.kind === 'lair' ? 'Логово опустело' : 'Здесь больше ничего нет'}.</p>`;
  if (sel.kind === 'party') return partyHtml(a, o);
  if (sel.kind === 'town') return townHtml(a, o);
  if (sel.kind === 'lair') return lairHtml(a, o);
  if (sel.kind === 'realm') return realmHtml(a, o);
  if (sel.kind === 'ruin') return sec(`Пепелище ${sel.name}`, row('сожжено', `${sel.year} г.`) + row('клетка', esc(cellText)));
  return sec('Клетка', `<p>${esc(cellText)}</p>`);
}

// the realms among themselves, as a matrix (the dock's «Державы»): the standing of each pair in colour, the wars below
export function relationsHtml(a) {
  const live = (a.realms || []).filter(r => realmTowns(a, r.id).length);
  if (live.length < 2) return '<p class="muted">Державы ещё не встретились.</p>';
  const short = r => { const l = realmLabel(a, r.id); return l.length > 26 ? l.slice(0, 24) + '…' : l; };
  const head = `<tr><th></th>${live.map(r => `<th title="${esc(realmLabel(a, r.id))}">${esc(short(r))}</th>`).join('')}</tr>`;
  const rows = live.map(p => `<tr><th class="rw" title="${esc(realmLabel(a, p.id))}">${esc(short(p))}</th>${live.map(q => {
    if (p.id === q.id) return '<td>—</td>';
    const r = relation(a, p.id, q.id); if (!r) return '<td title="не встречались"></td>';
    const st = stateOf(a, p.id, q.id);
    return `<td class="rel-${st}" title="${esc(realmLabel(a, p.id))} и ${esc(realmLabel(a, q.id))}: ${stateLabel(st)} (${r.att.toFixed(1)})${r.war ? `, война с ${r.war.since} г.` : ''}${r.routes ? `, торговых путей ${r.routes}` : ''}">${r.war ? '⚔' : r.att.toFixed(1)}</td>`;
  }).join('')}</tr>`).join('');
  const wars = Object.entries(a.rel || {}).filter(([, r]) => r.war).map(([k, r]) => { const [p, q] = k.split(':'); return `<li>${esc(realmLabel(a, p))} и ${esc(realmLabel(a, q))}: с ${r.war.since} г.${r.war.battles ? `, битв ${r.war.battles}` : ''}${r.war.razed ? `, сожжено городов ${r.war.razed}` : ''}</li>`; }).join('');
  return `<table class="relmat">${head}${rows}</table>${wars ? `<ul class="relwars">${wars}</ul>` : ''}`;
}


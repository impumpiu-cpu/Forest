// The inspector of the world map (docs/GAME.md «Наблюдатель»): what a click on the map selects — a party, a town (and
// its realm), a lair, a ruin or the cell — and its card: what it is, what it has, what it thinks and plans. The card is
// a view of the live objects (the selection keeps ids and is resolved anew each season), so it changes as the world does.
import {moodOf} from '../view/world.js';
import {DEEDS, DEED_BAND_LABELS, deedLabel} from '../data/deeds.js';
import {LAIRS, LEADER} from '../data/lairs.js';
import {necroLabel, zoneOf} from '../view/world.js';
import {WORLD_PEOPLES, TOWN_LIFE} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {TOWN_GOODS, TOWN_BUILDINGS, EFFECTS, CATEGORIES, goodPrice} from '../data/townBuildings.js';
import {REALM_STATS, RUINS, OFFICES} from '../data/kingdom.js';
import {ARMY} from '../data/parties.js';
import {seasonLabel} from '../view/world.js';
import {alignLabel} from '../data/values.js';
import {townAt} from '../view/world.js';
import {townLabel} from '../view/world.js';
import {townFx, room, realmMetalWords, slotsUsed, slotsOf} from '../view/world.js';
import {siteRadius} from '../view/world.js';
import {partyAt} from '../view/world.js';
import {captiveCount, power} from '../view/world.js';
import {realmOf, realmLabel, realmTowns} from '../view/world.js';
import {stateOf, stateLabel, relation, ruinAt} from '../view/world.js';
import {leaderName} from '../view/world.js';
import {personOf} from '../view/world.js';
import {profileOf, rulerOf, rulerTitle} from '../view/world.js';
import {headsOf, bandSum} from '../view/world.js';
import {townKin} from '../view/world.js';
import {scaleOf} from '../view/world.js';
import {esc, plural} from '../core/util.js';
import {VECTORS, VECTOR_IDS, leadOf as lead} from '../data/mind.js';
import {roseOf, townLean} from '../view/world.js';
import {projectOf, crewDays} from '../view/world.js';
import {needsOf} from '../view/world.js';
import {ANSWERS} from '../data/townNeeds.js';
import {LOSS_CAUSES, PARTY_KINDS, PARTY_STATES, MIND_FLAGS, RULES} from '../data/labels.js';

// the words of the parties' kinds and states (data/labels.js)
const kindWord = k => PARTY_KINDS[k]?.label || k, stateWord = s => PARTY_STATES[s] || s;
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
// a town's needs for its card: each lit need — its strength and cause, the plans under way, the answers it could not give and
// why; the goal another town's council set it; the budget for buying (atlas/townNeeds.js)
const CAUSE = {money: 'нечем платить', route: 'не довезти', goods: 'ни у кого нет'};
function needsLine(a, t) {
  const out = [];
  for (const n of needsOf(t)) {
    if (!n.on && !n.plans.length) continue;
    const plans = n.plans.map(p => p.label).join(', ');
    const no = (n.last?.opts || []).filter(o => o.why && o.answer !== n.last.pick).map(o => `${ANSWERS.get(o.answer).label} — ${o.why}`).join('; ');
    out.push(`${n.label}: ${Math.round(n.s * 100)}%${n.cause ? ` (${CAUSE[n.cause] || n.cause})` : ''}${n.lane === 'yellow' ? ', срочно' : ''}${plans ? `; делается: ${plans}` : ''}${no ? `; не выбрано: ${no}` : ''}`);
  }
  if (t.goal && TOWN_BUILDINGS.has(t.goal.b)) { const f = a.towns.find(o => o.id === t.goal.from); out.push(`цель стройки: ${TOWN_BUILDINGS.get(t.goal.b).name}${f && f !== t ? ` (просьба ${f.name})` : ''}`); }
  const B = Object.entries(t.budget || {}).filter(([, v]) => v.gold > 0.5);
  if (B.length) out.push(`казна державы на привоз: ${B.map(([g, v]) => `${TOWN_GOODS.get(g).label} ${Math.round(v.gold)} зол.`).join(', ')}`);
  return out.length ? esc(out.join(' · ')) : null;
}
const sec = (title, body) => (body ? `<section class="isec"><h5>${esc(title)}</h5>${body}</section>` : '');
const when = t => `${t.year}, ${seasonLabel(t.season ?? 0)}`;

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

// the realm's council (atlas/mind.js): its people's rose, its course and wind along the three vectors, the season's needs,
// how it shared its grants and how its towns follow
const vnum = v => v.toFixed(2).replace('.', ',');
const vecLine = v => VECTOR_IDS.map(k => `${VECTORS[k]} ${vnum(v?.[k] || 0)}`).join(', ');
function mindHtml(a, R) {
  const M = R.mind;
  if (!M) return '';
  const flags = Object.entries(M.flags || {}).filter(([, v]) => v >= 0.05).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${MIND_FLAGS[k] || k} ${vnum(v)}`).join(', ');
  const roles = {};
  for (const t of realmTowns(a, R.id)) if (t.role) (roles[t.role] ||= []).push(t.name);
  const spent = VECTOR_IDS.filter(k => (M.spent?.[k] || 0) >= 1).map(k => `${VECTORS[k]} ${Math.round(M.spent[k])}`).join(', ');
  return `<div class="ir"><span>совет</span></div>` +
    row('роза народа', vecLine(roseOf(R.people))) +
    row('курс', vecLine(M.course)) +
    row('ветер', `${vecLine(M.wind)}; ведёт ${VECTORS[M.lead]}`) +
    row('нужды сезона', flags || 'спокойно') +
    row('роли', VECTOR_IDS.filter(k => roles[k]).map(k => `${VECTORS[k]}: ${esc(roles[k].join(', '))}`).join('; ') || null) +
    row('гранты на стройку', spent ? `${spent} зол.` : 'не давал') +
    row('послушание', `${Math.round((M.obey ?? 1) * 100)}%`);
}

// the town's role in its realm (atlas/mind.js): the flag its council set, and how it leans
function roleLine(t) {
  const what = t.role ? `${VECTORS[t.role]}` : t.capital ? 'столица: по ветру державы' : 'не назначена';
  const lean = townLean(t), against = t.role && lead(lean) !== t.role;
  return `${what}${against ? ` (а строит больше ${VECTORS[lead(lean)]})` : ''}`;
}

// the races of a town, the larger first («орки 61%, гоблины 24%, гноллы 9%»), the bands of age, the year's losses by cause
export const kinLine = (a, t) => Object.entries(townKin(a, t)).filter(([, v]) => v >= 0.005).sort((p, q) => q[1] - p[1]).map(([id, v]) => `${SPECIES.has(id) ? SPECIES.get(id).plural : id} ${Math.round(v * 100)}%`).join(', ');
const agesLine = (a, t) => { const H = headsOf(a, t), n = Math.max(1, t.pop); return `детей ${Math.round(bandSum(H, 0) / n * 100)}%, взрослых ${Math.round(bandSum(H, 1) / n * 100)}%, стариков ${Math.round(bandSum(H, 2) / n * 100)}%`; };
const lossLine = t => { const V = t.vital; if (!V) return ''; const parts = [V.born >= 0.5 ? `родилось ${Math.round(V.born)}` : '', V.came >= 0.5 ? `пришло с земли ${Math.round(V.came)}` : ''].concat(Object.entries(V).filter(([k, v]) => k !== 'born' && k !== 'came' && v >= 0.5).map(([k, v]) => `${LOSS_CAUSES[k] || k} ${Math.round(v)}`)); return parts.filter(Boolean).join(', '); };

function realmHtml(a, R) {
  if (!R) return '';
  const towns = realmTowns(a, R.id), pop = Math.round(towns.reduce((s, t) => s + t.pop, 0)), P = WORLD_PEOPLES.get(R.people), sp = SPECIES.get(P.race);
  const cap = towns.find(t => t.id === R.capital);
  const rels = (a.realms || []).filter(o => o.id !== R.id && relation(a, R.id, o.id) && realmTowns(a, o.id).length).map(o => {
    const r = relation(a, R.id, o.id), st = stateOf(a, R.id, o.id);
    return `<li class="rel-${st}"><b>${esc(realmLabel(a, o.id))}</b> — ${stateLabel(st)} (${r.att.toFixed(1)})${r.war ? `, война с ${r.war.since} г.${r.war.battles ? `, битв ${r.war.battles}` : ''}` : ''}${r.routes ? `, торговых путей ${r.routes}` : ''}</li>`;
  }).join('');
  const armies = (a.parties || []).filter(p => p.kind === 'army' && p.owner === R.id && p.state !== 'gone').map(p => { const t = a.towns.find(x => x.id === p.target); return `${Math.round(p.men)} бойцов${t ? ` → ${townLabel(t, 1)} ${t.name}` : ''}, ${stateWord(p.state)}`; }).join('; ');
  const Kd = R.kingdom;
  // the year's ledger of its treasury (atlas/treasury.js fiscOf: the last year closed)
  const L = R.fisc?.last, fisc = L ? row('книга казны', [`подати ${Math.round(L.tax)}`, L.lost >= 1 && `коррупция унесла ${Math.round(L.lost)}`, L.duty >= 1 && `пошлины ${Math.round(L.duty)}`,
    L.loot >= 1 && `добыча ${Math.round(L.loot)}`, L.tribute >= 1 && `дань получена ${Math.round(L.tribute)}`, L.tribute <= -1 && `дань уплачена ${Math.round(-L.tribute)}`,
    `двору ${Math.round(L.court)}${L.courtUnpaid >= 1 ? ` (недоплачено ${Math.round(L.courtUnpaid)})` : ''}`, L.wages >= 1 && `войскам ${Math.round(L.wages)}`, L.wagesUnpaid >= 1 && `войскам недоплачено ${Math.round(L.wagesUnpaid)}`,
    L.kind >= 1 && `натурой ${Math.round(L.kind)}`, L.food >= 0.5 && `войскам заготовок ${Math.round(L.food)}`, L.foodShort >= 0.5 && `не хватило заготовок ${Math.round(L.foodShort)}`, L.kit >= 1 && `снаряжение войскам ${Math.round(L.kit)}`].filter(Boolean).join(', ')) : '';
  const store = Object.entries(R.stock || {}).filter(([, n]) => n >= 0.5).map(([g, n]) => `${TOWN_GOODS.has(g) ? TOWN_GOODS.get(g).label : g} ${Math.round(n)}`).join(', ');
  const kingdom = fisc + (R.gold != null ? row('казна державы', `${Math.round(R.gold)} зол.${store ? `, на складе: ${store}` : ''}${R.keep ? `; за сезон гарнизонам ${Math.round(R.keep.garrison)} (${Math.round(R.keep.men)} человек)` : ''}${R.spent?.build != null ? `; за год на стройку ${Math.round(R.spent.build)}` : ''}`) : '') + (Kd ? row('показатели', REALM_STATS.all().map(x => `${x.label} ${Kd.stats[x.id].toFixed(1)}`).join(', ')) +
    row('разруха', RUINS.all().filter(x => Kd.ruin[x.id] > 0.05).map(x => `${x.label} ${Kd.ruin[x.id].toFixed(1)}`).join(', ') || 'нет') +
    row('двор', OFFICES.all().map(o => `${o.label}: ${personOf(a, Kd.court[o.id]?.person)?.name || '—'}`).join(', ')) : '');
  // the polity (atlas/polities.js): its uklad, its ruler as a person, the races of its people, the year's losses over its towns
  const prof = profileOf(R), ruler = rulerOf(a, R), year = a.hist?.year ?? 0;
  const throne = ruler ? `${esc(rulerTitle(R, ruler))} ${esc(ruler.name)}, ${year - ruler.born} лет${ruler.at?.kind === 'party' ? ', в походе' : ''}${Kd?.court?.ruler ? `, на троне с ${Kd.court.ruler.since} г.` : ''}`
    : R.contest != null ? 'орда без вождя: за место у костра дерутся' : (R.mourn ?? -1) > year ? `трон пуст, правит совет (до ${R.mourn} г.)` : 'трон пуст, правит совет';
  const heads = {}; for (const t of towns) for (const [race, b] of Object.entries(headsOf(a, t))) heads[race] = (heads[race] || 0) + b[0] + b[1] + b[2];
  const races = Object.entries(heads).filter(([, n]) => n >= 0.5).sort((p, q) => q[1] - p[1]).map(([race, n]) => `${SPECIES.has(race) ? SPECIES.get(race).plural : race} ${Math.round(n)}`).join(', ');
  const vital = {}; for (const t of towns) for (const [k, v] of Object.entries(t.vital || {})) vital[k] = (vital[k] || 0) + v;
  const losses = lossLine({vital});
  return sec(`Держава: ${realmLabel(a, R.id)}`,
    row('уклад', `${esc(prof.label)}, ${esc(RULES[prof.rule] || prof.rule)}`) +
    row('правитель', throne) +
    row('народ', `${esc(P.label)}, ${esc(alignLabel(R.align || sp.align))}`) +
    row('столица', cap ? `${townLabel(cap)} ${esc(cap.name)}${R.seatSince ? ` (с ${R.seatSince} г.)` : ''}` : '—') +
    row('города', `${towns.length}, жителей ${pop}: ${esc(towns.map(t => t.name).join(', '))}`) +
    row('по расам', races || null) +
    row('за год', losses || null) +
    row('основана', R.founded != null ? `${R.founded} г.${R.from != null ? `, расколом от «${esc(realmOf(a, R.from)?.name || '…')}»` : ''}` : null) +
    row('металлы', cap ? (realmMetalWords(a, cap).join(', ') || 'только кость, дерево и камень') : null) +
    row('войска', armies || null) +
    row('в полоне увели', R.captives && Object.values(R.captives).some(v => v > 0) ? captiveCount(R) : null) +
    kingdom +
    mindHtml(a, R) +
    (rels ? `<div class="ir"><span>отношения</span></div><ul class="rels">${rels}</ul>` : '') +
    `<div class="ir"><span>нравы</span></div>${deedsHtml(sp.deeds?.realm)}` +
    `<div class="ir"><span>о чём думал двор</span></div>${thoughtsHtml(R)}`);
}

function townHtml(a, t) {
  const P = WORLD_PEOPLES.get(t.people), fx = townFx(t), cnt = {};
  for (const id of t.built) cnt[id] = (cnt[id] || 0) + 1;
  const byCat = {};
  for (const [id, n] of Object.entries(cnt)) { const b = TOWN_BUILDINGS.get(id); (byCat[b.cat] ||= []).push(b.name + (n > 1 ? ` ×${n}` : '')); }
  const built = Object.entries(byCat).map(([c, l]) => `<li><small>${esc(CATEGORIES[c] || c)}:</small> ${esc(l.join(', '))}</li>`).join('');
  const gives = Object.entries(EFFECTS).filter(([k]) => k !== 'housing' && fx[k] > 0).map(([k, l]) => `${l} +${Math.round(fx[k] * 100)}%`).join(', ');
  const folk = kinLine(a, t), ages = agesLine(a, t), lost = lossLine(t);
  const sup = t.supply, feed = sup ? (sup.got > 0.05 * t.pop ? `привозят еды на ${Math.round(sup.got)}` : sup.gave > 0.05 * t.pop ? `отправляют еды на ${Math.round(sup.gave)}` : 'кормятся своим') : null;
  const sieged = (a.parties || []).find(p => p.kind === 'army' && p.state === 'stay' && p.target === t.id);
  const head = sec(`${townLabel(t).replace(/^./, c => c.toUpperCase())} ${t.name}`,
    row('народ', `${esc(P.label)}: ${esc(folk)}${ages ? `; ${esc(ages)}` : ''}`) +
    (lost ? row('за год', esc(lost)) : '') +
    // the town's economy by its buildings' flows (atlas/economy.js: worked out each season, not saved)
    (t.econ ? row('хозяйство', `руки ${Math.round(Math.min(t.econ.jobs, t.econ.hands))} из ${Math.round(t.econ.hands)}${t.slaves ? ` (рабов ${Math.round(t.slaves)})` : ''}; постройки кормят ${Math.round(t.econ.feeds)} жителей${t.econ.pools ? `; топлива ${Math.round((t.econ.pools.fuel ?? 1) * 100)}%` : ''}`
      + (Object.keys(t.econ.short).length ? `; не хватает: ${esc(Object.entries(t.econ.short).sort((p, q) => q[1] - p[1]).slice(0, 4).map(([g, v]) => `${TOWN_GOODS.get(g).label} ${Math.round(v * 100)}%`).join(', '))}` : '')) : '') +
    // its money (atlas/treasury.js): the treasury, the store, the season's buying and selling, the dearest and the cheapest goods
    (t.gold != null ? row('казна', `${Math.round(t.gold)} зол.${t.peopleGold != null ? `; у жителей ${Math.round(t.peopleGold)}, у мастеров ${Math.round(t.makersGold)}` : ''}${t.needs ? `; нужды закрыты ${Math.round(t.needs.basic * 100)}%, достаток ${Math.round(t.needs.comfort * 100)}%` : ''}${t.unpaid ? `; содержание не оплачено на ${Math.round(t.unpaid * 100)}%` : ''}${t.trade ? `; за сезон: жители купили ${Math.round((t.trade.people || 0) + (t.trade.imported || 0))}, зарплаты ${Math.round(t.trade.wages || 0)}, налоги ${Math.round(t.trade.tax || 0)}, постройки дали ${Math.round(t.trade.works || 0)}, купцам ${Math.round(t.trade.merchants || 0)}, мастерские купили у городов ${Math.round(t.trade.bought || 0)}, город продал ${Math.round(t.trade.sold || 0)}, содержание ${Math.round(t.trade.upkeep || 0)}${t.trade.aid ? ` (держава доплатила ${Math.round(t.trade.aid)})` : ''}${t.trade.wasted ? `; пропало излишков на ${Math.round(t.trade.wasted)}` : ''}` : ''}${t.garrison ? `; гарнизон державы ${Math.round(t.garrison)}` : ''}${t.grant ? `; на стройку от державы ${Math.round(t.grant)}` : ''}`) : '') +
    (t.stock && Object.keys(t.stock).length ? row('склад', esc(Object.entries(t.stock).sort((p, q) => q[1] * goodPrice(q[0]) - p[1] * goodPrice(p[0])).slice(0, 6).map(([g, v]) => `${TOWN_GOODS.get(g).label} ${Math.round(v)}`).join(', '))) : '') +
    (t.market && Object.keys(t.market).length ? row('цены', esc(Object.entries(t.market).sort((p, q) => q[1] - p[1]).filter((x, k, l) => k < 3 || k >= l.length - 3).map(([g, k]) => `${TOWN_GOODS.get(g).label} ×${k.toFixed(2)}`).join(', '))) : '') +
    // its tools, the recipes that run (atlas/economy.js; docs/WORLD.md «Цепочки»), its slots (TOWN_SLOTS)
    (t.econ?.tools != null && t.econ.tools < 0.995 ? row('инструмент', `работы на ${Math.round(t.econ.tools * 100)}% силы: инструмента не хватает`) : '') +
    (t.econ?.recipes?.some(x => x.eff > 0.005) ? row('рецепты', esc(t.econ.recipes.filter(x => x.eff > 0.005).map(x => `${TOWN_BUILDINGS.get(x.of).name}: ${x.name} ${Math.round(x.share * 100)}%`).join(', '))) : '') +
    row('слоты', (u => `${u.town} из ${slotsOf(t).town}, улучшения ${u.upgrades} из ${slotsOf(t).upgrades}`)(slotsUsed(t))) +
    row('жители', `${Math.round(t.pop)}, дома на ${room(fx)}`) +
    row('основан', `${t.founded} г.${t.capital ? ', столица' : ''}`) +
    row('угодья', `в ${siteRadius(a, t)} клетках; ${feed || ''}`) +
    row('даёт', gives || 'ничего сверх жилья') +
    row('набег', t.raided != null ? `последний в ${t.raided} г.` : 'не знал набегов') +
    row('осада', sieged ? `${esc(sieged.label)}: ${sieged.stay} дн., запас еды ${sieged.siege?.stock ?? '?'} дн., сожжено угодий ${sieged.burnt || 0}${sieged.siege?.starved ? `, умерло от голода ${Math.round(sieged.siege.starved)}` : ''}` : null) +
    row('роль', t.realm != null ? roleLine(t) : null) +
    // the council's needs and its answers (atlas/townNeeds.js): what is lit, what is under way, what it could not do and why
    row('довольство', `${Math.round(moodOf(t))} из 100`) +
    (t.gated ? row('рост', `слабее: ${esc(TOWN_LIFE.gates.find(G => G.id === t.gated)?.label || t.gated)}`) : '') +
    row('нужды', needsLine(a, t)) +
    row('строится', (P => (P ? `${esc(P.b.name)}: ${Math.min(99, Math.round(100 * P.done / P.days))}%, ещё ~${Math.max(1, Math.ceil((P.days - P.done) / Math.max(1e-9, crewDays(t))))} сез.` : null))(projectOf(t))) +
    (built ? `<div class="ir"><span>постройки</span></div><ul class="built">${built}</ul>` : row('постройки', 'нет')));
  return head + realmHtml(a, t.realm ? realmOf(a, t.realm) : null);
}

function lairHtml(a, l) {
  const L = LAIRS.get(l.kind), sp = SPECIES.get(L.species), lord = l.lord != null ? a.lairs.find(o => o.id === l.lord) : null;
  const vassals = (a.lairs || []).filter(o => o.alive && o.lord === l.id).map(o => `«${o.name}»`).join(', ');
  const ld = l.leader, special = ld?.special ? LEADER.stats.map(k => `${k} ${ld.special[k]}`).join(' ') : '';
  const leader = ld ? sec(`${ld.title[0]} ${ld.name}`,
    row('кто', `${esc(sp.label)} сильнее своих: ${esc(special)}${ld.add ? ` (+${Object.values(ld.add).join('/')})` : ''}`) +
    row('правит', `с ${ld.born} г., до ~${ld.dies} г.; дел на счету ${ld.deeds}`) +
    row('отряд', (() => { const p = (a.parties || []).find(x => x.kind === 'leader' && x.owner === l.id && x.state !== 'gone'); return p ? `${esc(deedLabel(p.plan, p.plan))}, ${stateWord(p.state)}, ${p.days} дн.` : 'дома'; })())) : '';
  const parties = (a.parties || []).filter(p => p.owner === l.id && p.kind !== 'leader' && p.state !== 'gone').map(p => `${kindWord(p.kind)} (${esc(deedLabel(p.plan, p.plan || ''))}), ${stateWord(p.state)}, ${p.days} дн.`).join('; ');
  const prof = profileOf(l);
  return sec(`${L.label.replace(/^./, c => c.toUpperCase())} «${l.name}»`,
    row('уклад', `${esc(prof.label)}${!ld && L.domain ? ' — без хозяина: мертвецов не поднимают' : !ld && prof.rule !== 'pack' ? ' — без главаря' : ''}`) +
    row('хозяева', `${esc(sp.plural)}${L.tribe ? ' (племя)' : L.undead ? ' (мёртвые)' : L.fiend ? ' (демоны)' : L.dragon ? '' : ' (чудовища)'}; мощь вида ${r1(power(L.species))}`) +
    row('сила', `${Math.round(l.strength * 100)}%${l.boss != null ? ', логово босса бедствия' : ''}`) +
    (L.domain ? row('некромант', `${esc(necroLabel(l.race))}; владения — ${Math.round(zoneOf(a, l))} клеток вокруг, данников ${(a.lairs || []).filter(o => o.alive && o.lord === l.id).length}${l.cult >= 1 ? `; в культе ${Math.round(l.cult)} из городов` : ''}`) : '') +
    row('известно', l.hidden ? 'скрыто: ни одна держава о нём не знает, выжечь его нельзя' : l.found ? `найдено в ${l.found.year} г. (${esc(l.found.by)})` : 'с давних пор') +
    row('возраст', `с ${l.born <= 0 ? 'незапамятных времён' : `${l.born} г.`}${l.ancient ? ', древнее' : ''}`) +
    row('владения', `${Math.round(L.radius * scaleOf(a))} клеток`) +
    row('господин', lord?.alive ? `«${esc(lord.name)}»${lord.leader ? ` (${esc(leaderName(lord))})` : ''}` : null) +
    row('данники', vassals || null) +
    row('в полоне', captiveCount(l) || null) +
    row('отряды', parties || null) +
    (L.dragon ? row('сон', l.wakes > (a.hist?.year ?? 0) ? `ранен: ещё ${l.wakes - a.hist.year} ${plural(l.wakes - a.hist.year, 'лето', 'лета', 'лет')}` : 'летом чаще спит, иногда вылетает жечь') : '') +
    `<div class="ir"><span>нравы</span></div>${deedsHtml(sp.deeds?.lair)}` +
    `<div class="ir"><span>о чём думало логово</span></div>${thoughtsHtml(l)}`) + leader;
}

function partyHtml(a, p) {
  const lair = p.owner != null && p.kind !== 'army' ? a.lairs.find(l => l.id === p.owner) : null, R = p.kind === 'army' ? realmOf(a, p.owner) : null;
  const tgt = p.target != null ? a.towns.find(t => t.id === p.target) : null, from = p.from != null ? a.towns.find(t => t.id === p.from) : null;
  const left = p.path && p.state !== 'stay' ? Math.max(0, p.path.length - p.k) : 0;
  const S = p.siege, siege = S ? `запас еды в городе ${S.stock} дн.${S.starved ? `, умерло от голода ${Math.round(S.starved)}` : ''}, сожжено угодий ${p.burnt || 0}; штурм — когда войско сильнее ${ARMY.assaultAt * 100}% города, через ${ARMY.longest} дн. осады или без припасов` : null;
  return sec(`${kindWord(p.kind).replace(/^./, c => c.toUpperCase())}: ${p.label}`,
    row('дело', p.plan && DEEDS.has(p.plan) ? `${esc(DEEDS.get(p.plan).label)}${p.why ? ` — ${esc(p.why)}` : ''}` : p.kind === 'army' ? `война${p.war ? ` (${esc(p.war)})` : ''}` : null) +
    row('чей', lair ? `${LAIRS.get(lair.kind).label} «${esc(lair.name)}»` : R ? esc(realmLabel(a, R.id)) : null) +
    row('откуда', from ? `${townLabel(from)} ${esc(from.name)}` : null) +
    row('куда', tgt ? `${townLabel(tgt, 1)} ${esc(tgt.name)}` : p.kind === 'brood' ? 'к месту нового логова' : null) +
    row('состояние', `${stateWord(p.state)}, ${p.days} дн. в пути${left ? `, ещё ~${left} клеток` : ''}${p.state === 'stay' ? `, стоит ${p.stay} дн.` : ''}`) +
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


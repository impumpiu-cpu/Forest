// A fight of the caravan: a night attack on the camp, an ambush on the march. Played on the local map of
// the cell (campaign/camp.js) — the caravan's people, beasts and stores as they are, the foe as the bubble
// sent it — and what came out of it is taken back as it came out: the dead, the wounds, what was eaten,
// stolen, broken, taken from the fallen foes. A campaign in the quick mode (K.mode 'auto': the balance
// runs) settles it at once instead: the foe's might against the caravan's.
import {CAMPAIGN, FOES} from '../data/campaign.js';
import {CAMP} from '../data/camp.js';
import {AMBUSH} from '../data/bubble.js';
import {BEASTS, VEHICLES, GETTING} from '../data/transport.js';
import {ITEMS} from '../data/items.js';
import {FOODS} from '../data/foods.js';
import {RESOURCES} from '../data/resources.js';
import {BUILDINGS} from '../data/buildings.js';
import {LOYALTY, FREED, COMPANIONS} from '../data/market.js';
import {room} from './company.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {plural} from '../core/util.js';
import {assign, toolTier} from './baggage.js';
import {makeMember} from './start.js';
import {campSetup, runCamp, campOutcome, outcomeHash} from './camp.js';
import {say, die, alive, caravanMight, gainBeast, shake} from './march.js';
import {afterFight} from './quest.js';
import {free, takeAuto, takeFromCamp, captivesInFight, escaped, formersFought} from './captives.js';

const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const pieces = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;
const names = list => list.join(', ');

// d = {kind (data/campaign.js FOES), strength, label, band?, beast?}; how — 'night' | 'ambush'. True when they held
export function fight(a, K, d, r, how = 'night') {
  if (how === 'ambush') K.stats.ambushes = (K.stats.ambushes || 0) + 1;
  K.stats.fights++;
  if (K.mode === 'auto') captivesInFight(a, K, d, r, (text, kind, who) => say(a, K, text, kind, false, who));   // (on the local map the camp plays it)
  const win = K.mode === 'auto' ? autoFight(a, K, d, r, how) : localFight(a, K, d, how);
  if (!alive(K).length) return win;
  if (win) { K.stats.won++; shake(K, LOYALTY.won); spoils(a, K, d, r); formersFought(K); }
  else { K.stats.fled++; shake(K, LOYALTY.lost); K.camp = 0; K.why = ''; K.build = null; }
  afterFight(a, K, d, win, (text, kind, world) => say(a, K, text, kind, world));   // the crown's carrier fell? (campaign/quest.js)
  return win;
}

const opening = (d, how) => (how === 'guard' ? `Караван пошёл на штурм: ${d.label || FOES[d.kind].label}` : `${how === 'ambush' ? 'На марше из засады ударили' : 'Ночью на лагерь напали'} ${FOES[d.kind].label}${d.label && d.label !== FOES[d.kind].label ? ` — ${d.label}` : ''}`);
const WHERE = {ambush: 'засаде', night: 'ночном бою', guard: 'штурме', stop: 'стоянке'};

// ── on the local map
function localFight(a, K, d, how) {
  const S = campSetup(a, K, {kind: how, foe: d, dayIn: K.dayIn});
  const o = play(K, S, how, d.label || FOES[d.kind].label, d);
  applyCamp(a, K, S, o, d, how);
  if (d.boss && o.bossDead === false && !o.won && o.foes.killed > 0) say(a, K, `${d.boss.name} ушёл живым: штурм придётся повторить.`, 'fight');
  return o.won;
}

// ── a day of a stop on the local map: the hunt, the gathering, the fishing; what the land gave is the day's food
export function playStop(a, K) {
  const S = campSetup(a, K, {kind: 'stop', dayIn: K.dayIn});
  const o = play(K, S, 'stop', 'стоянка');
  const food0 = K.food;
  applyCamp(a, K, S, o, null, 'stop');
  const kept = new Set(CAMP.carry), dug = Object.entries(o.got).filter(([id]) => kept.has(id) && id !== 'hide' && id !== 'leather' && id !== 'rope');
  const got = Object.entries(o.got).filter(([id]) => FOODS.has(id) || id === 'hide').map(([id, n]) => `${RESOURCES.get(id).label} ${n}`);
  K.stats.stopDays = (K.stats.stopDays || 0) + 1;
  for (const [id, n] of dug) K.stats.dug = (K.stats.dug || 0) + n;
  const digging = dug.length ? `; добыли ${names(dug.map(([id, n]) => `${RESOURCES.get(id).label} ${n}`))}` : '';
  say(a, K, `День стоянки: ${K.why?.startsWith('mine:') ? 'копали и мыли' : 'охотились, собирали и рыбачили'} — ${got.length ? `принесли ${names(got)} (+${pieces(Math.max(0, Math.round(K.food - food0)), 'паёк', 'пайка', 'пайков')})` : 'еды земля почти не дала'}${digging}.`, 'stop');
  return o.got;
}

// play a camp through and keep it to be watched again (the setup is enough to play it the same way)
function play(K, S, how, label, d = null) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const w = runCamp(S), o = campOutcome(w);
  const L = (K.stats.local ||= {camps: 0, ticks: 0, ms: 0});
  L.camps++; L.ticks += o.ticks; L.ms += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  (K.camps ||= []).push({day: K.day, kind: how, label, setup: S, won: o.won, dead: o.members.filter(m => !m.alive).length, hash: outcomeHash(o)});
  if (K.camps.length > CAMP.keep) K.camps.shift();
  return o;
}

// the camp's outcome into the campaign
export function applyCamp(a, K, S, o, d, how) {
  const hurt = [], fallen = [];
  const where = WHERE[how] || 'бою';
  for (const mo of o.members) {
    const m = K.members.find(x => x.id === mo.id); if (!m || !m.alive) continue;
    if (mo.escaped) { escaped(a, K, m, `На стоянке ${m.name}, ${m.gender === 'f' ? 'пленная, бежала' : 'пленный, бежал'}`, (text, kind, who) => say(a, K, text, kind, false, who)); continue; }
    if (!mo.alive) { fallen.push(m); continue; }
    if (mo.captive && m.captive) Object.assign(m.captive, mo.captive);
    if (mo.hp < m.hp - 0.05) hurt.push(m);
    m.hp = mo.hp; m.local = mo.local;
  }
  // the beasts: killed, bolted into the dark, led off by the thieves
  const lostB = [], stolenB = [];
  for (const bo of o.beasts) {
    const b = K.beasts.find(x => x.id === bo.id); if (!b) continue;
    if (bo.alive) { b.hp = bo.hp; continue; }
    (bo.stolen ? stolenB : lostB).push(b);
  }
  if (lostB.length || stolenB.length) { K.beasts = K.beasts.filter(b => !lostB.includes(b) && !stolenB.includes(b)); assign(K); K.path = null; }
  const food0 = K.food;
  K.food = o.food; K.cargo = o.cargo;
  // the vehicles: a broken cart, a burnt building
  const broken = [];
  for (const vo of o.vehicles) {
    const v = K.vehicles[vo.k]; if (!v) continue;
    if (vo.burnt && v.building) { broken.push(`«${BUILDINGS.get(v.building).name}» сгорело`); v.building = null; }
    if (vo.wrecked) { broken.push(`разбили ${VEHICLES[v.kind].label === 'тележка' ? 'тележку' : 'повозку'}`); v.gone = true; }
  }
  if (K.vehicles.some(v => v.gone)) { K.vehicles = K.vehicles.filter(v => !v.gone); assign(K); K.path = null; }
  const took = takeGear(K, o.items);
  const taken = takeFromCamp(a, K, o, (text, kind, who) => say(a, K, text, kind, false, who));   // the fallen foes the camp bound
  if (how === 'stop') {   // a quiet day: only what went wrong is told (a beast lost, someone fallen)
    if (lostB.length || stolenB.length) say(a, K, `На стоянке потеряли ${names([...stolenB, ...lostB].map(b => BEASTS[b.kind].acc))}.`, 'beast');
    for (const m of fallen) die(a, K, m, `погиб${m.gender === 'f' ? 'ла' : ''} на стоянке`);
    return;
  }
  // the line: what happened, who fell, who is hurt, what is lost and won
  const F = o.foes, parts = [];
  if (F.n) parts.push(`${pieces(F.n, 'враг', 'врага', 'врагов')}: ${F.killed ? `${F.killed} убито` : 'никого не убили'}${F.taken ? `, ${F.taken} в плену` : ''}${F.fled ? `, ${F.fled} бежали` : ''}${F.left ? `, ${F.left} осталось` : ''}`);
  if (fallen.length) parts.push(`пали ${names(fallen.map(m => m.name))}`);
  if (hurt.length) parts.push(`ранены ${names(hurt.map(m => m.name))}`);
  if (stolenB.length) parts.push(`увели ${names(stolenB.map(b => BEASTS[b.kind].acc))}`);
  if (lostB.length) parts.push(`потеряли ${names(lostB.map(b => BEASTS[b.kind].acc))}`);
  if (o.plundered) parts.push(`склад разграблен${K.food < food0 - 0.5 ? ` (−${Math.round(food0 - K.food)} пайков)` : ''}`);
  parts.push(...broken);
  if (took.length) parts.push(`с убитых взяли ${names(took)}`);
  const verdict = o.won ? (how === 'guard' ? 'Взяли верх' : F.n ? 'Отбились' : 'Обошлось') : how === 'guard' ? 'Отступили' : 'Не устояли';
  say(a, K, `${opening(d, how)}. ${verdict} — бой на месте${parts.length ? `: ${parts.join('; ')}` : ''}.`, 'fight', false, [...fallen, ...hurt].map(m => m.id));
  for (const m of fallen) die(a, K, m, `пал${m.gender === 'f' ? 'а' : ''} в ${where} (${FOES[d.kind].label})`);
}

// gear from the fallen foes: armour and arms to whoever gains most by them, the rest sold in a town
export function takeGear(K, items) {
  const ms = free(K).filter(m => !m.former), took = [];   // no arms or armour for a captive or a former slave
  const armor = id => ITEMS.get(id)?.armor ?? 0, dmg = m => Math.max(0, ...m.gear.hand.map(id => ITEMS.get(id)?.melee?.dmg ?? 0));
  for (const id of items) {
    const it = ITEMS.get(id); if (!it) continue;
    if (it.slot === 'body') {
      const m = ms.slice().sort((p, q) => armor(p.gear.body) - armor(q.gear.body))[0];
      if (m && armor(m.gear.body) < (it.armor ?? 0)) { K.spoils = [...(K.spoils || []), m.gear.body]; m.gear.body = id; took.push(`${it.short} (${m.name})`); continue; }
    } else if (it.melee && !it.tool && it.hands === 1 && !it.ranged) {
      const m = ms.filter(x => x.role === 'knight' || x.role === 'sellsword').sort((p, q) => dmg(p) - dmg(q))[0];
      const k = m ? m.gear.hand.findIndex(x => ITEMS.get(x)?.melee && !ITEMS.get(x)?.ranged && x !== 'shield') : -1;
      if (m && k >= 0 && dmg(m) < it.melee.dmg) { K.spoils = [...(K.spoils || []), m.gear.hand[k]]; m.gear.hand[k] = id; took.push(`${it.short} (${m.name})`); continue; }
    }
    if ((it.value ?? 0) >= 1) K.spoils = [...(K.spoils || []), id];
  }
  if (K.spoils?.length > CAMP.spoils) K.spoils = K.spoils.sort((p, q) => (ITEMS.get(q)?.value ?? 0) - (ITEMS.get(p)?.value ?? 0)).slice(0, CAMP.spoils);
  const sold = (K.spoils || []).length;
  if (sold && !took.length && items.length) took.push(`трофеи на продажу (${pieces(sold, 'вещь', 'вещи', 'вещей')} в обозе)`);
  return took;
}

// ── after a won fight: captives set free, beasts the foe kept, now and then an iron tool
function spoils(a, K, d, r) {
  // the fallen foes bound and taken (campaign/captives.js): on the local map the camp does it itself
  if (K.mode === 'auto') takeAuto(a, K, d, r, (text, kind, who) => say(a, K, text, kind, false, who));
  if (FREED.chance[d.kind] && room(K, 'joined') && r() < FREED.chance[d.kind]) {
    const n = 1 + (r() < 0.35 ? 1 : 0), got = [];
    for (let q = 0; q < n && room(K, 'joined'); q++) {
      const minor = r() < COMPANIONS.minor, peoples = WORLD_PEOPLES.all();
      const race = minor ? COMPANIONS.minorRaces[(r() * COMPANIONS.minorRaces.length) | 0] : peoples[(r() * peoples.length) | 0].race;
      const m = makeMember(K, r, {race, role: 'freed', gear: FREED.gear, loyalty: FREED.loyalty});
      K.members.push(m); got.push(`${m.name} (${SPECIES.get(race).label})`);
    }
    say(a, K, `В лагере врагов нашли пленников и освободили: ${names(got)}. ${n > 1 ? 'Пока идут с караваном' : 'Пока идёт с караваном'} — надолго ли, неизвестно.`, 'people');
  }
  for (const [kind, p] of Object.entries(GETTING.spoil[d.kind] || {})) if (r() < p) { gainBeast(a, K, kind, 'У врагов отбили'); break; }
  const T = GETTING.spoilTool;
  if (T[d.kind] && toolTier(K) < 2 && r() < T[d.kind]) {
    const m = free(K).find(x => x.role === 'squire') || free(K)[0], old = m.gear.hand[0];
    m.gear.hand[0] = T.item;
    say(a, K, `Среди брошенного врагами нашёлся ${ITEMS.get(T.item).label.toLowerCase()}: ${m.name} сменил${m.gender === 'f' ? 'а' : ''} на него ${ITEMS.has(old) ? ITEMS.get(old).short : 'свой инструмент'}. С железом можно сколотить повозку.`, 'build');
  }
}

// ── at once (the quick mode): the foe's might against the caravan's
function autoFight(a, K, d, r, how) {
  const F = CAMPAIGN.fight, foe = FOES[d.kind], E = foe.might * (d.strength ?? 1) * between(r, [0.6, 1.4]), P = caravanMight(K) * (how === 'ambush' ? AMBUSH.surprise : 1);
  const share = P / (P + E), win = r() < share;
  // the blows: more when they lose, mostly on the knights, who shield the squires
  let hurt = E * (F.hurt[0] + (F.hurt[1] - F.hurt[0]) * (1 - share)) * (win ? 1 : F.lostHurt);
  const hit = [];
  while (hurt > 0 && alive(K).length) {
    const ms = alive(K), wts = ms.map(m => (m.role === 'knight' ? F.shield : m.captive ? F.captive : 1));   // a captive keeps out of it
    let x = r() * wts.reduce((s, v) => s + v, 0), m = ms[0];
    for (let q = 0; q < ms.length; q++) { x -= wts[q]; if (x <= 0) { m = ms[q]; break; } }
    const b = between(r, F.blow); m.hp -= b; hurt -= b * 2;
    if (!hit.includes(m)) hit.push(m);
    const mortal = r() < F.mortal;
    if (mortal || (m.hp <= 0 && !win)) die(a, K, m, `пал в ${WHERE[how] || 'бою'} (${foe.label})`);
    else if (m.hp <= 0) m.hp = F.saved;
  }
  if (!alive(K).length) return win;
  if (win) {
    const loot = Math.round(between(r, F.loot)); K.food += loot;
    say(a, K, `${opening(d, how)}. ${how === 'guard' ? 'Взяли верх' : 'Отбились'}${hit.length ? `, ранены: ${hit.filter(m => m.alive).map(m => m.name).join(', ') || 'никто'}` : ' без ран'}; с убитых взяли еды на ${pieces(loot, 'паёк', 'пайка', 'пайков')}.`, 'fight');
    return true;
  }
  const lost = how === 'guard' ? 0 : Math.round(K.food * F.lost); K.food -= lost;   // a storm beaten back: the baggage stayed in camp
  say(a, K, `${opening(d, how)}. ${how === 'guard' ? 'Отступили' : 'Не устояли и бежали'}${how === 'night' ? ' в темноте' : ''}${lost ? `, бросив ${pieces(lost, 'паёк', 'пайка', 'пайков')}` : ''}${hit.length ? `; ранены: ${hit.filter(m => m.alive).map(m => m.name).join(', ') || '—'}` : ''}.`, 'fight');
  const gone = K.beasts.filter(() => r() < GETTING.lose.beast);
  if (gone.length) {
    K.beasts = K.beasts.filter(b => !gone.includes(b)); assign(K); K.path = null;
    const words = Object.keys(BEASTS).map(kind => { const n = gone.filter(b => b.kind === kind).length; return n ? (n === 1 ? BEASTS[kind].acc : `${BEASTS[kind].plural} (${n})`) : null; }).filter(Boolean);
    say(a, K, `${how === 'night' ? 'В темноте увели или убили' : 'В суматохе увели или убили'} ${words.join(', ')}.`, 'beast');
  }
  for (const v of [...K.vehicles]) if (r() < GETTING.lose.vehicle) {
    K.vehicles = K.vehicles.filter(x => x !== v); assign(K); K.path = null;
    say(a, K, `Враги разбили ${VEHICLES[v.kind].label === 'тележка' ? 'тележку' : 'повозку'}${v.building ? ` вместе с «${BUILDINGS.get(v.building).name}»` : ''}.`, 'beast');
  }
  return false;
}

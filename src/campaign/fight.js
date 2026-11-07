// A fight of the caravan: a night attack on the camp, an ambush on the march. Played on the local map of
// the cell (campaign/camp.js) — the caravan's people, beasts and stores as they are, the foe as the bubble
// sent it — and what came out of it is taken back as it came out: the dead, the wounds, what was eaten,
// stolen, broken, taken from the fallen foes. A campaign in the quick mode (K.mode 'auto': the balance
// runs) settles it at once instead: the foe's might against the caravan's.
import {isFighter, inLine, toolOf} from '../data/campaign.js';
import {memberFate} from '../atlas/persons.js';
import {CAMPAIGN, FOES} from '../data/campaign.js';
import {gearDef, gearType, gearValue, mayTake} from '../agents/equipment.js';
import {CAMP} from '../data/camp.js';
import {AMBUSH} from '../data/bubble.js';
import {BEASTS, VEHICLES, GETTING} from '../data/transport.js';
import {FOODS} from '../data/foods.js';
import {RESOURCES} from '../data/resources.js';
import {BUILDINGS} from '../data/buildings.js';
import {LOYALTY, FREED, COMPANIONS} from '../data/market.js';
import {CAPTIVE_RAID} from '../data/lairs.js';
import {room} from './company.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {plural} from '../core/util.js';
import {assign, toolTier, campOf, hasBuilding} from './baggage.js';
import {makeMember} from './start.js';
import {campSetup, runCamp, campOutcome, outcomeHash, foeWeight} from './camp.js';
import {takeOnce, takeBonds, notedFade, takeFacts, noteFate, welcome} from './social.js';
import {say, die, alive, caravanMight, gainBeast, stopFood} from './march.js';
import {shake} from './people.js';
import {afterFight} from './quest.js';
import {topUp, quaffMember, effectsIn, woundsIn} from './potions.js';
import {free, takeAuto, takeFromCamp, captivesInFight, escaped, formersFought} from './captives.js';
import {famed, paceOf} from './road.js';

// how long the local camps of a campaign took on this machine (not part of the campaign)
export const CAMP_TIME = new WeakMap();

const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const pieces = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;
const names = list => list.join(', ');

// d = {kind (data/campaign.js FOES), strength, label, band?, beast?}; how — 'night' | 'ambush'. True when they held
export function fight(a, K, d, r, how = 'night') {
  if (how === 'ambush') K.stats.ambushes = (K.stats.ambushes || 0) + 1;
  K.stats.fights++;
  if (K.mode === 'auto') captivesInFight(a, K, d, r, (text, kind, who) => say(a, K, text, kind, false, who));   // (on the local map the camp plays it)
  // who the fallen fell to, for the balance (campaign-balance): a grave's guards, the lair's, the hunt
  K.fightSrc = d.boss?.mustDie ? 'lair' : d.boss ? 'grave' : d.pursuit || null;
  const before = alive(K).map(m => [m.id, m.hp]);
  const win = K.mode === 'auto' ? autoFight(a, K, d, r, how) : localFight(a, K, d, how);
  delete K.fightSrc;
  recordFight(a, K, d, how, win, before);
  if (!alive(K).length) return win;
  if (win) { K.stats.won++; shake(K, LOYALTY.won); spoils(a, K, d, r); formersFought(K); if (d.kind !== 'army') famed(a, K, 'win'); }   // fame with the realm about (campaign/road.js); not for beating that realm's own army
  else { K.stats.fled++; shake(K, LOYALTY.lost); K.camp = 0; K.why = ''; K.build = null; }
  afterFight(a, K, d, win, (text, kind, world) => say(a, K, text, kind, world));   // the crown's carrier fell? (campaign/quest.js)
  return win;
}

// the fight's record (campaign/stats.js; K.fights): who came and how many, the boss and its fate, the two sides' strength,
// what it cost the caravan and who of it killed whom. The quick mode knows only the might it rolled with (K.lastAuto)
function recordFight(a, K, d, how, win, before) {
  const o = K.mode === 'auto' ? null : K.lastCamp, A = K.mode === 'auto' ? K.lastAuto : null;
  delete K.lastCamp; delete K.lastAuto;
  const ids = new Set(before.map(([id]) => id));
  const fell = K.members.filter(m => ids.has(m.id) && !m.alive && !m.left?.escaped && !m.left?.taken).map(m => m.name);   // (a captive who ran, one led off: gone, not fallen)
  const hurt = K.members.filter(m => m.alive && ids.has(m.id) && m.hp < before.find(([id]) => id === m.id)[1] - CAMPAIGN.fight.wounded).map(m => m.name);
  const F = o?.foes, B = F?.boss;
  const rec = {day: K.day, how, kind: d.kind, label: d.label || FOES[d.kind].label, won: !!win, mode: K.mode === 'auto' ? 'auto' : 'local',
    fighters: before.filter(([id]) => !K.members.find(m => m.id === id)?.captive).length,
    plundered: o ? !!o.plundered : null, foes: F ? F.n : A?.heads ?? null, killed: F ? F.killed : null, fled: F ? F.fled : null, taken: F ? F.taken : null, led: o ? o.led || 0 : null, species: F ? F.species : null,
    ours: o ? o.ours.might : A?.P ?? null, theirs: F ? F.might : A?.E ?? null, weight: F ? F.weight : A?.weight ?? null,
    boss: d.boss ? {name: d.boss.name, species: d.boss.species, mustDie: !!d.boss.mustDie, came: !!B, fate: !B ? 'absent' : B.dead ? 'dead' : B.bound ? 'bound' : B.fled ? 'fled' : 'stood', hp: B?.hp ?? null} : null,
    fell, hurt, kills: o ? Object.fromEntries(Object.entries(o.ours.kills).map(([id, n]) => [K.members.find(m => m.id === +id)?.name || id, n])) : {}};
  (K.fights ||= []).push(rec);
}

const opening = (d, how) => (how === 'guard' ? `Караван пошёл на штурм: ${d.label || FOES[d.kind].label}` : `${how === 'ambush' ? 'На марше из засады ударили' : 'Ночью на лагерь напали'} ${FOES[d.kind].label}${d.label && d.label !== FOES[d.kind].label ? ` — ${d.label}` : ''}`);
const WHERE = {ambush: 'засаде', night: 'ночном бою', guard: 'штурме', stop: 'стоянке'};

// ── on the local map
function localFight(a, K, d, how) {
  const S = campSetup(a, K, {kind: how, foe: d, dayIn: K.dayIn});
  const o = play(K, S, how, d.label || FOES[d.kind].label, d);
  K.lastCamp = o;   // for the fight's record (recordFight)
  applyCamp(a, K, S, o, d, how); topUp(K); if (o.potions) K.stats.potions = (K.stats.potions || 0) + o.potions;   // spare potions of the cargo into the slots
  if (d.boss && o.bossDead === false && !o.won && o.foes.killed > 0) say(a, K, `${d.boss.name} ${d.boss.g === 'f' ? 'ушла живой' : 'ушёл живым'}: штурм придётся повторить.`, 'fight');
  return o.won;
}

// ── a day of a stop on the local map: the hunt and the gathering (no fishing: the caravan carries no rod); what the land
// gave is the day's food
export function playStop(a, K) {
  const S = campSetup(a, K, {kind: 'stop', dayIn: K.dayIn});
  const o = play(K, S, 'stop', 'стоянка');
  const food0 = K.food;
  applyCamp(a, K, S, o, null, 'stop'); topUp(K); if (o.potions) K.stats.potions = (K.stats.potions || 0) + o.potions;
  if (K.food > food0) K.food = food0 + (K.food - food0) * stopFood(a, K);   // the cauldron and the people's way of the land (data/transport.js)
  const kept = new Set(CAMP.carry), dug = Object.entries(o.got).filter(([id]) => kept.has(id) && !CAMP.notDug.includes(id));
  const got = Object.entries(o.got).filter(([id]) => FOODS.has(id) || id === 'hide').map(([id, n]) => `${RESOURCES.get(id).label} ${n}`);
  K.stats.stopDays = (K.stats.stopDays || 0) + 1;
  for (const [id, n] of dug) K.stats.dug = (K.stats.dug || 0) + n;
  const digging = dug.length ? `; добыли ${names(dug.map(([id, n]) => `${RESOURCES.get(id).label} ${n}`))}` : '';
  say(a, K, `День стоянки: ${K.why?.startsWith('mine:') ? 'копали и мыли' : 'охотились и собирали'} — ${got.length ? `принесли ${names(got)} (+${pieces(Math.max(0, Math.round(K.food - food0)), 'паёк', 'пайка', 'пайков')})` : 'еды земля почти не дала'}${digging}.`, 'stop');
  return o.got;
}

// play a camp through and keep it to be watched again (the setup is enough to play it the same way)
function play(K, S, how, label, d = null) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const w = runCamp(S), o = campOutcome(w);
  const L = (K.stats.local ||= {camps: 0, ticks: 0});
  L.camps++; L.ticks += o.ticks;
  // the time it took is this machine's, not the campaign's: kept beside it, never saved (tools read it: localMs)
  CAMP_TIME.set(K, (CAMP_TIME.get(K) || 0) + ((typeof performance !== 'undefined' ? performance.now() : 0) - t0));
  (K.camps ||= []).push({day: K.day, kind: how, label, setup: S, won: o.won, dead: o.members.filter(m => !m.alive).length, hash: outcomeHash(o), ...(S.foe?.boss ? {boss: S.foe.boss.name} : {})});
  // the screen plays the season's camps back after it is stepped (ui/campaignView.js): none of this season is let go —
  // a season of days of stops would push its fights out before they were shown; of the older, `keep` are kept
  const old = K.camps.filter(c => c.day < (K.seasonFrom ?? 0));
  if (old.length > CAMP.keep) K.camps = K.camps.filter(c => c.day >= (K.seasonFrom ?? 0) || old.indexOf(c) >= old.length - CAMP.keep);
  return o;
}

// the camp's outcome into the campaign
export function applyCamp(a, K, S, o, d, how) {
  // a camp is taken back once (campaign/social.js): a second call with the same session changes nothing
  if (!takeOnce(K, o.session ?? S.seed)) return false;
  const hurt = [], fallen = [];
  const where = WHERE[how] || 'бою';
  for (const mo of o.members) {
    const m = K.members.find(x => x.id === mo.id); if (!m || !m.alive) continue;
    if (mo.escaped) { escaped(a, K, m, `На стоянке ${m.name}, ${m.gender === 'f' ? 'пленная, бежала' : 'пленный, бежал'}`, (text, kind, who) => say(a, K, text, kind, false, who)); continue; }
    if (mo.taken) {   // led off by the raiders: gone from the caravan, alive — the chronicle keeps it
      m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year, taken: true}; K.stats.taken = (K.stats.taken || 0) + 1; memberFate(a, m, 'taken'); noteFate(K, m, 'taken', {heard: true});
      say(a, K, `На стоянке ${m.name} ${m.gender === 'f' ? 'уведена' : 'уведён'} налётчиками в плен.`, 'leave', false, [m.id]); assign(K); continue;
    }
    if (!mo.alive) { fallen.push(m); m.fell = mo.cause; continue; }
    if (mo.captive && m.captive) Object.assign(m.captive, mo.captive);
    if (mo.hp < m.hp - CAMPAIGN.fight.wounded) hurt.push(m);
    m.hp = mo.hp; m.local = mo.local; if (mo.align) m.align = mo.align; (m.social ||= {}).mood = mo.mood || []; if (mo.potions != null) m.potions = mo.potions; if (mo.belt) m.belt = mo.belt.length ? mo.belt : null; if (mo.effects) m.effects = effectsIn(K, mo.effects); if (mo.wounds) m.wounds = woundsIn(K, mo.wounds); if (mo.marks) m.marks = [...new Set([...(m.marks || []), ...mo.marks])];
  }
  // the bonds the camp came to, between those who were there (the fallen too: what was felt for them is kept)
  takeBonds(K, S.members.map(m => m.id), o.bonds); notedFade(K, o.faded); takeFacts(K, o.facts);
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
  // the camp: a building burnt is gone; the vehicles: a broken cart
  const broken = [];
  for (const id of o.burnt || []) if (hasBuilding(K, id)) { broken.push(`«${BUILDINGS.get(id).name}» сгорело`); K.buildings = K.buildings.filter(x => x !== id); }
  for (const vo of o.vehicles) {
    const v = K.vehicles[vo.k]; if (!v) continue;
    if (vo.wrecked) { broken.push(`разбили ${VEHICLES[v.kind].label === 'тележка' ? 'тележку' : 'повозку'}`); v.gone = true; }
  }
  if (K.vehicles.some(v => v.gone)) { K.vehicles = K.vehicles.filter(v => !v.gone); assign(K); K.path = null; }
  const took = takeGear(K, o.items);
  const taken = takeFromCamp(a, K, o, (text, kind, who) => say(a, K, text, kind, false, who));   // the fallen foes the camp bound
  o.led = taken.length;   // (those really led away — the caravan's room may be short of the bound; the rest get away: recordFight `led`)
  if (how === 'stop') {   // a quiet day: only what went wrong is told (a beast lost, someone fallen)
    if (lostB.length || stolenB.length) say(a, K, `На стоянке потеряли ${names([...stolenB, ...lostB].map(b => BEASTS[b.kind].acc))}.`, 'beast');
    for (const m of fallen) { const why = m.fell; delete m.fell; die(a, K, m, stopDeath(m, why), {heard: true}); }   // (a quiet day: the others were about their work)
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
  for (const m of fallen) { delete m.fell; die(a, K, m, `пал${m.gender === 'f' ? 'а' : ''} в ${where} (${FOES[d.kind].label})`); }
}

// a death on the local map as the campaign tells it (settlement/chronicle.js noteDeath: «умер от холода», «погиб: волк»,
// «погиб в бою с налётчиками»)
function stopDeath(m, why) {
  const fell = `погиб${m.gender === 'f' ? 'ла' : ''}`;
  if (!why || /^погибл?а?$/.test(why)) return `${fell} на стоянке`;
  const beast = why.match(/^погибл?а?: (.+)$/);
  if (beast) return `${fell} на стоянке (${beast[1]})`;
  if (/^погибл?а? /.test(why)) return why.replace(/^(погибл?а?) /, '$1 на стоянке ');
  return `${why} на стоянке`;
}

// gear from the fallen foes: armour and arms to whoever gains most by them, the rest sold in a town
export function takeGear(K, items) {
  const all = free(K).filter(m => !m.former), took = [];   // no arms or armour for a captive or a former slave
  const armor = id => gearDef(id)?.armor ?? 0, dmg = m => Math.max(0, ...m.gear.hand.map(id => gearDef(id)?.melee?.dmg ?? 0));
  for (const id of items) {
    const it = gearDef(id); if (!it) continue;
    const ms = all.filter(m => mayTake(m.race, id));   // not to one whose race will not touch it: the elves and iron
    if (it.slot === 'body') {
      const m = ms.slice().sort((p, q) => armor(p.gear.body) - armor(q.gear.body))[0];
      if (m && armor(m.gear.body) < (it.armor ?? 0)) { K.spoils = [...(K.spoils || []), m.gear.body]; m.gear.body = id; took.push(`${it.short} (${m.name})`); continue; }
    } else if (it.melee && !it.tool && it.hands === 1 && !it.ranged) {
      const m = ms.filter(x => isFighter(x) || x.role === 'sellsword').sort((p, q) => dmg(p) - dmg(q))[0];
      const k = m ? m.gear.hand.findIndex(x => gearDef(x)?.melee && !gearDef(x)?.ranged && gearType(x) !== 'shield') : -1;
      if (m && k >= 0 && dmg(m) < it.melee.dmg) { K.spoils = [...(K.spoils || []), m.gear.hand[k]]; m.gear.hand[k] = id; took.push(`${it.short} (${m.name})`); continue; }
    }
    if (gearValue(id) >= 1) K.spoils = [...(K.spoils || []), id];
  }
  if (K.spoils?.length > CAMP.spoils) K.spoils = K.spoils.sort((p, q) => gearValue(q) - gearValue(p)).slice(0, CAMP.spoils);
  const sold = (K.spoils || []).length;
  if (sold && !took.length && items.length) took.push(`трофеи на продажу (${pieces(sold, 'вещь', 'вещи', 'вещей')} в обозе)`);
  return took;
}

// ── after a won fight: captives set free, beasts the foe kept, now and then an iron tool
// the captives a lair keeps (atlas/deeds/captives.js, lair.captives by people): the caravan that beat its folk in its lands
// frees up to CAPTIVE_RAID.freed.max of them, and they walk with it as the freed do
export function freeLairCaptives(a, K, d, r, tell) {
  const l = d.lair != null ? (a.lairs || []).find(x => x.id === d.lair) : null;
  const held = l?.captives ? Object.entries(l.captives).filter(([, n]) => n > 0) : [];
  if (!held.length || r() >= CAPTIVE_RAID.freed.chance) return [];
  const got = [], who = [];
  for (let q = 0; q < CAPTIVE_RAID.freed.max && held.length && room(K, 'joined'); q++) {
    const [people] = held[(r() * held.length) | 0];
    const m = makeMember(K, r, {race: WORLD_PEOPLES.get(people).race, role: 'freed', gear: FREED.gear, loyalty: FREED.loyalty});
    K.members.push(m); welcome(K, m); who.push(m); got.push(`${m.name} (${SPECIES.get(m.race).label})`);
    if (--l.captives[people] <= 0) { delete l.captives[people]; held.splice(held.findIndex(([p]) => p === people), 1); }
  }
  if (got.length) tell(`В «${l.name}» держали пленных: ${names(got)} освобожден${got.length > 1 ? 'ы' : who[0].gender === 'f' ? 'а' : ''} и пока ид${got.length > 1 ? 'ут' : 'ёт'} с караваном.`, 'people');
  return got;
}

function spoils(a, K, d, r) {
  // the fallen foes bound and taken (campaign/captives.js): on the local map the camp does it itself
  if (K.mode === 'auto') takeAuto(a, K, d, r, (text, kind, who) => say(a, K, text, kind, false, who));
  // the lair's own captives first; a stranger's camp may hold some by chance
  if (freeLairCaptives(a, K, d, r, (text, kind) => say(a, K, text, kind)).length) return spoilsRest(a, K, d, r);
  if (FREED.chance[d.kind] && room(K, 'joined') && r() < FREED.chance[d.kind]) {
    const n = 1 + (r() < FREED.second ? 1 : 0), got = [];
    for (let q = 0; q < n && room(K, 'joined'); q++) {
      const minor = r() < COMPANIONS.minor, peoples = WORLD_PEOPLES.all();
      const race = minor ? COMPANIONS.minorRaces[(r() * COMPANIONS.minorRaces.length) | 0] : peoples[(r() * peoples.length) | 0].race;
      const m = makeMember(K, r, {race, role: 'freed', gear: FREED.gear, loyalty: FREED.loyalty});
      K.members.push(m); welcome(K, m); got.push(`${m.name} (${SPECIES.get(race).label})`);
    }
    say(a, K, `В лагере врагов нашли пленников и освободили: ${names(got)}. ${n > 1 ? 'Пока идут с караваном' : 'Пока идёт с караваном'} — надолго ли, неизвестно.`, 'people');
  }
  spoilsRest(a, K, d, r);
}
// the beasts and the tools the foe left
function spoilsRest(a, K, d, r) {
  for (const [kind, p] of Object.entries(GETTING.spoil[d.kind] || {})) if (r() < p) { gainBeast(a, K, kind, 'У врагов отбили'); break; }
  const T = GETTING.spoilTool;
  if (T[d.kind] && toolTier(K) < 2 && r() < T[d.kind]) {
    const may = free(K).filter(x => mayTake(x.race, T.item)), m = may.find(x => toolOf(x, gearDef)) || may[0], old = m ? toolOf(m, gearDef) : null;
    if (m) {
      { const k = m.gear.hand.indexOf(old); if (k >= 0) m.gear.hand[k] = T.item; else m.gear.hand.push(T.item); }
      say(a, K, `Среди брошенного врагами нашёлся ${gearDef(T.item).label.toLowerCase()}: ${m.name} сменил${m.gender === 'f' ? 'а' : ''} на него ${!!gearDef(old) ? gearDef(old).short : 'свой инструмент'}. С железом можно сколотить повозку.`, 'build');
    }
  }
}

// ── at once (the quick mode): the foe's might against the caravan's
function autoFight(a, K, d, r, how) {
  // the foe is bought by the caravan's might × the fight's weight (campaign/camp.js foeWeight, data/camp.js CAMP.foe), as on the local map
  const F = CAMPAIGN.fight, foe = FOES[d.kind], might = caravanMight(K), weight = foeWeight(r, d, how), E = might * weight, P = might * (how === 'ambush' ? (K.alert === K.day ? 1 : AMBUSH.surprise) * paceOf(K).wary : 1);   // (an invigorating brew of the day: not caught napping)
  const share = P / (P + E), win = r() < share;
  K.lastAuto = {E: Math.round(E * 100) / 100, P: Math.round(P * 100) / 100, heads: Math.max(1, Math.ceil(E * CAMP.quickHeads)), weight: Math.round(weight * 100) / 100};   // for the fight's record
  // the blows: more when they lose, mostly on the first rank, who shield the rest
  let hurt = E * (F.hurt[0] + (F.hurt[1] - F.hurt[0]) * (1 - share)) * (win ? 1 : F.lostHurt);
  const hit = [];
  while (hurt > 0 && alive(K).length) {
    const ms = alive(K), wts = ms.map(m => (inLine(m) ? F.shield : m.captive ? F.captive : 1));   // a captive keeps out of it
    let x = r() * wts.reduce((s, v) => s + v, 0), m = ms[0];
    for (let q = 0; q < ms.length; q++) { x -= wts[q]; if (x <= 0) { m = ms[q]; break; } }
    const b = between(r, F.blow); m.hp -= b; hurt -= b * 2;
    if (quaffMember(m)) K.stats.potions = (K.stats.potions || 0) + 1;   // at the edge, a healing potion (campaign/potions.js)
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
    say(a, K, `Враги разбили ${VEHICLES[v.kind].label === 'тележка' ? 'тележку' : 'повозку'}.`, 'beast');
  }
  if (how === 'night') for (const id of [...campOf(K)]) if (r() < GETTING.lose.building) {   // the camp stood only at night
    K.buildings = K.buildings.filter(x => x !== id);
    say(a, K, `Враги сожгли «${BUILDINGS.get(id).name}».`, 'beast');
  }
  return false;
}

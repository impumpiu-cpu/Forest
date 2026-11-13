// A fight of the caravan: a night attack on the camp, an ambush on the march. Played on the local map of
// the cell (campaign/camp.js) — the caravan's people, beasts and stores as they are, the foe as the bubble
// sent it — and what came out of it is taken back as it came out: the dead, the wounds, what was eaten,
// stolen, broken, taken from the fallen foes. A campaign in the quick mode (K.mode 'auto': the balance
// runs) settles it at once instead: the foe's might against the caravan's.
import {takeEscorts} from './duty.js';
import {isFighter, inLine, toolOf} from '../data/campaign.js';
import {memberFate} from '../atlas/index.js';
import {CAMPAIGN, FOES} from '../data/campaign.js';
import {gearDef, gearType, gearValue, mayTake} from '../local/index.js';
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
import {campSetup, runCamp, campOutcome, outcomeHash, foeBudget, foeFielded, companyStrength} from './camp.js';
import {AUTOFIGHT} from '../data/autofight.js';
import {takeOnce, takeBonds, takeFacts, noteFate, welcome} from './social.js';
import {say, die, alive, caravanMight, gainBeast, stopFood} from './march.js';
import {shake} from './people.js';
import {afterFight} from './quest.js';
import {topUp, quaffMember, effectsIn, woundsIn} from './potions.js';
import {free, takeAuto, takeFromCamp, captivesInFight, escaped, formersFought} from './captives.js';
import {famed, paceOf} from './road.js';
import {campActs, fightActs, award, share} from './experience.js';
import {ACTS} from '../data/experience.js';
import {maimsIn, maimInstead, spent} from './maims.js';
import {perkOf, perkMulA} from '../data/perks.js';

// the acts of a fight (data/experience.js): one who did one of them in a fight fought by its own deeds, not only by its place.
// Some come as acts of the map (agents/acts.js), some as the camp's facts (settlement/together.js: saved, aid, stoodUp)
const FIGHT_ACTS = new Set(['killBlow', 'killShot', 'hit', 'shield', 'bind']);
const FIGHT_FACTS = {saved: 'dress', aid: 'tend', stoodUp: 'cover'};
// what each did in a fight on the map, as experience (campaign/experience.js fightActs: the ground goes by it) — Map(id → xp)
function meritOf(camp) {
  const out = new Map(), add = (id, v) => { if (v > 0) out.set(id, (out.get(id) || 0) + v); };
  for (const mo of camp.members || []) for (const [id, n] of Object.entries(mo.acts || {})) if (FIGHT_ACTS.has(id)) add(mo.id, mo.actXp?.[id] ?? ACTS.get(id).xp * n);
  for (const f of camp.facts || []) if (FIGHT_FACTS[f.kind] && f.by != null) add(f.by, ACTS.get(FIGHT_FACTS[f.kind]).xp);
  return out;
}

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
  const shadow = K.shadow && K.mode !== 'auto' ? autoGuess(a, K, d, how) : null;   // (tools/autofight-calibrate.mjs --campaigns: the quick fight's word beside the map's)
  const win = K.mode === 'auto' ? autoFight(a, K, d, r, how) : localFight(a, K, d, how);
  if (shadow) K.shadow.push({...shadow, won: !!win, fell: K.members.filter(m => before.some(([id]) => id === m.id) && !m.alive).length, n: before.length, theirs: K.lastCamp?.foes?.might ?? null});
  delete K.fightSrc;
  const camp = K.lastCamp;
  recordFight(a, K, d, how, win, before);
  // the ground of the fight for all who stood in it, and the role's letter for whoever did nothing of its own there (campaign/experience.js)
  // (the merit of each on the map; the quick fight has none — null: all get the ground whole)
  const ids = new Set(before.map(([id]) => id)), merit = K.mode !== 'auto' && camp ? meritOf(camp) : null, acted = new Set(merit?.keys() || []);
  fightActs(K, d, how, win, {...K.fights.at(-1), acted, merit}, K.members.filter(m => ids.has(m.id)));
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
  const rec = {day: K.day, how, kind: d.kind, label: d.label || FOES[d.kind].label, won: !!win, mode: K.mode === 'auto' ? 'auto' : 'local', strength: d.strength ?? null,
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
  if (!takeOnce(K, o.session ?? S.seed, S.day ?? K.day)) return false;
  const hurt = [], fallen = [], fates = [];
  const where = WHERE[how] || 'бою';
  // taken back in stages, so the order of the company does not matter (the ids do): first each one's own state, then the
  // bonds and the facts of the map, then the fates and what they mean to the others (a friend taken grieves the one whose
  // mood the map just gave back, by the bonds the map came to)
  for (const mo of o.members) {
    const m = K.members.find(x => x.id === mo.id); if (!m || !m.alive) continue;
    if (mo.escaped || mo.taken) { fates.push([m, mo]); continue; }
    if (!mo.alive) { fallen.push(m); m.fell = mo.cause; m.fellSeen = mo.seen; continue; }
    if (mo.captive && m.captive) Object.assign(m.captive, mo.captive);
    if (mo.hp < m.hp - CAMPAIGN.fight.wounded) hurt.push(m);
    m.hp = mo.hp; m.local = mo.local; if (mo.align) m.align = mo.align; (m.social ||= {}).mood = mo.mood || []; if (mo.potions != null) m.potions = mo.potions; if (mo.belt) m.belt = mo.belt.length ? mo.belt : null; if (mo.effects) m.effects = effectsIn(K, mo.effects); if (mo.wounds) m.wounds = woundsIn(K, mo.wounds, m.wounds); if (mo.marks) m.marks = [...new Set([...(m.marks || []), ...mo.marks])];
    maimsIn(K, m, mo.maimed, (text, who) => say(a, K, text, 'people', false, who), mo, !!d);   // a maim instead of death, and the wounds for life it now bears (campaign/maims.js)
  }
  campActs(K, o);   // what each did here by its own hand: experience (campaign/experience.js)
  // the bonds the camp came to, between those who were there (the fallen too: what was felt for them is kept)
  takeBonds(K, S.members.map(m => m.id), o.bonds); takeFacts(K, o.facts);
  takeEscorts(K, o.promises, (text, who) => say(a, K, text, 'people', false, who));   // the promises kept on the map, or why not (campaign/duty.js)
  for (const [m, mo] of fates) {
    if (mo.escaped) { escaped(a, K, m, `На стоянке ${m.name}, ${m.gender === 'f' ? 'пленная, бежала' : 'пленный, бежал'}`, (text, kind, who) => say(a, K, text, kind, false, who)); continue; }
    // led off by the raiders: gone from the caravan, alive — the chronicle keeps it
    m.alive = false; m.ride = null; m.left = {day: K.day, year: a.hist.year, taken: true}; K.stats.taken = (K.stats.taken || 0) + 1; memberFate(a, m, 'taken'); noteFate(K, m, 'taken', {seen: mo.seen || []});
    say(a, K, `На стоянке ${m.name} ${m.gender === 'f' ? 'уведена' : 'уведён'} налётчиками в плен.`, 'leave', false, [m.id]); assign(K);
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
  // the camp set up here (campaign/works.js): a stop's next day at the same place finds it standing, the stakes cut with it
  if (how === 'stop' || how === 'night') { const same = K.campHere?.i === K.i && K.campHere.day === K.day - 1; K.campHere = {i: K.i, day: K.day, days: (same ? K.campHere.days : 0) + 1, cut: (same ? K.campHere.cut || 0 : 0) + (o.works?.cut || 0)}; }
  if (o.works?.cured) say(a, K, `Шкуры на кольях за ночь выделали в кожу.`, 'build');
  // the camp: a building burnt is gone; the vehicles: a broken cart
  const broken = [];
  for (const id of o.burnt || []) if (hasBuilding(K, id)) { broken.push(`«${BUILDINGS.get(id).name}» сгорело`); K.buildings = K.buildings.filter(x => x !== id); }
  for (const vo of o.vehicles) {
    const v = K.vehicles[vo.k]; if (!v) continue;
    if (vo.wrecked) { broken.push(`разбили ${VEHICLES[v.kind].label === 'тележка' ? 'тележку' : 'повозку'}`); v.gone = true; }
  }
  if (K.vehicles.some(v => v.gone)) { K.vehicles = K.vehicles.filter(v => !v.gone); assign(K); K.path = null; }
  const took = takeGear(K, o.items);
  takeFound(a, K, o.found);   // the caches of the pieces of terrain searched here (campaign/works.js cachesOutcome)
  const taken = takeFromCamp(a, K, o, (text, kind, who) => say(a, K, text, kind, false, who));   // the fallen foes the camp bound
  o.led = taken.length;   // (those really led away — the caravan's room may be short of the bound; the rest get away: recordFight `led`)
  if (how === 'stop') {   // a quiet day: only what went wrong is told (a beast lost, someone fallen)
    if (lostB.length || stolenB.length) say(a, K, `На стоянке потеряли ${names([...stolenB, ...lostB].map(b => BEASTS[b.kind].acc))}.`, 'beast');
    for (const m of fallen) { const why = m.fell, seen = m.fellSeen; delete m.fell; delete m.fellSeen; die(a, K, m, stopDeath(m, why), seen ? {seen} : {heard: true}); }   // (a quiet day: the others were about their work)
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
  for (const m of fallen) { const seen = m.fellSeen; delete m.fell; delete m.fellSeen; die(a, K, m, `пал${m.gender === 'f' ? 'а' : ''} в ${where} (${FOES[d.kind].label})`, seen ? {seen} : {}); }
}

// what the caches of a camp's map held (campaign/works.js cachesOutcome): the gold into the purse, the goods into the cargo,
// the gear to whoever it suits (as from a beaten foe), the rest for sale; each find told as it was found
function takeFound(a, K, found) {
  for (const f of found || []) {
    if (f.gold > 0) K.gold = Math.round((K.gold + f.gold) * 10) / 10;
    for (const [id, n] of Object.entries(f.goods || {})) if (RESOURCES.has(id) && n > 0) K.cargo[id] = (K.cargo[id] || 0) + n;
    const took = f.items?.length ? takeGear(K, f.items) : [];
    K.stats.finds = (K.stats.finds || 0) + 1; K.stats.caches = (K.stats.caches || 0) + 1;
    if (f.gold > 0 || Object.keys(f.goods || {}).length || f.items?.length) K.stats.treasures = (K.stats.treasures || 0) + 1;
    share(K, K.members.filter(m => m.alive), 'find');
    say(a, K, `${f.late ? 'Перед уходом' : 'На стоянке'} (${f.piece}): ${f.text[0].toLowerCase()}${f.text.slice(1)}${took.length ? ` Взяли себе: ${names(took)}.` : ''}`, 'treasure');
  }
  if (found?.length) topUp(K);   // a healing potion found goes into a slot (campaign/potions.js)
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

// ── at once (the quick mode; data/autofight.js — plan Г6, the author's word 13.11): what the map gives against this foe at this
// ratio of strength, read a little worse (the table measured by tools/autofight-calibrate.mjs). The company's strength is the
// map's own rating of it (campaign/camp.js companyStrength), the foe's — the budget the map would buy it by (foeBudget)
// the kind of foe the table knows it by: how it came, and the band or the beast
export const autoKey = (d, how) => `${how === 'guard' ? 'guard' : how === 'ambush' ? 'ambush' : 'night'}:${d.beast || d.band || d.kind}`;
const HOWS_AUTO = ['guard', 'night', 'ambush'];
function autoRow(d, how) {
  const T = AUTOFIGHT.table, own = autoKey(d, how), [h, who] = own.split(':');
  if (T[own]) return {row: T[own], how: h};
  for (const x of HOWS_AUTO) if (T[`${x}:${who}`]) return {row: T[`${x}:${who}`], how: x};
  for (const x of HOWS_AUTO) if (T[`${x}:${d.kind}`]) return {row: T[`${x}:${d.kind}`], how: x};
  return {row: AUTOFIGHT.else, how: h};
}
// the row read at a ratio: between its points by the ratio's logarithm, held at the ends — and under the weakest, the chance to
// win falling away (AUTOFIGHT.below)
function readRow(R, x) {
  const n = R.r.length; let i = 0, j = 0, t = 0;
  if (x >= R.r[n - 1]) i = j = n - 1;
  else if (x > R.r[0]) { j = R.r.findIndex(v => v >= x); i = j - 1; t = Math.log(x / R.r[i]) / Math.log(R.r[j] / R.r[i]); }
  const o = Object.fromEntries(['win', 'dead', 'maim', 'hp', 'pot'].map(key => [key, R[key][i] + (R[key][j] - R[key][i]) * t]));
  if (x < R.r[0]) o.win *= (x / R.r[0]) ** AUTOFIGHT.below;
  return o;
}
// what the quick fight would read for this fight (no draw of the game's: the foe at its mean weight) — for the comparison
export function autoGuess(a, K, d, how) {
  const {row, how: measured} = autoRow(d, how), w = [0.5];
  const caught = how === 'ambush' && measured !== 'ambush' && K.alert !== K.day ? AMBUSH.surprise * paceOf(K).wary : 1;
  const P = companyStrength(a, K) * caught, E = foeFielded(d, how, foeBudget(() => w[0], d, how)), ratio = P / Math.max(1e-6, E);
  const o = readRow(row, ratio / AUTOFIGHT.doubt);
  return {key: autoKey(d, how), P, E, ratio, win: o.win ** AUTOFIGHT.sure, dead: o.dead * AUTOFIGHT.extra, maim: o.maim * AUTOFIGHT.extra};
}
function autoFight(a, K, d, r, how) {
  const F = CAMPAIGN.fight, A = AUTOFIGHT, foe = FOES[d.kind];
  const {row, how: measured} = autoRow(d, how);
  // caught on the march when the table knows this foe only at night: the surprise the map would play (not caught napping — no)
  const caught = how === 'ambush' && measured !== 'ambush' && K.alert !== K.day ? AMBUSH.surprise * paceOf(K).wary : 1;
  const P = companyStrength(a, K) * caught, E = foeFielded(d, how, foeBudget(r, d, how)), ratio = P / Math.max(1e-6, E);
  const o = readRow(row, ratio / A.doubt), win = r() < o.win ** A.sure;
  K.lastAuto = {E: Math.round(E), P: Math.round(P), heads: Math.max(1, Math.ceil(E / CAMP.foe.unit * CAMP.foe.quickUnit * CAMP.quickHeads)), weight: Math.round(E / Math.max(1e-6, P) * 100) / 100};   // for the fight's record (the map's units)
  const ms0 = alive(K).filter(m => !m.captive), n = ms0.length, hit = [], out = new Set();
  const standing = () => alive(K).filter(m => !m.captive && !out.has(m.id));
  const saved = who => F.saved + Math.max(0, ...standing().filter(m => m !== who).map(m => perkOf(m, 'dressHp')));   // (another's hands: a healer does not bind itself better)
  const where = `пал в ${WHERE[how] || 'бою'} (${foe.label})`;
  // the dead and the maimed, as many as the map gives at this ratio (× extra), drawn one by one — the first rank more often
  // (they shield the rest), a shield-bearer «Плечом к плечу» standing covering the others (data/perks.js `cover`)
  const cover = () => Math.max(1, ...standing().filter(inLine).map(m => perkMulA(m, 'cover')));
  const pickOne = () => {
    const ms = standing(); if (!ms.length) return null;
    const c = cover(), wts = ms.map(m => (inLine(m) ? F.shield : 1 / c));
    let x = r() * wts.reduce((s, v) => s + v, 0);
    for (let q = 0; q < ms.length; q++) { x -= wts[q]; if (x <= 0) return ms[q]; }
    return ms.at(-1);
  };
  const count = v => { const w = v * n * A.extra; return Math.floor(w) + (r() < w - Math.floor(w) ? 1 : 0); };
  for (let k = count(o.dead); k > 0; k--) { const m = pickOne(); if (!m) break; if (!hit.includes(m)) hit.push(m); die(a, K, m, where); }
  for (let k = count(o.maim); k > 0; k--) {
    const m = pickOne(); if (!m) break; if (!hit.includes(m)) hit.push(m);
    if (maimInstead(K, m, r, (text, who) => say(a, K, text, 'people', false, who))) { m.hp = Math.min(m.hp, saved(m)); out.add(m.id); } else die(a, K, m, where);   // (three maims borne: the next kills)
  }
  // the health lost: the blows, a share of a body each (CAMPAIGN.fight.blow), as much in all as the map takes (× extra); one at the
  // edge drinks a potion (campaign/potions.js), one fallen with no mark rises («Везучий»: data/perks.js)
  let hurt = o.hp * n * A.extra;
  while (hurt > 0 && standing().length) {
    const m = pickOne(), b = Math.min(hurt, between(r, F.blow)); m.hp -= b; hurt -= b;
    if (quaffMember(m)) K.stats.potions = (K.stats.potions || 0) + 1;
    if (!hit.includes(m)) hit.push(m);
    // (the dead and the maimed of the fight are counted above, as the map counts them — a fall here is a fall: bound up and alive,
    // but one with three maims borne, whom the next deadly blow kills)
    if (m.hp <= 0 && spent(m)) die(a, K, m, where);
    else if (m.hp <= 0) { m.hp = saved(m); if (win) award(K, m, 'clean'); }
  }
  // (a lost fight's finished-off are among the map's dead read above: no draw of their own)
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

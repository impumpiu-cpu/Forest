// Maims, wounds for life and the answers to them (plan claude/xp-plan.md, Ver_E Э4; campaign/maims.js, agents/wounds.js lethal;
// data/wounds.js DEATHBLOW.maim; docs/CAMPAIGN.md «Увечья и травмы»).
//   the author's call: a member's deadly wound maims instead of killing — senseless but not bleeding, a dressing wakes it; three
//   borne, the next kills without a check; switched off, the old way exactly;
//   not for a foe, not for one finished off where it lies, not past all health;
//   the quick mode: the blow that would kill maims, while one may bear another;
//   a lost arm holds one thing; the maims come back from the map counted, a fact and a line;
//   the answers: opened by the wound and the deeds after it, taken first; «Переболел» takes the fear off; «Везучий» grants Luck
//   inside the race; «Костоправ» spares a trauma; the road's traumas: night terrors, frostbite.
//   node tools/maim-check.mjs
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {DEATHBLOW, WOUNDS, MAIM_OF} from '../src/data/wounds.js';
import {lethal, dressWound, stabilize} from '../src/agents/wounds.js';
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {maimInstead, maimsIn, terrorsFrom, frostbite, noteScars, sinceScar, hasWound} from '../src/campaign/maims.js';
import {meets, offered, pickPerk} from '../src/campaign/perks.js';
import {PERKS} from '../src/data/perks.js';
import {SPECIES} from '../src/data/species.js';
import {campSetup, openCamp, campOutcome} from '../src/campaign/camp.js';
import {fight, applyCamp} from '../src/campaign/fight.js';
import {noteAct} from '../src/agents/acts.js';
import {campActs} from '../src/campaign/experience.js';
import {FOES} from '../src/data/campaign.js';
import {bondBy} from '../src/campaign/social.js';
import {ensureXp, specialOn} from '../src/campaign/experience.js';
import {perksBy} from '../src/campaign/perks.js';
import {scarsOn, maimsOn} from '../src/campaign/maims.js';

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };

// ── the local map: lethal()
const scene = () => { const w = newGame({...DEFAULT_CFG, seed: 'maim', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'}); w.agents = []; return w; };
const fix = (w, v) => { for (const k of Object.keys(w.rngs)) w.rngs[k] = Object.assign(() => v, {state: 0}); };   // 0.99: every luck check fails
{
  const w = scene(), m = createAgent(w, 'human', 'colony', 20.5, 20.5); m.member = 1; fix(w, 0.99);
  m.hp = -0.1;
  const fell = lethal(w, m, 'ран', null);
  ok(fell && !m.dead && m.downed?.maim && m.downed.until > 1e12 && m.maims === 1 && m.maimedNow?.length === 1, 'проваленная проверка: участник не умер — увечье, без сознания, не истекает кровью', `${m.downed?.maim}, увечий ${m.maims}`);
  dressWound(w, m, 0);
  ok(!m.downed && m.wounds.some(x => x.id === m.maimedNow[0] && x.until == null), 'перевязка приводит в сознание; увечье — на всю жизнь');
  m.wounds = []; m.maims = 3; m.hp = -0.1;
  ok(!lethal(w, m, 'ран', null) && m.dead, 'три увечья — следующая смертельная рана убивает без проверки');
  const r = createAgent(w, 'human', 'raiders', 21.5, 20.5); r.hp = -0.1; lethal(w, r, 'ран', null);
  ok(r.dead || !r.downed?.maim, 'врагу увечья вместо смерти нет');
  const d = createAgent(w, 'human', 'colony', 22.5, 20.5); d.member = 2; d.downed = {since: 0, until: 1e9}; d.hp = -0.1;
  ok(!lethal(w, d, 'ран', null) && d.dead, 'добитый там, где лежит, — умирает');
  const o = createAgent(w, 'human', 'colony', 23.5, 20.5); o.member = 3; o.hp = -2 * maxHp(o);
  ok(!lethal(w, o, 'ран', null) && o.dead, 'удар за пределом всего здоровья — смерть, как прежде');
  const was = DEATHBLOW.maim.on; DEATHBLOW.maim.on = false;
  const x = createAgent(w, 'human', 'colony', 24.5, 20.5); x.member = 4; x.hp = -0.1;
  ok(!lethal(w, x, 'ran'.replace('ran', 'ран'), null) && x.dead, 'переключатель выключен — смерть, как до Э4');
  DEATHBLOW.maim.on = was;
  // the bone-setter: the trauma the fall drew is spared
  const p = createAgent(w, 'human', 'colony', 25.5, 20.5), h = createAgent(w, 'human', 'colony', 25.5, 21.5); p.member = 5; h.member = 6;
  p.hp = 1; p.downed = {since: 0, until: 1e9, trauma: 'limp'}; h.perks = [{id: 'boneSetter', rank: 1}]; fix(w, 0); h.skill = {medicine: 0.3};
  stabilize(w, h, p);
  ok(!p.wounds.some(x => x.id === 'limp'), 'костоправ: травма, что вынесла бы рана, не осталась');
  // a clean survival is counted
  const c = createAgent(w, 'human', 'colony', 26.5, 20.5); c.member = 7; fix(w, 0); c.hp = -0.1; lethal(w, c, 'ран', null);
  ok(c.acts?.clean === 1 && !c.downed?.trauma, 'пережил смертельную рану без следа — счёт для «Везучего»');
}

// ── the campaign
const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base));
const cap = capitals(base).find(c => c.people === 'humans');
const fresh = () => { const a = loadAtlas(JSON.parse(fz)); return {a, K: newCampaign(a, cap.town, {mode: 'auto'})}; };
{
  const {K} = fresh(), m = K.members[0], lines = [];
  const id = maimInstead(K, m, () => 0.3, t => lines.push(t));
  ok(id && m.maims === 1 && m.wounds.some(x => x.id === id && x.day == null) && /увечн(?:ым|ой): .*увечий: 1 из 3/.test(lines[0]) && K.social.facts.some(f => f.kind === 'maimed' && f.to === m.id), 'быстрый режим: смертельный удар — увечье, строка и факт', lines[0]);
  m.maims = 3;
  ok(maimInstead(K, m, () => 0.3) === null, 'с тремя увечьями быстрый режим убивает');
  const c = K.members[1]; c.captive = {since: 0};
  ok(maimInstead(K, c, () => 0.3) === null, 'пленному увечья вместо смерти нет'); delete c.captive;
  // from the map: counted once a maim, the wound's counts kept for its answer
  const q = K.members[2]; ensureXp(q); q.acts.fight = 5; q.wounds = [{id: 'blindEye', day: null}];
  maimsIn(K, q, ['blindEye']);
  ok(q.maims === 1 && q.scarAt.blindEye?.fight === 5, 'увечье с карты: счёт, рубец с делами на тот миг');
}

// ── a lost arm holds one thing: the weapon, not the shield (the shield's cover is gone), against one with both arms
{
  const {a, K} = fresh(), [m, n] = K.members;
  m.gear.hand = ['spear', 'shield']; m.wounds = [{id: 'lostArm', day: null}];
  n.gear.hand = ['spear', 'shield']; n.wounds = null;
  const w = openCamp(campSetup(a, K, {kind: 'stop', dayIn: 0})), ag = id => [...w.campaign.people.values()].find(x => x.member === id);
  ok(ag(n.id)?.gear?.cover > 0 && !(ag(m.id)?.gear?.cover > 0) && ag(m.id)?.gear?.melee, 'потерянная рука: копьё в руке, щита нет (у двурукого щит прикрывает)', `прикрытие ${ag(n.id)?.gear?.cover} / ${ag(m.id)?.gear?.cover ?? 0}`);
}

// ── the answers
{
  const {K} = fresh(), m = ensureXp(K.members[3]);
  m.level = 6; m.fight = 'archer'; m.acts = {hit: 30, fight: 4, watch: 9}; m.wounds = [{id: 'eye', day: null}]; noteScars(m);
  ok(!meets(m, PERKS.get('oneEyed')), 'одноглазый стрелок: до дел после раны — нет');
  m.acts.hit += 20;
  ok(meets(m, PERKS.get('oneEyed')) && sinceScar(m, 'eye', 'hit') === 20, '20 попаданий после раны — открыт');
  ok(pickPerk(K, m)?.id === 'oneEyed', 'ответ на рану берётся первым, хотя открыт и «Второе дыхание»');
  const f = ensureXp(K.members[4]); f.level = 5; f.wounds = [{id: 'dread', day: null}]; noteScars(f); f.acts.fight = (f.acts.fight || 0) + 3;
  ok(pickPerk(K, f)?.id === 'overcame' && !hasWound(f, 'dread') && K.social.facts.some(x => x.kind === 'overcame' && x.by === f.id), '«Переболел»: страх смерти снят, факт');
  const l = ensureXp(K.members[5]); l.level = 2;   // (below the classes' own perks: data/classes.js, from the third) l.acts.clean = 1; const cap5 = SPECIES.get(l.race).special.L[1];
  l.special.L = cap5 - 1; const L0 = l.special.L;
  ok(pickPerk(K, l)?.id === 'lucky' && l.special.L === L0 + 1, '«Везучий»: Удача +1');
  const l2 = ensureXp(K.members[6]); l2.level = 3; l2.acts = {clean: 1}; l2.special.L = cap5;
  ok(!offered(l2).some(o => o.P.id === 'lucky'), 'Удача на пределе расы — «Везучего» не предлагают');
}

// ── the road's traumas
{
  const {K} = fresh(), [gone, a1, a2] = K.members;
  a1.local.traits = ['timid']; a2.local.traits = [];
  bondBy(K, a1.id, gone.id, 2); bondBy(K, a2.id, gone.id, 0.2);
  terrorsFrom(K, gone, [a1.id, a2.id], () => 0.1);
  ok(hasWound(a1, 'terrors') && !hasWound(a2, 'terrors'), 'ночные страхи: робкий друг, видевший гибель, — да; едва знакомый — нет');
  const m = K.members[3], lines = []; m.special.E = 5;
  frostbite(K, [m], true, () => 0.9, () => 0, t => lines.push(t));
  ok(hasWound(m, 'frostbite') && lines.length === 1, 'обморожение: шёл измотанным в мороз', lines[0]);
  const n = K.members[4]; frostbite(K, [n], true, () => 0.2, () => 0);
  ok(!hasWound(n, 'frostbite'), 'бодрый не обмораживается');
  ok(WOUNDS.filter(x => x.trauma && x.drawn !== false).every(x => !['terrors', 'frostbite'].includes(x.id)) && Object.values(MAIM_OF).every(id => WOUNDS.get(id).maim), 'дорожные травмы и увечья не выпадают смертельной ране обычной травмой');
}

// ══ Р2: the findings of the second review, each through the game's own doors
// Р2-01: a member's perks and maims go onto the map with it — and back out of a replayed setup the same
{
  const {a, K} = fresh(), [m, x, y] = K.members;
  m.perks = [{id: 'oldWolf', rank: 1, day: 0, at: [0]}]; m.maims = 3; m.wounds = [{id: 'blindEye', day: null}, {id: 'shatteredLeg', day: null}, {id: 'crushedChest', day: null}];
  for (const g of [m, x, y]) g.race = 'goblin';
  const S = campSetup(a, K, {kind: 'stop', dayIn: 0}), S2 = JSON.parse(JSON.stringify(S));
  const ag = w => [...w.campaign.people.values()].find(q => q.member === m.id);
  const w1 = openCamp(S), w2 = openCamp(S2), a1 = ag(w1), a2 = ag(w2);
  ok(a1.perks?.some(p => p.id === 'oldWolf') && a1.maims === 3 && a1.kinHere === 3, 'Р2-01: перк, увечья и сородичи входят на карту со снимком стоянки', `перки ${JSON.stringify(a1.perks)}, увечий ${a1.maims}, своих ${a1.kinHere}`);
  ok(JSON.stringify([a2.perks, a2.maims, a2.kinHere, a2.mods]) === JSON.stringify([a1.perks, a1.maims, a1.kinHere, a1.mods]), 'Р2-01: повтор стоянки из сохранённого снимка — то же тело');
  fix(w1, 0.99); a1.hp = -0.1; lethal(w1, a1, 'ран', null);
  const o = campOutcome(w1), mo = o.members.find(q => q.id === m.id);
  ok(a1.dead && !mo.alive, 'Р2-01: с тремя увечьями, принесёнными из похода, смертельная рана на карте убивает');
  applyCamp(a, K, S, o, null, 'stop');
  ok(!m.alive && m.maims === 3, 'Р2-01: в поход не возвращается четвёртое увечье', `увечий ${m.maims}, жив ${m.alive}`);
}
// Р2-02: the fates at the camp's end do not hang on the members' order; one stable alone comes to with no company's binding
{
  const run = flip => {
    const {a, K} = fresh(), S = campSetup(a, K, {kind: 'stop', dayIn: 0});
    if (flip) S.members.reverse();
    const w = openCamp(S), P = [...w.campaign.people.values()].filter(q => q.member != null);
    const st = P.find(q => q.member === K.members[0].id), bl = P.find(q => q.member === K.members[1].id);
    for (const q of P) if (q !== st && q !== bl) { q.dead = true; w.agents = w.agents.filter(z => z !== q); }
    st.downed = {since: w.tick, until: Number.MAX_SAFE_INTEGER, maim: 'lostArm'}; st.maimedNow = ['lostArm']; st.maims = 1;
    bl.downed = {since: w.tick, until: w.tick + 1e6};
    const o = campOutcome(w), f = id => o.members.find(q => q.id === id);
    return {st: f(K.members[0].id).alive, bl: f(K.members[1].id).alive, bound: o.facts.filter(x => x.kind === 'boundAfter').length};
  };
  const p = run(false), q = run(true);
  ok(p.st && !p.bl && p.bound === 0 && JSON.stringify(p) === JSON.stringify(q), 'Р2-02: стабильный увечный жив, истекающий кровью без помощи — нет, при любом порядке; факта перевязки отрядом нет', `${JSON.stringify(p)} / ${JSON.stringify(q)}`);
}
// Р2-03: the quick fight, won and lost: one with three maims whose health runs out dies, never rises «clean»
{
  let won = 0, lost = 0, bad = 0, n = 0, deadWon = 0, deadLost = 0;
  for (let s = 0; s < 40 && (won < 2 || lost < 2); s++) {
    const {a, K} = fresh();
    for (const m of K.members) { ensureXp(m); m.maims = 3; m.hp = 0.3; }
    let k = s * 7919 + 1; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    const win = fight(a, K, {kind: 'raiders', strength: 1.2, label: 'налётчики'}, r, 'night'); n++;
    const dead = K.members.filter(m => !m.alive).length;
    if (win) { won++; deadWon += dead; } else { lost++; deadLost += dead; }
    bad += K.members.filter(m => m.alive && (m.acts?.clean || 0) > 0).length;
  }
  // (not empty: in both the won and the lost fights some did fall and die — the rule was met, not dodged)
  ok(won > 0 && lost > 0 && deadWon > 0 && deadLost > 0 && bad === 0, 'Р2-03: быстрый бой при победе и поражении: с тремя увечьями упавший погибает, «чисто» не встаёт', `боёв ${n}: побед ${won} (погибших ${deadWon}), поражений ${lost} (погибших ${deadLost}), вставших ${bad}`);
}
// Р2-04: an answer counts the deeds after the wound: «hit, then lost the eye» and «lost the eye, then hit» are not the same
{
  const seq = before => {
    const {K} = fresh(), m = ensureXp(K.members[3]); m.level = 6; m.fight = 'archer'; m.wounds = [{id: 'blindEye', day: null}];
    const mo = {id: m.id, alive: true, acts: {hit: 20}, scarsAt: {blindEye: {hit: before ? 20 : 0, work: 0}}, practiced: {}};
    maimsIn(K, m, ['blindEye'], () => {}, mo, true); campActs(K, {members: [mo]});
    return [sinceScar(m, 'blindEye', 'hit'), !!meets(m, PERKS.get('oneEyed'))];
  };
  const [h1, o1] = seq(true), [h2, o2] = seq(false);
  ok(h1 === 0 && !o1 && h2 === 20 && o2, 'Р2-04: «попал, потом ослеп» — 0 попаданий после раны, ответа нет; «ослеп, потом попал» — 20, ответ открыт', `${h1}/${o1} и ${h2}/${o2}`);
  // the same through a real camp and applyCamp: the hits on the map before and after the blow (agents/acts.js noteScarNow)
  const real = before => {
    const {a, K} = fresh(), S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S);
    const v = [...w.campaign.people.values()].find(q => q.member === K.members[0].id), hits = () => { for (let i = 0; i < 20; i++) noteAct(v, 'hit'); };
    if (before) hits();
    fix(w, 0.99); v.hp = -0.1; lethal(w, v, 'ран', null); const id = v.maimedNow?.[0];
    if (!before) hits();
    applyCamp(a, K, S, campOutcome(w), null, 'stop');
    const m = K.members[0];
    return {id, since: sinceScar(m, id, 'hit'), hit: m.acts?.hit || 0};
  };
  const ra = real(true), rb = real(false);
  ok(ra.id && ra.since === 0 && rb.since === 20 && ra.hit === 20 && rb.hit === 20, 'Р2-04 через настоящую стоянку и applyCamp: 20 попаданий до удара — 0 после раны, 20 после удара — 20', `${JSON.stringify(ra)} / ${JSON.stringify(rb)}`);
  const {K} = fresh(), m = ensureXp(K.members[4]); m.wounds = [{id: 'blindEye', day: null}]; m.acts.fight = 4;
  maimsIn(K, m, ['blindEye'], () => {}, {acts: {}, practiced: {}}, true);
  ok(sinceScar(m, 'blindEye', 'fight') === 0 && m.scarAt.blindEye.fight === 5, 'Р2-04: бой, в котором получена рана, — до неё');
}
// the bone-setter: no draw when there is no perk (the switch off keeps the old stream), and it spares two traumas of three
{
  const w = scene(), p = createAgent(w, 'human', 'colony', 25.5, 20.5), h = createAgent(w, 'human', 'colony', 25.5, 21.5); p.member = 5; h.member = 6;
  p.hp = 1; p.downed = {since: 0, until: 1e9, trauma: 'limp'}; h.skill = {medicine: 0.3};
  let draws = 0; const c0 = w.rngs.colony; w.rngs.colony = Object.assign(() => { draws++; return c0(); }, {state: 0});
  stabilize(w, h, p); const d0 = draws;
  ok(d0 === 0, 'без «Костоправа» перевязка не тянет число из потока', `чисел ${d0}`);
  ok(PERKS.get('boneSetter').fight.cleanHelp >= 0.66, '«Костоправ»: втрое реже — остаётся треть травм', `${PERKS.get('boneSetter').fight.cleanHelp}`);
}
// the witnesses of a maim: those who saw the blow on the map, not all the company
{
  const {a, K} = fresh(), S = campSetup(a, K, {kind: 'stop', dayIn: 0}), w = openCamp(S);
  const P = [...w.campaign.people.values()].filter(q => q.member != null), [v, d] = P;
  d.dead = true; w.agents = w.agents.filter(z => z !== d);
  fix(w, 0.99); v.hp = -0.1; lethal(w, v, 'ран', null);
  const f = (w.campaign.facts || []).find(x => x.kind === 'maimed');
  ok(f && f.to === K.members.find(m => m.id === v.member)?.id && !f.saw.includes(d.member), 'увечье на карте — факт с очевидцами удара; погибший прежде не видел', f ? `видели ${f.saw.length} из ${P.length - 2}` : 'нет факта');
}

// the card played back (Э5 is the screen, but the record is here): a rank as it stood, Luck granted later, a maim got later
{
  const {K} = fresh(), m = ensureXp(K.members[2]);
  m.perks = [{id: 'strongBack', rank: 2, day: 3, at: [3, 9], why: 'level'}, {id: 'lucky', rank: 1, day: 12, at: [12], why: 'clean'}];
  m.granted = [{day: 12, stat: 'L', n: 1}]; const L = m.special.L;
  m.wounds = [{id: 'lostArm', day: null, got: 15}]; m.maims = 1; m.maimDays = [15]; K.day = 20;
  const p6 = perksBy(K, m, 6);
  ok(p6.length === 1 && p6[0].id === 'strongBack' && p6[0].rank === 1 && specialOn(K, m, 6).L === L - 1 && !scarsOn(K, m, 6).length && maimsOn(K, m, 6) === 0,
    'карточка на день 6: «Крепкая спина» I ранга, Удача без «Везучего», руки ещё нет', JSON.stringify(p6.map(p => [p.id, p.rank])));
  ok(perksBy(K, m, 20).length === 2 && scarsOn(K, m, 20).length === 1 && maimsOn(K, m, 16) === 1, 'на сегодня и после раны — всё как есть');
}

// Э6: one maimed in a quick fight is out of it — senseless, as on the map: never two maims in one fight
{
  let most = 0, n = 0;
  for (let s = 1; s <= 12; s++) {
    const {a, K} = fresh(); for (const m of K.members) { ensureXp(m); m.hp = 0.05; }
    let k = s * 7919 + 3; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    fight(a, K, {kind: 'raiders', strength: 3, label: 'налётчики'}, r, 'night');
    for (const m of K.members) { most = Math.max(most, m.maims || 0); n += m.maims || 0; }
  }
  ok(n > 0 && most === 1, 'быстрый бой: увечный выбывает из боя — за один бой не больше одного увечья', `увечий ${n}, больше всего у одного ${most}`);
}

// Р3 (Г6): the quick fight's dead are the map's (data/autofight.js — the finished-off of a lost fight among them): a hopeless fight
// kills, an easy one does not
{
  let hopeless = 0, easy = 0;
  for (let s = 1; s <= 30; s++) {
    let k = s * 104729 + 11; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    { const {a, K} = fresh(); for (const m of K.members) ensureXp(m); fight(a, K, {kind: 'raiders', strength: 6, label: 'налётчики'}, r, 'night'); hopeless += K.members.filter(m => !m.alive).length; }
    { const {a, K} = fresh(); for (const m of K.members) ensureXp(m); fight(a, K, {kind: 'raiders', strength: 0.2, label: 'налётчики'}, r, 'night'); easy += K.members.filter(m => !m.alive).length; }
  }
  ok(hopeless > 30 && easy === 0, 'быстрый бой: безнадёжный бой уносит жизни, лёгкий — нет', `павших за 30 боёв: безнадёжных ${hopeless}, лёгких ${easy}`);
}

if (fails) { console.log(`\n${fails} проверок не прошло`); process.exit(1); }

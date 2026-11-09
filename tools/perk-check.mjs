// Perks (plan claude/xp-plan.md, Ver_E Э3; data/perks.js, campaign/perks.js; docs/CAMPAIGN.md «Перки»).
//   every perk of the catalogue is reachable by a deed both modes see (the expert's Р1: the mode must not shut a perk);
//   none is offered without its deed, its race, its hands, its letters, its level; a rank asks RANK_LEVEL more;
//   the gob with a shield earns «Плечом к плечу» by its deeds, not by Strength;
//   the pick is the member's own (its character), from the campaign's own stream: the same seed — the same perk;
//   each way a perk works reaches what it should: the body (refreshBody, on top of a trait), the fight (cover, blows, the
//   first shot, the dressing, the blood price, the frenzy's weariness), the day (the watch, the load, the prices, the better
//   ware, the spoils, the sight, the pursuit, the bonds).
//   node tools/perk-check.mjs
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {PERKS, RANK_LEVEL, perkOf, perkMulA} from '../src/data/perks.js';
import {meets, offered, pickPerk, perkVal, perkMul, companyVal, companyMul, pullOf} from '../src/campaign/perks.js';
import {levelEvening, need, ensureXp} from '../src/campaign/experience.js';
import {capacity} from '../src/campaign/baggage.js';
import {termsOf} from '../src/campaign/road.js';
import {offers} from '../src/campaign/town.js';
import {bondBy, bondOf} from '../src/campaign/social.js';
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
import {refreshBody} from '../src/agents/special.js';
import {gearSpec} from '../src/agents/itemDefs.js';
import {noteScars} from '../src/campaign/maims.js';
import {fight} from '../src/campaign/fight.js';
import {inLine} from '../src/data/campaign.js';
import {memberMight} from '../src/campaign/march.js';

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };

const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base));
const fresh = () => loadAtlas(JSON.parse(fz));
const cap = capitals(base).find(c => c.people === 'humans');
const a = fresh(), K = newCampaign(a, cap.town, {mode: 'auto'});

// a member made to measure: race, role, hands, letters, level, and what it has done
const FORMS = {shield: 'shield', bow: 'bow', crossbow: 'crossbow', club: 'club', maul: 'maul', net: 'net'};
function who(o = {}) {
  const m = ensureXp(structuredClone(K.members[0]));
  m.id = 900 + (who.n = (who.n || 0) + 1); m.perks = []; m.acts = {}; m.workBy = {};
  Object.assign(m, {race: o.race || 'human', fight: o.fight ?? 'spearman', role: o.role || m.role, level: o.level ?? 20});
  m.special = {S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5, ...(o.special || {})};
  m.gear = {hand: o.hand || ['spear'], body: m.gear.body};
  Object.assign(m.acts, o.acts || {}); Object.assign(m.workBy, o.work || {});
  return m;
}
// the deeds both modes see (fights stood, by group and beside others; watch; swap; trade; towns; work by skill) that open a perk
function bothModes(P) {
  const R = P.req || {}, o = {acts: {}, work: {}, special: {...(R.stat || {})}, level: (R.level || 1) + 6};
  if (R.race) o.race = R.race[0];
  if (R.role) { o.fight = R.role[0]; }
  if (R.group) o.fight = {'линия': 'shieldman', 'дальний бой': 'archer'}[R.group[0]] || o.fight;
  if (R.hand) o.hand = [R.hand.find(f => FORMS[f]) || R.hand[0]];
  if (R.work) { const [sk, v] = Object.entries(R.work)[0]; o.work[sk] = v; }
  if (R.crafts) for (const sk of ['cooking', 'gathering', 'woodcutting', 'medicine', 'construction'].slice(0, R.crafts)) o.work[sk] = 5;
  const BOTH = k => ['fight', 'beside', 'watch', 'swap', 'trade', 'town', 'clean'].includes(k) || k.startsWith('fight:') || k.startsWith('work:');   // (clean: the quick mode's fall and rise counts it too)
  if (R.any) { const [k, n] = R.any.find(([k2]) => BOTH(k2)) || []; if (!k) return null; if (k.startsWith('work:')) o.work[k.slice(5)] = n; else o.acts[k] = n; if (k.startsWith('fight:')) o.fight = {'линия': 'shieldman', 'дальний бой': 'archer'}[k.slice(6)] || o.fight; }
  const m = who(o);
  // an answer to a wound: wherever the wound is borne (a maim — both modes; the fear of death — the map's fall), with deeds both modes see after it
  if (R.scar) { m.wounds = [{id: R.scar.at(-1), day: null}]; noteScars(m); for (const [k, n] of R.since || []) if (k === 'fight') m.acts.fight = (m.acts.fight || 0) + n; else if (k === 'work') m.workBy.cooking = (m.workBy.cooking || 0) + n; }
  return m;
}

// ── every perk is reachable by deeds both modes see
{
  const bad = [];
  for (const P of PERKS.all()) { const m = bothModes(P); if (!m || !meets(m, P)) bad.push(P.id); }
  ok(!bad.length, `каждый перк каталога (${PERKS.all().length}) открывается делом, которое видят оба режима`, bad.join(', ') || 'все');
}

// ── nothing without its deed, race, hands, letters, level
{
  const P = id => PERKS.get(id), m0 = who();
  ok(!meets(m0, P('secondWind')) && meets(who({acts: {watch: 5}}), P('secondWind')) === 'watch', 'без пяти дозоров нет «Второго дыхания»; с ними — есть, причина — дозор');
  ok(!meets(who({race: 'human', acts: {trade: 5}}), P('findBetter')) && meets(who({race: 'dwarf', acts: {trade: 2}}), P('findBetter')), 'расовый перк — только своей расе');
  ok(!meets(who({acts: {shield: 5}}), P('shoulder')) && meets(who({hand: ['spear', 'shield'], acts: {shield: 3}}), P('shoulder')), 'без щита в руках не прикрыть плечом');
  ok(!meets(who({special: {S: 6}, hand: ['maul'], acts: {killBlow: 3}}), P('breaker')) && meets(who({special: {S: 7}, hand: ['maul'], acts: {killBlow: 3}}), P('breaker')), 'проламыватель — единственный, кому нужна Сила 7');
  ok(!meets(who({level: 1, acts: {watch: 9}}), P('secondWind')), 'до уровня перка нет');
  const h = who({special: {C: 6}, acts: {trade: 3}, level: 4}), hp = P('haggler');
  ok(meets(h, hp, 1) && !meets(h, hp, 2), 'второй ранг требует больше уровня и больше дел', `уровень ${hp.req.level + RANK_LEVEL} и ${hp.req.any[0][1] * 2} сделок`);
  ok(!meets(who({race: 'orc', fight: 'firespitter', hand: ['bow'], acts: {hit: 30}}), P('steadyShot')), 'мастеру горна «Выждать выстрел» не предлагается');
}

// ── the expert's case: a goblin shield-bearer earns the shield's knack by holding the line, not by Strength
{
  const gob = who({race: 'goblin', fight: 'shieldman', special: {S: 2}, hand: ['spear', 'shield'], acts: {'fight:линия': 3}});
  ok(!!meets(gob, PERKS.get('shoulder')), 'гоблин-щитоносец с Силой 2 получает «Плечом к плечу» за три боя в строю');
}

// ── the pick: one's own, from the campaign's stream; the same seed, the same perk; taken to its last rank, no more
{
  const run = () => { const a2 = fresh(), K2 = newCampaign(a2, cap.town, {mode: 'auto'}), m = K2.members[1]; Object.assign(m.acts, {watch: 9, swap: 2, fight: 9, beside: 4, trade: 6}); m.special.C = 7; m.level = 12; const out = []; for (let k = 0; k < 6; k++) out.push(pickPerk(K2, m)?.id); return out.join(','); };
  const r1 = run();
  ok(r1 === run() && r1.split(',').filter(Boolean).length >= 4, 'тот же сид — те же перки в том же порядке', r1);
  const m = who({acts: {watch: 9}, level: 30}); m.perks = [];
  const got = []; for (let k = 0; k < PERKS.all().length + 3; k++) { const p = pickPerk(K, m); if (p) got.push(p.id); }
  ok(got.filter(x => x === 'secondWind').length === 1 && !offered(m).length, 'перк берут один раз (ранги — до последнего); каталог кончился — перка нет', got.join(','));
  const brave = who(); brave.local.traits = ['brave']; brave.local.leans = {persist: 1};
  ok(pullOf(brave, PERKS.get('oldWolf')) > pullOf(who(), PERKS.get('oldWolf')), 'характер тянет: смелого и настойчивого — к «Старому волку»');
}

// ── the level's evening takes a perk and says it
{
  const a3 = fresh(), K3 = newCampaign(a3, cap.town, {mode: 'auto'}), m = K3.members[2], lines = [];
  m.acts.watch = 6; m.xp = need(3);
  levelEvening(a3, K3, t => lines.push(t));
  ok(m.perks.length >= 1 && m.perks.some(p => p.id === 'secondWind' && p.why === 'watch') && /Выучил|Выучила/.test(lines.at(-1)) && (K3.social.facts || []).some(f => f.kind === 'perkTaken' && f.by === m.id),
    'вечер уровня: перк на уровень, пока есть доступный (здесь один), причина — дело, строка летописи, факт', lines.at(-1));
}

// ── the ways a perk works
{
  // the body: on top of a trait, not a contest
  const w = newGame({...DEFAULT_CFG, seed: 'perk', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  const ag = createAgent(w, 'human', 'colony', 20.5, 20.5); ag.traits = ['brave']; refreshBody(ag); const b0 = ag.mods.bravery;
  ag.perks = [{id: 'oldWolf', rank: 1}]; refreshBody(ag);
  ok(Math.abs(ag.mods.bravery - b0 - 0.2 * (ag.own?.mul?.bravery ?? 1)) < 1e-9, 'тело: «Старый волк» прибавляет к смелости смелого, а не проигрывает черте', `${b0.toFixed(2)} → ${ag.mods.bravery.toFixed(2)}`);
  const tr = createAgent(w, 'troll', 'colony', 20.5, 20.5); const r0 = tr.mods.regen; tr.perks = [{id: 'livingFlesh', rank: 1}]; refreshBody(tr);
  ok(Math.abs(tr.mods.regen / r0 - 1.3) < 1e-9, 'тело тролля: заживление ×1,3');
  const gob = createAgent(w, 'goblin', 'colony', 20.5, 20.5); gob.perks = [{id: 'herd', rank: 1}]; gob.kinHere = 2; refreshBody(gob); const g2 = gob.mods.bravery;
  gob.kinHere = 3; refreshBody(gob);
  ok(Math.abs(gob.mods.bravery - g2 - 0.3 * (gob.own?.mul?.bravery ?? 1)) < 1e-9, 'стадный гоблин смел, только когда своих трое');
  // the fight: the flags the fight reads
  ok(perkMulA({perks: [{id: 'shoulder', rank: 1}]}, 'cover') === 1.5 && perkMulA({perks: [{id: 'breaker', rank: 1}]}, 'blows', 'blunt') === 1.15 && perkMulA({perks: [{id: 'breaker', rank: 1}]}, 'blows', 'pierce') === 1,
    'бой: щит прикрывает соседей ×1,5; проламыватель — только дробящий удар');
  ok(perkOf({perks: [{id: 'fieldDressing', rank: 2}]}, 'dressHp') === 0.2 && perkMulA({perks: [{id: 'tireless', rank: 1}]}, 'spent') === 0.5, 'перевязь второго ранга +20% здоровья; усталость после бешенства вдвое короче');
  // the day: the watch, the load, the prices, the better ware, the spoils, the sight, the bonds
  const m = K.members[3], c0 = capacity(K); m.perks = [{id: 'strongBack', rank: 2}];
  ok(capacity(K) > c0 && perkMul(m, 'watchTired') === 1, 'ноша: крепкая спина второго ранга несёт больше', `${c0} → ${capacity(K)}`);
  m.perks = [{id: 'secondWind', rank: 1}];
  ok(perkMul(m, 'watchTired') === 0.75, 'дозор утомляет на четверть меньше');
  const t = a.towns.find(x => x.alive && x.realm === cap.realm) || a.towns[0], T0 = termsOf(a, K, t);
  m.perks = [{id: 'haggler', rank: 2}]; const T1 = termsOf(a, K, t);
  ok(T1.buy < T0.buy && T1.sell > T0.sell, 'торгаш: покупают дешевле, продают дороже', `buy ${T0.buy.toFixed(2)} → ${T1.buy.toFixed(2)}, sell ${T0.sell.toFixed(2)} → ${T1.sell.toFixed(2)}`);
  const q0 = offers(t, a, 0).filter(o => o.kind === 'item').map(o => gearSpec(o.id).q || 0), q1 = offers(t, a, 1).filter(o => o.kind === 'item').map(o => gearSpec(o.id).q || 0);
  ok(!q0.length || q1.some((q, k) => q > q0[k]), 'найти получше: та же вещь на ступень лучше', `${q0.slice(0, 3)} → ${q1.slice(0, 3)}`);
  m.perks = [{id: 'useAll', rank: 1}];
  ok(companyMul(K, 'spoils') === 1.5, 'всё в дело: трофеи в полтора раза дороже');
  m.perks = [{id: 'pathfinder', rank: 1}];
  ok(companyVal(K, 'sight') === 1, 'следопыт: туман шире на клетку');
  const [x, y] = [K.members[4], K.members[5]]; x.race = 'human'; y.race = 'orc'; x.perks = [];
  const before = bondOf(K, x.id, y.id); bondBy(K, x.id, y.id, 0.1); const plain = bondOf(K, x.id, y.id) - before;
  x.perks = [{id: 'kinAmong', rank: 1}]; const b1 = bondOf(K, x.id, y.id); bondBy(K, x.id, y.id, 0.1);
  ok(Math.abs((bondOf(K, x.id, y.id) - b1) / plain - 1.5) < 1e-6, 'свой среди чужих: связь с иноплеменником крепнет в полтора раза быстрее');
  m.perks = [];
}

// ── the quick fight (Ver_E Э6): the perks of the fight tell there too — same company, foe and draws, the perk only differs
{
  const rng = s => { let k = s * 48271 + 7; return () => ((k = (k * 16807) % 2147483647) / 2147483647); };
  const run = (s, setup) => {
    const a2 = fresh(), K2 = newCampaign(a2, cap.town, {mode: 'auto'}); for (const m of K2.members) ensureXp(m);
    setup(K2); const hp0 = new Map(K2.members.map(m => [m.id, m.hp ?? 1]));
    fight(a2, K2, {kind: 'raiders', strength: 1, label: 'налётчики'}, rng(s), 'night');
    return K2.members.filter(m => hp0.has(m.id) && !inLine(m) && !m.captive).reduce((v, m) => v + (hp0.get(m.id) - (m.alive ? m.hp ?? 1 : 0)), 0);
  };
  let plain = 0, covered = 0;
  for (let s = 1; s <= 30; s++) { plain += run(s, () => {}); covered += run(s, K2 => { for (const m of K2.members.filter(inLine)) m.perks = [{id: 'shoulder', rank: 1}]; }); }
  ok(covered < plain * 0.9, 'быстрый бой: щитоносец «Плечом к плечу» отводит удары от остальных', `урон не стоящим в строю за 30 боёв: ${plain.toFixed(2)} → ${covered.toFixed(2)}`);
  // the one saved stands up stronger with «Полевая перевязь» in the company; one maimed is out of the fight
  const saved = perk => { const a2 = fresh(), K2 = newCampaign(a2, cap.town, {mode: 'auto'}), [m, h] = K2.members; for (const x of K2.members) ensureXp(x);
    for (const x of K2.members) x.hp = x === m ? 0.01 : 5; if (perk) h.perks = [{id: 'fieldDressing', rank: 2}];
    fight(a2, K2, {kind: 'raiders', strength: 0.3, label: 'налётчики'}, () => 0.001, 'night'); return m.hp; };
  const h0 = saved(false), h1 = saved(true);
  ok(h1 > h0 + 0.15, 'быстрый бой: вытащенный встаёт крепче, если в отряде «Полевая перевязь»', `${h0.toFixed(2)} → ${h1.toFixed(2)}`);
  const a3 = fresh(), K3 = newCampaign(a3, cap.town, {mode: 'auto'}), arm = K3.members.find(m => m.gear.hand.length > 1) || K3.members[0];
  const before = memberMight(arm); arm.wounds = [{id: 'lostArm', day: null}];
  ok(memberMight(arm) < before, 'быстрый бой: потерянная рука — меньше силы в общем счёте (одна вещь в руке, Сила ×0,75)', `${before.toFixed(2)} → ${memberMight(arm).toFixed(2)}`);
}

if (fails) { console.log(`\n${fails} проверок не прошло`); process.exit(1); }

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
import {campSetup, openCamp} from '../src/campaign/camp.js';
import {bondBy} from '../src/campaign/social.js';
import {ensureXp} from '../src/campaign/experience.js';

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
  ok(id && m.maims === 1 && m.wounds.some(x => x.id === id && x.day == null) && /увечным: .*увечий: 1 из 3/.test(lines[0]) && K.social.facts.some(f => f.kind === 'maimed' && f.to === m.id), 'быстрый режим: смертельный удар — увечье, строка и факт', lines[0]);
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
  m.level = 6; m.acts = {hit: 30, fight: 4, watch: 9}; m.wounds = [{id: 'eye', day: null}]; noteScars(m);
  ok(!meets(m, PERKS.get('oneEyed')), 'одноглазый стрелок: до дел после раны — нет');
  m.acts.hit += 20;
  ok(meets(m, PERKS.get('oneEyed')) && sinceScar(m, 'eye', 'hit') === 20, '20 попаданий после раны — открыт');
  ok(pickPerk(K, m)?.id === 'oneEyed', 'ответ на рану берётся первым, хотя открыт и «Второе дыхание»');
  const f = ensureXp(K.members[4]); f.level = 5; f.wounds = [{id: 'dread', day: null}]; noteScars(f); f.acts.fight = (f.acts.fight || 0) + 3;
  ok(pickPerk(K, f)?.id === 'overcame' && !hasWound(f, 'dread') && K.social.facts.some(x => x.kind === 'overcame' && x.by === f.id), '«Переболел»: страх смерти снят, факт');
  const l = ensureXp(K.members[5]); l.level = 3; l.acts.clean = 1; const cap5 = SPECIES.get(l.race).special.L[1];
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

if (fails) { console.log(`\n${fails} проверок не прошло`); process.exit(1); }

// The answers (plan claude/bestiary-plan.md З-11; data/perks.js, agents/combat.js, agents/abilities.js): a body of jelly takes a
// hammer badly and burns well; a swarm shrugs off a hammer and a point, takes a breath double, slips any net; quills prick the
// one who strikes close; a cut deep enough splits a jelly in two, each with half of what was left, no more often than its rank
// allows; one that finishes the weak kills a foe on the ground near it, else goes for the one bent over him. All on a camp map
// of the campaign, the creatures given the perk by hand (the kinds that carry them come in З-12).
//   node tools/answer-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, companyStrength} from '../src/campaign/camp.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {refreshBody} from '../src/agents/special.js';
import {damage, resistOf, netGrip} from '../src/agents/combat.js';
import {stepAct, harmTo} from '../src/agents/abilities.js';
import {strengthOf} from '../src/agents/strength.js';
import {SPECIES} from '../src/data/species.js';
import {PERKS, perkAccess} from '../src/data/perks.js';
import {CAMP} from '../src/data/camp.js';
import {T} from '../src/data/terrain.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base)), cap = capitals(base)[0];
const field = () => {
  const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, cap.town, {mode: 'local'});
  const w = openCamp(campSetup(a, K, {kind: 'night', foe: {kind: 'bandits', strength: companyStrength(a, K) / CAMP.foe.unit}, dayIn: K.dayIn}));
  w.agents = []; w.fx = []; w.campaign.S.kind = 'stop';
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.fire[i] = 0; }
  w.nav.dirty('trees');
  return w;
};
const put = (w, sp, fac, x, y, perks = null) => {
  const a = createAgent(w, sp, fac, x, y); a.think = 1e9; a.mods.dodge = 0;
  if (perks) { a.perks = perks; refreshBody(a); a.hp = maxHp(a); }
  return a;
};
const r2 = x => Math.round(x * 100) / 100;

// ── the book: five perks, a monster's, never a pawn's pick
{
  const ids = ['jelly', 'split', 'quills', 'swarm', 'finishWeak'];
  ok(ids.every(id => PERKS.has(id) && perkAccess(PERKS.get(id)).monster !== 'no' && !perkAccess(PERKS.get(id)).learn), 'пять перков-ответов в справочнике: монстру можно, за уровень не берутся', ids.join(', '));
}

// ── a body of jelly
{
  const w = field(), WS = SPECIES.get('wolf'), plain = put(w, 'wolf', 'raiders', 10, 10), jelly = put(w, 'wolf', 'raiders', 12, 10, [{id: 'jelly', rank: 2}]);
  ok(resistOf(WS, 'blunt', true, jelly) === 0.3 && resistOf(WS, 'pierce', true, jelly) === 0.6 && resistOf(WS, 'slash', true, jelly) === 1, 'студенистое тело: дробящее ×0,3, колющее ×0,6, рубящее как прежде',
    `${resistOf(WS, 'blunt', true, jelly)} / ${resistOf(WS, 'pierce', true, jelly)} / ${resistOf(WS, 'slash', true, jelly)}`);
  ok(r2(harmTo(w, jelly, 'fire') / harmTo(w, plain, 'fire')) === 1.5, 'и горит сильнее', `огонь ×${r2(harmTo(w, jelly, 'fire') / harmTo(w, plain, 'fire'))}`);
  ok(strengthOf(jelly) > strengthOf(plain), 'КС видит студенистое тело', `${Math.round(strengthOf(plain))} → ${Math.round(strengthOf(jelly))}`);
}

// ── a swarm
{
  const w = field(), WS = SPECIES.get('wolf'), sw = put(w, 'wolf', 'raiders', 10, 10, [{id: 'swarm', rank: 1}]);
  ok(resistOf(WS, 'blunt', true, sw) === 0.3 && resistOf(WS, 'pierce', true, sw) === 0.3, 'рой: молот и копьё почти не берут', `${resistOf(WS, 'blunt', true, sw)} / ${resistOf(WS, 'pierce', true, sw)}`);
  ok(netGrip(sw, WS) === 0, 'рой сетью не поймать');
}

// ── quills: the one who strikes close is pricked
{
  const w = field(), hog = put(w, 'boar', 'predators', 10, 10, [{id: 'quills', rank: 2}]), man = put(w, 'human', 'colony', 11, 10);
  man.gear = {...man.gear, armor: 0}; const before = man.hp;
  damage(w, man, hog, 0.2, {melee: true, type: 'slash'});
  const shot = put(w, 'human', 'colony', 15, 10), b2 = shot.hp; damage(w, shot, hog, 0.2, {melee: false, type: 'pierce'});
  ok(man.hp < before && shot.hp === b2, 'иглы колют того, кто бьёт вплотную, а не стрелка', `${r2(before)} → ${r2(man.hp)}; стрелок ${r2(shot.hp)}`);
}

// ── a split
{
  const w = field(), sl = put(w, 'toad', 'predators', 10, 10, [{id: 'split', rank: 1}]), man = put(w, 'human', 'colony', 11, 10), n0 = w.agents.length, full = maxHp(sl);
  damage(w, man, sl, full * 0.6, {melee: true, type: 'blunt'});
  ok(w.agents.length === n0, 'дробящий удар не делит');
  sl.hp = full; damage(w, man, sl, full * 0.6, {melee: true, type: 'slash'});
  const twin = w.agents.find(o => o !== sl && o.species === 'toad');
  ok(twin && r2(twin.hp) === r2(sl.hp) && sl.hp < full / 2 && twin.perks?.some(p => p.id === 'split'), 'сильный рубящий удар делит надвое — у каждого половина оставшегося', twin ? `${r2(sl.hp)} + ${r2(twin.hp)}` : 'не поделился');
  const n1 = w.agents.length; sl.hp = full; damage(w, man, sl, full * 0.6, {melee: true, type: 'slash'});
  ok(w.agents.length === n1, 'I ранг делится один раз', `поколение ${sl.splitGen}`);
  const small = put(w, 'toad', 'predators', 20, 20, [{id: 'split', rank: 1}]), n2 = w.agents.length;
  damage(w, man, small, maxHp(small) * 0.1, {melee: true, type: 'slash'});
  ok(w.agents.length === n2, 'слабый порез не делит');
}

// ── finishing the weak
{
  const w = field(), hy = put(w, 'hyena', 'raiders', 10, 10, [{id: 'finishWeak', rank: 1}]), down = put(w, 'human', 'colony', 11, 10);
  down.downed = {since: 0, until: 1e9, cause: 'ран', by: null}; down.task = {id: 'downed'};
  for (let k = 0; k < 40 && !down.dead; k++) { w.tick++; stepAct(w, hy); }
  ok(down.dead, 'добивает упавшего врага рядом');
}
{
  const w = field(), hy = put(w, 'hyena', 'raiders', 10, 10, [{id: 'finishWeak', rank: 1}]), down = put(w, 'human', 'colony', 16, 10), medic = put(w, 'human', 'colony', 11, 10);
  down.downed = {since: 0, until: 1e9, cause: 'ран', by: null}; down.task = {id: 'downed'};
  medic.task = {id: 'aid', who: down.id, fallen: true}; medic.gear = {...medic.gear, armor: 0}; const b = medic.hp;
  for (let k = 0; k < 40 && medic.hp === b; k++) { w.tick++; stepAct(w, hy); }
  ok(medic.hp < b && !down.dead, 'упавший далеко — бьёт того, кто спешит к нему на помощь', `${r2(b)} → ${r2(medic.hp)}`);
  const w2 = field(), hy2 = put(w2, 'hyena', 'raiders', 10, 10, [{id: 'finishWeak', rank: 1}]), stand = put(w2, 'human', 'colony', 11, 10), bs = stand.hp;
  for (let k = 0; k < 40; k++) { w2.tick++; stepAct(w2, hy2); }
  ok(stand.hp === bs, 'просто стоящего не трогает — это не удар, а добивание', `${r2(bs)} → ${r2(stand.hp)}`);
}

console.log(fails ? `\nanswer-check: ${fails} FAIL` : '\nanswer-check: ok');
process.exit(fails ? 1 : 0);

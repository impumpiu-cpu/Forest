// The bestiary chosen by the fights it brings (plan claude/bestiary-plan.md З-5, the expert's note 13.11): every new species
// and every one given an act uses it in a fight played by the brains — no entry without its action: the owlbear runs at one
// and roars, the ankheg comes up from under the field and spits acid, the constrictor holds and squeezes, the carrion crawler
// numbs, the rust beast rusts the iron, the cobra spits; the dragon breathes, the manticore shoots its spikes, the wyvern
// stings, the spider throws its web, the toad and the crocodile hold, the stone worm comes up from under. The bodies — the
// expert's centres (SPECIAL on the game's own scale).
//   node tools/bestiary-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {campSetup, openCamp, companyStrength} from '../src/campaign/camp.js';
import {createAgent} from '../src/agents/agent.js';
import {recalcGear} from '../src/agents/equipment.js';
import {newItem} from '../src/agents/itemDefs.js';
import {step} from '../src/sim.js';
import {stepAct} from '../src/agents/abilities.js';
import {SPECIES} from '../src/data/species.js';
import {CREATURES} from '../src/data/balance/creatures.js';
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
  for (const o of w.agents) o.dead = true; w.agents = []; w.fx = [];
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.fire[i] = 0; }
  w.nav.dirty('trees'); w.campaign.S.kind = 'night'; w.campaign.alarm = w.tick; w.campaign.spawned = true;
  return w;
};
// one of the species against three armed people of the caravan, the brains playing it; → what it did
function bout(id, tries = 3) {
  const did = {acts: {}, held: 0, under: 0, rusted: 0, numbed: 0};
  for (let i = 0; i < tries; i++) {
    const w = field(), b = createAgent(w, id, 'raiders', 30, 30);
    const men = [0, 1, 2].map(k => { const m = createAgent(w, 'human', 'colony', 36 + k * 0.8, 29 + k); m.equip.right = newItem(k ? 'sword' : 'spear'); m.equip.body = newItem('chainmail'); recalcGear(m); m.hp = m.maxHp * 3; return m; });
    w.campaign.foeObjs = [b];
    const iron0 = men.reduce((s, m) => s + (m.equip.right?.dur || 0), 0);
    for (let r = 0; r < i * 5; r++) w.rngs.combat();
    for (let g = 0; g < 900 && !b.dead; g++) {
      step(w);
      if (men.some(m => m.held)) did.held++;
      if (b.under) did.under++;
      if (men.some(m => m.numbFree > w.tick)) did.numbed++;
    }
    for (const [k, v] of Object.entries(w.chronicle.acts || {})) did.acts[k] = (did.acts[k] || 0) + v;
    did.rusted += iron0 - men.reduce((s, m) => s + (m.equip.right?.dur || 0), 0);
  }
  return did;
}
const expect = [
  ['owlbear', d => d.acts.roar > 0, 'совомед ревёт и бросается'],
  ['ankheg', d => d.under > 0 && (d.acts.burrow > 0) && (d.acts.acidJet > 0 || d.held > 0), 'анхег выныривает из-под земли, хватает или плюёт кислотой'],
  ['constrictor', d => d.held > 0, 'удав хватает и душит'],
  ['crawler', d => d.numbed > 0, 'падальщик сковывает'],
  ['rustbeast', d => d.acts.rust > 0 && d.rusted > 0, 'ржавник ржавит железо'],
  ['cobra', d => d.acts.venomSpit > 0, 'кобра плюётся ядом'],
  ['dragon', d => d.acts.fireBreath > 0, 'дракон дышит огнём'],
  ['manticore', d => d.acts.spikes > 0, 'мантикора мечет шипы'],
  ['wyvern', d => d.acts.sting > 0, 'виверна жалит'],
  ['spider', d => d.acts.webShot > 0, 'паук бросает паутину'],
  ['toad', d => d.held > 0, 'жаба хватает языком'],
  ['stoneworm', d => d.acts.burrow > 0, 'каменный червь выходит из-под земли'],
];
for (const [id, f, what] of expect) { const d = bout(id); ok(f(d), what, JSON.stringify(d)); }

// ── a rust eats the iron, not the bone; an acid eats any thing (a few wears a touch, never the thing at once)
{
  const w = field(), r = createAgent(w, 'rustbeast', 'raiders', 30, 30), m = createAgent(w, 'human', 'colony', 31, 30);
  m.equip.right = newItem('sword'); m.equip.left = null; m.equip.body = newItem('hardleather'); recalcGear(m); m.think = 1e9; r.think = 1e9; m.mods.dodge = 0; m.special.A = 0;
  const sw = m.equip.right.dur, bo = m.equip.body.dur; r.task = {id: 'maul', target: m};
  for (let g = 0; g < 80 && !(w.chronicle.acts?.rust); g++) { w.tick++; stepAct(w, r); }
  ok(m.equip.right.dur < sw && m.equip.body.dur === bo && m.equip.right.dur > 0, 'ржа ест железный меч, костяной доспех цел', `меч ${sw} → ${m.equip.right.dur}, доспех ${bo} → ${m.equip.body.dur}`);
}

// ── the bodies: the expert's centres
{
  const mid = (id, L) => { const r = CREATURES[id].special[L]; return (r[0] + r[1]) / 2; };
  const card = (id, s) => 'SPECIAL'.split('').every((L, k) => Math.abs(mid(id, L) - s[k]) <= 0.5);
  ok(card('dragon', [40, 14, 36, 10, 12, 10, 5]) && card('owlbear', [16, 10, 15, 2, 2, 7, 5]) && card('scorpion', [9, 8, 10, 0, 1, 7, 5]) && card('griffin', [15, 13, 13, 3, 4, 11, 5]),
    'тела по записке эксперта: дракон 40/14/36/10/12/10/5, совомед, скорпион, грифон');
  ok(CREATURES.spider.special.C[1] === 0 && CREATURES.cobra.special.C[1] === 0 && CREATURES.dragon.special.L[0] === 5 && CREATURES.dragon.special.L[1] === 5, 'нулевая Харизма — точно 0; Удача дракона — точно 5');
  ok(SPECIES.get('dragon').speed === 0.12 && SPECIES.get('scorpion').hp === 1.8, 'дракон на земле 0,12; скорпион тяжелее (hp 1,8)');
}

if (fails) { console.log(`\nbestiary-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nbestiary-check: ok');

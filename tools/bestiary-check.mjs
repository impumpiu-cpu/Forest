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
import {canSee, darkness} from '../src/agents/combat.js';
import {SPECIES} from '../src/data/species.js';
import {CREATURES} from '../src/data/balance/creatures.js';
import {CAMP} from '../src/data/camp.js';
import {T} from '../src/data/terrain.js';
import {SPECIES_PATH} from '../src/data/paths.js';
import {scentReach} from '../src/data/tongues.js';
import {TAINT} from '../src/data/afflictions.js';
import {SPRITES} from '../src/art/sprites.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base)), cap = capitals(base)[0];
const field = () => {
  const a = loadAtlas(JSON.parse(frozen)), K = newCampaign(a, cap.town, {mode: 'local'});
  const w = openCamp(campSetup(a, K, {kind: 'night', foe: {kind: 'bandits', strength: companyStrength(a, K) / CAMP.foe.unit}, dayIn: K.dayIn}));
  for (const o of w.agents) o.dead = true; w.agents = []; w.fx = []; w.carcasses = [];   // (no meal left about to call a beast off the bout)
  for (let i = 0; i < w.w * w.h; i++) { w.grid.terr[i] = T.GRASS; w.grid.fire[i] = 0; }
  w.nav.dirty('trees'); w.campaign.S.kind = 'night'; w.campaign.alarm = w.tick; w.campaign.spawned = true;
  return w;
};
// one of the species against three armed people of the caravan, the brains playing it; → what it did
function bout(id, tries = 3) {
  const did = {acts: {}, held: 0, under: 0, rusted: 0, numbed: 0, taint: 0};
  for (let i = 0; i < tries; i++) {
    const w = field(), b = createAgent(w, id, 'raiders', 30, 30);
    const men = [0, 1, 2].map(k => { const m = createAgent(w, 'human', 'colony', 36 + k * 0.8, 29 + k); m.equip.right = newItem(k ? 'sword' : 'spear'); m.equip.body = newItem('chainmail'); recalcGear(m); m.hp = m.maxHp * 3; return m; });
    if (b.needs) b.needs.food = 0;   // (a hungry one: what it does in a fight is the question, not whether three armed men scare it off — that rolls with the world's dice)
    w.campaign.foeObjs = [b];
    const iron0 = men.reduce((s, m) => s + (m.equip.right?.dur || 0), 0);
    for (let r = 0; r < i * 5; r++) w.rngs.combat();
    for (let g = 0; g < 900 && !b.dead; g++) {
      step(w);
      if (men.some(m => m.held)) did.held++;
      if (b.under) did.under++;
      if (men.some(m => m.numbFree > w.tick)) did.numbed++;
      did.kin = Math.max(did.kin || 0, w.agents.filter(o => !o.dead && o.species === id).length);   // (a slime split under the blade: plan З-12)
      if (men.some(m => m.taint > 0)) did.taint++;
      if (w.agents.some(o => !Number.isFinite(o.x) || !Number.isFinite(o.y) || (o.dodge && !Number.isFinite(o.dodge.x + o.dodge.y)))) did.lost = (did.lost || 0) + 1;   // (a step out of a shape must lead somewhere)
    }
    for (const [k, v] of Object.entries(w.chronicle.acts || {})) did.acts[k] = (did.acts[k] || 0) + v;
    did.rusted += iron0 - men.reduce((s, m) => s + (m.equip.right?.dur || 0), 0);
  }
  return did;
}
let lost = 0;
const expect = [
  ['owlbear', d => d.acts.roar > 0, 'совомед ревёт и бросается'],
  ['ankheg', d => d.under > 0 && (d.acts.burrow > 0) && (d.acts.acidJet > 0 || d.held > 0), 'анхег выныривает из-под земли, хватает или плюёт кислотой'],
  ['constrictor', d => d.held > 0, 'удав хватает и душит'],
  ['crawler', d => d.numbed > 0, 'падальщик сковывает'],
  ['rustbeast', d => d.acts.rust > 0 && d.rusted > 0, 'ржавник ржавит железо'],
  // the answers' kinds (plan З-12)
  ['slime', d => d.kin > 1, 'малый слизень делится под клинком'],
  ['ochrejelly', d => d.held > 0 || d.kin > 1, 'охряной студень хватает или делится'],
  ['fleshgolem', d => d.held > 0, 'мясной голем хватает'],
  ['corpseflies', d => d.taint > 0, 'трупные мухи разносят гниль'],
  ['cobra', d => d.acts.venomSpit > 0, 'кобра плюётся ядом'],
  ['dragon', d => d.acts.fireBreath > 0, 'дракон дышит огнём'],
  ['manticore', d => d.acts.spikes > 0, 'мантикора мечет шипы'],
  ['wyvern', d => d.acts.sting > 0, 'виверна жалит'],
  ['spider', d => d.acts.webShot > 0, 'паук бросает паутину'],
  ['toad', d => d.held > 0, 'жаба хватает языком'],
  ['stoneworm', d => d.acts.burrow > 0, 'каменный червь выходит из-под земли'],
  ['bulette', d => d.acts.leap > 0, 'панцирница прыгает на врага издали'],
  ['hookhorror', d => d.held > 0, 'крюкастый ужас хватает крюками'],
  ['cyclops', d => d.acts.rockThrow > 0, 'циклоп швыряет валуны'],
];
for (const [id, f, what] of expect) { const was = TAINT.perHit; if (id === 'corpseflies') TAINT.perHit = 1;   // (the rot is shut by default: opened for the flies' bout)
  const d = bout(id); TAINT.perHit = was; lost += d.lost || 0; delete d.lost; ok(f(d), what, JSON.stringify(d)); }
ok(!lost, 'шаг из-под удара всегда ведёт в точку карты (линия, конус, круг)', String(lost));

// ── a rust eats the iron, not the bone; an acid eats any thing (a few wears a touch, never the thing at once)
{
  const w = field(), r = createAgent(w, 'rustbeast', 'raiders', 30, 30), m = createAgent(w, 'human', 'colony', 31, 30);
  m.equip.right = newItem('sword'); m.equip.left = null; m.equip.body = newItem('hardleather'); recalcGear(m); m.think = 1e9; r.think = 1e9; m.mods.dodge = 0; m.special.A = 0;
  const sw = m.equip.right.dur, bo = m.equip.body.dur; r.task = {id: 'maul', target: m};
  for (let g = 0; g < 80 && !(w.chronicle.acts?.rust); g++) { w.tick++; stepAct(w, r); }
  ok(m.equip.right.dur < sw && m.equip.body.dur === bo && m.equip.right.dur > 0, 'ржа ест железный меч, костяной доспех цел', `меч ${sw} → ${m.equip.right.dur}, доспех ${bo} → ${m.equip.body.dur}`);
}

// ── echolocation: a hook horror hears one creeping in the dark; a leap lands where it aimed and knocks those about it down
{
  const w = field(), h = createAgent(w, 'hookhorror', 'raiders', 30, 30), m = createAgent(w, 'human', 'colony', 38, 30), g = createAgent(w, 'goblin', 'raiders', 30, 31);
  m.sneaking = true;
  ok(canSee(w, h, m) && !canSee(w, g, m) && darkness(w, h) === 1, 'эхолокация: ужас слышит крадущегося в восьми клетках и видит в темноте; гоблин — нет');
  const w2 = field(), b = createAgent(w2, 'bulette', 'raiders', 30, 30), t = createAgent(w2, 'human', 'colony', 35, 30), u = createAgent(w2, 'human', 'colony', 35.6, 30.6);
  b.think = t.think = u.think = 1e9; b.under = false; b.surfaced = w2.tick; b.task = {id: 'maul', target: t}; t.mods.dodge = 0; u.mods.dodge = 0; t.special.A = 0; u.special.A = 0;
  const h0 = t.hp; let landed = false;
  for (let k = 0; k < 60 && !landed; k++) { w2.tick++; stepAct(w2, b); if (w2.chronicle.acts?.leap) landed = true; }
  ok(landed && Math.hypot(b.x - 35, b.y - 30) < 1 && t.hp < h0 && (t.stunned?.until > w2.tick || u.stunned?.until > w2.tick), 'прыжок: панцирница приземлилась на цель, задела и сбила с ног', `x ${b.x.toFixed(1)}, −${(h0 - t.hp).toFixed(2)}`);
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

// the answers' kinds (plan З-12): each lives somewhere, carries its answer, has a picture and a path to level 9
{
  const NEW = {slime: ['jelly', 'split'], greyslime: ['jelly', 'split', 'acidJet'], ochrejelly: ['jelly', 'split', 'grab', 'swallow'],
    hornets: ['swarm', 'sting'], midges: ['swarm'], fireants: ['swarm', 'venom'], corpseflies: ['swarm'],
    wolverine: ['finishWeak'], porcupine: ['quills'], fleshgolem: ['grab', 'swallow']};
  const bad = Object.entries(NEW).filter(([id, ps]) => { const sp = SPECIES.get(id), own = (sp?.perks || []).map(p => p.id);
    return !sp || !ps.every(p => own.includes(p)) || !SPECIES_PATH[id] || !Object.keys(SPRITES).some(k => k.endsWith(`/${id}`) || k === id) || (id !== 'fleshgolem' && !Object.keys(sp.habitat || {}).length); });
  const golem = SPECIES.get('fleshgolem');
  ok(!bad.length && scentReach('wolverine') > 0 && SPECIES.get('midges').drinks > 0 && SPECIES.get('corpseflies').rotCarrier
    && golem.undead && CREATURES.fleshgolem.resist.blunt < 1 && CREATURES.fleshgolem.resist.slash > 1,
    'новые виды З-12: слизни, рои, росомаха, дикобраз, мясной голем — с ответами, ареалом, картинкой и путём', bad.map(([id]) => id).join(', '));
}

if (fails) { console.log(`\nbestiary-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nbestiary-check: ok');

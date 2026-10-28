// The elves on the local map and in the campaign (docs/WORLD.md «Асимметрия народов»): metal is taboo to them, they make
// bows without a hunters' lodge from what string there is, weave their own armour, grow a thorn hedge instead of a
// palisade, are sheltered in the wood, quarry slowly and farm well. `npm run elves`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
import {newItem, outfit, def, mayTake} from '../src/agents/equipment.js';
import {eligible, putUp} from '../src/settlement/buildings.js';
import {recomputeMods} from '../src/settlement/mods.js';
import {recomputeZone} from '../src/settlement/zone.js';
import {raceMayCraft, anyoneCan} from '../src/settlement/crafting.js';
import {RECIPES} from '../src/data/recipes.js';
import {ITEMS} from '../src/data/items.js';
import {MATERIALS} from '../src/data/balance/materials.js';
import {roleKit, COMBAT_ROLES} from '../src/data/roles.js';
import {RETINUE} from '../src/data/campaign.js';
import {butcher} from '../src/agents/carcass.js';
import {speedOf, thornedBy} from '../src/agents/movement.js';
import {stepEffects} from '../src/agents/body.js';
import {forestGuard} from '../src/agents/combat.js';
import {workRate} from '../src/agents/jobRunners.js';
import {BY_CODE} from '../src/data/terrain.js';
import {mulberry} from '../src/core/rng.js';
import {trySummon, sylvanPool, isSummoner} from '../src/agents/summon.js';
import {summoned} from '../src/agents/behaviours/summoned.js';
import {SPECIES} from '../src/data/species.js';
import {SUMMON} from '../src/data/roles.js';
import {sideStrength, strengthOf} from '../src/agents/strength.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const game = () => { const w = newGame({...DEFAULT_CFG, seed: 'elves', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'}); w.agents = []; return w; };
const metalOf = id => { const d = ITEMS.get(id.split(/[+@~$]/)[0]); return d && MATERIALS[d.material]?.class.includes('metal') ? d.material : null; };

// metal: an elf does not take it from the armoury, a band of elves carries none, the caravan's elves set out with none
{
  const w = game(), cx = w.w / 2, cy = w.h / 2, elf = createAgent(w, 'elf', 'colony', cx, cy);
  elf.equip.right = null; elf.equip.left = null;
  w.armory = [newItem('sword'), newItem('ironspear'), newItem('spear')];
  outfit(w, elf);
  const held = [elf.equip.right, elf.equip.left].filter(Boolean).map(it => it.type);
  check('эльф не берёт со склада железо: меч и железное копьё остаются, берёт костяное копьё', held.includes('spear') && !held.some(t => metalOf(t) && metalOf(t) !== 'silver'), `взял: ${held.join(', ') || 'ничего'}`);
  const r = mulberry(7); let bad = [], n = 0;
  for (let k = 0; k < 300; k++) for (const role of COMBAT_ROLES.ids()) { for (const id of roleKit('elf', role, r, 9)) { n++; const m = metalOf(id); if (m && m !== 'silver' && m !== 'mithril') bad.push(id); } }
  check('отряды эльфов: ни одной вещи из бронзы, железа или стали', !bad.length, bad.length ? [...new Set(bad)].join(', ') : `${n} вещей`);
  const kit = RETINUE.elves.knightGear.flat();
  check('караван: эльфы берут лук, серебро; не берут меч и арбалет; стражи выходят без металла', mayTake('elf', 'bow') && mayTake('elf', 'silverknife') && !mayTake('elf', 'sword') && !mayTake('elf', 'crossbow') && mayTake('human', 'sword') && kit.every(id => mayTake('elf', id)), kit.join(', '));
}

// bows without a lodge, of any string; a plain bow of a single stave; the woven armour; only an elf makes them
{
  const w = game(), elf = createAgent(w, 'elf', 'colony', 30, 30), human = createAgent(w, 'human', 'colony', 31, 30);
  const ids = ['bowLeather', 'bowSinew', 'bowFiber', 'bowStave', 'wicker'];
  const okElf = ids.filter(id => raceMayCraft(w, elf, RECIPES.get(id))), okHuman = ids.filter(id => raceMayCraft(w, human, RECIPES.get(id)));
  const noLodge = ids.slice(0, 4).every(id => !RECIPES.get(id).needs), plain = ITEMS.get('selfbow'), bow = ITEMS.get('bow'), wicker = ITEMS.get('wicker');
  check('эльфийские луки — без охотничьего навеса, из кожи, жил или волокна; простой лук слабее; плетёный доспех; человеку не даются',
    okElf.length === 5 && !okHuman.length && noLodge && plain.ranged.dmg < bow.ranged.dmg && wicker.armor > 0.2, `эльф ${okElf.length}, человек ${okHuman.length}, простой ${plain.ranged.dmg} < лук ${bow.ranged.dmg}, плетёнка ${wicker.armor}`);
  w.agents = w.agents.filter(a => a !== elf);
  check('людское поселение не ставит заказ на эльфийский лук: его некому сделать', !anyoneCan(w, RECIPES.get('bowSinew')) && anyoneCan(w, RECIPES.get('bow')));
  w.carcasses = []; const got = butcher(w, {yields: {meat: 2, hide: 2, bone: 1}, food: 1, t: 0});
  check('с туши вместе со шкурой снимают жилы', got.sinew === 2, JSON.stringify(got));
}

// the thorn hedge: an elven colony grows it and no palisade; a human one the other way; it slows and tears a stranger
{
  const w = game(), cx = Math.floor(w.w / 2), cy = Math.floor(w.h / 2);
  for (let k = 0; k < 3; k++) createAgent(w, 'elf', 'colony', cx + k, cy);
  putUp(w, 'quarry'); recomputeMods(w); recomputeZone(w);
  const elfHedge = eligible(w, 'thornhedge'), elfPal = eligible(w, 'palisade');
  const hedge = putUp(w, 'thornhedge'); recomputeMods(w); recomputeZone(w);
  const wolf = createAgent(w, 'wolf', 'wild', w.camp?.x ?? cx, w.camp?.y ?? cy);
  const torn = thornedBy(w, wolf), fast = (() => { const m = w.mods.add.thorns; w.mods.add.thorns = 0; const v = speedOf(w, wolf); w.mods.add.thorns = m; return v; })(), slow = speedOf(w, wolf);
  const hp0 = wolf.hp; for (let k = 0; k < 100; k++) stepEffects(w, wolf);
  check('эльфы растят колючую изгородь, а частокол не ставят; чужой в зоне идёт медленнее и ранится', elfHedge && !elfPal && !!hedge && torn && slow < fast * 0.7 && wolf.hp < hp0,
    `изгородь ${elfHedge}, частокол ${elfPal}, шаг ${slow.toFixed(2)} из ${fast.toFixed(2)}, здоровье ${hp0.toFixed(2)} → ${wolf.hp.toFixed(2)}`);
  const h = game(); for (let k = 0; k < 3; k++) createAgent(h, 'human', 'colony', cx + k, cy);
  putUp(h, 'quarry'); recomputeMods(h);
  check('люди ставят частокол, а изгородь не растят', eligible(h, 'palisade') && !eligible(h, 'thornhedge'));
}

// the wood shelters them; stone they take slowly, the field answers them
{
  const w = game(), elf = createAgent(w, 'elf', 'colony', 10, 10);
  let wood = -1, open = -1;
  for (let i = 0; i < w.w * w.h && (wood < 0 || open < 0); i++) { const k = BY_CODE[w.grid.terr[i]]?.kind; if (k === 'wood' && wood < 0) wood = i; if (k === 'ground' && open < 0) open = i; }
  const at = i => { elf.x = i % w.w + 0.5; elf.y = Math.floor(i / w.w) + 0.5; return forestGuard(w, elf); };
  const inWood = wood >= 0 ? at(wood) : null, inOpen = at(open);
  const human = createAgent(w, 'human', 'colony', elf.x, elf.y); human.x = elf.x; human.y = elf.y;
  check('в лесу удар по эльфу слабее на пятую часть, на открытом — как обычно, человеку лес не помогает', inWood === 0.8 && inOpen === 1 && (wood < 0 || (() => { human.x = wood % w.w + 0.5; human.y = Math.floor(wood / w.w) + 0.5; return forestGuard(w, human) === 1; })()),
    `лес ${inWood}, поле ${inOpen}`);
  const pace = job => { const s = elf.species, a = workRate(w, elf, job); elf.species = 'human'; const b = workRate(w, elf, job); elf.species = s; return a / b; };
  check('эльф добывает камень вдвое медленнее, а в поле работает на четверть быстрее', Math.abs(pace('mine') - 0.5) < 1e-9 && Math.abs(pace('farm') - 1.25) < 1e-9, `камень ×${pace('mine')}, поле ×${pace('farm')}`);
}

// the caller of beasts: once a fight a quarter of its side's strength in forest beasts that live here; they fight the
// caller's foes, then go back to the wood; a while later it may call again
{
  const w = game(); w.region = {...w.region, biomes: {forest: 0.7, taiga: 0.3}};
  const cx = Math.floor(w.w / 2), cy = Math.floor(w.h / 2), elves = [0, 1, 2, 3].map(k => createAgent(w, 'elf', 'colony', cx + k, cy));
  const caller = elves[0], foe = createAgent(w, 'human', 'raiders', cx + 6, cy);
  const pool = sylvanPool(w).map(([id]) => id), share = elves.filter(e => isSummoner(w, e)).length;
  const came = trySummon(w, caller, foe), again = trySummon(w, caller, foe);
  const worth = came.reduce((s, b) => s + strengthOf(b), 0), side = sideStrength(elves);
  const want = came.length ? summoned.want(w, came[0]) : null;
  check('призыватель: лесные звери, что живут здесь, на четверть силы своих, на стороне колонии; второй раз в том же бою — нет',
    came.length > 0 && came.every(b => SPECIES.get(b.species).sylvan && pool.includes(b.species) && b.faction === 'allies' && b.brain === 'summoned') && worth <= side * SUMMON.share * 1.6 && !again.length && want?.[0]?.[0]?.id === 'fight' && want[0][0].target === foe,
    `пришли ${came.map(b => b.species).join(', ')}; сила ${worth.toFixed(0)} из ${side.toFixed(0)} своих; из этих четырёх эльфов призыватели — ${share}`);
  foe.dead = true; w.agents = w.agents.filter(o => o !== foe);
  w.tick += SUMMON.quiet + 1;
  const after = came.length ? summoned.want(w, came[0]) : null;
  w.tick += SUMMON.cooldown;
  const foe2 = createAgent(w, 'human', 'raiders', cx + 6, cy), next = trySummon(w, caller, foe2);
  check('бой кончился — звери уходят в лес; в следующем бою призыватель зовёт снова', after?.[0]?.[0]?.id === 'leave' && next.length > 0, `после боя: ${after?.[0]?.[0]?.id}, снова пришли ${next.length}`);
  const r = mulberry(3); let n = 0, all = 0;
  for (let k = 0; k < 400; k++) { const e = createAgent(w, 'elf', 'colony', 5, 5); all++; if (isSummoner(w, e)) n++; e.dead = true; }
  check('призывателей среди эльфов около доли расы', Math.abs(n / all - SPECIES.get('elf').summons) < 0.06, `${n} из ${all}`);
}

if (fail.length) process.exit(1);

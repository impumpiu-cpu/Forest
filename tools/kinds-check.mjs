// Materials of a kind and the races' rules (data/kinds.js, settlement/kinds.js; docs/BALANCE.md):
// the stock remembers what its wood and stone are, burns the worst and makes the best, a wooden piece is of its wood,
// the elves are the masters of the sacred tree, a race's «nomake» and «taboo» hold, steel is there. Part of `npm test`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent} from '../src/agents/agent.js';
import {def, newItem, outfit, dirtyFor, gearText} from '../src/agents/equipment.js';
import {landMix, kindsOf, takeKind, mayExtract} from '../src/settlement/kinds.js';
import {raceMayCraft} from '../src/settlement/crafting.js';
import {RECIPES} from '../src/data/recipes.js';
import {RACE_MATERIALS, WOODS} from '../src/data/kinds.js';
import {ITEMS} from '../src/data/items.js';
import {saveWorld, loadWorld} from '../src/world/save.js';
import {offers} from '../src/campaign/town.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const game = () => { const w = newGame({...DEFAULT_CFG, seed: 'kinds', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'}); w.agents = []; return w; };

// the land gives its trees and its rock
const w = game();
w.region = {...w.region, biomes: {forest: 0.7, taiga: 0.3}, rock: 'granite'};
const wm = landMix(w, 'wood'), sm = landMix(w, 'stone');
check('земля даёт свои деревья и свою породу', wm.oak > 0 && wm.pine > 0 && !wm.ironwood && sm.granite === 1, Object.keys(wm).join(', '));
w.stock.wood = 40; w.kinds = {}; w.kindsTurn = {};
const mix = kindsOf(w, 'wood');
check('склад помнит, из чего его древесина', Object.keys(mix).length >= 3 && Math.abs(Object.values(mix).reduce((s, v) => s + v, 0) - 40) < 1e-6, Object.entries(mix).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
// the worst burns, the best is made
w.kinds.wood = {oak: 5, spruce: 5}; w.stock.wood = 10;
const burnt = takeKind(w, 'wood', 3, 'burn'), made = takeKind(w, 'wood', 3, 'make');
check('на растопку — худшее, на изделие — лучшее', burnt === 'spruce' && made === 'oak' && Math.abs(w.stock.wood - 4) < 1e-6, `горит ${burnt}, в работу ${made}`);
// the sacred tree: an elf makes of it as of steel, a human takes oak before it
w.kinds.wood = {oak: 5, holywood: 5}; w.stock.wood = 10;
const forElf = takeKind(w, 'wood', 1, 'make', 'elf'), forHuman = takeKind(w, 'wood', 1, 'make', 'human');
const holy = def({type: 'club', of: 'holywood', master: true}), plainHoly = def({type: 'club', of: 'holywood'}), oak = def({type: 'club', of: 'oak'}), pine = def({type: 'club', of: 'pine'});
check('святое дерево: эльф берёт его, человек — дуб; у мастера оно крепче стали, у прочих — как ясень', forElf === 'holywood' && forHuman === 'oak' && holy.melee.dmg > oak.melee.dmg && plainHoly.melee.dmg < oak.melee.dmg && holy.dur > def({type: 'club'}).dur * 2.5,
  `палица: сосна ${pine.melee.dmg.toFixed(2)}, дуб ${oak.melee.dmg.toFixed(2)}, святое (не мастер) ${plainHoly.melee.dmg.toFixed(2)}, святое (мастер) ${holy.melee.dmg.toFixed(2)}`);
const steel = ITEMS.get('steelsword'), iron = ITEMS.get('sword'), ironwood = WOODS.get('ironwood'), steelWood = WOODS.get('holywood');
check('сталь есть: крепче железа; железное дерево чуть слабее железа, святое — чуть сильнее стали', steel && steel.melee.dmg > iron.melee.dmg && ironwood.dmg < 1.27 && steelWood.dmg >= 1.45 && steelWood.dur > 2.6,
  `меч: железо ${iron.melee.dmg}, сталь ${steel.melee.dmg}`);
// nomake: the race neither gets nor makes it, but takes up what others made — «dirty»; taboo: it does not touch it
const keep = JSON.parse(JSON.stringify(RACE_MATERIALS));
RACE_MATERIALS.human = {oak: 'nomake', birch: 'nomake', pine: 'nomake', spruce: 'nomake', ash: 'nomake', larch: 'nomake', ironwood: 'nomake', holywood: 'nomake', iron: 'taboo'};
const h = createAgent(w, 'human', 'colony', 30.5, 30.5);
w.kinds.wood = {oak: 10}; w.stock.wood = 10;
const club = RECIPES.get('club');
const canMake = raceMayCraft(w, h, club), canChop = mayExtract(w, 'human', 'chop');
h.equip.right = null; w.armory = [newItem('club', {of: 'oak'}), newItem('ironmace')]; outfit(w, h);
const took = h.equip.right ? def(h.equip.right) : null;
check('«не делает»: не рубит и не мастерит, но берёт сделанное другими — грязное; «не касается»: не берёт вовсе', !canMake && !canChop && took?.material === 'wood' && dirtyFor(h, h.equip.right) && /грязн/.test(gearText(h)) && !w.armory.every(it => it.type !== 'ironmace'),
  `мастерит ${canMake}, рубит ${canChop}, взял: ${took?.label}`);
for (const k of Object.keys(RACE_MATERIALS)) delete RACE_MATERIALS[k];
Object.assign(RACE_MATERIALS, keep);
// a building of its stone; the ledger is saved with the game
w.kinds.stone = {granite: 30}; w.stock.stone = 30;
const s0 = takeKind(w, 'stone', 18, 'make');
const back = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
check('камень постройки и состав склада сохраняются с игрой', s0 === 'granite' && JSON.stringify(back.kinds) === JSON.stringify(w.kinds));
// the towns: a metal only where its realm works it — a building that opens it stands in one of its towns
// (data/townBuildings.js `metals`); the elves' grove towns sell bows of the sacred tree
const isIron = o => o.kind === 'item' && ITEMS.get(o.id.split(/[+@~$]/)[0]).material === 'iron';
const elfTown = {id: 'e1', people: 'elves', built: ['armory'], tier: 2, realm: 'r1', alive: true};
const world = {realms: [{id: 'r1', people: 'elves'}], towns: [elfTown]};
const noIron = offers(elfTown, world).filter(isIron).length;
const humanTown = {id: 'h1', people: 'humans', built: ['armory'], tier: 2, realm: 'r2', alive: true}, forgeTown = {id: 'h2', people: 'humans', built: ['forge'], tier: 1, realm: 'r2', alive: true};
const world2 = {realms: [{id: 'r2', people: 'humans'}], towns: [humanTown, forgeTown]};
const withIron = offers(humanTown, world2).filter(isIron).length;
const elfBow = offers({people: 'elves', built: ['bowyer', 'sacredgrove'], tier: 1, realm: null}).find(o => o.id.startsWith('bow'));
check('рынок: железо — только если кузня стоит где-то в державе; эльфы у священной рощи продают луки из святого дерева', noIron === 0 && withIron > 0 && /holywood!/.test(elfBow?.id || ''), `без кузни ${noIron}, с кузней в соседнем городе ${withIron}, лук ${elfBow?.id}`);

if (fail.length) process.exit(1);

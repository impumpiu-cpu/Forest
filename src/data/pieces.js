// The pieces of terrain of a camp's map (world/pieces.js; plan claude/terrain-pieces-plan.md): as the terrain of a
// wargame — the map stays random, but a few pieces fall on it by rules of their own. A piece is a stamp: a mask of
// characters, each a kind of cell (LEGEND), turned and mirrored at random; its stone walls crumble a share at random
// (`decay`), so two chapels are never quite alike. A piece is laid where its ground suits it, never on the camp, on the
// stakes' ring or across the water; whatever could be walked to from the camp before it was laid still can be (a wall
// gets a breach).
//
// Layers (who decides that a piece is on the map):
//   scatter — the land's small things, by its biomes: a windfall, boulders, a glade, a stone circle, a hunter's lodge
//   land    — what the world says is here (seam/cell.js `lore`): ruins of a burnt village, a graveyard on rotten ground,
//             barrows of an old battle, the signs of a lair near, a mill on a river
//   road    — laid after the roads: a waystone, a broken cart; on an ambush a barricade across the road
//   heart   — the middle of a scene (SCENES): a crypt, a stockade, a beast's den, a ruined keep, a rift; its anchor `A` is
//             where the guards or the boss stand when the caravan storms the place
//
// Mask characters (a blank leaves the land as it was):
//   ,  clear ground (the wood is cut, the bog dry)   _  flagstones or boards     #  stone wall     o  column
//   |  palisade or plank wall                         :  rubble                   =  fallen trunk   x  barricade
//   +  gravestones                                    %  bones                    *  web            ^  rock
//   "  baked ground of a rift                         T  wood
//   A / a  the anchor, on flagstones / on clear ground;  $ / s  a cache, on flagstones / on clear ground
//
// A cache (`$`, `s`) is there with `cache` of a chance (rolled once per piece); what it holds — PIECE_FINDS[finds].
export const LEGEND = {
  ',': 'clear', '_': 'flags', '#': 'wall', 'o': 'column', '|': 'palisade', ':': 'rubble', '=': 'log', 'x': 'barricade',
  '+': 'graves', '%': 'bones', '*': 'web', '^': 'rock', '"': 'scorch', 'T': 'forest',
  'A': 'flags', 'a': 'clear', '$': 'flags', 's': 'clear',
};
// what a crumbled cell becomes: a stone wall or a column — rubble; a palisade — a gap; a gravestone — sunk into the grass
export const DECAY = {wall: 'rubble', column: 'rubble', palisade: 'clear', graves: 'clear'};

// the biomes a piece of the scatter keeps to (data/biomes.js ids; null — any land)
const WOOD = ['forest', 'taiga', 'jungle', 'foothills', 'meadow', 'swamp'];
const OPEN = ['meadow', 'steppe', 'savanna', 'desert', 'tundra', 'highlands', 'foothills', 'barrows'];

export const PIECES = [
  // ── scatter
  {id: 'windfall', label: 'бурелом', layer: 'scatter', biomes: WOOD, weight: 3, size: 'small',
    mask: ['==,   ',
           ',===, ',
           '  ,===',
           ' ,,=, ']},
  {id: 'fallenTree', label: 'упавшее дерево', layer: 'scatter', biomes: WOOD, weight: 3, size: 'small',
    mask: ['  ,    ',
           '======,',
           '   ,= ']},
  {id: 'boulders', label: 'валуны', layer: 'scatter', biomes: null, weight: 2, size: 'small',
    mask: ['^^, ',
           '^^^:',
           ' :^ ']},
  {id: 'glade', label: 'поляна', layer: 'scatter', biomes: WOOD, weight: 2, size: 'small', cache: 0.15, finds: 'lost',
    mask: ['  ,,,  ',
           ' ,,,,, ',
           ',,,s,,,',
           ' ,,,,, ',
           '  ,,,  ']},
  {id: 'stoneCircle', label: 'каменный круг', layer: 'scatter', biomes: OPEN, weight: 1, size: 'mid', cache: 0.35, finds: 'shrine',
    mask: [' ,o,o, ',
           'o,,,,,o',
           ',,,_,,,',
           'o,_s_,o',
           ',,,_,,,',
           'o,,,,,o',
           ' ,o,o, ']},
  {id: 'oldCamp', label: 'старое кострище', layer: 'scatter', biomes: null, weight: 2, size: 'small', cache: 0.3, finds: 'lost',
    mask: [' %,, ',
           ',,s,=',
           ' ,,, ']},
  {id: 'hunterLodge', label: 'охотничья заимка', layer: 'scatter', biomes: WOOD, weight: 1, size: 'mid', cache: 0.5, finds: 'lodge',
    mask: ['||||  ',
           '|_s|  ',
           '|__,, ',
           '||||  ']},
  {id: 'hutRuin', label: 'развалины избы', layer: 'scatter', biomes: null, weight: 1, size: 'mid', decay: 0.3, cache: 0.35, finds: 'ruin',
    mask: ['#####',
           '#_:_#',
           '#_$_,',
           '##:##']},
  // ── land: what the world says is here (seam/cell.js lore)
  {id: 'hamletRuin', label: 'руины деревни', layer: 'land', lore: 'ruin', weight: 3, size: 'big', decay: 0.3, cache: 0.8, finds: 'ruin',
    mask: ['#####,,,,#####',
           '#___#,,,,#___#',
           '#_$_:,,,,:___#',
           '##:##,,,,##:##',
           ',,,,,,,,,,,,,,',
           ',,,:,,%,,,,,,,',
           '#####,,,,,####',
           '#___:,,,,,#__#',
           '#___#,,,,,:_$#',
           '#####,,,,,####']},
  {id: 'chapelRuin', label: 'разрушенная часовня', layer: 'land', lore: 'ruin', weight: 2, size: 'mid', decay: 0.35, cache: 0.6, finds: 'shrine',
    mask: ['#########',
           '#_______#',
           '#__o_o__#',
           '____$____',
           '#__o_o__#',
           '#_______#',
           '###___###']},
  {id: 'graveyard', label: 'погост', layer: 'land', lore: 'graves', weight: 3, size: 'mid', decay: 0.25, cache: 0.5, finds: 'grave',
    mask: ['|||||,,|||||',
           '|,+,+,,+,+,|',
           '|,,,,,,,,,,|',
           '|,+,+,,+,+,|',
           '|,,,,__,,,,|',
           '|,+,+_s_+,+|',
           '||||||||||||']},
  {id: 'barrows', label: 'курганы', layer: 'land', lore: 'battle', weight: 2, size: 'mid', cache: 0.5, finds: 'grave',
    mask: ['  +,+  ',
           ' +^^^+ ',
           ',%^^^%,',
           ' +,s,+ ',
           '  %,%  ']},
  {id: 'battlefield', label: 'старое поле боя', layer: 'land', lore: 'battle', weight: 2, size: 'mid', cache: 0.6, finds: 'battle',
    mask: ['x,,%,,,x',
           ',%,,,=,,',
           ',,x,s,%,',
           '%,,,,,x,',
           ',x,%,,,,']},
  {id: 'denMouth', label: 'звериная нора', layer: 'land', lore: 'beasts', weight: 3, size: 'small', cache: 0.4, finds: 'den',
    mask: [' ^^^ ',
           '^^%^^',
           '^%s%^',
           ' %,% ',
           '  %  ']},
  {id: 'webs', label: 'паутина', layer: 'land', lore: 'spiders', weight: 3, size: 'small', cache: 0.35, finds: 'den',
    mask: ['* *,',
           '***,',
           ',**s',
           ' ,* ']},
  {id: 'totems', label: 'тотемы', layer: 'land', lore: 'tribe', weight: 3, size: 'small', cache: 0.3, finds: 'battle',
    mask: ['o,%,o',
           ',%,%,',
           '%,s,%',
           ',%,%,',
           'o,%,o']},
  {id: 'rotGraves', label: 'разрытые могилы', layer: 'land', lore: 'rot', weight: 3, size: 'small', cache: 0.35, finds: 'grave',
    mask: ['+%+,',
           ',+%+',
           '+,s%',
           ',%+,']},
  // a mill by the river: its wheel in the water beside it (placed within `nearWater` of a river or a lake)
  {id: 'mill', label: 'заброшенная мельница', layer: 'land', lore: 'river', nearWater: 2, weight: 3, size: 'mid', decay: 0.15, cache: 0.6, finds: 'mill',
    mask: ['|||||',
           '|_o_|',
           '|_$_,',
           '|___|',
           '|||||']},
  // ── road: laid after the roads, beside one
  {id: 'waystone', label: 'придорожный камень', layer: 'road', nearRoad: 2, weight: 2, size: 'small', cache: 0.3, finds: 'shrine',
    mask: [' o ',
           'o_o',
           ' s ']},
  {id: 'brokenCart', label: 'брошенная повозка', layer: 'road', nearRoad: 2, weight: 2, size: 'small', cache: 0.7, finds: 'cart',
    mask: ['x, ',
           'sx=']},
  // ── the hearts of the scenes (SCENES)
  {id: 'crypt', label: 'склеп', layer: 'heart', decay: 0.12, cache: 1, finds: 'hoard',
    mask: ['  ,,,,,,,,,  ',
           ' ,#########, ',
           ' ,#___o___#, ',
           ' ,#_o___o_#, ',
           ' ,#___A___#, ',
           ' ,#_o_$_o_#, ',
           ' ,#___o___#, ',
           ' ,####_####, ',
           '  ,+,,,,,+,  ']},
  {id: 'stockade', label: 'острог', layer: 'heart', decay: 0.1, cache: 1, finds: 'hoard',
    mask: [' ,,,,,,,,,,,,, ',
           ',||||||,||||||,',
           ',|,,,,,,,,,,,|,',
           ',|,x,,,,,,,x,|,',
           ',|,,,%,,,%,,,|,',
           ',,,,,,,a,,,,,,,',
           ',|,,,%,,s,%,,|,',
           ',|,x,,,,,,,x,|,',
           ',|,,,,,,,,,,,|,',
           ',||||||,||||||,',
           ' ,,,,,,,,,,,,, ']},
  {id: 'beastDen', label: 'логово', layer: 'heart', cache: 1, finds: 'hoard',
    mask: ['   ^^^^^   ',
           '  ^^%%%^^  ',
           ' ^^%,,,%^^ ',
           ' ^%,,a,,%^ ',
           ' ^%,%s%,%^ ',
           '  %,,,,,%  ',
           '   %,,,%   ',
           '    ,,,    ']},
  {id: 'spiderNest', label: 'паучье гнездо', layer: 'heart', cache: 1, finds: 'hoard',
    mask: ['  **^^^**  ',
           ' **%%%%%** ',
           '**%,,,,,%**',
           '*%,,,a,,,%*',
           '*%,,%s%,,%*',
           ' **,,,,,** ',
           '  *,,,,,*  ']},
  {id: 'keepRuin', label: 'руины крепости', layer: 'heart', decay: 0.3, cache: 1, finds: 'hoard',
    mask: ['###########',
           '#____o____#',
           '#_o_____o_#',
           '#____A____#',
           '#_o__$__o_#',
           '#_________#',
           '#####_#####']},
  {id: 'riftHeart', label: 'разлом', layer: 'heart', cache: 1, finds: 'hoard',
    mask: [' """"""" ',
           '""^"""^""',
           '"""""""""',
           '""""a""""',
           '"^""s""^"',
           '"""""""""',
           ' """"""" ']},
  // ── the small things of the scenes, strewn over the whole map
  {id: 'gravesRow', label: 'ряд надгробий', layer: 'scene', size: 'small', decay: 0.3,
    mask: ['+,+,+',
           ',,,,,',
           '+,+,+']},
  {id: 'brokenColumns', label: 'обломки колонн', layer: 'scene', size: 'small', decay: 0.35,
    mask: ['o,: ',
           ',:,o',
           ' o:,']},
  {id: 'rubbleHeap', label: 'груда камня', layer: 'scene', size: 'small', decay: 0.5,
    mask: [':#: ',
           '::#:',
           ' ,: ']},
  {id: 'barricadeLine', label: 'баррикада', layer: 'scene', size: 'small',
    mask: ['xxx,xx']},
  {id: 'barricadeCorner', label: 'баррикада', layer: 'scene', size: 'small',
    mask: ['xxx',
           'x, ',
           'x  ']},
  {id: 'bonesField', label: 'кости', layer: 'scene', size: 'small',
    mask: ['%,% ',
           ',%%,',
           ' %,%']},
  {id: 'scorchPatch', label: 'спёкшаяся земля', layer: 'scene', size: 'small',
    mask: [' "" ',
           '"^""',
           '""" ']},
  {id: 'webPatch', label: 'паутина', layer: 'scene', size: 'small',
    mask: ['* *',
           '***',
           ' * ']},
];

// The scenes: a fight with a boss or the storm of a guarded place is played on a map laid out for it whole. The heart
// stands `far` cells from the camp, toward the side that has room for it; the strewn pieces lie anywhere (`scatter`:
// [piece id, how many]); `clear` — the share of the wood cut down (an old fight, a place people kept). The side of the
// foe picks the scene (campaign/land.js sides: the foe's kind, its lair's kind)
export const SCENES = {
  necropolis: {label: 'погост', heart: 'crypt', clear: 0.5, scatter: [['gravesRow', 7], ['brokenColumns', 5], ['bonesField', 3]]},
  warcamp:    {label: 'острог', heart: 'stockade', clear: 0.45, scatter: [['barricadeLine', 5], ['barricadeCorner', 4], ['bonesField', 2], ['windfall', 2]]},
  den:        {label: 'логово', heart: 'beastDen', clear: 0.2, scatter: [['bonesField', 6], ['windfall', 4], ['boulders', 3]]},
  nest:       {label: 'паучье гнездо', heart: 'spiderNest', clear: 0.1, scatter: [['webPatch', 8], ['bonesField', 4], ['fallenTree', 3]]},
  keep:       {label: 'руины крепости', heart: 'keepRuin', clear: 0.5, scatter: [['brokenColumns', 7], ['rubbleHeap', 5], ['barricadeLine', 3]]},
  rift:       {label: 'разлом', heart: 'riftHeart', clear: 0.6, scatter: [['scorchPatch', 8], ['boulders', 3], ['brokenColumns', 3]]},
};
// which scene, by the foe: its kind (data/campaign.js FOES) or its lair's kind (data/lairs.js), the beast or band it brings
export const SCENE_OF = {
  undead: 'necropolis', wights: 'necropolis', ghouls: 'necropolis', necromancer: 'necropolis', vampire: 'necropolis',
  tribe: 'warcamp', raiders: 'warcamp', bandits: 'warcamp', army: 'warcamp', goblins: 'warcamp', gnolls: 'warcamp', ogres: 'warcamp',
  trolls: 'warcamp', swamptrolls: 'warcamp', icetrolls: 'warcamp', giants: 'warcamp', orcs: 'warcamp',
  beasts: 'den', wolves: 'den', lair: 'den', varg: 'den', griffin: 'den', wyvern: 'den', drake: 'den', dragon: 'den', stoneworm: 'den', bat: 'den',
  spider: 'nest',
  cultists: 'keep', rift: 'rift', demon: 'rift',
};

// How many pieces a map gets (world/pieces.js): the scatter by the map's size (per 1000 cells), the land's own pieces
// at most `land`, each with its chance when the world's mark is there; how far from the camp they stay (`keep` cells
// from the fire: the camp's clearing and the stakes' ring, CAMP_WORKS.stakes.radius); a scene's heart `far` from it;
// a piece that would fall more than `wet` of it on water, rock or a road is not laid there
export const PIECE_RULES = {
  scatter: {per1000: 1.1, min: 2, max: 5, roll: [0.7, 0.6]},   // × (roll[0] + roll[1] × U(0,1))
  land: {max: 2, chance: {ruin: 0.9, graves: 0.8, battle: 0.7, beasts: 0.6, spiders: 0.8, tribe: 0.6, rot: 0.7, river: 0.55}},
  road: {chance: 0.6},
  keep: 9, heartKeep: 13, far: [14, 20], edge: 1, wet: 0.15, rocky: 0.25, tries: 60,   // (`rocky` — at most this share of it on rock)
  // an ambush on the march: a barricade and felled trunks across the road `at` cells from the caravan
  // (a disc of `half` + `round` cells about a road cell; off the road a cell is a barricade with `barricade` of a chance, else a trunk)
  ambush: {at: [7, 13], half: 2, round: 0.3, barricade: 0.5},
};

// What a cache holds (as the morning finds of data/campaign.js FINDS): gold — [lo, hi] in coins; goods — {resource:
// [chance, lo, hi]}; items — {item id: chance}; the text — one of them, {things} for what was found. `boss` of a scene's
// heart is the guards' hoard
export const PIECE_FINDS = {
  lost:   {gold: [0, 4], goods: {rope: [0.4, 1, 2], herbs: [0.4, 1, 3]}, items: {bronzedagger: 0.15},
    text: ['В траве у старого кострища — чья-то потерянная сума: {things}.', 'Под корнями кто-то припрятал узелок: {things}.']},
  shrine: {gold: [2, 9], goods: {wax: [0.5, 1, 2], potion: [0.25, 1, 1], herbs: [0.4, 1, 2]}, items: {silverknife: 0.08},
    text: ['У камня — подношения путников, давно никем не тронутые: {things}.', 'Под плитой святилища нашёлся тайник: {things}.']},
  lodge:  {gold: [0, 5], goods: {hide: [0.6, 1, 3], rope: [0.5, 1, 3], furs: [0.3, 1, 2]}, items: {bronzehatchet: 0.2, bow: 0.1},
    text: ['В заимке охотника, брошенной ещё с осени: {things}.', 'На полке в охотничьей избушке: {things}.']},
  ruin:   {gold: [3, 14], goods: {potion: [0.25, 1, 2], rope: [0.3, 1, 2], silverBar: [0.08, 1, 1]}, items: {bronzesword: 0.12, ironaxe: 0.1, bronzeshield: 0.12},
    text: ['Среди развалин под рухнувшей балкой — забытый тайник: {things}.', 'В обгоревшем подполе отыскали: {things}.']},
  grave:  {gold: [4, 16], goods: {silverNative: [0.15, 1, 2], gems: [0.1, 1, 1], bone: [0.4, 1, 3]}, items: {bronzesword: 0.12, bronzemail: 0.06, ironspear: 0.1},
    text: ['В разрытой могиле — то, что мертвецу больше не понадобится: {things}.', 'Под надгробьем лежало погребальное добро: {things}.']},
  battle: {gold: [1, 8], goods: {potion: [0.15, 1, 1], arrows: [0.3, 4, 10]}, items: {shield: 0.25, bronzespear: 0.2, ironspear: 0.08, jerkin: 0.1},
    text: ['Старое поле боя всё ещё отдаёт железо. Подобрали: {things}.', 'Среди костей — брошенное оружие и кошель убитого: {things}.']},
  den:    {gold: [1, 10], goods: {hide: [0.4, 1, 2], bone: [0.6, 2, 4]}, items: {bronzespear: 0.2, irondagger: 0.08, hardleather: 0.06},
    text: ['В норе под костями — остатки чужого снаряжения: {things}.', 'Логово всё в костях: кто-то из охотников не вернулся отсюда. Среди костей: {things}.']},
  mill:   {gold: [1, 8], goods: {flour: [0.5, 2, 5], rope: [0.4, 1, 3], planks: [0.3, 1, 2]}, items: {axe: 0.15, ironhatchet: 0.06},
    text: ['На заброшенной мельнице, за жерновом: {things}.', 'Мельник уходил второпях — в чулане осталось: {things}.']},
  cart:   {gold: [1, 6], goods: {rope: [0.5, 2, 4], leather: [0.5, 1, 3], potion: [0.15, 1, 1]}, items: {bronzeaxe: 0.15},
    text: ['На обочине — брошенная повозка со сломанной осью; в ней нашлось: {things}.', 'Опрокинутая телега, груз растащен не весь: {things}.']},
  hoard:  {gold: [12, 40], goods: {potion: [0.5, 1, 2], silverBar: [0.3, 1, 2], gems: [0.25, 1, 2], goldNugget: [0.15, 1, 1]}, items: {sword: 0.2, ironshield: 0.15, chainmail: 0.1, steeldagger: 0.08, lamellar: 0.08},
    text: ['В самом логове врага — его добро: {things}.', 'Там, где стояла стража, сыскалась казна: {things}.']},
};

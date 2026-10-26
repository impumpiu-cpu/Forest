// Lairs: where the monsters of the wild era live. A lair is a point on the world map with an owner
// species, a strength 0..1, an age and a territory; the monsters' density around it is held up by it
// (atlas/lairs.js). Later the lairs are where heroes go and where local maps find their monsters.
//   species:  the owner (data/bestiary.js)
//   label:    what the lair is called in the chronicle (labelAcc: in the accusative, if it differs);
//             g: the gender of its noun, for the verbs around it;  from: «out of» it, before its name
//   radius:   territory, world cells of a 192-cell-high world (scaled with the map)
//   ground:   where it can be: heights (high steep ground), volcano, caves (limestone or basalt),
//             deep (forest, jungle, swamp), open (tundra, taiga, steppe)
//   density:  lairs per 10 000 suitable land cells at the start;  max: at most this many in a world
//   breed:    chance a year that a strong lair sends out a brood to found a new one
//   rivals:   lair kinds it fights when territories touch
//   flies:    the owners fly: their broods go on the wing (atlas/parties.js)
//   dragon:   the dragon's lair — no prey, no broods, no raids of the usual kind; it flies out itself
//   nouns:    the second word of a lair's name, [word, gender]; adjectives come from NAME_ADJ
//
// Tribes (`tribe: true`) are lairs with a thinking owner (data/races.js): a camp of goblins, gnolls,
// ogres, trolls or giants. They have no towns, roads or trade; the camp lives off its land (the
// race's `home` over the territory, not prey), is crowded out where the peoples settle, sends out
// broods, and raids the towns of the peoples its race dislikes (data/relations.js) — on the backs
// of its beasts, if it has any (`riders`, `on`: «верхом на варгах»). The peoples fight a camp as
// they fight a lair. TRIBE_RAID below sets the raids.
//   ground 'home':  stands where the race's home suits the biome at least TRIBE_HOME
//   needsAny:       and in addition on this kind of ground (as `ground` of a beast lair), if given
//   gen:            the owners in the genitive («набег гоблинов»);  riders / on: their beasts and «on» them
//   sub:            the race's sub-race (data/races.js peoples) whose home the camp stands on, and whose name it bears
//   undead lairs:   rotAt, at, spawn (see ROT below); might — the owner's SPECIAL power × this (a necromancer
//                   leads a horde);  raidVerb — what they did to a town;  leads — who leads the raid;
//                   at 'town' — the lair sits in a mixed town and `drinks` that share of its people a year
//   fiend lairs:    ground 'rift' (a live volcano or a plate seam), no food: the rift stands as it is
import {Registry} from '../core/registry.js';

export const LAIRS = new Registry('lair');
LAIRS.registerAll([
  {id: 'griffin', species: 'griffin', flies: true, from: 'из гнезда', label: 'гнездо грифонов', g: 'n', color: [214, 170, 90], radius: 9, ground: 'heights', density: 25, max: 8, breed: 0.12, rivals: ['wyvern', 'drake'],
    nouns: [['гнездо', 'n'], ['утёс', 'm'], ['скала', 'f'], ['кручи', 'pl']]},
  {id: 'wyvern', species: 'wyvern', flies: true, from: 'из логова', label: 'логово виверны', g: 'n', color: [120, 150, 90], radius: 10, ground: 'heights', density: 18, max: 6, breed: 0.08, rivals: ['griffin', 'drake'],
    nouns: [['логово', 'n'], ['ущелье', 'n'], ['гора', 'f'], ['пик', 'm']]},
  {id: 'drake', species: 'drake', flies: true, from: 'из логова', label: 'логово дрейка', g: 'n', color: [220, 80, 50], radius: 12, ground: 'volcano', density: 80, max: 4, breed: 0.05, rivals: ['griffin', 'wyvern'],
    nouns: [['жерло', 'n'], ['кратер', 'm'], ['пепелище', 'n'], ['гора', 'f']]},
  // the dragon's lair: one or two in a world, ancient, at a volcano; it does not feed on prey and sends no
  // broods — the dragon sleeps for years and flies out (atlas/parties.js, data/parties.js DRAGON)
  {id: 'dragon', dragon: true, species: 'dragon', flies: true, from: 'из логова', label: 'логово дракона', g: 'n', color: [150, 30, 20], radius: 14, ground: 'volcano', density: 30, max: 2, breed: 0, rivals: [],
    nouns: [['жерло', 'n'], ['престол', 'm'], ['гора', 'f'], ['пещера', 'f']]},
  {id: 'spider', species: 'spider', from: 'из гнезда', label: 'паучье гнездо', g: 'n', color: [150, 110, 170], radius: 6, ground: 'deep', density: 14, max: 10, breed: 0.07, rivals: [],
    nouns: [['чаща', 'f'], ['паутинник', 'm'], ['дебри', 'pl'], ['лог', 'm']]},
  {id: 'stoneworm', species: 'stoneworm', from: 'из норы', label: 'нора каменного червя', labelAcc: 'нору каменного червя', g: 'f', color: [160, 140, 110], radius: 8, ground: 'caves', density: 10, max: 6, breed: 0.06, rivals: [],
    nouns: [['нора', 'f'], ['провал', 'm'], ['ход', 'm'], ['пустошь', 'f']]},
  {id: 'bat', species: 'bat', flies: true, from: 'из пещеры', label: 'пещера кровопийц', labelAcc: 'пещеру кровопийц', g: 'f', color: [120, 70, 90], radius: 6, ground: 'caves', density: 12, max: 8, breed: 0.08, rivals: [],
    nouns: [['пещера', 'f'], ['грот', 'm'], ['подземелье', 'n'], ['расселина', 'f']]},
  {id: 'varg', species: 'varg', from: 'из логова', label: 'логово варгов', g: 'n', color: [130, 130, 140], radius: 10, ground: 'open', density: 8, max: 8, breed: 0.08, rivals: [],
    nouns: [['логово', 'n'], ['падь', 'f'], ['урочище', 'n'], ['буреломы', 'pl']]},
  // ── tribes: camps of the thinking wild
  {id: 'goblins', tribe: true, gen: 'гоблинов', species: 'goblin', from: 'из нор', label: 'гоблинские норы', labelAcc: 'гоблинские норы', g: 'pl', color: [150, 180, 60], radius: 7, ground: 'home', needsAny: ['caves', 'heights'],
    density: 14, max: 10, breed: 0.14, rivals: [], riders: 'varg', on: 'на варгах',
    nouns: [['норы', 'pl'], ['щель', 'f'], ['яма', 'f'], ['нора', 'f']]},
  {id: 'gnolls', tribe: true, gen: 'гноллов', species: 'gnoll', from: 'из стана', label: 'стан гноллов', g: 'm', color: [190, 150, 70], radius: 9, ground: 'home',
    density: 9, max: 8, breed: 0.09, rivals: [], riders: 'hyena', on: 'с гиенами',
    nouns: [['стан', 'm'], ['кочевье', 'n'], ['курган', 'm'], ['балка', 'f']]},
  {id: 'ogres', tribe: true, gen: 'огров', species: 'ogre', from: 'из логова', label: 'логово огров', g: 'n', color: [160, 110, 90], radius: 8, ground: 'home',
    density: 5, max: 6, breed: 0.05, rivals: [], riders: null,
    nouns: [['логово', 'n'], ['пещера', 'f'], ['котёл', 'm'], ['холм', 'm']]},
  // trolls by sub-race (data/races.js peoples): each kind of troll its own ground
  {id: 'trolls', tribe: true, sub: 'forest', gen: 'лесных троллей', species: 'troll', from: 'из логова', label: 'логово лесных троллей', g: 'n', color: [90, 130, 110], radius: 8, ground: 'home',
    density: 5, max: 5, breed: 0.05, rivals: [], riders: null,
    nouns: [['логово', 'n'], ['мост', 'm'], ['бурелом', 'm'], ['валуны', 'pl']]},
  {id: 'swamptrolls', tribe: true, sub: 'swamp', gen: 'болотных троллей', species: 'troll', from: 'из логова', label: 'логово болотных троллей', g: 'n', color: [80, 110, 80], radius: 8, ground: 'home',
    density: 25, max: 4, breed: 0.05, rivals: [], riders: null,
    nouns: [['логово', 'n'], ['топь', 'f'], ['гать', 'f'], ['омут', 'm']]},
  {id: 'icetrolls', tribe: true, sub: 'ice', gen: 'ледяных троллей', species: 'troll', from: 'из логова', label: 'логово ледяных троллей', g: 'n', color: [150, 180, 200], radius: 9, ground: 'home',
    density: 4, max: 4, breed: 0.04, rivals: [], riders: null,
    nouns: [['логово', 'n'], ['ледник', 'm'], ['наст', 'm'], ['торосы', 'pl']]},
  // ── the dead
  {id: 'wights', undead: true, gen: 'костяков', species: 'skeleton', from: 'из кургана', label: 'курганник', g: 'm', color: [190, 190, 210], radius: 6, ground: 'rot', rotAt: 0.25, at: 'barrows',
    spawn: 0.3, max: 8, breed: 0.04, rivals: [], might: 1.8, raidVerb: 'разорили',
    nouns: [['курган', 'm'], ['могильник', 'm'], ['холм', 'm'], ['кости', 'pl']]},
  {id: 'ghouls', undead: true, gen: 'упырей', species: 'upyr', from: 'из гнезда', label: 'гнездо упырей', g: 'n', color: [150, 90, 120], radius: 6, ground: 'rot', rotAt: 0.2, at: 'ruins',
    spawn: 0.35, max: 8, breed: 0.05, rivals: [], might: 1.8, raidVerb: 'обескровили',
    nouns: [['гнездо', 'n'], ['пепелище', 'n'], ['подвал', 'm'], ['развалины', 'pl']]},
  {id: 'necromancer', undead: true, gen: 'мертвецов', species: 'necromancer', from: 'из башни', label: 'башня некроманта', labelAcc: 'башню некроманта', g: 'f', color: [120, 60, 160], radius: 10, ground: 'rot', rotAt: 0.5,
    spawn: 0.1, max: 3, breed: 0, rivals: [], might: 2.5, raidVerb: 'опустошили', leads: 'Некромант повёл мертвецов',
    nouns: [['башня', 'f'], ['склеп', 'm'], ['цитадель', 'f'], ['обитель', 'f']]},
  // a vampire settles in a mixed town — where strangers come and go, nobody counts the missing; the lair is the
  // town itself: it drinks the town, not its land, and the town's own folk root it out as they would a lair
  {id: 'vampire', undead: true, gen: 'вампира', species: 'vampire', from: 'из усадьбы', label: 'усадьба вампира', labelAcc: 'усадьбу вампира', g: 'f', color: [110, 30, 60], radius: 4, ground: 'rot', rotAt: 0.12, at: 'town',
    spawn: 0.12, max: 3, breed: 0, rivals: [], might: 1.5, drinks: 0.025, raidVerb: 'обескровили', leads: 'Вампир и его свита',
    nouns: [['усадьба', 'f'], ['дом', 'm'], ['башня', 'f'], ['подвал', 'm']]},
  // the rifts: the one magic left — demons come through where the earth is torn, at live volcanoes and the seams of
  // the plates; a rift does not eat, it just stands, and sends its demons at the nearest town now and then
  {id: 'rift', fiend: true, gen: 'демонов', species: 'demon', from: 'из разлома', label: 'разлом', g: 'm', color: [220, 40, 20], radius: 8, ground: 'rift',
    spawn: 0.03, max: 2, breed: 0, rivals: [], might: 2, raidVerb: 'выжгли', leads: 'Демоны',
    nouns: [['разлом', 'm'], ['жерло', 'n'], ['трещина', 'f'], ['пасть', 'f']]},
  {id: 'giants', tribe: true, gen: 'великанов', species: 'giant', from: 'из становища', label: 'становище великанов', g: 'n', color: [200, 200, 190], radius: 11, ground: 'home', needsAny: ['heights'],
    density: 10, max: 4, breed: 0.03, rivals: [], riders: null,
    nouns: [['становище', 'n'], ['престол', 'm'], ['скалы', 'pl'], ['перевал', 'm']]},
]);

// The rot of the dead and its lairs. The rot is a field on the beasts' coarse grid, 0..1
// (atlas/lairs.js stepRot): every season it seeps from the graves (`barrows`, the battlefields, the
// dead of burnt towns and raids, and a few barrows older than the chronicle), spreads to the
// neighbours and fades, faster in frost and in heat. Where it is thick enough the dead rise: the
// undead lairs (`undead: true`) are not placed with the wild but spawn through history, `spawn` a
// year per kind, on ground with rot at least `rotAt` (and `at`: 'barrows' — on the graves
// themselves, 'ruins' — by a burnt town). They live off the rot, not prey, and raid any town in
// reach; what they kill leaves graves, and the rot grows. The peoples fight them as they fight a
// lair. Vampires wait for the towns to have folk to hide among.
export const ROT = {seed: 0.08, diffuse: 0.08, decay: 0.02, frost: 0.04, heat: 0.03, ancient: [2, 5], ancientGraves: 0.7, ruinGraves: 0.6, raidGraves: 0.12,
  // the wards of a mage tower and a temple of the fallen: extra fading of the rot around the town (a season),
  // and how much stronger a town with a mage tower stands against the dead
  wardMage: 0.06, wardTemple: 0.03, wardMight: 1.8,
  // rats: the rot travels with the caravans — a town in rot at `ratsFrom` gives `rats` of it a season to every
  // town joined to it by road; `ratsHealth` — how much a town's health buildings keep them down
  ratsFrom: 0.4, rats: 0.03, ratsHealth: 0.5};

// a tribe's camp stands where its race's home suits the biome at least this much
export const TRIBE_HOME = 0.45;
// Raids of the tribes on the peoples' towns, from the autumn a camp is strong enough:
//   from:     strength a camp needs to go raiding;  chance: a year, per camp;  reach: cells (of a
//             192-cell-high world) to the town;  might: the camp's strength × its race's SPECIAL power ×
//             this, against the town's might (atlas/towns.js);  loss: the town's share lost when it
//             falls (× raidShare of its buildings);  loot: strength the camp gains on a win;
//             beaten: what is left of the camp's strength after a failed raid
export const TRIBE_RAID = {from: 0.6, chance: 0.1, reach: 30, might: 0.55, loss: 0.12, loot: 0.12, beaten: 0.7};
// Who goes on a lair's raid (atlas/lairs.js raidBand; docs/WORLD.md «Живность»): read from the fields about the lair
// (data/lairs.js LAIR_FIELD), not from the kind alone —
//   riders:  the tribe's beasts (`riders` of its kind: wargs, hyenas) ride with it where they live about the lair at least
//            this thick; they add ridersMight to its might
//   chance:  a second kind of the lair's land (another lair's monsters or tribe, a beast of prey) joins with this chance ×
//            its share of the density there (at least `at`); it adds might × its density (at most 1)
export const RAID_MIX = {at: 0.05, riders: 0.05, ridersMight: 0.25, chance: 0.5, might: 0.4};
// Raids for captives (the deed `captives`, atlas/deeds/captives.js; who goes: the species rows that list it — the goblins,
// gnolls and ogres' camps, the necromancer's tower, the orcs' realms). A camp's raid for captives is a tribe's raid
// (TRIBE_RAID: from, reach, might, beaten) that takes people instead of killing them:
//   chance:     a year, per camp, as TRIBE_RAID.chance is for a raid;  loss: the share of the town taken into captivity
//               (× raidShare of its buildings);  feed: strength the camp gains on a win (the captives' hands and flesh);
//               graves: × ROT.raidGraves — a few fall on the way to the ropes
//   keep:       the share of a lair's captives alive a year later (the rest die, are eaten, or are raised)
//   realm:      a realm's raid for captives (the orcs): the town's chance a year (as DIPLOMACY.raidChance is for a raid), the
//               share taken, and how much of it the raiding town grows by — slaves are people too; the rest are sold or die
//   freed:      a caravan that beats a lair's folk in its lands (campaign/fight.js) frees its captives: this many at most at
//               once, with this chance (the lair's captives are certain where a stranger's camp gives FREED.chance)
export const CAPTIVE_RAID = {chance: 0.08, loss: 0.08, feed: 0.1, graves: 0.5, keep: 0.75, realm: {chance: 0.1, loss: 0.08, grow: 0.5}, freed: {max: 2, chance: 0.9}};

// adjectives for lair names, by gender: m, f, n, pl
export const NAME_ADJ = [
  ['Чёрный', 'Чёрная', 'Чёрное', 'Чёрные'], ['Кровавый', 'Кровавая', 'Кровавое', 'Кровавые'], ['Гиблый', 'Гиблая', 'Гиблое', 'Гиблые'],
  ['Старый', 'Старая', 'Старое', 'Старые'], ['Седой', 'Седая', 'Седое', 'Седые'], ['Воющий', 'Воющая', 'Воющее', 'Воющие'],
  ['Костяной', 'Костяная', 'Костяное', 'Костяные'], ['Мёртвый', 'Мёртвая', 'Мёртвое', 'Мёртвые'], ['Дымный', 'Дымная', 'Дымное', 'Дымные'],
  ['Каменный', 'Каменная', 'Каменное', 'Каменные'], ['Гнилой', 'Гнилая', 'Гнилое', 'Гнилые'], ['Немой', 'Немая', 'Немое', 'Немые'],
  ['Волчий', 'Волчья', 'Волчье', 'Волчьи'], ['Ржавый', 'Ржавая', 'Ржавое', 'Ржавые'], ['Тёмный', 'Тёмная', 'Тёмное', 'Тёмные'],
  ['Проклятый', 'Проклятая', 'Проклятое', 'Проклятые'], ['Высокий', 'Высокая', 'Высокое', 'Высокие'], ['Змеиный', 'Змеиная', 'Змеиное', 'Змеиные'],
];
export const GENDER_INDEX = {m: 0, f: 1, n: 2, pl: 3};

// lairs this old (years) become «ancient» — once, with a line in the chronicle; an ancient lair may raise a leader
export const LAIR_AGE = {ancient: 30};
export const ANCIENT_YEARS = LAIR_AGE.ancient;   // the number as the code says it; what the game reads is LAIR_AGE

// Leaders of the old lairs (atlas/leaders.js, docs/WORLD.md «Главари логов»). An ancient lair (any kind but a dragon's,
// a vampire's manor and a calamity's boss's) may raise a named leader: a creature of its kind grown past its kind's
// limits, less than a calamity's boss. The leader turns the lair from a field into a thinker: it walks the world map as
// a party, as an army does, and each year picks a plan — a raid on a town, a brood led out to found a daughter lair, a
// weaker lair brought under its hand, a war on a rival lair. While it leads, the lair sends no raids or broods of its own.
//   chance  — a year, for an ancient lair with no leader;  heir — the same, the year after a leader died of age
//   max     — living leaders in the world at once
//   stats, add, cap — grown past its kind: + add on each of `stats` (a calamity's boss: CAL.boss.add 6–12)
//   life    — years it leads before age takes it, [lo, hi]
//   think   — the chance a year that it sets out at all;  plans — the weights of the plans it may pick
//   might   — its raids and fights: the lair's strength × its kind's power × this (a boss: CAL.boss.might 3), with luck
//             (luck[0] + luck[1] × a roll) on both sides
//   reach   — × the tribes' raid reach (TRIBE_RAID.reach): how far it goes
//   subdue  — a lair this many of its territories away at most, and `ratio` — how much weaker it must be to be taken
//   tribute — a year, the share of a vassal's strength its lord's lair takes (half of it lost to the vassal)
//   fall    — the chance it dies when its raid or its fight is beaten
//   young   — the strength of a daughter lair;  beat — what is left of a lair it beats (wiped out below `wiped`)
//   expand  — a brood is led out from a lair stronger than `from` while its kind has fewer than max × `crowd` lairs; the
//             mother lair keeps × `cost` of its strength;  beatenCost — what is left of its strength after a lost fight
//   beastRaid — × the weight of a raid for a beast's leader (it hunts the woods more than the towns)
//   camp    — a caravan in its lands: see below
export const LEADER = {chance: 0.08, heir: 0.5, max: 30, stats: ['S', 'E', 'A'], add: [2, 5], cap: 30, life: [20, 50],
  think: 0.25, plans: {raid: 0.7, expand: 0.6, subdue: 0.8, rival: 0.6}, might: 1.6, luck: [0.6, 0.8], reach: 1.5,
  subdue: {reach: 3, ratio: 1.3}, tribute: 0.04, fall: 0.25, young: 0.45, beat: 0.55, wiped: 0.12, beatenCost: 0.75, beastRaid: 0.35,
  expand: {from: 0.6, crowd: 1.5, cost: 0.8},
  // a caravan camping in a leader's lands (campaign/land.js dangers): × the chance its folk come at night, × their strength
  camp: {p: 1.6, strength: 1.3}};
// what a leader is called — its title and nickname — is in data/names.js (TITLE, NICK, PERSON[race].nick)

// The life of a lair on the world map (atlas/lairs.js stepLairs), a season at a time:
//   fed:      how well it ate: its prey against what the land could hold (at most fedMax; fedNone with no prey on the
//             map), demons and dragons always fiendFed, a vampire its town's people over vampirePop, the dead the
//             rot over rotAt × rotFeed, a tribe its land over tribeFeed — less `crowd` × the peoples crowding it
//   strength: + grow × (fed − need), − winter in winter, ± wobble/2; it dies below `dies`
//   brood:    in spring a lair stronger than breedAt and older than breedAge years may send a brood (its kind's `breed`
//             chance) while there are fewer than its kind's max × crowdMax (a boss's: × bossCrowd); the brood looks for
//             a spot in broodTries tries, costs the lair × broodCost of its strength and founds a lair of broodStart
//   rivals:   touching rivals fight with this chance a season; each side's strength × its kind's power × (luck[0] +
//             luck[1] × a roll); the loser × loser, the winner × winner; a loser below `routed` is gone
//   start:    a wild lair's strength at the dawn: start[0] + start[1] × a roll (a dragon's dragonStart); a lair that
//             comes through history (the dead, a rift) starts at spawnStart (a rift at fiendStart)
// The lairs' folk as fields (atlas/lairs.js; docs/WORLD.md «Живность»): the owners of the lairs — beasts with a habitat
// (wargs, griffins, spiders…) and the tribes (goblins, ogres, gnolls, trolls, giants: their K is their race's home over
// the land) — live as densities on the beasts' grid, like any beast; but a monster does not breed away from a lair. A lair
// is their source; away from the lairs they wander off (the beasts' diffusion) and dwindle:
//   source: a season, every living lair adds source × its strength × K × (1 − d/r) to its owners' density within its
//           territory r (never above cap × K by it)
//   fade:   a season, a lair's kind away from the lairs loses this share (no breeding without a lair)
//   pulse:  a new lair brings its own: the density about it is at least pulse × its strength × K × (1 − d/r)
//   brood:  a brood is a migration: where it settles it pours brood × K × (1 − d/r) of its kind
//   birth:  in spring, where the owners of a lair kind are this dense against K and no living lair stands within its
//           territory, they settle: a lair is born — at most `births` a year (× the world's scale²); only where the land
//           holds at least `landMin`, the densest first (± `jitter`)
//   own:    a brood founds a lair of its own kind; one born of the density or come into the wild (WILD) is drawn among
//           the kinds whose ground fits the spot, each with the chance of how thick its owners live there (a thinner kind
//           may take it too: the wild keeps its variety) — the wild's newcomers' own kind weighing `own` more
export const LAIR_FIELD = {source: 0.12, cap: 1, fade: 0.06, pulse: 0.7, brood: 0.5, birth: 0.7, births: 1.5, landMin: 0.05, jitter: 0.1, own: 0.6};

// The wild keeps its dangers (atlas/lairs.js spawnWild, docs/WORLD.md «Скрытые логова»). Once the peoples are in the
// world, each spring the wild gives new lairs — `perYear` on average a year (× the world's scale²) — of a kind below its max ×
// LAIR_LIFE.crowdMax (the kinds tried in a random order until one finds ground), on its ground, in the wild only — the backwoods between the towns: no people's land thicker than `land` and no
// living town within `gap` cells (of a 192-cell-high world; a settled world is people's land almost everywhere). They start at `start`. A lair born in the wild — these, and a brood that settles there — is
// HIDDEN: it lives, feeds, breeds and raids, but no realm can go against it (atlas/deeds/clearLair.js) until it is found:
//   raid:   a raid of it on a town shows the way back — beaten, with `raid[0]`, won, with `raid[1]`
//   settle: a living town stands within `settle` cells of it: the settlers stumble on it
//   scout:  the deed of the realms (atlas/deeds/scout.js): a season's `chance` (× `raided` for a realm whose town was
//           raided in the last `recent` years), a town of the realm sends trackers to a hidden lair within `reach` cells;
//           they find it with find[0] + find[1] × the town's lore (data/townBuildings.js) + find[2] × its step (tier)
//   the caravan of a campaign walking into its territory (campaign/march.js)
export const WILD = {perYear: 1.2, land: 0.7, gap: 10, start: 0.4, tries: 600, settle: 5,
  raid: [0.5, 0.25], scout: {chance: 0.15, raided: 2.5, recent: 3, reach: 40, find: [0.15, 0.5, 0.05]}};

export const LAIR_LIFE = {fedMax: 1.2, fedNone: 0.5, fiendFed: 0.55, vampirePop: 600, rotFeed: 1.2, tribeFeed: 0.6, crowd: 0.8,
  grow: 0.08, need: 0.45, winter: 0.03, wobble: 0.02, dies: 0.08,
  breedAt: 0.85, breedAge: 3, crowdMax: 1.5, bossCrowd: 3, broodTries: 60, broodCost: 0.75, broodStart: 0.35,
  rivals: 0.08, luck: [0.7, 0.6], loser: 0.4, winner: 0.9, routed: 0.12,
  start: [0.4, 0.5], dragonStart: 0.9, spawnStart: 0.35, fiendStart: 0.55};

// Potions (docs/RULES.md «Зелья»). What a potion does is a row of «Состояния» of kind `potion` (data/conditions.js):
// at once (it heals, it cures a state), for a while (mods, a resistance, holding the ground), or on the blade (so many
// blows poison what they strike). This table says what each potion is made of and where.
//
// POTIONS — one row per potion, its grades in order (the plain first, then the strong):
//   use    — when its bearer drinks it by itself (agents/potions.js): wounded — health below POTION.below; poisoned —
//            a venom is in the blood; fight — at the first blow of a fight; blade — rubbed on the weapon at the first blow.
//            A brew (`home`) is drunk out of the stock, not the belt (settlement/potions.js, POTION.home): cold — one
//            freezing; tired — one worn out on the night watch or in an alarm; mending — one hurt or with a grave wound;
//            captive — given to a captive set on running, at the evening council (it sleeps the night through); mark —
//            whoever does not bear its mark yet drinks it (an elixir: for life).
//            In the belt besides: fire — burnt by fire, or at the first blow against a fire-breather; dark — at night,
//            on the watch or at the first blow; throw — hurled at a foe from afar (agents/potions.js hurl). A poison and
//            a silver oil both go on the blade: the oil against what fears silver, the poison against the rest
//   home   — a brew of the stock (the settlement's, the caravan's cargo), never carried in a belt
//   stock  — how many the hut keeps brewing / the caravan keeps: {share, of: people | captives, want, march?} — while the
//            stock has fewer than share × that many (at least one), with the recipe's weight `want` (data/recipes.js);
//            the caravan keeps `march` × its people instead when given (a brew the whole caravan drinks at once)
//   grades — [{res, tier, at, cost, effect}]: the resource the potion is in the stock and the belt (data/resources.js
//            makes one row for each), the step of skill it takes (data/skills.js TIERS), where it is brewed — healerhut
//            (the settlement's hut and the caravan's: only plain grades of tier ≤ POTION.hutTier; brewed with medicine)
//            or alchemist (a town's laboratory: the strong grades, with alchemy; campaign/town.js), what it takes (a pot
//            always: POTION.pot), and the row of «Состояния» it gives
// A potion that leaves a mark for life (an elixir, later) is not drunk again by one who bears the mark.
//
// The belt (agents/potions.js): the healing potion has a slot of its own (a.potions, at most POTION.slot); any other —
// a strong healing one too — takes one of POTION.belt places (a.belt: the resources, one a place).
import {Registry} from '../core/registry.js';

export const POTION = {
  below: 0.15,     // drunk when health falls below this share of the whole, while still on one's feet
  slot: 3,         // healing potions carried at most
  belt: 2,         // places for the other potions
  herbs: 2,        // healing herbs a healing potion takes (the recipe)
  pot: 1,          // pots every potion is poured into (data/resources.js pots: the potter's work)
  hutTier: 2,      // the highest step a healer's hut brews: what is harder is the alchemist's
  hutPots: 4,      // the potter keeps this many pots for a settlement's healer's hut
  // the settlement's stock fills its people's slots and belts (settlement/potions.js): every `hand` ticks
  hand: 60,
  // a foe carries one with this chance (data/migrations.js raiders)
  foe: 0.03,
  // the caravan (campaign/march.js): a day of camp with the healer's hut in the camp gathers each herb with its chance
  // (× wooded in wooded land); they are brewed at once into potions while there is room for them
  camp: {find: {herbs: 0.35, wort: 0.2, sleepgrass: 0.12}, wooded: 2, keep: 10},   // (no more of a herb is gathered while the cargo has `keep`)
  // the brews of the stock (settlement/potions.js): drunk when the warmth need falls below `cold`, the rest need below
  // `tired` (on the night watch or in an alarm), health below `hurt` of the whole or with a grave wound (mending); given
  // to a captive whose will to run is at least `will`
  // to a captive whose will to run is at least `will`. On the world map a brew the caravan drinks at once is brewed in a
  // kettle: one serves `kettle` heads for the day (campaign/potions.js brewTheDay)
  home: {cold: 0.3, tired: 0.25, hurt: 0.6, will: 0.4, kettle: 4},
  // the cat's eye is drunk once the night is this deep (core/time.js nightness): on the watch, at the first blow
  dark: 0.5,
};

// what the foes' peoples carry in their belts (data/migrations.js raiders): by species, each potion with its chance per
// fighter with hands — the dark elves' poison for the blade, the orcs' bear's brew, the goblins' fire flasks
export const FOE_BELTS = {darkelf: {bladeVenom: 0.5}, orc: {bearBrew: 0.3}, goblin: {fireFlask: 0.12}};

export const POTIONS = new Registry('potion');
const P = POTION.pot;
POTIONS.registerAll([
  {id: 'heal', label: 'зелье лечения', use: 'wounded', note: 'пьётся само у края смерти', stock: {share: 0.5, of: 'people', want: 0.6},
    grades: [{res: 'potion', tier: 1, at: 'healerhut', cost: {herbs: POTION.herbs, pots: P}, effect: 'potHeal'},
             {res: 'potionStrong', tier: 2, at: 'alchemist', cost: {herbs: 3, honey: 1, pots: P}, effect: 'potHealStrong'}]},
  {id: 'antidote', label: 'противоядие', use: 'poisoned', note: 'пьётся, когда яд в крови', stock: {share: 0.34, of: 'people', want: 0.45},
    grades: [{res: 'antidote', tier: 1, at: 'healerhut', cost: {herbs: 1, slime: 1, pots: P}, effect: 'potAntidote'},
             {res: 'antidoteStrong', tier: 2, at: 'alchemist', cost: {herbs: 2, slime: 2, pots: P}, effect: 'potAntidoteStrong'}]},
  {id: 'bear', label: 'медвежья сила', use: 'fight', note: 'пьётся перед первым ударом боя', stock: {share: 0.34, of: 'people', want: 0.4},
    grades: [{res: 'bearBrew', tier: 2, at: 'healerhut', cost: {bile: 1, braga: 1, pots: P}, effect: 'potBear'},
             {res: 'bearBrewStrong', tier: 3, at: 'alchemist', cost: {bile: 2, braga: 1, honey: 1, pots: P}, effect: 'potBearStrong'}]},
  {id: 'venom', label: 'яд для клинка', use: 'blade', note: 'клинок натирают перед первым ударом боя', stock: {share: 0.25, of: 'people', want: 0.35},
    grades: [{res: 'bladeVenom', tier: 2, at: 'healerhut', cost: {venom: 1, wax: 1, pots: P}, effect: 'potVenom'},
             {res: 'bladeVenomStrong', tier: 3, at: 'alchemist', cost: {venom: 2, wax: 1, pots: P}, effect: 'potVenomStrong'}]},
  // silver oil: the blade bites what fears silver as a silvered one — the alchemist's only (silver is worked in a town)
  {id: 'silver', label: 'серебряное масло', use: 'blade', note: 'клинок натирают перед первым ударом по тому, кто боится серебра', stock: {share: 0.25, of: 'people', want: 0.3},
    grades: [{res: 'silverOil', tier: 2, at: 'alchemist', cost: {silverBar: 1, wax: 1, pots: P}, effect: 'potSilver'},
             {res: 'silverOilStrong', tier: 3, at: 'alchemist', cost: {silverBar: 2, wax: 1, pots: P}, effect: 'potSilverStrong'}]},
  {id: 'fireward', label: 'огнестойкость', use: 'fire', note: 'пьётся, когда жжёт огонь, и перед боем с огнедышащим', stock: {share: 0.2, of: 'people', want: 0.3},
    grades: [{res: 'firewardBrew', tier: 2, at: 'healerhut', cost: {slime: 2, herbs: 1, pots: P}, effect: 'potFireward'},
             {res: 'firewardBrewStrong', tier: 3, at: 'alchemist', cost: {gland: 1, slime: 1, pots: P}, effect: 'potFirewardStrong'}]},
  {id: 'light', label: 'лёгкий шаг', use: 'fight', note: 'пьётся перед первым ударом боя: шаг быстрее', stock: {share: 0.2, of: 'people', want: 0.3},
    grades: [{res: 'lightStep', tier: 2, at: 'healerhut', cost: {herbs: 2, wort: 1, pots: P}, effect: 'potLight'},
             {res: 'lightStepStrong', tier: 3, at: 'alchemist', cost: {herbs: 2, feathers: 1, pots: P}, effect: 'potLightStrong'}]},
  {id: 'cateye', label: 'кошачий глаз', use: 'dark', note: 'пьётся ночью: на посту и перед боем в темноте — видит во мраке', stock: {share: 0.2, of: 'people', want: 0.3},
    grades: [{res: 'catEye', tier: 2, at: 'healerhut', cost: {lynxEyes: 1, herbs: 1, pots: P}, effect: 'potCatEye'},
             {res: 'catEyeStrong', tier: 3, at: 'alchemist', cost: {lynxEyes: 2, wort: 1, pots: P}, effect: 'potCatEyeStrong'}]},
  {id: 'flask', label: 'зажигательная склянка', use: 'throw', note: 'бросают во врага издали: огонь по нему и рядом', stock: {share: 0.2, of: 'people', want: 0.25},
    grades: [{res: 'fireFlask', tier: 2, at: 'healerhut', cost: {braga: 1, wax: 1, pots: P}, effect: 'potFlask'},
             {res: 'fireFlaskStrong', tier: 3, at: 'alchemist', cost: {braga: 1, gland: 1, pots: P}, effect: 'potFlaskStrong'}]},
  // the brews: drunk out of the stock
  {id: 'warm', label: 'согревающий отвар', use: 'cold', home: true, note: 'пьют из запасов, когда зябнут', stock: {share: 0.34, of: 'people', want: 0.4, march: 1},
    grades: [{res: 'warmBrew', tier: 1, at: 'healerhut', cost: {wort: 2, pots: P}, effect: 'potWarm'},
             {res: 'warmBrewStrong', tier: 2, at: 'alchemist', cost: {wort: 3, herbs: 1, pots: P}, effect: 'potWarmStrong'}]},
  {id: 'vigor', label: 'бодрящий отвар', use: 'tired', home: true, note: 'пьют из запасов, когда валятся с ног на посту или в тревогу', stock: {share: 0.25, of: 'people', want: 0.3, march: 0.5},
    grades: [{res: 'vigorBrew', tier: 1, at: 'healerhut', cost: {wort: 1, herbs: 1, pots: P}, effect: 'potVigor'},
             {res: 'vigorBrewStrong', tier: 2, at: 'alchemist', cost: {wort: 1, herbs: 1, lynxEyes: 1, pots: P}, effect: 'potVigorStrong'}]},
  {id: 'mend', label: 'укрепляющий отвар', use: 'mending', home: true, note: 'пьют из запасов раненые: раны заживают быстрее', stock: {share: 0.25, of: 'people', want: 0.45},
    grades: [{res: 'mendBrew', tier: 1, at: 'healerhut', cost: {herbs: 1, bone: 1, pots: P}, effect: 'potMend'},
             {res: 'mendBrewStrong', tier: 2, at: 'alchemist', cost: {herbs: 2, bone: 1, wort: 1, pots: P}, effect: 'potMendStrong'}]},
  {id: 'sleep', label: 'сонный отвар', use: 'captive', home: true, note: 'дают пленному, что задумал бежать: спит всю ночь', stock: {share: 1, of: 'captives', want: 0.5},
    grades: [{res: 'sleepBrew', tier: 1, at: 'healerhut', cost: {sleepgrass: 1, pots: P}, effect: 'potSleep'},
             {res: 'sleepBrewStrong', tier: 2, at: 'alchemist', cost: {sleepgrass: 2, herbs: 1, pots: P}, effect: 'potSleepStrong'}]},
  // the elixir of tempering: a mark for life (never twice) — the alchemist's only, of one grade
  {id: 'temper', label: 'эликсир закалки', use: 'mark', home: true, note: 'пьют из запасов те, у кого нет метки «закалка»: навсегда', stock: {share: 0.25, of: 'people', want: 0.2},
    grades: [{res: 'temperElixir', tier: 3, at: 'alchemist', cost: {gland: 1, bile: 1, lynxEyes: 1, pots: P}, effect: 'potTemper'}]},
]);

// a potion's grade by its resource: {potion, grade, k} (k — 0 plain, 1 strong), or null
const byRes = new Map();
for (const p of POTIONS.all()) p.grades.forEach((g, k) => byRes.set(g.res, {potion: p, grade: g, k}));
export const potionOf = res => byRes.get(res) || null;
export const isPotion = res => byRes.has(res);
// every potion resource, the plain healing one first (it fills the slot of its own)
export const POTION_RES = [...byRes.keys()];
// what goes into a belt, in the order it is handed out: potion by potion as the table has them, the strong grade before
// the plain one; one of a kind in a belt (sameKind)
export const BELT_ORDER = POTIONS.all().filter(p => !p.home).flatMap(p => p.grades.map(g => g.res).filter(r => r !== 'potion').reverse());
// the brews of the stock, by their use: the grades, the strong first ({use: [res…]})
export const HOME_BY_USE = Object.fromEntries(POTIONS.all().filter(p => p.home).map(p => [p.use, p.grades.map(g => g.res).reverse()]));
export const HOME_RES = Object.values(HOME_BY_USE).flat();
export const sameKind = (a, b) => potionOf(a)?.potion === potionOf(b)?.potion;
// what a caravan keeps, neither sells nor leaves behind before other goods (campaign/town.js, campaign/baggage.js): the
// potions and everything any of them is made of
export const POTION_KEEP = new Set([...POTION_RES, ...POTIONS.all().flatMap(p => p.grades.flatMap(g => Object.keys(g.cost)))]);
// the grades a healer's hut brews (in the settlement and the caravan's camp)
export const hutGrades = () => POTIONS.all().flatMap(p => p.grades.filter(g => g.at === 'healerhut' && g.tier <= POTION.hutTier).map(g => ({potion: p, grade: g})));

// Fighting roles of a band (docs/BEHAVIOUR.md «Роли в отряде»). A band is made of roles, not of creatures with whatever
// came to hand: a role says what its fighter carries and where it stands; the species says which roles it may take.
//
// COMBAT_ROLES — one row per role:
//   hands  — what it holds: [[forms, weight], …], one set drawn. A form (spear, shield, bow — «Формы») becomes the piece
//            of that form the band's level allows (ROLE_TIERS below); a word that is no form is an item id as it is
//   body   — the class of its armour, ARMOUR below (none · light · medium · heavy)
//   back   — what it carries on its back (a quiver for a bow), forms or items as in `hands`
//   potions — healing potions in its belt (agents/potions.js)
//   noChores — never one of the band's looters or torch-bearers while another can be (agents/squad.js): a healer
//   squad  — what its band (agents/squad.js) makes of it: shooter — keeps back and shoots; front — goes in
//   place  — where it stands in the band's order: front (the first rank) · mid (behind it: a spear over a shoulder) ·
//            flank (round the side) · back (behind them all)
//   group  — линия · подвижные · дальний бой · поддержка (for the table)
//   blows  — × its blows of a kind ({blunt: 1.3}: the dwarven hammer-smith, agents/combat.js damage)
//   fireproof — fire and heat do not harm it (the forge-master: agents/body.js heatHarm)
//   mount  — the beast it rides (agents/mount.js; RIDE below): one fighter of two bodies
//   versus — × its blows on a kind of creature ({beast: 1.3, monster: 1.3}: the greenskins' beast-driver)
//   lead   — the war beasts of the land it brings into its band, [from, to] (data/raids.js: the beast-driver)
//   maxTier — the best metal its kit takes, whatever the band's level (0: bone, wood, hide — the beast-driver wears no iron)
//   frenzy — a wound throws it into a frenzy (FRENZY below: the berserker, agents/combat.js)
// The behaviours of a role and how a mind changes them (sentient · mindless) come with the next step.
//
// ROLE_MIX — the matrix «species × role»: the weight of each role a species may take (none — it may not), `best` — the
// highest tier of metal its people bring (goblins do not forge steel), `fixed` — a kit of its own instead of roles (a
// vampire, a necromancer). A species that carries things (tag `inventory`) and has no row takes the human row; a row
// with no weights brings nothing (a troll fights with its claws).
import {Registry} from '../core/registry.js';
import {ITEMS} from './items.js';
import {weighted, clamp} from '../core/util.js';
import {onEdit} from './schema/layer.js';
import {mayWield, mayUse, KIND_LAND} from './kinds.js';
import {MATERIALS} from './balance/materials.js';

export const COMBAT_ROLES = new Registry('combat role');

COMBAT_ROLES.registerAll([
  // ── the line
  {id: 'shield', group: 'линия', label: 'щитоносец', note: 'идёт первым, держит удар, закрывает щитом соседа от стрел',
    hands: [[['spear', 'shield'], 3], [['axe', 'shield'], 2], [['club', 'shield'], 1], [['mace', 'shield'], 1], [['sword', 'shield'], 1]],
    body: 'heavy', back: [], potions: 0, squad: 'front', place: 'front'},
  {id: 'spearman', group: 'линия', label: 'копейщик', note: 'длинное копьё из второго ряда, из-за плеча щитоносца',
    hands: [[['spear'], 3], [['spear', 'shield'], 1]], body: 'medium', back: [], potions: 0, squad: 'front', place: 'mid'},
  {id: 'cleaver', group: 'линия', label: 'рубака', note: 'двуручное оружие, мало брони: врезается, оглушает, проламывает строй',
    hands: [[['maul'], 2], [['warhammer'], 2], [['axe'], 1], [['sword'], 1]],
    body: 'light', back: [], potions: 0, squad: 'front', place: 'front'},
  // the dwarves' hammer-smith: a two-handed hammer and a smith's arm — its blunt blows land harder; the first rank
  {id: 'smith', group: 'линия', label: 'мастер-кузнец', note: 'молотобоец: двуручный молот, дробящий удар сильнее на треть, стоит в первом ряду',
    hands: [[['warhammer'], 3], [['maul'], 1]], body: 'heavy', back: [], potions: 0, squad: 'front', place: 'front', blows: {blunt: 1.3}},
  // the greenskins' riders: a warg under an orc, a giant spider under a goblin — one fighter of two bodies (RIDE)
  {id: 'wargrider', group: 'подвижные', label: 'наездник на варге', note: 'орк верхом на боевом варге: бьют оба сразу; убит варг — бьётся пешим, убит всадник — варг дерётся сам',
    hands: [[['spear', 'shield'], 2], [['axe', 'shield'], 1], [['javelin', 'shield'], 1]], body: 'medium', back: [], potions: 0, squad: 'front', place: 'flank', mount: 'varg'},
  {id: 'spiderrider', group: 'подвижные', label: 'наездник на пауке', note: 'гоблин верхом на гигантском пауке: бьют оба сразу; паук путает паутиной',
    hands: [[['spear'], 2], [['javelin'], 2], [['bow'], 1]], body: 'light', back: ['quiver'], potions: 0, squad: 'front', place: 'flank', mount: 'spider'},
  // the beast-driver of the fighting pits: a net and javelins, bone and hide; its blows bite beasts and monsters harder,
  // and it brings the war beasts of the land along
  {id: 'beastmaster', group: 'подвижные', label: 'загонщик', note: 'сеть и дротики, кость и кожа, железа не носит; бьёт зверей и чудовищ сильнее; водит с собой боевых зверей',
    hands: [[['net', 'javelin'], 3], [['net', 'spear'], 1]], body: 'light', back: [], potions: 0, squad: 'front', place: 'mid', versus: {beast: 1.3, monster: 1.3}, lead: [1, 2], maxTier: 0},
  // two weapons, no armour; a wound throws it into a frenzy, then it is spent (FRENZY)
  {id: 'berserker', group: 'линия', label: 'берсерк', note: 'два оружия, без брони; раненый впадает в бешенство: бьёт сильнее, быстрее, увёртливее, а после устаёт',
    hands: [[['axe', 'axe'], 3], [['hatchet', 'hatchet'], 1], [['sword', 'axe'], 1]], body: 'none', back: [], potions: 0, squad: 'front', place: 'front', frenzy: true},
  {id: 'brute', group: 'линия', label: 'громила', note: 'дубина в рост человека: огры, великаны',
    hands: [[['maul'], 1], [['club'], 2]], body: 'none', back: [], potions: 0, squad: 'front', place: 'front'},
  // ── the quick ones
  {id: 'cutthroat', group: 'подвижные', label: 'головорез', note: 'два кинжала или кинжал с топориком: крадётся, заходит с фланга и в спину, режет стрелков, знахарей, раненых',
    hands: [[['dagger', 'dagger'], 3], [['dagger', 'hatchet'], 2], [['hatchet', 'hatchet'], 1]], body: 'light', back: [], potions: 0, squad: 'front', place: 'flank'},
  {id: 'skirmisher', group: 'подвижные', label: 'застрельщик', note: 'дротики со щитом или праща: бьёт издали и отходит, метает вблизи',
    hands: [[['javelin', 'shield'], 3], [['sling'], 2], [['javelin', 'hatchet'], 1]], body: 'light', back: [], potions: 0, squad: 'shooter', place: 'mid'},
  {id: 'catcher', group: 'подвижные', label: 'ловчий', note: 'ловчая сеть и дубина: опутывает и вяжет живым — работорговцы',
    hands: [[['net', 'club'], 3], [['net', 'spear'], 1]], body: 'light', back: [], potions: 0, squad: 'front', place: 'mid'},
  // ── from afar
  {id: 'archer', group: 'дальний бой', label: 'стрелок', note: 'лук или арбалет за спиной щитоносцев',
    hands: [[['bow'], 3], [['crossbow'], 1]], body: 'light', back: ['quiver'], potions: 0, squad: 'shooter', place: 'back'},
  // the dwarves' forge-master: no weapon and no armour; breathes the forge's fire at a javelin's reach, and fire does not
  // take him
  {id: 'forgemaster', group: 'дальний бой', label: 'мастер горна', note: 'без оружия и брони: плюёт огнём на дальность метания, поджигает цель и землю под ней; огонь его не берёт',
    hands: [[['spitfire'], 1]], body: 'none', back: [], potions: 0, squad: 'shooter', place: 'mid', fireproof: true},
  // ── support
  // the elves' caller of beasts: keeps back with a staff; once in a fight calls the forest beasts (agents/summon.js)
  {id: 'summoner', group: 'поддержка', label: 'призыватель зверей', note: 'посох; раз за бой зовёт лесных зверей на подмогу',
    hands: [[['staff'], 1]], body: 'light', back: [], potions: 1, squad: 'front', place: 'back', noChores: true},
  {id: 'healer', group: 'поддержка', label: 'знахарь', note: 'посох и зелья: держится сзади, перевязывает своих',
    hands: [[['staff'], 1]], body: 'light', back: [], potions: 2, squad: 'front', place: 'back', noChores: true},
]);

// LINKS — the links a band is made of (data/raids.js `links`): the roles of one link in order, one fighter each. The
// band draws a link by its weight, fills its places one by one with a species of its own that may take the role (its
// weight in the band × its weight in «Роли видов»), and the next link after it while the budget lasts; the last may
// come short. The strongest of a link is its officer (agents/ranks.js).
export const LINKS = new Registry('link');
LINKS.registerAll([
  {id: 'wall',    label: 'стена щитов',  note: 'щиты впереди, копьё из-за плеча, луки сзади', roles: ['shield', 'shield', 'spearman', 'archer', 'archer']},
  {id: 'line',    label: 'строй',        note: 'всего понемногу: держат, колют, стреляют, режут', roles: ['shield', 'spearman', 'archer', 'cutthroat', 'skirmisher']},
  {id: 'raid',    label: 'налётчики',    note: 'быстрые: рубят, режут, метают, со знахарем', roles: ['cleaver', 'cutthroat', 'skirmisher', 'archer', 'healer']},
  {id: 'warband', label: 'ватага',       note: 'щит и тяжёлое оружие, дротики вслед', roles: ['shield', 'cleaver', 'cleaver', 'spearman', 'skirmisher']},
  {id: 'swarm',   label: 'рой',          note: 'праща, дротики, ножи: много и мелко', roles: ['skirmisher', 'skirmisher', 'cutthroat', 'cutthroat', 'archer']},
  {id: 'pack',    label: 'стая',         note: 'копья вперёд, рубака и сеть', roles: ['spearman', 'spearman', 'cleaver', 'skirmisher', 'catcher']},
  {id: 'slavers', label: 'ловцы рабов',  note: 'сети и ножи, луки прикрывают', roles: ['catcher', 'catcher', 'cutthroat', 'archer', 'archer']},
  {id: 'bones',   label: 'костяной строй', note: 'мертвецы: щиты и копья, лук позади; мертвяки без рук идут между ними', roles: ['shield', 'spearman', 'spearman', 'shield', 'archer']},
  {id: 'anvil',   label: 'наковальня',   note: 'дварфы: щит и два молотобойца впереди, мастер горна за ними, арбалет сзади', roles: ['shield', 'smith', 'smith', 'forgemaster', 'archer']},
  {id: 'berserks', label: 'бешеные',     note: 'дварфы: берсерки врезаются, молотобоец и щит следом', roles: ['berserker', 'berserker', 'smith', 'shield', 'archer']},
  {id: 'riders',  label: 'всадники',     note: 'зеленокожие: наездники на варгах и пауках, загонщик со зверями, берсерк', roles: ['wargrider', 'wargrider', 'spiderrider', 'beastmaster', 'berserker']},
  {id: 'volley',  label: 'стрелки',      note: 'луки, а впереди один щит', roles: ['archer', 'archer', 'archer', 'shield', 'skirmisher']},
]);

// the forms of each class of armour, by weight; a form the band's tier has no piece of drops out (scale and mail begin at
// bronze: at tier 0 the heavy class is bone lamellar)
export const ARMOUR = {
  none: [],
  light: [['garment', 2], ['jerkin', 2]],
  medium: [['jerkin', 1], ['lamellar', 2]],
  heavy: [['lamellar', 2], ['scale', 1], ['mail', 1]],
};

// the tier of metal a band of level t brings: tier k (0 bone, wood and stone, 1 bronze, 2 iron, 3 steel, 4 mithril) is
// open from level `from[k]`, and each piece is of tier k with a chance that grows by `ramp` per level up to `share`;
// the best open tier that wins its roll, no higher than the species' `best`
export const ROLE_TIERS = {from: [0, 8, 16, 26, 40], ramp: 0.06, share: 0.7};

export const ROLE_MIX = {
  human:       {shield: 2, spearman: 1.5, cleaver: 1.5, cutthroat: 1, skirmisher: 1, catcher: 0.3, archer: 1.2, healer: 0.3, best: 3},
  orc:         {shield: 2, spearman: 1, cleaver: 3, skirmisher: 0.7, catcher: 0.3, archer: 0.3, healer: 0.3, berserker: 0.8, wargrider: 0.8, beastmaster: 0.5, best: 2},
  goblin:      {shield: 0.3, spearman: 1, cutthroat: 2.5, skirmisher: 3, catcher: 0.5, archer: 2, healer: 0.3, spiderrider: 0.8, wargrider: 0.4, beastmaster: 0.4, best: 1},
  dwarf:       {shield: 2, spearman: 1, smith: 2, berserker: 0.8, forgemaster: 0.5, cleaver: 1, archer: 0.8, healer: 0.3, best: 4},
  elf:         {shield: 0.5, spearman: 1, skirmisher: 1, archer: 3, healer: 0.4, summoner: 0.4, best: 4},
  darkelf:     {spearman: 1, cutthroat: 2, catcher: 1.5, skirmisher: 1, archer: 3, healer: 0.4, best: 3},
  gnoll:       {shield: 0.7, spearman: 2, cleaver: 1.5, skirmisher: 1.5, catcher: 0.7, archer: 0.7, berserker: 0.5, beastmaster: 0.6, best: 1},
  skeleton:    {shield: 2, spearman: 2, cleaver: 1, archer: 1.5, best: 1},
  ogre:        {brute: 1, best: 0},
  giant:       {brute: 1, best: 0},
  troll:       {best: 0},
  vampire:     {fixed: ['sword', 'clothes'], best: 2},
  necromancer: {fixed: ['staff', 'clothes'], best: 0},
};

// the row of a species (the human row for one that has none)
export const mixOf = species => ROLE_MIX[species] || ROLE_MIX.human;
// the roles a species may take, [[role, weight], …]; `bias` ({role: ×}) — a band's own leaning
export const rolesOf = (species, bias = null) => COMBAT_ROLES.all().map(r => [r.id, (mixOf(species)[r.id] || 0) * (bias?.[r.id] ?? 1)]).filter(([, v]) => v > 0);

// the role a member of a band takes: one the band still lacks by its `least` ({role: share of heads}) first, then by weight.
// `have` — the roles already in the band
// (`least` counts within `have`: the caller gives the roles of the same species)
export function drawRole(rng, species, {bias = null, least = null, have = []} = {}) {
  const may = rolesOf(species, bias); if (!may.length) return null;
  const heads = have.length + 1;
  const short = least ? may.filter(([r]) => least[r] && have.filter(x => x === r).length < Math.floor(least[r] * heads)) : [];
  return weighted(rng, short.length ? short : may);
}

// the pieces of each form by tier (made again after an edit of the tables: «Формы» and «Материалы» rebuild the items)
let byForm = null;
onEdit(() => { byForm = null; });
const forms = () => byForm || (byForm = ITEMS.all().filter(d => !d.base && d.form).reduce((m, d) => ((m[d.form] ||= []).push(d), m), {}));
// may a race carry a piece (data/kinds.js): its material — the wood of a wooden one, the metal's resource
const mayCarry = (species, d) => !species || mayUse(species, MATERIALS[d.material]?.class.includes('wood') ? KIND_LAND.wood : MATERIALS[d.material]?.resource);
// the piece of a form of tier `tier` or the nearest below it (above it, if the form has nothing so low); with a
// species — only of what it may carry (none: no piece of that form for it)
export function pieceOf(form, tier, species = null) {
  const all = forms()[form];
  if (!all) return ITEMS.has(form) ? form : null;
  const list = all.filter(d => mayCarry(species, d));
  if (!list.length) return null;
  const plain = list.filter(d => d.material !== 'silver');   // a silver knife is a weapon against the dead, no tier of metal
  const below = plain.filter(d => (d.tier ?? 0) <= tier);
  if (below.length) return below.reduce((b, d) => ((d.tier ?? 0) > (b.tier ?? 0) ? d : b)).id;
  return (plain.length ? plain : list).reduce((b, d) => ((d.tier ?? 0) < (b.tier ?? 0) ? d : b)).id;
}
// is there a piece of the form at this tier or lower (an armour form that does not begin so low drops out of its class)
const hasBelow = (form, tier, species = null) => (forms()[form] || []).some(d => (d.tier ?? 0) <= tier && mayCarry(species, d));

// the tier one piece of a band of level t is made of
export function tierFor(rng, t, best = 4) {
  const T = ROLE_TIERS;
  let tier = 0;
  for (let k = 1; k < T.from.length && k <= best; k++) if (t >= T.from[k] && rng() < clamp((t - T.from[k] + 1) * T.ramp, 0, T.share)) tier = k;
  return tier;
}

// the kit of one fighter of a role: item ids for dress(); a species with a kit of its own carries that
export function roleKit(species, role, rng, t) {
  const mix = mixOf(species);
  if (mix.fixed) return [...mix.fixed];
  const R = role && COMBAT_ROLES.has(role) ? COMBAT_ROLES.get(role) : null;
  if (!R) return [];
  const best = Math.min(mix.best ?? 4, R.maxTier ?? 4), out = [];
  // the weapons of one metal; a set with a form not made so low (a mace, a sword before bronze) drops out
  const hand = tierFor(rng, t, best), sets = R.hands.filter(([fs]) => fs.every(f => !forms()[f] || hasBelow(f, hand, species) && mayWield(species, f)));   // nor one its race will not touch
  for (const f of weighted(rng, sets.length ? sets : R.hands) || []) { const id = mayWield(species, f) ? pieceOf(f, hand, species) : null; if (id) out.push(id); }   // (a set of no tier: still never a form its race will not touch)
  const tier = tierFor(rng, t, best), body = (ARMOUR[R.body] || []).filter(([f]) => hasBelow(f, tier, species));
  if (body.length) { const id = pieceOf(weighted(rng, body), tier, species); if (id) out.push(id); }
  for (const f of R.back || []) { const id = pieceOf(f, 0); if (id && (f !== 'quiver' || out.some(x => ITEMS.get(x).ranged?.ammo))) out.push(id); }   // a quiver only for what shoots from one
  return out;
}

// The caller of beasts (agents/summon.js; role `summoner`, or an elf of a colony or a caravan by the race's `summons`):
//   share    — once a fight it calls forest beasts (tag «Лесной», data/tags.js sylvan) worth this share of its own side's
//              strength (КС of its people within `reach`), drawn from those that live here (the habitat of the map's
//              biomes, × `levels`), at most `max`
//   cooldown — ticks before it calls again (one fight); `ring` — they come out of the wood this far from it
//   sight    — a called beast goes for a foe of its caller this close; `quiet` ticks with no foe — it goes back to the wood
// the berserker's frenzy (role `berserker`): a wound that lands throws it into `frenzy` (data/conditions.js: blows
// stronger, faster, harder to hit) for its `ticks`; then it is `spent` (slower: the row the frenzy names as `then`). Not twice in a row: no frenzy while
// raging or spent, and the next one needs a fresh wound after the weariness is over
export const FRENZY = {rage: 'frenzy', spent: 'spent'};   // (how long each: their rows' `ticks`)
// the row of a creature's fighting role, null for none
export const roleRow = a => (a?.fightRole && COMBAT_ROLES.has(a.fightRole) ? COMBAT_ROLES.get(a.fightRole) : null);

// the riders (role `mount`, agents/mount.js): a blow at a mounted one falls on the mount with `hitMount` (the beast is the
// bigger mark, the rider half behind it); the mount bites at every blow of its rider; thrown off when its mount falls, the
// rider lies `fall` ticks stunned
export const RIDE = {hitMount: 0.6, fall: 30, aside: 0.3, least: 0.05};   // (the loosed mount stands `aside` cells off, with at least `least` health)

export const SUMMON = {share: 0.25, reach: 20, max: 4, cooldown: 1200, ring: 3, sight: 14, quiet: 240, levels: {common: 1, usual: 0.6, rare: 0.25}};


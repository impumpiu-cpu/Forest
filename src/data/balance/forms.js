// Forms: what a thing is shaped as, apart from what it is made of. An item is a form × a material
// (data/balance/materials.js); data/items.js makes one for every material whose class the form takes (`of`).
// A new form is one row here — a flail is there at once in bronze, iron and mithril.
//
//   slot, hands     — where it is worn ('hand' | 'body' | 'back') and how many hands it takes
//   of              — the material classes it can be made of
//   ref             — the material its numbers below stand at; others are scaled by the materials' multipliers
//   blow            — how it strikes: pierce (колющий), slash (рубящий), blunt (дробящий); a shot's kind is
//                     `ranged.type` (data/balance/combat.js BLOWS: armour and bodies answer to it)
//   scale           — the letters the blow is struck with, {S: weight, A: weight} (combat.js: the rest of 1 is the
//                     weapon's own): a maul is all Strength, a dagger all Agility, a spear serves anyone
//   vs              — protection against each kind of blow, × its armour or its block — one rule for both: mail turns a
//                     cut and lets a hammer through, a hide shield catches a spear point and gives under a club,
//                     a blade parries a cut better than a thrust
//   melee {dmg, cd}, ranged {dmg, range, cd, ammo, boost, type}, block, speed, tool {job: ×},
//   armor, warmth, carry, holds {ammo, max}, dur — as on any item (docs/BALANCE.md)
//   parts           — what one piece takes, for its price: {material: n, wood: n, …} ('material' — the material's
//                     own resource; the rest are stock resources) — data/balance/prices.js turns it into gold
//   work            — labour of one piece in ticks (the same scale as recipes), also for the price
//   ids             — the ids pieces already have in the game ({bone: 'spear', iron: 'ironspear'}); any other
//                     material gets `material + form` ('mithrilspear')
//   names           — [label, short] for a material that has its own name; name(m) — for any other (m: the
//                     material row, with its `adj` and `short`)
//   glyph           — the picture in the hand: a string, or {material or class: glyph, default}
//   colors          — {material: colour} of armour where it differs from the material's
//   qualities       — the weapon's qualities (data/balance/combat.js WEAPON_QUALITIES: paired — strikes from the other
//                     hand too), summed with the material's
//   tier            — added to the material's tier (rare); tradeOnly — the outpost never makes it;
//   quality: false  — nothing finer work could improve
const cap = s => s[0].toUpperCase() + s.slice(1);

export const FORMS = {
  // ── one-handed
  club:     {blow: 'blunt', scale: {S: 1}, slot: 'hand', hands: 1, of: ['wood'], ref: 'wood', melee: {dmg: 1.3, cd: 12}, dur: 70,
    parts: {material: 3}, work: 600, ids: {wood: 'club'}, names: {wood: ['Дубина', 'дубина']}, name: m => [`${cap(m.adj.f)} палица`, `${m.short} палица`], glyph: 'club'},
  // long: it strikes from behind a shield-bearer's shoulder and meets the foe before the foe meets it (quality `reach`)
  spear:    {blow: 'pierce', scale: {S: 0.5, A: 0.3}, slot: 'hand', hands: 1, of: ['bone', 'metal'], ref: 'bone', melee: {dmg: 1.55, cd: 13}, qualities: {reach: 0.6}, dur: 60,
    parts: {material: 2, wood: 2}, work: 700, ids: {bone: 'spear', bronze: 'bronzespear', iron: 'ironspear'},
    names: {bone: ['Копьё с костяным наконечником', 'копьё']}, name: m => [`Копьё с ${m.adj.ins} наконечником`, `${m.short} копьё`], glyph: {bone: 'spear', default: 'ironspear'}},
  // an axe is a tool first: in a fight it falls a little short of a spear of its tier
  axe:      {blow: 'slash', scale: {S: 1}, slot: 'hand', hands: 1, of: ['bone', 'metal'], ref: 'bone', melee: {dmg: 1.45, cd: 13}, tool: {chop: 1.6, build: 1.04}, qualities: {paired: 0.4}, dur: 80,
    parts: {material: 2, wood: 1}, work: 700, ids: {bone: 'axe', bronze: 'bronzeaxe', iron: 'ironaxe'},
    names: {bone: ['Топор с костяным клином', 'топор']}, name: m => [`${cap(m.adj.m)} топор`, `${m.short} топор`], glyph: {bone: 'axe', default: 'ironaxe'}},
  // quick, but short: a dagger of a tier falls short of its spear; a silver one is soft and only for what fears silver
  // light enough for the other hand: a second dagger strikes after the first (quality `paired`); sly — from the flank and
  // in the back it cuts twice as deep over a plain blow (quality `backstab`)
  dagger:   {blow: 'pierce', scale: {A: 1}, slot: 'hand', hands: 1, of: ['metal', 'silver'], ref: 'iron', melee: {dmg: 1.3, cd: 9}, qualities: {paired: 0.75, backstab: 1}, dur: 115,
    parts: {material: 1, leather: 1}, work: 400, ids: {silver: 'silverknife'}, name: m => [`${cap(m.adj.m)} кинжал`, `${m.short} кинжал`], glyph: 'dagger'},
  sword:    {vs: {pierce: 0.9, slash: 1.15, blunt: 0.8}, blow: 'slash', scale: {S: 0.5, A: 0.5}, slot: 'hand', hands: 1, of: ['metal'], ref: 'iron', melee: {dmg: 1.95, cd: 11}, block: 0.1, qualities: {paired: 0.3}, dur: 150,
    parts: {material: 3, leather: 1}, work: 900, ids: {iron: 'sword'}, names: {iron: ['Железный меч', 'меч']}, name: m => [`${cap(m.adj.m)} меч`, `${m.short} меч`], glyph: 'sword'},
  // the metal answer to armour: what a cut slides off, a blow of a mace or a hammer goes through
  mace:     {blow: 'blunt', scale: {S: 1}, slot: 'hand', hands: 1, of: ['metal'], ref: 'iron', melee: {dmg: 1.85, cd: 12}, dur: 150,
    parts: {material: 3, wood: 1}, work: 800, name: m => [`${cap(m.adj.f)} булава`, `${m.short} булава`], glyph: 'club'},
  // thrown first, then a short spear in the hand: a bundle of three (quality `thrown`: throws before it is down to one)
  javelin:  {blow: 'pierce', scale: {S: 0.5, A: 0.5}, slot: 'hand', hands: 1, of: ['bone', 'metal'], ref: 'bone', melee: {dmg: 1.15, cd: 12},
    ranged: {dmg: 1.5, range: 5, cd: 16, ammo: null, type: 'pierce'}, qualities: {thrown: 3}, dur: 50,
    parts: {material: 2, wood: 3}, work: 700, ids: {bone: 'javelin'}, names: {bone: ['Дротики с костяными наконечниками', 'дротики']},
    name: m => [`Дротики ${/^с[^аеёиоуыэюя]/.test(m.adj.ins) ? 'со' : 'с'} ${m.adj.ins} наконечником`, `${m.short} дротики`], glyph: 'javelin'},
  // a small axe for the belt: thrown twice, then cut with; light enough for the other hand
  hatchet:  {blow: 'slash', scale: {S: 0.6, A: 0.4}, slot: 'hand', hands: 1, of: ['bone', 'metal'], ref: 'bone', melee: {dmg: 1.3, cd: 11},
    ranged: {dmg: 1.4, range: 4, cd: 14, ammo: null, type: 'slash'}, qualities: {thrown: 2, paired: 0.5}, tool: {chop: 1.2}, dur: 70,
    parts: {material: 2, wood: 1}, work: 600, ids: {bone: 'hatchet'}, names: {bone: ['Метательный топорик с костяным клином', 'топорик']},
    name: m => [`${cap(m.adj.m)} метательный топорик`, `${m.short} топорик`], glyph: 'axe'},
  // a torch: light in the dark (agents/combat.js darkness), a blow that sets alight (quality `burn`), and thrown —
  // no harm to a body, but the wall it lands on catches (agents/tasks/raid.js torch); the bands' fire-raisers carry it
  torch:    {blow: 'blunt', scale: {S: 1}, slot: 'hand', hands: 1, of: ['wood'], ref: 'wood', melee: {dmg: 0.5, cd: 12},
    ranged: {dmg: 0, range: 5, cd: 20, ammo: null, type: 'blunt'}, qualities: {thrown: 1, burn: 0.3}, dur: 20, quality: false,
    parts: {material: 1, fiber: 1}, work: 120, ids: {wood: 'torch'}, names: {wood: ['Факел', 'факел']}, name: m => ['Факел', 'факел'], glyph: 'club'},
  // the forge-master's fire (data/roles.js forgemaster, the dwarves): a coal held in tongs and a mouthful of lamp oil blown
  // across it — no magic, a smith's trick: the breath is the perk «Огнедышащий I» (agents/abilities.js), only with this in
  // hand; the tongs strike as a torch does. No town sells it and no outpost makes it
  spitfire: {blow: 'blunt', scale: {S: 1}, slot: 'hand', hands: 1, of: ['wood'], ref: 'wood', melee: {dmg: 0.5, cd: 12},
    qualities: {burn: 0.3}, dur: 40, quality: false, tradeOnly: true, sold: false,
    parts: {material: 1, coal: 2}, work: 300, ids: {wood: 'spitfire'}, names: {wood: ['Горновой огонь', 'огонь горна']}, name: () => ['Горновой огонь', 'огонь горна'], glyph: 'club'},
  shield:   {vs: {pierce: 1.1, slash: 1.05, blunt: 0.8}, slot: 'hand', hands: 1, of: ['wood', 'metal'], ref: 'wood', block: 0.32, cover: 0.5, dur: 35,
    parts: {material: 3, hide: 2}, work: 700, ids: {wood: 'shield'}, names: {wood: ['Щит из жердей и шкуры', 'щит']}, name: m => [`${cap(m.adj.m)} щит`, `${m.short} щит`], glyph: 'shield'},
  // ── two-handed: each makes up for the shield it leaves no hand for
  staff:    {vs: {pierce: 0.85, slash: 1, blunt: 1.1}, blow: 'blunt', scale: {S: 0.5, A: 0.5}, slot: 'hand', hands: 2, of: ['wood'], ref: 'wood', melee: {dmg: 1.4, cd: 10}, block: 0.15, speed: 1.05, dur: 80,
    parts: {material: 2}, work: 600, ids: {wood: 'staff'}, names: {wood: ['Посох', 'посох']}, name: m => [`${cap(m.adj.m)} посох`, `${m.short} посох`], glyph: 'staff'},
  maul:     {blow: 'blunt', scale: {S: 1}, slot: 'hand', hands: 2, of: ['wood'], ref: 'wood', melee: {dmg: 2.5, cd: 15}, tool: {build: 1.45, mine: 1.35}, dur: 90,
    parts: {material: 4, bone: 1}, work: 750, ids: {wood: 'maul'}, names: {wood: ['Деревянный молот', 'молот']}, name: m => [`${cap(m.adj.m)} молот`, `${m.short} молот`], glyph: 'maul'},
  warhammer: {blow: 'blunt', scale: {S: 1}, slot: 'hand', hands: 2, of: ['metal'], ref: 'iron', melee: {dmg: 3.1, cd: 14}, dur: 160,
    parts: {material: 4, wood: 2}, work: 1000, name: m => [`${cap(m.adj.m)} боевой молот`, `${m.short} молот`], glyph: 'maul'},
  // bows and slings lose a duel to a club on purpose: they shoot from afar while others hold the line
  bow:      {blow: 'blunt', slot: 'hand', hands: 2, of: ['wood'], ref: 'wood', melee: {dmg: 0.6, cd: 14}, ranged: {dmg: 1.7, range: 7, cd: 22, ammo: 'arrows', type: 'pierce'}, dur: 90,
    parts: {material: 3, leather: 1, rope: 1}, work: 800, ids: {wood: 'bow'}, names: {wood: ['Лук', 'лук']}, name: m => [`${cap(m.adj.m)} лук`, `${m.short} лук`], glyph: 'bow'},
  // a plain bow of a single stave and a string of whatever there was: the elves' first bow, weaker than a made one
  selfbow:  {blow: 'blunt', slot: 'hand', hands: 2, of: ['wood'], ref: 'wood', melee: {dmg: 0.6, cd: 14}, ranged: {dmg: 1.45, range: 6.5, cd: 22, ammo: 'arrows', type: 'pierce'}, dur: 70,
    parts: {material: 5}, work: 600, ids: {wood: 'selfbow'}, names: {wood: ['Простой лук', 'простой лук']}, name: m => [`${cap(m.adj.m)} простой лук`, `${m.short} простой лук`], glyph: 'bow'},
  // a bow on a stock: slow to span, but it strikes hard and goes through armour (quality `piercing`); iron in the lock,
  // so a tier above its wood. The elves will not touch it (data/kinds.js RACE_FORMS)
  crossbow: {blow: 'blunt', slot: 'hand', hands: 2, of: ['wood'], ref: 'wood', tier: 1, melee: {dmg: 0.6, cd: 15},
    ranged: {dmg: 2.0, range: 7.5, cd: 40, ammo: 'arrows', type: 'pierce'}, qualities: {piercing: 0.35}, dur: 110,
    parts: {material: 3, iron: 1, rope: 1}, work: 1100, ids: {wood: 'crossbow'}, names: {wood: ['Арбалет', 'арбалет']}, name: m => [`${cap(m.adj.m)} арбалет`, `${m.short} арбалет`], glyph: 'crossbow'},
  // a weighted net, thrown: whom it falls on is tangled and cannot strike for a while (quality `ensnare`); twice, then
  // gathered up again. It hurts nobody: the club in the other hand does that
  net:      {slot: 'hand', hands: 1, of: ['cloth'], ref: 'linen', ranged: {dmg: 0.1, range: 3.5, cd: 30, ammo: null, type: 'blunt'},
    qualities: {thrown: 2, ensnare: 0.8}, dur: 60, parts: {material: 4}, work: 700, ids: {linen: 'net', bast: 'bastnet', wool: 'woolnet'},
    names: {linen: ['Ловчая сеть', 'сеть'], bast: ['Лыковая ловчая сеть', 'сеть']}, name: m => [`${cap(m.adj.f)} ловчая сеть`, `${m.short} сеть`], glyph: 'net'},
  // stones lie everywhere: no ammo, but the sling is far weaker and shorter; a quarry gives better stones
  sling:    {blow: 'blunt', slot: 'hand', hands: 2, of: ['hide'], ref: 'hide', melee: {dmg: 0.5, cd: 14}, ranged: {dmg: 0.6, range: 4.5, cd: 20, ammo: null, boost: 'slingStones', type: 'blunt'}, dur: 60,
    parts: {material: 1}, work: 600, ids: {hide: 'sling'}, names: {hide: ['Праща', 'праща']}, name: m => [`${cap(m.adj.f)} праща`, `${m.short} праща`], glyph: 'sling'},
  // a rod with a wooden gorge hook and a line of twisted bast; works from the back as well
  rod:      {slot: 'hand', hands: 2, of: ['wood'], ref: 'wood', tool: {fish: 1.6}, dur: 80,
    parts: {material: 3}, work: 500, ids: {wood: 'rod'}, names: {wood: ['Удочка с деревянным крючком', 'удочка']}, name: m => [`${cap(m.adj.f)} удочка`, `${m.short} удочка`], glyph: 'rod'},

  // ── body: clothing is warm before it is armour
  garment:  {vs: {pierce: 1, slash: 0.9, blunt: 1.1}, slot: 'body', of: ['cloth'], ref: 'bast', armor: 0.08, warmth: 0.35, dur: 50,
    parts: {material: 3}, work: 1300, ids: {bast: 'clothes', linen: 'linen', wool: 'woolens'},
    names: {bast: ['Одежда из лубяной ткани', 'ткань'], linen: ['Холщовая рубаха и порты', 'холст'], wool: ['Шерстяная свита', 'свита']},
    name: m => [`${cap(m.adj.f)} одежда`, `${m.short} одежда`]},
  // hides sewn hair-in — the winter coat; lined with fox fur — the warmest thing the outpost makes
  coat:     {vs: {pierce: 0.9, slash: 1.1, blunt: 1.1}, slot: 'body', of: ['fur'], ref: 'hide', armor: 0.14, warmth: 0.85, speed: 0.97, dur: 80,
    parts: {material: 3, leather: 1}, work: 1200, ids: {hide: 'furcoat', foxfur: 'furlined'},
    names: {hide: ['Тулуп из шкур', 'тулуп'], foxfur: ['Тулуп на лисьем меху', 'тулуп на меху']}, name: m => [`${cap(m.adj.m)} тулуп`, `${m.short} тулуп`]},
  jerkin:   {vs: {pierce: 0.9, slash: 1.1, blunt: 1}, slot: 'body', of: ['leather'], ref: 'leather', armor: 0.2, warmth: 0.55, dur: 70,
    parts: {material: 3}, work: 1500, ids: {leather: 'jerkin'}, names: {leather: ['Кожаная куртка', 'кожа']}, name: m => [`${cap(m.adj.f)} куртка`, `${m.short} куртка`]},
  // small plates laced onto a leather coat: bone ones are the outpost's first armour, iron ones a forge's
  lamellar: {vs: {pierce: 1, slash: 1.15, blunt: 0.8}, slot: 'body', of: ['bone', 'metal'], ref: 'iron', armor: 0.5, warmth: 0.4, speed: 0.93, dur: 170,
    parts: {material: 4, leather: 2}, work: 1600, ids: {bone: 'hardleather', iron: 'lamellar'},
    names: {bone: ['Кожа с костяными пластинами', 'укреплённая кожа'], iron: ['Ламеллярный доспех', 'ламеляр']},
    name: m => [`${cap(m.adj.m)} ламеллярный доспех`, `${m.short} ламеляр`], colors: {iron: '#8f989f'}},
  // bark and withies woven over a leather coat: the elves' armour (of the sacred tree in a master's hands it lasts far longer)
  wicker:   {vs: {pierce: 0.95, slash: 1, blunt: 1.05}, slot: 'body', of: ['wood'], ref: 'wood', armor: 0.3, warmth: 0.4, speed: 0.97, dur: 90,
    parts: {material: 4, fiber: 2, leather: 1}, work: 1400, ids: {wood: 'wicker'}, names: {wood: ['Плетёный доспех', 'плетёнка']},
    name: m => [`${cap(m.adj.m)} плетёный доспех`, `${m.short} плетёнка`], colors: {wood: '#7d8a4a'}},
  // imperial armour: the outpost cannot make it, only buy it from a trader (or find it)
  scale:    {vs: {pierce: 1.1, slash: 1.1, blunt: 0.75}, slot: 'body', of: ['metal'], ref: 'iron', armor: 0.48, warmth: 0.35, speed: 0.94, dur: 190, tradeOnly: true,
    parts: {material: 5, leather: 1}, work: 2000, ids: {iron: 'scalemail'}, names: {iron: ['Чешуйчатый доспех', 'чешуя']},
    name: m => [`${cap(m.adj.m)} чешуйчатый доспех`, `${m.short} чешуя`], colors: {iron: '#9aa0a0'}},
  mail:     {vs: {pierce: 0.85, slash: 1.25, blunt: 0.8}, slot: 'body', of: ['metal'], ref: 'iron', armor: 0.55, warmth: 0.3, speed: 0.95, dur: 220, tradeOnly: true,
    parts: {material: 6}, work: 3000, ids: {iron: 'chainmail'}, names: {iron: ['Кольчуга', 'кольчуга']},
    name: m => [`${cap(m.adj.f)} кольчуга`, `${m.short} кольчуга`], colors: {iron: '#b4bcc2'}},

  // ── back
  quiver:   {slot: 'back', of: ['hide'], ref: 'hide', holds: {ammo: 'arrows', max: 15}, dur: Infinity, quality: false,
    parts: {material: 1, wood: 1}, work: 450, ids: {hide: 'quiver'}, names: {hide: ['Колчан', 'колчан']}, name: m => [`${cap(m.adj.m)} колчан`, `${m.short} колчан`]},
  // a wooden pan for washing gold out of the river sand (data/plants.js 'placer')
  pan:      {slot: 'back', of: ['wood'], ref: 'wood', tool: {pan: 1.2}, dur: 150, quality: false,
    parts: {material: 2}, work: 300, ids: {wood: 'pan'}, names: {wood: ['Промывочный лоток', 'лоток']}, name: m => [`${cap(m.adj.m)} лоток`, `${m.short} лоток`]},
  basket:   {slot: 'back', of: ['weave'], ref: 'reed', carry: 2, dur: Infinity, quality: false,
    parts: {material: 4}, work: 450, ids: {reed: 'basket'}, names: {reed: ['Заплечный короб', 'короб']}, name: m => [`${cap(m.adj.m)} короб`, `${m.short} короб`]},
};

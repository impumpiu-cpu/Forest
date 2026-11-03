// Equipment. Every humanoid (species with `inventory: true`) has four slots:
//   left / right hand — one-handed items take one hand, two-handed items take both;
//   body — armour or clothing; back — any single item (a quiver and a basket work there,
//   anything else is simply carried as a spare and swapped in when needed).
// Harsh neolithic at first: wood, bone, hide and leather. With a mine, a furnace and a forge come
// bronze and iron (`bronze: true`, `iron: true`): a bronze tool can build a cart, an iron one a wagon
// (data/transport.js).
//
// An item is a form × a material (docs/BALANCE.md, «Форма и материал»):
//   data/balance/forms.js     — what it is shaped as: slot, hands, blow, block, armour, tools, parts, labour
//   data/balance/materials.js — what it is made of: tier, rarity, multipliers, the words for its name
//   data/balance/prices.js    — what the parts and the labour cost, and the rarity's step
// Every form is made here of every material whose class it takes: a new material gives every such form,
// a new form comes in every such material. The pieces the game already had keep their ids (forms.js `ids`).
//
// The fields of an item (the code reads only these):
//   id, label, short, form, material, tier, slot, hands, glyph, color
//   melee {dmg, cd}            close combat, dmg multiplies the base blow
//   blow, scale                how it strikes (pierce, slash, blunt) and with which letters (data/balance/combat.js)
//   vs                         protection against each kind of blow, × armor or × block
//   ranged {dmg, range, cd, ammo, boost}  ammo: resource id carried in a quiver (null = picked up anywhere);
//                              boost: a colony modifier from world.mods.best that strengthens the shot
//   block                      chance to stop a melee blow (shields, staves)
//   cover                      share of that chance which also stops a shot (a shield: 0.5; a parry stops none)
//   armor, warmth, speed       share of damage absorbed; share of cold kept out; walking multiplier
//   tool {job: ×}              work speed while working that job (in hands or on the back)
//   carry, holds {ammo, max}   extra units carried while harvesting; what a back item holds
//   dur                        uses before it breaks
//   value                      price of a plain (+0) piece in imperial gold; finer pieces cost more (data/quality.js)
//   iron / bronze / silver     what it is made of (recipes, transport, silver-fearing creatures)
//   tradeOnly                  the outpost cannot make it, it can only be bought (or found)
//   sold: false                traders never carry it (a rare material)
//   quality: false             nothing finer work could improve (a basket is a basket)
import {Registry} from '../core/registry.js';
import {FORMS} from './balance/forms.js';
import {MATERIALS} from './balance/materials.js';
import {RESOURCES as PRICE, ITEMS as ITEM_PRICE} from './balance/prices.js';

export const SLOTS = [
  {id: 'left',  label: 'левая рука', hand: true},
  {id: 'right', label: 'правая рука', hand: true},
  {id: 'body',  label: 'тело'},
  {id: 'back',  label: 'спина'},
];

export const ITEMS = new Registry('item');

// the price of one piece: its parts and its labour, × what it protects, × the rarity of its material
// (data/balance/prices.js); `d` — the piece as made (its armour and block)
export function priceOf(form, mat, d = {}) {
  const res = id => {
    const r = id === 'material' ? mat.resource : id;
    if (!PRICE[r]) throw new Error(`price: no resource «${r}» in data/balance/prices.js`);
    return PRICE[r].price * (id === 'material' ? mat.amount ?? 1 : 1);
  };
  const parts = Object.entries(form.parts || {}).reduce((s, [id, n]) => s + res(id) * n, 0);
  const work = (form.work || 0) / 1000 * ITEM_PRICE.labour * (mat.labour ?? 1);
  const raw = (parts + work) * (1 + ITEM_PRICE.protection * ((d.armor || 0) + (d.block || 0))) * (ITEM_PRICE.rarity[mat.rarity] ?? 1);
  return Math.max(ITEM_PRICE.round, Math.round(raw / ITEM_PRICE.round) * ITEM_PRICE.round);
}

// one form in one material: the form's numbers scaled from its reference material to this one
export function makeItem(formId, matId) {
  const form = FORMS[formId], mat = MATERIALS[matId], ref = MATERIALS[form.ref];
  const r = k => (mat[k] ?? 1) / (ref[k] ?? 1);
  const id = form.ids?.[matId] ?? matId + formId;
  const [label, short] = form.names?.[matId] ?? form.name(mat);
  const d = {id, label, short, form: formId, material: matId, tier: mat.tier + (form.tier || 0), slot: form.slot};
  if (form.hands) d.hands = form.hands;
  const g = form.glyph;
  if (g) d.glyph = typeof g === 'string' ? g : g[matId] ?? mat.class.map(c => g[c]).find(Boolean) ?? g.default;
  if (form.slot === 'body') d.color = form.colors?.[matId] ?? mat.color;
  if (form.melee) d.melee = {dmg: +(form.melee.dmg * r('dmg')).toFixed(3), cd: Math.max(4, Math.round(form.melee.cd * r('swing')))};
  if (form.ranged) d.ranged = {...form.ranged, dmg: +(form.ranged.dmg * r('dmg')).toFixed(3)};
  if (form.blow) d.blow = form.blow;
  if (form.scale) d.scale = {...form.scale};
  if (form.block) d.block = +(form.block * r('block')).toFixed(3);
  if (form.armor) d.armor = +(form.armor * r('armor')).toFixed(3);
  if (form.cover) d.cover = form.cover;
  if (form.vs) d.vs = {...form.vs};
  if (form.warmth) d.warmth = +Math.min(0.98, form.warmth * r('warmth')).toFixed(3);
  // heavy armour slows: the slowing scales with the material's weight; a staff's lightness stays as it is
  if (form.speed) d.speed = form.speed < 1 ? +(1 - (1 - form.speed) * r('weight')).toFixed(3) : form.speed;
  if (form.tool) d.tool = Object.fromEntries(Object.entries(form.tool).map(([job, m]) => [job, +(1 + (m - 1) * r('work')).toFixed(3)]));
  if (form.carry) d.carry = form.carry;
  if (form.holds) d.holds = {...form.holds};
  // weapon qualities (data/balance/combat.js WEAPON_QUALITIES): the form's, and the material's for a weapon, summed
  const q = {};
  for (const src of [form.qualities, d.melee || d.ranged ? mat.qualities : null]) for (const [k, v] of Object.entries(src || {})) q[k] = (q[k] || 0) + v;
  if (Object.keys(q).length) d.qualities = q;
  d.dur = Number.isFinite(form.dur) ? Math.round(form.dur * r('dur') / 5) * 5 : form.dur;
  d.value = priceOf(form, mat, d);
  for (const [k, v] of Object.entries(mat.flags || {})) d[k] = v;
  if (form.tradeOnly) d.tradeOnly = true;
  if (form.quality === false) d.quality = false;
  if (form.sold === false) d.sold = false;
  if (mat.rarity !== 'common' && mat.rarity !== 'uncommon') d.sold = false;
  return d;
}

ITEMS.registerAll(Object.entries(FORMS).flatMap(([formId, form]) =>
  Object.entries(MATERIALS).filter(([, m]) => m.class.some(c => form.of.includes(c))).map(([matId]) => makeItem(formId, matId))));

// the items made again from the forms and materials as they are now (an edit of «Формы» or «Материалы» on the
// screen «Таблицы», src/data/schema/edits.js): each definition keeps its identity — saves and the stock refer to it
export function rebuildItems() {
  for (const d of ITEMS.all()) {
    const fresh = makeItem(d.form, d.material);
    for (const k of Object.keys(d)) if (k !== 'id') delete d[k];
    Object.assign(d, fresh, {id: d.id});
  }
}

export const isWeapon = def => !!(def.melee || def.ranged);

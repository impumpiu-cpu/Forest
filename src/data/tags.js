// Tags (docs/RULES.md), as traits are in Pathfinder 2: one dictionary of the words that mark a species, an item
// or a resource, with what each means and who reads it. The data keeps them where they always were — a species'
// yes/no field (`undead: true`), a list of what it fears (`weakTo: ['silver']`), a resource's `tags`, an item's
// yes/no field — and this table names every one of them, so a word that is not here is a mistake
// (`npm run tables`: a species field set to yes, a fear, a resource tag, an item field must each be a tag).
//
//   on    — what carries it: species · fear (a species' weakTo) · resource · item
//   field — where it lives on that thing: the field itself (species, item), weakTo, tags
// hasTag(thing, id) reads any tag the same way, wherever it lives.
import {Registry} from '../core/registry.js';

export const TAG_ON = {species: 'вид', fear: 'вид боится', resource: 'ресурс', item: 'вещь'};

export const TAGS = new Registry('tag');

const sp = (id, label, reads, note) => ({id, on: 'species', field: id, label, reads, note});
const res = (id, label, reads, note) => ({id: `res:${id}`, on: 'resource', field: 'tags', word: id, label, reads, note});
const it = (id, label, reads, note) => ({id: `item:${id}`, on: 'item', field: id, label, reads, note});

TAGS.registerAll([
  // ── species
  sp('sentient', 'разумный', 'найм, торг, плен, смертельная рана (data/wounds.js CAN_FALL)', 'думает и говорит: может пасть без сознания, быть пленён, нанят'),
  sp('mindless', 'безмозглый', 'страх и бегство отряда (data/behaviour.js SQUAD.nerve)', 'не знает страха: зомби, скелет'),
  sp('undead', 'без жизни', 'смертельная рана, тело, огонь, яд', 'нежить: не истекает кровью, не падает без сознания'),
  sp('fiend', 'демон', 'разломы карты мира (atlas/lairs.js)', 'приходит через разломы у вулканов и швов плит'),
  sp('resident', 'здешний', 'приход нечисти (data/neighbours.js, atlas/fauna.js)', 'дух места: живёт здесь, убитый возвращается'),
  sp('game', 'дичь', 'пока никто: кого бьют охотники, задаёт работа (data/jobs.js prey), кого — хищник, его prey', 'метка описания; системы её не читают'),
  sp('big', 'крупный', 'хищники: как бьют добычу (agents/behaviours/chase.js, agents/hunting.js)', 'крупный зверь: кабан, лось, медведь…'),
  sp('snowfoot', 'снежная лапа', 'шаг по снегу (agents/movement.js)', 'не вязнет в снегу'),
  sp('nocturnal', 'ночной', 'когда выходит на охоту (agents/behaviours/leaveHurt.js)', 'днём спит, ночью охотится'),
  sp('hibernates', 'зимняя спячка', 'уходит с карты зимой (agents/brains/mule.js, data/migrations.js)', 'спит зимой'),
  sp('inventory', 'носит вещи', 'снаряжение (agents/agent.js), налётчики (data/raids.js)', 'держит оружие, броню и ношу'),
  sp('relativeStats', 'статы типичного зверя', 'тело зверя (agents/special.js)', 'правило, а не свойство: строка вида описывает типичного зверя, SPECIAL двигает зверя против сородичей'),
  // ── what a species fears (weakTo)
  {id: 'silver', on: 'fear', field: 'weakTo', label: 'боится серебра', reads: 'удар посеребрённым (data/balance/combat.js silver.bane), ценность серебра в руке', note: 'посеребрённое бьёт в разы сильнее, прочее — слабее'},
  // ── resources (resources.js `tags`)
  res('food', 'еда', 'сытость, склад, грабёж', 'всё, что можно съесть'),
  res('drink', 'питьё', 'брага и прочее', 'пьют'),
  res('spice', 'приправа', 'вкус еды', 'соль, специи'),
  res('seed', 'семена', 'посев (data/crops.js)', 'то, чем засевают поле'),
  res('fuel', 'топливо', 'костёр (в порядке `burn`)', 'горит в костре'),
  res('smelt', 'жар горна', 'горн и кузня (settlement/stock.js furnacePick)', 'держит горн горячим'),
  res('material', 'материал', 'стройка, ремесло', 'древесина, камень, кость, шкуры…'),
  res('ore', 'руда', 'шахта, плавка', 'копают в шахте'),
  res('metal', 'металл', 'ковка, литьё', 'слитки'),
  res('precious', 'драгоценность', 'оплата, клады', 'золото, серебро'),
  res('money', 'деньги', 'оплата торговцу', 'монета'),
  res('luxury', 'роскошь', 'ювелир, торговля', 'изделия ювелира'),
  res('reagent', 'реагент', 'лекарства, яды', 'яд, железы'),
  res('medicine', 'лекарство', 'лечение', 'травы, снадобья'),
  res('storage', 'хранилище', 'склад', 'горшки, бочки'),
  res('furniture', 'мебель', 'уют построек (data/furniture.js)', 'ставится в постройку'),
  res('bonds', 'путы', 'плен (data/captives.js)', 'верёвка, кандалы'),
  res('key', 'инструмент города', 'модификаторы поселения (data/resources.js effects)', 'ключ: лежит на складе — даёт эффект'),
  res('ammo', 'боеприпас', 'выстрел, колчан', 'стрелы, камни'),
  // ── items (an item's own yes/no field)
  it('silver', 'посеребрённое', 'удар по боящимся серебра', 'серебро на клинке'),
  it('bronze', 'бронзовое', 'ступень инструмента в походе (campaign/baggage.js, finds.js)', 'вещь из бронзы'),
  it('iron', 'железное', 'ступень инструмента, торговля поселения', 'вещь из железа или стали'),
  it('tradeOnly', 'только у торговцев', 'кузня, рынок', 'не куют в поселении'),
  it('sold', 'продаётся', 'рынок (false — не продают: мифрил)', ''),
  it('quality', 'бывает качество', 'качество вещи (false — всегда простая: колчан, лоток, корзина)', ''),
]);

// does a thing carry a tag (by the tag's id) — wherever the data keeps it
export function hasTag(thing, id) {
  const t = TAGS.get(id);
  if (t.on === 'fear') return !!thing?.weakTo?.includes(t.id);
  if (t.on === 'resource') return !!thing?.tags?.includes(t.word);
  return thing?.[t.field] === true;
}
export const tagIds = on => new Set(TAGS.filter(t => t.on === on).map(t => (t.on === 'resource' ? t.word : t.id.replace(/^item:/, ''))));

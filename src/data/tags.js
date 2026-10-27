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
  sp('undead', 'без жизни', 'смертельная рана, тело, огонь, яд', 'нежить: не истекает кровью, не падает без сознания'),
  sp('fiend', 'демон', 'разломы карты мира (atlas/lairs.js)', 'приходит через разломы у вулканов и швов плит'),
  sp('resident', 'здешний', 'приход нечисти (data/neighbours.js, atlas/fauna.js)', 'дух места: живёт здесь, убитый возвращается'),
  sp('big', 'крупный', 'хищники: как бьют добычу (agents/behaviours/chase.js, agents/hunting.js)', 'крупный зверь: кабан, лось, медведь…'),
  sp('snowfoot', 'снежная лапа', 'шаг по снегу (agents/movement.js)', 'не вязнет в снегу'),
  sp('nocturnal', 'ночной', 'когда выходит на охоту (agents/behaviours/leaveHurt.js)', 'днём спит, ночью охотится'),
  sp('hibernates', 'зимняя спячка', 'уходит с карты зимой (agents/behaviours/leave.js, data/migrations.js)', 'спит зимой'),
  sp('inventory', 'носит вещи', 'снаряжение (agents/agent.js), налётчики (data/raids.js)', 'держит оружие, броню и ношу'),
  sp('relativeStats', 'статы типичного зверя', 'тело зверя (agents/special.js)', 'правило, а не свойство: строка вида описывает типичного зверя, SPECIAL двигает зверя против сородичей'),
  // ── what a species fears (weakTo)
  {id: 'silver', on: 'fear', field: 'weakTo', label: 'боится серебра', reads: 'удар посеребрённым (data/balance/combat.js silver.bane), ценность серебра в руке', note: 'посеребрённое бьёт в разы сильнее, прочее — слабее'},
  // ── resources (resources.js `tags`)
  res('food', 'еда', 'склад и порча (settlement/stock.js), запас еды колонии (settlement/query.js), торговля едой (settlement/trade.js)', 'всё, что можно съесть'),
  res('fuel', 'топливо', 'костёр — по порядку `burn` (settlement/stock.js), запас дров в плане (settlement/plan.js)', 'горит в костре'),
  res('luxury', 'роскошь', 'ремесло: изделие ювелира — в запас на продажу (settlement/crafting.js)', 'изделия ювелира, меха'),
  res('furniture', 'мебель', 'ремесло (settlement/crafting.js), покупка у торговца, пока есть место (settlement/trade.js); уют — data/furniture.js', 'ставится в постройку'),
  res('key', 'инструмент города', 'торговля инструментами (settlement/trade.js), их эффекты (data/resources.js effects), проверка справочников', 'ключ: лежит на складе — даёт эффект'),
  // ── items (an item's own yes/no field)
  it('silver', 'посеребрённое', 'удар по боящимся серебра', 'серебро на клинке'),
  it('bronze', 'бронзовое', 'ступень инструмента в походе (campaign/baggage.js, finds.js)', 'вещь из бронзы'),
  it('iron', 'железное', 'ступень инструмента, торговля поселения', 'вещь из железа или стали'),
  it('tradeOnly', 'только у торговцев', 'ремесло поселения (settlement/crafting.js: рецепт такой вещи не берут), товары торговца «как своё» (settlement/trade.js), проверка справочников', 'не куют в поселении: только купить или найти'),
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

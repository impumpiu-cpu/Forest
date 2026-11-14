// The words of the engine's own kinds for the cards and the map (src/ui, src/app): the causes a town's people are lost
// by, the kinds and states of the world's parties, the season's needs of a realm's council, the ways a polity rules,
// the kinds of rivers, the phases of a calamity and how it fell, where the artifact is, the camps and the phases of a
// caravan's walk. The ids are the engine's (atlas/, campaign/); the words are content, so they live here and a card
// that meets an id with no word shows the id.
//
//   LOSS_CAUSES   t.vital / t.book causes (atlas/population.js, atlas/demography.js): how the year's losses read
//   PARTY_KINDS   party kinds (atlas/parties.js): label, and the map readout's word (`map`: what a hover says)
//   PARTY_STATES  party states (atlas/parties.js)
//   MIND_FLAGS    the season's needs of a realm (atlas/mind.js flags; data/mind.js MIND.flags)
//   RULES         the rule of a polity (data/polities.js `rule`; the tables' «Правление»)
//   RIVER_KINDS   atlas/hydrology.js riverKind (data/hydrology.js RIVERS thresholds)
//   CAL_PHASES    a calamity's phase (atlas/calamity.js);  FELL_BY — what ended it (c.fell.by)
//   ARTIFACT_AT   who holds the epic world's artifact (a.artifact.holder.kind, atlas/calamity.js)
//   STAGE_ERAS    the eras of the land's stages (atlas/stages.js `era`) in its chronicle
//   CAMP_KINDS    the camps of a walk played on the local map (campaign/camp.js c.kind)
//   WALK_PHASES   the caravan's phase (campaign/index.js K.phase); `done` — the walk is over
export const LOSS_CAUSES = {dead: 'от старости', brawl: 'в драках', want: 'от голода и тесноты', war: 'на войне', storm: 'при штурме', siege: 'в осаде',
  raid: 'в набегах', taken: 'уведено', levy: 'в войско', moved: 'уехало', mingled: 'ушло к соседям', settlers: 'поселенцами', cult: 'ушло в культ',
  cold: 'в лютую зиму', drought: 'в засуху', dragon: 'от дракона', vampire: 'выпито', expelled: 'выжито', calamity: 'от бедствия',
  field: 'на сожжённых угодьях', left: 'ушло', scattered: 'разбрелось', drawn: 'в столицу', named: 'ко двору'};

export const PARTY_KINDS = {raid: {label: 'набег'}, brood: {label: 'выводок'}, army: {label: 'войско'}, leader: {label: 'отряд главаря', map: 'главарь'},
  dragon: {label: 'дракон'}, caravan: {label: 'караван'}};
export const PARTY_STATES = {go: 'в пути', arrive: 'на месте', stay: 'стоит', home: 'идёт домой', gone: 'разошёлся', camp: 'на стоянке'};

export const MIND_FLAGS = {hunger: 'нужда', crowd: 'теснота', threat: 'угроза', short: 'нехватки', hoard: 'казна пуста'};

export const RULES = {council: 'совет', chief: 'вождь', personal: 'личная власть', pack: 'стая', solo: 'одиночка'};

export const RIVER_KINDS = {stream: 'ручей', river: 'река', great: 'большая река'};

export const CAL_PHASES = {waiting: 'ждёт', omens: 'знамения', rise: 'идёт', fallen: 'прошло', gathering: 'собирается'};
export const FELL_BY = {dragon: 'дракон', beasts: 'свои стаи', heroes: 'запечатано героями', cleared: 'логово пало', alliance: 'союз держав',
  caravan: 'караван', none: 'не нашло места'};
export const ARTIFACT_AT = {sanctuary: 'в святилище', boss: 'у босса бедствия', grave: 'в могиле босса', caravan: 'у каравана', capital: 'в столице',
  lost: 'потерян в пути'};

export const STAGE_ERAS = {geology: 'Геология', climate: 'Климат', water: 'Вода', life: 'Жизнь'};

export const CAMP_KINDS = {night: 'Ночь', ambush: 'Засада на марше', stop: 'Стоянка', guard: 'Штурм'};
export const WALK_PHASES = {out: {label: 'ищут корону'}, back: {label: 'несут корону домой'}, won: {label: 'вернулись с короной', done: true},
  lost: {label: 'погибли', done: true}, timeout: {label: 'не вернулись', done: true},
  home: {label: 'сдали поручение — ждут в столице'}, empty: {label: 'возвращаются ни с чем'}};   // (a campaign of chapters: campaign/ending.js handIn)

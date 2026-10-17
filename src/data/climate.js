// Climate of the world map: the belts of prevailing winds and the knobs of the moisture model.
// The systems are in src/atlas/climate.js.

// Prevailing winds by latitude (degrees from the equator), as on Earth: the three circulation cells.
//   east:  the zonal wind, + blows towards the east (a westerly), − towards the west (an easterly)
//   eq:    the meridional wind, + towards the equator, − towards the pole
//   rise:  + air rises (rainy belts), − air sinks (dry belts)
// Between the stops the values blend smoothly.
export const WIND_BELTS = [
  {lat: 0,  east: -0.7, eq: 0,    rise: 1,    label: 'экваториальное затишье'},
  {lat: 15, east: -1,   eq: 0.5,  rise: 0,    label: 'пассаты'},
  {lat: 30, east: 0,    eq: 0,    rise: -1,   label: 'конские широты'},
  {lat: 45, east: 1,    eq: -0.4, rise: 0.2,  label: 'западные ветры'},
  {lat: 60, east: 0.2,  eq: 0,    rise: 0.7,  label: 'полярный фронт'},
  {lat: 75, east: -0.6, eq: 0.4,  rise: -0.2, label: 'полярные восточные'},
  {lat: 90, east: 0,    eq: 0,    rise: -0.6, label: 'полярный антициклон'},
];

// The moisture model, run on a grid of half the world's resolution until the air settles.
//   evapSea:   how fast the air takes up water over the sea (share of the gap to saturation)
//   recycle:   share of the recent local rain the land gives back to the air (plants, wet ground)
//   drizzle:   rain that falls from any moist air each step
//   rise:      extra rain where the air of the belt rises (× WIND_BELTS rise)
//   orography: extra rain when the wind climbs a slope (× the climb), at most oroMax of the air's water a step
//   condense:  share of the water above saturation that falls at once; saturation grows with warmth
//   speed:     cells of the half grid the wind carries air per step;  mix: how much eddies spread it every way
//   mm:        rain units → millimetres a year (calibrated so half the land of a usual world gets less than
//              ~450 mm and a twentieth more than ~3 m, as on Earth);  soft: above this it grows slower
export const MOISTURE = {evapSea: 0.12, recycle: 0.65, drizzle: 0.01, rise: 0.015, orography: 4, oroMax: 0.15, condense: 0.25, speed: 0.9, mix: 0.15, mm: 11000, soft: 2500};

// Words for the yearly rain (mm), for the cell card.
export const RAIN_WORDS = [[150, 'пустыня'], [350, 'сухо'], [700, 'умеренно'], [1300, 'влажно'], [Infinity, 'очень влажно']];

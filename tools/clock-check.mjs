// The observer's clock (core/clock.js, docs/GAME.md «Наблюдатель»): the world's seasons and a camp on the local map
// share one clock — while a camp is watched (hold) the world stands, whatever is pressed: a new pace, a start, a
// pause; let go (release), it goes on from the camp's own day. Run on fake timers, no browser. Part of `npm test`.
let now = 0, timers = [], nextId = 1;
globalThis.performance = {now: () => now};
globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.push({id, at: now + ms, fn}); return id; };
globalThis.clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
const {SeasonClock} = await import('../src/core/clock.js');
const advance = ms => { const end = now + ms; for (;;) { timers.sort((p, q) => p.at - q.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); } now = end; };

const bad = [];
const expect = (ok, what) => { if (!ok) bad.push(what); };
let seasons = 0;
const c = new SeasonClock({step: () => { seasons++; return true; }});
c.start(); advance(1);
expect(seasons === 1, `первый сезон шагнул: ${seasons}`);
advance(3000);   // half a season at the observer's pace (6000 ms)
c.hold(0.4);
expect(c.day() === 13, `удержание — на дне стоянки: ${c.day()}`);
advance(60000);
expect(seasons === 1, `пока стоянка на экране, мир стоит: сезонов ${seasons}`);
c.setPace('x4'); advance(60000);
expect(seasons === 1, `смена скорости во время стоянки не отпускает мир: сезонов ${seasons}`);
c.start(); advance(60000);
expect(seasons === 1, `и случайный start() тоже: сезонов ${seasons}`);
expect(c.running && c.day() === 13, `часы «идут» (удержаны) и день тот же: ${c.running}, ${c.day()}`);
c.release();
advance(0.6 * 1500 - 1);
expect(seasons === 1, `после стоянки досматривается остаток сезона в новой скорости: сезонов ${seasons}`);
advance(2);
expect(seasons === 2, `и дальше мир идёт: сезонов ${seasons}`);
c.pause(); advance(60000);
expect(seasons === 2, `пауза держит мир: сезонов ${seasons}`);

if (bad.length) { console.log('FAIL часы наблюдателя:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('ok   часы наблюдателя: стоянка держит мир при смене скорости, старте и паузе, отпускает с её дня');

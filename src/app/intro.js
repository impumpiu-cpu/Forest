// The launch screen (forest.html): a short slide show over the main menu, then the menu. A tap goes to the next slide;
// press and hold (mouse, finger or any key) skips it all, Esc skips at once. Not shown when the page opens a screen of
// its own (forest.html#settings) or with ?intro=0; ?intro=1 shows it whatever. Styles — intro.css. docs/GAME.md «Заставка».

const HOLD = 900;   // ms of holding that skip the show
const TAP = 250;    // a press shorter than this is a tap: the next slide

// the slides: `ms` on screen; lines appear one after another (`d` — delay, ms)
const SLIDES = [
  {ms: 3600, die: {to: 1, note: 'Бросок на сбор партии: 1.'}, lines: [
    {cls: 'kick', text: 'Эй, путник.'},
    {cls: 'head', text: 'Ты хочешь играть в ДнД или другие ролевые игры?', d: 350},
  ]},
  {ms: 6000, lines: [
    {cls: 'head', text: '…но никак не можешь собрать компанию?', d: 0},
    {cls: 'sub', text: 'Или у всех снова нет времени?', d: 700},
  ], chat: [
    ['Мастер', 'Ну что, суббота, 18:00? Я карту нарисовал', 1300],
    ['Гоша', 'я пас, у тёщи юбилей', 2100],
    ['Лена', 'а давайте в следующую', 2800],
    ['Серёга', 'мы паладина с прошлого раза так до таверны и не довели', 3500],
    [null, 'Сессия перенесена. Снова. (47-й раз)', 4400],
  ]},
  {ms: 3200, die: {to: 20, note: 'Критический успех.', hot: true}, lines: [
    {cls: 'big', text: 'Эта игра — для тебя!', d: 900},
  ]},
  {ms: 4600, lines: [
    {cls: 'head', text: 'Теперь НРИ играет сама в себя,'},
    {cls: 'head ember', text: 'а ты просто смотришь и плачешь.', d: 1200},
    {cls: 'foot', text: '* платочки в комплект не входят', d: 2600},
  ]},
  {ms: 3600, title: true, lines: [
    {cls: 'beta', text: 'открытый бета-тест', d: 500},
    {cls: 'sub', text: 'Кубики бросает компьютер. Переживать — всё ещё тебе.', d: 1100},
  ]},
];

// whether the launch screen should play on this load
export function introWanted() {
  const q = new URLSearchParams(location.search).get('intro');
  if (q === '0') return false;
  if (q === '1') return true;
  return !location.hash.slice(1);
}

// plays the show over the page; resolves once it is gone
export function playIntro({title = document.title} = {}) {
  return new Promise(resolve => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = el('div', 'intro');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Заставка. Нажмите и удерживайте, чтобы пропустить');
    root.tabIndex = -1;
    const sky = el('canvas', 'intro-sky');
    const stage = el('div', 'intro-stage');
    const hint = el('div', 'intro-hint');
    hint.innerHTML = '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fill" pathLength="100"/></svg><span>Нажмите и удерживайте для пропуска</span>';
    root.append(sky, stage, hint);
    document.body.append(root);
    document.body.classList.add('intro-on');
    root.focus({preventScroll: true});

    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const loops = new Set();   // intervals of the slide on screen: they go with it
    const every = (fn, ms) => { const t = setInterval(fn, ms); loops.add(t); return () => { clearInterval(t); loops.delete(t); }; };
    const clear = () => { for (const t of timers) clearTimeout(t); timers.clear(); for (const t of loops) clearInterval(t); loops.clear(); };
    const stopSky = still ? () => {} : embers(sky);

    let at = -1, done = false;
    function go(i) {
      if (done) return;
      clear();
      if (i >= SLIDES.length) return finish();
      at = i;
      stage.querySelectorAll('.intro-slide.off').forEach(o => o.remove());   // (tapped through faster than they fade)
      const old = stage.querySelector('.intro-slide.on');
      if (old) { old.classList.replace('on', 'off'); later(() => old.remove(), 600); }
      const s = slide(SLIDES[i], title, still, later, every);
      stage.append(s);
      requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('on')));
      later(() => go(at + 1), SLIDES[i].ms);
    }
    function finish() {
      if (done) return;
      done = true; clear(); unbind();
      root.classList.add('gone');
      setTimeout(() => {
        stopSky(); root.remove(); document.body.classList.remove('intro-on');
        resolve();
      }, still ? 0 : 650);
    }

    // press and hold to skip; a short press is a tap — the next slide
    let held = 0, raf = 0;
    const ring = hint.querySelector('.fill');
    function down(e) {
      if (done) return;
      if (e.type === 'keydown') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault(); e.stopPropagation();   // (the menu's keys — G, F, Esc — wait for the show to end)
        if (e.key === 'Escape') return finish();
        if (e.repeat) return;
      }
      if (held) return;
      held = performance.now();
      hint.classList.add('holding');
      const tick = () => {
        const p = Math.min(1, (performance.now() - held) / HOLD);
        ring.style.strokeDashoffset = String(100 - p * 100);
        if (p >= 1) { held = 0; return finish(); }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function up(e) {
      if (done || !held) return;
      const dt = performance.now() - held;
      held = 0; cancelAnimationFrame(raf);
      hint.classList.remove('holding');
      ring.style.strokeDashoffset = '100';
      if (dt < TAP && e?.type !== 'blur' && e?.type !== 'pointercancel') go(at + 1);
    }
    const off = [
      on(root, 'pointerdown', e => { if (e.button === 0) down(e); }),
      on(window, 'pointerup', up), on(window, 'pointercancel', up), on(window, 'blur', up),
      on(window, 'keydown', down, true), on(window, 'keyup', up, true),
      on(root, 'contextmenu', e => e.preventDefault()),
    ];
    const unbind = () => { cancelAnimationFrame(raf); off.forEach(f => f()); };

    go(0);
  });
}

// ── one slide
function slide(sp, title, still, later, every) {
  const s = el('section', 'intro-slide');
  if (sp.die) s.append(die(sp.die, still, later, every));
  if (sp.title) {
    const h = el('h1', 'intro-title'); h.textContent = title; s.append(h);
  }
  for (const ln of sp.lines) {
    const p = el(ln.cls.startsWith('big') ? 'h2' : 'p', 'ln ' + ln.cls);
    p.textContent = ln.text;
    p.style.setProperty('--d', `${ln.d || 0}ms`);
    s.append(p);
  }
  if (sp.chat) {
    const box = el('div', 'intro-chat');
    for (const [who, text, d] of sp.chat) {
      const m = el('div', who ? 'msg' : 'msg sys');
      m.style.setProperty('--d', `${d}ms`);
      if (who) { const b = el('b'); b.textContent = who; m.append(b); }
      const t = el('span'); t.textContent = text; m.append(t);
      box.append(m);
    }
    s.append(box);
  }
  return s;
}

// a d20 that tumbles and lands on `to`
function die({to, note, hot}, still, later, every) {
  const w = el('div', 'intro-die' + (hot ? ' hot' : ''));
  w.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <polygon class="hex" points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27"/>
    <polygon class="tri" points="50,22 76,68 24,68"/>
    <path class="edge" d="M50,22 L10.2,27 M50,22 L50,4 M50,22 L89.8,27 M76,68 L89.8,27 M76,68 L89.8,73 M76,68 L50,96 M24,68 L50,96 M24,68 L10.2,73 M24,68 L10.2,27"/>
    <text x="50" y="58">${still ? to : 7}</text></svg>`;
  const cap = el('p', 'die-note'); cap.textContent = note;
  w.append(cap);
  if (!still) {
    const t = w.querySelector('text');
    const faces = [3, 17, 8, 12, 5, 19, 2, 14, 11, 6, 16, 9];
    let k = 0;
    const stop = every(() => { t.textContent = String(faces[k++ % faces.length]); }, 70);
    later(() => { stop(); t.textContent = String(to); w.classList.add('landed'); }, 900);
  } else w.classList.add('landed');
  return w;
}

// embers rising over the dark: the screen's sky; returns the stop
function embers(cv) {
  const g = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
  const fit = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  };
  fit();
  const n = Math.round(Math.min(70, Math.max(24, w * h / 26000)));
  const spawn = (fresh) => ({
    x: Math.random() * w, y: fresh ? h + 10 : Math.random() * h,
    r: 0.6 + Math.random() * 1.8, v: 14 + Math.random() * 38,
    sway: Math.random() * Math.PI * 2, life: 0.4 + Math.random() * 0.6,
  });
  const ps = Array.from({length: n}, () => spawn(false));
  const step = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.y -= p.v * dt; p.sway += dt * 1.3; p.x += Math.sin(p.sway) * 12 * dt;
      if (p.y < -10) { ps[i] = spawn(true); continue; }
      const a = p.life * Math.min(1, p.y / h * 1.4);
      g.beginPath();
      g.fillStyle = `rgba(232,137,58,${a.toFixed(3)})`;
      g.shadowColor = 'rgba(232,137,58,.8)'; g.shadowBlur = 6 * p.r;
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  addEventListener('resize', fit);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function on(t, type, fn, cap = false) { t.addEventListener(type, fn, cap); return () => t.removeEventListener(type, fn, cap); }

// «Настройки → Таблицы»: every table of src/data/schema/ (docs/TABLE.md, этапы 2–3). A list of tables by group,
// the table with sorting and a filter, the schema's notes on hover, the table to a .csv or .json file, the check
// of every value against its column (the same as `npm run tables`) — and edits for experiments: a click on a cell
// in edit mode writes a new value over the code's (src/data/schema/edits.js); the layer is kept in this browser
// and in files (src/ui/tableEdits.js), and goes into every new game and world.
import {TABLES, GROUPS, get, checkAll, editable, tableById} from '../data/schema/index.js';
import {setCell, resetCell, resetTable, resetAll, isEdited, originalOf, editList, editCount, LAYER} from '../data/schema/edits.js';
import {storeEdits, editsJSON, loadEditsText, BOOT_PROBLEMS} from '../ui/tableEdits.js';
import {STATS} from '../data/special.js';
import {esc} from '../core/util.js';

const $ = id => document.getElementById(id);
const STORE = 'forest.app.table';

// ── how a value reads in a cell
const fmtNum = v => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)).replace('-', '−');
const enumLabel = (values, v) => { if (Array.isArray(values)) return v; const x = values[v]; return x && typeof x === 'object' ? x.label ?? v : typeof x === 'string' ? x : v; };
const colour = v => (Array.isArray(v) ? `rgb(${v.join(',')})` : v);
const fnText = f => String(f).replace(/\s+/g, ' ').trim();

function cell(c, v) {
  if (v == null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function' && !Object.keys(v).length)) return {html: '', text: ''};
  switch (c.type) {
    case 'num': case 'int': return {html: esc(fmtNum(v)), text: fmtNum(v), cls: 'num'};
    case 'bool': return {html: v ? '✓' : '—', text: v ? 'да' : 'нет'};
    case 'enum': { const l = String(enumLabel(c.values, v)); return {html: `<span title="${esc(String(v))}">${esc(l)}</span>`, text: `${l} ${v}`}; }
    case 'ids': return {html: esc(v.join(', ')), text: v.join(' ')};
    case 'map': {
      const e = Object.entries(v);
      if (!c.values && e.every(([, x]) => typeof x === 'number')) e.sort((a, b) => b[1] - a[1]);
      const show = x => (c.values ? String(enumLabel(c.values, x)) : typeof x === 'number' ? fmtNum(x) : String(x));
      return {html: `<div class="chips">${e.map(([k, x]) => `<span><b>${esc(k)}</b>${esc(show(x))}</span>`).join('')}</div>`, text: e.map(([k, x]) => `${k} ${show(x)}`).join(' ')};
    }
    case 'special': {
      const e = Object.entries(v);
      return {html: `<div class="sp">${e.map(([k, [lo, hi]]) => `<span><b>${k}</b>${lo === hi ? fmtNum(lo) : `${fmtNum(lo)}–${fmtNum(hi)}`}</span>`).join('')}</div>`, text: e.map(([k, [lo, hi]]) => `${k} ${lo}-${hi}`).join(' ')};
    }
    case 'shift': { const t = Object.entries(v).map(([k, x]) => `${x > 0 ? '+' : ''}${fmtNum(x)} ${k}`).join(', '); return {html: esc(t), text: t}; }
    case 'color': return {html: `<span class="sw" style="background:${esc(colour(v))}"></span>${esc(Array.isArray(v) ? v.join(',') : v)}`, text: String(v)};
    case 'formula': { const t = fnText(v); return {html: `<code title="${esc(t)}">${esc(t.length > 140 ? t.slice(0, 140) + '…' : t)}</code>`, text: t}; }
    case 'list': { const t = c.show ? c.show(v) : String(v); return {html: esc(t), text: t}; }
    case 'json': { const t = typeof v === 'string' ? v : JSON.stringify(v); return {html: esc(t), text: t, cls: typeof v === 'number' ? 'num' : ''}; }
    default: return {html: esc(String(v)), text: String(v)};
  }
}

// what a column sorts by: numbers as numbers, the rest as the text shown
const sortKey = (c, v, text) => (typeof v === 'number' ? v : v == null || text === '' ? null : text.toLocaleLowerCase('ru'));

// raw value for the files: numbers and words as they are, the rest as JSON (functions as their code)
const raw = v => (v == null ? '' : typeof v === 'function' ? fnText(v) : typeof v === 'object' ? JSON.stringify(v) : v === Infinity ? 'Infinity' : v);

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── editing: a value as the text in its editor, and the text back as a value (the same words the cell shows)
function editText(c, v) {
  if (v == null) return '';
  switch (c.type) {
    case 'map': return Object.entries(v).map(([k, x]) => `${k} ${x === Infinity ? '∞' : x}`).join(', ');
    case 'special': return Object.entries(v).map(([k, [lo, hi]]) => `${k} ${lo}-${hi}`).join(', ');
    case 'shift': return Object.entries(v).map(([k, x]) => `${k} ${x > 0 ? '+' : ''}${x}`).join(', ');
    case 'ids': return v.join(', ');
    case 'json': return typeof v === 'string' ? v : JSON.stringify(v);
    default: return String(v);
  }
}
const num = t => { const s = String(t).trim().replace(',', '.').replace('−', '-'); if (s === '∞' || /^infinity$/i.test(s)) return Infinity; const n = Number(s); if (s === '' || Number.isNaN(n)) throw new Error(`«${t}» — не число`); return n; };
const parts = t => String(t).split(/[,;·\n]+/).map(x => x.trim()).filter(Boolean);
function enumWord(values, w) {
  if (Array.isArray(values)) return w;
  if (Object.prototype.hasOwnProperty.call(values, w)) return w;
  const hit = Object.entries(values).find(([, x]) => (x && typeof x === 'object' ? x.label : x) === w);
  return hit ? hit[0] : w;
}
function parseText(c, text) {
  const t = String(text).trim();
  switch (c.type) {
    case 'num': case 'int': return num(t);
    case 'text': return t;
    case 'ids': return parts(t);
    case 'map': return Object.fromEntries(parts(t).map(p => { const m = p.match(/^(\S+)\s+(.+)$/); if (!m) throw new Error(`«${p}»: нужно «ключ значение»`); return [m[1], c.values ? enumWord(c.values, m[2].trim()) : num(m[2])]; }));
    case 'special': return Object.fromEntries(parts(t).map(p => {
      const m = p.match(/^([A-Za-z])\s*(-?[\d.]+)\s*(?:[-–…]+\s*(-?[\d.]+))?$/); if (!m) throw new Error(`«${p}»: нужно «S 1-10»`);
      const k = m[1].toUpperCase(); if (!STATS.has(k)) throw new Error(`нет характеристики «${m[1]}»`);
      return [k, [num(m[2]), num(m[3] ?? m[2])]];
    }));
    case 'shift': return Object.fromEntries(parts(t).map(p => {
      const q = p.replace('−', '-');
      let m = q.match(/^([A-Za-z])\s*([+-]?[\d.]+)$/), k, n;
      if (m) [k, n] = [m[1], m[2]];
      else { m = q.match(/^([+-]?[\d.]+)\s*([A-Za-z])$/); if (!m) throw new Error(`«${p}»: нужно «S +1»`); [n, k] = [m[1], m[2]]; }
      if (!STATS.has(k.toUpperCase())) throw new Error(`нет характеристики «${k}»`);
      return [k.toUpperCase(), num(n)];
    }));
    case 'json': { try { return JSON.parse(t); } catch (e) { const n = Number(t.replace(',', '.')); return t !== '' && !Number.isNaN(n) ? n : t; } }
    default: return t;
  }
}

export class TablesView {
  constructor() {
    this.id = (() => { try { return localStorage.getItem(STORE); } catch (e) { return null; } })();
    if (!TABLES.some(t => t.id === this.id)) this.id = TABLES[0].id;
    this.sort = null; this.query = '';
    $('tablesNav').innerHTML = GROUPS.map(g => {
      const list = TABLES.filter(t => t.group === g); if (!list.length) return '';
      return `<div class="grp"><span>${esc(g)}</span>${list.map(t => `<button type="button" data-t="${t.id}"><span>${esc(t.label)}</span><small>${t.rows().length}</small></button>`).join('')}</div>`;
    }).join('');
    $('tablesNav').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) this.open(b.dataset.t); });
    $('tblFilter').addEventListener('input', e => { this.query = e.target.value.trim().toLocaleLowerCase('ru'); this.draw(); });
    $('tbl').addEventListener('click', e => {
      const th = e.target.closest('th[data-c]'); if (!th) return;
      const k = +th.dataset.c;
      this.sort = this.sort?.col === k ? (this.sort.dir > 0 ? {col: k, dir: -1} : null) : {col: k, dir: 1};
      this.draw();
    });
    $('tblCsv').addEventListener('click', () => this.file('csv'));
    $('tblJson').addEventListener('click', () => this.file('json'));
    // ── edits
    this.editing = false;
    $('edMode').addEventListener('click', () => { this.editing = !this.editing; this.draw(); this.bar(); });
    $('tbl').addEventListener('click', e => {
      if (e.target.closest('th')) return;
      const undo = e.target.closest('[data-undo]');
      if (undo) { const td = undo.closest('td'); this.undo(td.dataset.r, this.table.columns[+td.dataset.c].key); return; }
      const td = e.target.closest('td.ed'); if (td && !td.querySelector('.cell-ed')) this.edit(td);
    });
    $('edList').addEventListener('click', e => {
      const b = e.target.closest('[data-undo-t]'); if (b) { resetCell(b.dataset.undoT, b.dataset.undoR, b.dataset.undoC); this.changed(); return; }
      const go = e.target.closest('[data-go-t]'); if (go) this.open(go.dataset.goT);
    });
    $('edResetTable').addEventListener('click', () => { if (!LAYER[this.id]) return; if (confirm(`Сбросить правки таблицы «${this.table.label}»?`)) { resetTable(this.id); this.changed(`Правки таблицы «${this.table.label}» сброшены.`); } });
    $('edResetAll').addEventListener('click', () => { if (!editCount()) return; if (confirm('Сбросить все правки таблиц? Игра вернётся к числам кода.')) { resetAll(); this.changed('Все правки сброшены.'); } });
    $('edSave').addEventListener('click', () => { if (!editCount()) { this.say('Правок нет — выгружать нечего.'); return; } download('forest-tables.json', editsJSON(), 'application/json'); });
    $('edLoad').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { const bad = loadEditsText(await f.text()); this.changed(bad.length ? `Загружено, но не всё (${bad.length}): ${bad.slice(0, 3).join('; ')}${bad.length > 3 ? '…' : ''}` : `Правки загружены: ${editCount()}.`); }
      catch (err) { this.say(`Не удалось загрузить: ${err.message}`, true); }
    });
    this.rendered = false;
  }

  get table() { return TABLES.find(t => t.id === this.id); }

  // the first time the screen is shown: the table and the check (the check reads every table, so not at load)
  show() {
    if (!this.rendered) {
      this.rendered = true; this.open(this.id); this.check(); this.bar();
      if (BOOT_PROBLEMS.length) this.say(`Часть сохранённых правок не применилась (${BOOT_PROBLEMS.length}): ${BOOT_PROBLEMS.slice(0, 3).join('; ')}`, true);
    }
  }

  say(text, bad = false) { const m = $('edMsg'); m.textContent = text; m.classList.toggle('bad', bad); }

  // after any change of the layer: keep it, redraw, check again
  changed(msg) { storeEdits(); this.draw(); this.bar(); this.check(); this.navMarks(); if (msg != null) this.say(msg); }

  // the bar over the tables: how many edits, and their list
  bar() {
    const n = editCount();
    $('edCount').textContent = n ? `Правок: ${n}` : 'Правок нет';
    $('edMode').setAttribute('aria-pressed', String(this.editing));
    $('edMode').textContent = this.editing ? 'Правка: вкл' : 'Правка: выкл';
    $('edResetTable').disabled = !LAYER[this.id]; $('edResetAll').disabled = !n;
    const list = editList();
    $('edList').hidden = !n;
    $('edList').innerHTML = n ? `<summary>Все правки (${n})</summary><ul>${list.map(e => {
      const t = tableById(e.table), c = t?.columns.find(x => x.key === e.column);
      const show = v => (c ? cell(c, v).text || '—' : JSON.stringify(v));
      return `<li><button type="button" class="link" data-go-t="${esc(e.table)}">${esc(t?.label || e.table)}</button> · ${esc(e.row)} · ${esc(c?.label || e.column)}: <s>${esc(show(e.was))}</s> → <b>${esc(show(e.value))}</b> <button type="button" class="quiet mini" data-undo-t="${esc(e.table)}" data-undo-r="${esc(e.row)}" data-undo-c="${esc(e.column)}" title="Вернуть число кода">↺</button></li>`;
    }).join('')}</ul>` : '';
  }

  // the tables with edits are marked in the list
  navMarks() {
    $('tablesNav').querySelectorAll('[data-t]').forEach(b => {
      const n = Object.values(LAYER[b.dataset.t] || {}).reduce((m, cols) => m + Object.keys(cols).length, 0);
      b.classList.toggle('has-ed', n > 0); b.title = n ? `правок: ${n}` : '';
    });
  }

  undo(rowKey, colKey) { resetCell(this.id, rowKey, colKey); this.changed('Возвращено число кода.'); }

  // the editor in a cell: a box for its kind of value; Enter or leaving it writes, Esc cancels
  edit(td) {
    const t = this.table, c = t.columns[+td.dataset.c], rowKey = td.dataset.r;
    const row = t.rows().find(r => String(get(r, t.key)) === rowKey), v = get(row, c.key);
    const commit = value => {
      const res = setCell(this.id, rowKey, c.key, value);
      if (res.error) { this.say(res.error, true); this.draw(); return; }
      this.changed(isEdited(this.id, rowKey, c.key) ? `${t.label} · ${rowKey} · ${c.label}: записано.` : `${t.label} · ${rowKey} · ${c.label}: снова как в коде.`);
    };
    if (c.type === 'bool') { commit(!v); return; }
    let box;
    const refKeys = typeof c.ref === 'string' ? tableById(c.ref)?.rows().map(r => String(get(r, tableById(c.ref).key))) : null;
    if (c.type === 'enum' || (c.type === 'ref' && refKeys)) {
      const opts = c.type === 'enum' ? (Array.isArray(c.values) ? c.values.map(x => [x, x]) : Object.entries(c.values).map(([k, x]) => [k, x && typeof x === 'object' ? x.label ?? k : typeof x === 'string' ? x : k])) : refKeys.map(k => [k, k]);
      box = document.createElement('select');
      box.innerHTML = `<option value="">—</option>` + opts.map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(String(l))}${l !== k ? ` · ${esc(k)}` : ''}</option>`).join('');
    } else {
      box = document.createElement('input');
      box.type = 'text'; box.inputMode = c.type === 'num' || c.type === 'int' ? 'decimal' : 'text';
      box.value = editText(c, v);
      box.placeholder = {map: 'ключ значение, ключ значение', special: 'S 1-10, P 3-11', shift: 'S +1, I -1', ids: 'id, id'}[c.type] || '';
    }
    box.className = 'cell-ed';
    td.innerHTML = ''; td.append(box); box.focus(); if (box.select) box.select();
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      if (!ok) { this.draw(); return; }
      if (box.tagName === 'SELECT') { commit(box.value === '' ? undefined : box.value); return; }
      if (box.value.trim() === '' && v == null) { this.draw(); return; }
      try { commit(box.value.trim() === '' ? undefined : parseText(c, box.value)); } catch (err) { this.say(`${c.label}: ${err.message}`, true); this.draw(); }
    };
    box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    box.addEventListener('blur', () => finish(true));
    if (box.tagName === 'SELECT') box.addEventListener('change', () => finish(true));
  }

  open(id) {
    this.id = id; this.sort = null;
    try { localStorage.setItem(STORE, id); } catch (e) { /* storage unavailable */ }
    $('tablesNav').querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-current', String(b.dataset.t === id)));
    const t = this.table;
    $('tblTitle').textContent = t.label + (t.computed ? ' · вычисляется' : '');
    if (this.rendered) this.bar();
    $('tblNote').textContent = t.note || '';
    this.draw();
  }

  // the rows as cells, filtered and sorted
  view() {
    const t = this.table;
    let rows = t.rows().map(r => {
      const cells = t.columns.map(c => cell(c, get(r, c.key)));
      return {r, cells, hay: cells.map(x => x.text).join(' ').toLocaleLowerCase('ru')};
    });
    if (this.query) rows = rows.filter(x => x.hay.includes(this.query));
    if (this.sort) {
      const {col: k, dir} = this.sort, c = t.columns[k];
      rows.sort((a, b) => {
        const x = sortKey(c, get(a.r, c.key), a.cells[k].text), y = sortKey(c, get(b.r, c.key), b.cells[k].text);
        if (x == null) return y == null ? 0 : 1; if (y == null) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ru')) * dir;
      });
    }
    return rows;
  }

  draw() {
    const t = this.table, rows = this.view(), all = t.rows().length;
    const calc = c => t.computed || c.computed;
    const head = t.columns.map((c, k) => `<th data-c="${k}" class="${calc(c) ? 'calc' : ''}"${this.sort?.col === k ? ` aria-sort="${this.sort.dir > 0 ? 'ascending' : 'descending'}"` : ''} title="${esc([c.note, c.min != null || c.max != null ? `пределы ${c.min ?? '…'} … ${c.max ?? '…'}` : '', calc(c) ? 'вычисляется' : ''].filter(Boolean).join(' · '))}">${esc(c.label)}<span class="k">${esc(c.key)}</span></th>`).join('');
    const body = rows.map(x => {
      const key = String(get(x.r, t.key));
      return `<tr>${x.cells.map((v, k) => {
        const c = t.columns[k], ed = this.editing && editable(t, c), changed = isEdited(t.id, key, c.key);
        const cls = [v.cls, calc(c) ? 'calc' : '', ed ? 'ed' : '', changed ? 'changed' : ''].filter(Boolean).join(' ');
        const was = changed ? ` title="${esc(`в коде: ${cell(c, originalOf(t.id, key, c.key)).text || '—'}`)}"` : '';
        return `<td class="${cls}" data-r="${esc(key)}" data-c="${k}"${was}>${v.html}${changed ? '<button type="button" class="undo" data-undo title="Вернуть число кода">↺</button>' : ''}</td>`;
      }).join('')}</tr>`;
    }).join('');
    $('tbl').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    $('tblCount').textContent = rows.length === all ? `${all} строк · ${t.columns.length} столбцов` : `${rows.length} из ${all} строк`;
  }

  // the table as shown (filtered and sorted) to a file
  file(kind) {
    const t = this.table, rows = this.view();
    if (kind === 'json') {
      const out = rows.map(x => Object.fromEntries(t.columns.map(c => [c.key, typeof get(x.r, c.key) === 'function' ? fnText(get(x.r, c.key)) : get(x.r, c.key) ?? null])));
      download(`${t.id}.json`, JSON.stringify(out, (k, v) => (v === Infinity ? 'Infinity' : v), 2), 'application/json');
      return;
    }
    // ; and a BOM: Excel in a Russian locale opens it as a table straight away
    const q = v => { const s = String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [t.columns.map(c => q(c.label)).join(';'), t.columns.map(c => q(c.key)).join(';'), ...rows.map(x => t.columns.map(c => q(raw(get(x.r, c.key)))).join(';'))];
    download(`${t.id}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  check() {
    const errs = checkAll(), box = $('tblCheck');
    box.classList.toggle('bad', errs.length > 0);
    box.innerHTML = errs.length
      ? `Проверка: ${errs.length} несоответствий.<details><summary>Показать</summary><ul>${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul></details>`
      : `Проверка: все значения в пределах, ссылки сходятся (${TABLES.length} таблиц).`;
  }
}

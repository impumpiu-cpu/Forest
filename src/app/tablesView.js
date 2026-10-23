// «Настройки → Таблицы»: every table of src/data/schema/ shown as it is — read only for now (docs/TABLE.md,
// этап 2; the layer of experimental edits is этап 3). A list of tables by group, the table with sorting and a
// filter, the schema's notes on hover, the table to a .csv or .json file, and the check of every value
// against its column (the same as `npm run tables`).
import {TABLES, GROUPS, get, checkAll} from '../data/schema/index.js';
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
    this.rendered = false;
  }

  get table() { return TABLES.find(t => t.id === this.id); }

  // the first time the screen is shown: the table and the check (the check reads every table, so not at load)
  show() {
    if (!this.rendered) { this.rendered = true; this.open(this.id); this.check(); }
  }

  open(id) {
    this.id = id; this.sort = null;
    try { localStorage.setItem(STORE, id); } catch (e) { /* storage unavailable */ }
    $('tablesNav').querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-current', String(b.dataset.t === id)));
    const t = this.table;
    $('tblTitle').textContent = t.label + (t.computed ? ' · вычисляется' : '');
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
    const body = rows.map(x => `<tr>${x.cells.map((v, k) => `<td class="${[v.cls, calc(t.columns[k]) ? 'calc' : ''].filter(Boolean).join(' ')}">${v.html}</td>`).join('')}</tr>`).join('');
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

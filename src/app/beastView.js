// «Конструктор существ» (forest.html, docs/TABLES.md): every beast, monster and spirit of the game as one form —
// its names and looks, the tags, the body (SPECIAL, health, speed, the blow), the list of behaviours it thinks by
// (docs/BEHAVIOUR.md) and the deeds its lairs do on the world map (docs/WORLD.md «Нравы»), the blocks its behaviours read (prey, flight, grazing, the kick, the spell), where it lives
// and how it comes, what it yields, what the herders call it. The form is the columns of the tables «Монстры и
// звери», «Повадки видов» and «Клички» (src/data/schema/) gathered for one species: every field is a cell of a
// table, written through the same layer of edits (src/data/schema/edits.js), kept in this browser and in files
// (src/ui/tableEdits.js). A new species is a copy of one the code has, under a new id (data/species.js cloneSpecies),
// kept in the layer too and made again at every start.
import {SPECIES, KINDS} from '../data/species.js';
import {TAGS} from '../data/tags.js';
import {BEHAVIOURS, BANDS, BAND_LABELS} from '../data/behaviours.js';
import {DEEDS, DEED_BANDS, DEED_BAND_LABELS, DEED_WAYS} from '../data/deeds.js';
import {WAYS} from '../data/behaviour.js';
import {tableById, get, editable} from '../data/schema/index.js';
import {setCell, resetCell, isEdited, originalOf, addSpecies, dropSpecies, isNewSpecies, editCount} from '../data/schema/edits.js';
import {storeEdits} from '../ui/tableEdits.js';
import {editText, parseText} from '../ui/cellEdit.js';
import {LOOKS} from '../render/looks.js';
import {esc} from '../core/util.js';
import {VERSION} from '../version.js';

const $ = id => document.getElementById(id);
const STORE = 'forest.app.beast';
// the kinds of the list in the order of data/species.js KINDS; the races are not made here
const kindOrder = () => Object.keys(KINDS).filter(k => k !== 'race');

// the sections of the form: which table's columns, which keys (a prefix takes a block: `predator.` is every column of it)
const SECTIONS = [
  {id: 'name', label: 'Имя и облик', table: 'creatures', keys: ['label', 'labelAcc', 'plural', 'legend', 'kind', 'mind', 'look.shape', 'look.size', 'look.color', 'look.skin']},
  {id: 'tags', label: 'Теги', table: 'creatures', tags: true},
  {id: 'body', label: 'Тело (data/balance/creatures.js)', table: 'creatures', keys: ['special', 'hp', 'speed', 'attack.power', 'attack.cooldown', 'attack.type', 'ks', 'weakTo']},
  {id: 'where', label: 'Где живёт', table: 'creatures', keys: ['habitat']},
  {id: 'ways', label: 'Поведение', table: 'creatures', keys: ['behaviours', 'heart'], lists: true},
  {id: 'mores', label: 'Нравы на карте мира (логово, главарь)', table: 'creatures', keys: ['deeds.lair'], lists: true},
  {id: 'needs', label: 'Потребности, жар и приход', table: 'speciesWays', keys: ['needs', 'heatHarm', 'fearHeat', 'arrive.', 'leaveChance', 'respawn', 'restAt', 'mends']},
  {id: 'blocks', label: 'Числа повадок', table: 'speciesWays', keys: ['flee.', 'grazes.', 'herd.', 'predator.', 'mule.', 'vermin.', 'spirit.', 'venom.', 'web.', 'breath', 'drinks', 'sun', 'rots']},
  {id: 'yields', label: 'Добыча и приручение', table: 'speciesWays', keys: ['yields.', 'trophies', 'tame.', 'tameWith']},
  {id: 'names', label: 'Клички', table: 'nicknames', keys: ['names']},
];

// the list fields: the catalogue they draw from, its lanes, the ready lists, and what to say above
const LIST_FIELDS = {
  behaviours: {catalogue: BEHAVIOURS, bands: BANDS, labels: BAND_LABELS, presetsFrom: 'data/behaviour.js WAYS',
    presets: Object.fromEntries(Object.entries(WAYS).filter(([k]) => !['livestock', 'leaver', 'led'].includes(k))),
    note: 'Порядок — порядок выбора: первая полоса, где есть что выбрать, прерывает остальные; внутри полосы побеждает оценка, при равной — первый в списке. Серое — поведение читает блок, которого у вида нет.'},
  'deeds.lair': {catalogue: DEEDS, bands: DEED_BANDS, labels: DEED_BAND_LABELS, presetsFrom: 'data/deeds.js DEED_WAYS',
    presets: Object.fromEntries(Object.entries(DEED_WAYS).filter(([k]) => ['lair', 'captors', 'dragon'].includes(k))),
    note: 'Что делают логова этого вида и их главари на карте мира (docs/WORLD.md «Нравы»): тот же выбор по полосам, внутри полосы — жребий по весам. Дело знает, кто спрашивает: без главаря subdue и rival не ходят, raid у зверей — только с вожаком. Род логова (где стоит, чем живёт) — таблица «Логова».'},
};

export class BeastView {
  constructor() {
    this.id = (() => { try { return localStorage.getItem(STORE); } catch (e) { return null; } })();
    this.query = '';
    $('bstNav').addEventListener('click', e => { const b = e.target.closest('[data-sp]'); if (b) this.open(b.dataset.sp); });
    $('bstFilter').addEventListener('input', e => { this.query = e.target.value.trim().toLocaleLowerCase('ru'); this.nav(); });
    $('bstNew').addEventListener('click', () => this.create());
    $('bstForm').addEventListener('click', e => {
      const undo = e.target.closest('[data-undo-c]'); if (undo) { this.undo(undo.dataset.undoT, undo.dataset.undoC); return; }
      const mv = e.target.closest('[data-mv]'); if (mv) { this.moveBehaviour(mv.dataset.key, mv.dataset.mv, +mv.dataset.d); return; }
      const drop = e.target.closest('#bstDrop'); if (drop) { this.drop(); }
    });
    $('bstForm').addEventListener('change', e => {
      const el = e.target;
      if (el.matches('[data-bh]')) { this.toggleBehaviour(el.dataset.key, el.dataset.bh, el.checked); return; }
      if (el.matches('[data-t][data-c]')) this.commit(el);
    });
    $('bstForm').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('input[data-t]')) { e.preventDefault(); e.target.blur(); }
      if (e.key === 'Escape' && e.target.matches('[data-t]')) { e.preventDefault(); e.stopPropagation(); this.draw(); }
    });
    $('bstForm').addEventListener('focusout', e => { if (e.target.matches('input[data-t]:not([type=checkbox]):not([type=color])') && e.target.dataset.dirty) this.commit(e.target); });
    $('bstForm').addEventListener('input', e => { if (e.target.matches('[data-t]')) e.target.dataset.dirty = '1'; });
  }

  show() {
    if (!this.rendered) { this.rendered = true; this.nav(); }
    if (!SPECIES.has(this.id) || SPECIES.get(this.id).kind === 'race') this.id = this.list()[0]?.id;
    this.open(this.id);
  }

  list() { return SPECIES.filter(s => s.kind !== 'race').sort((a, b) => kindOrder().indexOf(a.kind) - kindOrder().indexOf(b.kind) || a.label.localeCompare(b.label, 'ru')); }

  // the list of species by kind, the query filters it; the ones with edits are marked, new ones too
  nav() {
    const q = this.query;
    $('bstNav').innerHTML = kindOrder().map(k => {
      const rows = this.list().filter(s => s.kind === k && (!q || `${s.label} ${s.id} ${s.plural || ''}`.toLocaleLowerCase('ru').includes(q)));
      if (!rows.length) return '';
      return `<div class="grp"><span>${esc(KINDS[k])}</span>${rows.map(s => `<button type="button" data-sp="${esc(s.id)}" class="${this.hasEdits(s.id) ? 'has-ed' : ''}" aria-current="${String(s.id === this.id)}"><span>${esc(s.label)}${isNewSpecies(s.id) ? ' <i class="new">новый</i>' : ''}</span><small>${esc(s.id)}</small></button>`).join('')}</div>`;
    }).join('');
  }

  hasEdits(id) { return isNewSpecies(id) || ['creatures', 'speciesWays', 'nicknames'].some(t => tableById(t)?.columns.some(c => isEdited(t, id, c.key))); }

  say(text, bad = false) { const m = $('bstMsg'); m.textContent = text; m.classList.toggle('bad', bad); }
  changed(msg) { storeEdits(); this.draw(); this.nav(); if (msg != null) this.say(msg); $('buildTag').textContent = `версия ${VERSION}${editCount() ? ` · правки таблиц: ${editCount()}` : ''}`; }

  open(id) {
    if (!id || !SPECIES.has(id)) { $('bstForm').innerHTML = '<p class="note">Видов нет.</p>'; return; }
    this.id = id;
    try { localStorage.setItem(STORE, id); } catch (e) { /* storage unavailable */ }
    $('bstNav').querySelectorAll('[data-sp]').forEach(b => b.setAttribute('aria-current', String(b.dataset.sp === id)));
    this.say('');
    this.draw();
  }

  // ── the form
  draw() {
    const sp = SPECIES.get(this.id); if (!sp) return;
    const made = isNewSpecies(sp.id);
    const head = `<div class="bst-head">
      <canvas id="bstLook" width="96" height="96" aria-label="Облик"></canvas>
      <div><span class="tag">${esc(KINDS[sp.kind] || sp.kind)}${made ? ' · новый вид' : ''}</span><h3>${esc(sp.label)} <small>${esc(sp.id)}${sp.made ? ` ← ${esc(sp.made)}` : ''}</small></h3>
      <p class="note">${esc(this.summary(sp))}</p>
      ${made ? '<button type="button" id="bstDrop" class="danger mini">Убрать вид</button>' : ''}</div></div>`;
    const body = SECTIONS.map(S => this.section(S, sp)).filter(Boolean).join('');
    $('bstForm').innerHTML = head + body;
    this.preview(sp);
  }

  summary(sp) {
    const parts = [];
    if (sp.behaviours) parts.push(`думает по списку: ${sp.behaviours.join(' → ')}`);
    if (sp.deeds?.lair?.length) parts.push(`логова на карте мира: ${sp.deeds.lair.join(', ')}`);
    if (sp.needs?.length) parts.push(`потребности: ${sp.needs.join(', ')}`);
    if (sp.habitat) parts.push(`живёт: ${Object.keys(sp.habitat).length} биомов`);
    if (sp.arrive) parts.push(`приходит группами ${sp.arrive.group?.join('–')} раз в ${sp.arrive.every?.join('–')} дн.`);
    else if (!sp.resident) parts.push('на карту сам не приходит (нет блока arrive)');
    return parts.join('; ');
  }

  // a section: the fields of the table's columns that match its keys (a key with a dot at the end takes the block)
  section(S, sp) {
    const t = tableById(S.table); if (!t) return '';
    const row = t.rows().find(r => String(get(r, t.key)) === sp.id);
    if (!row) return '';
    if (S.tags) {
      // the species' yes/no words (data/tags.js), wherever their column lives
      const fields = TAGS.filter(d => d.on === 'species').map(d => {
        for (const tid of ['creatures', 'speciesWays']) { const tt = tableById(tid), c = tt.columns.find(x => x.key === d.field && x.type === 'bool'); if (c) return this.field(tid, sp.id, tt.rows().find(r => r.id === sp.id), {...c, label: d.label, note: `${d.note}. Читает: ${d.reads}`}); }
        return '';
      }).join('');
      return `<section class="bst-sec"><h4>${esc(S.label)}</h4><div class="bst-grid">${fields}</div></section>`;
    }
    let cols = t.columns.filter(c => S.keys.some(k => (k.endsWith('.') ? c.key.startsWith(k) : c.key === k)) && c.key !== t.key);
    cols = cols.filter(c => get(row, c.key) !== undefined || isEdited(S.table, sp.id, c.key) || S.id === 'name' || S.id === 'where' || (S.id === 'ways' && c.key === 'heart'));
    if (!cols.length) return '';
    const fields = cols.map(c => (S.lists && LIST_FIELDS[c.key] ? this.listField(S.table, sp, c) : this.field(S.table, sp.id, row, c))).join('');
    return `<section class="bst-sec"><h4>${esc(S.label)}</h4><div class="bst-grid">${fields}</div></section>`;
  }

  // one field: the column's editor by its type, the schema's note on hover, ↺ when edited
  field(tableId, rowKey, row, c) {
    const t = tableById(tableId), v = get(row, c.key), ed = isEdited(tableId, rowKey, c.key), can = editable(t, c);
    const was = ed ? originalOf(tableId, rowKey, c.key) : undefined;
    const attrs = `data-t="${esc(tableId)}" data-c="${esc(c.key)}" ${can ? '' : 'disabled'}`;
    let box;
    if (c.type === 'bool') box = `<label class="chk"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}> ${v ? 'да' : 'нет'}</label>`;
    else if (c.type === 'enum' || (c.type === 'ref' && typeof c.ref === 'string')) {
      const opts = c.type === 'enum' ? (Array.isArray(c.values) ? c.values.map(x => [x, x]) : Object.entries(c.values).map(([k, x]) => [k, x && typeof x === 'object' ? x.label ?? k : typeof x === 'string' ? x : k]))
        : tableById(c.ref).rows().map(r => [String(get(r, tableById(c.ref).key)), String(get(r, tableById(c.ref).key))]);
      box = `<select ${attrs}><option value="">—</option>${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === k ? 'selected' : ''}>${esc(String(l))}${l !== k ? ` · ${esc(k)}` : ''}</option>`).join('')}</select>`;
    } else if (c.key === 'look.shape') {
      box = `<select ${attrs}><option value="">—</option>${Object.keys(LOOKS).map(k => `<option value="${k}" ${v === k ? 'selected' : ''}>${k}</option>`).join('')}</select>`;
    } else if (c.type === 'color' && (v == null || /^#[0-9a-fA-F]{6}$/.test(v))) {
      box = `<span class="row"><input type="color" ${attrs} value="${esc(v || '#888888')}"><code>${esc(v || '—')}</code></span>`;
    } else if (c.type === 'list' || c.type === 'formula') {
      box = `<code class="ro">${esc(c.type === 'formula' ? String(v) : JSON.stringify(v))}</code>`;
    } else {
      const text = editText(c, v), long = c.type === 'json' && text.length > 40;
      box = long ? `<textarea ${attrs} rows="3">${esc(text)}</textarea>` : `<input type="text" ${attrs} value="${esc(text)}" placeholder="${{map: 'ключ значение, …', special: 'S 1-10, P 3-11', ids: 'id, id'}[c.type] || ''}">`;
    }
    return `<div class="field ${ed ? 'changed' : ''}" title="${esc(c.note || '')}"><span class="lbl">${esc(c.label)} <code>${esc(c.key)}</code>${ed ? ` <button type="button" class="quiet mini" data-undo-t="${esc(tableId)}" data-undo-c="${esc(c.key)}" title="Вернуть число кода: ${esc(editText(c, was) || '—')}">↺</button>` : ''}${c.computed ? ' <i>вычисляется</i>' : ''}</span>${box}</div>`;
  }

  // a list of the catalogue (the behaviours a creature thinks by; the deeds its lairs do): every row by lane, ticked if
  // the species lists it, in the species' order with ▲▼; one whose fields the species lacks cannot be ticked, the lack is said
  listField(tableId, sp, c) {
    const F = LIST_FIELDS[c.key], list = get(sp, c.key) || [], ed = isEdited(tableId, sp.id, c.key);
    const lanes = F.bands.map(b => {
      const rows = F.catalogue.filter(d => d.band === b).map(d => {
        const k = list.indexOf(d.id), on = k >= 0, lack = d.requires.filter(f => sp[f] == null);
        return `<li class="${on ? 'on' : ''} ${lack.length ? 'lack' : ''}" title="${esc(d.note || '')}">
          <label><input type="checkbox" data-bh="${d.id}" data-key="${esc(c.key)}" ${on ? 'checked' : ''} ${lack.length && !on ? 'disabled' : ''}> <b>${d.id}</b> <span>${esc(d.note || '')}</span></label>
          ${on ? `<span class="ord"><button type="button" class="quiet mini" data-mv="${d.id}" data-key="${esc(c.key)}" data-d="-1" ${k === 0 ? 'disabled' : ''}>▲</button>${k + 1}<button type="button" class="quiet mini" data-mv="${d.id}" data-key="${esc(c.key)}" data-d="1" ${k === list.length - 1 ? 'disabled' : ''}>▼</button></span>` : ''}
          ${lack.length ? `<small>нужно: ${lack.join(', ')}</small>` : ''}</li>`;
      }).join('');
      return rows ? `<div class="lane"><span>${esc(F.labels[b])}</span><ul>${rows}</ul></div>` : '';
    }).join('');
    const presets = Object.entries(F.presets).map(([k, v]) => `<option value="${k}">${k}: ${v.join(', ')}</option>`).join('');
    return `<div class="field bst-ways ${ed ? 'changed' : ''}"><span class="lbl">${esc(c.label)} <code>${esc(c.key)}</code>${ed ? ` <button type="button" class="quiet mini" data-undo-t="${esc(tableId)}" data-undo-c="${esc(c.key)}" title="Вернуть список кода">↺</button>` : ''}
      <select data-t="creatures" data-c="${esc(c.key)}" data-preset="1" title="Готовый список (${esc(F.presetsFrom)})"><option value="">готовый список…</option>${presets}</select></span>
      <p class="note">${F.note}</p>${lanes}</div>`;
  }

  // ── writing
  commit(el) {
    const tableId = el.dataset.t, key = el.dataset.c, t = tableById(tableId), c = t.columns.find(x => x.key === key);
    delete el.dataset.dirty;
    let value;
    try {
      if (el.dataset.preset) { if (!el.value) return; value = [...LIST_FIELDS[key].presets[el.value]]; }
      else if (el.type === 'checkbox') value = el.checked;
      else if (el.tagName === 'SELECT') value = el.value === '' ? undefined : el.value;
      else if (el.type === 'color') value = el.value;
      else value = el.value.trim() === '' ? undefined : parseText(c, el.value);
    } catch (err) { this.say(`${c.label}: ${err.message}`, true); return; }
    const res = setCell(tableId, this.id, key, value);
    if (res.error) { this.say(res.error, true); this.draw(); return; }
    this.changed(isEdited(tableId, this.id, key) ? `${c.label}: записано.` : `${c.label}: снова как в коде.`);
  }
  undo(tableId, key) { resetCell(tableId, this.id, key); this.changed('Возвращено число кода.'); }

  toggleBehaviour(key, id, on) {
    const sp = SPECIES.get(this.id), list = (get(sp, key) || []).filter(x => x !== id);
    if (on) list.push(id);
    const res = setCell('creatures', this.id, key, list);
    if (res.error) { this.say(res.error, true); this.draw(); return; }
    this.changed(`${on ? 'добавлено' : 'убрано'}: ${id}.`);
  }
  moveBehaviour(key, id, d) {
    const list = [...(get(SPECIES.get(this.id), key) || [])], k = list.indexOf(id), j = k + d;
    if (k < 0 || j < 0 || j >= list.length) return;
    [list[k], list[j]] = [list[j], list[k]];
    const res = setCell('creatures', this.id, key, list);
    if (res.error) { this.say(res.error, true); return; }
    this.changed(null);
  }

  // ── a new species: a copy of the one open, under a new id and name
  create() {
    const base = SPECIES.get(this.id);
    const id = prompt(`Новый вид на основе «${base.label}» (${base.id}).\nЛатинский id (буквы, цифры, _):`, '');
    if (!id) return;
    const label = prompt('Название (ед. число):', base.label) || base.label;
    const plural = prompt('Мн. число:', base.plural || '') || undefined;
    const labelAcc = prompt('Кого? (вин. падеж):', label) || undefined;
    const r = addSpecies(base.id, id.trim(), {label, plural, labelAcc});
    if (r.error) { this.say(r.error, true); return; }
    this.id = id.trim();
    this.changed(`Вид «${label}» создан как копия «${base.label}»: правьте поля — каждое записывается сразу.${base.arrive ? '' : ' Основа не приходит на карту сама (нет блока arrive): такой вид появится только там, где его ставит код.'}`);
    this.open(this.id);
  }
  drop() {
    const sp = SPECIES.get(this.id);
    if (!confirm(`Убрать вид «${sp.label}» (${sp.id}) со всеми его правками?`)) return;
    dropSpecies(sp.id);
    this.id = this.list()[0]?.id;
    this.changed(`Вид «${sp.label}» убран.`);
    this.open(this.id);
  }

  // ── the look, drawn as the map draws it (render/looks.js), on a disc of grass
  preview(sp) {
    const cv = $('bstLook'); if (!cv) return;
    const ctx = cv.getContext('2d'), L = sp.look || {};
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#3d4a2c'; ctx.beginPath(); ctx.arc(48, 48, 44, 0, Math.PI * 2); ctx.fill();
    const draw = LOOKS[L.shape];
    if (!draw) { ctx.fillStyle = '#c9b8a0'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(L.shape ? `нет облика «${L.shape}»` : 'облик не задан', 48, 52); return; }
    const a = {species: sp.id, x: 0, y: 0, sleeping: false, equip: null, task: null, gender: 'm', faction: 'wild'};
    try { draw(ctx, a, 48, 50, 26 * (L.size || 0.6), L.color || '#888', {}); } catch (e) { ctx.fillStyle = '#f0b0b2'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('не нарисовать: ' + e.message.slice(0, 20), 48, 52); }
  }
}

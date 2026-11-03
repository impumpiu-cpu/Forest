// The one checker of requirements (data/requirements.js): a requirement against a source of facts. The source is anything
// with `get(fact, arg, scope)` → the value, or undefined when the fact cannot be told (an empty town has no shares: a
// comparison of a share there is not made and fails). `meets` says yes or no; `explain` says why, for the cards:
// [{text, ok, value}] — «гноллы 4 %, нужно не больше 5 % — да».
import {FACTS, OPS, ARG_KNOWN, VALUE_KNOWN} from '../data/requirements.js';

const cmp = (op, v, want) => {
  switch (op) {
    case '=': return v === want;
    case '!=': return v !== want;
    case '>': return v > want;
    case '>=': return v >= want;
    case '<': return v < want;
    case '<=': return v <= want;
    case 'in': return (want || []).includes(v);
    case 'not-in': return !(want || []).includes(v);
  }
  throw new Error(`requirements: unknown op «${op}»`);
};

// does the source meet the requirement (a condition, {all}, {any}, a list = all, or nothing)
export function meets(req, src) {
  if (req == null) return true;
  if (Array.isArray(req)) return req.every(r => meets(r, src));
  if (req.all) return Array.isArray(req.all) && req.all.length > 0 && req.all.every(r => meets(r, src));
  if (req.any) return Array.isArray(req.any) && req.any.length > 0 && req.any.some(r => meets(r, src));
  if (req.scope != null && req.scope !== 'town' && req.scope !== 'realm') return false;   // (an unknown scope is no scope: not met)
  const v = src.get(req.fact, req.arg, req.scope);
  if (v === undefined) return false;   // the fact cannot be told: the condition is not met
  return cmp(req.op, v, req.value);
}

// why: each condition with its reading and verdict; a group is one node whose verdict is its own children's (all — every
// one, any — any one), so the tree of the requirement is kept and the verdict of the whole is meets' → [{text, ok, value,
// all?, any?, items?}] (a list at the top is a list of its parts)
export function explain(req, src, words = {}) {
  if (req == null) return [];
  if (Array.isArray(req)) return explain({all: req}, src, words);   // (a list is «all», as meets reads it; the caller opens the top one)
  if (req.all) { const items = req.all.flatMap(r => explain(r, src, words)); return [{all: true, ok: items.every(x => x.ok), items, text: items.map(x => x.text).join(' и ')}]; }
  if (req.any) { const items = req.any.flatMap(r => explain(r, src, words)); return [{any: true, ok: items.some(x => x.ok), items, text: `(${items.map(x => x.text).join(' или ')})`}]; }
  const v = src.get(req.fact, req.arg, req.scope), ok = v !== undefined && cmp(req.op, v, req.value);
  return [{text: wording(req, v, words), ok, value: v}];
}

// «гноллы 4 %, нужно не больше 5 %» — the words of a condition and its reading
function wording(req, v, words) {
  const F = FACTS.get(req.fact), name = words.arg?.(req.fact, req.arg) ?? (req.arg != null ? `${F.label} ${req.arg}` : F.label);
  const val = x => (F.type === 'bool' ? (x ? 'да' : 'нет') : req.fact === 'kinShare' ? `${Math.round(x * 100)} %` : Array.isArray(x) ? x.map(y => words.value?.(req.fact, y) ?? y).join(', ') : words.value?.(req.fact, x) ?? x);
  const now = v === undefined ? 'неизвестно' : val(v);
  if (F.type === 'bool') return req.value === true && req.op === '=' ? `${name}: ${now}` : `${name} ${OPS[req.op]} ${val(req.value)}: ${now}`;
  if (F.type === 'enum') return `${name} ${OPS[req.op]} ${val(req.value)}: ${now}`;
  return `${name} ${now}, нужно ${OPS[req.op]} ${val(req.value)}`;
}

// the words of a requirement with no town to read: «народ одно из Люди, Дварфы; доля расы огры не меньше 8 %»
export function reqText(req, words = {}) {
  if (req == null) return '';
  if (Array.isArray(req)) return req.map(r => reqText(r, words)).filter(Boolean).join('; ');
  if (req.all) return req.all.map(r => reqText(r, words)).filter(Boolean).join('; ');
  if (req.any) return `(${req.any.map(r => reqText(r, words)).filter(Boolean).join(' или ')})`;
  const F = FACTS.get(req.fact), name = words.arg?.(req.fact, req.arg) ?? (req.arg != null ? `${F.label} ${req.arg}` : F.label);
  const val = x => (F.type === 'bool' ? (x ? 'да' : 'нет') : req.fact === 'kinShare' ? `${Math.round(x * 100)} %` : Array.isArray(x) ? x.map(y => words.value?.(req.fact, y) ?? y).join(', ') : words.value?.(req.fact, x) ?? x);
  if (F.type === 'bool' && req.value === true && req.op === '=') return `${name}${req.scope === 'realm' ? ' (в державе)' : ''}`;
  return `${name} ${OPS[req.op]} ${val(req.value)}`;
}

// a requirement is well formed: known facts and ops, an arg where the fact has one, a value of the fact's type → [error]
export function reqErrors(req, where = 'требование') {
  const errs = [];
  const walk = (r, path, top = false) => {
    if (r == null) return;
    if (Array.isArray(r)) { if (!top) { errs.push(`${path}: список внутри группы — пишется {all: […]}`); return; } r.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (typeof r !== 'object') { errs.push(`${path}: не условие`); return; }
    if ('all' in r || 'any' in r) {
      const k = 'all' in r ? 'all' : 'any', keys = Object.keys(r);
      if (keys.length !== 1) { errs.push(`${path}: группа ${k} с лишними полями (${keys.filter(x => x !== k).join(', ')})`); return; }
      if (!Array.isArray(r[k])) { errs.push(`${path}.${k}: группа — список условий`); return; }
      if (!r[k].length) { errs.push(`${path}.${k}: пустая группа`); return; }
      r[k].forEach((x, i) => walk(x, `${path}.${k}[${i}]`));
      return;
    }
    for (const key of Object.keys(r)) if (!['fact', 'arg', 'op', 'value', 'scope'].includes(key)) errs.push(`${path}: лишнее поле «${key}»`);
    if (!FACTS.has(r.fact)) { errs.push(`${path}: нет факта «${r.fact}»`); return; }
    const F = FACTS.get(r.fact);
    if (F.arg && r.arg == null) errs.push(`${path}: факт «${r.fact}» просит ${F.arg}`);
    else if (F.arg && ARG_KNOWN[F.arg] && !ARG_KNOWN[F.arg](r.arg)) errs.push(`${path}: нет такого ${F.arg}: «${r.arg}»`);
    if (!(r.op in OPS)) errs.push(`${path}: нет операции «${r.op}»`);
    const list = r.op === 'in' || r.op === 'not-in', vals = list ? (Array.isArray(r.value) ? r.value : null) : [r.value];
    if (list && !vals) errs.push(`${path}: «${r.op}» просит список`);
    else if (F.type === 'num') { for (const v of vals) if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${path}: число ждали, получили ${JSON.stringify(v)}`); }
    else if (F.type === 'bool') { for (const v of vals) if (typeof v !== 'boolean') errs.push(`${path}: да/нет ждали, получили ${JSON.stringify(v)}`); }
    else if (F.type === 'enum') { for (const v of vals) if (typeof v !== 'string' || (VALUE_KNOWN[r.fact] && !VALUE_KNOWN[r.fact](v))) errs.push(`${path}: нет такого значения «${JSON.stringify(v)}» у факта «${r.fact}»`); }
    if (F.type === 'enum' && !['=', '!=', 'in', 'not-in'].includes(r.op)) errs.push(`${path}: факт «${r.fact}» не число: «${r.op}» не годится`);
    if (F.type === 'bool' && !['=', '!=', 'in', 'not-in'].includes(r.op)) errs.push(`${path}: факт «${r.fact}» не число: «${r.op}» не годится`);
    if (r.scope != null && r.scope !== 'town' && r.scope !== 'realm') errs.push(`${path}: область «${r.scope}» — только town или realm`);
    else if (r.scope && F.scope !== 'either' && r.scope !== (F.scope || 'town')) errs.push(`${path}: факт «${r.fact}» читается только в городе`);
  };
  walk(req, where, true);
  return errs;
}

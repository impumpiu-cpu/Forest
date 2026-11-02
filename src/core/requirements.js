// The one checker of requirements (data/requirements.js): a requirement against a source of facts. The source is anything
// with `get(fact, arg, scope)` → the value, or undefined when the fact cannot be told (an empty town has no shares: a
// comparison of a share there is not made and fails). `meets` says yes or no; `explain` says why, for the cards:
// [{text, ok, value}] — «гноллы 4 %, нужно не больше 5 % — да».
import {FACTS, OPS} from '../data/requirements.js';

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
  if (req.all) return req.all.every(r => meets(r, src));
  if (req.any) return req.any.some(r => meets(r, src));
  const v = src.get(req.fact, req.arg, req.scope);
  if (v === undefined) return false;   // the fact cannot be told: the condition is not met
  return cmp(req.op, v, req.value);
}

// why: each condition with its reading and verdict, groups as nested lists → [{text, ok, value, any?, items?}]
export function explain(req, src, words = {}) {
  if (req == null) return [];
  if (Array.isArray(req)) return req.flatMap(r => explain(r, src, words));
  if (req.all) return req.all.flatMap(r => explain(r, src, words));
  if (req.any) { const items = req.any.flatMap(r => explain(r, src, words)); return [{any: true, ok: items.some(x => x.ok), items, text: items.map(x => x.text).join(' или ')}]; }
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
  const walk = (r, path) => {
    if (r == null) return;
    if (Array.isArray(r)) { r.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (r.all || r.any) { walk(r.all || r.any, `${path}.${r.all ? 'all' : 'any'}`); return; }
    if (!FACTS.has(r.fact)) { errs.push(`${path}: нет факта «${r.fact}»`); return; }
    const F = FACTS.get(r.fact);
    if (F.arg && r.arg == null) errs.push(`${path}: факт «${r.fact}» просит ${F.arg}`);
    if (!(r.op in OPS)) errs.push(`${path}: нет операции «${r.op}»`);
    if ((r.op === 'in' || r.op === 'not-in') && !Array.isArray(r.value)) errs.push(`${path}: «${r.op}» просит список`);
    else if (F.type === 'num' && r.op !== 'in' && r.op !== 'not-in' && typeof r.value !== 'number') errs.push(`${path}: число ждали, получили ${JSON.stringify(r.value)}`);
    else if (F.type === 'bool' && r.op !== 'in' && r.op !== 'not-in' && typeof r.value !== 'boolean') errs.push(`${path}: да/нет ждали, получили ${JSON.stringify(r.value)}`);
    if (r.scope && F.scope !== 'either' && r.scope !== (F.scope || 'town')) errs.push(`${path}: факт «${r.fact}» читается только в городе`);
  };
  walk(req, where);
  return errs;
}

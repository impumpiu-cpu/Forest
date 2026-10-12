// A graph codec for plain simulation state: objects, arrays, typed arrays, Maps, Sets, shared and
// circular references, Infinity/NaN. The result is plain JSON.
//
//   encode(value, {externals, skip}) → JSON-safe tree
//   decode(tree, {externals})        → the same graph again
//
// `externals` is a Map(object → key) of things that are not state but code and content
// (registry definitions, presets). They are written as {$x: key} and looked up again on load,
// so `goal === BUILDINGS.get('hut')` still holds after a load.
// Anything else that is not plain data (a function, a class instance) is an error with its path:
// state must stay serialisable, and the error says exactly where it is not.
//
// Shapes: plain object → {...fields} (+ $id when shared); shared array → {$id, $a: [...]};
// typed array → {$t: 'Float32Array', $b: base64}; Map → {$m: [[k, v]…]}; Set → {$s: […]};
// second and later visits → {$r: id}; non-finite number → {$n: 'Infinity'}; undefined in an array → {$u: 1}.

const TYPED = {Float32Array, Float64Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array};

const isPlain = v => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };

function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') { const b = Buffer.from(b64, 'base64'); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice(); }
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encode(root, {externals = new Map(), skip = () => false} = {}) {
  // pass 1: which objects are reached more than once
  const seen = new Set(), shared = new Set();
  (function count(v, path) {
    if (v === null || typeof v !== 'object') return;
    if (externals.has(v)) return;
    if (seen.has(v)) { shared.add(v); return; }
    seen.add(v);
    if (ArrayBuffer.isView(v)) return;
    if (Array.isArray(v)) { v.forEach((x, i) => count(x, path + '[' + i + ']')); return; }
    if (v instanceof Map) { for (const [k, x] of v) { count(k, path + '<key>'); count(x, path + '.get(' + k + ')'); } return; }
    if (v instanceof Set) { for (const x of v) count(x, path + '<set>'); return; }
    if (!isPlain(v)) throw new Error(`save: ${path} is a ${v.constructor?.name || 'non-plain object'}, not plain data`);
    for (const k of Object.keys(v)) if (!skip(path, k, v)) count(v[k], path + '.' + k);
  })(root, 'world');

  // pass 2: write
  const ids = new Map();
  let next = 1;
  return (function enc(v, path) {
    if (v === undefined) return {$u: 1};
    if (typeof v === 'number') return Number.isFinite(v) ? v : {$n: String(v)};
    if (typeof v === 'function') throw new Error(`save: ${path} is a function`);
    if (typeof v === 'bigint' || typeof v === 'symbol') throw new Error(`save: ${path} is a ${typeof v}`);
    if (v === null || typeof v !== 'object') return v;
    if (externals.has(v)) return {$x: externals.get(v)};
    if (ids.has(v)) return {$r: ids.get(v)};
    let out;
    const id = shared.has(v) ? next++ : 0;
    if (id) ids.set(v, id);
    if (ArrayBuffer.isView(v)) out = {$t: v.constructor.name, $b: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))};
    else if (Array.isArray(v)) { const a = v.map((x, i) => enc(x, path + '[' + i + ']')); if (!id) return a; out = {$a: a}; }
    else if (v instanceof Map) out = {$m: [...v].map(([k, x]) => [enc(k, path + '<key>'), enc(x, path + '.get(' + k + ')')])};
    else if (v instanceof Set) out = {$s: [...v].map(x => enc(x, path + '<set>'))};
    else {
      out = {};
      for (const k of Object.keys(v)) {
        if (skip(path, k, v) || v[k] === undefined) continue;
        if (k[0] === '$') throw new Error(`save: ${path}.${k} — keys starting with $ are reserved`);
        out[k] = enc(v[k], path + '.' + k);
      }
    }
    if (id) out.$id = id;
    return out;
  })(root, 'world');
}

export function decode(tree, {externals = new Map()} = {}) {
  const byKey = new Map([...externals].map(([obj, key]) => [key, obj]));
  const ids = new Map();
  return (function dec(t) {
    if (t === null || typeof t !== 'object') return t;
    if (Array.isArray(t)) return t.map(dec);
    if ('$u' in t) return undefined;
    if ('$n' in t) return Number(t.$n);
    if ('$r' in t) { if (!ids.has(t.$r)) throw new Error(`load: dangling reference ${t.$r}`); return ids.get(t.$r); }
    if ('$x' in t) { if (!byKey.has(t.$x)) throw new Error(`load: unknown definition "${t.$x}" — the save is from another version`); return byKey.get(t.$x); }
    let out;
    const keep = o => { if (t.$id) ids.set(t.$id, o); return o; };
    if ('$t' in t) { const bytes = fromBase64(t.$b), T = TYPED[t.$t]; return keep(new T(bytes.buffer, bytes.byteOffset, bytes.byteLength / T.BYTES_PER_ELEMENT)); }
    if ('$a' in t) { out = keep([]); for (const x of t.$a) out.push(dec(x)); return out; }
    if ('$m' in t) { out = keep(new Map()); for (const [k, x] of t.$m) out.set(dec(k), dec(x)); return out; }
    if ('$s' in t) { out = keep(new Set()); for (const x of t.$s) out.add(dec(x)); return out; }
    out = keep({});
    for (const k of Object.keys(t)) if (k !== '$id') out[k] = dec(t[k]);
    return out;
  })(tree);
}

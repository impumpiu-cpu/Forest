// A registry is a named catalogue of definitions (resources, jobs, species…).
// Content lives in src/data; systems look definitions up by id and never hard-code lists.

export class Registry {
  constructor(kind) {
    this.kind = kind;
    this.items = new Map();
    Registry.list.push(this);
  }

  // every registry ever created: saves refer to definitions as "kind:id" instead of copying them
  static list = [];

  register(def) {
    if (!def || !def.id) throw new Error(`${this.kind}: definition without id`);
    if (this.items.has(def.id)) throw new Error(`${this.kind}: duplicate id "${def.id}"`);
    this.items.set(def.id, def); this._all = null;
    return def;
  }

  registerAll(defs) { for (const d of defs) this.register(d); return this; }

  get(id) {
    const d = this.items.get(id);
    if (!d) throw new Error(`${this.kind}: unknown id "${id}"`);
    return d;
  }

  has(id) { return this.items.has(id); }
  // the list is rebuilt on the first call after a change and shared after that (hot loops call it every tick)
  all() { return this._all || (this._all = Object.freeze([...this.items.values()])); }
  ids() { return [...this.items.keys()]; }
  filter(fn) { return this.all().filter(fn); }
}

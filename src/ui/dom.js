export const $ = id => document.getElementById(id);

// A row of buttons for a choice (the «seg» of the screens): `items` are {id, label} or [id, label]; the button of
// `cur` is pressed; a click presses its button and calls `on(value)` with its data-val (a string). Returns the box.
// `{toggle: true}` — the buttons are pressed and released one by one, the row does not choose one (press it yourself)
export function seg(box, items, cur, on, {toggle = false} = {}) {
  if (typeof box === 'string') box = $(box);
  box.innerHTML = items.map(d => {
    const [id, label] = Array.isArray(d) ? d : [d.id, d.label];
    return `<button type="button" data-val="${String(id).replace(/"/g, '&quot;')}" aria-pressed="${String(id) === String(cur)}">${label}</button>`;
  }).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !box.contains(b)) return;
    if (!toggle) press(box, b.dataset.val);
    on(b.dataset.val, b);
  });
  return box;
}

// the button of `value` pressed in a row, the others released
export function press(box, value) {
  if (typeof box === 'string') box = $(box);
  box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === String(value))));
}

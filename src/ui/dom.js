// Tiny DOM helper: h('div.card#id', {onclick, style, ...}, children...)
export function h(sel, props = {}, ...children) {
  let tag = 'div';
  const classes = [];
  let id = null;
  sel.replace(/^([a-z0-9-]+)?/i, (m) => {
    if (m) tag = m;
    return '';
  })
    .split(/(?=[.#])/)
    .forEach((part) => {
      if (part.startsWith('.')) classes.push(part.slice(1));
      else if (part.startsWith('#')) id = part.slice(1);
    });
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  if (id) el.id = id;
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = {};
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function bar(frac, color) {
  return h('div.bar', h('i', { style: { width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color || '' } }));
}

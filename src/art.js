// Генеративные обложки для разработок без картинки — в стиле логотипа:
// шестиугольные «C», звезда и сетка. Одна и та же разработка всегда
// получает одну и ту же обложку (зависит от id).

const W = 640;
const H = 400;

function prng(seed) {
  let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

/** Шестиугольник «остриём вверх», как в логотипе */
function hexPoints(cx, cy, r) {
  return [-90, -30, 30, 90, 150, 210].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

/** Буква «C»: шестиугольник без правой грани */
function cPath(cx, cy, r) {
  const [, upperRight, lowerRight, bottom, lowerLeft, upperLeft] = hexPoints(cx, cy, r);
  const top = [cx, cy - r];
  const pts = [upperRight, top, upperLeft, lowerLeft, bottom, lowerRight];
  return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')}`;
}

function hexPath(cx, cy, r) {
  return `M${hexPoints(cx, cy, r).map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')}Z`;
}

export function starPath(cx, cy, r) {
  const a = r * 0.22;
  const pts = [[0, -r], [a, -a], [r, 0], [a, a], [0, r], [-a, a], [-r, 0], [-a, -a]];
  return `M${pts.map(([x, y]) => `${f(cx + x)} ${f(cy + y)}`).join(' L')}Z`;
}

function concentric(rnd) {
  const cx = W * (0.55 + rnd() * 0.3);
  const cy = H * (0.35 + rnd() * 0.3);
  const step = 22 + rnd() * 14;
  let out = '';
  for (let i = 1; i <= 12; i++) {
    const r = step * i;
    const op = Math.max(0.08, 0.7 - i * 0.055);
    out += `<path d="${cPath(cx, cy, r)}" stroke-opacity="${f(op)}"/>`;
  }
  return out + `<path class="star" d="${starPath(cx + step * 0.15, cy, step * 0.55)}"/>`;
}

function honeycomb(rnd) {
  const r = 34 + rnd() * 18;
  const dx = Math.sqrt(3) * r;
  const dy = 1.5 * r;
  const ox = rnd() * dx;
  const stars = new Set();
  const cols = Math.ceil(W / dx) + 2;
  const rows = Math.ceil(H / dy) + 2;
  for (let k = 0; k < 3; k++) stars.add(`${1 + Math.floor(rnd() * (cols - 2))}:${1 + Math.floor(rnd() * (rows - 2))}`);
  let out = '';
  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const cx = ox + col * dx + (row % 2 ? dx / 2 : 0);
      const cy = row * dy;
      const dist = Math.hypot(cx - W * 0.7, cy - H * 0.5) / W;
      const op = Math.max(0.06, 0.5 - dist * 0.7);
      out += `<path d="${hexPath(cx, cy, r * 0.92)}" stroke-opacity="${f(op)}"/>`;
      if (stars.has(`${col}:${row}`)) out += `<path class="star" d="${starPath(cx, cy, r * 0.42)}"/>`;
    }
  }
  return out;
}

function chain(rnd) {
  const r = 70 + rnd() * 40;
  const cy = H * (0.4 + rnd() * 0.2);
  const gap = r * 0.95;
  const start = -r * (0.2 + rnd() * 0.6);
  let out = '';
  let i = 0;
  for (let cx = start; cx < W + r; cx += gap, i++) {
    const op = 0.15 + (i / 8) * 0.6;
    out += `<path d="${cPath(cx, cy, r)}" stroke-width="3" stroke-opacity="${f(Math.min(op, 0.85))}"/>`;
    out += `<path d="${cPath(cx, cy, r * 0.62)}" stroke-opacity="${f(Math.min(op, 0.85) * 0.5)}"/>`;
  }
  const sx = W * (0.62 + rnd() * 0.2);
  return out + `<path class="star" d="${starPath(sx, cy, r * 0.32)}"/>`;
}

const VARIANTS = [concentric, honeycomb, chain];

export function coverArt(seed = 1) {
  const n = Number(seed) || 1;
  const rnd = prng(n);
  const body = VARIANTS[n % VARIANTS.length](rnd);
  const id = `dots-${n}`;
  return (
    `<svg class="cover-art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">` +
    `<defs><pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse">` +
    '<circle cx="1" cy="1" r="1" fill="#fff" fill-opacity=".09"/></pattern></defs>' +
    `<rect width="${W}" height="${H}" fill="url(#${id})"/>` +
    `<g fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="miter">${body}</g>` +
    '</svg>'
  );
}

/** Декор для первого экрана: концентрические «C» вокруг знака */
export function heroRings() {
  const c = 300;
  let out = '';
  for (let i = 0; i < 6; i++) {
    const r = 200 + i * 32;
    out += `<path class="ring ring-${i}" d="${cPath(c, c, r)}"/>`;
  }
  const ticks = hexPoints(c, c, 200 + 5 * 32 + 18)
    .map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="2.5"/>`)
    .join('');
  return (
    '<svg class="hero-rings" viewBox="0 0 600 600" aria-hidden="true" focusable="false">' +
    `<g fill="none" stroke="currentColor" stroke-width="1.2">${out}</g>` +
    `<g class="ticks" fill="currentColor">${ticks}</g>` +
    '</svg>'
  );
}

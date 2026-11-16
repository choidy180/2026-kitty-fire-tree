/** 시드 고정 난수 (mulberry32) — 매번 같은 트리가 나오도록 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

/** 정규분포 (Box–Muller) */
export function gaussian(rand: Rand, mean = 0, sd = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const uniform = (rand: Rand, a: number, b: number) => a + (b - a) * rand();

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** 2D value noise (부드러운 난수장) — 화염 냉각맵/깜빡임에 사용 */
export function makeValueNoise2D(seed: number, size = 256) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(size * 2);
  const vals = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < size; i++) perm[i + size] = perm[i];
  const mask = size - 1;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return function noise(x: number, y: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = xi & mask;
    const y0 = yi & mask;
    const x1 = (x0 + 1) & mask;
    const y1 = (y0 + 1) & mask;
    const v00 = vals[perm[perm[x0] + y0]];
    const v10 = vals[perm[perm[x1] + y0]];
    const v01 = vals[perm[perm[x0] + y1]];
    const v11 = vals[perm[perm[x1] + y1]];
    const u = fade(xf);
    const v = fade(yf);
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  };
}

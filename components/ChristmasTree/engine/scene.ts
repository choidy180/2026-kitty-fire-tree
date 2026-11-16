import { mulberry32, gaussian, uniform, clamp, type Rand } from './rng';
import { T } from './timeline';
import { sampleKitty, KITTY_COLORS, KP } from './kitty';
import type { TopperImage } from './imageTopper';

export const TAU = Math.PI * 2;

/** 포인트 종류 */
export const K = {
  GROUND: 0,
  TRUNK: 1,
  NEEDLE: 2,
  SNOW: 3,
  GARLAND: 4,
  BALL: 5,
  LIGHT: 6,
  GIFT: 7,
  RIBBON: 8,
  KITTY: 9,
} as const;

/** 트리 형태 */
export const TREE = {
  y0: 0.16, // 잎이 시작되는 높이
  y1: 1.0, // 꼭대기
  baseR: 0.47,
};
export function treeRadius(y: number) {
  const h = clamp((y - TREE.y0) / (TREE.y1 - TREE.y0), 0, 1);
  return TREE.baseR * Math.pow(1 - h, 0.88) + 0.014;
}

/** 고양이 토퍼 배치 */
export const KITTY = {
  cx: 0,
  cy: 1.15,
  scale: 0.18,
};

/** SoA 포인트 버퍼 */
export interface Scene {
  count: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  t0: Float32Array;
  seed: Float32Array;
  kind: Uint8Array;
  part: Uint8Array;
  /** 고양이 포인트가 날아오기 시작하는 오프셋 */
  ox: Float32Array;
  oy: Float32Array;
  oz: Float32Array;
  lightCount: number;
  kittyStart: number;
  kittyEnd: number;
  /** 토퍼 배치 (빌보드, 월드 좌표) */
  topper: TopperPlacement;
}

export interface TopperPlacement {
  mode: 'kitty' | 'image';
  cx: number;
  cy: number;
  /** 로컬 u=1 에 해당하는 월드 길이 */
  scale: number;
  top: number;
  bottom: number;
}

class Builder {
  x: number[] = [];
  y: number[] = [];
  z: number[] = [];
  nx: number[] = [];
  ny: number[] = [];
  nz: number[] = [];
  r: number[] = [];
  g: number[] = [];
  b: number[] = [];
  t0: number[] = [];
  seed: number[] = [];
  kind: number[] = [];
  part: number[] = [];
  ox: number[] = [];
  oy: number[] = [];
  oz: number[] = [];

  constructor(private rand: Rand) {}

  add(
    kind: number,
    p: [number, number, number],
    n: [number, number, number],
    c: [number, number, number],
    t0: number,
    part = 0,
    o: [number, number, number] = [0, 0, 0],
  ) {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    this.x.push(p[0]);
    this.y.push(p[1]);
    this.z.push(p[2]);
    this.nx.push(n[0] / len);
    this.ny.push(n[1] / len);
    this.nz.push(n[2] / len);
    this.r.push(c[0]);
    this.g.push(c[1]);
    this.b.push(c[2]);
    this.t0.push(t0);
    this.seed.push(this.rand());
    this.kind.push(kind);
    this.part.push(part);
    this.ox.push(o[0]);
    this.oy.push(o[1]);
    this.oz.push(o[2]);
  }

  get size() {
    return this.x.length;
  }
}

const mix = (a: number[], b: number[], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const within = (phase: { start: number; end: number }, f: number) =>
  phase.start + (phase.end - phase.start) * clamp(f, 0, 1);

export function buildScene(seed = 1225, image: TopperImage | null = null): Scene {
  const rand = mulberry32(seed);
  const q = new Builder(rand);

  // ---------------------------------------------------------------- GROUND
  {
    const R = 0.7;
    const n = 3400;
    for (let i = 0; i < n; i++) {
      const r = R * Math.sqrt(rand());
      const a = TAU * rand();
      const shade = 0.55 + 0.45 * clamp((r - 0.08) / 0.45, 0, 1);
      const tint = 0.9 + 0.1 * rand();
      const c: [number, number, number] = [0.6 * shade * tint, 0.65 * shade * tint, 0.75 * shade * tint];
      q.add(K.GROUND, [r * Math.cos(a), 0, r * Math.sin(a)], [0, 1, 0], c, within(T.GROUND, (r / R) * 0.9 + rand() * 0.1));
    }
  }

  // ---------------------------------------------------------------- TRUNK
  {
    const h = 0.26;
    const rad = 0.052;
    for (let i = 0; i < 900; i++) {
      const a = TAU * rand();
      const y = h * rand();
      const bark = 0.7 + 0.3 * rand();
      q.add(
        K.TRUNK,
        [rad * Math.cos(a), y, rad * Math.sin(a)],
        [Math.cos(a), 0.05, Math.sin(a)],
        [0.36 * bark, 0.2 * bark, 0.09 * bark],
        within(T.TRUNK, (y / h) * 0.9 + rand() * 0.1),
      );
    }
  }

  // ---------------------------------------------------------------- NEEDLES (+ SNOWCAP)
  const tips: { p: [number, number, number]; h: number; a: number }[] = [];
  {
    const tiers = 30;
    const dark = [0.05, 0.27, 0.1];
    const bright = [0.24, 0.7, 0.27];
    const blue = [0.08, 0.42, 0.33];
    for (let i = 0; i < tiers; i++) {
      const h = i / (tiers - 1);
      const y = TREE.y0 + h * (TREE.y1 - TREE.y0 - 0.035);
      const R = treeRadius(y);
      const nb = Math.max(3, Math.round(5 + (16 * R) / TREE.baseR));
      for (let b = 0; b < nb; b++) {
        const a = (TAU * b) / nb + i * 0.618 * TAU + gaussian(rand, 0, 0.12);
        const L = R * uniform(rand, 0.82, 1.06);
        const n = Math.round(10 + (66 * L) / TREE.baseR);
        const d = [Math.cos(a), 0, Math.sin(a)];
        const side = [-Math.sin(a), 0, Math.cos(a)];
        const widthK = 0.35 + (0.65 * L) / TREE.baseR;
        for (let k = 0; k < n; k++) {
          const s = Math.pow(rand(), 0.65);
          const spread = (0.02 + 0.1 * s) * gaussian(rand) * widthK;
          const sl = s * L;
          const yy = y + 0.06 * sl - 0.24 * sl * sl + gaussian(rand, 0, 0.012) * (0.5 + s);
          const p: [number, number, number] = [d[0] * sl + side[0] * spread, yy, d[2] * sl + side[2] * spread];
          const nrm: [number, number, number] = [
            d[0] * 0.75 + gaussian(rand, 0, 0.25),
            0.55 + gaussian(rand, 0, 0.25),
            d[2] * 0.75 + gaussian(rand, 0, 0.25),
          ];
          const ao = 0.5 + 0.5 * s;
          const isSnow = s > 0.45 && rand() < 0.075 * s;
          if (isSnow) {
            q.add(K.SNOW, p, [nrm[0] * 0.4, 1, nrm[2] * 0.4], [0.9, 0.94, 1.0], within(T.SNOWCAP, h * 0.85 + rand() * 0.15));
          } else {
            const base = rand() < 0.18 ? mix(dark, blue, rand()) : mix(dark, bright, Math.pow(rand(), 0.8));
            q.add(
              K.NEEDLE,
              p,
              nrm,
              [base[0] * ao, base[1] * ao, base[2] * ao],
              within(T.NEEDLE, h * 0.9 + s * 0.06 + rand() * 0.04),
            );
          }
        }
        tips.push({ p: [d[0] * L * 0.93, y + 0.012, d[2] * L * 0.93], h, a });
      }
    }
  }

  // ---------------------------------------------------------------- GARLAND
  {
    const strands = 2;
    for (let sIdx = 0; sIdx < strands; sIdx++) {
      const n = 1100;
      const turns = 3.6;
      const off = sIdx * Math.PI;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const y0 = 0.22 + u * 0.68;
        const ang = u * turns * TAU + off;
        const sag = 0.022 * Math.pow(Math.sin(ang * 3.5), 2);
        const y = y0 - sag;
        const R = treeRadius(y) * 1.03 + 0.012;
        const bead = 0.85 + 0.15 * Math.sin(i * 1.7);
        q.add(
          K.GARLAND,
          [R * Math.cos(ang) + gaussian(rand, 0, 0.003), y, R * Math.sin(ang) + gaussian(rand, 0, 0.003)],
          [Math.cos(ang), 0.35, Math.sin(ang)],
          [0.98 * bead, 0.74 * bead, 0.27 * bead],
          within(T.GARLAND, u * 0.85 + sIdx * 0.12),
        );
      }
    }
  }

  // tips 섞기 → 오너먼트/전구 위치
  for (let i = tips.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tips[i], tips[j]] = [tips[j], tips[i]];
  }

  // ---------------------------------------------------------------- BALLS
  {
    const picked: [number, number, number][] = [];
    const want = 44;
    for (const t of tips) {
      if (picked.length >= want) break;
      if (t.h > 0.82 || t.h < 0.02) continue;
      if (picked.some((p) => Math.hypot(p[0] - t.p[0], p[1] - t.p[1], p[2] - t.p[2]) < 0.11)) continue;
      picked.push(t.p);
    }
    const palette: [number, number, number][] = [
      [0.82, 0.07, 0.1],
      [0.82, 0.07, 0.1],
      [0.75, 0.05, 0.12],
      [0.96, 0.7, 0.2],
      [0.96, 0.7, 0.2],
      [0.72, 0.78, 0.9],
    ];
    picked.forEach((c, bi) => {
      const rad = uniform(rand, 0.026, 0.036);
      const col = palette[Math.floor(rand() * palette.length)];
      const t0 = within(T.BALL, bi / picked.length);
      const cx = c[0] * 1.02;
      const cy = c[1] - 0.02;
      const cz = c[2] * 1.02;
      const n = 110;
      for (let k = 0; k < n; k++) {
        // 피보나치 구
        const yk = 1 - (2 * (k + 0.5)) / n;
        const rk = Math.sqrt(1 - yk * yk);
        const th = k * 2.399963;
        const dx = Math.cos(th) * rk;
        const dz = Math.sin(th) * rk;
        q.add(K.BALL, [cx + dx * rad, cy + yk * rad, cz + dz * rad], [dx, yk, dz], col, t0);
      }
    });
  }

  // ---------------------------------------------------------------- LIGHTS
  let lightCount = 0;
  {
    const lights = tips.slice(60).filter((t) => t.h < 0.96).slice(0, 170);
    lights.forEach((t) => {
      const roll = rand();
      const col: [number, number, number] =
        roll < 0.62 ? [1.0, 0.86, 0.52] : roll < 0.85 ? [1.0, 0.62, 0.22] : roll < 0.93 ? [1.0, 0.95, 0.85] : [0.55, 0.8, 1.0];
      q.add(K.LIGHT, [t.p[0] * 1.03, t.p[1] + 0.004, t.p[2] * 1.03], [t.p[0], 0.3, t.p[2]], col, within(T.LIGHT, rand()));
      lightCount++;
    });
  }

  // ---------------------------------------------------------------- GIFTS (+ RIBBON)
  {
    const gifts = [
      { a: 0.55, r: 0.42, w: 0.16, d: 0.13, h: 0.12, col: [0.78, 0.07, 0.09], rib: [0.98, 0.78, 0.3] },
      { a: 1.75, r: 0.47, w: 0.12, d: 0.12, h: 0.1, col: [0.12, 0.26, 0.82], rib: [0.92, 0.94, 1.0] },
      { a: 2.45, r: 0.34, w: 0.09, d: 0.09, h: 0.17, col: [0.86, 0.86, 0.9], rib: [0.85, 0.08, 0.1] },
      { a: 3.55, r: 0.45, w: 0.17, d: 0.12, h: 0.085, col: [0.1, 0.45, 0.25], rib: [0.98, 0.78, 0.3] },
      { a: 4.55, r: 0.41, w: 0.11, d: 0.11, h: 0.11, col: [0.8, 0.08, 0.1], rib: [0.92, 0.94, 1.0] },
      { a: 5.45, r: 0.47, w: 0.13, d: 0.13, h: 0.075, col: [0.16, 0.3, 0.86], rib: [0.98, 0.78, 0.3] },
    ];
    const step = 0.0105;
    gifts.forEach((gft, gi) => {
      const cx = gft.r * Math.cos(gft.a);
      const cz = gft.r * Math.sin(gft.a);
      const yaw = rand() * TAU;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
        cx + lx * cy - lz * sy,
        ly,
        cz + lx * sy + lz * cy,
      ];
      const nWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
        lx * cy - lz * sy,
        ly,
        lx * sy + lz * cy,
      ];
      const hw = gft.w / 2;
      const hd = gft.d / 2;
      const ribW = Math.min(gft.w, gft.d) * 0.11;
      const gStart = gi / gifts.length;
      const emit = (lx: number, ly: number, lz: number, n: [number, number, number]) => {
        const isRib = Math.abs(lx) < ribW || Math.abs(lz) < ribW;
        const shade = 0.9 + 0.1 * rand();
        if (isRib) {
          q.add(K.RIBBON, toWorld(lx, ly, lz), nWorld(...n), [gft.rib[0], gft.rib[1], gft.rib[2]], within(T.RIBBON, gStart + rand() * 0.15));
        } else {
          q.add(
            K.GIFT,
            toWorld(lx, ly, lz),
            nWorld(...n),
            [gft.col[0] * shade, gft.col[1] * shade, gft.col[2] * shade],
            within(T.GIFT, gStart + (ly / gft.h) * 0.12),
          );
        }
      };
      // 윗면
      for (let lx = -hw; lx <= hw; lx += step)
        for (let lz = -hd; lz <= hd; lz += step) emit(lx, gft.h, lz, [0, 1, 0]);
      // 옆면 4개
      for (let ly = 0; ly <= gft.h; ly += step) {
        for (let lx = -hw; lx <= hw; lx += step) {
          emit(lx, ly, hd, [0, 0, 1]);
          emit(lx, ly, -hd, [0, 0, -1]);
        }
        for (let lz = -hd; lz <= hd; lz += step) {
          emit(hw, ly, lz, [1, 0, 0]);
          emit(-hw, ly, lz, [-1, 0, 0]);
        }
      }
      // 리본 매듭(고리 2개)
      for (let k = 0; k < 2; k++) {
        const dir = k === 0 ? 1 : -1;
        for (let a = 0; a < TAU; a += 0.12) {
          const lx = dir * (0.022 + 0.02 * Math.cos(a));
          const ly = gft.h + 0.012 + 0.016 * Math.abs(Math.sin(a));
          q.add(K.RIBBON, toWorld(lx, ly, 0), nWorld(dir, 0.6, 0), [gft.rib[0], gft.rib[1], gft.rib[2]], within(T.RIBBON, gStart + 0.18));
        }
      }
    });
  }

  // ---------------------------------------------------------------- TOPPER (고양이 or 이미지)
  const kittyStart = q.size;
  let topper: TopperPlacement;
  // 트리 주변에서 소용돌이치며 날아와 조립
  const flyIn = (p: [number, number, number]): [number, number, number] => {
    const a = rand() * TAU;
    const rr = uniform(rand, 0.35, 0.8);
    return [Math.cos(a) * rr - p[0], uniform(rand, -0.55, -0.05), Math.sin(a) * rr - p[2]];
  };
  if (image && image.pixels.length) {
    // 이미지 비율에 맞춰 최대 폭 0.54 / 최대 높이 0.54 안에 배치, 바닥은 트리 끝(TREE.y1) 바로 위에 살짝 띄워서 잎에 안 가리게
    const halfW = Math.min(0.27, 0.27 / image.aspect);
    const bottom = TREE.y1 + 0.015;
    const cy = bottom + image.aspect * halfW;
    topper = { mode: 'image', cx: 0, cy, scale: halfW, bottom, top: cy + image.aspect * halfW };
    for (const px of image.pixels) {
      const vn = px.v / image.aspect; // -1..1
      const r2 = Math.min(1, px.u * px.u + vn * vn);
      const bulge = 0.05 * (1 - r2) + (px.edge ? 0.03 : 0);
      const pos: [number, number, number] = [px.u * halfW, cy + px.v * halfW, bulge * halfW];
      const f = clamp((vn + 1) / 2, 0, 1); // 아래에서 위로 조립
      q.add(
        K.KITTY,
        pos,
        [px.u * 0.5, vn * 0.5, 1],
        [px.r, px.g, px.b],
        T.KITTY.start + f * 1.1 + rand() * 0.35,
        px.edge ? KP.IMG_EDGE : KP.IMG,
        flyIn(pos),
      );
    }
  } else {
    topper = {
      mode: 'kitty',
      cx: KITTY.cx,
      cy: KITTY.cy,
      scale: KITTY.scale,
      bottom: KITTY.cy - 0.92 * KITTY.scale,
      top: KITTY.cy + 1.2 * KITTY.scale,
    };
    const samples = sampleKitty(rand);
    for (const s of samples) {
      const p: [number, number, number] = [KITTY.cx + s.u * KITTY.scale, KITTY.cy + s.v * KITTY.scale, s.bulge * KITTY.scale];
      const f = clamp((s.v + 0.92) / 2.14, 0, 1); // 아래에서 위로 조립
      q.add(K.KITTY, p, [s.nx, s.ny, s.nz], KITTY_COLORS[s.part], T.KITTY.start + f * 1.1 + rand() * 0.35, s.part, flyIn(p));
    }
  }
  const kittyEnd = q.size;

  const F = (arr: number[]) => Float32Array.from(arr);
  return {
    count: q.size,
    x: F(q.x),
    y: F(q.y),
    z: F(q.z),
    nx: F(q.nx),
    ny: F(q.ny),
    nz: F(q.nz),
    r: F(q.r),
    g: F(q.g),
    b: F(q.b),
    t0: F(q.t0),
    seed: F(q.seed),
    kind: Uint8Array.from(q.kind),
    part: Uint8Array.from(q.part),
    ox: F(q.ox),
    oy: F(q.oy),
    oz: F(q.oz),
    lightCount,
    kittyStart,
    kittyEnd,
    topper,
  };
}

/** 고양이 포인트가 비행을 마치는 데 걸리는 시간 */
export const KITTY_FLIGHT = 1.0;

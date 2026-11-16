import type { Rand } from './rng';

/**
 * 트리 꼭대기 토퍼 — 오리지널 디자인의 고양이 얼굴 실루엣.
 * 로컬 좌표 (u, v): u ∈ [-1, 1] 좌우, v ∈ [-0.9, 1.05] 상하.
 */
export const KP = {
  FACE: 0,
  RIM: 1,
  EAR_INNER: 2,
  EYE: 3,
  PUPIL: 4,
  NOSE: 5,
  MOUTH: 6,
  /** 이미지 토퍼 */
  IMG: 7,
  IMG_EDGE: 8,
} as const;

const HEAD_CY = -0.12;
const HEAD_RX = 1.0;
const HEAD_RY = 0.74;

type V2 = [number, number];

const EAR_L: [V2, V2, V2] = [
  [-0.98, 0.12],
  [-0.2, 0.56],
  [-0.86, 1.2],
];
const EAR_R: [V2, V2, V2] = [
  [0.98, 0.12],
  [0.2, 0.56],
  [0.86, 1.2],
];

function shrinkTri(tri: [V2, V2, V2], k: number, dy: number): [V2, V2, V2] {
  const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
  const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
  return tri.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k + dy]) as [V2, V2, V2];
}
const EAR_L_IN = shrinkTri(EAR_L, 0.52, 0.04);
const EAR_R_IN = shrinkTri(EAR_R, 0.52, 0.04);

/** 삼각형 내부 여부 + 가장자리까지의 거리(대략) */
function triInfo(p: V2, tri: [V2, V2, V2]) {
  let inside = true;
  let minD = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = tri[i];
    const b = tri[(i + 1) % 3];
    const c = tri[(i + 2) % 3];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    // 엣지 법선 방향의 부호 거리 (c 쪽이 내부)
    const side = (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) / len;
    const sideC = ex * (c[1] - a[1]) - ey * (c[0] - a[0]);
    const signed = sideC > 0 ? side : -side;
    if (signed < 0) inside = false;
    minD = Math.min(minD, Math.abs(side));
  }
  return { inside, edge: minD };
}

function eyeInfo(u: number, v: number, cx: number, tilt: number) {
  const du = u - cx;
  const dv = v - -0.02;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const ru = du * c + dv * s;
  const rv = -du * s + dv * c;
  // 아몬드형: 끝이 뾰족해지도록 세로 반경을 가로 위치에 따라 줄임
  const rx = 0.21;
  const ry = 0.14 * (1 - Math.pow(Math.abs(ru) / rx, 1.6));
  const inside = Math.abs(ru) <= rx && Math.abs(rv) <= Math.max(0, ry);
  const pupil = inside && Math.abs(ru) < 0.05;
  return { inside, pupil };
}

export interface KittySample {
  u: number;
  v: number;
  part: number;
  nx: number;
  ny: number;
  nz: number;
  bulge: number;
}

/** 고양이 형상을 조밀하게 샘플링 */
export function sampleKitty(rand: Rand, step = 0.028): KittySample[] {
  const out: KittySample[] = [];
  for (let v = -0.92; v <= 1.22; v += step) {
    for (let u = -1.02; u <= 1.02; u += step) {
      const ju = u + (rand() - 0.5) * step;
      const jv = v + (rand() - 0.5) * step;
      const sample = classify(ju, jv);
      if (sample) out.push(sample);
    }
  }
  // 얇은 선(입) 은 따로 촘촘하게 찍어서 해상도가 낮아도 보이게
  for (let k = 0; k < 2; k++) {
    const sx = k === 0 ? -1 : 1;
    for (let a = 0; a <= Math.PI; a += 0.06) {
      const u = sx * 0.11 + Math.cos(a) * 0.11;
      const v = -0.4 - Math.sin(a) * 0.09;
      out.push({ u, v, part: KP.MOUTH, nx: 0, ny: 0, nz: 1, bulge: 0.06 });
    }
  }
  for (let v = -0.36; v >= -0.41; v -= 0.01) {
    out.push({ u: 0, v, part: KP.MOUTH, nx: 0, ny: 0, nz: 1, bulge: 0.06 });
  }
  return out;
}

function classify(u: number, v: number): KittySample | null {
  const p: V2 = [u, v];
  const eu = u / HEAD_RX;
  const ev = (v - HEAD_CY) / HEAD_RY;
  const e = eu * eu + ev * ev;
  const inHead = e <= 1;
  const earL = triInfo(p, EAR_L);
  const earR = triInfo(p, EAR_R);
  const inEar = earL.inside || earR.inside;
  if (!inHead && !inEar) return null;

  // 법선: 얼굴은 살짝 볼록한 돔
  const r2 = Math.min(1, e);
  const bulge = 0.05 * (1 - r2);
  let nx = eu * 0.55;
  let ny = ev * 0.55;
  let nz = 1;
  let part: number = KP.FACE;

  if (inEar && !inHead) {
    const tri = earL.inside ? EAR_L_IN : EAR_R_IN;
    const inner = triInfo(p, tri).inside;
    const edge = earL.inside ? earL.edge : earR.edge;
    nx = earL.inside ? -0.45 : 0.45;
    ny = 0.55;
    part = inner ? KP.EAR_INNER : edge < 0.075 ? KP.RIM : KP.FACE;
  } else {
    if (e > 0.9 && !inEar) part = KP.RIM;
    const eyeL = eyeInfo(u, v, -0.4, -0.2);
    const eyeR = eyeInfo(u, v, 0.4, 0.2);
    if (eyeL.inside || eyeR.inside) part = eyeL.pupil || eyeR.pupil ? KP.PUPIL : KP.EYE;
    // 코: 역삼각형
    const nyv = (v + 0.26) / -0.11; // 0(위) → 1(아래 끝)
    if (nyv >= 0 && nyv <= 1 && Math.abs(u) <= 0.09 * (1 - nyv)) part = KP.NOSE;
  }

  const len = Math.hypot(nx, ny, nz);
  const featureLift = part === KP.FACE || part === KP.RIM ? 0 : part === KP.PUPIL ? 0.08 : 0.05;
  return { u, v, part, nx: nx / len, ny: ny / len, nz: nz / len, bulge: bulge + featureLift };
}

/** 파츠별 기본 색 (0..1) */
export const KITTY_COLORS: Record<number, [number, number, number]> = {
  [KP.FACE]: [1.0, 0.76, 0.28],
  [KP.RIM]: [1.0, 0.9, 0.56],
  [KP.EAR_INNER]: [1.0, 0.5, 0.42],
  [KP.EYE]: [0.42, 1.0, 0.78],
  [KP.PUPIL]: [0.04, 0.12, 0.08],
  [KP.NOSE]: [1.0, 0.42, 0.55],
  [KP.MOUTH]: [0.36, 0.17, 0.05],
};

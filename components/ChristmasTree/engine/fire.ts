import { makeValueNoise2D, mulberry32 } from './rng';

/**
 * 셀(문자) 격자 위에서 도는 ASCII 화염 시뮬레이션.
 * - 고양이 실루엣 셀이 ‘연료(열원)’
 * - 열은 한 스텝마다 한 줄씩 위로 이동하며 스크롤되는 냉각맵(value noise)만큼 식는다 → 혀처럼 날름거리는 불꽃
 */
export class FireField {
  readonly fw: number;
  readonly fh: number;
  /** 격자 좌표계에서 화염 영역의 좌상단 */
  readonly col0: number;
  readonly row0: number;
  heat: Float32Array;
  /** 고양이 셀(연료) 마스크 */
  mask: Uint8Array;
  /** 마스크 셀의 고양이 내 상대 높이 (0 = 바닥, 1 = 귀 끝) */
  relRow: Float32Array;
  /** 셀별 연료량 (윤곽선/귀 = 1, 얼굴 안쪽 = 낮음) */
  fuel: Float32Array;
  private cool: Float32Array;
  private coolH: number;
  private scroll = 0;
  private rand = mulberry32(777);
  private avgCool: number;
  /** 가장자리일수록 더 빨리 식도록 (불꽃이 위로 갈수록 가운데로 모임) */
  private edgeCool: Float32Array;
  private spread = 0;

  constructor(
    catCells: { col: number; row: number; fuel: number }[],
    opts: { padX: number; flameRows: number },
  ) {
    let c0 = Infinity;
    let c1 = -Infinity;
    let r0 = Infinity;
    let r1 = -Infinity;
    for (const c of catCells) {
      if (c.col < c0) c0 = c.col;
      if (c.col > c1) c1 = c.col;
      if (c.row < r0) r0 = c.row;
      if (c.row > r1) r1 = c.row;
    }
    if (!isFinite(c0)) {
      c0 = c1 = r0 = r1 = 0;
    }
    this.col0 = c0 - opts.padX;
    this.row0 = r0 - opts.flameRows;
    this.fw = c1 - c0 + 1 + opts.padX * 2;
    this.fh = r1 - this.row0 + 3;
    this.heat = new Float32Array(this.fw * this.fh);
    this.mask = new Uint8Array(this.fw * this.fh);
    this.relRow = new Float32Array(this.fw * this.fh);
    this.fuel = new Float32Array(this.fw * this.fh);
    const catRows = Math.max(1, r1 - r0);
    for (const c of catCells) {
      const fx = c.col - this.col0;
      const fy = c.row - this.row0;
      const i = fy * this.fw + fx;
      this.mask[i] = 1;
      this.relRow[i] = (r1 - c.row) / catRows;
      // 위쪽일수록 불이 잘 붙음
      this.fuel[i] = Math.max(this.fuel[i], c.fuel * (0.55 + 0.45 * this.relRow[i]));
    }

    // 냉각맵: 세로로 4배 길게 만들어 위로 스크롤
    this.coolH = this.fh * 4;
    this.cool = new Float32Array(this.fw * this.coolH);
    const noise = makeValueNoise2D(4242);
    for (let y = 0; y < this.coolH; y++) {
      for (let x = 0; x < this.fw; x++) {
        const n = noise(x * 0.55, y * 0.12) * 0.72 + noise(x * 1.3 + 50, y * 0.45) * 0.28;
        this.cool[y * this.fw + x] = Math.pow(n, 2.6);
      }
    }
    const mid = (this.fw - 1) / 2;
    const half = Math.max(1, (c1 - c0) / 2 + opts.padX * 0.5);
    this.edgeCool = new Float32Array(this.fw);
    for (let x = 0; x < this.fw; x++) {
      const d = Math.abs(x - mid) / half;
      this.edgeCool[x] = 0.006 + 0.06 * d * d;
    }
    // 불꽃 높이 ≈ flameRows 가 되도록 냉각량 조절
    let sum = 0;
    for (let i = 0; i < this.cool.length; i++) sum += this.cool[i];
    const mean = sum / this.cool.length;
    this.avgCool = (1 / (opts.flameRows * 0.7)) / mean;
  }

  /**
   * @param intensity 0..1.4 (1.2 이상이면 불꽃이 확 솟음)
   * @param spread 0..1 점화가 고양이 아래에서 위로 번져 올라가는 정도
   * @param wind 좌우 바람 (-1..1)
   */
  step(intensity: number, spread: number, wind: number) {
    const { fw, fh, heat, cool, mask, relRow, fuel } = this;
    const rand = this.rand;
    this.scroll = (this.scroll + 1) % this.coolH;
    this.spread = spread;
    const coolK = this.avgCool / Math.max(0.35, intensity);

    for (let y = 0; y < fh - 2; y++) {
      const crow = ((y + this.scroll) % this.coolH) * fw;
      const r1 = (y + 1) * fw;
      const r2 = (y + 2) * fw;
      for (let x = 1; x < fw - 1; x++) {
        const rv = rand();
        let xs = x + (rv < 0.3 ? -1 : rv > 0.7 ? 1 : 0);
        if (wind > 0.25 && rv > 0.6) xs += 1;
        else if (wind < -0.25 && rv < 0.4) xs -= 1;
        if (xs < 1) xs = 1;
        else if (xs > fw - 2) xs = fw - 2;
        // 바로 아래 칸 위주로 끌어올림 (평균을 약하게 → 갈라지는 불꽃 혀)
        const s = heat[r1 + xs] * 0.62 + (heat[r1 + xs - 1] + heat[r1 + xs + 1]) * 0.13 + heat[r2 + xs] * 0.12;
        const v = s - cool[crow + x] * coolK - this.edgeCool[x] * (0.5 + rand());
        heat[y * fw + x] = v > 0 ? v : 0;
      }
    }
    // 바닥 두 줄은 비움(연료 셀만 남김)
    for (let y = fh - 2; y < fh; y++) for (let x = 0; x < fw; x++) heat[y * fw + x] = 0;

    // 연료 주입
    if (intensity > 0) {
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        if (relRow[i] > spread * 1.15) continue;
        const f = intensity * fuel[i] * (0.75 + 0.25 * rand());
        if (heat[i] < f) heat[i] = f;
      }
    }
  }

  /** 셀 좌표(격자) → 열 값 */
  heatAt(col: number, row: number) {
    const fx = col - this.col0;
    const fy = row - this.row0;
    if (fx < 0 || fy < 0 || fx >= this.fw || fy >= this.fh) return 0;
    return this.heat[fy * this.fw + fx];
  }

  /** 이 셀에 불이 얼마나 붙었는지 (0..1) — 고양이 아래에서 위로 번져 올라감 */
  ignition(col: number, row: number) {
    const fx = col - this.col0;
    const fy = row - this.row0;
    if (fx < 0 || fy < 0 || fx >= this.fw || fy >= this.fh) return 0;
    const i = fy * this.fw + fx;
    if (!this.mask[i]) return 0;
    const v = (this.spread * 1.15 - this.relRow[i]) * 4;
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
  }

  relAt(col: number, row: number) {
    const fx = col - this.col0;
    const fy = row - this.row0;
    if (fx < 0 || fy < 0 || fx >= this.fw || fy >= this.fh) return 0;
    return this.relRow[fy * this.fw + fx];
  }

  reset() {
    this.heat.fill(0);
    this.spread = 0;
  }
}

/** 열(0..1+) → 불 색 LUT */
const FIRE_STOPS: [number, [number, number, number]][] = [
  [0.0, [40, 0, 0]],
  [0.18, [120, 12, 4]],
  [0.32, [200, 34, 6]],
  [0.48, [255, 88, 10]],
  [0.64, [255, 150, 28]],
  [0.8, [255, 210, 80]],
  [0.92, [255, 240, 170]],
  [1.0, [255, 252, 232]],
];

export function fireRGB(h: number): [number, number, number] {
  const v = h < 0 ? 0 : h > 1 ? 1 : h;
  for (let i = 1; i < FIRE_STOPS.length; i++) {
    const [p1, c1] = FIRE_STOPS[i];
    if (v <= p1) {
      const [p0, c0] = FIRE_STOPS[i - 1];
      const t = (v - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return FIRE_STOPS[FIRE_STOPS.length - 1][1];
}

export const FIRE_RAMP = ".,'`:;!|i^*";

/** 불씨 파티클 */
export interface Ember {
  x: number; // 셀 단위 (float)
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  ch: string;
}

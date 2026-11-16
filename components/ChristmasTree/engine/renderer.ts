import { buildScene, K, KITTY, KITTY_FLIGHT, type Scene } from './scene';
import type { TopperImage } from './imageTopper';
import { KP } from './kitty';
import { FireField, fireRGB, FIRE_RAMP, type Ember } from './fire';
import { clamp, easeOutCubic, makeValueNoise2D, mulberry32 } from './rng';
import { FLASH_AT, IGNITE_AT, IGNITE_SPREAD, phaseAt, T, type PhaseId } from './timeline';

const FONT_STACK = "'JetBrains Mono', 'D2Coding', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace";

// 카메라
const CAM_D = 3.4;
const PITCH = 0.17;
const TARGET_Y = 0.8;
const ROT_SPEED = 0.36; // rad/s
// 착지한 토퍼는 트리 꼭대기에 걸쳐 있으므로, 회전하는 꼭대기 잎이 토퍼 아랫부분을 가리지 않게 z-버퍼에서 앞으로 당김
const TOPPER_DEPTH_BIAS = 0.3;

// 카메라 공간 광원 방향 (좌상단 앞쪽)
const LX0 = -0.45;
const LY0 = 0.6;
const LZ0 = 0.66;
const LLEN = Math.hypot(LX0, LY0, LZ0);
const LX = LX0 / LLEN;
const LY = LY0 / LLEN;
const LZ = LZ0 / LLEN;
// 블린-퐁 하프벡터 (V = 0,0,1)
const HX0 = LX;
const HY0 = LY;
const HZ0 = LZ + 1;
const HLEN = Math.hypot(HX0, HY0, HZ0);
const HX = HX0 / HLEN;
const HY = HY0 / HLEN;
const HZ = HZ0 / HLEN;

const RAMP_GROUND = ".-:=~";
const RAMP_TRUNK = ".:il|I";
const RAMP_NEEDLE = ":;=+*xX#%@";
const RAMP_BALL = ".oO0@";
const RAMP_GIFT = ".:=+#%";
const RAMP_FACE = ".:-=+*#%";
const RAMP_BURN = "*%#&@";
const RAMP_IMG = ".:-=+*#%@";

const pick = (ramp: string, v: number) => ramp[v <= 0 ? 0 : v >= 1 ? ramp.length - 1 : (v * ramp.length) | 0];

export interface FrameStats {
  phase: PhaseId;
  rotationDeg: number;
  lights: number;
  letters: number;
  burning: boolean;
  temperature: number;
}

interface Star {
  x: number;
  y: number;
  ch: string;
  ph: number;
  sp: number;
  a: number;
}
interface Flake {
  x: number;
  y: number;
  vy: number;
  vx: number;
  ch: string;
  a: number;
  near: boolean;
}

export class AsciiTreeRenderer {
  private ctx: CanvasRenderingContext2D;
  private scene: Scene;
  private noise = makeValueNoise2D(99);
  private rand = mulberry32(31337);

  // layout
  private W = 0;
  private H = 0;
  private sceneH = 0;
  private dpr = 1;
  private cellW = 6;
  private cellH = 10;
  private cols = 0;
  private rows = 0;
  private offX = 0;
  private offY = 0;
  private f = 1;
  private cx = 0;
  private cy = 0;
  private font = '';

  // buffers
  private zbuf = new Float32Array(0);
  private owner = new Int32Array(0);
  private touched = new Int32Array(0);
  private touchedN = 0;
  private colorCache: (string | undefined)[] = new Array(32768);

  private bg: HTMLCanvasElement | null = null;
  private glowCache = new Map<string, HTMLCanvasElement>();
  private stars: Star[] = [];
  private flakes: Flake[] = [];

  private fire: FireField | null = null;
  private catRows = 10;
  private fireAcc = 0;
  private embers: Ember[] = [];
  private burstDone = false;
  private lastT = 0;

  /** image 를 넘기면 고양이 대신 그 이미지를 토퍼로 사용 */
  constructor(
    private canvas: HTMLCanvasElement,
    image: TopperImage | null = null,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;
    this.scene = buildScene(1225, image);
  }

  /** bottomInset: 하단 코드 패널이 덮는 높이(px) */
  resize(W: number, H: number, bottomInset: number, dpr: number) {
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.sceneH = Math.max(200, H - bottomInset);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 셀 크기: 화면 높이에 맞춰 촘촘하게
    const cellH = clamp(Math.round(this.sceneH / 84), 7, 15);
    this.font = `${cellH}px ${FONT_STACK}`;
    ctx.font = this.font;
    const adv = ctx.measureText('M').width || cellH * 0.6;
    this.cellH = cellH;
    this.cellW = adv;
    this.cols = Math.floor(W / this.cellW);
    this.rows = Math.ceil(H / this.cellH);
    this.offX = (W - this.cols * this.cellW) / 2;
    this.offY = 0;

    const n = this.cols * this.rows;
    this.zbuf = new Float32Array(n);
    this.owner = new Int32Array(n);
    this.touched = new Int32Array(n);

    this.fitCamera();
    this.buildBackground();
    this.buildStars();
    this.buildFire();
  }

  /** 지면 앞쪽 끝 ~ 불꽃 꼭대기가 장면 높이에 들어오도록 초점거리/중심 계산 */
  private fitCamera() {
    const cp = Math.cos(PITCH);
    const sp = Math.sin(PITCH);
    const k = (y: number, z: number) => {
      const yy = y - TARGET_Y;
      const y3 = yy * cp - z * sp;
      const z3 = yy * sp + z * cp;
      return y3 / (CAM_D - z3);
    };
    const k1 = k(0, 0.7); // 지면 앞쪽
    const k2 = k(1.68, 0); // 불꽃 꼭대기 (크게 치솟을 땐 화면 위로 살짝 넘어감)
    const top = this.sceneH * 0.0;
    const bottom = this.sceneH * 0.985;
    let f = (bottom - top) / (k2 - k1);
    // 가로 폭 제한
    const maxF = (this.W * 0.96 * CAM_D) / 1.5;
    f = Math.min(f, maxF);
    const mid = (top + bottom) / 2;
    this.f = f;
    this.cy = mid + (f * (k1 + k2)) / 2;
    this.cx = this.W / 2;
  }

  private buildBackground() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.W * this.dpr));
    c.height = Math.max(1, Math.round(this.H * this.dpr));
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const grad = g.createRadialGradient(this.W / 2, this.sceneH * 0.35, 0, this.W / 2, this.sceneH * 0.35, Math.max(this.W, this.H) * 0.75);
    grad.addColorStop(0, '#0f1730');
    grad.addColorStop(0.5, '#080c1a');
    grad.addColorStop(1, '#03050a');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.W, this.H);
    // 그라데이션 밴딩 방지용 미세 노이즈
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const rnd = mulberry32(7);
    for (let p = 0; p < d.length; p += 4) {
      const n = (rnd() - 0.5) * 3;
      d[p] += n;
      d[p + 1] += n;
      d[p + 2] += n;
    }
    g.putImageData(img, 0, 0);
    this.bg = c;
  }

  private buildStars() {
    const r = this.rand;
    const area = this.W * this.sceneH;
    const nStars = Math.round(clamp(area / 5200, 80, 420));
    this.stars = [];
    for (let i = 0; i < nStars; i++) {
      const big = r() < 0.08;
      this.stars.push({
        x: r() * this.W,
        y: r() * this.sceneH,
        ch: big ? (r() < 0.5 ? '+' : '*') : r() < 0.7 ? '.' : '·',
        ph: r() * Math.PI * 2,
        sp: 0.6 + r() * 2.4,
        a: big ? 0.9 : 0.35 + r() * 0.55,
      });
    }
    const nFlakes = Math.round(clamp(area / 9000, 50, 260));
    this.flakes = [];
    for (let i = 0; i < nFlakes; i++) this.flakes.push(this.newFlake(true));
  }

  private newFlake(anywhere: boolean): Flake {
    const r = this.rand;
    const near = r() < 0.25;
    return {
      x: r() * this.W,
      y: anywhere ? r() * this.H : -10,
      vy: (near ? 26 : 12) + r() * (near ? 30 : 16),
      vx: (r() - 0.5) * 10,
      ch: near ? (r() < 0.5 ? '*' : '+') : r() < 0.6 ? '.' : ',',
      a: near ? 0.55 + r() * 0.3 : 0.2 + r() * 0.35,
      near,
    };
  }

  /** 고양이 목표 위치를 투영해 연료 셀 집합을 만든다 */
  private buildFire() {
    const s = this.scene;
    const cp = Math.cos(PITCH);
    const sp = Math.sin(PITCH);
    const cellMap = new Map<number, { col: number; row: number; fuel: number }>();
    for (let i = s.kittyStart; i < s.kittyEnd; i++) {
      const yy = s.y[i] - TARGET_Y;
      const z = s.z[i];
      const y3 = yy * cp - z * sp;
      const z3 = yy * sp + z * cp;
      const depth = CAM_D - z3;
      const sx = this.cx + (s.x[i] * this.f) / depth;
      const sy = this.cy - (y3 * this.f) / depth;
      const col = Math.floor((sx - this.offX) / this.cellW);
      const row = Math.floor((sy - this.offY) / this.cellH);
      const part = s.part[i];
      let fuel: number;
      if (part === KP.IMG_EDGE) fuel = 1;
      else if (part === KP.IMG) fuel = 0.5;
      else {
        const v = (s.y[i] - KITTY.cy) / KITTY.scale;
        fuel = part === KP.RIM ? 1 : part === KP.EAR_INNER || v > 0.5 ? 0.95 : part === KP.FACE ? 0.5 : 0.35;
      }
      const key = row * 100000 + col;
      const c = cellMap.get(key);
      if (c) c.fuel = Math.max(c.fuel, fuel);
      else cellMap.set(key, { col, row, fuel });
    }
    const cells = [...cellMap.values()];
    let r0 = Infinity;
    let r1 = -Infinity;
    for (const c of cells) {
      r0 = Math.min(r0, c.row);
      r1 = Math.max(r1, c.row);
    }
    const catRows = Math.max(4, r1 - r0 + 1);
    this.catRows = catRows;
    this.fire = new FireField(cells, {
      padX: Math.round(catRows * 0.6),
      flameRows: Math.round(catRows * 1.9),
    });
    this.embers = [];
  }

  private colorStr(r: number, g: number, b: number) {
    const ri = r <= 0 ? 0 : r >= 1 ? 31 : (r * 31.99) | 0;
    const gi = g <= 0 ? 0 : g >= 1 ? 31 : (g * 31.99) | 0;
    const bi = b <= 0 ? 0 : b >= 1 ? 31 : (b * 31.99) | 0;
    const key = (ri << 10) | (gi << 5) | bi;
    let c = this.colorCache[key];
    if (!c) {
      c = `rgb(${(ri * 255) / 31 | 0},${(gi * 255) / 31 | 0},${(bi * 255) / 31 | 0})`;
      this.colorCache[key] = c;
    }
    return c;
  }

  private glow(r: number, g: number, b: number) {
    const key = `${r},${g},${b}`;
    let c = this.glowCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const gx = c.getContext('2d')!;
      const grad = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
      grad.addColorStop(0.25, `rgba(${r},${g},${b},0.45)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      gx.fillStyle = grad;
      gx.fillRect(0, 0, 64, 64);
      this.glowCache.set(key, c);
    }
    return c;
  }

  /** 점화 상태 */
  private fireState(t: number) {
    if (t < IGNITE_AT) return { I: 0, spread: 0 };
    const k = clamp((t - IGNITE_AT) / IGNITE_SPREAD, 0, 1);
    let I = 0.55 + 0.45 * k;
    if (t > FLASH_AT) I += 0.42 * Math.exp(-(t - FLASH_AT) * 2.2);
    if (t > T.BURNING.start) {
      const ph = (t - T.BURNING.start) % 4.6;
      if (ph < 1.0) I += 0.3 * Math.sin((ph / 1.0) * Math.PI);
    }
    I += 0.06 * Math.sin(t * 13.1) * Math.sin(t * 7.7);
    return { I, spread: k };
  }

  render(t: number): FrameStats {
    const dt = clamp(t - this.lastT, 0, 0.1);
    this.lastT = t;
    const ctx = this.ctx;
    const s = this.scene;
    const { cols, rows, cellW, cellH, offX, offY, f, cx, cy } = this;
    const fire = this.fire!;
    const { I: fireI, spread } = this.fireState(t);
    const burning = fireI > 0;

    // ---------------------------------------------------- 화염 시뮬레이션 (30Hz 고정)
    if (burning) {
      this.fireAcc += dt;
      const wind = Math.sin(t * 0.7) * 0.6;
      let steps = 0;
      while (this.fireAcc >= 1 / 30 && steps < 4) {
        fire.step(fireI, spread, wind);
        this.fireAcc -= 1 / 30;
        steps++;
      }
    } else if (t < IGNITE_AT - 0.1) {
      fire.reset();
      this.embers.length = 0;
      this.burstDone = false;
    }

    // ---------------------------------------------------- 배경
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, this.W, this.H);

    // 흔들림
    let shx = 0;
    let shy = 0;
    if (t > FLASH_AT && t < FLASH_AT + 0.7) {
      const amp = 6 * Math.exp(-(t - FLASH_AT) * 5);
      shx = (this.rand() - 0.5) * amp * 2;
      shy = (this.rand() - 0.5) * amp * 2;
    }
    ctx.translate(shx, shy);

    ctx.font = this.font;
    ctx.textBaseline = 'top';

    // 별
    for (const st of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph);
      const a = st.a * (0.35 + 0.65 * tw);
      ctx.fillStyle = `rgba(200,214,255,${a.toFixed(2)})`;
      ctx.fillText(st.ch, st.x, st.y);
    }
    // 먼 눈송이
    this.drawFlakes(dt, false);

    // ---------------------------------------------------- 고양이 뒤 후광
    const tp = s.topper;
    const kittyScreen = this.project(tp.cx, tp.cy, 0);
    const catLanded = t > T.KITTY.end - 0.2;
    if (t > T.KITTY.start + 0.6) {
      const k = clamp((t - (T.KITTY.start + 0.6)) / 1.6, 0, 1);
      const rad = (f / CAM_D) * 0.6 * (burning ? 1.35 + 0.08 * Math.sin(t * 9) : 1) * (0.6 + 0.4 * k);
      const grad = ctx.createRadialGradient(kittyScreen.x, kittyScreen.y, 0, kittyScreen.x, kittyScreen.y, rad);
      if (burning) {
        const a = clamp(0.24 * fireI, 0, 0.4);
        grad.addColorStop(0, `rgba(255,120,30,${a})`);
        grad.addColorStop(0.4, `rgba(200,50,10,${a * 0.45})`);
        grad.addColorStop(1, 'rgba(80,10,0,0)');
      } else {
        const a = 0.22 * k * (0.85 + 0.15 * Math.sin(t * 2.4));
        grad.addColorStop(0, `rgba(255,214,120,${a})`);
        grad.addColorStop(1, 'rgba(255,200,90,0)');
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(kittyScreen.x - rad, kittyScreen.y - rad, rad * 2, rad * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------- 래스터화 (z-buffer per cell)
    const rot = t * ROT_SPEED;
    const cR = Math.cos(rot);
    const sR = Math.sin(rot);
    const cp = Math.cos(PITCH);
    const sp = Math.sin(PITCH);
    const zbuf = this.zbuf;
    const owner = this.owner;
    const touched = this.touched;
    zbuf.fill(Infinity);
    this.touchedN = 0;
    let lights = 0;

    const X = s.x;
    const Y = s.y;
    const Z = s.z;
    const T0 = s.t0;
    const KIND = s.kind;
    const N = s.count;

    for (let i = 0; i < N; i++) {
      const t0 = T0[i];
      if (t < t0) continue;
      const kind = KIND[i];
      let x: number;
      let y: number;
      let z: number;
      if (kind === K.KITTY) {
        const age = t - t0;
        x = X[i];
        y = Y[i];
        z = Z[i];
        if (age < KITTY_FLIGHT) {
          const e = easeOutCubic(age / KITTY_FLIGHT);
          const w = 1 - e;
          const sw = w * 2.4;
          const c = Math.cos(sw);
          const sn = Math.sin(sw);
          const ox = s.ox[i] * w;
          const oz = s.oz[i] * w;
          x += ox * c - oz * sn;
          z += ox * sn + oz * c;
          y += s.oy[i] * w;
        }
      } else {
        if (kind === K.LIGHT) lights++;
        const px = X[i];
        const pz = Z[i];
        x = px * cR + pz * sR;
        z = -px * sR + pz * cR;
        y = Y[i];
      }
      const yy = y - TARGET_Y;
      const y3 = yy * cp - z * sp;
      const z3 = yy * sp + z * cp;
      const depth = CAM_D - z3;
      const inv = f / depth;
      const sx = cx + x * inv;
      const sy = cy - y3 * inv;
      const col = ((sx - offX) / cellW) | 0;
      const row = ((sy - offY) / cellH) | 0;
      if (col < 0 || row < 0 || col >= cols || row >= rows || sx < offX || sy < offY) continue;
      const idx = row * cols + col;
      const zd = kind === K.KITTY && t - t0 >= KITTY_FLIGHT ? depth - TOPPER_DEPTH_BIAS : depth;
      if (zd < zbuf[idx]) {
        if (zbuf[idx] === Infinity) touched[this.touchedN++] = idx;
        zbuf[idx] = zd;
        owner[idx] = i;
      }
    }

    // ---------------------------------------------------- 셀 그리기
    const glows: { x: number; y: number; r: number; c: HTMLCanvasElement; a: number }[] = [];
    let letters = 0;
    const lightGlow = this.glow(255, 196, 110);
    const coolGlow = this.glow(150, 200, 255);
    const eyeGlowCalm = this.glow(120, 255, 200);
    const eyeGlowHot = this.glow(255, 236, 160);
    const noise = this.noise;

    for (let n = 0; n < this.touchedN; n++) {
      const idx = touched[n];
      const i = owner[idx];
      const col = idx % cols;
      const row = (idx / cols) | 0;
      const kind = KIND[i];

      // 화염이 덮는 셀은 화염 패스에서 그림
      if (burning && kind !== K.KITTY && fire.heatAt(col, row) > 0.13) continue;

      const age = t - T0[i];
      let r = s.r[i];
      let g = s.g[i];
      let b = s.b[i];
      let ch = '.';

      // 카메라 공간 법선/위치
      let nx3: number;
      let ny3: number;
      let nz3: number;
      let z3 = 0;
      if (kind === K.KITTY) {
        nx3 = s.nx[i];
        ny3 = s.ny[i] * cp - s.nz[i] * sp;
        nz3 = s.ny[i] * sp + s.nz[i] * cp;
      } else {
        const nx = s.nx[i];
        const nz = s.nz[i];
        const nxr = nx * cR + nz * sR;
        const nzr = -nx * sR + nz * cR;
        nx3 = nxr;
        ny3 = s.ny[i] * cp - nzr * sp;
        nz3 = s.ny[i] * sp + nzr * cp;
        const pz = -X[i] * sR + Z[i] * cR;
        z3 = (Y[i] - TARGET_Y) * sp + pz * cp;
      }
      const diff = Math.max(0, nx3 * LX + ny3 * LY + nz3 * LZ);
      const fog = 0.55 + 0.45 * clamp(z3 * 1.15 + 0.5, 0, 1);

      switch (kind) {
        case K.GROUND: {
          const sd = s.seed[i];
          const lum = 0.35 + 0.65 * sd;
          const m = (0.55 + 0.45 * sd) * fog;
          r *= m;
          g *= m;
          b *= m;
          ch = pick(RAMP_GROUND, lum);
          break;
        }
        case K.TRUNK: {
          const m = (0.35 + 0.9 * diff) * fog;
          r *= m;
          g *= m;
          b *= m;
          ch = pick(RAMP_TRUNK, 0.2 + 0.8 * diff);
          break;
        }
        case K.NEEDLE: {
          const m = (0.5 + 1.15 * diff) * fog;
          r *= m;
          g *= m;
          b *= m;
          ch = pick(RAMP_NEEDLE, (0.2 + 0.8 * diff) * fog);
          break;
        }
        case K.SNOW: {
          const m = (0.55 + 0.55 * diff) * fog;
          r *= m;
          g *= m;
          b *= m;
          ch = diff > 0.6 ? '@' : diff > 0.3 ? '#' : '*';
          break;
        }
        case K.GARLAND: {
          const m = (0.5 + 0.9 * diff) * fog;
          r *= m;
          g *= m;
          b *= m;
          const sd = s.seed[i];
          ch = sd < 0.4 ? '~' : sd < 0.75 ? '-' : 'o';
          if (Math.sin(t * 5 + sd * 80) > 0.97) {
            r = g = 1;
            b = 0.85;
            ch = '*';
          }
          break;
        }
        case K.BALL: {
          const spec = Math.pow(Math.max(0, nx3 * HX + ny3 * HY + nz3 * HZ), 28);
          const m = (0.22 + 0.95 * diff) * fog;
          r = r * m + spec * 0.95;
          g = g * m + spec * 0.95;
          b = b * m + spec * 0.9;
          ch = spec > 0.45 ? '@' : pick(RAMP_BALL, 0.1 + 0.9 * diff);
          break;
        }
        case K.LIGHT: {
          const sd = s.seed[i];
          let tw = 0.55 + 0.45 * Math.sin(t * (1.4 + sd * 3) + sd * 40);
          if (sd > 0.85 && Math.sin(t * 2.2 + sd * 9) > 0.6) tw *= 0.25; // 깜빡이
          const m = 0.55 + 0.6 * tw;
          r = Math.min(1, r * m);
          g = Math.min(1, g * m);
          b = Math.min(1, b * m);
          ch = tw > 0.55 ? '*' : '+';
          const front = clamp(z3 * 1.4 + 0.6, 0.15, 1);
          glows.push({
            x: offX + col * cellW + cellW / 2,
            y: offY + row * cellH + cellH / 2,
            r: cellH * (1.6 + 1.6 * tw),
            c: s.b[i] > 0.9 ? coolGlow : lightGlow,
            a: 0.55 * tw * front,
          });
          break;
        }
        case K.GIFT: {
          const m = (0.32 + 0.95 * diff) * fog;
          r *= m;
          g *= m;
          b *= m;
          ch = pick(RAMP_GIFT, 0.15 + 0.85 * diff);
          break;
        }
        case K.RIBBON: {
          const m = (0.45 + 0.85 * diff) * fog;
          r *= m;
          g *= m;
          b *= m;
          ch = diff > 0.55 ? '#' : '+';
          break;
        }
        case K.KITTY: {
          const part = s.part[i];
          const inFlight = age < KITTY_FLIGHT;
          if (inFlight) {
            const p = age / KITTY_FLIGHT;
            r = 1;
            g = 0.85 + 0.15 * (1 - p);
            b = 0.5 + 0.5 * (1 - p);
            ch = p < 0.5 ? '.' : '*';
            break;
          }
          const lit = 0.7 + 0.5 * diff;
          // 점화가 이 셀까지 번졌는지 (아래 → 위로 번짐)
          const burnLocal = burning ? fire.ignition(col, row) : 0;
          const flick = noise(col * 0.45, row * 0.45 - t * 6);
          const hot = burnLocal > 0;
          switch (part) {
            case KP.EYE: {
              const gx = offX + col * cellW + cellW / 2;
              const gy = offY + row * cellH + cellH / 2;
              if (hot) {
                r = 1;
                g = 0.97;
                b = 0.78;
                ch = '@';
                glows.push({ x: gx, y: gy, r: cellH * 2.6, c: eyeGlowHot, a: 0.3 + 0.1 * flick });
              } else {
                const pulse = t > IGNITE_AT - 0.6 ? 0.5 + 0.5 * Math.sin(t * 22) : 0;
                r = 0.42 + 0.58 * pulse;
                g = 1;
                b = 0.8 + 0.2 * pulse;
                ch = 'O';
                glows.push({ x: gx, y: gy, r: cellH * 2.2, c: eyeGlowCalm, a: 0.16 + 0.3 * pulse });
              }
              break;
            }
            case KP.PUPIL:
              r = hot ? 0.7 : 0.12;
              g = hot ? 0.1 : 0.5;
              b = hot ? 0.0 : 0.38;
              ch = '|';
              break;
            case KP.NOSE:
              ch = 'v';
              r = 1;
              g = hot ? 0.85 : 0.48;
              b = hot ? 0.5 : 0.58;
              break;
            case KP.MOUTH: {
              const u = (X[i] - KITTY.cx) / KITTY.scale;
              const v = (Y[i] - KITTY.cy) / KITTY.scale;
              const du = u - Math.sign(u) * 0.11;
              ch = Math.abs(u) < 0.03 ? '|' : v < -0.465 ? '_' : du < 0 ? '\\' : '/';
              // 불이 붙으면 입 안에서 빛이 새어 나옴
              r = 1;
              g = hot ? 0.9 : 0.55;
              b = hot ? 0.55 : 0.42;
              break;
            }
            case KP.IMG:
            case KP.IMG_EDGE: {
              const isEdge = part === KP.IMG_EDGE;
              const lumP = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              const dark = lumP < 0.16;
              // 어두운 선/영역은 배경에 묻히지 않게 차가운 회색으로 살짝 띄움
              if (dark) {
                r = 0.2 + r * 0.5;
                g = 0.22 + g * 0.5;
                b = 0.3 + b * 0.5;
              }
              const shade = 0.78 + 0.38 * diff;
              r *= shade;
              g *= shade;
              b *= shade;
              ch = dark ? (lumP < 0.07 ? '.' : ':') : pick(RAMP_IMG, 0.22 + 0.78 * lumP);
              if (hot) {
                const heatV = isEdge ? 0.84 + 0.16 * flick : 0.18 + 0.6 * lumP + 0.16 * (flick - 0.5);
                const [fr, fg, fb] = fireRGB(heatV);
                const m = 0.82 * burnLocal;
                r = r + (fr / 255 - r) * m;
                g = g + (fg / 255 - g) * m;
                b = b + (fb / 255 - b) * m;
                ch = isEdge ? (flick > 0.5 ? '@' : '#') : dark ? ':' : pick(RAMP_BURN, 0.15 + 0.85 * Math.max(lumP, flick));
                const rel = fire.relAt(col, row);
                const lick = noise(col * 0.3 + 20, row * 0.5 + t * 7);
                if (!isEdge && rel > 0.4 && lick > 0.8 - 0.06 * fireI) {
                  const [lr, lg, lb] = fireRGB(0.7 + 0.3 * lick);
                  r = lr / 255;
                  g = lg / 255;
                  b = lb / 255;
                  ch = lick > 0.9 ? '^' : '*';
                } else if (lumP > 0.82 && (col * 7 + row * 3) % 6 === 0) {
                  glows.push({
                    x: offX + col * cellW + cellW / 2,
                    y: offY + row * cellH + cellH / 2,
                    r: cellH * 2.2,
                    c: eyeGlowHot,
                    a: 0.1 * burnLocal,
                  });
                }
              }
              break;
            }
            default: {
              // 얼굴/테두리/귀 안쪽
              r *= lit;
              g *= lit;
              b *= lit;
              ch = part === KP.RIM ? '#' : part === KP.EAR_INNER ? '^' : pick(RAMP_FACE, 0.3 + 0.7 * diff);
              if (hot) {
                const heatV =
                  part === KP.RIM ? 0.86 + 0.14 * flick : part === KP.EAR_INNER ? 0.2 + 0.14 * flick : 0.24 + 0.24 * flick;
                const [fr, fg, fb] = fireRGB(heatV);
                const m = burnLocal;
                r = r + (fr / 255 - r) * m;
                g = g + (fg / 255 - g) * m;
                b = b + (fb / 255 - b) * m;
                if (part === KP.FACE) ch = pick(RAMP_BURN, flick);
                else if (part === KP.RIM) ch = flick > 0.5 ? '@' : '#';
                // 얼굴 위를 핥고 지나가는 불꽃 혀
                const rel = fire.relAt(col, row);
                const lick = noise(col * 0.3 + 20, row * 0.5 + t * 7);
                if (part === KP.FACE && rel > 0.4 && lick > 0.8 - 0.06 * fireI) {
                  const [lr, lg, lb] = fireRGB(0.7 + 0.3 * lick);
                  r = lr / 255;
                  g = lg / 255;
                  b = lb / 255;
                  ch = lick > 0.9 ? '^' : '*';
                }
              }
            }
          }
          // 착지 직후 반짝
          const land = age - KITTY_FLIGHT;
          if (land < 0.3) {
            const fl = 1 - land / 0.3;
            r += (1 - r) * fl;
            g += (1 - g) * fl;
            b += (0.85 - b) * fl;
          }
          break;
        }
      }

      // 새로 생긴 글자는 하얗게 반짝이며 등장
      if (kind !== K.KITTY && age < 0.45) {
        const fl = 1 - age / 0.45;
        const m = fl * 0.85;
        r += (1 - r) * m;
        g += (1 - g) * m;
        b += (0.92 - b) * m;
        if (fl > 0.6) ch = '#';
      }

      // 불타는 고양이가 트리 꼭대기를 주황빛으로 물들임
      if (burning && kind !== K.KITTY && kind !== K.GROUND) {
        const dy = Y[i] - tp.cy;
        const d2 = X[i] * X[i] + dy * dy + Z[i] * Z[i];
        const warm = fireI * 0.9 * Math.exp(-d2 * 7);
        r += warm * 1.0;
        g += warm * 0.42;
        b += warm * 0.08;
      }

      ctx.fillStyle = this.colorStr(r, g, b);
      ctx.fillText(ch, offX + col * cellW, offY + row * cellH);
      letters++;
    }

    // ---------------------------------------------------- 화염 셀
    if (burning) letters += this.drawFire(t, fireI, glows);

    // ---------------------------------------------------- 글로우 (가산 혼합)
    ctx.globalCompositeOperation = 'lighter';
    for (const gl of glows) {
      ctx.globalAlpha = clamp(gl.a, 0, 1);
      ctx.drawImage(gl.c, gl.x - gl.r, gl.y - gl.r, gl.r * 2, gl.r * 2);
    }
    ctx.globalAlpha = 1;

    // 완성 직후 고양이 반짝임 (불 붙기 전)
    if (catLanded && !burning) {
      const k = 0.5 + 0.5 * Math.sin(t * 3);
      const gs = this.glow(255, 220, 140);
      const rr = cellH * 9;
      ctx.globalAlpha = 0.18 + 0.12 * k;
      ctx.drawImage(gs, kittyScreen.x - rr, kittyScreen.y - rr, rr * 2, rr * 2);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';

    // 불씨
    if (burning) this.updateEmbers(t, dt, fireI);

    // 가까운 눈송이
    this.drawFlakes(dt, true);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 점화 플래시
    if (t > FLASH_AT && t < FLASH_AT + 1.2) {
      const a = 0.42 * Math.exp(-(t - FLASH_AT) * 5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,150,60,${a.toFixed(3)})`;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalCompositeOperation = 'source-over';
    }

    const deg = (rot * 180) / Math.PI;
    return {
      phase: phaseAt(t).id,
      rotationDeg: deg,
      lights,
      letters,
      burning,
      temperature: burning ? Math.round(820 + 420 * Math.min(1.3, fireI)) : 0,
    };
  }

  /** 회전하지 않는(빌보드) 월드 좌표 → 화면 좌표 */
  private project(x: number, y: number, z: number) {
    const cp = Math.cos(PITCH);
    const sp = Math.sin(PITCH);
    const yy = y - TARGET_Y;
    const y3 = yy * cp - z * sp;
    const z3 = yy * sp + z * cp;
    const depth = CAM_D - z3;
    return { x: this.cx + (x * this.f) / depth, y: this.cy - (y3 * this.f) / depth };
  }

  private drawFire(t: number, fireI: number, glows: { x: number; y: number; r: number; c: HTMLCanvasElement; a: number }[]) {
    const ctx = this.ctx;
    const fire = this.fire!;
    const { fw, fh, heat, mask, col0, row0 } = fire;
    const { cols, rows, cellW, cellH, offX, offY } = this;
    const fireGlow = this.glow(255, 110, 20);
    const hotGlow = this.glow(255, 200, 90);
    const frame = (t * 12) | 0;
    let drawn = 0;
    // 불꽃 전체를 감싸는 은은한 빛
    {
      const top = offY + row0 * cellH;
      const bottom = offY + (row0 + fh) * cellH;
      const midX = offX + (col0 + fw / 2) * cellW;
      const midY = top + (bottom - top) * 0.45;
      const rx = fw * cellW * 0.5;
      const ry = (bottom - top) * 0.55;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(midX, midY);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      const a = clamp(0.13 * fireI, 0, 0.22);
      g.addColorStop(0, `rgba(255,120,30,${a})`);
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    }
    for (let fy = 0; fy < fh; fy++) {
      const row = row0 + fy;
      if (row < 0 || row >= rows) continue;
      for (let fx = 0; fx < fw; fx++) {
        const i = fy * fw + fx;
        if (mask[i]) continue;
        const h = heat[i];
        if (h <= 0.16) continue;
        // 식어가는 불꽃 끝은 듬성듬성 (연기처럼 흩어짐)
        if (h < 0.32) {
          const hash = ((fx * 73856093) ^ (fy * 19349663) ^ (frame * 83492791)) >>> 0;
          if ((hash % 1000) / 1000 < (0.32 - h) * 4.2) continue;
        }
        const col = col0 + fx;
        if (col < 0 || col >= cols) continue;
        const hv = Math.min(1, h);
        const [r, g, b] = fireRGB(hv * 0.9);
        ctx.fillStyle = this.colorStr(r / 255, g / 255, b / 255);
        const ci = Math.min(FIRE_RAMP.length - 1, ((hv - 0.16) / 0.84) * FIRE_RAMP.length) | 0;
        const x = offX + col * cellW;
        const y = offY + row * cellH;
        ctx.fillText(FIRE_RAMP[ci], x, y);
        drawn++;
        if (h > 0.6 && (fx + fy * 2 + ((t * 20) | 0)) % 3 === 0) {
          glows.push({
            x: x + cellW / 2,
            y: y + cellH / 2,
            r: cellH * (1.6 + 1.2 * hv),
            c: hv > 0.85 ? hotGlow : fireGlow,
            a: (hv - 0.45) * 0.22 * Math.min(1.2, fireI),
          });
        }
      }
    }
    return drawn;
  }

  private updateEmbers(t: number, dt: number, fireI: number) {
    const fire = this.fire!;
    const r = this.rand;
    const { cellW, cellH, offX, offY } = this;
    const ctx = this.ctx;

    // 연료 셀 목록 (고양이 상단 위주)
    const spawn = (n: number, burst: boolean) => {
      for (let k = 0; k < n; k++) {
        let tries = 0;
        while (tries++ < 20) {
          const i = (r() * fire.mask.length) | 0;
          if (!fire.mask[i] || fire.relRow[i] < 0.25) continue;
          const fx = i % fire.fw;
          const fy = (i / fire.fw) | 0;
          const life = 0.9 + r() * 1.8;
          this.embers.push({
            x: fire.col0 + fx + r(),
            y: fire.row0 + fy,
            vx: (r() - 0.5) * (burst ? 26 : 5),
            vy: -(burst ? 14 + r() * 26 : 5 + r() * 9),
            life,
            max: life,
            ch: r() < 0.5 ? '.' : r() < 0.6 ? '*' : "'",
          });
          break;
        }
      }
    };

    if (!this.burstDone && t > FLASH_AT) {
      spawn(110, true);
      this.burstDone = true;
    }
    const rate = 26 * fireI;
    const expected = rate * dt;
    let n = Math.floor(expected);
    if (r() < expected - n) n++;
    spawn(n, false);

    const glowC = this.glow(255, 140, 40);
    const keep: Ember[] = [];
    for (const e of this.embers) {
      e.life -= dt;
      if (e.life <= 0) continue;
      e.vx += Math.sin(t * 3 + e.y * 0.3) * 6 * dt;
      e.vx *= 1 - 0.8 * dt;
      e.vy *= 1 - 0.25 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const k = e.life / e.max;
      const [cr, cg, cb] = fireRGB(0.35 + 0.6 * k);
      const px = offX + e.x * cellW;
      const py = offY + e.y * cellH;
      if (py < -20) continue;
      ctx.globalAlpha = clamp(k * 1.4, 0, 1);
      ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      ctx.fillText(e.ch, px, py);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 * k;
      const rr = cellH * 1.4;
      ctx.drawImage(glowC, px + cellW / 2 - rr, py + cellH / 2 - rr, rr * 2, rr * 2);
      ctx.globalCompositeOperation = 'source-over';
      keep.push(e);
    }
    ctx.globalAlpha = 1;
    this.embers = keep.length > 400 ? keep.slice(keep.length - 400) : keep;
  }

  private drawFlakes(dt: number, near: boolean) {
    const ctx = this.ctx;
    for (let i = 0; i < this.flakes.length; i++) {
      const fl = this.flakes[i];
      if (fl.near !== near) continue;
      fl.y += fl.vy * dt;
      fl.x += fl.vx * dt;
      if (fl.y > this.H + 10 || fl.x < -10 || fl.x > this.W + 10) {
        this.flakes[i] = this.newFlake(false);
        continue;
      }
      ctx.fillStyle = `rgba(225,235,255,${fl.a.toFixed(2)})`;
      ctx.fillText(fl.ch, fl.x, fl.y);
    }
  }
}

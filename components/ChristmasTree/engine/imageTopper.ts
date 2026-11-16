/**
 * 이미지 → 토퍼 포인트 변환.
 * - 투명 PNG: 알파값으로 실루엣 추출
 * - 불투명 이미지(JPG 등): 가장자리 배경색을 기준으로 플러드필해서 배경 제거
 * - 실루엣 바운딩박스로 크롭 → 정규화 좌표(u: -1..1, v: 위가 +)로 변환
 */
export interface TopperPixel {
  u: number;
  v: number;
  r: number;
  g: number;
  b: number;
  lum: number;
  edge: boolean;
}

export interface TopperImage {
  pixels: TopperPixel[];
  /** 높이 / 너비 */
  aspect: number;
}

const SAMPLE_MAX = 112; // 샘플링 해상도 (긴 변 기준 px)
const ALPHA_CUT = 110;
const BG_TOL = 46; // 배경색 허용 오차 (RGB 거리)

export async function loadTopperFromUrl(url: string): Promise<TopperImage | null> {
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return processImage(img);
  } catch (err) {
    console.warn('[topper] 이미지를 불러오지 못했습니다:', url, err);
    return null;
  }
}

export function processImage(img: HTMLImageElement): TopperImage | null {
  const nw = img.naturalWidth || 256;
  const nh = img.naturalHeight || 256;
  const s = SAMPLE_MAX / Math.max(nw, nh);
  const w = Math.max(8, Math.round(nw * s));
  const h = Math.max(8, Math.round(nh * s));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // 다른 도메인 이미지(CORS) 등
    console.warn('[topper] 픽셀을 읽을 수 없는 이미지입니다 (CORS).');
    return null;
  }

  const n = w * h;
  const mask = new Uint8Array(n);

  // 1) 투명도가 있는 이미지인지
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) transparent++;

  if (transparent > n * 0.02) {
    for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] > ALPHA_CUT ? 1 : 0;
  } else {
    // 2) 불투명: 테두리 픽셀 평균색을 배경으로 보고 가장자리에서 플러드필
    let br = 0;
    let bgc = 0;
    let bb = 0;
    let cnt = 0;
    const addBorder = (x: number, y: number) => {
      const p = (y * w + x) * 4;
      br += data[p];
      bgc += data[p + 1];
      bb += data[p + 2];
      cnt++;
    };
    for (let x = 0; x < w; x++) {
      addBorder(x, 0);
      addBorder(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      addBorder(0, y);
      addBorder(w - 1, y);
    }
    br /= cnt;
    bgc /= cnt;
    bb /= cnt;
    const isBg = (i: number) => {
      const p = i * 4;
      const dr = data[p] - br;
      const dg = data[p + 1] - bgc;
      const db = data[p + 2] - bb;
      return dr * dr + dg * dg + db * db < BG_TOL * BG_TOL;
    };
    const bg = new Uint8Array(n);
    const stack: number[] = [];
    const push = (i: number) => {
      if (!bg[i] && isBg(i)) {
        bg[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    for (let i = 0; i < n; i++) mask[i] = bg[i] ? 0 : 1;
  }

  // 3) 바운딩박스
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (count < 24) return null;

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const half = bw / 2;
  const cx = x0 + bw / 2;
  const cy = y0 + bh / 2;
  const pixels: TopperPixel[] = [];
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!at(x, y)) continue;
      const p = (y * w + x) * 4;
      const r = data[p] / 255;
      const g = data[p + 1] / 255;
      const b = data[p + 2] / 255;
      // 윤곽선: 2px 안에 바깥이 있으면
      let edge = false;
      for (let dy = -2; dy <= 2 && !edge; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          if (!at(x + dx, y + dy)) {
            edge = true;
            break;
          }
        }
      }
      pixels.push({
        u: (x + 0.5 - cx) / half,
        v: -(y + 0.5 - cy) / half,
        r,
        g,
        b,
        lum: 0.2126 * r + 0.7152 * g + 0.0722 * b,
        edge,
      });
    }
  }
  return { pixels, aspect: bh / bw };
}

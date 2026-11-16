import type { PhaseId } from './engine/timeline';

/** 하단 에디터에 타이핑되는 코드 — 각 블록은 해당 단계 동안 입력된다 */
export const CODE_BLOCKS: { phase: PhaseId; lines: string[] }[] = [
  {
    phase: 'BOOT',
    lines: [
      "import { mulberry32, gaussian } from './rng';",
      'const TAU = Math.PI * 2;',
      'const rng = mulberry32(1225);',
      'const q = new PointCloud();',
    ],
  },
  {
    phase: 'GROUND',
    lines: [
      '// --- GROUND',
      'for (let i = 0; i < 4200; i++) {',
      '  const r = 0.86 * Math.sqrt(rng()), a = TAU * rng();',
      '  q.add(GROUND, [r * cos(a), 0, r * sin(a)], UP, snow(r));',
      '}',
    ],
  },
  {
    phase: 'TRUNK',
    lines: [
      '// --- TRUNK',
      'for (let i = 0; i < 900; i++) {',
      '  const a = TAU * rng(), y = 0.26 * rng();',
      '  q.add(TRUNK, [0.052 * cos(a), y, 0.052 * sin(a)], radial(a), BARK);',
      '}',
    ],
  },
  {
    phase: 'NEEDLE',
    lines: [
      '// --- NEEDLE',
      'for (let i = 0; i < 30; i++) {',
      '  const h = i / 29, y = Y0 + h * (Y1 - Y0), R = radius(y);',
      '  const nb = Math.max(3, round(5 + 16 * R / BASE_R));',
      '  for (let b = 0; b < nb; b++) {',
      '    const a = TAU * b / nb + i * 0.618 * TAU + gaussian(rng, 0, 0.12);',
      '    const L = R * uniform(0.82, 1.06);',
      '    for (let k = 0; k < 10 + 66 * L / BASE_R; k++) {',
      '      const s = rng() ** 0.65, sl = s * L;',
      '      const spread = (0.02 + 0.1 * s) * gaussian(rng);',
      '      const yy = y + 0.06 * sl - 0.24 * sl ** 2;',
      '      q.add(NEEDLE, dir(a, sl).add(side(a, spread)), nrm, green * ao(s));',
      '    }',
      '    tips.push(dir(a, L * 0.93).up(y));',
      '  }',
      '}',
    ],
  },
  {
    phase: 'SNOWCAP',
    lines: [
      '// --- SNOWCAP',
      'const snow = (s > 0.45) && rng() < 0.075 * s;',
      'q.add(SNOW, p[snow], UP, [0.9, 0.94, 1.0]);',
    ],
  },
  {
    phase: 'GARLAND',
    lines: [
      '// --- GARLAND',
      'for (const off of [0, Math.PI]) for (let u = 0; u <= 1; u += 1 / 1100) {',
      '  const ang = u * 3.6 * TAU + off, y = 0.22 + 0.68 * u;',
      '  const sag = 0.022 * Math.sin(ang * 3.5) ** 2;',
      '  q.add(GARLAND, helix(ang, radius(y) * 1.03, y - sag), out(ang), GOLD);',
      '}',
    ],
  },
  {
    phase: 'BALL',
    lines: [
      '// --- BALL',
      'for (const c of pick(tips, 44, { minDist: 0.11 })) {',
      '  const rad = uniform(0.026, 0.036), col = choice([RED, RED, GOLD, SILVER]);',
      '  for (const d of fibonacciSphere(110)) q.add(BALL, c.add(d.mul(rad)), d, col);',
      '}',
    ],
  },
  {
    phase: 'LIGHT',
    lines: [
      '// --- LIGHT',
      'for (const t of tips.slice(60, 230)) {',
      '  q.add(LIGHT, t.mul(1.03), t, choice([WARM, AMBER, WHITE]));',
      '}',
      'twinkle = (t, s) => 0.55 + 0.45 * sin(t * (1.4 + 3 * s) + 40 * s);',
    ],
  },
  {
    phase: 'GIFT',
    lines: [
      '// --- GIFT',
      'for (const g of GIFTS) {',
      '  const box = new Box(g.w, g.h, g.d).yaw(rng() * TAU).at(polar(g.r, g.a));',
      '  for (const [p, n] of box.surface(0.0105)) q.add(GIFT, p, n, g.color);',
      '}',
    ],
  },
  {
    phase: 'RIBBON',
    lines: [
      '// --- RIBBON',
      'const rib = (p) => abs(p.x) < w * 0.11 || abs(p.z) < w * 0.11;',
      'q.add(RIBBON, box.surface().filter(rib), n, g.ribbon);',
      'q.add(RIBBON, bowLoops(g.h + 0.012), n, g.ribbon);',
    ],
  },
  {
    phase: 'KITTY',
    lines: [
      '// --- KITTY TOPPER',
      'const head = ellipse(0, -0.12, 1.0, 0.74);',
      'const ears = [tri(-0.98, 0.12, -0.16, 0.56, -0.84, 1.06), mirror];',
      'const eyes = almond(±0.4, -0.02, 0.21, 0.14), nose = tri(0, -0.26);',
      'for (const s of sample(head ∪ ears, 0.028)) {',
      '  q.add(KITTY, at(0, 1.165).add(s.mul(0.175)), dome(s), paint(s));',
      '  swirlIn(s, { from: orbit(0.35, 0.8), duration: 1.0 });',
      '}',
    ],
  },
  {
    phase: 'IGNITE',
    lines: [
      '// --- IGNITE',
      'const fire = new FireField(kitty.cells, { flameRows: 1.9 * kitty.rows });',
      'fire.fuel = kitty.mask;  // 고양이 실루엣이 곧 연료',
      'heat[y][x] = mix(heat[y+1][x±1], heat[y+2][x]) - cool(x, y + scroll) - edge(x);',
      'kitty.ignite({ from: "chin", spread: 1.6 });',
    ],
  },
  {
    phase: 'BURNING',
    lines: [
      'embers.emit(26 * fire.intensity);',
      'while (true) render(tree, fire);  // burn forever',
    ],
  },
];

/** 이미지 토퍼일 때 KITTY 블록 대신 타이핑되는 코드 */
const IMAGE_TOPPER_LINES = [
  '// --- TOPPER (image)',
  "const img = await loadImage('/topper.png');",
  'const mask = img.hasAlpha ? img.alpha > 110 : floodFill(img, img.borderColor, 46);',
  'const box = bbox(mask), h = Math.min(0.27, 0.27 / box.aspect);',
  'for (const px of mask.pixels(box)) {',
  '  q.add(TOPPER, at(0, 1.015 + box.aspect * h).add(px.uv.mul(h)), dome(px), px.rgb);',
  '  swirlIn(px, { from: orbit(0.35, 0.8), duration: 1.0 });',
  '}',
];

export type TopperMode = 'kitty' | 'image';

export function codeBlocksFor(mode: TopperMode) {
  if (mode === 'kitty') return CODE_BLOCKS;
  return CODE_BLOCKS.map((b) => {
    if (b.phase === 'KITTY') return { ...b, lines: IMAGE_TOPPER_LINES };
    if (b.phase === 'IGNITE' || b.phase === 'BURNING')
      return { ...b, lines: b.lines.map((l) => l.replace(/kitty\./g, 'topper.').replace('고양이 실루엣이', '이미지 실루엣이')) };
    return b;
  });
}

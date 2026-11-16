# kitty_tree.ts — ASCII 크리스마스 트리 + 불타는 고양이 토퍼

Next.js(App Router) + styled-components로 만든 ‘코딩 크리스마스 트리’.
3D 포인트 클라우드를 문자(ASCII) 격자에 래스터화해서 회전시키고, 바닥 → 기둥 → 잎 → 눈 → 가랜드 → 오너먼트 → 전구 → 선물 → 고양이 토퍼 순으로 완성된 뒤 고양이가 점화되어 계속 불타오릅니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
# 또는
npm run build && npm start
```

요구 사항: Node.js 20.9 이상 (Next.js 16)

## 이미지 토퍼 (고양이 대신 원하는 이미지)

트리 꼭대기 토퍼를 원하는 이미지로 바꿀 수 있습니다. 이미지는 문자(ASCII)로 변환되어 조립되고, 완성되면 그 실루엣 그대로 불타오릅니다.

1. **파일로 고정:** `public/topper.png` 를 넣으면 기본 토퍼가 됩니다 (`.webp / .gif / .svg / .jpg` 도 가능).
   - `npm run dev`: 파일을 넣고 새로고침하면 바로 반영
   - `npm run build && npm start`: 파일을 넣은 뒤 다시 빌드해야 반영
2. **실행 중 바로 교체:** 우상단 `⬆ IMAGE` 버튼으로 파일을 고르거나, 화면에 이미지를 드래그해서 놓으면 토퍼 조립 장면부터 다시 재생됩니다. `CAT` 버튼으로 기본 고양이로 돌아갑니다.
3. **URL로 지정:** `/?topper=/my-image.png` (public 폴더 기준 경로)

이미지 팁
- 배경이 투명한 PNG가 가장 깔끔합니다.
- 불투명 이미지는 테두리 색(흰색 등 단색 배경)을 기준으로 배경을 자동으로 지웁니다.
- 밝은 부분은 촘촘한 문자로, 어두운 선은 옅은 회색 점으로 표현되고, 불이 붙으면 밝기에 따라 노랑 → 주황 → 검붉은 색으로 탑니다.
- 사용할 권한이 있는 이미지를 넣어 주세요.

## 조작 / URL 옵션

| 기능 | 방법 |
| --- | --- |
| 처음부터 다시 | 우상단 `↻ REPLAY` 버튼 또는 `R` 키 |
| 토퍼 이미지 교체 | `⬆ IMAGE` 버튼 또는 드래그앤드롭 |
| 기본 고양이로 | `CAT` 버튼 (이미지 토퍼 사용 중일 때) |
| 특정 시점부터 보기 | `/?t=18` (초 단위, 예: 토퍼 조립 직전) |
| 재생 속도 | `/?speed=2` (0.1 ~ 8) |
| 토퍼 이미지 경로 | `/?topper=/my-image.png` |

## 타임라인 (초)

| 단계 | 구간 |
| --- | --- |
| GROUND / TRUNK | 0.4 – 2.5 |
| NEEDLE / SNOWCAP | 2.5 – 9.4 |
| GARLAND / BALL / LIGHT | 9.4 – 14.0 |
| GIFT / RIBBON | 14.0 – 16.3 |
| KITTY (토퍼 조립) | 16.5 – 19.0 |
| IGNITE (점화 · 플래시) | 19.4 – 21.0 |
| BURNING (계속 불탐) | 21.0 – ∞ |

`components/ChristmasTree/engine/timeline.ts` 에서 수정할 수 있습니다.

## 구조

```
app/
  layout.tsx            # StyledComponentsRegistry + GlobalStyle
  page.tsx              # public/topper.* 존재 여부 확인 → 토퍼 경로 전달
public/
  TOPPER_README.txt     # 여기에 topper.png 를 넣으면 됨
lib/registry.tsx        # styled-components SSR 레지스트리 (useServerInsertedHTML)
styles/GlobalStyle.ts
components/ChristmasTree/
  index.tsx             # 캔버스 + rAF 루프 + HUD + 리플레이
  CodePanel.tsx         # 하단 에디터 (타이핑 · 하이라이트 · 단계 표시)
  codeLines.ts          # 에디터에 타이핑되는 코드
  styles.ts             # styled-components
  engine/
    scene.ts            # 포인트 클라우드 생성 (트리, 장식, 선물, 고양이)
    kitty.ts            # 고양이 얼굴 형상 (머리·귀·눈·코·입)
    imageTopper.ts      # 이미지 → 실루엣 추출(알파/배경 플러드필) → 토퍼 포인트
    renderer.ts         # 셀 단위 z-buffer ASCII 렌더러, 조명, 글로우, 점화 연출
    fire.ts             # ASCII 화염 시뮬레이션 (고양이 실루엣 = 연료)
    timeline.ts         # 단계별 시간표
    rng.ts              # 시드 고정 난수, value noise
```

## 커스터마이즈 포인트

- 고양이 크기/위치: `scene.ts` → `KITTY` (`cy`, `scale`)
- 이미지 토퍼 크기: `scene.ts` → 이미지 토퍼 블록의 `halfW` (최대 폭/높이)
- 배경 제거 민감도: `imageTopper.ts` → `BG_TOL`, `ALPHA_CUT`
- 고양이 색: `kitty.ts` → `KITTY_COLORS`
- 불꽃 높이: `renderer.ts` → `buildFire()` 의 `flameRows`
- 불꽃 세기/펄스 주기: `renderer.ts` → `fireState()`
- 트리 회전 속도: `renderer.ts` → `ROT_SPEED`
- 문자 크기(해상도): `renderer.ts` → `resize()` 의 `cellH`

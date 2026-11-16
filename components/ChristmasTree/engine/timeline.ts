/**
 * 빌드 타임라인 (초 단위).
 * 레퍼런스 영상처럼 바닥 → 기둥 → 잎 → 눈 → 가랜드 → 오너먼트 → 전구 → 선물 → 토퍼 순으로 완성되고,
 * 토퍼(고양이)가 완성되면 점화되어 계속 불타오른다.
 */
export type PhaseId =
  | 'BOOT'
  | 'GROUND'
  | 'TRUNK'
  | 'NEEDLE'
  | 'SNOWCAP'
  | 'GARLAND'
  | 'BALL'
  | 'LIGHT'
  | 'GIFT'
  | 'RIBBON'
  | 'KITTY'
  | 'IGNITE'
  | 'BURNING';

export interface Phase {
  id: PhaseId;
  start: number;
  end: number;
}

export const PHASES: Phase[] = [
  { id: 'BOOT', start: 0, end: 0.4 },
  { id: 'GROUND', start: 0.4, end: 1.5 },
  { id: 'TRUNK', start: 1.5, end: 2.5 },
  { id: 'NEEDLE', start: 2.5, end: 8.6 },
  { id: 'SNOWCAP', start: 8.6, end: 9.4 },
  { id: 'GARLAND', start: 9.4, end: 11.0 },
  { id: 'BALL', start: 11.0, end: 12.4 },
  { id: 'LIGHT', start: 12.4, end: 14.0 },
  { id: 'GIFT', start: 14.0, end: 15.5 },
  { id: 'RIBBON', start: 15.5, end: 16.3 },
  { id: 'KITTY', start: 16.5, end: 19.0 },
  { id: 'IGNITE', start: 19.4, end: 21.0 },
  { id: 'BURNING', start: 21.0, end: Infinity },
];

export const T = Object.fromEntries(PHASES.map((p) => [p.id, p])) as Record<PhaseId, Phase>;

/** 점화 시점 / 점화가 퍼지는 시간 */
export const IGNITE_AT = T.IGNITE.start;
export const IGNITE_SPREAD = 1.6;
/** 점화 중 ‘펑’ 하고 터지는 순간 (플래시/흔들림/불씨 폭발) */
export const FLASH_AT = IGNITE_AT + 0.95;

export function phaseAt(t: number): Phase {
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (t >= PHASES[i].start) return PHASES[i];
  }
  return PHASES[0];
}

export function phaseProgress(p: Phase, t: number) {
  if (!isFinite(p.end)) return 1;
  return Math.min(1, Math.max(0, (t - p.start) / (p.end - p.start)));
}

'use client';

import React, { forwardRef, memo, useMemo } from 'react';
import { codeBlocksFor, type TopperMode } from './codeLines';
import { T, type PhaseId } from './engine/timeline';
import * as S from './styles';

const LEGEND: PhaseId[] = ['GROUND', 'TRUNK', 'NEEDLE', 'SNOWCAP', 'GARLAND', 'BALL', 'LIGHT', 'GIFT', 'RIBBON', 'KITTY', 'IGNITE'];
const ORDER: PhaseId[] = [
  'BOOT',
  'GROUND',
  'TRUNK',
  'NEEDLE',
  'SNOWCAP',
  'GARLAND',
  'BALL',
  'LIGHT',
  'GIFT',
  'RIBBON',
  'KITTY',
  'IGNITE',
  'BURNING',
];

/** 코드 블록별 타이핑 구간 */
function buildSchedule(mode: TopperMode) {
  let lineNo = 1;
  return codeBlocksFor(mode).map((blk) => {
    const ph = T[blk.phase];
    const start = ph.start;
    const end = isFinite(ph.end) ? ph.start + (ph.end - ph.start) * 0.92 : ph.start + 1.4;
    const total = blk.lines.reduce((a, l) => a + l.length, 0);
    const first = lineNo;
    lineNo += blk.lines.length;
    return { ...blk, start, end, total, first };
  });
}
const SCHEDULES: Record<TopperMode, ReturnType<typeof buildSchedule>> = {
  kitty: buildSchedule('kitty'),
  image: buildSchedule('image'),
};

export interface TypedLine {
  no: number;
  text: string;
  current: boolean;
}

/** 시간 t 에 화면에 보이는 (타이핑된) 코드 줄들 */
export function typedLinesAt(t: number, maxLines: number, mode: TopperMode = 'kitty'): TypedLine[] {
  const out: TypedLine[] = [];
  for (const blk of SCHEDULES[mode]) {
    if (t < blk.start) break;
    const p = Math.min(1, (t - blk.start) / (blk.end - blk.start));
    let budget = Math.floor(p * blk.total);
    for (let i = 0; i < blk.lines.length; i++) {
      const line = blk.lines[i];
      if (budget <= 0 && i > 0) break;
      const take = Math.min(line.length, budget);
      out.push({ no: blk.first + i, text: line.slice(0, take), current: false });
      budget -= take;
      if (take < line.length) break;
    }
  }
  if (out.length) out[out.length - 1].current = true;
  return out.slice(-maxLines);
}

const KW = new Set([
  'const',
  'let',
  'for',
  'of',
  'if',
  'while',
  'new',
  'return',
  'import',
  'from',
  'true',
  'false',
  'Math',
]);

/** 아주 가벼운 하이라이터 */
function highlight(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const ci = text.indexOf('//');
  const code = ci >= 0 ? text.slice(0, ci) : text;
  const comment = ci >= 0 ? text.slice(ci) : '';
  const re = /('[^']*'?|"[^"]*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|([^'"\w$]+)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(code))) {
    if (m[1]) nodes.push(<S.Tok key={k++} $t="str">{m[1]}</S.Tok>);
    else if (m[2]) nodes.push(<S.Tok key={k++} $t="num">{m[2]}</S.Tok>);
    else if (m[3]) nodes.push(<S.Tok key={k++} $t={KW.has(m[3]) ? 'kw' : 'fn'}>{m[3]}</S.Tok>);
    else if (m[4]) nodes.push(<S.Tok key={k++} $t={KW.has(m[4]) ? 'kw' : 'txt'}>{m[4]}</S.Tok>);
    else if (m[5]) nodes.push(<S.Tok key={k++} $t="txt">{m[5]}</S.Tok>);
  }
  if (comment) nodes.push(<S.Tok key={k++} $t="com">{comment}</S.Tok>);
  return nodes;
}

interface Props {
  t: number;
  phase: PhaseId;
  fps: number;
  burning: boolean;
  maxLines: number;
  mode: TopperMode;
}

const CodePanel = forwardRef<HTMLElement, Props>(function CodePanel({ t, phase, fps, burning, maxLines, mode }, ref) {
  const lines = useMemo(() => typedLinesAt(t, maxLines, mode), [t, maxLines, mode]);
  const phaseIdx = ORDER.indexOf(phase);

  return (
    <S.Panel ref={ref}>
      <S.PanelHeader>
        <S.FileName>{mode === 'image' ? 'topper_tree.ts' : 'kitty_tree.ts'}</S.FileName>
        <S.Legend>
          {LEGEND.map((id) => {
            const idx = ORDER.indexOf(id);
            const state = idx < phaseIdx ? 'done' : idx === phaseIdx || (id === 'IGNITE' && phase === 'BURNING') ? 'active' : 'todo';
            return (
              <S.LegendItem key={id} $state={state}>
                {id === 'KITTY' && mode === 'image' ? 'TOPPER' : id}
              </S.LegendItem>
            );
          })}
        </S.Legend>
        <S.Status $burning={burning}>
          {burning ? 'burning' : phase === 'KITTY' ? 'assembling' : 'running'} · {fps} fps
        </S.Status>
      </S.PanelHeader>
      <S.CodeBody>
        {lines.map((l) => (
          <S.CodeLine key={l.no} $current={l.current}>
            <S.LineNo>{l.no}</S.LineNo>
            <span>
              {highlight(l.text)}
              {l.current && <S.Cursor />}
            </span>
          </S.CodeLine>
        ))}
      </S.CodeBody>
    </S.Panel>
  );
});

export default memo(CodePanel);

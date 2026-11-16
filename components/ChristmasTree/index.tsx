'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import CodePanel from './CodePanel';
import { AsciiTreeRenderer, type FrameStats } from './engine/renderer';
import { loadTopperFromUrl, type TopperImage } from './engine/imageTopper';
import { T } from './engine/timeline';
import * as S from './styles';

interface HudState extends FrameStats {
  t: number;
  fps: number;
}

const INITIAL: HudState = {
  t: 0,
  fps: 60,
  phase: 'BOOT',
  rotationDeg: 0,
  lights: 0,
  letters: 0,
  burning: false,
  temperature: 0,
};

/** 이미지를 바꿨을 때 바로 토퍼 조립 장면부터 보이도록 */
const JUMP_TO_TOPPER = T.KITTY.start - 0.8;

/**
 * URL 파라미터
 *  ?t=18          해당 시점부터 시작
 *  ?speed=2       재생 속도
 *  ?topper=/a.png 토퍼 이미지 경로 (public 기준)
 */
function readParams() {
  if (typeof window === 'undefined') return { startAt: 0, speed: 1, topper: null as string | null };
  const sp = new URLSearchParams(window.location.search);
  const startAt = Math.max(0, parseFloat(sp.get('t') ?? '0') || 0);
  const speed = Math.min(8, Math.max(0.1, parseFloat(sp.get('speed') ?? '1') || 1));
  return { startAt, speed, topper: sp.get('topper') };
}

interface Props {
  /** public/topper.* 가 있으면 서버에서 경로를 넘겨줌 */
  defaultTopper?: string | null;
}

interface TopperState {
  img: TopperImage | null;
  name: string | null;
}

export default function ChristmasTree({ defaultTopper = null }: Props) {
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [hud, setHud] = useState<HudState>(INITIAL);
  const [maxLines, setMaxLines] = useState(7);
  const [runId, setRunId] = useState(0);
  /** null = 아직 토퍼 로딩 중 */
  const [topper, setTopper] = useState<TopperState | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const firstRun = useRef(true);
  const dragDepth = useRef(0);
  const startOverride = useRef<number | null>(null);

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const replay = useCallback(() => {
    startOverride.current = 0;
    setRunId((n) => n + 1);
  }, []);

  // ---------------------------------------------------- 시작 시 토퍼 이미지 로드
  useEffect(() => {
    const src = readParams().topper ?? defaultTopper;
    if (!src) {
      setTopper({ img: null, name: null });
      return;
    }
    let alive = true;
    loadTopperFromUrl(src).then((img) => {
      if (!alive) return;
      setTopper({ img, name: img ? src.split('/').pop()!.split('?')[0] : null });
      if (!img) showToast('토퍼 이미지에서 모양을 찾지 못해 기본 고양이로 표시해요', true);
    });
    return () => {
      alive = false;
    };
  }, [defaultTopper, showToast]);

  // ---------------------------------------------------- 업로드 / 드래그앤드롭
  const applyFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 사용할 수 있어요', true);
        return;
      }
      const url = URL.createObjectURL(file);
      const img = await loadTopperFromUrl(url);
      URL.revokeObjectURL(url);
      if (!img) {
        showToast('이미지에서 모양을 찾지 못했어요. 배경이 투명하거나 단색인 이미지를 써 주세요', true);
        return;
      }
      startOverride.current = JUMP_TO_TOPPER;
      setTopper({ img, name: file.name });
      showToast(`토퍼 적용: ${file.name}`);
    },
    [showToast],
  );

  const resetToCat = useCallback(() => {
    startOverride.current = JUMP_TO_TOPPER;
    setTopper({ img: null, name: null });
    showToast('기본 고양이 토퍼로 돌아왔어요');
  }, [showToast]);

  // ---------------------------------------------------- 렌더 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !topper) return;

    const params = readParams();
    let startAt = 0;
    if (startOverride.current !== null) startAt = startOverride.current;
    else if (firstRun.current) startAt = params.startAt;
    startOverride.current = null;
    firstRun.current = false;

    const renderer = new AsciiTreeRenderer(canvas, topper.img);

    const layout = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const panelH = panelRef.current?.offsetHeight ?? Math.round(h * S.PANEL_RATIO);
      renderer.resize(w, h, panelH, Math.min(2, window.devicePixelRatio || 1));
      const lineH = Math.min(13, Math.max(11, h * 0.0145)) * 1.6;
      setMaxLines(Math.max(3, Math.floor((panelH - 44) / lineH)));
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(stage);

    let raf = 0;
    const t0 = performance.now();
    let lastHud = 0;
    let frames = 0;
    let fpsT = t0;
    let fps = 60;

    const loop = (now: number) => {
      const t = startAt + ((now - t0) / 1000) * params.speed;
      const stats = renderer.render(t);

      frames++;
      if (now - fpsT >= 500) {
        fps = Math.round((frames * 1000) / (now - fpsT));
        frames = 0;
        fpsT = now;
      }
      // HUD/코드 패널은 ~15Hz 로만 갱신 (React 렌더 부담 최소화)
      if (now - lastHud > 66) {
        lastHud = now;
        setHud({ ...stats, t, fps });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [runId, topper]);

  // 키보드: R = 다시 재생
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') replay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replay]);

  const mode = topper?.img ? 'image' : 'kitty';

  return (
    <S.Stage
      ref={stageRef}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        applyFile(e.dataTransfer.files?.[0]);
      }}
    >
      <S.Canvas ref={canvasRef} aria-label="ASCII 크리스마스 트리 애니메이션" />

      <S.Hud>
        {'@kitty_tree · 2026\n'}
        {'rotation '}
        <b>{hud.rotationDeg.toFixed(2).padStart(7, ' ')}°</b>
        {'   lights '}
        <b>{String(hud.lights).padStart(3, ' ')}</b>
        {'\nletters  '}
        <b>{hud.letters.toLocaleString('en-US')}</b>
        {hud.burning && (
          <>
            {mode === 'image' ? '\ntopper   ' : '\nkitty    '}
            <S.BurnTag>BURNING {hud.temperature.toLocaleString('en-US')}°C</S.BurnTag>
          </>
        )}
      </S.Hud>

      <S.TopBar>
        {topper?.img && (
          <S.ToolButton type="button" onClick={resetToCat} title="기본 고양이 토퍼로 되돌리기">
            CAT
          </S.ToolButton>
        )}
        <S.ToolButton
          type="button"
          $accent
          onClick={() => fileRef.current?.click()}
          title="토퍼 이미지 선택 (화면에 드래그해서 놓아도 돼요)"
        >
          ⬆ IMAGE
        </S.ToolButton>
        <S.ToolButton type="button" onClick={replay} title="처음부터 다시 (R)">
          ↻ REPLAY
        </S.ToolButton>
      </S.TopBar>
      <S.HiddenInput
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          applyFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {toast && (
        <S.Toast key={toast.id} $error={toast.error}>
          {toast.msg}
        </S.Toast>
      )}
      {dragging && <S.DropOverlay>이미지를 놓으면 트리 꼭대기 토퍼로 적용돼요</S.DropOverlay>}

      <CodePanel
        ref={panelRef}
        t={hud.t}
        phase={hud.phase}
        fps={hud.fps}
        burning={hud.burning}
        maxLines={maxLines}
        mode={mode}
      />
    </S.Stage>
  );
}

'use client';

import styled, { css, keyframes } from 'styled-components';

export const PANEL_RATIO = 0.24;

const blink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
`;

const flicker = keyframes`
  0%, 100% { text-shadow: 0 0 6px rgba(255, 120, 30, 0.9), 0 0 14px rgba(255, 60, 0, 0.6); }
  33% { text-shadow: 0 0 9px rgba(255, 170, 60, 1), 0 0 20px rgba(255, 80, 0, 0.7); }
  66% { text-shadow: 0 0 4px rgba(255, 100, 20, 0.8), 0 0 10px rgba(255, 50, 0, 0.5); }
`;

export const Stage = styled.main`
  position: relative;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: #04060c;
`;

export const Canvas = styled.canvas`
  position: absolute;
  inset: 0;
  display: block;
`;

export const Hud = styled.div`
  position: absolute;
  left: 14px;
  bottom: calc(${PANEL_RATIO * 100}dvh + 10px);
  font-size: 11px;
  line-height: 1.55;
  color: rgba(200, 212, 235, 0.78);
  letter-spacing: 0.02em;
  pointer-events: none;
  user-select: none;
  white-space: pre;

  b {
    color: #e9eefb;
    font-weight: 600;
  }
`;

export const BurnTag = styled.span`
  color: #ffb057;
  font-weight: 700;
  animation: ${flicker} 0.35s infinite;
`;

export const TopBar = styled.div`
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  gap: 8px;
  z-index: 5;
`;

export const ToolButton = styled.button<{ $accent?: boolean }>`
  padding: 6px 12px;
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: ${({ $accent }) => ($accent ? '#ffd27a' : '#c9d1e0')};
  background: rgba(14, 20, 36, 0.6);
  border: 1px solid ${({ $accent }) => ($accent ? 'rgba(255, 196, 100, 0.45)' : 'rgba(140, 160, 200, 0.25)')};
  border-radius: 6px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: border-color 0.2s, color 0.2s, background 0.2s;

  &:hover {
    color: #fff;
    border-color: rgba(255, 176, 87, 0.7);
    background: rgba(40, 22, 10, 0.6);
  }
`;

export const HiddenInput = styled.input`
  display: none;
`;

const toastIn = keyframes`
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
`;

export const Toast = styled.div<{ $error?: boolean }>`
  position: absolute;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  padding: 8px 14px;
  font-size: 12px;
  color: ${({ $error }) => ($error ? '#ffb4a8' : '#e8edf8')};
  background: rgba(10, 14, 26, 0.85);
  border: 1px solid ${({ $error }) => ($error ? 'rgba(255, 120, 100, 0.45)' : 'rgba(255, 196, 100, 0.35)')};
  border-radius: 8px;
  backdrop-filter: blur(6px);
  animation: ${toastIn} 0.2s ease-out;
  pointer-events: none;
  z-index: 6;
  white-space: nowrap;
`;

export const DropOverlay = styled.div`
  position: absolute;
  inset: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed rgba(255, 196, 100, 0.6);
  border-radius: 14px;
  background: rgba(20, 12, 4, 0.45);
  color: #ffd27a;
  font-size: 14px;
  letter-spacing: 0.04em;
  pointer-events: none;
  z-index: 7;
`;

export const Panel = styled.section`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${PANEL_RATIO * 100}dvh;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(9, 12, 22, 0.92), rgba(6, 8, 15, 0.98));
  border-top: 1px solid rgba(120, 140, 190, 0.18);
  backdrop-filter: blur(4px);
`;

export const PanelHeader = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 7px 14px;
  font-size: 11px;
  color: rgba(200, 212, 235, 0.85);
  border-bottom: 1px solid rgba(120, 140, 190, 0.12);
`;

export const FileName = styled.span`
  font-weight: 600;
  color: #e8edf8;
`;

export const Legend = styled.div`
  display: flex;
  gap: 10px;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  font-size: 10px;
  letter-spacing: 0.06em;

  @media (max-width: 720px) {
    display: none;
  }
`;

export const LegendItem = styled.span<{ $state: 'done' | 'active' | 'todo' }>`
  transition: color 0.25s;
  color: ${({ $state }) =>
    $state === 'active' ? '#ffd27a' : $state === 'done' ? 'rgba(160, 220, 170, 0.75)' : 'rgba(150, 160, 185, 0.35)'};
  ${({ $state }) =>
    $state === 'active' &&
    css`
      text-shadow: 0 0 8px rgba(255, 200, 100, 0.6);
    `}
`;

export const Status = styled.span<{ $burning: boolean }>`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: ${({ $burning }) => ($burning ? '#ffb057' : 'rgba(200, 212, 235, 0.85)')};

  &::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ $burning }) => ($burning ? '#ff7a1a' : '#e3a33b')};
    box-shadow: 0 0 8px ${({ $burning }) => ($burning ? '#ff5a00' : '#e3a33b')};
    animation: ${pulse} 1.2s ease-in-out infinite;
  }
`;

export const CodeBody = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 6px 0 10px;
  font-size: clamp(11px, 1.45vh, 13px);
  line-height: 1.6;
`;

export const CodeLine = styled.div<{ $current: boolean }>`
  display: flex;
  white-space: pre;
  padding: 0 14px;
  background: ${({ $current }) => ($current ? 'rgba(120, 150, 220, 0.08)' : 'transparent')};
`;

export const LineNo = styled.span`
  width: 3.4em;
  flex-shrink: 0;
  text-align: right;
  padding-right: 1.4em;
  color: rgba(130, 145, 175, 0.45);
  user-select: none;
`;

export const Cursor = styled.span`
  display: inline-block;
  width: 0.6em;
  height: 1.15em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: #e8edf8;
  animation: ${blink} 1s steps(1) infinite;
`;

export const Tok = styled.span<{ $t: 'kw' | 'num' | 'str' | 'com' | 'fn' | 'txt' }>`
  color: ${({ $t }) =>
    ({
      kw: '#c792ea',
      num: '#f78c6c',
      str: '#c3e88d',
      com: '#6b7a99',
      fn: '#82aaff',
      txt: '#d6deeb',
    })[$t]};
  ${({ $t }) =>
    $t === 'com' &&
    css`
      font-style: italic;
    `}
`;

'use client';

import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #04060c;
    color: #c9d1e0;
    font-family: 'JetBrains Mono', 'D2Coding', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace;
    -webkit-font-smoothing: antialiased;
  }
`;

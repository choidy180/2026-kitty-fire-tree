import type { Metadata, Viewport } from 'next';
import StyledComponentsRegistry from '@/lib/registry';
import { GlobalStyle } from '@/styles/GlobalStyle';

export const metadata: Metadata = {
  title: 'kitty_tree.ts — ASCII Christmas Tree',
  description: '코드로 그리는 ASCII 크리스마스 트리 + 불타는 고양이 토퍼',
};

export const viewport: Viewport = {
  themeColor: '#04060c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      {/* 브라우저 확장(ColorZilla 등)이 body에 속성을 주입해 생기는 hydration 경고 억제 */}
      <body suppressHydrationWarning>
        <StyledComponentsRegistry>
          <GlobalStyle />
          {children}
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}

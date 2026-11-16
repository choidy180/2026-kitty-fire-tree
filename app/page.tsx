import fs from 'node:fs';
import path from 'node:path';
import ChristmasTree from '@/components/ChristmasTree';

const CANDIDATES = ['topper.png', 'topper.webp', 'topper.gif', 'topper.svg', 'topper.jpg', 'topper.jpeg'];

/** public/topper.* 가 있으면 그 이미지를 트리 꼭대기 토퍼로 사용 (없으면 기본 고양이) */
function findTopper(): string | null {
  const dir = path.join(process.cwd(), 'public');
  for (const name of CANDIDATES) {
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      if (st.isFile()) return `/${name}?v=${Math.round(st.mtimeMs)}`;
    } catch {
      // 없음
    }
  }
  return null;
}

export default function Page() {
  return <ChristmasTree defaultTopper={findTopper()} />;
}

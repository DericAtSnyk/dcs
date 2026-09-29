import type { Bit } from '@dcs/shared';
import { bitColor } from './bitColor.js';

interface SevenSegmentGlyphProps {
  /** [a, b, c, d, e, f, g], active-high — see BCD_DECODER's segment table. */
  bits: Bit[] | undefined;
}

// Each segment as a thick rounded line, in the classic 7-segment arrangement.
const SEGMENTS: [number, number, number, number][] = [
  [-18, -38, 18, -38], // a: top
  [20, -36, 20, -2], // b: upper right
  [20, 2, 20, 36], // c: lower right
  [-18, 38, 18, 38], // d: bottom
  [-20, 2, -20, 36], // e: lower left
  [-20, -36, -20, -2], // f: upper left
  [-16, 0, 16, 0], // g: middle
];

export function SevenSegmentGlyph({ bits }: SevenSegmentGlyphProps) {
  return (
    <g>
      {SEGMENTS.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={bitColor(bits?.[i])}
          strokeWidth={6}
          strokeLinecap="round"
          pointerEvents="none"
        />
      ))}
    </g>
  );
}

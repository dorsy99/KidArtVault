import { describe, expect, it } from 'vitest';
import { computeHomography } from './perspective';

function applyHomography(H: number[], u: number, v: number) {
  const d = H[6] * u + H[7] * v + H[8];
  return {
    x: (H[0] * u + H[1] * v + H[2]) / d,
    y: (H[3] * u + H[4] * v + H[5]) / d,
  };
}

describe('computeHomography', () => {
  it('maps destination corners back to the exact source quad', () => {
    const src: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
      { x: 120, y: 80 },
      { x: 520, y: 110 },
      { x: 560, y: 420 },
      { x: 90, y: 400 },
    ];
    const H = computeHomography(src, 400, 300);

    const tl = applyHomography(H, 0, 0);
    const tr = applyHomography(H, 400, 0);
    const br = applyHomography(H, 400, 300);
    const bl = applyHomography(H, 0, 300);

    expect(tl.x).toBeCloseTo(120, 4);
    expect(tl.y).toBeCloseTo(80, 4);
    expect(tr.x).toBeCloseTo(520, 4);
    expect(tr.y).toBeCloseTo(110, 4);
    expect(br.x).toBeCloseTo(560, 4);
    expect(br.y).toBeCloseTo(420, 4);
    expect(bl.x).toBeCloseTo(90, 4);
    expect(bl.y).toBeCloseTo(400, 4);
  });
});

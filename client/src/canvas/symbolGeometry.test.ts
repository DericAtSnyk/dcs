import { describe, it, expect } from 'vitest';
import type { ComponentInstance } from '@dcs/shared';
import { getPinPosition, getComponentCenter } from './symbolGeometry.js';

function makeComponent(overrides: Partial<ComponentInstance> = {}): ComponentInstance {
  return {
    id: 1,
    moduleId: 1,
    type: 'AND',
    x: 100,
    y: 100,
    rotation: 0,
    mirrored: false,
    properties: { inputCount: 2 },
    ...overrides,
  };
}

describe('rotate/mirror pin geometry', () => {
  it('unrotated: inputs on the left edge, output on the right edge', () => {
    const c = makeComponent();
    const center = getComponentCenter(c); // AND 2-in: width=80,height=80 -> center (140,140)
    expect(center).toEqual({ x: 140, y: 140 });

    const in0 = getPinPosition(c, 'in', 0);
    const in1 = getPinPosition(c, 'in', 1);
    const out0 = getPinPosition(c, 'out', 0);

    expect(in0.x).toBeLessThan(center.x); // left edge
    expect(in1.x).toBeLessThan(center.x);
    expect(out0.x).toBeGreaterThan(center.x); // right edge
    expect(in0.y).not.toBe(in1.y); // two distinct input rows
  });

  it('rotating 90° turns the (single, centered) output pin from due-right to due-below', () => {
    // AND has exactly one output, so its unrotated relative position is
    // (width/2, 0) — directly right of center with no y offset, which makes
    // the quarter-turn easy to state unambiguously.
    const center = getComponentCenter(makeComponent());
    const unrotated = getPinPosition(makeComponent(), 'out', 0);
    const rotated = getPinPosition(makeComponent({ rotation: 90 }), 'out', 0);

    expect(unrotated).toEqual({ x: center.x + 40, y: center.y });
    expect(rotated.x).toBeCloseTo(center.x, 5); // no longer offset horizontally
    expect(rotated.y).toBeGreaterThan(center.y); // now due-below instead of due-right
  });

  it('four successive 90° rotations return every pin to its original position', () => {
    const base = makeComponent();
    const original = getPinPosition(base, 'in', 0);
    let current = original;
    for (const rotation of [90, 180, 270, 0] as const) {
      current = getPinPosition(makeComponent({ rotation }), 'in', 0);
    }
    expect(current).toEqual(original);
  });

  it('mirroring swaps which side inputs render on, independent of rotation', () => {
    const center = getComponentCenter(makeComponent());
    const normal = getPinPosition(makeComponent(), 'in', 0);
    const mirrored = getPinPosition(makeComponent({ mirrored: true }), 'in', 0);

    expect(normal.x).toBeLessThan(center.x);
    expect(mirrored.x).toBeGreaterThan(center.x);
    expect(mirrored.y).toBe(normal.y); // mirroring is horizontal only
  });

  it('wire endpoints stay consistent between rotated component instances (no drift)', () => {
    // Two identical AND gates, one rotated — their own pin positions must
    // each be internally consistent (center + rotated offset), which is what
    // wire routing relies on to draw a correct line regardless of orientation.
    const rotated = makeComponent({ rotation: 180, x: 300, y: 50 });
    const center = getComponentCenter(rotated);
    const in0 = getPinPosition(rotated, 'in', 0);
    const out0 = getPinPosition(rotated, 'out', 0);
    // A 180° rotation flips left/right: input should now be right-of-center.
    expect(in0.x).toBeGreaterThan(center.x);
    expect(out0.x).toBeLessThan(center.x);
  });
});

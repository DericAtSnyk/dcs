import { snapToGrid, type Point } from './symbolGeometry.js';

/**
 * A grid-snapped, axis-aligned "elbow" path between an output pin and an
 * input pin: horizontal, then vertical, then horizontal — never diagonal.
 */
export function routeOrthogonal(from: Point, to: Point): Point[] {
  if (from.y === to.y) return [from, to];
  const midX = snapToGrid((from.x + to.x) / 2);
  return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
}

export function pointsToPolylinePath(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

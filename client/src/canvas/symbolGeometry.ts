import type { ComponentInstance, ComponentType } from '@dcs/shared';
import { getComponentDefinition } from '../model/components/registry.js';

export const GRID = 20;
const PIN_ROW_HEIGHT = GRID * 2;
const SYMBOL_WIDTH = GRID * 4;

export interface Point {
  x: number;
  y: number;
}

export interface SymbolGeometry {
  width: number;
  height: number;
  /** positions relative to the component's CENTER, unrotated — rotation/mirror
   * are applied on top of these (see rotateAndMirror / getPinPosition). */
  inputPositions: Point[];
  outputPositions: Point[];
}

function columnPositions(count: number, x: number, height: number): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x,
    y: ((i + 0.5) * height) / count - height / 2,
  }));
}

/**
 * Generic pin layout shared by rendering and wire routing: inputs evenly
 * spaced on the left edge, outputs evenly spaced on the right edge. Derived
 * from the same registry pin counts the simulation engine uses, so visuals
 * and simulation can never disagree on how many pins a component has.
 */
export function getSymbolGeometry(
  type: ComponentType,
  properties: Record<string, unknown>,
): SymbolGeometry {
  const layout = getComponentDefinition(type).getPinLayout(properties);

  // A 7-segment digit is portrait (taller than wide) — the generic
  // rows-based sizing below (meant for pin spacing) would make it a wide,
  // squat box since it only has one pin.
  if (type === 'SEVEN_SEG') {
    const width = GRID * 3;
    const height = GRID * 5;
    return { width, height, inputPositions: [{ x: -width / 2, y: 0 }], outputPositions: [] };
  }

  const rows = Math.max(layout.inputs.length, layout.outputs.length, 1);
  const height = rows * PIN_ROW_HEIGHT;
  const width = SYMBOL_WIDTH;

  return {
    width,
    height,
    inputPositions: columnPositions(layout.inputs.length, -width / 2, height),
    outputPositions: columnPositions(layout.outputs.length, width / 2, height),
  };
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/**
 * Applies mirror-then-rotate to a center-relative point, matching the SVG
 * transform `rotate(rotation) scale(mirrored ? -1 : 1, 1)` used to render
 * the symbol (SVG applies the rightmost/scale transform to the point first).
 * Keeping this in sync with that transform is what makes wire endpoints
 * (computed here) line up with the rotated/mirrored symbol drawn on screen.
 */
export function rotateAndMirror(point: Point, rotation: 0 | 90 | 180 | 270, mirrored: boolean): Point {
  const x = mirrored ? -point.x : point.x;
  const y = point.y;
  switch (rotation) {
    case 90:
      return { x: -y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

export function getComponentCenter(component: ComponentInstance): Point {
  const geometry = getSymbolGeometry(component.type, component.properties);
  return { x: component.x + geometry.width / 2, y: component.y + geometry.height / 2 };
}

export function getPinPosition(
  component: ComponentInstance,
  pinKind: 'in' | 'out',
  pinIndex: number,
): Point {
  const geometry = getSymbolGeometry(component.type, component.properties);
  const relative = (pinKind === 'in' ? geometry.inputPositions : geometry.outputPositions)[pinIndex];
  const transformed = rotateAndMirror(relative, component.rotation, component.mirrored);
  const center = getComponentCenter(component);
  return { x: center.x + transformed.x, y: center.y + transformed.y };
}

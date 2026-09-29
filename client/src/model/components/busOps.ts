import type { Bit } from '@dcs/shared';
import type { ComponentDefinition } from '../types.js';
import { allX, singleBit } from './bitLogic.js';

export function getBusWidth(properties: Record<string, unknown>): number {
  const width = properties.width;
  if (typeof width === 'number' && Number.isInteger(width) && width >= 1 && width <= 16) return width;
  return 4;
}

/** Combines N individual 1-bit wires into one N-bit bus. bits[0] (pin 0) is the LSB. */
export const MERGER: ComponentDefinition = {
  type: 'MERGER',
  getPinLayout(properties) {
    const width = getBusWidth(properties);
    return {
      inputs: Array.from({ length: width }, () => ({ width: 1 })),
      outputs: [{ width }],
    };
  },
  evaluate(inputs, properties) {
    const width = getBusWidth(properties);
    const bits: Bit[] = Array.from({ length: width }, (_, i) => inputs[i]?.bits[0] ?? 'X');
    return [{ width, bits }];
  },
};

/** Splits one N-bit bus into N individual 1-bit wires. Inverse of MERGER. */
export const SPLITTER: ComponentDefinition = {
  type: 'SPLITTER',
  getPinLayout(properties) {
    const width = getBusWidth(properties);
    return {
      inputs: [{ width }],
      outputs: Array.from({ length: width }, () => ({ width: 1 })),
    };
  },
  evaluate(inputs, properties) {
    const width = getBusWidth(properties);
    const bus = inputs[0] ?? allX(width);
    return Array.from({ length: width }, (_, i) => singleBit(bus.bits[i] ?? 'X'));
  },
};

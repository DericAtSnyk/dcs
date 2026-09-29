import type { Bit } from '@dcs/shared';
import type { ComponentDefinition } from '../types.js';
import { bitAnd, bitOr, bitNot, bitXor, singleBit } from './bitLogic.js';

function getInputCount(properties: Record<string, unknown>): number {
  const n = properties.inputCount;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= 8) return n;
  return 2;
}

function configurableGatePinLayout(properties: Record<string, unknown>) {
  return {
    inputs: Array.from({ length: getInputCount(properties) }, () => ({ width: 1 })),
    outputs: [{ width: 1 }],
  };
}

function reduceInputs(inputs: { bits: Bit[] }[], combine: (a: Bit, b: Bit) => Bit, identity: Bit): Bit {
  return inputs.reduce<Bit>((acc, signal) => combine(acc, signal.bits[0]), identity);
}

export const AND: ComponentDefinition = {
  type: 'AND',
  getPinLayout: configurableGatePinLayout,
  evaluate(inputs) {
    return [singleBit(reduceInputs(inputs, bitAnd, 1))];
  },
};

export const OR: ComponentDefinition = {
  type: 'OR',
  getPinLayout: configurableGatePinLayout,
  evaluate(inputs) {
    return [singleBit(reduceInputs(inputs, bitOr, 0))];
  },
};

export const NOT: ComponentDefinition = {
  type: 'NOT',
  getPinLayout() {
    return { inputs: [{ width: 1 }], outputs: [{ width: 1 }] };
  },
  evaluate(inputs) {
    return [singleBit(bitNot(inputs[0].bits[0]))];
  },
};

export const NAND: ComponentDefinition = {
  type: 'NAND',
  getPinLayout: configurableGatePinLayout,
  evaluate(inputs) {
    return [singleBit(bitNot(reduceInputs(inputs, bitAnd, 1)))];
  },
};

export const NOR: ComponentDefinition = {
  type: 'NOR',
  getPinLayout: configurableGatePinLayout,
  evaluate(inputs) {
    return [singleBit(bitNot(reduceInputs(inputs, bitOr, 0)))];
  },
};

export const XOR: ComponentDefinition = {
  type: 'XOR',
  getPinLayout: configurableGatePinLayout,
  evaluate(inputs) {
    return [singleBit(reduceInputs(inputs, bitXor, 0))];
  },
};

export const XNOR: ComponentDefinition = {
  type: 'XNOR',
  getPinLayout: configurableGatePinLayout,
  evaluate(inputs) {
    return [singleBit(bitNot(reduceInputs(inputs, bitXor, 0)))];
  },
};

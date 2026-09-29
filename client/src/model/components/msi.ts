import type { Bit, SignalValue } from '@dcs/shared';
import type { ComponentDefinition } from '../types.js';
import { allX, singleBit, bitAnd, bitOr, bitXor } from './bitLogic.js';
import { getBusWidth } from './busOps.js';

function getSelectBits(properties: Record<string, unknown>): number {
  const n = properties.selectBits;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 3) return n;
  return 2;
}

function pins(count: number, width = 1) {
  return Array.from({ length: count }, () => ({ width }));
}

/** LSB-first select bits -> integer, or null if any select bit is undefined. */
function selectIndex(selectBits: SignalValue[]): number | null {
  let index = 0;
  for (let i = 0; i < selectBits.length; i++) {
    const bit = selectBits[i].bits[0];
    if (bit === 'X') return null;
    if (bit === 1) index |= 1 << i;
  }
  return index;
}

export const MUX: ComponentDefinition = {
  type: 'MUX',
  getPinLayout(properties) {
    const selectBits = getSelectBits(properties);
    return { inputs: [...pins(1 << selectBits), ...pins(selectBits)], outputs: [{ width: 1 }] };
  },
  evaluate(inputs, properties) {
    const selectBits = getSelectBits(properties);
    const dataCount = 1 << selectBits;
    const index = selectIndex(inputs.slice(dataCount));
    return index === null ? [singleBit('X')] : [inputs[index]];
  },
};

export const DEMUX: ComponentDefinition = {
  type: 'DEMUX',
  getPinLayout(properties) {
    const selectBits = getSelectBits(properties);
    return { inputs: [{ width: 1 }, ...pins(selectBits)], outputs: pins(1 << selectBits) };
  },
  evaluate(inputs, properties) {
    const selectBits = getSelectBits(properties);
    const outCount = 1 << selectBits;
    const data = inputs[0];
    const index = selectIndex(inputs.slice(1));
    if (index === null) return Array.from({ length: outCount }, () => singleBit('X'));
    return Array.from({ length: outCount }, (_, i) => (i === index ? data : singleBit(0)));
  },
};

export const ENCODER: ComponentDefinition = {
  type: 'ENCODER',
  getPinLayout(properties) {
    const selectBits = getSelectBits(properties);
    return { inputs: pins(1 << selectBits), outputs: pins(selectBits) };
  },
  evaluate(inputs, properties) {
    const selectBits = getSelectBits(properties);
    const undefinedOutput = () => Array.from({ length: selectBits }, () => singleBit('X' as Bit));
    // Priority encoder: highest-index active input wins. Scanning top-down,
    // an X encountered before a determinate 1 makes the result ambiguous
    // (that unknown input might itself have been the highest-priority one).
    for (let i = inputs.length - 1; i >= 0; i--) {
      const bit = inputs[i].bits[0];
      if (bit === 'X') return undefinedOutput();
      if (bit === 1) return Array.from({ length: selectBits }, (_, b) => singleBit(((i >> b) & 1) as Bit));
    }
    return undefinedOutput(); // no active input
  },
};

export const DECODER: ComponentDefinition = {
  type: 'DECODER',
  getPinLayout(properties) {
    const selectBits = getSelectBits(properties);
    return { inputs: pins(selectBits), outputs: pins(1 << selectBits) };
  },
  evaluate(inputs, properties) {
    const selectBits = getSelectBits(properties);
    const outCount = 1 << selectBits;
    const index = selectIndex(inputs);
    if (index === null) return Array.from({ length: outCount }, () => singleBit('X'));
    return Array.from({ length: outCount }, (_, i) => singleBit(i === index ? 1 : 0));
  },
};

export const ADDER: ComponentDefinition = {
  type: 'ADDER',
  getPinLayout(properties) {
    const width = getBusWidth(properties);
    return { inputs: [{ width }, { width }, { width: 1 }], outputs: [{ width }, { width: 1 }] }; // A, B, Cin -> Sum, Cout
  },
  evaluate(inputs, properties) {
    const width = getBusWidth(properties);
    const [a, b, cin] = inputs;
    let carry: Bit = cin.bits[0];
    const sumBits: Bit[] = [];
    for (let i = 0; i < width; i++) {
      const axb = bitXor(a.bits[i] ?? 'X', b.bits[i] ?? 'X');
      sumBits.push(bitXor(axb, carry));
      carry = bitOr(bitAnd(a.bits[i] ?? 'X', b.bits[i] ?? 'X'), bitAnd(axb, carry));
    }
    return [{ width, bits: sumBits }, singleBit(carry)];
  },
};

export const REGISTER: ComponentDefinition = {
  type: 'REGISTER',
  clocking: 'edge',
  clockPinIndex: 1,
  clearPinIndex: 2,
  getPinLayout(properties) {
    const width = getBusWidth(properties);
    return { inputs: [{ width }, { width: 1 }, { width: 1 }], outputs: [{ width }] }; // D, CLK, CLR
  },
  evaluate(inputs, properties, state) {
    const width = getBusWidth(properties);
    if (inputs[2].bits[0] === 1) return [{ width, bits: Array(width).fill(0) }];
    return state ?? [allX(width)];
  },
  computeNextState(inputs) {
    return [inputs[0]];
  },
};

function incrementBits(bits: Bit[]): Bit[] {
  if (bits.some((b) => b === 'X')) return bits.map(() => 'X' as Bit);
  let carry: Bit = 1;
  return bits.map((b) => {
    const sum = bitXor(b, carry);
    carry = bitAnd(b, carry);
    return sum;
  });
}

export const COUNTER: ComponentDefinition = {
  type: 'COUNTER',
  clocking: 'edge',
  clockPinIndex: 0,
  clearPinIndex: 1,
  getPinLayout(properties) {
    const width = getBusWidth(properties);
    return { inputs: [{ width: 1 }, { width: 1 }], outputs: [{ width }] }; // CLK, CLR
  },
  evaluate(inputs, properties, state) {
    const width = getBusWidth(properties);
    if (inputs[1].bits[0] === 1) return [{ width, bits: Array(width).fill(0) }];
    return state ?? [allX(width)];
  },
  computeNextState(_inputs, properties, state) {
    const width = getBusWidth(properties);
    return [{ width, bits: incrementBits(state[0].bits) }];
  },
};

// Standard 7-segment encoding, bit order [a, b, c, d, e, f, g], active-high.
const BCD_SEGMENTS: Record<number, Bit[]> = {
  0: [1, 1, 1, 1, 1, 1, 0],
  1: [0, 1, 1, 0, 0, 0, 0],
  2: [1, 1, 0, 1, 1, 0, 1],
  3: [1, 1, 1, 1, 0, 0, 1],
  4: [0, 1, 1, 0, 0, 1, 1],
  5: [1, 0, 1, 1, 0, 1, 1],
  6: [1, 0, 1, 1, 1, 1, 1],
  7: [1, 1, 1, 0, 0, 0, 0],
  8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
};

export const BCD_DECODER: ComponentDefinition = {
  type: 'BCD_DECODER',
  getPinLayout() {
    return { inputs: [{ width: 4 }], outputs: [{ width: 7 }] };
  },
  evaluate(inputs) {
    const bits = inputs[0].bits;
    if (bits.some((b) => b === 'X')) return [{ width: 7, bits: Array(7).fill('X') }];
    const value = bits.reduce<number>((acc, b, i) => acc + (b === 1 ? 1 << i : 0), 0);
    const segments = BCD_SEGMENTS[value] ?? Array(7).fill(0); // blank for invalid codes 10-15
    return [{ width: 7, bits: segments }];
  },
};

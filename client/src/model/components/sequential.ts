import type { Bit, SignalValue } from '@dcs/shared';
import type { ComponentDefinition } from '../types.js';
import { singleBit } from './bitLogic.js';

function heldOutput(clearBit: Bit, state: SignalValue[] | undefined): SignalValue[] {
  if (clearBit === 1) return [singleBit(0)];
  return state ?? [singleBit('X')];
}

// --- Edge-triggered flip-flops: D, CLK, CLR (D_FF) / J, K, CLK, CLR (JK_FF) / S, R, CLK, CLR (SR_FF) ---
// `evaluate` deliberately ignores data inputs (Q only changes at a detected
// clock edge, via `computeNextState`, called by the engine's tick()) except
// for the asynchronous clear, which is checked every pass.

export const D_FF: ComponentDefinition = {
  type: 'D_FF',
  clocking: 'edge',
  clockPinIndex: 1,
  clearPinIndex: 2,
  getPinLayout() {
    return { inputs: [{ width: 1 }, { width: 1 }, { width: 1 }], outputs: [{ width: 1 }] }; // D, CLK, CLR
  },
  evaluate(inputs, _properties, state) {
    return heldOutput(inputs[2].bits[0], state);
  },
  computeNextState(inputs) {
    return [singleBit(inputs[0].bits[0])];
  },
};

function jkNext(j: Bit, k: Bit, q: Bit): Bit {
  if (j === 'X' || k === 'X') return 'X';
  if (j === 0 && k === 0) return q;
  if (j === 0 && k === 1) return 0;
  if (j === 1 && k === 0) return 1;
  return q === 'X' ? 'X' : q === 1 ? 0 : 1; // J=1,K=1 -> toggle
}

export const JK_FF: ComponentDefinition = {
  type: 'JK_FF',
  clocking: 'edge',
  clockPinIndex: 2,
  clearPinIndex: 3,
  getPinLayout() {
    return { inputs: [{ width: 1 }, { width: 1 }, { width: 1 }, { width: 1 }], outputs: [{ width: 1 }] }; // J, K, CLK, CLR
  },
  evaluate(inputs, _properties, state) {
    return heldOutput(inputs[3].bits[0], state);
  },
  computeNextState(inputs, _properties, state) {
    const q = state[0].bits[0];
    return [singleBit(jkNext(inputs[0].bits[0], inputs[1].bits[0], q))];
  },
};

function srNext(s: Bit, r: Bit, q: Bit): Bit {
  if (s === 'X' || r === 'X') return 'X';
  if (s === 1 && r === 1) return 'X'; // invalid/ambiguous combination
  if (s === 1) return 1;
  if (r === 1) return 0;
  return q; // hold
}

export const SR_FF: ComponentDefinition = {
  type: 'SR_FF',
  clocking: 'edge',
  clockPinIndex: 2,
  clearPinIndex: 3,
  getPinLayout() {
    return { inputs: [{ width: 1 }, { width: 1 }, { width: 1 }, { width: 1 }], outputs: [{ width: 1 }] }; // S, R, CLK, CLR
  },
  evaluate(inputs, _properties, state) {
    return heldOutput(inputs[3].bits[0], state);
  },
  computeNextState(inputs, _properties, state) {
    const q = state[0].bits[0];
    return [singleBit(srNext(inputs[0].bits[0], inputs[1].bits[0], q))];
  },
};

// --- Level-sensitive latches: transparent while enabled/set, hold otherwise.
// Memory falls out of `evaluate` reading its own previous `state` — no
// separate computeNextState needed, the fixed-point settle loop handles it.

export const D_LATCH: ComponentDefinition = {
  type: 'D_LATCH',
  clocking: 'level',
  getPinLayout() {
    return { inputs: [{ width: 1 }, { width: 1 }, { width: 1 }], outputs: [{ width: 1 }] }; // D, ENABLE, CLR
  },
  evaluate(inputs, _properties, state) {
    const clear = inputs[2].bits[0];
    if (clear === 1) return [singleBit(0)];
    const enable = inputs[1].bits[0];
    const previousQ = state?.[0]?.bits[0] ?? 'X';
    if (enable === 1) return [singleBit(inputs[0].bits[0])];
    if (enable === 0) return [singleBit(previousQ)];
    return [singleBit('X')]; // enable itself undefined: can't know pass-through vs hold
  },
};

export const SR_LATCH: ComponentDefinition = {
  type: 'SR_LATCH',
  clocking: 'level',
  getPinLayout() {
    return { inputs: [{ width: 1 }, { width: 1 }, { width: 1 }], outputs: [{ width: 1 }] }; // S, R, CLR
  },
  evaluate(inputs, _properties, state) {
    const clear = inputs[2].bits[0];
    if (clear === 1) return [singleBit(0)];
    const previousQ = state?.[0]?.bits[0] ?? 'X';
    return [singleBit(srNext(inputs[0].bits[0], inputs[1].bits[0], previousQ))];
  },
};

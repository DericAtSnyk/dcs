import type { Bit, SignalValue } from '@dcs/shared';

// Standard tri-state (0/1/X) dominance rules: a determinate value that fully
// determines the result "dominates" over X (unknown), matching how real HDL
// simulators propagate unknowns. AND is dominated by 0, OR is dominated by 1.

export function bitAnd(a: Bit, b: Bit): Bit {
  if (a === 0 || b === 0) return 0;
  if (a === 'X' || b === 'X') return 'X';
  return 1;
}

export function bitOr(a: Bit, b: Bit): Bit {
  if (a === 1 || b === 1) return 1;
  if (a === 'X' || b === 'X') return 'X';
  return 0;
}

export function bitNot(a: Bit): Bit {
  if (a === 'X') return 'X';
  return a === 0 ? 1 : 0;
}

export function bitXor(a: Bit, b: Bit): Bit {
  if (a === 'X' || b === 'X') return 'X';
  return a === b ? 0 : 1;
}

export function allX(width: number): SignalValue {
  return { width, bits: Array.from({ length: width }, () => 'X' as Bit) };
}

export function singleBit(bit: Bit): SignalValue {
  return { width: 1, bits: [bit] };
}

export function bitsEqual(a: SignalValue, b: SignalValue): boolean {
  return a.width === b.width && a.bits.every((bit, i) => bit === b.bits[i]);
}

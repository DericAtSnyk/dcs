import type { SignalValue } from '@dcs/shared';

/** LSB-first bits -> unsigned integer, or null if any bit is undefined (X). */
export function signalToNumber(signal: SignalValue): number | null {
  if (signal.bits.some((b) => b === 'X')) return null;
  return signal.bits.reduce<number>((acc, bit, i) => acc + (bit === 1 ? 1 << i : 0), 0);
}

export function formatHex(signal: SignalValue): string {
  const value = signalToNumber(signal);
  return value === null ? 'X' : `0x${value.toString(16).toUpperCase()}`;
}

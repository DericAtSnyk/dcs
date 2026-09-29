import type { Bit, SignalValue } from '@dcs/shared';

export function bitColor(bit: Bit | undefined): string {
  switch (bit) {
    case 1:
      return '#22c55e';
    case 0:
      return '#52525b';
    default:
      return '#f59e0b';
  }
}

const BUS_MIXED_COLOR = '#818cf8';

/** For a bus (width > 1): uniform 0/1/X gets that color, a mix of defined
 * bits gets a distinct "data" color rather than misleadingly showing just
 * one bit's color. */
export function signalColor(signal: SignalValue | undefined): string {
  if (!signal) return bitColor(undefined);
  if (signal.width === 1) return bitColor(signal.bits[0]);
  const first = signal.bits[0];
  if (signal.bits.every((b) => b === first)) return bitColor(first);
  return BUS_MIXED_COLOR;
}

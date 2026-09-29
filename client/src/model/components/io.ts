import type { Bit } from '@dcs/shared';
import type { ComponentDefinition } from '../types.js';
import { singleBit } from './bitLogic.js';
import { getBusWidth } from './busOps.js';

export const SWITCH: ComponentDefinition = {
  type: 'SWITCH',
  getPinLayout() {
    return { inputs: [], outputs: [{ width: 1 }] };
  },
  evaluate(_inputs, properties) {
    const raw = properties.value;
    const value: Bit = raw === 1 ? 1 : raw === 0 ? 0 : 'X';
    return [singleBit(value)];
  },
};

/** A manually-stepped clock source: outputs `properties.level`, toggled by
 * the clock toolbar's Step action (or by Run's timer, which just calls Step
 * repeatedly). Structurally identical to SWITCH — the "clock-ness" is purely
 * in how the UI drives its `level` property and how flip-flops watch it. */
export const CLOCK: ComponentDefinition = {
  type: 'CLOCK',
  getPinLayout() {
    return { inputs: [], outputs: [{ width: 1 }] };
  },
  evaluate(_inputs, properties) {
    const level: Bit = properties.level === 1 ? 1 : 0;
    return [singleBit(level)];
  },
};

/** Momentary push button: 1 only while held, back to 0 on release — distinct
 * from SWITCH's click-to-toggle. The UI drives `properties.pressed` via
 * pointerdown/pointerup rather than a click. */
export const BUTTON: ComponentDefinition = {
  type: 'BUTTON',
  getPinLayout() {
    return { inputs: [], outputs: [{ width: 1 }] };
  },
  evaluate(_inputs, properties) {
    const pressed: Bit = properties.pressed === 1 ? 1 : 0;
    return [singleBit(pressed)];
  },
};

export const LED: ComponentDefinition = {
  type: 'LED',
  getPinLayout() {
    return { inputs: [{ width: 1 }], outputs: [] };
  },
  evaluate() {
    return [];
  },
};

/** Displays a bus's current value as hex/decimal text; rendering-only, no simulated outputs. */
export const VALUE_DISPLAY: ComponentDefinition = {
  type: 'VALUE_DISPLAY',
  getPinLayout(properties) {
    return { inputs: [{ width: getBusWidth(properties) }], outputs: [] };
  },
  evaluate() {
    return [];
  },
};

/** Seven-segment display: takes a 7-bit segment bus (a,b,c,d,e,f,g), typically
 * fed by a BCD_DECODER. Rendering-only, no simulated outputs. */
export const SEVEN_SEG: ComponentDefinition = {
  type: 'SEVEN_SEG',
  getPinLayout() {
    return { inputs: [{ width: 7 }], outputs: [] };
  },
  evaluate() {
    return [];
  },
};

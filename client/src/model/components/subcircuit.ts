import type { Bit } from '@dcs/shared';
import type { ComponentDefinition } from '../types.js';

export interface SubcircuitPin {
  direction: 'in' | 'out';
  width: number;
}

export function getSubcircuitPins(properties: Record<string, unknown>): SubcircuitPin[] {
  return (properties.pins as SubcircuitPin[] | undefined) ?? [];
}

/**
 * A black-box instance of another module in the same file. Its pin layout is
 * cached in `properties.pins` (captured when the instance is placed — see
 * editorStore's addSubcircuitInstance) rather than looked up from the
 * referenced module live, so this fits the same `getPinLayout(properties)`
 * signature every other component uses, with no special-casing needed in
 * rendering or wiring-time validation.
 *
 * `evaluate` is never actually called: elaborate() always inlines the
 * referenced module's components in place of a SUBCIRCUIT node before
 * simulation runs, so this SimNode type never reaches computePass(). The
 * stub exists only so getComponentDefinition() doesn't throw when pin
 * geometry/wiring code (which runs on the un-elaborated design model) looks
 * up this type.
 */
export const SUBCIRCUIT: ComponentDefinition = {
  type: 'SUBCIRCUIT',
  getPinLayout(properties) {
    const pins = getSubcircuitPins(properties);
    return {
      inputs: pins.filter((p) => p.direction === 'in').map((p) => ({ width: p.width })),
      outputs: pins.filter((p) => p.direction === 'out').map((p) => ({ width: p.width })),
    };
  },
  evaluate() {
    throw new Error('SUBCIRCUIT nodes must be elaborated before simulation — evaluate() should never be called on one directly.');
  },
};

/**
 * Marks one input boundary pin of the module it's placed in. When this
 * module is instantiated as a SUBCIRCUIT elsewhere, elaborate() overrides
 * this marker's output net to alias the parent's net feeding that pin. When
 * the module is viewed/simulated standalone (its own tab, not nested), there
 * is no parent to feed it, so it falls back to acting like a settable test
 * source (`properties.value`) — letting a sub-circuit be tested on its own
 * before being used elsewhere.
 */
export const INPUT_PIN: ComponentDefinition = {
  type: 'INPUT_PIN',
  getPinLayout(properties) {
    return { inputs: [], outputs: [{ width: (properties.width as number) ?? 1 }] };
  },
  evaluate(_inputs, properties) {
    const width = (properties.width as number) ?? 1;
    const raw = properties.value;
    const numeric = typeof raw === 'number' ? raw : 0;
    const bits: Bit[] = Array.from({ length: width }, (_, i) => (((numeric >> i) & 1) as Bit));
    return [{ width, bits }];
  },
};

/**
 * Marks one output boundary pin of the module it's placed in. Rendering-only
 * from the simulation's point of view (like LED) — elaborate() reads the
 * value on this marker's input net directly to expose as the parent
 * SUBCIRCUIT instance's corresponding output.
 */
export const OUTPUT_PIN: ComponentDefinition = {
  type: 'OUTPUT_PIN',
  getPinLayout(properties) {
    return { inputs: [{ width: (properties.width as number) ?? 1 }], outputs: [] };
  },
  evaluate() {
    return [];
  },
};

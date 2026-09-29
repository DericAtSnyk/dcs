import type { ComponentType } from '@dcs/shared';
import type { ComponentDefinition } from '../types.js';
import { AND, OR, NOT, NAND, NOR, XOR, XNOR } from './gates.js';
import { SWITCH, CLOCK, BUTTON, LED, VALUE_DISPLAY, SEVEN_SEG } from './io.js';
import { MERGER, SPLITTER } from './busOps.js';
import { D_FF, JK_FF, SR_FF, D_LATCH, SR_LATCH } from './sequential.js';
import { MUX, DEMUX, ENCODER, DECODER, ADDER, REGISTER, COUNTER, BCD_DECODER } from './msi.js';
import { SUBCIRCUIT, INPUT_PIN, OUTPUT_PIN } from './subcircuit.js';

const registry = new Map<ComponentType, ComponentDefinition>();

function register(definition: ComponentDefinition): void {
  registry.set(definition.type, definition);
}

[
  AND, OR, NOT, NAND, NOR, XOR, XNOR,
  SWITCH, CLOCK, BUTTON, LED, VALUE_DISPLAY, SEVEN_SEG,
  MERGER, SPLITTER,
  D_FF, JK_FF, SR_FF, D_LATCH, SR_LATCH,
  MUX, DEMUX, ENCODER, DECODER, ADDER, REGISTER, COUNTER, BCD_DECODER,
  SUBCIRCUIT, INPUT_PIN, OUTPUT_PIN,
].forEach(register);

export function getComponentDefinition(type: ComponentType): ComponentDefinition {
  const definition = registry.get(type);
  if (!definition) {
    throw new Error(`No component definition registered for type "${type}"`);
  }
  return definition;
}

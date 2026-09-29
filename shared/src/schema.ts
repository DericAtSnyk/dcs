import { z } from 'zod';

const bitSchema = z.union([z.literal(0), z.literal(1), z.literal('X')]);

export const signalValueSchema = z.object({
  width: z.number().int().positive(),
  bits: z.array(bitSchema),
});

const componentTypeSchema = z.enum([
  'AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR',
  'D_FF', 'JK_FF', 'SR_FF', 'D_LATCH', 'SR_LATCH',
  'MUX', 'DEMUX', 'ENCODER', 'DECODER', 'ADDER', 'REGISTER', 'COUNTER',
  'SWITCH', 'BUTTON', 'LED', 'SEVEN_SEG', 'BCD_DECODER', 'VALUE_DISPLAY',
  'SPLITTER', 'MERGER',
  'SUBCIRCUIT', 'INPUT_PIN', 'OUTPUT_PIN', 'CLOCK',
]);

const pinDirectionSchema = z.enum(['in', 'out']);

export const componentInstanceSchema = z.object({
  id: z.number().int(),
  moduleId: z.number().int(),
  type: componentTypeSchema,
  x: z.number().int(),
  y: z.number().int(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  mirrored: z.boolean(),
  properties: z.record(z.unknown()),
});

export const netSchema = z.object({
  id: z.number().int(),
  moduleId: z.number().int(),
  bitWidth: z.number().int().positive(),
  isBus: z.boolean(),
});

export const wireSegmentSchema = z.object({
  id: z.number().int(),
  netId: z.number().int(),
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
});

export const pinConnectionSchema = z.object({
  id: z.number().int(),
  netId: z.number().int(),
  componentInstanceId: z.number().int(),
  pinIndex: z.number().int(),
  pinKind: pinDirectionSchema,
});

export const modulePinSchema = z.object({
  id: z.number().int(),
  moduleId: z.number().int(),
  direction: pinDirectionSchema,
  bitWidth: z.number().int().positive(),
  orderIndex: z.number().int(),
  name: z.string(),
  sourceComponentId: z.number().int(),
});

export const moduleViewStateSchema = z.object({
  panX: z.number(),
  panY: z.number(),
  zoom: z.number(),
});

export const moduleSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  isTopLevel: z.boolean(),
  viewState: moduleViewStateSchema.nullable(),
  pins: z.array(modulePinSchema),
  components: z.array(componentInstanceSchema),
  nets: z.array(netSchema),
  wireSegments: z.array(wireSegmentSchema),
  pinConnections: z.array(pinConnectionSchema),
});

export const waveformTrackSchema = z.object({
  id: z.number().int(),
  topModuleId: z.number().int(),
  instancePath: z.array(z.number().int()),
  label: z.string().nullable(),
  color: z.string().nullable(),
});

export const circuitFileSchema = z.object({
  schemaVersion: z.number().int(),
  topLevelModuleId: z.number().int(),
  activeTabModuleId: z.number().int().nullable(),
  clockFrequencyHz: z.number().positive(),
  modules: z.array(moduleSchema),
  waveformTracks: z.array(waveformTrackSchema),
});

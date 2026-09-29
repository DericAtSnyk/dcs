// Core domain types shared between client and server.
// Mirrors the SQLite schema (server/src/db/schema.ts) but as a plain JSON wire format.

export type Bit = 0 | 1 | 'X';

/** bits[0] is the LSB. width === bits.length always. */
export interface SignalValue {
  width: number;
  bits: Bit[];
}

export type ComponentType =
  // gates (configurable input count)
  | 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR' | 'XNOR'
  // sequential primitives (async clear only)
  | 'D_FF' | 'JK_FF' | 'SR_FF' | 'D_LATCH' | 'SR_LATCH'
  // MSI ICs
  | 'MUX' | 'DEMUX' | 'ENCODER' | 'DECODER' | 'ADDER' | 'REGISTER' | 'COUNTER'
  // I/O
  | 'SWITCH' | 'BUTTON' | 'LED' | 'SEVEN_SEG' | 'BCD_DECODER' | 'VALUE_DISPLAY'
  // bus ops
  | 'SPLITTER' | 'MERGER'
  // structural
  | 'SUBCIRCUIT' | 'INPUT_PIN' | 'OUTPUT_PIN' | 'CLOCK';

export type PinDirection = 'in' | 'out';

export interface ComponentInstance {
  id: number;
  moduleId: number;
  type: ComponentType;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  mirrored: boolean;
  /** e.g. { inputCount, busWidth, initialValue, subcircuitModuleId, radix, label } */
  properties: Record<string, unknown>;
}

export interface Net {
  id: number;
  moduleId: number;
  bitWidth: number;
  isBus: boolean;
}

export interface WireSegment {
  id: number;
  netId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PinConnection {
  id: number;
  netId: number;
  componentInstanceId: number;
  pinIndex: number;
  pinKind: PinDirection;
}

export interface ModulePin {
  id: number;
  moduleId: number;
  direction: PinDirection;
  bitWidth: number;
  orderIndex: number;
  name: string;
  sourceComponentId: number;
}

export interface ModuleViewState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Module {
  id: number;
  name: string;
  isTopLevel: boolean;
  viewState: ModuleViewState | null;
  pins: ModulePin[];
  components: ComponentInstance[];
  nets: Net[];
  wireSegments: WireSegment[];
  pinConnections: PinConnection[];
}

export interface WaveformTrack {
  id: number;
  topModuleId: number;
  /** component_instance ids from top-level down through nested subcircuit instances */
  instancePath: number[];
  label: string | null;
  color: string | null;
}

/** The full serialized wire format for one .sqlite circuit file. */
export interface CircuitFile {
  schemaVersion: number;
  topLevelModuleId: number;
  activeTabModuleId: number | null;
  clockFrequencyHz: number;
  modules: Module[];
  waveformTracks: WaveformTrack[];
}

export const SCHEMA_VERSION = 1;

import type { Bit, SignalValue, ComponentType } from '@dcs/shared';

export type NetId = string;
export type NodeId = string;

export interface SimNet {
  id: NetId;
  bitWidth: number;
  value: SignalValue;
}

export interface SimPinSpec {
  width: number;
}

export interface SimPinLayout {
  inputs: SimPinSpec[];
  outputs: SimPinSpec[];
}

export interface ComponentDefinition {
  type: ComponentType;
  getPinLayout(properties: Record<string, unknown>): SimPinLayout;
  /** Current inputs (+ current state, for stateful components) -> output values.
   * Stateless combinational components ignore `state`. Called every settle pass. */
  evaluate(inputs: SignalValue[], properties: Record<string, unknown>, state?: SignalValue[]): SignalValue[];
  /**
   * 'level': state == this pass's output, recomputed every settle pass (transparent
   *   latches — memory falls out of evaluate() referencing its own previous state).
   * 'edge': state only changes when the engine detects a rising edge on
   *   `clockPinIndex` and calls `computeNextState`; `evaluate` must otherwise
   *   echo `state` unchanged regardless of data inputs (real flip-flop behavior).
   * undefined: stateless combinational component.
   */
  clocking?: 'edge' | 'level';
  /** Required when clocking === 'edge': which input pin is the clock. */
  clockPinIndex?: number;
  /** Optional: which input pin is an asynchronous active-high clear, checked
   * every pass in `evaluate` and also consulted by the engine to suppress a
   * clock-edge update while clear is asserted. */
  clearPinIndex?: number;
  /** Required when clocking === 'edge': settled pre-edge input values + prior
   * state -> new state, applied atomically when a rising edge is detected. */
  computeNextState?(
    inputs: SignalValue[],
    properties: Record<string, unknown>,
    state: SignalValue[],
  ): SignalValue[];
}

export interface SimNode {
  id: NodeId;
  type: ComponentType;
  properties: Record<string, unknown>;
  /** net id feeding each input pin, in pin order; null = unconnected (floating) */
  inputNets: (NetId | null)[];
  /** net id driven by each output pin, in pin order; null = unconnected */
  outputNets: (NetId | null)[];
  /** Only meaningful when the component's definition sets `clocking`; persists
   * across settle()/tick() calls the same way net values do. */
  state?: SignalValue[];
  /** Engine-managed bookkeeping for edge-clocked components: the clock pin's
   * value as of the end of the last tick(), used to detect 0->1 transitions. */
  lastClockValue?: Bit;
}

export interface SimGraph {
  nodes: SimNode[];
  nets: Map<NetId, SimNet>;
}

export interface SettleResult {
  settled: boolean;
  iterations: number;
  /** net ids forced to X because they failed to converge within the iteration cap */
  unresolvedNets: NetId[];
}

import type { Bit, Module } from '@dcs/shared';
import type { SimGraph } from '../types.js';
import { elaborate, rootNodeId } from './elaborate.js';
import { settle } from './evaluate.js';
import { getComponentDefinition } from '../components/registry.js';
import { findSourceComponents, findSinkComponents, labelFor, pinWidth } from './ioDiscovery.js';

const MAX_INPUT_BITS = 10; // 2^10 = 1024 rows

export interface TruthTableColumn {
  componentId: number;
  label: string;
  width: number;
}

export interface TruthTableRow {
  inputBits: Bit[][];
  outputBits: Bit[][];
}

export interface TruthTableResult {
  inputs: TruthTableColumn[];
  outputs: TruthTableColumn[];
  rows: TruthTableRow[];
  /** True if the elaborated circuit contains any flip-flop/latch — results
   * are then only a snapshot against the current internal state, not a
   * complete description of sequential behavior. */
  hasSequentialElements: boolean;
  /** True if totalInputBits exceeds MAX_INPUT_BITS — rows is empty and the
   * caller should show a blocking message rather than attempt the sweep. */
  exceedsCap: boolean;
  totalInputBits: number;
}

function numberToBits(value: number, width: number): Bit[] {
  return Array.from({ length: width }, (_, i) => (((value >> i) & 1) as Bit));
}

/**
 * Exhaustively sweeps every combination of the module's input sources
 * (SWITCH/BUTTON/INPUT_PIN), reading the resulting values on its output
 * sinks (LED/VALUE_DISPLAY/SEVEN_SEG/OUTPUT_PIN) for each. Sequential state
 * (flip-flops/latches, if any) is held fixed at whatever `currentGraph`
 * shows — each row is a combinational settle(), never tick(), so no clock
 * edge ever fires during the sweep.
 *
 * Reuses elaborate()+settle() — the same code that runs the live simulation
 * — rooted at whichever module is selected, so a sub-circuit module can be
 * tested standalone the same way the top-level circuit can.
 */
export function generateTruthTable(modules: Module[], moduleId: number, currentGraph?: SimGraph): TruthTableResult {
  const module = modules.find((m) => m.id === moduleId)!;
  const inputComponents = findSourceComponents(module);
  const outputComponents = findSinkComponents(module);

  const inputs: TruthTableColumn[] = inputComponents.map((c) => ({
    componentId: c.id,
    label: labelFor(module, c),
    width: pinWidth(c, 'out'),
  }));
  const outputs: TruthTableColumn[] = outputComponents.map((c) => ({
    componentId: c.id,
    label: labelFor(module, c),
    width: pinWidth(c, 'in'),
  }));
  const totalInputBits = inputs.reduce((sum, col) => sum + col.width, 0);

  const baseline = elaborate(modules, moduleId, currentGraph);
  const hasSequentialElements = baseline.nodes.some((n) => getComponentDefinition(n.type).clocking != null);

  if (totalInputBits > MAX_INPUT_BITS) {
    return { inputs, outputs, rows: [], hasSequentialElements, exceedsCap: true, totalInputBits };
  }

  const rows: TruthTableRow[] = [];
  const rowCount = 1 << totalInputBits;

  for (let combo = 0; combo < rowCount; combo++) {
    let bitCursor = 0;
    const inputBits: Bit[][] = [];
    const overridesByComponentId = new Map<number, number>();
    for (let i = 0; i < inputComponents.length; i++) {
      const width = inputs[i].width;
      const mask = (1 << width) - 1;
      const value = (combo >> bitCursor) & mask;
      bitCursor += width;
      overridesByComponentId.set(inputComponents[i].id, value);
      inputBits.push(numberToBits(value, width));
    }

    const patchedModule: Module = {
      ...module,
      components: module.components.map((c) => {
        const overrideValue = overridesByComponentId.get(c.id);
        return overrideValue == null ? c : { ...c, properties: { ...c.properties, value: overrideValue } };
      }),
    };
    const patchedModules = modules.map((m) => (m.id === moduleId ? patchedModule : m));

    // Seed from `baseline` every row (not accumulating across rows), so each
    // row reflects the *same* fixed snapshot of sequential state.
    const graph = elaborate(patchedModules, moduleId, baseline);
    settle(graph);

    const outputBits: Bit[][] = outputComponents.map((oc) => {
      const node = graph.nodes.find((n) => n.id === rootNodeId(oc.id));
      const netId = node?.inputNets[0];
      const value = netId != null ? graph.nets.get(netId)?.value : undefined;
      return value?.bits ?? Array.from({ length: pinWidth(oc, 'in') }, () => 'X' as Bit);
    });

    rows.push({ inputBits, outputBits });
  }

  return { inputs, outputs, rows, hasSequentialElements, exceedsCap: false, totalInputBits };
}

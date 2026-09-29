import { describe, it, expect } from 'vitest';
import type { Module, ComponentInstance, Net, PinConnection } from '@dcs/shared';
import { generateTruthTable } from './truthTable.js';
import { tick } from './clock.js';
import { elaborate } from './elaborate.js';

function component(id: number, type: ComponentInstance['type'], properties: Record<string, unknown> = {}): ComponentInstance {
  return { id, moduleId: 1, type, x: 0, y: 0, rotation: 0, mirrored: false, properties };
}
function net(id: number, bitWidth = 1): Net {
  return { id, moduleId: 1, bitWidth, isBus: false };
}
function conn(id: number, netId: number, componentInstanceId: number, pinIndex: number, pinKind: 'in' | 'out'): PinConnection {
  return { id, netId, componentInstanceId, pinIndex, pinKind };
}

describe('generateTruthTable: 2 switches -> AND -> LED', () => {
  const module: Module = {
    id: 1,
    name: 'main',
    isTopLevel: true,
    viewState: null,
    pins: [],
    components: [
      component(1, 'SWITCH', { value: 0 }),
      component(2, 'SWITCH', { value: 0 }),
      component(3, 'AND'),
      component(4, 'LED'),
    ],
    nets: [net(1), net(2), net(3)],
    wireSegments: [],
    pinConnections: [
      conn(1, 1, 1, 0, 'out'),
      conn(2, 1, 3, 0, 'in'),
      conn(3, 2, 2, 0, 'out'),
      conn(4, 2, 3, 1, 'in'),
      conn(5, 3, 3, 0, 'out'),
      conn(6, 3, 4, 0, 'in'),
    ],
  };

  it('discovers both switches as inputs and the LED as the only output', () => {
    const result = generateTruthTable([module], 1);
    expect(result.inputs.map((c) => c.componentId)).toEqual([1, 2]);
    expect(result.outputs.map((c) => c.componentId)).toEqual([4]);
    expect(result.totalInputBits).toBe(2);
    expect(result.exceedsCap).toBe(false);
    expect(result.hasSequentialElements).toBe(false);
  });

  it('produces exactly the AND truth table over all 4 rows', () => {
    const result = generateTruthTable([module], 1);
    expect(result.rows).toHaveLength(4);
    const table = result.rows.map((r) => ({
      a: r.inputBits[0][0],
      b: r.inputBits[1][0],
      out: r.outputBits[0][0],
    }));
    expect(table).toEqual([
      { a: 0, b: 0, out: 0 },
      { a: 1, b: 0, out: 0 },
      { a: 0, b: 1, out: 0 },
      { a: 1, b: 1, out: 1 },
    ]);
  });

  it('does not mutate the live module or its component properties', () => {
    const before = JSON.stringify(module);
    generateTruthTable([module], 1);
    expect(JSON.stringify(module)).toBe(before);
  });
});

describe('generateTruthTable: practical input cap', () => {
  it('blocks (exceedsCap, no rows) beyond 10 total input bits', () => {
    const switches = Array.from({ length: 11 }, (_, i) => component(i + 1, 'SWITCH', { value: 0 }));
    const module: Module = {
      id: 1,
      name: 'main',
      isTopLevel: true,
      viewState: null,
      pins: [],
      components: switches,
      nets: [],
      wireSegments: [],
      pinConnections: [],
    };
    const result = generateTruthTable([module], 1);
    expect(result.totalInputBits).toBe(11);
    expect(result.exceedsCap).toBe(true);
    expect(result.rows).toHaveLength(0);
  });

  it('allows exactly 10 input bits (1024 rows)', () => {
    const switches = Array.from({ length: 10 }, (_, i) => component(i + 1, 'SWITCH', { value: 0 }));
    const module: Module = {
      id: 1,
      name: 'main',
      isTopLevel: true,
      viewState: null,
      pins: [],
      components: switches,
      nets: [],
      wireSegments: [],
      pinConnections: [],
    };
    const result = generateTruthTable([module], 1);
    expect(result.exceedsCap).toBe(false);
    expect(result.rows).toHaveLength(1024);
  });
});

describe('generateTruthTable: sequential-element snapshot warning', () => {
  const module: Module = {
    id: 1,
    name: 'main',
    isTopLevel: true,
    viewState: null,
    pins: [],
    components: [
      component(1, 'SWITCH', { value: 0 }), // D
      component(2, 'CLOCK', { level: 0 }),
      component(3, 'SWITCH', { value: 1 }), // CLR (start cleared)
      component(4, 'D_FF'),
      component(5, 'LED'),
    ],
    nets: [net(1), net(2), net(3), net(4)],
    wireSegments: [],
    pinConnections: [
      conn(1, 1, 1, 0, 'out'),
      conn(2, 1, 4, 0, 'in'),
      conn(3, 2, 2, 0, 'out'),
      conn(4, 2, 4, 1, 'in'),
      conn(5, 3, 3, 0, 'out'),
      conn(6, 3, 4, 2, 'in'),
      conn(7, 4, 4, 0, 'out'),
      conn(8, 4, 5, 0, 'in'),
    ],
  };

  it('flags hasSequentialElements for a module containing a flip-flop', () => {
    const result = generateTruthTable([module], 1);
    expect(result.hasSequentialElements).toBe(true);
  });

  it('reflects the CURRENT latched Q as a fixed snapshot, unaffected by sweeping D (no clock edge fires during the sweep)', () => {
    // Establish Q=1 in a live graph: release clear, clock in D=1.
    let graph = elaborate([module], 1);
    tick(graph); // baseline clk=0
    module.components.find((c) => c.id === 1)!.properties = { value: 1 }; // D=1
    module.components.find((c) => c.id === 3)!.properties = { value: 0 }; // release CLR
    graph = elaborate([module], 1, graph);
    tick(graph);
    module.components.find((c) => c.id === 2)!.properties = { level: 1 }; // rising edge
    graph = elaborate([module], 1, graph);
    tick(graph);
    expect(graph.nets.get('n4')!.value.bits[0]).toBe(1); // confirms Q=1 live

    // Now sweep the truth table from this live state. CLR is itself one of
    // the swept inputs (it's an ordinary SWITCH) — async clear is
    // combinational, so rows with CLR=1 correctly force Q back to 0 even
    // during the snapshot sweep. What must NOT happen is D affecting Q: no
    // tick() ever runs during the sweep, so with CLR=0, Q must stay at its
    // live snapshot value (1) regardless of D, on every such row.
    const result = generateTruthTable([module], 1, graph);
    expect(result.hasSequentialElements).toBe(true);
    const clrColumnIndex = result.inputs.findIndex((c) => c.componentId === 3);
    for (const row of result.rows) {
      const clr = row.inputBits[clrColumnIndex][0];
      expect(row.outputBits[0][0]).toBe(clr === 1 ? 0 : 1);
    }
  });
});

describe('generateTruthTable: multi-bit input/output columns (rooted at a sub-circuit module)', () => {
  it('handles a wide INPUT_PIN/OUTPUT_PIN pair correctly', () => {
    const module: Module = {
      id: 2,
      name: 'Widener',
      isTopLevel: false,
      viewState: null,
      pins: [
        { id: 1, moduleId: 2, direction: 'in', bitWidth: 2, orderIndex: 0, name: 'IN', sourceComponentId: 1 },
        { id: 2, moduleId: 2, direction: 'out', bitWidth: 2, orderIndex: 1, name: 'OUT', sourceComponentId: 2 },
      ],
      components: [component(1, 'INPUT_PIN', { width: 2, value: 0 }), component(2, 'OUTPUT_PIN', { width: 2 })],
      nets: [net(1, 2)],
      wireSegments: [],
      pinConnections: [conn(1, 1, 1, 0, 'out'), conn(2, 1, 2, 0, 'in')],
    };

    const result = generateTruthTable([module], 2);
    expect(result.totalInputBits).toBe(2);
    expect(result.rows).toHaveLength(4);
    // A pass-through: OUTPUT_PIN's value must equal INPUT_PIN's value on every row.
    for (const row of result.rows) {
      expect(row.outputBits[0]).toEqual(row.inputBits[0]);
    }
  });
});

import { describe, it, expect } from 'vitest';
import type { Module, ComponentInstance, Net, PinConnection, ModulePin } from '@dcs/shared';
import { elaborate, wouldCreateCycle, CircularSubcircuitError } from './elaborate.js';
import { settle } from './evaluate.js';
import { tick } from './clock.js';

function component(
  id: number,
  type: ComponentInstance['type'],
  properties: Record<string, unknown> = {},
): ComponentInstance {
  return { id, moduleId: 0, type, x: 0, y: 0, rotation: 0, mirrored: false, properties };
}
function net(id: number, bitWidth = 1): Net {
  return { id, moduleId: 0, bitWidth, isBus: false };
}
function conn(id: number, netId: number, componentInstanceId: number, pinIndex: number, pinKind: 'in' | 'out'): PinConnection {
  return { id, netId, componentInstanceId, pinIndex, pinKind };
}
function pin(id: number, direction: 'in' | 'out', orderIndex: number, name: string, sourceComponentId: number): ModulePin {
  return { id, moduleId: 0, direction, bitWidth: 1, orderIndex, name, sourceComponentId };
}

/** A 1-bit full adder: INPUT_PIN A,B,Cin -> XOR/AND/OR gates -> OUTPUT_PIN Sum,Cout. */
function buildFullAdderModule(moduleId: number): Module {
  return {
    id: moduleId,
    name: 'Full Adder',
    isTopLevel: false,
    viewState: null,
    pins: [
      pin(1, 'in', 0, 'A', 1),
      pin(2, 'in', 1, 'B', 2),
      pin(3, 'in', 2, 'Cin', 3),
      pin(4, 'out', 3, 'Sum', 9),
      pin(5, 'out', 4, 'Cout', 10),
    ],
    components: [
      component(1, 'INPUT_PIN', { width: 1 }), // A
      component(2, 'INPUT_PIN', { width: 1 }), // B
      component(3, 'INPUT_PIN', { width: 1 }), // Cin
      component(4, 'XOR'), // A ^ B
      component(5, 'XOR'), // (A^B) ^ Cin = Sum
      component(6, 'AND'), // A & B
      component(7, 'AND'), // (A^B) & Cin
      component(8, 'OR'), // Cout
      component(9, 'OUTPUT_PIN', { width: 1 }), // Sum
      component(10, 'OUTPUT_PIN', { width: 1 }), // Cout
    ],
    nets: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => net(id)),
    wireSegments: [],
    pinConnections: [
      conn(1, 1, 1, 0, 'out'),
      conn(2, 1, 4, 0, 'in'),
      conn(3, 1, 6, 0, 'in'),
      conn(4, 2, 2, 0, 'out'),
      conn(5, 2, 4, 1, 'in'),
      conn(6, 2, 6, 1, 'in'),
      conn(7, 3, 3, 0, 'out'),
      conn(8, 3, 5, 1, 'in'),
      conn(9, 3, 7, 1, 'in'),
      conn(10, 4, 4, 0, 'out'),
      conn(11, 4, 5, 0, 'in'),
      conn(12, 4, 7, 0, 'in'),
      conn(13, 5, 5, 0, 'out'),
      conn(14, 5, 9, 0, 'in'),
      conn(15, 6, 6, 0, 'out'),
      conn(16, 6, 8, 0, 'in'),
      conn(17, 7, 7, 0, 'out'),
      conn(18, 7, 8, 1, 'in'),
      conn(19, 8, 8, 0, 'out'),
      conn(20, 8, 10, 0, 'in'),
    ],
  };
}

function subcircuitInstance(id: number, subcircuitModuleId: number): ComponentInstance {
  return component(id, 'SUBCIRCUIT', {
    subcircuitModuleId,
    pins: [
      { direction: 'in', width: 1 },
      { direction: 'in', width: 1 },
      { direction: 'in', width: 1 },
      { direction: 'out', width: 1 },
      { direction: 'out', width: 1 },
    ],
  });
}

describe('elaborate: 2-bit adder composed from two full-adder sub-circuit instances', () => {
  function build(a0: 0 | 1, b0: 0 | 1, a1: 0 | 1, b1: 0 | 1) {
    const fullAdder = buildFullAdderModule(2);
    const top: Module = {
      id: 1,
      name: 'main',
      isTopLevel: true,
      viewState: null,
      pins: [],
      components: [
        component(101, 'SWITCH', { value: a0 }),
        component(102, 'SWITCH', { value: b0 }),
        component(103, 'SWITCH', { value: 0 }), // carry-in for bit 0
        subcircuitInstance(104, 2), // FA0
        component(105, 'SWITCH', { value: a1 }),
        component(106, 'SWITCH', { value: b1 }),
        subcircuitInstance(107, 2), // FA1 — same module, independent instance
      ],
      nets: [101, 102, 103, 104, 105, 106, 107, 108].map((id) => net(id)),
      wireSegments: [],
      pinConnections: [
        conn(1, 101, 101, 0, 'out'),
        conn(2, 101, 104, 0, 'in'), // a0 -> FA0.A
        conn(3, 102, 102, 0, 'out'),
        conn(4, 102, 104, 1, 'in'), // b0 -> FA0.B
        conn(5, 103, 103, 0, 'out'),
        conn(6, 103, 104, 2, 'in'), // cin0 -> FA0.Cin
        conn(7, 104, 104, 0, 'out'), // FA0.Sum (output pin index 0; bit0 result net 104)
        conn(8, 105, 104, 1, 'out'), // FA0.Cout (output pin index 1)
        conn(9, 105, 107, 2, 'in'), // FA0.Cout -> FA1.Cin (the carry chain)
        conn(10, 106, 105, 0, 'out'),
        conn(11, 106, 107, 0, 'in'), // a1 -> FA1.A
        conn(12, 107, 106, 0, 'out'),
        conn(13, 107, 107, 1, 'in'), // b1 -> FA1.B
        conn(14, 108, 107, 0, 'out'), // FA1.Sum (output pin index 0; bit1 result net 108)
      ],
    };
    const g = elaborate([top, fullAdder], 1);
    settle(g);
    return g;
  }

  function bitAt(graph: ReturnType<typeof build>, netId: number) {
    return graph.nets.get(`n${netId}`)!.value.bits[0];
  }

  it('1 + 1 = 10 (sum0=0, carry into bit1, sum1=1)', () => {
    const g = build(1, 1, 0, 0);
    expect(bitAt(g, 104)).toBe(0); // sum0
    expect(bitAt(g, 108)).toBe(1); // sum1 (from the carry)
  });

  it('1 + 1 at bit1 too, with carry-in from bit0, produces 11 (bit1 sum=1, still carrying)', () => {
    const g = build(1, 1, 1, 1); // bit0: 1+1=0 carry 1; bit1: 1+1+1(carry)=1 carry 1
    expect(bitAt(g, 104)).toBe(0); // sum0
    expect(bitAt(g, 108)).toBe(1); // sum1
  });

  it('each SUBCIRCUIT instance gets independently namespaced internal nodes/nets', () => {
    const g = build(1, 0, 0, 1);
    const fa0InternalNet = g.nets.get('c104_n4'); // FA0's private A^B net
    const fa1InternalNet = g.nets.get('c107_n4'); // FA1's private A^B net
    expect(fa0InternalNet).toBeDefined();
    expect(fa1InternalNet).toBeDefined();
    expect(g.nodes.some((n) => n.id === 'c104_c4')).toBe(true); // FA0's XOR gate
    expect(g.nodes.some((n) => n.id === 'c107_c4')).toBe(true); // FA1's XOR gate, a distinct node
  });
});

describe('elaborate: per-instance state independence (sub-circuit containing a flip-flop)', () => {
  /** INPUT_PIN D, CLK, CLR -> D_FF -> OUTPUT_PIN Q. */
  function buildFlipFlopModule(moduleId: number): Module {
    return {
      id: moduleId,
      name: 'D Register Cell',
      isTopLevel: false,
      viewState: null,
      pins: [
        pin(1, 'in', 0, 'D', 1),
        pin(2, 'in', 1, 'CLK', 2),
        pin(3, 'in', 2, 'CLR', 3),
        pin(4, 'out', 3, 'Q', 5),
      ],
      components: [
        component(1, 'INPUT_PIN'),
        component(2, 'INPUT_PIN'),
        component(3, 'INPUT_PIN'),
        component(4, 'D_FF'),
        component(5, 'OUTPUT_PIN'),
      ],
      nets: [1, 2, 3, 4].map((id) => net(id)),
      wireSegments: [],
      pinConnections: [
        conn(1, 1, 1, 0, 'out'),
        conn(2, 1, 4, 0, 'in'), // D
        conn(3, 2, 2, 0, 'out'),
        conn(4, 2, 4, 1, 'in'), // CLK
        conn(5, 3, 3, 0, 'out'),
        conn(6, 3, 4, 2, 'in'), // CLR
        conn(7, 4, 4, 0, 'out'),
        conn(8, 4, 5, 0, 'in'), // Q
      ],
    };
  }

  function ffSubcircuitInstance(id: number, moduleId: number): ComponentInstance {
    return component(id, 'SUBCIRCUIT', {
      subcircuitModuleId: moduleId,
      pins: [
        { direction: 'in', width: 1 },
        { direction: 'in', width: 1 },
        { direction: 'in', width: 1 },
        { direction: 'out', width: 1 },
      ],
    });
  }

  it('two instances of the same flip-flop sub-circuit hold independent Q state', () => {
    const ffModule = buildFlipFlopModule(2);
    const top: Module = {
      id: 1,
      name: 'main',
      isTopLevel: true,
      viewState: null,
      pins: [],
      components: [
        component(101, 'SWITCH', { value: 1 }), // d1
        component(102, 'CLOCK', { level: 0 }), // clk1
        component(103, 'SWITCH', { value: 0 }), // clr1
        ffSubcircuitInstance(104, 2), // FF instance 1
        component(105, 'SWITCH', { value: 0 }), // d2
        component(106, 'CLOCK', { level: 0 }), // clk2 — independent clock
        component(107, 'SWITCH', { value: 0 }), // clr2
        ffSubcircuitInstance(108, 2), // FF instance 2 — same module
      ],
      nets: [101, 102, 103, 105, 106, 107].map((id) => net(id)),
      wireSegments: [],
      pinConnections: [
        conn(1, 101, 101, 0, 'out'),
        conn(2, 101, 104, 0, 'in'),
        conn(3, 102, 102, 0, 'out'),
        conn(4, 102, 104, 1, 'in'),
        conn(5, 103, 103, 0, 'out'),
        conn(6, 103, 104, 2, 'in'),
        conn(7, 105, 105, 0, 'out'),
        conn(8, 105, 108, 0, 'in'),
        conn(9, 106, 106, 0, 'out'),
        conn(10, 106, 108, 1, 'in'),
        conn(11, 107, 107, 0, 'out'),
        conn(12, 107, 108, 2, 'in'),
      ],
    };

    let g = elaborate([top, ffModule], 1);
    tick(g); // establish clk=0 baseline for both instances

    function setSwitchByComponent(componentId: number, key: string, value: number) {
      const c = top.components.find((c) => c.id === componentId)!;
      c.properties = { ...c.properties, [key]: value };
    }

    // Toggle only clock 1 -> only FF instance 1 should latch D=1.
    setSwitchByComponent(102, 'level', 1);
    g = elaborate([top, ffModule], 1, g);
    tick(g);

    const q1 = g.nets.get('c104_n4')!.value.bits[0]; // FF1's Q net (overridden alias == top's Q net for instance 1, but here it's dangling/unconnected in top, so check the internal marker's driving net)
    const q2 = g.nets.get('c108_n4')!.value.bits[0];
    expect(q1).toBe(1); // instance 1 latched
    expect(q2).toBe('X'); // instance 2 untouched — never clocked, still undefined

    // Now toggle instance 2's clock — instance 1 must remain unaffected.
    setSwitchByComponent(106, 'level', 1);
    g = elaborate([top, ffModule], 1, g);
    tick(g);

    expect(g.nets.get('c104_n4')!.value.bits[0]).toBe(1); // instance 1 still holds its Q
    expect(g.nets.get('c108_n4')!.value.bits[0]).toBe(0); // instance 2 now latched its own D (0)
  });
});

describe('cycle detection', () => {
  it('wouldCreateCycle flags direct self-reference', () => {
    const modules: Module[] = [buildFullAdderModule(1)];
    expect(wouldCreateCycle(modules, 1, 1)).toBe(true);
  });

  it('wouldCreateCycle flags indirect cycles (A contains B, B would contain A)', () => {
    const a = buildFullAdderModule(1);
    const b: Module = { ...buildFullAdderModule(2), components: [...buildFullAdderModule(2).components, subcircuitInstance(999, 1)] };
    expect(wouldCreateCycle([a, b], 2, 1)).toBe(false); // b already contains a; instantiating a inside b is fine on its own...
    // ...but instantiating b inside a (given b already contains a) would be circular:
    expect(wouldCreateCycle([a, b], 1, 2)).toBe(true);
  });

  it('elaborate() throws CircularSubcircuitError as a runtime backstop', () => {
    const a: Module = { ...buildFullAdderModule(1), components: [component(999, 'SUBCIRCUIT', { subcircuitModuleId: 1, pins: [] })] };
    expect(() => elaborate([a], 1)).toThrow(CircularSubcircuitError);
  });
});

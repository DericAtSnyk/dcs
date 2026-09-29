import { describe, it, expect } from 'vitest';
import type { SimGraph, SimNet, SimNode } from '../types.js';
import { settle } from '../simulation/evaluate.js';
import { tick } from '../simulation/clock.js';
import { allX } from './bitLogic.js';

function net(id: string, bitWidth = 1): SimNet {
  return { id, bitWidth, value: allX(bitWidth) };
}
function graph(nodes: SimNode[], nets: SimNet[]): SimGraph {
  return { nodes, nets: new Map(nets.map((n) => [n.id, n])) };
}
function setProp(g: SimGraph, id: string, properties: Record<string, unknown>) {
  const node = g.nodes.find((n) => n.id === id)!;
  node.properties = { ...node.properties, ...properties };
}

describe('MUX (4-to-1)', () => {
  function buildMux() {
    return graph(
      [
        { id: 'd0', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['d0'] },
        { id: 'd1', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['d1'] },
        { id: 'd2', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['d2'] },
        { id: 'd3', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['d3'] },
        { id: 's0', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['s0'] },
        { id: 's1', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['s1'] },
        {
          id: 'mux',
          type: 'MUX',
          properties: { selectBits: 2 },
          inputNets: ['d0', 'd1', 'd2', 'd3', 's0', 's1'],
          outputNets: ['out'],
        },
      ],
      ['d0', 'd1', 'd2', 'd3', 's0', 's1', 'out'].map((id) => net(id)),
    );
  }

  it('selects the data input addressed by S1:S0 (LSB-first)', () => {
    const g = buildMux();
    settle(g);
    expect(g.nets.get('out')!.value.bits[0]).toBe(0); // select=00 -> d0

    setProp(g, 's0', { value: 1 }); // select=01 -> d1
    settle(g);
    expect(g.nets.get('out')!.value.bits[0]).toBe(1);

    setProp(g, 's0', { value: 0 });
    setProp(g, 's1', { value: 1 }); // select=10 -> d2
    settle(g);
    expect(g.nets.get('out')!.value.bits[0]).toBe(0);

    setProp(g, 's0', { value: 1 }); // select=11 -> d3
    settle(g);
    expect(g.nets.get('out')!.value.bits[0]).toBe(1);
  });
});

describe('DEMUX', () => {
  it('routes data to the selected output, holding all others at 0', () => {
    const g = graph(
      [
        { id: 'd', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['d'] },
        { id: 's0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['s0'] },
        { id: 's1', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['s1'] },
        {
          id: 'demux',
          type: 'DEMUX',
          properties: { selectBits: 2 },
          inputNets: ['d', 's0', 's1'],
          outputNets: ['o0', 'o1', 'o2', 'o3'],
        },
      ],
      ['d', 's0', 's1', 'o0', 'o1', 'o2', 'o3'].map((id) => net(id)),
    );
    settle(g);
    expect([0, 1, 2, 3].map((i) => g.nets.get(`o${i}`)!.value.bits[0])).toEqual([0, 1, 0, 0]);
  });
});

describe('ENCODER (priority)', () => {
  it('outputs the binary index of the highest-priority active input', () => {
    const g = graph(
      [
        { id: 'i0', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['i0'] },
        { id: 'i1', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['i1'] },
        { id: 'i2', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['i2'] },
        { id: 'i3', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['i3'] },
        { id: 'enc', type: 'ENCODER', properties: { selectBits: 2 }, inputNets: ['i0', 'i1', 'i2', 'i3'], outputNets: ['o0', 'o1'] },
      ],
      ['i0', 'i1', 'i2', 'i3', 'o0', 'o1'].map((id) => net(id)),
    );
    settle(g);
    // input 2 (binary 10) is the highest-index active input, despite i1 also being 1.
    expect([g.nets.get('o0')!.value.bits[0], g.nets.get('o1')!.value.bits[0]]).toEqual([0, 1]);
  });

  it('outputs X when no input is active', () => {
    const g = graph(
      [
        { id: 'i0', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['i0'] },
        { id: 'i1', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['i1'] },
        { id: 'i2', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['i2'] },
        { id: 'i3', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['i3'] },
        { id: 'enc', type: 'ENCODER', properties: { selectBits: 2 }, inputNets: ['i0', 'i1', 'i2', 'i3'], outputNets: ['o0', 'o1'] },
      ],
      ['i0', 'i1', 'i2', 'i3', 'o0', 'o1'].map((id) => net(id)),
    );
    settle(g);
    expect(g.nets.get('o0')!.value.bits[0]).toBe('X');
  });
});

describe('DECODER', () => {
  it('activates exactly the output addressed by the binary input', () => {
    const g = graph(
      [
        { id: 's0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['s0'] },
        { id: 's1', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['s1'] },
        { id: 'dec', type: 'DECODER', properties: { selectBits: 2 }, inputNets: ['s0', 's1'], outputNets: ['o0', 'o1', 'o2', 'o3'] },
      ],
      ['s0', 's1', 'o0', 'o1', 'o2', 'o3'].map((id) => net(id)),
    );
    settle(g);
    expect([0, 1, 2, 3].map((i) => g.nets.get(`o${i}`)!.value.bits[0])).toEqual([0, 0, 0, 1]); // 11 = index 3
  });
});

describe('ADDER (ripple-carry, 4-bit)', () => {
  function build(aVal: number, bVal: number, cin: 0 | 1) {
    // A/B are set directly as literal nets (rather than via SWITCH sources)
    // since they need to carry a multi-bit value in one shot.
    const bits = (v: number) => Array.from({ length: 4 }, (_, i) => (((v >> i) & 1) as 0 | 1));
    const g = graph(
      [{ id: 'adder', type: 'ADDER', properties: { width: 4 }, inputNets: ['a', 'b', 'cin'], outputNets: ['sum', 'cout'] }],
      [
        { id: 'a', bitWidth: 4, value: { width: 4, bits: bits(aVal) } },
        { id: 'b', bitWidth: 4, value: { width: 4, bits: bits(bVal) } },
        { id: 'cin', bitWidth: 1, value: { width: 1, bits: [cin] } },
        net('sum', 4),
        net('cout', 1),
      ],
    );
    settle(g);
    return g;
  }

  function toNumber(bits: (0 | 1 | 'X')[]): number {
    return bits.reduce<number>((acc, b, i) => acc + (b === 1 ? 1 << i : 0), 0);
  }

  it('adds two 4-bit values with carry-in, producing sum and carry-out', () => {
    const g = build(5, 3, 0); // 5 + 3 = 8
    expect(toNumber(g.nets.get('sum')!.value.bits)).toBe(8);
    expect(g.nets.get('cout')!.value.bits[0]).toBe(0);
  });

  it('overflows correctly, setting carry-out', () => {
    const g = build(15, 1, 0); // 15 + 1 = 16 -> wraps to 0 with carry
    expect(toNumber(g.nets.get('sum')!.value.bits)).toBe(0);
    expect(g.nets.get('cout')!.value.bits[0]).toBe(1);
  });

  it('includes carry-in in the sum', () => {
    const g = build(1, 1, 1); // 1 + 1 + 1 = 3
    expect(toNumber(g.nets.get('sum')!.value.bits)).toBe(3);
  });
});

describe('REGISTER (edge-triggered, bus-width)', () => {
  it('latches a 4-bit D value on a clock rising edge and holds otherwise', () => {
    const g = graph(
      [
        { id: 'clk', type: 'CLOCK', properties: { level: 0 }, inputNets: [], outputNets: ['clkNet'] },
        { id: 'clr', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['clrNet'] },
        { id: 'reg', type: 'REGISTER', properties: { width: 4 }, inputNets: ['d', 'clkNet', 'clrNet'], outputNets: ['q'] },
      ],
      [{ id: 'd', bitWidth: 4, value: { width: 4, bits: [1, 0, 1, 1] } }, net('clkNet'), net('clrNet'), net('q', 4)],
    );
    tick(g); // baseline
    expect(g.nets.get('q')!.value.bits).toEqual(['X', 'X', 'X', 'X']);

    setProp(g, 'clk', { level: 1 });
    tick(g);
    expect(g.nets.get('q')!.value.bits).toEqual([1, 0, 1, 1]);

    // D changing without a new clock edge must not affect Q.
    g.nets.get('d')!.value = { width: 4, bits: [0, 0, 0, 0] };
    tick(g);
    expect(g.nets.get('q')!.value.bits).toEqual([1, 0, 1, 1]);
  });
});

describe('COUNTER (4-bit, Phase 8 target circuit)', () => {
  it('increments by 1 on each clock rising edge and wraps at 16, async clear resets to 0', () => {
    const g = graph(
      [
        { id: 'clk', type: 'CLOCK', properties: { level: 0 }, inputNets: [], outputNets: ['clkNet'] },
        { id: 'clr', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['clrNet'] },
        { id: 'counter', type: 'COUNTER', properties: { width: 4 }, inputNets: ['clkNet', 'clrNet'], outputNets: ['q'] },
      ],
      [net('clkNet'), net('clrNet'), net('q', 4)],
    );
    tick(g); // clear asserted -> starts at 0
    expect(g.nets.get('q')!.value.bits).toEqual([0, 0, 0, 0]);
    setProp(g, 'clr', { value: 0 });
    tick(g);

    const toNumber = (bits: (0 | 1 | 'X')[]) => bits.reduce<number>((acc, b, i) => acc + (b === 1 ? 1 << i : 0), 0);
    const counts: number[] = [];
    for (let i = 0; i < 17; i++) {
      setProp(g, 'clk', { level: 1 });
      tick(g);
      counts.push(toNumber(g.nets.get('q')!.value.bits));
      setProp(g, 'clk', { level: 0 });
      tick(g);
    }
    expect(counts.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(counts[14]).toBe(15); // last value before wraparound
    expect(counts[15]).toBe(0); // wraps 15 -> 0
    expect(counts[16]).toBe(1);
  });
});

describe('BCD_DECODER + SEVEN_SEG chain (Phase 8 target circuit)', () => {
  it('maps BCD digits 0-9 to the correct 7-segment pattern, and blanks invalid codes', () => {
    const g = graph(
      [{ id: 'dec', type: 'BCD_DECODER', properties: {}, inputNets: ['bcd'], outputNets: ['seg'] }],
      [{ id: 'bcd', bitWidth: 4, value: { width: 4, bits: [0, 0, 0, 0] } }, net('seg', 7)],
    );

    function segmentsFor(digit: number) {
      const bits = Array.from({ length: 4 }, (_, i) => (((digit >> i) & 1) as 0 | 1));
      g.nets.get('bcd')!.value = { width: 4, bits };
      settle(g);
      return g.nets.get('seg')!.value.bits;
    }

    expect(segmentsFor(0)).toEqual([1, 1, 1, 1, 1, 1, 0]);
    expect(segmentsFor(8)).toEqual([1, 1, 1, 1, 1, 1, 1]); // all segments lit
    expect(segmentsFor(1)).toEqual([0, 1, 1, 0, 0, 0, 0]); // just the two right-side segments

    // Codes 10-15 are invalid BCD — blank the display rather than showing garbage.
    expect(segmentsFor(12)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

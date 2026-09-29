import { describe, it, expect } from 'vitest';
import type { SimGraph, SimNet, SimNode } from '../types.js';
import { settle } from '../simulation/evaluate.js';
import { allX } from './bitLogic.js';

function net(id: string, bitWidth = 1): SimNet {
  return { id, bitWidth, value: allX(bitWidth) };
}

function graph(nodes: SimNode[], nets: SimNet[]): SimGraph {
  return { nodes, nets: new Map(nets.map((n) => [n.id, n])) };
}

describe('MERGER / SPLITTER round-trip', () => {
  it('four switches -> 4-bit merger -> splitter -> four LEDs preserves each bit', () => {
    // switch i -> merger input i; merger output (bus) -> splitter input; splitter output i -> led i
    const switches = [1, 0, 1, 1]; // LSB-first: switch0=bit0 ... switch3=bit3
    const g = graph(
      [
        ...switches.map((v, i) => ({
          id: `sw${i}`,
          type: 'SWITCH' as const,
          properties: { value: v },
          inputNets: [],
          outputNets: [`s${i}`],
        })),
        {
          id: 'merger',
          type: 'MERGER',
          properties: { width: 4 },
          inputNets: ['s0', 's1', 's2', 's3'],
          outputNets: ['bus'],
        },
        {
          id: 'splitter',
          type: 'SPLITTER',
          properties: { width: 4 },
          inputNets: ['bus'],
          outputNets: ['o0', 'o1', 'o2', 'o3'],
        },
        ...[0, 1, 2, 3].map((i) => ({
          id: `led${i}`,
          type: 'LED' as const,
          properties: {},
          inputNets: [`o${i}`],
          outputNets: [],
        })),
      ],
      [
        net('s0'),
        net('s1'),
        net('s2'),
        net('s3'),
        net('bus', 4),
        net('o0'),
        net('o1'),
        net('o2'),
        net('o3'),
      ],
    );

    const result = settle(g);
    expect(result.settled).toBe(true);
    expect(g.nets.get('bus')!.value.bits).toEqual([1, 0, 1, 1]);
    switches.forEach((v, i) => {
      expect(g.nets.get(`o${i}`)!.value.bits[0]).toBe(v);
    });
  });

  it('an unconnected merger input contributes X to that bit of the bus, without poisoning the others', () => {
    const g = graph(
      [
        { id: 'sw0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['s0'] },
        {
          id: 'merger',
          type: 'MERGER',
          properties: { width: 2 },
          inputNets: ['s0', null],
          outputNets: ['bus'],
        },
      ],
      [net('s0'), net('bus', 2)],
    );
    settle(g);
    expect(g.nets.get('bus')!.value.bits).toEqual([1, 'X']);
  });
});

import { describe, it, expect } from 'vitest';
import type { SimGraph, SimNet, SimNode } from '../types.js';
import { settle } from '../simulation/evaluate.js';
import { allX } from './bitLogic.js';
import type { ComponentType } from '@dcs/shared';

function net(id: string): SimNet {
  return { id, bitWidth: 1, value: allX(1) };
}

function twoInputGateOutput(type: ComponentType, a: 0 | 1, b: 0 | 1): 0 | 1 | 'X' {
  const nodes: SimNode[] = [
    { id: 'a', type: 'SWITCH', properties: { value: a }, inputNets: [], outputNets: ['a'] },
    { id: 'b', type: 'SWITCH', properties: { value: b }, inputNets: [], outputNets: ['b'] },
    { id: 'g', type, properties: {}, inputNets: ['a', 'b'], outputNets: ['out'] },
  ];
  const g: SimGraph = { nodes, nets: new Map([net('a'), net('b'), net('out')].map((n) => [n.id, n])) };
  settle(g);
  return g.nets.get('out')!.value.bits[0];
}

describe('NAND/NOR/XOR/XNOR truth tables', () => {
  it('NAND', () => {
    expect(twoInputGateOutput('NAND', 0, 0)).toBe(1);
    expect(twoInputGateOutput('NAND', 1, 0)).toBe(1);
    expect(twoInputGateOutput('NAND', 1, 1)).toBe(0);
  });

  it('NOR', () => {
    expect(twoInputGateOutput('NOR', 0, 0)).toBe(1);
    expect(twoInputGateOutput('NOR', 1, 0)).toBe(0);
    expect(twoInputGateOutput('NOR', 1, 1)).toBe(0);
  });

  it('XOR', () => {
    expect(twoInputGateOutput('XOR', 0, 0)).toBe(0);
    expect(twoInputGateOutput('XOR', 1, 0)).toBe(1);
    expect(twoInputGateOutput('XOR', 1, 1)).toBe(0);
  });

  it('XNOR', () => {
    expect(twoInputGateOutput('XNOR', 0, 0)).toBe(1);
    expect(twoInputGateOutput('XNOR', 1, 0)).toBe(0);
    expect(twoInputGateOutput('XNOR', 1, 1)).toBe(1);
  });
});

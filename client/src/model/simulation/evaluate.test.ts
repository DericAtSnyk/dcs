import { describe, it, expect } from 'vitest';
import type { SimGraph, SimNet, SimNode } from '../types.js';
import { settle } from './evaluate.js';
import { allX, singleBit } from '../components/bitLogic.js';

function net(id: string, bitWidth = 1): SimNet {
  return { id, bitWidth, value: allX(bitWidth) };
}

function graph(nodes: SimNode[], nets: SimNet[]): SimGraph {
  return { nodes, nets: new Map(nets.map((n) => [n.id, n])) };
}

function value(g: SimGraph, netId: string) {
  return g.nets.get(netId)!.value.bits[0];
}

describe('gate truth tables', () => {
  it('AND: only 1 when all inputs are 1', () => {
    const g = graph(
      [
        { id: 'sw0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['a'] },
        { id: 'sw1', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['b'] },
        { id: 'g', type: 'AND', properties: {}, inputNets: ['a', 'b'], outputNets: ['out'] },
      ],
      [net('a'), net('b'), net('out')],
    );
    settle(g);
    expect(value(g, 'out')).toBe(0);
  });

  it('OR with an unconnected (floating/X) input still resolves to 1 when the other input is 1', () => {
    const g = graph(
      [
        { id: 'sw0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['a'] },
        { id: 'g', type: 'OR', properties: {}, inputNets: ['a', null], outputNets: ['out'] },
      ],
      [net('a'), net('out')],
    );
    settle(g);
    expect(value(g, 'out')).toBe(1);
  });

  it('NOT inverts', () => {
    const g = graph(
      [
        { id: 'sw0', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['a'] },
        { id: 'g', type: 'NOT', properties: {}, inputNets: ['a'], outputNets: ['out'] },
      ],
      [net('a'), net('out')],
    );
    settle(g);
    expect(value(g, 'out')).toBe(1);
  });

  it('AND respects configurable input count (4-input)', () => {
    const g = graph(
      [
        { id: 'sw0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['a'] },
        { id: 'sw1', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['b'] },
        { id: 'sw2', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['c'] },
        { id: 'sw3', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['d'] },
        {
          id: 'g',
          type: 'AND',
          properties: { inputCount: 4 },
          inputNets: ['a', 'b', 'c', 'd'],
          outputNets: ['out'],
        },
      ],
      [net('a'), net('b'), net('c'), net('d'), net('out')],
    );
    settle(g);
    expect(value(g, 'out')).toBe(1);
  });
});

describe('switch -> AND -> LED integration (Phase 3 target circuit)', () => {
  it('propagates switch states through an AND gate to an LED-driving net', () => {
    const g = graph(
      [
        { id: 'sw0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['a'] },
        { id: 'sw1', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['b'] },
        { id: 'and', type: 'AND', properties: {}, inputNets: ['a', 'b'], outputNets: ['out'] },
        { id: 'led', type: 'LED', properties: {}, inputNets: ['out'], outputNets: [] },
      ],
      [net('a'), net('b'), net('out')],
    );
    const result = settle(g);
    expect(result.settled).toBe(true);
    expect(value(g, 'out')).toBe(1);
  });
});

describe('feedback loops', () => {
  it('converges an AND-OR-NOT gate-built SR latch to the expected Set/Reset/Hold values', () => {
    // Q = OR(S, AND(Q, NOT(R)))  -- classic latch equation, feedback via net "q"
    const g = graph(
      [
        { id: 'swS', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['s'] },
        { id: 'swR', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['r'] },
        { id: 'notR', type: 'NOT', properties: {}, inputNets: ['r'], outputNets: ['notR'] },
        { id: 'and', type: 'AND', properties: {}, inputNets: ['q', 'notR'], outputNets: ['a'] },
        { id: 'or', type: 'OR', properties: {}, inputNets: ['s', 'a'], outputNets: ['q'] },
      ],
      [net('s'), net('r'), net('notR'), net('a'), net('q')],
    );

    // Set (S=1, R=0): should converge to Q=1.
    const setResult = settle(g);
    expect(setResult.settled).toBe(true);
    expect(value(g, 'q')).toBe(1);

    // Hold (S=0, R=0): feedback should retain the previously latched Q=1.
    (g.nodes.find((n) => n.id === 'swS')!.properties as { value: number }).value = 0;
    const holdResult = settle(g);
    expect(holdResult.settled).toBe(true);
    expect(value(g, 'q')).toBe(1);

    // Reset (S=0, R=1): should drive Q back to 0.
    (g.nodes.find((n) => n.id === 'swR')!.properties as { value: number }).value = 1;
    const resetResult = settle(g);
    expect(resetResult.settled).toBe(true);
    expect(value(g, 'q')).toBe(0);
  });

  it('falls back to X (not an infinite loop or crash) for a combinational oscillation', () => {
    // A single inverter feeding back into its own input (odd-inversion ring
    // oscillator) has no fixed point once seeded with a determinate value.
    const loopNet = net('loop');
    loopNet.value = singleBit(1); // seed with a committed value, as if from a prior settle
    const g = graph(
      [{ id: 'inv', type: 'NOT', properties: {}, inputNets: ['loop'], outputNets: ['loop'] }],
      [loopNet],
    );

    const result = settle(g, 64);

    expect(result.settled).toBe(false);
    expect(result.unresolvedNets).toEqual(['loop']);
    expect(value(g, 'loop')).toBe('X');
  });
});

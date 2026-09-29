import { describe, it, expect } from 'vitest';
import type { SimGraph, SimNet, SimNode } from '../types.js';
import { tick } from './clock.js';
import { allX } from '../components/bitLogic.js';

function net(id: string): SimNet {
  return { id, bitWidth: 1, value: allX(1) };
}

function graph(nodes: SimNode[], netIds: string[]): SimGraph {
  return { nodes, nets: new Map(netIds.map((id) => [id, net(id)])) };
}

function setSwitch(g: SimGraph, id: string, value: 0 | 1) {
  const node = g.nodes.find((n) => n.id === id)!;
  // CLOCK sources read `level`; every other source here (SWITCH) reads `value`.
  const key = node.type === 'CLOCK' ? 'level' : 'value';
  node.properties = { ...node.properties, [key]: value };
}

function q(g: SimGraph, ffId: string): 0 | 1 | 'X' {
  const ff = g.nodes.find((n) => n.id === ffId)!;
  const outputNet = ff.outputNets[0]!;
  return g.nets.get(outputNet)!.value.bits[0];
}

describe('D_FF: edge-triggered, async clear', () => {
  function buildDFF(): SimGraph {
    return graph(
      [
        { id: 'd', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['dNet'] },
        { id: 'clk', type: 'CLOCK', properties: { level: 0 }, inputNets: [], outputNets: ['clkNet'] },
        { id: 'clr', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['clrNet'] },
        { id: 'ff', type: 'D_FF', properties: {}, inputNets: ['dNet', 'clkNet', 'clrNet'], outputNets: ['q'] },
      ],
      ['dNet', 'clkNet', 'clrNet', 'q'],
    );
  }

  it('only latches D on a clock rising edge, ignoring D changes at other times', () => {
    const g = buildDFF();
    tick(g); // establish baseline (clk=0), Q still X (never clocked)
    expect(q(g, 'ff')).toBe('X');

    setSwitch(g, 'd', 1);
    tick(g); // D changes but clock hasn't moved -> no edge -> Q must NOT change
    expect(q(g, 'ff')).toBe('X');

    setSwitch(g, 'clk', 1);
    tick(g); // 0->1 rising edge: latches D=1
    expect(q(g, 'ff')).toBe(1);

    setSwitch(g, 'd', 0);
    tick(g); // D changes while clock stays at 1 -> no new edge -> Q holds
    expect(q(g, 'ff')).toBe(1);

    setSwitch(g, 'clk', 0);
    tick(g); // falling edge -> Q must NOT change on a falling edge
    expect(q(g, 'ff')).toBe(1);

    setSwitch(g, 'clk', 1);
    tick(g); // next rising edge: latches the now-0 D
    expect(q(g, 'ff')).toBe(0);
  });

  it('asynchronous clear forces Q to 0 immediately, regardless of clock phase', () => {
    const g = buildDFF();
    tick(g); // establish clk=0 baseline so the next 0->1 transition is a real edge
    setSwitch(g, 'd', 1);
    setSwitch(g, 'clk', 1);
    tick(g);
    expect(q(g, 'ff')).toBe(1);

    // Clock stays HIGH (mid-phase, not an edge) — clear must still work.
    setSwitch(g, 'clr', 1);
    tick(g);
    expect(q(g, 'ff')).toBe(0);

    // A rising edge while clear is asserted must not un-clear via D.
    setSwitch(g, 'clk', 0);
    tick(g);
    setSwitch(g, 'clk', 1);
    tick(g);
    expect(q(g, 'ff')).toBe(0);

    // Releasing clear resumes normal clocked behavior from 0.
    setSwitch(g, 'clr', 0);
    setSwitch(g, 'clk', 0);
    tick(g);
    setSwitch(g, 'clk', 1);
    tick(g);
    expect(q(g, 'ff')).toBe(1); // D is still 1 from before
  });
});

describe('JK toggle flip-flop and 2-bit ripple counter (Phase 6 target circuit)', () => {
  it('a JK_FF wired J=K=1 toggles on every rising edge', () => {
    const g = graph(
      [
        { id: 'j', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['jNet'] },
        { id: 'k', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['kNet'] },
        { id: 'clk', type: 'CLOCK', properties: { level: 0 }, inputNets: [], outputNets: ['clkNet'] },
        { id: 'clr', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['clrNet'] },
        { id: 'ff', type: 'JK_FF', properties: {}, inputNets: ['jNet', 'kNet', 'clkNet', 'clrNet'], outputNets: ['q'] },
      ],
      ['jNet', 'kNet', 'clkNet', 'clrNet', 'q'],
    );
    tick(g); // clr=1 asserted -> Q=0 known starting state
    expect(q(g, 'ff')).toBe(0);
    setSwitch(g, 'clr', 0);
    tick(g);

    const observed: (0 | 1 | 'X')[] = [];
    for (let i = 0; i < 4; i++) {
      setSwitch(g, 'clk', 1);
      tick(g); // rising edge
      observed.push(q(g, 'ff'));
      setSwitch(g, 'clk', 0);
      tick(g); // falling edge — must not toggle again
    }
    expect(observed).toEqual([1, 0, 1, 0]);
  });

  it('two toggle JK_FFs chained (FF0.Q -> FF1.CLK) ripple-count within a single tick per main edge', () => {
    const g = graph(
      [
        { id: 'j0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['j0'] },
        { id: 'k0', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['k0'] },
        { id: 'j1', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['j1'] },
        { id: 'k1', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['k1'] },
        { id: 'clk', type: 'CLOCK', properties: { level: 0 }, inputNets: [], outputNets: ['clkNet'] },
        { id: 'clr', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['clrNet'] },
        { id: 'ff0', type: 'JK_FF', properties: {}, inputNets: ['j0', 'k0', 'clkNet', 'clrNet'], outputNets: ['q0'] },
        { id: 'ff1', type: 'JK_FF', properties: {}, inputNets: ['j1', 'k1', 'q0', 'clrNet'], outputNets: ['q1'] },
      ],
      ['j0', 'k0', 'j1', 'k1', 'clkNet', 'clrNet', 'q0', 'q1'],
    );
    tick(g); // clear -> both bits start at 0
    setSwitch(g, 'clr', 0);
    tick(g);

    const counts: number[] = [];
    for (let i = 0; i < 4; i++) {
      setSwitch(g, 'clk', 1);
      tick(g);
      counts.push(Number(q(g, 'ff1')) * 2 + Number(q(g, 'ff0')));
      setSwitch(g, 'clk', 0);
      tick(g);
    }
    // Chaining Q (not Q-bar) into the next stage's clock, with rising-edge
    // triggered flip-flops, produces a down-counter — a real, well-known
    // ripple-counter characteristic, not a simulation artifact: ff0 toggles
    // every main edge (1,0,1,0); ff1 only toggles when ff0's Q *rises*
    // (edges 1 and 3), and that rise must ripple through within the same
    // tick() under our zero-delay model, which is exactly what this proves.
    expect(counts).toEqual([3, 2, 1, 0]);
  });
});

describe('level-sensitive latches', () => {
  it('D_LATCH is transparent while enabled and holds when disabled', () => {
    const g = graph(
      [
        { id: 'd', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['dNet'] },
        { id: 'en', type: 'SWITCH', properties: { value: 1 }, inputNets: [], outputNets: ['enNet'] },
        { id: 'clr', type: 'SWITCH', properties: { value: 0 }, inputNets: [], outputNets: ['clrNet'] },
        { id: 'latch', type: 'D_LATCH', properties: {}, inputNets: ['dNet', 'enNet', 'clrNet'], outputNets: ['q'] },
      ],
      ['dNet', 'enNet', 'clrNet', 'q'],
    );
    setSwitch(g, 'd', 1);
    tick(g);
    expect(q(g, 'latch')).toBe(1); // transparent: follows D while enabled

    setSwitch(g, 'en', 0);
    tick(g);
    setSwitch(g, 'd', 0);
    tick(g);
    expect(q(g, 'latch')).toBe(1); // holds last value once disabled, ignores new D
  });
});

import type { SignalValue } from '@dcs/shared';
import type { NetId, NodeId, SimGraph, SettleResult } from '../types.js';
import { getComponentDefinition } from '../components/registry.js';
import { allX, bitsEqual } from '../components/bitLogic.js';

interface World {
  nets: Map<NetId, SignalValue>;
  /** Only populated for nodes whose component definition sets `clocking`. */
  nodeStates: Map<NodeId, SignalValue[]>;
}

function snapshotWorld(graph: SimGraph): World {
  const nets = new Map<NetId, SignalValue>();
  for (const [id, net] of graph.nets) nets.set(id, net.value);

  const nodeStates = new Map<NodeId, SignalValue[]>();
  for (const node of graph.nodes) {
    if (node.state) nodeStates.set(node.id, node.state);
  }
  return { nets, nodeStates };
}

function defaultState(layout: { outputs: { width: number }[] }): SignalValue[] {
  return layout.outputs.map((o) => allX(o.width));
}

/**
 * One synchronous pass: every node reads exclusively from `current`
 * (the previous iteration's committed values) so evaluation order among
 * nodes never affects the result — required for the Kleene fixed-point
 * convergence guarantee described in the plan. Stateful components (flip-
 * flops, latches) participate the same way: their prior `state` is read
 * from `current.nodeStates` and this pass's output becomes the candidate
 * next state, so memory settles to a fixed point exactly like a net does.
 */
function computePass(graph: SimGraph, current: World): World {
  const nextNets = new Map<NetId, SignalValue>();
  for (const [id, net] of graph.nets) {
    nextNets.set(id, current.nets.get(id) ?? allX(net.bitWidth));
  }
  const nextNodeStates = new Map(current.nodeStates);

  for (const node of graph.nodes) {
    const definition = getComponentDefinition(node.type);
    const layout = definition.getPinLayout(node.properties);
    const inputValues = node.inputNets.map((netId, i) => {
      const width = layout.inputs[i]?.width ?? 1;
      if (netId == null) return allX(width);
      return current.nets.get(netId) ?? allX(width);
    });
    const priorState = definition.clocking ? (current.nodeStates.get(node.id) ?? defaultState(layout)) : undefined;
    const outputs = definition.evaluate(inputValues, node.properties, priorState);
    node.outputNets.forEach((netId, i) => {
      if (netId != null && outputs[i]) nextNets.set(netId, outputs[i]);
    });
    if (definition.clocking) nextNodeStates.set(node.id, outputs);
  }

  return { nets: nextNets, nodeStates: nextNodeStates };
}

function worldChanged(a: World, b: World): boolean {
  for (const [id, value] of b.nets) {
    if (!bitsEqual(value, a.nets.get(id)!)) return true;
  }
  for (const [id, value] of b.nodeStates) {
    const prior = a.nodeStates.get(id);
    if (!prior || value.some((sig, i) => !bitsEqual(sig, prior[i]))) return true;
  }
  return false;
}

function commit(graph: SimGraph, world: World): void {
  for (const [id, value] of world.nets) {
    graph.nets.get(id)!.value = value;
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const [id, state] of world.nodeStates) {
    nodeById.get(id)!.state = state;
  }
}

/**
 * Zero-delay combinational settle: iterates full synchronous passes until no
 * net's value (or stateful node's state) changes (fixed point). Values
 * persist across calls (not reset to X each time) so level-sensitive
 * latches and flip-flops retain memory across settle()/tick() calls.
 *
 * If a genuine combinational oscillation exists (e.g. a self-inverting
 * feedback loop already holding a determinate value), the loop will never
 * reach a fixed point; `maxIterations` is a purely internal safety valve,
 * not a user-facing "oscillation" concept. Anything still toggling when the
 * cap is hit is forced to the existing undefined/high-Z (X) representation.
 */
export function settle(
  graph: SimGraph,
  maxIterations = Math.max(256, graph.nodes.length * 64),
): SettleResult {
  let current = snapshotWorld(graph);

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    const next = computePass(graph, current);
    if (!worldChanged(current, next)) {
      commit(graph, next);
      return { settled: true, iterations, unresolvedNets: [] };
    }
    current = next;
  }

  // Cap reached without stabilizing: anything still changing between the
  // last two passes is undetermined (oscillating) — fall back to X.
  const finalPass = computePass(graph, current);
  const unresolvedNets: NetId[] = [];
  const resolvedNets = new Map<NetId, SignalValue>();
  for (const [id, value] of finalPass.nets) {
    const previousValue = current.nets.get(id)!;
    if (bitsEqual(value, previousValue)) {
      resolvedNets.set(id, value);
    } else {
      unresolvedNets.push(id);
      resolvedNets.set(id, allX(graph.nets.get(id)!.bitWidth));
    }
  }
  const resolvedNodeStates = new Map<NodeId, SignalValue[]>();
  for (const [id, value] of finalPass.nodeStates) {
    const previousValue = current.nodeStates.get(id);
    const stable = previousValue && value.every((sig, i) => bitsEqual(sig, previousValue[i]));
    resolvedNodeStates.set(id, stable ? value : value.map((sig) => allX(sig.width)));
  }
  commit(graph, { nets: resolvedNets, nodeStates: resolvedNodeStates });
  return { settled: false, iterations: maxIterations, unresolvedNets };
}
